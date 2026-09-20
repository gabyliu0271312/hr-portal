from datetime import UTC, datetime

import pytest
from fastapi import HTTPException

from app.performance.auth_context import PerformanceAccessContext
from app.performance.models import PerformanceTagFillQuestion
from app.performance.tag_fill_questions_router import (
    TagFillItemWrite,
    TagFillQuestionWriteRequest,
    _contains_tag_reference,
    create_tag_fill_question,
    delete_tag_fill_question,
    update_tag_fill_question,
)


class _ScalarResult:
    def __init__(self, values):
        self.values = values

    def scalars(self):
        return self

    def all(self):
        return self.values


class _Db:
    def __init__(self, question=None, workflows=None):
        self.question = question
        self.workflows = workflows or []
        self.added = None
        self.deleted = None
        self.commits = 0

    async def get(self, model, value):
        if model is PerformanceTagFillQuestion and self.question and self.question.id == value:
            return self.question
        return None

    def add(self, value):
        self.added = value

    async def commit(self):
        self.commits += 1

    async def refresh(self, value):
        now = datetime.now(UTC)
        value.id = value.id or 501
        value.created_at = getattr(value, "created_at", None) or now
        value.updated_at = now

    async def execute(self, _statement):
        return _ScalarResult(self.workflows)

    async def delete(self, value):
        self.deleted = value


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


def _payload():
    return TagFillQuestionWriteRequest(
        name="价值贡献",
        description="说明",
        remark="备注",
        tags=[TagFillItemWrite(name="做得好的", prompt="填写亮点")],
    )


def _question():
    now = datetime.now(UTC)
    return PerformanceTagFillQuestion(
        id=101,
        language="zh-CN",
        name="旧名称",
        description="",
        remark="",
        tags=[{"id": "tag-1", "name": "旧标签", "description": "", "prompt": ""}],
        created_by_type="SYSTEM_ACCOUNT",
        created_by_ref="1",
        created_by_name="管理员",
        created_at=now,
        updated_at=now,
    )


def test_payload_normalizes_labels_and_rejects_duplicates():
    payload = TagFillQuestionWriteRequest(
        name=" 价值贡献 ",
        tags=[TagFillItemWrite(name=" 做得好的 ")],
    )
    assert payload.name == "价值贡献"
    assert payload.tags[0].name == "做得好的"
    assert payload.tags[0].id.startswith("tag-")

    with pytest.raises(ValueError, match="标签名称不能重复"):
        TagFillQuestionWriteRequest(
            name="重复标签",
            tags=[TagFillItemWrite(name="亮点"), TagFillItemWrite(name="亮点")],
        )


@pytest.mark.asyncio
async def test_create_and_update_persist_the_management_form_fields():
    create_db = _Db()
    created = await create_tag_fill_question(_payload(), _context(), create_db)
    assert created.id == 501
    assert created.name == "价值贡献"
    assert created.tags[0].prompt == "填写亮点"
    assert create_db.added.created_by_name == "管理员"
    assert create_db.commits == 1

    question = _question()
    update_db = _Db(question=question)
    updated = await update_tag_fill_question(101, _payload(), _context(), update_db)
    assert updated.name == "价值贡献"
    assert question.tags[0]["name"] == "做得好的"
    assert update_db.commits == 1


def test_reference_detection_finds_nested_template_snapshots():
    assert _contains_tag_reference({"items": [{"tagOptionId": "101"}]}, "101") is True
    assert _contains_tag_reference({"items": [{"tagOptionId": "102"}]}, "101") is False


@pytest.mark.asyncio
async def test_delete_rejects_questions_referenced_by_templates():
    workflow = type("Workflow", (), {
        "content_library": [{"items": [{"tagOptionId": "101"}]}],
        "nodes": [],
    })()
    db = _Db(question=_question(), workflows=[workflow])

    with pytest.raises(HTTPException) as error:
        await delete_tag_fill_question(101, _context(), db)

    assert error.value.status_code == 409
    assert db.deleted is None
