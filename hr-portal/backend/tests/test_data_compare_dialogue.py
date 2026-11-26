import copy
import json
import unittest
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

from fastapi import HTTPException

from app.data_compare import dialogue


PARAMS = {
    "kind": "report_amount_v1", "report_id": 1, "table_b": "payroll", "period_field_a": "month",
    "periods": ["202601"],
    "metrics": [{"id": "salary", "label": "工资", "column_a": "salary", "expression_b": "b.salary", "tolerance": "0"}],
    "dimension": {"column_a": "org", "column_b": "org", "value_map_b": {}},
}
METADATA = {
    "reports": [{"id": 1, "name": "报表", "columns": [{"code": "salary"}, {"code": "org"}]}],
    "tables": [{"table": "payroll", "columns": [{"code": "salary", "data_type": "number"}, {"code": "org", "data_type": "string"}]}],
}


class FakeDB:
    def __init__(self):
        self.conv = None
        self.locked = False

    def add(self, conv):
        conv.id = 7
        self.conv = conv

    async def flush(self):
        pass

    async def execute(self, stmt):
        self.locked = stmt._for_update_arg is not None
        user_id = list(stmt.compile().params.values())[-1]
        conv = self.conv if self.conv and self.conv.user_id == user_id else None
        return SimpleNamespace(scalar_one_or_none=lambda: conv)


class DialogueTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.db = FakeDB()
        self.user = SimpleNamespace(id=10)
        self.metadata = patch.object(dialogue, "_metadata", AsyncMock(return_value=METADATA))
        self.validate = patch.object(dialogue, "_validate", AsyncMock(return_value={"fingerprint": "v1"}))
        self.metadata.start()
        self.validator = self.validate.start()
        self.addCleanup(self.metadata.stop)
        self.addCleanup(self.validate.stop)

    async def turn(self, data, patch_data=None):
        model = AsyncMock(return_value=json.dumps({"patch": patch_data or {}}))
        result = await dialogue.process_dialogue(data, self.user, self.db, model)
        return result, model

    async def complete(self):
        result, _ = await self.turn({"instruction": "配置对比"}, PARAMS)
        return result

    async def test_multiturn_merge_confirmation_and_no_business_execution(self):
        partial, _ = await self.turn({"instruction": "比较这个报表"}, {"report_id": 1})
        self.assertEqual(partial["status"], "requires_input")
        self.validator.assert_not_awaited()
        rest = {key: value for key, value in PARAMS.items() if key not in {"kind", "report_id"}}
        ready, _ = await self.turn({"instruction": "补齐", "conversation_id": 7, "revision": 1}, rest)
        self.assertEqual(ready["status"], "requires_confirmation")
        self.assertEqual(ready["params"], PARAMS)
        confirmed, model = await self.turn({"conversation_id": 7, "revision": 2, "action": "confirm"})
        model.assert_not_awaited()
        self.assertEqual(confirmed["status"], "confirmed")
        await dialogue.validate_confirmation(confirmed["confirmation_token"], PARAMS, self.user, self.db)
        self.assertTrue(self.db.locked)

    async def test_old_revision_and_cross_user_rejected(self):
        await self.complete()
        with self.assertRaises(HTTPException) as stale:
            await self.turn({"instruction": "修改", "conversation_id": 7, "revision": 0})
        self.assertEqual(stale.exception.status_code, 409)
        with self.assertRaises(HTTPException) as denied:
            await dialogue.process_dialogue({"instruction": "修改", "conversation_id": 7, "revision": 1}, SimpleNamespace(id=11), self.db, AsyncMock())
        self.assertEqual(denied.exception.status_code, 404)

    async def test_modification_cancel_and_tamper_invalidate_confirmation(self):
        await self.complete()
        confirmed, _ = await self.turn({"conversation_id": 7, "revision": 1, "action": "confirm"})
        tampered = copy.deepcopy(PARAMS)
        tampered["periods"] = ["202602"]
        with self.assertRaises(HTTPException):
            await dialogue.validate_confirmation(confirmed["confirmation_token"], tampered, self.user, self.db)
        revised, _ = await self.turn({"instruction": "改月份", "conversation_id": 7, "revision": 2}, {"periods": ["202602"]})
        self.assertEqual(revised["params"]["metrics"], PARAMS["metrics"])
        with self.assertRaises(HTTPException):
            await dialogue.validate_confirmation(confirmed["confirmation_token"], PARAMS, self.user, self.db)
        cancelled, model = await self.turn({"conversation_id": 7, "revision": 3, "action": "cancel"})
        self.assertEqual(cancelled["status"], "requires_input")
        model.assert_not_awaited()
        self.assertIsNone(self.db.conv.active_capability_id)

    async def test_changed_instruction_rejected_on_save(self):
        await self.complete()
        confirmed, _ = await self.turn({"conversation_id": 7, "revision": 1, "action": "confirm"})
        await dialogue.validate_confirmation(confirmed["confirmation_token"], PARAMS, self.user, self.db, instruction="配置对比")
        with self.assertRaises(HTTPException) as changed:
            await dialogue.validate_confirmation(confirmed["confirmation_token"], PARAMS, self.user, self.db, instruction="新需求")
        self.assertEqual(changed.exception.status_code, 409)

    async def test_revoked_metadata_does_not_reach_model(self):
        await self.complete()
        with patch.object(dialogue, "_metadata", AsyncMock(return_value={"reports": [], "tables": []})):
            model = AsyncMock()
            with self.assertRaises(HTTPException) as denied:
                await dialogue.process_dialogue({"instruction": "继续", "conversation_id": 7, "revision": 1}, self.user, self.db, model)
            self.assertEqual(denied.exception.status_code, 403)
            model.assert_not_awaited()

    async def test_definition_change_requires_reconfirmation(self):
        await self.complete()
        self.validator.return_value = {"fingerprint": "v2"}
        with self.assertRaises(HTTPException) as changed:
            await self.turn({"conversation_id": 7, "revision": 1, "action": "confirm"})
        self.assertEqual(changed.exception.status_code, 409)

    async def test_invalid_json_invalidates_old_confirmation(self):
        await self.complete()
        confirmed, _ = await self.turn({"conversation_id": 7, "revision": 1, "action": "confirm"})
        await dialogue.process_dialogue({"instruction": "修改", "conversation_id": 7, "revision": 2}, self.user, self.db, AsyncMock(return_value="not json"))
        with self.assertRaises(HTTPException):
            await dialogue.validate_confirmation(confirmed["confirmation_token"], PARAMS, self.user, self.db)

    async def test_expired_and_forged_tokens_rejected(self):
        await self.complete()
        confirmed, _ = await self.turn({"conversation_id": 7, "revision": 1, "action": "confirm"})
        for token in ["7.2.forged", "bad", None]:
            with self.assertRaises(HTTPException):
                await dialogue.validate_confirmation(token, PARAMS, self.user, self.db)
        self.db.conv.state[dialogue.CAPABILITY][dialogue.SLOT]["expires_at"] = 0
        with self.assertRaises(HTTPException):
            await dialogue.validate_confirmation(confirmed["confirmation_token"], PARAMS, self.user, self.db)


class AIRouterDialogueTests(unittest.IsolatedAsyncioTestCase):
    async def test_explicit_dialogue_extraction_skips_legacy_metadata(self):
        from app.ai import router as ai
        from app.ai.conversation import ChatSession
        from app.ai.audit import AiAuditTimer

        with patch.object(ai, "MetadataLoader") as loader:
            result = await ai._extract_data_compare_request(ai.AiChatIn(message="比较报表", dialogue=True), ChatSession(1), object(), AiAuditTimer())
        self.assertTrue(result.extracted["report_dialogue"])
        loader.assert_not_called()

    async def test_generic_report_routing_never_loads_legacy_metadata(self):
        from app.ai import router as ai
        from app.ai.conversation import ChatSession
        from app.ai.audit import AiAuditTimer

        config = SimpleNamespace(model_reasoning="stub", model_fast_json=None, api_key_encrypted="stub", base_url=None, timeout_seconds=1)
        with patch.object(ai, "active_ai_config", AsyncMock(return_value=config)), patch.object(ai, "decrypt", return_value="stub"), patch.object(ai, "chat_completion_openai_compatible", AsyncMock(return_value=(None, '{"report_dialogue":true}', None))), patch.object(ai, "MetadataLoader") as loader:
            result = await ai._extract_data_compare_request(ai.AiChatIn(message="报表与工资表对比"), ChatSession(1), object(), AiAuditTimer())
        self.assertTrue(result.extracted["report_dialogue"])
        loader.assert_not_called()

    async def test_generic_legacy_comparison_preserves_existing_extractor(self):
        from app.ai import router as ai
        from app.ai.conversation import ChatSession
        from app.ai.audit import AiAuditTimer

        config = SimpleNamespace(model_reasoning="stub", model_fast_json=None, api_key_encrypted="stub", base_url=None, timeout_seconds=1)
        spec = SimpleNamespace(model_dump=lambda: {"compare_type": "roster"})
        with patch.object(ai, "active_ai_config", AsyncMock(return_value=config)), patch.object(ai, "decrypt", return_value="stub"), patch.object(ai, "chat_completion_openai_compatible", AsyncMock(return_value=(None, '{"report_dialogue":false}', None))), patch.object(ai, "MetadataLoader") as loader, patch.object(ai, "extract_compare_spec", AsyncMock(return_value=spec)) as extract:
            result = await ai._extract_data_compare_request(ai.AiChatIn(message="对比两表名单"), ChatSession(1), object(), AiAuditTimer())
        self.assertEqual(result.extracted, {"compare_type": "roster"})
        loader.assert_called_once()
        extract.assert_awaited_once()


if __name__ == "__main__":
    unittest.main()
