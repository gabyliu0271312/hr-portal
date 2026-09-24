# PM-T015 采集清单

completion_status: incomplete
pixel_restore_status: blocked
uncovered_reasons: missing_replayable_session, missing_dpr, missing_target_screenshot, missing_interaction_evidence

| source_state_id | 入口 | viewport | 证据 | 状态 |
| --- | --- | --- | --- | --- |
| `SNAPSPEC-PM-T015-DEFAULT-20260923` | `/perf/admin/system-setting/assessment-pattern` | 1534×911，DPR 未提供 | `D:\乐逗\Desktop\考核方式设置.txt` | 默认态结构证据 |
| `SNAPSPEC-PM-T015-ROLE-EDIT-20260924` | 点击项目合作关系来源“编辑” | 894×631，DPR 未提供 | 用户提供的 `Div.ud__modal__content` / `header` / `body` / `footer` SnapSpec Blueprint | 弹窗默认态结构参数；缺少可重放 session、截图和 DPR |

缺失：可重放 session、before/after HTML、layout/computed 独立产物、截图、DPR、编辑和保存交互证据。
