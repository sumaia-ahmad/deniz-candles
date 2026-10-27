from decimal import Decimal, InvalidOperation

from flask import Blueprint, abort, jsonify, request

from .auth import admin_required
from .catalog import product_to_dict
from .extensions import db
from .models import DeliveryZone, Product, ProductSize

bp = Blueprint("admin", __name__, url_prefix="/api/admin")


class ValidationError(Exception):
    pass


@bp.errorhandler(ValidationError)
def handle_validation_error(error):
    return jsonify(error=str(error)), 400


def clean_name(value, label):
    name = (value or "").strip() if isinstance(value, str) else ""
    if not name:
        raise ValidationError(f"{label} مطلوب")
    if len(name) > 100:
        raise ValidationError(f"{label} طويل كتير")
    return name


def clean_money(value, label, allow_empty):
    if value in (None, ""):
        if allow_empty:
            return None
        raise ValidationError(f"{label} مطلوب")
    try:
        amount = Decimal(str(value))
    except InvalidOperation:
        raise ValidationError(f"{label} لازم يكون رقم") from None
    if amount < 0 or amount.as_tuple().exponent < -2:
        raise ValidationError(f"{label} لازم يكون رقم موجب، وبرقمين بعد الفاصلة كحد أقصى")
    return amount


def clean_days(value):
    try:
        days = int(value)
    except (TypeError, ValueError):
        raise ValidationError("مدة التحضير لازم تكون عدد أيام") from None
    if not 0 <= days <= 365:
        raise ValidationError("مدة التحضير لازم تكون بين 0 و 365 يوم")
    return days


def get_or_404(model, object_id):
    obj = db.session.get(model, object_id)
    if obj is None:
        abort(404)
    return obj


# ---------- Products and prices ----------


@bp.get("/products")
@admin_required
def list_products():
    products = db.session.scalars(db.select(Product).order_by(Product.id))
    return [{**product_to_dict(p), "is_visible": p.is_visible} for p in products]


@bp.patch("/products/<int:product_id>")
@admin_required
def update_product(product_id):
    product = get_or_404(Product, product_id)
    data = request.get_json(silent=True) or {}
    if "name_ar" in data:
        product.name_ar = clean_name(data["name_ar"], "اسم القطعة")
    if "is_visible" in data:
        product.is_visible = bool(data["is_visible"])
    db.session.commit()
    return {**product_to_dict(product), "is_visible": product.is_visible}


def size_to_dict(size):
    return {
        "id": size.id,
        "name_ar": size.name_ar,
        "price": str(size.price) if size.price is not None else None,
        "min_lead_days": size.min_lead_days,
    }


@bp.post("/products/<int:product_id>/sizes")
@admin_required
def add_size(product_id):
    product = get_or_404(Product, product_id)
    data = request.get_json(silent=True) or {}
    size = ProductSize(
        name_ar=clean_name(data.get("name_ar"), "اسم الحجم"),
        price=clean_money(data.get("price"), "السعر", allow_empty=True),
        min_lead_days=clean_days(data.get("min_lead_days", 14 if product.kind == "favor" else 3)),
    )
    product.sizes.append(size)
    db.session.commit()
    return size_to_dict(size), 201


@bp.patch("/sizes/<int:size_id>")
@admin_required
def update_size(size_id):
    size = get_or_404(ProductSize, size_id)
    data = request.get_json(silent=True) or {}
    if "name_ar" in data:
        size.name_ar = clean_name(data["name_ar"], "اسم الحجم")
    if "price" in data:
        size.price = clean_money(data["price"], "السعر", allow_empty=True)
    if "min_lead_days" in data:
        size.min_lead_days = clean_days(data["min_lead_days"])
    db.session.commit()
    return size_to_dict(size)


@bp.delete("/sizes/<int:size_id>")
@admin_required
def delete_size(size_id):
    size = get_or_404(ProductSize, size_id)
    if len(size.product.sizes) == 1:
        raise ValidationError("كل قطعة لازم يكون إلها حجم واحد على الأقل")
    db.session.delete(size)
    db.session.commit()
    return "", 204


# ---------- Delivery zones ----------


def zone_to_dict(zone):
    return {"id": zone.id, "name_ar": zone.name_ar, "fee": str(zone.fee), "is_active": zone.is_active}


def ensure_unique_zone_name(name, current_id=None):
    existing = db.session.scalar(db.select(DeliveryZone).where(DeliveryZone.name_ar == name))
    if existing is not None and existing.id != current_id:
        raise ValidationError("في منطقة بنفس الاسم")


@bp.get("/delivery-zones")
@admin_required
def list_zones():
    zones = db.session.scalars(db.select(DeliveryZone).order_by(DeliveryZone.name_ar))
    return [zone_to_dict(z) for z in zones]


@bp.post("/delivery-zones")
@admin_required
def create_zone():
    data = request.get_json(silent=True) or {}
    name = clean_name(data.get("name_ar"), "اسم المنطقة")
    ensure_unique_zone_name(name)
    zone = DeliveryZone(
        name_ar=name,
        fee=clean_money(data.get("fee"), "أجرة التوصيل", allow_empty=False),
        is_active=bool(data.get("is_active", True)),
    )
    db.session.add(zone)
    db.session.commit()
    return zone_to_dict(zone), 201


@bp.patch("/delivery-zones/<int:zone_id>")
@admin_required
def update_zone(zone_id):
    zone = get_or_404(DeliveryZone, zone_id)
    data = request.get_json(silent=True) or {}
    if "name_ar" in data:
        name = clean_name(data["name_ar"], "اسم المنطقة")
        ensure_unique_zone_name(name, current_id=zone.id)
        zone.name_ar = name
    if "fee" in data:
        zone.fee = clean_money(data["fee"], "أجرة التوصيل", allow_empty=False)
    if "is_active" in data:
        zone.is_active = bool(data["is_active"])
    db.session.commit()
    return zone_to_dict(zone)


@bp.delete("/delivery-zones/<int:zone_id>")
@admin_required
def delete_zone(zone_id):
    zone = get_or_404(DeliveryZone, zone_id)
    db.session.delete(zone)
    db.session.commit()
    return "", 204
