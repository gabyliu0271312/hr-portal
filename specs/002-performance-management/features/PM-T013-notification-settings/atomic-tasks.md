# PM-T013 原子任务

状态规则：代码和聚焦测试完成后可记录实现证据；由于采集证据不完整，本功能 `pixel_restore_status` 保持 blocked，主智能体不得宣称像素级完成。

- [ ] PM-T013-T01 后端通知设置契约与持久化
  - 目标：新增通知设置单例模型、迁移、GET/PATCH API、权限和审计。
  - 前置条件：PM-T002 后台入口；本功能 API 契约已冻结。
  - 必读：`spec.md`、`api-contract.md`、`data-model.md`、`execution-contract.md`、`migration-coordination.md`。
  - 允许修改：`backend/app/performance/models.py`、新建通知设置 router、`backend/app/main.py`、新建 0237 迁移、后端测试、规格文件。
  - 禁止修改：已有迁移、其他设置 API、通知发送服务和周期快照逻辑。
  - 测试：默认读取、PATCH 持久化、未知字段拒绝、权限 403、审计事件。
  - 已实现证据：`notification_settings_router.py`、`PerformanceNotificationSetting`、`0237_performance_notification_settings.py`；单元/API 测试 5 passed；迁移已执行 upgrade→downgrade→upgrade，最终回到 0237 head。
  - 未完成：真实 API/403 集成测试未运行；`--postgres-acceptance` 因当前环境无法解析 PostgreSQL 主机而阻塞。

- [ ] PM-T013-T02 通知设置页面与 API 客户端
  - 目标：将通知设置占位页替换为采集默认态页面，并支持邮件即时保存。
  - 前置条件：PM-T013-T01 API 契约；`PerformanceCheckbox` 已存在。
  - 必读：`ui-interaction.md`、`component-model.md`、`extracted-ui-contract.json`、`acceptance-contract.md`。
  - 允许修改：`frontend/src/views/performance/NotificationSettings.vue`、新建 `frontend/src/components/performance/PerformanceNotificationMethodsCard.vue`、`frontend/src/api/performance.ts`、路由当前通知设置条目及前端测试。
  - 禁止修改：共享 checkbox 默认视觉、通知发送链路、其他系统设置页面。
  - 测试：结构、默认态、API 调用、保存失败回滚、加载错误和路由组件接入。
  - 已实现证据：`NotificationSettings.vue`、`PerformanceNotificationMethodsCard.vue`、`performance.ts`；前端聚焦测试 6 passed；全量 `vue-tsc --noEmit` 和 `npm run build` 通过。
  - 采集/像素门禁：`completion_status=incomplete`、`pixel_restore_status=blocked`；目标截图和 source state ID 缺失。

- [ ] PM-T013-T03 聚焦验收与规格更新
  - 目标：运行后端/前端聚焦测试、类型检查，并记录真实结果。
  - 前置条件：T01、T02。
  - 已运行：后端通知设置 3 passed；前端通知设置 2 个 spec 共 6 passed；`vue-tsc --noEmit` 通过；`npm run build` 通过；迁移 upgrade/downgrade/upgrade 通过。
  - 未运行项：真实数据库 API/403 验收因 PostgreSQL 主机不可解析而阻塞；浏览器截图、rendered contract、pixel diff 未运行。

- [ ] PM-T013-T04 采集通知设置策略容器 P0/P1 结构实现
  - 目标：根据浏览器采集结果补充第二张通知设置卡片，覆盖两组通知策略单选项、三项其他通知开关及摘要卡片。
  - 前置条件：PM-T013-T02；浏览器采集 JSON/HTML 已恢复并核验，但其采集完整性仍被阻塞。
  - 必读：`spec.md`、`ui-interaction.md`、`component-model.md`、`pixel-contract.md`、`acceptance-contract.md`、`D:\乐逗\Desktop\pm-t013-browser-2026-09-23T07-01-19-124Z.json`、对应 `-default.html`。
  - 允许修改：`frontend/src/views/performance/NotificationSettings.vue`、`frontend/src/components/performance/PerformanceNotificationSettingsCard.vue`、`PerformanceNotificationRadioSection.vue`、`PerformanceNotificationRuleSummary.vue`、对应组件测试、PM-T013 规格投影文件。
  - 禁止修改：后端通知设置 API/迁移、邮件通知持久化契约、共享 checkbox/radio 默认视觉、通知发送链路。
  - UI 要求：浏览器脚本的 default / focus-1~3 仅作线索，尚未映射采集器认可的 source_state_id；待截图、交互证据及策略持久化契约确定后，保留采集文案、选中状态和摘要顺序，不猜测编辑弹窗。
  - 测试：组件结构、文案、4 个 radio、3 个 checkbox、3 个编辑按钮、默认状态、disabled 状态和 edit 事件；页面回归测试；类型检查和构建。
  - 验收：必须真实 API 读取、保存并重开；控件不可仅本地切换而误导用户。目标截图、rendered contract 与门禁均通过后方可勾选。
  - 状态：业务读写交互已由 T05/T06 接入，像素/UI 正式验收仍未开始；组件 `PerformanceNotificationSettingsCard.vue`、`PerformanceNotificationRadioSection.vue`、`PerformanceNotificationRuleSummary.vue`，两组单选与三项复选最初仅可试选，现已由 PM-T013-T05/T06 扩展为保存交互，编辑按钮 disabled。当前前端聚焦测试 14 passed，覆盖保存载荷、失败回滚、重开读取、保存中阻止重复请求和 403 隐藏；`vue-tsc --noEmit` 通过，Docker 前端构建并替换成功。仍不得把业务持久化测试等同 P2/像素验收。
  - 阻塞：目标 PNG、完整动作证据、完整采集产物、正式 UI 门禁与像素重开对比。

- [ ] PM-T013-T05 通知策略存储与 API 扩展
  - 目标：五项开关/模式与现有邮件设置共用单例表、权限和审计；GET 返回安全默认值，PATCH 只更新传入字段。
  - 前置条件：PM-T013-T01 的通知设置 API；当前唯一 Alembic head `0240_performance_organization_levels`。
  - 必读：`api-contract.md`、`data-model.md`、迁移协调说明。
  - 允许修改：新建 0241 迁移、`backend/app/performance/models.py`、`notification_settings_router.py`、对应后端测试与 PM-T013 规格。
  - 禁止修改：0237 等已有迁移、其他系统设置 API、通知发送链路、周期快照。
  - 测试：枚举/未知字段 422、缺权限 403、默认 GET、独立字段 PATCH、其他值保留、审计前后状态、重新读取；唯一 head 和数据库 upgrade 验证。
  - 完成定义：数据库升级后老数据有默认值，PATCH 可保存且 GET/重开一致，失败回滚；此任务不代表通知实际投递已实现。
  - 已验证：唯一 head 0241、Docker PostgreSQL upgrade 至 0241、既有单例行五项默认值均正确；后端通知设置 5 passed，连同相邻设置回归共 13 passed；真实 PostgreSQL 隔离事务执行 PATCH→新 session GET→审计前后态核验，再回滚，既有单例配置保持不变。容器内授权 GET 返回 7 字段、非法枚举 422、无认证 HTTP 401；授权 TestClient HTTP PATCH→新 HTTP GET 连接真实 PostgreSQL 的回滚事务通过，退出后原配置不变；upgrade 到 0241 已验证；在 PostgreSQL 临时表副本上验证 0241 downgrade→upgrade，生产单例数据未触及。T01 前置任务尚未勾选，T05 暂不勾选。

- [ ] PM-T013-T06 通知策略前端即时保存
  - 目标：第二卡片从 GET 响应加载，切换单选或复选后 PATCH、失败回滚、成功反馈；编辑摘要按钮仍不可用。
  - 前置条件：PM-T013-T05 策略 API 已冻结；PM-T013-T02 通知方式页面已存在。
  - 必读：`api-contract.md`、`ui-interaction.md`、`component-model.md`、`acceptance-contract.md` 和采集 readiness。
  - 允许修改：`frontend/src/api/performance.ts`、`frontend/src/views/performance/NotificationSettings.vue`、`frontend/src/components/performance/PerformanceNotificationSettingsCard.vue`、`PerformanceNotificationRadioSection.vue`、`PerformanceNotificationRuleSummary.vue`、聚焦测试与 PM-T013 规格。
  - 禁止修改：共享单选/复选视觉、其他页面、通知发送链路。
  - 测试：五项独立载荷、阻止并发重复提交、失败恢复、重开读取、403 隐藏、前端类型检查/构建。
  - 验收：页面不得再写“不保存”；但未采集的编辑界面与像素验收仍阻塞，正式 UI 门禁失败前不得勾选 PM-T013-T04 或宣称 P2。
  - 已验证：前端聚焦测试 14 passed（通知卡 3、页面 9、原通知方式 2）；`vue-tsc --noEmit` 通过；Docker frontend build/recreate 后运行容器的通知设置 JS 已包含自动保存文案并返回 HTTP 200。完整浏览器交互截图和像素 diff 未运行；T02/T05 前置任务及采集门禁未通过，T06 暂不勾选。

- [ ] PM-T013-T07 策略交互稳定与关闭通知确认
  - 目标：两组单选切换时保存状态不闪动；三项复选彼此独立、不随其他选项保存进入禁用态；关闭通知有确认框，保存关闭后只隐藏该项灰色摘要与编辑按钮。
  - 前置条件：PM-T013-T06 已接入策略持久化。
  - 必读：`spec.md`、`ui-interaction.md`、`acceptance-contract.md`、用户提供的 894×631 SnapSpec 弹窗参数。
  - 允许修改：通知设置页面、通知设置卡/单选区/通知摘要、`PerformanceNotificationDisableConfirm.vue`、对应测试及 PM-T013 规格投影。
  - 禁止修改：共享 `PerformanceRadioGroup` 默认视觉、后端权限和迁移、通知发送链路。
  - 测试：切换时同一单选节点保持焦点、忙碌期间阻止重复操作；下方两向切换时兄弟行 DOM、input checked/class 和提示文案稳定；关闭成功后仅本项摘要和按钮隐藏，保留/失败/请求中不隐藏，重新开启后恢复；取消勾选打开弹窗但无 PATCH，保留无 PATCH，确定 PATCH false，失败回滚并保留弹窗、重试成功、提交中按钮不可重复点击。
  - 验收：Docker 构建后运行页面行为可复核；缺少同状态完整截图和 source_state_id，仍不得勾选像素验收或宣称 P2。
  - 已验证：通知设置 4 个前端 spec 共 25 passed，覆盖三项关闭后各自摘要/编辑按钮消失、保留/保存中/失败保持、重新勾选恢复、兄弟选项 DOM 不变及确认框完整行为；`vue-tsc --noEmit` 通过。Docker 前端镜像 `6c49a53579a2` 构建并替换成功，通知页与 JS 资源 HTTP 200。真实浏览器截图与像素 diff 未运行，任务保持未勾选。
