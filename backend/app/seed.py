import click

from .extensions import db
from .models import Occasion, Product, ProductImage, ProductSize

OCCASIONS = [
    {"slug": "graduation", "name_ar": "توزيعات تخرج", "name_en": "Graduation favors"},
    {"slug": "engagement", "name_ar": "توزيعات خطوبة أو زواج", "name_en": "Engagement & wedding favors"},
    {"slug": "baby", "name_ar": "توزيعات بيبي", "name_en": "Baby favors"},
]

# (kind, occasion slug, Arabic name, image files - the first one is the cover)
PRODUCTS = [
    ("favor", "graduation", "شمعة الوردة الملكية", ["graduation-05"]),
    ("favor", "graduation", "شمعة جوري", ["graduation-03"]),
    ("favor", "graduation", "كرت شمعة الديزي", ["graduation-04", "graduation-07"]),
    ("favor", "graduation", "شمعة تخرج", ["graduation-08"]),
    ("favor", "graduation", "جار شمعة التخرج", ["graduation-09"]),
    ("favor", "graduation", "شمعة الديزي", ["graduation-01"]),
    ("favor", "engagement", "شمعة Hand in Hand", ["engagement-01", "engagement-02"]),
    ("favor", "baby", "دبدوب مع غيمة وبالون", ["baby-01", "baby-05"]),
    ("favor", "baby", "شمعة فلفولة", ["baby-04"]),
    ("favor", "baby", "شمعة فلفول", ["baby-02"]),
    ("favor", "baby", "جار شمعة دبدوب", ["baby-03"]),
    ("gift", None, "بوكس ورد اسطواني حجم وسط", ["gifts-11", "gifts-01", "gifts-13"]),
    ("gift", None, "بوكس قلب حجم وسط", ["gifts-04", "gifts-03", "gifts-07"]),
    ("gift", None, "بوكس قلب حجم كبير", ["gifts-08", "gifts-09", "gifts-10"]),
    ("gift", None, "بوكس دائري حجم كبير", ["gifts-15", "gifts-05", "gifts-02"]),
    ("gift", None, "بوكس ورد اسطواني حجم كبير", ["gifts-12", "gifts-14"]),
    ("gift", None, "بوكيه شمعة الديزي", ["gifts-06"]),
]
@click.command("seed")
def seed_command():
    """Reset the catalog (occasions, products, sizes, images) to the starting data.

    Accounts and delivery zones are left untouched.
    """
    for model in (ProductImage, ProductSize, Product, Occasion):
        db.session.execute(db.delete(model))

    occasions = {}
    for data in OCCASIONS:
        occasion = Occasion(**data)
        db.session.add(occasion)
        occasions[occasion.slug] = occasion

    for kind, occasion_slug, name_ar, image_names in PRODUCTS:
        product = Product(
            kind=kind,
            occasion=occasions.get(occasion_slug),
            name_ar=name_ar,
        )
        lead_days = 0 if kind == "favor" else 3  # BR-9: favors rely on the large-order rule (50+ pieces -> 14 days)
        product.sizes.append(ProductSize(name_ar="قياسي", price=None, min_lead_days=lead_days))
        for order, name in enumerate(image_names):
            product.images.append(ProductImage(filename=f"{name}.jpg", sort_order=order))
        db.session.add(product)

    db.session.commit()
    click.echo(f"Seeded {len(OCCASIONS)} occasions and {len(PRODUCTS)} products.")
