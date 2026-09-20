# PM-T006 像素契约

```text
completion_status: incomplete
pixel_restore_status: blocked
ui_confirmation_status: confirmed
```

## 1. 环境契约

| 项目 | 值 |
| --- | --- |
| viewport | 1920×1080 |
| DPR | 1 |
| browser | Chrome 151 |
| zoom | 100% |
| color scheme | light |
| fonts | loaded |
| screenshot authority | `capture-manifest.md` 各 source state 的 `after.png` |

## 2. 列表页

| element | bbox / geometry | style / behavior | source_state_ids |
| --- | --- | --- | --- |
| page content | x=240, y=56, w=1680, h=1024 | overflow auto | `RR-LIST-DEFAULT` |
| inner frame | x=260, y=76, w=1640, h=984 | relative | 同上 |
| white table card | x=260, y=162, w=1640；4行基准 h=898，20行 h=1176 | `flex:1 1 0%`；padding 20；white；rounded-8；shadow-md；高度由剩余视口下限与内容共同决定 | `RR-LIST-DEFAULT`, `RR-LIST-20-ROWS` |
| toolbar | x=280, y=182, w=1600, h=32 | margin-bottom 16 | 同上 |
| NewButton | x=280, y=182, 80×32 | filled blue；AddOutlined 14×14 | default/hover states |
| SearchInput | native input x≈1597, y=187, 163×22 | placeholder `通过名称、备注搜索`；SearchOutlined 16×16 | default/focus states |
| FilterButton | x=1800, y=182, 80×32 | white outline；hover bg `rgb(242,243,245)`；FilterOutlined 14×14 | filter states |
| table header cells | target x=`280/487/694/970/1245/1659`, width=`207/207/276/276/414/221px`, y=`231`, h=`47px` | label：名称/评估方式/创建人/创建时间/备注/操作；以目标 `layout.json` 的实际 header bbox 为权威，不得替换为固定 120/120/120/160/240/128px | `RR-LIST-DEFAULT` |
| table header titles | text x=`292/499/706/982/1257/1671`, y=`243` | TH padding=`12px`；title wrapper padding=`0`；font=`14px/22.001px`；禁止叠加 Element Plus `.cell` 的第二层 `12px` padding | `RR-LIST-DEFAULT` |
| row actions | 编辑 28×22；删除 28×22；水平间隔 16 | 编辑 link-primary；删除 disabled | list/edit states |
| pagination | height 28；最后一行后 16px；margin `16px 0`；page-size input约44.91×24 | 0行也显示；单页时左右按钮 disabled；当前页1；默认10条/页 | list states |

目标列宽不是代码中声明的固定整数列宽；`206.92/206.92/275.67/275.89/413.84/220.75px` 是旧推导值，也不作为实现依据。实现验收必须使用上述目标 `layout.json` 的实际 bbox。

实现约束：Element Plus 会把整数分配余数集中到第一个弹性列，单独使用 `120/120/160/160/240/128` 的 `min-width` 权重不能复现目标 bbox。实现应保留这些最小宽度语义，并以目标 `colgroup` 几何的百分比分配约束最终列宽；后台布局存在时还必须覆盖全局 `html { scrollbar-gutter: stable; }`，否则根内容宽度从 1920px 缩为 1910px、白卡片从 1640px 缩为 1630px。

Element Plus 默认同时给 TH 和内部 `.cell` 留出水平 padding。PM-T006 表头只能保留 TH 的 12px padding；内部 `.cell` 必须为 `padding:0`，否则所有标题相对目标整体右移 12px。

### 2.1 列表高度与滚动

| 状态 | viewport/DPR | row/thead | tbody | table wrapper | white card | outer scroll |
| --- | --- | --- | ---: | ---: | ---: | --- |
| 4 行基准 | 1920×1080 / 1 | 约48.67/46.67 | 约194.67 | 334 | 898 | 无需滚动 |
| 10 行 | 1280×639 / 1.5 | 48.67/46.67 | 486.67 | 626 | 682 | 808/583，max 225 |
| 20 行 | 1920×1080 / 1 | 49/48 | 980 | 1120 | 1176 | 1302/1024，max 278 |

精确关系：

```text
tableWrapperHeight ≈ 140 + N × 49
whiteCardHeight = max(parentRemainingHeight, tableWrapperHeight + 56)
```

20 行层级：`fullHeightFrame=1262`、`whiteCard=1176`、`tableWrapper=1120`、`tableContent=1028`、`tbody=980`。10行层级中的 `fullHeightFrame=768` 是内容撑高结果，computed `min-height=0`，不得转写成CSS下限。table/table-wrapper `max-height:none`，table content `overflow-x:auto; overflow-y:hidden`。滚动容器为 `.content.container-padding`，不是 table body。

实现禁止项：

- 禁止 `PerformanceListPage min-height:768px`；
- 禁止 `ReviewRuleTable min-height:800px`；
- 禁止 `el-table max-height:600px`；
- 禁止把分页推到白卡片底部；
- 禁止在表格内部建立纵向 scrollbar。

## 3. 全屏表单

| element | geometry | style / behavior | source_state_ids |
| --- | --- | --- | --- |
| full-screen-modal | 1920×1080 @0,0 | position fixed；z-index 100；padding-top 56；overflow auto；bg `rgb(245,246,247)`；`min-width:0` | all form states |
| PageHeader | x=0,y=0,w=viewport,h=56 | white；Back=SpaceLeftOutlined + 返回 + divider + title；`min-width:0` | create/edit states |
| modal content | y=56, 1920×1024 | display flex；overflow auto；`min-width:auto`；8px vertical scrollbar when content exceeds | form states |
| centered form | width 800；1920目标x=560 | `box-content mx-auto`；业务内容层负责，不属于FullScreenModal | form states |
| form background | full content | `rgb(242,243,245)`；padding 20px 0 48px；由ReviewRuleForm负责 | form states |
| card | width 800 | white；rounded；shadow-sm；px=20；pt=20；三张卡片属于T04 | screenshots + contracts |
| footer | x=0, y=1032, 1920×48 | absolute bottom；z-index 10；white；第一个按钮与800px表单左边缘对齐 | footer states |
| submit | x=560, y=1040, 80×32 | bg `rgb(51,112,255)`；white text；blue border；margin-right12 | footer states |
| preview | x=652, y=1040, 80×32 | white；blue text/border；margin-right12 | footer states |
| cancel | x=744, y=1040, 80×32 | white；dark text；gray border；margin-right12 | footer states |
| button spacing | 单一12px来源 | 目标由按钮右margin产生；禁止footer `gap:12`与Element Plus相邻按钮margin叠加 | footer states |

## 4. 评级编辑器

| element | geometry / rule | source_state_ids |
| --- | --- | --- |
| switch | 28×16 | rating states |
| row drag hit area | 16×32 | rating states |
| code input | content width约234.17、height22；create整体控件约262.5 | rating states |
| name input | content width约234.17、height22 | rating states |
| value input | content width约111.67、height22；数字步进器 | rating states |
| delete icon button | 24×约24.91 | rating states |
| add level | 82×22；AddOutlined 14×14；blue text | add-level states |
| row transition | create 3→4；edit 7 | inline-add/edit states |
| quantified variant | 开关开启后列头 x≈626/854/1081/1202；量化分/量化值输入分别 x≈1080/1199、112×31px；卡片保持800×417 | `RR-RATING-QUANTIFIED` |

量化开关的完整 off/on、字段、列宽、SVG和数据模型契约见 `quantified-rating-contract.md`。

## 4.1 评级颜色选择器

| element | geometry / style | source_state_ids |
| --- | --- | --- |
| 颜色触发器 | `24×24px`；默认 `x=600.67,y=631.33`；圆角9999px；默认背景 `rgb(253,226,226)` | `RR-COLOR-PICKER-OPEN` |
| 触发器图标 | `ExpandDownFilled`；`10×10px @ (607.67,638.36)`；path 以 JSON 为准 | `RR-COLOR-PICKER-OPEN`, `RR-COLOR-PICKER-REOPENED` |
| 颜色面板 | `189.33×77.33px @ (518,544)`；白底；0.666667px灰边；8px圆角；portal z-index 1030；实测三层阴影 | `RR-COLOR-PICKER-OPEN` |
| 面板内容 | 12px/16px上下/左右 padding；内部 color-picker约156×52；6列×2行；行列 gap 8px | `RR-COLOR-PICKER-OPEN` |
| 色块 | 12个；每个18×18px；圆角4px；完整色值顺序见 extracted JSON | `RR-COLOR-PICKER-OPEN` |
| 选中图标 | `DoneOutlined` 12×12px；初始第1个色块 bbox `(541.67,563.83,12,12)` | `RR-COLOR-PICKER-OPEN` |
| 选择结果 | 选择第4色 `rgb(183,237,177)`；面板关闭；触发器背景变为 `rgb(217,245,214)` | `RR-COLOR-SELECTED` |
| 重开状态 | 重新打开后第4色保持active；面板实测约 `184×75px @ (521,546)`，允许浮层定位/动画导致的亚像素变化 | `RR-COLOR-PICKER-REOPENED` |

完整色板顺序：`rgb(251,191,188)`、`rgb(254,212,164)`、`rgb(248,230,171)`、`rgb(183,237,177)`、`rgb(169,239,230)`、`rgb(177,232,252)`、`rgb(186,206,253)`、`rgb(180,185,243)`、`rgb(205,178,250)`、`rgb(239,185,239)`、`rgb(249,174,217)`、`rgb(210,211,212)`。

实现禁止使用原生 `input[type=color]` 的系统面板代替该固定12色色板；不得用 `DownOutlined` 近似替代 `ExpandDownFilled`，不得遗漏 `DoneOutlined`、浮层箭头、边框或阴影。

| element | geometry / options | source_state_ids |
| --- | --- | --- |
| score method | 2 个水平 radio；上下限输入 / 固定分值选项 | `RR-SCORE` |
| lower/upper | 两个 input；placeholder 精确按 component model | `RR-SCORE` |
| precision | 3 个水平 radio：0/1/2 位 | `RR-SCORE` |

## 6. 评分映射等级型

| element | geometry / rule | source_state_ids |
| --- | --- | --- |
| interval header | 三列同一行；`分数子区间 *` 跨下限/运算符/上限组合列（约248px）；`等级代号 *` 对齐 code 列，`等级名称` 对齐 name 列；code/name 列宽新增前约207px、新增后约193px；表头行高约22px；不覆盖删除列 | `RR-MAPPING`, `RR-INTERVAL-INLINE` |
| lower/upper | native content各约339.2×22 | `RR-MAPPING` |
| interval bound | content约75.07×22；左侧边界为派生只读，右侧可编辑边界按 precision 使用1/0.1/0.01步进；所有值不得小于0 | mapping/inline states |
| code/name before add | content各约207×22 | `RR-MAPPING` |
| code/name after add | content各约193×22 | `RR-INTERVAL-INLINE` |
| delete icon | 24×约24.91 | interval states |
| add interval | 124×22；AddOutlined | interval states |
| content height | 1081 before add；1126 after add | mapping/inline states |
| scroll | content client 1024，scrollbar 8px | mapping/inline states |
| precision | 0/1/2 位小数 | mapping states |

## 6.1 评估规则预览

完整状态、机器索引和开发边界见 `preview-extracted-ui-contract.json`、`preview-development-contract.md`。

### 共享 modal

| element | rating / score | mapping | style / relation | source_state_ids |
| --- | --- | --- | --- | --- |
| modal root | `600×158 @ (660,461)` | `600×358.667 @ (660,360.667)` | white；radius8；水平居中 | normal preview states |
| header | `600×72 @ (660,461)` | `600×72 @ (660,360.667)` | padding `24px 56px 24px 24px` | 同上 |
| body | `600×62 @ (660,533)` | `600×262.667 @ (660,432.667)` | padding-inline24；bottom inset24 | 同上 |
| close button | `28×28.7917 @ (1212,483)` | `28×28.7917 @ (1212,382.667)` | padding4；radius6；color `rgb(100,106,115)` | 同上 |
| CloseOutlined | `20×20 @ (1216,487.792)` | `20×20 @ (1216,387.458)` | exact path来自interaction evidence | 同上 |

### 类型内容

| variant | target | source_state_ids |
| --- | --- | --- |
| rating non-quantified | C/B/A顺序；共享600×158外壳 | `RR-PREVIEW-RATING-NON-QUANTIFIED` |
| rating quantified | switch `false→true`、量化分1/2/3；外壳与非量化一致 | `RR-PREVIEW-RATING-QUANTIFIED-FORM`, `RR-PREVIEW-RATING-QUANTIFIED` |
| score bounds | preview native input `216.667×22 @ (695.667,537.667)`；bounds 0～100 | `RR-PREVIEW-SCORE-BOUNDS` |
| score fixed | body显示20/40；不显示bounds输入 | `RR-PREVIEW-SCORE-FIXED` |

### 6.1 固定分值20项新增variant

该variant不替换既有20/40目标，机器投影见 `fixed-score-options-20-capture-contract.json`。

| 元素/状态 | 目标值 | source evidence |
| --- | --- | --- |
| form fixture | 固定分值1～20，共20项；添加分值disabled | `RR-SCORE-FIXED-OPTIONS-20-FORM` |
| modal root | `600×158px`；本session可视坐标`(147,236.667)` | 首屏/末屏/边缘hover states |
| header/body | header `72px`；body `62px` | 首屏/末屏 |
| navigator viewport | `552×38px`；overflow hidden | 首屏/末屏/边缘hover states |
| option chip | `42×32px`；横向pitch `54px` | 首屏/末屏 |
| track offset | 首屏`x=171`；末屏`x=-345`；hover 5/10/11/15均保持所在窗口track不变 | 对应 after layout；step_05/step_09的采集环境偏移为observed-not-target |
| navigation | 首屏仅RightOutlined；末屏仅LeftOutlined；正式环境hover不改变按钮显示 | 对应 after layout / SVG evidence |
| close | CloseOutlined `20×20px`，dismiss verified | step12 interaction evidence |

所有绝对坐标绑定`894×631 / DPR≈1 / Chrome152 / light / fonts loaded`，禁止跨viewport合并。rendered contract、截图diff和像素验收保持`not-run`。
| mapping initial | preview native input `216.667×22 @ (695.667,437.333)`；0～100、边界60 | `RR-PREVIEW-MAPPING-INITIAL` |
| mapping value | 输入50后结果更新；modal/header/body/input bbox不变 | `RR-PREVIEW-MAPPING-VALUE-50` |

### 预览关闭

```text
semantic target: 关闭预览
strategy: inferred_icon_semantics
icon: CloseOutlined
risk: safe_reversible_dismiss
required result: dismiss_verification.status=verified, dismissed=true
```

### 预览空间阻塞

评分会话修复分析器后已离线重建，`derived_spatial_constraints.coverage.missing_terminal_anchors=[]`、`uncompared_variant_groups=[]`，空间关系证据完整。

## 6.2 备注 textarea resize

| phase | bbox | evidence | source_state_id |
| --- | --- | --- | --- |
| default | `758.667×49.333 @ (580.667,904.667)` | `...115630_896677/step_00/before` | `RR-REMARK-RESIZE-DEFAULT` |
| dragging | `758.667×149.000 @ (576.667,904.667)` | `...115630_896677/step_00/dragging` | `RR-REMARK-RESIZE-DRAGGING` |
| after-drag | `758.667×149.000 @ (576.667,904.667)` | `...115630_896677/step_00/after` | `RR-REMARK-RESIZE-AFTER` |

约束：`resize: vertical`；`after.height > default.height`；不得用静态第二高度或脚本改style替代真实pointer resize证据。

## 7. 校验态

| element | state | source_state_ids |
| --- | --- | --- |
| name | red border + `名称为必填` | `RR-VALIDATION-ERROR` |
| default grade codes | 3 行分别显示 `等级代号为必填` | `RR-VALIDATION-ERROR` |
| submit | 点击被前端校验阻断，无有效业务写入 | `RR-VALIDATION-ERROR` |

## 8. 图标契约

`extracted-ui-contract.json` 的每个状态 `svg` 数组是图标页面几何真源：每个可见 named data-icon/checked-checkbox 实例均绑定 `source_state_id`、target selector、`target_contract.json#/bbox_inventory/{index}`、实际 x/y/width/height bbox、viewBox、path、fill/stroke 和所属组件。不能用 SVG intrinsic size 代替页面 bbox。

已复核的关键目标值：

- 三枚评估类型 radio 的 `InfoOutlined`：`RR-CREATE-RATING` 为 `(637,325,16,16)`、`(733,325,16,16)`、`(899,325,16,16)`；其他类型状态也逐实例记录。
- checked checkbox：`RR-CREATE-RATING` 为 `(583,172,12,12)`；`RR-MAPPING` 为 `(579,172,12,12)`。
- `RR-CREATE-RATING` 第一条等级行：`DragOutlined=(581,680,16,16)`、`DeleteTrashOutlined=(1319,680,16,16)`。
- `RR-LIST-DEFAULT` 分页箭头：`LeftBoldOutlined=(1702,496,12,12)`、`RightBoldOutlined=(1774,496,12,12)`。

- `RR-LIST-20-ROWS`：补采 target contract `captures/initial/target_contract.json` 的 22 条 SVG bbox inventory 已纳入 JSON，功能 SVG 共 12 个；分页箭头真实 bbox 为 `LeftBoldOutlined=(1694,1275,12,12)`、`RightBoldOutlined=(1766,1275,12,12)`，每页条数 `DownBoldOutlined=(1854,1275,10,10)`。

所有 23 个旧 source state、17 个预览 source state 和 3 个 resize source state 的 visual inventory 均已非空；评分空间约束 `missing_terminal_anchors=[]`、`uncompared_variant_groups=[]`、`unmapped_containers=[]`，备注 textarea 三阶段 bbox 已完成。T00-E07 与预览 rendered contract 几何比较已通过；严格截图 diff 仍因原始目标水印/字体栅格差异失败，故像素恢复继续 blocked。

## 9.1 预览实现证据

- rendered contract：`rendered-ui-contract.json`，由 `capture_review_rule_preview.py` 通过 Chrome CDP 在 1920×1080/DPR1/light/fonts-loaded 环境生成。
- contract compare：`python .claude/skills/performance-spec-development/scripts/compare_preview_contract.py --target preview-extracted-ui-contract.json --runtime evidence/preview-diff/runtime-snapshots.json --out rendered-ui-contract.json`，结果 `passed`，modal/header/body/CloseOutlined/preview input 关系均在 ±1px 内。
- screenshot diff：`python .claude/skills/performance-spec-development/scripts/compare_preview_screenshots.py --dir evidence/preview-diff`，生成 9 组 target/actual/diff 和 `diff-results.json`；严格全屏阈值 `channel_tolerance=3`、`max_diff_pixel_ratio=0.01` 下结果 `failed`，主要差异来自目标截图水印及字体栅格化，不得将其标记为 pixel passed。

## 9. 实现差异规则

- 每个实现状态必须使用本文件对应的目标 `after.png`。
- 不得用旧列宽、Element Plus 近似图标或 AddLevelModal。
- T06 在同一 viewport/DPR/font fixture 下输出目标图、实现图和 diff。
- 允许抗锯齿微差；不允许结构、bbox、颜色、SVG path、滚动和状态缺失。

## 2.2 Header Alignment Verification

- Target white table card: `x=260, width=1640px`; inner table starts at `x=280px` after 20px padding.
- Target outer scroll container has a `0px` visible scrollbar. A scrollbar consuming about 10px shrinks the card to about 1630px and shifts the right-side headers.
- The issue must be diagnosed against the rendered header bboxes. Do not use the implementation's fixed `120/120/120/160/240/128px` widths as the target contract; the target widths and x positions are the measured `RR-LIST-DEFAULT` values above.
- At 1920x1080, DPR1 and 100% zoom, acceptance requires the 1640px card and fixed six-column x sequence while long lists continue to scroll in the outer container.

## T00-E07 双向覆盖与冲突检查

- 检查对象：`extracted-ui-contract.json`、`component-model.md`、`pixel-contract.md`、`acceptance-contract.md`、`atomic-tasks.md`、`capture-manifest.md`、`capture-completion-checklist.md`。
- source state 双向覆盖：23 个 JSON state 均能回溯 `capture-manifest.md`，组件模型覆盖全部 23 个状态；验收契约和原子任务对未逐条展开的状态由本节统一索引：`RR-LIST-DEFAULT`、`RR-LIST-20-ROWS`、`RR-NEW-HOVER`、`RR-EDIT-HOVER`、`RR-EDIT-PREFILLED`、`RR-CREATE-RATING`、`RR-SUBMIT-HOVER`、`RR-PREVIEW-HOVER`、`RR-CANCEL-HOVER`、`RR-ADD-LEVEL-HOVER`、`RR-LEVEL-INLINE-ADD`、`RR-MAPPING`、`RR-INTERVAL-HOVER`、`RR-INTERVAL-INLINE`、`RR-NAME-FOCUS`、`RR-VALIDATION-ERROR`、`RR-SCORE`、`RR-TAB-HOVER`、`RR-FILTER-HOVER`、`RR-SEARCH-FOCUS`、`RR-RADIO-FOCUS`、`RR-ADD-LEVEL-FOCUS`、`RR-SUBMIT-FOCUS`。
- 组件覆盖：JSON 的 9 个组件均在 `component-model.md` 的组件树/契约中存在；业务状态使用的 `ReviewRuleTable`、`PageHeader`、`FullScreenModal`、`ReviewRuleForm`、`ReviewTypeRadioGroup`、`ScoreConfig`、`ScoreMappingConfig`、`LevelConfigEditor`、`FixedActionBar` 均无孤立项。
- 交互覆盖：23 个状态的 36 条 interaction 均已对象化；每项具备 `kind`、`semantic_state`、`target`、`phases`、`before`、`after`、`action`，并保留真实 evidence 路径。
- SVG 覆盖：23 个状态的 528 个 SVG 实例均保留 `source_state_id`、target selector 和 target contract pointer；`coverage.unmapped_*` 与 `cross_document_conflicts` 均为空。
- 可测关系：JSON 的 5 条 `layout_relations` 均来自同一 source state 的 target contract/interaction evidence，未跨状态推断。
- 结果：**基础状态与预览状态的 E07 双向覆盖通过**。主契约 47 个状态 visual inventory 非空；评分空间约束与备注 resize 证据已完成；预览 rendered contract 几何 compare 已通过；严格全屏截图 diff 单独保持 failed，不影响 E07 结构审计，但阻塞 PM-T006 像素完成。
