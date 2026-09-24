# PM-T013 API 契约

## 权限

所有接口依赖 `performance.configuration.manage`。未登录沿用绩效认证的 `401`，无权限返回 `403`。

## 通知设置

`GET /api/v1/performance/system-settings/notifications`

响应：

```json
{
  "feishu_push_enabled": true,
  "email_enabled": false,
  "calibration_delivery_mode": "realtime",
  "result_change_notification_scope": "final_score_grade",
  "todo_task_notification_enabled": true,
  "progress_daily_notification_enabled": true,
  "stage_start_notification_enabled": true
}
```

`PATCH /api/v1/performance/system-settings/notifications`

请求：

```json
{
  "email_enabled": true
}
```

响应同 GET。PATCH 可以只传一个可写字段；未传字段保持不变。

### 字段规则

- `feishu_push_enabled`：响应字段，固定由服务端维护；本期不可通过 PATCH 修改。
- `email_enabled`：布尔值，表示是否启用邮件通知。
- `calibration_delivery_mode`：`realtime`（实时发送）或 `after_calibration`（校准结束后合并发送）。
- `result_change_notification_scope`：`final_score_grade`（仅终评评分评级变化）或 `any_content`（任意内容变化）。
- `todo_task_notification_enabled`、`progress_daily_notification_enabled`、`stage_start_notification_enabled`：对应三项其他通知的开关，默认 `true`。
- 请求模型 `extra=forbid`，未知字段返回 `400`/422 校验错误。

## 默认值与错误

- 配置记录不存在时 GET 返回 `feishu_push_enabled=true`、`email_enabled=false` 及上述五项策略默认值，不因读取而产生写入。
- PATCH 首次调用创建单例记录并提交事务。
- `403`：缺少 `performance.configuration.manage`。
- `422`：字段类型错误或包含未知字段。
- 保存失败时前端恢复接口返回前的本地值并提示；重新打开必须以 GET 返回的服务端配置为准。独立字段 PATCH 不覆盖其他策略；禁止修改 `feishu_push_enabled`。

## 审计

PATCH 实际变更时产生 `PERFORMANCE_NOTIFICATION_SETTING_UPDATED`，主体类型为 `NOTIFICATION_SETTINGS`、主体引用为 `1`，记录变更前后状态和可信操作者。

## 非范围

本接口只维护配置；通知实际投递和三项摘要的编辑（频率、时间、节假日规则）不在本次变更内。
