import pytest

from app import create_app
from app.extensions import db
from app.models import Product, ProductSize, User


@pytest.fixture
def app(tmp_path):
    app = create_app({"TESTING": True, "SQLALCHEMY_DATABASE_URI": "sqlite:///:memory:", "SECRET_KEY": "test"})
    app.instance_path = str(tmp_path)  # uploaded images go to a temporary folder
    with app.app_context():
        db.create_all()
        for username, role in (("deniz", "admin"), ("helper", "assistant")):
            user = User(username=username, role=role)
            user.set_password("password123")
            db.session.add(user)
        product = Product(kind="gift", name_ar="بوكس تجربة")
        product.sizes.append(ProductSize(name_ar="قياسي", price=None, min_lead_days=3))
        db.session.add(product)
        db.session.commit()
        yield app
        db.session.remove()
        db.drop_all()


@pytest.fixture
def client(app):
    return app.test_client()


def login(client, username="deniz", password="password123"):
    return client.post("/api/auth/login", json={"username": username, "password": password})


@pytest.fixture
def admin_client(client):
    assert login(client).status_code == 200
    return client


@pytest.fixture
def assistant_client(client):
    assert login(client, "helper").status_code == 200
    return client
