from datetime import date, timedelta

from .conftest import login
from .test_orders import catalog, order_payload, place  # noqa: F401  (catalog is a fixture)

BASE = "/api/admin/inventory"


def material(client, name="شمع صويا", unit="g", **extra):
    response = client.post(f"{BASE}/materials", json={"name": name, "unit": unit, **extra})
    assert response.status_code == 201, response.get_json()
    return response.get_json()


def buy(client, lines, supplier="مورد"):
    return client.post(f"{BASE}/purchases", json={"supplier": supplier, "items": lines})


def stock(client, material_id):
    return next(m for m in client.get(f"{BASE}/materials").get_json() if m["id"] == material_id)


def test_inventory_is_admin_only(client, assistant_client):
    assert client.get(f"{BASE}/materials").status_code == 403  # the assistant is signed in on this client


def test_purchase_adds_stock_and_sets_average_cost(admin_client):
    wax = material(admin_client)
    buy(admin_client, [{"material_id": wax["id"], "quantity": "1000", "unit_cost": "0.02"}])
    buy(admin_client, [{"material_id": wax["id"], "quantity": "1000", "unit_cost": "0.04"}])

    wax = stock(admin_client, wax["id"])
    assert wax["quantity"] == "2000"
    assert wax["average_unit_cost"] == "0.03"  # weighted average of both purchases


def test_low_stock_alert(admin_client):
    box = material(admin_client, "علبة قلب", "piece", low_stock_threshold="5", opening_quantity="6")
    assert stock(admin_client, box["id"])["is_low"] is False
    admin_client.post(f"{BASE}/materials/{box['id']}/adjust", json={"change": "-1", "note": "تالفة"})
    assert stock(admin_client, box["id"])["is_low"] is True
    assert admin_client.get(f"{BASE}/summary").get_json()["low_stock"] == 1


def test_adjustment_needs_a_reason_and_is_in_the_history(admin_client):
    wax = material(admin_client, opening_quantity="100")
    assert admin_client.post(f"{BASE}/materials/{wax['id']}/adjust", json={"change": "-10"}).status_code == 400
    admin_client.post(f"{BASE}/materials/{wax['id']}/adjust", json={"change": "-10", "note": "جرد"})
    history = admin_client.get(f"{BASE}/materials/{wax['id']}/movements").get_json()
    assert [(m["change"], m["reason"]) for m in history] == [("-10", "adjustment"), ("100", "adjustment")]


def test_deleting_a_purchase_removes_its_stock(admin_client):
    wax = material(admin_client)
    purchase = buy(admin_client, [{"material_id": wax["id"], "quantity": "500", "unit_cost": "0.02"}]).get_json()
    assert purchase["total"] == "10.00"
    assert admin_client.delete(f"{BASE}/purchases/{purchase['id']}").status_code == 204
    assert stock(admin_client, wax["id"])["quantity"] == "0"


def test_bad_values_are_rejected(admin_client):
    wax = material(admin_client)
    assert buy(admin_client, [{"material_id": wax["id"], "quantity": "-5", "unit_cost": "1"}]).status_code == 400
    assert buy(admin_client, []).status_code == 400
    assert admin_client.post(f"{BASE}/materials", json={"name": "شمع صويا", "unit": "g"}).status_code == 400  # duplicate


def test_recipe_gives_the_cost_of_a_piece(admin_client, catalog):
    wax = material(admin_client)
    box = material(admin_client, "علبة", "piece")
    buy(admin_client, [
        {"material_id": wax["id"], "quantity": "1000", "unit_cost": "0.02"},
        {"material_id": box["id"], "quantity": "10", "unit_cost": "0.5"},
    ])
    size_id = catalog["gift"][1]
    recipe = admin_client.put(f"{BASE}/sizes/{size_id}/recipe", json={"items": [
        {"material_id": wax["id"], "quantity": "200"},
        {"material_id": box["id"], "quantity": "1"},
    ]}).get_json()
    assert recipe["unit_cost"] == "4.50"  # 200 x 0.02 + 1 x 0.5

    product = next(p for p in admin_client.get("/api/admin/products").get_json() if p["kind"] == "gift")
    assert product["sizes"][0]["unit_cost"] == "4.50"
    # Editing the price keeps the cost in the response, so the dashboard can show the new margin.
    updated = admin_client.patch(f"/api/admin/sizes/{size_id}", json={"price": "9"}).get_json()
    assert updated["unit_cost"] == "4.50"
    # Customers never see costs.
    public = admin_client.get(f"/api/products/{product['id']}").get_json()
    assert "unit_cost" not in public["sizes"][0]


def test_preparing_an_order_uses_materials_and_cancelling_returns_them(client, catalog):
    login(client)
    wax = material(client, opening_quantity="1000")
    client.put(f"{BASE}/sizes/{catalog['gift'][1]}/recipe", json={"items": [{"material_id": wax["id"], "quantity": "100"}]})
    client.post("/api/auth/logout")

    place(client, order_payload(catalog))  # 2 gift boxes -> 200 g of wax
    login(client)
    order_id = client.get("/api/admin/orders").get_json()[0]["id"]
    for status in ("approved", "confirmed", "in_progress"):
        assert client.post(f"/api/admin/orders/{order_id}/status", json={"status": status}).status_code == 200
    assert stock(client, wax["id"])["quantity"] == "800"

    client.post(f"/api/admin/orders/{order_id}/status", json={"status": "cancelled"})
    assert stock(client, wax["id"])["quantity"] == "1000"


def test_not_enough_stock_warns_but_can_go_ahead(client, catalog):
    login(client)
    wax = material(client, opening_quantity="50")
    client.put(f"{BASE}/sizes/{catalog['gift'][1]}/recipe", json={"items": [{"material_id": wax["id"], "quantity": "100"}]})
    client.post("/api/auth/logout")
    place(client, order_payload(catalog, event_date=(date.today() + timedelta(days=20)).isoformat()))

    login(client)
    order_id = client.get("/api/admin/orders").get_json()[0]["id"]
    for status in ("approved", "confirmed"):
        client.post(f"/api/admin/orders/{order_id}/status", json={"status": status})
    warned = client.post(f"/api/admin/orders/{order_id}/status", json={"status": "in_progress"})
    assert warned.status_code == 409
    assert "Not enough" in warned.get_json()["warnings"][0]

    client.post(f"/api/admin/orders/{order_id}/status", json={"status": "in_progress", "confirm": True})
    assert stock(client, wax["id"])["quantity"] == "-150"  # the shortage is visible in the stock
