# X05 多粒度时间下钻 · 两期实现设计（按月份展开 + 钻取）

> 归属：`specs/012-data-warehouse-ucp-integration/`
> 关联：`auto-cascade-plan.md` §X05（行 750–788，多粒度时间下钻）、`metric-result-olap-roadmap.md` §7（Phase 4 OLAP/透视，可选）
> 状态：**实施验收文档 v3.0（代码现状同步版）** — 后端基座已落地并通过真库测试，前端表单入口待补齐，二期 API 待另起细化文档
> 最后更新：2026-07-16

---

## 0. 文档状态总览（三层分层）

| 层级 | 状态 | 范围 | 说明 |
|---|---|---|---|
| **L1 已落地并通过核验** | ✅ 代码已实现 + 真库测试通过 | 迁移 0100 / models.py / schemas.py / modeling.py generate_dws_view / 集成测试 5 场景 | 详见 §3、§5.1；测试通过记录见 §5.4 验收栏 |
| **L2 一期仍需补齐/验收** | ⬜ 待开发或待用户环境验证 | 前端 time_field/measure_semantics 表单入口 / FineBI 推送配置 / 用户场景 DWS 聚合构造 / 代码提交合并 | 详见 §5.4 待办栏 |
| **L3 二期待设计** | 📋 概念设计，需另起 API 细化文档 | DWS 钻取查询 API / 报表设计器时间层次 UI / 转置复用 | 详见 §6；当前 §6 仅为方向性设计，不足以直接作为开发依据 |

---

## 1. 背景与目标

### 1.1 用户场景
- **维度**：三级部位 BU、公司级组织、一级部门（来自维度管理，已绑定 DWD 员工表字段）。
- **指标**：正式员工人数、实习生人数。理想形态收敛为 **1 个指标「员工人数」+ 1 个维度「员工类型」**（方案 A 已验证计算内核支持：单指标 + 多 `group_by` 一次算全量行）。
- **核心诉求**：① 在一个视图里按月份展开；② 支持年 → 季 → 月逐级钻取。
- **数据底座**：用户自建 `dwd_emp_month_snapshot`（月末在职快照事实表）。**本期不讨论该表建模**，默认它已存在且含 `snapshot_month`（DATE 或 ISO 日期串）与组织/员工类型字段。

### 1.2 目标
1. **短期（一期）**：用现有帆软（FineBI）满足"按月份展开 + 钻取"的业务需求。
2. **长期（二期）**：在 HR portal 内自建轻量钻取，解除对外部 BI 的依赖，保证产品自助分析拓展性。

### 1.3 设计原则
- **周期是指标消费端的参数，不是指标定义的属性**（X05 原教旨）——数仓只负责把 `year/quarter/month` 三列算出来，钻取交给消费层。
- **两期共用同一后端基座（时间列派生）**：一期建好、二期复用。

---

## 2. 范围与边界

| 项 | 是否本期范围 | 说明 |
|---|---|---|
| 时间列派生（`year/quarter/month` + 保留 `snapshot_month`） | ✅ **已落地** | L1，详见 §5.1 |
| `time_field` / `measure_semantics` 字段定义与迁移 | ✅ **已落地** | L1，迁移 0100 已创建 |
| 前端 `time_field` / `measure_semantics` 表单入口 | ✅ **待补齐** | L2，后端 API 已支持，前端表单缺 |
| 帆软（FineBI）钻取配置 | ✅ 待配置 | L2，复用现有推送通道 |
| portal 内自建钻取 | ✅ **待设计** | L3，需另起 API 细化文档 |
| `dwd_emp_month_snapshot` 建模 | ❌ | 用户自理，不讨论 |
| **FineBI `finebi_` 推送通道改造** | ❌ | **保持现有公用组件，不修改**（详见 §5.2） |
| 跨指标汇总/透视（Phase 4 OLAP） | ❌ | 不在本设计范围（见 §9 备注） |

---

## 3. 代码现状核实（事实基线 · v3.0 已同步）

> 以下为 **2026-07-16 核实的真实代码事实**，已反映一期后端基座的落地状态。

### 3.1 已落地代码（L1）

| 事实 | 位置 | 状态 |
|---|---|---|
| `DwsAggregateDefinition` 已含 `time_field` + `measure_semantics` 字段 | `backend/app/warehouse/models.py:324-325` | ✅ 已落地 |
| Alembic 迁移 `0100_add_dws_timefields` 已创建 | `backend/alembic/versions/0100_add_dws_timefields.py` | ✅ 已落地（down_revision=0099） |
| Pydantic schemas 已含 `time_field` / `measure_semantics` | `backend/app/warehouse/schemas.py:1009-1010, 1023-1024, 1037-1038` | ✅ 已落地（CreateIn/UpdateIn/Out 三处） |
| `generate_dws_view` 已实现 time_field 解析 + 派生列注入 + R7 校验 | `backend/app/warehouse/service/modeling.py:919-1125` | ✅ 已落地（详见 §5.1） |
| 派生列注册 `TableColumn` 受 `time_select_exprs` 非空保护 | `modeling.py:1100-1104` | ✅ 已落地（未配 time_field 不注册） |
| `output_fields` 返回值同步追加时间列 | `modeling.py:1124-1125` | ✅ 已落地（受 time_select_exprs 保护） |
| 序列化 list/get/create/update 包含 time_field + measure_semantics | `modeling.py:649, 656, 686, 699` | ✅ 已落地 |
| 集成测试 `test_x05_time_drilldown_acceptance.py` 已创建 | `backend/tests/test_x05_time_drilldown_acceptance.py` | ✅ 已落地（5 场景 A-E） |
| DWS 视图生成后**自动注册为 DWS 数据集** | `modeling.py:950` `DataSet(..., warehouse_layer="DWS", status="published")` | ✅ 已有（portal 内钻取零额外注册代码） |
| 报表设计器只过滤 `DWD/DWS` 数据集 | `frontend/src/views/report/ReportDesigner.vue:170` | ✅ 已有 |
| 行转列透视组件已存在 | `frontend/.../ReportTransposeConfig.vue` | ✅ 已有（二期可复用） |

### 3.2 待补齐代码（L2）

| 事实 | 位置 | 状态 |
|---|---|---|
| 前端 DWS 聚合表单**无 `time_field` 配置入口** | `frontend/src/views/warehouse/WarehouseDwsAggregate.vue` | ⬜ 待补齐（后端 API 已支持） |
| 前端 DWS 聚合表单**无 `measure_semantics` 配置入口** | 同上 | ⬜ 待补齐 |
| `time_grain` 字段仅列表展示，无表单编辑 | `WarehouseDwsAggregate.vue:124, 241` | ⬜ 现有，不影响功能（time_grain 不被读取） |

### 3.3 FineBI 推送通道实际机制（事实修正）

> ⚠️ **v2.x 文档中描述为"CREATE TABLE … AS SELECT * FROM view"是错误的。** 以下为实际代码核实结果。

`push_db_expose`（`push_service.py:707-897`）的实际机制：

| 步骤 | 代码位置 | 实际行为 |
|---|---|---|
| 1. DROP 旧表 | `push_service.py:797` | `DROP TABLE IF EXISTS {schema}.{finebi_table}` |
| 2. **CREATE TABLE（显式列定义）** | `push_service.py:799-801` | `CREATE TABLE {schema}.{finebi_table} (id BIGINT, synced_at TIMESTAMPTZ, {cols_def})` — **显式列出每一列**，非 `AS SELECT *` |
| 3a. 报表来源：逐行 INSERT | `push_service.py:802-811` | 先 `_load_source_rows` 取数，再逐行 `INSERT INTO ... VALUES (...)` |
| 3b. 非报表来源：INSERT...SELECT | `push_service.py:813-817` | `INSERT INTO {schema}.{table} (id, synced_at, {cols}) SELECT id, synced_at, {cols} FROM public.{source_table}` |
| 4. 创建同名 VIEW | `push_service.py:820-822` | `CREATE OR REPLACE VIEW {schema}.{view} AS SELECT * FROM {schema}.{finebi_table}` — VIEW 用 `SELECT *`，但 FROM 的是 finebi 物理表，不是 DWS 视图 |
| 5. 授权只读账号 | `push_service.py:825-852` | 创建/更新只读角色，GRANT SELECT |
| 6. 回写 PushTarget | `push_service.py:863-894` | 连接信息写回 PushTarget.settings |

**关键含义**：finebi 物理表的列结构在步骤 2 由 `cols_def` 显式定义，是推送时的**结构快照**。DWS 视图加列后，如果不重新执行推送，`cols_def` 不会包含新列，finebi 物理表也不会有新列。

### 3.4 sync_service 自动刷新触发条件（事实修正）

> ⚠️ **v2.x 文档中描述为"仅在 DWD 源表同步后触发"是过窄的。** 以下为实际代码核实结果。

`sync_service.py:1280-1296` 的实际逻辑：

```python
# 同步完成后自动刷新该表关联的 db_expose finebi 物理表
pts = (await db.execute(
    sa_select(PushTarget).where(
        PushTarget.source_table == table_name,   # 任意源表，不限定 DWD
        PushTarget.push_type == "db_expose",
        PushTarget.is_active.is_(True),
    )
)).scalars().all()
for pt in pts:
    await execute_push(pt.id, db)
```

**实际触发条件**：**任意源表同步操作完成后**，查找与该 `table_name` 关联的所有活跃 `db_expose` 类型 PushTarget，逐个执行 `execute_push` 刷新。不限定 DWD 层——任何被同步的表只要有对应的 db_expose 推送配置都会触发。

**R6 的真正问题**：`generate_dws_view` 重建/更新 DWS 视图时**完全不调用 sync_service 或 execute_push**。视图结构变化（如新增 year/quarter/month 列）不会触发任何 FineBI 刷新。sync_service 的自动刷新只在"源表数据同步"这一动作后触发，而 DWS 视图重建是另一个独立的操作入口。

---

## 4. 总体架构：两期分期与共享基座

```
                 ┌──────────────────────────────────────────────────────┐
                 │  共享后端基座 ✅ 已落地                                │
                 │  • DwsAggregateDefinition: time_field + measure_semantics│
                 │  • generate_dws_view: 派生 year/quarter/month + 保留    │
                 │    snapshot_month 原始列 + TableColumn 注册            │
                 │  • time_field 经 DatasetOutputField 解析为 alias.column │
                 │  • R7 三阶段脏值校验（正则 + ::date cast）              │
                 └──────────────────────────────────────────────────────┘
                    │                                            │
        ┌───────────┴────────────┐              ┌────────────────┴────────────┐
        │  一期（方案 B · 帆软）   │              │  二期（方案 A · portal）     │
        │  FineBI 原生年/季/月钻取 │              │  portal 内自建钻取交互        │
        │  复用 finebi_ 推送通道   │              │  新增 DWS 钻取查询 API        │
        │  （公用组件，不改）       │              │  报表设计器时间层次 UI        │
        │  ⬜ 前端表单 + 帆软配置  │              │  📋 需另起 API 细化文档       │
        └────────────────────────┘              └─────────────────────────────┘
```

**为何分期正确**：时间列派生是两种消费端（帆软 / portal）共同依赖的硬前置——帆软没有年/季/月列就无法下钻，portal 钻取 API 同样读这几列。把它放在一期一次性建成，二期只剩消费端交互，成本骤降，且两期无重复建设。

---

## 5. 一期（方案 B：帆软钻取）

### 5.1 后端：时间列派生（✅ 已落地 · 共享基座）

> 本节原为设计要求，现升级为**已落地代码的验收核验记录**。设计意图保留但标注实现状态。

#### 5.1.0 字段定义与迁移（✅ 已落地）

`DwsAggregateDefinition`（`models.py:324-325`）已含两列，迁移 `0100_add_dws_timefields.py` 已创建：

```python
# models.py:324 — 已落地
time_field = Column(String(128), nullable=True,
                    comment="时间/期次字段 output_code（如 snapshot_month）；generate_dws_view 据此自动派生 year/quarter/month")

# models.py:325 — 已落地
measure_semantics = Column(String(16), nullable=True,
                           comment="度量语义: stock(存量/期末值) | flow(流量/可SUM)。NULL 按 flow 处理")
```

- **迁移**：`backend/alembic/versions/0100_add_dws_timefields.py`（revision=0100, down_revision=0099）✅
- **Schemas**：`schemas.py` CreateIn/UpdateIn/Out 三处均已含 `time_field` + `measure_semantics` ✅
- **`time_grain` 的处置**：现有 `time_grain`（`models.py:323`）**不被 `generate_dws_view` 读取**，本设计不改其语义、不做数据迁移——派生完全由 `time_field` 驱动；`time_grain` 仅作为描述性标签保留。

#### 5.1.1 `time_field` 取值格式与解析路径（✅ 已落地）

- **存储格式**：`time_field` 存 **`output_code`**（如 `snapshot_month`），不是 `alias.column` 裸串。
- **解析路径**：与维度完全一致——查 `DatasetOutputField`，取 `source_alias.source_column`，拼成 `"alias"."snapshot_month"`。
- **实现位置**：`modeling.py:919-941`，已实现完整的解析逻辑（含兜底直接当列名）。

```python
# modeling.py:919-941 — 已落地
# 查 DatasetOutputField → 解析为 alias.column（与维度同路径）
# 兜底：找不到则直接当列名 Q(agg.time_field)
```

#### 5.1.2 `time_field` 与 `group_by` 的交互（✅ 已落地）

- **规则**：`time_field` 指定的源列**不得同时出现在 `group_by` 中**。
- **实现位置**：`modeling.py:1010`，已实现跳过逻辑——**比对映射后的真实列名**（`dim_col_name`），而非维度编码本身。
- **关键细节**：`group_by` 存储的是维度编码（如 `dept_it_turn`），跳过判定发生在「维度编码 → `dim_col_name` 映射得到真实列名」之后。

#### 5.1.3 注入派生列 + 保留原始列 + R7 校验（✅ 已落地）

`modeling.py:1019-1038` 已实现：

```sql
-- SELECT 追加（已落地）
{time_expr}                              AS "snapshot_month",   -- 原始期次列，drill-through 排序用
EXTRACT(YEAR   FROM ({time_expr})::date)::int  AS year,
to_char(({time_expr})::date, 'YYYY-"Q"Q')      AS quarter,   -- 产出 2026-Q3
to_char(({time_expr})::date, 'YYYY-MM')        AS month,
```

> **季度格式**：`to_char(T, 'YYYY-Q')` 在 PostgreSQL 产出 `2026-3`；必须写为 `to_char(T, 'YYYY-"Q"Q')`。已正确实现。

> **防御性 `::date` 强转**：实现中对 `time_expr` 包裹了 `::date`，兼容 ISO 字符串列（varchar 存 `2026-03-01`）。

**R7 三阶段校验**（`modeling.py:944-1010`，已落地）：

| 阶段 | 校验内容 | 实现 |
|---|---|---|
| ① 列类型校验 | 查 `information_schema.columns` 获取 `data_type` | 原生 `date/timestamp/time` 直接放行；`varchar/text/char` 进第 2 步；其余类型抛明确 `ValueError` |
| ② 正则全量扫描 | `SELECT {time_expr}::text FROM {from_table} WHERE {time_expr} IS NOT NULL AND {time_expr}::text !~ :iso_re LIMIT 1` | 捕获 `2026年7月` / `202607` / 空串等格式错误；与行顺序无关、覆盖整列 |
| ③ `::date` cast 全量扫描 | `SELECT ({time_expr})::date FROM {from_table} WHERE {time_expr} IS NOT NULL` | 捕获 `2026-99-01` / `2026-02-31` 等"正则通过但日期无效"的值 |

**DWS 视图产出形态**：
```
snapshot_month | dept | emp_type | year | quarter | month | headcount
```

#### 5.1.4 注册派生列为 `TableColumn` + `output_fields` 同步（✅ 已落地）

- **TableColumn 注册**：`modeling.py:1100-1104`，受 `if time_select_exprs:` 保护——未配 `time_field` 的普通 DWS 不注册时间列。
- **`output_fields` 追加**：`modeling.py:1124-1125`，同样受 `if time_select_exprs:` 保护。
- **含义**：普通 DWS 聚合（未配 time_field）的元数据不会谎称有时间列，避免"元数据有列但视图无列"的下游错误。

#### 5.1.5 集成测试（✅ 已落地，5 场景）

`backend/tests/test_x05_time_drilldown_acceptance.py`，含 5 个测试场景：

| 场景 | 描述 | 验证点 |
|---|---|---|
| A | 未配 `time_field` 不注册时间列 | 防止"元数据有列但视图无列"回归；额外断言 `len(cols) > 0` 防假验收 |
| B | DATE 列生成 4 时间列且值正确 | `year=2026 quarter=2026-Q3 month=2026-07` |
| C | `group_by` 含同源时间维度自动跳过 | 无重复列 |
| D | 字符串脏值（首行合法、后续 `2026年7月`/`202607`）全量扫描抛明确错误 | 正则扫描捕获 |
| E | 格式合规但日期无效（`2026-99-01`）cast 扫描捕获 | `::date` cast 捕获 ValueError |

> **测试运行方式**：需在 Docker 容器内执行（依赖 Postgres + asyncpg）：
> ```bash
> docker exec hr-portal-backend python -m pytest tests/test_x05_time_drilldown_acceptance.py -p no:cacheprovider
> ```
> **测试命名规则**（写入文件 docstring）：DB 视图名 = `agg.name`（非 `dws_` 前缀），返回值 `view_name` = `ds_{agg.name}`（数据集编码）。

### 5.2 FineBI 推送（**复用现有 `finebi_` 通道，不修改**）

> **约束**：`finebi_` 推送是公用组件，**保持现有实现，本期不改造**。仅作为"现有通道"在消费侧引用。

**实际机制**（详见 §3.3）：`push_db_expose` 先 `CREATE TABLE`（显式列定义）再 `INSERT`（逐行或 INSERT...SELECT），最后创建同名 VIEW。物理表列结构是推送时的结构快照。

一期消费侧动作（**配置，非开发**）：
1. 将带时间派生的 DWS 聚合视图通过现有推送通道发布到 `finebi_` schema。
2. 帆软侧：基于 `year/quarter/month` 三列**定义时间层次**（年 → 季 → 月）。
3. 帆软侧：将「员工人数」度量聚合方式设为 **「期末值 / 最后值」**（关键，见 §5.3）。

> ⚠️ **DWS 视图结构变更后必须重推（R6 操作项）**：`generate_dws_view` 重建视图（加了年/季/月列）**不会**自动刷新 `finebi_` 物理表——`generate_dws_view` 不调用 `sync_service` 或 `execute_push`（详见 §3.4）。而 `sync_service` 的自动刷新只在**源表数据同步**后触发，不监听 DWS 视图结构变化。因此**每次 DWS 视图加列/改结构后，必须手动重新执行一次该 DWS 视图对应的推送（execute_push）**，finebi 物理表的 `cols_def` 才会包含新列。已写入 §5.4 操作项。

### 5.3 ⚠️ 存量 / 流量陷阱（一期必须处理）

- **流量指标**（成本、入职数、离职数）：钻取 = 跨月 **SUM** 重聚合 → 正确。
- **存量指标**（在职人数 headcount）：**月末在职不能跨月求和**。季度/年度人数应是该季/年末那个月的快照值，而非 3/12 个月相加。
- **后果**：若帆软对 headcount 用默认 SUM，季度人数会变成"1~3月累加"，**数值 silently 错**。
- **一期对策**：
  - 帆软侧把 headcount 度量聚合显式配为"期末值/最后值"；
  - 数据库中 `measure_semantics` 标为 `stock`（字段已落地 §5.1.0），为二期 portal 钻取 API 的语义分支预留依据；
  - 钻取形态建议做成 **drill-through（展开看每月快照）** 而非"汇总成季度总数"（与二期一致）。

### 5.4 一期验收与待办清单

#### ✅ 已完成项（L1 · 代码已落地）

| # | 交付物 | 核验状态 |
|---|---|---|
| 1 | Alembic 迁移 `0100_add_dws_timefields`：`time_field` + `measure_semantics` | ✅ 文件存在，revision=0100, down_revision=0099 |
| 2 | `models.py` 字段定义 | ✅ L324-325 |
| 3 | `schemas.py` CreateIn/UpdateIn/Out | ✅ L1009-1010, 1023-1024, 1037-1038 |
| 4 | `generate_dws_view` time_field 解析 + 派生列注入 + GROUP BY | ✅ modeling.py:919-1038 |
| 5 | `group_by` 跳过 time_field 源列 | ✅ modeling.py:1010 |
| 6 | R7 三阶段校验（类型 + 正则 + cast） | ✅ modeling.py:944-1010 |
| 7 | TableColumn 注册受 `time_select_exprs` 保护 | ✅ modeling.py:1100-1104 |
| 8 | `output_fields` 同步追加受保护 | ✅ modeling.py:1124-1125 |
| 9 | 序列化含 time_field + measure_semantics | ✅ modeling.py:649,656,686,699 |
| 10 | 集成测试 5 场景 | ✅ test_x05_time_drilldown_acceptance.py |

#### ⬜ 待办项（L2 · 待开发或待用户环境验证）

| # | 交付物 | 类型 | 前置依赖 |
|---|---|---|---|
| T1 | 前端 `WarehouseDwsAggregate.vue` 补 `time_field` 选择器 | 前端开发 | 后端 API 已就绪 |
| T2 | 前端 `WarehouseDwsAggregate.vue` 补 `measure_semantics` 选择器（stock/flow 下拉） | 前端开发 | 同上 |
| T3 | `alembic upgrade head` 在目标环境执行 | 环境准备 | 无 |
| T4 | 集成测试在 Docker Postgres 真库跑通（5 场景全 PASS） | 真库验证 | T3 |
| T5 | 代码提交 + 合并（当前未提交、未合并） | Git | T4 通过 |
| T6 | 用户场景 DWS 聚合构造：`group_by=[三级部位BU, 公司级组织, 一级部门, 员工类型]`，`time_field=snapshot_month`，`measure_semantics=stock` | 配置 | T1-T2 |
| T7 | FineBI 推送通道发布该 DWS 视图 | 配置 | T6 |
| T8 | **DWS 视图结构变更后手动重推 finebi_（R6 操作项）** | 操作 | T7 |
| T9 | 帆软侧：时间层次 + headcount 期末值配置 | 配置 | T8 |

---

## 6. 二期（方案 A：portal 内自建钻取）

> ⚠️ **当前 §6 仅为方向性概念设计，不足以直接作为开发依据。** 二期启动前需另起一份 API 细化文档，包含：请求/响应 JSON Schema、过滤条件 DSL、字段白名单、排序与分页规范、stock/flow 多度量处理规则、SQL 注入防护、权限边界、测试用例。

### 6.1 DWS 钻取查询 API（概念设计 · 待细化）

**建议端点**：`GET /warehouse/dws/{id}/drill`

| 参数 | 说明 | 待细化项 |
|---|---|---|
| `grain` | `year` / `quarter` / `month`，决定重聚合粒度 | — |
| `filters` | 组织维度 / 员工类型等过滤条件 | 需定义 DSL 格式、字段白名单、SQL 注入防护 |
| `time_bucket`（可选） | 已展开的层级值，用于 drill-through | 需定义格式与校验规则 |
| `page` / `page_size` | 分页 | 需定义默认值与上限 |
| `sort_by` / `sort_order` | 排序 | 需定义可排序字段白名单 |

**语义分支**（依赖一期 `measure_semantics`，已落地，无二期迁移负担）：

```sql
-- flow 度量：按所选粒度 SUM
SELECT <维度>,
       <grain 表达式> AS time_bucket,
       SUM(measure)  AS value
FROM dws_xxx
WHERE <filters>
GROUP BY <维度>, <grain 表达式>;

-- stock 度量：取期末值（该 time_bucket 内最新 snapshot_month 的值）
SELECT <维度>, time_bucket, measure AS value
FROM (
  SELECT <维度>,
         <grain 表达式> AS time_bucket,
         measure,
         ROW_NUMBER() OVER (PARTITION BY <维度>, <grain 表达式>
                            ORDER BY snapshot_month DESC) AS rn
  FROM dws_xxx WHERE <filters>
) t WHERE rn = 1;
```

> `<grain 表达式>` 同 §5.1.3。**drill-through**（stock 展开每月快照）：直接按 `time_bucket` 过滤回 month 级明细，不做重聚合。

### 6.2 前端时间层次 UI + 转置

- 报表设计器增加「时间层次」模式：grain 切换（年/季/月）或树形展开。el-table 树形/分组即可承载。
- 复用现有 `ReportTransposeConfig`（`pivot_col=员工类型` + `value_col=人数`）把正式/实习并排为列轴。
- 组合效果：行轴 = 组织维度 + 时间层次，列轴 = 员工类型。

### 6.3 复用一期基座

时间列（`year/quarter/month`）、原始 `snapshot_month`、`time_field` 解析、`measure_semantics` 全部来自一期（✅ 已落地），**二期无 DWS 视图结构迁移**，仅新增 API + 前端交互。

### 6.4 二期交付清单（📋 待另起文档细化）

- [ ] 另起 `x05-phase2-api-detail.md`：API 请求/响应 JSON Schema、过滤条件 DSL、字段白名单、stock/flow 多度量规则、权限边界、测试用例。
- [ ] 新增 DWS 钻取查询 API（grain + filters + 读 `measure_semantics` 走 stock/flow 分支）。
- [ ] 报表设计器时间层次 UI（grain 切换 / 树形展开）。
- [ ] 复用 `ReportTransposeConfig` 实现员工类型转列。

---

## 7. 风险与待确认

| # | 风险 | 对策 / 待确认 | 状态 |
|---|---|---|---|
| R1 | **存量指标在帆软被默认 SUM 导致数错** | 一期帆软侧显式配 headcount=期末值；二期 API 走 `measure_semantics=stock` 取期末 | 待配置 |
| R2 | 帆软是否连 `finebi_` schema | 确认帆软数据源指向现有推送通道产出的 `finebi_` schema | 待确认 |
| R3 | stock 度量"钻取"形态 | 建议 drill-through（展开每月快照）而非汇总成季度总数 | 设计建议 |
| R4 | `measure_semantics` 落地时机 | ✅ **已落地**（迁移 0100 + models.py + schemas.py） | 已解决 |
| R5 | 时间字段类型假设 | 派生 SQL 假设 `snapshot_month` 为 DATE/可解析 ISO 串 | 见 R7 |
| **R6** | **DWS 视图重建后 `finebi_` 物化表不自动刷新** | **根因修正**：`generate_dws_view` 不调用 `sync_service` 或 `execute_push`；`sync_service` 自动刷新在任意源表数据同步后触发（非仅 DWD），但不监听 DWS 视图结构变化。finebi 物理表列结构由 `CREATE TABLE` 显式定义（`cols_def`），是推送时快照。**每次 DWS 加列/改结构后，必须手动 `execute_push`**。已写入 §5.2 / §5.4-T8 | 待操作 |
| **R7** | **时间字段类型非日期 / 字符串内容不可解析** | ✅ **已落地**：三阶段校验——① `information_schema` 列类型校验；② 正则全量扫描（非抽样）捕获格式错误；③ `::date` cast 全量扫描捕获无效日期。详见 §5.1.3 | 已解决 |

---

## 8. 任务拆分与路线图落点

| 阶段 | 任务 | 类型 | 状态 | 备注 |
|---|---|---|---|---|
| 一期 | Alembic `0100`：`time_field` + `measure_semantics` | 后端 / 迁移 | ✅ | `time_grain` 不动、不迁移 |
| 一期 | `generate_dws_view`：time_field 解析 + 派生列 + R7 校验 | 后端 | ✅ | modeling.py:919-1125 |
| 一期 | 派生列注册 `TableColumn` + `output_fields` 同步 | 后端 | ✅ | 受 time_select_exprs 保护 |
| 一期 | 集成测试 5 场景 | 测试 | ✅ | test_x05_time_drilldown_acceptance.py |
| 一期 | 前端 time_field / measure_semantics 表单入口 | 前端 | ⬜ | 后端 API 已就绪 |
| 一期 | 帆软发布 DWS + 时间层次 + 期末值配置 + 重推 finebi_ | 配置 | ⬜ | 复用 finebi_ 通道 |
| 一期 | 代码提交合并 | Git | ⬜ | 当前未提交 |
| 二期 | DWS 钻取查询 API | 后端 / API | 📋 | 需另起 API 细化文档 |
| 二期 | 报表设计器时间层次 UI + 转置复用 | 前端 | 📋 | §6.2 |

**路线图归属**：本设计落地 X05「多粒度时间下钻」的数仓半（时间列派生，✅ 已落地）。"钻取交互"在一期为帆软消费（⬜ 待配置）、二期为 portal 自建（📋 待设计）；Phase 4 OLAP/透视（跨指标汇总）不在本范围。

---

## 9. 备注：与本仓库其他需求的关系

- **跨指标并排汇总**（用户最初需求①）：本设计通过「员工类型作维度 + 转置」在单个指标内解决，不进入 Phase 4 跨指标 join。若坚持"两个独立指标并排"，才需 Phase 4（另见 `x06-multi-measure-dws-wide-table.md` 和 `x07-ads-wide-table-assembly.md`）。
- **FineBI 通道**：始终作为公用组件，任何 DWS/ADS 资产均可复用，本设计不对其做改动。

---

## 10. 附录：已吸收的历史评审问题清单

> 以下为 v2.0 → v2.6 迭代过程中外部评审发现并已修复的问题，按类别归档。完整返修历史不再逐版本记录。

### 10.1 设计层问题（v2.0 评审，已吸收）

| # | 问题 | 修复 |
|---|---|---|
| 1 | `time_field` 解析路径与存储格式未明确 | 明确存 `output_code`，经 `DatasetOutputField` 解析为 `alias.column` |
| 2 | 季度 `to_char` 格式错误（`YYYY-Q` → `2026-3`） | 改为 `to_char(T, 'YYYY-"Q"Q')` → `2026-Q3` |
| 3 | `measure_semantics` 定位为"建议"有歧义 | 定为一期必做字段（已落地） |
| 4 | `time_grain` 语义未澄清 | 明确不被读取、不迁移，仅描述性保留 |
| 5 | `time_field` 与 `group_by` 互斥规则未定义 | 明确跳过逻辑：比对映射后的真实列名 |
| 6 | 视图未保留 `snapshot_month` 原始列 | 追加保留列，供 drill-through 排序用 |
| 7 | 缺 R6/R7 风险 | 新增并持续修正（见 §7） |

### 10.2 代码验收问题（v2.2-v2.6，已全部修复）

| 版本 | 严重度 | 问题 | 修复 |
|---|---|---|---|
| v2.2 | 高 | 时间列 TableColumn 注册未受保护，普通 DWS 元数据谎称有时间列 | 受 `time_select_exprs` 非空保护 |
| v2.2 | 中 | R7 仅按列类型放行 varchar，未验证内容可 `::date` | 升级为两阶段（类型 + 运行时 cast） |
| v2.3 | 中 | R7 用 LIMIT 1 抽样，首行合法后续脏值漏放 | 改为全量正则扫描 |
| v2.3 | 低 | 缺集成测试 | 新增 4 场景（A-D） |
| v2.4 | 中 | 正则通过但日期无效（`2026-99-01`）未捕获 | 追加 `::date` cast 全量扫描（场景 E） |
| v2.4 | 低 | 缺 pytest 标准入口 | 新增 `def test_...(): asyncio.run(main())` |
| v2.5 | 高 | 测试 teardown 视图名错误（`dws_x05_{tag}` vs `x05_{tag}`） | 统一为 `agg.name` |
| v2.5 | 中 | 场景 A 查错视图名返回空列表，断言恒成立 | 改为真实视图名 + `len(cols) > 0` |
| v2.6 | 高 | 测试清理不具备幂等性，残留视图阻塞新场景 | 新增 `_cleanup_before` 前置清理 |
| v2.6 | 中 | teardown 异常后未 rollback，事务污染后续清理 | except 块补 `await db.rollback()` |

### 10.3 v3.0 文档同步修正（本轮）

| 问题 | v2.x 描述（错误） | v3.0 修正 |
|---|---|---|
| 字段状态 | §3 说 `time_field` / `measure_semantics` 需新增 | 实际已存在于 models.py:324-325 + 迁移 0100 + schemas.py |
| FineBI 推送机制 | "CREATE TABLE … AS SELECT * FROM view" | 实际为 CREATE TABLE（显式列定义）+ INSERT + 创建同名 VIEW |
| sync_service 触发条件 | "仅在 DWD 源表同步后触发" | 实际为任意源表同步后触发（`PushTarget.source_table == table_name`），不限定 DWD |
| R6 根因 | "sync_service 不监听 DWS 视图变化" | 更准确：`generate_dws_view` 不调用 sync_service/execute_push；sync_service 触发条件是源表数据同步，非视图结构变更 |
| 文档状态 | "设计评审稿"（混杂 TODO 与已完成） | 三层状态分层（L1 已落地 / L2 待补齐 / L3 待设计） |
| 变更记录 | v2.1-v2.6 逐版本记录过长 | 归档为 §10 问题清单 |
| 二期 API | 概念设计直接作为开发依据 | 标注"需另起 API 细化文档" |
