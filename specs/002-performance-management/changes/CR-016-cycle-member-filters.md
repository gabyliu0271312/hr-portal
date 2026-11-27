# CR-016 周期成员高级筛选

- 日期：2026-11-26。
- 状态：实施中，未验收。用户在逐项 REA 采集后明确要求“直接整理后完成开发”；本记录整理已有交互和安全实施边界，不把未实现字段或未运行验收写成完成。
- 关联：CR-007-F17 原成员筛选预留；PM-001 快照、具名管理角色与字段可见规则。

## 范围与来源

入口：绩效前端 → 项目管理 → 周期概览 → 成员列表 → 筛选。只接周期成员，项目/评估/校准/自定义 provider 不扩展本次合同。
复用 _cycle_member_rows / _authorized_member_rows / _project_member_rows 的授权与最新项目成员快照，不新建查询权限链。无迁移、无业务写入、无通知、无外部数据请求；飞书采集数据不导入本地业务库。

REA 已确认：锚定筛选浮层、所有/任意、增删条件、清除、取消、确定；人员搜索后出候选，姓名及部门副标题；部门含子与所属部门精确；序列分别含子/精确；职级和评级支持多选全选；日期区间；当前雇佣状态等于/不等于，其余已采条件包含/不包含；环节及评级来自配置而非固定名称。
参考字段清单：直属上级、上级、HRBP、部门、所属部门、职级、序列含子、序列精确、管理者、人员、人员组、入职日期、当前雇佣状态、人员类型、当前周期结果、历史结果、校准结果变更、所属项目、环节状态。
该清单不是本地已有数据能力的证明。无安全来源的字段不通过静态菜单暴露，必须记录缺口。实时身份仅用于身份展示，不能覆盖人员/组织历史快照；“当前雇佣状态”如缺独立实时安全查询则不开放。

## 冻结跨层合同

- GET /api/v1/performance/project-management/cycles/{cycle_id}/members/filter-options，query 可选 key / keyword。
- 返回 {fields:[{key,label,kind,operators:[{value,label}],options:[{value,label,subLabel?,color?,children?}]}]}。
- kind 为 person / organization / select / date；人员无搜索词时不返回候选，搜索候选限定授权数据。字段和选项由后端提供；前端不拼19项静态列表。
- 原 members / members/export 新增可选 filters JSON 字符串：{logic:"and"|"or",conditions:[{key,op:"in"|"not_in"|"eq"|"ne",values:string[]}]}。
- 无条件与旧请求一致；最多30条件、每条100值；未知字段/操作符/无权字段/非法日期或值统一422 INVALID_MEMBER_FILTER。日期区间两项 YYYY-MM-DD，包含端点，空值不命中正向与反向条件，避免推断隐藏值。
- 筛选只缩小原权限结果；行字段不可见不参与该条件，无论正反向；AND/OR均不得反推隐藏字段。
- 必须先授权、再过滤、再计数排序分页；列表和导出使用相同条件，但导出仍额外校验原导出权限。
- 评级 key 沿本地 rating:* 配置，值为本地真实option ID。环节 key 为 stage:*，名称来自项目流程快照，禁止使用参考站ID及硬编码节点列表。
- UI只提交有值的条件；日期不完整/倒序时不作为有效条件且不阻止确认（2026-11-27实采v2覆盖）；取消不应用草稿；重开复制已应用值；应用/清空后回第一页并清理勾选。
- 保存条件按可信用户、周期和管理角色服务端持久化（2026-11-27实采v2覆盖）；换周期/角色/身份清除应用筛选及缓存，未完成旧请求不可回填。

## 2026-11-27 实采修订 v2（本轮实施依据）

用户明确要求全部以实采 DOM、接口为准，并授权修复既有弹窗。覆盖上文 v1 的“不持久化”和“半填日期阻止应用”约束；其余授权、快照和列表/导出同条件约束不变。属于既有弹窗修复，不新增页面或页面流，不另起完整蓝图。

- 实采本机目录：`C:/Users/gaby.liu/AppData/Local/Temp/rea-member-filter-detail-94zz0sqo`；69–92 是序列/当前历史结果的选择、应用、请求响应、重开和恢复证据。保存创建/必填/重名/回填/删除/恢复见45–56，日期/HRBP见57–64。
- 布局708宽，字段/操作符/值240/100/280，控件32高、间距8，顶部已存条件与保存条件、底部添加/清除/取消/确定，删除图标复用。新增空条件自动展开字段级联；环节状态/当前周期绩效结果/历史周期绩效结果为动态分组；环节名使用配置原名，不追加状态。360反馈/复议等枚举以本地对应环节规则生成，不能硬编码全环节四态。
- 序列区分精确/含子，树节点身份使用本地快照体系；当前结果沿rating:*稳定ID；历史结果同时绑定历史周期与指标，不读取当前组织关系改写历史。HRBP使用快照关系且受字段权限限制。
- 日期使用双月范围控件；半填、倒序未提交为有效筛选（不得引入原站没有的阻止提交弹窗）。本地HTTP仍沿YYYY-MM-DD合同，不为复刻原站时间戳改变既有日期业务语义。
- DTO增量：field.kind允许sequence，field.group?:string[]用于字段级联路径，option.children递归、avatarUrl?/subLabel?；现有filters={logic,conditions:[{key,op,values:string[]}]}保持兼容。
- 条件持久化合同：GET/POST `/performance/project-management/cycles/{cycle_id}/members/filter-presets`，DELETE同路径`/{preset_id}`；列表`{items:[{id,name,filters}]}`，创建`{name,filters}`返回同一条目。名称1–500字；空条件/非法字段422 INVALID_MEMBER_FILTER，重名409 MEMBER_FILTER_NAME_EXISTS。按可信actor、周期、具名management角色隔离，删除越权404；回填后仍走当前授权字段验证。新增独立迁移，不挪用列偏好表。
- 缓存仅用于当前周期/身份/角色，预取字段减少点击等待；上下文切换失效，旧请求不能回填。外部点击丢弃草稿，内部Teleport选择器、日期和命名浮层不误关外层。
- 测试：字段分组/树/状态、历史权限/候选、日期、保存CRUD隔离与重名；前端缓存/自动展开/取消/外部关闭/应用/回填/删除；定向pytest与Vitest、build、UI规则扫描、本地真实Vue浏览器及独立PNG。数据库迁移未实测不得声明完成。
- 单链协调：用户明确要求不使用双head或新增merge。保留另一线程`0326_performance_manager_standard`不改，本轮尚未应用的筛选迁移顺延为`0327_member_filter_presets`，依赖`0326_performance_manager_standard`。Alembic ScriptDirectory读取迁移图，断言唯一head为`0327_member_filter_presets`通过；本次增量为线性链，仓库已有历史merge不改。仅验证迁移图，未执行数据库upgrade/downgrade，不据此提升真实数据库验收状态。

## 2026-11-27 六项复核修订 v3

用户确认历史周期问题是字段菜单没有该入口，并要求修复全部六项；本轮仍归CR-016-T01/T02/T03，不新增页面、迁移或权限。以当前/历史周期各自快照配置的完整评级档位和配置顺序为候选，不得按授权成员实际命中的档位裁剪；授权成员只决定匹配与计数。历史周期排除当前后按现有逐周期授权读取，不以开始日期先后判断是否可用；无授权或无评级配置不得生成可执行条件。字段菜单保留“历史周期绩效结果”根组，无可用历史字段时展示不可选择的“暂无可用周期”，不伪造字段key、默认不放开关闭项目权限。

原站补采确认：保存条件使用12px `FilelinkSaveOutlined`；已存条件使用12px普通`DownOutlined`（不是选择框的粗箭头）；所有/任意默认68×28带框、12字号、6圆角；候选行右侧使用12px实心`ListCheckBoldOutlined`，底部全选仍保留方框复选框。前端复用现有DownOutlinedIcon，保存与点勾抽为共享SVG组件，禁止Unicode字符或嵌套按钮替代。

v3验证：前端筛选20项+共享选择器15项+项目管理81项，合计116 passed（26.54s）；UI规则扫描本轮6个组件0违规；vue-tsc+Vite构建通过（3909模块45.71s），既有VueUse PURE/bundle提示。后端线程四组1351 passed/5 skipped/1 warning（41.34s）；主线程独立复跑筛选80 passed/1 warning（13.68s）及前端筛选20 passed（13.09s）。完整配置候选、配置顺序、日期为空/同日/更晚周期独立授权、closed和不同actor拒绝有回归；未扩大既有STARTED项目授权。浏览器受控API验证七档及说明、12px点勾、全选checkbox、历史根无授权空态、授权后三级历史评级按ID应用通过；截图`ui-blueprints/CR-016-T02-v3-rating-options.png`与`ui-blueprints/CR-016-T02-v3-history-entry.png`已读取。是合成API的真实Vue组件证据，不是用户现场真实JWT/PostgreSQL整链或全像素一致性证明。本轮无新迁移、无生产操作、无commit/push。

等级候选文案修正：用户明确“绩效等级后接等级名称，不是等级描述”。当前与历史评级共用候选转换，等级标识仍用code/label，右侧subLabel优先name、兼容本地code+label格式中的label；不再读取description，无名称时不回退长描述。筛选专项84 passed/1 warning（13.10s）；新增覆盖name/label/description同时存在、旧格式、仅描述以及历史候选。此次未自动commit/push。

日期弹层层级修正：原日期popup与外层筛选使用相同z-index，现仅将日期子层调整为`calc(var(--performance-popover-z-index) + 1)`，不改变其他弹窗层级。本地真实Vue受控API浏览器测得外层2301/日期2302，两个日期单元的elementFromPoint均命中日期层，真实鼠标选中2026-11-01至2026-12-01后筛选仍打开且按日期区间正确应用。应用回显截图`ui-blueprints/CR-016-T02-v4-date-layer-applied.png`，不将该已收起日历截图冒充展开层级截图。筛选专项21 passed（13.52s），UI扫描0违规；未commit/push或部署。

## UI 交互基准 v1（历史记录，冲突以v2/v3为准）

沿现有页面与已逐项确认的飞书浮层交互，不改页面信息架构。PerformancePopover 作壳，PerformanceSearchSelect / OrganizationTreeSelect / DateTimeField 作值控件；UiButton 作操作。新增条件行独立组件。
界面布局：顶部“符合以下 [所有/任意] 条件”；中部多行“字段 / 操作符 / 值 / 删除”；底部添加条件、清除已选内容、取消、确定。加载/失败可重试/无可用字段/禁止状态有可见反馈；禁用状态不得显示假成功。
DOM+computedStyle原始本地证据：临时 rea-rating-network-1795689749280.json。评级候选14字号/22行高/400字重，标签与说明并列、全选7；浮层实测280 CSS px，但坐标采样存在浏览器缩放，不能据整页截图换算硬编码。UI尺寸优先已有同语义token，缺失按业务token命名增补。
独立实现PNG预期：ui-blueprints/CR-016-T02-cycle-member-filters.png；未生成前不宣称真实UI或像素一致验收。

## 原子任务

- [ ] CR-016-T01 安全候选与服务端过滤。
  - 前置：上述DTO、已有权限与快照边界；必读002基线/PM-001/执行契约。
  - 允许：backend/app/performance/projects_router.py、member_filters_service.py、schemas.py（仅必要内部字段），backend/tests/test_performance_member_filters.py及必要既有测试。
  - 输出：候选API，列表/导出filters；安全动态选项与ID；支持字段/缺口明确。
  - Given授权项目/成员及字段；When include/exclude AND/OR 查询；Then分页计数导出一致且隐藏字段不泄露，非法422、无权403/404沿原路径。
  - 测试：pytest定向纯规则/真实HTTP/授权范围；无迁移upgrade/downgrade不适用。禁止改历史数据和生产。
- [ ] CR-016-T02 筛选浮层与真实接入。
  - 前置：T01合同；本次采集交互与用户“直接完成开发”指令。UI基准为本记录v1，尚无独立新HTML蓝图确认，不把参考截图冒充本地实现。
  - 允许：frontend/src/api/performance.ts，components/performance/ProjectMemberListPanel.vue、PerformanceMemberFilter*.vue及必要测试；styles/tokens.css仅精确新增本卡token，保留已有变更。
  - 输出：动态条件/搜索/树/日期/评级、多选全选、应用/取消/清除、错误/空/加载态，列表导出filters；具名角色范围不变。
  - Given已应用条件；When草稿取消/重开/确定/切身份；Then取消不查询、重开原值、确定回第一页、导出同条件、旧响应无效。
  - 测试：Vitest组件/API/ProjectManagement回归，build，UI规则扫描；真实Vue页面验证与独立PNG。012 N00读取/复用/状态检查，仓库菜单/UCP检查不适用。
- [ ] CR-016-T03 联合验收与证据。
  - 主线程检查diff、测试、构建、真实UI、未实现字段；本地合成API/真实API/数据库/生产分别记录。只在证据闭环后勾选。

## 停止及回滚

仅撤销本卡精确增量，保留所有用户已有未提交文件；不执行git reset、不改权限配置、数据库、任务答案或审计。无自动commit/push/deploy。

## 实施与验收证据

### 2026-11-27 v2 实施验收（优先于下方历史记录）

- 代码：字段三级级联与动态环节原名、当前/历史评级；序列精确/含子树；HRBP受权限快照候选；用户级条件保存/重名/回填/删除确认；中文双月日期范围；空白新增自动展开、复用垃圾桶图标、外部点击丢弃、身份上下文失效、字段预取。保留本地稳定ID和既有filters结构，不导入参考站业务ID。
- 前端自动化：`npx vitest run src/components/performance/PerformanceMemberFilter.spec.ts src/views/performance/ProjectManagement.spec.ts src/components/performance/PerformanceSubjectVisibilityEditor.spec.ts --reporter=dot` → **99 passed / 3 files，22.68s，exit0**，筛选专项16项。项目管理部分存量测试仍有jsdom XHR AggregateError stderr，不冒充无告警运行。
- UI规则：筛选主组件、字段级联、条件预设、取值、日期范围5个Vue → **0违规**。`npm run build` → **vue-tsc+Vite通过，3903模块，38.92s**；既有VueUse PURE和bundle尺寸提示保留。
- 本地真实Vue受控API浏览器验证：708外宽、240/100/280三列、32控件高、48×28确认按钮；历史三级菜单704宽且修复动态扩宽；新增自动展开、历史评级按ID应用、保存与回填、中文双月范围280宽且点击子层不误关、选择2026-11-01至2026-12-01应用并重开回显、外部点击无额外apply均已观察。受控API不是已登录整页真实后端或PostgreSQL证据。截图已生成并读取：`ui-blueprints/CR-016-T02-v2-history-cascade.png`、`ui-blueprints/CR-016-T02-v2-date-range.png`；初版截图保留但不作为最终像素基准。
- 后端线程最终报告：四组`test_performance_member_filters.py / test_performance_management_scope.py / test_performance_projects.py / test_performance_subject_visibility.py` → **1340 passed / 5 skipped / 1 warning，32.34s，exit0**；警告为既有python_multipart弃用。覆盖历史周期独立授权、预设身份/角色/周期隔离、权限撤销后重放、真实SQLite HRBP配置normalize→成员行→HTTP allow/deny。HRBP新增字段可配置注册，不扩大默认授权，前端配置入口原本动态渲染field_options，无须静态新增。阶段文案统一待完成/已完成/已逾期/未开始，360额外已拒绝，复议无未开始；序列文案完整对齐实采。
- 迁移：唯一head`0327_member_filter_presets`图验证通过；后端测试真实执行隔离SQLite0327 upgrade→插入→downgrade，原周期数据保留。**真实PostgreSQL未监听、未执行持久库迁移**；不声明数据库或生产可上线。任务整体仍不勾选，原因是持久数据库与完整真实登录API联合验收未完成。

### 已实现范围（2026-11-26，历史记录）

- 后端：projects_router.py 与 member_filters_service.py 接通周期候选、列表与导出；有筛选时对完整授权结果过滤后计数分页，无筛选保留原SQL分页；内部真实评级/上级ID不进入公共DTO。
- 实际支持：人员、直属上级、所属部门精确、部门全路径含子、职族/职类/序列精确、职级/上期职级、入职日期闭区间、人员类型、所属项目，以及按已有配置产生的rating:*、stage:*。
- 明确缺口：祖先上级、HRBP、管理者、人员组、历史周期评级、校准变更、序列含子尚无完整安全数据链，本轮不暴露。当前雇佣状态的live_employment_status存在live or frozen回退，不能权威区分实时与历史，本轮也不暴露；不把缺失能力记作完成。
- 字段options公开in/not_in，服务端保留eq/ne单值兼容；日期in/not_in必须两项起止日期，闭区间含端点；空值及不可见字段均不命中正反向条件。UI字段/候选来自filter-options响应，没有静态19项假功能。
- 前端：PerformanceMemberFilter / PerformanceMemberFilterValue 复用Popover/SearchSelect/OrganizationSelect/DateTimeField/RatingTag/Checkbox/UiButton；周期成员面板持有已应用条件，应用回第一页、清勾选、列表及导出同参，换身份/周期清空。UI扫描所改三Vue 0违规。已有表面板存量样式本轮同值token化，测试的源码断言相应改为token引用。
- 独立真实组件验收：本地Vite5178、隔离页面挂载真实Vue组件和受控候选API，选项ID应用事件{logic:and,conditions:[{key:rating:demo,op:in,values:[a]}]}已观察；DOM浮层宽708 CSS px。实现PNG `ui-blueprints/CR-016-T02-cycle-member-filters.png` 已生成并读取。这是局部组件合成数据证据，不是整页真实登录、真实API或像素完全一致证明；整页路由实际访问重定向到登录，未绕过登录验收。
- 自动化：最终Vitest筛选7项+项目管理81项共 **88 passed**（22.92s，exit0），覆盖列表与导出条件一致。完整构建 **vue-tsc+Vite通过**（3887模块，53.48s，exit0），仅既有VueUse PURE提示。首轮build曾缺OrganizationNode.level，已修复；同值token化后原两条硬编码源码断言失败，按token语义修正后最终整组重跑通过。
- 后端主线程独立复跑：`PYTHONPATH=hr-portal/backend DB_HOST=127.0.0.1 DB_PORT=1 hr-portal/backend/.venv/Scripts/python.exe -m pytest hr-portal/backend/tests/test_performance_member_filters.py hr-portal/backend/tests/test_performance_management_scope.py hr-portal/backend/tests/test_performance_projects.py -q --tb=short` → **1295 passed / 5 skipped / 1 warning（44.91s，exit0）**。新增筛选文件47项；警告为既有python_multipart弃用，跳过不计通过。非人员候选取消100截断，人员搜索保留100上限。本地替身/SQLite/HTTP测试不替代真实PostgreSQL和生产验收。
- 未验收：真实JWT登录→真实后端→PostgreSQL、生产部署、大周期性能、19字段完整功能、全浮层像素差、UI完整蓝图版本独立确认。无迁移/通知/业务数据改写/commit/push/deploy。

任务保持未勾选；本地有限字段闭环不等于原需求全部字段交付。
