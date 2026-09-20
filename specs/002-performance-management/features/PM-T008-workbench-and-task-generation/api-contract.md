# PM-T008 API Contract（草案）

> 当前 `POST /api/v1/performance/projects/{project_id}/start` 已存在，但现实现只返回项目并改状态。以下是 PM-T008 拟冻结的扩展契约，不能视为已实现 API。

## 1. 启动项目并生成任务

`POST /api/v1/performance/projects/{project_id}/start`

权限：沿用 PM-T003 的周期管理员或授权项目管理员；服务端校验 `performance.cycles.manage` 或项目范围 `performance.projects.manage`。启动权限不等于个人待办读取权限。

建议成功响应 `200`：

```json
{
  "project_id": "p1",
  "status": "STARTED",
  "member_snapshot_id": "ms1",
  "task_generation": {"status": "COMPLETED", "created": 12, "existing": 0}
}
```

已是 `STARTED` 时必须冻结幂等语义：返回已有生成摘要，或返回明确 `409 PROJECT_ALREADY_STARTED`；不得重复生成。

建议错误：`400 NO_ASSESSEES`、`422 INVALID_FLOW_CONFIGURATION`、`403 FORBIDDEN`、`404 NOT_FOUND`、`409 PROJECT_NOT_STARTABLE`。复议处理人配置按一期有效配置前提处理，不在本期定义“两层均无法解析”的错误码。错误码和响应模型在共享契约冻结前仍需最终确认。

## 2. 工作台项目

`GET /api/v1/performance/workbench/projects`

参数：`status`、`keyword`、`page`、`page_size`。

建议响应字段：`project_id`、`project_name`、`cycle_name`、`cycle_start_at`、`cycle_end_at`、`project_status`、`participation_roles`、`is_default`。`participation_roles` 至少区分被评估人、评价人、360°执行人、校准人和复议处理人；同一项目的多种身份合并为一个项目选项，不重复展示。

## 3. 工作台流程与待办

`GET /api/v1/performance/workbench/projects/{project_id}/timeline`

建议返回可展示时间轴节点的 `node_id`、`node_name`、`node_type`、`start_at`、`end_at`、`status`。结果查看和结果复议不进入该响应；特殊节点时间字段的派生规则须与项目现有 `node_times` 语义一致。

`GET /api/v1/performance/workbench/tasks?project_id=&state=pending|completed`

建议响应返回节点聚合项：`node_id`、`node_type`、`node_name`、`pending_count`、`completed_count`、`overdue_count`、`available_at`、`due_at`、`action_url`、`participation_roles`。同一节点的多个任务合并为一条；点击后由 `action_url` 进入该节点对应的人员列表。多种参与身份仍合并计算，不创建按身份切换的查询模式。结果查看不在任务接口中返回；结果发布后的查看资格由单独结果查询接口或工作台结果卡片接口提供。

`state=pending` 表示任务尚未完成，包含已超过 `due_at` 的逾期任务；只有任务实际完成后才返回 `state=completed`。360°后续任务只在邀请和确认事件成功后生成；复议处理任务只在结果发布后被评估人提交复议申请时生成，未提交复议时不返回复议聚合项。
