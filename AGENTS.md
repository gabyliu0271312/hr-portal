# AGENTS.md：开发前必读入口

本仓库存在长期分阶段开发的 Spec。任何模型/开发者开始改代码前，必须先确认是否涉及以下 Spec：

- specs/011-universal-connector-platform/：UCP 通用数据连接器平台建设
- `specs/012-data-warehouse-ucp-integration/`：数据仓库与 UCP 数据连接平台协同建设

如果任务涉及数据仓库、数据接入、UCP、连接器、数据资产、数据建模、指标管理、数据治理、UI 交互或相关测试，必须先阅读：

1. `specs/012-data-warehouse-ucp-integration/START_HERE.md`
2. `specs/012-data-warehouse-ucp-integration/spec.md` 的相关章节
3. `specs/012-data-warehouse-ucp-integration/atomic-tasks.md` 中 A01/A02 与本次任务编号
4. 涉及 UI 时追加阅读：
   - `specs/012-data-warehouse-ucp-integration/ui-interaction.md`
   - `specs/012-data-warehouse-ucp-integration/ui-implementation-guardrails.md`
   - `atomic-tasks.md` 的 N 章节
5. 涉及 UCP/数据接入时追加阅读：
   - `specs/012-data-warehouse-ucp-integration/ucp-coordination.md`
6. 涉及测试/验收时追加阅读：
   - `specs/012-data-warehouse-ucp-integration/testing-acceptance.md`

开始开发前必须在回复中输出 `START_HERE.md` 要求的“本次开发启动确认”。

完成开发后必须：

- 将 `atomic-tasks.md` 对应任务从 `[ ]` 更新为 `[x]`。
- 如完成阶段级任务，同步更新 `tasks.md`。
- 如涉及 UI，完成并标记 N 章节对应 UI 合规任务。
- 在最终回复中列出修改文件、测试结果、完成/未完成任务编号与后续风险。

## UCP 011 额外要求

涉及 UCP、数据连接、连接器、外部系统、资源、凭证、Pipeline、事件、执行监控、DataSource 桥接时，必须先阅读：

1. specs/011-universal-connector-platform/START_HERE.md`r
2. specs/011-universal-connector-platform/atomic-tasks.md`r
3. specs/011-universal-connector-platform/warehouse-coordination.md`r


