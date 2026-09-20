# PM-T005 状态矩阵

```text
completion_status: incomplete
pixel_restore_status: blocked
uncovered_reasons:
- 2026-08-30 21 个真实菜单规则状态（7 个目标规则 × 首屏/滚动后/选择后）已投影到 `schema_version: 2` 机器契约；剩余阻塞仅为历史 textarea resize after-drag 证据
- 规则 API 读取/保存和最新规则重开尚未运行
- disabled、ErrorFilled SVG 和 textarea resize after-drag 仍缺证据
```

| component | default | hover | focus | active/checked | disabled | expanded/after-click | source evidence |
|---|---|---|---|---|---|---|---|
| full-screen shell | captured | n/a | n/a | n/a | n/a | n/a | `153141` |
| back action | captured | captured | N/A: non-focusable div | captured after-click | n/a | captured | `192442_079083`, `191106_099217` |
| language checkbox | captured | captured | observed | captured checked/unchecked | blocked | n/a | `192219_038154` |
| name input | captured | observed | captured | captured filled | blocked | n/a | `191949_338542` |
| description textarea | captured + `/1000` | observed | captured | captured filled/count | blocked | n/a | `191949_338542` |
| type radio | captured | captured | observed | four selected states captured | blocked | n/a | `192219_038154` |
| review rule select | captured placeholder | captured | observed | captured `7档绩效等级` selected | blocked | captured with four real options | `192706_982839`, `192927_379131` |
| remark textarea | captured + `/2000` | observed | captured | captured filled/count | blocked | n/a | `191949_338542` |
| submit | captured | captured | captured | validation after-click captured | blocked | n/a | `192442_079083`, `190736_735382` |
| preview | captured | captured | captured | validation after-click captured | blocked | n/a | `192442_079083`, `190550_626183` |
| cancel | captured | captured | captured | captured after-click to list | blocked | n/a | `192442_079083`, `190921_581205` |
| entry navigation | captured | captured | captured | captured after-click to create page | n/a | captured | `190403_023043` |


## 2026-08-30 正式环境规则关联补采

> 本轮不创建、不编辑、不保存评估规则或评估题。下列 `source_state_id` 使用 `session:base` 限定，避免不同独立采集会话中均为 `base` 导致冲突。

| entry_mode | variant | selected rule | source_state_id | evidence root | status |
|---|---|---|---|---|---|
| sub_question | rule-select-expanded | 评估规则下拉展开（6 个选项） | `20260830-120838:base` | `idreamsky.feishu.cn_20260830_120838_350339/captures/hybrid_steps/step_00/after/` | captured |
| sub_question | rating-off | 测试评级--评级可参与计算开关关闭 | `20260830-121507:base` | `idreamsky.feishu.cn_20260830_121507_362141/captures/hybrid_steps/step_02/after/` | captured |
| sub_question | rating-on | 测试评级--评级可参与计算开关打开 | `20260830-122043:base` | `idreamsky.feishu.cn_20260830_122043_622390/captures/hybrid_steps/step_02/after/` | captured |
| sub_question | score-range | 测试评分--在分数上线限内输入评分 | `20260830-123222:base` | `idreamsky.feishu.cn_20260830_123222_385218/captures/hybrid_steps/step_02/after/` | captured |
| sub_question | score-fixed | 测试评分--在固定分值选项内选择评分 | `20260830-123757:base` | `idreamsky.feishu.cn_20260830_123757_413273/captures/hybrid_steps/step_02/after/` | captured |
| regular_question | rating-off | 测试评级--评级可参与计算开关关闭 | `20260830-124330:base` | `idreamsky.feishu.cn_20260830_124330_654379/captures/hybrid_steps/step_02/after/` | captured |
| regular_question | rating-on | 测试评级--评级可参与计算开关打开 | `20260830-124906:base` | `idreamsky.feishu.cn_20260830_124906_523866/captures/hybrid_steps/step_02/after/` | captured |
| regular_question | score-range | 测试评分--在分数上线限内输入评分 | `20260830-125443:base` | `idreamsky.feishu.cn_20260830_125443_606598/captures/hybrid_steps/step_02/after/` | captured |
| regular_question | score-fixed | 测试评分--在固定分值选项内选择评分 | `20260830-130045:base` | `idreamsky.feishu.cn_20260830_130045_032006/captures/hybrid_steps/step_02/after/` | captured |
| regular_question | score-mapping | 测试--评分映射等级型 | `20260830-130618:base` | `idreamsky.feishu.cn_20260830_130618_773976/captures/hybrid_steps/step_02/after/` | captured |

### 规则选项来源核对

只读规则列表 session：`20260830-131537:base`，证据根目录为 `idreamsky.feishu.cn_20260830_131537_767571/captures/hybrid_steps/step_00/after/`。规则列表 `data-row-key` 与新建评估题下拉 `data-cy` 一致：

| rule_id | name | review_type |
|---:|---|---|
| 7679656987218430963 | 测试评级--评级可参与计算开关关闭 | 评级 |
| 7679657243473612055 | 测试评级--评级可参与计算开关打开 | 评级 |
| 7679657422717193452 | 测试评分--在分数上线限内输入评分 | 评分 |
| 7679657498671860954 | 测试评分--在固定分值选项内选择评分 | 评分 |
| 7679657700988308727 | 测试--评分映射等级型 | 评分映射等级型 |
| 7678536081905617856 | 评分映射等级型 | 评分映射等级型 |

### 证据边界

- 每个成功状态均有独立 `after.html`、`layout.json`、`computed.json`、`interaction_evidence.json`、`target_contract.json` 和 `after.png`。
- 下拉展开态同时记录 6 个实际选项及其稳定标识；额外的“评分映射等级型”不是本次目标，但保留在来源清单中。
- 本轮采集器未观察到评估规则 GET 或评估题 POST 的权威请求契约；API 字段采用本功能 `api-contract.md` 的设计，不将采集页面标识直接宣称为已验证后端字段。
- `extracted-ui-contract.json` 已完成 9 个新状态的 `schema_version: 2` 机器契约投影；当前不能标记像素验收通过的原因是 textarea resize after-drag 和 rendered screenshot diff 尚未完成。

## 结论

页面、下拉和 7 个目标选择后状态均已取得最新正式环境证据，并完成规则名称、规则类型和页面稳定标识的交叉梳理。每个目标状态同时保留首屏展开和滚动后展开证据，共 21 个机器状态；`rule_id`、最新规则读取和保存请求设计已冻结在 `api-contract.md`；普通题/子题筛选逻辑、真实保存请求验证和 rendered contract diff 仍是后续任务。历史 disabled、ErrorFilled SVG 与 textarea resize 证据缺口继续保持 blocked。

## 2026-08-31 子评估题评级溢出补充状态

| entry_mode | variant | source_state_id | viewport | content | interaction | status |
|---|---|---|---|---|---|---|
| sub_question | rating-tier-overflow-readonly | `20260831-manual:sub-question-rating-overflow` | `758.667×38` | 10 pills / 9 connectors / scrollWidth 2442 | pointer-events none；RightOutlined only | supplemental captured |

该状态同时适用于新建和编辑子评估题；普通评估题不适用。机器投影见 `rating-tier-overflow-capture-contract.json`。该补充状态支持实现，但缺少完整session包与实现后diff，因此全功能状态仍为 incomplete/blocked。

## 2026-08-31 新建评估题评级动态分支专项状态

| component / variant | default | selected / after-click | hidden / forbidden | source evidence |
|---|---|---|---|---|
| `ReviewQuestionRatingMethodSection` · `direct` | captured | captured | `CalculationRuleSection`、`SubQuestionList` hidden | `idreamsky.feishu.cn_20260831_194405_608420:rating-method-direct` |
| `ReviewQuestionRatingMethodSection` · `sub_items` | captured | captured | `direct`、`total_score` not selected | `idreamsky.feishu.cn_20260831_194405_608420:rating-method-sub-items` |
| `ReviewQuestionRatingMethodSection` · `total_score` | captured | captured | `CalculationRuleSection`、`SubQuestionList`、display style options hidden | `idreamsky.feishu.cn_20260831_194405_608420:rating-method-total-score` |
| `ReviewQuestionCalculationRuleSection` · `none` | captured | captured | `condition-editor` not observed | `idreamsky.feishu.cn_20260831_200737_944606:sub-items-calc-none` |
| `ReviewQuestionCalculationRuleSection` · `condition` | captured | captured | `condition-editor` not observed | `idreamsky.feishu.cn_20260831_200737_944606:sub-items-calc-condition` |

### 动态加载结论

- 评级方式三选项属于同一 `ReviewQuestionRatingMethodSection`，选中状态和下方动态区域由规则配置驱动。
- 只有 `rating_method=sub_items` 加载 `ReviewQuestionCalculationRuleSection` 与 `ReviewQuestionSubQuestionList`。
- `calculation_rule=none` 与 `calculation_rule=condition` 只改变计算规则选中态；本次没有观察到独立条件编辑器，不能将其作为已采集组件。
- `ReviewQuestionDisplayMethodCard` 复用既有共享组件；本次未新增其标签/下拉点击后契约，既有 display card 证据保持不变。

### 专项证据边界

### 专项证据边界

新增五个状态的完整 artifacts 位于 `capture-manifest.md` 对应 session/step。展示方式和填写/查看顺序的专项点击状态仍为 `not_observed`，不能以本状态矩阵推断其 after-click 视觉差异。

## 2026-09-01 评分上下限按子评估项评分状态

| component / variant | selected state | visible structure | observed difference | source evidence |
|---|---|---|---|---|
| `CalculationRuleSection` · `none` | 不设置计算规则 | 计算规则、子评估题、展示方式/填写查看顺序 | 无「权重」列 | `201458_140596:step_08/after` |
| `CalculationRuleSection` · `weighted_sum` | 加权求和 | 同上 | 子评估题列表增加「权重」列 | `201458_140596:step_09/after` |
| `CalculationRuleSection` · `direct_sum` | 直接求和 | 同上 | 未观察到权重列 | `201458_140596:step_10/after` |
| `CalculationRuleSection` · `average` | 求平均分 | 同上 | 未观察到权重列 | `201458_140596:step_11/after` |

四个状态固定绑定：`regular_question + 常规评估项 + rule_id=7680421437210954714 + review_type=评分 + scoring_method=按子评估项评分 + calculation_rule`。展示方式区域在四个状态中均复用既有「评估项的填写和查看顺序」结构，不能为计算规则复制展示组件。

四个 after 状态均已具备完整 HTML、截图、layout、computed、interaction 和 target contract；提交后的「该字段是必填字段」校验已通过 2026-09-02 补采形成 after 证据；「新建子评估题」弹窗仍为 `not_observed`。

## 2026-09-02 空子评估题提交校验补采

| component / variant | selected state | visible structure | observed difference | source evidence |
|---|---|---|---|---|
| `ReviewQuestionSubmitValidation` · empty sub-question | 不设置计算规则 + 空子评估题 | 四个计算规则、子评估题、既有展示方式/填写查看顺序、备注、固定 footer | 「子评估题」区域下方新增红色「该字段是必填字段」；未创建题目、未跳转 | `idreamsky.feishu.cn_20260902_105330_185791:submit-empty-sub-question-validation` |

校验 after 的错误节点 bbox 为 `x=576.67,y=534,w=758.67,h=21`，computed 为 `margin-top=2px`、`font-size=14px`、`line-height=21px`、`font-weight=400`、`color=rgb(245,74,69)`、透明背景。错误文案视觉以 `step_11/after/after.png` 为准；未观察到 `ErrorFilled` 图标。原有展示方式组件和填写/查看顺序组件继续复用，校验只新增子评估题字段反馈。

提交校验已从 `not_observed` 更新为 `captured`；「新建子评估题」弹窗仍为 `not_observed`。HTML 文本存在采集编码异常，不能以 after HTML 中的乱码替代截图确认的文案。

## 2026-09-02 真实子评估题选择后状态

| component / variant | selected state | visible structure | observed difference | source evidence |
|---|---|---|---|---|
| `ReviewQuestionSubQuestionSelect` · candidate-panel | 候选面板打开 | 真实候选名称、规则摘要、候选勾选区域、新建入口 | 候选行 `350.67×50`；候选摘要为「保留 2 位小数 ，1-10 分」 | `idreamsky.feishu.cn_20260902_140948_915810:sub-question-selected-existing` |
| `ReviewQuestionSubQuestionList` · selected | 真实子评估题已选择 | 子评估题名称、派生评估规则、派生评分上下限、删除按钮、新建入口 | `1 - 10` 派生显示；删除按钮出现；展示/顺序区域保持加载 | `idreamsky.feishu.cn_20260902_140948_915810:sub-question-selected-existing` |
| `ReviewQuestionSubQuestionList` · selected-stable | 候选面板关闭后仍已选择 | 同上，不含候选浮层 | Escape 后选择结果保持，页面结构未丢失 | `idreamsky.feishu.cn_20260902_140948_915810:sub-question-selected-existing-stable` |

选择后联动固定为：

```text
calculation_rule=none
  + question_id=7680531263614094288
  -> selected question name
  -> derived rule name
  -> derived score bounds
  -> delete action visible
  -> existing display/order components remain mounted
```

删除、创建、保存和选择后填写/查看顺序点击行为不在本次状态中执行。
