from app.ucp.pipeline_template import next_patch_version, normalize_semver_version


def test_normalize_semver_version_supports_legacy_two_part_versions():
    assert normalize_semver_version("1.0") == "1.0.0"
    assert normalize_semver_version("1.2.3") == "1.2.3"
    assert normalize_semver_version("invalid") == "invalid"


def test_next_patch_version_increments_and_normalizes_legacy_versions():
    assert next_patch_version("1.0") == "1.0.1"
    assert next_patch_version("1.0.0") == "1.0.1"
    assert next_patch_version("1.2.9") == "1.2.10"
