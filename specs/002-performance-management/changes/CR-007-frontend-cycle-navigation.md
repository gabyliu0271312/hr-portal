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
- 工作台、绩效评估、项目管理的周期选择器使用同一周期列表和当前值。原“周期内多个项目仍按页面既有项目选择交互隔离”由 CR-007-F17 的最新用户要求替代：不再显示额外项目筛选，保留真实项目、节点与任务标识及跨项目可达性。F17 UI 蓝图确认前不执行正式 UI 开发。
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
  - 规则（2026-11-17 用户要求完成评估中的全部修复，覆盖旧截止为空/相同分母口径）：已开通仍为 `completed_count / total_count`、`deadline_at=null`；已复议改为 `reconsidered_count / completed_count`，零分母显示0.00%及0/0。`reconsidered_count` 是最新成员及当前可见范围内、已有结果开通记录的未撤回复议申请员工去重人数（含已处理）；历史孤立申请不计入，不能按处理任务份数计数或将比例截断为100%。新增可空 `reconsideration_deadline_at`，复用员工发起窗口：优先结果查看 `appeal_deadline`，仅字段缺失逐字段回退相邻复议节点旧配置，显式空保留，无相邻复议节点返回空；多项目沿既有截止聚合取最早值，按项目内人员去重再累加，权限/最新快照不变。前端只在已复议视角显示该申请截止（北京时间/已截止），切回恢复开通截止；处理复议节点仍显示其独立 `end_at`。不新增人员明细筛选API。
  - 2026-11-17 本轮修复证据：修改 `projects_router.py` 总览统计、复用 `reconsideration_service.submission_window(result_view_node=...)`、前端API目标类型/ProjectManagement/CompletionRatePanel/CompletionNodeCard及既有测试；保留共享文件的并行comparison改动。后端 `DB_HOST=127.0.0.1 DB_PORT=1 PYTHONPATH=hr-portal/backend hr-portal/backend/.venv/Scripts/python.exe -m pytest hr-portal/backend/tests/test_performance_projects.py hr-portal/backend/tests/test_performance_reconsideration_results.py hr-portal/backend/tests/test_performance_reconsideration_lifecycle.py hr-portal/backend/tests/test_performance_effective_results.py -q --tb=short` → **979 passed、5 skipped、1既有python_multipart警告**。前端 `npm --prefix hr-portal/frontend run test -- src/views/performance/ProjectManagement.spec.ts src/components/performance/CompletionRatePanel.spec.ts src/views/performance/Review.spec.ts --silent` → **3文件177 passed**；此前非静默有既有stub/XHR及并行comparison组件告警，非零告警声明。覆盖5/3/1、零开通、缺字段/显式空、项目覆盖、历史回退、无复议节点、只读/隐藏评级、草稿/正式/keep及分页搜索排序。真实Vite路由+隔离Chromium/合成API，1440×1000实测60.00%→33.33%、1/3、2020-11-20 20:00（GMT+8）（已截止），切回截止--，pageerror=0；截图 `ui-blueprints/CR-007-F09-implemented-reconsideration-fix-20261117.png` 已读取。无新模型/迁移/生产写入/真实通知/提交推送，真实登录API/PostgreSQL/生产仍未验收，F09整体保持未勾选；完整构建最终 `npm --prefix hr-portal/frontend run build` → vue-tsc+Vite通过（3745模块、52.73秒、exit0，仅既有VueUse PURE提示）；首次构建曾被并行comparison在途类型错误阻塞，未改本卡外文件，待对应会话同步后复跑通过。目标文件 `git diff --check` 通过。
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

### 2026-11-19 F04 校准授权查看还原（实施中）

- 已确认入口沿现有独立全屏工作区；无新页面蓝图。范围由冻结阶段 `rule_sources/assignments.source_rule_ids` 解释，人数及名单消费同一组可见有效任务；复用 FocusGroupPeopleDialog，采用实采五列：被评估人、一级部门、末级部门、直属上级、序列。
- 原 GET `/project-management/calibration-authorization` 增量返回后台/委托来源、各行真实授权人/时间、截止、范围规则、未授权任务ID、按行生效分布。委托行按原阶段/处理人、接收人、发起人及授权设置分组，不将委托元数据错误覆盖后台行。后台行不可撤销；继续授权开关与访问者写权限分离。人数资料继续服从快照及字段可见规则。
- 原提交链保留；继续授权携带可选 `source_authorization_id`，服务端核验同任务有效来源、再授权开关与人员范围，子记录关联父记录，既有撤销级联复用。无新表/迁移、无平行执行链。
- 规则提示消费当前行有效规则，分建议/强制两组、虚线间隔；2026-11-19实采254×175px（随内容自适应），14/22px，标题600，padding 12px 16px，圆角8px，白底及共享popover阴影。无配置隐藏列；禁用提示分别为“此任务不允许授权他人校准”“请联系管理员在「项目设置」中移除此用户的校准权限”。
- 后台授权元数据仅从可证明规则新增/启动的原项目审计读取，历史无证据保留空值。修改仅限原授权页、共享浮层/授权弹窗可选参数、API DTO、原路由/校准服务及既有测试；保护其他会话报表/主数据变更。
- 飞书授权操作经用户单独批准：任务内全部人员实际2人（原范围3人），授权alice成功；submit轮询后列表回读新增子任务且原未授权数3→1。真实飞书数据仅作受限采集，不入普通Git；此操作不代表本地API/生产验收。
- 本地前端验证：最终不带 `-t` 执行 `npm --prefix hr-portal/frontend run test -- src/views/performance/ProjectManagement.spec.ts src/components/performance/PerformanceInfoPopover.spec.ts src/components/performance/focus-group/FocusGroupPeopleDialog.spec.ts --silent` → **3文件67 passed、exit0**。此前相同文件定向筛选18 passed、49未选、exit0；覆盖蓝字两类同源名单、五列、无配置隐藏列、禁用原因、分组无圆点、接收人本人排除及source_authorization_id透传。首次较宽运行有本卡提示条缺type与并行报表旧参数断言失败；本卡type=info已修，并行报表负责人同步后完整回归通过，未将首次失败算通过。
- 构建：`npm --prefix hr-portal/frontend run build` → vue-tsc+Vite通过（3780模块、exit0），含既有VueUse PURE提示；首次构建有本卡测试columns可空及并行报表seriesStyle在途错误，本卡已补默认值并复跑通过。
- 真实Vite独立浏览器上下文+合成API（所有/api/v1请求均隔离）验证：1440×1000/DPR1，浮层254×175px、14/22px、双组/虚线/共享阴影，周期选择器右对齐x1230宽186；提示条x44/y144高40；人数同源五列/两条、无配置列隐藏，pageErrors=0。PNG已查看：`ui-blueprints/CR-007-F04-implemented-authorization-rule-hover-20261119.png`、`ui-blueprints/CR-007-F04-implemented-authorization-people-20261119.png`。中间一次预览登录页误截图已作废并以校验路由后正确截图替换，不计验收通过。
- 后端最终定向验证：`DB_HOST=127.0.0.1 DB_PORT=1 PYTHONPATH=hr-portal/backend hr-portal/backend/.venv/Scripts/python.exe -m pytest hr-portal/backend/tests/test_performance_projects.py -q --tb=short -k "calibration or delegation or task_authorization or authorization_records"` → **240 passed、2 skipped、638 deselected、exit0**，一条既有python_multipart弃用警告；末次补分布标签/NONE空规则及子PARTIAL独立范围后14.64秒。覆盖父子来源、同源差集、脱敏、来源再授权允许/拒绝、审计缺证、只读继承、幂等、接收人等于被评估人的422，以及INHERIT/NONE和三种部分范围。2项跳过不计通过，未连接业务数据库。提交前补跑 `test_performance_user_authorization.py -k actual_task_delegation_endpoints` → **1 passed、13 deselected、6.17秒、exit0**（同样DB_HOST=127.0.0.1/DB_PORT=1及既有弃用警告）；同步父/子两行的权限断言。
- 最终构建：共享文件写入稳定后复跑 `npm --prefix hr-portal/frontend run build` → vue-tsc+Vite **3780模块、58.38秒、exit0**，仍有既有VueUse PURE提示。此前复跑曾遇并行成员抽屉在途未闭合标签（PerformanceReviewEvaluationDrawer.vue:311），已由对应负责人完成写入，主线程未覆盖该局部改动。目标文件 `git diff --check` 通过（LF/CRLF提示保留）。
- 提交前整合复测：成员修复合入main后，前端同三文件 **70 passed、exit0**；后端两文件 `test_performance_projects.py test_performance_user_authorization.py -k "calibration or delegation or task_authorization or authorization_records"` → **241 passed、2 skipped、654 deselected、11.54秒、exit0**，既有python_multipart警告。首次出现两项校准完成测试夹具缺少新成员详情合同的project.status，已仅在该测试补STARTED并复跑通过，保留团队共享详情不返回member_actions断言。
- 待验收：真实本地JWT API/PostgreSQL/部署尚未验证，F04/F05仍未勾选；不以局部浮层尺寸一致宣称整页像素一致。本轮本地代码、定向回归、受控UI证据已收束；用户已授权在main提交推送，未部署。

### 2026-11-19 F04 单项目与逐规则展示调整（实施中）

- 用户最新明确口径：周期概览校准任务授权仅显示第一个启动的项目；同一校准人配置多条规则时逐条展示，不再合并。覆盖此前周期多项目汇总的显示口径，不改变其他报表/记录页与单项目入口。
- 原校准GET先按既有角色范围取可见已启动项目；无显式project_id时按 `PERFORMANCE_PROJECT_STARTED` 首次审计时间取最早一项，同时间以项目ID稳定排序。历史缺启动审计的项目排在有审计项目之后，全缺时按ID稳定回退；不把创建/更新时间冒充启动时间。显式单项目入口仍保留原项目限制，首项目无校准任务时显示空态而非自动切第二项。
- 后台列表键改为项目/节点/阶段/校准人/冻结rule_id；每行人数、名单、范围、分布提示、授权开关及元数据只读取该规则。相交人员可出现在不同规则行，底层任务不复制、冻结来源OR聚合和结果提交链不变。
- 可选 `source_rule_id` 随原授权提交保存到既有JSON设置，服务端校验任务实际属于该规则及该规则允许授权，避免借重叠的另一条允许规则绕过当前行禁用。继续授权保留父记录与来源规则；新记录按规则投影。旧无来源记录保留原实际任务授权语义，不反向伪造历史来源。
- 允许文件：原projects_router校准投影/helpers/委托校验、原API DTO/校准页/共享授权弹窗参数透传及既有测试/本段。无模型/迁移/真实外部写入，不覆盖并行报表diff，不自动commit/push/deploy。
- 后端验证：`DB_HOST=127.0.0.1 DB_PORT=1 PYTHONPATH=hr-portal/backend hr-portal/backend/.venv/Scripts/python.exe -m pytest hr-portal/backend/tests/test_performance_projects.py hr-portal/backend/tests/test_performance_user_authorization.py -q --tb=short -k "calibration or delegation or task_authorization or authorization_records"` → **247 passed、2 skipped、666 deselected、13.94秒、exit0**，既有python_multipart警告。覆盖实际启动顺序与ID相反、同时间/缺审计稳定回退、显式单项目、首项目无任务不跳第二项、同人双规则重叠/不同授权开关与分布、来源提交允许/拒绝及原父子授权回归。
- 前端验证：`npm --prefix hr-portal/frontend run test -- src/views/performance/ProjectManagement.spec.ts src/components/performance/PerformanceInfoPopover.spec.ts src/components/performance/focus-group/FocusGroupPeopleDialog.spec.ts --silent` → **3文件71 passed、exit0**；覆盖同名不同规则行、各自人数名单、单行source_rule_id及父授权ID透传。
- UI证据：真实Vite路由、独立隔离浏览器上下文、所有API合成拦截，1440×1000/DPR1；同名两行显示项目全员2人/直属下级1人，协助授权分别可用/禁用，第二行人数仅打开1人名单，pageErrors=0。独立PNG已查看：`ui-blueprints/CR-007-F04-implemented-separate-calibration-rules-20261119.png`。首轮内联采集命令语法错误未执行，修正后完成，不计成功证据。
- 管理范围回归：`test_performance_management_scope.py -q --tb=short` → **20 passed、8.84秒、exit0**，既有python_multipart警告；项目权限/HRBP人员范围/跨周期拒绝仍保留。
- 最终构建：报表负责人修正该测试类型后，`npm --prefix hr-portal/frontend run build` → **vue-tsc+Vite通过、1分11秒、exit0**，既有VueUse PURE注释提示。首次构建曾受并行报表测试 `ProjectStatisticsReportPanel.spec.ts:235` 可空string类型错误阻塞（exit2），未将首次失败计通过，未覆盖报表改动。真实JWT API/业务数据库/部署未验证；F04/F05未整体勾选。用户本轮已授权在main提交推送，仅纳入本卡代码/测试/PNG与本段；部署未执行。

### 2026-11-20 F04 未授权人数显示修复

- 用户反馈仅显示可校准人数。本轮取消“允许再次授权”对人数读取的影响：后台规则行及委托行均按同源有效任务/有效子授权差集返回 `unauthorized_count` 和 `unauthorized_task_ids`；关闭再授权时仍返回实际人数（含0）。前端人数链接只判断数值是否存在，不借此放开协助授权按钮或写接口权限。此显示口径覆盖此前关闭授权时显示“-”的约定，其他来源/规则分行/首项目逻辑保留。
- 仅修改原校准GET的四处返回字段、原页面人数显示条件和既有前后端断言，保留并行360/其他业务改动；无新模型/迁移/外部写入。用户已授权本轮在main提交推送，部署未执行。
- 后端：`DB_HOST=127.0.0.1 DB_PORT=1 PYTHONPATH=hr-portal/backend hr-portal/backend/.venv/Scripts/python.exe -m pytest hr-portal/backend/tests/test_performance_projects.py hr-portal/backend/tests/test_performance_user_authorization.py -q --tb=short -k "calibration or delegation or task_authorization or authorization_records"` → **247 passed、2 skipped、684 deselected、23.94秒、exit0**，既有python_multipart警告；覆盖禁止再授权的后台/子授权行仍返回人数及名单、0人数/空名单、原权限拒绝。
- 前端：`npm --prefix hr-portal/frontend run test -- src/views/performance/ProjectManagement.spec.ts src/components/performance/focus-group/FocusGroupPeopleDialog.spec.ts --silent` → **2文件63 passed、exit0**；断言禁止授权时两个蓝字人数可见、未授权名单仅对应差集、0可点击空名单且所有写按钮仍禁用。
- 真实Vite路由+独立浏览器上下文，所有API合成隔离，1440×1000/DPR1：两行人数分别为2/1与2/0，四个写按钮均disabled，点击未授权1仅打开员工乙一条名单，pageErrors=0。独立PNG已读取：`ui-blueprints/CR-007-F04-implemented-unauthorized-count-20261120.png`。尚未验证真实JWT API/业务数据库/生产；F04/F05保持未整体勾选。`npm --prefix hr-portal/frontend run build` → **vue-tsc+Vite通过、39.99秒、exit0**，仅既有VueUse PURE注释提示。目标差异格式检查通过。

### 2026-11-20 F04 操作列右侧固定修复

- 用户明确：校准授权查看页最右侧操作列应与左侧被授权人列一样保持固定。仅在 ProjectCalibrationAuthorization.vue 原操作列增加 `fixed: 'right'`，复用 PerformanceManagementTable → UiTable；不新增 CSS、不改共享内核、API、权限或数据库。
- 现有 ProjectManagement.spec.ts 增加左右固定表头/单元格及右侧0偏移断言；修改前定向测试1 failed（操作列缺 is-fixed-right），修改后 `npm --prefix hr-portal/frontend run test -- src/views/performance/ProjectManagement.spec.ts src/components/ui/UiTable.spec.ts --silent` → **2文件74 passed、exit0**，原无权按钮禁用和无写请求断言保留。
- `npm --prefix hr-portal/frontend run build` → **exit2**，被未修改的 `PerformanceReview360InvitePanel.spec.ts:318/323` 两处 TS2339 阻塞：`Omit<DOMWrapper<Element>, "exists">` 不存在 exists。未扩展修改360测试，Vite构建未执行；不能宣称完整构建通过。
- 本次未运行浏览器横向滚动或独立PNG验收、真实API/数据库/生产验收；F04/F05整体仍未勾选。已读Spec012 UI交互与守则，复用既有表格、不引入禁止项，数仓/UCP检查不适用。未提交、推送或部署。

### 2026-11-20 F04 授权层级、范围选择器与撤销确认调整

- 用户本轮先要求组件/接口评估，随后明确授权“继续采集必要信息后完成调整开发”。沿现有授权工作区和弹窗修复，无新页面/完整蓝图、无新模型或迁移，不提交飞书真实授权/撤销、不自动commit/push/deploy。
- 目标浏览器实采：授权子行紧随真实父行且缩进；授权范围标题与总人数同行，部分人员灰底分组宽504px、指定部门/人员选择框宽448px高32px，选择框紧随各自单选项下方。部门弹层有“筛选所选部门及其下级部门内的员工”说明、展开箭头和复选框。撤销标题“确定撤销授权吗?”，说明回收该任务及其子任务；原授权明确未通知时补充本次不通知提示，按钮“保留/撤销”。本轮仅解析必要DOM/局部样式与截图，超大REA页面/网络结果未全量审阅，不把此前推测的提交字段作为本轮真实抓包结论。
- 页面提示条改用PerformancePromptNotice；授权弹窗复用PerformanceFormItem的label-extra、RadioGroup、PersonSelect、OrganizationTreeSelect及其共同SelectShell。组织树增加可选说明、checkbox和默认折叠参数，原使用方默认行为保留。开关贴近文案，已完成任务提示复用共享warning提示条。尺寸/缩进使用既有spacing/token，新增组织树最大高度、树缩进及确认列表圆点token，不固化人员姓名或部门数据。
- 原校准GET每行增量返回parent_id和notify_original；分组含递归真实父来源，不同父行不合并，同父跨任务仍聚合。后端按created_at/id稳定深度优先排序；前端按parent_id展开/折叠并在分页前组织子树，后台根及缺来源的历史直接授权不猜规则。通知值混合或任一缺失返回null，不推断默认。原授权写链、撤销级联、权限检查及历史答案保持，撤销仅发送所选行的真实授权ID集合。
- 最终前端定向：`npm --prefix hr-portal/frontend run test -- src/views/performance/ProjectManagement.spec.ts src/components/performance/PerformanceConfirmDialog.spec.ts src/components/performance/PerformanceSearchSelect.spec.ts --silent` → **3文件89 passed、exit0**；覆盖乱序父子孙行、同名不同来源、折叠/展开、仅撤销选中分支、通知提示、范围标题插槽、部门树与人员选择壳。此前含PerformanceHrbpScopeDialog的4文件回归90 passed（新增两项前），保留共享范围提交/回显回归证据。
- 最终后端：`DB_HOST=127.0.0.1 DB_PORT=1 PYTHONPATH=hr-portal/backend hr-portal/backend/.venv/Scripts/python.exe -m pytest hr-portal/backend/tests/test_performance_projects.py hr-portal/backend/tests/test_performance_user_authorization.py -q --tb=short -k "calibration or delegation or task_authorization or authorization_records"` → **262 passed、2 skipped、864 deselected、16.24秒、exit0**，既有python_multipart弃用警告。覆盖父来源隔离/跨任务聚合/三级子树/通知四态及撤销孙代失效而其他分支ACTIVE；跳过不计通过，未连接业务数据库。
- 最终构建：`npm --prefix hr-portal/frontend run build` → **vue-tsc+Vite通过、3789模块、1分5秒、exit0**，既有VueUse PURE注释提示。首次构建因新增测试夹具漏cycle_name失败，补齐后通过。`git diff --check`通过，部分文件保留LF/CRLF提示。
- UI：本地Vite真实路由、独立Chromium上下文、所有/api/v1请求合成隔离，1440×1000/DPR1；根/子行缩进0/24px，范围灰底504×154px、选择框448×32px，树可展开为3节点，撤销两条说明及危险描边按钮可见，pageErrors=[]。独立PNG均已查看：`ui-blueprints/CR-007-F04-implemented-authorization-hierarchy-20261120.png`、`ui-blueprints/CR-007-F04-implemented-authorization-department-tree-20261120.png`、`ui-blueprints/CR-007-F04-implemented-authorization-revoke-20261120.png`。首次自动化定位到禁用子行导致超时，改按启用按钮定位后通过，未绕过应用禁用状态。
- 边界：已完成本轮局部调整及本地验证；真实JWT/API/业务数据库保存回读、生产部署和整页同数据像素验收未执行，F04/F05保持未整体勾选。Spec012通用UI规则适用，数仓/UCP专属要求不适用。

### 2026-11-20 F04 撤销授权通知补齐

- 用户明确补齐撤销确认的通知文案及实际通知。目标页另一条授权实采文案：“由于授权时选择了通知原校准人，故本次撤销也会通知原校准人。”原false文案保留；true显示会通知，false显示不会通知，null/缺失不猜历史设置。
- 原DELETE撤销接口仅对校准节点且持久化notify_original严格为true调用现有send_notification；沿原授权链以task.handler_ref通过有效PerformanceIdentityLink＋有效Portal用户解析原校准人，接入原全局blocked/test_receiver/normal、部署保险丝与身份切换控制。不另建投递链/表或改请求DTO；缺身份映射不发，不通知级联回收子记录。普通评估授权撤销行为保持。
- 使用独立biz_type=performance_task_authorization_revoke和真实授权记录ID；投递结果写入原JSON的revoke_notification_status，保留授权时notification_status和其他配置。失败/跳过/preview_only/recipient_unmapped不记为已发送。权限、有效状态、项目锁和级联校验均先于通知；重复撤销409且不重复调用发送。仍沿每条授权原DELETE请求粒度发送，不新增整行批量事务或通知重试机制，无迁移。
- 后端命令沿上段两文件授权/校准定向筛选 → **271 passed、2 skipped、864 deselected、19.12秒、exit0**。新增9场景覆盖true/false/缺失、普通评估不受影响、成功/失败/跳过/预览、未映射、越权和重复撤销无通知、子记录不重复通知、答案与既有配置保留。首轮新增夹具漏冻结校准配置导致7项失败，补齐真实phase/assignment后通过，未放宽业务校验。
- 共享投递控制回归：`DB_HOST=127.0.0.1 DB_PORT=1 PYTHONPATH=hr-portal/backend hr-portal/backend/.venv/Scripts/python.exe -m pytest hr-portal/backend/tests/test_performance_projects.py -q --tb=short -k "global_blocked_mode or global_test_receiver_mode or global_normal_mode or fuse_off_still_preview or notification_preview_logs"` → **6 passed、1115 deselected、7.27秒、exit0**；后端均有既有python_multipart弃用警告。所有传输隔离，无真实发送。
- 前端：`npm --prefix hr-portal/frontend run test -- src/views/performance/ProjectManagement.spec.ts src/components/performance/PerformanceConfirmDialog.spec.ts --silent` → **2文件77 passed、exit0**，覆盖通知true/false/null/undefined。`npm --prefix hr-portal/frontend run build` → **vue-tsc＋Vite通过、3789模块、exit0**，既有VueUse PURE提示。
- 本地真实Vue路由＋独立Chromium、所有API合成隔离：420px确认框显示完整“会通知”说明，点保留关闭；pageErrors=[]、writeRequests=[]。真实飞书接收、真实JWT/业务库回读和生产部署未验收，F04/F05保持未整体勾选。未commit/push/deploy。

### 2026-11-20 F04 下级授权分布豁免与完成隔离

- 用户最新明确：往下授权允许选择“无需满足分布规则”，仅豁免该授权任务，不影响之前的父任务。本决定替代2026-11-10记录中“项目强制分布开启时禁止NONE”的旧限制。
- 原创建接口删除CALIBRATION_DISTRIBUTION_AUTHORIZATION_UNSUPPORTED拦截；NONE只保存到当前授权记录，不改项目配置、冻结规则、父授权或其他授权。重复有效授权、来源授权、管理范围及接收人校验保留。生产已有INHERIT记录不自动转换。
- 原completion服务统一按actor、阶段、来源规则及有效父链组织授权范围。分布提示与完成检查共用计算；各评估项分别计数、按成员快照/工号去重并执行人数门槛；NONE组跳过、INHERIT及原owner组保持规则，HARD违规禁止完成、SOFT只提示。同actor混合组逐组检查，现有node/phase完成入口仍一次确认本人该阶段全部可写组，不新增按组单独完成入口。
- 子授权完成写入既有authorization_settings.calibration_completed_at/by；原owner才写task.calibration_completed_at/by并执行自动开放检查。管理列表子行按授权记录完成状态显示，父行仍按原task；完成元数据不参与递归授权分组。无新表、迁移或历史回写；历史授权缺独立完成凭证不从共享task推测其已完成，历史父task标记保持原值。
- completion digest纳入有效授权记录、设置及完成状态；预览后授权模式变化会返回CALIBRATION_SCOPE_CHANGED，强制分布违规返回CALIBRATION_DISTRIBUTION_VIOLATED。preview新增可选blocked_reason/has_original_tasks，前端复用原确认框说明仅完成授权任务，区分分布违规提示；允许再次点击重新预览，避免调整结果后按钮永久禁用。保留缺失结果本身不强制阻断、校准完成后期限内仍可编辑的既有行为；完成时校验不代表后续编辑后分布永远合规。
- 后端完整回归：`DB_HOST=127.0.0.1 DB_PORT=1 PYTHONPATH=hr-portal/backend hr-portal/backend/.venv/Scripts/python.exe -m pytest hr-portal/backend/tests/test_performance_projects.py hr-portal/backend/tests/test_performance_shared_results.py hr-portal/backend/tests/test_performance_user_authorization.py -q --tb=short` → **1144 passed、5 skipped、28.94秒、exit0**，既有python_multipart弃用警告。新增SQLite真实ORM独立完成保存回读、NONE子完成父仍阻断、不推进父流程、授权变更使预览失效、NONE父的INHERIT后代不自动豁免、混合授权组与只读拒绝；权限入口部分使用mock，不作为完整真实鉴权验收。随后补管理列表完成元数据不拆组/子已完成父待校准断言，定向 **2 passed、1120 deselected、exit0**。首轮旧夹具缺快照字段及旧完成返回结构导致失败，补齐后通过。
- 前端：`npm --prefix hr-portal/frontend run test -- src/views/performance/Review.spec.ts src/views/performance/ProjectManagement.spec.ts src/components/performance/PerformanceDistributionTips.spec.ts --silent` → **220 passed、exit0**；`npm --prefix hr-portal/frontend run build` → **vue-tsc+Vite通过、3789模块、exit0**，既有VueUse PURE提示。
- UI：真实Vite路由、独立Chromium、所有API合成隔离；子授权完成确认显示父任务仍需完成，父任务HARD违规显示明确提示且不开确认框，pageErrors=[]。独立PNG已读取：`ui-blueprints/CR-007-F04-implemented-delegated-completion-none-20261120.png`。真实PostgreSQL/生产身份/API/部署未验收，5项跳过不计通过；F04/F05整体不勾选。未修改生产数据、未真实发送、未commit/push/deploy。

### 2026-11-21 F04 名单协助授权入口及共享上级分组

- 用户明确开发：未授权名单搜索工具栏右侧增加蓝色实体「协助授权」；未授权/可校准名单结果行右侧共用「分组」及 hover 浮层，点击「按上级分组」切换，再点取消。既有页面增强，无新页面/完整蓝图/迁移/权限点。
- REA 实采：DOM `ev_09a9c586236fa56ab032e4ba0fca5df9541b8aa5a9f9891ccbe1d29e7af49b8e`，截图 `ev_990be9fb564b91ad0c048fa1b6b59e785cd6ced925ba2cacb448140c23b9ded7`。大结果只提取目标可见文本与截图，不声称全量审阅。CDP定向读取按钮/浮层/组行：实体按钮约97.33×32、背景#1456F0、加号、圆角6；分组按钮14/22、padding2/4，激活蓝色、hover灰底；浮层复用12/16内边距、8圆角、10间距及原阴影；灰色组行#f0f3f5、高47、层级缩进15。实际打开协助授权表单后取消，未提交飞书授权。
- 实际接口：`GET /perf/api/review/adjust/unauthorized/reviewee_list` 带semester_id/task_id/role/role_id/group=0或1/filters，group1返回unauth_groups的group、parent_group、user_ids；任务详情沿`/perf/api/review/adjust/task/detail`。切换会消费已加载分组数据及快照人员补全，不能将仅一次切换无新名单请求解释为没有后端分组。
- 实现复用：`ProjectCalibrationAuthorization.openAuthorization` → 同一`PerformanceTaskDelegationDialog`及`useTaskDelegationRequests`，名单按钮使用`UiButton primary`和`AddOutlinedIcon`；完整候选、范围、分布、通知、幂等与未知结果恢复仍为同一链。任务集合保持原行范围，携带source_rule_id/source_authorization_id；未授权名单只显示差集，搜索不改变授权来源。无权/加载/保存按钮disabled，不请求候选或写接口。成功及refresh回到原load，名单从新rows按ID解析，避免旧行缓存。
- 原校准GET增量返回people_groups={id,parent_id,label,employee_nos}[]，`_calibration_people_groups`仅消费既有已掩码冻结task_people，不查询实时组织、扩大可见字段或写快照；同名不同工号不合并、无上级单组、缺父组归根，按名称/身份稳定排序。`FocusGroupPeopleDialog`共享`PerformancePeopleGrouping`，复用`PerformancePopover`及全局token；`PerformanceManagementTable`→`UiTable`新增可选before-row/rowVisible桥接渲染组标题，普通调用默认不变。
- 展示合同：hover只开浮层；选项点击toggle并保持蓝色激活，组标题可折叠含下级组；先搜索后组织树，保留匹配项祖先，不增人数。分组时显示完整匹配树并隐藏平铺分页，取消恢复分页；切换/搜索回第一页，关闭重开重置分组与折叠。两类名单共用实现，可校准名单仍沿原全任务口径，未改成授权差集。
- 定向前端：`npm --prefix hr-portal/frontend run test -- src/views/performance/ProjectManagement.spec.ts src/components/performance/focus-group/FocusGroupPeopleDialog.spec.ts src/components/ui/UiTable.spec.ts --silent` → **88 passed、3文件、exit0**，覆盖权限允许/拒绝、来源传递、刷新、同名/无上级、父子折叠、搜索及取消/重开。首次新增分组用例因未挂载DOM导致浮层锚点断开及jsdom ElSelect递归失败，改为挂载body并沿既有ElSelect stub后通过，未放宽业务断言。
- 定向后端：`DB_HOST=127.0.0.1 DB_PORT=1 PYTHONPATH=hr-portal/backend hr-portal/backend/.venv/Scripts/python.exe -m pytest hr-portal/backend/tests/test_performance_projects.py hr-portal/backend/tests/test_performance_user_authorization.py -q --tb=short -k "calibration or delegation or task_authorization or authorization_records"` → **273 passed、2 skipped、866 deselected、22.88秒、exit0**，既有python_multipart弃用警告。分组身份/父关系/无上级/空集合和授权权限回归通过；未连接业务数据库。
- 最终构建：`npm --prefix hr-portal/frontend run build` → **vue-tsc+Vite通过、39.78秒、exit0**，仅既有VueUse PURE提示；`git diff --check`通过，保留LF/CRLF提示。工作区其他沟通进度、API类型、360及文档并行差异均保留，不计为本次交付。
- UI证据：真实Vite路由、独立Chromium、1280×673/DPR1、所有API合成隔离；两类名单hover/toggle/层级折叠通过；蓝色按钮98×32/#1456F0，原弹窗选择接收人及全部3人，3条原`/tasks/{id}/delegations`请求分别携带正确父授权21/22/23和规则r1、原幂等键；模拟成功后未授权3→0，pageErrors=[]。首轮候选夹具形状错误已修正，第二轮定位误用button超时后改用真实combobox完成；失败尝试未计通过。独立PNG均已查看：`ui-blueprints/CR-007-F04-implemented-unauthorized-grouping-20261121.png`、`ui-blueprints/CR-007-F04-implemented-authorized-grouping-20261121.png`、`ui-blueprints/CR-007-F04-implemented-people-assist-authorization-20261121.png`。
- 局部开发及本地验收完成；真实JWT/PostgreSQL保存回读、生产部署与同数据整页像素一致验收未运行，F04/F05/T11整体仍未勾选。适用Spec012 A01/A02/A0502/A0503/A0505/N0001/N0002/N0004/N0005/N1102–N1104，数仓/UCP专属不适用；授权按钮采用PM001具体规则保留disabled。未commit/push/deploy，无真实授权或外部通知。

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

## 2026-11-16 CR-007-F14 绩效沟通编辑态与阅读态催办接入

- 用户明确要求绩效沟通并开通结果沿用上级评估单个催办逻辑。来源资格解除沟通任务end_at对催办动作的误限制，仍校验已开始、可写处理人、授权/转交/撤销、项目/员工/周期/快照及催办开关；未提交/已提交沟通来源均可催办原有未完成目标。校准/复议来源期限、评分/沟通编辑权限、结果开通逻辑不变，无迁移或生产数据修改。
- 阅读态template-task view=drawer为result_communication复用既有_project_member_detail，透传management_tabs/stage_views和真实source_task_id；编辑态继续按配置reference_tabs复用共享按钮、MemberReminderDialog及通知预览。具体目标走node_id/task_id；360走限定员工/节点的target_kind，不复制第二套弹窗或通知服务。
- 后端：扩充normal/test_receiver、普通/预加载、evaluation/communication、pending/completed来源组合，保留6类拒绝。修复前沟通四组合失败、原上级四组合通过；最终 `DB_HOST=127.0.0.1 DB_PORT=1 hr-portal/backend/.venv/Scripts/python.exe -m pytest hr-portal/backend/tests/test_performance_member_reminders.py hr-portal/backend/tests/test_performance_projects.py hr-portal/backend/tests/test_performance_reconsideration_results.py -q --tb=short` →948 passed/5 skipped/1第三方python_multipart警告。仅替身/传输mock，不代表真实数据库或外发验收。
- 前端：`npm --prefix hr-portal/frontend test -- src/views/performance/Review.spec.ts src/views/performance/SelfSummaryTask.spec.js src/components/performance/PerformanceReviewEvaluationDrawer.spec.ts src/components/performance/PerformanceMemberReminderDialog.spec.ts --silent` →4文件275 passed，覆盖真实只读抽屉及编辑页工作总结/自评/360按钮事件到共享Dialog、精确来源及目标参数。`npm --prefix hr-portal/frontend run build` →vue-tsc+Vite exit0，3719模块，既有VueUse PURE/包体告警。
- 浏览器：真实Vue路由、Chrome headless1440×900、全部API隔离合成。沟通编辑工作总结、阅读自评均可打开outline催办/预览，取消无写请求；各确定一次POST /members/E001/remind，source_task_id=22，目标summary/71、self/72。无开通结果请求，pageerror=0、关闭后alertdialog=0/body overflow恢复。独立截图已查看：ui-blueprints/CR-007-F14-communication-edit-reminder-20261116.png、CR-007-F14-communication-read-reminder-20261116.png；不视为生产鉴权/API/数据库/飞书验收。
- 本轮仅member_reminders.py、projects_router.py、两个既有后端测试、Review.spec.ts/SelfSummaryTask.spec.js及本记录/截图；保留并行复议组件样式和其它会话修改。无提交推送/部署/外发；F14真实环境验收仍未完成，不勾选整体完成。

## 2026-11-16 CR-007-F14 上级评估截止后催办资格纠偏

- 用户提供只读生产 SQL：周期12、项目24、成员快照8；工作总结14260及自评14670为pending且未提交，上级评估15080已提交、未撤销、截止2026-11-11 15:59 UTC；无ACTIVE转交或授权，催办开关开启且允许work_summary/evaluation。本文不记录人员姓名或其它快照内容。
- 根因：`member_reminders._source_allowed` 将来源任务评分截止时间作为催办资格到期时间，故上级评估阅读详情返回can_remind=false。项目管理无source使用独立管理范围，不受此截止检查，因此两入口表现不同。SQL中的来源handler与冻结直接上级一致；姓名模糊身份映射查询0行不能推定工号映射缺失，真实API/接收人投递可用性仍待验证。
- 最小修复：仅对已通过MANAGER_ROLE_CODES及可写处理人检查的evaluation来源，不因评分end_at过去而拒绝催办；未开始、无关/自评/360来源、只读、转交原人、撤销、快照越界和催办设置继续校验。校准、沟通、复议来源的期限限制不变；目标须为原有可催办未完成任务，不修改其截止时间/状态/答案，不触发真实通知。无模型或迁移变更。
- 证据：新增已提交且过期上级来源＋逾期未提交工作总结/自评的普通及预加载路径、预览零写、发送目标断言与六类拒绝测试；修复前2 failed/6 passed，修复后 `DB_HOST=127.0.0.1 DB_PORT=1 hr-portal/backend/.venv/Scripts/python.exe -m pytest hr-portal/backend/tests/test_performance_member_reminders.py hr-portal/backend/tests/test_performance_projects.py -q --tb=short` →862 passed/5 skipped/1第三方python_multipart警告。测试使用替身，不是生产API/真实库/真实投递验收。
- 补充生产SQL确认投递模式test_receiver、指定测试接收账号有效；两员工无显式映射且快照未绑定Portal，但已知登录账号均在用且有飞书身份。因此缺映射不是当前测试接收模式的候选过滤原因，不据此补映射或改变投递模式。新增normal/test_receiver × 普通/预加载四组合测试，test_receiver清空映射复现生产条件；最终同一两文件命令864 passed/5 skipped/1第三方警告，发送传输仍mock，不视为真实投递验收。
- 本轮仅member_reminders.py、test_performance_member_reminders.py及本记录；保留其它会话成本中心/仓库/复议diff。用户执行SQL为只读证据；未改生产数据、未部署或外发，本轮提交/推送须另行明确指令。整体F14仍不勾选。

## 2026-11-13 CR-007-F14 单个催办与批量催办分离

- [ ] CR-007-F14：本地实现、定向自动化与隔离浏览器交互已验证；真实鉴权 API／PostgreSQL／通知投递及生产部署未验收，不勾选整体完成。
- 2026-11-19 管理者复议催办配置闭环（用户授权实现）：生产只读反馈确认有结果查看权的间接上级没有目标员工的上级评估任务，旧 resolver 返回 PROJECT_MEMBER_REMIND_FORBIDDEN；配置原四项亦未含复议。本轮复用 OtherPermissionSettings、GET/PATCH `/performance/permission-settings/other`、member_reminders 统一 resolver、共享单人催办确认/预览/发送，不改模型、迁移、冻结快照或真实生产。
- REA依据：`https://idreamsky.feishu.cn/perf/admin/selection` 弹窗600px，标题“可管理进展的环节类型”、十项checkbox和说明。线上 POST `/perf/api/user/custom_settings/save` 的 `{config_key: leader_remind_config, config_value: {stage_type, config_open_flag}}`，POST `/perf/api/user/custom_settings` 回读；证据 `ev_15b2c2d12941dab8b7ccac0a969d4a7f358427e18bfdcaefff0dfa9df16ea8ba` 序号514/522/529/544确认原四项保存成功、未改变线上勾选。网络采集含未完成请求，整体非完整等价证据；仅引用已完成配置交易，未完整展开无关静态资源。选项运行时props核对：kpi_metric_setting→同名、kpi_result_recording→同名、goal_setting→work_summary、invitation→reviewer_360_invite、confirm_invitation→reviewer_360_confirm、review→evaluation、adjust_review→calibration、communication→result_communication、view_result→result_view、appeal→result_reconsideration。后两类指标执行链本轮不新增；选项配置不表示已实现对应业务节点。
- 权限合同：复议普通管理者必须同时具备目标员工 RESULT_READ、属于该任务有效可写处理人的冻结上级链；不以被评估人的上级链替代处理人链。有效授权经 writable 集合求交，TRANSFER移除原处理人链，缺失快照人员或循环不兜底实时组织。无评估来源任务时新增资格只开放复议，不扩其它任务；显式无效source不回退。独立HRBP/项目管理范围原合同保留，不以任意假source代替第四项任务；新增scope_mode明确管理/来源/复议上级三路径。后台开关及允许类型约束新增路径和原来源路径，详情 can_remind、列表、预览、单次及批量发送同一裁决；不改变复议编辑权。任务须pending/未撤销/已开始/真实未关闭未撤回复议，排除自催办；发送继续锁定重验、六小时去重、preview_only和审计。
- 配置兼容：还原十项选项及说明，默认仍为work_summary/evaluation/result_communication/result_view，不自动追加复议或回填旧选择。明确保存[]后GET/PATCH/审计前值均保持空；仅None缺失回退默认。后台仍需绩效配置权限，未知枚举422，局部PATCH不覆盖HRBP设置。
- 验收：配置API→GET重开→实际 resolver 的列表/预览/旧单次发送受控ASGI测试，发送传输mock；关闭开关后详情can_remind=false、预览404、发送422。有效复议handler直接/间接上级无评估任务允许，预加载/非预加载一致；仅目标员工上级、无RESULT_READ、只读转交、原handler转交失效、无效source、未勾选/空集/开关关闭拒绝。真实Vite5173路由 `/performance/settings/permissions/other`＋隔离Chrome/合成API验证10项、初始4勾选、勾选复议保存/重开、清空重开0勾选、pageerror=0；独立截图 `../ui-blueprints/CR-007-F14-manager-reminder-types-20261119.png` 已读取。既有页面局部调整，Spec012 N00/N11适用，无新蓝图。
- 自动化证据（2026-11-19）：`DB_HOST=127.0.0.1 DB_PORT=1 hr-portal/backend/.venv/Scripts/python.exe -m pytest hr-portal/backend/tests/test_performance_member_reminders.py hr-portal/backend/tests/test_performance_other_permission_settings.py hr-portal/backend/tests/test_performance_management_scope.py hr-portal/backend/tests/test_performance_reconsideration_results.py -q --tb=short` → **235 passed、1既有python_multipart弃用警告、23.31s**；包括复议详情调用真实can_remind resolver、真实RESULT_READ权限服务/冻结关系计算及配置ASGI联动，数据库和通知传输使用替身。前端 `npm --prefix hr-portal/frontend test -- src/views/performance/OtherPermissionSettings.spec.ts src/views/performance/Review.spec.ts src/components/performance/PerformanceReviewEvaluationDrawer.spec.ts src/components/performance/PerformanceMemberReminderDialog.spec.ts --silent` → **4文件213 passed**。`npm --prefix hr-portal/frontend run build` → **vue-tsc＋Vite通过、36.58s**，既有VueUse PURE提示；git diff --check通过。早期失败分别为新增权限查询的旧替身、导航夹具、写死0295 head及复议列表三列/五列查询形状，已修复测试边界/投影夹具后通过，未改旧迁移或放宽权限；迁移仍验证单head及0295祖先关系。
- 未执行：真实PostgreSQL（本机Docker引擎未启动）、生产账号API和真实飞书投递；不把ASGI替身或合成截图视为生产验收。发布后需管理员在原弹窗明确勾选复议并开启总开关，再用真实间接上级入口验证；本轮不自动改生产配置、提交推送或部署。
- Goal／依据：用户确认修复单个与周期批量催办混用，统一项目管理成员列表、上级评估、校准、绩效沟通及编辑／阅读态的按钮与催办功能。沿用 CR-011 既有确认＋hover 预览交互，无新增页面或信息架构，不要求新蓝图。
- 契约：一个被评估员工不等于一个通知接收人。具体环节用 node_id/task_id；360入口用 target_kind=reviewer_360 与 node/task 严格交集，GET取得该员工可用任务集合，确认才向成员级 remind-batch 提交明确 task_ids。单任务走原成员 remind；周期去催办仍走 cycle-remind 独立路由。结果开通独立，禁止借催办执行开通。
- 前端：新增 PerformanceMemberReminderDialog.vue 及其组件测试，复用 ConfirmDialog／Popover／PreviewCard／Checkbox；编辑／阅读空态统一 outline 铃铛＋催办，360统计浮层保留文本按钮。三个页面共用 composable，抽屉使用真实 stage.task_id 及加载后的来源任务；沟通列表增加评估率浮层，普通360评估人界面不增加催办。删除批量面板 member-remind 模式及其 API 分支，防止重新误接。预览与发送响应按上下文和身份代次丢弃，关闭清理浮层，发送完成只保留一个结果弹窗；success／partial／preview／failed／skipped不混称成功。
- 后端：成员列表、预览、单次与集合发送共用 resolver；source 支持上级评估／校准／沟通可写任务，绑定项目、周期、员工、历史快照及时间窗，校准使用既有对象授权与阶段校验。source 命中不再管理回退；只读／转交原处理人／撤销／越界拒绝。预览和发送共享消息构建及截止时间，reminder_name 是操作者，reminder_target 是收件人说明；360通用称谓不泄漏实名。旧单次增加 source_task_id、skip_recently_reminded 并委托统一发送；保留通知日志六小时去重及审计。
- 允许改动：backend/app/performance/{member_reminders,projects_router}.py、既有两个后端测试；frontend/src/api/performance.ts、performanceReminder.ts、usePerformanceMemberReminder.ts、新 Dialog及spec、ReminderPanel及spec、ReferenceContent／ReviewContent／Review360FeedbackPanel／ReviewEvaluationDrawer、ProjectManagement／Review／SelfSummaryTask及既有测试。共享 API 保留并行请求去重改动；未修改其它会话身份切换、Layout、store、Workbench或用户 router diff。不改模型／迁移／快照／角色配置／生产，不新建脚本、报告或测试文档，不自动提交推送。
- 前端最终命令：`npm --prefix hr-portal/frontend test -- src/components/performance/PerformanceMemberReminderDialog.spec.ts src/components/performance/PerformanceReminderPanel.spec.ts src/components/performance/PerformanceConfirmDialog.spec.ts src/components/performance/PerformanceReviewEvaluationDrawer.spec.ts src/views/performance/Review.spec.ts src/views/performance/ProjectManagement.spec.ts src/views/performance/SelfSummaryTask.spec.js --silent` → **7文件356 passed**。单线程早期组合运行出现 enableAutoUnmount 二次注册收集失败，正常隔离的最终七文件命令已通过，不修改业务以规避。`npm --prefix hr-portal/frontend run build` → vue-tsc＋Vite exit0、3700模块；既有VueUse PURE与chunk体积告警。
- 后端主线程命令：`DB_HOST=127.0.0.1 DB_PORT=1 hr-portal/backend/.venv/Scripts/python.exe -m pytest hr-portal/backend/tests/test_performance_member_reminders.py hr-portal/backend/tests/test_performance_projects.py -q --tb=short` → **851 passed／5 skipped／1 python_multipart弃用警告**。仅测试替身与传输mock，不连接真实业务数据库；跳过项不计通过。覆盖来源允许拒绝、阶段／授权／快照、360交集与预加载、预览零写与消息一致、单次接口去重。
- 浏览器：本地Vite真实Vue路由、Chrome headless、1440×900，所有 `/api/v1/*` 响应隔离为合成数据。阅读抽屉、编辑校准参考、成员360浮层均进入共享确认与预览；预览／取消写请求0，具体任务POST携带 node_id/task_id，校准来源 source_task_id=11，360仅task_ids=[81,82]且target_kind=reviewer_360，成功／部分成功反馈正确。关闭后alertdialog=0、body overflow为空、pageerror=0、未匹配API=0。不是实际外发或真实鉴权API验收。
- 独立UI证据（已查看）：`ui-blueprints/CR-007-F14-implemented-member-reminder-20261113.png`、`CR-007-F14-implemented-edit-reminder-20261113.png`、`CR-007-F14-implemented-360-reminder-20261113.png`。既有组件/token复用、无新增视觉体系；未宣称像素完全一致。未执行生产、真实数据库／飞书投递、并发幂等实测。停止仅撤销本卡增量，不整包回滚或删除任务／审计。

## 2026-11-18 CR-007-F15 公用姓名状态与授权历史

- 发布授权：本地验收后，用户明确要求在 main 提交并推送；仅本卡增量，不包含临时文件，不执行部署。下文“无commit/push”记录的是开发验收时点。
- [ ] CR-007-F15：本地开发、前后端自动化、构建及合成数据浏览器验证完成；真实登录 API/PostgreSQL/生产未验收，整体验收保持未勾选。
- 用户确认：撤销后无有效同类记录则标签消失；固定顺序“已授权、已转交、已离职”；悬浮包含同类型完整历史及校准授权，最后操作排最上。延续已采集姓名右侧同行标签和原成员列表信息架构，无新页面/菜单或新蓝图。
- 读取契约：原名单按权限筛选及分页后批量补 `identity_status={live_employment_status,delegations}`。记录含 id、authorization_type、status、operator_name、recipient_name、original_handler_name、stage_name、created_at、operated_at、revoked_by_name；只读，沿既有成员查看范围，不引入新操作权限或明细端点。项目＋成员快照＋员工号精确关联；实时在职优先、冻结字段兜底且不覆盖；ACTIVE 驱动标签，REVOKED/REPLACED 保留历史，撤销任务的失效 ACTIVE 不返回。校准纳入，360 评估人的授权记录匿名边界保留，邀请评估人仅补实时状态。
- 实现边界：后端新增 `member_identity_service.py`，接入 project/cycle members、导出、matrix、review taskPeople、360 feedback/invites、reminder-people、result-opening people。前端扩展 `PerformanceMemberIdentity`，新增 `PerformanceMemberDelegationTag`，复用 `PerformancePopover`；成员/评估/360/矩阵及提醒名单传入身份状态，矩阵保留纯姓名无头像形态。普通主管、HRBP、校准处理人与候选选择器不套用被评估人任务标签。
- Token：新增人员列表24px头像、状态20px/12px/左右6px/圆角4px/间距4px及绿灰语义色；所有新外观数值集中 `tokens.css`，移除姓名胶囊/离职色局部硬编码。浮层继续消费全局420px宽、12/16px内距、8px圆角、箭头与阴影；长姓名独立省略，标签保留；键盘focus/click打开、Escape关闭，标签点击不触发行详情。
- 允许文件：backend/app/performance/{member_identity_service,projects_router,review_360_feedback_router,review_360_invites_router}.py、backend/tests/test_performance_member_identity.py 及受影响项目测试夹具；frontend API类型、姓名/标签/成员/反馈/邀请/提醒/矩阵组件及姓名组件测试、tokens.css、本记录和独立截图。共享文件只精确 Edit，保留并行校准规则预览增量。无模型、迁移、历史快照、授权写流程、角色配置或生产变更；不自动提交推送部署。
- Given/When/Then：同时存在有效授权/转交及实时离职→按固定顺序展示；撤销最后有效记录→标签及已打开浮层消失；历史包含校准/撤销/替换→完整保留并按 operated_at 倒序；同工号跨项目/快照→记录不串用；匿名360→不泄漏处理人授权历史；旧响应无 identity_status→保持原展示。
- 前端证据：`npm --prefix hr-portal/frontend test -- src/components/performance/PerformanceMemberIdentity.spec.ts src/components/performance/ProjectPerformanceMatrix.spec.ts src/components/performance/PerformanceReminderPanel.spec.ts src/views/performance/ProjectManagement.spec.ts src/views/performance/Review.spec.ts --pool=threads --poolOptions.threads.singleThread=true --silent` → **5文件221 passed**；`npm --prefix hr-portal/frontend run build` → vue-tsc＋Vite exit0（3772模块，既有VueUse PURE提示）。首次npm exec外部调用发生Vitest suite收集错误，改用项目npm test后通过，不改业务绕过测试。
- 浏览器证据：本地Vite真实Vue成员表格、全部API隔离合成数据，1440×900与390×844；三个标签顺序、撤销隐藏、校准历史倒序、转交悬浮、长姓名不裁标签、键盘Escape通过。实测20px/12px/4px/0 6px/rgba(53,189,75,.2)；窄屏浮层左右16px，pageerror=0。`ui-blueprints/CR-007-F15-member-identity-history-20261118.png` 已查看，含全局Element样式的最终截图；前一次隔离页缺Element样式已更正，不将组件截图当作真实登录/API/数据库验收。
- 后端最终证据：`python -m pytest hr-portal/backend/tests/test_performance_projects.py hr-portal/backend/tests/test_performance_member_identity.py -q --tb=short` → **837 passed / 5 skipped / 1 python_multipart第三方弃用警告，31.24s，exit0**，主线程已核对完整日志 `.tmp-member-identity-pytest.log`；独立身份13项主线程复跑通过，含真实SQLite执行SQL、校准/匿名/跨项目快照、当前页及拒绝范围。另跑 auth_context/member_reminders/subject_visibility 三文件 → **128 passed / 1同类警告**。首轮全量35个旧fixture失败已通过精确补投影形状、快照字段、空查询结果及真实查询次数恢复；未mock整体hydration、未按Session类型跳过、不改变原业务断言或并行校准8项。`git diff --check` 通过，仅换行转换提示。真实PostgreSQL/登录API/生产未执行，5跳过项不计通过。无数据库迁移、实际通知、commit/push/deploy。停止仅撤回本卡增量，保留快照、任务、答案及审计。

### 2026-11-18 CR-007-F15-S01 绩效内部每日在职状态刷新

- 发布授权：本地验证后用户明确要求在main提交并推送本卡六文件；不部署或执行生产首次补齐。下文未提交推送指开发验收时点。

- [ ] CR-007-F15-S01：用户确认每天北京时间09:00由绩效消费方刷新，允许正常情况下接近24小时延迟；不改花名册写入，不在名单GET实时查花名册。本卡为后端修复，不新增UI/蓝图/迁移。
- 目标/契约：注册全局统一任务 `performance_employment_sync`（business_id=0，cron=`0 9 * * *`，Asia/Shanghai，kind不超过32字符）；启动幂等补任务，保留管理员已有启停/调度设置。复用现有run-now/retry、scheduled_jobs.last_*与job_runs，不新调度器或历史表。
- 消费与事务：按工号读取花名册已有实体列 `employment_status/active_status`；空值跳过，已知状态归一化；两列或重复工号状态冲突、未知/缺失保留原绩效值并汇总计数。批量更新所有已有授权快照（含锁定周期）的live_employment_status；只允许该列与自动updated_at变化，冻结状态/组织/姓名/成员/任务/授权不变。执行器统一提交/回滚，handler不commit；源表/必要字段不可用或SQL失败按失败历史记录，不伪报成功。
- 文件边界：只允许backend/app/performance/snapshot_service.py、scheduler/handlers.py与engine.py、既有tests/test_performance_member_identity.py与test_quality_dependency_hardening.py、本记录。禁止datasources写流程、共享花名册契约、模型/迁移、前端与并行校准修改。现有名单读取逻辑保持，供结果开通/360等原消费者继续读取同一绩效live字段。
- 验收：真实SQLite执行批量SELECT/UPDATE，覆盖锁定快照/多周期、生产active_status样例、双列空值/冲突、重复/缺失/未知、幂等及事务回滚；同步→新会话读取姓名identity状态，断言冻结字段/任务不变。调度测试覆盖09:00时区、kind长度、注册幂等和保留已有配置、失败历史及重试入口。首次补齐走已有run-now由部署者受控执行，不在开发环境操作生产。停用只禁用该任务，不清空已同步值。
- 实现：snapshot_service.refresh_live_employment_statuses按固定ID顺序锁定绩效人员行，工号查询与状态写入每1000项分段；两个状态字段都存在时跳过空值，规范化中文/既有英文枚举，同工号跨列及重复源行冲突不更新。只改live_employment_status及ORM自动updated_at，无内部commit；调度kind长度27、09:00上海时区、ON CONFLICT DO NOTHING保留已有设置。GET和前端零改动，空绩效名单不查源表；无身份、答案、任务或授权操作。
- 最终本地证据：`DB_HOST=127.0.0.1 DB_PORT=1 PYTHONPATH=hr-portal/backend hr-portal/backend/.venv/Scripts/python.exe -m pytest hr-portal/backend/tests/test_performance_member_identity.py hr-portal/backend/tests/test_quality_dependency_hardening.py hr-portal/backend/tests/test_performance_cycles.py hr-portal/backend/tests/test_performance_snapshot_service.py hr-portal/backend/tests/test_performance_projects.py hr-portal/backend/tests/test_performance_comparison_notifications.py -q --tb=short` → **976 passed / 7 skipped / 1 python_multipart第三方弃用警告，19.46s，exit0**。SQL测试含1001工号分段、真实新会话回读、引擎失败回滚/失败历史/重试成功及二次bootstrap不重置管理员disabled和cron；SQLite不验证PostgreSQL行锁语义，生产/真实PostgreSQL与调度时刻实际运行未执行，跳过项不计通过。本卡diff --check通过，无前端构建（未改前端）、迁移、生产写入、真实外发、提交推送或部署；本地开发完成，整体仍未勾选。

### 2026-11-18 CR-007-F15-G01 人员组姓名标签及可见权限

- 发布授权：本地验收后用户明确要求在main提交推送，仅本卡代码/测试/人员组token及截图；并行校准规则修改保留，不部署。下文未提交推送指开发验收时点。
- [ ] CR-007-F15-G01：本地开发、自动化、构建及合成UI验证完成；真实登录API/PostgreSQL/生产未验收，整体保持未勾选。用户确认标签受show_group_tag和人员组对谁可见共同控制。原姓名列原位增强，无新页面/蓝图/迁移，不纳入每日09:00在职同步。
- 契约：identity_status增加可选group_tags数组，项为{group_id,name,text_color,bg_color}；后端按周期/项目/员工真实归组、开关和查看者过滤；mode1复用目标员工绩效查看范围，mode2仅可信员工身份匹配关注人工号，无管理角色旁路。无context不返回组标签，授权/开通/催办操作范围不自动当查看范围；未知可见模式拒绝。隐藏组ID/名称不传前端，项目组限定其关联项目，当前配置下次名单读取生效，不改冻结人员信息和原业务权限。
- 入口/职责：批量身份补全服务传递context及精确(project_id,snapshot_id,employee_no)已验证查看集合；项目成员/矩阵沿原data-view范围，taskPeople/360反馈沿已验证目标任务查看权，结果开通/催办在有候选组时按项目核验；360邀请保持评估人live-only，不把任务被评估人标签贴到评估人。人员组维护人不自动取得标签或绩效查看权。
- 前端：PerformanceMemberIdentity复用20px/12px/左右6px/4px圆角/4px间距，新增最大宽度120px token；普通文本标签、不附操作历史弹窗，配置色经颜色字面量校验；默认状态顺序保持授权→转交→离职，组标签排其后且按稳定组ID顺序。长组名省略，title展示完整名称；旧响应缺group_tags兼容。
- 文件范围：backend身份服务/必要专用组标签服务、project/360路由、身份/项目测试；frontend performance.ts、姓名组件及既有测试、tokens.css、本记录和独立实现截图。共享文件精确Edit，保留并行校准改动；不改人员组存储/维护、花名册/调度、模型/迁移或生产，不自动commit/push/deploy。
- 验收：开关关闭/非关注人/未知模式/身份歧义/仅有操作权限→接口不含隐藏标签；mode1目标有查看权/mode2关注人且原名单可见→显示真实名称颜色；跨项目周期不串用、身份切换及组删除改名改色移人刷新生效、SQL批量；组件+现有名单回归、build和真实Vue合成API浏览器分别记录，不以mock证明生产权限。
- 后端最终证据（执行者实际回归，代码/fixture已停止写入）：身份与组标签单文件 **58 passed**；`python -m pytest hr-portal/backend/tests/test_performance_projects.py hr-portal/backend/tests/test_performance_member_identity.py -q --tb=short` → **882 passed / 5 skipped / 1既有python_multipart弃用警告，27.63s，exit0**。首轮13个失败由两处严格SQL夹具尚未接受新增候选组查询引起，已精确补空结果分支并保留原业务断言。覆盖真实SQLite执行、组开关/两个可见模式/未知模式/可信关注人匹配/跨项目周期快照/批量/当前配置删除改名移人/匿名及taskPeople入口；不是生产鉴权API或PostgreSQL验收，跳过项不计通过。
- 前端本地证据：`npm --prefix hr-portal/frontend test -- src/components/performance/PerformanceMemberIdentity.spec.ts src/components/performance/ProjectPerformanceMatrix.spec.ts src/components/performance/PerformanceReminderPanel.spec.ts src/views/performance/ProjectManagement.spec.ts src/views/performance/Review.spec.ts --pool=threads --poolOptions.threads.singleThread=true --silent` → **5文件224 passed**。新增组名/配置色、响应改名/移除、纯姓名模式、CSS字面量限制与文本转义回归；旧授权/离职及名单行为保留。
- 构建：`npm --prefix hr-portal/frontend run build`最终vue-tsc＋Vite **exit0**，3776模块、58.19s；仅既有VueUse PURE注释提示。前三次被并行校准文件在途类型错误阻塞（DetailTable旧枚举、ProjectSettingsPage测试导入、FlowSettings组织树level），由对应会话修复后完整构建通过，未跨改其业务文件；tokens并行rule-summary/table块保留。本卡diff --check通过，仅LF/CRLF提示。未执行真实登录API/PostgreSQL/生产、迁移或外发，未自动提交推送部署。
- UI证据：本地真实Vue成员表格＋隔离合成API，1440×900与390×844；组标签84×20、12px、圆角4、内距0 6px、#151b70/rgba(91,101,245,.2)与REA一致；长标签最大120px并省略/title，hover无授权弹窗。多标签初测挤没姓名，已改为保留姓名、空间不足时标签换行；最终390px姓名区域clientWidth=scrollWidth=200、姓名宽56、pageerror0。改名刷新和响应移除标签通过；独立截图 `ui-blueprints/CR-007-F15-G01-member-group-tags-20261118.png` 已查看，不是生产权限或真实后端验收证据。Spec012 UI交互/守则已读，无UCP、数仓重复配置或危险操作。

## 2026-11-18 CR-007-F16 团队与关注人员绩效结果只读视图

- [ ] CR-007-F16：完成“查看团队绩效结果”和“关注人员的绩效结果”前台闭环；本地代码、自动化、构建和浏览器验收完成后才能勾选，真实生产部署另行验收。
- 入口与显隐：两个入口位于“绩效评估 → 我团队的绩效”。团队入口仅在所选周期快照中存在参加绩效项目的直接或间接下级时显示；关注入口对可见人员组计算成员并集，再与当前用户绩效结果读取范围求交，结果非空才显示。空组、无可见组、求交后为空均不显示；直接访问接口仍执行同一权限判断。
- 快照口径：上下级只读取周期授权快照，直接下级和间接下级按快照直属上级链递归计算；实时花名册变化不得静默改写已启动周期。后续变化必须通过显式更新功能处理，本卡不实现快照更新功能。
- 人员组可见枚举：线上 REA 已确认 `view_permission=0` 为“仅关注人可见”，`view_permission=1` 为“有组内人员绩效查看权限的用户”；未知值拒绝。两种模式最终人员均与对象级 `RESULT_READ` 范围求交；人员组维护权、项目管理操作权和结果开通权不替代结果读取权。
- 页面结构：团队结果包含“总览、成员列表、矩阵分析、统计报表”；关注结果只包含后三项。团队总览复用周期概览完成率，限“填写工作总结、自评、360°反馈（自愿评估）、上级评估、绩效沟通并开通结果、查看绩效结果”，不展示绩效校准、结果复议、授权管理、其他模块或添加被评估人。
- 只读能力：成员列表无 checkbox、无批量底栏、无新增/删除、授权/转交、成员级催办；详情侧栏无右上角管理菜单。2026-11-19用户明确的复议例外：当前用户为有效可写处理人且未超过处理截止时，可从复议提示条编辑进入完整工作区；非本人按后端逐任务 can_remind 在处理人同行显示既有 text 催办。管理者复议催办配置与资格沿本文件F14的2026-11-19合同：RESULT_READ与有效可写复议处理人冻结上级链求交，受总开关/允许类型约束；仅能看目标员工结果不自动获催办权。复议以外沿原只读约束，不因结果查看权扩大任务写权或催办范围。团队总览节点级“去催办”保留并继续现有周期催办权限和通知链。
- 复用与实现：复用 `CompletionRatePanel`、`ProjectMemberListPanel`、`ProjectPerformanceMatrix`、`ProjectStatisticsReportPanel` 和 `PerformanceReviewEvaluationDrawer`；组件通过显式 readonly/provider 能力参数切换，不用 CSS 隐藏管理能力。后端提供一个权威结果范围解析器，成员、总览、矩阵、统计和详情共同消费按项目分组的范围。
- 测试：后端覆盖直接/间接下级、周期快照、无下级、两个 `view_permission`、未知值、非关注人、空交集、跨周期、详情越权和四视图同范围；前端覆盖动态菜单、团队4页签/关注3页签、六完成率节点、无管理控件、只读详情、空态/403/旧响应丢弃；执行定向 pytest、Vitest、build 和真实 Vue 路由隔离 API 浏览器验收。
- 非范围：不改模型/迁移、实时花名册、周期快照生成/更新、项目管理管理能力、结果算法、角色配置、生产数据或通知总闸；不部署、不实际外发消息。停止仅撤销本卡增量，不删除快照、任务、结果或审计。
- 实现：新增共享 `result_view_scope.py`，统一团队直接/间接下级和关注人员组结果范围；导航返回团队/关注入口资格；新增只读总览、成员、矩阵、统计和详情接口，团队总览催办 GET/POST 继续沿现有通知链并在发送时重校验同一结果范围。前端在绩效评估侧栏接入两个入口，新增 `PerformanceResultScopeView`，共享成员/矩阵/报表/详情组件通过 readonly/provider 参数复用；团队4页签、关注3页签，详情 readonly 时不渲染右上角管理菜单。人员组标签同步修正为线上真实枚举0/1。
- 自动化证据：`python -m pytest hr-portal/backend/tests/test_performance_projects.py hr-portal/backend/tests/test_performance_member_reminders.py hr-portal/backend/tests/test_performance_member_identity.py -q --tb=short` → **974 passed / 5 skipped / 1 python_multipart 第三方弃用警告**；前端 `Review.spec.ts`、`ProjectManagement.spec.ts`、`PerformanceReminderPanel.spec.ts`、`PerformanceReviewEvaluationDrawer.spec.ts` → **4文件268 passed**；另一次含矩阵/统计组件组合 → **5文件247 passed**。`npm --prefix hr-portal/frontend run build` → vue-tsc + Vite exit 0，3779模块，仅既有 VueUse PURE 注释提示。后端 py_compile、`git diff --check` 通过（仅 focus_group_tag_service 换行提示）。
- 浏览器证据与阻塞：本地 Vite 成功启动；REA 场景 `ev_b3b6e7ac8def992a16511ec8bca97b84a6e98acc7233c8d7b5e792b2249a4d74` 完整、无缺失段，但临时 Chrome 无登录存储，被路由守卫重定向到 `/login`。未使用生产登录态或伪造凭据，因此尚未完成真实登录下团队4页签、关注3页签及详情只读截图验收；本卡保持未勾选，不宣称生产验收或部署完成。

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

## CR-007-F17 双角色项目管理与周期视图统一

- 发布授权：本地验收后，用户明确要求在 main 提交并推送本卡代码、测试、蓝图及实现截图；不包含无关临时文件，不执行部署。下文“未commit／push”指开发验收时点。
- 状态：用户已明确确认 v1 蓝图及全部开发（2026-11-18）；本地前后端开发、定向自动化、完整构建及隔离数据浏览器验收完成。真实JWT登录API／PostgreSQL／生产尚未验收，整体任务保持未勾选，不将本地证据当作生产完成。
- 用户决定：无论项目数量均取消额外项目筛选；HRBP／项目管理员分入口共用内容，周期／项目共用四页签；项目复用工作台时间节点；HRBP 成员范围仅前端 UI，后端切换暂不实现。
- 权威修订：第5章原多项目筛选交互被本次决定替代；PM-001-T08 的双角色合并继续用于未显式选择身份的原有业务路径，新的具名管理入口必须按所选角色收窄，不得以另一角色或周期管理员旁路补权。不得据此改写历史周期快照。
- UI 蓝图：`ui-blueprints/CR-007-F17-project-management-v1.html`（v1）；独立预览 PNG `ui-blueprints/CR-007-F17-project-management-v1.png` 已生成并读取。仅布局／交互示例，非业务完成、像素验收或真实权限证明。
- 入口：`/performance/project-management` 沿用路由，使用 `management_role=hrbp|project_admin` 并保留 `cycle_id`／可选 `project_id`；默认仅在合法入口集合中选择，显式非法角色／无权项目拒绝，不回退到更大范围。浏览器前进后退、刷新及同页换角色均保持真实上下文；缓存包含身份、角色、周期、项目、页签与原写后失效版本。
- 数据契约：周期人员为所选角色合法项目人员；项目人员为其与指定项目的交集。进度、查看、导出、开通、任务授权各自按原独立功能裁决。服务端校验项目属于周期，按范围过滤后再统计／分页；详情、成员催办、周期催办、开通、授权记录／写操作不得因跳转恢复合并范围。现有未带管理入口的评估任务路径不改变。
- 共用：四页签复用 CompletionRatePanel、ProjectMemberListPanel、ProjectPerformanceMatrix、ProjectStatisticsReportPanel、现有详情及操作组件；周期矩阵不得回退首个项目。保留既有不兼容评级／重复成员冲突规则，不凭本次 UI 调整新增跨项目加权或评级换算。
- 时间轴：复用 PerformanceWorkbenchTimeline，在具体项目总览内容顶部显示该项目配置节点（含结果复议），周期页不显示伪合并时间轴。其余页签不常驻时间轴，依据本次 REA。
- 成员范围：仅 HRBP，默认本周期，支持本周期／当前／双选、全选／半选，无确定取消；外部点击和 Escape 关闭，仅前端状态，无后端查询参数和授权变化。v1 最小假设：至少保留一项；蓝图确认时明确，不宣称已实采空选行为。
- 多项目可达：工作台待办覆盖合法周期全部项目；评估节点按真实项目／节点／任务标识保持可达，不按同名静默合并，不使用首项目代替周期内容。无额外项目下拉。

### 原子任务与文件边界（UI 确认后执行）

- [ ] CR-007-F17-T01 后端角色／项目范围契约与真实查询接入
  - 前置：v1 范围确认；已读002基线、PM-001、执行契约与现有API／权限解析。
  - 允许：backend/app/performance/{navigation_service,projects_router,member_reminders,result_view_scope}.py、必要的既有授权／结果开通共享服务、既有 tests/test_performance_{projects,auth_context,member_reminders,subject_visibility}.py；新增范围模块仅限 backend/app/performance/ 且不得另建业务计算链。共享文件串行精确编辑。
  - 输出：合法角色入口及各自合法项目；统一角色／项目人员范围传递；周期矩阵聚合、项目统计、全节点时间轴。既有无具名入口调用保留原语义；未知枚举422、无权403、跨周期项目404，不吞真实异常。
  - 验收：双角色下 HRBP 小范围不读管理员全范围、单角色拒绝另一入口、功能撤销／不可见人员／跨周期、统计分页导出详情同范围；写操作重验范围，不改原审计／通知语义。
  - 测试：上述既有 pytest 文件的定向及联合回归；真实SQL/API与替身测试证据分开，未运行或跳过不得当通过。
- [ ] CR-007-F17-T02 前端双角色／周期项目共用页签与范围浮层
  - 前置：T01 DTO／API契约冻结和 v1 蓝图明确确认。
  - 允许：frontend/src/api/performance.ts、stores/performanceProjectContext.ts、views/performance/{ProjectManagement,ProjectManagementReminder,ProjectAuthorizationRecords,ProjectCalibrationAuthorization,Workbench,Review}.vue、现有绩效侧栏／成员／矩阵／统计／时间轴／提醒组件、对应既有测试与 tokens.css；新增单职责成员范围组件限 components/performance/。
  - 输出：角色分导航、项目四页签、总览时间轴、成员范围多选浮层、取消额外项目筛选且全部项目任务可达；缓存／旧响应／选择状态不跨身份角色项目串用。
  - UI：加载、空、错误、403、刷新、前进后退、角色切换、项目切换、无额外项目下拉；共用原token／组件，无新视觉体系。
  - 测试：现有 ProjectManagement／Workbench／Review／成员／矩阵／统计／store 组件测试及必要新浮层测试；npm build；真实Vue路由隔离数据交互及本任务独立实现PNG，不把蓝图PNG冒充实现证据。
- [ ] CR-007-F17-T03 联合验收与证据回填
  - 主线程核对diff、pytest、Vitest、build、实际浏览器；允许／拒绝、多项目、角色重叠、快照／匿名／字段裁剪、并发旧响应、导出和危险操作确认回归。
  - 本地合成接口／真实后端API／SQL／部署／生产分别记录。缺少真实环境不宣布生产完成，不将跳过项计通过。
- 禁止：模型／迁移、改写快照／任务／答案／历史审计、角色配置数据、生产、真实通知、自动commit／push／deploy；不触及021或UCP。不新增脚本、调研报告或测试文档。停止仅撤回本卡增量，不重置工作区或整包回滚。

### 本地交付与验收证据（2026-11-18）

- 后端：新增 `management_scope.py` 统一所选角色合法项目／人员范围；`auth_context.py` 以请求级字段解析角色及周期项目，路径／query 冲突404。`projects_router.py`、`navigation_service.py`、`member_reminders.py`、`subject_visibility_service.py` 接入；具名入口不借周期管理员、自定义角色、任务处理人或授权发起人补权，字段固定所选 hrbp／activity_manager。未具名旧路径保留原语义。
- API：overview 增加 categories／active_role，侧栏 projects 保留所选角色完整列表；新增 `/project-management/matrix` 与 `/project-management/timeline`，后者含复议；statistics／self-final-comparison 支持所选项目。管理上下文走 query，原POST body不变。重复成员与评级不兼容继续返回409，不新增合成规则。
- 前端：`api/client.ts` 统一透传管理上下文并拒绝旧范围响应；`api/performance.ts` 增加DTO／范围方法和在途key隔离。ProjectManagement 共用四页签与原时间轴／详情／操作组件；工作台和Review取消项目下拉并逐项目加载合法内容，同node_id用独立UI身份且请求保留真实ID。授权、校准、催办子页面保留往返范围；新增单职责 `PerformanceManagementMemberScope.vue`，不改 tokens 或共享store。
- 组件回归最终主线程命令：`npm --prefix hr-portal/frontend test -- src/views/performance/ProjectManagement.spec.ts src/components/performance/ProjectPerformanceMatrix.spec.ts src/components/performance/PerformanceManagementMemberScope.spec.ts src/components/performance/ProjectStatisticsReportPanel.spec.ts src/api/performanceManagementContext.spec.ts src/api/performanceTagFillQuestionApi.spec.ts src/views/performance/ProjectManagementNavigation.spec.ts src/views/performance/Workbench.spec.ts src/views/performance/Review.spec.ts --silent --maxWorkers=2 --minWorkers=1` → **9文件225 passed，48.50s，exit0**。此前管理专项4文件79通过、多项目＋API专项5文件146通过；最终225不重复累加。早期watch重载导致的挂起任务已停止，多source监听修复后通过；新增浮层测试attachTo body及3处必填DTO夹具已补，不通过删除业务断言绕过。
- 后端主线程命令：`DB_HOST=127.0.0.1 DB_PORT=1 PYTHONPATH=hr-portal/backend hr-portal/backend/.venv/Scripts/python.exe -m pytest hr-portal/backend/tests/test_performance_management_scope.py hr-portal/backend/tests/test_performance_projects.py hr-portal/backend/tests/test_performance_auth_context.py hr-portal/backend/tests/test_performance_member_reminders.py hr-portal/backend/tests/test_performance_subject_visibility.py -q --tb=short` → **974 passed／5 skipped／1既有python_multipart弃用警告，30.92s，exit0**。新增20项范围测试包含真实SQLite SELECT／范围过滤以及FastAPI TestClient实际路由；身份依赖受控替换，非真实JWT。现有大部分回归使用替身；5跳过不计通过，SQLite不替代PostgreSQL验证。
- 完整构建：`npm --prefix hr-portal/frontend run build` → **vue-tsc＋Vite exit0，3782模块，45.25s**；仅既有VueUse PURE注释提示。此前在途组件类型错误和新增测试夹具缺必填字段已修复后完整重跑通过。`git diff --check`通过，换行转换提示不等同格式错误。
- 实际UI：本地Vite真实Vue路由／Chromium 1440×1000，全部 `/api/v1/*` 由浏览器隔离为合成数据。默认active_role写回URL；双角色各自项目、四页签、项目成员请求携角色项目、周期matrix不含project_id、管理员隐藏成员范围、刷新保留tab通过。HRBP双选显示全部且选择本身新增API请求0；项目总览时间轴含复议，项目时间按Asia/Shanghai显示；不执行真实管理写入。
- 多项目UI：工作台显示两项目时间轴和两个同node_id待办，链接准确携project29／30；项目下拉数量0。进入评估后两独立节点保留，点另项目准确切换；管理场景及多项目场景均pageerror0、未匹配API0。首次管理预检曾有一个未配置auth/context的隔离路由，最终补齐后场景重跑0，不冒充真实登录。
- 独立实现PNG（均已读取，不是蓝图替代）：`ui-blueprints/CR-007-F17-T02-project-overview-20261118.png`、`CR-007-F17-T02-member-scope-20261118.png`、`CR-007-F17-T02-project-reports-20261118.png`、`CR-007-F17-T02-multi-project-workbench-20261118.png`、`CR-007-F17-T02-multi-project-review-20261118.png`。沿原token组件，不声明像素完全一致或生产数据验收。
- 已知边界：成员范围仅前端状态，切页签保持，换角色／项目后恢复默认；周期矩阵钻取使用聚合响应的people，项目钻取仍用原分页组件。原统计中未实现的绩效维度／历史对比章节、原筛选预留及跨项目重复成员合成不在本次新增范围，不伪造数据。
- 未运行：真实JWT登录完整API链、真实PostgreSQL新连接回读、生产权限／生产数据、真实通知、部署；没有模型或迁移，不适用迁移upgrade／downgrade。本轮未commit／push／deploy，既有无关临时文件保留。T01／T02本地开发完成，T03真实环境部分待后续验收，三卡整体不勾选。

### CR-007-F17-B01 周期矩阵人数钻取回归修复（2026-11-18）

- [x] 根因定位与本地修复：`6807b3c9` 为周期多项目矩阵增加 `projectId=0` 聚合路径时，使用简化按钮列表替代原 `MatrixPeopleDialog`，导致“人员数量 → 人员表格 → 人员详情侧栏”既有链路在周期概览丢失；单项目路径未丢失。
- 修复：周期聚合与单项目统一复用 `MatrixPeopleDialog`。聚合路径直接消费矩阵单元格已有人员，弹窗本地搜索、排序、分页，并保留 `project_id`、`root_review_id`、`can_view_detail`；允许行继续透传 `open-member`，无详情权限行不打开侧栏。单项目仍调用原成员分页接口，不新增接口、模型、迁移、权限或平行组件。
- 自动化：`npm --prefix hr-portal/frontend test -- src/views/performance/ProjectManagement.spec.ts src/components/performance/ProjectPerformanceMatrix.spec.ts --silent --maxWorkers=2 --minWorkers=1` → **2文件65 passed**；覆盖聚合表格展示、拒绝行、允许行打开详情事件、单项目接口及项目管理侧栏接入。`npm --prefix hr-portal/frontend run build` → **vue-tsc＋Vite exit0，3783模块，48.57s**，仅既有VueUse PURE注释提示；目标文件 `git diff --check` 通过。
- 边界：既有页面小范围回归修复，无新蓝图；未执行真实JWT登录浏览器、真实API／PostgreSQL、生产部署、commit或push，不将本地自动化视为生产验收。

### CR-007-F17-UI01 管理角色图标还原（2026-11-18）

- 发布授权：用户明确要求在 main 提交并推送 UI01 图标还原、UI02 节点名称恢复及其测试／验收截图；不部署。下文“未提交推送”指开发验收时点。
- 用户提供两份 SnapSpec SVG，明确 HRBP 与项目管理员使用不同图标。仅调整 `PerformanceReviewCategorySidebar.vue` 的具名角色图标分支及尺寸／颜色，不改变导航、权限、接口或布局；属于既有图标修正，无需新蓝图。
- HRBP 原样使用 ContactsOutlined 的 path 与 `viewBox="0 0 24 24"`；项目管理员原样保留16坐标path、`fill-rule="evenodd"`、`clip-rule="evenodd"`，不误套24坐标viewBox。旧 admin 分类沿项目管理员图标。
- 展开及折叠均保持16×16px、颜色#646A73；仅管理角色覆盖共享折叠图标原14px／继承选中色，其他评估分类不变。保留原hover／active背景，不凭未完整采集的状态自造图标颜色。
- 回归：`npm --prefix hr-portal/frontend test -- src/views/performance/ProjectManagement.spec.ts src/views/performance/Review.spec.ts --silent --maxWorkers=2 --minWorkers=1` → **2文件166 passed，31.44s，exit0**；`npm --prefix hr-portal/frontend run build` → **vue-tsc＋Vite exit0，3782模块，44.80s**，仅既有VueUse PURE注释提示；`git diff --check`通过。本轮未增加测试文件、脚本或测试文档。
- 浏览器：894×631／DPR1，直接挂载真实Vue侧栏组件及合成角色，不调用业务接口；展开／折叠两图标实测均16×16、rgb(100,106,115)，SVG path与用户采集值一致，pageerror0。独立实现截图 `ui-blueprints/CR-007-F17-UI01-role-icons-expanded-20261118.png`、`CR-007-F17-UI01-role-icons-collapsed-20261118.png` 均已读取；不是整页或生产像素一致证明。无后端、生产、通知、提交推送或部署操作。

### CR-007-F17-UI02 评估节点名称恢复（2026-11-18）

- 用户纠正：绩效评估侧栏只显示原节点名称，不追加项目名或周期名。展开列表与折叠浮出菜单均移除项目后缀，Review不再生成显示用project_name；内部project_id／navigation_id／真实node_id保持，两个同名节点仍准确切换各自项目及任务，不合并或丢弃合法入口。
- 仅修改 `Review.vue`、`PerformanceReviewCategorySidebar.vue` 及原 `Review.spec.ts` 的相关回归断言；保留UI01两角色图标增量。不改变周期选择器、权限、接口、工作台项目标题或项目管理具体项目名称。属于既有文案呈现恢复，无需新蓝图。
- 原多项目测试改为断言展开／折叠均为纯节点名，同时验证两次真实project_id与task_id跳转及选中身份；回归命令 `npm --prefix hr-portal/frontend test -- src/views/performance/Review.spec.ts src/views/performance/ProjectManagement.spec.ts --silent --maxWorkers=2 --minWorkers=1` → **2文件166 passed，exit0**；完整 `npm --prefix hr-portal/frontend run build` → **vue-tsc＋Vite exit0，3782模块，41.41s**，仅既有VueUse PURE注释提示；`git diff --check`通过。
- 浏览器：894×631，真实Vue共享侧栏与两个合成项目，展开标签和折叠菜单均为“工作总结环节”；点击回传分别为[1,summary]／[2,summary]，折叠点第二项仍[2,summary]，pageerror0。独立实现截图 `ui-blueprints/CR-007-F17-UI02-node-labels-20261118.png` 已读取，不等于生产端到端验收；未改后端，未commit／push／deploy。

## CR-007-F18 工作台快捷入口权限与跳转（2026-11-19）

- 发布授权：本地验收后，用户明确要求在 main 提交并推送本卡代码、测试、验收记录及两张独立实现截图；不部署。下文“无提交或推送”指开发验收时点。
- 用户先要求只读评估，随后明确要求完成全部优化。本卡复用 F16 结果页与 F17 具名管理入口，属于既有入口修复，无新页面或信息架构蓝图。
- 角色与跳转：当前周期存在快照直接／间接下级时显示“我管理的团队”，跳 `PerformanceReview`＋`node=__team-results__`＋`tab=members`；仅 HRBP／项目管理员身份不取得团队结果资格，兼任管理者正常显示。当前周期合法管理角色非空时显示“我支持的团队”，HRBP 优先，否则项目管理员，两链接分别到周期概览 overview／members。可见人员组成员与原结果读取范围及本周期项目成员交集非空时显示“重点关注人员”，跳 `__focus-results__`＋`tab=members`。分组顺序与 REA 一致。
- 契约：navigation 增加可选 `management_roles: ('hrbp'|'project_admin')[]`，后端沿具名管理范围校验、HRBP 优先；前端缺字段不猜角色。快捷入口只携 cycle_id、节点／角色和页签，不继承 project_id、任务／详情或其它管理上下文。结果页读取合法 tab，切页签写 URL 并支持刷新／前进后退；关注页不允许总览。导航加载、失败、周期不匹配及身份重置时隐藏受保护快捷分组；直接无权结果节点拒绝，不回退首节点。
- 人员组配套：新建／编辑统一写 view_permission=0（仅关注人）或1（有组内人员绩效查看权）；已有历史2只按0私有模式兼容读取，仍要求可信关注人工号与原结果权限，不批量改库或扩权。其它未知模式不授予结果／标签可见权。
- 允许范围：后端 projects_router／focus_groups_router／result_view_scope／focus_group_tag_service 及既有测试；前端 performance DTO、Workbench／Review／PerformanceResultScopeView／FocusPeopleGroupCreate 及既有测试、本记录和独立实现 PNG。复用共享周期 store、原组件及 tokens，无新模型／迁移／快照／通知链；不创建脚本、调研报告或测试文档，不自动提交推送部署。停止仅撤销本卡增量。
- 前端验收：`npm --prefix hr-portal/frontend test -- src/views/performance/Workbench.spec.ts src/views/performance/Review.spec.ts src/views/performance/FocusPeopleGroupCreate.spec.ts src/views/performance/ProjectManagement.spec.ts src/stores/performanceProjectContext.spec.ts --silent --maxWorkers=2 --minWorkers=1` → **5文件213 passed，exit0**；含七类资格组合、加载失败／周期切换／身份清理、精确白名单 query、只读入口拒绝、tab URL 变化及组0／历史2编辑保存。首次路由测试模拟改为全局 reactive 后造成原共享抽屉用例失败，已把 reactive 限定到新页签用例并复跑全部通过。
- 浏览器验收：本地 Vite 真实 Vue 路由、隔离 Chromium 1440×1000、所有 API 为合成数据；团队／关注成员列表、双角色 HRBP 优先、仅管理员、普通员工隐藏、无项目残留、团队页签后退与刷新通过，pageerror=0、未匹配API=0、写请求=0。补验无资格直达拒绝且结果范围请求0；关注链接携错误overview及残留project_id／management_role／rootReviewId时，默认成员列表并清理残留，pageerror=0。第一轮有任务／管理成员接口夹具漏配，补齐后二轮重新运行通过。独立截图 `ui-blueprints/CR-007-F18-workbench-quick-entries-20261119.png`、`ui-blueprints/CR-007-F18-team-members-20261119.png` 已读取，非生产数据或像素完全一致证明。
- 最终前端构建：`npm --prefix hr-portal/frontend run build` → **vue-tsc＋Vite exit0，3783模块，41.36秒**；仅既有 VueUse PURE 注释提示。主线程 `git diff --check` 通过，换行转换提示不计格式错误。
- 后端最终验收：`DB_HOST=127.0.0.1 DB_PORT=1 PYTHONPATH=hr-portal/backend hr-portal/backend/.venv/Scripts/python.exe -m pytest hr-portal/backend/tests/test_performance_projects.py hr-portal/backend/tests/test_performance_focus_groups.py hr-portal/backend/tests/test_performance_member_identity.py hr-portal/backend/tests/test_performance_management_scope.py hr-portal/backend/tests/test_performance_auth_context.py hr-portal/backend/tests/test_performance_member_reminders.py -q --tb=short` → **1057 passed／6 skipped／1既有 python_multipart 第三方弃用警告，26.28秒，exit0**。其后新增混合组逐组权限回归，`test_performance_member_identity.py -k mixed_modes` → **4 passed／61 deselected**，证明0／历史2私有组与mode1组混合、两种排序均不串权。AST检查三个本卡测试文件无重复测试函数。早期重复定义、导航mock未提供具名范围、测试漏异常引用及旧开通身份object替身失败均已修正，最终整组重跑通过；未按DB替身类型绕过生产鉴权。API实际HTTP测试验证旧客户端2规范0、未知写入422、历史未知值后台可读；SQLite标签测试验证可信关注人及未知模式拒绝，不等同PostgreSQL或真实JWT。
- 本地实现与验收已完成。真实 JWT 登录 API／PostgreSQL／生产权限与部署未验收；无真实通知、生产操作、提交或推送，不将本地合成数据验收视为生产完成。

### CR-007-F17-UI03 HRBP 成员范围专项还原（2026-11-18）

- 发布授权：用户明确要求在 main 提交并推送本卡组件、共享浮层可选参数、tokens、测试及实现截图；不部署。下文未提交推送指开发验收时点。
- 用户要求按钮、浮层及选择按实际DOM还原。既有采集具备结构但缺精确CSS；REA发现参考目标（Evidence `ev_5a3eb75d307cf238ee74f8e5a1db787844c7f8932ff75acf5144184175f169d7`），scenario执行失败后改用现有Playwright直连同一9222目标专项量取，不将后者伪称REA Evidence。未新增脚本／报告／测试文档；参考页面选择恢复到本周期，临时视口恢复3440×1313。
- 实采正常按钮234×32、padding 0 11、边框#d0d3d6／hover与展开#336df4、圆角6、14px／21px；全部状态宽136。DownBoldOutlined原path、10×10。浮层172×101、右边与按钮对齐、下方4px、无可见箭头、1px #dee0e3边框、8px圆角；列表padding 2px 0，行164×30、margin 1px 3px、padding 4px 8px、复选框文字间隔6；底栏170×30、padding 4px 11px、间隔8。复选框16×16、1px边框、4px圆角、蓝色#1456f0，未选边框#8f959e，勾及半选原12×12 path；行hover rgba(31,35,41,.08)，阴影按稳定普通／hover三层实采值。
- 实现：PerformanceManagementMemberScope替换原无边框文字入口，复用PerformanceCheckbox并局部覆盖边框、半选SVG居中；文字和行均可点击，鼠标不主动抢首项焦点，键盘ArrowDown可聚焦。PerformancePopover添加可选align/end、side/bottom、showArrow参数，既有默认值保持center／auto／true。本组件专用tokens写入tokens.css，不改变共享checkbox／其他浮层默认外观；不改API／后端范围。
- 选择语义：参考本次确认最后一项可以取消，但与用户已确认v1“至少一项”约束不同；本次保留已确认约束，最后一项不再视觉disabled，点击仍保持选中；全选取消回本周期。参考全选DOM aria-checked在双选时仍mixed，本地按实际全选checked、单选indeterminate正确提供语义，不复刻该可访问性缺陷。空选业务如需跟随参考应另行明确；未擅自改变已确认规则。
- 本地浏览器：1280×720、同一Chrome、真实Vue范围组件及tokens，本期状态按钮box[1018,76,234,32]、浮层[1080,112,172,101]与参考对应值完全相同；复选框颜色、16px尺寸、30px行及底栏padding一致，半选SVG12×12居中。整行文字点击双选→全部、取消周期→当前、Escape关闭均通过，pageerror0，无业务接口请求。仅组件局部参数核对，不冒充整页像素差计算或生产验收。
- 实际项目管理路由补验：本地Vite真实Vue页面、全部API隔离为合成数据，按钮234×32、浮层172×101、gap4、右对齐偏差0；本地页面按钮x1016与参考x1018相差2px，来自既有页头右侧留白，不据此宣称整页像素一致。文字行切换双选更新“全部”，新增业务请求0、pageerror0、未匹配API0、Escape关闭通过。实现截图 `ui-blueprints/CR-007-F17-UI03-management-scope-20261118.png` 已读取。
- 独立实现截图（均已读取）：`ui-blueprints/CR-007-F17-UI03-member-scope-period-20261118.png`、`CR-007-F17-UI03-member-scope-all-20261118.png`。回归 `npm --prefix hr-portal/frontend test -- src/components/performance/PerformanceManagementMemberScope.spec.ts src/views/performance/ProjectManagement.spec.ts src/components/performance/PerformanceMemberIdentity.spec.ts --silent --maxWorkers=2 --minWorkers=1` → **3文件63 passed，exit0**；`npm --prefix hr-portal/frontend run build` → **vue-tsc＋Vite exit0，3783模块，40.49s**，仅既有VueUse PURE提示；diff --check通过。无后端、生产、真实通知、提交推送或部署。

## CR-007-F20 统计报表还原、差异分析与 BU 公共快照（2026-11-19）

- 用户确认：先只读 REA 评估，补采有数据的绩效维度对比后，明确要求完成上述全部问题。沿用现有周期概览／项目统计报表、F17 具名管理入口及已确认 UI；复用现有组件，不新增页面或视觉体系。BU 明确进入公共绩效快照，供其他功能复用。发布授权：本地验收后，用户明确要求在 main 提交并推送本卡代码、迁移、测试、验收记录及实现截图；不部署。下文未提交推送指开发验收时点。
- F20-T01 BU 公共快照：花名册契约／RosterAuthorizationInput／周期授权人员／项目成员贯通独立 `bu` 字段，项目启动及增量成员复制 BU。新增 `0317_performance_bu_snapshot`，前置 `0316_cc_tree_parent_code`，两表 nullable TEXT，无历史 UPDATE。BU 不加入 ORGANIZATION_FIELDS，不改变 company_org／部门路径；历史 NULL 不实时回查补值。单人“部门”更新维度维持原义，实时在职状态刷新不改 BU。
- F20-T02 查询契约：原 statistics 新增 indicator_key 与 indicators／indicatorKey／indicatorLabel；新 `/performance/project-management/comparison` 接收 kind=self-final|dimension|history、x_key／y_key／history_cycle_id 及原管理／结果范围。复用有效结果和人员可见范围，两轴量表独立，counts[Y][X]，有效员工交集作分母；非法轴／历史422、量表／指标冲突及跨项目重复人员409。旧 self-final 复用同一方向；序列读取冻结 member.bu。历史两侧分别执行权限过滤，不以当前权限放大历史范围。
- F20-T03 共享展示：统计评级列均分可用宽度、窄屏滚动；总览百分比纵轴／轴线／虚线网格、整档 shadow、body tooltip、动态标题、蓝色汇总标签及指标切换；添加团队／部门／序列分组对比，各组独立分母，可移除。系列颜色稳定不循环，超色槽采用中性纹理及展开数据表，不设额外分组数量限制。三种差异分析复用 PerformanceComparisonMatrix，动态 N×M、双轴选择、历史周期、占比热区、空态保轴，缺维度／无历史分别说明且示例明确标识。复用 MetricTemplateEmptyIllustration。无滚动父容器时取消报表标题吸附，避免独立挂载标题遮盖；分组／历史选择器用220／240px包装约束，避免共享选择器拉满整行。
- 文件边界：后端员工花名册契约、performance models／snapshot_service／cycle_service／project_service／projects_router、单一新迁移及既有三类测试；前端 api/performance.ts、performanceManagementContext.spec.ts、ProjectManagement报表provider及既有测试、PerformanceResultScopeView、报表 types／Panel／Distribution／Matrix／Comparison／DimensionSelector／navigation 和对应既有测试。保留并行校准／共享提示组件改动；本卡不操作真实业务库、通知、生产、commit／push／deploy。停止仅撤回本卡增量，不整包回滚。
- 后端证据：报表／管理范围／访问上下文／可见性／有效结果／共享结果六文件联合回归 **994 passed、5 skipped**，46.99s、exit0；DB_HOST=127.0.0.1 DB_PORT=1 PYTHONPATH=hr-portal/backend，执行本地虚拟环境 pytest。快照与周期两文件 **94 passed、2 skipped**，BU专项此前24通过（不与联合结果重复累加）。既有 python_multipart 弃用警告；跳过不计通过。新迁移 SQLite 内存真实 upgrade／存取／downgrade及历史NULL保留通过，PostgreSQL DDL编译为TEXT；实际PostgreSQL隔离迁移／新连接回读尚未运行。
- 浏览器证据：真实Vite Vue组件，所有业务API隔离、合成数据，非生产。1920×1080评级7列均176px；标题与主标题不重叠；tooltip汇总41.9%(169人)／分组40.0%(12人)，分组控件220px；移除后系列恢复1组。历史切换提交historyCycleId=1且清空历史xKey，控件240px。1024×900表格client690／scroll1330；空总览仍7档及刻度、空矩阵7行7列与图标，最终场景pageerror0。初轮浏览器探针曾因多元素strict locator停止，改精确定位后上述场景完成，不算业务失败或端到端生产验收。
- 实现PNG（均已读取）：`ui-blueprints/CR-007-report-overview-implemented-20261119.png`、`CR-007-report-comparison-groups-implemented-20261119.png`、`CR-007-report-dimension-implemented-20261119.png`、`CR-007-report-empty-implemented-20261119.png`。仅合成数据组件验收，未声明整页像素完全一致。原筛选入口预留不是用户本次列出的功能，保持明确提示；人数格明细钻取未作为本卡新增能力，不伪装为已接通。
- 前端最终验证：`npm --prefix hr-portal/frontend test -- src/components/performance/ProjectStatisticsReportPanel.spec.ts src/components/performance/ProjectReportDistribution.spec.ts src/components/performance/ProjectReportMatrix.spec.ts src/components/performance/ProjectReportNavigation.spec.ts src/views/performance/ProjectManagement.spec.ts src/api/performanceManagementContext.spec.ts --silent --maxWorkers=2 --minWorkers=1` → **6文件95 passed、46.38s、exit0**。`npm --prefix hr-portal/frontend run build` → **vue-tsc＋Vite通过、59.74s、exit0**，既有VueUse PURE注释提示。最终目标文件diff --check通过。此前一处旧调用断言因新增可选indicator参数多undefined失败，已更新断言并在最终95项中通过；并行校准类型错误由对应会话修复后统一build通过。
- 提交前隔离验证：仅加载暂存区 Python 源码及暂存测试收集，排除工作区并行校准／成员操作补丁，八文件回归 **1073 passed、7 skipped、1既有python_multipart警告、26.56s、exit0**。首轮探针误混入工作区测试缓存而失败，修正为暂存测试显式收集后通过；不将首轮失败算作通过。暂存Python编译及git diff --cached --check通过。
- 状态：本地实现及上述定向验证完成。实际PostgreSQL迁移、真实JWT/API全链、历史BU补值与生产部署未验收，F20整体保持未勾选。

### CR-007-F20-B01 柱上指示器、级联对比与空态坐标轴纠偏（2026-11-19）

- 本轮用户先要求评估，确认实采差异后要求完成全部修复。替代 F20-T03 中下拉指标、常驻220px对比分组选择器及底部图例的早期实现。沿用现有入口／权限／量表／计数契约，不新增迁移，不操作真实数据、通知或生产。发布授权：用户随后明确要求在 main 提交并推送本轮报表代码、测试、验收记录及五张实现截图；不部署。提交前七文件报表专项复验 **59 passed、22.17s、exit0**；下文未提交推送指开发验收时点。
- 总览：复用 PerformanceSegmentedControl，指标横向连续展示、32px高、左右16px、单项圆角6px；统计详情同组件。柱上新增贯穿绘图区的1px dashed线，位置固定于当前柱顶，颜色随系列；分类阴影与tooltip保留，移入空白／离开清线，支持键盘焦点。级联菜单复用ElPopover／ElTree，新单职责 ProjectReportComparisonMenu，一级240px／标题32＋四行32，子菜单226px、树节点32、树高最多240；默认折叠，搜索保留祖先并展开路径，点选立即增删、选中勾、Escape／外部关闭。顶部28px彩底白字标签显示分组人数并可关闭，汇总可移除再选；无常驻选择框或底部图例，数据表折叠可访问。选组顺序和实体配色跨指标保持，父层重载已打开维度且只消费相同indicatorKey的数据，不设未经确认的数量上限。
- 差异分析：业务空态说明不再替换整个矩阵，保留真实轴；缺失侧显式显示未配置自评／第二评估项／历史评级，不复用当前量表冒充历史。无候选项仅静态轴标题，不显示默认真实评级或空历史下拉。后端 _report_comparison_axis 无snapshot时仍读配置、人数集合为空，不生成真实结果。导航支持window／祖先容器滚动，报告所有可见章节供懒加载，不只依赖目录activeKey；零尺寸元素不参与测量，失败分支不自动反复重试。
- 实际验证：前端8文件 **116 passed、57.72s、exit0**（Distribution／Matrix／Panel／useProjectReportNavigation／ProjectReportNavigation／Segmented／ProjectManagement／API context）；完整 `npm --prefix hr-portal/frontend run build` **vue-tsc＋Vite exit0、1m16s**，仅既有VueUse PURE提示。后端 `DB_HOST=127.0.0.1 DB_PORT=1 PYTHONPATH=hr-portal/backend ...python.exe -m pytest tests/test_performance_projects.py ... -k 'comparison or report_invalid_indicator' -q --tb=short` **39 passed、981 deselected、exit0**；筛选作用全部所列文件，不能将未选用例算通过。扩展六文件全跑 **1014 passed、5 skipped、1 failed**：唯一失败为既有 test_management_member_api_root_and_dynamic_export_contract 的成员详情fixture缺project.status（已提交792c5b19路径），与本轮报表hunk无关，已反馈，未修改非范围夹具。既有python_multipart弃用警告。
- 浏览器：真实Vue组件／Vite、合成provider和隔离API，1440×1000；同柱不同鼠标高度测得虚线y始终267，与柱顶267相等；级联搜索显示祖先及子节点，标签选择后切指标仍保留，明确请求新indicatorKey的分组；底部legend=0、常驻selector=0。页面滚动到底自动请求三类comparison；三类零人数均保留7×7量表，缺自评保Y七档、缺第二维度保X七档、无历史保Y七档，缺失侧占位及图标实际可见。无历史下拉DOM=0，显式示例49格且清楚标记，关闭后回到真实空态0格；pageerror=0。初轮browser发现无指令裸template使矩阵inert，已删除并重新验收；此前jsdom通过不视为实际可见证据。
- 独立PNG（合成数据，均已读取）：`ui-blueprints/CR-007-F20-B01-bar-pointer-20261119.png`、`CR-007-F20-B01-comparison-menu-20261119.png`、`CR-007-F20-B01-self-final-empty-20261119.png`、`CR-007-F20-B01-dimension-empty-20261119.png`、`CR-007-F20-B01-history-empty-20261119.png`。不是完整生产路由／真实JWT／SQL回读或全屏像素完全一致证明。palette验证由组件执行者实跑ALL CHECKS PASS；contrast WARN用可见系列标签／数据表补足。
- 状态：本轮本地修复及上述验证完成，F20整体真实环境验收边界不变。本轮未commit／push／deploy；并行校准source_rule_id、最早启动项目等hunks保留，不混入报表实现归属；停止仅撤回本轮报表增量。

### CR-007-F20-B02 添加对比十组上限与配色纠偏（2026-11-19）

- 参考页实采十组标签颜色：汇总 `#4e83fd`、第1组 `#50CEFB`、第2组 `#935AF6`、第3组 `#FAD355`、第4组 `#F76964`、第5组 `#FFA53D`、第6组 `#F14BA9`、第7组 `#14E1C6`、第8组 `#DB66DB`、第9组 `#C3DD40`；均为顶部彩色白字标签，无底部系列图例。
- 交互：仅汇总时不显示删除按钮；删除其他项后不允许空系列，最后一项移除自动恢复汇总；选中超过一组按钮显示 `N/10`。汇总计入总数，最多10组；满额按钮置灰，悬停显示“最多添加 10 组对比／请先清除已有对比再添加新对比”，点击和键盘打开均被阻止。保留实体颜色，移除后重新添加不循环换色。
- 验证：本地真实Vue组件、合成数据浏览器验证了十组彩色标签、10/10禁用打开、提示文字、删除恢复汇总；前端 `ProjectReportDistribution.spec.ts` 与 `ProjectStatisticsReportPanel.spec.ts` **25 passed、24.18s、exit0**；配色实采数据经 palette validator 检查，原色中亮色对白底对比度有 WARN，使用白字标签、tooltip和数据表提供辅助识别；build **Vite exit0、1m12s**，仅既有VueUse PURE提示。
- 文件边界：仅报表组件、既有测试、验收记录及本实现PNG；未改后端、数据库、权限、生产或通知。用户已明确授权本轮在 main 提交并推送代码、测试、验收记录及 `ui-blueprints/CR-007-F20-B02-ten-comparisons-20261119.png`，不部署。

## CR-007-F19 多项目时间轴与评估菜单修复（2026-11-19）

- 授权：用户先要求只读定位，随后明确要求“完成上述全部修复”，本地验收后进一步明确要求在 main 提交并推送本卡代码、测试、验收记录及两张实现截图；不部署。本卡覆盖工作台单时间轴、评估分类固定顺序、360°单菜单入口；下文未提交推送指开发验收时点。
- 权威修订：替代 F17 对工作台逐项目时间轴的展示及 UI02 对360°独立菜单入口的展示约定。真实项目／节点／任务仍全部可达；其它节点不按名字合并，待办、结果、快照、任务和权限判定不变。复用现有页面、反馈表格和视觉组件，无新页面、模型或迁移。
- F19-T01 启动时间契约：`GET /performance/workbench/projects` 增加 `project_started_at: ISO datetime | null`。仅对授权并过滤、分页后的项目批量读取 `PERFORMANCE_PROJECT_STARTED`、主体 `PERFORMANCE_PROJECT`、匹配周期及项目引用的最早 `event_at`；缺失返回 null，不以创建／更新时间冒充。原排序、分页、开通资格不变。前端沿现有分页读取完整项目集合，按有效启动时间选择一条时间轴；未知排后、并列按项目 ID，全部未知时用 ID 保持稳定。时间轴不显示项目标题；各项目待办和结果卡继续保留。
- F19-T02 分类及360聚合：分类汇总与结果入口补齐后固定 `mine → others → team → other`，空分类继续隐藏。360按执行人角色 `assessment.reviewer_360` 聚合菜单，展开／折叠共用单一导航身份；内容仍汇总全部授权真实来源。保留每条任务的项目／节点及截止时间，姓名下方显示来源；不把单节点截止时间当成整个聚合列表的截止时间。自愿候选项以项目／节点／人员联合标识，提交真实来源；任务打开前切换真实项目并重新核对节点。URL历史恢复真实项目、节点，部分来源失败时整体报错并可重试，来源变化及卸载后丢弃迟到响应。
- 文件边界：后端 `projects_router.py` 与既有项目测试；前端 `api/performance.ts`、既有请求测试、Workbench／Review及既有测试、PerformanceReviewContent／PerformanceReview360FeedbackPanel；本记录及两张独立实现PNG。没有新增脚本、调研报告或测试文档；无权限规则、角色配置、快照／答案／历史审计写入。停止方式为仅撤回本卡差异。
- 前端联合验证：`npm --prefix hr-portal/frontend test -- src/views/performance/Workbench.spec.ts src/views/performance/Review.spec.ts src/views/performance/ProjectManagement.spec.ts src/stores/performanceProjectContext.spec.ts src/api/performanceManagementContext.spec.ts --silent --maxWorkers=2 --minWorkers=1` → **5文件220 passed，42.07s，exit0**。覆盖反ID实际启动时间、未知启动回退、多项目待办与结果保留、超过100项目分页、分类子集与纯结果入口、跨项目／同项目多360节点单入口、真实任务及自愿候选来源、浏览器query恢复、403重试、迟到响应与既有共享组件回归。首次新增用例误用未spy的函数导致2项失败，改为spy后全部通过。
- 后端定向验证：本地虚拟环境、`DB_HOST=127.0.0.1 DB_PORT=1 PYTHONPATH=hr-portal/backend`，`python -m pytest hr-portal/backend/tests/test_performance_projects.py -k workbench_projects -q --tb=short` → 主线程 **9 passed／835 deselected／1既有python_multipart弃用警告，6.56s**；后端实现者扩展 `-k workbench` → **17 passed／827 deselected／同一警告**。启动审计聚合SQL真实执行于内存SQLite，权限解析及结果开通使用替身；非真实PostgreSQL或HTTP/JWT全链。
- 浏览器验证：本地Vite真实Vue路由、独立Chromium 1440×1000，所有API隔离为合成数据。时间轴1条／项目标题0个／两个项目待办保留；四分类顺序正确、展开与折叠均1个360入口，列表显示两个真实来源。pageerror=0、未匹配API=0、写请求=0。独立实现截图 `ui-blueprints/CR-007-F19-workbench-timeline-20261119.png`、`ui-blueprints/CR-007-F19-review-360-menu-20261119.png` 已读取；不作为生产或像素完全一致证明。
- 验收边界：本地开发、定向自动化及隔离浏览器已验证；真实JWT／PostgreSQL／生产权限与部署未验收，整体任务暂不勾选。无真实外发、生产操作、commit／push／deploy。最终 `npm --prefix hr-portal/frontend run build` → **vue-tsc＋Vite exit0，3783模块，Vite 1m 6s**；仅既有VueUse PURE注释提示。最终 `git diff --check`通过，LF／CRLF转换提示不计格式错误。
