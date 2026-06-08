# AI 原生工作台一期实施蓝图

版本：v0.1  
日期：2026-06-08  
适用项目：`D:\AI项目\HR提效工具搭建\hr-portal`

## 1. 一期目标

一期只做 Web 端 AI 工作台和两个场景 Copilot：

```text
1. 全局 AI 侧边栏
2. 报表配置助手
3. Excel 公式助手
```

一期目标不是“让 AI 自动完成所有 HR 工作”，而是建立安全可控的 AI 参与范式：

```text
输入自然语言 -> 生成结构化草稿 -> 用户确认 -> 现有业务服务执行
```

## 2. 不做事项

一期明确不做：

- 不新建 Node.js/Go 独立网关。
- 不接飞书机器人。
- 不做任意 Action URL 注册。
- 不让 LLM 生成 SQL 并执行。
- 不让 LLM 生成代码并执行。
- 不把完整工资、身份证、手机号等敏感明细直接发给模型。
- 不让 AI 自动导出数据或自动修改模板。
- 不做向量库 RAG。

## 3. 后端目录结构

建议新增：

```text
backend/app/ai/
├── __init__.py
├── router.py
├── models.py
├── schemas.py
├── service.py
├── model_provider.py
├── prompt_templates.py
├── context_builder.py
├── policy_guard.py
├── schema_validator.py
├── audit.py
├── skills/
│   ├── __init__.py
│   ├── base.py
│   ├── report_config.py
│   └── formula_assistant.py
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
ai_prompt_templates
ai_conversations
ai_messages
ai_artifacts
ai_tool_invocations
ai_usage_ledger
```

`ai_skills` 和 `ai_actions` 可以先用代码白名单，不急着建动态注册表。若需要在页面上启停，再补表。

## 5. 权限 code

先复用菜单权限体系：

```text
ai.workbench
ai.skill.report_config
ai.skill.formula_assistant
system_logs.ai.view
```

语义：

- `ai.workbench`：能打开 AI 工作台。
- `ai.skill.report_config`：能使用报表配置助手。
- `ai.skill.formula_assistant`：能使用公式助手。
- `system_logs.ai.view`：能在统一日志管理中查看 AI 调用日志。

## 6. API

```text
GET  /api/v1/ai/skills
POST /api/v1/ai/conversations
GET  /api/v1/ai/conversations/{conversation_id}
POST /api/v1/ai/chat
POST /api/v1/ai/skills/report-config/draft
POST /api/v1/ai/skills/formula-assistant/draft
POST /api/v1/ai/artifacts/{artifact_id}/apply
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

## 7. 模型 Provider

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

## 8. Policy Guard

一期必须拦截：

- 公式中的 `HYPERLINK`
- 公式中的外部 URL
- 公式中的宏/命令/文件路径相关内容
- 报表配置中不存在的表
- 报表配置中不存在的字段
- 报表配置中用户无权访问的表入口
- 任何要求“忽略权限”“导出全部工资”“绕过限制”的请求

注意：Policy Guard 拦截恶意意图后，不调用模型或不调用任何业务 Action。

## 9. 前端入口

建议新增：

```text
frontend/src/views/ai/Workbench.vue
frontend/src/components/ai/AiDrawer.vue
frontend/src/components/ai/AiArtifactPanel.vue
frontend/src/api/ai.ts
```

页面策略：

- 顶部一级入口显示“AI 工作台”。
- 报表设计器右侧提供 AI 抽屉按钮。
- AI 生成的报表配置草稿可“一键填入当前设计器”。
- Excel 公式助手先在 AI 工作台中提供，不急着嵌入每个工具页面。

视觉继承：

- 使用现有 Element Plus。
- 使用 `tokens.css`。
- 不做独立主题。
- 不做营销式 landing page。

## 10. 测试清单

后端：

- 无 token 调 AI API 返回 401。
- 无 `ai.workbench` 返回 403。
- 无 `ai.skill.report_config` 不能生成报表配置。
- 报表配置草稿不能引用不存在字段。
- 报表配置草稿应用后，运行仍走现有报表权限和脱敏。
- 公式助手拒绝 `HYPERLINK("http://...")`。
- 越权提示词不触发业务工具调用。

前端：

- 无权限用户不显示 AI 工作台入口。
- 报表设计器 AI 草稿不会自动保存。
- 用户可以查看、编辑、放弃 AI 草稿。
- 移动端/窄屏下 AI 抽屉不遮挡主要操作按钮。

## 11. 验收口径

一期验收通过的标志：

```text
用户可以在报表设计器用自然语言生成报表配置草稿；
用户可以在 AI 工作台生成 Excel 公式草稿；
所有 AI 输出都必须先成为草稿，不能绕过用户确认直接执行；
所有执行仍走现有 HR Portal 权限和数据范围管道。
```
