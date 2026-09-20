# PM-T004 内容设置组件模型

completion_status: incomplete
pixel_restore_status: blocked
uncovered_reasons:
- 已完成三栏、九环节内容变体、抽屉/分组弹窗、卡片 root/item 和操作条的结构提炼。
- 自定义文本/标签最终进入中栏后的 root/item 证据缺失。
- “更多”菜单、分组下拉选项、完整 focus/active/disabled、resize、键盘和响应式证据缺失。

## 1. Evidence index

| source_state_id | session | URL | viewport/DPR | state | evidence |
| --- | --- | --- | --- | --- | --- |
| `base` | `realtime-c410fb70178f` | `https://idreamsky.feishu.cn/perf/admin/templates/7676505206036630516/3` | 1280×673 / 1.5 | three-column baseline | `extracted-ui-contract.json#/states/0/artifacts` |
| `ALL9-*` | `realtime-de9d5a00c734` | `https://idreamsky.feishu.cn/perf/admin/templates/7675561220111403992/3` | 1920×1080 / 1 | nine-stage matrix | `capture-manifest.md §3` |
| `C10-DRAWER-OPEN` | `realtime-c4d2d08187cf` | same supplemental URL | 1280×673 / 1.5 | drawer open | `extracted-ui-contract.json#/states/C10-DRAWER-OPEN` |
| `C10-VISIBILITY-SWITCH-ON` | `realtime-c4d2d08187cf` | same supplemental URL | 1280×673 / 1.5 | group entry visible | `extracted-ui-contract.json#/states/C10-VISIBILITY-SWITCH-ON` |
| `C10-GROUP-DIALOG-OPEN` | `realtime-c4d2d08187cf` | same supplemental URL | 1280×673 / 1.5 | two groups | `extracted-ui-contract.json#/states/C10-GROUP-DIALOG-OPEN` |
| `C10-THIRD-GROUP-ADDED` | `realtime-c4d2d08187cf` | same supplemental URL | 1280×673 / 1.5 | three groups | `extracted-ui-contract.json#/states/C10-THIRD-GROUP-ADDED` |
| `C10-GROUP-DIALOG-CANCEL` | `realtime-c4d2d08187cf` | same supplemental URL | 1280×673 / 1.5 | cancelled | `extracted-ui-contract.json#/states/C10-GROUP-DIALOG-CANCEL` |
| `C20-*` | `realtime-61c12d88a1fa` / related sessions | same supplemental URL | 1280×673 / 1.5 | root/item/toolbar states | `capture-manifest.md §3` |
| `TYPE-WORK-SUMMARY-*` | `realtime-72559dd43149` | same supplemental URL | 1280×673 / 1.5 | root/item selected | `capture-manifest.md §3` |
| `CUSTOM-*` | `realtime-72d743fc6fd0` / `realtime-51c3b7d38eb6` | same supplemental URL | 1280×673 / 1.5 | text/tag editor and drawer re-entry | `capture-manifest.md §3` |

## 2. Component tree

```text
TemplateCreateWizard
└─ TemplateBuilderLayout
   ├─ StagesPanel
   │  └─ StageContent × 9
   ├─ ContentSettingsCenter
   │  ├─ ContentTabs
   │  ├─ StageContentPanel
   │  ├─ ConfiguredContentCardRoot
   │  │  ├─ TopDragHitArea
   │  │  ├─ CardActionToolbar
   │  │  ├─ CardTitle / description
   │  │  ├─ CollapseButton
   │  │  └─ ConfiguredContentItem
   │  └─ ContentOperationBar
   └─ ContentSettingsAside
      ├─ EmptyState
      └─ SelectedContentSettings

Overlay layer
├─ AssessmentContentDrawer
│  ├─ AssessmentVisibilitySwitch
│  ├─ AssessmentGroupSettingsButton
│  ├─ AssessmentContentList
│  └─ AssessmentGroupSettingsDialog
└─ AssessmentCustomEditor
   ├─ TextCustomEditor
   └─ TagCustomEditor
```

## 3.1 规则驱动的环节复用

九个环节不对应九个页面或九套卡片。页面只提供当前 `stage_type`、`executor_type`、`content_slot` 和 `content_type`，由 `ContentSettingsStageRenderer` 查询唯一的 `stageContentRules` 后渲染共享组件。

```text
stage_type + executor_type + content_slot + content_type + selected_owner
-> stageContentRules
-> ContentSettingsStageRenderer
-> ContentTabs / ConfiguredContentCardRoot / ConfiguredContentItem / ContentSettingsAside
```

规则配置至少声明：

| 配置项 | 作用 |
| --- | --- |
| `visible_slots` | 当前环节允许的填写/参考/供调整/查看入口 |
| `forbidden_slots` | 当前变体禁止出现的入口 |
| `root_settings_variant` | 整卡右栏设置变体 |
| `item_settings_variant` | 内容项右栏设置变体 |
| `allowed_content_types` | 当前入口可添加的内容类型 |
| `executor_discriminator` | 仅在执行人造成真实差异时参与规则选择 |

新增环节默认只增加规则注册项和测试 fixture；禁止复制页面、卡片、抽屉或右栏组件。仅当采集证据证明 DOM anatomy、交互或视觉责任不可复用时，才允许新增差异化业务组件，并在契约中说明原因。

## 3.2 预览组件复用规则

新建/编辑弹窗预览、抽屉回填摘要和中栏已配置卡片预览共享同一 `ContentPreviewRenderer` 与同一内容类型规则。复用的是内容模型、字段顺序、内容类型 renderer 和预览语义，不复用不同场景的外层 DOM。

| render_context | 外层 owner | renderer 责任 | 场景差异 |
| --- | --- | --- | --- |
| `editor` | `EditorPreviewPane` | 根据 draft 实时渲染内容 | 受表单输入驱动，不显示卡片操作条 |
| `configured-card` | `ConfiguredContentCardRoot` / `CardPreviewArea` | 根据当前会话的已配置内容渲染 | 支持卡片展开/折叠、root/item 选择和操作条，由外层管理交互 |
| `drawer-summary` | `AssessmentContentDrawer` | 渲染已选择内容摘要 | 服务于 checkbox/回填，不承担卡片级设置 |

`ContentPreviewRenderer` 的内容类型映射为：`work_summary`、`rating`、`custom_text`、`custom_tag`。新增内容类型必须先登记内容模型、renderer、允许的 `render_context` 和对应 fixture；不得在弹窗和中栏分别实现一套预览 HTML。


| 层级 | 组件 | 职责 | 复用 | props/events | source_state_ids |
| --- | --- | --- | --- | --- | --- |
| 基础 | `StageContent` | 左栏环节卡片、选中/hover | 9 个环节 | `stage`; `select` | `ALL9-360-INVITE-FILL`、`ALL9-RESULT-VIEW` |
| 基础 | `PerformanceSwitch` | 28×16 开关 | 抽屉、右栏 | `modelValue`; `update:modelValue` | `C10-DRAWER-OPEN`、`C10-VISIBILITY-SWITCH-ON` |
| 基础 | `IconActionButton` | SVG 命中区、hover、disabled | 操作条/关闭/展开 | `icon`, `disabled`; `click` | `C20-CARD-HEADER-HOVER`、`C20-TOOLBAR-MOVE-UP-HOVER` |
| 基础 | `ModalShell` | 遮罩、标题、footer、焦点边界 | 分组/自定义编辑 | `open`, `mode`; `close`, `confirm` | `C10-GROUP-DIALOG-OPEN`、`CUSTOM-TEXT-MODAL-OPEN` |
| 业务 | `ContentSettingsStageRenderer` | 读取 `stageContentRules`，选择共享内容组件与设置变体 | 九个环节 | `stageType`, `executorType`, `contentSlot`, `contentType`; `render` | `ALL9-360-INVITE-FILL`、`ALL9-CALIBRATION-ADJUSTMENT`、`ALL9-RESULT-VIEW` |
| 业务 | `ContentTabs` | 根据环节类型显示中栏内容入口 | 本模块 | `stageType`, `executorType`, `activeTab`; `update:activeTab` | `ALL9-360-INVITE-FILL`、`ALL9-CALIBRATION-REFERENCE` |
| 业务 | `ConfiguredContentCardRoot` | 整卡选中、拖拽条、卡片级设置 | 所有配置内容 | `contentId`, `contentType`, `expanded`; `select-root`, `toggle-expanded`, `move`, `edit`, `delete` | `C20-CARD-ROOT-SELECTED-CLEAN`、`C20-CARD-HEADER-HOVER` |
| 业务 | `ConfiguredContentItem` | 内容项选中、题级设置 | 所有配置内容 | `contentId`, `itemId`, `selected`; `select-item`, `update-settings` | `C20-CONTENT-BODY-SELECTED-DIAGNOSTIC`、`TYPE-WORK-SUMMARY-ITEM-TRUSTED-POINT` |
| 业务 | `ConfiguredCardActionToolbar` | 固定四按钮及边界禁用态 | 配置卡片 | `first`, `last`, `visible`; `move-up`, `move-down`, `edit`, `delete` | `C20-CARD-HEADER-HOVER`、`C20-TOOLBAR-MOVE-UP-HOVER`、`C20-TOOLBAR-MOVE-DOWN-HOVER`、`C20-TOOLBAR-EDIT-HOVER`、`C20-TOOLBAR-DELETE-HOVER` |
| 业务 | `AssessmentContentDrawer` | 选择、创建、回填、确定/取消 | 评估型环节 | `open`, `visibility`, `contents`; `confirm`, `cancel`, `created` | `C10-DRAWER-OPEN`、`CUSTOM-TEXT-CONFIRM-RESUMED`、`CUSTOM-TAG-CONFIRM` |
| 业务 | `AssessmentGroupSettingsDialog` | 分组名称/评估内容选择、添加/取消 | 分人群可见 | `open`, `groups`; `add-group`, `cancel`, `confirm` | `C10-GROUP-DIALOG-OPEN`、`C10-THIRD-GROUP-ADDED`、`C10-GROUP-DIALOG-CANCEL` |
| 业务 | `AssessmentCustomEditor` | 文本/标签双栏编辑和校验 | 新建与编辑 | `mode=create|edit`, `type=text|tag`, `draft`; `confirm`, `cancel`, `close` | `CUSTOM-TEXT-MODAL-OPEN`、`CUSTOM-TAG-MODAL` |
| 业务 | `ContentPreviewRenderer` | 编辑器、回填抽屉和配置卡片共享预览 | 新建/编辑/已配置 | `contentType`, `draft`; `update` | `CUSTOM-TEXT-MODAL-OPEN`、`CUSTOM-TAG-MODAL`、`C20-CARD-ROOT-SELECTED-CLEAN` |
| 页面 | `PerformanceTemplateContentSettings` | 持有环节、Tab、root/item owner 并组装 | 页面专属 | `templateId`; route state | `base`、`ALL9-360-INVITE-FILL` |

## 3.3 基础组件复用矩阵

内容设置不得在页面内重新定义已经存在的基础控件。优先复用以下现有组件：

| 能力 | 复用组件 | 内容设置用途 | 处理原则 |
| --- | --- | --- | --- |
| 单行文本框 | `hr-portal/frontend/src/components/performance/PerformanceTextField.vue` | 名称、填写题名称 | `type=input`；只通过 props 配置 placeholder/required/disabled |
| 多行文本框 | `PerformanceTextField.vue` | 普通描述、提示 | `type=textarea`；不得定义局部 `FormField` |
| 计数文本框 | `PerformanceCountedTextarea.vue` | 有字数上限的提示文案 | 复用计数、限制、resize 和错误态 |
| 富文本框 | `PerformanceRichTextBox.vue` + `PerformanceRichTextToolbar.vue` | 工作总结、自定义文本 | 复用编辑器结构和工具栏状态 |
| 复选框/单选框/开关 | `PerformanceCheckbox.vue`、`PerformanceRadioGroup.vue`、`PerformanceSwitch.vue` | 内容选择、类型切换、分组可见性 | 复用 checked/disabled/focus 语义 |
| 选择器 | 现有绩效选择器；新增 `PerformanceAssessmentSelect` | 评估项、标签、分组内容 | 先提炼统一业务选择器；选项弹层未采集部分保持 BLOCKED |
| 弹窗 | `PerformanceAssessmentEditorModal.vue`、`FullScreenModal.vue` | 新建/编辑、分组设置 | 外壳统一，`mode=create|edit`，字段由子组件负责 |
| 拖拽与排序 | `PerformanceDragHandle.vue`、`PerformanceSortableList.vue` | 内容项和卡片排序 | 复用抓取/抓取中/释放及键盘语义 |
| 图标按钮 | `PerformanceIconButton.vue` 及已登记 SVG | 编辑、删除、移动、关闭、展开 | 不直接混用文字字形、Element Plus 替代图标或局部 path |
| 内容预览 | `PerformanceContentRenderer.vue` | 编辑器、抽屉摘要、中栏卡片 | 统一内容模型和类型 renderer，通过 context 区分外层 |

当前 `PerformanceAssessmentContentLayers.vue` 内部的 `FormField`、`RichTextBox`、`ToggleSwitch`、`OptionSelect`、`EditorIcon` 和 `CreateMenu` 均视为重复实现候选；后续只能做兼容转接或渐进替换，不得继续复制。

## 3.4 既有实现的渐进式对齐

内容设置已有大量实现和测试，默认策略是“保留行为、局部替换、逐项验证”：

1. 先建立局部实现到既有共享组件的映射。
2. 保留现有 public props、emits 和页面状态，优先在组件内部转接共享组件。
3. 逐项对照 `extracted-ui-contract.json` 修复字段、文案、几何、样式、状态和 SVG 差异。
4. 每次替换后运行对应 focused test，再删除已确认无调用方的局部重复实现。
5. 不因组件统一而重写拖拽、富文本、评分、弹窗或已通过测试的业务流程。

只有以下情况才允许重写局部结构：共享组件无法表达采集到的真实 anatomy；现有实现会造成 root/item 或 preview context 语义错误；或目标状态与现有组件契约存在不可兼容冲突。任何重写必须先更新本模型和原子任务，说明保留行为、迁移边界和回归证据。


| 区域 | 约束 | source_state_ids |
| --- | --- | --- |
| 页面内容 | Header 下三栏横向布局；左栏和右栏固定 320，中栏占剩余 | `base`、`ALL9-360-INVITE-FILL` |
| 左栏 | 9 个阶段卡片，纵向滚动，API/会话顺序为准 | 全部 `ALL9-*` |
| 中栏 | 根据 `stage_type + content_slot + executor_type` 显示填写/参考/供调整/查看组合 | 全部 `ALL9-*` |
| 右栏 | 未选中显示空态；整卡和内容项点击后显示不同设置 | `C20-CARD-ROOT-SELECTED-CLEAN`、`C20-CONTENT-BODY-SELECTED-DIAGNOSTIC` |
| 抽屉 | 右贴边，宽 680px；Footer 为“确定/取消” | `C10-DRAWER-OPEN` |
| 分组弹窗 | 弹窗内默认分组 1/2，可添加分组 3；取消丢弃新增组 | `C10-GROUP-DIALOG-OPEN`、`C10-THIRD-GROUP-ADDED`、`C10-GROUP-DIALOG-CANCEL` |
| 自定义弹窗 | 920px（1280 viewport 采集值），左右双栏；文本/标签模式显式切换 | `CUSTOM-TEXT-MODAL-OPEN`、`CUSTOM-TAG-MODAL` |
| 响应式 | 1440/1366/1280 本轮未重采完整新分支；标记 BLOCKED，不跨 viewport 合并几何 | `capture-completion-checklist.md §3` |

## 5. Field inventory and options

| 组件 | 字段 | 控件 | 规则/选项 | source_state_ids |
| --- | --- | --- | --- | --- |
| 抽屉 | 评估内容分人群可见 | switch | 默认关闭；开启后显示设置分组 | `C10-DRAWER-OPEN`、`C10-VISIBILITY-SWITCH-ON` |
| 抽屉 | 已配置内容 | checkbox | 已配置项 checked-disabled；删除回收后 unchecked/enabled | `C10-DRAWER-OPEN`、`CUSTOM-TEXT-CONFIRM-RESUMED` |
| 分组 | 分组名称 | input | 必填；默认分组 1、分组 2；可添加分组 3 | `C10-GROUP-DIALOG-OPEN`、`C10-THIRD-GROUP-ADDED` |
| 分组 | 评估内容 | selector | placeholder“请选择评估内容”；选项弹层 BLOCKED | `C10-GROUP-DIALOG-OPEN` |
| 自定义文本 | 名称 | input | 必填 | `CUSTOM-TEXT-MODAL-OPEN` |
| 自定义文本 | 描述 | editor | 字段存在；resize 证据 BLOCKED | `CUSTOM-TEXT-MODAL-OPEN` |
| 自定义文本 | 填写题类型 | radio-group | 文本型/标签型切换；完整 radio geometry 未在本轮单独确认 | `CUSTOM-TEXT-MODAL-OPEN`、`CUSTOM-TAG-MODAL` |
| 自定义文本 | 填写题名称 | input | 文本型必填 | `CUSTOM-TEXT-MODAL-OPEN` |
| 自定义标签 | 标签选择 | selector | 真实选项仅记录：价值贡献、投入度、价值观；本轮选择价值贡献 | `CUSTOM-TAG-MODAL` |
| 工作总结 root | 填写设置 | setting group | 在此环节填写/隐藏/查看被评估人的填写结果 | `TYPE-WORK-SUMMARY-ROOT-TOP-CLICK` |
| 工作总结 root | 必填项设置 | checkbox | 必填 | `TYPE-WORK-SUMMARY-ROOT-TOP-CLICK` |
| 工作总结 item | 内容项设置 | checkbox group | 隐藏描述、允许添加多个 | `TYPE-WORK-SUMMARY-ITEM-TRUSTED-POINT` |

## 6. 9 环节 visible/forbidden 变体

| variant discriminator | visible tabs | forbidden tabs | source_state_ids |
| --- | --- | --- | --- |
| `work_summary + SUBJECT` | 配置填写内容；更多入口存在但菜单内容 BLOCKED | 配置参考/供调整/查看 | `ALL9-WORK-SUMMARY-MORE` |
| `reviewer_360_invite + SUBJECT` | 配置填写内容、配置参考内容 | 配置供调整/查看 | `ALL9-360-INVITE-FILL`、`ALL9-360-INVITE-REFERENCE` |
| `reviewer_360_confirm + DIRECT_MANAGER` | 配置填写内容、配置参考内容 | 配置供调整/查看 | `ALL9-360-CONFIRM-FILL`、`ALL9-360-CONFIRM-REFERENCE` |
| `evaluation + REVIEWER_360` | 配置填写内容、配置参考内容 | 配置供调整/查看 | `ALL9-EVAL-360-FILL`、`ALL9-EVAL-360-REFERENCE` |
| `evaluation + DIRECT_MANAGER` | 配置填写内容、配置参考内容 | 配置供调整/查看 | `ALL9-EVAL-MANAGER-FILL`、`ALL9-EVAL-MANAGER-REFERENCE` |
| `calibration + PROJECT_CONFIGURED` | 配置供调整内容、配置参考内容 | 配置填写/查看 | `ALL9-CALIBRATION-ADJUSTMENT`、`ALL9-CALIBRATION-REFERENCE` |
| `result_communication + DIRECT_MANAGER` | 配置填写内容、配置参考内容 | 配置供调整/查看 | `ALL9-RESULT-COMMUNICATION-FILL`、`ALL9-RESULT-COMMUNICATION-REFERENCE` |
| `result_view + SUBJECT` | 配置查看内容 | 配置填写/参考/供调整 | `ALL9-RESULT-VIEW` |
| `result_reconsideration + APPEAL_HANDLER` | 配置填写内容、配置参考内容 | 配置供调整/查看 | `ALL9-RECONSIDERATION-FILL`、`ALL9-RECONSIDERATION-REFERENCE` |

## 7. State machines

| component | current | event | guard | next | source_state_ids |
| --- | --- | --- | --- | --- | --- |
| drawer | closed | open | 评估型环节添加内容 | open | `C10-DRAWER-OPEN` |
| drawer | open | toggle visibility | none | visibility-on/off | `C10-DRAWER-OPEN`、`C10-VISIBILITY-SWITCH-ON` |
| group dialog | two groups | add group | group limit/validation | three groups | `C10-GROUP-DIALOG-OPEN`、`C10-THIRD-GROUP-ADDED` |
| group dialog | three groups | cancel | user confirms cancel | drawer with original draft | `C10-GROUP-DIALOG-CANCEL` |
| card | default | hover header | pointer enters whole header strip | toolbar-visible | `C20-CARD-HEADER-HOVER` |
| toolbar | toolbar-visible | hover button | button in fixed order | button-hover | `C20-TOOLBAR-MOVE-UP-HOVER`、`C20-TOOLBAR-MOVE-DOWN-HOVER`、`C20-TOOLBAR-EDIT-HOVER`、`C20-TOOLBAR-DELETE-HOVER` |
| card | expanded | collapse | current card only | collapsed | `C20-CARD-ROOT-SELECTED-CLEAN` (after-state BLOCKED for this round) |
| card | configured | delete | user action only | item removed; drawer item available | `C20-CARD-HEADER-HOVER` (delete not executed) |
| custom editor | create text/tag | valid confirm | required fields valid | drawer re-entry | `CUSTOM-TEXT-MODAL-OPEN`、`CUSTOM-TAG-MODAL`、`CUSTOM-TEXT-CONFIRM-RESUMED`、`CUSTOM-TAG-CONFIRM` |

## 8. Visual state matrix

| component | state | measured geometry/style | source_state_ids |
| --- | --- | --- | --- |
| drawer | open | 680px wide; white; shadow `rgba(31,35,41,.12) 0 0 24px`; footer visible | `C10-DRAWER-OPEN` |
| drawer | visibility-on | same drawer; “设置分组” visible | `C10-VISIBILITY-SWITCH-ON` |
| group dialog | initial | bbox 1260×798 at supplemental capture; white dialog; 24px edge inset | `C10-GROUP-DIALOG-OPEN` |
| configured card root | selected | 592×164; blue 1px border; 8px radius | `C20-CARD-ROOT-SELECTED-CLEAN` |
| configured item | selected | 592×92 diagnostic state; blue border; select-region contamination noted | `C20-CONTENT-BODY-SELECTED-DIAGNOSTIC` |
| toolbar | header hover | 112×32 operation surface; dark translucent background; card geometry must not shift | `C20-CARD-HEADER-HOVER` |
| toolbar button | disabled | first-card move-up retains layout and opacity 0.5 | `C20-TOOLBAR-MOVE-UP-HOVER` |
| custom editor | text/tag | 920×609.33 at 1280×673/DPR1.5; right preview; type-dependent fields | `CUSTOM-TEXT-MODAL-OPEN`、`CUSTOM-TAG-MODAL` |
| focus/active/resize | not captured | BLOCKED; do not guess styles or geometry | `capture-completion-checklist.md §3` |

## 9. SVG and icons

| purpose | data-icon / SVG | measured size | state | source_state_ids |
| --- | --- | --- | --- | --- |
| card move up | `SpaceUpOutlined` | 24×24 hit area | hover/disabled | `C20-TOOLBAR-MOVE-UP-HOVER` |
| card move down | `SpaceDownOutlined` | 24×24 hit area | hover | `C20-TOOLBAR-MOVE-DOWN-HOVER` |
| card edit | `EditOutlined` | 24×24 hit area | hover | `C20-TOOLBAR-EDIT-HOVER` |
| card delete | `DeleteTrashOutlined` | 24×24 hit area | hover only; not executed | `C20-TOOLBAR-DELETE-HOVER` |
| drawer expand/collapse | `DownBoldOutlined` / `UpBoldOutlined` | about 24×25 | default/expanded | `C10-DRAWER-OPEN` |
| drawer expand-all | `AddOutlined` / observed expand-all control | 82×32 control | default/active | `C10-DRAWER-OPEN` |
| card drag | `DragOutlined` | whole top strip is hit area, not icon-only | grab/grabbing/drop evidence partial | `C20-CARD-HEADER-HOVER` |

操作条 SVG 必须从目标 `target_contract` 读取 `viewBox`、path、fill/stroke；不得用文字字形、近似 path 或另一个图标库替代。当前 Markdown 不复制原始 path，机器路径在 `extracted-ui-contract.json` 与外部证据中维护。

## 10. Root/item 归属规则

- 整卡或上半区域点击只选择 `ConfiguredContentCardRoot`，右栏显示工作总结的填写方式三选一和必填。
- 下半内容项点击只选择 `ConfiguredContentItem`，右栏显示隐藏描述和允许添加多个。
- 页面只持有 `selectedOwner` 与配置数据；不得通过透明 mask 或文字命中猜测归属。
- `1111 / 年度综合评级` 是 rating；工作总结字段为名称、描述、填写题名称和富文本框。旧相反映射标记 superseded。
- 自定义文本/标签最终加入中栏的 root/item 归属保持 BLOCKED，直到取得 `DRAWER-CONFIRM-CUSTOM-ITEMS` after。
