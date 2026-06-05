---
name: hr-portal-report-component-architecture
description: 报表模块与成本分摊模块共享组件库的架构决策，含 9 个子组件清单和按需组合规则
metadata:
  type: project
---

报表管理和成本分摊两个模块共享同一套报表组件库，位于 `src/components/report/`。
成本分摊页在此基础上额外注入 `ArchiveSection`（计算存档）独有组件。

**Why:** 避免重复造轮子——对报表核心组件的任何优化（转置、聚合、字段选择器等）自动同步到两个模块；成本分摊专属逻辑（存档）通过独立组件隔离，不污染共享层。

**How to apply:** 开发报表相关功能时，改共享组件 = 两边同步；改页面文件（`ReportDesigner.vue` / `CostAllocationDesigner.vue`）= 只影响各自模块。

## 9 个共享组件清单

| 组件 | 职责 |
| --- | --- |
| `ReportBasicInfo.vue` | 报表名、描述、数据来源、发布状态 |
| `ReportFieldPicker.vue` | 可选字段 / 已选字段 双栏选择器 |
| `ReportFilterList.vue` | 筛选条件列表（含下拉候选值逻辑） |
| `ReportSortList.vue` | 排序规则列表 |
| `ReportValueRules.vue` | 数值拆分规则（仅数据集模式） |
| `ReportTransposeConfig.vue` | 转置 / 重映射配置 |
| `ReportAggregateConfig.vue` | 聚合汇总（维度分组 + 度量汇总方式） |
| `ReportRoundingConfig.vue` | 余差收口规则 |
| `ReportPreviewTable.vue` | 预览结果表格 |
| `ReportViewerPanel.vue` | 运行、表格展示、导出、分页 |

成本分摊独有：`ArchiveSection.vue`（计算存档按钮 + 存档历史列表）

## 影响范围速查

| 改动类型 | 改哪里 | 影响范围 |
| --- | --- | --- |
| 表格展示 / 导出 / 运行逻辑 | `ReportViewerPanel.vue` | 两边同步 |
| 转置配置界面 | `ReportTransposeConfig.vue` | 两边同步 |
| 度量汇总 / 聚合配置 | `ReportAggregateConfig.vue` | 两边同步 |
| 任意其他共享组件 | 对应组件文件 | 两边同步 |
| 报表管理专属页面逻辑 | `ReportDesigner.vue` / `ReportList.vue` | 只影响报表管理 |
| 存档逻辑 | `ArchiveSection.vue` / `CostAllocationDesigner.vue` | 只影响成本分摊 |

## 待实施

当前 `ReportDesigner.vue` 尚未拆分，仍为单文件大组件（约 1100 行）。
后续开发成本分摊模块时一并执行拆分，拆完后两个页面都消费共享组件库。
