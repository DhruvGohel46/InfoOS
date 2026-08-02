import os
import logging
from typing import Optional

logger = logging.getLogger(__name__)


class TemplateManager:
    """Manages HTML and CSS receipt templates."""

    def __init__(self, templates_dir: Optional[str] = None):
        if templates_dir is None:
            # Default to adjacent 'templates' folder
            templates_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "templates")
        self.templates_dir = templates_dir
        logger.info(f"TemplateManager loaded with templates directory: {self.templates_dir}")

    def get_template_path(self, template_name: str, filename: str = "bill.html") -> str:
        """Get the absolute path to a template file, falling back to 'default' if it doesn't exist."""
        template_name = os.path.basename(template_name)
        target_path = os.path.join(self.templates_dir, template_name, filename)
        if os.path.exists(target_path):
            return target_path
        # Fall back to default
        return os.path.join(self.templates_dir, "default", filename)

    def validate_template_exists(self, template_name: str) -> bool:
        """Check if a given template's HTML file exists."""
        html_path = os.path.join(self.templates_dir, os.path.basename(template_name), "bill.html")
        return os.path.exists(html_path)

    def load_css(self, template_name: str) -> str:
        """Load the CSS stylesheet for a template."""
        css_path = self.get_template_path(template_name, "style.css")
        if os.path.exists(css_path):
            with open(css_path, "r", encoding="utf-8") as f:
                return f.read()
        return ""
