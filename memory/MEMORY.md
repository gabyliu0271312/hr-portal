# HR 提效工具 — 项目记忆

> 项目级记忆，跟着项目走（不入全局 MEMORY.md）。

## 项目位置

- **代码**：`D:\AI项目\HR提效工具搭建\hr-portal\`
- **Spec 文档**：`D:\AI项目\HR提效工具搭建\specs\001-hr-permission-portal\`
- **原始需求**：`D:\AI项目\HR提效工具搭建\HR提效工具搭建.txt`

## 记忆条目

- [项目总览](./hr_portal_system.md) — 技术栈 / 端口分配 / 首期 5 张表 / 核心架构决策
- [Phase 1 踩坑](./hr_portal_pitfalls.md) — 端口冲突 + Dockerfile + pyproject.toml readme 字段坑
- [新增菜单页面 SOP](./hr_portal_add_menu_sop.md) — 用户说"加页面/加菜单"必须走 5 步：建 Vue → 注册路由 → 加 MENU_TREE → restart → 引导 UI 配权限
- [menu_actions 升级（Phase 6 前必做）](./hr_portal_menu_actions_upgrade.md) — 权限模型从固定 V/C/U/D/E 升级为自定义动作字典；过渡期工作流按钮用 op="U" 兜底
- [调度系统组件化方案](./hr_portal_scheduler_design.md) — scheduled_jobs/job_runs 通用表 + JOB_HANDLERS 字典；未来加报表订阅/消息推送只加 handler 不改表
- [两棵树构建规则](./hr_portal_tree_build.md) — cost_center_tree 来自月度维护表 + 业务层级Id；org_tree 来自实时花名册 + 7 层冗余字段（含虚拟根「创梦天地」）
- [数据范围标签新版语义](./hr_portal_scopes_design.md) — 组织范围+人员范围两段式（alembic 0009）；单标签内 AND、多标签 OR；filters 字段映射花名册.姓名/员工类型/公司名称

## 主要文档导航

- 需求规格：[specs/001-hr-permission-portal/spec.md](../specs/001-hr-permission-portal/spec.md) — 4 轮澄清记录全留痕
- 实施计划：[specs/001-hr-permission-portal/plan.md](../specs/001-hr-permission-portal/plan.md) — 5 阶段 Phase A→E + 6 大技术决策
- 数据模型：[specs/001-hr-permission-portal/data-model.md](../specs/001-hr-permission-portal/data-model.md) — 30+ 表 schema
- 接口骨架：[specs/001-hr-permission-portal/contracts/openapi-skeleton.md](../specs/001-hr-permission-portal/contracts/openapi-skeleton.md)
- 任务清单：[specs/001-hr-permission-portal/tasks.md](../specs/001-hr-permission-portal/tasks.md) — 85 项任务，**已完成 Phase 1（T001-T008）**
- 部署手册：[specs/001-hr-permission-portal/quickstart.md](../specs/001-hr-permission-portal/quickstart.md)
- Phase 1 验证：[hr-portal/docs/phase1-verify.md](../hr-portal/docs/phase1-verify.md)
