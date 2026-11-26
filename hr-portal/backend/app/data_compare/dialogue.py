from __future__ import annotations

import copy
import hashlib
import json
import secrets
import time

from fastapi import HTTPException
from sqlalchemy import select

from app.ai.conversation import ChatSession, persist
from app.ai.models import AiConversation
from app.ai.provider import parse_json_content


CAPABILITY = "data.compare"
SLOT = "report_dialogue"
FIELDS = {"kind", "report_id", "table_b", "period_field_a", "periods", "metrics", "dimension"}


async def _conversation(conversation_id, user, db):
    if conversation_id is None:
        conv = AiConversation(user_id=user.id, channel="web", state={})
        db.add(conv)
        await db.flush()
        return conv
    if type(conversation_id) is not int or conversation_id < 1:
        raise HTTPException(422, "无效的会话编号")
    conv = (await db.execute(
        select(AiConversation).where(
            AiConversation.id == conversation_id, AiConversation.user_id == user.id,
        ).with_for_update().execution_options(populate_existing=True)
    )).scalar_one_or_none()
    if conv is None:
        raise HTTPException(404, "会话不存在")
    return conv


def _digest(value):
    return hashlib.sha256(json.dumps(value, sort_keys=True, ensure_ascii=False, separators=(",", ":")).encode()).hexdigest()


def _merge(draft, patch):
    result = copy.deepcopy(draft)
    if "report_id" in patch and patch["report_id"] != result.get("report_id"):
        result.pop("period_field_a", None)
        result.pop("metrics", None)
        result.pop("dimension", None)
    if "table_b" in patch and patch["table_b"] != result.get("table_b"):
        result.pop("metrics", None)
        result.pop("dimension", None)
    for key, value in patch.items():
        if key not in FIELDS:
            raise ValueError("包含不支持的配置字段")
        if key == "dimension" and isinstance(value, dict) and isinstance(result.get(key), dict):
            result[key] = {**result[key], **value}
        else:
            result[key] = value
    result["kind"] = "report_amount_v1"
    return result


def _missing(draft):
    missing = [key for key in ("report_id", "table_b", "period_field_a", "periods", "metrics", "dimension") if not draft.get(key)]
    metrics = draft.get("metrics")
    if metrics and (not isinstance(metrics, list) or any(
        not isinstance(metric, dict) or any(metric.get(key) in (None, "") for key in ("id", "label", "column_a", "expression_b", "tolerance"))
        for metric in metrics
    )):
        missing.append("metrics")
    dimension = draft.get("dimension")
    if dimension and (not isinstance(dimension, dict) or any(
        key not in dimension or dimension[key] in (None, "") for key in ("column_a", "column_b", "value_map_b")
    )):
        missing.append("dimension")
    return list(dict.fromkeys(missing))


def _check_sources(draft, metadata):
    report = next((item for item in metadata.get("reports", []) if item["id"] == draft.get("report_id")), None)
    table = next((item for item in metadata.get("tables", []) if item["table"] == draft.get("table_b")), None)
    if (draft.get("report_id") and report is None) or (draft.get("table_b") and table is None):
        raise HTTPException(403, "所选来源当前不可用，请重新开始对话")
    columns_a = {item["code"] for item in report["columns"]} if report else set()
    columns_b = {item["code"] for item in table["columns"]} if table else set()
    dimension = draft.get("dimension") or {}
    if isinstance(dimension, dict):
        if (report and dimension.get("column_a") and dimension["column_a"] not in columns_a) or (table and dimension.get("column_b") and dimension["column_b"] not in columns_b):
            raise HTTPException(403, "所选字段当前不可用，请重新开始对话")
    for metric in draft.get("metrics") or []:
        if isinstance(metric, dict) and report and metric.get("column_a") and metric["column_a"] not in columns_a:
            raise HTTPException(403, "所选字段当前不可用，请重新开始对话")
        if isinstance(metric, dict) and table and metric.get("expression_b"):
            from app.ai_formula.ast.semantics import FieldInfo
            from app.data_compare.report_compare import compile_amount_expression

            fields = [FieldInfo(alias="b", column=item["code"], data_type="number", label=item.get("label", item["code"]))
                      for item in table["columns"] if item.get("data_type") in {"number", "numeric", "decimal", "integer", "float"}]
            try:
                compile_amount_expression(metric["expression_b"], fields)
            except ValueError:
                raise HTTPException(403, "所选公式当前不可用，请重新开始对话") from None


async def _metadata(user, db):
    try:
        from app.data_compare import report_compare
    except ImportError:
        raise HTTPException(503, "受权报表元数据服务尚不可用") from None

    discover = getattr(report_compare, "discover_report_compare_metadata", None)
    if discover is None:
        raise HTTPException(503, "受权报表元数据服务尚不可用")
    return await discover(user, db)


async def _validate(params, user, db):
    try:
        from app.data_compare import report_compare
    except ImportError:
        raise HTTPException(503, "受权报表校验服务尚不可用") from None

    validate = getattr(report_compare, "validate_report_compare", None)
    if validate is None:
        raise HTTPException(503, "受权报表校验服务尚不可用")
    return await validate(params, user, db)


async def process_dialogue(data, user, db, model_call) -> dict:
    data = data if isinstance(data, dict) else data.model_dump()
    action = data.get("action", "message")
    if action not in {"message", "confirm", "cancel"}:
        raise HTTPException(422, "不支持的对话动作")
    if data.get("conversation_id") is None and action != "message":
        raise HTTPException(409, "请先建立对话草稿")
    conv = await _conversation(data.get("conversation_id"), user, db)
    session = ChatSession(conv.id, conv.channel, conv.active_capability_id, copy.deepcopy(conv.state or {}))
    capability_state = session.capability_state(CAPABILITY)
    slots = copy.deepcopy(capability_state.get(SLOT) or {})
    revision = slots.get("revision", 0)
    if data.get("conversation_id") is not None and (type(data.get("revision")) is not int or data["revision"] != revision):
        raise HTTPException(409, "草稿已更新，请重新加载最新修订")
    draft = copy.deepcopy(slots.get("params") or {"kind": "report_amount_v1"})
    token = None
    question = ""
    summary = slots.get("summary", "")
    status = "requires_input"
    fingerprint = None
    instruction_digest = slots.get("instruction_digest")
    if action == "cancel":
        draft = {"kind": "report_amount_v1"}
        summary = ""
        question = "已取消本次草稿。请重新说明对比需求。"
        session.clear_active()
    elif action == "confirm":
        if slots.get("status") != "requires_confirmation" or _missing(draft):
            raise HTTPException(409, "当前草稿尚不可确认")
        fingerprint = await _validate(draft, user, db)
        if fingerprint != slots.get("fingerprint"):
            raise HTTPException(409, "来源定义或授权已变化，请重新核对口径")
        status = "confirmed"
        revision += 1
        token = f"{conv.id}.{revision}.{secrets.token_urlsafe(32)}"
        slots = {"token_hash": _digest(token), "params_digest": _digest(draft), "expires_at": time.time() + 1800}
        session.clear_active()
    else:
        instruction = data.get("instruction")
        if not isinstance(instruction, str) or not instruction.strip() or len(instruction) > 10000:
            raise HTTPException(422, "请提供有效的对比需求")
        instruction_digest = _digest(instruction.strip())
        metadata = await _metadata(user, db)
        _check_sources(draft, metadata)
        prompt = (
            "你是报表金额对比配置提取器，只输出JSON对象 {patch:{}, question:''}。"
            "只提取本轮明确新增或修改的配置，不猜测来源、字段、映射、金额可加总性或容差。"
            "只用下列受权元数据。来源A必须是报表最终输出列instance_id，B为注册表；"
            "B表达式仅字段、数值、括号、加减乘除。缺参请提问，不输出SQL。"
            "patch允许kind=report_amount_v1,report_id,table_b,period_field_a,periods,"
            "metrics:[{id,label,column_a,expression_b,tolerance:十进制字符串}],"
            "dimension:{column_a,column_b,value_map_b:{B值:A值}}。"
            "metrics修改返回完整指标列表并保留未修改指标的稳定id；维度值映射必须用户明确，不自动推定同义。\n"
            + json.dumps({"metadata": metadata, "draft": draft, "instruction": instruction}, ensure_ascii=False)
        )
        parse_failed = False
        try:
            raw = parse_json_content(await model_call(prompt))
            patch = raw.get("patch", {})
            if not isinstance(patch, dict):
                raise ValueError("无效补丁")
            draft = _merge(draft, patch)
        except (ValueError, TypeError):
            parse_failed = True
            draft = copy.deepcopy(slots.get("params") or {"kind": "report_amount_v1"})
            raw = {}
            question = "未能识别有效修改，请明确来源、月份、金额指标或维度。"
        missing = _missing(draft)
        if parse_failed:
            pass
        elif isinstance(raw.get("question"), str) and raw["question"].strip():
            question = raw["question"].strip()[:1000]
        elif missing:
            question = question or "请补充或明确：" + "、".join(missing) + "。"
        else:
            try:
                fingerprint = await _validate(draft, user, db)
            except (ValueError, HTTPException) as exc:
                if isinstance(exc, HTTPException) and exc.status_code not in {400, 409, 422}:
                    raise
                question = "当前口径尚不可用，请核对来源、字段、期间、公式及显式维度映射。"
            else:
                if isinstance(fingerprint, dict) and isinstance(fingerprint.get("spec"), dict):
                    draft = fingerprint["spec"]
                status = "requires_confirmation"
                report = next(item for item in metadata["reports"] if item["id"] == draft["report_id"])
                table = next(item for item in metadata["tables"] if item["table"] == draft["table_b"])
                labels = {item["code"]: item.get("label") or item["code"] for item in report["columns"]}
                dimension = draft["dimension"]
                lines = [f"报表：{report.get('name') or draft['report_id']}；对照表：{table.get('label') or draft['table_b']}",
                         "月份：" + "、".join(draft["periods"]),
                         "金额口径：报表最终输出列求和；对照表逐行计算后求和。"]
                for metric in draft["metrics"]:
                    lines.append(f"• {metric['label']}：{labels.get(metric['column_a'], metric['column_a'])} ↔ {metric['expression_b']}；绝对容差 {metric['tolerance']}")
                lines.append(f"下钻：{labels.get(dimension['column_a'], dimension['column_a'])} ↔ {dimension['column_b']}")
                if dimension.get("value_map_b"):
                    lines.append("维度值映射（对照表→报表）：" + json.dumps(dimension["value_map_b"], ensure_ascii=False))
                summary = "\n".join(lines)
                question = "请核对上述完整口径并明确确认；保存不会自动执行。"
        session.active_capability_id = CAPABILITY
    if action != "confirm":
        revision += 1
        slots = {}
    slots.update(status=status, revision=revision, params=draft, fingerprint=fingerprint, instruction_digest=instruction_digest, summary=summary if status != "requires_input" else "", question=question)
    capability_state[SLOT] = slots
    session.set_capability_state(CAPABILITY, capability_state)
    await persist(db, conv, session)
    await db.flush()
    return {
        "status": status, "conversation_id": conv.id, "revision": revision,
        "question": question, "summary": slots["summary"],
        "params": draft if status in {"requires_confirmation", "confirmed"} else None,
        "confirmation_token": token,
    }


async def validate_confirmation(token, params, user, db, instruction=None) -> None:
    try:
        conversation_id, revision, nonce = token.split(".")
        conversation_id, revision = int(conversation_id), int(revision)
        if not nonce:
            raise ValueError
    except (ValueError, AttributeError):
        raise HTTPException(409, "缺少有效的口径确认") from None
    conv = await _conversation(conversation_id, user, db)
    slots = ((conv.state or {}).get(CAPABILITY) or {}).get(SLOT) or {}
    if (slots.get("status") != "confirmed" or slots.get("revision") != revision
            or slots.get("expires_at", 0) <= time.time()
            or not secrets.compare_digest(slots.get("token_hash", ""), _digest(token))
            or slots.get("params_digest") != _digest(params)):
        raise HTTPException(409, "口径确认已失效，请重新确认最新草稿")
    if instruction is not None and (not isinstance(instruction, str) or _digest(instruction.strip()) != slots.get("instruction_digest")):
        raise HTTPException(409, "需求已修改，请重新生成并确认口径")
    fingerprint = await _validate(params, user, db)
    if fingerprint != slots.get("fingerprint"):
        raise HTTPException(409, "来源定义或授权已变化，请重新确认")
