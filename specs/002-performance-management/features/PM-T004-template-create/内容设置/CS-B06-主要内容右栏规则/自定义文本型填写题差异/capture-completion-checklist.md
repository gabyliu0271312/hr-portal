# 自定义文本型填写题差异采集完成检查

completion_status: incomplete
pixel_restore_status: blocked
uncovered_reasons:
- semantic_variant_context_incomplete
- item-display-off-visual-restore-mismatch
- vertical-resize-not-observed-in-this-diff-capture
pixel_acceptance_status: not-run

## 1. Readiness

| 检查项 | 状态 | 证据/说明 |
| --- | --- | --- |
| capture integrity | passed | 目标 JSON、viewport/DPR、安全边界和证据路径可追溯 |
| capture completeness | passed | root/item 差异、on/off、owner isolation 均有 primary after artifacts |
| implementation readiness | design_incomplete | 语义变体门禁未闭合 |
| readiness scope | variant | 仅覆盖 custom-text root/item |
| target bindings | captured | 两个 binding 均保存；跨新上下文 replay 不写成通过 |
| screenshot/layout/computed | passed for captured states | 每个 primary after 目录有对应产物 |
| destructive action boundary | passed | 无保存、提交、发布、删除、清空或业务写入 |
| item display-off visual restore | blocked | checkbox=false 已确认；部分布局/截图仍约 250px |
| vertical resize | not-run | 未采集 default/dragging/after-drag |
| pixel runtime acceptance | not-run | 没有 HR Portal rendered contract 和截图 diff |

## 2. Behavior coverage

- [x] root 右栏完整结构、顺序、准确文案和默认值。
- [x] root 不显示填写设置和允许添加多个。
- [x] root 隐藏描述时标题/编辑器保留，描述和空间消失。
- [x] item 右栏完整结构、顺序、准确文案和默认值。
- [x] item 隐藏名称时名称/星号消失，编辑器、填写设置、必填项设置保留。
- [ ] item 隐藏名称取消后的名称、星号、空间和 280px 高度完整视觉恢复。
- [x] root→item→root owner isolation。
- [x] `item-switch-second-item=not_attempted`；页面没有第二个同类型 item，未创建或持久化第二项。
- [ ] rich-text resize 三态；本轮未采集。

## 3. Release boundary

本目录允许继续整理事实契约和实现设计草案，不允许：

- 标记 `ready_for_implementation`；
- 通过 design/implementation 门禁进入正式前端实现；
- 标记像素验收通过；
- 将 item display-off 恢复写成 passed；
- 将未采集 resize 写成已支持或已验收。

解除阻塞后需重新运行 design gate；实现后再运行 acceptance gate 与 rendered contract 对比。
