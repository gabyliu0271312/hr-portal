# AI 公共能力当前状态与缺口

> 文档类型：事实台账，不承载长期产品战略或具体业务任务。
> 最后核验：2026-07-18
> 核验范围：`hr-portal/backend/app/ai/`、`hr-portal/backend/app/ucp/` 及现有业务 ChatRoute。

## 1. 总体判断

现有 AI 公共底座的基础组件大部分已经实现，但尚未收口成完整、可强制复用的通用 Runtime。

更准确的判断是：底层零件约已具备 70%，剩余约 30% 集中在统一协议、权限/脱敏强制点和执行状态收口。当前任务不是重建“最小 AI 底座”，而是盘点并收口现有主链。

## 2. 公共能力实施状态

| 能力 | 状态 | 代码位置 | 后续动作 |
|---|---|---|---|
| `CapabilityDefinition` 与代码注册表 | 已实现 | `app/ai/capabilities.py` | 直接复用，不新建能力表 |
| Capability 权限、风险、确认、工具和审计元数据 | 已实现 | `app/ai/capabilities.py` | 以代码定义为安全边界 |
| `ChatRoute` 注册与分发 | 已实现 | `app/ai/router.py` | 新场景追加 Route，不建第二套路由 |
| LLM-first 意图分类 | 已实现 | `app/ai/router.py` | 沿用模型分类与会话续接，不加关键词 Router |
| 场景 Extractor + Handler 框架 | 已实现 | `app/ai/router.py` | 按公共 Handler 契约扩展 |
| 输入输出 Schema 校验 | 已实现 | `app/ai/schema_validator.py` | 直接复用 |
| Policy Guard | 已实现 | `app/ai/policy_guard.py` | 补目标 Capability 统一校验 |
| PostgreSQL 多轮会话 | 已实现 | `app/ai/conversation.py`、`AiConversation` | 直接复用，不另建 Redis 真理源 |
| AI 审计与 `trace_id` | 已实现基础 | `app/ai/audit.py`、`router.py` | 补实际命中能力和失败阶段 |
| Context Packet | 已实现基础 | `app/ai/context_builder.py` | 补权限、字段裁剪和脱敏强制契约 |
| `BaseCapabilityPlan` | 未统一 | 各 Extractor 返回普通 `dict` | Phase 0A 建立公共协议 |
| `CapabilityResultEnvelope` | 已实现（Web Chat） | `AiChatOut`、`CapabilityResultOut`、`router.py` | 后续飞书/UCP 接入时直接复用，不设旧字段兼容期 |
| 通用 Capability Runtime | 部分实现 | `global_ai_chat` 主链集中在 `router.py` | 收口现有主链，不另起 Runtime |
| 子 Capability 统一权限/Policy 闸 | 未完全收口 | `/ai/chat` 当前先校验 `ai.chat` | 分发后强制校验目标 Capability |
| 行级/列级权限统一注入 | 场景化实现 | 各业务 Handler/查询服务 | Handler 必须显式声明并执行 |
| AI 输入统一脱敏 | 未完全收口 | `app/ucp/masking.py` 已有工具 | 建立模型调用前统一契约和调用点 |
| Web/飞书共享 Handler | 未完成 | Web 主链已存在；飞书以通知/卡片为主 | Web UAT 后接入同一 Handler |
| 通用 Execution State | 未完成 | 各场景状态不统一 | 定义 pending/running/partial_success 等公共语义 |
| AI Plan 与 UCP Pipeline 适配 | 未完成 | `app/ucp/pipeline_engine.py` 已实现执行底座 | 只补 Plan Validator 和节点映射 |

## 3. 当前 P0 缺口

### 3.1 目标 Capability 统一权限和 Policy 闸

`global_ai_chat` 已完成：意图分类 → ChatRoute → Extractor → Handler → 会话持久化 → 输出 Schema → 审计。但入口统一校验的是 `ai.chat`，找到具体 ChatRoute 后尚未在统一分发点强制执行目标 Capability 的权限与 Policy。

Phase 0A 必须在 Handler 调用前统一完成：

```text
route.capability_id
  → get target CapabilityDefinition
  → required_permission 校验
  → validate_capability_policy
  → 记录允许/拒绝及 failure_stage
```

各 Handler 的业务数据权限仍需保留；公共权限闸不能替代行级、列级和对象级权限。

### 3.2 `BaseCapabilityPlan`

各 Extractor 当前返回普通 `dict`。应定义公共 Plan 基线，至少统一：

- `capability_id`；
- `intent`；
- `action`；
- `arguments`；
- `missing_fields`；
- `requires_confirmation`；
- `context_requirements`；
- `risk`。

业务场景在其上扩展，例如 008 定义 `AdjustmentPlan`，但不得各自发明一套互不兼容的顶层协议。

### 3.3 `CapabilityResultEnvelope`

Web Chat 已完成一次性不兼容收口：`AiChatOut` 仅保留通用顶层字段，业务数据、产物和动作统一放入 `result.data`、`result.artifacts`、`result.actions`。`result.type` 已登记并由类型化 Schema 校验；前端全局 AI 助手也仅按 `result.type` 分派渲染。

以后新增业务不得增加或恢复顶层专属字段，也不得双写兼容。飞书和 UCP 接入时必须复用同一 Envelope；具体契约与验收见 [capability-result-envelope-atomic-tasks.md](capability-result-envelope-atomic-tasks.md)。

### 3.4 Handler 的权限、脱敏与 Context 契约

每个 Handler 必须显式声明并落实：

1. 功能权限；
2. 行级/列级/对象级数据范围；
3. 发送模型前的字段裁剪和 masking；
4. Context Packet 的构建方式；
5. 最小必要候选字段；
6. 结果权限说明与脱敏说明；
7. 审计摘要和禁止落日志字段。

对于组织与人员调整：模型可以看到用户原始描述；员工、组织和上级候选必须由后端查询；不得把整张花名册、北森凭证、请求头或未脱敏明细发送给模型。

### 3.5 审计和执行状态

AI 审计需要明确记录：

- `normalized_intent`；
- `matched_capability_id`；
- `parse_mode`；
- 权限/Policy 拒绝；
- `failure_stage`；
- 业务执行和 UCP Run/Step Run 关联。

通用执行状态至少覆盖：`pending`、`requires_input`、`requires_confirmation`、`running`、`succeeded`、`partial_success`、`failed`、`cancelled`。

## 4. UCP 复用边界

AI Workflow 不新建执行引擎。

```text
Dynamic Plan
  → Plan Validator
  → Capability / UCP Node 映射
  → app/ucp/pipeline_engine.py
  → UCP Run / Step Run
  → CapabilityResultEnvelope
```

AI Runtime 负责结构化计划、风险识别、节点映射、结果解释和 AI 审计关联。UCP 负责 DAG、等待、审批、重试、状态、凭证、外部调用、Run/Step Run 和监控。业务域负责业务规则、状态机和 UCP 输入适配。

## 5. 禁止重建

- 不新建第二套 Capability Registry 或 `agent_skills` 表。
- 不新建第二套 Chat Router、Workflow Orchestrator、审批引擎或会话真理源。
- 不让模型直接调用北森写接口、任意 URL、SQL 或代码。
- 不用关键词/正则兜底替代现有 LLM-first ChatRoute。
- 不在业务场景中复制公共 Result、权限闸、Context Packet、审计或飞书 SDK。

## 6. 当前实施顺序

1. 阶段 0A：收口目标 Capability 权限、Plan、Result、审计和 Handler 契约，并回归现有 ChatRoute。
2. 阶段 0B：完成组织与人员调整的业务规则确认及北森 + UCP 技术切片。
3. 阶段 1：完成调整助手 Web 业务闭环。
4. 阶段 2：完成 UCP 预演、审批、执行、部分失败和重试。
5. 阶段 3：飞书复用同一 Handler 和 Result Envelope。
6. 阶段 4：继续 HR Agent 指标、分析、图表等能力。

具体产品路线见 `../../HR-Agent建设方案-专家修订版.md`，具体调整任务见 `../008-hr-adjustment-assistant/atomic-tasks.md`。
