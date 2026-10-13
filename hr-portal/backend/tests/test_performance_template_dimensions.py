from datetime import datetime, timezone
from types import SimpleNamespace

import pytest
from fastapi import HTTPException

from app.performance import templates_router
from app.performance.auth_context import PerformanceAccessContext
from app.performance.models import PerformanceAuditEvent, PerformanceTemplate


class _Result:
    def __init__(self, ids=None, scalar=None):
        self.ids = ids or []
        self.scalar = scalar

    def scalar_one_or_none(self):
        return self.scalar

    def scalars(self):
        return self

    def all(self):
        return self.ids


class _DimensionDb:
    def __init__(self, template):
        self.template = template
        self.added = []
        self.commits = 0
        self.calls = 0

    async def get(self, model, template_id):
        return self.template if model is PerformanceTemplate and template_id == self.template.id else None

    async def execute(self, _statement):
        self.calls += 1
        if self.calls == 1:
            return _Result(ids=[1])
        if self.calls == 2:
            return _Result(ids=[2])
        return _Result(scalar=None)

    def add(self, value):
        self.added.append(value)

    async def commit(self):
        self.commits += 1

    async def refresh(self, _value):
        return None


def _context():
    return PerformanceAccessContext(
        subject_type="SYSTEM_ACCOUNT",
        subject_id=7,
        display_name="dimension-admin",
        account_type="PERFORMANCE_ADMIN",
        portal_entry_permissions=(),
        role_grants=(),
        permission_codes=("performance.configuration.manage",),
    )


def _template():
    now = datetime(2026, 9, 30, tzinfo=timezone.utc)
    return SimpleNamespace(
        id=901,
        name="指标模板",
        description="",
        language="zh-CN",
        english_enabled=False,
        audience_settings_enabled=False,
        template_kind="metric",
        score_method="manual",
        dimensions=[],
        calculation_enabled=False,
        selected_rules=[],
        status="inactive",
        created_at=now,
        updated_at=now,
    )


def _dimension():
    return {
        "id": "dimension-1",
        "name": "经营结果",
        "description": "季度经营目标",
        "need_weight": True,
        "weight": 25,
        "metric_type_ids": [1],
        "allow_reviewee_add_metrics": False,
        "review_rule_mode": "same",
        "review_rule_id": 2,
    }


def test_dimension_schema_requires_rule_for_same_rule_mode():
    with pytest.raises(ValueError):
        templates_router.MetricTemplateDimension(name="经营结果", metric_type_ids=[1])


def test_dimension_schema_rejects_duplicate_metric_types():
    with pytest.raises(ValueError):
        templates_router.MetricTemplateDimension(name="经营结果", metric_type_ids=[1, 1], review_rule_mode="different")


@pytest.mark.asyncio
async def test_update_template_persists_dimension_and_audit():
    template = _template()
    db = _DimensionDb(template)
    payload = templates_router.TemplateCreateRequest(
        name="指标模板",
        template_kind="metric",
        dimensions=[_dimension()],
    )

    result = await templates_router.update_template(901, payload, _context(), db)

    assert result.dimensions[0].name == "经营结果"
    assert result.dimensions[0].metric_type_ids == [1]
    assert result.dimensions[0].weight == 25
    assert template.dimensions[0]["review_rule_id"] == 2
    assert db.commits == 1
    audit = next(item for item in db.added if isinstance(item, PerformanceAuditEvent))
    assert audit.event_type == "PERFORMANCE_TEMPLATE_UPDATED"
    assert audit.after_state["dimensions"][0]["id"] == "dimension-1"


def test_dimension_weight_range_and_legacy_read():
    for weight in (-1, 101):
        with pytest.raises(ValueError):
            templates_router.MetricTemplateDimension.model_validate({**_dimension(), "weight": weight})
    legacy = _template()
    legacy.dimensions = [{key: value for key, value in _dimension().items() if key != "weight"}]
    assert templates_router._template_detail(legacy).dimensions[0].weight is None
    disabled = templates_router.MetricTemplateDimension.model_validate({**_dimension(), "need_weight": False})
    assert disabled.weight is None


@pytest.mark.asyncio
async def test_update_template_requires_weight_when_switch_enabled():
    template = _template()
    db = _DimensionDb(template)
    payload = templates_router.TemplateCreateRequest(
        name="指标模板", template_kind="metric",
        dimensions=[{**_dimension(), "weight": None}],
    )
    with pytest.raises(HTTPException) as exc_info:
        await templates_router.update_template(901, payload, _context(), db)
    assert exc_info.value.status_code == 422
    assert exc_info.value.detail["code"] == "PERFORMANCE_METRIC_DIMENSION_WEIGHT_REQUIRED"
    assert db.commits == 0


def test_reviewee_settings_default_for_legacy_dimensions_and_reject_unknown_modes():
    legacy = _template()
    legacy.dimensions = [_dimension()]
    result = templates_router._template_detail(legacy).dimensions[0]
    assert result.reviewee_add_method == "library_or_custom"
    assert result.reviewee_scoring_method == "manual"
    assert result.reviewee_min_one_metric is True
    with pytest.raises(ValueError):
        templates_router.MetricTemplateDimension.model_validate({**_dimension(), "reviewee_add_method": "unknown"})
    with pytest.raises(ValueError):
        templates_router.MetricTemplateDimension.model_validate({**_dimension(), "reviewee_scoring_method": "automatic"})


@pytest.mark.asyncio
async def test_reviewee_settings_round_trip_and_audit_with_template_update():
    template = _template()
    db = _DimensionDb(template)
    dimension = {
        **_dimension(), "allow_reviewee_add_metrics": True,
        "reviewee_add_method": "library", "reviewee_scoring_method": "manual",
        "reviewee_min_one_metric": False,
    }
    payload = templates_router.TemplateCreateRequest(name="指标模板", template_kind="metric", dimensions=[dimension])
    result = await templates_router.update_template(901, payload, _context(), db)
    saved = result.dimensions[0]
    assert saved.allow_reviewee_add_metrics is True
    assert saved.reviewee_add_method == "library"
    assert saved.reviewee_scoring_method == "manual"
    assert saved.reviewee_min_one_metric is False
    assert templates_router._template_detail(template).dimensions[0].model_dump() == saved.model_dump()
    audit = next(item for item in db.added if isinstance(item, PerformanceAuditEvent))
    assert audit.after_state["dimensions"][0]["reviewee_min_one_metric"] is False
    assert db.commits == 1


@pytest.mark.asyncio
async def test_update_template_rejects_missing_metric_type():
    template = _template()
    db = _DimensionDb(template)
    payload = templates_router.TemplateCreateRequest(
        name="指标模板",
        template_kind="metric",
        dimensions=[{**_dimension(), "metric_type_ids": [99]}],
    )

    with pytest.raises(HTTPException) as exc_info:
        await templates_router.update_template(901, payload, _context(), db)

    assert exc_info.value.status_code == 422
    assert exc_info.value.detail["code"] == "PERFORMANCE_METRIC_TYPE_NOT_FOUND"
    assert template.dimensions == []
    assert db.commits == 0
