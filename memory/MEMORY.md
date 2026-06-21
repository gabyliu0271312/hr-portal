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
- [报表组件架构决策](./hr_portal_report_component_architecture.md) — 报表管理与成本分摊共享 10 个组件库；成本分摊多 ArchiveSection；改共享组件两边同步，改页面文件只影响各自模块
- [两棵树构建规则](./hr_portal_tree_build.md) — cost_center_tree 来自月度维护表 + 业务层级Id；org_tree 来自实时花名册 + 7 层冗余字段（含虚拟根「创梦天地」）
- [服务器部署手册](./hr_portal_server_deploy.md) — 192.168.10.13 生产部署全记录；三大坑(端口白名单找IT开/拉镜像被墙换国内源/base镜像复用)；前端 37801 对外、db 仅 127.0.0.1；FineBI 同机回环连库；更新/重启/排障命令
- [数据源重构方案（JSONB→标准列）](./hr_portal_datasource_refactor.md) — 待实施；解决 FineBI 数值无法聚合根本问题；改动 models/sync/push/router 四处；字段类型改动策略：新增直接生效，已有字段改类型需人工确认
- [Codegen 命名机制](./hr_portal_codegen_naming.md) — 表名/字段 code 三层定名：同中文label复用→AI翻译→规则兜底；建表与同步共用 codegen/service.py；改命名问题先看这条
- [时间显示统一北京时间](./hr_portal_time_display.md) — 前端所有时间一律走 utils/datetime.ts(formatDateTime/formatDateOnly)，锁 Asia/Shanghai；禁止裸用 toLocaleString；后端存 UTC 不动
- [数据范围标签新版语义](./hr_portal_scopes_design.md) — 组织范围+人员范围两段式（alembic 0009）；单标签内 AND、多标签 OR；filters 字段映射花名册.姓名/员工类型/公司名称
- [文档打印与预览方案](./hr_portal_docx_print.md) — Gotenberg 独立服务转 PDF（backend 不内置 LibreOffice）；内网拉不到镜像/字体只能本地 export→传→import；真宋体不入库单独传；三处预览统一 DocumentPaperPreview + printPdfBlob；协议 3 页真因=1.5 行距，render_docx_template 强制 A4+压行距；生产 compose 差异已纳入仓库
- [AI 原生开发原则](../specs/004-ai-native-workbench/ai-native-development-principles.md) — HR 工作台根原则：所有新能力都要具备被 AI 理解、调用、校验、审计和确认的准备
- [AI 能力注册表](../specs/004-ai-native-workbench/ai-capability-registry.md) — capability 元数据、工具边界、能力清单、权限叠加和评测用例
- [AI 平台完整路线图](../specs/004-ai-native-workbench/ai-platform-roadmap.md) — Phase 0-7 阶段拆解、进入条件、验收标准；Phase 5 是 Workflow/Capability Orchestration，不是黑盒 Skill
- [ChatBI 走 QuerySpec 不走裸 SQL](./hr_portal_chatbi_queryspec.md) — NL 查数定调 Text-to-QuerySpec + 指标语义层；权限编译期注入；口径治理待办；已写入 specs/004
- [表格处理工具(社保多源归集)](./hr_portal_excel_table_tools.md) — specs/006；多源异构→按人(姓名+证件)归集到标准模板；7种表头结构；AI分级介入(规则认模板+AI猜陌生表映射,②第一版必做)；复用现有 ai/provider.py；节奏=先文档→demo→工程
- [公式引擎是公共组件](./hr_portal_formula_engine_shared.md) — app/ai_formula 是顶层公共模块(reports/datasets/table_tools 平级复用)；要做"按公式算字段"一律复用 evaluate_formula+executable_functions，禁止重写求值器；table_tools 派生已删 eval_expr 改用它(2026-06-21)

## 主要文档导航

- 需求规格：[specs/001-hr-permission-portal/spec.md](../specs/001-hr-permission-portal/spec.md) — 4 轮澄清记录全留痕
- 实施计划：[specs/001-hr-permission-portal/plan.md](../specs/001-hr-permission-portal/plan.md) — 5 阶段 Phase A→E + 6 大技术决策
- 数据模型：[specs/001-hr-permission-portal/data-model.md](../specs/001-hr-permission-portal/data-model.md) — 30+ 表 schema
- 接口骨架：[specs/001-hr-permission-portal/contracts/openapi-skeleton.md](../specs/001-hr-permission-portal/contracts/openapi-skeleton.md)
- 任务清单：[specs/001-hr-permission-portal/tasks.md](../specs/001-hr-permission-portal/tasks.md) — 85 项任务，**已完成 Phase 1（T001-T008）**
- 部署手册：[specs/001-hr-permission-portal/quickstart.md](../specs/001-hr-permission-portal/quickstart.md)
- Phase 1 验证：[hr-portal/docs/phase1-verify.md](../hr-portal/docs/phase1-verify.md)
- AI 原生架构评审：[specs/004-ai-native-workbench/architecture-review.md](../specs/004-ai-native-workbench/architecture-review.md)
- AI 原生一期实施蓝图：[specs/004-ai-native-workbench/implementation-blueprint.md](../specs/004-ai-native-workbench/implementation-blueprint.md)
- AI 平台完整路线图：[specs/004-ai-native-workbench/ai-platform-roadmap.md](../specs/004-ai-native-workbench/ai-platform-roadmap.md)
- AI + Excel 计算字段 MVP：[specs/004-ai-native-workbench/formula-calculated-field-mvp.md](../specs/004-ai-native-workbench/formula-calculated-field-mvp.md)
