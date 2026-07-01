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
- [两棵树构建规则](./hr_portal_tree_build.md) — cost_center_tree 来自月度维护表；**org_tree 已改由组织单元表 org_unit 权威建树（2026-06-23，spec 007）**，按 parent_org_code 显式连父+RootOrg 虚拟根；org_node_code 收敛为源端真编码单列
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
- [函数库函数启用 SOP](./hr_portal_formula_function_enablement.md) — 启用 Excel 函数必须双改：function_catalog 标记 executable + formula_evaluator 实现，再写 catalog_settings 开关并重启后端
- [飞书单点登录](./hr_portal_feishu_sso.md) — 用飞书账号登录 Portal 本身；邮箱匹配为主+首次回写 feishu_user_id+匹配不到拒绝登录；启用前必做填凭证开开关+飞书白名单；配置三处同步(.env/.env.example/compose)
- [操作日志](./hr_portal_operation_logs.md) — 复用 system_logs 按 category 多路复用，加新日志类型零建表；查询接口按 category 动态鉴权(不能用 require_op 绑死)；补偿金计算已埋点(谁/何时/查了谁)
- [报表脏字段引用告警](./hr_portal_report_dangling_field_ref.md) — 查询弹"计算字段已被删除/已自动跳过"=config.columns 残留已删字段;已修(commit dbfe7a4),但需重新保存报表才清除,光查询照报
- [报表脏字段引用·完整版](./hr_portal_report_orphan_calc_ref.md) — 同款告警彻底排查:孤儿藏 columns+column_settings,删除守卫漏检 key(f23a38d修),总症结=改了代码但生产前端没 --build 部署
- [L3 字段权限两条语义](./hr_portal_field_permission_semantics.md) — 「敏感」是字段分类管控总开关(非敏感分类零效果)；报表含无权敏感字段→整张 403(授权该角色实际无效)；被问"是不是 bug"直接引用，符合设计
- [三套敏感开关](./hr_portal_sensitive_three_switches.md) — "关了敏感还脱敏/超管也脱敏"=三套独立开关关错地方;列级 is_sensitive 和计算字段绝密对超管强制脱敏,分类敏感才超管豁免;计算字段引用列级敏感列→超管也脱敏(设计非bug)
- [北森报表分页两个坑](./hr_portal_beisen_report_pagination.md) — 行数拉不全(944→714):①pageSize有上限(5000报400,1000可用)②分页无序页间随机重叠;应对=pageSize自适应降级+多轮重扫整行去重;排查铁律=从北森源头导出文件直接数,别信中途推断
- [报表可见性三档模型](./hr_portal_report_visibility_model.md) — private/scoped/public 三档(migration 0055);scoped/public 共用"数据集权限闸";改报表权限前必读

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
- 2026-06-27: 飞书事件订阅/卡片回调公网化待办见 `memory/hr_portal_feishu_notification_callback_todo.md`；本机回调验证成功，飞书平台验证失败疑似内网/公网 HTTPS 限制。
