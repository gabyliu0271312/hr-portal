# AI 能力注册表设计

版本：v0.1  
日期：2026-06-08  
状态：设计草案  
适用范围：HR Portal 所有可被 AI 理解、调用或编排的业务能力

## 1. 目标

AI 能力注册表用于把业务系统能力显式暴露给 AI 编排层。

它解决的问题：

- 模型不能猜系统有什么能力。
- 页面不能各自拼 prompt。
- 后端接口不能任意暴露给模型。
- 管理员需要知道哪些能力开放给 AI。
- 所有 AI 调用需要权限、确认和审计。

核心原则：

```text
业务能力先注册为 Capability，再由 AI Orchestrator 按意图、安全策略和用户确认决定是否调用。
```

## 2. 能力类型

建议按以下类型分类：

| 类型 | 说明 | 是否改状态 | 示例 |
|---|---|---:|---|
| `answer` | 问答、解释、说明 | 否 | 查询函数是否启用 |
| `draft` | 生成草稿 | 否 | 生成报表配置草稿 |
| `diagnose` | 诊断错误或异常 | 否 | 解释公式校验失败原因 |
| `query` | 查询已授权数据 | 否 | 查询当前数据集字段 |
| `apply` | 把草稿填入当前编辑器 | 前端状态 | 应用公式草稿 |
| `write` | 写入后端业务数据 | 是 | 保存计算字段 |
| `export` | 导出文件 | 是 | 导出报表 |
| `send` | 对外发送 | 是 | 推送飞书消息 |

## 3. 能力元数据 Schema

建议代码和数据库都遵循同一元数据结构。

```json
{
  "capability_id": "formula.generate",
  "name": "生成公式草稿",
  "description": "根据自然语言和数据集字段生成平台可保存的 Excel 风格公式草稿。",
  "module": "ai_formula",
  "type": "draft",
  "input_schema": {},
  "output_schema": {},
  "required_permission": {
    "resource": "datasource.datasets",
    "operation": "C"
  },
  "data_scope": {
    "required": false,
    "scope_type": null
  },
  "sensitivity": {
    "reads_sensitive": false,
    "outputs_sensitive": "depends_on_fields"
  },
  "side_effect": "draft_only",
  "confirmation": "none",
  "tools": ["dataset.list_fields", "function_catalog.list_enabled", "formula.validate"],
  "examples": [
    "如果员工是刘琦，则返回 1，否则返回 2",
    "用基本工资计算个税"
  ],
  "failure_modes": [
    "字段不存在",
    "函数未启用",
    "公式语法不合法"
  ]
}
```

## 4. 后端推荐模型

### 4.1 代码注册

第一阶段建议代码白名单注册，不开放管理员任意注册 URL。

```python
@capability(
    capability_id="function_catalog.query",
    module="ai_formula",
    type="answer",
    required_permission=("system.function_library", "V"),
    side_effect="none",
    confirmation="none",
)
async def query_function_catalog(ctx, args):
    ...
```

优势：

- 安全边界清晰。
- 跟代码评审绑定。
- 不会把任意接口暴露给模型。

### 4.2 数据库配置

数据库只用于启停、展示名、示例问法、Prompt 片段、风险级别覆盖。

不允许通过数据库注册任意 URL 或任意 Python 代码。

建议表：

```text
ai_capabilities
- capability_id
- name
- module
- type
- is_enabled
- ai_visible
- confirmation
- description
- examples
- owner
- updated_at

ai_capability_policies
- capability_id
- required_permission
- max_context_rows
- allow_sensitive_context
- require_confirmation
- risk_level
```

## 5. 标准执行链路

```text
User Message
  -> Intent Classifier
  -> Capability Resolver
  -> Permission Check
  -> Context Builder
  -> Model Reasoning / Tool Planning
  -> Tool Invocation
  -> Schema Validation
  -> Policy Guard
  -> Draft / Answer / Confirmation Request
  -> User Confirm
  -> Business Service Execution
  -> Audit
```

## 6. 首批能力清单

### 6.1 AI 平台能力

| capability_id | 类型 | 说明 |
|---|---|---|
| `ai.chat.answer` | answer | 通用问答，但只能基于当前上下文和已授权能力回答 |
| `ai.intent.classify` | answer | 识别用户意图 |
| `ai.capability.list` | query | 查询当前用户可用 AI 能力 |
| `ai.audit.explain` | answer | 解释一次 AI 调用为什么失败 |

### 6.2 函数与公式能力

| capability_id | 类型 | 说明 |
|---|---|---|
| `function_catalog.query` | answer/query | 查询函数是否存在、是否启用、如何使用 |
| `formula.generate` | draft | 生成平台可保存公式草稿 |
| `formula.explain` | answer | 解释公式含义 |
| `formula.validate` | diagnose | 校验公式并解释错误 |
| `formula.repair` | draft | 根据校验错误修复公式草稿 |
| `calculated_field.create_draft` | draft | 生成计算字段元数据草稿 |
| `calculated_field.save` | write | 保存数据集计算字段，必须确认 |

### 6.3 数据集与报表能力

| capability_id | 类型 | 说明 |
|---|---|---|
| `dataset.list_fields` | query | 查询当前数据集字段 |
| `dataset.explain_lineage` | answer | 解释字段来源和关联关系 |
| `report.create_draft` | draft | 生成报表配置草稿 |
| `report.explain_config` | answer | 解释报表配置 |
| `report.explain_result` | answer | 解释报表结果摘要 |
| `report.apply_draft` | apply | 把报表草稿填入设计器 |
| `report.export` | export | 导出报表，必须确认和审计 |
| `data.query` | query | 自然语言转 QuerySpec，经语义层编译执行受控查询（不生成 SQL） |
| `data.explain_result` | answer | 解释查询结果摘要与异常，只覆盖已授权且已返回数据 |

### 6.4 成本分摊能力

| capability_id | 类型 | 说明 |
|---|---|---|
| `cost_allocation.explain_scheme` | answer | 解释分摊方案 |
| `cost_allocation.create_scheme_draft` | draft | 生成方案草稿 |
| `cost_allocation.validate_scheme` | diagnose | 检查方案配置问题 |
| `cost_allocation.explain_run_result` | answer | 解释执行结果 |
| `cost_allocation.run` | write | 执行分摊，必须高风险确认 |

### 6.5 文档与工具能力

| capability_id | 类型 | 说明 |
|---|---|---|
| `document.template.explain` | answer | 解释模板变量 |
| `document.draft_income_certificate` | draft | 生成收入证明草稿 |
| `document.draft_agreement` | draft | 生成协议草稿 |
| `document.generate_file` | export | 生成正式文件，必须确认 |
| `compensation.employee_resolve` | query | 根据姓名、工号或英文名解析补偿金候选员工 |
| `compensation.calculate_preview` | preview | 只读试算补偿金，并在会话槽位中保留员工、日期、方案、地区 |
| `document.preview_from_context` | preview | 基于已授权业务上下文预览模板文档，例如补偿金试算后的解除协议 |
| `document.print_from_context` | export | 基于已授权业务上下文生成可打印 PDF，必须由用户在对话中明确发起 |

补偿金后续文档动作约定：

- `ai.chat` 的补偿金能力只通过 LLM extractor 识别“继续计算 / 预览协议 / 打印协议”等后续动作，输出结构化 `followup_action`；调度层和前端不得用关键词或正则兜底。
- 后端 action 必须是通用 `document_preview` / `document_print`，携带 `business_type`、`template_code`、`source_capability_id` 和已校验参数；前端用统一文档预览组件执行，不能为每个业务能力复制一套弹窗。
- 预览是 `preview` 能力，不写入数据；打印属于用户明确触发的 `export` 类动作，仍复用业务接口和生成日志，不绕过模板、权限、数据范围与字段白名单。

## 7. 前端维护界面

管理员需要一个“AI 能力管理”页面。

建议位置：

```text
系统设置 -> AI 管理 -> 能力管理
```

页面功能：

- 查看所有 capability。
- 查看能力所属模块和风险等级。
- 启用/停用 AI 可见性。
- 配置示例问法。
- 配置是否需要确认。
- 查看最近调用和失败率。
- 进入评测用例。

普通业务用户不维护能力注册表，只在业务页面使用 AI Copilot。

## 8. 与权限体系的关系

AI 能力权限永远是叠加权限，不替代原业务权限。

示例：

```text
用户能使用 formula.generate
不代表用户能查看所有数据集字段。

用户能使用 report.create_draft
不代表用户能导出报表。

用户能让 AI 解释成本分摊方案
不代表用户能执行成本分摊。
```

业务服务仍然是最终权限边界。

## 9. 与评测体系的关系

每个 capability 至少维护一组 eval cases：

```text
case_id
capability_id
input_context
user_message
expected_intent
expected_tool_calls
expected_answer_points
forbidden_outputs
expected_confirmation
```

评测结果用于判断：

- Prompt 是否退化。
- 模型是否适合该能力。
- 是否需要工具补充。
- 是否需要微调。

没有评测用例的能力，不允许进入高风险执行阶段。
