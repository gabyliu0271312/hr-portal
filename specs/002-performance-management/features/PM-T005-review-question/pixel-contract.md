# PM-T005 像素契约

```text
completion_status: incomplete
pixel_restore_status: blocked
uncovered_reasons:
- 2026-08-30 21 个真实菜单规则状态（7 个目标规则 × 首屏/滚动后/选择后）的数值几何已投影到 `schema_version: 2` 机器契约
- rendered UI contract 和截图 diff 尚未运行
- 普通评估题评级长代号仅有用户截图，缺少完整采集 session、rendered contract 和截图 diff
- disabled、ErrorFilled SVG 和 textarea resize after-drag 仍缺证据
```

> 参数来源：采集器工程 `D:\AI项目\Perfect-Web-Clone-IDE`；采集产物位于 `C:\Users\gaby.liu\ClonedSites\idreamsky.feishu.cn_20260825_153141`。以下每行均保留参数标签和来源 session。未确认值必须标记为 `TBD(blocked)`，不得用相邻字段或默认样式推导。

## 1. 页面级几何

| element | value | source |
|---|---|---|
| viewport | `1920x1080`, DPR `1` | `192706_982839`, `192927_379131` |
| full-screen shell | `x=0,y=0,w=1920,h=1080` | `bbox_inventory` |
| header | `x=0,y=0,w=1920,h=56` | `bbox_inventory` |
| content column | `x=240,y=56,w=1680,h=1024` | `content container-padding` |
| content frame | `x=260,y=76,w=1640,h=984` | `content-frame` |
| content wrapper | `x=260,y=118,w=1640,h=942` | `setting-content-wrapper` |
| shell background | `rgb(245,246,247)` | computed |
| header background | `rgb(60,74,115)` | computed |

## 2. Card geometry

| component | bbox | confirmed style | source |
|---|---|---|---|
| BasicInfoCard | `x=556,y=74,w=800,h=388` | `ud__card--shadow-sm`, `ud__card--br-sm`, no border | `192927_379131/target_contract.json` |
| ReviewRuleCard | `x=556,y=478,w=800,h=515` | `ud__card--shadow-sm`, `ud__card--br-sm`, no border | `192927_379131/target_contract.json` |
| RemarkCard | `x=556,y=1438,w=800,h=161` | `ud__card--shadow-sm`, `ud__card--br-sm`, no border | `192927_379131/target_contract.json` |
| card horizontal alignment | all `x=556,w=800` | centered in content frame | same |

### 2.1 Computed card and form tokens

| token | value | source |
|---|---|---|
| card padding | `20px 20px 0 20px` (top/right/bottom/left) | `190736_735382` computed |
| card radius | `8px` | `190736_735382` computed |
| card shadow | `rgba(31,35,41,0.02) 0 1px 2px -2px, rgba(31,35,41,0.02) 0 2px 4px 0, rgba(31,35,41,0.02) 0 2px 8px 2px` | `190736_735382` computed |
| base form text | `14px/22px`, `rgb(31,35,41)`, field label `font-weight:600` | user-provided target computed-style output; `190736_735382` computed for color token | confirmed; required mark remains `font-weight:400` |
| required mark | `14px/22px`, `rgb(245,74,69)` | `190736_735382` computed |

## 3. Field and control geometry

| component | bbox / value | source |
|---|---|---|
| language checkbox inputs | `16x16`; first `x=577,y=168`, second `x=653,y=168` | `192219_038154` |
| type radio inputs | `16x16`; x positions `577,715,856,966`, y `422` | `192219_038154` |
| name input | `x=588,y=243,w=695,h=28` in selected-state contract | `192927_379131` |
| description control area (normal create state) | `x=580.67,y=319.33,w=758.67,h=49.33` (native textarea and counter control bbox) | `20260826_174927_786103/step_00/checkpoint/target_contract.json` |
| review rule trigger input | `x=588,y=571,w=695,h=28` | `192927_379131` |
| review rule expanded overlay | `x=581,y=605,w=759,h=213` | `192706_982839` |
| remark control area | `x=581,y=825,w=759,h=107` | `192219_038154` |
| description counter | `/1000` | validation and interaction evidence |
| remark counter | `/2000` | validation and interaction evidence |

### 3.1 Layout containment clarification

The normal create-state description control is `49.33px` high. The earlier `107px` value was a mixed-session wrapper measurement and is retired for implementation. Validation-state error messages are separate from the normal control geometry. The `388px` BasicInfoCard bbox includes the type label and all type radio options; the type row must remain contained within that card at the captured viewport. Any overflow caused by nested Element Plus form margins or duplicated box heights is a contract violation.

### 3.2 Coordinate composition boundary

The name, description, and type geometry rows originate from multiple capture states. Their absolute y-values are authoritative for the named control in its source state, but are not a single-state vertical spacing chain. Do not derive inter-field margins by subtracting coordinates across those sessions.

## 4. Fixed footer

| element | value | source |
|---|---|---|
| submit | `x=560,y=1040,w=80,h=32`, filled blue | `192442_079083` |
| preview | `x=652,y=1040,w=80,h=32`, outlined | `192442_079083` |
| cancel | `x=744,y=1040,w=80,h=32`, outlined neutral | `192442_079083` |
| button gap | `12px` | computed / bbox sequence |
| footer fixed offset | bottom `8px` from 1080 viewport | bbox + computed |
| footer outer bbox | `x=560,y=1040,w=264,h=32`; button gap `12px` | bbox inventory |
| button padding/radius | `4px 11px`, radius `6px` | `190736_735382` computed |

### 4.1 Control and SVG tokens

| control | value | source |
|---|---|---|
| checkbox | `16x16`, white fill, border `rgb(143,149,158)`, radius `4px` | `192219_038154` computed |
| checkbox disabled | not observed; keep `N/A/not observed` | capture evidence |
| radio | `16x16`, selected fill `rgb(20,86,240)`, checked ink white, radius `999999px`, label `14px/22px` | `192219_038154` computed |
| SVG icons | exact `data-icon`, `viewBox`, `path d`, fill/stroke per target contract | `192219_038154`, `192442_079083`, `190403_023043` |

### 4.2 SVG path registry

The following registry is the current source-of-truth mapping. Implementations must preserve the icon name, viewBox and path instead of substituting a visually similar icon.

| component/state | data-icon | viewBox | path d |
|---|---|---|---|
| list create entry | `AddOutlined` | `0 0 24 24` | `M12 2a1 1 0 0 0-1 1v8H3a1 1 0 1 0 0 2h8v8a1 1 0 0 0 2 0v-8h8a1 1 0 1 0 0-2h-8V3a1 1 0 0 0-1-1Z` |
| filter control | `FilterOutlined` | `0 0 24 24` | `M16 11.431V21a1 1 0 1 1-2 0V11c0-.147.032-.287.089-.412a.96.96 0 0 1 .4-.467L20 6.83V4H4v2.866l5.345 3.195A1 1 0 0 1 10 11v6.5a1 1 0 1 1-2 0v-6.035c-.477-.285-3.369-1.867-4.957-2.735A2 2 0 0 1 2 6.975V4a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v2.945a2 2 0 0 1-1.035 1.752L16 11.43Z` |
| pagination previous | `LeftBoldOutlined` | `0 0 24 24` | `m16.314 3.515-.707-.707a1 1 0 0 0-1.414 0l-7.779 7.778a2 2 0 0 0 0 2.829l7.779 7.778a1 1 0 0 0 1.414 0l.707-.707a1 1 0 0 0 0-1.414L9.243 12l7.07-7.072a1 1 0 0 0 0-1.414Z` |
| pagination next | `RightBoldOutlined` | `0 0 24 24` | `m7.586 20.486.707.707a1 1 0 0 0 1.414 0l7.778-7.778a2 2 0 0 0 0-2.829L9.707 2.808a1 1 0 0 0-1.414 0l-.707.707a1 1 0 0 0 0 1.414l7.07 7.072-7.07 7.07a1 1 0 0 0 0 1.415Z` |
| validation error | `ErrorFilled` | not observed | no real PM-T005 instance or path/bbox was captured; keep unresolved |
| global header mark | `LarkOutlined` | `0 0 24 24` | path extracted from full-page icon inventory; two `currentColor` paths recorded in `200816_394689/interaction_evidence.json` |

`ErrorFilled` remains unresolved because no real instance was present in the current PM-T005 source states. `LarkOutlined` is resolved through the full-page SVG inventory; it must not be replaced with a guessed icon.

## 6. 2026-08-26 evidence correction

Authoritative same-state evidence is session `idreamsky.feishu.cn_20260826_185525_429469`, `hybrid-000-after`, from the collector output under `C:\Users\gaby.liu\ClonedSites`. The name input control is `x=581,y=238,w=759,h=31`; the description textarea is `x=581,y=319,w=759,h=49`; the remark textarea is `x=581,y=729,w=759,h=49`. Therefore `name.width = description.width = remark.width = 759px`. The earlier `695px` name value came from a different selected-state capture and is retired.

The target computed evidence reports `resize: vertical`, `min-height: 49.3333px`, and `max-height: 2.23696e+07px` for both textareas. A realtime recording attempt produced `recording_event_count=0`; no trusted `dragging` or `after-drag` bbox is claimed. Those interaction states remain `blocked/not_observed` until the collector records an actual resize gesture.

## 5. Remaining contract limits

- Card padding, shadow tokens, label line-height, checkbox/radio styles and footer geometry are now extracted. The exposed SVG paths are recorded in the registry above; only `ErrorFilled` remains unresolved because no real instance was observed in the target states.
- The source page exposes no real disabled instance for these controls; disabled is `N/A/not observed`, not a guessed visual state.
- Return control has no `role`/`tabindex`; keyboard focus is `N/A`.
- Entry, preview, submit, cancel and top-return after-click states are linked to standalone contracts in the five `190xxx/191xxx` sessions. All current layout artifacts pass strict JSON validation.

## 2026-08-30 规则模块变体证据

本次新增的规则模块变体均以正式环境的独立 `after.png`、`after.html`、`layout.json`、`computed.json`、`target_contract.json` 和 `interaction_evidence.json` 为视觉来源；具体 session 映射见 `capture-manifest.md` 和 `state-matrix.md`。

| variant | entry modes | 证据状态 | 像素开发约束 |
|---|---|---|---|
| rating-off | 普通题、子题 | captured | 评级可参与计算关闭态；不得显示打开态量化分结构 |
| rating-on | 普通题、子题 | captured | 评级可参与计算打开态；量化分相关字段、提示和卡片几何按目标证据实现 |
| score-range | 普通题、子题 | captured | 页面实际文案为“在分数上线限内输入评分”；按上下限输入型结构还原 |
| score-fixed | 普通题、子题 | captured | 固定分值选项结构按目标证据还原，不与 score-range 复用字段布局 |
| score-mapping | 普通题 | captured | 评分映射等级型独立结构；本次目标是“测试--评分映射等级型” |

### 2026-08-30 score-fixed 共享分值标签精确契约

视觉真源：`20260830_211313_909144:score-fixed` 子评估题状态；普通评估题与子评估题共同调用 `FixedScoreOptionsSummary`。目标截图：`C:\\Users\\gaby.liu\\ClonedSites\\idreamsky.feishu.cn_20260830_211313_909144\\captures\\hybrid_steps\\step_18\\after\\after.png`。

| element | bbox / style | source |
|---|---|---|
| ReviewRuleCard | `x=560,y=478,w=800,h=215` | `target_contract.json` card root |
| fixed-score-options row | `x=580.67,y=621.33,w=758.67,h=51` | `target_contract.json` |
| fixed-score-options label | `x=580.67,y=621.33,w=758.67,h=22`，文案「分值选项」 | `target_contract.json` |
| options content area | `x=580.67,y=651.33,w=758.67,h=21`（两项样例） | `target_contract.json` |
| single option | `width:auto`，`min-width=46px`，`height=21px`，`padding:0 8px` | `computed.json`，`bg-B-100 px-4 text-14 min-w-23 text-center` |
| option shape | `border:0`，`border-radius:1000px`，`box-shadow:none` | `computed.json` |
| option color | `background:rgb(225,234,255)`，`color:rgb(12,41,110)` | `computed.json` |

分值标签宽度属于**单项内容自适应**约束：每个标签按自身分值文本宽度增长，`46px` 仅为目标最小宽度，不是全部选项的固定宽度。列表内容区属于**父级宽度约束**：最大宽度为卡片内容区约 `758.67px`，标签超出当前行时换行；换行后 `ReviewRuleCard` 高度必须由实际内容收口，不能通过固定高度裁剪或让标签溢出白底卡片。`FixedScoreOptionsSummary` 内部只显示「分值选项」和标签，不显示评分方式或精度；普通评估题的评估方式/展示方式卡由组件外的页面组装层保留，子评估题不显示附加卡片。

实现验收必须同时检查：普通评估题与子评估题使用同一个 `FixedScoreOptionsSummary` 组件、单项标签宽度随短/长分值变化、最小宽度、胶囊形状、统一 `B-100` 底色、列表 `flex-wrap`、卡片四边收口，以及多行后卡片高度增长。

### 2026-08-30 score-range 共享摘要契约

视觉真源：子评估题 `20260830_210157_422985:score-range`；普通评估题 `20260830_213631_473164:score-range` 用于确认外围 `EvaluationMethodCard` 差异。两个入口的规则卡内部共同调用 `ScoreRangeSummary`：字段标签为「评分上下限」，下限、连接符 `-`、上限和小数位规则保持单行，组件自身不接收 `entryMode` 或题目类型，不渲染「评分配置」、独立「评分方式」或独立「精度」行。普通评估题额外的评估方式卡不属于该组件。

### 2026-08-30 rating-off / rating-on 评级附加卡精确契约

目标状态：`20260830_124330_654379:base`（rating-off）和 `20260830_124906_523866:base`（rating-on）。规则配置来源为选择的 `rule_id` 对应的最新详情。

#### 量化分开关依赖

| rule variant | `grade_participates_in_calculation` | 量化分列 | 隐藏等级量化分 |
|---|---:|---|---|
| rating-off | `false` | 不显示 | 不显示 |
| rating-on | `true` | 显示 | 以 `hide_grade_quantified_score` / `hideGradeQuantifiedScore` 初始化可操作的本地开关状态；不写入评估题 payload、不写回评估规则 |

「隐藏等级量化分」属于评估规则配置，不属于新建评估题字段；评估题页面以规则配置初始化本地开关，允许用户操作预留状态，但不得把该值写入评估题 payload 或反向写回评估规则。

#### EvaluationMethodCard

| element | bbox / style | source |
|---|---|---|
| card | `x=556,y=836,w=800,h=134` | `target_contract.json` |
| field label | `x=576.67,y=896.67,w=758.67,h=22.67` | `layout.json` |
| radio group | `x=576.67,y=927.33,w=434,h=22` | `layout.json` |
| radio group layout | `display:inline-flex`；列间距 `24px`；行间距 `8px` | `computed.json` |
| option wrappers | `80px / 136px / 170px`，均为 `22px` 高 | `computed.json` |

字段 label 与 radio group 必须上下排列；不得使用 `112px` label 列与 control 横向并排布局。InfoOutlined 图标只在对应目标选项存在时渲染，不得对所有选项无条件追加。

#### DisplayMethodCard

| element | rating-off | rating-on | source |
|---|---:|---:|---|
| card | `800×263px` | `800×325px` | `layout.json` |
| field label | `x=576.67,y=1046.67,w=758.67,h=22.67` | 同左 | `layout.json` |
| control area | `x=576.67,y=1073.33,w=758.67,h=155` | 同左 | `layout.json` |
| radio group | `x=576.67,y=1103.33,w=752,h=125` | 同左 | `layout.json` |
| option card | `368×125px` | `368×125px` | `layout.json` |

两个选项卡片的横向位置为 `x=576.67` 与 `x=960.67`，间距 `16px`。每张卡片由上下两个区域组成：上部 `59.33px` 的标题/单选区域，下部 `65.67px` 的预览区域。标签样式下部显示标签预览，下拉样式下部显示等级下拉预览。rating-off 不显示「隐藏等级量化分」；rating-on 才显示该规则配置项，因此卡片高度随规则配置变体变化。

选中卡片上部目标背景为 `rgb(240,244,255)`、边框为 `rgb(51,112,255)`；未选中上部背景透明；上下区域分别使用 `8px` 顶部/底部圆角，预览区不得与上部合并为单层卡片。

### 2026-08-31 评级开关驱动附加卡片

目标状态：`20260830_124330_654379:base`（rating-off）和 `20260830_124906_523866:base`（rating-on）。

| element | rating-off | rating-on | source |
|---|---:|---:|---|
| `grade_participates_in_calculation` | `false` | `true` | selected rule latest config |
| 量化分列 | 不显示 | 显示 | `target_contract.json` |
| 隐藏等级量化分 | 不显示 | 按 `hide_grade_quantified_score` / `hideGradeQuantifiedScore` 展示只读当前状态 | `target_contract.json` |
| DisplayMethodCard | `x=556,y=986,w=800,h=263` | `x=556,y=986,w=800,h=325` | `layout.json` |

「隐藏等级量化分」不属于评估题表单字段，不进入评估题保存请求；规则切换时从新的 `rule_id` 详情重新初始化本地开关，用户操作只更新预留状态，本次不写回规则。

#### EvaluationMethodCard

| element | target value | source |
|---|---|---|
| card | `x=556,y=836,w=800,h=134` | `target_contract.json` |
| field label | `x=576.67,y=896.67,w=758.67,h=22.67` | `layout.json` |
| radio group | `x=576.67,y=927.33,w=434,h=22` | `layout.json` |
| option wrapper widths | `80px / 136px / 170px` | `computed.json` |
| group layout | `display:inline-flex`，column gap `24px`，row gap `8px` | `computed.json` |

label 和 radio group 必须上下排列，不得使用 `112px` label 列横向并排。信息图标仅在目标选项存在时显示，不得对所有选项无条件追加。

#### DisplayMethodCard

| element | target value | source |
|---|---|---|
| field label | `x=576.67,y=1046.67,w=758.67,h=22.67` | `layout.json` |
| control area | `x=576.67,y=1073.33,w=758.67,h=155` | `layout.json` |
| option group | `x=576.67,y=1103.33,w=752,h=125` | `layout.json` |
| option cards | `x=576.67/960.67,y=1103.33,w=368,h=125`，间距 `16px` | `layout.json` |
| choice panel | 每张 `368×59.33px`，padding `8px 12px`，顶部圆角 `8px` | `computed.json` |
| preview panel | 每张 `368×65.67px`，底部圆角 `8px`，上边框为 `0`，`padding-inline=0` | `computed.json` |
| CBAS SVG | `x=592.33,y=1174.67,w=336,h=32`；相对 preview panel 左 inset `15.66px`、右 inset `16.34px` | `target_contract.json` |
| selected choice panel | 背景 `rgb(240,244,255)`，边框 `rgb(51,112,255)` | `computed.json` |

采集目标的标签样式 preview panel 是固定的 `C/B/A/S` 示例 SVG，与所选评估规则实际等级数据无关；下拉样式 preview panel 显示「请选择等级」下拉预览。rating-off 不渲染隐藏量化分项，rating-on 才渲染该规则配置展示。

### 2026-08-30 rating-on 精确布局

目标状态：`20260830-122043:base`（子评估题）及对应普通题状态 `20260830-124906:base`。

| component | bbox | content |
|---|---|---|
| BasicInfoCard | `x=556,y=74,w=800,h=388` | 基本信息、语言、名称、描述、类型 |
| ReviewRuleCard | `x=556,y=478,w=800,h=342` | 规则选择 + 配置等级描述 |
| EvaluationMethodCard | `x=556,y=836,w=800,h=134` | 评估方式、评级方式 |
| DisplayMethodCard | `x=556,y=986,w=800,h=325` | 展示方式、选项样式 |
| RemarkCard | `x=556,y=1327,w=800,h=160.67` | 备注、0/2000 |

规则卡片内部：

| element | bbox/value |
|---|---|
| rule select | `x=576.67,y=569.33,w=758.67,h=32` |
| selected trigger | 仅显示规则名称，`height=28px`、`line-height=28px`、`white-space=nowrap` |
| expanded option secondary | 名称下显示规则类型/摘要；option item `height=50px`、`padding-top/bottom=4px`、content `42px` |
| level description label | `x=576.67,y=621.33,w=84,h=22`，文案「配置等级描述」 |
| code column | `x=576.67,y=651.33,w=70`，文案「等级代号」 |
| name column | `x=654.67,y=651.33,w=70`，文案「等级名称」 |
| quantified column | `x=732.67,y=651.33,w=70`，文案「量化分」 |
| description column | `x=810.67,y=651.33,w=524.67`，文案「等级描述」 |
| level A row | `x=576.67,y=681.33,w=758.67,h=31.33`，值「等级A / 名称A / 1」 |
| level B row | `x=576.67,y=724.67,w=758.67,h=31.33`，值「等级B / 名称B / 2」 |
| level C row | `x=576.67,y=768,w=758.67,h=31.33`，值「等级C / 名称C / 3」 |

评估方式卡片的字段文案为「评级方式」，选项为「直接评级」「通过子评估项评级」「作为总分项计算评级」。展示方式卡片的字段文案为「选项样式」，并包含「配置仅对评级/固定评分题生效」「标签样式」「下拉样式」「隐藏等级量化分」及对应说明。

### 2026-08-31 普通评估题评级长代号补充契约

适用范围：`entry_mode=regular_question + review_type=评级`，同时适用于 `rating-off` 和 `rating-on`。目标来源为用户提供的普通评估题长代号截图；没有完整采集 session，以下参数属于用户确认后的实现约束，rendered contract 和截图 diff 仍为 `not-run`。

| element | target value | constraint |
|---|---|---|
| shared code track | `min=70px`、按最宽代号增长、`max=132px` | 表头与全部等级行共享；增长时右侧列整体同步右移 |
| level code pill | `width=max-content`、`max-width=132px`、`height=22px`、`padding=0 8px`、`border-radius=11px` | 短值自然收缩；不得统一拉满132px |
| level code text | 单行，超出显示 `...` | `min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap` |
| level name track | `70px` | 空值显示两个半角横杠 `--` |
| quantified track | `70px`，仅 `rating-on` | 开关关闭时整列不存在 |
| description track | `minmax(0,1fr)` | 输入框占据剩余宽度并与表头对齐 |
| column gap | `8px` | 所有列共享 |

颜色必须复用评估规则颜色控件的展示映射：

```text
levels[].color == PERFORMANCE_LEVEL_COLORS[n].value
-> pill.background == PERFORMANCE_LEVEL_COLORS[n].trigger
```

例如存储值 `rgb(251,191,188)` 对应底框 `rgb(253,226,226)`，存储值 `rgb(183,237,177)` 对应底框 `rgb(217,245,214)`。若历史值不在固定色板中，才允许回退为原始有效 CSS 色值。

该补充契约不改变子评估题的 `RatingTierField`，也不以普通题表格替换只读导航。由于缺少该长内容状态的完整 `after.html/layout/computed/target_contract`，像素状态继续保持 `blocked`，但结构、颜色映射、溢出和空值语义可进入实现与单元测试。

## 2026-08-31 score-mapping 精确布局

目标状态：`20260830_220116_685650:score-mapping`；目标截图和同状态 `target_contract.json/layout.json/computed.json` 为权威。

| element | bbox / token |
|---|---|
| ReviewRuleCard | `x=556,y=478,w=800,h=466.67` |
| MappingField | `x=576.67,y=621.33,w=758.67,h=221.33` |
| MappingTitle | `x=576.67,y=621.33,w=140,h=22` |
| header | `y=651.33,h=22` |
| header columns | range `x=576.67,w=180`; code `x=764.67,w=70`; name `x=842.67,w=70`; description `x=920.67,w=414.67` |
| mapping rows | `y=681.33/724.67/768/811.33`，每行 `w=758.67,h=31.33`，纵向间距 `12px` |
| row columns | range `180px`; code `70px`; name `70px`; description `minmax(0,1fr)`；列间距 `8px` |
| description input | 外层约 `x=916.67,w=418.67,h=31.33`；输入框约 `x=917.33,w=417.33,h=30`，圆角 `6px` |
| ScoreRangeSummary root | `x=576.67,y=862.67,w=758.67,h=61.33` |
| ScoreRangeSummary value | `x=576.67,y=892.67,w=758.67,h=31.33` |

区间文本由边界和 `mapping.rule` 派生。目标样例：`1 ≤ 分数 < 2`、`2 ≤ 分数 < 4`、`4 ≤ 分数 < 6`、`6 ≤ 分数 ≤ 10`。最后一行右边界闭合；不得使用 `lower ～ upper`。

等级代号胶囊目标：

| level | width | background | color |
|---|---:|---|---|
| 等级A | `49.03px` | `rgb(253,226,226)` | `rgb(98,28,24)` |
| 等级B | `48.03px` | `rgb(250,241,209)` | `rgb(92,58,0)` |
| 等级C | `48.68px` | `rgb(217,245,214)` | `rgb(18,75,12)` |
| 等级D | `49.82px` | `rgb(236,226,254)` | `rgb(70,11,70)` |

胶囊统一 `height=22px`、水平 padding `8px`、`border-radius=9999px`、`width=max-content`。等级名称空值显示 `--`。映射表后必须复用 `ScoreRangeSummary`，目标为 `1 - 10，不保留小数`；禁止独立「区间关系」行、`code - name` 合并和带白底灰框的通用 mapping row。

## 最新规则读取语义

评估题只保存 `rule_id`。规则变更后，页面按同一 ID 读取最新规则配置并重新渲染对应变体；本像素契约不包含规则版本号或配置快照。实际读取行为尚未实现，行为和 API 验收为 `not-run`。

## 2026-08-31 子评估题评级档位长文本溢出精确契约

> 本节在 `entry_mode=sub_question + review_type=评级` 范围内优先于前文「配置等级描述」表格描述。前文表格结构只适用于普通评估题；不得用于新建或编辑子评估题。

机器真源：[rating-tier-overflow-capture-contract.json](rating-tier-overflow-capture-contract.json)。目标环境：URL `...?isSub=1`，viewport `1280×314`，DPR `1.5`，Chrome 152；`source_state_id=20260831-manual:sub-question-rating-overflow`。

### Geometry

| element | bbox / dimensions | constraint |
|---|---|---|
| ReviewRuleCard | `x=236,y=166.667,w=800,h=232` | 宽固定800；高度自然；padding `20 20 0` |
| RatingTierField | `x=256.667,y=310,w=758.667,h=68` | 宽等于卡片内容区；margin-bottom 20 |
| label | `x=256.667,y=310,w=56,h=22` | 14/600/22 |
| viewport | `x=256.667,y=340,w=758.667,h=38` | label.bottom 到 viewport.top = 8；`overflow:hidden` |
| scroll layer | 可视宽758.667、高48、`scrollWidth=2442` | overflow量1683；横向auto但只读 |
| track | `x=256.667,y=344,w=758.667,h=32`；`scrollWidth=2442` | flex row / nowrap / center |

### Pill tokens

```text
width: max-content
min-width: 42px
height: 32px
padding: 6px 12px
flex: 0 0 auto
border: 0.666667px solid rgb(208,211,214)
border-radius: 9999px
background: rgb(255,255,255)
color: rgb(100,106,115)
font: 600 14px/18px system stack
box-shadow: none
pointer-events: none
```

长文本样例实测宽度为 `141.927 / 211.875 / 273.302 / 235.198 / 227.427 / 258.510px`，证明宽度由文本自然宽度与24px水平padding共同决定；禁止统一固定宽度、平均分配宽度或截断文字。

### Connector 与 overflow

```text
connector count = max(0, pill count - 1)
flex: 1 1 0%
min-width: 12px
max-width: 88px
overflow captured width: 12px
height: 0.666667px
border-top: 0.666667px solid rgb(208,211,214)
```

10个档位、9条连接线时，track内容宽2442px。viewport只展示758.667px并裁切余下1683px；不得让页面或卡片产生横向滚动。`scrollWidth > clientWidth` 时显示右侧灰色 `RightOutlined` 和遮罩，但该状态是只读提示：不响应点击、键盘或滚轮导航，不改变track offset，不显示左箭头。

### Container edge relations

```text
card.left + 20.667 ≈ field.left
card.right - 20.667 ≈ field.right
label.bottom + 8 = viewport.top
viewport.height = 38
track.top - viewport.top = 4
track.height = 32
field.bottom + margin-bottom(20) ≈ card.bottom
```

容差为 ±1px。卡片保持 `overflow:visible`，内部 viewport 负责裁切；不得通过固定342px评级卡高度或全卡片裁切实现目标。

### Acceptance status

```text
structure: captured
layout: captured
visual: captured（右箭头沿用PM-T006已验证RightOutlined；独立bbox未包含在返回片段）
behavior: captured read-only pointer contract
rendered_contract: not-run
screenshot_diff: not-run
pixel_restore_status: blocked until rendered acceptance
```

## 2026-08-31 普通评估题评级动态分支增量像素契约

本节只新增专项状态参数，既有评级基础契约不变。所有新增状态 viewport 为 `1920×1080`、DPR `1`，具体 geometry/style 以各状态的 `layout.json`、`computed.json` 和 `target_contract.json` 为准，不用跨状态坐标推导间距。

| variant | visible structure | forbidden structure | source_state_id | target screenshot |
|---|---|---|---|---|
| `regular-rating-on-rating-method-direct` | 评级方式、展示方式、隐藏等级量化分 | 计算规则、子评估题列表、填写/查看顺序 | `idreamsky.feishu.cn_20260831_194405_608420:rating-method-direct` | `C:\\Users\\gaby.liu\\ClonedSites\\idreamsky.feishu.cn_20260831_194405_608420\\captures\\hybrid_steps\\step_14\\after\\after.png` |
| `regular-rating-on-rating-method-sub-items` | 评级方式、计算规则、子评估题列表、展示方式、隐藏等级量化分、填写/查看顺序 | 直接评级/总分项作为选中态 | `idreamsky.feishu.cn_20260831_194405_608420:rating-method-sub-items` | `C:\\Users\\gaby.liu\\ClonedSites\\idreamsky.feishu.cn_20260831_194405_608420\\captures\\hybrid_steps\\step_23\\after\\after.png` |
| `regular-rating-on-rating-method-total-score` | 评级方式、评级开启相关展示 | 计算规则、子评估题列表、展示方式选项、填写/查看顺序 | `idreamsky.feishu.cn_20260831_194405_608420:rating-method-total-score` | `C:\\Users\\gaby.liu\\ClonedSites\\idreamsky.feishu.cn_20260831_194405_608420\\captures\\hybrid_steps\\step_32\\after\\after.png` |
| `regular-rating-on-sub-items-calc-none` | 子评估项评级、计算规则不设置、子评估题列表、展示方式、填写/查看顺序 | 按条件计算、condition-editor | `idreamsky.feishu.cn_20260831_200737_944606:sub-items-calc-none` | `C:\\Users\\gaby.liu\\ClonedSites\\idreamsky.feishu.cn_20260831_200737_944606\\captures\\hybrid_steps\\step_15\\after\\after.png` |
| `regular-rating-on-sub-items-calc-condition` | 子评估项评级、计算规则按条件计算、子评估题列表、展示方式、填写/查看顺序 | 不设置规则、condition-editor | `idreamsky.feishu.cn_20260831_200737_944606:sub-items-calc-condition` | `C:\\Users\\gaby.liu\\ClonedSites\\idreamsky.feishu.cn_20260831_200737_944606\\captures\\hybrid_steps\\step_18\\after\\after.png` |

### 已确认几何和空间约束

- 动态状态的页面根、滚动容器、卡片和可见子节点均来自同状态 `layout.json`，新增机器契约已保存 `component_root`、`first_visible_child` 和 `terminal_visible_child`。
- 评级方式单选组、展示方式卡片、子评估题行和填写/查看顺序的同行关系只能引用对应状态 evidence；未完成的展示方式点击状态不得写入固定 after 几何。
- `ReviewQuestionDisplayMethodCard` 继续使用既有共享 geometry/style；本次不复制其 DOM/CSS，也不改变既有完成条目。

#### 评估项填写和查看顺序默认态

| element | bbox / token | relation |
|---|---|---|
| root field | `x=577,y=1091,w=758,h=190` | source `rating-method-sub-items` |
| section label | `x=577,y=1091,w=758,h=22`；`14px/600/22px` | 总标题 |
| fill label | `x=577,y=1117,w=371,h=22`；`14px/400/22px` | 不加粗 |
| view label | `x=964,y=1117,w=371,h=22`；`14px/400/22px` | 不加粗 |
| cards top | `y=1147` | label.bottom `1139` + `8px` |
| option cards | `x=577/765/964/1152,y=1147,w=180,h=134` | 同列 gap `8px`；左右列 gap `16px` |
| card header | `180×40` | selected background `rgb(240,244,255)`；border `1px` |
| preview SVG | `138×56`；目标 x=`598/786/985/1173`, y=`1203` | preview inline inset `21px` |
| primary rect | `138×20`, `rx=4`, `fill=#F5F6F7` | top variant `y=0`；bottom variant `y=36` |
| secondary rects | `100×12`, `rx=3`, `fill=#F5F6F7` | top variant `y=26/44`；bottom variant `y=0/18` |
| total text | exact captured SVG path, `fill=#1F2329` | text entirely inside primary rect |

`138×20` 的 `<rect>` 是预览 SVG 内的主内容条，不是卡片边框。禁止将其实现为 8px 高的通用 span，禁止让「总项」文字溢出主灰条。

##### 填写/查看顺序卡片 seam 用户确认覆盖

| state | outer border | title background | seam |
|---|---|---|---|
| unselected | `#DEE0E3` | white | `1px #DEE0E3` |
| selected | `#3370FF` | `#F0F4FF` | `1px #F0F4FF`，与title融合 |

seam 绝对覆盖标题/预览接缝，不参与尺寸计算。四张卡片继续保持 `180×134px`，Preview SVG保持 `138×56px`；本次不修改 `ReviewQuestionOrderPreview`。

#### 评级方式卡底部收口

| state | card | terminal bottom | card bottom | required gap |
|---|---|---:|---:|---:|
| direct | `x=556,y=362,w=800,h=134` | `475` | `496` | `21px` |
| sub_items + none | `x=556,y=362,w=800,h=388` | `729` | `750` | `21px` |
| sub_items + condition | `x=556,y=362,w=800,h=362` | `703` | `724` | `21px` |

容差为 ±1px。不能用 `rating-method-field margin-bottom + card padding-bottom` 双重累加；每个状态只允许一个 terminal 收口来源。卡片根必须建立 BFC，阻止 terminal margin 折叠到卡片外部；目标空白必须位于白色卡片背景内。

#### 子评估题列表变体像素契约

| element | none | condition |
|---|---|---|
| DragOutlined | `x=577,w=16`；每行可见 | forbidden |
| question name | `x=597,w=420` | `x=577,w=493` |
| rule | `x=1025,w=130` | `x=1078,w=257` |
| score bounds | `x=1163,w=144` | forbidden |
| DeleteTrashOutlined | `x=1315,w=16` | forbidden |
| add sub-question | `x=573,y=707,w=110,h=22` | forbidden |

`none` 行的手柄使用目标 `DragOutlined`，并绑定全局 sortable 组件；`condition` 目标没有手柄、删除、新建或评分上下限。两种状态不得只切换 radio 而复用同一列模板。

#### 评分评估方式卡变体

| variant | card bbox | label | option count | InfoOutlined | terminal gap |
|---|---|---|---:|---:|---:|
| score-range | `x=556,y=719.33,w=800,h=134` | 评分方式 | 3 | 3 | `20.67px` |
| score-fixed | `x=556,y=709,w=800,h=134` | 评分方式 | 1 | 1 | `21px` |
| score-mapping | `x=556,y=960.67,w=800,h=134` | 评分方式 | 3 | 3 | `20.67px` |

range/mapping 三项为「直接评分 / 按子评估项评分 / 作为总分项计算评分」，每项 wrapper 后均显示公共 `InfoOutlined`；fixed 只显示「直接评分 + InfoOutlined」。所有可选项命中区使用 `cursor:pointer`，与评级 radio 的手型一致，不使用拖拽专属 `grab/grabbing`。

#### 展示方式选项接缝状态

| element | default | selected |
|---|---|---|
| option cursor | `pointer` | `pointer` |
| single outer border | `#DEE0E3` | `#3370FF` |
| choice / preview borders | 不独立控制选中态 | 不得变蓝 |
| middle seam | `1px #DEE0E3` | `1px #F0F4FF`，与上半区背景融合 |
| geometry | `368×125px` | 不发生布局位移 |

选中态只允许单一外框变蓝。selected seam 使用上半区背景色而非蓝色或灰色，使其视觉消失。禁止 choice bottom border、蓝色 divider 和 preview border 多层叠加。本次不得修改填写顺序组件的既有结构、样式或行为。

##### 下拉样式预览箭头

| parameter | target |
|---|---|
| component | `DownBoldOutlinedIcon` |
| SVG size | `12×12px` |
| viewBox | `0 0 24 24` |
| path | `m3.414 7.086-.707.707a1 1 0 0 0 0 1.414l7.778 7.778a2 2 0 0 0 2.829 0l7.778-7.778a1 1 0 0 0 0-1.414l-.707-.707a1 1 0 0 0-1.415 0l-7.07 7.07-7.072-7.07a1 1 0 0 0-1.414 0Z` |
| color | `#646A73` |
| preview bbox | `336×32px` |
| position | x=312,y=10；right/top/bottom inset=`12/10/10px` |

公共图标默认尺寸仍为10px；仅展示方式下拉预览传入12px。禁止使用 `⌄` 字符、字体基线或 `DownOutlined`。

### 像素验收状态

```text
structure: supplemental captured
layout: supplemental captured
visual: target captured; rendered contract not-run
behavior: rating-method and calculation-rule selection captured
screenshot_diff: not-run
pixel_restore_status: blocked
uncovered_reasons:
- 展示方式标签/下拉点击后状态未专项采集
- 填写/查看顺序点击后状态未专项采集
- rendered implementation contract 和截图 diff 未运行

## 2026-09-01 评分上下限按子评估项评分增量契约

视觉真源为 session `idreamsky.feishu.cn_20260901_201458_140596` 的 `step_08` 至 `step_11` after artifacts；四个状态 viewport 均为 `1920x1080`、DPR 约 `1`。目标规则为 `rule_id=7680421437210954714`、名称「评估规则--拼分（在分数上下限内输入评分）」、类型「评分」，评分方式为「按子评估项评分」。

### 四个计算规则

| calculation_rule | 页面文案 | selected evidence | 变体差异 |
|---|---|---|---|
| `none` | 不设置计算规则 | `step_08/after/target_contract.json` | 子评估题列：子评估题 / 评估规则 / 评分上下限；无权重 |
| `weighted_sum` | 加权求和 | `step_09/after/target_contract.json` | 子评估题列增加「权重」 |
| `direct_sum` | 直接求和 | `step_10/after/target_contract.json` | 与 none 相同，未观察到权重 |
| `average` | 求平均分 | `step_11/after/target_contract.json` | 与 none 相同，未观察到权重 |

### 共同几何

| element | target |
|---|---|
| ReviewRuleCard | `x=556,y=478,w=800,h=225.33` |
| EvaluationMethodCard | `x=556,y=719.33,w=800,h=313.33` |
| DisplayMethodSection card | `x=556,y=1048.67,w=800,h=270.33` |
| display/order title | `x=576.67,y=1069.33,w=758.67,h=24` |
| order section title | `x=576.67,y=1109.33,w=758.67,h=22` |
| fill/view labels | `x=576.67/964,y=1135.33,w=371.33,h=22` |
| order preview | `总项在上/下`，填写顺序和查看顺序各两项 |

四个状态的展示方式区域结构和 geometry 未观察到差异；应将其视为既有组件复用结果，由 `calculation_rule` 绑定加载，而不是四套独立模板。`weighted_sum` 只在子评估题列表观察到「权重」列，权重列本身的输入/编辑行为未在本次专项操作。

### 证据边界

本增量只冻结已完成的四个选择后状态和 2026-09-02 提交校验 after 状态。提交后的「该字段是必填字段」已具备 after 证据；「新建子评估题」弹窗仍没有 after 证据，保持 `not_observed`；展示方式/顺序点击后的新状态没有专项证据，不能补写 geometry、style 或 SVG。`rendered contract` 和截图 diff 未完成，`pixel_restore_status` 继续为 `blocked`。
```

## 2026-09-02 空子评估题提交校验像素增量契约

视觉真源为 session `idreamsky.feishu.cn_20260902_105330_185791` 的 `step_11/after/after.png`；同状态 before 证据位于 `step_11/checkpoint/`。目标上下文为普通评估题、常规评估项、`rule_id=7680421437210954714`、评分、按子评估项评分、不设置计算规则。

| element | target | source |
|---|---|---|
| validation message | `x=576.67,y=534,w=758.67,h=21` | `step_11/after/target_contract.json` |
| validation message margin-top | `2px` | `step_11/after/computed.json` |
| validation message font | `14px/400/21px` | `step_11/after/computed.json` |
| validation message color | `rgb(245,74,69)` | `step_11/after/computed.json` |
| validation message background | transparent | `step_11/after/computed.json` |
| dynamic card after validation | `x=556,y=239.33,w=800,h=336.33` | `step_11/after/target_contract.json` |

错误文案为「该字段是必填字段」。该错误反馈属于 after validation 状态，正常态动态卡片的基础 geometry 不得被错误消息高度覆盖或回写。展示方式和填写/查看顺序结构保持既有复用关系。未观察到 `ErrorFilled` SVG，不添加 path 或图标 bbox。

```text
structure: captured
layout: captured for validation after state
visual: captured from after screenshot and computed style
behavior: one submit -> required message; no question created
rendered_contract: not-run
screenshot_diff: not-run
pixel_restore_status: blocked
uncovered_reasons:
- 新建子评估题弹窗仍未采集
- 展示方式和顺序卡片点击后状态仍未专项采集
- after HTML/target contract 部分中文文本存在采集编码异常
- ErrorFilled SVG、disabled 和 textarea resize after-drag 的全功能缺口仍不变
```

## 2026-09-02 真实子评估题选择后像素增量契约

视觉真源：session `idreamsky.feishu.cn_20260902_140948_915810`，选择后稳定状态 `step_15/after/after.png`；候选打开状态为 `step_12/after/after.png`。

| element | target | source |
|---|---|---|
| candidate dropdown | `x=573,y=90,w=360,h=415.67` | `step_12/after/target_contract.json` |
| candidate option | `x=573.67,y=138.33,w=350.67,h=50` | `step_12/after/target_contract.json` |
| selected question name | `x=588.33,y=510.67,w=331.67,h=22` | `step_15/after/target_contract.json` |
| derived rule name | `x=952.33,y=510.67,w=115.67,h=22` | `step_15/after/target_contract.json` |
| derived score bounds | `x=1104.33,y=510.67,w=186.33,h=22` | `step_15/after/target_contract.json` |
| delete action | `x=1311.33,y=509.54,w=24,h=24.91` | `step_15/after/target_contract.json` |
| add sub-question | `x=572.67,y=542,w=110,h=22` | `step_15/after/target_contract.json` |

选择后的派生内容为：

```text
question.name = 子评估题--评分（在分数上下限内输入评分）
rule.name = 评估规则--拼分（在分数上下限内输入评分）
score_bounds = 1 - 10
candidate_id = 7680531263614094288
```

候选面板打开态和关闭后的稳定态是两个独立状态；关闭候选面板不得清空 `question_id`，不得让派生列回退为 `--`。当前证据只确认选择结果和现有展示/顺序结构，不确认删除或后续顺序卡片 click after 状态。

```text
structure: captured
layout: captured for candidate and selected-stable states
visual: captured; rendered contract not-run
behavior: trusted selection and Escape stabilization captured
screenshot_diff: not-run
pixel_restore_status: blocked
```
