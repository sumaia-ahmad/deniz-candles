from decimal import Decimal, InvalidOperation

from flask import Blueprint, jsonify, request

from .auth import admin_required
from .extensions import db
from .models import Setting

bp = Blueprint("settings", __name__, url_prefix="/api")

USD_TO_SYP = "usd_to_syp"  # how many Syrian pounds one US dollar is worth
TRANSFER_DETAILS = "transfer_details"  # where customers send deposits and payments (shown to them)
# Large orders need more preparation time (BR-9): from LARGE_ORDER_PIECES pieces, at least LARGE_ORDER_DAYS days.
LARGE_ORDER_PIECES = "large_order_pieces"
LARGE_ORDER_DAYS = "large_order_days"
DEFAULTS = {LARGE_ORDER_PIECES: 50, LARGE_ORDER_DAYS: 14}


def int_setting(key):
    setting = db.session.get(Setting, key)
    return int(setting.value) if setting else DEFAULTS[key]


def large_order_rule():
    """(pieces, days): orders with at least `pieces` pieces need at least `days` days before the event."""
    return int_setting(LARGE_ORDER_PIECES), int_setting(LARGE_ORDER_DAYS)


def settings_dict():
    rate = db.session.get(Setting, USD_TO_SYP)
    transfer = db.session.get(Setting, TRANSFER_DETAILS)
    return {
        "usd_to_syp": rate.value if rate else None,
        "usd_to_syp_updated_at": rate.updated_at.isoformat() if rate else None,
        "transfer_details": transfer.value if transfer else None,
        "large_order_pieces": int_setting(LARGE_ORDER_PIECES),
        "large_order_days": int_setting(LARGE_ORDER_DAYS),
    }


def save_text_setting(key, value, max_length):
    text = (value or "").strip()
    existing = db.session.get(Setting, key)
    if not text:
        if existing:
            db.session.delete(existing)
        return
    if len(text) > max_length:
        raise ValueError(f"Keep it under {max_length} characters.")
    setting = existing or Setting(key=key)
    setting.value = text
    db.session.add(setting)


@bp.get("/settings")
def public_settings():
    """Read by the website to show Syrian pound equivalents next to dollar prices."""
    return settings_dict()


@bp.put("/admin/settings")
@admin_required
def update_settings():
    data = request.get_json(silent=True) or {}
    if "usd_to_syp" in data:
        value = data["usd_to_syp"]
        if value in (None, ""):
            existing = db.session.get(Setting, USD_TO_SYP)
            if existing:
                db.session.delete(existing)
        else:
            try:
                rate = Decimal(str(value))
            except InvalidOperation:
                return jsonify(error="The exchange rate must be a number."), 400
            if rate <= 0 or rate > 10_000_000 or rate.as_tuple().exponent < -2:
                return jsonify(error="Enter a positive exchange rate (at most 2 decimals)."), 400
            setting = db.session.get(Setting, USD_TO_SYP) or Setting(key=USD_TO_SYP)
            text = f"{rate:f}"
            setting.value = text.rstrip("0").rstrip(".") if "." in text else text  # "13000", "13000.5"
            db.session.add(setting)
    for key, low, high in ((LARGE_ORDER_PIECES, 1, 100_000), (LARGE_ORDER_DAYS, 0, 365)):
        if key in data:
            try:
                number = int(str(data[key]).strip())
            except ValueError:
                return jsonify(error="Large-order values must be whole numbers."), 400
            if not low <= number <= high:
                return jsonify(error=f"Enter a number between {low} and {high}."), 400
            setting = db.session.get(Setting, key) or Setting(key=key)
            setting.value = str(number)
            db.session.add(setting)

    if "transfer_details" in data:
        try:
            save_text_setting(TRANSFER_DETAILS, data["transfer_details"], 200)
        except ValueError as error:
            return jsonify(error=str(error)), 400
    db.session.commit()
    return settings_dict()
