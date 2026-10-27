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
