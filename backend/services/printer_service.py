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
            "is_80mm": str(settings.get("printer_width", "58mm")).strip().lower()
            == "80mm",
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
        Returns True if successful, False otherwise
        """
        try:
            settings = self._get_settings()

            if not settings["printer_enabled"]:
                print("Printing disabled in settings.")
                return True  # Treat as success to avoid errors in UI

            # Generate bill text
            bill_text = self._generate_bill_text(bill_data, settings)

            # Print to actual thermal printer
            if self.printer_name:
                success = self._send_to_printer(bill_text, settings)
                if success:
                    print(
                        f"Bill {bill_data['bill_no']} printed successfully to {self.printer_name}"
                    )
                    return True
                else:
                    print(f"Failed to print bill to {self.printer_name}")
                    return False
            else:
                print("No printer available, falling back to console output")
                print("=== THERMAL PRINTER OUTPUT ===")
                print(bill_text)
                print("=== END PRINTER OUTPUT ===")
                return True

        except Exception as e:
            print(f"Error printing bill: {e}")
            return False

    def _generate_bill_text(self, bill_data: Dict, settings: Dict) -> str:
        """Generate formatted bill text"""
        # Determine width
        max_chars = 48 if settings["is_80mm"] else 32

        lines = []

        # Header
        lines.append(self._center_text(settings["shop_name"], max_chars))
        if settings["shop_address"]:
            lines.append(self._center_text(settings["shop_address"], max_chars))
        if settings["shop_contact"]:
            lines.append(
                self._center_text(f"Tel: {settings['shop_contact']}", max_chars)
            )

        lines.append("-" * max_chars)

        # Bill info
        date_str = str(bill_data.get("date", datetime.now().strftime("%d-%m-%Y")))
        time_str = str(bill_data.get("time", datetime.now().strftime("%H:%M")))
        bill_no = str(bill_data["bill_no"])

        if not settings["is_80mm"] and len(date_str) == 10:
            # Shorten DD-MM-YYYY to DD-MM-YY for 58mm width
            parts = date_str.split("-")
            if len(parts) == 3 and len(parts[2]) == 4:
                date_str = f"{parts[0]}-{parts[1]}-{parts[2][2:]}"

        # Combine bill info into a single line to save paper
        if settings["is_80mm"]:
            dt_str = f"Date: {date_str} {time_str}"
            bill_str = f"Bill No: {bill_no}"
            padding = max_chars - len(bill_str) - len(dt_str)
            if padding >= 0:
                lines.append(f"{bill_str}{' ' * padding}{dt_str}")
            else:
                lines.append(f"{bill_str} {dt_str}")
        else:
            lines.append(f"BillNo:{bill_no:<5} Dt:{date_str} {time_str}")

        lines.append("-" * max_chars)

        # Product headers
        if settings["is_80mm"]:
            # 48 chars: Item(22) Qty(4) Price(9) Total(10)
            header = f"{'Item':<22} {'Qty':>4} {'Price':>9} {'Total':>10}"
        else:
            # 32 chars: Item(14) Qty(3) Price(6) Total(6)
            header = f"{'Item':<14} {'Qty':>3} {'Price':>6} {'Total':>6}"

        lines.append(header)
        lines.append("-" * max_chars)

        # Products
        for product in bill_data["products"]:
            name = str(product["name"])
            qty = str(product["quantity"])
            price = f"{float(product['price']):.2f}"
            total = f"{float(product['price']) * float(product['quantity']):.2f}"

            if settings["is_80mm"]:
                name = name[:22]
                lines.append(f"{name:<22} {qty:>4} {price:>9} {total:>10}")
            else:
                name = name[:14]
                lines.append(f"{name:<14} {qty:>3} {price:>6} {total:>6}")

        # Footer
        lines.append("-" * max_chars)
        total_label = "TOTAL:"
        total_val = f"{float(bill_data['total']):.2f}"

        # Right align total
        gap = max_chars - len(total_label) - len(total_val)
        if gap < 1:
            gap = 1
        lines.append(f"{total_label}{' ' * gap}{total_val}")

        lines.append("-" * max_chars)
        lines.append(self._center_text("Thank You! Visit Again", max_chars))

        return "\n".join(lines) + "\n"

    def _center_text(self, text: str, width: int) -> str:
        """Center text within width"""
        if len(text) >= width:
            return text[:width]
        padding = (width - len(text)) // 2
        return " " * padding + text

    def _send_to_printer(self, text: str, settings: Dict) -> bool:
        """Send text to printer"""
        try:
            # Open printer
            hPrinter = win32print.OpenPrinter(self.printer_name)
            try:
                # Start document
                win32print.StartDocPrinter(hPrinter, 1, ("Bill", None, "RAW"))
                try:
                    # Start page
                    win32print.StartPagePrinter(hPrinter)

                    # Init commands
                    init_commands = b"\x1b@"

                    # Character size
                    char_size_cmd = b"\x1b!\x08"  # Bold

                    text_bytes = text.encode("utf-8")

                    # Feed and Cut
                    feed_lines = b"\x1b\x64\x04"
                    cut_command = b"\x1d\x56\x00"  # Full cut

                    full_command = (
                        init_commands
                        + char_size_cmd
                        + text_bytes
                        + feed_lines
                        + cut_command
                    )

                    win32print.WritePrinter(hPrinter, full_command)
                    win32print.EndPagePrinter(hPrinter)
                finally:
                    win32print.EndDocPrinter(hPrinter)
            finally:
                win32print.ClosePrinter(hPrinter)
            return True
        except Exception as e:
            print(f"Error sending to printer: {e}")
            return False
