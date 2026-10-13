# START HERE：UCP 每次开发会话启动协议

> 本文件是 `011-universal-connector-platform` 后续任何模型/开发者开始开发前必须先读的入口文件。  
> UCP 会分多次、多人、多模型逐步开发，不能假设上一次会话上下文仍然存在。

## 1. 每次开始开发前必须做什么

每次新会话、新模型、新任务开始前，必须按顺序完成：

1. 阅读本文件 `START_HERE.md`。
2. 阅读 `README.md`，确认本目录文档结构。
3. 阅读 `spec.md` 的：
   - `## 19. 2026-07-03 实施定调补充`
   - `## 20. 2026-07-04 数据仓库协同与独立应用边界补充`
   - 与本次任务相关章节。
4. 阅读 `implementation-plan.md` 的：
   - 第 2 章产品最终状态。
   - 第 3 章蓝图交互参考与 HR Portal 风格融合规范。
   - 与本次任务相关 Phase。
5. 阅读 `atomic-tasks.md` 中：
   - `## 0. 强制执行规则`
   - `## 1. 每次开发会话启动任务`
   - 本次要执行的任务编号。
6. 如果涉及 UI/前端/页面/组件/路由/菜单，必须同时对照：
   - `implementation-plan.md` 第 3 章。
   - `outputs/ucp-blueprint/index.html`。
   - 真实前端 `hr-portal/frontend/src/views/datasource/ucp/`。
7. 如果涉及数据仓库、DataSource、RegisteredTable、SyncRun、数据资产、落表、资源引用或桥接，必须阅读：
   - `warehouse-coordination.md`
   - `specs/012-data-warehouse-ucp-integration/ucp-coordination.md`，如该目录存在。
8. 查看 `atomic-tasks.md` 已勾选状态，确认前置任务是否已完成。
9. 查看 git 当前状态，避免覆盖用户或其他模型未提交变更。

---

## 2. 每次开工前必须在回复中声明

```text
UCP 本次开发启动确认：
- 已阅读 START_HERE.md：是/否
- 已阅读 spec.md 相关章节：是/否
- 已阅读 implementation-plan.md 相关章节：是/否
- 已阅读 atomic-tasks.md 对应任务：是/否，任务编号：...
- 是否涉及 UI：是/否
- 如涉及 UI，已阅读蓝图与第 3 章 UI 规范：是/否/不涉及
- 是否涉及数据仓库协同：是/否
- 如涉及，已阅读 warehouse-coordination.md：是/否/不涉及
- 已检查 git branch/status：是/否
- 本次计划完成任务编号：...
```

如果不能完成以上确认，不应开始改代码。

---

## 3. 每次结束开发时必须做什么

1. 更新 `atomic-tasks.md` 中已完成任务的 `[ ]` 为 `[x]`。
   - 每个任务只有在任务内容、UI、测试、验收全部完成后才允许勾选。
2. 如果完成的是阶段级任务，也同步更新 `implementation-plan.md`。
3. 如果发现任务定义不够清楚，补充到 `atomic-tasks.md`，不要只口头说明。
4. 如果涉及 UI，记录页面路径、交互路径、状态覆盖结果。
5. 如果涉及测试，记录测试命令和结果。
6. 在最终回复中列出：
   - 已完成任务编号。
   - 未完成任务编号。
   - 修改文件。
   - 测试结果。
   - UI 验收证据。
   - 数据仓库协同风险和后续建议。
