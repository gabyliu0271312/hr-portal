# 017 测试与验收要求

## 1. 原则

必须验证 UI→公共 DTO→adapter→调用方 API/服务/数据库→重开→下游链路；同时验证成功、未命中、冲突、权限、并发、重算失败、回滚和通知去重。七类规则和所有调用方全部通过后才算首期完成。没有真实外部条件时不得宣称真实推送或生产入库通过。

执行 AI 必须遵守 `ai-execution-protocol.md`：每项测试以任务卡的 Given/When/Then 为准，命令不存在、测试 skipped、环境不可用或外部联调未进行时必须如实报告，不能写成通过。

## 2. 七类公共规则矩阵

| 规则类型 | DTO | 后端校验 | UI | 预览 | 执行 | 序列化/回显 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| `field` | 必测 | 必测 | 必测 | 必测 | 必测 | 必测 |
| `value_map` | 必测 | 必测 | 必测 | 必测 | 必测 | 必测 |
| `reference_lookup` | 必测 | 必测 | 必测 | 必测 | 必测 | 必测 |
| `identity_with_overrides` | 必测 | 必测 | 必测 | 必测 | 必测 | 必测 |
| `type_convert` | 必测 | 必测 | 必测 | 必测 | 必测 | 必测 |
| `format` | 必测 | 必测 | 必测 | 必测 | 必测 | 必测 |
| `split_merge` | 必测 | 必测 | 必测 | 必测 | 必测 | 必测 |

公共测试还必须覆盖字段白名单、搜索、目标重复、主键保护、循环、类型、Schema drift、未命中策略、重复参考键、批量预加载、无 N+1、append-only 版本、`expectedVersion` 409、发布、回滚、依赖、脱敏和 403。

### 三种顺序隔离

- `displayOrder` 只影响 Workspace 展示和公共规则列表序列，不改变 Lookup 命中优先级或 012 清洗阶段。
- Lookup `priority` 只影响同一 `reference_lookup` 的条件命中顺序，不承载 Workspace 展示顺序。
- 012 Warehouse 清洗阶段顺序由 `standardization_rules`/012 adapter 语义决定，不读取公共 `displayOrder` 或 Lookup `priority`。
- Given 同一规则集分别调整三种顺序，When 预览/执行，Then 只有对应职责的结果变化；不得出现跨层顺序覆盖。

## 3. 统一 MappingWorkspace

- Warehouse、Workflow、UCP TRANSFORM、Sink、PushTarget 实际挂载同一组件。
- caller policy 按 `MappingCallerPolicyV1` 限制资产、字段、七类规则、legacy 状态和业务动作。
- 五类调用方分别验证 `warehouse.modeling`、`ucp.pipelines`、Sink 资产权限和 `warehouse.service`；RBAC 不足为 403，policy 拒绝为稳定 `MAPPING_*` 错误码。
- 薄包装只负责 context、adapter、保存/发布动作。
- 七类插件和公共校验/预览代码无复制 fork。
- loading、empty、forbidden、schema_changed、conflict、unsaved、legacy_readonly、lossy_write_blocked、rebuild_failed 均可恢复。

## 4. Adapter 合同测试

### UCP TRANSFORM v1

- v1 → 公共 DTO → 执行结果一致。
- `strict` / `mapped_plus_same_name` 语义不变。
- 新规则不能偷偷改变 v1；必须显式版本演进。
- 旧 Pipeline 打开、保存、重开和执行一致。
- 公共 `mappingSchemaVersion=1` 与 UCP legacy `mapping.version=1` 不混用；使用非 `field` 规则时必须迁移为 `mapping_component`，同一运行不得双执行。
- 不支持无损降级时返回 `MAPPING_LEGACY_DOWNGRADE_UNSUPPORTED`。

### WAREHOUSE_ASSET_SINK

- 旧 mapping/transform/validation → 公共 DTO → 结果一致。
- 资产、复合主键、期间、字段白名单、批次和事务不被绕过。
- 非法字段、重复目标、主键覆盖、空批次和跨期批次拒绝。
- 写入仍经过 `WarehouseAssetSink`。

### PushTarget

- 旧 `field_mappings` → 公共 DTO → 推送 payload 一致。
- 空映射仍原样推送。
- 旧配置保存和重开不丢字段。
- 发送、凭证、调度和错误合同不改变。

所有 adapter 必测未知字段保护；不能无损回写时必须阻断保存。

### Warehouse adapter 与 Workflow adapter 无损兼容

- Warehouse `standardization_rules` 和 Workflow legacy node 的未知扩展字段必须在 read/save/reopen（Workflow 还包括 upgrade/rollback）后 round-trip 保留。
- Given legacy 输入含未知字段，When adapter 无法将其表达为公共 DTO，Then 保存、升级或回写必须阻断并返回 `MAPPING_LOSSY_WRITE_BLOCKED`，不得静默删除。
- 兼容测试必须保留输入/输出 JSON fixture 和 `MappingCompatibilityV1` 结果，不能只验证页面挂载。

## 5. 数据清洗/ODS→DWD

- ODS→DWD 规则正文只从 `standardization_rules` 读取和写入。
- 不存在第二张平行规则正文表。
- 012 扩展后的 10 类枚举可创建、校验、预览和执行。
- `rename/type_convert/value_map/unit_convert/split_merge/deduplicate/null_handling/format_standardize` 不回归。
- `reference_lookup` 和 `identity_with_overrides` 正确执行。
- 公共 `field/format` 经 adapter 后语义正确。
- 旧 `value_map` 对象和数组格式双读、保存、执行一致。
- 目标只能是 DWD；ODS 不被修改；未绑定资产原行为不变。
- 派生字段元数据、血缘、执行记录、门禁和重算状态正确。

## 6. 工资费用类型

1. 兼容期旧 `LOOKUP_FIELDS` 和新 `reference_lookup` 对同批数据双跑。
2. 按业务主键逐行比对并分类：工号命中、甲方命中、默认工资、重复键、空值。
3. 工号命中覆盖甲方；工号未命中才尝试甲方；均未命中使用配置默认“工资”。
4. 调整 priority 后结果按 UI 配置变化，不改后端代码。
5. 重复同结果产生 warning；重复异结果阻断发布。
6. DWD 重算可重复，规则/参考数据变化可触发重算。
7. 灰度关闭后可立即回旧逻辑。
8. 切换完成后 ODS `emp_monthly_salary` 不产生 `expense_type`，DWD 生成且血缘正确。
9. 删除旧逻辑前必须留存双跑一致和回滚证据。

## 7. 成本中心

- 100 条默认自映射无需录入 100 条。
- 少量例外只保存例外并正确执行。
- 复制上月、新增/变化待确认、并发 409、发布门禁、无效/停用目标、标准属性 Lookup。
- 未发布规则返回 `review_required`，不写错误 DWD。
- 发布和下游重算状态分离；通知去重。

## 8. 安全

验证规则引用权限、前后端 403、敏感数据脱敏、恶意字段/表名、SQL 注入、任意脚本、危险正则、secret 和完整工资 payload 不出现在日志/事件。前端隐藏不能替代后端授权。

### 权限迁移与效果权限

- 旧角色迁移后分别验证保存、发布、回滚、执行四类效果权限；目录发布/回滚权限不能替代调用方执行权限。
- RBAC 缺失必须返回 HTTP 403；policy 的 `allowSave`、`allowPublish`、`allowExecute`、`allowRebuild` 禁止必须返回结构化 `MAPPING_EFFECT_FORBIDDEN`，两者不可混淆。

### 事件与通知

- 重复 `event_id` 或 `idempotency_key` 不得重复消费、重算或通知。
- 消费者临时失败必须按合同重试；重试耗尽进入可恢复、可审计的失败状态，并支持后续重试。
- 事件与审计记录必须通过 `event_id`、`binding_id`、`mapping_version` 可追溯；通知去重不得依赖消息文本。
- 以上事件、权限和无损兼容测试不得 skipped；环境或外部依赖不可用时必须标记阻塞，不得宣称通过。
- 事件 payload 不得包含 secret、完整工资数据或未脱敏的 `before/after`。

## 9. 真实现有回归基线

当前应优先复用并扩展：

```powershell
Set-Location D:\AI项目\HR提效工具搭建\hr-portal
pytest backend\tests\test_warehouse_standardization.py -q
pytest backend\tests\test_standardization_engine.py -q
pytest backend\tests\test_sync_service_entity.py -q
pytest backend\tests\test_ucp_action_contract.py -q
pytest backend\tests\test_ucp_mapping_conflicts.py -q
pytest backend\tests\test_warehouse_ingest_transform.py -q
pytest backend\tests\test_warehouse_asset_sink.py -q
pytest backend\tests\test_push_service_entity.py -q
Set-Location frontend
npm.cmd test -- WarehouseAssetSinkConfig.spec.ts
npm.cmd test -- PipelineDesignerView.spec.ts
npm.cmd run build
Set-Location ..
git diff --check
```

以下为待开发后新增的目标测试，不得在文件不存在时宣称已运行：

```text
MappingWorkspace.spec.ts
MappingRulePlugins.spec.ts
WarehouseDataRecipe mapping adapter tests
WorkflowDataMappingNode tests
mapping adapter backend contract tests
wage mapping dual-run tests
cost-center mapping lifecycle tests
```

## 10. 文档验收

- [ ] 017 全部文档完整列出七类首期规则。
- [ ] 所有调用方引用同一 `MappingWorkspace`。
- [ ] 012 枚举数量、名称和兼容矩阵一致。
- [ ] 无第二个 ODS→DWD 规则正文事实源。
- [ ] UCP v1、Sink、PushTarget 兼容说明一致。
- [ ] 工资现状和目标口径没有混写。
- [ ] README、START_HERE、任务编号、测试矩阵和交叉链接一致。

## 11. 交付证据

需留存七类插件测试、统一 Workspace 复用证据、三个 legacy adapter、数仓 10 类回归、工资逐行比对、成本中心稀疏映射、migration、权限、安全、血缘、审计、通知、构建和 diff 检查结果。
