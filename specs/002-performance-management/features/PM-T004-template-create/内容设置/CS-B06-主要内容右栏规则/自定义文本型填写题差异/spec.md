# 自定义文本型填写题差异规格

completion_status: incomplete
pixel_restore_status: blocked
uncovered_reasons:
- semantic_variant_context_incomplete
- item-display-off-visual-restore-mismatch
- vertical-resize-not-observed-in-this-diff-capture
pixel_acceptance_status: not-run

## 1. 范围

本目录是 [`CS-B06-主要内容右栏规则`](../) 的子契约，记录工作总结环节中自定义文本型填写题的 root/item 差异。页面实际文案为“文本型填写题”；“工作总结”是另一张内容块，不属于本轮 item。

目标链路：

```text
工作总结环节
→ 配置填写内容
→ 文本型填写题 root
→ 填写题名称 item
→ 内容设置右栏
```

目标 URL：`https://idreamsky.feishu.cn/perf/admin/templates/7680168681455815658/3`

采集环境：`1920×1080 / DPR 1 / light / zh-CN`

## 2. 目标与非目标

目标：

- 固化自定义文本 root/item 右栏完整结构、顺序、准确文案和默认值；
- 固化 root/item 显示设置对中栏名称、描述、必填星号、编辑器、卡片高度和后续位置的影响；
- 固化 root→item→root 的 Profile 归属隔离；
- 证明自定义文本复用唯一完整业务组件，只通过显式 Profile 改变设置分组。

非目标：

- 不新增或修改模板持久化行为；
- 不采集保存、确定、下一步、提交、发布、删除或清空；
- 不重复采集 CS-B06 已确认的填写/隐藏、必填、radio/checkbox、SVG 和共享布局全过程；
- 不创建第二套自定义文本页面逻辑；
- 不声称像素验收通过。

## 3. Profile 契约

### 3.1 root Profile

右栏顺序：

```text
显示设置
└─ 隐藏描述
```

默认：`隐藏描述=false`。

root 不显示：

- 填写设置；
- 必填项设置；
- 允许添加多个；
- 隐藏名称。

### 3.2 item Profile

右栏顺序：

```text
显示设置
└─ 隐藏名称
填写设置
├─ 在此环节填写
└─ 在此环节隐藏
必填项设置
└─ 必填
```

默认：

- `隐藏名称=false`；
- `在此环节填写=true`；
- `在此环节隐藏=false`；
- `必填=true`。

item 不显示 root 的隐藏描述和允许添加多个。

## 4. 已确认联动

### 4.1 root 隐藏描述

勾选后：

- 中栏标题“文本型填写题”保留；
- 中栏“描述”节点及其布局空间消失；
- item 的“填写题名称”和编辑器保留；
- root 卡片高度由 `280px` 变为 `258px`，减少 `22px`；
- 下方兄弟内容的 y 坐标随卡片收缩上移，具体值以同状态 layout 为准。

取消后描述、空间和 `280px` 高度均恢复。

### 4.2 item 隐藏名称

勾选后：

- 中栏“填写题名称”和必填星号消失；
- item 描述保留；
- 编辑器保留；
- 填写设置保留；
- 必填项设置保留；
- item 卡片高度由 `280px` 变为 `250px`，减少 `30px`；
- 不额外保留名称空白区域，后续兄弟内容随高度收缩上移。

取消后 checkbox 逻辑状态恢复为 false；当前采集证据的部分视觉/布局快照仍约为 `250px`，所以名称、星号和 `280px` 高度的完整视觉恢复是阻塞项。

## 5. 业务组件决策

```text
stage
→ stageContentRule
→ config_discriminator / Profile
→ PerformanceConfiguredContentBlock
```

`PerformanceConfiguredContentBlock` 是唯一完整业务组件，统一负责：

- root/item owner；
- 右栏设置挂载；
- 中栏即时联动；
- 配置状态；
- owner 隔离；
- SVG 和视觉状态。

自定义文本只通过显式 Profile 改变设置分组，不得使用 `content.type === 'work_summary'` 作为业务规则开关。页面层只解析并传递 `stageContentRule`、`config_discriminator` 和 Profile；基础 checkbox、radio、rich-text 控件继承父级 CS-B06 共享证据。

## 6. 当前设计门禁

已确认事实可以进入本子契约，但当前不能标记为 `ready_for_implementation`，原因是：

1. `semantic_variant_context_incomplete` 尚未通过独立设计门禁闭合；
2. `custom-text-item-display-off` 的 checkbox 已恢复 false，但部分视觉/布局证据仍显示约 250px；
3. 本轮未采集 textarea/rich-text resize 的 default、dragging、after-drag 三态。

实现设计可以基于已确认 Profile 编写；正式前端实现和任务勾选需在 blocker 关闭后进行。

共享契约来源：[`../spec.md`](../spec.md)、[`../component-model.md`](../component-model.md)、[`../acceptance-contract.md`](../acceptance-contract.md)。
