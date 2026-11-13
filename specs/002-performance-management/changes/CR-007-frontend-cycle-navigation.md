# CR-007 绩效前台周期联动与任务菜单

- 状态：本地开发与定向验收完成；未部署
- 关联：CR-005 评估角色统一接入、REQ-UI-001、REQ-UI-002
- 确认日期：2026-10-30

## 1. 目标与边界

绩效前台“工作台、绩效评估、项目管理”共用一个周期上下文。系统默认选择当前用户有关的最近周期；任一页面切换周期后，其余页面同步使用该周期，并按所选周期重新计算可见 Tab 和绩效评估菜单。

本轮保留项目管理 Tab 的“周期概览＋项目名称”结构；不实现同周期多个项目菜单是否合并的配置，不调整管理角色/评估角色分类，不重建已启动项目任务，不增加数据库结构。

## 2. 角色与数据来源

- 绩效评估资格：所选周期内当前用户的真实节点任务；任务已经生成但未到开始时间仍算有效，已完成任务保留回看入口。
- 自愿 360 资格：项目模板存在执行人为 `assessment.reviewer_360` 的评估型环节，且项目 360°设置开启 `allow_voluntary_evaluation` 时，周期项目人员获得该环节资格；与普通任务使用同一菜单输出，不作为前端例外。
- 项目管理员：复用已启用的管理角色 `performance.project_admin`，并要求当前用户是所选周期具体项目配置的管理员。
- HRBP：复用已启用的管理角色 `performance.hrbp`；实际授权只读取“周期与项目 → 设置 → HRBP 权限”中的周期权限与范围。
- `performance.cycles.manage`、后台管理员预览和“直属项目上级”不替代项目管理员/HRBP前台身份，不据此显示项目管理 Tab。

## 3. 显示规则

1. 相关周期是至少满足以下一项的已启动周期：存在本人绩效评估资格、本人是项目管理员、本人有该周期有效 HRBP 权限。
2. 默认周期按周期开始时间降序、周期 ID 降序选择；不是按项目更新时间选择。
3. 工作台始终显示并承担周期切换兜底。
4. 当前周期存在至少一个可显示评估子菜单时显示“绩效评估”Tab；否则隐藏。
5. 当前周期存在项目管理员或有效 HRBP 管理资格时显示“项目管理”Tab；否则隐藏。
6. 切换周期后当前 Tab 不再可见时，回到工作台；切换入口不能因目标 Tab 隐藏而消失。
7. 绩效评估子菜单由任务资格生成；子菜单名称读取模板流程环节名称，未开始任务显示“未开始”。
8. 没有子菜单的“我的绩效、给他人的评估、我团队的绩效、其他事项”父菜单不返回、不展示。
9. 结果复议只有存在真实申诉处理关联时显示；仓库尚无申诉提交/关联模型和接口，本轮不以项目启动时预生成的占位任务提前显示，不扩建申诉生命周期。
10. 项目管理 Tab 保留周期概览和项目名称导航，不改为流程环节菜单。

## 4. 接口契约

### `GET /api/v1/performance/navigation`

请求：可选 `cycle_id`。不传时选择最近相关周期；传入无关周期返回 `404 CYCLE_NOT_FOUND`。

响应：

```json
{
  "cycles": [{"cycle_id": 1, "cycle_name": "2026周期", "cycle_start_at": "...", "cycle_end_at": "..."}],
  "active_cycle": {"cycle_id": 1, "cycle_name": "2026周期", "cycle_start_at": "...", "cycle_end_at": "..."},
  "can_review": true,
  "can_manage": false,
  "review_projects": [{"project_id": 10, "project_name": "项目A", "cycle_name": "2026周期", "cycle_start_at": "...", "cycle_end_at": "..."}]
}
```

`can_review` 与绩效评估 overview 使用同一资格解析器；`can_manage` 与项目管理 overview 使用同一管理资格解析器，禁止各入口自行解释角色。

兼容调整：

- `GET /performance/review/overview` 增加可选 `cycle_id`；显式周期和项目必须匹配，项目列表保持所选周期内全部有评估资格项目。
- `GET /performance/workbench/projects` 增加可选 `cycle_id`，仅返回所选周期内当前用户相关项目。
- `GET /performance/project-management/overview` 继续接收 `cycle_id`；当前用户在该周期无管理资格时拒绝，项目和人员范围沿用既有数据范围。

## 5. 前端交互

- 共享状态保存 `activeCycleId`，本地只记周期，不再把项目 ID 当作全局周期上下文。
- 任一周期选择器调用同一导航接口更新共享上下文；周期改变时清理旧周期项目、overview和任务缓存。
- 工作台、绩效评估、项目管理的周期选择器使用同一周期列表和当前值；周期内多个项目仍按页面既有项目选择交互隔离。
- 导航加载期间只展示工作台，避免旧周期权限闪现；导航失败清空旧权限，不继续显示受保护 Tab。
- 保留现有布局、组件和视觉样式；属于既有筛选/权限修正，不新增页面或信息架构，因此无需新蓝图。

## 6. 原子任务

- [x] CR-007-T01 后端周期导航与资格统一
  - 允许：绩效项目路由/最小共享解析器及既有项目测试。
  - 禁止：模型、迁移、角色分类、历史任务重建和生产数据。
  - 验收：最近相关周期、未来/已完成任务、自愿360、项目管理员、HRBP允许与拒绝、空父菜单、无关周期404。
- [x] CR-007-T02 前端共享周期与动态导航
  - 允许：绩效API DTO、共享前台状态、PerformanceLayout、三个既有Tab页面、共享侧栏及既有测试。
  - 禁止：路由信息架构、后台角色配置、项目管理导航结构、UCP和外部系统。
  - 验收：三处选择联动、切换后Tab动态显示、无权限回工作台、空父菜单隐藏、刷新回读、加载和失败不沿用旧权限。
  - 证据：前端5文件53项通过；实际浏览器验证评估/管理周期切换、未开始任务、非空父菜单、工作台回退和项目管理原导航，无pageerror。
- [x] CR-007-T03 回归与UI证据
  - 后端：`python -m pytest hr-portal/backend/tests/test_performance_projects.py -q --tb=short` → 296 passed、4 skipped、1条第三方弃用警告。
  - 前端：5个定向文件53项通过；`npm --prefix hr-portal/frontend run build` → vue-tsc + Vite退出0（仅既有VueUse PURE注释警告）。
  - 截图：`CR-007-T02-implemented-task-menus.png`、`CR-007-T02-implemented-management-cycle.png`、`CR-007-T03-implemented-cycle-review-tabs.png`、`CR-007-T03-implemented-cycle-management-tabs.png`。
  - 未执行：真实生产认证/数据库回读、部署、commit或push；无数据库迁移。

任务只有在代码、定向回归、构建和实际UI证据齐全后才能勾选。

## 6.1 工作台入口纠偏（2026-11-09，CR-007-F07）

用户确认工作台入口统一按以下规则处理：

- 我的待办“待完成”和“已完成”均只跳转到绩效评估中对应的流程子菜单，不直接打开工作总结、自评、评估填写页、编辑页或人员详情。
- 工作台待办跳转保留当前周期、项目和真实节点 ID；不得重复拼接已包含查询参数的后端 action URL，目标节点不存在或无权时不得静默回退到工作总结或首个节点。
- 快捷入口“我的绩效结果”及工作台结果卡均进入“绩效评估 → 查看绩效结果”，复用结果子菜单的只读展示、未开通/无权限拒绝态和复议入口。
- 评估页内部既有“去完成”、已完成只读抽屉、编辑确认、分享链接和身份切换能力不在本次入口修复范围内。

- [x] CR-007-F07 工作台待办与结果入口纠偏（本地实现与定向验收；未部署）
  - 实现：`hr-portal/frontend/src/views/performance/Workbench.vue`、`Review.vue`；仅统一工作台入口、结果节点解析/只读展示及异步旧响应丢弃。不修改后端、数据模型、迁移、任务权限或任务执行工作区。
  - 测试：`npm --prefix hr-portal/frontend test -- src/views/performance/Workbench.spec.ts src/views/performance/Review.spec.ts src/components/performance/PerformanceReviewEvaluationDrawer.spec.ts src/router/performanceTaskRoutes.spec.ts --pool=threads --poolOptions.threads.singleThread=true --silent` → 4文件96 passed，exit 0。覆盖11类节点两种待办状态、重复查询参数防回归、结果快捷入口/直接子菜单、无结果菜单/无项目权限/结果未开通/空态、跨周期链接、旧项目结果响应丢弃，以及原填写/抽屉/分享回归。
  - 构建：`npm --prefix hr-portal/frontend run build` → vue-tsc + Vite exit 0；既有VueUse PURE注释警告。本次文件 `git diff --check` 通过，仅LF/CRLF提示。
  - 浏览器：Chrome headless、1440×900、真实Vue路由、全部API响应隔离；待完成/已完成共18次入口点击均到准确项目/周期/节点；结果子菜单正常与拒绝态、刷新、前进后退通过。pageerror 0，业务写请求0；360邀请组件另有2次未覆盖的隔离GET返回404，只验证邀请子菜单定位，不宣称邀请业务API验收。
  - UI证据：`ui-blueprints/CR-007-F07-implemented-results-submenu-20261109.png`、`ui-blueprints/CR-007-F07-implemented-results-denied-20261109.png`，已查看，均为合成验收数据，不是生产结果或像素级对齐证明。属于既有入口修复，无新蓝图。
  - 未运行：真实鉴权API/数据库回读、后端套件、全量前端套件、部署或真实外部投递；无数据库变更，不适用迁移验收。代码按用户后续指令提交并推送 main；推送不代表部署或生产验收。

## 7. 风险与停止方式

- 现有工作台和评估页面仍以项目承载具体内容；本轮只统一周期选择，不推断跨项目菜单合并规则。
- 复议生命周期缺失是已知范围边界；不能用占位任务冒充真实复议。
- 停止本轮能力时，仅回退导航接口、共享周期状态和三个前台页面接入，不整体回滚仓库、删除历史任务或改变角色配置。

## 2026-11-11 开通名单全量展示与原地清选（用户最新确认，替代F08/F11旧名单/刷新规则）

- [ ] CR-007-F12 全名单默认合格全选与开通后留页
  - 规则：GET展示当前权限范围内全部未开通人员；最终结果缺失、非在职、手动开通关闭或时间未到等不合格人员仍列出，但can_open=false且不选/禁选。只有在职、最终结果就绪并满足原资格者默认跨页全选；总览openable_count/POST仍严格合格集，不扩大权限。
  - 在职来源：周期授权快照live_employment_status优先，原employment_status兜底；保留冻结组织/项目名单，不以实时状态重建成员，未知状态不当在职。
  - 交互：确定成功后留在当前名单、不刷新或关闭overlay、不再GET名单/总览、取消勾选；已开通行原地保留并禁选防重复。零accepted不冒充成功，失败保留待重试项；取消确认不写入且保留选择。跨页勾选必须按所选合法employee提交，超过500按既有请求上限分批，部分批失败不重发已确认成功项。
  - 边界：只改projects_router.py开通hunks/test_performance_projects.py、PerformanceReminderPanel.vue/spec、ProjectManagement.vue/spec及本记录；保留其它会话API/任务/报表改动。不改模型/迁移/自动开通/角色权限/通知链，不新文件或脚本，不自动commit/push/生产操作。复用原全局表格/确认弹窗，无新设计/动画。
  - 验收：后端GET全名单/不合格标记、实时离职优先、未知禁选、state=None不500、POST/总览合格一致；前端3行全名单默认只选合格、101跨页/501分批、取消零写、成功无GET/无父页卸载清勾、部分失败重试。现有pytest/Vitest/build及真实Vue路由合成API浏览器覆盖，独立F12 PNG，不将本地mock当生产/真实库/通知验收。
  - 前端最终证据：`npm.cmd --prefix hr-portal/frontend test -- src/components/performance/PerformanceReminderPanel.spec.ts src/components/performance/PerformanceConfirmDialog.spec.ts src/components/performance/performanceReminderVisibility.spec.ts --silent` → 3文件58 passed（43+13+2），类型修复后主线程复跑通过；`npm.cmd --prefix hr-portal/frontend run build` → vue-tsc+Vite exit0、3689模块，仅既有VueUse PURE注释警告。此前构建3个类型错误已最小修复（缓存不写ReminderPerson未定义can_open、测试notification_status字面量as const）。联合ProjectManagement测试100 passed/1 failed，新开通留页集成用例通过，唯一失败是旧报表“模拟数据”断言，未跨改报表。
  - 后端证据：主线程 `hr-portal/backend/.venv/Scripts/python.exe -m pytest hr-portal/backend/tests/test_performance_projects.py -q --tb=short -k result_opening` → 32 passed / 718 deselected / 1第三方python_multipart弃用警告，exit0；718是未选中执行而非skip或通过。后端执行者全文件最近66 failed / 679 passed / 5 skipped，涉及并行结果链改动与旧替身不匹配，未宣称全文件通过。
  - 浏览器证据：真实Vue路由、1440×900、全部API隔离合成数据；3行名单（在职结果就绪/离职/无结果）均显示，初始仅合格行勾选且另2行disabled。取消0次POST并保留选择；确定仅提交合格employee，成功后3行仍在、勾选0、底栏DOM为0、已开通行disabled，名单与总览GET计数均不变，pageerror0。独立PNG `ui-blueprints/CR-007-F12-implemented-default-selection-20261111.png`、`ui-blueprints/CR-007-F12-implemented-stay-and-clear-20261111.png`均已查看。
  - 提交前隔离验证（2026-11-11）：用户明确要求本卡在main提交并推送。按hunk排除并行结果链/校准改动后，直接加载暂存版本projects_router.py及test_performance_projects.py运行完整项目测试 → 745 passed / 5 skipped / 1 anyio预加载警告，exit0；证明待提交本卡版本无需依赖并行结果链补丁。前端专项3文件58 passed复跑通过，ProjectManagement新开通留页用例定向1 passed/42 skipped（按名称筛选未执行），exit0。扩大工作区回归的旧报表失败及并行结果链失败仍按前述保留，不混称全部通过。
  - 状态：本卡本地实现/定向测试/构建及合成UI验证完成；真实数据库/API/生产投递与部署未验收，因此不勾选整体完成。无本卡模型或迁移；本次仅按用户明确指令提交/推送本卡，不部署，不纳入其它会话结果链/校准补丁。

## 2026-11-11 开通结果名单与确认弹窗（本轮用户确认）

- [ ] CR-007-F11 开通名单真实列与全局确认弹窗
  - Goal：原开通名单补齐真实人员/动态评级列，按钮改“开通结果”；不改变开通资格或通知规则。
  - Confirmed UI：默认姓名、绩效评级（按模板动态多列）、360°评估率、直属上级、HRBP、序列、入职日期、所属部门；默认隐藏部门全路径、所属项目、上期职级（用户确认非“上级职级”）、员工类型。字段与派生列服从既有可见权限，列配置、排序和导出共用值解析；不混入催办对象/状态/开通状态列。其它催办与preview模式不变。
  - Dialog：复用PerformanceConfirmDialog全局token；420px壳、24px内边距、24px蓝InfoFilled、16px/600标题、正文14/22、8px上距/40px缩进、56px页脚、80×32按钮。标题“确定开通所选成员的绩效结果吗？”；取消回名单保留勾选且不POST，确定才开通；无新动画/弹窗系统。
  - API：原GET `/performance/cycles/{cycle_id}/result-opening/people`扩items ratings/completion/direct_supervisor/hrbp/job_sequence/hire_date/department/organization_path/previous_position_level/employee_type/visible_profile_fields；顶层rating_columns取合法查询结果动态评级并集、跨页稳定，保留原筛选/分页/权限。复用最终任务评级、周期快照姓名、360计数、上期职级、字段权限；不回实时花名册。
  - Allowed：projects_router.py及test_performance_projects.py、api/performance.ts、PerformanceReminderPanel.vue/spec、performanceReminder.ts、必要PerformanceConfirmDialog.vue/spec；唯一负责人各自写文件。无新模型/迁移/权限/页面，既有小范围调整无需新蓝图。只更新本记录，不新建脚本/报告/测试文档。
  - Tests：现有pytest/Vitest覆盖动态多评级列、分页列稳定、脱敏、默认/隐藏列、取消零写入/确定提交、原开通资格及催办回归；build与真实Vue组件隔离API浏览器验证，独立PNG按CR-007-F11命名。真实DB/投递/生产部署另列未验证，不自动commit/push。
  - 本地证据：`npm.cmd --prefix hr-portal/frontend test -- src/components/performance/PerformanceReminderPanel.spec.ts src/components/performance/PerformanceConfirmDialog.spec.ts src/components/performance/performanceReminderVisibility.spec.ts --silent` → 3文件53 passed；`npm.cmd --prefix hr-portal/frontend run build` → vue-tsc+Vite exit0，3689模块，仅既有VueUse PURE注释警告。扩大至CompletionRatePanel/ProjectManagement共5文件时110 passed/1 failed，唯一失败是既有报表测试仍期待“模拟数据”而报表已接真实加载；已通知并行报表会话，不以此声称扩大回归全通过。
  - 后端证据：`hr-portal/backend/.venv/Scripts/python.exe -m pytest hr-portal/backend/tests/test_performance_projects.py -q --tb=short` → 734 passed / 5 skipped / 1既有python_multipart弃用警告，exit0；开通专项21 passed/718 deselected（执行者报告）。响应model_json_schema与FastAPI app.openapi已覆盖；评级最新已提交/撤销边界、快照姓名/HRBP缺失、字段脱敏/派生隐藏、分页列稳定及空名单无额外资料查询已覆盖。未改POST资格、评级来源或并行报表heatLevels实现。
  - UI证据：本地真实Vue路由、全部API隔离为合成人员，894×631实测弹窗420×180、header124/footer56、padding24、InfoFilled24、标题16px，图标/主按钮rgb(20,86,240)；取消0次POST且保留勾选，确定才1次POST，pageerror0。1440×900名单默认列/动态两评级正确，列设置真实勾选上期职级后显示P5；4个默认隐藏项正确，脱敏字段不进入列抽屉。独立PNG `ui-blueprints/CR-007-F11-implemented-opening-list-20261111.png`及`ui-blueprints/CR-007-F11-implemented-opening-confirm-20261111.png`均已查看；不是生产/真实后端API证据。
  - 边界：本轮改动仅开通相关后端/前端/API类型及既有测试/本记录；保留并行报表改动，不自动提交、推送或部署，无数据库迁移、真实通知/数据库回读。F11保持未勾选，不将本地合成UI或跳过项当作生产验收。

## 2026-11-11 结果开通与复议总览修复（用户已确认实施）

- [ ] CR-007-F08 结果开通权限与可开通人员闭环
  - 规则：独立 `performance.frontend.result-open` 权限、有效项目/人员范围、项目手动开通开启，且至少一名最终结果就绪、未开通并满足原时间条件的人员，才显示去开通；无最终结果人员不入名单。GET/POST/总览同口径，周期管理/进度权限不替代开通权限。
  - 输出：总览 `can_open_result`、`openable_count`；开通完成事件 `results-opened` 刷新总览；名单过滤先于计数/分页。403/空态/异常分开反馈。
- [ ] CR-007-F09 查看结果时间与复议指标/催办
  - 规则：结果查看 `deadline_at=null`，不使用复议申请截止或遗留 end_at；其他环节原时间不变。`reconsidered_count` 是最新成员范围内未撤回申请人数（含已处理、按成员去重），与已开通使用相同人员分母；切换真实数据，不把处理任务份数冒充申请人数，不新增人员明细筛选API。
  - 复议任务统计排除无真实有效申请的孤儿任务；催办要求未关闭/未撤回/未撤销、pending且已开始，GET/POST重校验；沿实际处理人解析、原通知链、六小时去重及投递结果语义。
- [ ] CR-007-F10 催办反馈
  - 规则：确认催办后不重新加载名单；全成功清空勾选，仅一个全局token结果弹窗，无动画/Toast/重复页内提示。部分失败保留失败项，异常保留原选择；preview_only/全跳过不得冒充成功送达。原提交前确认和六小时去重保留。
- 前置与复用：已读Spec002基线、PM-001/PM-T004/PM-T007相关规则、Spec012 UI门禁及执行/验收契约；复用现有总览、人员表、确认弹窗、API、通知及已有测试。既有页面小范围修复，无新页面/蓝图。
- 允许修改：后端 projects_router.py、必要的 navigation_service.py/reconsideration_service.py；前端 api/performance.ts、ProjectManagement.vue、CompletionRatePanel.vue、CompletionNodeCard.vue、PerformanceReminderPanel.vue、必要的 PerformanceConfirmDialog.vue及上述既有测试；各共享文件由单一负责人串行合并。
- 验收：现有 test_performance_projects.py 定向pytest、对应Vitest、统一build、本地真实Vue路由受控合成API验证；覆盖权限允许/拒绝、空结果/manual关闭/未来/已开通/越界、指标切换/孤儿排除、催办不再GET及所有投递状态。独立PNG按F08/F09/F10命名，缺真实库/部署证据不得声称生产验收完成。
- 非范围：不新建脚本/报告/测试文档，不改模型/迁移/权限配置数据/周期快照/生产，不实际外发、commit/push/deploy；保留无关临时文件。停止仅撤销本卡代码diff，不删任务/答案/审计，不整包回滚。主线程核查证据后才勾选。
- 前端证据（2026-11-11）：`npm --prefix hr-portal/frontend run test -- src/components/performance/CompletionRatePanel.spec.ts src/components/performance/PerformanceReminderPanel.spec.ts src/components/performance/PerformanceConfirmDialog.spec.ts src/views/performance/ProjectManagement.spec.ts src/components/performance/performanceReminderVisibility.spec.ts` → 5文件107 passed，exit0；输出既有dropdown/drawer stub警告及一次jsdom XHR AggregateError，不声称无告警。成功/部分失败/失败/异常/preview/skipped均断言不再GET；开通accepted事件、父页卸载不重查、空态/403、权限/零人数隐藏、指标切换与零分母均覆盖。
- UI证据：本地Vite真实Vue路由，1440×900、Chromium，全部 `/api/v1/*` 拦截为隔离合成数据（非生产/真实鉴权API）。总览已开通50%→已复议25%、结果查看截止--、开通后刷新按钮隐藏、复议催办路由通过；无权限/零可开通人数隐藏、名单空态/403通过。催办success清空checkbox且 `.selection-bar` DOM立即为0，failed/preview保留勾选、全跳过清空，四种状态无再GET、单结果弹窗、无页内notice，关闭后body overflow恢复；pageerror均0。首次截图发现共享表格0.2s选择栏离场残留，后用可选 `selectionBarAnimated`（默认true，仅本提醒面板false）修复并重截图。
- 独立实现PNG（均已查看）：`ui-blueprints/CR-007-F08-implemented-opening-capability-20261111.png`、`ui-blueprints/CR-007-F09-implemented-reconsideration-metrics-20261111.png`、`ui-blueprints/CR-007-F10-implemented-reminder-success-20261111.png`。复用既有token/组件，无新页面或动画，不作为像素完全一致、真实后端/数据库/生产验收证明。
- 后端证据（2026-11-11）：`hr-portal/backend/.venv/Scripts/python.exe -m pytest hr-portal/backend/tests/test_performance_projects.py hr-portal/backend/tests/test_performance_reconsideration_lifecycle.py hr-portal/backend/tests/test_performance_auth_context.py hr-portal/backend/tests/test_performance_role_configuration.py hr-portal/backend/tests/test_performance_subject_visibility.py -q --tb=short` → 809 passed / 5 skipped / 1 python_multipart第三方弃用警告，exit0；同轮项目文件单跑716 passed/5 skipped。新增开通候选/名单/POST同口径、隐式管理员独立权限/角色数据管理勾选/重名拒绝、HRBP局部与全局不可见、开通单独权限不泄漏其他进度节点、无结果/已开通/未来/manual关闭/重复成员过滤、真实复议去重和孤儿排除、复议名单与POST撤回/关闭/撤销/无申请拒绝及实际接收人验证。旧四项开通/总览测试替身补新增查询分支；六项communication旧替身补现有成员快照scalars空结果，未改相关业务实现。共享测试文件中的项目时间规则/草稿用例由并行项目设置卡负责，保留其变更。
- 构建：`npm --prefix hr-portal/frontend run build` → vue-tsc + Vite exit0，3686模块，仅既有VueUse PURE注释警告；首次build发现本卡测试mock notification_status非法，已改回现有DTO合法pending_integration后通过。最终前端5文件107项复跑exit0（--silent；此前非静默警告见上）。`py_compile`后端路由通过。本卡逐文件diff检查通过（CRLF提示不作为业务错误），未覆盖其它会话的在途文件。
- 交付边界：F08/F09本地实现、mock后端回归与受控前端交互已验证；真实登录/API/数据库新连接回读、真实外部投递及部署未执行，无模型/迁移变更。不把5个跳过当通过，不宣称生产验收完成；F08/F09整体保持未勾选。F10催办反馈本地组件/路由验收完成，不代表通知真实投递已验收。未commit/push/deploy。

## 8. 项目管理总览、组织完成率与催办增强（2026-11-01，进行中）

用户确认授权查看按飞书参考页跳转为独立页面；要求基于 REA 参数还原组织完成率、模板与节点状态驱动卡片、环节统计提示、默认选中所有可催办项、真实发送及催办专属列。此节不改变第6章已完成任务的历史状态，也不代表本增强已完成验收。

- [ ] CR-007-F01 模板快照完成率与组织树：总览卡片不显示未配置的静态占位；完成率与节点配置来自当前项目冻结节点/成员/任务。组织树按一级至五级部门生成，父级聚合包含子级；支持逐层展开和数值/名称排序。校准完成率按阶段、校准人任务组计数，催办明细按被评估人任务列出。
- [ ] CR-007-F02 共享催办工作区：新增独立催办路由，复用 `PerformanceManagementTable`，而非直接复制成员列表全部列；按参考自定义列面板保留16列、默认10列，派生列继续服从源字段权限。默认遍历当前查询全部分页选取可催办项，无500项静默截断；不可用处理人不选中，失败后保留失败项。
- [ ] CR-007-F03 通知边界：周期催办 API 复用 `send_notification` 和统一飞书通知日志；按真实处理人身份链接解析接收方，禁止按名字或员工号猜登录名。校验当前周期、项目管理范围、最新成员快照、节点、校准阶段和待完成状态。每请求按处理人/节点/阶段去重发送；区分成功、部分成功、失败和跳过。身份切换沿共享通知拦截，不报告为已发送；未向真实员工发送验收消息。
- [ ] CR-007-F04 授权查看页：两个查看按钮分别路由至授权/转交记录、校准授权工作区。2026-11-10用户明确：两页查看不依赖独立任务授权功能，复用原项目管理查看范围；无评估任务授权/转交则成员授权/转交按钮disabled，无校准任务授权则协助/撤销按钮disabled，写接口不借查看权放行，详见PM-001-T11增量。记录查询只消费真实任务授权审计，不将人员静态权限或结果发布转交冒充任务授权记录，也不导入飞书生产人员数据。校准列表读取冻结阶段任务而非伪造“已校准”。本地已实现任务授权/撤销生产者、持久化和处理权限链；本轮补充父授权撤销级联、只读继承和 PostgreSQL 定向持久化验证，但完整真实登录/UI/部署验收仍未完成。
- [ ] CR-007-F05 像素与业务验收：持续以参考页实际CSS像素、视口/DPR和受控Vue路由截图复核，不以构建或单测通过宣称像素完全一致。

### 当前实现和证据

- 主实现：`projects_router.py`、`api/performance.ts`、`ProjectManagement.vue`、`CompletionRatePanel.vue`、`CompletionNodeCard.vue`、`PerformanceManagementTable.vue`、`PerformanceReminderPanel.vue`、`performanceReminder.ts`、现有路由；新增 `ProjectManagementReminder.vue`、`ProjectAuthorizationRecords.vue`、`ProjectCalibrationAuthorization.vue`。
- 不改生产、权限配置、已启动周期快照、历史任务及既有迁移。保留其他未提交删除/临时文件，不做commit/push/deploy。
- 参考证据：组织表 `ev_f57c283cf3aa1f1ba10daaf91406ff60e9a169f1bf779d692ef04c5bdc324442`；授权页 `ev_fbc5e852a71dc69e8f61775e2ed84f77dc2fe99a3fc8961f6758043ca5ae35b4`；上级/校准催办与默认选择 `ev_e8d3e6a36b92cf3eed24973d7125371d31f4949d1b7885544135f62ed7574beb`；16列/默认10列面板 `ev_c2df8bd508d5a4931c31dc87f67dfe25deb093b79024bc39e97d4ece036b7107`。
- CSS只读测量：参考实际CSS视口1280×673、DPR1.5；催办标题18/26、摘要14/22；摘要y102，白卡y140，表头y237.3333；选择列40、姓名224、催办对象184、状态144、360率144、HRBP184、序列104、职级124、日期134、部门224；底栏60px。
- 实现截图：`ui-blueprints/PM-T010-department-implemented-20261101.png`、`ui-blueprints/PM-T010-reminder-implemented-20261101.png`。均为真实Vue路由及隔离API数据，非飞书生产业务数据；已查看。浏览器场景 `ev_e65f11d7a70f48e603a111a9b71582ebde6d54e5b651c846e75e07dd4a74a5a6`、`ev_adbf909b0ecf5b889d84f5d7eae021f922fef6ddcd47833b3263b003871c7361`、`ev_7bad61c5ae4f20109e89c0301fd9f3390bc6ee058834f081d36945c55818d17f`，各阶段动作完成，page-error记录0；完整场景仍带events不完整标识。
- 前端：现有5文件 `CompletionRatePanel.spec.ts`、`PerformanceReminderPanel.spec.ts`、`performanceReminderVisibility.spec.ts`、`ProjectManagement.spec.ts`、`Review.spec.ts` → 92 passed；覆盖组织展开/排序、不同路由、601条跨分页可选项全选、失败保留、现有结果开通/人员预览和评估回归。
- 后端：backend目录 `.venv/Scripts/python.exe -m pytest tests/test_performance_projects.py -q --tb=short` → 359 passed / 4 skipped / 1既有第三方弃用警告。覆盖通知服务真实调用边界（传输mock）、映射缺失拒绝、当前快照/越权项排除、字段脱敏、授权查询权限及校准组计数。4个跳过项需要显式开启隔离数据库；未声称真实SQL/外部投递验收。
- 构建：`npm --prefix hr-portal/frontend run build` → vue-tsc + Vite通过；既有VueUse PURE注释告警。`git diff --check`无格式错误，部分文件有LF/CRLF提示。
- 像素比对实算：两张1920×1080截图，通道阈值8；全屏变化22.1619%、头部3.3687%、摘要4.8893%。数据、标题及水印不同，该结果是差异证据而非像素一致通过；不得宣传“完全一致”。后续CSS/列配置仍有修改，需重新生成最终同数据/同视口证据。
- 未完成/未运行：真实登录下完整授权/撤销业务链、各环节所有状态与组织钻取像素验收、最终授权页截图、真实库API保存回读、生产验收、部署。飞书真实投递由测试总闸禁止；本轮不以真实发送作为验收方式。

### 2026-11-02 第一轮功能修复与测试发布候选

用户要求先完成接口/业务 Bug 并确保测试期间不实际发飞书消息，推送部署后由用户核对 UI，像素差异留下一轮。该决定允许本轮延后 UI 像素验收，不代表 F01–F05 整体完成。

- 消息保护：`FEISHU_NOTIFICATION_DELIVERY_ENABLED` 默认 false，Compose 明确固定 false；共享通知服务只记录预览，客户端消息发送/更新也拒绝外发。身份切换样例/汇总自动投递停止；授权返回 `notification_status=preview_only`，催办返回 `preview_task_ids`，不计入已送达。
- 功能修复：校准授权测试恢复真实 Teleport + body 挂载，保留真实 ElSelect/ElOption，消除 13 个未处理递归错误；两处撤销增加确认；未实现筛选/已复议/NONE 分布选项禁用并说明；父授权撤销使派生授权失效，子授权继承只读限制，撤销不删除已提交/草稿内容。
- 分布边界：NONE 后端拒绝；配置强制分布的校准授权本轮拒绝，避免没有提交校验却声称执行规则。真实发送重试幂等未开放验收，后续启用消息总闸前必须单独完成。
- 前端：在 frontend 目录执行 `npm test -- src/components/performance/CompletionRatePanel.spec.ts src/components/performance/PerformanceReminderPanel.spec.ts src/components/performance/performanceReminderVisibility.spec.ts src/views/performance/ProjectManagement.spec.ts src/views/performance/Review.spec.ts --pool=threads --poolOptions.threads.singleThread=true --silent` → 5 文件、98 passed、exit 0，无未处理错误；`npm run build` → vue-tsc + Vite exit 0。
- PostgreSQL 定向证据：隔离容器 `hr-pm-acceptance-pg`（独立测试库，不使用项目 data/pg）。既有 `test_performance_projects.py::test_authorization_postgres_migration_and_reopen` 通过直接导入并执行异步测试函数，验证 0290 upgrade、JSONB 保存→新连接回读、撤销→新连接回读、有记录 downgrade 拒绝、空表 downgrade→upgrade。此证据不等于真实登录/API全链路或全量迁移通过。

### 2026-11-02 催办入口复用成员列表授权弹窗

- 复用边界：项目管理催办页与成员列表统一使用 `PerformanceTaskDelegationDialog`；后端统一通过 `_member_task_options` 生成被评估人、执行角色、可授权环节与任务引用，催办页不再使用仅含 `task_id/project_id` 的简化弹窗输入。授权/转交继续调用既有候选人交集与 `authorizeTask` 提交链路，不新增第二套组件或接口。
- 前端：`npm --prefix hr-portal/frontend test -- src/components/performance/PerformanceReminderPanel.spec.ts src/views/performance/ProjectManagement.spec.ts --pool=threads --poolOptions.threads.singleThread=true --silent` → 2 文件、36 passed、exit 0；共享弹窗独立测试继续覆盖候选人加载、授权提交参数和批量部分失败。
- 后端聚焦回归：`hr-portal/backend/.venv/Scripts/python.exe -m pytest tests/test_performance_projects.py -q --tb=short -k "member_task_map or cycle_reminder_hides_delegation or cycle_reminder_department_filter"` → 3 passed、384 deselected、1 条第三方弃用警告；覆盖催办名单与成员列表一致的 `task_map` 角色/环节契约、隐藏节点拒绝及部门过滤。最终全文件回归另有 2 项失败、380 passed、5 skipped，失败来自并行开发中的三态通知投递模式测试桩未提供 `_global_delivery_mode` 所需 DB 行为，不属于本次弹窗复用代码；未将其报告为通过。
- 构建与格式：`npm --prefix hr-portal/frontend run build` → vue-tsc + Vite exit 0，仅既有 VueUse PURE 注释警告；`git diff --check` 无新增格式错误，仅仓库既有 LF/CRLF 提示。
- 浏览器验收阻塞：本地 Vite 页面已登录并进入催办路由，但当前运行后端对 `/api/v1/performance/project-management/overview` 和 `/reminder-people` 返回 404，无法生成真实页面截图或执行本地 API 全链路；未操作生产、未实际授权人员、未发送消息。F02/F05 保持未完成，待部署包含当前路由的后端后补真实页面验收。
- 全量空库迁移：最初在历史 revision 0046 写入时遭遇 `alembic_version.version_num VARCHAR(32)` 长度限制；随后已在 `alembic/env.py` 修复 PostgreSQL 初始化：新表使用 VARCHAR(128)，现有短列只扩不缩，保留原 revision/数据，并置于迁移事务内。未修改历史迁移或伪造 head。隔离 PostgreSQL 实测空库升级至 0046、0046→0045→0046、旧 VARCHAR(32) 扩宽通过；`python -m pytest tests/test_schema_check.py -q --tb=short` → 10 passed。继续运行空库 `alembic upgrade head` 已跨过 0046/0047，在 0051 因历史 `tools.hr` 菜单种子缺失停止；全量空库 head 仍未通过，本轮不改动该独立初始化依赖。
- 部署：第一轮代码已推送 main（`135d7c9a`）。用户明确服务器部署自行执行，本轮仅修复并推送 0046 初始化兼容；不连接或操作服务器。现有数据库的实际 revision 和迁移结果仍须部署时核对。
- 参考证据保持受限：前述 REA Evidence ID、CSS 视口 1280×673 / DPR1.5 可复用；原始参考截图含真实员工信息，受限保存，不进入普通 Git。临时会话结果路径不作为唯一长期存储；已有实现 PNG 未作为本轮最终 UI 验收证据。
- 催办默认选择及底部操作栏：周期催办模式默认执行跨页可催办项选择（显式 false 可关闭），不再依赖调用方传 true；独立催办路由仍显式开启。共享 `PerformanceManagementTable` 新增可选 `selectionBarTarget`，仅独立催办页挂载到 body，避免选择栏受滚动区域裁切/层级影响；成员列表默认保持原行为。复用同一“催办／已选择 N 条／清除”操作栏。真实 Vue 路由、本地浏览器1280×720、拦截151条合成任务响应：150条可催办项全部默认选中，1条不可用项禁选；清除后勾选1条、翻页保留、滚动1200px后60px操作栏位于y=660–720且hit-test可点击。催办POST由浏览器拦截并返回preview_only，断言仅提交所选task_id=2，零真实发送。截图：`hr-portal/.tmp/reminder-selection-verified.png`（合成数据、未入Git）；前述初始默认全选在本地原代码也可运行，本轮为模式默认值加固及浮层显示修复，不能以合成响应推断生产任务的selectable状态。5文件100 passed，无未处理错误；生产部署由用户执行。
- 固定姓名列遮盖顶部 head 修复：浏览器前后对比复现独立催办页 scrollTop=400 时姓名固定列与顶部 head 均为 z-index 2，正文固定列后绘制覆盖 head；保留共享表格样式，仅在 `ProjectManagementReminder.vue` 和 `PerformanceTaskOverlay.vue` 的滚动内容容器添加 `position:relative; z-index:0`，将固定列限制在 head 下方的独立层。真实 Vue 组件+80行合成数据，视口1280/1024×720、scrollTop=160/400/900/1800，顶部y=20/35/50及固定/普通列采样点均命中 head 而非正文。REA截图 `ev_4b44a97aae81dfad251ff0a2fab1ae2b854eae89bc0c190dd0e609353a37a867`；这是本地组件滚动验证，非生产业务验收。3文件88 passed；构建exit0。未改共享表格固定列层级/阴影、接口、通知或数据库。
- 催办滚动遮挡修复（REA 复测）：发现前一版只加 mask 未共享表格 offset，长名单时 reminder card `flex:1` 又会被压缩，使 mask 在卡片底部先离开、sticky header 继续吸顶。按 ProjectMemberListPanel 的已修模式，card 设置 `--performance-table-container-padding: var(--performance-review-surface-inset)`，mask 使用 `top: calc(-1 * var(--performance-table-container-padding, 0px))`，并将长内容卡片设为 `flex:1 0 auto` 防止压缩。Edge 139 / Chromium CDP，视口1280×720，真实 PerformanceTaskOverlay + PerformanceReminderPanel 组件、隔离80行合成响应；滚动900/1800/3200px均测得 mask bottom与header top差值0px。旧offset在深滚时差值361px。Evidence: `ev_b955e752a745a130e9d67d97741ed4a28feab6fd31646e125b991ed214ceb42d`（修复后可视截图）；测量在合成行 fixture 的同一真实 Vue 组件上执行，不是生产数据；REA 交互场景受限于当前登录态，未将合成fixture伪称为登录态端到端验收。`PerformanceReminderPanel.spec.ts` + `ProjectManagement.spec.ts` 29 passed；完整5文件98 passed；`npm run build` exit 0。

### 2026-11-02 成员列表「授权他人处理 / 转交他人处理」真正接入（本卡）

用户要求项目管理页成员列表底部弹窗中两个按钮真正接入：两个弹窗复用同一组件、功能独立；按飞书采集规格实现（被评估人多选 tags、授权给必填 search select、授权环节按执行角色分组 checkbox、通知 switch、确定/取消 footer）。本卡不改现有单任务授权端点语义，不做平行接口，不新建表。

- [x] CR-007-F06 成员列表批量授权/转交接入
  - 前端：`ProjectMemberListPanel.vue` 增加多选（`v-model:selected-keys` + `selection-key="employee_no"`）与 `authorize-selected`/`transfer-selected` 事件；按钮 disabled 条件为所选成员中无 `can_authorize`；`ProjectManagement.vue` 组装 task_map 打开 `PerformanceTaskDelegationDialog`，提交后关闭并刷新总览；`PerformanceTaskDelegationDialog.vue` 增加「被评估人」tags 与「授权环节」按执行角色（直属上级/HRBP）分组的 checkbox 列表，footer 校验原因与环节必选。
  - 后端：`list_project_members` 返回 `task_map`（每成员的可授权环节任务：task_id/stage_key/stage_label/role_key/role_label/handler_ref/can_authorize）与 `task_id`（首项可授权任务）及 `can_authorize`；批量预取节点快照、任务与 ACTIVE 授权记录与 progress 权限范围，注入 `_authorize_task_delegation`（可选参数，默认行为不变），避免逐成员 N+1 查询；执行角色判定 = task.handler_ref 对比 member.direct_supervisor_employee_no（→直属上级）或 hrbp_employee_no（→HRBP）。
  - 复用：不新建弹窗/端点；沿用现有单任务 `POST /projects/{id}/tasks/{task_id}/delegations` 循环调用、共享 `PerformanceTaskDelegationDialog`、`PerformanceManagementTable`、`PerformanceSearchSelect`、`PerformanceCheckbox`；api/performance.ts 无 `.js` 镜像，跳过 esbuild 同步。
  - 不做：不新建表、不改既有授权记录语义（ACTIVE/REPLACED/REVOKED）、不碰校准任务授权（calibration 分支保持原逻辑）、不批量改 legacy、不做永久兼容壳。
  - 兼容：提醒面板扁平 tasks（无 task_map）路径保持原「整任务授权」行为；弹窗 `filteredTasks`/footer/confirm 对 stageGroups 空时回退原逻辑，防止提醒面板授权流回归。
  - 证据：
    - 前端：`PerformanceReminderPanel.spec.ts`（14 项）+ `ProjectManagement.spec.ts`（20 项）→ 34 passed，覆盖共享授权弹窗提交/中断重提、提醒面板 delegation 按钮可见性；全量 `src/components/performance` + `src/views/performance` 1541 项中 1483 passed，58 项失败均为既有 `.spec.js` 旧组件与 `PerformanceProjectSettingsPage.spec.ts` 的 ElSelect 递归（并行会话已知问题），与本卡无关；`vue-tsc --noEmit` exit 0。
    - 后端：`test_performance_projects.py` 377 passed / 5 skipped；`test_performance_auth_context.py` + `test_performance_subject_visibility.py` + `test_performance_role_configuration.py` 31 passed。本卡新增 mock 覆盖 `_delegatable_stages` 的节点快照查询与无 cycle_ref 的任务查询分支。
    - 状态：代码已在 HEAD（提交 `94d88a4f` 及后续 `4dbe5711`）；未部署生产、未执行真实登录浏览器验收；生产代码经开发推送发布规则不变。
  - 待后续：真实登录下项目管理页成员列表勾选→弹窗环节分组→提交生成授权记录→列表刷新的浏览器端到端验收；像素比对与飞书参考页留待统一像素轮。

### 2026-11-09 CR-007-F07 授权／转交弹窗与二次确认收口

- [ ] CR-007-F07：本地实现及定向回归通过；真实 PostgreSQL 新连接回读与原入口完整登录验收未完成，不勾选整体验收。
- 确认依据：用户明确要求按本会话 REA 还原并完成本地开发；主弹窗被评估人在最上、三执行角色与环节集中展示，转交二次确认采用用户提供的 600px SnapSpec。保留既有入口和流程，本次为既有弹窗修正，无新页面／菜单或迁移。授权二次确认使用同一公共警告壳；不声称覆盖飞书全部审批及原处理人缺失分支。
- 实现：复用 PerformanceDialogShell、PerformanceFormItem、PerformanceMemberIdentity、PerformanceSearchSelect、PerformancePromptNotice、PerformanceCheckbox、UiSwitch 和 PerformanceConfirmDialog。新增 PerformanceDelegationStages 只负责角色／环节选择；600px 二次确认增加 delegation 外观，不改变原删除／提交外观。切换角色清空已选环节；按 role_key + stage_id（兼容 stage_key）归并显示，提交保留 project_id + task_id 并排除不可授权任务。移除普通操作原因必填，默认开启通知原评估人并随请求提交。主弹窗首次确定不写入，二次确定才调用既有单任务 API；取消不写入，失败／部分成功禁止重复提交并刷新名单。
- 后端：ProjectMemberTaskOption 增加可选 stage_id=node.node_id；角色严格匹配冻结配置与 task.handler_ref，保留重叠角色，指定人员必须准确匹配，直属上级要求对应级别；纳入真实结果复议任务，撤销过滤、普通完成任务禁用。候选查询和 POST 同范围校验，越界403 TASK_AUTHORIZATION_RECIPIENT_OUTSIDE_SCOPE，身份歧义拒绝不降级。保留快照、审计、校准只读授权和有效处理人服务；通知文案区分授权与转交。
- 前端实际回归：`npm --prefix hr-portal/frontend exec -- vitest run src/components/performance/PerformanceReminderPanel.spec.ts src/views/performance/ProjectManagement.spec.ts src/components/performance/PerformanceConfirmDialog.spec.ts --root hr-portal/frontend` → **56 passed**。项目管理既有测试仍输出 jsdom XHR AggregateError，但套件 exit 0；不称无告警。类型检查及 Vite 构建通过，只有既有 VueUse PURE 注释及大包提醒。
- 后端实际回归：`.venv/Scripts/python.exe -m pytest -q tests/test_performance_projects.py -k 'delegation or task_authorization or reconsideration or member_task_map or real_line_handlers'` → **29 passed**。排除三个已知失败测试名后的模块回归 **480 passed / 5 skipped / 8 deselected**。全模块曾得478 passed / 5 skipped / 6 failed，6项用 HEAD 原路由内存基线复现相同失败，集中工作台／成员列表360详情夹具；未改本轮外业务。存在 python_multipart 第三方弃用告警。
- PC 证据：真实 Vite Vue 组件、1280×800、合成人员和浏览器拦截 API；双人相同环节只展示一次，二次确认前写请求0、二次确定后发两条对应任务请求、转交二次取消无新增写请求、pageerror0。截图 `ui-blueprints/CR-007-F07-implemented-authorization.png`、`CR-007-F07-implemented-authorization-confirm.png`、`CR-007-F07-implemented-transfer-confirm.png` 已查看。仅组件集成验证，不是原入口真实后端端到端验收；合成数据及“打开转交”按钮不加入正式页面。
- 边界与停止：未操作飞书或生产、未实际外发消息、未执行迁移／部署／commit／push。Docker守护进程不可用，不反复重试。批量保持既有逐任务 API，不承诺原子批量；结果复议通知重试器 reconsideration_service.dispatch_notifications 仍按原 task.handler_ref 投递，不随有效授权人变化，这一通知重试限制未扩文件处理。后继须在本地真库可用时补原入口→真实 API→新连接回读，不能以组件截图或 ORM 测试替代 PostgreSQL 验收。

## 2026-11-13 CR-007-F14 单个催办与批量催办分离

- [ ] CR-007-F14：本地实现、定向自动化与隔离浏览器交互已验证；真实鉴权 API／PostgreSQL／通知投递及生产部署未验收，不勾选整体完成。
- Goal／依据：用户确认修复单个与周期批量催办混用，统一项目管理成员列表、上级评估、校准、绩效沟通及编辑／阅读态的按钮与催办功能。沿用 CR-011 既有确认＋hover 预览交互，无新增页面或信息架构，不要求新蓝图。
- 契约：一个被评估员工不等于一个通知接收人。具体环节用 node_id/task_id；360入口用 target_kind=reviewer_360 与 node/task 严格交集，GET取得该员工可用任务集合，确认才向成员级 remind-batch 提交明确 task_ids。单任务走原成员 remind；周期去催办仍走 cycle-remind 独立路由。结果开通独立，禁止借催办执行开通。
- 前端：新增 PerformanceMemberReminderDialog.vue 及其组件测试，复用 ConfirmDialog／Popover／PreviewCard／Checkbox；编辑／阅读空态统一 outline 铃铛＋催办，360统计浮层保留文本按钮。三个页面共用 composable，抽屉使用真实 stage.task_id 及加载后的来源任务；沟通列表增加评估率浮层，普通360评估人界面不增加催办。删除批量面板 member-remind 模式及其 API 分支，防止重新误接。预览与发送响应按上下文和身份代次丢弃，关闭清理浮层，发送完成只保留一个结果弹窗；success／partial／preview／failed／skipped不混称成功。
- 后端：成员列表、预览、单次与集合发送共用 resolver；source 支持上级评估／校准／沟通可写任务，绑定项目、周期、员工、历史快照及时间窗，校准使用既有对象授权与阶段校验。source 命中不再管理回退；只读／转交原处理人／撤销／越界拒绝。预览和发送共享消息构建及截止时间，reminder_name 是操作者，reminder_target 是收件人说明；360通用称谓不泄漏实名。旧单次增加 source_task_id、skip_recently_reminded 并委托统一发送；保留通知日志六小时去重及审计。
- 允许改动：backend/app/performance/{member_reminders,projects_router}.py、既有两个后端测试；frontend/src/api/performance.ts、performanceReminder.ts、usePerformanceMemberReminder.ts、新 Dialog及spec、ReminderPanel及spec、ReferenceContent／ReviewContent／Review360FeedbackPanel／ReviewEvaluationDrawer、ProjectManagement／Review／SelfSummaryTask及既有测试。共享 API 保留并行请求去重改动；未修改其它会话身份切换、Layout、store、Workbench或用户 router diff。不改模型／迁移／快照／角色配置／生产，不新建脚本、报告或测试文档，不自动提交推送。
- 前端最终命令：`npm --prefix hr-portal/frontend test -- src/components/performance/PerformanceMemberReminderDialog.spec.ts src/components/performance/PerformanceReminderPanel.spec.ts src/components/performance/PerformanceConfirmDialog.spec.ts src/components/performance/PerformanceReviewEvaluationDrawer.spec.ts src/views/performance/Review.spec.ts src/views/performance/ProjectManagement.spec.ts src/views/performance/SelfSummaryTask.spec.js --silent` → **7文件356 passed**。单线程早期组合运行出现 enableAutoUnmount 二次注册收集失败，正常隔离的最终七文件命令已通过，不修改业务以规避。`npm --prefix hr-portal/frontend run build` → vue-tsc＋Vite exit0、3700模块；既有VueUse PURE与chunk体积告警。
- 后端主线程命令：`DB_HOST=127.0.0.1 DB_PORT=1 hr-portal/backend/.venv/Scripts/python.exe -m pytest hr-portal/backend/tests/test_performance_member_reminders.py hr-portal/backend/tests/test_performance_projects.py -q --tb=short` → **851 passed／5 skipped／1 python_multipart弃用警告**。仅测试替身与传输mock，不连接真实业务数据库；跳过项不计通过。覆盖来源允许拒绝、阶段／授权／快照、360交集与预加载、预览零写与消息一致、单次接口去重。
- 浏览器：本地Vite真实Vue路由、Chrome headless、1440×900，所有 `/api/v1/*` 响应隔离为合成数据。阅读抽屉、编辑校准参考、成员360浮层均进入共享确认与预览；预览／取消写请求0，具体任务POST携带 node_id/task_id，校准来源 source_task_id=11，360仅task_ids=[81,82]且target_kind=reviewer_360，成功／部分成功反馈正确。关闭后alertdialog=0、body overflow为空、pageerror=0、未匹配API=0。不是实际外发或真实鉴权API验收。
- 独立UI证据（已查看）：`ui-blueprints/CR-007-F14-implemented-member-reminder-20261113.png`、`CR-007-F14-implemented-edit-reminder-20261113.png`、`CR-007-F14-implemented-360-reminder-20261113.png`。既有组件/token复用、无新增视觉体系；未宣称像素完全一致。未执行生产、真实数据库／飞书投递、并发幂等实测。停止仅撤销本卡增量，不整包回滚或删除任务／审计。

## 2026-11-13 CR-007-F13 前台读链路性能优化

- [ ] CR-007-F13：本地实现及自动化回归通过；真实登录/API/PostgreSQL、运行时前后对比与生产验收未完成，不勾选整体验收。
- 授权：用户明确要求完成本次架构排查发现的慢加载优化。复用原工作台、评估、项目管理及共享侧栏；不新增页面、角色、结果算法或通知通道，不改变冻结周期和历史快照。既有信息架构不变，无新蓝图；本轮未创建脚本、报告、测试文档或PNG。
- 公共查询：导航按身份相关周期及最新成员快照收窄，必要字段投影、复议资格批量验证和请求内上下文复用；催办列表批量预取任务/节点/有效授权，复用管理范围、快照人员及可投递人，实际发送不使用列表预取替代重校验。
- 列表：taskPeople 不传 page 保持全量数组；带 page/page_size/sort_by/sort_order 返回 items/total/rating_columns；任务/姓名/工号排序先分页再 enrich，派生排序保留全范围计算后分页。校准/终评有效结果和分布来源批量计算，显式关闭分布提前返回。单项目默认/姓名升序 SQL 分页；周期成员默认/姓名排序先选全局当前页，再仅 enrich 当前页，跨项目动态列稳定且导出仍全量。周期候选及 taskPeople 首次基础查询仍可能全范围读取，不宣称所有排序均已 SQL 分页。
- 结果与统计：开通资格先过滤授权/已开通/在职等条件，状态复用和结果键索引，分页后补资料；单人结果限制本人任务/成员。自评/终评 SQL 下推人员范围；多项目完成率基础查询批量化，部门任务及树按键分组，减少重复全表扫描。统计保留权威结果解析，不另建计算链。
- 详情契约：template-task/memberDetail 可选 view=drawer 与 tab；未加载页签 content_loaded=false，仅返回元数据；填写默认完整接口保留。选中OKR才沿原授权加载所有周期；详情内部复用节点、本人任务、成员及模板，上级管理抽屉跳过重复顶层 schema 组装。保留匿名360和字段裁剪，保留其他会话360元数据增量。
- 前端：工作台缓存立即展示、公告并行、时间轴/待办各自完成即更新；列表服务端分页及旧响应丢弃，导出及跨页选择保留；侧栏按页签加载、已加载内容复用、在途合并和身份隔离；OKR保留已有内容，失败不清空；折叠360不挂载隐藏renderer。统计使用共享store的30秒TTL与在途合并，身份/周期/写后失效版本阻止旧响应回填；评估overview增加请求序号、周期和缓存版本校验。
- 修改范围：backend/app/performance/{navigation_service,member_reminders,projects_router}.py，frontend/src/api/performance.ts，原Workbench/Review/ProjectManagement页面、performanceProjectContext store、成员/反馈列表、详情/OKR参考/360预览/统计组件，以及对应既有测试。本轮不修改路由原有在途diff、模型或迁移。
- 后端主线程联合命令：backend/.venv/Scripts/python.exe -m pytest backend/tests/test_performance_projects.py backend/tests/test_performance_auth_context.py backend/tests/test_performance_member_reminders.py -q --tb=short（路径从hr-portal解析）→ **863 passed / 5 skipped / 1 python_multipart弃用警告**。其中项目文件790通过、身份29通过、催办44通过；固定日期测试在测试内统一mock时间，不修改业务服务。
- 查询断言：完成率2个和10个项目的基础数据读取均5次（测试替身计数，不是生产SQL计数）；催办重复检查不再补任务/授权查询，发送重新校验；周期第一页仅enrich所选成员、跨项目列稳定、姓名/动态评级/完成率/状态排序及非法键拒绝。
- 前端主线程：7文件212通过（Review93、ProjectManagement44、Workbench13、store7、Drawer32、360Preview11、Statistics12）；最后overview竞态增量再跑Review/Workbench/store共113通过。npm run build 已通过vue-tsc+Vite（3694模块，既有VueUse PURE注释及大chunk提示）；最终构建结果如有后续补录以其为准。git diff --check通过，仅LF/CRLF提示。
- 未验证/剩余：未采生产请求瀑布、TTFB/响应字节/长任务或真实SQL/EXPLAIN，不能承诺提速倍数/P95达标；统计仍逐项目解析评级，部分派生排序仍需全范围计算；身份切换续期锁、物化统计、索引迁移和打包/网关调整不凭静态猜测变更，待真实度量后判断必要性。无生产操作、真实外发、commit/push/deploy。停止仅撤销本卡增量，不整体回滚或删除快照、任务和审计。
