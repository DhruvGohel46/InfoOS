import os
import tempfile
import pytest

# Set env vars BEFORE importing app or config
temp_dir = tempfile.mkdtemp()
os.environ["POS_DATA_DIR"] = temp_dir
os.environ["DATABASE_URL"] = f"sqlite:///{os.path.join(temp_dir, 'test.db')}"
os.environ["TESTING"] = "True"

from app import create_app
from models import db, Product, Inventory


@pytest.fixture(scope="session")
def app():
    """Create a Flask app context for tests."""
    # We use a custom config 'testing'
    app = create_app("default")
    app.config.update(
        {
            "TESTING": True,
            "SQLALCHEMY_DATABASE_URI": os.environ["DATABASE_URL"],
            "SQLALCHEMY_TRACK_MODIFICATIONS": False,
            "WTF_CSRF_ENABLED": False,
        }
    )

    with app.app_context():
        db.create_all()
        yield app

    import shutil

    try:
        shutil.rmtree(temp_dir)
    except:
        pass


@pytest.fixture(scope="session")
def client(app):
    """A test client for the app."""
    return app.test_client()


@pytest.fixture(scope="session")
def init_database(app):
    """Seed the database with some initial data."""
    with app.app_context():
        # Create a mock category
        from models import Category

        category = Category(name="Food")
        db.session.add(category)
        db.session.commit()

        # Create a mock product
        product1 = Product(
            product_id="TEST-1",
            name="Test Burger",
            category_id=category.id,
            price=100.0,
        )
        db.session.add(product1)
        db.session.commit()

        # Create inventory for the product
        inv1 = Inventory(
            product_id=product1.product_id,
            name="Test Burger Inv",
            type="DIRECT_SALE",
            stock=50,
            unit="pcs",
        )
        db.session.add(inv1)
        db.session.commit()

        yield db
