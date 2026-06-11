"""Codegen 服务层:中文名 → 英文 code 的 AI 翻译核心,供 router 和同步路径共用。

放在 service 层(不依赖任何 router)以避免循环 import。
"""
from __future__ import annotations

from sqlalchemy.ext.asyncio import AsyncSession

from app.ai.provider import (
    AiProviderEndpointError,
    AiProviderJsonError,
    generate_json_openai_compatible,
)
from app.ai.service import active_ai_config
from app.codegen.rules import normalize_ai_code
from app.core.secret_box import decrypt


async def ai_translate_code(
    db: AsyncSession, *, label: str, scope: str, prefix: str = "", context: str | None = None
) -> tuple[str | None, str | None, dict | None]:
    """调 AI ���中文 label 翻译成英文 snake_case 标识符候选。

    返回 (ai_code, explanation, usage)。任何失败都返回 (None, 原因, usage|None),
    让上层降级到规则。
    """
    config = await active_ai_config(db)
    if not config or not config.api_key_encrypted or not config.model_fast_json:
        return None, "AI 未配置，已使用本地规则生成。", None
    api_key = decrypt(config.api_key_encrypted)
    if not api_key:
        return None, "AI API key 解密失败，已使用本地规则生成。", None

    kind = "数据表名" if scope == "table" else "字段名"
    messages = [
        {
            "role": "system",
            "content": (
                "You translate Chinese HR data-model names into English database identifiers. "
                "Output a single raw JSON object and NOTHING else. "
                "No markdown, no code fences, no tables, no commentary, no alternatives. "
                'Exact shape: {"code": "<identifier>", "explanation": "<一句中文说明>"}. '
                "code MUST be lower snake_case, ASCII only, match ^[a-z][a-z0-9_]*$, concise and semantic, "
                "max 60 chars, no SQL reserved words. "
                "Prefer standard HR terms (employee, salary, attendance, department, cost_center, allocation, "
                "severance, bonus, monthly, period, installment, payment). "
                "Never return generic placeholders like 'field', 'employee', 'table', 'data' when the source name carries more meaning. "
                'Example input "员工月度考勤表" → {"code": "employee_monthly_attendance", "explanation": "员工月度考勤"}. '
                'Example input "补偿金分期发放表" → {"code": "severance_installment_payment", "explanation": "补偿金分期发放"}.'
            ),
        },
        {
            "role": "user",
            "content": (
                f"类型: {kind}\n"
                f"中文名: {label}\n"
                f"用途上下文: {context or ''}\n"
                f"要求前缀(可为空): {prefix or ''}\n"
                '只输出 JSON,例如 {"code": "...", "explanation": "..."}'
            ),
        },
    ]
    try:
        raw, usage = await generate_json_openai_compatible(
            api_key=api_key,
            base_url=config.base_url,
            model=config.model_fast_json,
            messages=messages,
            timeout=int(config.timeout_seconds or 30),
            repair_instructions="Return JSON with keys code (lower_snake_case ascii) and explanation (Chinese).",
        )
    except (AiProviderJsonError, AiProviderEndpointError, RuntimeError, ValueError) as exc:
        return None, f"AI 生成失败（{type(exc).__name__}），已使用本地规则生成。", None

    ai_code = normalize_ai_code(str(raw.get("code") or ""), prefix=prefix)
    if not ai_code:
        return None, "AI 返回的编码非法，已使用本地规则生成。", usage
    explanation = str(raw.get("explanation") or "").strip() or None
    return ai_code, explanation, usage
