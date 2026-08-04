# PM-001 验收标准

## 1. 账户与入口

- 系统存在且仅存在受控初始化的绩效超级管理员账号。
- 超级管理员只能创建/维护绩效管理员账号，不能访问 HR Portal 其他业务或处理绩效业务数据。
- HR Portal 入口权限与独立绩效管理员账号均能被后端访问上下文正确识别。

## 2. 授权与可见性

- 直属上级、间接上级、HRBP、校准人、360°评估人、项目管理员和申诉处理人均严格按矩阵控制数据范围。
- 被评估人不可读取360°评价原文，也不可读取非本人邀请的360°评估人名单。
- 间接上级按锁定汇报链读取全部下级信息，但不获得评价、校准、申诉或发布操作权。

## 3. 快照与审计

- 锁定前同步和人工调整有效；锁定后除离职状态外不受实时组织变更影响。
- 离职状态更新不删除历史记录。
- 校准调整、申诉处理、结果发布和发布转交均产生完整审计记录。

## 4. 发布与申诉

- 直属上级逐个发布结果后，员工立即可见且不可撤回。
- HRBP 仅能转交发布任务，不能直接发布。
- 转交给任意指定人员后立即生效，且可完整追溯。
- 申诉处理人可按人或按角色配置；任一处理人处理即可关闭本周期申诉，历史申诉不可见。

## 5. 交付证据

- 数据库迁移升级与回滚结果。
- 针对每类角色的 API 授权测试。
- 快照、离职状态和汇报链测试。
- 转交、发布不可撤回和审计记录测试。
- 如实现 UI，附已确认蓝图版本、页面验证记录和构建结果。

### PM-001-T01（2026-08-03）

- 在隔离 PostgreSQL 验证库中实际执行 `0169_performance_authorization_foundation` 从 `0168_remove_invalid_dataset_relations` 的升级、回滚和再次升级；回滚后绩效表数量为 `0`，重升后为 `5`。
- 聚焦测试 `tests/test_performance_authorization_foundation.py` 与 `tests/test_performance_authorization_migration.py` 通过（`9 passed`）。
- 在隔离库中连续执行两次绩效授权种子：仅保留 `1` 个绩效超级管理员，密码为 bcrypt 哈希，且其角色仅拥有 `performance.admin_accounts.manage`，全局角色授权关联为 `1` 条。
- 本任务未实现 UI；独立登录和账号管理界面仍须先确认绩效 UI 蓝图后，才可在 PM-001-T02 中开发。
### PM-001-T02（2026-08-03）

- 新增 `POST /api/v1/performance/auth/login` 和 `GET /api/v1/performance/auth/context`：独立绩效账号使用独立用户名/密码认证；Portal 用户仍使用现有 JWT，但后端强制校验 `performance.app` 或 `performance.admin` 入口权限。
- JWT 显式标识 `PORTAL_USER` 或 `PERFORMANCE_SYSTEM_ACCOUNT` 主体；Portal 通用解码器拒绝独立绩效账号令牌，避免同 ID 被误识别为 Portal 用户。
- 每次请求实时读取账号启用状态、有效期内的绩效角色授权及权限，不将权限缓存至令牌；绩效超级管理员上下文仅返回 `performance.admin_accounts.manage`。
- 聚焦测试 `tests/test_performance_authorization_foundation.py`、`tests/test_performance_authorization_migration.py` 和 `tests/test_performance_auth_context.py` 通过（`16 passed`）。
- 容器内 API 实测：独立账号登录成功并返回 `SYSTEM_ACCOUNT` 上下文；错误密码返回 `401`；将独立账号令牌调用 `/api/v1/auth/me` 返回 `401`。
- 本任务未实现 UI，也未新增数据库迁移；独立登录页面、账号管理页面和 Portal 绩效入口页面仍须先确认绩效 UI 蓝图后开发。
### PM-001-T03（2026-08-04）

- 新增 `performance_authorization_snapshots`、`performance_authorization_snapshot_people` 和 `performance_dynamic_identity_assignments`；以无 UI 的 `cycle_ref` 作为后续周期模块的授权快照引用，未创建完整周期管理功能。
- 花名册输入以 `emp_realtime_roster.employee_no` 作为稳定人员引用；`direct_supervisor` 和 `hrbp` 在锁定前被解析并冻结为员工编号，同时保留原始输入值便于追溯。
- 授权快照锁定后拒绝人员、组织、汇报关系和动态身份输入的结构性变更；离职状态仍可实时同步，且不会覆盖直属上级或 HRBP 快照。
- 动态身份解析支持被评估人、直属/间接上级、HRBP，以及 360°评估人、校准人、项目管理员和申诉处理人的显式范围指派。
- 聚焦测试 `tests/test_performance_snapshot_service.py` 与既有 PM-001 测试通过（`23 passed`）。
- 在隔离 PostgreSQL 验证库中实际执行 `0170_performance_authorization_snapshots` 的回滚和再次升级：相关表数量从 `0` 恢复为 `3`；服务实测锁定后结构同步被拒绝、员工 `300` 离职状态更新成功且直属上级快照保持 `200`、HRBP 快照保持 `400`。
- 本任务未实现 UI；周期创建、快照维护和动态身份配置页面仍须先确认绩效 UI 蓝图后开发。
### PM-001-T04（2026-08-04）

- 新增对象级授权服务：每次操作都校验锁定快照、身份范围、周期状态、节点状态和记录状态；范围外、节点未开放、周期未激活或已发布记录均显式拒绝。
- 新增 `performance_publication_transfers`：HRBP 仅能在其冻结范围内将具体员工的发布任务转交给任意指定个人；转交立即替代原直属上级的发布资格，原直属上级快照不被改写。
- 新增 `performance_audit_events` 统一审计接口，记录动作人、接收人、周期、员工、原直属上级、转交原因与处理前后状态；数据库触发器禁止更新或删除审计事件。
- 聚焦测试覆盖 HRBP 禁止直接发布、接收人即时发布资格、已发布记录不可重发、越权读取拒绝和审计状态重建；PM-001 聚焦测试共通过（`29 passed`）。
- 在隔离 PostgreSQL 验证库中实际执行 `0171_performance_object_authorization_audit` 回滚和再次升级；相关表数量从 `0` 恢复为 `2`。服务实测接收人可发布、原直属上级和 HRBP 均被拒绝、已发布记录被拒绝重发，且审计事件更新被数据库触发器拒绝。
- 本任务未实现结果发布、校准、申诉或邀请页面；后续 UI 必须先确认绩效 UI 蓝图后开发。
### PM-001-T05（2026-08-04）

- 新增 `PerformanceFeatureAuthorizationService` 作为后续自评、上级评价、结果查看、360°评价、校准、申诉和项目考核制的唯一授权门面；门面统一调用 PM-001 对象授权服务，不允许以后续页面菜单或按钮代替后端校验。
- 动态身份指派新增 `assigned_by_type` 与 `assigned_by_ref`，用于固化 360°评估人的邀请来源；被评估人仅能查询本人发起邀请的评估人，不能读取上级或 HRBP 添加的名单。
- 支持自评、直属上级评价、间接上级结果查看、360°评价、校准调整审计、按具体人员/绩效角色的申诉处理，以及按项目范围的项目管理员授权基线。
- 聚焦回归测试包含角色叠加、间接上级只读、按人/按角色申诉处理、校准审计和统一授权门面；PM-001 聚焦测试共通过（`35 passed`）。
- 在隔离 PostgreSQL 验证库中实际执行 `0172_performance_feature_authorization_baseline` 回滚和再次升级：动态指派来源字段从 `0` 恢复为 `2`；实测仅返回员工本人邀请的360°评估人、校准调整产生审计事件、按人/按角色申诉处理与项目管理员范围均通过。
- 本任务未实现业务 UI 或业务流程页面；PM-001 授权基础已完成，后续功能开发必须先确认各自规格和绩效 UI 蓝图（如涉及 UI）。