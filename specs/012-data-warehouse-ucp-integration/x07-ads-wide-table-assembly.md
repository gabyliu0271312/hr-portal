# X07 ADS 宽表组装 · 二期设计（跨源多指标 JOIN 一张表）

> 归属：`specs/012-data-warehouse-ucp-integration/`
> 关联：`x06-multi-measure-dws-wide-table.md`（一期：同源多度量 DWS View）、`x05-time-drilldown-two-phase-design.md`（时间列派生）
> 状态：设计评审稿 v1.0
> 最后更新：2026-07-16

---

## 1. 背景与目标

### 1.1 用户场景

HR 部门有一张"部门月度人力汇总宽表"需求，但部分指标来自不同的 DWD 明细表：
- 在职人数、离职人数、人均成本 → 来自**员工明细表**（一期 X06 已解决）
- HC 完成率 → 来自**招聘明细表**（不同 DWD 数据集）
- 培训完成率 → 来自**培训明细表**（不同 DWD 数据集）

一期 X06 要求所有度量同源（同一 `source_dataset_id`）。当度量跨源时，需要一种机制把多张 DWS View 按 shared 维度 JOIN 成一张宽表。

### 1.2 目标

在现有 ADS（消费资产组装）层上扩展"多源组装"能力：一个 ADS 定义可引用多个 DWS 聚合 View，按共享维度做 FULL OUTER JOIN，产出一张宽表 VIEW，推送给 FineBI 消费。

### 1.3 设计原则

- **不破坏现有 ADS**：`source_type` + `source_id` 单源模式保留不动，新增 `sources` 数组字段。当 `sources` 非空时走多源组装路径。
- **一期先行**：X06 同源多度量是常见场景（80%），X07 跨源组装是补充（20%）。两期独立交付，不互相阻塞。
- **JOIN 安全**：所有源 View 必须有共享维度（至少 1 个），系统校验 grain 对齐。
- **列名隔离**：每个源 View 的度量列自动加前缀（`{source_alias}_{column}`），避免列名冲突。

---

## 2. 范围与边界

| 项 | 是否本期范围 | 说明 |
|---|---|---|
| `AdsDefinition` 新增 `sources` + `join_config` JSON 字段 | ✅ | Alembic 迁移 0102 |
| `assemble_wide_table` 方法：多源 FULL OUTER JOIN | ✅ | 核心改动 |
| 新增 `POST /ads-definitions/{id}/assemble` 端点 | ✅ | 组装执行入口 |
| 前端 ADS 向导 Step 1 支持多源选择 | ✅ | WarehouseAds.vue |
| FineBI 推送适配 | ✅ | 零改动，推送逻辑自动适配 |
| 单源 ADS 回归 | ✅ | `sources` 为空时走原有路径 |
| 同源多度量（X06） | ❌ | 一期已完成 |
| OLAP/Cube/跨指标透视 | ❌ | Phase 4，不在本范围 |
| ADS 预览/发布/权限 | ❌ | 已有实现，不改 |

---

## 3. 代码现状核实（事实基线）

| 事实 | 位置 | 含义 |
|---|---|---|
| `AdsDefinition.source_type` 是单值 String | `models.py:429` | `dws_aggregate/dataset/model` 三选一 |
| `AdsDefinition.source_id` 是单值 BigInteger | `models.py:430` | 一个来源 ID |
| ADS API 路由 | `router.py:4386-4455` | CRUD + preview + validate + publish + unpublish + sources + dimensions |
| ADS Pydantic schemas | `schemas.py:1122-1173` | `AdsDefinitionIn` / `UpdateIn` / `AdsDimensionRef` / `AdsOutputField` / `AdsPresetFilter` |
| 前端 ADS 向导 | `WarehouseAds.vue` (458 行) | 5 步向导：基本信息→维度→输出字段→过滤→预览发布 |
| Step 1 source 选择 | `WarehouseAds.vue:32-35` | `form.source_type` + `form.source_id` 单值 |
| ADS 来源列表 API | `router.py:4450` | `GET /ads-sources` 返回可用 DWS 聚合列表 |
| DWS View 是数据库 VIEW | `modeling.py:1051` | `CREATE OR REPLACE VIEW` |
| FineBI 推送 | `push_service.py:707` | `push_db_expose(source_table, ...)` |
| 最新 Alembic 迁移 | `0100_add_dws_timefields.py` | 二期迁移编号 0102（一期 X06 用 0101） |

---

## 4. 技术设计

### 4.1 数据模型变更

#### 4.1.1 新增字段

在 `AdsDefinition`（`models.py:443` 之前）新增：

```python
sources = Column(JSON, nullable=True, default=list,
                 comment="多源组装定义列表；为空时走单源路径(source_type+source_id)。"
                         "每项: {source_type, source_id, source_alias, column_prefix}")
join_config = Column(JSON, nullable=True,
                     comment="JOIN 配置: {join_type, join_keys: [{left_alias, left_column, right_alias, right_column}]}")
```

**sources 结构定义**：

```json
[
  {
    "source_type": "dws_aggregate",
    "source_id": 10,
    "source_alias": "emp",
    "column_prefix": "emp_"
  },
  {
    "source_type": "dws_aggregate",
    "source_id": 20,
    "source_alias": "recruit",
    "column_prefix": "rec_"
  }
]
```

- `source_type`（string，必填）：`dws_aggregate` / `dataset` / `model`。当前仅支持 `dws_aggregate`。
- `source_id`（int，必填）：DWS 聚合定义 ID。
- `source_alias`（string，必填）：SQL JOIN 中的表别名，`^[a-z][a-z0-9_]{0,30}$`，列表内唯一。
- `column_prefix`（string，可选）：度量列名前缀，默认 `{source_alias}_`。用于避免不同源 View 的度量列名冲突。

**join_config 结构定义**：

```json
{
  "join_type": "full_outer",
  "join_keys": [
    {"left_alias": "emp", "left_column": "dept", "right_alias": "recruit", "right_column": "dept"},
    {"left_alias": "emp", "left_column": "month", "right_alias": "recruit", "right_column": "month"}
  ]
}
```

- `join_type`（string，默认 `full_outer`）：`full_outer` / `left` / `inner`。推荐 `full_outer`（保证不丢行）。
- `join_keys`（array，必填）：JOIN 条件。至少 1 组。每组的 `left_alias` 和 `right_alias` 必须在 `sources` 中存在。

#### 4.1.2 Alembic 迁移（0102）

文件：`alembic/versions/0102_add_ads_sources_join.py`

```python
def upgrade():
    op.add_column("ads_definitions",
        sa.Column("sources", sa.JSON(), nullable=True, server_default="[]",
                  comment="多源组装定义列表"))
    op.add_column("ads_definitions",
        sa.Column("join_config", sa.JSON(), nullable=True,
                  comment="JOIN 配置"))

def downgrade():
    op.drop_column("ads_definitions", "join_config")
    op.drop_column("ads_definitions", "sources")
```

#### 4.1.3 `source_type` + `source_id` 字段处置

- 保留不动，向后兼容。
- 当 `sources` 非空时，`source_type` 自动设为 `"multi_source"`，`source_id` 设为 0（标记位）。
- 当 `sources` 为空时，走原有单源路径。

### 4.2 `assemble_wide_table` 方法

在 ADS 服务中新增（建议放在 `modeling.py` 或新建 `ads_service.py`）：

```python
async def assemble_wide_table(self, ads_id: int):
    """多源 ADS 宽表组装：N 个 DWS View → FULL OUTER JOIN → 一张宽表 VIEW"""
    from app.warehouse.models import AdsDefinition, DwsAggregateDefinition
    from sqlalchemy import text as sa_text
    Q = self._quote_ident

    ads = await self.session.get(AdsDefinition, ads_id)
    if ads is None:
        return {"error": "not_found", "detail": f"ADS 定义不存在: {ads_id}"}
    if not ads.sources:
        return {"error": "bad_request", "detail": "该 ADS 定义未配置多源(sources)"}

    sources = ads.sources
    join_cfg = ads.join_config or {}
    join_type = join_cfg.get("join_type", "full_outer")
    join_keys = join_cfg.get("join_keys", [])

    if not join_keys:
        raise ValueError("多源组装缺少 join_keys 配置")

    # 1. 确保每个源的 DWS View 已生成
    for src in sources:
        if src["source_type"] != "dws_aggregate":
            raise ValueError(f"暂不支持来源类型: {src['source_type']}，当前仅支持 dws_aggregate")
        agg = await self.session.get(DwsAggregateDefinition, src["source_id"])
        if agg is None:
            raise ValueError(f"来源聚合定义不存在: ID={src['source_id']}")
        # 确保 View 存在（调用 generate_dws_view 刷新）
        await DwsAggregateService(self.session).generate_dws_view(agg.id)
        src["_view_name"] = agg.name

    # 2. 构建 JOIN SQL
    # 第一个源作为基表，后续源依次 JOIN
    base = sources[0]
    from_clause = f"{Q(base['_view_name'])} AS {Q(base['source_alias'])}"

    for i, src in enumerate(sources[1:], 1):
        alias = src["source_alias"]
        view = src["_view_name"]
        # 找到当前源与已 JOIN 部分的 join_keys
        conditions = []
        for jk in join_keys:
            if jk["right_alias"] == alias:
                conditions.append(
                    f"{Q(jk['left_alias'])}.{Q(jk['left_column'])} = "
                    f"{Q(alias)}.{Q(jk['right_column'])}"
                )
            elif jk["left_alias"] == alias:
                conditions.append(
                    f"{Q(alias)}.{Q(jk['left_column'])} = "
                    f"{Q(jk['right_alias'])}.{Q(jk['right_column'])}"
                )
        if not conditions:
            raise ValueError(f"源 {alias} 没有对应的 join_keys")
        join_keyword = "FULL OUTER JOIN" if join_type == "full_outer" else \
                       "LEFT JOIN" if join_type == "left" else "INNER JOIN"
        from_clause += f" {join_keyword} {Q(view)} AS {Q(alias)} ON {' AND '.join(conditions)}"

    # 3. 构建 SELECT 子句
    # 维度列：取第一个源的共享维度列（COALESCE 防止 FULL OUTER JOIN 产生 NULL）
    shared_dims = list(set(jk["left_column"] for jk in join_keys if jk["left_alias"] == base["source_alias"]) |
                       set(jk["right_column"] for jk in join_keys if jk["right_alias"] == base["source_alias"]))

    select_parts = [f"ROW_NUMBER() OVER () AS {Q('id')}"]

    # 共享维度列：COALESCE 优先取第一个非 NULL 值
    for dim in shared_dims:
        coalesce_expr = ", ".join(f"{Q(s['source_alias'])}.{Q(dim)}" for s in sources)
        select_parts.append(f"COALESCE({coalesce_expr}) AS {Q(dim)}")

    # 每个源的度量列：加前缀
    for src in sources:
        agg = await self.session.get(DwsAggregateDefinition, src["source_id"])
        prefix = src.get("column_prefix", f"{src['source_alias']}_")
        # 获取 View 的列列表（排除维度列和保留列）
        from app.data.models import TableColumn
        cols = (await self.session.execute(
            select(TableColumn).where(TableColumn.table_name == src["_view_name"])
        )).scalars().all()
        reserved = {"id", "synced_at", "snapshot_month", "year", "quarter", "month"}
        dim_set = set(shared_dims)
        for col in cols:
            if col.column_code in reserved or col.column_code in dim_set:
                continue
            prefixed = f"{prefix}{col.column_code}"
            select_parts.append(f"{Q(src['source_alias'])}.{Q(col.column_code)} AS {Q(prefixed)}")

    select_parts.append(f"NULL::timestamptz AS {Q('synced_at')}")
    select_clause = ", ".join(select_parts)

    # 4. 生成宽表 VIEW
    wide_view_name = f"ads_wide_{ads.id}"
    ddl = f"CREATE OR REPLACE VIEW {Q(wide_view_name)} AS SELECT {select_clause} FROM {from_clause}"

    from app.core.db import get_session_factory
    async with get_session_factory()() as ddl_db:
        try:
            await ddl_db.execute(sa_text(f"DROP VIEW IF EXISTS {Q(wide_view_name)}"))
            await ddl_db.execute(sa_text(ddl))
            await ddl_db.commit()
        except Exception as e:
            await ddl_db.rollback()
            raise ValueError(f"组装宽表视图失败: {str(e)[:200]}")

    # 5. 注册元数据（RegisteredTable + TableColumn）
    from app.data.models import RegisteredTable, TableColumn as TC
    old_cols = (await self.session.execute(
        select(TC).where(TC.table_name == wide_view_name)
    )).scalars().all()
    for oc in old_cols:
        await self.session.delete(oc)
    await self.session.flush()

    rt = (await self.session.execute(
        select(RegisteredTable).where(RegisteredTable.table_name == wide_view_name)
    )).scalars().first()
    if not rt:
        rt = RegisteredTable(table_name=wide_view_name, table_label=ads.name,
                             warehouse_layer="ADS", source_system="ads_assembly")
        self.session.add(rt); await self.session.flush()

    col_order = 0
    self.session.add(TC(table_name=wide_view_name, column_code="id", column_label="ID",
                        data_type="integer", display_order=col_order, is_visible=True))
    col_order += 1
    for dim in shared_dims:
        self.session.add(TC(table_name=wide_view_name, column_code=dim, column_label=dim,
                            data_type="string", display_order=col_order, is_visible=True))
        col_order += 1
    for src in sources:
        agg = await self.session.get(DwsAggregateDefinition, src["source_id"])
        prefix = src.get("column_prefix", f"{src['source_alias']}_")
        cols = (await self.session.execute(
            select(TableColumn).where(TableColumn.table_name == src["_view_name"])
        )).scalars().all()
        for col in cols:
            if col.column_code in {"id", "synced_at", "snapshot_month", "year", "quarter", "month"} or col.column_code in set(shared_dims):
                continue
            prefixed = f"{prefix}{col.column_code}"
            self.session.add(TC(table_name=wide_view_name, column_code=prefixed,
                                column_label=f"{src['source_alias']}.{col.column_label}",
                                data_type=col.data_type, display_order=col_order, is_visible=True))
            col_order += 1
    self.session.add(TC(table_name=wide_view_name, column_code="synced_at", column_label="同步时间",
                        data_type="timestamptz", display_order=col_order, is_visible=True))

    await self.session.commit()

    # 6. 动态注册
    from app.data.dynamic_loader import _register_view_model
    try:
        async with get_session_factory()() as reg_db:
            await _register_view_model(reg_db, wide_view_name, force=True)
    except Exception:
        pass

    return {"ads_id": ads_id, "view_name": wide_view_name, "sources_count": len(sources),
            "join_type": join_type, "sql_summary": ddl}
```

### 4.3 API 变更

#### 4.3.1 新增组装端点

在 `router.py` 中新增（紧邻现有 ADS publish 端点之后）：

```python
@router.post("/ads-definitions/{def_id}/assemble")
async def assemble_ads_wide_table(def_id: int, db: AsyncSession = Depends(get_db)):
    """多源 ADS 宽表组装"""
    service = AdsAssemblyService(db)
    result = await service.assemble_wide_table(def_id)
    if "error" in result:
        raise HTTPException(status_code=400 if result["error"] == "bad_request" else 404,
                            detail=result["detail"])
    return result
```

#### 4.3.2 Schema 变更

```python
class AdsSourceRef(BaseModel):
    """多源组装来源项"""
    model_config = {"extra": "forbid"}
    source_type: str = Field(default="dws_aggregate", max_length=32)
    source_id: int
    source_alias: str = Field(..., max_length=32, pattern=r"^[a-z][a-z0-9_]{0,30}$")
    column_prefix: Optional[str] = Field(None, max_length=32)

class AdsJoinKey(BaseModel):
    """JOIN 条件项"""
    model_config = {"extra": "forbid"}
    left_alias: str = Field(..., max_length=32)
    left_column: str = Field(..., max_length=128)
    right_alias: str = Field(..., max_length=32)
    right_column: str = Field(..., max_length=128)

class AdsJoinConfig(BaseModel):
    """JOIN 配置"""
    model_config = {"extra": "forbid"}
    join_type: str = Field(default="full_outer", pattern=r"^(full_outer|left|inner)$")
    join_keys: list[AdsJoinKey] = Field(..., min_length=1)
```

在 `AdsDefinitionIn`（`schemas.py:1147`）和 `AdsDefinitionUpdateIn`（`:1163`）中添加：

```python
sources: Optional[list[AdsSourceRef]] = None
join_config: Optional[AdsJoinConfig] = None
```

### 4.4 前端变更

#### 4.4.1 向导 Step 1 改造（WarehouseAds.vue:32-35）

在 Step 1（基本信息）中增加"单源/多源"模式切换：

```
┌── 来源模式 ──────────────────────────────────────────────────────┐
│  ◉ 单源模式（原有）    ○ 多源组装模式（宽表）                     │
└──────────────────────────────────────────────────────────────────┘

【单源模式时显示】
来源类型：[dws_aggregate ▼]
来源：    [选择 DWS 聚合 ▼]

【多源模式时显示】
┌──────────────────────────────────────────────────────────────────┐
│  来源列表                                                         │
│  ┌──────────────────┬──────────────┬───────────────┬────┐       │
│  │ DWS 聚合          │ 别名(alias)  │ 列名前缀      │ 操作│       │
│  ├──────────────────┼──────────────┼───────────────┼────┤       │
│  │ [员工月度汇总 ▼]  │ emp          │ emp_          │ ✕  │       │
│  │ [招聘月度汇总 ▼]  │ recruit      │ rec_          │ ✕  │       │
│  └──────────────────┴──────────────┴───────────────┴────┘       │
│  [+ 添加来源]                                                     │
└──────────────────────────────────────────────────────────────────┘

┌── JOIN 配置 ─────────────────────────────────────────────────────┐
│  JOIN 类型：[FULL OUTER JOIN ▼]  (推荐)                          │
│                                                                  │
│  JOIN 条件：                                                     │
│  ┌────────────┬──────────┬────────┬──────────┬────┐             │
│  │ 左表别名    │ 左表列   │ =      │ 右表别名  │ 右表列 │ 操作│    │
│  ├────────────┼──────────┼────────┼──────────┼──────┼────┤      │
│  │ [emp ▼]    │ [dept ▼] │   =    │ [recruit ▼]│ [dept ▼] │ ✕  │
│  │ [emp ▼]    │ [month ▼]│   =    │ [recruit ▼]│ [month ▼]│ ✕  │
│  └────────────┴──────────┴────────┴──────────┴──────┴────┘      │
│  [+ 添加 JOIN 条件]                                              │
└──────────────────────────────────────────────────────────────────┘
```

#### 4.4.2 交互规则

- 模式切换：`el-radio-group`，`single` / `multi`。默认 `single`。
- 多源模式下：
  - 来源列表：每行一个 `el-select`（选 DWS 聚合，filterable）+ `el-input`（alias）+ `el-input`（column_prefix）+ 删除按钮。
  - 至少 2 个来源才能组装。
  - JOIN 配置：`el-select`（join_type）+ JOIN 条件表格。
  - JOIN 条件表格：左表别名（`el-select`，选项来自来源列表的 alias）+ 左表列（`el-select`，选项来自该源的 View 列）+ 右表别名 + 右表列 + 删除按钮。
  - 至少 1 组 JOIN 条件。
- "组装"按钮：在 Step 5（预览与发布）中，多源模式时显示"组装宽表"按钮，调用 `POST /ads-definitions/{id}/assemble`。

#### 4.4.3 预览

组装成功后，Step 5 预览区显示宽表 VIEW 的前 20 行数据，列名带前缀。

---

## 5. 原子开发任务列表

### M1: Alembic 迁移 + Model 字段

- [ ] M0201 新增 `sources` + `join_config` JSON 字段到 `AdsDefinition`
  - 前置任务：X06 M0101（确保迁移链 0101 → 0102）
  - 功能范围：仅新增字段 + 迁移。
  - 代码交付物：
    - `alembic/versions/0102_add_ads_sources_join.py`
    - `backend/app/warehouse/models.py:443` 前新增 `sources` + `join_config` Column
  - UI 要求：不涉及 UI。
  - UCP 协同要求：不涉及 UCP。
  - 测试要求：迁移 upgrade/downgrade 正常；已有记录字段为 null。
  - 验收标准：迁移后 `SELECT sources, join_config FROM ads_definitions LIMIT 1` 不报错。

### M2: Pydantic Schema 变更

- [ ] M0202 新增 `AdsSourceRef` / `AdsJoinKey` / `AdsJoinConfig` schema + 在 In/UpdateIn 中添加字段
  - 前置任务：M0201
  - 功能范围：仅 schema 定义。
  - 代码交付物：
    - `backend/app/warehouse/schemas.py`：新增 3 个 class；在 `AdsDefinitionIn` / `UpdateIn` 中添加 `sources` + `join_config`。
  - UI 要求：不涉及 UI。
  - UCP 协同要求：不涉及 UCP。
  - 测试要求：
    - 单元测试：`AdsSourceRef` alias 格式校验。
    - 单元测试：`AdsJoinConfig` join_type 枚举校验。
    - 单元测试：`sources=None` 向后兼容。
  - 验收标准：API 接受多源定义；非法 alias/join_type 返回 422。

### M3: `assemble_wide_table` 方法

- [ ] M0203 实现 `assemble_wide_table` 多源 JOIN 逻辑
  - 前置任务：M0201, M0202
  - 功能范围：多源 DWS View → FULL OUTER JOIN → 宽表 VIEW + 元数据注册。
  - 代码交付物：
    - `backend/app/warehouse/service/modeling.py`（或新建 `ads_service.py`）：`AdsAssemblyService.assemble_wide_table()` 方法
  - UI 要求：不涉及 UI（后端逻辑）。
  - UCP 协同要求：不涉及 UCP。
  - 测试要求：
    - 单元测试：2 源 FULL OUTER JOIN 产出正确列数（共享维度 + 各源度量列带前缀）。
    - 单元测试：COALESCE 共享维度列（一方为 NULL 时取另一方值）。
    - 单元测试：`sources` 为空时返回 bad_request。
    - 单元测试：join_keys 中 alias 不在 sources 中时抛 ValueError。
    - 单元测试：列名前缀生效（`emp_headcount`, `recruit_hc_rate`）。
    - 集成测试：组装 → FineBI 推送（`push_db_expose` 物化后物理表含所有列）。
  - 验收标准：
    - 正常路径：`POST /ads-definitions/{id}/assemble` 返回 view_name + sources_count。
    - 异常路径：来源 View 不存在 → 400；join_keys 缺失 → 400。

### M4: API 端点

- [ ] M0204 新增 `POST /ads-definitions/{id}/assemble` 路由
  - 前置任务：M0203
  - 功能范围：路由定义 + 调用 `assemble_wide_table`。
  - 代码交付物：
    - `backend/app/warehouse/router.py`：新增路由
  - UI 要求：不涉及 UI。
  - UCP 协同要求：不涉及 UCP。
  - 测试要求：API 测试：正常返回 200；不存在 ADS → 404；未配置 sources → 400。
  - 验收标准：API 可调用且返回正确结果。

### M5: 前端多源配置向导

- [ ] M0205 前端 ADS 向导 Step 1 支持多源模式 + JOIN 配置
  - 前置任务：M0202
  - 功能范围：向导 Step 1 增加模式切换 + 来源列表 + JOIN 配置；Step 5 增加组装按钮。
  - 代码交付物：
    - `frontend/src/views/warehouse/WarehouseAds.vue`：
      - `form` ref 增加 `mode`, `sources`, `join_config`
      - Step 1：模式切换 + 来源列表表格 + JOIN 配置区
      - Step 5：多源模式显示"组装宽表"按钮
  - UI 要求：
    - 模式切换：el-radio-group，默认 single。
    - 来源列表：每行 el-select(DWS 聚合) + el-input(alias) + el-input(prefix) + 删除。
    - JOIN 配置：el-select(join_type) + 条件表格（左别名/左列/右别名/右列/删除）。
    - 至少 2 来源 + 1 组 JOIN 条件才允许组装。
    - 空态：来源列表为空时提示"请添加至少 2 个来源"。
    - 错误态：alias 重复 / JOIN 条件不完整时红色提示。
    - 加载态：组装时按钮 loading。
    - 关联 `ui-interaction.md` §4 数据资产页列表布局规范。
  - UCP 协同要求：不涉及 UCP。
  - 测试要求：
    - 组件测试：模式切换正确显示/隐藏。
    - 组件测试：来源增删 + alias 校验。
    - 组件测试：JOIN 条件增删。
    - 构建检查：vue-tsc 0 错；vite build 成功。
  - 验收标准：
    - 正常路径：配置 2 源 + JOIN → 组装成功 → 预览显示宽表数据。
    - 异常路径：来源不足 2 个 → 组装按钮禁用。
    - 边界场景：切回单源模式时 sources/join_config 清空。

### M6: 端到端集成测试

- [ ] M0206 多源 ADS 宽表组装端到端测试
  - 前置任务：M0203, M0204, M0205
  - 功能范围：完整链路：创建多源 ADS → 组装 → 验证 → 推送。
  - 代码交付物：
    - `tests/test_x07_ads_wide_table.py`
  - UI 要求：不涉及 UI。
  - UCP 协同要求：不涉及 UCP。
  - 测试要求：
    - 场景 A：2 源 FULL OUTER JOIN → 宽表 VIEW 含共享维度 + 各源度量列（带前缀）。
    - 场景 B：COALESCE 维度列正确（一方 NULL 取另一方）。
    - 场景 C：3 源链式 JOIN（emp → recruit → training）。
    - 场景 D：单源 ADS 回归（sources 为空走原有路径）。
    - 场景 E：join_keys alias 不存在 → 抛 ValueError。
    - 场景 F：FineBI 推送物化后物理表含所有列。
  - 验收标准：全链路无报错；列名前缀正确；COALESCE 生效；单源回归。

---

## 6. 测试要求汇总

### 6.1 后端单元测试

| 测试项 | 覆盖点 |
|---|---|
| Schema 校验 | AdsSourceRef alias 格式、AdsJoinConfig join_type 枚举 |
| 迁移 | upgrade/downgrade 正常 |
| assemble_wide_table | 2 源 JOIN 列数正确、COALESCE 维度列 |
| assemble_wide_table | 列名前缀生效 |
| assemble_wide_table | sources 为空返回 bad_request |
| assemble_wide_table | join_keys alias 不存在抛错 |

### 6.2 集成测试

| 测试项 | 覆盖点 |
|---|---|
| 3 源链式 JOIN | emp → recruit → training |
| FineBI 推送 | 物理表含所有列 |
| 端到端 | 创建 → 组装 → 推送全链路 |

### 6.3 前端测试

| 测试项 | 覆盖点 |
|---|---|
| 模式切换 | 单源/多源切换正确 |
| 来源增删 | 添加/删除来源行 |
| JOIN 条件 | 增删条件、alias 选项联动 |
| 构建检查 | vue-tsc 0 错、vite build 成功 |

---

## 7. 验收标准

### 7.1 功能验收

| # | 验收项 | 验证方法 |
|---|---|---|
| V1 | 创建多源 ADS 定义 | API POST 带 sources + join_config，返回 200 |
| V2 | 组装宽表 VIEW 含所有源列 | GET assemble，VIEW 列数 = 共享维度 + Σ各源度量列 |
| V3 | 列名前缀正确 | `emp_headcount`, `recruit_hc_rate` 等 |
| V4 | COALESCE 维度列 | 一方为 NULL 时取另一方值 |
| V5 | FineBI 物理表含所有列 | 推送后 SELECT * 列数正确 |
| V6 | 单源 ADS 回归 | 已有单源 ADS 不受影响 |
| V7 | 前端多源配置 | 2 源 + JOIN 条件配置 → 组装成功 |

### 7.2 兼容性验收

| # | 验收项 | 验证方法 |
|---|---|---|
| C1 | 已有单源 ADS 不受影响 | 现有 ADS preview/publish 正常 |
| C2 | X06 多度量 DWS 可作为源 | 多度量 View 作为 assemble 的输入源 |
| C3 | X05 时间列在 JOIN 后保留 | 共享维度含 month/year 时 JOIN 正确 |

### 7.3 边界场景

| # | 场景 | 预期 |
|---|---|---|
| E1 | sources 只有 1 项 | 返回 bad_request（至少 2 源） |
| E2 | join_keys 为空 | 返回 bad_request |
| E3 | join_keys alias 不在 sources 中 | ValueError |
| E4 | 源 View 不存在（未 generate-view） | 自动 generate 后组装 |
| E5 | JOIN 后行数 > 单源行数 | FULL OUTER JOIN 正确合并 |
| E6 | 列名前缀冲突（两个源相同前缀） | 校验拒绝 |

---

## 8. 风险与待确认

| # | 风险 | 对策 |
|---|---|---|
| R1 | 不同源 View 的共享维度 grain 不一致（如一个按部门、一个按部门+岗位） | 校验：join_keys 必须覆盖所有共享维度；不匹配时警告 |
| R2 | FULL OUTER JOIN 产生大量 NULL 行 | COALESCE 维度列 + 前端提示"部分源数据缺失" |
| R3 | 列数过多（10 源 × 5 度量 = 50 列） | UI 列表分页 + FineBI 侧选择需要的列 |
| R4 | JOIN 性能（大表 × 大表） | DWS View 已预聚合，行数远小于 DWD；可后续加物化视图 |
| R5 | 源 View 结构变更后宽表 VIEW 不自动刷新 | 组装时先 `generate_dws_view` 刷新每个源，再组装 |
| R6 | X06 多度量 View 作为源时，度量列名已是 alias | 前缀叠加：`emp_headcount`，不影响 |

---

## 9. 与其他设计的关系

- **X06 多度量 DWS（一期）**：X06 产出同源多度量 View，X07 可将其作为组装源之一。两者叠加：一个宽表 ADS 可以包含来自 N 个 DWS View 的度量，每个 DWS View 自身又是多度量的。
- **X05 时间列派生**：共享维度可包含 `year`/`quarter`/`month`，JOIN 后时间维度保留。
- **Phase 4 OLAP**：X07 是物理 VIEW JOIN，不是 OLAP Cube。如果需要跨指标动态透视（用户自定义行列维度），仍需 Phase 4。

---

## 10. 两期交付节奏

| 期 | 设计 | 范围 | 迁移 | 前置 |
|---|---|---|---|---|
| 一期 | X06 | 同源多度量 DWS View | 0101 | 无 |
| 二期 | X07 | 跨源 ADS 宽表组装 | 0102 | X06 M0101 |

**两期独立交付**：一期完成后即可使用同源多度量宽表；二期按需启动，解决跨源场景。两期不互相阻塞，但二期迁移依赖一期迁移链（0101 → 0102）。
