import os
import sys
import tempfile
import logging
import concurrent.futures
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
    """
    Uses Playwright to render HTML into a high-quality PNG receipt image with persistent browser instance.
    All Playwright operations are executed on a dedicated single-threaded executor to prevent conflicts
    with active asyncio event loops.
    """

    _executor = concurrent.futures.ThreadPoolExecutor(
        max_workers=1, thread_name_prefix="playwright_renderer"
    )
    _playwright = None
    _browser = None

    @classmethod
    def _get_browser_impl(cls):
        """Get or initialize thread-safe persistent browser instance (runs on worker thread)."""
        if cls._browser is None or not cls._browser.is_connected():
            if cls._playwright is None:
                cls._playwright = sync_playwright().start()
            try:
                cls._browser = _launch_browser(cls._playwright)
            except Exception as e:
                logger.error(f"Failed to launch browser: {e}")
                raise e
        return cls._browser

    @classmethod
    def _close_browser_impl(cls):
        """Cleanly close persistent browser instance on shutdown (runs on worker thread)."""
        if cls._browser:
            try:
                cls._browser.close()
            except Exception:
                pass
            cls._browser = None
        if cls._playwright:
            try:
                cls._playwright.stop()
            except Exception:
                pass
            cls._playwright = None

    @classmethod
    def close_browser(cls):
        """Cleanly close persistent browser instance on shutdown."""
        try:
            future = cls._executor.submit(cls._close_browser_impl)
            return future.result(timeout=10)
        except Exception as e:
            logger.warning(f"Error closing Playwright browser: {e}")

    def generate_png(self, html_content: str, width_mm: str = "58mm") -> str:
        """
        Renders the HTML content in Chromium and saves a PNG screenshot.
        Offloads rendering to dedicated worker thread to avoid asyncio loop issues.

        Args:
            html_content: Raw HTML string to render
            width_mm: Configured print media width ('58mm', '80mm', 'A4')

        Returns:
            Absolute path to the generated PNG file
        """
        future = self._executor.submit(self._generate_png_impl, html_content, width_mm)
        return future.result()

    def _generate_png_impl(self, html_content: str, width_mm: str = "58mm") -> str:
        """Internal implementation of generate_png running inside the dedicated worker thread."""
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

        png_path = os.path.join(
            tempfile.gettempdir(), f"receipt_{os.getpid()}_{os.urandom(4).hex()}.png"
        )

        try:
            browser = self._get_browser_impl()
            context = browser.new_context(
                viewport={"width": pixel_width, "height": 100},
                device_scale_factor=device_scale_factor,
            )
            try:
                page = context.new_page()
                page.emulate_media(media="screen")
                file_url = f"file:///{html_temp_path.replace(os.sep, '/')}"
                page.goto(file_url, wait_until="domcontentloaded")

                try:
                    page.screenshot(path=png_path, full_page=True, omit_background=False)
                except Exception as e:
                    logger.warning(
                        f"Full-page screenshot failed ({e}). Retrying standard screenshot..."
                    )
                    page.screenshot(path=png_path, omit_background=False)
            finally:
                context.close()
        except Exception as e:
            # Fallback retry if browser crashed or disconnected
            logger.warning(f"Receipt rendering error: {e}. Retrying with fresh browser instance...")
            self._close_browser_impl()
            browser = self._get_browser_impl()
            context = browser.new_context(
                viewport={"width": pixel_width, "height": 100},
                device_scale_factor=device_scale_factor,
            )
            try:
                page = context.new_page()
                page.emulate_media(media="screen")
                file_url = f"file:///{html_temp_path.replace(os.sep, '/')}"
                page.goto(file_url, wait_until="domcontentloaded")
                page.screenshot(path=png_path, full_page=True, omit_background=False)
            finally:
                context.close()
        finally:
            if os.path.exists(html_temp_path):
                try:
                    os.remove(html_temp_path)
                except Exception:
                    pass

        logger.info(
            f"Generated receipt PNG image at: {png_path} (width: {pixel_width}px, scale: {device_scale_factor})"
        )
        return png_path
