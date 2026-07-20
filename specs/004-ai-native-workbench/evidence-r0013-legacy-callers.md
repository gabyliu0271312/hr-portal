# R0013 旧调用方、发布与验收证据

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

## 正式发布与版本对应证据

- 发布日期：2026-07-19。
- 发布环境：HR Portal 正式环境。
- 发布 tag：`ai-envelope-20260719.1`。
- 发布提交：`3fa04825c1d12ec516fabd5e42940053b01ec8e3`。
- 生产服务端口：后端 `18000 -> 8000`，前端 `37801 -> 80`。
- 后端运行镜像：`sha256:22911bb7717da3d725d9fddd0269d7a9a7bf18ad4ed65f1b8a982f0e13980c3b`。
- 前端运行镜像：`sha256:36301f45432e0620bff0f2d18e07fa20d471e37681fc5c4688d0592216583680`。
- 发布后已通过容器运行镜像与发布 tag 镜像 ID 的一致性校验；后端 `router.py`、`schema_validator.py` 以及前端 `api/ai.ts`、`GlobalAiAssistant.vue` 与发布副本逐文件比对一致。

## 回滚与技术核验证据

- 切换前已保存现网工作区、生产 `.env`、`docker-compose.yml`、容器信息和数据库备份。
- 已保留前后端镜像回滚标签：`pre-ai-envelope-20260719-152848`；生产环境保存 `releases/current-ai-envelope.txt` 记录发布 tag、提交、运行镜像、源码备份和回滚镜像。
- 发布过程中曾因发布副本覆盖生产专用端口配置而触发自动回滚；恢复后确认后端健康、前端入口及原端口映射正常。最终发布保留生产专用 `docker-compose.yml` 与 `.env`，仅同步应用源码和同 tag 构建的前后端镜像。
- 最终技术核验通过：数据库迁移为最新状态、Uvicorn 完成启动、后端健康接口返回正常、前端入口可访问，未见启动异常或敏感错误信息。

## 业务验收证据

- 后端定向测试：`43 passed`。
- 前端组件测试：`7 passed`。
- 前端生产构建：通过。
- 验收方已在正式环境确认：补偿金试算与比较、数据对比、自动化规则草稿、动作按钮、无权限提示和异常提示均正确。

## 最终结论

R0013 已完成。`/api/v1/ai/chat` 的统一 Envelope 已以同一前后端版本发布至正式环境；旧调用方已完成核查，发布版本与回滚资产均可追溯。
