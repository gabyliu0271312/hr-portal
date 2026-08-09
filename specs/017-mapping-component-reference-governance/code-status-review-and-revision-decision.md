# 017 代码现状评审与修订决策

> 状态：Review Decision / Documentation Baseline  
> 评审日期：2026-08-07  
> 评审范围：017、011、012、成本分摊入仓文档及对应真实代码  
> 开发执行：仍以 `atomic-tasks.md` 为唯一任务清单

## 1. 评审目的

本评审用于确认统一数据映射组件在当前代码基线上的真实起点，处理 017 与既有数据清洗、UCP、PushTarget 和成本分摊入仓合同之间的冲突，并形成后续文档与开发的权威决策。

本评审不改变连接、凭证、Pipeline 编排、资产写入、通知接收人、DWS/ADS 聚合等调用方职责。

## 2. 已确认且不可再推翻的产品决策

1. 首期完整交付 `field`、`value_map`、`reference_lookup`、`identity_with_overrides`、`type_convert`、`format`、`split_merge` 七类公共规则。允许拆阶段开发，但不得把任何一类降为二期。
2. 建设全系统唯一的 `MappingWorkspace` 编辑内核。数据清洗、流程编排、UCP `TRANSFORM`、`WAREHOUSE_ASSET_SINK`、PushTarget 均嵌入同一组件；允许薄包装和 caller policy，不允许长期复制规则编辑器。
3. 统一的是编辑、DTO、校验、预览和执行契约，不强制所有调用方立即迁移为同一数据库表或 JSON。
4. ODS→DWD 规则正文只以 `standardization_rules` 为事实源，不新增平行规则正文表。
5. 工资 `expense_type` 目标口径为 ODS 不写、DWD 派生；切换前必须双跑、逐行比对、灰度和回滚演练。

## 3. 已确认代码现状

### 3.1 数据清洗

当前系统已具备 `standardization_rules`、8 类标准化规则、规则 CRUD、预览、全量执行、DWD 元数据同步、血缘和自动化事件：

- `backend/app/warehouse/models.py`：`StandardizationRule`。
- `backend/app/warehouse/standardization_engine.py`：8 类执行器与批量入口。
- `backend/app/warehouse/service/standardization.py`：CRUD、预览、ODS→DWD 执行、元数据和血缘。
- `backend/app/warehouse/router.py`：现有标准化 API。
- `frontend/src/views/warehouse/WarehouseDataRecipe.vue`：现有步骤式编辑器。

012 的 `r0101-rule-scope-decision.md` 已明确：`standardization_rules` 是 ODS→DWD 全部字段级转换的唯一规则表。

### 3.2 UCP `TRANSFORM`

UCP 已存在 `version=1` Mapping DTO：

- `backend/app/ucp/action_contract.py::validate_mapping` 负责字段目录和类型校验。
- `backend/app/ucp/pipeline_template.py` 要求 `TRANSFORM` 使用版本化 mapping DTO。
- `backend/app/ucp/pipeline_engine.py::_execute_transform_step` 执行 `strict` / `mapped_plus_same_name`。

该 DTO 是既有兼容合同，不得被 017 无版本覆盖。公共 DTO 不能与 UCP 的 `version=1` 含义混淆。

### 3.3 `WAREHOUSE_ASSET_SINK`

Sink 已有独立配置与强约束：

- `target_asset`、`write_mode`、`primary_key`、`field_whitelist`、`batch_key`。
- 已发布资产、字段白名单、复合主键、期间全量快照、批次幂等和事务。
- `backend/app/ucp/warehouse_ingest_transform.py` 提供受控 mapping/transform/validation。
- 写入必须经过 `app.warehouse.asset_sink.WarehouseAssetSink`。

017 只能接管映射编辑和规则执行契约，不能接管或削弱资产写入合同。

### 3.4 PushTarget

PushTarget 当前使用 `field_mappings: [{source,target}]`，由 `backend/app/push/push_service.py::apply_field_mappings` 执行，前端为 `PushFieldMapper.vue`。017 接入必须双读、无损回显和保持旧执行语义。

### 3.5 工资费用类型

当前 `emp_monthly_salary.expense_type` 仍由 `backend/app/datasources/sync_service.py` 的 `LOOKUP_FIELDS` 在同步/重算阶段生成：工号优先、甲方其次、默认“工资”。`build_lookup_maps` 已批量预加载，但重复参考键会被字典静默覆盖。

目标是将该逻辑迁为 DWD `reference_lookup`，而不是简单换一张配置表后继续写 ODS。

### 3.6 成本中心

现有系统有成本中心业务表、月度维护和字段复制能力，但尚无完整的规则集周期、稀疏例外、发布、并发 409、DWD 门禁和通知闭环。成本中心生命周期需要单独实现；公共组件只提供 `identity_with_overrides` 与 Lookup 能力。

## 4. 保留的正确设计

- 数据映射作为公共组件，数据清洗、流程编排、UCP/Sink/PushTarget 作为调用方。
- 不建设独立“参考映射”左侧业务模块。
- 旧配置双读和渐进迁移。
- ODS 保持原始，派生字段只写 DWD/流程输出。
- Lookup 只能访问已注册、已授权、字段白名单内的参考数据集。
- 禁止 SQL、脚本、任意表达式和自由 Join。
- 成本中心默认自映射只保存例外。
- 规则发布需要版本、依赖、影响分析、审计和重算状态。

## 5. 需要修正的问题

### P0-1：ODS→DWD 双事实源风险

017 原稿同时建议 `mapping_rule_sets`、`mapping_rules`，容易与 `standardization_rules` 冲突。最终决策：

- 公共 DTO 是 UI/运行时契约，不天然对应公共规则正文表。
- ODS→DWD 规则正文只写 `standardization_rules`。
- 可新增规则集目录、版本、绑定、依赖、审计、重算元数据，但不得复制 ODS→DWD 规则正文。

### P0-2：DTO 不兼容

当前存在四种结构：

| 调用方 | 现有结构 | 017 处理 |
|---|---|---|
| Warehouse | `rule_type/source_field/target_field/rule_config/display_order` | warehouse adapter 双向转换 |
| UCP TRANSFORM | `version=1/source_field_id/target_field_id/source_kind` | `ucp_transform_v1` adapter |
| Sink | `source/target/transform/required/minimum/maximum` | sink legacy adapter |
| PushTarget | `source/target` | PushTarget legacy adapter |

每个 adapter 必须实现读取、转公共 DTO、校验、执行、回显、无损回写和未知字段保护。只读可执行但不能无损回写时必须禁止保存并解释，不能静默丢字段。

### P0-3：工资迁移缺少切换闭环

必须增加旧 evaluator、新 MappingExecutor、逐行业务键差异、差异分类、灰度开关、回滚开关和切换证据。只有新旧一致且回滚演练通过后，才能停止 ODS 生成并删除 `LOOKUP_FIELDS` 特例。

### P0-4：版本、发布和 caller policy 已冻结

当前 `StandardizationRule` 可直接修改和删除，没有 rule set、不可变版本、schema hash、published_by、乐观锁和 rollback snapshot。017 现已冻结：

- ODS→DWD 规则正文仍只存 `standardization_rules`；优先复用 `warehouse_model_versions` 保存 Warehouse 发布快照。
- 新增最小公共元数据只承载目录、版本、绑定、依赖、发布审计和重算运行，禁止复制规则正文。
- 已发布版本 append-only；草稿更新必须携带 `expectedVersion`，冲突返回 HTTP 409 / `MAPPING_VERSION_CONFLICT`。
- 公共合同固定为 `MappingDocumentV1.mappingSchemaVersion=1`；UCP 现有 `mapping.version=1` 固定命名为 UCP Transform Legacy v1，不能原地扩展。
- `MappingCallerPolicyV1` 是五类调用方唯一 policy 入口；它冻结规则范围、字段白名单/保护字段、参考数据集、效果权限、legacy 策略和权限 scope。
- caller policy 失败返回稳定 `MAPPING_*` 错误码；调用方 RBAC 失败继续返回 HTTP 403。

### P0-5：元数据与动态字段安全

创建、更新和执行均必须后端校验资产层级、字段存在、类型、主键保护、目标重复、循环、Schema drift 和权限。前端资产选择器不构成安全边界。

### P1-1：Lookup 条件和重复键

公共 Lookup 必须支持受控固定条件、优先级和命中动作。参考数据预加载必须识别：重复同结果（warning）、重复异结果（阻断）、空结果和 schema drift，不得静默覆盖。

### P1-2：三种“顺序”必须区分

- 数仓规则阶段顺序：012 标准化类型语义顺序。
- Lookup priority：同一 Lookup 内的业务优先级。
- Workspace display order：规则展示顺序。

不得用一个 `priority` 同时承担三者。

### P1-3：旧 `value_map` 结构不一致

必须兼容对象 mappings 和前端历史数组 `[{from,to}]`，规范化后再执行和回写。

### P1-4：权限命名

现有数据清洗使用 `warehouse.modeling.V/C/U/D`，017 提议 `warehouse.mapping.V/C/U/P`。开发前必须确定权限映射、旧角色迁移和 publish 操作码；前端隐藏不替代后端 403。

### P2-1：成本中心生命周期

周期初始化、复制上月、差异识别、人工确认、发布、并发冲突、门禁和通知属于成本中心规则集业务服务，不应塞入纯 MappingExecutor。

### P2-2：事件和通知

`mapping_rule_set_published`、`mapping_dataset_changed` 等必须定义 payload、幂等键、消费者、重试、审计和通知去重；优先复用已有 `standardization_rule_changed`、`dwd_data_refreshed` 和 Automation Rule。

## 6. 七类公共规则与 012 规则关系

| 017 公共规则 | 012 表达 | 决策 |
|---|---|---|
| `field` | `rename` / 字段投影 | warehouse adapter 使用兼容别名 |
| `value_map` | `value_map` | 直接映射，兼容对象/数组旧格式 |
| `reference_lookup` | `reference_lookup` 扩展类型 | 纳入 `standardization_rules.rule_type` 权威枚举 |
| `identity_with_overrides` | `identity_with_overrides` 扩展类型 | 只存例外，不展开自映射行 |
| `type_convert` | `type_convert` | 直接映射 |
| `format` | `format_standardize` / `unit_convert` | adapter 按受控子类型转换 |
| `split_merge` | `split_merge` | 直接映射 |

012 既有 `deduplicate`、`null_handling` 继续保留为数仓专属清洗规则，不属于七类公共映射插件，也不得被删除。012 权威枚举由原 8 类扩展为 10 类：新增 `reference_lookup`、`identity_with_overrides`。

## 7. 修订后架构

```text
统一 MappingWorkspace
  ├─ 七类规则插件
  ├─ 公共字段目录、校验、预览、命中轨迹
  └─ caller context / policy / compatibility state
                      ↓
公共 Mapping DTO（独立 schema version）/ MappingExecutor
                      ↓
Adapters
  ├─ warehouse_standardization
  │    └─ standardization_rules（ODS→DWD 唯一规则正文）
  ├─ workflow
  ├─ ucp_transform_v1
  ├─ warehouse_asset_sink_legacy
  └─ push_target_legacy
```

允许调用方使用薄包装组件注入上下文、策略、保存和发布动作；不得复制七类规则表单、公共校验、预览和执行逻辑。

## 8. 职责边界

| 能力 | Mapping Component | 调用方 |
|---|---:|---:|
| 七类规则编辑/校验/预览 | 是 | 提供 context/policy |
| 批量参考数据预加载和命中轨迹 | 是 | 提供授权数据访问器 |
| ODS→DWD 写入、血缘、重算 | 否 | Warehouse |
| Pipeline 顺序、条件、重试、执行记录 | 否 | Workflow/UCP |
| Sink 资产、PK、期间、白名单、批次、事务 | 否 | `WAREHOUSE_ASSET_SINK` |
| PushTarget 发送、凭证、错误合同 | 否 | PushTarget |
| 通知接收人 | 否 | Automation/调用方 |

## 9. 工资切换门禁

1. 将工号、甲方、默认工资表达为 `reference_lookup`。
2. 保留旧 `LOOKUP_FIELDS` evaluator。
3. 同一批数据双跑。
4. 按业务主键输出差异，并按工号命中、甲方命中、默认值、重复键、空值分类。
5. 修复差异和参考键冲突。
6. 灰度让 DWD 使用新结果。
7. 验证重算、依赖触发和回滚。
8. 停止 ODS 生成 `expense_type`。
9. 最后删除工资专用 `LOOKUP_FIELDS` 逻辑。

## 10. 分阶段开发

阶段拆分只改变实施顺序，全部完成才构成首期交付：

1. 合同冻结与现状盘点。
2. Workspace 外壳、公共 DTO、插件注册表、caller policy 和 adapter SDK。
3. 七类规则插件全部完成 DTO、UI、校验、预览、执行和序列化。
4. Warehouse adapter 与 012 对齐。
5. Warehouse、Workflow、UCP v1、Sink、PushTarget 依次嵌入同一 Workspace。
6. 工资 `expense_type` 双跑与切换。
7. 成本中心周期规则和其他真实实例。
8. 兼容收敛与首期总验收。

## 11. 评审建议处置

| 原评审建议 | 处置 | 最终决策 |
|---|---|---|
| 首期缩减为三类规则 | 拒绝 | 七类全部首期交付 |
| 不做全系统统一编辑器 | 拒绝 | 单一 `MappingWorkspace` 必建 |
| 使用 adapter 和旧格式双读 | 接受 | 作为兼容主路径 |
| 保持 012 唯一规则表 | 接受 | ODS→DWD 不建平行规则正文表 |
| 工资双跑后切换 | 接受 | 作为删除旧逻辑的强门禁 |
| 拆分开发阶段 | 部分接受 | 只拆顺序，不拆首期产品范围 |

## 12. 文档权威优先级

1. 012 `r0101-rule-scope-decision.md`：ODS→DWD 规则表和枚举权威。
2. 011 `contracts/x0210-warehouse-asset-sink-contract.md`：Sink 写入合同权威。
3. 根目录成本分摊入仓文档：成本分摊事件、期间快照和事务权威。
4. 017 `spec.md`：Mapping Component、Workspace、公共 DTO 和 adapter 权威。
5. 本文：代码现状评审和评审意见处置权威。

出现冲突时必须修订相应权威文档，不能由下位文档单方面覆盖。

## 13. AI 可执行任务包

017 已引入 `ai-execution-protocol.md` 与 `task-context/`。前者冻结多 AI 认领、依赖、文件边界、执行器副作用、错误码、事件、迁移、阻断和交付报告；后者为 Foundation、公共 Core、规则插件、五类调用方、工资、成本中心和质量门禁提供任务上下文包。

`atomic-tasks.md` 是任务索引，不再允许脱离对应上下文包直接交给实现 AI。只有主代理可以审核交付报告并勾选任务。

## 14. 文档与首期验收门禁

- [ ] 017 所有文档完整列出七类首期规则。
- [ ] 所有调用方引用同一 `MappingWorkspace`。
- [ ] ODS→DWD 不存在第二份规则正文。
- [ ] 012 10 类枚举与 017 adapter 矩阵一致。
- [ ] UCP v1、Sink、PushTarget 可读取、执行、回显和无损保存。
- [ ] 未识别旧字段不会静默丢弃。
- [ ] Sink 主键、期间、白名单、批次和事务不被 MappingExecutor 接管。
- [ ] 工资现状始终标为 `sync_service.py::LOOKUP_FIELDS`，目标始终为 DWD 派生。
- [ ] 工资双跑、逐行比对、灰度和回滚证据齐全。
- [ ] 七类均有 DTO、校验、UI、预览、执行和序列化测试。
- [ ] 不存在长期调用方编辑器 fork 或第二套执行器。
- [ ] README、START_HERE、任务和测试文档交叉引用一致。