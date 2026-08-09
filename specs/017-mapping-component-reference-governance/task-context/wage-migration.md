# 工资费用类型迁移上下文包

## 任务

B0501-B0508。必须串行；仅在 Warehouse adapter、`reference_lookup` 插件和 DWD 重算通过后开始。

## 前置

- W0201-W0211 已验收。
- M0112 已验收。
- Q0602 的 Warehouse 回归已通过。

## 必读

- `../spec.md` §4.7、§7.3
- `../testing-acceptance.md` §6
- `../code-status-review-and-revision-decision.md` §9
- `hr-portal/backend/app/datasources/sync_service.py`
- `hr-portal/backend/tests/test_sync_service_entity.py`

## 允许修改

- `hr-portal/backend/app/datasources/sync_service.py`
- `hr-portal/backend/app/mapping/wage_dual_run.py`（新增）
- `hr-portal/backend/app/warehouse/service/standardization.py`
- `hr-portal/backend/app/warehouse/router.py`
- `hr-portal/backend/tests/test_wage_mapping_dual_run.py`（新增）
- `hr-portal/backend/tests/test_sync_service_entity.py`
- `hr-portal/backend/tests/test_warehouse_mapping_adapter.py`
- `hr-portal/frontend/src/views/warehouse/WarehouseDataRecipe.vue`
- `hr-portal/frontend/src/views/warehouse/WageMappingCutover.vue`（仅主代理批准后新增）

## 禁止修改

- 在 B0501-B0506 阶段删除或改变 Legacy `LOOKUP_FIELDS` 结果。
- 写 `expense_type` 回 ODS。
- 修改 `emp_monthly_cost_class` 原始业务含义。
- 绕过 DWD、血缘或重算服务。

## 输入合同

旧行为：工号优先→甲方→默认“工资”，由 `LOOKUP_FIELDS`、`build_lookup_maps`、`apply_lookups_to_row` 实现。

新行为：`reference_lookup` 规则集，受控参考数据集 `emp_monthly_cost_class`，DWD 生成 `expense_type`。

## 输出合同

1. B0501-B0504：旧和新 evaluator 同时存在，均可对同一输入批计算。
2. 差异以稳定业务主键输出，分类为工号命中、甲方命中、默认、重复键、空值。
3. 重复同结果 warning；重复异结果阻断发布。
4. B0505：仅灰度读取/使用 DWD 新结果，不删除旧逻辑。
5. B0506：可立即切回旧逻辑。
6. B0507：确认 ODS 不再生成 `expense_type`，DWD 元数据和血缘正确。
7. B0508：仅在主代理确认所有证据后删除工资专用旧逻辑。

## 测试合同

Given：工号命中、仅甲方命中、均未命中、空工号、空甲方、重复同结果、重复异结果、前导零工号。

When：旧 evaluator、新 evaluator、DWD 重算、灰度开关、回滚开关。

Then：逐行业务键结果一致或记录明确差异；ODS 无 `expense_type` 写入；DWD 可重复重算；回滚恢复旧结果；删除旧逻辑前无未解释差异。

## 完成证据

- 双跑差异报告；
- 分类别计数；
- 灰度和回滚演练日志；
- ODS/DWD 字段查询；
- 血缘和重算记录；
- 主代理确认后才删除 Legacy 逻辑。

## 阻塞条件

- 业务主键不明确；
- 现有历史数据无法比对；
- 新旧结果有未解释差异；
- 重算不是幂等；
- 需要先改参考数据质量。
