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
from datetime import datetime
from typing import Dict, Optional

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

    This function is called inside methods that need printer access, never
    at module import time, so the service is always importable on Linux/macOS.
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
        # pywin32 not installed even though we're on Windows (stripped venv,
        # CI running on Windows, etc.).  Degrade gracefully.
        return None


# ---------------------------------------------------------------------------
# Service class
# ---------------------------------------------------------------------------


class PrinterService:
    """Thermal printer service for bill / KOT printing.

    Public methods always return a value safe for callers to inspect:
      - print_bill / print_kot  → bool  (True = success / skipped gracefully)
      - _send_to_printer        → bool
    On platforms without pywin32 every printing call short-circuits with a
    warning log and returns True (i.e. "handled, do not fail the request").
    """

    def __init__(self):
        # Must match Settings API (PostgreSQL / SQLAlchemy), not legacy SQLite
        self.db_service = DatabaseService()
        # Printer discovery is deferred to the first print call on Windows.
        # On non-Windows hosts this stays None and the fallback path is used.
        self.printer_name: Optional[str] = self._find_champ_printer()

    # ------------------------------------------------------------------
    # Settings
    # ------------------------------------------------------------------

    def _get_settings(self) -> Dict:
        """Fetch current printer settings from the database."""
        settings = self.db_service.get_all_settings()
        return {
            "shop_name": settings.get("shop_name", "Burger Bhau"),
            "printer_width": settings.get("printer_width", "58mm"),
            "printer_enabled": settings.get("printer_enabled", "false") == "true",
            "shop_address": settings.get("shop_address", ""),
            "shop_contact": settings.get("shop_contact", ""),
            "is_80mm": str(settings.get("printer_width", "58mm")).strip().lower() == "80mm",
        }

    # ------------------------------------------------------------------
    # Printer discovery  (Windows only)
    # ------------------------------------------------------------------

    def _find_champ_printer(self) -> Optional[str]:
        """
        Discover a Champ RP-series thermal printer from the Windows spooler.

        Returns the printer name string on success, or None if:
          - not running on Windows,
          - pywin32 not installed, or
          - any OS-level error occurs.
        """
        modules = load_win32_modules()
        if not modules:
            # Non-Windows host or pywin32 absent — printer discovery skipped.
            return None

        win32print = modules["win32print"]
        try:
            printers = win32print.EnumPrinters(
                win32print.PRINTER_ENUM_LOCAL | win32print.PRINTER_ENUM_CONNECTIONS
            )
            for printer in printers:
                printer_name = printer[2]  # Index 2 holds the printer name
                if "champ" in printer_name.lower() or "rp" in printer_name.lower():
                    return printer_name

            # Fall back to the system default printer
            return win32print.GetDefaultPrinter()

        except Exception as exc:
            print(f"[PrinterService] Error during printer discovery: {exc}")
            return None

    # ------------------------------------------------------------------
    # Public print methods
    # ------------------------------------------------------------------

    def print_bill(self, bill_data: Dict) -> bool:
        """
        Send a formatted customer bill to the thermal printer.

        Returns True on success or when printing is disabled / unavailable.
        Returns False only when a genuine print error occurs on Windows.
        """
        try:
            settings = self._get_settings()
            if not settings["printer_enabled"]:
                return True

            # Guard: ensure win32 modules are available before attempting print
            modules = load_win32_modules()
            if not modules:
                _log_unavailable("print_bill")
                return True  # Degrade gracefully — do not fail the request

            bill_text = self._generate_bill_text(bill_data, settings)

            if self.printer_name:
                return self._send_to_printer(bill_text, settings, "Bill")

            # No printer configured — echo to stdout (useful for dev debugging)
            print("=== THERMAL PRINTER (BILL) ===")
            print(bill_text)
            return True

        except Exception as exc:
            print(f"[PrinterService] Error printing bill: {exc}")
            return False

    def print_kot(self, bill_data: Dict) -> bool:
        """
        Send a Kitchen Order Ticket (KOT) to the thermal printer.

        Returns True on success or when printing is disabled / unavailable.
        Returns False only when a genuine print error occurs on Windows.
        """
        try:
            settings = self._get_settings()
            if not settings["printer_enabled"]:
                return True

            # Guard: ensure win32 modules are available before attempting print
            modules = load_win32_modules()
            if not modules:
                _log_unavailable("print_kot")
                return True  # Degrade gracefully — do not fail the request

            kot_text = self._generate_kot_text(bill_data, settings)

            if self.printer_name:
                return self._send_to_printer(kot_text, settings, "KOT")

            print("=== THERMAL PRINTER (KOT) ===")
            print(kot_text)
            return True

        except Exception as exc:
            print(f"[PrinterService] Error printing KOT: {exc}")
            return False

    # ------------------------------------------------------------------
    # Text generation  (platform-independent, pure Python)
    # ------------------------------------------------------------------

    def _generate_bill_text(self, bill_data: Dict, settings: Dict) -> str:
        """Generate formatted customer bill text."""
        max_chars = 48 if settings["is_80mm"] else 32
        lines = []

        # Header
        lines.append(self._center_text(settings["shop_name"].upper(), max_chars))
        if settings["shop_contact"]:
            lines.append(self._center_text(f"Ph: {settings['shop_contact']}", max_chars))

        # Bill metadata
        date_str = str(bill_data.get("date", datetime.now().strftime("%d-%m-%y")))
        time_str = str(bill_data.get("time", datetime.now().strftime("%H:%M")))
        bill_no = str(bill_data.get("bill_no", ""))
        customer_name = str(bill_data.get("customer_name", "")).strip()

        lines.append("-" * max_chars)
        if settings["is_80mm"]:
            lines.append(f"Bill No: {bill_no}  Date: {date_str}  Time: {time_str}")
        else:
            lines.append(f"Bill No: {bill_no}")
            lines.append(f"Date: {date_str}  Time: {time_str}")
        
        if customer_name:
            lines.append(f"Customer: {customer_name[: max_chars - 10]}")

        # Column headers
        if settings["is_80mm"]:
            # 23 + 1 + 4 + 1 + 8 + 1 + 10 = 48 chars
            name_w, qty_w, price_w, total_w = 23, 4, 8, 10
            header = f"{'Item':<{name_w}} {'Qty':>{qty_w}} {'Rate':>{price_w}} {'Amt':>{total_w}}"
            lines.append(header)
            lines.append("-" * max_chars)
            
            # Product rows (Table style for 80mm)
            for product in bill_data.get("products", []):
                name = str(product["name"])
                qty = str(product["quantity"])
                price = f"{float(product['price']):.2f}"
                total = f"{float(product['price']) * float(product['quantity']):.2f}"
                chunks = [name[i : i + name_w] for i in range(0, len(name), name_w)] or [""]
                lines.append(f"{chunks[0]:<{name_w}} {qty:>{qty_w}} {price:>{price_w}} {total:>{total_w}}")
                for extra_chunk in chunks[1:]:
                    lines.append(f"{extra_chunk:<{name_w}}")
        else:
            # 2-line layout for 58mm (Name on top, details below)
            # Remove the extra line divider here to save space
            for product in bill_data.get("products", []):
                name = str(product["name"]).upper()
                qty = str(product["quantity"])
                price = f"{float(product['price']):.2f}"
                total = f"{float(product['price']) * float(product['quantity']):.2f}"
                
                lines.append(name)
                # Details line: "  2 x 50.00         100.00"
                details = f"  {qty} x {price}"
                amt_str = f"{total}"
                
                # Ensure it fits exactly in max_chars (32) without wrapping
                spacing = max_chars - len(details) - len(amt_str)
                if spacing < 1:
                    # Truncate details if name/qty/price is somehow too long
                    details = details[:max_chars - len(amt_str) - 1]
                    spacing = 1
                lines.append(details + (" " * spacing) + amt_str)

        lines.append("-" * max_chars)
        total_val = f"{float(bill_data.get('total', 0)):,.2f}"
        if settings["is_80mm"]:
            # 30 + 18 = 48 chars
            lines.append(f"{'Grand Total':<30}{total_val:>18}")
        else:
            # 18 + 14 = 32 chars
            lines.append(f"{'Grand Total':<18}{total_val:>14}")
        lines.append("-" * max_chars)
        lines.append(self._center_text("Thank You!", max_chars))

        return "\n".join(lines)

    def _generate_kot_text(self, bill_data: Dict, settings: Dict) -> str:
        """Generate Kitchen Order Ticket (KOT) with item + qty only."""
        max_chars = 48 if settings["is_80mm"] else 32
        lines = []

        lines.append(self._center_text("KITCHEN ORDER TICKET", max_chars))
        bill_no = str(bill_data.get("bill_no", ""))
        time_str = str(bill_data.get("time", datetime.now().strftime("%H:%M")))
        date_str = str(bill_data.get("date", datetime.now().strftime("%d-%m-%y")))

        lines.append("-" * max_chars)
        if settings["is_80mm"]:
            lines.append(f"Bill No: {bill_no}  Date: {date_str}  Time: {time_str}")
        else:
            lines.append(f"Bill No: {bill_no}")
            lines.append(f"Date: {date_str}  Time: {time_str}")
        lines.append("=" * max_chars)

        # KOT: strictly item + quantity only (no price / amount fields).
        total_qty = sum(int(p.get("quantity", 0)) for p in bill_data.get("products", []))

        if settings["is_80mm"]:
            name_w, qty_w = 39, 8
            header = f"{'ITEM NAME':<{name_w}} {'QTY':>{qty_w}}"
            lines.append(header)
            lines.append("-" * max_chars)
            for product in bill_data.get("products", []):
                name = str(product["name"]).upper()
                qty_val = int(product.get("quantity", 0))
                qty = f"x{qty_val}"
                chunks = [name[i : i + name_w] for i in range(0, len(name), name_w)] or [""]
                lines.append(f"{chunks[0]:<{name_w}} {qty:>{qty_w}}")
                for extra_chunk in chunks[1:]:
                    lines.append(f"{extra_chunk:<{name_w}}")
        else:
            # Clean list for 58mm KOT
            for product in bill_data.get("products", []):
                name = str(product["name"]).upper()
                qty_val = int(product.get("quantity", 0))
                qty = f"x{qty_val}"
                
                # Check if it fits in one line (need at least 1 space)
                if len(name) + len(qty) + 1 <= max_chars:
                    lines.append(f"{name:<{max_chars-len(qty)}}{qty}")
                else:
                    lines.append(name)
                    lines.append(f"{'':<{max_chars-len(qty)}}{qty}")

        lines.append("=" * max_chars)
        summary = f"Items: {len(bill_data.get('products', []))}  Qty: {total_qty}"
        lines.append(self._center_text(summary, max_chars))
        return "\n".join(lines)

    def _center_text(self, text: str, width: int) -> str:
        """Centre text within the given character width."""
        if len(text) >= width:
            return text[:width]
        padding = (width - len(text)) // 2
        return " " * padding + text

    def _sanitize_for_thermal(self, text: str) -> str:
        """
        Keep output printer-safe and high-contrast for common ESC/POS firmware.
        Removes fancy unicode and avoids glyph fallback issues on low-cost printers.
        """
        clean = text.replace("\r\n", "\n").replace("\r", "\n")
        clean = re.sub(r"[^\x0A\x20-\x7E]", "", clean)
        return clean

    # ------------------------------------------------------------------
    # Low-level printer I/O  (Windows + pywin32 required)
    # ------------------------------------------------------------------

    def _send_to_printer(self, text: str, settings: Dict, job_name: str = "PrintJob") -> bool:
        """
        Spool a raw ESC/POS byte stream to the Windows print queue.

        Requires pywin32 — callers must verify `load_win32_modules()` returns
        a non-None value before invoking this method.
        """
        # Defensive check: refuse to proceed if modules are absent.
        modules = load_win32_modules()
        if not modules:
            _log_unavailable("_send_to_printer")
            return False

        win32print = modules["win32print"]

        try:
            hPrinter = win32print.OpenPrinter(self.printer_name)
            try:
                win32print.StartDocPrinter(hPrinter, 1, (job_name, None, "RAW"))
                try:
                    win32print.StartPagePrinter(hPrinter)

                    # ESC/POS initialization and stable text mode
                    init_cmd = b"\x1b@"
                    align_left_cmd = b"\x1ba\x00"
                    normal_font_cmd = b"\x1b!\x00"
                    bold_on_cmd = b"\x1bE\x01"
                    # On many thermal printers, this increases print darkness/weight.
                    double_strike_on_cmd = b"\x1bG\x01"
                    # Compact text mode for paper efficiency and dense layout.
                    size_cmd = b"\x1d!\x00"
                    # Codepage selection for predictable Latin output
                    codepage_cmd = b"\x1bt\x00"

                    # Prevent clipping/garbling by forcing ASCII-safe payload
                    safe_text = self._sanitize_for_thermal(text)
                    text_bytes = safe_text.encode("ascii", errors="ignore")

                    # Minimal trailing feed before cut for paper efficiency.
                    feed_lines = 2 if job_name == "KOT" else 1
                    feed_cmd = b"\x1bd" + bytes([feed_lines])
                    # Full cut with pre-feed
                    cut_cmd = b"\x1d\x56\x41\x03"

                    win32print.WritePrinter(
                        hPrinter,
                        init_cmd
                        + align_left_cmd
                        + normal_font_cmd
                        + bold_on_cmd
                        + double_strike_on_cmd
                        + size_cmd
                        + codepage_cmd
                        + text_bytes
                        + feed_cmd
                        + cut_cmd,
                    )
                    win32print.EndPagePrinter(hPrinter)
                    return True

                finally:
                    win32print.EndDocPrinter(hPrinter)
            finally:
                win32print.ClosePrinter(hPrinter)

        except Exception as exc:
            print(f"[PrinterService] Error spooling job '{job_name}': {exc}")
            return False


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------


def _log_unavailable(caller: str) -> None:
    """
    Emit a structured warning when Windows printer modules are unavailable.

    Uses Flask's application logger when inside a request context, falls back
    to print() otherwise (e.g. during startup or background tasks).
    """
    msg = (
        f"[PrinterService.{caller}] Windows printer modules (pywin32) are "
        "unavailable on this platform. Printing is skipped."
    )
    try:
        from flask import current_app  # noqa: PLC0415  (lazy to avoid circular import)

        current_app.logger.warning(msg)
    except RuntimeError:
        # Outside Flask application context — log to stdout
        print(msg)
