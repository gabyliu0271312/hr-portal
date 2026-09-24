# PM-T014 组件模型

completion_status: incomplete
pixel_restore_status: blocked
uncovered_reasons: missing_replayable_session, missing_dpr, missing_target_screenshot, missing_editor_state, missing_interaction_evidence

- 采集限制：缺少稳定 source state、编辑态、DPR、截图及运行时证据。

## component_tree

```text
SubjectVisibilitySettings
├── description
├── PerformanceManagementTable
│   ├── role/name/field/action columns
│   └── shared pagination
└── PerformanceSubjectVisibilityEditor
    ├── PerformanceDialogShell
    ├── PerformanceCheckbox × field options
    └── shared footer buttons
```

| 层级 | component_id | 职责 | props/events | source_state_ids |
| --- | --- | --- | --- | --- |
| 基础 | `PerformanceManagementTable` | 表格状态与分页 | rows/page/pageSize/total；page-change/page-size-change | `not_observed` |
| 基础 | `PerformanceDialogShell` | 编辑弹层壳 | modelValue/title/loading | `not_observed` |
| 基础 | `PerformanceCheckbox` | 字段选择 | modelValue/label/disabled | `not_observed` |
| 业务 | `PerformanceSubjectVisibilityEditor` | 单角色字段编辑 | role/options；submit/cancel | `not_observed` |
| 页面 | `SubjectVisibilitySettings` | API、分页、反馈、组件组装 | 无外部 props | `SNAPSPEC-DEFAULT-20260923` |

## 状态机

- 页面：`idle → loading → ready | error`。
- 编辑：`closed → editing → saving → closed | editing(error)`。
- 分页：page/pageSize 变化后重新 GET。

## ownership

页面负责数据生命周期；共享表格负责表格/分页视觉；业务编辑器负责字段草稿和提交事件；运行时可见性裁剪由后端服务负责。工作台现有组件只消费新字段，不改变样式。
