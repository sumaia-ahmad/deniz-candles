def test_catalog_lists_visible_products(client):
    products = client.get("/api/products").get_json()
    assert [p["name_ar"] for p in products] == ["بوكس تجربة"]
    assert products[0]["sizes"][0]["price"] is None


def test_filter_by_kind(client):
    assert len(client.get("/api/products?kind=gift").get_json()) == 1
    assert client.get("/api/products?kind=favor").get_json() == []


def test_unknown_product_returns_404(client):
    assert client.get("/api/products/999").status_code == 404
