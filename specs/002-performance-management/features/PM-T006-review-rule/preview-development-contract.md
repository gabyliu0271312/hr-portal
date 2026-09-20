# PM-T006 评估规则预览像素开发契约

```text
completion_status: incomplete
pixel_restore_status: blocked
ui_confirmation_status: confirmed
machine_contract: preview-extracted-ui-contract.json
```

> 三种预览分支的空间分析、完整 visual inventory、textarea resize 和 Chrome CDP rendered contract compare 已完成。当前唯一未通过项是严格全屏截图 diff：原始目标截图含不可复现的水印/字体栅格差异，因此保持 `completion_status: incomplete`、`pixel_restore_status: blocked`；不得把像素 diff 改写为通过。

## 1. 目标与非目标

### 1.1 目标

- 复原三种评估类型点击“预览”前的校验阻断；
- 复原评级非量化/量化两种预览；
- 复原普通评分上下限/固定分值两种预览；
- 复原评分映射预览初始态和输入合法分数后的映射结果；
- 统一复用一个预览弹层外壳和 `CloseOutlined` 关闭控件；
- 固化 modal、header、body、关闭按钮、预览输入和跨状态空间关系；
- 为 rendered contract 和截图 diff 提供可执行验收边界。

### 1.2 非目标

- 不保存或提交评估规则；
- 不新增后端 API、数据库、权限或持久化；
- 不采集删除行为；
- 不用当前采集推断 preview hover/focus/active 样式；未采集状态保持 `BLOCKED`；
- 不以单元测试或构建替代浏览器截图和 contract compare。

## 2. 权威证据

| 分支 | session | capture | analysis | capture model |
| --- | --- | --- | --- | --- |
| 评级 | `idreamsky.feishu.cn_20260829_100229_628802` | `completed` | `completed` | `captures/capture_model.json` |
| 评分 | `idreamsky.feishu.cn_20260829_100910_045985` | `completed` | `completed` | `captures/capture_model.json` |
| 评分映射等级型 | `idreamsky.feishu.cn_20260829_102314_409157` | `completed` | `completed` | `captures/capture_model.json` |

统一环境：

```text
URL: https://idreamsky.feishu.cn/perf/admin/review-questions/review-rules/create
viewport: 1920×1080
DPR: 1
browser: Chrome
fonts_status: loaded
color_scheme: light
```

每个状态必须使用同目录的完整证据包：

- `after.html`
- `after.png`
- `layout.json`
- `computed.json`
- `interaction_evidence.json`
- `target_contract.json`
- `validation.json`
- `interaction.json`

原始采集目录不提交 Git；机器索引见 `preview-extracted-ui-contract.json`。

## 3. 状态索引

### 3.1 评级

| source_state_id | step | 语义 |
| --- | ---: | --- |
| `RR-PREVIEW-RATING-VALIDATION` | 00 | 空表单点击预览前 |
| `RR-PREVIEW-RATING-VALIDATION-ERROR` | 03 | 名称和3行等级代号必填错误 |
| `RR-PREVIEW-RATING-NON-QUANTIFIED` | 10 | 评级可参与计算关闭的正常预览 |
| `RR-PREVIEW-RATING-QUANTIFIED-FORM` | 15 | switch 已由 `false → true`，量化列出现 |
| `RR-PREVIEW-RATING-QUANTIFIED` | 21 | 量化分填写完成后的正常预览 |
| `RR-PREVIEW-RATING-COMPLETED` | 24 | 量化预览关闭后返回表单 |

证据根：`C:/Users/gaby.liu/ClonedSites/idreamsky.feishu.cn_20260829_100229_628802/captures/hybrid_steps/`。

### 3.2 评分

| source_state_id | step | 语义 |
| --- | ---: | --- |
| `RR-PREVIEW-SCORE-VALIDATION` | 02 | 评分空表单点击预览前 |
| `RR-PREVIEW-SCORE-VALIDATION-ERROR` | 05 | 名称、评分上下限必填错误 |
| `RR-PREVIEW-SCORE-BOUNDS` | 11 | 在分数上下限内输入评分的预览 |
| `RR-PREVIEW-SCORE-FIXED-FORM` | 16 | 固定分值选项 20/40 的表单态 |
| `RR-PREVIEW-SCORE-FIXED` | 21 | 固定分值选项预览 |
| `RR-PREVIEW-SCORE-COMPLETED` | 24 | 固定分值预览关闭后返回表单 |

证据根：`C:/Users/gaby.liu/ClonedSites/idreamsky.feishu.cn_20260829_100910_045985/captures/hybrid_steps/`。

### 3.3 评分映射等级型

| source_state_id | step | 语义 |
| --- | ---: | --- |
| `RR-PREVIEW-MAPPING-VALIDATION` | 02 | 映射空表单点击预览前 |
| `RR-PREVIEW-MAPPING-VALIDATION-ERROR` | 05 | 名称、上下限、区间边界、等级代号错误 |
| `RR-PREVIEW-MAPPING-INITIAL` | 16 | 0～100、边界60，尚未输入预览分数 |
| `RR-PREVIEW-MAPPING-VALUE-50` | 19 | 预览内输入合法分数50后的映射结果 |
| `RR-PREVIEW-MAPPING-COMPLETED` | 22 | 映射预览关闭后返回表单 |

证据根：`C:/Users/gaby.liu/ClonedSites/idreamsky.feishu.cn_20260829_102314_409157/captures/hybrid_steps/`。

失败会话 `idreamsky.feishu.cn_20260829_101544_526973` 未打开预览，禁止作为目标证据。

### 3.4 固定分值20项新增variant

最终采集真源为 `idreamsky.feishu.cn_20260830_105058_603180`，机器投影见 `fixed-score-options-20-capture-contract.json`。该variant是既有固定值20/40预览的补充，不覆盖既有状态。

- 表单 fixture 为固定分值1～20，共20项；预览 navigator 的可视 viewport 为 `552×38px`。
- 选项 chip 为 `42×32px`，横向 pitch `54px`；首屏为1～10，末屏为11～20。
- hover 5/15分别记录独立视觉状态；hover 10/11的采集后横向偏移标记为采集环境`observed_not_target`，正式环境hover只改变chip视觉，不改变track位置。
- 左右导航使用真实 `LeftOutlined` / `RightOutlined`；关闭使用 `CloseOutlined`，dismiss verification 为 `verified`。
- 该session viewport为894×631、DPR≈1、Chrome152；不得把其绝对坐标投影为既有1920×1080目标。
- validation scope未声明、replay未运行；实现后的rendered contract、截图diff和像素验收保持 `not-run`。

## 4. 组件拆解

| 层级 | 组件 | 职责 | props / v-model | emits | source_state_ids |
| --- | --- | --- | --- | --- | --- |
| 基础 | `PreviewCloseButton` | 28px 点击区、20px `CloseOutlined`、关闭当前顶层预览 | `semanticTarget="关闭预览"` | `close` | 所有正常预览状态 |
| 业务 | `ReviewRulePreviewModal` | overlay、600px modal、header、body、类型渲染插槽 | `open`, `reviewType`, `formValue` | `close`, `update:previewValue` | 所有正常预览状态 |
| 业务 | `RatingRulePreview` | 渲染等级代号和量化变体 | `levels`, `quantified` | N/A | `RR-PREVIEW-RATING-*` 正常预览 |
| 业务 | `ScoreRulePreview` | 渲染上下限评分输入或固定值选项 | `method`, `bounds`, `fixedOptions` | N/A | `RR-PREVIEW-SCORE-BOUNDS`, `RR-PREVIEW-SCORE-FIXED` |
| 业务 | `ScoreMappingRulePreview` | 渲染预览分数输入、区间和映射等级 | `bounds`, `intervals`, `previewValue` | `update:previewValue` | `RR-PREVIEW-MAPPING-INITIAL`, `RR-PREVIEW-MAPPING-VALUE-50` |
| 页面 | `ReviewRuleForm` | 校验、持有表单、打开/关闭预览 | `modelValue`, `mode` | `preview`, `update:modelValue` | 全部状态 |

### 4.1 组件树

```text
ReviewRuleForm
├── PreviewTrigger
├── ValidationFeedback
└── ReviewRulePreviewModal
    ├── ModalHeader
    │   ├── Title「预览」
    │   └── PreviewCloseButton
    │       └── CloseOutlined
    └── ModalBody
        └── type renderer
            ├── RatingRulePreview
            ├── ScoreRulePreview
            └── ScoreMappingRulePreview
                └── PreviewScoreInput
```

新建与编辑必须复用同一个预览组件树；不得为三种评估类型复制三套 modal DOM。

## 5. 预览弹层像素契约

### 5.1 通用外壳

| 元素 | 评级/评分 | 评分映射 | 固定/约束 | source_state_ids |
| --- | --- | --- | --- | --- |
| modal root | `600×158 @ (660,461)` | `600×358.667 @ (660,360.667)` | 水平居中；内容高度变体 | 正常预览状态 |
| header | `600×72 @ (660,461)` | `600×72 @ (660,360.667)` | 高度固定72 | 同上 |
| body | `600×62 @ (660,533)` | `600×262.667 @ (660,432.667)` | 左右padding 24 | 同上 |
| modal bottom inset | 24px | 24px | `modal.bottom - body.bottom` | 同上 |

通用 tokens：

```text
background: rgb(255,255,255)
color: rgb(31,35,41)
font: 400 14px/22px system stack
border-radius: 8px
header padding: 24px 56px 24px 24px
body padding-inline: 24px
```

评分会话修复分析器后已离线重建，modal/root及页面卡片关系均有真实 first/terminal anchors，`missing_terminal_anchors=[]`。

### 5.2 关闭按钮

```text
button bbox: 28×28.7917
button padding: 4px
button radius: 6px
button color: rgb(100,106,115)
SVG: CloseOutlined
SVG bbox: 20×20
rating/score button: (1212,483)
rating/score SVG: (1216,487.792)
mapping button: (1212,382.667)
mapping SVG: (1216,387.458)
right inset: 20px
top inset: 22px
```

关闭行为必须调用通用 icon-only 语义解析：

```text
requested_target: 关闭预览
strategy: inferred_icon_semantics
data_icon: CloseOutlined
risk: safe_reversible_dismiss
dismiss_verification.status: verified
dismiss_verification.dismissed: true
```

若点击后无法确认弹层消失，必须阻断后续动作，不能仅发送 `close` 后假定成功。

## 6. 类型变体

### 6.1 评级非量化/量化

共同 modal：`600×158`。Body 文本按表单中的等级顺序显示 `C / B / A`。

| 项目 | 非量化 | 量化 |
| --- | --- | --- |
| source | `RR-PREVIEW-RATING-NON-QUANTIFIED` | `RR-PREVIEW-RATING-QUANTIFIED` |
| switch | false | true，必须记录 `aria-checked false→true` |
| 表单列 | code/name/value | code/name/quantifiedScore/value |
| 预览外壳 | 相同 | 相同 |

量化表单使用示例值 1/2/3。预览弹层不应复制表单输入控件，不应因量化变体改变外壳宽高。

### 6.2 普通评分

#### 上下限方式

```text
source_state_id: RR-PREVIEW-SCORE-BOUNDS
modal: 600×158
preview input native bbox: 216.667×22 @ (695.667,537.667)
configured bounds: 0～100
```

#### 固定值方式

```text
source_state_id: RR-PREVIEW-SCORE-FIXED
modal: 600×158
fixed options: 20 / 40
```

两种方式共用 `ScoreRulePreview`，由 `method` 决定 body 结构；不得同时渲染上下限输入和固定值选项。

### 6.3 评分映射等级型

```text
source_state_ids:
- RR-PREVIEW-MAPPING-INITIAL
- RR-PREVIEW-MAPPING-VALUE-50
modal: 600×358.667
preview input native bbox: 216.667×22 @ (695.667,437.333)
global bounds: 0～100
interval boundary: 60
preview value: 50
```

状态差分：

```text
initial
→ 输入50
→ 合法值保持在同一输入框
→ 映射结果更新
→ modal/header/body/input bbox保持不变
```

预览输入值必须只影响预览本地状态，不回写评估规则区间配置。

## 7. 校验契约

### 7.1 评级

```text
名称为必填
默认3行等级代号分别为必填
```

错误时预览 modal 不打开。修正名称和3行代号后，同一次点击预览必须打开 modal。

### 7.2 评分

```text
名称为必填
评分上下限为必填
```

上下限方式修正为0～100后预览可打开；固定值方式使用20/40后预览可打开。

### 7.3 评分映射等级型

```text
名称为必填
评分上下限为必填
区间上下限必须位于全局评分上下限内
每行等级代号为必填
```

有效 fixture：

```text
global: 0～100
interval boundary: 60
codes: C / A
names: 待改进 / 优秀
preview value: 50
```

错误时不能创建空白预览 modal。

## 8. 状态机

```text
form_invalid
  └─ preview → validation_error（modal=false）

validation_error
  └─ recover fields → form_valid

form_valid
  └─ preview → preview_open

preview_open
  ├─ 关闭预览 → form_valid
  └─ mapping preview input 50 → mapping_preview_value_50

rating form
  └─ 评级可参与计算 false→true → quantified_form
```

每个 switch/radio 必须记录关联控件解析和状态变化：

```text
strategy: associated_text_control
before: false
after: true
state_changed: true
status: verified
```

## 9. 布局关系与不变量

| relation | expected | tolerance | source_state_ids |
| --- | --- | --- | --- |
| 所有正常预览 modal 宽度 | 600px | ±1px | 六个正常预览状态 |
| header 高度 | 72px | ±1px | rating/score/mapping |
| CloseOutlined | 20×20 | ±1px | 所有正常预览状态 |
| close hit area | 28×约28.79 | ±1px | 同上 |
| body inline inset | 24px | ±1px | 同上 |
| modal bottom - body bottom | 24px | ±1px | 同上 |
| mapping preview input initial/value | bbox完全一致 | ±1px | `INITIAL`, `VALUE-50` |

关系真源：各 session `capture_model.json#/derived_spatial_constraints`。rating、score、mapping 三个会话的 `missing_terminal_anchors` 与 `uncompared_variant_groups` 均为空。

## 10. 组件 API

### ReviewRulePreviewModal

```ts
props: {
  open: boolean
  reviewType: 'rating' | 'score' | 'mapping'
  formValue: ReviewRuleFormValue
}

emits: {
  close: []
  'update:previewValue': [value: string]
}
```

### 类型渲染器

```ts
RatingRulePreview:
  levels
  quantified

ScoreRulePreview:
  method
  bounds
  fixedOptions

ScoreMappingRulePreview:
  bounds
  intervals
  previewValue
  emits update:previewValue
```

预览组件只接收已校验的只读配置；除 `previewValue` 外，不得直接 mutate `ReviewRuleFormValue`。

## 11. Given / When / Then

### AC-P01 评级预览校验

Given 评级表单名称和等级代号为空  
When 点击预览  
Then 显示名称及3行等级代号错误  
And 不打开预览 modal。

### AC-P02 评级非量化预览

Given 名称和等级代号已填写且量化开关关闭  
When 点击预览  
Then 打开 `600×158` 预览  
And 按顺序显示 C/B/A  
When 点击右上角关闭  
Then `dismissed=true` 且返回表单。

### AC-P03 评级量化预览

Given switch 已验证 `false→true` 且量化分1/2/3已填写  
When 点击预览  
Then 使用与非量化相同的 modal shell  
And 关闭后量化表单值保持。

### AC-P04 评分上下限预览

Given 名称已填且上下限为0～100  
When 点击预览  
Then 显示上下限评分预览输入  
And native input bbox约 `216.667×22`。

### AC-P05 固定值预览

Given 评分方式为固定值且选项为20/40  
When 点击预览  
Then body显示20和40  
And 不同时显示上下限输入。

### AC-P06 映射预览初始态

Given 全局0～100、边界60、两行代号已配置  
When 点击预览  
Then modal为 `600×358.667`  
And preview input bbox约 `216.667×22`  
And 尚未显示由输入分数触发的映射结果。

### AC-P07 映射合法值

Given 映射预览已打开  
When 输入50  
Then 同一modal中显示对应映射结果  
And modal/header/body/input几何不变  
And 表单区间配置不被回写。

### AC-P08 关闭预览

Given 任一预览处于活动顶层弹层  
When 点击语义目标“关闭预览”  
Then 解析到 `CloseOutlined` 所属按钮  
And target resolution为 `inferred_icon_semantics`  
And dismiss verification为 `verified`。

## 12. 实现任务边界

### PM-T006-T04P 预览校验与数据投影

- 负责三种类型点击预览前校验；
- 生成只读 preview payload；
- 不实现 modal 视觉。

### PM-T006-T05P 共享预览 modal 与类型渲染器

- 新增/复用 `ReviewRulePreviewModal`；
- 抽取三个类型渲染器；
- 复用 `PreviewCloseButton`；
- mapping preview input只持有本地状态。

### PM-T006-T06P 预览像素验收

- 生成 `rendered-ui-contract.json`；
- 对六个正常预览和三个错误态截图；
- 执行 modal/close/body/input/container relation 比较；
- 输出截图 diff。

## 13. 测试要求

建议真实测试文件：

```text
ReviewRuleForm.spec.ts
ReviewRulePreviewModal.spec.ts
RatingRulePreview.spec.ts
ScoreRulePreview.spec.ts
ScoreMappingRulePreview.spec.ts
ReviewRuleCreatePage.spec.ts
```

必须覆盖：

- 三类空表单预览校验；
- 非量化/量化评级预览；
- switch状态真实变化；
- 上下限/固定值评分预览；
- mapping初始态和输入50后的差分；
- 关闭后焦点与表单值恢复；
- 新建/编辑共用组件树；
- 无保存、提交或 API 副作用。

## 14. 关联门禁：备注textarea resize

主PM-T006门禁引用同一 `extracted-ui-contract.json`，因此预览实现启动前同时要求以下非预览证据完整：

```text
RR-REMARK-RESIZE-DEFAULT: 758.667×49.333
RR-REMARK-RESIZE-DRAGGING: 758.667×149.000
RR-REMARK-RESIZE-AFTER: 758.667×149.000
after.height > default.height
```

证据会话：`idreamsky.feishu.cn_20260829_115630_896677`。该门禁已完成，不属于预览组件实现范围。

## 15. 完成门禁

当前状态：

```text
capture_business_states: passed
rating_spatial_constraints: passed
mapping_spatial_constraints: passed
score_spatial_constraints: passed
rendered_contract_compare: passed
screenshot_diff: failed_strict_watermark_font_rasterization
completion_status: incomplete
pixel_restore_status: blocked
```

已完成：评分空间分析器离线重建、三分支 spatial coverage、主契约 visual inventory、备注 textarea resize、预览校验/payload、共享 modal、Chrome CDP rendered contract、9 组 target/actual/diff 文件。严格像素 diff 仍未通过，原因已记录为原始目标截图水印与字体栅格差异；不得将 `pixel_restore_status` 改为 passed。

解除阻塞前必须：

1. 已完成：修复评分空间分析器并离线重建，empty-container terminal anchors 已清空；
2. 实现页面生成预览 `rendered-ui-contract.json`；
3. 使用同一 viewport/DPR/font fixture 运行 contract compare；
4. 输出六个正常预览、三个错误态和映射输入50状态的实现截图及 diff；
5. 将结果同步回 `capture-completion-checklist.md`、`component-model.md`、`pixel-contract.md`、`acceptance-contract.md` 和 `atomic-tasks.md`。

在此之前不得勾选预览像素验收任务，不得写 `ready_for_implementation` 或宣称像素还原完成。
