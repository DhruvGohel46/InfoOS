"""
services/escpos_formatter.py
=============================
ESC/POS byte stream formatter for thermal printers.

This module provides:
- ESC/POS command generation for thermal printers
- Support for text formatting (bold, alignment, size)
- KOT and Bill receipt formatting
- Future-ready support for QR codes, logos, barcodes

All methods return raw bytes suitable for direct printer communication.
"""

import textwrap
from datetime import datetime
from typing import Dict, List, Optional, Any
from enum import Enum


class TextAlignment(Enum):
    """Text alignment options for ESC/POS."""
    LEFT = 0
    CENTER = 1
    RIGHT = 2


class TextSize(Enum):
    """Text size options for ESC/POS (GS ! command)."""
    NORMAL = 0x00      # 1x width × 1x height
    DOUBLE_WIDTH = 0x01  # 2x width × 1x height
    DOUBLE_HEIGHT = 0x10  # 1x width × 2x height
    DOUBLE_BOTH = 0x11    # 2x width × 2x height


class ESCPOSFormatter:
    """
    ESC/POS formatter for thermal printer byte streams.
    
    This class provides a fluent interface for building ESC/POS commands
    and returns raw bytes suitable for direct printer communication.
    """

    def __init__(self, max_chars: int = 32):
        """
        Initialize the ESC/POS formatter.
        
        Args:
            max_chars: Maximum characters per line (32 for 58mm, 48 for 80mm)
        """
        self.max_chars = max_chars
        self.commands: List[bytes] = []
        self._initialize_printer()

    def _initialize_printer(self) -> None:
        """Initialize printer with standard ESC/POS commands."""
        # Reset printer
        self.commands.append(b"\x1b@")
        # Set code page to UTF-8 (codepage 62 on many thermal printers)
        self.commands.append(b"\x1bt\x3e")
        # Set text size to normal
        self.set_text_size(TextSize.NORMAL)

    def set_text_size(self, size: TextSize) -> 'ESCPOSFormatter':
        """
        Set text size using GS ! command.
        
        Args:
            size: TextSize enum value
            
        Returns:
            Self for method chaining
        """
        self.commands.append(b"\x1d!" + bytes([size.value]))
        return self

    def font_a(self) -> 'ESCPOSFormatter':
        """Select Font A (default larger font)."""
        self.commands.append(b"\x1BM\x00")
        return self

    def font_b(self) -> 'ESCPOSFormatter':
        """Select Font B (smaller, compact font)."""
        self.commands.append(b"\x1BM\x01")
        return self

    def text(self, text: str) -> 'ESCPOSFormatter':
        """
        Add plain text to the output.
        
        Args:
            text: Text string to add
            
        Returns:
            Self for method chaining
        """
        self.commands.append(text.encode("utf-8", errors="ignore"))
        return self

    def line(self, text: str = "") -> 'ESCPOSFormatter':
        """
        Add a line of text with newline.
        
        Args:
            text: Text string to add (default: empty line)
            
        Returns:
            Self for method chaining
        """
        self.commands.append((text + "\n").encode("utf-8", errors="ignore"))
        return self

    def line_with_margin(self, text: str, margin_w: int) -> 'ESCPOSFormatter':
        """
        Add a line of text with left and right margins.
        
        Args:
            text: Text string to add
            margin_w: Margin width in characters (applied to both left and right)
            
        Returns:
            Self for method chaining
        """
        margin = " " * margin_w
        self.commands.append((margin + text + margin + "\n").encode("utf-8", errors="ignore"))
        return self

    def bold_on(self) -> 'ESCPOSFormatter':
        """Enable bold text (emphasized + double-strike)."""
        # ESC E 1 = emphasized
        self.commands.append(b"\x1bE\x01")
        # ESC G 1 = double-strike
        self.commands.append(b"\x1bG\x01")
        return self

    def bold_off(self) -> 'ESCPOSFormatter':
        """Disable bold text."""
        self.commands.append(b"\x1bE\x00")
        self.commands.append(b"\x1bG\x00")
        return self

    def align(self, alignment: TextAlignment) -> 'ESCPOSFormatter':
        """
        Set text alignment.
        
        Args:
            alignment: TextAlignment enum value
            
        Returns:
            Self for method chaining
        """
        self.commands.append(b"\x1ba" + bytes([alignment.value]))
        return self

    def align_left(self) -> 'ESCPOSFormatter':
        """Set text alignment to left."""
        return self.align(TextAlignment.LEFT)

    def align_center(self) -> 'ESCPOSFormatter':
        """Set text alignment to center."""
        return self.align(TextAlignment.CENTER)

    def align_right(self) -> 'ESCPOSFormatter':
        """Set text alignment to right."""
        return self.align(TextAlignment.RIGHT)

    def divider(self, char: str = "-", bold: bool = True) -> 'ESCPOSFormatter':
        """
        Add a divider line across the full width.
        
        Args:
            char: Character to use for divider (default: "-")
            bold: Whether to make the divider bold (default: True)
            
        Returns:
            Self for method chaining
        """
        if bold:
            self.bold_on()
        self.line(char * self.max_chars)
        if bold:
            self.bold_off()
        return self

    def feed(self, lines: int = 1) -> 'ESCPOSFormatter':
        """
        Add line feeds.
        
        Args:
            lines: Number of line feeds to add
            
        Returns:
            Self for method chaining
        """
        self.commands.append(b"\x1bd" + bytes([lines]))
        return self

    def cut(self, mode: int = 1) -> 'ESCPOSFormatter':
        """
        Execute paper cut.
        
        Args:
            mode: Cut mode (0 = full cut, 1 = partial cut)
            
        Returns:
            Self for method chaining
        """
        # GS V m n - m = mode, n = 1
        self.commands.append(b"\x1dV" + bytes([mode, 1]))
        return self

    def build(self) -> bytes:
        """
        Build the final ESC/POS byte stream.
        
        Returns:
            Raw bytes suitable for direct printer communication
        """
        return b"".join(self.commands)

    def build_plain_text(self) -> str:
        """
        Build a plain text representation for debugging.
        
        Returns:
            String representation of the receipt
        """
        result = []
        for cmd in self.commands:
            try:
                result.append(cmd.decode("utf-8", errors="ignore"))
            except:
                result.append(f"[BINARY: {len(cmd)} bytes]")
        return "".join(result)


def build_kot(order: Dict, settings: Dict) -> bytes:
    """
    Build ESC/POS byte stream for Kitchen Order Ticket (KOT).
    
    Exact replica of reference restaurant kitchen ticket design.
    
    Args:
        order: Order data dictionary containing:
            - token_no: KOT number
            - order_type: Order type (Dine-In, Takeaway, etc.)
            - date: Order date
            - time: Order time
            - products: List of products with name and quantity
            - notes: Special notes (optional)
            - table_no: Table number (optional)
        settings: Printer settings dictionary containing:
            - is_80mm: Boolean indicating 80mm printer (vs 58mm)
            
    Returns:
        Raw ESC/POS bytes for KOT printing
    """
    max_chars = 48 if settings.get("is_80mm", False) else 32
    margin_w = 2  # Left and right margin width in characters
    usable_chars = max_chars - (margin_w * 2)  # Usable width for content
    
    formatter = ESCPOSFormatter(max_chars)
    formatter.font_a()  # Use Font A (larger, more readable font) for entire KOT
    formatter.feed(0)
    
    # Header Section - Date & Time (center aligned, bold)
    formatter.align_center()
    formatter.bold_on()
    now = datetime.now()

    # Format date as DD/MM/YY and time as HH:MM
    date_str = now.strftime("%d/%m/%y")
    time_str = now.strftime("%H:%M")
    formatter.line_with_margin(f"{date_str} {time_str}", margin_w)
    formatter.bold_off()
    
    # KOT Number - Center aligned, normal size (no double height)
    kot_no = str(
        order.get("token_no")
        or order.get("tokenNumber")
        or order.get("today_token")
        or order.get("bill_no")
        or "1"
    )
    formatter.bold_on()
    formatter.line_with_margin(f"KOT - {kot_no}", margin_w)
    formatter.bold_off()
    
    # Order Type - Center aligned, bold
    order_type = str(
        order.get("order_type") or order.get("orderType") or "Dine In"
    )
    formatter.bold_on()
    formatter.line_with_margin(order_type, margin_w)
    formatter.bold_off()
    
    # Table Number - Center aligned, Bold
    table_no = order.get("table_no") or order.get("tableNumber") or order.get("table")
    if table_no:
        formatter.bold_on()
        formatter.line_with_margin(f"Table No: {table_no}", margin_w)
        formatter.bold_off()
    elif order_type.lower() == "takeaway":
        formatter.bold_on()
        formatter.line_with_margin("Customer: Walk In", margin_w)
        formatter.bold_off()
    elif order_type.lower() == "delivery":
        formatter.bold_on()
        formatter.line_with_margin("Delivery Order", margin_w)
        formatter.bold_off()
    
    # Separator line (dashed/dotted)
    formatter.align_left()
    formatter.bold_on()
    formatter.line_with_margin("-" * usable_chars)
    formatter.bold_off()
    
    # Column titles - use usable_chars for width calculation
    if settings.get("is_80mm", False):
        qty_w = 4
        item_w = usable_chars - qty_w
    else:
        qty_w = 3
        item_w = usable_chars - qty_w
    
    formatter.bold_on()
    formatter.line_with_margin(f"{'Item':<{item_w}}{'Qty':>{qty_w}}", margin_w)
    formatter.bold_off()
    
    # Items - Quantity before item, natural wrapping
    products = order.get("products") or order.get("items") or []
    
    for product in products:
        name = str(product.get("name", "Item"))
        
        # Try multiple field names for quantity
        qty = None
        for field in ["quantity", "qty", "count", "amount"]:
            if field in product and product[field] is not None:
                try:
                    qty = int(product[field])
                    break
                except (ValueError, TypeError):
                    continue
        
        # Default to 1 if no quantity found
        if qty is None or qty <= 0:
            qty = 1
        
        specification = (
            product.get("specification") or product.get("spec") or product.get("specs") or ""
        )
        
        # Print: Item Name (left) and Qty (right) - space-between
        formatter.bold_on()
        formatter.line_with_margin(f"{name:<{item_w}}{qty:>{qty_w}}", margin_w)
        formatter.bold_off()
        
        # Modifiers - attached to item, indented
        if specification:
            for spec_line in str(specification).split("\n"):
                for wrapped_spec in textwrap.wrap(f"  {spec_line}", usable_chars):
                    formatter.line_with_margin(wrapped_spec, margin_w)
    
    # Separator line
    formatter.bold_on()
    formatter.line_with_margin("-" * usable_chars)
    formatter.bold_off()
    
    # Special Note Section - positioned on right side area
    notes = order.get("notes") or order.get("special_notes") or order.get("remarks")
    if notes:
        formatter.align_right()
        formatter.bold_on()
        formatter.line_with_margin("Special", margin_w)
        formatter.line_with_margin("Note", margin_w)
        formatter.bold_off()
        formatter.align_left()
    
    # Minimal blank area before cut
    formatter.feed(5)
    
    # Full Cut
    formatter.cut(mode=0)
    
    return formatter.build()


def build_bill(order: Dict, settings: Dict) -> bytes:
    """
    Build ESC/POS byte stream for customer Bill.
    
    Args:
        order: Order data dictionary containing:
            - bill_no: Bill number
            - customer_name: Customer name (optional)
            - date: Order date
            - time: Order time
            - order_type: Order type (Dine-In, Takeaway, etc.)
            - token_no: Token number
            - cashier: Cashier name
            - products: List of products with name, quantity, price
            - subtotal: Subtotal amount
            - cgst, sgst: GST amounts (optional)
            - gst: Total GST (optional)
            - tax: Tax amount (optional)
            - discount: Discount amount (optional)
            - grandTotal: Grand total
        settings: Printer settings dictionary containing:
            - is_80mm: Boolean indicating 80mm printer (vs 58mm)
            - shop_name: Shop name
            - shop_contact: Shop contact (optional)
            - gst_enabled: Boolean indicating GST is enabled
            - gst_rate: GST rate percentage
            - discount_enabled: Boolean indicating discount is enabled
            
    Returns:
        Raw ESC/POS bytes for Bill printing
    """
    max_chars = 48 if settings.get("is_80mm", False) else 32
    formatter = ESCPOSFormatter(max_chars)
    formatter.feed(0)
    
    # Header - center aligned
    formatter.align_center()
    shop_name = settings.get("shop_name", "RESTAURANT")
    formatter.bold_on().line(shop_name.upper()).bold_off()
    shop_contact = settings.get("shop_contact", "")
    if shop_contact:
        formatter.line(f"Ph: {shop_contact}")
    
    formatter.align_left()
    formatter.divider()
    
    # Customer Name
    customer_name = order.get("customer_name") or order.get("customerName", "")
    if customer_name:
        formatter.bold_on().line(f"Name: {customer_name}").bold_off()
        formatter.divider()
    
    # Date & Order Type on same line
    date_str = str(order.get("date", datetime.now().strftime("%d-%m-%y")))
    order_type = str(order.get("order_type") or order.get("orderType") or "Dine-In")
    date_label = f"Date: {date_str}"
    pad = max_chars - len(date_label) - len(order_type)
    if pad < 1:
        pad = 1
    
    # Time
    time_str = str(order.get("time", datetime.now().strftime("%H:%M")))
    
    # Cashier & Bill No on same line
    cashier = (
        order.get("cashier")
        or order.get("cashier_name")
        or order.get("cashierName")
        or "Cashier"
    )
    bill_no = str(
        order.get("bill_no")
        or order.get("bill_number")
        or order.get("billNumber")
        or "1"
    )
    cashier_part = f"Cashier: {cashier}"
    bill_no_part = f"Bill No.: {bill_no}"
    pad2 = max_chars - len(cashier_part) - len(bill_no_part)
    if pad2 < 1:
        pad2 = 1
    
    formatter.bold_on()
    formatter.line(f"{date_label}{' ' * pad}{order_type}")
    formatter.line(f"Time: {time_str}")
    formatter.line(f"{cashier_part}{' ' * pad2}{bill_no_part}")
    formatter.bold_off()
    
    # Token No.
    token_no = str(
        order.get("token_no")
        or order.get("tokenNumber")
        or order.get("today_token")
        or "1"
    )
    formatter.bold_on().line(f"Token No.: {token_no}").bold_off()
    formatter.divider()
    
    # Column widths
    if settings.get("is_80mm", False):
        item_w, qty_w, rate_w, amt_w = 20, 6, 10, 12
    else:
        item_w, qty_w, rate_w, amt_w = 12, 4, 7, 9
    
    formatter.bold_on()
    formatter.line(f"{'Item':<{item_w}}{'Qty.':>{qty_w}}{'Price':>{rate_w}}{'Amount':>{amt_w}}")
    formatter.bold_off()
    formatter.divider()
    
    # Products
    total_qty = 0
    calculated_subtotal = 0.0
    for product in order.get("products") or order.get("items") or []:
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
        
        formatter.bold_on()
        formatter.line(
            f"{chunks[0]:<{item_w}}{qty:>{qty_w}}{price:>{rate_w}.2f}{amt:>{amt_w}.2f}"
        )
        for chunk in chunks[1:]:
            formatter.line(f"{chunk:<{item_w}}")
        if specification:
            formatter.line(f"({specification})")
        formatter.bold_off()
    
    formatter.divider()
    
    # Totals
    qty_total = order.get("totalQty") or order.get("total_qty") or total_qty
    subtotal = float(
        order.get("subtotal") or order.get("sub_total") or calculated_subtotal
    )
    total_qty_str = f"Total Qty: {qty_total}"
    sub_total_str = f"Sub Total {subtotal:.2f}"
    pad3 = max_chars - len(total_qty_str) - len(sub_total_str)
    if pad3 < 1:
        pad3 = 1
    formatter.bold_on()
    formatter.line(f"{total_qty_str}{' ' * pad3}{sub_total_str}")
    formatter.bold_off()
    
    # Optional: GST
    cgst = order.get("cgst")
    sgst = order.get("sgst")
    gst = order.get("gst")
    tax = order.get("tax")
    formatter.bold_on()
    if cgst is not None or sgst is not None:
        if cgst is not None:
            formatter.line(f"CGST: {float(cgst):.2f}")
        if sgst is not None:
            formatter.line(f"SGST: {float(sgst):.2f}")
    elif gst is not None:
        formatter.line(f"GST: {float(gst):.2f}")
    elif tax is not None:
        formatter.line(f"Tax: {float(tax):.2f}")
    elif settings.get("gst_enabled"):
        rate = settings.get("gst_rate", 5.0)
        cgst_val = (subtotal * (rate / 2.0)) / 100.0
        formatter.line(f"CGST ({rate / 2:.1f}%): {cgst_val:.2f}")
        formatter.line(f"SGST ({rate / 2:.1f}%): {cgst_val:.2f}")
    formatter.bold_off()
    
    # Optional: Discount
    discount = order.get("discount")
    if discount is not None and float(discount) > 0:
        formatter.bold_on()
        formatter.line(f"Discount: -{float(discount):.2f}")
        formatter.bold_off()
    
    # Grand Total
    grand_total = float(
        order.get("grandTotal")
        or order.get("grand_total")
        or order.get("total")
        or subtotal
    )
    formatter.divider()
    formatter.bold_on()
    formatter.line(f"GRAND TOTAL: {grand_total:.2f}")
    formatter.bold_off()
    formatter.divider()
    
    formatter.feed(0)
    formatter.cut()
    
    return formatter.build()


def build_test_print(settings: Dict) -> bytes:
    """
    Build ESC/POS byte stream for test print.
    
    Args:
        settings: Printer settings dictionary containing:
            - is_80mm: Boolean indicating 80mm printer (vs 58mm)
            - shop_name: Shop name
            
    Returns:
        Raw ESC/POS bytes for test printing
    """
    max_chars = 48 if settings.get("is_80mm", False) else 32
    formatter = ESCPOSFormatter(max_chars)
    
    formatter.feed(2)
    formatter.align_center()
    formatter.bold_on()
    formatter.set_text_size(TextSize.DOUBLE_BOTH)
    formatter.line("TEST PRINT")
    formatter.set_text_size(TextSize.NORMAL)
    formatter.feed(1)
    
    formatter.divider("=")
    formatter.feed(1)
    
    formatter.align_left()
    formatter.line("Printer Test Page")
    formatter.line(f"Max Chars: {max_chars}")
    formatter.line(f"Date: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    formatter.feed(1)
    
    formatter.divider()
    formatter.line("Text Formatting Test:")
    formatter.bold_on().line("Bold Text").bold_off()
    formatter.set_text_size(TextSize.DOUBLE_WIDTH).line("Double Width").set_text_size(TextSize.NORMAL)
    formatter.set_text_size(TextSize.DOUBLE_HEIGHT).line("Double Height").set_text_size(TextSize.NORMAL)
    formatter.set_text_size(TextSize.DOUBLE_BOTH).line("Double Both").set_text_size(TextSize.NORMAL)
    formatter.divider()
    
    formatter.align_center().line("Center Alignment").align_left()
    formatter.align_right().line("Right Alignment").align_left()
    formatter.divider()
    
    formatter.feed(2)
    formatter.align_center()
    formatter.line("Test Complete")
    formatter.feed(3)
    formatter.cut()
    
    return formatter.build()
