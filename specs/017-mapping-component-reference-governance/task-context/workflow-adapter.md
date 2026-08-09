# Workflow Adapter 上下文包

## 任务

P0301-P0305。

## 前置

- Foundation、Component Core、Rule Plugins 已验收。
- UCP Transform adapter 未必完成，但旧字段转换 fixture 必须已盘点。

## 必读

- `../spec.md` §4.6、§4.9
- `../ui-interaction.md` §6
- `../testing-acceptance.md` §3-§4
- `hr-portal/backend/app/ucp/pipeline_engine.py`
- `hr-portal/backend/app/ucp/pipeline_template.py`
- `hr-portal/frontend/src/views/ucp/PipelineDesignerView.vue`

## 允许修改

- `hr-portal/backend/app/mapping/adapters/workflow.py`（新增）
- `hr-portal/backend/app/ucp/pipeline_node_catalog.py`
- `hr-portal/backend/app/ucp/pipeline_template.py`
- `hr-portal/backend/app/ucp/pipeline_engine.py`
- `hr-portal/backend/tests/test_workflow_mapping_node.py`（新增）
- `hr-portal/frontend/src/views/ucp/PipelineDesignerView.vue`
- `hr-portal/frontend/src/views/ucp/PipelineDesignerView.spec.ts`

## 禁止修改

- Legacy `TRANSFORM version=1` 字段含义；其兼容由 U0401-U0404 负责。
- Sink 写入、PushTarget 发送、Warehouse DWD 写入。
- 连接器凭证和事件总线。

## 输入合同

- 公共 `MappingDocumentV1`；
- `MappingCallerPolicyV1(caller='workflow')`；
- 旧字段转换节点 fixture，包含未知扩展字段和无法由公共 DTO 表达的 legacy 属性。

## 输出合同

- 新节点使用公共 Workspace 和公共 executor；
- 旧节点可读取、回显、运行；
- 升级前保存 snapshot；
- Workflow 仍负责上下文、顺序、条件、重试、执行记录和调用下游动作；
- mapping 节点只处理输入行到输出行和 trace；
- 未知扩展字段在 read/save/reopen/upgrade/rollback 后无损保留；不能无损表达时返回 `MAPPING_LOSSY_WRITE_BLOCKED`，并通过 `MappingCompatibilityV1` 标明阻断原因。

## 测试合同

Given：旧节点、新节点、多个输入 Schema、失败策略。

When：试运行、保存、重开、升级、回滚、Pipeline 执行。

Then：旧语义不变；新节点七类可由 policy 控制；trace 可审计；mapping 失败不吞掉调用方重试/状态；未知字段完成 read/save/reopen/upgrade/rollback round-trip，无法无损表达时返回 `MAPPING_LOSSY_WRITE_BLOCKED`；无双执行。

### 完成证据

- 旧节点兼容 fixture、升级 snapshot 和回滚结果；
- 未知扩展字段 round-trip 对比，或有损阻断错误响应；
- 试运行、Pipeline 执行和无双执行测试的真实输出；
- `PipelineDesignerView` 真实挂载公共 Workspace 的组件测试。

## 阻塞条件

- 需要修改 UCP Legacy v1 语义；
- 旧节点格式未能完整读取；
- 需要改变 Pipeline 重试或事件总线全局策略。

## 不在范围

- UCP Legacy v1 升级策略本身；
- Sink/PushTarget adapter；
- 工资迁移。
