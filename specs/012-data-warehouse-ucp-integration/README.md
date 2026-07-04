# 012 Data Warehouse × UCP Integration Spec

本目录是数据仓库与 UCP 数据连接平台协同建设的完整开发规范。

## 每次开发必须先读

请从 `START_HERE.md` 开始。不要直接跳到任务开发。

推荐阅读顺序：

1. `START_HERE.md`：每次开发会话启动协议。
2. `spec.md`：一期到最终蓝图的完整产品/架构 Spec。
3. `atomic-tasks.md`：可逐项勾选的原子级开发任务。
4. `tasks.md`：阶段级任务视图。
5. `ui-interaction.md`：UI 交互评估与设计要求。
6. `ui-implementation-guardrails.md`：UI 实施约束与防偏规则。
7. `ucp-coordination.md`：与 UCP 连接器平台的协同边界。
8. `testing-acceptance.md`：测试要求与验收标准。

## 强制规则

- 每次开工都必须执行 `atomic-tasks.md` 的 A01。
- 功能任务必须内嵌 UI、测试、验收要求；不能只依赖独立 UI/测试章节。
- 每完成一个原子任务，必须将对应 `[ ]` 改为 `[x]`。
- UI 开发必须同时执行 `atomic-tasks.md` 的 N 章节对应任务。
- 数据仓库 UI 不得重复建设 UCP 的凭证、Pipeline、事件触发配置能力。
- `DataSource` 在一期不直接替换为 UCP；它是数据仓库落表配置，UCP 是长期统一数据连接平台。



## 评审修订与 ETL 预留

2026-07-04 后续修订已写入：

- `spec.md` 第 13 章：评审意见采纳与修订决策。
- `spec.md` 第 14 章：数据仓库内置轻量 ELT / ETL 预留规划。
- `ucp-coordination.md` 第 9 章：修订后的 UCP 协同策略。
- `atomic-tasks.md` O/P 章节：对应的原子级落地任务。

后续开发涉及 UCP 绑定、`/warehouse/ucp/*`、ConnectorSystemConfig、DataSource 兼容、影响分析、首页质量动态、轻量 ELT 预留时，必须先阅读上述章节。
