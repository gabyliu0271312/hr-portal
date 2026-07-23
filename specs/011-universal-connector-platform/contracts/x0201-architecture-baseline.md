# X0201 架构基线、数据合同与验收包

> 关联主规格：`standard-saas-capability-card-platform-development-spec.md` v1.5  
> 任务：X0201 统一连接器注册、两条业务数据合同与 UI 蓝图  
> 日期：2026-07-23  
> 状态：开发基线已冻结；第三方生产凭证、正式 Scope 与测试租户属于上线配置，不写入代码库。

## 1. 决策与唯一事实来源

### 1.1 连接器对象职责

| 对象 | 职责 | 是否由普通用户直接配置 | 兼容策略 |
|---|---|---|---|
| `ConnectorPackage` | 平台发布的系统能力包；维护认证策略、Host、对象、操作、Schema、风险和版本 | 否 | 作为上层目录事实来源 |
| `AdapterDefinition` | 低层执行适配器/Schema 的兼容投影 | 否 | 继续供旧资源和运行引擎使用；不得单独形成第二个产品目录 |
| `UcpSystem` / `UcpCredential` | 企业实例连接与加密凭证 | 是 | 保持现有模型与运行路径 |
| `UcpResource` | 企业具体实例：表格、报表、文件、数据库、特殊 API | 是，仅实例资源 | 标准 SaaS 原始 API 不新建 Resource |
| `DataSource` | 数据仓库独立入仓来源、调度和同步 | 是 | 保持独立，不被 UCP 接管 |
| `WarehouseAssetSink` | UCP Pipeline 写入数据仓库资产的受控集成节点 | 是，在流程中选择目标资产与写入策略 | 不复制 DataSource、质量、血缘或资产目录能力 |

### 1.2 目录与组件复用原则

- 数据仓库和数据连接共同消费 Connector Catalog 的名称、图标、实例资源 Schema、链接解析器、凭证策略、脱敏规则和弃用状态。
- 数据仓库保持自己的“来源于开放 / 配置入仓来源”；标准 SaaS 的数据生产由数据连接流程完成，再通过 `WarehouseAssetSink` 写入资产。
- 旧 `implementation-plan.md` 中“开发期不做兼容”“系统 → 资源 → 凭证 → 流水线画布为唯一产品路径”的内容，不适用于本规格。涉及 Connector Package、标准 SaaS 能力卡、资产写入和滴滴生命周期时，以本主规格及本文件为准。

## 2. 通用流程组件合同

```text
SourceReader → RecordLoop → LookupCapability → MergeMap → WarehouseAssetSink
```

| 组件 | 输入 | 输出 | 通用约束 |
|---|---|---|---|
| `SourceReader` | 已配置资源/能力、分页与时间范围 | 标准记录流与读取批次 | 不直接写入数据仓库 |
| `RecordLoop` | 记录流、并发度、幂等范围 | 单条记录上下文 | 单条失败可继续；不得吞掉错误 |
| `LookupCapability` | 已启用的 System Capability、业务键 | 标准化外部结果 | 只允许已验证能力；执行限流/脱敏 |
| `MergeMap` | 左右记录、字段映射、冲突策略 | 合并后的业务记录 | 来源字段默认不可覆盖；映射只能使用白名单字段 |
| `WarehouseAssetSink` | 目标资产、新资产标识、主键、写入模式、字段映射 | 写入批次、行结果、资产引用 | 仅通过数据仓库受控服务写入；支持 `append` / `upsert` / `replace` |

所有组件必须输出：`trace_id`、`pipeline_run_id`、`step_run_id`、`record_key`、`status`、`error_code`、脱敏 `summary`。

## 3. 合同 A：北森待入职人员 → 飞书 Offer → 数据仓库资产

### 3.1 流程完成语义

```text
北森待入职人员读取
→ 按投递记录 ID `application_id` 查询飞书招聘 Offer
→ 合并批准字段
→ WarehouseAssetSink upsert 到“待入职人员”资产
```

流程批次成功：所有可处理记录均产生终态（`SUCCESS`、`NO_DATA`、`FAILED`、`SKIPPED`），并可对 `FAILED` 单条重跑。`NO_DATA` 不等于失败。

### 3.2 字段字典

| 规范字段 | 来源 | 必填 | 敏感级别 | 写入资产列 | 规则 |
|---|---|---:|---|---|---|
| `employee_candidate_key` | 北森 | 是 | internal | `employee_candidate_key` | 资产 upsert 主键；不可由 Offer 覆盖 |
| `application_id` | 北森 | 是 | internal | `beisen_application_id` | 飞书 Offer 查询键（投递记录 ID）；空值为 `SKIPPED_MISSING_KEY` |
| `candidate_name` | 北森 | 否 | pii | `beisen_candidate_name` | 仅脱敏日志 |
| `planned_onboard_date` | 北森 | 否 | internal | `beisen_planned_onboard_date` | 用于待入职过滤 |
| `offer_id` | 飞书招聘 | 否 | internal | `feishu_offer_id` | 多 Offer 按已确认选择策略处理 |
| `offer_status` | 飞书招聘 | 否 | internal | `feishu_offer_status` | 无 Offer 时为空 |
| `salary_amount` | 飞书招聘 | 否 | compensation_high | `feishu_offer_salary_amount` | 仅有权限角色可见；日志只保留掩码摘要 |
| `salary_currency` | 飞书招聘 | 否 | compensation_high | `feishu_offer_salary_currency` | 与金额同级保护 |
| `offer_effective_date` | 飞书招聘 | 否 | internal | `feishu_offer_effective_date` | 以正式接口字段为准 |
| `enrichment_status` | 流程 | 是 | internal | `offer_enrichment_status` | `SUCCESS/NO_DATA/FAILED/SKIPPED` |
| `enrichment_trace_id` | 流程 | 是 | internal | `offer_enrichment_trace_id` | 用于跳转运行记录 |
| `enrichment_batch_id` | 流程 | 是 | internal | `offer_enrichment_batch_id` | 写入批次可追溯 |

### 3.3 关联、冲突与幂等

- 关联键：投递记录 ID `application_id`；不得以姓名或手机号进行自动关联。
- 多 Offer：先按正式业务确认的 `offer_effective_date`、状态优先级和唯一 `offer_id` 规则选择；确认前返回 `FAILED_AMBIGUOUS_OFFER`，不得随机选取。
- 幂等键：`employee_candidate_key + selected_offer_id + offer_version_or_updated_at`；无 Offer 时使用 `employee_candidate_key + source_batch_id`。
- 写入模式：默认 `upsert`；只允许写入 `feishu_offer_*` 与 `offer_enrichment_*`，不得覆盖 `beisen_*`。
- 单条失败：流程继续；超出重试次数进入死信，支持按 `record_key` 重跑。

## 4. 合同 B：飞书员工事件 → 企业滴滴账号生命周期

### 4.1 标准事件字段

| 字段 | 来源 | 必填 | 说明 |
|---|---|---:|---|
| `event_id` | 飞书 | 是 | 全局去重键 |
| `event_type` | 飞书标准化 | 是 | `EMPLOYEE_ONBOARDED` / `EMPLOYEE_OFFBOARDED` / `EMPLOYEE_UPDATED` |
| `occurred_at` | 飞书 | 是 | 事件发生时间，用于乱序保护 |
| `employee_id` | 飞书 | 是 | 稳定人事唯一键；账号匹配唯一依据 |
| `employee_name` | 飞书 | 否 | 仅脱敏日志 |
| `mobile` | 飞书 | 否 | 仅创建/更新必要时注入，日志脱敏 |
| `effective_at` | 飞书或规则 | 否 | 离职生效与延时删除计算依据 |
| `trace_id` | 事件中心 | 是 | 串联触发器、流程、账号审计 |

### 4.2 状态机与安全动作

| 事件 | 当前账号状态 | 动作 | 终态 | 禁止条件 |
|---|---|---|---|---|
| 入职 | 无账号 | 创建 | `ACTIVE` | 缺 `employee_id` 或凭证无效 |
| 入职 | `DISABLED` | 恢复 | `ACTIVE` | 供应商不支持恢复时按创建策略确认 |
| 入职 | `ACTIVE` | 幂等成功 | `ACTIVE` | 无 |
| 离职 | `ACTIVE` | 停用 | `DISABLED` | 无匹配账号时不操作其他账号 |
| 离职 | `DISABLED` | 幂等成功 | `DISABLED` | 无 |
| 删除到期 | `DISABLED` | 删除 | `DELETED` | 未审批、保留期未到、账号映射不确定、滴滴阻断条件存在 |

- 幂等键：`event_id + lifecycle_action`；延时删除任务另加 `rule_version + account_id + effective_date`。
- 事件触发器只负责 `事件 + 过滤 → 已发布流程`；步骤、重试和审批只在流程中配置。
- 历史账号盘点/导入不在当前范围；映射不确定时停止并告警，绝不自动删除。

## 5. 错误码与状态矩阵

| 错误码 / 状态 | 用户文案 | 是否可重试 | 下一步 |
|---|---|---:|---|
| `CREDENTIAL_INVALID` | 凭证无效，请检查应用凭证 | 否 | 更新凭证后重新校验 |
| `PERMISSION_DENIED` | 当前应用缺少所需授权 | 否 | 查看授权说明 |
| `REQUIRES_TEST_PARAMETERS` | 需要补充测试样例参数 | 否 | 配置业务参数 |
| `THIRD_PARTY_UNAVAILABLE` | 第三方服务暂不可用 | 是 | 自动重试 / 查看诊断 |
| `RATE_LIMITED` | 调用频率受限 | 是 | 限流退避重试 |
| `NO_DATA` | 未查询到匹配数据 | 否 | 记录结果，不视为失败 |
| `SKIPPED_MISSING_KEY` | 缺少关联键，未处理该记录 | 否 | 查看源数据质量 |
| `FAILED_AMBIGUOUS_OFFER` | 匹配到多个 Offer，等待规则确认 | 否 | 人工确认选择策略 |
| `ASSET_WRITE_REJECTED` | 目标资产拒绝写入 | 视原因 | 查看字段/权限/主键冲突 |
| `ACCOUNT_NOT_FOUND` | 未找到对应外部账号 | 否 | 记录审计，不执行删除 |
| `ACCOUNT_MAPPING_UNCERTAIN` | 账号映射不确定 | 否 | 停止动作并人工处理 |

## 6. 脱敏 Mock 样例与验收脚本

- 机器可读 Mock：`contracts/x0201-contract-mock-samples.json`。
- UI 基线：`ui-blueprints/ucp-existing-module-boundary-wireframes-v1.3.html`。

### 演示脚本 A：待入职人员 Offer 薪酬补全

1. 在数据连接中选择已配置北森来源、已启用飞书招聘 Offer 能力和目标数据仓库资产。
2. 在流程设计器创建或打开“待入职人员入仓及 Offer 薪酬补充”模板。
3. 试运行 Mock 批次：一条成功、一条无 Offer、一条缺投递记录 ID `application_id`。
4. 查看运行中心：三条记录均有 `record_key`、`trace_id` 和终态；无 Offer/缺键不被误报为权限问题。
5. 查看数据仓库：无需任何新配置，既有资产目录出现目标资产及写入结果；原始北森字段未被覆盖。

### 演示脚本 B：飞书入离职到企业滴滴

1. 在数据连接中打开已发布的“企业滴滴账号生命周期”流程模板，并确认事件触发器绑定飞书员工事件。
2. 投递入职 Mock：无账号员工创建滴滴账号；重复同一 `event_id` 不重复创建。
3. 投递离职 Mock：账号先停用；删除条件未满足时不删除。
4. 模拟映射不确定：流程进入失败/死信，账号不被删除。
5. 从事件详情跳转到触发器、流程运行、账号审计，验证 `event_id` 与 `trace_id` 串联。

## 7. X0201 验收清单

- [x] Connector Package、AdapterDefinition、UcpResource、DataSource、WarehouseAssetSink 的责任和兼容关系已明确。
- [x] 北森→飞书 Offer→资产写入的数据字段、幂等、冲突、失败和脱敏规则已冻结。
- [x] 飞书事件→滴滴生命周期的数据字段、状态机、删除安全条件和幂等规则已冻结。
- [x] 通用 Pipeline 组件、状态矩阵、错误码和 Mock 样例已提供。
- [x] 五页静态 UI 蓝图已提供，且不要求数据仓库新增交互。
- [x] 与旧实施计划的优先级和兼容策略已明确。
- [x] 两条可复现验收演示脚本已提供。

## 8. 上线前外部配置清单（不阻断后续开发）

- 飞书招聘正式 App ID/App Secret、所需 Scope、测试租户和脱敏响应样例。
- 企业滴滴正式地址、认证/签名、创建/停用/删除限制、限流、测试租户。
- 北森待入职报表字段名、Report ID、分页/增量策略和目标资产权限。
- 薪酬字段的业务授权人、展示范围和保留周期。

以上项目属于环境配置与联调门禁；未提供时仅使用 Mock 完成开发和测试，禁止宣称生产接口已验证。
