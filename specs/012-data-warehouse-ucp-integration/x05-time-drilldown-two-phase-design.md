# X05 多粒度时间下钻 · 两期实现设计（按月份展开 + 钻取）

> 归属：`specs/012-data-warehouse-ucp-integration/`
> 关联：`auto-cascade-plan.md` §X05（行 750–788，多粒度时间下钻）、`metric-result-olap-roadmap.md` §7（Phase 4 OLAP/透视，可选）
> 状态：设计评审稿 v2.6（v2.5 基础上修复测试幂等性问题：新增 _cleanup_before 前置清理函数确保残留视图/表/元数据不阻塞场景启动；teardown 异常后 rollback 防止 InFailedSQLTransactionError 连续污染）
> 最后更新：2026-07-16

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
- **两期共用同一后端基座（时间列派生）**：一期建好、二期零返工。

---

## 2. 范围与边界

| 项 | 是否本期范围 | 说明 |
|---|---|---|
| 时间列派生（`year/quarter/month` + 保留 `snapshot_month`） | ✅ | 一期必做，二期复用 |
| `time_field` / `measure_semantics` 字段定义与迁移 | ✅ | 一期落地（详见 §5.1） |
| 帆软（FineBI）钻取配置 | ✅ | 一期消费端 |
| portal 内自建钻取 | ✅ | 二期消费端 |
| `dwd_emp_month_snapshot` 建模 | ❌ | 用户自理，不讨论 |
| **FineBI `finebi_` 推送通道改造** | ❌ | **保持现有公用组件，不修改**（详见 §5.2） |
| 跨指标汇总/透视（Phase 4 OLAP） | ❌ | 不在本设计范围（见 §9 备注） |

---

## 3. 代码现状核实（事实基线）

以下为评估时核实的真实代码事实，是设计的依据：

| 事实 | 位置 | 含义 |
|---|---|---|
| `DwsAggregateDefinition.time_grain` 字段存在但为空壳 | `backend/app/warehouse/models.py:323` | 模型无 `time_field` 配置位，无法锚定时间列 |
| `generate_dws_view` 全程不读 `time_grain`、不派生时间列 | `backend/app/warehouse/service/modeling.py:744–986` | DWS 视图不会自动出现年/季/月 |
| 维度字段通过 `DatasetOutputField` 解析为 `"alias"."source_column"` | `modeling.py:804–822`（含 line 816） | 时间字段必须走同一解析路径，否则 JOIN 场景歧义 |
| DWS 视图生成后**自动注册为 DWS 数据集** | `modeling.py:950` `DataSet(..., warehouse_layer="DWS", status="published")` | portal 内钻取零额外注册代码 |
| 报表设计器只过滤 `DWD/DWS` 数据集 | `frontend/src/views/report/ReportDesigner.vue:170` | DWS 聚合视图天然可被报表设计器读取 |
| **FineBI 推送通道已存在**（物化到 `finebi_` schema + 只读账号 + JDBC URL） | `backend/app/push/push_service.py:736–897`（CREATE TABLE … AS SELECT *，line 799） | 一期帆软钻取有现成 conduit |
| 同步后自动刷新 finebi 物理表 | `backend/app/datasources/sync_service.py:1280` | **触发条件是 DWD 源表同步后**，非 DWS 视图结构变更后（见 R6） |
| 行转列透视组件已存在 | `frontend/.../ReportTransposeConfig.vue`（`pivot_col`/`row_to_column`） | 二期「员工类型」转列可复用 |
| 指标结果页 `WarehouseMetrics.vue` 为平铺明细表 | 前端 | 无原生转置/钻取（二期不在此处做） |

---

## 4. 总体架构：两期分期与共享基座

```
                 ┌──────────────────────────────────────────────────────┐
                 │  共享后端基座（一期建成，二期复用，零返工）              │
                 │  • DwsAggregateDefinition: time_field + measure_semantics│
                 │  • generate_dws_view: 派生 year/quarter/month + 保留    │
                 │    snapshot_month 原始列 + TableColumn 注册            │
                 │  • time_field 经 DatasetOutputField 解析为 alias.column │
                 └──────────────────────────────────────────────────────┘
                    │                                            │
        ┌───────────┴────────────┐              ┌────────────────┴────────────┐
        │  一期（方案 B · 帆软）   │              │  二期（方案 A · portal）     │
        │  FineBI 原生年/季/月钻取 │              │  portal 内自建钻取交互        │
        │  复用 finebi_ 推送通道   │              │  新增 DWS 钻取查询 API        │
        │  （公用组件，不改）       │              │  报表设计器时间层次 UI        │
        └────────────────────────┘              └─────────────────────────────┘
```

**为何分期正确**：时间列派生是两种消费端（帆软 / portal）共同依赖的硬前置——帆软没有年/季/月列就无法下钻，portal 钻取 API 同样读这几列。把它放在一期一次性建成，二期只剩消费端交互，成本骤降，且两期无重复建设。

---

## 5. 一期（方案 B：帆软钻取）

### 5.1 后端：时间列派生（必做 · 共享基座）

> ⚠️ 这是一期真正的后端交付物。**"丢给帆软就完事"是错误的**——帆软无法自建年/季/月层次，必须数仓先产出这几列。

#### 5.1.0 新增字段定义（必须，消除"建议"歧义）

在 `DwsAggregateDefinition`（`models.py:323` 附近）新增两列，**同时给出 Alembic 迁移（建议编号 `0100_add_dws_timefields`）**：

```python
# 时间字段锚点：存 DatasetOutputField 的 output_code（如 'snapshot_month'），
# 后端经 DatasetOutputField 解析为 "alias"."source_column"（与维度同路径）。
time_field = Column(String(128), nullable=True,
                    comment="时间/期次字段 output_code，如 snapshot_month；用于自动派生 year/quarter/month")

# 度量语义：决定钻取时走 SUM（flow）还是取期末值（stock）。
# NULL 视为 flow（安全默认，可累加）；存量指标（headcount）必须显式标 stock。
measure_semantics = Column(String(16), nullable=True,
                           comment="度量语义: stock(存量/期末值) | flow(流量/可SUM)。NULL 按 flow 处理")
```

> **`time_grain` 的处置（回应评估 #4）**：现有 `time_grain`（`models.py:323`，取值 day/week/month/quarter/year）**当前不被 `generate_dws_view` 读取**（空壳）。本设计**不改其语义、不做数据迁移**——派生完全由新增的 `time_field` 驱动；`time_grain` 仅作为"存储最细粒度"的描述性标签保留。因视图生成从不读它，现有聚合定义的 `time_grain` 取值无需迁移，也不会造成新旧语义并存的功能混乱。

#### 5.1.1 `time_field` 取值格式与解析路径（回应评估 #1）

- **存储格式**：`time_field` 存 **`output_code`**（如 `snapshot_month`），**不是** `alias.column` 裸串。
- **解析路径**：必须与维度完全一致——查 `DatasetOutputField`（`dataset_id = agg.source_dataset_id`，`output_code == time_field` 或 `source_column == time_field`），取 `source_alias.source_column`，拼成 `"alias"."snapshot_month"`。
- **为何必须如此**：`generate_dws_view` 的 FROM 子句在多表数据集下是显式 JOIN（`modeling.py:855–914`），裸列名会歧义；维度已用此路径（`modeling.py:804–822`），时间字段复用同逻辑。

```python
# 解析 time_field（与维度循环同构，modeling.py:804-822）
dof_t = (await self.session.execute(select(DatasetOutputField).where(
    DatasetOutputField.dataset_id == agg.source_dataset_id,
    (DatasetOutputField.output_code == agg.time_field)
    | (DatasetOutputField.source_column == agg.time_field),
))).scalars().first()
if dof_t and dof_t.source_column and dof_t.source_alias:
    time_expr = f"{Q(dof_t.source_alias)}.{Q(dof_t.source_column)}"
else:
    time_expr = Q(agg.time_field)   # 兜底：直接当列名
```

#### 5.1.2 `time_field` 与 `group_by` 的交互（回应评估 #5）

- **规则**：`time_field` 指定的源列**不得同时出现在 `group_by` 中**。派生时间列（`year/quarter/month`）+ 保留原始 `snapshot_month` 已完整覆盖时间维度，再把 `snapshot_month` 放进 `group_by` 会产生重复列。
- **实现保证**：在遍历 `expanded_group_by` 构建维度 SELECT/GROUP BY 时（modeling.py:803–824），**跳过 `time_field` 解析出的 `source_column` / `output_code`**；时间相关列统一由 §5.1.3 单独注入。
- **比对对象澄清（防开发踩坑）**：`group_by` 存储的是**维度编码**（如 `dept_it_turn`），**并非** `output_code`。实际实现时，必须**先解析 `time_field` → `DatasetOutputField.output_code` → 再与该编码经 `dim_col_name` 映射后的真实列名比对**，而不是直接拿 `time_field` 原始值去和 `expanded_group_by` 里的维度编码比较。换言之，跳过判定发生在「维度编码 → `dim_col_name` 映射得到真实列名」这一步之后——比对对象是映射后的 `dim_col_name` 值，而非维度编码本身。
- **用户约定**：配置 DWS 聚合时，时间字段只填 `time_field`，不要再把它加进 `group_by` 维度列表。

#### 5.1.3 注入派生列 + 保留原始列（回应评估 #2 季度格式、#7 保留 snapshot_month）

```sql
-- SELECT 追加（time_expr 见 §5.1.1）
{Q(time_expr)}                                    AS {Q("snapshot_month")},   -- 原始期次列，drill-through 排序用，必须保留
EXTRACT(YEAR   FROM {time_expr})::int             AS year,
to_char({time_expr}, 'YYYY-"Q"Q')                AS quarter,   -- 产出 2026-Q3（注意双引号转义，非 'YYYY-Q'）
to_char({time_expr}, 'YYYY-MM')                  AS month,
-- GROUP BY 追加（原始列 + 三派生列）
{Q(time_expr)},
EXTRACT(YEAR FROM {time_expr})::int,
to_char({time_expr}, 'YYYY-"Q"Q'),
to_char({time_expr}, 'YYYY-MM')
```

> **季度格式修正**：`to_char(T, 'YYYY-Q')` 在 PostgreSQL 产出 `2026-3`，**不是** `2026-Q3`；必须写为 `to_char(T, 'YYYY-"Q"Q')`。

> **类型处理（回应评估 #7 / R7）**：`snapshot_month` 必须为 `DATE` / `TIMESTAMP`，或可被 `::date` 解析的 ISO 串（如 `2026-03-01`）。**全量扫脏值校验（实现已落地，v2.3 修正）**：
> 1. **列类型校验**（查 `information_schema`）：原生 `date/timestamp/time` 直接放行；`varchar/text/char` 等字符串类型进入第 2 步；其余类型直接抛明确 `ValueError`。
> 2. **字符串内容全量扫描（不用 LIMIT 1 抽样）**：原因——`CREATE VIEW` 只定义视图、不实际计算 cast，且抽样只能证明“某一行可转”，首行合法但后续存在 `2026年7月`/`202607`/空串时会漏放。故用正则反向筛坏值：`SELECT {time_expr}::text FROM {from_table} WHERE {time_expr} IS NOT NULL AND {time_expr}::text !~ '^\d{4}-\d{2}(-\d{2})?(\s\d{2}:\d{2}(:\d{2})?)?$' LIMIT 1`，发现即抛明确错误（含样例脏值，提示改用 `YYYY-MM-DD`/`YYYY-MM`），与行顺序无关、覆盖整列。
> 3. 取不到 `information_schema` 列类型时，仍走第 2 步正则扫描，避免静默通过或静默失败。
> 4. 集成测试覆盖：`tests/test_x05_time_drilldown_acceptance.py`（A 未配 time_field 不注册时间列 / B DATE 生成 4 列 / C group_by 跳过同源时间维度 / D 字符串脏值全量扫描抛明确错误）。

**DWS 视图产出形态（含保留列）**：
```
snapshot_month | dept | emp_type | year | quarter | month | headcount
```
（`snapshot_month` 为原始期次，供二期 drill-through 的 `ORDER BY snapshot_month DESC` 使用。）

#### 5.1.4 注册派生列为 `TableColumn`（回应 §5.1.3 配套）

在 `modeling.py:964–974` 的注册循环里，**除维度/度量外，必须额外注册**：
```python
for col_code, col_label, col_type in [
    ("snapshot_month", "期次", "string"),
    ("year",   "年",   "integer"),
    ("quarter","季",   "string"),
    ("month",  "月",   "string"),
]:
    self.session.add(TableColumn(table_name=view_name, column_code=col_code,
                                 column_label=col_label, data_type=col_type,
                                 display_order=col_order, is_visible=True))
    col_order += 1
```
（原 `id` / `synced_at` / 维度 / 度量 注册保持不变；旧列清理逻辑 line 956–959 已能避免残留。）

> **`output_fields` 返回值必须同步（回应评估 #3）**：本函数返回值 `output_fields`（modeling.py:985）当前仅含 `[维度列] + [度量列]`，下游预览/查询/映射可能依赖它。加了 4 个时间列后，应一并把 `snapshot_month / year / quarter / month` 追加进 `output_fields`，否则按该返回值生成的预览与列映射会漏掉时间列：
> ```python
> output_fields = [dim_col_name.get(code, code) for code in expanded_group_by] + [measure_alias] + ["snapshot_month", "year", "quarter", "month"]
> ```

### 5.2 FineBI 推送（**复用现有 `finebi_` 通道，不修改**）

> **约束**：`finebi_` 推送是公用组件，**保持现有实现，本期不改造**。仅作为"现有通道"在消费侧引用。

现状（`push_service.py:736–897`）：DWS 视图物化为 `finebi_<key>` 物理表（`CREATE TABLE … AS SELECT * FROM view`，line 799）→ 授权只读账号 → 返回 JDBC 连接串；`sync_service.py:1280` 在**源 DWD 表同步后**自动刷新该物理表。

一期消费侧动作（**配置，非开发**）：
1. 将带时间派生的 DWS 聚合视图通过现有推送通道发布到 `finebi_` schema。
2. 帆软侧：基于 `year/quarter/month` 三列**定义时间层次**（年 → 季 → 月）。
3. 帆软侧：将「员工人数」度量聚合方式设为 **「期末值 / 最后值」**（关键，见 §5.3）。

> ⚠️ **DWS 视图结构变更后必须重推（R6 操作项）**：`generate_dws_view` 重建视图（加了年/季/月列）**不会**自动刷新 `finebi_` 物理表——`sync_service.py:1280` 的自动刷新只在 DWD 源表同步时触发，不监听 DWS 视图变化。因此**每次 DWS 视图加列/改结构后，必须手动重新执行一次该 DWS 视图对应的推送（execute_push）**，帆软才能看到新列。这一步在验收清单（§5.4）中单列。

### 5.3 ⚠️ 存量 / 流量陷阱（一期必须处理）

- **流量指标**（成本、入职数、离职数）：钻取 = 跨月 **SUM** 重聚合 → 正确。
- **存量指标**（在职人数 headcount）：**月末在职不能跨月求和**。季度/年度人数应是该季/年末那个月的快照值，而非 3/12 个月相加。
- **后果**：若帆软对 headcount 用默认 SUM，季度人数会变成"1~3月累加"，**数值 silently 错**。
- **一期对策**：
  - 帆软侧把 headcount 度量聚合显式配为"期末值/最后值"；
  - 数据库中 `measure_semantics` 标为 `stock`（§5.1.0），为二期 portal 钻取 API 的语义分支预留依据；
  - 钻取形态建议做成 **drill-through（展开看每月快照）** 而非"汇总成季度总数"（与二期一致）。

### 5.4 一期交付清单
- [ ] Alembic 迁移 `0100_add_dws_timefields`：`DwsAggregateDefinition` 加 `time_field` + `measure_semantics`（`time_grain` 不动、不迁移）。
- [ ] `generate_dws_view`：`time_field` 经 `DatasetOutputField` 解析为 `alias.column`；注入 `snapshot_month`(保留) + `year/quarter/month`(派生，`to_char(T,'YYYY-"Q"Q')`)；GROUP BY 同步追加。
- [ ] `group_by` 遍历中跳过 `time_field` 源列（§5.1.2），避免重复列。
- [ ] 时间列类型校验：非日期且不可 `::date` 强转时抛明确错误（§5.1.3 / R7）；字符串类型按全量正则扫描坏值（非 LIMIT 1 抽样）。
- [ ] 集成测试：`tests/test_x05_time_drilldown_acceptance.py` 覆盖 A 未配 time_field 不注册时间列 / B DATE 生成 4 列 / C group_by 跳过同源时间维度 / D 字符串脏值全量扫描抛明确错误。
- [ ] 派生列 + `snapshot_month` 全部注册到 `TableColumn`（§5.1.4）；**且注册受 `time_select_exprs` 非空保护**——未配置 `time_field` 的普通 DWS 不注册时间列、不写入 `output_fields`（避免元数据谎称有时间列而实际视图无此列）。
- [ ] 现有 `finebi_` 推送通道发布该 DWS 视图（配置，不改代码）。
- [ ] **DWS 视图结构变更后手动重推 finebi_（R6 操作项）**。
- [ ] 帆软侧：时间层次 + headcount 期末值配置。
- [ ] 用户场景 DWS 聚合：`group_by=[三级部位BU, 公司级组织, 一级部门, 员工类型]`（**不含** snapshot_month），`time_field=snapshot_month`，`measure_semantics=stock`。

---

## 6. 二期（方案 A：portal 内自建钻取）

### 6.1 DWS 钻取查询 API

新增端点（建议 `GET /warehouse/dws/{id}/drill`）：

| 参数 | 说明 |
|---|---|
| `grain` | `year` / `quarter` / `month`，决定重聚合粒度 |
| `filters` | 组织维度 / 员工类型等过滤条件 |
| `time_bucket`（可选） | 已展开的层级值，用于 drill-through 展开每月快照 |

**语义分支（依赖一期 `measure_semantics`，一期已落地，无二期迁移负担）**：
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
                            ORDER BY snapshot_month DESC) AS rn   -- snapshot_month 已在视图中保留
  FROM dws_xxx WHERE <filters>
) t WHERE rn = 1;
```
> `<grain 表达式>` 同 §5.1.3：`year`=`EXTRACT(YEAR FROM snapshot_month)::int`，`quarter`=`to_char(snapshot_month,'YYYY-"Q"Q')`，`month`=`to_char(snapshot_month,'YYYY-MM')`。
> **drill-through**（stock 展开每月快照）：直接按 `time_bucket` 过滤回 month 级明细（`WHERE month = :bucket`），不做重聚合——依赖视图保留的 `snapshot_month`。

### 6.2 前端时间层次 UI + 转置

- 报表设计器增加「时间层次」模式：grain 切换（年/季/月）或树形展开（点年度行 → 展开季度 → 再展开月份）。el-table 树形/分组即可承载。
- 复用现有 `ReportTransposeConfig`（`pivot_col=员工类型` + `value_col=人数`）把正式/实习并排为列轴。
- 组合效果：行轴 = 组织维度 + 时间层次，列轴 = 员工类型，达成用户最初"一个视图同时按三级展示两指标 + 月份钻取"的完整形态。

### 6.3 复用一期基座
- 时间列（`year/quarter/month`）、原始 `snapshot_month`、`time_field` 解析、`measure_semantics` 全部来自一期，**二期无 DWS 视图结构迁移**，仅新增 API + 前端交互。

### 6.4 二期交付清单
- [ ] 新增 DWS 钻取查询 API（grain + filters + 读 `measure_semantics` 走 stock/flow 分支）。
- [ ] 报表设计器时间层次 UI（grain 切换 / 树形展开）。
- [ ] 复用 `ReportTransposeConfig` 实现员工类型转列。
- [ ] （一期已加 `measure_semantics`，此处无迁移；若极端情况一期未加，则补 `0100` 迁移 + 回填 stock/flow，见 R4）

---

## 7. 风险与待确认

| # | 风险 | 对策 / 待确认 |
|---|---|---|
| R1 | **存量指标在帆软被默认 SUM 导致数错** | 一期帆软侧显式配 headcount=期末值；二期 API 走 `measure_semantics=stock` 取期末 |
| R2 | 帆软是否连 `finebi_` schema | 确认帆软数据源指向现有推送通道产出的 `finebi_` schema；若另有数据湖则一期需补导出步骤 |
| R3 | stock 度量"钻取"形态 | 建议 drill-through（展开每月快照）而非汇总成季度总数，两期一致 |
| R4 | `measure_semantics` 落地时机 | **已定为本期（一期）必做字段**，二期无迁移负担；极端情况一期漏加时，二期补 `0100` 迁移 + 回填 |
| R5 | 时间字段类型假设 | 派生 SQL 假设 `snapshot_month` 为 DATE/可解析 ISO 串；见 R7 具体对策 |
| **R6** | **DWS 视图重建后 `finebi_` 物化表不自动刷新** | `sync_service.py:1280` 自动刷新仅在 **DWD 源表同步后**触发，不监听 DWS 视图变化；`finebi_` 物理表是推送时的结构快照（`CREATE TABLE … AS SELECT *`）。**每次 DWS 加列/改结构后，必须手动重新执行该 DWS 视图对应的推送（execute_push）**，帆软才能看到新列。已写入 §5.2 / §5.4 操作项 |
| **R7** | **时间字段类型非日期 / 字符串内容不可解析导致派生 SQL 报错** | 全量扫脏值校验（v2.3 修正）：① 查 `information_schema`——原生 date/timestamp 放行，字符串类型进第 2 步，其余类型抛明确错误；② 字符串类型用正则反向筛坏值（**非 LIMIT 1 抽样**）`SELECT {time_expr}::text … WHERE {time_expr} IS NOT NULL AND {time_expr}::text !~ '^\\d{4}-\\d{2}(-\\d{2})?(\\s\\d{2}:\\d{2}(:\\d{2})?)?$' LIMIT 1`，发现即抛含样例脏值的明确错误；③ 取不到列类型时仍走第 2 步。解决"首行合法、后续脏值被抽样漏放"问题 |

---

## 8. 任务拆分与路线图落点

| 阶段 | 任务 | 类型 | 备注 |
|---|---|---|---|
| 一期 | Alembic `0100`：`time_field` + `measure_semantics` | 后端 / 迁移 | `time_grain` 不动、不迁移 |
| 一期 | `generate_dws_view`：`time_field` 经 DatasetOutputField 解析 + 注入派生列 + 保留 `snapshot_month` + 类型校验 | 后端 | modeling.py:804–822 同路径；跳过 time_field 源列 |
| 一期 | 派生列 + `snapshot_month` 注册 `TableColumn` | 后端 | §5.1.4 |
| 一期 | 帆软发布 DWS + 时间层次 + 期末值配置 + **结构变更后重推 finebi_** | 配置 | 复用 finebi_ 通道 |
| 二期 | DWS 钻取查询 API | 后端 / API | §6.1，依赖一期 `measure_semantics` |
| 二期 | 报表设计器时间层次 UI + 转置复用 | 前端 | §6.2 |

**路线图归属**：本设计落地 X05「多粒度时间下钻」的数仓半（时间列派生）。"钻取交互"在一期为帆软消费、二期为 portal 自建；Phase 4 OLAP/透视（跨指标汇总）不在本范围——若未来需「多指标拼一张表」，另立 Phase 4 任务。

---

## 9. 备注：与本仓库其他需求的关系

- **跨指标并排汇总**（用户最初需求①）：本设计通过「员工类型作维度 + 转置」在单个指标内解决，不进入 Phase 4 跨指标 join。若坚持"两个独立指标并排"，才需 Phase 4。
- **FineBI 通道**：始终作为公用组件，任何 DWS/ADS 资产均可复用，本设计不对其做改动。
- **v2 变更记录**：根据外部评估意见补全——① `time_field` 解析路径与存储格式（output_code）；② 季度 `to_char` 格式修正；③ `measure_semantics` 字段明确定义并定为本期必做；④ `time_grain` 语义澄清（不迁移）；⑤ `time_field` 与 `group_by` 互斥规则；⑥ 视图保留 `snapshot_month` 原始列；⑦ 新增 R6（finebi 重推）/ R7（类型校验）风险。
- **v2.2 变更记录（代码验收返修）**：根据一期代码验收 2 项 finding 修复——① **高**：时间列 `TableColumn` 注册与 `output_fields` 追加现受 `time_select_exprs` 非空保护，未配 `time_field` 的普通 DWS 不再谎报时间列元数据；② **中**：R7 类型校验升级为两阶段——列类型查 `information_schema` 后，对字符串类型额外跑运行时 `::date` 强转校验（`SELECT ({time_expr})::date FROM {from_table} WHERE {time_expr} IS NOT NULL LIMIT 1`），捕获后抛明确错误，不再等到 CREATE VIEW 才泛化失败
- **v2.3 变更记录（二次验收返修）**：根据二次验收 2 项 finding 修复——① **中（R7 抽样漏放）**：字符串脏值校验由 `LIMIT 1` 抽样强转改为**全量正则扫坏值**（`SELECT {time_expr}::text … WHERE {time_expr} IS NOT NULL AND {time_expr}::text !~ '^\d{4}-\d{2}(-\d{2})?(\s\d{2}:\d{2}(:\d{2})?)?$' LIMIT 1`），与行顺序无关、覆盖整列，首行合法后续脏值不再漏放，发现即抛含样例脏值的明确错误；② **低（测试覆盖）**：新增 `tests/test_x05_time_drilldown_acceptance.py`，4 个集成用例（A 未配 time_field 不注册时间列 / B DATE 生成 4 列且值正确 / C group_by 跳过同源时间维度无重复 / D 字符串脏值全量扫描抛明确错误），专门防止"元数据有列但视图无列"回归。代码仍保持未合并。
- **v2.4 变更记录（三次验收返修）**：根据三次验收 3 项 finding 修复——① **中（格式合规但日期无效）**：R7 校验在正则全列扫描通过后，追加一次 `::date` 全列 cast 扫描（`SELECT ({time_expr})::date FROM {from_table} WHERE {time_expr} IS NOT NULL`），捕获 `2026-99-01` / `2026-02-31` 这类"正则通过但 cast 爆"的脏值，不再留到查询视图时才炸，错误信息明确指向"非有效日期"而非泛化错误；② **中（迁移链）**：0098→0099→0100 链完整，验收脚本依赖 0100 迁移，必须在容器中执行 `alembic upgrade head` 后才能跑通；③ **低（pytest 入口）**：新增 `def test_x05_time_drilldown_acceptance(): asyncio.run(main())`，常规 pytest tests/ 可自动发现执行；④ 新增测试场景 **E**（格式合规但日期无效 → cast 扫描捕获 ValueError），验收脚本从 4→5 个用例。
- **v2.5 变更记录（四次验收返修）**：根据四次验收 2 项 finding 修复——① **高（teardown 视图名错误）**：测试所有场景统一使用 `view = f"dws_x05_{tag}"` 但 `generate_dws_view` 用 `agg.name`（即 `x05_{tag}`）作为真实 DB 视图名，导致 teardown DROP VIEW 不命中、源表被残留视图依赖占用、后续事务 abort；改为 `db_view = f"x05_{tag}"` 匹配 `agg.name`，teardown 传入真实视图名删除；② **中（测试误报 PASS）**：场景 A 查 `information_schema.columns WHERE table_name = 'dws_x05_a'` 返回空列表 `[]`，断言 `tc not in []` 恒成立 → PASS 误报；现改为 `db_view = x05_a` 匹配真实视图名，并额外断言 `len(cols) > 0` 防止"查错名→空列表→全断言通过"的假验收。
- **v2.6 变更记录（五次验收返修）**：根据五次验收 2 项 finding 修复——① **高（测试清理不具备幂等性）**：`_make_source_table()` 直接 `DROP TABLE` 但残留视图依赖源表导致事务 abort；新增 `_cleanup_before(db, tag)` 前置清理函数，在每个场景开始前先 `DROP VIEW IF EXISTS + DROP TABLE IF EXISTS + DELETE 元数据行`，分两阶段独立 try/rollback，确保残留不阻塞新场景启动；② **中（teardown 异常后未 rollback）**：`_teardown()` except 块只 print 不 rollback，导致 InFailedSQLTransactionError 连续污染后续清理；修复为 `await db.rollback()` 后再 print。
- **v2.1 变更记录**（3 处小瑕疵）：① 迁移编号 `0099` → `0100`（`0099_add_metric_compile_meta.py` 已被占用，`0100` 为下一个空闲号；同步修正 §5.1.0 / §5.4 / §6.4(R4) / §8 四处引用）；② §5.1.2 增加「比对对象澄清」——跳过判定发生在维度编码经 `dim_col_name` 映射得到真实列名之后，比对对象是 `output_code` 解析出的 `dim_col_name` 值而非维度编码本身；③ §5.1.4 增加 `output_fields`（modeling.py:985）必须同步包含 `snapshot_month/year/quarter/month` 四列，否则下游预览/映射漏时间列。
