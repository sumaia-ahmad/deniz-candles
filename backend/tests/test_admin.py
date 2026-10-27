def test_admin_pages_require_login(client):
    assert client.get("/api/admin/products").status_code == 401
    assert client.get("/api/admin/delivery-zones").status_code == 401


def test_assistant_cannot_manage_prices_or_zones(assistant_client):
    # BR-8: the assistant never sees prices, costs or reports.
    assert assistant_client.get("/api/admin/products").status_code == 403
    assert assistant_client.post("/api/admin/delivery-zones", json={"name_ar": "المزة", "fee": 3}).status_code == 403


def test_admin_sets_a_price_and_it_shows_in_the_catalog(admin_client):
    size_id = admin_client.get("/api/admin/products").get_json()[0]["sizes"][0]["id"]

    response = admin_client.patch(f"/api/admin/sizes/{size_id}", json={"price": "12.50", "min_lead_days": 5})
    assert response.status_code == 200

    public = admin_client.get("/api/products").get_json()[0]
    assert public["sizes"][0]["price"] == "12.50"
    assert public["sizes"][0]["min_lead_days"] == 5


def test_invalid_price_is_rejected(admin_client):
    size_id = admin_client.get("/api/admin/products").get_json()[0]["sizes"][0]["id"]
    for bad in ("abc", -1, "1.999"):
        assert admin_client.patch(f"/api/admin/sizes/{size_id}", json={"price": bad}).status_code == 400


def test_cannot_delete_the_last_size(admin_client):
    product = admin_client.get("/api/admin/products").get_json()[0]
    response = admin_client.delete(f"/api/admin/sizes/{product['sizes'][0]['id']}")
    assert response.status_code == 400


def test_add_and_delete_a_size(admin_client):
    product_id = admin_client.get("/api/admin/products").get_json()[0]["id"]
    created = admin_client.post(f"/api/admin/products/{product_id}/sizes", json={"name_ar": "كبير", "price": 30})
    assert created.status_code == 201
    assert created.get_json()["min_lead_days"] == 3  # gifts default to 3 days

    assert admin_client.delete(f"/api/admin/sizes/{created.get_json()['id']}").status_code == 204


def test_hidden_product_disappears_from_the_public_catalog(admin_client):
    product_id = admin_client.get("/api/admin/products").get_json()[0]["id"]
    admin_client.patch(f"/api/admin/products/{product_id}", json={"is_visible": False})

    assert admin_client.get("/api/products").get_json() == []
    assert admin_client.get(f"/api/products/{product_id}").status_code == 404


def test_delivery_zone_crud(admin_client):
    created = admin_client.post("/api/admin/delivery-zones", json={"name_ar": "المزة", "fee": "3"})
    assert created.status_code == 201
    zone_id = created.get_json()["id"]

    assert admin_client.post("/api/admin/delivery-zones", json={"name_ar": "المزة", "fee": 4}).status_code == 400

    admin_client.patch(f"/api/admin/delivery-zones/{zone_id}", json={"fee": "3.50"})
    assert admin_client.get("/api/delivery-zones").get_json() == [{"id": zone_id, "name_ar": "المزة", "fee": "3.50"}]

    admin_client.patch(f"/api/admin/delivery-zones/{zone_id}", json={"is_active": False})
    assert admin_client.get("/api/delivery-zones").get_json() == []

    assert admin_client.delete(f"/api/admin/delivery-zones/{zone_id}").status_code == 204
