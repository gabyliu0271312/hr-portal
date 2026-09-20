# Evidence-to-Design Delivery

## Collector Readiness Gate

采集证据进入 UI Expert 前必须先通过独立的 readiness 判断。至少区分：

- `capture_integrity`：JSON、状态 ID、viewport/DPR、证据路径和安全边界是否有效；
- `capture_completeness`：目标入口、交互分支、before/after 和 artifacts 是否覆盖；
- `implementation_readiness`：当前 feature 或指定 variant 是否已经足以生成 UI Implementation Brief；
- `readiness_scope`：全 feature 或局部 variant；无关历史缺口只能阻止 feature ready，不能伪装为已完成。

缺失证据是 `blocked/not_observed`，已观察到但不符合约束才是 `invalid_evidence`。不因 readiness 失败自动重新采集；先报告阻塞并等待明确授权。

`analyze_capture` 产生的 `capture_model.json#/implementation_brief` 是采集器到 UI Expert 的交接输入；UI Expert 再将其投影为 feature 的 `extracted-ui-contract.json#/variant_contracts`。`variant_candidates` 只能作为待确认线索，不能作为前端实现契约。

采集证据不是前端设计交付。正式实现前，必须把原始 HTML、layout、computed、截图和交互证据整理为四层产物：

1. Evidence layer：原始状态、DOM 锚点、bbox、computed styles、截图、交互证据和来源路径。
2. Design layer：组件 anatomy、设计 token、布局约束、视觉元素、变体矩阵和父子布局责任。
3. Implementation layer：组件边界、DOM 结构、props、events、状态机和页面组合方式。
4. Acceptance layer：运行时几何/样式对比、截图 diff、状态覆盖和阻塞规则。

## Design Layer Minimum

对每个可复用组件，必须输出以下内容；每一行都要有 `source_state_ids`：

| 交付项 | 必须说明 |
| --- | --- |
| anatomy | 根节点、子节点、文本节点、图标、伪元素、控件外壳及其父子关系 |
| tokens | 字体、字号、字重、行高、颜色、边框、圆角、阴影和间距 |
| geometry | bbox、固定尺寸、最小/最大尺寸及测量 viewport |
| constraints | 对齐边、间距关系、等宽/等高关系、父级负责的布局规则 |
| variants | default/hover/focus/active/disabled/error/expanded 等状态及差异 |
| API | props、events、v-model、默认值和可配置视觉变体 |
| ownership | 组件负责的视觉/交互属性，以及页面父级负责的布局属性 |

绝对坐标只作为测量证据，不能单独作为实现规则。每个关键尺寸必须同时说明它是固定值、父级约束、同级关系还是响应式规则；无法确认时标记 `BLOCKED`。

## Variant contract

字段清单不等于可实现设计。每个动态 UI variant 必须同时记录 `variant_key`、`entry_mode`、`review_type`、`config_discriminator` 和 `source_state_ids`，并将状态内的元素分为：

- `visible_elements`：可见节点/文本、组件 `owner` 和 `display_mode`；
- `forbidden_elements`：当前 variant 不得出现的节点/文案，允许为空但必须显式记录；
- `line_groups`：必须同一行、不可换行或需要合并展示的元素集合；
- `component_ownership`：页面、共享组件和附加模块的职责边界。

`ReviewRuleConfigRenderer`、附加卡片和页面组装层不得依据同一字段清单各自猜测可见性。Markdown 文档必须投影自该契约；实现测试必须同时断言 visible 和 forbidden 内容。

## UI Implementation Brief

`variant_contracts` 是 UI 专家交给前端工程师的唯一实现简报。前端工程师必须能仅依据该简报回答：

- 当前入口和规则变体是什么；
- 哪些节点/文案必须显示，哪些明确禁止；
- 哪些元素必须同行、不可换行或需要合并；
- 页面、共享 renderer、附加卡片分别负责什么；
- 目标 geometry/style 和对应 `source_state_ids` 是什么。

字段清单只能说明采集到过哪些字段，不能替代实现简报中的可见性和归属结论。

## Derived Spatial Constraints

白色空间、边缘留白和组件收口没有独立 DOM 节点，必须由布局证据派生：

1. 为每个视觉容器识别 `component_root`、`first_visible_child` 和 `terminal_visible_child`；
2. 计算 top/right/bottom/left edge inset，并记录 evidence、viewport、DPR 和 ownership；
3. 排除 portal、overlay、fixed 和容器外节点；
4. 比较同一组件的所有动态变体，数值在 tolerance 内相等时生成 `variant_invariant`，否则记录显式 variant；
5. 将关系同步投影到机器契约、组件模型、像素契约和 Given/When/Then；
6. 实现后用 rendered contract 重算并比较，构建或单测不能替代。

每个容器必须有完整 edge constraint 或明确 `BLOCKED/N/A`。只记录子元素 bbox、不记录容器边缘关系，视为设计交付不完整。

### 复合控件 geometry 交付

对包含外层壳体、内部 input、操作柄、操作项、图标或伪元素的复合控件，`geometry` 必须分层交付，不得把子元素尺寸提升为根控件尺寸。每个控件至少记录：

- `component_root`：完整视觉外框和命中区域的 bbox；
- `parts.input_wrap`、`parts.input`、`parts.handle`、`parts.handle_items`、`parts.svg`（按实际 DOM 存在项记录）；
- 每个 part 的 `bbox_role`、稳定 anchor、parent/child 关系、viewport、DPR 和 variant；
- 外层尺寸、内部内容尺寸、绝对定位 overlay 尺寸分别记录，禁止用 flex 剩余宽度推断目标外层尺寸；
- 当同一控件同时存在 `root bbox` 和 `input bbox` 时，必须在契约中显式说明两者不可互换。

以数字输入为例，`ud__input-number` 的 `98×31px` 外层、`75.0729×22px` 内部 input 和 `32×30px` handle 必须作为三个层级保存；任何一层缺少真实证据都标记 `BLOCKED`。

复合数字控件交付前必须校验：最近的 `.ud__input-number` 祖先是 `component_root`；root、input、handle、两个 handle-item 和两个 SVG 都有 bbox；root 高度约 `31px`、input 高度 `22px`、handle 为 `32×30px`。`interval` 和 `score_bounds` 等 variant 必须各自保存 outer/inner bbox，并绑定 viewport、DPR、variant、state；不得跨 variant 使用另一层 bbox。

## Component Decision Rules

- 同一视觉结构在两个或更多位置出现时，先比较 anatomy、tokens、constraints 和 variants，再决定是否抽取共享组件。
- 只有文字不同而结构、几何、样式和交互一致时，使用同一组件的 prop；存在证据支持的视觉差异时，使用显式 variant。
- 页面特有的 x/y、列宽、卡片间距和容器定位由父级负责；字体、颜色、边框、控件状态和内部对齐由组件负责。
- 采集证据不足以支持组件合并时，保持独立实现并记录阻塞原因，不以“看起来相似”推断复用。

## Acceptance Layers

验收必须分层报告，不得用构建或单测替代视觉验收：

- structure：DOM/组件树、父子关系、字段顺序和控件类型；
- layout：bbox、对齐、间距、尺寸和溢出；
- visual：字体、颜色、边框、圆角、阴影、图标和伪元素；
- behavior：状态切换、输入、拖拽、resize、错误和禁用；
- pixel：目标截图与运行时截图 diff。

任一层缺少对应证据时标记 `not-run` 或 `blocked`，不能声明像素级完成。
