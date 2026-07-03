import json
import pytest
from models import db, Category, Product


def test_reorder_categories(client, app):
    """PUT /api/categories/reorder should update category display order."""
    with app.app_context():
        # Create categories
        cat1 = Category(name="Drinks")
        cat2 = Category(name="Appetizers")
        db.session.add_all([cat1, cat2])
        db.session.commit()
        cat1_id = cat1.id
        cat2_id = cat2.id

    # Call PUT /api/categories/reorder
    payload = {"orders": [{"id": cat1_id, "display_order": 2}, {"id": cat2_id, "display_order": 1}]}
    response = client.put(
        "/api/categories/reorder", data=json.dumps(payload), content_type="application/json"
    )
    assert response.status_code == 200
    data = json.loads(response.data)
    assert data["success"] is True

    # Call GET /api/categories and verify they are sorted by display_order
    response = client.get("/api/categories")
    assert response.status_code == 200
    data = json.loads(response.data)
    cats = data["categories"]

    # Appetizers should be first because display_order=1 is less than 2
    # Find positions of Drinks and Appetizers
    drinks_cat = next(c for c in cats if c["id"] == cat1_id)
    appetizers_cat = next(c for c in cats if c["id"] == cat2_id)

    assert drinks_cat["display_order"] == 2
    assert appetizers_cat["display_order"] == 1

    # Filter the list to only include our two categories to check relative order
    relevant_cats = [c for c in cats if c["id"] in (cat1_id, cat2_id)]
    assert relevant_cats[0]["id"] == cat2_id
    assert relevant_cats[1]["id"] == cat1_id


def test_reorder_products(client, app):
    """PUT /api/products/reorder should update product display order."""
    with app.app_context():
        # Get or create category
        cat = Category.query.first()
        if not cat:
            cat = Category(name="Main Course")
            db.session.add(cat)
            db.session.commit()
        cat_id = cat.id

        # Create products
        prod1 = Product(product_id="PROD-A", name="Burger A", category_id=cat_id, price=10.0)
        prod2 = Product(product_id="PROD-B", name="Burger B", category_id=cat_id, price=12.0)
        db.session.add_all([prod1, prod2])
        db.session.commit()

    # Call PUT /api/products/reorder
    payload = {
        "orders": [
            {"product_id": "PROD-A", "display_order": 5},
            {"product_id": "PROD-B", "display_order": 3},
        ]
    }
    response = client.put(
        "/api/products/reorder", data=json.dumps(payload), content_type="application/json"
    )
    assert response.status_code == 200
    data = json.loads(response.data)
    assert data["success"] is True

    # Call GET /api/products and verify they are sorted by display_order
    response = client.get("/api/products")
    assert response.status_code == 200
    data = json.loads(response.data)
    products_list = data["products"]

    burger_a = next(p for p in products_list if p["product_id"] == "PROD-A")
    burger_b = next(p for p in products_list if p["product_id"] == "PROD-B")

    assert burger_a["display_order"] == 5
    assert burger_b["display_order"] == 3

    # Filter the list to only include our two products to check relative order
    relevant_prods = [p for p in products_list if p["product_id"] in ("PROD-A", "PROD-B")]
    assert relevant_prods[0]["product_id"] == "PROD-B"
    assert relevant_prods[1]["product_id"] == "PROD-A"
