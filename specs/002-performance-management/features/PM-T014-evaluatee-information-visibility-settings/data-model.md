# PM-T014 数据模型

completion_status: incomplete
pixel_restore_status: blocked
uncovered_reasons: missing_replayable_session, missing_dpr, missing_target_screenshot, missing_editor_state, missing_interaction_evidence

## `performance_subject_visibility_settings`

单例表，固定 `id=1`。

| 字段 | 类型 | 约束 |
| --- | --- | --- |
| `id` | BIGINT | 主键 |
| `rules` | JSONB | 非空，角色键到字段键数组 |
| `updated_by_type` | VARCHAR(32) | 可空 |
| `updated_by_ref` | VARCHAR(64) | 可空 |
| `created_at` | TIMESTAMPTZ | 非空 |
| `updated_at` | TIMESTAMPTZ | 非空 |

迁移 `0238_performance_subject_visibility_settings` 下接唯一 head `0237_performance_notification_settings`。只创建新表；downgrade 删除新表。配置是读取时披露策略，不修改人员快照历史值。
