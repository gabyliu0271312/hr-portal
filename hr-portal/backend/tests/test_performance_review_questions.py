from datetime import UTC, datetime

import pytest
from fastapi import HTTPException

from app.performance.auth_context import PerformanceAccessContext
from app.performance.models import PerformanceReviewQuestion, PerformanceReviewRule
from app.performance.review_router import (
    ReviewQuestionCreateRequest,
    ReviewRuleWriteRequest,
    _config_summary,
    _active_rule,
    _score_bounds,
    _sub_question_option,
    create_review_question,
    create_review_rule,
    delete_review_question,
    delete_review_rule,
    list_review_questions,
    update_review_question,
    update_review_rule,
)


class _Db:
    def __init__(self, *, rule, parent=None, used=False):
        self.rule = rule
        self.parent = parent
        self.used = used
        self.question = None
        self.commits = 0
        self.get_calls = []

    async def get(self, model, value, **kwargs):
        self.get_calls.append((model, value, kwargs))
        if model is PerformanceReviewRule:
            return self.rule if value == self.rule.id else None
        if model is PerformanceReviewQuestion:
            return self.parent if self.parent and value == self.parent.id else None
        return None

    async def execute(self, _statement):
        return _Result(9001 if self.used else None)

    def add(self, value):
        self.question = value

    async def commit(self):
        self.commits += 1

    async def refresh(self, value):
        value.id = 501
        value.created_at = datetime.now(UTC)
        value.updated_at = value.created_at


class _Result:
    def __init__(self, value):
        self.value = value

    def scalar_one_or_none(self):
        return self.value


class _QuestionListResult:
    def all(self):
        return []


class _QuestionListDb:
    def __init__(self):
        self.statement = None

    async def execute(self, statement):
        self.statement = statement
        return _QuestionListResult()


def _rule(*, status="active", config=None):
    now = datetime.now(UTC)
    return PerformanceReviewRule(
        id=101,
        name="测试评级",
        review_type="评级",
        status=status,
        config=config or {},
        created_by_type="SYSTEM_ACCOUNT",
        created_by_ref="1",
        created_at=now,
        updated_at=now,
    )


def _context():
    return PerformanceAccessContext(
        subject_type="SYSTEM_ACCOUNT",
        subject_id=1,
        display_name="管理员",
        account_type="PERFORMANCE_ADMIN",
        portal_entry_permissions=(),
        role_grants=(),
        permission_codes=("performance.configuration.manage",),
    )


def _question(*, is_sub_question=True):
    now = datetime.now(UTC)
    return PerformanceReviewQuestion(
        id=201,
        name="子评估题",
        type="regular",
        is_sub_question=is_sub_question,
        parent_question_id=None,
        rule_id=101,
        language="zh-CN",
        description="",
        remark="",
        created_by_type="SYSTEM_ACCOUNT",
        created_by_ref="1",
        created_at=now,
        updated_at=now,
    )


def test_sub_question_candidate_policy_reads_associated_rule_configuration():
    rating_on = _rule(config={
        "grade_participates_in_calculation": True,
        "levels": [{"quantified_score": "1"}, {"quantified_score": "5"}],
    })
    rating_off = _rule(config={"grade_participates_in_calculation": False, "levels": []})
    score = _rule(config={"score": {"method": "在分数上下限内输入评分", "min": "0", "max": "100"}})
    score.review_type = "评分"
    mapping = _rule(config={"mapping": {"min": "0", "max": "100"}})
    mapping.review_type = "评分映射等级型"

    assert _sub_question_option(_question(), rating_on, "none").score_min == 1
    assert _sub_question_option(_question(), score, "none").score_max == 100
    assert _sub_question_option(_question(), rating_off, "none") is None
    assert _sub_question_option(_question(), mapping, "none") is None
    assert _sub_question_option(_question(is_sub_question=False), rating_on, "none") is None

    assert _sub_question_option(_question(), rating_on, "condition") is not None
    assert _sub_question_option(_question(), score, "condition") is None
    assert _sub_question_option(_question(), rating_off, "condition") is None


def test_fixed_score_bounds_are_derived_from_option_min_and_max():
    rule = _rule(config={
        "score": {
            "method": "在固定分值选项内选择评分",
            "fixed_options": [{"value": "5"}, {"value": "1"}, {"value": "3"}, {"value": "invalid"}],
        }
    })
    rule.review_type = "评分"
    assert _score_bounds(rule) == (1.0, 5.0)


def test_review_question_payload_requires_rule_id_and_valid_parent_relation():
    payload = ReviewQuestionCreateRequest(
        name="问题",
        type="regular",
        rule_id=101,
        is_sub_question=False,
    )
    assert payload.rule_id == 101

    sub_payload = ReviewQuestionCreateRequest(name="子问题", type="regular", rule_id=101, is_sub_question=True)
    assert sub_payload.parent_question_id is None

    with pytest.raises(ValueError, match="普通评估题不能指定父评估题"):
        ReviewQuestionCreateRequest(name="问题", type="regular", rule_id=101, parent_question_id=9)


def test_rule_summary_preserves_configuration_variant():
    assert _config_summary(_rule(config={"grade_participates_in_calculation": True, "levels": [1, 2]})) == {
        "grade_participates_in_calculation": True,
        "level_count": 2,
        "quantified_score_min": None,
        "quantified_score_max": None,
    }


def test_inactive_rule_is_not_selectable():
    async def run():
        with pytest.raises(HTTPException) as exc:
            await _active_rule(_Db(rule=_rule(status="inactive")), 101)
        assert exc.value.status_code == 409
        assert exc.value.detail["code"] == "PERFORMANCE_REVIEW_RULE_UNAVAILABLE"

    import asyncio
    asyncio.run(run())


@pytest.mark.asyncio
async def test_question_description_update_validates_rule_and_commits_atomically():
    rule = _rule(config={"levels": [{"id": "a", "code": "1星", "name": "不合格"}]})
    db = _Db(rule=rule)
    result = await create_review_question(
        ReviewQuestionCreateRequest(name="绩效评级", type="regular", rule_id=rule.id, level_descriptions={"a": "结果未达标"}),
        _context(), db,
    )
    assert db.commits == 1
    assert result.rule.config["levels"][0]["description"] == "结果未达标"

    with pytest.raises(HTTPException) as exc:
        await create_review_question(
            ReviewQuestionCreateRequest(name="无效评级", type="regular", rule_id=rule.id, level_descriptions={"missing": "未知等级"}),
            _context(), db,
        )
    assert exc.value.status_code == 422
    assert db.commits == 1
    assert rule.config["levels"][0]["description"] == "结果未达标"


@pytest.mark.asyncio
async def test_question_edit_updates_description_in_the_same_commit():
    rule = _rule(config={"levels": [{"id": "a", "code": "1星", "name": "不合格", "description": "旧说明"}]})
    question = _question(is_sub_question=False)
    db = _Db(rule=rule, parent=question)
    result = await update_review_question(
        question.id,
        ReviewQuestionCreateRequest(name="更新评级", type="regular", rule_id=rule.id, level_descriptions={"a": "新说明"}),
        _context(), db,
    )
    assert db.commits == 1
    assert result.rule.config["levels"][0]["description"] == "新说明"
    assert question.name == "更新评级"


@pytest.mark.asyncio
async def test_create_review_question_persists_rule_id_and_parent_relation():
    db = _Db(rule=_rule())
    payload = ReviewQuestionCreateRequest(
        name="子问题",
        description="描述",
        type="okr",
        is_sub_question=True,
        parent_question_id=77,
        rule_id=101,
        display_mode="下拉样式",
        remark="备注",
    )
    db.parent = PerformanceReviewQuestion(
        id=77,
        name="父问题",
        type="regular",
        is_sub_question=False,
        rule_id=101,
        language="zh-CN",
        description="",
        remark="",
        created_by_type="SYSTEM_ACCOUNT",
        created_by_ref="1",
    )
    now = datetime.now(UTC)
    db.parent.created_at = now
    db.parent.updated_at = now

    result = await create_review_question(payload, _context(), db)

    assert db.commits == 1
    assert db.question.rule_id == 101
    assert db.question.display_mode == "下拉样式"
    assert db.question.parent_question_id == 77
    assert db.question.is_sub_question is True


@pytest.mark.asyncio
async def test_display_mode_is_stored_per_question():
    rule = _rule()
    first = _question(is_sub_question=False)
    first.id = 301
    second = _question(is_sub_question=False)
    second.id = 302

    await update_review_question(
        first.id,
        ReviewQuestionCreateRequest(name="第一个题目", type="regular", rule_id=rule.id, display_mode="下拉样式"),
        _context(),
        _Db(rule=rule, parent=first),
    )
    await update_review_question(
        second.id,
        ReviewQuestionCreateRequest(name="第二个题目", type="regular", rule_id=rule.id, display_mode="标签样式"),
        _context(),
        _Db(rule=rule, parent=second),
    )

    assert first.display_mode == "下拉样式"
    assert second.display_mode == "标签样式"
    assert "displayMode" not in rule.config
    assert "display_mode" not in rule.config


@pytest.mark.asyncio
async def test_create_review_rule_persists_configuration_and_remark():
    db = _Db(rule=_rule())
    payload = ReviewRuleWriteRequest(
        name=" 新建规则 ",
        review_type="评分",
        config={"method": "在固定分值选项内选择评分", "fixed_options": [{"value": "1"}]},
        remark="规则说明",
    )

    result = await create_review_rule(payload, _context(), db)

    assert db.commits == 1
    assert db.question.name == "新建规则"
    assert db.question.review_type == "评分"
    assert db.question.config["method"] == "在固定分值选项内选择评分"
    assert db.question.remark == "规则说明"
    assert result.name == "新建规则"
    assert result.is_used is False
    assert result.deletable is True


def _write_payload(rule: PerformanceReviewRule, *, name=None, review_type=None, config=None, remark=None):
    return ReviewRuleWriteRequest(
        name=name or rule.name,
        review_type=review_type or rule.review_type,
        config=rule.config if config is None else config,
        remark=(rule.remark or "") if remark is None else remark,
    )


@pytest.mark.asyncio
async def test_unused_rule_allows_type_change_and_soft_delete():
    rule = _rule(config={"levels": []})
    db = _Db(rule=rule)

    result = await update_review_rule(
        rule.id,
        _write_payload(rule, review_type="评分", config={"score": {"method": "固定分值"}}),
        _context(),
        db,
    )

    assert result.review_type == "评分"
    assert db.get_calls[0][2] == {"with_for_update": True}

    response = await delete_review_rule(rule.id, _context(), db)
    assert response.status_code == 204
    assert rule.status == "inactive"


@pytest.mark.asyncio
async def test_used_rule_cannot_be_deleted_for_any_question_reference():
    rule = _rule()
    db = _Db(rule=rule, used=True)

    with pytest.raises(HTTPException) as exc:
        await delete_review_rule(rule.id, _context(), db)

    assert exc.value.status_code == 409
    assert exc.value.detail == {
        "code": "PERFORMANCE_REVIEW_RULE_IN_USE",
        "message": "此评估规则已被使用，不允许删除",
    }
    assert rule.status == "active"
    assert db.commits == 0


@pytest.mark.asyncio
async def test_used_rating_allows_visible_fields_and_blocks_quantified_score_or_structure():
    rule = _rule(config={
        "languages": {"chinese": True, "english": False},
        "gradeParticipatesInCalculation": True,
        "levels": [
            {"id": "a", "color": "red", "code": "A", "name": "优秀", "quantifiedScore": "3", "value": "30"},
            {"id": "b", "color": "orange", "code": "B", "name": "良好", "quantifiedScore": "2", "value": "20"},
        ],
    })
    db = _Db(rule=rule, used=True)
    allowed = {
        **rule.config,
        "levels": [
            {**rule.config["levels"][0], "color": "blue", "code": "S", "name": "卓越", "description": "超出预期", "value": "40"},
            {**rule.config["levels"][1], "name": "符合预期"},
        ],
    }

    result = await update_review_rule(rule.id, _write_payload(rule, name="已使用评级", config=allowed), _context(), db)
    assert result.name == "已使用评级"
    assert result.config["levels"][0]["quantifiedScore"] == "3"
    assert result.config["levels"][0]["description"] == "超出预期"

    changed_score = {**allowed, "levels": [{**allowed["levels"][0], "quantifiedScore": "4"}, allowed["levels"][1]]}
    with pytest.raises(HTTPException) as score_exc:
        await update_review_rule(rule.id, _write_payload(rule, config=changed_score), _context(), db)
    assert score_exc.value.detail["code"] == "PERFORMANCE_REVIEW_RULE_EDIT_RESTRICTED"

    added_level = {**allowed, "levels": [*allowed["levels"], {**allowed["levels"][0], "id": "c"}]}
    with pytest.raises(HTTPException):
        await update_review_rule(rule.id, _write_payload(rule, config=added_level), _context(), db)


@pytest.mark.asyncio
async def test_used_score_only_allows_name_change():
    rule = _rule(config={"score": {"method": "在分数上下限内输入评分", "min": "0", "max": "100"}})
    rule.review_type = "评分"
    db = _Db(rule=rule, used=True)

    result = await update_review_rule(rule.id, _write_payload(rule, name="新名称"), _context(), db)
    assert result.name == "新名称"

    with pytest.raises(HTTPException) as exc:
        await update_review_rule(
            rule.id,
            _write_payload(rule, config={"score": {**rule.config["score"], "max": "120"}}),
            _context(),
            db,
        )
    assert exc.value.status_code == 409


@pytest.mark.asyncio
async def test_used_mapping_allows_content_changes_but_locks_bounds_and_interval_count():
    mapping = {
        "method": "在分数上下限内输入评分",
        "min": "0",
        "max": "100",
        "rule": "a ≤ 分数 < b",
        "precision": "不保留小数",
        "intervals": [
            {"lower": "0", "upper": "60", "code": "C", "name": "待改进"},
            {"lower": "60", "upper": "100", "code": "A", "name": "优秀"},
        ],
    }
    rule = _rule(config={"languages": {"chinese": True, "english": False}, "mapping": mapping})
    rule.review_type = "评分映射等级型"
    db = _Db(rule=rule, used=True)
    allowed_mapping = {
        **mapping,
        "rule": "a < 分数 ≤ b",
        "precision": "保留 1 位小数",
        "intervals": [
            {**mapping["intervals"][0], "upper": "70", "code": "D"},
            {**mapping["intervals"][1], "lower": "70", "name": "超出预期"},
        ],
    }

    result = await update_review_rule(
        rule.id,
        _write_payload(rule, config={**rule.config, "mapping": allowed_mapping}),
        _context(),
        db,
    )
    assert result.config["mapping"]["rule"] == "a < 分数 ≤ b"

    with pytest.raises(HTTPException):
        await update_review_rule(
            rule.id,
            _write_payload(rule, config={**rule.config, "mapping": {**allowed_mapping, "max": "120"}}),
            _context(),
            db,
        )

    with pytest.raises(HTTPException):
        await update_review_rule(
            rule.id,
            _write_payload(rule, config={**rule.config, "mapping": {**allowed_mapping, "intervals": allowed_mapping["intervals"][:1]}}),
            _context(),
            db,
        )


@pytest.mark.asyncio
async def test_list_review_questions_applies_review_type_filter():
    db = _QuestionListDb()

    result = await list_review_questions("评级", _context(), db)

    assert result.items == []
    assert "performance_review_rules.review_type = :review_type_1" in str(db.statement)
    assert "performance_review_rules.status = :status_1" in str(db.statement)


class _DeleteResult:
    def __init__(self, values):
        self.values = values

    def scalar_one_or_none(self):
        return next(iter(self.values), None)

    def scalars(self):
        return self

    def all(self):
        return self.values


class _DeleteDb:
    def __init__(self, question=None, *, children=(), workflows=(), cycles=(), snapshots=()):
        self.question = question
        self.children = children
        self.workflows = workflows
        self.cycles = cycles
        self.snapshots = snapshots
        self.deleted = None
        self.commits = 0
        self.get_calls = []

    async def get(self, model, value, **kwargs):
        self.get_calls.append((model, value, kwargs))
        return self.question if self.question and self.question.id == value else None

    async def execute(self, statement):
        sql = str(statement)
        if "performance_template_workflows" in sql:
            return _DeleteResult(self.workflows)
        if "performance_cycles" in sql:
            return _DeleteResult(self.cycles)
        if "performance_project_node_snapshots" in sql:
            return _DeleteResult(self.snapshots)
        if "parent_question_id IN" in sql:
            return _DeleteResult([self.question.id] if self.children and self.question else [])
        return _DeleteResult([(self.question, _rule())] if self.question else [])

    async def delete(self, question):
        self.deleted = question
        self.question = None

    async def commit(self):
        self.commits += 1


def _workflow(*, nodes=(), library=(), cycle_count=0):
    from app.performance.models import PerformanceTemplateWorkflow
    return PerformanceTemplateWorkflow(template_id=77, nodes=list(nodes), content_library=list(library), cycle_count=cycle_count)


@pytest.mark.parametrize("content", [
    {"ratingOptionId": "201"},
    {"items": [{"kind": "rating", "ratingOptionId": 201}]},
    {"type": "rating", "items": [{"id": "201"}]},
    {"kind": "rating", "id": "201"},
    {"template": {"content": [{"ratingOptionId": "0201"}]}},
])
def test_question_reference_detection_matches_exact_question_ids(content):
    from app.performance.review_router import _contains_question_reference
    assert _contains_question_reference(content, 201)
    assert not _contains_question_reference(content, 20)


@pytest.mark.parametrize("content", [
    {"remark": "201", "id": "201"},
    {"type": "custom", "items": [{"kind": "fill", "id": "201"}]},
    {"kind": "rating", "id": "201", "ratingOptionId": "999"},
    {"type": "rating", "id": "201", "items": [{"id": "999"}]},
])
def test_question_reference_detection_does_not_match_unrelated_text_or_item_ids(content):
    from app.performance.review_router import _contains_question_reference
    assert not _contains_question_reference(content, 201)


@pytest.mark.asyncio
async def test_delete_unused_question_persists_and_list_does_not_return_it():
    question = _question(is_sub_question=False)
    db = _DeleteDb(question)
    response = await delete_review_question(question.id, _context(), db)
    assert response.status_code == 204
    assert db.deleted is question
    assert db.commits == 1
    assert db.get_calls[0][2] == {"with_for_update": True}
    assert (await list_review_questions(None, _context(), db)).items == []


@pytest.mark.asyncio
async def test_delete_question_rejects_parent_with_children():
    db = _DeleteDb(_question(is_sub_question=False), children=[301])
    with pytest.raises(HTTPException) as error:
        await delete_review_question(201, _context(), db)
    assert error.value.status_code == 409
    assert error.value.detail["code"] == "PERFORMANCE_REVIEW_QUESTION_HAS_CHILDREN"
    assert db.deleted is None
    assert db.commits == 0


@pytest.mark.asyncio
@pytest.mark.parametrize("location", ["nodes", "library"])
async def test_delete_question_rejects_template_references(location):
    content = {"items": [{"kind": "rating", "ratingOptionId": "201"}]}
    workflow = _workflow(**({"nodes": [{"content": [content]}]} if location == "nodes" else {"library": [content]}))
    db = _DeleteDb(_question(), workflows=[workflow])
    with pytest.raises(HTTPException) as error:
        await delete_review_question(201, _context(), db)
    assert error.value.status_code == 409
    assert error.value.detail["code"] == "PERFORMANCE_REVIEW_QUESTION_IN_TEMPLATE"
    assert db.deleted is None
    assert db.commits == 0


@pytest.mark.asyncio
@pytest.mark.parametrize("usage", ["legacy_template_id", "template_ids", "usage_count", "snapshot_only"])
async def test_delete_question_rejects_cycle_usage_and_historical_snapshots(usage):
    from app.performance.models import PerformanceCycle
    content = {"ratingOptionId": "201"}
    workflow = _workflow(library=[content], cycle_count=1 if usage == "usage_count" else 0)
    cycle = PerformanceCycle(template_id=77 if usage == "legacy_template_id" else None, template_ids=[77] if usage == "template_ids" else [])
    db = _DeleteDb(
        _question(),
        workflows=[] if usage == "snapshot_only" else [workflow],
        cycles=[cycle],
        snapshots=[{"template": {"content": [content]}}] if usage == "snapshot_only" else [],
    )
    with pytest.raises(HTTPException) as error:
        await delete_review_question(201, _context(), db)
    assert error.value.status_code == 409
    assert error.value.detail["code"] == "PERFORMANCE_REVIEW_QUESTION_IN_CYCLE"
    assert db.deleted is None
    assert db.commits == 0


@pytest.mark.asyncio
async def test_delete_question_returns_not_found_without_writing():
    db = _DeleteDb()
    with pytest.raises(HTTPException) as error:
        await delete_review_question(201, _context(), db)
    assert error.value.status_code == 404
    assert db.deleted is None
    assert db.commits == 0


@pytest.mark.asyncio
@pytest.mark.parametrize("usage, expected_code", [
    ("unused", None),
    ("children", "PERFORMANCE_REVIEW_QUESTION_HAS_CHILDREN"),
    ("template", "PERFORMANCE_REVIEW_QUESTION_IN_TEMPLATE"),
    ("cycle", "PERFORMANCE_REVIEW_QUESTION_IN_CYCLE"),
    ("snapshot", "PERFORMANCE_REVIEW_QUESTION_IN_CYCLE"),
])
async def test_list_delete_availability_matches_delete_guard(usage, expected_code):
    question = _question()
    question.display_mode = "标签样式"
    db = _DeleteDb(
        question,
        children=[301] if usage == "children" else [],
        workflows=[_workflow(library=[{"ratingOptionId": "201"}], cycle_count=1 if usage == "cycle" else 0)] if usage in {"template", "cycle"} else [],
        snapshots=[{"template": {"content": [{"ratingOptionId": "201"}]}}] if usage == "snapshot" else [],
    )
    item = (await list_review_questions(None, _context(), db)).items[0]
    assert item.deletable is (expected_code is None)
    assert bool(item.delete_reason) is (expected_code is not None)
    if expected_code:
        with pytest.raises(HTTPException) as error:
            await delete_review_question(201, _context(), db)
        assert error.value.detail == {"code": expected_code, "message": item.delete_reason}
    else:
        assert (await delete_review_question(201, _context(), db)).status_code == 204


@pytest.mark.asyncio
async def test_non_calculating_rating_can_be_deleted_when_unreferenced():
    question = _question()
    question.display_mode = "标签样式"
    db = _DeleteDb(question)
    rule = _rule(config={"gradeParticipatesInCalculation": False, "levels": []})
    execute = db.execute

    async def with_non_calculating_rule(statement):
        if "JOIN performance_review_rules" in str(statement):
            return _DeleteResult([(question, rule)])
        return await execute(statement)

    db.execute = with_non_calculating_rule
    item = (await list_review_questions(None, _context(), db)).items[0]
    assert item.deletable is True
    assert (await delete_review_question(201, _context(), db)).status_code == 204


@pytest.mark.asyncio
async def test_question_delete_http_route_enforces_permissions_and_reopen():
    from fastapi import FastAPI
    from httpx import ASGITransport, AsyncClient
    from app.core.db import get_session
    from app.performance.auth_context import get_performance_access_context
    from app.performance.review_router import router

    app = FastAPI()
    app.include_router(router)
    db = _DeleteDb(_question())
    context = _context()
    app.dependency_overrides[get_session] = lambda: db
    app.dependency_overrides[get_performance_access_context] = lambda: context
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        from dataclasses import replace
        context = replace(context, permission_codes=())
        assert (await client.delete("/performance/review-questions/201")).status_code == 403
        assert db.commits == 0
        context = _context()
        assert (await client.delete("/performance/review-questions/201")).status_code == 204
        assert (await client.get("/performance/review-questions")).json() == {"items": []}
        assert (await client.delete("/performance/review-questions/201")).status_code == 404


