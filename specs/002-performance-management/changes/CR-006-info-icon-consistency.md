# CR-006 绩效信息提示图标与浮层统一

## 背景与确认

用户于 2026-10-29 确认先核查、随后要求“完成统一优化调整和接入”。核查结论：图标入口存在共享组件、裸 SVG、字符 `ⓘ`、原生 `title` 和 Element Plus Tooltip 多套实现；图文间距混用 `2px`/`4px`/`8px` 与硬编码；普通提示浮层与禁用操作提示浮层各有一套样式。本轮只统一提示语义，不改信息架构、业务文案、权限、API、数据库或周期快照。

## 原行为

- `PerformanceInfoPopover` 普通提示浮层在组件内硬编码宽度、层级、字体和阴影；禁用操作提示另有一套 token 化样式。
- 权限树、流程模板评估类型、通知配置使用原生 `title` 或字符 `ⓘ`，悬浮延迟、样式、位置由浏览器决定。
- 流程模板“最终结果”限制提示为页面局部定时器与自绘浮层。
- `PerformanceRadioGroup.showInfo` 只渲染装饰图标，没有任何提示内容。
- 信息图标与相邻文字的间距散落为 `2px`、`4px`、`8px`，没有语义 token。

## 新行为

- 新增语义 token：`--performance-info-icon-size`（16px）、`--performance-info-icon-gap`（4px，引用 `--spacing-1`）、`--performance-info-icon-color`；并补充 `--performance-popover-width/gap/viewport-margin/arrow-*` 供公共浮层消费。
- `PerformanceInfoPopover` 是本模块唯一提示入口：图标尺寸、颜色、图文间距、焦点环、浮层宽度、箭头和视口避让统一由 token 与共享壳 `PerformancePopover` 提供；`content` 变为可选，无内容时只保留非交互图标、不弹层、不进入 Tab 焦点。
- `PerformanceRadioGroup` 新增可选 `info` 字段并复用共享提示；`showInfo: true` 回退使用选项文案作为说明，避免出现无可解释的装饰图标。
- 权限树说明、通知时间说明、节假日屏蔽说明、角色删除禁用原因、流程模板最终结果限制说明全部改走共享组件；流程页删除局部定时器、自绘浮层和对应 CSS。
- 评估规则类型单选、等级表头“量化分/量化值”列头等提示符图标全部改由共享组件渲染；无正式文案时统一显示占位文案 `提示文案待补充`，不再保留裸图标或无反馈图标。
- `PerformanceFormItem` 标签行、`PerformanceSwitchSettingRow`、引用设置标题统一使用 `--performance-info-icon-gap`。

## 兼容性

- 说明文案全部保持原文，未新增或改写业务口径。
- `PerformanceSwitchSettingRow` 仍支持 `infoColor` 覆盖（流程模板评估类型提示沿用蓝色语义）。
- `PerformanceDisabledReason` 保留 `variant` prop 兼容既有调用，默认分支不再使用 Element Plus Tooltip。
- 无 API、DTO、数据库、迁移、权限、周期快照或 UCP 变更。

## 影响范围

- `frontend/src/styles/tokens.css`
- `frontend/src/components/performance/`：`PerformanceInfoPopover.vue`、`PerformanceRadioGroup.vue`、`PerformanceFormItem.vue`、`PerformanceSwitchSettingRow.vue`、`PerformanceWorkSummaryItemSettings.vue`、`FunctionPermissionNode.vue`、`PerformanceDisabledReason.vue`、`PerformanceTodoNotificationDialog.vue`、`ReviewTypeRadioGroup.vue`、`ReviewRuleForm.vue`、`PerformanceReportSectionTitle.vue`、`ProjectStatisticsReportPanel.vue`、`projectStatisticsReport.ts`
- `frontend/src/views/performance/`：`PerformanceTemplateWorkflowSettings.vue`、`PerformanceRoleConfiguration.vue`、`CycleManagement.vue`
- 对应 spec：`PerformanceDisabledReason.spec.ts`、`ReviewRuleForm.spec.ts`、`PerformanceTemplateWorkflowSettings.spec.ts`、`PerformanceRoleConfiguration.spec.ts`

## 验收与证据

- 定向回归：`npm --prefix hr-portal/frontend test -- src/components/performance/PerformanceDisabledReason.spec.ts src/components/performance/PerformanceInfoPopover.spec.ts src/views/performance/PerformanceTemplateWorkflowSettings.spec.ts src/components/performance/ReviewRuleForm.spec.ts src/components/performance/PerformanceSwitchSettingRow.spec.ts src/components/performance/PerformanceTodoNotificationDialog.spec.ts` → **6 files / 98 tests passed**。
- 范围回归：`npm --prefix hr-portal/frontend test -- src/components/performance src/views/performance --exclude '**/*.spec.js' --maxWorkers=3 --minWorkers=1` → **132 files / 1041 tests passed，0 failed**。
- 报表章节与周期列表接入补充验证：`npm --prefix hr-portal/frontend test -- src/components/performance/ProjectStatisticsReportPanel.spec.ts src/views/performance/CycleManagement.spec.ts src/components/performance/PerformanceInfoPopover.spec.ts` → **3 files / 46 tests passed**；`npm --prefix hr-portal/frontend run build` 再次通过。
- 占位文案统一后的补充验证：`npm --prefix hr-portal/frontend test -- src/components/performance/ReviewRuleForm.spec.ts src/components/performance/ProjectStatisticsReportPanel.spec.ts src/views/performance/CycleManagement.spec.ts src/components/performance/PerformanceInfoPopover.spec.ts src/components/performance/PerformanceNotificationSettingsCard.spec.ts src/components/performance/PerformanceCycleOverdueSubmissionDialog.spec.ts` → **6 files / 72 tests passed**。
- 构建：`npm --prefix hr-portal/frontend run build` → vue-tsc 与 Vite 生产构建通过（仅既有 VueUse PURE 注释提示）。
- 未执行：真实登录态浏览器走查、截图、数据库验收、部署与提交推送；本轮不声称生产可用。

## 报表章节、周期列表与无文案图标统一（2026-10-29 补充确认）

用户确认：所有提示符图标必须统一走共享组件，缺文案时统一显示占位符，保证图标、弹窗和交互效果可见。

- 新增 `frontend/src/components/performance/performanceInfoPlaceholder.ts`，导出唯一占位文案 `提示文案待补充`。
- 报表章节标题：`PerformanceReportSectionTitle.vue` 改用 `PerformanceInfoPopover` 并新增可选 `info`；`reportSectionInfo` 9 个章节先全部指向占位文案。
- 周期列表标题：`CycleManagement.vue` 的 `ⓘ` 改为共享组件，`cycleListInfo` 指向占位文案。
- 评估规则类型单选（`ReviewTypeRadioGroup.vue`）与等级表头“量化分/量化值”（`ReviewRuleForm.vue`）恢复原图标位置，但改由共享组件渲染，同样使用占位文案；此前“删除装饰图标”的做法作废。
- `PerformanceRadioGroup` 的 `showInfo` 选项在没有 `info` 时回退到占位文案，不再以选项文案冒充说明。
- 文案补齐后只需替换占位常量或对应条目，组件与交互无需再改。

## 待补充文案的位置

- 报表章节：`frontend/src/components/performance/projectStatisticsReport.ts` 的 `reportSectionInfo`，按 `overview` / `department` / `team` / `sequence` / `level` / `tenure` / `self-final` / `dimension` / `history` 逐项替换占位文案。
- 周期列表标题：`frontend/src/views/performance/CycleManagement.vue` 的 `cycleListInfo`。
- 评估规则类型单选、等级表头“量化分/量化值”、`PerformanceRadioGroup` 的 `showInfo` 选项：当前统一消费 `performanceInfoPlaceholder.ts` 的默认占位文案；需要逐项说明时改为传入各自的 `info`。

## 未纳入本轮

- 普通操作 Tooltip（按钮名称、文字溢出 `show-overflow-tooltip`、执行状态说明）不属于提示符图标，保持原实现。
- 提示颜色预览浮层（`PerformancePromptPopover`）属于业务内容预览；当前工作区已改用共享浮层壳承载，其预览语义与配色未在本轮改动。

## 失败用例清理（2026-10-29）

范围回归此前有 16 项失败，其中 10 项为 CR-005-T07 记录的既有失败，3 项指向同工作区其他会话的提示配色与评级标签改动。本轮全部处理，当前绩效范围 0 失败。

实现修正：

- `performanceProjectCalibration.ts` 的 `createCalibrationPhaseId` 参数类型由 `(() => string) | undefined` 改为 `(() => string) | null`。原写法无法表达“显式不使用 crypto”，因为默认参数会把 `undefined` 重新解析为 `globalThis.crypto.randomUUID`。

测试断言与当前实现对齐：

- `AuthorizationManagementPanel.spec.ts`：SurfaceCard 由硬编码 `20px / 8px / rgba(...)` 改为 `var(--spacing-5)`、`var(--radius-lg)`、`var(--shadow-dialog)`。
- `WorkflowNodeBasicFields.spec.ts`：描述字段已复用 `PerformanceTextField`，`.form-control` 由 2 改为 1，并断言 textarea 存在。
- `LevelConfigEditor.spec.ts`：输入 `-2` 被 `min=0` 拒绝并保留原值，断言由等于 `'0'` 改为非负校验。
- `SubjectVisibilitySettings.spec.ts`：字体断言收敛为 `font-family:var(--font-sans)` 片段，不再锁死四属性组合。
- `PerformanceHrbpScopeSummary.spec.ts`：stub 键名由 `PermissionButton` 改为实际使用的 `PerformancePermissionButton`，消除未安装 Pinia 的挂载错误。
- `OtherPermissionSettings.spec.ts`：弹窗主按钮选择器改为 `.dialog .performance-button--primary`。
- `ReviewQuestionEntryVariants.spec.ts`：等级代号节点由 `.level-code-text` 改为实际的 `.rating-tag-label`。
- `PerformanceAssessmentContentLayers.spec.ts`：警示色由 `rgb(249,115,22)` 改为当前定义 `rgb(255,129,26)`。
- `PerformanceListToolbar.spec.ts`：单次筛选点击只触发一次 `filter`，断言由 2 改为 1。
- `PerformanceMetricFieldCreateDialog.spec.ts`：先过滤无文本按钮，再比对 `['取消','确定']`。
- `PerformanceComparisonRuleDrawer.spec.ts`、`PerformanceMetricDimensionCreateDialog.spec.ts`：下拉选项经 `Teleport to="body"` 渲染且含描述副文本，断言改为在 portal 中按 `<strong>` 文本匹配，并补充 `flushPromises`。
- `PerformanceMetricDimensionCreateDialog.spec.ts`：规则节点结构断言由 `.metric-dimension-rule-group > *` 改为分别断言 `.performance-radio-option` 与实际 select。

验证：上述 13 个文件复跑 **135 tests passed**；完整绩效范围 **132 files / 1041 tests passed**；构建通过。
