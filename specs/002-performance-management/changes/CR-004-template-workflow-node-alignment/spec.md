# CR-004 模板流程节点对齐

## 变更原因

附件捕获页面确认的模板流程节点与早期 `workflow-design.md` 不一致。本变更记录作为 PM-T004 的当前权威补充，后续实现和 API DTO 以此为准。

## 当前节点枚举

`project_start`、`evaluation`、`result_view`、`work_summary`、`reviewer_360_invite`、`reviewer_360_confirm`、`calibration`、`result_communication`、`project_end`。

旧节点类型只允许在后端读取历史数据时映射，不得出现在新建/编辑写入请求中。已被周期使用的模板只允许编辑参考内容和提示内容，流程与数据写入设置由后端锁定。

## 影响文件

- `specs/002-performance-management/workflow-design.md` 的节点枚举已按本记录更新；旧中文业务说明仅作历史背景，不再作为写入 DTO 权威来源。
- `specs/002-performance-management/features/PM-T004-template-create/spec.md`
- `specs/002-performance-management/ui-blueprints/PM-T004-template-flow-settings.md`

## 验收

前端、后端 DTO、数据库读取映射和重新打开页面均不得产生旧枚举；API 返回 `editable_scope` 与 `TEMPLATE_WORKFLOW_LOCKED` 时，前端必须呈现锁定态。
