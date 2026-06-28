# 数据对比检查 Skill + Automation 开发规格

版本：v0.5
日期：2026-06-28
状态：设计草案（修订：收尾 — 删矛盾句、ChatRoute去关键词对齐004铁律、§4伪代码加模板标注、§9.2补标识符白名单映射行）
适用范围：HR Portal 跨表数据对账（名单一致性、基本信息一致性、金额汇总一致性）

---

## 1. 背景与动机

HR Portal 现有 8 张核心业务表（`registered_tables`），数据链路为：

```text
实时花名册 → 月度花名册 → 月度工资 → 成本分摊 → 成本归集 → 分摊结果
```

每月数据同步完成后，HR 管理员需要定期做以下三类对比检查：

| 对比类型 | 典型问题 |
|---|---|
| **名单一致性** | "6月月度花名册的人，和6月工资表的人，是否完全一致？" |
| **基本信息一致性** | "月度花名册的部门/岗位/地区，和实时花名册是否一致？" |
| **金额汇总一致性** | "成本分摊表的金额合计，和工资表的应发合计，按部门汇总后是否对得上？" |

当前痛点：

- 每次都要手写 SQL 或导出 Excel 做 vlookup，效率低、易出错。
- 表结构是动态列（`table_columns` 元数据驱动），硬编码 API 几个月就过时。
- 对比条件高度灵活：按月份、按部门、按成本中心、按特定员工范围，无法穷举。

### 为什么不做传统程序

| 特征 | 传统程序的困境 | Skill 方案的优势 |
|---|---|---|
| 表结构动态变化 | 列名硬编码，新增/删除字段需要改代码 | Skill 启动时读取 `table_columns` 实时理解 schema |
| 对比维度多样 | 名单/信息/金额三类完全不同逻辑 | 自然语言描述，AI 产出结构化参数，后端模板编译 SQL |
| 过滤条件灵活 | 每次新条件都要写新接口 | 口头追加条件，对话中随时调整 |
| 结果格式随需 | 固定 JSON/CSV | "按部门汇总" / "导出 Excel" / "只显示差异项" |
| 周期性 vs 临时 | 两套代码 | Skill 处理临时查询，接 automation 实现定期 |

### 为什么符合 AI Native 路线图

本项目定位于 `Phase 2（多场景复用）` 中的 `data.query` 能力扩展，同时复用 `Phase 1` 已交付的 automation + feishu 基础设施。核心设计遵循 AI 能力注册表中定义的 `query` / `diagnose` 类 Capability，走统一的 AI Orchestrator → Tool Invocation → Schema Validation → Policy Guard 链路。

---

## 2. 目标

### Phase 1（选项B核心）：对话式数据对比 Skill

- 用户通过自然语言描述对比需求，AI 产出结构化 `CompareSpec` 参数，后端用**预定义 SQL 模板**编译执行
- LLM **不生成 SQL**，只输出结构化 JSON（对比类型、表名、字段、关联键等），由 `CompareTemplateEngine` 填参编译
- 三类对比（名单/字段/金额）正好对应三个固定 SQL 模板，参数化填参，零注入风险
- 结果以结构化表格 + 差异高亮形式呈现
- 支持灵活过滤：按月份、部门、成本中心、员工范围
- 复用现有 `table_columns` + `registered_tables` 元数据，零硬编码

### Phase 2（方案C扩展）：自动化定期对比

- 常用对比 Prompt 可保存为自动化规则
- 触发器绑定定时任务（如每月10号数据同步完成后）
- 差异结果通过飞书消息推送
- 执行记录和对比快照可审计、可回查

---

## 2.5 Skill 的定位：结构化对比配置（v0.3 修订）

### 核心纠正

本 spec 中的"Skill"**不是通用技能中心**，而是**数据对比配置的持久化存储**。

存档在 `ai_skills` 表中的是**结构化对比配置**（`CompareSpec` 参数），自然语言描述只作为：
- **展示说明**：在技能列表中向用户描述这个对比是做什么的
- **对话种子**：用户再次进入 AI 对话微调时，把原始需求描述作为上下文参照

Skill 执行时**不需要重新过 LLM 意图识别**，而是直接读取结构化配置 → 编译为参数化 SQL → 执行。

### 组件化设计的核心思想

本 spec 的设计精髓是**组件化**: 引擎 = 组件，技能 = 组件的一次配置。类比前端: 对比引擎 = 一个 Vue 组件（写一次），保存的对比配置 = 给这个组件传一组不同的 props（用户可以无限多地配出来）。

```text
引擎(Capability/模板) = 组件本身, 开发者维护, 一次写好
   ↓ 被复用
技能(Skill/参数)    = 组件的一个实例, 用户通过自然语言"固化", 零开发
```

关键在于: **三类对比不是"三个固定查询"，而是三个"参数化引擎"**。只要你后续的需求本质上还是在问这三个问题之一，就全是用户自助、前端一句话固化、不需要开发:

| 三个引擎 | 它能吃下的"任意" |
|---|---|
| 名单引擎 | 任意两张已注册表 × 任意关联键 × 任意月份 × 任意前置过滤 |
| 字段引擎 | 任意两张表 × 任意一组对比字段 × 任意关联键 × 两表字段名可不同 |
| 金额引擎 | 任意两张表 × 任意金额字段 × 任意汇总维度 × 绝对/百分比容差 |

### 自住 vs 需要开发: 边界线

这条线决定了后续是真省事还是假省事:

**✅ 自助桶 — 用户前端自然语言直接固化, 零开发:**
- "对比7月花名册和工资表名单" — 换月份
- "对比花名册和社保表名单" — 换表
- "对比工资表和分摊表金额, 按成本中心汇总" — 换汇总维度
- "对比花名册和实时花名册的部门、岗位、职级" — 换对比字段
- 以上任何一个存成配置 → 绑定时 → 推飞书, **全程不找开发**

这一类覆盖了对账需求的绝大多数。因为表是元数据驱动(`registered_tables`/`table_columns`)，连"新接进来的业务表"都不需要开发就能对比。

**🔧 开发桶 — 出现了"新问题形状", 需要开发加一个模板(约1个文件):**
- "对比连续3个月名单的变化趋势" — 多期趋势, 不是两表比对
- "检查应发是否落在预算表的上下限区间内" — 区间判断, 不是相等比对
- "三张表联查对比" — 超出两表 join
- "按身份证号模糊匹配找疑似重复" — 模糊匹配

这类的特点是: 用户问的不再是"是否一致/是否对得上", 而是一种系统从没见过的对比逻辑。每加一个新模板是纯增量, 不碰老的、不会把已有配置搞崩。

### 把线往"自助"这边推的杠杆

这条线的位置取决于前期把三个引擎的参数 schema 留得多宽。**首期就在 schema 上把参数设计到最丰富**——关联键支持多字段组合、过滤条件支持任意维度叠加、字段对比支持任意字段列表、金额支持多维度分组。前期在 schema 上多花一点, 后续掉进"自助"桶里的需求就越多。

### 与后端代码的清晰分工

| 概念 | 是什么 | 谁维护 | 关键特征 |
|---|---|---|---|
| **对比配置（`ai_skills` 表）** | 结构化 CompareSpec 参数 + 显示名称/描述 | 用户通过 UI 维护 | 可持久化、可审计、可复现 |
| **执行引擎（三类 CompareTemplate）** | 参数化 SQL 模板 + 编译逻辑 | 开发者维护 | 固定模板，零注入风险 |
| **AI Capability 注册** | `backend/app/ai/capabilities.py` 中的定义 | 开发者维护 | 控制权限、策略、审计 |

### Skill 的三个生命周期

```text
1. 创建：AI 对话中调试 → 满意 → 点击"保存配置" → 存储 CompareSpec + 需求原文
2. 管理：系统管理 → 数据对比任务 → 查看 / 编辑配置 / 删除 / 启用停用
3. 调用：AI 助手"数据对比"入口 → 点击配置 → 直接编译执行（不走 LLM）
          或从管理页面点"运行"
```

### 三个入口

| 入口 | 位置 | 说明 |
|---|---|---|
| **入口 1 · 管理页面** | 提效工具 → 数据对比任务（新增菜单） | 菜单code: `tools.data_compare`，路由: `/tools/data-compare`，放在"自动通知"下方 |
| **入口 2 · AI 助手对话** | 右下角 AI 助手抽屉 | 自然语言描述对比需求，结果满意后可保存配置 |
| **入口 3 · 对话中保存** | AI 对话结果下方 → "保存配置"按钮 | 调试满意后一键存档 CompareSpec |

### ai_skills 表（本期收敛只做 data_compare）

```text
ai_skills（新增表，本期仅存储 data_compare 类型配置）
├── id              BIGSERIAL PRIMARY KEY
├── name            VARCHAR(256) NOT NULL          -- 对比配置名称（用户自定义）
├── description     TEXT                           -- 一句话描述
├── skill_type      VARCHAR(32) DEFAULT 'data_compare'  -- 本期固定 data_compare，不加 ENUM 约束/索引适配未来类型
├── instruction     TEXT NOT NULL                  -- 原始需求描述（纯中文，用于展示和对话种子）
├── params          JSONB NOT NULL                 -- CompareSpec 结构化参数（执行关键）
├── status          VARCHAR(16) DEFAULT 'draft'    -- 'draft' | 'active' | 'archived'
├── source          VARCHAR(16) DEFAULT 'chat_save'-- 'chat_save' | 'manual' | 'import'
├── last_run_at     TIMESTAMP                      -- 上次执行时间
├── last_run_result JSONB                          -- 上次执行摘要
├── run_count       INTEGER DEFAULT 0              -- 累计执行次数
├── created_by      INTEGER REFERENCES users(id)
├── created_at      TIMESTAMP DEFAULT NOW()
├── updated_at      TIMESTAMP DEFAULT NOW()
```

**关键字段说明**：
- `params`：这是 Skill 的**执行核心**。存储完整的 `CompareSpec` JSON（详见 §3 完整 schema 设计）。示例——金额对比：
  ```json
  {
    "compare_type": "amount",
    "source_a": {"table": "emp_monthly_salary",    "period": "202606", "prefilter": []},
    "source_b": {"table": "emp_monthly_allocation", "period": "202606", "prefilter": []},
    "join_keys": ["employee_no"],
    "output": {"only_diff": true, "max_detail": 200},
    "amount": {
      "metric_a": {"agg": "sum", "field": "应发合计"},
      "metric_b": {"agg": "sum", "field": "分摊金额"},
      "group_by": ["cost_center"],
      "tolerance": {"type": "absolute", "value": 0.5}
    }
  }
  ```
- `instruction`：**纯展示**，存放用户原始需求描述（如"对比6月月度花名册和月度工资表的员工名单"），不参与执行逻辑
- `status`：draft（刚存档未验证）、active（已启用）、archived（归档）

### 执行链路（修订后的无 LLM 路径）

```text
用户点击"执行"
  → 读取 skill.params（CompareSpec）
  → Schema Validator 校验参数（表名/字段白名单、必填项）
  → CompareTemplateEngine 匹配模板（roster/field/amount）→ 填参编译为 SQL
  → QueryExecutor 执行（自动注入 scope_strategy + statement_timeout）
  → ResultFormatter 格式化
  → 结果返回
  → 更新 skill.last_run_at + run_count
```

**关键改变**：存储的配置直接编译执行，**不重新经过 LLM**。只有当用户进入对话微调时，才把 `instruction` 作为上下文种子传给 LLM 生成新的 `CompareSpec`。


---

## 3. 核心设计

### 3.1 组件化双层架构：引擎（开发者）× 技能（用户固化）

用户固化的不是"自然语言指令原文"，而是**一份结构化的 CompareSpec（JSON 参数）**。这份参数=给固定的引擎"传不同的 props"。引擎本身不动，技能只需换参数——这就是组件化。

```
┌─ 技能 Skill (用户一句话固化, 存库, 可命名/定时/推送) ──────────┐
│  name        "6月花名册vs工资表名单核对"                        │
│  description  一句话说明                                         │
│  spec         ← 下面这坨 CompareSpec (AI从自然语言解析得出)      │
│  schedule     null | "每月10号09:00"                            │
│  notify       null | {飞书接收人, 仅推摘要}                     │
└─────────────────────────────────────────────────────────────────┘
        spec 喂给 ↓
┌─ 引擎 Capability (开发者维护, 三类, 一次写好) ──────────────────┐
│  roster_engine / field_engine / amount_engine                   │
│   ├── SchemaValidator: 校验 CompareSpec 参数                     │
│   ├── CompareTemplateEngine: 选模板 → 填参编译 SQL              │
│   └── QueryExecutor: 注入 scope → 执行 → 脱敏                  │
└─────────────────────────────────────────────────────────────────┘
```

**贯穿全程的红线（对齐 004 ADR-AI-010）**：模型只吐这套 JSON（CompareSpec），从不吐 SQL；后端拿 JSON 套模板编译，scope 行级过滤 + 敏感脱敏在套模板时焊死注入。下面所有字段里的 `table`/`column`/`field`，后端都会拿 `registered_tables`/`table_columns` 元数据做白名单校验，校验不过直接拒——这是安全闭环，也是"零硬编码"的来源。

下面先给出完整的三层架构视图，再展开 CompareSpec schema：

```text
用户体验层
  ┌──────────────────────────────────────────┐
  │  入口1: AI 助手对话 → 自然语言 → CompareSpec→ 保存  │
  │  入口2: 数据对比任务管理 → 查看/编辑/运行         │
  └──────────────────────────────────────────┘
                    │
配置存储层（ai_skills 表，结构化配置驱动）
  ┌──────────────────────────────────────────┐
  │  ai_skills 表 (skill_type = data_compare) │
  │  ├── params: CompareSpec (JSON)  ← 执行核心  │
  │  ├── instruction: 需求原文（展示+对话种子）     │
  │  └── status: draft / active / archived    │
  └──────────────────────────────────────────┘
                    │
执行引擎层（后端代码，开发者维护）
  ┌──────────────────────────────────────────┐
  │  data_compare 执行引擎 (无 LLM 参与)       │
  │  ├── MetadataLoader: 读取 table_columns   │
  │  ├── SchemaValidator: 校验 CompareSpec    │
  │  ├── CompareTemplateEngine: 模板编译 → SQL │
  │  ├── QueryExecutor: 安全执行 + 行级过滤     │
  │  └── ResultFormatter: 差异高亮 + 摘要      │
  └──────────────────────────────────────────┘
                    │
平台基础设施层（已有，复用）
  ┌──────────────────────────────────────────┐
  │  AI Orchestrator + Capability Registry    │
  │  DB Session → scope_strategy 自动过滤     │
  │  Automation Engine + Feishu Notification  │
  └──────────────────────────────────────────┘
```

### 3.2 CompareSpec 通用信封 —— 三类共用的"公共参数"

**CompareSpec** 是所有对比类型的"信封"，包含数据源、关联键、输出控制等公共参数。这是自助覆盖面的最大来源——**prefilter 让用户只需要改参数就能覆盖任意过滤组合**。

```json
{
  "compare_type": "roster | field | amount",   // 选哪个引擎

  // ① 两个数据源: 任意已注册表 + 任意期间 + 任意前置过滤
  "source_a": {
    "table":  "emp_monthly_roster",   // 必须在 registered_tables 中
    "period": "202606",               // is_period=true 的表必填, 否则 null
    "prefilter": [                    // 对比前先筛行——自助覆盖面的最大来源
      {"column": "员工类型", "op": "eq",  "value": "正式"},
      {"column": "公司名称", "op": "in",  "value": ["A公司","B公司"]}
    ]
  },
  "source_b": { "table": "...", "period": "...", "prefilter": [ ... ] },

  // ② 关联键: 支持多字段复合键 (默认取 is_pk_part=true 的字段)
  "join_keys": ["employee_no"],       // 或 ["employee_no","company_code"] 复合

  // ③ 结果呈现 (不影响"算什么", 只影响"怎么看")
  "output": {
    "only_diff":   true,              // 只看差异 / 全量
    "group_count_by": "部门",         // 差异按某维度做计数分布 (可空)
    "max_detail":  200                // 明细截断
  }
}
```

**prefilter.op 封闭枚举**（不是任意表达式，保证零注入）:

| op | 语义 | 示例 value |
|---|---|---|
| `eq` | 等于 | `"正式"` |
| `ne` | 不等于 | `"离职"` |
| `in` | 在列表中 | `["A公司","B公司"]` |
| `not_in` | 不在列表中 | `["已删除"]` |
| `gt` / `gte` | 大于 / 大于等于 | `10000` |
| `lt` / `lte` | 小于 / 小于等于 | `50000` |
| `between` | 在区间内 | `[1000, 5000]` |
| `contains` | 包含子串 | `"技术"` |
| `is_null` | 为空 | `null` |
| `is_not_null` | 非空 | `null` |

**Pydantic 验证模型**（后端入口）:

```python
from pydantic import BaseModel
from typing import Literal

class PrefilterClause(BaseModel):
    column: str
    op: Literal["eq","ne","in","not_in","gt","gte","lt","lte","between","contains","is_null","is_not_null"]
    value: str | int | float | list | None

class DataSource(BaseModel):
    table: str                       # 必须在 registered_tables 中
    period: str | None = None        # 月度表必填 (YYYYMM)
    prefilter: list[PrefilterClause] = []

class CompareOutput(BaseModel):
    only_diff: bool = True
    group_count_by: str | None = None
    max_detail: int = 200

class CompareSpecEnvelope(BaseModel):
    compare_type: Literal["roster", "field", "amount"]
    source_a: DataSource
    source_b: DataSource
    join_keys: list[str]             # 必须在两张表都存在
    output: CompareOutput = CompareOutput()
```

### 3.3 三类引擎专属参数

在信封之外，每种对比类型有自己专属的参数字段。下面给出完整 schema 和 Python Pydantic 模型。

#### 3.3.1 roster_engine —— 名单是否一致

```json
{
  "compare_type": "roster",
  // ... 信封 ...
  "roster": {
    "direction": "both",              // both | only_in_a | only_in_b
    "display_fields": ["工号","姓名","部门"]  // 差异行展示哪些列
  }
}
```

```python
class RosterSpec(BaseModel):
    direction: Literal["both", "only_in_a", "only_in_b"] = "both"
    display_fields: list[str] = ["employee_no", "employee_name"]

class CompareSpecRoster(CompareSpecEnvelope):
    compare_type: Literal["roster"] = "roster"
    roster: RosterSpec
```

**能吃下的"任意"**: 任意两表 × 任意复合键 × 任意期间 × 任意前置过滤。

#### 3.3.2 field_engine —— 字段值是否一致

```json
{
  "compare_type": "field",
  // ... 信封 ...
  "field": {
    "pairs": [
      // 关键参数化: 两表列名可以不同! field_a ≠ field_b 由用户/AI映射
      {"field_a": "department",  "field_b": "dept_name", "mode": "trim"},
      {"field_a": "应发合计",     "field_b": "应发",      "mode": "numeric", "tolerance": 0.01}
    ]
  }
}
```

```python
class FieldPair(BaseModel):
    field_a: str                             # 表A的字段
    field_b: str                             # 表B的字段 (可与 field_a 不同)
    mode: Literal["exact", "trim", "numeric"] = "exact"
    tolerance: float | None = None           # numeric 模式下的容差

class FieldSpec(BaseModel):
    pairs: list[FieldPair]

class CompareSpecField(CompareSpecEnvelope):
    compare_type: Literal["field"] = "field"
    field: FieldSpec
```

**mode 说明**:
| mode | 比对方式 | 适用场景 |
|---|---|---|
| `exact` | 精确相等（区分大小写） | 员工编号、状态码 |
| `trim` | 去空格+大小写归一化后比对 | 姓名、部门名（常有多余空格） |
| `numeric` | 数值容差比对 | 金额字段（允许浮点误差） |

**能吃下的"任意"**: 任意一组字段 × 即使两表字段名不同 × 文本/数值不同比对方式。

#### 3.3.3 amount_engine —— 汇总金额是否对得上

```json
{
  "compare_type": "amount",
  // ... 信封 ...
  "amount": {
    "metric_a":  {"agg": "sum", "field": "应发合计"},   // agg: sum | count | avg
    "metric_b":  {"agg": "sum", "field": "分摊金额"},
    "group_by":  ["部门"],                              // 支持多维: ["部门","成本中心"]
    "tolerance": {"type": "absolute", "value": 1.0}     // absolute 绝对值 | percent 百分比
  }
}
```

```python
class MetricDef(BaseModel):
    agg: Literal["sum", "count", "avg"] = "sum"
    field: str

class ToleranceDef(BaseModel):
    type: Literal["absolute", "percent"] = "absolute"
    value: float = 0.0

class AmountSpec(BaseModel):
    metric_a: MetricDef
    metric_b: MetricDef
    group_by: list[str]                  # 支持多维分组
    tolerance: ToleranceDef = ToleranceDef()

class CompareSpecAmount(CompareSpecEnvelope):
    compare_type: Literal["amount"] = "amount"
    amount: AmountSpec
```

**能吃下的"任意"**: 任意两表 × 任意金额字段 × 任意(多维)汇总维度 × 绝对/百分比容差。

### 3.4 真实填参示例 —— "自然语言 → CompareSpec"

用户永远不会看到或编写 CompareSpec JSON。他们在对话中说自然语言，AI 解析后产出。下面展示几个典型对话对应的完整 spec，帮助判断哪些需求落在自助桶里。

**示例 1：名单对比**
> 用户说："对比6月花名册和工资表的员工名单，只看正式员工，只看差异"

```json
{
  "compare_type": "roster",
  "source_a": {"table": "emp_monthly_roster",    "period": "202606", "prefilter": [
    {"column": "员工类型", "op": "eq", "value": "正式"}
  ]},
  "source_b": {"table": "emp_monthly_salary",    "period": "202606", "prefilter": [
    {"column": "员工类型", "op": "eq", "value": "正式"}
  ]},
  "join_keys": ["employee_no"],
  "output": {"only_diff": true, "max_detail": 200},
  "roster": {"direction": "both", "display_fields": ["工号","姓名","部门"]}
}
```

**示例 2：字段对比**
> 用户说："检查6月花名册和实时花名册的部门、岗位是否一致"

```json
{
  "compare_type": "field",
  "source_a": {"table": "emp_monthly_roster",   "period": "202606", "prefilter": []},
  "source_b": {"table": "emp_realtime_roster",  "period": null,     "prefilter": []},
  "join_keys": ["employee_no"],
  "output": {"only_diff": true, "max_detail": 200},
  "field": {"pairs": [
    {"field_a": "department", "field_b": "department", "mode": "trim"},
    {"field_a": "position",   "field_b": "position",   "mode": "trim"}
  ]}
}
```

**示例 3：金额对比**
> 用户说："对比6月工资表和分摊表金额，按成本中心汇总，差5毛以内算对"

```json
{
  "compare_type": "amount",
  "source_a": {"table": "emp_monthly_salary",     "period": "202606", "prefilter": []},
  "source_b": {"table": "emp_monthly_allocation", "period": "202606", "prefilter": []},
  "join_keys": ["employee_no"],
  "output": {"only_diff": true, "max_detail": 200},
  "amount": {
    "metric_a": {"agg": "sum", "field": "应发合计"},
    "metric_b": {"agg": "sum", "field": "分摊金额"},
    "group_by": ["cost_center"],
    "tolerance": {"type": "absolute", "value": 0.5}
  }
}
```

**示例 4：多维度金额对比**
> 用户说："对比6月工资表和分摊表，按部门和成本中心汇总，差异超过1%才报"

```json
{
  "compare_type": "amount",
  "source_a": {"table": "emp_monthly_salary",     "period": "202606", "prefilter": []},
  "source_b": {"table": "emp_monthly_allocation", "period": "202606", "prefilter": []},
  "join_keys": ["employee_no"],
  "output": {"only_diff": true, "max_detail": 200},
  "amount": {
    "metric_a": {"agg": "sum", "field": "应发合计"},
    "metric_b": {"agg": "sum", "field": "分摊金额"},
    "group_by": ["department", "cost_center"],
    "tolerance": {"type": "percent", "value": 1.0}
  }
}
```

点"保存配置" → 起个名 → 绑每月10号 → 完事。全程没碰开发。

### 3.5 自助 vs 开发：完整判断表

拿你脑子里的需求往上套，一眼看清:

| 你脑子里的需求 | 落点 | 怎么实现 |
|---|---|---|
| 换月份 (7月、8月…) | ✅ 自助 | 改 `source_a/b.period` |
| 换表对 (花名册vs社保表、工资vs个税…) | ✅ 自助 | 改 `source_a/b.table` |
| 只对比正式工 / 某公司 / 某成本中心 | ✅ 自助 | 加 `prefilter` |
| 复合键关联 (工号+公司) | ✅ 自助 | 改 `join_keys` |
| 两表字段名不一样也要比 | ✅ 自助 | `field.pairs` 的 `field_a` ≠ `field_b` |
| 换汇总维度 (部门→成本中心→地区) | ✅ 自助 | 改 `amount.group_by` |
| 多维汇总 (部门+成本中心) | ✅ 自助 | `group_by: ["department","cost_center"]` |
| 按百分比容差而非固定金额 | ✅ 自助 | `tolerance.type: "percent"` |
| 以上任意组合 + 存档 + 定时 + 飞书 | ✅ 自助 | 存 Skill, 绑 automation |
| **──────────────────────** | **──** | **──** |
| 连续3个月名单变化趋势 | 🔧 开发 | 新增 trend 引擎 (多期, 不是两表) |
| 应发是否落在预算上下限区间 | 🔧 开发 | 新增 range 引擎 (区间判断) |
| 三表以上联查对比 | 🔧 开发 | 信封只设计了两源 |
| 按身份证模糊匹配查疑似重复 | 🔧 开发 | 新增 fuzzy 引擎 |
| 对比"是否符合某计算规则" | 🔧 走公式引擎 | 那是 ai_formula 的活, 不是对比 |

**明确划掉的边界（不是设计缺陷，是安全特性）**：这套信封故意只设计两个数据源——三表以上联查、多期趋势属于"新引擎"，不硬塞进来。塞进来会把 schema 撑成万能 SQL，既不安全也没人能维护。有边界的引擎才可审计、才不幻觉。

### 3.6 执行链路（选项B：LLM 不生成 SQL）

#### 3.6.1 对话式执行路径（有 LLM 参与）

```text
用户自然语言描述对比需求
  → AI Orchestrator 意图识别
  → Capability Resolver: 匹配 data_compare
  → Permission Check: 验证用户对每张被对比表的 V 权限
  → Tool Invocation: data_compare Skill
      → MetadataLoader: 查询 table_columns + registered_tables 获取表结构
      → Prompt Builder: 组装 system prompt（仅含表结构元数据 + 字段列表 + 安全规则）
      → LLM 推理: 输出 CompareSpec（结构化 JSON，不是 SQL）
      → Schema Validator: 校验 CompareSpec（表名/字段白名单、必填项、类型检查）
      → CompareTemplateEngine: 根据 compare_type 选模板 → 填参编译为参数化 SQL
      → Query Executor: 自动注入 scope_strategy 行级过滤 + statement_timeout = 30s
      → Result Formatter: 差异高亮 + 汇总统计
  → Policy Guard: 敏感字段脱敏检查
  → Answer: 返回结构化对比结果 + "保存配置"按钮
```

#### 3.6.2 配置直接执行路径（无 LLM 参与）

```text
用户从管理页面点击"运行"（已存储的 CompareSpec）
  → 读取 skill.params
  → Schema Validator: 校验参数有效性
  → CompareTemplateEngine: 模板编译 → SQL
  → Query Executor: 执行 + 行级过滤
  → Result Formatter: 格式化结果
  → 更新 last_run_at + run_count
  → 返回结果
```

**关键安全设计**：LLM 输出的是 JSON，**永远不会触发** `deny_patterns.py` 中的 `"sql"` 正则拦截。因为模型输出中不包含 `select`、`from`、`join`、`where` 等 SQL 关键字——只有结构化的参数 JSON。

#### 3.6.3 CompareTemplateEngine：三模板体系

三种对比类型正好对应三个固定的 SQL 模板。模板由后端维护，CompareSpec 参数填参编译：

**模板 1 — 名单对比（roster）**：
```sql
-- 参数化模板：从 CompareSpecRoster 编译
-- source_a/b.table → {table_a/b}, source_a/b.period → {period_a/b}
-- join_keys[0] → {join_col}, prefilter → {where_a/b}
SELECT 
    COALESCE(a.{join_col}, b.{join_col}) as {join_col},
    CASE 
        WHEN a.{join_col} IS NULL THEN '仅存在于{table_b_label}'
        WHEN b.{join_col} IS NULL THEN '仅存在于{table_a_label}'
    END as diff_type
FROM (
    SELECT {join_col} FROM {table_a}
    -- [如果 is_period_table: WHERE {table_a_period_col} = {period_a}]
    -- [如果 prefilter 非空: AND prefilter_condition_a]
) a
FULL OUTER JOIN (
    SELECT {join_col} FROM {table_b}
    -- [如果 is_period_table: WHERE {table_b_period_col} = {period_b}]
    -- [如果 prefilter 非空: AND prefilter_condition_b]
) b ON a.{join_col} = b.{join_col}
WHERE a.{join_col} IS NULL OR b.{join_col} IS NULL
```

**模板 2 — 字段对比（field）**：
```sql
-- 参数化模板：从 CompareSpecField 编译
-- field.pairs → {pairs[]}，每个 pair 生成 a.{field_a} vs b.{field_b}
-- mode 决定比对条件和容差
SELECT 
    a.{join_col},
    {compare_fields_fmt}  -- 每个 pair 生成: a.{field_a} as {field_a}_a, b.{field_b} as {field_b}_b
FROM (
    SELECT {join_col}, {fields_a_csv} FROM {table_a}
    -- [WHERE {period_col} = {period} + prefilter]
) a
INNER JOIN (
    SELECT {join_col}, {fields_b_csv} FROM {table_b}
    -- [WHERE {period_col} = {period} + prefilter]
) b ON a.{join_col} = b.{join_col}
WHERE {compare_conditions}  -- 按 mode 分别生成: trim→UPPER(TRIM(a.f1)) != UPPER(TRIM(b.f1))
                            -- numeric→ABS(a.f1 - b.f1) > tolerance
```

**模板 3 — 金额对比（amount）**：
```sql
-- 参数化模板：从 CompareSpecAmount 编译
-- group_by → {group_dims}，支持多维: department, cost_center
-- tolerance.type → 判断阈值计算方式
SELECT 
    COALESCE(a.{group_dims}, b.{group_dims}) as {group_dims},
    a.{metric_a_alias} as amount_a,
    b.{metric_b_alias} as amount_b,
    ABS(COALESCE(a.{metric_a_alias}, 0) - COALESCE(b.{metric_b_alias}, 0)) as diff,
    CASE 
        WHEN a.{metric_a_alias} IS NULL THEN '仅{table_a_label}有'
        WHEN b.{metric_b_alias} IS NULL THEN '仅{table_b_label}有'
        WHEN ABS(a.{metric_a_alias} - b.{metric_b_alias}) > {tolerance_value} THEN '金额不一致'
        ELSE '一致'
    END as status
FROM (
    SELECT {group_dims}, {agg}({metric_a_field}) as {metric_a_alias}
    FROM {table_a} WHERE {period_col} = {period_a} GROUP BY {group_dims}
) a
FULL OUTER JOIN (
    SELECT {group_dims}, {agg}({metric_b_field}) as {metric_b_alias}
    FROM {table_b} WHERE {period_col} = {period_b} GROUP BY {group_dims}
) b ON {join_conditions}
```
### 3.7 与现有 AI Native 基础设施的集成点

| 基础设施 | 用途 | 集成方式 |
|---|---|---|
| `CapabilityDefinition` + `CAPABILITIES` | 注册 `data_compare` 为平台级 Capability | 在 `app/ai/capabilities.py` 新增定义 |
| `AI Orchestrator` (`ai/router.py`) | 意图识别与路由 | 复用 `ai.chat` 入口，新增 ChatRoute |
| `table_columns` | 实时获取表结构和字段元数据 | 提供给 LLM 作上下文 + SchemaValidator 白名单校验 |
| `registered_tables` | 获取表的业务名称、是否月度表、period_ym 字段 | SchemaValidator 白名单校验 |
| `scope_strategy` | 自动行级权限过滤（cc_first/person_first/cross_filter） | 查询时自动注入 WHERE 条件 |
| `AutomationRule` + `engine.py` | 将常用对比保存为定期执行规则 | 复用现有 `automation.rules` CRUD（Phase 2） |
| `TriggerRegistry` | 注册新的触发器类型 `data_compare_scheduled` | Phase 2，复用现有 `scheduled_job_*` 触发器 |
| `FeishuNotification` | 对比结果飞书推送 | Phase 2，复用现有 `feishu_send_message` Action |
| `template_renderer.py` | 飞书消息中渲染对比结果摘要 | 复用 `{{变量}}` 渲染（Phase 2） |
| `SystemLog` | 审计所有对比查询 | 复用现有 `system_logs` |
| `deny_patterns.py` | 输出闸 `"sql"` 正则 | **不会被触发**（LLM 输出 JSON，非 SQL） |


---

## 4. 三类对比场景详细设计

> **注意**：以下 SQL 示例为**逻辑伪代码**，用于说明对比意图。实际执行的 SQL 由 `CompareTemplateEngine` 的三套固定模板编译生成（见 §3.2.3），LLM 不生成其中任何一行。

### 4.1 名单一致性对比

**场景**：检查两张表的员工名单是否一致，找出差异。

**用户输入示例**：
- "对比 2026年6月 月度花名册和月度工资表的员工名单"
- "检查 emp_monthly_roster 和 emp_monthly_salary 202606 的人员是否一致"

**对比逻辑**（等价于 §3.6.3 模板 1 `roster_engine`，此处仅作场景理解的逻辑示意，实际由模板编译生成）：

**输出示例**：

```text
📊 名单对比结果：emp_monthly_roster (202606) vs emp_monthly_salary (202606)

✅ 共有员工: 2,487 人
⚠️  仅存在于花名册: 3 人
   - EMP001 张三
   - EMP002 李四
   - EMP003 王五
⚠️  仅存在于工资表: 1 人
   - EMP004 赵六

结论：工资表比花名册多 1 人，少 3 人，名单不一致。
```

### 4.2 基本信息一致性对比

**场景**：检查同一员工在不同表中的基本信息字段是否一致。

**用户输入示例**：
- "对比 202606 月度花名册和实时花名册的部门、岗位信息"
- "检查月度工资表和月度花名册的员工姓名、部门是否一致"

**对比逻辑**（等价于 §3.6.3 模板 2 `field_engine`，此处仅作场景理解的逻辑示意，实际由模板编译生成）：

**输出示例**：

```text
📊 字段对比结果：emp_monthly_roster vs emp_realtime_roster (202606)

对比字段：employee_name, department, position

⚠️  发现 5 处差异，涉及 3 名员工：

| 员工编号 | 字段 | 月度花名册 | 实时花名册 |
|---------|------|----------|----------|
| EMP001  | department | 技术部 | 产品部 |
| EMP002  | position | 高级工程师 | 资深工程师 |
| EMP002  | department | 技术部 | 技术中心 |
| EMP003  | employee_name | 张姗 | 张珊 |
| EMP003  | department | 市场部 | 市场中心 |

💡 提示：department 字段差异可能因组织架构调整导致，请确认是否为预期变化。
```

### 4.3 金额汇总一致性对比

**场景**：检查两张表的金额汇总是否一致，可按维度分组。

**用户输入示例**：
- "对比 202606 月度工资表和成本分摊表的金额，按部门汇总"
- "检查 emp_monthly_salary 的应发合计和 emp_monthly_allocation 的分摊金额是否对得上，按成本中心汇总"

**对比逻辑**（等价于 §3.6.3 模板 3 `amount_engine`，此处仅作场景理解的逻辑示意，实际由模板编译生成）：

**输出示例**：

```text
📊 金额汇总对比：emp_monthly_salary vs emp_monthly_allocation (202606)
   对比维度：department | 容差：±1.00

| 部门 | 工资表金额 | 分摊表金额 | 差额 | 状态 |
|------|----------|----------|------|------|
| 技术部 | ¥1,250,000 | ¥1,250,000 | ¥0 | ✅ |
| 产品部 | ¥980,000 | ¥980,500 | ¥500 | ⚠️ |
| 市场部 | ¥760,000 | ¥755,000 | ¥5,000 | ❌ |
| 人力部 | ¥450,000 | - | - | ⚠️ 仅工资表 |

📈 汇总：
  - 工资表总计：¥3,440,000
  - 分摊表总计：¥2,985,500
  - 总差额：¥454,500
```

---

## 5. 数据模型

### 5.1 元数据查询（复用已有表，无需新建）

Skill 依赖以下已有表的查询：

```
table_columns
  → 获取: table_name, column_code, column_label, data_type, is_pk_part, agg_role, is_sensitive

registered_tables  
  → 获取: table_name, table_label, is_period, period_col, roster_join_col, scope_strategy

cost_center_tree → 用于按成本中心过滤
org_tree        → 用于按组织过滤
```

### 5.2 对比任务记录（新增）

为了支持 Phase 2 的自动化对比，需要一张记录表存储对比任务配置和执行结果。

> **注意**：`ai_skills.params` (JSONB) 已经存储完整的 CompareSpec JSON（§3.2-§3.3），包含 `source_a`/`source_b`（含 `prefilter`）、`join_keys`、`output` 以及引擎专属参数。`data_compare_tasks` 表是 Phase 2 自动化调度需要的**扁平化冗余副本**，方便调度器做索引查询和状态跟踪，不需要解析 JSONB。

```text
data_compare_tasks
├── id              BIGSERIAL PRIMARY KEY
├── skill_id        INTEGER REFERENCES ai_skills(id)          -- 关联的配置（Phase 2 建立）
├── name            VARCHAR(256) NOT NULL                    -- 任务名称
├── description     TEXT
├── compare_type    VARCHAR(32) NOT NULL                     -- 'roster' | 'field' | 'amount'
├── table_a         VARCHAR(64) NOT NULL                     -- 表A名称（冗余，方便索引）
├── table_b         VARCHAR(64) NOT NULL                     -- 表B名称（冗余，方便索引）
├── join_keys       JSONB NOT NULL                           -- 关联键字段列表
├── enabled         BOOLEAN DEFAULT FALSE
├── automation_rule_id INTEGER                               -- 关联的自动化规则ID（可选）
├── last_run_at     TIMESTAMP
├── last_status     VARCHAR(16)                              -- 'success' | 'partial_diff' | 'failed'
├── last_diff_count INTEGER DEFAULT 0
├── last_summary    JSONB                                    -- 最近一次对比摘要
├── created_by      INTEGER REFERENCES users(id)
├── created_at      TIMESTAMP DEFAULT NOW()
├── updated_at      TIMESTAMP DEFAULT NOW()
```

> **简化说明**：去掉了 `period_a`/`period_b`、`compare_fields`、`group_by`、`tolerance`、`filter_config` 等冗余列——这些全部在 `ai_skills.params` 的 CompareSpec JSON 中。`data_compare_tasks` 只保留调度器需要的维度（compare_type、table_a/b、join_keys）。

### 5.3 对比执行记录（新增）

```text
data_compare_runs
├── id              BIGSERIAL PRIMARY KEY
├── task_id         INTEGER NOT NULL REFERENCES data_compare_tasks(id) ON DELETE CASCADE
├── trigger_type    VARCHAR(32) NOT NULL           -- 'manual' | 'scheduled' | 'ai_chat'
├── status          VARCHAR(16) NOT NULL           -- 'success' | 'partial_diff' | 'failed'
├── diff_count      INTEGER DEFAULT 0
├── summary         JSONB                          -- 本次对比摘要
├── detail          JSONB                          -- 差异明细（可能较大）
├── execution_sql   TEXT                           -- 执行的SQL
├── duration_ms     INTEGER
├── error_message   TEXT
├── triggered_by    INTEGER REFERENCES users(id)
├── started_at      TIMESTAMP NOT NULL
├── finished_at     TIMESTAMP
```

---

## 6. API 设计

### 6.1 AI 对话入口（复用已有）

```
POST /api/v1/ai/chat
```

请求中通过 `user_message` 自然语言描述对比需求，由 AI Orchestrator 路由到 `data_compare` 能力。

### 6.2 对比任务 CRUD（新增）

```
POST   /api/automation/data-compare/tasks        创建对比任务
GET    /api/automation/data-compare/tasks        查询对比任务列表
GET    /api/automation/data-compare/tasks/{id}   获取单个任务
PATCH  /api/automation/data-compare/tasks/{id}   更新任务
DELETE /api/automation/data-compare/tasks/{id}   删除任务
POST   /api/automation/data-compare/tasks/{id}/run   手动执行对比
GET    /api/automation/data-compare/tasks/{id}/runs  查询执行记录
```

### 6.3 元数据查询（新增，供前端选择器使用）

```
GET /api/automation/data-compare/tables              获取可对比的表列表（含字段）
GET /api/automation/data-compare/tables/{table}/keys 获取表的关联键候选字段
GET /api/automation/data-compare/tables/{table}/fields?data_type=number  获取可对比/汇总的字段
```

### 6.4 Schema 定义

> **核心设计决策**：API 接受完整 CompareSpec JSON（§3.2-§3.3），不做扁平拆解。前端/LLM 输出什么结构，后端就收什么结构——这避免了"扁平化→再组装"的信息损耗。Pydantic 模型直接复用 §3.2-§3.3 中定义的 `CompareSpecEnvelope` / `CompareSpecRoster` / `CompareSpecField` / `CompareSpecAmount`。

**SkillCreate（对齐 ai_skills 表）**:
```python
class SkillCreate(BaseModel):
    name: str = Field(min_length=1, max_length=256)
    description: str | None = None
    instruction: str | None = None      # 用户原始需求描述（展示用，不参与执行）
    params: CompareSpecEnvelope         # 完整 CompareSpec（roster/field/amount 三种之一）
```

**SkillOut**:
```python
class SkillOut(BaseModel):
    id: int
    name: str
    description: str | None
    skill_type: str                     # 固定 "data_compare"
    instruction: str | None
    params: CompareSpecEnvelope
    status: str
    source: str
    last_run_at: datetime | None
    last_run_result: dict | None
    run_count: int
    created_at: datetime
    updated_at: datetime
```

**DataCompareRunOut**:
```python
class DataCompareRunOut(BaseModel):
    id: int
    skill_id: int
    trigger_type: str
    status: str
    diff_count: int
    summary: dict | None
    detail: dict | None         # 差异明细（分页返回）
    duration_ms: int | None
    error_message: str | None
    started_at: datetime
    finished_at: datetime | None
```

---

## 7. 前端设计（v0.3 修订：首期精简）

### 7.1 首期范围

首期只保留一个轻量管理列表页 + AI 对话中的对比结果卡片。以下组件**推迟到后续迭代**：

| 推迟组件 | 原因 |
|---|---|
| AiSkillManagement/AiSkillEditor | 过度工程；首期只需一个对比配置列表页 |
| SkillCard/SkillLibraryPanel | AI 助手中的技能库 Tab 为通用技能中心概念，超出本 spec |
| SaveSkillDialog | 对话中保存可以复用简单的确认弹窗，不需要独立组件 |

### 7.2 首期前端组件清单（极简）

```text
frontend/src/
  views/tools/
    DataCompareTaskList.vue       -- 对比任务管理列表页（轻量卡片网格 + 简单CRUD）
  components/ai/
    CompareResultCard.vue         -- AI 对话中的对比结果卡片（差异高亮）
  api/
    data-compare.ts               -- 前端 API 封装（复用 ai-skills 后端）
```

### 7.3 管理列表页 `DataCompareTaskList.vue`

- 路由: `/tools/data-compare`
- 菜单code: `tools.data_compare`
- 位置: 提效工具 → 数据对比任务（放在"自动通知"下方）
- 功能：
  - 卡片网格展示已保存的对比配置（名称、类型标签、上次执行时间、差异数量）
  - 新建对比配置：手动输入名称 + 描述 → 跳转 AI 对话
  - 运行：直接执行已保存的对比配置
  - 编辑/删除/查看历史
  - 筛选：按对比类型（名单/字段/金额）、按状态（已启用/草稿/归档）

### 7.4 对比结果展示组件 `CompareResultCard.vue`

核心职责：
- 差异高亮（行级红/黄/绿标记）
- 汇总统计卡片（总数、一致、差异）
- 支持筛选（只看差异、按部门/成本中心过滤）
- 导出按钮（CSV/Excel）
- 底部"保存配置"按钮 → 弹窗输入名称 → POST /api/ai/skills

---

## 8. AI Capability 注册

### 8.1 新增 Capability

在 `app/ai/capabilities.py` 中注册：

```python
CapabilityDefinition(
    capability_id="data.compare",
    name="跨表数据对比检查",
    module="data_compare",
    type="query",            # 只读查询，不写数据
    description=(
        "根据自然语言描述对比两张表的数据一致性。支持三种对比类型："
        "1) 名单对比 — 检查双方员工是否一致；"
        "2) 字段对比 — 检查指定字段值是否一致；"
        "3) 金额对比 — 检查汇总金额是否一致。"
        "LLM 输出结构化 CompareSpec，后端用预定义参数化模板编译 SQL，"
        "LLM 不生成任何 SQL 代码。"
    ),
    required_permission=None,  # 权限由 scope_strategy 行级过滤控制
    risk_level="low",
    side_effect_tags=[],
    confirmation="none",
    tools=[
        "data_compare.list_comparable_tables",
        "data_compare.get_table_columns",
        "data_compare.execute_compare",    # 接受 CompareSpec，非 SQL
        "data_compare.format_result",
    ],
    policy_profile={
        "output_contract": "data_compare_compare_spec_schema",  # CompareSpec schema
        "allowed_side_effect": "none",
        "deny_patterns": [],
        # 注意：LLM 输出是 JSON，不会命中 deny_patterns["sql"] 正则
        # 模型输出中不包含 select/from/join/where 等 SQL 关键字
        "table_whitelist": "registered_tables_only",
        "column_whitelist": "table_columns_metadata_only",
        "row_filter": "scope_strategy_auto_inject",
    },
    model_profile="reasoning",
    sensitive_context="metadata_only",   # 只传表结构，不传实际数据
    examples=[
        "对比2026年6月月度花名册和月度工资表的员工名单",
        "检查6月工资表和花名册的部门、岗位信息是否一致",
        "对比6月工资表的应发合计和分摊表的分摊金额，按部门汇总",
        "检查所有月度表的6月数据名单是否与实时花名册一致",
    ],
    failure_modes=[
        "表不存在或未注册",
        "月份参数缺失（月度表必须指定 period_ym）",
        "关联键字段不存在于其中一张表",
        "对比字段不存在于其中一张表",
        "用户无权访问其中一张表（scope_strategy 拒绝）",
        "CompareSpec Schema 校验失败（字段白名单/类型不匹配）",
        "金额字段类型不兼容（非 number 类型）",
    ],
)

# Phase 2 能力
CapabilityDefinition(
    capability_id="data.compare.automate",
    name="创建定期数据对比任务",
    module="data_compare",
    type="write",
    description=(
        "将一次数据对比保存为定期执行的自动化任务。"
        "对比结果可通过飞书推送。必须用户确认后才能保存和启用。"
    ),
    required_permission=("automation.rules", "C"),
    risk_level="medium",
    side_effect_tags=["writes_data"],
    confirmation="required",
    tools=[
        "data_compare.save_task",
        "automation.create_rule",
        "automation.enable_rule",
    ],
    policy_profile={
        "output_contract": "data_compare_task_schema",
        "requires_confirmation": True,
        "allowed_side_effect": "writes_data",
    },
    model_profile="none",
    sensitive_context="none",
    examples=[
        "保存这个对比，每月10号自动执行",
        "把这个对比加入定期任务，结果发给薪酬群",
    ],
    failure_modes=[
        "用户未确认保存",
        "定时规则校验失败",
        "用户无创建自动化的权限",
    ],
)
```

### 8.2 Tool 定义

```python
# Tool: data_compare.list_comparable_tables
# 返回所有 registered_tables 中可对比的表列表（含字段摘要）

# Tool: data_compare.get_table_columns  
# 返回指定表的所有 table_columns 字段元数据（供 LLM 构建 CompareSpec）

# Tool: data_compare.execute_compare
# 输入: CompareSpec（JSON 结构化参数）
# 内部: Schema Validator → CompareTemplateEngine 编译 → QueryExecutor 执行
# 不接收 SQL！入参是结构化 JSON

# Tool: data_compare.format_result
# 将原始查询结果格式化为对比摘要和差异明细
```

---

## 9. 安全设计

### 9.1 编译期安全（LLM 输出 → CompareSpec）

由于 LLM 输出的是结构化 JSON（非 SQL），安全边界从"拦截危险 SQL"前移到"校验结构化参数"：

| 层级 | 校验内容 | 实现位置 |
|---|---|---|
| Schema 校验 | CompareSpec 结构完整性（必填字段、类型检查） | SchemaValidator |
| 表名白名单 | 只允许 `registered_tables` 中注册的表 | SchemaValidator |
| 列名白名单 | 只允许 `table_columns` 中注册的列 | SchemaValidator |
| 类型语义检查 | amount 对比必须有 group_by + number 类型字段 | SchemaValidator |

### 9.2 执行期安全（编译后 SQL 执行）

| 层级 | 校验内容 | 实现位置 |
|---|---|---|
| 标识符映射 | column/field/group_by 等标识符仅从 `table_columns` 白名单取真值映射，**不接受 LLM 或用户传入的原始字符串** | CompareTemplateEngine |
| 行级过滤 | 自动注入 scope_strategy WHERE 条件 | QueryExecutor |
| 列级脱敏 | 查询结果中 is_sensitive=true 的字段自动脱敏 | ResultFormatter |
| 查询超时 | `statement_timeout = 30s` | QueryExecutor |
| 结果行数 | `max_rows = 10000`，超出截断并提示 | QueryExecutor |

### 9.3 为什么不需要 SQL 校验层

- LLM **不生成 SQL**，只输出结构化 JSON（`CompareSpec`）
- SQL 由后端的固定模板编译生成，开发者维护模板，**不会产生语法错误或注入风险**
- `deny_patterns.py` 中的 `"sql"` 正则在 LLM 输出 JSON 时**不会触发**（JSON 中不含 `select`/`insert`/`from`/`where` 等关键词）
- 这一点已在 `app/ai/deny_patterns.py` + `app/ai/policy_guard.py` 中验证确认

### 9.4 权限

- 对比任务查看：开放给所有有表 V 权限的用户
- 对比任务创建/编辑/删除：仅创建者和管理员
- 实际数据查询：由 scope_strategy 行级过滤，无需额外权限配置
- AI 对话中临时对比：不做额外权限校验（scope_strategy 保证数据安全）
- 飞书推送结果：仅发送差异摘要和计数，**不推送具体员工明细数据**（Phase 2）

### 9.5 数据最小化

- AI 对话上下文中**只传表结构元数据（column_code, column_label, data_type）**，不传实际数据行
- LLM 输出是 JSON 参数，不包含任何实际数据
- 飞书通知消息中只包含：对比表名、对比类型、差异数量、差异摘要（Phase 2）
- 数据明细仅在前端页面查看，不通过飞书或外部渠道暴露

---

## 10. 测试策略

### 10.1 单元测试

| 测试对象 | 测试范围 |
|---|---|
| `MetadataLoader` | 正确读取 table_columns + registered_tables；月度表自动识别 period_col |
| `SchemaValidator` | CompareSpec 结构校验；表名/字段白名单；必填项检查 |
| `CompareTemplateEngine` | 三类模板编译正确性；月度表自动 period_ym 过滤；参数化SQL语法无误 |
| `ResultFormatter` | 差异高亮逻辑；汇总统计计算；敏感字段脱敏 |

### 10.2 集成测试

至少覆盖以下链路：

```text
名单对比:
  用户输入 → AI Orchestrator 路由 → MetadataLoader → LLM 产出 CompareSpec → 
  SchemaValidator → CompareTemplateEngine 编译 → QueryExecutor → ResultFormatter → 返回结构化结果

字段对比:
  同上，额外校验：compare_fields 白名单、多字段差异检测

金额对比:
  同上，额外校验：group_by 模式、容差处理、FULL OUTER JOIN 正确性
```

### 10.3 E2E 测试（AI Capability Eval）

按照 AI 能力注册表标准，每个 capability 至少维护 10 个 eval case：

```json
{
  "capability_id": "data.compare",
  "cases": [
    {
      "case_id": "dc-001",
      "input_context": {"period_ym": "202606"},
      "user_message": "对比6月花名册和工资表的员工名单",
      "expected_intent": "data.compare",
      "expected_compare_type": "roster",
      "expected_tables": ["emp_monthly_roster", "emp_monthly_salary"],
      "expected_query_spec_contains": ["compare_type", "roster", "employee_no"],
      "forbidden_in_output": ["select", "from", "where", "join", "FULL OUTER JOIN", "INSERT", "DELETE", "DROP"],
      "expected_answer_points": ["共有员工", "仅存在于花名册", "仅存在于工资表"]
    }
  ]
}
```

### 10.4 Phase 2 端到端验收

```
完整链路:
  保存对比任务 
  → 创建 automation 规则（trigger=scheduled_job_success） 
  → 调度器触发 
  → automation engine 执行 
  → 飞书消息发送 
  → 对比结果可查看 
  → 执行记录可审计
```

---

## 11. 开发计划

### 总体原则

- **Step 0 先行**：先建轻量对比配置存储（ai_skills 表 + CRUD），让对比配置有地方存
- **Phase 1 跟上**：把模板化对比执行引擎做通（MetadataLoader → SchemaValidator → CompareTemplateEngine → QueryExecutor → ResultFormatter）
- **Phase 2 接上**：复用已有 automation + feishu 基础设施实现自动化
- **渐进交付**：名单对比 → 字段对比 → 金额对比，逐个类型交付

### Step 0 — 对比配置存储 + 轻量管理（先行）

**目标**：建立对比配置的存储和基本管理能力

**交付物**：

```
后端新增:
backend/app/data_compare/
  __init__.py
  skill_models.py             -- AiSkill SQLAlchemy 模型（skill_type = data_compare）
  skill_schemas.py            -- Pydantic schemas
  skill_service.py            -- CRUD + 直接执行服务（读 params → 模板编译 → 执行）
  skill_router.py             -- REST API 端点

Alembic:
alembic/versions/
  00xx_ai_skills.py           -- 创建 ai_skills 表

后端修改:
backend/app/ai/router.py      -- 注册 skill_router

前端新增:
frontend/src/
  views/tools/
    DataCompareTaskList.vue   -- 对比任务管理列表页（卡片网格）
  api/
    data-compare.ts           -- 前端 API 封装

前端修改:
frontend/src/
  router/index.ts             -- 新增 /tools/data-compare 路由
  constants/menuRoutes.ts     -- 新增 tools.data_compare 菜单映射
```

**API 设计**：
```
POST   /api/ai/skills              创建对比配置
GET    /api/ai/skills              查询配置列表（支持类型/状态筛选）
GET    /api/ai/skills/{id}         获取单个配置
PATCH  /api/ai/skills/{id}         更新配置
DELETE /api/ai/skills/{id}         删除配置
POST   /api/ai/skills/{id}/run     执行对比（读 params → 模板编译 → 返回结果）
GET    /api/ai/skills/{id}/runs    查看执行历史
```

**依赖**：无（纯基础设施，不依赖对比引擎）

**验收标准**：
- 左侧菜单出现"数据对比任务"（tools → 数据对比任务）
- 能新建对比配置（输入名称 + 描述）
- 能编辑/删除配置
- AI 对话结果下方有"保存配置"按钮，点击后能保存 CompareSpec

---

### Phase 1：模板化对比执行引擎（选项B核心）

#### Step 1.1 — 元数据加载器 `MetadataLoader`
**目标**：执行引擎能读取表结构和表注册信息

**交付物**：
```
backend/app/data_compare/
  __init__.py
  metadata.py              -- MetadataLoader 类
    - load_tables()        → 返回 registered_tables 列表
    - load_columns(table)  → 返回 table_columns 字段列表
    - get_join_keys(table) → 返回 is_pk_part=true 的字段
    - is_period_table(table)→ 检查是否月度表
    - get_period_col(table)→ 返回月度表的 period_ym 字段名
```

**关键实现**：
- 查询 `registered_tables` 获取所有可对比表
- 查询 `table_columns` 获取字段元数据（column_code, column_label, data_type, agg_role, is_pk_part, is_sensitive）
- 内置缓存：表结构变化频率低，同一对话中缓存查询结果

**依赖**：无（纯查询已有表）

**验收标准**：
- 能列出所有已注册表
- 能列出每张表的所有字段及其类型
- 能识别 is_pk_part=true 的关联键
- 能识别月度表的 period_col

---

#### Step 1.2 — CompareSpec 校验器 `SchemaValidator`
**目标**：校验 LLM 输出的 CompareSpec 结构化参数

**交付物**：
```
backend/app/data_compare/
  schemas.py               -- CompareSpecEnvelope + Roster/Field/Amount Pydantic models (见§3.2-§3.3)
  validator.py             -- SchemaValidator 类
    - validate(spec: CompareSpecEnvelope) → (is_valid, errors[])
    - source_a/b.table 白名单校验: 只允许 registered_tables 中的表
    - source_a/b.prefilter.column 白名单校验: 只允许 table_columns 中的列
    - source_a/b.prefilter.op 封闭枚举校验
    - join_keys 存在性: 关联键必须在两张表都存在
    - field.pairs[].field_a/field_b 存在性: 分别在各自表中存在
    - amount.metric_a/b.field 存在性 + 类型检查（number 类型）
    - amount.group_by 列存在性校验
    - 类型检查: roster 不需要 field/amount，field 不需要 amount 等
```

**关键实现**：
- 使用 Pydantic 做结构校验
- 额外做语义级校验（表存在性、列存在性、类型匹配）
- 校验失败返回详细错误信息供 LLM 修正

**依赖**：
- Step 1.1 的 MetadataLoader（获取实时白名单）

**验收标准**：
- 合法的 CompareSpec 通过
- 不存在的表名被拒绝
- 不存在的字段名被拒绝
- 缺少必填项被拒绝

---

#### Step 1.3 — 参数化模板编译引擎 `CompareTemplateEngine`
**目标**：根据 compare_type 选择预定义 SQL 模板，填参编译为安全的参数化 SQL

**交付物**：
```
backend/app/data_compare/
  templates.py             -- CompareTemplateEngine 类
    - compile(spec: CompareSpec) → (sql, params[])
    - 三套固定 SQL 模板:
      · _compile_roster()  → FULL OUTER JOIN 名单对比
      · _compile_field()   → INNER JOIN + WHERE 字段对比
      · _compile_amount()  → 子查询 GROUP BY + FULL OUTER JOIN 金额对比
    - 模板编译规则:
      · 表名、字段名通过参数化替换填入
      · 月度表自动加入 WHERE period_col = :period 条件
      · 金额对比根据 tolerance 参数调整差异判断阈值
```

**模板示例（roster）**：
```python
ROSTER_TEMPLATE = """
SELECT 
    COALESCE(a.{join_col}, b.{join_col}) as {join_col},
    CASE 
        WHEN a.{join_col} IS NULL THEN '仅存在于{table_b_label}'
        WHEN b.{join_col} IS NULL THEN '仅存在于{table_a_label}'
    END as diff_type
FROM (
    SELECT {join_col} FROM {table_a} {where_a}
) a
FULL OUTER JOIN (
    SELECT {join_col} FROM {table_b} {where_b}
) b ON a.{join_col} = b.{join_col}
WHERE a.{join_col} IS NULL OR b.{join_col} IS NULL
"""
```

**依赖**：
- Step 1.1 的 MetadataLoader（获取表名规范、period_col）
- Step 1.2 的 SchemaValidator（入参已校验）

**验收标准**：
- 名单对比：编译生成正确的 FULL OUTER JOIN SQL
- 字段对比：编译生成正确的 INNER JOIN + WHERE 条件
- 金额对比：编译生成正确的子查询 GROUP BY + FULL OUTER JOIN
- 编译结果不包含任何用户输入拼接（纯参数化）
- 月度表自动包含 period_ym 过滤

---

#### Step 1.4 — 安全查询执行器 `QueryExecutor`
**目标**：执行编译后的参数化 SQL，并自动注入权限过滤

**交付物**：
```
backend/app/data_compare/
  executor.py              -- QueryExecutor 类
    - execute(sql, params, db, user) → (rows, columns, duration_ms)
    - 自动注入 scope_strategy 行级过滤
    - 设置 statement_timeout = 30s
    - 限制 max_rows = 10000
    - 敏感字段自动脱敏
```

**关键实现**：
- 查询前 SET LOCAL statement_timeout = '30s'
- 根据 table 的 scope_strategy 自动添加 WHERE 条件
- 结果中 is_sensitive=true 的列做脱敏处理

**依赖**：
- 现有的 `ScopeTag` + `UserScopeTag` 权限表
- 现有的 `get_user_scopes()` 权限服务

**验收标准**：
- 正常查询返回完整结果
- 超时查询在 30s 后被终止
- 超出 10000 行的结果被截断并提示
- 用户 A 看不到用户 B 权限范围内的人员数据

---

#### Step 1.5 — AI LLM 集成（CompareSpec 生成）
**目标**：LLM 根据用户自然语言意图输出 CompareSpec

**交付物**：
```
backend/app/data_compare/
  ai_prompt.py             -- Prompt Builder + CompareSpec 解析
    - build_system_prompt(tables_meta) → str
    - parse_llm_output(llm_response) → CompareSpec
```

**System Prompt 结构**：
```text
你是一个数据对比配置专家。根据用户的自然语言描述，提取结构化对比参数（输出 CompareSpec JSON）。

## 可用表及字段
{table_schemas_json}

## 输出格式 — CompareSpec JSON

你必须输出一个 JSON 对象，使用以下结构：

{
  "compare_type": "roster" | "field" | "amount",

  // 两个数据源（见下方 DataSource 格式）
  "source_a": { ... },
  "source_b": { ... },

  // 关联键: 默认用 is_pk_part=true 的字段（如 ["employee_no"]）
  "join_keys": ["关联键字段"],

  // 结果呈现（可选，默认 only_diff=true, max_detail=200）
  "output": {"only_diff": true, "max_detail": 200},

  // 引擎专属参数 — 按 compare_type 三选一:
  "roster": { "direction": "both", "display_fields": ["工号","姓名","部门"] },
  "field": { "pairs": [{"field_a": "...", "field_b": "...", "mode": "exact"|"trim"|"numeric"}] },
  "amount": {
    "metric_a": {"agg": "sum"|"count"|"avg", "field": "金额字段"},
    "metric_b": {"agg": "sum"|"count"|"avg", "field": "金额字段"},
    "group_by": ["汇总维度"],
    "tolerance": {"type": "absolute"|"percent", "value": 0.5}
  }
}

## DataSource 格式
"source_a": {
  "table": "表名（必须在上面可用表中）",
  "period": "YYYYMM 或 null（is_period=true 的表必填）",
  "prefilter": [  // 可选，对比前先筛行
    {"column": "字段名", "op": "eq", "value": "值"},
    {"column": "字段名", "op": "in", "value": ["A","B"]}
  ]
}
prefilter.op 可选值: eq, ne, in, not_in, gt, gte, lt, lte, between, contains, is_null, is_not_null

## 规则
- roster: 检查两表名单是否一致，不需要 field/amount 参数
- field: 检查字段值是否一致，field_a 和 field_b 可以是不同的列名（允许跨表字段映射）
- amount: 检查汇总金额是否一致，支持多维 group_by 和 绝对/百分比容差
- 只输出 JSON，不要 markdown 代码块，不要解释
- 所有表名和字段名必须来自上面的可用表列表
- 月度表必须填 source.period
```

**LLM 输出 → 后处理**：
```python
# 1. 从 LLM response 中提取 JSON（可能包裹在 ```json 中）
# 2. Pydantic 解析为 CompareSpec
# 3. 传给 SchemaValidator 校验
# 4. 校验通过 → CompareTemplateEngine 编译 → QueryExecutor 执行
# 5. 校验失败 → 错误信息返回给 LLM 修正（最多 2 次重试）
```

**依赖**：
- 现有的 AI Provider 配置（`ai_provider_configs` 表）
- Step 1.1 MetadataLoader（提供表结构上下文）
- Step 1.2 SchemaValidator（校验 LLM 输出）
- Step 1.3 CompareTemplateEngine（编译执行）

**验收标准**：
- 自然语言 → 正确识别对比类型 → 输出合法 CompareSpec
- LLM 输出不包含任何 SQL 代码（只含 JSON）
- 错误输出被 SchemaValidator 拦截并提示修正
- 不存在表的表名被拦截

---

#### Step 1.6 — 结果格式化器 `ResultFormatter`
**目标**：将原始查询结果格式化为人类可读的对比报告

**交付物**：
```
backend/app/data_compare/
  formatter.py             -- ResultFormatter 类
    - format(rows, columns, compare_type) → CompareResult
    - 名单对比: 汇总统计 + 差异列表 + 结论
    - 字段对比: 差异表格 + 字段级汇总
    - 金额对比: 金额对比表 + 容差标记 + 汇总
```

**验收标准**：
- 名单对比输出包含：共有数、仅在A、仅在B
- 字段对比输出包含：差异行、差异字段、差异数量
- 金额对比输出包含：维度分组汇总、差额、容差判断
- 敏感字段在输出中被脱敏
- 结果超过 200 条差异明细时截断并有提示

---

#### Step 1.7 — AI Capability 集成 + 前端展示
**目标**：把对比能力注册为平台 Capability，前端能展示对比结果

**交付物**：
- `app/ai/capabilities.py` 新增 `CapabilityDefinition(data.compare)`
- `app/data_compare/router.py` 新增 AI Tool 端点
- `app/ai/router.py` 新增 ChatRoute（intent='data.compare'，意图路由，零关键词匹配）
- `frontend/src/components/ai/CompareResultCard.vue` — 对比结果卡片
- `frontend/src/api/data-compare.ts` — 前端 API 封装

**验收标准**：
- 用户在 AI 对话中说"对比6月花名册和工资表名单"，得到对比结果
- 结果以结构化卡片形式展示（差异高亮：红/黄/绿）
- 金额列格式化为 ¥12,345.67
- 卡片底部有"保存配置"按钮

---

### Phase 2：自动化定期对比（方案C扩展）

#### Step 2.1 — 对比任务持久化
**目标**：将一次对比的需求保存为可复用的任务配置

**交付物**：
- `app/data_compare/models.py` — `DataCompareTask` + `DataCompareRun` SQLAlchemy 模型
- Alembic migration（创建两张新表）
- `app/data_compare/router.py` 新增 CRUD 端点
- `app/data_compare/task_service.py` — 任务 CRUD + 执行服务

**依赖**：
- Phase 1 全部完成（对比核心链路已验证）

**验收标准**：
- POST /data-compare/tasks 保存任务
- GET /data-compare/tasks 列出所有任务
- POST /data-compare/tasks/{id}/run 手动执行
- 执行结果写入 data_compare_runs 表

---

#### Step 2.2 — 触发器注册（重用 Scheduler）
**目标**：对比任务能绑定定时调度

**实现方式**：复用现有 `scheduled_jobs` 表。创建对比任务时，自动创建一个 `kind = "data_compare"` 的 ScheduledJob。

```python
# 在 task_service.py 中
async def create_scheduled_compare_task(data, db, user):
    # 1. 创建 DataCompareTask
    task = DataCompareTask(**data.dict())
    
    # 2. 如果需要定时，创建 ScheduledJob
    if data.cron_expression:
        job = ScheduledJob(
            kind="data_compare",
            business_id=task.id,
            cron=data.cron_expression,
            payload={"task_id": task.id},
            enabled=False,  # 默认不启用
        )
    
    # 3. 创建 AutomationRule（飞书通知）
    if data.enable_notification:
        rule = AutomationRule(
            name=f"[数据对比] {data.name}",
            biz_type="data_compare",
            trigger_type="scheduled_job_success",
            trigger_config={"biz_id": str(job.id)},
            actions_config=[{
                "type": "feishu_send_message",
                "name": "发送对比结果",
                "enabled": True,
                "config": {
                    "receivers": data.notification_receivers,
                    "message": {
                        "message_format": "markdown",
                        "title_template": "数据对比完成: {{task_name}}",
                        "content_template": "对比结果摘要...",
                    },
                },
            }],
            enabled=False,
        )
```

**依赖**：
- 现有 `scheduler/engine.py` 中的 `JOB_HANDLERS` 注册机制
- Step 2.1 的 task_service

**新增 Scheduler Handler**：
```python
# 在 scheduler/handlers.py 中新增
async def _handler_data_compare(job: ScheduledJob, db, triggered_by: str):
    task_id = job.payload["task_id"]
    task = await get_task(task_id, db)
    result = await execute_compare(task, db)
    # 记录执行结果
    # 发布事件 → 触发 automation rule
```

**验收标准**：
- 创建对比任务时可选择"每月10号 09:00 执行"
- 到期自动触发对比
- 执行结果可追溯

---

#### Step 2.3 — 飞书通知集成
**目标**：对比完成后，差异结果通过飞书推送

**实现方式**：完全复用现有 `automation` + `feishu` 基础设施。

```
对比任务执行完成
  → data_compare handler 发布 scheduled_job_success 事件
  → automation engine 匹配规则
  → feishu_send_message action 执行
  → 飞书通知发送
```

**飞书消息模板示例**：
```markdown
📊 数据对比完成：月度花名册 vs 月度工资表 (202606)
触发时间：2026-07-10 09:00
执行时长：2.3s

📈 对比结果：
  - 共有员工：2,487 人
  - 差异：4 人
    · 仅花名册 3 人
    · 仅工资表 1 人
  - 状态：⚠️ 名单不一致

👉 查看详情：[对比详情页链接]
```

**敏感数据保护**：
- 飞书消息**只推送差异统计数字**，不推送具体员工姓名和金额明细
- 查看详情需跳转到 Portal 页面（权限受控）

**依赖**：
- 现有 `feishu_client.py`（已实现）
- 现有 `notification_service.py`（已实现）
- 现有 `automation/engine.py`（已实现）
- 现有 `automation/rule_service.py`（已实现）

**验收标准**：
- 对比完成后飞书群收到通知消息
- 消息包含对比摘要（统计数字，不含敏感明细）
- 消息中的链接能正确跳转到详情页
- 对比无差异时不发送通知（可选配置）

---

#### Step 2.4 — 自动化任务绑定（前端复用对比配置管理页）
**目标**：将对比配置与自动化规则关联，实现定期执行

**实现方式**：复用 Step 0 的对比配置管理页面 + Phase 2 的后端调度。不需要新建前端页面。

在对比任务管理页面中，任务卡片增加"绑定定时"按钮：
- 点击 → 弹出定时配置（cron 表达式 / 预设频率）
- 保存 → 创建 AutomationRule + ScheduledJob
- 技能卡片显示"已绑定定时"标签

**交付物**：
```
前端修改:
frontend/src/
  views/system/AiSkillManagement.vue  -- 增加"绑定定时"按钮
  components/ai/
    ScheduleBindingDialog.vue         -- 定时绑定对话框 (新增)
```
```

**依赖**：
- Step 2.1 的后端 CRUD API
- Phase 1 的 `CompareResultCard.vue`

**验收标准**：
- 能创建名单/字段/金额三种对比任务
- 表选择器从后端动态加载 registered_tables
- 字段选择器根据类型智能过滤（金额对比只显示 number 类型）
- 能手动触发执行并查看结果

---

## 12. 文件清单

### Step 0 新增文件（对比配置存储 + 轻量管理）

```
后端:
backend/app/data_compare/
  __init__.py
  skill_models.py             -- AiSkill 模型
  skill_schemas.py            -- Pydantic schemas
  skill_service.py            -- CRUD + 直接执行服务
  skill_router.py             -- REST API

Alembic:
alembic/versions/
  00xx_ai_skills.py           -- ai_skills 表

前端:
frontend/src/
  views/tools/
    DataCompareTaskList.vue   -- 对比任务管理列表页
  api/
    data-compare.ts           -- 前端 API

前端修改:
  router/index.ts             -- 新增 /tools/data-compare 路由
  constants/menuRoutes.ts     -- 新增 tools.data_compare 菜单映射
```

### Phase 1 新增文件（模板化对比执行引擎）

```
后端:
backend/app/data_compare/
  metadata.py              -- MetadataLoader（表结构查询）
  schemas.py               -- CompareSpec + CompareResult Pydantic models
  validator.py             -- SchemaValidator（CompareSpec 校验）
  templates.py             -- CompareTemplateEngine（三套 SQL 模板 + 编译）
  executor.py              -- QueryExecutor（安全执行 + scope_strategy）
  formatter.py             -- ResultFormatter（差异高亮 + 摘要）
  ai_prompt.py             -- Prompt Builder（LLM → CompareSpec 生成）

后端修改:
backend/app/ai/
  capabilities.py          -- 新增 data.compare CapabilityDefinition
  router.py                -- 新增 ChatRoute handler

前端新增:
frontend/src/
  components/ai/
    CompareResultCard.vue  -- AI 对话中的对比结果卡片
```

### Phase 2 新增文件

```
后端:
backend/app/data_compare/
  models.py                -- DataCompareTask, DataCompareRun
  task_service.py          -- 任务 CRUD + 执行服务
  router.py                -- REST API 端点

Alembic:
alembic/versions/
  00xx_data_compare_tasks.py

后端修改:
backend/app/scheduler/
  handlers.py              -- 新增 _handler_data_compare

前端新增:
frontend/src/
  views/automation/
    DataCompareTaskList.vue   (Phase 2 增强：添加定时绑定)
    DataCompareRunDetail.vue
  components/ai/
    ScheduleBindingDialog.vue -- 定时绑定对话框
```

---

## 13. 依赖关系图

```text
Phase 1:
  MetadataLoader ─────────────────────────────────────┐
  (独立，仅查询已有表)                                  │
                                                      │
  SchemaValidator ───────────────────────────────────┤
  (依赖 MetadataLoader 提供表/字段白名单)               │
                                                      │
  CompareTemplateEngine ─────────────────────────────┤
  (依赖 SchemaValidator 保证入参合法)                   ├──→ AI LLM 集成
  (三套固定 SQL 模板，不可变)                           │    (依赖以上所有)
                                                      │
  QueryExecutor ─────────────────────────────────────┤
  (依赖 MetadataLoader + ScopeTag 权限表)              │
                                                      │
  ResultFormatter ───────────────────────────────────┤
  (独立的格式化逻辑)                                    │

Phase 2:
  models.py + task_service.py → router.py → 前端页面
  scheduler handler → automation rule → feishu notification
```

**关键架构注记**：
- LLM 输出路径 vs 直接执行路径是两个独立路径
- LLM 路径：自然语言 → CompareSpec → 模板编译 → SQL 执行
- 直接路径：存储的 CompareSpec → 模板编译 → SQL 执行
- 两者共享 CompareTemplateEngine + QueryExecutor + ResultFormatter
- LLM **不生成 SQL**，只输出结构化 JSON 参数

---

## 14. 风险评估

| 风险 | 影响 | 缓解措施 |
|---|---|---|
| LLM 输出的 CompareSpec 解析失败 | 无法执行对比 | SchemaValidator 拦截 + 最多 2 次 LLM 修正重试 |
| LLM 选错对比类型或表名 | 对比结果不准确 | 表名/字段白名单拒绝，返回错误提示 |
| 大表查询性能问题 | 查询超时或拖慢数据库 | 30s timeout + 10000 行限制 + 建议加索引 |
| scope_strategy 注入复杂 | 权限过滤错误 | Phase 1 先用简单策略，逐步覆盖三种模式 |
| 敏感数据泄露 | 合规风险 | 多层脱敏 + 飞书只推统计不推明细 |
| 语义层未建成（ai_semantic_datasets 等表不存在） | 需要自己做表结构映射 | 无需语义层——模板引擎直接操作 registered_tables + table_columns，无额外依赖 |
| 依赖 AI Provider 可用性 | 无法生成 CompareSpec | 配置直接执行路径（读已存储 params，跳过 LLM）

---

## 15. 验收标准总览

### Phase 1 验收

- [ ] 用户通过 AI 对话输入对比需求，得到结构化对比结果
- [ ] 名单对比：能正确识别只在A表/只在B表的员工
- [ ] 字段对比：能正确识别指定字段不一致的记录
- [ ] 金额对比：能按维度分组汇总并对比金额差额
- [ ] 对比结果包含汇总统计和差异明细
- [ ] 危险 SQL 被拦截，用户不会因此造成数据损坏
- [ ] 用户的 scope_strategy 权限被正确应用
- [ ] 敏感字段在结果中被脱敏
- [ ] 至少沉淀 15 个 eval case（每种类型 5 个）

### Phase 2 验收

- [ ] 对比任务可以保存为定时任务
- [ ] 定时触发后自动执行对比
- [ ] 差异结果通过飞书推送（仅统计数字）
- [ ] 飞书消息中的链接能跳转到 Portal 详情页
- [ ] 执行记录可查询、可审计
- [ ] 前端能创建/编辑/删除/手动执行对比任务
- [ ] 端到端链路：创建任务 → 定时触发 → 飞书通知 → 查看详情

---

## 16. 与路线图的对应关系

| 路线图阶段 | 本项目贡献 |
|---|---|
| Phase 1（首个场景验证） | `data.compare` 作为只读 Capability，验证底座从公式扩展到数据对比 |
| Phase 2（多场景复用） | `data.compare` 证明 AI 底座可被数据管理场景复用 |
| Phase 5（工作流编排） | `data.compare.automate` 可作为编排中的一步，组合为"数据同步 → 对比 → 通知" |
| Phase 6（渠道扩展） | 对比结果飞书推送是外部渠道的典型用例 |

---

## 17. 开放问题

1. **scope_strategy 自动注入的实现程度**：Phase 1 是否需要完整实现三种策略（person_first/cc_first/cross_filter），还是先只支持最简单的？
2. **对比结果前端展示的详细程度**：差异明细是全部渲染在对话卡片中，还是通过链接跳转到独立页面？
3. **模板扩展性**：三类固定模板是否足够覆盖未来场景？如果出现第四类对比（如多表关联对比），模板体系如何扩展？
4. **历史对比趋势**：是否需要对比任务的历史趋势（如"连续3个月名单一致"）？
5. **对比任务的权限**：是否所有人都能看到所有对比任务？还是按创建人隔离？
6. **飞书推送的内容粒度**：确认只推送统计数字、不推送员工明细的策略是否可行？
7. **AI 对话重试上限**：CompareSpec 校验失败后最多让 LLM 重试几次？2 次是否合理？
