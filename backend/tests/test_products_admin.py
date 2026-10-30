import io

from PIL import Image

from app.extensions import db
from app.models import Occasion


def photo(color="pink"):
    buffer = io.BytesIO()
    Image.new("RGB", (60, 80), color).save(buffer, "PNG")
    buffer.seek(0)
    return buffer


def create(client, **fields):
    data = {"kind": "gift", "name_ar": "بوكس جديد", "price": "30", **fields}
    if "photos" not in data:
        data["photos"] = [(photo(), "a.png"), (photo("purple"), "b.png")]
    return client.post("/api/admin/products", data=data, content_type="multipart/form-data")


def test_create_gift_with_photos(admin_client):
    response = create(admin_client)
    assert response.status_code == 201
    product = response.get_json()
    assert product["sizes"][0] == {**product["sizes"][0], "name_ar": "قياسي", "price": "30.00", "min_lead_days": 3}
    assert len(product["photos"]) == 2

    # It shows on the website, and its photo can be loaded.
    public = admin_client.get(f"/api/products/{product['id']}").get_json()
    assert admin_client.get(public["images"][0]).status_code == 200


def test_favor_needs_an_occasion_and_has_no_lead_time_of_its_own(app, admin_client):
    assert create(admin_client, kind="favor").status_code == 400
    with app.app_context():
        db.session.add(Occasion(slug="baby", name_ar="توزيعات بيبي", name_en="Baby favors"))
        db.session.commit()
    product = create(admin_client, kind="favor", occasion="baby").get_json()
    assert product["occasion"] == "baby"
    assert product["sizes"][0]["min_lead_days"] == 0  # the 50+ pieces rule covers big favor orders


def test_product_needs_a_photo_and_real_images(admin_client):
    assert create(admin_client, photos=[]).status_code == 400
    fake = [(io.BytesIO(b"not a photo"), "x.png")]
    assert create(admin_client, photos=fake).status_code == 400


def test_add_photos_change_cover_and_delete(admin_client):
    product = create(admin_client).get_json()
    first, second = product["photos"]

    more = admin_client.post(
        f"/api/admin/products/{product['id']}/photos",
        data={"photos": [(photo("white"), "c.png")]},
        content_type="multipart/form-data",
    ).get_json()
    assert len(more["photos"]) == 3

    covered = admin_client.post(f"/api/admin/photos/{second['id']}/cover").get_json()
    assert covered["photos"][0]["id"] == second["id"]

    after_delete = admin_client.delete(f"/api/admin/photos/{first['id']}").get_json()
    assert [p["id"] for p in after_delete["photos"]] == [second["id"], more["photos"][2]["id"]]


def test_cannot_delete_the_last_photo(admin_client):
    product = create(admin_client, photos=[(photo(), "only.png")]).get_json()
    assert admin_client.delete(f"/api/admin/photos/{product['photos'][0]['id']}").status_code == 400


def test_delete_product(admin_client):
    product = create(admin_client).get_json()
    assert admin_client.delete(f"/api/admin/products/{product['id']}").status_code == 204
    assert admin_client.get(f"/api/products/{product['id']}").status_code == 404


def test_assistant_cannot_add_products(assistant_client):
    assert create(assistant_client).status_code == 403
