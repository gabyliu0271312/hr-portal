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

## 7. 风险与停止方式

- 现有工作台和评估页面仍以项目承载具体内容；本轮只统一周期选择，不推断跨项目菜单合并规则。
- 复议生命周期缺失是已知范围边界；不能用占位任务冒充真实复议。
- 停止本轮能力时，仅回退导航接口、共享周期状态和三个前台页面接入，不整体回滚仓库、删除历史任务或改变角色配置。

## 8. 项目管理总览、组织完成率与催办增强（2026-11-01，进行中）

用户确认授权查看按飞书参考页跳转为独立页面；要求基于 REA 参数还原组织完成率、模板与节点状态驱动卡片、环节统计提示、默认选中所有可催办项、真实发送及催办专属列。此节不改变第6章已完成任务的历史状态，也不代表本增强已完成验收。

- [ ] CR-007-F01 模板快照完成率与组织树：总览卡片不显示未配置的静态占位；完成率与节点配置来自当前项目冻结节点/成员/任务。组织树按一级至五级部门生成，父级聚合包含子级；支持逐层展开和数值/名称排序。校准完成率按阶段、校准人任务组计数，催办明细按被评估人任务列出。
- [ ] CR-007-F02 共享催办工作区：新增独立催办路由，复用 `PerformanceManagementTable`，而非直接复制成员列表全部列；按参考自定义列面板保留16列、默认10列，派生列继续服从源字段权限。默认遍历当前查询全部分页选取可催办项，无500项静默截断；不可用处理人不选中，失败后保留失败项。
- [ ] CR-007-F03 通知边界：周期催办 API 复用 `send_notification` 和统一飞书通知日志；按真实处理人身份链接解析接收方，禁止按名字或员工号猜登录名。校验当前周期、项目管理范围、最新成员快照、节点、校准阶段和待完成状态。每请求按处理人/节点/阶段去重发送；区分成功、部分成功、失败和跳过。身份切换沿共享通知拦截，不报告为已发送；未向真实员工发送验收消息。
- [ ] CR-007-F04 授权查看页：两个查看按钮分别路由至授权/转交记录、校准授权工作区。记录查询只消费真实任务授权审计，不将人员静态权限或结果发布转交冒充任务授权记录，也不导入飞书生产人员数据。校准列表读取冻结阶段任务而非伪造“已校准”。本地已实现任务授权/撤销生产者、持久化和处理权限链；本轮补充父授权撤销级联、只读继承和 PostgreSQL 定向持久化验证，但完整真实登录/UI/部署验收仍未完成。
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
