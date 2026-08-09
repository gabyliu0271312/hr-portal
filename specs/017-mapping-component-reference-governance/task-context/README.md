# 017 AI 任务上下文包

本目录是 `atomic-tasks.md` 的执行级补充。每个上下文包均遵守 `../ai-execution-protocol.md` 的标准任务卡格式。

## 使用规则

所有 `允许修改`、`禁止修改`、`必读`中的 `hr-portal/...` 路径均以 `D:\AI项目\HR提效工具搭建\` 为项目根目录解析，不以当前任务卡所在目录解析。

1. 实现 AI 只能认领一个上下文包；只有主代理明确允许时，才能认领同一包内标明的连续任务组。
2. 先满足卡片的前置任务，再读取“必读”和真实代码。
3. 只能修改“允许修改”中列出的文件；需要新增文件时必须位于列出的目录。
4. 触发“阻塞条件”必须停止并提交标准交付报告，不得自行扩张架构。
5. 本目录的任务卡与 `atomic-tasks.md` 同等约束；冲突时以 `ai-execution-protocol.md`、017 `spec.md`、012 r0101、011 x0210 的优先级为准。

## 上下文包索引

| 上下文包 | 对应任务 | 说明 |
|---|---|---|
| `foundation.md` | A0001-A0009 | 合同、目录、版本、迁移与测试基础，必须串行 |
| `component-core.md` | M0101-M0105、M0120-M0124 | 公共 DTO、执行器、Workspace、版本和审计，必须串行 |
| `rule-plugins.md` | M0110-M0116 | 七类插件；公共 core 完成后可逐项串行或隔离并行 |
| `warehouse-adapter.md` | W0201-W0211 | `standardization_rules` 和 ODS→DWD 接入 |
| `workflow-adapter.md` | P0301-P0305 | 流程节点接入 |
| `ucp-transform-adapter.md` | U0401-U0404 | UCP Transform Legacy v1 兼容 |
| `sink-adapter.md` | U0410-U0414 | Sink 兼容，不得触碰写入合同 |
| `push-target-adapter.md` | U0420-U0423 | PushTarget 兼容，不得触碰发送合同 |
| `wage-migration.md` | B0501-B0508 | 工资双跑、灰度和切换 |
| `cost-center-lifecycle.md` | B0510-B0514 | 成本中心业务生命周期 |
| `quality-gates.md` | Q0601-Q0609 | 首期验收与主代理审核 |
