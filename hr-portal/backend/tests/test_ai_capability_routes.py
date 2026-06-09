from app.ai.capabilities import get_capability
from app.main import app


def _route_paths() -> set[str]:
    return {route.path for route in app.routes}


def test_formula_capabilities_are_registered_with_expected_risk():
    generate = get_capability("formula.generate")
    validate = get_capability("formula.validate")
    save = get_capability("calculated_field.save")

    assert generate is not None
    assert generate.type == "draft"
    assert generate.required_permission == ("datasource.datasets", "C")
    assert "draft_only" in generate.side_effect_tags

    assert validate is not None
    assert validate.type == "diagnose"
    assert validate.required_permission == ("datasource.datasets", "V")

    assert save is not None
    assert save.type == "write"
    assert save.confirmation == "required"
    assert "writes_data" in save.side_effect_tags
    assert "high_risk" in save.side_effect_tags


def test_ai_capability_routes_replace_legacy_ai_formula_routes():
    paths = _route_paths()

    assert "/api/v1/ai/capabilities" in paths
    assert "/api/v1/ai/capabilities/formula.generate/draft" in paths
    assert "/api/v1/ai/capabilities/formula.validate/diagnose" in paths
    assert "/api/v1/ai/capabilities/calculated_field.save/write" in paths

    assert "/api/v1/ai-formula/draft" not in paths
    assert "/api/v1/ai-formula/validate" not in paths
