# 017 原子任务清单

> 所有阶段均属于首期实施顺序。七类规则和五类调用方全部完成后，才能宣称首期交付完成。`M` 公共组件；`W` 数仓；`P` 流程；`U` UCP/Sink/PushTarget；`B` 业务实例；`Q` 质量。
>
> **任务卡索引：** 本文件只维护任务编号、依赖和结果摘要；对应的 `task-context/*.md` 任务包提供执行级合同。任务索引与任务包共同构成唯一可执行任务清单。将任务交给 AI 前，必须打开对应任务包的具体章节；不得只依据下列标题开发。
>
> **共享文件门禁：** 同一共享文件只能由一个任务串行修改；跨任务需要追加字段、迁移或公共错误码时，必须由主代理合并。

## A. 合同冻结与开工

> 执行任务卡：`task-context/foundation.md`。A0001-A0009 必须按该包串行执行；A0008 另须提交旧角色迁移与发布/回滚权限矩阵。

- [ ] A0001 阅读 017 评审决策、011/012/x0210/成本分摊入仓文档并保护 git 状态。
- [ ] A0002 固化七类规则全部首期交付、单一 `MappingWorkspace` 两项不可变决策。
- [ ] A0003 固化 ODS→DWD 规则正文只用 `standardization_rules`，禁止平行事实源。
- [ ] A0004 完成 017 七类与 012 10 类权威兼容矩阵。
- [ ] A0005 盘点 UCP v1、Sink mapping、PushTarget `field_mappings` 全部旧字段和样例，并冻结 Legacy v1 迁移/回滚边界。
- [ ] A0006 按 `MappingDocumentV1.mappingSchemaVersion=1` 实现公共 DTO；禁止复用或改写 UCP `mapping.version=1`。
- [ ] A0007 按冻结 adapter 合同实现读取、转换、执行、回显、无损回写、unknownFields 保留和有损写入阻断。
- [ ] A0008 按 `MappingCallerPolicyV1` 实现五类调用方字段/规则/effect/legacy policy、稳定错误码和三层校验边界；交付旧角色迁移及保存/发布/回滚/执行权限矩阵。
- [ ] A0009 实现 append-only 版本、`expectedVersion` 乐观锁、HTTP 409 `MAPPING_VERSION_CONFLICT`、发布快照和审计；Warehouse 快照优先复用 `warehouse_model_versions`。

## M. Data Mapping Component

> 执行任务卡：`task-context/component-core.md`（M0101-M0105、M0120-M0124）；七类插件执行 `task-context/rule-plugins.md`。M0124 必须提交事件消费者、重试、审计关联和通知去重证据。

- [ ] M0101 定义 `MappingField`、七类 discriminated `MappingRule`、`MappingRuleSet`、`MappingResult`、命中轨迹和 compatibility metadata。
- [x] M0102 实现唯一 `MappingWorkspace` 外壳、Header、规则列表、Preview、Footer。
- [x] M0103 实现 rule plugin registry，禁止调用方复制插件实现。
- [ ] M0104 实现 caller context/policy 和薄包装接口。
- [ ] M0105 实现 adapter SDK 和有损回写阻断。
- [ ] M0110 实现 `field` 插件：DTO、UI、校验、预览、执行、序列化。
- [ ] M0111 实现 `value_map` 插件及对象/数组旧格式兼容。
- [x] M0112 实现 `reference_lookup` 插件：priority、固定条件、命中动作、默认和批量预加载。
- [x] M0113 实现 `identity_with_overrides` 插件：默认自映射只存例外。
- [ ] M0114 实现 `type_convert` 插件及失败策略。
- [ ] M0115 实现 `format` 插件及受控格式/单位子类型。
- [ ] M0116 实现 `split_merge` 插件及多字段循环/冲突校验。
- [ ] M0120 实现公共字段白名单、类型、主键、目标重复、循环、Schema drift 和权限校验。
- [ ] M0121 实现统一预览、差异、冲突、命中轨迹和脱敏。
- [ ] M0122 实现批量执行器和参考数据预加载，禁止逐行 N+1。
- [ ] M0123 实现规则集 draft/published/retired、不可变版本、回滚和乐观锁。
- [ ] M0124 实现依赖、影响分析、发布事件、重算状态和审计；交付事件消费者、重试、幂等、审计关联和通知去重证据。

## W. 数据仓库/数据清洗

> 执行任务卡：`task-context/warehouse-adapter.md`。W0201/W0203 必须覆盖未知字段 round-trip；无法表达时阻断并返回 `MAPPING_LOSSY_WRITE_BLOCKED`。

- [ ] W0201 实现 warehouse adapter，公共 DTO 与 `standardization_rules` 双向无损转换；未知 `rule_config` 属性必须 round-trip 保留，否则阻断并返回 `MAPPING_LOSSY_WRITE_BLOCKED`。
- [ ] W0202 将 012 权威枚举扩展为 10 类并保持原执行顺序兼容。
- [ ] W0203 兼容旧 `value_map` 对象/数组格式和现有模板；未知配置字段不得静默丢失。
- [ ] W0204 将 `reference_lookup` 持久化到 `standardization_rules` 并接入批量参考数据访问器。
- [ ] W0205 将 `identity_with_overrides` 持久化到 `standardization_rules`，只保存例外。
- [ ] W0206 `field/type_convert/format/split_merge` 与 012 既有类型无损映射。
- [ ] W0207 012 的 `deduplicate/null_handling/unit_convert` 等数仓专属能力保持可用。
- [ ] W0208 `WarehouseDataRecipe.vue` 嵌入统一 `MappingWorkspace`，保留步骤流和 DWD caller policy。
- [ ] W0209 接入 ODS→DWD adapter，保证只写 DWD；未绑定资产保持既有行为。
- [ ] W0210 规则发布触发依赖 DWD 重算、待确认或阻断，并补血缘和字段元数据。
- [ ] W0211 自动检查不存在第二张 ODS→DWD 规则正文表。

## P. 数据连接/流程编排

> 执行任务卡：`task-context/workflow-adapter.md`。P0301/P0302/P0305 必须覆盖旧节点未知扩展字段在读取、保存、升级、回滚中的保留或有损阻断。

- [ ] P0301 盘点旧字段转换节点并建立兼容 fixture，包含未知扩展字段。
- [ ] P0302 将流程节点嵌入统一 `MappingWorkspace`，旧节点兼容回显；保存/升级无法无损表达时必须阻断。
- [ ] P0303 支持七类规则、引用规则集、试运行、错误策略和命中轨迹。
- [ ] P0304 保持触发、顺序、条件、重试、入库和执行记录边界。
- [ ] P0305 旧节点升级前生成快照并提供回滚；未知扩展字段必须 round-trip 保留，否则阻断。

## U. UCP / Sink / PushTarget adapters

> 执行任务卡：UCP 使用 `task-context/ucp-transform-adapter.md`；Sink 使用 `task-context/sink-adapter.md`；PushTarget 使用 `task-context/push-target-adapter.md`。所有 adapter 必须无损回写或显式阻断。

### UCP TRANSFORM v1

- [ ] U0401 读取 UCP `TRANSFORM version=1` 并转公共 DTO。
- [ ] U0402 通过统一 Workspace 回显和编辑 v1 可表达能力。
- [ ] U0403 新规则无法无损表达时使用显式 DTO 版本演进，不修改 v1 含义。
- [ ] U0404 v1 执行、保存、重开和旧 Pipeline 回归。

### WAREHOUSE_ASSET_SINK

- [ ] U0410 读取 Sink legacy mapping/transform/validation 并转公共 DTO。
- [ ] U0411 `WarehouseAssetSinkConfig` 嵌入统一 Workspace。
- [ ] U0412 无损回写旧格式并保护未知字段。
- [ ] U0413 保留资产、复合主键、期间、白名单、批次、事务和写入错误合同。
- [ ] U0414 写入仍强制经过 `WarehouseAssetSink`，旧配置和未绑定资产回归。

### PushTarget

- [x] U0420 读取旧 `field_mappings` 并转公共 DTO。
- [x] U0421 PushTarget 抽屉嵌入统一 Workspace。
- [x] U0422 无损回写和旧推送 payload 回归。
- [x] U0423 保持发送、凭证、调度和错误合同归 PushTarget。

## B. 业务实例

> 执行任务卡：工资使用 `task-context/wage-migration.md`；成本中心使用 `task-context/cost-center-lifecycle.md`。业务 AI 不得跳过 Warehouse adapter、版本和发布门禁。

### 工资费用类型

- [x] B0501 将工号优先、甲方其次、默认工资配置为 `reference_lookup`。
- [x] B0502 保留旧 `LOOKUP_FIELDS` evaluator，并实现新旧同批双跑。
- [x] B0503 按业务主键生成逐行差异，分类工号/甲方/默认/重复键/空值。
- [x] B0504 重复参考键同结果 warning、异结果阻断发布。
- [x] B0505 灰度启用 DWD 新结果并验证重算。
- [x] B0506 演练回滚到旧逻辑。
- [ ] B0507 停止 ODS 生成 `expense_type`，确认 DWD 派生字段元数据和血缘。
- [ ] B0508 最后移除工资专用 `LOOKUP_FIELDS`，重算入口改用统一执行器。

### 成本中心及其他实例

- [ ] B0510 成本中心默认自映射、少量例外和标准属性 Lookup。
- [ ] B0511 周期初始化、复制上月、差异、人工确认、发布、并发 409、DWD 门禁和通知。
- [ ] B0512 未发布规则返回 `review_required`，不写错误 DWD。
- [ ] B0513 员工花名册枚举和组织 Lookup 验证。
- [ ] B0514 每个调用方至少完成一个真实七类规则使用实例或适用性证明。

## Q. 质量与交付

> 执行任务卡：`task-context/quality-gates.md`。Q0605 还必须验证事件幂等、消费者重试、审计可追溯和通知去重。

- [ ] Q0601 七类规则 DTO/校验/UI/预览/执行/序列化矩阵全部通过。
- [ ] Q0602 数据清洗 10 类规则、ODS→DWD、血缘、重算和唯一事实源测试。
- [ ] Q0603 Workflow/UCP v1/Sink/PushTarget adapter 无损兼容回归。
- [ ] Q0604 工资双跑、逐行一致、灰度和回滚证据。
- [ ] Q0605 成本中心稀疏覆盖、周期发布、并发、门禁和通知去重；补充事件幂等、消费者重试、审计可追溯和重试耗尽恢复证据。
- [ ] Q0606 权限、403、脱敏、恶意字段/表名、SQL/脚本拒绝、日志安全。
- [x] Q0607 证明各入口挂载同一 Workspace，仓库内无长期编辑器 fork。
- [ ] Q0608 017、011、012、成本分摊入仓文档术语、枚举、链接和任务一致。
- [ ] Q0609 前端测试/build、后端测试、migration、`git diff --check` 和交付证据。
