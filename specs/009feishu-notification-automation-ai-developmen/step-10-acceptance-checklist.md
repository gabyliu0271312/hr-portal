# Step 10：端到端验收清单

## 验收目标

验证飞书通知 + 自动化规则 + AI 全局对话的完整流程。

## 前置条件

1. 后端服务已启动
2. 前端开发服务器已启动
3. 飞书 OpenAPI 配置正确（APP_ID、APP_SECRET）
4. 数据库已运行 migration（0047、0048）
5. 有测试报表可运行

## 场景 A：手动配置规则并触发

### A1. 创建自动化规则

1. 打开前端，访问 `/automation/rules`
2. 点击"创建规则"
3. 输入规则名称：`测试报表成功通知`
4. 选择触发器：`报表运行成功`
5. 添加动作：
   - 动作类型：发送飞书消息
   - 接收人：指定用户（输入测试用户）
   - 消息模板：`报表 {{trigger_event.biz_name}} 运行成功，共 {{payload.total_rows}} 行`
   - 消息格式：Markdown
6. 点击"预览消息"，确认预览内容正确
7. 点击"创建规则"
8. 在规则列表中，点击"启用"

✅ **预期结果**：
- 规则创建成功
- 规则状态为"已启用"

### A2. 手动运行报表触发规则

1. 打开报表列表，选择一个测试报表
2. 点击"运行"按钮
3. 等待报表运行完成

✅ **预期结果**：
- 报表运行成功
- 自动化规则被触发
- 接收人收到飞书消息
- 消息内容包含报表名称和行数

### A3. 查看执行记录

1. 访问 `/automation/executions`
2. 查看执行记录

✅ **预期结果**：
- 执行记录存在
- 状态为 `success`
- 动作执行状态为 `success`

## 场景 B：定时任务触发

### B1. 创建定时报表任务

1. 打开报表，配置定时运行（Scheduler job）
2. 设置 cron 表达式（如每天 9:00）
3. 等待定时任务触发

✅ **预期结果**：
- 定时任务触发
- 报表运行成功
- `scheduled_report_success` 事件发布
- 自动化规则触发
- 接收人收到飞书消息

## 场景 C：AI 全局对话创建

### C1. 通过 AI 创建规则

1. 点击右下角 AI 助手图标
2. 输入：`当报表运行成功后，发飞书消息给薪酬组群，附上报表链接`
3. 等待 AI 生成草稿

✅ **预期结果**：
- AI 返回规则草稿预览
- 预览组件显示触发器、动作、消息预览
- 如果信息不足，AI 会追问

### C2. 确认保存规则

1. 在预览组件中，点击"确认保存"
2. 跳转到规则编辑页面

✅ **预期结果**：
- 规则保存成功
- 规则来源显示为"AI 生成"
- 可以手动启用规则

## 场景 D：权限与安全

### D1. 无权限用户创建规则失败

1. 使用无权限用户登录
2. 尝试访问自动化规则页面
3. 尝试创建规则

✅ **预期结果**：
- 页面返回 403 或无权限提示
- 无法通过 API 创建规则

### D2. AI 不能直接发送正式飞书消息

1. 通过 AI 对话
2. 尝试让 AI 直接发送飞书消息（不创建规则）

✅ **预期结果**：
- AI 只会生成草稿，不会直接发送消息
- 需要用户确认保存后，规则才会执行

### D3. 敏感字段不能进入消息正文

1. 创建规则，消息模板中包含敏感字段（如 `employee.salary`）
2. 触发规则

✅ **预期结果**：
- 消息中不包含敏感字段
- 或者系统抛出异常

## 故障排查

### 问题 1：规则未触发

**排查步骤**：
1. 检查规则是否已启用
2. 检查触发器类型是否匹配（如 `report_run_success`）
3. 检查自动化引擎日志（`automation.engine`）
4. 检查事件发布日志（`automation.events`）

**可能原因**：
- 规则未启用
- 触发器类型不匹配
- 事件未发布
- 自动化引擎异常

### 问题 2：飞书消息未收到

**排查步骤**：
1. 检查飞书客户端配置（APP_ID、APP_SECRET）
2. 检查接收人配置是否正确
3. 检查飞书消息发送日志（`feishu_notification_logs` 表）
4. 检查动作执行日志（`automation_action_executions` 表）

**可能原因**：
- 飞书配置错误
- 接收人解析失败
- 消息发送失败（token 过期、API 限流等）

### 问题 3：AI 生成草稿失败

**排查步骤**：
1. 检查 AI 模型配置
2. 检查 Capability 注册（`GET /api/v1/ai/capabilities`）
3. 检查 LLM extractor 日志

**可能原因**：
- AI 模型未配置
- Capability 未注册
- LLM 提取失败

## 数据库检查

### 检查规则表

```sql
SELECT * FROM automation_rules WHERE enabled = true;
```

### 检查执行日志

```sql
SELECT * FROM automation_executions ORDER BY created_at DESC LIMIT 10;
```

### 检查动作执行日志

```sql
SELECT * FROM automation_action_executions ORDER BY created_at DESC LIMIT 10;
```

### 检查飞书发送日志

```sql
SELECT * FROM feishu_notification_logs ORDER BY created_at DESC LIMIT 10;
```

## 日志关键字

### 成功日志

- `[automation.engine] 匹配到 1 条规则`
- `[automation.engine] 规则 {id} 执行成功`
- `[feishu.send] 消息发送成功`

### 异常日志

- `[automation.engine] 规则 {id} 执行失败`
- `[feishu.send] 消息发送失败`
- `[automation.events] publish_event 异常`

## 下一步

如果所有场景验收通过，则：
1. ✅ 飞书通知 + 自动化规则 + AI 全局对话功能完成
2. 可以部署到测试环境
3. 可以编写用户文档

如果验收失败，则：
1. 根据故障排查定位问题
2. 修复代码
3. 重新验收
