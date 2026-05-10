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
        import win32print   # noqa: PLC0415  (intentional lazy import)
        import win32ui      # noqa: PLC0415
        import pywintypes   # noqa: PLC0415

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
        """Generate formatted bill text (paper-efficient layout)."""
        max_chars = 48 if settings["is_80mm"] else 32
        lines = []

        # Compact header
        lines.append(self._center_text(settings["shop_name"].upper(), max_chars))
        if settings["shop_address"]:
            lines.append(self._center_text(settings["shop_address"], max_chars))

        # Merge bill info into a single line for efficiency
        date_str = str(bill_data.get("date", datetime.now().strftime("%d-%m-%y")))
        time_str = str(bill_data.get("time", datetime.now().strftime("%H:%M")))
        bill_no = str(bill_data["bill_no"])

        lines.append("-" * max_chars)
        lines.append(self._center_text(f"B#{bill_no} | {date_str} {time_str}", max_chars))
        lines.append("-" * max_chars)

        # Column headers
        if settings["is_80mm"]:
            header = f"{'Item':<26} {'Qty':>4} {'Price':>8} {'Total':>8}"
        else:
            header = f"{'Item':<16} {'Qty':>3} {'Price':>6} {'Total':>6}"
        lines.append(header)

        # Product rows
        for product in bill_data["products"]:
            name = str(product["name"])
            qty = str(product["quantity"])
            price = f"{float(product['price']):.1f}"
            total = f"{float(product['price']) * float(product['quantity']):.1f}"

            if settings["is_80mm"]:
                lines.append(f"{name[:26]:<26} {qty:>4} {price:>8} {total:>8}")
            else:
                lines.append(f"{name[:16]:<16} {qty:>3} {price:>6} {total:>6}")

        lines.append("-" * max_chars)
        total_val = f"{float(bill_data['total']):.2f}"
        lines.append(
            f"{'TOTAL:':<15} {total_val:>16}"
            if not settings["is_80mm"]
            else f"{'TOTAL:':<30} {total_val:>18}"
        )
        lines.append("-" * max_chars)
        lines.append(self._center_text("Thank You!", max_chars))

        return "\n".join(lines)

    def _generate_kot_text(self, bill_data: Dict, settings: Dict) -> str:
        """Generate Kitchen Order Ticket (KOT) — highly visible & efficient."""
        max_chars = 48 if settings["is_80mm"] else 32
        lines = []

        lines.append(self._center_text("*** KITCHEN ORDER ***", max_chars))
        bill_no = str(bill_data["bill_no"])
        time_str = str(bill_data.get("time", datetime.now().strftime("%H:%M")))

        lines.append(self._center_text(f"ORDER #{bill_no} | {time_str}", max_chars))
        lines.append("=" * max_chars)

        # KOT shows item + qty only — no prices for kitchen staff
        if settings["is_80mm"]:
            header = f"{'ITEM NAME':<40} {'QTY':>7}"
        else:
            header = f"{'ITEM NAME':<25} {'QTY':>6}"
        lines.append(header)
        lines.append("-" * max_chars)

        for product in bill_data["products"]:
            name = str(product["name"]).upper()
            qty = f"x{product['quantity']}"

            if settings["is_80mm"]:
                lines.append(f"{name[:40]:<40} {qty:>7}")
            else:
                lines.append(f"{name[:25]:<25} {qty:>6}")

        lines.append("=" * max_chars)
        return "\n".join(lines)

    def _center_text(self, text: str, width: int) -> str:
        """Centre text within the given character width."""
        if len(text) >= width:
            return text[:width]
        padding = (width - len(text)) // 2
        return " " * padding + text

    # ------------------------------------------------------------------
    # Low-level printer I/O  (Windows + pywin32 required)
    # ------------------------------------------------------------------

    def _send_to_printer(
        self, text: str, settings: Dict, job_name: str = "PrintJob"
    ) -> bool:
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

                    # ESC/POS initialisation + optional size command
                    init_cmd = b"\x1b@"
                    # Normal size for bills, double-height for KOT readability
                    size_cmd = b"\x1b!\x10" if job_name == "KOT" else b"\x1b!\x00"

                    text_bytes = text.encode("utf-8")

                    # Paper efficiency: minimal feed before cut (2 lines vs 4)
                    feed_cmd = b"\x1bd\x02"   # Feed 2 lines
                    cut_cmd = b"\x1dV\x00"    # Full cut

                    win32print.WritePrinter(
                        hPrinter,
                        init_cmd + size_cmd + text_bytes + feed_cmd + cut_cmd,
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
