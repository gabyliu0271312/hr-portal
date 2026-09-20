# CS-B06 组件模型

completion_status: completed
pixel_restore_status: ready_for_implementation
uncovered_reasons: []
pixel_acceptance_status: not-run

## 1. Evidence index

证据索引见 [`capture-manifest.md`](capture-manifest.md)，机器真源见 [`extracted-ui-contract.json`](extracted-ui-contract.json)。全部状态来自 `realtime-ec568ea4f7c2`、`1920×1080/DPR1`。

## 2. Component tree

```text
PerformanceTemplateContentSettings
├─ ContentSettingsCenter
│  └─ PerformanceConfiguredContentBlock [stage rule variant: work-summary-root/work-summary-item]
│     ├─ RootSelectionOutline
│     ├─ CardHeader
│     │  ├─ TitleIndicator
│     │  ├─ Title: 工作总结
│     │  └─ Description: 描述
│     ├─ ConfiguredContentItem
│     │  ├─ ItemSelectionOutline
│     │  ├─ QuestionLabel
│     │  │  └─ RequiredMark
│     │  ├─ PerformanceRichTextBox
│     │  └─ VisibleLockOutlined [item-hidden only]
│     └─ AddAnotherItemButton [allow-multiple only]
│  └─ OtherConfiguredContentBlocks [other stage rule variants; same shell, no CS-B06 rules]
└─ ContentSettingsAside
   ├─ WorkSummaryRootSettings [stage rule + selectedOwner=root]
   │  ├─ SettingGroup: 显示设置
   │  │  └─ PerformanceCheckbox: 隐藏描述
   │  └─ SettingGroup: 填写设置
   │     └─ PerformanceCheckbox: 允许添加多个
   └─ WorkSummaryItemSettings [stage rule + selectedOwner=item]
      ├─ SettingGroup: 填写设置
      │  └─ PerformanceRadioGroup
      │     ├─ 在此环节填写
      │     └─ 在此环节隐藏
      └─ SettingGroup: 必填项设置
         └─ PerformanceCheckbox: 必填
```

## 3. 组件职责与接口

| component_id | 层级 | 职责 | props / model | events | source_state_ids |
| --- | --- | --- | --- | --- | --- |
| `PerformanceConfiguredContentBlock` | 业务完整组件 | 按 stage rule variant 同时拥有 root/item owner、配置状态、中栏联动、右栏挂载和状态隔离；不按 `content.type` 分支 | `content`, `active`, `rootSettingsVariant`, `itemSettingsVariant`, `rootSettings`, `itemSettings` | `activate`, `update:root-settings`, `update:item-settings`, `update:expanded`, `hover-change` | `work-summary-fill-root-selected`, `work-summary-fill-item-selected`, `item-*`, `root-*`, `isolation-*` |
| `ConfiguredContentCardRoot` | 组件内部结构 | 由完整业务组件承载的 root 视觉区域 | root props | root selection | root variants |
| `ConfiguredContentItem` | 组件内部结构 | 由完整业务组件承载的 item 视觉区域 | item props | item selection | item variants |
| `WorkSummaryRootSettings` | 业务子组件 | stage rule 启用时渲染 root 两组 checkbox | `modelValue` | `update:modelValue` | root variants |
| `WorkSummaryItemSettings` | 业务子组件 | stage rule 启用时渲染 item radio + required checkbox | `modelValue` | `update:modelValue` | item variants |
| `PerformanceRadioGroup` | 基础/复用候选 | 16px radio、checked/aria-checked、label 行 | `modelValue`, `options` | `update:modelValue` | item variants |
| `PerformanceCheckbox` | 基础/复用候选 | 16px checkbox 与 label | `modelValue`, `disabled` | `update:modelValue` | root/item variants |
| `PerformanceVisibleLockIcon` | 基础 | item hidden 状态标记 | `visible` | none | `item-hidden` |
| `AddAnotherItemButton` | 组件内部结构 | 当前完整业务组件 root 内的视觉入口；只完成 `AddOutlined + 添加` 图标/文案和布局，不新增 item、不写入内容模型 | `visible` | none | `root-allow-multiple-on` |
| `PerformanceTemplateContentSettings` | 页面组装 | 持有各 stage/content 数据，按 stage rule variant 挂载完整业务组件；不写 root/item 规则 | route/template state | 页面组装 | all stage variants |

## 4. Field inventory

| owner | field | label/options | control | default | visible rule |
| --- | --- | --- | --- | --- | --- |
| root | `hideDescription` | 隐藏描述 | checkbox | false | selectedOwner=root |
| root | `allowMultiple` | 允许添加多个 | checkbox | false | selectedOwner=root |
| item | `fillMode` | 在此环节填写 / 在此环节隐藏 | radio group | `fill` | selectedOwner=item |
| item | `required` | 必填 | checkbox | true | selectedOwner=item && fillMode=fill |

禁止为 root 渲染 `fillMode/required`；禁止为 item 渲染 `hideDescription/allowMultiple`。

## 5. 状态机

| current | event | next | 中栏变化 | 右栏变化 |
| --- | --- | --- | --- | --- |
| root default | toggle hideDescription on | root hidden-description | 描述移除，卡高 280→258 | checkbox checked |
| root hidden-description | toggle off | root default | 描述与 22px 空间恢复 | checkbox unchecked |
| root default | toggle allowMultiple on | root multiple | `+ 添加`出现，卡高 280→314.3125 | checkbox checked |
| root multiple | toggle off | root default | 按钮消失，卡高恢复 280 | checkbox unchecked |
| item fill+required | choose hidden | item hidden | item 灰色禁用、VisibleLock，卡高仍 280 | 必填组消失 |
| item hidden | choose fill | item fill+required | 编辑态与星号恢复 | 必填组恢复且值保持 true |
| item required | uncheck required | item optional | 只移除星号 | checkbox false |
| item optional | check required | item required | 星号恢复 | checkbox true |
| root | select item binding | item | item outline | item settings only |
| item | select root binding | root | root outline | root settings only |

## 6. Geometry 与 styles

| component | bbox | 关键样式 | source_state_ids |
| --- | --- | --- | --- |
| root card | `(560,195.6667,792,280)` | white background；selected outline `2px solid #3370FF`；radius `4px` | `root-default` |
| root selected outline | `(560,195.6667,792,279.3333)` | transparent background；2px blue border | `binding-replay-root` |
| item selected outline | `(560,281.6667,792,185.3333)` | transparent background；2px blue border；radius 4 | `item-default` |
| aside | `(1600,46.6667,320,1024)` | white；内容横向 inset 20/28；overflow 由父面板负责 | root/item defaults |
| setting heading row | root/item `x=1620,w=272,h=22` | system 14/600/22，#1F2329 | defaults |
| radio input | first `(1620,156.6667,16,16)`；second y=186.6667 | role radio；absolute；z-index 1 | `item-default` |
| item required checkbox | `(1620,266.6667,16,16)` | role checkbox；checked true | `item-default` |
| root checkboxes | y=156.6667 / 236.6667，均 16×16 | role checkbox；默认 false | `root-default` |
| add button | `(584,467.3125,54,22)` | text-primary；icon 14×14 | `root-allow-multiple-on` |
| hidden icon | `(1326,288.125,16,16)` | `VisibleLockOutlined`；currentColor | `item-hidden` |

系统字体栈以 computed evidence 为准：`-apple-system, BlinkMacSystemFont, Segoe UI, Roboto, Helvetica Neue, PingFang SC, Hiragino Sans GB, Microsoft YaHei, sans-serif`。

## 7. 复用判定

- radio/checkbox 的真实 DOM、role、16px 几何和 checked 状态已确认，可作为共享基础组件 variant 的依据。
- 共享只覆盖控件本身；右栏组间距、x/y、显示条件由 root/item settings owner 负责。
- `VisibleLockOutlined` 和 `AddOutlined` 使用采集 path，禁止以文字、近似图标或其他图标库替代。
- item hidden 保持 DOM 与高度，不能用 `v-if=false` 删除 item。
