"""SchemaValidator — 校验 CompareSpec 参数合法性。

对比执行前必须通过此校验：表名/字段白名单、必填项、类型语义约束。
所有校验基于 MetadataLoader 提供的白名单，不接受 LLM/用户传入的原始字符串越过。
"""
from __future__ import annotations

from pydantic import ValidationError as PydanticValidationError

from app.data_compare.metadata import MetadataLoader
from app.data_compare.schemas import CompareSpec, CompareType, FieldCompareMode


class SchemaValidationError(ValueError):
    """CompareSpec 校验失败"""

    def __init__(self, errors: list[str]):
        self.errors = errors
        super().__init__("; ".join(errors))


async def validate_compare_spec(spec: CompareSpec, loader: MetadataLoader) -> None:
    """校验 CompareSpec 的完整合法性。不合法时抛出 SchemaValidationError。"""
    errors: list[str] = []

    # ── 1. Pydantic schema 结构校验 ──
    try:
        # Ensure spec is a CompareSpec instance
        if not isinstance(spec, CompareSpec):
            spec = CompareSpec.model_validate(spec if isinstance(spec, dict) else spec.model_dump())
    except PydanticValidationError as e:
        raise SchemaValidationError([f"CompareSpec 结构不合法: {e}"])

    # ── 2. 表名白名单校验 ──
    meta_a = await loader.get_table(spec.source_a.table)
    if meta_a is None:
        errors.append(f"source_a 表 '{spec.source_a.table}' 不在 registered_tables 白名单中")

    meta_b = await loader.get_table(spec.source_b.table)
    if meta_b is None:
        errors.append(f"source_b 表 '{spec.source_b.table}' 不在 registered_tables 白名单中")

    if meta_a is None or meta_b is None:
        raise SchemaValidationError(errors)

    # ── 3. 月度表 period 必填校验 ──
    if meta_a.is_period and not spec.source_a.period:
        errors.append(f"表 '{spec.source_a.table}' 是月度表，source_a.period 必填")
    if meta_b.is_period and not spec.source_b.period:
        errors.append(f"表 '{spec.source_b.table}' 是月度表，source_b.period 必填")

    # ── 4. join_keys 存在性校验 ──
    for jk in spec.join_keys:
        if not meta_a.has_column(jk):
            errors.append(f"关联键 '{jk}' 不存在于表 '{spec.source_a.table}' 中")
        if not meta_b.has_column(jk):
            errors.append(f"关联键 '{jk}' 不存在于表 '{spec.source_b.table}' 中")

    # ── 5. prefilter 字段校验 ──
    for pf in spec.source_a.prefilter:
        if not meta_a.has_column(pf.column):
            errors.append(f"source_a prefilter 字段 '{pf.column}' 不在白名单中")
    for pf in spec.source_b.prefilter:
        if not meta_b.has_column(pf.column):
            errors.append(f"source_b prefilter 字段 '{pf.column}' 不在白名单中")

    # ── 6. 类型专属校验 ──
    if spec.compare_type == CompareType.ROSTER:
        if spec.roster is None:
            errors.append("compare_type=roster 必须提供 roster 参数")
        else:
            for df in spec.roster.display_fields:
                if not meta_a.has_column(df) and not meta_b.has_column(df):
                    errors.append(f"roster display_field '{df}' 在两张表中都不存在")

    elif spec.compare_type == CompareType.FIELD:
        if spec.field is None:
            errors.append("compare_type=field 必须提供 field 参数")
        else:
            for pair in spec.field.pairs:
                if not meta_a.has_column(pair.field_a):
                    errors.append(f"field.pairs field_a '{pair.field_a}' 不存在于表 '{spec.source_a.table}'")
                if not meta_b.has_column(pair.field_b):
                    errors.append(f"field.pairs field_b '{pair.field_b}' 不存在于表 '{spec.source_b.table}'")
                if pair.mode == FieldCompareMode.NUMERIC:
                    # 检查是否数值类型
                    col_a = meta_a.columns.get(pair.field_a)
                    if col_a and col_a.data_type not in ("number", "float", "decimal", "integer", "money"):
                        errors.append(
                            f"field.pairs '{pair.field_a}' 类型为 '{col_a.data_type}'，"
                            f"不支持 numeric 模式对比"
                        )

    elif spec.compare_type == CompareType.AMOUNT:
        if spec.amount is None:
            errors.append("compare_type=amount 必须提供 amount 参数")
        else:
            if not meta_a.has_column(spec.amount.metric_a.field):
                errors.append(f"amount.metric_a.field '{spec.amount.metric_a.field}' 不存在")
            if not meta_b.has_column(spec.amount.metric_b.field):
                errors.append(f"amount.metric_b.field '{spec.amount.metric_b.field}' 不存在")
            for gb in spec.amount.group_by:
                if not meta_a.has_column(gb):
                    errors.append(f"amount.group_by '{gb}' 不存在于表 '{spec.source_a.table}' 中")
                if not meta_b.has_column(gb):
                    errors.append(f"amount.group_by '{gb}' 不存在于表 '{spec.source_b.table}' 中")

    if errors:
        raise SchemaValidationError(errors)
