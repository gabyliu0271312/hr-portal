# PM-T017 指标库页面交互

## 已确认状态

| 状态 ID | 状态 | 来源 | 本轮处理 |
| --- | --- | --- | --- |
| `metric-library-title` | 页面标题“指标库” | 采集 HTML 结构 | 已实现 |
| `metric-library-header-actions` | 字段管理（14px 图标 +“字段管理”文字）与公式管理（14px SVG 图标 +“公式管理”文字，98×32px） | 字段管理与公式管理采集参数 | 已实现字段管理与公式管理文字按钮 |
| `metric-library-toolbar` | 新建、搜索、筛选、自定义列、多维表格编辑 | 采集 HTML 结构与交互摘要 | 已实现入口框架 |
| `metric-library-column-drawer` | 筛选旁的自定义列抽屉 | 复用前端成员列表列显隐组件 | 已接入 `ProjectMemberColumnDrawer`，标题为“自定义列” |
| `metric-library-empty` | “暂无内容”及辅助说明 | 采集 HTML 结构 | 已实现空状态 |
| `metric-library-surface` | 白色卡片、20px 内边距、8px 圆角、轻阴影 | 采集样式参数 | 已按全局 Token 对齐 |

## 页面结构

```text
指标库
├── 标题栏
│   ├── 标题
│   └── 字段入口 / 公式入口
└── 指标库内容卡片
    ├── 新建指标
    ├── 通过名称搜索
    ├── 筛选
    ├── 自定义列
    ├── 使用多维表格编辑
    └── 空状态
        ├── 暂无内容
        └── 指标库中的指标可以由管理员和被评估人在添加指标时选用
```

## 已实现的新建指标右侧抽屉（P0/P1）

- 入口：点击指标库工具栏“新建指标”打开 `PerformanceMetricCreateDrawer`。
- 共用外壳：`PerformanceDrawerShell`，宽度 `536px`，复用 `PerformanceDrawerFooter`；新建/编辑通过 `mode` 共用组件树。
- 分组：指标类型、指标设置、标签、可用范围。
- 指标设置字段：指标（必填）、权重（百分比后缀）、指标单位、目标值、完成值、评分方式（必填）。目标值和完成值默认“被评估人填写”。
- 标签：支持输入后回车生成多个标签并移除。
- 可用范围：允许管理员下发及被评估人选用指标 / 仅允许管理员下发指标。
- 底部操作：确定、确定并继续添加、取消；必填校验失败时保留抽屉并显示字段错误。
- 设计约束：颜色、字号、间距、边框、圆角、阴影均通过 `tokens.css`；“确定并继续添加”作为公共按钮变体复用，不在页面内复制按钮样式。
- 结构化输出：组件通过 `confirm` / `continue` 事件输出 `PerformanceMetricDraft`，当前页面不伪造指标行或调用不存在的绩效指标 API。

## 已实现的公式管理全屏弹层（P0/P1）

- 入口：指标库标题栏“公式管理”按钮；打开全屏弹层，返回动作复用 `FullScreenModal` / `PageHeader`。
- Header：标题为“评分公式管理”，复用全屏 Header 的返回按钮、分隔线、字号和 Token。
- 内容：复用 `PerformanceContentSurface` 的表面、`PerformanceButton`、`PerformanceSearchInput`、`PerformanceFilterButton` 和 `PerformanceManagementTable`；内容内边距为 24px，表面圆角为 8px。
- 工具栏：左侧为 14px 加号 +“新建评分公式”文字按钮；右侧为宽 222px 的“搜索”输入框和带“筛选”文字的筛选按钮。
- 表格列：名称（300px）、使用此公式的指标库指标（300px）、更新人（250px）、最近更新时间（446px）、操作（150px）。
- 空状态：复用指标模板的 `MetricTemplateEmptyIllustration`（250×125px）及“暂无数据”文案，不新增近似 SVG。
- 当前边界：新建、筛选、编辑动作仅输出结构化事件并由页面提示后续接入；不接入公式 API、不伪造公式行。

## 已实现的新建评分公式弹窗（P0/P1）

- 入口：评分公式管理全屏弹层的“新建评分公式”按钮；弹窗标题为“添加评分公式”，创建/编辑共用 `PerformanceMetricFormulaCreateDialog` 外壳。
- 表单：公式名称（必填）与公式编辑器（必填）；必填校验定位到对应字段，未接入保存 API 时仅发出结构化 `confirm` 事件。
- 编辑器：左侧为公式输入区，右侧为函数/字段/运算符 Tab、搜索框、资源列表与说明面板；函数列表按采集参数提供 `Int`、`Round`、`RoundUp`、`RoundDown`、`Ceiling`、`Floor`、`Max`、`Min`、`IsNull`，字段由 props 注入，缺少采集数据时保持空态；运算符默认仅包含采集到的 `+`、`-`、`*`、`/`、`==`、`!=`、`<`、`<=`、`and`、`or`、`if`、`then`、`else`（重复采集的 `/` 只显示一次），仍可通过 props 注入覆盖。函数与运算符复用同一 30px 资源行、蓝色 hover 底色/文字及右侧说明/示例容器；未采集运算符的说明/示例值不自行填充。
- 交互：资源项底色仅在 hover 时出现，点击插入后不保留底色；右侧上方展示函数名称/说明，下方用虚线分隔展示示例。仅悬停资源项时显示右侧说明与示例，移开即隐藏；示例结果行在三角图标前显示“返回值”。已采集的 `Int(数字)` 内容可在悬停时展示，其余函数详情后续补充；左侧编辑器提示文字使用系统字体、14px 与正文同色；不显示“更多”按钮。资源搜索复用 `PerformanceSearchInput` compact 变体，外框按 894×631 采集尺寸为 150×30px。关闭、取消、确认和帮助沿用共享组件事件。
- 视觉：复用 `PerformanceDialogShell`、`PerformanceFormItem`、`PerformanceTextField`、`PerformanceSearchInput`、`PerformanceButton` 与 `tokens.css`，弹窗宽度按采集参数使用 1000px；弹性布局在窄视口下上下堆叠。
- 当前边界：未接入评分公式 API、权限/审计、字段和运算符真实数据、编辑重开与运行时 rendered contract；P2 像素验收保持 blocked。

## 未采集、暂不实现状态

- 指标列表列定义与真实数据；
- 指标详情、编辑重开与真实保存接口；
- 字段/公式子页面内容；
- 筛选抽屉内容；
- 多维表格编辑授权与跳转地址；
- 评分方式的具体候选项（采集文件只覆盖“请选择”状态）；
- 查询、保存、失败、权限拒绝和加载状态的真实接口行为；
- 完整 capture contract、rendered contract 与截图 diff。

## PM-T017-T03 添加指标维度弹窗（2026-09-30 P0/P1）

- 入口：指标模板详情页“指标维度”卡片中的“+ 添加指标维度”；不新增路由。
- 容器：复用 `PerformanceDialogShell`，宽度 600px；标题“添加指标维度”；关闭图标、底部“确定/取消”复用共享壳与按钮。
- 字段顺序：
  1. “维度名称”必填，中文输入，复用 `PerformanceLocalizedInput`，placeholder 为“请输入中文维度名称”；
  2. “维度描述”可选，多行文本，中文标签与添加英文入口；
  3. “需设置维度权重”开关；打开时在该开关下方显示必填“维度权重”输入框，右侧固定 `%` 附件，输入外框 150×32px、附件 34×32px；关闭时隐藏输入框并清空权重；
  4. “可添加的指标类型”必填，复选项由真实指标类型 API 注入；
  5. “允许被评估人添加指标”开关；打开后紧跟浅灰背景、6px 圆角、12px 内边距的展开面板，依次展示“添加指标的方式”两项竖排单选（默认“可选用指标库的指标或添加自定义指标”）、“评分方式”下拉（仅已采集“手动评分”）、“指标数量设置”下“至少添加 1 条指标”复选（默认勾选）；关闭后隐藏面板，重新打开保留本次输入。评分方式第一行始终为蓝色圆点 +“指标库的指标：以指标库设定的方式为准”；仅添加方式为“可选用指标库的指标或添加自定义指标”时，显示第二行蓝色圆点 +“非指标库的指标”，其下方选择框与文字左边缘对齐（仅已采集“手动评分”）。切换为仅指标库时隐藏第二行及选择框；其他评分候选没有证据，不额外编造。
  6. “各指标的评估规则”必填，单选“使用相同规则/使用不同规则”；相同规则展示真实评估规则下拉框，placeholder“请选择评分或评级”，不同规则仅保存模式。
- 交互状态：空白名称、未选指标类型、相同规则未选评估规则时显示字段错误；保存中禁用输入/关闭/重复提交；失败保留输入；成功关闭弹窗并在详情卡片回显维度；取消不发送请求。
- 复用约束：使用 `PerformanceDialogShell`、`PerformanceLocalizedInput`、`PerformanceTextField`、`PerformanceFormItem`、`PerformanceSwitch`、`PerformanceCheckbox`、`PerformanceRadioGroup`、`PerformanceAssessmentSelect`、`PerformanceButton` 和 `tokens.css`，不复制基础组件样式。
- 组件职责：弹窗负责表单状态、校验和结构化 `confirm` 事件；详情页面负责加载指标类型/评估规则选项、调用模板 PATCH API、刷新模板状态；后端负责 ID、引用校验、权限、事务和审计。
- 采集与验收边界：`D:\乐逗\Desktop\添加指标维度.txt` 仅提供结构/样式参数，未提供完整 source_state、截图 diff 和 rendered contract；本轮按用户授权完成 P0/P1，P2 像素验收保持 blocked。


- 页面标题与内容表面共用 `PerformanceListPage`，与指标模板标题起点及内容卡片起点一致；辅助按钮通过 `title-actions` 插槽展示。
- 页面使用现有绩效后台布局，不新增独立导航或主题；
- 组件按钮、搜索框和间距使用全局组件/Token；
- 不添加复杂 SQL、指标计算引擎或虚拟指标数据；
- 空状态保留采集到的两段文案，不以营销式卡片替代。

## 采集完整性

- `completion_status: incomplete`
- `pixel_restore_status: blocked`
- 原因：当前采集证据覆盖空状态和工具栏结构，但未覆盖真实指标数据、弹层和业务操作状态。

## 指标模板新建弹窗（2026-09-29 局部采集）

- 采集参数：`D:\乐逗\Desktop\新建指标模板弹窗.txt`；目标页面 `/perf/admin/metrics-management/metrics-templates`，1534×911。
- 采集文件标记 `ud__modal__header/body/footer`，宽 600px；不将其推断为贴右抽屉。标题“新建指标模板”；名称（必填，提示“请输入名称”）、描述（提示“请输入”）均为满宽输入框，内部输入区域的采集尺寸为 550×30px，右侧保留“中文”标签；每个输入框下方为复用文字按钮“+ 添加英文”（不接入多语言）；“分人群设置指标内容”开关及说明；底部“确定”“取消”和关闭图标。
- 已接通真实保存：前端调用 `POST /api/v1/performance/templates`，保存名称、描述、中文语言、分人群设置开关、`template_kind=metric` 及默认计算规则状态；成功后跳转指标模板详情路由。
- 保存后详情页使用 `FullScreenModal`/`PageHeader`、复用的带图标“编辑”按钮、`PerformanceButton`、`PerformanceSurfaceCard`、`PerformanceRadioGroup` 和 `tokens.css`；展示基本信息、指标总分和指标维度三个采集区域。
- 基本信息编辑复用新建模板弹窗，标题切换为“编辑指标模板”；四种指标总分方式为“手动评估”“维度加和”“维度加权”“自定义公式”，通过模板保存接口持久化。指标维度入口显示“+ 添加指标维度”，明细配置仍未接入。
- “添加英文”、启用、通过导入更新、基本信息编辑和指标维度添加保留为未接入入口，不伪造业务结果。
- 本文件只提供局部 P0/P1 UI 依据：缺少原始状态截图、layout/computed、交互证据和 rendered contract，`completion_status: incomplete`、`pixel_restore_status: blocked`；不得据此勾选完整业务或像素验收任务。

## 已实现的字段管理全屏弹层（P0/P1）

- 入口：指标库标题栏“字段管理”按钮。
- 外壳：复用 `FullScreenModal`，不显示底部固定操作栏；返回动作复用 `PageHeader`，标题为“字段管理”。
- Tab：指标类型（默认激活） / 指标字段。
- 指标类型内容：24px 内容内边距、白色圆角内容面板；主按钮显示 14px 加号及“新建指标类型”；表格列为名称、指标字段、更新人、最近更新时间、操作。
- 采集示例行：定性指标；指标、权重、完成说明；更新人和最近更新时间为 `--`；操作为“编辑”和置灰“删除”。
- 分页：指标类型共 1 条、当前第 1 页、10 条/页；指标字段 Tab 展示独立的 7 条采集字段。
- 组件约束：Header、页面壳、按钮均复用现有组件；颜色、字体、间距、边框、圆角、阴影只消费 `tokens.css`。
- 当前边界：指标字段已由 PM-T017-T04 接入真实 API；指标类型的真实流程由独立任务维护，不属于 PM-T017-T04。

## 已实现的指标字段内容（P0/P1）

- 采集入口：字段管理全屏弹层的“指标字段”Tab，来源 `D:\\乐逗\\Desktop\\指标字段.txt`。
- 白色容器：复用 `PerformanceContentSurface variant="table"`，24px 内边距、8px 圆角、白色背景和全局阴影 Token。
- 工具栏：复用 `PerformanceListToolbar`；左侧为 `PerformanceCreateButton variant="wide-icon"` 的 14px 加号及“新建字段”文字按钮，右侧为 compact 搜索框和带“筛选”文字的公共筛选按钮。两枚新建按钮复用全局主色 Token `--performance-button-primary-background`（由 `--color-primary` 定义）、白字、32px 高、6px 圆角及 97px 最小宽度；文字较长时自然扩展，避免截断。
- 表格：新增业务组件 `PerformanceMetricFieldsTable`，内部复用 `PerformanceManagementTable`；固定 ID/名称左列和操作右列。
- 表格列：ID、名称、类型、更新人、最近更新时间、操作；采集示例共 7 条，包含指标、权重、指标单位、目标值、完成值、完成说明、指标评价人。
- 分页：复用 `PerformanceManagementTable` 内置分页，支持总数、上一页/下一页和每页条数。
- 操作：编辑、删除复用 `PerformanceButton variant="link"`；根据用户2026-09-30提供的预置字段禁用态参数，按钮按内容自适应宽度（两字28px）、22px高、14px/22px正文、400字重、6px圆角、透明背景、禁用光标展示，禁用文字使用全局 `--performance-button-link-disabled-color: #BBBFC4`，opacity=1，避免蓝色文字被透明度稀释。后端 `is_system` 透传为表格行 `isSystem`，预置7条无论父级 actionsDisabled 如何都禁止编辑/删除；其他行继续服从父级操作开关，本轮不接入自定义字段编辑/删除。新建和列表由 PM-T017-T04 接入真实 API，旧的7条前端默认fixture已移除，改由数据库内置定义查询。用户随后补充了禁用提示浮层参数，按下述悬浮提示契约补齐；P2全状态验收仍blocked。
- 预置字段悬浮提示契约（2026-09-30）：系统字段“编辑”悬浮文案采用采集原文“系统预置字段，不允许编辑”；“删除”按已确认的不可删除规则使用本项目对应文案“系统预置字段，不允许删除”（非本次采集原文）。仅 isSystem=true 显示这些原因，不将自定义字段暂未接入误解释为系统预置。
- 提示结构与样式：禁用按钮外使用可悬浮的兼容包装层，保持28×22px按钮尺寸/disabled属性；提示内容自然宽度202px（168px正文+左右16px内边距+两侧1px边框）、48px高（22px行高+上下12px内边距+两侧1px边框）；14px/400/22px、正文#1F2329、白底、#DEE0E3细边框、8px圆角和本次采集三层阴影，全部投影为共享Token。16×8px箭头使用用户提供的精确SVG路径，沿用共享提示组件的定位/窗口边界处理；优先上方，空间不足时避让，位置策略为P0/P1默认而非采集像素结论。
- 提示组件复用：PerformanceMetricFieldsTable → PerformanceDisabledReason(variant=popover) → PerformanceInfoPopover(variant=disabled-action,width=auto)。前者保留旧默认el-tooltip分支；后者保留默认信息图标、420px内容宽度及旧样式，仅新增默认触发插槽和禁用操作视觉变体。沿用现有Teleported定位/边界避让及精确16×8 SVG箭头，不复制SVG或定位算法；不同实例使用唯一aria-describedby ID。提示的背景、边框、圆角、内边距、行高、阴影及层级消费全局performance-popover Token。
- 提示交互：移入显示、移出关闭；键盘聚焦兼容包装层可读提示，失焦/Escape关闭；移入提示本身不导致无法阅读的闪退。提示不解锁按钮、不触发编辑/删除或网络写入；页面关闭/组件销毁后不残留浮层。
- 悬浮验收：35项相关测试及全量类型检查/构建通过；前端已在容器内重建替换。8080/Edge139/1534×911逐一核验14个提示，卡片202×48px、SVG16×8px、字体/内边距/边框/圆角/阴影与本次参数一致，14个按钮仍disabled且28×22px；0写请求、0页面异常。hover移出/提示内停留、focus/唯一描述ID/Escape、894×631边界避让与关闭字段管理后清理均通过。截图 `../../ui-blueprints/PM-T017-T04-system-field-edit-tooltip.png` 和 `../../ui-blueprints/PM-T017-T04-system-field-delete-tooltip.png` 已读取检查；完整P2仍不宣称通过。
- 设计约束：按钮、搜索框、筛选、白色容器、表格和分页不在页面内重复实现视觉样式。
- 预置禁用态验收（2026-09-30）：相关7组共27项组件/页面测试通过；容器Vite构建成功并更新8080。真实894×631页面逐一验证7条系统记录14个按钮，disabled、28×22px、#BBBFC4、14px/22px/400、6px圆角、opacity1及not-allowed均符合本次参数，点击未产生写请求。截图 `../../ui-blueprints/PM-T017-T04-system-field-disabled.png` 已读取检查。该次全量vue-tsc曾受并行指标维度测试fixture枚举类型错误阻塞；后续悬浮提示迭代已复核全量类型检查和构建通过，详见最新悬浮验收记录。

## PM-T017-T04 新建指标字段 UI Brief（P0/P1）

- 来源：`D:\乐逗\Desktop\新建字段.txt`，1534×911；TXT 无 source_state_id/原始截图，禁止伪造完整采集状态。P2 仍 blocked；仅当前任务经用户要求继续按 ADR-002 实现。
- 入口：字段管理 → 指标字段 → 新建字段；不新增路由和导航。
- 组件树：PerformanceMetricFieldManagementModal → PerformanceMetricFieldCreateDialog → PerformanceDialogShell + PerformanceLocalizedInput + PerformanceFormItem/PerformanceRadioGroup + PerformanceButton。列表继续使用 PerformanceMetricFieldsTable/PerformanceManagementTable；请求状态放 usePerformanceMetricFields。
- 容器：复用宽 600px 的 PerformanceDialogShell；名称/字段类型从上至下，标签与控件间距和弹窗 24px 内边距沿用 Token；原始标注整体 600×340px，仅作为参考，不固定高度裁剪错误提示。
- 可见元素：标题“新建字段”、关闭图标；“名称”必填，提示“请输入”，中文标签、“+ 添加英文”入口；“字段类型”必填；文本/数字/百分比，默认文本；页脚左取消、右确定。
- 文案确认（2026-09-30）：用户明确要求加号旁显示“添加英文”四字；直接使用 PerformanceLocalizedInput 默认文案，内部复用 PerformanceTextButton + AddOutlinedIcon，与现有指标模板保持一致。不增加英文输入或保存接口，点击仅提示“添加英文功能暂未接入”。
- 禁止元素：不增加字段编码、数据仓库列类型、描述、评分公式或人员选项；不把人员单选暴露为自定义类型。
- 同行关系：三种类型在桌面同行；取消/确定右对齐同行；中文标签属于输入框内部，不能独立漂浮。窄屏弹窗最大宽度由共享容器控制。
- 组件职责：弹窗壳管理遮罩/标题/关闭；LocalizedInput 管中文输入/加号/边框及错误状态（新增可选的禁用、maxlength、加语言按钮文案属性，不改变原调用默认值）；RadioGroup 管选择和禁用；业务弹窗只校验并发出 confirm，父级负责真实保存。
- 交互：空白名称提示“请输入名称”，名称最多 128 字符（本项目 API 限制，非采集声称）；保存中禁止输入、关闭和重复提交；保存失败保留名称/类型，显示服务端错误；取消/关闭不发送请求，下次打开重置；加号提示英文功能未接入，不假保存。
- 列表：字段 Tab 改为真实 GET，移除默认七条 fixture，七条内置字段由迁移写入数据库；加载、空态、查询失败重试与 403 分别反馈。按用户最新要求，服务端按ID升序后分页，预置完成说明为6、指标评价人为7；保存成功后清空搜索，读取总数并定位最后一页，使新增字段在升序列表末尾可见，不在前端逆序插入。重新进入/刷新再次查询。
- 编号与排序验收（2026-09-30）：0251真实迁移后预置字段显示1–7，6为完成说明、7为指标评价人；按ID升序分页，新增按自增ID排末尾，超过10条自动定位末页，末页加载失败保留已保存状态并可重试。后端27项、前端37项及全量构建通过；8080浏览器连续新增4条达到11条后定位第2页，刷新/翻页/独立GET回读顺序一致，页面异常0，验收数据已清理且未回拨序列。截图 `../../ui-blueprints/PM-T017-T04-field-id-ascending.png`、`../../ui-blueprints/PM-T017-T04-field-created-last-page.png` 已读取检查。指标类型字段引用同步保序迁移，不改模板维度类型ID或历史审计；升序不保证新建编号无间断。
- 设计层：颜色/字体/边框/圆角/按钮/留白消费 tokens.css；本任务不覆盖共享控件的基础视觉，不新增第二套 Token。系统类型中文标签集中映射，更新时间按现有绩效日期格式展示。
- 验收：已完成 visible 结构、API 三种类型创建/列表回读、空名校验及刷新重开。实际视口1534×911、DPR1、Edge139，弹窗 bbox={x:467,y:288,width:600,height:335}，按钮和三类单选同排、无裁切；截图 `../../ui-blueprints/PM-T017-T04-metric-field-create.png` 与 `../../ui-blueprints/PM-T017-T04-metric-field-saved.png` 已读取检查，页面异常0。像素差异未运行：缺原始截图，P2 blocked。
- 自动化结果：补齐“添加英文”文案后，字段弹窗5项、字段管理7项、共享指标模板弹窗5项、指标库页面1项，共18项通过；新增用例确认共享文字按钮含加号图标，点击仅提示、不新增输入框、不触发保存或关闭。后端字段专项19项真实PostgreSQL测试通过；类型检查和构建通过。模板扩展回归出现1项既有校准执行人归一化断言失败，不在本任务改动内（详见任务证据）。

## PM-T017-T05 新建指标类型 UI Brief（P0/P1）

- 采集来源：`D:\乐逗\Desktop\新建指标类型.txt` 当前为空；因此仅根据已确认字段管理表格、`新建字段.txt` 的共享弹窗参数和现有组件契约实现 P0/P1，不声明 P2 像素一致。
- 入口：字段管理 → 指标类型 → 新建指标类型；不新增路由和导航。表格创建成功后关闭弹窗、清空搜索并回第一页，从真实 GET 回读新行。
- 组件树：`PerformanceMetricFieldManagementModal` → `PerformanceMetricTypeCreateDialog` → `PerformanceDialogShell` + `PerformanceTextField` + `PerformanceFormItem` + `PerformanceSortableList` + `PerformanceMetricFieldRow` + `PerformanceDragHandle` + `PerformanceMetricFieldIcon` + `PerformanceButton`。`PerformanceMetricFieldRow` 同时渲染固定字段和可排序字段，统一宽度、34px 高度、垂直居中和间距；`PerformanceMetricFieldIcon` 以真实 `field_type` 统一映射文本、数字、百分比、人员评价人四类 SVG，后续新增字段沿用该映射组件，不在弹窗内复制图标。
- 表单：名称必填，最大 128 字符；指标字段标签下显示说明文案“选择该类型所需填写的字段”（14px、#8F959E、22px 行高），不显示“拖拽字段调整顺序”提示；指标字段以真实字段 API 返回的已选拖拽行呈现，不显示勾选框；固定字段行与可排序字段行均使用采集到的浅色底、4px 圆角、6px 8px 内边距；可排序行间距 8px，并提供“移除”和复用 `PerformanceTextButton` + `AddOutlinedIcon` 的底部“选择字段”入口（左加号、右文字）；点击后打开白色选择字段弹窗，复用 `PerformanceCheckbox` 展示真实字段列表，底部提供“新建字段/取消/确定”；“新建字段”打开指标字段 Tab 已接入的 `PerformanceMetricFieldCreateDialog`，保存成功后刷新字段接口并回显新字段；字段顺序通过拖拽手柄调整，并随 POST/PATCH 的 `field_ids` 保存。
- 状态：默认、校验失败、保存中、保存失败、列表加载、列表空态、403、加载失败重试；保存中禁止关闭、输入、重复提交；失败保留表单输入；取消不发请求。
- 复用约束：弹窗容器、文本框、复选框、拖拽手柄/排序行为和按钮均复用现有共享组件，颜色、字号、间距、边框、圆角、阴影只消费 `tokens.css`；不得在页面内复制拖拽算法或 SVG。
- 响应式：继承共享弹窗 `max-width: calc(100vw - 32px)`，字段列表在窄屏纵向收缩，不引入固定最小宽度或横向页面滚动。
- 未覆盖：原始截图、hover/dragging 几何、rendered contract、真实浏览器保存重开；统一记为 `not-run/blocked`，不得勾选 P2。
