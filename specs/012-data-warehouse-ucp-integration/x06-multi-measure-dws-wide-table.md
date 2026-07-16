# X06 多度量 DWS 宽表 · 一期设计（同源多指标一张 View）

> 归属：`specs/012-data-warehouse-ucp-integration/`
> 关联：`x05-time-drilldown-two-phase-design.md`（时间列派生，本设计复用其基座）、`metric-result-olap-roadmap.md` §7（Phase 4 OLAP，不在本范围）
> 状态：设计评审稿 v1.1（简化交互：无模式切换，多选指标即多度量）
> 最后更新：2026-07-16

---

## 1. 背景与目标

### 1.1 用户场景

HR 部门需要一张"部门月度人力汇总宽表"，包含在职人数、离职人数、人均成本等多个指标，按部门 + 月份维度展开，输出给 FineBI 消费。

### 1.2 当前痛点

当前架构中，1 个 DWS 聚合定义 = 1 个指标 = 1 张 View。5 个 HR 指标意味着 5 张 View、FineBI 要配 5 个数据源，维护成本高。

### 1.3 目标

在现有 DWS 聚合定义上增加"多度量"能力：一张 DWS View 包含 N 个度量列，共享同一组维度和时间粒度，FineBI 只需 1 个数据源。

### 1.4 设计原则

- **向后兼容**：`measures` 为空时走原有单指标路径，不影响已有聚合定义。
- **同源约束**：所有度量必须来自同一张 DWD 明细表（同一 `source_dataset_id`）。跨源需求走二期 ADS 组装。
- **复用基座**：X05 时间列派生（`time_field` → `year/quarter/month`）在多度量场景下完全复用，零返工。
- **存储零改**：`metric_result_rows.measure_values` 已是 JSON dict，多度量存储结构 `{"headcount": 120, "turnover": 8}` 与现有 `{"aggregated_value": 120}` 同构。

---

## 2. 范围与边界

| 项 | 是否本期范围 | 说明 |
|---|---|---|
| `DwsAggregateDefinition` 新增 `measures` JSON 字段 | ✅ | Alembic 迁移 0101 |
| `generate_dws_view` 支持多度量 SELECT | ✅ | 核心改动 |
| 新增 `POST /dws-aggregates/{id}/compute` 端点 | ✅ | 多度量计算入口 |
| 前端多度量配置表单 | ✅ | WarehouseDwsAggregate.vue |
| FineBI 推送适配 | ✅ | 零改动，推送逻辑自动适配多列 |
| X05 时间列派生复用 | ✅ | 多度量 + 时间列同时工作 |
| 跨源 DWD 表的度量 | ❌ | 走二期 x07 ADS 宽表组装 |
| OLAP/Cube/跨指标透视 | ❌ | Phase 4，不在本范围 |
| `metric_components` 复合指标 | ❌ | 不冲突，可共存（一个度量本身可有 numerator/denominator/rate） |

---

## 3. 代码现状核实（事实基线）

| 事实 | 位置 | 含义 |
|---|---|---|
| `DwsAggregateDefinition.metric_id` 是单值 FK | `backend/app/warehouse/models.py:311-314` | 一个聚合定义只绑一个指标 |
| 度量表达式从 `WarehouseMetric.formula_sql` 获取 | `modeling.py:827-838` | 已含聚合函数（SUM/COUNT/AVG），不需要再包 `agg_func` |
| VIEW DDL 只拼了一个度量 | `modeling.py:1044-1051` | `select_clause` 中 `{measure_expr} AS {Q(measure_alias)}` 是单度量 |
| TableColumn 只注册了一个度量列 | `modeling.py:1098` | `column_code=measure_alias`（"aggregated_value"） |
| `output_fields` 返回值只含一个度量 | `modeling.py:1123` | `[维度列] + [measure_alias]` |
| `compute_metric` 按 `metric_id` 查找聚合定义 | `modeling.py:90-96` | `select(DwsAggregateDefinition).where(metric_id == metric_id)` |
| `MetricResultRow.measure_values` 是 JSON dict | `models.py:242` | 已存储 `{"aggregated_value": ...}` 或 `{"numerator":..., "denominator":..., "rate":...}` |
| `MetricResultRow.metric_id` 是 NOT NULL FK | `models.py:235-238` | 多度量结果需绑定一个 metric_id |
| DWS API 路由 | `router.py:3148-3318` | CRUD + publish + generate-view + validate |
| DWS Pydantic schemas | `schemas.py:1000-1042` | CreateIn / UpdateIn / Out 三套 |
| 前端 DWS 聚合表单 | `WarehouseDwsAggregate.vue:264-299` | `el-dialog` 含 label/name/metric_id(单选)/source_dataset_id/group_by(多选)/business_definition |
| FineBI 推送 | `push_service.py:707` | `push_db_expose(source_table, ...)` → `CREATE TABLE ... AS SELECT * FROM view` |
| 最新 Alembic 迁移 | `alembic/versions/0100_add_dws_timefields.py` | 下一个空闲编号 0101 |

---

## 4. 技术设计

### 4.1 数据模型变更

#### 4.1.1 新增 `measures` 字段

在 `DwsAggregateDefinition`（`models.py:329` 之前）新增：

```python
measures = Column(JSON, nullable=True, default=list,
                  comment="多度量指标 ID 列表；为空时走单指标路径(metric_id)。"
                          "每项: {metric_id}，alias/label 由后端从指标元数据自动派生")
```

**measures 结构定义**（后端保存时自动填充，前端只传 `metric_ids` 数组）：

```json
[
  {"metric_id": 1},
  {"metric_id": 2},
  {"metric_id": 3}
]
```

- `metric_id`（int，必填）：引用 `warehouse_metrics.id`，系统从该指标的 `formula_sql` 获取度量表达式。
- **alias（后端自动派生）**：取 `WarehouseMetric.metric_code`（若有）或 `metric_name` 的 slugified 形式（小写 + 空格/特殊字符替换为 `_`），作为 View 列名。必须合法 PostgreSQL 标识符（`^[a-z][a-z0-9_]{0,62}$`），列表内唯一，且不得与维度列名 / 保留列名冲突。若冲突则自动追加 `_2`/`_3` 后缀。
- **label（后端自动派生）**：取 `WarehouseMetric.metric_name`，作为 TableColumn 的 `column_label`。用户无需手动配置。

> **设计决策**：用户在前端只需多选指标（`el-select multiple`），选 1 个就是单指标、选 N 个就是多度量。alias/label 完全由后端在保存时从指标元数据自动派生，用户不感知、不可编辑。

#### 4.1.2 Alembic 迁移（0101）

文件：`alembic/versions/0101_add_dws_measures.py`

```python
def upgrade():
    op.add_column("dws_aggregate_definitions",
        sa.Column("measures", sa.JSON(), nullable=True, server_default="[]",
                  comment="多度量定义列表；为空时走单指标路径"))

def downgrade():
    op.drop_column("dws_aggregate_definitions", "measures")
```

#### 4.1.3 `metric_id` 字段处置

- `metric_id` **保留不动**，向后兼容。
- 前端传入 `metric_ids: [1, 2, 3]`（数组），后端保存时：
  - 数组长度 = 1：`measures` 设为 `null`/`[]`，`metric_id` 设为该唯一值（走单指标路径）。
  - 数组长度 ≥ 2：`measures` 设为 `[{metric_id: 1}, {metric_id: 2}, ...]`，`metric_id` 自动设为第一个（用于 `MetricResult.metric_id` 外键绑定）。
- **无模式切换**：单指标 vs 多度量完全由 `metric_ids` 数组长度决定，用户不感知"模式"概念。

### 4.2 `generate_dws_view` 改造

#### 4.2.1 度量表达式获取（modeling.py:827-838）

**当前**：

```python
measure_expr = None
measure_label = "aggregated_value"
if agg.metric_id:
    m = await self.session.get(WarehouseMetric, agg.metric_id)
    if m and m.formula_sql:
        measure_expr = m.formula_sql
        measure_label = m.metric_name or measure_alias
if not measure_expr:
    raise ValueError("指标未配置公式...")
```

**改为**：

```python
from app.datasets.models import WarehouseMetric
import re

def _slugify(name: str) -> str:
    """指标名 → 合法 PostgreSQL 列名：小写 + 非字母数字替换为 _"""
    s = re.sub(r'[^a-zA-Z0-9]', '_', name).lower().strip('_')
    s = re.sub(r'_+', '_', s)
    if s and s[0].isdigit():
        s = 'm_' + s
    return s[:63] or 'measure'

measures_config = agg.measures or []
multi_measures: list[tuple[str, str, str]] = []  # (alias, label, formula_sql)
measure_expr = None
measure_label = "aggregated_value"

if measures_config:
    # ===== 多度量路径 =====
    used_aliases: set[str] = set()
    for ms in measures_config:
        m = await self.session.get(WarehouseMetric, ms["metric_id"])
        if not m:
            raise ValueError(f"指标 ID={ms['metric_id']} 不存在")
        if not m.formula_sql:
            raise ValueError(f"指标「{m.metric_name}」未配置公式或公式尚未翻译为 SQL")
        # alias 从指标元数据自动派生
        alias = _slugify(getattr(m, 'metric_code', None) or m.metric_name)
        if alias in used_aliases:
            alias = f"{alias}_{len(used_aliases)}"  # 去重后缀
        used_aliases.add(alias)
        label = m.metric_name
        multi_measures.append((alias, label, m.formula_sql))
    # 校验 alias 不与维度列/保留列冲突
    reserved = {"id", "synced_at", "snapshot_month", "year", "quarter", "month"}
    conflict = set(used_aliases) & (set(dim_col_name.values()) | reserved)
    if conflict:
        raise ValueError(f"度量 alias 与维度列或保留列冲突: {conflict}")
else:
    # ===== 单指标路径（向后兼容） =====
    if agg.metric_id:
        m = await self.session.get(WarehouseMetric, agg.metric_id)
        if m and m.formula_sql:
            measure_expr = m.formula_sql
            measure_label = m.metric_name or measure_alias
    if not measure_expr:
        raise ValueError("指标未配置公式或公式尚未翻译为 SQL，请先在指标管理中编辑公式")
```

#### 4.2.2 VIEW DDL SELECT 子句（modeling.py:1044-1051）

**当前**：

```python
measure_alias = "aggregated_value"
select_clause = (f"ROW_NUMBER() OVER () AS {Q('id')}, "
                 f"{select_group_cols + ', ' if select_group_cols else ''}"
                 f"{measure_expr} AS {Q(measure_alias)}, "
                 f"NULL::timestamptz AS {Q('synced_at')}")
```

**改为**：

```python
if multi_measures:
    measure_select_str = ", ".join(f"{expr} AS {Q(alias)}" for alias, _, expr in multi_measures)
else:
    measure_select_str = f"{measure_expr} AS {Q(measure_alias)}"

select_clause = (f"ROW_NUMBER() OVER () AS {Q('id')}, "
                 f"{select_group_cols + ', ' if select_group_cols else ''}"
                 f"{measure_select_str}, "
                 f"NULL::timestamptz AS {Q('synced_at')}")
```

> GROUP BY 不变——所有度量共享同一组维度，一次 GROUP BY 全部算出。

#### 4.2.3 TableColumn 注册（modeling.py:1088-1098）

**当前**：

```python
self.session.add(TableColumn(table_name=view_name, column_code=measure_alias,
                             column_label=measure_label, data_type="numeric",
                             display_order=col_order, is_visible=True))
col_order += 1
```

**改为**：

```python
if multi_measures:
    for alias, label, _ in multi_measures:
        self.session.add(TableColumn(table_name=view_name, column_code=alias,
                                     column_label=label, data_type="numeric",
                                     display_order=col_order, is_visible=True))
        col_order += 1
else:
    self.session.add(TableColumn(table_name=view_name, column_code=measure_alias,
                                 column_label=measure_label, data_type="numeric",
                                 display_order=col_order, is_visible=True))
    col_order += 1
```

#### 4.2.4 `output_fields` 返回值（modeling.py:1123）

**当前**：

```python
output_fields = [dim_col_name.get(code, code) for code in expanded_group_by] + [measure_alias]
```

**改为**：

```python
if multi_measures:
    output_fields = [dim_col_name.get(code, code) for code in expanded_group_by] + [a for a, _, _ in multi_measures]
else:
    output_fields = [dim_col_name.get(code, code) for code in expanded_group_by] + [measure_alias]
```

#### 4.2.5 VIEW 产出形态对比

```
选 1 个指标（向后兼容）：          选 N 个指标（多度量宽表）：
id | dept | month | aggregated_value    id | dept | month | 在职人数 | 离职人数 | 人均成本
1  | 研发 | 2026-06 | 120               1  | 研发 | 2026-06 | 120       | 8        | 15200
2  | 产品 | 2026-06 | 25                2  | 产品 | 2026-06 | 25        | 1        | 18300
```

> 多度量模式下列名（alias）由后端从指标名自动派生（slugified），显示名（label）= 指标原名。

### 4.3 多度量计算入口

#### 4.3.1 新增 `compute_wide_table` 方法

在 `DwsAggregateService`（`modeling.py`）中新增：

```python
async def compute_wide_table(self, agg_id: int, period: str, user_id=None):
    """多度量 DWS 宽表计算：生成 View → 查询 → 写入 metric_result_rows"""
    from datetime import datetime as dt
    from app.warehouse.models import DwsAggregateDefinition, MetricResult, MetricResultRow, MetricRun

    agg = await self.session.get(DwsAggregateDefinition, agg_id)
    if agg is None:
        return {"error": "not_found", "detail": f"聚合定义不存在: {agg_id}"}
    if not agg.measures:
        return {"error": "bad_request", "detail": "该聚合定义未配置多度量(measures)，请使用单指标计算接口"}

    measures_config = agg.measures
    primary_metric_id = measures_config[0]["metric_id"]

    # 1. 生成/刷新 View（内部自动派生 alias/label）
    await self.generate_dws_view(agg_id)

    # 2. 查询 View
    from sqlalchemy import text as sa_text
    view_name = agg.name
    rows = (await self.session.execute(sa_text(f"SELECT * FROM {self._quote_ident(view_name)}"))).fetchall()

    # 3. 按周期过滤
    jsonable_rows = [self._jsonable(dict(row._mapping)) for row in rows]
    jsonable_rows = [r for r in jsonable_rows if self._row_matches_period(r, period)]

    # 4. 构建 measure_values — alias 与 generate_dws_view 中相同的 _slugify 逻辑派生
    measure_aliases = []
    used = set()
    for ms in measures_config:
        m = await self.session.get(WarehouseMetric, ms["metric_id"])
        alias = _slugify(getattr(m, 'metric_code', None) or m.metric_name)
        if alias in used:
            alias = f"{alias}_{len(used)}"
        used.add(alias)
        measure_aliases.append(alias)
    dimensions = agg.group_by or []
    dim_view_cols = await self._resolve_dim_view_columns(agg.source_dataset_id, dimensions)

    detail_rows = []
    for idx, row in enumerate(jsonable_rows):
        detail_rows.append({
            "dimension_values": {
                dim_view_cols.get(d, d): row.get(dim_view_cols.get(d, d))
                for d in dimensions if dim_view_cols.get(d, d) in row
            },
            "measure_values": {alias: row.get(alias) for alias in measure_aliases},
            "value": row.get(measure_aliases[0]),  # 主度量值
            "row_index": idx,
        })

    summary_value = detail_rows[0]["value"] if len(detail_rows) == 1 else \
        sum((r["value"] or 0) for r in detail_rows)

    result_value = {
        "aggregate_id": agg_id,
        "row_count": len(detail_rows),
        "dimensions": dimensions,
        "measures": measure_aliases,
        "summary_value": summary_value,
        "mode": "multi_measure",
    }

    # 5. 写入结果（使用第一个度量的 metric_id 绑定 MetricResult）
    run = MetricRun(metric_id=primary_metric_id, status="running",
                    period=period, started_at=dt.utcnow())
    self.session.add(run); await self.session.flush()

    result = MetricResult(metric_id=primary_metric_id, period=period,
                          value=result_value, computed_at=dt.utcnow())
    self.session.add(result); await self.session.flush()

    for row_info in detail_rows:
        self.session.add(MetricResultRow(
            result_id=result.id, metric_id=primary_metric_id, period=period,
            row_index=row_info["row_index"],
            dimension_values=row_info["dimension_values"],
            measure_values=row_info["measure_values"],
            value=row_info["value"],
            computed_at=dt.utcnow(),
        ))

    run.status = "success"; run.finished_at = dt.utcnow()
    await self.session.commit()

    return {"run_id": run.id, "result_id": result.id, "metric_id": primary_metric_id,
            "status": "success", "period": period, "value": result_value}
```

#### 4.3.2 新增 API 端点

在 `router.py` 中新增（紧邻现有 `generate-view` 端点之后）：

```python
@router.post("/dws-aggregates/{agg_id}/compute")
async def compute_dws_wide_table(agg_id: int, body: MetricComputeIn, db: AsyncSession = Depends(get_db)):
    """多度量 DWS 宽表计算"""
    service = DwsAggregateService(db)
    result = await service.compute_wide_table(agg_id, body.period)
    if "error" in result:
        raise HTTPException(status_code=400 if result["error"] == "bad_request" else 404,
                            detail=result["detail"])
    return result
```

> 复用已有 `MetricComputeIn` schema（`{period: str}`）。

### 4.4 Schema 变更

在 `schemas.py` 中新增和修改：

```python
class DwsMeasureDef(BaseModel):
    """多度量定义项（前端只传 metric_id，alias/label 后端自动派生）"""
    model_config = {"extra": "forbid"}
    metric_id: int
    # alias / label 为后端自动派生，Out schema 中返回给前端展示
    alias: Optional[str] = Field(None, description="后端自动派生的 View 列名")
    label: Optional[str] = Field(None, description="后端自动派生的显示名")
```

在 `DwsAggregateDefinitionCreateIn`（`schemas.py:1000`）、`UpdateIn`（`:1014`）中添加：

```python
# 前端传入 metric_ids 数组，后端转换为 measures JSON 存储
metric_ids: Optional[list[int]] = Field(None, description="关联指标 ID 列表，选 1 个=单指标，选 N 个=多度量")
```

在 `Out`（`:1028`）中添加：

```python
measures: Optional[list[DwsMeasureDef]] = None  # 返回给前端展示（含自动派生的 alias/label）
```

> **设计说明**：前端 Create/Update 传 `metric_ids: [1, 2, 3]`，后端在保存时查询各指标的 `metric_code`/`metric_name`，自动派生 alias/label 并存入 `measures` JSON。`Out` schema 返回 `measures`（含 alias/label）供前端展示。`metric_id` 字段保留兼容，值为 `metric_ids[0]`。

### 4.5 前端变更

#### 4.5.1 表单数据结构（WarehouseDwsAggregate.vue:121-126）

```typescript
const form = ref({
  label: '', name: '',
  metric_ids: [] as number[],  // 改为多选数组（原 metric_id 单值→metric_ids 数组）
  source_dataset_id: undefined as number | undefined,
  group_by: [] as string[], filter: null as Record<string, any> | null,
  time_grain: undefined as string | undefined,
  time_field: undefined as string | undefined,
  measure_semantics: undefined as string | undefined,
  business_definition: '',
})
```

> **关键变化**：`metric_id`（单值）→ `metric_ids`（数组）。选 1 个就是原来的单指标，选多个就是多度量。无模式切换。

#### 4.5.2 UI 交互设计

**保持现有表单结构不变**，仅将"关联指标"从单选改为多选：

```
┌─────────────────────────────────────────────────────────────────────┐
│  新建聚合定义                                                        │
├─────────────────────────────────────────────────────────────────────┤
│  名称：      [________________]                                      │
│  编码：      [dws________________]                                   │
│                                                                     │
│  关联指标：  [在职人数 ×] [离职人数 ×] [人均成本 ×]  (el-select     │
│              multiple filterable，选 N 个即多度量宽表)              │
│                                                                     │
│  来源数据集：[选择数据集 ▼]                                         │
│  分组维度：  [多选 ▼]                                               │
│  时间字段：  [选择时间字段 ▼]  (X05)                               │
│  口径说明：  [______________________]                               │
│                                                                     │
│                              [取消]  [保存]                         │
└─────────────────────────────────────────────────────────────────────┘
```

**交互规则**：
- **无模式切换**：`el-select` 直接改为 `multiple filterable`，选 1 个 = 单指标，选 N 个 = 多度量。用户不感知"模式"概念。
- **无 alias/label 配置**：View 列名（alias）和显示名（label）由后端从指标元数据自动派生，前端不暴露这些字段。
- **保存时**：`metric_ids` 数组传给后端；后端自动派生 alias/label 存入 `measures` JSON，同时 `metric_id` 设为 `metric_ids[0]`。
- **回显时**：`Out` schema 返回 `measures`（含 alias/label），前端可展示"该宽表包含 N 个度量列"的只读提示，但不提供编辑。
- 其余字段（来源数据集、分组维度、时间字段、口径说明）完全保持现状。

#### 4.5.3 列表页标识

在 DWS 聚合列表的"关联指标"列：
- 选了 1 个指标：显示该指标名称（与现状一致）
- 选了 N 个指标：显示第一个指标名称 + `el-tag` "等 N 个度量"（`type="info"`）

#### 4.5.4 计算入口

列表页"生成视图"按钮旁新增"计算"按钮（当 `measures` 非空时显示，即多选了 2+ 指标时），点击后弹窗输入 period，调用 `POST /dws-aggregates/{id}/compute`。

---

## 5. 原子开发任务列表

### M1: Alembic 迁移 + Model 字段

- [ ] M0101 新增 `measures` JSON 字段到 `DwsAggregateDefinition`
  - 前置任务：无
  - 功能范围：仅新增字段 + 迁移，不改业务逻辑。
  - 代码交付物：
    - `alembic/versions/0101_add_dws_measures.py`（upgrade + downgrade）
    - `backend/app/warehouse/models.py:329` 前新增 `measures` Column
  - UI 要求：不涉及 UI。
  - UCP 协同要求：不涉及 UCP。
  - 测试要求：
    - 迁移测试：`alembic upgrade head` 成功；`alembic downgrade -1` 成功。
    - 字段默认值：已有记录 `measures` 为 `null`/`[]`。
  - 验收标准：
    - 正常路径：迁移后 `SELECT measures FROM dws_aggregate_definitions LIMIT 1` 不报错。
    - 异常路径：downgrade 后字段不存在，ORM 不引用该字段。

### M2: Pydantic Schema 变更

- [ ] M0102 新增 `DwsMeasureDef` schema + Create/Update 中添加 `metric_ids` 字段 + Out 添加 `measures` 字段
  - 前置任务：M0101
  - 功能范围：仅 schema 定义，不改路由逻辑。前端传 `metric_ids` 数组，后端自动派生 `measures`（含 alias/label）存入 DB，Out 返回 `measures` 供前端展示。
  - 代码交付物：
    - `backend/app/warehouse/schemas.py`：新增 `DwsMeasureDef` class（`metric_id` 必填，`alias`/`label` 可选=后端派生）；`CreateIn` / `UpdateIn` 添加 `metric_ids: Optional[list[int]]`；`Out` 添加 `measures: Optional[list[DwsMeasureDef]]`。
  - UI 要求：不涉及 UI。
  - UCP 协同要求：不涉及 UCP。
  - 测试要求：
    - 单元测试：CreateIn 接受 `metric_ids=[1, 2, 3]`。
    - 单元测试：CreateIn 接受 `metric_ids=None`（向后兼容，走原 metric_id 路径）。
    - 单元测试：Out 返回 `measures` 含自动派生的 alias/label。
  - 验收标准：
    - 正常路径：API `POST /dws-aggregates` 带 `metric_ids` 可创建成功。
    - 异常路径：`metric_ids` 为空数组且 `metric_id` 也为空 → 422。

### M3: `generate_dws_view` 多度量 SELECT 改造

- [ ] M0103 `generate_dws_view` 支持多度量 SELECT + TableColumn 注册 + output_fields
  - 前置任务：M0101, M0102
  - 功能范围：当 `measures` 非空时，VIEW DDL 拼接多个度量列；TableColumn 注册多个度量列；output_fields 包含所有度量 alias。
  - 代码交付物：
    - `backend/app/warehouse/service/modeling.py`：
      - 度量表达式获取（约 L827-838）：增加多度量分支
      - SELECT 子句（约 L1044-1051）：多度量拼接
      - TableColumn 注册（约 L1088-1098）：循环注册
      - output_fields 返回值（约 L1123）：多度量 alias
  - UI 要求：不涉及 UI（后端逻辑）。
  - UCP 协同要求：不涉及 UCP。
  - 测试要求：
    - 单元测试：`measures` 为空时，VIEW 产出 `aggregated_value` 单列（回归）。
    - 单元测试：`measures` 有 2 项时，VIEW 产出 2 个度量列，列名 = 自动派生的 alias。
    - 单元测试：两个指标名相同时，alias 自动追加 `_2` 后缀去重。
    - 单元测试：alias 与维度列冲突时抛 ValueError。
    - 集成测试：多度量 VIEW + X05 时间列同时工作（`time_field` 派生 year/quarter/month + 多度量列）。
  - 验收标准：
    - 正常路径：`POST /dws-aggregates/{id}/generate-view` 成功，VIEW 含 N 个度量列（列名=自动派生的 alias）+ 维度列 + 时间列。
    - 异常路径：某度量 metric_id 不存在 → 400；某指标无 formula_sql → 400。

### M4: 多度量计算入口

- [ ] M0104 新增 `compute_wide_table` 方法 + `POST /dws-aggregates/{id}/compute` 端点
  - 前置任务：M0103
  - 功能范围：多度量计算：生成 View → 查询 → 写入 metric_result_rows。
  - 代码交付物：
    - `backend/app/warehouse/service/modeling.py`：`DwsAggregateService.compute_wide_table()` 方法
    - `backend/app/warehouse/router.py`：`POST /dws-aggregates/{agg_id}/compute` 路由
  - UI 要求：不涉及 UI（API 层）。
  - UCP 协同要求：不涉及 UCP。
  - 测试要求：
    - 单元测试：`measures` 为空时返回 `{"error": "bad_request"}`。
    - 单元测试：计算成功后 `metric_result_rows.measure_values` 包含所有度量 alias。
    - 单元测试：`MetricResult.metric_id` = 第一个度量 的 metric_id。
    - 集成测试：多度量计算 + FineBI 推送（`push_db_expose` 物化后物理表含所有度量列）。
  - 验收标准：
    - 正常路径：`POST /dws-aggregates/{id}/compute` 返回 `{"status": "success", ...}`。
    - 异常路径：聚合定义不存在 → 404；未配置 measures → 400。

### M5: 前端多指标选择改造

- [ ] M0105 前端 DWS 聚合表单"关联指标"改为多选
  - 前置任务：M0102
  - 功能范围：将"关联指标" `el-select` 从单选改为多选（`multiple filterable`），保存时传 `metric_ids` 数组。无模式切换、无 alias/label 配置。
  - 代码交付物：
    - `frontend/src/views/warehouse/WarehouseDwsAggregate.vue`：
      - `form` ref：`metric_id` → `metric_ids: number[]`
      - `el-dialog` 内：`el-select v-model="form.metric_ids" multiple filterable`（替换原 `v-model="form.metric_id"`）
      - `save()` 方法：传 `metric_ids` 数组给后端
      - 列表页：多指标时显示"等 N 个度量" `el-tag`
      - "计算"按钮：`measures` 非空时显示
  - UI 要求：
    - 关联指标改为 `el-select multiple filterable`，选 1 个 = 单指标、选 N 个 = 多度量，无模式切换。
    - 不暴露 alias/label 输入框——列名和显示名由后端自动派生。
    - 回显时从 `Out.measures` 读取度量信息，列表页展示"等 N 个度量"标签。
    - 空态：未选指标时 `el-select` 显示 placeholder "请选择指标"。
    - 加载态：保存时按钮 loading。
    - 关联 `ui-interaction.md` §4 数据资产页列表布局规范。
  - UCP 协同要求：不涉及 UCP。
  - 测试要求：
    - 组件测试：选择 1 个指标 → 保存传 `metric_ids: [1]`。
    - 组件测试：选择 3 个指标 → 保存传 `metric_ids: [1, 2, 3]`。
    - 组件测试：回显时多指标显示"等 3 个度量"标签。
    - 构建检查：`vue-tsc` 0 错误；`vite build` 成功。
  - 验收标准：
    - 正常路径：选择多个指标 → 保存成功 → 列表显示"等 N 个度量"标签。
    - 异常路径：未选指标 → 保存时前端拦截。
    - 边界场景：只选 1 个指标 → 行为与改造前单选完全一致（回归）。

### M6: 端到端集成测试

- [ ] M0106 多度量 DWS 宽表端到端测试
  - 前置任务：M0103, M0104, M0105
  - 功能范围：覆盖完整链路：创建多度量聚合 → 生成 View → 计算 → 结果验证 → FineBI 推送。
  - 代码交付物：
    - `tests/test_x06_multi_measure_dws.py`
  - UI 要求：不涉及 UI（后端集成测试）。
  - UCP 协同要求：不涉及 UCP。
  - 测试要求：
    - 场景 A：创建 2 度量聚合 → generate-view → VIEW 含 2 个度量列 + 维度列。
    - 场景 B：compute → metric_result_rows.measure_values 含 2 个 key。
    - 场景 C：多度量 + time_field → VIEW 含度量列 + year/quarter/month。
    - 场景 D：单指标回归（metric_ids 只选 1 个）→ VIEW 含 aggregated_value 单列。
    - 场景 E：两个指标名相同 → alias 自动追加后缀去重，不报错。
    - 场景 F：FineBI 推送物化后物理表含所有度量列。
  - 验收标准：
    - 正常路径：全链路无报错，结果数据正确。
    - 异常路径：校验失败时返回明确错误信息。
    - 回归：选 1 个指标时不受影响。

---

## 6. 测试要求汇总

### 6.1 后端单元测试

| 测试项 | 覆盖点 |
|---|---|
| Schema 校验 | `metric_ids` 数组接受/拒绝逻辑 |
| 迁移 | upgrade/downgrade 正常 |
| generate_dws_view | 多度量 SELECT 正确、TableColumn 注册正确 |
| generate_dws_view | alias 自动派生 + 同名去重 |
| generate_dws_view | alias 与维度列冲突抛错 |
| generate_dws_view | 单指标回归（measures 为空） |
| compute_wide_table | measure_values 包含所有度量 |
| compute_wide_table | measures 为空时返回 bad_request |

### 6.2 集成测试

| 测试项 | 覆盖点 |
|---|---|
| 多度量 + 时间列 | 度量列 + year/quarter/month 共存 |
| FineBI 推送 | 物理表含所有度量列 |
| 端到端 | 创建 → 生成 → 计算 → 推送全链路 |

### 6.3 前端测试

| 测试项 | 覆盖点 |
|---|---|
| 多选指标 | 选 1 个=单指标、选 N 个=多度量，保存传 metric_ids 数组 |
| 回显 | 多指标时列表显示"等 N 个度量"标签 |
| 回归 | 只选 1 个指标时行为与改造前完全一致 |
| 构建检查 | vue-tsc 0 错、vite build 成功 |

---

## 7. 验收标准

### 7.1 功能验收

| # | 验收项 | 验证方法 |
|---|---|---|
| V1 | 创建多度量聚合定义 | API POST 带 measures，返回 200 |
| V2 | 生成 View 含多度量列 | GET view-impact，列列表含所有 alias |
| V3 | 计算结果含多度量值 | GET metric results detail，measure_values 含所有 key |
| V4 | FineBI 物理表含多度量列 | 推送后 SELECT * FROM finebi_表，列数正确 |
| V5 | 单指标回归 | 选 1 个指标时已有聚合定义不受影响 |
| V6 | 多度量 + 时间列共存 | VIEW 含度量列 + year/quarter/month |
| V7 | 前端多选指标 | 选 N 个指标 → 保存传 metric_ids 数组 → 列表显示"等 N 个度量"标签；选 1 个时与改造前行为一致 |

### 7.2 兼容性验收

| # | 验收项 | 验证方法 |
|---|---|---|
| C1 | 已有单指标聚合定义不受影响 | 现有 DWS 聚合 generate-view 正常 |
| C2 | 已有 compute_metric 接口不受影响 | POST /metrics/{id}/compute 正常 |
| C3 | X05 时间列派生正常工作 | 多度量 + time_field 共存 |
| C4 | metric_components 复合指标不冲突 | 复合指标计算正常 |

### 7.3 边界场景

| # | 场景 | 预期 |
|---|---|---|
| E1 | metric_ids 只选 1 个 | 走单指标路径，measures 为空 |
| E2 | metric_ids 选 2+ 个 | 走多度量路径，VIEW 含 N 个度量列 |
| E3 | 两个指标名相同导致 alias 重复 | 后端自动追加 `_2` 后缀去重 |
| E4 | alias 与维度列同名 | 后端自动追加后缀或报错提示 |
| E5 | metric_id 不存在 | 400 |
| E6 | 指标无 formula_sql | 400 |
| E7 | 度量来自不同 source_dataset | 报错（同源校验） |

---

## 8. 风险与待确认

| # | 风险 | 对策 |
|---|---|---|
| R1 | 多度量 formula_sql 引用不同表的列导致 SQL 报错 | 同源校验：所有度量的 formula_sql 必须引用同一 source_dataset 的表/列 |
| R2 | FineBI 推送时度量列类型不兼容 | 推送逻辑 `SELECT *` 自动适配；FineBI 侧配置列类型 |
| R3 | alias 与 PostgreSQL 保留字冲突 | `_slugify` 后校验保留字黑名单，冲突时自动追加后缀 |
| R4 | 多度量计算性能（N 个 formula_sql 一次 GROUP BY） | 单次 GROUP BY 性能优于 N 次独立聚合，不是退化 |
| R5 | MetricResultRow 只绑一个 metric_id，其他度量的结果"隐藏" | 设计如此：宽表结果通过 `POST /dws-aggregates/{id}/compute` 入口查询，不通过单指标 `GET /metrics/{id}/results` |

---

## 9. 与其他设计的关系

- **X05 时间列派生**：完全复用，多度量 + 时间列在同一张 VIEW 中共存。
- **metric_components 复合指标**：正交关系。一个度量可以有 components（numerator/denominator/rate），多个度量组成宽表。两者可叠加。
- **X07 ADS 宽表组装（二期）**：解决跨源 DWD 表的度量拼接。本期的多度量 DWS 是"同源多指标"，X07 是"跨源多指标"。
- **Phase 4 OLAP**：跨指标透视/Cube，不在本范围。本期是物理 VIEW 多列，不是 OLAP 引擎。
