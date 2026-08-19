# 统一数据映射组件与调用方改造

> 状态：Draft for Development<br>
> 编写日期：2026-07-31<br>
> 首个真实实例：`emp_monthly_salary.expense_type`<br>
> 第二个真实实例：成本中心默认自映射与例外覆盖

## 0. 开发执行入口

实现以 `atomic-tasks.md` 为唯一任务清单，以 `ui-interaction.md` 为 UI 验收依据，以 `testing-acceptance.md` 为测试依据。开始前遵守 `START_HERE.md`，涉及数据仓库/UCP 时同时遵守 012、011 和成本分摊入仓文档的边界。

## 1. 背景与目标

### 1.1 现状问题

当前系统存在多套语义相同但实现分散的数据转换：数据仓库数据清洗中的 `value_map`、ODS→DWD 标准化规则、数据连接/流程编排中的字段转换、UCP `TRANSFORM`、`WAREHOUSE_ASSET_SINK`、PushTarget，以及 `emp_monthly_salary` 同步阶段的费用类型跨表 Lookup。

实际代码中，`emp_monthly_salary.expense_type` 由 `sync_service.py` 的 `LOOKUP_FIELDS` 驱动：先按工号匹配，再按甲方匹配，最后默认为“工资”。这是一种可配置的数据映射规则，不应继续作为同步代码特例。

### 1.2 目标

1. 建设统一 Data Mapping Component，统一规则 DTO、编辑、校验、预览和执行契约。
2. 支持字段映射、枚举映射、优先级 Lookup、默认值、例外覆盖、类型/格式和多字段转换。
3. 让数据清洗中的现有枚举映射改为调用组件，保留 API/配置兼容。
4. 将流程编排原“字段转换”节点升级为“数据映射”节点，调用同一组件。
5. 让 UCP `TRANSFORM`、`WAREHOUSE_ASSET_SINK`、PushTarget 通过适配器调用组件，不强行统一各自存储格式。
6. 将工资费用类型从同步硬编码迁移到 ODS→DWD 数据映射，ODS 不写入该派生字段。
7. 支持成本中心默认自映射、少量例外覆盖、规则版本生效范围、发布、DWD 门禁和通知；ODS 月度字段继承不属于映射组件。
8. 保持未绑定规则资产、旧 UCP Pipeline、旧 PushTarget 和既有 ODS→DWD 行为兼容。

### 1.3 非目标

- 不建设独立“参考映射”左侧模块或独立运行时服务。
- 不把所有调用方数据迁移到一张公共业务表；公共化的是组件契约和规则能力。
- 不允许 SQL、脚本、任意表达式、任意物理表名或不可解释的自动发布。
- 不将连接器凭证、Pipeline 编辑器、流程执行器迁入数据仓库。
- 不允许 DWD 规则执行回写 ODS。
- 首期不实现任意多表自由 Join；Lookup 只能访问已授权、已注册、字段白名单内的参考数据集。

## 2. 统一概念与职责

| 概念 | 定义 | 示例 |
|---|---|---|
| Data Mapping Component | 编辑、校验、预览、执行的通用能力 | `MappingWorkspace`、`MappingExecutor` |
| Mapping Rule Set | 可复用、可版本化的规则配置 | 工资费用类型、成本中心规则 |
| Mapping Dataset | 被 Lookup 的受控参考数据 | `emp_monthly_cost_class`、成本中心标准表 |
| Mapping Node | 在业务流程中的调用节点 | 数据清洗映射步骤、流程编排数据映射节点 |

```text
数据连接：连接、凭证、资源、读取/发送数据
流程编排：触发、顺序、条件、重试、执行记录、入库动作
数据映射组件：按规则将输入数据转换为输出数据
数据清洗：ODS→DWD 规则组合、目标表、层级、安全门禁
UCP/PushTarget：各自保留资源、动作、Pipeline、推送契约
```

流程编排不再把“字段转换”视为另一套能力；原节点改为“数据映射节点”，保留旧节点类型的兼容读取和渐进迁移。

## 3. 用户场景与功能范围

| 角色/入口 | 操作 | 结果 |
|---|---|---|
| 数据仓库→数据清洗 | 配置 ODS→DWD 数据映射 | 生成 DWD 标准化结果 |
| 数据连接→流程编排 | 添加数据映射节点 | 外部数据按规则进入下一节点/目标资产 |
| 工资规则维护人 | 配置工号优先、甲方其次、默认工资 | DWD 生成 `expense_type`，ODS 不改变 |
| 成本中心维护人 | 配置默认自映射与少量例外的规则版本及生效范围 | DWD 和流程按生效版本处理成本中心编码 |
| UCP/PushTarget 管理员 | 使用嵌入式公共映射编辑器 | 保持旧配置兼容 |

本期功能：公共组件、字段/值/Lookup/例外映射、优先级与命中策略、规则集版本发布、数据清洗接入、流程编排接入、UCP/PushTarget 适配、工资迁移、成本中心周期规则和 DWD 门禁。不做脚本/任意 Join。

## 4. 技术设计

### 4.1 架构

```text
components/data-mapping/
  ├─ MappingWorkspace
  ├─ MappingRuleDraft / MappingRuleSet
  ├─ MappingValidator / MappingPreviewer / MappingExecutor
  └─ adapters: warehouse_cleaning / workflow / ucp / sink / pushtarget

warehouse/data_cleaning/：ODS→DWD、层级、安全门禁、目标表
workflow/：触发、节点顺序、重试、入库、执行记录
mapping_catalog/：规则集版本、参考数据、依赖、发布事件
```

组件不拥有业务表、流程执行、凭证、通知接收人或 UCP Pipeline。

### 4.2 规则类型

#### 字段映射

```json
{"type":"field","source_field":"employee_no","target_field":"employee_id","config":{"mode":"rename"}}
```

一个来源映射到一个目标；来源、目标必须来自 caller field catalog。Warehouse adapter 对应 `rename` 或受控字段投影。

#### 显式枚举映射

```json
{"type":"value_map","source_field":"employment_status","target_field":"employee_status","config":{"mappings":{"在职":"active","离职":"inactive"},"unmapped_behavior":"reject"}}
```

#### 可配置优先级 Lookup

```json
{
  "type":"reference_lookup",
  "reference_asset":"emp_monthly_cost_class",
  "output":{"expense_type":"cost_classification"},
  "rules":[
    {"priority":10,"source_field":"employee_no","reference_field":"value","conditions":{"field_type":"工号"},"on_match":"use_and_stop"},
    {"priority":20,"source_field":"client","reference_field":"value","conditions":{"field_type":"甲方"},"on_match":"use_and_stop"}
  ],
  "unmatched_behavior":{"action":"set_default","value":"工资"}
}
```

优先级、来源字段、参考字段、固定条件和命中动作均由组件前端配置并由后端校验；后端不得将“工号优先于甲方”写成业务特例。

#### 默认值与例外覆盖

```json
{"type":"identity_with_overrides","source_field":"cost_center_code","target_field":"standard_cost_center_code","config":{"default_behavior":"keep_source","overrides":{"CC003":"CC100","CC027":"CC205"},"unmapped_behavior":"reject"}}
```

未配置的自映射项不产生冗余规则行；预览仍展示实际生效结果。

#### 类型转换

```json
{"type":"type_convert","source_field":"headcount_text","target_field":"headcount","config":{"target_type":"number","on_error":"reject"}}
```

只允许 caller policy 登记的受控标量类型和失败策略，不接受表达式。

#### 格式转换

```json
{"type":"format","source_field":"cost_period","target_field":"cost_period","config":{"format":"yyyy_mm_to_yyyymm","on_error":"reject"}}
```

支持日期、大小写、trim、补齐、截断、受控正则和单位换算子类型。Warehouse adapter 可转换为 `format_standardize` 或 `unit_convert`。

#### 拆分与合并

```json
{"type":"split_merge","source_fields":["first_name","last_name"],"target_fields":["employee_name"],"config":{"action":"merge","delimiter":""}}
```

必须校验字段数量、目标重复、循环、空值策略和主键保护。

#### 与 012 规则类型的关系

| 公共规则 | Warehouse 权威表达 |
| --- | --- |
| `field` | `rename` / 字段投影 |
| `value_map` | `value_map` |
| `reference_lookup` | `reference_lookup` |
| `identity_with_overrides` | `identity_with_overrides` |
| `type_convert` | `type_convert` |
| `format` | `format_standardize` / `unit_convert` |
| `split_merge` | `split_merge` |

012 的 `deduplicate`、`null_handling` 继续作为数仓专属清洗类型保留。

### 4.3 公共 Mapping DTO v1（冻结合同）

公共合同固定使用 `mappingSchemaVersion: 1`，JSON 字段名统一为 camelCase。`mappingSchemaVersion` 与 UCP 旧 `mapping.version=1` 是两个独立版本域，禁止互相代用。

```ts
type MappingDocumentV1 = {
  mappingSchemaVersion: 1
  ruleSet: {
    code: string
    name: string
    sourceAsset?: string
    targetAsset?: string
    sourceSchemaHash: string
    targetSchemaHash: string
    rules: MappingRuleV1[]
  }
}

type MappingRuleBase = {
  id: string
  type: 'field'|'value_map'|'reference_lookup'|'identity_with_overrides'|'type_convert'|'format'|'split_merge'
  enabled: boolean
  displayOrder: number
  sourceFields: string[]
  targetFields: string[]
}
```

`MappingRuleV1` 必须是按 `type` 判别的联合类型；公共基础字段不设通用 `priority`。执行顺序分为：规则按 `displayOrder`；`reference_lookup.config.matchRules` 内部按 `priority`；Warehouse 专属清洗阶段顺序由 012 adapter 负责。

规则类型配置约束（公共 DTO v1）：

- `field`：`mode` 必须为 `rename` 或 `copy`。
- `value_map`：必须包含 `mappings`、`unmatched`；`unmatched` 只能为 `keep`、`set_default`、`set_null`、`flag`、`reject`；`set_default` 时必须提供 `defaultValue`。
- `reference_lookup`：必须包含 `referenceDatasetId`、`outputMap`、`matchRules`、`unmatched`；每条 `matchRules` 必须包含 `id`、`priority`、`sourceField`、`referenceField`、受控 `conditions` 和 `onMatch`。
- `identity_with_overrides`：必须包含 `defaultBehavior: keep_source`、`overrides` 和 `unmatched`。
- `type_convert`：必须包含 `targetType` 和 `onError`；`onError` 只能为 `keep`、`set_null`、`flag`、`reject`。
- `format`：必须包含 `formatType`、`options` 和 `onError`；`formatType` 只能来自注册表。
- `split_merge`：必须包含 `action`、`delimiter` 和 `nullBehavior`；`action` 只能为 `split` 或 `merge`。

公共响应固定为：

```ts
type MappingCompatibilityV1 = {
  sourceFormat: string
  readable: boolean
  writable: boolean
  requiresMigration: boolean
  lossyFields: string[]
  unknownFields: Record<string, unknown>
}

type MappingResultV1 = {
  outputRows: Record<string,unknown>[]
  trace: {rowIndex:number; ruleId:string; outcome:'matched'|'unmatched'|'skipped'|'error'; referenceKey?:unknown; before?:unknown; after?:unknown; errorCode?:string}[]
  stats: {input:number; output:number; matched:number; unmatched:number; errors:number}
  errors: {code:string; message:string; rowIndex?:number; ruleId?:string; field?:string}[]
}
```

未知字段必须进入 `unknownFields` 原样保留。若 adapter 不能无损回写，则 `writable=false`、`requiresMigration=true`，后端返回 `MAPPING_LOSSY_WRITE_BLOCKED`，禁止保存。

### 4.3.1 UCP legacy v1 与公共 v1（冻结合同）

- 现有 `config.mapping.version=1` 正式命名为 **UCP Transform Legacy v1**，结构和语义永久冻结，只表达标量 `field` 映射及 `strict/mapped_plus_same_name`。
- 新公共文档存入调用方配置的 `mapping_component` 字段，不覆盖旧 `mapping`；格式为 `MappingDocumentV1`。
- legacy 节点首次打开：adapter 生成公共 DTO 和 `legacy_mapping_snapshot`；未保存前不改原配置。
- 仅含 `field` 且可无损回写时，可继续以 `storageMode:'legacy_v1'` 保存旧结构。
- 一旦使用其余六类规则，必须显式确认迁移为 `storageMode:'component_v1'`；保留只读 `legacy_mapping_snapshot`，运行时只执行 `mapping_component`，不得双执行。
- 回滚到 legacy 仅在当前文档可无损降级为 legacy v1 时允许；否则返回 `MAPPING_LEGACY_DOWNGRADE_UNSUPPORTED`。
- 公共 DTO 的后续变更只允许新增 `mappingSchemaVersion:2`；v1 字段含义不得原地改变。

### 4.3.2 Caller Policy v1（冻结合同）

`MappingCallerPolicyV1` 是公共组件接收调用方差异的唯一入口；调用方不得通过隐藏字段绕过 policy。所有字段引用仍需经过服务端元数据和权限校验。

```ts
type MappingCaller = 'warehouse'|'workflow'|'ucp_transform'|'warehouse_sink'|'push_target'
type MappingCallerPolicyV1 = {
  caller: MappingCaller
  allowedRuleTypes: Array<'field'|'value_map'|'reference_lookup'|'identity_with_overrides'|'type_convert'|'format'|'split_merge'>
  source: { assetId?: string; schemaHash: string; allowedFieldIds: string[] }
  target: { assetId?: string; schemaHash: string; allowedFieldIds: string[]; readonlyFieldIds: string[]; protectedKeyFieldIds: string[] }
  referenceLookup: { allowedDatasetIds: string[]; allowedFieldIds: string[]; maxRules: number }
  effects: { allowPreview: boolean; allowSave: boolean; allowPublish: boolean; allowExecute: boolean; allowRebuild: boolean }
  legacy: { sourceFormat?: string; allowLegacyRead: boolean; allowLegacyWrite: boolean; allowMigration: boolean }
  metadata: { policyVersion: 1; permissionScope: string; issuedAt: string }
}
```

调用方固定矩阵：

| caller | `permissionScope` | 规则范围 | 业务副作用归属 |
|---|---|---|---|
| `warehouse` | `warehouse.modeling` | 七类公共规则 + 012 数仓专属规则 | Warehouse DWD 写入、血缘、重算 |
| `workflow` | `ucp.pipelines` | 七类，由节点 Schema policy 限制 | Workflow/UCP 顺序、条件、重试、执行记录 |
| `ucp_transform` | `ucp.pipelines` | UCP Legacy v1 可表达类型或 Component v1 | UCP Pipeline |
| `warehouse_sink` | `ucp.pipelines` + Sink 资产权限 | 七类中不违反 Sink 白名单/主键/期间者 | `WarehouseAssetSink` 写入事务 |
| `push_target` | `warehouse.service` | 七类中被目标 Schema 和发送策略允许者 | PushTarget 凭证、调度和发送 |

Policy 校验失败必须返回稳定错误码：`MAPPING_CALLER_UNSUPPORTED`、`MAPPING_RULE_TYPE_FORBIDDEN`、`MAPPING_ASSET_FORBIDDEN`、`MAPPING_FIELD_FORBIDDEN`、`MAPPING_REFERENCE_DATASET_FORBIDDEN`、`MAPPING_TARGET_FIELD_PROTECTED`、`MAPPING_EFFECT_FORBIDDEN`、`MAPPING_SCHEMA_CHANGED`。调用方权限不足返回 HTTP 403；规则或配置不合法返回 HTTP 422；并发版本冲突返回 HTTP 409。

### 4.4 校验与执行

- 资产、字段和参考字段只能来自已注册元数据白名单。
- 优先级、冲突策略、命中即停/继续、未命中策略必须持久化并可回显。
- 参考键重复、目标字段重复、主键覆盖、类型不兼容、循环映射阻止发布。
- 未命中支持保留原值、默认值、置空、标记异常、拒绝。
- 预览返回原值、命中规则、参考键、结果和错误原因。
- 执行器批量预加载参考数据，禁止逐行 N+1 查询。
- 组件不修改 ODS；DWD/流程输出由调用方写入。

### 4.5 数据仓库数据清洗改造

```text
ODS 数据变更 → ODS→DWD 自动化配置 → warehouse_cleaning adapter → MappingExecutor → DWD
```

现有 `value_map` 双读并转换为统一 DTO；`WarehouseDataRecipe.vue` 的“枚举映射”改为统一“数据映射”步骤。目标仍须是 DWD，未绑定规则的资产保持原行为。

### 4.6 数据连接/流程编排改造

```text
数据连接获取数据 → 流程编排 → 数据映射节点 → 条件/质量校验 → 入库/发送
```

旧字段转换节点兼容读取；编辑时可升级为数据映射节点。流程引擎负责上下文、顺序、重试和节点结果，不复制映射执行逻辑。

### 4.7 工资费用类型迁移

当前 `sync_service.py` 中 `LOOKUP_FIELDS['emp_monthly_salary']` 的工号/甲方/默认工资规则迁移为 `reference_lookup` 规则集：

```text
ODS emp_monthly_salary（原始字段，不生成 expense_type）
  → ODS→DWD cleaning_rule
  → 费用类型 Mapping Rule Set
  → DWD expense_type
```

必须逐行比对新旧结果；切换后移除同步阶段硬编码，重新计算接口也调用统一执行器。`emp_monthly_cost_class` 保留为受控参考数据集。

### 4.8 成本中心

成本中心只是在 Warehouse caller 中使用 `identity_with_overrides` 的一个实例：默认源编码透传，少量例外覆盖。组件不内置 `cost_center_tree`、名称、组织属性、期间快照或复制上月逻辑。

需要标准名称、组织属性或其他派生字段时，由调用方在同一规则集内显式增加 `reference_lookup`，并从元数据白名单选择参考数据集、输入字段和输出字段；该规则是可选组合，不能成为默认自映射的隐式依赖。

规则集版本通过 caller binding 的生效范围选择。DWD 处理某个期间时读取该期间命中的已发布版本并直接执行；新出现的源编码自动走默认透传，不需要初始化期间、复制上月、对新增编码逐项确认或保存默认行。只有业务确实需要在特定期间变更例外时，才创建新规则版本并设置生效范围。

ODS 月度表同步中保留本地维护字段、复制上月值或默认值的行为，属于 ODS 同步/展示模型职责，必须与映射规则版本、例外和发布状态隔离。DWD 门禁、重算、审计和通知仍由 Warehouse caller 在通用规则版本发布后处理，不新增独立映射模块。

### 4.9 依赖、事件与 UCP

规则集/参考数据发布不能只等下一次 ODS 拉取。记录规则集→清洗配置→DWD/流程节点→目标资产依赖，并发出 `mapping_rule_set_published`、`mapping_dataset_changed`、`mapping_dependency_rebuild_required`、`dwd_data_refreshed`。按调用方策略自动重算、人工确认或阻断。

UCP `TRANSFORM`、`WAREHOUSE_ASSET_SINK`、PushTarget 通过 adapter 使用统一组件，保持各自资源、主键、期间、推送、Pipeline 和存储契约；旧 JSON、旧 `field_mappings` 双读。

## 5. 数据模型与接口

### 5.1 持久化边界（冻结合同）

1. ODS→DWD 规则正文只使用 `standardization_rules`。
2. 公共层不新增规则正文表；只新增或复用以下元数据：规则集目录、不可变版本、调用方绑定、依赖、发布审计和重算运行记录。
3. 优先复用现有 `warehouse_model_versions` 保存 Warehouse 规则集发布快照，新增 `mapping_bindings`、`mapping_dependencies`、`mapping_publish_audits`、`mapping_rebuild_runs`；若现有表无法表达 caller/adapter 字段，再新增最小专用表，不复制规则正文。
4. `mapping_rule_set_catalog` 只保存规则集身份、当前版本、状态和 owner；`mapping_rule_set_versions` 只保存版本元数据及 `standardization_rule_ids` 或调用方配置引用，不保存第二份 ODS→DWD 规则正文。
5. 版本采用 append-only：已发布版本不可原地修改；草稿更新必须携带 `expectedVersion`，不一致返回 HTTP 409 和 `MAPPING_VERSION_CONFLICT`。
6. 绑定快照必须保存 `mappingSchemaVersion`、来源/目标 Schema hash、adapter、storageMode 和兼容状态；发布、回滚、重算均写审计。
7. Workflow、UCP、Sink、PushTarget 迁移期继续保留各自配置；公共 DTO 只通过 adapter 读写。
8. 调用方可为 binding 增加生效范围等业务元数据；该元数据只用于选择已发布规则版本，不得复制规则正文、默认行或 ODS 月度快照。

### 5.2 公共 API

```text
POST /api/v1/data-mappings/validate
POST /api/v1/data-mappings/preview
GET  /api/v1/data-mappings/datasets
GET  /api/v1/data-mappings/dependencies/{binding_id}
POST /api/v1/data-mappings/bindings/{id}/publish
POST /api/v1/data-mappings/bindings/{id}/rebuild-dependencies
```

公共 API 不取代所有调用方 CRUD。数据清洗标准化规则、ODS→DWD 自动化配置、流程节点、UCP 和 PushTarget API 保持兼容，由 adapter 双读和无损回写。无法无损回写时返回明确兼容状态并阻断保存。

## 6. 权限、安全、通知与验收

- 规则集使用 `warehouse.mapping.V/C/U/P`；调用方仍需各自权限，前端隐藏不替代后端 403。
- 过渡期权限映射冻结为：Warehouse 继续沿用 `warehouse.modeling.V/C/U/D`；Workflow/UCP/Sink 沿用 `ucp.pipelines.V/C/U/D` 并叠加 Sink 资产权限；PushTarget 沿用 `warehouse.service.V/C/U/D`。新增 `warehouse.mapping` 仅用于公共规则集目录、版本、发布和依赖 API，不替代调用方既有 RBAC。
- `warehouse.mapping.P` 仅允许发布/回滚公共规则集绑定；调用方实际保存、执行、写入或发送仍需通过各自 `U/C` 权限。
- 规则引用不能绕过资产/字段权限；日志和事件不输出凭证、secret、完整工资 payload 或未授权值。
- 通知复用 Automation Rule、模板和 `feishu_send_message`，组件不直接调用飞书客户端。
- 数据清洗枚举映射、流程编排字段转换、UCP、PushTarget 共用同一组件。
- 工资规则可由 UI 配置工号优先、甲方其次和默认工资，调序无需改代码。
- 工资 `expense_type` 不进入 ODS，只在 DWD 生成；新旧结果逐行一致。
- 100 个成本中心默认自映射时只维护少量例外，DWD 按期间命中的已发布规则版本得到正确结果；组件不要求固定成本中心参考树。
- 规则发布可查看依赖并触发重算/待确认/阻断。
- 未绑定资产、旧 Pipeline、旧 PushTarget 配置保持兼容。
- 组件、调用方、权限、安全、迁移、构建和通知测试通过。

## 7. 风险、分阶段交付与完成定义

### 7.1 风险

| 风险 | 等级 | 应对 |
|---|---|---|
| 组件与执行边界混淆 | 高 | 组件只映射；清洗/流程/Sink/PushTarget 负责生命周期和副作用 |
| ODS→DWD 出现双规则事实源 | 高 | 规则正文只写 `standardization_rules` |
| 公共 DTO 与 UCP v1 混淆 | 高 | 公共 schema version 独立命名；v1 通过 adapter 兼容 |
| 七类与 012 10 类枚举漂移 | 高 | 以 012 r0101 为数仓权威并维护类型矩阵 |
| 统一组件演变为调用方 fork | 高 | 单一插件注册表和复用测试门禁 |
| adapter 只读不能无损回写 | 高 | 未知字段保留；有损时阻断保存 |
| 工资迁移结果变化 | 高 | 新旧逐行比对、灰度、回滚后再移除旧逻辑 |
| Lookup 键重复 | 高 | 同结果 warning、异结果阻断发布 |
| 发布后 DWD 未重算 | 高 | 依赖图、事件、独立重算状态 |
| 动态字段注入 | 高 | 元数据白名单、权限和标识符校验 |

### 7.2 分阶段交付

阶段拆分只决定实施顺序，不改变首期必须交付七类规则和全系统统一 Workspace 的范围：

1. 合同冻结、公共 DTO schema version、类型和 adapter 矩阵。
2. `MappingWorkspace` 外壳、插件注册表、caller context/policy、adapter SDK。
3. 七类规则插件全部完成 DTO、UI、校验、预览、执行和序列化。
4. Warehouse adapter 与 012 对齐，规则正文只写 `standardization_rules`。
5. Warehouse、Workflow、UCP v1、Sink、PushTarget 依次嵌入同一 Workspace。
6. 工资 `expense_type` 双跑、差异、灰度、回滚和切换。
7. 成本中心周期生命周期和其他真实实例。
8. 兼容收敛与首期总验收。

### 7.3 首期完成定义

- 七类规则全部完成，不存在降期项。
- 五类调用方均使用同一 `MappingWorkspace`。
- ODS→DWD 只有 `standardization_rules` 一个规则正文事实源。
- UCP v1、Sink、PushTarget 旧格式可读、可执行、可回显、可无损保存。
- 工资逐行一致并完成回滚演练，ODS 停止生成 `expense_type`。
- 成本中心默认自映射只保存例外，周期发布和 DWD 门禁闭环。
- 组件、调用方、权限、安全、迁移、构建和通知测试通过。

```markdown
## 017 统一数据映射组件交付说明
- 已完成任务：...
- 未完成任务：...
- 修改文件：...
- 七类规则和统一 MappingWorkspace 证据：...
- Adapter 与旧配置回归：...
- 工资新旧结果比对与回滚：...
- 成本中心默认自映射/例外覆盖证据：...
- DWD 重算、血缘、审计与通知证据：...
- 前端构建、后端测试、风险：...
```
