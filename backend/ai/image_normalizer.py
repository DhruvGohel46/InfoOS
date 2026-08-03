"""
ai/image_normalizer.py
======================
Smart Product Image Normalization Pipeline after background removal.

Features:
- Alpha noise filtering and bounding box detection
- Tight cropping of transparent space
- Dynamic padding (8% of max dimension, clamped 20-80px)
- Proportional scaling to ~88% canvas occupancy (LANCZOS interpolation)
- Centering on a standard 1000x1000 RGBA transparent canvas
- Optimized PNG saving
"""

import os
import logging
from typing import Optional, Tuple
import numpy as np
from PIL import Image

logger = logging.getLogger(__name__)


def detect_alpha_bounds(
    img: Image.Image, alpha_threshold: int = 15
) -> Optional[Tuple[int, int, int, int]]:
    """
    Reads the alpha channel, ignores noise (pixels with alpha < alpha_threshold),
    and finds the smallest bounding box (left, top, right, bottom) containing visible pixels.

    Args:
        img: Input PIL Image
        alpha_threshold: Alpha channel value (0-255) below which pixels are treated as noise

    Returns:
        Bounding box tuple (left, top, right, bottom) or None if image is transparent/empty.
    """
    if img.mode != "RGBA":
        img = img.convert("RGBA")

    alpha = img.getchannel("A")
    alpha_np = np.array(alpha)

    # Filter out alpha noise below threshold
    mask = alpha_np >= alpha_threshold
    if not np.any(mask):
        return None

    nonzero_y, nonzero_x = np.nonzero(mask)
    left = int(np.min(nonzero_x))
    top = int(np.min(nonzero_y))
    right = int(np.max(nonzero_x)) + 1
    bottom = int(np.max(nonzero_y)) + 1

    return (left, top, right, bottom)


def crop_transparent_border(
    img: Image.Image, bbox: Optional[Tuple[int, int, int, int]] = None
) -> Image.Image:
    """
    Crops away transparent margins based on the alpha bounding box.

    Args:
        img: Input PIL Image
        bbox: Optional bounding box. If None, detected automatically.

    Returns:
        Cropped PIL Image
    """
    if img.mode != "RGBA":
        img = img.convert("RGBA")

    if bbox is None:
        bbox = detect_alpha_bounds(img)

    if bbox is None:
        # Empty or fully transparent image - return original
        return img

    return img.crop(bbox)


def add_dynamic_padding(
    img: Image.Image,
    padding_percent: float = 0.08,
    min_padding: int = 20,
    max_padding: int = 80,
) -> Image.Image:
    """
    Adds dynamic transparent padding around cropped image object.
    Padding is calculated as 8% of the max object dimension, clamped between 20px and 80px.

    Args:
        img: Cropped PIL Image
        padding_percent: Proportion of largest dimension to use for padding (default 8%)
        min_padding: Minimum padding in pixels
        max_padding: Maximum padding in pixels

    Returns:
        Padded RGBA PIL Image
    """
    if img.mode != "RGBA":
        img = img.convert("RGBA")

    w, h = img.size
    max_dim = max(w, h)

    calc_padding = int(max_dim * padding_percent)
    padding = max(min_padding, min(max_padding, calc_padding))

    new_w = w + (padding * 2)
    new_h = h + (padding * 2)

    padded_img = Image.new("RGBA", (new_w, new_h), (0, 0, 0, 0))
    padded_img.paste(img, (padding, padding), img)
    return padded_img


def normalize_scale(
    img: Image.Image, target_canvas_size: int = 1000, occupancy_ratio: float = 0.88
) -> Image.Image:
    """
    Resizes image so its maximum dimension occupies approx occupancy_ratio (default 88%)
    of target_canvas_size while strictly preserving original aspect ratio using LANCZOS.

    Args:
        img: Input PIL Image
        target_canvas_size: Size of final target square canvas in pixels (default 1000)
        occupancy_ratio: Fraction of canvas size the object should occupy (default 0.88)

    Returns:
        Resized RGBA PIL Image
    """
    if img.mode != "RGBA":
        img = img.convert("RGBA")

    w, h = img.size
    if w <= 0 or h <= 0:
        return img

    max_target_dim = float(target_canvas_size) * occupancy_ratio
    max_current_dim = float(max(w, h))

    scale = max_target_dim / max_current_dim

    new_w = max(1, int(round(w * scale)))
    new_h = max(1, int(round(h * scale)))

    resample_filter = getattr(Image, "Resampling", Image).LANCZOS
    return img.resize((new_w, new_h), resample=resample_filter)


def center_on_canvas(img: Image.Image, canvas_size: int = 1000) -> Image.Image:
    """
    Creates a transparent square canvas and pastes the scaled image exactly in the center.

    Args:
        img: Input PIL Image
        canvas_size: Square canvas dimension (default 1000)

    Returns:
        1000x1000 RGBA PIL Image with centered content
    """
    if img.mode != "RGBA":
        img = img.convert("RGBA")

    canvas = Image.new("RGBA", (canvas_size, canvas_size), (0, 0, 0, 0))
    w, h = img.size

    pos_x = (canvas_size - w) // 2
    pos_y = (canvas_size - h) // 2

    canvas.paste(img, (pos_x, pos_y), img)
    return canvas


def normalize_product_image(
    img: Image.Image,
    canvas_size: int = 1000,
    occupancy_ratio: float = 0.88,
    alpha_threshold: int = 15,
) -> Image.Image:
    """
    Full Smart Product Image Normalization Pipeline:
    1. Detect alpha bounding box (filtering low-alpha noise)
    2. Crop transparent borders
    3. Add dynamic padding (8% max dim, 20-80px)
    4. Normalize scale to ~88% of target canvas size (LANCZOS, preserving aspect ratio)
    5. Center on 1000x1000 transparent canvas

    Args:
        img: Input PIL Image
        canvas_size: Target square canvas size (default 1000)
        occupancy_ratio: Target canvas occupancy fraction (default 0.88)
        alpha_threshold: Noise filter alpha threshold (default 15)

    Returns:
        Normalized 1000x1000 RGBA PIL Image
    """
    if img.mode != "RGBA":
        img = img.convert("RGBA")

    bbox = detect_alpha_bounds(img, alpha_threshold=alpha_threshold)
    if bbox is None:
        logger.warning("Empty or fully transparent image provided for normalization.")
        # Fallback: scale and center original image directly
        scaled = normalize_scale(
            img, target_canvas_size=canvas_size, occupancy_ratio=occupancy_ratio
        )
        return center_on_canvas(scaled, canvas_size=canvas_size)

    cropped = crop_transparent_border(img, bbox=bbox)
    padded = add_dynamic_padding(cropped)
    scaled = normalize_scale(
        padded, target_canvas_size=canvas_size, occupancy_ratio=occupancy_ratio
    )
    centered = center_on_canvas(scaled, canvas_size=canvas_size)
    return centered


def optimize_and_save(img: Image.Image, output_path: str) -> None:
    """
    Optimizes and saves PIL image to output_path in PNG format with transparency.

    Args:
        img: Input PIL Image
        output_path: Destination file path
    """
    if img.mode != "RGBA":
        img = img.convert("RGBA")

    os.makedirs(os.path.dirname(os.path.abspath(output_path)), exist_ok=True)
    img.save(output_path, format="PNG", optimize=True)
