# PM-T017 指标库原子任务

completion_status: incomplete
pixel_restore_status: blocked
uncovered_reasons: missing_metric_rows, missing_metric_form, missing_filter_state, missing_permission_state

- [x] PM-T017-T01 指标库页面框架
  - 前置条件：PM-T002 后台入口；指标库采集参数；本目录 `spec.md`、`ui-interaction.md`。
  - 功能范围：实现标题栏、字段/公式入口占位、指标库内容卡片、工具栏和采集到的空状态。
  - 不修改范围：真实指标 API、指标字段、编辑表单、字段/公式管理、多维表格编辑业务。
  - 代码交付物：`PerformanceMetricLibrary.vue`、目标路由更新。
  - UI 要求：复用全局绩效组件和 `tokens.css`；保持 894x631 Tablet 采集下的 20px 内容内边距、8px 圆角、轻阴影、14px 正文和 18px 标题层级。
  - 测试要求：组件测试覆盖标题、工具栏按钮、搜索占位、空状态和辅助说明；执行 `vue-tsc --noEmit` 与生产构建。
  - 验收标准：从应用设置指标库路由打开页面；无虚拟数据；未采集操作只提示后续接入；空状态结构与采集文案一致。
  - 完成定义：页面、路由、组件测试和类型/构建检查完成；真实 API 和完整交互验收保留给后续任务。
  - 验收证据：`PerformanceMetricLibrary.spec.ts` 1 个用例通过；`npm.cmd run build` 通过（3196 modules）；页面使用 `PerformanceCreateButton`、`PerformanceButton`、`PerformanceSearchInput`、`PerformanceFilterButton`、`ProjectMemberColumnDrawer` 与 `tokens.css`。

- [ ] PM-T017-T02 指标库真实数据与编辑流程
  - 前置任务：PM-T017-T01；冻结指标领域模型、列表字段、API Schema、权限和审计契约。
  - 本轮 UI 交付：已完成新建/编辑共用右侧抽屉 P0/P1 组件骨架，并按 `字段管理.txt` 优化指标库标题栏字段管理按钮为“14px 图标 + 字段管理”文字按钮；已按 `字段管理弹窗.txt` 接通字段管理全屏弹层，复用全屏 Header、Tab、表格和分页结构；已按 `指标字段.txt` 复用工具栏、白色容器、表格和内置分页组件完成指标字段列表结构；已按 `公式管理跳转.txt` 接通“评分公式管理”全屏弹层，复用全屏 Header、按钮、搜索框、筛选按钮、表格和指标模板 SVG 空状态；真实指标/公式 API、指标编辑重开、评分方式候选项和指标列表数据仍待冻结后接入；指标字段新建与列表已独立交付 PM-T017-T04。
  - 本轮新增 UI 交付：已按 `D:\\乐逗\\Desktop\\新建评分公式.txt` 接通“新建评分公式”弹窗，复用 `PerformanceDialogShell`、`PerformanceFormItem`、`PerformanceTextField`、`PerformanceSearchInput`、`PerformanceButton`，并抽取 `PerformanceFormulaEditor` 复用编辑器结构；已实现公式名称/公式内容必填校验、采集到的函数资源列表、函数/字段/运算符 Tab、搜索、插入、说明面板和结构化事件；未接入 API、权限/审计和真实字段/运算符数据。
  - UI 要求：复用 `PerformanceDrawerShell`、`PerformanceDrawerFooter`、`PerformanceTextField`、`PerformanceRadioGroup` 与 `tokens.css`；保留已确认空状态结构，补齐 loading/error/forbidden 和危险操作状态后才能完成本任务。
  - 代码交付物：`PerformanceMetricCreateDrawer.vue`、`PerformanceMetricSelect.vue`、`PerformanceMetricFormulaManagementModal.vue`、`PerformanceMetricFormulaCreateDialog.vue`、`PerformanceFormulaEditor.vue`、`PerformanceMetricLibrary.vue` 及对应组件测试。
  - 测试要求：已覆盖抽屉分组、必填校验、确定并继续添加和指标库入口；新增评分公式编辑器与新建评分公式弹窗组件测试，覆盖函数列表、资源搜索、字段/运算符空态、必填校验、结构化确认事件和编辑初始值；API 成功、参数错误、403、分页、空数据、表单真实保存、失败恢复和重开验证待接口契约冻结后补充；执行 `npm.cmd --prefix hr-portal/frontend run test -- --run src/components/performance/PerformanceMetricCreateDrawer.spec.ts src/components/performance/PerformanceFormulaEditor.spec.ts src/components/performance/PerformanceMetricFormulaCreateDialog.spec.ts src/views/performance/PerformanceMetricLibrary.spec.ts` 与 `npm.cmd --prefix hr-portal/frontend run build`。
  - 完成定义：真实 API、权限和完整交互验收完成后才能勾选。

- [x] PM-T017-T04 指标字段新建与真实列表闭环（P0/P1）
  - 前置条件：PM-T017-T01；用户于 2026-09-30 在门禁阻塞说明后明确要求继续实现；本任务按 ADR-002 执行 P0/P1 定向豁免，不改变 P2 blocked。
  - 必读：本目录 spec.md、ui-interaction.md；ADR-002；D:\乐逗\Desktop\新建字段.txt；Spec 012 A01/A02/A05、N000/N00 与 UI 守则。
  - 允许修改：后端 app/performance/models.py、app/main.py；前端 PerformanceLocalizedInput.vue、PerformanceMetricFieldManagementModal.vue、PerformanceMetricFieldsTable.vue 与对应测试；本目录规格。用户于2026-09-30要求预置字段禁用态对齐采集参数，补充允许 PerformanceButton.vue/PerformanceButton.spec.ts、styles/tokens.css、usePerformanceMetricFields.ts 及 PerformanceMetricFieldsTable.spec.ts，限定系统字段标识透传与共享链接按钮禁用变体，不启用自定义字段编辑/删除。随后按用户新增hover采集参数，补充允许 PerformanceDisabledReason.vue、PerformanceInfoPopover.vue 及对应.spec.ts：复用禁用包装层和现有白底浮层/精确SVG箭头，仅增加按钮触发插槽与禁用操作视觉变体；浮层样式消费全局Token，保留原默认提示行为。
  - 允许新建：后端 app/performance/metric_fields_router.py、alembic/versions/0248_performance_metric_fields.py、tests/test_performance_metric_fields.py；前端 src/api/performanceMetricFields.ts、src/composables/usePerformanceMetricFields.ts、src/components/performance/PerformanceMetricFieldCreateDialog.vue 与对应 .spec.ts；本目录 ui-gate-waivers.json。
  - 共享文件：主智能体串行修改，保留现有未提交内容；不改已有迁移和全局权限模型。
  - 输入/输出契约：见 spec.md 第 4 节；创建与列表使用同一数据库真源；服务端生成 ID、操作者与时间。
  - UI：600px 弹窗；名称必填、中文输入；文本/数字/百分比单选；取消/确定。复用 PerformanceDialogShell、PerformanceLocalizedInput、PerformanceFormItem、PerformanceRadioGroup、PerformanceButton、PerformanceMetricFieldsTable，消费全局 tokens.css，不复制基础组件 CSS。
  - 状态：关闭→编辑→校验失败/保存中→成功关闭并刷新列表；保存失败保留输入；重复提交禁用；列表加载/错误重试/403/空态；搜索分页与保存后定位ID升序列表末页。
  - 测试契约：有效名称与三种类型创建返回 201，GET 可回读；空白/超长/未知类型/伪造系统字段返回 422；重名含并发冲突返回 409；无权限 403；字段与审计同事务；取消不写库；失败保留表单；分页和重开读取一致。
  - 验证命令：docker exec hr-portal-backend pytest -q tests/test_performance_metric_fields.py --postgres-acceptance；npm.cmd --prefix hr-portal/frontend run test -- --run src/components/performance/PerformanceMetricFieldCreateDialog.spec.ts src/components/performance/PerformanceMetricFieldManagementModal.spec.ts；npm.cmd --prefix hr-portal/frontend run build。
  - UI 合规：对应 Spec 012 N0001/N0002/N0004/N0005；本任务为绩效配置弹窗，不适用仓库 K 章或数据仓库 N02-N10 业务检查。
  - 非范围：指标库指标 CRUD、指标类型 CRUD、字段编辑/删除、英文保存、字段参与计算与历史周期修改、全状态像素验收。
  - 验收证据（2026-09-30）：字段专项 pytest --postgres-acceptance 19 passed；前端字段弹窗/字段管理/指标模板弹窗/指标库四组共17 passed；vue-tsc --noEmit + vite build通过（并行改动合并后再次通过，3240 modules）。真实Edge139/1534×911/DPR1进入指标库→字段管理→指标字段，新建text/number/percentage分别POST201，列表GET200，刷新重开后名称/类型一致；数据库独立读取3条及3条审计成功，测试字段已清理，审计按不可变规则保留。截图 `../../ui-blueprints/PM-T017-T04-metric-field-create.png`、`../../ui-blueprints/PM-T017-T04-metric-field-saved.png` 已读取检查，弹窗600×335px，页面异常0。补充真实搜索“指标单位”返回1条text记录；375×812窄屏弹窗343×335px、左右各16px，三种选项及确定按钮均可操作。
  - 迁移证据：真实本地数据库0247→0248成功；专项测试在隔离schema验证空表升级、7条内置字段/自增ID9、降级、重新升级、既有哨兵数据保留，最终事务回滚，不降级真实业务表。并行指标类型开发追加0249后再次运行字段测试仍通过。
  - 扩展回归：`pytest -q tests/test_performance_metric_fields.py tests/test_performance_template_workflow.py --postgres-acceptance` 为53 passed/1 failed；失败为既有 `test_calibration_executor_is_a_project_configured_placeholder_for_template_api`（旧执行人未归一成“在项目配置时指定”）。已核对该测试函数及 template_workflow_service.py 均无本轮修改，不扩展修复该业务规则。
  - 门禁证据：`check_ui_spec.py ... --task-id PM-T017-T04 --source-dir hr-portal/frontend/src --phase implementation` PASS（仅明确授权的9条采集/P2缺口豁免）；不将此结果表述为像素验收通过。
  - 容器部署证据（2026-09-30）：用户要求“在容器内构建和替换”后执行 `docker compose -f hr-portal/docker-compose.yml build frontend`（Docker多阶段内 Vite 构建3240模块成功），再 `up -d --no-deps --force-recreate frontend`；新镜像 `sha256:aac32a60e848d586e1d1e65e09d9cf525e7828256de13487fa08396d42900683`，回退镜像标签 `hr-portal-frontend:rollback-20260930-113837`。8080页面/API健康均200，Nginx配置通过，DB healthy且迁移为0249。通过8080真实容器入口再验收百分比字段POST201→GET→浏览器刷新回读一致，页面异常0，独立DB/审计校验通过，测试字段已清理、审计保留。截图 `../../ui-blueprints/PM-T017-T04-container-field-dialog.png` 已读取检查；本次未修改业务代码、未重建数据库卷、未发布远程环境。
  - 文案复用修正（2026-09-30）：按用户要求显示“+ 添加英文”，仅移除 PerformanceMetricFieldCreateDialog 的空 add-language-label 覆盖，使用 PerformanceLocalizedInput → PerformanceTextButton 的默认文案/图标/Token；不新增英文输入或保存逻辑。新增回归后前端18项通过，容器内构建及frontend替换通过；8080浏览器验证按钮文字、共享组件类名/图标、点击未接入提示及0写请求/0页面异常。截图 `../../ui-blueprints/PM-T017-T04-add-english-label.png` 已读取检查。
  - 预置字段禁用态修正（2026-09-30）：按用户提供的894×631采集参数新增共享 PerformanceButton link变体及全局 --performance-button-link-disabled-color；表格消费该变体，不再覆盖基础按钮CSS。usePerformanceMetricFields透传is_system为isSystem；预置7条即使actionsDisabled=false也禁用并阻断edit/remove事件，自定义字段继续服从默认禁用开关。字段表格3项、共享按钮4项及其余相关回归最终共27项通过；中途发现的指标类型旧checkbox测试漂移由并行会话同步后已通过。容器Vite构建成功并替换frontend（镜像cfddf3c4ed5b），8080健康200。实际Edge/894×631逐一验收7条记录14个按钮：28×22px、14px/22px/400、6px圆角、rgb(187,191,196)、opacity1、not-allowed、透明背景；hover仍为灰色，点击0写请求，页面异常0。截图 `../../ui-blueprints/PM-T017-T04-system-field-disabled.png` 已读取检查。未改后端或开放自定义字段编辑/删除，不宣称全功能P2通过。本轮全量 `npm run build` 的 vue-tsc 阶段仍被并行开发的 `PerformanceMetricDimensionCreateDialog.spec.ts` 20/32/55行fixture枚举类型声明阻塞（review_type被推断为string）；已通知该任务负责会话，未修改其业务/测试，不将容器Vite构建成功等同为全量类型检查通过。
  - 系统字段悬浮提示验收（2026-09-30）：复用 PerformanceDisabledReason 的包装层，新增popover变体委托 PerformanceInfoPopover；后者复用原SVG/定位，新增按钮插槽、auto宽度、独立disabled-action视觉Token、唯一aria-describedby以及hover/focus/Escape/销毁清理。编辑使用采集原文，删除使用对应不可删除规则文案；自定义字段不显示系统预置原因。8组35项测试通过（InfoPopover6、DisabledReason4、字段表格3、按钮4、字段管理7、新建字段5、指标模板弹窗5、指标库1）；全量vue-tsc与Vite构建通过，先前并行指标维度测试的类型阻塞在本轮复核中已消除。容器内构建/替换frontend通过，镜像5dad8a81db1b、Nginx检查通过、API健康200。
  - 悬浮运行时证据：8080真实容器、Edge139、1534×911/DPR1逐一检查7条系统字段14个编辑/删除提示；卡片202×48px、正文14px/400/22px、padding12px/16px、1px #DEE0E3边框、8px圆角、白底/#1F2329正文、三层阴影均与本次采集参数一致；箭头16×8且path精确一致。按钮仍28×22并disabled，点击0写请求、页面异常0；移出关闭、移入提示可读、键盘focus/aria-describedby/Escape、894×631边界避让和返回页后浮层清理通过。首次自动化定位器因嵌套has作用域错误超时，修正为兼容包装层定位后全部通过，无业务代码回退。截图 `../../ui-blueprints/PM-T017-T04-system-field-edit-tooltip.png` 与 `../../ui-blueprints/PM-T017-T04-system-field-delete-tooltip.png` 已读取检查；P2全功能状态不变。
  - 编号/排序修正范围（2026-09-30）：用户要求7→6、8→7及后续按ID升序。允许新增0251_performance_metric_field_ids.py（依赖0250），修改metric_fields_router.py的服务端排序、usePerformanceMetricFields.ts的保存后末页定位与相关测试fixture；不改0248/0249/0250、不回拨sequence、不改模板metric_type_ids或历史审计JSON。迁移需验证来源身份/目标占用、field_ids旧值一次性映射保序、升级/降级、失败事务回滚，完成后核验真实库和容器列表。
  - 编号/排序修正验收（2026-09-30）：新增0251已应用，真实字段为1指标/2权重/3指标单位/4目标值/5完成值/6完成说明/7指标评价人；实际类型id10、11的field_ids由[8,7,5,4,3,2,1]一次映射为[7,6,5,4,3,2,1]，API显示名称及原配置顺序不变。迁移前后逐值比较：所有字段非ID元数据、类型非field_ids元数据、31条既有相关审计、2份模板维度均不变；字段sequence保持45/true，仅追加迁移审计id951。迁移预检首次因测试fixture内联JSON被SQLAlchemy识别成绑定参数而失败，改为绑定JSON后7场景全部通过；真实库在预检通过后才执行迁移。
  - 最新测试/部署：`pytest -q tests/test_performance_metric_fields.py --postgres-acceptance` 27 passed（含升级/降级、占号、源身份不符、缺失、非系统字段及审计失败整体回滚）；前端8组37 passed（新增升序跨页定位/末页失败恢复），全量vue-tsc+Vite通过，容器内构建与frontend替换通过，backend已加载升序查询。共享组件并行开发中的短暂类型错误在最终构建前已补齐，未发布该中间态。
  - 编号运行时证据：8080实际页面显示预置1–7升序；通过弹窗连续创建4条测试记录57/58/59/60，均按ID递增追加，达到11条后自动定位第2页，新记录60位于末尾；刷新重开第一页仍升序，翻页与独立GET再次读到新增记录，页面异常0。已核对无类型引用后清理这4条自有测试记录，保留不可变审计且不回拨序列；最终字段表仍仅7条系统记录，当前head0251。截图 `../../ui-blueprints/PM-T017-T04-field-id-ascending.png`、`../../ui-blueprints/PM-T017-T04-field-created-last-page.png` 已读取检查。历史已用ID不复用，新建ID可能留空号，升序不等于无间断编号。
  - 固定业务编号/CRUD增强（用户确认）：按spec.md 4.1节新增0252_performance_metric_field_display_ids.py、display_id与事务分配计数器/触发器；允许修改models.py的PerformanceMetricField区域、metric_fields_router.py、metric_types_router.py的字段锁验证及test_performance_metric_fields.py；前端允许修改performanceMetricFields.ts、usePerformanceMetricFields.ts、字段新建/编辑弹窗、字段表格和字段管理弹窗及对应测试，复用既有删除确认组件。内部ID/引用/历史审计不重排；系统7条仍禁止修改删除，自定义字段按引用保护开放操作。API测试改用隔离schema，不在正式字段表批量消耗业务编号。待增强验收后补证据，T04既有完成记录不代表本增强已完成。
  - 完成定义：开发、权限与持久化测试、迁移、实际 UI 保存及重开验收全部通过才勾选；P2 缺采集 screenshot/layout/interaction/rendered contract，保持 blocked。

- [ ] PM-T017-T05 指标类型新建与真实列表闭环（P0/P1）
  - 前置任务：PM-T017-T01；用户于 2026-09-30 明确要求完成“字段管理→指标类型→新建指标类型”真实保存、表格回显及拖拽排序。
  - 必读：本目录 `spec.md` 第 5 节、`ui-interaction.md`、ADR-002、D:\乐逗\Desktop\新建指标类型.txt（当前为空，P2 保持 blocked）、Spec 012 A01/A02/A05、N000/N00 与 UI 守则。
  - 允许修改：后端 `app/performance/models.py`、`app/main.py`；前端 `PerformanceMetricFieldManagementModal.vue`、`PerformanceMetricTypesTable.vue`、`PerformanceMetricLibrary.vue` 与对应测试。
  - 允许新建：后端 `app/performance/metric_types_router.py`、`alembic/versions/0249_performance_metric_types.py`；前端 `src/api/performanceMetricTypes.ts`、`src/composables/usePerformanceMetricTypes.ts`、`src/components/performance/PerformanceMetricTypeCreateDialog.vue`、`src/components/performance/PerformanceMetricFieldIcon.vue`、`src/components/performance/PerformanceMetricFieldRow.vue` 与对应 `.spec.ts`。
  - 输入/输出契约：指标类型名称与至少一个已存在指标字段 ID；列表由 `GET /api/v1/performance/metric-types` 返回，`field_ids` 顺序由服务端映射为 `fields` 展示摘要；创建/更新与审计同事务。
  - UI：600px 弹窗；名称复用 `PerformanceTextField`；“指标字段”标签下显示“选择该类型所需填写的字段”，不显示拖拽说明提示；指标字段按已选拖拽行展示，不显示勾选框；固定字段与可排序字段行采用采集到的浅色底、4px 圆角、6px 8px 内边距，可排序行间距 8px，并提供“移除/选择字段”；“选择字段”复用 `PerformanceTextButton` + `AddOutlinedIcon`，打开复选字段选择弹窗，复用真实指标字段 API；弹窗内“新建字段”复用指标字段 Tab 的 `PerformanceMetricFieldCreateDialog`，保存成功刷新字段接口；排序复用 `PerformanceSortableList` 与 `PerformanceDragHandle`；弹窗、文本框、按钮和 Token 不复制基础样式；新建/编辑共用 `mode=create|edit` 组件树。
  - 状态：关闭→编辑→校验失败/保存中→成功关闭并刷新列表；保存失败保留输入；重复提交禁用；列表 loading/error/403/empty/retry；移动端不横向溢出。
  - 测试要求：前端组件测试覆盖必填校验、字段选择、确认载荷与组件回归；执行 `npm.cmd --prefix hr-portal/frontend run test -- --run src/components/performance/PerformanceMetricTypeCreateDialog.spec.ts src/components/performance/PerformanceMetricFieldManagementModal.spec.ts` 与 `npm.cmd --prefix hr-portal/frontend run build`；后端至少执行 `py_compile`、路由导入和迁移检查，Postgres API 验收待 Docker 恢复后执行。
  - 验收标准：新建名称与字段顺序通过 POST 持久化；关闭后指标类型表从 GET 回读对应名称、字段摘要、更新人和更新时间；重复名称 409、非法字段 422、403 有明确提示；取消不写库；拖拽/键盘排序不破坏字段顺序。
  - UI 合规：对应 Spec 012 N0001/N0002/N0004/N0005；本任务为绩效配置弹窗，不适用仓库 K 章或数据仓库 N02-N10 业务检查；P2 采集门禁保持 blocked。
  - 非范围：指标类型删除、下游指标计算绑定、英文保存、指标库指标 CRUD、P2 像素级验收。
  - 完成定义：代码、迁移、权限与审计、前端测试、Postgres 持久化回读及实际 UI 保存重开验收全部完成后才勾选。
  - 容器验收证据（2026-09-30）：后端镜像已在容器内重建并替换；迁移 head 为 `0250_performance_template_dimensions`（包含 0249）；`frontend` 容器镜像已由协作会话构建替换，8080 前端/API 均 HTTP 200。指标类型 API 在容器内完成 POST 201、GET 回读、PATCH 字段顺序回读、重复名称 409、未知字段 422 及创建/更新审计校验；测试数据已清理。首次 PATCH 暴露的 `updated_at` 过期 `MissingGreenlet` 已通过更新后 `db.refresh(row)` 修复并在替换后复验通过。
  - 尚未完成：真实浏览器进入字段管理→指标类型→新建指标类型的 UI 保存、刷新回读和拖拽/键盘排序验收；因此任务暂不勾选，P2 保持 blocked。

- [ ] PM-T017-T03 指标模板新建弹窗、详情编辑与指标维度真实闭环（P0/P1）
  - 前置条件：PM-T017-T01 已完成；用户于 2026-09-30 明确授权指标维度 P0/P1 定向豁免；P2 采集契约仍 blocked。
  - 局部交付：`MetricTemplateManagement.vue` 接通 `MetricTemplateCreateDialog.vue`，`MetricTemplateDetail.vue` 接通 `PerformanceMetricDimensionCreateDialog.vue`；复用 `PerformanceDialogShell`、`PerformanceLocalizedInput`、`PerformanceSwitch`、`PerformanceRadioGroup`、`PerformanceCheckbox`、`PerformanceAssessmentSelect`、`PerformanceButton` 和全局 Token。
  - 保存契约：指标模板固定使用 `template_kind=metric`；维度配置写入 `performance_templates.dimensions` JSONB，通过模板详情 GET/PATCH 回显和保存；复用 `performance.configuration.manage` 权限和 `PerformanceAuditEvent`。
  - 指标维度字段：维度名称（必填）、维度描述、需设置维度权重（打开后必填 0–100 百分数，关闭后清空）、可添加的指标类型（至少一个真实指标类型）、允许被评估人添加指标、各指标评估规则（使用相同规则/使用不同规则；相同规则需选择真实启用评估规则）。
  - 被评估人展开区：894×631 采集面板；打开开关展示“添加指标的方式”两项、评分方式下固定“指标库的指标：以指标库设定的方式为准”，自定义方式额外显示“非指标库的指标”和其下对齐的“手动评分”下拉，两行均带蓝点图标；“至少添加 1 条指标”复选；关闭隐藏且保留本次编辑值，旧维度取采集默认值；三项随模板 dimensions JSONB 保存和重开，评分计算与其他未采集候选不在范围。
  - UI 要求：600px 弹窗；标题“添加指标维度”；关闭/取消不写库；校验失败保留输入；保存中禁用重复提交、输入和关闭；错误保留表单；复用 `tokens.css`，不复制基础组件 CSS；按采集参数维持字段顺序和分区。
  - 状态：关闭→编辑→校验失败/保存中→成功关闭并回显维度；指标类型/评估规则加载失败、403、空数据有明确反馈；模板详情刷新/重开可读回已保存维度。
  - 代码交付物：`PerformanceMetricDimensionCreateDialog.vue`、`MetricTemplateDetail.vue`、`performance.ts`、`models.py`、`templates_router.py`、`0250_performance_template_dimensions.py` 及对应测试。
  - 测试要求：前端组件测试覆盖必填、指标类型勾选、评估规则选择、不同规则模式和确认载荷；后端覆盖 DTO 校验、类型/规则引用校验、PATCH 持久化与审计、读取重开、权限由现有依赖保护；执行组件测试、模板工作流回归、构建、迁移 head/语法检查。
  - 验收标准：有效维度通过 PATCH 保存，GET 详情返回同一维度；刷新/重开后名称、描述、开关、类型 ID、评估规则模式/ID一致；未知指标类型/不可用评估规则返回 422；403 由现有绩效配置权限返回；取消不发请求。
  - UI 合规：对应 Spec 012 N0001/N0002/N0004/N0005；本任务为绩效配置弹窗，不适用仓库 K 章或数据仓库 N02-N10 业务检查；T03 定向豁免不改变 feature `incomplete` / P2 `blocked`。
  - 非范围：指标库指标 CRUD、指标类型 CRUD、评估规则 CRUD、逐指标独立评估规则配置、复杂评分计算、英文保存、周期快照修改、UCP、P2 像素级验收。
  - 验收证据（2026-09-30）：`PerformanceMetricDimensionCreateDialog.spec.ts` 3 passed；`MetricTemplateDetail.spec.ts` 2 passed；`test_performance_template_dimensions.py` 4 passed；`vue-tsc --noEmit` 与 Vite build 通过（3243 modules）；Alembic head 为 `0250_performance_template_dimensions`，容器升级成功且 `performance_templates.dimensions` 已存在。真实 API 使用管理员权限对模板 78 执行临时指标类型维度 PATCH 200、GET 200 回读一致后清理临时数据并将模板维度恢复为空。前端服务 HTTP 200。浏览器交互验收未运行：环境未提供 `chromium-cli`/Playwright，P2 rendered contract 与截图 diff 保持 blocked。
  - 权重开关补充验收（2026-09-30）：开关打开后“维度权重”百分比输入框紧随开关显示，150×32px 输入区 + 34×32px `%` 附件；空值和 0–100 范围由前后端校验，关闭清空并隐藏；旧 JSON 无 `weight` 可读取。弹窗与详情组件 6 passed，后端维度 6 passed（容器内同为 6 passed）；本地 vue-tsc/Vite build 通过、容器双镜像构建和替换成功，当前 Alembic 单 head 0251，认证后模板详情 GET 200，前端 HTTP 200，静态资源包含权重校验。未做浏览器实测/P2 截图 diff，不勾选 T03。
  - 被评估人展开区增量验证（2026-09-30）：新增业务组件 `PerformanceMetricRevieweeSettings.vue` 并接入维度弹窗；前端维度+详情 7 passed，后端维度 8 passed，`npm run build`（含 vue-tsc）通过，T03 实现门禁 PASS（仅已授权范围豁免）。旧 JSON 默认值、非法枚举 422、更新审计和回读由单测覆盖；用户随后明确授权容器替换，已在容器内重建并替换前后端，后端就绪后迁移单 head 0251、带权限模板详情 GET 200、字段 GET 200、前端 HTTP 200，容器内维度 8 passed，静态资源含新展开区文案。未做新展开区真实浏览器操作和新增配置的真实 PATCH/GET 回读；P2 仍 blocked，不勾选 T03。
  - 评分方式分支修正（2026-09-30）：依据用户补充的894×631采集文本，评分方式固定展示带蓝点“指标库的指标：以指标库设定的方式为准”；仅添加方式为自定义可选时显示带蓝点“非指标库的指标”及文字下方对齐的“手动评分”选择框。前端维度+详情+评估内容共享选择框回归39 passed；字段弹窗中间态修复后重跑完整 `npm run build`（vue-tsc+Vite）通过，T03 实现门禁 PASS。主库仍在0251等待字段 display_id 的0252隔离验证与升级，此修正尚未替换运行容器，真实浏览器/像素验收 not-run。
  - 完成定义：开发、权限与持久化测试、迁移、前端组件测试、真实 UI 保存及重开验收全部通过后才勾选；P2 采集缺口保持 blocked。
