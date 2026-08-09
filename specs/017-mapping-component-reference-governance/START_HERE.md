# START HERE：017 统一数据映射组件与调用方改造

## 1. 开工前必须阅读

1. 本文件。
2. `code-status-review-and-revision-decision.md`。
3. `ai-execution-protocol.md`。将任务交给 AI 前必须先阅读；它是任务依赖、文件边界、输入输出、测试证据和交付报告的执行合同。
4. 本目录其余全部 017 文档。
5. `specs/012-data-warehouse-ucp-integration/START_HERE.md`、`r0101-rule-scope-decision.md` 及相关 ODS→DWD 章节。
6. `specs/011-universal-connector-platform/spec.md` 相关 Pipeline/TRANSFORM 章节和 `contracts/x0210-warehouse-asset-sink-contract.md`。
7. `HR Portal_接收成本分摊锁定数据入仓开发文档.md`。
8. 真实实现：
   - `backend/app/datasources/sync_service.py`
   - `backend/app/warehouse/standardization_engine.py`
   - `backend/app/warehouse/service/standardization.py`
   - `backend/app/ucp/action_contract.py`
   - `backend/app/ucp/pipeline_engine.py`
   - `backend/app/ucp/warehouse_ingest_transform.py`
   - `backend/app/push/push_service.py`
   - `frontend/src/views/warehouse/WarehouseDataRecipe.vue`
   - `frontend/src/views/ucp/PipelineDesignerView.vue`
   - `frontend/src/components/ucp/WarehouseAssetSinkConfig.vue`
   - `frontend/src/components/push/PushFieldMapper.vue`
9. `git status --short`，保护已有未提交变更。

## 2. 启动确认

```text
017 开发启动确认：
- 已阅读代码现状评审与决策记录：是/否
- 已阅读本目录 017 文档：是/否
- 已阅读 011/012/成本分摊入仓约束：是/否
- 本任务覆盖的首期规则类型：...
- 是否保持七类全部在首期：必须为是
- 是否复用统一 MappingWorkspace：必须为是
- 是否新增 ODS→DWD 平行规则正文表：必须为否
- 是否修改旧格式 adapter：是/否
- 是否涉及工资双跑/切换：是/否
- 是否改动数据清洗：是/否
- 是否改动流程编排/UCP/PushTarget：是/否
- 是否涉及 UI/通知：是/否
- 已检查 git status：是/否
- 任务编号：...
```

## 3. 不可违反边界

- 首期七类 `field/value_map/reference_lookup/identity_with_overrides/type_convert/format/split_merge` 不得缩减或降期。
- 全系统只能有一个 `MappingWorkspace` 编辑内核；允许薄包装，不允许复制七类规则表单、校验、预览和执行逻辑。
- ODS→DWD 规则正文只进入 `standardization_rules`；禁止新增平行 `mapping_rules` 事实源。
- 组件只负责映射；连接、流程、DWD 写入、Sink 事务、PushTarget 发送、凭证和通知仍由调用方负责。
- ODS 保持原始；派生字段在 ODS→DWD 生成。
- UCP `TRANSFORM version=1`、Sink mapping、PushTarget `field_mappings` 必须双读并无损回显；未知字段不得静默丢弃。
- Sink 的资产、复合主键、期间、白名单、批次幂等和事务合同不得被公共组件绕过。
- 优先级、命中策略、默认值和例外必须可配置，不能写死业务特例。
- 资产/字段来自元数据白名单；禁止 SQL、脚本、任意表达式和自由 Join。
- 未绑定规则资产保持原行为；复制结果默认不能自动发布。
- 工资旧逻辑只有在双跑逐行一致、灰度和回滚演练通过后才能移除。
- 仅在开发、UI、测试、验收全部完成后勾选任务。

## 4. 权威文档优先级

1. 012 `r0101-rule-scope-decision.md`：ODS→DWD 规则表和枚举。
2. 011 x0210：Sink 写入合同。
3. 成本分摊入仓文档：成本分摊事件、期间和事务。
4. 017 `spec.md`：公共 Mapping Component、Workspace、DTO 和 adapter。
5. 017 评审决策文档：现状评审和意见处置。
6. 017 `ai-execution-protocol.md`：多 AI 任务执行、文件边界、测试证据和审核规则。
