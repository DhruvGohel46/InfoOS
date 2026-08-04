import os
import tempfile
import logging
from typing import Optional
from playwright.sync_api import sync_playwright

logger = logging.getLogger(__name__)


class PlaywrightImageGenerator:
    """Uses Playwright to render HTML into a high-quality PNG receipt image."""

    @classmethod
    def close_browser(cls):
        """No-op for backward compatibility."""
        pass

    def generate_png(self, html_content: str, width_mm: str = "58mm") -> str:
        """
        Renders the HTML content in Chromium and saves a PNG screenshot.

        Args:
            html_content: Raw HTML string to render
            width_mm: Configured print media width ('58mm', '80mm', 'A4')

        Returns:
            Absolute path to the generated PNG file
        """
        # Define base width: ~203 DPI / ~8 dots per mm
        # 58mm width (printable width ~48mm) -> 384px
        # 80mm width (printable width ~72mm) -> 576px
        # A4 width -> 1200px
        width_str = str(width_mm).strip().lower()
        if "80" in width_str:
            pixel_width = 576
        elif "a4" in width_str:
            pixel_width = 1200
        else:
            pixel_width = 384  # Default 58mm

        device_scale_factor = 3.0

        with sync_playwright() as playwright:
            browser = playwright.chromium.launch(
                headless=True, args=["--disable-gpu", "--no-sandbox", "--disable-setuid-sandbox"]
            )
            try:
                context = browser.new_context(
                    viewport={"width": pixel_width, "height": 100},
                    device_scale_factor=device_scale_factor,
                )
                page = context.new_page()

                # Emulate screen media to ensure layout matches normal browser viewport rendering
                page.emulate_media(media="screen")

                # Write HTML to a UTF-8 temp file and load via file URL.
                # Using set_content() directly causes 'charmap' codec errors on
                # Windows because Playwright internally writes the HTML using the
                # system's default encoding (cp1252/charmap), which cannot encode
                # non-ASCII characters like ₹ or other Unicode glyphs.
                #
                # Defensive guard: ensure html_content is a str, not bytes.
                # (Bytes can arrive if something upstream encoded it incorrectly.)
                if isinstance(html_content, bytes):
                    html_content = html_content.decode("utf-8", errors="replace")
                elif not isinstance(html_content, str):
                    html_content = str(html_content)

                html_temp_path = os.path.join(
                    tempfile.gettempdir(),
                    f"receipt_html_{os.getpid()}_{os.urandom(4).hex()}.html",
                )
                with open(html_temp_path, "w", encoding="utf-8") as f:
                    f.write(html_content)

                try:
                    file_url = f"file:///{html_temp_path.replace(os.sep, '/')}"
                    page.goto(file_url, wait_until="networkidle")
                finally:
                    try:
                        os.remove(html_temp_path)
                    except Exception:
                        pass


                # Save screenshot to temporary folder
                temp_dir = tempfile.gettempdir()
                png_path = os.path.join(
                    temp_dir, f"receipt_{os.getpid()}_{os.urandom(4).hex()}.png"
                )

                page.screenshot(
                    path=png_path, full_page=True, omit_background=False  # Keep white background
                )

                context.close()
            finally:
                browser.close()

        logger.info(
            f"Generated receipt PNG image at: {png_path} (width: {pixel_width}px, scale: {device_scale_factor})"
        )
        return png_path
