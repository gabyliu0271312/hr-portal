# PM-T011 原子任务

状态规则：代码、测试和验收证据齐全后才勾选；本轮不宣称像素级完成。

- [ ] PM-T011-T01 契约与持久化
  - 目标：新增工作台入口、公告和全局开关的数据模型、迁移、API DTO 与权限边界。
  - 前置条件：PM-T002 后台入口；本功能 spec/api-contract 已确认。
  - 允许修改：`backend/app/performance/models.py`、新建工作台设置 router/service、`backend/app/main.py`、`backend/alembic/versions/` 新迁移、后端测试。
  - 禁止修改：已有迁移、PM-T010 规格和项目管理 API。
  - API/权限：读写使用 `performance.configuration.manage`；删除和状态变更写审计。
  - 测试：CRUD、搜索/分页、校验、404、403、开关持久化、未知字段拒绝。
  - 当前证据：模型、0229/0230/0231 迁移、router 和权限依赖已实现；payload/404 聚焦测试 3 passed；完整 CRUD/403 集成、数据库升级/降级尚未运行，任务保持未勾选。

- [ ] PM-T011-T02 工作台设置页面
  - 目标：将后台工作台设置从占位页替换为真实设置页面。
  - 前置条件：T01 API 契约。
  - 允许修改：`frontend/src/views/performance/WorkbenchSettings.vue`、`frontend/src/router/index.ts`、`frontend/src/api/performance.ts`、对应测试。
  - 共用组件：必须使用 `PerformanceListToolbar`、`PerformanceManagementTable`、`PerformanceSwitch`、`PerformanceConfirmDialog`；不得复制同类组件。
  - UI：入口列表、公告列表、开关、搜索、筛选、分页、编辑/新建/删除/启停、采集参数驱动的新建/编辑共享弹窗、真实周期列表选择、HRBP/实线上级人员范围选择、加载/空/错误状态。
  - 测试：组件渲染、API 调用、搜索、筛选、表单校验、开关失败恢复、删除确认和路由接入。
  - 当前证据：`WorkbenchSettings.spec.ts`、`WorkbenchSettingEditor.spec.ts` 与 `PerformanceAdminLayout.spec.ts` 共 15 passed；新增页面已接入真实路由；UI 实现门禁 blocked，像素验收未运行。
  - 本轮补充：`/performance/workbench/announcements` 已接入前台工作台，公告开关、active 状态、周期和 HRBP/实线上级可见范围由服务端消费接口过滤；`Workbench.spec.ts` 增加真实公告响应、开关关闭和当前周期参数测试。

- [ ] PM-T011-T03 验收与规格更新
  - 目标：执行聚焦测试、类型检查、构建并记录真实结果。
  - 前置条件：T01-T02。
  - 已运行：后端聚焦 3 passed；前端工作台页面/弹窗聚焦 6 passed，后台布局回归 9 passed；Alembic history 指向 `0230_workbench_announcement_ack`。
  - 阻塞：全量 build 被未修改的 HRBP 测试类型错误阻断；完整 API/数据库/浏览器验收未运行；UI 门禁 blocked。
  - 未运行项：完整目标截图、hover/弹窗采集和像素 diff 标记 blocked。

## 完成定义

代码、迁移、权限、测试和 API→数据库→重开证据完成后，由主智能体复核并勾选；未完成项不得宣称生产可用。
