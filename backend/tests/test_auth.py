from datetime import datetime, timezone
from email.utils import parsedate_to_datetime

from .conftest import login


def test_login_with_correct_password(client):
    response = login(client)
    assert response.status_code == 200
    assert response.get_json()["role"] == "admin"


def test_login_with_wrong_password_is_rejected(client):
    assert login(client, password="wrong-password").status_code == 401


def test_me_requires_login(client):
    assert client.get("/api/auth/me").status_code == 401


def test_logout_ends_the_session(admin_client):
    admin_client.post("/api/auth/logout")
    assert admin_client.get("/api/auth/me").status_code == 401


def test_password_is_not_stored_in_plain_text(app):
    from app.extensions import db
    from app.models import User

    with app.app_context():
        user = db.session.scalar(db.select(User).where(User.username == "deniz"))
        assert "password123" not in user.password_hash


def test_remember_me_keeps_the_session_for_30_days(client):
    response = client.post(
        "/api/auth/login", json={"username": "deniz", "password": "password123", "remember": True}
    )
    cookie = response.headers["Set-Cookie"]
    expires = parsedate_to_datetime(cookie.split("Expires=")[1].split(";")[0])
    days_left = (expires - datetime.now(timezone.utc)).days
    assert 29 <= days_left <= 30


def test_without_remember_me_the_session_ends_with_the_browser(client):
    cookie = login(client).headers["Set-Cookie"]
    assert "Expires=" not in cookie


def test_reset_password_command(app):
    runner = app.test_cli_runner()
    result = runner.invoke(args=["reset-password", "deniz"], input="newpassword1\nnewpassword1\n")
    assert "Password updated" in result.output

    client = app.test_client()
    assert login(client, password="password123").status_code == 401
    assert login(client, password="newpassword1").status_code == 200
