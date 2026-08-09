# Warehouse Adapter 上下文包

## 任务

W0201-W0211。必须串行完成；这是共享高冲突任务，需主代理合并。

## 前置

- A0001-A0009、M0101-M0124、七类插件已验收。
- 012 `r0101-rule-scope-decision.md` 已同步为 10 类权威枚举。

## 必读

- `../spec.md` §4.5、§5.1、§6
- `../../012-data-warehouse-ucp-integration/r0101-rule-scope-decision.md`
- `../../012-data-warehouse-ucp-integration/spec.md` ODS→DWD 章节
- `hr-portal/backend/app/warehouse/models.py`
- `hr-portal/backend/app/warehouse/schemas.py`
- `hr-portal/backend/app/warehouse/standardization_engine.py`
- `hr-portal/backend/app/warehouse/service/standardization.py`
- `hr-portal/backend/app/warehouse/router.py`
- `hr-portal/frontend/src/views/warehouse/WarehouseDataRecipe.vue`
- `hr-portal/frontend/src/api/warehouse.ts`

## 允许修改

- `hr-portal/backend/app/mapping/adapters/warehouse_standardization.py`（新增）
- `hr-portal/backend/app/warehouse/models.py`
- `hr-portal/backend/app/warehouse/schemas.py`
- `hr-portal/backend/app/warehouse/standardization_engine.py`
- `hr-portal/backend/app/warehouse/service/standardization.py`
- `hr-portal/backend/app/warehouse/router.py`
- `hr-portal/backend/alembic/versions/<new_revision>_standardization_mapping_types.py`（新增）
- `hr-portal/backend/tests/test_warehouse_mapping_adapter.py`（新增）
- `hr-portal/backend/tests/test_standardization_engine.py`
- `hr-portal/backend/tests/test_warehouse_standardization.py`
- `hr-portal/frontend/src/views/warehouse/WarehouseDataRecipe.vue`
- `hr-portal/frontend/src/api/warehouse.ts`
- `hr-portal/frontend/src/views/warehouse/WarehouseDataRecipe.spec.ts`（新增或已有）

## 禁止修改

- `sync_service.py` 的工资切换逻辑；该逻辑属于 B0501-B0508。
- UCP、Sink、PushTarget 文件。
- 已有 migration。
- DWS/ADS 逻辑。

## 输入合同

- `MappingDocumentV1` 和 `MappingCallerPolicyV1(caller='warehouse')`。
- 012 10 类：原八类 + `reference_lookup`、`identity_with_overrides`。
- ODS→DWD 规则正文唯一存储于 `standardization_rules`。

## 输出合同

1. Warehouse adapter 双向转换公共 DTO 和 `standardization_rules`，包含旧 `value_map` 对象/数组。
2. `reference_lookup`、`identity_with_overrides` 只在 `standardization_rules` 中持久化；不新增平行正文表。
3. `WarehouseDataRecipe.vue` 实际嵌入公共 Workspace，保留步骤流和 DWD caller policy。
4. executor 只返回结果；`StandardizationRuleService` 仍负责 DWD 写入、元数据、血缘、事务和重算。
5. 原有八类行为不回归；数仓专属 `deduplicate/null_handling/unit_convert` 可继续使用。

## 测试合同

### Given

- 原八类规则 fixture；
- 新 `reference_lookup`、`identity_with_overrides` fixture；
- 旧 `value_map` 对象和数组；
- ODS 样本、DWD 目标、重复参考键和敏感字段；
- 含未知 `rule_config` 属性、未来扩展字段和未知规则类型的兼容 fixture。

### When

- adapter.read/write；
- preview/execute；
- DWD 重建；
- Workspace 保存并重开。

### Then

- 所有 10 类可创建、校验、预览、执行；
- ODS 不被写入；
- 目标只为 DWD；
- 规则正文只存在于 `standardization_rules`；
- 血缘、元数据、重算状态正确；
- 旧规则结果不变；
- 重复异结果阻断发布；
- 未知 `rule_config` 属性和未来字段在 read/save/reopen 后保持 round-trip；无法无损表达时保存被阻断并返回 `MAPPING_LOSSY_WRITE_BLOCKED`。

## 完成证据

- migration upgrade/downgrade；
- 10 类测试结果；
- ODS/DWD 数据前后对比；
- Workspace 真实挂载截图或组件测试；
- `standardization_rules` 查询和无平行表证明；
- 未知字段 round-trip fixture、序列化前后对比，以及有损保存阻断响应（如触发）。

## 阻塞条件

- 012 权威枚举未同步；
- 新类型无法在既有表的 `rule_config` 安全表达；
- DWD 写入需要改 MappingExecutor；
- migration head 冲突。

## 不在范围

- 工资切换；
- 成本中心周期；
- UCP/Sink/PushTarget adapter。
