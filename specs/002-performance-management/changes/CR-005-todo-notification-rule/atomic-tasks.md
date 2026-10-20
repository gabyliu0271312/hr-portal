# CR-005 原子任务

## 执行契约

前置：2026-10-20 用户明确要求基于已采集参数及拆解开发，缺失部分暂不像素还原；spec.md v1 冻结配置保存契约，不执行调度/发送。必读 Spec 002 START_HERE/baseline、ADR-001，Spec 012 START_HERE/UI/guardrails/A01/A02/A05/N00 及本目录 spec/ui-interaction。共享 models.py、api/performance.ts、tokens.css 仅串行局部追加；不得覆盖 PM-T003/PM-T007 改动。禁止修改权限注册、main.py、现有迁移、周期/项目/任务服务。

- [ ] CR-005-T01 规则持久化与接口
  - 类型：backend/API/migration；输入输出：spec.md v1，todo_task_rule 完整原子替换，其他字段不变。
  - 允许：backend/app/performance/notification_settings_router.py、models.py 中 PerformanceNotificationSetting；新增 backend/alembic/versions/0261_performance_todo_notification_rule.py；更新 backend/tests/test_performance_notification_settings.py。
  - 权限：沿用 performance.configuration.manage，403 拒绝；422 校验；事务/行锁/审计沿用现有服务。
  - Given 旧数据或空设置；When GET、规则 PATCH、旧开关 PATCH；Then 默认一致、重开保留、兄弟字段不变、重复无新审计、非法输入不写。
  - 命令：python -m pytest tests/test_performance_notification_settings.py；alembic heads；可用隔离数据库时 upgrade/downgrade 验证。
  - 2026-10-20 证据：主会话复跑 `python -m pytest tests/test_performance_notification_settings.py` → 19 passed，1 个 python_multipart 弃用警告；`python -m alembic heads` → 唯一 0261_performance_todo_notification_rule，down_revision=0260_performance_other_settings。已审阅 DTO、JSONB、PATCH 行锁/事务与审计差异。
  - 容器部署补验：本机 desktop-linux / APP_ENV=dev 中已验证隔离事务 Schema 的 PostgreSQL upgrade、旧行默认值、JSONB 写入回读、downgrade 保留行、重新 upgrade，最后整体回滚隔离 Schema。首次发现 JSON 默认值使用 sa.text 时冒号被识别为绑定参数，已在尚未应用的0261中改为字符串 server_default，复验通过。随后本机运行库0260→0261升级成功，frontend/backend镜像在Docker内构建并替换；健康接口200且DB正常、nginx -t通过、容器内19项测试通过（2个依赖弃用警告）；已部署前端资源与OpenAPI含todo_task_rule，匿名API401。
  - 未完成：登录用户通过真实UI→API→数据库→重开完整端到端验证；本任务保持未勾选。仅本机开发容器部署，未操作远程生产环境。

- [x] CR-005-T02 三态弹窗与页面接入
  - 类型：frontend；依赖 T01 契约，蓝图为 ui-interaction.md v1（用户本轮继续开发指令确认已有截图/拆解，缺失选项仅基础实现）。
  - 允许：frontend/src/components/performance/PerformanceTodoNotificationDialog.vue、PerformanceTimeField.vue、performanceTodoNotificationRule.ts 及同名 spec.ts；PerformanceNumberInput.vue/.spec.ts；PerformanceFormItem.vue；PerformanceNotificationRuleSummary.vue；PerformanceNotificationSettingsCard.vue/.spec.ts；views/performance/NotificationSettings.vue/.spec.ts；api/performance.ts 通知 DTO；styles/tokens.css 通知 token。
  - 禁止：改第三方库、日期时间组件、其他通知的编辑行为、PM-T007、路由和权限扩大。
  - 输入输出：已保存规则 → 独立草稿 → 当前分支校验 → confirm 事件 → 页面 PATCH；成功更新摘要、失败保留草稿、取消不写。
  - UI：/performance/settings/system/notifications；管理员入口及 U 操作；三态/加载/校验/错误/无权限；680px，自适应宽，token。PNG：ui-blueprints/CR-005-T02-implemented-todo-notification-daily.png（另附 specified/weekly/mobile）。
  - Given 已加载设置；When 编辑、切换、取消、确定、失败重试、刷新；Then 不早写、不串分支、不重复提交、重开一致。
  - 命令：npm test -- 对应通知/时间/数字 spec；npm run build；实际浏览器走查。
  - 2026-10-20 证据：8 个通知/控件 spec 共 39 passed；`npm --prefix hr-portal/frontend run build`（vue-tsc + vite）通过，只有 @vueuse PURE 注释移除警告；实际 Vite 5175 + Playwright 使用 API fixture 走查三态、多选、校验、时间浮层（2201）、失败保留/重试、刷新重开及390px窄屏无页面横向溢出，无 pageerror。保存请求仅含 todo_task_rule，未接真实DB。日态实际宽680px、高454px（含额外未接发送提示），周多选换行时482px。
  - 证据 PNG：../../ui-blueprints/ 下 CR-005-T02-implemented-todo-notification-{daily,specified,weekly,time-picker,mobile}.png（路径实际为 specs/002-performance-management/ui-blueprints/）。代码与API fixture验收完成，数据库联调不在本项通过声明内。

- [x] CR-005-N01 UI 合规与回归
  - 类型：acceptance；关联 Spec 012 N00/N000 通用规则，不更改该数仓 Spec 的领域任务状态。
  - 允许：本目录文档及 CR-005 独立 PNG。
  - 校验：复用壳/单选/下拉/数字/按钮；无新主色；10px 用 spacing-25；浮层高于弹窗；错误定位字段；窄屏不溢出；来源选项与暂定选项区分；无凭证/UCP/发送副作用。
  - 2026-10-20 证据：主会话已读取五张实际UI截图，修正纯时间宽度300px/右侧时钟与2201浮层；修正选择后残留必填错误。布局复用统一壳，新增2个语义token；未改全局主色/路由/权限/UCP/PM-T007。39项聚焦测试、构建及真实前端+模拟API浏览器走查通过。403加载、Portal无U按钮隐藏在组件测试覆盖；生产与实际DB未验收，不属于本次UI通过结论。
