"""Mapping 校验器

校验:
- 资产、字段只能来自已注册元数据白名单
- 优先级、冲突策略、命中动作必须持久化并可回显
- 参考键重复、目标字段重复、主键覆盖、类型不兼容、循环映射阻止发布
- 未命中策略必须合法
"""

from __future__ import annotations

from typing import Any, Optional

from app.mapping.dto import (
    MappingDocumentV1,
    MappingRuleV1,
    MappingCompatibilityV1,
    ALL_RULE_TYPES,
    ALL_UNMATCHED_BEHAVIORS,
    ALL_ON_ERROR_BEHAVIORS,
    ALL_ON_MATCH_ACTIONS,
    RULE_TYPE_FIELD,
    RULE_TYPE_VALUE_MAP,
    RULE_TYPE_REFERENCE_LOOKUP,
    RULE_TYPE_IDENTITY_WITH_OVERRIDES,
    RULE_TYPE_TYPE_CONVERT,
    RULE_TYPE_FORMAT,
    RULE_TYPE_SPLIT_MERGE,
    UNMATCHED_SET_DEFAULT,
)
from app.mapping.policy import MappingCallerPolicyV1
from app.mapping.errors import (
    MappingException,
    MappingErrorCode,
    policy_error,
)


class MappingValidator:
    """公共校验器"""

    def validate(
        self,
        document: MappingDocumentV1,
        policy: MappingCallerPolicyV1,
    ) -> list[str]:
        """
        校验文档, 返回 warning 列表 (空列表 = 全部通过)。
        校验失败时抛出 MappingException。
        """
        warnings: list[str] = []

        # 1. 基础校验
        self._validate_base(document)

        # 2. Policy 校验
        self._validate_policy(document, policy)

        # 3. 规则校验
        seen_target_fields: dict[str, str] = {}  # field -> rule_id
        seen_rule_ids: set[str] = set()

        for rule in document.ruleSet.rules:
            # rule id 唯一
            if rule.id in seen_rule_ids:
                raise policy_error(
                    MappingErrorCode.MAPPING_TARGET_DUPLICATE,
                    f"规则 ID 重复: {rule.id}",
                )
            seen_rule_ids.add(rule.id)

            # 规则类型允许
            if rule.type not in policy.allowedRuleTypes:
                raise policy_error(
                    MappingErrorCode.MAPPING_RULE_TYPE_FORBIDDEN,
                    f"调用方 {policy.caller} 不允许规则类型 {rule.type}",
                )

            # 字段白名单校验
            self._validate_fields(rule, policy)

            # reference_lookup 的真实输出来自 outputMap，不能只信任 DTO 的
            # targetFields。先校验二者一致，再将实际写入字段纳入所有保护。
            actual_target_fields = self._actual_target_fields(rule)

            # 目标字段重复检测
            for tf in actual_target_fields:
                if tf in seen_target_fields:
                    raise policy_error(
                        MappingErrorCode.MAPPING_TARGET_DUPLICATE,
                        f"目标字段 '{tf}' 被多个规则写入 "
                        f"(规则 {seen_target_fields[tf]} 和 {rule.id})",
                        field=tf,
                    )
                seen_target_fields[tf] = rule.id

            # 目标主键保护
            for tf in actual_target_fields:
                if tf in policy.target.protectedKeyFieldIds:
                    raise policy_error(
                        MappingErrorCode.MAPPING_TARGET_FIELD_PROTECTED,
                        f"目标字段 '{tf}' 是受保护主键, 不允许被规则写入",
                        field=tf,
                    )

            # 各规则类型特有校验
            self._validate_rule_config(rule, policy, warnings)

        # 4. 循环检测
        self._detect_cycles(document, warnings)

        return warnings

    def _actual_target_fields(self, rule: MappingRuleV1) -> list[str]:
        if rule.type == RULE_TYPE_REFERENCE_LOOKUP:
            output_fields = list(rule.config.outputMap)
            if not output_fields:
                raise policy_error(
                    MappingErrorCode.MAPPING_VALUE_UNMAPPED,
                    "reference_lookup.outputMap 不能为空",
                )
            if set(output_fields) != set(rule.targetFields) or len(output_fields) != len(rule.targetFields):
                raise policy_error(
                    MappingErrorCode.MAPPING_FIELD_FORBIDDEN,
                    "reference_lookup.targetFields 必须与 outputMap 输出字段完全一致",
                )
            return output_fields
        return list(rule.targetFields)

    def _validate_base(self, document: MappingDocumentV1):
        if document.mappingSchemaVersion != 1:
            raise policy_error(
                MappingErrorCode.MAPPING_SCHEMA_CHANGED,
                f"mappingSchemaVersion must be 1, got {document.mappingSchemaVersion}",
            )

        rs = document.ruleSet
        if not rs.code:
            raise policy_error(
                MappingErrorCode.MAPPING_VALUE_UNMAPPED,
                "ruleSet.code 不能为空",
            )

    def _validate_policy(self, document: MappingDocumentV1, policy: MappingCallerPolicyV1):
        # Schema hash 校验：服务端一旦提供 hash，文档必须携带且必须匹配。
        if policy.source.schemaHash:
            if not document.ruleSet.sourceSchemaHash:
                raise policy_error(
                    MappingErrorCode.MAPPING_SCHEMA_CHANGED,
                    "缺少来源 Schema hash",
                )
            if policy.source.schemaHash != document.ruleSet.sourceSchemaHash:
                raise policy_error(
                    MappingErrorCode.MAPPING_SCHEMA_CHANGED,
                    "来源 Schema hash 不匹配",
                )

        if policy.target.schemaHash:
            if not document.ruleSet.targetSchemaHash:
                raise policy_error(
                    MappingErrorCode.MAPPING_SCHEMA_CHANGED,
                    "缺少目标 Schema hash",
                )
            if policy.target.schemaHash != document.ruleSet.targetSchemaHash:
                raise policy_error(
                    MappingErrorCode.MAPPING_SCHEMA_CHANGED,
                    "目标 Schema hash 不匹配",
                )

    def _validate_fields(self, rule: MappingRuleV1, policy: MappingCallerPolicyV1):
        # 来源/目标资产一旦绑定，空字段目录也必须 fail closed，不能把空列表
        # 解释为“不限制”。只有未绑定资产的 adapter 纯内存场景允许空目录。
        source_fields = set(policy.source.allowedFieldIds)
        if policy.source.assetId and not source_fields and rule.sourceFields:
            raise policy_error(
                MappingErrorCode.MAPPING_FIELD_FORBIDDEN,
                "来源资产没有可授权字段",
            )
        for sf in rule.sourceFields:
            if sf and source_fields and sf not in source_fields:
                raise policy_error(
                    MappingErrorCode.MAPPING_FIELD_FORBIDDEN,
                    f"来源字段 '{sf}' 不在白名单中",
                    field=sf,
                )

        target_fields = set(policy.target.allowedFieldIds)
        actual_target_fields = self._actual_target_fields(rule)
        if policy.target.assetId and not target_fields and actual_target_fields:
            raise policy_error(
                MappingErrorCode.MAPPING_FIELD_FORBIDDEN,
                "目标资产没有可授权字段",
            )
        for tf in actual_target_fields:
            if tf and target_fields and tf not in target_fields:
                raise policy_error(
                    MappingErrorCode.MAPPING_FIELD_FORBIDDEN,
                    f"目标字段 '{tf}' 不在白名单中",
                    field=tf,
                )

        # 只读字段
        for tf in actual_target_fields:
            if tf in policy.target.readonlyFieldIds:
                raise policy_error(
                    MappingErrorCode.MAPPING_FIELD_FORBIDDEN,
                    f"目标字段 '{tf}' 是只读字段",
                    field=tf,
                )

    def _validate_rule_config(self, rule, policy, warnings: list[str]):
        rtype = rule.type

        if rtype == RULE_TYPE_FIELD:
            cfg = rule.config
            if cfg.mode not in ("rename", "copy"):
                raise policy_error(
                    MappingErrorCode.MAPPING_VALUE_UNMAPPED,
                    f"field.mode 必须为 rename 或 copy, got {cfg.mode}",
                )

        elif rtype == RULE_TYPE_VALUE_MAP:
            cfg = rule.config
            if cfg.unmatched not in ALL_UNMATCHED_BEHAVIORS:
                raise policy_error(
                    MappingErrorCode.MAPPING_VALUE_UNMAPPED,
                    f"unmatched 必须为 {ALL_UNMATCHED_BEHAVIORS}, got {cfg.unmatched}",
                )
            if cfg.unmatched == UNMATCHED_SET_DEFAULT and not cfg.defaultValue:
                raise policy_error(
                    MappingErrorCode.MAPPING_VALUE_UNMAPPED,
                    "unmatched=set_default 时必须提供 defaultValue",
                )
            # 重复源值检测
            seen: set[str] = set()
            for k in cfg.mappings:
                if k in seen:
                    warnings.append(f"value_map 规则 {rule.id} 中源值 '{k}' 重复")
                seen.add(k)

        elif rtype == RULE_TYPE_REFERENCE_LOOKUP:
            cfg = rule.config
            # 参考数据集白名单必须 fail closed：配置了 lookup 却没有服务端目录
            # 时直接拒绝，不能将空列表解释为允许任意 dataset。
            allowed_datasets = set(policy.referenceLookup.allowedDatasetIds)
            if cfg.referenceDatasetId and cfg.referenceDatasetId not in allowed_datasets:
                raise policy_error(
                    MappingErrorCode.MAPPING_REFERENCE_DATASET_FORBIDDEN,
                    f"参考数据集 '{cfg.referenceDatasetId}' 不在白名单中",
                )
            # matchRules 数量
            if len(cfg.matchRules) > policy.referenceLookup.maxRules:
                raise policy_error(
                    MappingErrorCode.MAPPING_REFERENCE_DATASET_FORBIDDEN,
                    f"matchRules 数量 {len(cfg.matchRules)} 超过上限 {policy.referenceLookup.maxRules}",
                )
            # reference_lookup 内部引用也必须经过对应白名单校验。
            allowed_source_fields = set(policy.source.allowedFieldIds)
            allowed_reference_fields = set(policy.referenceLookup.allowedFieldIds)
            for mr in cfg.matchRules:
                if mr.sourceField and mr.sourceField not in allowed_source_fields:
                    raise policy_error(
                        MappingErrorCode.MAPPING_FIELD_FORBIDDEN,
                        f"Lookup 来源字段 '{mr.sourceField}' 不在白名单中",
                        field=mr.sourceField,
                    )
                if mr.referenceField and mr.referenceField not in allowed_reference_fields:
                    raise policy_error(
                        MappingErrorCode.MAPPING_FIELD_FORBIDDEN,
                        f"Lookup 参考字段 '{mr.referenceField}' 不在白名单中",
                        field=mr.referenceField,
                    )
                for condition_field in mr.conditions:
                    if condition_field and condition_field not in allowed_reference_fields:
                        raise policy_error(
                            MappingErrorCode.MAPPING_FIELD_FORBIDDEN,
                            f"Lookup 条件字段 '{condition_field}' 不在白名单中",
                            field=condition_field,
                        )
                if mr.onMatch not in ALL_ON_MATCH_ACTIONS:
                    raise policy_error(
                        MappingErrorCode.MAPPING_VALUE_UNMAPPED,
                        f"onMatch 必须为 {ALL_ON_MATCH_ACTIONS}, got {mr.onMatch}",
                    )
            for output_field, reference_field in cfg.outputMap.items():
                if output_field and output_field not in set(policy.target.allowedFieldIds):
                    raise policy_error(
                        MappingErrorCode.MAPPING_FIELD_FORBIDDEN,
                        f"Lookup 输出字段 '{output_field}' 不在目标白名单中",
                        field=output_field,
                    )
                if reference_field and reference_field not in allowed_reference_fields:
                    raise policy_error(
                        MappingErrorCode.MAPPING_FIELD_FORBIDDEN,
                        f"Lookup 输出参考字段 '{reference_field}' 不在白名单中",
                        field=reference_field,
                    )
            # 重复参考键检测 (同结果 warning, 异结果阻断)
            # 这里只做静态校验, 运行时在 executor 预加载时检查

        elif rtype == RULE_TYPE_IDENTITY_WITH_OVERRIDES:
            cfg = rule.config
            if cfg.defaultBehavior != "keep_source":
                raise policy_error(
                    MappingErrorCode.MAPPING_VALUE_UNMAPPED,
                    f"defaultBehavior 必须为 keep_source, got {cfg.defaultBehavior}",
                )
            if cfg.unmatched not in ALL_UNMATCHED_BEHAVIORS:
                raise policy_error(
                    MappingErrorCode.MAPPING_VALUE_UNMAPPED,
                    f"unmatched 必须为 {ALL_UNMATCHED_BEHAVIORS}, got {cfg.unmatched}",
                )

        elif rtype == RULE_TYPE_TYPE_CONVERT:
            cfg = rule.config
            if cfg.onError not in ALL_ON_ERROR_BEHAVIORS:
                raise policy_error(
                    MappingErrorCode.MAPPING_TYPE_CONVERSION_FAILED,
                    f"onError 必须为 {ALL_ON_ERROR_BEHAVIORS}, got {cfg.onError}",
                )

        elif rtype == RULE_TYPE_FORMAT:
            cfg = rule.config
            if cfg.onError not in ALL_ON_ERROR_BEHAVIORS:
                raise policy_error(
                    MappingErrorCode.MAPPING_FORMAT_INVALID,
                    f"onError 必须为 {ALL_ON_ERROR_BEHAVIORS}, got {cfg.onError}",
                )

        elif rtype == RULE_TYPE_SPLIT_MERGE:
            cfg = rule.config
            if cfg.action not in ("split", "merge"):
                raise policy_error(
                    MappingErrorCode.MAPPING_SPLIT_MERGE_INVALID,
                    f"action 必须为 split 或 merge, got {cfg.action}",
                )
            # split: target_fields 数量 >= 2
            if cfg.action == "split" and len(rule.targetFields) < 2:
                raise policy_error(
                    MappingErrorCode.MAPPING_SPLIT_MERGE_INVALID,
                    "split 需要 >= 2 个目标字段",
                )
            # merge: source_fields 数量 >= 2
            if cfg.action == "merge" and len(rule.sourceFields) < 2:
                raise policy_error(
                    MappingErrorCode.MAPPING_SPLIT_MERGE_INVALID,
                    "merge 需要 >= 2 个来源字段",
                )

    def _detect_cycles(self, document: MappingDocumentV1, warnings: list[str]):
        """检测字段映射循环: A->B, B->A"""
        edges: dict[str, str] = {}
        for rule in document.ruleSet.rules:
            if rule.type == RULE_TYPE_FIELD and rule.config.mode == "rename":
                if rule.sourceFields and rule.targetFields:
                    src = rule.sourceFields[0]
                    tgt = rule.targetFields[0]
                    if src != tgt:
                        edges[src] = tgt

        # 简单环检测
        for start in list(edges.keys()):
            visited: set[str] = set()
            current = start
            while current in edges:
                if current in visited:
                    raise policy_error(
                        MappingErrorCode.MAPPING_CYCLE_DETECTED,
                        f"检测到字段映射循环: {start}",
                    )
                visited.add(current)
                current = edges[current]
