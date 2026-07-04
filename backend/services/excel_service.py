import os
from datetime import date, datetime
from typing import List, Dict
import csv


class ExcelService:
    """Excel export service for daily sales reports"""

    def __init__(self, data_dir: str = None):
        from config import Config
        self.data_dir = data_dir or Config.DATA_DIR
        self.export_dir = os.path.join(self.data_dir, "exports")
        os.makedirs(self.export_dir, exist_ok=True)

    def export_today_sales_to_csv(self, bills: List[Dict]) -> str:
        """
        Export today's sales to CSV format (Excel-compatible)
        Returns the file path of the exported file
        """
        try:
            today_str = date.today().strftime("%Y-%m-%d")
            filename = f"sales_report_{today_str}.csv"
            filepath = os.path.join(self.export_dir, filename)

            # CSV headers
            headers = [
                "Bill No",
                "Date",
                "Time",
                "Product ID",
                "Product Name",
                "Category",
                "Quantity",
                "Unit Price",
                "Total Price",
                "Bill Total",
            ]

            with open(filepath, "w", newline="", encoding="utf-8") as csvfile:
                writer = csv.writer(csvfile)

                # Write header
                writer.writerow(headers)

                # Write bill data
                for bill in bills:
                    for product in bill["products"]:
                        row = [
                            bill["bill_no"],
                            bill["date"],
                            bill["time"],
                            product["product_id"],
                            product["name"],
                            product.get("category", "N/A"),  # Category might not be in bill data
                            product["quantity"],
                            f"{product['price']:.2f}",
                            f"{product['price'] * product['quantity']:.2f}",
                            f"{bill['total']:.2f}",
                        ]
                        writer.writerow(row)

            return filepath

        except Exception as e:
            print(f"Error exporting to CSV: {e}")
            return None

    def export_summary_to_csv(self, summary_data: Dict) -> str:
        """
        Export daily summary to CSV format
        Returns the file path of the exported file
        """
        try:
            today_str = date.today().strftime("%Y-%m-%d")
            filename = f"summary_report_{today_str}.csv"
            filepath = os.path.join(self.export_dir, filename)

            with open(filepath, "w", newline="", encoding="utf-8") as csvfile:
                writer = csv.writer(csvfile)

                # Write summary headers and data
                writer.writerow(["Metric", "Value"])
                writer.writerow(["Date", summary_data.get("date", today_str)])
                writer.writerow(["Total Bills", summary_data.get("total_bills", 0)])
                writer.writerow(["Total Sales", f"{summary_data.get('total_sales', 0):.2f}"])
                writer.writerow(["First Bill Time", summary_data.get("first_bill_time", "N/A")])
                writer.writerow(["Last Bill Time", summary_data.get("last_bill_time", "N/A")])

                # Category-wise totals
                writer.writerow(["", ""])  # Empty row
                writer.writerow(["Category", "Total Sales"])

                category_totals = summary_data.get("category_totals", {})
                for category, total in category_totals.items():
                    writer.writerow([category, f"{total:.2f}"])

            return filepath

        except Exception as e:
            print(f"Error exporting summary to CSV: {e}")
            return None

    def get_csv_content(self, filepath: str) -> str:
        """Read CSV file content as string"""
        try:
            if not os.path.exists(filepath):
                return "File not found"

            with open(filepath, "r", encoding="utf-8") as f:
                return f.read()

        except Exception as e:
            print(f"Error reading CSV file: {e}")
            return f"Error reading file: {e}"

    def create_detailed_sales_report(self, bills: List[Dict], summary_data: Dict) -> str:
        """
        Create a comprehensive sales report with both detailed bills and summary
        Returns the file path of the exported file
        """
        try:
            today_str = date.today().strftime("%Y-%m-%d")
            filename = f"detailed_sales_report_{today_str}.csv"
            filepath = os.path.join(self.export_dir, filename)

            with open(filepath, "w", newline="", encoding="utf-8") as csvfile:
                writer = csv.writer(csvfile)

                # Write summary section first
                writer.writerow(["=== DAILY SALES SUMMARY ==="])
                writer.writerow(["Date", summary_data.get("date", today_str)])
                writer.writerow(["Total Bills", summary_data.get("total_bills", 0)])
                writer.writerow(["Total Sales", f"{summary_data.get('total_sales', 0):.2f}"])
                writer.writerow(["First Bill Time", summary_data.get("first_bill_time", "N/A")])
                writer.writerow(["Last Bill Time", summary_data.get("last_bill_time", "N/A")])

                # Category-wise totals
                writer.writerow(["", ""])  # Empty row
                writer.writerow(["=== CATEGORY WISE SALES ==="])
                writer.writerow(["Category", "Total Sales"])

                category_totals = summary_data.get("category_totals", {})
                for category, total in category_totals.items():
                    writer.writerow([category, f"{total:.2f}"])

                # Detailed bills section
                writer.writerow(["", ""])  # Empty row
                writer.writerow(["=== DETAILED BILLS ==="])

                # Detailed headers
                detailed_headers = [
                    "Bill No",
                    "Date",
                    "Time",
                    "Product ID",
                    "Product Name",
                    "Quantity",
                    "Unit Price",
                    "Line Total",
                    "Bill Total",
                ]
                writer.writerow(detailed_headers)

                # Write detailed bill data
                for bill in bills:
                    for product in bill["products"]:
                        row = [
                            bill["bill_no"],
                            bill["date"],
                            bill["time"],
                            product["product_id"],
                            product["name"],
                            product["quantity"],
                            f"{product['price']:.2f}",
                            f"{product['price'] * product['quantity']:.2f}",
                            f"{bill['total']:.2f}",
                        ]
                        writer.writerow(row)

            return filepath

        except Exception as e:
            print(f"Error creating detailed sales report: {e}")
            return None

    def generate_bills_xml(self, bills: List[Dict]) -> str:
        """Generate XML content for bills"""
        try:
            xml_lines = ['<?xml version="1.0" encoding="UTF-8"?>', "<bills>"]

            for bill in bills:
                xml_lines.append(
                    f'  <bill id="{bill["bill_no"]}" total="{bill["total"]}" date="{bill["created_at"]}">'
                )

                if "products" in bill:
                    for product in bill["products"]:
                        xml_lines.append(
                            f'    <product id="{product["product_id"]}" name="{product["name"]}" price="{product["price"]}" quantity="{product["quantity"]}" />'
                        )

                xml_lines.append("  </bill>")

            xml_lines.append("</bills>")

            return "\n".join(xml_lines)

        except Exception as e:
            print(f"Error generating XML: {e}")
            return '<?xml version="1.0" encoding="UTF-8"?><bills><error>Failed to generate XML</error></bills>'

    def create_sample_report(self) -> str:
        """Create a sample sales report for demonstration when no bills exist"""
        try:
            today_str = date.today().strftime("%Y-%m-%d")
            filename = f"sample_sales_report_{today_str}.csv"
            filepath = os.path.join(self.export_dir, filename)

            with open(filepath, "w", newline="", encoding="utf-8") as csvfile:
                writer = csv.writer(csvfile)

                # Write summary section
                writer.writerow(["=== DAILY SALES SUMMARY ==="])
                writer.writerow(["Date", today_str])
                writer.writerow(["Total Bills", 0])
                writer.writerow(["Total Sales", "0.00"])
                writer.writerow(["First Bill Time", "N/A"])
                writer.writerow(["Last Bill Time", "N/A"])

                # Category-wise totals
                writer.writerow(["", ""])  # Empty row
                writer.writerow(["=== CATEGORY WISE SALES ==="])
                writer.writerow(["Category", "Total Sales"])
                writer.writerow(["coldrink", "0.00"])
                writer.writerow(["paan", "0.00"])
                writer.writerow(["other", "0.00"])

                # Detailed bills section
                writer.writerow(["", ""])  # Empty row
                writer.writerow(["=== DETAILED BILLS ==="])
                writer.writerow(["Note: No bills found for today. This is a sample report format."])

                # Detailed headers
                detailed_headers = [
                    "Bill No",
                    "Date",
                    "Time",
                    "Product ID",
                    "Product Name",
                    "Quantity",
                    "Unit Price",
                    "Line Total",
                    "Bill Total",
                ]
                writer.writerow(detailed_headers)

                # Sample data
                sample_bills = [
                    {
                        "bill_no": "SAMPLE001",
                        "date": today_str,
                        "time": "12:00:00",
                        "products": [
                            {
                                "product_id": "SAMPLE001",
                                "name": "Sample Cold Drink",
                                "quantity": 2,
                                "price": 25.00,
                            },
                            {
                                "product_id": "SAMPLE002",
                                "name": "Sample Paan",
                                "quantity": 1,
                                "price": 15.00,
                            },
                        ],
                        "total": 65.00,
                    }
                ]

                for bill in sample_bills:
                    for product in bill["products"]:
                        row = [
                            bill["bill_no"],
                            bill["date"],
                            bill["time"],
                            product["product_id"],
                            product["name"],
                            product["quantity"],
                            f"{product['price']:.2f}",
                            f"{product['price'] * product['quantity']:.2f}",
                            f"{bill['total']:.2f}",
                        ]
                        writer.writerow(row)

            return filepath

        except Exception as e:
            print(f"Error creating sample report: {e}")
            return None
