"""
ai/background_removal.py
=========================
Background removal using rembg (local ONNX model).
After removal, automatically runs the full image normalization pipeline:
 - Crop transparent borders
 - Add dynamic padding
 - Normalize scale (~88% canvas occupancy)
 - Center on 1000x1000 transparent canvas
"""

import logging
from PIL import Image
from .session_manager import AISessionManager
from .image_normalizer import normalize_product_image, optimize_and_save

logger = logging.getLogger(__name__)


def remove_background_image(img: Image.Image) -> Image.Image:
    """
    Remove background from a PIL Image.

    Args:
        img: Input PIL Image

    Returns:
        Transparent PNG PIL Image (RGBA) — raw rembg output, not normalized.
        Use remove_background_from_file() for the full normalization pipeline.
    """
    remove_fn, session = AISessionManager.get_session()
    if remove_fn is None or session is None:
        raise RuntimeError("Background removal engine is unavailable.")

    logger.info("Running background removal on image...")
    # Convert image to RGB before passing to the model (rembg expects RGB)
    img_rgb = img.convert("RGB")
    out_img = remove_fn(img_rgb, session=session)
    logger.info("Background removal completed.")
    return out_img


def remove_background_from_file(input_path: str, output_path: str) -> bool:
    """
    Remove background from a file on disk, normalize the result, and save.

    Full pipeline:
    1. Load image from input_path
    2. Remove background via rembg (ONNX model)
    3. Detect alpha bounds and crop transparent space
    4. Add dynamic padding (8% max dim, clamped 20-80px)
    5. Normalize scale to ~88% of 1000x1000 canvas (LANCZOS, aspect-ratio preserved)
    6. Center on 1000x1000 transparent RGBA canvas
    7. Save optimized PNG to output_path

    Args:
        input_path: Path to the original input file
        output_path: Path where the normalized transparent PNG should be saved

    Returns:
        True if successful, False otherwise
    """
    try:
        logger.info(f"Loading image for background removal from: {input_path}")
        with Image.open(input_path) as img:
            # Step 1 & 2: Remove background
            out_img = remove_background_image(img)

        # Step 3-6: Normalize — crop, pad, scale, center
        logger.info("Normalizing product image (crop → pad → scale → center)...")
        normalized = normalize_product_image(out_img)

        # Step 7: Save optimized PNG
        logger.info(f"Saving normalized transparent image to: {output_path}")
        optimize_and_save(normalized, output_path)

        logger.info(
            f"Background removal + normalization complete. "
            f"Output: {normalized.size[0]}x{normalized.size[1]} RGBA."
        )
        return True

    except Exception as e:
        logger.error(f"Error performing background removal on file: {e}", exc_info=True)
        return False
