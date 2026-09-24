# PM-T017 指标库原子任务

completion_status: incomplete
pixel_restore_status: blocked
uncovered_reasons: missing_metric_rows, missing_metric_form, missing_filter_state, missing_permission_state

- [x] PM-T017-T01 指标库页面框架
  - 前置条件：PM-T002 后台入口；指标库采集参数；本目录 `spec.md`、`ui-interaction.md`。
  - 功能范围：实现标题栏、字段/公式入口占位、指标库内容卡片、工具栏和采集到的空状态。
  - 不修改范围：真实指标 API、指标字段、编辑表单、字段/公式管理、多维表格编辑业务。
  - 代码交付物：`PerformanceMetricLibrary.vue`、目标路由更新。
  - UI 要求：复用全局绩效组件和 `tokens.css`；保持 894x631 Tablet 采集下的 20px 内容内边距、8px 圆角、轻阴影、14px 正文和 18px 标题层级。
  - 测试要求：组件测试覆盖标题、工具栏按钮、搜索占位、空状态和辅助说明；执行 `vue-tsc --noEmit` 与生产构建。
  - 验收标准：从应用设置指标库路由打开页面；无虚拟数据；未采集操作只提示后续接入；空状态结构与采集文案一致。
  - 完成定义：页面、路由、组件测试和类型/构建检查完成；真实 API 和完整交互验收保留给后续任务。
  - 验收证据：`PerformanceMetricLibrary.spec.ts` 1 个用例通过；`npm.cmd run build` 通过（3196 modules）；页面使用 `PerformanceCreateButton`、`PerformanceButton`、`PerformanceSearchInput`、`PerformanceFilterButton`、`ProjectMemberColumnDrawer` 与 `tokens.css`。

- [ ] PM-T017-T02 指标库真实数据与编辑流程
  - 前置任务：PM-T017-T01；冻结指标领域模型、列表字段、API Schema、权限和审计契约。
  - 功能范围：待确认后接入指标列表、筛选、列设置、新建/编辑、字段/公式管理和多维表格编辑。
  - UI 要求：保留已确认空状态结构，补齐 loading/error/forbidden 和危险操作状态。
  - 测试要求：API 成功、参数错误、403、分页、空数据、表单保存和失败恢复；页面 API 联调。
  - 完成定义：真实 API、权限和完整交互验收完成后才能勾选。
