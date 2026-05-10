from datetime import datetime
from typing import Dict, List
import win32print
from .db_service import DatabaseService


class PrinterService:
    """Thermal printer service for bill printing"""

    def __init__(self):
        # Must match Settings API (PostgreSQL / SQLAlchemy), not legacy SQLite products.db
        self.db_service = DatabaseService()
        self.printer_name = self._find_champ_printer()

    def _get_settings(self):
        """Fetch current settings from DB"""
        settings = self.db_service.get_all_settings()
        return {
            "shop_name": settings.get("shop_name", "Burger Bhau"),
            "printer_width": settings.get("printer_width", "58mm"),
            "printer_enabled": settings.get("printer_enabled", "false") == "true",
            "shop_address": settings.get("shop_address", ""),
            "shop_contact": settings.get("shop_contact", ""),
            "is_80mm": str(settings.get("printer_width", "58mm")).strip().lower() == "80mm",
        }

    def _find_champ_printer(self):
        """Find Champ RP Series printer from available printers"""
        try:
            printers = win32print.EnumPrinters(
                win32print.PRINTER_ENUM_LOCAL | win32print.PRINTER_ENUM_CONNECTIONS
            )
            for printer in printers:
                printer_name = printer[2]  # Printer name is at index 2
                if "champ" in printer_name.lower() or "rp" in printer_name.lower():
                    # print(f"Found Champ printer: {printer_name}")
                    return printer_name

            # If no Champ printer found, use default printer
            default_printer = win32print.GetDefaultPrinter()
            # print(f"Champ printer not found, using default: {default_printer}")
            return default_printer
        except Exception as e:
            print(f"Error finding printer: {e}")
            return None

    def print_bill(self, bill_data: Dict) -> bool:
        """
        Print bill to thermal printer
        """
        try:
            settings = self._get_settings()
            if not settings["printer_enabled"]:
                return True

            bill_text = self._generate_bill_text(bill_data, settings)

            if self.printer_name:
                return self._send_to_printer(bill_text, settings, "Bill")
            else:
                print("=== THERMAL PRINTER (BILL) ===")
                print(bill_text)
                return True

        except Exception as e:
            print(f"Error printing bill: {e}")
            return False

    def print_kot(self, bill_data: Dict) -> bool:
        """
        Print KOT (Kitchen Order Ticket) to thermal printer
        """
        try:
            settings = self._get_settings()
            if not settings["printer_enabled"]:
                return True

            kot_text = self._generate_kot_text(bill_data, settings)

            if self.printer_name:
                return self._send_to_printer(kot_text, settings, "KOT")
            else:
                print("=== THERMAL PRINTER (KOT) ===")
                print(kot_text)
                return True

        except Exception as e:
            print(f"Error printing KOT: {e}")
            return False

    def _generate_bill_text(self, bill_data: Dict, settings: Dict) -> str:
        """Generate formatted bill text (Paper Efficient)"""
        max_chars = 48 if settings["is_80mm"] else 32
        lines = []

        # Compact Header
        lines.append(self._center_text(settings["shop_name"].upper(), max_chars))
        if settings["shop_address"]:
            lines.append(self._center_text(settings["shop_address"], max_chars))

        # Merge Bill Info into single line for efficiency
        date_str = str(bill_data.get("date", datetime.now().strftime("%d-%m-%y")))
        time_str = str(bill_data.get("time", datetime.now().strftime("%H:%M")))
        bill_no = str(bill_data["bill_no"])

        lines.append("-" * max_chars)
        info_line = f"B#{bill_no} | {date_str} {time_str}"
        lines.append(self._center_text(info_line, max_chars))
        lines.append("-" * max_chars)

        # Product headers (Compact)
        if settings["is_80mm"]:
            header = f"{'Item':<26} {'Qty':>4} {'Price':>8} {'Total':>8}"
        else:
            header = f"{'Item':<16} {'Qty':>3} {'Price':>6} {'Total':>6}"
        lines.append(header)

        # Products
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
        """Generate Kitchen Order Ticket (KOT) - Highly Visible & Efficient"""
        max_chars = 48 if settings["is_80mm"] else 32
        lines = []

        lines.append(self._center_text("*** KITCHEN ORDER ***", max_chars))
        bill_no = str(bill_data["bill_no"])
        time_str = str(bill_data.get("time", datetime.now().strftime("%H:%M")))

        lines.append(self._center_text(f"ORDER #{bill_no} | {time_str}", max_chars))
        lines.append("=" * max_chars)

        # KOT focuses on Item and Qty only (No Prices for Kitchen)
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
        """Center text within width"""
        if len(text) >= width:
            return text[:width]
        padding = (width - len(text)) // 2
        return " " * padding + text

    def _send_to_printer(self, text: str, settings: Dict, job_name: str = "PrintJob") -> bool:
        """Send text to printer with ESC/POS commands"""
        try:
            hPrinter = win32print.OpenPrinter(self.printer_name)
            try:
                win32print.StartDocPrinter(hPrinter, 1, (job_name, None, "RAW"))
                try:
                    win32print.StartPagePrinter(hPrinter)

                    # ESC/POS Commands
                    init_commands = b"\x1b@"
                    char_size_cmd = b"\x1b!\x00"  # Normal size

                    if job_name == "KOT":
                        char_size_cmd = b"\x1b!\x10"  # Double height for KOT

                    text_bytes = text.encode("utf-8")

                    # Paper Efficiency: Minimum feed before cut
                    feed_lines = b"\x1b\x64\x02"  # Feed 2 lines (instead of 4)
                    cut_command = b"\x1d\x56\x00"  # Full cut

                    full_command = (
                        init_commands + char_size_cmd + text_bytes + feed_lines + cut_command
                    )

                    win32print.WritePrinter(hPrinter, full_command)
                    win32print.EndPagePrinter(hPrinter)
                    return True
                finally:
                    win32print.EndDocPrinter(hPrinter)
            finally:
                win32print.ClosePrinter(hPrinter)
        except Exception as e:
            print(f"Error sending to printer ({job_name}): {e}")
            return False
