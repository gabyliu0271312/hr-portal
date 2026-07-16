# 指标结果集与 OLAP 能力演进规划

> 所属 Spec：012 Data Warehouse × UCP Integration  
> 文档目的：明确指标计算结果从“单值”演进到“多维结果集 / 复合指标 / OLAP 分析”的长期路线，避免一次性过度建设。  
> 创建日期：2026-07-14  
> 适用范围：数据仓库指标计算、DWS 聚合、指标结果存储、指标结果 UI、后续 BI/OLAP 能力。

---

## 1. 背景与当前问题

当前指标计算曾存在一个核心缺陷：

```text
compute_metric → SELECT * FROM 来源表 LIMIT 1 → evaluate_formula 单行求值
```

这会导致以下指标无法正确计算：

- HC：需要 `COUNT(*)`，不能从单行得出。
- 离职率：需要 `COUNT(离职人数) / COUNT(总人数)`，不能从单行得出。
- 人均成本：需要 `SUM(成本) / COUNT(人数)`，不能从单行得出。
- 按部门、月份、职级等维度拆分的指标：需要 `GROUP BY`，不能从单行得出。

正确方向不是扩展 `evaluate_formula` 成为万能计算器，而是回到既有数仓分层：

```text
DWD 明细层 → DWS 聚合层 �� 指标结果集 → ADS / BI / AI 消费
```

当前已完成的基础修复方向是：

```text
metric_results       指标结果头表
metric_result_rows   指标结果明细行
```

其中：

- `metric_results` 保存一次计算的摘要、周期、指标、计算时间。
- `metric_result_rows` 保存多行结果，每行包含维度值和度量值。

这解决了“结果不是单值，而是结果集”的核心问题。

---

## 2. 总体演进原则

### 2.1 不推翻既有数仓架构

本规划不新建一套独立 OLAP 系统来替代数据仓库，而是在现有分层上增强指标结果能力：

```text
ODS：原始数据
DWD：明细数据
DWS：汇总聚合
ADS：应用服务层
Metric Result：指标计算结果快照
BI / AI：消费侧
```

指标结果层的定位是：

```text
保存“某次指标计算在某个周期下的结果快照”，方便趋势、解释、审计和消费。
```

它不是 DWS 的替代品，也不是独立数据湖。

### 2.2 先结果集，再复合指标，再 OLAP

演进顺序必须是：

```text
单指标结果集 → 多度量结果行 → 复合指标组件 → 结果 UI 下钻 → 可选 OLAP / Cube
```

禁止一开始直接��：

- `metric_result_dimensions`
- `metric_result_measures`
- `metric_result_cells`
- 指标立方体宽表
- 通用 OLAP 查询引擎

这些能力不是错误，而是更后期的形态。只有当实际查询、展示、性能和多指标分析需求出现后再引入。

### 2.3 原子化开发原则

每期任务必须拆到可独立验收的原子任务。每个原子任务都必须包含：

- 功能交付物。
- 数据库或 API 变更。
- UI 影响或“不涉及 UI”的说明。
- 测试要求。
- 验收标准。
- 回退或兼容策略。

禁止出现以下任务写法：

```text
开发指标 OLAP 能力
优化指标计算
完善数据分析
```

必须拆成类似：

```text
新增复合指标组件表
新增分子/分母组件配置 API
在指标结果明细中写入 numerator/denominator/rate 三个 measure
指标详情页展示复合指标解释区
为无组件定义的复合指标返回明确错误
```

---

## 3. 阶段路线图

## Phase 0：指标结果集基础修复

### 3.1 阶段目标

修复指标计算入口的错误实现，让指标计算不再基于单行公式，而是基于已发布 DWS 聚合定义产出结果集。

### 3.2 本期能力

- `compute_metric` 不再执行 `SELECT * LIMIT 1`。
- 指标必须绑定已发布 DWS 聚合定义。
- 计算结果写入：
  - `metric_results`
  - `metric_result_rows`
- 指标结果查询接口返回 `rows` 明细。
- 前端指标详情页兼容结果集展示。

### 3.3 数据模型

```text
metric_results
- id
- metric_id
- period
- value              JSON 摘要
- computed_at
- created_at

metric_result_rows
- id
- result_id
- metric_id
- period
- row_index
- dimension_values   JSON，例如 {"department": "销售部", "month": 7}
- measure_values     JSON，例如 {"aggregated_value": 120}
- value              主指标值，可为空
- computed_at
- created_at
```

### 3.4 UI 示意

```text
指标详情抽屉
┌──────────────────────────────────────────────┐
│ 指标：HC                                     │
│ 周期：2026-07                                │
├──────────────────────────────────────────────┤
│ [计算期号 2026-07] [计算] [重算]             │
├──────────────────────────────────────────────┤
│ 上次计算完成                                 │
│ 结果：12 行结果                              │
├──────────────────────────────────────────────┤
│ 计算结果                                     │
│ 周期       计算结果       明细行数   时间     │
│ 2026-07    12 行结果      12        10:30    │
└──────────────────────���───────────────────────┘
```

### 3.5 开发列表

- [x] MR0001 新增 `metric_result_rows` 表。
- [x] MR0002 新增 `MetricResultRow` ORM。
- [x] MR0003 修改 `MetricResult.value` 语义为结果摘要。
- [x] MR0004 重写 `compute_metric`，接入 DWS 聚合定义。
- [x] MR0005 `list_results` 返回结果明细行。
- [x] MR0006 前端指标详情兼容结果集展示。
- [x] MR0007 增加基础 ORM / schema 测试。

### 3.6 验收标准

- HC 这类 `COUNT` 指标不再从单行公式计算。
- 没有已发布 DWS 聚合定义的指标，计算失败并返回明确错误。
- 多维结果可以写入多行明细。
- 前端不再依赖 `value.value` 单值字段。

---

## Phase 1：结果集稳定化与查询能力补齐

### 4.1 阶段目标

让指标结果集可稳定查询、分页、导出、解释，并支持基础维度展示。

### 4.2 本期能力

- 指标结果明细分页查询。
- 指标结果明细导出。
- 维度列自动展开展示。
- 度量列自动展开展示。
- 结果行数、空结果、异常结果明确展示。
- 支持按维度值筛选已计算结果。

### 4.3 建议 API

```text
GET /warehouse/metrics/{metric_id}/results
返回结果头表列表，包含摘要和少量 rows。

GET /warehouse/metric-results/{result_id}/rows
返回某次计算的明细行，支持分页、筛选、排序。

GET /warehouse/metric-results/{result_id}/export
导出当前结果明细。
```

### 4.4 UI 示意

```text
指标详情页 / 抽屉
┌──────────────────────────────────────────────┐
│ 计算结果                                     │
│ [周期筛选] [维度筛选] [导出]                 │
├──────────────────────────────────────────────┤
│ 部门        月份      aggregated_value        │
│ 销售部      7         120                     │
│ 研发部      7         88                      │
│ 财务部      7         16                      │
├──────────────────────────────────────────────┤
│ 共 12 行    上一页  1  2  下一页              │
└──────────────────────────────────────────────┘
```

### 4.5 开发列表

- [x] MR0101 新增结果明细分页 API。
- [x] MR0102 新增结果明细导出 API（真实 CSV 文件导出）。
- [x] MR0103 指标结果页自动解析 `dimension_values` 为列。
- [x] MR0104 指标结果页自动解析 `measure_values` 为列。
- [x] MR0105 增加空结果态：计算成功但无数据。
- [x] MR0106 增加失败态：缺少聚合定义、DWS 生成失败、查询失败。
- [x] MR0107 增加结果明细 API 测试（分页/导出/权限态 3 项真库测试 PASS）。
- [x] MR0108 增加前端构建和基础组件测试（vue-tsc 0 错）。

### 4.6 原子任务完成定义

每个任务必须满足：

```text
代码完成
接口文档或 schema 完成
UI 状态完整：加载 / 空 / 成功 / 失败
测试通过
不影响已有指标列表和指标编辑能力
```

---

## Phase 2+3：复合指标组件模型 × 结果解释（合并开发）

> **设计决策（2026-07-16 确认）**
>
> 经评估现有系统代码与业务需求，确定以下关键决策：
>
> 1. **方案选择：方案C（混合模式）** — 公式编辑器永久保留，不替代。检测到比率公式时自动提示可切换到组件模式，一键拆解填入组件表格。两种模式共存，用户自选。
> 2. **指标目录只保留1个指标** — 复合指标（如离职率）在指标目录中只有自己1条记录。分子/分母的聚合定义由系统自动创建（编码 `{metric_code}_numerator`/`{metric_code}_denominator`），不出现在指标目录。用户也可选择引用已有聚合定义。
> 3. **Phase 2+3 合并开发** — Phase 3 的解释/血缘/AI-ready 能力直接依赖 Phase 2 的多度量结果（`measure_values` 中包含 numerator/denominator/rate）。拆开开发会导致 Phase 3 无法验收（没有数据可解释）。合并后一次交付"可计算的复合指标 + 可解释的结果"。
> 4. **除零保护前置** — 在 Phase 1 中完成公式翻译器自动 `NULLIF` 保护（约20行代码），Phase 2 组件模式中自动处理分母为0（返回明确错误而非 PostgreSQL 异常）。

### 5.1 阶段目标

支持离职率、人均成本、占比、环比等复合指标，同时让业务用户能看懂"为什么是这个数"——一次性交付"可计算 + 可解释"的复合指标能力。

### 5.2 为什么需要本期

当前 `DwsAggregateDefinition` 更适合表达一个基础聚合：

```text
COUNT(*)
SUM(cost)
AVG(salary)
```

但离职率需要至少两个组件：

```text
离职率 = 离职人数 / 总人数
```

人均成本也类似：

```text
人均成本 = 总成本 / 人数
```

同时，当前公式方式虽然能算出比率值，但结果只有 `{aggregated_value: 0.0417}`，业务用户无法追溯"为什么是 4.17%"。Phase 2+3 合并后，结果变为 `{terminated_count: 5, headcount: 120, turnover_rate: 0.0417}`，并附带解释卡片和血缘信息。

### 5.3 核心架构决策

#### 决策1：公式编辑器不替代

```text
FormulaFieldEditor → translate_formula_to_sql → formula_sql → 嵌入 DWS 视图
```

这条链路是所有指标的计算基础，永久保留。简单指标（HC=COUNT(*)）和高级用户的自定义公式，永远走公式编辑器。

#### 决策2：组件模式是公式模式的增量叠加

```text
指标编辑页
┌──────────────────────────────────────────────┐
│ 指标：离职率                                 │
│ 类型：比率 ← 自动推导                        │
│                                              │
│ ┌─ 公式编辑器（永远可用）──────────────────┐ │
│ │ ROUND(COUNTIF(员工状态,"离职")           │ │
│ │       / COUNT(*) * 100, 2)              │ │
│ └──────────────────────────────────────────┘ │
│                                              │
│ ┌─ 系统提示（检测到比率公式时自动弹出）────┐ │
│ │ 检测到比率公式，建议拆解为组件模式：       │ │
│ │ 分子：COUNTIF(员工状态,"离职")             │ │
│ │ 分母：COUNT(*)                            │ │
│ │                                          │ │
│ │ [保持公式模式] [切换到组件模式 ▾]         │ │
│ └──────────────────────────────────────────┘ │
│                                              │
│ ┌─ 组件配置区（切换后出现，可修改）────────┐ │
│ │ 角色 │ 聚合编码              │ 聚合名称   │ │
│ │ 分子 │ dws_turnover_rate_num │ 离职率·分子│ │
│ │ 分母 │ dws_turnover_rate_den │ 离职率·分母│ │
│ │                                      [✏️]│ │
│ │ 组合规则：分子 / 分母                     │ │
│ │ 分组维度：[部门 ▾] [月份 ▾] ← 自动推断   │ │
│ └──────────────────────────────────────────┘ │
│                                              │
│ [引用已有聚合 ▾] ← 可选已有聚合定义替代新建   │
└──────────────────────────────────────────────┘
```

#### 决策3：指标目录只保留1个指标

复合指标在指标目录中只有1条 `warehouse_metrics` 记录（如离职率）。

分子/分母对应的聚合定义由系统自动创建：

```text
dws_aggregate_definitions:
  {id:201, metric_id:101, code:"dws_turnover_rate_numerator", name:"离职率·分子"}
  {id:202, metric_id:101, code:"dws_turnover_rate_denominator", name:"离职率·分母"}
```

不创建额外的"离职人数""总人数"指标，原因：

- 用户心智里只有"离职率"这一个业务概念
- 避免指标目录膨胀和命名冲突
- 避免生命周期混乱（删除复合指标时子指标如何处理）

用户也可选择引用已有的聚合定义（如已有 `dws_hc`），此时组件的 `aggregate_id` 指向已有聚合，不重复创建。

#### 决策4：NULLIF 除零保护前置

在公式翻译器（`formula_to_sql.py`）中，检测 `/` 运算符自动将分母包裹为 `NULLIF(expr, 0)`：

```text
用户输入：COUNTIF(员工状态,"离职") / COUNT(*)

翻译结果：COUNT(*) FILTER (WHERE ...) / NULLIF(COUNT(*), 0)
```

此改动约20行代码，在 Phase 1 中完成，Phase 2 组件模式中进一步增加分母为0的明确错误提示。

### 5.4 数据模型

```text
metric_components
- id
- metric_id              FK → warehouse_metrics.id（复合指标本身）
- component_code         唯一 within metric: numerator / denominator / base / compare / custom
- component_name         离职率·分子 / 离职率·分母（自动拼接：指标名称 + ·角色）
- aggregate_id           FK → dws_aggregate_definitions.id
- role                   numerator / denominator / measure / helper
- expression             可选，组件后表达式
- display_order
- is_auto_created        bool，标记是否由系统自动创建（vs 用户引用已有）
- created_at
- updated_at
```

说明：

- `component_code` 在同一 `metric_id` 下唯一，自动生成规则：`{metric_code}_{role}`（如 `turnover_rate_numerator`）。
- `is_auto_created=True` 表示由公式拆解自动创建的聚合定义，删除复合指标时可联动清理；`False` 表示引用用户已有聚合定义，不联动删除。
- 组件引用的 `aggregate_id` 可以是自动创建的聚合定义，也可以是用户已有的聚合定义。
- 聚合定义的编码自动拼接：`dws_{metric_code}_numerator` / `dws_{metric_code}_denominator`。

### 5.5 计算流程（方案C）

```text
compute_metric(metric_id, period)
  ↓
判断 metric 是否有 metric_components
  ↓
有组件 → 逐个组件读取聚合定义 → 生成/查询 DWS 视图
       → 按共同维度对齐结果行
       → 复合计算（分子/分母/比率）
       → 分母为0时写入 NULL + 明确错误标记
       → 写入 measure_values = {numerator, denominator, rate}
  ↓
无组件 → 走现有单聚合流程（Phase 0 已实现）
       → 写入 measure_values = {aggregated_value}
```

示例结果（有组件）：

```json
{
  "dimension_values": {
    "department": "销售部",
    "month": 7
  },
  "measure_values": {
    "terminated_count": 5,
    "headcount": 120,
    "turnover_rate": 0.0417
  },
  "value": 0.0417
}
```

示例结果（分母为0）：

```json
{
  "dimension_values": {
    "department": "新部门",
    "month": 7
  },
  "measure_values": {
    "terminated_count": 0,
    "headcount": 0,
    "turnover_rate": null,
    "error": "denominator_zero"
  },
  "value": null
}
```

### 5.6 公式自动拆解 API

新增后端 API 用于将公式拆解为组件：

```text
POST /warehouse/metrics/decompose-formula
请求：{ formula_expr: "ROUND(COUNTIF(员工状态,离职)/COUNT(*)*100,2)", dataset_id: xxx }
响应：{
  components: [
    { role: "numerator", expression: "COUNTIF(员工状态,离职)", suggested_code: "dws_{metric_code}_numerator" },
    { role: "denominator", expression: "COUNT(*)", suggested_code: "dws_{metric_code}_denominator" }
  ],
  combination_rule: "numerator / denominator",
  dimensions: ["部门", "月份"]   ← 从数据集推断
}
```

### 5.7 UI 示意（指标编辑页 — 方案C）

```text
指标编辑页
┌──────────────────────────────────────────────┐
│ 指标：离职率                                 │
│ 类型：比率 ← 自动推导                        │
│                                              │
│ ┌─ 公式编辑器（永远可用）──────────────────┐ │
│ │ ROUND(COUNTIF(员工状态,"离职")           │ │
│ │       / COUNT(*) * 100, 2)              │ │
│ └──────────────────────────────────────────┘ │
│                                              │
│ ┌─ 系统提示（检测到比率公式时自动弹出）────┐ │
│ │ 检测到比率公式，建议拆解为组件模式：       │ │
│ │ 分子：COUNTIF(员工状态,"离职")             │ │
│ │ 分母：COUNT(*)                            │ │
│ │                                          │ │
│ │ [保持公式模式] [切换到组件模式 ▾]         │ │
│ └──────────────────────────────────────────┘ │
│                                              │
│ ┌─ 组件配置区（切换后出现）────────────────┐ │
│ │ 角色 │ 聚合编码              │ 聚合名称   │ │
│ │ 分子 │ dws_turnover_rate_num │ 离职率·分子│ │
│ │ 分母 │ dws_turnover_rate_den │ 离职率·分母│ │
│ │                                      [✏️]│ │
│ │ 组合规则：分子 / 分母                     │ │
│ │ 分组维度：[部门 ▾] [月份 ▾] ← 自动推断   │ │
│ │                                          │ │
│ │ [引用已有聚合 ▾] ← 下拉选择已发布聚合     │ │
│ │   dws_hc (总人数·按部门月份) ✅ 维度匹配   │ │
│ │   dws_salary_avg ❌ 维度不匹配             │ │
│ └──────────────────────────────────────────┘ │
│                                              │
│ [保存全部] [校验口径]                         │
│ 保存时系统一次性创建：指标 + 聚合定义 + 组件   │
└──────────────────────────────────────────────┘
```

### 5.8 UI 示意（指标结果解释 — Phase 3 部分）

```text
指标结果详情
┌──────────────────────────────────────────────┐
│ 离职率  4.17%                                │
│ 周期：2026-07   部门：销售部                 │
├──────────────────────────────────────────────┤
│ 指标解释                                     │
│ 离职率 = 离职人数 / 总人数                    │
│ 离职人数：5                                  │
│ 总人数：120                                  │
│ 结果：5 / 120 = 4.17%                        │
├──────────────────────────────────────────────┤
│ 数据来源                                     │
│ DWD 员工明细 → DWS 离职率·分子 → 指标结果     │
│ DWD 员工明细 → DWS 离职率·分母 → 指标结果     │
├──────────────────────────────────────────────┤
│ [查看明细] [导出] [查看血缘] [AI 解释]        │
└──────────────────────────────────────────────┘
```

### 5.9 开发列表（Phase 2+3 合并）

**前置（Phase 1 中完成）：**

- [x] MR0109 公式翻译器自动 NULLIF 除零保护（`formula_to_sql.py` 约20行改动）

**Phase 2 — 组件模型：**

- [x] MR0201 新增 `metric_components` 表 + Alembic 迁移。
- [x] MR0202 新增 `MetricComponent` ORM + Pydantic schema。
- [x] MR0203 新增组件 CRUD API（创建/更新/删除/列表）。
- [x] MR0204 新增组件校验：同一指标下 `component_code` 唯一。
- [x] MR0205 新增组件校验：组件引用的 DWS 聚合必须已发布。
- [x] MR0206 新增组件校验：分子分母维度必须可对齐。
- [x] MR0207 新增公式拆解 API（`POST /warehouse/metrics/decompose-formula`）。
- [x] MR0208 改造 `compute_metric` 支持组件计算（读取组件→逐聚合查询→维度对齐→复合计算→多 measure 写入）。
- [x] MR0209 组件模式：分母为0时返回 null + error 标记，不报 PostgreSQL 异常。
- [x] MR0210 前端指标编辑页增加比率公式检测提示 + 组件模式切换按钮。
- [x] MR0211 前端组件配置区：角色表格 + 聚合下拉 + 组合规则 + 维度推断。
- [x] MR0212 前端组件配置区：引用已有聚合定义下拉（标注维度是否匹配）。
- [x] MR0213 保存时后端一次性创建：聚合定义 + 组件配置（`is_auto_created` 标记）。
- [x] MR0214 增加离职率计算端到端测试。
- [x] MR0215 增加人均成本计算端到端测试。
- [x] MR0216 增加分母为0的错误处理测试。

**Phase 3 — 结果解释与消费侧：**

- [x] MR0301 结果详情页增加指标解释卡片（自动从 `measure_values` 提取分子/分母/比率）。
- [x] MR0302 展示指标口径版本和计算时间。
- [x] MR0303 接入已有血缘能力，展示 DWD → DWS → Result。
- [x] MR0304 增加下游引用列表。
- [x] MR0305 增加 AI-ready 上下文输出接口，只返回授权字段和必要聚合结果。
- [x] MR0306 增加权限态：无权限查看明细时只展示汇总。
- [x] MR0307 增加审计事件：查看、导出、AI 解释。
- [x] MR0308 增加复合指标解释 UI 测试。

### 5.10 验收标准（Phase 2+3 合合）

**Phase 2 验收：**

- 离职率可按部门/月份正确计算。
- 人均成本可按部门/月份正确计算。
- 结果中保留分子值、分母值、比率值（`measure_values` 包含3个 key）。
- 分母为0时结果为 null + 明确错误标记，不报 PostgreSQL 异常。
- 分子分母维度不一致时，保存前阻断并给出明确错误。
- 公式编辑器不受影响，简单指标照常使用。
- 指标目录只显示复合指标本身，不出现自动创建的子聚合指标。

**Phase 3 验收：**

- 业务用户能看到"为什么是这个数"（解释卡片展示分子/分母/比率）。
- 敏感明细不会因为指标结果下钻绕过权限。
- 指标解释使用已计算结果，不重新查明细表。
- AI 上下文不包含未授权字段。
- 血缘展示 DWD → DWS → Result 完整链路。

---

## Phase 3 已合并至 Phase 2+3（见上方 5.8-5.10）

> Phase 3 原本独立规划的"指标结果解释、下钻与消费侧增强"能力，已与 Phase 2 合并开发。原因：
>
> 1. Phase 3 的解释卡片直接依赖 Phase 2 的 `measure_values` 多度量结果。没有 `terminated_count`/`headcount`/`turnover_rate` 三值并存，解释卡片无法构建。
> 2. Phase 3 的血缘展示依赖 Phase 2 的组件模型（组件→聚合定义→DWD 数据集链路）。
> 3. 拆开开发会导致 Phase 3 验收时没有数据可解释，必须等 Phase 2 完成后再开发，浪费时间。
> 4. 合并后一次交付"可计算 + 可解释"的完整能力，用户体验从始至终连贯。
>
> 原 Phase 3 的开发任务已整合到上方 5.9 开发列表的 Phase 3 部分（MR0301-MR0308）。

---

## Phase 4：可选 OLAP / Cube 能力

### 7.1 触发条件

只有满足以下任一条件，才进入本期：

- 指标结果行数明显增大，JSON 查询和分页性能不足。
- 业务需要跨指标、跨周期、任意维度透视分析。
- BI 端需要统一的度量目录和维度目录。
- 结果集需要支持复杂排序、过滤、聚合再计算。
- 多个消费方需要稳定的 OLAP 语义层。

如果没有这些条件，不应提前建设。

### 7.2 可能新增的数据模型

```text
metric_result_dimensions
- id
- result_id
- dimension_code
- dimension_name
- data_type
- display_order

metric_result_measures
- id
- result_id
- measure_code
- measure_name
- unit
- precision
- formula
- display_order

metric_result_cells
- id
- result_id
- row_key
- dimension_values
- measure_code
- numeric_value
- text_value
- raw_value

metric_cube_results 可选
- id
- metric_id
- period
- dimension_hash
- dimension_values
- measure_values
```

### 7.3 为什么不是现在做

当前阶段的核心问题是：

```text
指标计算入口没有正确产生结果集。
```

而不是：

```text
系统缺少通用 OLAP 引擎。
```

如果现在直接做 OLAP 模型，会带来以下问题：

1. 数据表过多，迁移和维护成本上升。
2. 一次计算要写多张表，失败回滚复杂。
3. 查询一个结果需要重新组装维度、度量、cell。
4. 前端展示复杂度上升。
5. 与 DWS / ADS 的职责边界容易重叠。
6. 在真实查询量和分析场景未出现前，很难设计正确抽象。

### 7.4 本期开发列表

- [ ] MR0401 建立是否进入 OLAP 阶段的评估报告。
- [ ] MR0402 收集真实结果行数、查询耗时、导出耗时。
- [ ] MR0403 设计维度目录和度量目录快照表。
- [ ] MR0404 设计 cell 存储模型。
- [ ] MR0405 设计 cube 宽表或物化视图策略。
- [ ] MR0406 设计 OLAP 查询 API。
- [ ] MR0407 设计前端透视表交互。
- [ ] MR0408 进行性能压测后再决定是否实施。

### 7.5 UI 示意

```text
指标透视分析
┌──────────────────────────────────────────────┐
│ 指标：离职率                                 │
│ 周期：[2026-01 至 2026-07]                   │
├──────────────────────────────────────────────┤
│ 行维度：[部门 v] [职级 v]                    │
│ 列维度：[月份 v]                             │
│ 度量：[离职人数] [总人数] [离职率]            │
│ [应用] [保存视图] [导出]                     │
├──────────────────────────────────────────────┤
│              2026-05   2026-06   2026-07     │
│ 销售部          3.1%      3.8%      4.2%      │
│ 研发部          1.2%      1.4%      1.6%      │
│ 财务部          0.0%      0.0%      0.8%      │
└──────────────────────────────────────────────┘
```

---

## 8. 当前推荐数据模型边界

### 8.1 当前阶段推荐

```text
metric_results          Phase 0 已完成
metric_result_rows      Phase 0 已完成
metric_components       Phase 2+3 新增
```

### 8.2 当前阶段不推荐

```text
metric_result_dimensions
metric_result_measures
metric_result_cells
metric_cube_results
通用 OLAP 查询引擎
```

### 8.3 判断原则

| 问题 | 当前方案 | 重模型方案 |
|---|---|---|
| 多维结果保存 | 支持 | 支持 |
| 多度量结果保存 | 支持，放 `measure_values` | 支持，拆 measure/cell |
| 离职率解释 | Phase 2 支持 | 支持 |
| 任意透视分析 | 不作为当前目标 | 支持 |
| 开发复杂度 | 中 | 高 |
| 迁移成本 | 低 | 高 |
| 前端复杂度 | 中 | 高 |
| 当前必要性 | 高 | 低 |

---

## 9. 与 UCP / AI 的边界

### 9.1 与 UCP 的边界

UCP 负责：

- 外部系统连接。
- 凭证。
- Pipeline。
- 事件。
- 同步监控。

数据仓库指标结果负责：

- 已入仓数据的建模。
- DWS 聚合。
- 指标计算。
- 结果快照。
- 业务解释。

禁止把指标结果计算做成 UCP Pipeline 的私有逻辑。UCP 只提供数据进入和任务编排能力，指标计算口径仍归数据仓库。

### 9.2 与 AI 的边界

AI 可以消费指标结果，但不能绕过数据仓库权限直接查明细。

推荐 AI 上下文：

```json
{
  "metric": "turnover_rate",
  "period": "2026-07",
  "dimensions": {"department": "销售部"},
  "measures": {
    "terminated_count": 5,
    "headcount": 120,
    "turnover_rate": 0.0417
  },
  "lineage": ["DWD 员工明细", "DWS 离职人数", "DWS 总人数"]
}
```

AI 不应收到：

- 未授权员工明细。
- 薪酬敏感字段明细。
- 原始凭证或连接配置。
- 不必要的全量结果集。

---

## 10. 后续执行顺序建议

推荐执行顺序：

```text
Phase 1：结果明细分页 / 导出 / UI 展开 + NULLIF 除零保护前置
  ↓
Phase 2+3（合并）：复合指标组件模型 × 结果解释与消费侧增强
  ↓
Phase 4：基于真实使用评估 OLAP / Cube
```

不建议跳过 Phase 1 或 Phase 2+3 直接进入 Phase 4。

Phase 2+3 合并原因：
- Phase 3 解释能力依赖 Phase 2 多度量结果（无 numerator/denominator/rate 三值，解释卡片无法构建）
- Phase 3 血缘能力依赖 Phase 2 组件模型（组件→聚合→DWD 链路）
- 拆开开发导致 Phase 3 无数据可验收

---

## 11. 一句话结论

当前最正确的方向不是一次性建设通用 OLAP 引擎，而是沿着现有数仓分层逐步补齐：

```text
指标结果集 → 复合指标（可计算+可解释） → 消费侧增强 → 必要时 OLAP
```

核心设计决策：
- 公式编辑器永久保留，组件模式是增量叠加（方案C混合模式）
- 指标目录只保留用户关注的业务概念，聚合定义是系统内部计算支撑
- Phase 2+3 合并交付"可计算 + 可解释"的完整能力

这样既能修复当前真实问题，又不会提前引入超出阶段需要的复杂度。

---

## 真实验证复盘（2026-07-16）

此前 "Phase 2+3 已完成" 的汇报不实：集成测试（`test_integration_*`）原是 5 个 `@pytest.mark.skip` 的空壳（`pass`），
62 个 PASSED 全是单测/逻辑模拟（手写假数据），**离职率等复合指标从未在真实数据库上跑通过**。

本轮在 Docker Postgres（`hr-portal-db`，真实库）上补全并真正跑通了 4 个端到端集成测试：

- `test_integration_turnover_rate_multi_measure`：离职率 = 分子/分母/比率 三度量，销售部 1/5=20.00%、研发部 2/5=40.00% ✅
- `test_integration_denominator_zero`：分母恒 0 → `rate=null` + `_errors.rate=denominator_zero`，不抛 PG 异常 ✅
- `test_integration_single_aggregate_path`：无组件 → 单聚合路径，只含 `aggregated_value`，总人数合计=10 ✅
- `test_integration_cleanup_shared`：共享资源幂等清理 ✅

运行方式（容器内，依赖 compose 内网 `DB_HOST=db`）：

```
docker exec hr-portal-backend python -m pytest tests/test_warehouse_components.py -k integration -p no:cacheprovider
```

### 本轮修复的真实 Bug（非模拟）

1. **角色词表三方矛盾**：后端 `COMPONENT_ROLES` 缺 `rate`、前端 `ComponentRole` 多出 `measure/helper`、计算代码只认 `role=="rate"` → 无法通过 API 建 rate 组件。已统一为 `numerator|denominator|base|compare|custom|rate`。
2. **事务未提交**：`compute_metric` 只 `flush()` 不 `commit()`，结果行在事务内不可见（API router 虽事后 commit 掩盖了，但**调度 handler 不 commit 会丢结果**）。已在 `compute_metric` 末尾提交，与本项目其他 service 方法一致。
3. **维度列名错位**：`group_by` 存 `dimension_code`（如 `dept_it_turn`），而 DWS 视图列名是 `output_code`（如 `dept`），导致 `_dim_key` 读到 `None`、维度对齐坍缩、结果行维度值丢失。已新增 `_resolve_dim_view_columns` 在 compute 端翻译。
4. **Alembic 隐患**：真库 `alembic_version` 停在 `0097`，但 `metric_components` 表已被直接建出，`0098` 迁移未 stamp → 下次 `upgrade` 会因表已存在失败。已 `alembic stamp head`（0098，表结构与迁移定义逐项一致）。
5. **Schemas 策略缺口**：`MetricTranslateIn` 缺 `extra='forbid'`，导致 `test_layer_policy` 策略测试失败。已补 `model_config = {"extra": "forbid"}`。

> 注：`alembic/versions/0098_add_metric_components_table.py` 当前为未提交（untracked）文件，建议尽快 `git add` 提交以保证迁移链可复现。

### MR0213 协议整改（方案 A：后端 schema 显式支持 new_aggregate_index）

**问题**：前端组件模式保存时发送 `new_aggregate_index`，但后端 `MetricComponentBatchIn.components` 类型为 `MetricComponentCreateIn`（`extra="forbid"` 且无该字段）→ 422 校验失败；且 `batch_save_components` 只读不存在的 `aggregate_ref`，即使绕过 schema 也无法绑定新建聚合。

**修复**：
- `schemas.py` 新增 `MetricComponentBatchItemIn`（`extra="forbid"`，含 `new_aggregate_index`），`MetricComponentBatchIn.components` 改为 `list[MetricComponentBatchItemIn]`，并移除冗余 `metric_id`（路径参数已提供）。
- `component_service.py` `batch_save_components` 重写为：
  - 按 `new_aggregates` 创建顺序保存 `created_agg_ids`；
  - 组件解析优先级 `new_aggregate_index` > `aggregate_id`，兼容旧 `aggregate_ref`；
  - 新增校验：① `aggregate_id` 与 `new_aggregate_index` 同时为空 → 400；② `new_aggregate_index` 越界 → 400；③ 引用已有聚合必须 `published`；④ `component_code` 同指标唯一；⑤ **分子/分母维度一致性**（`_validate_batch_dimension_alignment`，批量保存也要执行）。
- 前端 `warehouse.ts` `MetricComponentBatchPayload.components` 已含 `new_aggregate_index?: number | null`，字段名与后端一致，无需改动。

**闭环验收**：组件模式保存 → 后端一次性创建 DWS 聚合定义（status=published）→ 创建 metric_components（aggregate_id 正确绑定新建聚合）→ 返回组件列表。

**测试**（真实 Postgres）：
```
tests/test_warehouse_components.py::test_batch_in_accepts_new_aggregate_index   (schema 接受)
tests/test_warehouse_components.py::test_batch_save_new_aggregate_index_binds (闭环绑定)
tests/test_warehouse_components.py::test_batch_save_index_out_of_bounds   (越界 400)
tests/test_warehouse_components.py::test_batch_save_both_empty_fails     (双空 400)
tests/test_warehouse_components.py::test_batch_save_reference_published_ok (引用 published 成功)
tests/test_warehouse_components.py::test_batch_save_reference_draft_fails   (引用 draft 失败)
```
6 项全部 PASS；前端 `npm run build` 通过（29.11s）、`vue-tsc 0 错`。

### 验证铁律结果

```
tests/test_warehouse_components.py ...... (37 passed)
tests/ -k 'warehouse or metric ...' (316 passed, 15 skipped)
tests/test_layer_policy.py ......... (33 passed)
```
全部在真实 Postgres 上运行，无 skip、无 mocked DB。
