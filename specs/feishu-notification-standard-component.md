# 飞书通知标准组件设计与 Roadmap

## 1. 背景

HR Portal 后续会在多个业务模块中触发飞书通知，例如成本分摊完成、报表推送完成、数据同步失败、定时任务执行结束、绩效流程待办提醒等。

如果每个页面都单独实现飞书发送逻辑，会出现以下问题：

- 接收人规则重复开发，难以维护。
- 飞书用户、群、组织负责人等 ID 解析逻辑分散。
- 通知模板、发送日志、失败处理标准不一致。
- 后续接入飞书文档推送、飞书卡片、重试机制时需要反复改造多个业务模块。

因此本规格定义 HR Portal 的统一飞书通知能力。该能力应作为平台级组件建设，由前端标准配置组件和后端统一通知服务共同组成。

## 2. 目标

第一期目标：

- 支持前端可配置的飞书通知规则。
- 支持通知指定系统用户。
- 支持通知指定飞书群。
- 支持基于员工上下文动态解析通知接收人。
- 支持从员工实时花名册字段解析人员，例如直接上级、HRBP、招聘负责人等。
- 支持从员工所在部门解析部门负责人。
- 支持消息模板变量。
- 支持接收人预览和测试发送。
- 支持发送日志和基础失败提示。
- 形成后续业务模块可复用的标准组件和后端服务。

非第一期目标：

- 不实现复杂飞书交互卡片。
- 不实现通知审批流。
- 不实现失败自动重试队列。
- 不实现多级上级链路，例如逐级上报到 N 级负责人。
- 不实现条件规则引擎，例如按金额、部门、岗位层级决定不同接收人。
- 不实现飞书文档或飞书电子表格推送，该能力另行设计，但后续可与通知服务联动。

## 3. 总体设计

通知能力拆为四层：

```text
业务模块
  -> 前端通知配置组件
    -> 后端通知 API
      -> 接收人解析服务
        -> 飞书发送适配器
```

业务模块只保存标准通知配置，不直接调用飞书 API，不直接拼接飞书用户 ID。

后端统一负责：

- 校验通知配置。
- 根据业务上下文解析接收人。
- 去重。
- 渲染消息模板。
- 调用飞书发送接口。
- 记录发送日志。

## 4. 本地 MCP 与生产集成边界

本地飞书 MCP 可以用于开发期验证，例如验证群 ID、用户 ID、飞书发送能力、文档能力。

生产系统不应依赖本地 MCP 作为运行时发送通道。HR Portal 后端应通过自身的飞书应用配置调用飞书 OpenAPI，或通过明确部署在服务端的内部适配器调用飞书能力。

边界如下：

```text
开发期 / 运维期：
  Codex 或管理员可使用飞书 MCP 验证 ID 和接口能力。

生产运行期：
  HR Portal 后端使用 FeishuClient / FeishuNotificationService 发送通知。
```

## 5. 核心概念

### 5.1 NotificationConfig

通知配置。由前端标准配置组件产出，业务模块保存并在触发通知时传给后端。

示例：

```json
{
  "enabled": true,
  "receivers": [
    {
      "type": "fixed_users",
      "user_ids": [1, 2]
    },
    {
      "type": "employee_field_user",
      "source_table": "emp_realtime_roster",
      "employee_key_field": "employee_no",
      "target_field": "direct_supervisor",
      "resolve_mode": "user_mapping"
    }
  ],
  "message": {
    "message_type": "markdown",
    "title_template": "成本分摊完成",
    "content_template": "{{employee_name}} 的 {{period_ym}} 成本分摊已完成。",
    "link_url_template": "{{detail_url}}"
  }
}
```

### 5.2 ReceiverRule

接收人规则。用于描述接收人从哪里来。

第一期支持以下规则：

```ts
type ReceiverRule =
  | FixedUsersRule
  | FixedChatsRule
  | EmployeeFieldUserRule
  | EmployeeDepartmentManagerRule
```

### 5.3 NotificationContext

通知上下文。由业务模块在触发通知时传入。

示例：

```json
{
  "employee_no": "104512",
  "employee_name": "张三",
  "period_ym": "202605",
  "detail_url": "https://hr-portal.example.com/report/run/12"
}
```

### 5.4 PersonResolver

人员解析服务。负责把花名册字段值、组织树负责人、系统用户等解析为飞书可发送对象。

### 5.5 FeishuNotificationService

通知服务。负责接收配置和上下文，完成模板渲染、接收人解析、发送和日志记录。

## 6. ReceiverRule 协议

### 6.1 指定系统用户

用于通知固定人员，例如薪酬负责人、HRBP 负责人、系统管理员。

```json
{
  "type": "fixed_users",
  "user_ids": [1, 2, 3]
}
```

处理逻辑：

- 根据 `users.id` 查询系统用户。
- 读取 `users.feishu_user_id`。
- 如果缺少飞书用户 ID，则标记为解析失败。

### 6.2 指定飞书群

用于通知固定群，例如成本分摊通知群、数据同步异常群。

```json
{
  "type": "fixed_chats",
  "chat_ids": ["oc_xxx", "oc_yyy"]
}
```

处理逻辑：

- 直接使用 `chat_id` 作为飞书群接收对象。
- 群 ID 应由管理员在配置页维护，或由开发期 MCP / 后台工具辅助获取。

### 6.3 员工字段对应人员

用于从员工实时花名册的某个字段取人员，例如直接上级、HRBP、招聘负责人。

```json
{
  "type": "employee_field_user",
  "source_table": "emp_realtime_roster",
  "employee_key_field": "employee_no",
  "target_field": "direct_supervisor",
  "resolve_mode": "user_mapping"
}
```

配置说明：

- `source_table` 第一期固定为 `emp_realtime_roster`。
- `employee_key_field` 第一期建议固定为 `employee_no`。
- `target_field` 由前端从花名册字段列表中选择。
- `resolve_mode` 第一期支持 `user_mapping`，后续可扩展 `feishu_contact`。

处理逻辑：

```text
context.employee_no
  -> 查询 emp_realtime_roster.raw->>'employee_no'
    -> 读取 raw[target_field]
      -> 通过 PersonResolver 解析为系统用户或飞书用户
        -> 发送通知
```

直接上级示例：

```json
{
  "type": "employee_field_user",
  "source_table": "emp_realtime_roster",
  "employee_key_field": "employee_no",
  "target_field": "direct_supervisor",
  "resolve_mode": "user_mapping"
}
```

HRBP 示例：

```json
{
  "type": "employee_field_user",
  "source_table": "emp_realtime_roster",
  "employee_key_field": "employee_no",
  "target_field": "hrbp",
  "resolve_mode": "user_mapping"
}
```

### 6.4 员工所在部门负责人

用于通知员工所在组织节点负责人。

```json
{
  "type": "employee_department_manager",
  "source_table": "emp_realtime_roster",
  "employee_key_field": "employee_no",
  "department_field": "department_3",
  "manager_source": "org_tree"
}
```

配置说明：

- `department_field` 可选 `department`、`department_2`、`department_3`、`department_4`、`department_5`。
- `manager_source` 第一期固定为 `org_tree`。

处理逻辑：

```text
context.employee_no
  -> 查询 emp_realtime_roster
    -> 读取员工的 department_field
      -> 在 org_tree 中定位组织节点
        -> 读取 org_tree.manager
          -> 通过 PersonResolver 解析为飞书用户
```

部门节点匹配策略第一期采用名称匹配，后续如花名册中有稳定组织编码，应优先升级为编码匹配。

## 7. 人员解析策略

第一期推荐解析顺序：

```text
原始人员值
  -> users.login_name 精确匹配
  -> users.display_name 精确匹配
  -> users.email 精确匹配
  -> users.feishu_user_id 直接匹配
  -> 解析失败
```

后续可扩展：

```text
原始人员值
  -> 飞书通讯录搜索
  -> 获取 open_id
  -> 写入本地身份映射缓存
```

注意：

- 第一版不建议依赖模糊姓名匹配自动发送正式通知。
- 如果出现同名多人，应返回解析冲突，不应随机选一个人。
- 解析失败时，预览接口必须展示失败原因。

## 8. 前端组件设计

### 8.1 标准配置组件

建议新增：

```text
frontend/src/components/feishu/FeishuNotificationConfig.vue
```

职责：

- 维护通知启用状态。
- 配置接收人规则。
- 配置消息模板。
- 发起接收人预览。
- 发起测试发送。
- 输出标准 `NotificationConfig`。

组件调用示例：

```vue
<FeishuNotificationConfig
  v-model="notificationConfig"
  biz-type="cost_allocation"
/>
```

### 8.2 接收人规则配置交互

接收对象来源：

- 指定人员
- 指定群
- 员工字段对应人员
- 员工所在部门负责人

选择“员工字段对应人员”时：

- 展示员工实时花名册字段选择器。
- 字段来自 `/api/v1/data/emp_realtime_roster/columns`。
- 推荐优先展示人员类字段，例如直接上级、HRBP、负责人等。

选择“员工所在部门负责人”时：

- 展示部门层级选择器。
- 选项为一级部门、二级部门、三级部门、四级部门、五级部门。

### 8.3 消息模板配置

第一期支持：

- 标题模板
- 正文模板
- 跳转链接模板
- 消息类型：文本、Markdown

模板变量来自业务模块传入的 `NotificationContext`。

示例：

```text
{{employee_name}} 的 {{period_ym}} 成本分摊结果已生成。
```

### 8.4 预览与测试发送

配置组件必须提供：

- 接收人预览按钮
- 测试发送按钮

预览时业务模块需要提供样例上下文，例如员工编号。

## 9. 后端模块设计

建议新增：

```text
backend/app/integrations/feishu/
  __init__.py
  schemas.py
  router.py
  feishu_client.py
  notification_service.py
  receiver_resolver.py
  models.py
```

### 9.1 receiver_resolver.py

职责：

- 解析 `ReceiverRule`。
- 查员工实时花名册。
- 查组织树负责人。
- 查系统用户。
- 去重并返回标准接收人对象。

标准接收人对象：

```json
{
  "receiver_type": "user",
  "receiver_id": "ou_xxx",
  "display_name": "张三",
  "source": "employee_field_user:direct_supervisor"
}
```

群接收人：

```json
{
  "receiver_type": "chat",
  "receiver_id": "oc_xxx",
  "display_name": "成本分摊通知群",
  "source": "fixed_chats"
}
```

### 9.2 notification_service.py

职责：

- 校验配置。
- 调用接收人解析服务。
- 渲染模板。
- 调用飞书客户端发送。
- 写入发送日志。
- 返回成功、失败、部分成功结果。

### 9.3 feishu_client.py

职责：

- 封装飞书消息发送 API。
- 管理应用凭证。
- 屏蔽 token 获取、请求重试、错误解析等细节。

第一期至少支持：

- 发送文本消息。
- 发送 Markdown 或 post 消息。
- 按用户 ID 发送。
- 按群 chat_id 发送。

## 10. API 设计

### 10.1 预览接收人

```text
POST /api/v1/feishu/notifications/resolve
```

请求：

```json
{
  "config": {
    "receivers": []
  },
  "context": {
    "employee_no": "104512"
  }
}
```

响应：

```json
{
  "ok": true,
  "receivers": [
    {
      "receiver_type": "user",
      "receiver_id": "ou_xxx",
      "display_name": "张三",
      "source": "employee_field_user:direct_supervisor"
    }
  ],
  "errors": []
}
```

### 10.2 测试发送

```text
POST /api/v1/feishu/notifications/test
```

要求：

- 必须校验当前用户有通知配置或测试权限。
- 测试发送应写入日志，标记 `is_test=true`。

### 10.3 正式发送

```text
POST /api/v1/feishu/notifications/send
```

请求：

```json
{
  "biz_type": "cost_allocation",
  "biz_id": "run_123",
  "config": {},
  "context": {}
}
```

响应：

```json
{
  "ok": true,
  "status": "success",
  "success_count": 2,
  "failed_count": 0,
  "log_id": 10001
}
```

### 10.4 查询发送日志

```text
GET /api/v1/feishu/notifications/logs?biz_type=cost_allocation&biz_id=run_123
```

## 11. 数据模型建议

### 11.1 飞书群目标

```text
feishu_chat_targets
- id
- name
- chat_id
- description
- is_active
- created_by
- created_at
- updated_at
```

### 11.2 通知配置

是否落库取决于业务模块：

- 若某个业务模块有自己的配置表，可直接保存 `notification_config JSON`。
- 若需要平台统一管理通知模板，可后续新增 `feishu_notification_configs`。

第一期可以先允许业务模块保存配置 JSON，避免过早抽象配置中心。

### 11.3 发送日志

```text
feishu_notification_logs
- id
- biz_type
- biz_id
- is_test
- message_type
- title
- rendered_content
- receiver_snapshot JSON
- result_snapshot JSON
- status
- success_count
- failed_count
- error_message
- triggered_by
- created_at
```

`receiver_snapshot` 用于记录本次解析出的接收人，便于后续排查。

`result_snapshot` 用于记录飞书接口返回结果，敏感 token 不得入库。

## 12. 权限与安全

第一期建议权限：

```text
system.feishu_notification_config.V
system.feishu_notification_config.C
system.feishu_notification_config.U
system.feishu_notification_config.D
system.feishu_notification_config.E
```

最小要求：

- 只有有配置权限的用户可以编辑通知配置。
- 只有有测试权限的用户可以测试发送。
- 发送日志可按业务模块权限隔离。
- 飞书 app secret 不得返回前端，不得写入普通日志。
- 接收人预览接口不得暴露当前用户无权查看的敏感员工字段。

## 13. 失败处理

第一期必须覆盖以下失败场景：

- 通知配置未启用。
- 缺少必要上下文，例如缺少 `employee_no`。
- 员工实时花名册找不到员工。
- 花名册目标字段为空。
- 目标人员无法映射到飞书用户。
- 目标人员映射到多个用户，存在歧义。
- 系统用户缺少 `feishu_user_id`。
- 群 chat_id 无效。
- 飞书接口返回失败。
- 部分接收人发送成功、部分失败。

失败处理原则：

- 预览接口只解析，不发送。
- 测试发送和正式发送都必须写日志。
- 部分失败时返回 `partial_success`。
- 不能因为一个接收人失败阻断其他接收人发送。
- 失败信息必须面向管理员可读。

## 14. 一期试点：报表管理自动通知

报表管理模块作为飞书通知标准组件的第一期试点接入场景。

该试点的目的不是把飞书发送逻辑写入报表模块，而是验证标准通知组件在真实业务模块中的可配置性、可复用性、触发链路和日志追踪能力。

### 14.1 试点目标

- 报表设计页或报表配置页可以配置自动通知。
- 报表运行成功后可以自动通知。
- 报表运行失败后可以自动通知。
- 报表定时任务运行完成后可以自动通知。
- 报表通知复用统一 `NotificationConfig`。
- 报表通知复用统一飞书通知服务、接收人解析服务和发送日志。

### 14.2 报表模块改造范围

前端改造：

- 在报表设计页或报表配置页增加“通知设置”区域。
- 嵌入 `FeishuNotificationConfig.vue`。
- 支持启用或关闭通知。
- 支持配置通知触发时机。
- 支持配置接收人和消息模板。
- 支持预览接收人和测试发送。

后端改造：

- 报表模型增加通知配置存储能力。
- 报表运行成功、运行失败时触发通知服务。
- 报表调度任务完成时触发通知服务。
- 报表模块只负责组装通知上下文，不直接调用飞书 API。

### 14.3 报表通知配置存储

第一期建议在 `reports` 表增加：

```text
notification_config JSON
```

说明：

- `Report.config` 继续只保存查询、字段、筛选、排序、转置等报表定义。
- `notification_config` 独立保存通知配置，避免报表查询配置和通知配置混杂。
- 后续如通知能力平台化，可迁移到统一 `notification_configs` 表。

备选方案：

```text
notification_configs
- id
- biz_type
- biz_id
- config
- is_active
- created_at
- updated_at
```

第一期优先使用 `reports.notification_config`，降低落地复杂度。

### 14.4 报表通知触发时机

第一期支持：

```text
report_run_success
report_run_failed
scheduled_report_success
scheduled_report_failed
```

触发策略：

- 手动运行报表成功后，如果配置启用成功通知，则发送通知。
- 手动运行报表失败后，如果配置启用失败通知，则发送通知。
- 调度任务运行报表成功后，如果配置启用调度成功通知，则发送通知。
- 调度任务运行报表失败后，如果配置启用调度失败通知，则发送通知。

### 14.5 报表通知上下文

报表模块调用通知服务时，应提供标准上下文：

```json
{
  "report_id": 12,
  "report_name": "月度成本分摊结果",
  "dataset_id": 3,
  "dataset_name": "成本分摊数据集",
  "status": "success",
  "total_rows": 2507,
  "run_time": "2026-06-11 14:30:00",
  "run_url": "https://hr-portal.example.com/report/run/12",
  "error_message": ""
}
```

失败场景中：

```json
{
  "status": "failed",
  "error_message": "报表筛选条件不合法"
}
```

### 14.6 报表通知第一期接收人

第一期支持：

- 指定系统用户。
- 指定飞书群。
- 报表创建人或负责人。

报表创建人或负责人可作为后续 `ReceiverRule` 扩展：

```json
{
  "type": "biz_owner",
  "owner_source": "report.owner_id"
}
```

如果第一期不实现通用 `biz_owner`，也可以由报表模块在调用通知服务前转换为 `fixed_users`。

### 14.7 报表通知第一期不做

第一期不做以下能力：

- 不按报表结果逐行通知员工上级或 HRBP。
- 不按报表结果中的 `employee_no` 分组发送结果摘要。
- 不把报表结果直接附在飞书消息中。
- 不在报表运行完成后自动推送飞书文档。
- 不将飞书文档链接作为必填上下文。

这些能力进入后续阶段：

```text
报表结果
  -> 按 employee_no 解析上级 / HRBP / 部门负责人
    -> 按接收人分组
      -> 发送每个接收人的结果摘要
```

### 14.8 边界原则

- 报表模块只嵌入通知配置组件。
- 报表模块只保存通知配置和提供通知上下文。
- 报表模块只在运行事件发生后调用统一通知服务。
- 接收人解析、飞书发送、日志记录都由通用飞书通知模块负责。
- 通用飞书通知模块不得写入报表私有查询逻辑。

## 15. 第一期验收标准

### 15.1 功能验收

- 可以在前端标准组件中启用或关闭飞书通知。
- 可以配置指定系统用户为接收人。
- 可以配置指定飞书群为接收人。
- 可以配置“员工字段对应人员”为接收人，字段可从员工实时花名册中选择。
- 可以配置“员工所在部门负责人”为接收人，并选择部门层级。
- 可以配置标题模板、正文模板、跳转链接模板。
- 可以使用样例上下文预览接收人。
- 可以发送测试通知。
- 正式发送时能根据业务上下文动态解析接收人。
- 同一个接收人被多条规则解析出来时只发送一次。
- 发送后可以查看发送日志。
- 发送失败时前端能展示明确失败原因。

### 15.2 报表管理试点验收

- 报表设计页或报表配置页可以嵌入飞书通知标准配置组件。
- 报表可以保存独立的 `notification_config`。
- 报表手动运行成功后，可以按配置触发飞书通知。
- 报表手动运行失败后，可以按配置触发飞书通知。
- 报表定时任务运行完成后，可以按配置触发飞书通知。
- 通知上下文至少包含报表名称、数据集名称、运行状态、结果行数、运行时间、报表查看链接。
- 报表通知可以发送给固定系统用户。
- 报表通知可以发送给固定飞书群。
- 报表通知可以发送给报表创建人或负责人。
- 报表通知发送日志可以通过业务类型 `report` 和报表 ID 追踪。
- 报表模块不直接调用飞书 API，只调用统一飞书通知服务。
- 报表模块不自行实现接收人解析逻辑。

### 15.3 复用性验收

- 通知组件不绑定特定业务页面。
- 业务模块通过 `v-model` 或等价方式保存标准 `NotificationConfig`。
- 后端发送接口不绑定特定业务模块。
- 成本分摊、报表、调度任务等模块都可以复用同一套配置协议。
- 报表管理模块作为第一期试点接入，但不得把报表私有逻辑写入通用飞书通知服务。

### 15.4 数据验收

- `users.feishu_user_id` 可作为系统用户到飞书用户的映射字段。
- `emp_realtime_roster.raw.employee_no` 可用于定位员工。
- `emp_realtime_roster.raw.direct_supervisor` 可作为员工字段人员规则的示例字段。
- `org_tree.manager` 可作为部门负责人来源。
- 通知日志必须记录业务类型、业务 ID、接收人快照、发送结果。

### 15.5 安全验收

- 飞书 app secret 不出现在接口响应、前端页面、普通日志中。
- 无配置权限的用户不能编辑通知规则。
- 无测试权限的用户不能发送测试通知。
- 通知日志不记录飞书访问 token。
- 预览接收人时不泄露无关员工敏感字段。

## 16. 测试标准

### 16.1 单元测试

接收人解析：

- `fixed_users` 能解析出有 `feishu_user_id` 的系统用户。
- `fixed_users` 遇到缺失 `feishu_user_id` 时返回解析错误。
- `fixed_chats` 能解析出群接收人。
- `employee_field_user` 能根据 `employee_no` 找到员工记录。
- `employee_field_user` 能读取目标字段并解析为系统用户。
- `employee_field_user` 目标字段为空时返回错误。
- `employee_department_manager` 能根据部门字段找到 `org_tree.manager`。
- 同一个用户由多条规则命中时能去重。
- 同名多人匹配时返回冲突错误。

模板渲染：

- `{{employee_name}}` 等变量能正确替换。
- 缺失变量时有明确处理策略，建议保留原占位符并记录 warning。
- 链接模板能正确渲染。

### 16.2 API 测试

预览接口：

- 有效配置返回接收人列表。
- 缺少上下文返回 400。
- 找不到员工时返回可读错误。
- 解析失败时不发送消息。

测试发送接口：

- 能发送给指定用户。
- 能发送给指定群。
- 能发送给员工字段对应人员。
- 能发送给部门负责人。
- 发送后写入 `is_test=true` 日志。

正式发送接口：

- 能写入正式发送日志。
- 部分失败时返回 `partial_success`。
- 飞书接口失败时记录错误摘要。

权限测试：

- 无权限用户不能编辑配置。
- 无权限用户不能测试发送。
- 普通用户不能查看无关业务发送日志。

### 16.3 前端测试

组件配置：

- 切换接收对象来源时表单字段正确变化。
- 指定人员选择器能回显已选用户。
- 指定群选择器能回显已选群。
- 员工字段选择器能加载花名册字段。
- 部门负责人规则能选择部门层级。
- 模板编辑区能保存标题、正文、链接。

预览与测试：

- 输入样例员工编号后可以预览接收人。
- 解析失败时能显示失败原因。
- 测试发送成功后显示成功反馈。
- 测试发送失败后显示错误反馈。

### 16.4 集成测试

至少覆盖以下链路：

```text
固定人员配置
  -> 保存配置
  -> 预览接收人
  -> 测试发送
  -> 查看日志
```

```text
员工字段人员配置
  -> 输入 employee_no
  -> 查 emp_realtime_roster
  -> 读取 direct_supervisor
  -> 映射 users.feishu_user_id
  -> 发送飞书通知
```

```text
部门负责人配置
  -> 输入 employee_no
  -> 查员工 department_3
  -> 查 org_tree.manager
  -> 映射飞书用户
  -> 发送飞书通知
```

```text
报表自动通知配置
  -> 报表保存 notification_config
  -> 手动运行报表成功
  -> 组装 report 通知上下文
  -> 调用统一飞书通知服务
  -> 发送通知
  -> 写入 report 业务日志
```

```text
报表失败通知配置
  -> 手动运行报表失败
  -> 组装 failed 状态和 error_message
  -> 调用统一飞书通知服务
  -> 发送失败通知
  -> 写入 report 业务日志
```

### 16.5 人工验收测试

在测试飞书环境或受控飞书群中验证：

- 指定人员能收到消息。
- 指定群能收到消息。
- 员工直接上级能收到消息。
- HRBP 字段配置后对应人员能收到消息。
- 部门负责人能收到消息。
- 消息内容变量渲染正确。
- 消息链接可以打开目标页面。
- 重复接收人不会收到多条相同消息。
- 解析失败时不会误发给错误人员。
- 报表运行成功后，配置的接收人能收到报表通知。
- 报表运行失败后，配置的接收人能收到失败通知。
- 报表通知中的链接可以打开报表查看页。

## 17. Roadmap

### Phase 1: 标准通知组件

目标：

- 完成本文定义的一期范围。
- 建立标准 `NotificationConfig` 和 `ReceiverRule` 协议。
- 建立前端配置组件。
- 建立后端接收人解析、发送和日志能力。
- 完成报表管理模块最小试点接入。

### Phase 2: 通知模板中心

目标：

- 支持平台统一维护通知模板。
- 支持模板版本。
- 支持业务模块引用模板。
- 支持模板变量说明和样例上下文。

### Phase 3: 更多接收人规则

目标：

- 支持成本中心负责人。
- 支持项目负责人。
- 支持角色成员，例如所有薪酬管理员。
- 支持多级上级链路。
- 支持按条件选择接收人。

### Phase 4: 发送可靠性

目标：

- 支持失败自动重试。
- 支持异步发送队列。
- 支持发送频控。
- 支持重复通知抑制。
- 支持更完整的可观测性。

### Phase 5: 飞书生态联动

目标：

- 与飞书文档推送联动。
- 与飞书电子表格推送联动。
- 支持飞书交互卡片。
- 支持通知里的按钮跳转和状态回写。

### Phase 6: 报表结果动态通知

目标：

- 支持按报表结果中的 `employee_no` 解析接收人。
- 支持按接收人分组报表结果。
- 支持给员工上级、HRBP、部门负责人发送其负责范围内的结果摘要。
- 支持报表推送飞书文档后自动附带文档链接通知。

## 18. 开放问题

- 员工实时花名册中 HRBP 字段的标准字段编码是什么，是否已经存在。
- 部门负责人应优先取 `org_tree.manager`，还是需要专门维护部门负责人映射表。
- 飞书用户 ID 应统一使用 `open_id`、`user_id` 还是 union id。
- 群 chat_id 的维护入口放在系统设置，还是通知组件内联维护。
- 发送日志保留周期是否需要配置。
- 测试环境和生产环境是否使用不同飞书应用。
- 报表是否已有明确负责人字段，还是第一期只使用创建人作为负责人。
- 报表手动运行是否默认通知，还是只在配置明确启用时通知。
- 报表失败通知是否需要包含完整异常，还是只展示管理员友好的错误摘要。

## 19. 一期开发建议顺序

1. 建立后端 schema 和 ReceiverRule 校验。
2. 实现 `PersonResolver`。
3. 实现 `ReceiverResolver`。
4. 实现 `FeishuClient`。
5. 实现 `FeishuNotificationService`。
6. 实现预览、测试发送、正式发送、日志查询 API。
7. 实现前端 `FeishuNotificationConfig.vue`。
8. 改造报表模型，增加 `notification_config`。
9. 在报表设计页或报表配置页嵌入通知配置组件。
10. 在报表手动运行和调度运行链路中调用统一飞书通知服务。
11. 补齐报表自动通知的自动化测试和人工验收记录。
12. 再评估成本分摊、数据同步、其他调度任务的接入顺序。
