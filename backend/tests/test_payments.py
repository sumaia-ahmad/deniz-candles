import io

from PIL import Image

from .conftest import login
from .test_orders import catalog, order_payload, place  # noqa: F401  (catalog is a fixture)


def receipt():
    buffer = io.BytesIO()
    Image.new("RGB", (40, 60), "white").save(buffer, "PNG")
    buffer.seek(0)
    return buffer


def new_order(client, catalog, **overrides):
    code = place(client, order_payload(catalog, **overrides)).get_json()["code"]
    login(client)
    order_id = client.get("/api/admin/orders").get_json()[0]["id"]
    return code, order_id


def pay(client, order_id, **fields):
    data = {"method": "transfer", "amount": "10", **fields}
    return client.post(f"/api/admin/orders/{order_id}/payments", data=data, content_type="multipart/form-data")


def move(client, order_id, status, **extra):
    return client.post(f"/api/admin/orders/{order_id}/status", json={"status": status, **extra})


def test_transfer_with_receipt_updates_paid_and_remaining(client, catalog):
    code, order_id = new_order(client, catalog)  # 2 x 25 + 3 delivery = 53
    response = pay(client, order_id, amount="20", transfer_number="TR-551", is_deposit="true", receipt=(receipt(), "r.png"))
    assert response.status_code == 201
    detail = response.get_json()
    assert detail["paid"] == "20.00"
    assert detail["remaining"] == "33.00"
    assert detail["payments"][0]["transfer_number"] == "TR-551"
    assert client.get(detail["payments"][0]["receipt_url"]).status_code == 200

    tracking = client.get(f"/api/orders/{code}").get_json()
    assert (tracking["paid"], tracking["remaining"]) == ("20.00", "33.00")


def test_cash_with_driver_counts_only_after_it_is_received(client, catalog):
    _, order_id = new_order(client, catalog)
    detail = pay(client, order_id, method="cash", status="with_driver", amount="53").get_json()
    assert (detail["paid"], detail["with_driver"]) == ("0.00", "53.00")

    payment_id = detail["payments"][0]["id"]
    detail = client.post(f"/api/admin/orders/payments/{payment_id}/received").get_json()
    assert (detail["paid"], detail["with_driver"], detail["remaining"]) == ("53.00", "0.00", "0.00")


def test_cash_on_delivery_only_in_damascus(client, catalog):
    _, order_id = new_order(client, catalog, delivery_method="governorate", governorate="حلب", zone_id=None)
    assert pay(client, order_id, method="cash", status="with_driver").status_code == 400


def test_bad_amounts_are_rejected(client, catalog):
    _, order_id = new_order(client, catalog)
    for amount in ("0", "-5", "abc", "1.234"):
        assert pay(client, order_id, amount=amount).status_code == 400


def test_confirming_a_favor_order_without_deposit_warns_but_can_go_ahead(client, catalog):
    _, order_id = new_order(client, catalog, kind="favor")
    client.patch(f"/api/admin/orders/{order_id}", json={"deposit_required": "20"})
    move(client, order_id, "approved")

    warned = move(client, order_id, "confirmed")
    assert warned.status_code == 409
    assert "deposit" in warned.get_json()["warnings"][0]

    assert move(client, order_id, "confirmed", confirm=True).get_json()["status"] == "confirmed"


def test_no_warning_once_the_deposit_is_paid(client, catalog):
    _, order_id = new_order(client, catalog, kind="favor")
    client.patch(f"/api/admin/orders/{order_id}", json={"deposit_required": "20"})
    move(client, order_id, "approved")
    pay(client, order_id, amount="20", is_deposit="true")
    assert move(client, order_id, "confirmed").status_code == 200


def test_shipping_unpaid_governorate_order_warns(client, catalog):
    _, order_id = new_order(client, catalog, delivery_method="governorate", governorate="حلب", zone_id=None)
    for status in ("approved", "confirmed", "in_progress", "ready"):
        move(client, order_id, status)
    assert move(client, order_id, "delivered").status_code == 409
    pay(client, order_id, amount="50")
    assert move(client, order_id, "delivered").status_code == 200


def test_delete_payment(client, catalog):
    _, order_id = new_order(client, catalog)
    payment_id = pay(client, order_id).get_json()["payments"][0]["id"]
    detail = client.delete(f"/api/admin/orders/payments/{payment_id}").get_json()
    assert detail["paid"] == "0.00"


def test_assistant_cannot_record_payments(client, catalog):
    place(client, order_payload(catalog))
    login(client, "helper")
    order_id = client.get("/api/admin/orders").get_json()[0]["id"]
    assert pay(client, order_id).status_code == 403


def test_order_waiting_for_deposit_is_confirmed_when_it_arrives(client, catalog):
    _, order_id = new_order(client, catalog, kind="favor")
    client.patch(f"/api/admin/orders/{order_id}", json={"deposit_required": "20"})
    move(client, order_id, "approved")
    move(client, order_id, "awaiting_deposit")

    assert pay(client, order_id, amount="10").get_json()["status"] == "awaiting_deposit"  # half isn't enough
    assert pay(client, order_id, amount="10").get_json()["status"] == "confirmed"


def test_cash_deposit_confirms_when_marked_received(client, catalog):
    _, order_id = new_order(client, catalog, kind="favor")
    client.patch(f"/api/admin/orders/{order_id}", json={"deposit_required": "20"})
    move(client, order_id, "approved")
    move(client, order_id, "awaiting_deposit")
    detail = pay(client, order_id, method="cash", status="with_driver", amount="20").get_json()
    assert detail["status"] == "awaiting_deposit"  # still with the driver
    payment_id = detail["payments"][0]["id"]
    assert client.post(f"/api/admin/orders/payments/{payment_id}/received").get_json()["status"] == "confirmed"
