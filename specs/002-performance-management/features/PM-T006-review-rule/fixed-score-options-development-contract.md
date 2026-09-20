# PM-T006 固定分值选项补充开发契约

```text
completion_status: incomplete
pixel_restore_status: blocked
ui_confirmation_status: confirmed
```

## 1. 契约目的

补充普通评分在“评分方式 → 在固定分值选项内选择评分”分支下的开发与验收契约，重点覆盖固定分值输入项的“小数位数最多 2 位”校验。

本契约属于 PM-T006 既有能力增强，不新增后端 API、权限、持久化或路由范围。

## 2. 证据状态

### 2.1 已有正式采集证据

| 状态 | 证据 | 已确认内容 |
| --- | --- | --- |
| 固定分值选项空态 | `C:/Users/gaby.liu/ClonedSites/idreamsky.feishu.cn_20260828_103907_856748/captures/hybrid_steps/step_06/after/` | 固定分值选项分支、2 行输入、拖拽手柄、添加分值、页面布局 |
| 固定分值选项已配置态 | `C:/Users/gaby.liu/ClonedSites/idreamsky.feishu.cn_20260828_105151_442621/captures/hybrid_steps/step_07/after/` | 第一条分值填写 `0.01`，第二条为空；输入、拖拽和添加控件布局 |
| 固定分值错误与恢复态 | `C:/Users/gaby.liu/ClonedSites/idreamsky.feishu.cn_20260828_122613_295321/captures/hybrid_steps/step_06/after/`、`step_08/after/` | `0.022` 触发“最多支持2位小数”红框红字；同一输入框修正为 `0.02` 后错误清除 |
| 固定分值数量联动态 | `C:/Users/gaby.liu/ClonedSites/idreamsky.feishu.cn_20260828_132045_704054/captures/hybrid_steps/step_05/after/`、`step_08/after/` | 默认2项；添加后3项；新增后出现删除按钮 |

已确认的正式采集产物包括：

- `after.html`
- `after.png`
- `layout.json`
- `computed.json`
- `interaction_evidence.json`
- `target_contract.json`

### 2.2 用户补充截图

用户于 2026-08-28 提供了固定分值输入校验截图；随后已通过 MCP 补采并形成独立错误态及恢复态证据：

```text
输入值：0.022
输入框：红色边框
错误文案：最多支持2位小数
恢复值：0.02
恢复后：错误边框和错误文案消失
```

正式错误态证据：`RR-SCORE-FIXED-OPTIONS-VALIDATION-ERROR`，来自 `idreamsky.feishu.cn_20260828_122613_295321/captures/hybrid_steps/step_06/after/`。

正式恢复态证据：`RR-SCORE-FIXED-OPTIONS-VALIDATION-RECOVERED`，来自 `idreamsky.feishu.cn_20260828_122613_295321/captures/hybrid_steps/step_08/after/`。

## 3. 补采结论

已完成错误态和恢复态补采。MCP 动作执行和证据生成均完成；对应的 `source_state_id`、after HTML、layout、computed、target contract、interaction evidence 和截图已形成。

此外，固定分值数量联动态也已补采：默认2项、添加后3项并出现删除按钮。删除回到2项的最终视觉状态可复用默认2项契约，但删除动作本身仍属于需人工确认的危险操作，未由自动采集执行。

当前 MCP 会话的离线 `analyze_capture` 已可生成 `capture_model.json`；若空间约束覆盖仍报告缺失，必须保持总体 `blocked`，不得以本契约的局部状态证据替代全局像素门禁。

## 4. 当前已确认的组件结构

```text
ScoreConfig
├── ScoreMethodRadioGroup
└── FixedScoreOptionsEditor
    ├── FixedScoreOptionRow
    │   ├── DragHandle
    │   ├── ScoreValueInput
    │   └── DeleteScoreButton (only when count > 2)
    ├── FixedScoreOptionRow
    │   ├── DragHandle
    │   ├── ScoreValueInput
    │   └── DeleteScoreButton (only when count > 2)
    └── AddScoreButton
```

## 4.1 公共删除按钮组件约定

固定分值选项行的删除按钮必须复用公共 `PerformanceIconButton`，不得在 `FixedScoreOptionRow` 内重新实现按钮壳、图标或点击处理。

| 契约项 | 约定 |
| --- | --- |
| public component | `PerformanceIconButton` |
| icon | `DeleteTrashOutlined` |
| component_id | `DeleteScoreButton` |
| source_state_ids | `RR-SCORE-FIXED-OPTIONS-3-WITH-DELETE` |
| parent | `FixedScoreOptionRow` |
| event | `remove(index)`；由 `FixedScoreOptionsEditor` 持有数组并更新状态 |
| visible rule | 固定分值选项数量大于 2 时显示 |
| hidden rule | 默认 2 项时不渲染删除按钮 |
| disabled rule | 2 项状态不通过 disabled 按钮代替隐藏；应直接不渲染 |
| icon contract | 使用公共组件的 `DeleteTrashOutlined` viewBox、path、currentColor 和 target bbox |
| accessibility | 使用唯一行号语义的 aria-label，例如“删除第3个固定分值” |
| destructive action | 删除属于危险动作；自动采集不得点击，人工确认或实现测试覆盖即可 |

删除按钮的视觉契约只绑定 3 项状态；删除回到 2 项后的视觉结果复用 `RR-SCORE-FIXED-OPTIONS-DEFAULT-2`，不新增重复 target contract。

## 4.2 公共文本输入组件约定

固定分值选项中的分值输入框必须复用公共 `PerformanceTextField`，通过 `fixed-score` 视觉变体承载目标几何和错误状态。若公共组件尚未支持该变体，应扩展现有组件，不得在 `FixedScoreOptionRow` 内重新实现裸 `<input>`。

| 契约项 | 约定 |
| --- | --- |
| public component | `PerformanceTextField` |
| variant | `fixed-score` |
| component_id | `FixedScoreValueInput` |
| source_state_ids | `RR-SCORE-FIXED-OPTIONS-DEFAULT-2`、`RR-SCORE-FIXED-OPTIONS-CONFIGURED`、`RR-SCORE-FIXED-OPTIONS-VALIDATION-ERROR`、`RR-SCORE-FIXED-OPTIONS-VALIDATION-RECOVERED`、`RR-SCORE-FIXED-OPTIONS-3-WITH-DELETE` |
| parent | `FixedScoreOptionRow` |
| v-model | `score.fixedOptions[index].value` |
| placeholder | `请输入分值` |
| control type | 普通文本输入控件；不得替换为带上下步进器的 `PerformanceNumberInput` |
| validation | 非负数；最多2位小数；非法值保留并显示行内错误，不静默截断 |
| error API | `invalid=true`、`errorMessage="最多支持2位小数"` 或等价公共组件 API |
| geometry API | `controlWidth`、`controlHeight`、`inputWidth`、`inputHeight`，参数值来自对应 source state 的 target contract |
| ownership | 输入框边框、圆角、字体、focus、error、disabled 由公共组件负责；行位置和列宽由 `FixedScoreOptionRow` 负责 |

目标已配置态的真实层级与几何：

```text
component_root / ud__input:
x≈601, y≈544, width≈360px, height≈31px

container_part / ud__input-input-wrap:
外层 label/input-wrap，承载边框内输入区域

input / ud__native-input:
x≈612, y≈549, width≈331.67px, height≈22px
```

必须保留 `component_root` 和内部 `input` 两层 bbox，禁止把内部 `331.67×22px` 写成完整控件尺寸。不同状态或行数导致宽度变化时，应通过 `fixed-score` 变体的几何参数实现，并分别绑定 source state；不得通过无证据的 `width:100%` 猜测目标长度。

错误态仍使用同一 `PerformanceTextField`：

```text
valid/default
→ 普通边框，无错误文案

invalid/error
→ 红色边框 + “最多支持2位小数”

recovered
→ 修正为0.02后恢复普通边框，错误文案消失
```

固定分值选项分支替换普通评分的评分上下限区域：

```text
在分数上下限内输入评分
→ ScoreBoundsField

在固定分值选项内选择评分
→ FixedScoreOptionsEditor
```

## 5. 已确认的固定分值选项几何

来自 `idreamsky.feishu.cn_20260828_105151_442621` 已配置态目标契约：

### 第一行

```text
DragHandle:
x=580.67, y=544, width=16, height=32

ScoreValueInput:
x=612.33, y=548.67, width=331.67, height=22
```

### 第二行

```text
DragHandle:
x=580.67, y=588, width=16, height=32

ScoreValueInput:
x=612.33, y=592.67, width=331.67, height=22
```

### 添加按钮

```text
AddScoreButton:
x=576.67, y=632, width=82, height=22
```

### 已配置值

```text
第一行：0.01
第二行：空
```

以上几何属于合法配置态，不得直接作为错误态几何使用。错误文案出现后，必须以补采的错误态 layout/computed 为准。

## 6. 固定分值字段契约

| 字段 | 契约 |
| --- | --- |
| `score.fixedOptions` | 固定分值选项数组，顺序与页面行顺序一致 |
| `score.fixedOptions[].value` | 固定分值字符串；允许整数及小数 |
| label | `配置分值选项` |
| required | 是；label 后显示必填星号 |
| placeholder | `请输入分值` |
| decimal limit | 最多保留 2 位小数 |
| invalid example | `0.022` |
| invalid message | `最多支持2位小数`；错误态的 bbox、颜色和行高已由 `RR-SCORE-FIXED-OPTIONS-VALIDATION-ERROR` 采集 |
| negative value | 允许负数；不因小于0报错；仍执行最多2位小数校验 |
| empty value | 当前已有状态显示空输入；是否作为提交错误需要独立校验采集或既有业务契约确认 |
| control | 目标状态已采集为普通输入框；不得替换为无证据的步进器或其他控件 |

## 8. 数量联动契约

| 当前状态 | 动作 | 下一状态 | 视觉/行为结果 | 证据 |
| --- | --- | --- | --- | --- |
| 默认2项 | 点击 `添加分值` | 3项带删除按钮 | 行数增加1；删除按钮出现；新增行布局按3项状态契约 | `RR-SCORE-FIXED-OPTIONS-DEFAULT-2` → `RR-SCORE-FIXED-OPTIONS-3-WITH-DELETE` |
| 3项带删除按钮 | 删除一项 | 默认2项 | 行数减少1；删除按钮消失；最终视觉状态复用默认2项契约 | 目标状态复用；删除动作需人工确认时单独保留事件证据 |
| 默认2项 | 删除 | 默认2项 | 删除操作不可用或不显示删除按钮 | 默认2项状态 |

默认2项和删除恢复后的2项只有在输入值、顺序、焦点、错误态、bbox、卡片高度和按钮可见性完全一致时才能复用同一 target contract。不得仅凭行数相同复用状态。

## 9. 错误状态契约

### 7.1 触发

```text
输入值包含超过2位小数，例如 0.022
```

### 7.2 视觉结果

必须采集并实现：

- 当前输入框显示红色边框；
- 错误文案显示为 `最多支持2位小数`；
- 错误文案位于对应输入框下方；
- 同一行拖拽手柄位置保持可追溯；
- 后续行、添加分值按钮和卡片高度按错误态实际采集结果还原；
- 不得用全局错误提示替代行内错误文案。

### 7.3 恢复

输入值改为最多 2 位小数，例如：

```text
0.022 → 0.02
```

错误边框和错误文案应消失。恢复后的字段 bbox、卡片高度和焦点状态必须以补采 after 状态为准。

## 9. 实现边界

### 允许

- 在 `ScoreConfig` 中根据评分方式切换配置区域；
- 新增 `FixedScoreOptionsEditor` 和行组件；
- 为固定分值字段增加最多 2 位小数校验；
- 复用已有 `PerformanceIconButton`、`PerformanceDragHandle`、输入框和添加按钮组件；
- 按 `RR-SCORE-FIXED-OPTIONS` 与错误态 source state 实现视觉变体。

### 禁止

- 在未完成错误态采集前声称像素级完成；
- 用 `maxlength` 代替小数位数校验；
- 用 `parseFloat` 静默截断 `0.022` 为 `0.02` 而不显示错误；
- 使用全局 toast 替代输入框下方错误文案；
- 将固定分值选项分支继续渲染为 `ScoreBoundsField`；
- 引入与目标无证据对应的下拉、步进器或弹窗。

## 10. 验收契约

### AC-FIXED-01 固定分值空态

Given 普通评分已选中
And 评分方式选择“在固定分值选项内选择评分”
When 页面完成渲染
Then 显示 `配置分值选项 *`
And 显示已采集数量的固定分值行
And 每行显示拖拽手柄和 `请输入分值`
And 显示 `添加分值`
And 不显示评分下限、评分上限和小数位数设置区域，除非新的正式采集证据明确要求保留。

证据：固定分值选项空态采集会话。

### AC-FIXED-02 合法小数

Given 固定分值输入框可编辑
When 输入 `0.01`
Then 输入值保留
And 不显示错误边框
And 不显示 `最多支持2位小数`。

证据：固定分值选项已配置态采集会话。

### AC-FIXED-02A 数量联动

Given 固定分值选项默认显示 2 项
When 点击 `添加分值`
Then 显示 3 项
And 每个固定分值行使用公共 `PerformanceIconButton` 渲染 `DeleteTrashOutlined`
And 删除按钮出现。

Given 固定分值选项显示 3 项
When 删除一项
Then 恢复为 2 项
And 删除按钮消失
And 删除后的视觉状态复用默认2项契约，前提是输入值、顺序、焦点、错误态、bbox和卡片高度均一致。

证据：固定分值数量联动态采集会话；删除动作本身不由自动采集执行。

### AC-FIXED-03 超过2位小数

Given 固定分值输入框可编辑
When 输入 `0.022`
Then 输入框显示错误态红色边框
And 对应输入框下方显示 `最多支持2位小数`
And 不静默截断输入值
And 提交行为按正式校验契约被阻断。

证据：`RR-SCORE-FIXED-OPTIONS-VALIDATION-ERROR`，`C:/Users/gaby.liu/ClonedSites/idreamsky.feishu.cn_20260828_122613_295321/captures/hybrid_steps/step_06/after/`。

### AC-FIXED-04 错误恢复

Given 固定分值输入框处于超过2位小数错误态
When 将值修正为 `0.02`
Then 错误边框和错误文案消失
And 输入值保留为 `0.02`。

证据：`RR-SCORE-FIXED-OPTIONS-VALIDATION-RECOVERED`，`C:/Users/gaby.liu/ClonedSites/idreamsky.feishu.cn_20260828_122613_295321/captures/hybrid_steps/step_08/after/`。

### AC-FIXED-05 行列和布局

Given 固定分值选项空态或已配置态
When 检查输入行、拖拽手柄和添加按钮
Then 使用各状态对应的真实 target contract bbox
And 不使用评分上下限分支的几何
And 不用内部 input bbox 冒充外层复合控件 bbox。

## 11. 待补采字段

补采时必须记录：

- 固定分值错误态的 source state ID；
- 触发动作和可重放路径；
- 输入框 root bbox；
- 内部 input bbox；
- 错误边框 computed style；
- 错误文案 bbox、字体、颜色和行高；
- 错误态卡片和行高度；
- 错误态与恢复态截图；
- `layout.json`、`computed.json`、`target_contract.json`、`interaction_evidence.json`；
- 输入值是否合法、是否保留原始非法值；
- 提交阻断结果；
- 恢复后的 after 状态。

## 12. 当前判定

```text
固定分值选项分支空态/合法配置态：已采集
固定分值选项数量2→3及删除按钮出现态：已采集
固定分值选项分支代码：数量分段布局、10项阈值导航、箭头遮罩和全数量hover已完成代码修复；真实页面验收待运行
最多2位小数业务规则：用户截图和 MCP 错误态已确认
超过2位小数错误态：已采集
错误恢复态：已采集
错误态像素契约：待投影到 extracted-ui-contract.json
正式实现验收：blocked
```

局部错误/恢复及数量联动证据已生成，但 PM-T006 全局像素门禁仍可能因其他状态或实现契约缺失而保持 blocked。

## 13. 2026-08-30 固定分值 20 项预览补充变体

2026-08-30 最终采集作为既有固定值 20/40 预览的**新增 variant**，不替换历史目标。机器投影见 `fixed-score-options-20-capture-contract.json`。

- fixture：普通评分、固定分值方式、20 个选项，值为 1～20；表单“添加分值” disabled。
- 预览共享 modal 可视 root 为 `600×158px`；外层 `role=dialog` wrapper 的 `600×567.333px` 不得误当作视觉 modal root。
- navigator viewport 为 `552×38px`；每个选项 chip 为 `42×32px`，横向 pitch 为 `54px`。
- 首屏显示 1～10，使用 `RightOutlined`；末屏显示 11～20，使用 `LeftOutlined`；关闭使用 `CloseOutlined`，dismiss 已 verified。
- hover 5、hover 15 为独立视觉状态；hover 10、hover 11 的边缘自动横向偏移也纳入目标，不能合并为普通 hover。
- 本变体所有绝对几何绑定 894×631、DPR≈1、Chrome 152、light、fonts loaded；不得与既有 1920×1080 目标跨 viewport 合并。

本变体仅完成采集证据和规格投影。`validation_coverage.json` 为 `scope_not_declared`，`replay_result.json` 为 `not_run`；rendered contract、截图 diff 和像素验收保持 `not-run`，因此不能标记为 ready 或 pixel passed。

## 14. 固定分值预览响应式数量、导航与 hover 契约

### 14.1 证据权威与覆盖边界

本节冻结固定分值预览的数量分段、导航遮罩和通用 hover 行为。证据来源分为：

- 2项既有预览：`idreamsky.feishu.cn_20260829_100910_045985 / step_21`，chip为`42×32px`，两项x分别约`684/814`，pitch约`130px`；
- 20项最终预览：`idreamsky.feishu.cn_20260830_105058_603180`，navigator viewport为`552×38px`，chip为`42×32px`，首末窗口、左右箭头、边缘hover和渐变遮罩均有完整证据；
- 响应式采集任务：`capture_fixed_score_preview_source.py` 明确以`2/5/10/11/20`为数量边界，并以`count <= 10`和`count > 10`区分无导航与有导航状态；
- 用户确认规则：1～5项自然向后增长；6～10项保持总长度不变并均匀分布；超过10项时每屏最多10项并出现左右导航；正式环境hover数字不触发自动横向滑动。

最终采集中的hover 10/11偏移仅作为采集环境产生的`observed artifact`保留，不属于正式实现目标。当前最终session只完整投影了20项交互链；3～10项逐数量的精确bbox尚未形成统一机器契约。下表中的布局策略是已确认目标，未采集的具体数值必须标记`BLOCKED`，不得用当前实现值倒推目标。

### 14.2 数量分段矩阵

| 选项数量 | track / 容器规则 | 分布规则 | 左右按钮 | overflow | source / 状态 |
| ---: | --- | --- | --- | --- | --- |
| 1 | track按单个chip自然宽度增长 | 左对齐；单chip `42×32px` | 无 | 禁止 | 数量策略已确认；精确x待数量专项证据 |
| 2～5 | track随数量自然增长，不强制把chip间距写成固定gap | 每个连接线为`flex:1 1 0%`，`min-width:12px`、`max-width:88px`；2项已测连接线宽88px；3～5项随父容器和max-width约束自然收缩/增长 | 无 | 禁止 | 2项pitch约130px；3～5项最终bbox仍需专项证据，禁止使用实现值代替 |
| 6～10 | track总宽保持552px | chip之间使用上述flex连接线均匀分布；连接线由最大88px向最小12px收缩，不使用固定`gap:88px` | 无 | 禁止 | 用户确认；各数量精确x/gap待专项证据 |
| 11～20 | navigator viewport固定`552×38px`，track横向移动 | 每屏最多显示10项；chip保持`42×32px` | 按窗口状态显示 | `overflow-x:hidden` | 20项最终session；11项采集任务已定义 |

强制关系：

```text
count <= 5:
  option chip = 42×32
  connector = flex: 1 1 0%, min-width: 12px, max-width: 88px
  rendered_width follows connector growth/shrink
  rendered_width <= 552

6 <= count <= 10:
  rendered_width = 552
  option chip = 42×32
  connector = flex: 1 1 0%, min-width: 12px, max-width: 88px
  connectors are evenly distributed
  horizontal_overflow = false

count > 10:
  viewport_width = 552
  viewport_height = 38
  scroll_container.client_width = 552
  scroll_container.overflow_x = auto
  visible_option_count <= 10
  horizontal_overflow = hidden
  navigation = enabled
```

禁止继续使用一个固定大gap覆盖所有数量。尤其不得出现：

```text
5 × 42 + 4 × 88 = 562 > 552
```

该结果会直接导致第5项之后溢出预览框，属于失败状态，不是目标变体。

### 14.3 左右导航与遮罩层级

超过10项后，左右按钮不是普通文档流元素，也不直接占用chip track宽度。该结构提炼为绩效模块标准组件 `PerformanceOptionNavigator`；`FixedScorePreviewNavigator` 只负责固定分值数据映射和评分预设，不重复实现布局与导航逻辑。

标准组件通过`options`、`layoutPolicy`和`appearanceVariant`接收配置；option使用内容自适应宽度，是否overflow由运行时`scrollWidth > clientWidth`决定；布局策略和视觉变体必须使用语义化配置，不向页面暴露任意CSS值。

目标结构为：

```text
FixedScorePreviewNavigator
├── viewport: 552×38, position:relative, overflow:hidden
├── track: horizontal movable strip
├── PreviousRail: absolute left, 48×38
│   ├── left gradient mask: 100×38, z-index:10
│   └── LeftOutlined hit area: 24×38, SVG 16×16
└── NextRail: absolute right, 48×38
    ├── right gradient mask: 100×38, z-index:10
    └── RightOutlined hit area: 24×38, SVG 16×16, z-index:20
```

右侧目标参数：

```text
rail: x=675, width=48, height=38, padding-left=24
hit area: x=699, width=24, height=38
SVG: x=703, width=16, height=16
mask: x=625, width=100, height=38
mask background: linear-gradient(to left, rgb(255,255,255), rgba(255,255,255,0))
```

左侧目标参数：

```text
rail: x=171, width=48, height=38, padding-right=24
hit area: x=171, width=24, height=38
SVG: x=175, width=16, height=16
mask: x≈169, width=100, height=38
mask background: linear-gradient(to right, rgb(255,255,255), rgba(255,255,255,0))
```

源页面的可见DOM层级还必须保留连接线，不得把连接线简化成CSS `gap`：

```text
relative flex-1 overflow-hidden
└── overflow-hidden h-19
    └── pt-2 hide-scroll pb-2
        └── flex flex-row items-center
            ├── chip
            ├── flex-1 min-w-6 max-w-44 border-t-1 border-t-solid border-N-350
            ├── chip
            └── ...
```

采集到的计算值显示：`min-w-6`实际最小宽度为`12px`，`max-w-44`实际最大宽度为`88px`。20项状态的 scroll container 为 `scrollWidth=1068px`、`clientWidth=552px`；不要用外层 track 的`bbox.width=552px`误判其实际内容宽度。

源页面左右按钮的可见状态通过 inline `display` 和渐变背景控制；无按钮时对应 rail 使用 `display:none`，不能仅把 SVG 设为透明或保留空命中区。

显示规则：

| 窗口状态 | LeftOutlined | RightOutlined |
| --- | ---: | ---: |
| 首屏 | 隐藏 | 显示 |
| 中间/边缘偏移 | 显示 | 显示 |
| 末屏 | 显示 | 隐藏 |
| 选项数量≤10 | 隐藏 | 隐藏 |

箭头可以在DOM几何上覆盖track边缘，但必须由`overflow-hidden + gradient mask + z-index`遮蔽下一个chip。若箭头旁仍能清晰看到或点击被覆盖的下一个分值，判定为重叠失败。

### 14.4 通用 chip hover 契约

hover属于固定分值chip的通用视觉状态，与选项数量和是否进入navigator无关。1～20项必须使用同一状态样式：

```text
default:
  width: 42px
  height: 32px
  background: rgb(255,255,255)
  color: rgb(100,106,115)
  border: 0.666667px solid rgb(208,211,214)
  border-radius: 9999px
  font-size: 14px
  font-weight: 600
  line-height: 18px

hover/focus-visible:
  background: rgb(240,244,255)
  color: rgb(12,41,110)
  border-color: rgb(240,244,255)
```

证据：20项session中的hover 5、hover 10和hover 15。不得只在20项navigator分支实现hover，也不得让1～10项静态分支缺少底色变化。

### 14.5 hover 与导航状态机

正式目标状态机不包含hover自动滑动：

```text
first-window(track x=171)
  -> hover 5: track不变，5号进入hover
  -> hover 10: track不变，10号进入hover
  -> click RightOutlined: last-window(track x=-345)
  -> hover 15: track不变，15号进入hover
  -> hover 11: track不变，11号进入hover
  -> click LeftOutlined: first-window(track x=171)
```

原始采集的`step_05`和`step_09`出现了track偏移，但经确认属于采集环境行为，标记为`observed_not_target`，不得写入正式实现逻辑或像素验收断言。箭头点击是唯一允许改变track位置的交互。

#### 多页导航推进规则

当实际内容形成多页时，导航必须按页面顺序推进，不得直接把当前track设置为最大或最小边界：

```text
pageIndex = 0
click next → pageIndex + 1
click previous → pageIndex - 1
```

- 第一页：只显示`RightOutlined`；
- 中间页：同时显示`LeftOutlined`和`RightOutlined`；
- 最后一页：只显示`LeftOutlined`；
- 页码切换后按当前页重新计算track offset，并在首尾边界收口；
- `maxTrackOffset`只表示最后页边界，不得直接作为每次右滑的目标。

当前20项采集只覆盖首末两页；三页以上的代码验收使用30项fixture验证中间页双按钮和往返顺序，不能把20项两页证据误写成多页像素证据。

### 14.6 开发与验收矩阵

至少覆盖以下数量：

| 数量 | 必测内容 |
| ---: | --- |
| 1 | 单chip自然宽度、无按钮、hover |
| 2 | 已采集pitch、无按钮、hover |
| 5 | 自然增长末端、不得溢出、hover |
| 6 | 切换到552px均分模式、无按钮 |
| 10 | 552px内均分、无按钮、hover第1/10项 |
| 11 | 首次出现左右导航、每屏最多10项、末屏offset不能硬编码20项值 |
| 20 | 首屏/末屏、hover 5/10/11/15、左右按钮、渐变遮罩、关闭恢复 |

Given/When/Then：

```text
Given count <= 10
When 渲染固定分值预览
Then 不出现LeftOutlined或RightOutlined
And 所有chip都在552px可视边界内
And 任一chip hover均使用统一底色和文字色

Given count > 10
When 打开固定分值预览
Then 每屏最多显示10项
And 首屏显示RightOutlined
And 导航rail通过渐变遮罩隔离下一个chip
And 箭头与分值不得视觉重叠

Given 已位于末屏
When 点击LeftOutlined
Then 返回前一窗口或首屏
And 已隐藏的chip不得穿透渐变遮罩
```

### 14.7 当前判定

```text
数量分段目标：已确认
2项与20项关键几何：已采集
3～10项逐数量精确bbox：BLOCKED，待专项投影
超过10项导航阈值：已确认
左右渐变遮罩：已采集
通用hover样式：已采集
当前实现验收：组件测试和生产构建已通过；真实页面几何/像素验收未运行
rendered contract：not-run
截图diff：not-run
像素验收：not-run
```

在数量矩阵、遮罩层级和通用hover全部通过前，不得将固定分值预览标记为开发完成。

## 15. 固定分值校验补充契约

### 15.1 数值等价重复校验

固定分值按数值等价判断重复，不按原始字符串判断：

```text
1 = 1.0 = 1.00
-1 = -1.0
```

规则：

- 空值不参与重复判断；
- 格式非法值不参与重复判断；
- 解析成功的数值与其他行数值相等时，所有重复行均显示错误；
- 错误文案固定为：`分值重复`；
- 错误显示在每个重复行对应输入框下方；
- 修正任一重复值后，剩余不重复行的错误状态实时消失；
- 重复错误阻断提交和预览。

### 15.2 最大值校验

```text
MAX_FIXED_SCORE = 1,000,000,000,000,000
```

规则：

- `value <= MAX_FIXED_SCORE` 合法；
- `value > MAX_FIXED_SCORE` 非法；
- 错误文案固定为：`不可超过 1,000,000,000,000,000`；
- 错误显示在对应输入框下方；
- 超限错误阻断提交和预览；
- 负数不触发最大值错误。

### 15.3 负数校验

以下两种评分方式均允许负数：

```text
在分数上下限内输入评分
在固定分值选项内选择评分
```

固定分值和评分上下限统一遵循：

- 允许负数；
- 允许整数和小数；
- 最多保留2位小数；
- 负号只能出现在数值开头；
- `-1`、`-0.5`、`-0.55` 合法；
- `-0.555` 触发 `最多支持2位小数`；
- `-`、`-.` 仅作为输入过程值，不得提交或预览。

### 15.4 错误优先级

同一行只显示一个主错误，优先级为：

```text
空值
→ 格式/小数位错误
→ 超过最大值
→ 数值重复
```

其中：

- 空值由表单 required 状态控制；
- 非法格式不参与重复判断；
- 超过最大值的数值不参与重复判断；
- 数值等价重复仅在格式和上限均合法后判断。

### 15.5 表单级阻断

```text
submit:
  fixed score errors exist → no submit event

preview:
  fixed score errors exist → no preview event and no modal

valid:
  no fixed score errors → preserve negative values and emit payload
```

验收必须覆盖：

```text
1 与 1.00 重复
-1 与 -1.0 重复
超过最大值
负数合法值
负数超过2位小数
修正后错误消失
提交阻断
预览阻断
```

当前实现已加入统一校验函数 `fixedScoreValidation.ts`；组件测试和表单测试已覆盖上述数值等价、最大值、负数及恢复行为。真实页面截图、rendered contract 和像素验收仍保持 `not-run`。
