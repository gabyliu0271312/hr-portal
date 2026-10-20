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

- [x] CR-005-T03 指定天数补采还原
  - 类型：frontend/UI；前置T02；用户2026-10-20授权根据补采JSON开发，蓝图为 ui-interaction.md 天数多选补采v2；Spec012 N000/N00通用合规，不更改数仓任务。
  - 必读：Spec002基线/ADR-001、本目录spec/ui-interaction、Spec012 START_HERE/UI/guardrails/A01/A02/A05/N000/N00。
  - 允许：frontend/src/components/performance/PerformanceSearchSelect.vue/.spec.ts、PerformanceTodoNotificationDialog.vue/.spec.ts；本目录现有文档及T03独立PNG。共享组件串行局部修改，默认行为兼容；不新增业务组件或依赖。
  - 禁止：后端、DTO、迁移、权限、路由、其他通知、PM-T007及其未提交变更；不改时间/周模式或触发发送；不主动部署。
  - 输入输出：既有规则草稿；常用选项1..100加已存范围外值；整行多选/反选、右侧对勾、已选标签删除；事件及PATCH结构不变。
  - UI：/performance/settings/system/notifications，指定模式首个下拉；240px滚动视口、32px选项步长、沿用token；选中后保持展开。超宽标签未采实，保留现有换行。独立PNG：../../ui-blueprints/CR-005-T03-implemented-todo-days-selected.png。
  - Given 首次或旧值打开；When 滚动至100、选多项/再次点击/删除标签/关闭重开/取消；Then 选项完整、草稿同步且不提前保存、旧值不丢。默认下拉与星期回归不变。
  - 测试：在既有PerformanceTodoNotificationDialog.spec.ts内覆盖SearchSelect变体与默认行为，并回归通知相关组件/页面spec；npm run build；实际Vite浏览器+API fixture，读取实际截图。后端/迁移测试不适用（无改动），真实DB登录E2E仍归T01，不以fixture冒充。
  - 完成定义：开发、组件回归、构建、浏览器、截图与证据均通过后主会话勾选；失败/未跑如实记录。
  - 2026-10-20 证据：`npm --prefix hr-portal/frontend test -- src/components/performance/PerformanceTodoNotificationDialog.spec.ts src/components/performance/PerformanceTimeField.spec.ts src/components/performance/performanceTodoNotificationRule.spec.ts src/components/performance/PerformanceNumberInput.spec.ts src/components/performance/PerformanceAudienceRuleEditor.spec.ts src/components/performance/PerformanceCalibrationConditionGroup.spec.ts src/components/performance/PerformanceNotificationSettingsCard.spec.ts src/components/performance/PerformanceNotificationMethodsCard.spec.ts src/components/performance/PerformanceNotificationDisableConfirm.spec.ts src/views/performance/NotificationSettings.spec.ts src/views/performance/CycleManagement.spec.ts` → 11 files / 84 passed；`npm --prefix hr-portal/frontend run build` → vue-tsc + vite通过（50.56s，仅现有@vueuse PURE警告）。首次新增测试的嵌套挂载点击失败，改为受控SearchSelect测试后复跑全部通过；真实弹窗状态同步由浏览器另验。
  - 真实Vite 5175 + Playwright + 隔离API fixture验证：1..100共100项，视口240px/行32px/总高3200px，scrollTop2960到100，右勾/标签/反选/删除/重开/取消不PATCH/确认仅todo_task_rule/刷新回显、旧0/150/365保留、周模式仍默认方框、390px页面不横溢；无pageerror。当前桌面浮层宽172.66px随字段宽度，未强锁源165px；未复制源虚拟列表内部实现。
  - 已生成并读取真实截图：../../ui-blueprints/CR-005-T03-implemented-todo-days-{selected,bottom,mobile}.png。未创建独立脚本或测试文档，未改后端/DB/权限/PM-T007；未部署本次更新，未提交推送；T01真实登录DB端到端仍未完成。

- [x] CR-005-T04 日期类型修正
  - 输入：用户2026-10-20明确第二个下拉为自然日/工作日，浮层与勾选样式沿用第一处；保留原单选契约，不推断为两个日期类型并存。
  - 必读：本目录spec/UI，Spec002基线/ADR-001、Spec012 UI/guardrails/A01/A02/A05/N000/N00。
  - 允许：PerformanceSearchSelect.vue、PerformanceTodoNotificationDialog.vue/.spec.ts、performanceTodoNotificationRule.ts/.spec.ts，api/performance.ts中通知DTO局部修改；backend/app/performance/notification_settings_router.py及tests/test_performance_notification_settings.py；本目录文档和T04独立PNG。共享文件串行局部编辑，保护角色配置等已有改动。
  - 契约：day_kind=calendar_day或working_day，默认calendar_day；JSONB已有字段兼容，无迁移；PATCH完整规则、审计/权限不变。仅保存日期类型，不计算工作日或发送。日/周模式无新增控件，原摘要不变。
  - UI：指定模式第二下拉，复用SearchSelect opt-in右勾；自然日/工作日单选，选中后关闭；相同行高、浮层皮肤和主题token，2项自适应高度；路由/角色不变。截图 ../../ui-blueprints/CR-005-T04-implemented-todo-day-kind.png。
  - Given旧calendar_day或新working_day；When切换/取消/确认/刷新重开；Then不提前写、准确提交回显与摘要；非法day_kind拒绝，旧默认兼容，第一多选/其他默认下拉不回退。
  - 验证：现有通知前端spec、后端通知pytest、npm run build、真实Vue浏览器+隔离API fixture和截图。真实登录DB E2E仍归T01，不主动部署；完成证据齐全后勾选。
  - 2026-10-20证据：`python -m pytest tests/test_performance_notification_settings.py -q` →24 passed /1 python_multipart警告；含两日期类型PATCH/GET、非法字符串/数组/null的422且不写、单改day_kind审计、同值幂等、旧开关不覆盖工作日。`npm --prefix hr-portal/frontend test -- src/components/performance/PerformanceTodoNotificationDialog.spec.ts src/components/performance/performanceTodoNotificationRule.spec.ts src/components/performance/PerformanceNotificationSettingsCard.spec.ts src/views/performance/NotificationSettings.spec.ts src/components/performance/PerformanceAudienceRuleEditor.spec.ts src/components/performance/PerformanceCalibrationConditionGroup.spec.ts` →6 files /55 passed；`npm --prefix hr-portal/frontend run build` →vue-tsc+vite通过（52.71s，仅现有@vueuse PURE警告）。
  - 实际Vite5175+Playwright+隔离API fixture：第二下拉只读、两项单选、唯一右勾、32px行/64px浮层/z-index2201；取消不PATCH；失败保留工作日草稿和旧摘要；重试仅PATCH todo_task_rule、刷新重开显示工作日；第一多选不变，390px无页面横向溢出，无pageerror。已生成并读取T04桌面与mobile两个独立PNG，未接真实登录DB。
  - 无新迁移或回填，不改已应用0261；未部署、未commit/push。部署需先后端支持working_day再更新前端；若已保存working_day，回滚旧后端会因旧响应DTO不识别枚举而失败，需兼容该值后再回滚。外部调度/工作日日历/真实通知仍未实现；其他会话角色配置和授权文案改动未覆盖。

- [x] CR-005-T05 时间浮层补采还原
  - 用户2026-10-20提供通知时间-浮层滚动与滚动条.json并要求完成开发；依赖T02，引用ui-interaction.md时间补采v4及Spec012 N000/N00通用检查。
  - 允许：PerformanceTimeField.vue/.spec.ts、styles/tokens.css局部新增语义token、本目录现有文档和T05独立PNG；不覆盖其他会话改动。禁止后端/DTO/迁移/权限/路由/其他业务/部署。
  - 契约：纯HH:mm不变；小时00..23、分钟00/30，保留旧配置非半点分钟；滚动不改变值，点击项仅更新编辑草稿，浮层保持展开（源点击行为未采实的本地约定）；外部点击/Esc关闭，禁用不可编辑。
  - UI：双70px列、240px视口、32px步长/30px行本体/208px尾白；8px原生滚动条、透明轨道、圆角滑块，悬停与键盘焦点可见、可拖动；复用Element Plus浮层/输入框，不重写定位/外部点击基础设施，无新依赖；源选中伪元素未采实，用本系统token标记选中。
  - 验证：TimeField和通知相关既有spec，npm run build；真实Vue+隔离API fixture验证两列滚轮/拖条/点击/重开/取消/失败/保存回显、Esc与窄屏；独立PNG ../../ui-blueprints/CR-005-T05-implemented-time-{panel,scrollbar,mobile}.png。后端和迁移测试不适用（无改动），真实登录DB仍归T01。
  - 完成定义：代码、测试、构建、实际浏览器、读取截图和证据齐全后勾选；未跑/失败如实记录。
  - 2026-10-20已验证：`npm --prefix hr-portal/frontend test -- src/components/performance/PerformanceTimeField.spec.ts src/components/performance/PerformanceTodoNotificationDialog.spec.ts src/components/performance/performanceTodoNotificationRule.spec.ts src/components/performance/PerformanceNotificationSettingsCard.spec.ts src/views/performance/NotificationSettings.spec.ts` →5 files /44 passed。首次对子组件setProps的测试写法报错已修正并复跑通过；最终`npm --prefix hr-portal/frontend run build` →vue-tsc+vite通过（1m3s，仅现有@vueuse PURE注释移除警告）；本次指定文件diff --check通过。
  - 真实Vite5175+隔离API fixture：两列70×240、30px行/32px步长/208px尾白，总高976/272、初始scrollTop320/0；独立滚轮736/32不改时间；可见Chromium中8px原生滑块拖动从736到0，值不变。headless覆盖式滚动条未命中，拖动通过结论仅来自可见浏览器。点击、键盘、Tab循环、Esc分层关闭、外部关闭、取消不PATCH、失败保留09:30/重试/fixture刷新回显、三态共用、旧09:05不取整、390px无页面横溢通过，无pageerror。T05三张实际PNG已生成并读取；外框142×246（源142×245.33，未强锁缩放小数边框）。未真实登录DB、未发送、未部署/提交/推送，保护其他会话改动。

- [ ] CR-005-T06 日报通知整体复用
  - 类型：frontend/API/migration；输入为用户2026-10-20要求及spec v2、UI v5；复用现有弹窗不复制正文，标题为编辑绩效进度日报通知。
  - 必读：Spec002基线/ADR-001、本目录spec/UI、Spec012 A01/A02/A05/N000/N00/U00与UI/guardrails/testing；无UCP。
  - 允许：PerformanceTodoNotificationDialog.vue/.spec.ts、PerformanceNotificationSettingsCard.vue/.spec.ts、performanceTodoNotificationRule.ts/.spec.ts、NotificationSettings.vue/.spec.ts；api/performance.ts通知段；notification_settings_router.py、test_performance_notification_settings.py、models.py仅PerformanceNotificationSetting；新增经协调的下一线性日报迁移；现有CR005文档与T06独立PNG。
  - 共享文件只串行局部修改，保护PM-T003/PM-T007/角色/项目与其他会话；禁止改既有迁移、权限、路由、第三方、周期/项目/任务服务、token、调度/发送；不主动部署/提交/推送。
  - 契约：progress_daily_rule独立JSONB，复用规则校验，默认daily/1/18:00/person/不屏蔽，其他字段同待办默认；GET/PATCH同接口、配置权限、200/403/422、完整替换/原子事务/审计。规则与开关及兄弟规则不相互覆盖；空设置GET不写，旧行迁移后默认一致。
  - UI：沿用680px三态和下拉/时间/错误/忙碌/焦点/窄屏行为，同一实例按目标传标题及规则；日报可编辑、环节启动仍禁用、无U不显示。独立PNG ../../ui-blueprints/CR-005-T06-implemented-progress-daily-{dialog,mobile}.png；关联N01通用合规。
  - Given旧设置/已保存两种独立规则；When打开日报、切换三态、取消、保存失败/重试、刷新重开、改待办/开关；Then仅日报规则按需变化，失败保留草稿和摘要，旧待办不受影响。
  - 测试：现有通知后端pytest、前端通知5spec、npm run build；隔离PostgreSQL事务Schema升/降/旧行/回读/回滚；真实Vue+API fixture浏览器走查及截图。真实登录DB链路另记未跑，不冒充通过。
  - 2026-10-20证据：后端`python -m pytest tests/test_performance_notification_settings.py -q` →42 passed、1 python_multipart弃用警告；前端通知5spec（TimeField/Dialog/rule/card/page）→49 passed。首次两轮卡片兄弟DOM不变断言未考虑新增可编辑按钮的saving禁用属性，修正比较并显式验证禁用/恢复后49项通过；未删除状态断言。
  - 实际Vite5175+Playwright+隔离API fixture：日报标题/默认18:00、三态共用、星期右勾多选、时间双列、取消无PATCH、失败保留草稿与旧摘要、重试仅PATCH progress_daily_rule、刷新回显、待办10:00未改、390px无页面横溢通过，无pageerror。两张T06独立PNG已生成并读取；真实登录DB未跑。
  - 构建：首次失败于其他会话OtherSettings.spec.ts的176/177/185行类型错误；所属会话修复后，本会话复跑`npm --prefix hr-portal/frontend run build`（vue-tsc+Vite）退出0，仅现有@vueuse PURE注释警告，未修改其测试。
  - 迁移：确认0265实际落盘与唯一head后新增0266_performance_progress_daily_rule，down_revision=0265_performance_reviewer_360_tags；`python -m alembic heads`唯一0266。APP_ENV=dev的本机backend容器内执行0266真实upgrade/downgrade：隔离事务Schema旧行默认18:00、新行默认、JSONB写入回读、待办规则不变、降级保留两行、再升级均通过；最终回滚并核验隔离Schema不存在，未迁移public。后端通知再跑42 passed/1警告，指定文件diff --check通过。
  - 未完成：真实登录UI→API→DB→重开端到端仍未验收，T06保持未勾选；代码、前端构建、API测试、UI fixture及隔离迁移已就绪，不等同共享发布已就绪。0265所属会话模型/router尚待合入；须由统一部署窗口确认全部改动就绪、先补实际库0266再重启应用，禁止缺列启动。未部署、提交、推送或发送。完成定义：真实持久化链路验收补齐后主会话勾选，不以fixture替代。

- [x] CR-005-N01 UI 合规与回归
  - 类型：acceptance；关联 Spec 012 N00/N000 通用规则，不更改该数仓 Spec 的领域任务状态。
  - 允许：本目录文档及 CR-005 独立 PNG。
  - 校验：复用壳/单选/下拉/数字/按钮；无新主色；10px 用 spacing-25；浮层高于弹窗；错误定位字段；窄屏不溢出；来源选项与暂定选项区分；无凭证/UCP/发送副作用。
  - 2026-10-20 证据：主会话已读取五张实际UI截图，修正纯时间宽度300px/右侧时钟与2201浮层；修正选择后残留必填错误。布局复用统一壳，新增2个语义token；未改全局主色/路由/权限/UCP/PM-T007。39项聚焦测试、构建及真实前端+模拟API浏览器走查通过。403加载、Portal无U按钮隐藏在组件测试覆盖；生产与实际DB未验收，不属于本次UI通过结论。
