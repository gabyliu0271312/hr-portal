# PM-T003 原子任务：周期创建与周期级人员设置

## 任务状态规则

本文件任务均为后续实现任务。只有代码、UI、测试、验收和证据均完成后，才能将 `[ ]` 改为 `[x]`。

## 任务清单

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


- [ ] PM-T003-I07-F03 被评估人人数统计与人员预览
  - Goal/Type：在项目信息被评估人区域展示真实总人数、任务人数、仅报表离职人数及每组人数，并复用去催办人员弹层查看明细；既有 UI/API/快照增强。
  - Prerequisites/reading：PM-T003-I07/F01/F02、Spec002 基线、本功能交互、execution-contract/migration-coordination/acceptance-evidence；Spec012 A01/A02/A05/N0001/N0002/N0004/N0005/N1101-N1106。
  - Allowed modifications：绩效 employee_roster_contract、models/snapshot_service/cycle_service/cycles_router/project_service/projects_router；新迁移0277；现有 performance API、AudienceRuleEditor、ReminderPanel/TaskTable/SelectionActionBar、ProjectMemberListPanel、PerformanceProjectSettingsPage及对应测试；本功能文档。共享文件串行合并并保留并行强制分布和六字段筛选改动。
  - Frozen contract：周期快照为唯一人员源；POST `/cycles/{cycle_id}/evaluator-preview` 返回 matched/task/report/report_only/group_counts；POST `/cycles/{cycle_id}/evaluator-preview/people` 支持 matched|task|report_only、group_index、keyword、分页。已占用人员排除；无权403，非法规则422。`standard_position` 独立进入周期/项目快照，历史空值不回填实时花名册。
  - UI：总标题16/600/24；说明14/400/22；每组“同时满足以下条件：N人”。复用 TaskOverlay/ReminderPanel 只读 preview 模式，固定九列，不显示选择/导出/催办动作。独立 PNG 计划 `../../ui-blueprints/PM-T003-I07-F03-implemented-evaluator-preview.png`。
  - Business boundary：N人生成任务并纳入报表；M名离职人员不生成任务，仅进入成员快照和报表。项目 evaluated_count、校准和节点任务只统计/生成 N 人；同周期唯一性覆盖 N+M。
  - Tests：`tests/test_performance_snapshot_service.py`、`tests/test_performance_projects.py`；AudienceRuleEditor/ReminderPanel/ProjectSettings focused Vitest；vue-tsc、前端 build、alembic heads、迁移真实升降级和浏览器截图分别记录。
  - Evidence（2026-10-28，本地）：本任务精确后端4/4通过；绩效快照+项目完整回归300通过、5个显式跳过、1个既有python_multipart弃用警告；前端4文件36/36通过；`npx vue-tsc --noEmit`通过；`npm run build`的vue-tsc+Vite生产构建通过，仅既有VueUse PURE注释提示；迁移链单头0278，顺序为0276→本任务0277→并行0278；`git diff --check`无错误，仅其他工作区文件LF/CRLF提示。
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
  - Evidence（2026-10-28，本地）：后端分布/接口定向 5/5 通过；完整 `test_performance_projects.py` 263 passed、4 个既有 opt-in skipped、1 个既有弃用 warning。前端新抽屉与流程页 2 文件 23/23 通过。`npm run build` 首次通过；最终复跑被并行 `PerformanceReminderPanel.spec.ts:97` 多余结束括号阻断，本卡未修改该文件；单独 Vite 生产资源构建 3407 modules transformed 并成功输出。`git diff --check` 本卡目标文件通过。实际 UI PNG、真实鉴权 PATCH/GET/启动 API 与数据库回读尚未执行，因此任务保持 `[ ]`。
  - Blockers：运行时分布计算和按校准范围下一步是后续独立任务，不阻塞本卡配置与门禁；实际 UI PNG 和真实 API/SQL 证据尚未生成；正式整体类型构建等待并行测试语法错误解除后复跑。
  - Non-scope：分布执行、自动调整、软控制提示、强制豁免、范围配置下一步、历史重建、部署和提交推送。
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

### PM-T003-I11-F01 勾选值与角色标签一致性修正

- 用户明确：谁可管理人员绩效数据须与编辑弹窗勾选项一致，沿用原采集标签样式。此前误将 `administrators` 名单当成角色；修正为 API `data_managers`，PROJECT_ADMIN 显示项目管理员、HRBP 原样显示。
- 允许范围补充：现有页面及 `PerformanceProjectSettingsPage.spec.ts`、本功能交互/任务记录；不新建脚本或测试文档，不改后端/迁移/权限/全局标签组件。
- 回填/契约：保留 GET 项目对象传回原编辑弹窗，含 data_managers 与原限定范围；原 PATCH 成功后 GET 重读更新标签，取消/失败不变。空数组不补角色；缺失字段沿用后端/弹窗既有 HRBP 默认。
- 验收：HRBP 单选、项目管理员单选、双选、空数组；实际弹窗组件回显、变更提交/读取更新、再次打开回显、取消及失败保留；保留原管理员名单和限定范围。测试中的后端请求为 mock，不作为真实 SQL/生产证据。
- 验证：页面 Vitest 10/10 通过（3 项原回归、7 项勾选/展示/编辑链路）。npm run build 的 vue-tsc + Vite 通过（退出码 0），目标文件 git diff --check 通过。F01 原真实浏览器视觉验收保持未完成。本轮不改生产或数据库，未自动提交/推送本轮修复。
