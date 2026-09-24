# PM-T010 原子任务

## 状态规则

所有任务保持 `[ ]`。代码、测试和验收证据齐全后才可勾选。

- [x] PM-T010-T01 后端：项目管理概览接口
  - 范围：`GET /performance/project-management/overview`（cycles/projects 过滤、`hrbp_scope` 预留恒空、管理员预览全量）
  - 禁止：改 `review/overview` 现有行为；本期实现 HRBP 实际匹配
  - 代码证据：`projects_router.py`（`project_management_overview`、`_person_in_project_administrators`、`_person_hrbp_project_refs`）
  - 测试证据：`test_performance_projects.py` 新增 3 个用例（涉及过滤/空态+404/姓名匹配），后端回归 51 passed

- [x] PM-T010-T02 前端：提取共享侧栏组件
  - 范围：改造 `PerformanceReviewCategorySidebar` 支持可配置下拉选项（`filterOptions`/`activeFilterValue`/`filterPlaceholder`）、隐藏节点状态标签（`showNodeStatus`）、任意分组 key
  - 禁止：复制侧栏为新组件；改变绩效评估页现有交互
  - 测试证据：`Review.spec.ts` 回归 10 passed（未传新 props 时行为不变）

- [x] PM-T010-T03 前端：项目管理页组装与路由
  - 前置：T01、T02
  - 范围：`/performance/project-management` 路由、`ProjectManagement.vue`（侧栏组装 + 周期概览内容占位）、`api/performance.ts` 新增 `projectManagementApi`（含 `.js` 镜像同步）、`PerformanceLayout` 顶部 tab 指向新页面
  - 测试证据：`ProjectManagement.spec.ts` 5 passed（菜单渲染/空态/错误重试/周期切换/项目选中）

- [x] PM-T010-T03b 前端：周期概览页签条（PerformanceLineTabs，采集还原）
  - 前置：T03
  - 采集来源：飞书 perf management `all-projects/overview`（1534×911，2026-09-18）：四 tab（总览 active/成员列表/矩阵分析/统计报表）、ink 3px top:33px 文字宽动画、divider 1px top:35px、sticky z-30、`#F2F3F5` 底、tab 16px/24lh、间距 28px、`padding-bottom:12px`、`max-width:240px`
  - 代码证据：`PerformanceLineTabs.vue`（新建共享组件：v-model、ink DOM 测量 + ResizeObserver、sticky prop、disabled/hover/active 状态）、`tokens.css` 新增 `--performance-line-tabs-*` 4 个 token、`ProjectManagement.vue` 周期概览接入（sticky 页签 + 空 pane 占位）
  - 边界：「更多」下拉不实现（用户确认）；pane 内容待后续任务；顶导/填写页既有 `#3370ff` 指示线不动
  - 测试证据：`PerformanceLineTabs.spec.ts` 7 passed（标签顺序/active、ink 几何与 token 断言、sticky、emit/禁用、aria-selected、ink 重测、ResizeObserver 生命周期）；`ProjectManagement.spec.ts` 6 passed（新增页签渲染与切换 emit 用例）；`Review.spec.ts` 回归通过；`npm run build` 通过

- [ ] PM-T010-T04 验收与文档更新
  - 前置：T01–T03
  - 覆盖：聚焦 pytest + Vitest、`npm run build`、规格文档状态更新
  - 已完成：pytest 51 passed（projects+cycles）；Review+ProjectManagement Vitest 15 passed；`npm run build` 通过（含 vue-tsc）
  - 存量失败隔离证据：`PerformanceTemplateCreate.spec`/`PerformanceTemplateWorkflowSettings.spec` 4 个失败经 stash 隔离验证为工作区他人未提交改动（`PerformanceTemplateCreate.vue` 等）的存量问题，与 T010 无关
  - 未完成：真实浏览器运行时验收（需启动前后端验证实际页面）

- [ ] PM-T010-T05 前端：项目管理交互组件提炼
  - 前置条件：PM-T010-T03
  - 范围：复用 `PerformanceListToolbar` 统一成员列表的搜索、筛选与扩展操作区；将面板中的筛选、导出、催办、结果开通、授权查看改为组件事件，由页面/后续业务接入实际动作；将成员列配置抽象为绩效域通用列配置能力，同时保留旧组件入口兼容。
  - 禁止：实现 HRBP 匹配、数据权限角色体系、导出/催办/开通/授权的后端业务；以按钮隐藏替代服务端资源权限校验；改变既有路由、页签或采集视觉结构。
  - 输入/输出契约：通用组件只接收展示数据与状态并发出动作意图；页面或业务容器负责 API 调用、数据范围和权限能力映射；后端仍为最终授权权威。
  - 验收：聚焦 Vitest 覆盖工具栏插槽与事件、成员列表动作事件、总览动作事件及列抽屉兼容入口；`npm run build` 通过；实现门禁通过。
  - 已完成证据：`PerformanceListToolbar.spec.ts`、`CompletionRatePanel.spec.ts`、`AuthorizationManagementPanel.spec.ts`、`ProjectManagement.spec.ts` 共 18 项聚焦测试通过；共享工具栏、通用列配置抽屉、动作事件边界和操作码透传已实现。
  - 当前阻塞：PM-T010 缺少 `capture-manifest.md`、`capture-completion-checklist.md`、`component-model.md`、`pixel-contract.md`、`acceptance-contract.md`、`extracted-ui-contract.json` 及 `implementation_readiness=ready`；完整 `npm run build` 被未修改的 `PerformanceTemplateFieldRenderer.vue` 类型错误阻断。
  - 完成证据：待补齐采集契约并修复工作区构建阻塞后再勾选。

## PM-T010-T06 统计报表模拟预览

- [ ] PM-T010-T06 前端：统计报表框架与可替换模拟数据源
  - 前置条件：PM-T010-T03
  - 已确认：2026-09-20 用户要求按对话采集参数开发，允许模拟统计数据，并明确选择“授权本次定向豁免（推荐）”。只交付 mock 预览，不宣称 P0/P2 完成。
  - 必读：本功能 spec.md、ui-interaction.md、api-contract.md，ADR-002，Spec 012 UI 守则与 N000，extracted-ui-contract.json。
  - 允许修改：frontend/src/views/performance/ProjectManagement.vue、ProjectManagement.spec.ts；frontend/src/components/performance/PerformanceSurfaceCard.vue、PerformanceIconButton.vue；本功能规格与任务级 ui-gate-waivers.json。
  - 允许新建：frontend/src/components/performance/ProjectStatisticsReportPanel.vue、ProjectReportNavigation.vue、ProjectReportDistribution.vue、ProjectReportComparison.vue、ProjectReportMatrix.vue、projectStatisticsReport.ts、useProjectReportNavigation.ts 及对应 *.spec.ts。
  - 共享文件规则：只为白卡增加可选标题，为图标按钮补充采集的 UpLeftOutlined；不改变既有默认样式/行为，不覆盖未提交改动。
  - 输入：cycleId + 可注入 ProjectReportProvider（可选 dimension='department'|'team'|'sequence'），返回 source='mock'|'api'、行维度、首列标题、汇总行开关、总人数、评级和当前维度行分布；示例行名为脱敏虚构名称，不复用采集的真实人员/组织/人数。
  - 输出：三组九项连续章节、右侧200px目录、36px间隔、展开/折叠变体、滚动选中与定位、mock标识、加载/空/错误状态及重试。
  - UI：沿用 /performance/project-management 的 reports 页签。参数与可见/禁止项见 ui-interaction.md 第8节及 JSON brief；尚无目标截图，截图 diff not-run。
  - 模拟范围：评级分布、部门矩阵、团队矩阵、序列矩阵和自评/终评对比使用合成数据；级别统计、司龄统计、绩效维度对比和历史绩效对比仍为已采集标题+未配置说明。不自行编造真实筛选字段、对比算法或 API URL。
  - API/数据库/权限/外部系统：无变更；provider 是前端展示契约，不是已确认后端 HTTP 契约。接口失败不得自动退回 mock。
  - 测试契约：展开后12目录行/9章节；折叠后菜单卸载且展开柄出现；目录定位与滚动联动；ResizeObserver/监听销毁；零分母、合计/占比、排序、API provider替换、周期切换、迟到响应隔离、错误重试；ProjectManagement已有页签回归。
  - 验收命令：npm --prefix hr-portal/frontend run test -- --run src/components/performance/Project*Report*.spec.ts src/components/performance/projectStatisticsReport.spec.ts src/components/performance/useProjectReportNavigation.spec.ts src/views/performance/ProjectManagement.spec.ts；npm --prefix hr-portal/frontend run build；check_ui_spec.py --task-id PM-T010-T06 --phase implementation。
  - 阻塞与非范围：完整采集包、真实统计 API/权限口径、完整图表视觉、hover/像素对比未具备；本次用户授权的豁免仅允许 mock 开发，不修改 capture readiness，不覆盖全功能状态。
  - 部门统计修正授权：2026-09-20 用户补充默认态几何、评级胶囊/热力色阶、精确SVG和匿名行数据，要求按需提炼组件，并明确评级底色与绩效模板配置一致。仍属T06模拟预览修正，不接入真实统计API、不扩展像素豁免错误清单。
  - 本轮允许范围补充：ProjectReportMatrix.vue及测试、projectStatisticsReport.ts及测试；新增绩效域共享 PerformanceRatingTag.vue、PerformanceSortHeader.vue 及测试；按需补充 PerformanceIconButton.vue 的树展开图标；frontend/docs/design-system.md 登记共享组件；performanceColorOptions.ts 提取既有底色转换函数、ReviewRuleConfigRenderer.vue 仅改为引用该函数（模板保存和展示行为不变）；本功能规格同步。禁止修改其他矩阵分析页签、模板保存逻辑和后端接口。
  - 修正契约：department_matrix_brief 为默认态真源；240px部门列、140px评级列基准、110px总人数列；最后评级列只吸收剩余空间；55px行、54px无圆角全格热力值、14px/22px右对齐、56px表头区域；body最多440px而非全表420px；汇总不加粗；移除未经采集的工具栏提示。评级颜色从provider的模板配置color透传，复用模板色板解释，禁止按评级名称/排序位置套七色。
  - 未确认项：展开/排序后记录被截断；保留现有交互，不宣称其精确状态已还原。色阶阈值未知，mock显式指定heatLevels，真实provider不提供时用中性色，不按百分比猜测阈值。目标截图、边框细节和完整像素验收仍未具备。
  - 已完成的本轮开发：reports页签接入；白卡无标题复用；UpLeftOutlined精确图形复用；导航展开/折叠、滚动定位与选中、ResizeObserver清理；维度驱动的可注入模拟provider；评级柱图/数据表、可排序分层部门/团队/序列矩阵；团队按上级层级展示且保留汇总行，序列按子序列展示并保留汇总行；各维度按需加载，加载、空态、错误重试及过期请求隔离。级别统计、司龄统计及三个差异分析章节保持预留，未新增报表HTTP请求。
  - 单测：2026-09-20，10个聚焦/回归文件39项通过；最后图标修正后的导航/柱图/滚动补偿3文件5项再次通过。命令为上述文件分别显式传给 `npm --prefix hr-portal/frontend run test --`（Vitest不依赖shell展开通配符）。
  - 类型检查：`node hr-portal/frontend/node_modules/vue-tsc/bin/vue-tsc.js --noEmit -p hr-portal/frontend/tsconfig.json` 通过。
  - 构建：`npm --prefix hr-portal/frontend run build` 的类型阶段通过；Vite阶段被本任务未修改且开工前已有变更的 `frontend/src/views/performance/Workbench.vue:332:1 Invalid end tag` 阻断。未修改该文件，未宣称生产构建通过。
  - 门禁：T06 implementation检查通过（仅应用用户授权的10项精确证据豁免，无禁止CSS匹配）；原始 readiness=blocked、completion_status=incomplete、pixel_restore_status=blocked 不变。
  - 浏览器：本地Vite实际路由 `/performance/project-management`，Edge/Playwright隔离上下文，仅mock登录、周期概览和访问上下文；不是后端授权或生产部署验证。无pageerror、无报表网络请求。1280×900：正文694→930（+236）；滚动后scrollport top56、目录/筛选top124；目录点击部门统计成功，滚到底选中历史绩效对比；正文尾差0。1280×314：目录可视高度70且局部滚动；894×631：无页面级横向溢出。筛选反馈在滚动后仍可见，部门表可横向滚动。
  - 截图（均为已实现mock页面，非目标截图）：`PM-T010-T06-report-expanded.png`、`PM-T010-T06-report-collapsed.png`、`PM-T010-T06-report-department.png`、`PM-T010-T06-report-short.png`；已查看截图。双箭头SVG运行时bbox在24×24 viewBox内。
  - 颜色：单系列 #3370ff 在白底 #ffffff 上通过 dataviz validate_palette 的适用检查，图表提供键盘/悬停提示及数据表。
  - 部门修正版验证（2026-09-20）：12个聚焦/回归文件58项通过，包含12组模板色板与共享评级标签底色一致性、任意标签/自定义色/缺省色、排序按钮事件、显式heatLevels及缺省中性展示、部门展开与排序。修改前后模拟人数口径不变。
  - 部门修正版运行时：1920×594实测列宽240/140/140/140/140/140/140/144/110，表头56、行55、值块54、评级标签24、工具栏48、选中项90×32；1280宽横滚左右固定列边缘偏差0，部门展开/总人数升序通过，pageerror=0。隔离页面临时注入20个合成部门，实测表体440、整表496；未改真实数据。截图 `PM-T010-T06-department-corrected.png`、`PM-T010-T06-department-expanded.png`、`PM-T010-T06-department-scrolled.png` 已查看。
  - 部门修正版类型检查：26项聚焦测试后的全前端vue-tsc曾通过；最终58项测试全部通过，但随后全量vue-tsc受本任务未修改的 `CycleHrbpPermissionManagement.spec.ts:32,37` 中 `.get(...).exists()` 类型错误阻断，未覆盖修复该并行任务文件。
  - 部门修正版容器构建：`docker compose -f hr-portal/docker-compose.yml build frontend` 通过，最终镜像 `sha256:b4030abb8399ab2b32c44180f53faad36544bbfa1bb039e1988b848fffd6b257`。Dockerfile执行Vite构建、不含vue-tsc；本会话未重启或替换运行中的前端容器。
  - 部门修正版颜色检查：三个热力档位文字对比度8.14/6.23/2.36；第三档按采集保留白字，不宣称普通文字可访问性达标。评级底色采用模板共享转换规则，不采用采集样本的固定七色映射。
  - 未完成：当前全量类型检查、真实API/权限口径、完整目标截图和像素diff；任务仍未勾选。本次未改后端、数据库、路由或全局门禁策略。

## PM-T010-T07 项目管理矩阵分析

- [ ] PM-T010-T07 后端聚合接口与前端矩阵分析页签
  - 前置条件：PM-T010-T03、用户确认最终评级口径、用户授权本次限定开发
  - 必读：本功能 `spec.md`、`ui-interaction.md`、`api-contract.md`、ADR-002、采集参数 `D:\乐逗\Desktop\矩阵分析.txt`
  - 业务口径：待完成评估=没有最终绩效评级；已完成评估=有最终绩效评级；评级只取模板工作流节点 `include_final_result=true` 的评估型节点评级字段答案；任务完成状态不能替代评级存在性。
  - 允许修改：`backend/app/performance/projects_router.py`、`backend/tests/test_performance_projects.py`、`frontend/src/api/performance.ts`、`frontend/src/views/performance/ProjectManagement.vue`、`frontend/src/views/performance/ProjectManagement.spec.ts`、本任务对应矩阵组件/测试、本功能规格文档。
  - 新增：`frontend/src/components/performance/ProjectPerformanceMatrix.vue` 及其 `ProjectPerformanceMatrix.spec.ts`。
  - 后端输出：项目权限保护的 `/performance/projects/{project_id}/matrix`；成员快照基线、最终评级选项、待完成/已完成按职级分组、姓名和数量展示所需结构。
  - 前端输出：待完成评估表、已完成评估矩阵、评级色标、姓名/人数切换、多人单元格折叠、加载/错误重试/空态；未采集的筛选弹层、更多范围菜单、姓名详情和移动端不实现。
  - 非范围：数据库迁移、修改最终评级保存链路、HRBP匹配、实时成员重写、像素级截图验收。
  - 当前完成证据：后端 `test_performance_projects.py` 37 passed；前端 `ProjectPerformanceMatrix.spec.ts` 与 `ProjectManagement.spec.ts` 15 passed；任务级 implementation 门禁 PASS。完整采集包、目标截图 diff 与真实数据权限验收仍未完成，pixel_restore_status 保持 blocked。
  - 白卡缺陷修正（2026-09-20）：矩阵根节点复用 `PerformanceSurfaceCard` 无标题变体，普通块布局、`padding: 0 20px 20px`；工具栏、两组标题/表格和全部状态归属同一白卡。未改共享卡片默认行为、后端、评级口径或其他页签。
  - 本轮修复验证：矩阵组件4项通过；项目管理非报表7项通过、统计报表1项显式跳过（并行修改的 `ProjectReportMatrix.vue` 出现 expandedKeys/updateExpanded 等错误）；本轮全量build受该报表组件 treeNode/null 类型错误阻断，不能沿用上一轮build通过结论。
  - 白卡运行时：Edge/Playwright隔离上下文、合成人员和只读API拦截；实际路由 `/performance/project-management` 在本地5197及Docker8080均测得白底rgb(255,255,255)、圆角8px、共享三层阴影，左/右/底间距各20px；1534×911与1100×800无页面横向溢出，正常/空态/错误态均在白卡内，姓名/数量切换正常，pageerror=0。截图 `PM-T010-T07-white-surface.png` 已查看，仅为合成数据实现截图，不是目标截图或真实API授权验收。
  - 本轮门禁：T07 implementation PASS，沿用已有定向证据豁免、不新增豁免项；完整像素验收仍blocked，T07保持未勾选。
  - 姓名格式修正（2026-09-20后续）：按用户追加Span采集参数，将两组姓名从原生button改为span.matrix-user-block；修复渲染函数子组件内部scoped选择器失效，使用限定在PeopleCell内的deep样式。字号14px、字重400、行高22px、keep-all和字体回退链与所给参数一致，无边框/背景/内边距；不固定85×17px、不拼造账号或修改display_name、不新增姓名跳转。用户随后明确校正颜色状态：默认#1F2329，hover才为#4E83FD；未采集focus/active颜色，不补造。
  - 姓名修复验证：`npm --prefix hr-portal/frontend run test -- --run src/components/performance/ProjectPerformanceMatrix.spec.ts src/views/performance/ProjectManagement.spec.ts` 15 passed、无跳过；T07 implementation门禁PASS。当前全量`npm run build`被本任务未修改的HRBP权限组件5个类型错误阻断；Dockerfile的Vite生产构建通过，未将该结果冒充全量vue-tsc通过。
  - 姓名运行时：Edge/Playwright隔离上下文、1534×911、合成数据；两组姓名默认态实测rgb(31,35,41)，hover实测rgb(78,131,253)，移出后恢复黑色；SPAN/14px/400/22px/keep-all、边框0、背景透明、padding0均符合契约，展开/收起、姓名/数量切换和白卡保留，pageerror=0。截图 `PM-T010-T07-name-span.png` 为前一版蓝色状态实现截图，不再作为颜色验收证据；本轮以确定性运行时状态测量为证据。
  - Docker部署复验：仅重建并替换`frontend`容器，未重启backend/db/gotenberg；容器运行、restart=0，项目管理路由HTTP 200。在Docker 8080同一路由通过隔离fixture实测姓名默认黑色、hover蓝色、移出恢复黑色，无button.person-name、白卡保留、pageerror=0。
  - 左列底色修正（2026-09-20后续）：两张矩阵表所有body职级格（含`--`行）统一继承表头底色 `#F5F6F7`，已完成表保持固定列；评级数据格仍为透明/白底，不扩散底色。矩阵6项测试、页面9项测试共15 passed；Vite生产构建通过；Docker 8080实测J3/J6左列均rgb(245,246,247)，右侧评级格保持透明，pageerror=0。
  - 完整轴修正（2026-09-20后续）：后端 `completed_rows` 初始化为项目成员涉及的全部职级，不因当前无已完成人员而省略；每行覆盖模板最终评级字段的全部选项，空单元格返回count=0/people=[]，前端显示`--`；评级底色复用模板颜色到共享trigger底色映射，不按评级名称猜色。
  - 完整轴验证：后端 `test_performance_projects.py` 37 passed；前端矩阵/项目管理15 passed；Vite生产构建通过；Docker前后端已重建替换，数据库/Gotenberg未重启。Docker 8080 fixture实测3个模板评级列、3个职级行，模板首级底色rgb(253,226,226)、左列底色rgb(245,246,247)、pageerror=0。

## PM-T010-T08 级别统计真实接入（P0/P1）

- [ ] PM-T010-T08 岗位职级真实统计与平面矩阵
  - 前置条件：PM-T010-T03
  - 用户授权：2026-09-21 明确同意“级别统计真实接入”增加任务级定向豁免，允许业务接入与结构实现；不扩展 T06/T07、不修改全局门禁，P2 仍 blocked。
  - 必读：本功能 spec.md、api-contract.md、ui-interaction.md、extracted-ui-contract.json；ADR-002；Spec012 UI 守则；执行契约与验收证据要求。
  - 允许修改：backend/app/performance/projects_router.py、backend/tests/test_performance_projects.py；frontend/src/api/performance.ts 及 performance.js 镜像；frontend/src/components/performance/projectStatisticsReport.ts、ProjectStatisticsReportPanel.vue、ProjectReportMatrix.vue 及对应 *.spec.ts；本功能现有规格、机器契约和 ui-gate-waivers.json。共享文件串行修改，保留其他任务差异。
  - 输入/输出契约：GET /performance/project-management/statistics?cycle_id=...&dimension=level；项目管理权限过滤、最新成员快照人员基线、与 matrix 同源的实时 position_level、最终评级已提交答案；返回 source=api、dimension=level、showSummary=true、无 children 的职级行。
  - UI Expert 交接：复用 ProjectReportMatrix、PerformanceRatingTag、PerformanceSortHeader；标题“级别统计”，首列“岗位职级”，汇总固定首行，禁止展开按钮和子行。数据源说明限定级别统计，不能把其余模拟章节标为真实。无截图参数不发明新样式。
  - 表头修正范围补充（用户2026-09-21要求）：允许 `backend/app/performance/self_summary_service.py` 仅透传选项原有 code 字段，使等级代号不在 hydrate/schema 归一化时丢失；原评价表单 label、选项ID和历史答案解析不变。共享最终评级输出用 code→label→id 作为表头，颜色继续透传；矩阵分析同步受益但计数/交互不变。补充规则code/name不同、颜色透传、历史答案、仅code冲突与前端七档表头回归。
  - 非范围：部门/团队/序列真实接入、矩阵分析行为改造、筛选弹层、迁移、历史快照回写、权限扩权、像素级还原。
  - Given/When/Then：授权/拒绝/无项目；最终答案与仅任务完成的区别；缺职级及零评级行；汇总与分母；多项目去重和冲突拒绝；真实调用与失败不回 mock；周期/provider 切换丢弃迟到响应；无展开、排序和空态；原部门/团队/序列回归。
  - 验收命令：check_ui_spec.py --task-id PM-T010-T08 --phase implementation；backend pytest tests/test_performance_projects.py；frontend Vitest 报表与 ProjectManagement 聚焦用例；vue-tsc --noEmit；docker compose build frontend backend。
  - 完成证据（2026-09-21）：主目录后端 `tests/test_performance_projects.py` 71 passed（1项 python_multipart 存量弃用警告）；前端7个聚焦文件37 passed，覆盖真实API客户端调用、来源说明与矩阵同显、无展开、403/409/500不回mock、跨周期/provider迟到隔离与三维度回归。T08 implementation gate PASS，仅本任务11项精确豁免，新增line_groups引用错误已修复而非豁免；无全局门禁修改。
  - 真实读取验收：Docker 8080 未拦截统计API、实际登录；周期6返回200/source=api，56名快照人员、2个实时岗位职级分组、7个评级选项、已评级0。只读SQL核对56名/56唯一工号/2分组、56条最终节点评估任务但0条已提交，与报表一致；匿名API返回401。无业务数据写入、无快照回写。
  - UI Verifier：1534×911实际Docker路由，刷新重开两次均真实API200、汇总1行、展开按钮0、页面无横向溢出、pageerror=0。已查看 `PM-T010-T08-level-api-1534.png`。另有1534×911/1100×911合成API响应结构截图 `PM-T010-T08-level-fixture-1534.png`、`PM-T010-T08-level-fixture-1100.png`，只证明正常有评级数据布局，不证明真实计数。
  - 类型检查：全量vue-tsc仍被非本任务HRBP测试3处及并行WorkbenchSettingEditor.vue 2处类型错误阻断；本任务文件无报告错误。Docker前端Vite镜像构建通过（不等于vue-tsc）。完整acceptance门禁/像素diff未运行，P2保持blocked，任务不勾选。
  - 运行环境：构建后端时Docker连接EOF中断，随后共享环境服务恢复并加载最新源码；本会话未重启原服务、未执行迁移。环境自行启动日志显示0229工作台迁移已执行，不计入本任务迁移交付。后端镜像构建另行重试记录。

  - 构建补充：后端镜像重试成功（exit 0，hr-portal-backend:latest，config sha256:3ce37b93df17b7bf6fc9788d09cd2d0ec651430abb8571871e7999d37da712b1）；前端构建成功（config sha256:3e1bc9c023633e4833ed5224702a20b52adad4aff6c42de54254a47288a97912）。共享环境后续镜像可能被其他任务更新，以真实API/UI验收记录为准。
  - 司龄真实接入补充（用户2026-09-21确认）：同一真实统计接口 `dimension=tenure`，读取实时 `hire_date`，按当前日期计算已完成自然月；行顺序为“入职未满3个月、3-6个月（不含6个月）、6个月-1年（不含1年）、1-3年内（不含3年）、3年以上、入职日期缺失”，有汇总无展开。缺失和未满3个月分开，所有行即使零人数也保留。复用等级代号/颜色、权限、快照、最终评级和错误冲突口径。
  - 司龄测试证据：后端 79 passed；前端司龄/级别报表聚焦测试 25 passed；覆盖自然月边界、六行平面结构、汇总、缺失入职日期、未满3个月、等级表头与颜色回归。
  - 状态运行时补充：Docker实际前端1100×800，statistics夹具验证加载、空表、500错误和403无权限态；错误态矩阵数量0、不回mock，pageerror=0。真实级别统计已通过Docker实际API与刷新重开；司龄真实运行时尚待后端镜像/服务加载后验收。
  - 表头修正验收（2026-09-21）：真实 Docker API 返回 `ratings[].label` 为 `1星/2星/3星-/3星/3星+/4星/5星`，颜色分别透传规则配置；不再显示 `不合格/待改进/符合预期/超出预期/卓越` 等规则名称。Docker实际页面 labels 与 tags 均为七档等级代号，summary=1、expand=0、pageErrors=[]。

## PM-T010-T09 上级评估去催办通用任务弹层

- [ ] 前端/后端：总览上级评估去催办跳转、通用全屏任务弹层与批量催办记录接口
  - 前置条件：PM-T010-T03；沿用现有工作台任务人员读取能力
  - 范围：`PerformanceTaskOverlay`、任务 Header、任务表格、结果摘要、分页、列配置、底部批量操作栏；`ProjectManagement` 接入“上级评估→去催办”；新增 `POST /performance/projects/{project_id}/reminder-tasks/remind`
  - 组件契约：页面只组装上下文；通用组件通过 props/events 接收 `ReminderContext`、provider、列和 capabilities；节点由 `node_id`/`node_type` 判别，不按名称或索引推断
  - 读取：默认 provider 复用 `/performance/workbench/tasks/{node_id}/people?state=pending`，前端适配为分页列表；列配置和能力可由后续入口 provider 注入
  - 写入：催办接口只接受当前项目/节点的 pending 且已开放任务；服务端重新校验项目、节点、处理人和状态；批量请求去重；结果区分 accepted/skipped；写入 `PERFORMANCE_TASK_REMINDER_REQUESTED` 审计事件。授权/转交仅保留事件边界，未伪造后端动作
  - 允许修改：`backend/app/performance/projects_router.py`、`backend/tests/test_performance_projects.py`、`frontend/src/api/performance.ts`、`frontend/src/components/performance/PerformanceListToolbar.vue`、本任务新增 performance 组件及测试、`frontend/src/views/performance/ProjectManagement.vue`
  - 测试证据：`PerformanceReminderPanel.spec.ts` 与 `ProjectManagement.spec.ts` 共12项通过；催办接口聚焦 pytest 1 passed；`vue-tsc` 与 `npm run build` 通过；全量项目后端测试存在既有/并行 `project_matrix` 测试失败，原因是工作区 `auth_context.py` 改动导致 fake Result 缺少 `scalar_one_or_none`，与本任务新增接口无关
  - UI 状态：P0/P1 结构实现；P2 保持 blocked。采集文件未提供完整表头、数据行、选择态和 hover/focus 状态，未生成 rendered contract 或截图 diff
  - 非范围：授权他人处理、转交他人处理真实 API；筛选弹层字段、导出后端、飞书消息发送；移动端适配；修改现有抽屉壳为万能容器

## PM-T010-T10 总览环节真实完成率

- [ ] PM-T010-T10 前端/后端：周期总览各环节接入真实截止时间、完成情况和完成率
  - 前置条件：PM-T010-T03；依赖 `PerformanceProjectNodeSnapshot`、`PerformanceNodeTask` 和最新成员快照。
  - 用户需求：截止时间接入真实节点时间；完成情况和完成率接入真实任务数据；节点未开始时仅百分比显示“未开始”，完成情况仍显示真实分子/分母；结果复议处理分母按真实提请复议人数计算；未开始时隐藏催办/开通按钮，并使用 20px/600/#8F959E 系统字体。
  - 允许修改：`backend/app/performance/projects_router.py`、`backend/tests/test_performance_projects.py`、`frontend/src/api/performance.ts`、`frontend/src/components/performance/CompletionNodeCard.vue`、`frontend/src/components/performance/CompletionRatePanel.vue`、`frontend/src/components/performance/CompletionRatePanel.spec.ts`、`frontend/src/views/performance/ProjectManagement.vue`、`frontend/src/views/performance/ProjectManagement.spec.ts` 及本功能 `spec.md`/`api-contract.md`/`ui-interaction.md`。
  - 数据契约：概览响应新增可选 `completion_nodes`；聚合当前周期可见已启动项目，任务完成以提交或 completed 状态判定，结果查看以 `result_published` 判定，截止时间来自节点快照；结果复议处理不使用成员快照回退作为分母。
  - UI 要求：复用现有完成率卡片；正常状态显示真实百分比、完成数/总数和 GMT+8 截止时间；`not_started` 仅百分比显示“未开始”，完成情况显示真实完成数/总数并禁止任何操作入口；`unavailable` 显示 `--`。不新增页面、不改变页签和布局。
  - 测试验收：后端 `python -m pytest tests/test_performance_projects.py -q`：86 passed、1 warning；前端两个聚焦文件：16 passed；`vue-tsc --noEmit`：通过；`npm run build`：通过。
  - 门禁/运行时：`check_ui_spec.py --phase implementation` 被功能历史采集缺口阻塞（缺少 capture-manifest、component-model、pixel-contract、acceptance-contract，readiness=blocked）；启动 Vite 后页面可加载，但真实 API 返回 401 未登录，未生成已认证的 rendered contract/截图 diff。
  - 完成证据：业务代码和自动化测试已完成；因 UI 门禁与真实登录态验收未完成，任务保持未勾选。

## 依赖

```text
T01 ──┐
      ├──→ T03 → T04
T02 ──┘
```

## 当前待决

- `administrators` 按姓名匹配的重名风险：本期按现状，矫正待定；
- HRBP 匹配逻辑：接口预留，待 HRBP 设置功能就绪；
- 数据权限角色体系：后续迭代。
