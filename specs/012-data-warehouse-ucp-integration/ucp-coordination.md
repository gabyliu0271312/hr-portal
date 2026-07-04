# UCP 协同设计

## 1. 核心结论

DataSource 不作为未来统一连接器模型继续扩展，而是降级为数据仓库落表配置。UCP 作为未来统一数据接入/连接器平台主线。

短期：保留 DataSource。
中期：DataSource 可绑定 UCP 资源。
长期：数据仓库通过 UCP API 消费数据连接能力。

---

## 2. 职责边界

### 数据仓库负责

- 表资产。
- 字段资产。
- 数据模型。
- 指标目录。
- 数据治理。
- 影响分析。
- 数据预览。

### UCP 负责

- 外部系统。
- 数据资源/API/文件/Webhook。
- 凭证。
- Adapter。
- 连接器配置。
- Pipeline。
- 事件总线。
- 执行监控。
- 告警。

---

## 3. 当前桥接方式

UCP 分支已有：

```text
app/ucp/datasource_bridge.py
```

作用：

```text
UCP Pipeline Step → DATASOURCE_BRIDGE_ADAPTER → DataSource → sync_to_table → RegisteredTable/业务表
```

要求：

- 不破坏现有 DataSource 手动触发和定时同步。
- UCP 可复用已有同步能力。
- 数据仓库可继续使用 SyncRun 展示同步历史。

---

## 4. 一期协同要求

一期只做轻绑定：

- RegisteredTable 增加 ucp_system_id。
- RegisteredTable 增加 ucp_resource_id。
- RegisteredTable 增加 ucp_connector_config_id。
- 这些字段均可空。
- 不做强外键。
- UI 展示“已关联/未关联 UCP 资源”。
- UCP 未启用时显示友好提示。

---

## 5. 二期协同要求

二期增加资源选择：

```text
数据仓库新建/编辑数据资产
  → 选择来源：手工维护 / DataSource / UCP 资源
  → 如果选择 UCP 资源，打开资源选择器
  → 保存 ucp_* 引用和资源快照
```

资源选择器展示：

```text
系统名称
资源名称
资源类型
Adapter
最近测试状态
最近执行状态
```

---

## 6. 长期独立应用要求

若 UCP 独立部署：

- 数据仓库不得直接查 UCP 数据表。
- 通过 HTTP API 获取系统、资源、执行状态。
- 通过事件或 webhook 接收同步完成/失败通知。
- ucp_* 字段只保存远端 ID 和展示快照。

建议 API：

```text
GET /ucp/systems
GET /ucp/resources?system_id=
GET /ucp/resources/{id}
GET /ucp/resources/{id}/preview
POST /ucp/pipelines/{id}/trigger
GET /ucp/executions?resource_id=
```

---

## 7. UI 配合

数据仓库资产详情展示：

```text
来源类型：DataSource / UCP / 手工
来源系统
来源资源
最近测试状态
最近同步状态
跳转数据连接配置
```

禁止在数据仓库 UI 中展示：

- 凭证明文。
- 凭证编辑表单。
- Pipeline 编排器。
- 事件触发器配置。
- 熔断/重试深度配置。

这些必须跳转到数据连接/UCP。

---

## 8. 开发注意事项

1. 不要删除 DataSource。
2. 不要直接把 DataSource 全量迁移到 UCP。
3. 不要让数据仓库强依赖 UCP 表存在。
4. 不要在数据仓库重复做凭证中心。
5. 不要在数据仓库重复做 Pipeline 编排。
6. UCP bridge 是过渡期关键能力，必须保留。



---

## 9. 评审修订后的 UCP 协同策略

### 9.1 `/warehouse/ucp/*` 的重新定位

`/api/v1/warehouse/ucp/*` 不再视为重复建设 UCP。它的正确定位是：

```text
数据仓库侧防腐层 / 薄代理层 / 独立应用化预留层
```

一期不要求完整实现，但代码边界要按未来可代理设计：

- 数据仓库业务代码不直接散落查询 UCP 内部表。
- 统一通过 warehouse-side service adapter 获取 UCP 摘要。
- UCP 不可用时，返回友好降级，不影响 DataSource 主路径。

### 9.2 ConnectorSystemConfig 降级

主绑定字段：

```text
ucp_system_id
ucp_resource_id
```

兼容字段：

```text
ucp_connector_config_id
```

`ucp_connector_config_id` 仅用于读取旧配置或迁移期兼容，不允许作为新建资产绑定 UCP 的主路径。

### 9.3 一期同库但不强耦合

一期可以同库部署、同库读取、复用 HR Portal 权限和菜单，但必须遵守：

- 不加跨 UCP 表的强 FK。
- 保存远端 ID、名称快照、状态快照、跳转 URL。
- 数据仓库页面不因 UCP 表不存在而崩溃。
- UCP 未启用时，现有 DataSource / SyncRun / 自有接口拉取仍完全可用。

### 9.4 菜单和权限分阶段

一期：

- 012 只建设数据仓库入口。
- UCP 复杂配置通过跳转进入现有 UCP 页面。
- 不在 012 一期承担 UCP 顶层导航迁移。

权限：

- 查看数据仓库资产详情不要求 UCP 配置权限。
- 数据仓库可展示 UCP 只读摘要。
- 点击“去 UCP 配置”后，由 UCP 自己的权限控制编辑能力。

### 9.5 API 路径统一

外部 API 路径统一写作：

```text
/api/v1/warehouse/*
/api/v1/ucp/*
```

后端 router 内部可以使用 `/warehouse` 或 `/ucp` 前缀，但文档和前端 API 封装必须使用最终外部路径。
