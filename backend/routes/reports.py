from flask import Blueprint, request, jsonify, send_file
from auth import require_auth
from sqlalchemy import extract
from services.db_service import DatabaseService
from services.excel_service import ExcelService
from services.excel_xlsx_service import ExcelXLSXService
from services.summary_service import SummaryService
from error_handler import safe_route, ValidationError, NotFoundError
import os
import logging
from datetime import date

logger = logging.getLogger(__name__)

reports_bp = Blueprint("reports", __name__, url_prefix="/api/reports")
db = DatabaseService()
excel_service = ExcelService()
excel_xlsx_service = ExcelXLSXService()
summary_service = SummaryService(db)


@reports_bp.route("/excel/today", methods=["GET"])
@safe_route
def export_today_excel():
    """Export sales data to Excel (.xlsx format) for today or a specific date."""
    target_date_str = request.args.get("date")

    if target_date_str:
        bills = db.get_bills_by_date_range(target_date_str, target_date_str)
        download_name = f"sales_report_{target_date_str}.xlsx"
        summary = summary_service.get_summary_for_date(target_date_str)
    else:
        bills = db.get_todays_bills()
        today_str = date.today().strftime("%Y-%m-%d")
        download_name = f"sales_report_{today_str}.xlsx"
        summary = summary_service.get_today_summary()

    if not bills:
        if target_date_str:
            raise NotFoundError(
                f"No bills found for date {target_date_str}", code="NO_BILLS_FOR_DATE"
            )

        # Return a sample Excel file when no bills exist (only for Today default)
        today = date.today().strftime("%Y-%m-%d")
        sample_filepath = excel_xlsx_service.create_sample_report()
        if sample_filepath:
            return send_file(
                sample_filepath,
                as_attachment=True,
                download_name=f"sample_sales_report_{today}.xlsx",
                mimetype="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            )
        else:
            raise Exception(
                "No bills found for today and failed to create sample report"
            )

    report_type = request.args.get("type", "detailed")

    if report_type == "summary":
        filepath = excel_xlsx_service.export_summary_report(summary)
    elif report_type == "simple":
        filepath = excel_xlsx_service.export_simple_sales_report(bills)
    else:
        filepath = excel_xlsx_service.export_detailed_sales_report(bills, summary)

    if not filepath:
        raise Exception("Failed to generate Excel report")

    return send_file(
        filepath,
        as_attachment=True,
        download_name=os.path.basename(filepath),
        mimetype="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    )


@reports_bp.route("/csv/today", methods=["GET"])
@safe_route
def export_today_csv():
    """Export today's bills data as CSV."""
    bills = db.get_todays_bills()

    if not bills:
        raise NotFoundError("No bills found for today", code="NO_BILLS_TODAY")

    today_str = date.today().strftime("%Y-%m-%d")
    temp_filepath = os.path.join(excel_service.export_dir, f"bills_{today_str}.csv")

    csv_content = excel_service.generate_bills_csv(bills)

    with open(temp_filepath, "w", encoding="utf-8") as f:
        f.write(csv_content)

    return send_file(
        temp_filepath,
        as_attachment=True,
        download_name=f"bills_{today_str}.csv",
        mimetype="text/csv",
    )


@reports_bp.route("/preview/excel", methods=["GET"])
@safe_route
def preview_excel_data():
    """Preview Excel data without downloading."""
    bills = db.get_todays_bills()

    if not bills:
        raise NotFoundError("No bills found for today", code="NO_BILLS_TODAY")

    filepath = excel_service.export_today_sales_to_csv(bills)

    if not filepath:
        raise Exception("Failed to generate preview")

    content = excel_service.get_csv_content(filepath)

    return (
        jsonify(
            {
                "success": True,
                "preview": content,
                "row_count": len(bills),
                "message": "Preview generated successfully",
            }
        ),
        200,
    )


@reports_bp.route("/preview/xml", methods=["GET"])
@safe_route
def preview_xml_data():
    """Preview XML data without downloading."""
    bills = db.get_todays_bills()

    if not bills:
        raise NotFoundError("No bills found for today", code="NO_BILLS_TODAY")

    xml_content = excel_service.generate_bills_xml(bills)

    return (
        jsonify(
            {
                "success": True,
                "preview": xml_content,
                "message": "XML preview generated successfully",
            }
        ),
        200,
    )


@reports_bp.route("/available-reports", methods=["GET"])
@safe_route
def get_available_reports():
    """Get list of available reports and their info."""
    reports_info = {
        "excel_reports": [
            {
                "name": "Simple Sales Report",
                "endpoint": "/api/reports/excel/today?type=simple",
                "description": "Basic sales data with bill details",
                "format": "CSV",
            },
            {
                "name": "Summary Report",
                "endpoint": "/api/reports/excel/today?type=summary",
                "description": "Daily summary with category totals",
                "format": "CSV",
            },
            {
                "name": "Detailed Sales Report",
                "endpoint": "/api/reports/excel/today?type=detailed",
                "description": "Comprehensive report with summary and detailed bills",
                "format": "CSV",
            },
        ],
        "xml_reports": [
            {
                "name": "Today's Bills CSV",
                "endpoint": "/api/reports/csv/today",
                "description": "Raw CSV data of today's bills",
                "format": "CSV",
            }
        ],
        "preview_endpoints": [
            {
                "name": "Excel Preview",
                "endpoint": "/api/reports/preview/excel",
                "description": "Preview Excel data before download",
            },
            {
                "name": "XML Preview",
                "endpoint": "/api/reports/preview/xml",
                "description": "Preview XML data before download",
            },
        ],
    }

    return jsonify({"success": True, "reports": reports_info}), 200


@reports_bp.route("/excel/monthly", methods=["GET"])
@safe_route
def export_monthly_excel():
    """Export monthly product-wise sales report."""
    month = request.args.get("month", type=int)
    year = request.args.get("year", type=int)

    if not month or not year:
        raise ValidationError("Month and Year are required", code="MISSING_MONTH_YEAR")

    if not (1 <= month <= 12):
        raise ValidationError("Invalid month", code="INVALID_MONTH")

    summary = summary_service.get_monthly_product_summary(month, year)

    if "error" in summary:
        raise Exception(f"Error generating summary: {summary['error']}")

    filepath = excel_xlsx_service.export_monthly_product_sales_report(summary)

    if not filepath:
        raise Exception("Failed to generate Excel report")

    return send_file(
        filepath,
        as_attachment=True,
        download_name=os.path.basename(filepath),
        mimetype="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    )


@reports_bp.route("/excel/weekly", methods=["GET"])
@safe_route
def export_weekly_excel():
    """Export weekly product-wise sales report."""
    date_param = request.args.get("date")

    if not date_param:
        raise ValidationError("Date parameter is required", code="MISSING_DATE")

    summary = summary_service.get_weekly_product_summary(date_param)

    if "error" in summary:
        raise Exception(f"Error generating summary: {summary['error']}")

    filepath = excel_xlsx_service.export_weekly_product_sales_report(summary)

    if not filepath:
        raise Exception("Failed to generate Excel report")

    return send_file(
        filepath,
        as_attachment=True,
        download_name=os.path.basename(filepath),
        mimetype="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    )


@reports_bp.route("/excel/expenses", methods=["GET"])
@safe_route
def export_expenses():
    """Export expenses for a simplified range."""
    from models import Expense
    from sqlalchemy import func
    from datetime import timedelta

    range_type = request.args.get("range", "today")
    today = date.today()

    query = Expense.query
    if range_type == "today":
        query = query.filter(func.date(Expense.date) == today)
        title = f"Daily Expenses - {today}"
        filename = f"Expenses_{today}.xlsx"
    elif range_type == "week":
        start_week = today - timedelta(days=today.weekday())
        query = query.filter(Expense.date >= start_week)
        title = f"Weekly Expenses - {start_week} to {today}"
        filename = f"Expenses_Weekly_{today}.xlsx"
    elif range_type == "month":
        query = query.filter(
            extract("month", Expense.date) == today.month,
            extract("year", Expense.date) == today.year,
        )
        title = f"Monthly Expenses - {today.strftime('%B %Y')}"
        filename = f"Expenses_Monthly_{today.month}_{today.year}.xlsx"
    elif range_type == "year":
        query = query.filter(extract("year", Expense.date) == today.year)
        title = f"Yearly Expenses - {today.year}"
        filename = f"Expenses_Yearly_{today.year}.xlsx"
    else:
        title = f"Expenses - {today}"
        filename = f"Expenses_{today}.xlsx"

    expenses = query.order_by(Expense.date.desc()).all()
    expense_list = [e.to_dict() for e in expenses]

    filepath = excel_xlsx_service.export_expenses_report(expense_list, title, filename)

    if not filepath:
        raise Exception("Failed to generate report")

    return send_file(
        filepath,
        as_attachment=True,
        download_name=filename,
        mimetype="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    )
