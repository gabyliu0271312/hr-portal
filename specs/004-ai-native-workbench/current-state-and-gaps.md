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
| 飞书公共渠道底座 | 未完成 | 飞书以通知/卡片为主；对话 Bot 入站、身份桥接与受控回调未收口 | 在 `app/integrations/feishu` 建设公共验签、幂等、映射、会话、Envelope 适配、受控 action 与总开关 |
| Web/飞书共享 Handler | 部分完成 | Web 主链已存在；飞书业务接入未完成 | 首个只读 Capability 可复用公共底座验证；正式写业务闭环仍在调整助手 Web/UCP 验收后接入 |
| 通用 Execution State | 未完成 | 各场景状态不统一 | 定义 pending/running/partial_success 等公共语义 |
| AI Plan 与 UCP Pipeline 适配 | 未完成 | `app/ucp/pipeline_engine.py` 已实现执行底座 | 只补 Plan Validator 和节点映射 |

## 3. 当前 P0 缺口

### 3.0 飞书公共渠道底座与受控会话动作

飞书可以先以低风险只读场景验证，但不是业务场景各自建设机器人。公共层必须先在 `app/integrations/feishu` 收口以下能力：

1. 事件验签、URL challenge、时间窗/nonce 校验和事件幂等；
2. `open_id` 到启用 Portal User 的身份映射，以及渠道会话创建和绑定；
3. `CapabilityResultEnvelope` 到飞书消息/卡片的通用适配入口；
4. 卡片回调验签与通用受控 action 分发；
5. 统一渠道审计字段、测试应用隔离和可立即关闭的总开关。

候选选择等授权状态转换使用无业务语义的 opaque selection handle。公共 action 分发器必须在 LLM-first 分类前完成用户、渠道、会话、过期和单次消费校验，再重新执行对象范围和字段权限；handle 不得进入模型消息、模型审计载荷或通用会话 history。公共 action 控制记录可保存经注册、由服务端签发且不可由客户端覆盖的最小 action context，用于模型外确定性续接；不得保存原始消息、人员字段值、候选展示值或其他业务结果。业务 Capability 只注册 action、其受限 context Schema 和复用 Handler，不得私建回调协议。

公共 Web action 契约固定为 `POST /api/v1/ai/conversations/{conversation_id}/actions`：请求体仅含 `action_type` 和 action 所需的受控字段（例如 `selection_handle`），不得复用聊天 `message`；成功响应统一为 `CapabilityResultEnvelope`。公共错误语义至少包括 `400`（Schema/未知 action）、`401`（认证失效）、`403`（目标 Capability Gate 拒绝）、`410`（统一的 handle 无效/过期/已消费/绑定不匹配）、`429`（Capability 限速）和 `500`（受控内部错误）。飞书卡片回调先完成平台验签后调用同一分发器。

通用 Capability 限速必须由 004 提供并通过统一 Settings/配置注入，不允许业务 Capability 各自按 IP、渠道或临时内存语义实现。限速键固定为已认证 Portal `user_id + capability_id`，同一 Portal 用户经 Web 与飞书进入时共享计数；飞书必须先将 `open_id` 映射为 Portal User，才可参与计数。生产默认启用滚动窗口 `window_seconds=300`、`max_requests=20`，默认值可配置但不得缺失；测试可通过 Settings/依赖 override 注入更小窗口与阈值。计数发生在目标 Capability Gate 成功后、Extractor、数据查询和 action Handler 前，覆盖该 Capability 的所有请求结果，包括成功、无匹配、缺输入、候选返回和受控 action 选择。超过限额返回 HTTP `429` 与中性文案“请求过于频繁，请稍后再试”，可设置 `Retry-After`，但不得返回剩余额度、查询条件、候选数量或人员线索。限速日志/告警仅记录 `user_id`、`capability_id`、当前计数、窗口、`trace_id` 与 `channel`，不得记录姓名、工号、候选内容或 handle；同一用户/能力/窗口的告警必须去重。

004 必须提供 Capability 级审计投影/净化契约，而不是默认持久化完整聊天 `message`、`history`、`input_payload` 或 `output_payload`。涉及个人资料等受控读取的 Capability 只能写入经注册的最小审计字段；公共 action 控制记录与 AI 审计记录必须分别定义访问权限、保留期、清理/归档策略及可验证执行路径。业务 Capability 只能声明自身允许的审计投影，不得私建审计表、绕过公共清理机制或把 action handle、原始消息、人员字段值写入通用审计载荷。

`employee.profile.query` 是首个受控验证接入：仅内部测试账号、仅私聊、只读、单 Capability、无群聊/导出、限速、独立审计、可关闭并设置有效期。该验证不改变“调整助手正式飞书业务闭环在阶段 3 推进”的主路径。

受控验证必须使用统一 Settings 并 fail closed。015 的最小配置为：`EMPLOYEE_PROFILE_ENABLED=false`、`EMPLOYEE_PROFILE_ALLOWED_USER_IDS=`、`EMPLOYEE_PROFILE_EXPIRES_AT=`、`FEISHU_EMPLOYEE_PROFILE_ENABLED=false`、`FEISHU_EMPLOYEE_PROFILE_ALLOWED_USER_IDS=`。两个 allowlist 均存 Portal `user_id`；前者同时限制 Web 与飞书，后者仅在已完成 `open_id` 映射后的飞书请求上追加限制。自然语言入口先以完整、低敏 Route Catalog 完成 LLM-first 分类：未命中 `employee.profile.query` 时，既有 Capability 链路不受这些配置影响；命中后才执行全局开关 → 到期时间 → 通用 Portal 用户 allowlist →（仅飞书）渠道开关与飞书 allowlist → Target Capability Gate → 通用限速 → Extractor/查询 Handler。配置缺失、空 allowlist、解析失败、当前时间已达到/超过到期时间或渠道开关关闭时，必须以 HTTP `403` 拒绝已命中的员工查询或显式 action，对外统一文案为“当前功能暂未开放”，且不得进入员工画像 Extractor、Context Packet、查询、action Handler 或员工查询审计投影；分类器可被调用。内部仅记录无敏感载荷的细分拒绝原因，例如 `controlled_rollout_disabled`、`controlled_rollout_expired`、`controlled_rollout_allowlist_denied`、`feishu_rollout_denied`，不得把这些原因返回前端、飞书卡片或普通用户。显式 action 已由 `action_type` 指明目标 Capability，可在 LLM-first 分类前执行同一受控验证 Gate；handle 的无效、过期、已消费或绑定不匹配仍统一为 HTTP `410`。到期时间使用带时区的 UTC ISO-8601 值；在受控验证阶段不得为空。

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
- `scope_filter_applied`、`scope_filter_restrictive` 与 `scope_resolution_status`（仅内部审计，不复用为面向用户的权限提示）；
- 业务执行和 UCP Run/Step Run 关联。

审计运行时必须支持 Capability 专属的最小投影：高敏或受控读取场景不能直接复用“完整请求/完整响应”持久化。投影配置要明确允许字段、审计表与 action 控制表的访问角色、保留期和清理/归档作业；日志、异常和告警也必须使用相同的净化边界。

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
