"""Raw materials, stock movements, purchases and recipes (bill of materials)."""

from collections import defaultdict
from datetime import date
from decimal import Decimal, InvalidOperation

from flask import Blueprint, abort, jsonify, request

from .auth import admin_required
from .extensions import db
from .models import Material, ProductSize, Purchase, PurchaseItem, RecipeItem, StockMovement

bp = Blueprint("inventory", __name__, url_prefix="/api/admin/inventory")


class InventoryError(Exception):
    pass


@bp.errorhandler(InventoryError)
def handle_inventory_error(error):
    return jsonify(error=str(error)), 400


# ---------- Helpers ----------


def number_text(value):
    """Decimal -> plain text without trailing zeros ("12.500" -> "12.5"), or None."""
    if value is None:
        return None
    text = f"{Decimal(value):f}"
    return text.rstrip("0").rstrip(".") if "." in text else text


def clean_decimal(value, label, *, allow_negative=False, allow_zero=False, places=3):
    try:
        number = Decimal(str(value).strip())
    except (InvalidOperation, AttributeError):
        raise InventoryError(f"{label} must be a number.") from None
    if not number.is_finite() or number.as_tuple().exponent < -places:
        raise InventoryError(f"{label} can have at most {places} decimal places.")
    if number < 0 and not allow_negative:
        raise InventoryError(f"{label} can't be negative.")
    if number == 0 and not allow_zero:
        raise InventoryError(f"{label} can't be zero.")
    return number


def clean_text(value, label, max_length, required=True):
    text = value.strip() if isinstance(value, str) else ""
    if required and not text:
        raise InventoryError(f"{label} is required.")
    if len(text) > max_length:
        raise InventoryError(f"{label} is too long.")
    return text or None


def get_or_404(model, object_id):
    obj = db.session.get(model, object_id)
    if obj is None:
        abort(404)
    return obj


def apply_movement(material, change, reason, *, note=None, purchase=None, order=None, unit_cost=None):
    """Change a material's stock and record why. The only way stock should ever change."""
    material.quantity = (material.quantity or Decimal("0")) + change
    db.session.add(
        StockMovement(material=material, change=change, reason=reason, note=note, purchase_id=getattr(purchase, "id", None),
                      order_id=getattr(order, "id", None),
                      unit_cost=material.average_unit_cost if unit_cost is None else unit_cost)
    )


def update_average_cost(material, quantity, unit_cost):
    """Weighted average cost after buying `quantity` units at `unit_cost`."""
    on_hand = max(material.quantity or Decimal("0"), Decimal("0"))
    if material.average_unit_cost is None or on_hand == 0:
        material.average_unit_cost = unit_cost
    else:
        total = on_hand * material.average_unit_cost + quantity * unit_cost
        material.average_unit_cost = (total / (on_hand + quantity)).quantize(Decimal("0.0001"))


# ---------- Orders <-> stock (used by the orders module) ----------


def materials_needed(order):
    """{material: total quantity} the order uses, from each item's size recipe."""
    needed = defaultdict(Decimal)
    for item in order.items:
        size = db.session.get(ProductSize, item.size_id) if item.size_id else None
        if size is None:
            continue
        for recipe_item in size.recipe:
            needed[recipe_item.material] += recipe_item.quantity * item.quantity
    return needed


def stock_warnings(order):
    """Soft warnings (like payments, BR-7) when stock won't cover the order."""
    if order.materials_consumed:
        return []
    return [
        f"Not enough {material.name}: needs {number_text(qty)} {material.unit}, "
        f"{number_text(material.quantity)} in stock."
        for material, qty in materials_needed(order).items()
        if material.quantity < qty
    ]


def consume_order_materials(order):
    """Take the order's materials out of stock when preparation starts."""
    if order.materials_consumed:
        return
    for material, qty in materials_needed(order).items():
        apply_movement(material, -qty, "order", order=order, note=f"Order {order.code}")
    order.materials_consumed = True


def return_order_materials(order):
    """Put materials back when an order that was being prepared is cancelled."""
    if not order.materials_consumed:
        return
    for material, qty in materials_needed(order).items():
        # Return at the cost it was taken out at, so the order's material cost nets to zero.
        taken = db.session.scalar(
            db.select(StockMovement.unit_cost)
            .where(StockMovement.order_id == order.id, StockMovement.material_id == material.id,
                   StockMovement.reason == "order")
            .order_by(StockMovement.id.desc())
        )
        apply_movement(material, qty, "order_return", order=order, note=f"Order {order.code} cancelled", unit_cost=taken)
    order.materials_consumed = False


# ---------- Materials ----------


def material_to_dict(material):
    return {
        "id": material.id,
        "name": material.name,
        "unit": material.unit,
        "quantity": number_text(material.quantity),
        "low_stock_threshold": number_text(material.low_stock_threshold),
        "average_unit_cost": number_text(material.average_unit_cost),
        "is_low": material.is_low,
        "is_active": material.is_active,
    }


def ensure_unique_name(name, current_id=None):
    existing = db.session.scalar(db.select(Material).where(Material.name == name))
    if existing is not None and existing.id != current_id:
        raise InventoryError("A material with this name already exists.")


@bp.get("/materials")
@admin_required
def list_materials():
    materials = db.session.scalars(db.select(Material).order_by(Material.name))
    return [material_to_dict(m) for m in materials]


@bp.post("/materials")
@admin_required
def create_material():
    data = request.get_json(silent=True) or {}
    name = clean_text(data.get("name"), "Name", 100)
    ensure_unique_name(name)
    material = Material(
        name=name,
        unit=clean_text(data.get("unit"), "Unit", 20),
        low_stock_threshold=(
            clean_decimal(data["low_stock_threshold"], "Low-stock alert", allow_zero=True)
            if data.get("low_stock_threshold") not in (None, "")
            else None
        ),
    )
    db.session.add(material)

    # Optional opening stock, e.g. what's already on the shelf before using the system.
    if data.get("opening_quantity") not in (None, ""):
        quantity = clean_decimal(data["opening_quantity"], "Opening stock")
        if data.get("opening_unit_cost") not in (None, ""):
            material.average_unit_cost = clean_decimal(data["opening_unit_cost"], "Cost per unit", allow_zero=True, places=4)
        db.session.flush()
        apply_movement(material, quantity, "adjustment", note="Opening stock")

    db.session.commit()
    return material_to_dict(material), 201


@bp.patch("/materials/<int:material_id>")
@admin_required
def update_material(material_id):
    material = get_or_404(Material, material_id)
    data = request.get_json(silent=True) or {}
    if "name" in data:
        name = clean_text(data["name"], "Name", 100)
        ensure_unique_name(name, material.id)
        material.name = name
    if "unit" in data:
        material.unit = clean_text(data["unit"], "Unit", 20)
    if "low_stock_threshold" in data:
        value = data["low_stock_threshold"]
        material.low_stock_threshold = (
            None if value in (None, "") else clean_decimal(value, "Low-stock alert", allow_zero=True)
        )
    if "is_active" in data:
        material.is_active = bool(data["is_active"])
    db.session.commit()
    return material_to_dict(material)


@bp.post("/materials/<int:material_id>/adjust")
@admin_required
def adjust_stock(material_id):
    """Manual correction: a stock count, waste, a sample... Always with a note."""
    material = get_or_404(Material, material_id)
    data = request.get_json(silent=True) or {}
    change = clean_decimal(data.get("change"), "Change", allow_negative=True)
    note = clean_text(data.get("note"), "Reason", 200)
    apply_movement(material, change, "adjustment", note=note)
    db.session.commit()
    return material_to_dict(material)


@bp.get("/materials/<int:material_id>/movements")
@admin_required
def material_movements(material_id):
    material = get_or_404(Material, material_id)
    return [
        {
            "id": m.id,
            "change": number_text(m.change),
            "reason": m.reason,
            "note": m.note,
            "purchase_id": m.purchase_id,
            "order_id": m.order_id,
            "created_at": m.created_at.isoformat(),
        }
        for m in material.movements[:200]
    ]


@bp.get("/summary")
@admin_required
def summary():
    """Counts for the dashboard menu (low-stock badge)."""
    materials = db.session.scalars(db.select(Material).where(Material.is_active.is_(True))).all()
    return {"low_stock": sum(1 for m in materials if m.is_low)}


# ---------- Purchases ----------


def purchase_to_dict(purchase):
    return {
        "id": purchase.id,
        "purchased_on": purchase.purchased_on.isoformat(),
        "supplier": purchase.supplier,
        "note": purchase.note,
        "total": str(purchase.total.quantize(Decimal("0.01"))),
        "items": [
            {
                "material_id": item.material_id,
                "material_name": item.material.name,
                "unit": item.material.unit,
                "quantity": number_text(item.quantity),
                "unit_cost": number_text(item.unit_cost),
                "line_total": str((item.quantity * item.unit_cost).quantize(Decimal("0.01"))),
            }
            for item in purchase.items
        ],
    }


@bp.get("/purchases")
@admin_required
def list_purchases():
    purchases = db.session.scalars(db.select(Purchase).order_by(Purchase.purchased_on.desc(), Purchase.id.desc()))
    return [purchase_to_dict(p) for p in purchases]


@bp.post("/purchases")
@admin_required
def create_purchase():
    """Record a purchase: stock goes up and each material's average cost is updated."""
    data = request.get_json(silent=True) or {}
    try:
        purchased_on = date.fromisoformat(data.get("purchased_on") or date.today().isoformat())
    except ValueError:
        raise InventoryError("Invalid purchase date.") from None
    raw_items = data.get("items") or []
    if not isinstance(raw_items, list) or not raw_items:
        raise InventoryError("Add at least one material.")

    purchase = Purchase(
        purchased_on=purchased_on,
        supplier=clean_text(data.get("supplier"), "Supplier", 100, required=False),
        note=clean_text(data.get("note"), "Note", 300, required=False),
    )
    db.session.add(purchase)
    db.session.flush()

    for raw in raw_items:
        material = db.session.get(Material, raw.get("material_id"))
        if material is None:
            raise InventoryError("Choose a material for every line.")
        quantity = clean_decimal(raw.get("quantity"), "Quantity")
        unit_cost = clean_decimal(raw.get("unit_cost"), "Cost per unit", allow_zero=True, places=4)
        purchase.items.append(PurchaseItem(material=material, quantity=quantity, unit_cost=unit_cost))
        update_average_cost(material, quantity, unit_cost)
        apply_movement(material, quantity, "purchase", purchase=purchase, note=purchase.supplier, unit_cost=unit_cost)

    db.session.commit()
    return purchase_to_dict(purchase), 201


@bp.delete("/purchases/<int:purchase_id>")
@admin_required
def delete_purchase(purchase_id):
    """Undo a purchase entered by mistake: its quantities leave the stock again."""
    purchase = get_or_404(Purchase, purchase_id)
    for item in purchase.items:
        apply_movement(item.material, -item.quantity, "adjustment", note=f"Purchase #{purchase.id} deleted")
    db.session.execute(db.update(StockMovement).where(StockMovement.purchase_id == purchase.id).values(purchase_id=None))
    db.session.delete(purchase)
    db.session.commit()
    return "", 204


# ---------- Recipes ----------


def recipe_to_dict(size):
    return {
        "size_id": size.id,
        "unit_cost": str(size.unit_cost.quantize(Decimal("0.01"))) if size.unit_cost is not None else None,
        "items": [
            {
                "material_id": item.material_id,
                "material_name": item.material.name,
                "unit": item.material.unit,
                "quantity": number_text(item.quantity),
            }
            for item in size.recipe
        ],
    }


@bp.get("/sizes/<int:size_id>/recipe")
@admin_required
def get_recipe(size_id):
    return recipe_to_dict(get_or_404(ProductSize, size_id))


@bp.put("/sizes/<int:size_id>/recipe")
@admin_required
def set_recipe(size_id):
    """Replace what one piece of this size is made of."""
    size = get_or_404(ProductSize, size_id)
    data = request.get_json(silent=True) or {}
    raw_items = data.get("items") or []
    seen = set()
    new_items = []
    for raw in raw_items:
        material = db.session.get(Material, raw.get("material_id"))
        if material is None:
            raise InventoryError("Choose a material for every line.")
        if material.id in seen:
            raise InventoryError(f"{material.name} is listed twice.")
        seen.add(material.id)
        new_items.append(RecipeItem(material=material, quantity=clean_decimal(raw.get("quantity"), "Quantity")))
    size.recipe = new_items
    db.session.commit()
    return recipe_to_dict(size)
