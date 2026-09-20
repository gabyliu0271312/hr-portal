# PM-T005 组件模型

```text
completion_status: incomplete
pixel_restore_status: blocked
uncovered_reasons:
- 2026-08-30 的 21 个真实菜单规则状态（7 个目标规则 × 首屏/滚动后/选择后）已投影到 `schema_version: 2` 机器契约
- 真实 API 读取/保存和规则更新后最新读取尚未运行
- 普通评估题评级长代号仅有用户截图，缺少完整采集 session、rendered contract 和截图 diff
- disabled、ErrorFilled SVG 和 textarea resize after-drag 证据仍缺失
```

> 本模型对应 `component-model-template.md`。每个节点必须在实现和验收中回溯到 `capture-manifest.md` 的证据。

## 1. Component tree

```text
ReviewQuestionCreateShell (route-driven full-screen-modal)
├── FullScreenModalHeader
│   ├── BackAction
│   └── HeaderTitle
├── ReviewQuestionCreateContent
│   ├── BasicInfoCard
│   │   ├── LanguageCheckboxGroup
│   │   ├── NameInput
│   │   ├── DescriptionTextarea
│   │   └── TypeRadioGroup
│   ├── ReviewRuleCard
│   │   ├── ReviewRuleSelect
│   │   └── ReviewRuleConfigRenderer
│   │       ├── ScoreRangeSummary (shared: regular + sub)
│   │       ├── FixedScoreOptionsSummary (shared: regular + sub)
│   │       └── ScoreMappingSummary (regular score-mapping)
│   ├── ReviewQuestionRuleAdditionalCards
│   │   ├── EvaluationMethodCard
│   │   └── ReviewQuestionDisplayMethodCard (shared: rating + score-fixed)
│   └── RemarkCard
│       └── RemarkTextarea
└── FixedActionBar
    ├── SubmitButton
    ├── PreviewButton
    └── CancelButton
```

## 2. Component contract

| component_id | props / emits | required states | source_state_ids |
|---|---|---|---|
| `ReviewQuestionCreateShell` | `mode=create|edit`; `back`, `submit`, `preview`, `cancel` | default, scroll, after-action | `153141`, `190403_023043`, `190550_626183`, `190736_735382`, `190921_581205`, `191106_099217` |
| `FullScreenModalHeader` | `title`, `onBack` | default, hover, focus | `153141`, `192442_079083`, `191106_099217` |
| `LanguageCheckboxGroup` | `modelValue`; `update:modelValue` | default, checked, focus | `192219_038154` |
| `TypeRadioGroup` | `modelValue`; `update:modelValue` | default, checked, hover, focus | `192219_038154` |
| `NameInput` | `modelValue`; `update:modelValue` | empty, focus, filled, validation | `191949_338542`, `190736_735382` |
| `DescriptionTextarea` | `modelValue`; `update:modelValue` | empty, focus, filled, count | `191949_338542`, `190736_735382` |
| `ReviewRuleSelect` | `modelValue: rule_id`; `options`; `loading`; `error`; `update:modelValue` | placeholder, expanded, selected, duplicate-label | `20260830-120838:base`, `20260830-121507:base`, `20260830-122043:base`, `20260830-123222:base`, `20260830-123757:base`, `20260830-124330:base`, `20260830-124906:base`, `20260830-125443:base`, `20260830-130045:base`, `20260830-130618:base` |
| `ReviewRuleConfigRenderer` | `ruleId`; `ruleType`; latest `config`; loading/error state | rating-off, rating-on, score-range, score-fixed, score-mapping | `20260830-121507:base`, `20260830-122043:base`, `20260830-123222:base`, `20260830-123757:base`, `20260830-124330:base`, `20260830-124906:base`, `20260830-125443:base`, `20260830-130045:base`, `20260830-130618:base` |
| `ScoreRangeSummary` | `minimum`; `maximum`; `precision` | shared regular/sub score-range | `20260830-210157:base`, `20260830-213631:base` |
| `FixedScoreOptionsSummary` | `options` | shared regular/sub score-fixed | `20260830-211313:base`, `20260830-214945:base` |
| `ScoreMappingSummary` | latest `mapping` | regular score-mapping table + range summary | `20260830_220116_685650:score-mapping` |
| `ReviewQuestionRuleAdditionalCards` | `ruleType`; latest `config` | evaluation-method, display-method (applicable variants) | `20260830-121507:base`, `20260830-122043:base`, `20260830-123222:base`, `20260830-123757:base`, `20260830-130618:base` |
| `ReviewQuestionDisplayMethodCard` | `ruleType`; latest `config` | label-style, select-style, rating-off, rating-on, score-fixed | `20260830-124906:base`, `20260830-130045:base` |
| `RemarkTextarea` | `modelValue`; `update:modelValue` | empty, focus, filled, count | `191949_338542`, `190736_735382` |
| `FixedActionBar` | `submit`, `preview`, `cancel` | default, hover, disabled, loading | `192442_079083`, `190550_626183`, `190736_735382`, `190921_581205` |

## 3. Field inventory

| field | label | control | constraint | evidence status |
|---|---|---|---|---|
| `language` | 语言 | square checkbox visual | 中文默认选中，英文未选中，required | confirmed default only |
| `name` | 名称 | single-line input | placeholder `请输入名称`, required | confirmed |
| `description` | 描述 | textarea | placeholder exact text, max 1000, count | confirmed |
| `type` | 类型 | horizontal solid radio | 4 captured labels, required, InfoOutlined | confirmed default only |
| `reviewRule` | 评估规则 | select | `placeholder=请选择`; options from `GET /performance/review-rules`; `label=name`, `value=rule_id`; selected rule loads latest config | confirmed: `20260830-120838:base` dropdown and `20260830-121507:base`–`20260830-130618:base` selection states |
| `remark` | 备注 | textarea | max 2000, count | confirmed |

## 4. Evidence-to-design handoff

### Component anatomy

`ReviewQuestionCreateShell` owns page flow and modal composition. `BasicInfoCard`, `ReviewRuleCard`, and `RemarkCard` own section grouping. Field components own their internal label/control structure; the page owns card position, card width, section spacing, and action-bar placement. The `required-mark` entry in `extracted-ui-contract.json` is a visual child of the form label, not a business field and not an inferred text space.

### Tokens and geometry

Only values present in `visual_elements` and the referenced capture artifacts are implementation authority. Confirmed values currently include the BasicInfoCard `800x388px`, the equal field widths `759px`, the default textarea height `49px`, and the required-mark `8x22px`, `2px` left margin, `SimSun`, `14px/22px`, weight `400`, red `rgb(245,74,69)`, flex-centered geometry. Uncaptured properties remain `BLOCKED` and must not be replaced with framework defaults.

### Variants and ownership

Default, focus, validation, disabled, expanded, and resize states are separate variants only when supported by the corresponding capture state. Shared field components expose content/behavior through props and `v-model`; page-specific x/y, column width, card spacing, and overflow constraints remain parent-owned. The two vertical resize states are currently `blocked` because dragging evidence is missing.

### Layered acceptance

Acceptance is reported separately for structure, layout, visual styles, behavior, and pixel diff. Build/unit-test success does not close visual acceptance. The current feature remains `blocked` for resize evidence until `dragging` and `after-drag` captures show numeric height growth.


## 6. 2026-08-30 规则关联补充模型

### 6.1 规则数据源

`ReviewRuleSelect` 不拥有规则枚举。页面加载 `ReviewRuleOption[]`，其中 `label` 来自规则名称，`value` 来自稳定 `rule_id`。同名规则必须保持为不同选项；组件不得按名称去重。

```text
ReviewQuestionCreateShell
└── ReviewQuestionCreateContent
    ├── BasicInfoCard
    ├── ReviewRuleCard
    │   ├── ReviewRuleSelect(options, modelValue=rule_id)
    │   └── ReviewRuleConfigRenderer(rule_id, latest_config)
    ├── ReviewQuestionRuleAdditionalCards
    │   ├── EvaluationMethodCard
    │   └── ReviewQuestionDisplayMethodCard
    └── RemarkCard
```

`ReviewRuleConfigRenderer` 只负责按已选择规则呈现真实配置模块；规则列表加载、详情加载、错误反馈和当前题目状态由页面组装层持有。页面不得把规则配置复制到题目本地快照。

`ReviewRuleSelect` 的 expanded 和 selected 是两套独立视觉状态：expanded 的 option 内容为“规则名称 + 类型/配置摘要”两行；selected 的 trigger 只显示规则名称单行。selected trigger 的 computed 目标为 `height=28px`、`line-height=28px`、`white-space=nowrap`；展开列表目标为 `x=581,y=605,width=758.66,height=245.33`，不得把两行 option 内容复用到 32px trigger 中。

### 6.2 规则变体矩阵

| variant | 规则选择 | 模块差异 | source_state_ids |
|---|---|---|---|
| rating-off | 测试评级--评级可参与计算开关关闭 | 评级配置关闭态 | `20260830-121507:base`, `20260830-124330:base` |
| rating-on | 测试评级--评级可参与计算开关打开 | 评级配置打开态，展示量化分相关结构 | `20260830-122043:base`, `20260830-124906:base` |
| score-range | 测试评分--在分数上线限内输入评分 | 规则卡内紧凑摘要：评分上下限与小数位在同一行；普通题的评估方式位于独立卡片 | `20260830-123222:base`, `20260830-125443:base` |
| score-fixed | 测试评分--在固定分值选项内选择评分 | 固定分值选项结构 | `20260830-123757:base`, `20260830-130045:base` |
| score-mapping | 测试--评分映射等级型 | 评分映射等级型结构 | `20260830-130618:base` |

#### score-fixed 共享分值标签组件

`review_type=评分 + config_discriminator=score_method_fixed_options` 在普通评估题与子评估题中共同调用 `FixedScoreOptionsSummary`。组件以子评估题已实现的结构为唯一真源，只渲染 `fixed-score-options`，不渲染“评分配置”“评分方式”或“精度”；普通评估题适用的 `ReviewQuestionRuleAdditionalCards` 由页面组装层在共享组件之外保留。

- source state：`20260830_211313_909144:score-fixed`；目标截图：`C:\\Users\\gaby.liu\\ClonedSites\\idreamsky.feishu.cn_20260830_211313_909144\\captures\\hybrid_steps\\step_18\\after\\after.png`
- `FixedScoreOptionsSummary` props：`options`；不得接收 `entryMode` 或题目类型决定内部结构。
- `ReviewRuleCard`：`800px` 宽；内容区约 `758.67px`，由父级负责收口。
- 分值列表：宽度受内容区约 `758.67px` 约束，采用可换行布局；选项超出当前行后进入下一行，卡片高度随实际行数增长。
- 分值标签：每个标签按自身分值文本自适应宽度，不使用统一固定宽度；目标最小宽度 `46px`，高度 `21px`，水平 padding `8px`，垂直 padding `0`，圆角 `1000px`，无边框，背景 `rgb(225,234,255)`，文字 `rgb(12,41,110)`，字号 `14px`，行高 `21px`，居中显示。
- 自适应约束：标签不得被压缩为负空间，也不得突破分值列表内容边界；多行标签之间保持目标间距。`46px` 是单字符分值在目标状态下的最小尺寸，不是所有分值的固定宽度。
- 普通评估题与子评估题不得各自维护固定分值模板或样式；两者必须通过组件实例复用同一实现。

### 6.2.1 评级附加卡片变体

`ReviewRuleConfigRenderer` 与 `ReviewQuestionRuleAdditionalCards` 必须共同消费最新规则 `config`：

- `grade_participates_in_calculation` / `gradeParticipatesInCalculation` 控制评级配置中的「量化分」列；不得通过 `levels[*].quantifiedScore` 字段是否存在推断开关状态；
- `rating-off` 不渲染「量化分」列，不渲染「隐藏等级量化分」；
- `rating-on` 渲染「量化分」列，并以 `hide_grade_quantified_score` / `hideGradeQuantifiedScore` 初始化「隐藏等级量化分」本地开关状态；用户可操作该状态，但不写入评估题 payload、不反向写回评估规则，本次为后续其他业务区域消费预留；
- `EvaluationMethodCard` 采用纵向表单结构：字段 label 后接单选组，不使用 label 列与 control 列横向排列；目标单选组 `434×22px`，列间距 `24px`，行间距 `8px`；
- `DisplayMethodCard` 采用纵向表单结构，两个选项卡片各为 `368×125px`，每张卡由 `59.33px` 说明/单选区和 `65.67px` 预览区组成；标签样式预览和下拉样式预览必须作为卡片下半部独立结构；
- `rating-off` 的展示方式卡约 `800×263px`，`rating-on` 约 `800×325px`；高度差来自规则配置中的「隐藏等级量化分」展示，不得固定为同一高度。

### 6.2.2 评级附加卡片视觉结构

- `EvaluationMethodCard` 的内容根为纵向 form item：label 位于上方，radio group 位于下方；目标 radio group `434×22px`，选项 wrapper 约 `80/136/170×22px`，列间距 `24px`，行间距 `8px`。
- `DisplayMethodCard` 的内容根为纵向 form item，label、帮助文案和 option group 均使用约 `759px` 内容宽度；option group `752×125px`，由两个 `368×125px` option card 和 `16px` 间距组成。
- 每个 option card 由 `59.33px` 的 `choice-panel` 和 `65.67px` 的 `preview-panel` 组成；标签样式预览使用采集到的固定 `C/B/A/S` 示例，下拉样式预览使用等级下拉框；选中态只改变对应 choice panel 的背景/边框。
- `rating-off` 不显示 `hide-score-option`，展示方式卡约 `800×263px`；`rating-on` 才根据规则详情中的 `hide_grade_quantified_score` / `hideGradeQuantifiedScore` 初始化 `hide-score-option`，使用已有 `PerformanceSwitch` 并允许操作本地状态，不使用 checkbox；展示方式卡约 `800×325px`。
- 新建评估题页面不将「隐藏等级量化分」加入评估题 payload；本地状态随所选 `rule_id` 的最新 config 初始化和重置，用户操作只更新预留状态，本次不写回评估规则。

### 6.2.3 普通评估题评级等级表格长内容变体

`entryMode=regular_question + ruleType=评级` 继续由 `ReviewRuleConfigRenderer` 渲染「配置等级描述」，但表头与全部数据行必须共享列轨道：

```text
RatingLevelDescriptionGrid
├── SharedColumnTracks
│   ├── CodeTrack: min 70px / content-sized / max 132px
│   ├── NameTrack: 70px
│   ├── QuantifiedScoreTrack: 70px（rating-on only）
│   └── DescriptionTrack: minmax(0, 1fr)
├── HeaderRow
└── LevelRow × N
    ├── LevelCodePill
    │   └── EllipsisText
    ├── LevelName
    ├── QuantifiedScore（rating-on only）
    └── LevelDescriptionInput
```

- `LevelCodePill`：`width=max-content`、`max-width=132px`、`height=22px`、`padding=0 8px`、`border-radius=11px`；内部文本使用 `overflow:hidden + text-overflow:ellipsis + white-space:nowrap`。
- `CodeTrack` 的宽度由当前规则中最宽的代号底框决定并封顶132px；表头和所有行共享该轨道，所以其余列同步偏移且保持纵向对齐。
- 背景色由 `levels[].color` 查询 `PERFORMANCE_LEVEL_COLORS` 后使用对应 `trigger`，与 `ColorPicker` 触发器一致；找不到映射时才回退原始 CSS 色值。
- 空等级名称只读展示为 `--`。通用 `display()` 的 Unicode 长横线语义不得用于该字段。
- source：2026-08-31 用户普通评估题长代号截图；完整浏览器 session 与 rendered diff 未提供，pixel 状态保持 `not-run/blocked`。

以上是按“session:base”限定的证据别名；真实产物路径、页面入口和下拉标识见 `capture-manifest.md`。普通题和子题必须分别引用对应入口的状态，不能只复用普通题截图。

### 6.3 状态机

```text
idle
  -> loading-rules
  -> ready
  -> expanded
  -> selected(rule_id)
  -> loading-latest-config
  -> rendered(rule_id, latest_config)

loading-rules -> error(rules-unavailable)
loading-latest-config -> error(rule-unavailable)
error -> ready（用户重试）
```

规则切换后，旧配置模块必须退出当前渲染树或被明确替换；不得出现旧规则字段与新规则字段叠加。重新打开已有评估题时，以同一 `rule_id` 的最新规则详情为准。

### 6.4 Props / emits

| component_id | props | emits | ownership |
|---|---|---|---|
| `PerformanceManagementTable` | `rows`; `loading`; `page`; `pageSize`; table/pagination labels | `page-change`; `page-size-change` | common table shell for ReviewRuleTable and ReviewQuestionTable | `153141` |
| `ReviewRuleSelect` | `modelValue: rule_id`; `options`; `loading`; `error` | `update:modelValue` | 选择器负责下拉外壳、expanded/selected 状态；页面负责数据获取 |
| `ReviewRuleConfigRenderer` | `ruleType`; `config`; `loading`; `error` | `retry` | 渲染规则卡片内部真实配置，不持有页面卡片位置 |
| `ReviewQuestionRuleAdditionalCards` | `ruleType`; `config` | none | 只组合评估方式，并决定是否挂载共享展示方式组件 |
| `ReviewQuestionDisplayMethodCard` | `ruleType`; latest `config` | none | 唯一拥有标签/下拉样式卡片、固定 CBAS SVG、本地选中态和隐藏量化分预留开关；评级与固定评分不得复制其 DOM/CSS |
| `ReviewQuestionCreateShell` | `mode`; `isSubQuestion`; `parentQuestionId`; `ruleId` | `update:ruleId`; `submit`; `preview`; `cancel` | 页面负责表单组合和 POST payload，不保存规则版本/快照 |

### 6.5 层级验收

- structure：两个入口均含规则选择器和选择后配置模块，字段顺序来自对应 source state；
- layout：比较每个动态模块的 component root、first visible child、terminal visible child 和四边 inset；
- visual：分别比较 rating-off/rating-on、score-range/score-fixed/score-mapping 的字体、颜色、边框、阴影、图标和滚动；
- behavior：展开、选择、加载、规则切换、最新配置读取和不可用规则错误；
- API：保存请求只提交 `rule_id`、`is_sub_question`、`parent_question_id` 等冻结字段；规则更新后读取最新配置；
- pixel：每个入口×规则状态必须有目标截图和 rendered contract diff；当前 rendered contract 尚未生成，保持 `not-run`/`blocked`。

### 6.6 最新真实入口 source states

最新采集的 21 个状态采用 `session:phase` 命名空间：

| entry_mode | variants | session |
|---|---|---|
| `sub_question` | `rule-select-expanded-top`, `rule-select-expanded-scrolled`, `rating-on` | `20260830-205019:step_07/step_17/step_18` |
| `sub_question` | `rule-select-expanded-top`, `rule-select-expanded-scrolled`, `score-range` | `20260830-210157:step_07/step_17/step_18` |
| `sub_question` | `rule-select-expanded-top`, `rule-select-expanded-scrolled`, `score-fixed` | `20260830-211313:step_07/step_17/step_18` |
| `regular_question` | `rule-select-expanded-top`, `rule-select-expanded-scrolled`, `rating-on` | `20260830-212442:step_07/step_17/step_18` |
| `regular_question` | `rule-select-expanded-top`, `rule-select-expanded-scrolled`, `score-range` | `20260830-213631:step_07/step_17/step_18` |
| `regular_question` | `rule-select-expanded-top`, `rule-select-expanded-scrolled`, `score-fixed` | `20260830-214945:step_07/step_17/step_18` |
| `regular_question` | `rule-select-expanded-top`, `rule-select-expanded-scrolled`, `score-mapping` | `20260830-220116:step_07/step_17/step_18` |


### 6.7 `score-range` 选择后结构

`ReviewRuleConfigRenderer` 在 `ruleType=评分` 且 `config.method=在分数上下限内输入评分` 时，普通评估题与子评估题共同调用独立的 `ScoreRangeSummary`，以子评估题已实现的只读紧凑摘要为唯一真源，不渲染评估规则配置表单：

```text
ScoreRangeSummary
├── SummaryLabel("评分上下限")
└── SummaryValueRow
    ├── Minimum
    ├── Separator("-")
    ├── Maximum
    └── PrecisionText
```

- `SummaryValueRow` 必须保持单行，内容语义为 `minimum - maximum，precision`；
- `ScoreRangeSummary` props：`minimum`、`maximum`、`precision`；不得接收 `entryMode` 或题目类型决定内部结构；
- 普通评估题与子评估题必须渲染同一个组件实例类型，不得维护两份模板或样式；
- 不生成「评分配置」标题、规则卡内「评分方式」行或独立「精度」行；
- `sub_question` 只渲染该摘要，不渲染 `ReviewQuestionRuleAdditionalCards`；
- `regular_question` 在该摘要之后保留独立 `EvaluationMethodCard`，但不渲染 `DisplayMethodCard`；
- source states：`20260830-210157:base`、`20260830-213631:base`。

### 6.8 `score-mapping` 选择后结构

```text
ScoreMappingSummary
├── MappingTitle「按分数子区间匹配等级」
├── MappingHeader
│   ├── 评分上下限
│   ├── 等级代号
│   ├── 等级名称
│   └── 等级描述
├── MappingRow × N
│   ├── IntervalExpression
│   ├── LevelCodePill
│   ├── LevelName
│   └── LevelDescriptionInput
└── ScoreRangeSummary
```

- `ReviewRuleConfigRenderer` 只负责选择 `score-mapping` 变体并传入最新 `mapping`；
- `ScoreMappingSummary` 拥有表头、区间派生、行结构、等级胶囊、空名称和描述输入框；
- `ScoreRangeSummary` 拥有底部 `minimum - maximum，precision`；
- 映射表列宽为 `180px / 70px / 70px / minmax(0,1fr)`，列间距 `8px`；行高约 `31.33px`，行间距 `12px`；
- 目标禁止显示「区间关系」独立行、`code - name` 合并文本、通用 `.score-config-row` 和 `.mapping-interval-row`；
- source state：`20260830_220116_685650:score-mapping`。

- Language visual authority is the screenshot/computed evidence: square checkbox appearance. The existing `spec.md` radio wording is not authoritative.
- Container visual authority is `full-screen-modal`; do not implement a 640px `el-dialog`.
- No option list may be invented for `reviewRule`; all options come from the rule API.
- `rule_id` is the only rule association key; name, type and option order are not association keys.
- Rule updates are read through the same `rule_id`; the question must not persist a rule version or configuration snapshot.

## 7. 子评估题评级档位只读导航模型（2026-08-31）

### 7.1 Component tree

```text
ReviewRuleConfigRenderer(entryMode=sub_question, ruleType=评级)
└── SubQuestionRatingTierNavigator
    ├── FieldLabel「评级档位」
    └── ViewportRoot (parent content width × 38)
        ├── ClipLayer
        │   └── ScrollLayer
        │       └── Track (32px, nowrap)
        │           ├── RatingPill × N
        │           └── Connector × N-1
        ├── OverflowMask (overflow only)
        └── RightOutlinedIndicator (overflow only, read-only)
```

机器契约：[rating-tier-overflow-capture-contract.json](rating-tier-overflow-capture-contract.json)，`source_state_id=20260831-manual:sub-question-rating-overflow`。

### 7.2 Anatomy、tokens 与 geometry

| part | contract | ownership | source_state_ids |
|---|---|---|---|
| `ReviewRuleCard` | `800×232` 目标样例；padding `20px 20px 0`；自然高度；白底8px圆角 | 页面父级 | `20260831-manual:sub-question-rating-overflow` |
| `RatingTierField` | `758.667×68`；底部 margin 20px | renderer | 同上 |
| `FieldLabel` | `56×22`；14/600/22；`rgb(31,35,41)` | renderer | 同上 |
| `ViewportRoot` | `width=100%`，目标 `758.667×38`；`overflow:hidden` | navigator | 同上 |
| `ScrollLayer` | 高48；横向内容宽2442；只读；隐藏滚动条 | navigator | 同上 |
| `Track` | 高32；flex row；nowrap；align center | navigator | 同上 |
| `RatingPill` | `width:max-content; min-width:42px; height:32px; padding:6px 12px; flex:0 0 auto` | navigator | 同上 |
| `RatingPill` visual | 边框 `0.666667px solid rgb(208,211,214)`；白底；`rgb(100,106,115)`；14/600/18；圆角9999px | navigator appearance variant | 同上 |
| `Connector` | `flex:1 1 0%`；宽12–88px；高0.667px；灰色上边框；overflow态12px | navigator | 同上 |
| `RightOutlinedIndicator` | 仅 `scrollWidth > clientWidth` 显示；灰色；不可操作 | read-only variant | 同上 + PM-T006 verified icon |

### 7.3 Props、events 与状态机

```text
PerformanceOptionNavigator additions:
- fluid: boolean = false
- interactive: boolean = true
- appearanceVariant: existing string prop

SubQuestionRatingTierNavigator usage:
- fluid=true
- interactive=false
- appearanceVariant=sub-question-rating
- layoutPolicy: viewport fallback 759, height38, pill42×32, connector12–88
```

```text
fits
  -> no arrow

overflow (scrollWidth > clientWidth)
  -> right indicator visible
  -> click/focus/keyboard navigation disabled
  -> track offset remains 0
  -> left arrow never visible
```

`interactive=true` 的默认行为不得变化，以保护评估规则预览和固定分值预览。普通评估题仍走 `entryMode=regular_question` 的「配置等级描述」分支，并保留评估方式/展示方式附加卡片。

### 7.4 Constraints 与验收责任

- 父级负责800px卡片、20px inline padding和自然高度；navigator不得设置卡片高度。
- navigator宽度来自父级内容区，不得把评估规则预览的固定552px直接带入子评估题。
- 胶囊不得统一固定宽度；样例宽度包括141.927、211.875、273.302、235.198、227.427、258.510px。
- 裁切属于 ViewportRoot，`ReviewRuleCard` 保持 `overflow:visible`，避免影响普通评估题表格。
- 结构、布局、视觉、行为和pixel分别验收；单测/构建不能替代 rendered contract 和截图 diff。

### 7.5 类型切换状态

```text
rendered(rule_id)
  -> type-changed
  -> rule_id=null
  -> dynamic-config-cleared
  -> rule-select-empty
  -> selected(rule_id)
  -> loading-latest-config
  -> rendered(rule_id)
```

`ReviewQuestionCreateShell` 监听基本信息 `type` 的用户变更；用户变更后清空规则选择和规则详情。规则详情请求使用递增请求代次，类型切换或规则清空后，旧请求响应不得写回 `selectedRule`。编辑页首次读取题目时的回填属于 hydration，不触发重置。该状态同时适用于普通题和子题，重新选择规则后的 `entry_mode` 变体保持不变。

## 8. 2026-08-31 普通评估题评级动态分支增量模型

### 8.1 增量组件树

```text
ReviewQuestionCreateShell(entry_mode=regular_question)
└── ReviewQuestionRuleAdditionalCards(review_type=评级, grade_participates_in_calculation=true)
    ├── ReviewQuestionRatingMethodSection
    │   ├── RatingMethodRadioGroup
    │   └── conditional branch
    │       ├── ReviewQuestionCalculationRuleSection (sub_items only)
    │       └── ReviewQuestionSubQuestionList (sub_items only)
    └── ReviewQuestionDisplayMethodCard (existing shared component)
        └── ReviewQuestionOrderSection (sub_items only)
```

### 8.2 新增组件交付

| component_id | 层级 | 职责 | props / v-model | events | required states | source_state_ids |
|---|---|---|---|---|---|---|
| `ReviewQuestionRatingMethodSection` | 业务 | 三种评级方式、选中态和分支挂载 | `modelValue`; `entryMode`; `ruleConfig` | `update:modelValue` | default/direct/sub_items/total_score | `idreamsky.feishu.cn_20260831_194405_608420:rating-method-direct`, `idreamsky.feishu.cn_20260831_194405_608420:rating-method-sub-items`, `idreamsky.feishu.cn_20260831_194405_608420:rating-method-total-score` |
| `ReviewQuestionCalculationRuleSection` | 业务 | 子评估项评级下的计算规则两选项 | `modelValue`; `ratingMethod` | `update:modelValue` | none/condition | `idreamsky.feishu.cn_20260831_200737_944606:sub-items-calc-none`, `idreamsky.feishu.cn_20260831_200737_944606:sub-items-calc-condition` |
| `ReviewQuestionSubQuestionList` | 业务 | 子评估题名称、规则、评分上下限、删除/新建区域 | `modelValue`; `ratingMethod`; `calculationRule` | `update:modelValue` | empty rows/selected calculation rule | `idreamsky.feishu.cn_20260831_194405_608420:rating-method-sub-items`, `idreamsky.feishu.cn_20260831_200737_944606:sub-items-calc-none`, `idreamsky.feishu.cn_20260831_200737_944606:sub-items-calc-condition` |
| `ReviewQuestionOrderSection` | 业务 | 子评估项评级下的总标题、填写顺序和查看顺序卡片 | `fillOrder`; `viewOrder` | `update:fillOrder`; `update:viewOrder` | default top/top；其他点击后状态 not-run | `idreamsky.feishu.cn_20260831_194405_608420:rating-method-sub-items`, `idreamsky.feishu.cn_20260831_200737_944606:sub-items-calc-none`, `idreamsky.feishu.cn_20260831_200737_944606:sub-items-calc-condition` |
| `ReviewQuestionOrderPreview` | 业务子组件 | 复用目标 138×56 SVG，按 top/bottom 排列主灰条、次级灰条和「总项」path | `totalPosition=top|bottom` | none | top/bottom default preview | `idreamsky.feishu.cn_20260831_194405_608420:rating-method-sub-items` |
| `ReviewQuestionDisplayMethodCard` | 业务共享 | 标签/下拉预览和 rating-on 隐藏量化分开关；按可选 props 挂载顺序区或隐藏展示选项 | `ruleType`; `latest config`; `showOptions`; `showOrder` | local display state; `update:fillOrder`; `update:viewOrder` from `ReviewQuestionOrderSection` | existing states; sub_items order extension; total_score compact extension | `20260830_124906_523866:base`, `20260830_130045_032006:base`, `idreamsky.feishu.cn_20260831_194405_608420:rating-method-sub-items`, `idreamsky.feishu.cn_20260831_194405_608420:rating-method-total-score` |

### 8.3 动态状态机

```text
rating-on selected
  -> rating_method=direct
      -> ReviewQuestionRatingMethodSection only
      -> CalculationRuleSection forbidden
      -> SubQuestionList forbidden
  -> rating_method=sub_items
      -> mount CalculationRuleSection
      -> mount SubQuestionList
      -> calculation_rule=none | condition
  -> rating_method=total_score
      -> ReviewQuestionRatingMethodSection only
      -> CalculationRuleSection forbidden
      -> SubQuestionList forbidden
```

`calculation_rule=none` 与 `condition` 的新证据只证明 radio 选中态和现有子评估题区域差异；未观察到独立 `condition-editor`，因此该组件不进入实现清单。

### 8.4 增量 evidence index

| source_state_id | state | complete artifacts | implementation use |
|---|---|---|---|
| `idreamsky.feishu.cn_20260831_194405_608420:rating-method-direct` | direct | yes | dynamic visibility / forbidden assertions |
| `idreamsky.feishu.cn_20260831_194405_608420:rating-method-sub-items` | sub_items | yes | sub-question and calculation branch |
| `idreamsky.feishu.cn_20260831_194405_608420:rating-method-total-score` | total_score | yes | dynamic visibility / forbidden assertions |
| `idreamsky.feishu.cn_20260831_200737_944606:sub-items-calc-none` | none | yes | calculation selected state |
| `idreamsky.feishu.cn_20260831_200737_944606:sub-items-calc-condition` | condition | yes | calculation selected state |

展示方式标签/下拉点击和填写/查看顺序点击的新增 evidence index 尚未建立，保持 `not_observed`。

### 8.5 `ReviewQuestionOrderSection` 默认态精确交付

```text
ReviewQuestionOrderSection (758×190)
├── SectionLabel「评估项的填写和查看顺序」(758×22, 14/600/22)
└── OrderColumns (margin-top 4px)
    ├── FillOrderColumn (371px)
    │   ├── ColumnLabel「填写顺序」(371×22, 14/400/22)
    │   └── OptionGroup (margin-top 8px)
    │       ├── OrderOption「总项在上」(180×134)
    │       └── OrderOption「总项在下」(180×134)
    └── ViewOrderColumn (371px)
        ├── ColumnLabel「查看顺序」(371×22, 14/400/22)
        └── OptionGroup (margin-top 8px)
            ├── OrderOption「总项在上」(180×134)
            └── OrderOption「总项在下」(180×134)
```

| part | target | ownership | source_state_ids |
|---|---|---|---|
| section label | `x=577,y=1091,w=758,h=22`；`14/600/22` | `ReviewQuestionOrderSection` | `idreamsky.feishu.cn_20260831_194405_608420:rating-method-sub-items` |
| fill label | `x=577,y=1117,w=371,h=22`；`14/400/22` | order section | 同上 |
| view label | `x=964,y=1117,w=371,h=22`；`14/400/22` | order section | 同上 |
| option card | `180×134`；header `180×40`；preview `180×94` | option component | 同上 |
| option group gaps | 卡片水平间距 `8px`；左右列间距 `16px`；label 到 card `8px` | order section parent | 同上 |
| preview SVG | `138×56`；卡片预览区水平 inset `21px` | option preview | 同上 |
| primary rect | `138×20, rx=4, fill=#F5F6F7`；包含 `#1F2329` 的「总项」path | preview SVG | 同上 |
| secondary rects | `100×12, rx=3, fill=#F5F6F7` | preview SVG | 同上 |

子标题不是字段主标题，必须保持 `font-weight:400`。预览不得使用 8px 高的通用 CSS 条模拟；主条、次级条和文字必须使用采集 SVG 的真实层级。

`ReviewQuestionOrderSection` 增加不参与布局的 `OrderOptionSeam`：default=`#DEE0E3`，selected=`#F0F4FF`。selected seam 与 `OrderOptionTitle` 背景融合，视觉上没有独立横线；outer border 仍为 `#3370FF`。该 seam 使用绝对定位覆盖接缝，不能改变 `180×134px`、标题40px、预览94px或现有顺序状态。

### 8.6 评级方式卡 terminal 收口

| variant | card bbox | terminal child | terminal bbox / bottom | bottom gap | source_state_ids |
|---|---|---|---|---|---|
| direct | `556,362,800×134` | rating method form item | `577,423,758×52`; bottom `475` | `21px` | `idreamsky.feishu.cn_20260831_194405_608420:rating-method-direct` |
| sub_items + none | `556,362,800×388` | add-sub-question / containing form item | terminal bottom `729` | `21px` | `idreamsky.feishu.cn_20260831_200737_944606:sub-items-calc-none` |
| sub_items + condition | `556,362,800×362` | condition list form item | `577,567,758×136`; bottom `703` | `21px` | `idreamsky.feishu.cn_20260831_200737_944606:sub-items-calc-condition` |

底部间距属于动态 terminal child 的收口责任。父卡片保持 `padding-bottom:0` 的目标结构；direct 的评级方式字段或 sub-items 的列表根提供一次约20px末端间距，禁止重复叠加。父卡片必须使用 `display:flow-root` 或等价 BFC 阻止 terminal margin 与父级发生 margin collapse，确保空白保留在白色卡片内部。

### 8.7 `ReviewQuestionSubQuestionList` 计算规则变体

```text
ReviewQuestionSubQuestionList(calculationRule=none)
└── PerformanceSortableList(items, itemKey=id)
    ├── SortableRow × N [data-sortable-index]
    │   ├── PerformanceDragHandle(DragOutlined)
    │   ├── QuestionNameSelect (420px)
    │   ├── RuleField (130px)
    │   ├── ScoreBoundsField (144px)
    │   └── DeleteAction (16px)
    └── AddSubQuestionButton

ReviewQuestionSubQuestionList(calculationRule=condition)
└── ConditionRow × N
    ├── QuestionNameSelect (493px)
    └── RuleField (257px)
```

| part | none | condition | source_state_ids |
|---|---|---|---|
| drag handle | `DragOutlined 16×16`, x=577；公共 grab/grabbing/keyboard 语义 | forbidden | `...:sub-items-calc-none`, `...:sub-items-calc-condition` |
| name column | x=597, width=420 | x=577, width=493 | 同上 |
| rule column | x=1025, width=130 | x=1078, width=257 | 同上 |
| bounds column | x=1163, width=144 | forbidden | 同上 |
| delete | `DeleteTrashOutlined 16×16`, x=1315 | forbidden | 同上 |
| add button | x=573, y=707, `110×22` | forbidden | 同上 |

`none` 必须由 `PerformanceSortableList` 移动整行，`PerformanceDragHandle` 只负责命中和键盘入口；`condition` 不挂载任一拖拽或操作按钮节点。

### 8.8 评分评估方式公共组件

```text
ReviewQuestionScoringMethodCard
├── CardTitle「评估方式」
└── ReviewQuestionMethodSelector
    ├── FieldLabel「评分方式」
    └── PerformanceRadioGroup
        └── PerformanceRadioOption × N (showInfo=true)
```

| variant | options | info count | card / gap | source_state_ids |
|---|---|---:|---|---|
| score-range | 直接评分 / 按子评估项评分 / 作为总分项计算评分 | 3 | `800×134`; bottom `20.67px` | `20260830_213631_473164:score-range` |
| score-fixed | 直接评分 | 1 | `800×134`; bottom `21px` | `20260830_214945_442324:score-fixed` |
| score-mapping | 直接评分 / 按子评估项评分 / 作为总分项计算评分 | 3 | `800×134`; bottom `20.67px` | `20260830_220116_685650:score-mapping` |

`ReviewQuestionScoringMethodCard` 拥有卡片外壳和变体选择；`ReviewQuestionMethodSelector` 拥有 label、options 和 v-model；`PerformanceRadioGroup` 拥有 radio 视觉、焦点、公共 InfoOutlined 和 `cursor:pointer`。评级方式继续由 `ReviewQuestionRatingMethodSection` 管理，不改变其仅末项显示提示图标的已确认行为。

### 8.9 展示方式卡片交互与接缝

```text
DisplayOptionCard (368×125, single outer border)
├── ChoicePanel (368×59.33, no independent selected border)
├── NeutralSeam (0–1px #DEE0E3, never selected blue)
└── PreviewPanel (368×65.67, no independent selected border)
```

- option card 使用 `cursor:pointer`，与 `ReviewQuestionOrderSection` 的选项卡片一致，但本次不修改 `ReviewQuestionOrderSection`；
- selected 只改变 option card 的单一 outer border 为 `#3370FF`；
- choice 和 preview 不分别绘制蓝色边框；
- default seam=`#DEE0E3`；selected seam=`#F0F4FF`，与 selected choice 背景融合；
- 禁止 outer/choice/divider/preview 多层边框叠加形成蓝色粗线；
- 选中切换不改变 `368×125px` 总尺寸。
- 下拉预览箭头复用 `DownBoldOutlinedIcon(size=12)`；公共组件默认 `size=10` 保持向后兼容；目标 path 为 `m3.414 7.086-.707.707...`，`12×12px`、`#646A73`、右 inset 12px、上下 inset 10px；禁止文字字形。

### 8.10 子评估题候选选择组件

```text
ReviewQuestionSubQuestionList
├── ReviewQuestionSubQuestionSelect
│   ├── selected label: question.name
│   └── option: question.name + rule.review_type
├── ReadonlyRuleName (default --)
└── ReadonlyScoreBounds (default --; none variant only)
```

行状态只保存 `row_id + question_id`。`rule_name`、`review_type`、`score_min/max` 均从候选 DTO 派生；评估规则列不得保持独立 select。`ReviewQuestionCreatePage` 负责加载 none/condition 两组候选，业务组件按当前计算规则选择候选集合并在集合变化时清空非法 question_id。

## 9.5 2026-09-02 组件注册补充

新增 validation after 状态的组件注册必须与 variant ownership 和 state components 同时存在：

| component_id | responsibility | props / emits | required states | source_state_ids |
|---|---|---|---|---|
| `ReviewQuestionRuleAdditionalCards` | 组合评分方式、计算规则、子评估题和既有展示/顺序区域；不复制展示方式 DOM/CSS | `ruleType`; `config` / none | calculation-rule binding；validation preserves children | `idreamsky.feishu.cn_20260901_201458_140596:score-range-sub-items-calc-none`、`...:weighted_sum`、`...:direct_sum`、`...:average`、`idreamsky.feishu.cn_20260902_105330_185791:submit-empty-sub-question-validation` |
| `ReviewQuestionSubmitValidation` | 在空子评估题提交 after 状态显示「该字段是必填字段」；不拥有保存、创建或规则读取 | `validationState` / none | before、after；ErrorFilled=`not_observed` | `idreamsky.feishu.cn_20260902_105330_185791:submit-empty-sub-question-validation` |

组件归属关系固定为：

```text
ReviewQuestionRuleAdditionalCards
├── ReviewQuestionScoringMethodCard
├── ReviewQuestionCalculationRuleSection
├── ReviewQuestionSubQuestionList
│   └── ReviewQuestionSubmitValidation
├── ReviewQuestionDisplayMethodCard
└── ReviewQuestionOrderSection
```

`calculation_rule` 是子评估题区域和既有展示/顺序区域的共同加载上下文；validation after 只新增子评估题错误反馈，不改变展示方式组件的复用关系。组件 registry、状态 `components` 和 `variant_contracts.component_ownership` 必须保持同一组件 ID 集合。弹窗组件仍未注册，因为「新建子评估题」弹窗没有有效 after 证据。


## 9. 2026-09-01 评分上下限按子评估项评分增量模型

### 9.1 固定上下文与四路分支

固定上下文为 `entry_mode=regular_question`、类型「常规评估项」、`rule_id=7680421437210954714`、`review_type=评分`、评分方式「按子评估项评分」。`ReviewQuestionCalculationRuleSection` 的分支键为 `none`、`weighted_sum`、`direct_sum`、`average`，分别对应页面文案「不设置计算规则」「加权求和」「直接求和」「求平均分」。

```text
ReviewQuestionRuleAdditionalCards
├── ReviewQuestionScoringMethodCard
│   └── ReviewQuestionMethodSelector（按子评估项评分）
├── ReviewQuestionCalculationRuleSection（四选一）
├── ReviewQuestionSubQuestionList
└── ReviewQuestionDisplayMethodCard / ReviewQuestionOrderSection（既有展示区域复用）
```

### 9.2 组件职责与复用

| component | responsibility | source_state_ids |
|---|---|---|
| `ReviewQuestionCalculationRuleSection` | 呈现四个计算规则并维护选中态 | `idreamsky.feishu.cn_20260901_201458_140596:score-range-sub-items-calc-none`、`...:weighted_sum`、`...:direct_sum`、`...:average` |
| `ReviewQuestionSubQuestionList` | 根据当前计算规则呈现子评估题列表；仅 weighted_sum 增加「权重」列 | 同上 |
| `ReviewQuestionRuleAdditionalCards` | 组合子评估题区域和既有展示方式区域 | 同上 |
| `ReviewQuestionOrderSection` | 复用「评估项的填写和查看顺序」及四张顺序卡片 | 同上 |
| `ReviewQuestionOrderPreview` | 复用「总项在上/下」预览内容 | 同上 |

### 9.3 变体约束

- 四个状态均显示计算规则、子评估题、展示方式和填写/查看顺序区域。
- 展示方式区域使用既有组件结构；不得按四个计算规则复制展示方式 DOM、CSS 或预览 SVG。
- `calculation_rule` 必须同时作为下方子评估题区域和既有展示区域的加载上下文，不能只改变 radio 选中态。
- `weighted_sum` 的已观察差异是子评估题列表增加「权重」列；其它三个状态未观察到该列。
- 四个状态均未观察到评分映射摘要或普通评级等级描述，不得在该变体中挂载。
- 本专项未采集展示方式或顺序卡片点击后的差异，不新增其 active/selected geometry 契约。

### 9.4 当前证据边界

四个 after 状态均已投影到 `extracted-ui-contract.json` 的四个 `variant_contracts`，完整证据位于 `capture-manifest.md` 的 2026-09-01 session；提交校验已在 2026-09-02 补采形成独立 validation variant，`ReviewQuestionSubmitValidation` 已加入组件 registry、state components 和 ownership；「新建子评估题」弹窗仍保持 `not_observed`；全功能 `completion_status=incomplete`、`pixel_restore_status=blocked` 不变。

## 9.6 2026-09-02 提交校验增量模型

```text
ReviewQuestionCreateShell(entry_mode=regular_question)
└── ReviewQuestionRuleAdditionalCards
    ├── ReviewQuestionCalculationRuleSection(calculation_rule=none)
    ├── ReviewQuestionSubQuestionList
    │   ├── AddSubQuestionButton
    │   └── ValidationMessage「该字段是必填字段」
    ├── ReviewQuestionDisplayMethodCard（既有复用）
    └── ReviewQuestionOrderSection（既有复用）
```

| component_id | responsibility | source_state_ids |
|---|---|---|
| `ReviewQuestionSubmitValidation` | 提交一次后，在空子评估题区域显示必填错误；不创建题目、不改变规则关联 | `idreamsky.feishu.cn_20260902_105330_185791:submit-empty-sub-question-validation` |
| `ReviewQuestionSubQuestionList` | 持有子评估题字段及其 validation message；错误反馈不改变既有展示方式组件归属 | 同上 |
| `ReviewQuestionDisplayMethodCard` | 继续复用既有展示方式 DOM/CSS/预览，不因提交校验复制新模板 | 同上 + 四个 calculation-rule states |

提交校验状态机：

```text
empty-sub-question
  -> submit-clicked
  -> validation-message-visible
  -> stays-on-create-page
```

「新建子评估题」弹窗没有 after 证据，继续保持 `not_observed`，不得在本模型中添加弹窗字段、尺寸或按钮契约。

## 9.7 2026-09-02 真实子评估题选择后联动模型

```text
ReviewQuestionSubQuestionList(calculationRule=none)
├── ReviewQuestionSubQuestionSelect
│   └── CandidateOption(name, review_type, score_bounds)
├── SelectedQuestionName(readonly)
├── DerivedRuleName(readonly)
├── DerivedScoreBounds(readonly)
├── DeleteAction
└── AddSubQuestionButton

ReviewQuestionRuleAdditionalCards
├── ReviewQuestionDisplayMethodCard（既有复用）
└── ReviewQuestionOrderSection（既有复用）
```

| component | responsibility | source_state_ids |
|---|---|---|
| `ReviewQuestionSubQuestionSelect` | 打开候选面板、展示候选名称/规则摘要/评分上下限摘要、写入 `question_id` | `idreamsky.feishu.cn_20260902_140948_915810:sub-question-selected-existing`、`...:sub-question-selected-existing-stable` |
| `ReviewQuestionSubQuestionList` | 根据 `question_id` 派生只读题目名称、规则名称和评分上下限，显示删除和新建入口 | 同上 |
| `ReviewQuestionRuleAdditionalCards` | 保持计算规则、子评估题、既有展示/顺序区域的组合关系 | 同上 |

选择后只保存本地选择关系 `row_id + question_id`；规则名称、评估类型和评分上下限均为候选 DTO/规则配置派生值，不作为独立选择状态保存。`calculation_rule` 与 `question_id` 共同决定当前子评估题区域，不能只保存显示文本。
