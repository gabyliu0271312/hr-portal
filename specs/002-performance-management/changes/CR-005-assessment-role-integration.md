# CR-005 评估角色统一接入

- 状态：部分实现；对象级闭环待验收
- 关联：PM-001、PM-T003、PM-T004

## 目标与边界

绩效后台「角色配置 → 评估角色」持久化七种系统预置角色：被评估人、实线上级、虚线上级、直属项目上级、360°评估人、校准人、指标评价人。评估角色与后台管理角色分表视图、共用角色目录但不能混用静态授权；角色名、`is_active`、模板标签或前端置灰都不是评价权的证明。角色表不得给预置评估角色配置全局后台权限或无范围的账号授权。

| 角色 | 目录编码 | 成员来源 | 实际授权范围 |
| --- | --- | --- | --- |
| 被评估人 | assessment.reviewee | 员工本人 | 锁定周期/项目人员快照中本人任务 |
| 实线上级 | assessment.line_manager | 从组织架构中获取 | 锁定汇报链；节点只使用模板勾选的直属、隔 1 级、隔 2 级、隔 3 级及以上；多级同时勾选时逐人生成任务 |
| 虚线上级 | assessment.dotted_manager | 从组织架构中获取 | 暂无可信关系字段；先持久化、预留接口，没有对象关系返回时拒绝生成任务/评价授权，不人工指定 |
| 直属项目上级 | assessment.project_manager | 在周期中导入 | 每位被评估人员工编号对应一个不同于本人的项目上级员工编号；两者必须在同周期快照，不可用项目管理员代替；有对应节点而无映射时项目不得启动 |
| 360°评估人 | assessment.reviewer_360 | 通过 360 邀请添加 | 被邀请的被评估人、项目评价节点和时间范围；确认节点仅为所选上级管理增删名单，不是审批门槛 |
| 校准人 | assessment.calibrator | 在项目配置中指定 | 项目校准阶段的规则匹配到的人员及被评估人范围，不能默认全项目 |
| 指标评价人 | assessment.metric_evaluator | 在添加指标时指定 | 被评估人及其一条指定指标；指标改派不在本次范围，预置指标字段定义不等于可评分绑定 |

七角色应复用 `performance_roles` 的稳定码作为业务目录，授权事实仍来自快照、具体关联和项目节点任务；不要求登录账号获得全局静态角色。旧的 `DIRECT_MANAGER`/`INDIRECT_MANAGER` 对象授权仍有效，但不能用“间接上级可查看”替代模板隔级评价任务。旧 `executor_label` 仅用于兼容展示，未来决策应取稳定码与节点选项。已启动项目不静默重建/重算任务。

## 六列表格

评估角色 Tab 依次展示「角色类型、描述、如何指定角色成员、状态、更新人、操作」；七行均为「系统预置角色、已启用、--」，操作展示编辑和停用两个真正禁用按钮，复用全局禁用 token。管理角色 Tab 保留原来的「角色、描述、状态、更新人、最近更新时间、操作」、搜索、新建、导出和更多操作。

- 后端周期逐人映射接口：`PATCH /api/v1/performance/cycles/{cycle_id}/people/project-managers`，请求 `{reason, people:[{target_employee_no, manager_employee_no}]}`；仅 `performance.cycles.manage`，未知/重复/自身编号为 422，已有启动项目为 409，周期不存在为 404。`GET /people` 回读 `project_manager_employee_no`；项目启动在周期行锁内冻结关系，补建只读项目成员快照。该接口可供后续导入 UI 调用，但未确认蓝图前不新增复杂 UI。

## 360°周期规则与冲突解决

周期加载含 360°节点的模板时展示并持久化「360˚ 匿名评估」「允许删除被评估人的 360° 评估人」「向收到过多 360° 邀请的评估人显示提示说明」。删除默认关闭；开启后还须是模板确认节点选中的上级，在该节点开放时间内操作。草稿算未提交，可以删除；已提交不可删除。删除应撤销可操作权并保留审计与草稿历史，不得清除已提交评价。与 PM-001 原“邀请不得撤销”“锁定后指派固化”矛盾之处，以本条新确认规则为准；周期内邀请增量记录独立于锁定人员关系，不能解除快照全表保护触发器。

## 实施门禁与现状

- 已落地代码：七行角色目录迁移、幂等种子、管理/评估分类列表、评估 Tab 六列与禁用按钮、四层实线快照执行人解析并供项目启动/补建复用；虚线无数据时任务解析拒绝；模板任务读写入口要求当前周期可信员工编号严格匹配处理人（包括开发预览不能代写）。另新增周期逐人项目上级映射的后端导入/回读、项目成员冻结字段和 `PROJECT_MANAGER` 节点任务解析（没有映射则拒绝启动）。两项迁移已在本地库执行回滚→重升，尚未在独立隔离库验证；周期导入 UI 未确认蓝图，不按本条宣布完整授权或生产部署。
- 未完成：项目上级导入 UI 与并发/隔离库验收、指标实例级绑定与授权、校准阶段规则物化、360 周期三开关（匿名、删除默认、超量提示）及评价时窗核验的用户侧确认、现用模板任务读写统一对象级授权、旧历史项目任务过渡。当前的七个 `assessment.*` 稳定码只在目录查询和排除静态后台授权中使用；运行时任务尚未消费这些目录码，因此**不能声称七角色统一授权已接通**。
- 新增周期 360 设置和逐人导入交互必须先按 `START_HERE.md` 制作绩效 UI 蓝图并得到明确确认；审批实施计划不等于审批未绘制的蓝图。未确认之前不开发该类新 UI。保护其他任务的未提交文件，不顺手改项目校准规则 UI。

- 验证记录（2026-10-19，本地开发环境）：Alembic 单头 `0258_performance_cycle_project_managers`，两项迁移已在本地库分别 downgrade→upgrade→current 通过，库中 7 行预置角色、0 条静态授权/权限关联；后端相关 pytest 201 项通过（1 条第三方库弃用警告）；前端角色页 6 项通过，`npm.cmd run build` 通过（仅 Rollup 第三方注释警告）。模板流程页面扩大回归 49 项中 5 项失败（尚未确认原因；该文件存在同期修改），独立 UI 截图和真实浏览器路径未完成；`alembic check` 因仓库既有动态/业务表元数据差异返回非零。不得因此勾选全部任务。

- UI 合规自检：已阅读 Spec 012 `ui-interaction.md`、`ui-implementation-guardrails.md` 与 N000 通用约束；评估角色仍在原角色配置路由，不新增交互信息架构，复用已有列表、分页和全局禁用色，不引入 UCP/数仓配置，也无破坏性操作。Spec 012 的数据仓库专属 N02-N10 不适用；绩效专属独立浏览器截图未取得，UI 最终验收未完成。

## 独立任务（未完成不得勾选）

- [ ] CR-005-T01 预置角色持久化与角色配置页：迁移升级/回滚/重升、无权拒绝、两 Tab 分页搜索、六列、全局禁用 token、重开读取、独立 UI 验证截图；变更只限角色模型/种子/API/列表/测试/迁移。
- [ ] CR-005-T02 统一执行人解析与授权门面：模板四层实线、虚线空范围、项目启动和补建一致，登录员工身份、目标任务、节点时间和状态逐次校验；不使用中文标签扩权；补充历史快照和越权测试。
- [ ] CR-005-T03 周期逐人项目上级导入：已落地周期级员工编号映射的后端批量 PATCH/GET 回读与项目成员字段冻结，`PROJECT_MANAGER` 节点缺映射拒绝生成任务；仍须补真实数据库导入/回滚/并发测试、角色授权门面及导入 UI（须先确认蓝图）。
- [ ] CR-005-T04 校准阶段与指标绑定：明确校准规则具体员工来源并物化阶段作用域；指标仅到单条指标，缺少指标实例时禁止假授权；覆盖跨人/跨项目/跨指标拒绝。
- [ ] CR-005-T05 360 周期设置与邀请生命周期：蓝图确认后实施三项设置、邀请/删除 API、确认节点操作人/时间校验，草稿删除与提交并发、匿名与提示条件、审计和读回验证。
- [ ] CR-005-T06 总体验收：前后端、迁移隔离库、真实应用 UI→API→数据库→刷新回读、无权限/异常/历史项目、实际 UI 截图证据齐全后才能声称统一接入完成。

## 2026-10-27 角色身份与项目校准联动调整

本节更新前述“校准阶段规则尚未物化”的代码现状，不表示 CR-005 全部任务或生产验收完成。

### 本轮契约与边界（CR-005-T02 / T04 校准部分）

- 保留模板各节点现有执行人选项及固定执行人规则。新写入节点携带 `executor_role_code`，七种评估身份定义由 `assessment_roles.py` 同时供角色种子、模板规范化和项目运行时使用；显示名不再作为新节点的权限依据。旧节点在读取/新项目启动时规范化，既有项目任务不重算。
- 校准节点稳定身份为 `assessment.calibrator`，`PROJECT_CONFIGURED` 仅表示具体成员来源为项目规则，不是新角色。项目启动校验所需稳定码确实存在于启用的系统评估角色目录。
- 同一个校准解析器用于草稿预览和项目启动：校准人条件组组内 AND、组间 OR，范围限定在本项目被评估人中；直属、隔级和全部下级关系来自周期快照。重叠规则和阶段的总分配人数按被评估人员工编号去重，空白默认规则不得被计为已分配。
- `POST /api/v1/performance/projects/{project_id}/calibration-preview` 接收现有 `ProjectPayload`，不写业务数据，只允许管理当前项目的调用者访问；无权限 403，规则/人员引用无效 422。返回按模板 `node_id` 索引的 `role_code/evaluated_count/assigned_count/unassigned_count/phases[{phase_id,assignments[{handler_ref,employee_no,allow_authorize}]}]`。已启动项目返回冻结分配，不按实时花名册重算。
- 项目启动冻结校准节点的分配、继承的终评内容及不可修改设置；每个阶段、校准人、被评估人生成独立 `calibration` 任务。任务新增 `phase_id`，唯一约束包含该阶段标识。校准人不是全局静态授权，不新增无范围的角色授权记录。
- 对象授权请求可携带 `project_id/node_id/phase_id`；带有这些范围的校准必须匹配真实项目节点任务和冻结分配，禁止退回周期级宽泛授权。任务读写入口复用可信员工身份映射与对象授权服务；跨人、项目和阶段拒绝。现有模板任务表单承接校准任务，修改审计记录包含项目、节点、阶段及前后答案。
- 阶段时窗按稳定阶段 ID 读取，不能退化成整个校准环节的聚合窗口；校准提交不因普通填报逾期策略获得无限补提机会。已启动项目禁止修改校准人员规则、增删阶段或补建校准范围；时间调整沿用现有阶段时间合同，不重算身份或任务。
- 本轮不增加管理角色到执行人选项，不实现360°邀请生命周期、指标实例授权、新的评分计算/结果合成算法或授权他人校准的完整操作流程。`allow_authorize` 随冻结分配保留，但不以该标记凭空创建他人权限。历史无阶段任务不自动升级，不能将本轮写成全部校准业务完成。

### 修改范围与验收记录

- 业务修改限定绩效角色目录/种子、模板DTO/服务、项目服务/路由、对象授权与授权门面、绩效模型、新增迁移、前端现有模板流程/项目流程/API/任务入口、对应既有测试及本变更记录。不修改报表、数据仓库、生产数据库或其他任务的校准阶段时间实现。
- 迁移：`0274_performance_calibration_task_phase` → `0273_org_hierarchy_standard_fields`；旧任务 `phase_id=''`，不改变既有处理人。已在独立本地库 `pm_calibration_acceptance_20261027` 的无业务数据既有结构上验证 upgrade → downgrade → upgrade。存在带阶段标识的校准任务时 downgrade 明确拒绝，不删除任务以强行回退。未执行当前业务库或生产迁移，也未声称验证全部历史迁移从零建库。
- 后端定向回归 496 项通过、2 项真实数据库用例在普通运行中按标记跳过（其中本轮校准用例另在隔离库执行通过），1 条第三方弃用警告；现有及补充测试涵盖稳定码/类型同步、范围包含排除、直属/隔级、循环关系、重复覆盖、未知人员、空白规则、阶段任务、防串权、不可修改字段、已启动项目拒绝改规则。命令见 `tests/test_performance_template_workflow.py`、`tests/test_performance_projects.py`、`tests/test_performance_role_configuration.py`、`tests/test_performance_object_authorization.py`、`tests/test_performance_feature_authorization.py`。
- 独立 PostgreSQL 用例 `test_calibration_postgres_preview_start_scope_and_reopen` 已通过：真实规则预览 → 项目启动 → SQL 查询两阶段任务 → 冻结分配读回 → 对象授权 → HTTP GET/PATCH → SQL 答案与审计；HTTP 跨人404、跨项目403；跨阶段重复任务存在时降级拒绝。全部数据位于外层回滚事务，认证上下文与可信员工解析用受控测试身份，非生产登录验收。
- 前端定向测试 89/89：项目流程19、条件组8、模板流程50、项目阶段时间12。`npm --prefix hr-portal/frontend run build` 已通过（第三方 Rollup 注释警告不影响构建）。
- Chrome真实组件交互已验证：五个执行人选项保持不变，选择360°后显示同步，分配统计显示真实接口结果而非规则条数；无页面异常。独立截图 `../../ui-blueprints/CR-005-T04-implemented-calibration-role-linkage.png`。浏览器使用实际Vue组件与受控接口夹具，不冒充真实登录→业务库的全链路验收。
- CR-005-T02/T04/T06 仍不整卡勾选：指标实例授权、360°生命周期、历史项目过渡及全量真实登录验收不在本轮交付；生产发布另行批准。上线顺序为先执行0274迁移，再更新后端与前端；停止本轮能力应停止新项目启动而非删除历史任务。

## 2026-10-29 执行人判据统一收敛（CR-005-T02 运行时消费）

### 症状与根因

绩效前台「绩效评估 → 我的绩效 → 员工自评」在评估型环节执行人设为「被评估人」时，主区域渲染为成员列表/矩阵分析/统计报表表格，与「填写工作总结」的表单逻辑不一致。

根因是运行期存在三套判据：模板配置与内容设置读 `executor_role_code`，项目启动派发、完成度统计、评估页分类、催办权限、字段可见性读 `executor_types`，评估页渲染与工作台待办读 `task_kind`。`task_kind='evaluation'` 同时表示「自评」和「评估他人」，渲染层无法区分，自评因此进入评估他人的成员工作区。

### 统一契约

- 唯一角色判据：`executor_role_code`。后端 `assessment_roles.node_role_code()` 与前端 `performanceExecutorOptions.nodeRoleCode()` 为同构实现，解析顺序为角色码 → 固定环节类型（工作总结/360 邀请/结果查看=被评估人，校准=校准人）→ `executor_types` 回退。所有下游只调用该函数，不再自行解释标签或类型。
- `executor_types` 降级为执行细节：实线上级取哪几级、结果复议取 HRBP 还是指定人员；不得用于角色分类。
- `task_kind` 只决定任务表单入口（`evaluation`/`calibration` → template-task，`work_summary` → self-summary），不参与角色判断。
- 结果复议处理节点没有评估角色码，保持按 `executor_types`（HRBP）与 `executor_config.roles`（指定人员）解析处理人；指定人员现在会实际生成任务，此前只解析 HRBP。

### 消费点

| 层 | 位置 | 收敛后判据 |
| --- | --- | --- |
| 模板保存归一 | `template_workflow_service.normalize_workflow_nodes` | 角色码，评估型节点不再按中文标签回写类型 |
| 项目启动/补建派发 | `project_service._resolve_node_handlers` | 角色码；实线上级按级别链、项目上级按周期映射、虚线/360/指标评价人保持空范围、复议按 HRBP/指定人员 |
| 项目上级校验 | `project_service` 启动/补建 | `node_role_code == assessment.project_manager` |
| 完成度统计 | `projects_router._completion_node_key` | 角色码：被评估人=自评，360=360 反馈，管理者=上级评估 |
| 评估页分类 | `projects_router._review_node_category` | 角色码：被评估人→我的绩效，360/指标评价人→给他人的评估，管理者→我团队的绩效 |
| 参考内容催办 | `projects_router._reference_tabs` | 管理者角色码或校准环节 |
| 字段可见性 | `subject_visibility_service.resolve_subject_visibility_role` | 角色码映射七种评估身份，HRBP 按执行类型兜底 |
| 工作台待办 | `projects_router.workbench_tasks` + `Workbench.todoHref` | 返回角色码；自评直达 template-task 表单 |
| 评估页渲染 | `PerformanceReviewContent` / `Review` | 评估型环节且非被评估人才进入成员工作区；自评走表单卡与只读表单 |
| 模板显示 | 模板流程设置、模板内容设置 | 角色码判断实线上级，标签仅展示 |

### 覆盖角色与环节

- 角色：被评估人、实线上级、虚线上级、直属项目上级、360°评估人、校准人、指标评价人，以及结果复议的 HRBP/指定人员。
- 环节：工作总结、评估型（自评/360/管理者/指标评价人）、360 邀请、360 确认、校准、结果沟通、结果查看、结果复议处理。

### 变更文件

- 后端：`app/performance/assessment_roles.py`、`project_service.py`、`projects_router.py`、`subject_visibility_service.py`、`template_workflow_service.py`、`tests/test_performance_projects.py`。
- 前端：`api/performance.ts`、`components/performance/performanceExecutorOptions.ts`、`PerformanceReviewContent.vue`、`views/performance/Review.vue`、`Workbench.vue`、`PerformanceTemplateContentSettings.vue`、`PerformanceTemplateWorkflowSettings.vue`、`Review.spec.ts`。

### 验证记录（2026-10-29，本地开发环境）

- 后端 `pytest tests/test_performance_*.py`：853 passed / 38 skipped / 3 failed。3 项失败在未应用本轮改动的 HEAD 版本上同样失败：`test_performance_cycles.py` 两项因本地花名册缺 `standard_position` 列返回 503，`test_rescheduled_project_overview_and_timeline_read_current_settings` 期望 `pending` 但既有实现返回 `in_progress`；均非本轮引入，未修改。
- 模板工作流 229/229、项目 289/289（除上述既有失败）通过；角色配置、对象授权、功能授权、身份上下文、快照、可见性、逾期策略 67 passed / 1 skipped。
- 前端 `vue-tsc --noEmit` 通过；`Review.spec.ts` 22/22、`PerformanceTemplateWorkflowSettings.spec.ts` 54/54、项目/模板内容等定向 spec 通过；新增两条断言覆盖「自评不进成员工作区」与「管理者评估仍进成员工作区」。
- 已确认既有遗留 `.spec.js` 文件失败与本轮无关：同一组文件在未应用前端改动的 HEAD 版本上失败数相同。
- 未完成：真实浏览器登录 → 项目 → 评估页端到端截图验收；生产部署。不得据本地测试声称生产已生效。

## 2026-10-30 360° 邀请节点生命周期（CR-005-T05 邀请/删除 API 部分）

本节记录 360° 邀请列表/邀请/撤销的首轮实现与本地验收，不表示 CR-005 整卡完成；周期三开关、匿名评估、智能推荐与生产部署均不在本轮。

### 契约与边界

- 邀请增量不再写锁定授权快照：数据库触发器 `trg_performance_dynamic_identities_locked_guard` 禁止锁定快照变更动态身份，实现改为"项目 + 360°评估节点 + 被评估人 + 处理人"的 `PerformanceNodeTask` 作为可操作事实，`REVIEWER_360_INVITED/REVOKED` 审计事件保留来源与生命周期，符合"邀请增量独立于锁定人员关系、不解除快照全表保护"。
- 邀请节点按稳定角色码定位：只选择 `node_role_code == assessment.reviewer_360` 的 evaluation 节点，不再取项目内第一个 evaluation 节点；未配置时邀请/撤销返回 409 `REVIEWER_360_NODE_NOT_CONFIGURED`。
- 调用者必须是当前项目成员快照中的被评估人员工编号；无员工身份映射 403 `EMPLOYEE_IDENTITY_REQUIRED`，非本项目成员 403 `PROJECT_MEMBER_REQUIRED`。
- 候选人范围按节点 `invite_executor_scope = ALL` 从锁定周期快照全员取数，排除被评估人本人与离职人员（优先 `live_employment_status`）；不再错误限制为本项目成员。
- 上限：`maximum_invite_mode = LIMIT` 时提交超量返回 422 `INVITE_LIMIT_REACHED`；`exclude_default_invite_from_limit` 控制默认邀请是否占用额度；列表返回 `second_prompt_enabled/second_prompt_count/second_prompt_mode` 供提示，额度边界由后端强制。
- 默认邀请：项目启动事务内按冻结快照 `direct_supervisor_employee_no` 为每个被评估人创建直属下属的 360° 评估任务，同时写 `source_type=DEFAULT` 审计；不写动态身份表，不改变既有任务生成规则。
- 撤销：草稿（未提交）任务删除并撤销可操作权；已提交返回 409 `INVITE_ALREADY_COMPLETED`，保留评价与审计；重复撤销 404。
- 来源三类由审计事件区分：自己邀请（来源操作人=被评估人）、系统默认邀请（`source_type=DEFAULT`）、自愿评估（其他来源）；事件按 `project_id` 重放，避免同周期多项目串数据。
- 前端：邀请列表直接挂入 `Review.vue` 节点内容区（`PerformanceReviewContent.vue` 在 `node_type == reviewer_360_invite` 时渲染），复用 `PerformanceListToolbar/PerformanceButton/PerformanceDrawerShell/ProjectMemberColumnDrawer` 与表格五件套，不新增页面、不新建表格组件。

### 代码与 API

- 新增 `backend/app/performance/review_360_invites_router.py`：`GET/POST /api/v1/performance/review-360/invites/projects/{project_id}`、`GET .../candidates`、`DELETE .../{employee_no}`；已在 `main.py` 挂载。
- 修改 `backend/app/performance/project_service.py`：项目启动事务补默认直属下属邀请任务与 `DEFAULT` 审计。
- 前端新增 `components/performance/PerformanceReview360InvitePanel.vue`，修改 `api/performance.ts` 与 `PerformanceReviewContent.vue`。
- 未改数据库 schema、未新增迁移、未放宽任何触发器。

### 验证记录（2026-10-30，本地开发环境）

- 本地开发库新建测试周期（IMMEDIATE 锁定）与项目：默认邀请生成 26 个评估任务与 26 条 `DEFAULT` 审计；被评估人列表返回 26 条「系统默认邀请」，上限/二次提示字段回读正确。
- API 实测：手动邀请 4 人 → 3 成功 1 超限拒绝（默认邀请已排除额度）；再邀 1 人 → 422 `INVITE_LIMIT_REACHED`；列表 26 默认 + 3 自己邀请；撤销一条默认邀请 → 任务删除、列表 25+3、重复撤销 404；被邀请人 `review/overview` 在「给他人的评估」出现该节点与任务，模板任务详情 200 且 `executor_role_code=assessment.reviewer_360`，撤销后详情 404。
- 早前同链路另测：来源「自己邀请」、候选人 618 人（周期全员减本人）、项目间列表隔离、`reviewer_360_invite` 节点被评估人可见。
- 后端定向回归 `tests/test_performance_projects.py`、`tests/test_performance_snapshot_service.py`：314 passed / 5 skipped。
- 前端 `npm run build`（含 `vue-tsc --noEmit`）通过（仅第三方 Rollup 注释警告）。
- 验收临时数据已清理；不可变审计事件按系统约束保留在本地开发库。本地模板 77 的脏标签按原值恢复，未作为代码修复。
- 未完成：真实浏览器登录→页面→API 截图验收；生产部署；周期三开关与匿名评估；智能推荐按用户决定不做。

## 2026-10-30 评估人侧「360°反馈（自愿评估）」列表与自愿评估（CR-005-T05 补充）

生产模板没有独立 360 邀请节点，只有 360°评估节点 + 「允许自愿评估」开关；REA 复核飞书页面后，本轮补齐评估人侧列表与自愿评估发起，邀请节点流程保持不变。

### REA 证据（飞书 360°反馈页，2026-10-30 复核）

- 页面标题「360°反馈（自愿评估）」，右上「自愿评估」按钮；搜索成员、筛选、「N 个结果」、「1 列被隐藏」。
- 表格列：姓名、360° 评估状态、评估类型、360° 评估关系、360° 评估截止时间、序列。
- 空态文案：「暂无 360˚ 评估邀请，可以自愿评估其他同事」。
- 「自愿评估」对话框：说明「你可以自愿评估其他同事，为 Ta 本次绩效提供更加全面的 360˚ 评估信息」、搜索「搜索要评估的同事」、按钮「前往评估」「取消」。

### 实现

- 新增 `backend/app/performance/review_360_feedback_router.py`：
  - `GET /api/v1/performance/review-360/feedback/projects/{project_id}`：当前员工在该项目 360° 节点上的评估任务（含评估类型、360° 评估关系、截止时间）。
  - `GET .../candidates`：本项目的被评估人（排除本人、离职），供对话框搜索。
  - `POST .../voluntary`：为当前员工创建一条评估任务（handler=本人、target=选定同事），写 `REVIEWER_360_VOLUNTEERED` 审计（source_type=VOLUNTARY）；重复发起幂等返回已有任务。
- 约束：必须为周期成员且可映射员工号；节点必须为 `assessment.reviewer_360`；`allow_voluntary_evaluation` 未开启 403；节点未开始 409；已截止且未开启「逾期自愿评估」409；不能评估自己 400；目标必须在本项目被评估人中。
- 自愿评估不占用被评估人的邀请名额，不写锁定快照，不影响邀请/默认邀请账目。
- 修正：邀请设置按 360°评估节点读取（与项目流程设置 UI 的 `first360NodeKey` 一致），不再依赖“第一个带 invite 的节点”。
- 前端新增 `PerformanceReview360FeedbackPanel.vue`，在 `PerformanceReviewContent` 的 360°评估节点优先渲染；点击行或「前往评估」复用现有模板任务路由打开评估表单。

### 验证（本地开发环境，2026-10-30）

- 评估人（非被评估人）列表初始为空且 `allow_voluntary_evaluation=true`；候选人仅返回本项目被评估人。
- 自愿评估发起成功（task 813），列表回读 1 条：状态待评估、评估类型「自愿评估」、关系「同事」、截止时间正确；重复发起返回同一任务。
- 自我评估返回 400 `CANNOT_EVALUATE_SELF`；该任务出现在评估人 overview 的「给他人的评估」节点。
- 被评估人邀请列表无自愿评估记录；在已存在自愿评估的情况下，手动邀请仍按 3 人额度成功，撤销正常，证明不占用邀请名额。
- 后端 `tests/test_performance_projects.py`、`tests/test_performance_snapshot_service.py` 314 passed / 5 skipped；前端 `npm run build` 通过。
- 临时验收数据已清理（不可变审计事件保留）；本地模板 77 脏标签按原值恢复。
- 未完成：真实浏览器登录截图验收、生产部署、匿名评估与周期三开关。

## 2026-10-30 成员表与 360°反馈表对齐飞书表格规范

REA 复核飞书成员列表（evidence `ev_e7649ce…6895b`）：406 个结果、每页 50 行、9 页；分页为「上一页 + 页码 + 下一页 | 50 条/页 | 跳至 N 页」；表头 `position: sticky; top: 20px` 随页面滚动，没有表格内纵向滚动条；横向滚动条隐藏；左侧勾选列与姓名列固定。

### 改动

- `PerformanceManagementTable`：
  - 新增 `scroll-mode`（`inner` 默认 / `page`）：`page` 模式取消 `max-height`，表头 sticky 到滚动容器顶部，隐藏纵向/横向滚动条（保留滚动能力），`el-table` 与 inner-wrapper 改为可见溢出；
  - 分页改为飞书样式：上一页/页码（7 页以上省略号）/下一页 + 每页条数 + 跳至 N 页，移除“共 N 条”文案。
- `ProjectMemberListPanel`：成员表使用 `scroll-mode="page"`；勾选列改为 el-table 真实多选（含全选）；姓名列固定左侧（224px）；移除卡片 `overflow:hidden` 以免破坏 sticky。
- `PerformanceReview360FeedbackPanel`：启用同一公共表格分页（本地分页、每页 50），排序改为整表排序后切页；成员表与 360 表使用同一表格组件与分页形态。
- 配套更新 `ReviewRuleTable.spec.ts` / `ReviewQuestionTable.spec.ts` 的分页断言。

### 验证（本地，2026-10-30）

- `vue-tsc --noEmit` 与 `npm run build` 通过；
- 绩效模块 `.spec.ts` 132 个文件、1058 项测试中 1057 通过；唯一失败为 `PerformanceSegmentedControl` 的分段控件颜色断言（与本轮表格改动无关）。
- 未完成：部署后的真实浏览器视觉验收（表头吸附、滚动条隐藏、50 行分页）。

### 2026-10-30 补充：列宽标准、sticky 与滚动条

- 新增 `performanceTableColumns.ts`：按飞书采集值统一列宽（选择 40、姓名 224、评级/评估率/状态/类型/关系/直属上级 144、序列 104、职级 124、入职日期 134、部门 224、截止时间 168），成员表与 360 表共用；
- 公共表格新增 `fit` 开关（默认 true 兼容既有页面），成员表与 360 表传 `fit=false`，列宽固定、容器不足时横向滚动；
- `page` 模式只隐藏纵向滚动条，保留横向滚动条；
- sticky 表头增加非 scoped 兜底规则，解除 `.el-table`/`.el-table__inner-wrapper` 的 overflow 限制，表头相对内容区吸附；
- 验证：`vue-tsc`、`npm run build` 通过；绩效 `.spec.ts` 1055/1058 通过，3 项失败为并行会话的 token/CSS 断言（PerformanceSegmentedControl、PerformanceReferenceContentDrawer、PerformanceTemplateManagement），与本轮表格改动无关。
- 未完成：部署后的真实浏览器视觉验收。

### 2026-10-30 补充二：表头吸附（方案 B）与排序表头细节

- 根因：表头 sticky 与 `PerformanceLineTabs` 的 sticky 标签栏在同一滚动容器内，标签栏 `z-index:30`、吸附后覆盖滚动区顶部约 40px，表头 `z-index:3` 被完全遮住；
- 方案 B：移除项目管理页与评估工作区标签栏的 `sticky`（标签栏随内容滚动），与飞书“导航不在滚动容器内”结构一致；
- 表格 page 模式表头吸附位置改为 `top:20px`、`z-index:20`，并加底部 1px 分隔阴影；
- 表头单元格增加 hover 背景 `#f5f6f7`；
- `PerformanceSortHeader` 改为 inline-flex，排序箭头紧跟文字（8px），不再 `space-between` 拉开；箭头区域增加提示：未排序「点击降序」、降序「点击升序」、升序「取消排序」；
- 同步更新 ProjectManagement/Review 的 sticky 断言；
- 验证：`vue-tsc`、`npm run build` 通过；绩效 `.spec.ts` 1054/1058 通过，4 项失败均为并行会话的 token/弹窗断言，与本轮表格改动无关。

### 2026-10-30 补充三：sticky 遮罩、勾选框对齐与批量操作条

REA 复核（evidence `ev_d4d7e379…351d8`、`ev_7efd3ae7…35a3`）确认飞书实现：

- 表头之上有 `position: sticky; top:0; z-index:19; height:20px; background:#fff` 的白色遮罩，盖住表头与顶部之间 20px 缝隙；
- 表头与表体勾选框同在 12px 内边距下对齐；表头勾选框为全选/半选状态；
- 勾选后底部出现操作条：`授权他人处理`、`转交他人处理`（outlined primary）、`已选择 N 条`、`清除`（text），位于分页之后，间距 30px；
- 选中行整行浅灰高亮。

实现：公共表格 page 模式增加 sticky 遮罩；修正表头 `th` 双重内边距（12+12）为单层 12，勾选框与表头文字对齐；新增 `showSelectionBar` 与 `#selection-actions` 插槽，成员表提供两个操作按钮（本轮不接业务逻辑），`清除` 调用 el-table `clearSelection`；新增选中行高亮。

验证：`vue-tsc`、`npm run build` 通过；绩效 `.spec.ts` 1054/1058 通过，4 项失败为并行会话的 token/弹窗断言，与表格无关。

### 2026-10-30 补充四：按飞书结构修正遮罩、勾选框与操作条

实测（用户页面脚本）暴露三处与飞书结构不一致：

- 遮罩位于表格内部（汇总/工具栏之下），滚动时工具栏与汇总先进入 0–20px 带，遮罩尚未吸附，导致内容漏出；
- 表头与行内勾选框水平相差 12px（Element Plus 选择列盒模型与自定义 padding 叠加）；
- 批量操作条位于文档流末尾，需要滚动到底部才出现。

按飞书结构调整：

- 遮罩移到卡片第一个子元素，`sticky top:0; z-index:19; height:20px; margin:0 -20px`，全宽覆盖卡片顶部；卡片上内边距改为 0，由遮罩提供 20px 顶部空间（成员表与 360 表一致）；
- 选择列 th/td 统一盒模型：单元格 padding 归零，`.cell` 左内边距 12px（`!important`），复选框 margin 0，表头与行内勾选框同起点；
- 批量操作条改为 `position: sticky; bottom: 0; z-index: 21`，勾选后从内容区底部吸附滑出（带 0.2s 位移动画），不需要滚动到表格末尾。

验证：`vue-tsc`、`npm run build` 通过；ProjectManagement/Review 相关 40 项测试通过。

### 2026-10-30 补充五：page 模式改为飞书同构原生表格

为避免 Element Plus 内部结构导致的反复偏差，`PerformanceManagementTable` 的 `scroll-mode="page"` 在传入 `columns` 时改用飞书同构实现，不再使用 el-table：

- 表头与表体为两张独立 table，表头 `position: sticky; top: 20px; z-index: 20`，位于卡片顶部的 20px sticky 白色遮罩之下；
- 选择列为自绘复选框（复用 `PerformanceCheckbox` 的 UD 结构），表头全选/半选、行内单选，表头与行内同盒模型（单元格 12px 内边距），天然对齐；
- 列宽来自 `performanceTableColumns` 标准（40/224/144/144/104/124/134/224），固定姓名列用 sticky left，表体横向滚动、表头 JS 同步；
- 排序表头复用 `PerformanceSortHeader`（箭头紧贴文字、hover、状态提示）；
- 批量操作条 `sticky bottom:0`，全宽覆盖卡片内边距，勾选后滑出；
- 行点击、空态插槽、分页（页码/跳页/条页）保持原有契约。

成员表与 360°反馈表均改为传 `columns` + `#cell` 插槽；其他 15 个使用方仍走原 el-table 分支（inner 模式），不受影响。

验证：`vue-tsc`、`npm run build` 通过；ProjectManagement/Review 40 项通过；绩效 `.spec.ts` 1054/1058 通过（4 项为并行会话 token/弹窗断言）。

### 2026-10-30 补充六：按需横向滚动条、固定操作条与气泡提示

- 横向滚动条改为飞书式：隐藏原生滚动条（`scrollbar-width:none` + `::-webkit-scrollbar`），在表格底部提供自定义横滚条，悬停/滚动时出现、空闲 1 秒淡出，支持拖动与点击轨道，并随页面吸附在可视区底部；选中操作条出现时上移避让；
- 批量操作条改为 `position: fixed`，按表格内容区左右边界计算 left/right，底部滑入，表格内留 30px 占位；
- 排序提示改为 Teleport 到 body 的深色气泡 tooltip（未排序「点击降序」、降序「点击升序」、升序「取消排序」）；
- 排序箭头激活色按实测改为 `#646a73`，未激活暂用 `#BBBFC4`（待飞书实测确认）；
- 验证：`vue-tsc`、`npm run build` 通过；SortHeader/ProjectManagement/Review 42 项通过。

### 2026-10-30 补充七：sticky 吸附基准与弹窗宽度

- 实测：滚动容器 `padding-top:20px`，sticky 偏移相对内容区计算，遮罩停在与可视区顶部相差 20px 处，造成 20px 缝隙；已改为遮罩 `top: calc(-1 * 容器padding)`、表头 `top: calc(20px - 容器padding)`，通过 `--performance-table-container-padding` 变量在成员表与 360 表传递；
- 批量操作条右侧曾用 `window.innerWidth`（含滚动条宽度），比卡片窄约 17px；改为读取卡片 `getBoundingClientRect` + `document.documentElement.clientWidth`，并用 ResizeObserver 监听卡片与表格根节点，弹窗宽度始终与白色容器一致。

### 2026-10-31 补充：表格宽度、表头分隔线与选中态对齐飞书

按 REA 采集（成员表表体 `width:max-content;min-width:100%`，表头 `table-layout:fixed`，表头容器无阴影、单元格有下边框，选中行无底色）：

- 表头与表体均改为 `width:100%; min-width: <列宽和>`，大屏自动铺满，窄屏按列宽横向滚动，两表同布局保持列对齐；
- 表头容器去掉 `box-shadow`，仅保留单元格 `border-bottom`；新增表头 `border-top`，还原「N 个结果」与表头之间的分隔线；
- 移除选中行常驻底色（保留选中类名，与飞书 `ud__table-row-selected` 一致），补充行 hover `#f5f6f7`（固定列同步生效）；el-table 分支同步移除选中底色。
- 验证：`vue-tsc`、`npm run build` 通过；ProjectManagement/Review 40 项通过。

### 2026-10-31 补充：工具栏搜索框拉伸与间距对齐

飞书成员列表工具栏为「搜索 flex-1 + 筛选/导出固定宽靠右，间距 12px」，整行与表格内容左右对齐。

- `PerformanceListToolbar` 新增 `gap` 属性（默认 8，其他页面不变）；
- 成员表与 360 表工具栏改为 `search-fill` + `search-width="100%"`、`gap=12`，搜索框拉伸填满，筛选/导出靠右并随卡片宽度对齐；
- 移除 `ProjectMemberListPanel` 的 `searchWidth` 属性及评审页传入的 `calc(100% - 88px)`，两种模式共用同一套拉伸逻辑。
- 验证：`vue-tsc`、`npm run build` 通过；ListToolbar/ProjectManagement/Review 41 项通过。

### 2026-10-31 补充：行光标与飞书一致

飞书采集到每个数据行都带 `cursor-pointer`（`basic-table-row cursor-pointer`），姓名列员工卡片继承该光标。原生表格行改为始终 `cursor: pointer`（项目管理与绩效评估一致），行点击行为不变。

### 2026-10-31 补充：搜索框激活态与聚焦色 token

飞书实测（聚焦搜索框）：`borderColor: rgb(208,211,214)`（#D0D3D6）、`boxShadow: none`、`borderRadius: 6px`，即搜索框聚焦不变色、不加外圈。

- `PerformanceSearchInput` 聚焦改为保持默认边框、`box-shadow: none`，与飞书一致；
- 全局 `--performance-control-focus-border` 由 `#336df4`（不在飞书采集色板内）改为 `var(--color-primary)`（#3370FF），其他下拉/输入控件的聚焦边框随之对齐。
- 验证：`vue-tsc`、`npm run build` 通过；ListToolbar/ProjectManagement/Review 41 项通过。
