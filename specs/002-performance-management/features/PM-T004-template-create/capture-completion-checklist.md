# PM-T004 内容设置采集完成检查

completion_status: incomplete
pixel_restore_status: blocked
uncovered_reasons:
- 九环节主矩阵、抽屉、分组初态/第三分组/取消、卡片 root/item 和四按钮人工 hover 已有证据。
- 工作总结“更多”菜单展开、分组评估内容下拉选项、最终自定义卡片联动仍 blocked。
- 新增分支的 focus/active/disabled、resize、键盘焦点归还和完整响应式证据未齐。
- 只有已具备完整证据且不依赖缺口的局部 variant 可进入 UI Expert；feature 不得 ready。

## 1. Readiness 判定

| 检查项 | 状态 | 证据/约束 |
| --- | --- | --- |
| `capture_integrity` | passed | 统一 Manifest、session、viewport/DPR、状态 ID 和安全边界可回溯 |
| `capture_completeness` | incomplete | 17 个 blocked 动作和 5 类未覆盖分支已登记 |
| `implementation_readiness` | ready（variant scope） | 仅允许实现已有完整证据的 confirmed variants，不覆盖 feature 级 blocker |
| `readiness_scope` | variant | 已确认 drawer、group 初态、root/item、toolbar、九环节局部矩阵 |
| `completion_status` | incomplete | 不得写规格已完成 |
| `pixel_restore_status` | blocked | 未有实现截图 diff 和完整动态状态矩阵 |

## 2. 已通过检查

| 检查项 | 状态 | source_state_ids |
| --- | --- | --- |
| 统一多 session manifest | passed | `base`、`ALL9-*`、`C10-*`、`C20-*` |
| JSON、viewport、DPR、状态 ID | passed | 全部状态登记 |
| 九环节主矩阵 | passed | `ALL9-360-INVITE-*`、`ALL9-360-CONFIRM-*`、`ALL9-EVAL-*`、`ALL9-CALIBRATION-*`、`ALL9-RESULT-COMMUNICATION-*`、`ALL9-RESULT-VIEW`、`ALL9-RECONSIDERATION-*` |
| 业务内容映射 | passed | 填写/参考/供调整/查看的可见组合已记录 |
| 抽屉宽度与默认关闭 | passed | `C10-DRAWER-OPEN` |
| 可见性开关与设置分组出现 | passed | `C10-VISIBILITY-SWITCH-ON` |
| 分组弹窗默认两组 | passed | `C10-GROUP-DIALOG-OPEN` |
| 添加第三分组 | passed | `C10-THIRD-GROUP-ADDED` |
| 取消丢弃第三分组 | passed | `C10-GROUP-DIALOG-CANCEL` |
| root/item 分层 | passed | `C20-CARD-ROOT-SELECTED-CLEAN`、`C20-CONTENT-BODY-SELECTED-DIAGNOSTIC` |
| root/item 右栏差异 | passed | `TYPE-WORK-SUMMARY-ROOT-TOP-CLICK`、`TYPE-WORK-SUMMARY-ITEM-TRUSTED-POINT` |
| 操作条顺序与边界 | passed | `C20-CARD-HEADER-HOVER`、`C20-TOOLBAR-*` |
| rating/work_summary 语义 | passed | `1111/年度综合评级` 为 rating；工作总结字段按新证据归类 |
| 自定义文本/标签弹窗及回填 | passed | `CUSTOM-TEXT-MODAL-OPEN`、`CUSTOM-TAG-MODAL`、`CUSTOM-TEXT-CONFIRM-RESUMED`、`CUSTOM-TAG-CONFIRM` |
| 未执行破坏性业务动作 | passed | 未保存、删除、提交目标模板 |

## 3. 未完成或被阻塞检查

| 检查项 | 状态 | 影响 |
| --- | --- | --- |
| 工作总结“更多”菜单内容 | blocked | 不得发明菜单项、文案或操作路径 |
| 分组评估内容选项弹层 | blocked | 不得发明完整选项清单、选中态或弹层几何 |
| 自定义内容最终进入中栏 | blocked | 不得确认 custom root/item、卡片 hover 和右栏归属 |
| toolbar 自动定位重放 | blocked | 以人工可信 hover 事件为权威，不把自动失败当作无状态 |
| 新增状态 focus/active/disabled | incomplete | 不得宣称完整状态矩阵 |
| textarea resize | blocked | 本轮无 default/dragging/after-drag 三态 |
| 键盘与焦点归还 | incomplete | 可参考旧 T06，但不能视为本轮新分支通过 |
| 1440/1366/1280 响应式 | not-run | 不跨 viewport 复用几何 |
| 真实内容保存/重开 | not_attempted | 非本轮采集范围 |

## 4. 放行规则

- 允许：离线读取证据、投影结构化组件模型、补充 blocker、生成测试契约。
- 不允许：全 feature 前端实现、像素验收、勾选 T06、保存目标模板、把 `incomplete`/`blocked` 改为 `completed`。
- `capture_integrity=passed` 不等于 `capture_completeness=passed`。
- `implementation_readiness=ready` 仅对已登记的 variant scope 生效；不代表 feature 完整。
- 任何使用未确认变体的任务都必须保持 blocked。

## 5. 补采完成定义

补采后必须重新提供：每个状态的 before/after HTML、layout、computed、target contract、screenshot、interaction evidence；更新本文件、Manifest、组件模型、pixel/acceptance contract 和原子任务后，运行 `check_ui_spec.py`。未运行命令或缺失实现截图 diff 仍标记 `not-run`，不得报告像素通过。
