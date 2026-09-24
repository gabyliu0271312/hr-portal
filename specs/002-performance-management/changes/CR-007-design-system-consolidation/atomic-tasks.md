# CR-007 原子任务：绩效 UI 设计系统收敛

## 任务状态规则

只有代码、文档、聚焦测试、构建和静态收敛检查均完成后，才能将任务标记为 `[x]`。

## 任务清单

- [x] CR-007-T01 提炼平台与绩效组件 Token
  - 前置条件：CR-007 spec
  - 允许修改：`hr-portal/frontend/src/styles/tokens.css`、`hr-portal/frontend/docs/design-system.md`
  - 要求：新增按钮、弹窗、Footer、字段状态和 focus 状态 Token；不创建同义命名族。
  - 不涉及：后端、数据库、API、权限、UCP。

- [x] CR-007-T02 收敛共享容器与操作区
  - 前置条件：T01
  - 允许修改：`hr-portal/frontend/src/components/performance/FullScreenModal.vue`、`FixedActionBar.vue`、`PerformanceDialogShell.vue`、`PerformanceDrawerShell.vue`、`PerformanceDrawerFooter.vue`、相关共享按钮组件。
  - 要求：固定 Footer 不遮挡内容；内容区滚动和自动撑高由共享壳负责；按钮间距只保留一个来源。
  - 不涉及：业务表单字段和 API。

- [x] CR-007-T03 收敛按钮与表单状态组件
  - 前置条件：T01
  - 允许修改：`src/components/performance/` 下稳定共享按钮、输入框、表单项和必填标签组件。
  - 要求：统一 default/hover/focus/active/disabled/loading/invalid；错误文本和无障碍关联由表单项契约承载。
  - 不涉及：业务校验规则本身。

- [x] CR-007-T04 迁移现有绩效页面的重复入口
  - 前置条件：T02、T03
  - 允许修改：现有绩效页面与弹窗；只替换视觉壳和控件入口，不改变业务状态和提交行为。
  - 要求：标准弹窗、页面操作按钮、表单字段优先消费共享组件；保留真实业务变体的显式 variant。
  - 不涉及：新增业务能力和路由。

- [ ] CR-007-T05 聚焦验证与收口
  - 前置条件：T01-T04
  - 要求：运行前端类型检查、聚焦组件测试、前端构建，并执行硬编码样式/共享组件使用检查；分别记录通过、未运行和阻塞项。
  - UI 验收：本次不新增页面，不宣称新的像素级采集验收；已有页面的运行时截图验证单独记录。
