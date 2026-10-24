from .extensions import db


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

    product = db.relationship("Product", back_populates="sizes")


class ProductImage(db.Model):
    __tablename__ = "product_images"

    id = db.Column(db.Integer, primary_key=True)
    product_id = db.Column(db.Integer, db.ForeignKey("products.id"), nullable=False)
    filename = db.Column(db.String(200), nullable=False)
    sort_order = db.Column(db.Integer, nullable=False, default=0)

    product = db.relationship("Product", back_populates="images")
