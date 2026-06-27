# 飞书通知 + 自动化规则 + AI 对话 — 模拟验收测试用例

> **环境**: 测试环境（后端 + 前端 + PostgreSQL）  
> **前置条件**: 已完成数据库迁移（0047、0048），后端和前端服务已启动

---

## 场景 A：手动配置规则 → 运行报表 → 收到飞书消息

### A1. 创建自动化规则

**步骤**:
1. 打开前端页面 `http://localhost:5173/automation/rules`
2. 点击"创建规则"
3. 填写：
   - 规则名称：`报表运行成功通知`
   - 描述：`当报表运行成功后，发送飞书通知`
   - 触发器：`scheduled_report_success`
   - 动作类型：`feishu_send_message`
4. 配置飞书消息：
   - 接收人：选择"指定用户"，输入 `demo_user_1`
   - 消息模板：`报表 {{ trigger_event.biz_name }} 运行成功！时间：{{ trigger_event.timestamp }}`
   - 消息格式：`text`
5. 点击"保存"
6. 在规则列表页，点击"启用"开关

**预期结果**:
- ✅ 规则保存成功，返回规则 ID
- ✅ 规则状态为 `enabled = true`
- ✅ 数据库 `automation_rules` 表有新记录

**API 验证**:
```bash
# 查看规则列表
curl -X GET "http://localhost:8000/api/automation/rules" \
  -H "Authorization: Bearer <token>"

# 预期响应
[
  {
    "id": 1,
    "name": "报表运行成功通知",
    "enabled": true,
    "trigger_type": "scheduled_report_success",
    "actions": [
      {
        "action_type": "feishu_send_message",
        "config": {
          "receivers": [{"fixed_users": ["demo_user_1"]}],
          "message": {
            "template": "报表 {{ trigger_event.biz_name }} 运行成功！时间：{{ trigger_event.timestamp }}",
            "format": "text"
          }
        }
      }
    ]
  }
]
```

---

### A2. 手动触发事件（模拟报表运行成功）

**步骤**:
1. 打开后端 API 文档 `http://localhost:8000/docs`
2. 找到 `POST /api/reports/{report_id}/run` 接口
3. 输入报表 ID（如 `1`），点击"Execute"
4. 观察后端日志

**预期结果**:
- ✅ 报表运行成功
- ✅ 后端日志显示：`Publishing event: scheduled_report_success`
- ✅ 自动化引擎接收到事件：`Processing event: scheduled_report_success`
- ✅ 规则匹配成功：`Rule matched: 报表运行成功通知`
- ✅ 执行动作：`Executing action: feishu_send_message`
- ✅ 飞书消息发送成功（模拟）：`Feishu message sent successfully`

**日志验证**:
```
INFO:app.automation.events:Publishing event: scheduled_report_success (biz_id=1)
INFO:app.automation.engine:Processing event: scheduled_report_success
INFO:app.automation.engine:Found 1 matching rules
INFO:app.automation.engine:Rule matched: 报表运行成功通知 (id=1)
INFO:app.automation.action_registry:Executing action: feishu_send_message
INFO:app.integrations.feishu.notification_service:Sending notification to 1 receivers
INFO:app.integrations.feishu.feishu_client:Sending text message to user: demo_user_1
INFO:app.automation.action_registry:Action executed successfully
```

---

### A3. 查看执行记录

**步骤**:
1. 打开前端页面 `http://localhost:5173/automation/executions`
2. 查看执行记录列表

**预期结果**:
- ✅ 列表显示刚才的执行记录
- ✅ 状态为 `success`
- ✅ 触发事件类型：`scheduled_report_success`
- ✅ 规则名称：`报表运行成功通知`

**API 验证**:
```bash
curl -X GET "http://localhost:8000/api/automation/executions?page=1&page_size=10" \
  -H "Authorization: Bearer <token>"

# 预期响应
{
  "items": [
    {
      "id": 1,
      "rule_id": 1,
      "rule_name": "报表运行成功通知",
      "trigger_event": {
        "event_type": "scheduled_report_success",
        "biz_id": "1"
      },
      "status": "success",
      "executed_at": "2026-06-27T15:00:00Z"
    }
  ],
  "total": 1
}
```

---

## 场景 B：定时任务触发 → 自动运行报表 → 收到飞书消息

### B1. 配置定时任务

**步骤**:
1. 打开前端页面 `http://localhost:5173/scheduler/jobs`
2. 创建定时任务：
   - 任务类型：`report_run`
   - 报表 ID：`1`
   - Cron 表达式：`0 9 * * *`（每天 9 点）
   - 启用：是

**预期结果**:
- ✅ 定时任务创建成功
- ✅ 任务状态为 `active`

---

### B2. 手动触发定时任务（模拟定时执行）

**步骤**:
1. 打开后端 API 文档 `http://localhost:8000/docs`
2. 找到 `POST /api/scheduler/jobs/{job_id}/run`
3. 输入任务 ID，点击"Execute"

**预期结果**:
- ✅ 任务执行成功
- ✅ 后端日志显示：`Running job: report_run`
- ✅ 报表运行成功
- ✅ 发布事件：`scheduled_report_success`
- ✅ 自动化规则触发
- ✅ 飞书消息发送成功

---

## 场景 C：AI 对话生成规则草稿 → 确认保存 → 规则生效

### C1. AI 生成规则草稿

**步骤**:
1. 打开全局 AI 助手（右下角魔法棒图标）
2. 输入：`当报表运行成功后，发飞书消息给薪酬组群，附上报表链接`
3. 点击发送

**预期结果**:
- ✅ AI 识别意图：`automation.rule.create_draft`
- ✅ LLM 提取槽位：
  - `trigger_type`: `scheduled_report_success`
  - `action_type`: `feishu_send_message`
  - `feishu_receivers`: `薪酬组群`
  - `feishu_message_template`: `附上报表链接`
- ✅ 返回草稿 Artifact：
  ```json
  {
    "artifact_type": "automation_rule",
    "name": "报表运行成功后通知薪酬组群",
    "trigger_type": "scheduled_report_success",
    "actions": [
      {
        "action_type": "feishu_send_message",
        "config": {
          "receivers": [{"fixed_chats": ["薪酬组群"]}],
          "message": {
            "template": "报表运行成功！{{ trigger_event.biz_name }} 已就绪。"
          }
        }
      }
    ]
  }
  ```
- ✅ 前端展示 `AutomationRuleArtifactPreview` 组件

---

### C2. 确认保存草稿

**步骤**:
1. 在 `AutomationRuleArtifactPreview` 组件中，点击"确认保存"
2. 观察前端提示

**预期结果**:
- ✅ 调用 `POST /api/automation/rules`
- ✅ 规则保存成功
- ✅ 提示"规则已保存，是否启用？"
- ✅ 点击"启用"，调用 `POST /api/automation/rules/{id}/enable`
- ✅ 规则状态为 `enabled = true`

---

### C3. 验证规则生效

**步骤**:
1. 打开自动化规则列表页 `http://localhost:5173/automation/rules`
2. 查看刚才保存的规则

**预期结果**:
- ✅ 规则显示在列表中
- ✅ 状态为"已启用"
- ✅ 手动触发事件（参考场景 A2），验证规则生效

---

## 场景 D：权限校验 → 无权限用户不能创建规则

### D1. 无权限用户尝试创建规则

**步骤**:
1. 使用无权限用户登录（没有 `automation.rule.create` 权限）
2. 打开自动化规则列表页
3. 尝试点击"创建规则"

**预期结果**:
- ❌ 按钮置灰或隐藏
- ❌ 如果强行调用 API，返回 `403 Forbidden`

**API 验证**:
```bash
curl -X POST "http://localhost:8000/api/automation/rules" \
  -H "Authorization: Bearer <token_without_permission>" \
  -H "Content-Type: application/json" \
  -d '{"name": "测试规则", "trigger_type": "scheduled_report_success"}'

# 预期响应
{
  "detail": "Permission denied: automation.rule.create"
}
```

---

## 验收检查清单

| 场景 | 测试用例 | 状态 | 备注 |
|------|---------|------|------|
| **场景 A** | A1. 创建自动化规则 | ⬜ | |
| | A2. 手动触发事件 | ⬜ | |
| | A3. 查看执行记录 | ⬜ | |
| **场景 B** | B1. 配置定时任务 | ⬜ | |
| | B2. 手动触发定时任务 | ⬜ | |
| **场景 C** | C1. AI 生成规则草稿 | ⬜ | |
| | C2. 确认保存草稿 | ⬜ | |
| | C3. 验证规则生效 | ⬜ | |
| **场景 D** | D1. 权限校验 | ⬜ | |

---

## 常见问题排查

### 1. 规则不触发

**排查步骤**:
1. 检查规则是否启用（`enabled = true`）
2. 检查触发器类型是否正确
3. 检查事件是否正确发布（查看后端日志）
4. 检查自动化引擎是否正常运行

**调试命令**:
```bash
# 查看规则详情
curl -X GET "http://localhost:8000/api/automation/rules/1" \
  -H "Authorization: Bearer <token>"

# 手动发布事件（测试用）
curl -X POST "http://localhost:8000/api/automation/test/trigger" \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"event_type": "scheduled_report_success", "biz_id": "1"}'
```

---

### 2. 飞书消息未收到

**排查步骤**:
1. 检查接收人配置是否正确
2. 检查飞书凭证是否有效
3. 检查 `feishu_notification_logs` 表是否有发送记录
4. 查看后端日志，确认是否有错误

**调试命令**:
```bash
# 查看发送日志
curl -X GET "http://localhost:8000/api/feishu/notifications/logs?limit=10" \
  -H "Authorization: Bearer <token>"

# 手动测试发送消息
curl -X POST "http://localhost:8000/api/feishu/notifications/test" \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "receivers": [{"fixed_users": ["demo_user_1"]}],
    "message": {"template": "测试消息"}
  }'
```

---

### 3. AI 对话未识别意图

**排查步骤**:
1. 检查 `ai/capabilities.py` 中 `automation.rule.create_draft` 是否已注册
2. 检查 `ai/router.py` 中 `CHAT_ROUTES` 是否包含该路由
3. 查看后端日志，确认 LLM 是否正确提取槽位

**调试方法**:
- 在 `router.py` 的 `_extract_automation_rule_request` 函数中添加日志
- 检查 LLM 返回的 JSON 是否符合预期

---

## 验收通过标准

✅ **所有场景测试通过**，且：
1. 规则创建、启用、禁用功能正常
2. 事件发布和自动化引擎运行正常
3. 飞书消息发送成功（或模拟成功）
4. AI 对话生成草稿功能正常
5. 权限校验正常工作
6. 执行记录正确保存和展示

✅ **代码质量**:
- 后端 Python 语法检查通过
- 前端 TypeScript 类型检查通过
- 无明显逻辑错误

✅ **文档完整**:
- API 文档完整（`/docs`）
- 代码注释清晰
- 部署指南详细

---

**验收人**: ___________  
**验收日期**: ___________  
**验收结果**: □ 通过  □ 不通过  

**备注**:  
___________

