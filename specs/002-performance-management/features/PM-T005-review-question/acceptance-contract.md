# PM-T005 像素验收契约

> 本契约验收页面结构、视觉、交互状态以及评估规则数据关系和保存请求设计；不在本轮执行正式环境保存或提交，不验收普通题/子题过滤逻辑。普通评估题评级长代号的结构、颜色和空值语义可由单元测试验证，真实列宽与像素位置在 rendered contract 和截图 diff 前保持 `not-run`。

## Given / When / Then

### AC-01 全屏页面外壳

Given 用户在评估题列表页打开“新建评估题”
When 页面进入目标 create route
Then 应渲染 `1920x1080`、`position: fixed`、`z-index:100` 的 full-screen shell，header 高度为 `56px`，不得出现 640px dialog。

### AC-02 页面结构

Given 默认新建态已加载
When 对照目标截图
Then 页面必须包含 header、基本信息卡、评估规则卡、备注信息卡和底部固定操作栏，顺序不可改变。

### AC-03 字段契约

Given 默认新建态
When 检查字段
Then 字段顺序、label、placeholder、计数器和控件类型必须与 `component-model.md` 一致；未采集的评估规则选项不得自行补造。

### AC-04 像素契约

Given 视口为 `1920x1080`
When 运行截图对比
Then 所有已确认几何/样式必须匹配 `pixel-contract.md`；未提取的参数必须报告 `blocked`，不能以近似值通过。

### AC-05 状态覆盖

Given 页面存在可交互控件
When 依次执行 hover、focus、checked、expanded、disabled（适用时）
Then 每个状态必须有对应截图、layout、computed、interaction evidence 和 `source_state_ids`；缺失时验收结果为 `not-run` 或 `blocked`。

## Evidence result

```text
completion_status: incomplete
pixel_restore_status: blocked
uncovered_reasons:
- real disabled-state evidence was not observed; treat as N/A/not observed, never guess
- all five after-click states are bound to standalone contracts (`190403_023043`, `190550_626183`, `190736_735382`, `190921_581205`, `191106_099217`); the ten-session active evidence set is listed in `capture-manifest.md`
- card padding, shadow tokens, label line-height, checkbox/radio styles, footer bbox and the exposed SVG path registry are extracted; `ErrorFilled` remains unresolved because no real source instance was observed
- all 10 current sessions and 35 after-state directories pass strict JSON/layout validation with no `NaN`/Infinity
- back-action keyboard focus is not applicable because the source DOM is a non-focusable div
- current `target_contract.json`, layout, interaction and computed artifacts all parse; historical NaN sessions are retired from the active contract
- reviewRule options and expanded overlay geometry are captured
- 2026-08-30 最新真实菜单采集覆盖 7 个目标状态：普通题 4 类、子题 3 类；每类包含首屏、滚动后和选择后证据，共 21 个机器状态
- `session:phase` qualified source-state aliases and all 21 latest evidence states are listed in `capture-manifest.md`、`state-matrix.md` and `extracted-ui-contract.json`
- `rule_id` / latest-rule-read / create-question payload design is frozen in `api-contract.md`; actual POST evidence is `not-run`
```

## AC-06 规则来源与唯一关系

Given：正式环境评估规则列表和新建评估题下拉均显示目标规则
When：比较规则列表行标识和下拉选项标识
Then：列表 `data-row-key` 与选项 `data-cy` 一致；下拉 `label` 使用规则名称，后续实现的 `value` 使用唯一 `rule_id`，不得使用名称、类型或顺序

## AC-07 子评估题规则变体

Given：用户从评估题列表进入新建子评估题
When：分别选择评级关闭、评级打开、分数上线限输入、固定分值选项四条规则
Then：每个选择都进入对应的评估规则模块变体，并分别匹配 `state-matrix.md` 中的 source state 和目标截图

## AC-08 普通评估题规则变体

Given：用户从评估题列表进入新建评估题
When：分别选择四条评分/评级规则及测试--评分映射等级型
Then：每个选择都进入对应的评估规则模块变体；本次不增加普通题/子题差异化过滤参数

## AC-09 保存请求设计

Given：用户填写合法评估题并选择一个已有规则
When：后续实现提交接口
Then：请求使用 `rule_id`、`is_sub_question` 和 `parent_question_id` 表达关联，不提交规则名称作为关联键；本轮未执行真实保存，请求验证结果为 `not-run`

## AC-10 规则更新后的最新读取

Given：评估题仅保存 `rule_id`，关联规则配置后来发生变化
When：重新打开或读取评估题
Then：按照同一 `rule_id` 读取最新规则名称、类型和配置；不读取版本号或评估题内配置快照；规则不可用时显示明确错误，不静默切换

## AC-11 下拉展开与选择后文案

Given：评估规则下拉包含规则名称和类型/配置摘要
When：打开下拉
Then：每个 option 使用两行布局，列表容器按 `x=581,y=605,width=758.66,height=245.33` 约束呈现，文字不能与相邻 option 重叠

Given：用户已选择任意评估规则
When：下拉收起
Then：trigger 只显示选中规则名称单行；不得显示 option 的第二行摘要，selected item 遵循 `height=28px`、`line-height=28px`、`white-space=nowrap`

## AC-12 夹具名称不驱动模块

Given：API 返回一个名称未出现在采集样例中的规则，但 `review_type/config` 与某已采集变体相同
When：普通题或子题选择该规则
Then：页面按 `entry_mode + review_type + config` 渲染对应共享组件变体；不得依赖规则名称包含“测试评级”或“测试评分”

Given：同一 `rule_id` 的名称被修改但类型与配置不变
When：重新打开评估题
Then：下拉展示最新名称，选择后模块结构保持对应语义变体

## AC-13 评分上下限紧凑展示

Given：用户选择评估类型为「评分」且评分方式为「在分数上下限内输入评分」的评估规则
When：规则详情加载完成
Then：普通评估题与子评估题必须渲染同一个 `ScoreRangeSummary` 组件；评估规则卡只显示「评分上下限」及其摘要；分数下限、连接符 `-`、分数上限和小数位规则必须在同一行展示；不得显示「评分配置」标题、独立「评分方式」行或独立「精度」行

Given：用户从普通评估题入口选择该规则
When：页面完成规则模块渲染
Then：规则卡保持上述紧凑展示，并在规则卡外保留采集目标中的独立「评估方式」卡

Given：用户从子评估题入口选择该规则
When：页面完成规则模块渲染
Then：除规则卡的紧凑展示外，不显示「评估方式」或「展示方式」额外卡片

证据：`20260830-210157:base`、`20260830-213631:base` 的 `score-range` 选择后截图及对应 target contract。

```text
structure: `ScoreRangeSummary` 已由普通评估题/子评估题共同调用；focused component tests passed；rendered implementation not-run
layout: target single-line summary captured; rendered geometry not-run
visual: target text, separator and inline precision captured; rendered screenshot diff not-run
behavior: rule selection captured; runtime latest-read not-run
pixel: blocked by existing textarea resize evidence and pending rendered screenshot diff
```

```text
structure: captured for 21 latest states
layout: captured; schema_version 2 machine-contract projection completed for 21 states
visual: captured target artifacts; rendered implementation not-run
behavior: selection states captured; latest-read and POST not-run
pixel: blocked by unobserved historical textarea resize after-drag evidence and pending rendered screenshot diff
api: design confirmed; runtime request evidence not-run
filtering: not-in-scope; future task
```

## AC-14 固定分值共享组件

Given：用户从普通评估题或子评估题入口选择 `review_type=评分` 且 `config_discriminator=score_method_fixed_options` 的规则
When：页面完成规则详情加载
Then：两个入口必须渲染同一个 `FixedScoreOptionsSummary`；规则卡动态区域只显示「分值选项」和固定分值标签，不得显示「评分配置」「评分方式」「精度」。普通评估题适用的评估方式/展示方式卡保留在共享组件之外，子评估题不显示附加卡片。视觉真源为 `20260830_211313_909144:score-fixed` 对应 `step_18/after/after.png`。

验证状态：共享组件结构和双入口 DOM 等价性测试已通过；真实浏览器 rendered contract 与截图 diff `not-run`。

## AC-15 固定分值标签内容自适应

Given：固定分值选项同时包含短值和较长值
When：渲染分值列表
Then：每个标签按自身文本内容自适应宽度，最小宽度为 `46px`；不得将所有标签设置成统一固定宽度。标签高度为 `21px`，水平 padding 为 `8px`，圆角为 `1000px`，无边框，背景为 `rgb(225,234,255)`，文字为 `rgb(12,41,110)`。

## AC-16 固定分值列表换行与卡片收口

Given：固定分值标签总宽度超过规则卡片内容区约 `758.67px`
When：页面渲染多个固定分值选项
Then：列表在内容区内自动换行，标签不能突破白色规则卡片；卡片高度随换行后的实际内容增长。验收同时检查标签自身 bbox、列表左右边界、卡片 bottom 与最后一行标签 bottom 的 inset。

## AC-17 评级规则开关驱动的量化分展示

Given：普通评估题选择 `review_type=评级` 的评估规则
When：按 `rule_id` 加载最新规则详情
Then：页面使用 `grade_participates_in_calculation` / `gradeParticipatesInCalculation` 决定是否显示「量化分」列；不得通过等级对象中是否存在 `quantifiedScore` 字段推断开关状态

Given：所选评级规则的「评级可参与计算」关闭
When：规则详情加载完成
Then：不显示「量化分」列，不显示「隐藏等级量化分」

Given：所选评级规则的「评级可参与计算」开启
When：规则详情加载完成
Then：显示「量化分」列，并按规则配置中的 `hide_grade_quantified_score` / `hideGradeQuantifiedScore` 展示「隐藏等级量化分」当前状态；该项只读，不属于评估题保存字段

## AC-18 评级方式布局

Given：普通评估题选择评级规则
When：评估方式卡完成渲染
Then：「评级方式」字段 label 与单选组上下排列；单选组目标约为 `434×22px`，选项间距按目标 `24px` 列间距与 `8px` 行间距，不能使用 `112px` label 列横向并排布局

## AC-19 选项样式卡片结构

Given：评级规则详情已加载
When：展示方式卡完成渲染
Then：两个选项卡片均为 `368×125px`，横向间距 `16px`；每张卡片包含 `59.33px` 的标题/单选区和 `65.67px` 的预览区；标签样式预览固定显示采集到的 `C/B/A/S` 示例，下拉样式预览显示等级下拉样式
And：评级和固定分值评分必须挂载同一个 `ReviewQuestionDisplayMethodCard`，使用同一组件树、同一固定 CBAS SVG 与同一下拉预览；不得按 `ruleType` 分叉成动态 fixedOptions 标签预览或复制 DOM/CSS

Given：评级可参与计算关闭
When：展示方式卡完成渲染
Then：卡片高度约为 `800×263px`，不显示「隐藏等级量化分」

Given：评级可参与计算开启
When：展示方式卡完成渲染
Then：按规则详情的隐藏量化分配置初始化已有 `PerformanceSwitch`；用户可操作本地预留状态，不得使用 checkbox；切换不写入评估题 payload、不写回评估规则；卡片高度约为 `800×325px`

## AC-19A 普通评估题评级长代号表格

Given：普通评估题选择评级规则，等级列表同时包含短代号、长代号、空等级名称和固定色板颜色
When：规则详情加载完成并渲染「配置等级描述」
Then：

- 等级代号列从最小 `70px` 按最宽代号增长，最大 `132px`；表头和所有数据行共享同一列轨道；
- 代号列增长时，等级名称、量化分（若有）和等级描述列同步右移并保持纵向对齐；
- 每个代号底框按自身内容自然宽度渲染，最大 `132px`；超过最大宽度的文本在底框内部显示 `...`，不得溢出到底框外或覆盖下一列；
- 底框背景等于 `levels[].color` 在 `PERFORMANCE_LEVEL_COLORS` 中对应的 `trigger` 色；不得直接使用色板原始 `value` 作为背景；
- 空等级名称显示 `--`，不得显示 `—`；
- `rating-off` 不出现量化分列，`rating-on` 插入70px量化分列，但以上代号列规则保持不变。

And：子评估题仍使用只读评级档位导航，不受本验收项影响。

验证层级：结构、颜色和空值语义由聚焦单元测试验证；共享列宽、132px封顶和像素位置需由真实浏览器 rendered contract 与截图 diff 验证，未运行前不得标记 pixel passed。

## AC-20 子评估题评级档位结构隔离

Given：新建或编辑子评估题选择 `review_type=评级` 的规则  
When：规则详情加载完成  
Then：渲染「评级档位」只读导航，组件树包含 viewport、clip layer、scroll layer、track、档位胶囊和连接线  
And：不得渲染普通评估题的「配置等级描述」、评估方式或展示方式  
And：普通评估题选择同一规则时仍渲染「配置等级描述」及适用的附加卡片。

## AC-21 评级档位内容自适应

Given：子评估题评级规则包含长短不一的等级代号  
When：渲染评级档位  
Then：每个胶囊使用 `width:max-content`、`min-width:42px`、`height:32px`、`padding:6px 12px`、`flex:0 0 auto`  
And：胶囊为白底、`0.666667px rgb(208,211,214)` 边框、`9999px` 圆角、`rgb(100,106,115)` 文字和14/600/18字体  
And：不得把所有胶囊设置为统一固定宽度或截断文字。

## AC-22 评级档位溢出与只读右箭头

Given：10个档位和9条连接线的track内容宽2442px，viewport内容宽758.667px  
When：`scrollWidth > clientWidth`  
Then：viewport保持约 `758.667×38px` 并裁切1683px横向溢出  
And：连接线收缩至最小12px、最大仍为88px，连接线数量始终为档位数减一  
And：右侧显示灰色 `RightOutlined` 和遮罩，不显示左箭头  
And：点击、聚焦、键盘或滚轮均不得改变track offset、不得发送next/previous事件  
And：页面和ReviewRuleCard不得产生横向溢出。

## AC-23 评级规则卡自然收口

Given：子评估题评级档位字段高68px且底部margin为20px  
When：规则卡完成渲染  
Then：800px规则卡高度由内容自然计算，目标长档位状态约为232px  
And：卡片左右内容 inset 约20.667px，字段宽等于内容区约758.667px  
And：不得使用固定342px评级卡高度裁剪内容，也不得给整个规则卡设置overflow hidden。

证据：`rating-tier-overflow-capture-contract.json`，source state `20260831-manual:sub-question-rating-overflow`。运行时 rendered contract 与截图diff未执行前，结构/布局/视觉/行为可分别报告，pixel保持 `not-run/blocked`。

## AC-24 选项样式切换不得滚动页面根容器

Given：用户已滚动到普通评估题的「选项样式」区域
When：点击「标签样式」或「下拉样式」卡片
Then：只更新本地选中态，不触发隐藏 radio 的 label 默认聚焦滚动；`.full-screen-modal.scrollTop` 必须保持 `0`，唯一可滚动容器为 `.full-screen-modal-content`
And：`.full-screen-modal` 使用 `overflow:clip`，footer 的 `bottom` 始终等于 viewport 高度，`viewportBottomGap=0`
And：点击前后 EvaluationMethodCard、DisplayMethodCard、RemarkCard 和 footer 高度保持不变，不产生额外底部空白。

## AC-25 类型变更清空评估规则

Given：新建评估题或新建子评估题已选择评估规则并渲染下方动态配置  
When：用户在基本信息中切换「类型」选项  
Then：立即清空已选择的 `rule_id`、当前评估规则配置和所有依赖已选规则的下方动态内容  
And：评估规则恢复为未选择状态，用户必须重新选择评估规则后才重新加载配置  
And：新建评估题和新建子评估题均满足该行为；普通评估题/子评估题原有规则变体在重新选择后保持不变  
And：切换类型不能使切换前正在返回的旧规则详情重新出现在页面上。

## AC-26 评分映射等级型摘要

Given：普通评估题选择 `review_type=评分映射等级型` 且详情包含评分边界、区间和等级映射
When：规则详情加载完成
Then：渲染唯一 `ScoreMappingSummary`，依次显示「按分数子区间匹配等级」、四列表头、映射行和底部共享 `ScoreRangeSummary`
And：表头为「评分上下限 / 等级代号 / 等级名称 / 等级描述」；每行保持同一行且列宽为 `180/70/70/minmax(0,1fr)`、列间距 `8px`
And：区间表达式按规则和行位置派生，最后一行右边界闭合；等级代号使用目标彩色胶囊，空名称显示 `--`，描述使用32px输入框
And：底部显示 `minimum - maximum，precision`；不得显示「区间关系」独立行、`lower ～ upper`、`code - name`、通用 `.score-config-row` 或 `.mapping-interval-row`
And：目标 ReviewRuleCard 为 `800×466.67px`；运行时 rendered contract 和截图 diff 未完成前 pixel 保持 `not-run/blocked`。

## AC-27 评估题与评估规则列表共用表格外壳

Given：用户打开评估题列表或评估规则列表
When：表格、空态/加载态和分页完成渲染
Then：两者使用同一 `PerformanceManagementTable` 外壳、六列比例、表头样式和分页结构；评估题第二列显示 `questionTypeLabel(row.type)` 的「类型」，不得显示「评估方式」或读取新的接口字段


```text
structure: implemented；子评估题评级分支使用共享 PerformanceOptionNavigator，普通评估题仍使用配置等级描述
layout: fluid viewport / nowrap track / max-content pill / bounded connector implemented；浏览器 rendered bbox not-run
visual: white pill / gray border / RightOutlined mask implemented；screenshot diff not-run
behavior: read-only next indicator、no left arrow、track offset remains 0 covered by focused tests
focused tests: 27 passed
frontend build: passed
runtime app acceptance: blocked；本地 backend 127.0.0.1:8000 未启动，Vite proxy ECONNREFUSED
pixel: blocked；不得宣称像素验收通过
```

本次定向门禁豁免只允许 PM-T005-T04 的子评估题评级档位实现启动；不改变全功能状态，也不作为 T00/T03 或 textarea resize 的完成证据。

## AC-27A 普通评估题评级方式动态分支

Given：`entry_mode=regular_question`、类型为「常规评估项」，并选择 `grade_participates_in_calculation=true` 的评级规则
When：依次选择「直接评级」「通过子评估项评级」「作为总分项计算评级」
Then：页面按 `extracted-ui-contract.json` 中对应 `variant_key` 渲染，评级方式选中态、展示区域和规则卡高度必须匹配各自 source state
And：三种方式不能用规则名称、选项索引或通用静态模板判断
And：「直接评级」与「作为总分项计算评级」不得显示「计算规则」和「子评估题」结构

证据：`20260831_194405_608420:rating-method-direct`、`20260831_194405_608420:rating-method-sub-items`、`20260831_194405_608420:rating-method-total-score`。

## AC-28A 子评估项评级计算规则

Given：评级方式为「通过子评估项评级」
When：分别选择「不设置规则」和「按条件计算」
Then：两种状态均显示计算规则单选组和子评估题区域，选中态分别匹配 `regular-rating-on-sub-items-none` 与 `regular-rating-on-sub-items-condition`
And：本次未观察到独立 `condition-editor`，实现不得自行新增条件编辑器
And：直接评级与总分项评级状态中，计算规则组件必须保持 forbidden

证据：`20260831_200737_944606:sub-items-calc-none`、`...:sub-items-calc-condition`。

## AC-29A 增量状态证据和空间关系

Given：任一新增动态分支状态
When：读取其 target contract、layout、computed、screenshot 和 interaction evidence
Then：必须使用同一 `source_state_id` 的完整证据，校验 component root、first/terminal visible child、四边 inset、同行关系和可见/禁止元素
And：不得用旧 `rating-on` 基础状态或相邻入口状态补写新增分支的 geometry/style

## AC-29B 评估项填写和查看顺序默认结构

Given：普通评估题选择评级开启规则，并将评级方式切换为「通过子评估项评级」
When：填写和查看顺序区域完成默认渲染
Then：区域顶部显示「评估项的填写和查看顺序」，字体为 `14px/600/22px`
And：「填写顺序」「查看顺序」字体均为 `14px/400/22px`，不得加粗
And：两个子标题 bottom 到四张选项卡 top 的间距为 `8px`
And：四张卡片均为 `180×134px`，同列卡片间距 `8px`，左右列间距 `16px`
And：卡片预览使用 `138×56px` SVG；主灰条为 `138×20px`，两条次级灰条为 `100×12px`
And：「总项」文字使用采集到的 `#1F2329` SVG path，并完整位于主灰条内部，不得溢出或被 8px 通用灰条替代。

证据：`idreamsky.feishu.cn_20260831_194405_608420:rating-method-sub-items` 对应 `step_23/after` 的 HTML、layout、computed、target contract 和截图。

## AC-29C 评级方式卡动态收口

Given：分别进入 direct、sub_items + none、sub_items + condition 状态
When：评估方式卡完成自然布局
Then：卡片 bottom 与当前 terminal visible child bottom 的差值均为 `21px±1px`
And：不得由字段 margin-bottom 与卡片 padding-bottom 双重制造空白，不得让 terminal child 贴住卡片底边
And：当 terminal gap 由末尾 `margin-bottom` 提供时，卡片必须建立 BFC，margin 不得折叠到卡片外；截图中 `21px±1px` 必须处于白色卡片内部。

## AC-29D 不设置规则的整行拖拽

Given：评级方式为「通过子评估项评级」且计算规则为「不设置规则」
When：渲染或操作子评估题列表
Then：每行使用 `PerformanceSortableList` 的 sortable row 和 `PerformanceDragHandle` 的真实 `DragOutlined`
And：从手柄启动后移动整行，支持 pointer 和键盘拖拽、placeholder、reorder、取消和焦点恢复
And：不得使用 `⁝⁝`、文字字形或页面私有拖拽实现替代公共组件。

## AC-29E 按条件计算两列结构

Given：评级方式为「通过子评估项评级」
When：计算规则切换为「按条件计算」
Then：每行只显示「子评估题名称」和「评估规则」两列，目标宽度分别为 `493px`、`257px`
And：不得显示 `DragOutlined`、评分上下限、删除按钮或新建子评估题按钮
And：切回「不设置规则」后恢复拖拽、三列数据、删除和新建入口。

## AC-29F 评分评估方式公共组件

Given：普通评估题分别选择 score-range、score-fixed、score-mapping 规则
When：评估方式卡完成渲染
Then：三者均复用 `ReviewQuestionScoringMethodCard -> ReviewQuestionMethodSelector -> PerformanceRadioGroup`
And：score-range 与 score-mapping 显示三个评分选项且每项都有公共 InfoOutlined
And：score-fixed 仅显示「直接评分」且有一个公共 InfoOutlined
And：字段 label 均为「评分方式」，模块标题均为「评估方式」
And：所有评分选项使用 `cursor:pointer` 手型，与评级选项交互反馈一致
And：卡片均为 `800×134px` 且白色卡片内 terminal gap 为 `21px±1px`
And：评级方式现有选项与提示图标规则不得变化。

## AC-29G 展示方式手型和单一外框

Given：展示方式卡显示「标签样式」和「下拉样式」
When：鼠标移入任一选项卡并切换选中态
Then：两张卡片均使用 `cursor:pointer`，与填写顺序选项一致
And：选中态只将卡片单一外框变为 `#3370FF`
And：choice panel、preview panel 和中间接缝不得独立变蓝
And：未选中接缝为 `#DEE0E3`；选中接缝为 `#F0F4FF`，与上半区背景融合后视觉不可辨识为独立横线
And：不得修改填写顺序和查看顺序组件的现有 DOM、CSS 或交互
And：切换不得改变卡片 `368×125px` 尺寸或引起布局位移。

## AC-29H 填写和查看顺序 seam 状态

Given：填写顺序或查看顺序的选项卡处于未选中状态
When：检查标题区和预览区接缝
Then：显示 `1px #DEE0E3` 细线

Given：同一卡片切换为选中状态
When：标题区背景变为 `#F0F4FF`
Then：seam 同步变为 `#F0F4FF` 并与标题背景融合，视觉上不显示独立横线
And：只有 outer border 为 `#3370FF`
And：不得修改总标题、子标题字重、180×134卡片、138×56 SVG、顺序状态或预览组件。

## AC-29I 下拉样式预览箭头

Given：展示方式卡渲染下拉样式预览
When：检查预览框右侧箭头
Then：使用公共 `DownBoldOutlinedIcon`，不得使用文本字符 `⌄` 或 `DownOutlined`
And：SVG为 `12×12px`、viewBox `0 0 24 24`、颜色 `#646A73`
And：在 `336×32px` 预览框内右侧 inset 12px、上下各10px
And：公共组件其他调用继续使用默认10px，不产生回归。

## AC-29J 子评估题候选筛选与派生列

Given：评级方式为通过子评估项评级
When：计算规则为不设置规则
Then：候选只包含评分，或评级且评级可参与计算开启的子评估题

When：计算规则切换为按条件计算
Then：候选只包含评级且评级可参与计算开启的子评估题
And：不符合新候选集合的已选 question_id 自动清空
And：评分映射等级型、评级参与计算关闭、停用规则和普通评估题均不出现。

Given：未选择子评估题
Then：评估规则和评分上下限显示同样的灰底 `--`

Given：选择子评估题
Then：规则列显示该题关联规则的最新名称；上下限按评级量化分、评分上下限或固定分值min/max派生
And：下拉 option 第一行显示题目名称，第二行显示关联规则评估类型。

## AC-30A 专项未覆盖范围

Given：展示方式或填写/查看顺序的点击后状态没有对应完整采集证据
When：生成实现契约
Then：这些状态必须标记为 `not_observed` 或 `blocked`，不得猜测选中后的 geometry、style、SVG 或滚动行为

当前新增契约仍为：

```text
completion_status: incomplete
pixel_restore_status: blocked
```

## AC-31 评分上下限按子评估项评分的计算规则绑定

Given：普通评估题类型为「常规评估项」，选择规则「评估规则--拼分（在分数上下限内输入评分）」，并选择「按子评估项评分」
When：依次选择「不设置计算规则」「加权求和」「直接求和」「求平均分」
Then：四个选项的真实文案、选中态和 after 状态分别保存；每个状态同时包含子评估题区域与展示方式/填写查看顺序区域
And：状态联合键必须包含 `entry_mode + rule_id + review_type + scoring_method + calculation_rule`

## AC-32 既有展示方式组件复用

Given：四个计算规则处于各自已采集的 after 状态
When：比较展示方式区域
Then：展示方式区域按既有组件结构复用，不得为四个计算规则复制四套展示方式 DOM、CSS 或预览 SVG
And：展示方式区域的加载上下文必须绑定当前 `calculation_rule`
And：四个状态中展示方式/填写查看顺序的结构和位置保持一致时，记录为共享视觉契约，不得删除分支级 source state 证据

## AC-33 加权求和分支差异

Given：计算规则选择「加权求和」
When：检查子评估题列表
Then：显示「权重」列；其它三个已采集计算规则状态未观察到该列
And：权重列的输入、修改和持久化行为不在本次专项证据范围内

## AC-34 已完成范围与未完成范围

Given：本专项已完成四个计算规则选择后的 after 采集
When：生成规格和实现简报
Then：可将四个计算规则变体标记为 `implementation_readiness=ready`（`readiness_scope=variant`）
And：提交后的「该字段是必填字段」错误态已由 2026-09-02 补采形成独立 validation after 证据；「新建子评估题」弹窗仍保持 `not_observed`
And：不得将提交前人工确认点或工具调用失败记录写成校验 after 证据
And：`capture_integrity=passed`、`capture_completeness=incomplete`、`pixel_restore_status=blocked` 保持不变

### 2026-09-01 顺序区域实现结果

```text
structure: implemented；总标题、左右子标题、四张卡片及独立ReviewQuestionOrderPreview已落地
layout: 758px根、371px双列、16px列间距、180×134卡片、8px子标题间距已编码；真实浏览器bbox diff not-run
visual: 138×56目标SVG、138×20主灰条、100×12次级灰条及#1F2329文字path已实现
behavior: 默认top/top与本地顺序切换保留；点击后目标截图diff未运行
focused tests: 25 passed
vite build: passed
pixel: blocked；不得宣称像素验收通过
```

### 2026-09-01 子评估题候选联动实现结果

```text
backend: dedicated candidate endpoint + none/condition policies
bounds: rating quantified min/max; score min/max; fixed option min/max
frontend: two-line option + selected name + derived rule/bounds
policy change: invalid question_id cleared
backend tests: 12 passed
frontend tests: 30 passed
vite build: passed
vue-tsc: blocked by existing ReviewQuestionTable.spec.ts:48
persistence/reopen: not-in-scope
runtime screenshot diff: not-run
```

### 2026-09-01 下拉预览箭头实现结果

```text
component: DownBoldOutlinedIcon
shared default size: 10px unchanged
review dropdown preview size: 12×12px
viewBox/path/color: target 0 0 24 24 / DownBold path / #646A73
glyph: ⌄ removed
layout: 336×32 preview, flex-centered, right inset12px
focused tests: 28 passed
vite build: passed
spec gate: passed
pixel screenshot diff: not-run
```

### 2026-09-01 填写/查看顺序 seam 实现结果

```text
scope: 仅ReviewQuestionOrderSection新增seam；ReviewQuestionOrderPreview及既有标题/尺寸/交互未改
unselected seam: #DEE0E3
selected seam: #F0F4FF，与selected title背景融合
outer border: selected #3370FF
layout: absolute seam，不改变180×134 card和138×56 SVG
behavior: fill/view各自切换seam与aria状态
focused tests: 25 passed
vite build: passed
spec gate: passed
pixel screenshot diff: not-run
```

### 2026-09-01 展示方式交互实现结果

```text
structure: 展示卡使用单一outer border；choice/preview不分别绘制选中蓝边
cursor: inline pointer + scoped pointer fallback
visual: unselected seam #DEE0E3；selected seam #F0F4FF并与choice背景融合；selected仅outer border为#3370FF
layout: seam绝对覆盖且不改变368×125 bbox
behavior: 标签/下拉点击与Enter/Space切换更新外框、aria和seam；填写顺序组件未修改
focused tests: 25 passed
vite build: passed
spec gate: passed
pixel screenshot diff: not-run
```

### 2026-09-01 评分方式组件实现结果

```text
structure: ReviewQuestionScoringMethodCard -> ReviewQuestionMethodSelector -> PerformanceRadioGroup
range: 3 options / 3 InfoOutlined / 评分方式
fixed: 1 option / 1 InfoOutlined / 评分方式
mapping: 3 options / 3 InfoOutlined / 评分方式；不再显示直接映射
interaction: 评分选项统一cursor:pointer；评级选项和现有提示图标规则未修改
layout: 800×134及terminal gap已编码；rendered bbox diff not-run
focused tests: 25 passed
vite build: passed
spec gate: passed
pixel: blocked
```

### 2026-09-01 动态列表实现结果

```text
structure: none使用PerformanceSortableList + PerformanceDragHandle；condition使用独立两列模板
layout: direct/none/condition单一terminal gap已编码；none列轨道16/4/420/8/130/8/144/4/24；condition列轨道493/8/257
visual: none使用真实DragOutlined和公共删除按钮；condition禁止拖拽、上下限和操作按钮
behavior: none支持公共pointer/keyboard整行拖拽、placeholder、reorder；condition切换时卸载sortable与所有按钮
focused tests: 36 passed
vite build: passed
spec gate: passed
rendered bbox / screenshot diff: not-run
pixel: blocked
```

## AC-35 空子评估题提交校验

Given：普通评估题类型为「常规评估项」，选择规则「评估规则--拼分（在分数上下限内输入评分）」，评分方式为「按子评估项评分」，计算规则为「不设置计算规则」，子评估题列表为空
When：用户只点击一次「提交」
Then：页面停留在新建评估题页面，不创建评估题、不跳转
And：「子评估题」区域下方显示红色文案「该字段是必填字段」
And：错误节点使用 `x=576.67,y=534,w=758.67,h=21`、`font-size=14px`、`font-weight=400`、`line-height=21px`、`color=rgb(245,74,69)`、`margin-top=2px`
And：错误反馈只属于 validation after 状态，不改变正常态展示方式或填写/查看顺序组件契约
And：未观察到 `ErrorFilled` SVG，不得猜测错误图标
And：「新建子评估题」弹窗仍标记为 `not_observed`，没有弹窗证据时不得新增弹窗 geometry 或字段

证据：`idreamsky.feishu.cn_20260902_105330_185791:submit-empty-sub-question-validation`；before 证据为 `step_11/checkpoint/`，after 证据为 `step_11/after/`。

```text
structure: captured
layout: captured for validation after
visual: captured; rendered screenshot diff not-run
behavior: one authorized submit produced required message and no creation
api: no successful create request; payload acceptance remains not-run
pixel: blocked by modal, disabled, resize and rendered diff gaps
```

## AC-36 真实子评估题选择后派生展示

Given：普通评估题为「常规评估项」，选择目标评分规则、评分方式「按子评估项评分」、计算规则「不设置计算规则」，子评估题候选面板中存在 `7680531263614094288`
When：用户选择候选「子评估题--评分（在分数上下限内输入评分）」并关闭候选面板
Then：子评估题名称区域显示该候选名称
And：评估规则区域派生显示「评估规则--拼分（在分数上下限内输入评分）」
And：评分上下限区域派生显示 `1 - 10`
And：删除按钮可见，新建子评估题入口保留
And：选择结果在候选面板关闭后仍保持
And：展示方式和填写/查看顺序继续使用既有共享组件，不复制新的展示模板
And：状态联合键至少包含 `calculation_rule + question_id`
And：不得把规则名称、评估类型或评分上下限作为独立可编辑选择值
And：本验收项不执行删除、保存、创建或发布

证据：`idreamsky.feishu.cn_20260902_140948_915810:sub-question-selected-existing`、`...:sub-question-selected-existing-stable`。

```text
structure: captured
layout: captured; selected row and candidate panel geometry recorded
visual: captured from target screenshots/computed artifacts
behavior: trusted candidate selection and selection persistence captured
api: no create/save request executed; not-run
pixel: rendered contract and screenshot diff not-run
```
