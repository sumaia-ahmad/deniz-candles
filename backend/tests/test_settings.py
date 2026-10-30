def test_exchange_rate_is_empty_at_first(client):
    assert client.get("/api/settings").get_json()["usd_to_syp"] is None


def test_admin_sets_the_exchange_rate(admin_client):
    response = admin_client.put("/api/admin/settings", json={"usd_to_syp": "13000"})
    assert response.status_code == 200
    assert admin_client.get("/api/settings").get_json()["usd_to_syp"] == "13000"


def test_invalid_rates_are_rejected(admin_client):
    for bad in ("abc", "0", "-5"):
        assert admin_client.put("/api/admin/settings", json={"usd_to_syp": bad}).status_code == 400


def test_only_the_admin_changes_the_rate(client, assistant_client):
    assert assistant_client.put("/api/admin/settings", json={"usd_to_syp": "1"}).status_code == 403


def test_transfer_details_are_shown_to_customers(admin_client, client):
    admin_client.put("/api/admin/settings", json={"transfer_details": "سيرياتيل كاش: 0999999999"})
    assert client.get("/api/settings").get_json()["transfer_details"] == "سيرياتيل كاش: 0999999999"

    admin_client.put("/api/admin/settings", json={"transfer_details": ""})
    assert client.get("/api/settings").get_json()["transfer_details"] is None


def test_large_order_rule_defaults_and_validation(admin_client):
    settings = admin_client.get("/api/settings").get_json()
    assert (settings["large_order_pieces"], settings["large_order_days"]) == (50, 14)
    assert admin_client.put("/api/admin/settings", json={"large_order_pieces": "abc"}).status_code == 400
    assert admin_client.put("/api/admin/settings", json={"large_order_days": 400}).status_code == 400
