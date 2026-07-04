# HR Portal 数据仓库与 UCP 数据连接平台协同建设 Spec

> 目录：`specs/012-data-warehouse-ucp-integration`  
> 状态：Draft for Development  
> 编写日期：2026-07-04  
> 适用范围：HR Portal main 分支 + `feature/ucp-data-connection-platform` 分支后续合并/并行开发  
> 核心目标：将 HR Portal 从“HR 提效工具 + 报表中台”渐进升级为“数据仓库应用 + 数据连接/UCP 平台”双应用架构。

## 0. 开发执行入口

后续任何模型接手开发时，必须先阅读 `START_HERE.md`，并优先阅读和遵守以下文件：

1. `spec.md`：总体架构、分期、数据模型、API、权限、验收。
2. `ui-interaction.md`：UI 交互设计需求与评估。
3. `ui-implementation-guardrails.md`：UI 实施守则与禁止项。
4. `atomic-tasks.md`：原子级开发任务清单，开发时按此逐项勾选。
5. `testing-acceptance.md`：测试要求和验收标准。
6. `ucp-coordination.md`：与 UCP 数据连接平台的协同边界。

`tasks.md` 保留为阶段级任务视图；真正开发应以 `atomic-tasks.md` 为准。

## 1. 背景与目标

现有 HR Portal 已具备以下底座：

- `DataSource` / `SyncRun`：表级轻量数据接入配置与同步历史。
- `RegisteredTable`：动态业务表注册中心。
- `TableColumn`：字段元数据、敏感标记、主键、计算字段、权限维度等。
- `DataSet` / `DataSetTable` / `DataSetRelation`：数据集与表间关联模型。
- 报表、权限、调度、日志、自动通知、数据对比等能力。

`feature/ucp-data-connection-platform` 分支已经引入 UCP 通用连接器平台，包含：

- `ConnectorCredential`：凭证中心。
- `ConnectorSystem` / `ConnectorResource`：业务系统与资源管理。
- `AdapterDefinition`：适配器元数据。
- `ConnectorSystemConfig`：旧连接器配置中心兼容字段；后续不作为数据仓库主绑定对象，主绑定应使用 `ConnectorSystem` + `ConnectorResource`。
- `ConnectorPipelineConfig` / `ConnectorPipelineExecution`：Pipeline 配置与执行。
- `UcpEvent` / `ConnectorEventTrigger` / `UcpEventDelivery`：事件总线与派发。
- `datasource_bridge_adapter`：UCP 与现有 DataSource 的桥接。

本 Spec 要解决的问题：

1. 数据仓库应用和 UCP 数据连接平台如何长期共存、协同、独立开放。
2. 当前 UI 原型如何按评估后的交互边界落地。
3. 如何从一期可落地能力逐步演进到最终蓝图。
4. 如何拆成最小可实施步骤，每完成一步即可标记。
5. 如何明确测试要求、验收标准，确保其他模型可直接接手开发。

---

## 2. 产品定位

### 2.1 数据仓库应用定位

数据仓库应用负责“数据资产、建模、指标、治理、开放”。

核心能力：

- 数据资产目录：表资产、字段资产、来源、分层、负责人、状态。
- 数据建模：字段定义、快速关联、可视化建模、输出字段配置、预览、发布。
- 指标管理：指标目录、业务口径、依赖数据集/字段、负责人、状态。
- 数据治理：数据分层、影响分析、基础质量检查、血缘/引用关系。
- 数据开放：供报表、帆软 BI、API、自动通知等下游消费。

数据仓库不直接承担复杂连接器、凭证、Pipeline、事件总线配置。

### 2.2 UCP 数据连接平台定位

UCP 负责“系统、资源、凭证、连接器、Pipeline、事件、监控”。

核心能力：

- 系统资源管理：外部系统、API、报表、数据库表、文件、Webhook 等资源。
- 凭证中心：统一加密凭证、轮换、多环境、测试。
- Adapter 管理：适配器定义、参数 schema、样例。
- 连接器配置：协议、认证、映射、重试、熔断、通知、测试。
- Pipeline 编排：多步骤跨系统同步/推送/联动。
- 事件总线：事件接入、匹配、派发、重试、死信。
- 执行监控：执行历史、步骤详情、失败项、告警。

### 2.3 两者关系

短期：

```text
DataSource / SyncRun 继续作为 HR 数据仓库落表配置。
UCP 通过 datasource_bridge_adapter 调用已有 DataSource 同步链路。
```

中期：

```text
DataSource / 数据资产可选择绑定 UCP 的 ConnectorSystem / ConnectorResource；`ConnectorSystemConfig` 仅作为旧配置兼容字段，不作为新主路径。
数据仓库通过 UCP 资源选择器创建落表任务。
```

长期：

```text
UCP 管连接、凭证、资源、Pipeline、事件、监控。
数据仓库管表资产、模型、指标、治理、数据开放。
DataSource 降级为“数据仓库落表订阅/落表配置”。
```

---

## 3. 最终蓝图信息架构

### 3.1 顶层菜单

最终建议顶层菜单：

```text
首页
数据仓库
数据连接
提效工具
业务应用
系统设置
```

说明：

- `数据仓库`：数据资产、建模、指标、治理、开放。
- `数据连接`：即 UCP 数据连接平台，不再另设“连接器平台”一级菜单。
- `系统设置`：权限、参数、日志等平台基础配置。

### 3.2 数据仓库菜单

```text
数据仓库
├── 数据资产
├── 数据建模
│   ├── 字段定义
│   ├── 快速关联
│   ├── 可视化建模
│   └── 物理表/视图生成（后续）
├── 指标管理
├── 数据治理
│   ├── 数据分层
│   ├── 影响分析
│   ├── 基础质量检查
│   └── 血缘关系（后续）
└── 数据开放（后续）
```

### 3.3 数据连接/UCP 菜单

```text
数据连接
├── 首页
├── 系统资源
├── 凭证中心
├── 连接器配置
├── Pipeline 编排
├── 事件总线
├── 执行监控
└── 告警中心（后续）
```

### 3.4 不推荐的信息架构

不推荐：

```text
数据仓库
└── 数据连接 Tab

系统设置
└── 接口管理

数据连接 和 连接器平台 两个顶层并列
```

原因：职责重复，长期独立应用化时边界不清。

---

## 4. 分期路线

## 4.1 一期：最小可用数据仓库门户 + UCP 桥接兼容

目标：不重构现有 DataSource，不阻塞 UCP 分支，先完成数据仓库应用的产品化入口。

范围：

1. 新增数据仓库顶层菜单。
2. 将现有字段管理、表间关联、数据视图能力迁移/映射到数据仓库信息架构。
3. 新增数据资产页，基于 `RegisteredTable` 展示表资产。
4. 扩展表资产元数据：分层、主题域、负责人、来源系统、状态。
5. 扩展数据集元数据：分层、主题域、负责人、状态、业务口径。
6. 快速关联保留并优化为三步式。
7. 可视化建模 V1 采用“半可视化”方案，不做自由画布。
8. 新增指标目录，不做复杂计算引擎。
9. 新增影响分析基础能力。
10. 保留现有 DataSource / SyncRun；新增 UCP 引用字段为后续桥接准备。

一期不做：

- 完整字段级血缘图。
- 完整质量规则调度平台（但需预留数据仓库内置轻量 ELT/质量执行能力）。
- 复杂跨系统 ETL / Pipeline 编排（归 UCP）；数据仓库仅预留入仓后轻量 ELT、数据集物化、指标物化、质量规则、快照拉链能力。
- 可视化建模自由拖拽连线。
- 将 DataSource 完全迁移到 UCP。

## 4.2 二期：数据治理增强 + UCP 深度协同

目标：数据仓库和 UCP 从“桥接兼容”进入“资源引用协同”。

范围：

1. 数据仓库新建数据资产时，可从 UCP 选择资源。
2. DataSource / 数据资产主绑定 `ucp_system_id`、`ucp_resource_id`；`ucp_connector_config_id` 仅兼容旧配置，不能作为新能力主路径。
3. 数据资产页展示 UCP 资源、测试状态、同步状态。
4. 数据治理增加基础质量规则：非空、唯一、枚举、日期格式。
5. 影响分析覆盖表、字段、数据集、报表、指标、自动通知。
6. 可视化建模 V2 支持更强交互：节点拖拽、连线编辑、自动布局。
7. UCP 执行监控状态可回流到数据仓库资产详情页。

## 4.3 三期：独立应用化与服务边界

目标：数据仓库与 UCP 可以作为独立应用开放。

范围：

1. 数据仓库服务边界明确：`/warehouse/*` 或独立服务 API。
2. UCP 服务边界明确：`/ucp/*` 或独立服务 API。
3. 数据仓库通过 API 消费 UCP 资源目录、预览、执行、状态。
4. UCP 通过事件通知数据仓库同步完成、失败、schema 变更。
5. 完善数据血缘图谱、质量趋势、告警中心。
6. 数据开放能力：API 服务、帆软同步、订阅推送。

---

## 5. 数据模型设计

### 5.1 扩展 RegisteredTable

建议新增字段：

```text
warehouse_layer        string    ODS/DWD/DWS/ADS，默认 ODS
subject_area           string    主题域，如 组织人事/薪酬/绩效/招聘
owner_user_id          bigint    负责人，可空
owner_name             string    负责人展示名，可空
source_system          string    来源系统，如 北森/飞书/手工上传/UCP
asset_status           string    draft/published/disabled/archived，默认 published
ucp_system_id          bigint    可空，引用 UCP connector_system.id
ucp_resource_id        bigint    可空，引用 UCP connector_resource.id
ucp_resource_name_snapshot string 可空，UCP 资源名称快照
ucp_resource_status_snapshot string 可空，UCP 资源状态快照
ucp_jump_url           string    可空，跳转 UCP 配置/详情页
ucp_connector_config_id bigint   可空，仅兼容旧 ConnectorSystemConfig，不作为新主绑定
last_quality_status    string    unknown/pass/warn/fail
last_quality_checked_at datetime 可空
```

注意：

- 不强制 DB 外键到 UCP 表，避免未来独立服务拆分时强耦合。
- 如果同库部署，可先不加 FK，仅保存 ID 与快照。

### 5.2 扩展 DataSet

建议新增字段：

```text
warehouse_layer        string    ODS/DWD/DWS/ADS，默认 DWD
subject_area           string
owner_user_id          bigint
owner_name             string
status                 string    draft/published/disabled/archived
business_definition    text      业务口径
version                int       默认 1
published_at           datetime
published_by           bigint
```

### 5.3 新增 dataset_output_fields

用途：管理模型输出字段，支持自定义输出字段名和业务说明。

```text
id                     bigint pk
dataset_id             bigint
source_alias           string
source_column          string
output_code            string
output_label           string
data_type              string
description            text
agg_role               string    dimension/measure
is_sensitive           bool
is_visible             bool
display_order          int
created_at             datetime
updated_at             datetime
```

### 5.4 新增 warehouse_metrics

一期指标目录表。

```text
id                     bigint pk
metric_code            string unique
metric_name            string
metric_type            string    count/sum/ratio/derived/text
subject_area           string
business_definition    text
calculation_desc       text      业务口径描述
formula_expr           text      可选，暂不要求执行
related_dataset_id     bigint nullable
related_fields         json      [{table, column, role}]
stat_period            string    daily/monthly/quarterly/yearly/ad_hoc
owner_user_id          bigint nullable
owner_name             string nullable
status                 string    draft/published/disabled/archived
version                int
created_by             bigint nullable
created_at             datetime
updated_at             datetime
```

### 5.5 新增 warehouse_quality_rules（二期）

```text
id                     bigint pk
asset_type             string    table/dataset/field
asset_code             string
rule_type              string    not_null/unique/enum/date_format/custom_sql
rule_config            json
enabled                bool
severity               string    info/warn/error
last_run_status        string
last_run_at            datetime
created_at             datetime
updated_at             datetime
```

### 5.6 新增 warehouse_quality_runs（二期）

```text
id                     bigint pk
rule_id                bigint
status                 string    pass/warn/fail/error
checked_count          int
failed_count           int
sample_rows            json
message                text
started_at             datetime
finished_at            datetime
```

---

## 6. API 设计要求

一期建议新增或扩展以下 API。

### 6.1 数据资产

```text
GET    /api/v1/warehouse/assets
GET    /api/v1/warehouse/assets/{table_name}
PATCH  /api/v1/warehouse/assets/{table_name}
GET    /api/v1/warehouse/assets/{table_name}/columns
GET    /api/v1/warehouse/assets/{table_name}/references
```

资产列表支持筛选：

```text
keyword
warehouse_layer
subject_area
asset_status
source_system
owner_user_id
quality_status
```

### 6.2 数据建模

可复用现有 `/datasets`，但建议新增仓库语义包装 API：

```text
GET    /api/v1/warehouse/models
POST   /api/v1/warehouse/models
GET    /api/v1/warehouse/models/{id}
PATCH  /api/v1/warehouse/models/{id}
POST   /api/v1/warehouse/models/{id}/preview
POST   /api/v1/warehouse/models/{id}/publish
POST   /api/v1/warehouse/models/{id}/archive
GET    /api/v1/warehouse/models/{id}/references
```

### 6.3 输出字段

```text
GET    /api/v1/warehouse/models/{id}/output-fields
PUT    /api/v1/warehouse/models/{id}/output-fields
```

### 6.4 指标目录

```text
GET    /api/v1/warehouse/metrics
POST   /api/v1/warehouse/metrics
GET    /api/v1/warehouse/metrics/{id}
PATCH  /api/v1/warehouse/metrics/{id}
POST   /api/v1/warehouse/metrics/{id}/publish
POST   /api/v1/warehouse/metrics/{id}/archive
```

### 6.5 影响分析

```text
GET /api/v1/warehouse/impact/table/{table_name}
GET /api/v1/warehouse/impact/field?table_name=&column_code=
GET /api/v1/warehouse/impact/model/{dataset_id}
```

返回结构应包含：

```json
{
  "asset": {"type": "field", "code": "employee.name"},
  "references": [
    {"type": "dataset", "id": 1, "name": "员工信息宽表", "usage": "output_field"},
    {"type": "report", "id": 2, "name": "员工花名册", "usage": "display_field"},
    {"type": "metric", "id": 3, "name": "员工数", "usage": "formula"}
  ],
  "risk_level": "high",
  "blocking": true
}
```

### 6.6 UCP 协同 API

一期只读取桥接目标：

```text
GET /api/v1/ucp/bridge-targets
```

二期数据仓库侧新增 UCP 资源选择代理：

```text
GET /api/v1/warehouse/ucp/systems
GET /api/v1/warehouse/ucp/resources?system_id=
GET /api/v1/warehouse/ucp/resources/{id}/preview
```

如果 UCP 独立服务化，应通过 HTTP client 调用，不直接查表。

#### 6.6.1 /warehouse/ucp/* 定位

`/api/v1/warehouse/ucp/*` 不视为重复建设 UCP，而是数据仓库侧面向未来独立应用化的防腐层 / 薄代理层。

一期策略：

- 不完整建设 `/warehouse/ucp/*` 代理。
- 可以先保留接口契约、service adapter、DTO 和 feature flag。
- 数据仓库页面一期只展示 UCP 资源 ID、名称快照、状态摘要、跳转入口。
- UCP 未启用时，DataSource / SyncRun / 自有数据接口拉取路径必须完全可用。

二期策略：

- 建设薄代理：systems、resources、resource status、preview、executions。
- 代理层只做鉴权、DTO 转换、异常降级和远端调用，不复制 UCP 凭证、Pipeline、事件配置能力。

#### 6.6.2 API 路径表达统一

文档中的后端 router 可写 `/warehouse`，但最终外部路径统一表达为：

```text
/api/v1/warehouse/*
/api/v1/ucp/*
```

不得混用 `/warehouse/*`、`/api/warehouse/*` 等不完整路径作为外部 API 契约。

### 6.7 数据仓库轻量 ELT / ETL 预留 API

数据仓库需要预留入仓后的轻量 ELT 能力，但不在一期建设完整 ETL 引擎。

一期仅预留字段、状态、按钮占位和接口契约；二期/三期逐步实现：

```text
POST /api/v1/warehouse/models/{id}/build
GET  /api/v1/warehouse/models/{id}/build-runs
POST /api/v1/warehouse/metrics/{id}/materialize
GET  /api/v1/warehouse/metrics/{id}/materialize-runs
POST /api/v1/warehouse/quality-rules/{id}/run
GET  /api/v1/warehouse/quality-runs
POST /api/v1/warehouse/snapshots/run
GET  /api/v1/warehouse/snapshots
```

边界：

- 数据仓库 ELT 只处理已入仓数据。
- 允许做字段标准化、枚举映射、数据集物化、指标物化、质量规则执行、快照/拉链。
- 不允许做外部系统凭证、Webhook、跨系统推送、复杂 Pipeline 画布、死信队列，这些属于 UCP。

---

## 7. UI 交互设计要求

详细 UI 要求见 `ui-interaction.md`。本节为强约束摘要。

### 7.1 总体原则

1. 数据仓库 UI 只负责资产、建模、指标、治理。
2. 数据连接 UI 负责 UCP 能力，不与数据仓库重复建设连接器配置。
3. 数据仓库可以展示来源系统、同步状态、UCP 资源链接，但复杂配置跳转到数据连接。
4. 一期可视化建模采用半可视化，不做自由画布。
5. 指标管理一期定位为指标口径目录，不做复杂计算引擎。
6. 血缘一期先做引用关系/影响分析，不做完整图谱。

### 7.2 数据仓库首页

必须展示：

- 数据表数量。
- 数据模型数量。
- 指标数量。
- 质量状态数量：一期仅基于 `last_quality_status` 统计 pass/warn/fail/unknown，不展示无法落地的实时质量告警。
- ODS/DWD/DWS/ADS 分层概览。
- 最近动态：一期仅使用可落地来源，包括 `SyncRun` 成功/失败、模型/指标 `published_at`、字段元数据更新时间、`last_quality_status` 变化。

不应将“连接器数量”作为核心主指标，可展示“最近同步状态”。

### 7.3 数据资产页

列表字段：

```text
表名称
显示名称
分层
主题域
来源系统
负责人
字段数
最近同步时间
质量状态
状态
操作
```

操作：

```text
查看详情
字段管理
预览数据
影响分析
跳转来源/UCP配置（如有关联）
```

### 7.4 字段定义页

字段列表：

```text
字段编码
字段名称
数据类型
主键
敏感
维度/度量
来源
可见
描述
操作
```

字段详情使用右侧抽屉，包含：

- 基础信息。
- 数仓属性。
- 权限属性。
- 变更影响。

### 7.5 快速关联

采用三步式：

```text
Step 1 选择主表和关联表
Step 2 配置关联条件
Step 3 选择输出字段并预览
```

保存动作：

```text
保存草稿
发布为模型
```

### 7.6 可视化建模 V1

页面布局：

```text
顶部：模型基础信息
左侧：数据表选择区
中间：关系图展示区，只读/半交互
右侧：当前表/关联配置区
底部：输出字段配置与预览
```

V1 允许：

- 添加/移除表。
- 配置多表链式关联。
- 自动展示关系图。
- 点击连线编辑关联条件。
- 勾选输出字段。
- 自定义输出字段名和描述。
- 预览前 20 条。
- 保存草稿/发布。

V1 不做：

- 字段到字段自由拖拽连线。
- 节点任意拖拽布局持久化。
- 缩放平移。
- 版本回滚。

### 7.7 数据预览

预览必须包含数据表格和校验摘要：

```text
主表行数
关联后行数
未匹配行数
重复匹配行数
空值数量
字段类型异常数量
```

### 7.8 指标管理

指标列表字段：

```text
指标编码
指标名称
指标类型
业务定义
主题域
依赖数据集
负责人
状态
版本
操作
```

新建/编辑指标采用分组表单：

```text
基础信息
计算口径
依赖数据
适用范围
发布信息
```

### 7.9 数据治理

一期页面包括：

- 数据分层管理。
- 影响分析。
- 基础质量检查入口。

血缘页面一期可显示引用关系列表，不强制图谱。

---

## 8. 权限要求

新增菜单 code 建议：

```text
warehouse
warehouse.assets
warehouse.modeling
warehouse.metrics
warehouse.governance
warehouse.impact
warehouse.quality
warehouse.open
```

操作权限沿用现有：

```text
V 查看
C 创建
U 更新
D 删除/归档
E 导出
```

权限要求：

- 查看数据资产需要 `warehouse.assets:V`。
- 修改表资产元数据需要 `warehouse.assets:U`。
- 查看字段需要 `warehouse.assets:V` 或原 `system.field_columns:V` 兼容。
- 修改字段需要 `warehouse.assets:U` 或原 `system.field_columns:U` 兼容。
- 新建模型需要 `warehouse.modeling:C`。
- 发布模型需要 `warehouse.modeling:U`。
- 查看指标需要 `warehouse.metrics:V`。
- 发布指标需要 `warehouse.metrics:U`。
- 影响分析需要 `warehouse.impact:V`。

兼容要求：

- 超级管理员 seed 后必须拥有全部新菜单全部操作权限。
- 旧菜单权限不能立即失效，迁移期需保留旧 route 可访问或重定向。

---

## 9. 测试要求

详细测试矩阵见 `testing-acceptance.md`。最低要求：

### 9.1 后端单元测试

必须覆盖：

- RegisteredTable 元数据读写。
- DataSet 元数据读写。
- dataset_output_fields CRUD。
- 指标目录 CRUD。
- 影响分析返回引用。
- 字段删除/修改前阻断逻辑。
- UCP 关联字段可为空且不影响现有 DataSource。

### 9.2 后端集成测试

必须覆盖：

- 新建资产元数据并在列表查询。
- 新建快速关联模型并预览。
- 新建可视化建模 V1 模型并发布。
- 指标发布后可查询。
- 字段被模型引用时，影响分析返回 blocking=true。
- 没有 UCP 表或 UCP 未启用时，数据仓库功能仍可运行。

### 9.3 前端测试/手工验收

必须覆盖：

- 新顶层菜单显示正确。
- 数据仓库首页指标展示。
- 数据资产筛选、详情、字段管理、预览。
- 快速关联三步流程。
- 可视化建模 V1 流程。
- 指标目录新建/编辑/发布。
- 影响分析展示引用和风险。
- 普通用户无权限时菜单隐藏或跳回首页。

### 9.4 回归测试

必须确保：

- 原 `/datasource/endpoints` 可用。
- 原 `/datasource/sync-runs` 可用。
- 原 `/datasource/datasets` 或重定向可用。
- 原 `/data/view` 可用。
- 报表设计不受影响。
- 数据权限、字段脱敏、导出权限不回退。

---

## 10. 验收标准

一期完成验收标准：

1. 数据仓库一级菜单上线，超级管理员可见。
2. 数据资产页可展示所有 RegisteredTable，并支持分层/主题/来源/状态筛选。
3. 表资产元数据可编辑并持久化。
4. 字段定义页支持字段详情抽屉，展示基础信息、数仓属性、权限属性、影响信息。
5. 快速关联可完成两表关联、输出字段选择、预览、保存草稿、发布。
6. 可视化建模 V1 可完成 3 张表以上链式关联配置，并自动展示关系图。
7. 模型输出字段可配置 output_code/output_label/description。
8. 预览显示前 20 条和校验摘要。
9. 指标目录可新建、编辑、发布、归档。
10. 影响分析可识别字段被数据集/报表/指标引用。
11. DataSource / SyncRun 现有能力不受影响。
12. UCP 未合并或未启用时，一期数据仓库功能不报错。
13. 若 UCP 已启用，资产详情可展示关联 UCP 资源 ID/状态入口。
14. 所有新增 API 有基础测试。
15. 前端构建通过，后端测试通过。

---

## 11. 非目标

一期非目标：

- 不实现完整 BI。
- 不替代帆软复杂分析能力。
- 不实现完整 ETL 拖拽编排。
- 不强制迁移所有 DataSource 到 UCP。
- 不实现字段级完整血缘图谱。
- 不实现质量规则定时调度和趋势分析。
- 不实现数据开放 API 网关。

---

## 12. 开发注意事项

1. 任何 DB 结构变更必须新增 Alembic migration。
2. 不要在仓库层直接强 FK 依赖 UCP 表，除非确认不会独立服务化。
3. 可视化建模优先复用 `DataSet`，不要重建一套并行模型。
4. 影响分析要优先防止破坏性操作，如删除字段、删除数据集。
5. UI 中“数据连接”相关复杂配置应跳转 UCP，不在数据仓库重复开发。
6. 所有新增菜单必须写入 seed，保证超级管理员可见。
7. 旧菜单迁移要兼容，不能导致现有用户无法访问。
8. 敏感字段、隐藏字段、导出权限必须沿用现有权限裁决逻辑。





---

## 13. 2026-07-04 评审意见采纳与修订决策

本章节用于固化本轮评审意见，后续开发必须按本章节修订后的策略执行。

| ID | 采纳结论 | 修订要求 |
| --- | --- | --- |
| R1 | 接受 | UCP / 数据仓库边界作为核心架构边界保留：数据仓库管资产、模型、指标、治理；UCP 管连接、凭证、资源、Pipeline、事件。 |
| R2 | 接受 | `/api/v1/warehouse/ucp/*` 不再视为重复建设，而是未来独立应用化的防腐层 / 薄代理层；一期不完整建设，只保留接口契约和薄封装策略。 |
| R3 | 强制修订 | `ConnectorSystemConfig` 降为旧配置兼容字段；012 主绑定改为 `ucp_system_id + ucp_resource_id`，`ucp_connector_config_id` 不作为新主路径。 |
| R4 | 接受 | 一期同库部署可以读取 UCP 表和复用 HR Portal 权限菜单，但数据仓库表不得强 FK 到 UCP 表；保存 ID、名称快照、状态快照、跳转 URL。 |
| R5 | 接受 | 012 一期不做 UCP 顶层菜单大迁移；一期只建设数据仓库入口和跳转 UCP。UCP 菜单迁移属于 011 节奏。 |
| R6 | 接受 | 数据仓库资产详情可展示 UCP 只读摘要，不要求用户拥有 UCP 配置权限；复杂配置跳转 UCP 并由 UCP 权限控制。 |
| R7 | 强制修订 | 影响分析必须接入破坏性操作入口：字段删除、字段类型修改、数据集归档、模型发布覆盖、指标归档。 |
| R8 | 接受 | 首页质量/动态口径必须使用一期可落地来源：`last_quality_status`、`SyncRun`、模型/指标 `published_at`、字段元数据更新时间。 |
| R9 | 接受 | API 路径统一为 `/api/v1/warehouse/*` 和 `/api/v1/ucp/*`；router 内部前缀与外部路径需明确区分。 |

### 13.1 修订后的实施策略

一期：

- 数据仓库作为 HR Portal 下的新应用入口建设。
- 现有 DataSource / SyncRun / 自有数据接口拉取能力是主路径，不能被 UCP 规划阻塞。
- UCP 只做资源 ID 绑定、名称/状态摘要、跳转，不内嵌复杂配置。
- 不做 UCP 菜单大迁移。

二期：

- 建设 `/api/v1/warehouse/ucp/*` 薄代理层。
- 支持 UCP resource 选择、状态摘要、preview、executions 查询。
- 代理层只做防腐和 DTO 转换，不复制 UCP 能力。

长期：

- UCP 和数据仓库均可从 HR Portal 拆出成为独立应用。
- 双方通过 HTTP API、事件、远端 ID、名称快照、状态快照、跳转 URL 协作。

---

## 14. 数据仓库内置轻量 ELT / ETL 预留规划

### 14.1 专家评估结论

需要预留部分 ETL/ELT 能力进入数据仓库，但范围必须限定为“入仓后轻量加工”。

一句话边界：

```text
UCP 负责连接和搬运；
数据仓库负责入仓后的标准化、建模、计算、校验和发布。
```

### 14.2 数据仓库应预留的 ELT 能力

| 能力 | 是否预留 | 阶段 | 说明 |
| --- | --- | --- | --- |
| 字段标准化 / 枚举映射 | 是 | 二期 | 例如员工状态、组织编码、岗位序列标准化。 |
| 数据集派生 / 主题表生成 | 是 | 二期 | 基于已入仓表生成员工宽表、组织快照、绩效分析数据集。 |
| 指标物化 | 是 | 二期/三期 | 从指标目录发展为指标计算与物化结果。 |
| 数据质量规则执行 | 是 | 二期 | 非空、唯一、枚举、引用完整性、日期格式。 |
| 快照 / 拉链 | 是 | 三期 | 员工状态历史、组织月末快照、岗位职级变动历史。 |
| 简单调度 | 是 | 三期 | 调度数据集刷新、指标物化、质量检查、快照生成。 |

### 14.3 不应进入数据仓库的 ETL 能力

以下能力归 UCP：

- 外部系统 API 配置。
- 凭证管理。
- Webhook 接收。
- 外部账号创建 / 删除。
- 跨系统推送。
- 复杂 Pipeline 画布。
- 失败重试 / 死信队列。
- 外部系统限流。
- Adapter 执行框架。

### 14.4 推荐未来数据分层

```text
数据接入层：DataSource / UCP
数据落地层：RegisteredTable / 原始表
数据加工层：Warehouse Transform / Dataset Build / Quality Run
数据建模层：DataSet / Relation / Output Fields
指标层：Metric Catalog / Metric Materialization
治理层：Impact Analysis / Quality Issue / Lineage
开放层：BI / API / Export
```

### 14.5 一期预留但不实现的内容

一期应预留：

- `RegisteredTable.layer` 支持 `raw/ods/dwd/dws/ads/dm/metric`。
- `DataSet.build_mode` 支持 `virtual/materialized`。
- `DataSet.refresh_strategy` 预留 `manual/scheduled/upstream_triggered`。
- 指标目录保留计算方式、是否物化、物化状态字段规划。
- 数据治理页面保留质量规则、质量执行、快照任务入口占位。

一期不实现：

- 任意 SQL 编辑器。
- 可视化 ETL 编排器。
- Python / 脚本执行。
- 跨系统 Pipeline。
- 完整调度中心。
