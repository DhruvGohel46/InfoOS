import logging
from PIL import Image
from .session_manager import AISessionManager

logger = logging.getLogger(__name__)


def remove_background_image(img: Image.Image) -> Image.Image:
    """
    Remove background from a PIL Image.

    Args:
        img: Input PIL Image

    Returns:
        Transparent PNG PIL Image
    """
    remove_fn, session = AISessionManager.get_session()
    if remove_fn is None or session is None:
        raise RuntimeError("Background removal engine is unavailable.")

    logger.info("Running background removal on image...")
    # Convert image to RGB before passing to the model
    img_rgb = img.convert("RGB")
    out_img = remove_fn(img_rgb, session=session)
    logger.info("Background removal completed.")
    return out_img


def remove_background_from_file(input_path: str, output_path: str) -> bool:
    """
    Remove background from a file on disk and save it to another location.

    Args:
        input_path: Path to the original input file
        output_path: Path where the output transparent PNG should be saved

    Returns:
        True if successful, False otherwise
    """
    try:
        logger.info(f"Loading image for background removal from: {input_path}")
        with Image.open(input_path) as img:
            out_img = remove_background_image(img)
            logger.info(f"Saving background-removed transparent image to: {output_path}")
            out_img.save(output_path, format="PNG")
        return True
    except Exception as e:
        logger.error(f"Error performing background removal on file: {e}", exc_info=True)
        return False
