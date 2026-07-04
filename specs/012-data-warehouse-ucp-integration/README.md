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



## 评审修订、分层流转与 ETL 预留

2026-07-04 后续修订已写入：

- `spec.md` 第 13 章：评审意见采纳与修订决策。
- `spec.md` 第 14 章：ODS → DWD → DWS → ADS 分层流转与轻量 ELT / ETL 规划。
- `ucp-coordination.md` 第 9 章：修订后的 UCP 协同策略。
- `atomic-tasks.md` O/P 章节：对应的原子级落地任务。

后续开发涉及 UCP 绑定、`/warehouse/ucp/*`、ConnectorSystemConfig、DataSource 兼容、影响分析、首页质量动态、ODS→DWD→DWS→ADS 分层流转、轻量 ELT 预留时，必须先阅读上述章节。


## 二期/三期/最终蓝图任务

一期完成后，后续开发不要回到高层路线图自由发挥，必须阅读并执行：

- `atomic-tasks.md` Q 章：二期，数据治理深化 + UCP 薄代理 + 可视化建模 V2。
- `atomic-tasks.md` R 章：三期，按 ODS → DWD → DWS → ADS 主线进行能力下沉与增强。
- `atomic-tasks.md` X 章：四期高级数据开发与消费侧能力复评。
- `atomic-tasks.md` S 章：最终蓝图与独立应用化。

每个任务均已内嵌 UI 要求、UCP/数据仓库边界要求、测试要求、验收标准。


## 系统设置归并与 UI 线框

后续涉及字段管理、接口配置、同步历史、表间关联、数据视图时，必须阅读：

- `spec.md` 第 16 章：系统设置既有能力归并策略。
- `atomic-tasks.md` T 章：归并原子任务。
- `atomic-tasks.md` U 章：UI 示意图与交互说明。

涉及 UI 的原子任务必须引用 U 章节线框图；如果实现与线框不一致，先更新文档再开发。


## Phase 1.5 归并前置

系统设置既有能力归并已提升为 Phase 1.5 / 二期前置任务。后续开发 Q/R/S 前，必须先阅读：

- `spec.md` 第 17 章。
- `atomic-tasks.md` T07/T08/T09。
- `atomic-tasks.md` U17/U18/U19。

重点：数据仓库保留数据接入视角；数据资产和数据视图融合为统一资产目录；表间关联授权必须提前迁移设计。

## AI 接入预留与权限传播

后续涉及 AI-ready、AI 解释、AI 草稿生成、权限传播、ODS→DWD→DWS→ADS 派生权限、数据上下文裁剪时，必须阅读：

- `spec.md` 第 20 章：AI 接入预留与权限传播规划。
- `atomic-tasks.md` Y 章：AI 接入预留与权限传播后续原子任务。
- `atomic-tasks.md` U26：AI 接入预留与权限安全线框图。
- `testing-acceptance.md` 第 14 章：AI 接入预留与权限传播验收。
- `ui-interaction.md` 第 14 章：AI 接入预留的未来 UI 交互边界。
- `specs/004-ai-native-workbench` 与 `specs/005-unified-permission-model` 相关文档。

注意：一期已经完成，以上内容只作为二期及以后未完成任务的执行要求，不得回填为一期已完成能力。
