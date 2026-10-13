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
            {**rule.config["levels"][0], "color": "blue", "code": "S", "name": "卓越", "value": "40"},
            {**rule.config["levels"][1], "name": "符合预期"},
        ],
    }

    result = await update_review_rule(rule.id, _write_payload(rule, name="已使用评级", config=allowed), _context(), db)
    assert result.name == "已使用评级"
    assert result.config["levels"][0]["quantifiedScore"] == "3"

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


