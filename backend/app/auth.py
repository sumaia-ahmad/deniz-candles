from functools import wraps

from flask import Blueprint, g, jsonify, request, session

from .extensions import db
from .models import User

bp = Blueprint("auth", __name__, url_prefix="/api/auth")


def user_to_dict(user):
    return {"id": user.id, "username": user.username, "role": user.role}


def current_user():
    user_id = session.get("user_id")
    if user_id is None:
        return None
    return db.session.get(User, user_id)


def login_required(view):
    """Allow the request only for a signed-in user (admin or assistant)."""

    @wraps(view)
    def wrapped(*args, **kwargs):
        user = current_user()
        if user is None:
            return jsonify(error="يجب تسجيل الدخول"), 401
        g.user = user
        return view(*args, **kwargs)

    return wrapped


def admin_required(view):
    """Allow the request only for the admin (prices, zones, reports - BR-8)."""

    @wraps(view)
    @login_required
    def wrapped(*args, **kwargs):
        if g.user.role != "admin":
            return jsonify(error="هذه الصفحة للمديرة فقط"), 403
        return view(*args, **kwargs)

    return wrapped


@bp.post("/login")
def login():
    data = request.get_json(silent=True) or {}
    username = (data.get("username") or "").strip()
    password = data.get("password") or ""

    user = db.session.scalar(db.select(User).where(User.username == username))
    if user is None or not user.check_password(password):
        return jsonify(error="اسم المستخدم أو كلمة السر غير صحيحة"), 401

    session.clear()
    session["user_id"] = user.id
    return user_to_dict(user)


@bp.post("/logout")
def logout():
    session.clear()
    return {"ok": True}


@bp.get("/me")
@login_required
def me():
    return user_to_dict(g.user)
