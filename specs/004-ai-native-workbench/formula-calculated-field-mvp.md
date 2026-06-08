# AI + Excel 公式计算字段 MVP 规格

版本：v0.1  
日期：2026-06-08  
状态：待开发  
适用项目：`D:\AI项目\HR提效工具搭建\hr-portal`

## 1. 目标

首期实现“AI 基础配置 + Excel 公式组件 + 数据集级计算字段”，并把首个业务落点放在现有报表编辑器：

```text
报表编辑 -> 报表设置 -> 可选字段 -> 新建字段
```

用户可以在基于数据集的报表中，通过自然语言描述字段计算逻辑，由 LLM 转译为 Excel 风格公式。用户确认后，该字段保存为“数据集级计算字段”。之后所有基于同一个数据集创建或编辑的报表，都可以在可选字段中看到并使用这些计算字段。

核心原则：

```text
LLM 只生成公式草稿。
公式组件负责校验和预览。
数据集负责沉淀字段。
报表执行管道负责计算、权限、脱敏、聚合和导出。
```

平台归属：

```text
计算字段不是一个孤立 AI 功能，而是 AI 原生 HR 工作台下的首批 Capability 场景。
```

相关能力必须注册到 AI 能力注册表：

| capability_id | 类型 | 说明 |
|---|---|---|
| `function_catalog.query` | answer/query | 查询函数是否存在、是否启用、如何使用 |
| `formula.generate` | draft | 根据自然语言和字段元数据生成公式草稿 |
| `formula.explain` | answer | 解释公式含义 |
| `formula.validate` | diagnose | 校验公式并解释错误 |
| `formula.repair` | draft | 根据校验错误修复公式草稿 |
| `calculated_field.create_draft` | draft | 生成计算字段元数据草稿 |
| `calculated_field.save` | write | 保存数据集计算字段，必须确认 |

页面不得直接拼 prompt 调模型，必须通过统一 AI 编排层或已注册 Capability 接口调用。

## 2. 首期范围

### 2.1 本期做

- AI 基础配置接入。
- Excel 公式公共组件。
- 自然语言转公式。
- 函数库管理接入。
- 数据集级计算字段 CRUD。
- 报表编辑器“可选字段”下新增“新建字段”入口。
- 报表预览和导出支持计算字段。
- 敏感字段依赖继承。
- AI 调用日志写入统一日志管理。
- 公式保存审计。

### 2.2 本期不做

- 不做独立 Node.js/Go LLM 网关。
- 不做飞书机器人。
- 不允许 LLM 生成 SQL 并执行。
- 不允许 LLM 生成 Python/JavaScript 代码并执行。
- 不支持管理员上传任意代码型自定义函数。
- 不支持公式函数直接读取未授权 HR 敏感数据。
- 不支持跨行窗口函数，例如上一行、累计排名、同比环比。
- 不支持在单表报表中沉淀计算字段；首期只支持数据集级计算字段。

## 3. 公共库选型

### 3.1 推荐首期库：`formulas`

首期推荐引入 Python 库：

```text
formulas
```

选择理由：

- 当前 HR Portal 后端是 FastAPI / Python，报表运行、导出、权限过滤、脱敏都在后端完成。计算字段必须在后端执行，才能保证预览和导出一致。
- `formulas` 可解析、编译和执行 Excel 公式，不依赖本机 Excel 或 COM 服务。
- 支持自定义函数注册，适合后续扩展公司内部计算函数。
- 函数覆盖率较高，官方文档统计 483 / 536，约 90.1%。
- 与现有 `run_dataset_query` 的 Python 端转置、聚合、导出管道更容易集成。

待确认风险：

- `formulas` 使用 EUPL 1.1+ 许可证。正式生产使用前需要做一次公司法务/开源合规确认。

### 3.2 为什么不首选 HyperFormula

HyperFormula 是成熟的表格公式引擎，支持大量函数、自定义函数、浏览器和 Node.js 环境，能力很强。

但首期不建议作为主执行引擎：

- 当前报表执行在 Python 后端，使用 JS 引擎会引入额外服务或运行时边界。
- 许可证是 GPLv3 或商业授权，闭源内部系统长期使用存在授权确认成本。
- 若前端和后端分别校验/执行，容易出现公式结果不一致。

后续可作为前端即时预览增强，但不能替代后端执行。

### 3.3 为什么不首选 Formula.js

Formula.js 更像 Excel 函数集合，而不是完整公式执行引擎。它适合执行 `SUM([1,2,3])` 这类函数调用，不适合直接作为“报表计算字段公式字符串”的主执行引擎。

## 4. 组件化设计

Excel 能力必须作为可复用组件，而不是只写死在报表编辑器。

### 4.1 后端模块

建议新增：

```text
backend/app/ai_formula/
├── __init__.py
├── router.py
├── models.py
├── schemas.py
├── field_refs.py
├── formula_parser.py
├── formula_validator.py
├── formula_evaluator.py
├── formula_safety.py
├── custom_functions.py
└── dataset_fields.py
```

职责：

- `field_refs.py`：字段引用规范化，例如 `[工资.基本工资]` 与内部字段 code 的互转。
- `formula_parser.py`：解析公式依赖字段、函数清单。
- `formula_validator.py`：校验公式语法、字段存在性、函数可用性。
- `formula_evaluator.py`：按单行数据计算公式值。
- `formula_safety.py`：拦截危险公式。
- `custom_functions.py`：注册纯计算自定义函数。
- `dataset_fields.py`：数据集级计算字段 CRUD 与元数据注入。

### 4.2 前端组件

建议新增：

```text
frontend/src/components/formula/
├── FormulaFieldEditor.vue
├── FormulaAiDrawer.vue
├── FormulaFunctionPicker.vue
├── FormulaFieldPicker.vue
└── FormulaPreviewPanel.vue
```

首个使用点：

```text
frontend/src/components/report/ReportFieldWorkbench.vue
```

组件职责：

- 自然语言输入。
- 字段选择插入。
- 自定义函数选择插入。
- 公式草稿展示。
- 公式手工编辑。
- 校验错误提示。
- 示例数据预览。
- 保存为数据集计算字段。

## 5. 数据模型

### 5.1 数据集计算字段

新增表：

```text
dataset_calculated_fields
- id
- dataset_id
- code
- label
- description
- formula
- formula_display
- data_type
- agg_role
- depends_on
- used_functions
- is_sensitive
- is_active
- created_by
- created_at
- updated_at
```

字段说明：

```text
dataset_id       绑定数据集。
code             稳定字段编码，建议格式 calc_<slug> 或 calc_<id>。
label            显示名，例如“个税金额”。
formula          后端内部公式，使用稳定字段引用。
formula_display  前端展示公式，保留用户可读字段名。
data_type        string / number / date / datetime / bool。
agg_role         dimension / measure。
depends_on       JSON 数组，记录依赖字段 code。
used_functions   JSON 数组，记录使用到的函数。
is_sensitive     结果是否敏感。
is_active        停用后不再出现在可选字段。
```

约束：

```text
UNIQUE(dataset_id, code)
UNIQUE(dataset_id, label) 可选，若允许同名则不加
```

### 5.2 函数库

新增表：

```text
formula_functions
- id
- code
- name
- description
- function_type
- parameters
- return_type
- formula_body
- is_enabled
- is_sensitive_output
- created_by
- created_at
- updated_at
```

定位：

```text
函数库是平台公共能力，不属于 AI 模块。
AI 公式助手只读取函数库中已启用、可用于公式的函数元数据。
```

函数类型：

```text
system_builtin      系统内置纯计算函数，由代码实现
expression          表达式型函数，由公式体实现
data_action         数据动作函数，本期只登记，不允许执行
```

本期允许：

```text
system_builtin
expression
```

本期禁止：

```text
任意 Python/JavaScript 代码函数
任意 HTTP API 函数
直接读取员工工资、身份证等敏感数据的 data_action 函数
```

## 6. 字段引用规范

### 6.1 用户展示格式

前端展示公式时使用可读引用：

```text
=IF([工资表.基本工资] > 10000, [工资表.基本工资] * 0.1, 0)
```

### 6.2 后端保存格式

后端保存时转换成稳定引用：

```text
=IF(FIELD("salary.basic_salary") > 10000, FIELD("salary.basic_salary") * 0.1, 0)
```

如果现有数据集字段 code 是中文，也可以先使用：

```text
FIELD("salary.基本工资")
```

但 LLM prompt 和前端展示应该尽量使用 label，避免用户直接面对内部 code。

### 6.3 依赖字段解析

保存计算字段时，后端必须解析出：

```json
{
  "depends_on": ["salary.基本工资"],
  "used_functions": ["IF", "FIELD"]
}
```

这些信息用于：

- 判断依赖字段是否存在。
- 判断结果是否应自动敏感。
- 判断报表执行时需要额外取哪些字段。
- 后续数据集字段变更时做完整性检查。

## 7. 自然语言转公式

### 7.0 意图边界

公式助手必须先识别用户意图：

| 用户意图 | 示例 | 系统行为 |
|---|---|---|
| 问答 | “当前月份公式怎么写？” | 只回答，例如 `MONTH(TODAY())`，不写入公式编辑区 |
| 生成 | “生成一个字段，如果员工是刘琦返回 1，否则 2” | 调用 `formula.generate`，结果写入公式草稿 |
| 调整 | “把刘琦改成张三” | 带当前公式调用 `formula.repair` 或 `formula.generate`，更新公式草稿 |
| 解释 | “这段公式是什么意思？” | 调用 `formula.explain`，不改变公式 |
| 校验 | “为什么保存失败？” | 调用 `formula.validate` 并解释错误 |

禁止用关键词 if/else 直接拼公式作为主要方案。规则兜底只能处理系统明确内置的确定性快捷模板，并且仍需经过公式校验。

### 7.1 LLM 输入上下文

调用 LLM 时只传字段元数据，不传真实数据明细。

示例：

```json
{
  "dataset": {
    "id": 1,
    "name": "月度薪酬数据集"
  },
  "fields": [
    {
      "code": "salary.基本工资",
      "label": "工资表.基本工资",
      "data_type": "number",
      "is_sensitive": true
    },
    {
      "code": "roster.部门",
      "label": "花名册.部门",
      "data_type": "string",
      "is_sensitive": false
    }
  ],
  "custom_functions": [
    {
      "code": "CALC_TAX",
      "description": "根据输入金额计算个税",
      "parameters": [{"name": "amount", "type": "number"}],
      "return_type": "number"
    }
  ]
}
```

### 7.2 LLM 输出 Schema

LLM 必须返回结构化 JSON：

```json
{
  "field_label": "个税金额",
  "formula_display": "=CALC_TAX([工资表.基本工资])",
  "formula": "=CALC_TAX(FIELD(\"salary.基本工资\"))",
  "data_type": "number",
  "agg_role": "measure",
  "explanation": "使用基本工资字段作为输入，调用 CALC_TAX 计算个税。",
  "depends_on": ["salary.基本工资"],
  "used_functions": ["CALC_TAX"],
  "warnings": []
}
```

### 7.3 安全边界

LLM 不能输出：

- SQL。
- Python / JavaScript。
- HTTP URL。
- 文件路径。
- 宏。
- 外部链接。
- 任意未注册函数。
- 任意未出现在数据集字段清单里的字段。

后端必须再次校验，不信任 LLM 输出。

## 8. 公式安全策略

必须拦截：

```text
HYPERLINK
WEBSERVICE
IMPORTXML
IMPORTHTML
FILE
SHELL
CMD
EXEC
URL
http://
https://
\\
../
```

必须限制：

- 公式最大长度。
- 嵌套深度。
- 单字段依赖数量。
- 函数调用数量。

建议首期限制：

```text
formula length <= 2000
depends_on <= 20
used_functions <= 20
```

## 9. 敏感字段与权限

### 9.1 敏感继承

如果计算字段依赖任一敏感字段，则计算字段默认敏感：

```text
salary.基本工资 is_sensitive = true
calc.tax_amount depends_on salary.基本工资
=> calc.tax_amount is_sensitive = true
```

管理员可以手动把非敏感结果标记为敏感，但不能把自动敏感字段强制改为非敏感，除非提供专门的高权限审批能力。本期不做解除敏感。

### 9.2 数据范围权限

计算字段不单独定义数据范围。它依赖数据集现有表字段，报表执行仍按每个 alias 对应表注入 `scope_filter`。

换句话说：

```text
用户能看到哪些源行，由现有数据范围权限决定。
计算字段只在这些已授权源行上计算。
```

### 9.3 脱敏

报表预览、运行、导出时，如果计算字段 `is_sensitive = true`，沿用现有敏感字段脱敏策略：

```text
有权限：显示计算结果
无权限：显示 ******
```

## 10. 报表编辑器集成

### 10.1 UI 入口

在 `ReportFieldWorkbench.vue` 的“可选字段”标题区域新增：

```text
[新建字段]
```

仅在以下条件满足时展示：

```text
source_type = dataset
用户有 ai.skill.formula_assistant 或 datasets calculated field 创建权限
```

点击后打开公式字段编辑弹窗或右侧抽屉。

### 10.2 可选字段分组

当前可选字段按数据集 alias 分组。新增计算字段后，建议增加分组：

```text
可选字段
├─ 花名册 roster
├─ 工资表 salary
└─ 计算字段
```

计算字段 code 建议在前端显示为：

```text
calc.tax_amount
```

字段 label 显示：

```text
个税金额
```

### 10.3 保存后行为

保存计算字段后：

- 重新加载当前数据集字段列表。
- 新字段自动出现在“计算字段”分组。
- 可以立即加入当前报表已选字段。
- 其他基于同一数据集的报表下次打开时也能看到该字段。

## 11. 报表执行集成

当前 `run_dataset_query` 的基本流程是：

```text
查询数据集源表 raw
按 selected columns 生成 columns_meta
按 alias raw 组装 item
应用拆分/转置/聚合/分页
```

引入计算字段后，执行流程调整为：

```text
1. 解析报表 selected columns。
2. 区分源字段和计算字段。
3. 根据计算字段 depends_on 补充取数依赖。
4. 查询源表 raw。
5. 先计算源字段值。
6. 再按行计算计算字段值。
7. 对计算字段应用敏感脱敏。
8. 进入现有转置、聚合、分页、导出流程。
```

注意：

- 如果计算字段未被选中，但被另一个计算字段依赖，也要参与内部计算。
- 聚合模式下，计算字段作为 measure 或 dimension，由其 `agg_role` 决定。
- 计算字段如果是 measure，聚合函数沿用报表现有 `aggregations` 逻辑。

## 12. API 设计

### 12.1 AI 公式草稿

统一 AI 编排入口：

```text
POST /api/v1/ai/chat
POST /api/v1/ai/capabilities/formula.generate/draft
```

业务兼容入口可以保留，但应内部转发到同一 Capability 实现，避免页面级 prompt 分叉：

```text
POST /api/v1/ai-formula/draft
```

请求：

```json
{
  "dataset_id": 1,
  "message": "用基本工资计算个税",
  "current_formula": null
}
```

响应：

```json
{
  "field_label": "个税金额",
  "formula_display": "=CALC_TAX([工资表.基本工资])",
  "formula": "=CALC_TAX(FIELD(\"salary.基本工资\"))",
  "data_type": "number",
  "agg_role": "measure",
  "explanation": "使用基本工资字段作为输入计算个税。",
  "depends_on": ["salary.基本工资"],
  "used_functions": ["CALC_TAX"],
  "warnings": []
}
```

### 12.2 公式校验

```text
POST /api/v1/ai-formula/validate
```

请求：

```json
{
  "dataset_id": 1,
  "formula": "=CALC_TAX(FIELD(\"salary.基本工资\"))"
}
```

响应：

```json
{
  "valid": true,
  "depends_on": ["salary.基本工资"],
  "used_functions": ["CALC_TAX"],
  "is_sensitive": true,
  "warnings": []
}
```

### 12.3 计算字段 CRUD

```text
GET    /api/v1/datasets/{dataset_id}/calculated-fields
POST   /api/v1/datasets/{dataset_id}/calculated-fields
PUT    /api/v1/datasets/{dataset_id}/calculated-fields/{field_id}
DELETE /api/v1/datasets/{dataset_id}/calculated-fields/{field_id}
```

### 12.4 函数库 CRUD

```text
GET  /api/v1/function-library/functions
POST /api/v1/function-library/functions
PUT  /api/v1/function-library/functions/{id}
```

删除建议首期不做，改为停用。

### 12.5 AI 调用日志

AI 调用日志不在 AI 基础配置模块单独维护，应写入统一日志管理模块：

```text
GET /api/v1/system-logs?category=ai_call
```

日志记录字段至少包括：

```text
user_id
capability_id
request_summary
response_summary
input_hash
output_hash
used_fields
used_functions
status
error
token_usage
trace_id
created_at
```

不记录完整敏感明细。

## 13. 权限

建议新增权限 code：

```text
ai_formula.use
ai_formula.admin
datasets.calculated_fields.create
datasets.calculated_fields.update
datasets.calculated_fields.delete
formula_functions.admin
system_logs.ai.view
```

首期可复用菜单权限体系：

- 有 `ai_formula.use` 才能让 LLM 生成公式草稿。
- 有 `datasets.calculated_fields.create` 才能保存新字段。
- 有 `formula_functions.admin` 才能维护函数库。
- 有 `system_logs.ai.view` 才能查看 AI 调用日志。

## 14. 开发顺序

推荐顺序：

1. 新增数据模型和 migration。
2. 实现字段引用解析和公式安全校验。
3. 引入 `formulas` 并实现最小 evaluator。
4. 实现计算字段 CRUD。
5. 在数据集字段加载时合并计算字段。
6. 改造 `run_dataset_query` 支持计算字段。
7. 实现函数库元数据和内置函数注册。
8. 实现 AI 公式草稿接口。
9. 前端新增公式组件。
10. 报表编辑器接入“新建字段”。
11. 补测试和验收用例。

## 15. 验收标准

### 15.1 功能验收

- 用户在基于数据集的报表编辑器中，可以点击“新建字段”。
- 用户输入自然语言后，系统生成 Excel 风格公式草稿。
- 用户可以手工编辑公式。
- 保存后，新字段出现在当前数据集的“计算字段”分组。
- 当前报表可以选择该计算字段。
- 另一个基于同一数据集的报表也能看到该计算字段。
- 报表预览能正确计算该字段。
- 报表导出能包含该字段。

### 15.2 函数库验收

- 管理员可以在函数库管理中维护函数元数据。
- LLM 生成公式时能知道已启用函数。
- 公式可以使用已注册的纯计算函数。
- 未注册函数会被校验拒绝。
- data_action 类型函数本期不可执行。

### 15.3 安全验收

- 公式引用不存在字段时保存失败。
- 公式使用危险函数时保存失败。
- 公式使用 `http://`、`https://`、文件路径时保存失败。
- 计算字段依赖敏感字段时，结果自动标记敏感。
- 无权限用户无法新建或编辑计算字段。
- AI 生成公式时不传真实工资、身份证、手机号等明细数据。

## 16. 关键架构决策

```text
ADR-FORMULA-001：首期计算字段只支持数据集级，不支持单表级。
ADR-FORMULA-002：首期主公式执行引擎采用 Python 后端执行，不采用前端执行结果作为准。
ADR-FORMULA-003：首期推荐公式库为 formulas，但生产前需确认 EUPL 许可证。
ADR-FORMULA-004：函数库首期只支持系统内置函数和表达式型函数，不支持代码型函数。
ADR-FORMULA-005：计算字段依赖敏感字段时自动继承敏感属性。
ADR-FORMULA-006：LLM 输出只作为草稿，必须经后端校验后才能保存。
ADR-FORMULA-007：AI 调用日志归统一日志管理，不在 AI 基础配置中单独维护。
ADR-FORMULA-008：函数库归平台参数配置，不放入 AI 模块。
```
