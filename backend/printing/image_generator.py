import os
import sys
import tempfile
import logging
from typing import Optional
from playwright.sync_api import sync_playwright

logger = logging.getLogger(__name__)


def _launch_browser(playwright):
    """
    Launches a browser for Playwright image rendering using a robust strategy:
    1. Standard Playwright Chromium (looking in %LOCALAPPDATA%/ms-playwright).
    2. Automatic 'playwright install chromium' if missing.
    3. System Microsoft Edge (pre-installed on all Windows 10/11 machines).
    4. System Google Chrome.
    """
    if "PLAYWRIGHT_BROWSERS_PATH" not in os.environ:
        local_appdata = os.environ.get("LOCALAPPDATA") or os.path.expanduser("~")
        os.environ["PLAYWRIGHT_BROWSERS_PATH"] = os.path.join(local_appdata, "ms-playwright")

    launch_args = [
        "--disable-gpu",
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--hide-scrollbars",
        "--mute-audio",
    ]

    # 1. Default Playwright Chromium
    try:
        return playwright.chromium.launch(headless=True, args=launch_args)
    except Exception as e:
        logger.warning(
            f"Default Playwright Chromium launch failed: {e}. Attempting auto-install..."
        )

    # 2. Immediately attempt auto-installation of Playwright Chromium
    try:
        import subprocess

        logger.info("Executing 'playwright install chromium' to download browser binaries...")
        subprocess.run(
            [sys.executable, "-m", "playwright", "install", "chromium"],
            check=True,
            timeout=120,
        )
        return playwright.chromium.launch(headless=True, args=launch_args)
    except Exception as e:
        logger.warning(f"Auto-install of Playwright Chromium failed: {e}. Trying system Edge...")

    # 3. Fallback: System Microsoft Edge (installed by default on Windows 10 & 11)
    try:
        return playwright.chromium.launch(channel="msedge", headless=True, args=launch_args)
    except Exception as e:
        logger.warning(f"System Edge launch failed: {e}. Trying system Chrome...")

    # 4. Fallback: System Google Chrome
    try:
        return playwright.chromium.launch(channel="chrome", headless=True, args=launch_args)
    except Exception as e:
        logger.error(f"System Chrome launch failed: {e}")
        raise RuntimeError(f"Failed to launch any browser for receipt rendering: {e}")


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
            device_scale_factor = 1.0
        elif "a4" in width_str:
            pixel_width = 1200
            device_scale_factor = 2.0
        else:
            pixel_width = 384  # Default 58mm
            device_scale_factor = 1.0

        with sync_playwright() as playwright:
            browser = _launch_browser(playwright)
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

                try:
                    page.screenshot(
                        path=png_path,
                        full_page=True,
                        omit_background=False,  # Keep white background
                    )
                except Exception as e:
                    logger.warning(
                        f"Full-page screenshot failed ({e}). Retrying standard screenshot..."
                    )
                    page.screenshot(path=png_path, omit_background=False)

                context.close()
            finally:
                browser.close()

        logger.info(
            f"Generated receipt PNG image at: {png_path} (width: {pixel_width}px, scale: {device_scale_factor})"
        )
        return png_path
