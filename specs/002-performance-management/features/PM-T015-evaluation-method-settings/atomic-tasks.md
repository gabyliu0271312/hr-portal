# PM-T015 原子任务

状态规则：完成 P0/P1 页面结构、组件测试和构建后可标记实现任务；因采集缺少截图/DPR/可重放交互，`pixel_restore_status` 保持 blocked，不宣称像素级完成。

- [x] PM-T015-T01 页面与业务组件
  - 目标：将考核方式设置路由从占位页替换为采集默认态页面。
  - 前置条件：无；采集默认态参数已提供。
  - 必读：`spec.md`、`component-model.md`、`extracted-ui-contract.json`、`acceptance-contract.md`。
  - 允许修改：`frontend/src/views/performance/AssessmentMethodSettings.vue`、`frontend/src/components/performance/PerformanceAssessmentMethodCard.vue`、`frontend/src/components/performance/PerformanceProjectAssessmentCard.vue`、路由。
  - 禁止修改：后端模型/API、其他系统设置页、共享控件默认视觉。
  - UI 要求：保留卡片顺序、文案顺序、开关和复选框状态；复用共享 PerformanceSwitch/PerformanceCheckbox；项目制考核关闭时隐藏其下方全部配置内容；项目角色编辑入口由 PM-T015-T04 接入弹窗。
  - 测试：页面结构、默认态、开关交互、项目制开关关闭态和禁用复选框。
  - 完成证据：页面组件和路由已实现；像素证据保持 blocked。

- [x] PM-T015-T02 聚焦测试与构建
  - 目标：覆盖页面结构、可见文案、开关互不影响、手动导入禁用态和路由接入。
  - 前置条件：PM-T015-T01。
  - 测试：Vitest 聚焦测试、`vue-tsc --noEmit`、`npm run build`。
  - 完成证据：`AssessmentMethodSettings.spec.ts` 4 passed；`npm run build`（包含 `vue-tsc --noEmit`）通过；像素证据保持 blocked。

- [ ] PM-T015-T03 运行时视觉验收
  - 目标：在真实应用中生成截图和 rendered contract 并比较采集契约。
  - 前置条件：PM-T015-T01、PM-T015-T02；需要真实截图、DPR 和可重放状态证据。
  - 当前状态：blocked，用户提供的文本未包含所需证据。

- [x] PM-T015-T04 项目角色编辑弹窗
  - 目标：实现项目合作关系来源“编辑”入口打开的项目角色设置弹窗。
  - 前置条件：PM-T015-T01、用户提供的 `Div.ud__modal__content`、`Div.ud__modal__header`、`Div.ud__modal__body` 和 `Div.ud__modal__footer` SnapSpec Blueprint。
  - 必读：`spec.md`、`component-model.md`、`ui-interaction.md`、`acceptance-contract.md`。
  - 允许修改：`frontend/src/components/performance/PerformanceDialogShell.vue`、`frontend/src/components/performance/PerformanceProjectRoleDialog.vue`、`frontend/src/components/performance/PerformanceProjectAssessmentCard.vue`、`frontend/src/views/performance/AssessmentMethodSettings.vue`、`frontend/src/views/performance/AssessmentMethodSettings.spec.ts`。
  - 禁止修改：后端模型/API、数据库迁移、共享开关/复选框默认视觉、其他系统设置页。
  - UI 要求：弹窗宽度 600px；标题、说明、空角色区、添加图标和“添加角色”文字、语言入口、确定/取消和关闭按钮按 SnapSpec 顺序呈现；点击添加角色后复用 `PerformanceTextField` 的 `feishu-input` 变体显示中文角色输入行，添加按钮移动到输入行下方；两行及以上复用 `PerformanceSortableList`、`PerformanceDragHandle` 和 `PerformanceIconButton` 显示拖拽/删除控件，删除 hover 底色使用统一设计 token；确定/取消/关闭仅关闭弹窗；删除仅移除本地输入行，不捏造角色保存请求。
  - 测试：编辑入口打开弹窗、弹窗文案和 SVG、确定/取消/关闭关闭弹窗、项目制开关关闭时弹窗入口及弹窗均不可见。
  - 完成证据：聚焦 Vitest 与前端构建通过；像素级验收仍受缺失截图/DPR/可重放证据阻塞。

- [x] PM-T015-T05 关键指标开关联动后台指标管理导航
  - 目标：关键指标考核开启时，在绩效后台侧边栏席位管理后显示“指标管理”，并提供“指标库”和“指标模板”占位入口；关闭时隐藏整组入口。
  - 前置条件：PM-T015-T01、PM-T015-T02；复用现有 `PerformanceAdminExpandableMenu` 及后台导航状态样式。
  - 允许修改：`frontend/src/utils/performanceAdminNavigation.ts`、`frontend/src/utils/performanceAdminNavigation.js`、`frontend/src/layouts/PerformanceAdminLayout.vue`、`frontend/src/components/performance/PerformanceAdminExpandableMenu.vue`、`frontend/src/views/performance/AssessmentMethodSettings.vue`、对应路由与测试。
  - 后端交付物：`backend/app/performance/assessment_method_settings_router.py`、`backend/app/performance/models.py`、对应 Alembic migration 与测试；设置接口默认为关闭，读写 `metric_assessment_enabled`。
  - 禁止修改：共享侧边栏 hover/active 视觉规则。
  - UI 要求：指标管理位于席位管理后；折叠/展开、hover、active 和子菜单行为复用现有后台侧边栏；图标为 18×18 SVG，使用 `MetricManagementOutlined` 与提供的 path；指标库、指标模板仅展示占位页。
  - 测试：组件/页面测试覆盖开关状态、导航显示顺序、展开子菜单、两个占位入口、关闭后隐藏和 SVG 属性；后端覆盖默认关闭、200 成功、403 权限、422 参数校验和审计；执行 `vue-tsc --noEmit` 与 `npm run build`。
  - 验收标准：后端设置接口默认返回关闭；开启后保存成功并在侧边栏显示指标管理，关闭后保存成功并隐藏指标管理；接口失败时前端回滚并提示；开启状态下可展开指标管理，点击指标库/指标模板可进入对应占位页；不发送指标库/指标模板保存请求。
  - 完成证据：后端聚焦测试 4 passed；前端聚焦 Vitest 25 passed；`npm run build` 通过；迁移 `0243_performance_assessment_method_settings` 为唯一 head；像素级验收仍受 PM-T015 采集证据缺失影响。
