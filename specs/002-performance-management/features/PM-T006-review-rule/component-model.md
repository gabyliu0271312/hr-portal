# PM-T006 组件模型

```text
completion_status: incomplete
pixel_restore_status: blocked
ui_confirmation_status: confirmed
```

## 1. Component tree

```text
ReviewRuleManagement [RR-LIST-DEFAULT]
├── ReviewQuestionTabs
│   ├── 评估题
│   └── 评估规则 selected [RR-TAB-HOVER]
└── PerformanceListPage
    └── ReviewRuleTableCard
        ├── PerformanceListToolbar
        │   ├── NewButton [RR-NEW-HOVER]
        │   ├── SearchInput [RR-SEARCH-FOCUS]
        │   └── FilterButton [RR-FILTER-HOVER]
        ├── ReviewRuleTable
        │   └── ReviewRuleRowActions [RR-EDIT-HOVER]
        └── Pagination

ReviewRuleCreatePage
└── FullScreenModal
    ├── PageHeader
    │   ├── BackAction
    │   └── create/edit title
    ├── ReviewRuleForm
    │   ├── BasicInfoCard
    │   │   ├── LanguageCheckboxGroup
    │   │   ├── NameInput [RR-NAME-FOCUS, RR-VALIDATION-ERROR]
    │   │   └── ReviewTypeRadioGroup [RR-RADIO-FOCUS]
    │   ├── ReviewTypeConfigCard
    │   │   ├── RatingConfig [RR-CREATE-RATING, RR-EDIT-PREFILLED]
    │   │   │   ├── GradeCalculationSwitch
    │   │   │   └── LevelConfigEditor [RR-ADD-LEVEL-HOVER, RR-LEVEL-INLINE-ADD]
    │   │   ├── ScoreConfig [RR-SCORE]
    │   │   └── ScoreMappingConfig [RR-MAPPING]
    │   │       ├── IntervalHeader [RR-MAPPING, RR-INTERVAL-INLINE]
    │   │       └── ScoreIntervalEditor [RR-INTERVAL-HOVER, RR-INTERVAL-INLINE]
    │   └── RemarkCard
    ├── ReviewRulePreviewModal [preview source states]
    │   ├── ModalHeader
    │   │   ├── PreviewTitle
    │   │   └── PreviewCloseButton [CloseOutlined]
    │   └── ModalBody
    │       ├── RatingRulePreview [non-quantified / quantified]
    │       ├── ScoreRulePreview [bounds / fixed-options]
    │       └── ScoreMappingRulePreview [initial / value-50]
    │           └── PreviewScoreInput
    └── FixedActionBar [RR-SUBMIT-HOVER, RR-PREVIEW-HOVER, RR-CANCEL-HOVER, RR-SUBMIT-FOCUS]
```

> 纠错：采集没有出现 AddLevelModal。点击“添加等级”直接在 LevelConfigEditor 中增加一行。

## 2. Component contracts

| component_id | props | emits / v-model | required states | source_state_ids |
| --- | --- | --- | --- | --- |
| `PageHeader` | `title` | `back`; subtitle/actions slots | default/back-hover/back-focus/create-title/edit-title | `RR-CREATE-RATING`, `RR-EDIT-PREFILLED` |
| `FullScreenModal` | `title`, `showFooter` | `back`, `submit`, `preview`, `cancel`; content/footer slots | create/edit/content-scroll/footer/default-no-footer | create/edit/footer states |
| `PerformanceDisabledReason` | `disabled`, `reason` | 无 | enabled/disabled-hover/not-allowed | `RR-LIST-DEFAULT`、用户确认的使用状态契约 |
| `ReviewRuleTable` | `rules`, `loading`, `page`, `pageSize`, `total`；rule含`isUsed/deletable` | `edit`, `remove`, `page-change`, `page-size-change` | default/empty/loading/unused-delete/used-delete-disabled/disabled-hover/pagination-disabled | `RR-LIST-DEFAULT`, `RR-LIST-20-ROWS`, `RR-EDIT-HOVER` |
| `ReviewRuleForm` | `mode=create\|edit`, `isUsed`, `modelValue` | `update:modelValue`, `submit`, `preview`, `cancel`, `back` | create/edit-unused/edit-used-rating/edit-used-score/edit-used-mapping/validation | `RR-CREATE-RATING`, `RR-EDIT-PREFILLED`, `RR-VALIDATION-ERROR` |
| `ReviewTypeRadioGroup` | `modelValue` | `update:modelValue` | rating/score/mapping/focus | `RR-CREATE-RATING`, `RR-SCORE`, `RR-MAPPING`, `RR-RADIO-FOCUS` |
| `LevelConfigEditor` | `levels`, `quantified`, `structureLocked`, `quantifiedScoreDisabled` | `update:levels`, `add`, `remove`, `reorder` | default/quantified/add-hover/add-focus/inline-added/delete/drag/used-locked | `RR-CREATE-RATING`, `RR-RATING-QUANTIFIED`, `RR-ADD-LEVEL-HOVER`, `RR-ADD-LEVEL-FOCUS`, `RR-LEVEL-INLINE-ADD` |
| `ScoreConfig` | `method`, `min`, `max`, `precision`, `disabled` | field updates | selected/configured/used-locked | `RR-SCORE` |
| `ScoreMappingConfig` | `method`, bounds, rule, intervals, precision, `boundsDisabled`, `structureLocked` | field updates | selected/configured/used-partial-lock | `RR-MAPPING` |
| `IntervalHeader` | `lowerLabel`, `codeLabel`, `nameLabel`, `requiredMarks` | labels; layout only | default/inline-added | `RR-MAPPING`, `RR-INTERVAL-INLINE` |
| `PerformanceNumberInput` | `modelValue`, `placeholder`, `size`, `width`, `controlHeight`, `inputLineHeight`, `stepperWidth`, `step`, `precision`, `min`, `max`, `disabled`, `readonly` | `update:modelValue` | default/focus/disabled/readonly/step | `RR-CREATE-RATING`, `RR-SCORE`, `RR-MAPPING`, `RR-INTERVAL-INLINE` |
| `ScoreBoundsField` | `modelValue`, `precision`, `min`, geometry params | `update:modelValue` | default/precision-linked | `RR-SCORE`, `RR-MAPPING` |
| `ScoreIntervalEditor` | `intervals`, `rule`, `lowerBound`, `upperBound`, `precision` | `update:intervals`, `add`, `remove` | default/derived-boundary/readonly-boundary/add-hover/inline-added | `RR-MAPPING`, `RR-INTERVAL-HOVER`, `RR-INTERVAL-INLINE` |
| `ColorPicker` | `modelValue`, `options`, `placement` | `update:modelValue`, `open`, `close` | selected/expanded/reopened-selected | `RR-COLOR-PICKER-OPEN`, `RR-COLOR-SELECTED`, `RR-COLOR-PICKER-REOPENED` |
| `FixedActionBar` | `submitting` | `submit`, `preview`, `cancel` | default/hover/focus/validation-after-click | footer states + `RR-VALIDATION-ERROR` |
| `ReviewRulePreviewModal` | `open`, `reviewType`, `formValue` | `close`, `update:previewValue`; internally renders one of the three type renderers | rating/score/mapping/open/closed | `RR-PREVIEW-RATING-NON-QUANTIFIED`, `RR-PREVIEW-RATING-QUANTIFIED`, `RR-PREVIEW-SCORE-BOUNDS`, `RR-PREVIEW-SCORE-FIXED`, `RR-PREVIEW-MAPPING-INITIAL`, `RR-PREVIEW-MAPPING-VALUE-50` |
| `PreviewCloseButton` | `icon=CloseOutlined`, `semanticTarget=关闭预览` | `close` | default/after-click/dismiss-verified | all normal preview states |
| `RatingRulePreview` | `levels`, `quantified` | N/A | non-quantified/quantified | rating preview states |
| `ScoreRulePreview` | `method`, `bounds`, `fixedOptions` | N/A | bounds/fixed-options | score preview states |
| `ScoreMappingRulePreview` | `bounds`, `intervals`, `previewValue` | `update:previewValue` | initial/valid-value | mapping preview states |
| `PreviewScoreInput` | `modelValue`, `min`, `max` | `update:modelValue` | empty/value-50 | `RR-PREVIEW-MAPPING-INITIAL`, `RR-PREVIEW-MAPPING-VALUE-50` |

## 3. Field inventory

| field | label / placeholder | control | constraint | source_state_ids |
| --- | --- | --- | --- | --- |
| `languages` | 语言；中文/英文 | square checkbox group | 中文默认选中且视觉置灰，英文未选 | create/edit states |
| `name` | 名称 / 请输入名称 | input | 必填；空提交显示“名称为必填” | `RR-NAME-FOCUS`, `RR-VALIDATION-ERROR` |
| `reviewType` | 评估类型 | radio group | 顺序：评级、评分、评分映射等级型；默认评级 | rating/score/mapping states |
| `remark` | 备注 / 将用于帮助管理员理解评估规则，仅展示在飞书绩效管理后台 | textarea | 0/2000；vertical resize；default49.3333px，dragging/after149.0001px | all form states + `RR-REMARK-RESIZE-DEFAULT`, `RR-REMARK-RESIZE-DRAGGING`, `RR-REMARK-RESIZE-AFTER` |

### 评级

| field | 契约 |
| --- | --- |
| `gradeParticipatesInCalculation` | switch；默认关闭；开启后 `LevelConfigEditor.quantified=true`，新增必填“量化分”列并保留“量化值”；详细字段、列宽和数据契约见 `quantified-rating-contract.md`；source states：`RR-CREATE-RATING`、`RR-RATING-QUANTIFIED` |
| `levels[].color` | 圆形颜色选择器；默认背景 `rgb(253, 226, 226)`；打开后显示 12 个预设颜色（6 列×2 行，18×18px，圆角4px）；选择第4个颜色后控件背景为 `rgb(217, 245, 214)`，所选色为 `rgb(183, 237, 177)`。source_state_ids：`RR-COLOR-PICKER-OPEN`、`RR-COLOR-SELECTED`、`RR-COLOR-PICKER-REOPENED` |
| `levels[].code` | placeholder `请输入「中文」等级代号` |
| `levels[].name` | placeholder `请输入等级名称` |
| `levels[].value` | placeholder `请输入数字`；数字输入 |
| level rows | create 默认 3 行；点击添加等级后 4 行；edit 真实 7 行；支持 drag/delete |

### 普通评分

| field | 选项/约束 |
| --- | --- |
| 评分方式 | `在分数上下限内输入评分` / `在固定分值选项内选择评分` |
| 评分上下限 | `请输入分数下限` / `请输入分数上限` |
| 小数位数设置 | 不保留小数 / 保留 1 位小数 / 保留 2 位小数；切换后已输入上下限立即按所选位数格式化；step分别为1/0.1/0.01 |

### 评分映射等级型

| field | 选项/约束 |
| --- | --- |
| 评分方式 | 在分数上下限内输入评分 |
| 评分上下限 | 请输入分数下限 / 请输入分数上限 |
| 分数子区间规则 | `a ≤ 分数 < b` / `a < 分数 ≤ b` |
| interval header | `分数子区间`、`等级代号`带必填星号，`等级名称`不带星号；三个表头同一 grid；分数子区间跨下限、运算符、上限三列；不覆盖删除列 |
| interval row | 下限、上限、等级代号、等级名称、删除；下限为派生只读值：第1行等于评分下限，后续行等于上一行上限；最后一行上限等于评分上限 |
| 等级代号 | maxlength=12 |
| 等级名称 | maxlength=40 |
| default/add | 默认 2 行；添加后 3 行；新增行始终插入倒数第二行；首尾 boundary values are derived and not manually editable |
| 小数位数设置 | 不保留小数 / 保留 1 位小数 / 保留 2 位小数；切换后已输入上下限和区间右值立即按所选位数格式化；step分别为1/0.1/0.01 |

## 4. State machines

| current | event | next | visible/layout change | source_state_ids |
| --- | --- | --- | --- | --- |
| rating | select score | score | 评级列表替换为评分方式、上下限、小数位 | `RR-SCORE` |
| rating/score | select mapping | mapping | 展开区间规则和区间编辑器，内容高度增加并出现 8px 纵向 scrollbar | `RR-MAPPING` |
| rating | add level | rating | 内联新增 1 条等级行，不打开 overlay | `RR-LEVEL-INLINE-ADD` |
| rating-unquantified | enable calculation | rating-quantified | 开关变为 `aria-checked=true`；新增量化分必填列和每行输入；量化值列保留；卡片高度不变 | `RR-RATING-QUANTIFIED` |
| color-default | open color picker | color-expanded | portal 浮层显示 12 色板，第1色 active，触发器保持24×24圆形 | `RR-COLOR-PICKER-OPEN` |
| color-expanded | select fourth color | color-selected | 面板关闭，值变为 `rgb(183,237,177)`，触发器背景变为 `rgb(217,245,214)` | `RR-COLOR-SELECTED` |
| color-selected | reopen color picker | color-expanded-selected | 面板重开，第4色保持 active 并显示 `DoneOutlined` | `RR-COLOR-PICKER-REOPENED` |
| mapping | add interval | mapping | 始终在倒数第二行内联新增；第1行左值绑定评分下限，后续行左值绑定上一行上限，最后1行右值绑定评分上限；派生左值不允许手动输入 | `RR-INTERVAL-INLINE` |
| create invalid | submit | validation-error | 名称红框、“名称为必填”、三条“等级代号为必填”，无有效写入 | `RR-VALIDATION-ERROR` |
| preview form invalid | preview | preview-validation-error | 显示当前评估类型必填错误；不创建 modal | `RR-PREVIEW-*-VALIDATION-ERROR` |
| preview form valid | preview | preview-open | 打开600px共享预览modal并选择类型渲染器 | six normal preview states |
| preview-open | 关闭预览 | form-valid | `CloseOutlined`解析为当前顶层弹层关闭按钮；`dismissed=true` | normal preview + completed states |
| rating non-quantified | enable calculation | rating quantified form | 关联文案解析到switch；`aria-checked false→true` | `RR-PREVIEW-RATING-QUANTIFIED-FORM` |
| mapping preview initial | input 50 | mapping preview value-50 | 更新预览映射结果；不关闭modal、不回写区间配置 | `RR-PREVIEW-MAPPING-INITIAL`, `RR-PREVIEW-MAPPING-VALUE-50` |
| list | edit first row | edit-prefilled | 进入 `{id}?from`，标题为规则名称，字段预填且评估类型不可切换 | `RR-EDIT-PREFILLED` |
| list N rows | add/display rows | list N+1 rows | table wrapper 每行约增 49px；白卡片先满足 flex 剩余高度，随后由内容撑高；分页始终位于最后一行后 16px | `RR-LIST-DEFAULT`, `RR-LIST-20-ROWS` |
| list overflow | scroll outer content | list bottom | table 不产生纵向滚动；`.content.container-padding` 增加 scrollTop，操作列保持 fixed-right | `RR-LIST-20-ROWS` |

## 5. Visual state matrix

| component | default/selected | hover | focus | disabled / N/A | source_state_ids |
| --- | --- | --- | --- | --- | --- |
| ReviewRuleTab | 蓝字 + 3px 蓝色指示线 | captured | 不可聚焦 div，N/A | N/A | `RR-LIST-DEFAULT`, `RR-TAB-HOVER` |
| NewButton | 80×32 filled blue | captured | shared button focus contract | N/A | `RR-LIST-DEFAULT`, `RR-NEW-HOVER` |
| FilterButton | 80×32 white outlined | 背景 `rgb(242,243,245)` | shared button focus contract | N/A | `RR-FILTER-HOVER` |
| SearchInput | placeholder default | shared input hover | captured | readonly helper field另行区分 | `RR-SEARCH-FOCUS` |
| Edit/Delete | 编辑蓝字；删除灰字 | 编辑 captured | shared link button focus | 删除 disabled=true | `RR-EDIT-HOVER` |
| ReviewTypeRadio | 评级 default checked | shared radio hover | 评分 focus captured | edit 状态整体不可切换 | type/focus states |
| AddLevelButton | 蓝色 text + AddOutlined | captured | captured | N/A | add-level states |
| ColorPicker | 24×24圆形 + `ExpandDownFilled`；固定12色色板 | 面板内色块指针态 | portal面板/选中勾 | N/A | `RR-COLOR-PICKER-OPEN`, `RR-COLOR-SELECTED`, `RR-COLOR-PICKER-REOPENED` |
| Footer buttons | submit filled；preview blue outline；cancel gray outline | 三个均 captured | submit captured | 未观察业务 disabled，N/A | footer states |
| IntervalHeader | `分数子区间 *` 跨下限/运算符/上限；`等级代号 *` 对齐 code；`等级名称` 对齐 name | N/A | N/A | 不覆盖删除列 | `RR-MAPPING`, `RR-INTERVAL-INLINE` |
| Interval bounds | 第1行左值/后续行左值/最后1行右值均为派生只读；中间右值可编辑 | N/A | readonly | readonly/disabled按边界状态 | `RR-MAPPING`, `RR-INTERVAL-INLINE` |
| ReviewRulePreviewModal | white 600px modal；rating/score 158px高，mapping 358.667px高 | 共享 modal 已由 Chrome CDP 验证 header/body/close SVG 几何；非截图级 hover/focus 未采集，BLOCKED | N/A | invalid时不渲染 | preview normal/error states |
| PreviewCloseButton | 28×约28.79点击区；20×20 `CloseOutlined` | CloseOutlined path、bbox 和 dismiss 已由运行时验证；非截图级 hover/focus 未采集，BLOCKED | N/A | modal关闭后N/A | all normal preview states |
| PreviewScoreInput | 216.667×22 @ (695.667,437.333) | mapping initial/value-50 的运行时输入 bbox invariant 已比较通过 | N/A | bounds外错误未采集，BLOCKED | mapping preview states |

瞬时 pointer `:active` 无稳定 after 状态，记录 N/A；不得另造持久视觉状态。

### 预览弹层空间约束

| component/state | container bbox | first/terminal visible child | edge/inset | source_state_ids |
| --- | --- | --- | --- | --- |
| rating/score modal | `600×158 @ (660,461)` | header/body；body bottom=595 | header72；body62；bottom inset24 | rating/score normal previews |
| mapping modal | `600×358.667 @ (660,360.667)` | header/body；body bottom=695.333 | header72；body262.667；bottom inset24 | mapping preview states |
| close button | rating/score `(1212,483,28,28.79)`；mapping `(1212,382.667,28,28.79)` | SVG20×20 | right20；top22 | all normal previews |
| mapping preview input | `(695.667,437.333,216.667,22)` | input自身 | initial/value-50 bbox invariant | mapping preview states |

评分会话已在修复分析器后离线重建：`missing_terminal_anchors=[]`、1720个container constraints、322个variant invariants，空间覆盖 `completed`。完整 anatomy、tokens、relations 和 API 见 `preview-development-contract.md`。

### 共享全屏壳不变量

- `PageHeader`和`FullScreenModal`默认 `min-width:0`；不得继承模板页的1200/1300px下限。
- full-screen shell固定覆盖viewport；header宽度等于viewport，content `min-width:auto`。
- 800px表单容器由业务内容层水平居中：`margin-inline:auto`；共享壳不写800px卡片或其高度。
- footer第一个按钮与800px表单左边缘对齐。1920px目标x=560，通用公式为 `(viewportWidth - 800)/2`。
- footer按钮间距采用单一机制：目标按钮 `margin-right:12px`；共享footer不得再设置12px `gap`，并须清除Element Plus相邻按钮默认左margin，避免第二/第三按钮累积右偏。
- T03 placeholder仅验证壳，不作为三张业务卡片的高度/位置证据；T04替换placeholder后再验收白色卡片。

### 列表高度不变量

- `ReviewRuleTable` 不设置固定/min-height 来撑大白卡片。
- `el-table` 不设置纵向 `max-height`；table content 仅允许横向滚动，`overflow-y:hidden`。
- `PerformanceListPage` 建立当前视口可用高度的 flex-column，`min-height:0`；10行测得的768px是内容结果，不是固定下限。
- white card 内容高度公式为 `max(真实剩余视口, tableWrapper + 56px)`；不得用历史状态的结果高度充当min-height。
- 表头和分页在 0 行仍显示；分页显示总数、当前页、前后页、每页条数。
- 分页 `height:28px; margin:16px 0`，不得推到白卡片底部。

## 6. SVG contract

每个状态的 `svg` 数组以对应 `target_contract.json#/bbox_inventory/{index}` 为唯一页面几何来源。每个实例均记录 `data_icon`、`source_state_id`、`viewBox`、完整 `path`、`fill`、`stroke`、真实页面 `bbox`、所属组件、目标 DOM selector 和 target contract pointer；不得使用 SVG intrinsic/default/estimated size。

### E05 精确 bbox 复核摘要

| source_state_id | 可见 SVG 实例 | 复核结果 |
| --- | ---: | --- |
| `RR-LIST-DEFAULT`、`RR-NEW-HOVER`、`RR-EDIT-HOVER`、`RR-TAB-HOVER`、`RR-FILTER-HOVER`、`RR-SEARCH-FOCUS` | 12/状态 | `target_contract.bbox_inventory` 有真实 bbox；覆盖 DownOutlined、DownBoldOutlined、LarkOutlined、分页左右箭头、Add、Search、Filter、Empty |
| `RR-CREATE-RATING`、`RR-SUBMIT-HOVER`、`RR-PREVIEW-HOVER`、`RR-CANCEL-HOVER`、`RR-ADD-LEVEL-HOVER`、`RR-NAME-FOCUS`、`RR-VALIDATION-ERROR`、`RR-RADIO-FOCUS`、`RR-ADD-LEVEL-FOCUS`、`RR-SUBMIT-FOCUS` | 28/状态 | `target_contract.bbox_inventory` 有真实 bbox；三枚评估类型 radio 的 InfoOutlined 为 16×16，且逐状态记录实际 x/y |
| `RR-EDIT-PREFILLED` | 33 | `target_contract.bbox_inventory` 有真实 bbox；编辑预填等级行的可见图标逐实例回溯 |
| `RR-LEVEL-INLINE-ADD` | 33 | `target_contract.bbox_inventory` 有真实 bbox；新增等级行的 Drag/Delete/上下控件逐实例回溯 |
| `RR-SCORE` | 13 | `target_contract.bbox_inventory` 有真实 bbox；三枚评估类型 radio 的 InfoOutlined 为 16×16 |
| `RR-MAPPING`、`RR-INTERVAL-HOVER` | 26/状态 | `target_contract.bbox_inventory` 有真实 bbox；区间边界上下箭头与 InfoOutlined 逐实例回溯 |
| `RR-INTERVAL-INLINE` | 33 | `target_contract.bbox_inventory` 有真实 bbox；新增区间 Delete 与上下箭头逐实例回溯 |
| `RR-LIST-20-ROWS` | 12 | 补采 target contract `captures/initial/target_contract.json` 提供真实 bbox；22 条 SVG inventory 中纳入 12 个具名/checked 功能实例 |

关键实例（完整数据及 selector 见 JSON）：

- `InfoOutlined`：三个评估类型 radio 在 `RR-CREATE-RATING` 的真实 bbox 分别为 `(637,325,16,16)`、`(733,325,16,16)`、`(899,325,16,16)`；`RR-SCORE` 与 `RR-MAPPING` 对应实例同样逐状态记录。
- checked checkbox：`CheckboxChecked` 使用采集到的 checked path；`RR-CREATE-RATING` bbox=`(583,172,12,12)`，`RR-MAPPING` bbox=`(579,172,12,12)`。
- Drag/Delete：以每个等级/区间实例的 target `x/y/w/h` 为准；例如 `RR-CREATE-RATING` 的 Drag 为 `(581,680,16,16)`，Delete 为 `(1319,680,16,16)`，均带独立 `source_state_id`。
- 分页左右箭头：`RR-LIST-DEFAULT` 的 LeftBoldOutlined=`(1702,496,12,12)`，RightBoldOutlined=`(1774,496,12,12)`。

`RR-LIST-20-ROWS` 已完成补采并写入 `extracted-ui-contract.json`；所有 23 个状态的 E05 SVG 实例均已拥有真实 target-level bbox，E06 interactions 已对象化。T00-E07 已完成双向覆盖/冲突检查；remark textarea 的 resize dragging/after-drag 证据仍缺失，且 E08 已启动但因无 rendered-ui-contract.json 尚未运行，因此 T00 总体继续 blocked。

## T00-E07 双向覆盖与冲突检查

- 检查对象：`extracted-ui-contract.json`、`component-model.md`、`pixel-contract.md`、`acceptance-contract.md`、`atomic-tasks.md`、`capture-manifest.md`、`capture-completion-checklist.md`。
- source state 双向覆盖：23 个 JSON state 均能回溯 `capture-manifest.md`，组件模型覆盖全部 23 个状态；验收契约和原子任务对未逐条展开的状态由本节统一索引：`RR-LIST-DEFAULT`、`RR-LIST-20-ROWS`、`RR-NEW-HOVER`、`RR-EDIT-HOVER`、`RR-EDIT-PREFILLED`、`RR-CREATE-RATING`、`RR-SUBMIT-HOVER`、`RR-PREVIEW-HOVER`、`RR-CANCEL-HOVER`、`RR-ADD-LEVEL-HOVER`、`RR-LEVEL-INLINE-ADD`、`RR-MAPPING`、`RR-INTERVAL-HOVER`、`RR-INTERVAL-INLINE`、`RR-NAME-FOCUS`、`RR-VALIDATION-ERROR`、`RR-SCORE`、`RR-TAB-HOVER`、`RR-FILTER-HOVER`、`RR-SEARCH-FOCUS`、`RR-RADIO-FOCUS`、`RR-ADD-LEVEL-FOCUS`、`RR-SUBMIT-FOCUS`。
- 组件覆盖：JSON 的 9 个组件均在 `component-model.md` 的组件树/契约中存在；业务状态使用的 `ReviewRuleTable`、`PageHeader`、`FullScreenModal`、`ReviewRuleForm`、`ReviewTypeRadioGroup`、`ScoreConfig`、`ScoreMappingConfig`、`LevelConfigEditor`、`FixedActionBar` 均无孤立项。
- 交互覆盖：23 个状态的 36 条 interaction 均已对象化；每项具备 `kind`、`semantic_state`、`target`、`phases`、`before`、`after`、`action`，并保留真实 evidence 路径。
- SVG 覆盖：23 个状态的 528 个 SVG 实例均保留 `source_state_id`、target selector 和 target contract pointer；`coverage.unmapped_*` 与 `cross_document_conflicts` 均为空。
- 可测关系：JSON 的 5 条 `layout_relations` 均来自同一 source state 的 target contract/interaction evidence，未跨状态推断。
- 结果：**基础状态与预览状态的 E07 双向覆盖通过**。主契约 47 个状态 visual inventory 非空；`coverage.unmapped_*`、`cross_document_conflicts`、`missing_terminal_anchors`、`uncompared_variant_groups`、`unmapped_containers` 均为空。预览 rendered contract 几何 compare 已通过；截图 diff 单独保持 failed，不影响 E07 结构审计，但阻塞 PM-T006 像素完成。

## 7. 颜色选择器设计契约

- 触发器：第一行等级颜色控件，`24×24px`，圆角 `9999px`，默认背景 `rgb(253, 226, 226)`；图标为 `ExpandDownFilled`，页面 bbox `x=607.67,y=638.36,w=10,h=10`。
- 面板：使用 portal/tooltip 浮层，打开态 bbox `x=518,y=544,w=189.33,h=77.33`；白底、`0.666667px solid rgb(222,224,227)`、圆角 `8px`；阴影为 `rgba(31,35,41,0.04) 0px 8px 24px 8px, rgba(31,35,41,0.04) 0px 6px 12px 0px, rgba(31,35,41,0.06) 0px 4px 8px -8px`；包含浮层箭头。
- 色板：`6×2`，共 12 个色块；每个 `18×18px`，圆角 `4px`；色值和顺序以 `extracted-ui-contract.json` 的 `RR-COLOR-PICKER-OPEN.fields[0].options` 为准。
- 选中态：当前色块 wrapper 带 active 状态，`DoneOutlined` 页面 bbox `12×12px`；选择第 4 个色块 `rgb(183,237,177)` 后面板关闭，第一行控件背景为 `rgb(217,245,214)`；重新打开后仍保持第 4 个色块 active。
- 父级负责等级行中的 x/y 和行间距，ColorPicker 负责浮层、色板、选中态和开关行为。

## 8. 固定分值20项预览新增variant

该variant的完整组件、字段、状态、几何、SVG和交互投影位于 `fixed-score-options-20-capture-contract.json`。由于主PM-T006仍为 `completion_status: incomplete`、`pixel_restore_status: blocked`，本节不把补充variant错误合并进既有20/40主状态；正式实现前应以该机器投影逐状态回接本文件和主extracted contract。

组件边界：

- `FixedScoreOptionsEditor`：固定分值1～20表单行、拖拽、输入、删除和disabled添加按钮。
- `PerformanceOptionNavigator`：绩效模块标准选项导航组件，提供内容自适应option、自然增长、固定总宽均分和overflow三种布局策略；是否overflow由运行时内容宽度决定，统一负责connector、viewport、左右rail、渐变mask、键盘focus和箭头导航。props为`options`、`layoutPolicy`、`appearanceVariant`，hover默认只改变chip视觉。
- `FixedScorePreviewNavigator`：评分固定分值业务适配器，传入评分选项与评分预设，将固定分值语义映射到`PerformanceOptionNavigator`；20个42×32选项chip、552×38 overflow viewport、左右导航；正式环境hover不触发track自动横向偏移。
- `ReviewRulePreviewModal`：复用600×158预览外壳、72px header、62px body。
- `PreviewCloseButton`：复用20×20 `CloseOutlined`，关闭后必须验证overlay消失。

新增variant不得替换既有固定值20/40目标，也不得跨894×631与1920×1080 viewport合并绝对坐标。
