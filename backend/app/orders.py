import json
import re
import secrets
import time
from collections import defaultdict, deque
from datetime import date, timedelta
from decimal import Decimal

from flask import Blueprint, abort, current_app, jsonify, request, send_from_directory

from .auth import admin_required, login_required
from .extensions import db
from .images import NotAnImage, save_image, uploads_dir
from .models import Customer, DeliveryZone, Order, OrderItem, Payment, Product, ProductSize, utcnow

public_bp = Blueprint("orders", __name__, url_prefix="/api/orders")
admin_bp = Blueprint("admin_orders", __name__, url_prefix="/api/admin/orders")

CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"  # no 0/O or 1/I/L, easy to read aloud
MAX_ITEMS = 20
MAX_OPEN_REPORTS = 3  # unchecked receipts a customer can have on one order at a time
PAYABLE_STATUSES = ("approved", "awaiting_deposit", "confirmed", "in_progress", "ready")
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
        raise OrderError("تم استلام عدد كبير من الطلبات من الجهاز نفسه. يرجى المحاولة لاحقاً.")
    history.append(now)


def upload_folder():
    return uploads_dir()


def save_reference_image(file_storage):
    """Check the upload is a real image, shrink it and re-save as JPEG (drops hidden metadata).

    The reference image is optional, so no file means no image.
    """
    if file_storage is None or not file_storage.filename:
        return None
    try:
        return save_image(file_storage, upload_folder(), MAX_IMAGE_SIDE)
    except NotAnImage:
        raise OrderError("يجب أن يكون الملف المرفوع صورة (JPG أو PNG)") from None


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
        "deposit_required": money(order.deposit_required),
        "paid": money(order.paid),
        "remaining": money(order.remaining),
        "can_report_payment": order.status in PAYABLE_STATUSES,
        "payment_reports": [
            {
                "amount": money(p.amount),
                "status": p.status,
                "reason": p.note if p.status == "rejected" else None,
                "created_at": p.created_at.isoformat(),
            }
            for p in order.payments
            if p.reported_by_customer
        ],
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
        "payments_to_verify": sum(1 for p in order.payments if p.status == "reported"),
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
        "has_favors": order.has_favors,
        "with_driver": money(order.with_driver),
        "payments": [payment_to_dict(p) for p in order.payments],
    }


def payment_to_dict(payment):
    return {
        "id": payment.id,
        "method": payment.method,
        "amount": money(payment.amount),
        "is_deposit": payment.is_deposit,
        "status": payment.status,
        "transfer_number": payment.transfer_number,
        "note": payment.note,
        "receipt_url": f"/api/admin/orders/payments/{payment.id}/receipt" if payment.receipt_image else None,
        "reported_by_customer": payment.reported_by_customer,
        "created_at": payment.created_at.isoformat(),
    }


def payment_warnings(order, new_status):
    """Soft payment rules (BR-7): warn, never block. The admin decides."""
    warnings = []
    if new_status == "confirmed" and order.has_favors and order.deposit_required and order.paid < order.deposit_required:
        warnings.append(
            f"The deposit is not paid yet ({money(order.paid)} of {money(order.deposit_required)} received)."
        )
    if (
        new_status == "delivered"
        and order.delivery_method == "governorate"
        and order.remaining is not None
        and order.remaining > 0
    ):
        warnings.append(f"Governorate orders should be fully paid before shipping ({money(order.remaining)} still due).")
    if new_status == "delivered" and order.with_driver > 0:
        warnings.append(f"{money(order.with_driver)} is still with the delivery driver.")
    return warnings


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
        raise OrderError("يرجى اختيار قطعة واحدة على الأقل")
    if len(raw_items) > MAX_ITEMS:
        raise OrderError(f"الحد الأقصى {MAX_ITEMS} قطعة في الطلب الواحد")

    items = []
    longest_lead = 0
    for raw in raw_items:
        size = db.session.get(ProductSize, raw.get("size_id"))
        product = db.session.get(Product, raw.get("product_id"))
        if product is None or not product.is_visible or size is None or size.product_id != product.id:
            raise OrderError("إحدى القطع في الطلب لم تعد متوفرة")
        try:
            quantity = int(raw.get("quantity"))
        except (TypeError, ValueError):
            raise OrderError("يجب أن يكون العدد رقماً") from None
        if not 1 <= quantity <= 2000:
            raise OrderError("يجب أن يكون العدد بين 1 و 2000")

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
        raise OrderError(f"أقرب تاريخ متاح لهذا الطلب هو {earliest.isoformat()}")

    method = data.get("delivery_method")
    zone_name, governorate, fee = None, None, Decimal("0")
    if method == "damascus":
        zone = db.session.get(DeliveryZone, data.get("zone_id"))
        if zone is None or not zone.is_active:
            raise OrderError("يرجى اختيار منطقة التوصيل")
        zone_name, fee = zone.name_ar, zone.fee  # fee snapshot (BR-1)
    elif method == "governorate":
        governorate = required_text(data.get("governorate"), "المحافظة مطلوبة", 60)
    else:
        raise OrderError("يرجى اختيار طريقة الاستلام")

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


@public_bp.post("/<code>/payments")
def report_payment(code):
    """The customer uploads the receipt of her transfer. It counts only after the admin confirms it."""
    order = db.session.scalar(db.select(Order).where(Order.code == code.upper()))
    if order is None:
        abort(404)
    if order.status not in PAYABLE_STATUSES:
        raise OrderError("لا يمكن إرسال دفعة لهذا الطلب حالياً")
    if request.form.get("website"):  # honeypot, as on the order form
        raise OrderError("تعذّر إرسال الإشعار")
    if sum(1 for p in order.payments if p.status == "reported") >= MAX_OPEN_REPORTS:
        raise OrderError("لديك إشعارات قيد التحقق، يرجى الانتظار حتى تتم مراجعتها.")
    check_rate_limit()

    try:
        amount = Decimal((request.form.get("amount") or "").strip())
    except Exception:
        raise OrderError("يرجى إدخال المبلغ المحوَّل") from None
    if amount <= 0 or amount.as_tuple().exponent < -2:
        raise OrderError("المبلغ غير صحيح")

    receipt = request.files.get("receipt")
    if receipt is None or not receipt.filename:
        raise OrderError("صورة الإشعار مطلوبة")
    try:
        receipt_name = save_image(receipt, uploads_dir("receipts"), MAX_IMAGE_SIDE)
    except NotAnImage:
        raise OrderError("يجب أن يكون الملف صورة (JPG أو PNG)") from None

    order.payments.append(
        Payment(
            method="transfer",
            amount=amount,
            status="reported",
            reported_by_customer=True,
            is_deposit=order.status == "awaiting_deposit",
            transfer_number=(request.form.get("transfer_number") or "").strip()[:60] or None,
            receipt_image=receipt_name,
        )
    )
    db.session.commit()
    return order_to_public_dict(order), 201


@public_bp.post("/<code>/respond")
def respond_to_changes(code):
    """The customer accepts or declines the changes the admin proposed (FR-16b)."""
    order = db.session.scalar(db.select(Order).where(Order.code == code.upper()))
    if order is None:
        abort(404)
    if order.status != "changes_proposed":
        raise OrderError("لا يوجد تعديل مقترح على هذا الطلب")

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
    elif status == "payments_to_verify":
        query = query.where(Order.payments.any(Payment.status == "reported"))
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

    warnings = payment_warnings(order, new_status)
    if warnings and not data.get("confirm"):
        # Ask the dashboard to confirm; sending again with "confirm": true goes ahead.
        return jsonify(warnings=warnings), 409

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


# ---------- Dashboard: payments (admin only) ----------


def clean_amount(value):
    try:
        amount = Decimal(str(value).strip())
    except Exception:
        raise OrderError("Amount must be a number.") from None
    if amount <= 0 or amount.as_tuple().exponent < -2:
        raise OrderError("Amount must be a positive number with at most 2 decimal places.")
    return amount


@admin_bp.patch("/<int:order_id>")
@admin_required
def update_order(order_id):
    order = get_order_or_404(order_id)
    data = request.get_json(silent=True) or {}
    if "deposit_required" in data:
        value = data["deposit_required"]
        order.deposit_required = None if value in (None, "") else clean_amount(value)
    db.session.commit()
    return order_detail(order)


@admin_bp.post("/<int:order_id>/payments")
@admin_required
def add_payment(order_id):
    """Record a transfer (FR-19) or cash, received or still with the driver (FR-20)."""
    order = get_order_or_404(order_id)
    form = request.form
    method = form.get("method")
    if method not in Payment.METHODS:
        raise OrderError("Choose transfer or cash.")
    status = form.get("status") or "received"
    if status not in Payment.STATUSES or (method == "transfer" and status != "received"):
        raise OrderError("Invalid payment status.")
    if status == "with_driver" and order.delivery_method != "damascus":
        raise OrderError("Cash on delivery is only for Damascus orders (BR-3).")

    receipt = request.files.get("receipt")
    receipt_name = None
    if receipt and receipt.filename:
        try:
            receipt_name = save_image(receipt, uploads_dir("receipts"), MAX_IMAGE_SIDE)
        except NotAnImage:
            raise OrderError("The receipt must be a photo (JPG or PNG).") from None

    payment = Payment(
        method=method,
        amount=clean_amount(form.get("amount")),
        is_deposit=form.get("is_deposit") == "true",
        status=status,
        transfer_number=(form.get("transfer_number") or "").strip()[:60] or None,
        receipt_image=receipt_name,
        note=(form.get("note") or "").strip()[:300] or None,
        received_at=utcnow() if status == "received" else None,
    )
    order.payments.append(payment)
    confirm_if_deposit_received(order)
    db.session.commit()
    return order_detail(order), 201


def confirm_if_deposit_received(order):
    """Once the whole deposit has arrived, an order waiting for it becomes confirmed."""
    db.session.flush()
    if order.status == "awaiting_deposit" and order.deposit_required and order.paid >= order.deposit_required:
        order.status = "confirmed"


def get_payment_or_404(payment_id):
    payment = db.session.get(Payment, payment_id)
    if payment is None:
        abort(404)
    return payment


@admin_bp.post("/payments/<int:payment_id>/received")
@admin_required
def mark_received(payment_id):
    """The driver handed over the cash, or the admin checked a customer's receipt and the money is there."""
    payment = get_payment_or_404(payment_id)
    if payment.status not in ("with_driver", "reported"):
        raise OrderError("This payment is already recorded.")
    payment.status = "received"
    payment.received_at = utcnow()
    confirm_if_deposit_received(payment.order)
    db.session.commit()
    return order_detail(payment.order)


@admin_bp.post("/payments/<int:payment_id>/reject")
@admin_required
def reject_report(payment_id):
    """The receipt doesn't match money that arrived. The reason is shown to the customer."""
    payment = get_payment_or_404(payment_id)
    if payment.status != "reported":
        raise OrderError("Only payments waiting for verification can be rejected.")
    reason = ((request.get_json(silent=True) or {}).get("reason") or "").strip()
    if not reason:
        raise OrderError("Please write the reason (the customer will see it).")
    payment.status = "rejected"
    payment.note = reason[:300]
    db.session.commit()
    return order_detail(payment.order)


@admin_bp.delete("/payments/<int:payment_id>")
@admin_required
def delete_payment(payment_id):
    payment = get_payment_or_404(payment_id)
    order = payment.order
    db.session.delete(payment)
    db.session.commit()
    return order_detail(order)


@admin_bp.get("/payments/<int:payment_id>/receipt")
@admin_required
def payment_receipt(payment_id):
    payment = get_payment_or_404(payment_id)
    if not payment.receipt_image:
        abort(404)
    return send_from_directory(uploads_dir("receipts"), payment.receipt_image)
