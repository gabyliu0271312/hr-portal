# PM-T014 UI 交互

completion_status: incomplete
pixel_restore_status: blocked
uncovered_reasons: missing_replayable_session, missing_dpr, missing_target_screenshot, missing_editor_state, missing_interaction_evidence

## 入口

- 路由：`/performance/settings/permissions/subject-visibility`
- 路由名：`PerformancePermissionSubjectVisibility`
- 父布局：`PerformanceAdminLayout`

## 列表

页面首先显示与其他应用设置页一致的标题 `被评估人信息可见性设置`，标题下方显示说明文案：`配置不同角色可见的被评估人信息字段，如各角色在被评估人绩效详情页、任务列表页和导出的表格可见的字段`。

表格复用 `PerformanceManagementTable`，列顺序固定为角色名称、可见标签信息、可见字段、操作；分页复用该组件内置分页器。加载失败显示重试；空态沿用共享表格。

## 编辑

点击“编辑”打开共享 `PerformanceDialogShell` 组成的 `PerformanceSubjectVisibilityEditor`。字段复选框复用 `PerformanceCheckbox`；取消不保存；确定 PATCH 当前角色；失败保留弹层和草稿并提示；成功关闭并刷新列表。

采集未覆盖编辑弹层视觉，编辑器只按现有设计系统实现 P0/P1，不宣称采集像素一致。

## 联动

- 工作台人员列表按服务端返回的 `visible_profile_fields` 决定资料列，用户自定义列仍只能在允许列集合内工作。
- 填写详情 header 继续显示姓名和原有副信息单行；副信息改为消费 `profile_fields`，仍用 ` · ` 连接，不改 CSS 或布局。
