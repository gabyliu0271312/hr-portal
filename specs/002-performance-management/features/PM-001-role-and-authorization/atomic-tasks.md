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
