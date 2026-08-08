import os
import base64
import io
import logging
from typing import Any, Dict
from jinja2 import Environment, FileSystemLoader
import qrcode
from .template_manager import TemplateManager

logger = logging.getLogger(__name__)


class HTMLRenderer:
    """Renders HTML templates with Jinja2 and injects context."""

    def __init__(self, template_manager: TemplateManager):
        self.template_manager = template_manager
        # Set up Jinja2 environment pointing to the templates directory.
        # CRITICAL: encoding='utf-8' must be set explicitly — without it, Jinja2's
        # FileSystemLoader uses the Windows system default (cp1252/charmap) which
        # cannot encode ₹, regional language characters, or any non-Latin Unicode.
        self.env = Environment(
            loader=FileSystemLoader(self.template_manager.templates_dir, encoding="utf-8"),
            autoescape=True,
        )
        logger.info("Jinja2 Environment initialized for HTML rendering.")

    def render_bill(
        self, bill_data: Dict[str, Any], shop_settings: Dict[str, Any], is_bill: bool = True
    ) -> str:
        """
        Renders a bill or KOT template into static HTML.

        Args:
            bill_data: Dictionary containing normalized bill data
            shop_settings: Dictionary containing settings from database
            is_bill: Boolean to toggle between bill.html and kot.html

        Returns:
            Static HTML string
        """
        # Determine configured template
        template_name = shop_settings.get("printer_template", "default").strip().lower()
        if not self.template_manager.validate_template_exists(template_name):
            logger.warning(
                f"Configured template '{template_name}' not found. Falling back to 'default'."
            )
            template_name = "default"

        # Load CSS
        css_content = self.template_manager.load_css(template_name)

        # Context components
        # 1. Shop details
        shop = {
            "name": _safe_text(shop_settings.get("shop_name", "RESTAURANT")),
            "address": _safe_text(shop_settings.get("shop_address", "")),
            "contact": _safe_text(shop_settings.get("shop_contact", "")),
            "logo_base64": None,
        }

        # Handle Logo if configured
        logo_path = shop_settings.get("printer_logo_path")
        if logo_path and os.path.exists(logo_path):
            try:
                with open(logo_path, "rb") as f:
                    shop["logo_base64"] = base64.b64encode(f.read()).decode("utf-8")
            except Exception as e:
                logger.error(f"Error loading logo from path '{logo_path}': {e}")

        # 2. Bill / Items details
        products = bill_data.get("products") or bill_data.get("items") or []

        # Sanitize product names and string fields (guards against non-UTF-8 data
        # that could sneak in from older DB records or external sources)
        safe_products = []
        for p in products:
            safe_p = dict(p)
            name = _safe_text(p.get("name", ""))
            var_name = _safe_text(p.get("variation_name", "") or "")
            if var_name:
                v_suffix = f"({var_name})"
                if name.strip().lower().endswith(v_suffix.lower()):
                    idx = name.strip().lower().rfind(v_suffix.lower())
                    name = name.strip()[:idx].strip()
            safe_p["name"] = name
            safe_p["variation_name"] = var_name
            safe_p["specification"] = _safe_text(p.get("specification", "") or "")
            safe_products.append(safe_p)

        # Recalculate subtotal, discount and totals for display if not explicitly provided
        total = float(bill_data.get("total") or bill_data.get("total_amount") or 0.0)
        discount = float(bill_data.get("discount") or 0.0)

        # Subtotal calculation based on item prices (must match DB sum)
        calculated_subtotal = sum(
            float(p.get("price", 0)) * int(p.get("quantity", 1)) for p in safe_products
        )
        subtotal = float(
            bill_data.get("subtotal") or bill_data.get("sub_total") or calculated_subtotal
        )

        cgst = bill_data.get("cgst")
        sgst = bill_data.get("sgst")
        gst = bill_data.get("gst")
        tax = bill_data.get("tax")

        # Format time to HH:MM format
        raw_time = str(bill_data.get("time", "")).strip()
        formatted_time = raw_time
        if raw_time:
            parts = raw_time.split(":")
            if len(parts) >= 2:
                formatted_time = f"{parts[0].zfill(2)}:{parts[1][:2].zfill(2)}"

        # Format date to DD/MM/YY format
        raw_date = str(bill_data.get("date", "")).strip()
        formatted_date = raw_date
        if raw_date and "-" in raw_date:
            d_parts = raw_date.split("-")
            if len(d_parts) == 3:
                year = d_parts[0][-2:]
                month = d_parts[1].zfill(2)
                day = d_parts[2].zfill(2)
                formatted_date = f"{day}/{month}/{year}"

        bill = {
            "bill_no": bill_data.get("bill_no", "1"),
            "date": formatted_date,
            "time": formatted_time,
            "order_type": bill_data.get("order_type", "dine-in"),
            "table_no": _safe_text(bill_data.get("table_no", "") or ""),
            "customer_name": _safe_text(bill_data.get("customer_name", "") or ""),
            "payment_method": bill_data.get("payment_method", "CASH"),
            "today_token": bill_data.get("today_token"),
            "cashier": _safe_text(bill_data.get("cashier") or bill_data.get("cashier_name") or ""),
            "subtotal": subtotal,
            "discount": discount,
            "cgst": cgst,
            "sgst": sgst,
            "gst": gst,
            "tax": tax,
            "grand_total": total,
        }

        # 3. Footer details
        footer = {
            "message": _safe_text(
                shop_settings.get("printer_footer_msg", "Thank You! Visit Again.")
            ),
            "qr_code_base64": None,
        }

        # Generate QR code if requested (e.g. for payments or promo link)
        qr_data = shop_settings.get("printer_qr_data") or bill_data.get("qr_code_data")
        if qr_data:
            try:
                qr = qrcode.QRCode(version=1, box_size=10, border=1)
                qr.add_data(qr_data)
                qr.make(fit=True)
                qr_img = qr.make_image(fill_color="black", back_color="white")

                # Save QR to bytes buffer and encode
                img_buffer = io.BytesIO()
                qr_img.save(img_buffer, format="PNG")
                footer["qr_code_base64"] = base64.b64encode(img_buffer.getvalue()).decode("utf-8")
            except Exception as e:
                logger.error(f"Error generating QR code: {e}")

        # Compile and Render Jinja2 Template
        template_filename = "bill.html" if is_bill else "kot.html"
        resolved_path = self.template_manager.get_template_path(template_name, template_filename)
        rel_template_path = os.path.relpath(resolved_path, self.template_manager.templates_dir)
        template = self.env.get_template(rel_template_path.replace(os.path.sep, "/"))

        context = {
            "bill": bill,
            "shop": shop,
            "settings": shop_settings,
            "items": safe_products,
            "footer": footer,
            "css": css_content,
        }

        html_out = template.render(context)
        if "/* CSS_PLACEHOLDER */" in html_out:
            html_out = html_out.replace("/* CSS_PLACEHOLDER */", css_content)
        logger.info(f"HTML rendered successfully using template: '{template_name}'.")
        return html_out


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------


def _safe_text(value: Any) -> str:
    """
    Converts any value to a clean UTF-8-safe string.

    Encodes to UTF-8 then decodes back, replacing any unencodable characters
    with a safe '?' placeholder. This is a last-resort guard against binary
    data or non-standard encodings sneaking in from the database or external
    sources — it does NOT strip legitimate Unicode (₹, ñ, etc. are preserved).

    Args:
        value: Any value to convert to string

    Returns:
        UTF-8 safe string
    """
    if value is None:
        return ""
    text = str(value)
    # Round-trip through UTF-8 to catch any surrogate or invalid codepoints
    return text.encode("utf-8", errors="replace").decode("utf-8", errors="replace")
