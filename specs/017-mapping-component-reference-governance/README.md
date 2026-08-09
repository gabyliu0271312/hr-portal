# 017 统一数据映射组件与调用方改造 Spec

## 文档状态

- 状态：Review Decision Confirmed / Draft for Development
- 编写日期：2026-07-31
- 评审修订：2026-08-07
- 首个真实实例：`emp_monthly_salary.expense_type`
- 第二个真实实例：成本中心默认自映射与例外覆盖
- 协同 Spec：011、012、成本分摊入仓开发文档

## 已确认且不可变的决策

1. 首期完整交付 `field`、`value_map`、`reference_lookup`、`identity_with_overrides`、`type_convert`、`format`、`split_merge` 七类规则；可以拆阶段开发，但不得缩减首期范围。
2. 建设全系统唯一的 `MappingWorkspace`，所有调用方嵌入同一编辑内核；调用方差异通过 context、policy、adapter 和薄包装注入，不允许长期 fork 独立编辑器。
3. ODS→DWD 规则正文只使用 `standardization_rules`；公共 DTO、目录、版本和依赖元数据不得形成第二份规则事实源。
4. UCP `TRANSFORM version=1`、`WAREHOUSE_ASSET_SINK` 和 PushTarget 旧格式保留兼容，通过 adapter 双读、回显和回写。
5. 工资 `expense_type` 当前仍由 `sync_service.py::LOOKUP_FIELDS` 生成；目标为 ODS 不写、DWD 通过 `reference_lookup` 派生，切换前必须双跑和回滚演练。

## 核心结论

字段转换、枚举映射、成本中心映射、跨表 Lookup、UCP 映射和 PushTarget 映射统一调用 Data Mapping Component。统一的是编辑、DTO、校验、预览和执行契约，不强制所有调用方立即迁移到同一数据库表或 JSON。数据清洗和流程编排是调用方，不建设第二套映射引擎。

## 本 Spec 覆盖

- 单一 `MappingWorkspace` 和七类首期规则插件。
- 公共 DTO、校验、预览、版本、命中轨迹、执行器和 adapter 契约。
- 数据仓库 ODS→DWD 现有标准化规则改造，规则正文继续使用 `standardization_rules`。
- 数据连接/流程编排数据映射节点。
- UCP `TRANSFORM version=1`、`WAREHOUSE_ASSET_SINK`、PushTarget adapter。
- 工资费用类型的优先级 Lookup 迁移。
- 成本中心默认自映射、少数例外、周期发布和 DWD 门禁。

本目录不建设独立“参考映射”模块；成本中心和费用类型是规则集实例。

## 阅读顺序

1. `START_HERE.md`
2. `code-status-review-and-revision-decision.md`
3. `ai-execution-protocol.md`
4. `spec.md`
5. `ui-interaction.md`
6. `atomic-tasks.md`
7. `testing-acceptance.md`

将任务交给 AI 前，必须先阅读 `ai-execution-protocol.md`；该协议规定任务依赖、允许/禁止文件、输入输出合同、测试证据、失败报告和主代理审核规则。

涉及数仓时，以 012 `r0101-rule-scope-decision.md` 为 ODS→DWD 规则表和枚举权威；涉及 Sink 时，以 011 `contracts/x0210-warehouse-asset-sink-contract.md` 为写入合同权威。
