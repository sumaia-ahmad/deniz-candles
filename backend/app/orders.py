import json
import os
import re
import secrets
import time
import uuid
from collections import defaultdict, deque
from datetime import date, timedelta
from decimal import Decimal

from flask import Blueprint, abort, current_app, jsonify, request, send_from_directory
from PIL import Image, UnidentifiedImageError

from .auth import login_required
from .extensions import db
from .models import Customer, DeliveryZone, Order, OrderItem, Product, ProductSize

public_bp = Blueprint("orders", __name__, url_prefix="/api/orders")
admin_bp = Blueprint("admin_orders", __name__, url_prefix="/api/admin/orders")

CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"  # no 0/O or 1/I/L, easy to read aloud
MAX_ITEMS = 20
MAX_IMAGE_SIDE = 1600

# Simple spam protection (FR-09): at most 5 orders per 10 minutes from one address.
RATE_LIMIT = 5
RATE_WINDOW_SECONDS = 600
_recent_orders = defaultdict(deque)


class OrderError(Exception):
    pass


@public_bp.errorhandler(OrderError)
@admin_bp.errorhandler(OrderError)
def handle_order_error(error):
    return jsonify(error=str(error)), 400


# ---------- Helpers ----------


def money(value):
    return None if value is None else str(Decimal(value).quantize(Decimal("0.01")))


def required_text(value, message, max_length):
    text = value.strip() if isinstance(value, str) else ""
    if not text:
        raise OrderError(message)
    if len(text) > max_length:
        raise OrderError(f"{message} (الحد الأقصى {max_length} حرف)")
    return text


def parse_date(value, message):
    try:
        return date.fromisoformat(value)
    except (TypeError, ValueError):
        raise OrderError(message) from None


def new_order_code():
    while True:
        code = "DZ-" + "".join(secrets.choice(CODE_ALPHABET) for _ in range(8))
        if db.session.scalar(db.select(Order.id).where(Order.code == code)) is None:
            return code


def check_rate_limit():
    if current_app.config.get("TESTING") and not current_app.config.get("RATE_LIMIT_IN_TESTS"):
        return
    now = time.monotonic()
    history = _recent_orders[request.remote_addr]
    while history and now - history[0] > RATE_WINDOW_SECONDS:
        history.popleft()
    if len(history) >= RATE_LIMIT:
        raise OrderError("وصلنا طلبات كتير من نفس الجهاز. جربي بعد شوي 🙏")
    history.append(now)


def upload_folder():
    folder = os.path.join(current_app.instance_path, "uploads")
    os.makedirs(folder, exist_ok=True)
    return folder


def save_reference_image(file_storage):
    """Check the upload is a real image, shrink it and re-save as JPEG (drops hidden metadata).

    The reference image is optional, so no file means no image.
    """
    if file_storage is None or not file_storage.filename:
        return None
    try:
        image = Image.open(file_storage.stream)
        image.load()
    except (UnidentifiedImageError, OSError):
        raise OrderError("الملف المرفوع لازم يكون صورة (JPG أو PNG)") from None

    image = image.convert("RGB")
    image.thumbnail((MAX_IMAGE_SIDE, MAX_IMAGE_SIDE))
    filename = f"{uuid.uuid4().hex}.jpg"
    image.save(os.path.join(upload_folder(), filename), "JPEG", quality=85, optimize=True)
    return filename


def clean_phone(value):
    phone = re.sub(r"[\s\-()]", "", value or "")
    if not re.fullmatch(r"\+?\d{7,15}", phone):
        raise OrderError("رقم الموبايل غير صحيح")
    return phone


# ---------- Serialization ----------


def item_to_dict(item):
    return {
        "product_name": item.product_name,
        "product_kind": item.product_kind,
        "size_name": item.size_name,
        "unit_price": money(item.unit_price),
        "quantity": item.quantity,
        "colors": item.colors,
        "custom_text": item.custom_text,
    }


def order_to_public_dict(order):
    """What the customer sees on the tracking page (no phone or address)."""
    return {
        "code": order.code,
        "status": order.status,
        "customer_name": order.customer.name,
        "event_date": order.event_date.isoformat(),
        "proposed_event_date": order.proposed_event_date.isoformat() if order.proposed_event_date else None,
        "admin_message": order.admin_message,
        "delivery_method": order.delivery_method,
        "zone_name": order.zone_name,
        "governorate": order.governorate,
        "delivery_fee": money(order.delivery_fee),
        "items": [item_to_dict(i) for i in order.items],
        "items_total": money(order.items_total),
        "total": money(order.total),
        "created_at": order.created_at.isoformat(),
    }


def days_until(event_date):
    return (event_date - date.today()).days


def order_summary(order):
    return {
        "id": order.id,
        "code": order.code,
        "status": order.status,
        "customer_name": order.customer.name,
        "customer_phone": order.customer.phone,
        "event_date": order.event_date.isoformat(),
        "days_left": days_until(order.event_date),
        "piece_count": order.piece_count,
        "total": money(order.total),
        "created_at": order.created_at.isoformat(),
    }


def week_workload(order):
    """Other open orders whose event falls in the same week (FR-16c). Informational only."""
    week_start = order.event_date - timedelta(days=order.event_date.weekday())
    week_end = week_start + timedelta(days=6)
    others = db.session.scalars(
        db.select(Order)
        .where(Order.id != order.id)
        .where(Order.event_date.between(week_start, week_end))
        .where(Order.status.not_in(Order.CLOSED))
        .order_by(Order.event_date)
    ).all()
    return {
        "week_start": week_start.isoformat(),
        "week_end": week_end.isoformat(),
        "orders": [
            {"id": o.id, "code": o.code, "event_date": o.event_date.isoformat(), "pieces": o.piece_count, "status": o.status}
            for o in others
        ],
        "pieces": sum(o.piece_count for o in others),
    }


def order_detail(order):
    return {
        **order_summary(order),
        **order_to_public_dict(order),
        "customer_instagram": order.customer.instagram,
        "address": order.address,
        "notes": order.notes,
        "reference_image_url": f"/api/admin/orders/{order.id}/reference-image" if order.reference_image else None,
        "next_statuses": list(Order.TRANSITIONS[order.status]),
        "workload": week_workload(order),
    }


# ---------- Public: place and track orders ----------


@public_bp.post("")
def create_order():
    form = request.form
    if form.get("website"):  # hidden "honeypot" field: real people never fill it in
        raise OrderError("تعذّر إرسال الطلب")
    check_rate_limit()

    try:
        data = json.loads(form.get("order") or "{}")
    except ValueError:
        raise OrderError("بيانات الطلب غير صحيحة") from None

    name = required_text(data.get("name"), "الاسم مطلوب", 100)
    phone = clean_phone(data.get("phone"))
    instagram = (data.get("instagram") or "").strip().lstrip("@")[:60] or None
    notes = (data.get("notes") or "").strip()[:2000]  # optional; "" when empty
    address = required_text(data.get("address"), "العنوان مطلوب", 300)
    event_date = parse_date(data.get("event_date"), "تاريخ المناسبة مطلوب")

    raw_items = data.get("items") or []
    if not isinstance(raw_items, list) or not raw_items:
        raise OrderError("اختاري قطعة وحدة على الأقل")
    if len(raw_items) > MAX_ITEMS:
        raise OrderError(f"الحد الأقصى {MAX_ITEMS} قطعة بالطلب الواحد")

    items = []
    longest_lead = 0
    for raw in raw_items:
        size = db.session.get(ProductSize, raw.get("size_id"))
        product = db.session.get(Product, raw.get("product_id"))
        if product is None or not product.is_visible or size is None or size.product_id != product.id:
            raise OrderError("في قطعة بالطلب ما عادت متوفرة")
        try:
            quantity = int(raw.get("quantity"))
        except (TypeError, ValueError):
            raise OrderError("العدد لازم يكون رقم") from None
        if not 1 <= quantity <= 2000:
            raise OrderError("العدد لازم يكون بين 1 و 2000")

        longest_lead = max(longest_lead, size.min_lead_days)
        items.append(
            OrderItem(
                product_id=product.id,
                size_id=size.id,
                product_name=product.name_ar,
                product_kind=product.kind,
                size_name=size.name_ar,
                unit_price=size.price,  # price snapshot (BR-5)
                quantity=quantity,
                colors=required_text(raw.get("colors"), "الألوان مطلوبة لكل قطعة", 200),
                custom_text=required_text(raw.get("custom_text"), "الاسم أو العبارة مطلوبة لكل قطعة", 200),
            )
        )

    earliest = date.today() + timedelta(days=longest_lead)
    if event_date < earliest:
        raise OrderError(f"أقرب تاريخ ممكن لهالطلب هو {earliest.isoformat()}")

    method = data.get("delivery_method")
    zone_name, governorate, fee = None, None, Decimal("0")
    if method == "damascus":
        zone = db.session.get(DeliveryZone, data.get("zone_id"))
        if zone is None or not zone.is_active:
            raise OrderError("اختاري منطقة التوصيل")
        zone_name, fee = zone.name_ar, zone.fee  # fee snapshot (BR-1)
    elif method == "governorate":
        governorate = required_text(data.get("governorate"), "المحافظة مطلوبة", 60)
    else:
        raise OrderError("اختاري طريقة الاستلام")

    image_name = save_reference_image(request.files.get("reference_image")) or ""  # optional

    customer = db.session.scalar(db.select(Customer).where(Customer.phone == phone))
    if customer is None:
        customer = Customer(phone=phone, name=name)
        db.session.add(customer)
    customer.name = name
    if instagram:
        customer.instagram = instagram

    order = Order(
        code=new_order_code(),
        customer=customer,
        event_date=event_date,
        delivery_method=method,
        zone_name=zone_name,
        governorate=governorate,
        address=address,
        delivery_fee=fee,
        notes=notes,
        reference_image=image_name,
        items=items,
    )
    db.session.add(order)
    db.session.commit()
    return order_to_public_dict(order), 201


@public_bp.get("/<code>")
def track_order(code):
    order = db.session.scalar(db.select(Order).where(Order.code == code.upper()))
    if order is None:
        abort(404)
    return order_to_public_dict(order)


@public_bp.post("/<code>/respond")
def respond_to_changes(code):
    """The customer accepts or declines the changes the admin proposed (FR-16b)."""
    order = db.session.scalar(db.select(Order).where(Order.code == code.upper()))
    if order is None:
        abort(404)
    if order.status != "changes_proposed":
        raise OrderError("ما في تعديل مقترح على هالطلب")

    accept = bool((request.get_json(silent=True) or {}).get("accept"))
    if accept:
        if order.proposed_event_date:
            order.event_date = order.proposed_event_date
        order.status = "approved"
    else:
        order.status = "cancelled"
    order.proposed_event_date = None
    db.session.commit()
    return order_to_public_dict(order)


# ---------- Dashboard: review and manage orders ----------


@admin_bp.get("")
@login_required
def list_orders():
    query = db.select(Order).order_by(Order.created_at.desc())
    status = request.args.get("status")
    if status == "open":
        query = query.where(Order.status.not_in(Order.CLOSED))
    elif status:
        query = query.where(Order.status == status)
    return [order_summary(o) for o in db.session.scalars(query)]


def get_order_or_404(order_id):
    order = db.session.get(Order, order_id)
    if order is None:
        abort(404)
    return order


@admin_bp.get("/<int:order_id>")
@login_required
def get_order(order_id):
    return order_detail(get_order_or_404(order_id))


@admin_bp.post("/<int:order_id>/status")
@login_required
def change_status(order_id):
    order = get_order_or_404(order_id)
    data = request.get_json(silent=True) or {}
    new_status = data.get("status")

    if new_status not in Order.TRANSITIONS[order.status]:
        raise OrderError(f"Cannot move an order from '{order.status}' to '{new_status}'.")

    message = (data.get("message") or "").strip()
    if new_status == "rejected":
        if not message:
            raise OrderError("Please write the reason for rejecting.")
        order.admin_message = message
    elif new_status == "changes_proposed":
        if not message:
            raise OrderError("Please describe the proposed changes.")
        proposed = data.get("proposed_event_date")
        if proposed:
            proposed_date = parse_date(proposed, "Invalid proposed date.")
            if proposed_date < date.today():
                raise OrderError("The proposed date is in the past.")
            order.proposed_event_date = proposed_date
        else:
            order.proposed_event_date = None
        order.admin_message = message

    order.status = new_status
    db.session.commit()
    return order_detail(order)


@admin_bp.get("/<int:order_id>/reference-image")
@login_required
def reference_image(order_id):
    order = get_order_or_404(order_id)
    if not order.reference_image:
        abort(404)
    return send_from_directory(upload_folder(), order.reference_image)
