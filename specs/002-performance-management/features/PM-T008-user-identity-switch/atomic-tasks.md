# PM-T008 MVP 原子任务

- 状态：本轮代码实现和本地验证已交付；T01～T07 完成，T08/T09 开发已实现但真实外发/全业务验收待关闭，未冒充整份 MVP 全部验收。
- 日期：2026-10-28。
- 唯一业务依据：[spec.md](spec.md)；交互依据：[ui-interaction.md](ui-interaction.md)。
- 执行依据：用户在明确独立身份管理入口、四列表格和启停按钮后要求“完成开发”，按最新具体布局实施；没有提交/推送/部署/生产操作或真实消息外发。

## 1. MVP 执行规则

1. T01 先关闭业务与跨层契约阻塞；其余任务不得各自假设环境、写入范围、admin 锚点或人员范围。
2. MVP-1 是“开关管理 → 显式授权 → 选择无 Portal 账号员工 → 目标身份授权 → 恢复 → 关闭清权且重开不恢复”的完整闭环；不能把零散接口、占位按钮作为 MVP 完工。
3. 2026-10-28 用户已确认开发与生产均需实际操作，T09 必须纳入 MVP-1，不允许缩为只读。原业务接收方始终禁投；默认仅记录，admin 可开放受控测试投递，每次独立汇总 1 条，样式验证另发样例 1 条。
4. 每次只实施一个已确认任务。共享文件串行修改，T01 固定实际修改清单；超出范围须批准，不因写了任务就自动授权。
5. 每项任务只有代码、适用迁移、UI、测试、验收和证据全部完成后才能勾选。勾选以本文件最新执行证据为准；真实投递与生产不能用本地测试代替。
6. 新增测试文件、UI 蓝图、截图、迁移路径均为计划交付物，当前不存在，不得报告为已执行证据。
7. 生产代码必须通过开发验证、版本推送和受批准的部署链路发布；不得生产现场补丁、擅自降级数据库或删审计。

## 2. 依赖与里程碑

```text
T01 需求确认、接口/身份/事务契约冻结、UI 蓝图确认
  → T02 持久化基础
  → T03 admin 控制与角色授权原子撤销
  → T04 人员候选与受控会话
  → T05 绩效读路径与目标员工授权贯通
  → T06 Portal 管理与角色授权 UI
  → T07 绩效切换与恢复 UI
  → T08 MVP-1 端到端与回归验收

T09 写入与消息隔离：已纳入 MVP-1，在 T08 最终验收前完成；Q07 业务规则已确认，T01 冻结批次/样例/汇总和异步契约。
```

## 3. 任务卡

- [x] **PM-T008-T01 需求澄清、跨层契约冻结与 UI 蓝图确认**
  - 目标/类型：消除开发歧义；规格、契约与设计，不写业务代码。
  - 追踪：FR-01～FR-16；全部 UC/AC；spec Q01～Q07，已确认决定与技术待办分别记录。
  - 前置：用户审阅本需求；读取实际 git status，保留无关变更。
  - 必读：本功能三份文件；Spec 002 启动入口/基线/PM-001/PM-T002；根 AGENTS.md、hr-portal/CLAUDE.md；Spec 012 启动入口、相关 spec/ui-interaction/guardrails、N000/N00；技能 execution-contract、task-card-template、acceptance-evidence、migration-coordination。
  - 允许修改：本功能三份文档；features/README.md 的本功能链接。
  - 允许新增：仅 `specs/002-performance-management/ui-blueprints/PM-T008-user-identity-switch-v1.html` 及 `PM-T008-T01-blueprint-*.png`。不在此任务建业务文件、测试脚本或迁移。
  - 禁止：所有业务代码、生产配置、SSO；不重写既有 PM-001 基线以掩盖冲突。
  - 输入：已确认结论 D01～D08、现有代码、用户对环境/操作/人员范围的决定。
  - 输出：明确批准的 MVP 范围；admin 固定锚点核验；权限码/路由/DTO/错误码/会话与撤权事务/审计 envelope/源与快照边界；所有入口按 operator/effective employee 区分；完整读路径清单；具体允许文件；UI v1 及确认记录。
  - UI：角色页开关、权限矩阵、人员弹窗、身份提示、失效/恢复。蓝图计划路径见上；确认必须写路由、角色、全部状态、覆盖 T06/T07 和版本日期。禁止以 ASCII 或文档描述冒充已确认蓝图。
  - API/DB/权限/外部：仅冻结契约；核实迁移唯一 head 和既有 admin，不执行变更；不联调独立 SSO。
  - Given/When/Then：Given 所有结论和 Q 清单，When 完成逐项确认，Then 每一项要么有用户决定/技术证据，要么明确阻塞且不允许相关编码。
  - 验证：逐项对照 FR→UC→AC→任务；`git diff --check`；不得把文件存在当成用户确认。
  - 验收：Q01/Q02/Q04 有明确决定，Q03/Q05/Q06 的技术处置可执行；UI 显式确认；不扩大业务权限；失败则停在 T01。
  - 证据：确认记录、接口/路径清单、蓝图与独立 PNG、代码位置、迁移 head 输出；当前全部未提供。
  - 当前进度：2026-10-28 已核对唯一迁移 head、本地 admin 唯一主体；已交付 v1 HTML 和 8 张独立 PNG，脚本语法检查通过。
  - 结果：已按用户最新具体布局与“完成开发”指令实施；Q04 沿统一源，Q06 唯一快照/同名 fail-closed；本地证据不能代表生产核验。
  - 完成定义：用户需求、跨层契约和蓝图均冻结后方可勾选；不以本轮文档写成代替完成。

- [x] **PM-T008-T02 新增开关、admin 锚点与切换会话持久化**
  - 目标/类型：持久化设置与受控会话的数据基础；数据库/迁移。
  - 追踪：FR-02/03/04/05/09/13；UC01/02/05/06/08；AC-01/02/05/06/08。
  - 前置：T01 完成；真实唯一 Alembic head；隔离 PostgreSQL 可用。
  - 必读：spec 6.1/6.2/6.4；现有 users/models.py、performance/models.py、seed.py、alembic/env.py；迁移技能契约。
  - 允许修改：`hr-portal/backend/alembic/env.py` 的新模型注册；`hr-portal/backend/app/main.py` 仅必要模型导入，路由注册留 T03。
  - 允许新增：`hr-portal/backend/app/identity_switch/__init__.py`、`models.py`；`hr-portal/backend/alembic/versions/<实际下一编号>_app_identity_switch.py`；`hr-portal/backend/tests/test_app_identity_switch_migration.py`。
  - 禁止：编辑旧迁移、改既有周期/项目快照、批量创建 users、修改密码/业务角色、猜测 admin 锚点；多 heads 停止而非自行合并。
  - 共享：models.py 由本任务创建，后续串行扩展；迁移编号开发时分配，不预占。
  - 输入：冻结数据模型、admin 唯一主体与 schema/default/index/约束。
  - 输出：默认关闭、无显式授权、admin 固定锚点；session hash 唯一、operator FK、应用/时间/撤销字段；不存明文凭证；revision/generation 持久化。
  - UI：无；数据库基础不产生页面，不需本任务 PNG。
  - API/权限/外部：无业务 API；保存固定 admin 不等于自动授予角色；不触达外部。
  - Given/When/Then：Given 空库和已有库，When upgrade，Then 数据与默认值正确且已有用户/快照/审计不变；Given 冲突 admin 锚点或迁移失败，When 安装，Then fail closed/事务回滚；隔离库 downgrade 不破坏旧领域数据。
  - 测试文件/命令（从 backend 执行）：`python -m pytest tests/test_app_identity_switch_migration.py -q`；`python -m alembic heads`；对独立测试库 `python -m alembic upgrade head`、`python -m alembic downgrade <新迁移的down_revision>` 后再 upgrade。
  - 验收：空库/已有库/持久库升级、约束、索引、失败回滚、隔离降级均有证据；无真实 PG 则 blocked，不以 SQLite 替代。
  - 证据：revision/down_revision、SQL 前后对比、实际命令和输出、测试 fixture；生产迁移单独批准。
  - 阻塞/非范围：无唯一 head、无隔离库或锚点冲突即停；不实施控制 API。
  - 完成定义：迁移/模型和全部适用数据库证据完成。

- [x] **PM-T008-T03 admin 控制开关、角色显式授权与原子清权**
  - 目标/类型：管理面能可靠关、清、重开不恢复；后端/权限。
  - 追踪：FR-01～FR-05/11/13；UC01/03/05/06/08；AC-01/03/05/06/08。
  - 前置：T01/T02。
  - 必读：spec 3.3/6.3/6.4；core/deps.py；roles/router.py、roles/schemas.py；seed.py；现有审计服务。
  - 允许修改：`hr-portal/backend/app/seed.py` 的新菜单与超级管理员自动补权例外；`roles/router.py`、`roles/schemas.py` 的切换授权版本保护与管理权限防转授；`app/core/deps.py` 仅 admin 管理菜单的计算/过滤；`app/main.py` 路由注册；T02 models.py 的确认兼容扩展。
  - 允许新增：`hr-portal/backend/app/identity_switch/control_router.py`、`service.py`、`schemas.py`；`hr-portal/backend/tests/test_app_identity_switch_control.py`。
  - 禁止：新增可转授的开关管理权、按超级管理员角色替代 admin、清空其他菜单授权、给任意角色 seed 切换权、删历史审计、部署或补丁生产。
  - 共享：seed/main/roles 串行；新 service/schemas 由 T04 后续串行使用。
  - 输入：固定 admin、expected_revision、generation、request_id、已确认控制 DTO。
  - 输出：GET/PATCH 控制 API，显式角色使用权；关闭同事务清所有相关角色授权、撤非 admin 会话、更新 generation/revision、写审计；admin 使用资格不依赖 RoleMenu。
  - UI：无，本任务只交真实后端；前端管理区由 T06。
  - API/DB/权限/外部：按 spec API；所有角色状态均覆盖；角色编辑旧 payload、跨关闭重开旧 generation 拒绝；一般角色保存保持兼容；无外部调用。
  - Given/When/Then：Given 非 admin 超级管理员，When 调管理接口，Then 403；Given 多角色/会话，When admin 关闭，Then 原子清除且 admin 例外；Given 重开、重启、旧编辑页保存，Then 不恢复；Given 注入 DB/审计故障，Then 全事务回滚。
  - 测试/命令：`python -m pytest tests/test_app_identity_switch_control.py -q`（backend）；PG 两连接并发关闭与授权保存，记录串行化次序。
  - 验收：成功/权限拒绝/冲突/空授权/重复关闭/幂等/失败回滚/重启回归；不得仅改前端隐藏或只检查开关。
  - 证据：真实 API 请求响应、RoleMenu/设置/会话 SQL、审计、普通角色权限前后对比；敏感凭证脱敏。
  - 阻塞/非范围：未经冻结不定权限码；不做 UI、业务写入和 SSO。
  - 完成定义：控制面与角色保存全部 allow/deny、竞态和恢复防护验证通过。

- [x] **PM-T008-T04 员工候选查询与受控切换会话生命周期**
  - 目标/类型：无需目标 Portal 账号即可建立/验证/退出切换会话；后端/API。
  - 追踪：FR-03/05/06/07/09/11/13/14；UC02/03/06/07/08/09；AC-02/03/06/07/08/09。
  - 前置：T01～T03；人员范围、模式和环境已确认。
  - 必读：spec 6；员工名单查询与既有选人源；core/deps.py；身份映射/周期快照服务；API 分页约定。
  - 允许修改：identity_switch/service.py、schemas.py；`hr-portal/backend/app/main.py` 仅路由注册；T02 models.py 必要扩展须沿迁移规则审批。
  - 允许新增：`hr-portal/backend/app/identity_switch/performance_router.py`、`context.py`；`hr-portal/backend/tests/test_app_identity_switch_control.py`。
  - 禁止：新增测试员工表、复制花名册、复用密码登录代替会话、前端自由指定 operator/mode、明文存会话密钥、跨应用嵌套切换或批量造 users。
  - 共享：T03 文件串行；原始 Portal 认证保持不变。
  - 输入：原始 Bearer、可信员工源、合法 employee_no、generation、幂等键。
  - 输出：capability、分页/搜索候选、会话创建/读取/退出；返回 opaque 凭证，库内仅 hash；默认有效期按 T01；会话绑定 operator/app；恢复幂等。
  - UI：无；T07 消费 DTO。
  - API/DB/权限/外部：原始操作者最新权限校验；admin 跳过公共开关和 generation；非 admin 即时撤权；来源故障拒绝，不回退管理员；外部 SSO 不涉及。
  - Given/When/Then：Given 无 Portal 用户的员工，When 合法操作者选择，Then 可创建可信员工会话；Given 伪造凭证/其他 operator/其他 app/过期/撤销，Then 拒绝；Given 同请求重试，Then 按冻结幂等规则处理且不泄露已存凭证；Given 已离职/重名/无任务，Then 遵守人员范围与空态规则。
  - 测试/命令：`python -m pytest tests/test_app_identity_switch_control.py -q`（backend）；双进程读取同一设置/撤销会话，不能仅内存测试。
  - 验收：资格拒绝、到期、退出、密钥重放、分页计数、信息最小化、并发关闭/创建；日志无凭证。
  - 证据：真实 HTTP API、session hash 与审计 SQL、不同进程验证、敏感字段检查。
  - 阻塞/非范围：名单或模式未确认停；本任务不修改目标业务 API，不宣称权限等价完成。
  - 完成定义：会话完整生命周期、来源故障和跨应用隔离证据完成。

- [x] **PM-T008-T05 绩效读路径按目标员工贯通授权且不改快照**
  - 目标/类型：让切换真正改变业务访问身份而非只改姓名；后端/授权适配。
  - 追踪：FR-07/08/09/11/12/14；UC04/09/10/11/12；AC-04/09/10/11/12。
  - 前置：T01/T04；T01 已冻结需覆盖的全部读路径及精确文件清单。
  - 必读：auth_context.py、snapshot_service.py、authorization_service.py、feature_authorization.py、projects_router.py、cycles_router.py、review_router.py、subject_visibility_router.py；相关测试；不得只看菜单。
  - 允许修改：`hr-portal/backend/app/performance/auth_context.py`、`projects_router.py`；`hr-portal/backend/app/identity_switch/context.py`；其他上述绩效读接口仅限 T01 已确认清单中的员工条件、访问上下文、字段与范围判断。
  - 允许新增：`hr-portal/backend/tests/test_app_identity_switch_control.py`；现有 test_performance_auth_context.py、test_performance_object_authorization.py 增补切换回归。
  - 禁止：改写已锁定快照的 portal_user_id、关系/分数/任务，复制授权引擎，借 display_name/subject_id 猜目标，启用 dev admin preview，绕过数据范围，跨 feature 修评分/发布规则。
  - 共享：auth_context / projects_router 为高冲突文件，禁止与其他绩效任务并行修改；超出清单停止申请。
  - 输入：验证后的 operator + effective employee；已有真实业务快照和任务；正常员工授权基准 fixture。
  - 输出：工作台/任务详情/项目可发现性/成员/进度/矩阵/统计/参考字段/导出等已冻结路径按目标计算；无目标 Portal 用户时仍可定位；正常非切换请求行为不变；READ_ONLY 副作用服务端拒绝。
  - UI：无新布局；返回的导航/按钮权限必须供 T07 按目标展示，不能借原操作者 menus 放行。
  - API/DB/权限/外部：保留对象校验和状态规则；只读数据库边界；导出查询、计数、执行、下载均检查；仅必要的切换审计写入，不发消息。
  - Given/When/Then：Given 甲为乙上级、不为丙上级且无 Portal 账号，When 切换甲，Then 乙任务可见、丙越权拒绝；Given HRBP 组织与不可见人员，Then 列表/total/统计/导出均同范围；Given admin 原始有全量权限，Then 不泄漏；Given 历史快照，Then 前后数据一致。
  - 测试/命令：`python -m pytest tests/test_app_identity_switch_control.py tests/test_performance_auth_context.py tests/test_performance_object_authorization.py -q`（backend）；真实 API 用同 fixture 比较授权结果集合，不依赖被测响应自行生成期望值。
  - 验收：不使用“员工姓名相同”证明身份；所有宣称覆盖的路径 allow/deny；同名项目管理员风险未关闭则 blocked；来源故障和缺任务不回退 admin。
  - 证据：读路径审计清单、前后快照 SQL、目标期望集合与响应/计数对照、只读拒绝日志、审计双身份。
  - 阻塞/非范围：现有身份规则无法唯一判定时记录独立修复卡，不暗改业务；条件写入留 T09。
  - 完成定义：全部已批准读路径与正常请求回归通过，无快照改写，才允许 T07/08 宣称真实身份测试。

- [x] **PM-T008-T06 独立身份管理页与角色使用授权接入**
  - 目标/类型：admin 在权限管理下的独立身份管理页按系统启停，角色配置页仅维护切换使用权；前端/UI。
  - 追踪：FR-01～FR-05/11/13；UC01/03/05/06；AC-01/03/05/06。
  - 前置：T01 UI v1.1 显式确认、T03 真实 API 可用。
  - 必读：ui-interaction.md 2/3/6；现有 Roles.vue、api/roles.ts、PermissionButton.vue、角色字段保存契约；Spec 012 UI 门禁。
  - 允许修改：`hr-portal/frontend/src/views/system/Roles.vue`、`src/api/roles.ts`、`src/router/index.ts` 的新增身份管理路由与固定 admin 守卫；必要的 `src/components/PermissionButton.vue` 仅在 T01 冻结账户级策略支持后修改，不把 admin 资格伪造成角色授权。
  - 允许新增：`hr-portal/frontend/src/api/identitySwitch.ts`、`src/components/system/IdentitySwitchControl.vue`、`IdentitySwitchControl.spec.ts`；`src/views/system/IdentityManagement.spec.ts`、`src/views/system/IdentityManagement.vue`、`src/views/system/IdentityManagement.spec.ts`。
  - 禁止：新建全员账号页、改 Users.vue 批量开户、其他菜单默认全选身份切换、绕过服务端鉴权、保存失败仍显示关闭成功、硬编码 admin 显示名。
  - 共享：Roles.vue/roles.ts 串行；新 identitySwitch.ts 由 T07 继续使用。若现存 JS 镜像参与运行，T01 先确认仓库同步方式，不留遮蔽 TS 的旧逻辑。
  - 输入：后端真实 capability/control、角色 generation 与保存响应。
  - 输出：仅 admin 可进入的身份管理页，表格系统名称/描述/状态/操作，本期仅绩效系统；已停用操作为启用，已启用操作为停用；停用确认清权/撤会话，admin 例外，重启用不恢复。角色页只保留使用权；其他权限原样保持。
  - UI：新增 /system/identity-management，meta.menuCode=system.identity_management，菜单挂 system.auth；现有 /system/roles 路由不改且移除原管理区；字段、状态和文案见 ui-interaction；实现截图独立为 `../../ui-blueprints/PM-T008-T06-implemented-switch-control.png`；不能复用 T07 截图。
  - API/DB/权限/外部：仅消费 T03，不新增存储；按钮同时遵守既有角色操作权限与 admin 专属策略，后端再校验；不触达 SSO。
  - Given/When/Then：Given admin，When 关闭确认，Then API 成功才更新状态和计数；Given 非 admin 超级管理员，Then 看不到管理区且不能靠客户端调用；Given 旧编辑页，Then 冲突提示重载且不开启/恢复旧授权。
  - 测试/命令（frontend）：`npm run test -- src/stores/identitySwitch.spec.ts src/views/system/IdentityManagement.spec.ts src/components/performance/PerformanceIdentitySwitchDialog.spec.ts`；`npm run build`。
  - 验收：正常、加载、空授权、错误、无权、确认取消、409、重开不恢复、刷新回读；桌面及窄屏可用，权限字段文案一致。
  - 证据：组件测试/构建实际输出、UI→payload→SQL→刷新回读、独立 PNG、PC 真实接口走查。
  - 阻塞/非范围：蓝图未确认不能编码；不开发绩效切换弹窗。
  - 完成定义：组件/真实 API/PC/截图/构建全部适用证据完成。

- [x] **PM-T008-T07 绩效右上角人员切换、身份提示与恢复本人**
  - 目标/类型：形成可用的员工切换体验，真实隔离操作者与目标权限；前端/UI。
  - 追踪：FR-06～FR-10/12/14；UC02/04/07/09/11/12；AC-02/04/07/09/11/12。
  - 前置：T01 UI v1.1 显式确认、T04/T05 可用、T06 公用 DTO 已合并。
  - 必读：ui-interaction.md 4～6；PerformanceLayout.vue、PerformanceAdminLayout.vue、PerformancePersonSelect.vue、api/client.ts、api/performance.ts、stores/performanceProjectContext.ts、router/index.ts。
  - 允许修改：`hr-portal/frontend/src/layouts/PerformanceLayout.vue`、`src/api/identitySwitch.ts`、`src/api/client.ts`、`src/api/performance.ts`、`src/stores/performanceProjectContext.ts`、`src/router/index.ts` 中目标上下文必要分支；其他布局仅 T01 许可的入口/隔离逻辑。
  - 允许新增：`src/components/performance/PerformanceIdentitySwitchDialog.vue`、`PerformanceIdentitySwitchDialog.spec.ts`；`src/stores/identitySwitch.ts`、`identitySwitch.spec.ts`；`src/components/performance/PerformanceIdentitySwitchDialog.spec.ts`（均在 frontend）。
  - 禁止：覆盖 userStore 原身份或 Portal localStorage token、凭证写 URL/日志/跨页持久化、让旧数据请求污染新身份、给全部请求附切换凭证、修改员工关系或业务表单规则。
  - 共享：client/router/performance.ts/布局串行修改，先做 diff 冲突检查；不覆盖 PM-T003/其他功能未提交变更。
  - 输入：T04 capability/session/people，T05 目标导航/动作权限；不拿操作者管理权限推导目标可见页。
  - 输出：右上角入口、人员搜索单选、持续身份提示、恢复本人、失效清理；当前页内存会话、刷新恢复本人、多标签隔离；切换后全部相关缓存及旧响应清理。
  - UI：复用现有员工选择方式；计划独立截图 `../../ui-blueprints/PM-T008-T07-implemented-employee-switch.png`；必须含非 admin 状态、admin 开关关闭例外和失效态。
  - API/DB/权限/外部：只向明确允许的 performance 业务请求发送附加凭证；控制请求用 operator；目标越权页面不渲染；Portal 其他应用保持原身份。
  - Given/When/Then：Given admin 关闭公共开关，When 选择无账号甲，Then 目标页面加载；Given A 切甲/B 本人，Then B 不变；Given 撤权/到期/关闭，Then 明确退出并丢弃数据，不静默用 admin 重试；Given 慢请求甲晚于乙返回，Then 不显示甲数据。
  - 测试/命令（frontend）：`npm run test -- src/stores/identitySwitch.spec.ts src/views/system/IdentityManagement.spec.ts src/components/performance/PerformanceIdentitySwitchDialog.spec.ts`；`npm run build`。
  - 验收：加载、无人、重名、无任务、故障、无权、成功、取消、切换失败回本人、到期、恢复、跨应用/标签；后端拒绝不能被前端模拟响应掩盖。
  - 证据：组件测试/构建、PC 多标签真实 API、原始身份/目标身份响应对照、独立 PNG、无敏感凭证检查。
  - 修复记录（2026-10-29，切换后 1 分钟内掉身份）：心跳与业务请求此前把任意失败都当作会话撤销，一次超时/断网/5xx 即清空切换身份且不重试；现改为只有服务端明确 4xx 判定才结束会话，瞬时故障保留会话等下一轮心跳，失效提示改用服务端原因。改动 `PerformanceLayout.vue`、`api/client.ts`、`api/client.js`（运行时优先加载 `.js` 镜像，两份必须同步）。验证：本地接口 403/410/422 判定与连续心跳 200，vitest 5/5；真实页面待重新部署后复验。
  - 修复记录（2026-10-30，绩效前台菜单首次切换抖动）：布局原先以 `employeeSwitchEpoch:route.fullPath` 作为 `router-view` key，绩效评估通过 query 更新节点时会销毁并重建整个 Review 页面；改为仅以 `employeeSwitchEpoch` 为 key，保留身份切换后的整页隔离刷新，同时不因 `node`、`project_id` 等内部 query 导航重挂载。新增 `Review.spec.ts` 回归断言，验证 key 不再依赖 `route.fullPath`。定向前端测试 34/34 通过，`npm.cmd --prefix hr-portal/frontend run build` 通过（仅既有 VueUse Rollup 注释警告）；真实浏览器登录走查因 Docker Desktop 引擎未运行未执行。
  - 修复记录（2026-10-31，410 后重新切换与旧请求竞态）：增加同一会话心跳去重、页面重新获得焦点/可见时立即校验、服务端返回的 expires_at 回写，以及前后端上下文版本隔离；到期清理后不要求刷新即可重新获取切换资格。后端记录不含凭证的会话创建/到期时间诊断日志，补充“旧会话到期后创建新会话”与凭证不入日志回归测试。前端定向测试 23/23 通过，后端身份切换测试 12 通过、1 个本地 PostgreSQL 测试因环境未运行跳过，前端构建通过。
  - 阻塞/非范围：目标导航身份不明或读取路径未贯通则停止；不独立宣称正式 SSO 全员已可用。
  - 完成定义：按目标权限展示、独立会话隔离和恢复完整验证，UI 与真实 API 一致。

- [ ] **PM-T008-T08 MVP-1 真实权限、并发撤权与端到端验收**
  - 目标/类型：完整证明一个可用且可收回的业务 MVP，而非仅单元测试；测试/验收。
  - 追踪：UC01～UC15、AC-01～AC-15，包含真实写入和消息测试。
  - 前置：T01～T07 与 T09；经确认的目标运行环境和真实 PG/API/浏览器可用。
  - 必读：本功能全部文件、技能 acceptance-evidence；所有接口/数据模型/任务输出；测试前明确数据隔离与副作用边界。
  - 允许修改：本功能三份文档中的证据/状态；本功能已建专项测试补覆盖，不改业务逻辑掩盖失败。
  - 允许新增：`hr-portal/backend/tests/test_app_identity_switch_control.py`；`../../ui-blueprints/PM-T008-T08-acceptance-*.png`。额外脚本/报告先获用户许可，不默认创建流水账。
  - 禁止：对生产改数据、用管理员全量响应作为员工期望值、虚构用例或截图、跳过权限拒绝与历史比对即勾选；发现实现缺陷回相应任务。
  - fixture：独立构造固定 admin、非 admin 超级管理员、授权/无权/停用操作者；员工甲无 Portal 用户，为乙上级且不为丙上级；HRBP 仅负责组织 A 并排除乙；同名/无任务/历史参与者；样本期望集合人工固定。尽量使用合成或脱敏数据，不拷贝全量生产敏感数据。
  - 输入/输出：已确认用例逐项执行，输出 passed/not-run/blocked 与真实证据；对象授权、SQL、UI、部署、生产验收分开。
  - UI：真实 PC 覆盖两身份、多标签、关闭确认、切换/失效/恢复；本任务截图不能替代 T06/T07 实现图。
  - API/DB/权限/外部：真实 HTTP 与 PG；至少两连接/两服务实例验证关闭竞态、旧角色页、重开重放、重启不补权；只读下拒绝外部副作用；SSO 为不在范围，不能标 passed。
  - Given/When/Then：Given 固定 fixture 和授权，When 全链路运行并并发关闭/重开/重启，Then 每条 UC 的目标集合、拒绝和旧凭证失效可重复证明，其他业务权限和历史快照不变。
  - 命令（backend）：`python -m pytest tests/test_app_identity_switch_control.py tests/test_app_identity_switch_migration.py tests/test_performance_auth_context.py tests/test_performance_object_authorization.py tests/test_performance_projects.py tests/test_performance_notification_settings.py tests/test_performance_feature_authorization.py -q -rs`。
  - 验收：失败故障注入回滚、独立操作者/目标审计、角色数量/去重用户数量、异步导出撤权、admin 例外、普通 Portal 回归全部有证据。
  - 证据记录格式：`日期｜任务/UC/AC｜环境/版本｜命令或 API｜预期｜实际｜结果｜SQL/PNG路径｜未覆盖原因`，写回本文件第 5 节；不另造并行验收规格。
  - 阻塞：无真实数据库/API/浏览器或存在 P0/P1 权限缺陷，不得宣称 MVP 完成；未执行生产只写“未部署/未验收”。
  - 完成定义：全部批准范围验收、权限安全、UI、迁移、构建、证据完成；生产发布仍须单独批准。

- [ ] **PM-T008-T09 目标员工业务写入、消息隔离与完整流程验证**
  - 目标/类型：按用户批准范围，以目标员工真实权力执行保存/提交等动作；MVP-1 必做。
  - 追踪：FR-08/11/13/15/16；UC13～UC15；AC-13～AC-15。
  - 前置：Q01/Q02/Q07 业务规则已确认；T01 冻结技术契约，T04/T05 完成；T09 在 T08 最终验收前完成。
  - 必读：批准动作对应的当前 feature spec/atomic task、节点/状态、API、对象授权、事务、业务审计和通知链；本功能第 6 章。
  - 允许修改：`hr-portal/backend/app/identity_switch/context.py` 的已批准动作策略；`hr-portal/backend/app/performance/projects_router.py` 及 T01 列明的对应写入口，仅可信身份、审计上下文与关闭并发边界；前端已建切换提示/动作权限模块。
  - 允许新增：`hr-portal/backend/tests/test_app_identity_switch_control.py`；涉及可见交互需独立 `../../ui-blueprints/PM-T008-T09-implemented-target-actions.png` 并确认蓝图更新。
  - 禁止：把切换资格当作评分/校准/发布权、跨节点越权、改业务时限、回滚已发布结果、静默发送通知、取消双身份审计或审计演员语义。
  - 共享：相关 feature 负责人确认可修改范围，逐动作串行；缺共享事务契约则停止。
  - 输入/输出：冻结可写模式及动作白名单；按目标真实业务权限执行，记录 operator/effective employee，持久化后重开回读；接口幂等、关闭竞态及外部发送策略保持一致。
  - UI：沿用业务表单；明确不是“预览”，提交会影响数据；不重复构建评价表单。不可逆操作沿既有确认并增加切换身份提示。
  - API/DB/权限/外部：沿原接口/事务；关闭成功后旧非 admin 会话不得提交；此前已提交不撤销；任何对外消息必须按明确批准规则处理，不以临时 mock 声称真实外部验收通过。
  - Given/When/Then：Given 甲合法持有乙任务，When 保存/提交，Then 按既有规则落库并审计；Given 丙不在范围或节点关闭，Then 拒绝；Given 与关闭并发，Then 线性化结果明确；Given 请求重试，Then 不重复提交/通知。
  - 测试/命令：`python -m pytest tests/test_app_identity_switch_control.py -q`（backend）；相应既有任务回归；真实 API→SQL→重新打开页面，前端 `npm run build`。
  - 验收/证据：逐动作 allow/deny、记录状态、双身份审计、不可逆确认、关闭并发、幂等和通知边界；覆盖全部批准动作才完成，不用单个自评代表全部。
  - 阻塞/非范围：开发与生产可写方向已确认，T09 为 MVP-1 必做；Q07 业务规则已确认，批次、异步及投递技术契约仍由 T01 冻结，不能编码为任意发送。不新增业务权限。
  - 完成定义：批准范围的写入/副作用/权限/UI/真实回读和证据完整；不与只读 MVP 完成状态混淆。

## 4. 需求覆盖与完成判定

| 需求 | 主任务 | 主要用例 |
|---|---|---|
| FR-01 | T03/T06 | UC03/06 |
| FR-02/03 | T02/T03/T04/T06/T07 | UC01/02 |
| FR-04/05/13 | T03/T04/T08；可写时 T09 | UC05/06/08 |
| FR-06/07 | T04/T05/T07 | UC02/04/09/11 |
| FR-08/12 | T05/T07/T08；可写时 T09 | UC04/10/11/12/13 |
| FR-09/10/14 | T04/T05/T07/T08 | UC07/12 |
| FR-11 | T03/T04/T05/T08/T09 | UC05/10/13 |
| FR-15/16 | T01/T02/T06/T07/T09/T08 | UC14/15 |

MVP-1 完成条件：T01～T09 全部满足完成定义；2026-10-28 用户已决定首轮支持开发与生产实际操作，T09 不再可省略。关闭清权、admin 例外、无账号目标授权、历史快照、权限拒绝或 UI 蓝图任一缺证据，均不能宣布完成。

## 5. 当前状态与证据占位

| 项目 | 当前状态 | 说明 |
|---|---|---|
| 需求与实施准备 | T01 进行中 | 已确认环境/操作/通知规则，仍待蓝图及剩余身份边界确认 |
| 代码静态核查 | 已核对部分现有入口 | 事实见 spec 5.1；非实现验收 |
| Q01/Q02/Q07 | 业务决定已确认 | 开发生产可写、原接收方禁投、单样例与独立汇总 |
| Q03 / 迁移 head | 本地只读核查通过 | admin 候选唯一且有效；代码与本地库均为 0279_performance_live_guard；其他环境未核验 |
| Q04/Q06 / 技术契约 | 部分待确认 / blocked | T01 未勾选；实施核查与契约见 spec 第 11 章 |
| UI 蓝图与独立 PNG | 已生成 / 待用户确认 | v1 HTML、8 张设计状态图；不是业务实现截图 |
| 原型渲染/脚本语法 | passed | Chrome headless 渲染、node --check、PNG 实际尺寸；未执行正式业务交互测试 |
| 业务开发 / 迁移 | not-run | 未修改代码或数据库 |
| 专项/回归/构建 | not-run | 测试文件与命令是计划，不是执行结果 |
| 真实 SQL/API/PC | not-run | 不把本地文件检查当业务验收 |
| 部署 / 生产验收 | not-run | 未获本次授权，不推断生产已具备能力 |

后续证据按任务与 UC/AC 回填此节和任务卡；已确认结论变化先更新 spec，不能把测试实现或历史记录当成新业务需求。

### 2026-10-28 实施准备追加记录

已核实当前工作区与规格，尚未修改业务代码。用户确认开发与生产均可操作、禁止向被切换员工发消息；Q01/Q02 决定写回 spec，T09 纳入 MVP-1。Q07 后续已确认，最终以 spec 第 10 章的原接收方禁投、仅记录和受控样例/汇总规则为准。T01 必须补通知事件传播、异步执行、重试不补发及正常非切换通知不受影响的契约和测试，不能将现有 recorded 催办响应当作真实投递证据。UI 蓝图仍未生成/确认，T01 保持未勾选。

### 消息测试子项（2026-10-28 最新决定）

- [x] **PM-T008-T01-N01 冻结通知测试契约**：一次业务触发对应 test_run_id，样例/汇总分别去重；明确批次结束/失败、原接收范围、接收方核验、admin 配置和结果查询 API，更新 T02/T06/T07 的具体字段及蓝图。
- [x] **PM-T008-T02-N01 批次和去重持久化**：沿唯一新迁移链落实 T01 字段，保留逐条生成/拦截记录与 sample/summary 名额；重启/多实例不重复、不恢复原接收方投递。
- [x] **PM-T008-T06-N01 admin 受控投递设置**：默认仅记录、测试投递关闭；核验接收方，样例固定 1、每批汇总 1；不允许恢复原收件人发送，更新本任务独立蓝图/截图和组件测试。
- [x] **PM-T008-T07-N01 每次独立汇总与单样例反馈**：仅记录时均预览不发送；受控投递时每次一条汇总，样式验证另发一条样例；分开展示生成、原收件人拦截、样例和汇总投递状态，不能把未送达显示为成功。
- [x] **PM-T008-T09-N01 通知网关和异步禁投**：T01 冻结后可修改 integrations/feishu/notification_service.py 及其 schemas/models 中经批准的分支、明确列出的绩效事件/worker 路径，仅传递可信来源、禁投策略、测试批次及去重状态；不改正常非切换行为、不建平行通知引擎，schema 变更回 T02 新迁移。
- [ ] **PM-T008-T08-N01 消息测试验收**：计划测试文件为 `hr-portal/backend/tests/test_app_identity_switch_control.py`，当前未创建。Given 500 条原通知，When 一轮受控样式测试完成，Then 原接收方投递 0、样例 1、独立汇总 1，逐条记录完整；默认模式外发 0。覆盖同批重试/分片/多实例、接收方冲突、配置关闭/资格撤销、样例失败、汇总失败页面可查、不确定回执不盲目重发及正常通知不变。backend 命令：`python -m pytest tests/test_app_identity_switch_control.py -q`；真实外发另获批准，mock 不等于真实送达。

以上均为父任务的验收子项，全部未执行；不因业务规则明确就勾选 T01 或宣称蓝图、代码及投递验证完成。

### T01 本轮执行证据（2026-10-28）

| 检查 | 实际结果 | 范围与限制 |
| --- | --- | --- |
| 仓库/工作区 | 已核查 git root/status | 保留 frontend/src/api/performance.ts、分布规则组件、Spec 021 等其他未提交改动 |
| Alembic heads | 唯一 0279_performance_live_guard | 只读命令，未创建/执行迁移 |
| 本地 admin | READ ONLY 查询：1 行，id=1，active=true | 不硬编码 ID；其他环境不作推断，未读密码、未改库 |
| 原型 HTML | 已创建 PM-T008-user-identity-switch-v1.html | T01 允许文件；纯内存演示，不调用 API |
| 状态 PNG | 8 张，含 390 × 1050 窄屏 | 路径/实际尺寸在 ui-interaction 第 10 章 |
| JavaScript 语法 | node --check 退出 0 | 只证明原型语法，非后端/组件功能通过 |
| 目视检查 | control 场景已检查一次 | 其他场景仅渲染截图，不能宣称完整交互验证 |
| 业务代码/测试/投递/部署 | not-run | 当前未开始 T02～T09，无消息外发、无生产操作 |

T01 仍保持未勾选：等待用户确认蓝图 v1.1、Q04 与 Q06 明确处置。后续首先推进 T02，不提前开始正式 UI 实现。

### T01 入口调整同步（2026-10-28）

用户确认将管理入口独立到权限管理 → 身份管理，采用系统名称、描述、状态、操作四列，本期仅绩效系统；行按钮按状态显示启用/停用。已更新 FR-02、UC01、T03/T06、交互说明及蓝图 v1.1；角色配置仅保留使用授权。新页面不通过给超级管理员角色授予菜单权限开放，仍须固定 admin 主体校验。停用清权/撤会话、重启用不恢复、admin 永久资格、消息测试保护均不改变。此次只是 T01 蓝图修订，不表示新页面已接入正式路由或后端。

## 6. 本轮最终执行与状态（2026-10-28，覆盖前文历史占位）

### 6.1 实际验证命令

- backend：`python -m pytest tests/test_app_identity_switch_control.py tests/test_app_identity_switch_migration.py tests/test_performance_auth_context.py tests/test_performance_object_authorization.py tests/test_performance_projects.py tests/test_performance_notification_settings.py tests/test_performance_feature_authorization.py -q -rs` → **368 passed，4 skipped，1 warning**。
- frontend：`npm run test -- src/stores/identitySwitch.spec.ts src/views/system/IdentityManagement.spec.ts src/components/performance/PerformanceIdentitySwitchDialog.spec.ts` → **5 passed / 3 files**。
- frontend：`npm run build` → **passed**（vue-tsc + Vite）。`src/api/client.js` 已从改动后的 TS 同步，避免旧 JS 遮蔽运行逻辑。
- PostgreSQL：实际开发库执行本功能 0280 升级；随机隔离 schema 执行真实 migration upgrade/downgrade/再次 upgrade、用户保留和故障回滚。未降级实际开发库或生产。
- 独立 PostgreSQL/HTTP fixture 不是 SQLite 或仅函数模拟：实际员工无 Portal 账号，真实工作总结 PATCH 保存、POST 提交、数据库回读、另一员工任务 404、同事务双身份审计 2 条；并发控制版本冲突、角色撤销后重授旧会话仍失效、重新启用不恢复；500 条通知仅样例 1 + 汇总 1，使用替身发送端。
- 同名项目管理员周期唯一性、HRBP 组织范围与不可见人员过滤有追加专项。4 个 skip 来自既有项目专项需 RUN_PERFORMANCE_DB_TEST / --postgres-acceptance / 额外本地数据库开关，未计通过；新增功能的隔离数据库测试已实际运行。

### 6.2 PC 与截图证据

通过独立后端 8012（只加载动态表注册，不运行调度器/外部同步）和前端 5178 验证，不重启原 8000 服务，不操作生产。管理表实际点击启用、停用确认后恢复初始停用状态；实际统一名单查询返回 2179 人；切换得到 subject_type=EMPLOYEE、目标员工无 Portal 账号、operator 保留、permission_codes 不继承 admin、dev preview=false，恢复本人成功。API 运行时客户端的请求附加会话也已验证。

- T06：[正式身份管理页](../../ui-blueprints/PM-T008-T06-implemented-switch-control.png)，1440 × 1100。
- T07：[正式员工切换状态](../../ui-blueprints/PM-T008-T07-implemented-employee-switch.png)，1440 × 1100。
- T09：[正式消息记录空态](../../ui-blueprints/PM-T008-T09-implemented-target-actions.png)，1440 × 1100；明确仅为空态，不作为真实投递或 500 人记录界面的证据。

本地浏览器没有提交真实业务评价，没有向员工或测试接收人发送任何消息。真实业务写入只在隔离 schema 执行。

### 6.3 任务收尾

| 任务 | 当前状态 | 完成证据 / 剩余 |
| --- | --- | --- |
| T01 | 完成 | 用户最新布局与开发指令、固定 admin 锚点、候选按统一源、同名 fail-closed、v1.1 蓝图与实际契约已落实 |
| T02 | 完成 | 三表模型、0280 新迁移、实际升级与隔离升级/降级/回滚 |
| T03 | 完成 | admin 专属菜单/接口、角色代际、防默认补权、原子清权与单独撤角色会话不复活 |
| T04 | 完成 | 人员检索、opaque 会话、归属/撤销/到期、页内隔离；无全员开户 |
| T05 | 完成 | 可信员工授权、工作台过滤、目标特权隔离、同名与 HRBP 范围、真实任务越权拒绝 |
| T06 | 完成 | 四列独立身份管理页、角色使用权、真实启停 PC、组件测试与构建 |
| T07 | 完成 | 正式右上角切换/恢复、持续提示、缓存/旧请求隔离和实际 EMPLOYEE 无账号验证 |
| T08 | 开发验证完成，验收未全关闭 | 368/5/构建/真实 PG/HTTP/PC 已通过；用户全业务矩阵和真实外发未执行，保持未勾选 |
| T09 | 代码实现与本地验证完成，外部验收待执行 | 实际保存提交回读、同事务审计、原接收方零投递及替身 1+1 已通过；真实飞书送达/样式、不可逆全流程生产业务验收未执行，保持未勾选 |

通知专项与业务专项合并在真实隔离夹具中，前文分拆文件为实施计划；没有创建不存在的证据文件。不得把 T08/T09 未勾选解读成“代码没有实现”，也不能把本地通过解读成生产已部署。需要外发批准后才能进行真实消息验收。

### 收尾补充

- 前端访问上下文类型已补 EMPLOYEE 与 effective_employee_no/operator_user_id/switch_session_id；类型专属改动后另执行 `npx vue-tsc --noEmit`，通过，未改变其他并行绩效代码。
- 收尾只读确认：本地 others_enabled=false、test_delivery_enabled=false、有效切换会话 0；本地已应用版本为 0280_app_identity_switch。
- 仓库当前唯一 head 已由其他并行工作顺延到 0281_master_entity_definitions；本轮未代为执行该迁移，也未修改其他任务迁移文件。发布时协调完整链，不能误称开发库已升到全仓最新 head。
- 临时 8012/5178 验收服务已停止，隔离浏览器登录已清除并关闭；原 8000 服务未重启。没有提交、推送或生产部署。

公开仓库提交说明：T07 正式截图中的员工姓名、员工编号和头像区域已做不可逆像素遮盖；保留其余真实界面与验收含义。未修改功能代码或测试结果。

## 7. PM-T008-F01 共用侧栏菜单映射修复（2026-10-28）

- [x] **PM-T008-F01 身份管理与主数据定义侧栏点击回归**
  - 背景：用户生产反馈身份管理、主数据定义点击后进入首页；两页路由存在，但 MENU_ROUTE_MAP 缺少相应菜单编码，Default.vue 的空映射回退使点击目标变成 /home。不是当前源码中的 JS/TS 同名遮蔽。
  - 范围：只在 frontend/src/constants/menuRoutes.ts 补 system.identity_management → /system/identity-management、system.master_entities → /system/master-entities；不改角色、admin 限制、后端、数据库或其他业务。
  - 需求追踪：PM-T008 FR-02/AC-01；B01.a 主数据定义入口（FR-B01/B12 的既有定义入口，不扩大业务验收）。
  - 复用：实际 Default.vue 侧栏、真实 MENU_ROUTE_MAP、内存路由；测试只模拟已授权菜单和目标页面，不绕过实际业务接口保护。
  - 验证：在修改映射前，新增 4 项断言失败，其中两项实际点击跳到 /home；补映射后，menuRoutes.spec.ts 的映射与侧栏点击/高亮均通过。联合原身份管理与会话专项共 10 项通过。
  - 命令：frontend 下 `npm run test -- src/constants/menuRoutes.spec.ts src/views/system/IdentityManagement.spec.ts src/stores/identitySwitch.spec.ts src/components/performance/PerformanceIdentitySwitchDialog.spec.ts`。
  - 构建：`npm run build`（vue-tsc + Vite）通过；已核对正式 Default 布局产物包含两个菜单编码及正确目标路径。
  - 影响/停止：纯前端导航映射，无 API/SQL/迁移，不改已部署数据；如构建或点击回归失败，停止发布而不放宽权限。生产需批准后以正常前端发布更新，禁止现场补丁。
  - 验收边界：组件级实际侧栏点击已验证；真实生产点击未复验，未部署。无需新 UI 蓝图，页面与布局均不变。
