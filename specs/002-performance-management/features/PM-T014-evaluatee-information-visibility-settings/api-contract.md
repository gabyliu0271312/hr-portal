# PM-T014 API 契约

completion_status: incomplete
pixel_restore_status: blocked
uncovered_reasons: missing_replayable_session, missing_dpr, missing_target_screenshot, missing_editor_state, missing_interaction_evidence

## 配置接口

- `GET /api/v1/performance/permission-settings/subject-visibility?page=1&page_size=10`
- `PATCH /api/v1/performance/permission-settings/subject-visibility/{role_key}`
- 权限：`performance.configuration.manage`；未知字段拒绝。

GET 返回 `items`、`total`、`page`、`page_size`、`field_options`。每项包含 `role_key`、`role_name`、`visible_labels`、`visible_fields`。PATCH 请求仅接受 `visible_fields: string[]`，字段必须来自服务端字段目录，顺序去重保留。字段键固定为 `department`、`position_level`、`job_sequence`、`direct_supervisor`、`hire_date`、`employee_type`；其中 `job_sequence` 由快照中的 `job_family` 与 `job_category` 统一格式化。

配置不存在时 GET 返回采集默认值且不写库；首次 PATCH 创建单例。实际变更写入 `PERFORMANCE_SUBJECT_VISIBILITY_UPDATED` 审计事件。

## 运行时联动

- 工作台人员接口保持数组响应，单行新增 `visibility_role`、`visible_profile_fields`；配置字段对应的隐藏值在服务端置空。
- 填写详情 `person` 新增 `profile_fields: [{ key, label, value }]`；只含当前角色允许且存在值的字段。
- 旧客户端忽略新增字段仍可工作；已有路径、状态码和视觉结构不变。
