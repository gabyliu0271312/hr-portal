# PM-T016 角色配置原子任务

completion_status: incomplete
pixel_restore_status: blocked
uncovered_reasons: missing_role_api, missing_create_state, missing_edit_state, missing_permission_matrix_state, missing_destructive_action_state

- [x] PM-T016-T01 角色配置列表页面框架
  - 前置条件：PM-T002 后台入口；本目录 `spec.md`、`ui-interaction.md`。
  - 功能范围：实现管理角色/评估角色页签、角色名称搜索、工具栏入口占位、列表字段、操作列、分页容器和空状态；注册 `PerformancePermissionRoles` 路由。
  - 不修改范围：真实角色 API、数据库、权限矩阵、新建/编辑表单、停用/删除/导入业务。
  - 代码交付物：`PerformanceRoleConfiguration.vue`、页面组件测试、目标路由更新。
  - UI 要求：使用采集到的列表结构和列名；遵循 `ui-interaction.md`；本轮 P0/P1，不宣称 P2 像素通过。
  - UCP 协同要求：不涉及 UCP。
  - 测试要求：组件测试覆盖列表框架、角色搜索、评估角色空态；`vue-tsc --noEmit`；生产构建。
  - 验收标准：从绩效后台角色配置路由可打开页面；管理角色显示采集样例结构；搜索可按角色名过滤；评估角色显示空态；未采集动作仅提示后续接入，不写入数据。
  - 完成定义：页面、路由、聚焦测试和类型/构建检查完成；真实 API 和完整交互验收保留给后续任务。

- [ ] PM-T016-T02 角色配置真实查询与分页 API
  - 前置任务：PM-T016-T01；冻结角色领域模型、API Schema、权限和审计契约。
  - 功能范围：待确认后接入管理角色与评估角色真实查询、搜索、分页、加载失败和权限拒绝。
  - UI 要求：替换 fixture，保留已确认列表结构；补齐 loading/error/forbidden 状态。
  - 测试要求：API 成功、参数错误、403、分页和空数据；页面 API 联调。
  - 完成定义：真实 API 保存/读取或查询证据完成后才能勾选。

- [x] PM-T016-T03-F01 新建角色页面整体框架
  - 前置条件：PM-T016-T01；新建角色页采集参数。
  - 功能范围：新增新建角色路由，使用公共 Header 渲染返回按钮和保存按钮，实现第一个白色容器中的角色名称、描述字段、功能权限树及真实创建 API。
  - 不修改范围：功能权限键暂不映射具体 `PerformancePermission`；编辑角色、停用/删除、角色分配和其他未采集字段不接入。
  - UI 要求：使用 `PageHeader`、`PerformanceTextField`、`PerformanceTextButton` 和 `AddOutlinedIcon` 公共组件；本轮仅完成 P0/P1 框架与基础保存，不宣称 P2 像素通过。
  - UCP 协同要求：不涉及 UCP。
  - 测试要求：后端创建/审计/schema 测试；前端组件测试覆盖公共 Header、字段、返回、真实 API 调用；`vue-tsc --noEmit`；后端 compileall。
  - 验收标准：从角色列表点击「新建角色」进入新建页；顶部显示「返回」「新建角色」「保存」；角色名称为空时阻止保存；填写名称和描述后调用真实创建 API，成功后回到列表；内容区不包含虚拟角色或虚构权限字段。
  - 完成定义：页面、路由、公共组件接入、API、审计、聚焦测试和类型检查完成；权限矩阵和编辑能力保留给后续任务。

- [ ] PM-T016-T03 新建、编辑与权限矩阵
  - 前置任务：PM-T016-T02；新建/编辑状态采集和业务契约确认。
  - 功能范围：待确认后实现角色字段、权限矩阵、保存、重开和审计。
  - UI 要求：不得根据当前列表采集结果猜测字段或权限行为。
  - 测试要求：表单校验、权限矩阵、保存重开、越权和失败恢复。
  - 完成定义：完整业务和 UI 状态验收完成后才能勾选。
