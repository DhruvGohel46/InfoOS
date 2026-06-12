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
        self.commands.append(("bold_off", "\x1b\x21\x20"))
        return self

    def align_left(self):
        self.commands.append(("align_left", "\x1b\x21\x20"))
        return self

    def align_center(self):
        self.commands.append(("align_center", ""))
        return self

    def align_right(self):
        self.commands.append(("align_right", ""))
        return self

    def divider(self, char: str = "-"):
        self.bold_on()
        self.line(char * self.max_chars)
        self.bold_off()
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
        # Text size: 0.80 of previous (2x height) → 1x normal size
        # GS ! 0x00 = 1x width × 1x height (standard)
        stream.extend(b"\x1d!\x00")

        for cmd_type, val in self.commands:
            if cmd_type == "text":
                stream.extend(val.encode("utf-8", errors="ignore"))
            elif cmd_type == "bold_on":
                # ESC E 1 = emphasized, ESC G 1 = double-strike → Maximum bold effect
                stream.extend(b"\x1bE\x01\x1bG\x01")
            elif cmd_type == "bold_off":
                stream.extend(b"\x1bE\x00\x1bG\x00")
            elif cmd_type == "align_left":
                stream.extend(b"\x1ba\x00")
            elif cmd_type == "align_center":
                stream.extend(b"\x1ba\x01")
            elif cmd_type == "align_right":
                stream.extend(b"\x1ba\x02")
            elif cmd_type == "feed":
                stream.extend(b"\x1bd" + bytes([val]))
            elif cmd_type == "cut":
                stream.extend(b"\x1d\x56\x41\x01")

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
        builder.feed(0)

        # Header - center aligned
        builder.align_center()
        shop_name = settings.get("shop_name", "RESTAURANT")
        builder.bold_on().line(shop_name.upper()).bold_off()
        shop_contact = settings.get("shop_contact", "")
        if shop_contact:
            builder.line(f"Ph: {shop_contact}")

        builder.align_left()
        builder.divider()

        # Customer Name
        customer_name = bill_data.get("customer_name") or bill_data.get("customerName", "")
        if customer_name:
            builder.bold_on().line(f"Name: {customer_name}").bold_off()
            builder.divider()

        # Date & Order Type on same line (image: "Date: <DATE>    Pick-up")
        date_str = str(bill_data.get("date", datetime.now().strftime("%d-%m-%y")))
        order_type = str(bill_data.get("order_type") or bill_data.get("orderType") or "Dine-In")
        date_label = f"Date: {date_str}"
        pad = max_chars - len(date_label) - len(order_type)
        if pad < 1:
            pad = 1

        # Time
        time_str = str(bill_data.get("time", datetime.now().strftime("%H:%M")))

        # Cashier & Bill No on same line
        cashier = (
            bill_data.get("cashier")
            or bill_data.get("cashier_name")
            or bill_data.get("cashierName")
            or "Cashier"
        )
        bill_no = str(
            bill_data.get("bill_no")
            or bill_data.get("bill_number")
            or bill_data.get("billNumber")
            or "1"
        )
        cashier_part = f"Cashier: {cashier}"
        bill_no_part = f"Bill No.: {bill_no}"
        pad2 = max_chars - len(cashier_part) - len(bill_no_part)
        if pad2 < 1:
            pad2 = 1

        builder.bold_on()
        builder.line(f"{date_label}{' ' * pad}{order_type}")
        builder.line(f"Time: {time_str}")
        builder.line(f"{cashier_part}{' ' * pad2}{bill_no_part}")
        builder.bold_off()

        # Token No. — bold (image shows it bold and prominent)
        token_no = str(
            bill_data.get("token_no")
            or bill_data.get("tokenNumber")
            or bill_data.get("today_token")
            or "1"
        )
        builder.bold_on().line(f"Token No.: {token_no}").bold_off()
        builder.divider()

        # Column widths
        if settings["is_80mm"]:
            item_w, qty_w, rate_w, amt_w = 20, 6, 10, 12
        else:
            item_w, qty_w, rate_w, amt_w = 12, 4, 7, 9

        builder.bold_on()
        builder.line(f"{'Item':<{item_w}}{'Qty.':>{qty_w}}{'Price':>{rate_w}}{'Amount':>{amt_w}}")
        builder.bold_off()
        builder.divider()

        # Products
        total_qty = 0
        calculated_subtotal = 0.0
        for product in bill_data.get("products") or bill_data.get("items") or []:
            name = str(product.get("name", "Item"))
            qty = int(product.get("quantity", 1))
            price = float(product.get("price", 0))
            amt = qty * price
            specification = (
                product.get("specification") or product.get("spec") or product.get("specs") or ""
            )
            total_qty += qty
            calculated_subtotal += amt

            # Wrap long item names
            chunks = textwrap.wrap(name, item_w) or [""]
            chunks = [c[:item_w] for c in chunks]

            builder.bold_on()
            builder.bold_on()
            builder.line(
                f"{chunks[0]:<{item_w}}{qty:>{qty_w}}{price:>{rate_w}.2f}{amt:>{amt_w}.2f}"
            )
            for chunk in chunks[1:]:
                builder.line(f"{chunk:<{item_w}}")
            if specification:
                builder.line(f"({specification})")
            builder.bold_off()
            builder.bold_off()
        builder.divider()

        # Totals — Total Qty and SubTotal on same line (matching image)
        qty_total = bill_data.get("totalQty") or bill_data.get("total_qty") or total_qty
        subtotal = float(
            bill_data.get("subtotal") or bill_data.get("sub_total") or calculated_subtotal
        )
        total_qty_str = f"Total Qty: {qty_total}"
        sub_total_str = f"Sub Total {subtotal:.2f}"
        pad3 = max_chars - len(total_qty_str) - len(sub_total_str)
        if pad3 < 1:
            pad3 = 1
        builder.bold_on()
        builder.line(f"{total_qty_str}{' ' * pad3}{sub_total_str}")
        builder.bold_off()

        # Optional: GST
        cgst = bill_data.get("cgst")
        sgst = bill_data.get("sgst")
        gst = bill_data.get("gst")
        tax = bill_data.get("tax")
        builder.bold_on()
        if cgst is not None or sgst is not None:
            if cgst is not None:
                builder.line(f"CGST: {float(cgst):.2f}")
            if sgst is not None:
                builder.line(f"SGST: {float(sgst):.2f}")
        elif gst is not None:
            builder.line(f"GST: {float(gst):.2f}")
        elif tax is not None:
            builder.line(f"Tax: {float(tax):.2f}")
        elif settings.get("gst_enabled"):
            rate = settings.get("gst_rate", 5.0)
            cgst_val = (subtotal * (rate / 2.0)) / 100.0
            builder.line(f"CGST ({rate / 2:.1f}%): {cgst_val:.2f}")
            builder.line(f"SGST ({rate / 2:.1f}%): {cgst_val:.2f}")
        builder.bold_off()

        # Optional: Discount
        discount = bill_data.get("discount")
        if discount is not None and float(discount) > 0:
            builder.bold_on()
            builder.line(f"Discount: -{float(discount):.2f}")
            builder.bold_off()

        # Grand Total — bold, with ₹ inline (matching image: "Grand Total ₹ <AMOUNT>")
        grand_total = float(
            bill_data.get("grandTotal")
            or bill_data.get("grand_total")
            or bill_data.get("total")
            or subtotal
        )
        builder.divider()
        builder.bold_on()
        builder.line(f"GRAND TOTAL: {grand_total:.2f}")
        builder.bold_off()
        builder.divider()

        builder.feed(0)
        builder.cut()

        return builder

    def _build_kot_receipt(self, bill_data: Dict, settings: Dict) -> ReceiptBuilder:
        """Build Kitchen Order Ticket (KOT) receipt to look exactly like traditional kitchen slips."""
        max_chars = 48 if settings["is_80mm"] else 32
        builder = ReceiptBuilder(max_chars)
        builder.feed(0)

        # Date & Time at top, center aligned
        builder.align_center()
        builder.bold_on()
        date_str = str(bill_data.get("date", datetime.now().strftime("%d/%m/%y")))
        time_str = str(bill_data.get("time", datetime.now().strftime("%H:%M")))
        builder.line(f"{date_str} {time_str}")
        builder.bold_off()

        # KOT Number - large and bold
        kot_no = str(
            bill_data.get("token_no")
            or bill_data.get("tokenNumber")
            or bill_data.get("today_token")
            or bill_data.get("bill_no")
            or "1"
        )
        builder.bold_on()
        builder.line(f"KOT - {kot_no}")
        builder.bold_off()

        # Order Type
        order_type = str(
            bill_data.get("order_type") or bill_data.get("orderType") or "PICK UP"
        ).upper()
        builder.bold_on()
        builder.line(order_type)
        builder.bold_off()

        builder.align_left()
        builder.divider()

        # Item list columns
        if settings["is_80mm"]:
            item_w = 38
            qty_w = 10
        else:
            item_w = 24
            qty_w = 8
        header = f"{'Item':<{item_w}}{'Qty':>{qty_w}}"
        builder.bold_on()
        builder.line(header)
        builder.bold_off()
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

            # Wrap name and truncate to prevent overflow
            chunks = textwrap.wrap(name, item_w)
            if not chunks:
                chunks = [""]
            chunks = [c[:item_w] for c in chunks]

            # Print all lines of item entry and its quantity in bold for high kitchen visibility
            builder.bold_on()
            builder.text(f"{chunks[0]:<{item_w}}")
            builder.line(f"{qty_str:>{qty_w}}")

            # Print remaining chunks of wrapped item name
            for chunk in chunks[1:]:
                builder.line(f"{chunk:<{item_w}}")
            builder.bold_off()

        builder.divider()

        # Special Notes (if present)
        notes = bill_data.get("notes") or bill_data.get("special_notes") or bill_data.get("remarks")
        if notes:
            builder.bold_on().line("Special Notes").bold_off()
            builder.bold_on()
            for note_line in str(notes).split("\n"):
                for wrapped_note in textwrap.wrap(note_line, max_chars):
                    builder.line(wrapped_note)
            builder.bold_off()
            builder.divider()

        # Total Items
        builder.bold_on()
        builder.line(f"TOTAL ITEMS: {len(products)}")
        builder.bold_off()
        builder.divider()

        builder.feed(0)
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
