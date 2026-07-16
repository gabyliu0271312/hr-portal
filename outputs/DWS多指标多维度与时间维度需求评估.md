# DWD→DWS 多指标多维度 与 时间维度 需求评估

> 评估对象：用户提出的两个困惑（① 多指标多维度 ② 时间维度按年/月展开）及其附带的"多指标 DWS 宽表"方案
> 评估依据：结合本仓库实际代码（后端 `hr-portal/backend` + 前端 `hr-portal/frontend`）与 Spec 012 既定设计
> 评估日期：2026-07-16
> 模式：Ask（仅评估，未改任何代码）

---

## 〇、结论速览（TL;DR）

| 用户困惑 | 用户假设 | 代码事实 | 评估结论 |
|---|---|---|---|
| ① "每次只能选一个指标和一个维度" | UI/系统限制只能单选 | 指标确为单选（设计如此）；**维度 `group_by` 前端实为多选**（`multiple`，`string[]`） | "只能选一个维度"是**误判**。真因是维度目录里该 DWD 数据集下只注册了 1 个可选维度，下拉自然只有一个。改数据即可，无需改 UI/后端 |
| ② "时间维度按年/月展开" | 系统不支持 | 后端 X05 基座**已实现**：`time_field` 自动派生 `snapshot_month/year/quarter/month` 四列（`modeling.py:917-1032`） | 后端有能力，**但前端无 `time_field` 配置入口**，且 X05 标注"代码未合并"。这才是用户感觉"不支持"的真正 gap |
| 附带方案："一张 DWS 宽表塞多指标+多维度" | 这是正解 | Spec 012 Phase 4 明确"跨指标拼宽表=OLAP，触发条件未满足**不做**"；项目已用 `metric_components` 复合指标解决多度量 | 与既定架构**冲突**，会提前引入 Phase 4 复杂度，**不建议采纳** |

一句话：用户的两个困惑，根因都不是"DWS 设计不支持"，而是 ① 维度数据没配齐 ② 时间维度后端做了一半、前端入口缺失。用户草稿的"多指标宽表"方向反而走偏了。

---

## 一、代码事实核查（评估基线）

### 1.1 DWS 聚合定义 = "单指标 + 多维度"（设计如此，非缺陷）

**ORM `DwsAggregateDefinition`**（`backend/app/warehouse/models.py:299-329`）：

| 字段 | 类型 | 说明 |
|---|---|---|
| `metric_id` | BigInteger（单值 FK） | **一个聚合定义绑一个指标** |
| `group_by` | JSON `list` | **数组，天然多维度** |
| `aggregation` | String(16) | sum/count/avg/max/min（单值） |
| `measure_field` | String(128) | 度量字段（单值） |
| `time_field` | String(128) | 时间字段 output_code（X05 新增） |
| `measure_semantics` | String(16) | stock/flow 度量语义（X05 新增） |

**关键点**：`group_by` 在数据结构层本就是数组（多维度），`metric_id` 是单值。这是数仓分层的标准设计——**1 个 DWS 聚合定义 = 1 个指标 + N 个维度**，不是"1 指标 + 1 维度"。

### 1.2 前端维度选择控件实为多选（与用户抱怨矛盾）

**`WarehouseDwsAggregate.vue:284`**：

```vue
<el-select v-model="form.group_by" multiple filterable
           placeholder="由指标自动推导 + 从维度目录选择" style="width:100%">
```

- `multiple` 属性**明确存在**，`form.group_by: [] as string[]`（数组）。
- 选项来自 `filteredDimensions`（按数据集同源过滤）。

**指标选择控件是单选**（`WarehouseDwsAggregate.vue:273`，`form.metric_id: number | undefined`，无 `multiple`）——但这是**架构设计**（1 聚合=1 指标），不是 bug。

> **结论**：用户说"每次只能选一个维度"**与前端代码不符**。控件支持多选，限制只可能来自数据层——维度目录里该数据集下只注册了 1 个维度，或 `diagnoseMetric` 自动推导只回填了 1 个。

### 1.3 时间维度后端基座已实现（X05）

**`modeling.py:917-1032`**（`generate_dws_view` 内）已完整实现时间列派生：

- 配置 `time_field` 后，经 `DatasetOutputField` 解析为 `"alias"."source_column"`（与维度同路径）
- 自动派生 4 列：`snapshot_month`（原始期次，保留）+ `year` + `quarter`（`to_char(T,'YYYY-"Q"Q')` 产出 `2026-Q3`）+ `month`
- 派生列同时进 SELECT 和 GROUP BY（`modeling.py:1038-1043`）
- 跳过 `group_by` 中与 `time_field` 同源的列，避免重复（`modeling.py:1010-1018`）
- R7 全量脏值校验：非日期类型/字符串脏值（如 `2026年7月`、`202607`、`2026-99-01`）在 CREATE VIEW 前抛明确错误
- `measure_semantics=stock`（存量取期末值）/ `flow`（流量可 SUM）为二期钻取预留语义分支

**设计哲学（X05 原教旨，`x05-time-drilldown-two-phase-design.md` §1.3）**：
> "周期是指标消费端的参数，不是指标定义的属性"——数仓只负责把 `year/quarter/month` 三列算出来，钻取/筛选交给消费层（WHERE / GROUP BY）。

### 1.4 复合指标多度量已实现（metric_components，Phase 2+3 已完成）

用户想要的"离职率 = 离职人数 / 总人数"这类**多度量**需求，项目已用 `metric_components` 解决，**不需要把多个独立指标塞进一张 DWS 宽表**：

- `metric_components` 表（`models.py:757`）：一个 metric 关联多个 component，每个 component 各引用一个 `DwsAggregateDefinition`，通过 `role`（numerator/denominator/rate）组合
- `compute_metric` 双路径（`modeling.py:59` / `_compute_with_components:168`）：
  - 有组件 → 逐组件查 DWS → 维度对齐 → 分子/分母相除 → 写入 `measure_values={numerator, denominator, rate}`
  - 无组件 → 单聚合路径 → `measure_values={aggregated_value}`
- 分母为 0：`rate=null` + `_errors.rate=denominator_zero`，不抛 PG 异常
- 前端组件模式 UI 已实现（`WarehouseMetrics.vue:1241-1321`：模式切换、比率检测、一键拆解 `decomposeFormula`、分子/分母配置、引用已有聚合）

**真实验证**（`metric-result-olap-roadmap.md` 文末复盘，2026-07-16）：在 Docker 真实 Postgres 上跑通离职率端到端（销售部 1/5=20%、研发部 2/5=40%）、分母为 0、单聚合路径等集成测试。

---

## 二、困惑一评估：多指标 + 多维度

### 2.1 "只能选一个维度"——误判，先查维度目录

**问题不在 UI/后端**。`group_by` 控件是多选，后端字段是数组。建议先排查：

1. 该 DWD 数据集在**维度目录**（`warehouse_dimensions`）下注册了几个维度？若只有 1 个（如只注册了"部门"），下拉自然只有一个选项。
2. `diagnoseMetric`（`WarehouseDwsAggregate.vue:87` 的 `onMetricChange`）自动推导 `group_by` 时是否只回填了 1 个？

**动作**：在维度管理里把该数据集的维度补齐（部门、岗位、职级、员工类型……），多选下拉立刻就有多个可选项。**零代码改动**。

### 2.2 "多指标"的正确路径是复合指标，不是多指标宽表

用户草稿举例"一张表里同时有离职率、HC 完成率、人均成本"。要区分两种"多"：

| 需求形态 | 本质 | 项目既定方案 | 是否需要多指标宽表 |
|---|---|---|---|
| 离职率 = 离职人数 / 总人数 | **一个复合指标的多度量** | `metric_components`（分子/分母/比率）✅ 已实现 | 否 |
| 正式人数 + 实习人数 并排展示 | **一个指标 + 一个维度（员工类型）+ 转置** | 员工类型作 group_by 维度 + 消费层 `ReportTransposeConfig` 转置 ✅ 已实现 | 否 |
| 离职率 + HC + 人均成本 三个独立业务概念 | **多个独立指标** | 各自一个 DWS 聚合定义 + 各自一个 metric，消费层按需 join/并排 | **否**（这是 Phase 4 OLAP，触发条件未满足不做） |

**关键洞察**：用户把"一个复合指标的多度量"和"多个独立指标"混为一谈了。前者项目已解决（`metric_components`），后者是 Phase 4 OLAP 的范畴，spec 明确**现在不做**（见 §三）。

---

## 三、困惑二评估：时间维度

### 3.1 后端已支持，前端入口缺失 = 真正的 gap

| 层 | 状态 | 位置 |
|---|---|---|
| ORM 字段 `time_field` / `measure_semantics` | ✅ 已加 | `models.py:324-325` |
| 迁移 `0100_add_dws_timefields` | ✅ 存在 | alembic/versions/ |
| 派生逻辑（year/quarter/month + 校验） | ✅ 已实现 | `modeling.py:917-1032` |
| **前端 `time_field` 配置表单** | ❌ **缺失** | `WarehouseDwsAggregate.vue` 表单无此字段，`time_grain` 仅列表展示不可编辑 |
| X05 代码合并状态 | ⚠️ Spec 标注"未合并" | `x05-...v2.6` 文末："代码仍保持未合并" |

**这就是用户感觉"系统不支持时间维度"的真正原因**：后端做了一半，前端没有配置入口，用户在 UI 上配不了 `time_field`，自然派生不出年/季/月列。

**建议动作**：
1. 确认 X05 代码 git 提交/合并状态（spec 说未合并，但工作区代码已存在完整实现，需核实是否在某 feature 分支）。
2. 在 `WarehouseDwsAggregate.vue` 聚合定义表单补 `time_field`（数据集字段下拉）+ `measure_semantics`（stock/flow 单选）两个表单项——**后端零改动**，纯前端补入口。
3. 补完后，用户配 `time_field=snapshot_month`，DWS 视图自动出 `year/quarter/month` 三列，下游 WHERE/GROUP BY 即可按年/月展开。

### 3.2 设计哲学澄清：时间不"展开"成列，而是作维度

用户草稿提到两种"展开"：
- **按年/月聚合**（多数情况）：✅ 正确做法。`year/quarter/month` 作为 GROUP BY 维度，下游 `WHERE month='2026-06'` 或 `GROUP BY year` 即可。这正是 X05 已实现的形态。
- **行列展开/Pivot**（时间放列上，如 1月/2月/3月各一列）：这是**消费层**的事，不是 DWS 建模层的事。项目已有 `ReportTransposeConfig.vue`（`pivot_col`/`row_to_column`）在报表设计器做行转列。

**不要在 DWS 层做行转列**——那会让 DWS 表结构随时间膨胀（每月加一列），破坏数仓稳定性。时间永远是行（维度），需要并排时在消费层 pivot。

---

## 四、对用户"多指标 DWS 宽表"方案的评估

用户草稿核心建议："选多个指标 → 选多个维度 → 生成一张多指标+多维度 DWS 宽表"。**与 Spec 012 既定方向冲突，不建议采纳**：

### 4.1 与 Phase 4 OLAP 边界冲突

`metric-result-olap-roadmap.md` §7（Phase 4）明确：

> 只有满足以下任一条件才进入 OLAP：指标结果行数明显增大、需要跨指标跨周期任意维度透视、BI 需统一度目录……**如果没有这些条件，不应提前建设**。

并列了 6 条不该现在做 OLAP 宽表的理由（表过多、回滚复杂、查询需重组装、前端复杂度上升、与 DWS/ADS 职责重叠、真实场景未出现难设计正确抽象）。

用户当前需求（HR 部门级月度指标）**远未触及**这些触发条件。

### 4.2 X05 §9 已明确否定"跨指标拼宽表"

`x05-time-drilldown-two-phase-design.md` §9：

> 跨指标并排汇总（用户最初需求①）：本设计通过"员工类型作维度 + 转置"在**单个指标内**解决，**不进入 Phase 4 跨指标 join**。若坚持"两个独立指标并排"，才需 Phase 4。

### 4.3 会破坏既有的"1 聚合 = 1 指标"契约

当前 `DwsAggregateDefinition.metric_id` 是单值 FK，`compute_metric`、`metric_components`、血缘、权限传播都依赖这个契约。改成多指标宽表意味着：
- `metric_id` 变多值 → 所有下游（计算、解释卡片、血缘、AI 上下文、审计）全要改
- 一张宽表多个度量 → 权限粒度变粗（无法按指标单独授权）
- 复合指标（离职率）的分子分母若来自同一宽表，维度对齐逻辑要重写

**收益小，破坏面大**。

---

## 五、建议行动项

| # | 行动 | 类型 | 优先级 | 代码改动 |
|---|---|---|---|---|
| A1 | 排查该 DWD 数据集在维度目录下注册的维度数量，补齐缺失维度（部门/岗位/职级/员工类型等） | 数据配置 | P0 | 零代码 |
| A2 | 确认 X05 代码（`time_field`/`measure_semantics` + `modeling.py:917-1032`）git 提交/合并状态，必要时补提交 + `alembic upgrade head` | 工程治理 | P0 | 零功能改动 |
| A3 | 在 `WarehouseDwsAggregate.vue` 聚合定义表单补 `time_field`（数据集字段下拉）+ `measure_semantics`（stock/flow 单选）入口 | 前端 | P1 | 约 2 个 el-form-item + 绑定 |
| A4 | 多度量需求（离职率等）走 `metric_components` 复合指标路径，不走多指标宽表 | 复用已有 | P1 | 零代码（已实现） |
| A5 | 时间并排展示（如各月一列）走消费层 `ReportTransposeConfig` 转置，不在 DWS 层 pivot | 复用已有 | P2 | 零代码（已实现） |
| A6 | **不要**做"多指标 DWS 宽表"——属 Phase 4 OLAP，触发条件未满足 | 决策 | — | 不做 |

---

## 六、附：关键代码位置索引

| 事实 | 文件:行 |
|---|---|
| `DwsAggregateDefinition` ORM（metric_id 单值 / group_by 数组 / time_field / measure_semantics） | `backend/app/warehouse/models.py:299-329` |
| DWS 视图生成 + 时间列派生 | `backend/app/warehouse/service/modeling.py:744`（入口）/ `:917-1032`（时间派生） |
| 指标计算（单聚合 / 组件双路径） | `backend/app/warehouse/service/modeling.py:59` / `:168` |
| `metric_components` ORM | `backend/app/warehouse/models.py:757` |
| 前端 DWS 聚合配置页（group_by 多选 / metric_id 单选） | `frontend/src/views/warehouse/WarehouseDwsAggregate.vue:273,284` |
| 前端组件模式 UI（分子/分母/拆解） | `frontend/src/views/warehouse/WarehouseMetrics.vue:1241-1321` |
| 行转列组件（消费层 pivot） | `frontend/src/views/report/ReportTransposeConfig.vue` |
| 时间下钻设计（X05） | `specs/012-data-warehouse-ucp-integration/x05-time-drilldown-two-phase-design.md` |
| 指标结果集 OLAP 路线图（Phase 4 边界） | `specs/012-data-warehouse-ucp-integration/metric-result-olap-roadmap.md` §7 |
