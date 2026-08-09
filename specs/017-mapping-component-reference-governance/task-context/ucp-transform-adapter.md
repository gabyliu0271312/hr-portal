# UCP Transform Legacy v1 Adapter 上下文包

## 任务

U0401-U0404。

## 前置

- Foundation、Component Core、Rule Plugins 已验收。
- Workflow 节点基础能力可用。

## 必读

- `../spec.md` §4.3.1、§4.6、§4.9
- `../testing-acceptance.md` §4 UCP TRANSFORM v1
- `hr-portal/backend/app/ucp/action_contract.py`
- `hr-portal/backend/app/ucp/pipeline_template.py`
- `hr-portal/backend/app/ucp/pipeline_engine.py`
- `hr-portal/backend/tests/test_ucp_action_contract.py`

## 允许修改

- `hr-portal/backend/app/mapping/adapters/ucp_transform_v1.py`（新增）
- `hr-portal/backend/app/ucp/pipeline_template.py`
- `hr-portal/backend/app/ucp/pipeline_engine.py`
- `hr-portal/backend/tests/test_ucp_transform_mapping_adapter.py`（新增）
- `hr-portal/backend/tests/test_ucp_action_contract.py`
- `hr-portal/frontend/src/views/ucp/PipelineDesignerView.vue`
- `hr-portal/frontend/src/views/ucp/PipelineDesignerView.spec.ts`

## 禁止修改

- `action_contract.py::validate_mapping` 的 Legacy v1 含义。
- 既有 `mapping.version=1` 文档字段名称、strict/mapped_plus_same_name 语义。
- Sink、PushTarget、Warehouse。

## 输入合同

- Legacy `config.mapping.version=1`；
- 公共 `mapping_component: MappingDocumentV1`；
- `legacy_mapping_snapshot`；
- `storageMode: legacy_v1|component_v1`。

## 输出合同

- Legacy v1 只表达标量 `field` 映射；
- 新公共文档保存到 `mapping_component`，不覆盖 legacy `mapping`；
- 使用其他六类规则时必须确认 `component_v1`；
- 同次运行只执行一种 storageMode；
- 仅在可无损降级时允许回滚 Legacy，否则返回 `MAPPING_LEGACY_DOWNGRADE_UNSUPPORTED`。

## 测试合同

Given：Legacy strict、mapped_plus_same_name、公共 field-only、公共 reference_lookup、未知 legacy 字段。

When：打开、预览、保存、执行、升级、降级、重开。

Then：Legacy 原结果不变；field-only 可无损回写；其他规则迁移且不双执行；未知字段保留；不支持降级稳定失败。

## 完成证据

- Legacy/Component fixture；
- Pipeline 前后输出对比；
- UI 兼容提示；
- 真实测试结果。

## 阻塞条件

- 需要改 Legacy v1 validator；
- 无法确定旧 Pipeline 的 storageMode；
- 旧配置含未定义字段且不能保存到 `unknownFields`。

## 不在范围

- 修改 UCP Legacy v1 的字段含义、validator 或执行语义；
- 修改 Pipeline 触发、重试、事件总线和下游写入；
- 把公共 DTO 或 UCP Legacy v1 另存为新的 ODS→DWD 规则事实源。
