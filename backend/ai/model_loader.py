import os
import sys
import logging

logger = logging.getLogger(__name__)


def get_models_dir() -> str:
    """Resolve the directory containing bundled model files."""
    if getattr(sys, "frozen", False) and hasattr(sys, "_MEIPASS"):
        # PyInstaller packaged environment
        base_dir = sys._MEIPASS
    else:
        # Development environment
        base_dir = os.path.dirname(os.path.abspath(__file__))

    models_dir = os.path.join(base_dir, "models")
    return os.path.abspath(models_dir)


def configure_model_environment():
    """Set environment variables so rembg locates the bundled models offline."""
    models_dir = get_models_dir()
    os.environ["U2NET_HOME"] = models_dir
    logger.info(f"U2NET_HOME environment variable configured to: {models_dir}")


def verify_model_exists() -> bool:
    """Verify that the u2netp ONNX model is present in the bundled directory."""
    models_dir = get_models_dir()
    model_path = os.path.join(models_dir, "u2netp.onnx")
    exists = os.path.exists(model_path)
    if exists:
        logger.info(
            f"Bundled model verified at: {model_path} (Size: {os.path.getsize(model_path)} bytes)"
        )
    else:
        logger.error(f"Bundled model NOT found at expected path: {model_path}")
    return exists
