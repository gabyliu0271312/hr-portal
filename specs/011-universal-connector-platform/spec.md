# 通用连接器平台（UCP）开发规格说明书

版本：v1.0  
日期：2026-07-02  
状态：开发规格草案（基于 V11.0 需求评审优化）  
适用范围：HR Portal 外部系统数据接入、数据分发、定时同步、事件触发、流水线编排、执行通知与审计

---

## 1. 文档目标

本文档用于将《通用连接器平台（UCP）完整 Spec 设计文档 V11.0》整理为可开发、可拆解、可验收的工程规格。

本文档坚持两个原则：

1. **完整保留目标蓝图**：UCP 的最终能力包括配置中心、连接器执行、映射、权限、测试、流水线、事件触发、文件导入、通知闭环、执行审计等。
2. **分阶段交付**：开发拆解按 MVP、增强版、平台化三个阶段推进，避免一期范围失控。

---

## 2. 背景与问题

HR Portal 已经具备多种数据对接能力，包括：

| 类型 | 当前能力 |
| --- | --- |
| 北森数据拉取 | Report ID、API |
| 飞书数据拉取 | API / 报表拉取 |
| 飞书数据推送 | HR Portal → 飞书 |
| 帆软 BI | JDBC 读取 HR Portal 数据 |
| 定时执行 | Cron 定时任务 |
| 审计日志 | 操作人与执行结果记录 |
| 权限校验 | RBAC + 数据权限基础能力 |
| 消息通知 | 飞书消息、邮件、模板、多接收人 |

当前问题：

- 每接一个新系统都偏定制开发，复用程度不足。
- 现有拉取、推送、定时、通知能力分散，缺少统一配置中心。
- 对跨系统多步骤同步缺少流水线能力。
- 对执行结果缺少统一通知闭环。
- 对接新系统时缺少标准测试、启停、日志和审计流程。
- HR 敏感数据同步缺少统一脱敏和凭证管理规范。

---

## 3. 总体目标

建设 **UCP（Universal Connector Platform，通用连接器平台）**，作为 HR Portal 数据接入与数据分发的统一底座。

### 3.1 产品目标

| 目标 | 说明 |
| --- | --- |
| 保留现有能力 | 现有拉取、推送、定时、视图配置、通知能力必须完整保留 |
| 配置化接入 | 对已支持协议、认证方式和执行动作的系统，通过配置完成接入 |
| 适配器扩展 | 对新协议、新认证、新业务动作，先开发适配器，再纳入配置化管理 |
| 流水线编排 | 支持多步骤拉取、转换、推送、通知组合执行 |
| 双触发模式 | 支持定时、手动、事件触发 |
| 权限隔离 | 连接器访问范围不得超过用户数据权限 |
| 通知闭环 | 成功、失败、部分成功均可通知相关人员 |
| 审计追踪 | 连接器配置、测试、执行、通知全链路可追踪 |
| 安全合规 | 凭证加密、日志脱敏、薪酬等敏感字段受控访问 |

### 3.2 “配置驱动”的边界

UCP 不承诺任何外部系统都可以零代码接入。

正确边界如下：

| 场景 | 是否零开发 | 说明 |
| --- | ---: | --- |
| 已支持协议 + 已支持认证 + 标准字段映射 | 是 | 通过配置中心完成 |
| 已有适配器的新实例 | 是 | 如同类飞书报表、同类北森 API |
| 新 REST API，但认证/分页/错误码标准 | 低代码 | 可能只需配置或少量模板 |
| 新签名算法、新认证方式 | 否 | 需要开发认证适配器 |
| 复杂业务动作，如删除外部账号 | 否 | 需要开发动作适配器与幂等逻辑 |
| 非标准文件格式 | 否 | 需要开发文件解析适配器 |

---

## 4. 范围定义

### 4.1 完整目标范围

UCP 最终包含以下能力：

1. 连接器配置中心；
2. 连接器配置版本管理；
3. 凭证引用与加密管理；
4. 现有视图级拉取/推送配置适配；
5. Pull Executor；
6. Push Executor；
7. File Parser；
8. Bridge Executor；
9. 统一映射引擎；
10. 定时触发器；
11. 手动触发器；
12. 事件触发器；
13. 事件总线；
14. 流水线执行引擎；
15. CONNECTOR / CONNECTOR_LOOP / TRANSFORM / WAIT / NOTIFY 步骤；
16. 连接器测试引擎；
17. 通知执行器；
18. 权限校验与数据权限隔离；
19. 脱敏与敏感字段控制；
20. 执行日志、步骤日志、通知日志；
21. 管理界面；
22. 运行监控与告警。

### 4.2 不在范围内

以下内容不属于 UCP 本身：

- 外部系统的账号、权限、组织规则治理；
- 外部系统接口可用性的 SLA 承诺；
- HR Portal 主数据质量治理；
- 所有历史定制同步逻辑的一次性重写；
- 完全可视化无代码编程平台。

---

## 5. 核心业务场景

### 5.1 已有能力保留

| 场景 | 当前行为 | UCP 要求 |
| --- | --- | --- |
| 北森 Report ID 拉取 | 不映射，直接创建字段 | 保留 |
| 北森 API 拉取 | 不映射，直接创建字段 | 保留 |
| 飞书报表拉取 | 不映射，直接创建字段 | 保留 |
| 飞书报表推送 | 不映射，按表头推送 | 保留 |
| 帆软 BI JDBC | 直接读取 HR Portal 数据 | 保留 |
| 视图级配置 | 每个视图独立配置 | 通过适配器挂载 |
| 定时任务 | 现有调用方式 | 不破坏旧调用 |
| 消息通知 | 飞书、邮件、模板 | 复用 |

#### 5.1.1 与现有模块的复用关系

UCP 不应重复建设 HR Portal 已经存在且运行稳定的基础能力。Phase 1 必须优先采用“封装现有能力为连接器/适配器”的方式落地。

| 能力 | 复用现有模块 | UCP 新增边界 |
| --- | --- | --- |
| 调度 | 复用 `scheduled_jobs` / `job_runs` 及既有 handler 机制 | 新增 UCP pipeline job handler，不新建独立调度系统 |
| 北森拉取 | 复用现有北森 client、分页、报表拉取能力 | 封装为 PULL connector adapter |
| 飞书拉取/推送 | 复用现有飞书 client、报表推送、通知发送能力 | 封装为 PULL / PUSH connector adapter |
| 推送目标 | 复用现有 push target 和 push service | UCP 只负责编排和执行状态追踪 |
| 消息通知 | 复用现有飞书、邮件、模板、多接收人能力 | 新增 pipeline 级通知策略、去重和执行结果变量 |
| 操作日志 | 复用 `system_logs` 记录配置变更和人工操作 | UCP 执行明细可使用专用执行表，必要摘要同步到操作日志 |
| 权限 | 复用 RBAC、菜单动作权限、数据范围标签、敏感字段权限 | UCP 增加执行主体、数据范围快照和连接器操作权限 |
| 敏感字段 | 复用现有字段敏感分类、字段权限和脱敏规则 | 连接器可补充外部字段敏感标签，但不得绕过现有规则 |
| 自动化/事件 | 复用已有自动化规则和飞书回调基础能力 | Phase 3 再建设事件总线、死信、重放等平台能力 |

### 5.2 待入职 Offer 两步同步

数据来源：

| 数据 | 来源系统 | 获取方式 | 关键字段 |
| --- | --- | --- | --- |
| 待入职人员列表 | 北森 | API | 姓名、手机号、投递 ID、预计入职日期 |
| Offer 详情 | 飞书招聘 | API | 薪酬、Offer 状态、岗位信息、投递 ID |

流程：

```text
定时触发
  ↓
从北森拉取待入职人员列表
  ↓
提取 application_id
  ↓
循环调用飞书招聘 Offer API
  ↓
按 application_id 合并
  ↓
写入 hr_pending_employee_full
  ↓
发送执行结果通知
```

要求：

- Offer 数据不是从北森拉取。
- 飞书招聘 Offer 拉取必须以 `application_id` 为查询条件。
- 如果部分 Offer 拉取失败，执行结果应为 `PARTIAL_SUCCESS`。
- 通知中必须包含：待入职人数、Offer 成功数、失败数、合并写入数。
- 薪酬字段属于敏感字段，日志和通知中默认不展示明细。

#### 5.2.1 Offer 同步写入与幂等规则

Phase 1A 中，待入职 Offer 同步必须先按固定场景跑通，不要求一开始支持所有字段和所有目标表配置。

写入规则：

| 规则项 | 要求 |
| --- | --- |
| 目标表 | `hr_pending_employee_full`，如现有表结构不满足，可通过迁移补字段 |
| 幂等主键 | `application_id` |
| 写入模式 | 按 `application_id` upsert |
| 北森有、飞书 Offer 成功 | 合并北森人员信息与飞书 Offer 信息后写入 |
| 北森有、飞书 Offer 查询失败 | 写入北森基础信息，Offer 字段为空，记录失败项，整体状态为 `PARTIAL_SUCCESS` |
| 北森有、飞书 Offer 不存在 | 记录为 `OFFER_NOT_FOUND`，不等同于接口失败 |
| 历史存在、本次北森不存在 | 标记为 `is_active = false` 或 `sync_status = NOT_IN_SOURCE`，不直接物理删除 |
| 薪酬字段 | 可入业务表，但日志、通知、测试预览、Context 快照默认不得展示明细 |
| 重跑粒度 | 支持按失败的 `application_id` 重跑 Offer 查询步骤 |

Offer 同步结果至少应记录以下统计：

- `pending_count`：北森待入职人数；
- `offer_success_count`：飞书 Offer 成功返回数；
- `offer_failed_count`：飞书 Offer 接口失败数；
- `offer_not_found_count`：飞书 Offer 未找到数；
- `merged_count`：最终 upsert 成功数；
- `failed_application_ids`：失败投递 ID 列表，日志中不得包含薪酬明细。

### 5.3 飞书人员变动触发外部账号创建/删除

目标流程：

```text
飞书入职/离职事件
  ↓
事件验签与去重
  ↓
解析员工信息
  ↓
调用滴滴账号接口
  ↓
调用曹操账号接口
  ↓
汇总执行结果
  ↓
通知配置人与事件相关人
```

要求：

- 创建/删除账号属于高风险动作，必须具备幂等键。
- 删除账号建议支持审批或二次确认策略。
- 同一事件不得重复执行。

### 5.4 Excel 文件导入

目标流程：

```text
上传 Excel
  ↓
文件格式校验
  ↓
字段映射
  ↓
数据校验
  ↓
写入目标表
  ↓
通知上传人
```

要求：

- 文件大小、行数、列数需要限制。
- 导入预览数据需要脱敏。
- 写入失败时支持错误明细下载。

### 5.5 组织架构变更同步 OA

目标流程：

```text
北森组织架构变更事件或定时扫描
  ↓
生成变更集
  ↓
推送 OA 系统
  ↓
记录同步结果
  ↓
通知相关人员
```

要求：

- 如果北森不支持实时事件，应采用定时扫描 + 差异比较模式。
- 组织删除、移动等高风险动作需要补偿和回滚方案。

---

## 6. 核心概念模型

### 6.1 连接器 Connector

连接器是连接到特定外部系统或特定数据动作的配置单元。

示例：

- `BEISEN_PENDING_LIST`：北森待入职人员列表拉取；
- `FEISHU_OFFER_DETAIL`：飞书招聘 Offer 详情拉取；
- `FEISHU_REPORT_PUSH`：飞书报表推送；
- `DIDI_ACCOUNT_PUSH`：滴滴账号创建/删除；
- `EXCEL_IMPORT`：Excel 文件导入。

### 6.2 适配器 Adapter

适配器负责处理外部系统差异，包括：

- 认证；
- 签名；
- 分页；
- 限流；
- 错误码；
- 数据格式；
- 幂等；
- 特殊业务动作。

### 6.3 流水线 Pipeline

流水线由多个步骤组成，用于编排跨系统、多步骤任务。

步骤类型：

| 类型 | 说明 |
| --- | --- |
| CONNECTOR | 调用单个连接器 |
| CONNECTOR_LOOP | 对列表循环调用连接器 |
| TRANSFORM | 数据转换、提取、合并、过滤 |
| WAIT | 等待固定时间或条件 |
| NOTIFY | 发送通知 |

### 6.4 执行上下文 Context

流水线执行时维护上下文对象，用于步骤间传递数据。

要求：

- 小数据量可内存传递；
- 大数据量必须落库或引用临时文件；
- Context 中的敏感字段必须按策略脱敏；
- Context 快照保存时必须控制大小和存储周期。

#### 6.4.1 Context 存储策略

Context 只用于步骤间传递和执行追踪，不应成为大数据明细存储。

| 数据类型 | 存储策略 |
| --- | --- |
| 小型参数、统计值 | 可直接保存在 Context JSON 中 |
| 明细列表 | 超过 500 行或 1 MB 后必须落库或保存为临时文件引用 |
| 接口 request / response | 默认只保存 masked 摘要，不保存敏感明文 |
| step output sample | 最多保存前 20 行脱敏样例 |
| 业务结果明细 | 写入目标业务表或专用明细表 |
| 临时数据 | 默认保留 7 天，可按执行记录清理 |

Context 快照至少包含：

- `trace_id`；
- `pipeline_run_id`；
- `step_id`；
- 输入输出摘要；
- 行数、成功数、失败数；
- 临时数据引用；
- 脱敏后的样例；
- 错误摘要。

#### 6.4.2 CONNECTOR_LOOP 失败项结构

循环调用连接器时，必须记录 item 级执行结果，支持后续定位和重跑。

失败项至少包含：

| 字段 | 说明 |
| --- | --- |
| `trace_id` | 全链路追踪 ID |
| `pipeline_run_id` | 流水线执行 ID |
| `step_run_id` | 步骤执行 ID |
| `item_key` | 失败项业务主键，如 `application_id` |
| `connector_code` | 调用的连接器编码 |
| `request_params_masked` | 脱敏后的请求参数 |
| `error_code` | 外部系统或内部标准错误码 |
| `error_message` | 脱敏后的错误信息 |
| `retry_count` | 已重试次数 |
| `is_retryable` | 是否允许失败项重跑 |
| `last_failed_at` | 最后失败时间 |

Phase 1A 的 Offer 同步中，`item_key` 固定为 `application_id`。

---

## 7. 总体架构

```text
┌──────────────────────────────────────────────┐
│                 管理界面 / API                │
└──────────────────────┬───────────────────────┘
                       ↓
┌──────────────────────────────────────────────┐
│              连接器配置中心 Config Center      │
│  连接器配置 / 流水线配置 / 版本 / 凭证引用       │
└──────────────────────┬───────────────────────┘
                       ↓
┌──────────────────────────────────────────────┐
│                触发层 Trigger Layer           │
│     定时触发 / 手动触发 / 事件触发             │
└───────────────┬──────────────────┬────────────┘
                ↓                  ↓
      定时 / 手动触发         事件触发（Phase 3）
                ↓                  ↓
┌──────────────────────────┐   ┌──────────────────────────┐
│ Pipeline Engine           │   │ Event Bus                 │
│ CONNECTOR / LOOP /        │   │ 标准事件 / 去重 / 重试 /    │
│ TRANSFORM / WAIT / NOTIFY │   │ 死信 / 重放 / 追踪          │
└──────────────┬───────────┘   └──────────────┬───────────┘
               │                              ↓
               └──────────────┬───────────────┘
                              ↓
┌──────────────────────────────────────────────┐
│              连接器执行引擎 Connector Engine   │
│ Pull / Push / File / Bridge / Mapping        │
└──────────────────────┬───────────────────────┘
                       ↓
┌──────────────────────────────────────────────┐
│          基础能力复用层 Existing Components    │
│ 拉取 / 推送 / 定时 / 权限 / 审计 / 消息通知      │
└──────────────────────────────────────────────┘
```

说明：Phase 1A 的定时和手动触发可直接进入 Pipeline Engine，不要求先建设 Event Bus；事件验签、死信、重放、事件重试等能力在 Phase 3 实施。

---

## 8. 功能规格

### 8.1 连接器配置中心

#### 8.1.1 功能

- 新建连接器；
- 编辑连接器；
- 启用/停用连接器；
- 测试连接器；
- 查看配置版本；
- 回滚配置；
- 配置映射规则；
- 配置通知策略；
- 绑定凭证；
- 绑定视图配置。

#### 8.1.2 配置字段

| 字段 | 说明 |
| --- | --- |
| system_code | 唯一编码 |
| system_name | 名称 |
| connector_type | PULL / PUSH / FILE / BRIDGE / REPORT |
| direction | INBOUND / OUTBOUND / BI_DIRECTIONAL |
| adapter_code | 适配器编码 |
| protocol | 协议配置 |
| credential_id | 凭证引用 |
| mapping_config | 映射配置 |
| scheduling | 调度配置 |
| notification_config | 通知配置 |
| retry_config | 重试配置 |
| status | 未启用 / 启用 / 停用 |
| test_status | 未测试 / 通过 / 失败 |
| owner | 负责人 |

### 8.2 视图配置适配

现有视图级配置必须完整保留。

要求：

- 不迁移即可继续运行；
- UCP 可通过适配器读取现有配置；
- 原视图配置的定时拉取/推送行为不改变；
- 新连接器可逐步迁移到 UCP 配置中心；
- 支持新旧配置并行。

### 8.3 映射引擎

映射是连接器级可选能力。

#### 不需要映射

适用于：

- 北森拉取；
- 飞书拉取；
- 飞书推送。

配置：

```json
{
  "enabled": false
}
```

#### 需要映射

适用于：

- 滴滴账号接口；
- 曹操账号接口；
- OA 推送；
- 飞书招聘 Offer 字段写入本地表。

配置：

```json
{
  "enabled": true,
  "rules": [
    {"source": "employee_name", "target": "name"},
    {"source": "mobile_phone", "target": "mobile"}
  ]
}
```

### 8.4 流水线执行引擎

#### 8.4.1 执行状态

| 状态 | 说明 |
| --- | --- |
| PENDING | 待执行 |
| RUNNING | 执行中 |
| SUCCESS | 全部成功 |
| PARTIAL_SUCCESS | 部分成功 |
| FAILED | 失败 |
| CANCELLED | 已取消 |
| TIMEOUT | 超时 |

#### 8.4.2 错误处理策略

| 策略 | 说明 |
| --- | --- |
| STOP_ON_ERROR | 任一步骤失败即终止 |
| CONTINUE_ON_ERROR | 失败步骤记录后继续 |
| RETRY_ON_ERROR | 自动重试后仍失败再按策略处理 |

#### 8.4.3 重试要求

- 支持步骤级重试；
- 支持连接器级重试；
- 支持指数退避；
- 支持最大重试次数；
- 重试不得破坏幂等性。

#### 8.4.4 CONNECTOR_LOOP 要求

- 支持并发度配置；
- 支持批大小配置；
- 支持失败项记录；
- 支持部分成功状态；
- 支持失败项重跑；
- 支持限流保护。

### 8.5 测试引擎

测试类型：

| 类型 | 说明 | 通过标准 |
| --- | --- | --- |
| 认证测试 | 验证凭证有效性 | 认证成功 |
| 连通性测试 | 验证接口可访问 | 目标系统可达 |
| 预览测试 | 拉取少量数据但不写入 | 返回样本数据 |
| 推送模拟 | 模拟推送不落地 | 返回模拟成功 |

要求：

- 连接器首次启用前必须测试通过；
- 测试数据需要脱敏；
- 测试日志需要保留；
- 测试失败需要记录错误原因。

### 8.6 通知执行器

#### 8.6.1 通知场景

| 场景 | 通知对象 |
| --- | --- |
| 定时拉取成功 | 配置人 + 视图负责人 |
| 定时拉取失败 | 配置人 + 视图负责人 + IT 值班 |
| 定时推送成功 | 配置人 + 视图负责人 |
| 定时推送失败 | 配置人 + 视图负责人 + IT 值班 |
| 事件处理成功 | 配置人 + 事件触发人 |
| 事件处理失败 | 配置人 + 事件触发人 + IT 值班 |
| 流水线完成 | 流水线负责人 |
| 部分成功 | 配置人 + 负责人 + IT 值班，可配置 |

#### 8.6.2 通知优先级与去重

同一次执行可能存在多层通知配置，规则如下：

1. 连接器独立执行时，使用连接器级通知。
2. 连接器作为流水线步骤执行时，默认不发送连接器级通知。
3. 流水线执行完成时，使用流水线级通知。
4. `NOTIFY` 步骤用于业务自定义通知。
5. 同一 `trace_id + template + receivers` 只允许发送一次。
6. 高优先级失败告警不得被普通成功通知覆盖。

#### 8.6.3 接收人解析

| 接收人类型 | 解析方式 |
| --- | --- |
| config_owner | 连接器配置人 |
| view_owner | 视图负责人 |
| pipeline_owner | 流水线配置人 |
| event_trigger | 事件触发人 |
| it_oncall | IT 值班人员 |
| custom | 自定义用户或群组 |

### 8.7 事件触发与事件总线

#### 8.7.1 标准事件对象

```json
{
  "event_id": "evt_20260701_103000_001",
  "event_type": "EMPLOYEE_ONBOARDING",
  "source": "FEISHU",
  "trigger": "REALTIME",
  "timestamp": "2026-07-01T10:30:00+08:00",
  "payload": {},
  "trace_id": "trace_20260701_103000"
}
```

#### 8.7.2 事件处理要求

- 事件验签；
- 事件去重；
- 事件重试；
- 死信队列；
- 事件重放；
- 幂等执行；
- 事件与流水线 trace 关联；
- 飞书事件 challenge / verification 处理。

---

## 9. 安全与合规

### 9.1 凭证管理

要求：

- 连接器配置中不得明文保存 token、api_key、secret；
- 配置中只保存 `credential_id`；
- 凭证由统一凭证表或密钥服务管理；
- 凭证必须加密存储；
- 支持凭证轮换；
- 凭证读取需要审计。

### 9.2 敏感字段

敏感字段包括但不限于：

- 手机号；
- 身份证号；
- 银行卡号；
- 薪酬；
- Offer 薪资；
- 候选人隐私信息；
- 外部系统账号凭证。

要求：

- 执行日志默认不保存敏感明文；
- request_body / response_body 入库前必须脱敏；
- preview_data 必须脱敏；
- 通知内容默认不展示薪酬明细；
- 有权限用户查看敏感明细需单独授权并记录审计。

### 9.3 数据保留

| 数据 | 建议保留 |
| --- | --- |
| 执行日志 | 180 天 |
| 通知日志 | 180 天 |
| 测试预览数据 | 7 天或不保存明细 |
| 脱敏请求响应 | 30-90 天 |
| 配置版本 | 长期保留 |

---

## 10. 权限设计

### 10.1 功能权限

| 操作 | HRBP | SSC 管理员 | IT 管理员 | HRVP |
| --- | ---: | ---: | ---: | ---: |
| 查看连接器列表 | 是 | 是 | 是 | 是 |
| 查看执行日志 | 是 | 是 | 是 | 是 |
| 创建/编辑连接器 | 否 | 是 | 是 | 是 |
| 测试连接器 | 否 | 是 | 是 | 是 |
| 手动触发同步 | 受限 | 是 | 是 | 是 |
| 配置映射规则 | 否 | 否 | 是 | 否 |
| 配置通知策略 | 否 | 是 | 是 | 是 |
| 启用/停用连接器 | 否 | 否 | 是 | 否 |
| 查看敏感明细 | 否 | 受限 | 受限 | 是 |

### 10.2 数据权限

原则：

```text
连接器可访问数据范围 ≤ 当前执行人或配置授权人的数据权限范围
```

要求：

- 手动触发使用触发人的数据权限；
- 定时任务使用连接器授权主体的数据权限；
- 事件触发使用系统授权主体 + 事件范围约束；
- 所有权限判断需要记录到执行日志。

#### 10.2.1 执行主体模型

UCP 必须区分“谁配置”“谁触发”“以谁的权限执行”。连接器或流水线配置中应包含执行主体信息。

| 字段 | 说明 |
| --- | --- |
| `run_as_type` | 执行主体类型：`TRIGGER_USER` / `CONFIG_OWNER` / `SERVICE_ACCOUNT` |
| `run_as_user_id` | 当使用配置人或指定用户执行时记录用户 ID |
| `service_account_code` | 当使用系统服务账号执行时记录服务账号编码 |
| `data_scope_snapshot` | 每次执行开始时固化的数据范围快照 |
| `permission_decision` | 权限判断结果，记录允许或拒绝及原因 |

执行规则：

| 触发类型 | 执行主体 | 数据权限来源 | Phase 1A 规则 |
| --- | --- | --- | --- |
| 手动触发 | `TRIGGER_USER` | 当前登录用户 | 仅 IT 管理员或授权用户可手动触发 Offer 同步 |
| 定时触发 | `SERVICE_ACCOUNT` 或 `CONFIG_OWNER` | 连接器授权主体 | Offer 同步默认使用 IT 配置的服务账号执行 |
| 事件触发 | `SERVICE_ACCOUNT` + 事件范围 | 系统授权主体叠加事件 payload 范围 | Phase 3 实施 |

Phase 1A 中，Offer 同步属于系统级定时同步，执行时可读取必要的北森和飞书招聘数据；同步结果表的查看、导出、报表分析仍必须走 HR Portal 既有数据权限和敏感字段权限。

#### 10.2.2 同步权限与查看权限分离

UCP 必须明确区分两类权限：

| 权限类型 | 控制对象 | 示例 |
| --- | --- | --- |
| 同步执行权限 | 是否允许拉取、推送、写入外部或本地数据 | IT 管理员配置 Offer 同步任务 |
| 数据查看权限 | 是否允许查看同步后的字段和明细 | HRBP 查看自己范围内待入职人员，薪酬字段按敏感权限脱敏 |

不得因为连接器以服务账号同步了全量数据，就允许普通用户在页面、日志、通知或导出中越权查看全量数据。

---

## 11. 数据库设计建议

### 11.1 连接器配置表

```sql
CREATE TABLE connector_system_config (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    system_code VARCHAR(64) NOT NULL UNIQUE,
    system_name VARCHAR(128) NOT NULL,
    description VARCHAR(255),
    connector_type VARCHAR(32) NOT NULL,
    direction VARCHAR(32) NOT NULL,
    adapter_code VARCHAR(64),
    protocol JSON,
    credential_id BIGINT,
    report_config JSON,
    scheduling JSON,
    mapping_config JSON,
    file_config JSON,
    retry_config JSON,
    circuit_breaker_config JSON,
    notification_config JSON,
    test_status VARCHAR(32) DEFAULT 'NOT_TESTED',
    test_result JSON,
    test_time DATETIME,
    connector_owner VARCHAR(64),
    status TINYINT DEFAULT 0,
    version INT DEFAULT 1,
    created_by VARCHAR(64),
    updated_by VARCHAR(64),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);
```

### 11.2 配置版本表

```sql
CREATE TABLE connector_config_version (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    connector_code VARCHAR(64) NOT NULL,
    version INT NOT NULL,
    config_snapshot JSON NOT NULL,
    change_reason VARCHAR(255),
    changed_by VARCHAR(64),
    changed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uk_connector_version (connector_code, version)
);
```

### 11.3 流水线配置表

```sql
CREATE TABLE connector_pipeline_config (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    pipeline_code VARCHAR(64) NOT NULL UNIQUE,
    pipeline_name VARCHAR(128) NOT NULL,
    description VARCHAR(255),
    steps JSON NOT NULL,
    trigger_type VARCHAR(32) NOT NULL,
    trigger_config JSON,
    error_handling VARCHAR(32) DEFAULT 'STOP_ON_ERROR',
    notification_config JSON,
    status TINYINT DEFAULT 0,
    created_by VARCHAR(64),
    updated_by VARCHAR(64),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);
```

### 11.4 流水线执行实例表

```sql
CREATE TABLE connector_pipeline_execution (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    pipeline_run_id VARCHAR(64) NOT NULL UNIQUE,
    pipeline_code VARCHAR(64) NOT NULL,
    trace_id VARCHAR(64) NOT NULL,
    trigger_type VARCHAR(32) NOT NULL,
    status VARCHAR(32) NOT NULL,
    total_steps INT,
    success_steps INT,
    failed_steps INT,
    started_by VARCHAR(64),
    started_at DATETIME,
    ended_at DATETIME,
    duration_ms INT,
    error_message TEXT,
    context_summary JSON,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

### 11.5 步骤执行实例表

```sql
CREATE TABLE connector_pipeline_step_execution (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    step_run_id VARCHAR(64) NOT NULL UNIQUE,
    pipeline_run_id VARCHAR(64) NOT NULL,
    step_id VARCHAR(64) NOT NULL,
    step_type VARCHAR(32) NOT NULL,
    connector_code VARCHAR(64),
    status VARCHAR(32) NOT NULL,
    retry_count INT DEFAULT 0,
    input_snapshot JSON,
    output_snapshot JSON,
    error_message TEXT,
    started_at DATETIME,
    ended_at DATETIME,
    duration_ms INT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

### 11.6 循环步骤失败项表

用于记录 CONNECTOR_LOOP 中 item 级失败，支撑部分成功、失败项定位和后续重跑。

```sql
CREATE TABLE connector_loop_item_execution (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    trace_id VARCHAR(64) NOT NULL,
    pipeline_run_id VARCHAR(64) NOT NULL,
    step_run_id VARCHAR(64) NOT NULL,
    connector_code VARCHAR(64) NOT NULL,
    item_key VARCHAR(128) NOT NULL,
    status VARCHAR(32) NOT NULL,
    request_params_masked JSON,
    response_summary_masked JSON,
    error_code VARCHAR(64),
    error_message TEXT,
    retry_count INT DEFAULT 0,
    is_retryable TINYINT DEFAULT 1,
    last_failed_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_trace_id (trace_id),
    INDEX idx_step_run_id (step_run_id),
    INDEX idx_item_key (item_key)
);
```

### 11.7 连接器执行日志表

```sql
CREATE TABLE connector_execution_log (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    trace_id VARCHAR(64) NOT NULL,
    connector_code VARCHAR(64),
    pipeline_code VARCHAR(64),
    trigger_type VARCHAR(32) NOT NULL,
    request_url VARCHAR(512),
    request_body_masked JSON,
    response_body_masked JSON,
    status VARCHAR(32) NOT NULL,
    record_count INT,
    success_count INT,
    failed_count INT,
    error_message TEXT,
    duration_ms INT,
    executor VARCHAR(64) NOT NULL,
    data_source VARCHAR(128),
    data_scope JSON,
    permission_checked TINYINT DEFAULT 1,
    notification_sent TINYINT DEFAULT 0,
    notification_result JSON,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_trace_id (trace_id),
    INDEX idx_connector (connector_code),
    INDEX idx_created_at (created_at)
);
```

### 11.8 通知日志表

```sql
CREATE TABLE connector_notification_log (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    trace_id VARCHAR(64) NOT NULL,
    connector_code VARCHAR(64),
    pipeline_code VARCHAR(64),
    message_type VARCHAR(32) NOT NULL,
    receivers JSON NOT NULL,
    template_name VARCHAR(64) NOT NULL,
    message_content_masked JSON NOT NULL,
    send_status VARCHAR(32) NOT NULL,
    send_result JSON,
    error_message TEXT,
    sent_by VARCHAR(64),
    sent_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    dedup_key VARCHAR(128),
    INDEX idx_trace_id (trace_id),
    INDEX idx_connector (connector_code),
    INDEX idx_sent_at (sent_at),
    UNIQUE KEY uk_dedup_key (dedup_key)
);
```

---

## 12. 配置示例

### 12.1 飞书报表推送

```json
{
  "system_code": "FEISHU_REPORT_PUSH",
  "system_name": "飞书-报表推送",
  "connector_type": "PUSH",
  "direction": "OUTBOUND",
  "adapter_code": "FEISHU_REPORT_PUSH_ADAPTER",
  "credential_id": 1001,
  "protocol": {
    "base_url": "https://open.feishu.cn/open-apis"
  },
  "scheduling": {
    "cron": "0 30 8 * * ?",
    "timezone": "Asia/Shanghai"
  },
  "mapping_config": {
    "enabled": false
  },
  "notification_config": {
    "enabled": true,
    "on_success": {
      "enabled": true,
      "message_type": "feishu",
      "receivers": ["config_owner", "view_owner"],
      "template": "connector_success"
    },
    "on_failure": {
      "enabled": true,
      "message_type": "both",
      "receivers": ["config_owner", "view_owner", "it_oncall"],
      "template": "connector_failure"
    }
  }
}
```

### 12.2 待入职 Offer 同步流水线

```json
{
  "pipeline_code": "PENDING_OFFER_SYNC",
  "pipeline_name": "待入职 Offer 数据同步",
  "trigger_type": "SCHEDULED",
  "trigger_config": {
    "cron": "0 0 3 * * ?",
    "timezone": "Asia/Shanghai"
  },
  "steps": [
    {
      "step_id": "pull_pending_list",
      "step_name": "从北森拉取待入职人员列表",
      "type": "CONNECTOR",
      "connector_code": "BEISEN_PENDING_LIST",
      "output_key": "pending_list",
      "error_handling": "STOP_ON_ERROR"
    },
    {
      "step_id": "extract_application_ids",
      "step_name": "提取投递 ID 列表",
      "type": "TRANSFORM",
      "input_key": "pending_list",
      "transform_config": {
        "operation": "extract_field",
        "source_field": "application_id",
        "output_field": "application_ids"
      },
      "output_key": "application_ids"
    },
    {
      "step_id": "pull_offer_detail",
      "step_name": "从飞书招聘拉取 Offer 详情",
      "type": "CONNECTOR_LOOP",
      "connector_code": "FEISHU_OFFER_DETAIL",
      "loop_input": "${application_ids}",
      "loop_output": "offer_details",
      "parallelism": 5,
      "batch_size": 10,
      "error_handling": "CONTINUE_ON_ERROR"
    },
    {
      "step_id": "merge_and_write",
      "step_name": "合并数据并写入本地表",
      "type": "TRANSFORM",
      "input_key": ["pending_list", "offer_details"],
      "transform_config": {
        "operation": "join_and_upsert",
        "join_key": "application_id",
        "target_table": "hr_pending_employee_full"
      }
    },
    {
      "step_id": "notify_result",
      "step_name": "发送同步结果通知",
      "type": "NOTIFY",
      "config": {
        "trigger_condition": "ON_COMPLETION",
        "message_type": "feishu",
        "receivers": ["config_owner", "view_owner"],
        "template": "offer_sync_result",
        "template_vars": {
          "pending_count": "${pull_pending_list.result.row_count}",
          "offer_success_count": "${pull_offer_detail.result.success_count}",
          "offer_failed_count": "${pull_offer_detail.result.failed_count}",
          "merged_count": "${merge_and_write.result.row_count}",
          "status": "${execution.status}",
          "duration": "${execution.duration}"
        }
      }
    }
  ],
  "notification_config": {
    "enabled": true,
    "on_failure": {
      "enabled": true,
      "message_type": "both",
      "receivers": ["config_owner", "view_owner", "it_oncall"],
      "template": "pipeline_failure"
    },
    "on_partial_success": {
      "enabled": true,
      "message_type": "feishu",
      "receivers": ["config_owner", "view_owner"],
      "template": "pipeline_partial_success"
    }
  }
}
```

---

## 13. 开发拆解

### 13.1 Phase 1：MVP，现有能力整合 + Offer 两步同步

目标：在不影响现有功能的前提下，建设最小可用 UCP，优先支撑待入职 Offer 同步和执行通知。

Phase 1 必须拆成 1A / 1B / 1C 三个可独立验收的小阶段，避免一开始按完整平台建设导致范围失控。

#### 13.1.1 Phase 1A：Offer 同步最小闭环

目标：不追求完整通用平台，先用最小 UCP 内核稳定跑通“北森待入职列表 + 飞书 Offer 详情 + 合并写入 + 通知”。

| 编号 | 任务 | 优先级 | 工作量 |
| --- | --- | ---: | ---: |
| 1 | 创建 Phase 1A 必需数据库表和迁移 | P0 | 2 天 |
| 2 | 固定连接器配置读取能力 | P0 | 2 天 |
| 3 | 凭证引用与加密读取接入 | P0 | 2 天 |
| 4 | 复用北森 Pull 能力并封装 `BEISEN_PENDING_LIST` | P0 | 3 天 |
| 5 | 封装飞书招聘 Offer 查询连接器 `FEISHU_OFFER_DETAIL` | P0 | 4 天 |
| 6 | 简化 Pipeline Engine | P0 | 4 天 |
| 7 | 支持 CONNECTOR / CONNECTOR_LOOP / TRANSFORM / NOTIFY 四类步骤 | P0 | 4 天 |
| 8 | Offer 合并 upsert 与幂等规则 | P0 | 3 天 |
| 9 | Pipeline 执行日志、步骤日志、失败项记录 | P0 | 3 天 |
| 10 | 通知发送、通知变量和通知去重 | P0 | 3 天 |
| 11 | 薪酬、手机号等敏感字段脱敏 | P0 | 2 天 |
| 12 | 定时触发接入现有调度 handler | P0 | 2 天 |
| 13 | 最小管理入口：查看执行结果、手动触发、查看失败项 | P1 | 3 天 |
| 14 | Offer 同步联调与回归测试 | P0 | 5 天 |

Phase 1A 预估：40-45 人天。

Phase 1A 暂不包含：

- 通用可视化连接器配置页面；
- 通用配置版本一键回滚；
- 完整连接器测试引擎；
- 任意目标表配置；
- 失败项可视化批量重跑；
- 事件总线；
- Excel 文件导入；
- 外部账号自动创建/删除。

#### 13.1.2 Phase 1B：配置中心与管理增强

目标：将 Phase 1A 固定配置沉淀为可管理配置，但仍限定在已支持适配器范围内。

| 编号 | 任务 | 优先级 | 工作量 |
| --- | --- | ---: | ---: |
| 1 | 连接器配置中心后端 CRUD | P0 | 4 天 |
| 2 | 配置版本记录与变更历史 | P0 | 2 天 |
| 3 | 回滚基础能力，回滚后进入 `DISABLED` 或 `NEED_TEST` 状态 | P1 | 2 天 |
| 4 | 基础映射引擎配置化 | P0 | 3 天 |
| 5 | 基础管理页面 | P1 | 5 天 |
| 6 | 权限校验和配置操作审计 | P0 | 3 天 |

Phase 1B 预估：20-25 人天。

#### 13.1.3 Phase 1C：现有视图配置适配与兼容回归

目标：把既有北森、飞书、推送、定时能力以适配器方式挂入 UCP，同时保证旧功能不受影响。

| 编号 | 任务 | 优先级 | 工作量 |
| --- | --- | ---: | ---: |
| 1 | 现有视图配置适配器 | P0 | 3 天 |
| 2 | 复用 Push Executor | P0 | 2 天 |
| 3 | 原视图级定时任务兼容验证 | P0 | 3 天 |
| 4 | 原飞书推送按表头推送兼容验证 | P0 | 2 天 |
| 5 | 旧功能全量回归测试 | P0 | 5 天 |

Phase 1C 预估：15-20 人天。

完整 Phase 1 合计预估：75-90 人天。若只要求 Offer 同步先上线，应优先交付 Phase 1A。

### 13.2 Phase 2：流程增强与运维能力

目标：增强流水线、测试、手动补偿和管理体验。

| 编号 | 任务 | 优先级 | 工作量 |
| --- | --- | ---: | ---: |
| 1 | 完整连接器测试引擎 | P0 | 5 天 |
| 2 | 步骤级重试与失败项重跑 | P0 | 4 天 |
| 3 | PARTIAL_SUCCESS 细化处理 | P0 | 3 天 |
| 4 | 手动触发与权限约束 | P1 | 3 天 |
| 5 | 管理界面增强 | P1 | 8 天 |
| 6 | 执行详情与步骤日志页面 | P1 | 4 天 |
| 7 | Excel 文件导入连接器 | P1 | 8 天 |
| 8 | 推送模拟测试 | P1 | 3 天 |
| 9 | 熔断与限流策略 | P1 | 4 天 |
| 10 | 通知模板管理页面 | P1 | 3 天 |

预估：45-55 人天。

### 13.3 Phase 3：平台化与事件驱动

目标：将 UCP 从同步配置平台升级为事件驱动集成平台。

| 编号 | 任务 | 优先级 | 工作量 |
| --- | --- | ---: | ---: |
| 1 | 事件总线 | P0 | 6 天 |
| 2 | 飞书事件触发器 | P0 | 5 天 |
| 3 | 事件验签、去重、重放、死信 | P0 | 6 天 |
| 4 | 外部账号创建/删除流水线 | P0 | 6 天 |
| 5 | 高风险动作审批/二次确认 | P1 | 5 天 |
| 6 | OA 组织架构同步 | P1 | 6 天 |
| 7 | 适配器注册机制 | P1 | 5 天 |
| 8 | 可视化流水线编排增强 | P2 | 10 天 |
| 9 | 运行监控 Dashboard | P1 | 5 天 |

预估：55-65 人天。

---

## 14. 实施路线图

| 阶段 | 时间 | 目标 | 里程碑 |
| --- | --- | --- | --- |
| Phase 1 | 第 1-8 周 | MVP 可用 | Offer 两步同步上线，现有能力不受影响 |
| Phase 2 | 第 9-14 周 | 流程增强 | 测试、补偿、Excel、日志界面完善 |
| Phase 3 | 第 15-22 周 | 平台化 | 事件驱动、账号自动化、OA 同步上线 |

> 注：若投入 2-3 名后端 + 1 名前端 + 1 名测试，可并行压缩周期；但不建议压缩回归测试、安全测试和联调时间。

---

## 15. 验收标准

### 15.1 现有能力保留验收

| 编号 | 验收项 | 标准 |
| --- | --- | --- |
| 1 | 北森 Report ID 拉取 | 原有任务正常执行 |
| 2 | 北森 API 拉取 | 原有任务正常执行 |
| 3 | 飞书拉取 | 原有任务正常执行 |
| 4 | 飞书推送 | 仍按表头推送，不强制映射 |
| 5 | 视图级配置 | 原有视图配置不丢失、不失效 |
| 6 | 定时组件 | 其他模块调用不受影响 |
| 7 | 消息通知 | 飞书、邮件、模板、多接收人正常 |
| 8 | 审计日志 | 原审计链路不被破坏 |

### 15.2 MVP 验收

| 编号 | 验收项 | 标准 |
| --- | --- | --- |
| 1 | 连接器配置 | 可创建、编辑、启停、查看版本 |
| 2 | 凭证管理 | 配置中不保存明文密钥 |
| 3 | 执行日志 | 每次执行有 trace_id 和状态 |
| 4 | 通知闭环 | 成功、失败、部分成功可通知 |
| 5 | 通知去重 | 同一执行不重复通知 |
| 6 | 脱敏 | 日志和通知不展示敏感明细 |
| 7 | Offer 同步 | 北森列表 + 飞书 Offer 可合并写入 |
| 8 | 部分成功 | 部分 Offer 失败时状态正确 |
| 9 | 权限校验 | 无权限用户不可越权查看或触发 |

### 15.2.1 Phase 1A 可执行验收用例

| 编号 | 场景 | 测试方法 | 预期结果 |
| --- | --- | --- | --- |
| 1 | Offer 同步全成功 | 准备 10 条北森待入职数据，飞书 Offer API 全部返回成功 | Pipeline 状态为 `SUCCESS`，`pending_count=10`，`offer_success_count=10`，`merged_count=10` |
| 2 | Offer 部分失败 | 准备 10 个 `application_id`，其中 2 个飞书 Offer API 返回失败 | Pipeline 状态为 `PARTIAL_SUCCESS`，失败项表记录 2 条，通知展示成功数和失败数 |
| 3 | Offer 未找到 | 飞书 Offer API 对部分 `application_id` 返回未找到 | 记录 `OFFER_NOT_FOUND`，不计入接口失败，通知单独展示未找到数量 |
| 4 | 幂等写入 | 同一批 `application_id` 连续执行两次 | 目标表按 `application_id` upsert，不产生重复记录 |
| 5 | 历史数据失效 | 目标表中存在历史人员，本次北森列表不再返回 | 历史记录标记为 `is_active=false` 或 `sync_status=NOT_IN_SOURCE` |
| 6 | 薪酬脱敏 | 飞书 Offer 返回薪酬字段 | 执行日志、通知、Context sample、失败项 request/response 不出现薪酬明细 |
| 7 | 手机号脱敏 | 北森返回手机号字段 | 日志和预览样例只展示脱敏手机号 |
| 8 | 通知去重 | 同一 `trace_id + template + receivers` 重复触发通知 | 只发送一次通知，通知日志命中同一个 `dedup_key` |
| 9 | 手动触发权限 | 使用 HRBP 账号触发 Offer 同步 | 返回无权限，且记录权限拒绝日志 |
| 10 | 服务账号定时执行 | 通过调度 handler 触发 Offer 同步 | 执行主体为服务账号，执行日志包含 `data_scope_snapshot` |
| 11 | 失败项重跑 | 对失败的 `application_id` 发起重跑 | 只重跑失败项，不重复拉取已成功项 |
| 12 | 旧能力不受影响 | 执行原北森 Report ID 拉取、飞书推送、定时任务 | 原任务执行结果、字段生成、推送表头逻辑与改造前一致 |

### 15.3 完整平台验收

| 编号 | 验收项 | 标准 |
| --- | --- | --- |
| 1 | 流水线编排 | 多步骤可稳定执行 |
| 2 | CONNECTOR_LOOP | 支持并发、失败项记录、补偿 |
| 3 | 测试引擎 | 认证、连通、预览、模拟测试可用 |
| 4 | 文件导入 | Excel 可校验、预览、写入、通知 |
| 5 | 事件触发 | 飞书事件可触发流水线 |
| 6 | 事件可靠性 | 验签、去重、重试、死信可用 |
| 7 | 外部账号自动化 | 入职/离职可触发滴滴、曹操账号动作 |
| 8 | 组织同步 | 北森组织变更可同步 OA |
| 9 | 运维监控 | 可查看失败率、耗时、告警、趋势 |

---

## 16. 风险与应对

| 风险 | 影响 | 应对 |
| --- | --- | --- |
| 范围过大 | 工期失控 | 按三阶段交付 |
| 现有能力被破坏 | 业务中断 | 适配器挂载，新旧并行，充分回归 |
| 外部 API 不稳定 | 同步失败 | 重试、限流、失败通知、补偿 |
| 敏感数据泄露 | 合规风险 | 脱敏、权限、日志周期、凭证加密 |
| 通知重复 | 用户打扰 | trace 级去重 |
| 流水线部分失败 | 数据不一致 | PARTIAL_SUCCESS、失败项重跑 |
| 零代码预期过高 | 业务误解 | 明确适配器边界 |
| 事件重复投递 | 重复创建/删除账号 | 事件去重、幂等键 |

---

## 17. 开放问题

1. 北森是否支持组织架构变更实时事件？如不支持，是否采用定时差异扫描？
2. 飞书招聘 Offer API 的真实接口路径、鉴权、限流和字段结构需进一步确认。
3. 薪酬字段的可见角色和审批规则需由 HR/IT 确认。
4. 滴滴、曹操账号创建/删除接口是否支持幂等键？
5. 删除外部账号是否需要审批或延迟执行？
6. Excel 导入的目标表范围、字段映射规则、文件大小限制需确认。
7. 执行日志和脱敏响应的保留周期需与公司合规要求对齐。

---

## 18. 附录：术语

| 术语 | 说明 |
| --- | --- |
| UCP | Universal Connector Platform，通用连接器平台 |
| Connector | 连接器，连接某个系统或动作的配置单元 |
| Adapter | 适配器，处理外部系统协议、认证、分页、错误码等差异 |
| Pipeline | 流水线，由多个步骤组成的工作流 |
| Context | 流水线执行上下文 |
| NOTIFY | 流水线中的通知步骤 |
| PARTIAL_SUCCESS | 部分成功，如批量循环中部分记录失败 |
| trace_id | 一次执行链路的全局追踪 ID |
| application_id | 投递 ID，用于从飞书招聘查询 Offer 详情 |

---

## 19. 2026-07-03 实施定调补充

> 本章节为实施定调补充，优先级高于本文档中较早的“兼容旧连接器模型”表述。详细可执行任务见同目录 `implementation-plan.md`。

### 19.1 不做旧模型兼容

当前 UCP 仍处于开发期，允许彻底重构产品概念、接口、表结构和页面命名。

后续统一采用：

```text
系统 System → 资源 Resource → 凭证 Credential → 流水线 Pipeline / 画布 Template
```

不再把 Connector 作为普通用户的一等产品概念。Adapter 可作为技术适配层保留，用于协议、认证、分页、错误码和特殊业务动作适配。


### 19.1.1 应用化预留定调

UCP 当前仍在 HR Portal 内交付，但必须按未来可独立应用预留：**应用化设计，门户内交付**。

关键决策：

- UCP 不再放在“系统设置 → 数据接入”下作为后台配置项；
- UCP 升级为 HR Portal 顶部一级 Tab，建议名称为 `数据连接`；
- UCP 路由前缀从 `/datasource/ucp` 调整为 `/ucp`；
- UCP 权限继续复用 HR Portal 当前 Menu / Role / RoleMenu / UserRole 体系；
- UCP 权限资源 code 使用独立命名空间 `ucp.*`，不再使用 `datasource.ucp_*` 作为主权限；
- Phase 1 不引入独立部署、微前端、独立认证中心或独立数据库，但模型、路由、权限、导航需要为未来独立应用化降低迁移成本。

推荐权限 code：

| 权限 code | 说明 |
| --- | --- |
| `ucp.app` | 数据连接顶部一级入口 |
| `ucp.systems` | 接入系统 |
| `ucp.resources` | 系统资源 |
| `ucp.credentials` | 凭证 |
| `ucp.pipelines` | 流水线 |
| `ucp.pipeline_designer` | 流水线画布 |
| `ucp.executions` | 执行日志与手动执行 |
| `ucp.events` | 事件中心 |
| `ucp.triggers` | 触发器 |
| `ucp.dead_letters` | 死信队列 |
| `ucp.monitor` | 监控中心 |
| `ucp.approvals` | 审批中心 |
| `ucp.external_accounts` | 外部账号 |
| `ucp.oa_sync` | OA 同步 |
| `ucp.assets` | 集成资产，远期 |
| `ucp.governance` | 主数据治理，远期 |
| `ucp.admin` | UCP 管理配置 |


### 19.2 蓝图作为最终状态规格

`outputs/ucp-blueprint/index.html` 中的 15 个场景作为 UCP 最终交互、页面结构和信息架构目标写入规格；视觉风格需与 HR Portal 现有浅色企业后台风格融合：

1. 顶部一级 Tab `数据连接` + 内部左侧菜单，收敛为一个 UCP 应用化入口；
2. 接入系统主页：KPI + 系统卡片 + 凭证 chip；
3. 新建系统 4 步向导；
4. 系统详情 6 Tab 抽屉；
5. 凭证按系统分组和主备切换；
6. 资源详情和流水线反向引用；
7. 流水线列表显示系统、资源、触发方式；
8. 流水线画布，节点绑定资源而不是连接器；
9. 执行日志按流水线和时间查看；
10. 执行详情展示 Trace、步骤和通知；
11. 事件中心列表；
12. 事件详情：时间线、Payload、派发历史；
13. 触发器配置；
14. 监控中心：4h/24h/7d/30d、趋势图、告警；
15. 死信队列：重放、丢弃、到期重试。

### 19.3 流水线画布前置

流水线画布是配置入口，不作为后期增强能力。Phase 1 即必须交付最小可用画布：

- 左侧节点面板；
- 中间画布；
- 右侧属性面板；
- 节点连线；
- 保存模板；
- 从模板创建流水线；
- 试运行；
- 发布。

Phase 1 节点类型至少包括：

| 节点 | 说明 |
| --- | --- |
| RESOURCE | 调用一个系统资源，绑定 `system_id + resource_id + credential_id` |
| LOOP_RESOURCE | 对列表循环调用系统资源 |
| TRANSFORM | 数据提取、转换、合并、写入 |
| NOTIFY | 发送通知 |

### 19.4 UI 设计约束

真实 Vue 页面必须参考当前蓝图的交互结构、信息层级和关键组件形态，但不要求逐像素复刻蓝图视觉。以前端专家评估结果为准：**交互结构按蓝图，视觉风格按 HR Portal**。

关键约束：

- UCP 必须作为顶部一级 `数据连接` 入口进入，真实路由使用 `/ucp` 前缀；
- 首页必须采用蓝图中的 KPI + toolbar + 系统卡片网格；
- 系统卡片必须使用凭证 chip；
- 凭证必须作为系统内配件展示；
- 系统详情必须采用 6 Tab 抽屉；
- 流水线画布必须采用左节点面板、中画布、右属性面板结构；
- 颜色、字体、边框、圆角、阴影、按钮、表格、抽屉、标签优先沿用 HR Portal 现有 Element Plus 风格和全局 design token；
- 不在 UCP 内复制蓝图的独立深色侧边栏/顶栏外壳，避免与 HR Portal 全局导航割裂；
- 可吸收蓝图的高密度卡片、状态色、凭证 chip、监控层级和画布交互表达；
- 1366px 笔记本屏幕下不得出现核心内容横向溢出；
- 核心指标和卡片数据必须来自真实 API，不允许前端硬编码。

验收时同时检查两点：

1. 交互、信息架构、业务内容是否对齐蓝图；
2. 视觉观感是否与 HR Portal 现有浅色企业后台保持一致。

### 19.5 任务拆解和验收

后续开发以 `implementation-plan.md` 中的可勾选任务表为准。

每个任务必须满足：

1. 有明确编号；
2. 有涉及文件；
3. 有验收标准；
4. 完成后可标记 `[x]`；
5. 未满足验收标准不得标记完成；
6. 涉及 UCP 导航、路由和权限的任务必须按 `数据连接` / `/ucp` / `ucp.*` 验收。

### 19.6 远期能力规划

以下能力不纳入 Phase 1-4 的当前交付边界，但作为终极状态的远期规划保留，并已在 `implementation-plan.md` 中拆解为可勾选任务：

| 远期阶段 | 能力 | 定位 |
| --- | --- | --- |
| Phase 5 | 通用 API 配置化能力 | 在已支持认证、分页、响应结构范围内，提供 REST API 配置化接入，不承诺任意系统零代码接入 |
| Phase 6 | 集成治理 / iPaaS 能力雏形 | 在 UCP 稳定支撑 HR Portal 后，扩展资产目录、依赖拓扑、SLA、告警、审批和团队隔离 |
| Phase 7 | 外部系统主数据治理协同 | 扩展外部 ID 映射、差异检测、质量规则、冲突处理和治理闭环，不替代外部系统自身主数据管理 |
