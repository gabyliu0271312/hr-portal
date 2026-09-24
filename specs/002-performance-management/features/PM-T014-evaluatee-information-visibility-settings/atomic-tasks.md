# PM-T014 原子任务

completion_status: incomplete
pixel_restore_status: blocked
uncovered_reasons: missing_replayable_session, missing_dpr, missing_target_screenshot, missing_editor_state, missing_interaction_evidence

- [x] PM-T014-T01 配置契约、模型与 API
  - 前置条件：PM-T002 后台入口；本功能 `spec.md`、`api-contract.md`、`data-model.md` 已冻结。
  - 必读：本目录规格、执行契约、迁移协调。
  - 允许修改：绩效模型、新 0238 迁移、新可见性 service/router、main 注册、后端聚焦测试、本目录规格。
  - 禁止修改：历史迁移、周期人员快照写入、角色授权模型。
  - 测试：默认值、分页、PATCH、非法字段、403、审计、重开。
  - 完成证据：新增单例模型、0238 迁移、GET/PATCH router、服务端默认规则和审计；后端聚焦回归 93 passed；迁移 upgrade→downgrade→upgrade 通过，最终位于 0238 head。

- [ ] PM-T014-T02 页面框架与共享组件
  - 前置条件：PM-T014-T01 API 契约；默认列表采集结构已确认。
  - 必读：`ui-interaction.md`、`component-model.md`、`extracted-ui-contract.json`。
  - 允许修改：新页面、新业务编辑器、绩效 API 客户端、目标路由、聚焦前端测试。
  - 禁止修改：共享组件既有视觉默认值、其他设置页面。
  - UI：默认列表 variant；表格/分页/弹窗/复选框必须共享。
  - 采集/像素门禁：P0/P1；`completion_status=incomplete`、`pixel_restore_status=blocked`。
  - 实现证据：页面、共享编辑器、API 客户端和路由已完成；页面/编辑器/共享组件测试 8 passed，`vue-tsc --noEmit` 与生产构建通过。
  - 阻塞项：实现前规格门禁因缺少稳定 session、DPR、截图、编辑态及完整交互证据返回 BLOCKED；不得勾选任务或宣称 P2 完成。

- [x] PM-T014-T03 工作台资料可见性联动
  - 前置条件：PM-T014-T01；工作台任务与填写详情 API 已存在。
  - 必读：`api-contract.md`、权限模型、PM-T008/PM-T009 相关接口。
  - 允许修改：可见性服务、`projects_router.py`、`performance.ts`、`performanceReminder.ts`、`PerformanceReminderPanel.vue`、`PerformanceSelfSummaryHeader.vue`、聚焦测试。
  - 禁止修改：工作台列表/header CSS、任务生成、周期快照内容。
  - 测试：角色解析、隐藏值服务端裁剪、列联动、header 数据联动、旧响应兼容。
  - 完成证据：服务端返回角色与允许字段并在序列化前置空隐藏值；工作台列按允许字段集合生成；自我总结与评价抽屉 header 消费 `profile_fields` 且未改 CSS。后端回归 93 passed；前端联动/工作台/评估回归 32 passed；`vue-tsc --noEmit` 和生产构建通过。

- [ ] PM-T014-T04 聚焦验收与规格更新
  - 前置条件：PM-T014-T01、PM-T014-T02、PM-T014-T03。
  - 测试：后端 pytest、前端 Vitest、vue-tsc、build、迁移 upgrade/downgrade；真实截图缺失则保持 blocked。
  - 已运行：后端 93 passed；前端新页面/编辑/列表/header 11 passed，含工作台与 Review 回归共 32 passed；类型检查、生产构建、Python compileall 通过；迁移 upgrade→downgrade→upgrade 通过。
  - 未完成：真实浏览器目标截图、rendered contract 和 pixel diff 未运行，UI gate 仍 blocked。

## 完成定义

仅在代码、迁移、权限、联动测试和验收证据完成后勾选对应任务；P2 证据缺失不宣称像素完成。
