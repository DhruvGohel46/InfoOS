"""
services/printer_service.py
===========================
Professional Windows-native thermal printer service for InfoOS POS.

This module provides:
- Thread-safe print queue management
- Direct Windows Print Spooler API integration via pywin32
- ESC/POS byte stream communication
- KOT and Bill printing with auto-cut
- Error handling for printer states
- Production-ready architecture

Architecture
------------
- Uses printer_manager.py for printer discovery and management
- Uses escpos_formatter.py for ESC/POS byte stream generation
- Implements thread-safe printing with Lock
- No browser dialogs, no PDF generation, direct RAW printing

Platform notes
--------------
* win32print is Windows-ONLY and must be lazy-loaded
* On non-Windows hosts, all methods return safe fallback values
"""

import re
import threading
from typing import Dict, Optional, Any

from .printer_manager import PrinterManager, load_win32_modules
from .escpos_formatter import build_kot, build_bill, build_test_print
from .db_service import DatabaseService


class PrinterService:
    """
    Production-grade thermal printer service for Windows POS terminals.
    
    Features:
    - Thread-safe print queue with Lock
    - Direct Windows Print Spooler API integration
    - ESC/POS byte stream communication
    - Auto-cut functionality
    - Comprehensive error handling
    - Settings fetched from database (no hardcoding)
    """

    def __init__(self):
        """Initialize the printer service with thread-safe queue."""
        self.db_service = DatabaseService()
        self.printer_manager = PrinterManager()
        self.print_lock = threading.Lock()
        self.printer_name: Optional[str] = None
        self._initialized = False

    def _ensure_initialized(self) -> None:
        """Lazy initialization - only initialize when needed."""
        if not self._initialized:
            try:
                settings = self._get_settings()
                if settings.get("printer_enabled"):
                    # Try to get thermal printer first, then default
                    self.printer_name = self.printer_manager.get_thermal_printer()
                    if not self.printer_name:
                        self.printer_name = self.printer_manager.get_default_printer()
                self._initialized = True
            except Exception as exc:
                print(f"[PrinterService] Error initializing printer: {exc}")
                self._initialized = True  # Mark as initialized even if failed to avoid repeated errors

    def _get_settings(self) -> Dict[str, Any]:
        """
        Fetch current printer settings from the database.
        
        Returns:
            Dictionary with printer settings (no hardcoded values)
        """
        try:
            settings = self.db_service.get_all_settings()
        except Exception as exc:
            print(f"[PrinterService] Error fetching settings: {exc}")
            settings = {}

        return {
            "shop_name": settings.get("shop_name", ""),
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
    # Public print methods (thread-safe)
    # ------------------------------------------------------------------

    def print_bill(self, bill_data: Dict) -> Dict[str, Any]:
        """
        Print a customer bill to the thermal printer.
        
        Args:
            bill_data: Order data dictionary
            
        Returns:
            Dictionary with:
            - success: Boolean indicating success
            - error: Error message if failed
        """
        with self.print_lock:
            return self._print_bill_impl(bill_data)

    def print_kot(self, bill_data: Dict) -> Dict[str, Any]:
        """
        Print a Kitchen Order Ticket (KOT) to the thermal printer.
        
        Args:
            bill_data: Order data dictionary
            
        Returns:
            Dictionary with:
            - success: Boolean indicating success
            - error: Error message if failed
        """
        with self.print_lock:
            return self._print_kot_impl(bill_data)

    def print_bill_and_kot(self, bill_data: Dict) -> Dict[str, Any]:
        """
        Print Bill and KOT sequentially with auto-cut between them.
        
        Workflow:
        1. Print Bill
        2. Wait for completion
        3. Auto-cut
        4. Print KOT
        5. Auto-cut
        
        Args:
            bill_data: Order data dictionary
            
        Returns:
            Dictionary with:
            - success: Boolean indicating success
            - error: Error message if failed
        """
        with self.print_lock:
            # Print Bill first
            bill_result = self._print_bill_impl(bill_data)
            if not bill_result["success"]:
                return bill_result
            
            # Print KOT second
            kot_result = self._print_kot_impl(bill_data)
            return kot_result

    def print_test_page(self) -> Dict[str, Any]:
        """
        Print a test page to verify printer functionality.
        
        Returns:
            Dictionary with:
            - success: Boolean indicating success
            - error: Error message if failed
        """
        with self.print_lock:
            return self._print_test_impl()

    # ------------------------------------------------------------------
    # Implementation methods (not thread-safe, must be called with lock)
    # ------------------------------------------------------------------

    def _print_bill_impl(self, bill_data: Dict) -> Dict[str, Any]:
        """Implementation of bill printing (must be called with lock held)."""
        try:
            self._ensure_initialized()
            settings = self._get_settings()
            if not settings["printer_enabled"]:
                return {"success": True, "error": None}

            # Validate printer
            if not self.printer_name:
                return {"success": False, "error": "No printer configured"}
            
            is_valid, error = self.printer_manager.validate_printer(self.printer_name)
            if not is_valid:
                return {"success": False, "error": error}

            # Build ESC/POS bytes
            esc_pos_bytes = build_bill(bill_data, settings)

            # Send to printer
            success = self._send_raw(self.printer_name, esc_pos_bytes, "Bill")
            
            if success:
                return {"success": True, "error": None}
            else:
                return {"success": False, "error": "Failed to send to printer"}

        except Exception as exc:
            print(f"[PrinterService] Error printing bill: {exc}")
            return {"success": False, "error": str(exc)}

    def _print_kot_impl(self, bill_data: Dict) -> Dict[str, Any]:
        """Implementation of KOT printing (must be called with lock held)."""
        try:
            self._ensure_initialized()
            settings = self._get_settings()
            if not settings["printer_enabled"]:
                return {"success": True, "error": None}

            # Validate printer
            if not self.printer_name:
                return {"success": False, "error": "No printer configured"}
            
            is_valid, error = self.printer_manager.validate_printer(self.printer_name)
            if not is_valid:
                return {"success": False, "error": error}

            # Build ESC/POS bytes
            esc_pos_bytes = build_kot(bill_data, settings)

            # Send to printer
            success = self._send_raw(self.printer_name, esc_pos_bytes, "KOT")
            
            if success:
                return {"success": True, "error": None}
            else:
                return {"success": False, "error": "Failed to send to printer"}

        except Exception as exc:
            print(f"[PrinterService] Error printing KOT: {exc}")
            return {"success": False, "error": str(exc)}

    def _print_test_impl(self) -> Dict[str, Any]:
        """Implementation of test page printing (must be called with lock held)."""
        try:
            self._ensure_initialized()
            settings = self._get_settings()

            # Validate printer
            if not self.printer_name:
                return {"success": False, "error": "No printer configured"}
            
            is_valid, error = self.printer_manager.validate_printer(self.printer_name)
            if not is_valid:
                return {"success": False, "error": error}

            # Build ESC/POS bytes
            esc_pos_bytes = build_test_print(settings)

            # Send to printer
            success = self._send_raw(self.printer_name, esc_pos_bytes, "TestPage")
            
            if success:
                return {"success": True, "error": None}
            else:
                return {"success": False, "error": "Failed to send to printer"}

        except Exception as exc:
            print(f"[PrinterService] Error printing test page: {exc}")
            return {"success": False, "error": str(exc)}

    # ------------------------------------------------------------------
    # Low-level printer I/O (Windows Print Spooler API)
    # ------------------------------------------------------------------

    def _send_raw(self, printer_name: str, data: bytes, job_name: str = "PrintJob") -> bool:
        """
        Send raw bytes to Windows printer via Print Spooler API.
        
        Args:
            printer_name: Name of the printer
            data: Raw bytes to send
            job_name: Name of the print job
            
        Returns:
            True if successful, False otherwise
        """
        modules = load_win32_modules()
        if not modules:
            _log_unavailable("_send_raw")
            print(f"=== FALLBACK: {job_name} ===")
            print(data.decode("utf-8", errors="ignore"))
            return True

        win32print = modules["win32print"]

        try:
            hPrinter = win32print.OpenPrinter(printer_name)
            try:
                win32print.StartDocPrinter(hPrinter, 1, (job_name, None, "RAW"))
                try:
                    win32print.StartPagePrinter(hPrinter)
                    win32print.WritePrinter(hPrinter, data)
                    win32print.EndPagePrinter(hPrinter)
                    return True
                finally:
                    win32print.EndDocPrinter(hPrinter)
            finally:
                win32print.ClosePrinter(hPrinter)

        except Exception as exc:
            print(f"[PrinterService] Error sending raw data to printer: {exc}")
            return False

    # ------------------------------------------------------------------
    # Printer management methods
    # ------------------------------------------------------------------

    def get_available_printers(self, force_refresh: bool = False) -> list:
        """
        Get list of available printers.
        
        Args:
            force_refresh: Force refresh of printer list
            
        Returns:
            List of printer dictionaries
        """
        return self.printer_manager.get_available_printers(force_refresh)

    def get_printer_status(self) -> Dict[str, Any]:
        """
        Get current printer status.
        
        Returns:
            Dictionary with printer status information
        """
        if not self.printer_name:
            return {
                "printer_name": None,
                "available": False,
                "status": "No printer configured",
                "error": None,
            }
        
        status = self.printer_manager.get_printer_status(self.printer_name)
        status["printer_name"] = self.printer_name
        return status

    def set_printer(self, printer_name: str) -> Dict[str, Any]:
        """
        Set the printer to use for printing.
        
        Args:
            printer_name: Name of the printer to use
            
        Returns:
            Dictionary with success status
        """
        is_valid, error = self.printer_manager.validate_printer(printer_name)
        if is_valid:
            self.printer_name = printer_name
            return {"success": True, "error": None}
        else:
            return {"success": False, "error": error}


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

def _log_unavailable(caller: str) -> None:
    """Emit a structured warning when Windows printer modules are unavailable."""
    msg = (
        f"[PrinterService.{caller}] Windows printer modules (pywin32) are "
        "unavailable on this platform. Using fallback mode."
    )
    try:
        from flask import current_app  # noqa: PLC0415
        current_app.logger.warning(msg)
    except RuntimeError:
        print(msg)
