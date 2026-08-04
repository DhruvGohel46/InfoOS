import os
import pytest
from printing.template_manager import TemplateManager
from printing.renderer import HTMLRenderer
from printing.image_generator import PlaywrightImageGenerator


def test_template_manager():
    manager = TemplateManager()
    assert manager.validate_template_exists("default")

    # Check fallback logic
    html_path = manager.get_template_path("non_existent_template", "bill.html")
    assert "default" in html_path
    assert os.path.exists(html_path)


def test_html_renderer():
    manager = TemplateManager()
    renderer = HTMLRenderer(manager)

    mock_bill_data = {
        "bill_no": "TEST-9999",
        "date": "2026-08-01",
        "time": "12:00",
        "order_type": "takeaway",
        "products": [
            {"name": "Burger", "quantity": 1, "price": 10.0},
            {"name": "Pizza", "quantity": 2, "price": 15.0},
        ],
        "subtotal": 40.0,
        "discount": 5.0,
        "gst": 1.75,
        "total": 36.75,
    }

    mock_settings = {
        "shop_name": "Test Burger Joint",
        "shop_address": "123 Main St",
        "shop_contact": "555-1234",
        "printer_template": "default",
        "printer_width": "80mm",
    }

    html = renderer.render_bill(mock_bill_data, mock_settings, is_bill=True)
    assert "Test Burger Joint" in html
    assert "Burger" in html
    assert "36.75" in html


def test_image_generator():
    manager = TemplateManager()
    renderer = HTMLRenderer(manager)
    generator = PlaywrightImageGenerator()

    mock_bill_data = {
        "bill_no": "TEST-8888",
        "date": "2026-08-01",
        "time": "12:30",
        "order_type": "dine-in",
        "products": [{"name": "Ice Cream", "quantity": 1, "price": 5.0}],
        "total": 5.0,
    }

    mock_settings = {"shop_name": "Test Creamery", "printer_template": "default"}

    html = renderer.render_bill(mock_bill_data, mock_settings, is_bill=True)

    try:
        png_path = generator.generate_png(html, "58mm")
    except Exception as e:
        error_str = str(e)
        if (
            "Executable doesn't exist" in error_str
            or "Please run the following command" in error_str
        ):
            pytest.skip("Playwright browser executable is not installed.")
            return
        raise e

    try:
        assert png_path is not None
        assert os.path.exists(png_path)
        assert os.path.getsize(png_path) > 0
    finally:
        if os.path.exists(png_path):
            os.remove(png_path)
        generator.close_browser()
