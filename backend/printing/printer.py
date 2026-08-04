import os
import logging
from PIL import Image

from typing import Optional, Tuple

logger = logging.getLogger(__name__)

# Lazy imports for pywin32 modules
win32print = None
win32ui = None
win32con = None
ImageWin = None


def _load_win32():
    global win32print, win32ui, win32con, ImageWin
    if win32print is None:
        try:
            import win32print as wprint
            import win32ui as wui
            import win32con as wcon
            from PIL import ImageWin as imgwin

            win32print = wprint
            win32ui = wui
            win32con = wcon
            ImageWin = imgwin
            return True
        except ImportError as e:
            logger.warning(f"Windows printing modules (pywin32) are unavailable on this host: {e}")
            return False
    return True


class WindowsImagePrinter:
    """Prints PNG images directly to a Windows printer using GDI Graphics API."""

    def print_image(
        self, printer_name: str, image_path: str, job_name: str = "InfoOS_Receipt"
    ) -> Tuple[bool, Optional[str]]:
        """
        Sends the PNG image to the Windows printer spooler.

        Args:
            printer_name: Name of the target Windows printer
            image_path: Absolute path to the PNG file
            job_name: Document name in the spooler

        Returns:
            Tuple of (success: bool, error_message: Optional[str])
        """
        logger.info(
            f"Initiating print job '{job_name}' on printer '{printer_name}' for image '{image_path}'"
        )

        if not os.path.exists(image_path):
            err_msg = f"Print failed: Image file not found at '{image_path}'"
            logger.error(err_msg)
            return False, err_msg

        if not _load_win32():
            # Non-Windows fallback
            logger.warning(
                f"=== PLATFORM FALLBACK: Printed image '{image_path}' on '{printer_name}' ==="
            )
            return True, None

        try:
            # Load the image
            img = Image.open(image_path)
            img_w, img_h = img.size

            # Start document printing
            hdc = win32ui.CreateDC()
            try:
                hdc.CreatePrinterDC(printer_name)
            except Exception as dc_err:
                err_msg = (
                    f"Could not connect to printer '{printer_name}'. "
                    f"Please verify printer is powered on and connected. ({dc_err})"
                )
                logger.error(err_msg)
                return False, err_msg

            # Retrieve printable dimensions in device pixels
            printable_width = hdc.GetDeviceCaps(win32con.HORZRES)

            # Calculate scaled height preserving aspect ratio
            scale = printable_width / img_w
            print_w = printable_width
            print_h = int(img_h * scale)

            logger.debug(
                f"Printer printable width: {printable_width}px. Scaling image from {img_w}x{img_h} to {print_w}x{print_h}"
            )

            hdc.StartDoc(job_name)
            hdc.StartPage()

            # Draw the PIL Image directly onto the Device Context
            dib = ImageWin.Dib(img)
            dib.draw(hdc.GetHandleOutput(), (0, 0, print_w, print_h))

            hdc.EndPage()
            hdc.EndDoc()
            del hdc

            logger.info(f"Print job '{job_name}' successfully sent to Windows spooler.")
            return True, None
        except Exception as e:
            err_msg = f"Windows GDI print error on printer '{printer_name}': {e}"
            logger.error(err_msg, exc_info=True)
            return False, err_msg
