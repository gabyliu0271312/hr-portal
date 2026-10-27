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
