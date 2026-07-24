# 通用 Webhook 触发器资源对象化与流程编排组件化开发规格

> 文档状态：待开发评审  
> 适用范围：UCP 通用数据连接器平台、事件中心、接入系统、资源对象、流程编排、账号生命周期流程  
> 建议任务编号：X0213 ～ X0220  
> 编写日期：2026-07-24

## 1. 背景与目标

### 背景

UCP 已具备接入系统、资源、资源数据对象、标准 SaaS 业务能力、事件总线、事件触发器、流程模板和流程运行等能力，但上述概念在当前实现中存在边界混杂：

1. **资源的现有产品语义清晰但偏数据读取。**
   - 用户以“系统 → 资源 → 对象”理解配置：例如“北森 → 北森报表 → 待入职人员报表”。
   - 同一个资源可配置多个报表或数据对象，流程节点选择系统和资源后再选择对象。
   - 现有物理表为 `ucp_resource` 与 `ucp_resource_data_object`；后者不能只继续被理解为“报表对象”。
2. **业务能力的现有语义是流程主动调用的操作。**
   - 例如“按投递记录 ID 查询 Offer”“创建账号”“停用账号”。
   - 业务能力的定义与系统启用状态位于标准 SaaS 能力包和系统能力目录中，适合流程内部节点调用。
3. **事件触发器当前过度聚合。**
   - `ucp_event_trigger` 同时保存 `webhook_path`、验签相关字段、飞书专属字段、`event_types`、`pipeline_code`、过滤规则和运行身份。
   - 这把“Webhook 接收端”“事件类型/Schema”“流程订阅绑定”揉进一张表，导致同一外部系统的多个流程可能复制路径、验签和密钥配置。
   - 现有 `UcpEvent` 已能记录 `system_code` 与 `resource_id`，事件总线也已有按 `source_resource_id` / `source_system_code` 匹配触发器的能力；模型方向正确，但 API 与 UI 未完整资源化。
4. **流程起点被错误表达为普通节点。**
   - 现有“离职账号停用”模板以名为“解析离职事件”的 `TRANSFORM` 节点作为第一个节点，实际只映射员工 ID，不承担接收事件或解析离职生效时间的职责。
   - 待入职人员入仓和 Offer 薪酬补充应由定时触发后批量读取；账号启停通常应由 Webhook 触发后处理单条事件。两者不应通过不同的假起点节点表达。
5. **流程设计器与流程列表已开始围绕模板工作。**
   - 流程模板保存后已可在“流程编排”看到，但触发方式仍未成为模板的统一、可配置的启动属性。

### 最终产品结论

- **Webhook 是一种触发方式，同时是接入系统下的一种资源类型，不是普通画布节点，也不是流程内部业务能力。**
- **具体事件是 Webhook 资源下的事件对象。**业务能力继续只描述“流程主动调用外部系统做什么”；事件对象描述“该资源可接收什么事件”。为复用 Schema、版本、敏感字段和标准化映射，事件对象可在后端引用事件定义元数据，但该元数据不作为普通用户的额外配置层级。
- **产品配置层只维持用户熟悉的“系统 → 资源 → 对象”路径。**
  - 北森报表资源下的对象是报表。
  - 飞书多维表格资源下的对象是表。
  - Webhook 资源下的对象是事件类型；用户选择的是事件对象，不会出现额外的事件配置层。
- **事件定义元数据仅为后端复用层。**事件对象可引用它以获得 Schema、版本、标准化和敏感字段治理；普通流程管理员不需要、也不应在流程中单独选择该元数据。
- **流程触发器只绑定已配置的资源对象，不保存 Webhook 密钥、路径或供应商专属验签参数。**
- **流程画布只编排业务组件。**触发方式在流程属性或触发器配置中选择；`TRANSFORM` 只做字段转换，不能伪装成接收事件的起点。

### 目标

1. 将现有 `ucp_resource_data_object` 逻辑泛化为“资源对象”，支持 `REPORT`、`TABLE`、`API_OBJECT`、`EVENT_TYPE` 等对象类型，且完全兼容已有报表对象。
2. 新增供资源对象引用的事件定义元数据，使 Webhook 事件对象具备 Schema、版本、标准化映射、供应商校验策略和启用状态；该元数据不作为流程页面或普通用户页面的独立“能力”层。
3. 将 Webhook 路径、验签、订阅校验、来源系统、凭证引用和接收审计收敛到接入系统的 Webhook 资源中。
4. 建立统一流程触发器模型，支持 `MANUAL`、`SCHEDULE`、`WEBHOOK`、`PLATFORM_EVENT` 四种启动方式；Webhook 触发时按“系统 → 资源 → 事件对象”选择。
5. 改造现有“触发规则”“接入系统”“流程设计器”“事件详情/运行详情”UI，形成一致的高组件化、强配置化体验。
6. 将“离职账号停用”模板从 `TRANSFORM` 假起点迁移为 Webhook 触发的业务流程；保留人工和定时补偿触发能力。
7. 保留旧事件触发器、旧飞书 Webhook 路径及旧资源数据对象 API 的兼容期，避免已有生产配置中断。

### 非目标 / 不做范围

- 本期不实现任意第三方系统自动注册事件订阅的完整供应商 SDK；仅为已支持的飞书和自定义签名 Webhook 提供通用接入框架。
- 本期不将所有已有 UCP 资源强制迁移为新对象类型；旧报表/表对象默认视为 `REPORT` 或既有对象类型。
- 本期不引入用户可在流程中填写任意公网 URL、Token、验签密钥的能力。
- 本期不将 Webhook 接收做成流程画布可拖拽的 `WEBHOOK` 节点。
- 本期不重构无关的数据仓库、报表、数据集或既有业务能力执行逻辑。
- 本期不承诺飞书未公开或未授权的账号事件；事件对象只有在来源系统、权限和订阅验证通过后才可启用。

### 假设与待确认事项

1. 飞书或其他来源系统可提供账号创建、账号停用、员工离职等目标事件，且租户管理员可完成授权、订阅和验签配置；若供应商不支持，则该事件对象必须标记为“不支持/未验证”，不得伪造可选项。
2. Webhook 对外暴露域名、HTTPS 证书、反向代理、最大 Body 大小和限流策略由部署环境提供；本期后端仍需实施应用层大小和频率保护。
3. 离职账号停用的权威事实来源、离职生效时间字段、时区及撤销/改期规则需 HR、IT、安全共同确认。默认使用来源事件中的 `termination_effective_at`，不得以事件接收时间替代。
4. 当前 `specs/011-universal-connector-platform` 目录未发现 `START_HERE.md`、`atomic-tasks.md`、`warehouse-coordination.md`。本规格使用 X0213～X0220 作为建议编号；正式开工前必须将任务同步到项目统一原子任务台账，避免与后续编号冲突。

## 2. 用户场景

### 2.1 UCP 管理员：配置飞书 Webhook 资源并启用事件对象

- 入口：`/ucp/systems` → 选择“飞书”系统 → 资源管理。
- 操作：新建或编辑资源，资源类型选择“Webhook 事件接入”；选择已绑定的飞书凭证/密钥引用，完成 URL challenge、签名/加密校验测试；在该资源下启用“账号已创建”“账号已停用”等事件对象。
- 系统反馈：展示资源状态（草稿、待验证、已验证、停用）、验证时间、订阅状态、脱敏的路径与 Header 名称；密钥真实值永不回显。
- 成功结果：资源对象可被流程触发器选择，事件接收后可写入事件中心。
- 失败/空态/无权限：
  - 无 `ucp.systems.U` 权限时资源编辑按钮隐藏，直接访问返回 403。
  - challenge、签名、解密或连通性失败时给出可读错误码与脱敏摘要，不显示请求密钥。
  - 未验证资源及未启用事件对象不可绑定到生产流程触发器。

### 2.2 流程管理员：为流程选择定时或 Webhook 起点

- 入口：`/ucp/pipelines/designer?code={template_code}` 的“流程属性 → 触发方式”区域，或 `/ucp/events/triggers` 的“新建触发器”。
- 操作：
  - 待入职人员入仓流程选择“定时”，配置 Cron、时区和批处理窗口。
  - 离职账号停用流程选择“Webhook”，依次选择系统、Webhook 资源、事件对象；可附加业务过滤条件、流程级幂等键、运行身份和失败策略。
- 系统反馈：触发配置以摘要卡片显示；Webhook 配置只显示资源状态和事件对象，不显示/不要求输入路径、Token、飞书验签字段。
- 成功结果：触发器处于“已启用”，事件中心命中事件后创建对应 Pipeline Run；定时器到点时创建批处理 Pipeline Run。
- 失败/空态/无权限：
  - 尚无已验证 Webhook 资源时展示空态和“前往接入系统创建资源”。
  - 事件对象不存在、未启用或资源未验证时阻断保存并指出修复入口。
  - 无 `ucp.events.C/U` 或 `ucp.pipelines.U` 权限时只读展示。

### 2.3 HR/IT 运维：处理离职账号停用

- 入口：外部系统发送“员工离职生效”Webhook；或在流程详情选择人工补偿触发；或由每日补偿定时扫描触发。
- 操作：无需在画布中填写 Webhook 信息。流程从统一触发上下文读取员工、离职生效时间和来源事件 ID，经时间策略、审批、账号停用、通知等组件处理。
- 系统反馈：事件详情展示来源系统、资源、事件对象、验签结果、去重结果、命中触发器和目标运行链接；运行详情展示每个账号动作及脱敏外部响应。
- 成功结果：目标账号按策略停用，审计链路可从事件追溯到触发器、流程模板版本、Pipeline Run 和单步执行。
- 失败/空态/无权限：
  - 事件重复时标记为已去重，不重复停用账号。
  - 离职生效时间尚未到达时进入等待/定时执行状态，不提前停用。
  - 员工或外部账号映射缺失时进入可重试失败/人工待处理，不执行猜测性操作。

### 2.4 审计与安全管理员：查看配置与事件链路

- 入口：`/ucp/events`、事件详情、运行详情和接入系统资源详情。
- 操作：按系统、资源、事件对象、触发器、运行状态查询；查看脱敏后的 Schema、配置版本、验证记录和重放结果。
- 系统反馈：显示配置版本、操作者、变更时间、来源事件 ID 与 Trace ID；敏感 Payload 字段按权限脱敏。
- 成功结果：能够判断一个账号操作为何发生、由哪个事件触发、使用哪个资源配置和流程模板版本。
- 失败/空态/无权限：无查看权限时返回 403；敏感字段无权限时返回脱敏值或不返回字段。

## 3. 功能范围

| 功能项 | 是否本期实现 | 说明 |
|---|---:|---|
| 将“资源数据对象”泛化为“资源对象” | 是 | 保留物理表与旧 API 的兼容别名，新增对象类型与事件对象属性。 |
| Webhook 资源类型 | 是 | 资源级配置路径、凭证引用、验签/订阅验证、状态和接收审计。 |
| 事件定义元数据 | 是 | 为 Webhook 事件对象提供可复用的事件代码、Schema、版本、标准化和供应商校验策略；不新增普通用户可见的能力层。 |
| Webhook 资源事件对象 | 是 | Webhook 资源下可启用多个事件对象；每个对象可引用事件定义元数据。 |
| 统一流程触发器 | 是 | 支持手动、定时、Webhook、平台事件；一个模板可绑定多个触发器。 |
| 流程设计器触发方式 UI | 是 | 触发器作为流程属性/绑定配置，不进入节点库。 |
| 接入系统 UI 支持 Webhook 资源与事件对象 | 是 | 与现有报表对象共用“资源 → 对象”交互框架。 |
| 事件中心、运行中心关联跳转 | 是 | 事件 → 资源对象 → 触发器 → 运行详情的可追溯链路。 |
| 离职账号停用模板迁移 | 是 | 删除假起点 Transform，改为 Webhook/人工/补偿定时触发。 |
| 待入职 Offer 入仓流程迁移 | 是 | 保持定时触发，显式配置批处理输入契约。 |
| 自动为所有供应商创建订阅 | 否 | 仅提供可扩展校验/订阅适配器框架。 |
| 任意 URL/密钥在流程页面直填 | 否 | 禁止；必须经系统、资源和凭证治理。 |
| Webhook 画布节点 | 否 | 禁止，以防接入配置和流程步骤重复建设。 |

## 4. 技术设计

### 4.1 数据库 / 数据模型

#### 4.1.1 总体模型

```text
UcpSystem（接入系统）
  └─ UcpResource（资源：北森报表、飞书多维表格、飞书事件接入等）
       └─ UcpResourceObject（产品概念；一期复用 ucp_resource_data_object）
            ├─ REPORT / TABLE / API_OBJECT
            └─ EVENT_TYPE → 可选引用 UcpEventDefinition（后端元数据）

UcpOperationDefinition（业务能力定义：流程内部主动调用）
UcpSystemCapability（系统已启用业务能力）

UcpEventDefinition（后端事件定义元数据：供事件对象引用）
UcpResourceObject（EVENT_TYPE 类型的具体事件对象：用户可选择）

UcpPipelineTemplate（流程模板）
  └─ UcpPipelineTrigger（触发器绑定：MANUAL / SCHEDULE / WEBHOOK / PLATFORM_EVENT）

UcpEvent（实际接收/发布的事件）
  └─ 记录 system_code、resource_id、resource_object_id、event_definition_id、trigger_id、pipeline_run_id
```

#### 4.1.2 资源对象兼容改造

保留 `ucp_resource_data_object` 物理表及旧 API 路径，以降低既有北森/飞书表格配置风险；在代码和 UI 中将其统一称为“资源对象”。新增字段：

| 字段 | 类型 / 默认值 | 说明 |
|---|---|---|
| `object_type` | `VARCHAR(32)`，默认 `REPORT` | `REPORT` / `TABLE` / `API_OBJECT` / `EVENT_TYPE`。旧数据按资源适配器回填，不可识别时回填 `API_OBJECT` 并标记待确认。 |
| `event_definition_id` | `BIGINT NULL`，FK `ucp_event_definition.id` | 仅 `EVENT_TYPE` 必填。 |
| `event_config` | `JSONB NOT NULL DEFAULT {}` | 资源对象级订阅/路由覆盖配置；禁止存储明文 secret。 |
| `verification_status` | `VARCHAR(32)`，默认 `NOT_REQUIRED` | `NOT_REQUIRED` / `PENDING` / `VERIFIED` / `FAILED` / `DISABLED`。 |
| `last_verified_at` | `TIMESTAMPTZ NULL` | 最近一次验证时间。 |
| `schema_version` | `VARCHAR(32) NULL` | 当前启用的事件 Payload Schema 版本。 |

约束与索引：

- `EVENT_TYPE` 必须有 `event_definition_id`，非 `EVENT_TYPE` 必须为 `NULL`。
- 唯一索引：`(resource_id, object_code)`；与既有唯一约束保持一致或补齐。
- 查询索引：`(resource_id, object_type, is_active)`、`(event_definition_id, verification_status)`。
- 删除资源对象前必须检查是否被有效触发器引用；有引用时返回 409 和影响列表。

#### 4.1.3 事件定义元数据（后端复用，不新增用户配置层）

新增 `ucp_event_definition` 作为后端事件定义元数据表；它可纳入标准 SaaS 包治理，但不在产品 UI 中形成独立配置层，也不复用业务操作表。

| 字段 | 类型 / 默认值 | 说明 |
|---|---|---|
| `id` | `BIGINT PK` | 主键。 |
| `package_id` | `BIGINT NULL` | 可关联标准 SaaS 能力包；自定义系统可为空。 |
| `event_code` | `VARCHAR(128) UNIQUE` | 稳定代码，例如 `FEISHU.ACCOUNT_DISABLED`、`HR.EMPLOYEE_TERMINATED`。 |
| `event_name` | `VARCHAR(128)` | 展示名称。 |
| `source_system_type` | `VARCHAR(64)` | 供应商/系统类型，例如 `FEISHU`、`BEISEN`、`CUSTOM`。 |
| `payload_schema` | `JSONB NOT NULL` | JSON Schema，定义字段、类型、敏感性、必填项。 |
| `normalization_schema` | `JSONB NOT NULL DEFAULT {}` | 源 Payload 到 UCP 标准事件 Envelope 的映射声明。 |
| `verification_strategy` | `VARCHAR(64)` | `NONE` / `HMAC_SHA256` / `FEISHU_ENCRYPTED_EVENT` / `CUSTOM_ADAPTER`。 |
| `version` | `VARCHAR(32)` | 事件 Schema 版本。 |
| `status` | `VARCHAR(16)`，默认 `DRAFT` | `DRAFT` / `PUBLISHED` / `DEPRECATED`。 |
| `risk_level` | `VARCHAR(32)`，默认 `read_low` | 事件 Payload 的敏感性/风险分级。 |
| `created_at` / `updated_at` | `TIMESTAMPTZ` | 审计字段。 |

规则：

- `event_code` 一旦发布不可修改；Schema 破坏性变更必须新增版本。
- 资源对象只可引用 `PUBLISHED` 事件定义。
- 产品 UI 不要求普通管理员单独维护事件定义；标准系统由能力包/管理员维护，自定义事件定义由具备高级权限的管理员创建。

#### 4.1.4 Webhook 资源配置

在 `ucp_resource` 增加或标准化以下字段（优先放入现有 `protocol` / `adapter_config` JSON，避免在资源表无边界加列）：

```json
{
  "resource_type": "WEBHOOK_INGRESS",
  "ingress": {
    "path_mode": "RESOURCE_SCOPED",
    "public_path": "/api/v1/ucp/webhooks/resources/{resource_code}",
    "max_body_bytes": 1048576,
    "rate_limit_per_minute": 120,
    "credential_id": 123,
    "signature_header": "X-Lark-Request-Timestamp",
    "verification_strategy": "FEISHU_ENCRYPTED_EVENT"
  }
}
```

规则：

- `resource_type=WEBHOOK_INGRESS` 的资源必须关联系统、适配器和凭证/密钥引用；不可保存明文 `signing_secret`、`verification_token`、`encrypt_key`。
- 路径由资源代码生成并全局唯一；流程触发器不再拥有路径。
- 每个 Webhook 资源可以有多个 `EVENT_TYPE` 资源对象。
- 单一供应商需要一个共享入口时：一个资源下配置多个事件对象。
- 供应商要求每个订阅独立 URL 时：仍以同一资源承载凭证与验签策略，由对象 `event_config.path_suffix` 生成受控子路径；不得允许自由填写完整 URL。

#### 4.1.5 统一流程触发器

将当前 `ucp_event_trigger` 演进为产品概念 `ucp_pipeline_trigger`。一期允许保留物理表名并新增字段，避免高风险表重命名；ORM、接口和 UI 使用统一名称。新增/调整字段：

| 字段 | 类型 / 默认值 | 说明 |
|---|---|---|
| `trigger_type` | `VARCHAR(32)`，默认 `WEBHOOK`（旧事件触发器） | `MANUAL` / `SCHEDULE` / `WEBHOOK` / `PLATFORM_EVENT`。 |
| `pipeline_template_id` | `BIGINT NULL`，FK 模板 | 新流程目标；旧 `pipeline_code` 保留兼容期。 |
| `source_resource_object_id` | `BIGINT NULL`，FK 资源对象 | `WEBHOOK` / `PLATFORM_EVENT` 必填。 |
| `schedule_config` | `JSONB NOT NULL DEFAULT {}` | `SCHEDULE` 使用，包含 cron、timezone、misfire 策略、批处理窗口。 |
| `filter_rule` | `JSONB NOT NULL DEFAULT {}` | 流程级业务过滤，不保存来源验签配置。 |
| `idempotency_expression` | `VARCHAR(512) NULL` | 例如 `${event.event_id}` 或 `${event.payload.employee_id}:${event.event_type}`；需受限表达式解析。 |
| `failure_policy` | `VARCHAR(32)` | `RETRY` / `DEAD_LETTER` / `CONTINUE`。 |
| `run_as_type` / `service_account_code` | 现有字段保留 | 流程执行主体。 |
| `is_active` | 现有字段保留 | 启用状态。 |
| `legacy_config` | `JSONB NULL` | 迁移期保留非敏感旧配置快照，便于回滚与审计。 |

从触发器移除或废弃：`webhook_path`、明文签名密钥、飞书验签专属字段。兼容期内旧字段只读，所有新建/编辑 UI 不展示。

#### 4.1.6 事件实例与审计链路

`ucp_event` 新增可空字段：

- `resource_object_id`：来源事件对象。
- `event_definition_id`：命中的事件定义元数据。
- `ingress_resource_config_version`：接收时资源配置版本。
- `payload_schema_version`：实际解析版本。
- `dedup_key`：全局去重键；唯一约束按 `(resource_id, dedup_key)` 建立。

兼容原则：旧事件允许上述字段为空；新 Webhook 资源接收的事件必须写入来源系统、资源、资源对象、事件定义和 Trace ID。

#### 4.1.7 Migration、兼容旧数据与 Downgrade

Migration 顺序：

1. 新建 `ucp_event_definition`；为飞书现有事件和通用自定义签名事件写入预置定义。
2. 为 `ucp_resource_data_object` 新增资源对象字段，旧对象默认回填 `REPORT` / `TABLE` / `API_OBJECT`。
3. 为 `ucp_event_trigger` 新增触发器类型、目标模板、来源资源对象、计划配置、幂等表达式和兼容快照字段；不删除旧列。
4. 为 `ucp_event` 新增资源对象、事件定义、配置版本和去重字段；先创建非唯一索引，完成数据清理后再创建去重唯一索引。
5. 迁移旧飞书/自定义触发器：
   - 每个可识别 Webhook 路径创建/复用对应 `WEBHOOK_INGRESS` 资源；
   - 创建对应事件对象并迁移非敏感匹配规则；
   - 密钥若无法安全转换到凭证库，触发器标记 `MIGRATION_REQUIRED`，保持旧路径兼容但不允许新启用，管理员必须重新配置验证；
   - 旧 `pipeline_code` 可解析为模板时补充 `pipeline_template_id`，否则保留旧绑定并在 UI 提示迁移。
6. 发布后至少保留一个稳定版本兼容旧 `/ucp/triggers`、`/ucp/webhooks/feishu/{trigger_code}` 和 `/resources/{id}/data-objects`。

Downgrade：

- 仅删除新表、新列、新索引和新路由，不删除既有 `ucp_event_trigger` 旧字段与旧触发器记录。
- 已创建的新资源/事件对象在 downgrade 前导出非敏感配置快照；密钥仍只存在凭证库，不在 migration 中回写明文。
- 若新触发器已被生产流程引用，downgrade 必须被发布检查阻断并提示先停用/迁移，不允许静默丢失绑定。

### 4.2 后端接口

所有接口必须使用明确的 Pydantic Schema；除供应商原始 Payload 接收入口外，禁止以无约束 `dict` 作为管理接口的唯一请求模型。

#### 4.2.1 资源对象接口

| URL | Method | Request / Response | 权限 | 状态码与错误处理 |
|---|---|---|---|---|
| `/api/v1/ucp/resources/{resource_id}/objects` | GET | Query：`object_type`、`is_active`；Response：对象列表（含验证状态、事件定义摘要） | `ucp.systems.V` | 200；资源不存在 404；无权 403。 |
| `/api/v1/ucp/resources/{resource_id}/objects` | POST | `ResourceObjectCreateRequest`：`object_code`、`object_name`、`object_type`、`event_definition_id?`、`event_config?`、`is_active` | `ucp.systems.C` | 201；Schema/类型不匹配 422；重复 code 409；资源类型不支持 400。 |
| `/api/v1/ucp/resources/{resource_id}/objects/{object_id}` | PATCH | `ResourceObjectUpdateRequest` | `ucp.systems.U` | 200；被生产触发器引用的破坏性更新 409。 |
| `/api/v1/ucp/resources/{resource_id}/objects/{object_id}` | DELETE | Response：`deleted`、`impact` | `ucp.systems.D` | 200；存在触发器引用 409。 |
| `/api/v1/ucp/resources/{resource_id}/data-objects` | GET/POST/PATCH/DELETE | 旧路径 | 沿用旧权限 | 兼容别名；响应增加 `object_type`，并返回 `Deprecation` 响应头。 |

#### 4.2.2 事件定义元数据与验证接口

| URL | Method | Request / Response | 权限 | 状态码与错误处理 |
|---|---|---|---|---|
| `/api/v1/ucp/event-definitions` | GET | Query：`source_system_type`、`status`；Response：事件定义摘要与可绑定资源类型 | `ucp.events.V` | 200。 |
| `/api/v1/ucp/event-definitions` | POST | `EventDefinitionCreateRequest`：代码、名称、来源类型、Payload Schema、标准化映射、策略、版本 | `ucp.systems.C` + 高级事件定义权限 | 201；Schema 非法 422；代码重复 409。 |
| `/api/v1/ucp/event-definitions/{id}` | PATCH | `EventDefinitionUpdateRequest` | 高级事件定义权限 | 200；发布后破坏性修改 409，要求新版本。 |
| `/api/v1/ucp/resources/{id}/verify` | POST | `WebhookResourceVerifyRequest`：`challenge_payload?`、`sample_event?`；Response：校验步骤、脱敏摘要、资源状态 | `ucp.systems.U` | 200；验签/解密失败 400；外部超时 502/504。 |
| `/api/v1/ucp/resources/{id}/objects/{object_id}/verify` | POST | 可选样例 Payload；Response：对象 Schema 匹配、订阅状态 | `ucp.systems.U` | 200；资源未验证 409；事件定义不匹配 422。 |

#### 4.2.3 流程触发器接口

| URL | Method | Request / Response | 权限 | 状态码与错误处理 |
|---|---|---|---|---|
| `/api/v1/ucp/pipeline-triggers` | GET | Query：`pipeline_template_code`、`trigger_type`、`source_resource_id`、`is_active`；Response：触发器及来源摘要 | `ucp.events.V`、`ucp.pipelines.V` | 200。 |
| `/api/v1/ucp/pipeline-triggers` | POST | `PipelineTriggerCreateRequest`，见下方 | `ucp.events.C` + `ucp.pipelines.U` | 201；来源对象不可用 409；无权 403；字段错误 422。 |
| `/api/v1/ucp/pipeline-triggers/{trigger_code}` | PATCH | `PipelineTriggerUpdateRequest` | `ucp.events.U` + 目标流程编辑权限 | 200；生产影响需确认 409/422。 |
| `/api/v1/ucp/pipeline-triggers/{trigger_code}/enable` | POST | `enabled: boolean` | `ucp.events.U` | 200；资源/对象未验证时启用 409。 |
| `/api/v1/ucp/pipeline-triggers/{trigger_code}/test` | POST | `PipelineTriggerTestRequest`：`sample_payload?`、`dry_run=true` | `ucp.events.V` | 200；不写真实外部账号，仅创建预览结果。 |
| `/api/v1/ucp/pipeline-triggers/{trigger_code}` | DELETE | Response：`deleted`、影响运行策略 | `ucp.events.D` | 200；运行中触发器 409 或先停用。 |
| `/api/v1/ucp/triggers` | GET/POST/PATCH/DELETE | 旧事件触发器接口 | 沿用 | 兼容映射；新字段仅只读补充，不再接收明文 secret。 |

`PipelineTriggerCreateRequest`：

```json
{
  "trigger_code": "OFFBOARDING_FROM_BEISEN",
  "trigger_name": "北森离职生效触发账号停用",
  "pipeline_template_code": "TPL_OFFBOARDING_ACCOUNT",
  "trigger_type": "WEBHOOK",
  "source_resource_object_id": 101,
  "filter_rule": {
    "employment_status": "TERMINATED"
  },
  "idempotency_expression": "${event.event_id}",
  "failure_policy": "RETRY",
  "run_as_type": "SERVICE_ACCOUNT",
  "service_account_code": "ucp_lifecycle_service",
  "is_active": true
}
```

约束：

- `WEBHOOK`：`source_resource_object_id` 必填，来源对象必须为已验证且启用的 `EVENT_TYPE`。
- `SCHEDULE`：`schedule_config.cron`、`timezone` 必填；不得填写 `source_resource_object_id`。
- `MANUAL`：不得要求来源资源；可定义允许的表单参数 Schema。
- `PLATFORM_EVENT`：可引用内部事件资源对象，且不暴露公网 Webhook 路径。

#### 4.2.4 Webhook 接收接口

| URL | Method | Request / Response | 权限 | 状态码与错误处理 |
|---|---|---|---|---|
| `/api/v1/ucp/webhooks/resources/{resource_code}` | POST | 原始供应商请求；Response：供应商要求的确认响应或 `{accepted, event_id, trace_id}` | 公网入口，无登录权限 | 2xx 仅代表接收；签名非法 401/403；Body 超限 413；未知对象 404；Schema 不匹配 422；重复事件返回幂等成功 200。 |
| `/api/v1/ucp/webhooks/resources/{resource_code}/challenge` | POST/GET（按供应商） | challenge 请求 | 公网入口 | 严格按资源策略处理；未验证资源拒绝非 challenge 事件。 |
| `/api/v1/ucp/webhooks/feishu/{trigger_code}` | POST | 旧入口 | 公网入口 | 保留兼容期，内部转发至资源入口并记录 `legacy_route=true`；新建触发器不得生成该路径。 |

Webhook 接收流程：

1. 根据 `resource_code` 找到已启用 `WEBHOOK_INGRESS` 资源；执行请求大小、速率、Content-Type 和来源策略校验。
2. 从资源引用的凭证安全读取签名/加密材料；完成供应商 challenge、验签、解密。
3. 根据事件类型路由到资源下启用的 `EVENT_TYPE` 对象和 `UcpEventDefinition`。
4. 使用事件定义 Schema 校验并标准化为 UCP Event Envelope。
5. 以 `(resource_id, dedup_key)` 全局去重，写入 `UcpEvent`、原始请求脱敏摘要和 Trace ID。
6. 匹配 `UcpPipelineTrigger`，为每个命中的触发器创建独立交付记录和 Pipeline Run。
7. 立即返回供应商要求的响应；后续流程执行异步进行。

### 4.3 业务逻辑

#### 4.3.1 组件职责边界（禁止重复建设）

| 组件/概念 | 负责什么 | 明确不负责什么 |
|---|---|---|
| 接入系统 | 供应商身份、系统级凭证绑定、治理与权限边界 | 不保存单个流程的过滤/重试。 |
| 资源 | 可配置接入通道，例如报表 API、表格、Webhook 入口 | 不定义具体流程业务动作。 |
| 资源对象 | 资源下可选择的报表、表、API 对象或事件类型实例 | 不保存流程绑定。 |
| 业务能力 | 流程主动调用的查询/写入/账号动作 | 不接收公网 Webhook。 |
| 事件定义元数据（后端） | 为资源下的事件对象提供可复用的语义、Schema、版本与标准化策略 | 不作为普通用户可单独选择的流程能力，也不持有某个租户的密钥和 URL。 |
| 流程触发器 | 某流程如何启动、订阅哪个资源对象、流程级过滤/幂等/失败策略 | 不保存验签密钥或路径。 |
| 流程画布节点 | 读取、转换、判断、审批、账号操作、写入、通知等步骤编排 | 不承担接入端点或触发器配置。 |

禁止事项：

- 禁止在 `TRANSFORM` 节点填写/模拟 Webhook 地址、验签逻辑或事件订阅。
- 禁止在流程设计器输入明文 Token、App Secret、签名 Secret、飞书 Encrypt Key。
- 禁止一个触发器为同一 Webhook 资源复制独立 `webhook_path`。
- 禁止未验证事件对象触发生产写操作流程。
- 禁止用“事件类型名称字符串”代替资源对象 ID 直接绑定流程，避免来源不可治理。

#### 4.3.2 统一执行上下文

所有 Pipeline Run 统一接收以下上下文，流程节点不得依赖触发方式的私有字段路径：

```json
{
  "trigger": {
    "type": "WEBHOOK",
    "trigger_code": "OFFBOARDING_FROM_BEISEN",
    "trigger_id": 10,
    "occurred_at": "2026-07-24T09:00:00+08:00"
  },
  "event": {
    "event_id": "vendor-event-id",
    "event_code": "HR.EMPLOYEE_TERMINATED",
    "source_system_code": "BEISEN",
    "resource_code": "BEISEN_EMPLOYEE_EVENTS",
    "resource_object_code": "EMPLOYEE_TERMINATED",
    "payload": {},
    "payload_schema_version": "1.0.0"
  },
  "schedule": {
    "window_start": null,
    "window_end": null
  },
  "manual": {
    "parameters": {}
  },
  "trace_id": "..."
}
```

- 定时流程使用 `schedule.window_start/window_end` 和自身读取节点拉取批量数据。
- Webhook/平台事件流程使用 `event.payload`，默认处理单事件。
- 手动流程使用 `manual.parameters`，参数 Schema 由触发器声明。
- 允许流程模板配置输入契约（单事件/批量/手动），保存时校验节点引用是否符合契约。

#### 4.3.3 去重、顺序、重试和死信

1. **接入层全局去重：**同一资源同一 `dedup_key` 只接收并标准化一次；重复投递返回供应商成功语义并记录去重状态。
2. **触发器层交付去重：**同一事件可命中多个触发器；同一触发器只创建一条有效交付记录。
3. **流程层业务幂等：**账号创建/停用等写操作继续使用业务主键和动作幂等键，不能仅依赖 Webhook 去重。
4. **乱序：**事件定义可声明排序键；离职撤销/改期到达时必须按照员工 + 雇佣关系 + 生效时间判断是否允许覆盖，不可因晚到旧事件误停用账号。
5. **重试：**验签/Schema 错误不重试；网络/执行失败按触发器失败策略重试；超过上限进入死信。
6. **重放：**重放默认复用原事件和 Trace 链路；对高风险账号动作需重新通过业务幂等和审批策略。

#### 4.3.4 生命周期流程调整

**离职账号停用模板：**

```text
触发器：Webhook（北森/飞书/已验证来源的“离职生效”事件对象）
  → 时间策略组件（termination_effective_at；未到期则等待/调度）
  → 业务规则/账号映射检查
  → 审批组件（按风险策略可选）
  → 外部账号停用组件（飞书、滴滴、曹操、VPN 等）
  → 回写资产/账号状态
  → 通知组件
```

- 删除首个“解析离职事件” `TRANSFORM` 假起点。
- 若来源 Payload 字段与统一事件 Schema 不同，映射在事件定义元数据的 `normalization_schema` 完成；流程中可保留 `TRANSFORM` 做业务字段派生，但不是接入职责。
- 必须支持三个触发绑定：Webhook 主触发、人工补偿触发、定时补偿扫描；三者进入同一输入契约。

**待入职人员入仓与 Offer 薪酬补充模板：**

```text
触发器：SCHEDULE（Cron + 时区 + 批量窗口）
  → 北森报表读取（资源 → 待入职人员报表对象）
  → 飞书 Offer 业务能力查询
  → Offer 字段映射/补全
  → 数据仓库资产写入
```

- 不改为 Webhook；定时是其主业务模式。
- 允许未来新增 Webhook 触发绑定，但需明确事件输入如何转换为单员工补偿处理，不能直接复用批量读取路径。

### 4.4 前端与 UI/交互

#### 4.4.1 接入系统与资源对象页

**页面：**`/ucp/systems`，现有 `SystemsTabView` / 系统详情抽屉。

资源列表新增“资源类型”标签：

- 报表数据
- 表格数据
- API 数据
- Webhook 事件接入

创建/编辑 Webhook 资源表单分区：

1. **基础信息**：资源编码、名称、所属系统、描述、负责人、启停状态。
2. **接入策略**：适配器/供应商策略（只选已注册类型）、请求方法、最大请求体、限流档位。
3. **安全与凭证**：凭证引用、签名 Header 名、验签策略；只显示“已配置/未配置”和脱敏摘要，禁止明文输入/回显 secret。
4. **验证与订阅**：挑战校验按钮、发送样例校验按钮、验证状态、最近验证时间、错误摘要。
5. **事件对象**：进入对象列表或内嵌 Tab。

资源对象列表统一标题为“资源对象”，按资源类型调整副标题：

| 资源类型 | 对象列表标题 | 新建对象字段 |
|---|---|---|
| 报表资源 | 报表对象 | 编码、名称、Report ID、字段映射、启用状态。 |
| 表格资源 | 表对象 | 编码、名称、表 ID、字段映射、启用状态。 |
| Webhook 资源 | 事件对象 | 事件定义、事件对象编码/名称、Schema 版本、订阅状态、启用状态、验证按钮。 |

Webhook 事件对象弹窗字段：

- 事件定义（必选，按系统类型过滤，仅展示已发布定义；该选择仅关联后端 Schema/版本元数据）；
- 对象编码（默认带入事件定义代码后缀，可编辑但需唯一）；
- 展示名称；
- 事件 Schema 版本（只读或选择兼容版本）；
- 资源对象级路径后缀（仅供应商策略允许时显示，受格式约束）；
- 订阅过滤/路由选项（可选，禁止填写 secret）；
- 启用状态；
- 验证结果与最近验证时间（只读）。

状态、空态与错误态：

- 无 Webhook 资源：展示说明“先创建已验证的 Webhook 事件接入资源”，按钮跳转新建资源。
- 资源未验证：事件对象可保存草稿，但“启用”和“绑定流程”禁用，显示原因和验证按钮。
- 已被触发器引用：删除按钮显示影响数量，确认弹窗列出触发器和流程。
- 加载中使用骨架/表格 loading；网络错误展示重试按钮；无权限展示只读状态和权限说明。

#### 4.4.2 触发规则页

**页面：**`/ucp/events/triggers`，改名为“流程触发器”；保留旧路由兼容。

列表列：

```text
触发器编码 | 名称 | 触发方式 | 来源系统 | 资源 | 资源对象/事件 | 目标流程 | 状态 | 最近运行 | 操作
```

- `WEBHOOK` 行显示“系统 → 资源 → 事件对象”级联信息，不展示 Webhook Path 或密钥。
- `SCHEDULE` 行显示 Cron 与时区摘要。
- `MANUAL` 行显示“人工触发”。
- `PLATFORM_EVENT` 行显示内部事件对象。
- 操作：查看、编辑、启停、试运行、复制、删除；编辑中的“来源资源”不可用时必须先迁移/修复。

新建/编辑采用分步抽屉或单页步骤条：

1. **选择目标流程**：选择已保存模板，展示版本、输入契约、风险等级；不再只选择旧 `pipeline_code`。
2. **选择触发方式**：手动 / 定时 / Webhook / 平台事件。
3. **配置来源**：
   - Webhook：系统 → 已验证 Webhook 资源 → 已启用事件对象；
   - 定时：Cron、时区、错过执行策略、批量窗口；
   - 手动：参数 Schema / 默认值；
   - 平台事件：系统 → 内部事件资源 → 对象。
4. **运行与安全策略**：过滤规则构建器、幂等键（提供安全字段选择器，禁止自由脚本）、失败策略、运行身份、启用状态。
5. **验证与保存**：显示来源校验、输入 Schema 对齐、冲突检查、影响提示；保存前可“试运行（dry-run）”。

禁止交互：

- 触发器页面不可填写 URL、签名密钥、飞书 verification token、encrypt key。
- 不允许未验证资源对象或无发布事件定义时保存为已启用。
- 不允许将 Webhook 触发器绑定到没有单事件输入契约的批处理模板，除非该模板明确声明兼容的单事件补偿分支。

#### 4.4.3 流程设计器

**页面：**`/ucp/pipelines/designer`。

改造要求：

1. 顶部增加“触发器”摘要区域：显示已绑定触发器卡片（类型、来源、状态、最近运行），提供“管理触发器”入口。
2. 画布左侧节点库不新增 `WEBHOOK` 节点；现有 `TRANSFORM` 标注为“字段转换”，不得作为事件入口的推荐用法。
3. 画布中增加只读“开始”标识或顶部输入契约摘要：
   - Webhook：`事件输入：{事件对象名称}`；
   - 定时：`批量窗口输入：Cron/Timezone`；
   - 手动：`人工参数输入`。
4. 保存模板时不要求至少一个触发器，允许先设计后绑定；但点击“启用触发器”前必须校验图、输入契约和资源状态。
5. 创建“离职账号停用”模板时，不再自动放置“解析离职事件” Transform；可放置“时间策略”“审批”“账号操作”“通知”等业务组件。
6. 试运行弹窗根据触发器类型生成样例输入：Webhook 选择已脱敏事件样例；定时填写时间窗口；手动填写参数。真实外部写操作仍遵循受控写入/审批/干跑策略。

#### 4.4.4 事件中心与运行中心

**页面：**`/ucp/events`、`/ucp/events/:eventId`、`/ucp/runs/:id`。

- 事件详情新增“来源资源”“来源事件对象”“事件定义/Schema 版本”“资源配置版本”“验签/去重状态”。
- 事件详情新增“命中流程触发器”区块，可跳转流程模板、触发器详情和运行详情。
- 运行详情顶部显示触发方式、触发器名称、事件 ID/时间窗口、来源资源对象及模板版本。
- 所有敏感 Payload 和外部响应字段沿用脱敏策略；点击查看原始内容需额外权限并记录审计。

### 4.5 权限、安全与外部系统

#### 权限

| 操作 | 权限要求 |
|---|---|
| 查看系统、资源、资源对象 | `ucp.systems.V` |
| 创建/编辑 Webhook 资源、事件对象、验证资源 | `ucp.systems.C/U` |
| 删除资源/对象 | `ucp.systems.D`，并执行影响分析 |
| 查看事件定义 | `ucp.events.V` |
| 创建/发布自定义事件定义 | 高级系统管理权限；不得赋予普通流程管理员 |
| 查看触发器 | `ucp.events.V` + 目标流程 `ucp.pipelines.V` |
| 创建/编辑/启停触发器 | `ucp.events.C/U` + 目标流程编辑权限 |
| 删除触发器 | `ucp.events.D` |
| 手动触发流程 | 现有流程触发权限 + 流程 owner/管理员规则 |
| 查看原始敏感事件 | 独立敏感审计权限；默认仅脱敏摘要 |

#### 安全边界

1. **凭证隔离：**签名密钥、飞书 Token、Encrypt Key 等仅存入凭证安全存储；数据库 JSON、API Response、前端状态、日志和导出中禁止明文出现。
2. **Webhook 防护：**HTTPS、Body 限制、Content-Type 校验、速率限制、签名/时间戳校验、重放窗口、请求 ID 去重、来源策略和安全审计必须在资源接入层完成。
3. **Schema 与表达式安全：**Payload Schema 使用受限 JSON Schema；过滤规则和幂等表达式只能选择已声明字段/受限路径，禁止 `eval`、任意 Python/JS/SQL。
4. **外部系统边界：**资源验证和试运行不得执行真实高风险账号删除/停用；正式写操作仍由业务能力、审批、幂等和运行策略负责。
5. **敏感数据：**员工 ID、手机号、离职原因、薪资、账号标识均按现有敏感性标签脱敏；事件原文采用最小化存储、加密/访问控制和保留期策略。
6. **多租户/系统隔离：**触发器只能引用当前租户可见、已授权的系统/资源/对象/模板；不得跨系统资源伪造来源。

## 5. 原子任务清单

- [ ] X0213 资源对象泛化与数据库兼容迁移
  - 前置任务：X0212 已稳定；确认现有 `ucp_resource_data_object` 的数据量、调用方和外键引用。
  - 功能范围：新增资源对象类型、事件对象字段、事件定义表、事件实例追溯字段、索引和兼容 migration；保持旧报表/表对象、旧 API 和已有流程可用。
  - 代码交付物：Alembic migration；`UcpResourceObject` 领域模型/序列化（物理表一期可复用）；`UcpEventDefinition` 模型；资源对象服务校验与影响分析；旧数据回填脚本和迁移报告。
  - UI 要求：不涉及完整页面开发；API Response 必须返回 `object_type`，供后续 UI 使用。
  - UCP/外部系统要求：资源对象不得保存 secret；旧资源对象默认类型回填可审计，无法识别的记录标记待确认而不是删除。
  - 测试要求：后端 migration upgrade/downgrade、旧对象回填、约束校验、删除引用阻断、序列化兼容；前端不涉及；Docker 数据库迁移验证。
  - 验收标准：旧北森报表和飞书表对象查询、保存、流程引用均正常；可创建 `EVENT_TYPE` 对象并关联已发布事件定义；升级失败可安全回滚且不丢旧数据。
  - 完成定义：开发 + UI + 测试 + 验收全部完成并有证据后才可勾选。

- [ ] X0214 事件定义元数据与标准化契约
  - 前置任务：X0213。
  - 功能范围：新增事件定义元数据、版本管理、Schema 校验、标准化映射和预置飞书/自定义事件定义；该元数据供 Webhook 事件对象引用，不混入业务操作定义，也不新增普通用户可见的额外事件配置层。
  - 代码交付物：事件定义 CRUD/发布服务；Pydantic Request/Response Schema；事件 Schema 校验器；标准化事件 Envelope；预置事件定义 seed；只读目录接口。
  - UI 要求：在资源对象创建弹窗中使用“事件定义”下拉；普通管理员仅可选择已发布定义，且无需理解其为独立能力；高级管理员才可进入受控的定义维护入口。
  - UCP/外部系统要求：事件定义明确供应商支持、版本、敏感字段和验签策略；不得将未验证供应商事件显示为可生产启用。
  - 测试要求：后端 Schema 成功/失败、版本不可破坏性修改、标准化映射、敏感字段标签、权限；前端下拉空态与权限态组件测试；构建。
  - 验收标准：可为飞书账号创建/停用、员工离职生效创建版本化事件定义；定义仅由 Webhook 资源对象引用以获得 Schema/版本治理，且不能直接作为流程节点或触发器来源选择项执行。
  - 完成定义：开发 + UI + 测试 + 验收全部完成并有证据后才可勾选。

- [ ] X0215 Webhook 事件接入资源与资源对象管理
  - 前置任务：X0213、X0214。
  - 功能范围：在接入系统中支持 `WEBHOOK_INGRESS` 资源，完成凭证引用、受控路径、验签/挑战验证、Webhook 事件对象启用与验证；沿用“系统 → 资源 → 对象”交互。
  - 代码交付物：Webhook ingress adapter/验证服务；资源验证 API；资源对象 CRUD API；旧 `/data-objects` 兼容别名；受控路径生成器；接收配置版本审计。
  - UI 要求：`/ucp/systems` 增加 Webhook 资源类型、资源配置分区、事件对象 Tab、验证状态、验证按钮、空态/错误态/影响提示；禁止显示/输入明文 secret。
  - UCP/外部系统要求：飞书 challenge、验签、解密通过资源适配器策略实现；自定义 HMAC Webhook 通过凭证引用实现；每个资源可启用多个事件对象。
  - 测试要求：后端飞书 challenge/HMAC 验签/无效签名/Body 超限/速率限制/资源未验证；前端表单、状态和权限组件测试；E2E 创建资源→创建事件对象→验证；Docker 构建。
  - 验收标准：管理员可在一个“飞书事件接入”资源下启用多个事件对象；路径和密钥不出现在流程/触发器配置；未验证资源对象不能被生产触发器选择。
  - 完成定义：开发 + UI + 测试 + 验收全部完成并有证据后才可勾选。

- [ ] X0216 通用 Pipeline Trigger 模型、接口与事件分发改造
  - 前置任务：X0213、X0214、X0215。
  - 功能范围：将现有事件触发器演进为统一流程触发器，支持 `MANUAL`、`SCHEDULE`、`WEBHOOK`、`PLATFORM_EVENT`；实现事件对象绑定、模板绑定、流程级过滤/幂等/失败策略和异步派发。
  - 代码交付物：触发器模型迁移、Pydantic API、触发器服务、事件总线匹配改造、调度适配、Pipeline Run 上下文注入、交付记录和兼容路由适配器。
  - UI 要求：不涉及完整页面改版；提供可被前端消费的来源摘要、输入契约、验证错误和影响列表。
  - UCP/外部系统要求：公网入口只按资源接收，不能按 trigger code 接收新请求；同一事件可命中多个触发器，但同一触发器不得重复投递。
  - 测试要求：后端四种触发类型、资源/对象匹配、资源未验证阻断、全局去重、触发器交付去重、多触发器、过滤规则、重试/死信、旧路由兼容；前端不涉及；回归现有事件总线和流程运行。
  - 验收标准：待入职流程可由定时触发，离职流程可由 Webhook 触发；两类运行均获得统一执行上下文；旧触发器仍可查询与执行兼容路径。
  - 完成定义：开发 + UI + 测试 + 验收全部完成并有证据后才可勾选。

- [ ] X0217 流程触发器配置 UI 与流程设计器触发器体验
  - 前置任务：X0215、X0216。
  - 功能范围：将 `/ucp/events/triggers` 改造为“流程触发器”，将流程设计器的触发器配置从画布节点中抽离到流程属性；支持按触发类型动态配置。
  - 代码交付物：前端 API 类型、触发器列表/新建编辑抽屉、级联系统-资源-对象选择器、设计器触发器摘要区、试运行输入生成器、权限控制与路由兼容。
  - UI 要求：严格实现 4.4.2、4.4.3 的字段、步骤、禁用条件、加载态、空态、错误态、成功提示与权限态；节点库不得增加 Webhook 节点；旧触发器编辑页应显示迁移提示。
  - UCP/外部系统要求：只展示当前用户可见的已验证资源和已启用事件对象；任何密钥、URL、验签字段不得在该 UI 出现。
  - 测试要求：前端组件测试（四种触发方式、级联、空态、验证失败、无权限、编辑旧触发器）；E2E（资源对象创建后可在触发器选择、保存后设计器摘要更新）；前端 typecheck/build；后端 API 回归。
  - 验收标准：用户可不接触 Webhook 技术细节，完成“目标流程 → Webhook → 系统 → 资源 → 事件对象”的配置；定时流程可配置 Cron；保存后列表、设计器和运行中心信息一致。
  - 完成定义：开发 + UI + 测试 + 验收全部完成并有证据后才可勾选。

- [ ] X0218 事件中心、运行中心与安全审计链路完善
  - 前置任务：X0215、X0216、X0217。
  - 功能范围：事件、触发器、资源对象、模板版本和运行详情串联；补齐验签、去重、Schema、配置版本、重试与死信观测。
  - 代码交付物：事件/运行详情扩展 API；审计字段；来源摘要序列化；跳转链接；敏感 Payload 脱敏策略；重放安全校验。
  - UI 要求：事件详情和运行详情按照 4.4.4 展示来源链路、状态和跳转；支持 loading、空态、错误态、无权限脱敏态。
  - UCP/外部系统要求：原始 Payload 访问必须最小权限、审计可追溯；重放不得绕过审批、账号业务幂等和受控写入。
  - 测试要求：事件到运行全链路、脱敏、权限、重复事件、死信重放、链接正确性；前端详情组件/E2E；构建与回归。
  - 验收标准：运维人员可从任一事件追溯到来源资源对象、触发器、流程模板版本和每一个账号操作；没有权限时不泄露 secret 或敏感明文。
  - 完成定义：开发 + UI + 测试 + 验收全部完成并有证据后才可勾选。

- [ ] X0219 离职账号停用与待入职 Offer 模板迁移
  - 前置任务：X0216、X0217。
  - 功能范围：重构离职账号停用模板为 Webhook/手动/定时补偿触发；移除假起点 Transform；显式声明离职生效时间策略。为待入职 Offer 流程绑定定时触发并保持现有北森→飞书→数仓链路。
  - 代码交付物：模板迁移、触发器 seed/迁移脚本、时间策略组件或受控等待配置、输入契约校验、旧模板版本兼容/回滚说明。
  - UI 要求：模板打开后在顶部显示触发器摘要；离职模板起点不再展示“解析离职事件” Transform；管理员可配置/查看人工补偿与定时补偿触发器。
  - UCP/外部系统要求：离职事件必须携带/映射稳定员工标识和生效时间；未到生效时间不得提前停用；账号映射缺失不得执行猜测性操作。
  - 测试要求：离职立即生效、未来生效等待、撤销/改期、重复投递、人工补偿、定时补偿、账号映射缺失、审批、待入职定时全流程回归；E2E 和 Docker 构建。
  - 验收标准：离职账号停用由真实触发器启动而非 Transform 假节点；待入职 Offer 仍按定时批量入仓；两条流程均可在运行中心完整追踪。
  - 完成定义：开发 + UI + 测试 + 验收全部完成并有证据后才可勾选。

- [ ] X0220 旧触发器兼容、迁移观测与上线验收
  - 前置任务：X0213～X0219。
  - 功能范围：完成旧触发器、旧飞书 Webhook 路由、旧资源对象 API 的兼容期策略、迁移报告、灰度开关、回滚预案和上线验收脚本。
  - 代码交付物：兼容适配器、迁移状态查询 API、功能开关、指标/告警、运维 runbook、数据修复脚本、弃用时间表。
  - UI 要求：旧触发器列表显示“待迁移/已迁移/兼容运行”标签与修复入口；不涉及新业务配置表单。
  - UCP/外部系统要求：兼容路径不得双重触发写操作；必须按事件 ID、触发器和业务幂等键防重；弃用前需验证供应商回调地址切换完成。
  - 测试要求：旧接口兼容、新旧路径同事件防重、灰度开关、回滚、迁移失败、生产样例 dry-run、全量 UCP 回归、前端 build、Docker 健康检查。
  - 验收标准：已迁移租户走新资源入口，未迁移租户可继续稳定运行旧入口；切换和回滚均有审计与明确操作手册；无重复账号操作。
  - 完成定义：开发 + UI + 测试 + 验收全部完成并有证据后才可勾选。

## 6. 测试计划

### 6.1 后端单元与服务测试

- 资源对象：对象类型、事件对象约束、对象删除影响分析、旧对象兼容。
- 事件定义元数据：Schema 版本、发布、破坏性更新阻断、标准化映射、敏感字段标记。
- Webhook 资源：飞书 challenge、HMAC 验签、解密、过期时间戳、缺失 Header、超大 Body、限流、凭证缺失、资源禁用。
- 触发器：四种 trigger type 的参数校验、模板输入契约、资源对象状态阻断、过滤规则、幂等表达式受限解析。
- 事件总线：全局去重、同一事件多触发器、同一触发器去重、资源/对象级匹配、重试、死信、重放。
- 生命周期：离职立即/未来生效、撤销/改期、外部账号映射缺失、审批、受控停用和通知。

### 6.2 API 测试

覆盖每个新增/改造接口的：

- 正常成功路径；
- 参数错误 400/422；
- 系统、资源、对象、事件定义元数据、模板不存在 404；
- 资源对象已被引用、资源未验证、Schema 不兼容 409；
- 无权限 403；
- 空数据列表和无匹配事件；
- 禁用资源/对象/触发器；
- 旧 `/ucp/triggers` 和 `/data-objects` 兼容 Response；
- API Response 不返回 secret 与明文敏感信息。

### 6.3 前端组件与交互测试

- 接入系统：资源类型切换、Webhook 表单、凭证已配置状态、验证成功/失败、事件对象 CRUD、引用阻断弹窗。
- 触发器：手动/定时/Webhook/平台事件切换；系统→资源→对象级联；无资源空态；未验证禁用；过滤规则构建；权限只读；旧触发器迁移提示。
- 设计器：触发器摘要、无 Webhook 节点、定时/事件输入摘要、试运行输入表单、保存后状态更新。
- 详情页：事件→触发器→模板→运行跳转，脱敏/无权限表现。

### 6.4 E2E 验收场景

1. 配置飞书 Webhook 资源 → 验证 → 创建“账号已停用”事件对象 → 创建 Webhook 触发器 → 发送签名合法样例 → 事件中心记录 → Pipeline Run 创建 → 运行详情可追溯。
2. 同一事件重复投递两次 → 仅一个有效交付和账号停用动作，第二次返回幂等成功。
3. 未验证资源对象绑定触发器 → 前端禁用、后端 409。
4. 离职生效时间为未来 → 不停用账号，进入等待/计划状态；到时后仅执行一次。
5. 待入职 Offer 流程定时触发 → 北森读取、飞书查询、字段映射、数仓写入成功；不受 Webhook 改造影响。
6. 无权限用户访问资源/触发器/事件原文 → UI 隐藏或只读，接口 403/脱敏。
7. 旧飞书 Webhook 路径投递 → 兼容路由正常接收且不与新路径重复执行。

### 6.5 构建与回归

- 后端定向 pytest + 全量 UCP 相关测试。
- 前端 `vue-tsc --noEmit` 与生产构建。
- Docker Compose 重建 backend/frontend，数据库 migration upgrade/downgrade 演练。
- 回归：资源管理、北森报表对象、飞书多维表格对象、标准 SaaS 业务能力卡片、流程模板、运行中心、事件中心、死信重放、数据仓库 UCP 桥接。

## 7. 验收标准

### 用户验收

- 管理员能以“系统 → 资源 → 对象”理解并配置 Webhook，事件对象和报表对象使用同一对象管理框架。
- 流程管理员能根据业务选择定时、Webhook、人工或平台事件作为起点，不需要在画布中配置接入技术细节。
- 离职账号停用流程不再以 Transform 作为伪起点；待入职 Offer 流程继续以定时批处理运行。

### 开发验收

- Webhook 接收资源、事件对象、事件定义元数据、流程触发器职责分离，代码中无新的 Trigger 直接存储明文 secret 或路径。
- 业务能力保持流程内部主动调用组件；事件定义元数据仅作为 Webhook 资源事件对象的后端复用契约，并可在标准包/目录中治理。
- 所有管理 API 使用明确 Schema、权限校验、状态码和兼容策略。
- 新旧路径不会引发重复 Pipeline Run 或重复账号操作。

### 测试验收

- 第 6 节列出的单元、API、组件、E2E、构建和回归测试均有执行记录。
- 覆盖成功、异常、资源不存在、未验证、权限不足、空数据、边界值、旧数据兼容、重复/乱序事件。
- migration upgrade/downgrade 在测试数据库验证通过。

### UI/交互验收

- `/ucp/systems`、`/ucp/events/triggers`、`/ucp/pipelines/designer`、事件详情、运行详情的状态、空态、错误态、权限态完整。
- 触发器 UI 中不显示 Webhook Path/secret；资源 UI 中也不回显 secret。
- Webhook 不出现在右侧流程节点库；触发方式仅作为流程属性/触发器绑定出现。
- 所有下拉字段只展示当前用户有权限且已验证/已发布的对象。

### 上线验收

- 已迁移配置可通过新资源入口稳定接收事件；未迁移旧配置在兼容期开关下稳定运行。
- 生产环境 HTTPS、回调域名、凭证、签名、速率限制、告警和死信重放流程均已演练。
- 业务、IT、安全共同确认离职生效时间、账号停用时机、审批策略和保留期。

## 8. 风险与兼容性

| 风险 | 等级 | 影响 | 应对方案 |
|---|---|---|---|
| 将 Webhook 路径/密钥从 Trigger 移至资源导致旧回调中断 | 高 | 外部事件无法接收或重复触发 | 保留旧路径兼容适配器、资源迁移状态、灰度开关、回调切换清单和回滚方案。 |
| 旧 Trigger 与新 Trigger 同时命中 | 高 | 重复账号创建/停用 | 接入层事件去重 + 触发器交付去重 + 账号业务幂等；兼容期开启双路径防重监控。 |
| 供应商不支持目标事件或未授予权限 | 高 | UI 可配但永远收不到事件 | 事件定义元数据标明支持状态；资源对象必须验证成功后才可启用/绑定。 |
| 凭证/签名信息迁移不安全 | 高 | Secret 泄露或验签失败 | 仅迁移到凭证库引用；无法安全迁移时标记待人工重配，禁止复制到 JSON/日志。 |
| 泛化资源对象破坏既有报表配置 | 高 | 北森、飞书表格、数据仓库流程回归 | 保留物理表/旧 API；默认对象类型回填；分阶段启用；全量资源回归测试。 |
| 多触发器与模板输入契约不匹配 | 中 | 运行时字段缺失 | 模板声明输入模式，保存/启用触发器前静态校验；试运行样例校验。 |
| 乱序离职/撤销事件造成提前或错误停用 | 高 | 账号可用性与安全事故 | 时间策略组件、排序键、员工+雇佣关系版本控制、人工待处理和审计。 |
| Webhook Payload 含 PII 或敏感信息 | 高 | 数据泄露 | 字段敏感性定义、脱敏、最小化存储、访问审计、保留期、权限隔离。 |
| 自定义表达式带来执行/SQL 注入 | 高 | 安全风险 | 仅支持受限字段路径和固定运算符；禁止 eval、脚本和动态 SQL。 |
| 011 原子任务台账缺失 | 中 | 后续开发编号、状态与依赖不一致 | 开工前将 X0213～X0220 同步到统一台账，并补齐启动协议与任务状态。 |

## 9. 交付说明模板

```markdown
## 本次交付：X0213 / X0214 / ...

### 完成任务
- [x] Xxxxx 任务名称
- [ ] Xxxxx 未完成任务名称（说明原因和依赖）

### 修改文件
- `backend/alembic/versions/xxxx_*.py`：说明 migration 内容。
- `backend/app/ucp/...`：说明模型、服务、路由或事件总线改动。
- `frontend/src/views/ucp/...`：说明页面和交互改动。
- `frontend/src/api/ucp.ts`：说明 API 类型与调用改动。
- `specs/011-universal-connector-platform/...`：说明规格/任务台账更新。

### 测试命令与结果
- 后端：`docker compose ... exec -T backend pytest -q ...`
  - 结果：`xx passed`。
- 前端：`npm --prefix frontend run build`
  - 结果：通过 / 失败（附原因）。
- Migration：`alembic upgrade head`、`alembic downgrade ...`
  - 结果：通过 / 失败（附原因）。
- E2E / 手工：列出系统、资源、对象、触发器、事件、运行详情的验证结果。

### UI 验证
- 页面路径：
- 已验证状态：加载、空态、错误态、权限态、成功态。
- 截图/录屏/测试账号证据：

### 未完成项
- 未完成任务编号：
- 原因：
- 阻塞条件：

### 风险与后续建议
- 兼容路径状态：
- 外部系统权限/订阅状态：
- 是否建议进入下一原子任务：是/否；原因：
```