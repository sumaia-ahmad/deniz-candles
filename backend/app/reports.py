"""Business reports: monthly figures, best sellers and money still owed (admin only).

The figures are SQL aggregates (GROUP BY / SUM) so they stay fast as orders pile up.
"""

from datetime import date
from decimal import Decimal

from flask import Blueprint, request
from sqlalchemy import func

from .auth import admin_required
from .extensions import db
from .models import Occasion, Order, OrderItem, Payment, Product, Purchase, PurchaseItem, StockMovement

bp = Blueprint("reports", __name__, url_prefix="/api/admin/reports")

# Orders that count as sales: accepted and not cancelled. Each is counted in the month of its event,
# when the work is delivered.
SOLD = ("confirmed", "in_progress", "ready", "delivered")


def money(value):
    return str(Decimal(value or 0).quantize(Decimal("0.01")))


def month_columns(column):
    return func.extract("year", column).label("year"), func.extract("month", column).label("month")


def by_month(rows):
    """{(year, month): row} from rows that start with year and month."""
    return {(int(row.year), int(row.month)): row for row in rows}


def month_range(first, last):
    months = []
    year, month = first
    while (year, month) <= last:
        months.append((year, month))
        year, month = (year + 1, 1) if month == 12 else (year, month + 1)
    return months


def months_back(today, count):
    index = today.year * 12 + today.month - 1 - (count - 1)
    return index // 12, index % 12 + 1


@bp.get("")
@admin_required
def report():
    count = min(max(request.args.get("months", 12, type=int), 1), 36)
    today = date.today()
    first = months_back(today, count)
    start = date(*first, 1)

    line_total = OrderItem.unit_price * OrderItem.quantity
    sold_since_start = (Order.status.in_(SOLD), Order.event_date >= start)

    # Sales per month. Delivery fees are left out: they pay for the delivery, not the product.
    sales = by_month(
        db.session.execute(
            db.select(
                *month_columns(Order.event_date),
                func.count(func.distinct(Order.id)).label("orders"),
                func.sum(OrderItem.quantity).label("pieces"),
                func.sum(line_total).label("sales"),
            )
            .join(OrderItem, OrderItem.order_id == Order.id)
            .where(*sold_since_start)
            .group_by("year", "month")
        )
    )

    # Material cost of those orders, from the stock taken out for them (minus anything returned).
    costs = by_month(
        db.session.execute(
            db.select(
                *month_columns(Order.event_date),
                func.sum(-StockMovement.change * StockMovement.unit_cost).label("cost"),
            )
            .join(StockMovement, StockMovement.order_id == Order.id)
            .where(*sold_since_start, StockMovement.reason.in_(("order", "order_return")))
            .group_by("year", "month")
        )
    )

    # Money that actually came in, in the month it arrived.
    arrived = func.coalesce(Payment.received_at, Payment.created_at)
    received = by_month(
        db.session.execute(
            db.select(*month_columns(arrived), func.sum(Payment.amount).label("amount"))
            .where(Payment.status == "received", arrived >= start)
            .group_by("year", "month")
        )
    )

    spent = by_month(
        db.session.execute(
            db.select(
                *month_columns(Purchase.purchased_on),
                func.sum(PurchaseItem.quantity * PurchaseItem.unit_cost).label("amount"),
            )
            .join(PurchaseItem, PurchaseItem.purchase_id == Purchase.id)
            .where(Purchase.purchased_on >= start)
            .group_by("year", "month")
        )
    )

    # Show every month in the period, plus later months that already have confirmed orders.
    last = max([(today.year, today.month), *sales.keys()])
    months = []
    for key in reversed(month_range(first, last)):
        sale, cost = sales.get(key), costs.get(key)
        sales_amount = sale.sales if sale else 0
        cost_amount = cost.cost if cost else 0
        months.append(
            {
                "month": f"{key[0]}-{key[1]:02d}",
                "orders": sale.orders if sale else 0,
                "pieces": int(sale.pieces) if sale else 0,
                "sales": money(sales_amount),
                "material_cost": money(cost_amount),
                "gross_profit": money(Decimal(sales_amount or 0) - Decimal(cost_amount or 0)),
                "received": money(received[key].amount if key in received else 0),
                "purchases": money(spent[key].amount if key in spent else 0),
            }
        )

    revenue = func.sum(line_total).label("revenue")
    top_products = db.session.execute(
        db.select(
            OrderItem.product_name,
            OrderItem.product_kind,
            func.sum(OrderItem.quantity).label("pieces"),
            revenue,
            func.count(func.distinct(Order.id)).label("orders"),
        )
        .join(Order, Order.id == OrderItem.order_id)
        .where(*sold_since_start)
        .group_by(OrderItem.product_name, OrderItem.product_kind)
        .order_by(func.sum(OrderItem.quantity).desc(), revenue.desc())
        .limit(10)
    )

    by_category = db.session.execute(
        db.select(
            OrderItem.product_kind,
            Occasion.name_en,
            func.sum(OrderItem.quantity).label("pieces"),
            revenue,
        )
        .join(Order, Order.id == OrderItem.order_id)
        .outerjoin(Product, Product.id == OrderItem.product_id)
        .outerjoin(Occasion, Occasion.id == Product.occasion_id)
        .where(*sold_since_start)
        .group_by(OrderItem.product_kind, Occasion.name_en)
        .order_by(revenue.desc())
    )

    # Money still owed on accepted orders, oldest event first.
    owing = []
    for order in db.session.scalars(db.select(Order).where(Order.status.in_(SOLD)).order_by(Order.event_date)):
        if order.remaining is not None and order.remaining > 0:
            owing.append(
                {
                    "id": order.id,
                    "code": order.code,
                    "customer": order.customer.name,
                    "event_date": order.event_date.isoformat(),
                    "status": order.status,
                    "total": money(order.total),
                    "paid": money(order.paid),
                    "with_driver": money(order.with_driver),
                    "remaining": money(order.remaining),
                }
            )

    return {
        "months": months,
        "top_products": [
            {"name": r.product_name, "kind": r.product_kind, "pieces": int(r.pieces), "orders": r.orders,
             "revenue": money(r.revenue)}
            for r in top_products
        ],
        "by_category": [
            {"label": "Gifts" if r.product_kind == "gift" else (r.name_en or "Favors"), "pieces": int(r.pieces),
             "revenue": money(r.revenue)}
            for r in by_category
        ],
        "receivables": owing,
        "receivables_total": money(sum((Decimal(o["remaining"]) for o in owing), Decimal("0"))),
    }
