import os
from datetime import date, datetime
from typing import List, Dict
import openpyxl
from openpyxl.styles import Font, Alignment, PatternFill, Border, Side
from openpyxl.utils import get_column_letter
from config import Config


class ExcelXLSXService:
    """Excel export service for generating true .xlsx files"""

    def __init__(self, data_dir: str = "../backend/data"):
        self.data_dir = data_dir
        self.export_dir = os.path.join(data_dir, "exports")
        os.makedirs(self.export_dir, exist_ok=True)

        # Define styles
        self.header_font = Font(bold=True, color="FFFFFF")
        self.header_fill = PatternFill(
            start_color="366092", end_color="366092", fill_type="solid"
        )
        self.header_alignment = Alignment(horizontal="center", vertical="center")

        self.data_font = Font(size=11)
        self.data_alignment = Alignment(horizontal="left", vertical="center")

        self.currency_alignment = Alignment(horizontal="right", vertical="center")

        self.border = Border(
            left=Side(style="thin"),
            right=Side(style="thin"),
            top=Side(style="thin"),
            bottom=Side(style="thin"),
        )

    def _write_company_header(self, ws, max_col_letter):
        """Write Rebill and Shop Name headers"""
        # Project Name
        ws.merge_cells(f"A1:{max_col_letter}1")
        ws["A1"] = "InfoBill"
        ws["A1"].font = Font(bold=True, size=18, color="FFFFFF")
        ws["A1"].fill = PatternFill(
            start_color="2c3e50", end_color="2c3e50", fill_type="solid"
        )
        ws["A1"].alignment = Alignment(horizontal="center", vertical="center")

        # Shop Name
        ws.merge_cells(f"A2:{max_col_letter}2")
        ws["A2"] = Config.SHOP_NAME
        ws["A2"].font = Font(bold=True, size=12, color="FFFFFF")
        ws["A2"].fill = PatternFill(
            start_color="34495e", end_color="34495e", fill_type="solid"
        )
        ws["A2"].alignment = Alignment(horizontal="center", vertical="center")

        return 4  # Next available row (leaving row 3 as spacer)

    def export_detailed_sales_report(
        self, bills: List[Dict], summary_data: Dict
    ) -> str:
        """Create a comprehensive Excel report with detailed bills and summary"""
        try:
            today_str = date.today().strftime("%Y-%m-%d")
            filename = f"detailed_sales_report_{today_str}.xlsx"
            filepath = os.path.join(self.export_dir, filename)

            # Create workbook and worksheet
            wb = openpyxl.Workbook()
            ws = wb.active
            ws.title = "Sales Report"

            # Set column widths
            ws.column_dimensions["A"].width = 12
            ws.column_dimensions["B"].width = 15
            ws.column_dimensions["C"].width = 20
            ws.column_dimensions["D"].width = 15
            ws.column_dimensions["E"].width = 12
            ws.column_dimensions["F"].width = 15
            ws.column_dimensions["G"].width = 12

            current_row = self._write_company_header(ws, "G")

            # === SUMMARY SECTION ===
            ws.merge_cells(f"A{current_row}:G{current_row}")
            ws[f"A{current_row}"] = "DAILY SALES SUMMARY"
            ws[f"A{current_row}"].font = Font(bold=True, size=16, color="FFFFFF")
            ws[f"A{current_row}"].fill = PatternFill(
                start_color="366092", end_color="366092", fill_type="solid"
            )
            ws[f"A{current_row}"].alignment = Alignment(
                horizontal="center", vertical="center"
            )
            current_row += 2

            # Summary data
            summary_items = [
                ("Date", summary_data.get("date", today_str)),
                ("Total Bills", summary_data.get("total_bills", 0)),
                ("Total Sales", f"{summary_data.get('total_sales', 0):.2f}"),
                ("First Bill Time", summary_data.get("first_bill_time", "N/A")),
                ("Last Bill Time", summary_data.get("last_bill_time", "N/A")),
            ]

            for label, value in summary_items:
                ws[f"A{current_row}"] = label
                ws[f"B{current_row}"] = value
                ws[f"A{current_row}"].font = Font(bold=True)
                current_row += 1

            current_row += 2

            # === CATEGORY WISE SALES ===
            ws.merge_cells(f"A{current_row}:G{current_row}")
            ws[f"A{current_row}"] = "CATEGORY WISE SALES"
            ws[f"A{current_row}"].font = Font(bold=True, size=14, color="FFFFFF")
            ws[f"A{current_row}"].fill = PatternFill(
                start_color="366092", end_color="366092", fill_type="solid"
            )
            ws[f"A{current_row}"].alignment = Alignment(
                horizontal="center", vertical="center"
            )
            current_row += 2

            ws[f"A{current_row}"] = "Category"
            ws[f"B{current_row}"] = "Total Sales"
            ws[f"A{current_row}"].font = self.header_font
            ws[f"B{current_row}"].font = self.header_font
            ws[f"A{current_row}"].fill = self.header_fill
            ws[f"B{current_row}"].fill = self.header_fill
            ws[f"A{current_row}"].alignment = self.header_alignment
            ws[f"B{current_row}"].alignment = self.header_alignment
            current_row += 1

            category_totals = summary_data.get("category_totals", {})
            for category, total in category_totals.items():
                ws[f"A{current_row}"] = category.capitalize()
                ws[f"B{current_row}"] = f"{total:.2f}"
                ws[f"B{current_row}"].alignment = self.currency_alignment
                current_row += 1

            current_row += 2

            # === DETAILED BILLS ===
            ws.merge_cells(f"A{current_row}:G{current_row}")
            ws[f"A{current_row}"] = "DETAILED BILLS"
            ws[f"A{current_row}"].font = Font(bold=True, size=14, color="FFFFFF")
            ws[f"A{current_row}"].fill = PatternFill(
                start_color="366092", end_color="366092", fill_type="solid"
            )
            ws[f"A{current_row}"].alignment = Alignment(
                horizontal="center", vertical="center"
            )
            current_row += 2

            # Headers
            headers = [
                "Bill No",
                "Date",
                "Time",
                "Product ID",
                "Product Name",
                "Quantity",
                "Total",
            ]
            for col, header in enumerate(headers, 1):
                cell = ws.cell(row=current_row, column=col, value=header)
                cell.font = self.header_font
                cell.fill = self.header_fill
                cell.alignment = self.header_alignment
                cell.border = self.border
            current_row += 1

            # Bill data
            for bill in bills:
                for item in bill.get("items", []):
                    ws[f"A{current_row}"] = bill.get("bill_no", "")
                    ws[f"B{current_row}"] = (
                        bill.get("created_at", "").split(" ")[0]
                        if bill.get("created_at")
                        else ""
                    )
                    ws[f"C{current_row}"] = (
                        bill.get("created_at", "").split(" ")[1]
                        if bill.get("created_at")
                        else ""
                    )
                    ws[f"D{current_row}"] = item.get("product_id", "")
                    ws[f"E{current_row}"] = item.get("name", "")
                    ws[f"F{current_row}"] = item.get("quantity", 0)
                    ws[f"G{current_row}"] = (
                        f"{item.get('price', 0) * item.get('quantity', 0):.2f}"
                    )

                    # Apply formatting
                    for col in range(1, 8):
                        cell = ws.cell(row=current_row, column=col)
                        cell.font = self.data_font
                        cell.alignment = (
                            self.currency_alignment if col == 7 else self.data_alignment
                        )
                        cell.border = self.border

                    current_row += 1

            # Save the workbook
            wb.save(filepath)
            return filepath

        except Exception as e:
            print(f"Error creating detailed Excel report: {e}")
            return None

    def export_simple_sales_report(self, bills: List[Dict]) -> str:
        """Create a simple Excel report with basic bill details"""
        try:
            today_str = date.today().strftime("%Y-%m-%d")
            filename = f"simple_sales_report_{today_str}.xlsx"
            filepath = os.path.join(self.export_dir, filename)

            # Create workbook and worksheet
            wb = openpyxl.Workbook()
            ws = wb.active
            ws.title = "Simple Sales Report"

            # Set column widths
            ws.column_dimensions["A"].width = 12
            ws.column_dimensions["B"].width = 20
            ws.column_dimensions["C"].width = 15
            ws.column_dimensions["D"].width = 15
            ws.column_dimensions["E"].width = 12
            ws.column_dimensions["F"].width = 12
            ws.column_dimensions["G"].width = 15

            current_row = self._write_company_header(ws, "G")

            # Headers
            headers = [
                "Bill No",
                "Date",
                "Time",
                "Product ID",
                "Product Name",
                "Quantity",
                "Total",
            ]
            for col, header in enumerate(headers, 1):
                cell = ws.cell(row=current_row, column=col, value=header)
                cell.font = self.header_font
                cell.fill = self.header_fill
                cell.alignment = self.header_alignment
                cell.border = self.border

            current_row += 1

            for bill in bills:
                for item in bill.get("items", []):
                    ws[f"A{current_row}"] = bill.get("bill_no", "")
                    ws[f"B{current_row}"] = (
                        bill.get("created_at", "").split(" ")[0]
                        if bill.get("created_at")
                        else ""
                    )
                    ws[f"C{current_row}"] = (
                        bill.get("created_at", "").split(" ")[1]
                        if bill.get("created_at")
                        else ""
                    )
                    ws[f"D{current_row}"] = item.get("product_id", "")
                    ws[f"E{current_row}"] = item.get("name", "")
                    ws[f"F{current_row}"] = item.get("quantity", 0)
                    ws[f"G{current_row}"] = (
                        f"{item.get('price', 0) * item.get('quantity', 0):.2f}"
                    )

                    # Apply formatting
                    for col in range(1, 8):
                        cell = ws.cell(row=current_row, column=col)
                        cell.font = self.data_font
                        cell.alignment = (
                            self.currency_alignment if col == 7 else self.data_alignment
                        )
                        cell.border = self.border

                    current_row += 1

            # Save the workbook
            wb.save(filepath)
            return filepath

        except Exception as e:
            print(f"Error creating simple Excel report: {e}")
            return None

    def export_summary_report(self, summary_data: Dict) -> str:
        """Create a summary Excel report"""
        try:
            today_str = date.today().strftime("%Y-%m-%d")
            filename = f"summary_report_{today_str}.xlsx"
            filepath = os.path.join(self.export_dir, filename)

            # Create workbook and worksheet
            wb = openpyxl.Workbook()
            ws = wb.active
            ws.title = "Summary Report"

            # Set column widths
            ws.column_dimensions["A"].width = 20
            ws.column_dimensions["B"].width = 15

            current_row = self._write_company_header(ws, "B")

            # Title
            ws.merge_cells(f"A{current_row}:B{current_row}")
            ws[f"A{current_row}"] = "DAILY SALES SUMMARY"
            ws[f"A{current_row}"].font = Font(bold=True, size=16, color="FFFFFF")
            ws[f"A{current_row}"].fill = PatternFill(
                start_color="366092", end_color="366092", fill_type="solid"
            )
            ws[f"A{current_row}"].alignment = Alignment(
                horizontal="center", vertical="center"
            )

            # Summary data
            summary_items = [
                ("Date", summary_data.get("date", today_str)),
                ("Total Bills", summary_data.get("total_bills", 0)),
                ("Total Sales", f"{summary_data.get('total_sales', 0):.2f}"),
                ("First Bill Time", summary_data.get("first_bill_time", "N/A")),
                ("Last Bill Time", summary_data.get("last_bill_time", "N/A")),
            ]

            current_row += 2
            for label, value in summary_items:
                ws[f"A{current_row}"] = label
                ws[f"B{current_row}"] = value
                ws[f"A{current_row}"].font = Font(bold=True)
                current_row += 1

            current_row += 2

            # Category totals
            ws[f"A{current_row}"] = "CATEGORY WISE SALES"
            ws[f"A{current_row}"].font = Font(bold=True, size=14)
            current_row += 1

            ws[f"A{current_row}"] = "Category"
            ws[f"B{current_row}"] = "Total Sales"
            ws[f"A{current_row}"].font = self.header_font
            ws[f"B{current_row}"].font = self.header_font
            current_row += 1

            category_totals = summary_data.get("category_totals", {})
            for category, total in category_totals.items():
                ws[f"A{current_row}"] = category.capitalize()
                ws[f"B{current_row}"] = f"{total:.2f}"
                ws[f"B{current_row}"].alignment = self.currency_alignment
                current_row += 1

            # Save the workbook
            wb.save(filepath)
            return filepath

        except Exception as e:
            print(f"Error creating summary Excel report: {e}")
            return None

    def create_sample_report(self) -> str:
        """Create a sample Excel report for demonstration when no bills exist"""
        try:
            today_str = date.today().strftime("%Y-%m-%d")
            filename = f"sample_sales_report_{today_str}.xlsx"
            filepath = os.path.join(self.export_dir, filename)

            # Create workbook and worksheet
            wb = openpyxl.Workbook()
            ws = wb.active
            ws.title = "Sample Sales Report"

            # Set column widths
            for col in range(1, 8):
                ws.column_dimensions[get_column_letter(col)].width = 15

            current_row = self._write_company_header(ws, "G")

            # === SUMMARY SECTION ===
            ws.merge_cells(f"A{current_row}:G{current_row}")
            ws[f"A{current_row}"] = "DAILY SALES SUMMARY (SAMPLE)"
            ws[f"A{current_row}"].font = Font(bold=True, size=16, color="FFFFFF")
            ws[f"A{current_row}"].fill = PatternFill(
                start_color="366092", end_color="366092", fill_type="solid"
            )
            ws[f"A{current_row}"].alignment = Alignment(
                horizontal="center", vertical="center"
            )
            current_row += 2

            # Sample summary data
            summary_items = [
                ("Date", today_str),
                ("Total Bills", 0),
                ("Total Sales", "0.00"),
                ("First Bill Time", "N/A"),
                ("Last Bill Time", "N/A"),
            ]

            for label, value in summary_items:
                ws[f"A{current_row}"] = label
                ws[f"B{current_row}"] = value
                ws[f"A{current_row}"].font = Font(bold=True)
                current_row += 1

            current_row += 2

            # === CATEGORY WISE SALES ===
            ws.merge_cells(f"A{current_row}:G{current_row}")
            ws[f"A{current_row}"] = "CATEGORY WISE SALES (SAMPLE)"
            ws[f"A{current_row}"].font = Font(bold=True, size=14, color="FFFFFF")
            ws[f"A{current_row}"].fill = PatternFill(
                start_color="366092", end_color="366092", fill_type="solid"
            )
            ws[f"A{current_row}"].alignment = Alignment(
                horizontal="center", vertical="center"
            )
            current_row += 2

            ws[f"A{current_row}"] = "Category"
            ws[f"B{current_row}"] = "Total Sales"
            ws[f"A{current_row}"].font = self.header_font
            ws[f"B{current_row}"].font = self.header_font
            current_row += 1

            categories = ["coldrink", "paan", "other"]
            for category in categories:
                ws[f"A{current_row}"] = category.capitalize()
                ws[f"B{current_row}"] = "0.00"
                ws[f"B{current_row}"].alignment = self.currency_alignment
                current_row += 1

            current_row += 2

            # === DETAILED BILLS ===
            ws.merge_cells(f"A{current_row}:G{current_row}")
            ws[f"A{current_row}"] = "DETAILED BILLS (SAMPLE DATA)"
            ws[f"A{current_row}"].font = Font(bold=True, size=14, color="FFFFFF")
            ws[f"A{current_row}"].fill = PatternFill(
                start_color="366092", end_color="366092", fill_type="solid"
            )
            ws[f"A{current_row}"].alignment = Alignment(
                horizontal="center", vertical="center"
            )
            current_row += 2

            # Note
            ws.merge_cells(f"A{current_row}:G{current_row}")
            ws[f"A{current_row}"] = (
                "Note: No bills found for today. This is a sample report format."
            )
            ws[f"A{current_row}"].font = Font(italic=True)
            ws[f"A{current_row}"].alignment = Alignment(
                horizontal="center", vertical="center"
            )
            current_row += 2

            # Headers
            headers = [
                "Bill No",
                "Date",
                "Time",
                "Product ID",
                "Product Name",
                "Quantity",
                "Total",
            ]
            for col, header in enumerate(headers, 1):
                cell = ws.cell(row=current_row, column=col, value=header)
                cell.font = self.header_font
                cell.fill = self.header_fill
                cell.alignment = self.header_alignment
                cell.border = self.border
            current_row += 1

            # Sample data
            sample_data = [
                (
                    "SAMPLE001",
                    today_str,
                    "12:00:00",
                    "SAMPLE001",
                    "Sample Cold Drink",
                    2,
                    50.00,
                ),
                (
                    "SAMPLE001",
                    today_str,
                    "12:00:00",
                    "SAMPLE002",
                    "Sample Paan",
                    1,
                    15.00,
                ),
            ]

            for (
                bill_no,
                bill_date,
                time,
                product_id,
                name,
                quantity,
                total,
            ) in sample_data:
                ws[f"A{current_row}"] = bill_no
                ws[f"B{current_row}"] = bill_date
                ws[f"C{current_row}"] = time
                ws[f"D{current_row}"] = product_id
                ws[f"E{current_row}"] = name
                ws[f"F{current_row}"] = quantity
                ws[f"G{current_row}"] = f"{total:.2f}"

                # Apply formatting
                for col in range(1, 8):
                    cell = ws.cell(row=current_row, column=col)
                    cell.font = self.data_font
                    cell.alignment = (
                        self.currency_alignment if col == 7 else self.data_alignment
                    )
                    cell.border = self.border

                current_row += 1

            # Save the workbook
            wb.save(filepath)
            return filepath

        except Exception as e:
            print(f"Error creating sample Excel report: {e}")
            return None

    def export_monthly_product_sales_report(self, report_data: Dict) -> str:
        """Create a monthly product-wise sales report"""
        try:
            month = report_data.get("month")
            year = report_data.get("year")
            products = report_data.get("products", [])

            filename = f"Monthly_Sales_Report_{month:02d}_{year}.xlsx"
            filepath = os.path.join(self.export_dir, filename)

            # Create workbook and worksheet
            wb = openpyxl.Workbook()
            ws = wb.active
            ws.title = f"Sales {month:02d}-{year}"

            # Set column widths
            ws.column_dimensions["A"].width = 15  # Product ID
            ws.column_dimensions["B"].width = 30  # Product Name
            ws.column_dimensions["C"].width = 15  # Category
            ws.column_dimensions["D"].width = 15  # Quantity
            ws.column_dimensions["E"].width = 15  # Revenue

            current_row = self._write_company_header(ws, "E")

            # === HEADER SECTION ===
            ws.merge_cells(f"A{current_row}:E{current_row}")
            ws[f"A{current_row}"] = f"MONTHLY SALES REPORT - {month:02d}/{year}"
            ws[f"A{current_row}"].font = Font(bold=True, size=16, color="FFFFFF")
            ws[f"A{current_row}"].fill = PatternFill(
                start_color="366092", end_color="366092", fill_type="solid"
            )
            ws[f"A{current_row}"].alignment = Alignment(
                horizontal="center", vertical="center"
            )
            current_row += 2

            # Summary stats
            ws.merge_cells(f"A{current_row}:E{current_row}")
            ws[f"A{current_row}"] = (
                f"Total Revenue: {report_data.get('total_sales', 0):.2f}"
            )
            ws[f"A{current_row}"].font = Font(bold=True, size=12)
            ws[f"A{current_row}"].alignment = Alignment(horizontal="right")
            current_row += 2

            # === TABLE HEADERS ===
            headers = [
                "Product ID",
                "Product Name",
                "Category",
                "Total Quantity",
                "Total Revenue",
            ]
            for col, header in enumerate(headers, 1):
                cell = ws.cell(row=current_row, column=col, value=header)
                cell.font = self.header_font
                cell.fill = self.header_fill
                cell.alignment = self.header_alignment
                cell.border = self.border
            current_row += 1

            # === DATA ROWS ===
            if not products:
                ws.merge_cells(f"A{current_row}:E{current_row}")
                ws[f"A{current_row}"] = "No sales data found for this month."
                ws[f"A{current_row}"].font = Font(italic=True)
                ws[f"A{current_row}"].alignment = Alignment(horizontal="center")
            else:
                for product in products:
                    ws[f"A{current_row}"] = product.get("product_id", "")
                    ws[f"B{current_row}"] = product.get("name", "")
                    ws[f"C{current_row}"] = product.get("category", "").capitalize()
                    ws[f"D{current_row}"] = product.get("total_quantity", 0)
                    ws[f"E{current_row}"] = f"{product.get('total_revenue', 0):.2f}"

                    # Apply formatting
                    for col in range(1, 6):
                        cell = ws.cell(row=current_row, column=col)
                        cell.font = self.data_font
                        cell.border = self.border
                        if col >= 4:  # Quantity and Revenue
                            cell.alignment = self.currency_alignment
                        else:
                            cell.alignment = self.data_alignment

                    current_row += 1

            # Footer
            current_row += 1
            ws.merge_cells(f"A{current_row}:E{current_row}")
            ws[f"A{current_row}"] = f"Generated on {date.today().strftime('%Y-%m-%d')}"
            ws[f"A{current_row}"].font = Font(italic=True, size=8)
            ws[f"A{current_row}"].alignment = Alignment(horizontal="right")

            # Save the workbook
            wb.save(filepath)
            return filepath

        except Exception as e:
            print(f"Error creating monthly report: {e}")
            return None

    def export_weekly_product_sales_report(self, report_data: Dict) -> str:
        """Create a weekly product-wise sales report"""
        try:
            start_date = report_data.get("start_date")
            end_date = report_data.get("end_date")
            products = report_data.get("products", [])

            # Format dates for filename (DDMMYYYY)
            s_date = datetime.strptime(start_date, "%Y-%m-%d")
            e_date = datetime.strptime(end_date, "%Y-%m-%d")
            s_str = s_date.strftime("%d%m%Y")
            e_str = e_date.strftime("%d%m%Y")

            filename = f"Weekly_Sales_Report_{s_str}_to_{e_str}.xlsx"
            filepath = os.path.join(self.export_dir, filename)

            # Create workbook and worksheet
            wb = openpyxl.Workbook()
            ws = wb.active
            ws.title = "Weekly Sales"

            # Set column widths
            ws.column_dimensions["A"].width = 15  # Product ID
            ws.column_dimensions["B"].width = 30  # Product Name
            ws.column_dimensions["C"].width = 15  # Category
            ws.column_dimensions["D"].width = 15  # Quantity
            ws.column_dimensions["E"].width = 15  # Revenue

            current_row = self._write_company_header(ws, "E")

            # === HEADER SECTION ===
            ws.merge_cells(f"A{current_row}:E{current_row}")
            ws[f"A{current_row}"] = "WEEKLY SALES REPORT"
            ws[f"A{current_row}"].font = Font(bold=True, size=16, color="FFFFFF")
            ws[f"A{current_row}"].fill = PatternFill(
                start_color="366092", end_color="366092", fill_type="solid"
            )
            ws[f"A{current_row}"].alignment = Alignment(
                horizontal="center", vertical="center"
            )
            current_row += 1

            ws.merge_cells(f"A{current_row}:E{current_row}")
            ws[f"A{current_row}"] = (
                f"Period: {s_date.strftime('%d-%m-%Y')} to {e_date.strftime('%d-%m-%Y')}"
            )
            ws[f"A{current_row}"].font = Font(bold=True, size=12, color="FFFFFF")
            ws[f"A{current_row}"].fill = PatternFill(
                start_color="366092", end_color="366092", fill_type="solid"
            )
            ws[f"A{current_row}"].alignment = Alignment(
                horizontal="center", vertical="center"
            )
            current_row += 2

            # Summary stats
            ws.merge_cells(f"A{current_row}:E{current_row}")
            ws[f"A{current_row}"] = (
                f"Total Revenue: {report_data.get('total_sales', 0):.2f}"
            )
            ws[f"A{current_row}"].font = Font(bold=True, size=12)
            ws[f"A{current_row}"].alignment = Alignment(horizontal="right")
            current_row += 2

            # === TABLE HEADERS ===
            headers = [
                "Product ID",
                "Product Name",
                "Category",
                "Total Quantity",
                "Total Revenue",
            ]
            for col, header in enumerate(headers, 1):
                cell = ws.cell(row=current_row, column=col, value=header)
                cell.font = self.header_font
                cell.fill = self.header_fill
                cell.alignment = self.header_alignment
                cell.border = self.border
            current_row += 1

            # === DATA ROWS ===
            if not products:
                ws.merge_cells(f"A{current_row}:E{current_row}")
                ws[f"A{current_row}"] = "No sales data found for this week."
                ws[f"A{current_row}"].font = Font(italic=True)
                ws[f"A{current_row}"].alignment = Alignment(horizontal="center")
            else:
                for product in products:
                    ws[f"A{current_row}"] = product.get("product_id", "")
                    ws[f"B{current_row}"] = product.get("name", "")
                    ws[f"C{current_row}"] = product.get("category", "").capitalize()
                    ws[f"D{current_row}"] = product.get("total_quantity", 0)
                    ws[f"E{current_row}"] = f"{product.get('total_revenue', 0):.2f}"

                    # Apply formatting
                    for col in range(1, 6):
                        cell = ws.cell(row=current_row, column=col)
                        cell.font = self.data_font
                        cell.border = self.border
                        if col >= 4:  # Quantity and Revenue
                            cell.alignment = self.currency_alignment
                        else:
                            cell.alignment = self.data_alignment

                    current_row += 1

            # Footer
            current_row += 1
            ws.merge_cells(f"A{current_row}:E{current_row}")
            ws[f"A{current_row}"] = f"Generated on {date.today().strftime('%Y-%m-%d')}"
            ws[f"A{current_row}"].font = Font(italic=True, size=8)
            ws[f"A{current_row}"].alignment = Alignment(horizontal="right")

            # Save the workbook
            wb.save(filepath)
            return filepath

        except Exception as e:
            print(f"Error creating weekly report: {e}")
            return None

    def export_expenses_report(
        self, expenses: List[Dict], title: str, filename: str
    ) -> str:
        """Create a professional Excel report for business expenses"""
        try:
            filepath = os.path.join(self.export_dir, filename)
            wb = openpyxl.Workbook()
            ws = wb.active
            ws.title = "Expenses"

            # Set column widths
            ws.column_dimensions["A"].width = 15  # Date
            ws.column_dimensions["B"].width = 30  # Title/Description
            ws.column_dimensions["C"].width = 15  # Category
            ws.column_dimensions["D"].width = 15  # Amount
            ws.column_dimensions["E"].width = 20  # Payment Method
            ws.column_dimensions["F"].width = 30  # Notes

            current_row = self._write_company_header(ws, "F")

            # Title
            ws.merge_cells(f"A{current_row}:F{current_row}")
            ws[f"A{current_row}"] = title.upper()
            ws[f"A{current_row}"].font = Font(bold=True, size=14, color="FFFFFF")
            ws[f"A{current_row}"].fill = PatternFill(
                start_color="e74c3c", end_color="e74c3c", fill_type="solid"
            )
            ws[f"A{current_row}"].alignment = Alignment(
                horizontal="center", vertical="center"
            )
            current_row += 2

            # Headers
            headers = ["Date", "Description", "Category", "Amount", "Method", "Notes"]
            for col, header in enumerate(headers, 1):
                cell = ws.cell(row=current_row, column=col, value=header)
                cell.font = self.header_font
                cell.fill = PatternFill(
                    start_color="c0392b", end_color="c0392b", fill_type="solid"
                )
                cell.alignment = self.header_alignment
                cell.border = self.border
            current_row += 1

            total_amount = 0
            for exp in expenses:
                ws[f"A{current_row}"] = (
                    exp.get("date", "").split("T")[0]
                    if "T" in exp.get("date", "")
                    else exp.get("date", "")
                )
                ws[f"B{current_row}"] = exp.get("title", "")
                ws[f"C{current_row}"] = exp.get("category", "")
                ws[f"D{current_row}"] = f"{exp.get('amount', 0):.2f}"
                ws[f"E{current_row}"] = exp.get("payment_method", "")
                ws[f"F{current_row}"] = exp.get("notes", "")

                total_amount += exp.get("amount", 0)

                # Formatting
                for col in range(1, 7):
                    cell = ws.cell(row=current_row, column=col)
                    cell.font = self.data_font
                    cell.border = self.border
                    cell.alignment = (
                        self.currency_alignment if col == 4 else self.data_alignment
                    )
                current_row += 1

            # Total Row
            current_row += 1
            ws[f"C{current_row}"] = "GRAND TOTAL"
            ws[f"C{current_row}"].font = Font(bold=True)
            ws[f"D{current_row}"] = f"{total_amount:.2f}"
            ws[f"D{current_row}"].font = Font(bold=True)
            ws[f"D{current_row}"].alignment = self.currency_alignment

            wb.save(filepath)
            return filepath
        except Exception as e:
            print(f"Error creating expenses report: {e}")
            return None
