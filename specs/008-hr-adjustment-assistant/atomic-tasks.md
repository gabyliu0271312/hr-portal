# HR 组织与人员调整智能助手开发文档

> 文档类型：原子级开发任务文档  
> 版本：V1.0  
> 日期：2026-07-17  
> 实施定位：HR Agent 业务场景能力 + HR Adjustment 业务台账 + UCP 受控执行  
> 关联文档：`PRD-方案一-传统程序实现.md`、`../../HR-Agent建设方案-专家修订版.md`、`../011-universal-connector-platform/implementation-plan.md`  
> 任务状态：`[ ]` 未开始、`[x]` 已完成、`[!]` 阻塞  
> 说明：本文件是后续开发的执行依据；旧 `tasks.md` 仅保留历史参考，不再作为实施基线。

## 0. 与 HR Agent 总体方案的关系

本需求是 HR Agent 的第一个完整高风险业务写场景。父方案为 `../../HR-Agent建设方案-专家修订版.md`，AI 公共协议和真实状态以 `../004-ai-native-workbench/` 为准，外部执行底座以 `../011-universal-connector-platform/implementation-plan.md` 为准。

开发边界：

- 本文不重建通用 Capability Runtime、ChatRoute、会话、审计、Context Packet、UCP 或飞书基础设施；
- 本需求先补齐公共 Runtime 的最小缺口，再实现调整业务域；
- 公共改动必须保持补偿金、权限解释、自动化、数据对账等现有 ChatRoute 兼容；
- 后续 HR Agent 指标、分析和图表能力直接复用本次收口结果；
- 公式/计算字段是 AI 底座首个技术验证场景，本需求是 HR Agent 首个完整高风险业务场景，两者口径不冲突。

当前权威顺序：阶段 0A 公共主链收口 → 阶段 0B 北森 + UCP 技术切片 → 阶段 1 Web 闭环 → 阶段 2 UCP 预演/审批/执行 → 阶段 3 飞书入口。

## 1. 背景与目标

### 1.1 背景

HRBP 每月通过邮件、聊天或口头方式向 SSC 提交人员调动、汇报关系变更及组织调整需求。SSC 需要人工识别人员、组织、上级、生效日期，再逐条录入北森，存在信息分散、重名误判、截止时间遗漏、重复提报、执行错误和审计链不完整等问题。

HR Portal 已具备以下基础能力：

- AI Capability 注册、对话会话、策略守卫、结构校验和审计；
- 用户、角色、菜单权限、数据范围和字段脱敏；
- UCP System、Resource、Credential、Pipeline、Step Run、审批、限流、重试、监控和外部 ID 映射；
- 飞书消息发送、互动卡片和用户 `feishu_user_id` 映射；
- 北森数据读取、员工实时花名册和组织树。

本需求不得重复建设上述基础设施。

### 1.2 目标

1. HRBP 可在 HR Portal Web 端用自然语言提交调整需求。
2. 系统把自然语言转换为结构化调整草稿，并以本地权威数据校验人员、组织和上级。
3. 遇到重名、模糊组织、缺失字段或冲突时必须让用户选择或补充，不允许模型猜测。
4. 提报人逐条确认后形成批次，SSC 在业务清单中复核并提交审批或执行。
5. 外部系统写操作统一通过 UCP Pipeline 执行，复用凭证、审批、限流、重试、Step Run、监控和审计。
6. Web 与飞书共享同一业务服务、状态机、输入输出 Schema 和权限规则。
7. 从原始表达、歧义处理、提报确认、SSC 复核到外部执行均可通过 trace_id 追溯。

### 1.3 非目标 / 不做范围

本期不做：

- 独立微服务、独立数据库、微前端或独立认证中心；
- 新建 Agent SDK、WorkflowOrchestrator、审批引擎、北森通用网关、飞书消息 SDK；
- LLM 自主调用北森写接口或直接改变正式业务状态；
- 语音输入、移动端独立 APP、离职预测、归因分析和通用 RAG；
- 以飞书文档作为业务真理源；
- 自动选择重名候选、自动越过提报人确认或 SSC 复核；
- 对已成功的外部写操作做未经北森能力验证的自动回滚；
- V1 首批上线同时开放组织新增、更名和停用。V1 先上线人员调动与纯汇报关系变更，组织调整在 V2 开启。

### 1.4 架构边界

| 层 | 职责 | 不负责 |
|---|---|---|
| HR Agent Runtime | 意图识别、结构化 Plan、Capability 路由、统一结果、脱敏和 AI 审计 | 不直接执行外部写操作 |
| `hr_adjustment` 业务域 | 会话关联、草稿、歧义、业务校验、批次、提报确认、SSC 复核、业务待办和状态 | 不保存外部凭证明文，不实现通用重试/限流 |
| UCP | 北森资源、凭证、审批、预演、执行、限流、重试、Step Run、外部 ID 映射和监控 | 不决定调整业务规则，不替代调整清单 |
| 飞书集成 | 消息接收、发送、互动卡片、用户映射和提醒 | 不保存唯一业务状态 |
| 北森 | 最终人事和组织变更的权威执行系统 | 不承担 Portal 内提报协作 |

## 2. 用户场景

### 2.1 HRBP：自然语言提报

- 入口：任意 Portal 页面右下角全局 AI 助手，选择“组织与人员调整”；后续可从飞书私聊或群聊 @机器人进入。
- 操作：输入“把赵六调到研发一部，上级改为钱七，7 月 1 日生效”。
- 系统反馈：返回结构化草稿，显示员工工号、当前组织、目标组织、新上级、生效日期和归属月份。
- 成功结果：HRBP 确认后，条目进入 `submitter_confirmed`；全部条目确认后可提交为调整批次。
- 失败/空态：未找到员工或组织时提示检查名称并保留原输入；不得生成可执行条目。
- 歧义态：重名或模糊组织时列出候选，等待用户选择；不得默认选第一项。
- 无权限：提示“您无权提报该员工或组织范围的调整”，不返回无权人员的敏感信息。

### 2.2 HRBP：修改、取消和恢复会话

- 入口：AI 对话结果卡或“我的调整”列表。
- 操作：修改目标组织、生效日期或新上级；取消尚未提交的条目；刷新后继续。
- 系统反馈：每次修改重新校验实体、权限、重复提报和汇报关系循环。
- 成功结果：保存新版本并记录前后值；取消项保留审计但不进入执行批次。
- 失败表现：已进入 SSC 复核的条目不可直接修改，必须撤回批次或由 SSC 驳回。

### 2.3 SSC：复核并发起执行

- 入口：`/hr-adjustments/batches`。
- 操作：按月份、提报人、状态筛选；查看批次详情、影响范围、冲突和预演结果；批准、驳回或发起执行。
- 系统反馈：发起执行前展示人员、原组织、目标组织、新上级、生效日期、北森映射和预演结果。
- 成功结果：创建 UCP Pipeline Run；页面跳转或链接到运行详情。
- 失败表现：映射缺失、数据已变化、员工状态不符、目标组织失效时阻止执行并生成业务待办。
- 部分失败：批次标记 `partially_executed`，逐条展示已成功、失败、待重试；不得把已成功条目伪装为整体失败。

### 2.4 HR 负责人/审批人：高风险审批

- 入口：Portal 审批中心或飞书审批通知。
- 操作：查看脱敏后的调整摘要、影响范围、提报人、SSC 复核人和预演结果；通过或拒绝。
- 成功结果：审批通过后 UCP Pipeline 恢复执行。
- 拒绝结果：批次进入 `rejected`，记录原因并通知提报人和 SSC。
- 无权限：非审批人不能读取审批详情或执行审批动作。

### 2.5 审计/管理员：追溯和导出

- 入口：批次详情“审计记录”页签。
- 操作：按月份、提报人、人员、状态、trace_id 查询；导出授权范围内记录。
- 成功结果：可查看原始表达摘要、结构化草稿、歧义链、确认、复核、审批、UCP Run/Step Run 和外部响应摘要。
- 权限表现：未授权敏感字段隐藏或脱敏；导出权限独立校验。

### 2.6 空态、加载态和异常态统一要求

| 状态 | 表现 |
|---|---|
| 首次使用 | 展示支持范围、示例问法及“AI 只生成草稿，不会直接执行”提示 |
| 无调整记录 | 展示空态和“发起调整”按钮 |
| 加载中 | 按钮禁用并显示加载状态，禁止重复提交 |
| AI 解析失败 | 保留原输入，提示重新描述或切换结构化表单 |
| 本地数据未同步 | 显示数据最后同步时间，生成待办但不允许执行 |
| UCP 不可用 | 业务草稿和确认不丢失；执行按钮禁用，提示稍后重试 |
| 北森超时 | 展示 UCP Run 状态和重试入口，不重复创建业务条目 |

## 3. 功能范围

| 功能项 | 是否本期实现 | 说明 |
|---|---|---|
| Web 自然语言提报 | 是，V1 | 复用全局 AI 助手 |
| 人员调动 | 是，V1 | 目标组织可变，可同时变更上级 |
| 纯汇报关系变更 | 是，V1 | 通过北森人员调动接口，目标部门传当前部门 |
| 员工/组织/上级实体校验 | 是，V1 | 只使用权限过滤后的本地权威数据 |
| 重名和模糊组织反问 | 是，V1 | 不允许自动选择 |
| 分月规则 | 是，V1 | 采用可配置截止日，正式值待业务确认 |
| 提报人逐条确认 | 是，V1 | 缺生效日期不得确认 |
| 调整批次和 SSC 复核 | 是，V1 | 业务页面完成 |
| UCP 预演和正式执行 | 是，V1 | 先完成人员写接口技术切片 |
| 业务待办 | 是，V1 | 缺字段、歧义超时、映射缺失、预检失败 |
| 全链路审计 | 是，V1 | 业务日志 + AI trace + UCP Run |
| 飞书提醒与确认卡片 | 是，V1.1 | Web 稳定后接入，复用现有飞书客户端 |
| 飞书文档归档 | 否，V1 | V2 可选；不作为真理源 |
| 组织新增、更名、停用 | 否，V1；是，V2 | 需额外映射、影响分析和测试验证 |
| 多类型调整依赖排序 | V2 | 组织调整开放后使用 UCP Pipeline DAG |
| 自动生产回滚 | 否 | 仅提供补偿任务和人工决策 |

## 4. 技术设计

### 4.1 数据库 / 数据模型

#### 4.1.1 模型原则

- 使用 PostgreSQL、SQLAlchemy 2.0 async 和 Alembic；禁止裸 MySQL DDL。
- 业务表只保存业务真相和 UCP 关联 ID，不复制凭证、限流、重试和完整外部执行日志。
- `AiConversation` 继续保存在 PostgreSQL；V1 不新增 Redis 会话真理源。
- 所有用户引用保存 `user_id`，姓名仅作历史快照。
- 所有时间使用 `TIMESTAMPTZ` 存 UTC，前端统一按 Asia/Shanghai 展示。

#### 4.1.2 `hr_adjustment_session`

| 字段 | 类型 | 约束/默认值 | 说明 |
|---|---|---|---|
| id | BIGINT | PK | 会话业务 ID |
| conversation_id | BIGINT | FK `ai_conversations.id`，UNIQUE | 复用 AI 会话 |
| user_id | BIGINT | FK `users.id`，NOT NULL | 会话所有人 |
| channel | VARCHAR(16) | `web` | web/feishu |
| active_batch_id | BIGINT | nullable | 当前草稿批次 |
| created_at/updated_at | TIMESTAMPTZ | NOT NULL | 时间 |

索引：`user_id, updated_at DESC`。

#### 4.1.3 `hr_adjustment_batch`

| 字段 | 类型 | 约束/默认值 | 说明 |
|---|---|---|---|
| id | BIGINT | PK | 批次 ID |
| batch_no | VARCHAR(32) | UNIQUE, NOT NULL | 可读编号 |
| target_month | CHAR(7) | NOT NULL | YYYY-MM |
| status | VARCHAR(32) | `collecting` | 见状态机 |
| submitter_user_id | BIGINT | FK users | 提报人 |
| submitter_name_snapshot | VARCHAR(128) | NOT NULL | 历史展示 |
| submitted_at | TIMESTAMPTZ | nullable | 提交 SSC 时间 |
| reviewer_user_id | BIGINT | nullable | SSC 复核人 |
| reviewed_at | TIMESTAMPTZ | nullable | 复核时间 |
| review_comment | TEXT | nullable | 驳回/复核意见 |
| approval_request_id | BIGINT | nullable | UCP 审批请求 |
| ucp_pipeline_run_id | VARCHAR(64) | nullable, UNIQUE | UCP 执行实例 |
| trace_id | VARCHAR(64) | NOT NULL, index | 全链路追踪 |
| version | INTEGER | `1` | 乐观锁版本 |
| created_at/updated_at | TIMESTAMPTZ | NOT NULL | 时间 |

状态：`collecting/submitted/under_review/approved/rejected/ready_to_execute/executing/partially_executed/executed/closed/cancelled`。

索引：

- `(target_month, status)`；
- `(submitter_user_id, created_at DESC)`；
- `(reviewer_user_id, status)`；
- `trace_id`。

#### 4.1.4 `hr_adjustment_item`

| 字段 | 类型 | 约束/默认值 | 说明 |
|---|---|---|---|
| id | BIGINT | PK | 条目 ID |
| batch_id | BIGINT | FK batch, ON DELETE RESTRICT | 所属批次 |
| item_no | INTEGER | NOT NULL | 批次内序号 |
| action_type | VARCHAR(32) | NOT NULL | transfer/manager_change；V2 增加 org_create/org_rename/org_disable |
| employee_no | VARCHAR(64) | nullable | 人员工号 |
| employee_name_snapshot | VARCHAR(128) | nullable | 姓名快照 |
| from_org_code | VARCHAR(64) | nullable | 当前组织编码 |
| from_org_name_snapshot | VARCHAR(255) | nullable | 当前组织名称 |
| to_org_code | VARCHAR(64) | nullable | 目标组织编码 |
| to_org_name_snapshot | VARCHAR(255) | nullable | 目标组织名称 |
| new_manager_employee_no | VARCHAR(64) | nullable | 新上级工号 |
| new_manager_name_snapshot | VARCHAR(128) | nullable | 上级姓名 |
| effective_date | DATE | nullable | draft 可空，确认前必填 |
| source_text | TEXT | NOT NULL | 用户原始表达；读取受权限控制 |
| normalized_payload | JSONB | NOT NULL | 结构化草稿，不含凭证 |
| status | VARCHAR(32) | `draft` | 条目业务状态 |
| confirmed_at | TIMESTAMPTZ | nullable | 提报确认时间 |
| confirmed_by | BIGINT | nullable | 必须等于批次提报人或授权代理人 |
| ucp_step_run_id | VARCHAR(64) | nullable, index | 对应 UCP 步骤 |
| external_result_code | VARCHAR(64) | nullable | 脱敏后的结果码 |
| error_summary | TEXT | nullable | 脱敏错误摘要 |
| version | INTEGER | `1` | 乐观锁 |
| created_at/updated_at | TIMESTAMPTZ | NOT NULL | 时间 |

状态：`draft/needs_information/ready_for_confirmation/submitter_confirmed/submitter_cancelled/ready_for_review/review_rejected/ready_for_execution/executing/executed/failed/retry_pending/skipped/obsolete`。

约束：

- UNIQUE `(batch_id, item_no)`；
- `submitter_confirmed` 及之后状态必须具有 `effective_date`，由 service 强制并通过数据库 CHECK 尽可能约束；
- V1 的 `action_type` 只允许 transfer/manager_change；
- 同一批次、同一员工只能存在一条非取消、非 obsolete 条目。

#### 4.1.5 `hr_adjustment_ambiguity`

| 字段 | 类型 | 约束 | 说明 |
|---|---|---|---|
| id | BIGINT | PK | 记录 ID |
| item_id | BIGINT | FK item | 调整条目 |
| field_name | VARCHAR(64) | NOT NULL | employee/to_org/new_manager 等 |
| query_value | VARCHAR(255) | NOT NULL | 原始值 |
| candidates | JSONB | NOT NULL | 仅保存用户有权限看到的最小候选信息 |
| selected_value | JSONB | nullable | 用户选择 |
| status | VARCHAR(16) | `open` | open/resolved/expired/cancelled |
| round_no | INTEGER | `1` | 反问轮次 |
| expires_at | TIMESTAMPTZ | NOT NULL | 超时时间 |
| resolved_by | BIGINT | nullable | 处理人 |
| resolved_at | TIMESTAMPTZ | nullable | 处理时间 |
| created_at | TIMESTAMPTZ | NOT NULL | 创建时间 |

索引：`(status, expires_at)`、`item_id`。

#### 4.1.6 `hr_adjustment_todo`

| 字段 | 类型 | 约束 | 说明 |
|---|---|---|---|
| id | BIGINT | PK | 待办 ID |
| batch_id/item_id | BIGINT | 至少一个非空 | 关联业务对象 |
| todo_type | VARCHAR(32) | NOT NULL | ambiguity_timeout/missing_field/mapping_missing/precheck_failed/review_required/retry_required |
| assigned_user_id | BIGINT | FK users | 待办人 |
| assigned_name_snapshot | VARCHAR(128) | NOT NULL | 姓名快照 |
| description | TEXT | NOT NULL | 脱敏描述 |
| due_at | TIMESTAMPTZ | nullable | 截止时间 |
| status | VARCHAR(16) | `open` | open/in_progress/resolved/expired/cancelled |
| resolution | TEXT | nullable | 处理结果 |
| resolved_at | TIMESTAMPTZ | nullable | 完成时间 |
| created_at/updated_at | TIMESTAMPTZ | NOT NULL | 时间 |

索引：`(assigned_user_id, status, due_at)`；同一 item + todo_type 仅允许一个 open/in_progress 待办。

#### 4.1.7 `hr_adjustment_event`

保存业务状态变化，不替代 AI 审计和 UCP Step Run。

| 字段 | 类型 | 说明 |
|---|---|---|
| id | BIGINT PK | 事件 ID |
| batch_id/item_id | BIGINT nullable | 关联对象 |
| event_type | VARCHAR(64) | draft_created/item_modified/confirmed/submitted/reviewed/execution_started 等 |
| actor_user_id | BIGINT nullable | 操作人 |
| actor_name_snapshot | VARCHAR(128) | 姓名快照 |
| channel | VARCHAR(16) | web/feishu/system |
| before_snapshot/after_snapshot | JSONB nullable | 脱敏后的必要前后值 |
| trace_id | VARCHAR(64) | 追踪 ID |
| created_at | TIMESTAMPTZ | 时间 |

#### 4.1.8 Migration 与兼容

- 新建一个 Alembic migration，创建上述六张表、外键、索引、唯一约束和 CHECK。
- 新表上线不修改现有业务表，不需要迁移旧数据。
- downgrade 按外键依赖倒序删除表和索引；不得删除 `AiConversation`、UCP 或用户表。
- 生产升级前先执行 migration dry run；升级失败必须保持事务回滚。
- 旧 `tasks.md` 中建议的四表结构不得直接落库。

### 4.2 后端接口

统一前缀：`/api/v1/hr-adjustments`。所有响应包含 `trace_id`。错误返回：

```json
{
  "code": "ADJUSTMENT_INVALID_STATE",
  "message": "当前状态不允许确认",
  "details": {},
  "trace_id": "trace_xxx"
}
```

#### 4.2.1 AI 对话入口

`POST /api/v1/ai/chat`，复用现有接口。

Request 增量：

```json
{
  "conversation_id": 123,
  "message": "把赵六调到研发一部，上级改成钱七，7月1日生效",
  "capability_id": "hr.adjustment.collect",
  "channel": "web"
}
```

Response 中 `result` 使用统一结构：

```json
{
  "type": "adjustment_draft",
  "capability_id": "hr.adjustment.collect",
  "status": "requires_confirmation",
  "session_id": 10,
  "batch_id": 20,
  "items": [],
  "ambiguities": [],
  "missing_fields": [],
  "permission": {"filtered": true, "note": "已按数据范围过滤"},
  "masking": {"applied": true},
  "trace_id": "trace_xxx"
}
```

权限：`tools.hr_adjustment:V`。  
错误：400 Schema 错误；403 无入口或数据范围权限；409 会话/版本冲突；422 无法解析；503 AI Provider 不可用。

#### 4.2.2 批次接口

| URL | Method | 用途 | 权限 |
|---|---|---|---|
| `/batches` | GET | 查询批次 | `tools.hr_adjustment:V` + 数据范围 |
| `/batches/{id}` | GET | 批次详情 | 同上 |
| `/batches/{id}/submit` | POST | 提交 SSC 复核 | `tools.hr_adjustment:U` |
| `/batches/{id}/withdraw` | POST | 复核前撤回 | 提报人本人 + U |
| `/batches/{id}/review` | POST | SSC 通过/驳回 | `tools.hr_adjustment_review:U` |
| `/batches/{id}/preflight` | POST | 创建或刷新 UCP 预演 | `tools.hr_adjustment_execute:E` |
| `/batches/{id}/execute` | POST | 发起 UCP 正式执行 | `tools.hr_adjustment_execute:E` |
| `/batches/{id}/audit` | GET | 查询审计链 | `tools.hr_adjustment_audit:V` |

查询参数：`target_month/status/submitter_user_id/employee_no/page/page_size`。`page_size` 最大 200。

Review Request：

```json
{"decision":"approve|reject","comment":"说明","version":3}
```

Execute Request：

```json
{
  "preflight_run_id":"run_xxx",
  "confirmation_type":"SIMPLE",
  "reason":"2026年7月月度调整",
  "version":4
}
```

状态码：

- 200 查询/同步动作成功；
- 201 创建 UCP run；
- 400 参数或业务规则错误；
- 403 无权限；
- 404 批次不存在或在权限范围外；
- 409 状态、版本、重复执行或预演已过期；
- 422 映射缺失/数据预检失败；
- 502 北森调用错误；
- 503 UCP 不可用。

#### 4.2.3 条目接口

| URL | Method | 用途 | 权限 |
|---|---|---|---|
| `/items/{id}` | PATCH | 修改草稿 | 提报人本人 + U |
| `/items/{id}/confirm` | POST | 提报人确认 | 提报人本人 + U |
| `/items/{id}/cancel` | POST | 取消草稿 | 提报人本人 + U |
| `/items/{id}/ambiguities/{ambiguity_id}/resolve` | POST | 选择候选 | 提报人本人 + U |
| `/items/{id}/retry` | POST | 失败项重试 | `tools.hr_adjustment_execute:E` |

PATCH Request 仅允许业务字段：

```json
{
  "to_org_code":"D-101",
  "new_manager_employee_no":"10011",
  "effective_date":"2026-07-01",
  "version":2
}
```

禁止客户端直接修改 `status`、`confirmed_by`、`ucp_step_run_id`、`trace_id`。

Resolve Request：

```json
{"candidate_id":"employee:10011","version":2}
```

#### 4.2.4 待办接口

| URL | Method | 用途 | 权限 |
|---|---|---|---|
| `/todos` | GET | 我的/授权范围待办 | `tools.hr_adjustment:V` |
| `/todos/{id}` | GET | 待办详情 | 同上 |
| `/todos/{id}/claim` | POST | 认领 | 指定人或 SSC |
| `/todos/{id}/resolve` | POST | 处理完成 | 指定人或 SSC |
| `/todos/{id}/cancel` | POST | 取消 | 管理员或系统规则 |

Resolve Request：

```json
{"resolution":"已补齐北森组织映射","item_patch":{},"version":1}
```

服务端必须在同一事务中更新待办和关联业务对象。

#### 4.2.5 执行状态查询

`GET /batches/{id}/execution` 返回：

```json
{
  "batch_status":"partially_executed",
  "pipeline_run_id":"run_xxx",
  "ucp_status":"PARTIAL_SUCCESS",
  "items":[
    {"item_id":1,"step_run_id":"step_x","status":"executed","error_summary":null}
  ],
  "run_url":"/ucp/runs/run_xxx",
  "trace_id":"trace_xxx"
}
```

不得把 UCP 完整敏感 input/output 原样转发给普通 HRBP。

### 4.3 业务逻辑

#### 4.3.1 Capability 与 Runtime

注册：

- `hr.adjustment.collect`：自然语言转结构化草稿；medium；无外部副作用；
- `hr.adjustment.resolve`：处理歧义和缺失槽位；medium；无外部副作用；
- `hr.adjustment.query`：查询本人或授权范围记录；low；无外部副作用；
- `hr.adjustment.explain`：解释状态、规则和失败原因；low；无外部副作用。

不注册可直接写北森的 AI Capability。确认、复核和执行由确定性业务 API 完成。

LLM 只输出 `AdjustmentPlan`：

```json
{
  "intent":"create_adjustment",
  "target_month_text":"7月",
  "commands":[{
    "action_type":"transfer",
    "employee_name":"赵六",
    "from_org_name":"研发二部",
    "to_org_name":"研发一部",
    "new_manager_name":"钱七",
    "effective_date":"2026-07-01"
  }]
}
```

服务端依次执行：Schema 校验 → 权限上下文 → 实体解析 → 业务规则 → 草稿落库 → 统一 Result。模型输出中的工号、组织编码、用户 ID 均不得直接采信，必须由本地查询重新解析。

#### 4.3.2 实体解析

- 员工：优先精确匹配工号；姓名唯一匹配才自动解析；重名进入 ambiguity。
- 组织：优先精确匹配 code/name；模糊结果只返回候选，不自动采用。
- 上级：必须是当前允许范围内的在职人员；不能是员工本人；不得形成汇报关系循环。
- 候选信息最小化：姓名、工号后四位或完整工号（按权限）、当前组织；不返回无关敏感字段。
- 查询必须经过 scope 过滤；不得通过裸动态 SQL 绕过权限。

#### 4.3.3 分月规则

- 使用系统参数 `HR_ADJUSTMENT_CUTOFF_DAY` 和 `HR_ADJUSTMENT_CUTOFF_INCLUSIVE_POLICY`，不得硬编码在多个模块。
- 在业务确认前，默认假设为“10 日 23:59:59 前归当月，11 日 00:00 起归下月”。
- 用户显式指定目标月份可覆盖默认值，但跨越已关闭月份时必须由 SSC 复核。
- 所有计算使用 Asia/Shanghai 业务时区。
- 规则变更只影响新草稿；已提交批次保留计算快照。

#### 4.3.4 状态机与事务

- 所有状态变化集中在 service 层，Router 不直接写 status。
- 使用 version 乐观锁；版本不一致返回 409。
- 条目确认事务：校验字段 → 权限 → 重复 → 循环关系 → 更新状态 → 写事件。
- 批次提交事务：锁定批次 → 校验所有有效条目已确认 → 状态更新 → 生成 SSC 待办 → 写事件。
- UCP 执行创建成功后再写 `ucp_pipeline_run_id`；创建失败不得把批次标记为 executing。
- UCP 回调/轮询更新必须幂等，同一 run/step 状态重复到达不得重复发送通知。

#### 4.3.5 重复与并发

- 同一目标月份、同一员工存在未关闭调整时，新条目标记冲突并要求用户选择“合并、替换草稿、取消新条目”；不得自动覆盖已提交或已执行条目。
- Execute 接口使用 batch_id + version + preflight_run_id 生成幂等键。
- 批次已存在 active pipeline run 时禁止再次执行。
- 外部请求幂等与频控由 UCP Resource/Pipeline 处理，不在业务模块再写一套。

#### 4.3.6 UCP 执行模板

V1 人员调整 Pipeline：

```text
读取批次
→ TRANSFORM 生成逐条执行上下文
→ LOOP_RESOURCE 北森实时预检
→ BRANCH 全部可执行？
   ├─ 否：生成业务待办并结束预演
   └─ 是：APPROVAL（按配置）
          → LOOP_RESOURCE 北森人员调动
          → TRANSFORM 汇总结果
          → NOTIFY 通知 SSC/提报人
```

- 预演 Pipeline 与正式执行必须区分 mode；预演不得调用写接口。
- 北森写 Resource 使用 UCP Credential；密钥不得进入调整业务表。
- 人员调动与纯上级变更共用北森人员调动 Resource；纯上级变更的目标部门使用实时反查的当前部门。
- 组织新增/更名/停用在 V2 采用独立 Resource 节点和依赖顺序，不新增 `utils/dag_sorter.py` 作为第二套编排真理源。

#### 4.3.7 待办与超时

- 歧义默认 48 小时未解决生成 `ambiguity_timeout` 待办；超时值配置化。
- 缺生效日期、缺外部 ID 映射、预检失败、审批拒绝、执行失败均生成明确类型待办。
- 定时扫描复用现有 scheduler；任务必须幂等。
- 待办处理后重新运行对应业务校验，不允许只改待办状态而不修复业务对象。

#### 4.3.8 审计

- AI 层记录原始问题摘要、归一化意图、Capability、模型输入脱敏摘要和结果。
- 业务层记录每次状态变化和前后快照。
- UCP 记录 Pipeline Run、Step Run、资源调用和脱敏输出。
- 三层统一使用 trace_id；业务页面聚合展示，不复制所有日志。
- 原始 source_text 读取、导出和审计原文查看均记操作日志。

#### 4.3.9 禁止重复建设

禁止新增：

- `beisen_gateway.py` 通用网关；
- 独立凭证表或 token 缓存；
- 独立审批表和审批状态机；
- 独立限流器、重试器、熔断器；
- 独立飞书发送 Client；
- 独立 Pipeline/Workflow 引擎；
- 独立外部 ID 映射表；
- Redis 会话真理源；
- 可由客户端直接修改状态的通用 CRUD。

### 4.4 前端与 UI/交互

#### 4.4.1 路由

| 路由 | 页面 | 主权限 |
|---|---|---|
| `/hr-adjustments` | 调整工作台首页/我的调整 | `tools.hr_adjustment` |
| `/hr-adjustments/batches` | 调整批次清单 | `tools.hr_adjustment_review` |
| `/hr-adjustments/batches/:id` | 批次详情 | 按数据范围动态判断 |
| `/hr-adjustments/todos` | 调整待办 | `tools.hr_adjustment` |

全局 AI 助手仍为轻量入口，不新建重复聊天页面。业务页面负责清单、复核、执行和审计。

#### 4.4.2 全局 AI 助手调整卡片

卡片字段：

- 调整类型；
- 员工姓名 + 工号；
- 当前组织；
- 目标组织；
- 新上级；
- 生效日期；
- 归属月份及规则说明；
- 状态和缺失字段。

按钮：`确认`、`修改`、`取消`。存在歧义时展示候选单选列表和“确认选择”；不显示可执行按钮。

交互：

- 生效日期为空时确认按钮禁用并显示字段错误；
- 修改后局部加载并重新校验；
- 防重复点击；
- 服务端版本冲突时提示刷新卡片；
- 卡片底部固定显示“AI 仅生成草稿，正式执行需人工复核”。

#### 4.4.3 我的调整页面

布局：页面标题 + 月份/状态筛选 + 批次卡片/表格 + 新建调整按钮。

表格字段：批次号、归属月份、条目数、已确认数、状态、提交时间、最近更新时间、操作。

操作：继续填写、查看详情、撤回、复制上月批次（仅复制为新草稿）。

空态：说明支持场景并提供示例问法。

#### 4.4.4 SSC 批次清单

筛选：月份、状态、提报人、员工工号、是否存在异常。

表格：批次号、月份、提报人、条目数、异常数、复核状态、执行状态、提交时间、操作。

批次详情采用页签：

1. 调整明细；
2. 预演与影响；
3. 审批信息；
4. 执行记录；
5. 审计记录。

主要按钮：`通过复核`、`驳回`、`刷新预演`、`确认执行`、`查看 UCP 运行详情`。

确认执行弹窗必须展示：

- 即将执行的条目数；
- 人员及变更摘要；
- 预演时间和有效期；
- 风险/异常；
- 执行原因必填；
- 明确说明部分成功不会自动回滚。

#### 4.4.5 待办页面

字段：类型、关联批次/员工、描述、待办人、截止时间、状态、创建时间、操作。

状态视觉：逾期为 danger tag，今日到期为 warning tag，正常为 info；不能只靠颜色，必须有文字和图标。

操作：查看关联项、认领、处理、取消。处理弹窗根据 todo_type 展示对应字段，不提供任意 JSON 编辑。

#### 4.4.6 通用状态

- 加载：骨架屏或表格 loading；
- 空态：说明原因和下一步；
- 403：权限提示，不显示敏感对象是否存在；
- 404：统一“记录不存在或您无权查看”；
- 409：提示数据已更新并提供刷新；
- 422：逐字段展示业务错误；
- 502/503：保留业务状态，提供查看运行中心或稍后重试；
- 成功：使用明确的成功消息并刷新局部数据，不整页强刷。

#### 4.4.7 响应式与可访问性

- 1366px 无核心内容横向溢出；
- 表格允许固定操作列；
- 按钮、单选候选和日期选择器可键盘操作；
- 状态不只依赖颜色；
- 所有确认弹窗具有明确标题、影响范围和取消按钮。

### 4.5 权限、安全与外部系统

#### 4.5.1 权限点

| 权限 code | 操作位 | 说明 |
|---|---|---|
| `tools.hr_adjustment` | V/C/U | 使用助手、查看和维护本人草稿 |
| `tools.hr_adjustment_review` | V/U | SSC 查看和复核授权范围批次 |
| `tools.hr_adjustment_execute` | V/E | 预演、审批后执行和失败重试 |
| `tools.hr_adjustment_audit` | V/E | 查看审计和导出 |
| `tools.hr_adjustment_admin` | V/C/U/D | 参数、规则和权限配置 |

菜单可少于权限点；执行、审计可作为页面内按钮权限，不要求独立菜单。

#### 4.5.2 数据范围

必须分别校验：

- 可见范围；
- 可提报范围；
- 可复核范围；
- 可执行范围；
- 允许的 action_type；
- 跨组织/跨法人规则；
- 与本人相关的调整规则。

入口权限不能替代行级和列级权限。实体候选查询、批次查询、导出、审计详情都必须重新应用数据范围。

#### 4.5.3 敏感数据

- 发给 LLM 的内容只包含完成解析所需的最小字段，先做权限过滤和脱敏。
- 姓名、工号、组织信息是否脱敏按角色和渠道决定；飞书群聊默认比 Web 更严格。
- 北森 Credential、Authorization、token、secret 不得进入业务表、AI prompt、前端或普通日志。
- 外部请求响应原文优先留在 UCP；业务页只显示脱敏摘要。
- 导出文件执行列级权限和脱敏，生成与下载都写审计。

现有 `ucp.masking` 主要按字段名关键词处理，开发时必须增加业务字段白名单/敏感元数据兜底，不得仅依赖关键词判断。

#### 4.5.4 SQL 和动态字段安全

- 只允许查询注册表中的员工/组织字段；禁止把 LLM 输出直接拼接为表名、列名或 SQL。
- 候选搜索使用 SQLAlchemy 参数化查询或已有安全查询服务。
- 模糊搜索设置最大候选数和超时，禁止返回全表。
- API 的 sort/filter 字段使用白名单。

#### 4.5.5 UCP/北森边界

- 北森系统、写 Resource 和 Credential 在 UCP 配置；业务模块只引用 resource/pipeline 标识。
- V1 开发前必须在北森测试环境验证人员调动、纯上级变更、频率限制、重复请求和错误码。
- UCP 通用底座“已实现”不等于北森场景已联调，技术切片未通过前禁止开放生产执行。
- 外部 ID 通过 UCP 映射服务解析，不向 `org_tree` 强塞第二套外部主键真理源。

#### 4.5.6 飞书边界

- 复用现有 `app/integrations/feishu` 消息和互动卡片能力。
- 新增的是对话消息事件接收、上下文关联和业务卡片，不重写发送 Client。
- 飞书回调必须验签、幂等并验证 open_id 对应 Portal 用户。
- 飞书文档写入不属于 V1 阻塞范围。

## 5. 原子任务清单

### 5.1 阶段进入条件

```text
Phase 0A（X0000、X0005-X0009）完成
  → 才能开发新的调整 ChatRoute 和 Handler

X0004 北森 + UCP 技术切片通过
  → 才能开发阶段 2 正式执行

阶段 1 Web 端 UAT 通过
  → 才能开发阶段 3 飞书确认卡片

V1 人员调整稳定
  → 才能开发组织新增、更名和停用
```

任何阶段不得通过先堆页面、复制 Runtime 或绕过 UCP 来规避前置风险。

### Phase 0A：现有 AI 公共主链收口

> 本阶段是公共能力收口，不是重新建设 Agent 平台。完成 X0000、X0005-X0009 后，才允许新增调整 ChatRoute。

- [ ] X0000 盘点现有 AI 主链并冻结复用边界
  - 前置任务：无。
  - 功能范围：核对 `CapabilityDefinition`、ChatRoute、LLM-first 分类、Extractor/Handler、Schema、Policy、AiConversation、Audit 和 Context Packet 的真实实现与调用链。
  - 代码交付物：更新 `../004-ai-native-workbench/current-state-and-gaps.md` 的核验结论；除非发现缺口，不修改产品代码。
  - UI 要求：不涉及 UI。
  - UCP/外部系统要求：明确 AI Workflow 复用 UCP，不新建执行引擎。
  - 测试要求：列出现有补偿金、权限解释、自动化和数据对账 Route、Capability、权限和 Handler 映射。
  - 验收标准：公共复用边界、待补协议和禁止重建项均有代码证据。
  - 完成定义：盘点结果经评审并回写 004 事实台账。

- [ ] X0005 在 ChatRoute 分发后统一校验目标 Capability 权限与 Policy
  - 前置任务：X0000。
  - 功能范围：根据 `route.capability_id` 读取目标 Capability，在 Extractor/Handler 前强制校验启用状态、`required_permission` 和 `validate_capability_policy`。
  - 代码交付物：现有 `global_ai_chat` 主链的最小收口改动和公共权限拒绝结果。
  - UI 要求：无权限时返回统一、不可枚举业务对象的提示。
  - UCP/外部系统要求：不涉及外部执行。
  - 测试要求：有权、无权、能力禁用、Policy 拒绝、会话续接到无权能力。
  - 验收标准：所有 ChatRoute 都不能绕过目标 Capability 闸；Handler 的业务数据权限仍保留。
  - 完成定义：权限矩阵和现有 Route 回归通过。

- [ ] X0006 定义 `BaseCapabilityPlan` 与 `CapabilityResultEnvelope`
  - 前置任务：X0000。
  - 功能范围：统一 Plan 公共字段、Result 的 `capability_id/result/permission/masking/trace_id` 和 Execution State。
  - 代码交付物：公共 Pydantic Schema、JSON Schema、兼容适配和示例。
  - UI 要求：保留现有 `AiChatOut` 旧字段兼容期；新增业务只消费 `result`。
  - UCP/外部系统要求：统一状态可映射 UCP Run/Step Run。
  - 测试要求：旧能力兼容、新 Envelope 校验、额外字段、错误状态、部分成功。
  - 验收标准：新增业务不得增加顶层 `adjustment` 等专属字段。
  - 完成定义：Schema、兼容测试和公共协议文档一致。

- [ ] X0007 扩展 AI 审计的实际命中能力与失败阶段
  - 前置任务：X0005、X0006。
  - 功能范围：记录 `normalized_intent`、`matched_capability_id`、`parse_mode`、权限/Policy 结果和 `failure_stage`。
  - 代码交付物：复用 `app/ai/audit.py` 和现有日志模型，不新建孤立审计表。
  - UI 要求：管理端日志可按命中能力和失败阶段定位问题。
  - UCP/外部系统要求：预留 `pipeline_run_id/step_run_id` 关联，不记录凭证和未脱敏 payload。
  - 测试要求：分类失败、Extractor 失败、权限拒绝、Handler 失败、成功链路。
  - 验收标准：trace_id 可定位实际业务 Capability 和失败位置。
  - 完成定义：审计字段、查询和脱敏测试通过。

- [ ] X0008 定义 Handler 权限、脱敏和 Context Packet 契约
  - 前置任务：X0000、X0006。
  - 功能范围：规定每个 Handler 的数据范围、字段裁剪、Context Builder、masking、最小候选、Result 和审计责任。
  - 代码交付物：公共 Handler 契约及必要的共享适配接口。
  - UI 要求：Result 必须带权限过滤和脱敏说明。
  - UCP/外部系统要求：凭证、token、请求头不得进入模型或 AI 审计摘要。
  - 测试要求：整表数据拦截、敏感候选裁剪、无权候选、Prompt 注入内容、审计脱敏。
  - 验收标准：模型只看用户原始描述和完成任务所需的最小上下文。
  - 完成定义：契约、自动化测试和 004 公共协议同步完成。

- [ ] X0009 回归现有 ChatRoute
  - 前置任务：X0005-X0008。
  - 功能范围：验证补偿金、权限解释、自动化、数据对账和 `general_question`/会话续接未被公共收口破坏。
  - 代码交付物：回归测试集和必要的兼容修复。
  - UI 要求：现有结果卡和旧字段继续可用。
  - UCP/外部系统要求：现有通知/卡片不受影响。
  - 测试要求：正常、多轮、低置信度、无模型、无权限、Provider 失败、Schema 失败。
  - 验收标准：无现有能力回归，且所有 Route 统一经过新权限闸和审计。
  - 完成定义：自动化测试和人工对话验证通过。

### Phase 0B：业务决策与北森 + UCP 技术切片

- [ ] X0001 固化业务截止日和生效日期规则
  - 前置任务：无。
  - 功能范围：确认 10 日当天归属、显式月份覆盖、关闭月份补录、生效日期允许范围和业务时区。
  - 代码交付物：更新本文件“假设与待确认事项”和系统参数默认值设计；不修改产品代码。
  - UI 要求：不涉及 UI。
  - UCP/外部系统要求：不涉及。
  - 测试要求：形成至少 12 个日期决策表用例，覆盖 9/10/11 日、跨月、跨年和显式覆盖。
  - 验收标准：HR 负责人书面确认唯一规则；文档中不再出现互相矛盾的“10号前后”表述。
  - 完成定义：规则、例子、测试期望和负责人确认均有证据后才可勾选。

- [ ] X0002 核实人员与组织权威字段和权限范围
  - 前置任务：无。
  - 功能范围：核实花名册员工工号、北森 UserID、状态、组织、上级字段；核实组织 code、状态和映射来源。
  - 代码交付物：字段映射清单及缺失项；不新建业务代码。
  - UI 要求：不涉及 UI。
  - UCP/外部系统要求：确认 UCP External ID Mapping 能保存 Portal code ↔ 北森 OId/OriginalId。
  - 测试要求：抽取唯一姓名、重名、离职、实习、无上级、组织停用等样本验证。
  - 验收标准：每个 V1 输入/输出字段都有权威来源、类型、空值规则和同步时效。
  - 完成定义：字段清单、样本验证和缺失项处理方案全部完成。

- [ ] X0003 在 UCP 配置北森人员调整测试资源
  - 前置任务：X0002。
  - 功能范围：建立北森测试 System、Credential、人员调动 Resource 和预检 Resource。
  - 代码交付物：必要的专用 Adapter 或 REST Resource 模板、配置 seed/导入文件；不得新建通用网关。
  - UI 要求：UCP 接入系统详情可查看资源和脱敏凭证状态。
  - UCP/外部系统要求：复用 UCP Credential、SSRF、限流、重试、熔断和审计。
  - 测试要求：认证成功/失败、超时、429、业务错误、凭证失效、敏感信息不落日志。
  - 验收标准：测试资源可独立预检和执行一条模拟或测试人员调整，产生真实 trace_id/Step Run。
  - 完成定义：配置、测试、日志和安全检查有证据。

- [ ] X0004 跑通人员调动和纯上级变更端到端技术切片
  - 前置任务：X0003。
  - 功能范围：测试环境分别执行部门调动、调动+换上级、只换上级。
  - 代码交付物：修正北森请求映射；记录标准错误码映射。
  - UI 要求：不开发业务 UI；使用 UCP 运行详情验证。
  - UCP/外部系统要求：确认纯上级变更必须传实时当前部门；验证防重和重试行为。
  - 测试要求：成功、员工不存在、离职员工、目标组织失效、上级无效、重复请求、超时后状态不明。
  - 验收标准：三种成功场景可复现；失败场景不会误报成功；请求响应不泄漏凭证。
  - 完成定义：测试证据、错误码表和是否允许进入业务开发的结论齐全。

### 阶段 1A：调整业务模型、状态机与权限

- [ ] X0010 创建 `hr_adjustment` 后端模块骨架
  - 前置任务：X0001、X0002。
  - 功能范围：模块包、models/schemas/service/router/policy/repository 文件和路由挂载。
  - 代码交付物：`backend/app/hr_adjustment/`，应用主路由注册。
  - UI 要求：不涉及 UI。
  - UCP/外部系统要求：仅预留 UCP service adapter，不调用外部系统。
  - 测试要求：应用启动和 OpenAPI 生成测试。
  - 验收标准：模块可导入、路由可发现、无循环依赖。
  - 完成定义：代码、启动测试和静态检查通过。

- [ ] X0011 实现六张业务模型和 Alembic migration
  - 前置任务：X0010。
  - 功能范围：session/batch/item/ambiguity/todo/event 模型、外键、索引、约束、乐观锁字段。
  - 代码交付物：models.py、Alembic upgrade/downgrade。
  - UI 要求：不涉及 UI。
  - UCP/外部系统要求：只保存 approval_request_id、pipeline_run_id、step_run_id 引用。
  - 测试要求：空库 upgrade、downgrade、再次 upgrade；约束和索引测试；不得破坏旧表。
  - 验收标准：draft 可保存空 effective_date，确认态不可缺日期；用户名字段不替代 user_id。
  - 完成定义：迁移测试和数据库结构证据齐全。

- [ ] X0012 实现批次和条目状态机服务
  - 前置任务：X0011。
  - 功能范围：合法流转、非法流转、乐观锁、事件记录和事务。
  - 代码交付物：state_machine.py/service.py。
  - UI 要求：不涉及 UI。
  - UCP/外部系统要求：定义 UCP 状态到业务状态的映射，但不执行 UCP。
  - 测试要求：逐状态成功/非法流转、重复请求幂等、并发版本冲突、事务回滚。
  - 验收标准：Router/AI handler 不能直接写状态；所有变化生成 event。
  - 完成定义：状态测试全通过，状态图与代码一致。

- [ ] X0013 实现调整业务权限策略
  - 前置任务：X0011。
  - 功能范围：入口、提报、复核、执行、审计、数据范围、动作类型和本人相关限制。
  - 代码交付物：policy.py，权限 seed。
  - UI 要求：权限 code 可在角色配置页分配；不新增独立权限系统。
  - UCP/外部系统要求：执行权限与 UCP 权限叠加，不能互相替代。
  - 测试要求：HRBP/SSC/HRVP/管理员/无权限用户矩阵；跨部门、跨法人和无权候选测试。
  - 验收标准：无权用户无法通过猜 ID 判断记录存在；候选列表不泄漏无权人员。
  - 完成定义：权限矩阵、自动化测试和角色配置验证完成。

- [ ] X0014 实现业务参数配置读取
  - 前置任务：X0001、X0010。
  - 功能范围：截止日、歧义超时、预演有效期、允许动作、审批策略。
  - 代码交付物：复用现有系统参数模块的读取与 seed，不新建配置引擎。
  - UI 要求：V1 可仅后台参数；若已有参数配置页则可编辑并校验范围。
  - UCP/外部系统要求：保存 UCP pipeline/resource code，不保存凭证。
  - 测试要求：默认值、非法值、缺值回退、修改只影响新业务对象。
  - 验收标准：核心规则无散落硬编码。
  - 完成定义：参数读取、校验和测试完成。

### 阶段 1B：实体解析、Capability 与草稿闭环

- [ ] X0020 实现员工实体解析服务
  - 前置任务：X0013。
  - 功能范围：工号精确匹配、姓名唯一/重名/不存在、员工状态和权限过滤。
  - 代码交付物：resolver.py 或复用服务适配层。
  - UI 要求：返回可渲染的候选最小字段。
  - UCP/外部系统要求：不调用北森写接口；读取本地权威数据。
  - 测试要求：唯一、重名、无结果、离职、外部人员、无权人员、特殊字符和注入字符串。
  - 验收标准：不采信 LLM 生成的工号；无权数据不出现在候选。
  - 完成定义：解析器和安全测试通过。

- [ ] X0021 实现组织与上级解析服务
  - 前置任务：X0013。
  - 功能范围：组织 code/name 精确匹配、模糊候选、组织有效性、新上级解析和循环关系检测。
  - 代码交付物：resolver.py、relationship_validator.py。
  - UI 要求：候选包含名称、编码和路径；不得显示无关敏感字段。
  - UCP/外部系统要求：外部 OId 不在此阶段暴露给前端。
  - 测试要求：同名组织、近似名、失效组织、自我为上级、直接/间接循环、深层组织树。
  - 验收标准：模糊结果不自动选；循环关系被确定性代码阻止。
  - 完成定义：业务与性能测试通过。

- [ ] X0022 定义 `AdjustmentPlan` 和 `AdjustmentDraftData`
  - 前置任务：X0006、X0010。
  - 功能范围：只定义调整业务的 LLM Plan、草稿数据、歧义和缺失字段；公共 Result Envelope 不在本任务重复定义。
  - 代码交付物：调整域 Pydantic schemas、JSON Schema、示例；业务结果写入 `CapabilityResultEnvelope.result.data`。
  - UI 要求：Web 和飞书通过公共 Envelope 使用同一 `adjustment_draft` 结果类型。
  - UCP/外部系统要求：Schema 不包含 Credential、token、外部请求头或北森原始敏感响应。
  - 测试要求：有效/无效 Plan、未知 action、超长文本、多指令、额外字段拒绝、公共 Envelope 嵌套校验。
  - 验收标准：模型输出必须先过 Schema，失败不落正式条目；不得新增顶层 `adjustment` 专属字段。
  - 完成定义：Schema 测试、公共协议兼容和接口文档完成。

- [ ] X0023 注册并绑定四个调整 Capability
  - 前置任务：X0005、X0022、X0013。
  - 功能范围：collect/resolve/query/explain 的元数据、权限、风险、示例和失败模式，并绑定到现有 ChatRoute。
  - 代码交付物：只扩展 `app/ai/capabilities.py` 和 `CHAT_ROUTES`；不新建 Capability 表或第二套路由。
  - UI 要求：能力清单和全局助手可见“组织与人员调整”。
  - UCP/外部系统要求：不得注册可由 LLM 直接触发北森或 UCP 正式执行的 Capability。
  - 测试要求：能力可见性、目标权限闸、Route 绑定、禁用状态和元数据 Schema。
  - 验收标准：四个 capability_id 均有唯一 Handler 绑定；无 `hr.adjustment.execute` 类模型直连写能力。
  - 完成定义：注册、绑定、权限和现有 Route 回归测试通过。

- [ ] X0024 按公共 Handler 契约实现调整 Extractor 和 Handler
  - 前置任务：X0005-X0008、X0020、X0021、X0022、X0023、X0012。
  - 功能范围：只实现调整域的 Plan 解析、实体校验、草稿落库、会话状态和歧义；复用公共权限闸、Result Envelope、审计和 Context 契约。
  - 代码交付物：现有 AI Router/Runtime 的调整 Extractor 和 Handler；复用 `AiConversation`，不新建 Runtime 类。
  - UI 要求：通过 `result.type=adjustment_draft` 返回确认卡、候选、缺失字段和示例提示数据。
  - UCP/外部系统要求：不触发 UCP 正式执行；凭证、token、请求头不进入模型。
  - 测试要求：单条、多条、修正上一条、刷新恢复、解析失败、Provider 不可用、并发会话、权限和脱敏。
  - 验收标准：模型只看用户原始描述和最小必要候选；整张花名册不进入模型；原文和结构化草稿可追溯。
  - 完成定义：后端测试、X0009 回归与人工对话验证完成。

- [ ] X0025 实现歧义解析与超时逻辑
  - 前置任务：X0024、X0014。
  - 功能范围：候选选择、版本校验、二次反问、过期和待办生成。
  - 代码交付物：ambiguity service、scheduler handler。
  - UI 要求：候选可单选；过期后提示重新查询。
  - UCP/外部系统要求：不涉及。
  - 测试要求：有效选择、伪造 candidate_id、过期选择、重复选择、无权候选、定时任务幂等。
  - 验收标准：永不默认选择第一项；过期仅生成一个 open 待办。
  - 完成定义：定时任务和边界测试通过。

- [ ] X0026 实现分月、重复和条目确认规则
  - 前置任务：X0001、X0012、X0014。
  - 功能范围：target_month、显式覆盖、重复员工冲突、日期必填、确认和取消。
  - 代码交付物：business_rules.py、item API。
  - UI 要求：错误按字段返回，确认成功更新卡片。
  - UCP/外部系统要求：不涉及。
  - 测试要求：全年日期、跨年、重复草稿、已提交冲突、过去日期、版本冲突。
  - 验收标准：规则与 X0001 决策完全一致；draft 可空日期但不能确认。
  - 完成定义：规则测试和 API 测试通过。

### 阶段 1C：批次、待办、业务 API 与 Web UI

- [ ] X0030 实现批次查询、提交、撤回和复核 API
  - 前置任务：X0012、X0013、X0026。
  - 功能范围：4.2.2 所列非执行接口、筛选、分页和状态校验。
  - 代码交付物：router/service/repository/schema。
  - UI 要求：响应满足我的调整和 SSC 清单页面。
  - UCP/外部系统要求：提交和复核阶段不调用北森。
  - 测试要求：成功、空批次、未确认条目、无权限、撤回时机、驳回原因、分页边界、并发复核。
  - 验收标准：只有有效条目全部确认才能提交；复核操作有事件和审计。
  - 完成定义：OpenAPI、自动化测试和 Swagger 验证完成。

- [ ] X0031 实现待办 API 和处理事务
  - 前置任务：X0012、X0025。
  - 功能范围：查询、认领、处理、取消、关联业务校验和防重复。
  - 代码交付物：todo router/service。
  - UI 要求：返回逾期、今日到期和处理表单所需元数据。
  - UCP/外部系统要求：映射/预检待办可关联 UCP run，但不复制日志。
  - 测试要求：不同待办类型、认领冲突、处理失败回滚、越权、重复处理、空列表。
  - 验收标准：处理待办必须真正推进或修复关联对象。
  - 完成定义：事务与权限测试通过。

- [ ] X0032 增加前端 API 和类型定义
  - 前置任务：X0030、X0031。
  - 功能范围：批次、条目、歧义、待办、预演和执行 API client。
  - 代码交付物：`frontend/src/api/hrAdjustments.ts` 及 types。
  - UI 要求：统一错误解析、trace_id 展示和取消请求。
  - UCP/外部系统要求：UCP run 仅通过业务 API 或受权链接访问。
  - 测试要求：API mock、错误码映射和类型检查。
  - 验收标准：页面不直接散写 fetch/axios 请求。
  - 完成定义：单元测试和 TypeScript 构建通过。

- [ ] X0033 开发全局 AI 助手调整卡片
  - 前置任务：X0024、X0025、X0032。
  - 功能范围：草稿、歧义、缺失字段、确认、修改、取消和免责声明。
  - 代码交付物：可复用 `AdjustmentDraftCard.vue`，接入 GlobalAiAssistant。
  - UI 要求：满足 4.4.2；加载/空/403/409/422/503 状态完整。
  - UCP/外部系统要求：不显示执行按钮。
  - 测试要求：组件单测、键盘操作、重复点击、日期必填、候选选择、版本冲突。
  - 验收标准：HRBP 可在侧边栏完成“输入→反问→确认”。
  - 完成定义：代码、单测、截图或录屏证据和可访问性检查完成。

- [ ] X0034 开发“我的调整”页面
  - 前置任务：X0030、X0032。
  - 功能范围：批次列表、筛选、继续填写、详情、撤回和空态。
  - 代码交付物：页面、路由、菜单映射。
  - UI 要求：满足 4.4.3，1366px 无溢出。
  - UCP/外部系统要求：不展示技术执行配置。
  - 测试要求：列表、分页、筛选、空态、无权限、撤回冲突和构建。
  - 验收标准：提报人只能看到本人或明确授权范围的批次。
  - 完成定义：前端测试、构建和真实 API 联调完成。

- [ ] X0035 开发 SSC 批次清单和详情
  - 前置任务：X0030、X0032。
  - 功能范围：复核清单、批次详情五页签、通过/驳回。
  - 代码交付物：列表页、详情页、复核弹窗。
  - UI 要求：满足 4.4.4；操作权限不足时按钮隐藏或禁用并解释。
  - UCP/外部系统要求：预演和执行页签先显示占位状态，不自行调用北森。
  - 测试要求：筛选、详情、复核、驳回、并发冲突、403、404、空态、响应式。
  - 验收标准：SSC 可准确识别异常条目并完成复核。
  - 完成定义：开发、测试、联调和 UI 验证完成。

- [ ] X0036 开发调整待办页面
  - 前置任务：X0031、X0032。
  - 功能范围：待办列表、认领、动态处理表单和关联跳转。
  - 代码交付物：TodoList/ResolveDialog。
  - UI 要求：满足 4.4.5；状态不只靠颜色。
  - UCP/外部系统要求：可跳转 UCP run，但不嵌入敏感 Step 输出。
  - 测试要求：逾期、今日到期、空态、无权、认领冲突、处理失败和构建。
  - 验收标准：不同 todo_type 展示正确处理字段。
  - 完成定义：开发、测试和 UI 验证完成。

### 阶段 2：UCP 预演、审批和执行

- [ ] X0040 创建人员调整 UCP Pipeline 模板
  - 前置任务：X0004、X0030。
  - 功能范围：预检、分支、审批、循环写入、汇总和通知节点。
  - 代码交付物：Pipeline template seed/导入定义、必要的业务输入适配器。
  - UI 要求：UCP 画布可查看节点和版本；普通 HRBP 不需要配置画布。
  - UCP/外部系统要求：完全复用 UCP Run/Step Run/Approval/Retry/Notify。
  - 测试要求：模板校验、重新打开、试运行、全部成功、部分失败、审批等待、拒绝和恢复。
  - 验收标准：无独立第二套 workflow；每个 item 可关联 Step Run。
  - 完成定义：模板、版本、测试 run 和运行详情证据齐全。

- [ ] X0041 实现业务批次到 UCP 输入的安全适配
  - 前置任务：X0040、X0013。
  - 功能范围：按批次生成最小 UCP 输入、映射外部 ID、执行主体和幂等键。
  - 代码交付物：ucp_bridge.py。
  - UI 要求：不涉及 UI。
  - UCP/外部系统要求：凭证由 Resource 注入；业务输入不得含 token。
  - 测试要求：映射成功/缺失、无权执行、字段污染、重复调用、超大批次上限。
  - 验收标准：缺映射生成业务待办并阻止执行。
  - 完成定义：安全和集成测试通过。

- [ ] X0042 实现预演 API 和预演有效期
  - 前置任务：X0041。
  - 功能范围：创建预演 run、轮询/读取结果、失效和刷新。
  - 代码交付物：preflight service/API。
  - UI 要求：批次详情显示预演时间、状态、逐条结果、失效提示和刷新按钮。
  - UCP/外部系统要求：预演 Resource 只读，不调用写接口。
  - 测试要求：成功、数据变化、映射缺失、UCP 不可用、重复预演、过期预演。
  - 验收标准：没有有效预演不能正式执行。
  - 完成定义：API、UI 联调和测试通过。

- [ ] X0043 实现审批请求和业务状态联动
  - 前置任务：X0040、X0042。
  - 功能范围：按策略创建 UCP ApprovalRequest，处理通过、拒绝、过期和重复回调。
  - 代码交付物：approval bridge/callback handler。
  - UI 要求：审批页签显示审批人、状态、意见和时间；无权用户只见最小信息。
  - UCP/外部系统要求：复用 `approval_service.py`，不新建审批表。
  - 测试要求：SINGLE/ANY/ALL 配置至少覆盖实际采用模式；通过、拒绝、超时、回调重放、非审批人。
  - 验收标准：审批状态和 batch 状态一致且可恢复。
  - 完成定义：集成测试和审计证据齐全。

- [ ] X0044 实现正式执行 API 和幂等保护
  - 前置任务：X0042、X0043。
  - 功能范围：确认执行、版本锁、有效预演、运行创建、重复提交阻止。
  - 代码交付物：execute service/API。
  - UI 要求：确认弹窗满足 4.4.4，显示部分失败不自动回滚说明。
  - UCP/外部系统要求：由 UCP 执行，业务代码不直接调用 httpx 写北森。
  - 测试要求：成功、无预演、过期预演、审批未通过、重复点击、并发、UCP 创建失败。
  - 验收标准：同一批次仅有一个 active 正式 run。
  - 完成定义：自动化测试和端到端执行证据完成。

- [ ] X0045 实现 UCP Run/Step 状态回写和失败重试
  - 前置任务：X0044。
  - 功能范围：运行状态同步、逐条结果、partial success、失败待办、单项重试。
  - 代码交付物：状态同步 handler、execution API、retry API。
  - UI 要求：执行页签展示条目状态、错误摘要、重试按钮和 UCP 运行详情链接。
  - UCP/外部系统要求：复用失败项重跑和幂等键；不自动重跑状态不明的写请求。
  - 测试要求：全部成功、部分失败、全部失败、回调乱序/重复、重试成功、无权重试。
  - 验收标准：业务状态不掩盖部分成功；已成功条目不重复执行。
  - 完成定义：状态一致性测试和人工验证完成。

- [ ] X0046 实现审计聚合查询和授权导出
  - 前置任务：X0045、X0013。
  - 功能范围：聚合 AI、业务事件、审批和 UCP 日志，导出授权字段。
  - 代码交付物：audit query/export API。
  - UI 要求：时间线展示，原始文本和技术日志按权限折叠；导出有确认。
  - UCP/外部系统要求：只引用 UCP 日志，不复制凭证或未脱敏 payload。
  - 测试要求：完整链、缺失链、权限裁剪、脱敏、导出、空数据和大数据分页。
  - 验收标准：通过 trace_id 可追溯全流程；未授权用户不能读取原文。
  - 完成定义：查询、导出、安全测试和 UI 验证完成。

### 阶段 3：飞书入口与通知

- [ ] X0050 实现飞书对话消息事件接入
  - 前置任务：X0033、现有飞书回调公网可用。
  - 功能范围：私聊/群聊 @消息、验签、幂等、open_id 映射和 AiConversation 渠道关联。
  - 代码交付物：扩展现有飞书 callback/event handler。
  - UI 要求：飞书返回处理中、成功、错误和无权限消息。
  - UCP/外部系统要求：复用现有 FeishuClient；消息事件可经 UCP Event 标准化但不重复存业务状态。
  - 测试要求：challenge、合法/非法签名、重复 event_id、未映射用户、群聊非@消息、超长消息。
  - 验收标准：飞书消息可路由到同一 `hr.adjustment.collect` Handler。
  - 完成定义：本地和平台回调验证、测试及安全日志完成。

- [ ] X0051 实现飞书调整确认卡片
  - 前置任务：X0050、X0025、X0026。
  - 功能范围：草稿展示、候选选择、确认/取消、卡片更新和深度链接。
  - 代码交付物：卡片 renderer、callback handler。
  - UI 要求：敏感字段按渠道脱敏；复杂修改跳转 Web，不在卡片塞入全部表单。
  - UCP/外部系统要求：复用互动卡片发送/更新方法。
  - 测试要求：按钮签名/防伪、重复点击、过期卡片、版本冲突、无权用户、卡片更新失败。
  - 验收标准：Web 与飞书操作同一 item，状态实时一致。
  - 完成定义：卡片测试、录屏和审计证据完成。

- [ ] X0052 实现月度提醒和结果通知
  - 前置任务：X0050、X0014、X0045。
  - 功能范围：月度收集提醒、歧义/待办提醒、审批和执行结果通知。
  - 代码交付物：scheduler handler、通知模板和 receiver 规则。
  - UI 要求：通知含明确动作链接，不暴露无权详情。
  - UCP/外部系统要求：复用现有 notifier/notification template；同 trace_id 去重。
  - 测试要求：工作日规则、无接收人、缺 feishu_user_id、发送失败、重复调度、部分失败通知。
  - 验收标准：通知失败不回滚业务执行；发送结果可追踪。
  - 完成定义：调度测试、试发和日志验证完成。

### 场景后续阶段：V2 组织调整扩展

- [ ] X0060 验证北森组织新增、更名和停用 Resource
  - 前置任务：V1 稳定、X0003。
  - 功能范围：测试三类组织写操作、当前生效限制、OriginalId 和错误码。
  - 代码交付物：UCP Resource/Adapter 配置和测试报告。
  - UI 要求：不涉及业务 UI。
  - UCP/外部系统要求：复用 UCP External ID Mapping、限流和审计。
  - 测试要求：成功、上级不存在、重复 code、非当前生效、组织下有人、OriginalId 缺失。
  - 验收标准：三类写操作均有明确可执行和不可执行边界。
  - 完成定义：测试环境证据和错误映射完成。

- [ ] X0061 扩展组织调整数据模型和业务规则
  - 前置任务：X0060。
  - 功能范围：org_create/org_rename/org_disable 字段、影响分析和校验。
  - 代码交付物：向后兼容 migration、Schema、规则。
  - UI 要求：组织调整卡片显示组织编码、上级组织、生效日期和影响人数。
  - UCP/外部系统要求：外部 ID 仍由 UCP 映射服务管理。
  - 测试要求：旧 V1 数据兼容、字段约束、组织依赖、员工未清空、同名/同码冲突。
  - 验收标准：旧人员调整流程无回归。
  - 完成定义：迁移、规则和回归测试通过。

- [ ] X0062 扩展多类型 Pipeline DAG 和组织调整 UI
  - 前置任务：X0061。
  - 功能范围：组织新增→更名→人员调动→停用顺序、预演、审批和结果展示。
  - 代码交付物：UCP Pipeline 新版本、前端组织卡片和详情字段。
  - UI 要求：显示依赖关系和被阻塞原因，禁止用户手工绕过顺序。
  - UCP/外部系统要求：使用 Pipeline nodes/edges 作为执行顺序真理源。
  - 测试要求：各类型单独/组合、部分失败阻塞、预演变化、重试、版本回滚。
  - 验收标准：不新增第二套通用 DAG 引擎；执行顺序可在 UCP Run 中追溯。
  - 完成定义：开发、UI、E2E、测试环境执行和回归全部完成。

### 上线质量闸

- [ ] X0070 建立后端测试矩阵
  - 前置任务：X0046；飞书上线时包含 X0052。
  - 功能范围：模型、状态机、权限、解析、API、UCP、审计和飞书测试集合。
  - 代码交付物：pytest 测试文件、fixture 和测试数据工厂。
  - UI 要求：不涉及 UI。
  - UCP/外部系统要求：测试环境和 mock 分层；真实联调不可只用 mock 替代。
  - 测试要求：覆盖第 6 章全部类别，核心 service 分支覆盖率不低于 85%。
  - 验收标准：无跳过的 P0/P1 用例；失败有明确原因。
  - 完成定义：测试报告、覆盖率和命令结果保存。

- [ ] X0071 建立前端组件和 E2E 测试
  - 前置任务：X0033-X0036、X0046。
  - 功能范围：卡片、清单、待办、复核、预演、执行和审计页面。
  - 代码交付物：组件测试和 Playwright E2E。
  - UI 要求：验证 1366px、权限态、空态、错误态、键盘操作。
  - UCP/外部系统要求：E2E 至少跑通一条真实测试环境 UCP run。
  - 测试要求：HRBP 成功、重名反问、SSC 驳回、执行成功、部分失败、无权限六条核心路径。
  - 验收标准：前端 build 通过，核心 E2E 稳定通过。
  - 完成定义：测试、截图/录屏、构建结果齐全。

- [ ] X0072 执行安全和隐私专项测试
  - 前置任务：X0070、X0071。
  - 功能范围：越权、IDOR、提示注入、SQL 注入、敏感日志、凭证泄漏、卡片回调伪造和批量重放。
  - 代码交付物：安全测试用例和修复。
  - UI 要求：安全错误不泄漏对象存在性和内部堆栈。
  - UCP/外部系统要求：检查 Credential、SSRF、防重、限流和 Step 快照脱敏。
  - 测试要求：越权拦截率 100%，凭证泄漏 0，敏感字段漏脱 0。
  - 验收标准：无未关闭高危/严重问题。
  - 完成定义：安全报告、修复和复测完成。

- [ ] X0073 执行业务 UAT 和灰度上线
  - 前置任务：X0072。
  - 功能范围：选定 HRBP/SSC 小范围试用、生产配置、回退方案和观察指标。
  - 代码交付物：发布记录、配置清单、回退步骤；不在本文件写真实密钥。
  - UI 要求：用户操作说明和问题反馈入口可用。
  - UCP/外部系统要求：先灰度只开预演，再按审批开放正式执行；生产 Credential 由授权管理员配置。
  - 测试要求：migration、后端、前端 build、Docker、健康检查、真实小批次和回退演练。
  - 验收标准：UAT 核心场景通过；监控、告警和审计可用；负责人批准上线。
  - 完成定义：开发、UI、测试、验收、发布与回退证据全部完成后才可勾选。

## 6. 测试计划

### 6.1 成功路径

1. 唯一员工 + 唯一组织的人员调动。
2. 人员调动同时修改上级。
3. 纯上级变更，目标部门自动使用实时当前部门。
4. 重名员工经用户选择后确认。
5. 模糊组织经用户选择后确认。
6. HRBP 完成批次提交，SSC 复核通过，审批通过，UCP 执行成功。
7. 批次部分失败后只重试失败项。
8. Web 创建草稿，飞书继续确认，状态一致。

### 6.2 参数与 Schema 错误

- 空 message、超长 message、未知 action_type；
- 非法日期、非法月份、非法 candidate_id；
- page_size 超限、非法 sort/filter；
- 客户端伪造 status、trace_id、ucp_step_run_id；
- 缺 version、旧 version；
- LLM 返回非法 JSON、额外字段或虚构工号。

### 6.3 资源不存在和数据异常

- 员工不存在、重名、已离职、外部人员；
- 组织不存在、同名、失效；
- 新上级不存在、离职、自身、循环关系；
- Portal 与北森映射缺失或冲突；
- 本地同步过期；
- UCP Resource、Credential、Pipeline 不存在或停用。

### 6.4 权限不足

- 无入口权限调用 AI Capability；
- HRBP 查询/提报其他数据范围人员；
- 普通用户复核或执行；
- SSC 查看范围外批次；
- 无审计权限读取原始文本或导出；
- 非审批人审批；
- 伪造飞书 open_id 或回调动作。

### 6.5 空数据

- 无批次、无条目、无待办、无审计、无候选；
- 空批次提交；
- 批次全部条目取消；
- UCP Run 无 Step 数据或日志暂未同步。

### 6.6 边界值和并发

- 9/10/11 日及跨年；
- 过去、今天、未来生效日期；
- 同月同员工重复提报；
- 两个用户同时修改同一批次；
- 双击确认、双击执行、回调重复和乱序；
- 最大批次条目数、最大候选数、超长姓名和组织路径；
- 北森超时后结果不明确；禁止盲目重试写操作。

### 6.7 Migration 与兼容

- 空库升级、已有生产结构升级、downgrade、再次升级；
- 旧数据和现有 AI/UCP/飞书功能不受影响；
- V2 增加组织动作后，V1 人员条目仍可读写和执行；
- 新权限 seed 不覆盖现有角色手工配置。

### 6.8 构建与回归

- 后端 pytest；
- 前端单元测试和 TypeScript 检查；
- 前端生产构建；
- AI 补偿金、公式、报表、UCP、飞书通知现有回归；
- Docker 健康检查；
- 真实测试环境北森和飞书联调。

### 6.9 非功能测试

- 典型对话首响 P95 目标小于 5 秒；超过时显示处理中；
- 列表查询 200 条以内 P95 小于 2 秒；
- 批次执行不阻塞 Web 请求线程；
- 审计链完整率 100%；
- 越权拦截率 100%；
- 敏感字段漏脱率 0；
- 相同执行请求幂等率 100%。

## 7. 验收标准

### 7.1 用户验收

- HRBP 能用自然语言完成一条人员调整，不需要了解北森参数。
- 重名和模糊组织不会被系统默认选择。
- 刷新或切换渠道后草稿不丢失。
- SSC 能清楚区分待确认、待复核、待审批、执行中、部分成功和已完成。
- 失败时用户能看到可理解的原因和下一步，不显示技术堆栈。

### 7.2 开发验收

- 业务、AI、UCP、飞书边界符合本文；不存在禁止的重复基础设施。
- API Schema、状态码、权限、migration、downgrade 和状态机实现完整。
- 所有外部执行通过 UCP；所有状态变化通过 service。
- Web 与飞书共享业务 Handler 和 Result Schema。

### 7.3 测试验收

- 第 6 章测试类别均有用例和结果。
- 核心后端 service 分支覆盖率不低于 85%。
- 六条核心 E2E 全部通过。
- 北森真实测试环境至少完成一次成功、一次业务失败、一次部分失败或可控模拟。
- 无未关闭 P0/P1 缺陷。

### 7.4 UI/交互验收

- 页面、字段、按钮、弹窗和状态符合 4.4。
- 1366px 无核心内容横向溢出。
- 加载、空、错误、权限、冲突和部分失败状态齐全。
- 状态不只靠颜色，关键操作有明确确认和影响说明。
- 无权限按钮和页面不会造成数据泄漏。

### 7.5 上线验收

- Alembic migration、后端测试、前端测试和生产构建通过。
- UCP Pipeline、Resource、Credential、审批、监控和通知已配置并验证。
- 生产先开放预演，正式执行经过灰度批准。
- 监控、告警、审计和回退方案可用。
- 发布记录列明未完成项，不得把 V2 能力标成已上线。

## 8. 风险与兼容性

| 风险 | 等级 | 影响 | 应对方案 |
|---|---|---|---|
| 北森写接口只停留在文档、未真实联调 | 高 | 核心执行不可用或误写 | X0003-X0004 作为强制前置；先开预演再开正式执行 |
| 截止日规则仍未业务确认 | 高 | 调整归错月份 | X0001 书面确认；配置化；保存规则快照 |
| 人员/组织外部 ID 缺失 | 高 | 无法生成北森请求 | X0002 核实；复用 UCP ID Mapping；缺失转待办 |
| 权限只做入口校验 | 高 | 越权查看或调整人员 | 查询、候选、提报、复核、执行、审计分层校验 |
| LLM 虚构员工或编码 | 高 | 错误人员调整 | 模型只出文本 Plan；所有 ID 由本地 resolver 重新解析 |
| UCP 完成标记与真实场景能力不一致 | 高 | 误判可直接复用 | 对具体北森资源、Pipeline、Step Run 做技术切片和 E2E |
| 北森写请求超时后状态不明 | 高 | 盲目重试造成重复调整 | 幂等键、外部结果查询、状态不明转人工待办，不自动重试 |
| 业务状态和 UCP 状态混淆 | 中 | 页面错误显示、无法恢复 | 分离 batch/item/run 状态，建立单向映射和幂等同步 |
| 飞书群聊泄漏人员信息 | 高 | 隐私泄漏 | 群聊最小摘要，复杂信息私聊/Web，按渠道加强脱敏 |
| `ucp.masking` 关键词规则漏脱 | 高 | 日志或 AI 输入泄漏 | 字段元数据/白名单优先，关键词仅兜底，专项安全测试 |
| 重复建设基础设施 | 中 | 维护成本和双真理源 | 强制复用 UCP、AI、飞书、权限模块；代码评审检查禁止项 |
| 一期同时做组织和人员调整 | 中 | 范围过大、上线延迟 | V1 仅人员调动/上级变更，组织调整进入 V2 |
| 部分成功无法自动回滚 | 中 | 外部系统状态不一致 | 明示部分成功，冻结成功项，失败项待办/重试，人工补偿 |
| migration 或权限 seed 影响现有功能 | 中 | 生产回归 | 新表增量迁移、dry run、回归测试、不覆盖角色手工授权 |
| 飞书回调公网或验签不稳定 | 中 | 飞书入口不可用 | Web 为完整主入口；飞书作为增强，不阻塞 V1 Web 闭环 |

### 8.1 假设与待确认事项

| 编号 | 假设/待确认 | 当前处理 |
|---|---|---|
| A01 | 10 日当天究竟归当月还是下月 | 暂按 10 日 23:59:59 前归当月；X0001 必须确认后才能开发规则 |
| A02 | 显式指定已关闭月份是否允许 | 暂按允许提交但强制 SSC 复核 |
| A03 | 人员调动审批是 SSC 单人确认还是 HR 负责人审批 | 参数化；上线前确定实际 approver 模式 |
| A04 | HRBP 可提报范围是否等于可见范围 | 默认不等同；需业务单独给出提报范围规则 |
| A05 | `emp_realtime_roster` 是否有稳定北森 UserID 和员工状态 | X0002 核实，缺失则阻塞正式执行 |
| A06 | `org_tree.code` 是否可稳定作为 Portal 组织主键 | 暂按是；北森 OId/OriginalId 放 UCP Mapping |
| A07 | 北森是否提供执行后结果查询或幂等标识 | X0004 验证，决定超时状态不明处理方式 |
| A08 | 批次最大条目数 | 暂定 200，技术切片后按北森与 UCP 性能调整 |
| A09 | 飞书文档主文档/附录是否仍为硬性要求 | V1 不做，Portal 数据库与审计为真理源；需业务确认 V2 优先级 |
| A10 | 组织调整是否需要独立审批级别 | V2 前确认，默认高于人员调整 |

## 9. 交付说明模板

```markdown
# HR 调整智能助手交付说明

## 1. 本次完成任务
- [x] X0000 任务名称

## 2. 修改文件
| 文件 | 修改内容 |
|---|---|
| path/to/file | 内容 |

## 3. 数据库变更
- Migration：
- Upgrade 结果：
- Downgrade 验证：
- 兼容性说明：

## 4. API 变更
| Method | URL | 权限 | 验证结果 |
|---|---|---|---|

## 5. 测试命令与结果
- 后端测试命令：
- 结果：通过数 / 失败数 / 跳过数
- 前端测试命令：
- 结果：
- 构建命令：
- 结果：
- E2E/真实外部系统验证：

## 6. UI 验证
- 验证页面：
- 1366px：
- 加载/空态/错误/权限态：
- 截图或录屏路径：

## 7. UCP/外部系统验证
- System/Resource/Pipeline 版本：
- 测试 trace_id：
- 北森结果：
- 飞书结果：
- 敏感信息检查：

## 8. 未完成项
- 任务编号：
- 原因：
- 阻塞方：
- 下一步：

## 9. 风险与回退
- 已知风险：
- 监控项：
- 回退步骤：

## 10. 完成声明
仅当开发、UI、测试、权限、安全、UCP/外部系统验证和验收证据全部完成后，才将对应原子任务标记为 `[x]`。
```
