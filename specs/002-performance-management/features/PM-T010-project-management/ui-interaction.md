# PM-T010 UI 交互契约

## 1. 页面结构

```text
项目管理页（/performance/project-management，复用 PerformanceLayout）
└─ 左侧 260px 侧栏（复用绩效评估侧栏框架）
   ├─ 顶部周期筛选下拉（cycle-picker，选项=涉及周期）
   ├─ 分隔线
   ├─ 分组「项目管理员」（可折叠/展开，箭头旋转动画）
   │  ├─ 周期概览（固定入口，首位）
   │  └─ 已启动且本人涉及的项目名称（动态，按名称排序）
   └─ 侧栏右缘收起柄（保留现有交互）
└─ 右侧内容整块
   └─ 周期概览
      ├─ PerformancePageTitle 标题「周期概览」（18px/600/32px 行高，truncate，flex-1）
      ├─ PerformanceLineTabs 页签条（sticky 吸顶）：总览(active) / 成员列表 / 矩阵分析 / 统计报表
      └─ pane 内容（本期空占位，待后续开发）
```

## 2. 组件复用边界

- 侧栏框架复用自绩效评估 `PerformanceReviewCategorySidebar` 的提取改造：筛选下拉 command、分组折叠（`aria-expanded`、箭头 `rotate(90deg)`→`0deg`）、菜单项 active/hover、收起柄均不重复实现；
- 差异仅通过 props 注入：分组数据（单一「项目管理员」组）、下拉选项数据源（周期而非项目）、是否渲染节点状态标签（项目管理子菜单**不显示**待完成/已完成标签）；
- 页面文件只做组装与状态持有，不写侧栏 UI 细节。

## 3. 周期概览页签条（PerformanceLineTabs，采集还原）

采集来源：飞书 perf management `all-projects/overview`，viewport 1534×911，2026-09-18。

| 项 | 采集值 |
| --- | --- |
| 结构 | `.ud__tabs`（sticky top:0、z-30、bg `#F2F3F5`）→ tab-bar-holder → wrap → overflow（flex wrap）→ tab 项 + ink 指示条；divider 绝对定位分隔线 |
| 页签 | 16px / line-height 24px；选中 `#1456F0` + 600 字重，未选中 `#1F2329` + 400；`margin-right: 28px`；`padding-bottom: 12px`；`max-width: 240px` 溢出省略 |
| ink 指示条 | 绝对定位、高 3px、宽=文字宽（总览 32px）、`top: 33px`、`z-index: 1`；`width/left 0.3s cubic-bezier(0.34,0.69,0.1,1)` 位移动画 |
| 分隔线 | 1px、`top: 35px`、`z-index: 0`、`rgba(31,35,41,0.15)`，被 ink 覆盖 |
| 容器节奏 | `padding: 12px 16px 0`、`margin: 0 -16px`（负外边距撑满内容区宽度） |
| 交互 | tab 颜色过渡 `0.1s linear`；sticky 吸顶于右侧滚动容器 |

组件化决定：

- 新建业务组件 `PerformanceLineTabs`（`components/performance/`）：line 型页签条唯一实现，`v-model` 驱动，props `tabs: {key,label,disabled?}[]`、`sticky`；ink 动画、分隔线、溢出省略内聚在组件内；
- 新建业务组件 `PerformancePageTitle`（`components/performance/`）：内容区主标题唯一实现（采集 `text-18`：18px/600/line-height 32px、`margin-right: 16px`、truncate、`flex-1`），`title` prop + default/actions 插槽；token `--performance-page-title-*`；绩效评估页 `review-heading` 已收敛到同一组件（deadline/状态徽标走插槽），旧 26px 行高/`rgba(0,0,0,.85)` 写法分叉一并消除；
- 采集 class 列表中的 `flex-1` 只属于标题文字（`.page-title-text`，行内水平撑满）；组件根元素不得带 flex grow——在 column 父容器中会纵向拉伸、把后续兄弟节点推到页面底部（2026-09-18 布局缺陷教训）；
- 容器节奏：跨模块与侧栏的间距统一走 `--performance-review-surface-inset`（20px，与绩效评估一致）；采集的 `padding: 12px 16px` 节奏仅用于 tabs 条内部（tab 间 28px、ink/divider 几何不变），`.line-tabs-holder` 负 margin 用 `calc(-1 * var(--performance-review-surface-inset))` 保证 tabs 条撑满全宽；
- token：新增 `--performance-line-tabs-ink: #1456f0`、`--performance-page-title-*` 专用 token，不复用 `--color-primary-hover`（语义错位）；顶导/填写页既有 `#3370ff` 指示线不动；
- 「更多」下拉不实现（用户确认无展开态需求）；pane 内容待后续任务。

## 4. 交互规则

- 周期下拉切换后，子菜单项目列表随 `cycle_id` 重新加载，默认选中「周期概览」；
- 「周期概览」永远可选，即使项目列表为空；
- 点击项目菜单项：选中态高亮，右侧切换到该项目的占位概览（本期与周期概览同为占位内容区）；
- 页签条：点击未选中 tab → v-model 更新 + ink 动画位移；disabled tab 不可点击；
- 无涉及周期时：侧栏下拉显示「暂无可管理的周期」，分组内仅「周期概览」，右侧显示空态提示；
- 加载中：下拉与菜单显示加载态文案；加载失败：右侧显示错误与「重新加载」，保留上次数据。

## 5. 视觉规则

- 侧栏宽度、配色、字号、间距与绩效评估侧栏完全一致（同组件）；
- 子菜单项不渲染状态徽标（`em.status-*`），分组图标复用现有「其他事项」类图标或统一人物图标；
- 页签条按第 3 节采集值还原，选中蓝走 `--performance-line-tabs-ink` token；
- 页面仅支持桌面端。

## 7. 组件提炼边界（PM-T010-T05）

本轮提炼只收敛交互组件，不提前实现角色数据权限或业务 API：

| 组件 | 层级 | 输入 | 输出/事件 | 业务边界 |
| --- | --- | --- | --- | --- |
| `PerformanceListToolbar` | 绩效域共享 | 搜索值、placeholder、筛选开关、扩展操作 slot | `update:keyword`、`search`、`clear`、`filter` | 只负责搜索/筛选/扩展操作布局，不加载业务数据 |
| `PerformanceColumnVisibilityDrawer` | 绩效域共享 | 列定义、锁定列、已选列 | `update:modelValue`、`confirm(keys)` | 只负责列选择和排序，不决定角色可见字段 |
| `ProjectMemberColumnDrawer` | 兼容适配层 | 成员列定义、已选列 | 转发通用列抽屉事件 | 保留旧引用，后续新页面使用通用组件 |
| `CompletionRatePanel` | 项目管理业务组件 | 完成率节点 | `action({ action, nodeKey })` | 只发出催办/开通意图，不调用 API |
| `AuthorizationManagementPanel` | 项目管理业务组件 | 授权卡片 | `view(item)` | 只发出查看意图，不判断授权范围 |
| `ProjectMemberListPanel` | 项目管理业务组件 | `projectId` | `filter`、`export`、`columns-change` | 组合通用工具栏和列抽屉，数据查询仍由面板负责 |

权限边界：通用组件不得根据角色名称、姓名或前端隐藏状态推断数据权限。后续 API 应返回页面/页签/资源级 capabilities，业务容器将能力映射为组件的 `visible`、`disabled` 和事件处理；后端仍是最终授权权威。

本轮未实现：HRBP 匹配、数据权限角色体系、筛选面板、成员导出、催办、结果开通和授权查看 API。

## 8. 统计报表框架（PM-T010-T06，2026-09-20）

completion_status: incomplete
pixel_restore_status: blocked
uncovered_reasons: 缺完整目标截图/状态产物、hover证据、真实统计API及像素对比；仅用户授权的mock预览。

### 来源与确认

用户在本会话提供 Desktop/统计报表.txt 的 SnapSpec 文本、白卡 HTML，以及浏览器只读脚本返回的布局、折叠、滚动和逐节加载结果。下面 SOURCE-* 是本地整理标识，不冒充采集器 session ID；原始完整证据尚未归档，机器 brief 见 extracted-ui-contract.json。用户确认根据已提炼参数实现，并允许模拟数据；随后明确授权本任务定向门禁豁免。正式像素实现 readiness 保持 blocked。

- SOURCE-REPORT-EXPANDED：1280×314 / DPR1.5，白卡972宽，内区930.67宽，正文694.67宽，右目录200宽，正文margin-right36。白卡padding 0 20px 20px，radius8，三层既有阴影，透明边框实测0.67px。
- SOURCE-REPORT-COLLAPSED：同视口，正文930.67宽且margin-right0，目录外框0宽；菜单及原折叠按钮卸载。展开柄32×24，left:-8/top:4，相对零宽目录锚点，外框18px 0 0 18px圆角并裁切。UpLeftOutlined SVG与展开态同path；折叠态不旋转，展开态按钮24×24、margin-left16、图标16×16且旋转180度。
- SOURCE-REPORT-NAV：3组9子项共12行，每行34；组标签14/400/#9CA2A9，子项14/400/#1F2329，选中14/600/#3370FF；子项比组缩进16。轨道4×408/#EFF0F1/radius2，选中条4×20，上下7px；菜单可用高度随视口变化，不写死72或669。
- SOURCE-REPORT-SCROLL：主滚动容器top56，滚动240/900后目录、筛选、一级标题top124，对应scrollport内68px。一级标题48高且sticky，二级40高且static。滚动900选中部门统计；点击部门统计scrollTop730、二级标题y163.67（测量结果而非固定跳转值）。九节均可随滚动选中。
- SOURCE-REPORT-TAIL：逐节访问后正文3931.67→5299，七个300px块分别变为584.67/309.67/584.67/419.67/535.33/498/535.33；说明内容动态撑高。前后正文末边=最后块末边，尾差0；一般块margin-bottom40，末块0。此前跨批次284.67px差值不是固定尾部留白。

### 组件树与所有权

ProjectManagement 只组装 ProjectStatisticsReportPanel（cycleId、cycleName）。Panel 复用 PerformanceSurfaceCard 无标题变体，持有 provider 数据状态及当前目录项；useProjectReportNavigation 管理外部滚动祖先、章节定位、滚动选中、ResizeObserver与卸载清理。ProjectReportNavigation 接收 items/activeKey，v-model:collapsed，发出 select；PerformanceIconButton 共用精确 UpLeftOutlined path。ProjectReportDistribution 仅绘制评级分布，ProjectReportMatrix 仅呈现部门分布，数据/类型/模拟provider放 projectStatisticsReport.ts。页面不维护统计计算。

### 本次 UI Implementation Brief

- 受众与风格：沿用用户指定的飞书绩效项目管理框架，项目管理员查看周期报表；白底、紧凑、专业，不重新设计品牌与导航。
- visible：三组章节“结果总览/统计详情/差异分析”；九项“绩效总览/部门统计/团队统计/序列统计/级别统计/司龄统计/自评 / 终评对比/绩效维度对比/历史绩效对比”；筛选入口；显式模拟说明；已采集结构的评级柱图及部门矩阵。
- forbidden：屏外的“更多”节点不显示；不编造真实统计请求、筛选弹层/字段、其他七节图表结构；不复制真实组织数据；不出现固定300/4257/5299高度或284.67尾部填充。
- 同行：一级标题与右侧筛选同一行，标题保留120px；目录在正文右侧。展开态筛选右边缘与正文右边缘齐平；折叠后预留21px。报表提示放首个正文内，不增加吸顶工具栏。
- mock展示：蓝色单系列柱图与表格为设计系统预览，不宣称采集柱色/轴线已还原；七个尚无内部契约章节显示预留说明。筛选/添加对比点击给出明确“尚未接入”反馈，并仅暴露动作事件，不伪造表单或结果。
- 折叠/展开：两个DOM变体共享图标，恢复时移动焦点到对应按钮；保留外溢空间。当前页签吸顶高度与来源不同，报表68px偏移按本项目实际scrollport复核，不写死viewport y124。
- 数据展示：模拟provider自洽合计，分母为已评级人数；表格零人数为--、零分母为0.0%；真实provider由父级显式注入，无请求失败自动回mock。
- 状态：加载、错误重试、无评级数据、模拟/真实来源；周期变化重新加载，旧响应不可覆盖新周期。页面原有入口授权不变。
- 本地滚动适配：management-content自带20px顶部内边距，实测直接top68会停靠在y144；useProjectReportNavigation读取scrollport padding-top，CSS使用68px减该内边距，顶部白底条使用56px减该内边距。复验scrollport y56时目录/筛选y124，定位计算仍按物理68px偏移。
- 运行时预览验证：1280×900、1280×314及894×631检查通过；展开/折叠+236px、章节滚动与选中、末尾0额外留白、短视口目录滚动、矩阵横向滚动、筛选入口反馈可见。详见 atomic-tasks.md T06。
- 截图：本目录 PM-T010-T06-report-expanded.png、PM-T010-T06-report-collapsed.png、PM-T010-T06-report-department.png、PM-T010-T06-report-short.png。均为模拟数据实现截图，目标截图diff未运行。
- 验收：组件正/反向断言、几何常量、滚动定位/尺寸变化清理、来源标识、合计口径、零态、替换provider与迟到响应。运行时/截图结果另记，不将测试通过称为像素通过。

### 部门统计修正与组件提炼（2026-09-20）

新增证据为本会话 SOURCE-DEPARTMENT-DEFAULT-1920（本地整理标识，1920×594 / DPR1）；默认态完整样式已提供，展开/排序后片段被消息截断，目标截图未提供。机器真源为 `extracted-ui-contract.json#/department_matrix_brief`，本轮不修改正式像素 readiness。

- 工具栏48px，选中“绩效评级”32px高、左右padding16、蓝色1px描边、6px圆角、14px/500/22px；不显示“人数占比 / 人数”额外提示或屏外“更多”。
- 表头区域56px（上边界1px+表头行55px），表头padding12；部门列240、评级列基准140、总人数列110；1334宽下最后评级列吸收4px剩余。数字与胶囊靠右，不把最后一列144px当评级固定语义。沿用Element Plus固定列和横向滚动，不增加第二套表格引擎。
- 数据行55px，值块54px覆盖整格、不留圆角小块；padding5px 12px，上占比下人数，均14px/400/22px且靠右。零人数为--，padding16px 12px。汇总行不额外加粗。表体上限440px，本地表格总上限为表头56+表体440=496px，不固定所有表的实际高度。
- 热力色阶：level1底#e1eaff/字#133c9a；level2底#bacefd/字#133c9a；level3底#82a7fc/白字。只使用provider显式heatLevels，不从稀疏百分比样本猜分档。未知等级中性显示，0人数不着色。文字对比度实测分别为8.14、6.23、2.36；level3白字保留采集样式，未通过普通文字4.5:1要求，不宣称完整可访问性验收通过。
- 用户后续确认：评级底色与绩效模板配置一致，优先于采集中的七个样本色。`ReportRating.color`为模板保存的等级配置色；提炼 `performanceColorOptions.ts#performanceLevelBackground`，与 `ReviewRuleConfigRenderer` 共用 `value→trigger` 映射，未知自定义色原样保留。当前mock只有示例模板颜色，并未读取真实周期模板。标签文字沿用本项目模板的#1f2329，不按评级名称配色。
- 新增 `PerformanceRatingTag(label,color)`：24px高、min-width44、左右padding10、全圆角、省略与title；仅展示、不排序、不请求。新 `PerformanceSortHeader(label,order)`：默认插槽可放标签、精确10px上下三角相叠3px、间隔8px，发出click，键盘语义由原生button提供；父表负责排序循环与aria-sort。
- 部门展开按钮复用 `PerformanceIconButton` 新增精确ExpandRightFilled path；按钮16px、padding3、左右margin10/4、SVG10px，展开调用Element Plus公开API。汇总/叶节点占位26px；未采集子层级沿用Element Plus默认16px缩进，不宣称额外层级像素匹配。
- 不扩大相邻模板页面改动：`ReviewRuleConfigRenderer`仅将既有底色转换函数改为共享引用，保留22px模板胶囊结构；不改变模板保存、工作流、权限或其他矩阵分析页签。
- 运行时复验：1920×594时表宽1334，列宽240/140/140/140/140/140/140/144/110；表头区域56、数据行55、数值块54、评级标签24、工具栏48、选中项90×32均与参数一致。部门展开及总人数升序可用，汇总固定首行且不加粗。1280宽横滚后左右固定列边缘偏差均为0。
- 表体上限采用496px整表上限加440px实际滚动层上限；1px上边界放在表头容器。隔离浏览器向mock对象注入20个测试部门后实测表体440px、整表496px，避免Element Plus计算表头时漏算边框造成441px表体。未改真实业务数据。
- 修正截图：`PM-T010-T06-department-corrected.png`、`PM-T010-T06-department-expanded.png`、`PM-T010-T06-department-scrolled.png`，均为本地真实前端路由下的模拟数据截图，不是目标截图或像素diff。

## 9. 矩阵分析（PM-T010-T07，2026-09-20）

completion_status: incomplete
pixel_restore_status: blocked
uncovered_reasons: 仅提供 SnapSpec 文本，缺少矩阵完整截图、before/after 状态、hover/resize 证据；本次限定授权只覆盖业务可用和结构还原，不代表像素验收通过。

### 业务口径

- 上方区域为「待完成评估」：没有最终绩效评级的项目成员，人数来自 `pending_count`。
- 下方区域为「已完成评估」：已经存在最终绩效评级的项目成员，人数来自 `completed_count`。
- 最终绩效评级只取绩效模板工作流节点中勾选 `include_final_result=true` 的评估型环节；流程提交完成但评级答案为空，仍属于待完成评估。
- 评级分布按职级 × 评级交叉展示；没有职级显示 `--`，离职人员保留快照中的离职标记。

### 采集到的结构投影

- 顶部范围条：当前范围「全部」及 `已完成人数/总人数`，保留「更多」和「筛选」的不可用外观；更多菜单与筛选弹层未采集，不实现虚构字段或动作。
- 待完成表：列为「职级」「被评估人」，多人姓名支持折叠/展开，空单元格显示 `--`。两张表的左侧职级列（表头和所有body行，包含`--`职级）统一使用已实现的 `#F5F6F7` 底色；已完成表左列继续固定，不把底色扩散到评级数据单元格。
- 已完成表：标题旁保留两个选择器，当前维度为「评估维度：绩效评级」，展示方式支持「人员姓名」和「人员数量」；列由本次绩效模板最终评级字段的全部选项驱动，保留模板顺序、label和配置颜色；行由本次参与绩效评估成员涉及的全部职级驱动，即使某职级没有已完成人员也保留该行，评级单元格显示 `--`；保留职级固定列和横向滚动。
- 姓名样式（2026-09-20用户追加并校正的 Span SnapSpec）：两组共用 `span.matrix-user-block`，不是原生按钮或胶囊。使用采集字体回退链、14px/400/22px、左对齐、`word-break: keep-all`、pointer；无按钮边框/底色/内边距。默认态文字为 `#1F2329`，用户确认所给 `#4E83FD` 参数属于 hover 状态，鼠标经过时才切换为蓝色。85×17px仅是示例姓名的实测bbox，不固定其他姓名宽高。保留API的display_name全文，不添加账号前缀或改写姓名。未确认focus/active颜色，不自行补造。PeopleCell为渲染函数子组件，内部姓名/列表/折叠按钮样式必须从其根节点使用局部deep选择器，避免父级scoped样式失效。
- 评级表头使用最终评级选项的 label/color；单元格无人员显示 `--`，姓名超过可视范围时显示展开入口。
- 白卡为矩阵页签内容的唯一外层容器，复用 `PerformanceSurfaceCard` 无标题变体；范围工具栏、待完成标题及表格、已完成标题/选择器及矩阵，以及加载/错误/空态都必须在其内部，禁止仅工具栏白底或把上下两块拆成独立白卡。沿用白色背景、8px圆角和共享三层阴影；矩阵局部使用 `padding: 0 20px 20px`、普通块布局，内容高度自然撑开，不固定为采集时的2178px。周期概览标题和页签导航仍保留在白卡外。
- 采集布局参考：卡片左右/底部 20px 内边距；工具栏约 72px；职级列约 100px；主矩阵评级列约 108px；正文 14px、模块标题 16px/600；多人单元格折叠高度约 156px。

### UI 所有权与非范围

`ProjectManagement.vue` 只负责页签切换和传递项目 ID；`ProjectPerformanceMatrix.vue` 负责矩阵加载状态、展示方式切换、人员分组表格和折叠状态；后端 `/matrix` 负责最终评级聚合、权限和人数口径。未采集的筛选、范围切换菜单、姓名详情跳转和移动端适配不在本任务范围。

