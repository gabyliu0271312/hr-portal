# PM-T015 采集完成检查

completion_status: incomplete
pixel_restore_status: blocked
uncovered_reasons: missing_replayable_session, missing_dpr, missing_target_screenshot, missing_editor_state, missing_interaction_evidence

- [x] 默认页面入口和 viewport 已记录。
- [x] 默认态卡片、标题、链接、开关、复选框和摘要文案已提取。
- [ ] 可重放 session。
- [ ] 独立目标截图和 DPR。
- [ ] 编辑弹层及保存前后状态。
- [ ] hover/focus/active/disabled 的完整证据。

本次只进入 P0/P1 结构实现，不以本清单作为像素级完成证明。
