# PM-T017 指标库页面与新建指标抽屉

- 状态：指标字段新建/列表已接入真实 API 并完成保存、刷新回读验收（PM-T017-T04）；指标模板添加指标维度 P0/P1 已实现，指标库列表框架及指标模板保存已实现；指标库指标数据、编辑、指标类型和完整业务联调仍未接入
- UI 目标：P0 + P1；P2 像素验收 blocked
- 采集来源：`D:\\乐逗\\Desktop\\指标库.txt`、`D:\\乐逗\\Desktop\\字段管理.txt`、`D:\\乐逗\\Desktop\\字段管理弹窗.txt`、`D:\\乐逗\\Desktop\\新建指标弹窗.txt`
- 采集页面：`/perf/admin/metrics-management/metrics-lib?currentPage=1&pageSize=10`
- 采集视口：894x631 Tablet；抽屉参数为 1534x911 Desktop

## 1. 本轮范围

根据采集到的指标库页面结构，实现后台「应用设置 → 指标管理 → 指标库」页面框架：

- 页面标题“指标库”；
- 标题右侧字段与公式入口；
- 点击公式管理打开“评分公式管理”全屏弹层；
- 白色内容卡片、克制阴影与 20px 内容内边距；
- 新建指标文字按钮（包含公共加号图标）；
- 按名称搜索、筛选、自定义列抽屉、使用多维表格编辑入口；
- 空状态“暂无内容”；
- 空状态辅助说明“指标库中的指标可以由管理员和被评估人在添加指标时选用”；
- 从绩效后台应用设置路由进入页面。

## 2. 本轮实现范围与非范围

### 2.1 本轮实现

- 新建指标右侧抽屉 P0/P1 UI：指标类型、指标设置、指标/权重/指标单位、目标值、完成值、评分方式、标签、可用范围，以及确定、确定并继续添加、取消操作。
- 字段管理全屏弹层 P0/P1 UI：复用全屏 Header（返回 + 字段管理）、指标类型/指标字段 Tab、指标类型表格、新建指标类型、编辑/禁用删除操作和分页结构。
- 公式管理全屏弹层 P0/P1 UI：复用全屏 Header（返回 + 评分公式管理）、新建按钮、搜索框、筛选按钮、公式表格和指标模板 SVG 空状态。
- 新建评分公式弹窗 P0/P1 UI：复用共享对话框、表单项、输入框和按钮；实现公式名称/公式编辑器必填校验、函数/字段/运算符资源 Tab、搜索、函数插入与说明面板；未采集的字段/运算符选项通过 props 注入，不自行编造。

### 2.2 明确非范围

- 不根据空状态采集结果推断指标行字段；
- 不实现指标库真实查询、新建、筛选和编辑重开；指标模板新建保存复用绩效模板 API，详情页仅实现采集范围内的读取展示；
- 字段管理中的“指标字段新建/列表”按第 4 节接入真实 API；指标类型和公式管理真实 API、编辑/删除不在本轮范围；
- 除第 4 节指标字段独立存储外，不新增其他指标业务规则或数据库变更；
- 不宣称像素级还原通过。

## 3. 实现约束

- 标题和内容卡片复用 `PerformanceListPage` 与 `PerformanceContentSurface`，标题右侧操作使用公共页面壳插槽；
- 复用 `PerformanceCreateButton`、`PerformanceButton`、`PerformanceSearchInput`、`PerformanceFilterButton` 等全局组件；
- 复用 `PerformanceDrawerShell`、`PerformanceDrawerFooter`、`PerformanceDialogShell`、`FullScreenModal`、`PageHeader`、`PerformanceContentSurface`、`PerformanceListToolbar`、`PerformanceManagementTable`、`PerformanceTextField`、`PerformanceRadioGroup`，新建/编辑抽屉和字段管理全屏弹层均使用共享壳与按钮组件；
- 字段内容使用业务组件 `PerformanceMetricFieldsTable` 组装列定义、固定列和操作，页面不直接实现原生表格；
- 抽屉、全屏 Header、弹层按钮、表单控件和颜色、字号、间距、圆角、阴影只消费 `src/styles/tokens.css` 的设计 Token；
- 保留已有 `PerformanceAdminLayout` 和 `PerformanceMetricLibrary` 路由，不改动应用设置导航结构；
- 未采集的评分方式候选项不自行编造，由 `scoringMethodOptions` 注入；未接入 API 时只发出结构化表单事件，不写入虚拟指标数据。

## 4. PM-T017-T04 指标字段创建契约（2026-09-30）

- 授权：用户在获知门禁缺口后明确要求继续开发，后续确认固定业务编号及自定义字段编辑/删除；本节当前契约以4.1为准，按P0/P1实施，不改变全功能incomplete / pixel blocked。
- 归属：绩效应用全局指标库字段定义，不属于特定模板或数据仓库物理列；不接触已开始周期快照。
- 新建请求：`POST /api/v1/performance/metric-fields`，`{name, field_type}`；name 去首尾空白，1–128 字符，精确同名唯一；field_type 仅 `text | number | percentage`。拒绝未知请求字段。
- 创建响应：201，`{id,display_id,name,field_type,is_system,in_use,updated_by,updated_at}`。操作者名称与身份从已授权服务端上下文取得，时间、内部ID及固定业务编号由数据库生成。
- 列表请求：`GET /api/v1/performance/metric-fields?offset=0&limit=10&keyword=`，limit 1–100，offset>=0；按名称字面子串搜索，不将 `%`/`_` 当通配符；按固定业务编号display_id升序（服务端先排序再分页），新增排末尾；返回 `{items,total,offset,limit}`。
- 权限：GET/POST/PATCH/DELETE均复用 `require_performance_permission('performance.configuration.manage')`；无权限返回403，未登录401；不新增员工入口授权。
- 错误：校验失败 422；去空白后精确重名 409，code=`PERFORMANCE_METRIC_FIELD_NAME_DUPLICATE`；存储失败回滚，不显示成功。
- 存储：独立 `performance_metric_fields` 表；字段 id/display_id/name/field_type/is_system/created_by_type/created_by_ref/updated_by/created_at/updated_at。name与display_id唯一；类型 CHECK；系统人员字段只允许内置记录，客户端不能创建。
- 历史兼容：0248最初写入ID 1/2/3/4/5/7/8，内部自增序列从9开始；0251按用户要求将完成说明7→6、指标评价人8→7，旧迁移和历史审计保留。0252起按4.1新增独立display_id，内部id不再重排或回拨，界面固定业务编号不随查询/删除重算。系统更新人为空、显示 --。
- 审计：创建/更新/删除分别追加PERFORMANCE_METRIC_FIELD_CREATED/UPDATED/DELETED，与字段操作同事务；新增审计同时记录内部ID及业务编号，旧审计不改写。并发重名由数据库唯一约束返回409，无部分成功。
- 迁移：新增 0248，依赖唯一 head 0247；升级新增表不修改现有数据；降级删除该新增表（生产降级会删除新字段，必须先备份并另行授权），降级测试仅在 PostgreSQL 隔离临时 schema 内执行并回滚清理。
- 页面：新建成功关闭弹窗、清空搜索并定位业务编号升序列表末页；编辑保留当前筛选并回读，删除后回读并在末页删空时退到有效页。已保存/删除但列表刷新失败时明确区分操作成功与回读失败，不引导重复写入；取消不写库，失败保留输入或确认框，引用冲突禁用确认但仍可保留退出。
- 编号调整事务：0251依赖唯一head0250；锁定performance_metric_fields与performance_metric_types，核验源记录名称/类型/系统标识、目标6空闲后，在同一事务修改两条ID，并以旧值一次性映射metric_types.field_ids中的7→6、8→7，保留数组原顺序、类型ID及其他字段。源状态不符/目标被占用时停止，不覆盖或删除其他记录；downgrade反向映射，若目标8占用则停止。sequence完全不改，历史审计JSON不改写，追加一条SYSTEM迁移审计记录前后编号映射。
- 历史边界：模板dimensions.metric_type_ids指向指标类型ID而非字段ID，review_rule_id指向评估规则，均不得随字段改号；不触及周期/人员快照。发布后刷新配置页面，避免旧浏览器表单继续携带改号前ID。
- 非范围：英文保存、字段配置的下游计算/类型绑定、历史周期修改、P2 像素还原。用户后续明确要求的编辑/删除及固定业务编号按4.1节实施。

### 4.1 固定业务编号与自定义字段编辑/删除（用户确认）

- 用户明确选择“固定业务编号”：表格ID列显示 `display_id`，内部主键 `id` 永不再重排；筛选、分页和删除不改变其他记录的编号，删除留空号。当前内部ID61的自定义字段应显示8；系统字段保持1–7，后续递增。所有API路径、指标类型field_ids、行key和审计主体仍用内部id。
- 0252依赖0251：增加唯一非空display_id，按现有id升序回填1..N；增加单行事务计数器及INSERT触发器分配业务编号，以兼容尚未重启的旧POST逻辑。事务失败不消耗业务编号，并发创建不重复，删除不回拨；内部identity和历史审计/引用不改动。
- GET列表/GET单条/POST/PATCH返回 `{id,display_id,name,field_type,is_system,in_use,updated_by,updated_at}`；列表按display_id升序再分页。GET单条路径 `/{id}` 用内部id，不存在404。
- PATCH `/{id}` 请求仍为 `{name,field_type}`（与新建相同校验）；仅自定义字段允许，系统字段403/code=PERFORMANCE_METRIC_FIELD_SYSTEM_PROTECTED；被类型引用时允许改名，但变更field_type返回409/code=PERFORMANCE_METRIC_FIELD_IN_USE；同名409/code=PERFORMANCE_METRIC_FIELD_NAME_DUPLICATE；未知字段422。
- DELETE `/{id}` 仅自定义且未引用时允许，二次确认后执行；成功204，不存在404，系统字段403，存在指标类型引用409/code=PERFORMANCE_METRIC_FIELD_IN_USE。不自动解绑/级联删除；删除及编辑均与对应PerformanceAuditEvent同事务。
- 并发边界：字段编辑/删除获取行更新锁，再检查类型引用；指标类型写入验证字段时按内部ID固定顺序获取共享保护锁，持有到提交，避免删除与添加引用竞争导致孤儿引用。更新后刷新服务端生成时间，避免MissingGreenlet。
- UI：复用同一新建/编辑弹窗和既有确认弹窗，编辑回填最新GET；引用中的自定义字段名称可改、类型禁用并说明；自定义记录操作启用，系统预置仍禁用及现有hover原因。删除成功回读列表，末页删空时退到有效页；取消不写库，失败保留输入/确认内容，保存中禁止重复操作。不新建控件样式。
- 测试/部署：API与迁移测试用隔离PostgreSQL schema，避免批量测试消耗用户可见业务编号；部署前完成测试与构建，一次协调后端加载窗口并验证8080，不在人工保存期间并发重启。


## 5. PM-T017-T05 指标类型新建契约（2026-09-30）

- 请求：`POST /api/v1/performance/metric-types`，`{name, field_ids}`；名称去首尾空白，1–128 字符；`field_ids` 为至少一个已存在指标字段 ID，顺序即表单展示顺序；请求拒绝未知字段。
- 更新：`PATCH /api/v1/performance/metric-types/{id}`，与创建使用同一请求契约；指标类型弹窗以 `mode=create|edit` 复用同一组件树。
- 列表：`GET /api/v1/performance/metric-types?offset=0&limit=10&keyword=`，按 ID 降序返回 `{items,total,offset,limit}`；每条返回 `id/name/field_ids/fields/updated_by/updated_at`，`fields` 为服务端按 ID 顺序生成的显示摘要。
- 权限与审计：GET/POST/PATCH 均复用 `performance.configuration.manage`；创建/更新与 `PerformanceAuditEvent` 同事务；名称唯一冲突返回 409，字段不存在或参数非法返回 422，无权限返回 403。
- 存储：新增 `performance_metric_types`，`field_ids` 使用 JSONB 保存已选字段顺序；迁移 0249 依赖 0248，不修改既有字段数据。
- UI：600px `PerformanceDialogShell`；名称复用 `PerformanceTextField`；指标字段以已选字段拖拽列表呈现，不显示勾选框；固定字段行与可排序字段行均使用 `rgba(31,35,41,0.08)` 底色、4px 圆角、6px 8px 内边距；可排序行间距 8px，提供“移除”和“＋ 选择字段”操作，并复用锁定、字段类型图标；排序复用 `PerformanceSortableList`、`PerformanceDragHandle` 实现 pointer 与键盘排序；按钮复用 `PerformanceButton`；颜色、字号、间距、边框、圆角、阴影只消费 `tokens.css`。
- 状态：关闭→编辑→校验失败/保存中→成功关闭并刷新指标类型表；保存失败保留输入；重复提交禁用；列表加载/错误重试/403/空态可见。保存后表格从同一 API 真源回读，不写前端 fixture。
- 采集边界：`D:\乐逗\Desktop\新建指标类型.txt` 当前为空，故本任务目标为 P0/P1 业务与设计系统一致，不宣称 P2 像素验收通过；拖拽具体几何和 hover 状态待补充采集证据。

## 6. PM-T017-T03 指标模板添加指标维度契约（2026-09-30）

- 授权：用户于 2026-09-30 明确确认开始开发；仅按 ADR-002 完成 P0/P1 真实闭环，定向豁免记录在 `ui-gate-waivers.json`，不改变 feature `completion_status: incomplete` 与 `pixel_restore_status: blocked`。
- 入口：应用设置 → 指标管理 → 指标模板 → 编辑 → 添加指标维度；复用现有指标模板详情页，不新增路由或导航。
- 维度字段：`name`（去首尾空白，1–128 字符）、`description`（最多 2000 字符）、`need_weight`、`weight`（开关打开时必填，0–100 的百分数，关闭时为 null；存储于现有维度 JSONB，无需新迁移）、`metric_type_ids`（至少一个真实存在的指标类型 ID，去重）、`allow_reviewee_add_metrics`、`review_rule_mode`（`same | different`）、`review_rule_id`（same 模式必须为真实启用评估规则 ID）。未知字段拒绝。
- 请求：复用 `PATCH /api/v1/performance/templates/{template_id}`，模板必须为 `template_kind=metric`；请求体新增 `dimensions` 数组，最多 100 个维度。详情 `GET /api/v1/performance/templates/{template_id}?template_kind=metric` 返回同一数组。
- 存储：`performance_templates.dimensions` 使用 JSONB 保存维度配置；迁移 0250 依赖 0249，默认空数组，不修改既有模板业务数据。维度与模板更新审计在同一事务提交。
- 权限：复用 `require_performance_permission('performance.configuration.manage')`；无权限返回 403，资源不存在或模板类型不匹配返回 404，字段/规则引用不可用返回 422。
- UI：复用 `PerformanceDialogShell`（600px）、`PerformanceLocalizedInput`、`PerformanceTextField`、`PerformanceSwitch`、`PerformanceCheckbox`、`PerformanceRadioGroup`、`PerformanceAssessmentSelect`、`PerformanceButton` 和 `tokens.css`；字段顺序按 `D:\乐逗\Desktop\添加指标维度.txt`，不增加字段编码、复杂评分配置或人员选项。
- 状态：关闭/取消不写库；校验失败保留输入；保存中禁止重复提交与关闭；保存失败保留输入并显示服务端错误；保存成功关闭弹窗并在详情页回显，刷新/重开再次 GET 读取；指标类型与评估规则加载失败、空数据、403 均明确反馈。
- 规则边界：`same` 模式选择一个公共评估规则；`different` 仅保存模式，逐指标规则配置不在本次范围；不实现评分计算引擎、指标 CRUD、指标类型/评估规则 CRUD、周期快照修改、英文保存或 UCP。
- 采集边界：源文件为 `D:\乐逗\Desktop\添加指标维度.txt`，缺少完整 source_state/layout/interaction/rendered contract；P0/P1 按用户授权实施，P2 像素级验收保持 blocked。
- 被评估人添加指标展开配置（894×631 采集）：`allow_reviewee_add_metrics=true` 时，在开关下显示浅灰面板，依次为必填“添加指标的方式”（`library`=可选用指标库的指标，`library_or_custom`=可选用指标库的指标或添加自定义指标，采集状态默认后者）、必填“评分方式”（第一行固定“指标库的指标：以指标库设定的方式为准”；仅 `library_or_custom` 时第二行显示“非指标库的指标”，其下方对齐显示已选“手动评分”下拉，值 `manual`，其他候选待补证据）、“指标数量设置”复选“至少添加 1 条指标”（采集状态勾选）。配置保存为维度 JSONB 中的 `reviewee_add_method`、`reviewee_scoring_method`、`reviewee_min_one_metric`；关闭开关隐藏配置但保留之前选项供再次开启，业务运行侧暂不执行评分或数量约束。旧维度缺字段时按上述采集默认值回显，无需迁移；未知字段/非法枚举返回 422。
