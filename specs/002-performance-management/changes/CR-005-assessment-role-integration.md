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
- 未完成：项目上级导入 UI 与并发/隔离库验收、指标实例级绑定与授权、校准阶段规则物化、360 邀请增删 API/周期三开关及评价时窗核验、现用模板任务读写统一对象级授权、旧历史项目任务过渡。当前的七个 `assessment.*` 稳定码只在目录查询和排除静态后台授权中使用；运行时任务尚未消费这些目录码，因此**不能声称七角色统一授权已接通**。
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
