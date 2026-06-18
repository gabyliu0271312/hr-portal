# AI 原生工作台一期实施蓝图

版本：v0.1  
日期：2026-06-08  
适用项目：`D:\AI项目\HR提效工具搭建\hr-portal`

## 1. 一期目标

一期目标不再只是 Web 端 AI 工作台和两个场景 Copilot，而是先搭出 AI 原生工作台的最小平台地基，再落到报表和公式两个首批场景：

```text
0. AI 原生平台地基：能力注册、编排、上下文、策略校验、审计、评测
1. 全局 AI 侧边栏
2. 报表配置助手
3. Excel 公式助手 / 数据集计算字段
```

一期目标不是“让 AI 自动完成所有 HR 工作”，而是建立安全可控的 AI 参与范式：

```text
输入自然语言
  -> 意图识别
  -> Capability 选择
  -> Context Packet
  -> 结构化草稿/工具计划
  -> Schema + Policy Guard
  -> 用户确认
  -> 现有业务服务执行
  -> 统一审计
```

所有后续新功能开发必须同步判断：

```text
是否注册 AI Capability？
如果不注册，是否明确标记暂不暴露给 AI？
```

下一次 AI 相关开发的准入顺序：

```text
先完成最小 AI 底座
  -> 再接公式/计算字段首个真实场景
  -> 再扩展其他 AI 能力
```

最小 AI 底座不追求大而全，只要求能支撑第一个真实场景安全运行：

| 底座能力 | 最小要求 |
|---|---|
| Capability Registry | 能注册和查询首批能力，至少支持 `formula.generate`、`formula.validate`、`calculated_field.save` |
| AI Orchestrator | 能根据入口和意图区分问答、草稿、诊断、执行 |
| Tool Wrapper | AI 只能调用受控工具，工具再调用现有业务服务 |
| Context Packet | 公式场景只传数据集字段、函数元数据和当前公式，不传真实敏感明细 |
| Schema Validator | 校验模型输出 JSON、公式、字段、函数 |
| Policy Guard | 拦截越权、SQL/代码、外部 URL、危险公式 |
| Audit | 记录 AI 调用、工具调用、确认和业务执行摘要 |
| Eval Case Skeleton | 能沉淀并回放基础评测用例 |
```

完成上述最小底座后，才开始把公式/计算字段接入统一 AI 能力；不再新增独立的页面 prompt 接口。

完整平台的阶段演进不在本文展开，统一参考：

```text
specs/004-ai-native-workbench/ai-platform-roadmap.md
```

本文只负责 Phase 0 最小 AI 底座和 Phase 1 公式/计算字段首个场景验证的落地口径。

## 2. 不做事项

一期明确不做：

- 不新建 Node.js/Go 独立网关。
- 不接飞书机器人。
- 不做任意 Tool URL 注册。
- 不让 LLM 生成 SQL 并执行。
- 不让 LLM 生成代码并执行。
- 不把完整工资、身份证、手机号等敏感明细直接发给模型。
- 不让 AI 自动导出数据或自动修改模板。
- 不做向量库 RAG。
- 不把模型微调作为第一阶段地基。
- 不用关键词判断和硬编码 if/else 伪装成 AI 原生能力。

## 3. 后端目录结构

建议新增：

```text
backend/app/ai/
├── __init__.py
├── router.py
├── models.py
├── schemas.py
├── orchestrator.py
├── capabilities.py
├── model_provider.py
├── prompt_templates.py
├── context_builder.py
├── policy_guard.py
├── schema_validator.py
├── audit.py
├── evals.py
├── tools/
│   ├── __init__.py
│   ├── base.py
│   ├── datasets.py
│   ├── reports.py
│   ├── formula.py
│   └── cost_allocation.py
└── tests/
```

路由挂载到 `app/main.py`：

```python
from app.ai.router import router as ai_router
app.include_router(ai_router, prefix=settings.API_PREFIX)
```

## 4. 数据库表

一期最小表：

```text
ai_capabilities
ai_capability_policies
ai_prompt_templates
ai_conversations
ai_messages
ai_artifacts
ai_tool_invocations
ai_usage_ledger
ai_eval_cases
ai_eval_runs
```

能力和工具的边界：

- Capability 以代码白名单为准，数据库只维护启停、展示名、示例问法、策略覆盖、风险等级。
- Tool Wrapper 只能由代码注册，不允许管理员通过页面登记任意 URL 或任意代码。
- 数据库不得成为“动态 Tool 注册中心”。

## 5. 权限 code

先复用菜单权限体系：

```text
ai.workbench
ai.capability.report_create_draft
ai.capability.formula_generate
ai.capability.capability_admin
system_logs.ai.view
```

语义：

- `ai.workbench`：能打开 AI 工作台。
- `ai.capability.report_create_draft`：能使用报表配置草稿能力。
- `ai.capability.formula_generate`：能使用公式草稿生成能力。
- `ai.capability.capability_admin`：能维护 AI 能力启停、示例问法和策略覆盖。
- `system_logs.ai.view`：能在统一日志管理中查看 AI 调用日志。

## 6. API

```text
GET  /api/v1/ai/capabilities
POST /api/v1/ai/conversations
GET  /api/v1/ai/conversations/{conversation_id}
POST /api/v1/ai/chat
POST /api/v1/ai/capabilities/report.create_draft/draft
POST /api/v1/ai/capabilities/formula.generate/draft
POST /api/v1/ai/artifacts/{artifact_id}/apply

GET   /api/v1/ai/admin/capabilities
PATCH /api/v1/ai/admin/capabilities/{capability_id}
GET   /api/v1/ai/admin/eval-cases
POST  /api/v1/ai/admin/eval-runs
```

### 6.1 报表配置草稿

请求：

```json
{
  "message": "做一张 5 月研发中心工资报表，只看工号、姓名、部门、基本工资",
  "context": {
    "page": "report_designer",
    "table_name": "emp_monthly_salary"
  }
}
```

响应：

```json
{
  "artifact_id": 1,
  "artifact_type": "report_config",
  "status": "draft",
  "content": {
    "table_name": "emp_monthly_salary",
    "columns": ["工号", "姓名", "部门", "基本工资"],
    "filters": [
      {"column": "期间", "op": "eq", "value": "2026-05"},
      {"column": "部门", "op": "contains", "value": "研发中心"}
    ],
    "sorts": []
  },
  "warnings": []
}
```

应用草稿时只把 config 回填到前端设计器，不直接保存或执行。

### 6.2 公式助手草稿

请求：

```json
{
  "message": "如果销售额大于等于1000且小于5000，奖金500，否则0",
  "context": {
    "current_formula": null
  }
}
```

响应：

```json
{
  "artifact_id": 2,
  "artifact_type": "excel_formula",
  "status": "draft",
  "content": {
    "formula": "=IF(AND(销售额>=1000,销售额<5000),500,0)",
    "explanation": "当销售额在 1000 到 5000 之间时返回 500，否则返回 0。"
  },
  "warnings": []
}
```

## 7. Capability Registry

一期首批 Capability：

| capability_id | 类型 | 说明 | 是否改状态 |
|---|---|---|---:|
| `ai.chat.answer` | answer | 基于当前上下文和已授权能力回答问题 | 否 |
| `ai.capability.list` | query | 查询当前用户可用 AI 能力 | 否 |
| `dataset.list_fields` | query | 查询当前数据集字段元数据 | 否 |
| `function_catalog.query` | answer/query | 查询函数库函数说明和启用状态 | 否 |
| `formula.generate` | draft | 根据自然语言生成公式草稿 | 否 |
| `formula.validate` | diagnose | 校验公式并解释错误 | 否 |
| `formula.repair` | draft | 根据校验错误修复公式草稿 | 否 |
| `calculated_field.save` | write | 保存数据集计算字段 | 是，需确认 |
| `report.create_draft` | draft | 生成报表配置草稿 | 否 |
| `report.apply_draft` | apply | 把报表草稿填入前端设计器 | 前端状态 |
| `report.export` | export | 导出报表 | 是，高风险确认 |

每个 Capability 必须有：

```text
capability_id
input_schema
output_schema
required_permission
data_scope
sensitivity
side_effect
confirmation
examples
failure_modes
eval_cases
```

开发规则：

- 新功能如果需要 AI 调用，先定义 Capability，再写工具包装。
- 新功能如果暂不暴露给 AI，需要在规格文档中写明“不注册 AI Capability”。
- 页面级 Copilot 不得直接拼 prompt 调模型，必须调用 `POST /api/v1/ai/chat` 或指定 Capability 草稿接口。
- Capability 返回的草稿可以自动填入编辑区，但保存、导出、推送等状态变更仍需要用户确认和业务服务校验。

## 8. 模型 Provider

业务代码不写死模型名。配置使用能力标签：

```text
AI_MODEL_FAST_JSON
AI_MODEL_REASONING
AI_MODEL_LONG_CONTEXT
AI_MODEL_LOW_COST
```

`model_provider.py` 对外只暴露：

```python
async def generate_json(*, capability: str, messages: list[dict], schema: dict) -> dict
async def generate_text(*, capability: str, messages: list[dict]) -> str
```

## 9. Policy Guard

一期必须拦截：

- 公式中的 `HYPERLINK`
- 公式中的外部 URL
- 公式中的宏/命令/文件路径相关内容
- 报表配置中不存在的表
- 报表配置中不存在的字段
- 报表配置中用户无权访问的表入口
- 任何要求“忽略权限”“导出全部工资”“绕过限制”的请求

注意：Policy Guard 拦截恶意意图后，不调用模型或不调用任何业务 Tool。

## 10. 前端入口

建议新增：

```text
frontend/src/views/ai/Workbench.vue
frontend/src/components/ai/AiDrawer.vue
frontend/src/components/ai/AiArtifactPanel.vue
frontend/src/views/system/AiCapabilityManagement.vue
frontend/src/api/ai.ts
```

页面策略：

- 顶部一级入口显示“AI 工作台”。
- 报表设计器右侧提供 AI 抽屉按钮。
- AI 生成的报表配置草稿可填入当前设计器，但不自动保存。
- Excel 公式助手以可复用计算字段组件接入报表和成本分摊等页面。
- 管理员在“系统设置 -> AI 管理 -> 能力管理”维护 Capability 启停、示例问法、风险等级和评测入口。
- 普通业务用户不维护 Capability，只在全局工作台或页面级 Copilot 中使用。

视觉继承：

- 使用现有 Element Plus。
- 使用 `tokens.css`。
- 不做独立主题。
- 不做营销式 landing page。

## 11. 测试清单

后端：

- 无 token 调 AI API 返回 401。
- 无 `ai.workbench` 返回 403。
- 无 `ai.capability.report_create_draft` 不能生成报表配置。
- 报表配置草稿不能引用不存在字段。
- 报表配置草稿应用后，运行仍走现有报表权限和脱敏。
- 公式助手拒绝 `HYPERLINK("http://...")`。
- 越权提示词不触发业务工具调用。
- 未注册 Capability 的业务能力不能被 AI 调用。
- 每个首批 Capability 至少有正常、失败、越权、敏感数据评测用例。

前端：

- 无权限用户不显示 AI 工作台入口。
- 报表设计器 AI 草稿不会自动保存。
- 用户可以查看、编辑、放弃 AI 草稿。
- 移动端/窄屏下 AI 抽屉不遮挡主要操作按钮。
- AI 能力管理仅管理员可见。

## 12. 开发顺序

推荐顺序：

1. 建立 `backend/app/ai` 基础模块：model_provider、schema_validator、policy_guard、audit。
2. 建立 `capabilities.py` 代码白名单和 `ai_capabilities` 元数据同步。
3. 建立 `orchestrator.py`：意图识别、能力解析、Context Packet、工具编排。
4. 建立 Tool Wrapper：dataset、function_catalog、formula、report。
5. 建立 eval case 结构和最小回放接口。
6. 接入 `formula.generate`、`formula.validate`、`calculated_field.save`。
7. 接入 `report.create_draft`、`report.apply_draft`。
8. 前端接入全局 AI 工作台、页面 Copilot、AI 能力管理。
9. 补充系统日志、用量统计和失败解释。
10. 再考虑 Prompt 优化、模型切换和微调可行性。

## 12.1 Phase 0 收尾项（为 Phase 2 data.query / 语义层铺路）

当前 Phase 0/1 已落地 Capability Registry、Schema/Policy/Audit/Trace、字段权限过滤、公式全套和只读对照场景。进入 Phase 2 前补齐以下三项，避免接 `data.query` 时返工。

实施状态（2026-06-18）：三项均已完成并通过测试（ai/formula/report 50 项全绿）。

1. ✅ 抽取 `context_builder.py`：Context Packet 由 `build_context_packet` 统一构建，固定 `page / permission / data / attachments / domain_context` 五分区，`report.explain_config` 已接入；`domain_context` 下预留 `semantic_layer`、`query_spec` 占位（默认 None，Phase 2 落编译器）。
2. ✅ Policy Guard 收口输出级 deny：禁止内容定义抽到单一真相源 `app/ai/deny_patterns.py`（`DENY_PATTERN_REGEX` 通用正则 + `FORMULA_BLOCK_TOKENS` 公式 token）；`policy_guard.enforce_output_deny_patterns` 与 `formula_safety.safety_issues` 都从该模块取，不再各自维护两套；`data.query` 的“禁止模型输出 SQL/表名/join”复用 `enforce_output_deny_patterns`。
3. ✅ `ai.chat` 通用路由：`/chat` 改为 `ChatRoute` 注册表 + `_resolve_chat_route`（关键词优先路由 + 通用意图分类 `_classify_chat_intent` 兜底），移除 `if intent == compensation` 硬编码分支；补偿金作为首条注册路由，新增 chat 场景（如 `data.query`）只需向 `CHAT_ROUTES` 追加路由 + 提供 extractor/handler，不改调度逻辑。

注意：

- 上述开发顺序仅覆盖 Phase 0/1。
- Phase 2 之后的多场景复用、治理平台、RAG、工作流编排、渠道扩展和微调，必须先按 `ai-platform-roadmap.md` 做阶段升级评估。
- Phase 5 是 `AI Workflow / Capability Orchestration`，类似 Skill 的能力，但不得实现为黑盒大 Skill；必须由多个原子 Capability、Tool、Artifact、Policy Guard 和用户确认点组成。
- Phase 2 将新增 `data.query`（自然语言数据查询 / 受控 ChatBI）与指标语义层。为避免地基返工，Phase 0 的 Context Packet 顶层分区、Capability 元数据 schema 和 Tool Wrapper 接口应预留 `semantic_layer` / `query_spec` 扩展位；但 Phase 0/1 不实现指标语义层和 QuerySpec 编译器。本文“不让 LLM 生成 SQL 并执行”对 data.query 仍然成立——QuerySpec 不是 LLM 生成的 SQL，SQL 由后端编译器生成。

## 13. 验收口径

一期验收通过的标志：

```text
系统存在 AI Capability Registry，且首批能力可查询、可启停、可审计；
用户可以在报表设计器用自然语言生成报表配置草稿；
用户可以在 AI 工作台生成 Excel 公式草稿；
所有 AI 输出都必须先成为草稿，不能绕过用户确认直接执行；
所有执行仍走现有 HR Portal 权限和数据范围管道。
每个首批 Capability 至少具备基础评测用例。
```
