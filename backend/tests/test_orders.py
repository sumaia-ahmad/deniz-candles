import io
import json
from datetime import date, timedelta

import pytest
from PIL import Image

from app.extensions import db
from app.models import DeliveryZone, Product, ProductSize

from .conftest import login


def png_bytes():
    buffer = io.BytesIO()
    Image.new("RGB", (40, 40), "pink").save(buffer, "PNG")
    buffer.seek(0)
    return buffer


@pytest.fixture
def catalog(app):
    """One favor (no lead time of its own, priced) and one gift (3-day lead, priced), plus a Damascus zone."""
    with app.app_context():
        favor = Product(kind="favor", name_ar="شمعة تخرج")
        favor.sizes.append(ProductSize(name_ar="قياسي", price=2, min_lead_days=0))
        db.session.add(favor)
        zone = DeliveryZone(name_ar="المزة", fee=3)
        db.session.add(zone)
        db.session.commit()
        gift = db.session.scalar(db.select(Product).where(Product.kind == "gift"))
        gift.sizes[0].price = 25
        db.session.commit()
        return {
            "favor": (favor.id, favor.sizes[0].id),
            "gift": (gift.id, gift.sizes[0].id),
            "zone_id": zone.id,
        }


def order_payload(catalog, kind="gift", days_ahead=20, **overrides):
    product_id, size_id = catalog[kind]
    payload = {
        "name": "لارا",
        "phone": "0991 234 567",
        "instagram": "@lara",
        "event_date": (date.today() + timedelta(days=days_ahead)).isoformat(),
        "items": [{"product_id": product_id, "size_id": size_id, "quantity": 2, "colors": "زهري", "custom_text": "Lara"}],
        "delivery_method": "damascus",
        "zone_id": catalog["zone_id"],
        "address": "المزة، جانب الجامع",
        "notes": "بدون ملاحظات",
    }
    payload.update(overrides)
    return payload


def place(client, payload, image=True, **extra_fields):
    data = {"order": json.dumps(payload), **extra_fields}
    if image:
        data["reference_image"] = (png_bytes(), "ref.png")
    return client.post("/api/orders", data=data, content_type="multipart/form-data")


def test_place_order_computes_total_and_starts_pending(client, catalog):
    response = place(client, order_payload(catalog))
    assert response.status_code == 201
    body = response.get_json()
    assert body["status"] == "pending_review"
    assert body["code"].startswith("DZ-")
    assert body["items_total"] == "50.00"  # 2 x 25
    assert body["delivery_fee"] == "3.00"
    assert body["total"] == "53.00"
    assert "phone" not in body and "address" not in body  # tracking page stays private


def test_price_snapshot_is_kept_when_catalog_price_changes(app, client, catalog):
    code = place(client, order_payload(catalog)).get_json()["code"]
    with app.app_context():
        db.session.get(ProductSize, catalog["gift"][1]).price = 99
        db.session.commit()
    assert client.get(f"/api/orders/{code}").get_json()["items_total"] == "50.00"


def large_favor_order(catalog, quantity, days_ahead):
    payload = order_payload(catalog, kind="favor", days_ahead=days_ahead)
    payload["items"][0]["quantity"] = quantity
    return payload


def test_orders_of_50_pieces_or_more_need_14_days(client, catalog):
    assert place(client, large_favor_order(catalog, 50, days_ahead=13)).status_code == 400
    assert place(client, large_favor_order(catalog, 50, days_ahead=14)).status_code == 201


def test_smaller_favor_orders_have_no_14_day_rule(client, catalog):
    assert place(client, large_favor_order(catalog, 49, days_ahead=2)).status_code == 201


def test_large_order_rule_can_be_changed(client, catalog):
    from .conftest import login

    login(client)
    client.put("/api/admin/settings", json={"large_order_pieces": 30, "large_order_days": 20})
    client.post("/api/auth/logout")
    assert place(client, large_favor_order(catalog, 30, days_ahead=19)).status_code == 400
    assert place(client, large_favor_order(catalog, 29, days_ahead=2)).status_code == 201


def test_gift_needs_3_days_notice(client, catalog):
    assert place(client, order_payload(catalog, kind="gift", days_ahead=2)).status_code == 400
    assert place(client, order_payload(catalog, kind="gift", days_ahead=3)).status_code == 201


@pytest.mark.parametrize("field", ["name", "phone", "address", "event_date"])
def test_required_fields(client, catalog, field):
    assert place(client, order_payload(catalog, **{field: ""})).status_code == 400


def test_colors_and_text_are_required_per_item(client, catalog):
    payload = order_payload(catalog)
    payload["items"][0]["colors"] = ""
    assert place(client, payload).status_code == 400


def test_reference_image_and_notes_are_optional(client, catalog):
    response = place(client, order_payload(catalog, notes=""), image=False)
    assert response.status_code == 201


def test_uploaded_reference_image_must_be_an_image(client, catalog):
    fake = {"order": json.dumps(order_payload(catalog)), "reference_image": (io.BytesIO(b"not an image"), "x.png")}
    assert client.post("/api/orders", data=fake, content_type="multipart/form-data").status_code == 400


def test_honeypot_blocks_bots(client, catalog):
    assert place(client, order_payload(catalog), website="spam").status_code == 400


def test_governorate_shipping_has_no_delivery_fee(client, catalog):
    payload = order_payload(catalog, delivery_method="governorate", governorate="حلب", zone_id=None)
    body = place(client, payload).get_json()
    assert body["delivery_fee"] == "0.00"
    assert body["total"] == "50.00"


def test_unpriced_items_leave_total_open(client, catalog, app):
    with app.app_context():
        db.session.get(ProductSize, catalog["gift"][1]).price = None
        db.session.commit()
    body = place(client, order_payload(catalog)).get_json()
    assert body["total"] is None


def test_dashboard_orders_require_login(client):
    assert client.get("/api/admin/orders").status_code == 401


def test_admin_reviews_and_moves_order_through_statuses(client, catalog):
    place(client, order_payload(catalog))
    login(client)
    order = client.get("/api/admin/orders").get_json()[0]
    assert order["status"] == "pending_review"

    detail = client.get(f"/api/admin/orders/{order['id']}").get_json()
    assert set(detail["next_statuses"]) == {"approved", "changes_proposed", "rejected"}
    assert detail["address"] == "المزة، جانب الجامع"

    for status in ("approved", "confirmed", "in_progress", "ready", "delivered"):
        response = client.post(f"/api/admin/orders/{order['id']}/status", json={"status": status})
        assert response.status_code == 200, status

    # Delivered is final.
    assert client.post(f"/api/admin/orders/{order['id']}/status", json={"status": "approved"}).status_code == 400


def test_reject_needs_a_reason(client, catalog):
    place(client, order_payload(catalog))
    login(client)
    order_id = client.get("/api/admin/orders").get_json()[0]["id"]
    assert client.post(f"/api/admin/orders/{order_id}/status", json={"status": "rejected"}).status_code == 400
    ok = client.post(f"/api/admin/orders/{order_id}/status", json={"status": "rejected", "message": "مشغولة هالأسبوع"})
    assert ok.status_code == 200


def test_customer_accepts_proposed_date(client, catalog):
    code = place(client, order_payload(catalog)).get_json()["code"]
    login(client)
    order_id = client.get("/api/admin/orders").get_json()[0]["id"]
    new_date = (date.today() + timedelta(days=30)).isoformat()
    client.post(
        f"/api/admin/orders/{order_id}/status",
        json={"status": "changes_proposed", "message": "بقدر خلّصه بعد أسبوعين", "proposed_event_date": new_date},
    )
    client.post("/api/auth/logout")

    tracking = client.get(f"/api/orders/{code}").get_json()
    assert tracking["status"] == "changes_proposed"
    assert tracking["proposed_event_date"] == new_date

    accepted = client.post(f"/api/orders/{code}/respond", json={"accept": True}).get_json()
    assert accepted["status"] == "approved"
    assert accepted["event_date"] == new_date


def test_customer_declines_proposal(client, catalog):
    code = place(client, order_payload(catalog)).get_json()["code"]
    login(client)
    order_id = client.get("/api/admin/orders").get_json()[0]["id"]
    client.post(f"/api/admin/orders/{order_id}/status", json={"status": "changes_proposed", "message": "عدد أقل"})
    assert client.post(f"/api/orders/{code}/respond", json={"accept": False}).get_json()["status"] == "cancelled"


def test_workload_shows_other_orders_in_the_same_week(client, catalog):
    place(client, order_payload(catalog, days_ahead=20))
    place(client, order_payload(catalog, days_ahead=20, phone="0990000000"))
    login(client)
    order_id = client.get("/api/admin/orders").get_json()[0]["id"]
    workload = client.get(f"/api/admin/orders/{order_id}").get_json()["workload"]
    assert len(workload["orders"]) == 1
    assert workload["pieces"] == 2


def test_reference_image_is_private(client, catalog):
    place(client, order_payload(catalog))
    login(client)
    order_id = client.get("/api/admin/orders").get_json()[0]["id"]
    assert client.get(f"/api/admin/orders/{order_id}/reference-image").status_code == 200
    client.post("/api/auth/logout")
    assert client.get(f"/api/admin/orders/{order_id}/reference-image").status_code == 401


def test_unknown_tracking_code(client):
    assert client.get("/api/orders/DZ-NOPE1234").status_code == 404
