from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

from app.ai.capabilities import CapabilityDefinition
from app.ai.deny_patterns import DENY_PATTERN_REGEX, output_deny_hits


class AiPolicyError(ValueError):
    pass


# 输出级 deny 收口：公式与 data.query 共用同一道输出闸。
# 禁止内容定义统一来自 app.ai.deny_patterns（单一真相源）。
def enforce_output_deny_patterns(capability: CapabilityDefinition, text: str | None) -> list[str]:
    """按 capability.policy_profile.deny_patterns 扫描模型输出，命中即拒。

    禁止模式来自 app.ai.deny_patterns.DENY_PATTERN_REGEX。仅在输出为结构化/受控文本的
    能力上调用（如 data.query 的 QuerySpec、公式草稿），避免对自由文本解释类能力误伤。
    """
    patterns = capability.policy_profile.get("deny_patterns", []) or []
    hits = output_deny_hits(text, patterns)
    if hits:
        raise AiPolicyError(f"模型输出命中禁止模式: {hits}")
    return hits


@dataclass(frozen=True)
class PolicyDecision:
    capability_id: str
    risk_level: str
    confirmation: str
    allowed_tools: list[str] = field(default_factory=list)
    side_effect_tags: list[str] = field(default_factory=list)
    audit_enabled: bool = True


def policy_profile_for_capability(capability: CapabilityDefinition) -> dict[str, Any]:
    return {
        "risk_level": capability.risk_level,
        "side_effect_tags": capability.side_effect_tags,
        "confirmation": capability.confirmation,
        "allowed_tools": capability.tools,
        "audit_enabled": capability.audit_enabled,
        "model_profile": capability.model_profile,
        "sensitive_context": capability.sensitive_context,
        "deny_patterns": capability.policy_profile.get("deny_patterns", []),
        "output_contract": capability.policy_profile.get("output_contract", "schema_validated"),
    }


def validate_capability_policy(
    capability: CapabilityDefinition,
    *,
    confirmed: bool = False,
    used_tools: list[str] | None = None,
) -> PolicyDecision:
    if not capability.is_enabled or not capability.ai_visible:
        raise AiPolicyError("Capability 未启用")
    if capability.confirmation == "required" and not confirmed:
        raise AiPolicyError("该 Capability 需要用户确认后才能执行")
    allowed = set(capability.tools)
    unexpected = [tool for tool in (used_tools or []) if tool not in allowed]
    if unexpected:
        raise AiPolicyError(f"Capability 调用了未在白名单中的 Tool: {unexpected}")
    return PolicyDecision(
        capability_id=capability.capability_id,
        risk_level=capability.risk_level,
        confirmation=capability.confirmation,
        allowed_tools=list(capability.tools),
        side_effect_tags=list(capability.side_effect_tags),
        audit_enabled=capability.audit_enabled,
    )
