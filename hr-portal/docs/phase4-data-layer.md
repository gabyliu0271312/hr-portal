# Phase 4 数据接入层架构（C1 动态列扩展）

**版本**：v1.0 · **落地**：2026-05-23 · **作用域**：5 张业务数据表 + 数据接入层

> 本文是 Phase 4 收官的核心架构文档。后续 Phase 5（管理单元）和 Phase 6（数据集 + 报表向导）都建立在这套数据层之上。

## 设计目标

1. **源端字段任意变化**——北森换 Report ID、字段从中文换英文、加字段、改字段名，**前后端代码零改动**
2. **历史数据完整保真**——同步过的源端原始 JSON 永不丢失，未来报表可基于完整数据回溯
3. **多源端统一存储**——北森报表 / 北森接口 / 飞书 / 企微 / 数据库 / 内部上传 同样落到一张目标表
4. **元数据驱动 UI**——管理员改字段中文名/标记敏感/调整顺序，立即在数据视图、报表向导、脱敏展示生效

## 核心抽象

```text
              ┌─────────────────────────────────┐
源端          │  北森报表 / 北森接口 / 飞书 / SAP │
              │       /数据库 / Excel上传        │
              └─────────────┬───────────────────┘
                            │ Client.fetch() / get_grid_data()
                            ▼
                       原始 JSON 行
                            │
                            ▼
              ┌─────────────────────────────────┐
sync_service  │  _ensure_columns()              │ ← 自动发现字段
              │  _calc_pk_hash()                │ ← 按 is_pk_part 拼 hash
              │  upsert ON CONFLICT (pk_hash)   │
              └─────────────┬───────────────────┘
                            │
                            ▼
              ┌─────────────────────────────────┐
              │ 业务表 emp_*/cc_monthly         │
              │   id / pk_hash / raw / synced_at│
              │ 元数据 table_columns            │
              │   table_name / column_code /    │
              │   label / type / pk / sensitive │
              └─────────────┬───────────────────┘
                            │
                            ▼
              ┌─────────────────────────────────┐
              │ data/router 按元数据动态展开    │
              │ DataTableView v-for 渲染       │
              │ 字段管理 UI 编辑 table_columns │
              └─────────────────────────────────┘
```

## 数据库设计

### 业务表（5 张，统一 schema）

```sql
-- emp_realtime_roster / emp_monthly_roster / emp_monthly_salary /
-- emp_monthly_allocation / cost_center_monthly 全部相同 schema
CREATE TABLE <table_name> (
    id          BIGSERIAL PRIMARY KEY,
    pk_hash     VARCHAR(64) NOT NULL,
    raw         JSONB       NOT NULL DEFAULT '{}',
    synced_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (pk_hash)
);
CREATE INDEX ix_<table>_pk_hash ON <table_name>(pk_hash);
```

### 字段元数据表

```sql
CREATE TABLE table_columns (
    id              BIGSERIAL PRIMARY KEY,
    table_name      VARCHAR(64)  NOT NULL,
    column_code     VARCHAR(128) NOT NULL,  -- 源端字段名（如"工号"或"employee_id"）
    column_label    VARCHAR(128) NOT NULL,  -- 展示名
    data_type       VARCHAR(16)  NOT NULL DEFAULT 'string',
    is_pk_part      BOOLEAN      NOT NULL DEFAULT false,
    is_sensitive    BOOLEAN      NOT NULL DEFAULT false,
    is_visible      BOOLEAN      NOT NULL DEFAULT true,
    display_order   INTEGER      NOT NULL DEFAULT 999,
    auto_discovered BOOLEAN      NOT NULL DEFAULT true,
    description     TEXT,
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ  NOT NULL DEFAULT now(),
    UNIQUE (table_name, column_code)
);
CREATE INDEX ix_table_col_table_order ON table_columns(table_name, display_order);
```

## 同步流程详解

### 入口：`POST /api/v1/datasources/{id}/sync`

```python
# datasources/router.py::sync_datasource
async def sync_datasource(ds_id):
    ds = await db.get(DataSource, ds_id)
    secrets = _decrypt_secrets(ds)
    rows_inserted, message = await sync_to_table(
        ds.table_name, ds.source_type, ds.settings, secrets, db
    )
    # 同步运行记录写入 sync_runs，更新 ds.last_sync_at/last_status/last_rows
```

### 拉数据：客户端工厂

```python
# datasources/beisen_client.py
def make_client(source_type, settings, secrets):
    if source_type == "beisen_report":  return BeisenReportClient(settings, secrets)
    if source_type == "beisen_api":      return BeisenApiClient(settings, secrets)
    if source_type == "http_generic":    return HttpGenericClient(settings, secrets)
    raise RuntimeError(...)
```

每个 Client 必须实现以下两个方法之一：

- `get_grid_data() -> list[dict]`（北森报表）
- `fetch() -> list[dict]`（其他通用源）

返回的 list[dict] 中，每个 dict 是一行原始数据，key 是源端字段名（如"工号" `工号`）。

### 自动发现字段

```python
# datasources/sync_service.py::_ensure_columns
async def _ensure_columns(table_name, sample_row, db):
    existing = {已注册的 column_code 集合}
    for key, val in sample_row.items():
        if key not in existing:
            db.add(TableColumn(
                table_name=table_name,
                column_code=key,
                column_label=key,           # 默认中文名 = 源端 key，管理员可改
                data_type=_guess_data_type(val),  # 智能推断：date/datetime/number/bool/string
                auto_discovered=True,
                display_order=max_order + 10,
            ))
```

`_guess_data_type` 规则：
- `bool` 类型 → `bool`
- `int` / `float` → `number`
- 字符串能 parse 成 `YYYY-MM-DD` → `date`
- 字符串能 parse 成 `YYYY-MM-DD HH:MM:SS` → `datetime`
- 字符串能 `float()` → `number`
- 否则 → `string`

### 业务主键计算

```python
# datasources/sync_service.py::_calc_pk_hash
async def _get_pk_columns(table_name, db):
    return [c for c in table_columns where is_pk_part = true]

def _calc_pk_hash(row, pk_columns):
    if pk_columns:
        material = "||".join(str(row.get(c, "")) for c in pk_columns)
    else:
        material = json.dumps(row, sort_keys=True, ensure_ascii=False)
    return sha256(material).hexdigest()[:32]
```

**关键设计**：
- 没设 PK 列时，pk_hash = 整行 JSON 的 hash → 同一行内容**多次拉取去重**，但任何字段变化都视为新行
- 设了 PK 列时，pk_hash = PK 字段值的 hash → **跨次同步幂等 upsert**

### Upsert

```python
# datasources/sync_service.py::_dynamic_upsert
stmt = pg_insert(Model).values(payload)
stmt = stmt.on_conflict_do_update(
    index_elements=["pk_hash"],
    set_={"raw": stmt.excluded.raw, "synced_at": stmt.excluded.synced_at},
)
```

`raw` 字段每次同步**整行覆盖**，所以源端某行某字段从有值变 null 也会被正确反映。

## 查询流程详解

### 入口：`GET /api/v1/data/{table}?page=1&page_size=20&keyword=xxx`

```python
# data/router.py::query_table
visible_cols = await _get_columns(table, db, only_visible=True)
col_codes = [c.column_code for c in visible_cols]

# 关键字搜索：跨所有可见列做 ILIKE
if keyword:
    conds = [Model.raw[code].astext.ilike(f"%{keyword}%") for code in col_codes]
    stmt = stmt.where(or_(*conds))

# 拼装：每行按可见列展开
items = [
    {code: r.raw.get(code) for code in col_codes} | {"_id": r.id, "_synced_at": r.synced_at.isoformat()}
    for r in rows
]
```

PostgreSQL 的 JSONB GIN 索引保证 `raw->>'key' ILIKE '%kw%'` 性能在百万行规模仍然亚秒级。

### 字段元数据：`GET /api/v1/data/{table}/columns`

返回该表所有 `is_visible=true` 的字段，按 `display_order` 排序。前端拿到后 v-for 渲染列。

字段是否敏感由两处合并决定：
- `table_columns.is_sensitive`（管理员手动标）
- `field_categories` 关联了该字段且 `is_sensitive=true`（继承字段分类的敏感属性）

## 字段管理 UI

`/system/field-columns` 页面：

- 表选择器（5 张业务表）
- 列定义表格（每行一个字段）：
  - 字段编码（源端 key，只读）
  - 字段名称（可改）
  - 数据类型（5 选 1）
  - 业务主键开关
  - 敏感开关
  - 显示开关
  - 显示顺序（数字 + 上下移动按钮）
  - 删除按钮
- 「+ 新增字段」对话框（手动加源端没有的字段）
- 「保存所有修改」批量提交

## 何时需要写代码

| 操作 | 改代码？ |
|---|---|
| 新接入数据源类型（飞书 / SAP / Salesforce） | 是：dataSources.ts + 新 Client 类 |
| 加新业务表（如考勤月度） | 是：data/models.py + DATA_TABLES 注册 + migration |
| 加字段 / 改字段名 / 改类型 / 改顺序 / 标敏感 / 调整 PK | **否，UI 操作即可** |
| 业务表 schema 重构（如分片、加 tenant_id） | 是：migration |
| 单纯接入新 Report ID | 否，到接口配置页改 settings |

## 已知限制

1. **关键字搜索性能**：跨所有列 ILIKE 在 raw JSON 上，行数巨大时（>百万）会慢，需要时上 GIN trigram 索引或拆专用搜索字段
2. **类型校验弱**：`raw` 里 `123` 和 `"123"` 都接受；强校验需要在 `_dynamic_upsert` 里按 `data_type` 转换并存回 raw
3. **历史 schema 演进**：管理员把字段 PK 标志改了之后，老数据的 pk_hash 还是按老规则算的，要 `TRUNCATE` 重新拉
4. **Tree 类数据特殊处理**：成本中心树同步走专用 `_sync_cc_tree`，不走动态列（树形数据有专属 schema）

## 文件索引

- 业务表 ORM：`backend/app/data/models.py`
- 元数据 ORM（同上文件）
- 同步服务：`backend/app/datasources/sync_service.py`
- 北森客户端：`backend/app/datasources/beisen_client.py`
- 数据查询路由：`backend/app/data/router.py`
- 字段管理路由：`backend/app/data/columns_router.py`
- 数据源 CRUD/test/sync：`backend/app/datasources/router.py`
- 凭证加密：`backend/app/core/secret_box.py`
- 前端数据视图：`frontend/src/views/data/DataTableView.vue`
- 前端字段管理：`frontend/src/views/system/FieldColumns.vue`
- 前端接入配置：`frontend/src/views/datasource/Endpoints.vue`
- 数据源类型注册：`frontend/src/config/dataSources.ts`
- migration：`backend/alembic/versions/0003_phase4_data_layer.py`、`0004_c1_dynamic_columns.py`

## Phase 5 / 6 接入点

- **Phase 5（管理单元 / 数据范围）**：在 `_dynamic_upsert` 之后、查询时按 `is_pk_part` 列做范围过滤；管理单元定义指向 `cost_center_tree` / `org_tree` 节点
- **Phase 6（数据集 / 报表向导）**：报表向导第一步选数据集 = 选一个或多个业务表 + 配 JOIN；第二步选维度/度量从 `table_columns` 元数据取，所有字段都能选
