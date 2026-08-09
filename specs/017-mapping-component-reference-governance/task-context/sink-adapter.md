# Warehouse Asset Sink Adapter 上下文包

## 任务

U0410-U0414。

## 前置

- Foundation、Component Core、Rule Plugins 已验收。
- 011 x0210 合同和成本分摊入仓文档已阅读。

## 必读

- `../spec.md` §4.9、§6
- `../../011-universal-connector-platform/contracts/x0210-warehouse-asset-sink-contract.md`
- `../../HR Portal_接收成本分摊锁定数据入仓开发文档.md`
- `hr-portal/backend/app/ucp/warehouse_ingest_transform.py`
- `hr-portal/backend/app/ucp/pipeline_engine.py`
- `hr-portal/backend/app/ucp/pipeline_template.py`
- `hr-portal/backend/app/warehouse/asset_sink.py`
- `hr-portal/frontend/src/components/ucp/WarehouseAssetSinkConfig.vue`

## 允许修改

- `hr-portal/backend/app/mapping/adapters/warehouse_asset_sink_legacy.py`（新增）
- `hr-portal/backend/app/ucp/pipeline_template.py`
- `hr-portal/backend/app/ucp/pipeline_engine.py`
- `hr-portal/backend/tests/test_sink_mapping_adapter.py`（新增）
- `hr-portal/backend/tests/test_warehouse_ingest_transform.py`
- `hr-portal/backend/tests/test_warehouse_asset_sink.py`
- `hr-portal/frontend/src/components/ucp/WarehouseAssetSinkConfig.vue`
- `hr-portal/frontend/src/components/ucp/WarehouseAssetSinkConfig.spec.ts`

## 禁止修改

- `WarehouseAssetSink` 写入算法。
- 资产已发布校验、主键来源、期间全量快照、孤儿清理、白名单、批次幂等、事务和死信语义。
- 成本分摊 Webhook payload。
- UCP Legacy v1 和 PushTarget。

## 输入合同

- Sink legacy `mapping/transform/validation`；
- `target_asset`、`write_mode`、`primary_key`、`field_whitelist`、`batch_key`；
- `MappingCallerPolicyV1(caller='warehouse_sink')`。

## 输出合同

- Workspace 只替换映射编辑区；资产、PK、期间、白名单和写入模式保持 Sink own form/contract；
- legacy 映射能转公共 DTO、回显、无损回写；
- executor 输出后继续调用 `WarehouseAssetSink`；
- `mapping_component` 不得绕过 template/pipeline 的 Sink 校验。

## 测试合同

Given：已发布周期资产、复合主键、legacy mapping、未知字段、空批次、跨期批次。

When：打开 Workspace、保存、Pipeline 试运行和真实 Sink 写入。

Then：映射结果一致；PK/期间/白名单/批次不变；写入仍经 `WarehouseAssetSink`；非法输入整批回滚；有损回写被阻断。

## 完成证据

- adapter read/write fixture 和 unknown-field 阻断结果；
- Sink 主键、期间、白名单、批次、事务回归测试真实输出；
- Workspace 组件测试证明仅替换映射编辑区；
- `git diff` 证明未修改 Sink 写入算法和保护性语义。

## 不在范围

- 修改 `WarehouseAssetSink` 写入算法、主键、期间、白名单、批次或事务语义；
- 修改成本分摊 Webhook payload、UCP Legacy v1 或 PushTarget 发送合同。

- 实现要求修改 `WarehouseAssetSink` 语义；
- mapping_component 需要覆盖 primary_key 或 write_mode；
- 无法表达 legacy validation 而会丢字段。
