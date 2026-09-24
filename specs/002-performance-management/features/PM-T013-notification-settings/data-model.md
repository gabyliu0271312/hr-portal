# PM-T013 数据模型

## `performance_notification_settings`

单例配置表，固定 `id=1`。

| 字段 | 类型 | 约束/默认值 |
| --- | --- | --- |
| `id` | `BIGINT` | 主键，固定 1 |
| `feishu_push_enabled` | `BOOLEAN` | 非空，默认 `TRUE` |
| `email_enabled` | `BOOLEAN` | 非空，默认 `FALSE` |
| `calibration_delivery_mode` | `VARCHAR(32)` | 非空，默认 `realtime`；仅允许 `realtime`/`after_calibration` |
| `result_change_notification_scope` | `VARCHAR(32)` | 非空，默认 `final_score_grade`；仅允许 `final_score_grade`/`any_content` |
| `todo_task_notification_enabled` | `BOOLEAN` | 非空，默认 `TRUE` |
| `progress_daily_notification_enabled` | `BOOLEAN` | 非空，默认 `TRUE` |
| `stage_start_notification_enabled` | `BOOLEAN` | 非空，默认 `TRUE` |
| `updated_by_type` | `VARCHAR(32)` | 可空 |
| `updated_by_ref` | `VARCHAR(64)` | 可空 |
| `created_at` | `TIMESTAMPTZ` | 非空，默认当前时间 |
| `updated_at` | `TIMESTAMPTZ` | 非空，默认当前时间，更新时刷新 |

## 迁移

- 新建 Alembic revision `0237_performance_notification_settings`，下接当前唯一 head `0236_merge_performance_scope_and_member_snapshot`。
- upgrade 创建表；downgrade 删除该表。
- 在当前唯一 head `0240_performance_organization_levels` 后新增 `0241_performance_notification_policy_settings`；升级给既有单例行补默认值，降级移除新增列，绝不修改旧迁移。
- 不修改历史迁移，不回写其他绩效设置表。
- 读取缺失记录使用内存默认值；PATCH 才创建记录，避免 GET 产生副作用。

## 一致性与审计

单条 PATCH 在同一数据库事务内更新配置、操作者字段并追加审计事件；失败整体回滚。当前配置不涉及周期快照，不会改写已启动周期的历史数据。
