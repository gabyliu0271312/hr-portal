# UCP 配置化 Webhook 入仓能力（成本分摊锁定事件首个实例）

## 1. 背景与目标

- **背景：** HR Portal 的数据仓库已有 `emp_monthly_allocation`（员工月度成本分摊表），目前依赖手工上传。成本分摊系统在月度周期锁定后拥有正式分摊快照。HR Portal 同时已有与数据仓库并列的数据连接平台 UCP，已经具备系统、资源、凭证、Webhook、事件、流水线、重试、死信和监控的基础能力。
- **目标：** 在 UCP 中建设可配置的外部 Webhook 入站和“按期间全量快照入仓”能力；管理员通过前端配置即可将外部锁定事件写入已发布数据资产。本期以成本分摊系统推送 `allocation_period.locked` 到 `emp_monthly_allocation` 为首个实例。
- **非目标 / 不做范围：**
  - 不新建成本分摊专用 HTTP 接收接口；统一使用 UCP 资源入口。
  - 不允许前端配置任意 SQL、Python、JS 或任意物理表名。
  - 不允许管理员通过流水线覆盖资产的业务主键定义。
  - 不改变成本分摊系统的审核、锁定、解锁业务规则。
  - 本期不实现 UCP 向上游的专用回调；通过受控批次状态查询获得最终结果。

### 假设与待确认事项

1. 生产 `emp_monthly_allocation` 主键已确认是 `cost_period + employee_no + code`，开发前须再次以生产字段元数据核查。
2. `employee_no` 应保持字符串语义；若物理列仍为数值类型且可能出现前导零/字母工号，须在上线前完成类型迁移。
3. 上游每位员工当月分摊比例合计必须为 100%；如存在例外，必须由业务提供明确例外规则后再配置。
4. UCP 管理员、数据仓库管理员与成本系统服务身份的权限点名称需在开发时与既有 RBAC 菜单/操作码对齐。

## 2. 用户场景

| 角色 | 入口与操作 | 系统反馈 | 成功结果 | 失败/空态/无权限表现 |
|---|---|---|---|---|
| UCP 管理员 | 数据连接平台 → 系统/资源，创建“成本分摊系统”及 `webhook_ingress` 资源 | 展示唯一接收 URL、资源状态、签名方式、凭证掩码 | 可启用接收资源 | 无 `ucp.resources.C/U` 权限时按钮不可见或接口 403；未配置凭证无法验证资源 |
| UCP 管理员 | 数据连接平台 → 事件/流水线，配置事件、字段映射、校验和资产写入步骤 | 配置校验与试运行结果 | 发布可用流水线 | 目标资产未发布、字段不存在、期间策略不匹配时禁止保存/发布 |
| 成本系统服务 | 周期锁定后 POST UCP Webhook | 同步收到 `RECEIVED` 或去重响应 | 事件进入 UCP Event Bus | 签名错误 401、时间戳过期 403、包体超限 413、限流 429、结构错误 400 |
| UCP 运维人员 | 数据连接平台 → 接收记录/事件/流水线/死信 | 查看 `RECEIVED/PROCESSING/SUCCEEDED/FAILED/DEAD_LETTER` | 能定位批次、期间、行数、trace ID | 无监控权限仅能看脱敏摘要；无原始密钥或完整敏感 payload |
| 成本管理员 | 成本系统周期详情 → 推送状态 | 查看已接收和最终入仓状态 | UCP `SUCCEEDED` 后显示已入仓 | UCP 失败时显示摘要并允许重推冻结批次；UCP 不可用不影响锁定 |

## 3. 功能范围

| 功能项 | 是否本期实现 | 说明 |
|---|---:|---|
| UCP Webhook 入站资源类型 | 是 | 正式支持 `webhook_ingress` 配置、启停、凭证引用、URL 展示 |
| 时间戳 HMAC 签名 | 是 | 新增通用 `HMAC_SHA256_TIMESTAMPED` 策略 |
| 事件 ID / 批次 ID 路径配置 | 是 | 资源配置提取 `request_id`、`batch_id`、`event_type` |
| UCP 接收审计和事件去重 | 是 | 复用已有入口，补足配置化路径提取和批次冲突逻辑 |
| 通用资产入仓批次记录 | 是 | 新增批次表、状态查询、摘要冲突保护 |
| 通用按期间快照入仓 | 是 | 增强 `WAREHOUSE_ASSET_SINK` 支持复合主键及期间孤儿清理 |
| 配置化字段映射与校验 | 是 | 受控转换、必填/范围/复合键/聚合校验 |
| UCP 前端配置与监控 | 是 | 资源配置、流水线配置、批次列表与状态查询 |
| 成本分摊首个配置实例 | 是 | 固化配置，不硬编码业务逻辑 |
| UCP 处理完成回调上游 | 否 | 本期由上游轮询批次查询接口 |
| 任意表/任意脚本写入 | 否 | 仅允许已发布注册资产和字段白名单 |

## 4. 技术设计

### 4.1 数据库 / 数据模型

#### 4.1.1 复用模型

- `UcpResource`：承载外部系统资源、`connector_type`、`protocol`、`credential_id`、启停状态。
- `UcpResourceDataObject`：承载 `EVENT_TYPE` 对象、事件定义、映射配置。
- `UcpEvent` / `UcpEventDelivery`：承载事件、重试、死信和重放。
- `UcpWebhookIngressAttempt`：记录 Webhook 接收、拒绝和去重。
- `RegisteredTable` / `TableColumn`：目标资产、字段白名单、期间字段和业务主键元数据。

#### 4.1.2 新增表：`ucp_warehouse_ingest_batch`

| 字段 | 类型/默认值 | 说明 |
|---|---|---|
| `id` | BigInteger PK | 主键 |
| `resource_id` | FK `ucp_resource.id`，非空 | 入站来源资源 |
| `target_asset` | String(64)，非空 | 已发布注册资产 |
| `event_id` | String(128)，非空 | 上游请求幂等键 |
| `batch_id` | String(128)，非空 | 上游业务批次键 |
| `period_value` | String(64)，可空 | 快照期间，如 `202607` |
| `payload_checksum` | String(64)，非空 | records/载荷摘要 |
| `status` | String(20)，默认 `RECEIVED` | `RECEIVED/PROCESSING/SUCCEEDED/FAILED/DEAD_LETTER` |
| `received_rows` | Integer，默认 0 | 接收行数 |
| `written_rows` | Integer，默认 0 | 实际入仓行数 |
| `pipeline_run_id` | String(64)，可空 | UCP 流水线关联 |
| `trace_id` | String(64)，可空 | 调试追踪标识 |
| `error_summary` | Text，可空 | 脱敏错误摘要 |
| `received_at` | timestamptz，默认 now | 接收时间 |
| `processed_at` | timestamptz，可空 | 终态处理时间 |

索引与约束：

```text
UNIQUE(resource_id, event_id)
UNIQUE(resource_id, target_asset, batch_id)
INDEX(target_asset, period_value, status)
INDEX(resource_id, received_at)
```

#### 4.1.3 Migration 与兼容

- 新增 Alembic migration 创建批次表、索引和唯一约束；必须显式 `upgrade()` / `downgrade()`。
- `downgrade()` 仅删除新增表和索引，不修改既有 UCP 表和业务资产。
- 对既有 `WAREHOUSE_ASSET_SINK` 保持 `append/upsert/replace` 兼容；新增 `asset_metadata_upsert`、`period_full_snapshot`，旧配置不改变行为。
- `period_full_snapshot` 在配置/运行时必须确认资产已注册为期间表，且 `period_field` 是资产合法字段。

### 4.2 后端接口

#### 4.2.1 外部 Webhook 接收（复用并增强）

```http
POST /api/v1/ucp/webhooks/resources/{resource_code}
```

- **权限：** 外部服务身份；不使用用户 JWT。资源必须启用且为 `webhook_ingress`。
- **Path：** `resource_code=cost-allocation-locked` 为本期配置实例。
- **Headers：**

| Header | 必传 | 规则 |
|---|---:|---|
| `Content-Type` | 是 | `application/json` |
| `X-Integration-Id` | 是 | 匹配资源配置来源标识 |
| `X-Request-Id` | 是 | 与 body `request_id` 一致 |
| `X-Timestamp` | 是 | Unix 秒，默认允许偏差 300 秒 |
| `X-Nonce` | 是 | 高熵随机值 |
| `X-Signature` | 是 | `HMAC_SHA256_TIMESTAMPED` 签名 |

- **Request Schema（成本分摊实例）：**

```json
{
  "event_type": "allocation_period.locked",
  "source_system": "cost_allocation_system",
  "request_id": "ca-202607-period-42-v1",
  "batch_id": "ca-period-42-lock-20260729T103000Z",
  "period_id": 42,
  "period": "2026-07",
  "lock_version": 1,
  "record_count": 2,
  "records_checksum": "<sha256>",
  "records": [{"employee_no":"000123","employee_name":"张三","project_code":"PRJ-A001","project_name":"项目A","allocation_percentage":"60.00"}]
}
```

- **Response Schema：**

```json
{"accepted": true, "event_id": "ca-202607-period-42-v1", "trace_id": "...", "status": "RECEIVED"}
```

- **状态码：** `200/202` 已接收或已去重；`400` 请求格式/字段路径错误；`401` 签名或来源标识错误；`403` 资源停用或时间戳过期；`404` 资源/事件对象不可用；`409` 批次摘要冲突；`413` 包体超限；`422` 事件结构校验失败；`429` 限流。

#### 4.2.2 入仓批次状态查询（新增）

```http
GET /api/v1/ucp/warehouse-ingest-batches/{resource_code}/{batch_id}
```

- **权限：** 资源绑定服务身份或拥有 `ucp.monitor.V` 的内部用户。
- **Response Schema：**

```json
{"batch_id":"...","event_id":"...","status":"SUCCEEDED","target_asset":"emp_monthly_allocation","period_value":"202607","received_rows":2,"written_rows":2,"processed_at":"2026-07-29T10:31:04Z","error_summary":null}
```

- **状态码：** `200` 查询成功；`401/403` 无权；`404` 资源或批次不存在。
- **安全：** 不返回签名、凭证、完整 payload 或内部堆栈。

#### 4.2.3 UCP 管理接口

复用既有系统/资源/凭证/事件/流水线管理接口，补充：

- 资源协议配置的 schema 校验；
- `webhook_ingress` 类型的创建、编辑、验证；
- `WAREHOUSE_ASSET_SINK` 新配置 schema；
- 批次列表/详情 API（内部管理权限）。

### 4.3 业务逻辑

#### 4.3.1 Webhook → Event → Pipeline

```text
验资源启用 → 限流/包体 → 验签 → 提取 event_type/request_id/batch_id
→ 校验事件对象 → 检查 event_id 幂等与批次摘要冲突
→ 写接收批次 RECEIVED → 写 UCP Event → 异步派发 Pipeline
→ Pipeline 映射/校验 → period_full_snapshot 入仓
→ 批次更新为 SUCCEEDED/FAILED/DEAD_LETTER
```

#### 4.3.2 `HMAC_SHA256_TIMESTAMPED`

```text
body_hash = SHA256(raw_body)
signing_string = timestamp + "\n" + nonce + "\n" + request_id + "\n" + body_hash
signature = HMAC-SHA256(signing_secret, signing_string)
```

必须用 `hmac.compare_digest`；密钥从 `credential_id` 解密读取；生产环境不得缺失密钥降级验签。

#### 4.3.3 通用入仓步骤

- 从 `TableColumn.is_pk_part` 读取复合业务主键，禁止前端指定/覆盖主键。
- 对成本分摊配置：`cost_period + employee_no + code`。
- `period_full_snapshot` 使用目标期间范围：upsert 当前批次行，并删除该期间不在本批次的行；绝不影响其他期间。
- `records` 为空时失败，禁止清空正式月份。
- 映射、数据校验、目标表写入、批次状态更新在同一数据库事务内；任一步失败必须回滚本次写入。
- 复用/抽取 `_dynamic_upsert()` 的复合 PK 和期间孤儿删除逻辑；不得另写与之冲突的直接 SQL 写表实现。

#### 4.3.4 成本分摊首个配置

| 配置项 | 值 |
|---|---|
| 系统编码 | `COST_ALLOCATION_SYSTEM` |
| 资源编码 | `cost-allocation-locked` |
| 资源类型 | `webhook_ingress` / `INBOUND` |
| 事件 | `allocation_period.locked` |
| 请求幂等路径 | `request_id` |
| 批次路径 | `batch_id` |
| 明细路径 | `records` |
| 目标资产 | `emp_monthly_allocation` |
| 写入策略 | `period_full_snapshot` |
| 期间转换 | `period → cost_period`，`YYYY-MM → YYYYMM` |

映射：`employee_no→employee_no`、`employee_name→employee`、`project_code→code`、`project_name→dimension_value`、`allocation_percentage→headcount(decimal_divide_100)`。

校验：records 非空；行必填/范围；同员工同项目不可重复；按 `cost_period+employee_no` 聚合 `headcount` 必须等于 1，容差 0.0001。

### 4.4 前端与 UI/交互

| 页面/组件 | 改动 | 状态与交互 |
|---|---|---|
| UCP 接入类型管理 | 新增“Webhook 入站事件”资源实现类型 | 选择后展示入站配置表单；非 Webhook 类型不展示 |
| UCP 系统资源详情 | 新增 Webhook 配置区 | 显示接收 URL（可复制）、启用开关、签名策略、包体/限流、事件/请求/批次字段路径；密钥仅显示已配置/掩码 |
| UCP 凭证页 | 支持 signing secret 录入和轮换 | 保存后不回显明文；轮换需确认并记录审计 |
| UCP 流水线编辑器 | 支持 `WAREHOUSE_ASSET_SINK` 新模式 | 选择已发布资产；自动读取可选字段和主键；配置映射、转换、校验；非法配置禁止保存 |
| UCP 资源/事件监控 | 新增入仓批次列表与详情 | 按资源、资产、期间、状态筛选；显示行数、trace ID、错误摘要；支持授权重放 |
| 成本分摊系统 UI | 不属于 HR Portal 本任务 | HR Portal 不开发成本端页面 |

统一状态：加载 skeleton/表格 loading；无数据空态；无权限隐藏动作且 API 403；保存/发布成功 toast；失败 toast 显示脱敏错误；危险操作（停用资源、轮换密钥、重放）必须二次确认。

### 4.5 权限、安全与外部系统

- UCP 管理：沿用/新增 `ucp.resources`、`ucp.events`、`ucp.pipelines`、`ucp.monitor` 的 V/C/U/D 操作权限。
- 外部 Webhook：仅资源服务身份，不接受用户 Cookie/JWT 代替签名。
- 凭证：密钥加密保存；前端不回显；日志不记录 secret、签名、完整人员明细。
- 动态字段：目标表、字段白名单、期间字段和 PK 均由注册元数据控制；禁止用户输入物理表名、SQL 或脚本。
- 外部边界：UCP 负责接入、认证、事件、可靠性；数据仓库负责资产元数据和落库；成本系统负责锁定事实和可靠发送。
- 建议 HTTPS、网关 IP 白名单、最大包体/行数限制、时间同步和密钥轮换双密钥过渡策略。

## 5. 原子任务清单

- [x] H0001 核查并固化目标资产元数据
  - 前置任务：无
  - 功能范围：核对生产 `emp_monthly_allocation` 的期间字段、字段类型、已发布状态和 `cost_period + employee_no + code` 主键；必要时准备字符串工号迁移。
  - 代码交付物：0145 Alembic migration、同步服务复合主键回归测试。
  - UI 要求：不涉及 UI。
  - UCP/外部系统要求：不涉及。
  - 测试要求：`pytest tests/test_sync_service_entity.py -q`（6 passed）；迁移已在 `hr_portal` 执行并核验。
  - 验收标准：`employee_no` 为 text；`cost_period + employee_no + code` 为主键；`dimension_value` 非主键；8 条既有数据无空键/重复键，抽样 `pk_hash` 一致。
  - 完成定义：开发、迁移、回归测试与持久数据库核验已完成。

- [x] H0002 定义 Webhook 入站资源协议 Schema
  - 前置任务：H0001
  - 功能范围：为 `webhook_ingress` 定义后端可校验的 ingress 配置字段、默认值和禁止字段。
  - 代码交付物：`app/ucp/webhook_ingress.py` 协议校验器、connector catalog `webhook_ingress` 类型、资源更新校验接入、单元测试。
  - UI 要求：不涉及 UI（H0010 实现配置界面）。
  - UCP/外部系统要求：支持 verification、header 名称、路径、限流、包体、来源标识配置；禁止在 protocol 保存 secret。
  - 测试要求：`pytest tests/test_webhook_ingress.py tests/test_connector_catalog.py -q`（12 passed）；覆盖合法配置、未知策略、非法 Header/路径/整数、secret 拒绝。
  - 验收标准：仅合法 `webhook_ingress` 配置可通过校验；旧资源行为不变。
  - 完成定义：开发、协议测试与 catalog 回归已完成。

- [x] H0003 实现时间戳 HMAC 验签策略
  - 前置任务：H0002
  - 功能范围：新增 `HMAC_SHA256_TIMESTAMPED`，校验 timestamp、nonce、request_id、raw body hash 和签名。
  - 代码交付物：`app/ucp/webhook_ingress.py` 验签函数、Webhook 路由策略接入、凭证读取复用、错误码、单元测试。
  - UI 要求：不涉及 UI。
  - UCP/外部系统要求：签名原文为 `timestamp + LF + nonce + LF + request_id + LF + SHA256(raw_body)`；生产环境缺密钥必须拒绝。
  - 测试要求：`pytest tests/test_webhook_ingress.py tests/test_connector_catalog.py -q`（19 passed）；覆盖正确签名、错误签名、缺头、请求号不一致、非法/过期时间、密钥缺失。
  - 验收标准：仅合法签名请求可进入事件处理，错误不泄露期望签名或密钥。
  - 完成定义：开发、路由接入和自动化测试已完成。

- [x] H0004 扩展 Webhook 字段路径提取与请求幂等
  - 前置任务：H0002、H0003
  - 功能范围：按资源配置提取 event type、event ID、payload 路径；将 `request_id` 映射为 UCP event ID。
  - 代码交付物：受限点分隔 JSON 路径提取器、Webhook 路由改造、事件创建适配、测试。
  - UI 要求：不涉及 UI（H0010 实现路径配置界面）。
  - UCP/外部系统要求：成本实例可配置 `event_type/request_id/batch_id/records` 路径；相同 `request_id` 复用既有 Event Bus 去重。
  - 测试要求：`pytest tests/test_webhook_ingress.py tests/test_webhook_platform.py -q`（23 passed，1 个第三方 PendingDeprecationWarning）；覆盖嵌套路径、缺失路径、空路径、既有外部 event ID 去重。
  - 验收标准：同 request_id 仅生成一个事件并返回可识别去重响应；无效 event type/payload 路径被拒绝。
  - 完成定义：开发、Webhook 路由适配和自动化测试已完成。

- [x] H0005 新增通用入仓批次模型与迁移
  - 前置任务：H0004
  - 功能范围：创建 `ucp_warehouse_ingest_batch`、唯一约束、索引、状态模型与 repository/service。
  - 代码交付物：`UcpWarehouseIngestBatch` ORM、0146 Alembic migration（含 downgrade）、批次服务、单元测试。
  - UI 要求：不涉及 UI（H0012 展示批次）。
  - UCP/外部系统要求：实现 event 幂等、batch+asset 摘要冲突拒绝、失败状态可追踪。
  - 测试要求：`pytest tests/test_warehouse_ingest_service.py -q`（4 passed）；0146 已在持久 `hr_portal` 执行，表字段、双唯一约束与索引已核验。
  - 验收标准：不会对同批次不同内容静默覆盖；批次状态可完整追踪。
  - 完成定义：开发、持久迁移、数据库结构核验和单元测试已完成。

- [x] H0006 增强资产写入器支持复合主键与按期间快照
  - 前置任务：H0001、H0005
  - 功能范围：增强 `WAREHOUSE_ASSET_SINK` / `WarehouseAssetSink`，支持 `period_full_snapshot`，读取资产元数据主键，复用动态 upsert 语义。
  - 代码交付物：`WarehouseAssetSink` 复合主键哈希与期间快照实现、pipeline step `period_field` 透传、回归测试。
  - UI 要求：不涉及 UI（H0011 配置界面）。
  - UCP/外部系统要求：仅允许已发布资产和字段白名单；禁止任意表、单键替代复合键。
  - 测试要求：`pytest tests/test_warehouse_asset_sink.py tests/test_x0210_execution.py -q`（11 passed）；全量已实现回归集 39 passed，1 个第三方 PendingDeprecationWarning。
  - 验收标准：按 `cost_period+employee_no+code` 写入且仅替换目标月；空批次和跨期批次均拒绝。
  - 完成定义：代码、回归测试和 0146 批次迁移均已完成；后续 H0008 集成测试验证真实 UCP Pipeline 写入。

- [x] H0007 实现配置化映射、转换和校验执行器
  - 前置任务：H0006
  - 功能范围：实现受控字段映射、`yyyy_mm_to_yyyymm`、`decimal_divide_100`、必填/范围/重复/`group_sum_equals` 校验。
  - 代码交付物：`warehouse_ingest_transform.py` 映射/验证器、`WAREHOUSE_ASSET_SINK` mapping 接入、结构化错误、单元测试。
  - UI 要求：不涉及 UI（H0011 实现配置编辑器）。
  - UCP/外部系统要求：不支持自由 SQL/脚本；错误可由上层截断展示。
  - 测试要求：`pytest tests/test_warehouse_ingest_transform.py tests/test_warehouse_asset_sink.py tests/test_x0210_execution.py -q`（17 passed）；覆盖年月、Decimal、前导零、必填、范围、70%+20% 聚合失败。
  - 验收标准：不合法批次整体失败且目标月旧数据保持不变。
  - 完成定义：受控转换、校验和 pipeline step 接入已完成，单元/回归测试通过。

- [x] H0008 串联 UCP Pipeline 与批次终态
  - 前置任务：H0005、H0006、H0007
  - 功能范围：Pipeline 启动时更新 `PROCESSING`，入仓成功更新 `SUCCEEDED`，失败/死信同步批次状态、行数、trace ID、错误摘要。
  - 代码交付物：pipeline engine 改造、状态同步服务、事件/资产变化发布、集成测试。
  - UI 要求：不涉及 UI。
  - UCP/外部系统要求：Webhook `RECEIVED` 与最终 `SUCCEEDED` 必须分离。
  - 测试要求：成功、可重试失败、不可重试校验失败、死信、人工重放、资产变化事件。
  - 验收标准：任意批次状态可从 Webhook 接收追踪到最终入仓/死信。
  - 完成定义：批次 `RECEIVED→PROCESSING→SUCCEEDED/FAILED/DEAD_LETTER`、成功、可重试基础设施失败、不可重试聚合校验死信、资产事件及死信重放恢复均有集成测试。已通过 `pytest tests/test_warehouse_ingest_event_delivery.py tests/test_ucp_event_security.py -q`（7 passed，1 个第三方 PendingDeprecationWarning）。

- [x] H0009 增加批次状态查询接口
  - 前置任务：H0005、H0008
  - 功能范围：提供受控的 resource+batch 查询接口及内部批次列表 API。
  - 代码交付物：router、Schema、权限依赖、测试。
  - UI 要求：不涉及 UI。
  - UCP/外部系统要求：成本系统可查最终状态；不得返回密钥和完整 payload。
  - 测试要求：成功查询、资源不存在、批次不存在、服务身份无权、内部管理员查询、脱敏。
  - 验收标准：上游可可靠区分 `RECEIVED/PROCESSING/SUCCEEDED/FAILED/DEAD_LETTER`。
  - 完成定义：已提供受控状态查询与内部列表 API。内部用户必须具有 `ucp.monitor.V`；资源服务身份以绑定凭证中的 `status_query_token` 通过 `X-Integration-Status-Token` 验证，使用常量时间比较。响应不包含完整 payload、签名或密钥。回归：`pytest tests/test_warehouse_ingest_routes.py tests/test_warehouse_ingest_service.py tests/test_warehouse_ingest_event_delivery.py tests/test_pipeline_template_router.py -q` → 18 passed，1 个第三方 PendingDeprecationWarning。

- [ ] H0010 完成 UCP Webhook 资源配置 UI
  - 前置任务：H0002、H0003、H0004
  - 功能范围：资源类型选择、入站配置表单、接收 URL 复制、凭证引用、启停与验证。
  - 代码交付物：前端表单/类型/API 调用、后端 DTO 对齐、组件测试。
  - UI 要求：字段分组为“基础信息/接收地址/安全认证/流量限制/事件提取”；secret 仅显示配置状态；危险动作二次确认。
  - UCP/外部系统要求：URL 根据 resource_code 生成，不可手填；签名策略改变时显示影响提示。
  - 测试要求：前端校验、保存失败、无权限、复制 URL、启停、窄屏布局；后端 E2E。
  - 验收标准：管理员无需改代码即可创建和维护 Webhook 资源。
  - 完成定义：开发 + UI + 测试 + 验收全部完成并有证据后才可勾选。

- [ ] H0011 完成流水线入仓配置 UI
  - 前置任务：H0006、H0007
  - 功能范围：为 `WAREHOUSE_ASSET_SINK` 提供资产选择、字段映射、转换、校验和期间快照配置。
  - 代码交付物：编辑器组件、前端校验、配置预览、组件/E2E 测试。
  - UI 要求：资产选择后自动显示字段/主键只读标签；映射行可增删排序；校验规则表单化；发布前展示摘要和风险提示。
  - UCP/外部系统要求：只能选已发布资产；主键不可编辑；禁止输入脚本/SQL。
  - 测试要求：字段不匹配、重复目标字段、未配置期间、非期间资产选快照策略、旧流水线兼容。
  - 验收标准：管理员可配置成本分摊实例所需映射和校验，非法配置不能发布。
  - 完成定义：开发 + UI + 测试 + 验收全部完成并有证据后才可勾选。

- [ ] H0012 完成批次监控、失败重放 UI
  - 前置任务：H0008、H0009
  - 功能范围：展示接收尝试、事件、流水线、入仓批次和死信；提供授权重放。
  - 代码交付物：列表/详情页面、筛选 API 对接、重放操作、前端测试。
  - UI 要求：可按资源/资产/期间/状态筛选；显示行数、错误摘要、trace ID；重放前确认；空态和无权限态明确。
  - UCP/外部系统要求：仅重放原事件，不能编辑 payload；不显示 secret。
  - 测试要求：成功/失败/死信展示、筛选、分页、重放成功与失败、权限回归。
  - 验收标准：运维人员可独立定位失败并按权限重放。
  - 完成定义：开发 + UI + 测试 + 验收全部完成并有证据后才可勾选。

- [ ] H0013 创建成本分摊系统 UCP 配置实例并联调
  - 前置任务：H0003 至 H0012
  - 功能范围：创建系统、凭证、资源、事件定义、事件对象、触发器、流水线和目标资产配置。
  - 代码交付物：受控 seed/配置导入文件、联调记录、可回滚的停用步骤。
  - UI 要求：配置完成后资源页显示 URL、最近接收和批次状态；不涉及新业务页面。
  - UCP/外部系统要求：资源 `cost-allocation-locked`、事件 `allocation_period.locked`、目标 `emp_monthly_allocation`。
  - 测试要求：真实签名联调；员工 60/40 和 100% 数据；重复 request；批次冲突；非法比例；状态查询。
  - 验收标准：Webhook 接收、最终入仓、状态查询、重试/死信链路均通过。
  - 完成定义：开发 + UI + 测试 + 验收全部完成并有证据后才可勾选。

## 6. 测试计划

| 范围 | 覆盖项 |
|---|---|
| 单元测试 | 签名、时间戳、路径提取、摘要、映射、Decimal、聚合校验、状态机、复合 PK |
| API 测试 | 正确请求、缺 Header、错签名、过期时间、资源不存在、停用资源、限流、超包体、重复/冲突批次、状态查询权限 |
| 数据库测试 | migration upgrade/downgrade、唯一约束、事务回滚、跨期间隔离、兼容旧写入策略 |
| Pipeline 集成测试 | `RECEIVED→PROCESSING→SUCCEEDED`、失败重试、死信、重放、资产事件 |
| 前端测试 | Webhook 配置、凭证掩码、映射表单、非法配置、批次筛选/重放、无权限和空态 |
| E2E | 成本系统模拟请求：60/40 + 100%；重复请求；70/20 失败；查询最终状态 |
| 回归测试 | 既有 UCP 拉取/推送资源、旧流水线、现有 WarehouseAssetSink append/upsert/replace、数据仓库同步 |
| 构建 | backend 测试/迁移检查；frontend typecheck/build |

## 7. 验收标准

- **用户：** 管理员可通过 UCP 前端配置新的 Webhook 入站资源和入仓流水线；成本分摊锁定数据无需人工上传即可进入目标资产。
- **开发：** 外部入口统一为 UCP Resource Webhook；写入复用资产元数据和动态入仓语义；没有成本分摊专用写表分支。
- **测试：** 所有签名、幂等、批次冲突、比例校验、事务回滚、跨月隔离、重试和死信用例有自动化证据。
- **UI/交互：** 表单字段、必填、禁用、加载、空态、错误态、权限态和危险动作确认完整；密钥不回显。
- **上线：** 可通过停用 UCP 资源快速止损；原手工上传链路在切换期保持可用；具备监控、批次查询和回滚预案。

## 8. 风险与兼容性

| 风险 | 等级 | 影响 | 应对方案 |
|---|---|---|---|
| 生产主键与历史配置不一致 | 高 | 数据覆盖或重复 | H0001 先核查；以生产元数据为唯一事实；上线前备份和演练 |
| 现有 AssetSink 仅单键 | 高 | 不能正确处理分摊明细 | H0006 复用动态 upsert 复合键语义，禁止临时单键替代 |
| Webhook 200 被误认为入仓成功 | 高 | 源端错误关闭任务 | 两阶段状态；H0009 提供最终批次查询 |
| 外部重试导致重复 | 高 | 数据重复/重复流水线 | request_id 事件幂等 + batch 摘要冲突保护 |
| 同批次不同内容 | 高 | 正式口径被静默篡改 | 唯一约束 + checksum 冲突 409 |
| 分摊比例错误 | 高 | 成本计算失真 | group_sum_equals；整批事务回滚 |
| 密钥泄露或重放 | 高 | 未授权写入 | timestamp HMAC、凭证加密、日志脱敏、IP 白名单、密钥轮换 |
| UCP 资源/流水线复杂度上升 | 中 | 管理误配 | 前端受控 schema、发布校验、试运行、配置版本和权限 |
| 旧 UCP/仓库功能回归 | 中 | 已有接入失败 | 新策略默认关闭；旧模式回归测试；migration 可 downgrade |

## 9. 交付说明模板

```markdown
## 交付说明

### 完成任务
- [ ] H0001 ...

### 修改文件
- 后端：
- 前端：
- 迁移：
- 配置/文档：

### 测试命令与结果
- 后端：`...` → 结果：
- 前端：`...` → 结果：
- Migration：`...` → 结果：
- E2E/联调：`...` → 结果：

### UI 验证
- 页面：
- 已验证状态：加载 / 空态 / 错误 / 无权限 / 成功：

### 未完成项
- 无 / 说明原因、影响、计划：

### 风险与后续建议
- 风险：
- 建议：
```

## 10. 与 017 统一数据映射组件的关系\n\n- H0011 的映射配置 UI 最终嵌入统一 `MappingWorkspace`，不建设成本分摊专用的长期映射编辑器。\n- H0007 已实现的 `mapping/transform/validation` 是 Sink legacy adapter 的基线；017 只统一编辑、校验、预览和映射执行契约，不改变现有事件 payload。\n- `target_asset`、复合主键、期间全量快照、孤儿清理、字段白名单、批次状态、事务、聚合校验、死信和重放仍由本合同及 `WarehouseAssetSink` 负责。\n- 公共 MappingExecutor 不得绕过已发布资产、主键、期间或批次幂等约束。\n- 相关规则和 Workspace 设计见 `specs/017-mapping-component-reference-governance/spec.md`；现状评审和修订决策见 `specs/017-mapping-component-reference-governance/code-status-review-and-revision-decision.md`。\n\n## 11. 后续联调入口（2026-07-30）

- Webhook 锁定事件接收：`POST /api/v1/ucp/webhooks/resources/cost-allocation-locked`
- 入仓批次最终状态查询：`GET /api/v1/ucp/warehouse-ingest-batches/cost-allocation-locked/{batch_id}`
