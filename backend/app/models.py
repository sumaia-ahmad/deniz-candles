from datetime import datetime, timezone
from decimal import Decimal

from werkzeug.security import check_password_hash, generate_password_hash

from .extensions import db


def utcnow():
    return datetime.now(timezone.utc)


class Occasion(db.Model):
    __tablename__ = "occasions"

    id = db.Column(db.Integer, primary_key=True)
    slug = db.Column(db.String(50), unique=True, nullable=False)
    name_ar = db.Column(db.String(100), nullable=False)
    name_en = db.Column(db.String(100), nullable=False)

    products = db.relationship("Product", back_populates="occasion")


class Product(db.Model):
    __tablename__ = "products"

    id = db.Column(db.Integer, primary_key=True)
    kind = db.Column(db.String(10), nullable=False)  # "favor" or "gift"
    occasion_id = db.Column(db.Integer, db.ForeignKey("occasions.id"), nullable=True)
    name_ar = db.Column(db.String(150), nullable=False)
    name_en = db.Column(db.String(150), nullable=True)
    is_visible = db.Column(db.Boolean, nullable=False, default=True)

    occasion = db.relationship("Occasion", back_populates="products")
    sizes = db.relationship("ProductSize", back_populates="product", cascade="all, delete-orphan")
    images = db.relationship(
        "ProductImage",
        back_populates="product",
        cascade="all, delete-orphan",
        order_by="ProductImage.sort_order",
    )


class ProductSize(db.Model):
    __tablename__ = "product_sizes"

    id = db.Column(db.Integer, primary_key=True)
    product_id = db.Column(db.Integer, db.ForeignKey("products.id"), nullable=False)
    name_ar = db.Column(db.String(50), nullable=False, default="قياسي")
    price = db.Column(db.Numeric(10, 2), nullable=True)
    # Minimum days between ordering and the event (BR-9).
    min_lead_days = db.Column(db.Integer, nullable=False, default=14)

    product = db.relationship("Product", back_populates="sizes")


class ProductImage(db.Model):
    __tablename__ = "product_images"

    id = db.Column(db.Integer, primary_key=True)
    product_id = db.Column(db.Integer, db.ForeignKey("products.id"), nullable=False)
    filename = db.Column(db.String(200), nullable=False)
    sort_order = db.Column(db.Integer, nullable=False, default=0)

    product = db.relationship("Product", back_populates="images")


class DeliveryZone(db.Model):
    __tablename__ = "delivery_zones"

    id = db.Column(db.Integer, primary_key=True)
    name_ar = db.Column(db.String(100), unique=True, nullable=False)
    fee = db.Column(db.Numeric(10, 2), nullable=False)
    is_active = db.Column(db.Boolean, nullable=False, default=True)


class User(db.Model):
    __tablename__ = "users"

    ROLES = ("admin", "assistant")

    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(50), unique=True, nullable=False)
    password_hash = db.Column(db.String(255), nullable=False)
    role = db.Column(db.String(20), nullable=False, default="assistant")

    def set_password(self, password):
        self.password_hash = generate_password_hash(password)

    def check_password(self, password):
        return check_password_hash(self.password_hash, password)


class Customer(db.Model):
    __tablename__ = "customers"

    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(100), nullable=False)
    phone = db.Column(db.String(30), unique=True, nullable=False)
    instagram = db.Column(db.String(60), nullable=True)
    created_at = db.Column(db.DateTime(timezone=True), nullable=False, default=utcnow)

    orders = db.relationship("Order", back_populates="customer")


class Order(db.Model):
    __tablename__ = "orders"

    # Lifecycle (FR-16). An online order is only a request until it is approved (BR-10).
    STATUSES = (
        "pending_review",
        "changes_proposed",
        "approved",
        "awaiting_deposit",
        "confirmed",
        "in_progress",
        "ready",
        "delivered",
        "rejected",
        "cancelled",
    )
    # Which status the admin may move an order to from each status.
    TRANSITIONS = {
        "pending_review": ("approved", "changes_proposed", "rejected"),
        "changes_proposed": ("approved", "rejected", "cancelled"),
        "approved": ("awaiting_deposit", "confirmed", "cancelled"),
        "awaiting_deposit": ("confirmed", "cancelled"),
        "confirmed": ("in_progress", "cancelled"),
        "in_progress": ("ready", "cancelled"),
        "ready": ("delivered",),
        "delivered": (),
        "rejected": (),
        "cancelled": (),
    }
    CLOSED = ("delivered", "rejected", "cancelled")

    id = db.Column(db.Integer, primary_key=True)
    code = db.Column(db.String(20), unique=True, nullable=False, index=True)
    customer_id = db.Column(db.Integer, db.ForeignKey("customers.id"), nullable=False)
    status = db.Column(db.String(30), nullable=False, default="pending_review")
    event_date = db.Column(db.Date, nullable=False)

    delivery_method = db.Column(db.String(20), nullable=False)  # "damascus" or "governorate"
    zone_name = db.Column(db.String(100), nullable=True)  # snapshot of the zone at order time
    governorate = db.Column(db.String(60), nullable=True)
    address = db.Column(db.String(300), nullable=False)
    delivery_fee = db.Column(db.Numeric(10, 2), nullable=False, default=0)

    notes = db.Column(db.Text, nullable=False, default="")  # optional, "" when empty
    reference_image = db.Column(db.String(100), nullable=False, default="")  # optional, "" when none

    # Deposit the admin asks for before confirming (favor orders, BR-6). Set per order.
    deposit_required = db.Column(db.Numeric(10, 2), nullable=True)

    # Filled in when the admin rejects or proposes changes.
    admin_message = db.Column(db.Text, nullable=True)
    proposed_event_date = db.Column(db.Date, nullable=True)

    created_at = db.Column(db.DateTime(timezone=True), nullable=False, default=utcnow)
    updated_at = db.Column(db.DateTime(timezone=True), nullable=False, default=utcnow, onupdate=utcnow)

    customer = db.relationship("Customer", back_populates="orders")
    items = db.relationship("OrderItem", back_populates="order", cascade="all, delete-orphan")
    payments = db.relationship(
        "Payment", back_populates="order", cascade="all, delete-orphan", order_by="Payment.created_at"
    )

    @property
    def items_total(self):
        """Sum of the items, or None while any item still has no price."""
        if any(item.unit_price is None for item in self.items):
            return None
        return sum((item.unit_price * item.quantity for item in self.items), Decimal("0"))

    @property
    def total(self):
        items_total = self.items_total
        return None if items_total is None else items_total + self.delivery_fee

    @property
    def piece_count(self):
        return sum(item.quantity for item in self.items)

    @property
    def has_favors(self):
        return any(item.product_kind == "favor" for item in self.items)

    @property
    def paid(self):
        """Money that has actually reached Deniz."""
        return sum((p.amount for p in self.payments if p.status == "received"), Decimal("0"))

    @property
    def with_driver(self):
        """Cash the delivery driver collected but has not handed over yet (FR-20)."""
        return sum((p.amount for p in self.payments if p.status == "with_driver"), Decimal("0"))

    @property
    def remaining(self):
        total = self.total
        return None if total is None else total - self.paid


class OrderItem(db.Model):
    __tablename__ = "order_items"

    id = db.Column(db.Integer, primary_key=True)
    order_id = db.Column(db.Integer, db.ForeignKey("orders.id"), nullable=False)
    product_id = db.Column(db.Integer, db.ForeignKey("products.id"), nullable=True)
    size_id = db.Column(db.Integer, db.ForeignKey("product_sizes.id"), nullable=True)

    # Snapshot at order time, so later catalog edits never change this order (BR-5).
    product_name = db.Column(db.String(150), nullable=False)
    product_kind = db.Column(db.String(10), nullable=False)
    size_name = db.Column(db.String(50), nullable=False)
    unit_price = db.Column(db.Numeric(10, 2), nullable=True)

    quantity = db.Column(db.Integer, nullable=False)
    colors = db.Column(db.String(200), nullable=False)
    custom_text = db.Column(db.String(200), nullable=False)

    order = db.relationship("Order", back_populates="items")


class Payment(db.Model):
    __tablename__ = "payments"

    METHODS = ("transfer", "cash")
    STATUSES = ("received", "with_driver")

    id = db.Column(db.Integer, primary_key=True)
    order_id = db.Column(db.Integer, db.ForeignKey("orders.id"), nullable=False)
    method = db.Column(db.String(20), nullable=False)  # "transfer" or "cash"
    amount = db.Column(db.Numeric(10, 2), nullable=False)
    is_deposit = db.Column(db.Boolean, nullable=False, default=False)
    # "with_driver" = cash on delivery not yet handed over; becomes "received" once it is.
    status = db.Column(db.String(20), nullable=False, default="received")
    transfer_number = db.Column(db.String(60), nullable=True)
    receipt_image = db.Column(db.String(100), nullable=True)
    note = db.Column(db.String(300), nullable=True)
    created_at = db.Column(db.DateTime(timezone=True), nullable=False, default=utcnow)
    received_at = db.Column(db.DateTime(timezone=True), nullable=True)

    order = db.relationship("Order", back_populates="payments")
