# PM-T002 原子任务：绩效后台入口与设置壳

## 任务状态规则

只有代码、交互、测试和验收证据均完成后，才能把未完成标记改为完成标记。

## 任务清单

- [x] PM-T002-T01 调整绩效后台入口与路由权限门禁
  - 前置任务：PM-001-T02、PM-001-T05。
  - 功能范围：移除顶部后台设置 Tab；增加右上角用户下拉菜单和后台管理入口；保留 /performance/settings；增加菜单可见性和路由访问双重校验。
  - 代码交付物：PerformanceLayout、绩效路由守卫、必要的权限上下文适配和前端测试。
  - 不修改范围：不开发后台配置内容、周期管理、流程模板、语言/时区或飞书登录。
  - UI 要求：按 ui-interaction.md 实现；无需完整后台 UI 蓝图。
  - UCP/外部系统要求：不涉及。
  - 数据库要求：不涉及迁移。
  - 权限要求：performance.admin 加至少一项内部配置权限才可展示和访问；绩效超级管理员不得因此获得业务配置入口。
  - 测试要求：覆盖有权限展示/跳转、无权限隐藏、直接路由拒绝、超级管理员拒绝、退出登录不回归，以及前端构建。
  - 验收标准：符合截图所表达的右上角下拉入口方式；顶部无后台设置；设置页仍为占位。
  - 完成证据：2026-08-04 执行 npm.cmd run test -- src/utils/performanceSettingsAccess.spec.ts，1 passed；执行 npm.cmd run build，通过 Vue 类型检查和 Vite 生产构建。
  - 完成定义：已完成。入口展示与路由守卫复用同一权限函数；未新增后台内容页面。

- [x] PM-T002-T02 实现独立绩效后台设置壳与菜单占位
  - 前置任务：PM-T002-T01。
  - 功能范围：后台管理使用新 Tab 打开 /performance/settings；使用独立后台布局；左上角显示创梦绩效设置；实现应用设置菜单及功能建设中占位内容。
  - 代码交付物：独立后台布局、设置路由适配、用户菜单新 Tab 跳转、设置侧栏占位组件和前端测试。
  - 不修改范围：不实现周期/项目、席位、模板、题目、权限或系统设置的具体业务功能；不显示通用设置或飞书管理后台。
  - UI 要求：按 `ui-interaction.md` 和已确认蓝图 `../../ui-blueprints/PM-T002-performance-settings-shell.md`（预览图同目录 PNG）实现；不得偏离其菜单、默认项、排除项和状态定义。
  - UCP/外部系统要求：不涉及。
  - 数据库要求：不涉及迁移。
  - 权限要求：沿用 T01 双重权限门禁；新 Tab 不得绕过路由访问校验。
  - 测试要求：覆盖新 Tab 地址、独立布局、菜单顺序、移除项、默认占位和无权限路由拒绝，并执行前端构建。
  - 验收标准：后台页不再显示 HR Portal/绩效前台头部和左侧；左上角为创梦绩效设置；通用设置、飞书管理后台均不存在。
  - 完成证据：2026-08-04 执行 `npm.cmd run test -- src/layouts/PerformanceAdminLayout.spec.ts src/utils/performanceSettingsAccess.spec.ts src/utils/performanceSettingsNavigation.spec.ts src/utils/performanceAdminNavigation.spec.ts`，4 passed；执行 `npm.cmd run build`，通过 Vue 类型检查和 Vite 生产构建；模拟具备 `performance.admin` 与 `performance.configuration.manage` 的用户浏览器走查通过，截图见 `../../ui-blueprints/PM-T002-T02-implemented-settings-shell-default.png`（默认席位管理）和 `../../ui-blueprints/PM-T002-T02-implemented-settings-shell.png`（菜单切换）。
  - 完成定义：已完成。所有占位、独立布局、新 Tab 和权限守卫复用验收情形通过。

## 任务依赖图

PM-001-T02 + PM-001-T05 -> PM-T002-T01 -> PM-T002-T02 -> PM-T003

## 未完成项与风险

| 任务 | 未完成内容 | 风险 | 下一步 |
|---|---|---|---|
| PM-T003 | 周期创建规格与 UI 已确认，尚未实现 | 需要独立实现 API、迁移、定时任务和 UI | 按 PM-T003 原子任务进入开发。 |
