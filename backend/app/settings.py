from decimal import Decimal, InvalidOperation

from flask import Blueprint, jsonify, request

from .auth import admin_required
from .extensions import db
from .models import Setting

bp = Blueprint("settings", __name__, url_prefix="/api")

USD_TO_SYP = "usd_to_syp"  # how many Syrian pounds one US dollar is worth
TRANSFER_DETAILS = "transfer_details"  # where customers send deposits and payments (shown to them)


def settings_dict():
    rate = db.session.get(Setting, USD_TO_SYP)
    transfer = db.session.get(Setting, TRANSFER_DETAILS)
    return {
        "usd_to_syp": rate.value if rate else None,
        "usd_to_syp_updated_at": rate.updated_at.isoformat() if rate else None,
        "transfer_details": transfer.value if transfer else None,
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
    if "transfer_details" in data:
        try:
            save_text_setting(TRANSFER_DETAILS, data["transfer_details"], 200)
        except ValueError as error:
            return jsonify(error=str(error)), 400
    db.session.commit()
    return settings_dict()
