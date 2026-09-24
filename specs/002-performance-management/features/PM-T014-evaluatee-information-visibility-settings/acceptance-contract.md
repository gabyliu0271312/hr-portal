# PM-T014 验收契约

completion_status: incomplete
pixel_restore_status: blocked
uncovered_reasons: missing_replayable_session, missing_dpr, missing_target_screenshot, missing_editor_state, missing_interaction_evidence

## Given / When / Then

1. Given 无持久配置，When 管理员 GET，Then 返回 10 条采集默认规则且 GET 不写库。
2. Given 有配置权限，When PATCH 合法字段，Then 持久化、审计并在重开后返回新值。
3. Given 未知角色/字段或未知请求属性，When PATCH，Then 返回 404/422 且不写入。
4. Given 无配置权限，When GET/PATCH，Then 403。
5. Given 当前查看者命中角色，When 请求工作台人员列表，Then 只返回允许资料值并提供允许列键。
6. Given 打开填写详情，When API 返回 `profile_fields`，Then header 保持原格式并按配置显示资料。
7. Given 配置隐藏字段，When 再次读取列表/详情，Then 值和列均不再披露；姓名及业务状态列不受影响。

## UI

复用共享表格、分页、弹窗和复选框；页面只组装。像素验收 blocked，构建/单测不能替代截图 diff。
