# AI 能力统一结果协议全量收口

> 文档类型：原子级开发任务文档  
> 实施范围：`POST /api/v1/ai/chat`、现有全部 `ChatRoute`、全局 AI 助手前端及相关测试/公共规范  
> 迁移策略：一次性不兼容升级，不保留旧响应字段  
> 现状核验日期：2026-07-18

## 1. 背景与目标

- 背景：
  - 当前 `AiChatOut` 同时包含通用字段和 `candidates`、`compensation`、`missing_fields`、`extracted`、`artifact` 等能力特异性顶层字段。
  - `actions` 当前也位于响应顶层，而目标公共协议要求动作归入 `result.actions`。
  - `artifact` 是任意 `dict`，自动化规则草稿和数据对比结果共用该字段，前端只能依靠对象特征猜测渲染组件。
  - 当前 `status` 混用 `success`、`ok`、`compare_results`、`need_employee`、`missing_slots`、`error` 等业务状态，尚未使用统一执行状态。
  - 当前响应没有稳定返回实际命中的 `capability_id`、权限过滤说明和脱敏说明。
- 目标：
  - 将已有全部 `/ai/chat` 返回一次性迁移为统一 `CapabilityResultEnvelope`。
  - 删除旧顶层字段，不提供双写、别名、兼容适配器或灰度开关。
  - 现有补偿金试算、权限范围说明、自动化规则草稿、数据对比和通用失败/不支持场景全部使用相同外层协议。
  - 前端只通过 `result.type` 选择渲染器，只从 `result.data`、`result.artifacts`、`result.actions` 读取能力结果。
  - 用公共规范、Pydantic 严格模型和契约测试锁定顶层字段白名单，防止后续能力再次增加业务专属顶层字段。
- 非目标 / 不做范围：
  - 不兼容旧版前端或其他旧调用方。
  - 不保留 `compensation`、`candidates`、`missing_fields`、`extracted`、`artifact`、顶层 `actions`。
  - 不新建第二套 AI Runtime、Chat Router、Capability Registry、会话存储或审批引擎。
  - 不改变补偿金计算、数据对比、自动化规则保存、权限范围计算等业务规则。
  - 不在本任务中建设持久化 `ai_artifacts` 表或通用 Artifact 执行接口。
  - 不改变 `/ai/chat` 请求体；`conversation_id` 继续作为通用会话字段保留在响应顶层，以维持现有 PostgreSQL 多轮会话续接。

### 1.1 假设与待确认事项

- 已确认：本次采用不兼容升级，后端与前端必须同批发布。
- 合理假设：`conversation_id` 属于跨能力通用会话元数据，不是业务专属字段，因此允许继续作为顶层可选字段。
- 合理假设：现有自动化规则草稿和数据对比结果是可直接渲染的结构化数据，迁入 `result.data`；`result.artifacts` 本期保留为空数组，待未来出现文件、报告或持久化卡片产物时使用。
- 合理假设：`extracted` 仅用于后端会话和审计，不再作为 API 输出；前端现状未消费该字段。
- 合理假设：`missing_fields` 和候选人员属于能力业务数据，迁入 `result.data`，不再放在顶层。

## 2. 用户场景

### 2.1 普通用户使用全局 AI 助手

- 入口：任意 Portal 页面右下角“全局 AI 助手”。
- 操作：输入补偿金试算、查询数据权限、创建自动化规则草稿或数据对比指令。
- 系统反馈：
  - 聊天气泡显示 `answer`。
  - 前端按 `result.type` 渲染候选员工、补偿金结果、自动化规则草稿或数据对比结果。
  - 按 `result.actions` 渲染跳转、协议预览、协议打印等受控动作。
  - 继续显示 `trace_id` 供排障。
- 成功结果：用户现有功能和交互保持不变，但数据来源全部切换为新协议。
- 失败/空态/无权限表现：
  - 缺少输入：`status=requires_input`，`result.data.missing_fields` 给出缺失字段，聊天区显示追问。
  - 无候选数据：`status=failed`，`answer` 说明未找到有权查看的员工，结果卡不显示。
  - 无功能权限：HTTP 403，前端沿用统一错误消息。
  - AI 未配置或不支持：`status=failed`，返回 `capability_id=ai.chat` 和空结果结构。

### 2.2 开发人员新增 AI 能力

- 入口：在 `app/ai/capabilities.py` 注册 Capability，并在 `app/ai/router.py` 追加 `ChatRoute`。
- 操作：定义该能力的输入 Schema、`result.type`、对应 `result.data` Pydantic Schema 和 Handler。
- 系统反馈：若 Handler 返回旧顶层字段、未声明 `capability_id`、使用非统一状态或返回未登记的 `result.type`，契约测试失败，禁止合并。
- 成功结果：新能力无需修改公共顶层响应模型，只扩展受控的结果类型和业务数据模型。

## 3. 功能范围

| 功能项 | 是否本期实现 | 说明 |
|---|---|---|
| 统一 `CapabilityResultEnvelope` Pydantic 模型 | 是 | 收口外层、结果、权限、脱敏、动作与产物结构 |
| 删除已有业务专属顶层字段 | 是 | 不兼容删除，不双写 |
| 全量迁移现有 4 条 ChatRoute | 是 | 补偿金、权限范围、自动化规则、数据对比 |
| 通用失败/降级结果迁移 | 是 | AI 未配置、不支持、解析不清等 |
| 统一执行状态 | 是 | 仅允许公共 8 态 |
| 前端 API 类型迁移 | 是 | 只保留新协议类型 |
| 全局 AI 助手渲染迁移 | 是 | 按 `result.type` 分派 |
| 公共规范强制约束 | 是 | 更新技术宪法、能力协议、现状台账和导航 |
| 顶层字段契约锁测试 | 是 | 精确断言允许字段集合 |
| 各 result 类型前后端回归 | 是 | 正常、缺字段、权限、空数据、失败 |
| 数据库 migration | 否 | 本任务不改表、不迁移会话数据 |
| 旧响应兼容层 | 否 | 明确禁止 |
| 飞书入口改造 | 否 | 当前飞书尚未复用该 Chat Handler；未来接入时直接消费新协议 |

## 4. 技术设计

### 4.1 数据库 / 数据模型

不涉及数据库表、索引或 Alembic migration。

- `AiConversation` 及现有 PostgreSQL 会话真理源保持不变。
- `conversation_id` 继续由现有会话层生成并返回。
- `extracted` 从 API 输出删除，不等于删除后端 Extractor 结果；Handler 和会话槽位仍可在内部使用提取结果。
- downgrade：代码回滚必须后端与前端一起回滚到同一版本；不存在数据库 downgrade。

### 4.2 后端接口

#### 4.2.1 接口

- URL：`POST /api/v1/ai/chat`
- Method：`POST`
- 权限：入口 `ai.chat` + 实际命中 Capability 的 `required_permission` + Handler 内行级/列级/对象级权限。
- Request Schema：维持现有 `AiChatIn`，不改字段。

#### 4.2.2 Response Schema

```json
{
  "intent": "compensation.calculate",
  "status": "succeeded",
  "answer": "已完成补偿金只读试算",
  "capability_id": "compensation.calculate_preview",
  "conversation_id": 123,
  "result": {
    "type": "compensation_preview",
    "data": {
      "compensation": {},
      "candidates": [],
      "missing_fields": []
    },
    "artifacts": [],
    "actions": []
  },
  "permission": {
    "filtered": true,
    "note": "已按当前用户数据范围过滤"
  },
  "masking": {
    "applied": false
  },
  "trace_id": "..."
}
```

顶层字段白名单：

| 字段 | 必填 | 说明 |
|---|---|---|
| `intent` | 是 | 归一化意图 |
| `status` | 是 | 公共执行状态枚举 |
| `answer` | 是 | 用户可读答复 |
| `capability_id` | 是 | 实际命中的 Capability；通用降级为 `ai.chat` |
| `conversation_id` | 否 | 通用会话 ID，不承载业务数据 |
| `result` | 是 | 唯一业务结果容器 |
| `permission` | 是 | 权限过滤说明 |
| `masking` | 是 | 脱敏执行说明 |
| `trace_id` | 否 | 审计追踪 ID |

明确禁止的顶层字段：`actions`、`candidates`、`compensation`、`missing_fields`、`extracted`、`artifact`，以及任何后续新增的业务字段。

`result` 固定结构：

```text
CapabilityResultOut
├── type: str
├── data: 受 result.type 约束的业务 Schema
├── artifacts: list[CapabilityArtifactOut]
└── actions: list[AiActionOut]
```

约束：

- `AiChatOut`、`CapabilityResultOut`、`PermissionResultOut`、`MaskingResultOut` 使用 `extra="forbid"`，拒绝未声明字段。
- `result.data` 不允许长期保持无约束任意 `dict`；每个 `result.type` 必须绑定一个明确 Pydantic 模型，并在 Capability `output_schema` 或测试中登记。
- `result.artifacts` 只放文件、报告、持久化卡片等产物描述，不把任意业务对象塞入该数组。
- `result.actions` 是唯一动作出口；动作继续复用现有 `AiActionOut`。

#### 4.2.3 公共状态枚举与现状映射

仅允许：`pending`、`requires_input`、`requires_confirmation`、`running`、`succeeded`、`partial_success`、`failed`、`cancelled`。

| 现有状态 | 新状态 | 业务细节放置位置 |
|---|---|---|
| `success`、`ok`、`compare_results` | `succeeded` | `result.type` 区分试算、比较和查询结果 |
| `agreement_preview`、`agreement_print` | `succeeded` | 动作类型放 `result.actions[].type` |
| `need_compensation_context`、`need_more_results`、`need_employee`、`need_employee_selection`、`need_more_info`、`missing_slots`、`unclear` | `requires_input` | `result.data.missing_fields`、候选项或追问信息 |
| `draft_created` | `requires_confirmation` | `result.type=automation_rule_draft` |
| `not_found`、`validation_error`、`error`、`ai_unconfigured`、`unsupported` | `failed` | `answer` 和受控错误信息 |

#### 4.2.4 本期 result 类型

| `result.type` | `result.data` 关键字段 | 现有来源 |
|---|---|---|
| `message` | `{}` 或受控 `reason_code` | 通用失败、AI 未配置、不支持、权限范围纯文本结果 |
| `compensation_input` | `candidates`、`missing_fields` | 补偿金缺员工、重名选择、缺日期等 |
| `compensation_preview` | `compensation`、`candidates`、`missing_fields` | 补偿金成功试算 |
| `compensation_comparison` | `comparison`、可选 `compensation` | 最近两次或 N/N+1 比较 |
| `automation_rule_draft` | 现有规则草稿、校验错误、缺失槽位、待配置项 | 原顶层 `artifact` |
| `data_compare_result` | 现有 `CompareResult` 完整结构 | 原顶层 `artifact` |

说明：`permission_scope_description` 如只使用 `answer` 展示，本期可使用 `type=message`；若后续需要结构化标签卡片，再新增明确 Schema，不新增顶层字段。

#### 4.2.5 状态码与错误处理

- 200：能力正常结束，包括 `requires_input`、`requires_confirmation`、业务 `failed` 等可预期结果。
- 400：请求 Schema、日期格式等可归因于客户端请求的参数校验失败。
- 401：未登录。
- 403：缺少 `ai.chat`、目标 Capability 功能权限或对象权限。
- 500：服务端输出 Schema 校验失败或未捕获服务异常；返回受控错误和 trace_id，不得返回敏感堆栈。
- 不允许为迁移兼容而在响应中恢复旧字段。

### 4.3 业务逻辑

#### 4.3.1 公共组装流程

```text
ChatRoute 匹配
  → 目标 Capability 权限/Policy 校验
  → Extractor
  → Handler 生成类型化 result.data
  → 公共 Envelope 组装 capability_id / status / permission / masking
  → Pydantic 严格校验
  → 审计
  → 返回前端
```

- Handler 必须明确返回实际 `capability_id`，不能统一写成 `ai.chat`。
- `permission.filtered` 必须反映本次结果是否执行了数据范围/对象过滤，不能固定写死为 `true`。
- `masking.applied` 必须反映本次输出是否真实执行脱敏，不能用“涉及敏感字段”代替“已经脱敏”。
- 审计元数据中的 `action_count` 改为统计 `len(out.result.actions)`。
- 审计元数据中的 `candidate_count` 从对应 `result.data` 受控读取；无候选类型时记 0。
- 审计 `output_payload` 使用新 Envelope；继续禁止凭证、请求头和未脱敏敏感数据入日志。

#### 4.3.2 现有后端调整清单

主要代码：[backend/app/ai/router.py](../../hr-portal/backend/app/ai/router.py)

1. `AiChatOut`：删除旧业务字段，新增统一模型和严格字段策略。
2. `_compare_comp_result_snapshots`：返回 `compensation_comparison`，不再写 `extracted`。
3. `_handle_compensation_chat`：迁移所有成功、追问、候选、协议动作、比较和失败分支。
4. `_handle_my_scope_chat`：补 `capability_id`、`result`、`permission`、`masking`。
5. `_handle_automation_rule_chat`：原 `artifact` 迁入 `result.data`，草稿完成使用 `requires_confirmation`。
6. `_handle_data_compare_chat`：原 `artifact` 迁入 `result.data`，`type=data_compare_result`。
7. `global_ai_chat`：通用降级和解析失败分支生成完整 Envelope；审计统计改读 `result`。
8. `ChatRoute.extractor` 当前第二返回值虽名为 artifact，但主链未消费；本任务应删除该歧义返回值或重命名为明确的 extractor metadata，禁止继续作为输出捷径。

### 4.4 前端与 UI/交互

主要代码：

- [frontend/src/api/ai.ts](../../hr-portal/frontend/src/api/ai.ts)
- [frontend/src/components/GlobalAiAssistant.vue](../../hr-portal/frontend/src/components/GlobalAiAssistant.vue)
- 继续复用：
  - [AutomationRuleArtifactPreview.vue](../../hr-portal/frontend/src/components/automation/AutomationRuleArtifactPreview.vue)
  - [CompareResultCard.vue](../../hr-portal/frontend/src/components/ai/CompareResultCard.vue)
  - [DocumentActionPreview.vue](../../hr-portal/frontend/src/components/document/DocumentActionPreview.vue)

#### API 类型

- 删除 `AiChatResult.actions/candidates/compensation/missing_fields/extracted/artifact`。
- 新增 `CapabilityResultEnvelope`、`CapabilityResult`、`PermissionResult`、`MaskingResult`。
- 为本期 `result.type` 定义可辨识联合类型，避免 `Record<string, any>` 作为主协议。
- `AiAction` 类型保留，但位置改为 `result.actions`。

#### 交互与渲染

- 页面路径和抽屉布局不变。
- 聊天气泡继续展示 `answer` 和 `trace_id`。
- `result.type=compensation_input`：展示候选员工列表或缺失信息提示。
- `result.type=compensation_preview`：展示补偿金结果卡。
- `result.type=automation_rule_draft`：复用自动化规则预览组件。
- `result.type=data_compare_result`：复用数据对比结果卡。
- 动作按钮统一读取 `result.actions`；自动执行协议预览/打印也只读取该数组。
- 未知 `result.type`：只展示 `answer`，不得尝试按对象字段猜类型；开发环境可记录受控警告。
- 加载态维持“正在处理...”。
- 空数据：只显示 `answer`，不渲染空卡片。
- 错误态：沿用请求异常气泡和 Element Plus 错误提示。
- 无权限：展示后端 403 `detail`，不展示任何结果卡。

### 4.5 权限、安全与外部系统

- 权限点：保持入口 `ai.chat` 和目标 Capability 权限叠加；本任务不得弱化 Handler 现有权限。
- 补偿金候选和试算：继续复用现有员工搜索、补偿金计算及其数据范围过滤。
- 数据对比：继续复用 `run_data_compare` 的权限、字段安全与脱敏逻辑。
- 权限范围说明：只描述当前用户自己的标签，不泄露其他用户权限配置。
- `permission.note` 只能说明结果经过范围过滤，不暴露内部规则 ID、SQL 条件或角色实现细节。
- `masking` 必须基于真实执行结果填写。
- 不让模型直接执行 SQL、北森写接口、任意 URL 或代码。
- UCP：本期不涉及执行；未来 UCP Run/Step Run 结果也必须归一化为同一 Envelope。
- 飞书：未来必须复用同一 Handler 和 Envelope；禁止为飞书另建响应协议。

## 5. 原子任务清单

- [x] R0001 定义统一后端结果模型与状态枚举
  - 前置任务：无
  - 功能范围：新增 Envelope、Result、Permission、Masking、Artifact 模型；改造 `AiChatOut`；启用 `extra="forbid"`。
  - 代码交付物：`backend/app/ai/router.py`；如拆分模型，仅允许放入现有 `app/ai/`，不得新建第二套 Runtime。
  - UI 要求：不涉及 UI。
  - UCP/外部系统要求：不涉及。
  - 测试要求：模型构造成功；缺必填字段失败；额外顶层字段失败；非法 status 失败。
  - 验收标准：`AiChatOut.model_fields` 仅包含顶层白名单；旧字段无法被构造或序列化。
  - 完成定义：模型、单测和 Schema 验证全部通过并有测试结果。

- [x] R0002 建立 result 类型登记与类型化 data Schema
  - 前置任务：R0001
  - 功能范围：定义本期 6 类 `result.type` 及对应 data 模型，建立可辨识联合或等价严格校验。
  - 代码交付物：`backend/app/ai/router.py` 或现有 `app/ai` Schema 文件；Capability `output_schema` 必要更新。
  - UI 要求：不涉及 UI。
  - UCP/外部系统要求：不涉及。
  - 测试要求：每种 type 正确 payload 通过；错配字段、未知字段和未知 type 失败。
  - 验收标准：不能再通过任意 `dict` 绕过业务输出契约。
  - 完成定义：所有现有 ChatRoute 均有明确 result type 和 Schema。

- [x] R0003 迁移补偿金能力全部返回分支
  - 前置任务：R0001、R0002
  - 功能范围：迁移员工缺失、重名候选、缺离职日期、试算、比较、协议预览/打印、未找到等全部分支。
  - 代码交付物：`backend/app/ai/router.py`。
  - UI 要求：后端输出必须提供前端原有卡片与候选列表所需数据。
  - UCP/外部系统要求：不涉及；继续复用补偿金确定性服务。
  - 测试要求：更新 `backend/tests/test_ai_capability_routes.py`；覆盖 N、N+1、两方案比较、最近两次比较、重名、无结果、缺日期、协议动作、权限不足。
  - 验收标准：所有分支无旧顶层字段；status 使用公共枚举；`capability_id=compensation.calculate_preview` 或实际文档能力；数据范围说明准确。
  - 完成定义：后端测试和接口 JSON 断言通过。

- [x] R0004 迁移权限范围说明能力
  - 前置任务：R0001、R0002
  - 功能范围：返回完整 Envelope，补齐 capability、permission、masking。
  - 代码交付物：`backend/app/ai/router.py`。
  - UI 要求：仅文本展示，不新增 UI。
  - UCP/外部系统要求：不涉及。
  - 测试要求：超管、无范围标签、单标签、多标签并集及异常场景。
  - 验收标准：`capability_id=scope.describe_my_scope`；无业务专属顶层字段；不泄露内部规则。
  - 完成定义：功能与权限语义回归通过。

- [x] R0005 迁移自动化规则草稿能力
  - 前置任务：R0001、R0002
  - 功能范围：将原 `artifact` 内容迁入 `result.data`；缺槽位使用 `requires_input`，草稿完成使用 `requires_confirmation`。
  - 代码交付物：`backend/app/ai/router.py`。
  - UI 要求：保持规则预览、保存、取消和待配置接收人提示所需字段完整。
  - UCP/外部系统要求：不得发送飞书消息；本能力只生成草稿。
  - 测试要求：缺触发器、缺接收人、校验失败、草稿成功、待配置 receiver IDs。
  - 验收标准：响应不再含 `artifact`；草稿组件所需字段在类型化 `result.data` 中。
  - 完成定义：Schema、Handler 和回归测试通过。

- [x] R0006 迁移数据对比能力
  - 前置任务：R0001、R0002
  - 功能范围：将 CompareResult 从原 `artifact` 迁入 `result.data`，统一状态和权限/脱敏说明。
  - 代码交付物：`backend/app/ai/router.py`。
  - UI 要求：保持 CompareResultCard 所需完整数据。
  - UCP/外部系统要求：不新增 SQL 执行路径，继续复用受控 CompareSpec 和后端执行器。
  - 测试要求：参数错误、Schema 错误、空结果、一致、存在差异、敏感字段脱敏、无权限。
  - 验收标准：`result.type=data_compare_result`；无任意 artifact 顶层输出。
  - 完成定义：后端数据对比及 AI 路由回归通过。

- [x] R0007 迁移全局降级、失败和审计逻辑
  - 前置任务：R0003-R0006
  - 功能范围：AI 未配置、不支持、解析失败等分支输出完整 Envelope；审计统计改读 `result`。
  - 代码交付物：`backend/app/ai/router.py`、必要的审计测试。
  - UI 要求：不新增 UI。
  - UCP/外部系统要求：不涉及。
  - 测试要求：AI 未配置、不支持、Extractor 失败、公共输出 Schema 失败；校验审计 capability、status、action_count、candidate_count。
  - 验收标准：每个 200 响应都包含 `capability_id/result/permission/masking`；审计不访问已删除字段。
  - 完成定义：异常与审计测试通过，无运行时属性错误。

- [x] R0008 清理 Extractor artifact 歧义返回值
  - 前置任务：R0003-R0007
  - 功能范围：将 Extractor 的三元组返回契约收口，删除未消费的任意 artifact 通道，或将其明确改为类型化 metadata。
  - 代码交付物：`backend/app/ai/router.py`、ChatRoute 类型签名与对应 Extractor。
  - UI 要求：不涉及 UI。
  - UCP/外部系统要求：不涉及。
  - 测试要求：所有路由 Extractor 返回契约测试；解析失败和缺槽位回归。
  - 验收标准：Handler 是业务结果唯一生产者；不存在绕过 Envelope 的任意 dict 输出捷径。
  - 完成定义：类型签名、实现与测试一致。

- [x] R0009 迁移前端 API 类型
  - 前置任务：R0001、R0002
  - 功能范围：删除旧字段定义；新增严格 Envelope 和 result 联合类型。
  - 代码交付物：`frontend/src/api/ai.ts`。
  - UI 要求：不改变视觉样式。
  - UCP/外部系统要求：不涉及。
  - 测试要求：TypeScript 类型检查和前端构建；禁止 `Record<string, any>` 作为主响应结果兜底。
  - 验收标准：业务代码无法再读取 `result.compensation`、`result.artifact` 等旧顶层字段。
  - 完成定义：类型检查与构建成功。

- [x] R0010 迁移全局 AI 助手结果分派与动作读取
  - 前置任务：R0009、R0003-R0007
  - 功能范围：按 `result.type` 渲染，数据读取迁入 `result.data`，动作迁入 `result.actions`。
  - 代码交付物：`frontend/src/components/GlobalAiAssistant.vue`；必要时新增现有 `components/ai/` 下的轻量结果分派组件。
  - UI 要求：保持现有抽屉、聊天气泡、候选列表、补偿金卡、规则草稿卡、对比卡、动作按钮、加载和错误表现。
  - UCP/外部系统要求：协议预览/打印继续复用 `DocumentActionPreview`。
  - 测试要求：组件测试或可复现手工 E2E；覆盖所有 result.type、空 data、未知 type、动作自动执行、规则保存后清卡。
  - 验收标准：前端不再按对象字段猜 artifact 类型；旧字段全局搜索为 0（非独立业务模块的同名字段除外）。
  - 完成定义：构建、交互和 UI 回归均有证据。

- [x] R0011 增加公共协议锁与全路由契约测试
  - 前置任务：R0003-R0010
  - 功能范围：锁定顶层白名单、统一状态、result 固定结构和现有路由完整返回。
  - 代码交付物：优先扩展 `backend/tests/test_ai_capability_routes.py`，必要时新增单一聚焦测试文件；前端增加类型/组件测试。
  - UI 要求：不涉及 UI。
  - UCP/外部系统要求：不涉及。
  - 测试要求：精确断言 `AiChatOut.model_fields`；遍历现有 ChatRoute；断言旧字段不存在；每种 result.type 至少一条成功和一条异常用例。
  - 验收标准：开发者未来向 `AiChatOut` 增加业务顶层字段或返回旧状态时，CI 必然失败。
  - 完成定义：契约测试稳定进入常规测试命令并通过。

- [x] R0012 更新 AI 公共规范并删除兼容表述
  - 前置任务：R0001、R0011
  - 功能范围：更新 `current-state-and-gaps.md`、`ai-capability-registry.md`、`ai-native-development-principles.md`、README 导航；明确不兼容、顶层白名单和准入检查。
  - 代码交付物：`specs/004-ai-native-workbench/` 下相关文档。
  - UI 要求：不涉及 UI。
  - UCP/外部系统要求：写明 Web/飞书/UCP 均复用同一 Envelope。
  - 测试要求：人工检查文档不存在“可兼容旧字段”表述；代码字段、状态和 result type 与文档一致。
  - 验收标准：以后新增 AI 能力的固定阅读顺序能直接看到强制协议；业务文档不得另定义顶层响应。
  - 完成定义：规范、代码和测试三者一致。

- [ ] R0013 执行端到端回归和同批发布检查
  - 前置任务：R0001-R0012
  - 功能范围：验证后端、前端、接口和主要用户路径；确认没有旧调用方残留。
  - 代码交付物：测试结果和交付说明，不新增兼容代码。
  - UI 要求：逐项验证候选选择、补偿金卡、规则草稿卡、数据对比卡、动作按钮、加载/错误/空态。
  - UCP/外部系统要求：确认本任务未改变 UCP 和飞书执行链。
  - 测试要求：后端定向 pytest、前端构建、全局旧字段搜索、浏览器 E2E、OpenAPI Schema 检查。
  - 已完成证据：旧顶层字段全仓搜索结果见 [evidence-r0013-legacy-callers.md](./evidence-r0013-legacy-callers.md)，未发现运行时旧调用方。
  - 未完成前置：浏览器 E2E、前后端同批发布版本对应和同步回滚验证证据。
  - 验收标准：后端与前端同版本上线；任一旧调用方未迁移则阻止发布，而不是恢复兼容字段。
  - 完成定义：开发、UI、测试、验收全部完成并有证据后才可勾选。

## 6. 测试计划

### 6.1 后端契约测试

1. `AiChatOut` 顶层字段精确等于白名单。
2. 构造 `compensation=`、`artifact=`、顶层 `actions=` 等旧字段时校验失败。
3. 每个响应均包含非空 `capability_id`、`result`、`permission`、`masking`。
4. status 只允许 8 个公共状态。
5. `result` 额外字段失败；`result.type` 与 data Schema 错配失败。
6. OpenAPI `/ai/chat` 响应 Schema 不再出现旧字段。

### 6.2 业务成功路径

- 补偿金：唯一员工自动命中、N、N+1、最近两次比较、同次 N/N+1 比较、协议预览、协议打印。
- 权限范围：超管、单标签、多标签并集。
- 自动化规则：完整输入生成草稿并进入确认状态。
- 数据对比：名单、字段、金额三类结果可返回并展示。

### 6.3 参数、空数据与失败路径

- 空消息由 Request Schema 拒绝。
- 日期格式错误返回 400。
- 员工关键词无结果返回业务 `failed`。
- 重名返回 `requires_input + compensation_input`。
- 缺离职日期、缺自动化槽位返回 `requires_input`。
- 自动化草稿 Schema 校验失败返回 `failed`。
- 数据对比参数/Schema 错误返回 `failed`。
- AI 未配置、意图不支持、模型解析失败均返回完整 Envelope。

### 6.4 权限与安全

- 无 `ai.chat` 权限：403。
- 无补偿金能力权限：403。
- 员工候选只含当前用户数据范围内记录。
- 数据对比字段权限和脱敏回归。
- `permission.filtered` 与真实过滤行为一致。
- `masking.applied` 与真实脱敏行为一致。
- 审计输出不含凭证、请求头、密钥或未脱敏明细。

### 6.5 前端与 E2E

- TypeScript 类型检查通过。
- 生产构建通过。
- 6 类 result.type 均按预期展示或降级为纯文本。
- 未知 result.type 不崩溃、不误渲染。
- 候选员工点击后继续同一 conversation。
- 动作按钮导航参数不丢失；协议预览/打印仍可自动执行。
- 自动化规则保存/取消后只清理当前消息的 result data，不影响会话。
- 后端 403、超时和 500 的错误气泡正确。

### 6.6 建议执行命令

在实际开发完成后按项目现有环境执行：

```text
后端：pytest tests/test_ai_capability_routes.py tests/test_ai_phase0_acceptance.py tests/test_ai_phase1_acceptance.py -q
前端：npm run build
```

如项目已有前端测试命令，再补充执行对应组件测试。最终命令必须在交付时按实际目录和 `package.json` 脚本核对，不得使用不存在的命令。

## 7. 验收标准

### 7.1 用户验收

- 原有 4 类 AI 功能均可继续使用，交互结果不减少。
- 缺信息、无结果、无权限和失败提示清晰。
- 多轮会话不因协议迁移中断。

### 7.2 开发验收

- `/ai/chat` 不再输出任何旧业务专属顶层字段。
- 每个 ChatRoute 有明确 `capability_id`、统一 status、result type 和 data Schema。
- 新增能力无需修改 `AiChatOut` 顶层模型。
- 无兼容层、双写、旧字段别名或灰度开关。

### 7.3 测试验收

- 契约、业务、权限、安全、异常和回归测试全部通过。
- 顶层字段协议锁能够真实拦截未来违规改动。
- OpenAPI 与实际 JSON 一致。

### 7.4 UI / 交互验收

- 抽屉布局和现有卡片视觉不退化。
- 前端完全按 `result.type` 分派，不再猜测对象结构。
- 加载、空态、错误态、权限态和未知类型降级均可观察。

### 7.5 上线验收

- 后端与前端作为同一个发布批次上线。
- 发布前确认无其他调用方读取旧字段。
- 若发现旧调用方，必须先迁移调用方；不得通过恢复旧字段绕过。
- 回滚时后端与前端同步回滚。

## 8. 风险与兼容性

| 风险 | 等级 | 影响 | 应对方案 |
|---|---|---|---|
| 后端先上线、前端未上线 | 高 | AI 卡片和动作全部失效 | 强制同批发布；部署前接口/前端版本核对 |
| 存在未盘点的旧调用方 | 高 | 调用方读取不到旧字段 | 发布前全仓库与外部调用方清单核验；先迁移，禁止加兼容层 |
| status 映射改变审计/监控统计 | 中 | 历史与新日志口径不同 | 以发布日期为边界说明；新日志只使用公共状态 |
| permission/masking 固定写值 | 高 | 对用户和审计形成错误安全声明 | 从 Handler 实际执行结果产生；增加真假场景测试 |
| result.data 退化为任意 dict | 高 | 再次失去协议约束 | 类型化 Pydantic Schema + type/data 错配测试 |
| 未知 result.type 导致前端崩溃 | 中 | 新能力上线影响聊天主入口 | 纯文本降级 + 开发警告；新类型须先增加前端渲染支持 |
| 自动动作迁移遗漏 | 中 | 协议预览/打印不触发 | 定向 E2E 覆盖 `result.actions` 自动执行 |
| 旧会话状态仍含 extracted 槽位 | 低 | 容易误判需要迁库 | 会话内部结构不变；只删除 API 输出，不迁数据库 |

兼容性结论：本次明确不向后兼容。兼容手段只有“后端、前端及所有调用方一次性同时迁移”，不允许响应双写。

## 9. 交付说明模板

```markdown
# CapabilityResultEnvelope 全量收口交付说明

## 已完成任务
- [ ] R0001 ...

## 修改文件
- `backend/app/ai/router.py`：
- `backend/tests/test_ai_capability_routes.py`：
- `frontend/src/api/ai.ts`：
- `frontend/src/components/GlobalAiAssistant.vue`：
- `specs/004-ai-native-workbench/...`：

## 测试命令与结果
- 命令：
- 结果：

## UI 验证
- 补偿金候选/结果：
- 自动化规则草稿：
- 数据对比结果：
- 动作/加载/错误/空态：

## 接口契约证据
- OpenAPI Schema：
- 实际响应样例：
- 旧顶层字段全局搜索：

## 未完成项
- 无 / 列明任务与原因

## 风险与后续建议
- 无 / 列明风险
```
