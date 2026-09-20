# PM-T005 采集证据清单

本清单记录真实采集证据，不补造未采集参数；不包含 mock 数据和列表记录数量。

采集器工程：`D:\AI项目\Perfect-Web-Clone-IDE`。

采集产物根目录：`C:\Users\gaby.liu\ClonedSites\idreamsky.feishu.cn_20260825_153141`。

证据位于上述外部采集目录时，功能目录中的引用表示“外部证据来源”，不表示证据文件已复制进 Git 工作区。若门禁要求机器契约文件位于功能目录而实际不存在，状态保持 `blocked`。

本轮复采状态边界：`20260826_174743_853707` 和 `20260826_174927_786103/step_00/checkpoint` 为正常 create 状态，BasicInfoCard `800x388`；`20260826_174927_786103/step_00/after` 为提交空表单校验态，BasicInfoCard `800x411`。校验态新增的错误信息高度不得写回基础布局契约。

## 1. 目标与门禁

| 字段 | 值 |
|---|---|
| 目标动作 | 评估题列表 > 新建 > 新建评估题 |
| 目标 URL | `https://idreamsky.feishu.cn/perf/admin/review-questions/review-indicators/create` |
| viewport | `1920x1080`，所有本轮有效 session 已校验 |
| 基础 session | `C:/Users/gaby.liu/ClonedSites/idreamsky.feishu.cn_20260825_153141` |
| 补采 session | 字段 `191949_338542`；checkbox/radio `192219_038154`；footer `192442_079083`；expanded `192706_982839`；selected `192927_379131`；after-click `190403_023043`, `190550_626183`, `190736_735382`, `190921_581205`, `191106_099217` |
| JSON 完整性 | 10 个修复后重采 session、35 个 after 状态目录全部为严格 JSON，`NaN/Infinity=0` |
| 当前 completion_status | `incomplete` |
| 当前 pixel_restore_status | `blocked`（NaN、布局和 after-click 证据阻塞均已解除；仅保留真实 disabled 未观察与 `ErrorFilled` 源 path 未观察的证据限制） |

## 2. 有效 session 映射

| session | 采集范围 | 证据位置 |
|---|---|---|
| `153141` | 基础页面、页面结构、hover 状态 | `captures/capture_model.json`、`captures/hover_states/**` |
| `191949_338542` | 名称/描述/备注 empty、filled、focus、blur、计数 | `captures/hybrid_steps/**/target_contract.json` |
| `192219_038154` | 语言 checkbox、四种类型 radio | 同上 |
| `192442_079083` | 返回/提交/预览/取消 hover/focus | 同上 |
| `192706_982839` | 评估规则 expanded，含 overlay bbox 和四个真实选项 | 同上 |
| `192927_379131` | 评估规则 selected：`7档绩效等级` | 同上 |
| `200816_394689` | 全页面 SVG inventory 定向补采；确认 `LarkOutlined` 两个真实 path | `captures/hybrid_steps/step_00/after/interaction_evidence.json` |
| `190403_023043` | after-click：入口“新建”->“新建评估题” | `captures/hybrid_steps/step_*/after/` |
| `190550_626183` | after-click：预览（空表单校验） | `captures/hybrid_steps/step_00/after/` |
| `190736_735382` | after-click：提交（空表单校验） | `captures/hybrid_steps/step_00/after/` |
| `190921_581205` | after-click：取消返回列表 | `captures/hybrid_steps/step_00/after/` |
| `191106_099217` | after-click：顶部返回列表 | `captures/hybrid_steps/step_00/after/` |

全部 10 个重采 session 的状态目录包含 `after.html`、`after.png`、严格 JSON 的 `layout.json`、`computed.json`、`interaction.json`、`interaction_evidence.json`、`validation.json`、`overlay.json` 和独立 `target_contract.json`。历史 NaN 证据不再作为当前契约来源。

## 3. 真实性说明

- 旧 session `104739` 不再作为本轮证据引用。
- 被并行覆盖的 `161543` 不可信，不得引用。
- 返回控件是无 `role`/`tabindex` 的 `div`，真实键盘 focus 为 `N/A`，不能将脚本调用 `focus()` 视为真实 focus 证据。
- disabled 状态未观察到真实可用实例，保持 `blocked`，禁止猜测样式。

## 4. Current evidence addendum

Collector: `D:\AI项目\Perfect-Web-Clone-IDE`.

Session: `C:\Users\gaby.liu\ClonedSites\idreamsky.feishu.cn_20260826_185525_429469`.

Normal create checkpoint: `captures/hybrid_steps/step_00/after/target_contract.json`.

Confirmed same-state values: name `x=581,y=238,w=759,h=31`; description `x=581,y=319,w=759,h=49`; remark `x=581,y=729,w=759,h=49`. The realtime recording attempt is retained at `C:\Users\gaby.liu\ClonedSites\realtime-a98d2d8d5a0a.jsonl` and reports `recording_event_count=0`; no drag-after height is asserted.

## 5. 2026-08-30 正式环境规则关联补采

本次补采使用正式环境已有评估规则，不创建、编辑、删除或保存任何规则/评估题。所有页面状态 viewport 为 `1920x1080`，DPR 约为 `1`。

### 5.1 规则来源核对

只读规则列表 session：`idreamsky.feishu.cn_20260830_131537_767571`。

规则列表 `data-row-key` 与新建评估题下拉选项 `data-cy` 一致，形成页面级规则关系：

| rule_id | name | review_type |
|---:|---|---|
| 7679656987218430963 | 测试评级--评级可参与计算开关关闭 | 评级 |
| 7679657243473612055 | 测试评级--评级可参与计算开关打开 | 评级 |
| 7679657422717193452 | 测试评分--在分数上线限内输入评分 | 评分 |
| 7679657498671860954 | 测试评分--在固定分值选项内选择评分 | 评分 |
| 7679657700988308727 | 测试--评分映射等级型 | 评分映射等级型 |
| 7678536081905617856 | 评分映射等级型 | 评分映射等级型 |

当前下拉实际有 6 项；前 5 项为本次目标，最后 1 项为额外发现，不能从目标规则中删除或忽略。

### 5.2 入口与选择后状态

| entry_mode | variant | session | evidence root |
|---|---|---|---|
| sub_question | rating-off | `idreamsky.feishu.cn_20260830_121507_362141` | `captures/hybrid_steps/step_02/after/` |
| sub_question | rating-on | `idreamsky.feishu.cn_20260830_122043_622390` | `captures/hybrid_steps/step_02/after/` |
| sub_question | score-range | `idreamsky.feishu.cn_20260830_123222_385218` | `captures/hybrid_steps/step_02/after/` |
| sub_question | score-fixed | `idreamsky.feishu.cn_20260830_123757_413273` | `captures/hybrid_steps/step_02/after/` |
| regular_question | rating-off | `idreamsky.feishu.cn_20260830_124330_654379` | `captures/hybrid_steps/step_02/after/` |
| regular_question | rating-on | `idreamsky.feishu.cn_20260830_124906_523866` | `captures/hybrid_steps/step_02/after/` |
| regular_question | score-range | `idreamsky.feishu.cn_20260830_125443_606598` | `captures/hybrid_steps/step_02/after/` |
| regular_question | score-fixed | `idreamsky.feishu.cn_20260830_130045_032006` | `captures/hybrid_steps/step_02/after/` |
| regular_question | score-mapping | `idreamsky.feishu.cn_20260830_130618_773976` | `captures/hybrid_steps/step_02/after/` |

每个成功状态均包含 `after.html`、`layout.json`、`computed.json`、`interaction.json`、`interaction_evidence.json`、`target_contract.json`、`state_contract.json`、`state_fixture.json` 和 `after.png`。

### 5.3 证据边界

- `source_state_id` 在每个独立混合会话内均为 `base`，文档使用 `session:base` 作为限定后的 source state 别名，禁止跨会话把裸 `base` 合并。
- 采集器未观察到评估规则 GET 或评估题 POST 的权威请求契约；`rule_id` 是本功能后续接口设计字段，当前页面证据只确认列表 row-key 与下拉 data-cy 一致。
- 当前 `extracted-ui-contract.json` 已将最新真实菜单采集的 21 个状态投影为 `schema_version: 2` 机器契约；当前仍因历史 textarea resize 证据缺失保持 `completion_status=incomplete`、`pixel_restore_status=blocked`。
- 旧 session `192706_982839`、`192927_379131` 的规则选项证据仍可作为历史采集参考，但本节的 6 项正式环境规则清单是最新关系来源。

## 6. 2026-08-30 真实菜单与虚拟下拉完整采集

本节覆盖最新真实菜单入口和滚动后状态，优先级高于此前直达 URL session。采集器通过连续 `ArrowDown` 驱动下拉 virtual list，未执行保存、提交或删除。

### 6.1 入口

| entry_mode | menu item | route evidence | title |
|---|---|---|---|
| `regular_question` | 新建评估题 | `/perf/admin/review-questions/review-indicators/create` | 新建评估题 |
| `sub_question` | 新建子评估题 | `/perf/admin/review-questions/review-indicators/create?isSub` | 新建子评估题 |

### 6.2 目标规则选择后 session

| entry_mode | variant | session | selected state |
|---|---|---|---|
| `sub_question` | `rating-on` | `idreamsky.feishu.cn_20260830_205019_315470` | `step_18/after` |
| `sub_question` | `score-range` | `idreamsky.feishu.cn_20260830_210157_422985` | `step_18/after` |
| `sub_question` | `score-fixed` | `idreamsky.feishu.cn_20260830_211313_909144` | `step_18/after` |
| `regular_question` | `rating-on` | `idreamsky.feishu.cn_20260830_212442_666222` | `step_18/after` |
| `regular_question` | `score-range` | `idreamsky.feishu.cn_20260830_213631_473164` | `step_18/after` |
| `regular_question` | `score-fixed` | `idreamsky.feishu.cn_20260830_214945_442324` | `step_18/after` |
| `regular_question` | `score-mapping` | `idreamsky.feishu.cn_20260830_220116_685650` | `step_18/after` |

每个目标 session 都包含 `step_07` 下拉首屏、`step_17` 滚动后下拉、`step_18` 规则选择后模块，以及对应的 `after.html`、`layout.json`、`computed.json`、`target_contract.json`、`interaction_evidence.json` 和截图。

### 6.3 入口差异

- 普通评估题和子评估题的规则来源保持同一规则实体来源；
- 普通题本次目标覆盖评级、评分上线限、评分固定分值、评分映射等级型四类；
- 子题本次目标覆盖评级、评分上线限、评分固定分值三类；
- 下拉筛选参数仍不在本次实现范围，但实际滚动后的选项集合和入口上下文必须保留；
- 选择后模块必须以 `entry_mode + rule_id` 作为实现变体联合键。

### 6.4 机器契约状态

`extracted-ui-contract.json` 已根据本节最新 evidence 生成 `schema_version: 2`、21 个状态（7 个目标规则 × 首屏/滚动后/选择后），顶层 coverage 数组为空。全局状态仍因历史 textarea resize after-drag 证据缺失保持 `completion_status=incomplete`、`pixel_restore_status=blocked`。

## 7. 2026-08-31 子评估题评级长文本溢出补充测量

用户在目标正式环境的 `create?isSub=1` 页面执行只读 DevTools 测量脚本，返回 `source_state_id=20260831-manual:sub-question-rating-overflow`。机器投影见 [rating-tier-overflow-capture-contract.json](rating-tier-overflow-capture-contract.json)。

```text
captured_at: 2026-08-31T03:14:53.333Z
viewport: 1280×314
DPR: 1.5
browser: Chrome 152
pill_count: 10
connector_count: 9
viewport: 758.667×38
scroll_width: 2442
horizontal_overflow: 1683
right_arrow_found: true
```

该补测冻结了字段、卡片、viewport、scroll layer、track、pill和connector的geometry/computed styles，并确认目标区域 `pointer-events:none`。它是实现参数的补充权威，但不是 Perfect-Web-Clone-IDE 的完整 session 证据包：没有随仓库提供 `before_html/after_html/layout/computed/target_contract/screenshot/interaction_evidence` 全套文件，右箭头独立bbox也未进入用户返回片段。因此允许按用户确认的范围实现并运行结构/样式测试，但像素验收继续为 `not-run/blocked`，不得写成截图diff通过。

## 2026-08-31 新建评估题评级动态分支专项补采

本节为本次专项新增证据，保持前述 2026-08-30 已完成规则状态不变。入口固定为 `regular_question`，规则为「测试评级--评级可参与计算开关打开」，viewport 为 `1920×1080`，DPR 为 `1`。

| variant | source_state_id | session / step | evidence root | status |
|---|---|---|---|---|
| `regular-rating-on-rating-method-direct` | `idreamsky.feishu.cn_20260831_194405_608420:rating-method-direct` | `step_14/after` | `C:\\Users\\gaby.liu\\ClonedSites\\idreamsky.feishu.cn_20260831_194405_608420\\captures\\hybrid_steps\\step_14\\after\\` | captured |
| `regular-rating-on-rating-method-sub-items` | `idreamsky.feishu.cn_20260831_194405_608420:rating-method-sub-items` | `step_23/after` | `C:\\Users\\gaby.liu\\ClonedSites\\idreamsky.feishu.cn_20260831_194405_608420\\captures\\hybrid_steps\\step_23\\after\\` | captured |
| `regular-rating-on-rating-method-total-score` | `idreamsky.feishu.cn_20260831_194405_608420:rating-method-total-score` | `step_32/after` | `C:\\Users\\gaby.liu\\ClonedSites\\idreamsky.feishu.cn_20260831_194405_608420\\captures\\hybrid_steps\\step_32\\after\\` | captured |
| `regular-rating-on-sub-items-calc-none` | `idreamsky.feishu.cn_20260831_200737_944606:sub-items-calc-none` | `step_15/after` | `C:\\Users\\gaby.liu\\ClonedSites\\idreamsky.feishu.cn_20260831_200737_944606\\captures\\hybrid_steps\\step_15\\after\\` | captured |
| `regular-rating-on-sub-items-calc-condition` | `idreamsky.feishu.cn_20260831_200737_944606:sub-items-calc-condition` | `step_18/after` | `C:\\Users\\gaby.liu\\ClonedSites\\idreamsky.feishu.cn_20260831_200737_944606\\captures\\hybrid_steps\\step_18\\after\\` | captured |

每个状态均包含 `after.html`、`layout.json`、`computed.json`、`target_contract.json`、`interaction_evidence.json` 和 `after.png`，并保存了 `state_contract.json`、`state_fixture.json` 与 `interaction.json`。`before_html` 使用同一 session 中动作前稳定 after 状态作为证据，不跨 viewport 或跨入口拼接。

专项观察确认：

- 三种「评级方式」均为同一普通评估题评级配置下的结构分支；
- 只有「通过子评估项评级」可见「计算规则」模块；
- 「直接评级」和「作为总分项计算评级」禁止显示「计算规则」及子评估题列表；
- 「通过子评估项评级」下同时采集「不设置规则」和「按条件计算」；本轮未观察到独立条件编辑器，不能凭空新增；
- 展示方式卡片和填写/查看顺序的点击后状态不属于本次新增完整证据，保持未覆盖，不用新契约猜测。

## 2026-09-01 评分上下限按子评估项评分专项（已完成部分）

本次专项仅整理已完成的四个计算规则状态，不补写提交校验或新建子评估题弹窗。入口为普通「新建评估题」，viewport `1920x1080`、DPR 约 `1`。

| 项目 | 已确认值 |
|---|---|
| entry_mode | `regular_question` |
| 类型 | `常规评估项` |
| rule_id | `7680421437210954714`（目标下拉 option 的 `data-cy`） |
| 规则名称 | `评估规则--拼分（在分数上下限内输入评分）` |
| review_type | `评分` |
| 评分方式 | `按子评估项评分` |
| 评分上下限 | `1.00 - 10.00`，`保留 2 位小数` |

### 状态证据

| variant | source_state_id | evidence root | status |
|---|---|---|---|
| `regular-score-range-sub-items-calc-none` | `idreamsky.feishu.cn_20260901_201458_140596:score-range-sub-items-calc-none` | `step_08/after/` | captured |
| `regular-score-range-sub-items-calc-weighted_sum` | `idreamsky.feishu.cn_20260901_201458_140596:score-range-sub-items-calc-weighted_sum` | `step_09/after/` | captured |
| `regular-score-range-sub-items-calc-direct_sum` | `idreamsky.feishu.cn_20260901_201458_140596:score-range-sub-items-calc-direct_sum` | `step_10/after/` | captured |
| `regular-score-range-sub-items-calc-average` | `idreamsky.feishu.cn_20260901_201458_140596:score-range-sub-items-calc-average` | `step_11/after/` | captured |

每个状态包含 `after.html`、`after.png`、`layout.json`、`computed.json`、`interaction.json`、`interaction_evidence.json`、`target_contract.json`、`state_contract.json` 和 `state_fixture.json`。前置状态使用同一 session 的 `step_07/after/after.html`，没有跨入口或跨 viewport 拼接。

### 已确认的绑定关系

- 四个计算规则均属于同一 `评分 + 按子评估项评分` 页面分支。
- 子评估题区域和展示方式区域在四个计算规则状态中同时存在，必须由 `calculation_rule` 与页面状态绑定，而不是复制四套展示方式组件。
- 「展示方式」区域实际呈现「评估项的填写和查看顺序」、填写顺序、查看顺序及四张顺序卡片；四个状态的该区域结构和位置保持一致。
- 「加权求和」唯一观察到的新增内容是子评估题列表中的「权重」列；其余三个状态未观察到该列。
- 四个分支均未观察到评分映射等级型摘要或普通评级等级描述。

### 未完成边界

- 历史未完成会话中的提交确认点不作为本次证据；2026-09-02 补采已实际执行一次提交并形成「该字段是必填字段」红色错误 after 证据。
- 「新建子评估题」弹窗尚未采集。
- 未采集展示方式或顺序卡片的点击后差异；不得从本专项 after 状态猜测新的选中态契约。
- 本专项不执行保存、创建、确认、删除或发布。

当前状态保持：`capture_integrity=passed`、`capture_completeness=incomplete`、`implementation_readiness=ready`（仅限上述四个变体）、`pixel_restore_status=blocked`。

## 2026-09-02 空子评估题提交校验补采

本次补采 session 为 `idreamsky.feishu.cn_20260902_105330_185791`，入口为普通「新建评估题」，viewport `1920x1080`，DPR 约 `1`。固定上下文为类型「常规评估项」、目标规则 `rule_id=7680421437210954714`、评估类型「评分」、评分方式「按子评估项评分」、计算规则「不设置计算规则」。本次只执行一次用户授权的「提交」，未执行创建、确认、保存、删除或发布。

| variant | source_state_id | evidence root | status |
|---|---|---|---|
| `regular-score-range-sub-items-submit-validation` | `idreamsky.feishu.cn_20260902_105330_185791:submit-empty-sub-question-validation` | `captures/hybrid_steps/step_11/checkpoint/` + `step_11/after/` | captured |

### 证据包

- before：`step_11/checkpoint/after.html`、`after.png`、`layout.json`、`computed.json`、`validation.json`、`interaction.json`、`interaction_evidence.json`、`target_contract.json`；
- after：`step_11/after/after.html`、`after.png`、`layout.json`、`computed.json`、`validation.json`、`interaction.json`、`interaction_evidence.json`、`target_contract.json`；
- after 状态在「子评估题」区域下方出现红色文案「该字段是必填字段」，提交没有创建题目或跳转；
- `after.png` 是该错误文案的视觉真源。after HTML 和 target contract 的部分中文文本存在采集编码异常，不能将乱码文本作为文案真值。

### 校验状态边界

- 已将提交后的空子评估题校验从 `not_observed` 更新为 `captured`；
- 「新建子评估题」弹窗仍为 `not_observed`，没有弹窗 after 证据，不得补写弹窗结构；
- 展示方式和填写/查看顺序点击后的新状态仍未专项采集；
- 全功能 `capture_completeness=incomplete`、`pixel_restore_status=blocked` 保持不变。

## 2026-09-02 真实子评估题选择后补采

session：`idreamsky.feishu.cn_20260902_140948_915810`。入口为普通「新建评估题」，viewport `1920x1080`，DPR 约 `1`。固定上下文为常规评估项、`rule_id=7680421437210954714`、评分、按子评估项评分、不设置计算规则。

| variant | source_state_id | evidence root | status |
|---|---|---|---|
| `regular-score-range-sub-items-selected-existing` | `idreamsky.feishu.cn_20260902_140948_915810:sub-question-selected-existing` | `step_12/after/` | captured |
| `regular-score-range-sub-items-selected-existing-stable` | `idreamsky.feishu.cn_20260902_140948_915810:sub-question-selected-existing-stable` | `step_15/after/` | captured |

### 真实候选与选择后派生

- 候选名称：`子评估题--评分（在分数上下限内输入评分）`；
- 候选摘要：`保留 2 位小数 ，1-10 分`；
- 候选稳定标识：`data-cy=data-id=7680531263614094288`；
- 候选面板：`x=573,y=90,w=360,h=415.67`；候选行：`x=573.67,y=138.33,w=350.67,h=50`；
- 选择后子评估题名称区域：`x=588.33,y=510.67,w=331.67,h=22`；
- 选择后评估规则派生区域：`x=952.33,y=510.67,w=115.67,h=22`；
- 选择后评分上下限区域：`x=1104.33,y=510.67,w=186.33,h=22`；
- 删除按钮：`x=1311.33,y=509.54,w=24,h=24.91`；
- 新建子评估题按钮：`x=572.67,y=542,w=110,h=22`。

选择事件为可信用户 click，`state_changed=true`、`target_match=true`。随后使用 Escape 关闭候选面板并执行只读状态校验，选择结果保持。

### 边界

本次未执行删除、保存、创建或发布。创建弹窗已有独立 after 证据，但本次选择后状态不应与创建弹窗混合；展示方式/顺序卡片点击后的其他组合仍需按独立状态验收。
