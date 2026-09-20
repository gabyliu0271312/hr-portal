# CS-B06 采集 Manifest

completion_status: completed
pixel_restore_status: ready_for_implementation
uncovered_reasons: []
pixel_acceptance_status: not-run

## 1. 会话

- realtime session：`realtime-ec568ea4f7c2`
- capture session：`idreamsky.feishu.cn_20260903_170553_711902`
- URL：`https://idreamsky.feishu.cn/perf/admin/templates/7680168681455815658/3`
- viewport/DPR：`1920×1080 / 1`
- 证据根：`C:/Users/gaby.liu/ClonedSites/idreamsky.feishu.cn_20260903_170553_711902/captures`
- `capture_model.json`：同证据根
- `target_preflight.json`：同证据根
- `target_bindings.json`：同证据根
- session 状态：`completed`
- analyze 状态：`completion_status=completed`、`stop_reason=completion_criteria_met`

## 2. 可信绑定

| binding_id | owner | 首次动作 | 后续重放 | 结果 |
| --- | --- | --- | --- | --- |
| `work-summary-fill-root` | 工作总结内容块整体 root | 人工可信 click | `binding:work-summary-fill-root` | captured/replayed |
| `work-summary-fill-item` | 同一 root 下半填写题 item | 人工可信 click | `binding:work-summary-fill-item` | captured/replayed |

绑定文件为 `captures/target_bindings.json`；root/item 的重放均使用 evidence-bound region，最终会话 `blocked_action_count=0`。

## 3. 权威状态与证据包

所有相对路径均相对于证据根。每个 after 目录包含 `after.html`、`layout.json`、`computed.json`、`target_contract.json`、`interaction_evidence.json`、`state_contract.json`、`state_fixture.json` 和 `after.png`。

| source_state_id | after step | before source | 作用 |
| --- | ---: | --- | --- |
| `work-summary-fill-root-selected` | `step_02` | `step_02/before` | 首次 root 可信点击与绑定 |
| `work-summary-fill-item-selected` | `step_05` | `step_05/before` | 首次 item 可信点击与绑定 |
| `binding-replay-root` | `step_08` | item selected | root 绑定重放 |
| `binding-replay-item` | `step_12` | root replayed | item 绑定重放 |
| `item-default` | `step_18` | item selected | item 默认单选/必填结构 |
| `item-hidden` | `step_20` | `step_18/after` | 选择在此环节隐藏 |
| `item-fill-restored` | `step_23` | `step_20/after` | 恢复在此环节填写 |
| `item-required-off` | `step_26` | `step_23/after` | 取消必填 |
| `item-required-on` | `step_29` | `step_26/after` | 恢复必填 |
| `root-default` | `step_34` | item required restored | root 默认设置 |
| `root-hide-description-on` | `step_38` | `step_34/after` | 隐藏描述 |
| `root-hide-description-off` | `step_41` | `step_38/after` | 恢复描述 |
| `root-allow-multiple-on` | `step_44` | `step_41/after` | 允许添加多个 |
| `root-allow-multiple-off` | `step_47` | `step_44/after` | 取消允许添加多个 |
| `isolation-item-return` | `step_50` | `step_47/after` | root → item 隔离 |
| `isolation-root-return` | `step_53` | `step_50/after` | item → root 隔离 |

## 4. 采集后分析

| 指标 | 值 |
| --- | ---: |
| captured interaction states | 52 |
| state graph nodes/edges | 53 / 52 |
| dynamic boundaries | 52 |
| container constraints | 2421 |
| variant invariants | 209 |
| implementation variant contracts | 16 |
| replay_failed / blocked | 0 / 0 |

`capture_readiness`：

```text
capture_integrity: passed
capture_completeness: passed
implementation_readiness: ready
readiness_scope: feature
blockers: []
```

## 5. 未尝试与安全边界

- `item-switch`: `not_attempted`；页面没有第二个同类型 item。
- 未点击保存、确定、下一步、提交、发布、删除或清空。
- 未写入目标模板。
- 未把 Cookie、Authorization、Token、原始 HTML、截图或 action log 复制进仓库。
- 本目录只保存证据引用和提炼契约，不保存原始证据。
