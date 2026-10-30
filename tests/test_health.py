from src.core_vector.scale_validator import ScaleValidator
from src.meta_services.client import MetaModelClient


def test_scale_validator_exact():
    ratio, status = ScaleValidator.parse_scale_string('1/4" = 1\'-0"')
    assert status == "VERIFIED"
    assert ratio == 48.0

    feet, valid = ScaleValidator.points_to_feet(72.0, ratio)
    assert valid is True
    assert feet == 4.0  # 1 paper inch (72 pt) * 48 = 48 inches = 4 feet


def test_scale_validator_fail_closed():
    # Ambiguous or unknown scale
    ratio, status = ScaleValidator.parse_scale_string("NOT TO SCALE")
    assert status == "UNVERIFIED"
    assert ratio is None

    feet, valid = ScaleValidator.points_to_feet(100.0, ratio)
    assert valid is False
    assert feet is None


def test_meta_client_mock_mode():
    client = MetaModelClient(api_key="mock_key_unconfigured")
    assert client.is_configured() is False

    crop_result = client.parse_crop_ocr("fake_base64")
    assert crop_result["mock"] is True
    assert "width" in crop_result
    assert "height" in crop_result
