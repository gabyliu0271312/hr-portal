# PM-T003 原子任务：周期创建与周期级人员设置

## 任务状态规则

本文件任务均为后续实现任务。只有代码、UI、测试、验收和证据均完成后，才能将 `[ ]` 改为 `[x]`。

## 任务清单

- [ ] PM-T003-I03-F01 锁定UI及项目名单每日调整闭环（2026-11-21）
  - Goal/authority：用户明确按本轮REA评估开发UI和业务，自动移出清除当前项目本周期评估数据并保留审计，覆盖旧I03仅周期名单及锁后启动限制。
  - Reading：Spec002基线、PM-T003、CR-013、执行/迁移/验收契约；Spec012通用UI门禁。既有页面局部修订无新完整蓝图，目标以已采集DOM为准。
  - Allowed files：后端performance周期/项目/快照/模型/路由、必要共用成员服务、唯一0321迁移接0320、既有cycles/projects/snapshot测试；前端CycleManagement、必要锁定设置组合组件、api/performance.ts及受跟踪JS镜像、tokens.css、对应既有测试；本功能规格/交互/任务、独立PNG。
  - Shared files：后端代理独占backend，主线程独占frontend及规格，禁止并行覆盖同文件；不创建脚本/调研报告/测试文档，不操作生产、旧迁移、权限配置或无关功能，不commit/push/deploy。
  - Frozen contract：spec同日期修订；pre_lock_adjust_until，服务设内部版本2、旧版1；新AUTO必填now<until<=lock_at；创建后不可修改，GET回填。MANUAL只禁项目名单自动调整，DRAFT周期人员每日刷新；v2定时周期允许DRAFT快照启动。
  - Executor/transaction：统一lifecycle五分钟检查、北京时间自然日幂等；AUTO窗口内STARTED集合增删、系统不污染筛选条件；所有项目先删再加、冲突回滚该周期，其他周期隔离；不重建留存任务/答案、不额外外发，截止后不补增删。
  - UI：两个纵向单选8px、共享灰框24缩进/16padding/6圆角/N100；独立datetime截止、字段错误/禁用/草稿保留/UTC提交/旧空值回显。PNG ../../ui-blueprints/PM-T003-I03-lock-settings-dom-20261121.png。
  - Given/When/Then：创建/编辑/切换/缺截止/边界日期/长时间停留，正确阻断或单次保存回读；新旧启动门禁、MANUAL/AUTO差异、离职及限定范围、跨项目冲突/转移、重复执行、自动删除及已有提交、仅报表/校准/360增量、未变任务及历史、权限拒绝、事务失败与隔离。
  - Commands/evidence：定向Vitest/pytest、vue-tsc+Vite、alembic heads/离线SQL及获准隔离库升降级/API→SQL→新连接回读、真实浏览器截图分别记录，skipped/blocked不记通过。
  - Frontend evidence：2026-11-21最终周期页面及共享日期控件2文件67 passed（Vitest2.1.9，25.20s），覆盖布局组件接线、独立截止显隐/草稿/日期浮层、缺失/当前时间/晚于锁定边界、保存实时复验、UTC载荷、隐藏时null及编辑PATCH省略。首次命令受工作目录变化拼出错误路径而退出38，未运行测试；改绝对prefix后两轮64/67项均通过。
  - Build/UI evidence：vue-tsc+Vite生产构建exit0，3798模块、46.39s，仅既有VueUse PURE注释警告；Windows cr-at-eol差异检查通过。真实5173周期路由+CDP隔离全部API，验证纵向8px、N100/24px缩进/16px padding/6px圆角、日期时分浮层、422保留输入→重试→UTC截止/锁定载荷→成功列表→编辑disabled回显，pageerror0。390px视口页面宽390，组件clientWidth/scrollWidth均308。已查看独立PNG ../../ui-blueprints/PM-T003-I03-lock-settings-dom-20261121.png（实际编辑只读态）；此前新建态截图曾有模板下拉，现以干净重开态覆盖本卡同路径，不冒充真实数据库。
  - Backend/migration：后端代理最终实跑周期/项目/快照联合1244 passed、7 skipped、1项既有python_multipart弃用warning；此前迁移+周期98 passed、1 skipped；compileall及差异检查通过。唯一head为0321_pm_pre_lock_adjustment，接0320_pm_column_preferences；0320:0321 upgrade --sql与0321:0320 downgrade --sql均exit0。新增截止时间、内部版本、运行日期与冻结标记；旧v1 MANUAL不每日/到期同步，v2两模式每日同步，首次冻结标记避免截止后再次覆盖；逐周期失败rollback后继续、末尾汇总raise。
  - Backend专项：既有projects测试新增2项真实SQLite ORM集合调整用例，覆盖双向跨项目转移全部3次DELETE早于4次INSERT、新增/移出/限定范围/仅报表、冲突409零SQL写入/零成员mutation/零审计、留存成员及任务所有字段/答案/草稿/版本回读不变、重复执行零成员/任务写入、保存条件不变；既有cycles测试新增sync/adjust/flush/commit四阶段失败隔离，调用真实lifecycle handler验证rollback、下一周期提交、失败标记不保存及最终raise，事务为受控替身。新增6项专项通过；主线程已核对对应测试定义，不将SQLite或替身当作PostgreSQL验收。
  - Blocked：本地无5432服务，Docker daemon不可用，alembic check连接拒绝；真实PostgreSQL升级/降级/触发器/并发、真实API→SQL→新连接回读未执行。未操作公共/生产数据库。后续隔离库须完成upgrade/downgrade/upgrade；存在v2数据时downgrade明确拒绝丢弃策略；7项opt-in skipped不计通过。
  - Status：本地UI及业务代码开发、自动化、构建和隔离浏览器验证已完成；真实数据库验收阻塞，保持本卡及I03整卡未勾选。未commit/push/deploy。

- [ ] PM-T003-I16 项目设置保存、离开保护及起止时间校验统一
  - Goal/Type：已确认既有功能优化；2026-11-11用户授权全部开发，保留弹窗/抽屉即时保存，规则可删空但下一步阻断。无新页面/信息架构，沿用已确认界面与共享组件，小调整不新增完整HTML蓝图。
  - Prerequisites/reading：Spec002基线、PM-T003 spec/ui-interaction、CR-013、执行合同/任务模板/验收证据、根及hr-portal规则、Spec012通用UI门禁。
  - Allowed modifications：frontend项目SettingsPage/FlowSettings/TimeSettings/TemplateField/helper及既有spec，CalibrationConditionGroup/CalibrationRuleDrawer字段提示；backend project_service/calibration_service/reconsideration_service及既有projects/reconsideration_lifecycle测试；本功能既有交互/任务记录。允许独立实际PNG；不创建脚本、报告或测试文档。
  - Shared files：前端时间/helper与后端服务按文件分工，主线程组装向导；projects_router及其旧夹具由并行CR-007负责，API/完成率/催办差异原样保留，最终统一build。禁止覆盖其它会话修改。
  - Frozen contract：原PATCH/GET与start接口、DTO、权限不变。STARTED按保存前基线锁已开始start，既有已开始历史end可改，未开始/新增phase end>=now；end>start；同校准节点阶段不重叠且接续允许。空rules可保存草稿，下一步/完成和后端显式配置完成/start阻空；旧完成标记不阻删除。结果查看start/appeal优先控制员工发起窗口，处理end控制处理截止，缺历史字段逐字段回退；不新增确认结果节点或推断自指文案。配置/任务时间同步/软撤销/审计沿用原事务，不重算答案版本与人员快照。
  - UI：下一步保存成功后推进并全局toast；完成保存后返回PerformanceCycles且不启动；未保存返回/路由离开共享确认，继续编辑/离开，不自动保存；浏览器关闭原生保护。空校准提示固定在添加校准阶段按钮下“请配置校准范围”，字段红框/下方文字全部复用既有token，非法手输不得提交旧值。保留新增阶段前两步暂缓整份提交例外，不误报保存成功。
  - Test contract：Given草稿/STARTED/历史配置/空规则/多阶段/复议节点，When下一步/完成/删除/延期/返回/非法输入，Then正确阻断或一次保存、全局提示、草稿保留、保存前start锁、普通重叠允许/校准重叠拒绝/接续允许、复议截止关联、权限和原历史来源不变。真实API→SQL→GET新连接/并发与夹具验证分开；跳过不算通过。
  - Frontend evidence：本轮主线程最终六文件联合170 passed（ProjectSettings46、FlowSettings45、TimeSettings53、TemplateField9、CalibrationConditionGroup10、DistributionRuleDrawer7），命令npm.cmd --prefix hr-portal/frontend test -- 对应六个既有spec --pool=threads --poolOptions.threads.singleThread=true --silent；npm.cmd --prefix hr-portal/frontend run build已通过vue-tsc+Vite3689模块（最终联合工作区构建），只有既有VueUse PURE注释警告。此前失败为旧表体选择器、Vitest2不支持matcher及新增校准时间重叠夹具，已纠正后联合通过。
  - Backend evidence：原服务代理新增合同聚焦38 passed；末次无start处理兼容及end==now修正后复议生命周期44 passed、时间/校准聚焦37 passed/1 PostgreSQL opt-in skipped。较早三文件803 passed/10 failed/6 skipped中的router替身问题交由CR-007线程统一修复，不将较早失败宣称通过；最终联合结果：CR-007线程收敛router测试后报告projects/reconsideration_lifecycle/auth_context/role_configuration/subject_visibility五文件809 passed/5 skipped（其线程实跑）；本主线程另实跑reconsideration_lifecycle+cycles两文件117 passed/1 skipped，以及projects时间/校准聚焦37 passed/1 skipped/686 deselected，均exit0，既有python_multipart弃用warning，不将PG opt-in skipped计通过。
  - Browser evidence：真实Vite路由5173+隔离模拟API，Chrome1440×1000验证唯一规则删除即时PATCH且保持空、下一步无第二次保存/不前进、添加阶段下方准确文案（rgb245,74,69/13px来自全局token）、未保存返回确认及继续编辑保留页面，pageerror0。PNG ../../ui-blueprints/PM-T003-I16-empty-calibration-validation.png 已查看；第二轮真实路由另验证已开始start禁用、未来start改过去不自锁、未开始截止历史值阻断、同节点阶段重叠阻断/边界接续允许、复议处理截止关联、非法手输零PATCH、修正后一次PATCH UTC载荷且完成跳转PerformanceCycles，pageerror0。独立PNG ../../ui-blueprints/PM-T003-I16-time-contract-validation.png 已查看。不伪称真实鉴权/API/数据库验收。
  - Non-scope/stop：无迁移、外部通知、生产操作、commit/push/deploy；停止时仅撤销本卡未发布局部差异，不回滚并行工作或历史数据。现有第6条歧义及确认结果流程未扩展。
  - Blockers/Definition of done：本地开发与自动化/部分浏览器验证完成；8000API不可连接，真实数据库回读/并发验收未做，整卡保持未勾选，不以构建/夹具代替生产验收。

- [ ] PM-T003-I15 项目复制两步流程与共享组件/token校准
  - 授权/入口：2026-11-06 用户明确要求根据本轮 REA 采集完成开发，采用全局组件与设计 token 并修正差异；周期与项目 → 项目设置 → 更多 → 复制。交互依据为本功能 `ui-interaction.md` 的“项目复制两步流程”及本轮 REA 评估，取代早期项目复制仅展示入口的限制。
  - 范围：新增业务组合 `PerformanceProjectCopyDialog.vue`；复用/扩展共享 DialogShell、SearchSelect/SelectShell、ProjectDialog、UiButton 及全局 tokens；CycleManagement 两步草稿组装、API copy 可选 payload、后端复制事务与既有测试。不修改模型/迁移、权限配置、历史任务、生产数据或其他并行工作。
  - 契约：第一步分页读周期列表且默认源周期，确定只 GET 源项目；第二步名称原名加空格副本，目标周期懒加载范围选项，最终 POST `/performance/projects/{id}/copy`，携带数字 `target_cycle_id` 和表单六字段。深拷贝源配置，草稿/人数0，不复制历史；源可管理且目标创建权限校验，一次commit；失败403/404/422及rollback。
  - Given/When/Then：选择跨周期再修改名称，最终确认前不得写库；任一步取消不创建；目标选项来源正确；失败保留草稿可重试；重复提交禁用；无创建权限隐藏入口且服务端403；配置深复制不污染源项目。停止方式为撤销本轮局部差异，不整包回滚。
  - 共享视觉：600×184复制框，header72/body32/footer56，标题16/600/24，按钮80×32/14/400/22、#1456f0，正文左右24及底间隔24；detailed选项48高、日期12/18，全局字体栈。公共token调整影响现有消费方，因此另跑共享弹窗回归。
  - 前端测试：共享弹窗/确认框/授权框/创建框/选择器5文件30 passed；复制、取消、目标周期选项、删除确认等页面聚焦6 passed、35 deselected（Vitest显示skipped）；页面扩大回归40 passed、1 failed，失败为部门面板已改共享UiTable而既有断言仍查ElTable，本轮未改该业务组件。完整 `npm --prefix hr-portal/frontend run build` 的vue-tsc和Vite通过，既有VueUse PURE注释警告。
  - 后端测试：`tests/test_performance_projects.py -k 'copy_project or project_scope_permissions'` 10 passed；完整项目测试392 passed、9 failed、5 skipped，失败涉及既有并行校准/授权测试替身与SQLite字段/过期校准冲突，未扩修。未把跳过项计为通过。
  - 浏览器证据：独立生产包5175+隔离模拟API，1280×800实测复制框600×184、三段72/32/56、按钮80×32、标题16/600/24、主色#1456f0/白字；默认源周期、跨周期进入表单、预填空格副本、最终请求target_cycle_id=2及修改名称、422保留草稿、取消、pageerror0。375×667已打开弹窗后收缩宽约343.33/左16、页面scrollWidth375；原页面窄屏操作列入口被外层遮挡，未宣称窄屏全链路通过。
  - 独立PNG（均已查看）：`../../ui-blueprints/PM-T003-I15-copy-cycle-implemented-20261106.png`、`../../ui-blueprints/PM-T003-I15-copy-cycle-options-implemented-20261106.png`、`../../ui-blueprints/PM-T003-I15-copy-project-form-implemented-20261106.png`。未创建脚本、报告或测试文档；补丁按Windows cr-at-eol规则检查通过。
  - 未完成：真实鉴权API→数据库→GET回读、生产部署/验收未执行；故保留 `[ ]`，不随本地代码/模拟测试通过自动勾选。下拉用原生滚动保留240px上限，未恢复源站虚拟列表内部实现或周期条目编辑入口。

- [x] PM-T003-I01-F01 周期列表分割线布局修复
  - 范围：208px 周期内容区与分割线保持 20px 间距；详情内容起点不变；1px 半透明线贯穿白色容器。
  - 验证：2026-10-15 周期页面及相关共享组件 4 个测试文件、42 项通过；`npm run build` 通过。
  - 浏览器证据：Playwright 对本地开发页和替换后的 `http://127.0.0.1:8080/performance/settings/cycles` 使用模拟接口数据验证；1534×911 下分割线 x=508、y=118、宽1px、高773px、距加号20px；1920×640/894×631 对应高502/493px，颜色均为 rgba(187,191,196,0.5)。未验证真实项目新配置接口。
  - 部署：仅替换 frontend；镜像 `sha256:82c52f4efb60f52e2b94363b213c0defce46618b1afce009a3e46d69f6ac8f91`，2026-10-15 08:44:19 UTC 启动，HTTP 200，`nginx -t` 通过。I01 整体仍需完整业务验收，不据此勾选。

- [ ] PM-T003-I01 实现周期列表与周期详情
  - 前置任务：PM-T003 规格与 UI 蓝图确认
  - 功能范围：周期搜索、选择、详情摘要、项目列表 UI 壳、编辑入口、删除入口及按钮状态。
  - 代码交付物：前端页面、路由视图、列表/详情 API 对接。
  - 不修改范围：不实现项目创建与项目管理。
  - UI 要求：按 `../../ui-blueprints/PM-T003-cycle-creation.md` 实现双栏布局和状态。
  - 数据库要求：复用已确认模型；不得绕过迁移。
  - 权限要求：复用后台入口门禁，服务端按周期查看/管理权限校验。
  - 测试要求：列表、搜索、空态、加载态、错误态、无权限和删除按钮状态。
  - 验收标准：展示周期基本信息和项目列表字段；操作列固定、横向滚动条可见；已启动项目时周期删除按钮置灰，其他情况可进入二次确认。
  - 完成证据：测试结果、浏览器截图和 API 响应。
  - 完成定义：前后端权限和页面状态均通过验收。
  - 局部修复（2026-11-23）：本轮五项差异已实现：北京时间起止日期、真实周期创建时间、项目管理员共享身份标签逐人分行、搜索筛选右对齐、周期更多入口对齐及多态。新增组件 `PerformanceCycleListItem.vue`，复用共享图标按钮/人员身份/工具栏；新增外观参数集中 `tokens.css`。服务与响应 Schema 输出只读 `created_at`，无迁移、无权限或快照语义变更。交互和 REA 证据见本目录 `ui-interaction.md`“周期详情局部校准”。
  - 本轮测试：后端 `.venv/Scripts/python.exe -m pytest tests/test_performance_cycles.py -q --tb=short`：98 passed、1 skipped（保留既有 PostgreSQL 验收跳过）、1 项 multipart 弃用警告；前端 `npm run test -- src/views/performance/CycleManagement.spec.ts src/components/performance/PerformanceMemberIdentity.spec.ts`：2 文件74 passed，含北京时间跨日、创建时间缺失占位、多人管理员、删除禁用和Esc关闭；保留既有 Vue 浮层属性与 sourceCycle 警告。`npm run build`：vue-tsc及Vite通过，保留既有VueUse PURE注释警告。Windows换行检查 `git -c core.whitespace=cr-at-eol diff --check` 通过。
  - 五项修复浏览器证据（2026-11-23）：Chrome+隔离模拟 API，1280/1534视口验证默认隐藏/悬浮/按下/展开/删除禁用/Esc/搜索空态；按钮24×24、图标16、行高40、菜单124×69；管理员24px标签/8px行间距，筛选贴齐工具栏右侧，外层横向溢出0，pageerror0。独立PNG：`../../ui-blueprints/PM-T003-I01-cycle-detail-{default,active,menu,empty,wide}-implemented-20261123.png`，5张均已查看。目标菜单约123.33×69.52，保留子像素偏差记录；未实采更多触发器业务禁用，头像为共享占位。真实鉴权/SQL回读和生产验收未执行，I01整体保持 `[ ]`。
  - 追加提示修复（2026-11-23）：周期名称复用 `PerformanceInfoPopover` 文本变体，仅实际溢出显示完整名称；删除禁用项复用 `PerformanceDisabledReason`，通过共享 `PerformancePopover` 右侧展开提示“周期中已有启动的项目，不支持删除”。共享浮层新增侧向定位与箭头，不改业务权限/删除判定。前端定向回归：3 文件、80 项通过；中途 `npm run build` 通过；最后一轮构建被并行修改的 `PerformanceTemplateRenderer.spec.ts:482` TS2339 阻塞（exit 2），不能将中途结果作为最终完整构建通过，保留既有 Vue 警告。Chrome 隔离模拟 API 验证长名称/短名称、右侧提示、移入保持、移出关闭、无写请求、pageerror=0；两张独立 PNG 已查看并保存。真实后端/生产验收未执行，I01整体保持 `[ ]`。
  - 周期说明与项目更多悬浮修复（2026-11-23）：周期旁说明接入目标实采文案“如所在项目已启动，周期将按截止时间降序展示在绩效评估页面”。项目“…”由文本改为权限按钮包装共享SVG按钮，menu变体24×24px、图标14px、圆角4px、默认透明、hover/按下/展开#dee0e3，外观复用全局token；Element Plus菜单支持hover和click，复制/删除沿用原权限和确认流程。Chrome隔离模拟API验证说明浮层420×约69.33px、hover无点击展开、移入菜单保持、移出关闭、复制弹窗/删除强确认、确认前写请求0、pageerror0；稳定采样背景rgb(222,224,227)，项目管理员无复制入口。无权限页面浏览器检查因重载跳转后等待周期项超时而失败，不记为通过；补组件权限回归验证。截图已查看：`../../ui-blueprints/PM-T003-I01-cycle-list-help-implemented-20261123.png`、`../../ui-blueprints/PM-T003-I01-project-more-hover-implemented-20261123.png`。定向回归3文件81项已通过（含新增项目授权菜单边界；首次全局菜单查询受其他用例残留影响，改按当前按钮aria-controls限定后通过）；完整`npm run build`退出2，被并行的`PerformanceTemplateRenderer.spec.ts:482` TS2339阻塞；独立 `node node_modules/vite/bin/vite.js build` 已通过（52.70s、exit 0，保留既有VueUse PURE注释告警）；首次因工作目录重复cd失败，已在正确前端目录执行通过。不改前台排序、后端、权限定义、富文本并行改动，不新增目标站导入功能；未提交/推送/部署，I01整体保持 `[ ]`。
  - 省略号本身DOM校准（2026-11-23）：目标为原生text-overflow:ellipsis而非手工三个点，实际字体Segoe UI Semibold/Microsoft YaHei Bold，14px/600/22px、等宽数字tnum/tabular-nums、text-rendering:auto。本地共享文本变体统一字体token、数字特性和收缩布局，未改body字体或业务判断。同Chrome/DPR1.5，目标/本地同名文本范围精确同为183.76043701171875px、可用154px、scrollWidth184，短名宽36.03125px，所核对DOM渲染参数无差异；全名浮层215.21875px、短名无提示、pageerror0。未选中态目标/本地文本范围也精确同为181.88543701171875px、字重400。3测试文件81项通过；首轮完整构建发现本轮前序菜单断言的aria-controls类型为string|undefined（TS2345），已补非空断言；修正后`npm run build`完整通过（vue-tsc+Vite、49.84s、exit0，既有PURE警告），该菜单权限单项复验1 passed/65 skipped（名称筛选未执行）。辅证PNG `../../ui-blueprints/PM-T003-I01-cycle-ellipsis-dom-aligned-20261123.png` 已查看，验收以DOM及平台字体为主；I01整体不因局部修复勾选。

- [ ] PM-T003-I02 实现新建与编辑周期表单
  - 前置任务：PM-T003-I01
  - 功能范围：中文周期名称、语言预留、年份、周期类型、起止时间、评估设置占位模块、校验和保存反馈。
  - 代码交付物：表单组件、评估结果校验提示规则静态占位、字段校验、提交状态和错误展示。
  - 不修改范围：不创建项目、不创建项目成员。
  - UI 要求：支持年份面板翻页、周期类型分组选择、日期时间选择器和截图文案；评估设置下在绩效模板后展示评估结果校验提示规则静态占位，配置按钮禁用，点击交互下一步实现。
  - 数据库要求：保存周期基础信息；迁移需支持回滚和旧数据兼容。
  - 权限要求：仅绩效管理员可创建/编辑周期。
  - 测试要求：标准/自定义周期、历史开始时间、截止时间错误、重复提交、接口错误和编辑回填；空提交时验证全部必填字段红框及“字段名为必填”提示，修改字段后清除对应错误。
  - 验收标准：标准类型自动带出时间且可修改；名称手填；截止时间晚于开始时间。
  - 完成证据：前端测试、API 测试、构建和浏览器截图。
  - 完成定义：表单字段、校验、保存和编辑均通过验收。

- [ ] PM-T003-I03 实现周期锁定与周期人员快照
  - 前置任务：PM-T003-I02
  - 功能范围：立即锁定、定时锁定、周期级手动/自动名单规则、锁定执行和快照展示。
  - 代码交付物：锁定业务服务、定时执行器、快照写入和状态查询。
  - 不修改范围：不处理项目成员唯一性和项目启动状态。
  - UI 要求：创建后锁定规则只读；定时锁定展示 6 小时校验和锁定状态。
  - 数据库要求：锁定策略不可变；快照写入事务化；重复执行幂等。
  - 权限要求：仅周期管理员可在绩效开始前更新锁定信息，必须记录原因。
  - 测试要求：立即锁定、定时锁定、历史周期、6 小时边界、自动同步不覆盖手工维护名单、幂等和权限。
  - 验收标准：锁定对象仅为人员汇报线和组织关系；项目结构不被本任务锁定。
  - 完成证据：服务测试、任务执行日志、数据库前后值和浏览器截图。
  - 完成定义：快照、定时锁定、权限和审计全部通过验收。
  - 表格修正验证（2026-11-03）：人员和部门面板改用共享组件的 Element Plus 默认插槽，数据列使用 min-width，最大高度 600px，操作列 280px/fixed-right；尚无已定义行操作，单元格显示“—”。`npx.cmd vitest run src/views/performance/CycleManagement.spec.ts src/components/performance/PerformanceHrbpPermissionTable.spec.ts`：2 文件、31 项通过（含新增人员/部门表格 2 项），覆盖数据展示、列配置、分页和搜索。`npm.cmd run build`（vue-tsc + Vite）通过，仅依赖 PURE 注释告警。真实 Chrome 本地开发路由使用隔离模拟 API 验证：修复页面 flex 子项缺少 min-width:0 导致表格撑宽，以及 Tabs 非 flush 模式造成的 20px 外层溢出；人员表在1280px视口横向滚动442px，操作列x始终1000px；部门表在680px视口横向滚动80px，操作列x始终400px，表头/表体对齐且外层无横向溢出，无pageerror。独立截图：`../../ui-blueprints/PM-T003-I03-people-fixed-right-implemented-20261103.png`、`../../ui-blueprints/PM-T003-I03-department-fixed-right-implemented-20261103.png`，已查看。该验证不代表真实后端/生产验收，不据此勾选 I01/I03/I05。本轮不改后端、数据库、权限、审计，不部署；用户随后明确授权将本次表格修复、测试及验收证据提交并推送至 main。
  - 表格容器修复验证（2026-11-03）：人员/部门列表启用共享白卡 surface 与内部滚动模式，搜索、表体、分页同属白卡；白卡左右 20px、顶部距 Tab 8px、分页距白卡底部 20px、屏幕底部最小 20px。1/5/10/100 条数据实测白卡随内容增长，达到可用高度后保持固定；滚轮、键盘和程序滚动均进入 Element Plus 表体，滚动条不可见，分页保持可见。1280×850、1534×911、680×600、375×667 均验证外层无横向/纵向溢出；人员横向滚动后操作列仍固定，部门纵向/横向滚动后操作列仍固定；空态、加载态、分页切换和 pageerror=0 均通过。Chrome 断言输出已完成；截图：`../../ui-blueprints/PM-T003-I03-people-surface-scroll-implemented-20261103.png`、`../../ui-blueprints/PM-T003-I03-department-surface-scroll-implemented-20261103.png`。`npx.cmd vitest run src/views/performance/CycleManagement.spec.ts src/components/performance/PerformanceLineTabs.spec.ts src/components/performance/FullScreenModal.spec.ts src/components/performance/PerformanceReminderPanel.spec.ts src/components/performance/ReviewRuleTable.spec.ts src/components/performance/PerformanceHrbpPermissionTable.spec.ts`：6 文件、72 项通过；`npm.cmd run build`：vue-tsc 与 Vite 通过，仅有既有 PURE 注释告警。该验证仅覆盖本地前端与隔离模拟 API，不代表真实后端/生产验收；本轮不改后端、数据库、权限、审计，不部署。
  - el-table 行为补齐验证（2026-11-03）：静态来源为原站 `672791 → 76039 → 690843` 列表链及 `638521 → 220847` 文本组件，已对应人员七列 228px、部门名称/上级部门 280px 基准与默认 300ms 溢出提示；本地最初以 min-width 和 Element Plus fit 实现、操作列 280px/fixed-right；该宽屏分配已由下述浏览器列宽修正替代。表头/正文水平 padding 统一到 .cell 的 12px；实际溢出才显示共享 PerformancePopover，支持移入浮层、滚动/换数据/卸载清理；只开放 EP 内部横向滑块，外层不横滚。100ms 离开延迟与滚动条外观为本地选择，未证实为原站精确参数。
  - 本轮回归：`npx.cmd vitest run src/views/performance/CycleManagement.spec.ts src/components/performance/PerformanceLineTabs.spec.ts src/components/performance/FullScreenModal.spec.ts src/components/performance/PerformanceReminderPanel.spec.ts src/components/performance/ReviewRuleTable.spec.ts src/components/performance/PerformanceHrbpPermissionTable.spec.ts` 再次通过，6 文件、73 项。此前 `npm.cmd run build` 被其他文件 `PerformanceTemplateContentSettings.spec.ts` 的 TS18048（1615、1680 行共三项）阻塞，未修改该文件；单独 `npx.cmd vite build` 通过。本次最终 `npm.cmd run build` 复验仍以相同三项 TS18048 退出 2，完整构建未通过。
  - 宽屏列宽修正（2026-11-03）：原站已采集人员 DOM 的 table 为 `width:auto; min-width:100%; table-layout:fixed`，9 列 col 均同时声明数值 `width/min-width`，操作末列亦为数字列；76039 透传列，672791 定义列宽，现有采集无 690843 定义和原站宽屏实测。目标人员/部门的共享表格可选模式通过同声明的隐藏原生表让 Chrome 求解列宽，并将实际宽度传给 EP 列、关闭目标 EP fit；宽屏操作列也参与拉伸，默认消费方仍保留 fit。Chrome 隔离模拟 API 实测：人员内容区 3120px 时操作列约 368px，缩至 600px 时恢复 280px；部门内容区 1200px 为 336/336/192/336px，1720px 为 482/481/275/482px，缩至 600px 时为 280/280/160/280px。部门实际拖动 EP 横向滑块后 scrollLeft 约 243.33px，固定操作列表头/正文 x 均为 360px，其他列表头/正文同步；长文本共享溢出提示、加载中、空态、窗口缩放及外层溢出 0 均已验证，pageerror=0。新独立截图已查看：`../../ui-blueprints/PM-T003-I03-el-table-browser-width-wide-20261103.png`、`../../ui-blueprints/PM-T003-I03-el-table-browser-width-scroll-20261103.png`。仅复现已采集声明的浏览器求解，不宣称未采集的原站宽屏完整实现已获证。6 文件 74 项前端测试通过，测试组件查询类型修正后定向 34 项再次通过；本轮新增测试的 TS2339 已消除。最终 `npm.cmd run build` 仅余其他文件 `PerformanceTemplateContentSettings.spec.ts` 1615/1680 行三项 TS18048，退出 2，完整构建未通过；未修改该文件。单独 `npx.cmd vite build` 通过，保留既有 VueUse PURE 注释告警，`git diff --check` 通过。EP 公开列宽按整数解析，传入宽度按累计边界取整保持总宽，各列与浏览器小数值可能有不足 1px 的差异。无 API、后端、数据库、权限或审计变更；用户随后明确授权仅将本次相关修复、测试及验收证据提交并推送至 main，不部署；I03 整体仍保持 `[ ]`。

  - 白卡填充/分页自然流修正（2026-11-04，替代上文容器自然增长和分页贴底规则）：按用户“全部比对调整实现”授权，仅人员/部门列表启用共享表格可选 `viewport-fill`。白卡填满可用高度，屏幕底距 20px；表格自然增长且保留 600px 上限；分页上下 margin 16px、正常文档流、不贴底；局部移除 Tabs 多余 8px 顶部间距；常规正文行高 52px、分页高 28px，均走全局 token。小屏白卡仅纵向滚动，EP 表体仍独占横向滚动，放开纵向滚动衔接以便到达分页；其他默认消费方保持原高度测量和分页间距。真实 Chrome + 隔离模拟 API：两个列表在 1280×900/1100 时白卡顶部 124px、底距 20px、分页底部均 804px，下方留白由 76px 增至 276px；680×590 下滚轮从表体衔接至白卡、分页可达，横滚 350px 后操作列位置不变；375×667 下空态/分页换行无外层横溢出，100 条数据在 EP 内滚动后可继续滚动到分页；搜索、分页请求、加载态和 pageerror=0 通过。前轮缩放环境曾测得约 0.33px 底距差异，本次隔离 Chrome 复验均为 20px，不为小数误差引入补偿。原站分页底部约 809.83px，本地模拟数据约差 5.83px，未宣称像素级一致或完整恢复 690843 源码。本次五张独立截图均已查看：`../../ui-blueprints/PM-T003-I03-viewport-fill-people-tall-20261104.png`、`../../ui-blueprints/PM-T003-I03-viewport-fill-people-small-20261104.png`、`../../ui-blueprints/PM-T003-I03-viewport-fill-department-tall-20261104.png`、`../../ui-blueprints/PM-T003-I03-viewport-fill-department-small-20261104.png`、`../../ui-blueprints/PM-T003-I03-viewport-fill-empty-narrow-20261104.png`。项目本地 Vitest 2.1.9：`vitest run src/views/performance/CycleManagement.spec.ts src/components/performance/PerformanceLineTabs.spec.ts src/components/performance/FullScreenModal.spec.ts src/components/performance/PerformanceReminderPanel.spec.ts src/components/performance/ReviewRuleTable.spec.ts src/components/performance/PerformanceHrbpPermissionTable.spec.ts`，6 文件 75 项通过；此前误在仓库根运行 npx 未加载前端配置并失败，该次不计为业务测试结果。完整 `npm run build` 复验退出 2，仍被未修改的 `PerformanceTemplateContentSettings.spec.ts` 1643/1708 行三项 TS18048 阻塞；本轮最终代码单独 `vite build` 通过（1m 3s，保留既有 VueUse PURE 注释告警）。`git diff --check` 通过。无后端/API/数据库/权限/审计变更，不代表真实后端或生产验收；用户随后明确授权将本次相关代码、测试、文档和五张验收截图提交并推送至 main；不部署，I03 整体仍保持 `[ ]`。

  - 定时锁定缺陷修复（2026-11-04）：调度器启动时幂等确保 `performance_cycle_lifecycle` 系统任务存在，cron 为 `*/5 * * * *`，通过 `ON CONFLICT DO NOTHING` 保留已存在任务的配置及运行历史；周期服务编辑已创建周期时不再重复执行创建阶段“至少提前6小时”校验；周期编辑页仅在新建模式显示该校验。后端定向 13 项通过（含调度启动、任务幂等、到期锁定、重复执行、创建边界、历史周期编辑和审计）；历史周期保存时原值回传的离职规则不再误判为修改，实际变更仍受开始时间门禁。扩展后端回归 67 通过、2 项既有 `standard_position` 夹具失败、1 项 PostgreSQL 验收跳过。前端周期页面最终 36 通过、1 项并行部门表格切换 UiTable 后的旧 ElTable 断言失败，本次两个锁定用例通过；此前 identitySwitch 缺失曾阻塞收集，最终已可运行。最新完整前端构建因未修改的 PerformanceOkrPanel 缺少 API 类型导出失败。未完成真实生产数据库/调度日志和浏览器 PNG 验收，因此 I03 保持 `[ ]`。

  - 节点时间统一修复（2026-11-05）：项目设置页以北京时间墙上值编辑，保存节点/校准阶段时间时统一通过 `shanghaiLocalToUtcIso` 转为 UTC ISO；回读带时区值转换回北京时间显示，无时区值按既有墙上值显示。后端 `_parse_time` 统一将无时区节点时间按 `Asia/Shanghai` 解释、带时区值转 UTC，覆盖项目启动任务、评估页节点状态、工作台时间线、任务开放/截止、360°邀请及复议时间。后端项目回归 389 passed、5 skipped；前端项目设置/日期工具 23 passed；生产构建完成（Vite 3591 modules，既有 VueUse PURE warning）。不做旧数据兼容分支、不修改生产数据；真实生产 API/SQL 回读与部署待后续执行。

  - HRBP 权限范围说明修正（2026-11-05，代码与定向测试完成）：用户确认仅显示“部门内的人员信息以周期组织架构生成时间「YYYY-MM-DD」为准”，未锁定/已锁定统一显示周期配置的锁定日期；立即锁定无配置日期时取快照实际锁定时间，按北京时间显示，不展示参数来源说明。已核查周期 HRBP 选项和保存人员校验读取周期快照，全局共用入口才读取实时花名册；本次不改权限计算、快照或迁移。修改范围限定 cycles_router.py、frontend api/performance.ts、PerformanceHrbpPermissionDialog.vue、CycleHrbpPermissionManagement.vue 及现有对应测试，本目录交互/任务记录串行局部更新，保留其他未提交修改。不新增脚本、报告或测试文档；用户随后明确授权将本次相关代码、测试和规格记录提交并推送到 main，不部署。验收需覆盖定时/立即锁定、草稿未来日期、北京时间跨日、无日期不伪造及全局文案不变；定向测试、构建、浏览器和生产证据分别记，未完成不勾选 I03。停止方式仅撤销本次局部差异，不整包回滚。
  - 实际证据：后端目录 `.venv/Scripts/python.exe -m pytest tests/test_performance_cycles.py -k hrbp -q --tb=short`，9 passed、44 deselected，既有 `python_multipart` 弃用警告 1 项。前端目录 `npm run test -- src/components/performance/PerformanceHrbpPermissionDialog.spec.ts src/views/performance/CycleHrbpPermissionManagement.spec.ts src/views/performance/OtherPermissionSettings.spec.ts`，3 文件、24 passed；覆盖快照选项禁止读取实时花名册、配置时间优先、无快照仍可返回配置时间、立即锁定回退、未来草稿日期、北京时间跨日、无效日期、编辑重开及全局默认文案。`git diff --check` 通过。完整 `npm run build` 退出 2，被非本次修改的 `PerformanceConfiguredContentBlock.spec.ts:778` 的 TS2339（`get()` 返回的 DOMWrapper 无 `exists`）阻塞，未修改该文件。独立 `node node_modules/vite/bin/vite.js build` 打包通过（3602 modules，3m 57s，exit 0），仅既有 VueUse PURE 注释警告；未执行真实浏览器截图、真实 API/SQL 或生产验收，I03 整体仍保留未勾选。

- [x] PM-T003-I04 实现离职人员参评设置
  - 前置任务：PM-T003-I03
  - 功能范围：开关、离职日期范围、生成任务/仅报表统计方式及周期快照准入。
  - 代码交付物：离职规则字段、快照筛选逻辑和表单交互。
  - 不修改范围：不实现项目选人和项目评价任务。
  - UI 要求：关闭规则时隐藏或禁用日期范围和参评方式；开启时必填。
  - 数据库要求：规则保存到周期配置并参与快照版本化。
  - 权限要求：仅周期管理权限可配置。
  - 测试要求：关闭、开启、边界日期、空范围、两种参评方式和历史快照。
  - 验收标准：关闭时离职人员不进入快照；开启时按含首尾日期的离职区间准入。
  - 完成证据：规则测试、快照查询和 UI 截图。
  - 完成定义：配置和准入规则在正常/异常边界下均通过。

- [ ] PM-T003-I05 实现周期删除与更新审计
  - 前置任务：PM-T003-I01、PM-T003-I03
  - 功能范围：已启动项目依赖的删除禁用、二次确认、级联删除和人员/部门更新审计。
  - 代码交付物：删除服务、依赖检查、审计写入和错误反馈。
  - 不修改范围：项目启动状态及项目数据级联细节由后续项目需求定义。
  - UI 要求：删除按钮置灰；周期删除确认使用共享 `PerformanceConfirmDialog`，沿用 420px 响应式宽度及内容自适应高度、公共警告图标/按钮 hover token；保留/删除的业务回调由周期页面分别接入。
  - 完成状态：本轮完成弹窗 UI 接入、取消/确认/接口失败组件测试及前端构建；数据库级联、并发删除、审计和浏览器截图证据仍未完成，故任务保持 `[ ]`。
  - 数据库要求：删除事务化；审计记录不可因普通业务更新丢失。
  - 权限要求：更新审计动作仅允许周期管理员；项目管理员本期不可维护周期全局快照。
  - 测试要求：无项目、未启动项目、已启动项目、并发删除和审计完整性。
  - 验收标准：已启动项目时不可删；其他情况确认后删除并同步删除周期内项目。
  - 完成证据：API 响应、数据库记录、审计记录和浏览器截图。
  - 完成定义：危险操作和审计均通过验收。

- [x] PM-T003-I06 实现评估结果差异提示规则抽屉
  - 前置任务：PM-T003-I02
  - 功能范围：在周期创建表单中打开“添加需对比的环节”右侧抽屉；配置两个评估环节、评估项差异规则、阈值和提示方式；提交后回写周期表单草稿。
  - 代码交付物：`PerformanceComparisonRuleDrawer.vue`、组件测试、`CycleManagement.vue` 入口接入和交互测试。
  - UI 要求：复用 `PerformanceDrawerShell`、`PerformanceDrawerFooter`、`PerformanceAssessmentSelect`、`PerformanceMetricSelect`、`PerformanceNumberInput`、`PerformanceCheckbox`、`PerformanceInfoPopover` 和现有设计 token；覆盖校验、动态增删规则、关闭、提交和窄视口横向适配。关联本功能 `ui-interaction.md` 第 5 节及 Spec 012 的 N0001-N0005、N1101-N1106 通用检查；数据仓库专属 N 检查不涉及（本页面属绩效后台）。
  - UI 示意图：参考本功能 `ui-interaction.md` 第 5 节与 2026-10-15 采集的 680px 右侧抽屉；正式独立蓝图尚待确认。
  - UCP 协同要求：不涉及 UCP。
  - 测试要求：前端组件测试覆盖空提交、完整提交、删除行限制、关闭重置；周期页面测试覆盖入口打开；执行 `npm run build`。
  - 验收标准：用户可从评估设置打开 680px 右侧抽屉；两个环节不可相同；至少保留一条规则；阈值为正整数；至少选择一种提示方式；提交只回写周期草稿，不绕过周期保存。
  - 当前限制：评估模板接口和规则后端 DTO 尚未接入，当前支持通过 props 传入真实选项，并保留默认演示环节选项；本任务不声明后端持久化完成。
  - 完成证据：组件测试 3 项、周期页面测试 25 项、前端构建通过。
  - 完成定义：抽屉 UI、组件复用、表单校验、周期草稿回写和前端验证全部完成；后端契约另行任务。

- [ ] PM-T003-I06-F01 差异规则真实候选与持久化
  - Goal/Type：周期差异规则服务端候选、多组配置、项目启动快照、逐组删除撤销与迁移。
  - 2026-11-17多组修订：用户明确现有表格下继续添加多组，覆盖早期单组约束。配置表多行、逐行编辑/删除，各组ID与候选隔离；启动后仅删除子集可行且不能顺带改保留组；删除即时PATCH只提交持久化规则子集，其他未保存规则/字段不丢失。新迁移0310_pm_multiple_comparison_rules接唯一head0309，移除数据库最多一组限制，保留JSON数组校验；降级若周期/项目快照有多组则拒绝，不丢历史。F02/F03必须同步逐组理由/草稿、权限投影、通知发送前按rule_id复核，不得只配置多组而静默执行第一组。
  - UI：配置抽屉沿用 I06；真实DOM像素验收 PNG `../../ui-blueprints/PM-T003-I06-F01-config-blueprint-v1.png`，正式实现后另取 implemented PNG；添加/编辑锁定及删除确认。
  - 本轮需求修订（2026-11-17）：当前锁定只看仍存在的 `STARTED` 项目，删除最后一个启动项目后恢复添加/编辑；`ARCHIVED`、历史审计和快照不再单独锁定。锁定文案分别为“已有启动项目，不支持添加”和“已有启动项目，暂不支持修改”。规则删除复用强确认弹窗，精确输入“确认删除”后才可删除，失败保留输入。补充实现截图 `../../ui-blueprints/PM-T003-I06-F01-config-dom-aligned-20261117.png` 与 `../../ui-blueprints/PM-T003-I06-F01-summary-dom-aligned-20261117.png`；均已查看，最终截图为自评/上级评估、单条规则及评估中提示。截图来自本地 Vite + 隔离 API 夹具，不代表真实鉴权/数据库验收。
  - 本轮最终验证：`npm.cmd --prefix hr-portal/frontend test -- src/components/performance/PerformanceComparisonRuleDrawer.spec.ts src/components/performance/PerformanceComparisonRuleSettings.spec.ts src/views/performance/CycleManagement.spec.ts --silent`，3文件60 passed；`npm.cmd --prefix hr-portal/frontend run build` 的vue-tsc+Vite通过，3745模块，仅既有VueUse PURE注释告警。早轮1项失败为旧单行摘要空格断言，改为四列表格/标签/阈值/提示方式及pair请求断言后通过；补充加载中保留选项、warning DOM及阻止提交用例。非silent周期测试仍有既有UiDrawerShell透传attrs警告。
  - 本轮最终验证：`npm.cmd --prefix hr-portal/frontend test -- src/components/performance/PerformanceComparisonRuleSettings.spec.ts src/components/performance/PerformanceConfirmDialog.spec.ts src/views/performance/CycleManagement.spec.ts --silent`，3文件67 passed；`hr-portal/backend/.venv/Scripts/python.exe -m pytest hr-portal/backend/tests/test_performance_comparison_config.py hr-portal/backend/tests/test_performance_cycles.py -q --tb=short`，100 passed、1 skipped；前端生产构建通过，`git diff --check`通过。新增后端SQL回归覆盖两个STARTED项目逐个删除，最后一个删除后仅历史审计仍在时解除锁定；前端覆盖新增/编辑锁定文案、删除弹窗文案、确认输入精确匹配、加载/错误保留输入。
  - 本轮浏览器：上一轮已有1280×800真实Vite编辑路由和延迟响应零位移证据；本轮使用实际周期编辑路由+隔离API验证：编辑按钮禁用；删除弹窗标题、保留/删除按钮及“确认/确认删除”状态正确，输入“确认删除”后才启用并发出1次规则删除PATCH；删除后接口返回 `comparison_rules_editable=true`，刷新周期后添加按钮恢复可用；pageerror0。截图 `../../ui-blueprints/PM-T003-I06-F01-rule-delete-confirm-20261117.png` 已查看。
  - Test contract：Given 模板节点/共有评级题/参考权限/项目启动事实，When 候选、保存、重开、第二组、编辑锁定、删除，Then 身份、revision、权限和 active 交集正确。
  - 多组本地验证（2026-11-17）：本主线程联合前端7文件（ComparisonRuleSettings/Drawer、CycleManagement、SelfSummaryTask、ReviewEvaluationDrawer、ReferenceContentDrawer、ConfirmDialog）282 passed；最终vue-tsc+Vite生产构建通过3749模块，仅既有VueUse PURE告警。后端comparison_config/runtime/notifications/cycles/projects/shared_results/quality_dependency_hardening七文件联合987 passed、6 skipped，1项既有python_multipart弃用warning；真实PG opt-in跳过不计通过。配置29项包括ID独立、伪造/重复ID拒绝、启动后删子集不改其他组、迁移上下行离线SQL。运行端代理另报runtime+notifications67 passed、shared_results9 passed；前端代理运行端3文件204 passed，均已被上述联合结果覆盖，不叠加计数。
  - 多组浏览器证据：实际Vite编辑周期路由+全部业务API隔离夹具，添加第二组后2行且底部新增按钮仍在；抽屉提交前写请求0，周期保存PATCH携2组，重新打开2行；强确认删除第二组后仅保留r1，pageerror0。独立截图 `../../ui-blueprints/PM-T003-I06-F01-multiple-groups-20261117.png` 已查看。首次模拟保存因夹具遗漏leaver_participation_mode被字段校验阻断，补齐合法夹具后上述链路通过；不是绕过校验。
  - 迁移与边界：0310仅新增check调整，旧0307不改；离线upgrade/downgrade SQL通过，但未在真实PostgreSQL升级/降级或执行实际API→SQL新连接回读、并发锁/回滚验收。并行工作新增0311_field_group_authority_source接0310，当前唯一head0311，未改对方迁移。无真实飞书通知、无生产操作、无commit/push/deploy；F01/F02/F03整体保持未勾选。
  - 评估项禁选修订（2026-11-17）：新增/编辑抽屉接收其他行规则，按模板ID、无序环节对及content_id+item_id禁选已使用项，保留灰色候选和“已配置对比”提示；编辑当前行排除自身，其他组合/模板不受影响，删除占用组后恢复可选，切换至占用组合时清理不可用选择，提交校验拒绝禁用项。仅前端交互，不改API/后端/迁移，不对历史重复规则批量清理。
  - 本轮验证：Drawer/Settings/CycleManagement三文件66 passed，vue-tsc+Vite生产构建通过3749模块，仅既有VueUse PURE告警；首轮类型检查在新增测试可空访问及选项联合类型处失败，复用已有Option接口并修正断言后最终通过。真实Vite编辑路由+隔离API验证同组合已用项disabled、未使用项enabled、编辑自身项enabled，pageerror0；最终禁选提示独立组件截图 `../../ui-blueprints/PM-T003-I06-F01-used-item-disabled-20261117.png` 已查看，使用共享禁用项样式及简短文案避免200px菜单文字重叠。无真实API/生产操作，未commit/push/deploy，F01保持未勾选。
  - Non-scope：周期日期锁定、旧项目批量补快照、真实外发。

- [ ] PM-T003-I06-F02 评估中差异与提交理由
  - Goal/Type：普通/共享提交共用比较、字段提示、整组理由弹窗、必填/非必填、审计与历史投影。
  - UI：真实DOM像素验收 PNG `../../ui-blueprints/PM-T003-I06-F02-prompt-blueprint-v1.png`、`../../ui-blueprints/PM-T003-I06-F03-reason-blueprint-v1.png`，正式实现后另取 implemented PNG；复用现有填写工作区和共享Dialog/Field/Notice/Token。
  - Test contract：Given OR条件/多人正式结果/方向权限/版本冲突，When预检/提交/取消/源变化/删除后回看，Then提示、理由校验、权限裁剪、事务和历史符合契约。
  - Non-scope：新建Review提交链、360独立评估比较。
  - 2026-11-20 只读提醒及详情修复：`PerformanceComparisonNotice` 保留授权活动提醒，新增 `PerformanceComparisonDetailDialog` 复用共享弹窗/评级/按钮；已有api类型增加双侧可选评级展示。后端 `project_comparison` 在双侧字段可见校验后按各自选项投影 `label/color/foreground` 白名单，不改计算/状态/事务/历史和迁移。删除规则仍只读历史理由，无新增详情请求；当前提示与详情同源，切换上下文关闭详情。
  - 定向验证：`npm --prefix hr-portal/frontend test -- src/components/performance/PerformanceReviewEvaluationDrawer.spec.ts src/components/performance/PerformanceTemplateRenderer.spec.ts` 对应两文件116 passed（实际首轮命令还传入不存在的SelfSummaryTask.spec.ts，该文件未执行）；补跑 `npm --prefix hr-portal/frontend test -- src/views/performance/SelfSummaryTask.spec.js` 150 passed，合计266。覆盖五入口无理由提醒、详情开关/多组隔离/上下文失效、删除/禁用规则和缺失文案不显示原始ID。后端 `.venv/Scripts/python.exe -m pytest hr-portal/backend/tests/test_performance_comparison_runtime.py -q` 45 passed、1项既有python_multipart弃用warning，覆盖双侧评级与白名单、不可见项裁剪/理由脱敏、缺失选项兼容。
  - UI证据：真实本地Vite组件+合成数据，独立无持久化验证页面；打开详情、Esc关闭并焦点回到查看详情按钮。1280×800桌面及390×844窄屏已查看PNG `../../ui-blueprints/PM-T003-I06-F02-readonly-comparison-detail-20261120.png`、`../../ui-blueprints/PM-T003-I06-F02-readonly-comparison-mobile-20261120.png`；移动弹窗358px，无页面横向溢出，pageerror=0。首轮浏览器驱动因直接引用Vue依赖入口未正常渲染，改用Vite预构建入口后实际通过；未把首轮当通过。
  - 验收边界：未操作真实业务提交/API→SQL回读/生产或真实外发；原REA详情采集失败后未重试，不宣称详情像素级还原。F02整体保留未勾选，历史数据库闭环等阻塞见下文。全量build首轮被并行360邀请组件TS2554阻断；并行修改补齐其契约后复核 `npm --prefix hr-portal/frontend run build` exit0，vue-tsc通过、3789模块、Vite 56.72秒，仅既有VueUse PURE告警。本轮文件 `git diff --check` 通过。

  - 2026-11-20 目标DOM精调（覆盖上文初版居中弹窗）：通过目标已打开成员侧栏实际点击“查看详情”，确认真实为372×186锚定popover，提示按钮右对齐而非跟随文案。改用共享PerformancePopover/SelectTag/RatingTag：20/24 padding、8px圆角、组距20、行距8、24px人员标签、20px评级代码胶囊/12px字号；去掉目标不存在的标题/分隔线/实际档差/底部按钮。提示条40px、按钮64×22、右距16，保留再次点击/外部点击关闭，增加Esc及焦点恢复；多人同侧任务/版本归并避免重复记录。
  - 精调契约：first_rating/second_rating增加可选code；first_reviewer/second_reviewer仅附加到授权投影，普通实际提交人须由project/node/version匹配提交审计证明，共享按source_task_id/revision/source_actor，姓名来自冻结授权人员。缺可信身份/匿名/历史返回null，不回退handler。冻结表无头像字段，省略真实头像；前端使用共享文字头像占位，不伪造真实照片。无可见匹配无新增身份查询，有匹配批量查审计和人员，无逐match N+1。不变更计算/存储/签名/事务/迁移/通知权限。
  - 精调浏览器证据：本地Vite真实组件+合成数据，实测372×186、padding20/24、评级12px和20px高、3星-背景rgb(217,243,253)/文字rgb(0,71,97)与源站一致；移动390px下left16、width358，无横向溢出。点击外部/重复按钮/Esc关闭通过，焦点恢复，pageerror0。已查看独立PNG `../../ui-blueprints/PM-T003-I06-F02-anchored-detail-dom-20261120.png` 和 `../../ui-blueprints/PM-T003-I06-F02-anchored-detail-mobile-20261120.png`，本轮源站REA inspect超时后停止该调用，改以既有CDP连接直接读DOM和computedStyle。未以合成人物证明真实API→SQL回读或生产通过。

- [ ] PM-T003-I06-F03 差异通知
  - Goal/Type：事务outbox、统一scheduler、正式评级组合去重、另一侧有效评估人通知。
  - Test contract：Given三态/转交/只读/撤销/并发提交，When入队/claim/发送失败/删除，Then不重复、不误发、可审计、失败可重试且未知不盲重发。
  - Non-scope：真实飞书外发验收、独立scheduler。

### I06-F01/F02/F03 本地证据与未完成项（2026-11-17）

- 后端最终联合：在 backend 执行 `.venv/Scripts/python.exe -m pytest tests/test_performance_comparison_config.py tests/test_performance_comparison_runtime.py tests/test_performance_comparison_notifications.py tests/test_performance_cycles.py tests/test_performance_projects.py tests/test_performance_shared_results.py tests/test_quality_dependency_hardening.py -q --tb=short`，976 passed、6 skipped、1项既有python_multipart弃用warning；未把数据库opt-in跳过计入通过。前轮975 passed/1 failed来自旧work_summary夹具遗漏node_type，补齐该字段后单项及最终联合已通过；未修改生产逻辑规避失败。
- 前端9文件定向（ComparisonRuleDrawer/Settings/NumberInput/DrawerShell/DialogShell/CycleManagement/SelfSummaryTask/TemplateRenderer/ReviewEvaluationDrawer）297 passed，使用Vitest默认文件隔离。此前强制singleThread导致enableAutoUnmount重复及DOM串扰，隔离复跑共享3文件71 passed，再完整9文件通过；不将最初失败隐藏。最终标题必填标记补齐后，同组9文件再次297 passed（16:51实跑、exit0），最终vue-tsc+Vite构建exit0、50.52s。
- 类型检查+Vite生产构建通过，3745模块，仅既有VueUse PURE注释警告。`git -c core.whitespace=cr-at-eol diff --check`通过，保留Git换行提示。
- 真实本地Vite 5173路由 + 独立本地浏览器标签页，所有业务API由CDP隔离夹具截获：周期编辑打开680px真实组件抽屉；填写页实际warning、600px理由弹窗、120px文本框、label/textarea关联、空理由拦截；390px下弹窗x16/width358、document.scrollWidth390，无横向溢出。输入理由后模拟submit载荷为answers/version/comparison_context/diff_reason，版本更新至2，无pageerror。未向真实API提交。
- 独立已查看实现截图：`../../ui-blueprints/PM-T003-I06-F01-implemented-config-fixture.png`、`../../ui-blueprints/PM-T003-I06-F02-implemented-prompt-fixture.png`、`../../ui-blueprints/PM-T003-I06-F03-implemented-reason-fixture.png`、`../../ui-blueprints/PM-T003-I06-F03-implemented-reason-narrow-fixture.png`。配置截图早于最终标题必填标记补齐；仅证明实际本地界面及夹具交互，不宣称全状态像素级验收或真实数据库闭环。
- 迁移：0307_performance_comparison接0306；已做离线SQL生成，未在真实库执行。工作区其他会话随后添加0308/0309，实查当前唯一head为0309_form_config_menu；本线程不调整其链或迁移真实库。期间其他会话已提交0307迁移，不能把该提交归作本线程授权操作；本线程未commit/push/deploy。
- 阻塞：本地Docker daemon不可连接，8000/8080 API未启动，真实PostgreSQL upgrade/downgrade/API→SQL→新连接回读、并发锁竞争/失败回滚未验收。通知全部mock transport，未真实外发。旧已启动项目不自动补规则，需另行授权升级政策。三项任务保留未勾选，不以单测、构建或fixture截图宣称生产完成。

- [ ] PM-T003-I07 提炼绩效组织树与人员范围规则组件
  - 前置任务：PM-T003-I06；项目配置接口和现有 HRBP 组织树实现
  - 功能范围：将 HRBP 权限管理中的组织树生成逻辑和选择方式提炼为全局复用能力；统一项目被评估人筛选和限定考核范围的部门/员工选择；接入真实周期范围选项 API；保存并校验限定范围规则；项目启动时按组织路径和员工条件应用限定范围。
  - 代码交付物：`backend/app/performance/scope_options.py`、项目范围选项 API 返回组织树/人员选项、`PerformanceAudienceRuleEditor.vue`、共享组织树/人员选择器的禁用态支持、项目弹窗和项目设置页接入、`scope_rules` 请求/响应契约与服务校验。
  - UI 要求：复用 `PerformanceOrganizationSelect`、`PerformancePersonSelect`、`PerformanceSearchSelect`、`PerformanceSelectShell`、`PerformanceIconButton`、`PerformanceTextButton` 与现有设计 token；组织树使用完整组织路径 value；覆盖加载、空数据、禁用和校验状态；不新增独立部门树实现。
  - UCP 协同要求：不涉及 UCP。
  - 测试要求：后端 `tests/test_performance_projects.py`、`tests/test_performance_cycles.py`；前端组织树/人员选择组件测试；`npm run build`。
  - 验收标准：HRBP 权限管理与项目配置使用同一组织树生成器；项目被评估人支持部门/人员类型/员工筛选；限定考核范围仅支持部门/员工；项目 API 使用真实周期范围选项；开关开启但规则为空时阻止保存；项目启动筛选尊重限定范围；现有组织树组件回归通过。
  - 完成证据：后端 88 项项目测试通过；周期组织树 27 项测试通过；组织树组件 5 项测试通过；前端生产构建通过（仅保留既有 Vite 第三方 PURE 注释 warning）。
  - UI 修订（2026-10-16）：新建条件不预选部门，末列条件值框始终显示（未选字段时为禁用占位）；保持原被评估人字段/操作符/值选择的顺序；进入弹窗或项目设置页不加载选项，点击已启用的值选择框后才请求周期选项；已选值只由用户显式点击产生。详见 `ui-interaction.md` 第 10 节。
  - 本轮修订验证：字段、操作符与值框统一复用 `PerformanceSelectShell`，前两列使用 `PerformanceSearchSelect` 单选纯文本变体，选项来源仍为前端固定值；`PerformanceAudienceRuleEditor.spec.ts` 4 项、HRBP 组织树组件 5 项、`CycleManagement.spec.ts` 26 项通过；`npm run build` 通过。API 加载失败重试、项目设置页浏览器验收仍需补测，任务继续保持 `[ ]`。
  - 本轮条件连接符提炼（2026-10-19）：新增 `PerformanceConditionLogicGroup.vue`，限定考核范围以同一组件的 rail-only 变体保留 4db6b6e 左侧“或”轨道、行 DOM 与删除按钮布局；被评估人和校准规则组内使用左侧“且”轨道、组间使用原被评估人的横向“或”分隔（不复用组内竖向框选），并支持条件/条件组两级删除。聚焦前端 Vitest 4 个文件、22 项通过，`npm.cmd run build`（包含 `vue-tsc --noEmit`）通过；后端项目测试 128 项通过（共享工作树并行邀请人数变更同时增加了测试）。范围选项接口失败重试、项目设置页真实浏览器验收和独立 UI 截图未补齐；周期管理组件回归 26 项及后端周期测试 29 项通过，I07 仍保持 `[ ]`。
  - 条件值来源补充（2026-10-19）：`performanceConditionFields.ts` 汇总部门/人员类型/员工/与校准人关系字段及选项来源，后者固定为全部下级、直属下级、隔级下级（第 2 级及更深）。前端字段目录与条件组件聚焦测试 28 项、类型检查与生产构建、后端项目测试 133 项通过。校准关系匹配仍是运行时任务范围，未纳入 I07 勾选。
  - 校准配置真实保存补充（2026-10-19）：项目已创建时，校准规则抽屉确认后通过现有项目 PATCH 保存完整条件组，成功再 GET 回读并关闭；失败保留抽屉与旧规则，可重试。前端聚焦 5 个文件 32 项通过，`npm.cmd run build`（含类型检查）及后端项目测试 134 项通过（仅有既有依赖弃用警告）。仅配置持久化，不含运行时校准任务计算；真实鉴权 API/数据库的端到端验收及页面截图未完成，本任务仍为 `[ ]`。
  - 2026-11-18校准规则修订授权：用户要求根据本轮REA评估完成全部修复；沿本任务执行，无新页面/完整蓝图。允许修改后端calibration_service/project_service/projects_router及既有projects测试；前端performance API、CalibrationRuleDrawer/ConditionGroup、FlowSettings、SelectShell、ScopeCount、FocusGroupPeopleDialog及对应既有spec、tokens.css和本功能文档。前后端分文件独占，主线程整合；不创建脚本/测试文档，不改迁移、权限、实时人员源、历史配置或生产，不commit/push/deploy。
  - 本轮冻结契约：只读POST `/performance/projects/{id}/calibration-rule-preview`请求`{project,rule}`，管理授权403、项目不存在404、非法422；返回组人数/去重总人数/selected/people。共用正式校准匹配内核；校准人计有对象者、范围按被评估人并集；STARTED用实际成员及source_snapshot，DRAFT用周期快照和草稿。预览不写库/发消息；保存仍用原PATCH。UI见ui-interaction本轮修订，单组隐藏外侧删除并释放gutter，146/100列宽仅校准变体，八列名单共用全局表格/页头，plain pointer与input text在共享壳统一。
  - 本轮Given/When/Then：重叠OR/AND、上下级/部门/日期/无对象校准人及PROJECT_ALL返回正确去重集合；修改未保存规则立即失效旧请求，失败可重试且不丢输入；多组删除/单组无删、全屏八列/总名单与人数一致；权限拒绝和启动后实际成员来源不变；共享五列消费者回归。验收分自动测试/构建/真实UI/真实API快照读取单列，未验收不勾选任务。
  - 2026-11-18自动化证据：后端代理实跑 `.venv/Scripts/python.exe -m pytest tests/test_performance_projects.py -q -rs` → 824 passed、5 skipped、1项既有python_multipart弃用warning；单规则新增展开8项通过，覆盖403/404/422及STARTED来源快照。5项为未启用数据库验收，不能计通过。主线程最终联合 `npm.cmd --prefix hr-portal/frontend test -- src/components/performance/PerformanceProjectFlowSettings.spec.ts src/components/performance/PerformanceCalibrationConditionGroup.spec.ts src/components/performance/PerformanceScopeCount.spec.ts src/components/performance/focus-group/FocusGroupPeopleDialog.spec.ts src/components/performance/PerformanceSearchSelect.spec.ts src/components/ui/UiPageHeader.spec.ts --pool=threads --poolOptions.threads.singleThread=true --silent` → 六文件95 passed；名单真实共享壳测试仅stub ElementPlus选择控件以避jsdom递归。此前Teleport未适配的4失败已修并复验，不改业务源码规避测试。
  - 2026-11-18最终构建：`npm.cmd --prefix hr-portal/frontend run build`（包含vue-tsc --noEmit）退出0，Vite 3772模块、49.15s，仅既有VueUse PURE注释warning。指定交付文件按Windows `git -c core.whitespace=cr-at-eol diff --check`通过，保留LF/CRLF提示；共享工作区其他会话身份状态改动不计本卡交付。
  - 2026-11-18浏览器证据：5173真实Vue组件+隔离API返回，实际操作总人数→全屏八列、返回→删除组，验证146/100列及pointer/pointer/text、组外24px/4px、单组632px/无删除按钮、名单2201高于抽屉2200、页头副标题14/400/22及12px间距，已查看实际PNG：`../../ui-blueprints/PM-T003-I07-calibration-rule-counts-implemented.png`、`../../ui-blueprints/PM-T003-I07-calibration-people-implemented.png`、`../../ui-blueprints/PM-T003-I07-calibration-single-group-implemented.png`。入场动画中间帧的无效截图已用稳定帧更新；浏览器组件启动初次夹具因加载两份Vue失败，改用Vite实际同版模块后通过，未改产品代码回避。完整路由和真实API→数据库未验收，8000/8080不可用；保持任务未勾选，无迁移/生产/提交/推送。
  - 2026-11-18重复统计Bug：用户反馈PROJECT_ALL及RULE单条件持续“正在统计人员”和窗口抖动；父组件每秒clock重渲染创建同值projectPayload，抽屉深watch误按新对象触发。改监听JSON业务快照，保留真实条件变更/关闭失效/显式重试。新增同值新对象、在途响应、PROJECT_ALL/RULE及真实FlowSettings时钟回归；两既有spec最终69 passed（FlowSettings52、ConditionGroup17）。本地5173实际组件+隔离预览接口两模式各强制4次父级刷新，均只请求1次、加载提示不重现，范围块高度分别112/236px且各次一致；未改接口/权限/快照/迁移，未生产验收。
  - 2026-11-18保存展示/初始空态修复：用户授权完成REA评估项；三处初始化（initializeCalibrationNodes/defaultFor/addPhase）改零规则；保存三列改共享只读条件摘要与授权“是/否”，详情复用同一解析，不修改已存配置或权限。新增必要的PerformanceCalibrationRuleSummary.vue/performanceCalibrationRuleSummary.ts，复用Popover/SelectTag/ConditionLogicGroup；所有新增视觉参数集中tokens。原PersonSelect以姓名为value的管理员场景不适用“label===value判无效”，最终未改该组件，避免扩大影响。
  - 本轮验收：`npm --prefix hr-portal/frontend run test -- src/components/performance/PerformanceProjectFlowSettings.spec.ts src/components/performance/PerformanceProjectTimeSettings.spec.ts src/components/performance/PerformanceInfoPopover.spec.ts src/views/performance/PerformanceProjectSettingsPage.spec.ts src/components/performance/PerformanceCalibrationConditionGroup.spec.ts` → 5文件183 passed；`npm --prefix hr-portal/frontend run build` → vue-tsc/Vite退出0，仅既有VueUse PURE warning。早期默认规则旧预期、fixture缺level和组件import、测试错误读取fragment根已修正并复跑，不将失败轮计通过。
  - 本轮UI：真实5173组件+隔离API，验证420×346/320滚动区/scrollTop300、hover移入保持/离开/Esc，390px视口浮层left16/width358、表格内部滚动、无页面横向撑宽，零规则取消0写、mock PATCH一次保留六组及授权。已查看 `../../ui-blueprints/PM-T003-I07-rule-summary-hover-implemented.png`、`../../ui-blueprints/PM-T003-I07-rule-summary-mobile-implemented.png`。浏览器发现Teleport样式作用域和grid最小宽度问题后已修复并重验；完整路由/真实鉴权API→SQL/生产未验收，I07保留未勾选。无后端/迁移/生产/commit/push变更。
  - 完成定义：共享组件、API、后端校验/筛选、项目页面接入和验证全部完成后勾选。

- [ ] PM-T003-I07-F01 被评估人人员类型与入职日期筛选接入
  - Goal/Type：既有选人能力增强，前后端契约/组件/校验；用户于 2026-10-20 明确同意复用选项 API 后开始开发。
  - 前置与必读：PM-T003-I07 既有选项和条件组；Spec 002 START_HERE、基线、ADR-001、本功能 spec/ui-interaction、execution-contract、acceptance-evidence；Spec 012 UI 门禁 A01/A02/A05/N000/N00/N11。
  - 允许修改：`hr-portal/backend/app/performance/project_service.py`、`projects_router.py`、现有 `tests/test_performance_projects.py`；前端 `api/performance.ts`、`PerformanceAudienceRuleEditor.vue`、`PerformanceDateTimeField.vue`、`performanceConditionFields.ts` 与现有对应 spec、`PerformanceProjectSettingsPage.vue`；本功能交互/任务文档。
  - UI 组件与证据：单日期框直接复用 `PerformanceDateTimeField.vue`，已删除本轮新增但不再需要的 `PerformanceDateRangeField.vue`；历史双日期截图 `../../ui-blueprints/PM-T003-I07-F01-implemented-reviewee-filters.png` 仅作历史证据，当前截图为 `../../ui-blueprints/PM-T003-I07-F01-implemented-single-date-operators.png`。不新建脚本或测试文档。
  - 禁止修改：迁移/模型、权限配置、UCP/外部系统、历史快照、路由和无关设置。共享工作树：后端与前端分文件串行合并，保留其他会话变更。
  - 输入输出：既有 GET `/api/v1/performance/cycles/{cycle_id}/evaluator-options` 增加 `hire_date_range: {min: string|null, max: string|null}`，保留 `employee_types`；锁定快照优先。既有项目 POST/PATCH/GET 中 `evaluator_rules` 增加 `hire_date`；2026-10-20 最新用户修订为单值 `values: ['YYYY-MM-DD']`，操作符 `before/not_before/after/not_after` 对应早于/不早于/晚于/不晚于（<、>=、>、<=）。空日期均不匹配，非法输入 422；历史 include/exclude 双值范围仅保留后端读取兼容，不自动转换。
  - UI：沿用项目设置页和条件组结构，无需新完整蓝图；见 `ui-interaction.md` 第 10 节。复用现有日历纯日期模式，保持初始空值、按需 API、错误保留/重试、保存回填、禁用态；独立实现截图见允许新增路径。Spec 012 通用 N0001/N0002/N0004/N0005、N1102-N1106 适用，数仓专属检查不涉及。
  - API/数据库/权限/外部影响：现有 API 向后兼容扩展、既有 JSONB 持久化；无迁移、权限变化或外部副作用。
  - Given/When/Then：有多种人员类型/空日期/锁定人员快照，打开选项后去重并正确初始化日历；选择单日期及四种比较保存/回读后值不丢失，人数与启动日期匹配一致；比较日期相等时 >=/<= 命中、</> 不命中；非法日期/错误值数量/非日期字段使用日期操作符/无权访问被拒绝，旧字段回归不变。
  - 单日期修订验证（2026-10-20）：前端四个测试文件 41 passed；后端项目/周期 178 passed、1 项既有弃用警告；`npm.cmd run build`（含 vue-tsc）通过，仅既有 PURE 注释 warning。实际开发页以隔离模拟接口验证：日期输入仅 1 个，操作符准确为早于/不早于/晚于/不晚于，非法日期不能提交旧合法值，PATCH 请求为 `operator: after, values: ['2026-01-15']`；无 pageerror。截图见当前单日期证据路径。单日期修订现已按用户要求完成 Docker 构建/替换，以下旧镜像仅为前一版历史记录；最新部署证据见下一项。
  - 单日期容器部署（2026-10-20）：用户明确同意将并行 PM-T007 的0260一并迁移并替换。执行 `docker exec hr-portal-backend alembic upgrade 0260_performance_other_settings` 成功（0259→0260）；随后 Compose `build frontend backend` 与 `up -d --no-deps --force-recreate backend frontend` 均退出0。运行镜像：frontend `sha256:ad096d2c5e05b67eea3ee566a56521720f8038124f5bd8fc6b865b7b8ebe6ef6`、backend `sha256:da21b113f5e59dd3918df9094cb4bf693a66d6960cf3aadab982e1bf801cd2ad`，均 running、restart0；db/gotenberg 容器ID和启动时间未变。0260 current/head 单头，public新增表及字段存在；nginx配置通过，启动初期短暂502后最终health200且db.ok=true，evaluator-options与other-settings未认证均401。新后端容器项目/周期/其他设置回归190 passed、1 skipped、2既有弃用warning；跳过项需 `--postgres-acceptance`，未将其计为通过。类型检查通过，前端日期+其他设置聚焦26项通过。8080实际容器页面用隔离模拟API复验日期输入1个、四个比较中文选项、非法日期阻断、单日期PATCH载荷、0 pageerror；非真实鉴权数据库保存验收，不据此勾选F01。
  - 测试：现有前端字段/条件/日历/周期 spec，`npm.cmd test -- ...`、`npm.cmd run build`；后端 `pytest -q tests/test_performance_projects.py tests/test_performance_cycles.py`；浏览器核验新筛选及截图。未执行/模拟接口验证必须单列，不算真实数据库验收通过。
  - 验证与部署证据（2026-10-20）：前端筛选/日期/字段目录 14 项、周期页面 26 项通过；本地生产构建通过。Docker Compose 对 frontend/backend 构建并以 `up -d --no-deps --force-recreate frontend backend` 替换，未重建 db/gotenberg 或删除数据卷。运行前端镜像 `sha256:ab5a9c007baeaf161af63b08501dfb27b5e8d1df0c8b4c1910a785df0c51a05a`，后端 `sha256:e292ae29c499e67a3a0ee2a01d91b21bda93d9b6d68ea30a4880b3f6af7ab54e`，均 running、0 restart。新后端容器执行 `pytest -q tests/test_performance_projects.py tests/test_performance_cycles.py`：174 passed，1 项既有 python_multipart 弃用警告；`nginx -t` 通过，`http://127.0.0.1:8080/api/v1/health` 返回 200、db.ok=true，未认证 evaluator-options 返回 401。迁移 current/head 均为 `0259_performance_result_openings`，无新增迁移。重启初期短暂 502，后端启动完成后最终复查恢复正常。
  - UI 证据与验收限制：独立截图 `../../ui-blueprints/PM-T003-I07-F01-implemented-reviewee-filters.png`；替换后 8080 前端实际页面以隔离模拟 API 验证按需选项请求 1 次、日期格 42 个、无时间列、无 pageerror。真实鉴权 API→数据库保存/重开仍未验收，因此 F01 与 I07 保持 `[ ]`，容器部署成功不等同于完整业务验收；共享工作树的 PM-T007/授权配置前端壳一并构建，不据此宣称其真实授权 API/持久化已完成。
  - 完成定义：实现、边界/权限测试、构建、UI 和持久化证据齐全后再勾选；I07 其余未验收项不随子任务勾选。
  - 校准范围筛选增强（2026-10-28）：既有“按指定规则校准”范围新增部门、人员、入职日期三类条件，分别复用 `PerformanceOrganizationSelect`、`PerformancePersonSelect`、`PerformanceDateTimeField`；字段值沿用周期冻结快照，支持 `INCLUDE/EXCLUDE` 及日期 `before/not_before/after/not_after`，后端保存/回读并在校准任务范围解析时按部门、人员、入职日期求交。前端校准组件与项目设置回归 37 项通过，后端项目校准聚焦 66 项通过，前端生产构建通过；完整项目测试 256 passed、1 failed（并行工作树既有锁定快照测试在花名册契约错误处失败），未勾选 I07。


- [ ] PM-T003-I07-F05 启动后被评估人一致性（2026-11-09 用户确认）
  - Goal/Type：既有添加闭环、实际成员读源与启动锁定；不新增系统调整区块。
  - Prerequisites/reading：Spec002 基线、PM-T003 spec/ui-interaction、I07/F02/F03、执行/验收契约；Spec012 通用 UI 门禁。
  - Allowed modifications：backend/app/performance/{projects_router,project_service,calibration_service}.py、backend/tests/test_performance_projects.py；frontend/src/api/performance.ts、views/performance/{PerformanceProjectSettingsPage,ProjectManagement}.vue及既有测试、components/performance/{RevieweeAddDialog,PerformanceAudienceRuleEditor,PerformanceTextButton,PerformanceIconButton}.vue及定向测试、styles/tokens.css；本功能 spec/ui-interaction/atomic-tasks。
  - Shared files：保留原工作区修改；后端与前端按文件分工，串行整合。
  - Input/output contract：沿用 reviewees 添加与 evaluator-preview 接口；加人通过独立 employee/include OR 组更新现有条件；限定范围和周期资格仍生效。启动后预览人数/名单来自项目实际成员及冻结任务成员分类，忽略客户端模拟规则。PATCH 禁止改变 evaluator_rules/scope_rules/scope_limited/scope_employee_nos；相同原值可幂等回传。
  - Transaction：统一周期→项目→成员快照锁，锁后刷新；成员、条件、任务成员名单、校准增量、人数和审计同事务，任一步失败不留部分写入；重复加入拒绝且不改人数。不重算旧人员任务。
  - UI：原设置页所有条件修改入口禁用，保留人数/名单查看；共享禁用 token，不叠加整块透明度。沿用现有交互，无新完整蓝图。独立 PNG 目标 ../../ui-blueprints/PM-T003-I07-F05-implemented-reviewee-lock.png。
  - API/database/permission：沿用现有项目管理权限及周期快照，无迁移、无生产变更、无新增外部投递。仅报表人员不生成任务、不增加任务人数；缺项目上级拒绝。
  - Test contract：Given 已启动项目，When 前台加入合格/仅报表/越界/重复人员，Then 条件、实际成员、任务分类、校准来源与人数一致；Given 已启动/结束项目，When PATCH 范围，Then 拒绝；Given 多选部分成功，Then 刷新成功成员且只保留失败项重试。既有 backend/tests/test_performance_projects.py 与前端定向 spec、构建、真实页面、SQL回读分别记录；未运行不得称通过。
  - Acceptance：覆盖正常/拒绝/空态/历史成员/重复/并发锁/失败回滚与刷新回读，保留冻结人员关系及既有任务。
  - Non-scope：删除 UI/API/业务、成员软删除迁移、未确认已提交人员移出策略、历史批量修复、commit/push/deploy。
  - 删除预留：共用人员规则变换支持集合加减（移除须作用所有 OR 分支），不启用移除写入口；未来删除事务须撤销任务/授权并保留历史，不得只改条件。
  - Evidence（2026-11-09，本地）：后端新增定向21 passed，覆盖规则集合变换、STARTED/ARCHIVED范围锁定、启动后实际成员预览、添加成功/仅报表/越界/周期资格/重复/跨项目/缺项目上级/无权/锁后状态变化及校准多处理人增量。命令：backend/.venv/Scripts/python.exe -m pytest backend/tests/test_performance_projects.py -q --tb=short -k 'audience_adjustment or started_audience or started_preview or reviewee_add_syncs or calibration_member_increment'（路径按hr-portal解析）。后端全模块较早一次498 passed / 6 failed / 5 skipped，6项集中既有工作台/360成员夹具缺scalars，非全绿；随后扩充7个拒绝用例，仅复跑定向21项，不将较早全量计数充作最终全量。
  - Frontend evidence：主会话最终运行 npm.cmd --prefix hr-portal/frontend run test -- src/components/performance/PerformanceAudienceRuleEditor.spec.ts src/components/performance/RevieweeAddDialog.spec.ts src/views/performance/PerformanceProjectSettingsPage.spec.ts --pool=threads --poolOptions.threads.singleThread=true --silent → 3文件77 passed。npm.cmd --prefix hr-portal/frontend run build → vue-tsc + Vite exit 0，built in 52.05s，仅既有VueUse PURE注释警告。范围内git diff --check通过，仅CRLF提示。新增RevieweeAddDialog.spec.ts；前端另含最小PerformanceProjectDialog.vue限定范围锁定，其他基本信息仍可改。
  - Not-run/blockers：本地5173可访问，但8000/8080 API未运行、Docker守护进程不可用；未完成真实登录UI→API→SQL→新连接回读、并发真库/回滚、独立PNG，不能据单测宣布端到端或生产通过。本轮不创建迁移、不commit/push/deploy、不外发消息；工作区另一会话删除交付eab7c07d不计为本卡实现。后续接入删除仍须独立确认业务与验收，不改其已提交行为。
  - Definition of done：本地代码/定向测试/构建已完成；整卡保留未勾选，待真实数据库和浏览器证据齐全后由主会话验收。

- [ ] PM-T003-I07-F06 删除被评估人一致性接入（2026-11-09 用户确认）
  - Goal：沿用成员详情→更多→删除，删除后现有条件同步员工不包括、有效成员/任务/校准/人数读回一致；不新增系统调整区块。
  - Required reading：Spec002基线、PM-T003 F05及spec/ui-interaction、执行/验收契约，既有删除接口/确认弹窗及删除采集说明；Spec012通用UI门禁。
  - Allowed modifications：backend/app/performance/{projects_router,project_service,calibration_service}.py及tests/test_performance_projects.py；frontend/src/views/performance/ProjectManagement.vue/spec.ts，必要PerformanceReviewEvaluationDrawer.vue/spec.ts；本功能spec/ui-interaction/atomic-tasks。新文件/脚本/报告无；共享文件只修改本卡函数/测试，不暂存其他会话差异。
  - Frozen contract：DELETE /projects/{project_id}/members/{employee_no}、可选root_review_id、返回结构不变；沿用已实现并展示的当前项目本周期数据清除语义，保留不可变审计，不改成软删除或跨项目清除。不删除该员工评价他人的任务。
  - Transaction：周期→项目→最新成员快照锁并重读状态/权限；同事务清理当前成员和其target任务/级联授权与复议通知、对应复议及结果开通记录，维护任务成员集合、校准分配和规则来源、员工exclude条件及人数。仅报表成员删除不减少任务人数。任何失败回滚，重复请求404无重复扣减；root不匹配409；无权403；状态变化409。
  - Rule contract：exclude以AND加到所有现有OR组，值去重且保留其他字段/规则；加回员工以独立include组形成并集，后台锁定不变。保留空校准rule_sources及原规则，允许删除后重新加入。
  - UI：保留原确认与菜单；删除请求防重复，成功后清理已删除详情URL、刷新当前周期成员和概览；API失败保留详情并显示真实错误，不误报删除失败于后续导航错误，不让旧周期响应覆盖新周期。现有界面小调整无需新蓝图。
  - Test contract：项目测试覆盖多OR/部门与人员规则、仅报表/最后成员、未找到/root不匹配/权限/状态拒绝、校准来源删除重加及结果记录清理；ProjectManagement.spec.ts覆盖删除成功刷新/失败不关闭/防重与跨周期切换；相关前端定向与build分别记录。
  - Non-scope：新删除入口、软删迁移、已发布数据政策重定义、生产写入、其他授权功能、commit/push/deploy（须另行授权）。
  - Evidence（本地2026-11-09）：backend/.venv/Scripts/python.exe -m pytest backend/tests/test_performance_projects.py -q --tb=short -k 'remove_project_member or audience_adjustment or started_audience or started_preview or reviewee_add_syncs or calibration_member_increment' → 28 passed。既有删除2用例扩展为7项，覆盖任务/仅报表/最后一人/无权/状态/重复/root校验、结果记录清理与最后一人删除后校准重加。项目模块排除已知工作台夹具名 test_workbench_tasks_and_people_return_live_due_date、test_evaluation_member_list_can_return_completed_and_pending_tasks、test_member_lists_keep_supervisor_name_visibility_and_zero_360_rate 后511 passed / 5 skipped / 8 deselected；存在python_multipart弃用警告，不称全量全绿。
  - Frontend evidence：ProjectManagement.spec.ts新增4项删除状态用例通过；成员菜单/详情抽屉/项目管理页首次3文件45 passed。最终扩大到5文件得85 passed / 1 failed（总86），失败来自并行会话新加PerformanceMemberMoreMenu的hover hint popovers用例，不修改其在途功能，已通知负责会话。npm.cmd --prefix hr-portal/frontend run build → vue-tsc+Vite exit0，仅既有VueUse注释警告；本卡文件git diff --check通过。
  - Not-run/blockers：localhost:8000/docs连接失败，前轮Docker守护进程不可用；本轮无真实API→SQL→新连接回读、并发/回滚真库与浏览器PNG。单测的事务及级联断言为受控夹具，不等价真实数据库约束验收。无迁移、无外部投递、未commit/push/deploy。
  - 提交前复验：后端上述增删定向28 passed；前端ProjectManagement.spec.ts、PerformanceMemberMoreMenu.spec.ts、PerformanceReviewEvaluationDrawer.spec.ts共3文件46 passed，菜单hover修正已由并行会话完成，本卡不纳入该菜单改动。用户另行授权在main提交并推送本卡，不含部署。
  - Historical calibration-time fix（本次用户现场2026-11-09确认）：当项目 `flow_settings.node_times[node_id]` 为历史节点级时间且缺少 `phase_times` 时，新增校准人员回退读取同一冻结校准节点 `config.time.phase_times[phase_id]`；项目显式存在 `phase_times` 时不回退覆盖，空值/错键仍明确拒绝。阶段已截止不阻止添加，新增任务保留历史 `available_at/due_at`，由既有任务状态展示为 `overdue`；不放开校准逾期提交权限，不执行生产JSONB回填。
  - Historical-time evidence：新增校准时间回退、项目覆盖优先、显式空/错键拒绝及已截止任务窗口用例，与添加回归合计18 passed；代码构建/真实生产API SQL回读尚未在本轮执行。
  - Definition of done：本地实现/定向回归/构建完成，整卡保持未勾选；待真实API/SQL/浏览器验收完成后独立验收。

- [ ] PM-T003-I07-F07 人员选择统一展示display_name（2026-11-09 用户确认）
  - Goal：被评估人条件及共享人员选择器展示display_name，工号仅用于身份值与搜索，不用Token掩盖数据标签问题。
  - Required reading：Spec002基线、本功能spec/ui-interaction、F05、Spec012 UI门禁及现有PersonSelect/SearchSelect契约。
  - Allowed modifications：backend/app/performance/project_service.py、既有项目测试；frontend/components/performance/PerformancePersonSelect.vue、PerformanceSearchSelect.vue及既有PerformanceSearchSelect.spec.ts、PerformanceProjectDialog.vue、PerformanceReview360FeedbackPanel.vue；PerformanceProjectSettingsPage.vue/spec.ts；本功能既有文档。保护其他并行修改，不新增脚本/报告。
  - Contract：evaluator-options保持value=工号、label=display_name；共享人员控件优先显示显式display_name，兼容剥除精确匹配value的旧括号工号后缀，保留选项副标签和工号搜索；已选人员在搜索结果替换/清空后仍保留本实例已解析姓名，不做跨周期全局缓存。无可信姓名时展示信息不可用提示，不虚构姓名或显示裸工号。
  - UI：现有信息架构和Token不变；已保存人员条件（含启动后禁用态）加载周期快照姓名以回显，不改变规则值，不自动选值；空白新建条件继续按需加载。
  - Acceptance/tests：已有姓名只显示姓名、旧标签兼容、工号搜索/提交不变、远程候选变更后已选标签保留、禁用及保存重开、接口失败不丢规则；SearchSelect/PersonSelect及项目页/弹窗回归、后端选项契约与前端build分别记录。
  - Non-scope：人员身份/权限/历史快照变更、全系统其他业务重构、生产回填、commit/push/deploy。
  - Evidence（2026-11-09本地）：共享SearchSelect/PersonSelect、AudienceRuleEditor、RevieweeAddDialog、ProjectSettingsPage、ProjectFlowSettings、HRBP、IdentitySwitch、MultiExecutor、CalibrationConditionGroup及人员组相关11文件169 passed。包含真实条件编辑器STARTED只读姓名回显、旧姓名（工号）兼容、工号搜索/提交、重复姓名不同value、候选替换后保留姓名及历史管理员姓名回显。后端evaluator_options与历史校准时间/添加回归20 passed，1项python_multipart弃用警告。npm.cmd --prefix hr-portal/frontend run build → vue-tsc+Vite exit0，仅既有VueUse PURE注释警告。
  - 校准选人回归修复（2026-11-18，本轮用户授权）：允许补改 `PerformanceCalibrationRuleDrawer.vue` 的校准人 `open-options` 转发，项目设置页预加载判断覆盖全部校准阶段/规则的 `subject_groups`、`scope_groups` 非空员工条件；复用 `loadEvaluatorOptions` 和周期快照接口，不修改后端/API/权限/历史数据，不新增组件或脚本。既有 `PerformanceProjectSettingsPage.spec.ts` 新增4项完整页面组件回归：首次打开调用人员API并选择姓名/复用缓存、失败重开重试并保留描述、后续阶段及条件组的校准人/范围保存重开姓名回显、全程不自动PATCH。修复前4项均因接口0调用失败，修复后4项通过；`npm.cmd test -- src/views/performance/PerformanceProjectSettingsPage.spec.ts src/components/performance/PerformanceCalibrationConditionGroup.spec.ts src/components/performance/PerformanceProjectFlowSettings.spec.ts src/components/performance/PerformanceSearchSelect.spec.ts` → 4文件124 passed。`npm.cmd run build` → vue-tsc及Vite生产构建通过（3769模块，Vite 41.67s），仅既有VueUse PURE注释警告；`git -c core.whitespace=cr-at-eol diff --check` 本次5文件通过。UI结构/Token不变，已读Spec012 UI门禁且无新增禁止项；不以组件模拟API当作真实鉴权或生产验收。
  - Not-run/Definition of done：尚未完成真实登录API/数据库/浏览器PNG验收，整卡保持未勾选；无生产写入/迁移，未commit/push/deploy。

- [ ] PM-T003-I07-F03 被评估人人数统计与人员预览
  - Goal/Type：在项目信息被评估人区域展示真实总人数、任务人数、仅报表离职人数及每组人数，并复用去催办人员弹层查看明细；既有 UI/API/快照增强。
  - Prerequisites/reading：PM-T003-I07/F01/F02、Spec002 基线、本功能交互、execution-contract/migration-coordination/acceptance-evidence；Spec012 A01/A02/A05/N0001/N0002/N0004/N0005/N1101-N1106。
  - Allowed modifications：绩效 employee_roster_contract、models/snapshot_service/cycle_service/cycles_router/project_service/projects_router；新迁移0277；现有 performance API、AudienceRuleEditor、ReminderPanel/TaskTable/SelectionActionBar、ProjectMemberListPanel、PerformanceProjectSettingsPage及对应测试；本功能文档。共享文件串行合并并保留并行强制分布和六字段筛选改动。
  - Frozen contract：周期快照为唯一人员源；POST `/cycles/{cycle_id}/evaluator-preview` 返回 matched/task/report/report_only/group_counts；POST `/cycles/{cycle_id}/evaluator-preview/people` 支持 matched|task|report_only、group_index、keyword、分页。已占用人员排除；无权403，非法规则422。`standard_position` 独立进入周期/项目快照，历史空值不回填实时花名册。
  - UI：顶部总人数普通文本；说明仅N/M数字可点击；范围组左侧编号、右侧“同时满足以下条件：N”且仅数字链接。预览移除内容区重复标题/说明，TaskHeader标题右侧显示14/400/22、#646A73单行统计描述。224px搜索框、筛选后公共PerformanceExportButton；preview无选择列和催办动作。CSV导出当前搜索的全部分页与当前可见列，BOM/转义/防公式注入，重复点击保护，失败不下载部分文件。新增允许PerformanceExportButton.vue及spec、TaskHeader/TaskOverlay可选description契约；无API/迁移变化。独立 PNG 计划 `../../ui-blueprints/PM-T003-I07-F03-implemented-evaluator-preview.png`。
  - Business boundary：N人生成任务并纳入报表；M名离职人员不生成任务，仅进入成员快照和报表。项目 evaluated_count、校准和节点任务只统计/生成 N 人；同周期唯一性覆盖 N+M。
  - Tests：`tests/test_performance_snapshot_service.py`、`tests/test_performance_projects.py`；AudienceRuleEditor/ReminderPanel/ProjectSettings focused Vitest；vue-tsc、前端 build、alembic heads、迁移真实升降级和浏览器截图分别记录。
  - Evidence（2026-10-28，本地）：本任务精确后端4/4通过；绩效快照+项目完整回归300通过、5个显式跳过、1个既有python_multipart弃用警告；本轮前端公共导出/预览弹层/项目页/项目管理4文件37/37通过；公共按钮测试覆盖UTF-8 BOM、CSV引号换行、公式注入、文件名、重复点击和失败不下载；预览测试覆盖101人跨页、搜索条件、当前可见列及第二页失败。`npm run build`的vue-tsc+Vite生产构建通过，仅既有VueUse PURE注释提示；迁移链单头0278，顺序为0276→本任务0277→并行0278；`git diff --check`无错误。实际Chromium可访问Vite及登录页，但本地 `/api/v1/auth/login` 返回500，业务页面、真实下载与独立PNG验收被后端环境阻断，未冒充通过。
  - Not-run/blockers：未执行真实数据库 migration upgrade/downgrade；未取得实际浏览器登录态截图/独立PNG；未做真实 API→SQL→GET 回读；未部署、commit或push。因此任务保持 `[ ]`。
  - Non-scope：不展示虚线上级；不复用催办任务API/action；不修改权限角色、UCP、外部系统或生产数据。
  - Definition of done：实现、迁移真实升降级、权限/快照/唯一性/API回读、浏览器PNG、构建及回归证据齐全后才勾选。

- [ ] PM-T003-I02-F01 周期评估设置接入已启用绩效模板并持久化周期关联
  - 范围：周期新建/编辑页真实读取绩效模板，过滤为 `active`，两行展示名称和说明，并通过周期 API 的 `template_id` 保存和回填。
  - 代码交付物：周期模板选择器、周期 DTO/服务/模型字段、迁移和测试。
  - 不修改范围：不实现模板内容编辑、项目任务生成或周期启动快照改写。
  - UI 要求：复用 `PerformanceSelectShell`，弹层支持上下定位、滚动和错误/空态；关联 Spec 012 N0001/N0002/N0004/N0005、N1102-N1104。
  - 验收：UI 选择 -> POST/PATCH `template_id` -> 数据库 -> GET 编辑回填；服务端拒绝不存在、非绩效类型或非 active 模板。
  - 证据：迁移 0256 在本地 PostgreSQL 升级/回滚/升级通过；周期前端测试 25 项通过。后端周期测试 26/27 通过（另 1 项受并行花名册契约变更阻断）；生产构建受并行组织筛选组件类型错误阻断；真实 API 创建/编辑回填及浏览器截图尚未验收，保持待完成。

## 逾期任务提交机会：2026-10-20 最新要求“本周期立即生效”

- [ ] PM-T003-I08 周期逾期配置持久化与即时提交策略
  - 输入：全局第三项开启且第一项开启，周期 `overdue_submission_enabled=true`、`overdue_submission_scope=EVALUATION` 默认；PATCH 仅两个字段。全局第一项关闭时不允许逾期补交，全局第三项关闭时周期规则不覆盖全局默认。权限 `performance.cycles.manage`；403 无权、422 非法枚举/布尔、404 无周期；已启动项目仍可修改并在下一次任务提交读取最新值。
  - 范围：models.PerformanceCycle、cycles_router.CyclePayload/CyclePatch/CycleSummary、cycle_service.create_cycle/update_cycle/serialize、迁移0263、实际任务提交策略及相关后端测试；禁止改0260-0262旧迁移、历史提交或任务快照。一次仅由本任务修改迁移链；部署由其他会话在READY后负责。
  - Given 已有旧周期、已启动项目与逾期未提交任务；When 切换评估型/全部或重新开启并 POST 提交；Then 命中范围拒绝逾期、未命中保留单次补交、GET 回显且无历史改写；并验证权限、非法值、审计、迁移升降级和并发修改。pytest 周期/项目/其他设置，alembic heads 和隔离数据库验证。
  - 当前：代码和迁移未验收，待补全提交策略与测试，不得勾选。

- [ ] PM-T003-I09 周期设置菜单与弹窗复用接入
  - 输入：`ui-interaction.md` 第11节及 `D:\乐逗\Desktop\逾期任务提交机会设置.txt`；适用 Spec012 N0001/N0002/N0004/N0005、N1101-N1106 通用项，不修改数仓领域任务。已有页面小范围增补无需新页面完整蓝图。
  - 范围：OtherSettings.vue/OtherSettingsOverdueCard.vue、CycleManagement.vue、PerformanceCycleSettingsMenu.vue、PerformanceCycleOverdueSubmissionDialog.vue、api/performance.ts及对应 spec；共享文件仅局部串行编辑并保护别的会话改动。不新增全局主题或路由，不改360°/通知设置。
  - Given 勾选全局第三项；When 进入周期设置、勾选/取消/切换单选、取消/确定、失败重试；Then 灰区仅勾选时显示，提交仅两个字段，已启动项目立即生效，刷新/重开回显，权限不足无入口，空态/失败不伪造保存。前端组件/页面 Vitest、npm run build、实际浏览器截图与窄屏走查。
  - 当前：待组件测试、构建、截图及后端联调，不得勾选；独立 PNG 待生成 `../../ui-blueprints/PM-T003-I09-implemented-cycle-overdue-dialog.png`。

- [ ] PM-T003-I12 项目校准节点绩效结果强制/建议分布配置
  - Goal：在具体校准节点完成节点级统一分布规则配置、保存回读和未完成范围模式的启动门禁。
  - Type：既有功能增强，前端业务组合组件、项目 JSONB 合同、服务校验与测试。
  - Prerequisites：现有项目流程设置、校准阶段、项目 PATCH/GET 与启动接口；用户于 2026-10-28 确认入口、节点统一规则、范围模式草稿和启动拒绝。
  - Required reading：Spec002 START_HERE/基线、PM-T003 spec/ui-interaction、execution-contract/task-card-template/acceptance-evidence；Spec012 UI 通用守则。
  - Allowed modifications：项目 `performance.ts`、`PerformanceProjectFlowSettings`、`performanceProjectCalibration`、`PerformanceProjectSettingsPage`；绩效分布规则新组件及现有 spec；后端 `project_service.py`、`projects_router.py`、`test_performance_projects.py`；本功能交互与任务文件。
  - Allowed new files：`PerformanceDistributionRuleDrawer.vue/.spec.ts`、`PerformanceDistributionRuleRow.vue`；独立 UI PNG 路径 `../../ui-blueprints/PM-T003-I12-implemented-distribution-rules.png`。
  - Forbidden modifications：迁移、周期快照、权限点、运行时分布计算、按校准范围下一步、生产部署、021/数仓/UCP 和其他共享工作区差异。
  - Shared files：`performance.ts`、项目页面、项目服务与测试已有并行改动，只做分布规则相关局部修改，不覆盖其他差异。
  - Input contract：`calibration.force_distribution_enabled`；可选 `distribution={mode,rules,scope_configured}`；规则包含评级评估项、人数下限、条件和取整方式。同节点评估项唯一。
  - Output contract：项目 PATCH/GET 原样回读；关闭开关保留规则；范围模式未完成可保存草稿；启动返回 422 中文业务提示；模板流程接口返回真实评级评估项和等级候选。
  - UI：现有项目流程页局部增强，不新增页面；680px 抽屉及已确认状态见 `ui-interaction.md` PM-T003-I12。独立实际 PNG 尚待浏览器生成。
  - API/database/permission/external-system impact：扩展既有模板流程 GET 响应和项目 JSONB；无迁移、权限变化、外部副作用。项目保存与审计同事务，启动失败不写快照或任务。
  - Test contract：Given 模板含评级项、已保存规则或范围占位；When 添加编辑删除、关闭重开、PATCH/GET、启动；Then 候选真实、规则回显、重复/非法值拒绝、关闭不丢规则、范围未完成与统一空规则均阻止启动。测试文件为新组件 spec、现有流程/页面 spec 和 `backend/tests/test_performance_projects.py`；执行定向 Vitest、后端项目全文件与 `npm run build`。
  - Acceptance：成功/校验失败/旧数据兼容/启动状态边界/模板候选/保存回读/关闭恢复/构建与回归分别记录。无新 migration，回滚为停止未发布代码。
  - Evidence（2026-10-28，本地）：首次实现后端分布/接口定向5/5通过、完整 `test_performance_projects.py` 263 passed/4个既有opt-in skipped；前端2文件23/23通过。用户修订布局与筛选口径后，前端分布抽屉/流程设置2文件25/25通过，后端分布规则7/7通过，`npm run build` 的vue-tsc与Vite生产构建通过（3407 modules transformed，仅既有VueUse PURE注释提示），目标文件 `git diff --check` 无错误。实际 UI PNG、真实鉴权 PATCH/GET/启动 API 与数据库回读尚未执行，因此任务保持 `[ ]`。
  - Blockers：运行时分布计算和按校准范围下一步是后续独立任务，不阻塞本卡配置与门禁；实际 UI PNG 和真实 API/SQL 证据尚未生成；正式整体类型构建等待并行测试语法错误解除后复跑。
  - Non-scope：分布执行、自动调整、软控制提示、强制豁免、范围配置下一步、历史重建、部署和提交推送。
  - 2026-11-18 组件校准证据：用户要求重新REA采集六类选择框并优化，参数与边界见ui-interaction同节。修改共享SelectShell/SearchSelect/AssessmentSelect及绩效Element适配、数字suffix插槽、单选附属图标布局，以及分布抽屉/Editor/Row；后端/API/迁移/权限未由本轮修改。菜单普通行30px、步距32px、五项120×166px实测吻合；选中蓝字/对勾与活动灰底分离，保留远程搜索、组织树、标签保序与resize不重排。人数146=90+56，规则数值单位117=61+56，业务增减器隐藏；单行无删除、0正常回显。
  - 本轮测试：八文件联合112 passed（SearchSelect15、DistributionRuleDrawer8、NumberInput3、TodoNotification13、AudienceRuleEditor32、HrbpPermission7、ComparisonRuleDrawer11、NotificationSettings23）；最后键盘事件目标保护修改后，两文件SearchSelect/DistributionRuleDrawer再验23 passed。AssessmentContentLayers选择器相关筛选7 passed/56 skipped，不将跳过计通过；早期完整138项中137 passed/1 failed，失败为未修改的PerformancePromptDisplay背景色硬编码旧断言（期望rgb，实际CSS变量），未改其业务代码或断言。
  - 本轮浏览器：真实本地Vite挂载实际组件+合成选项，桌面1440×900、窄屏390×844。窄屏panel x=0、width=380（全局预留10px滚动条），正文clientWidth=scrollWidth=380，四个取整选项完整、比较符120px不截字、按钮可见；桌面菜单120×166。消除自定义及原生placeholder重叠；稳定组件截图见../../ui-blueprints/PM-T003-I12-select-alignment-{desktop,mobile}-20261118.png。登录页背景为受控组件验收，不冒充鉴权项目/API/DB证据；过渡帧无效截图不作证据。
  - 本轮构建：最终 `npm --prefix hr-portal/frontend run build` → vue-tsc+Vite退出0，3769 modules、40.78s，仅既有VueUse PURE注释警告；本轮代码与文档指定文件git diff --check通过。中途并行UiTable插槽key及ProjectFlowSettings.spec.ts空值类型错误已在最终工作区解除，未由本轮覆盖其文件。保持整卡未勾选，真实保存→SQL→GET及生产验收未执行；未部署/提交/推送。
  - Definition of done：配置、合同、启动拒绝、前后端测试、构建、实际 UI PNG 与保存/重开证据完成后，主代理才可勾选。

## 任务依赖图
```text
PM-T003-I01 -> PM-T003-I02 -> PM-T003-I03 -> PM-T003-I04
PM-T003-I01 + PM-T003-I03 -> PM-T003-I05
```

## 未完成项与风险

| 任务 | 未完成内容 | 风险 | 下一步 |
|---|---|---|---|
| I01-I05 | 周期人员维护本期仅限周期管理员；项目管理员仅可查看授权项目范围内的周期详情和项目壳 | 当前无项目成员归属模型，不能安全限制全局周期快照 | 项目成员范围模型落地后建立独立需求 |
| 项目配置 | 不属于本规格 | 过早实现会混入项目权限和评价规则 | 建立下一项独立需求 |
## 项目校准阶段联动修复：2026-10-27

- [ ] PM-T003-I10 校准阶段与起止时间一致
  - Goal/confirmation: 用户先要求只读定位，随后明确“完成调整修复”；按本功能 ui-interaction.md 的 PM-T003-I10 修复现有项目设置页。
  - Type/prerequisites: 既有 UI/DTO/service Bug 修复，已有项目流程设置和项目 PATCH/GET；不以本卡宣称 PM-T003 所有项目能力完成。
  - Required reading: Spec 002 START_HERE/基线、PM-T003 和 PM-T004 规格/任务/交互、CR-004、CR-005 角色边界、performance-spec-development 的 execution-contract/task-card-template/acceptance-evidence；Spec 012 UI 通用 N000/N00/N11。
  - Allowed modifications: frontend/src/api/performance.ts 的项目配置类型；PerformanceProjectFlowSettings.vue、PerformanceProjectTimeSettings.vue、PerformanceProjectSettingsPage.vue；backend/app/performance/project_service.py、backend/tests/test_performance_projects.py；本功能 atomic-tasks.md/ui-interaction.md。
  - Allowed new files: frontend/src/components/performance/performanceProjectCalibration.ts、PerformanceProjectTimeSettings.spec.ts；ui-blueprints/PM-T003-I10-implemented-calibration-phase-times*.png。
  - Forbidden modifications: 既有迁移、模板业务代码、角色授权、历史周期/项目快照、其他未提交改动；不 commit/push/部署。
  - Shared files: performance.ts 已存在其他任务改动，仅串行修改项目阶段/时间类型，不覆盖其他差异。
  - Contract: phases 可选 phase_id；node_times[node_id].phase_times 按稳定 ID 保存日期；节点窗口由完整阶段范围派生；保留旧节点级日期读取，旧省略字段保护和草稿允许空日期；沿用 PATCH/GET URL、权限、422 和审计事务，无新外部副作用。
  - UI: 用户 SnapSpec 为局部视觉依据，原信息架构不变，无需新完整蓝图；复用日期时间控件；阶段增删、时间校验、保存/重开和移动端显示需覆盖。独立 PNG 计划路径 ../../ui-blueprints/PM-T003-I10-implemented-calibration-phase-times.png。
  - Test contract: Given 两个校准阶段；When 填写、增删、完成并重开；Then 两组日期与阶段稳定对应，删除第一阶段不串值，新阶段空值，反向日期拒绝，无权 403；旧时间仅带入第一阶段。测试文件为现有 backend/tests/test_performance_projects.py 和 frontend/src/components/performance/PerformanceProjectTimeSettings.spec.ts、PerformanceProjectFlowSettings.spec.ts；定向 Vitest/pytest、生产构建、真实 API/SQL 回读与实际 UI 截图分别记录，未执行不得标通过。
  - Migration/permission/external impact: 仅既有项目 JSONB，新增迁移不适用；不改权限，补原接口 allow/deny；无 UCP 或外部系统。
  - Non-scope/stop: 不实现校准阶段人员作用域物化、运行时阶段任务、历史重建、生产变更；停止本轮修改即可停用未发布代码，不回滚数据库或覆盖其他任务。
  - Evidence（2026-10-27，本地）:
    - 前端 `npm --prefix hr-portal/frontend run test -- src/components/performance/PerformanceProjectTimeSettings.spec.ts src/components/performance/PerformanceProjectFlowSettings.spec.ts src/components/performance/PerformanceDateTimeField.spec.ts src/views/performance/CycleManagement.spec.ts src/views/performance/ProjectManagement.spec.ts` 最终 72/72 通过（新增联动 12 项）。曾因默认状态首次 emit 改变取消/失败语义导致 2 项失败，已改为父页面初始化校准阶段，原回归恢复通过。
    - 后端在 backend 目录执行 `RUN_PERFORMANCE_DB_TEST=1 python -m pytest tests/test_performance_projects.py -q --tb=short` 最新 238/238 通过（包含同期其他任务新增测试）；本卡 `-k 'calibration_phase_times or project_calibration or project_flow_settings'` 定向 54/54 通过。只有既有 python_multipart 弃用警告。同期其他会话修改 task_kind 期间曾有 18 项失败，待其补兼容 guard 后复跑已通过。
    - opt-in `test_calibration_phase_times_real_database_api_round_trip` 在本机 PostgreSQL 的外层回滚事务中执行真实项目 PATCH→SQL JSONB→GET 重开，验证稳定 ID、删除首阶段、聚合窗口、审计 after_state、非法时间 422、无权 GET/PATCH 403，以及拒绝后数据不变。最终 rollback，并查询证明临时周期/项目均未保留。不改生产数据或历史快照。
    - Chrome 实际项目页面使用隔离 API 夹具测试默认单阶段、添加到三阶段、删除首阶段、两组日期、反向日期阻止 PATCH、保存 payload 和 reload 重开；5 次夹具 PATCH，0 个 pageerror。浏览器网络夹具不冒充真实后端验证；真实 API/SQL 为上一项独立验收。
    - 已查看实际截图 `../../ui-blueprints/PM-T003-I10-implemented-calibration-phase-times.png`；另有 `../../ui-blueprints/PM-T003-I10-implemented-calibration-phase-times-mobile.png`（真实日期组件 390px 宽夹具，单列且无横向溢出；不是整个桌面项目设置页的移动端适配声明）。临时 Vite 验收进程已停止。
    - `npm --prefix hr-portal/frontend run build` 曾通过 vue-tsc + Vite（既有 VueUse PURE 注释警告）；最新整体构建因同期模板流程页新增 executor_role_code 而 WorkflowNode 类型尚未补齐失败，已联系对应会话，不覆盖其修改；整体构建阻塞解除后须再次回填。`git diff --check` 本卡文件通过，仅 LF/CRLF 提示。
  - Current status: 本卡联动实现、定向/全文件后端与前端回归、真实 API/SQL、UI 截图已验证；最新整体构建暂被并行模板类型修改阻塞，因此暂不勾选。无本卡 migration、commit、push、容器替换或生产部署。
  - Evidence（2026-11-06，开始禁用/截止标识局部补充）：用户明确仅改前端。修改 PerformanceProjectTimeSettings.vue、既有同名 spec、本功能交互/任务记录；不改后端/API/数据库/权限/共享日期组件/其他未提交文件。无新脚本、测试文档或完整蓝图。开始时间按北京时间且 <= 当前时刻禁用，校准阶段独立判断；截止标识置节点标题右上，普通/复议按 end_at、结果查看按 appeal_deadline、校准按既有聚合最晚截止；结束框可编辑，延期移除标识，每秒刷新并卸载清理。
    - `npm --prefix hr-portal/frontend run test -- src/components/performance/PerformanceProjectTimeSettings.spec.ts src/components/performance/PerformanceDateTimeField.spec.ts src/views/performance/PerformanceProjectSettingsPage.spec.ts`：3 文件 51/51 通过，含新增4项状态用例。覆盖过去/未来/空值/无效值、到点刷新、真实输入 disabled、禁用日历、截止延期草稿回写、结果查看/复议、时区及校准阶段独立禁用/节点聚合截止。初次阶段用例推进30小时逐秒计时触发测试超时，改为跳转测试时钟后推进一秒，复验全部通过。
    - `npm --prefix hr-portal/frontend run test -- src/components/performance/PerformanceProjectFlowSettings.spec.ts src/utils/datetime.spec.ts`：2 文件 34/34 通过。完整 `npm --prefix hr-portal/frontend run build`（vue-tsc + Vite）通过，既有 VueUse PURE 注释警告；`git -c core.whitespace=cr-at-eol diff --check` 通过。
    - UI 合规：已读 Spec012 交互/守则及通用 N000/N00/N11，复用 PerformanceDateTimeField、shanghaiLocalToUtcIso 和全局颜色/字号 token，局部禁用灰底/文字/图标与用户 SnapSpec 对齐；无新菜单、权限或禁止项，数仓/UCP专属项不涉及。本轮浏览器视觉/独立PNG与生产验收未执行，不以组件测试代替；父任务仍保留 `[ ]`，未 commit/push/部署。
  - Evidence（2026-11-09，本轮两个生产问题修复，用户明确授权“完成上述两个问题的全部修复”）：
    - 生产只读证据：项目 24、周期 12，项目状态 DRAFT，settings.configuration_completed=true；周期快照 LOCKED，619 人、项目评估人数 410。用户返回的生产容器 list_summaries 源码未输出 configuration_completed，造成列表误显示待完成配置并禁用启动；不需要修复 SQL。
    - 后端修改范围：cycle_service.py、现有 test_performance_cycles.py。抽出 _serialize_project，周期列表与详情统一完成标记、flow_settings/node_meta 和配置未完成/过期截止阻断提示；跨周期批量查询工作流，有模板时共 3 次查询，保留项目权限过滤，无 N+1。13 个新增回归覆盖 true/false/缺失/空 settings、普通/结果查看/校准截止、非 DRAFT、不完整项目阻断、列表详情一致及权限/查询数。
    - 前端修改范围：PerformanceProjectTimeSettings.vue、PerformanceProjectSettingsPage.vue 及既有同名 spec，另补 CycleManagement.spec.ts。父页面传入真实 projectStatus，独立 isStartLocked 仅在 STARTED 且开始时间 <= 当前时刻时禁用输入和日历；DRAFT、ARCHIVED 及未传状态不因此锁定。保留独立 hasPassed 的截止标识、截止延期、时区、阶段聚合及每秒刷新逻辑；不修改共享日期控件、后端编辑/启动规则、权限、迁移或历史数据。
    - 后端：在 backend 执行 `.venv/Scripts/python.exe -m pytest tests/test_performance_cycles.py`，73 passed、1 skipped、1 warning；跳过项为需显式 --postgres-acceptance 的既有 PostgreSQL 验收，warning 为既有 python_multipart 弃用提示。另执行 `.venv/Scripts/python.exe -m pytest tests/test_performance_projects.py -q --tb=short -k 'project_time_rejects_invalid_live_schedule or project_distribution_incomplete_configuration_blocks_start or project_distribution_disabled_keeps_configuration_without_blocking_start or calibration_empty_default_is_unassigned_and_cannot_start'`，6 passed、473 deselected、1 warning。
    - 前端：`npm --prefix hr-portal/frontend run test -- src/components/performance/PerformanceProjectTimeSettings.spec.ts src/components/performance/PerformanceDateTimeField.spec.ts src/views/performance/PerformanceProjectSettingsPage.spec.ts src/views/performance/CycleManagement.spec.ts src/components/performance/PerformanceProjectFlowSettings.spec.ts src/utils/datetime.spec.ts`，6 文件 149/149 通过；覆盖列表首次加载无需详情请求即展示待启动/未完成/截止阻断，普通/结果查看/校准的非 STARTED 时间可编辑、日历可打开、草稿回写和状态切换，以及既有已启动锁定/延期/校准联动。初次新增日历断言因 Teleport 在 body 而失败，改为检查 body 中真实弹层并复跑通过。
    - `npm --prefix hr-portal/frontend run build`（vue-tsc + Vite）通过，仅既有 VueUse PURE 注释警告；最新测试修改后另跑 `npm --prefix hr-portal/frontend exec -- vue-tsc --noEmit -p hr-portal/frontend/tsconfig.json` 通过。git diff --check 通过。
    - UI 合规：沿用本页面 PM-T003-I10 既有结构及局部交互，不新建页面/蓝图；已读 Spec012 START_HERE、相关 spec、交互/守则、A05 与 N000/N00/N11，未引入禁止项，无 UCP/数仓专属变更。本轮真实浏览器视觉/独立 PNG、真实 API/数据库回读及部署后生产验收未执行，组件测试不冒充这些证据；本父卡保留 [ ]。代码修复和本地自动化验证完成，无新脚本/测试文档、无 commit/push/部署、未操作生产；上线需正常发布前后端，再核验项目 24 显示与实际启动校验，不绕过截止时间门禁。
  - Evidence（2026-11-09，截止时间字段校验）：用户授权继续完成截止不得早于当前时间/开始时间及全局错误 token 提醒。修改 PerformanceProjectTimeSettings.vue、performanceProjectCalibration.ts、PerformanceProjectSettingsPage.vue 及既有前两者对应组件/页面 spec、本功能任务与交互；不新增文件、不改后端/迁移/权限/共享控件/生产。共用 projectDeadlineError，按北京时间/显式时区真实时间戳判断；保留既有结束必须严格晚于开始；覆盖普通/结果查看/复议处理/每个校准阶段，错误显示在对应结束字段正下方，复用 PerformanceFormItem 全局 token 和日期框 invalid/describedBy；开始锁定及已截止标识不变。完成点击实时重新计算，不受 computed 缓存时刻影响。
    - 定向 `npm --prefix hr-portal/frontend run test -- src/components/performance/PerformanceProjectTimeSettings.spec.ts src/views/performance/PerformanceProjectSettingsPage.spec.ts src/components/performance/PerformanceDateTimeField.spec.ts src/components/performance/PerformanceProjectFlowSettings.spec.ts src/views/performance/CycleManagement.spec.ts src/utils/datetime.spec.ts`：6 文件 156 passed。新增6个组件/工具用例及1个页面阻断→纠正→PATCH用例；覆盖字段级错误、修正清除、开始变更、到点刷新、当前时间相等、显式时区。初跑新断言错取共享表单 DOM 父层，修正 closest 后复跑全部通过；首次构建暴露测试夹具联合类型推断，显式使用现有 DTO 类型修复后 vue-tsc+Vite 构建通过，仅既有 VueUse PURE 注释警告。
    - UI 合规沿用 N000/N00/N11 和现有局部交互，无新蓝图必要；本轮未执行实际浏览器/独立PNG、真实API/SQL及生产验收，不以组件测试冒充；父卡仍 [ ]。未 commit/push/deploy。
  - Evidence（2026-11-09，提示统一收敛）：删除 PerformanceProjectSettingsPage 起止时间卡片底部 `nodeTimeError` 汇总提示，不再把字段级截止错误复写到页面底部；时间校验仍由 `projectNodeTimeError` 在“完成”点击时执行并阻止 PATCH，组件通过 `showValidation` 将空值/格式错误同样渲染到对应字段下。补页面回归断言：过期/缺失字段仅有字段下 alert，无 `.time-card > .error`，修正后全部清除并成功 PATCH。
    - 定向前端回归最终 6 文件 157 passed；生产构建 `vue-tsc + Vite` 通过，仅既有 VueUse PURE 注释警告；git diff --check 通过。未执行生产验收、未 commit/push/deploy。
  - Evidence（2026-11-09，截止提醒状态边界优化）：用户确认并授权：DRAFT 截止不得早于当前时间；STARTED/ARCHIVED 既有节点历史截止不因此红框或阻断；STARTED 新增校准阶段仍独立校验未来截止。共用 requiresFutureDeadline，字段提醒、完成校验及新增阶段保存检查均传入项目状态/保存前基线；以 node_id + 稳定 phase_id 识别新增阶段，保存回读更新基线后不再视为新增。保留必填/格式/严格起止顺序、开始锁定、中性已截止标识、全局错误 token；后端启动门禁、数据库、权限、历史数据未修改。
    - 定向 `npm --prefix hr-portal/frontend run test -- src/components/performance/PerformanceProjectTimeSettings.spec.ts src/views/performance/PerformanceProjectSettingsPage.spec.ts src/components/performance/PerformanceDateTimeField.spec.ts src/components/performance/PerformanceProjectFlowSettings.spec.ts src/views/performance/CycleManagement.spec.ts src/utils/datetime.spec.ts`：最终 6 文件 168 passed。覆盖历史节点四类型、STARTED/ARCHIVED 无改完成及改为另一历史合法时间保存、DRAFT 过期阻断、已过期旧校准阶段与新增阶段混合（新阶段非法阻断/修正后 PATCH）、基线更新及跨时刷新、所有状态保留顺序校验。包含工作区并行新增的既有回归，不将其计作本卡新增。
    - 首次构建新增夹具有 TS 错误且并行 UiTable 暂有类型缺口；本卡夹具修正后最终 `npm --prefix hr-portal/frontend run build`（vue-tsc + Vite）通过，仅既有 VueUse PURE 注释警告。本卡代码文件 diff --check 通过；全工作区另有并行文件尾空格，不改动。本轮真实浏览器视觉/PNG、真实 API/SQL、生产验收未运行，父卡仍 [ ]；无新文件、无 commit/push/deploy，其他并行差异保留。
  - Definition of done: 代码、联动/拒绝/旧数据测试、真实保存回读、UI 截图及构建均验证后才勾选；缺证据保持未完成并注明原因。

## PM-T003-I11 周期多模板与项目模板选择

- [ ] PM-T003-I11：用户已确认上述采集交互并授权实施；前置为现有周期/项目配置与全局组件。
  - Required reading：本功能spec/ui-interaction、Spec002基线、Spec012通用UI守则、execution-contract/migration-coordination/acceptance-evidence/task-card-template。
  - Allowed files：绩效cycles_router/cycle_service/projects_router/project_service/models；新迁移0275_performance_cycle_templates；performance.ts及JS镜像；CycleManagement、PerformanceProjectSettingsPage、PerformanceRadioGroup；绩效模板选择相关新组件、tokens.css；对应现有测试及必要组件测试；本功能规格/任务/交互和独立UI截图。串行修改共享文件。
  - Forbidden：021与其他工作区改动、旧迁移、生产、权限扩大、模板预览、历史快照重写；不commit/push。
  - Contracts：spec第11节，周期template_ids为事实来源，项目template_id单选；GET project-templates仅元数据，原有项目范围权限；422/403/404沿用现有错误语义；审计与写入同事务，无外部系统。
  - Acceptance：周期多模板保存重开；仅显示本周期候选；弹窗确定/取消/切换/原值回显；预览共享禁用；拒绝跨周期模板、移除在用模板、已启动项目换模板；允许/拒绝权限覆盖；迁移回填与无损降级；前后端定向回归、构建、实际UI截图、真实API/SQL分别记录。
  - UI evidence：计划../../ui-blueprints/PM-T003-I11-implemented-project-template-selection.png；以实际组件为准。
  - Stop/rollback：停止未发布代码；生产不执行迁移或回滚；本地迁移测试隔离且回滚。完成所有必要证据后才勾选。

### PM-T003-I11 本地验收记录（2026-10-27）

- 已实现周期template_ids持久化/原值回填、项目范围候选及流程读取API、项目单选保存校验、全局组件复用、已选卡片和原弹窗切换；预览按用户要求不实现，共用禁用按钮。新迁移0275依赖唯一head0274；未执行公共开发库或生产迁移。
- 后端普通回归：backend目录 `.venv/Scripts/python.exe -m pytest tests/test_performance_cycles.py tests/test_performance_projects.py -q --tb=short`，278通过、3个opt-in跳过。
- 本卡真实数据库：`RUN_PERFORMANCE_DB_TEST=1 .venv/Scripts/python.exe -m pytest tests/test_performance_projects.py -k cycle_templates_isolated -q --tb=short`，1通过；localhost独立schema/独立序列/外层回滚。验证空表升级降级、旧单值回填、多值拒绝降级、周期PATCH→GET、项目PATCH→真实SQL→GET、数组去重、审计、周期外模板422、移除在用模板422、授权项目管理员200、越范围/无权403（含模板流程接口）；清理后schema不存在。未更改公共业务记录/快照。
- 浏览器：独立Vite+Chrome实际项目路由，隔离网络夹具验证三候选、单选、确认、取消保留、切换原值回显、PATCH payload、reload回显、无全局模板库请求，0个pageerror。夹具不冒充真实后端，API/SQL证据为上一项。实际PNG已查看：`../../ui-blueprints/PM-T003-I11-implemented-project-template-selection.png`、`../../ui-blueprints/PM-T003-I11-implemented-selected-template-card.png`。
- 扩展回归已知失败：PerformanceProjectTimeSettings.spec.ts 的“creates stable IDs without requiring crypto.randomUUID”断言期望phase-*，实际原有helper返回原生UUID；该测试及helper均未修改，82项中81通过1失败，不覆盖或绕过该失败。另一次全量开启RUN_PERFORMANCE_DB_TEST时，原有校准数据库测试因公共开发库仍为0273、缺少template_ids而失败；本卡在隔离schema升级后通过，不擅自升级公共库掩盖环境问题。
- 当前任务保持未勾选：本卡实现与专项验收完成，扩展回归存在上述失败，需独立处理；不以本轮宣称全部绩效回归/生产验收通过。生产部署须先批准并运行迁移，旧周期单模板自动回填，禁止多模板配置下有损降级。
- UI合规：已读Spec012交互/守则及N000/N00；仅绩效现有页面局部调整，无UCP、无菜单/权限扩大，无历史快照重写。

- 最终前端专项：`npm run test -- src/components/performance/PerformanceProjectTemplateField.spec.ts src/components/performance/PerformanceProjectFlowSettings.spec.ts src/components/performance/PerformanceButton.spec.ts src/views/performance/CycleManagement.spec.ts src/views/performance/ProjectManagement.spec.ts`，5文件69/69通过；`npm run build` 的vue-tsc与Vite通过（52.17s，既有VueUse PURE注释提示）。最终后端普通回归278通过3跳过，隔离schema专项单独启用1通过。
- 同步Spec002 overview/workflow-design中周期单模板旧表述为用户确认的“周期多模板、项目单选”；未改变其他流程规则。
- 任务状态：本轮代码完成，专项通过；保留扩展回归失败记录，PM-T003-I11不标记全体验收完成。未commit/push/部署/升级公共数据库。

### PM-T003-I11 按钮文案/被评估人显隐补充验收（2026-10-27）

- 用户补充明确“预览”“切换模板”可见文字，未选择模板时不显示被评估人；继续在本卡局部组件修正，不触及后端、权限、迁移或其他会话共享选择器改动。
- 修改PerformanceTemplatePreviewButton/PerformanceProjectTemplateField/PerformanceProjectSettingsPage及对应测试，新增PerformanceProjectSettingsPage.spec.ts；同步ui-interaction.md。模板前图标采集缺失，已说明无法准确解析，不自行补图。
- 本卡专项：`npm --prefix hr-portal/frontend run test -- src/components/performance/PerformanceProjectTemplateField.spec.ts src/views/performance/PerformanceProjectSettingsPage.spec.ts`，2文件10/10通过。覆盖共享预览可见文字、切换文字、初始不挂载、临时选择不显示、取消不显示、确认后挂载、已有模板重开、无模板校验仍可见及确认后清除过期提示。
- 扩展周期回归：加跑CycleManagement.spec.ts时37通过1失败；周期多模板标签断言读到4项而非2项。已核对工作区正在调整的PerformanceSelectShell新增aria-hidden/inert测量节点复用标签类，原断言同时采集可见标签和隐藏测量标签；本轮未改该共享组件或周期测试，不把扩展回归标为通过。
- `npm --prefix hr-portal/frontend run build`：vue-tsc+Vite通过（2m25s，既有VueUse PURE注释提示）；`git diff --check`本轮目标通过。
- 实际Chrome项目页面使用隔离网络夹具：初始无被评估人模块/无候选人请求，临时选择/取消保持隐藏，确定后显示；预览文字可见且禁用，切换回显原值/取消保留；选择后旧校验提示消失；0个pageerror。未宣称本轮真实后端或生产验收。
- 独立实际截图已查看：`../../ui-blueprints/PM-T003-I11-template-unselected-audience-hidden.png`、`../../ui-blueprints/PM-T003-I11-template-selected-actions.png`；临时Vite进程已停。未commit/push/部署；不更改原有未完成标记。


### PM-T003-I11-F01 项目基本信息局部展示调整（2026-10-27）

- [ ] PM-T003-I11-F01：用户本轮明确授权三项 UI 调整，关联现有项目设置页，前置为现有项目 GET/PATCH 与基本信息编辑弹窗。
  - 范围/允许文件：`PerformanceProjectSettingsPage.vue`、必要共享依赖 `PerformanceSelectTag.vue` 及其 `tokens.css` 标签 token、本功能交互与任务文件；保留共享工作树现有模板/被评估人和其他选择器调整。
  - UI：见 `ui-interaction.md` 同编号小节及用户 SnapSpec；原基本信息两列结构、全局编辑图标按钮、纯文本名称、无边框中性角色标签、隐藏描述。无新路由/复杂交互，不要求新完整蓝图。
  - 契约/禁止项：保持名称/角色/描述原数据、编辑弹窗、PATCH/GET；不改后端/迁移/权限/角色来源/全局样式，不部署或提交推送。停止方式为仅撤销本轮局部修改。
  - 验收：已保存项目显示无输入框的名称和逐项角色标签；描述不显示；点击编辑仍回填原弹窗；空角色不补默认值；名称超长省略。原页面错误提示和入口权限保持。
  - 检查：运行现有页面测试和前端构建；Spec012 N0001/N0002/N0004/N0005、N1102-N1106；无数据库变化，API/SQL/迁移验证不适用。未执行检查不得记通过，真实浏览器结果单独记录。

  - 本轮验证：`npm run test -- src/views/performance/PerformanceProjectSettingsPage.spec.ts src/components/performance/PerformanceButton.spec.ts`，2 文件 7/7 通过；`npm run build`（vue-tsc + Vite）通过；目标文件 `git diff --check` 通过。现有 5173 开发服务能正常转换该页面模块，包含全局编辑组件、纯文本名称和角色标签。
  - 验收限制：尚未执行浏览器视觉/点击编辑回填验收，无本轮截图，不以现有回归测试冒充三项视觉验证；本任务保持 `[ ]`。本轮无后端、SQL、迁移与生产操作，未 commit/push/部署。

  - 后续授权：用户明确要求本次相关改动在 main commit 并推送；仅提交本卡及共享标签必要依赖，其他工作区修改不纳入。浏览器验收状态保持待完成。

### PM-T003-I11-F02 已选模板前置图标（2026-10-27）

- [x] PM-T003-I11-F02：用户提供浏览器采集补齐此前缺失图标，按同一已选卡片局部还原，不扩展其他 UI 或业务功能。
  - 证据/契约：ancestors[0].before 为36×36px、margin-right 12px、background-size contain、center/no-repeat，内嵌SVG viewBox 0 0 32 32，5条path，颜色#3370FF/#245BDB/white。已解码查看原图，仅SVG path，无脚本/外部资源。
  - 修改范围：PerformanceProjectTemplateField.vue增加::before；tokens.css仅新增performance-template-icon-size/gap/image，不覆盖其他会话选择器token；同组件spec测试及本功能交互/任务记录。新增独立实际截图PM-T003-I11-F02-selected-template-icon.png，不覆盖其他任务证据。
  - 保护范围：不改候选列表、预览组件、按钮、被评估人显隐、页面基本信息（并行F01）、API/权限/数据库/历史快照；不自动commit/push/部署。
  - 专项测试：`npm --prefix hr-portal/frontend run test -- src/components/performance/PerformanceProjectTemplateField.spec.ts src/views/performance/PerformanceProjectSettingsPage.spec.ts`，2文件11/11通过。测试SVG原图坐标系/5条path/配色、token尺寸及间距、图标仅选后卡片显示，并回归按钮/选择/取消/被评估人显隐。
  - 实际Chrome：独立Vite与隔离网络夹具，图像decode成功；伪元素宽高36px、右间距12px、flex-shrink 0、contain/no-repeat，原图viewBox与path一致；未选/临时选择不显示，确认后显示，切换取消保留原值，预览禁用，0 pageerror。不将夹具冒充真实API或生产验收。
  - 独立PNG已查看：`../../ui-blueprints/PM-T003-I11-F02-selected-template-icon.png`；临时Vite进程已停止。
  - UI门禁：沿用PM-T003-I11与Spec012通用规则，已有采集确认的局部样式，无新页面或完整蓝图；本轮无后端/迁移/生产验收适用项。停止方式为仅撤销本轮图标局部修改，不触碰共享工作区其他差异。
  - 构建：`npm --prefix hr-portal/frontend run build` 的vue-tsc+Vite通过（退出码0）；相关前端回归4文件26/26通过（图标卡片8、显隐3、共享按钮4、项目管理11）；图标资源安全检查仅SVG/path，无脚本/外部引用，3个新token无重复。`git diff --check`通过，仅LF/CRLF提示。本局部图标任务完成，不改变父任务/并行F01其他未完成项；未commit/push/部署。

- 本部分提交授权：用户明确要求在main完成并推送；仅纳入按钮可见文案、模板前置图标、被评估人显隐、对应测试/截图/记录。tokens.css仅暂存3个图标token，其他并行选择器、通知与数仓改动不纳入；不包含部署或数据库操作。


### PM-T003-I07-F02 六字段快照筛选（2026-10-28 用户确认）

- [ ] PM-T003-I07-F02 扩展公共条件组件并接入项目被评估人六字段筛选
  - 确认依据：用户明确新增在职状态、离职日期、职位族、职位类、职级、标准职位，并确认筛选统一读取周期人员快照；实时状态仅用于前端识别离职人员；随后要求完成调整。
  - 前置/必读：Spec002 START_HERE、基线、PM-001、PM-T003 spec/ui-interaction/I07/F01、ADR-001、performance-spec-development 执行/迁移/验收契约；Spec012 通用 UI 门禁。复用既有条件组、搜索多选和纯日期组件，不新增页面或完整蓝图。
  - 允许修改：performanceConditionFields.ts、PerformanceAudienceRuleEditor.vue 及其现有测试、api/performance.ts、PerformanceProjectSettingsPage.vue 及现有测试；后端 project_service.py、projects_router.py、models.py、snapshot_service.py 及现有项目/快照测试；必要的新迁移与本功能交互/任务文档。保留所有并行未提交改动，前后端分文件串行整合。
  - 输入/输出契约：沿用 evaluator-options/preview/preview-people 和项目 POST/PATCH/GET；新增 employment_status、departure_date、job_family、job_category、position_level、standard_position。五类文本条件使用 include/exclude 多选，departure_date 使用 before/not_before/after/not_after 单日期，空日期不命中。候选值和日期元数据来自周期快照，未锁定时也不得回查实时花名册；没有快照时明确拒绝。
  - 数据边界：employment_status 保持筛选快照值，实时同步写入独立 live_employment_status；已启动成员不重算。现有旧状态无法从当前花名册恢复锁定原值，不作实时回填。既有标准职位 0277 迁移保持原样，新增迁移须串接当前唯一 head。
  - UI/API/权限：仅在项目信息被评估人开放六字段，限定考核范围及校准字段不扩展；组内且/组间或、按需加载、空值/失败重试和保存回显沿用原交互。保留当前权限与周期离职参评边界，不 commit/push/部署或改生产。
  - 验收：六字段候选去重、日期边界及空值、混合条件、预览/启动一致、保存回读、快照与实时值分离、无快照拒绝、非法字段/操作符/日期422、无权403；现有组件测试、后端项目/快照测试、前端构建及独立实际 UI PNG。迁移需独立数据库升级/降级证据，未执行或受阻分别记录。
  - 停止/回滚：只撤销本卡新增局部差异，不覆盖既有未提交文件；测试或迁移链冲突先报告并保留证据。所有必要证据齐备前不勾选完成。
  - 前端证据：公共字段目录、条件编辑器、项目设置页与校准条件回归共4文件41项通过；页面测试覆盖六字段原值加载、预览请求、保存重开、非法离职日期阻断、无快照明确错误、候选失败重试且草稿不变。真实 Chrome + 隔离接口验证六字段显示、首次打开值框才请求（1次）、六条规则 PATCH 后重开保持、0 pageerror；已查看独立 PNG `../../ui-blueprints/PM-T003-I07-F02-snapshot-reviewee-filters.png`。模拟 API 不作为真实数据库或生产证据。`npm --prefix hr-portal/frontend run build` 的 vue-tsc + Vite 通过，仅既有 @vueuse PURE 注释警告；早期数仓类型错误经并行工作树修正，未由本卡改动数仓文件。
  - UI 合规：沿用现有页面信息架构、公共组件和token，无新菜单或权限扩大；Spec012 N000/N00/N11 通用规则适用，数仓/UCP专属检查不适用。
  - 后端证据：`python -m pytest tests/test_performance_projects.py tests/test_performance_snapshot_service.py -q -rs --tb=short` → 301 passed、5 skipped、1项既有弃用警告；覆盖候选/预览/实际启动六字段、日期边界、周期离职准入、API保存回读与422/403、实时状态不改变快照筛选及身份范围。API保存回读使用内存夹具，不代替真实SQL验收。
  - 迁移证据/阻塞：新增0278_performance_live_employment_status.py，revision=0278_performance_live_status、down_revision=0277_performance_standard_position；仅新增live列并复制既有快照状态初始化，不查实时花名册。`python -m alembic heads` 为唯一0278_performance_live_status，SQL编译测试通过；实际启用隔离PostgreSQL升降级测试时连接TimeoutError，未执行到迁移。主线程确认本机Docker daemon未启动、127.0.0.1:5432不可连接；真实升级/降级与数据库持久化验收仍blocked，因此保持[ ]。
  - 实时状态展示补齐：预览人员响应与前端DTO区分快照employment_status/live_employment_status；被评估人预览名单新增“当前在职状态”列，读取live值、缺失时回退快照，不修改规则或人数。三组快照/实时状态差异测试通过，最新前端4文件44项通过；最终 `npm --prefix hr-portal/frontend run build`（vue-tsc + Vite）通过，Vite built in 42.57s、exit 0，仅既有 @vueuse PURE 注释警告。本轮不新增实时同步调度或扩展其他前台接口。

### PM-T003-I07-F04 六项独立筛选入口（2026-10-28）

- [x] PM-T003-I07-F04 独立封装在职状态、离职日期、职位族、职位类、职级、标准职位
  - 用户明确要求六项可像部门组件一样独立调用。沿用F02快照字段/接口，不改后端、迁移、权限和历史数据。
  - 允许范围：六个 Performance*Select.vue 业务组件、内部共享快照选项加载/选择组件，现有AudienceRuleEditor及其测试，项目页必要接线，本交互/任务文档。保护其他未提交内容；本轮不自动提交/推送/部署。
  - 契约：v-model、cycle-id、disabled；文本支持multiple（默认多选）及可选options，日期为YYYY-MM-DD字符串及可选date-range。有外部选项时由open事件交父级加载；否则打开时按cycle-id调用既有evaluator-options。组件内处理加载、失败重试、切换周期清缓存和过期响应丢弃；禁止实时花名册回退。
  - 复用：底层搜索多选/纯日期与token不变，编辑器改用独立具名组件；不扩展限定范围或校准字段。局部封装不改变信息架构，无需新完整蓝图。
  - 验收：现有测试中覆盖六组件独立加载、正确字段、失败重试、周期切换、禁用/外部选项模式、日期初始化不覆盖选值；筛选/项目页回归、构建和独立UI证据。全部证据完成后勾选。
  - 交付：新增六个具名业务组件、PerformanceSnapshotFieldSelect.vue 与 usePerformanceSnapshotOptions.ts 共享内部能力；AudienceRuleEditor 改用具名组件，外部选项模式保持父级统一懒加载，不增加后端接口。调用示例与props见ui-interaction.md对应F04小节。
  - 验证：`npm --prefix hr-portal/frontend run test -- src/components/performance/PerformanceAudienceRuleEditor.spec.ts src/components/performance/performanceConditionFields.spec.ts src/views/performance/PerformanceProjectSettingsPage.spec.ts` → 3文件44项通过（独立入口8项，编辑器14项，目录4项，项目页18项）。`npm --prefix hr-portal/frontend run build` 的vue-tsc + Vite通过，built in 43.28s、exit0，仅既有@vueuse注释警告。
  - 实际Chrome：六组件仅传v-model与cycle-id、无预加载，5类文本与离职日期分别正确请求快照选项并选中；失败422后重试成功，含重试共7次请求，0 pageerror。最终独立截图 `../../ui-blueprints/PM-T003-I07-F04-independent-snapshot-selectors.png` 已查看。浏览器使用隔离API夹具，无数据库或生产写入；本轮无后端/迁移变更，因此不重复F02数据库验收，父任务状态不变。
  - UI合规：沿用Spec012 N000/N00/N11通用规则与全局token，未新增菜单/权限/UCP能力。

### PM-T003-I11-F01 勾选值与角色标签一致性修正

- 用户明确：谁可管理人员绩效数据须与编辑弹窗勾选项一致，沿用原采集标签样式。此前误将 `administrators` 名单当成角色；修正为 API `data_managers`，PROJECT_ADMIN 显示项目管理员、HRBP 原样显示。
- 允许范围补充：现有页面及 `PerformanceProjectSettingsPage.spec.ts`、本功能交互/任务记录；不新建脚本或测试文档，不改后端/迁移/权限/全局标签组件。
- 回填/契约：保留 GET 项目对象传回原编辑弹窗，含 data_managers 与原限定范围；原 PATCH 成功后 GET 重读更新标签，取消/失败不变。空数组不补角色；缺失字段沿用后端/弹窗既有 HRBP 默认。
- 验收：HRBP 单选、项目管理员单选、双选、空数组；实际弹窗组件回显、变更提交/读取更新、再次打开回显、取消及失败保留；保留原管理员名单和限定范围。测试中的后端请求为 mock，不作为真实 SQL/生产证据。
- 验证：页面 Vitest 10/10 通过（3 项原回归、7 项勾选/展示/编辑链路）。npm run build 的 vue-tsc + Vite 通过（退出码 0），目标文件 git diff --check 通过。F01 原真实浏览器视觉验收保持未完成。本轮不改生产或数据库，未自动提交/推送本轮修复。

### PM-T003-I11-F02 项目管理员真实人员接入（2026-10-29）

- [x] PM-T003-I11-F02 项目管理员字段调用 PerformancePersonSelect
  - 用户明确：绩效管理后台 → 项目设置 → 编辑项目 → 项目管理员，完成真实人员接入并调用 `PerformancePersonSelect`。开工前已确认两项口径：`administrators` 继续保存 `display_name`（后端按显示姓名匹配的现有权限路径与历史名单不变）；可选人员取周期人员快照（`evaluator-options.people`），不新增全员查询接口。
  - 允许范围：`PerformanceProjectDialog.vue`、`PerformanceProjectSettingsPage.spec.ts`、本交互/任务记录。不改后端、API 契约、数据库、迁移、权限匹配、全局组件或历史快照。
  - 契约：弹窗 `form.administrators` 由逗号/顿号文本改为 `string[]`，提交原样数组；选项映射快照 `people` 的 `value`→姓名、`label`→「姓名（工号）」，按姓名去重；快照中缺失的历史姓名按原值回显。选项仍由选择器 `@open` 触发 `open-options` 懒加载，打开弹窗自身不请求接口（与原「值选择器打开才加载」契约一致）。
  - 测试：`npm run test -- src/views/performance/PerformanceProjectSettingsPage.spec.ts src/views/performance/CycleManagement.spec.ts` → 2 文件 48 项通过（新增 2 项：选择快照人员后提交姓名；快照缺失的已存姓名保持选中并能原样提交）。原用例中 `input[aria-label="项目管理员"]` 与新增人员选择输入同名，改为 `input[type="checkbox"][aria-label="项目管理员"]` 精确定位。
  - 构建：`npm run build` vue-tsc + Vite 通过（built in 1m 9s）。
  - PC（本地 dev 栈真实登录 admin，真实接口无夹具）：dev 库原无绩效周期，经 API 建合成周期 `PC验收周期-项目管理员`（快照来自 2219 行实时花名册，619 人）。新建项目弹窗打开「项目管理员」选择器后加载 619 个真实人员选项（`请求 /evaluator-options` 无 pageerror）；选中第一人、填写项目名保存后，DB `administrators` 为 `["michael.chen陈湘宇"]`；进入该项目的「编辑项目」弹窗，人员以可移除标签回显。截图：`hr-portal/.tmp/pm-t003-project-administrator-picker-pc.png`、`pm-t003-project-administrator-saved-pc.png`、`pm-t003-project-administrator-edit-dialog-pc.png`。走查后已通过 API 删除合成项目/周期，dev 库恢复 0 周期 0 项目。
  - 已知限制：dev 花名册 `full_name` 为「账号+姓名」，因此显示名带账号前缀；不影响本实现，生产为真实姓名。同名人员仍按 PM-T008 Q06 未治理（保存姓名的口径由用户确认）。
  - 未做：生产部署与生产验收、后端权限匹配治理、同名歧义治理。
