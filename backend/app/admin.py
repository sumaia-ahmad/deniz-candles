import os
from decimal import Decimal, InvalidOperation

from flask import Blueprint, abort, jsonify, request

from .auth import admin_required
from .catalog import product_image_url, product_to_dict
from .extensions import db
from .images import NotAnImage, save_image, uploads_dir
from .models import DeliveryZone, Occasion, OrderItem, Product, ProductImage, ProductSize

bp = Blueprint("admin", __name__, url_prefix="/api/admin")


class ValidationError(Exception):
    pass


@bp.errorhandler(ValidationError)
def handle_validation_error(error):
    return jsonify(error=str(error)), 400


def clean_name(value, label):
    name = (value or "").strip() if isinstance(value, str) else ""
    if not name:
        raise ValidationError(f"{label} is required.")
    if len(name) > 100:
        raise ValidationError(f"{label} is too long.")
    return name


def clean_money(value, label, allow_empty):
    if value in (None, ""):
        if allow_empty:
            return None
        raise ValidationError(f"{label} is required.")
    try:
        amount = Decimal(str(value))
    except InvalidOperation:
        raise ValidationError(f"{label} must be a number.") from None
    if amount < 0 or amount.as_tuple().exponent < -2:
        raise ValidationError(f"{label} must be a positive number with at most 2 decimal places.")
    return amount


def clean_days(value):
    try:
        days = int(value)
    except (TypeError, ValueError):
        raise ValidationError("Min. days must be a whole number.") from None
    if not 0 <= days <= 365:
        raise ValidationError("Min. days must be between 0 and 365.")
    return days


def get_or_404(model, object_id):
    obj = db.session.get(model, object_id)
    if obj is None:
        abort(404)
    return obj


# ---------- Products and prices ----------


PRODUCT_IMAGE_SIDE = 1400
MAX_PRODUCT_IMAGES = 10


def admin_size_dict(size):
    """The public size data plus its material cost (costs stay out of the public API)."""
    cost = size.unit_cost
    return {
        **size_to_dict(size),
        "unit_cost": str(cost.quantize(Decimal("0.01"))) if cost is not None else None,
        "recipe_count": len(size.recipe),
    }


def admin_product_dict(product):
    """The public product data plus what the dashboard needs to manage it."""
    data = product_to_dict(product)
    data["sizes"] = [admin_size_dict(size) for size in product.sizes]
    return {
        **data,
        "is_visible": product.is_visible,
        "photos": [{"id": image.id, "url": product_image_url(image.filename)} for image in product.images],
    }


def clean_occasion(kind, slug):
    """Favors belong to an occasion; gifts are for any occasion (BR-6)."""
    if kind == "gift":
        return None
    occasion = db.session.scalar(db.select(Occasion).where(Occasion.slug == slug))
    if occasion is None:
        raise ValidationError("Choose the occasion for this favor.")
    return occasion


def add_uploaded_photos(product, files):
    files = [f for f in files if f and f.filename]
    if len(product.images) + len(files) > MAX_PRODUCT_IMAGES:
        raise ValidationError(f"A product can have at most {MAX_PRODUCT_IMAGES} photos.")
    next_order = max((image.sort_order for image in product.images), default=-1) + 1
    for offset, file in enumerate(files):
        try:
            filename = save_image(file, uploads_dir("products"), PRODUCT_IMAGE_SIDE, quality=82)
        except NotAnImage:
            raise ValidationError(f'"{file.filename}" is not a photo (use JPG or PNG).') from None
        product.images.append(ProductImage(filename=filename, sort_order=next_order + offset))
    return len(files)


def delete_photo_file(filename):
    path = os.path.join(uploads_dir("products"), filename)
    if os.path.exists(path):  # starting photos shipped with the project are left alone
        os.remove(path)


@bp.get("/products")
@admin_required
def list_products():
    products = db.session.scalars(db.select(Product).order_by(Product.id))
    return [admin_product_dict(p) for p in products]


@bp.post("/products")
@admin_required
def create_product():
    form = request.form
    kind = form.get("kind")
    if kind not in ("favor", "gift"):
        raise ValidationError("Choose Favor or Gift.")

    product = Product(
        kind=kind,
        occasion=clean_occasion(kind, form.get("occasion")),
        name_ar=clean_name(form.get("name_ar"), "Product name"),
    )
    product.sizes.append(
        ProductSize(
            name_ar=clean_name(form.get("size_name") or "قياسي", "Size name"),
            price=clean_money(form.get("price"), "Price", allow_empty=True),
            min_lead_days=clean_days(form.get("min_lead_days") or (0 if kind == "favor" else 3)),
        )
    )
    if add_uploaded_photos(product, request.files.getlist("photos")) == 0:
        raise ValidationError("Add at least one photo.")

    db.session.add(product)
    db.session.commit()
    return admin_product_dict(product), 201


@bp.patch("/products/<int:product_id>")
@admin_required
def update_product(product_id):
    product = get_or_404(Product, product_id)
    data = request.get_json(silent=True) or {}
    if "name_ar" in data:
        product.name_ar = clean_name(data["name_ar"], "Product name")
    if "is_visible" in data:
        product.is_visible = bool(data["is_visible"])
    if "occasion" in data:
        product.occasion = clean_occasion(product.kind, data["occasion"])
    db.session.commit()
    return admin_product_dict(product)


@bp.delete("/products/<int:product_id>")
@admin_required
def delete_product(product_id):
    product = get_or_404(Product, product_id)
    ordered = db.session.scalar(db.select(OrderItem.id).where(OrderItem.product_id == product.id).limit(1))
    if ordered is not None:
        raise ValidationError("This product is in past orders, so it can't be deleted. Hide it instead.")
    filenames = [image.filename for image in product.images]
    db.session.delete(product)
    db.session.commit()
    for filename in filenames:
        delete_photo_file(filename)
    return "", 204


@bp.post("/products/<int:product_id>/photos")
@admin_required
def add_photos(product_id):
    product = get_or_404(Product, product_id)
    if add_uploaded_photos(product, request.files.getlist("photos")) == 0:
        raise ValidationError("Choose at least one photo.")
    db.session.commit()
    return admin_product_dict(product), 201


@bp.delete("/photos/<int:image_id>")
@admin_required
def delete_photo(image_id):
    image = get_or_404(ProductImage, image_id)
    product = image.product
    if len(product.images) == 1:
        raise ValidationError("Every product needs at least one photo.")
    filename = image.filename
    db.session.delete(image)
    db.session.commit()
    delete_photo_file(filename)
    return admin_product_dict(product)


@bp.post("/photos/<int:image_id>/cover")
@admin_required
def make_cover(image_id):
    """Move this photo to the front: it becomes the one shown on the product card."""
    image = get_or_404(ProductImage, image_id)
    product = image.product
    others = [i for i in product.images if i.id != image.id]
    for order, photo in enumerate([image, *others]):
        photo.sort_order = order
    db.session.commit()
    db.session.refresh(product)
    return admin_product_dict(product)


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
        name_ar=clean_name(data.get("name_ar"), "Size name"),
        price=clean_money(data.get("price"), "Price", allow_empty=True),
        min_lead_days=clean_days(data.get("min_lead_days", 0 if product.kind == "favor" else 3)),
    )
    product.sizes.append(size)
    db.session.commit()
    return admin_size_dict(size), 201


@bp.patch("/sizes/<int:size_id>")
@admin_required
def update_size(size_id):
    size = get_or_404(ProductSize, size_id)
    data = request.get_json(silent=True) or {}
    if "name_ar" in data:
        size.name_ar = clean_name(data["name_ar"], "Size name")
    if "price" in data:
        size.price = clean_money(data["price"], "Price", allow_empty=True)
    if "min_lead_days" in data:
        size.min_lead_days = clean_days(data["min_lead_days"])
    db.session.commit()
    return admin_size_dict(size)


@bp.delete("/sizes/<int:size_id>")
@admin_required
def delete_size(size_id):
    size = get_or_404(ProductSize, size_id)
    if len(size.product.sizes) == 1:
        raise ValidationError("Every product needs at least one size.")
    db.session.delete(size)
    db.session.commit()
    return "", 204


# ---------- Delivery zones ----------


def zone_to_dict(zone):
    return {"id": zone.id, "name_ar": zone.name_ar, "fee": str(zone.fee), "is_active": zone.is_active}


def ensure_unique_zone_name(name, current_id=None):
    existing = db.session.scalar(db.select(DeliveryZone).where(DeliveryZone.name_ar == name))
    if existing is not None and existing.id != current_id:
        raise ValidationError("A zone with this name already exists.")


@bp.get("/delivery-zones")
@admin_required
def list_zones():
    zones = db.session.scalars(db.select(DeliveryZone).order_by(DeliveryZone.name_ar))
    return [zone_to_dict(z) for z in zones]


@bp.post("/delivery-zones")
@admin_required
def create_zone():
    data = request.get_json(silent=True) or {}
    name = clean_name(data.get("name_ar"), "Zone name")
    ensure_unique_zone_name(name)
    zone = DeliveryZone(
        name_ar=name,
        fee=clean_money(data.get("fee"), "Delivery fee", allow_empty=False),
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
        name = clean_name(data["name_ar"], "Zone name")
        ensure_unique_zone_name(name, current_id=zone.id)
        zone.name_ar = name
    if "fee" in data:
        zone.fee = clean_money(data["fee"], "Delivery fee", allow_empty=False)
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
