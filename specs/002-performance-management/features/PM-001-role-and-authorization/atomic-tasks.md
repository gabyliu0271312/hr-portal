# PM-001 原子任务：绩效角色、授权范围与动态身份规则

> 仅在对应规格和 UI 蓝图（如涉及 UI）确认后实施。任务完成必须有迁移、测试和审计证据。

- [x] PM-001-T01 建立绩效账号、静态角色和权限持久化模型
  - 前置任务：无。
  - 功能范围：设计并迁移绩效超级管理员、绩效管理员、绩效内部角色、权限和授权范围的数据模型；初始化唯一超级管理员账号。
  - 不修改范围：不实现周期、评价、校准或申诉业务页面。
  - UI 要求：如提供账号管理页面，先确认蓝图；否则仅实现受控初始化与后端管理契约。
  - 测试要求：迁移升级/回滚、唯一性、密码安全、超级管理员仅可管理绩效管理员账号。
  - 验收标准：超级管理员无法获得或调用其他绩效业务操作权限。

- [x] PM-001-T02 实现独立绩效管理员认证与绩效访问上下文
  - 前置任务：PM-001-T01。
  - 功能范围：支持独立用户名/密码登录、绩效管理员身份识别、HR Portal 用户入口权限与绩效内部角色的统一访问上下文。
  - 不修改范围：不实现飞书 SSO 和完整员工身份映射。
  - 测试要求：正确登录、错误密码、停用账号、Portal 无入口权限、独立账号越权访问。
  - 验收标准：后端 API 以访问上下文而非前端菜单判断权限。

- [x] PM-001-T03 实现周期快照授权输入与动态身份解析框架
  - 前置任务：PM-001-T01。
  - 功能范围：定义锁定前同步/人工调整、锁定后快照、离职状态实时同步的服务契约；解析被评估人、直属/间接上级、HRBP、校准人、360°评估人、项目管理员和申诉处理人的范围。
  - 不修改范围：不创建完整周期管理页面和评价记录。
  - 测试要求：锁定前变化、锁定后组织变化、离职状态更新、汇报链范围、HRBP 范围冻结。
  - 验收标准：原直属上级快照不因后续变化被改写。

- [x] PM-001-T04 实现对象级授权、结果发布转交和审计基础设施
  - 前置任务：PM-001-T02、PM-001-T03。
  - 功能范围：统一校验角色、范围、周期/节点状态和记录状态；支持 HRBP 将具体员工的发布任务转交给任意指定人员并立即生效。
  - 审计要求：记录转交人、接收人、原因、时间、原直属上级、员工、周期和处理前后状态；为校准、申诉、发布和邀请提供统一审计接口。
  - 测试要求：转交后接收人可处理、HRBP 不可直接发布、结果发布不可撤回、越权读写被拒绝。
  - 验收标准：审计可还原每次角色、范围、调整、发布和转交的责任链。

- [x] PM-001-T05 接入后续功能所需的角色规则与回归测试
  - 前置任务：PM-001-T04。
  - 功能范围：将本规格的可见性规则作为后续自评、上级评价、360°、校准、申诉、结果发布和项目考核制的授权验收基线。
  - UI 要求：后续任何新页面均须按 `ui-interaction.md` 先确认蓝图。
  - 测试要求：角色叠加、间接上级汇报链、360°名单可见性、校准调整审计、按人/按角色申诉处理人。
  - 验收标准：后续功能不得绕过 PM-001 的对象级授权服务。

## 授权配置界面增量（2026-10-20）

- [ ] PM-001-T06 授权配置双 Tab 与组件接入
  - 执行依据：用户明确要求直接按文字描述开发，复用高级组件与全局 token；未取得独立可视蓝图确认，不记为蓝图已确认。
  - 范围：既有 `/performance/settings/permissions/authorization` 路由接入专属页面；指定用户授权、按规则授权两个 Tab，工具栏、表格与分页壳；添加弹窗仅展示壳，不执行授权。
  - 复用：`PerformanceLineTabs`、`PerformanceContentSurface`、`PerformanceListToolbar`、`PerformanceManagementTable`、`PerformanceCreateButton`、`PerformanceButton`、`PerformancePermissionButton`、`PerformanceDialogShell`、`PerformanceFormItem`、`PerformanceSearchSelect` 与 `styles/tokens.css`。
  - 修改范围：`PerformanceAuthorizationConfiguration.vue/.spec.ts`、`PerformanceAuthorizationDialog.vue/.spec.ts`、路由中授权配置条目及本功能文档。
  - 禁止范围：不修改角色配置、鉴权、API、数据库、已启动周期快照；不写入模拟授权数据；不覆盖并行任务的路由或其他修改。
  - 契约：指定用户表头为选择用户、授权角色、更新人、最近更新时间、操作（仅编辑）；规则表头为用户范围、授权角色、更新人、最近更新时间、操作（编辑、删除）。搜索词分 Tab 保留；当前列表数据固定为空，不代表后端真实授权为空。导出/编辑/删除提示后续接入；弹窗选项及提交禁用。
  - 测试：Given 默认页面，Then 指定用户 Tab 与对应五列表头；When 切到规则 Tab，Then 展示规则表头和编辑/删除列；When 输入搜索词并切换，Then 各 Tab 独立保留；When 添加，Then 展示对应弹窗壳且不发送授权请求。
  - 已执行：授权配置页面 5 项、弹窗 2 项、角色配置 2 项、共享 Tab 8 项，共 17 项通过。命令：`npm.cmd --prefix hr-portal/frontend run test -- src/views/performance/PerformanceAuthorizationConfiguration.spec.ts src/components/performance/PerformanceAuthorizationDialog.spec.ts src/views/performance/PerformanceRoleConfiguration.spec.ts src/components/performance/PerformanceLineTabs.spec.ts`。
  - 已知基线：额外运行 `PerformanceListToolbar.spec.ts` 的既有断言失败（预期 filter 2 次，实际 1 次），本任务未修改该共享组件或测试。
  - 构建：最终 `npm.cmd --prefix hr-portal/frontend run build` 通过（exit 0）；仅有第三方 `@vueuse/core` 的 Rollup 注释警告。首次构建中的本页测试类型问题已修复，后续构建通过。
  - 待验收：真实应用截图、可视蓝图、权限态验证。现有 9222 浏览器端点无法连接，未取得真实应用截图；未取得完整 UI 证据前不勾选。
  - 后续独立范围：真实列表/查询/导出、授权与规则模型、候选项、弹窗字段及提交、编辑、删除确认/影响提示和后端审计；本任务不声称完整授权功能可用。

- [ ] PM-001-T07 管理角色停用后删除
  - 前置任务：PM-001-T01、PM-001-T04。
  - 功能范围：在既有管理角色列表的“更多操作”接入删除；启用角色的删除项置灰并提示“需要先停用角色，再进行删除”，仅停用的非系统管理角色允许打开确认弹窗并执行真实删除。
  - 代码交付物：`frontend/src/views/performance/PerformanceRoleConfiguration.vue/.spec.ts`、`frontend/src/api/performance.ts`、`backend/app/performance/role_configuration_router.py`、角色配置后端测试。
  - UI 要求：复用 Element Plus 下拉菜单、全局按钮 token 和 `PerformanceConfirmDialog`；标题“确定删除吗？”，内容“删除后，该角色将从角色管理页面移除”，按钮“保留/删除”；取消、Escape、加载态和错误态保持全局弹窗行为。涉及既有页面小范围交互，不新增页面蓝图；关联 PM-001 `ui-interaction.md` 与 Spec 012 N0001-N0005/N0008 危险操作检查。
  - API/权限：状态更新 `PATCH /api/v1/performance/permission-settings/roles/{role_id}/status`，删除 `DELETE /api/v1/performance/permission-settings/roles/{role_id}`；均要求 `performance.authorization.manage`，删除仅接受 `MANAGEMENT`、非系统且已停用角色；有授权关联时返回 409，资源不存在 404，状态/角色类型不合法 400。
  - 审计：状态启用/停用和物理删除分别写入 `PERFORMANCE_ROLE_ACTIVATED`、`PERFORMANCE_ROLE_DEACTIVATED`、`PERFORMANCE_ROLE_DELETED`；删除与审计在同一事务提交。
  - 测试要求：后端覆盖状态切换、启用删除拒绝、系统/评估角色删除拒绝、授权关联冲突、停用角色删除和权限门禁；前端覆盖启用置灰提示、停用后可删除、确认/保留和列表刷新；运行定向测试与前端构建。
  - 验收标准：启用角色不能删除且用户能看到先停用提示；停用自定义管理角色确认删除后列表移除；刷新列表不会恢复已删除角色；系统/评估角色不可删除；失败时弹窗可关闭且不会误删。
  - 完成定义：开发、UI 合规、测试和独立 PNG 验收证据齐全后才勾选。

## 任务依赖

```text
PM-001-T01 -> PM-001-T02
PM-001-T01 -> PM-001-T03
PM-001-T02 + PM-001-T03 -> PM-001-T04 -> PM-001-T05
```

## PM-001-T08 项目数据管理身份与真实来源统一

- [x] PM-001-T08：项目只选PROJECT_ADMIN/HRBP。用户确认项目管理员来自项目编辑administrators，HRBP来自所属周期HRBP权限管理PerformanceHrbpPermission，不增加自定义角色选项。
  - Required reading：Spec002入口/权限基线/PM001规格矩阵、PM003项目规格交互、Spec012通用UI门禁、execution-contract/task-card-template/acceptance-evidence、projects_router/auth_context/seed/role_configuration及现有项目测试。
  - Allowed：backend/app/performance/projects_router.py、backend/tests/test_performance_projects.py、PM001 spec/atomic-tasks。串行局部编辑，保留其他会话工作树；不新建脚本/报告/测试文档。
  - Contracts：沿用data_managers枚举（缺失默认HRBP，空数组不授权）、administrators现有姓名名单、周期HRBP人员/组织路径/不可见人员、最新项目成员快照；performance.project_admin/performance.hrbp内置管理角色启用态及function_permission_keys决定功能权限。项目勾选、人员来源和角色功能权限取交集，双角色合法范围取并集。cycle.manage管理员全局权限维持原边界。
  - Scope：进度performance.frontend.progress；成员列表/矩阵/周期统计performance.frontend.data-view；总览项目入口取上述已授权功能并集，仅有data-view时仍可发现项目但不返回进度。直连接口与列表统一。HRBP子部门按完整路径匹配，不可见人员在计数、分页、聚合前排除。次请求读取最新配置以兑现撤权。
  - Non-scope：项目配置、结果发布、催办、评价任务、授权配置壳、自定义角色授予、其他评估执行人；不宣称所有角色均完成。不做迁移、生产、快照重写或姓名到员工号迁移。
  - UI/API：无新页面/蓝图，既有响应契约与403/404拒绝语义；勾选回填沿用PM003-F01修复。后台读取角色数据库，不接受客户端身份声明。
  - Tests：允许/拒绝与单选/双选/空、撤权、角色停用/关闭功能、跨周期/越范围、不可见与子部门、管理员例外；现有项目后端回归和前端页面回归。真实API/SQL未运行不得记通过。
  - Stop：仅撤销本任务局部差异，不整包回滚。本卡限定后端数据读取闭环已完成，其他角色/动作不随本卡完成。

  - 已实现：统一项目data_managers、项目维护名单、周期HRBP范围和内置角色功能权限判断，覆盖总览/进度、成员列表、矩阵/周期统计。双来源合法范围并集，静态PROJECT授权不能替代项目勾选与人员来源；计数/分页/聚合前过滤HRBP范围。
  - 普通后端回归：backend目录 `.venv/Scripts/python.exe -m pytest tests/test_performance_projects.py tests/test_performance_auth_context.py tests/test_performance_role_configuration.py tests/test_performance_subject_visibility.py -q --tb=short`，285通过4个显式数据库项跳过；既有python_multipart弃用提示。
  - 独立真实SQL/API：backend目录 `DB_HOST=127.0.0.1 RUN_PERFORMANCE_DB_TEST=1 .venv/Scripts/python.exe -m pytest tests/test_performance_projects.py -k project_data_managers_isolated -q --tb=short`，1通过。认证访问上下文用依赖覆盖，可信员工映射/角色/周期/项目/成员/权限查询真实执行PostgreSQL；PATCH项目勾选→SQL读回→GET成员分页/矩阵/统计/总览，4人项目管理员切HRBP为2人；角色关闭数据功能后403/404、停用后总览不可见、调整组织范围/删除HRBP记录后即时撤权。使用隔离schema、隔离序列和外层事务，回滚后确认schema不存在；无生产/公共业务数据写入。
  - SQL环境限制：本地public仍缺既有template_ids/phase_id，首次验收在phase_id查询失败后回滚；后续仅在临时schema中补齐这两个既有模型列，再验收通过。未运行公共库迁移，不能据此宣称生产数据库已具备前置结构。
  - 前端回归：`npm --prefix ../frontend run test -- src/views/performance/PerformanceProjectSettingsPage.spec.ts src/views/performance/ProjectManagement.spec.ts src/components/performance/ProjectPerformanceMatrix.spec.ts`，3文件27通过；PM003-F01先前构建通过，T08本身无前端业务样式新增。目标git diff --check通过。
  - 验收状态：T08限定后端读取闭环完成，代码/单元/实际API-SQL及最终复核通过。未执行真实用户登录浏览器/生产验收，不代表所有绩效角色动作完成；本轮未提交推送或部署。PM003-F01视觉待验收标记不变。
  - 其他角色已核查但未纳入：员工/实线上级/校准人在当前项目任务链有实际授权；自定义管理角色function_permission_keys到通用permission_codes转换及人员授予配置仍未闭环；虚线上级/360评估人/指标评价人当前项目启动任务生成链未完整覆盖。不以角色目录或基础授权服务存在视为业务已完成，后续按独立任务接入。

  - 最终复核修复两项：周期管理员成员字段按真实actor解析，不冒充每行成员本人；仅data-view无progress仍可从总览发现项目，completion_nodes为空防止进度泄漏。独立SQL/API专项增加管理员入职日期可见、仅数据权限项目可发现/进度不返回的断言后再次1通过；普通后端整合285通过4跳过。无其他指定读取路径的已确认越权/人员范围泄漏。

## PM-001-T09 指定用户角色授予/撤销与任务授权权限闭环（2026-11-04）

- [ ] PM-001-T09（进行中，用户明确批准）
  - 目标：原角色页增加“评估任务授权/转交”“校准任务授权”；指定用户授权可保存、重新读取/编辑、撤销，任务授权接口消费真实角色权限，撤权下次请求生效。
  - 阅读/复用：002基线、PM001规格/矩阵/交互/T06/T08、ADR001、012 UI门禁/N000/N00、execution-contract/task-card-template/acceptance-evidence；PerformanceRole/RoleAssignment/IdentityLink、原角色API、真实任务授权/审计链、共享选择器/弹窗/表格。
  - 修改：performance/role_configuration_router.py、projects_router.py、seed.py；frontend api/performance.ts及其已有JS镜像、原角色树/角色编辑页/授权配置页/授权弹窗和对应测试；本目录spec/ui-interaction/atomic-tasks。允许新增performance/user_authorization.py和tests/test_performance_user_authorization.py。共享文件串行局部编辑，保留既有未提交改动。
  - 合同：本轮仅指定已启用且有可信IdentityLink的Portal用户，授予非系统MANAGEMENT角色；不授予系统管理员/评估角色，不按姓名匹配、不创建账号或入口权。使用既有PORTAL_USER/GLOBAL作用域；GLOBAL是显式角色授权范围，不改周期人员或任务快照。批量添加只增选中角色；编辑/撤销仅作用于该用户的自定义GLOBAL管理角色，不改系统/ORG/PROJECT授权。撤销置is_active=false保留行和审计。角色停用/去掉权限键/撤销分配在下一请求失效。
  - API：原角色router下 /user-authorizations（GET分页搜索/POST添加）、/user-authorizations/options（GET可信用户及角色候选）、/user-authorizations/{user_id}（PUT替换本入口角色/DELETE撤销）；均要求performance.authorization.manage；参数422、未知404、角色或身份不可用409、无权403。用户行锁串行化同一人的添加/编辑/撤销，批量失败整事务无半写，审计同事务。
  - 权限：performance.frontend.authorize-evaluation-tasks / performance.frontend.authorize-calibration-tasks 分开判断；管理者代操作不得借progress扩权。原任务处理人/有效转交人/获准校准再授权沿既有对象规则，不因新建管理角色改变其流程身份。现有cycle管理员全局路径保持；新增自定义角色GLOBAL授权按显式功能点裁决，不自动给配置/评分/其他数据读取权。
  - UI：既有页面及两字段弹窗增量，无新增页面/信息架构；指定用户真实列表/搜索/分页/添加/编辑/确认撤销/错误重试；规则Tab保持未接入。选人/角色多选复用SearchSelect；提交失败不关闭、不伪成功；关闭清理旧异步结果。用户本轮要求DOM/API为主证据，不以截图替代接口与授权验证。
  - 测试：Given自定义角色含一种权限，When授予有效用户/保存读回/撤销，Then另一权限不放行、撤销后403且快照/答案不变；无权/停用/伪造/重复/失效身份拒绝；前端保存payload/失败保留/重开回显/撤销刷新。真实PG/API、DOM、定向测试和build分别记，不运行不得勾选。
  - 不做：规则授权、系统角色改权、人员来源接管、生产、提交推送；不改数据库模型/旧迁移，不批量授权存量角色。停止方式仅撤销本卡局部差异，不整包回滚。

## PM-001-T11 授权/转交采集对齐修复（2026-11-09 用户确认）

- [ ] PM-001-T11 修复角色覆盖、原执行人选择、无原处理人决策、幂等恢复及记录定位
  - Goal/type：现有授权/转交前后端闭环修复，不新增菜单、路由或批量写接口；以用户本轮评审后明确要求全部修复为依据。
  - Reading/prerequisites：Spec002基线、PM001 T04/T09、ADR001、REA原始脚本及其评审纠正、Spec012 START_HERE/A01/A02/A05/N0001/N0002/N0004/N0005/N1102-N1104、execution-contract/task-card-template/acceptance-evidence、HR Portal设计规范。原REA报告对授权/转交载荷及no_origin_reviewer_users的误读不作为开发权威。
  - Allowed：backend/app/performance/projects_router.py、project_service.py、backend/tests/test_performance_projects.py；frontend/src/api/performance.ts、PerformanceTaskDelegationDialog.vue、PerformanceDelegationStages.vue、PerformanceReminderPanel.vue/.spec.ts、ProjectAuthorizationRecords.vue、ProjectManagement.vue/.spec.ts、ProjectCalibrationAuthorization.vue；本目录atomic-tasks/ui-interaction及原REA报告纠正。允许组件目录新增PerformanceDelegationNoOriginChoice.vue、useTaskDelegationRequests.ts及对应代码测试，禁止创建独立脚本、报告或测试文档。
  - Shared files：后端代理独占router/service/tests，前端代理独占Dialog/Stages/ReminderPanel.spec及其抽取组件；主线程持有API/记录页/调用方/文档，串行集成验证，不并行编辑同文件。
  - Contract：task_map角色由实际冻结配置与处理人匹配动态返回，handler_name可选；单人同环节多处理人选择具体任务。AUTHORIZE空处理人要求no_origin_reviewer_authorize明确布尔，false返回skipped不建记录/不通知，未确认422；TRANSFER空处理人拒绝。真实接收人仍由现有快照候选与对象权限决定，不把被评估人作为候选。
  - Idempotency：保持既有项目/任务锁；可信actor+task+action+key全生命周期识别原操作，在当前操作权限/完成状态检查前恢复原结果，仅同原grantor可恢复；同key不同body拒绝409，不重放已撤销/替换记录。前端冻结完整body/key并保留成功结果，不确定结果显式重试未知项，关闭重开不丢原请求；不声称浏览器刷新可恢复。重复有效转交同接收人不得再次建记录/通知。
  - Records/batch：highlight_id为authorization_id，定位后使用audit row.id作为UI行键；实际UiTable高亮类滚动，正确页码/Tab。候选批量限制200，前端去重后按200拆请求；复用同快照候选读取，不重构逐任务提交。
  - UI：既有弹窗内部增加执行人复选和无原处理人确认，沿现有壳/确认/checkbox/radio/token；原路由与信息架构不变，不需新增完整蓝图。独立PNG目标 ../../ui-blueprints/PM-001-T11-implemented-delegation.png；未取得真实运行截图须明确未验收，不以组件测试代替生产。
  - API/database/permission：不迁移、不改历史人员快照/答案、无UCP；沿原对象权限和审计链，恢复幂等结果不增加写权限；不操作飞书生产/不生产部署。
  - Given/When/Then：隔级上级合法任务可见而不匹配handler拒绝；P1/P2同环节仅转交选中P1；无原任务未选不能确认、授权/跳过分别执行且skip不记成功；响应丢失/关闭重开/原记录被撤销或替换/原处理人失权后同key恢复，无第二记录/通知；body冲突拒绝；记录audit ID与authorization ID不同且目标在第二页仍定位；200/201候选分段不丢失。
  - Tests/commands：backend `.venv/Scripts/python.exe -m pytest tests/test_performance_projects.py -q --tb=short`；frontend `npx vitest run src/views/performance/ProjectManagement.spec.ts src/components/performance/PerformanceReminderPanel.spec.ts src/components/ui/UiTable.spec.ts`、新增composable代码测试、`npx vue-tsc --noEmit`、`npx vite build`；真实SQL/API与浏览器截图未运行记not-run，绝不假定通过。
  - Non-scope/stop：不做BPM/单请求批量写/来源组织负责人猜测/菜单权限扩张/生产/提交推送；停止仅撤销本卡局部差异。代码、测试、UI与证据齐全主线程复核后才勾选。
  - Authorization-state boundary（2026-11-10用户按生产数据纠正）：AUTHORIZE与TRANSFER均不受任务完成、未开始、逾期或节点时间状态限制；只要任务未撤销、对象权限/角色/范围及校准专属规则允许即可变更处理关系。授权/转交不得重开任务、改提交/完成状态、答案或截止时间，也不得因任务已完成永久写read_only；被授权人/接收人的实际编辑和提交资格继续由原填写接口的任务状态、截止时间及逾期规则独立裁决。
  - Historical no-origin contract：已发起复议且当前快照没有任何对应任务、冻结执行配置及fallback均无法解析处理人时，以`task_id=-appeal.id`只读投影目标；候选接口不写入，确认True才在项目锁内创建空handler placeholder并沿原授权事务提交。False/未确认不物化。创建/幂等恢复返回真实正数task ID，批量候选返回请求负数alias；不对未发起复议成员造任务，不改快照。
  - Evidence（主线程复验）：后端`-k 'delegation or task_authorization or authorization_records'`48 passed/510 deselected；前端ProjectManagement34、ReminderPanel25、UiTable7，共66 passed；最终vue-tsc --noEmit通过；npm run build通过（Vite46.50s，保留第三方VueUse/Rollup警告）；git diff --check通过，仅LF/CRLF提示。
  - Broader regression：projects/auth_context/role_configuration三文件587 passed、5 skipped、6 failed；6失败均为`_communication_progress_detail`查询新增IdentityLink后旧Db夹具缺`scalars()`，与本轮授权测试无关，未修改沟通实现或伪装成全部通过。此前整文件新复议fixture缺datetime导入的2个error已修正，负数专测和最终定向均通过。
  - Not-run/limitations：未运行真实PG/API提交回读、真实并发或浏览器独立PNG；不声称生产生效。通知仍在commit前发送，同键已提交恢复不重发，但外部发送成功后数据库提交失败的跨系统exactly-once不在本卡保证范围。内存pending在浏览器刷新/组件销毁后不持久。整卡保持未勾选，待真实API/SQL/UI证据补齐；未提交、未推送、未部署。

## PM-001-T10 HRBP 不可见范围规则闭环（2026-11-06）

- [ ] PM-001-T10（代码及本地定向回归完成，真实数据库和负责人来源验收受阻）
  - 执行依据：用户批准整体修复本轮 REA 对照发现的问题；既有页面局部修复，不新增页面或重做信息架构。复用现有 840px 弹窗、条件组、人员/组织选择器、SVG 和设计 token。
  - 修改范围：后端 other_permission_settings_router/models/hrbp_scope_service/navigation_service/projects_router、project_service 的快照上级匹配及相应代码测试；前端 api/performance、AudienceRuleEditor、HrbpScopeDialog、HrbpInvisibleScopeSummary、OtherPermissionSettings、MetricLibrary、performanceConditionFields 及相应代码测试。新增单一 0295 迁移，不修改旧迁移。共享文件局部合并，保留其他会话改动。
  - 契约：原 GET/PATCH /performance/permission-settings/other 增加 hrbp_invisible_rules 条件组数组；组内 AND、组间 OR，employee/department/directLeader 仅 include/exclude，[] 显式清空。NULL 存量转换全局旧员工名单为等价规则；全局规则与独立 HRBP permission 不互相覆盖；PATCH 仅发送改变字段，审计包含完整规则。全局不可见按实时花名册计算，不改周期快照；项目新增 directLeader/superior 仅按周期快照完整汇报链匹配。
  - UI：HRBP 与指标库共用 MetricTemplateEmptyIllustration；HRBP 默认直属上级、允许零组、最后一条条件不可删除；项目至少一组。摘要展示原始 AND/OR 与操作符，保存失败保留草稿、再次打开读取完整规则。独立截图：../../ui-blueprints/PM-001-T10-hrbp-empty-implemented-20261106.png、PM-001-T10-hrbp-rules-reopen-implemented-20261106.png、PM-001-T10-metric-empty-shared-svg-20261106.png。已查看真实前端截图；浏览器请求由隔离 API fixture 接管，不代表真实数据库持久化验收。
  - 验收：Given 部门/直属上级/员工排除的多组规则，When 保存并重开，Then 字段/值/操作符/分组不丢；Given 全部删除，When 保存，Then [] 且回到空态；Given HRBP 及管理员叠加，Then 不可见只收紧 HRBP 路径、不撤销独立合法管理员或任务身份；Given 项目上级链含离职中间节点或环，Then 预览/启动使用快照且终止环路。
  - 主线程最终回归：backend 下 `.venv/Scripts/python.exe -m pytest tests/test_performance_other_permission_settings.py tests/test_performance_projects.py tests/test_performance_cycles.py -q --tb=short`：522 passed、6 skipped；frontend 下 `npm run test -- src/components/performance/PerformanceAudienceRuleEditor.spec.ts src/components/performance/PerformanceHrbpScopeDialog.spec.ts src/views/performance/OtherPermissionSettings.spec.ts src/views/performance/PerformanceMetricLibrary.spec.ts src/views/performance/PerformanceProjectSettingsPage.spec.ts src/components/performance/PerformanceSearchSelect.spec.ts`：77 passed。前端 vue-tsc 与生产构建通过；保留第三方 Rollup 注释警告、既有 python_multipart 弃用提示。
  - 浏览器：真实本地路由选择测试经理→PATCH 完整 directLeader 条件→刷新重开回显→删除最后组→PATCH []→空态；指标库同 SVG 宽 250px；page errors=[]。仅隔离测试数据，未写真实配置。
  - 迁移：0295_pm_hrbp_invisible_rules 接 0294_pm_person_info_guard，upgrade/downgrade SQL 与链头检查通过；未执行真实 DDL。真实本地 PostgreSQL 连接拒绝，额外 identity-switch 数据库闭环测试因此失败（同次运行其余 536 passed、6 skipped），不算通过。
  - 阻塞：org_tree.path 有同步，但组织同步链未填充 OrgNode.manager；通用开关仅对已有有效 manager 数据生效，空值/重名不猜测。负责人权威源字段需明确，禁止以直属上级冒充部门负责人。真实数据库迁移、真实 API/SQL 读回、负责人源数据及生产验收未完成，因此不勾选。
  - 非范围：无确认映射的飞书序列/序列职级/角色/人员名单等不伪造接入，不改现有职位族/职位类含义；不扩建组织同步链，不改历史快照、不操作生产、不提交推送。停止方式仅撤销本卡差异，不整包回滚。
