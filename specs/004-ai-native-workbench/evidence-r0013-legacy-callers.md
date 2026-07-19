# R0013 旧调用方搜索证据（第 2 项）

- 核查日期：2026-07-19
- 范围：`D:\AI项目\HR提效工具搭建`，排除 `hr-portal/backend/.venv` 与运行时数据目录。
- 目标接口：`POST /api/v1/ai/chat`
- 禁止的旧顶层字段：`actions`、`candidates`、`compensation`、`missing_fields`、`extracted`、`artifact`。

## 执行命令

```powershell
rg -n --hidden --glob '!hr-portal/backend/.venv/**' --glob '!hr-portal/data/**' '/api/v1/ai/chat|/ai/chat' .
rg -n -g '*.{ts,tsx,vue}' '\b(response|result|chat)\.(actions|candidates|compensation|missing_fields|extracted|artifact)\b' hr-portal/frontend/src
rg -n -g '*.py' '\b(out|result|response)\.(actions|candidates|compensation|missing_fields|extracted|artifact)\b' hr-portal/backend/app
rg -n -g '*.py' 'AiChatOut\([^\n]*(actions|candidates|compensation|missing_fields|extracted|artifact)\s*=' hr-portal/backend
```

## 结果与分类

- 未发现 `AiChatOut` 以旧顶层业务字段构造的运行时代码。
- 未发现前端直接从 `/ai/chat` 响应顶层读取旧业务字段。
- 前端候选、补偿金和草稿数据均从 `result.data` 读取；动作均从 `result.actions` 读取。
- 后端审计只读取 `out.result.actions` 与类型化 `out.result.data`。
- `extracted` 仅作为具名 `ExtractorResult` 的后端内部输入，不属于 API 输出。
- 搜索命中中的旧字段名称均已人工分类为：
  1. 统一 Envelope 的嵌套字段；
  2. 测试中明确拒绝旧顶层字段的负向契约断言；
  3. 无关模块的同名业务字段或后端内部会话/提取数据；
  4. 迁移背景、禁止项和历史说明文档。

## 结论

`/api/v1/ai/chat` 没有未迁移的旧顶层字段调用方，不需要恢复兼容字段。未来如发现真实旧调用方，应先迁移调用方并阻止发布。
