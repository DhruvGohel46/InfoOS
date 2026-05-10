from datetime import datetime, date
from typing import List, Dict, Optional
from .db_service import DatabaseService


class SummaryService:
    """Service for generating daily sales summaries"""

    def __init__(self, db_service: DatabaseService):
        self.db_service = db_service

    def _normalize_category(self, product_info: Optional[Dict]) -> str:
        if not product_info:
            return "Unknown"
        cat = product_info.get("category_name") or product_info.get("category")
        if not cat:
            return "Unknown"
        return str(cat).strip().title()

    def get_today_summary(self) -> Dict:
        """
        Generate comprehensive daily summary
        Returns summary data including totals, category breakdown, and timing info
        """
        try:
            # Get today's bills
            bills = self.db_service.get_todays_bills()
            today = date.today().strftime("%Y-%m-%d")

            # If no bills today, check for the most recent bills and show them instead
            if not bills:
                all_bills = self.db_service.get_all_bills()
                if all_bills:
                    # Get the most recent date with bills
                    dates_with_bills = set(bill["created_at"].split(" ")[0] for bill in all_bills)
                    if dates_with_bills:
                        most_recent_date = max(dates_with_bills)
                        bills = [
                            bill
                            for bill in all_bills
                            if bill["created_at"].split(" ")[0] == most_recent_date
                        ]
                        today = most_recent_date  # Update today to show the actual data date

            if not bills:
                return {
                    "date": date.today().strftime("%Y-%m-%d"),
                    "total_bills": 0,
                    "total_sales": 0.0,
                    "total_expenses": (
                        sum(expense["amount"] for expense in self.db_service.get_todays_expenses())
                        if hasattr(self.db_service, "get_todays_expenses")
                        else 0.0
                    ),
                    "net_profit": 0.0
                    - (
                        sum(expense["amount"] for expense in self.db_service.get_todays_expenses())
                        if hasattr(self.db_service, "get_todays_expenses")
                        else 0.0
                    ),
                    "category_totals": {},
                    "first_bill_time": None,
                    "last_bill_time": None,
                    "average_bill_value": 0.0,
                }

            # Calculate basic totals
            total_bills = len(bills)
            total_sales = sum(bill["total_amount"] for bill in bills)
            average_bill_value = total_sales / total_bills if total_bills > 0 else 0.0

            # Get timing info
            timestamps = [bill["created_at"] for bill in bills]
            first_bill_time = min(timestamps).split(" ")[1] if timestamps else None
            last_bill_time = max(timestamps).split(" ")[1] if timestamps else None

            # Calculate category totals
            category_totals = self._calculate_category_totals(bills)

            # Get hourly sales breakdown
            hourly_sales = self._calculate_hourly_sales(bills)

            # Get today's expenses
            expenses = self.db_service.get_todays_expenses()
            total_expenses = sum(expense["amount"] for expense in expenses)
            net_profit = total_sales - total_expenses

            return {
                "date": today,
                "total_bills": total_bills,
                "total_sales": total_sales,
                "total_expenses": total_expenses,
                "net_profit": net_profit,
                "category_totals": category_totals,
                "first_bill_time": first_bill_time,
                "last_bill_time": last_bill_time,
                "average_bill_value": average_bill_value,
                "hourly_sales": hourly_sales,
                "peak_hour": self._get_peak_hour(hourly_sales),
                "expense_category_totals": self._calculate_expense_category_totals(expenses),
            }

        except Exception as e:
            print(f"Error generating today's summary: {e}")
            return {
                "date": date.today().strftime("%Y-%m-%d"),
                "total_bills": 0,
                "total_sales": 0.0,
                "category_totals": {},
                "first_bill_time": None,
                "last_bill_time": None,
                "average_bill_value": 0.0,
                "error": str(e),
            }

    def _calculate_category_totals(self, bills: List[Dict]) -> Dict[str, float]:
        """Calculate total sales per category"""
        category_totals = {}

        # Pre-fetch products ONCE and include inactive ones to preserve historical categories
        all_products = self.db_service.get_all_products(include_inactive=True)
        product_map = {p["product_id"]: p for p in all_products}

        for bill in bills:
            # Items are stored as JSON string in SQLite
            import json

            items = json.loads(bill["items"]) if isinstance(bill["items"], str) else bill["items"]

            for product in items:
                prod_info = product_map.get(product["product_id"])
                product_category = self._normalize_category(prod_info)

                line_total = product["price"] * product["quantity"]

                if product_category in category_totals:
                    category_totals[product_category] += line_total
                else:
                    category_totals[product_category] = line_total

        return category_totals

    def _calculate_hourly_sales(self, bills: List[Dict]) -> Dict[str, float]:
        """Calculate sales breakdown by hour"""
        hourly_sales = {}

        for bill in bills:
            try:
                # Extract hour from timestamp (YYYY-MM-DD HH:MM:SS format)
                timestamp = bill["created_at"]
                hour = int(timestamp.split(" ")[1].split(":")[0])
                hour_key = f"{hour:02d}:00"

                if hour_key in hourly_sales:
                    hourly_sales[hour_key] += bill["total_amount"]
                else:
                    hourly_sales[hour_key] = bill["total_amount"]

            except (ValueError, IndexError):
                continue

        return hourly_sales

    def _get_peak_hour(self, hourly_sales: Dict[str, float]) -> Optional[str]:
        """Get the hour with maximum sales"""
        if not hourly_sales:
            return None

        peak_hour = max(hourly_sales.items(), key=lambda x: x[1])
        return peak_hour[0]

    def get_summary_for_date(self, target_date: str) -> Dict:
        """
        Get summary for a specific date
        target_date format: YYYY-MM-DD
        """
        try:
            # Get all bills and filter for target date
            all_bills = self.db_service.get_all_bills()
            bills = [bill for bill in all_bills if bill["created_at"].split(" ")[0] == target_date]

            if not bills:
                expenses = (
                    self.db_service.get_expenses_by_date(target_date)
                    if hasattr(self.db_service, "get_expenses_by_date")
                    else []
                )
                total_expenses = sum(expense["amount"] for expense in expenses)
                return {
                    "date": target_date,
                    "total_bills": 0,
                    "total_sales": 0.0,
                    "total_expenses": total_expenses,
                    "net_profit": 0.0 - total_expenses,
                    "category_totals": {},
                    "first_bill_time": None,
                    "last_bill_time": None,
                    "average_bill_value": 0.0,
                }

            # Calculate summary using existing methods
            total_sales = sum(bill["total_amount"] for bill in bills)
            category_totals = self._calculate_category_totals(bills)
            hourly_sales = self._calculate_hourly_sales(bills)

            # Get first and last bill times
            timestamps = [bill["created_at"] for bill in bills]
            first_bill_time = min(timestamps).split(" ")[1] if timestamps else None
            last_bill_time = max(timestamps).split(" ")[1] if timestamps else None

            # Get expenses
            expenses = (
                self.db_service.get_expenses_by_date(target_date)
                if hasattr(self.db_service, "get_expenses_by_date")
                else []
            )
            total_expenses = sum(expense["amount"] for expense in expenses)
            net_profit = total_sales - total_expenses

            return {
                "date": target_date,
                "total_bills": len(bills),
                "total_sales": total_sales,
                "total_expenses": total_expenses,
                "net_profit": net_profit,
                "category_totals": category_totals,
                "hourly_sales": hourly_sales,
                "first_bill_time": first_bill_time,
                "last_bill_time": last_bill_time,
                "average_bill_value": total_sales / len(bills) if bills else 0.0,
                "peak_hour": self._get_peak_hour(hourly_sales),
                "expense_category_totals": self._calculate_expense_category_totals(expenses),
            }

        except Exception as e:
            print(f"Error getting summary for date {target_date}: {e}")
            return {
                "date": target_date,
                "total_bills": 0,
                "total_sales": 0.0,
                "category_totals": {},
                "first_bill_time": None,
                "last_bill_time": None,
                "average_bill_value": 0.0,
                "error": str(e),
            }

    def get_top_selling_products(self, limit: int = 10) -> List[Dict]:
        """Get top selling products for today"""
        try:
            bills = self.xml_db_service.get_today_bills()
            product_sales = {}

            for bill in bills:
                for product in bill["products"]:
                    product_id = product["product_id"]
                    quantity = product["quantity"]
                    total = product["price"] * quantity

                    if product_id in product_sales:
                        product_sales[product_id]["quantity"] += quantity
                        product_sales[product_id]["total"] += total
                    else:
                        product_sales[product_id] = {
                            "name": product["name"],
                            "quantity": quantity,
                            "total": total,
                        }

            # Sort by total sales and return top N
            sorted_products = sorted(
                product_sales.items(), key=lambda x: x[1]["total"], reverse=True
            )

            result = []
            for product_id, data in sorted_products[:limit]:
                result.append(
                    {
                        "product_id": product_id,
                        "name": data["name"],
                        "quantity_sold": data["quantity"],
                        "total_sales": data["total"],
                    }
                )

            return result

        except Exception as e:
            print(f"Error getting top selling products: {e}")
            return []

    def get_monthly_product_summary(self, month: int, year: int) -> Dict:
        """
        Generate monthly product-wise sales summary
        Returns list of products with aggregated sales data
        """
        try:
            bills = self.db_service.get_monthly_bills(month, year)

            if not bills:
                return {
                    "month": month,
                    "year": year,
                    "total_sales": 0.0,
                    "products": [],
                }

            product_sales = {}
            import json

            # Cache products for category lookup
            all_products = self.db_service.get_all_products(include_inactive=True)
            product_map = {p["product_id"]: p for p in all_products}

            for bill in bills:
                items = (
                    json.loads(bill["items"]) if isinstance(bill["items"], str) else bill["items"]
                )

                for item in items:
                    product_id = item["product_id"]

                    if product_id not in product_sales:
                        # Get category from map or fallback to unknown
                        product_info = product_map.get(product_id)
                        category = self._normalize_category(product_info)

                        product_sales[product_id] = {
                            "product_id": product_id,
                            "name": item["name"],
                            "category": category,
                            "total_quantity": 0,
                            "total_revenue": 0.0,
                        }

                    product_sales[product_id]["total_quantity"] += item["quantity"]
                    product_sales[product_id]["total_revenue"] += item["price"] * item["quantity"]

            # Convert to list and sort by total revenue (descending)
            sorted_products = sorted(
                product_sales.values(), key=lambda x: x["total_revenue"], reverse=True
            )

            total_sales = sum(p["total_revenue"] for p in sorted_products)

            return {
                "month": month,
                "year": year,
                "total_sales": total_sales,
                "products": sorted_products,
            }

        except Exception as e:
            print(f"Error generating monthly summary: {e}")
            return {"month": month, "year": year, "error": str(e)}

    def get_weekly_product_summary(self, reference_date: str) -> Dict:
        """
        Generate weekly product-wise sales summary (Mon-Sun) based on reference date
        Returns summary with products and week date range
        """
        try:
            from datetime import timedelta

            # Parse reference date
            ref_date = datetime.strptime(reference_date, "%Y-%m-%d").date()

            # Calculate start (Monday) and end (Sunday) of the week
            start_date = ref_date - timedelta(days=ref_date.weekday())
            end_date = start_date + timedelta(days=6)

            start_str = start_date.strftime("%Y-%m-%d")
            end_str = end_date.strftime("%Y-%m-%d")

            # Fetch bills for date range
            bills = self.db_service.get_bills_by_date_range(start_str, end_str)

            if not bills:
                return {
                    "start_date": start_str,
                    "end_date": end_str,
                    "total_sales": 0.0,
                    "products": [],
                }

            # Reuse aggregation logic (duplicated for safety/independence as per plan)
            product_sales = {}
            import json

            # Cache products for category lookup
            all_products = self.db_service.get_all_products(include_inactive=True)
            product_map = {p["product_id"]: p for p in all_products}

            for bill in bills:
                items = (
                    json.loads(bill["items"]) if isinstance(bill["items"], str) else bill["items"]
                )

                for item in items:
                    product_id = item["product_id"]

                    if product_id not in product_sales:
                        product_info = product_map.get(product_id)
                        category = self._normalize_category(product_info)

                        product_sales[product_id] = {
                            "product_id": product_id,
                            "name": item["name"],
                            "category": category,
                            "total_quantity": 0,
                            "total_revenue": 0.0,
                        }

                    product_sales[product_id]["total_quantity"] += item["quantity"]
                    product_sales[product_id]["total_revenue"] += item["price"] * item["quantity"]

            # Sort by revenue
            sorted_products = sorted(
                product_sales.values(), key=lambda x: x["total_revenue"], reverse=True
            )

            total_sales = sum(p["total_revenue"] for p in sorted_products)

            return {
                "start_date": start_str,
                "end_date": end_str,
                "total_sales": total_sales,
                "products": sorted_products,
            }

        except Exception as e:
            print(f"Error generating weekly summary: {e}")
            return {"error": str(e)}

    def _calculate_expense_category_totals(self, expenses: List[Dict]) -> Dict[str, float]:
        """Calculate total expenses per category"""
        totals = {}
        for exp in expenses:
            cat = exp.get("category", "Other")
            amount = exp.get("amount", 0.0)
            totals[cat] = totals.get(cat, 0.0) + amount
        return totals

    def get_range_summary(self, range_type: str, reference_date: str) -> Dict:
        """
        Generate summary for a range: week, month, year
        Aggregates sales and expenses
        """
        try:
            from datetime import timedelta
            import calendar

            ref_date = datetime.strptime(reference_date, "%Y-%m-%d").date()

            start_date = ref_date
            end_date = ref_date

            if range_type == "week":
                start_date = ref_date - timedelta(days=ref_date.weekday())
                end_date = start_date + timedelta(days=6)
            elif range_type == "month":
                start_date = ref_date.replace(day=1)
                last_day = calendar.monthrange(ref_date.year, ref_date.month)[1]
                end_date = ref_date.replace(day=last_day)
            elif range_type == "year":
                start_date = ref_date.replace(month=1, day=1)
                end_date = ref_date.replace(month=12, day=31)

            start_str = start_date.strftime("%Y-%m-%d")
            end_str = end_date.strftime("%Y-%m-%d")

            # Fetch bills and expenses for range
            bills = self.db_service.get_bills_by_date_range(start_str, end_str)
            expenses = (
                self.db_service.get_expenses_by_range(start_str, end_str)
                if hasattr(self.db_service, "get_expenses_by_range")
                else []
            )

            total_sales = sum(bill["total_amount"] for bill in bills)
            total_expenses = sum(expense["amount"] for expense in expenses)

            # Category totals
            category_totals = self._calculate_category_totals(bills)
            expense_category_totals = self._calculate_expense_category_totals(expenses)

            # Product breakdown (reusing logic)
            product_sales = {}
            import json

            all_products = self.db_service.get_all_products(include_inactive=True)
            product_map = {p["product_id"]: p for p in all_products}

            for bill in bills:
                items = (
                    json.loads(bill["items"]) if isinstance(bill["items"], str) else bill["items"]
                )
                for item in items:
                    pid = item["product_id"]
                    if pid not in product_sales:
                        pinfo = product_map.get(pid)
                        product_sales[pid] = {
                            "name": item["name"],
                            "category": self._normalize_category(pinfo),
                            "quantity": 0,
                            "total_amount": 0.0,
                        }
                    product_sales[pid]["quantity"] += item["quantity"]
                    product_sales[pid]["total_amount"] += item["price"] * item["quantity"]

            sorted_products = sorted(
                product_sales.values(), key=lambda x: x["total_amount"], reverse=True
            )

            return {
                "range": range_type,
                "start_date": start_str,
                "end_date": end_str,
                "total_sales": total_sales,
                "total_expenses": total_expenses,
                "net_profit": total_sales - total_expenses,
                "total_bills": len(bills),
                "category_totals": category_totals,
                "expense_category_totals": expense_category_totals,
                "average_bill_value": total_sales / len(bills) if bills else 0.0,
                "products": sorted_products,
            }
        except Exception as e:
            print(f"Error in range summary: {e}")
            return {"error": str(e)}
