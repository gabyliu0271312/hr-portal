# START HERE：每次开发会话启动协议

> 本文件是后续任何模型/开发者开始本 Spec 开发前必须先读的入口文件。  
> 由于本系统会分多次、多人、多模型逐步开发，不能假设上一次会话的上下文仍然存在。

## 1. 每次开始开发前必须做什么

每次新会话、新模型、新任务开始前，必须按顺序完成：

1. 阅读本文件 `START_HERE.md`。如从目录进入，也可先看 `README.md` 获取文件说明。
2. 阅读 `spec.md` 的：
   - `## 0. 开发执行入口`
   - `## 2. 产品定位`
   - `## 3. 最终蓝图信息架构`
   - 与本次任务相关章节。
   - 如涉及评审修订、UCP 绑定、API 路径、影响分析、首页口径、ODS→DWD→DWS→ADS 分层流转、ELT/ETL 预留、系统设置归并、数据接入入口、接口配置拉取/推送融合、数据视图融合、表间关联授权、三期数据开发或四期高级能力，必须阅读 spec.md 第 13/14/16/17/18/19 章。
3. 阅读 `atomic-tasks.md` 中：
   - A01 / A02。
   - A05 防误解强约束。
   - 本次要做的任务编号。
   - 本次任务所属章节的 `X00 实现契约与禁止项`（如 D00/E00）。
   - 如果涉及 UI，必须阅读 N 章节对应检查，并确认该原子任务已引用 U 章对应 UI 示意图；没有引用时先补文档再开发。
4. 如果涉及 UI，阅读：
   - `ui-interaction.md`
   - `ui-implementation-guardrails.md`
5. 如果涉及 UCP / 数据接入 / DataSource 兼容 / PushTarget 推送 / 接口配置归并，阅读：
   - `ucp-coordination.md`
6. 如果涉及 AI 接入 / AI-ready / 权限传播 / ODS-DWD-DWS-ADS 派生权限 / 数据上下文，阅读：
   - `spec.md` 第 20 节。
   - `atomic-tasks.md` Y 章和 U26。
   - `specs/004-ai-native-workbench` 相关能力注册与 Policy Guard 文档。
   - `specs/005-unified-permission-model` 相关权限模型文档。
7. 如果涉及测试或验收，阅读：
   - `testing-acceptance.md`
8. 查看 `atomic-tasks.md` 已勾选状态，确认前置任务是否已完成。
9. 检查本次任务是否已内嵌 UI/测试/验收要求；如没有，先按 `atomic-tasks.md` 的 A03/A05 模板补齐。涉及 UI 的原子任务必须补 `UI 示意图`，引用 U00-U26；涉及测试的任务必须写明单测/API/组件/E2E/build 或不适用原因。
10. 查看 git 当前状态，避免覆盖用户或其他模型未提交变更。`r`n`r`n---

## 2. 每次开工前必须在回复中声明

后续模型开始实际开发前，应在回复或执行说明中写明：

```text
本次开发启动确认：
- 已阅读 START_HERE.md：是/否
- 已阅读 spec.md 相关章节：是/否
- 已阅读 atomic-tasks.md 对应任务：是/否，任务编号：...
- 已阅读 A05 防误解强约束和章节 X00 契约：是/否/不涉及
- 是否涉及 UI：是/否
- 如涉及 UI，已阅读 ui-interaction.md 和 ui-implementation-guardrails.md：是/否/不涉及
- 是否涉及 UCP：是/否
- 如涉及 UCP，已阅读 ucp-coordination.md：是/否/不涉及
- 已检查 git status：是/否
- 本次计划完成任务编号：...
```

如果不能完成以上确认，不应开始改代码。

---

## 3. 每次结束开发时必须做什么

每次开发结束时，必须：

1. 更新 `atomic-tasks.md` 中已完成任务的 `[ ]` 为 `[x]`。
   - 每个功能任务只有在开发、UI、测试、验收全部完成后才允许勾选。
2. 如果完成的是阶段级任务，也同步更新 `tasks.md`。
3. 如果发现任务定义不够清楚，补充到 `atomic-tasks.md`，不要只口头说明；如果涉及 API/权限/SQL/Schema，优先补 A05 或章节 X00 契约。
4. 如果涉及 UI，填写 UI 合规自检。
5. 如果涉及测试，记录测试命令和结果。
6. 在最终回复中列出：
   - 已完成任务编号。
   - 未完成任务编号。
   - 修改文件。
   - 测试结果。
   - 风险和后续建议。

---

## 4. 为什么必须这样做

本 Spec 是长期渐进建设，不会一次完成。后续开发可能跨越：

- 不同模型。
- 不同分支。
- 不同时间。
- UCP 已合并或未合并的不同状态。
- UI 一期/V2 的不同边界。

因此不能依赖聊天上下文，必须依赖文档中的启动协议和任务勾选状态。

---

## 5. 快速入口

- 总体 Spec：`spec.md`
- 原子任务：`atomic-tasks.md`
- UI 设计：`ui-interaction.md`
- UI 守则：`ui-implementation-guardrails.md`
- UCP 协同：`ucp-coordination.md`
- 测试验收：`testing-acceptance.md`





