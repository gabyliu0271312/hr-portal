# Component Core 上下文包

## 任务

连续任务组：M0101-M0105、M0120-M0124。仅在 Foundation 上下文包被主代理验收后开始。

## 目标

实现单一 MappingWorkspace、公共 DTO/Policy 使用方式、插件注册表、纯 MappingExecutor、统一校验/预览、adapter SDK、版本生命周期和审计入口。

## 前置

- A0001-A0009 已由主代理勾选。

## 必读

- `../spec.md` §4.3-§5.2
- `../ui-interaction.md` §1-§4
- `../testing-acceptance.md` §1-§4
- `../ai-execution-protocol.md` §5-§10
- `foundation.md`

## 允许修改

- `hr-portal/backend/app/mapping/`
- `hr-portal/backend/tests/test_mapping_executor.py`（新增）
- `hr-portal/backend/tests/test_mapping_validation.py`（新增）
- `hr-portal/backend/tests/test_mapping_version_lifecycle.py`（新增）
- `hr-portal/frontend/src/components/mapping/`
- `hr-portal/frontend/src/components/mapping/*.spec.ts`
- `hr-portal/frontend/src/api/mapping.ts`

## 禁止修改

- 任一调用方页面、Pipeline、Sink、PushTarget、标准化执行器。
- 任一业务表或 ODS/DWD 写入服务。
- 已有 migration。

## 输入合同

- Foundation 输出的 DTO、Policy、错误码、adapter protocol。
- 纯 executor 接口：`preview(document, rows, reference_snapshot, policy)` 和 `execute(...)`。
- 七类全部必须注册，但具体插件实现由 `rule-plugins.md` 交付。

## 输出合同

- 只有一个 `MappingWorkspace` 导出入口。
- 只有一个 rule plugin registry；调用方以 context/policy/adapter 传入差异。
- executor 不创建事务、不访问凭证、不写数据、不调用 Pipeline/Push/通知。
- validate/preview 使用同一规则函数；trace 默认脱敏。
- adapter SDK 统一返回 `MappingCompatibilityV1`；有损回写统一阻断。
- 版本/发布/回滚服务只操作 Foundation 创建的元数据与调用方 adapter，不复制 Warehouse 规则正文。
- 公共事件必须使用统一 Envelope；发布、数据变更和依赖重算事件分别标明消费者、`idempotency_key`、重试策略和审计关联，通知消费者不得重复发送。

## 测试合同

### Given

- 七类占位插件；
- 合法 policy；
- 敏感字段和普通字段行；
- 无损和有损 adapter stub。

### When

- 挂载 Workspace；
- 调用 validate、preview、execute；
- 尝试保存有损 legacy 文档。

### Then

- Workspace 只通过 registry 找插件；
- executor 无副作用；
- preview/execute 使用同一结果逻辑；
- 三种顺序独立：Workspace `displayOrder` 只影响展示/规则列表序列，Lookup `priority` 只影响同一 Lookup 的命中顺序，012 Warehouse 清洗阶段顺序由 adapter/012 语义决定，三者互不覆盖；
- 重复投递按 `event_id`/`idempotency_key` 去重；消费者临时失败按合同重试，重试耗尽进入可审计失败状态且不得重复通知；
- 敏感 trace 不泄露明文；
- 有损写入返回 `MAPPING_LOSSY_WRITE_BLOCKED`；
- 不存在调用方代码依赖。

## 完成证据

- Workspace/registry/executor 模块路径；
- 组件挂载测试；
- executor 无数据库副作用测试；
- adapter compatibility fixture；
- 主代理确认没有修改调用方文件。

## 阻塞条件

- Foundation 未完成；
- 任一规则插件需修改 DTO；
- 需要直接读取调用方数据库才能执行；
- 有第二个 Workspace 导出入口。

## 不在范围

- 七类规则具体算法；
- 调用方嵌入；
- 业务迁移和 DWD 写入。
