# Foundation 上下文包

## 任务

连续任务组：A0001-A0009。必须由主代理或指定架构 AI 串行完成；完成前禁止开始 M/W/P/U/B 任务。

## 目标

建立公共模块位置、DTO v1、Caller Policy、adapter 接口、版本/审计迁移和基础测试，使后续 AI 不需要自行定义跨调用方合同。

## 前置

无；但必须完成 `START_HERE.md` 的全部阅读和 git 状态保护。

## 必读

- `../spec.md` §4.2-§6
- `../ai-execution-protocol.md` §4-§10
- `../code-status-review-and-revision-decision.md` §5-§8
- `../../012-data-warehouse-ucp-integration/r0101-rule-scope-decision.md`
- `../../011-universal-connector-platform/contracts/x0210-warehouse-asset-sink-contract.md`
- `hr-portal/backend/app/ucp/action_contract.py`
- `hr-portal/backend/app/warehouse/models.py`
- `hr-portal/backend/app/warehouse/schemas.py`
- `hr-portal/backend/alembic/versions/` 中当前 head 链

## 允许修改

- `hr-portal/backend/app/mapping/`（新增目录）
- `hr-portal/backend/tests/test_mapping_contract_v1.py`（新增）
- `hr-portal/backend/tests/test_mapping_policy_v1.py`（新增）
- `hr-portal/backend/alembic/versions/<new_revision>_mapping_metadata.py`（新增）
- `hr-portal/backend/app/warehouse/models.py`
- `hr-portal/backend/app/warehouse/schemas.py`
- `hr-portal/backend/app/warehouse/router.py`
- `hr-portal/frontend/src/components/mapping/`（新增目录）
- `hr-portal/frontend/src/api/mapping.ts`（新增）

## 禁止修改

- `backend/app/ucp/action_contract.py` 的 Legacy v1 语义。
- `backend/app/ucp/pipeline_engine.py`。
- `backend/app/warehouse/standardization_engine.py`。
- `backend/app/warehouse/asset_sink.py`。
- `backend/app/push/*`。
- 任何已有 Alembic migration。

## 输入合同

- `MappingDocumentV1.mappingSchemaVersion=1`。
- `MappingCallerPolicyV1`。
- `MappingCompatibilityV1`、`MappingResultV1`。
- append-only 版本、`expectedVersion`、HTTP 409 `MAPPING_VERSION_CONFLICT`。
- ODS→DWD 规则正文仍只存 `standardization_rules`。

## 输出合同

1. `app/mapping` 至少提供 DTO、Policy、错误码、adapter protocol、executor protocol 的可导入定义。
2. 公共 API 提供 validate、preview、datasets、dependencies、publish、rebuild 路由骨架，未经 caller adapter 不直接操作业务数据。
3. 元数据 migration 只创建目录/版本/绑定/依赖/审计/重算记录；不得创建第二张 ODS→DWD 规则正文表。
4. 已发布版本不可更新；草稿更新校验 `expectedVersion`。
5. `warehouse.mapping` 仅用于公共目录/版本/发布/依赖，不替代各调用方既有 RBAC。
6. 输出旧角色到新目录、发布、回滚和执行权限的迁移矩阵，并明确发布/回滚操作码不能替代调用方执行权限。

## 测试合同

### Given

- 合法/非法 `MappingDocumentV1` fixture；
- 五类 `MappingCallerPolicyV1` fixture；
- 草稿、已发布版本和过期 `expectedVersion`；
- 旧角色、目录发布/回滚权限和调用方执行权限的组合 fixture。

### When

- 解析 DTO；
- 校验 Policy；
- 发布、更新、冲突更新、回滚元数据；
- 读取公共 API。

### Then

- 非法 schema 返回 422；
- 版本冲突返回 409 + `MAPPING_VERSION_CONFLICT`；
- 公共层没有规则正文副本；
- Policy/RBAC 错误可区分；
- 旧角色迁移后，保存/发布/回滚/执行按独立权限组合正确 allow/deny；RBAC 缺失返回 403，policy effect 禁止返回 `MAPPING_EFFECT_FORBIDDEN`；
- migration upgrade/downgrade 可运行。

## 完成证据

- 新旧 Alembic head 输出；
- migration upgrade/downgrade 结果；
- DTO/Policy fixture；
- 后端测试命令及真实输出；
- 未修改禁止文件的 `git diff` 证明。

## 阻塞条件

- Alembic 多 head；
- 无法确定现有 `warehouse_model_versions` 是否能承载快照；
- DTO 字段与 017 spec 矛盾；
- 需要改 Legacy v1 才能通过。

## 不在范围

- 七类规则具体执行；
- Workspace UI；
- Warehouse/UCP/Sink/PushTarget adapter；
- 工资和成本中心业务迁移。
