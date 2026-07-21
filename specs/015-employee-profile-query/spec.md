# 员工基础工作信息查询

> 文档类型：原子级开发任务文档  
> Capability：`employee.profile.query`  
> 实施入口：Portal 全局 AI 助手；复用 004 飞书公共渠道底座的私聊受控验证接入  
> 现状核验日期：2026-07-21

> 后续功能优化关联：`field-catalog-and-authorization-optimization.md` 定义员工档案字段目录、字段授权与卡片追加字段的通用化改造。该优化文档是本规范的增量补充；其关于字段来源、字段代码、Extractor 字段目录上下文、结果字段 Schema、字段可见性、默认卡片与追加字段展示的规定，优先于本规范中固定字段白名单的对应描述。Capability、对象范围、候选受控 action、审计、限速、飞书渠道与统一 Envelope 的既有约束继续有效。

## 1. 背景与目标

- 背景：
  - HR/HRBP 日常需要按姓名或工号确认员工所属组织、岗位、员工类型、在职状态与入职日期等基础工作信息。现有 Portal 已具备 AI Runtime、统一结果协议、数据范围过滤、字段可见性/脱敏和员工实时名册检索基础，但尚未形成一个可由 Web 与飞书共同复用的“人员基础信息查询” Capability。
  - 数据洞察能力明确禁止把个人信息查询混入薪酬聚合查询；个人资料查询必须是独立 Capability，并同时实施功能权限、对象范围、字段权限、防枚举和审计。
  - 飞书当前以通知和卡片回调为主，尚未收口对话 Bot 所需的公共入站、身份桥接、会话、Envelope 适配与受控回调能力。该公共渠道底座必须先由 004 建设；015 只作为首个低风险只读验证接入，不能形成私有飞书实现。
- 目标：
  1. 建设 `employee.profile.query`，支持已授权 HR/HRBP 按姓名或工号查询其授权范围内的其他员工基础工作信息。
  2. 打通“路由 → 功能权限 → 受限参数解析 → SQL 前 scope 下推 → 字段权限/脱敏 → 统一 Envelope → 结构化渲染 → 审计”的确定性闭环。
  3. Web 全局 AI 与飞书私聊受控验证共用同一 Capability、查询 Handler、权限模型、结果 Envelope 与审计链路；飞书入站、会话、回调和审计由 004 公共渠道底座提供。
  4. 用户可明确要求部分字段；系统只返回“固定字段白名单 ∩ 有效请求字段 ∩ 现有统一字段权限”内的数据。有效请求字段为用户明确请求字段；未明确时使用 Capability 固定默认字段集合。
  5. 通过模型外的通用受控会话 action 支持同名候选选择；opaque selection handle 不进入 LLM、LLM 审计载荷或通用会话 history，且不把已查询员工资料回传给大模型二次总结。
- 非目标 / 不做范围：
  - 不查询、展示、推理或导出薪酬、联系方式、身份证件、家庭、合同、绩效等信息。
  - 不支持任意表、任意字段、任意 SQL、任意 JOIN、任意组织范围、任意筛选表达式或批量名单查询。
  - 不将此能力纳入 `data.aggregate_query`，也不以此替代薪酬数据洞察的 DWD、ScopeResolutionProof、小样本防推断与发布 Gate。
  - 不新增一套敏感字段策略、权限模型、AI Router、Capability Registry、会话系统、业务 Handler、飞书入站/卡片回调或审计表。
  - 不支持飞书群聊、群机器人 @、外部群，以及系统主动提供的分享、转发或下载导出入口；若飞书平台支持卡片不可转发配置则启用。用户复制、截图或手工转发属于平台无法完全阻止的剩余风险，通过最小字段展示、权限告知和审计降低风险。
  - 不让 LLM 接收查询结果、候选项或完整会话中的员工资料，也不让 LLM 对查询事实改写、补全或总结。

### 1.1 假设与待确认事项

- 已确认：统一 AI `CapabilityResultEnvelope` 已上线；新增能力只能扩展受控 `result.type` 和类型化 `result.data`，不得增加业务顶层字段。
- 已确认：`app/permissions/scope_filter.py` 提供统一 scope SQL 过滤构造；`app/permissions/masker.py` 提供既有字段可见性/脱敏能力；`app/tools/router.py` 存在 `emp_realtime_roster` 名称/工号检索基础。
  - 待在 X1501 核验：实时名册实际物理表/视图、员工唯一键、字段映射、工号唯一性、姓名匹配语义、组织范围字段与 `build_scope_filter()` 的适配关系，并形成“员工实时名册与统一权限体系适配矩阵”。
  - 待在 X1501 核验：004 通用受控会话 action 是否可保存候选选择所需的低风险控制状态；若不足，仅作公共层最小字段或关联表扩展，不保存员工查询结果。
- 待在 X1502 核验：`employee.profile:V` 权限点的命名、角色 seed、菜单/功能归属必须与现有权限初始化方式一致。
  - 待在 X1508A/X1508B 核验：004 公共 action/渠道会话与飞书通道底座的 `User.feishu_user_id` 唯一性、`open_id` 映射、入站验签、消息去重、卡片发送与受控 action 分发能力；缺失项先在 004 补齐，015 不得私有实现。

## 2. 用户场景

### 2.1 HR/HRBP：Portal 全局 AI 查询唯一员工

- 入口：任意 Portal 页面右下角全局 AI 助手。
- 操作：输入“查询张三的组织、岗位和入职日期”或“查看工号 E10086 的基础信息”。
- 系统反馈：识别 `employee.profile.query`，先校验能力权限；仅使用受限查询参数进行确定性检索；按字段交集返回结构化员工信息卡。
- 成功结果：显示允许返回的字段、范围过滤说明和 `trace_id`；若用户只请求部分字段，卡片只显示该部分字段。
- 失败/空态/无权限表现：
  - 缺少姓名或工号：`200 + requires_input + employee_profile_input`，提示补充查询对象。
  - 无可查看匹配：`200 + failed + message`，统一显示“未找到可查看的匹配员工”，不说明员工是否存在或是否超出范围。
  - 缺少 `employee.profile:V`：HTTP 403，不返回候选、人员字段或任何查询线索；未登录或会话无效仍由既有认证返回 HTTP 401。
  - 模型解析失败：`200 + failed + message`，提示换用姓名或工号重试，不执行模糊自由查询。

### 2.2 HR/HRBP：同名员工候选选择与连续对话

- 入口：Portal 全局 AI 助手或飞书机器人私聊。
- 操作：输入“查询张三”；系统返回有限候选项后，用户仅可点击候选按钮完成选择。
- 系统反馈：候选项已先通过当前用户 scope 和候选字段权限过滤；用户选择时只通过 004 通用受控 action 提交服务端签发的短期 opaque selection handle，不提交员工原始主键或聊天消息。单独回复“2”等文本按普通自然语言消息处理，不解释为候选选择。
- 成功结果：在原会话中返回已选员工的字段交集结果。
- 失败/空态/无权限表现：selection handle 过期、跨用户、跨会话、被篡改或已使用时，统一提示“候选已失效，请重新输入姓名或工号”，不泄露候选对象。

### 2.3 HR/HRBP：飞书机器人私聊查询

- 入口：与企业飞书机器人一对一私聊。
- 操作：发送与 Portal 相同的自然语言查询，或在同名候选卡中点击选择按钮。
- 系统反馈：入站事件验签、去重、确认是单聊、将 `open_id` 映射为 Portal 用户后，调用与 Web 相同的 Chat/Handler 链路；把 Envelope 直接映射为标准简要卡片。
- 成功结果：卡片展示允许返回的字段和固定提示，不展示内部 scope、角色、SQL、物理字段、用户主键或审计详情。
- 失败/空态/无权限表现：
  - 未绑定 Portal 用户：仅发送固定绑定指引，不执行员工查询。
  - 非私聊：不调用查询 Handler、不返回人员信息；仅返回“该功能仅支持与机器人私聊”。
  - 重复事件：按 event/message 唯一标识幂等处理，不能再次执行查询或重复发送卡片。

### 2.4 管理员：权限与审计核验

- 入口：现有权限管理和系统审计入口。
- 操作：为角色授予/撤销 `employee.profile:V`，检查能力调用审计。
- 系统反馈：调用审计仅记录调用人、入口/渠道、Capability、`lookup_type`、结果状态、过滤/脱敏标识、候选数量、返回字段代码、`conversation_id` 与 `trace_id`；不记录姓名、完整工号、原始消息/history、员工资料字段值、selection handle、请求头、飞书签名或密钥。
- 成功结果：权限变更立即按既有权限生效机制影响后续请求；审计可关联 Web/飞书调用。
- 失败/空态/无权限表现：无权限管理员不能查看权限配置或完整审计内容，沿用既有权限管理策略。

## 3. 功能范围

| 功能项 | 是否本期实现 | 说明 |
|---|---|---|
| 独立 Capability `employee.profile.query` | 是 | 通过既有 Capability Registry 注册，不改造为数据洞察能力 |
| Portal 全局 AI 查询 | 是 | 复用 `POST /api/v1/ai/chat`、会话、Envelope 与全局 AI 助手 |
| 飞书机器人私聊查询 | 受控验证 | 先完成 004 公共渠道底座；015 仅复用私聊入口、共享 Chat Handler、Envelope 与审计做只读单 Capability 验证 |
| 按工号精确查询 | 是 | 工号只允许受控精确匹配，不支持通配、前缀扫描或批量工号 |
| 按姓名受控查询 | 是 | 仅允许受控姓名匹配和有限候选；候选数量由服务端固定上限 |
| 同名候选与选择续接 | 是 | 使用 004 通用受控 action 的 opaque selection handle；不暴露原始主键，handle 不经过 LLM |
| 用户明确请求部分字段 | 是 | 只解析固定字段代码；未明确时使用固定默认详情字段，服务端执行字段交集与统一字段权限 |
| 统一字段裁决与既有脱敏兼容 | 是 | 默认复用 `resolve_field_access()` 的原值/隐藏语义；仅在既有统一策略明确要求时复用 mask，不新增独立策略 |
| 对象范围 SQL 前置过滤 | 是 | 复用 `build_scope_filter()`，禁止先查询后过滤 |
| 防枚举中性反馈 | 是 | 无匹配、无范围或范围外对用户采用同一中性结果 |
| 统一 Envelope / result 类型 | 是 | 新增类型化 data Schema，不新增响应顶层字段 |
| Web 结构化员工卡片 | 是 | 按 `result.type` 渲染，未知类型只显示文本 |
| 飞书标准简要卡片 | 受控验证 | 由 004 公共 Envelope 适配生成，禁止把结果再次送给 LLM |
| 飞书群聊查询 | 否 | 统一拒绝，且不调用业务查询 |
| 飞书主动分享/转发/导出入口 | 否 | 系统不提供；若平台支持卡片不可转发配置则启用，复制、截图和手工转发作为剩余风险处理 |
| 薪酬及高敏感员工信息 | 否 | 本期严格排除 |
| 导出、批量检索、自由筛选 | 否 | 本期严格排除 |

## 4. 技术设计

### 4.1 数据库 / 数据模型

员工基础工作信息不新增业务数据表，优先复用现有员工实时名册/同步数据源、统一权限、`AiConversation` 与既有审计存储。

1. **员工查询数据源**
   - X1501 必须确认 `emp_realtime_roster` 实际来源、字段映射及员工唯一键。
   - 仅允许映射下列固定业务字段代码；查询层不可接受模型或前端传入物理列名：

| 字段代码 | 展示名称 | 数据语义 |
|---|---|---|
| `employee_name` | 姓名 | 员工姓名 |
| `employee_no` | 工号 | 员工工号 |
| `organization_name` | 所属组织 | 当前所属组织名称 |
| `position_name` | 岗位 | 当前岗位名称 |
| `employee_type` | 员工类型 | 用工/员工类型展示值 |
| `employment_status` | 在职状态 | 当前在职状态展示值 |
| `hire_date` | 入职日期 | 入职日期，按固定日期格式展示 |

    - `DEFAULT_EMPLOYEE_PROFILE_FIELD_CODES` 固定为 `employee_name`、`organization_name`、`position_name`、`employment_status`。
    - `employee_no`、`employee_type`、`hire_date` 仅在用户明确请求时才进入详情字段集合；默认字段仍需经过对象范围和统一字段裁决，`hide` 字段直接省略。

2. **通用受控会话 action 与候选选择**
    - 复用 004 的通用受控 action 存储和分发；候选选择的服务端签发记录只保存 `conversation_id`、`user_id`、`channel`、`capability_id` / `action_type`、opaque `selection_handle_hash`、候选员工内部键、`effective_requested_field_codes`、`expires_at`、`consumed_at`、创建时间与索引等低风险控制信息。
    - `effective_requested_field_codes` 必须由首次受限 Extractor 的已校验结果按 `effective_requested_fields` 规则生成：明确请求时使用已校验字段代码，未明确时立即展开为 `DEFAULT_EMPLOYEE_PROFILE_FIELD_CODES`；只保存固定字段代码枚举，不保存姓名、工号、原始消息、候选展示值、员工资料、scope 条件、未脱敏数据或模型上下文副本。
    - action 请求不得携带、覆盖或追加字段代码。action Handler 仅使用服务端记录的 `effective_requested_field_codes`，重新执行 scope 与当前字段裁决后返回最终详情；不得重新调用 Extractor、读取通用 conversation history 或二次根据会话判断默认字段。
    - 若公共层不能安全表达这些控制信息，只在 004 增加最小字段或关联表；handle 绑定用户、会话和渠道，默认有效期 10 分钟，单次消费后立即失效。

3. **Capability 审计净化与公共留存治理**
    - `employee.profile.query` 不得直接持久化现有通用 Chat 的完整 `request_summary=payload.message`、`input_payload=payload.model_dump()` 或 `output_payload=out.model_dump()`；成功、失败、`403`、`429`、无匹配、候选和受控 action 均使用同一 Capability 审计投影。
    - 允许写入的审计字段仅为调用人、入口/渠道、`capability_id`、`lookup_type`、结果状态/错误分类、候选数量、返回字段代码、过滤/脱敏标识、`conversation_id`、`trace_id`、必要时间戳与限速计数；不得写入姓名、工号、原始消息、history、员工字段值、候选内容、scope 条件、selection handle、请求头或飞书签名/密钥。
    - `output_payload` 如需保留，只可包含 `result.type`、状态和字段代码集合，不得包含字段值、候选项或内部员工键；`request_summary` 使用固定能力摘要，不得回显查询文本。
    - action 控制记录和 AI 审计记录的访问角色、保留期、清理/归档作业由 004 统一定义并执行；015 只声明依赖，不新增业务专属审计表或保留策略。

4. **飞书事件幂等**
    - 仅复用 004 通用事件/消息幂等设施；015 不得新增 `feishu_inbound_event_dedup` 或任何专属飞书表。
    - 公共层的幂等记录不保存完整消息正文、员工结果或飞书签名；如需 migration，upgrade/downgrade 由 004 成对维护。

4. **兼容与回滚**
   - 不修改既有员工数据的业务含义，不回填或迁移员工资料。
   - 如仅复用既有会话/幂等表，不需要 migration。
   - 如新增会话槽位或幂等表，Alembic upgrade/downgrade 必须成对提供；代码回滚前应先停用飞书事件订阅或将新事件路由切至固定维护响应，避免旧代码读取新状态失败。

### 4.2 后端接口

#### 4.2.1 Portal 统一 AI 接口

- URL：`POST /api/v1/ai/chat`
- Method：`POST`
- 权限：已认证、启用的 Portal 用户 + `employee.profile:V` + Handler 内对象范围/字段权限。
- Request：复用既有 `AiChatIn`，不增加员工业务专属顶层请求字段。

```json
{
  "message": "查询张三的组织和入职日期",
  "conversation_id": 123
}
```

受限 Extractor 内部输出 Schema（仅自然语言查询）：

```json
{
  "lookup_type": "name",
  "lookup_value": "张三",
  "requested_field_codes": ["organization_name", "hire_date"]
}
```

约束：
- `lookup_type` 只允许 `name`、`employee_no`。
- `requested_field_codes` 只允许 §4.1 中固定字段代码，去重后最多 7 项；非空时为用户明确请求字段，空数组表示未明确字段并使用 `DEFAULT_EMPLOYEE_PROFILE_FIELD_CODES`，不支持“明确请求零字段”。
- Extractor 不得产出表名、物理列名、SQL、组织条件、员工内部 ID、scope、脱敏策略或任意动态筛选。
- 候选选择不是 Extractor 输入：浏览器或飞书卡片把 opaque selection handle 交给 004 通用受控 action 分发器；该分发器在 LLM-first 路由前校验后直接调用同一 Handler。

统一 Response 仅使用既有 Envelope 顶层字段：

```json
{
  "intent": "employee.profile.query",
  "status": "succeeded",
  "answer": "已找到可查看的员工基础工作信息",
  "capability_id": "employee.profile.query",
  "conversation_id": 123,
  "result": {
    "type": "employee_profile_result",
    "data": {
      "fields": [
        {"code": "employee_name", "label": "姓名", "value": "张三"},
        {"code": "organization_name", "label": "所属组织", "value": "人力资源部"}
      ]
    },
    "artifacts": [],
    "actions": []
  },
  "permission": {"filtered": true, "note": "已按当前用户数据范围过滤"},
  "masking": {"applied": false},
  "trace_id": "..."
}
```

`permission.filtered` 只表示本次 SQL 附加的 scope 条件是否具有实际约束作用：普通受限用户为 `true`；超级管理员、全范围角色或 scope 编译为逻辑恒真时为 `false`，即使统一 scope 链仍已执行。成功结果中不得以 `filtered=false` 推断未执行统一权限体系。

本能力新增的 `result.type` 与 data Schema：

| `result.type` | status | data Schema | 说明 |
|---|---|---|---|
| `employee_profile_result` | `succeeded` | `EmployeeProfileResultData` | 唯一命中后可展示字段数组；禁止混入未授权字段 |
| `employee_profile_candidates` | `requires_input` | `EmployeeProfileCandidatesData` | 有限候选和 opaque selection handle；不含完整员工资料 |
| `employee_profile_input` | `requires_input` | `EmployeeProfileInputData` | 缺少姓名/工号等受控追问信息 |
| `message` | `failed` | 既有 `MessageData` | 无可查看匹配、解析失败等中性文本反馈 |

候选 Schema 限制：
- 姓名查询在固定姓名谓词与 `build_scope_filter()` 已注入后，按固定服务端稳定排序执行 `LIMIT 6` 探测；排序字段仅用于服务端 `ORDER BY`，不得下发客户端、卡片、LLM 或审计摘要。
- scope 过滤后的匹配数为 1 时返回唯一结果；2–5 时返回候选卡；达到第 6 条即视为“6 条及以上”，不返回任何候选，只提示“匹配较多，请补充工号”。不能分页或继续枚举。工号查询仍为受控精确查询，不走同名候选分支。
- `EmployeeProfileCandidatesData` 固定为 `{ "candidates": EmployeeProfileCandidateItem[] }`；每项必须符合 `EmployeeProfileCandidateItem { "selection_handle": string, "display_fields": CandidateDisplayField[] }`，其中 `CandidateDisplayField` 固定为 `{ "code": CandidateDisplayFieldCode, "label": string, "value": string }`。
- `CandidateDisplayFieldCode` 只允许 `employee_name`、`organization_name`、`employment_status`；`label` 为服务端固定标签，`value` 必须是已裁决的非空字符串。物理值为 `null`、空串、占位值或被隐藏时不生成该字段项，不返回 `null`、空标签或前端占位符。
- 候选展示字段使用独立固定白名单，不受 `requested_field_codes` 或详情默认字段集合影响；后者只控制唯一命中后的最终详情字段。候选字段仍必须先经过同一 scope 与字段裁决，且不得扩展为候选白名单以外的字段。
- 对 scope 过滤后的全部 2–5 条候选逐条完成候选字段裁决。仅当每一条候选均至少保留一项 `display_fields` 时，才返回完整候选集合并为全部候选签发 handle；任一候选无法保留可见展示字段时，不返回任何候选卡、不丢弃该候选后返回子集，也不为部分候选签发 handle，统一提示“匹配较多，请补充工号”。该降级不得暴露字段权限、空值或候选展示失败原因。
- `selection_handle` 必须无业务语义、短期、单次、绑定用户/会话/渠道；不返回内部员工主键、scope、匹配分数、完整档案、范围外候选或候选展示字段以外的原始人员数据。

状态码与错误处理：
- `200`：业务已受控结束，包括成功、需补充、需选择及中性无匹配。
- `400`：`AiChatIn` 请求格式非法；内部参数 Schema 被非预期调用方直接传入且校验失败时仅返回受控错误。
- `401`：未登录或会话无效。
- `403`：缺少 `employee.profile:V`，或分类命中/显式 action 命中 `employee.profile.query` 后被受控验证 Gate 拒绝。受控验证拒绝的对外文案统一为“当前功能暂未开放”，不得区分总开关、allowlist、到期、渠道关闭或配置错误原因；不得转为“无匹配”。
- `429`：命中 `employee.profile.query` 且通过 Target Capability Gate 后超过通用 Capability 限速；返回中性文案“请求过于频繁，请稍后再试”，可携带 `Retry-After`，不得返回剩余额度、查询条件、候选数量或人员线索。
- `500`：未捕获服务异常或输出 Schema 校验失败；返回受控错误与 `trace_id`，不得返回 SQL、堆栈、物理字段或人员数据。

#### 4.2.2 004 通用受控 action 接口

- URL：`POST /api/v1/ai/conversations/{conversation_id}/actions`；由 X1508A 在 004 公共层实现，015 不新增候选选择专属接口。
- Method：`POST`
- 权限：已认证、启用的 Portal 用户；action 命中 `employee.profile.select_candidate` 后执行 `employee.profile:V` Target Capability Gate，再执行对象 scope 与字段裁决。
- Request Schema：不得复用 `AiChatIn.message`，仅接受：

```json
{
  "action_type": "employee.profile.select_candidate",
  "selection_handle": "opaque-short-lived-handle"
}
```

- Response Schema：成功直接返回既有 `CapabilityResultEnvelope`，其中唯一命中使用 `employee_profile_result`，失效或无可查看匹配使用受控 `message`，不返回候选内部信息。
- 错误：`400` 为未知 action 或请求 Schema 非法；`401` 为未登录/会话失效；`403` 为 Target Capability Gate 或受控验证 Gate 拒绝，其中受控验证拒绝统一返回“当前功能暂未开放”；`410` 仅为统一的 handle 无效、过期、已消费或用户/会话/渠道绑定不匹配；`429` 为通过 Target Capability Gate 后超过通用 Capability 限速；`500` 为受控内部错误。`403` 不返回受控验证的细分原因，`410` 不区分 handle 失败原因，且均不泄露候选或员工数据。
- action Handler 只能读取已消费 handle 对应的服务端 `effective_requested_field_codes`，不得接受客户端字段代码、重新调用 Extractor 或读取原始聊天/history；字段代码在重新 scope 与当前字段裁决后决定最终详情，不能因 action 请求被放大、覆盖或追加。

#### 4.2.3 飞书入站接口

- URL：由 004 在 `app/integrations/feishu/router.py` 下提供受飞书平台要求的公共事件回调路由，例如 `POST /api/v1/integrations/feishu/events`；最终路径必须与现有飞书路由前缀一致，015 不新增业务专属路由。
- Method：`POST`
- 身份：飞书事件签名/时间戳/nonce 校验 + URL verification challenge；不得使用 Portal cookie/JWT 替代飞书验签。
- 请求：飞书 `im.message.receive_v1` 标准事件及 URL challenge；只读取所需元数据、文本和单聊标识。
- 响应：对 challenge 返回平台规定格式；对事件在校验、去重及入队/处理完成后返回平台规定的成功确认，不在 HTTP 错误正文输出员工信息。
- 权限：飞书身份仅用于映射已认证、启用的 Portal 用户；实际业务权限仍由该用户的 `employee.profile:V`、scope 与字段权限决定。

### 4.3 业务逻辑

#### 4.3.0 受控验证 Gate 与配置

015 受控验证必须从统一 Settings/环境配置读取以下最小配置，默认均 fail closed：

```text
EMPLOYEE_PROFILE_ENABLED=false
EMPLOYEE_PROFILE_ALLOWED_USER_IDS=
EMPLOYEE_PROFILE_EXPIRES_AT=
FEISHU_EMPLOYEE_PROFILE_ENABLED=false
FEISHU_EMPLOYEE_PROFILE_ALLOWED_USER_IDS=
```

- `EMPLOYEE_PROFILE_ALLOWED_USER_IDS` 和 `FEISHU_EMPLOYEE_PROFILE_ALLOWED_USER_IDS` 均为 Portal `user_id` 集合，不保存飞书 `open_id`；前者限制 Web 与飞书全部入口，后者仅在飞书已完成 `open_id → Portal User` 映射后追加限制。
- `EMPLOYEE_PROFILE_EXPIRES_AT` 必须是带时区的 UTC ISO-8601 时间；在本期受控验证阶段必须配置且晚于当前时间，到期后自动关闭。
- 自然语言入口使用完整、低敏 Route Catalog 完成分类后，仅在命中 `employee.profile.query` 时执行受控验证。全局开关关闭、任一受控验证 allowlist 为空或不包含当前用户、到期时间缺失/解析失败/已到期、飞书渠道开关关闭或飞书专属 allowlist 不通过时，均以 HTTP `403` 拒绝已命中的本 Capability，并统一返回“当前功能暂未开放”；分类器可被调用，但员工画像 Extractor、Context Packet、名册查询、action Handler 和员工查询审计投影均不得调用。未命中 `employee.profile.query` 的既有 Capability 不受这些配置影响。
- 固定检查顺序为：自然语言入口先执行身份认证或 `open_id` 映射 → 完整、低敏 Route Catalog 的 LLM-first 分类 → 未命中时继续既有 Capability 链路；命中 `employee.profile.query` 时执行 `EMPLOYEE_PROFILE_ENABLED` → `EMPLOYEE_PROFILE_EXPIRES_AT` → `EMPLOYEE_PROFILE_ALLOWED_USER_IDS` →（仅飞书）`FEISHU_EMPLOYEE_PROFILE_ENABLED` 与 `FEISHU_EMPLOYEE_PROFILE_ALLOWED_USER_IDS` → Target Capability Gate → 通用 Capability 限速 → Extractor/查询 Handler。受控选择 action 由 `action_type` 明示目标 Capability，可跳过 LLM-first 分类并在认证/渠道会话绑定后执行同一受控验证、Gate 与限速检查。

#### 4.3.1 固定执行顺序

```text
自然语言入口（Web / 飞书私聊）
  → 身份认证或 open_id 映射为 Portal 用户
  → 使用完整、低敏 Route Catalog 执行 LLM-first 分类
  → 未命中 employee.profile.query：继续既有 Capability 链路
  → 命中 employee.profile.query：受控验证 Gate（总开关、到期时间、Portal allowlist、飞书渠道开关/allowlist）
  → Target Capability Gate：employee.profile:V
  → 通用 Capability 限速：Portal user_id + employee.profile.query（Web/飞书共享）
  → 仅向 Extractor 传递用户消息与允许的低风险会话控制信息
  → EmployeeProfileQuerySpec 受限解析与 Pydantic 校验
  → 姓名/工号受控查询（候选选择仅由模型外受控 action 处理）
  → build_scope_filter() 在 SQL 查询前注入对象范围
  → 唯一命中 / 有限同名候选 / 中性无匹配
  → `effective_requested_fields`（明确请求字段；否则默认字段集合）
  → 固定白名单 ∩ `effective_requested_fields` ∩ `resolve_field_access()` 裁决
  → 默认原值或隐藏；仅复用既有统一策略明确的 mask
  → 类型化 result.data 与 CapabilityResultEnvelope
  → Capability 审计投影/净化后写入统一 AI 审计
  → Web 按 result.type 渲染 / 004 飞书公共适配层映射为卡片

受控选择 action（Web / 飞书卡片）
  → 004 action 分发器在 LLM-first 分类前识别 action
  → 认证/渠道会话绑定与受控验证 Gate：总开关、到期时间、Portal allowlist、飞书渠道开关/allowlist
  → Target Capability Gate：employee.profile:V
  → 通用 Capability 限速：Portal user_id + employee.profile.query（Web/飞书共享）
  → 校验 user、channel、conversation、过期与单次消费
  → 仅使用服务端 `effective_requested_field_codes`，重新执行同一对象 scope 与字段权限
  → 直接调用 EmployeeProfileQueryHandler 并返回 Envelope
```

禁止调整为“先 Extractor、后 Capability Gate”。Route Catalog 不是权限边界：分类器可见全部可路由 Capability 的 ID 和低敏描述，但绝不接收权限规则、字段白名单、数据源、员工资料、候选、scope、字段权限结果或 selection handle。分类命中 `employee.profile.query` 后，受控验证 Gate 与 Target Capability Gate 必须在 Extractor 和任何员工画像 Context Packet 前执行；受控验证未通过时以 HTTP `403` 和“当前功能暂未开放”拒绝，分类器可被调用，但员工画像 Extractor、Context Packet、名册查询、action Handler 与员工查询审计投影均不可调用。内部审计仅记录无敏感载荷的细分 `failure_stage`：`controlled_rollout_disabled`、`controlled_rollout_expired`、`controlled_rollout_allowlist_denied` 或 `feishu_rollout_denied`，不得对普通用户返回这些原因。无 `employee.profile:V` 时返回 HTTP 403，员工画像 Extractor、Context Packet 与名册查询均不可调用。

#### 4.3.2 查询与防枚举规则

1. **工号**：去空格后按受控规范化值精确匹配；不得 `LIKE`、前缀匹配、批量传值或回退为姓名猜测。
2. **姓名**：只允许受控的等值/既有标准化姓名匹配；不得接受任意通配符、正则或 SQL 表达式。固定姓名谓词与 scope SQL 注入后，使用固定稳定 `ORDER BY` 和 `LIMIT 6` 探测：1 条唯一结果、2–5 条候选、6 条及以上统一提示补充工号且不返回候选。
3. **scope 前置**：查询 SQL 必须由固定投影、固定数据源、固定姓名/工号谓词和 `build_scope_filter()` 共同组成；严禁先取得全体匹配后在 Python、前端或 LLM 中过滤。
4. **中性无匹配**：范围外、员工不存在、被过滤、结果为空，都只可返回“未找到可查看的匹配员工”。
5. **同名候选**：候选顺序由 X1501 核验后的不可变唯一员工键升序确定；若需业务排序字段，必须再以该唯一键作为最终 tie-breaker。相同用户、相同数据快照和相同输入的重复查询必须得到相同顺序。对 scope 过滤后的全部 2–5 条候选逐条执行候选字段裁决；仅在每条均至少保留一项 `display_fields` 时返回完整集合。任一候选没有可见展示字段时，整体降级为“匹配较多，请补充工号”，不得展示子集、改用内部 ID 或签发部分 handle。
6. **字段交集**：`effective_requested_fields` 在用户明确字段时等于请求字段集合；未明确时等于 `DEFAULT_EMPLOYEE_PROFILE_FIELD_CODES`（姓名、所属组织、岗位、在职状态）。唯一结果字段始终为固定白名单 ∩ `effective_requested_fields` ∩ 统一裁决结果；工号、员工类型、入职日期仅在明确请求时尝试返回。字段权限导致无可展示字段时，返回受控 `message`，不得返回空壳员工对象。候选字段继续使用其独立固定白名单。
7. **最小反批量探查约束**：复用 004 通用 Capability 限速，不新建按 IP、渠道或业务私有的限速器。限速键为 Portal `user_id + employee.profile.query`，Web 与飞书共享；飞书先完成 `open_id` 到 Portal User 映射。生产默认启用滚动窗口 `300` 秒内最多 `20` 次，配置从统一 Settings/配置注入，测试可 override 更小窗口和阈值。所有已认证、命中本 Capability 且通过 Target Capability Gate 的请求均计数，包括成功、无匹配、缺输入、候选返回和受控候选选择；检查必须在 Extractor、名册查询和 action Handler 前。超限返回 HTTP `429` 和中性文案“请求过于频繁，请稍后再试”，可带 `Retry-After`，不得返回剩余额度、查询条件、候选数量或人员线索。限速日志/告警仅记录 `user_id`、`capability_id`、当前计数、窗口、`trace_id`、`channel`，不记录姓名、工号、候选内容或 handle；同一用户/能力/窗口告警去重。该约束不引入风控平台、IP 黑名单或日配额审批。
8. **会话隔离**：opaque selection handle 必须由 004 绑定当前 Portal 用户、会话、渠道和过期时间。飞书同一 `open_id` 的会话必须映射到对应 Portal 用户，不得以机器人共享会话续接。

#### 4.3.3 模型边界

- LLM 可用于 Route 判断和 `EmployeeProfileQuerySpec` 的受限提取。
- 分类器只接收用户消息、Capability ID 与低敏路由描述；Extractor 只在 Target Capability Gate 成功后接收允许的用户消息。两者均不得包含权限规则、字段白名单、数据库返回的员工资料、候选对象、scope、字段可见性结果、selection handle 或脱敏前后数据。
- 服务端负责查询、字段交集、脱敏、固定答复文案和卡片字段排序；不得让 LLM 对结果生成自然语言总结。
- 审计应增加可验证断言：发送给 LLM 的请求载荷不含员工查询结果、候选对象或 selection handle。
- 员工查询审计不得直接复用完整 Chat 输入/输出载荷：`request_summary` 不含原始姓名、工号或聊天文本；`input_payload` 不含原始消息/history；`output_payload` 至多保存 `result.type`、状态和字段代码，绝不保存字段值、候选或内部员工键。日志、异常和告警沿用相同净化边界。

#### 4.3.4 飞书公共渠道底座接入

1. 仅由 004 定义的 `app/integrations/feishu/` 公共层验证飞书 challenge 和事件签名，校验时间窗并拒绝验签失败请求；015 业务模块不得暴露独立公网入口。
2. 使用 004 的 `event_id` 或 `message_id` 幂等设施去重；重复事件不再次调用 Chat Handler 或发送重复卡片。
3. 非私聊事件直接走固定拒绝分支，不解析员工查询语义、不调用 LLM、不查询员工数据。
4. 将 `open_id` 映射到启用状态的 Portal 用户；映射失败只返回绑定指引。
5. 由 004 为该用户创建/续接与飞书渠道绑定的既有 AI 会话；仅存低风险控制信息。
6. 自然语言消息调用同一个 ChatRoute、Capability Gate、Extractor 与 `EmployeeProfileQueryService`；候选点击改走 004 通用受控 action，不经过分类器或 Extractor。
7. 把 Envelope 适配为标准简要卡片：
   - `employee_profile_result`：字段标签和值；仅渲染 `fields` 数组。
    - `employee_profile_candidates`：严格 `display_fields` 和 opaque selection handle 对应回调值；若没有可见展示字段则改为固定“请补充工号”提示，不生成候选卡。
   - `employee_profile_input` / `message`：固定文本卡或消息。
8. 卡片回调由 004 再次验证飞书用户、selection handle、会话与过期时间，不能信任客户端回传的员工信息。

### 4.4 前端与 UI/交互

主要改动位置：
- `frontend/src/api/ai.ts`
- `frontend/src/components/GlobalAiAssistant.vue`
- 必要时在 `frontend/src/components/ai/` 新增轻量、仅负责展示的 `EmployeeProfileResultCard.vue`，不得内置查询、权限或脱敏逻辑。

1. **API 类型**
   - 在既有 `CapabilityResult` 可辨识联合中增加三种员工查询 `result.type` 与严格 data 类型。
   - 禁止将 `EmployeeProfileResultData` 定义成 `Record<string, any>`；字段项必须具有受限 `code`、固定 `label` 和已脱敏的 `value`。

2. **Portal 卡片**
   - `employee_profile_result`：展示标题“员工基础工作信息”，使用两列标签/值布局；只遍历后端 `fields`，不按对象属性猜测字段。
    - `employee_profile_candidates`：展示“请选择员工”；每项仅渲染服务端 `display_fields` 和候选按钮，点击后调用 `POST /api/v1/ai/conversations/{conversation_id}/actions` 并在专用 `selection_handle` 字段提交 handle，不把 handle 拼入聊天消息；不支持回复候选序号或文本选择。
   - `employee_profile_input`：仅展示追问文本，不展示空白卡片。
   - `message`：沿用现有聊天气泡文本，不渲染人员卡。
   - 对未知 `result.type`：只显示 `answer`，开发环境记录受控告警，不能尝试渲染任意对象。

3. **状态与提示**
   - 加载态：沿用全局 AI “正在处理”。
   - 无匹配：只显示中性 `answer`，不显示“员工不存在”“范围外”等推断性文案。
   - 403：使用后端统一权限提示，不显示旧卡片或候选缓存。
   - 候选失效：展示“候选已失效，请重新输入姓名或工号”，并清理当前消息的候选交互状态。
   - 脱敏：前端只展示后端处理后的 `value`；不得自行判断、恢复或拼接隐藏字段。

4. **飞书卡片**
   - 由后端适配层构造，不由前端参与。
    - 不可显示 `trace_id`、内部主键、scope 信息、SQL、角色名称、候选展示字段以外的原始人员数据，或用户可读的 selection handle。
    - 候选选择按钮的回调 action payload 可以携带 004 服务端签发的短期 opaque selection handle；该 handle 无业务语义且不进入 LLM、审计摘要或会话 history。卡片更新失败时使用固定重试提示，不回显人员数据。

### 4.5 权限、安全与外部系统

1. **权限层次**

```text
已认证、启用的 Portal 用户
  → 允许进入既有 AI Chat 接口
employee.profile:V
  → 是否允许使用员工基础信息查询 Capability
对象/行级 scope
  → 是否允许查询该员工
统一字段裁决 `resolve_field_access()`
  → 本次字段原值可见或完全隐藏
既有统一 mask 策略（如适用）
  → 仅对已允许输出且该策略明确要求的字段脱敏
```

- 字段权限不能替代对象范围；即使某字段可见，也必须先通过 employee scope。
- scope 适配层必须返回结构化元数据：`scope_filter_applied`（是否调用并附加统一 scope 谓词）、`scope_filter_restrictive`（谓词是否实际限制本次 SQL）与 `scope_resolution_status`。禁止通过 SQL 字符串判断恒真/恒假。`permission.filtered` 仅映射 `scope_filter_restrictive`：普通受限用户为 `true`；超级管理员、全范围角色或逻辑恒真 scope 为 `false`。默认“原值或隐藏”路径中 `masking.applied=false`；仅当既有统一策略实际对仍允许输出的字段执行 mask 时才为 `true`，不得为了填充该标识把隐藏字段改为掩码。
- `scope_filter_applied`、`scope_filter_restrictive` 与 `scope_resolution_status` 仅写入内部审计，不增加或泄露到用户可见 Envelope。scope 无法解析、未注册或进入 fail-closed 时不得产生成功结果，统一走中性无匹配或受控错误路径。
- `permission.note` 仅使用中性说明，不暴露规则 ID、角色细节、组织条件或 SQL。
- X1501 必须形成“员工实时名册与统一权限体系适配矩阵”：明确 `emp_realtime_roster` 对应的 `DATA_TABLES` 实体、实际参与 `build_scope_filter()` 的组织/成本中心/人员角色字段、与当前员工归属口径的关系，以及离职、待入职、兼职和多组织状态沿用或排除的既有名册口径；同时定义 scope 结果的 `applied` / `restrictive` / `resolution_status` 判定来源。每个业务字段还必须映射为“业务字段代码 → 物理列 → 敏感分类 → `tool_key` → `resolve_field_access()` 结果（未返回即原值可见 / `hide`）→ 最终行为（原值 / 隐藏 / 既有策略 mask）”。
- 字段适配只增加薄映射层：`employee.profile.query → emp_realtime_roster → 固定业务字段代码/物理列 → resolve_field_access(user, table, db, tool_key)`；唯一结果最终投影始终是固定白名单 ∩ `effective_requested_fields` ∩ 统一裁决结果，其中未明确请求时 `effective_requested_fields=DEFAULT_EMPLOYEE_PROFILE_FIELD_CODES`。未经既有统一 mask 契约明确允许，不得再调用 `get_sensitive_columns()` / `apply_mask()` 将 `hide` 改为掩码；候选使用独立白名单但遵循同一裁决语义，且后端不下发隐藏字段。

2. **数据安全**
- 固定数据源、固定投影、固定字段代码、参数化姓名/工号条件、固定稳定排序；禁止动态表名、动态列名、用户可控排序、动态 JOIN、自由 SQL 和 ORM 字符串拼接。
- 查询结果、候选资料、组织和岗位信息不回传 LLM；日志/审计不记录未脱敏结果。
- opaque selection handle 不可逆、短期、单次、绑定用户会话和渠道；004 action 分发器在消费前重新执行同一 scope 和字段裁决，校验失败统一失效。
- 采用现有字段裁决与 `masker`，不得在本能力另建“敏感字段名单”、私设 mask 规则或绕过统一工具；若配置 `tool_key`，必须在既有分类工具白名单中有可审计授权，命中白名单的现有语义仍是原值可见，不是掩码。

3. **飞书安全**
- 仅复用 004 公共层处理通过飞书验签的 `im.message.receive_v1`；验证 challenge、时间戳、nonce 与签名，拒绝重放。
- 只支持机器人一对一私聊；群聊、外部会话、无法确定 chat_type 的事件默认拒绝。
- 不在飞书用户可读消息、非 action 卡片字段、事件幂等表或日志/审计中保存未脱敏员工资料；callback action payload 可短暂携带 opaque selection handle，但不得持久化、回显或进入 LLM 请求、审计载荷或会话 history。
- 飞书 `open_id` 映射失败、Portal 账号禁用或没有权限时，都不能降级为机器人匿名查询。
- 015 及 004 不提供主动分享、转发或导出入口；若飞书平台支持卡片不可转发配置，由 X1508B 在公共卡片适配层启用。平台无法完全阻止的复制、截图和手工转发不作为“已技术禁止”的验收承诺，按最小字段展示、权限告知和审计作为剩余风险处置。

## 5. 原子任务清单

- [x] X1501 核验员工实时名册与统一权限体系适配边界
  - 前置任务：无
  - 功能范围：确认 `emp_realtime_roster` 实际查询入口、固定字段映射、不可变唯一员工键、工号唯一性、姓名匹配规则、候选稳定排序键及最终 tie-breaker、所属 `DATA_TABLES` 实体、组织/成本中心/人员角色 scope 字段与 `build_scope_filter()` 接入方式；确认 scope 结果中 `scope_filter_applied`、`scope_filter_restrictive` 与 `scope_resolution_status` 的判定来源；确认离职、待入职、兼职、多组织口径、004 通用受控 action/事件幂等复用边界，以及每个业务字段的物理列、敏感分类、`tool_key`、统一裁决结果与最终原值/隐藏/mask 行为。
  - 代码交付物：员工实时名册与统一权限体系适配矩阵（含字段裁决列、候选稳定排序键与 `LIMIT 6` 探测规则）；必要时最小 SQLAlchemy 查询仓储骨架或 004 公共层 Alembic 设计稿，不得先实现自由查询。
  - UI 要求：不涉及 UI。
  - UCP/外部系统要求：不涉及。
  - 测试要求：测试环境验证固定投影、工号精确匹配、姓名受控匹配、scope 谓词可编译、候选稳定排序键与 `LIMIT 6` 探测可编译；分别核验受限用户、全范围/超级管理员和 scope fail-closed 时的结构化 scope 元数据；核验 `resolve_field_access()` 的未返回/`hide` 语义、既有 mask 契约是否存在及 `tool_key` 白名单；记录无法复用项。
  - 验收标准：字段来源、主键、稳定排序键、scope 谓词及其 `applied`/`restrictive`/`resolution_status` 判定来源、状态口径、字段权限映射、原值/隐藏/mask 最终行为、公共 action/幂等复用结论均有可复现证据；未确认前不得进入业务 Handler 开发。
  - 完成定义：核验记录、必要设计与测试证据齐全后才可勾选。

- [x] X1502 前移 Target Capability Gate 并注册员工查询权限
  - 前置任务：X1501
  - 功能范围：在现有 ChatRoute 主链将受控验证 Gate 与目标 Capability Gate 固定在 Extractor 前；注册 `employee.profile.query` 与 `employee.profile:V`，实现 `EMPLOYEE_PROFILE_ENABLED`、`EMPLOYEE_PROFILE_ALLOWED_USER_IDS`、`EMPLOYEE_PROFILE_EXPIRES_AT` 的统一 Settings 校验与 fail-closed 行为，补齐角色 seed/权限初始化和审计元数据。
  - 代码交付物：`backend/app/ai/capabilities.py`、`backend/app/ai/router.py`、统一 Settings/受控验证 Guard、既有权限 seed/migration 文件及相关测试。
  - UI 要求：不涉及 UI。
  - UCP/外部系统要求：不涉及。
  - 测试要求：未登录或会话无效为 401；无 `employee.profile:V` 为 403。自然语言命中员工查询时，覆盖全局开关关闭、通用 allowlist 为空/不含当前 Portal 用户、到期时间缺失/解析失败/已到期的 fail-closed 行为：均返回 HTTP `403` 与“当前功能暂未开放”，不返回细分原因；分类器可使用低敏 Route Catalog 完成意图识别，但员工画像 Extractor、Context Packet、名册查询、action Handler 和员工查询审计投影均未调用；内部只记录受限 `failure_stage` 白名单。受控验证通过后，无员工查询权限时分类器命中目标 Capability，随后 Gate 返回 403；断言未命中 `employee.profile.query` 的既有 Capability 不受试运行配置影响；既有 Capability 回归。
  - 验收标准：任何目标 Capability 都可在 Extractor 前校验；员工查询不以 Handler 内晚置权限检查替代前置 Gate；受控验证配置错误或关闭时无法进入员工查询业务执行，但不阻断其他 Capability 的自然语言链路。
  - 完成定义：代码、权限 seed、回归测试和审计断言均通过后才可勾选。

- [x] X1503 定义员工查询受限输入、结果 Schema 与结果类型登记
  - 前置任务：X1502、X1508A 的公共 action Schema/注册契约
  - 功能范围：定义仅自然语言查询使用的 `EmployeeProfileQuerySpec`、字段代码枚举、`DEFAULT_EMPLOYEE_PROFILE_FIELD_CODES` 与 `effective_requested_fields` 规则、`EmployeeProfileResultData`、严格的 `EmployeeProfileCandidatesData` / `EmployeeProfileCandidateItem` / `CandidateDisplayField`、`EmployeeProfileInputData`；登记三个 `result.type`，并为 004 通用受控 action 登记 `employee.profile.select_candidate`、opaque selection handle 以及服务端不可变的 `effective_requested_field_codes` action context Schema。
  - 代码交付物：现有 `backend/app/ai/` Schema/Router 模型文件、必要的 Capability output schema 登记。
  - UI 要求：不涉及 UI。
  - UCP/外部系统要求：不涉及。
  - 测试要求：合法 schema 通过；非空 `requested_field_codes` 使用明确请求字段、空数组使用固定默认字段集合；候选签发时将默认或明确请求均展开为受限、不可变的 `effective_requested_field_codes`；候选字段代码、固定标签、非空字符串值、至少一个展示字段和无业务语义 handle 均被严格校验；未知字段代码、物理字段、SQL 关键词、动态 scope、超量字段、非法 lookup type、额外字段和客户端提交的 action 字段代码均校验失败。
  - 验收标准：`result.data` 不能退化为任意 dict；员工查询全部输入/输出、候选数据、action 注册及服务端 action context 均有严格模型。
  - 完成定义：模型、注册和单元测试通过后才可勾选。

- [x] X1504 实现确定性 EmployeeProfileQueryService 与 scope 前置查询
  - 前置任务：X1501、X1503
  - 功能范围：实现固定数据源、固定字段映射、参数化姓名/工号查询；在 SQL 执行前调用 `build_scope_filter()` 并使用其结构化 scope 结果，禁止仅传递谓词或通过 SQL 文本猜测 scope 是否恒真；姓名查询按固定稳定排序执行 `LIMIT 6`，严格区分唯一命中、2–5 条完整候选集合、任一候选无可见展示字段时整体提示补充工号、6 条及以上提示补充工号和中性无匹配。
  - 代码交付物：现有 `backend/app/ai/` 或员工查询服务模块；复用既有 `app/tools/router.py` 能力时只抽取受控服务，不复制查询逻辑。
  - UI 要求：不涉及 UI。
  - UCP/外部系统要求：不涉及。
  - 测试要求：SQL 编译/spy 断言 `build_scope_filter()`、scope 谓词和固定 `ORDER BY` 在执行前存在且 `LIMIT 6` 生效；受限用户断言 `scope_filter_applied=true`、`scope_filter_restrictive=true`、`permission.filtered=true`；全范围/超级管理员断言统一 scope 链仍调用但 `scope_filter_restrictive=false`、`permission.filtered=false`；scope 解析失败、未注册或 fail-closed 时无成功 Envelope；工号精确命中、同名恰好 5 条、同名 6 条、同名 7 条以上、重复查询顺序稳定、范围外、无匹配、SQL 注入字符和空输入；2–5 条候选中任意一条无可见展示字段、全部无可见展示字段，以及所有候选均有展示字段。
  - 验收标准：不存在“全局查询后 Python 过滤”；范围外与不存在的用户反馈一致；`permission.filtered` 只映射实际具有限制作用的 `scope_filter_restrictive`，不得以 `filtered=false` 跳过统一 scope 链或暗示未执行权限体系；恰好 5 条仅在全部候选可展示时返回完整集合，任一候选不可展示或 6 条及以上均不返回候选；候选顺序稳定且排序键不下发客户端。
  - 完成定义：服务、定向单测和 SQL 前置断言通过后才可勾选。

- [x] X1505 接入统一字段裁决、字段交集与既有 mask 契约
  - 前置任务：X1503、X1504
  - 功能范围：将固定白名单与 `effective_requested_fields`、`resolve_field_access()` 裁决求交集；未明确字段时使用 `DEFAULT_EMPLOYEE_PROFILE_FIELD_CODES`，明确请求时仅使用请求字段。默认只输出原值可见字段并完全删除 `hide` 字段。仅当 X1501 核验到既有统一 mask 契约明确适用于仍允许输出的字段时才复用 `apply_mask()`，并据实设置 `masking.applied`。
  - 代码交付物：`EmployeeProfileQueryService`、既有权限/masker 调用点、相关测试。
  - UI 要求：不涉及 UI。
  - UCP/外部系统要求：不涉及。
  - 测试要求：未指定字段时只尝试默认姓名/所属组织/岗位/在职状态、指定单字段、指定多字段、隐藏字段、全部字段不可见、候选与唯一结果的各自固定白名单，以及（仅在 X1501 发现既有适用契约时）既有 mask 字段组合；覆盖一条候选隐藏、一条候选可见时整体降级而非返回可见子集，及所有候选均可见时才允许候选集合；断言不得调用 `get_sensitive_columns()` 将 `hide` 改为 mask。
  - 验收标准：模型不能越过服务端字段交集；前端/飞书仅收到后端已处理的字段和值；候选不允许因任一条不可展示而过滤为子集；未明确字段时不返回工号、员工类型或入职日期，默认输出仅为原值或隐藏；不新增独立敏感字段策略或 mask 语义。
  - 完成定义：字段裁决、隐藏和既有 mask 契约（如适用）组合测试通过后才可勾选。

- [x] X1506 接入 004 受控选择 action 与安全会话续接
  - 前置任务：X1501、X1504、X1505、X1508A 的可运行公共 action
  - 功能范围：复用 004 对 opaque selection handle 的签发、哈希存储/验证、过期、单次消费、用户/会话/渠道绑定，以及 `POST /api/v1/ai/conversations/{conversation_id}/actions` 公共接口；仅在完整候选集合每条均可展示时签发全部 handle，并将服务端 `effective_requested_field_codes` 与 `capability_id` / `action_type` 写入不可变控制记录，在 LLM-first 分类前经公共 action 分发器校验后直接调用同一 Handler。
  - 代码交付物：业务 action 注册、`effective_requested_field_codes` action context Schema/持久化、Handler 接入、必要的 004 公共层 Alembic migration 和测试；015 不得新建 token 验证服务。
  - UI 要求：为 Web 候选按钮点击提供受控选择请求格式，不显示内部员工 ID；不实现候选序号或文本选择。
  - UCP/外部系统要求：不涉及。
  - 测试要求：按钮正常选择、`400` 非法 action Schema、`401`、`403`、`429`、统一 `410` 失效 handle、重复消费、跨用户、跨会话、跨渠道、篡改 handle、候选员工 scope 变更后的重新校验；覆盖一条候选隐藏、一条可见时不返回任何候选或 handle，所有候选可见时才为完整集合签发 handle；验证“查询组织和入职日期”产生候选后，点击仅返回通过当前裁决的组织和入职日期，而默认字段查询在签发时已展开为固定默认字段代码；断言 action 请求不能携带、覆盖或追加字段代码，且 action 不重新调用 Extractor、不读取原始聊天/history；回复“2”等文本不触发受控选择，且 handle 和 action context 不进入分类器、Extractor、LLM 审计载荷或会话 history；超限时 action Handler 不得调用。
  - 验收标准：selection handle 不能被枚举、重放或用于其他用户/渠道；action 不复用聊天 `message`；最终字段只来自服务端不可变 `effective_requested_field_codes` 与当前 scope/字段裁决；会话不保存完整员工资料。
  - 完成定义：安全测试、迁移 upgrade/downgrade（如适用）和会话回归通过后才可勾选。

- [x] X1507 接入 ChatRoute、Envelope、审计与禁止结果回流 LLM
  - 前置任务：X1502-X1506
  - 功能范围：增加员工查询 Route/Extractor/Handler，使用统一 Envelope 返回受控 result；在 Target Capability Gate 成功后、Extractor 和名册查询前调用 004 通用 Capability 限速；为本 Capability 接入 004 审计投影/净化器，审计仅保留 `lookup_type`、状态/错误分类、候选数量、返回字段代码、`scope_filter_applied`、`scope_filter_restrictive`、`scope_resolution_status`、过滤/脱敏标识、渠道、`conversation_id`、`trace_id` 与必要计数；`permission.filtered` 仅从 `scope_filter_restrictive` 映射；确保确定性查询结果不进入任何后续 LLM 调用。
  - 代码交付物：`backend/app/ai/router.py`、004 审计投影/净化调用点、审计模块/测试、Capability Registry 更新；不得直接持久化完整 `payload.message`、`payload.model_dump()` 或 `out.model_dump()`。
  - UI 要求：不涉及 UI。
  - UCP/外部系统要求：不涉及。
  - 测试要求：唯一结果、缺输入、候选、无匹配、解析失败、403、429、500；覆盖候选中任意一条无可见展示字段时返回“请补充工号”且 `EmployeeProfileCandidatesData`/handle 均不生成，所有候选可见时才返回完整集合；受限 scope 审计 `scope_filter_applied=true`、`scope_filter_restrictive=true` 且 Envelope `permission.filtered=true`；全范围 scope 审计链仍记录已调用但 `scope_filter_restrictive=false` 且 `permission.filtered=false`；scope 失败时不得产生成功 Envelope 或“已按范围过滤”提示；spy/mock 断言 LLM 请求无查询结果、候选数据或 selection handle；审计持久化内容、日志和异常不含姓名、完整工号、原始消息/history、员工字段值、候选内容或 selection handle，且 `output_payload` 仅含 `result.type`、状态和字段代码；自然语言命中本 Capability 但受控验证未通过时，统一返回 HTTP `403` 与“当前功能暂未开放”，分类器可调用，Extractor、Context Packet、名册查询与员工查询审计投影均未调用，并仅记录无敏感载荷的 `controlled_rollout_disabled`、`controlled_rollout_expired`、`controlled_rollout_allowlist_denied` 或 `feishu_rollout_denied`；无权限时分类器使用低敏 Route Catalog 命中本 Capability 后由 Gate 返回 403，且 Extractor、Context Packet、名册查询均未调用；超限时 Extractor、名册查询均未调用；Envelope 顶层字段白名单回归。
  - 验收标准：所有业务分支返回合法的统一 Envelope；无业务专属顶层字段；查询结果不回流 LLM；员工查询审计只保存注册的最小投影，不记录未脱敏资料或原始聊天载荷，并将 scope 链执行事实与面向用户的 `permission.filtered` 语义分离。
  - 完成定义：接口、审计、契约和安全测试通过后才可勾选。

- [x] X1508A（004 公共层）建设通用受控 action、幂等与渠道会话底座
  - 前置任务：004 阶段 0A 公共 Runtime/Envelope 契约；不依赖 015 业务 Handler 或员工数据源实现。
  - 功能范围：在 004 定义通用 action Schema 与注册契约，建设 `POST /api/v1/ai/conversations/{conversation_id}/actions`、opaque selection handle 签发、哈希存储/验证、过期、单次消费、用户/会话/渠道绑定、经注册的服务端不可变 action context Schema/持久化、公共 action 分发、事件/动作幂等、渠道会话基础模型、统一审计字段、Capability 审计投影/净化契约和通用 Capability 限速；限速使用 `user_id + capability_id` 跨渠道共享键、统一 Settings 注入、生产默认 20 次/300 秒，并在 Target Capability Gate 成功后、业务 Extractor/Handler 前执行；不绑定飞书协议或员工查询业务。
  - 代码交付物：004 公共 action/会话/Capability 限速/审计投影服务、接口 Schema/错误码契约、必要 action/幂等 migration/模型、注册契约、Settings 配置、审计字段、访问角色/保留期/清理或归档作业配置和测试；015 仅声明业务 action 依赖，不得新建私有实现。
  - UI 要求：不涉及 Portal UI。
  - UCP/外部系统要求：不涉及具体渠道或飞书应用配置。
  - 测试要求：action URL、Schema/注册校验、`400`/`401`/`403`/统一 `410`/`429` 错误语义、正常消费、过期、重复消费、跨用户/会话/渠道、篡改 handle、事件/动作幂等；验证经注册的 action context 只能由服务端签发、不可由 action 请求覆盖或追加，且仅可读取绑定 handle 的同一 context；验证 Settings override、20 次/300 秒生产默认、同用户/Capability 的跨渠道共享计数、超限不调用业务 Handler，以及限速日志/告警排除查询条件、业务数据和 handle；验证审计投影注册、访问控制、保留期与清理/归档作业，并断言公共 action/审计记录不含原始消息、人员字段值或 handle 原文；该层不绑定飞书或员工查询断言。
  - 验收标准：公共 action 可被多 Capability 和多渠道复用；可运行实现能在 LLM-first 分类前完成安全校验并分发到已注册 Handler；仅保存注册的最小控制 context，不保存完整业务资料或 handle 原文。
  - 完成定义：公共单元/契约测试、migration upgrade/downgrade（如适用）和回归证据齐全后才可勾选。

- [x] X1508B（004 公共层）建设飞书事件入站、卡片通道与回调接入
  - 前置任务：X1508A。
  - 功能范围：在 004 收口飞书 URL challenge、验签、时间窗/nonce 校验、`im.message.receive_v1` 接收、事件幂等接入、私聊判断、`open_id` 到 Portal 用户映射、飞书渠道会话桥接、Envelope 消息/卡片适配、卡片回调验签、对 X1508A action 分发的接入、统一渠道审计字段与总开关；实现 `FEISHU_EMPLOYEE_PROFILE_ENABLED` 与 `FEISHU_EMPLOYEE_PROFILE_ALLOWED_USER_IDS` 的渠道受控验证（映射后的 Portal `user_id`），不提供业务主动分享/转发/导出入口，若平台支持卡片不可转发配置则在公共适配层启用。
  - 代码交付物：004 的 `backend/app/integrations/feishu/` 公共路由/服务、必要飞书配置说明、卡片适配和测试；015 不得新建私有入站、回调或卡片基础设施。
  - UI 要求：不涉及 Portal UI。
  - UCP/外部系统要求：飞书应用完成事件订阅、机器人私聊权限、回调域名与验签密钥配置；密钥仅置于服务端环境变量。
  - 测试要求：challenge、有效/无效签名、过期请求、nonce 重放、重复 event/message、私聊、群聊、未绑定用户、禁用用户、错误重试、回调验签、action 单次消费、卡片发送和总开关；自然语言命中员工查询后，覆盖飞书渠道开关关闭、飞书 allowlist 为空/不含映射后的 Portal 用户时 fail closed：统一 HTTP `403` 与“当前功能暂未开放”，分类器可调用但业务 Handler 不得调用，内部原因不得进入卡片；显式 action 按 `action_type` 在 LLM 前执行同一 Gate，失败时以同一 `403`/文案响应且分类器与 action Handler 均不得调用；验证映射为同一 Portal 用户的飞书请求使用与 Web 相同的 Capability 限速键；验证系统不生成主动分享/转发/导出入口，且飞书平台支持时已启用卡片不可转发配置；不对复制、截图或手工转发作无法兑现的阻断断言；该层不绑定员工查询业务断言。
  - 验收标准：公共飞书通道可被多 Capability 复用；群聊或未映射用户不能进入业务 Handler；重复事件不重复发消息；无法映射用户不能匿名访问 Portal 数据。
  - 完成定义：后端测试、飞书测试环境事件验证、配置核验和回滚开关验证均完成后才可勾选。

- [x] X1509（015 接入层）接入飞书 Envelope 简要卡片与只读候选 action 验证
  - 前置任务：X1506、X1507、X1508B。
  - 功能范围：注册 `employee.profile.query` 的只读卡片呈现和业务 action，复用 X1508B 的公共私聊入口、共享 Chat Handler、Envelope、审计及回调分发；将员工结果、候选选择、追问和中性失败映射为卡片，不新增回调协议。
  - 代码交付物：Capability 卡片呈现配置/适配与业务测试；公共卡片适配器、回调处理器和验签仍归 X1508B/004。
  - UI 要求：飞书卡片只显示后端 `fields` 或候选受控字段；按钮文案、失效与失败状态符合 §4.4。
  - UCP/外部系统要求：复用 X1508B 飞书卡片发送/回调封装；不得新增第二个员工查询 Handler。
  - 测试要求：四类 result.type 卡片、候选严格 `display_fields`、候选选择、任意候选无可见展示字段时整体“请补充工号”降级且不生成部分候选卡/handle、过期/篡改 handle、群聊回调、发送失败与重复回调。
  - 验收标准：飞书与 Web 使用同一 Capability/Handler/Envelope/审计；卡片的回调 action payload 仅可携带 opaque selection handle，且不含未脱敏资料、内部 ID、scope、候选展示字段以外的原始人员数据或可逆业务语义。
  - 完成定义：卡片单测、测试环境端到端验证和安全检查通过后才可勾选。

- [x] X1510 实现 Portal 全局 AI 员工信息卡与候选交互
  - 前置任务：X1503、X1506、X1507
  - 功能范围：扩展 AI API 联合类型；实现员工结果卡、候选选择、输入追问及失效状态；保持现有全局 AI 的消息、加载和错误交互。
  - 代码交付物：`frontend/src/api/ai.ts`、`frontend/src/components/GlobalAiAssistant.vue`、必要的 `components/ai/EmployeeProfileResultCard.vue`。
  - UI 要求：两列字段布局、移动端单列降级；候选项按钮清晰；空态/403/失效不保留旧资料卡；只根据 `result.type` 渲染。
  - UCP/外部系统要求：不涉及。
  - 测试要求：TypeScript 类型检查、组件测试或可复现 E2E；唯一结果、字段子集、候选选择、未知 type、无匹配、403、候选过期、隐藏字段不下发，以及（如既有 mask 契约适用）掩码值展示。
  - 验收标准：前端不读取或拼接隐藏字段、不按对象属性猜测类型、不传内部员工 ID；既有 AI 卡片回归正常。
  - 完成定义：构建、交互验证和回归证据齐全后才可勾选。

- [x] X1511 补齐端到端安全、契约与回归测试
  - 前置任务：X1507、X1509、X1510
  - 功能范围：将员工查询纳入 AI 契约、权限、安全、飞书和前端回归套件。
  - 代码交付物：后端/前端测试文件、E2E 脚本或受控手工验收记录。
  - UI 要求：覆盖 Web 与飞书展示状态。
  - UCP/外部系统要求：飞书测试应用和测试账号必须与生产隔离。
  - 测试要求：执行 §6 全部场景；后端 pytest、前端类型检查/构建、OpenAPI Schema、LLM 请求载荷断言和飞书事件重放验证；覆盖 Web/飞书共享计数、生产默认 20 次/300 秒、Settings override、所有结果分支与受控 action 均计数、`429` 中性响应及超限时不调用 Extractor/名册/action Handler；覆盖受控验证的总开关、到期时间、Web/飞书 allowlist、缺失/非法配置及其 fail-closed 分支：自然语言仅在分类命中员工查询后短路，显式 action 在 LLM 前短路，所有受控验证拒绝均为 HTTP `403` 与“当前功能暂未开放”，内部仅记录允许的细分 failure_stage，其他 Capability 不受影响；覆盖明确字段和默认字段的候选选择续接，断言最终字段仅来自服务端 `effective_requested_field_codes`，客户端不得覆盖/追加，且 action 不重新调用 Extractor 或读取 history；检查成功/失败/候选/action 的审计持久化、日志与异常均不含姓名、工号、员工资料、原始消息/history 或 handle。
  - 验收标准：权限、scope、字段交集、防枚举、跨渠道共享限速、受控验证 Gate、审计最小化、结果不回流模型、私聊边界、幂等与会话隔离均具备自动化或可复现证据。
  - 完成定义：测试报告无阻塞失败、遗留风险已记录后才可勾选。

- [ ] X1512 执行上线 Gate、配置核验与回滚演练
  - 前置任务：X1511
  - 功能范围：核验角色权限 seed、004 飞书公共配置、回调域名、环境变量、数据库迁移、监控/审计、前后端同批发布与回滚策略；受控验证仅面向内部测试账号，必须使用已配置的有效期、Web/飞书开关和 allowlist，并定义关闭路径。
  - 代码交付物：发布清单、`EMPLOYEE_PROFILE_*` / `FEISHU_EMPLOYEE_PROFILE_*` 配置核验记录、按固定顺序的发布/回滚步骤和交付说明。
  - UI 要求：上线前验证 Portal 卡片主要路径；不涉及新增 UI。
  - UCP/外部系统要求：飞书事件订阅在生产切换后验证；回滚时先关闭/切换入站事件，避免旧版本误处理新卡片回调。
  - 测试要求：预生产 smoke、迁移检查、Web/飞书主路径、403、群聊拒绝、事件去重、总开关/allowlist/到期短路和回滚演练；验证所有受控验证拒绝均为 HTTP `403` 与“当前功能暂未开放”，细分原因不进入前端/飞书卡片；验证自然语言关闭开关后仅员工查询命中分支在分类后短路、Extractor/查询/员工查询审计投影均未调用，显式 action 在 LLM 前短路，其他 Capability 不受影响。
  - 验收标准：无任何飞书匿名入口、群聊数据泄露或双 Handler；受控验证配置缺失或关闭均 fail closed；发布/回滚均可在受控窗口完成。
  - 完成定义：上线审批、验证证据、回滚资产和交付说明齐全后才可勾选。

## 6. 测试计划

### 6.1 后端契约与 Schema

1. `EmployeeProfileQuerySpec` 仅接受固定 lookup type 和字段代码。
2. 未知 `result.type`、错配 data、额外字段、业务顶层字段均失败。
3. `/api/v1/ai/chat` 员工查询响应精确符合既有 Envelope 顶层白名单。
4. `employee_profile_result` 只含字段数组；候选结果严格符合 `EmployeeProfileCandidateItem`，`display_fields` 至少一项、仅含受限枚举和非空字符串值，且不含完整档案与内部员工 ID；候选结果只能为全部匹配候选均可展示的完整集合，不允许子集。
5. `permission.filtered` 只映射 `scope_filter_restrictive`：受限 scope 为 `true`；全范围/超级管理员或逻辑恒真 scope 为 `false`，即使 `scope_filter_applied=true`。scope 无法解析、未注册或 fail-closed 时不得返回成功 Envelope 或范围过滤提示，且不得通过 SQL 文本推断 scope 是否恒真；默认原值/隐藏路径的 `masking.applied=false`，仅在既有统一 mask 契约实际执行时与该结果一致。

### 6.2 业务成功路径

1. 工号精确匹配唯一员工且未明确字段时，仅返回默认字段集合中允许的姓名、所属组织、岗位、在职状态。
2. 姓名唯一命中，用户指定字段子集后只返回该子集；工号、员工类型、入职日期仅在明确请求时尝试返回。
3. 同名恰好 2–5 人，按固定服务端稳定顺序逐条裁决候选展示字段；仅在全部候选均至少有一项可见 `display_fields` 时返回完整受控候选集合，候选展示使用独立固定字段白名单、不受 `requested_field_codes` 影响；任一候选不可展示时整体提示补充工号；仅通过候选按钮选择后返回对应员工资料。
4. 字段权限允许部分字段时，仅返回原值可见字段并完全隐藏 `hide` 字段；仅在 X1501 确认既有统一 mask 契约适用时，补充验证正确掩码值与脱敏标识。
5. 候选经裁决后任一候选没有可见 `display_fields` 时，不返回候选卡而提示补充工号；不得隐藏该候选后返回可见子集。Portal 与飞书对相同用户/请求得到一致的业务结果语义。

### 6.3 参数、空数据和边界

1. 空消息、没有姓名/工号、空 `requested_field_codes` 的默认字段回退、无效 selection handle、超量字段、非法字段代码。
2. 姓名查询在 scope 过滤后采用 `LIMIT 6`：恰好 5 条返回候选；6 条及以上提示补充工号且不返回候选，不能分页枚举；重复查询的候选顺序稳定。
3. 工号不存在、姓名不存在、范围外、被隐藏，均为相同中性反馈。
4. selection handle 过期、重复消费、跨用户、跨会话、跨渠道及篡改；回复“2”等文本不解释为候选选择；handle 不进入分类器、Extractor、LLM 审计载荷或会话 history。
5. 候选展示字段为 `null`、空串、占位值或被隐藏时省略该字段项；对全部候选完成裁决后，任一候选因此无可见字段则不返回任何候选卡，不得隐藏该候选后返回子集。员工最终详情缺失某个允许字段时，按固定展示规则返回空值/不展示，规则在实现中统一，不得由 LLM 补全。
6. 明确请求“组织和入职日期”得到候选后，点击只能按服务端签发的 `effective_requested_field_codes` 返回通过当前裁决的组织和入职日期；未明确字段的候选在签发 handle 时已展开为固定默认字段代码。action 请求不能携带、覆盖或追加字段代码，且 action 不重新调用 Extractor 或读取原始聊天/history。

### 6.4 权限与安全

1. 未登录或会话无效返回 401；无 `employee.profile:V` 返回 403。无员工查询权限时，分类器仍可通过低敏 Route Catalog 命中 `employee.profile.query`，随后 Gate 拒绝，员工画像 Extractor、Context Packet 与名册查询服务均未被调用。
2. SQL 执行前已注入 `build_scope_filter()`；受限用户的 `scope_filter_applied=true`、`scope_filter_restrictive=true` 且 `permission.filtered=true`；全范围/超级管理员仍执行统一 scope 链但 `scope_filter_restrictive=false`、`permission.filtered=false`。测试不得只断言最终 Python 过滤结果或通过 SQL 文本推断谓词是否恒真；scope 无法解析、未注册或 fail-closed 时不得产生成功结果或范围过滤提示。
3. 注入字符、通配符、SQL 关键词、物理字段/表名请求均不能改变查询语义。
4. 日志、审计、异常和 LLM 调用载荷均不含未脱敏员工资料、候选对象、selection handle、SQL 或飞书密钥。
5. 字段权限不能绕过对象 scope；对象 scope 也不能绕过字段隐藏。不得用 `get_sensitive_columns()` / `apply_mask()` 将统一裁决的 `hide` 字段改为掩码；仅可复用既有明确适用的 mask 契约。
6. `POST /api/v1/ai/conversations/{conversation_id}/actions` 只接受专用 action Schema，不复用聊天 `message`；受控验证 Gate 拒绝统一为 HTTP `403` 与“当前功能暂未开放”，`410` 仅覆盖 handle 无效、过期、已消费或绑定不匹配，且不泄露 handle 失败原因或候选信息。
7. 通用 Capability 限速的生产默认值为每个 `Portal user_id + employee.profile.query` 在滚动 300 秒内 20 次，Web 与飞书共享计数；通过 Settings/依赖 override 覆盖窗口和阈值。成功、无匹配、缺输入、候选返回和受控候选选择均计数；超限返回中性 `429`，且 Extractor、名册查询与 action Handler 均未调用。限速日志/告警不含姓名、工号、候选内容或 handle，并按同一用户/能力/窗口去重。
8. 员工查询所有成功、失败、候选和 action 分支的审计持久化、日志与异常均不含姓名、完整工号、原始消息/history、员工字段值、候选内容或 selection handle；`request_summary` 使用固定能力摘要，`output_payload` 仅保留 `result.type`、状态和字段代码，且审计/动作控制记录的访问权限、保留期、清理或归档作业可验证。
9. 受控验证默认关闭；覆盖 `EMPLOYEE_PROFILE_ENABLED`、`EMPLOYEE_PROFILE_EXPIRES_AT`、Web/飞书 Portal `user_id` allowlist 及 `FEISHU_EMPLOYEE_PROFILE_ENABLED`。自然语言命中员工查询后，开关关闭、allowlist 为空/不匹配、到期时间缺失/非法/到期均 fail closed：统一返回 HTTP `403` 与“当前功能暂未开放”，分类器可完成低敏意图识别，但 Extractor、Context Packet、名册查询、action Handler 和员工查询审计投影均未调用；显式 action 按 `action_type` 在 LLM 前短路并返回同一 `403`/文案。内部审计仅允许 `controlled_rollout_disabled`、`controlled_rollout_expired`、`controlled_rollout_allowlist_denied`、`feishu_rollout_denied`，不得进入用户可见响应。验证其他未命中员工查询的 Capability 不受影响；仅在受控验证放行后才继续 Capability Gate 与限速测试。
10. action 控制记录可保存 `effective_requested_field_codes` 等注册的最小控制 context，但不得写入原始消息、姓名、工号、候选展示值、员工字段值或 scope 条件；该 context 不进入 LLM、LLM 审计载荷、通用会话 history 或客户端 action 请求。

### 6.5 飞书

1. URL challenge、签名有效/无效、时间戳过期、nonce 重放。
2. 私聊可查；群聊/外部群/不明 chat_type 均拒绝且不调用查询。
3. `open_id` 已绑定、未绑定、用户禁用、Portal 权限缺失。
4. 同一个 event/message 重放不会重复查询、重复审计或重复发送卡片。
5. 卡片候选选择、selection handle 失效、回调篡改与卡片发送失败；验证 callback action payload 可携带 opaque handle、但用户可读卡片/日志/审计摘要不出现 handle；验证公共渠道总开关可阻断受控验证。
6. 不生成主动分享、转发或导出入口；若飞书平台支持卡片不可转发配置，验证公共卡片适配已启用。复制、截图或手工转发不作为可自动化阻止的断言，按剩余风险检查最小字段展示、权限告知和审计。
7. `open_id` 映射后，自然语言仅在分类命中员工查询时执行飞书渠道开关和飞书 Portal `user_id` allowlist；开关关闭、allowlist 为空/不匹配或全局受控验证到期时，统一返回 HTTP `403` 与“当前功能暂未开放”，分类器可完成低敏意图识别，但不调用员工查询 Extractor、查询或员工查询审计投影，细分拒绝原因不得出现在卡片。显式 action 按 `action_type` 在 LLM 前执行同一 Gate，失败时返回同一 `403`/文案且不调用分类器或 action Handler。

### 6.6 前端与构建

1. TypeScript 类型检查和生产构建。
2. 结果卡、完整候选卡、任一候选不可展示时的“请补充工号”降级、缺输入、无匹配、403、失效、未知 type；前端不得渲染部分候选集合。
3. 候选点击通过 004 通用 action 续接原 `conversation_id`，请求使用 `action_type` 与 `selection_handle` 专用字段；不向浏览器持久化状态存储员工内部 ID、未脱敏字段或候选展示字段以外的业务语义。
4. 既有补偿金、数据对比、自动化规则草稿和动作卡片回归。

### 6.7 建议执行命令

开发完成后必须根据实际项目脚本核对并记录结果，至少执行：

```text
后端：pytest tests/test_ai_capability_routes.py <员工查询相关测试文件> <飞书相关测试文件> -q
前端：npm run build
```

若项目已有 TypeScript 检查、组件测试、E2E 或飞书 mock 测试命令，应一并执行；不得在交付说明中写入未验证的命令。

## 7. 验收标准

### 7.1 用户验收

- HR/HRBP 可在 Portal 和飞书私聊按姓名或工号查询授权范围内员工基础工作信息。
- 用户明确字段时，只收到所请求且有权限的字段；未明确时只收到默认的姓名、所属组织、岗位、在职状态中通过统一裁决的字段，工号、员工类型、入职日期不会默认返回。
- 同名恰好 2–5 人时可按稳定顺序安全选择和续接；6 条及以上不返回候选而提示补充工号；无匹配、范围外和员工不存在均不暴露存在性。
- 飞书群聊不返回任何员工查询结果。

### 7.2 开发验收

- `employee.profile.query` 独立注册，不混入薪酬数据洞察或自由查询能力。
- Target Capability Gate 位于 Extractor 前。
- 查询固定投影、参数化条件和 scope SQL 前置；无查询后过滤。
- 查询服务与内部审计保留 `scope_filter_applied`、`scope_filter_restrictive`、`scope_resolution_status`；面向用户的 `permission.filtered` 仅映射实际具有限制作用的 `scope_filter_restrictive`，不得以 `filtered=false` 表示未执行统一 scope 链。
- Web 和飞书共用 Handler、权限、Envelope、审计；飞书入站、幂等、会话和回调均复用 004 公共渠道底座，无第二套业务实现。
- 任何查询结果、候选和 selection handle 均不回流 LLM。

### 7.3 测试验收

- §6 中成功、参数、空数据、权限、安全、飞书、构建与回归测试全部通过。
- 自动化测试能拦截未前置 scope、字段越权、业务顶层字段、selection handle 跨会话使用和群聊调用 Handler。
- OpenAPI、实际响应、前端类型和飞书卡片适配一致。

### 7.4 UI / 交互验收

- Portal 卡片只显示后端允许字段，布局在桌面/窄屏可读。
- 候选、追问、无匹配、权限、失效和未知类型状态清晰且不泄露数据。
- 飞书卡片信息简要、无内部标识，不允许通过卡片扩展为批量、自由筛选、主动分享、转发或导出；平台支持时启用不可转发配置。复制、截图和手工转发属于剩余风险，不作为系统可保证禁止的验收项。

### 7.5 上线验收

- 受控验证配置使用 `EMPLOYEE_PROFILE_ENABLED=false`、`EMPLOYEE_PROFILE_ALLOWED_USER_IDS=`、`EMPLOYEE_PROFILE_EXPIRES_AT=`、`FEISHU_EMPLOYEE_PROFILE_ENABLED=false`、`FEISHU_EMPLOYEE_PROFILE_ALLOWED_USER_IDS=` 作为默认关闭态；两个 allowlist 均使用 Portal `user_id`，到期时间为带时区的 UTC ISO-8601 值。缺失、空值或解析失败均保持 fail closed。
- 发布顺序固定为：1）先发布前端未知 `result.type` 安全降级；2）发布数据库 migration 与 004 公共 action；3）发布后端，但 Web/飞书 Capability 开关保持关闭；4）配置权限 seed；5）设置有效期、开启 `EMPLOYEE_PROFILE_ENABLED` 并配置内部 Portal 用户 allowlist；6）执行 Web smoke；7）开启飞书渠道开关及飞书 allowlist，执行飞书受控验证；8）完成群聊拒绝、事件/动作幂等、审计净化和限速检查。
- 生产飞书事件订阅仅处理私聊；签名密钥和应用凭证不写入仓库或日志。生产通用 Capability 限速配置必须启用，且 `window_seconds=300`、`max_requests=20`；Web/飞书共享计数、`429` 中性响应与同窗口告警去重已完成预生产验证。
- 004 的审计投影、动作控制记录与 AI 审计记录的访问角色、保留期及清理/归档作业已配置并在预生产验证；抽样确认员工查询审计不含姓名、工号、原始聊天载荷、员工字段值或 handle。
- 回滚顺序固定为：1）关闭 Web 与飞书 Capability 开关；2）统一使未消费 selection handle 失效，或等待既定 10 分钟 TTL 排空；3）回滚前后端；4）保留审计、幂等和已消费 action 数据；5）确认不存在旧卡片回调依赖后，才执行相关 migration downgrade。上线后完成 Web/飞书 smoke、审计检查和群聊拒绝验证。

## 8. 风险与兼容性

| 风险 | 等级 | 影响 | 应对方案 |
|---|---|---|---|
| Route Catalog 暴露过多业务或数据细节 | 中 | 用户或模型获得不必要的能力实现线索 | Catalog 仅提供 Capability ID 和低敏路由描述；权限规则、字段、数据源与上下文一律不进入分类器；命中后由 X1502 Gate 返回 403 或放行 |
| scope 在查询后过滤 | 高 | 可产生越权读取和枚举风险 | SQL 编译/执行前断言 `build_scope_filter()` 已注入 |
| 字段权限被误当作对象权限 | 高 | 可查询范围外员工 | 分离功能、对象、字段三层验证，增加组合测试 |
| LLM 接收查询结果 | 高 | 人员数据外泄、事实改写和脱敏失效 | Handler 直接组装 Envelope/卡片，测试断言 LLM 载荷无结果 |
| 审计持久化完整聊天或人员结果 | 高 | 姓名、工号、员工资料或 handle 在审计链路长期留存 | 004 Capability 审计投影/净化、最小字段白名单、访问控制、保留期与清理/归档；自动化断言审计、日志和异常不含敏感载荷 |
| 飞书群聊或未映射用户进入查询 | 高 | 人员信息泄露 | 入站先验签、判私聊、映射 Portal 用户，再调用 Handler |
| 用户复制、截图或手工转发飞书卡片 | 中 | 已获准展示的最小字段仍可能脱离当前会话传播 | 系统不提供主动分享/转发/导出入口；平台支持时启用不可转发配置，并以最小字段展示、权限告知和审计降低剩余风险 |
| 飞书事件重放 | 中 | 重复查询、重复卡片和审计污染 | event/message 唯一幂等和回调单次消费 |
| selection handle 被重放或跨用户使用 | 高 | 越权访问其他员工 | 004 公共 action 的短期、哈希、单次、用户/会话/渠道绑定及重新 scope/字段校验；handle 不经过 LLM |
| Capability 限速缺失、配置失效或跨渠道不共享 | 中 | 可被连续查询逐步探查人员目录 | 004 统一按 `user_id + capability_id` 跨渠道限速，生产默认 20 次/300 秒；超限 429、最小化日志与去重告警，并在预生产验证 |
| 受控验证开关、allowlist 或有效期配置失效 | 高 | 非测试账号、过期验证或未启用渠道进入人员查询 | 统一 Settings fail closed，按 Portal `user_id` 约束 Web/飞书 allowlist；自然语言在分类命中员工查询后、业务执行前检查，显式 action 在 LLM 前检查，发布/回滚按固定 Gate 执行并自动化验证短路 |
| 员工数据源字段与 scope 映射不一致 | 高 | 错查、漏查或范围失效 | X1501 先核验并在测试环境用真实映射验证 |
| 新 result.type 未被前端支持 | 中 | Portal 只显示文本或交互失败 | 前后端同批发布；未知类型安全降级；增加构建/E2E |
| 飞书公共底座配置或验签错误 | 中 | 机器人无法响应或误接收请求 | 测试应用先验证 challenge/验签/私聊事件/总开关，生产配置清单核验 |

兼容性结论：本能力不改变既有 `/api/v1/ai/chat` 顶层协议；只在已发布的 `result.type` 联合中增加受控类型。候选选择复用 004 通用受控 action，不作为聊天消息或 Extractor 字段。若需要会话或幂等 migration，必须在 004 公共层提供成对 downgrade。Web 与飞书必须复用同一业务结果协议，不允许为飞书形成不兼容响应模型。

## 9. 交付说明模板

```markdown
# 员工基础工作信息查询交付说明

## 已完成任务
- [ ] X1501 ...

## 修改文件
- `backend/app/ai/capabilities.py`：
- `backend/app/ai/router.py`：
- `backend/app/permissions/...`：
- `backend/app/integrations/feishu/...`：
- `backend/alembic/versions/...`（如适用）：
- `frontend/src/api/ai.ts`：
- `frontend/src/components/GlobalAiAssistant.vue`：
- `frontend/src/components/ai/...`：
- `backend/tests/...`：
- `frontend/...tests...`：

## 数据库与配置
- 员工数据源/scope 核验：
- migration upgrade/downgrade（如适用）：
- 飞书事件订阅、验签、私聊权限和回调域名：

## 测试命令与结果
- 后端：
- 前端构建：
- Web E2E：
- 飞书测试环境：
- 安全/权限/审计：

## UI 验证
- Portal 唯一结果与字段子集：
- Portal 同名候选与失效：
- 飞书私聊结果与候选卡：
- 飞书群聊拒绝：

## 接口与安全证据
- Envelope 实际响应：
- scope SQL 前置断言：
- LLM 请求载荷不含查询结果：
- 脱敏/字段权限：
- 事件幂等与 selection handle 会话隔离：

## 未完成项
- 无 / 列明任务、原因与风险

## 风险与后续建议
- 无 / 列明风险
```
