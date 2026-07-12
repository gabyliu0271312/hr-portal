# 011-universal-connector-platform 文档索引

本目录为 UCP（Universal Connector Platform，通用连接器平台）的统一规格目录。

## 文档清单

| 文件 | 标注 | 说明 |
| --- | --- | --- |
| `spec.md` | 主规格 / 目标规格 | 描述 UCP 的业务目标、范围、模型、安全、权限、数据库建议、验收标准；末尾第 19 章已补充 2026-07-03 实施定调。 |
| `implementation-plan.md` | 实施拆解 / 可勾选任务清单 | 结合蓝图交互、HR Portal 视觉风格、真实代码和主规格，按 Phase 拆成可开发、可标记、含验收标准的任务。 |

## 当前实施定调

1. 当前 UCP 仍处于开发期，**不做旧 Connector 产品模型兼容**，后续彻底统一为 `系统 → 资源 → 凭证 → 流水线画布`。
2. UCP 定位为 **应用化设计，门户内交付**：当前在 HR Portal 内交付，但作为顶部一级 `数据连接`，路由使用 `/ucp`，权限使用 `ucp.*`，为未来独立应用预留。
3. `outputs/ucp-blueprint/index.html` 是最终交互、信息架构和页面内容层级目标；视觉风格需与 HR Portal 现有 Element Plus 浅色企业后台风格融合，不做深色科技风 1:1 照搬。
4. 流水线画布是 Phase 1 核心配置能力，不后置。
5. 每个开发任务完成后，需要在 `implementation-plan.md` 的任务表中标记状态，并满足对应验收标准。
6. 通用 API 配置化、iPaaS 治理、外部主数据治理已作为 Phase 5/6/7 远期阶段保留。

## 蓝图参考

```text
outputs/ucp-blueprint/index.html
```

蓝图文件需保持可查看；真实产品实现以 `hr-portal/frontend/src/views/datasource/ucp/` 下 Vue 组件为准。

