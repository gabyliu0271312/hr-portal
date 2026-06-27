# 飞书通知 + 自动化规则 + AI 全局对话 最小开发计划

版本：v0.1  
日期：2026-06-27  
关联文档：

- `specs/feishu-notification-standard-component.md`
- `specs/004-ai-native-workbench/ai-capability-registry.md`
- `specs/004-ai-native-workbench/implementation-blueprint.md`

## 1. 开发目标

本计划把飞书通知能力拆成可逐步落地的最小开发步骤，避免一次性建设完整工作流平台。

最终目标：

```text
全局 AI 对话
  -> 生成自动化规则草稿
    -> 用户预览 / 编辑 / 确认
      -> 保存规则
        -> Scheduler / 报表等 Trigger 触发
          -> 执行飞书消息 Action
```

## 2. 总体拆分原则

1. 先做原子能力，再做编排。
2. 先做手动/接口闭环，再接 AI。
3. 先复用现有 Scheduler，不重建定时任务系统。
4. AI 只生成草稿，不直接保存、不直接发送。
5. 所有写操作、发送操作必须确认、鉴权、审计。

---

## Step 0：现有 Scheduler 盘点与边界固化

### 目标

确认现有 `backend/app/scheduler` 是平台级公共组件，并补齐文档和少量接口约定。

### 开发任务

- 梳理现有 `ScheduledJob`、`JobRun`、`SchedulerEngine`、`JOB_HANDLERS`。
- 明确 `kind + business_id` 是统一业务调度标识。
- 明确手动触发和 cron 触发都走 `run_job_now`。
- 补充 Scheduler 不直接发送飞书消息的边界说明。

### 验收

- 有文档说明 Scheduler 是公共组件。
- 新业务只需注册 handler，不需要改 engine / models。
- 飞书通知不进入 scheduler handler 内部硬编码。

---

## Step 1：飞书消息 Action 的最小后端能力

### 目标

先实现可被业务和自动化规则复用的飞书消息发送动作。

### 开发任务

- 新增或完善：

```text
backend/app/integrations/feishu/
  schemas.py
  feishu_client.py
  receiver_resolver.py
  notification_service.py
  router.py
  models.py
```

- 实现 ReceiverRule：
  - `fixed_users`
  - `fixed_chats`
  - `employee_field_user`
  - `employee_department_manager`
- 实现消息模板渲染。
- 实现资源链接 `resources`。
- 实现接收人去重。
- 实现发送日志 `feishu_notification_logs`。

### API

```text
POST /api/v1/feishu/notifications/resolve
POST /api/v1/feishu/notifications/message-preview
POST /api/v1/feishu/notifications/test
POST /api/v1/feishu/notifications/send
GET  /api/v1/feishu/notifications/logs
```

### 验收

- 能预览接收人。
- 能预览消息内容。
- 能测试发送给个人。
- 能测试发送给群。
- 能记录成功、失败、部分成功日志。

---

## Step 2：前端飞书消息动作配置组件

### 目标

实现可被业务页面和自动化规则编辑器复用的动作配置组件。

### 开发任务

新增：

```text
frontend/src/components/feishu/FeishuMessageActionConfig.vue
frontend/src/components/feishu/FeishuReceiverRuleEditor.vue
frontend/src/components/feishu/FeishuMessageTemplateEditor.vue
frontend/src/components/feishu/FeishuMessagePreview.vue
frontend/src/api/feishuNotifications.ts
```

组件能力：

- 配置接收人。
- 编辑标题和正文模板。
- 配置资源链接，包括飞书文档链接。
- 接收人预览。
- 消息内容预览。
- 测试发送。

### 验收

- 组件不绑定报表模块。
- 通过 `v-model` 输出标准 action config。
- 可嵌入任意业务页面。

---

## Step 3：报表定时运行 handler 接入 Scheduler

### 目标

如果现有报表需要定时执行，必须复用公共 Scheduler。

### 开发任务

- 新增 `report_run` handler：

```python
JOB_HANDLERS["report_run"] = _handler_report_run
```

- 报表保存定时配置时调用：

```python
upsert_job(kind="report_run", business_id=report_id, cron=schedule, payload={...})
```

- 报表手动运行和定时运行尽量复用同一业务执行服务。
- handler 完成后写入 `job_runs`。

### 验收

- 报表定时任务不单独建调度器。
- 手动触发和 cron 触发路径一致。
- 报表运行成功 / 失败有统一运行结果。

---

## Step 4：标准事件发布机制 MVP

### 目标

让 Scheduler、报表等模块完成后发布标准事件，供自动化规则匹配。

### 开发任务

新增轻量事件服务：

```text
backend/app/automation/events.py
```

建议接口：

```python
async def publish_event(event: AutomationEvent, db: AsyncSession) -> None:
    ...
```

一期可以同步执行，不引入消息队列。

标准事件：

```text
scheduled_job_success
scheduled_job_failed
scheduled_job_finished
report_run_success
report_run_failed
scheduled_report_success
scheduled_report_failed
```

### 验收

- Scheduler 完成后可发布 `scheduled_job_*` 事件。
- 报表 handler 可发布 `report_run_*` / `scheduled_report_*` 事件。
- 事件 payload 包含可用于消息模板的上下文字段。

---

## Step 5：自动化规则后端 MVP

### 目标

实现“事件 -> 匹配规则 -> 执行动作”的最小闭环。

### 开发任务

新增：

```text
backend/app/automation/
  models.py
  schemas.py
  rule_service.py
  engine.py
  action_registry.py
  router.py
```

数据表：

```text
automation_rules
automation_executions
automation_action_executions
```

一期 Action 注册：

```text
feishu_send_message
```

API：

```text
POST /api/v1/automation/rules/validate
POST /api/v1/automation/rules
GET  /api/v1/automation/rules
GET  /api/v1/automation/rules/{id}
PATCH /api/v1/automation/rules/{id}
POST /api/v1/automation/rules/{id}/enable
POST /api/v1/automation/rules/{id}/disable
GET  /api/v1/automation/executions
```

### 验收

- 可保存一条规则。
- 可通过事件触发规则。
- 可执行飞书消息动作。
- 可记录规则执行和动作执行日志。

---

## Step 6：自动化规则前端编辑器 MVP

### 目标

提供非 AI 的规则配置入口，保证能力可手动使用和调试。

### 开发任务

新增：

```text
frontend/src/views/automation/AutomationRuleList.vue
frontend/src/views/automation/AutomationRuleEditor.vue
frontend/src/components/automation/TriggerSelector.vue
frontend/src/components/automation/ActionListEditor.vue
frontend/src/api/automation.ts
```

一期支持：

- 选择触发器。
- 配置飞书消息动作。
- 启用 / 停用规则。
- 查看执行记录。

### 验收

- 不通过 AI 也能创建规则。
- 可配置“报表运行成功后发送飞书消息”。
- 前端复用 `FeishuMessageActionConfig`。

---

## Step 7：AI Capability 注册

### 目标

把自动化规则创建能力暴露给 AI 原生工作台。

### 开发任务

注册 Capability：

```text
automation.rule.create_draft
automation.rule.validate
automation.rule.save
automation.rule.enable
feishu.message.preview
feishu.message.test_send
```

补充：

- input_schema。
- output_schema。
- required_permission。
- side_effect。
- confirmation。
- failure_modes。
- eval_cases。

### 验收

- `GET /api/v1/ai/capabilities` 可看到自动化能力。
- 无权限用户不可见或不可调用。
- write/send 类能力必须确认。

---

## Step 8：AI 生成 AutomationRule Artifact

### 目标

用户通过全局对话生成自动化规则草稿。

### 开发任务

- 在 AI chat route 中新增自动化规则意图。
- 使用 LLM extractor 输出结构化槽位，不用关键词和正则兜底。
- 生成 `artifact_type = automation_rule`。
- 信息不足时追问。
- 草稿生成后调用规则校验。

示例用户输入：

```text
当月度成本报表每天早上 9 点运行完成后，给薪酬组飞书群发消息，附上报表链接和飞书文档链接。
```

输出：

```text
Scheduler Job 草稿 + Automation Rule 草稿
```

### 验收

- AI 只生成草稿，不保存。
- 关键槽位缺失时会追问。
- 草稿能在前端 Artifact 面板展示。

---

## Step 9：AI Artifact 前端预览、编辑、确认保存

### 目标

用户在全局 AI 工作台中确认 AI 生成的规则。

### 开发任务

新增：

```text
frontend/src/components/ai/artifacts/AutomationRuleArtifactPreview.vue
```

能力：

- 展示触发器摘要。
- 展示动作摘要。
- 展示飞书消息预览。
- 支持跳转到完整规则编辑器。
- 支持确认保存。
- 支持放弃草稿。

### 验收

- AI 生成规则草稿后，用户可以查看、编辑、保存。
- 保存前二次确认。
- 保存后写入 `automation_rules`。
- 审计记录关联 `source_artifact_id`。

---

## Step 10：端到端验收场景

### 场景 A：手动配置

```text
创建自动化规则
  -> 触发器选择 report_run_success
  -> 动作选择发送飞书消息
  -> 配置接收群
  -> 预览消息
  -> 保存并启用
  -> 手动运行报表
  -> 收到飞书消息
```

### 场景 B：定时任务触发

```text
创建 report_run scheduled_job
  -> cron 触发
  -> report_run handler 执行成功
  -> 发布 scheduled_report_success
  -> 自动化规则触发
  -> 发送飞书消息
```

### 场景 C：AI 全局对话创建

```text
用户自然语言描述规则
  -> AI 生成草稿
  -> 用户预览和编辑
  -> 用户确认保存
  -> 规则启用
  -> 事件触发后自动发送飞书消息
```

### 场景 D：权限与安全

```text
无权限用户创建规则失败
无权限用户测试发送失败
AI 不能绕过确认保存规则
AI 不能直接发送正式飞书消息
敏感字段不能进入消息正文
```

---

## Step 11：飞书消息标记完成功能

### 目标

在飞书通知中支持"标记已完成"交互能力 —— 用户在消息中点击按钮即可标记已处理，后续触发时自动跳过已完成用户。

### 开发任务

#### 11.1 后端 Schema 扩展

修改 `integrations/feishu/schemas.py`：

| 字段 | 所属模型 | 类型 | 默认值 | 说明 |
|------|----------|------|--------|------|
| `require_completion` | `MessageConfig` | bool | `false` | 是否要求用户标记完成 |
| `completion_prompt` | `MessageConfig` | str | `"标记已完成"` | 按钮提示文字 |
| `require_completion` | `NotificationConfig` | bool | `false` | 顶层开关（快捷方式） |

#### 11.2 数据模型

新增 Alembic migration `0050_feishu_completions`，创建 `feishu_notification_completions` 表：

```text
- id                  serial PRIMARY KEY
- notification_log_id integer NOT NULL  FK -> feishu_notification_logs
- receiver_type       varchar(16) NOT NULL   'user' | 'chat_member'
- receiver_id         varchar(128) NOT NULL  open_id
- completed_at        timestamp NOT NULL
- created_at          timestamp NOT NULL
UNIQUE(notification_log_id, receiver_id)
```

#### 11.3 飞书客户端扩展

修改 `feishu_client.py`：

- `send_interactive_card(card_json, receiver_id)` — 发送互动卡片。
- `update_card(message_id, new_card_json)` — 更新已发送卡片。
- 卡片模板通过飞书 Card Builder 创建，运行时传入模板变量。

#### 11.4 通知服务扩展

修改 `notification_service.py`：

- `send_notification` 中，`require_completion = True` 时调用 `send_interactive_card`。
- 发送前查询 `feishu_notification_completions` 过滤已完成用户。
- 群聊中过滤已完成成员的 @mention。
- 卡片 JSON 中嵌入 `notification_log_id`。

#### 11.5 回调端点

修改 `router.py`，新增：

- `POST /api/v1/feishu/callbacks/card-action` — 接收飞书按钮点击回调，写库并返回新卡片。
- `GET /api/v1/feishu/notifications/{id}/completions` — 查询完成状态。

#### 11.6 前端组件扩展

修改 `FeishuMessageActionConfig.vue`：

- 新增"要求标记完成" `el-switch` 开关。
- 开关打开时展示按钮文案输入框。
- 提示文字："开启后消息将包含标记按钮，已完成用户下次不再收到通知"。

#### 11.7 飞书后台配置

- 订阅 `card.action.trigger` 事件。
- 回调 URL：`https://{domain}/api/v1/feishu/callbacks/card-action`。
- 使用 Card Builder 创建卡片模板。

### 验收

- 配置 `require_completion = True` 的通知发送互动卡片。
- 用户点击按钮后，数据库记录完成状态（幂等）。
- 私聊按钮变灰，群聊更新进度条。
- 下次触发时已完成用户不再收到消息。
- 群聊中已完成成员的 @ 被正确过滤。
- 卡片过期（14 天）后按钮自动失效。

### 前置条件

| 条件 | 说明 |
|------|------|
| 公网可达回调 URL | 飞书需 POST 到你的服务器 |
| 自建应用 | 商店应用不支持卡片回调 |
| 事件订阅 | `card.action.trigger` |
| 卡片模板 | 通过 Card Builder 创建 |

---

## 3. 推荐开发顺序汇总

```text
Step 0  Scheduler 边界固化
Step 1  飞书消息 Action 后端
Step 2  飞书消息 Action 前端组件
Step 3  报表 report_run handler 复用 Scheduler
Step 4  标准事件发布 MVP
Step 5  自动化规则后端 MVP
Step 6  自动化规则前端编辑器 MVP
Step 7  AI Capability 注册
Step 8  AI 生成 AutomationRule Artifact
Step 9  AI Artifact 预览编辑确认
Step 10  端到端验收
Step 11  飞书消息标记完成功能
```

## 4. 一期建议交付边界

一期必须交付：

- 飞书消息动作。
- Scheduler 复用边界。
- 报表运行成功 / 失败事件。
- 自动化规则 MVP。
- 全局 AI 对话生成规则草稿。
- 用户确认保存。

二期建议交付（Step 11）：

- 飞书消息标记完成功能（互动卡片 + 回调机制）。

一期暂不交付：

- 复杂条件分支。
- 可视化流程画布。
- 自动创建飞书文档。
- 动作间复杂数据映射。
- 失败自动重试队列。
- 频控和重复通知抑制。
- 多租户级规则市场。
