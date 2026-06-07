"""
services/printer_service.py
===========================
Thermal-printer integration for Windows POS terminals.

Platform notes
--------------
* win32print / win32ui / pywintypes are Windows-ONLY packages shipped as
  part of the `pywin32` distribution.  They are NOT available on Linux or
  macOS and must therefore NEVER be imported at module load time.
* On non-Windows hosts (GitHub Actions, developer laptops, Docker containers)
  the service degrades gracefully: every public method returns a safe
  fallback value so callers never crash.
* On Windows, if pywin32 is not installed (e.g. a stripped-down venv) the
  same fallback path is taken, and a warning is logged.

Packaging targets
-----------------
* GitHub Actions CI  — Linux, pywin32 absent  → graceful degradation
* Windows POS terminal — pywin32 present        → full print support
* PyInstaller / Electron bundle — Windows only  → full print support
"""

import platform
import re
import textwrap
from datetime import datetime
from typing import Dict, Optional, Any, List

from .db_service import DatabaseService

# ---------------------------------------------------------------------------
# Platform helpers
# ---------------------------------------------------------------------------


def is_windows() -> bool:
    """Return True when running on Microsoft Windows."""
    return platform.system() == "Windows"


def load_win32_modules() -> Optional[Dict]:
    """
    Attempt to import Windows printer modules at call time (lazy import).

    Returns a dict of loaded modules on success, or None when:
      - the host OS is not Windows, OR
      - pywin32 is not installed in the current environment.
    """
    if not is_windows():
        return None

    try:
        import win32print  # noqa: PLC0415  (intentional lazy import)
        import win32ui  # noqa: PLC0415
        import pywintypes  # noqa: PLC0415

        return {
            "win32print": win32print,
            "win32ui": win32ui,
            "pywintypes": pywintypes,
        }

    except ImportError:
        return None


# ---------------------------------------------------------------------------
# ESC/POS Receipt Builder
# ---------------------------------------------------------------------------


class ReceiptBuilder:
    """Helper class to build styled monospace thermal receipts."""

    def __init__(self, max_chars: int):
        self.max_chars = max_chars
        self.commands: List[tuple] = []

    def text(self, val: str):
        self.commands.append(("text", val))
        return self

    def line(self, val: str = ""):
        self.commands.append(("text", val + "\n"))
        return self

    def bold_on(self):
        self.commands.append(("bold_on", ""))
        return self

    def bold_off(self):
        self.commands.append(("bold_off", ""))
        return self

    def align_left(self):
        self.commands.append(("align_left", ""))
        return self

    def align_center(self):
        self.commands.append(("align_center", ""))
        return self

    def align_right(self):
        self.commands.append(("align_right", ""))
        return self

    def double_height_on(self):
        self.commands.append(("double_height_on", ""))
        return self

    def double_height_off(self):
        self.commands.append(("double_height_off", ""))
        return self

    def divider(self, char: str = "-"):
        self.commands.append(("text", (char * self.max_chars) + "\n"))
        return self

    def feed(self, lines: int = 1):
        self.commands.append(("feed", lines))
        return self

    def cut(self):
        self.commands.append(("cut", ""))
        return self

    def build_plain_text(self) -> str:
        """Generate a plain text representation of the receipt for debugging."""
        out = []
        for cmd_type, val in self.commands:
            if cmd_type == "text":
                out.append(val)
            elif cmd_type == "feed":
                out.append("\n" * val)
        return "".join(out)

    def build_esc_pos_bytes(self) -> bytes:
        """Compile the receipt commands into raw ESC/POS byte sequence."""
        stream = bytearray()

        # Initialize printer
        stream.extend(b"\x1b@")
        # Codepage 62 (UTF-8) on many thermal printers
        stream.extend(b"\x1bt\x3e")

        for cmd_type, val in self.commands:
            if cmd_type == "text":
                stream.extend(val.encode("utf-8", errors="ignore"))
            elif cmd_type == "bold_on":
                stream.extend(b"\x1bE\x01")
            elif cmd_type == "bold_off":
                stream.extend(b"\x1bE\x00")
            elif cmd_type == "align_left":
                stream.extend(b"\x1ba\x00")
            elif cmd_type == "align_center":
                stream.extend(b"\x1ba\x01")
            elif cmd_type == "align_right":
                stream.extend(b"\x1ba\x02")
            elif cmd_type == "double_height_on":
                stream.extend(b"\x1d!\x01")
            elif cmd_type == "double_height_off":
                stream.extend(b"\x1d!\x00")
            elif cmd_type == "feed":
                stream.extend(b"\x1bd" + bytes([val]))
            elif cmd_type == "cut":
                # Standard full cut
                stream.extend(b"\x1d\x56\x41\x03")

        return bytes(stream)


# ---------------------------------------------------------------------------
# Service class
# ---------------------------------------------------------------------------


class PrinterService:
    """Thermal printer service for bill / KOT printing."""

    def __init__(self):
        self.db_service = DatabaseService()
        self.printer_name: Optional[str] = self._find_champ_printer()

    # ------------------------------------------------------------------
    # Settings
    # ------------------------------------------------------------------

    def _get_settings(self) -> Dict[str, Any]:
        """Fetch current printer settings from the database."""
        try:
            settings = self.db_service.get_all_settings()
        except Exception as exc:
            print(f"[PrinterService] Error fetching settings: {exc}")
            settings = {}

        return {
            "shop_name": settings.get("shop_name", "Burger Bhau (Kothariya)"),
            "printer_width": settings.get("printer_width", "58mm"),
            "printer_enabled": settings.get("printer_enabled", "false") == "true",
            "shop_address": settings.get("shop_address", ""),
            "shop_contact": settings.get("shop_contact", ""),
            "is_80mm": str(settings.get("printer_width", "58mm")).strip().lower() == "80mm",
            "gst_enabled": settings.get("gst_enabled", "false") == "true",
            "gst_rate": float(settings.get("gst_rate", "5")),
            "discount_enabled": settings.get("discount_enabled", "false") == "true",
            "mobile_enabled": settings.get("mobile_enabled", "false") == "true",
        }

    # ------------------------------------------------------------------
    # Printer discovery  (Windows only)
    # ------------------------------------------------------------------

    def _find_champ_printer(self) -> Optional[str]:
        """Discover a Champ RP-series thermal printer from the Windows spooler."""
        modules = load_win32_modules()
        if not modules:
            return None

        win32print = modules["win32print"]
        try:
            printers = win32print.EnumPrinters(
                win32print.PRINTER_ENUM_LOCAL | win32print.PRINTER_ENUM_CONNECTIONS
            )
            for printer in printers:
                printer_name = printer[2]
                if "champ" in printer_name.lower() or "rp" in printer_name.lower():
                    return printer_name

            return win32print.GetDefaultPrinter()

        except Exception as exc:
            print(f"[PrinterService] Error during printer discovery: {exc}")
            return None

    # ------------------------------------------------------------------
    # Public print methods
    # ------------------------------------------------------------------

    def print_bill(self, bill_data: Dict) -> bool:
        """Send a formatted customer bill to the thermal printer."""
        try:
            settings = self._get_settings()
            if not settings["printer_enabled"]:
                return True

            builder = self._build_bill_receipt(bill_data, settings)

            modules = load_win32_modules()
            if not modules or not self.printer_name:
                # Safe fallback to stdout printing
                _log_unavailable("print_bill")
                print("=== THERMAL PRINTER (BILL FALLBACK) ===")
                print(builder.build_plain_text())
                return True

            esc_pos_bytes = builder.build_esc_pos_bytes()
            return self._send_to_printer(esc_pos_bytes, settings, "Bill")

        except Exception as exc:
            print(f"[PrinterService] Error printing bill: {exc}")
            return False

    def print_kot(self, bill_data: Dict) -> bool:
        """Send a Kitchen Order Ticket (KOT) to the thermal printer."""
        try:
            settings = self._get_settings()
            if not settings["printer_enabled"]:
                return True

            builder = self._build_kot_receipt(bill_data, settings)

            modules = load_win32_modules()
            if not modules or not self.printer_name:
                _log_unavailable("print_kot")
                print("=== THERMAL PRINTER (KOT FALLBACK) ===")
                print(builder.build_plain_text())
                return True

            esc_pos_bytes = builder.build_esc_pos_bytes()
            return self._send_to_printer(esc_pos_bytes, settings, "KOT")

        except Exception as exc:
            print(f"[PrinterService] Error printing KOT: {exc}")
            return False

    # ------------------------------------------------------------------
    # Receipt Builders
    # ------------------------------------------------------------------

    def _build_bill_receipt(self, bill_data: Dict, settings: Dict) -> ReceiptBuilder:
        """Build styled bill receipt using ReceiptBuilder."""
        max_chars = 48 if settings["is_80mm"] else 32
        builder = ReceiptBuilder(max_chars)

        # Header - center aligned
        builder.align_center()
        shop_name = settings.get("shop_name", "Burger Bhau (Kothariya)")
        builder.bold_on().line(shop_name.upper()).bold_off()

        shop_address = settings.get("shop_address", "")
        if shop_address:
            for addr_line in textwrap.wrap(shop_address, max_chars):
                builder.line(addr_line)

        shop_contact = settings.get("shop_contact", "")
        if shop_contact:
            builder.line(f"Ph: {shop_contact}")

        builder.align_left()
        builder.divider()

        # Customer Name
        customer_name = bill_data.get("customer_name") or bill_data.get("customerName")
        if customer_name:
            builder.line(f"Customer Name: {customer_name}")

        # Customer Mobile
        mobile = bill_data.get("customer_mobile") or bill_data.get("mobile")
        if mobile:
            builder.line(f"Mobile: {mobile}")

        # Date & Time
        date_str = str(bill_data.get("date", datetime.now().strftime("%d-%m-%y")))
        time_str = str(bill_data.get("time", datetime.now().strftime("%H:%M")))
        builder.line(f"Date: {date_str}  Time: {time_str}")

        # Order Type
        order_type = bill_data.get("order_type") or bill_data.get("orderType") or "Dine-In"
        builder.line(f"Order Type: {order_type}")

        # Cashier
        cashier = (
            bill_data.get("cashier")
            or bill_data.get("cashier_name")
            or bill_data.get("cashierName")
            or "Cashier"
        )
        builder.line(f"Cashier: {cashier}")

        # Token No. (bold)
        token_no = str(
            bill_data.get("token_no")
            or bill_data.get("tokenNumber")
            or bill_data.get("today_token")
            or "1"
        )
        builder.text("Token No.: ").bold_on().line(token_no).bold_off()

        # Bill No. (bold)
        bill_no = str(
            bill_data.get("bill_no")
            or bill_data.get("bill_number")
            or bill_data.get("billNumber")
            or "1"
        )
        builder.text("Bill No.: ").bold_on().line(bill_no).bold_off()

        builder.divider()

        # Column widths
        if settings["is_80mm"]:
            item_w, qty_w, rate_w, amt_w = 22, 4, 10, 12
        else:
            item_w, qty_w, rate_w, amt_w = 14, 3, 7, 8

        # Table Header
        header = f"{'Item':<{item_w}}{'Qty':>{qty_w}}{'Rate':>{rate_w}}{'Amt':>{amt_w}}"
        builder.line(header)
        builder.divider()

        # Product Rows
        products = bill_data.get("products") or bill_data.get("items") or []
        total_qty = 0
        calculated_subtotal = 0.0

        for product in products:
            name = str(product.get("name", "Item"))
            qty = int(product.get("quantity", 1))
            price = float(product.get("price", 0))
            line_amt = price * qty

            total_qty += qty
            calculated_subtotal += line_amt

            qty_str = str(qty)
            rate_str = f"{price:.2f}"
            amt_str = f"{line_amt:.2f}"

            # Auto wrap long item names
            chunks = textwrap.wrap(name, item_w)
            if not chunks:
                chunks = [""]

            first_line = (
                f"{chunks[0]:<{item_w}}{qty_str:>{qty_w}}{rate_str:>{rate_w}}{amt_str:>{amt_w}}"
            )
            builder.line(first_line)

            for chunk in chunks[1:]:
                builder.line(f"{chunk:<{item_w}}")

        builder.divider()

        # Totals Section
        qty_total = bill_data.get("totalQty") or bill_data.get("total_qty") or total_qty
        builder.line(f"Total Qty: {qty_total}")

        sub_total_val = (
            bill_data.get("subtotal") or bill_data.get("sub_total") or calculated_subtotal
        )
        builder.line(f"Sub Total: ₹{float(sub_total_val):.2f}")

        # Optional: GST
        cgst = bill_data.get("cgst")
        sgst = bill_data.get("sgst")
        gst = bill_data.get("gst")
        tax = bill_data.get("tax")

        if cgst is not None or sgst is not None:
            if cgst is not None:
                builder.line(f"CGST: ₹{float(cgst):.2f}")
            if sgst is not None:
                builder.line(f"SGST: ₹{float(sgst):.2f}")
        elif gst is not None:
            builder.line(f"GST: ₹{float(gst):.2f}")
        elif tax is not None:
            builder.line(f"Tax: ₹{float(tax):.2f}")
        elif settings.get("gst_enabled"):
            rate = settings.get("gst_rate", 5.0)
            cgst_val = (sub_total_val * (rate / 2.0)) / 100.0
            sgst_val = cgst_val
            builder.line(f"CGST ({rate/2:.1f}%): ₹{cgst_val:.2f}")
            builder.line(f"SGST ({rate/2:.1f}%): ₹{sgst_val:.2f}")

        # Optional: Discount
        discount = bill_data.get("discount")
        if discount is not None and float(discount) > 0:
            builder.line(f"Discount: -₹{float(discount):.2f}")

        builder.divider()

        # Grand Total
        grand_total = (
            bill_data.get("grandTotal")
            or bill_data.get("grand_total")
            or bill_data.get("total")
            or calculated_subtotal
        )
        builder.align_center()
        builder.line("GRAND TOTAL")
        builder.double_height_on().bold_on()
        builder.line(f"₹{float(grand_total):.2f}")
        builder.double_height_off().bold_off()
        builder.align_left()
        builder.divider()

        # Payment Mode
        pay_mode = (
            bill_data.get("paymentMode")
            or bill_data.get("payment_mode")
            or bill_data.get("payment_method")
            or "Cash"
        )
        builder.line(f"Payment Mode: {pay_mode}")
        builder.divider()

        # Footer
        builder.align_center()
        builder.line("Thanks")
        builder.line("Visit Again")

        builder.feed(3)
        builder.cut()

        return builder

    def _build_kot_receipt(self, bill_data: Dict, settings: Dict) -> ReceiptBuilder:
        """Build Kitchen Order Ticket (KOT) receipt to look exactly like traditional kitchen slips."""
        max_chars = 32  # Forced 58mm for KOT
        builder = ReceiptBuilder(max_chars)

        # Date & Time at top, center aligned
        builder.align_center()
        date_str = str(bill_data.get("date", datetime.now().strftime("%d/%m/%y")))
        time_str = str(bill_data.get("time", datetime.now().strftime("%H:%M")))
        builder.line(f"{date_str} {time_str}")
        builder.line()

        # KOT Number - large and bold
        kot_no = str(
            bill_data.get("token_no")
            or bill_data.get("tokenNumber")
            or bill_data.get("today_token")
            or bill_data.get("bill_no")
            or "1"
        )
        builder.double_height_on().bold_on()
        builder.line(f"KOT - {kot_no}")
        builder.double_height_off().bold_off()
        builder.line()

        # Order Type - large and bold
        order_type = str(
            bill_data.get("order_type") or bill_data.get("orderType") or "PICK UP"
        ).upper()
        builder.double_height_on().bold_on()
        builder.line(order_type)
        builder.double_height_off().bold_off()
        builder.line()

        builder.align_left()
        builder.divider()

        # Item list columns
        item_w = 24
        qty_w = 8
        header = f"{'Item':<{item_w}}{'Qty':>{qty_w}}"
        builder.line(header)
        builder.divider()

        products = bill_data.get("products") or bill_data.get("items") or []
        total_qty = 0

        for product in products:
            name = str(product.get("name", "Item"))
            qty = int(product.get("quantity", 1))
            total_qty += qty

            if qty > 1:
                qty_str = f"** {qty} **"
            else:
                qty_str = "1"

            # Wrap name
            chunks = textwrap.wrap(name, item_w)
            if not chunks:
                chunks = [""]

            # Print first line of item name in bold for high kitchen visibility
            builder.bold_on()
            builder.text(f"{chunks[0]:<{item_w}}")
            builder.bold_off()

            if qty > 1:
                builder.bold_on()
            builder.line(f"{qty_str:>{qty_w}}")
            if qty > 1:
                builder.bold_off()

            # Print remaining chunks of wrapped item name
            for chunk in chunks[1:]:
                builder.bold_on()
                builder.line(f"{chunk:<{item_w}}")
                builder.bold_off()
            builder.line()  # Line space for clean item separation

        builder.divider()

        # Special Notes (if present)
        notes = (
            bill_data.get("notes") or bill_data.get("special_notes") or bill_data.get("remarks")
        )
        if notes:
            builder.line("Special Notes")
            builder.bold_on()
            for note_line in str(notes).split("\n"):
                for wrapped_note in textwrap.wrap(note_line, max_chars):
                    builder.line(wrapped_note)
            builder.bold_off()
            builder.divider()

        # Total Items
        builder.line(f"TOTAL ITEMS: {len(products)}")
        builder.divider()

        # Print Time at bottom
        builder.line("Print Time:")
        builder.line(time_str)

        builder.feed(3)
        builder.cut()

        return builder

    # ------------------------------------------------------------------
    # Low-level printer I/O
    # ------------------------------------------------------------------

    def _send_to_printer(self, payload: Any, settings: Dict, job_name: str = "PrintJob") -> bool:
        """Spool a raw ESC/POS byte stream or plain text to the Windows print queue."""
        modules = load_win32_modules()
        if not modules:
            _log_unavailable("_send_to_printer")
            return True

        win32print = modules["win32print"]

        try:
            hPrinter = win32print.OpenPrinter(self.printer_name)
            try:
                win32print.StartDocPrinter(hPrinter, 1, (job_name, None, "RAW"))
                try:
                    win32print.StartPagePrinter(hPrinter)

                    if isinstance(payload, bytes):
                        text_bytes = payload
                    else:
                        safe_text = self._sanitize_for_thermal(payload)
                        text_bytes = safe_text.encode("utf-8", errors="ignore")

                    win32print.WritePrinter(hPrinter, text_bytes)
                    win32print.EndPagePrinter(hPrinter)
                    return True

                finally:
                    win32print.EndDocPrinter(hPrinter)
            finally:
                win32print.ClosePrinter(hPrinter)

        except Exception as exc:
            print(f"[PrinterService] Error spooling job '{job_name}': {exc}")
            return False

    def _sanitize_for_thermal(self, text: str) -> str:
        """
        Keep output printer-safe and high-contrast for common ESC/POS firmware.
        Retains ASCII, newlines, Rupee symbol, and Devanagari (Hindi) range.
        """
        clean = text.replace("\r\n", "\n").replace("\r", "\n")
        # Keep ASCII, newlines, Devanagari (Hindi) range \u0900-\u097F, and Rupee \u20B9
        clean = re.sub(r"[^\n\r\x20-\x7E\u0900-\u097F\u20B9]", "", clean)
        return clean


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------


def _log_unavailable(caller: str) -> None:
    """Emit a structured warning when Windows printer modules are unavailable."""
    msg = (
        f"[PrinterService.{caller}] Windows printer modules (pywin32) are "
        "unavailable on this platform. Spooling to stdout/fallback instead."
    )
    try:
        from flask import current_app  # noqa: PLC0415

        current_app.logger.warning(msg)
    except RuntimeError:
        print(msg)

