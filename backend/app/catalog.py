from flask import Blueprint, abort, request, url_for

from .extensions import db
from .models import DeliveryZone, Occasion, Product

bp = Blueprint("catalog", __name__, url_prefix="/api")


def product_to_dict(product):
    return {
        "id": product.id,
        "kind": product.kind,
        "occasion": product.occasion.slug if product.occasion else None,
        "name_ar": product.name_ar,
        "name_en": product.name_en,
        "sizes": [
            {
                "id": size.id,
                "name_ar": size.name_ar,
                "price": str(size.price) if size.price is not None else None,
                "min_lead_days": size.min_lead_days,
            }
            for size in product.sizes
        ],
        "images": [
            url_for("static", filename=f"products/{image.filename}")
            for image in product.images
        ],
    }


@bp.get("/occasions")
def list_occasions():
    occasions = db.session.scalars(db.select(Occasion).order_by(Occasion.id))
    return [
        {"id": o.id, "slug": o.slug, "name_ar": o.name_ar, "name_en": o.name_en}
        for o in occasions
    ]


@bp.get("/products")
def list_products():
    query = db.select(Product).where(Product.is_visible.is_(True)).order_by(Product.id)

    kind = request.args.get("kind")
    if kind:
        query = query.where(Product.kind == kind)

    occasion = request.args.get("occasion")
    if occasion:
        query = query.join(Product.occasion).where(Occasion.slug == occasion)

    return [product_to_dict(p) for p in db.session.scalars(query)]


@bp.get("/products/<int:product_id>")
def get_product(product_id):
    product = db.session.get(Product, product_id)
    if product is None or not product.is_visible:
        abort(404)
    return product_to_dict(product)


@bp.get("/delivery-zones")
def list_delivery_zones():
    zones = db.session.scalars(
        db.select(DeliveryZone).where(DeliveryZone.is_active.is_(True)).order_by(DeliveryZone.name_ar)
    )
    return [{"id": z.id, "name_ar": z.name_ar, "fee": str(z.fee)} for z in zones]
