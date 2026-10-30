from datetime import date, timedelta

from .conftest import login
from .test_inventory import BASE, buy, material
from .test_orders import catalog, order_payload, place  # noqa: F401  (catalog is a fixture)

REPORTS = "/api/admin/reports"


def month_of(day):
    return day.isoformat()[:7]


def move(client, order_id, *statuses):
    for status in statuses:
        response = client.post(f"/api/admin/orders/{order_id}/status", json={"status": status, "confirm": True})
        assert response.status_code == 200, response.get_json()


def test_reports_are_admin_only(client, assistant_client):
    assert assistant_client.get(REPORTS).status_code == 403
    assistant_client.post("/api/auth/logout")
    assert client.get(REPORTS).status_code == 401


def test_monthly_sales_cost_profit_and_cash(client, catalog):
    login(client)
    wax = material(client)
    buy(client, [{"material_id": wax["id"], "quantity": "1000", "unit_cost": "0.02"}])  # $20 spent
    client.put(f"{BASE}/sizes/{catalog['gift'][1]}/recipe", json={"items": [{"material_id": wax["id"], "quantity": "100"}]})
    client.post("/api/auth/logout")

    event = date.today() + timedelta(days=5)
    place(client, order_payload(catalog, event_date=event.isoformat()))  # 2 gifts x $25 + $3 delivery
    place(client, order_payload(catalog, event_date=event.isoformat(), phone="0933 111 222"))  # stays a request
    login(client)
    orders = client.get("/api/admin/orders").get_json()
    sold_id = orders[-1]["id"]
    move(client, sold_id, "approved", "confirmed", "in_progress")  # uses 200 g of wax = $4
    client.post(f"/api/admin/orders/{sold_id}/payments", data={"method": "transfer", "amount": "30"})

    body = client.get(REPORTS).get_json()
    months = {m["month"]: m for m in body["months"]}
    event_month = months[month_of(event)]
    assert event_month["orders"] == 1  # the unreviewed request isn't a sale
    assert event_month["pieces"] == 2
    assert event_month["sales"] == "50.00"  # delivery fee left out
    assert event_month["material_cost"] == "4.00"
    assert event_month["gross_profit"] == "46.00"

    this_month = months[month_of(date.today())]
    assert this_month["received"] == "30.00"
    assert this_month["purchases"] == "20.00"

    assert body["top_products"][0]["pieces"] == 2
    assert body["by_category"] == [{"label": "Gifts", "pieces": 2, "revenue": "50.00"}]
    assert body["receivables"][0]["remaining"] == "23.00"  # 53 - 30
    assert body["receivables_total"] == "23.00"


def test_cancelled_orders_leave_the_report_and_cost_is_kept_from_the_day_used(client, catalog):
    login(client)
    wax = material(client)
    buy(client, [{"material_id": wax["id"], "quantity": "1000", "unit_cost": "0.02"}])
    client.put(f"{BASE}/sizes/{catalog['gift'][1]}/recipe", json={"items": [{"material_id": wax["id"], "quantity": "100"}]})
    client.post("/api/auth/logout")
    event = date.today() + timedelta(days=5)
    place(client, order_payload(catalog, event_date=event.isoformat()))
    place(client, order_payload(catalog, event_date=event.isoformat(), phone="0933 111 222"))

    login(client)
    first, second = (o["id"] for o in client.get("/api/admin/orders").get_json())
    move(client, first, "approved", "confirmed", "in_progress")
    move(client, second, "approved", "confirmed", "in_progress", "cancelled")
    # Wax gets more expensive after the first order was made: its cost must not change.
    buy(client, [{"material_id": wax["id"], "quantity": "1000", "unit_cost": "1"}])

    event_month = {m["month"]: m for m in client.get(REPORTS).get_json()["months"]}[month_of(event)]
    assert event_month["orders"] == 1
    assert event_month["material_cost"] == "4.00"
    assert event_month["sales"] == "50.00"
