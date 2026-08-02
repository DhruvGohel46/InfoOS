import os
import tempfile
import pytest
from PIL import Image
from ai.model_loader import get_models_dir, verify_model_exists
from ai.session_manager import AISessionManager
from ai.background_removal import remove_background_from_file


def test_model_loader():
    models_dir = get_models_dir()
    assert os.path.exists(models_dir)
    assert verify_model_exists()


def test_session_manager():
    # Verify initialize returns True and sessions are loaded
    success = AISessionManager.initialize()
    assert success is True

    remove_fn, session = AISessionManager.get_session()
    assert remove_fn is not None
    assert session is not None


def test_background_removal():
    # Create a simple red test image with Pillow
    temp_dir = tempfile.gettempdir()
    input_path = os.path.join(temp_dir, "test_input.jpg")
    output_path = os.path.join(temp_dir, "test_output.png")

    try:
        # Create solid 100x100 RGB image
        img = Image.new("RGB", (100, 100), color="red")
        img.save(input_path)

        # Run background removal
        success = remove_background_from_file(input_path, output_path)
        assert success is True

        # Verify output exists and is a valid image
        assert os.path.exists(output_path)
        with Image.open(output_path) as out_img:
            assert out_img.mode == "RGBA"
            assert out_img.size == (100, 100)
    finally:
        if os.path.exists(input_path):
            os.remove(input_path)
        if os.path.exists(output_path):
            os.remove(output_path)
