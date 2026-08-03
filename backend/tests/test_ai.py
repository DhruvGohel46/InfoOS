"""
tests/test_ai.py
================
Tests for AI background removal and Smart Image Normalization Pipeline.
"""

import os
import tempfile
import pytest
from PIL import Image
from ai.model_loader import get_models_dir, verify_model_exists
from ai.session_manager import AISessionManager
from ai.background_removal import remove_background_from_file
from ai.image_normalizer import (
    detect_alpha_bounds,
    crop_transparent_border,
    add_dynamic_padding,
    normalize_scale,
    center_on_canvas,
    normalize_product_image,
    optimize_and_save,
)

try:
    import rembg  # noqa: F401

    HAS_REMBG = True
except ImportError:
    HAS_REMBG = False


# ─── Model Loader & Session Tests ─────────────────────────────────────────────


def test_model_loader():
    models_dir = get_models_dir()
    assert os.path.exists(models_dir)
    assert verify_model_exists()


@pytest.mark.skipif(not HAS_REMBG, reason="rembg is not installed")
def test_session_manager():
    success = AISessionManager.initialize()
    assert success is True

    remove_fn, session = AISessionManager.get_session()
    assert remove_fn is not None
    assert session is not None


@pytest.mark.skipif(not HAS_REMBG, reason="rembg is not installed")
def test_background_removal():
    temp_dir = tempfile.gettempdir()
    input_path = os.path.join(temp_dir, "test_input.jpg")
    output_path = os.path.join(temp_dir, "test_output.png")

    try:
        img = Image.new("RGB", (100, 100), color="red")
        img.save(input_path)

        success = remove_background_from_file(input_path, output_path)
        assert success is True

        assert os.path.exists(output_path)
        with Image.open(output_path) as out_img:
            # Output must be RGBA and normalized to 1000x1000
            assert out_img.mode == "RGBA"
            assert out_img.size == (1000, 1000)
    finally:
        if os.path.exists(input_path):
            os.remove(input_path)
        if os.path.exists(output_path):
            os.remove(output_path)


# ─── detect_alpha_bounds Tests ────────────────────────────────────────────────


def _make_rgba_with_subject(
    canvas_size: tuple, subject_bbox: tuple, subject_color=(255, 100, 0, 255)
) -> Image.Image:
    """Helper: create RGBA image with a coloured box at subject_bbox (left, top, right, bottom)."""
    img = Image.new("RGBA", canvas_size, (0, 0, 0, 0))
    for y in range(subject_bbox[1], subject_bbox[3]):
        for x in range(subject_bbox[0], subject_bbox[2]):
            img.putpixel((x, y), subject_color)
    return img


def test_detect_alpha_bounds_basic():
    """Bounding box should tightly wrap the non-transparent region."""
    img = _make_rgba_with_subject((200, 200), (50, 60, 130, 140))
    bbox = detect_alpha_bounds(img)
    assert bbox is not None
    left, top, right, bottom = bbox
    assert left == 50
    assert top == 60
    assert right == 130
    assert bottom == 140


def test_detect_alpha_bounds_empty_image():
    """Fully transparent image should return None — not crash."""
    img = Image.new("RGBA", (100, 100), (0, 0, 0, 0))
    bbox = detect_alpha_bounds(img)
    assert bbox is None


def test_detect_alpha_bounds_noise_filtered():
    """Pixels with alpha < threshold should be ignored."""
    img = Image.new("RGBA", (100, 100), (0, 0, 0, 0))
    # Place "noise" pixel with very low alpha — should be filtered out
    img.putpixel((10, 10), (255, 0, 0, 5))
    # Place a real pixel above threshold
    img.putpixel((50, 50), (255, 0, 0, 200))

    bbox = detect_alpha_bounds(img, alpha_threshold=15)
    assert bbox is not None
    left, top, right, bottom = bbox
    # Bounding box should only contain the real pixel at (50, 50)
    assert left == 50
    assert top == 50
    assert right == 51
    assert bottom == 51


def test_detect_alpha_bounds_full_opaque_image():
    """Fully opaque image — bbox should be entire image dimensions."""
    img = Image.new("RGBA", (150, 200), (100, 150, 200, 255))
    bbox = detect_alpha_bounds(img)
    assert bbox == (0, 0, 150, 200)


# ─── crop_transparent_border Tests ────────────────────────────────────────────


def test_crop_transparent_border_removes_empty_space():
    """Cropped image should match the original subject dimensions."""
    img = _make_rgba_with_subject((400, 400), (100, 120, 200, 220))
    cropped = crop_transparent_border(img)
    assert cropped.size == (100, 100)  # 200-100=100 wide, 220-120=100 tall


def test_crop_transparent_border_empty_image_returns_original():
    """Fully transparent image should return original without crashing."""
    img = Image.new("RGBA", (50, 50), (0, 0, 0, 0))
    result = crop_transparent_border(img)
    assert result is not None
    assert result.size == (50, 50)


# ─── add_dynamic_padding Tests ────────────────────────────────────────────────


def test_add_dynamic_padding_adds_padding():
    """Result should be larger than input by 2×padding on each axis."""
    img = Image.new("RGBA", (200, 200), (255, 0, 0, 255))
    padded = add_dynamic_padding(img, padding_percent=0.08, min_padding=20, max_padding=80)
    # 8% of 200 = 16px → clamped to min 20px
    expected_dim = 200 + (20 * 2)
    assert padded.size == (expected_dim, expected_dim)


def test_add_dynamic_padding_respects_min():
    """Very small image should use min_padding."""
    img = Image.new("RGBA", (10, 10), (255, 0, 0, 255))
    padded = add_dynamic_padding(img, padding_percent=0.08, min_padding=20, max_padding=80)
    # 8% of 10 = 0.8 → clamped to min 20px
    assert padded.size == (10 + 40, 10 + 40)  # 50 x 50


def test_add_dynamic_padding_respects_max():
    """Very large image should use max_padding."""
    img = Image.new("RGBA", (2000, 2000), (255, 0, 0, 255))
    padded = add_dynamic_padding(img, padding_percent=0.08, min_padding=20, max_padding=80)
    # 8% of 2000 = 160 → clamped to max 80px
    assert padded.size == (2000 + 160, 2000 + 160)  # 2160 x 2160


def test_add_dynamic_padding_rect_image():
    """Padding should still be uniform (not per-axis) based on max dimension."""
    img = Image.new("RGBA", (100, 400), (255, 0, 0, 255))
    padded = add_dynamic_padding(img, padding_percent=0.08, min_padding=20, max_padding=80)
    # max_dim = 400, 8% = 32px
    assert padded.size == (100 + 64, 400 + 64)


# ─── normalize_scale Tests ────────────────────────────────────────────────────


def test_normalize_scale_square_image():
    """Square image should scale to exact occupancy."""
    img = Image.new("RGBA", (200, 200), (255, 0, 0, 255))
    scaled = normalize_scale(img, target_canvas_size=1000, occupancy_ratio=0.88)
    # max dim should be 1000 * 0.88 = 880
    assert scaled.size == (880, 880)


def test_normalize_scale_tall_image():
    """Tall image — height should reach target, width proportionally smaller."""
    img = Image.new("RGBA", (100, 400), (255, 0, 0, 255))
    scaled = normalize_scale(img, target_canvas_size=1000, occupancy_ratio=0.88)
    # height (max dim) → 880; width scales proportionally = 880 * (100/400) = 220
    assert scaled.size[1] == 880
    assert scaled.size[0] == 220


def test_normalize_scale_wide_image():
    """Wide image — width should reach target, height proportionally smaller."""
    img = Image.new("RGBA", (400, 100), (255, 0, 0, 255))
    scaled = normalize_scale(img, target_canvas_size=1000, occupancy_ratio=0.88)
    # width (max dim) → 880; height scales proportionally = 880 * (100/400) = 220
    assert scaled.size[0] == 880
    assert scaled.size[1] == 220


def test_normalize_scale_preserves_aspect_ratio():
    """Aspect ratio must be preserved within rounding tolerance."""
    img = Image.new("RGBA", (300, 200), (255, 0, 0, 255))
    scaled = normalize_scale(img, target_canvas_size=1000, occupancy_ratio=0.88)
    original_ratio = 300 / 200
    scaled_ratio = scaled.size[0] / scaled.size[1]
    assert abs(original_ratio - scaled_ratio) < 0.02  # ±2% tolerance for rounding


def test_normalize_scale_small_image_enlarges():
    """Small image (e.g. tiny cupcake) should enlarge, not stay tiny."""
    img = Image.new("RGBA", (10, 10), (255, 0, 0, 255))
    scaled = normalize_scale(img, target_canvas_size=1000, occupancy_ratio=0.88)
    assert max(scaled.size) == 880


def test_normalize_scale_large_image_shrinks():
    """Very large image should shrink proportionally."""
    img = Image.new("RGBA", (5000, 5000), (255, 0, 0, 255))
    scaled = normalize_scale(img, target_canvas_size=1000, occupancy_ratio=0.88)
    assert max(scaled.size) == 880


# ─── center_on_canvas Tests ───────────────────────────────────────────────────


def test_center_on_canvas_output_dimensions():
    """Output canvas should always be canvas_size × canvas_size."""
    img = Image.new("RGBA", (300, 500), (255, 0, 0, 255))
    result = center_on_canvas(img, canvas_size=1000)
    assert result.size == (1000, 1000)


def test_center_on_canvas_has_transparency():
    """Canvas must be RGBA with transparent background."""
    img = Image.new("RGBA", (200, 200), (255, 0, 0, 255))
    result = center_on_canvas(img, canvas_size=1000)
    assert result.mode == "RGBA"
    # Top-left corner should be transparent (image is smaller than canvas)
    assert result.getpixel((0, 0))[3] == 0


def test_center_on_canvas_image_is_centered():
    """Image should be exactly centered on canvas."""
    img = Image.new("RGBA", (400, 600), (255, 0, 0, 255))
    result = center_on_canvas(img, canvas_size=1000)
    # Expected paste position:
    expected_x = (1000 - 400) // 2  # 300
    expected_y = (1000 - 600) // 2  # 200
    # Pixel at paste position should be fully opaque (part of image)
    assert result.getpixel((expected_x, expected_y))[3] == 255
    # Pixel just before paste position should be transparent
    assert result.getpixel((expected_x - 1, expected_y - 1))[3] == 0


# ─── Full normalize_product_image Pipeline Tests ──────────────────────────────


def test_normalize_product_image_output_size():
    """Full pipeline output must always be 1000×1000 RGBA."""
    img = _make_rgba_with_subject((500, 500), (100, 100, 400, 400))
    result = normalize_product_image(img)
    assert result.size == (1000, 1000)
    assert result.mode == "RGBA"


def test_normalize_product_image_empty_returns_canvas():
    """Fully transparent image should still return a 1000×1000 canvas without crashing."""
    img = Image.new("RGBA", (100, 100), (0, 0, 0, 0))
    result = normalize_product_image(img)
    assert result.size == (1000, 1000)
    assert result.mode == "RGBA"


def test_normalize_product_image_tall_product():
    """Tall product (bottle) — output should be 1000×1000, content centered."""
    img = _make_rgba_with_subject((200, 800), (80, 10, 120, 790))  # narrow tall subject
    result = normalize_product_image(img)
    assert result.size == (1000, 1000)
    assert result.mode == "RGBA"


def test_normalize_product_image_wide_product():
    """Wide product (pizza tray) — output should be 1000×1000."""
    img = _make_rgba_with_subject((900, 200), (10, 80, 890, 120))  # wide short subject
    result = normalize_product_image(img)
    assert result.size == (1000, 1000)
    assert result.mode == "RGBA"


def test_normalize_product_image_alpha_noise_ignored():
    """Low-alpha noise pixels should not inflate the bounding box."""
    img = Image.new("RGBA", (500, 500), (0, 0, 0, 0))
    # Noise in corner
    img.putpixel((0, 0), (255, 0, 0, 5))
    img.putpixel((499, 499), (255, 0, 0, 5))
    # Real subject in center
    for y in range(200, 300):
        for x in range(200, 300):
            img.putpixel((x, y), (255, 100, 50, 255))

    result = normalize_product_image(img, alpha_threshold=15)
    assert result.size == (1000, 1000)
    # Center of canvas should have visible content
    center_pixel = result.getpixel((500, 500))
    assert center_pixel[3] > 0  # center should not be transparent


def test_normalize_product_image_rgb_input_converted():
    """RGB images (no alpha) should be auto-converted to RGBA before processing."""
    img = Image.new("RGB", (300, 300), color=(100, 200, 50))
    result = normalize_product_image(img)
    assert result.size == (1000, 1000)
    assert result.mode == "RGBA"


# ─── optimize_and_save Tests ──────────────────────────────────────────────────


def test_optimize_and_save_writes_png():
    """optimize_and_save should write a valid PNG file with RGBA mode."""
    temp_dir = tempfile.gettempdir()
    output_path = os.path.join(temp_dir, "test_optimize_save.png")
    try:
        img = Image.new("RGBA", (1000, 1000), (0, 0, 0, 0))
        optimize_and_save(img, output_path)
        assert os.path.exists(output_path)
        with Image.open(output_path) as saved:
            assert saved.mode == "RGBA"
            assert saved.size == (1000, 1000)
    finally:
        if os.path.exists(output_path):
            os.remove(output_path)
