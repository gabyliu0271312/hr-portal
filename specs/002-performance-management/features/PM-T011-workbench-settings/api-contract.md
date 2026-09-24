# PM-T011 API 契约

## 权限

所有以下接口依赖 `performance.configuration.manage`。无权限返回 `403`，未登录沿用绩效认证的 `401`。

## 工作台设置

`GET /api/v1/performance/workbench-settings`

```json
{
  "announcement_enabled": true,
  "entries": { "items": [], "total": 0, "page": 1, "page_size": 10 },
  "announcements": { "items": [], "total": 0, "page": 1, "page_size": 10 }
}
```

`PATCH /api/v1/performance/workbench-settings`

请求：`{"announcement_enabled": true}`

响应：`{"announcement_enabled": true}`

## 工作台前台公告消费

`GET /api/v1/performance/workbench/announcements?cycle_ref=`

该接口只要求用户具备绩效应用入口权限，不要求 `performance.configuration.manage`。它是后台配置到前台工作台的只读消费接口：

```json
{
  "announcement_enabled": true,
  "items": [{
    "id": 1,
    "title": "公告标题",
    "link": "/performance/review",
    "cycle_label": "所有周期",
    "require_ack": false,
    "display_order": 0,
    "updated_at": "2026-09-21T00:00:00Z"
  }]
}
```

规则：

- 仅返回 `active` 公告；按 `display_order`、`id` 升序。
- `announcement_enabled=false` 时返回空 `items`，不删除后台已配置公告。
- 传入 `cycle_ref` 时返回所有周期公告及该周期公告；未传入时只返回所有周期公告。
- 指定人员公告只对该周期快照中确实承担 HRBP 或实线上级身份的用户返回；系统管理员预览可读取两类指定人员公告。
- 前台只消费展示字段，不提供创建、编辑、删除、启停或发布操作。

`GET /api/v1/performance/workbench-settings/entries?keyword=&status=&page=1&page_size=10`

响应：

```json
{
  "items": [{
    "id": 1,
    "title": "入口标题",
    "status": "active",
    "link": "https://example.com",
    "icon": null,
    "visibility": "所有人",
    "display_order": 0,
    "created_at": "2026-09-21T00:00:00Z",
    "updated_at": "2026-09-21T00:00:00Z"
  }],
  "total": 1,
  "page": 1,
  "page_size": 10
}
```

`POST /api/v1/performance/workbench-settings/entries`

请求字段：`title`、`link`、`icon?`、`visibility?`、`status?`、`display_order?`。

`PATCH /api/v1/performance/workbench-settings/entries/{id}`：字段同上，均为可选。

`DELETE /api/v1/performance/workbench-settings/entries/{id}`：删除入口并记录审计。

`POST /api/v1/performance/workbench-settings/entries/{id}/status`

请求：`{"status":"active"|"inactive"}`。

## 公告

公告接口路径将 `entries` 替换为 `announcements`。

字段：`title`、`status`、`link`、`cycle_label`、`visibility`、`require_ack`、`display_order`。

`require_ack` 表示是否弹窗并要求查看人确认知悉，默认 `false`。采集的展示周期和可见范围模式分别写入 `cycle_label`（所有周期/指定周期）和 `visibility`（所有人/指定人员）。指定周期额外保存真实周期 `cycle_ref`；指定人员额外保存 `visibility_role`，取 `HRBP` 或 `REAL_LINE_MANAGER`。

列表支持 `keyword`、`status`、`page`、`page_size`。

## 错误

- `400 VALIDATION_FAILED`：标题或链接为空，或字段值超长。
- `404 WORKBENCH_SETTING_NOT_FOUND`：更新/删除目标不存在。
- `409 STATUS_CONFLICT`：状态值不在 `active` / `inactive`。
- `403`：缺少 `performance.configuration.manage`。
