# 开发任务清单


> 注意：本文件是阶段级任务清单。实际开发请使用更细的 `atomic-tasks.md`。涉及 UI 的任务必须同时遵守 `ui-implementation-guardrails.md`。
> 使用方式：每完成一个最小任务，将 `[ ]` 改为 `[x]`，并在提交信息中引用任务编号。  
> 原则：每个任务应尽量小，可独立测试，可被其他模型接手。
> 强约束：具体执行必须遵守 `atomic-tasks.md` 的 A05 防误解强约束，以及对应章节的 `X00 实现契约与禁止项`；涉及 API/权限/Schema/SQL/敏感字段时不得只按本文件的阶段级简述实现。

## Phase 0：准备与对齐

- [ ] T0001 确认当前开发分支基于 main，且了解 `feature/ucp-data-connection-platform` 的模型与 API。
- [ ] T0002 阅读本目录下 `spec.md`、`ui-interaction.md`、`testing-acceptance.md`。
- [ ] T0003 运行现有后端测试，记录基线结果。
- [ ] T0004 运行现有前端 build，记录基线结果。
- [ ] T0005 确认是否已合并 UCP 分支；若未合并，所有 UCP 字段/API 需可空、可降级。

## Phase 1：菜单与路由骨架

- [ ] T0101 在 seed 菜单中新增 `warehouse` 顶层菜单。
- [ ] T0102 新增 `warehouse.assets` 菜单。
- [ ] T0103 新增 `warehouse.modeling` 菜单。
- [ ] T0104 新增 `warehouse.metrics` 菜单。
- [ ] T0105 新增 `warehouse.governance` 菜单。
- [ ] T0106 新增 `warehouse.impact` 菜单。
- [ ] T0107 确保超级管理员自动拥有新增菜单权限。
- [ ] T0108 前端新增 `/warehouse` 首页路由。
- [ ] T0109 前端新增 `/warehouse/assets` 路由。
- [ ] T0110 前端新增 `/warehouse/modeling` 路由。
- [ ] T0111 前端新增 `/warehouse/metrics` 路由。
- [ ] T0112 前端新增 `/warehouse/governance` 路由。
- [ ] T0113 前端新增 `/warehouse/impact` 路由。
- [ ] T0114 确认旧路由 `/datasource/datasets`、`/data/view` 仍可访问。


## Phase 1.5：系统设置归并与兼容前置（必须早于二期大规模开发）

> 本阶段不是最终清理，而是 Phase 2 前置。详细执行以 `atomic-tasks.md` T 章为准。每个涉及 UI 的任务必须引用 U14-U21 线框图，并按 `testing-acceptance.md` 第 9 章验收。

- [ ] T1P501 完成字段管理、接口配置、同步历史、表间关联、数据视图、数据接入入口的 canonical owner 矩阵。
- [ ] T1P502 字段管理旧入口改为只读/跳转/同 service 写入策略，数据仓库字段资产为主入口。
- [ ] T1P503 接口配置从系统设置迁出：资产级 DataSource/PushTarget/API 暴露迁入数据仓库“来源与开放”，平台级连接器/凭证/接口定义/Pipeline 归 UCP/数据连接，旧入口兼容后下线。
- [ ] T1P504 同步历史按 DataSource/UCP/仓内任务 owner 保存，数据仓库资产详情做聚合展示。
- [ ] T1P505 表间关联主入口迁移到数据仓库建模，旧入口只读/跳转/禁写。
- [ ] T1P506 数据视图从系统设置迁出并合并到数据仓库“数据资产”，设计旧 ID 到新资产 ID 的兼容关系、旧入口只读/跳转和下线计划。
- [ ] T1P507 数据仓库保留数据接入与数据开放视角入口，保证 UCP 未建设时现有 DataSource 拉取能力和 PushTarget 推送/API 暴露能力不回退。
- [ ] T1P508 统一资产目录支持卡片视图和表格视图，数据视图以资产类型融入资产目录。
- [ ] T1P509 表间关联授权完成模型梳理、迁移设计、旧入口兼容和权限矩阵验收。
## Phase 2：数据库迁移

- [ ] T0201 新增 Alembic migration，扩展 `registered_tables.warehouse_layer`。
- [ ] T0202 扩展 `registered_tables.subject_area`。
- [ ] T0203 扩展 `registered_tables.owner_user_id`。
- [ ] T0204 扩展 `registered_tables.owner_name`。
- [ ] T0205 扩展 `registered_tables.source_system`。
- [ ] T0206 扩展 `registered_tables.asset_status`。
- [ ] T0207 扩展 `registered_tables.ucp_system_id`，可空，无强 FK。
- [ ] T0208 扩展 `registered_tables.ucp_resource_id`，可空，无强 FK。
- [ ] T0209 扩展 `registered_tables.ucp_connector_config_id`，可空，无强 FK。
- [ ] T0210 扩展 `registered_tables.last_quality_status`。
- [ ] T0211 扩展 `registered_tables.last_quality_checked_at`。
- [ ] T0212 扩展 `datasets.warehouse_layer`。
- [ ] T0213 扩展 `datasets.subject_area`。
- [ ] T0214 扩展 `datasets.owner_user_id`。
- [ ] T0215 扩展 `datasets.owner_name`。
- [ ] T0216 扩展 `datasets.status`。
- [ ] T0217 扩展 `datasets.business_definition`。
- [ ] T0218 扩展 `datasets.version`。
- [ ] T0219 扩展 `datasets.published_at`。
- [ ] T0220 扩展 `datasets.published_by`。
- [ ] T0221 新建 `dataset_output_fields` 表。
- [ ] T0222 新建 `warehouse_metrics` 表。
- [ ] T0223 更新 ORM 模型。
- [ ] T0224 编写 migration downgrade。
- [ ] T0225 本地执行 alembic upgrade 成功。

## Phase 3：后端数据资产 API

- [ ] T0301 新建 `app/warehouse` 模块。
- [ ] T0302 新建 warehouse router 并挂载到 main。
- [ ] T0303 实现 `GET /warehouse/assets`。
- [ ] T0304 资产列表支持 keyword 筛选。
- [ ] T0305 资产列表支持 warehouse_layer 筛选。
- [ ] T0306 资产列表支持 subject_area 筛选。
- [ ] T0307 资产列表支持 source_system 筛选。
- [ ] T0308 资产列表支持 asset_status 筛选。
- [ ] T0309 实现 `GET /warehouse/assets/{table_name}`。
- [ ] T0310 实现 `PATCH /warehouse/assets/{table_name}`。
- [ ] T0311 实现 `GET /warehouse/assets/{table_name}/columns`，复用现有字段权限逻辑。
- [ ] T0312 实现 `GET /warehouse/assets/{table_name}/references`。
- [ ] T0313 增加权限校验 `warehouse.assets`。
- [ ] T0314 增加资产 API 单元测试。

## Phase 4：后端建模 API

- [ ] T0401 实现 `GET /warehouse/models`，包装现有 DataSet。
- [ ] T0402 实现 `POST /warehouse/models`。
- [ ] T0403 实现 `GET /warehouse/models/{id}`。
- [ ] T0404 实现 `PATCH /warehouse/models/{id}`。
- [ ] T0405 实现 `POST /warehouse/models/{id}/preview`。
- [ ] T0406 预览返回前 20 条数据。
- [ ] T0407 预览返回主表行数。
- [ ] T0408 预览返回关联后行数。
- [ ] T0409 预览返回未匹配行数或占位统计。
- [ ] T0410 预览返回重复匹配数或占位统计。
- [ ] T0411 实现 `POST /warehouse/models/{id}/publish`。
- [ ] T0412 实现 `POST /warehouse/models/{id}/archive`。
- [ ] T0413 实现 `GET /warehouse/models/{id}/references`。
- [ ] T0414 增加权限校验 `warehouse.modeling`。
- [ ] T0415 增加建模 API 测试。

## Phase 5：输出字段 API

- [ ] T0501 实现 `GET /warehouse/models/{id}/output-fields`。
- [ ] T0502 实现 `PUT /warehouse/models/{id}/output-fields`。
- [ ] T0503 保存输出字段时校验 source_alias 存在于 DataSetTable。
- [ ] T0504 保存输出字段时校验 source_column 存在。
- [ ] T0505 output_code 在同一 dataset 内唯一。
- [ ] T0506 支持 display_order 排序。
- [ ] T0507 增加输出字段 API 测试。

## Phase 6：指标目录 API

- [ ] T0601 实现 `GET /warehouse/metrics`。
- [ ] T0602 实现 `POST /warehouse/metrics`。
- [ ] T0603 实现 `GET /warehouse/metrics/{id}`。
- [ ] T0604 实现 `PATCH /warehouse/metrics/{id}`。
- [ ] T0605 实现 `POST /warehouse/metrics/{id}/publish`。
- [ ] T0606 实现 `POST /warehouse/metrics/{id}/archive`。
- [ ] T0607 metric_code 唯一校验。
- [ ] T0608 related_dataset_id 存在性校验。
- [ ] T0609 增加权限校验 `warehouse.metrics`。
- [ ] T0610 增加指标 API 测试。

## Phase 7：影响分析

- [ ] T0701 实现表级影响分析 `/warehouse/impact/table/{table_name}`。
- [ ] T0702 实现字段级影响分析 `/warehouse/impact/field`。
- [ ] T0703 实现模型级影响分析 `/warehouse/impact/model/{dataset_id}`。
- [ ] T0704 字段级影响分析覆盖 DataSetRelation.keys。
- [ ] T0705 字段级影响分析覆盖 dataset_output_fields。
- [ ] T0706 字段级影响分析覆盖 DatasetCalculatedField.depends_on。
- [ ] T0707 字段级影响分析覆盖报表字段、筛选、排序。
- [ ] T0708 字段级影响分析覆盖 warehouse_metrics.related_fields。
- [ ] T0709 返回 risk_level。
- [ ] T0710 返回 blocking。
- [ ] T0711 在字段删除/类型修改接口中接入影响分析阻断。
- [ ] T0712 增加影响分析测试。

## Phase 8：UCP 协同与降级

- [ ] T0801 RegisteredTable 支持保存 UCP 关联 ID。
- [ ] T0802 资产详情接口返回 UCP 关联信息。
- [ ] T0803 若 UCP router 不存在，资产接口不报错。
- [ ] T0804 若 UCP 已启用，支持读取 `/ucp/bridge-targets` 或提供跳转信息。
- [ ] T0805 前端在 UCP 未启用时显示“数据连接平台未启用”。
- [ ] T0806 前端在 UCP 已启用时显示“跳转数据连接配置”。
- [ ] T0807 增加 UCP 降级测试。

## Phase 9：前端数据仓库首页

- [ ] T0901 新建 WarehouseHome.vue。
- [ ] T0902 展示数据表数量。
- [ ] T0903 展示数据模型数量。
- [ ] T0904 展示指标数量。
- [ ] T0905 展示质量告警数量。
- [ ] T0906 展示 ODS/DWD/DWS/ADS 分层概览。
- [ ] T0907 展示最新动态列表。
- [ ] T0908 首页空数据状态友好展示。

## Phase 10：前端数据资产页

- [ ] T1001 新建 WarehouseAssets.vue。
- [ ] T1002 实现资产列表。
- [ ] T1003 实现 keyword 搜索。
- [ ] T1004 实现分层筛选。
- [ ] T1005 实现主题域筛选。
- [ ] T1006 实现来源系统筛选。
- [ ] T1007 实现负责人筛选。
- [ ] T1008 实现状态筛选。
- [ ] T1009 实现质量状态筛选。
- [ ] T1010 实现资产详情抽屉。
- [ ] T1011 实现资产元数据编辑。
- [ ] T1012 实现字段入口跳转。
- [ ] T1013 实现预览入口跳转。
- [ ] T1014 实现影响分析入口跳转。
- [ ] T1015 实现来源配置/UCP 跳转入口。

## Phase 11：前端字段定义增强

- [ ] T1101 在数据仓库中提供字段定义入口。
- [ ] T1102 字段列表展示字段编码、名称、类型、主键、敏感、维度/度量、来源、可见、描述。
- [ ] T1103 实现字段详情抽屉基础信息区。
- [ ] T1104 实现字段详情抽屉数仓属性区。
- [ ] T1105 实现字段详情抽屉权限属性区。
- [ ] T1106 实现字段详情抽屉变更影响区。
- [ ] T1107 删除字段前展示影响分析。
- [ ] T1108 修改字段类型前展示影响分析。

## Phase 12：前端快速关联

- [ ] T1201 新建 QuickRelationWizard.vue。
- [ ] T1202 Step 1 选择主表、关联表、别名。
- [ ] T1203 Step 2 配置关联类型、字段组、基数。
- [ ] T1204 Step 3 配置输出字段。
- [ ] T1205 实现预览按钮。
- [ ] T1206 实现保存草稿。
- [ ] T1207 实现发布为模型。
- [ ] T1208 表单校验完整。

## Phase 13：前端可视化建模 V1

- [ ] T1301 新建 VisualModelingV1.vue。
- [ ] T1302 顶部基础信息表单。
- [ ] T1303 左侧表选择区。
- [ ] T1304 中间关系图展示区。
- [ ] T1305 右侧节点配置区。
- [ ] T1306 右侧连线配置区。
- [ ] T1307 底部输出字段表格。
- [ ] T1308 实现添加表。
- [ ] T1309 实现移除表。
- [ ] T1310 实现新增关联。
- [ ] T1311 实现编辑关联。
- [ ] T1312 实现输出字段勾选。
- [ ] T1313 实现输出字段重命名和描述。
- [ ] T1314 实现预览。
- [ ] T1315 实现保存草稿。
- [ ] T1316 实现发布。
- [ ] T1317 明确不实现自由拖拽连线。

## Phase 14：前端指标管理

- [ ] T1401 新建 WarehouseMetrics.vue。
- [ ] T1402 实现指标列表。
- [ ] T1403 实现新建指标。
- [ ] T1404 实现编辑指标。
- [ ] T1405 实现发布指标。
- [ ] T1406 实现归档指标。
- [ ] T1407 实现依赖数据集选择。
- [ ] T1408 实现依赖字段配置。

## Phase 15：前端治理与影响分析

- [ ] T1501 新建 WarehouseGovernance.vue。
- [ ] T1502 展示未设置分层资产。
- [ ] T1503 展示未设置负责人模型。
- [ ] T1504 展示最近字段变更占位/数据。
- [ ] T1505 新建 WarehouseImpact.vue。
- [ ] T1506 实现表影响分析。
- [ ] T1507 实现字段影响分析。
- [ ] T1508 实现模型影响分析。
- [ ] T1509 展示 risk_level。
- [ ] T1510 展示 blocking。
- [ ] T1511 提供引用对象跳转。

## Phase 16：测试、验收与文档

- [ ] T1601 后端新增测试全部通过。
- [ ] T1602 前端 build 通过。
- [ ] T1603 手工验收数据仓库首页。
- [ ] T1604 手工验收数据资产页。
- [ ] T1605 手工验收快速关联。
- [ ] T1606 手工验收可视化建模 V1。
- [ ] T1607 手工验收指标目录。
- [ ] T1608 手工验收影响分析。
- [ ] T1609 手工验收 UCP 未启用降级。
- [ ] T1610 更新 README 或开发说明。



---

## Phase 17：评审修订、分层流转与 ELT/ETL 预留任务入口

阶段级任务保留在本文件，具体执行必须进入 `atomic-tasks.md`：

- O 章节：评审修订落地原子任务。
- P 章节：ODS → DWD → DWS → ADS 分层流转与数据仓库轻量 ELT / ETL 预留原子任务。

涉及 UCP 绑定、/warehouse/ucp/*、ConnectorSystemConfig、DataSource 兼容、影响分析、首页口径、ODS→DWD→DWS→ADS 分层流转、数据集物化、指标物化、质量规则、快照拉链时，必须优先执行 O/P/R 对应原子任务。


---

## Phase 18：二期、三期、四期与最终蓝图阶段任务

> 阶段级说明如下；实际开发必须进入 `atomic-tasks.md` Q/R/S 章节逐项执行。

### 后续阶段 2：数据治理深化 + UCP 薄代理 + 可视化建模 V2

- 数据分层标签增强与口径纠偏：`warehouse_layer` 保持 ODS/DWD/DWS/ADS，RAW/DM/METRIC 分别进入来源阶段、消费域标签、资产类型。
- 统一资产目录增强：asset_type 覆盖 table/view/model/metric/api，分层筛选只筛 ODS/DWD/DWS/ADS。
- 数据血缘追踪。
- 数据质量规则、执行、告警摘要。
- `/api/v1/warehouse/ucp/*` 薄代理。
- UCP 资源选择器。
- 可视化建模 V2。
- 数据仓库监控页。

### 后续阶段 3：能力下沉与增强

- ODS → DWD 标准化与清洗。
- 分层产物物化与刷新；物化输出只允许 DWD/DWS/ADS，数据集市用消费域/主题域标签表达。
- DWD → DWS 指标物化、维度管理和 DWS 聚合；指标作为 asset_type=metric 或语义对象，不作为 warehouse_layer。
- DWD → DWS 聚合视图生成。
- DWS → ADS 组装与消费资产发布。
- 快照与拉链。
- 仓内调度、重跑和审计。
- 数据开放 API 规划。


### 后续阶段 4：高级数据开发与消费侧能力复评

- BI 自助分析集成，不内建报表/大屏设计器。
- 任意 SQL / 脚本 ETL 安全沙箱复评，默认禁用，必要时受控试点。
- 跨系统 Pipeline 继续归 UCP，数据仓库只做摘要、影响和跳转。
- 复杂星型/雪花模型设计复评，仅纳入高复用、可治理子集。
- 执行入口：`atomic-tasks.md` X 章，UI 参考 U24。

### 最终蓝图：独立应用化与完整治理

- 独立 API 和权限边界。
- 完整元数据目录。
- 字段级完整血缘。
- 治理工作台闭环。
- 指标语义层服务。
- 数据开放服务。
- SLA、监控、变更发布治理。
- 全量回归验收套件。


---

## Phase 1.5 执行说明：系统设置归并前置

在二期 Q 章大规模开发前，必须先完成 T 章以下前置设计：

- T0001 五类既有能力权责归属。
- T0101 字段管理 canonical owner。
- T0201 接口配置不长期留在系统设置，资产级能力迁入数据仓库“来源与开放”。
- T0301 同步历史 owner 与资产侧聚合。
- T0401 表间关联主入口迁移。
- T0501-T0507 数据视图从系统设置迁出并合并到数据资产，覆盖映射、详情、卡片/表格、权限引用、旧入口兼容和专项验收。
- T0701 数据仓库保留数据接入视角入口。
- T0801 数据视图与数据资产统一资产目录。
- T0901 表间关联授权模型梳理。

这些不是最终收尾任务，而是避免重复建设和双写的前置架构任务。执行状态仍以本文件 Phase 1.5 任务项和 `atomic-tasks.md` T 章为准。




---

## Phase 19：AI 接入预留与权限传播后续阶段任务

> 本阶段仅面向二期及以后；一期已完成，禁止把以下任务标记为已完成或回填到一期完成项。实际开发必须进入 `atomic-tasks.md` Y 章逐项执行。

- [ ] T1901 建立数据仓库 AI 接入与权限传播执行契约，执行 Y0001-Y0002。
- [ ] T1902 定义只读解释类、草稿生成类和四期复评类 capability 矩阵，执行 Y0101-Y0103。
- [ ] T1903 设计 AI Context 安全裁剪和审计摘要，执行 Y0201-Y0202。
- [ ] T1904 将字段敏感级别、masking、hidden、scope_strategy 传播到 ODS → DWD → DWS → ADS，执行 Y0301-Y0303。
- [ ] T1905 二期仅接入只读解释类 AI-ready 能力，执行 Y0401-Y0402。
- [ ] T1906 三期在受控向导中接入草稿生成能力，执行 Y0501-Y0502。
- [ ] T1907 四期复评写入、发布、导出和开放 API 类 AI 能力，执行 Y0601-Y0602。

执行要求：

- 所有 AI 能力必须遵循 `004-ai-native-workbench` 的 Capability Registry / Tool Wrapper / Policy Guard / Context Builder / Audit 模式。
- 所有数据上下文必须遵循 `005-unified-permission-model`；AI 可见上下文只能是当前用户普通 UI/API 可见数据的子集。
- 所有涉及 UI 的任务必须引用 `atomic-tasks.md` U26，并在原子任务中写明 normal/loading/empty/error/forbidden/policy-denied 状态。
- 所有涉及测试的任务必须在原子任务中列出单元测试、接口测试、组件测试、E2E 或不适用原因。



