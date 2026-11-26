# X0210 数据补全与数据仓库资产写入合同

## 实施子项

- [x] X0210-01 `WarehouseAssetSink`：受控资产定位、字段白名单、写入模式、批次幂等。
- [x] X0210-02 记录流节点：来源读取、逐记录能力查询、原始字段优先合并、逐人结果与失败项重跑。
- [x] X0210-03 流程模板：北森报表待入职人员补全飞书 Offer 后写入既有资产。
- [x] X0210-04 流程设计器：业务化配置来源、投递记录 ID、Offer 能力、字段映射、资产和失败策略。
- [x] X0210-05 执行审计：批次、对账指标、Trace、死信与逐人重跑展示。
- [x] X0210-06 回归与验收：旧 DataSource、独立数据仓库入仓和旧资源 Pipeline 不受影响。

## 边界

- 新写入节点仅允许写入 `registered_tables` 中状态为 `published` 的资产。
- 列名只能来自 `table_columns` 的允许字段；未知字段、未声明主键和无效写入模式一律失败。
- 不在数据仓库页面增加配置入口；配置只在 UCP 流程设计器中完成。
- 北森报表来源字段优先，Offer 只能填充缺失字段；不得覆盖原始字段。
- 响应、执行快照和失败记录仅保存脱敏摘要；薪酬、手机、证件、凭证字段递归脱敏。
- 不修改 `DATASOURCE_BRIDGE_ADAPTER` 的同步并返回摘要契约。

## 节点合同

### `CAPABILITY_LOOKUP`

- 输入：`input_key` 指向记录列表，`lookup_field` 为来源记录中的业务键，`parameter_name` 为能力入参名。
- 行为：每条记录调用已启用且已验证的只读能力；无键、无 Offer 和单条失败分别记录为可追溯结果，按失败策略继续或终止。
- 输出：保留来源行、`lookup_data` 和 `lookup_status` 的记录流；来源字段不可被查询结果覆盖。

### `RECORD_MERGE`

- 输入：记录流；字段映射使用业务字段名，不接受 SQL、JSONPath、URL 或 Adapter Code。
- 行为：只允许把映射后的能力字段填充到空的目标字段；输出为待写入行。

### `WAREHOUSE_ASSET_SINK`

- 输入：记录流、`target_asset`、`write_mode`（`append` / `upsert` / `replace`）、`primary_key`、`field_whitelist`、`batch_key`。
- 输出：写入/跳过/失败数量、目标资产、批次键与字段白名单摘要。
- 写入必须经 `app.warehouse.asset_sink.WarehouseAssetSink`，不得由 Pipeline 直接拼接目标业务表 SQL。

## 与 017 统一数据映射组件的关系

- Sink 的映射配置 UI 嵌入统一 `MappingWorkspace`，不建设长期独立的 Sink 映射编辑器。
- adapter 只负责公共 Mapping DTO 与现有映射配置之间的转换，不接管资产写入。
- `target_asset`、`write_mode`、`primary_key`、`field_whitelist`、`batch_key`、期间、复合主键、批次幂等和事务继续由本合同约束。
- 映射规则不得绕过已发布资产、字段白名单或主键保护；写入仍必须经 `WarehouseAssetSink`。
- 旧配置必须双读、可回显；无法无损回写时必须阻断保存，禁止静默丢字段。

## API 与 UI

- 现有 Pipeline 保存 API 保持兼容；新增节点配置由现有 `steps` 透传 JSON 承载。
- 逐人失败继续复用 `UcpLoopItemExecution` 与现有重跑 API；不得另建重复死信体系。
- 流程设计器新增三个业务节点和“待入职人员入仓及 Offer 薪酬补充”模板；数据仓库页面不改动。

## 验收证据（2026-07-24）

- 联调合同覆盖：空/重复 `application_id`、无 Offer、多 Offer、限流重试、失败继续/停止、原字段优先合并、脱敏实际例及管道批次传递。
- 受控写入：只允许已发布资产的白名单字段；`upsert` 校验已声明主键并以主键实现重复批次幂等。
- 回归：全量后端测试、前端测试与构建均通过；既有 DataSource 和资源型 Pipeline 回归在全量用例中验证。

## 生产反馈修复（2026-11-26，开发验证通过，未部署）

- **范围**：X0210-04/06 原流程设计器及资产写入映射，复用公共 MappingWorkspace；修复配置草稿不能继续编辑及顶层保存遗漏校验。不改成本中心业务编码、数据、权限、调度或生产配置。
- **编码提示**：原流程编码约束保持大写字母开头、仅大写字母/数字/下划线、3–64 位；输入框持续显示要求与 `COST_CENTER_SYNC` 示例。无效输入显示字段错误并聚焦，前端不发送保存请求；后端返回明确中文格式要求，不自动改码。
- **映射编辑**：component_v1 判定不依赖弹窗开关；打开时重算状态，缺组件文档但 legacy 可无损转换时恢复文档。空草稿阻止完成/提交，但允许补全、清空、删除及纠正目标合同错误；无法无损读取的旧映射仍保留并阻断，不静默删除未知字段。设计器按节点接收保存状态，并在提交前检查所有资产写入节点，含未挂载节点；后端逐条拒绝启用规则空源/目标字段，split/merge 多字段保留。
- **自动化**：前端定向 `WarehouseAssetSinkConfig.spec.ts`、`PipelineDesignerView.spec.ts`、`MappingWorkspace.spec.ts` 共 **46 passed**；后端 `test_pipeline_template_router.py --noconftest` **59 passed**（无库，1 条依赖弃用警告）；完整 `npm run build`（vue-tsc + Vite）通过，`git diff --check` 通过。未运行全仓库回归或真实数据库验收。
- **PC**：本地 Vite 5178 + Chromium 1440×1000、仅浏览器合成 API。实测 `cost_center` 显示完整要求且焦点回编码框；重载含空草稿的组件文档后可展开/删除，逐字段补全后提示消失，完成配置并成功发出保存请求，页面脚本错误 0。截图 `%TEMP%/pipeline-code-error-pc.png`、`%TEMP%/pipeline-sink-mapping-pc.png` 已查看；合成请求成功不代表真实数据库持久化或生产验收。
- **限制/停止**：代码与本记录同批提交发布，未连接生产、未迁移或部署。禁用规则跳过本次源/目标必填检查及目标汇总；公共运行校验器仍可能检查禁用规则的类型专属配置，这是既有限制，本轮未修改公共执行链。生产验收待发布后在原入口复核，不标记成本中心来源接管或权限投影完成。
