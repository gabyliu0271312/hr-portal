# 017 AI 开发执行协议

> 状态：冻结执行协议  
> 适用范围：017 全部 AI、人工开发者、评审者和主代理  
> 上位约束：`code-status-review-and-revision-decision.md`、`spec.md`、011 x0210、012 r0101、成本分摊入仓文档

## 1. 目的

本协议把 017 从架构需求拆解为可由多个 AI 稳定执行、验证、审查和合并的任务包。

AI 不得只根据任务标题猜测实现。每次开发必须读取本协议、任务卡引用的章节和真实代码，并严格遵守允许修改文件、禁止修改文件、输入/输出合同和完成证据。

## 2. 不可覆盖的总原则

1. 首期必须完整交付七类：`field`、`value_map`、`reference_lookup`、`identity_with_overrides`、`type_convert`、`format`、`split_merge`。
2. 全系统只建设一个 `MappingWorkspace`、一个公共 Mapping DTO、一个纯映射执行内核；调用方使用 adapter 和 caller policy。
3. ODS→DWD 规则正文只使用 `standardization_rules`，不新增第二份规则正文事实源。
4. 公共 MappingExecutor 不写数据库、不写 ODS/DWD、不控制事务、不执行 Pipeline、不发送 PushTarget、不发送通知、不读取凭证。
5. UCP Legacy v1、Sink legacy mapping、PushTarget `field_mappings` 必须双读；未知字段不得静默丢失；有损回写必须阻断。
6. Sink 的已发布资产、主键、期间、白名单、批次幂等、事务和 `WarehouseAssetSink` 合同优先级高于公共组件便利性。
7. 工资旧 `LOOKUP_FIELDS` 只有在双跑、逐行比对、灰度和回滚证据齐全后才能删除。

## 3. AI 角色和任务认领

### 3.1 主代理

主代理负责：

- 冻结或解释跨任务合同；
- 分配任务并检查前置依赖；
- 审核 diff、测试和安全边界；
- 处理共享文件冲突；
- 只有在完成定义满足后勾选任务。

### 3.2 实现 AI

实现 AI 只能执行一个已认领任务或一个明确允许的连续任务组，不得自行扩大范围。遇到合同未定义、前置任务未完成、共享文件冲突或测试环境异常时，必须报告阻塞，不得自行发明替代方案。

### 3.3 审查 AI

审查 AI 只验证任务卡中的输入/输出、允许/禁止文件、测试和完成定义，不得以“代码能运行”为由放宽合同。

## 4. 任务依赖门禁

任务只能按以下层级推进：

```text
A0001-A0009
  → M0101-M0105
    → M0110-M0116
      → M0120-M0124
        → W/P/U adapters
          → B 业务迁移
            → Q 首期验收
```

- 未完成前置任务，不得修改后续层文件。
- A0006-A0009 未完成，不得实现任何调用方 adapter。
- M0101-M0105 未完成，不得将任何现有页面切换到公共 DTO。
- 七类插件未全部完成，不得宣称公共组件首期完成。
- Warehouse adapter 未通过，不得切换工资 ODS/DWD 口径。
- 所有 B 任务完成前，不得移除旧业务逻辑。

## 5. 文件修改规则

### 5.1 允许修改

每个任务只能修改任务卡列出的文件和对应测试文件。若需要新增文件，必须位于任务卡指定目录，并在交付报告中说明。

### 5.2 禁止修改

除非任务卡明确授权，任何 AI 不得：

- 修改 UCP Legacy v1 的字段含义或执行语义；
- 修改 `WarehouseAssetSink` 的主键、期间、白名单、批次和事务语义；
- 修改 PushTarget 凭证、发送、调度和错误合同；
- 让 MappingExecutor 直接写数据库、执行 SQL 或发送通知；
- 把 `expense_type` 写回 ODS；
- 新建第二份 ODS→DWD 规则正文表；
- 修改其他未认领任务的实现文件；
- 修改已存在 migration 文件；
- 为了通过测试删除或放宽既有安全校验。

### 5.3 共享文件串行规则

以下文件属于共享高冲突文件，必须由主代理串行合并：

- `backend/app/warehouse/schemas.py`
- `backend/app/warehouse/models.py`
- `backend/app/warehouse/standardization_engine.py`
- `backend/app/warehouse/service/standardization.py`
- `backend/app/warehouse/router.py`
- `frontend/src/api/warehouse.ts`
- `frontend/src/views/warehouse/WarehouseDataRecipe.vue`
- `frontend/src/views/ucp/PipelineDesignerView.vue`
- `backend/app/ucp/pipeline_engine.py`
- `backend/app/ucp/action_contract.py`
- `backend/app/ucp/pipeline_template.py`

同一共享文件不得由两个并行 AI 同时修改。

## 6. 标准任务卡格式

`atomic-tasks.md` 是任务索引，`task-context/` 中对应的任务包是任务合同；两者共同构成唯一可执行任务清单。

```markdown
### 任务编号：MXXXX
- 目标：一句话说明唯一结果
- 前置：任务编号
- 必读：文件和章节
- 允许修改：精确文件路径/新增目录
- 禁止修改：相关边界文件
- 输入合同：DTO、旧格式、Schema 或服务接口
- 输出合同：文件、接口、行为、错误码
- 测试合同：测试文件、Given/When/Then、命令
- 完成证据：diff、测试输出、迁移核验、UI 状态或兼容 fixture
- 阻塞条件：遇到什么必须停止并上报
- 不在范围：明确不能顺手实现的内容
```

## 7. 任务输出合同

### 7.1 后端公共组件任务

必须输出：

- 公共 DTO 或执行器实现；
- JSON fixture；
- 正常、无效、冲突、权限和 Schema drift 测试；
- 不写数据库、不产生外部副作用的证据。

### 7.2 Adapter 任务

必须输出：

```text
legacy input
→ adapter.read
→ MappingDocumentV1
→ validate/preview/execute
→ adapter.write 或明确阻断
```

必须验证：

- 旧配置读取；
- 公共 DTO 转换；
- 结果一致；
- 未知字段保留；
- 无损回写；
- 有损回写阻断；
- 旧配置未绑定时原行为不变。

### 7.3 UI 任务

必须输出：

- 实际挂载公共 `MappingWorkspace` 的证据；
- caller policy 渲染；
- loading/empty/forbidden/conflict/legacy/lossy 状态；
- 组件测试；
- 不复制公共插件和校验的证据。

### 7.4 迁移任务

必须输出：

- 新 migration 文件；
- `upgrade()` 和 `downgrade()`；
- 空库验证；
- 现有数据验证；
- 持久数据库验证；
- 迁移失败回滚结果。

不得修改已有 migration，不得自行解决 Alembic 多 head；遇到 head 冲突必须阻塞上报。

## 8. 统一执行器接口

公共执行器任务必须遵守以下语义：

```python
await executor.preview(document, rows, reference_snapshot, policy)
await executor.execute(document, rows, reference_snapshot, policy)
```

- `document` 必须是 `MappingDocumentV1`；
- `rows` 是内存中的输入行；
- `reference_snapshot` 由 caller adapter 预加载；
- `policy` 是服务端生成并校验过的 `MappingCallerPolicyV1`；
- preview 和 execute 共用相同规则函数；
- executor 只返回 `MappingResultV1`；
- executor 不创建/提交/回滚数据库事务；
- executor 不写 DWD、ODS、业务表；
- executor 不调用 Pipeline、PushTarget、通知或凭证服务；
- 敏感字段的 `trace.before/after` 必须脱敏。

## 9. 错误和 HTTP 合同

### 9.1 Policy/兼容错误

```text
MAPPING_CALLER_UNSUPPORTED
MAPPING_RULE_TYPE_FORBIDDEN
MAPPING_ASSET_FORBIDDEN
MAPPING_FIELD_FORBIDDEN
MAPPING_REFERENCE_DATASET_FORBIDDEN
MAPPING_TARGET_FIELD_PROTECTED
MAPPING_EFFECT_FORBIDDEN
MAPPING_SCHEMA_CHANGED
MAPPING_VERSION_CONFLICT
MAPPING_LOSSY_WRITE_BLOCKED
MAPPING_LEGACY_DOWNGRADE_UNSUPPORTED
```

### 9.2 规则执行错误

```text
MAPPING_VALUE_UNMAPPED
MAPPING_LOOKUP_DUPLICATE_KEY
MAPPING_LOOKUP_CONFLICT
MAPPING_LOOKUP_NO_MATCH
MAPPING_TYPE_CONVERSION_FAILED
MAPPING_FORMAT_INVALID
MAPPING_SPLIT_MERGE_INVALID
MAPPING_CYCLE_DETECTED
MAPPING_TARGET_DUPLICATE
```

### 9.3 HTTP

- RBAC 不足：403；
- policy 或规则配置不合法：422；
- Schema 变化：422 + `MAPPING_SCHEMA_CHANGED`；
- 乐观锁冲突：409 + `MAPPING_VERSION_CONFLICT`；
- 业务执行失败：根据 caller 合同返回结构化结果，不伪装为成功。

## 10. 事件 Envelope

所有公共映射事件必须使用：

```json
{
  "event_type": "mapping_rule_set_published",
  "event_version": 1,
  "event_id": "...",
  "idempotency_key": "...",
  "occurred_at": "...",
  "actor": "...",
  "caller": "warehouse",
  "binding_id": "...",
  "mapping_version": 3,
  "schema_hash": "...",
  "rebuild_policy": "auto|manual|block",
  "payload": {}
}
```

事件不得包含 secret、完整工资 payload、未授权参考值或未经脱敏的 before/after。

## 11. 首期阻断标准

以下任一项未通过，禁止宣称 017 首期完成：

- 任一七类规则缺少后端执行测试；
- 任一调用方没有实际挂载同一 `MappingWorkspace`；
- 任一 adapter 静默丢字段；
- 任一 ODS 写入 `expense_type`；
- 任一 Sink 主键、期间、白名单、批次或事务回归失败；
- 公共 DTO v1 与 UCP Legacy v1 混用；
- 存在未解释的 skipped 测试；
- 存在失败但被标记为通过的测试；
- 存在未处理的 P0/P1 缺陷；
- 事件没有幂等键或审计关联；
- 存在第二套长期 MappingWorkspace 或执行器。

## 12. 标准交付报告

每个 AI 完成任务后必须返回：

```markdown
## 任务
- 编号：
- 目标：
- 前置任务：

## 已阅读
- 需求文档：
- 代码文件：
- 协同合同：

## 修改文件
- 新增：
- 修改：
- 未修改的关键边界文件：

## 实现结果
- 输入/输出合同：
- 兼容行为：
- 错误码：
- 副作用边界：

## 测试命令与结果
- 命令：
- 结果：
- skipped/警告：

## 完成证据
- fixture：
- migration：
- UI 状态：
- diff/审计/回归：

## 未完成与阻塞
- 无 / 具体说明：

## 风险
- ...

## 建议主代理勾选
- 是 / 否，原因：
```

AI 不得在未实际运行测试时写“测试通过”，不得在存在阻塞时建议勾选。

## 13. 主代理审核清单

主代理在勾选前必须检查：

- 任务卡范围没有扩大；
- 允许/禁止文件符合；
- 公共 DTO、Policy、错误码和版本没有自行变体；
- 共享文件没有并发覆盖；
- 测试命令真实存在且结果可复核；
- 关键失败态和安全边界有测试；
- 无未知字段丢失、无双执行、无 ODS 回写、无 Sink 绕过；
- 交付报告完整；
- `git diff --check` 通过；
- 只有主代理可以将 `[ ]` 改为 `[x]`。
