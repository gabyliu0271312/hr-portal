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

### 2.3 平台型工具定位与阶段性嵌入策略

本项目的长期定位不是“只服务 HR 的单点功能”，而是沉淀为一个可复用、可迁移、可逐步独立的数据仓库/数据资产平台型工具。当前嵌入 HR Portal，是为了复用现有登录、权限、菜单、DataSource、DataSet、报表、调度、通知和审计底座，先在 HR 场景完成平台能力验证，再逐步扩展到更通用的数据接入、建模、治理、指标和开放能力。

阶段性建设原则：

1. **先嵌入，后解耦**：二期和三期仍以内嵌 HR Portal 为主要交付形态，但代码、菜单、权限、领域模型要避免写死 HR 专属语义，为后续独立平台化预留边界。
2. **先受控，后通用**：先围绕已有 DataSource/DataSet/报表链路做受控增强，不在二期一次性开放任意 SQL、任意调度、任意跨系统编排。
3. **先元数据治理，后计算开放**：二期优先补齐资产目录、分层口径、血缘、质量、UCP 引用、建模体验；三期再引入受控的仓内加工和物化能力。
4. **概念分层清晰**：平台视角可以展示完整生命周期，但实现字段不能把不同维度混成一个枚举。
5. **可迁移设计**：新增模型、接口和前端组件应尽量采用 `warehouse` / `data_asset` / `metric` / `lineage` / `ucp` 等通用命名，避免与 HR 业务流程强绑定。

平台完整生命周期可表达为：

```text
数据接入/UCP → RAW 来源阶段 → ODS 入仓层 → DWD 标准明细层
                               → DWS 汇总服务层 → ADS 应用消费层
                               → DM 数据集市/消费域 → METRIC 指标语义层
                               → BI/API/推送/自动化/AI 工作台
```

但当前代码中的 `warehouse_layer` 必须保持为清晰的数仓加工主链路：

```text
ODS / DWD / DWS / ADS
```

`RAW`、`DM`、`METRIC` 不应作为 `warehouse_layer` 的新增取值，而应拆到独立维度：

- `RAW`：表示外部系统原始来源阶段或血缘来源节点，可在血缘图、UCP 资源引用、接入预览中展示。
- `DM`：表示数据集市、业务域、消费域或主题域标签，可作为资产归属/组织维度，不作为加工输出层。
- `METRIC`：表示指标语义对象或资产类型，应进入指标目录/语义层，不作为表的数仓层级。

因此，平台化方向是“完整生命周期可视化 + 四层数仓主链路 + 多维资产治理”，而不是简单把 `warehouse_layer` 从 4 个枚举扩成 7 个枚举。

### 2.4 两者关系

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

## 14. ODS → DWD → DWS → ADS 分层流转与轻量 ELT / ETL 规划

### 14.1 专家评估结论：分层流转先于 ETL 能力

数据仓库后续建设必须先定义 **ODS → DWD → DWS → ADS** 的数据生命周期，再定义字段标准化、清洗、聚合、物化、调度等 ELT/ETL 能力。

原因：

1. 分层流转是目标架构，ELT/ETL 是实现手段。
2. 没有分层主线，清洗、聚合、物化会变成零散工具箱，无法治理、复用和验收。
3. UI 与用户心智应围绕“原始数据 → 标准明细 → 汇总服务 → 应用消费”展开，而不是先暴露复杂转换工具。
4. 数据仓库可以先没有完整 ETL 引擎，但不能没有清晰的分层流转规则；否则后续难以演进为真正的数据仓库。

一句话边界：

```text
UCP / DataSource 负责连接、凭证、外部拉取和跨系统搬运；
数据仓库负责已入仓数据在 ODS → DWD → DWS → ADS 中的标准化、建模、计算、校验、发布和治理；
ELT/ETL 能力必须服务于分层流转，不允许先做成通用工具箱。
```

### 14.2 分层职责与产物定义

| 层级 | 定位 | 主要输入 | 主要产物 | 允许能力 | 禁止/限制 |
| --- | --- | --- | --- | --- | --- |
| ODS 原始入仓层 | 保存外部系统或人工导入的原始落地数据 | DataSource、Push/API 接入、UCP Resource、文件导入 | RegisteredTable / 原始表 / 原始字段 | 来源摘要、同步状态、字段登记、质量基础检查 | 不覆盖原始值；不在 ODS 做业务口径加工 |
| DWD 标准明细层 | 形成标准字段、标准枚举、标准类型的明细数据 | ODS 表、旧数据视图、已入仓明细模型 | DWD 逻辑视图 / 派生 DataSet / 标准明细资产 | 字段重命名、类型转换、枚举映射、单位转换、拆分合并、清洗、去重、DWD 视图发布 | 不提供任意 SQL/脚本；不调用外部系统 |
| DWS 汇总服务层 | 形成跨主题、可复用、统一口径的汇总数据 | DWD、维度表、指标定义、DataSet | DWS 聚合视图 / 指标结果 / 服务汇总资产 | 维度绑定、group_by、聚合、周期、过滤、指标物化、DWS 视图发布 | 不做一次性报表口径；不替代 BI 语义层 |
| ADS 应用消费层 | 面向 BI、API、推送、业务应用的消费数据 | DWS、DWD、DIM、数据视图 | ADS 宽表 / 发布数据视图 / API 候选 / PushTarget 候选 | 消费资产组装、字段选择、预置过滤、脱敏、权限、开放衔接 | 不做图表/大屏设计；不绕过权限直接开放 |

### 14.3 分层流转主线

后续开发和 UI 应始终按以下主线组织：

```text
外部系统 / 文件 / API
  ↓ DataSource / UCP / 手工导入
ODS：原始入仓资产
  ↓ 标准化 + 清洗 + 字段治理
DWD：标准明细资产
  ↓ 维度绑定 + 指标口径 + 聚合
DWS：汇总服务资产
  ↓ 消费场景组装 + 权限/脱敏 + 发布
ADS：应用消费资产
  ↓
BI / API / PushTarget / 报表 / 业务应用
```

各阶段必须产生可登记、可血缘追踪、可影响分析、可权限控制的数据资产。不得只生成临时结果或只在某个页面内保存配置。

### 14.4 数据仓库应预留和建设的 ELT 能力

ELT 能力按“服务哪一段分层流转”组织，而不是按工具菜单组织：

| 流转阶段 | 能力 | 是否预留/建设 | 阶段 | 说明 |
| --- | --- | --- | --- | --- |
| ODS → DWD | 字段标准化 / 枚举映射 | 是 | 二期/三期 | 员工状态、组织编码、岗位序列等标准化；三期落地规则、模板、预览和 DWD 视图生成。 |
| ODS → DWD | 数据清洗 | 是 | 三期 | 去重、空值处理、格式标准化、错误样例预览。 |
| ODS/DWD → DWD | 数据集派生 / 主题表生成 | 是 | 二期/三期 | 基于已入仓表生成员工宽表、组织快照、绩效分析数据集。 |
| DWD → DWS | 指标物化 | 是 | 二期/三期 | 从指标目录发展为指标计算与物化结果。 |
| DWD → DWS | DWS 聚合生成 | 是 | 三期 | 按指标定义生成受控 DWS 聚合视图，统一高复用指标口径。 |
| DWS/DWD → ADS | ADS 组装 | 是 | 三期 | DWS + 维度表组装为面向 BI/API/推送的消费资产。 |
| 全链路 | 数据质量规则执行 | 是 | 二期/三期 | 非空、唯一、枚举、引用完整性、日期格式；结果回写资产摘要。 |
| 全链路 | 快照 / 拉链 | 是 | 三期 | 员工状态历史、组织月末快照、岗位职级变动历史。 |
| 全链路 | 简单调度 | 是 | 三期 | 调度数据集刷新、指标物化、质量检查、快照生成；仅限仓内任务。 |

### 14.5 一期至三期不应进入数据仓库的 ETL/BI 能力，四期复评

以下能力在一期至三期不进入数据仓库主建设范围，避免把数据仓库做成失控的通用 ETL/BI 平台；第四期按 `atomic-tasks.md` X 章复评，优先采用外部集成或受控试点。

| 能力 | 一期至三期结论 | 四期处理方式 | 原因 |
| --- | --- | --- | --- |
| 复杂 BI 自助分析、图表、大屏 | 不内建 | 四期优先集成 BI，数据仓库提供可信资产和跳转 | BI 是专业工具，数据仓库不重复建设报表设计器。 |
| 任意 SQL / Python / 脚本 ETL | 不开放 | 四期仅可安全沙箱试点，需审批、限额、审计 | 安全、权限、资源和审计风险高。 |
| 跨系统 Pipeline 画布 | 不内建 | 四期继续归 UCP，数据仓库展示摘要和跳转 | 连接、凭证、重试、死信、限流属于 UCP 边界。 |
| 复杂星型/雪花模型设计器 | 暂不内建 | 四期复评，仅内建高复用且 BI 难以稳定承载的子集 | 避免过早复制 BI 语义层。 |

以下能力长期默认归 UCP 或专业数据连接平台：

- 外部系统 API 配置。
- 凭证管理。
- Webhook 接收。
- 外部账号创建 / 删除。
- 跨系统推送执行。
- 复杂 Pipeline 画布。
- 失败重试 / 死信队列。
- 外部系统限流。
- Adapter 执行框架。

### 14.6 推荐未来技术分层

```text
接入/来源维度：DataSource / UCP / Manual / Derived / View
原始落地区：RAW（仅作为接入快照/血缘节点/来源阶段，不进入 warehouse_layer）
数仓主链路：ODS → DWD → DWS → ADS
  - ODS：RegisteredTable / 原始入仓表 / 原始字段
  - DWD：Standardization Rule / Cleaning Rule / DWD View / Standard DataSet
  - DWS：Dimension / DWS Aggregate / Metric Materialization
  - ADS：ADS Definition / Published View / API Candidate / PushTarget Candidate
资产类型维度：table / view|dataset_view / model / metric / api
治理维度：Impact Analysis / Quality Issue / Lineage / Permission / Audit
消费形态：BI / API / Export / PushTarget / 业务应用；DM 如需出现，仅作为数据集市/消费域标签，不进入 warehouse_layer
```

口径约束：`warehouse_layer` 只表达严肃数仓开发层级，二期和三期继续保持 `ODS/DWD/DWS/ADS` 四层；`RAW`、`DM`、`METRIC` 不得写入 `warehouse_layer`。其中 `RAW` 用 `source_stage`/血缘节点表达，`METRIC` 用 `asset_type=metric` 表达，`DM` 用主题域、消费域或数据集市标签表达。

### 14.7 一期预留但不实现的内容

一期应预留：

- `RegisteredTable.warehouse_layer` 与 `DataSet.warehouse_layer` 保持 `ODS/DWD/DWS/ADS` 四层；不得扩展为 `RAW/ODS/DWD/DWS/ADS/DM/METRIC`。`RAW` 用来源/血缘阶段表达，`METRIC` 用 `asset_type=metric` 表达，`DM` 用主题域/消费域标签表达。
- `DataSet.build_mode` 支持 `virtual/materialized`。
- `DataSet.refresh_strategy` 预留 `manual/scheduled/upstream_triggered`。
- 指标目录保留计算方式、是否物化、物化状态字段规划。
- 数据治理页面保留质量规则、质量执行、快照任务入口占位。
- UI 中展示 ODS/DWD/DWS/ADS 分层概览和资产当前层级，但不提供误导性的“立即执行 ETL/Pipeline”按钮。

一期不实现：

- 任意 SQL 编辑器。
- 可视化 ETL 编排器。
- Python / 脚本执行。
- 跨系统 Pipeline。
- 完整调度中心。


---

## 15. 二期、三期、四期与最终蓝图开发路线

### 15.1 章节目的

一期已经完成基础入口、资产、建模、指标、影响分析、UCP 摘要/降级等能力后，后续开发不能只依赖高层路线图。二期、三期、四期和最终蓝图必须像一期一样拆到原子任务，确保多模型、多阶段接力时仍能按文档开发和验收。

具体执行入口：

```text
atomic-tasks.md Q 章：二期，数据治理深化 + UCP 薄代理 + 可视化建模 V2
atomic-tasks.md R 章：三期，按 ODS → DWD → DWS → ADS 主线进行能力下沉与增强
atomic-tasks.md X 章：四期，高级数据开发与消费侧能力复评
atomic-tasks.md S 章：最终蓝图与独立应用化
```

### 15.2 二期目标

二期对应附件《数据仓库.txt》8.3：数据治理深化 + 监控告警 + 可视化建模 V2。

二期重点：

- 数据分层标签增强。
- 表级/字段级数据血缘。
- 数据质量规则、执行、质量告警摘要。
- `/api/v1/warehouse/ucp/*` 薄代理层。
- UCP 资源选择器与只读摘要。
- 可视化建模 V2：拖拽节点、字段连线、关联编辑、自动布局、版本管理。
- 数据仓库监控页与告警摘要。

二期仍不做：

- UCP 凭证编辑。
- UCP Pipeline 画布。
- UCP 事件触发器配置。
- 任意 SQL / Python 脚本执行。
- 完整跨系统 ETL 编排。

### 15.3 三期目标

三期对应附件《数据仓库.txt》8.4：能力下沉与增强。

三期按需启动，重点是围绕 ODS → DWD → DWS → ADS 主线，将部分“入仓后加工”能力下沉到数据仓库：

- ODS → DWD 标准化与清洗。
- 数据去重、空值处理、格式标准化。
- 数据集物化与刷新。
- DWD → DWS 指标物化、维度管理与 DWS 聚合。
- DWS → ADS 消费资产组装与数据开放 API 规划。
- 快照与拉链。
- 仓内调度、重跑和审计。

三期边界：

```text
UCP / 专业 ETL 负责跨系统连接和复杂 Pipeline；
数据仓库只负责已入仓数据沿 ODS → DWD → DWS → ADS 的加工、计算、治理和发布。
```


### 15.3.1 四期目标

四期用于承接前期“不纳入或暂不纳入”的高级能力，但不是默认内建。四期重点是复评和受控集成：

- BI 自助分析：优先集成帆软/BI，数据仓库提供可信资产、指标语义、权限和跳转，不内建图表/大屏设计器。
- 任意 SQL / 脚本 ETL：默认禁用；如确有必要，仅允许在安全沙箱、审批、资源限额和审计下试点。
- 跨系统 Pipeline：继续归 UCP；数据仓库展示 Pipeline 摘要、状态、影响和跳转，不编辑 Pipeline 画布。
- 复杂星型/雪花模型：四期复评，只内建高复用、可治理且 BI 难以稳定承载的维度建模子集。

执行入口：`atomic-tasks.md` X 章。

### 15.4 最终蓝图目标

最终蓝图面向数据仓库独立应用化：

- 独立 API 边界。
- 独立权限命名空间。
- 跨应用身份和服务账号。
- 完整元数据目录。
- 字段级完整血缘图谱。
- 治理工作台闭环。
- 指标语义层服务。
- 数据开放服务。
- SLA、监控、变更发布治理。
- 全量回归验收套件。

### 15.5 与现有一期代码的关系

二期、三期、最终蓝图必须复用一期已经实现的：

- `backend/app/warehouse/` 模块。
- `/api/v1/warehouse/*` API 前缀。
- `frontend/src/api/warehouse.ts` API client。
- `frontend/src/views/warehouse/` 页面基础。
- 现有 DataSource / SyncRun 兼容路径。
- 已有 warehouse 权限和菜单。

不得推倒重来，不得破坏一期已验收能力。


---

## 16. 系统设置既有能力归并策略

### 16.1 核心结论

系统设置中的字段管理、接口配置、同步历史、表间关联、数据视图不能长期在系统设置和数据仓库两边各自保存、各自编辑。后续必须采用“一个 canonical owner + 旧入口兼容/跳转 + 分阶段下线”的策略。

### 16.2 归属矩阵

| 既有能力 | 长期 canonical owner | 数据仓库中的角色 | 旧入口策略 |
| --- | --- | --- | --- |
| 字段管理 | 数据仓库字段资产 / `TableColumn` | 主编辑、治理、影响分析 | 系统设置旧入口只读兼容，跳转到数据仓库字段定义 |
| 接口配置 | 分层 owner：资产级入仓/出仓配置归数据仓库；平台级连接器/凭证/接口定义归数据连接/UCP | 数据仓库作为资产级主入口，承载 DataSource、PushTarget、API 暴露、调度、历史、字段映射的资产视角融合 | 系统设置旧入口仅兼容期保留，先提示/跳转，再只读，最终下线 |
| 同步历史 | DataSource 的 `SyncRun`、UCP Execution、仓内 Run 各自 owner | 资产详情聚合展示 | 旧全局同步历史兼容，资产视角迁移到数据仓库 |
| 表间关联 | 数据仓库建模 / `DataSetRelation` | 主编辑、快速关联、可视化建模 | 系统设置旧入口只读或跳转 |
| 数据视图 | 数据仓库 DataSet / Published View / 数据开放目录 | 主治理和开放 | 旧数据视图迁移映射，保留旧 ID 到新 ID |

### 16.3 迁移原则

1. 禁止长期双写。
2. 禁止同一业务概念两个页面各自保存。
3. 旧入口必须有兼容期：只读、跳转、迁移说明、下线计划。
4. 新入口必须覆盖旧入口的用户核心路径。
5. 接口配置不长期属于系统设置；资产级拉取/推送/API 暴露应迁入数据仓库“来源与开放”主入口，平台级连接器、凭证、接口定义、Pipeline 归数据连接/UCP。
6. 同步历史不复制明细，只做资产视角聚合。

### 16.4 开发入口

具体原子任务见：

```text
atomic-tasks.md T 章：系统设置既有能力归并到数据仓库 / UCP 的原子任务
atomic-tasks.md U 章：UI 示意图与交互说明
```


---

## 17. 2026-07-04 归并前置与数据接入/视图/授权修订

### 17.1 T 章归并必须前置

系统设置既有能力归并不是最终阶段的收尾任务，而应作为 **Phase 1.5 / Phase 2 前置任务**。

原因：

1. 字段管理、表间关联、数据视图会直接影响数据仓库一期页面的信息架构。
2. 如果等到最后再迁移，会形成两套入口、两套权限、两套编辑路径，后续清理成本更高。
3. 表间关联还涉及授权能力，是现有系统关键模块，必须先有兼容和迁移设计再做建模 V2。
4. 数据视图与数据资产如果不提前统一，后续资产目录、血缘、权限、数据开放都会重复建设。

因此开发顺序调整为：

```text
Phase 1：数据仓库一期基础能力
Phase 1.5：系统设置既有能力归并设计与兼容入口
Phase 2：治理深化、UCP 薄代理、建模 V2
Phase 3：仓内 ELT、物化、快照、调度
Final：独立应用化
```

对应原子任务：`atomic-tasks.md` T 章必须在 Q 章大规模开发前完成 T0001、T0101、T0201、T0301、T0401、T0501、T0701、T0801、T0901。

### 17.2 数据接入能力在数据仓库中需要保留入口，但不重复建设 UCP

此前文档强调 UCP 与数据仓库远期都可能独立成应用。因此，“数据接入”不能简单从数据仓库中消失。

修订后的定位：

- 数据仓库保留 **数据接入视角入口**，用于资产创建、来源绑定、同步摘要、接入状态、跳转配置。
- UCP / 接口管理保留 **连接器平台能力**，用于外部系统、接口技术规格、认证、资源、Pipeline、事件、执行监控。
- 数据仓库的数据接入入口不编辑凭证、不编辑接口技术参数、不编排 Pipeline。
- 两边共享组件和契约：资源选择器、来源摘要卡片、同步历史组件、状态标签、跳转 URL、远端 ID/快照 DTO。

也就是说：

```text
数据仓库：我这个资产从哪里来、最近同步如何、是否可用、去哪里配置。
UCP：这个外部系统如何连接、如何认证、资源如何定义、Pipeline 如何执行。
```

### 17.3 数据视图与数据资产应融合为统一资产目录

现有“数据视图”与“数据资产”不建议长期分离。更合理的方式是：

```text
统一资产目录 = 表资产 + 数据视图 + 数据模型 + 指标 + 开放 API
```

一期/二期建议将数据资产列表升级为“资产卡片 + 表格双视图”：

- 卡片视图更适合业务用户理解数据资产。
- 表格视图更适合管理员批量治理。
- 数据视图可以作为资产类型 `view` 或 `dataset_view` 融入资产目录。

卡片需要融合的数据资产信息：

- 资产名称 / 中文名。
- 资产类型：表、视图、模型、指标、API。
- 数仓分层：ODS/DWD/DWS/ADS（仅 `warehouse_layer`）。
- 资产类型：表、视图、模型、指标、API（`asset_type`，指标用 `metric` 表达，不作为分层）。
- 来源/血缘阶段：Manual/DataSource/UCP/Derived/View/RAW（RAW 只作为接入快照或血缘节点，不作为数仓层）。
- 主题域。
- 来源：Manual/DataSource/UCP/Derived/View。
- 最近同步或最近构建时间。
- 质量状态。
- 字段数 / 记录数摘要。
- 权限状态：公开、受限、敏感、需申请。
- 下游引用数量。
- 操作：详情、预览、血缘、申请权限、编辑。

### 17.4 表间关联授权必须提前设计

现有表间关联涉及授权能力，是系统重要模块，不能只作为建模功能迁移。

修订后的策略：

- 表间关联主编辑入口迁移到数据仓库建模。
- 表间关联授权能力也要进入数据仓库权限/授权设计。
- 旧系统设置入口保留兼容期，展示只读关联和授权状态，并跳转到数据仓库。
- 授权不能丢失，迁移时必须保留：授权对象、授权范围、字段权限、行级条件、有效期、授权来源、审计记录。
- 数据仓库建模 V2 前必须先完成表间关联授权的数据模型、API、UI 和兼容计划。

最低要求：

```text
表间关联迁移前：只读兼容 + 跳转 + 不新增第二套授权
表间关联迁移中：同一 service 写入 + 旧入口禁写
表间关联迁移后：数据仓库为主入口 + 旧入口下线
```


---

## 18. 2026-07-04 T02 接口配置重点评审修订：拉取/推送一体化与独立应用兼容

### 18.1 现状判断

当前系统中的“接口配置”并不只是外部系统接口定义，实际已经承载两类生产能力：

1. **拉取接口 / 入仓接口**：以 `DataSource` 为核心，包含 `source_type`、`schedule`、`settings`、`secrets_encrypted`、启停、测试连接、手动同步、`SyncRun` 同步历史，并通过 `sync_to_table` 落到业务表/数据仓库表。
2. **推送接口 / 出仓接口**：以 `PushTarget` 为核心，包含 `source_table`、`push_type`、`settings`、`secrets_encrypted`、字段映射、启停、手动推送、调度、`JobRun` 推送历史，并支持 HTTP 推送、外部数据库写入、API 暴露、飞书表格等形态。

因此，T02 不能简单写成“接口配置全部归 UCP，数据仓库只跳转”。更准确的长期定位应是：

```text
接口配置 = 数据流端点配置能力
拉取接口 = 外部/文件/表格/HTTP/API -> 仓内资产
推送接口 = 仓内资产/报表 -> 外部系统/API/数据库/飞书
UCP = 更专业的数据连接平台，可逐步接管连接器、凭证、资源、Pipeline、执行监控
数据仓库 = 从资产视角编排和治理这些入仓/出仓端点，不重复建设底层连接器平台
```

### 18.2 架构结论

T02 的 owner 需要从“单一归 UCP”修订为 **双层 owner**：

| 层级 | 近期 owner | 远期 owner | 数据仓库角色 | 说明 |
|---|---|---|---|---|
| 拉取接口执行能力 | 现有 DataSource / SyncRun | UCP 可选接管或并行 | 资产来源、入仓任务、同步摘要、字段/质量/血缘触发点 | UCP 未建设时必须完整可用 |
| 推送接口执行能力 | 现有 PushTarget / JobRun | UCP 或数据开放应用可选接管 | 资产出仓、开放目标、订阅/推送摘要、权限和影响分析入口 | 不能被数据仓库迁移破坏 |
| 接口技术规格 | 当前 DataSource/PushTarget settings 中混合保存 | UCP/接口管理/数据开放接口定义 | 只显示摘要、校验状态、跳转 | 不在资产详情里暴露 secret |
| 凭证/密钥 | 当前各自 secrets_encrypted | UCP 凭证中心或独立应用凭证模块 | 只显示是否已配置 | 独立应用时需内置最小凭证能力 |
| 调度/执行历史 | Scheduler + SyncRun/JobRun | UCP Execution 或独立调度 | 聚合展示 | 不复制明细为第二套 owner |

### 18.3 三种部署/演进形态

#### 形态 A：当前整体系统，UCP 未启用

- 系统设置中的接口配置继续可用，但逐步改名/重组为“数据连接”。
- 拉取接口继续使用 `DataSource`。
- 推送接口继续使用 `PushTarget`。
- 数据仓库资产详情展示“入仓来源”和“出仓目标”两个区域。
- 不要求 UCP 存在，不阻塞现有同步、推送、API 暴露。

#### 形态 B：整体系统，UCP 已启用但未独立

- UCP 提供连接器、接口定义、资源目录、凭证、Pipeline 等能力。
- 数据仓库仍提供资产视角：来源、同步、推送、质量、血缘、影响分析。
- 对 DataSource / PushTarget 做 adapter 化：新建时可选择“使用现有轻量接口”或“绑定 UCP 资源”。
- UI 上不能出现两个并列且语义重复的“接口配置”入口；应统一为：

```text
数据仓库 > 数据资产 > 资产详情 > 来源与开放
数据连接/UCP > 连接器 / 接口定义 / 资源 / 凭证 / Pipeline
系统设置 > 旧接口配置：迁移提示 + 兼容入口
```

#### 形态 C：未来独立应用

- 如果“数据连接/UCP”没有独立部署，数据仓库独立应用必须保留最小接口配置能力：DataSource、PushTarget、调度、测试连接、手动运行、历史、凭证加密。
- 如果“数据连接/UCP”独立部署，数据仓库通过 HTTP API 调用资源目录、状态、执行摘要、跳转，不直接查 UCP 内部表。
- 数据仓库独立部署时，不能因为缺少 UCP 而失去当前拉取接口和推送接口能力。

### 18.4 数据仓库内的融合设计，不是简单搬迁

接口配置融入数据仓库时，应以“资产生命周期”为主线，而不是把旧页面整体搬到数据仓库下面。

资产详情建议新增或强化 `来源与开放` Tab：

```text
来源与开放
├── 入仓来源 Pull Sources
│   ├── DataSource 摘要：来源类型、目标表、调度、启停、最近同步、同步历史、测试连接、立即同步
│   └── UCP 资源摘要：系统、资源、状态、最近执行、跳转
├── 出仓目标 Push Targets
│   ├── PushTarget 摘要：推送方式、目标、字段映射、调度、启停、最近推送、推送历史、立即推送
│   └── 数据开放/API 摘要：API 地址、授权方式、调用状态、跳转
└── 影响与治理
    ├── 字段变更影响：哪些拉取/推送/开放 API 受影响
    ├── 权限/脱敏：出仓字段是否包含敏感字段
    └── 质量门禁：质量异常时是否允许推送
```

新建资产流程建议不是“创建接口配置”，而是：

```text
新建数据资产
1. 选择资产来源：手工建表 / 拉取接口 / 文件上传 / UCP 资源 / 派生模型
2. 配置入仓方式：DataSource 轻量配置或绑定 UCP 资源
3. 配置字段与治理属性
4. 可选配置出仓目标：HTTP 推送 / 外部库 / API 暴露 / 飞书表格
5. 确认调度、权限、质量门禁
```

### 18.5 T02 修订后的禁止项

- 禁止把 DataSource / PushTarget 在数据仓库中再建一套平行主表，形成长期双写。
- 禁止在数据仓库资产详情中展示 secret 明文。
- 禁止 UCP 未启用时隐藏或破坏现有拉取/推送接口能力。
- 禁止把旧接口配置页面原样搬到数据仓库，造成信息架构混乱。
- 禁止仅以“跳转 UCP”作为近期方案，因为 UCP 建设可能晚于数据仓库二期。

### 18.6 T02 修订后的实施顺序

1. 先梳理现有 DataSource、PushTarget、Scheduler、SyncRun、JobRun、前端接口配置页和推送组件。
2. 建立统一端点摘要 DTO：`ConnectionEndpointSummary`，覆盖 pull/push/expose 三类方向。
3. 在数据仓库资产详情增加“来源与开放”聚合展示。
4. 系统设置旧接口配置改为兼容入口：默认展示全局列表，进入资产维度时引导到数据仓库。
5. 后续 UCP 接入时，只替换/扩展 adapter，不改变数据仓库 UI 主线。

### 18.7 接口配置从系统设置迁出的最终决策

经补充评审，接口配置不应长期留在“系统设置”。系统设置只适合承载用户、权限、参数、审计等平台基础配置；接口配置本质是数据流能力，和数据资产、字段、调度、质量、权限、影响分析强相关。

最终决策：

```text
接口配置必须从系统设置迁出。
资产级接口配置迁入数据仓库。
平台级连接器能力归数据连接/UCP。
系统设置旧入口只作为兼容期入口，最终下线。
```

#### 18.7.1 迁入数据仓库的范围

以下能力属于资产级接口配置，应成为数据仓库主入口能力：

- 拉取接口：DataSource 配置、测试连接、立即同步、启停、调度、SyncRun 历史。
- 推送接口：PushTarget 配置、立即推送、启停、调度、JobRun 历史。
- API 暴露：以 PushTarget/API expose 或后续数据开放能力承载。
- 字段映射：入仓字段映射、出仓字段映射。
- 资产关联：某个接口绑定到哪张表、哪个数据视图、哪个模型、哪个报表。
- 治理联动：字段变更影响、敏感字段出仓提醒、质量门禁、权限校验。

推荐主入口：

```text
数据仓库 > 数据资产 > 资产详情 > 来源与开放
```

#### 18.7.2 不迁入数据仓库本体的范围

以下能力不应塞进数据仓库本体，应归未来“数据连接/UCP”或独立数据连接应用：

- 外部系统主数据。
- 连接器模板/插件。
- 公共凭证中心。
- 接口技术规格定义。
- 资源目录。
- Pipeline 编排。
- 连接器运行资源池。
- 统一连接器事件、监控和告警。

数据仓库只展示这些能力的摘要、状态、跳转和远端 ID，不复制 secret，不复制 Pipeline。

#### 18.7.3 系统设置旧入口处理

系统设置中的“接口配置”不是长期主入口，按三阶段处理：

| 阶段 | 系统设置旧入口 | 数据仓库入口 | UCP/数据连接 |
|---|---|---|---|
| 兼容期 | 可访问、显示迁移提示，可维护未迁移 DataSource/PushTarget | 建设“来源与开放”聚合视图 | 可不存在 |
| 主迁移期 | 降级为只读/全局搜索/跳转，写操作转到同一 service 或数据仓库入口 | 成为资产级拉取/推送/API 暴露主入口 | 复杂连接器可跳转 |
| 下线期 | 菜单隐藏，旧 URL 重定向或显示下线说明 | 唯一资产级主入口 | 平台级主入口 |

旧入口下线条件：

1. 数据仓库能维护 DataSource 轻量拉取配置。
2. 数据仓库能维护 PushTarget 推送/API 暴露配置。
3. 数据仓库能查看同步/推送历史。
4. 字段映射、调度、启停、测试连接、立即同步/推送能力等价可用。
5. 权限、脱敏、secret 保护不回退。
6. UCP 未启用时仍可完整使用现有 DataSource/PushTarget 能力。
7. 旧链接有重定向或清晰说明。

#### 18.7.4 产品交互原则

- 不能让用户在系统设置和数据仓库看到两个都能独立编辑的“接口配置”。
- 不能简单把旧接口配置页搬进数据仓库；必须围绕资产生命周期重组为“来源与开放”。
- 不能因 UCP 规划而阻塞当前 DataSource/PushTarget 能力。
- 不能把平台级连接器、凭证中心、Pipeline 全部塞入数据仓库。
- 数据仓库独立应用化时，必须内置最小 DataSource/PushTarget 能力；有 UCP 时通过 adapter/HTTP 契约协作。

---

## 19. 2026-07-04 T05 数据视图与数据资产合并决策

### 19.1 评审结论

系统设置下的“数据视图”不应长期作为独立模块存在，应与数据仓库下的“数据资产”合并为 **统一资产目录**。

最终决策：

```text
数据视图从系统设置迁出。
数据视图作为 asset_type=view / dataset_view 融入数据仓库数据资产。
数据仓库 > 数据资产 成为数据视图的主入口。
系统设置旧数据视图入口只作为兼容期入口，最终下线。
```

原因：

1. 数据视图本质是可消费的数据资产，不是系统配置。
2. 数据视图与字段、权限、预览、出仓、报表、影响分析强相关，继续留在系统设置会割裂治理链路。
3. 如果数据视图和数据资产长期分离，会重复建设搜索、权限、标签、质量、血缘、开放和审计。
4. 业务用户更容易从“数据资产目录”理解和查找数据视图，而不是从系统设置查找。

### 19.2 合并后的信息架构

统一资产目录包含：

```text
数据资产
├── 表资产 table
├── 数据视图 view / dataset_view
├── 数据模型 model
├── 指标 metric
└── 开放 API api
```

数据视图不再是孤立菜单，而是数据资产的一种类型：

- 在资产列表中用类型标签标识“数据视图”。
- 在筛选中支持 asset_type=view/dataset_view。
- 在资产详情中展示视图定义、来源表/模型、字段、权限、预览、下游引用、出仓目标。
- 在血缘中展示 `来源表/模型 -> 数据视图 -> 报表/API/推送`。

### 19.3 UI 与交互方案

数据资产页需要支持 **卡片视图 + 表格视图**：

#### 卡片视图

面向业务用户，默认推荐。每张卡片至少展示：

- 名称 / 中文名。
- 资产类型：表 / 数据视图 / 模型 / 指标 / API。
- 主题域、分层、负责人。
- 来源：手工、DataSource、UCP、模型派生、旧数据视图迁移。
- 最近同步或最近构建时间。
- 质量状态。
- 权限状态：公开、受限、敏感、需申请。
- 字段数、记录数或结果规模摘要。
- 下游引用数量。
- 主操作：详情、预览、血缘、申请权限、编辑。

#### 表格视图

面向管理员和治理人员，保留批量治理能力：

- 批量修改主题域、负责人、状态。
- 批量发布/归档。
- 批量查看质量、权限、引用、最近同步。
- 批量迁移旧数据视图。

#### 数据视图详情

数据视图详情应使用统一资产详情框架，但额外包含：

- 视图定义：来源表/模型、筛选条件、计算字段、排序、聚合或 SQL/配置摘要。
- 字段清单：输出字段、字段来源、敏感标记、可见性。
- 预览：遵守字段权限和脱敏。
- 权限：谁可查看、使用、导出、推送。
- 血缘：上游来源和下游报表/API/推送。
- 影响分析：字段删除、类型修改、视图归档前必须检查下游影响。

### 19.4 旧入口迁移策略

系统设置旧“数据视图”入口按三阶段处理：

| 阶段 | 系统设置旧入口 | 数据仓库数据资产 | 要求 |
|---|---|---|---|
| 兼容期 | 可访问、显示迁移提示，支持搜索和跳转 | 建设统一资产目录，数据视图作为资产类型展示 | 旧能力不回退 |
| 主迁移期 | 降级为只读/跳转，写操作转向数据仓库同一 service | 成为数据视图主编辑入口 | 防止双写 |
| 下线期 | 菜单隐藏，旧 URL 重定向或显示下线说明 | 唯一主入口 | 旧 ID 映射可追溯 |

旧入口下线条件：

1. 所有旧数据视图都能映射到统一资产目录。
2. 新资产详情能覆盖旧数据视图的查看、编辑、预览、权限、引用和出仓入口。
3. 旧 ID 到新资产 ID 的映射可查询、可回滚。
4. 旧链接可重定向到新详情。
5. 权限、脱敏、预览结果、下游引用对账通过。
6. 不存在系统设置和数据仓库两个入口分别编辑导致不一致。

### 19.5 与 T08 的关系

T05 负责“系统设置旧数据视图如何迁出、如何与数据资产合并、旧入口如何兼容和下线”。

T08 负责“合并后的统一资产目录类型体系、资产卡片展示和数据资产卡片信息密度”。

执行顺序：

```text
T05：先做迁移边界、旧入口兼容、数据视图映射
T08：再做统一资产目录产品化、卡片视图和表格视图增强
```

---

## 20. AI 接入预留与权限传播规划（后续阶段，不回填一期）

> 本节为二期及以后开发约束。数据仓库一期已完成，本节不得被解释为一期已实现能力，也不得把 AI 或权限传播要求补记到已完成任务中。后续任何涉及 AI、派生资产、数据预览、数据开放、出仓、导出、建模和调度的开发，必须在对应未完成原子任务中显式落实。

### 20.1 评审结论

1. **需要预留 AI 接入，但不应在当前阶段直接建设自由 AI 功能。** 数据仓库适合作为 AI 可理解的数据资产、指标、血缘、质量、影响分析上下文来源，但不应直接在业务页面加入任意 Prompt、任意 SQL、任意脚本或绕过权限的智能体能力。
2. **必须复用 `004-ai-native-workbench` 的能力注册与治理模式。** 后续数据仓库 AI 能力必须通过 Capability Registry / Tool Wrapper / Policy Guard / Context Builder / Audit 接入，不允许页面或后端业务接口直接调用模型。
3. **必须复用 `005-unified-permission-model` 的统一权限原则。** AI 可见上下文只能是当前用户通过普通 UI/API 已有权限可见的数据子集；字段隐藏、字段脱敏、行级范围、导出限制、模型使用权限和发布权限必须先执行，再构造 AI 上下文。
4. **AI 接入不改变 UCP/数据仓库边界。** 数据仓库 AI 只可读取数据仓库侧资产、字段、质量、血缘、影响分析和 UCP 只读摘要；不得读取 UCP secret、凭证、连接串、Pipeline 配置明细，不得触发 UCP Pipeline 编辑或执行。
5. **权限传播必须前置到 ODS → DWD → DWS → ADS。** 派生字段、聚合字段、指标、ADS 宽表和开放 API 不能降低原始字段敏感级别；多源派生如无法确定权限策略，必须 fail closed。
6. **二期/三期必须完成分层口径纠偏。** `warehouse_layer` 只保留 `ODS/DWD/DWS/ADS`；`RAW` 是接入/血缘阶段，`METRIC` 是资产类型，`DM` 是消费域/数据集市标签，三者不得混入分层枚举。

### 20.2 与 004 AI Native Workbench 的协同边界

后续数据仓库 AI 能力必须注册为受控 capability，并按风险分级治理：

| 能力级别 | 可纳入阶段 | 示例 capability | 约束 |
|---|---|---|---|
| 只读查询/解释 | 二期起 | `warehouse.asset.search`、`warehouse.asset.explain`、`warehouse.lineage.explain`、`warehouse.impact.explain`、`warehouse.quality.explain`、`warehouse.metric.explain` | 只返回当前用户可见元数据/摘要；不得返回隐藏字段、明文敏感值、secret |
| 草稿生成 | 三期起 | `warehouse.standardization_rule.draft`、`warehouse.dws_aggregate.draft`、`warehouse.ads_definition.draft`、`warehouse.metric_definition.draft`、`warehouse.quality_rule.draft` | 仅生成草稿；必须人工预览、影响分析、权限校验后才能保存/发布 |
| 写入/开放/导出 | 四期复评 | `warehouse.rule.save`、`warehouse.model.publish`、`warehouse.ads.publish`、`warehouse.api_expose.create`、`warehouse.asset.export` | 默认不开放；如开放必须审批、二次确认、审计、可回滚、权限强校验 |
| 禁止项 | 一期至三期均禁止 | 任意 SQL/脚本执行、凭证查看/编辑、UCP Pipeline 触发、批量授权、绕过影响分析的破坏性操作、ODS 原始明细直接入模型上下文 | 不得注册 capability；不得通过隐藏入口实现 |

### 20.3 与 005 统一权限模型的协同边界

后续开发必须区分四类权限，不得混用：

1. **元数据可见权限**：能否看到资产名称、说明、owner、层级、质量摘要、血缘摘要。
2. **数据预览权限**：能否查看样例数据、明细数据、脱敏数据或聚合数据。
3. **模型/建模使用权限**：能否把资产作为 DWD/DWS/ADS、指标、视图、API 的输入。
4. **发布/开放/导出权限**：能否发布派生产物、开放 API、创建推送目标、导出数据。

权限传播规则：

- ODS 原始层字段的 `sensitivity_level`、`hidden/masked`、数据分类和行级范围必须向 DWD/DWS/ADS 产物传播。
- 派生字段默认继承上游最高敏感级别；只有明确登记脱敏、聚合、匿名化规则且通过测试后才可降低展示风险，但不得自动降低权限级别。
- DWS 聚合仍可能因小样本泄露敏感信息，必须支持最小分组阈值、敏感维度提示和禁止下钻策略。
- 多源模型必须声明 `scope_strategy`；策略不确定、字段冲突或权限冲突时不得发布。
- AI 上下文构造必须在权限裁剪之后执行，而不是先构造上下文再让模型判断能否展示。

### 20.4 后续阶段落点

- **二期**：先完成概念拆分和目录口径纠偏：`warehouse_layer=ODS/DWD/DWS/ADS`，`asset_type=table/view/model/metric/api`，`source_stage/lineage_node` 承载 RAW；在此基础上建设只读 AI-ready 元数据契约、能力注册清单、Context 安全裁剪、权限传播字段和只读解释类能力的接口预留；UI 仅允许“解释/总结/影响说明”类入口，并展示数据范围和权限提示。
- **三期**：所有仓内加工仍沿 ODS→DWD→DWS→ADS 的受控向导展开；指标定义、指标物化、数据集市/消费域标签作为 DWS/ADS 产物的资产类型或业务标签处理，不新增 `METRIC`/`DM` 分层；AI 只生成规则/聚合/指标/ADS 定义草稿，不直接保存、不发布、不调度。
- **四期**：复评写入、导出、开放 API、自动发布类能力；默认禁用，只有在审批、审计、回滚、影响分析和权限模型成熟后才能试点。
- **最终蓝图**：数据仓库可作为 AI Native Workbench 的受控数据能力提供方，但仍保持独立应用边界、独立权限边界和可审计能力边界。

### 20.5 UI 与交互要求

后续若增加 AI 入口，必须遵守：

- AI 入口不能默认出现在所有页面；只能在已完成权限裁剪和能力注册的页面出现。
- 按钮文案必须表达能力边界，如“解释血缘”“生成规则草稿”“总结质量问题”，不得使用含糊的“AI 自动处理”。
- AI 面板必须展示：使用的 capability、当前用户、数据范围、字段脱敏状态、输入来源、输出是否草稿、审计编号。
- 写入/发布/导出类能力必须二次确认，并先展示影响分析结果。
- 无权限、敏感字段、UCP 不可用、上下文为空、Policy Guard 拒绝时必须有明确空态/禁用态/错误态。

具体执行以 `atomic-tasks.md` 的 Y 章和 U26 线框图为准。



