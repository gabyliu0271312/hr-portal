# -*- coding: utf-8 -*-
"""复合指标组件 CRUD 服务 (MR0201-MR0213)

功能：
- list_components: 列出指标的所有组件，关联聚合定义信息
- create_component: 创建组件，校验 component_code 唯一性
- update_component: 更新组件
- delete_component: 删除组件
- batch_save_components: MR0213 批量保存，一次性创建聚合定义+组件
- decompose_formula: MR0207 公式拆解，检测比率公式并拆解为 numerator/denominator

校验逻辑 (MR0204-0206):
- component_code 唯一性校验
- 聚合已发布校验
- 维度对齐校验（比较两个聚合定义的 group_by 字段列表是否一致）
"""
from __future__ import annotations

import re

from sqlalchemy import func, select, delete as sa_delete
from sqlalchemy.ext.asyncio import AsyncSession

from app.warehouse.models import MetricComponent, DwsAggregateDefinition


class ComponentService:
    """复合指标组件 CRUD 服务"""

    def __init__(self, session: AsyncSession):
        self.session = session

    # ==================== 查询 ====================

    async def list_components(self, metric_id: int) -> list[dict]:
        """列出指标的所有组件，关联聚合定义信息。

        返回组件列表，每个组件包含关联的 DWS 聚合定义的摘要信息：
        - aggregate_name, aggregate_label, aggregate_status, aggregate_group_by
        """
        q = (
            select(
                MetricComponent,
                DwsAggregateDefinition.name,
                DwsAggregateDefinition.label,
                DwsAggregateDefinition.status,
                DwsAggregateDefinition.group_by,
            )
            .outerjoin(
                DwsAggregateDefinition,
                MetricComponent.aggregate_id == DwsAggregateDefinition.id,
            )
            .where(MetricComponent.metric_id == metric_id)
            .order_by(MetricComponent.display_order, MetricComponent.id)
        )
        rows = (await self.session.execute(q)).all()

        result: list[dict] = []
        for comp, agg_name, agg_label, agg_status, agg_group_by in rows:
            result.append({
                "id": comp.id,
                "metric_id": comp.metric_id,
                "component_code": comp.component_code,
                "component_name": comp.component_name,
                "aggregate_id": comp.aggregate_id,
                "role": comp.role,
                "expression": comp.expression,
                "display_order": comp.display_order,
                "is_auto_created": comp.is_auto_created,
                "aggregate_name": agg_name,
                "aggregate_label": agg_label,
                "aggregate_status": agg_status,
                "aggregate_group_by": agg_group_by or [],
                "created_at": comp.created_at,
                "updated_at": comp.updated_at,
            })
        return result

    # ==================== CRUD ====================

    async def create_component(self, metric_id: int, data: dict) -> dict:
        """创建组件。

        校验：
        - component_code 在同一 metric_id 下唯一（MR0204）
        - 如果指定了 aggregate_id，校验聚合定义已发布（MR0205）
        - 维度对齐校验：如果已有已发布聚合组件，新组件的 group_by 必须一致（MR0206）
        """
        component_code = data.get("component_code", "")
        aggregate_id = data.get("aggregate_id")

        # MR0204: component_code 唯一性校验
        existing = await self.session.execute(
            select(MetricComponent).where(
                MetricComponent.metric_id == metric_id,
                MetricComponent.component_code == component_code,
            )
        )
        if existing.scalar_one_or_none():
            raise ValueError(f"组件编码 '{component_code}' 在该指标下已存在")

        # MR0205: 聚合已发布校验
        if aggregate_id is not None:
            agg = await self.session.get(DwsAggregateDefinition, aggregate_id)
            if agg is None:
                raise ValueError(f"聚合定义不存在: {aggregate_id}")
            if agg.status != "published":
                raise ValueError(f"聚合定义 '{agg.name}' 未发布，当前状态: {agg.status}")

        # MR0206: 维度对齐校验
        if aggregate_id is not None:
            await self._validate_dimension_alignment(metric_id, aggregate_id)

        comp = MetricComponent(
            metric_id=metric_id,
            component_code=component_code,
            component_name=data.get("component_name", ""),
            aggregate_id=aggregate_id,
            role=data.get("role", "custom"),
            expression=data.get("expression"),
            display_order=data.get("display_order", 0),
            is_auto_created=data.get("is_auto_created", False),
        )
        self.session.add(comp)
        await self.session.flush()
        await self.session.refresh(comp)

        # 返回完整的组件信息（含聚合摘要）
        components = await self.list_components(metric_id)
        for c in components:
            if c["id"] == comp.id:
                return c
        # fallback
        return {
            "id": comp.id,
            "metric_id": comp.metric_id,
            "component_code": comp.component_code,
            "component_name": comp.component_name,
            "aggregate_id": comp.aggregate_id,
            "role": comp.role,
            "expression": comp.expression,
            "display_order": comp.display_order,
            "is_auto_created": comp.is_auto_created,
            "aggregate_name": None,
            "aggregate_label": None,
            "aggregate_status": None,
            "aggregate_group_by": [],
            "created_at": comp.created_at,
            "updated_at": comp.updated_at,
        }

    async def update_component(self, component_id: int, data: dict) -> dict | None:
        """更新组件。

        仅更新显式传入的字段。如果变更 aggregate_id，需要重新校验。
        """
        comp = await self.session.get(MetricComponent, component_id)
        if comp is None:
            return None

        # MR0205: 聚合已发布校验（仅在 aggregate_id 变更时）
        if "aggregate_id" in data and data["aggregate_id"] is not None:
            agg_id = data["aggregate_id"]
            agg = await self.session.get(DwsAggregateDefinition, agg_id)
            if agg is None:
                raise ValueError(f"聚合定义不存在: {agg_id}")
            if agg.status != "published":
                raise ValueError(f"聚合定义 '{agg.name}' 未发布，当前状态: {agg.status}")

        for key, value in data.items():
            if hasattr(comp, key):
                setattr(comp, key, value)

        await self.session.flush()
        await self.session.refresh(comp)

        components = await self.list_components(comp.metric_id)
        for c in components:
            if c["id"] == comp.id:
                return c
        return {
            "id": comp.id,
            "metric_id": comp.metric_id,
            "component_code": comp.component_code,
            "component_name": comp.component_name,
            "aggregate_id": comp.aggregate_id,
            "role": comp.role,
            "expression": comp.expression,
            "display_order": comp.display_order,
            "is_auto_created": comp.is_auto_created,
            "aggregate_name": None,
            "aggregate_label": None,
            "aggregate_status": None,
            "aggregate_group_by": [],
            "created_at": comp.created_at,
            "updated_at": comp.updated_at,
        }

    async def delete_component(self, component_id: int) -> bool:
        """删除组件。"""
        comp = await self.session.get(MetricComponent, component_id)
        if comp is None:
            return False
        await self.session.delete(comp)
        await self.session.flush()
        return True

    # ==================== 批量保存 (MR0213) ====================

    async def batch_save_components(self, metric_id: int, data: dict) -> list[dict]:
        """批量保存组件，一次性创建聚合定义+组件。

        流程：
        1. 删除指标下所有已有组件（全量替换）
        2. 按 new_aggregates 顺序创建聚合定义（status=published），保存 created_agg_ids
        3. 校验：component_code 唯一、聚合绑定（new_aggregate_index / aggregate_id / aggregate_ref）、
           引用已有聚合必须 published、分子/分母维度一致
        4. 创建 components 中的组件（按 new_aggregate_index 绑定新建聚合）
        5. 返回所有组件列表
        """
        # 1. 删除已有组件
        await self.session.execute(
            sa_delete(MetricComponent).where(MetricComponent.metric_id == metric_id)
        )

        new_aggregates_raw: list[dict] = data.get("new_aggregates", [])
        components_raw: list[dict] = data.get("components", [])

        # 2. 创建新聚合定义，按创建顺序保存 id（new_aggregate_index 的索引依据）
        created_agg_ids: list[int] = []
        agg_code_to_id: dict[str, int] = {}
        for agg_data in new_aggregates_raw:
            agg = DwsAggregateDefinition(
                name=agg_data.get("name", ""),
                label=agg_data.get("label"),
                metric_id=metric_id,
                source_dataset_id=agg_data.get("source_dataset_id"),
                group_by=agg_data.get("group_by", []),
                filter=agg_data.get("filter"),
                aggregation=agg_data.get("aggregation", "count"),
                measure_field=agg_data.get("measure_field"),
                time_grain=agg_data.get("time_grain"),
                business_definition=agg_data.get("business_definition"),
                status="published",
            )
            self.session.add(agg)
            await self.session.flush()
            await self.session.refresh(agg)
            created_agg_ids.append(agg.id)
            agg_code_to_id[agg_data.get("name", "")] = agg.id

        # 3. 校验 component_code 唯一性（批量内部）
        seen_codes: set[str] = set()
        for comp_data in components_raw:
            code = comp_data.get("component_code", "")
            if code in seen_codes:
                raise ValueError(f"组件编码 '{code}' 在批量数据中重复")
            seen_codes.add(code)

        # 4. 解析每个组件最终绑定的 aggregate_id
        #    优先级：new_aggregate_index > aggregate_id；兼容旧字段 aggregate_ref
        resolved: dict[str, int | None] = {}
        for comp_data in components_raw:
            code = comp_data.get("component_code", "")
            new_aggregate_index = comp_data.get("new_aggregate_index")
            aggregate_id = comp_data.get("aggregate_id")
            agg_ref = comp_data.get("aggregate_ref")

            # MR: aggregate_id 和 new_aggregate_index 不能同时为空（除非有 aggregate_ref）
            if aggregate_id is None and new_aggregate_index is None and not agg_ref:
                raise ValueError(
                    f"组件 '{code}' 必须绑定聚合定义（aggregate_id 与 new_aggregate_index 不可同时为空）"
                )

            if new_aggregate_index is not None:
                if new_aggregate_index < 0 or new_aggregate_index >= len(created_agg_ids):
                    raise ValueError(
                        f"组件 '{code}' 的 new_aggregate_index={new_aggregate_index} 越界 "
                        f"（有效范围 0-{len(created_agg_ids) - 1}）"
                    )
                aggregate_id = created_agg_ids[new_aggregate_index]
            elif agg_ref and aggregate_id is None and agg_ref in agg_code_to_id:
                aggregate_id = agg_code_to_id[agg_ref]

            # MR0205: 引用已有聚合（非本次新建）必须 published
            if aggregate_id is not None and aggregate_id not in created_agg_ids:
                agg = await self.session.get(DwsAggregateDefinition, aggregate_id)
                if agg is None:
                    raise ValueError(f"聚合定义不存在: {aggregate_id}")
                if agg.status != "published":
                    raise ValueError(f"聚合定义 '{agg.name}' 未发布，当前状态: {agg.status}")

            resolved[code] = aggregate_id

        # MR0206: 分子/分母维度一致性（批量保存也要执行）
        await self._validate_batch_dimension_alignment(metric_id, components_raw, resolved)

        # 5. 创建组件
        for comp_data in components_raw:
            code = comp_data.get("component_code", "")
            aggregate_id = resolved[code]
            is_auto = (
                bool(aggregate_id is not None and aggregate_id in created_agg_ids)
                or comp_data.get("is_auto_created", False)
            )
            comp = MetricComponent(
                metric_id=metric_id,
                component_code=code,
                component_name=comp_data.get("component_name", ""),
                aggregate_id=aggregate_id,
                role=comp_data.get("role", "custom"),
                expression=comp_data.get("expression"),
                display_order=comp_data.get("display_order", 0),
                is_auto_created=is_auto,
            )
            self.session.add(comp)

        await self.session.flush()

        # 6. 返回所有组件
        return await self.list_components(metric_id)

    async def _validate_batch_dimension_alignment(
        self, metric_id: int, components_raw: list[dict], resolved: dict[str, int | None]
    ) -> None:
        """MR0206 批量版：分子/分母聚合维度必须一致。

        仅在存在 ratio 组合（同时有 numerator 和 denominator 角色）时校验。
        """
        num_agg_id: int | None = None
        den_agg_id: int | None = None
        for comp_data in components_raw:
            role = comp_data.get("role")
            agg_id = resolved.get(comp_data.get("component_code", ""))
            if role == "numerator":
                num_agg_id = agg_id
            elif role == "denominator":
                den_agg_id = agg_id

        if num_agg_id is None or den_agg_id is None:
            return  # 非比率组合，跳过

        num_agg = await self.session.get(DwsAggregateDefinition, num_agg_id)
        den_agg = await self.session.get(DwsAggregateDefinition, den_agg_id)
        if num_agg is None or den_agg is None:
            return

        new_group_by = set(num_agg.group_by or [])
        existing_group_by = set(den_agg.group_by or [])
        if new_group_by != existing_group_by:
            raise ValueError(
                f"维度对齐失败：分子聚合 '{num_agg.name}' 的维度 "
                f"({sorted(new_group_by)}) 与分母聚合 '{den_agg.name}' 的维度 "
                f"({sorted(existing_group_by)}) 不一致"
            )

    # ==================== 公式拆解 (MR0207) ====================

    async def decompose_formula(
        self, formula_expr: str, dataset_id: int, metric_code: str | None = None
    ) -> dict:
        """检测比率公式并拆解为 numerator/denominator 组件。

        增强（整改计划 2 / MR0207）：
        - 支持 ROUND(A/B*100,2)、(A)/(B)、A/B*100 等典型比率公式
        - 先剥离外层 ROUND(...) 与尾部 *100 等展示逻辑，再定位主除法符
        - 分母绝不误包含 *100；被剥离的展示逻辑通过 rate_expression 回传
        - suggested_code 不再为空：提供 metric_code 时生成 {metric_code}_numerator/_denominator
        - 翻译校验改为 best-effort，不阻断比率识别（兼容 COUNT(*) / 0 等结构）
        """
        components: list[dict] = []
        combination_rule: str = ""
        is_ratio: bool = False
        dimensions: list[str] = []
        rate_expression: str | None = None

        # 规范化表达式
        expr = formula_expr.strip().lstrip("=").strip()
        if not expr:
            raise ValueError("公式表达式不能为空")

        # 1) 归一化：剥离 ROUND 包装 + 尾部 *100，得到核心比率表达式
        core, rate_expression, _original = _normalize_ratio_formula(expr)
        # 2) 在归一化表达式中定位主除法符
        slash_pos = _find_ratio_division(core)

        if slash_pos is not None:
            # 命中比率公式：拆解为分子和分母（分母绝不误含 *100）
            is_ratio = True
            numerator_expr = core[:slash_pos].strip()
            denominator_expr = core[slash_pos + 1:].strip()

            # 翻译校验（best-effort，不阻断比率识别，兼容 COUNT(*) / 0）
            await self._safe_translate(numerator_expr, dataset_id)
            await self._safe_translate(denominator_expr, dataset_id)

            components.append({
                "role": "numerator",
                "expression": numerator_expr,
                "suggested_code": self._build_suggested_code(metric_code, "numerator"),
                "suggested_name": _generate_suggested_name("分子"),
                "suggested_aggregation": _infer_aggregation(numerator_expr),
            })
            components.append({
                "role": "denominator",
                "expression": denominator_expr,
                "suggested_code": self._build_suggested_code(metric_code, "denominator"),
                "suggested_name": _generate_suggested_name("分母"),
                "suggested_aggregation": _infer_aggregation(denominator_expr),
            })
            combination_rule = "numerator / denominator"
        else:
            # 非比率公式：作为单个 custom 组件（翻译 best-effort）
            await self._safe_translate(expr, dataset_id)
            components.append({
                "role": "custom",
                "expression": expr,
                "suggested_code": self._build_suggested_code(metric_code, "custom"),
                "suggested_name": _generate_suggested_name(""),
                "suggested_aggregation": _infer_aggregation(expr),
            })
            combination_rule = "custom"

        # 从数据集推断维度
        try:
            dimensions = await _infer_dimensions_from_dataset(self.session, dataset_id)
        except Exception:
            pass  # 维度推断失败不影响主要结果

        return {
            "components": components,
            "combination_rule": combination_rule,
            "dimensions": dimensions,
            "is_ratio": is_ratio,
            "rate_expression": rate_expression,
        }

    async def _safe_translate(self, expr: str, dataset_id: int) -> dict:
        """best-effort 公式翻译校验。

        失败（如 COUNT(*) / 0 的分母为 0）仅返回 invalid 字典，
        绝不抛出，避免阻断比率公式的结构识别。
        """
        from app.ai_formula.formula_to_sql import translate_formula_to_sql

        if not expr:
            return {"valid": False, "errors": ["表达式为空"]}
        try:
            return await translate_formula_to_sql(self.session, expr, dataset_id)
        except Exception:
            return {"valid": False, "errors": ["翻译失败（已忽略，不影响拆解）"]}

    @staticmethod
    def _build_suggested_code(metric_code: str | None, role: str) -> str:
        """生成组件建议编码。提供 metric_code 时为 {metric_code}_{role}，否则回退为 role。"""
        if metric_code:
            return f"{metric_code}_{role}"
        return role

    # ==================== 校验辅助 ====================

    async def _validate_dimension_alignment(self, metric_id: int, new_agg_id: int) -> None:
        """维度对齐校验（MR0206）：

        检查新组件引用的聚合定义与已有组件的 group_by 字段列表是否一致。
        仅校验已绑定 published 聚合的已有组件。
        """
        # 获取新聚合定义的 group_by
        new_agg = await self.session.get(DwsAggregateDefinition, new_agg_id)
        if new_agg is None:
            return
        new_group_by = set(new_agg.group_by or [])

        # 查询指标下已有的已发布聚合组件
        rows = await self.session.execute(
            select(MetricComponent).where(
                MetricComponent.metric_id == metric_id,
                MetricComponent.aggregate_id.isnot(None),
            )
        )
        existing_components = rows.scalars().all()

        for comp in existing_components:
            if comp.aggregate_id is None:
                continue
            existing_agg = await self.session.get(DwsAggregateDefinition, comp.aggregate_id)
            if existing_agg is None or existing_agg.status != "published":
                continue

            existing_group_by = set(existing_agg.group_by or [])
            if new_group_by != existing_group_by:
                raise ValueError(
                    f"维度对齐失败：新聚合 '{new_agg.name}' 的维度 "
                    f"({sorted(new_group_by)}) 与已有聚合 '{existing_agg.name}' 的维度 "
                    f"({sorted(existing_group_by)}) 不一致"
                )


# ==================== 工厂函数 ====================

def get_component_service(db: AsyncSession) -> ComponentService:
    return ComponentService(db)


# ==================== 辅助函数 ====================

def _strip_outer_round(expr: str) -> tuple[str | None, str | None]:
    """若 expr 整体为 ROUND(x[, n]) 形式，返回 (内部首个参数, 精度字符串)。

    使用括号深度扫描，正确处理嵌套括号与引号内的逗号，
    找到最外层 ROUND( 的匹配右括号或第一个顶层逗号。
    不是 ROUND 包装时返回 (None, None)。
    """
    s = expr.strip()
    if not re.match(r"^ROUND\(", s, re.IGNORECASE):
        return (None, None)
    depth = 0
    inside_start = len("ROUND(")  # 6
    i = inside_start
    while i < len(s):
        c = s[i]
        if c == "(":
            depth += 1
        elif c == ")":
            if depth == 0:
                # 匹配到右括号（应在末尾），内部为首个参数，无精度
                return (s[inside_start:i].strip(), None)
            depth -= 1
        elif c == "," and depth == 0:
            # 第一个顶层逗号：之前是内部首个参数，之后是精度
            inner = s[inside_start:i].strip()
            precision = s[i + 1:].strip().rstrip(")").strip()
            return (inner, precision)
        i += 1
    return (None, None)


def _strip_percent_multiplier(expr: str) -> tuple[str, str | None]:
    """剥离尾部的 *100 / * 100 百分比乘数（展示逻辑，不应进入分母）。

    返回 (剩余核心表达式, 被剥离的展示逻辑描述)。无 *100 时返回 (原串, None)。
    """
    s = expr.strip()
    m = re.search(r"\*\s*100\s*$", s)
    if m:
        return (s[: m.start()].strip(), "*100")
    return (s, None)


def _normalize_ratio_formula(expr: str) -> tuple[str, str | None, str]:
    """去除外层 ROUND(...) 包装和尾部 *100 等展示逻辑，返回核心比率表达式。

    返回三元组：
      core_expr     归一化后的比率表达式（如 COUNTIF(a,b)/COUNT(*)）
      rate_expression 被剥离的展示逻辑（如 "*100" 或 "ROUND(2) *100"），无可剥离时为 None
      original      原始（去掉前导 = 后）表达式，用于展示
    """
    original = expr.strip().lstrip("=").strip()
    core = original
    rate_parts: list[str] = []

    inner, precision = _strip_outer_round(core)
    if inner is not None:
        core = inner
        rate_parts.append(f"ROUND({precision})" if precision else "ROUND")

    core, multiplier = _strip_percent_multiplier(core)
    if multiplier:
        rate_parts.append(multiplier)

    rate_expression = " ".join(rate_parts) or None
    return (core, rate_expression, original)


def _find_ratio_division(expr: str) -> int | None:
    """在（已归一化的）表达式中查找主除法符 / 的位置。

    跳过引号内的字符与括号内的内容（仅认 depth==0 的 /），
    返回主除法符的索引；没有则返回 None。
    """
    depth = 0
    in_quote = False
    quote_char = ""
    for i, ch in enumerate(expr):
        if in_quote:
            if ch == quote_char:
                in_quote = False
            continue
        if ch in ("'", '"'):
            in_quote = True
            quote_char = ch
            continue
        if ch == "(":
            depth += 1
        elif ch == ")":
            depth -= 1
        elif ch == "/" and depth == 0:
            return i
    return None


def _infer_aggregation(expr: str) -> str:
    """从表达式中推断聚合方式。"""
    upper = expr.upper().strip()
    for agg_fn in ("SUM", "COUNT", "AVG", "MAX", "MIN"):
        if upper.startswith(f"{agg_fn}("):
            return agg_fn.lower()
    return "count"


def _generate_suggested_name(role: str) -> str:
    """根据角色生成建议名称。"""
    role_labels = {
        "numerator": "分子",
        "denominator": "分母",
        "base": "基线值",
        "compare": "对差值",
        "custom": "",
    }
    label = role_labels.get(role, role)
    if label:
        return f"·{label}"
    return ""


async def _infer_dimensions_from_dataset(db: AsyncSession, dataset_id: int) -> list[str]:
    """从数据集的输出字段中推断维度字段列表。

    维度字段的判断依据：字段名包含 _id, _key, _code, _type, _group 等后缀，
    但不包含时间相关后缀（_date, _time, _at）。
    """
    from app.datasets.models import DataSet
    from sqlalchemy import text as sa_text

    ds = await db.get(DataSet, dataset_id)
    if ds is None:
        return []

    dimensions: list[str] = []
    DIMENSION_SUFFIXES = ("_id", "_key", "_code", "_type", "_group", "_level", "_category", "_status")
    TIME_SUFFIXES = ("_date", "_time", "_at", "_period")

    try:
        result = await db.execute(
            sa_text(
                "SELECT output_code FROM dataset_output_fields "
                "WHERE dataset_id = :did AND is_visible = true "
                "ORDER BY display_order"
            ),
            {"did": dataset_id},
        )
        for row in result.fetchall():
            code = row[0] if isinstance(row, tuple) else row.output_code
            if not code:
                continue
            # 检查是否为维度字段
            is_time = any(code.endswith(s) for s in TIME_SUFFIXES)
            is_dim = any(code.endswith(s) for s in DIMENSION_SUFFIXES)
            if is_dim and not is_time:
                dimensions.append(code)
    except Exception:
        pass

    return dimensions
