# 自定义文本型填写题差异组件模型

completion_status: incomplete
pixel_restore_status: blocked
uncovered_reasons:
- semantic_variant_context_incomplete
- item-display-off-visual-restore-mismatch
- vertical-resize-not-observed-in-this-diff-capture
pixel_acceptance_status: not-run

## 1. Evidence index

机器真源：[`extracted-ui-contract.json`](extracted-ui-contract.json)。完整路径和会话分拆见 [`capture-manifest.md`](capture-manifest.md)。

| source_state_id | session / capture | state | complete |
| --- | --- | --- | --- |
| `custom-text-root-default` | `realtime-57c95df92247` / `151126_823218`, step 03 | root default | yes |
| `custom-text-root-display-on` | `realtime-57c95df92247` / `151126_823218`, step 08 | root display on | yes |
| `custom-text-root-display-off` | `realtime-57c95df92247` / `151126_823218`, step 11 | root display off | yes |
| `custom-text-item-default` | `realtime-fb72a2e77342` / `155422_606177`, step 05 | item default | yes |
| `custom-text-item-display-on` | `realtime-fb72a2e77342` / `155422_606177`, step 12 | item display on | yes |
| `custom-text-item-display-off` | `realtime-fb72a2e77342` / `155422_606177`, step 16 | item display off | visual restore blocked |
| `custom-text-owner-root` | `realtime-fb72a2e77342` / `155422_606177`, step 17 | root owner | yes |
| `custom-text-owner-item` | `realtime-fb72a2e77342` / `155422_606177`, step 18 | item owner | yes |
| `custom-text-owner-root-return` | `realtime-fb72a2e77342` / `155422_606177`, step 20 | root return | yes |

## 2. Component tree

```text
PerformanceTemplateContentSettings
├─ stageContentRule
│  └─ custom-text Profile resolver
├─ ContentSettingsCenter
│  └─ PerformanceConfiguredContentBlock
│     ├─ RootSelectionOutline
│     ├─ CardHeader
│     │  ├─ TitleIndicator
│     │  ├─ Title: 文本型填写题
│     │  └─ Description: 描述
│     └─ ConfiguredContentItem
│        ├─ ItemSelectionOutline
│        ├─ QuestionLabel: 填写题名称
│        │  └─ RequiredMark
│        └─ PerformanceRichTextBox
└─ ContentSettingsAside
   ├─ CustomTextRootSettings
   │  └─ PerformanceCheckbox: 隐藏描述
   └─ CustomTextItemSettings
      ├─ PerformanceCheckbox: 隐藏名称
      ├─ PerformanceRadioGroup
      │  ├─ 在此环节填写
      │  └─ 在此环节隐藏
      └─ PerformanceCheckbox: 必填
```

## 3. Component responsibilities

| component_id | 层级 | 职责 | props / model | events | source_state_ids |
| --- | --- | --- | --- | --- | --- |
| `PerformanceConfiguredContentBlock` | 业务完整组件 | root/item owner、右栏挂载、中栏联动、状态隔离 | `content`, `activeOwner`, `rootProfile`, `itemProfile`, `rootSettings`, `itemSettings` | `activate`, `update:root-settings`, `update:item-settings`, `update:expanded` | 全部 custom-text states |
| `CustomTextRootSettings` | Profile renderer | 渲染 root 的显示设置 | `modelValue` | `update:modelValue` | root 三态 |
| `CustomTextItemSettings` | Profile renderer | 渲染 item 的显示、填写和必填设置 | `modelValue` | `update:modelValue` | item 三态 |
| `PerformanceCheckbox` | 基础共享组件 | checkbox DOM、checked/aria-checked 和视觉状态 | `modelValue`, `disabled` | `update:modelValue` | 继承 CS-B06 |
| `PerformanceRadioGroup` | 基础共享组件 | radio 选项、默认值和语义状态 | `modelValue`, `options` | `update:modelValue` | 继承 CS-B06 |
| `PerformanceRichTextBox` | 基础共享组件 | 编辑器内容、禁用呈现和已有编辑器行为 | `modelValue`, `disabled` | `update:modelValue` | 继承 CS-B06 |
| `PerformanceTemplateContentSettings` | 页面组装 | 解析 stage rule 并挂载完整业务组件 | `stageContentRule` | 页面级状态更新 | owner states |

## 4. Field inventory

| owner | field | label/options | control | default | visible rule | source_state_ids |
| --- | --- | --- | --- | --- | --- | --- |
| root | `hideDescription` | 隐藏描述 | checkbox | false | root owner | root 三态 |
| item | `hideName` | 隐藏名称 | checkbox | false | item owner | item 三态 |
| item | `fillMode` | 在此环节填写 / 在此环节隐藏 | radio group | 在此环节填写 | item owner | item default |
| item | `required` | 必填 | checkbox | true | item owner 且填写模式为填写 | item default/display-on |

反向约束：root 不渲染 item 字段；item 不渲染 root 字段。

## 5. State machine

| current | event | next | 中栏变化 | 右栏变化 | source_state_ids |
| --- | --- | --- | --- | --- | --- |
| root default | 勾选隐藏描述 | root display-on | 描述及 22px 空间消失；280→258 | 隐藏描述 checked | root default/display-on |
| root display-on | 取消隐藏描述 | root display-off | 描述与空间恢复；回到 280 | 隐藏描述 unchecked | root display-on/display-off |
| item default | 勾选隐藏名称 | item display-on | 名称和星号消失；编辑器保留；280→250 | 隐藏名称 checked；填写/必填保留 | item default/display-on |
| item display-on | 取消隐藏名称 | item display-off | 名称和星号应恢复；当前高度恢复证据 blocked | 隐藏名称 unchecked | item display-on/display-off |
| root owner | 点击填写题名称/编辑器 | item owner | item outline | 仅 item Profile | owner-root/owner-item |
| item owner | 点击文本型填写题标题/描述 | root owner | root outline | 仅 root Profile | owner-item/owner-root-return |

## 6. Geometry and ownership

- 主卡片 default：`x=560,y=195.6667,w=792,h=280`。
- root display-on：`h=258`；名称和编辑器保留。
- item display-on：`h=250`；名称和星号消失，编辑器保留。
- item display-off：checkbox 逻辑恢复 false，但部分布局证据仍约 `h=250`，不能写成已恢复 `h=280`。
- 右栏外层：`x=1600,w=320`；内容主列从 `x=1620` 开始，宽约 `272`。
- root/item owner 的选中轮廓、radio、checkbox、shared SVG 和 hidden 灰态继承父级 CS-B06；本目录只记录自定义文本新增 Profile 差异。
- 所有绝对坐标仅适用于 `1920×1080/DPR1`；跨视口规则使用父容器约束。

## 7. Resize evidence

本轮未采集 rich-text/textarea 的 vertical resize `default`、`dragging`、`after-drag` 三态。实现前不得猜测 resize 轨迹或把未采集值写入最终契约；对应机器契约保留空 interaction contract 并列入 blocker。

## 8. Implementation boundary

- `stageContentRule` 决定 Profile 是否启用。
- `PerformanceConfiguredContentBlock` 负责完整 root/item 业务行为。
- Profile renderer 只决定设置分组、文案和显示条件。
- 页面不得按显示名称、列表索引或 `content.type` 推断业务规则。
- `CustomTextRootSettings` 与 `CustomTextItemSettings` 不是第二套页面逻辑，而是同一完整业务组件的显式 Profile renderer。
