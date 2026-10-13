# UCP × 数据仓库协同边界说明

版本：v1.0  
日期：2026-07-04  
适用范围：`011-universal-connector-platform` 与 `012-data-warehouse-ucp-integration` 并行开发期间及未来独立应用拆分阶段。

---

## 1. 核心结论

UCP 是长期统一的数据连接 / 连接器平台；数据仓库是长期统一的数据资产 / 建模 / 指标 / 治理平台。两者可以在 HR Portal 内并行建设，也必须具备未来作为两个独立应用开放的边界。

当前结论：

- 不用 UCP 立即替换 `DataSource`。
- `DataSource` 在数据仓库侧降级为“落表配置 / 接入表配置”。
- UCP 负责外部系统、资源、凭证、Adapter、Pipeline、事件、执行、监控。
- 数据仓库负责表资产、字段资产、数据建模、指标目录、治理、影响分析、数据预览。
- 两边通过桥接、引用 ID、API、跳转和事件协同，不能互相直接侵入内部模型。

---

## 2. 与数据仓库规划的关系

数据仓库 012 规划中，将现有 `DataSource + SyncRun` 拆解理解为：

```text
接口定义 / 技术规格      → UCP AdapterDefinition / ConnectorResource
连接器实例 / 业务配置    → UCP ConnectorSystem / Credential / Resource
同步任务 / 调度和目标表  → UCP Pipeline + 数据仓库落表配置
执行日志                → UCP Execution + SyncRun 过渡展示
```

但一期不能强行迁移：

- 数据仓库仍可展示 `DataSource` 同步历史。
- UCP 可通过 `datasource_bridge.py` 复用现有 `sync_to_table`。
- 数据仓库资产可保存 `ucp_system_id`、`ucp_resource_id`、`ucp_connector_config_id` 等可空引用。
- 不做强外键，不要求 UCP 表一定存在。

---

## 3. UCP 必须坚持的职责边界

UCP 可以做：

- 外部系统注册。
- API / 文件 / Webhook / 数据表等资源定义。
- 凭证中心和密钥加密。
- Adapter 定义和执行。
- Pipeline 编排和执行。
- 事件总线、触发器、死信队列。
- 执行日志、监控、告警。
- 对数据仓库提供资源选择、预览、触发、执行状态 API。

UCP 不应做：

- 数据仓库数据建模编辑器。
- 指标口径目录和指标计算引擎。
- 表字段资产治理主页面。
- 数据仓库血缘/影响分析的主 UI。
- 数据仓库主题域和数据集关系管理。

如 UCP 页面需要展示数据仓库信息，只能做引用、跳转、摘要和执行状态，不复制数据仓库配置能力。

---

## 4. 数据仓库侧不能越界的能力

数据仓库 UI 不应直接做：

- 凭证明文展示或凭证编辑。
- Pipeline 画布编排。
- Adapter 深度配置。
- 事件触发器配置。
- 熔断、重试、死信等运维参数配置。

数据仓库应通过“跳转到数据连接/UCP”完成这些动作。

---

## 5. 一期推荐协同方式

一期只做轻绑定：

```text
RegisteredTable / 数据资产
  - source_kind: manual | datasource | ucp
  - datasource_id: nullable
  - ucp_system_id: nullable
  - ucp_resource_id: nullable
  - ucp_connector_config_id: nullable
  - source_snapshot: nullable JSON
```

UCP 提供：

```text
GET /ucp/systems
GET /ucp/resources?system_id=
GET /ucp/resources/{id}
GET /ucp/resources/{id}/preview
POST /ucp/pipelines/{id}/trigger
GET /ucp/executions?resource_id=
```

数据仓库保存远端 ID 与展示快照，不直接查 UCP 内部表。

---

## 6. 当前分支桥接要求

当前分支已有或应保留：

```text
hr-portal/backend/app/ucp/datasource_bridge.py
```

桥接路径：

```text
UCP Pipeline Step
  → DATASOURCE_BRIDGE_ADAPTER
  → DataSource
  → sync_to_table
  → RegisteredTable / 业务表 / SyncRun
```

要求：

- 不破坏现有 DataSource 手动触发和定时同步。
- 不删除 `SyncRun` 历史展示能力。
- UCP 执行日志与 SyncRun 可通过 trace_id / run_id 建立弱关联。
- 桥接失败时，UCP Execution 和 SyncRun 均应可定位失败原因。

---

## 7. 独立应用长期要求

若未来 UCP 与数据仓库拆成两个应用：

- UCP 暴露稳定 HTTP API 和事件，不暴露数据库表作为集成契约。
- 数据仓库只保存 UCP 远端 ID、名称快照、状态快照、跳转 URL。
- 两边认证通过应用级 token / SSO / 服务账号解决。
- 两边权限命名空间分离：`ucp.*` 与 `warehouse.*`。
- 菜单可在门户中并列：`数据连接` 与 `数据仓库`。

---

## 8. 原子任务执行要求

凡 UCP 原子任务涉及以下关键词，必须在任务内显式检查本文件：

- DataSource
- SyncRun
- RegisteredTable
- 数据仓库
- 数据资产
- 落表
- 资源选择器
- 预览
- Pipeline 触发
- 执行状态
- 主数据治理
- 影响分析

如果任务原描述没有写清 UI / 测试 / 数据仓库协同要求，必须先补 `atomic-tasks.md` 再开发。
