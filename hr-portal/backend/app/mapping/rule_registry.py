"""Rule Plugin Registry

唯一注册表; 调用方以 context/policy/adapter 传入差异。
禁止调用方复制插件实现。
"""

from __future__ import annotations

from typing import Any, Protocol, runtime_checkable

from app.mapping.dto import (
    MappingRuleV1,
    MappingResultV1,
    MappingTraceEntry,
    ALL_RULE_TYPES,
    RULE_TYPE_FIELD,
    RULE_TYPE_VALUE_MAP,
    RULE_TYPE_REFERENCE_LOOKUP,
    RULE_TYPE_IDENTITY_WITH_OVERRIDES,
    RULE_TYPE_TYPE_CONVERT,
    RULE_TYPE_FORMAT,
    RULE_TYPE_SPLIT_MERGE,
)


@runtime_checkable
class RulePlugin(Protocol):
    """规则插件协议"""

    @property
    def rule_type(self) -> str: ...

    @property
    def label(self) -> str: ...

    def validate(self, rule: MappingRuleV1) -> list[str]:
        """校验规则配置, 返回 warnings"""
        ...

    def apply(
        self,
        rule: MappingRuleV1,
        row: dict[str, Any],
        row_idx: int,
        reference_snapshot: dict[str, dict[tuple, Any]] | None,
        trace: list[MappingTraceEntry],
        sensitive_fields: set[str],
    ) -> str:
        """
        应用规则到行, 返回 'matched' | 'unmatched' | 'error'。
        不得写库、访问网络、创建事务或读取凭证。
        """
        ...


class RulePluginRegistry:
    """唯一插件注册表"""

    _instance: RulePluginRegistry | None = None
    _plugins: dict[str, RulePlugin]

    def __new__(cls) -> RulePluginRegistry:
        if cls._instance is None:
            cls._instance = super().__new__(cls)
            cls._instance._plugins = {}
        return cls._instance

    def register(self, plugin: RulePlugin) -> None:
        if plugin.rule_type not in ALL_RULE_TYPES:
            raise ValueError(f"Unknown rule type: {plugin.rule_type}")
        existing = self._plugins.get(plugin.rule_type)
        if existing is not None and type(existing) is not type(plugin):
            raise ValueError(f"Rule type already registered: {plugin.rule_type}")
        self._plugins[plugin.rule_type] = plugin

    def get(self, rule_type: str) -> RulePlugin | None:
        return self._plugins.get(rule_type)

    def all_types(self) -> list[str]:
        return [rule_type for rule_type in ALL_RULE_TYPES if rule_type in self._plugins]

    def all_labels(self) -> dict[str, str]:
        return {
            rule_type: self._plugins[rule_type].label
            for rule_type in self.all_types()
        }


# 全局唯一实例
registry = RulePluginRegistry()


def get_registry() -> RulePluginRegistry:
    return registry
