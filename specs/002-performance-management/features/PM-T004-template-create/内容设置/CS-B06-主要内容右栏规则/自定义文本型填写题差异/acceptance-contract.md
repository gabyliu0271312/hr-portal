# 自定义文本型填写题差异开发验收契约

completion_status: incomplete
pixel_restore_status: blocked
uncovered_reasons:
- semantic_variant_context_incomplete
- item-display-off-visual-restore-mismatch
- vertical-resize-not-observed-in-this-diff-capture
pixel_acceptance_status: not-run

## 1. Contract source

机器真源：[`extracted-ui-contract.json`](extracted-ui-contract.json)。

共享契约：[`../acceptance-contract.md`](../acceptance-contract.md)。本文件只增加 custom-text Profile 差异，不重新定义共享控件。

## 2. AC-01 Profile ownership

- Given 当前入口为工作总结环节的配置填写内容，规则解析得到 `config_discriminator=work_summary_custom_text_root`。
- When 点击“文本型填写题”整卡标题或描述区域。
- Then 使用 `PerformanceConfiguredContentBlock` 的 root owner，右栏只显示“显示设置/隐藏描述”；不得显示隐藏名称、填写设置、必填项设置或允许添加多个。
- When 点击同一卡片内部“填写题名称”或编辑器区域。
- Then 切换到 item owner，右栏显示“显示设置/隐藏名称”、“填写设置”和“必填项设置”；不得显示隐藏描述或允许添加多个。
- And Profile 由 `stageContentRule/config_discriminator` 选择，不由 `content.type` 选择。

## 3. AC-02 root default/display

- Given root owner 被选中。
- Then `隐藏描述=false`，标题、描述和 item 编辑器可见，卡片高度为 `280±1px`。
- When 勾选“隐藏描述”。
- Then checkbox 为 true，描述节点及其 22px 空间不可见，标题和 item 编辑器保留，卡片高度为 `258±1px`。
- When 取消勾选。
- Then 描述、空间和 `280±1px` 高度恢复。

## 4. AC-03 root forbidden settings

- Given root owner 被选中。
- Then 右栏不得出现“隐藏名称”、“填写设置”、“在此环节填写”、“在此环节隐藏”、“必填项设置”、“必填”或“允许添加多个”。

## 5. AC-04 item default/display

- Given item owner 被选中。
- Then `隐藏名称=false`、`在此环节填写=true`、`在此环节隐藏=false`、`必填=true`；填写题名称、红色星号和编辑器可见，卡片高度为 `280±1px`。
- When 勾选“隐藏名称”。
- Then 名称和星号不可见，描述和编辑器保留，填写设置和必填项设置保留，卡片高度为 `250±1px`，不保留名称空白占位。

## 6. AC-05 item restore

- Given item display-on。
- When 取消“隐藏名称”。
- Then checkbox 必须为 false，名称、星号、原布局空间和 `280±1px` 高度应恢复。
- 当前证据只确认 checkbox 为 false，部分截图/布局仍约为 250px；因此本 AC 当前为 `blocked`，不得标记 passed，也不得猜测 DOM 恢复机制。

## 7. AC-06 owner isolation

- Given root、item 均使用自定义文本 Profile。
- When 按 root→item→root 选择。
- Then 每次右栏 Profile 与 owner 匹配；root 设置不出现在 item，item 设置不出现在 root，状态不串联。
- And 页面没有第二个同类型 item，`item-switch-second-item=not_attempted`，不创建或持久化第二项。

## 8. AC-07 shared behavior inheritance

- Given 自定义文本 item 使用 item Profile。
- Then 填写/隐藏 radio、必填 checkbox、星号联动、checkbox/radio DOM、共享 SVG 和 hidden 灰态引用 CS-B06；本目录不重复定义其全部基础视觉状态。

## 9. AC-08 resize boundary

- Given 编辑器存在垂直 resize 可能性。
- When 需要验收 resize。
- Then 必须提供 default、dragging、after-drag 三态的真实 evidence 和 after height 大于 default height；本轮未采集，状态为 `not-run/blocker`。

## 10. Test and runtime boundary

实现前需要为 AC-01 至 AC-08 增加正向和反向组件断言：visible/forbidden 文案、默认值、root 280↔258、item 280↔250、item restore、owner isolation、Profile 选择和未采集 resize 阻断。

建议命令：

```text
python -m json.tool specs/002-performance-management/features/PM-T004-template-create/内容设置/CS-B06-主要内容右栏规则/自定义文本型填写题差异/extracted-ui-contract.json
python .claude/skills/performance-spec-development/scripts/check_ui_spec.py specs/002-performance-management/features/PM-T004-template-create/内容设置/CS-B06-主要内容右栏规则/自定义文本型填写题差异 --phase design --json
```

实现后必须在真实 HR Portal 路由生成 rendered contract 和独立截图，并运行 acceptance compare。当前测试、实现门禁和 runtime acceptance 均为 `not-run`；当前契约不是像素验收通过证明。
