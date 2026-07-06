# 测试要求与验收标准

## 1. 测试目标

确保数据仓库应用建设不会破坏现有 HR Portal 能力，并能够与 UCP 数据连接平台并行演进。

测试重点：

1. 新增数据仓库能力正确可用。
2. 旧数据接入、数据视图、报表能力不回退。
3. UCP 未启用时系统可降级。
4. UCP 启用时可展示和跳转关联资源。
5. 权限、脱敏、导出、安全不回退。

---

## 2. 后端单元测试要求

### 2.1 数据资产

必须测试：

- 创建/迁移后的 RegisteredTable 默认字段正确。
- `GET /warehouse/assets` 返回资产列表。
- keyword 筛选正确。
- warehouse_layer 筛选正确。
- subject_area 筛选正确。
- source_system 筛选正确。
- asset_status 筛选正确。
- `PATCH /warehouse/assets/{table}` 可更新分层、主题域、负责人、状态。
- 更新不存在表返回 404。
- UCP 字段为空时不报错。

### 2.2 字段

必须测试：

- `GET /warehouse/assets/{table}/columns` 返回字段。
- 敏感字段遵守现有隐藏/脱敏逻辑。
- 无权限用户不能修改字段。
- 字段详情包含主键、敏感、维度/度量、计算字段信息。

### 2.3 建模

必须测试：

- 新建 draft 模型。
- 修改模型元数据。
- 添加多张表。
- 添加多条关联。
- 发布模型。
- 归档模型。
- 预览返回 items 和 summary。
- 3 张表链式关联可保存。

### 2.4 输出字段

必须测试：

- 新增 output fields。
- 更新 output fields。
- output_code 唯一。
- source_alias 不存在时报错。
- source_column 不存在时报错。
- 排序正确。

### 2.5 指标

必须测试：

- 新建指标。
- metric_code 唯一。
- 编辑指标。
- 发布指标。
- 归档指标。
- 按主题域/状态筛选。
- 关联不存在 dataset 时返回错误。

### 2.6 影响分析

必须测试：

- 表被数据集引用时返回 dataset 引用。
- 字段被 DataSetRelation.keys 引用时返回 relation 引用。
- 字段被 dataset_output_fields 引用时返回 output_field 引用。
- 字段被 DatasetCalculatedField.depends_on 引用时返回 calculated_field 引用。
- 字段被报表引用时返回 report 引用。
- 字段被指标引用时返回 metric 引用。
- 高风险引用返回 `blocking=true`。
- 无引用返回空列表和 `blocking=false`。

### 2.7 UCP 降级

必须测试：

- UCP 表不存在时，warehouse assets API 不报错。
- UCP router 未挂载时，前端需要的 warehouse API 不报错。
- RegisteredTable 保存 ucp_* 字段后仍可查询。
- UCP bridge targets 不可用时返回友好错误或空状态。

---

## 3. 后端集成测试要求

### 3.1 一期主链路

场景：

1. 创建/准备 3 张数据表。
2. 设置表资产分层和主题域。
3. 创建一个数据模型。
4. 加入 3 张表。
5. 配置 A→B→C 链式关联。
6. 配置输出字段。
7. 预览前 20 条。
8. 发布模型。
9. 创建指标并关联模型。
10. 对被引用字段做影响分析。

验收：

- 所有步骤 API 成功。
- 影响分析能返回模型和指标引用。
- 发布后的模型状态为 published。

### 3.2 回归主链路

必须验证：

- `/datasource/endpoints` 仍可用。
- `/datasource/sync-runs` 仍可用。
- `/datasource/datasets` 仍可用或有兼容重定向。
- `/data/view` 仍可用。
- `/report/list` 和报表设计仍可用。
- 数据导出仍遵守脱敏和隐藏列。

---

## 4. 前端手工验收用例

### 4.1 菜单权限

- 超级管理员可看到数据仓库一级菜单。
- 无权限用户看不到数据仓库菜单。
- 直接访问无权限路由会跳回首页或登录页。

### 4.2 数据仓库首页

- 四个核心卡片显示正常。
- 分层概览显示正常。
- 最新动态空状态正常。
- 接口失败时有错误提示。

### 4.3 数据资产

- 列表加载正常。
- 所有筛选条件可用。
- 编辑资产元数据后刷新仍保留。
- 点击字段进入字段页。
- 点击预览进入数据预览。
- UCP 未启用时来源配置显示友好提示。

### 4.4 字段定义

- 字段列表显示完整。
- 点击字段打开详情抽屉。
- 抽屉四个分区显示正常。
- 删除字段前出现影响分析。
- 高风险引用时阻断删除。

### 4.5 快速关联

- Step 1 可选择两张表。
- Step 2 可配置关联条件。
- Step 3 可选择输出字段。
- 预览成功显示数据和摘要。
- 保存草稿成功。
- 发布成功。

### 4.6 可视化建模 V1

- 可添加 3 张表。
- 关系图自动展示 3 个节点。
- 可配置 A→B、B→C 两条关联。
- 点击连线可编辑关联。
- 可配置输出字段。
- 可预览。
- 可保存草稿。
- 可发布。
- 页面没有误导用户使用尚未实现的自由拖拽连线。

### 4.7 指标管理

- 列表显示正常。
- 新建指标成功。
- 编辑指标成功。
- 发布指标成功。
- 归档指标成功。
- 可关联数据集和字段。

### 4.8 影响分析

- 可选择表进行分析。
- 可选择字段进行分析。
- 可选择模型进行分析。
- 引用列表显示类型、名称、位置、风险等级。
- blocking 状态显示清晰。

---

## 5. 性能要求

一期最低要求：

- 数据资产列表 1000 张表以内，接口响应应在 2 秒内。
- 字段列表 500 字段以内，接口响应应在 2 秒内。
- 影响分析在常规规模下 3 秒内返回。
- 预览默认只取前 20 条，不能全表拉取。
- 前端表格必须分页或虚拟滚动，不允许一次渲染超大数据。

---

## 6. 安全要求

- 敏感字段不得在无权限用户的 API 响应中返回真实值。
- 隐藏字段不得出现在通用数据预览和导出中。
- UCP 凭证不得在数据仓库页面展示明文。
- DataSource secrets 不得通过 warehouse API 返回。
- 影响分析可以展示字段名，但不能泄露敏感字段值。
- 所有写操作必须校验登录态和菜单操作权限。

---

## 7. 验收清单

一期验收必须全部满足：

- [ ] 数据仓库一级菜单上线。
- [ ] 数据资产列表可用。
- [ ] 表资产元数据可编辑。
- [ ] 字段定义增强可用。
- [ ] 快速关联三步流程可用。
- [ ] 可视化建模 V1 可完成 3 表链式关联。
- [ ] 输出字段配置可用。
- [ ] 预览数据和摘要可用。
- [ ] 指标目录可用。
- [ ] 影响分析可用。
- [ ] UCP 未启用可降级。
- [ ] 旧数据接入能力不回退。
- [ ] 报表能力不回退。
- [ ] 权限和脱敏不回退。
- [ ] 后端测试通过。
- [ ] 前端 build 通过。


---

## 8. 多模型实现防误解验收矩阵

> 本节用于 code review 和后续模型开发。凡是 `atomic-tasks.md` 中已标记完成的后端/API 任务，必须能在本矩阵中找到对应证据；没有证据时不得仅凭“代码可运行”通过。

### 8.1 后端 API 通用验收

每个新增或改造 API 必须检查：

- 请求体是否使用明确 Pydantic Schema；除透传 JSON 外，禁止 `payload: dict`。
- 路由是否挂载正确 `require_op(menu_code, op)`。
- 是否覆盖状态码：成功、400 业务错误、403 权限不足、404 资源不存在、422 参数校验错误。
- 是否未泄露 secret、敏感真实值、隐藏字段。
- 是否未破坏旧 `/datasource/*`、`/data/*`、`/report/*` 行为。
- 是否有 py_compile/import 验证记录。

### 8.2 D 章数据资产 API 必测点

- `GET /warehouse/assets`：
  - 有 `warehouse.assets:V` 权限时返回 `total/page/page_size/items`。
  - 无权限返回 403。
  - `keyword` 匹配 `table_name/table_label/description`。
  - `warehouse_layer/subject_area/source_system/asset_status` 筛选有效。
- `GET /warehouse/assets/{table_name}`：
  - 存在返回详情与 UCP 可空字段。
  - 不存在返回 404。
- `PATCH /warehouse/assets/{table_name}`：
  - 使用 `WarehouseAssetUpdateIn`。
  - `warehouse_layer` 仅允许 `ODS/DWD/DWS/ADS`，非法 400。
  - `asset_status` 仅允许 `draft/published/disabled/archived`，非法 400。
  - 显式传入 `null` 可清空 nullable 字段。
  - 无 `warehouse.assets:U` 权限返回 403。
- `GET /warehouse/assets/{table_name}/columns`：
  - 不存在表返回 404。
  - 返回字段按 `display_order, id` 排序。
  - 过滤 `is_visible=False`。
  - 复用 `get_hidden_columns()` / `resolve_field_access()`，无权字段不出现在响应中。
  - 字段包含 `agg_role/is_sensitive/is_computed/formula_expr/display_order`。

### 8.3 E 章模型与输出字段 API 必测点

- `POST /warehouse/models`：
  - 使用 `WarehouseModelCreateIn`；缺 `name` 返回 422。
  - 新建 `DataSet.status=draft`。
  - 创建 tables/relations 时写入 `DataSetTable/DataSetRelation`，不得另建重复模型表。
  - 无创建权限返回 403。
- `GET /warehouse/models`：
  - 支持分页和 `status/warehouse_layer/subject_area/keyword` 筛选。
- `GET /warehouse/models/{id}`：
  - 存在返回 `tables/relations/output_fields`。
  - 不存在返回 404。
- `PATCH /warehouse/models/{id}`：
  - 使用 `WarehouseModelUpdateIn`。
  - 不存在返回 404。
- `POST /warehouse/models/{id}/publish`：
  - 无表返回 400。
  - 多表无关联返回 400。
  - 成功后 `status=published`，写入 `published_at/published_by`。
- `POST /warehouse/models/{id}/archive`：
  - 成功后 `status=archived`。
- `GET /warehouse/models/{id}/output-fields`：
  - 先校验 DataSet 存在；不存在返回 404，而不是空数组。
  - 按 `display_order` 排序。
- `PUT /warehouse/models/{id}/output-fields`：
  - 使用 `list[DatasetOutputFieldIn]`。
  - 校验 `source_alias` 属于该模型。
  - 校验 `source_column` 属于 alias 对应表。
  - 校验同一 dataset 内 `output_code` 唯一。
  - 保存后返回最新 output_fields。
- `POST /warehouse/models/{id}/preview`：
  - 必须调用 `app.reports.sql_builder.run_dataset_query()`。
  - 禁止手写动态 `SELECT`。
  - 多表模型必须通过 `DataSetRelation` 参与 JOIN。
  - 传入 SQL 构建器的列为 `source_alias.source_column`。
  - 返回前端的 `columns/items` key 必须映射为 `output_code`。
  - `limit` 默认 20，最大 100。
  - `summary` 包含 `main_count/result_count/unmatched_count/duplicate_match_count/null_count/type_error_count`；当前阶段允许后四项为 `null`，但必须说明暂不计算。

### 8.4 F/G/H 章提前约束

- F 指标 API：
  - 创建/更新必须使用 `WarehouseMetricCreateIn/WarehouseMetricUpdateIn` 或等价 Schema。
  - `metric_code` 重复返回 400。
  - `related_dataset_id` 不存在返回 400。
  - 发布/归档必须校验权限。
- G 影响分析：
  - 必须扫描 `DataSetTable`、`DataSetRelation.keys`、`DatasetOutputField`、`DatasetCalculatedField.depends_on`、报表配置、`warehouse_metrics.related_fields`。
  - 返回结构必须包含 `type/id/name/usage/risk_level/blocking/route`。
  - 已发布模型/报表/指标引用默认 `risk_level=high` 且 `blocking=true`。
- H UCP 协同：
  - UCP 不存在时必须降级，不得 import-time 崩溃。
  - warehouse API 不得返回 UCP/DataSource secret 明文。
  - 数据仓库只做桥接/状态/跳转，不重复建设 UCP Pipeline/凭证管理。

### 8.5 I/J/K 章前端实现必测点

- I 前端 API 封装：
  - 复用项目现有 request/http client，不新增绕过全局鉴权和错误处理的 axios/fetch 实例。
  - 页面组件不硬编码散落 `/warehouse/...`，统一从 API 模块调用。
  - 类型定义体现 nullable 字段；不得用空字符串替代后端 null。
  - 403/404/422/400 至少有一种 mock 或手工验证证据。
- J 路由与菜单：
  - `/warehouse` 路由刷新直达可用。
  - menuCode 与后端权限 code 一致。
  - 无权限用户入口隐藏或禁用。
  - 旧 `/datasource/*`、`/data/*`、`/report/*` 仍可访问。
- K UI 页面：
  - 每个页面覆盖 normal/loading/empty/error/forbidden。
  - 隐藏字段、敏感字段、secret 不展示。
  - 建模预览列使用 `output_code` 展示，不暴露内部 `source_alias.source_column`。
  - UCP 不可用时展示降级文案，不出现凭证编辑或 Pipeline 编排入口。

### 8.6 L/M/N/O/P 章交付必查点

- L 测试：
  - 后端 API 测试覆盖成功、400/422、403、404。
  - 前端至少记录 build 命令和结果。
  - migration/ORM 修改记录 alembic heads、ORM import、py_compile/import。
- M 最终验收：
  - 旧 DataSource、数据视图、报表入口回归。
  - UCP 存在/不存在两种场景有说明。
  - 未提交测试凭证、临时响应 JSON、secret。
- N UI 合规：
  - K/J/I 的可见交互均关联对应 N 章检查。
  - 有截图路径或文字化验收证据。
  - “不涉及”有明确原因。
- O 评审修订：
  - 阻塞问题已沉淀回 atomic-tasks 或 testing-acceptance。
  - 复评记录包含原问题、修复文件、验证命令、结论。
- P 分层流转与 ELT/ETL 预留：
  - 分层流转测试必须覆盖 ODS/DWD/DWS/ADS 枚举、非法层级、输入层/输出层不匹配、产物资产登记和 UI 分层状态展示。
  - 明确哪些仅为预留，哪些为已实现能力。
  - 不实现完整 DAG 调度、凭证管理、采集 Pipeline。
  - 预留字段可空或有安全默认值，UCP 不可用时可降级。

### 8.7 推荐最小命令

后端章节每次交付至少记录：

```powershell
cd D:\AI项目\HR提效工具搭建\hr-portal\backend
python -m py_compile app/warehouse/router.py app/warehouse/service.py app/warehouse/schemas.py app/main.py
python -c "import app.warehouse.router; import app.warehouse.service; from app.main import app; print('ok')"
```

如修改 migration/ORM，还需记录 Alembic heads、ORM import、migration 可执行性说明。


---

## 8.8 二期、三期、四期与最终蓝图测试要求

二期 Q 章必须新增或更新：

- 分层口径纠偏测试：`warehouse_layer` 仅允许 ODS/DWD/DWS/ADS，RAW/DM/METRIC 不出现在分层写入和筛选中；RAW 仅作为来源/血缘节点，METRIC 仅作为 asset_type。
- 血缘 API 测试。
- 质量规则 CRUD 和执行测试。
- UCP 薄代理降级测试。
- 可视化建模 V2 前端构建和手工交互验收。
- 监控/告警摘要聚合测试。

三期 R 章必须新增或更新：

- Transform / 清洗规则执行测试。
- ODS → DWD 字段标准化规则、模板、预览、DWD 视图生成测试；必须校验输入层/输出层和不覆盖 ODS 原始数据。
- DWD → DWS 聚合定义、DWS 视图生成测试；必须校验指标口径、维度绑定和资产登记。
- DWS → ADS 组装、发布、权限、脱敏、血缘和影响分析测试；必须校验 ADS 不绕过 BI/API/PushTarget 权限。
- 数据集物化运行测试；物化输出层只允许 DWD/DWS/ADS，DM 只能作为消费域/主题域标签。
- 指标物化计算测试。
- 快照 / 拉链测试。
- 仓内调度、重跑、审计测试。



四期 X 章必须具备：

- 高级能力复评 ADR 和 owner 矩阵。
- BI 集成跳转、权限、BI 不可用降级测试。
- SQL/脚本沙箱如启用，必须有安全、审批、资源限额、审计和越权测试；未启用时必须确认普通页面无任意 SQL/脚本入口。
- UCP Pipeline 摘要 200/401/403/404/timeout 测试；确认数据仓库不可编辑 Pipeline 画布。
- 高级维度模型如启用，必须有循环依赖、权限、血缘、影响分析和 BI 消费兼容测试。
- UI 必须符合 `atomic-tasks.md` U24，入口清楚标识“外部集成/受控沙箱/只读摘要/高级建模”。

最终蓝图 S 章必须具备：

- API 契约测试。
- 权限矩阵测试。
- 独立应用化降级测试。
- UCP 可用/不可用两种模式回归。
- 全量 UI 状态走查。

---

## 9. Phase 1.5 系统设置归并与兼容专项验收

> 本节对应 `atomic-tasks.md` T 章，必须在二期 Q/R/S 大规模开发前作为前置验收执行。目标是避免字段管理、接口配置、同步历史、表间关联、数据视图在系统设置和数据仓库/UCP 中长期双写、双编辑、双主数据。

### 9.1 归并总原则验收

- [ ] 每类既有能力均有 canonical owner：字段管理归数据仓库字段资产；接口配置从系统设置迁出，资产级拉取/推送/API 暴露归数据仓库“来源与开放”，平台级连接器/凭证/接口定义/Pipeline 归 UCP/数据连接；同步/推送历史按 DataSource/PushTarget/UCP/仓内任务 owner 保存、数据仓库聚合；表间关联和授权归数据仓库建模/权限；数据视图归统一资产目录。
- [ ] 旧系统设置入口仅允许只读、跳转、兼容或调用同一 service，不允许产生独立写入路径。
- [ ] 所有旧入口均展示迁移提示、主入口跳转、无权限态和只读态。
- [ ] 不因 UCP 未建设或未启用而影响现有 DataSource 拉取、SyncRun 历史、旧数据对接功能。

### 9.2 数据接入入口与 UCP 兼容验收

覆盖场景：

- [ ] DataSource-only：未启用 UCP 时，数据仓库资产仍可展示来源类型、最近同步状态、同步历史摘要和现有配置跳转。
- [ ] UCP-enabled：启用 UCP 时，数据仓库资产展示 ucp_system_id、ucp_resource_id 对应的只读摘要和跳转，不展示 secret、认证参数或 Pipeline 编辑入口。
- [ ] UCP-disabled/timeout：UCP 不可用时页面展示降级提示，资产详情、预览、字段治理不崩溃。
- [ ] 权限：无 UCP 配置权限的用户可查看来源只读摘要，但不能进入复杂连接配置。
- [ ] API：warehouse API 不强 FK UCP 表，不直接返回 UCP/DataSource secret。

### 9.3 数据视图与数据资产融合验收

- [ ] 旧数据视图均可映射为统一资产目录中的 `view` / `dataset_view` / `model` / `api` 类型之一，并存在唯一 `old_data_view_id -> warehouse_asset_id` 映射。
- [ ] 数据仓库“数据资产”是数据视图主入口；系统设置旧数据视图入口仅作为兼容/只读/跳转入口，不允许形成第二套长期主编辑。
- [ ] 资产列表同时支持卡片视图和表格视图；卡片至少展示名称、类型、分层、主题域、来源、质量、最近同步/构建、字段/记录摘要、权限状态、引用数和主操作。
- [ ] 数据视图资产详情包含概览、字段、视图定义、数据预览、权限、血缘、影响分析、来源与开放；无权限时预览脱敏或展示申请入口。
- [ ] 旧数据视图详情提供“已纳入数据资产目录”提示和新详情跳转；旧 URL 可访问、重定向或显示明确下线说明。
- [ ] 迁移前后数量、权限、字段、预览结果和下游引用对账一致；权限不得扩大，引用不得丢失。
- [ ] 卡片视图不得隐藏管理员必需信息；批量治理仍可通过表格视图完成。
- [ ] UI 必须符合 `atomic-tasks.md` 的 `U21 数据视图与数据资产合并线框图`，并覆盖 normal/loading/empty/error/forbidden 五态。

### 9.4 表间关联授权前置迁移验收

- [ ] 迁移前已梳理授权对象、授权范围、字段权限、行级条件、有效期、授权来源和审计记录。
- [ ] 数据仓库关联详情/编辑面板可展示授权状态，具备授权管理入口或只读授权 Tab。
- [ ] 权限矩阵覆盖：查看关联、使用关联建模、编辑关联、管理授权、无权限只读/禁用。
- [ ] 旧系统设置表间关联入口只读或跳转，写操作禁用或转发到同一 warehouse relation service。
- [ ] 迁移对账确认关联数量、授权数量、权限效果、审计记录一致；不得过度放权或丢失授权。

### 9.5 UI 验收要求

- [ ] 涉及 T 章的 UI 任务必须引用 `atomic-tasks.md` U14-U21 线框图。
- [ ] 实现如与线框图不一致，必须先更新 U 章，再开发页面。
- [ ] 每个页面至少验证 normal/loading/empty/error/forbidden 五态；涉及远端 UCP 的页面额外验证 timeout/unavailable 状态。

### 9.6 字段管理（T01）与同步历史（T03）归并验收

- [ ] `TableColumn` / 数据仓库字段 API 是字段元数据唯一主存储；系统设置旧字段管理入口不存在独立写入路径（只读或转发同一 service）。
- [ ] 旧字段管理路由要么返回只读数据，要么保留写接口但内部转发到数据仓库字段 service；不存在“旧接口独立写入、数据仓库读不到”的情况。
- [ ] 资产详情“同步历史”Tab 能按来源分组展示 DataSource / UCP / 仓内任务三类记录，且不复制 `SyncRun`/UCP Execution 明细为第二套存储，只做引用或聚合查询。
- [ ] 旧全局同步历史入口仍可访问，且能按资产跳转到数据仓库资产详情对应 Tab。
- [ ] DataSource-only、UCP-only、混合来源、无历史四种场景下，字段管理和同步历史页面均不崩溃、不报错。

### 9.7 表间关联主入口迁移（T04）与数据接入/资产融合（T07/T08）验收

- [ ] `DataSetRelation` / 数据仓库建模是表间关联唯一主编辑入口；系统设置旧表间关联入口的写操作被禁用或转发到同一 warehouse model service，不产生第二套关联结果。
- [ ] 数据仓库同时提供“快速关联”和“可视化建模”两种入口维护表间关联，二者作用于同一底层数据，不产生并行结果。
- [ ] 数据仓库资产创建/详情中存在“来源/接入”区域，展示来源类型、系统、资源、最近同步、配置跳转，且不出现凭证明文或 Pipeline 编排入口。
- [ ] `SourceSummaryCard` / `ResourceSummary` 一类共享组件在资产详情、资源选择器、同步历史中展示一致；不存在数据仓库和 UCP/接口管理各自实现一套来源摘要 UI。
- [ ] 统一资产目录中 `asset_type` 覆盖 table/view/model/metric/api/dataset_view；资产列表支持卡片视图和表格视图切换，两种视图对同一资产展示一致的核心字段（数仓分层、资产类型、来源、质量、权限、引用数）。`warehouse_layer` 只展示 ODS/DWD/DWS/ADS，RAW/DM/METRIC 不混入分层。
- [ ] DataSource-only、UCP-enabled、UCP-disabled 三种场景下，资产创建和详情流程均不要求 UCP 可用。

---

## 10. T02 接口配置拉取/推送融合专项验收

### 10.1 现有能力不回退

- [ ] `/datasources` 列表、详情、更新、测试连接、手动同步、同步历史仍可用。
- [ ] `/push-targets` 列表、详情、新建、更新、删除、手动推送、推送历史、API 暴露仍可用。
- [ ] Scheduler 对 `datasource_sync` 和 `push_target` 的任务不因菜单迁移或数据仓库融合而失效。
- [ ] UCP 未启用时，DataSource / PushTarget 仍可独立支撑当前拉取接口和推送接口能力。

### 10.2 数据仓库融合验收

- [ ] 资产详情存在“来源与开放”入口或等价区域。
- [ ] 入仓来源展示 DataSource/UCP Resource 摘要：方向、状态、调度、最近执行、行数、错误摘要、跳转。
- [ ] 出仓目标展示 PushTarget/API Expose 摘要：推送方式、目标、字段映射、调度、最近推送、历史、跳转。
- [ ] 影响与治理展示字段变更对拉取、推送、API 暴露的影响；敏感字段出仓有风险提示。
- [ ] 聚合 API 不返回 `secrets_encrypted` 或 secret 明文，只返回 `has_secret` / `credential_status`。

### 10.3 交互不冗余验收

- [ ] 整体系统内不出现多个语义相同且都可主编辑的“接口配置”入口；系统设置旧入口不是长期主入口。
- [ ] 系统设置旧入口显示兼容/迁移提示，并按拉取/推送/API 暴露标记方向；具备只读和最终下线计划。
- [ ] 从旧入口点击资产相关配置，优先跳转到数据仓库资产详情 `来源与开放` 区域；只有数据仓库等价能力未完成时才进入兼容编辑页。
- [ ] UCP 启用时，复杂连接器、凭证、Pipeline 相关操作跳转 UCP；数据仓库不内嵌重复编辑；UCP 未启用时数据仓库仍可维护最小 DataSource/PushTarget 能力。

### 10.4 三种部署形态验收

- [ ] 形态 A：UCP 未启用，DataSource/PushTarget 全功能可用，数据仓库显示“现有轻量接口”。
- [ ] 形态 B：UCP 同系统启用，数据仓库可显示 UCP 摘要和跳转，同时 DataSource/PushTarget 兼容项不重复误导。
- [ ] 形态 C：未来独立应用，数据仓库没有 UCP 时仍具备最小拉取/推送/调度/历史/凭证加密能力；有 UCP 时通过 HTTP 契约协作。

### 10.5 UI 状态验收

- [ ] 来源与开放 Tab 覆盖 pull-only、push-only、pull+push、manual、UCP unavailable、forbidden、empty、error 状态。
- [ ] 旧接口配置兼容页覆盖 loading、empty、error、forbidden 和迁移提示。
- [ ] 所有涉及 secret 的 UI 只显示“已配置/未配置/需重新授权”，不得显示明文。

---

## 11. R 章（三期能力下沉）专项验收

> 对应 `atomic-tasks.md` R 章。三期把入仓后加工能力沿 ODS → DWD → DWS → ADS 下沉到数据仓库，验收重点是“分层流转正确”而不是“ETL 功能多”。

### 11.1 ODS → DWD 标准化与清洗验收（R01）

- [ ] 字段标准化规则（重命名/类型转换/枚举映射/单位转换/拆分合并）只作用于 DWD/派生结果，原始 ODS 表数据不被覆盖或删除。
- [ ] 标准化/清洗规则保存前必须能预览转换前后对比和错误样例，且预览不触发 DataSource/UCP 同步。
- [ ] 标准化模板可被同类表复用（如员工表、组织表），重复加载模板是幂等的，不产生重复规则。
- [ ] 生成的 DWD 逻辑视图在数据资产目录中以 `asset_type=view/dataset_view` 可见，且发布前经过影响分析。
- [ ] 去重、空值处理、格式标准化均有单元测试覆盖典型/异常输入，且不修改外部系统源数据。

### 11.2 DWD → DWS 聚合与维度增强验收（R02/R03）

- [ ] 数据集物化（build）执行前校验输入层/输出层是否符合 ODS→DWD→DWS→ADS 顺序，非法层级跳转被拒绝；RAW/DM/METRIC 不得作为输出层。
- [ ] DWS 聚合定义支持 group_by/filter/aggregation/time_grain，且不提供任意 SQL 输入框。
- [ ] DWS 逻辑视图生成记录版本、依赖和回滚信息；字段删除前必须先看依赖该字段的 DWS 定义。
- [ ] 指标物化结果（metric_results/metric_runs）可按周期查询、可重算、可归档。
- [ ] 增量刷新策略（manual/full/incremental）在无增量字段或重复运行场景下有明确提示，不产生脏数据。

### 11.3 DWS → ADS 组装与快照/调度验收（R04/R05/R07）

- [ ] ADS 组装向导覆盖维度关联、字段重命名、预置过滤、重复字段校验，不提供任意 SQL 编辑器。
- [ ] ADS 发布为数据资产/数据视图/API 候选/推送候选时，敏感字段显示脱敏和权限提示，且发布前展示影响分析。
- [ ] SCD 拉链（business_key/effective_from/effective_to/current_flag）能正确处理新增、变更、关闭旧记录三种场景。
- [ ] 仓内调度中心（dataset_build/metric_run/quality_run/snapshot_run）与 UCP Pipeline UI 明确区分，不出现跨系统节点画布。
- [ ] 失败任务重跑有权限校验、审计记录，且不能重跑 UCP Pipeline。
- [ ] ADS 专项验收（R0703）确认 ADS 没有替代 BI 报表制作工具：不出现图表设计器/大屏设计器。

---

## 12. X 章（四期高级能力复评）专项验收

> 对应 `atomic-tasks.md` X 章。四期默认不内建高级能力，验收重点是“边界是否清晰、是否误导用户以为已可用”，而不是功能验收。

- [ ] 复杂 BI 自助分析：数据资产详情提供“在 BI 中分析”跳转，且数据仓库内不存在图表/大屏拖拽画布；BI 不可用时有降级提示。
- [ ] 任意 SQL/脚本 ETL：默认不开放；普通建模/指标页面确认无任意 SQL 编辑器入口；如四期试点，必须有审批、资源限额、审计记录，且做过 SQL 注入/越权表访问红队测试。
- [ ] 跨系统 Pipeline：资产详情“来源与开放”仅展示 UCP Pipeline 摘要、状态和跳转，不提供可编辑 Pipeline 节点画布；UCP 不可用/401/403/404/timeout 均有对应降级文案。
- [ ] 复杂星型/雪花模型：若内建，仅限“数据建模 > 高级维度模型”受控子集，不复制 BI 报表语义层和图表能力；维度层级、事实表关联需有循环依赖检测。
- [ ] 每类高级能力的入口文案清楚标识“外部集成/受控沙箱/只读摘要/高级建模”状态，不得让普通用户误以为数据仓库已替代 BI/UCP/专业 ETL。
- [ ] X0501 专项验收记录的 owner、权限、审计、资源控制、降级、回滚结论已写入文档，未通过验收前不得进入 S 章最终蓝图落地。

---

## 13. S 章（最终蓝图与独立应用化）专项验收

> 对应 `atomic-tasks.md` S 章。S 章描述最终状态，验收重点是“数据仓库能否安全拆分为独立应用”，而不是要求一次性全部实现。

- [ ] 数据仓库对内依赖收敛到 `/api/v1/warehouse/*`，前端不直接依赖内部模块；OpenAPI 契约可用于生成 client SDK。
- [ ] `warehouse.*` 权限支持应用级角色和只读/编辑/运行/管理分离，且不复用 `ucp.*` 权限命名空间。
- [ ] 跨应用身份（SSO/service token）方案不在 UI 中展示 token 明文，服务账号权限遵循最小化原则。
- [ ] 统一资产目录（表/字段/模型/指标/维度/质量/血缘/开放 API）支持全局搜索，搜索结果按类型、标签、负责人、状态筛选。
- [ ] 字段级血缘图谱能展示从来源到消费端（模型输出、指标、报表、通知）的完整路径，且支持缩放、过滤、路径高亮；UCP 节点只展示到资源/执行摘要，不暴露 secret。
- [ ] 治理工作台能派发、评论、关闭质量问题和整改任务，且不复制 UCP 告警中心。
- [ ] 指标语义层服务和数据开放服务的权限、频控、审计满足下游稳定消费要求，且不直接开放 UCP 原始连接能力。
- [ ] 变更发布治理（模型/指标/质量规则/开放 API）发布前有 diff、影响分析和审批记录。
- [ ] 最终回归验收套件覆盖 UCP 不可用、UCP 可用、独立部署三种模式，且逐项对照 `atomic-tasks.md` U00-U26 走查页面状态（而非依赖单一线框图）。

---

## 14. AI 接入预留与权限传播验收（后续阶段）

> 本章仅适用于二期及以后，不代表一期已实现。对应原子任务见 `atomic-tasks.md` Y 章。

### 14.1 Capability 注册与禁止项验收

- [ ] 只读解释类 capability 均有输入、输出、权限点、审计字段和错误码定义。
- [ ] 草稿生成类 capability 仅生成草稿，不直接保存、发布、调度、开放 API 或导出。
- [ ] 写入、发布、导出、开放 API 类 capability 在四期复评前保持禁用或未注册。
- [ ] 任意 SQL/脚本执行、UCP secret/凭证读取、UCP Pipeline 编辑/触发、批量授权、绕过影响分析的破坏性操作均不存在可执行入口。

### 14.2 AI Context 权限裁剪验收

- [ ] 隐藏字段不会进入 AI 上下文。
- [ ] 脱敏字段只以脱敏值、字段摘要或统计摘要进入上下文。
- [ ] 行级范围、组织范围和用户可见资产范围在上下文构造前完成裁剪。
- [ ] UCP/DataSource secret、token、密码、连接串、凭证明文不会进入上下文、响应或审计。
- [ ] Policy Guard 拒绝时 UI 展示明确 policy-denied 状态，接口返回可识别错误码。

### 14.3 ODS → DWD → DWS → ADS 权限传播验收

- [ ] 派生字段可追溯 `source_field_ids`，并继承上游最高敏感级别或给出人工审核记录。
- [ ] 多源模型缺失或冲突 `scope_strategy` 时 fail closed，不允许发布 DWD/DWS/ADS 产物。
- [ ] DWS/ADS 小样本聚合具备阈值保护、风险提示和发布阻断。
- [ ] 元数据可见、数据预览、建模使用、发布/开放/导出权限在测试中可独立验证。

### 14.4 AI UI 验收

- [ ] AI 入口显示 capability、状态（只读/草稿/复评）、数据范围、权限裁剪摘要和审计编号。
- [ ] 只读解释抽屉覆盖 normal、loading、empty、error、forbidden、policy-denied 状态。
- [ ] 草稿生成面板覆盖逐条采纳、编辑、放弃、无权限、敏感样例被摘要化状态。
- [ ] 四期高风险能力页默认展示禁用/复评中/申请试点，不提供直接执行按钮。
- [ ] UI 实现必须符合 `atomic-tasks.md` U26；不一致时先更新 U26 和对应原子任务再开发。

### 14.5 审计与安全验收

- [ ] 每次 AI 调用记录 capability、user、asset/model/metric、context_scope、policy_decision、输出类型和审计编号。
- [ ] 审计不保存 secret、凭证明文、敏感明细或完整未脱敏 Prompt。
- [ ] 普通用户只能查看自己的调用摘要；审计详情需要独立权限。
- [ ] 安全测试覆盖越权资产、隐藏字段、脱敏字段、UCP 不可用、Policy Guard 拒绝和高风险 capability disabled 场景。

