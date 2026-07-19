# AI 能力注册表与 Runtime 公共协议

版本：v0.2  
日期：2026-07-18  
状态：已实施基线 + Phase 0A 待补协议  
适用范围：HR Portal 所有可被 AI 理解、调用或编排的业务能力

## 1. 定位

本文件是 Capability 元数据、Plan、Result、ChatRoute、Handler、安全和 UCP 适配的公共协议单一真理源。

核心原则：

```text
业务能力先以代码白名单注册为 Capability，
再由现有 LLM-first ChatRoute 识别和分发，
经过目标 Capability 权限、Policy、Context、Schema 和审计后，
调用确定性业务 Handler。
```

当前真实状态与缺口见 `current-state-and-gaps.md`。业务场景只定义自己的业务 Schema、能力条目和 Handler，不重复定义本文件的公共机制。

## 2. Capability 类型

| 类型 | 说明 | 是否改状态 | 示例 |
| --- | --- | ---: | --- |
| `answer` | 问答、解释、说明 | 否 | 解释权限范围 |
| `draft` | 生成结构化草稿 | 否 | 生成人员调整草稿 |
| `diagnose` | 诊断错误或异常 | 否 | 解释公式校验失败 |
| `query` | 查询已授权数据 | 否 | 查询候选员工 |
| `preview` | 只读试算或预览 | 否 | 补偿金试算 |
| `apply` | 把草稿填入编辑器 | 仅前端状态 | 应用公式草稿 |
| `write` | 写入业务数据 | 是 | 保存已确认业务对象 |
| `export` | 生成或导出文件 | 是 | 导出报表 |
| `send` | 对外发送 | 是 | 推送飞书消息 |

## 3. 当前代码注册基线

当前唯一注册真理源是 `hr-portal/backend/app/ai/capabilities.py` 的 `CapabilityDefinition` 和 `CAPABILITIES`。真实字段包括：

```text
capability_id
name
module
type
description
version
is_enabled
ai_visible
required_permission
risk_level
side_effect_tags
confirmation
tools
policy_profile
model_profile
audit_enabled
sensitive_context
examples
failure_modes
input_schema
output_schema
```

第一阶段继续采用代码白名单，不使用装饰器动态注册，不允许通过数据库注册任意 URL、Python 代码或模型工具。

### 3.1 受限 DB Override（未实施目标态）

未来如建设管理界面，数据库只能覆盖受限展示或运行配置，例如：

- `is_enabled`；
- `ai_visible`；
- 展示名和示例问法；
- Prompt 版本；
- 经安全评审允许覆盖的风险配置项。

数据库不得新增 Handler、放宽代码定义的权限、扩大工具白名单或降低强制确认等级。原设计中的 `ai_capabilities` / `ai_capability_policies` 目前不存在，不得按已实现能力引用。

## 4. ChatRoute 绑定协议

现有 `app/ai/router.py` 的 `ChatRoute` 统一绑定：

- `intent`；
- `capability_id`；
- `description`；
- `extractor`；
- `handler`。

新增 chat 能力只追加 ChatRoute，不修改 LLM-first 主路由原则：

1. LLM 在已注册 ChatRoute 中做意图分类；
2. `active_capability_id` 承担多轮状态续接；
3. 分类失败返回 `general_question`；
4. 不使用散落的关键词或正则 Router；
5. 高风险动作不因 LLM 分类结果直接执行，仍需确定性业务 API、确认和审批。

ChatRoute 的 `capability_id` 必须能在代码注册表中解析；不得只注册 Route 而缺失 Capability 元数据。

## 5. 目标 Capability 统一权限与 Policy 闸

当前 `/ai/chat` 入口对 `ai.chat` 做统一校验。Phase 0A 需要在 Route 解析成功后、Extractor/Handler 执行前增加目标 Capability 强制校验：

```text
route.capability_id
  -> 读取 CapabilityDefinition
  -> is_enabled / ai_visible
  -> required_permission
  -> validate_capability_policy
  -> 记录 matched_capability_id 和结果
  -> Extractor / Handler
```

该闸只负责能力入口许可和公共 Policy，不替代 Handler/业务服务中的行级、列级、对象级和动作级权限。

## 6. `BaseCapabilityPlan`

所有 Extractor 的结构化结果应收口到公共 Plan 基线：

```json
{
  "capability_id": "hr.adjustment.collect",
  "intent": "hr.adjustment.collect",
  "action": "create_draft",
  "arguments": {},
  "missing_fields": [],
  "requires_confirmation": true,
  "context_requirements": {
    "builder": "hr_adjustment",
    "masking_policy": "minimal_candidate_fields"
  },
  "risk": "high"
}
```

业务 Plan 可以扩展 `arguments` 和受控业务字段，但不得改变公共字段语义。模型输出必须先通过 Pydantic/JSON Schema，失败时不创建正式业务对象。

## 7. `CapabilityResultEnvelope`

新增能力统一返回：

```json
{
  "intent": "hr.adjustment.collect",
  "status": "requires_confirmation",
  "answer": "已整理出 1 条人员调整",
  "capability_id": "hr.adjustment.collect",
  "result": {
    "type": "adjustment_draft",
    "data": {},
    "artifacts": [],
    "actions": []
  },
  "permission": {
    "filtered": true,
    "note": "已按当前用户数据范围过滤"
  },
  "masking": {
    "applied": true
  },
  "trace_id": "..."
}
```

公共字段说明：

- `intent`：归一化意图；
- `status`：统一执行状态；
- `capability_id`：实际命中的业务能力；
- `result.type`：前端渲染类型；
- `result.data`：业务数据；
- `result.artifacts`：文件、报告、卡片等产物；
- `result.actions`：允许用户触发的受控动作；
- `permission`：权限过滤说明，不暴露权限内部细节；
- `masking`：脱敏是否应用；
- `trace_id`：跨 AI、业务和 UCP 的追踪标识。

现有 `AiChatOut` 必须一次性迁移为本协议：删除 `compensation`、`candidates`、`missing_fields`、`extracted`、`artifact` 和顶层 `actions`，不设兼容期、不双写。以后新增或重构能力只能扩展已登记的 `result.type` 及其类型化 `result.data` Schema，不得增加任何业务专属顶层字段。公共响应模型和契约测试必须启用额外字段拒绝，并精确锁定顶层字段白名单。具体实施任务见 [capability-result-envelope-atomic-tasks.md](capability-result-envelope-atomic-tasks.md)。

统一状态至少包括：`pending`、`requires_input`、`requires_confirmation`、`running`、`succeeded`、`partial_success`、`failed`、`cancelled`。

## 8. Handler 契约

每个 Handler 必须：

1. 复用目标 Capability 公共权限/Policy 闸；
2. 在确定性查询层执行行级、列级和对象级权限；
3. 显式声明 Context Builder 与 masking 策略；
4. 只向模型发送完成任务所需的最小数据；
5. 调用业务服务而非直接写业务状态；
6. 返回 `CapabilityResultEnvelope`；
7. 写入实际命中能力、权限判断、失败阶段和业务关联 ID；
8. 保证 Web、飞书等渠道复用同一 Handler。

### 8.1 模型输入安全

- 用户原始描述可按能力需要进入模型；
- 候选实体由后端查询，不把整表数据发给模型；
- 重名候选只返回最小必要字段；
- 凭证、token、请求头、内部密钥和未脱敏敏感明细不得进入模型或审计摘要；
- Prompt 不是安全边界。

## 9. UCP Pipeline 适配

AI Runtime 不新建 Workflow Orchestrator。

```text
Dynamic Plan
  -> Plan Validator
  -> Capability / UCP Node 映射
  -> app/ucp/pipeline_engine.py
  -> UCP Run / Step Run
  -> CapabilityResultEnvelope
```

AI 层负责计划、验证、风险识别、节点映射、结果解释和审计关联。UCP 负责凭证、DAG、等待、审批、限流、重试、执行状态、外部调用、Run/Step Run 和监控。业务域负责业务状态机、业务规则和安全输入适配。

## 10. 业务能力索引

### 10.1 已有公共与场景能力

现有代码注册表已覆盖公式、补偿金、文档、权限解释、自动化、数据对账等能力。真实清单以 `capabilities.py` 为准，本文不复制完整代码列表。

### 10.2 组织与人员调整

HR Agent 首个完整高风险业务场景计划注册：

| capability_id | 类型 | 说明 |
| --- | --- | --- |
| `hr.adjustment.collect` | draft | 从自然语言收集调整草稿 |
| `hr.adjustment.resolve` | query | 解析员工、组织和上级候选 |
| `hr.adjustment.query` | query | 查询授权范围内的调整状态 |
| `hr.adjustment.explain` | answer | 解释规则、状态和失败原因 |

具体 `AdjustmentPlan`、`AdjustmentDraftData`、状态机和任务以 `../008-hr-adjustment-assistant/atomic-tasks.md` 为准。不得注册可由 LLM 直接调用北森写接口的 execute Capability。

## 11. 管理界面边界

在 DB Override 未实现前，能力管理页最多展示代码注册表、调用统计和评测结果，不能声称可持久化启停、修改权限或改变确认策略。

未来管理功能必须区分：

- 可配置的展示/运营字段；
- 只能通过代码评审修改的安全边界；
- 调用、失败、权限拒绝和评测记录。

## 12. 评测与审计

每个 Capability 至少维护：正常、缺字段、低置信度、越权、敏感数据、Provider 失败、Schema 失败和确认流程用例。

审计至少记录：

```text
normalized_intent
matched_capability_id
parse_mode
permission_result
policy_result
failure_stage
used_tools
conversation_id
business_object_id / pipeline_run_id（如有）
trace_id
token / duration
```

评测和审计用于发现退化，不得把用户正反馈自动发布为新 Capability。
