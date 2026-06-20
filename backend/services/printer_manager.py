"""
services/printer_manager.py
============================
Printer discovery, selection, and management for Windows thermal printers.

This module handles:
- Printer discovery from Windows Print Spooler
- Default printer detection
- Printer status validation
- Connection testing
- Thermal printer detection (Champ, RP-series, etc.)

Platform notes
--------------
* win32print is Windows-ONLY and must be lazy-loaded
* On non-Windows hosts, all methods return safe fallback values
"""

import platform
from typing import Dict, List, Optional, Tuple


def is_windows() -> bool:
    """Return True when running on Microsoft Windows."""
    return platform.system() == "Windows"


def load_win32_modules() -> Optional[Dict]:
    """
    Attempt to import Windows printer modules at call time (lazy import).

    Returns a dict of loaded modules on success, or None when:
      - the host OS is not Windows, OR
      - pywin32 is not installed in the current environment.
    """
    if not is_windows():
        return None

    try:
        import win32print  # noqa: PLC0415
        import pywintypes  # noqa: PLC0415

        return {
            "win32print": win32print,
            "pywintypes": pywintypes,
        }

    except ImportError:
        return None


class PrinterManager:
    """
    Manages printer discovery, selection, and validation for thermal printers.
    
    This class provides a clean interface for:
    - Discovering available printers
    - Selecting default or specific printers
    - Validating printer connectivity
    - Detecting thermal printers
    """

    def __init__(self):
        """Initialize the printer manager."""
        self._cached_printers: Optional[List[Dict]] = None
        self._cache_timestamp: Optional[float] = None
        self._cache_ttl: float = 30.0  # Cache for 30 seconds

    def get_available_printers(self, force_refresh: bool = False) -> List[Dict]:
        """
        Get list of all available printers from Windows Print Spooler.

        Args:
            force_refresh: Force refresh of printer list (bypass cache)

        Returns:
            List of printer dictionaries with keys:
            - name: Printer name
            - is_default: Boolean indicating if this is the default printer
            - is_thermal: Boolean indicating if this appears to be a thermal printer
        """
        # Check cache
        if not force_refresh and self._cached_printers is not None:
            import time
            if time.time() - self._cache_timestamp < self._cache_ttl:
                return self._cached_printers

        modules = load_win32_modules()
        if not modules:
            self._cached_printers = []
            self._cache_timestamp = 0
            return []

        win32print = modules["win32print"]
        printers = []

        try:
            # Get default printer name
            try:
                default_printer = win32print.GetDefaultPrinter()
            except Exception:
                default_printer = None

            # Enumerate all printers
            printer_list = win32print.EnumPrinters(
                win32print.PRINTER_ENUM_LOCAL | win32print.PRINTER_ENUM_CONNECTIONS
            )

            for printer_info in printer_list:
                printer_name = printer_info[2]
                
                # Check if thermal printer (common thermal printer keywords)
                is_thermal = self._is_thermal_printer(printer_name)
                is_default = (printer_name == default_printer) if default_printer else False

                printers.append({
                    "name": printer_name,
                    "is_default": is_default,
                    "is_thermal": is_thermal,
                })

        except Exception as exc:
            print(f"[PrinterManager] Error enumerating printers: {exc}")
            printers = []

        # Update cache
        self._cached_printers = printers
        import time
        self._cache_timestamp = time.time()

        return printers

    def get_default_printer(self) -> Optional[str]:
        """
        Get the system default printer name.

        Returns:
            Default printer name, or None if unavailable.
        """
        modules = load_win32_modules()
        if not modules:
            return None

        win32print = modules["win32print"]
        try:
            return win32print.GetDefaultPrinter()
        except Exception as exc:
            print(f"[PrinterManager] Error getting default printer: {exc}")
            return None

    def get_thermal_printer(self, force_refresh: bool = False) -> Optional[str]:
        """
        Get the first available thermal printer (Champ, RP-series, etc.).

        Args:
            force_refresh: Force refresh of printer list

        Returns:
            Thermal printer name, or None if not found.
        """
        printers = self.get_available_printers(force_refresh=force_refresh)
        
        # Prioritize thermal printers
        for printer in printers:
            if printer["is_thermal"]:
                return printer["name"]
        
        # Fallback to default printer
        for printer in printers:
            if printer["is_default"]:
                return printer["name"]
        
        # Fallback to first available printer
        if printers:
            return printers[0]["name"]
        
        return None

    def validate_printer(self, printer_name: str) -> Tuple[bool, Optional[str]]:
        """
        Validate that a printer is available and ready for printing.

        Args:
            printer_name: Name of the printer to validate

        Returns:
            Tuple of (is_valid, error_message)
            - is_valid: True if printer is valid and ready
            - error_message: Error description if invalid, None if valid
        """
        modules = load_win32_modules()
        if not modules:
            return False, "Windows printer modules not available"

        win32print = modules["win32print"]

        try:
            # Try to open the printer
            hPrinter = win32print.OpenPrinter(printer_name)
            win32print.ClosePrinter(hPrinter)
            return True, None

        except Exception as exc:
            error_msg = str(exc)
            
            # Parse common error conditions
            if "not found" in error_msg.lower() or "cannot find" in error_msg.lower():
                return False, f"Printer '{printer_name}' not found"
            elif "offline" in error_msg.lower():
                return False, f"Printer '{printer_name}' is offline"
            elif "access" in error_msg.lower() or "permission" in error_msg.lower():
                return False, f"Access denied to printer '{printer_name}'"
            else:
                return False, f"Printer error: {error_msg}"

    def _is_thermal_printer(self, printer_name: str) -> bool:
        """
        Determine if a printer appears to be a thermal printer based on name.

        Args:
            printer_name: Printer name to check

        Returns:
            True if printer name suggests thermal printer
        """
        thermal_keywords = [
            "thermal",
            "champ",
            "rp-",
            "rp ",
            "pos",
            "receipt",
            "ticket",
            "58mm",
            "80mm",
            "tsp",
            "gprinter",
            "xprinter",
        ]
        
        printer_name_lower = printer_name.lower()
        return any(keyword in printer_name_lower for keyword in thermal_keywords)

    def get_printer_status(self, printer_name: str) -> Dict[str, any]:
        """
        Get detailed status information for a printer.

        Args:
            printer_name: Name of the printer

        Returns:
            Dictionary with status information:
            - available: Boolean
            - status: Status message
            - error: Error message if any
        """
        is_valid, error = self.validate_printer(printer_name)
        
        return {
            "available": is_valid,
            "status": "Ready" if is_valid else "Unavailable",
            "error": error,
        }
