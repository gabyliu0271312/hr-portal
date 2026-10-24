# MVP 2 前置：标准字段身份、授权锚点与新合同字段引用

> 状态：讨论结论已确认，待实施（2026-10-24）
> 关联：[START_HERE.md](START_HERE.md)、[atomic-tasks.md §10](atomic-tasks.md#10-mvp-1b-报表侧与跨报表继承验证2026-10-24)、[spec.md §3.2/§3.3/§4.1.1](spec.md)
> 本文记录 2026-10-24 的讨论与决策，并给出实施计划；不代表代码已实现。

## 1. 讨论结论

### 1.1 D 与 S

- **D（明细事实集合）**：员工在当前用户人员范围内的事实，用于逐人、逐行明细。
- **S（汇总事实集合）**：D ∪（分摊到用户获准成本中心的事实），只用于聚合汇总，永不返回逐行明细。
- 双路径命中的事实只算一次：F1/F2/F3 样例中，组织1+中心1 的总额是 600，不是 700。
- **走 D 还是 S 由查询形态决定**，不是由"明细字段清单"决定：
  - `aggregate_requested = bool(payload.aggregations or payload.group_by)`（[execution_plan.py:28](../../hr-portal/backend/app/reports/execution_plan.py)）
  - 有聚合/分组 → summary → S；无聚合/分组 → detail → D。
  - 汇总里出现合同声明的人员键/事实键 → 直接阻断（`personal_locator_requires_detail` / `s_execution_personal_locator_forbidden`）。

### 1.2 “明细字段清单”怎么维护

它不是一个独立配置对象，而是四层叠加的白名单：

1. **数据集输出字段**：决定暴露哪些列、是否可见/敏感、维度或度量。
2. **产品合同**：`output_fields / dimensions / measures / internal_fields`，批准后可执行。
3. **标准字段确认绑定**：给输出/物理列建立语义身份，是发布准入前提。
4. **字段权限/分类**：运行时决定每个用户能看哪些列、是否脱敏。

标准字段目录负责语义，不负责某个用户或某份报表的 D 成员；D 成员由人员范围（scope tags/filters + 花名册）与产品合同共同决定。

### 1.3 当前实现缺口

1. **授权锚点是物理列名**：合同 `employee_key` / `cost_center_key` 写的是物理列（如 `employee_no`、`employee_id`），没有强制绑定标准字段。
2. **`is_permission_anchor` 未被消费**：只在标准字段创建时校验（`standard_fields.py`），合同、门禁、S/D 编译器都没有使用它。
3. **identifying 只认声明键**：`identifying` 仅匹配 `source_column` 等于 `employee_key`/`fact_key` 的输出；同一语义换了列名（工号 vs 员工ID）就会漏判。
4. **输出编码与语义未绑定**：新合同仍可用物理/自拟 `output_code`，靠名称约定，不靠标准字段身份。
5. **旧合同 grandfather**：旧合同/旧报表的 `output_code` 与执行行为必须保持不变，不能物理重命名。

### 1.4 已确认的决策

1. **新合同引用标准字段身份**：合同里的字段白名单直接写标准字段编码（如 `employee_no`），不允许"output_code 与 field_code 字符串相等"这种补丁式判断。
2. **服务端解析**：每个标准字段编码通过 confirmed 绑定找到**唯一**的数据集输出/物理列；命中 0 条或多条都拒绝。
3. **授权锚点也用标准字段身份**：`employee_key` / `cost_center_key` 写标准字段编码，由绑定解析到物理列；合同批准时固定标准字段版本，版本升级需重新批准。
4. **旧合同/旧报表保持现状**：继续用 output_code，执行结果不变；新行为按合同版本区分，不做破坏性字段重命名。
5. **B 衔接**：标准字段增加可选 `entity_scope`（`person | employment | org | cost_center | none`，可空），为 Person/Employment 归属预留；B 功能不进入 A 的关键路径。
6. **例外**：技术字段（`id/pk_hash/synced_at`）不作为业务输出；派生/计算字段必须有自己的语义定义或合同显式批准，不能默认放行。

### 1.5 明确不做

- 不用字符串相等冒充语义身份。
- 不删除 `reports/datasets/registered_tables.scope_strategy` 或旧 API 字段。
- 不物理重命名旧列，不改变旧报表/推送/导出的线上字段名。
- 不在本轮实现 B 的 Person/Employment 功能。

## 2. 目标模型

### 2.1 新合同（版本化）

```json
{
  "standard_fields": ["employee_no", "cost_period", "code", "headcount"],
  "dimensions": ["cost_period", "code"],
  "measures": ["headcount"],
  "internal_fields": ["employee_no"],
  "facts": [{
    "alias": "current",
    "table_name": "dwd_021_allocation_pilot",
    "employee_key": "employee_no",
    "cost_center_key": "code",
    "role": "allocation_fact",
    "allow_cost_center_summary": true
  }]
}
```

### 2.2 解析规则

| 步骤 | 规则 | 失败处理 |
| --- | --- | --- |
| 标准字段解析 | 编码 → confirmed 绑定 → 数据集输出/物理列 | 0 条或多条 → 拒绝 |
| 版本 | 绑定指向 active 版本，合同批准时固定 | 版本失效/漂移 → 重新批准 |
| 类型 | 标准字段版本类型 = 物理类型 | 不一致 → 拒绝 |
| 粒度 | 分组维度必须是 coarse/fine；锚点不得为 identifying 输出 | 不满足 → 拒绝 |
| 锚点 | `employee_key/cost_center_key` 绑定到 active 锚点版本，`permission_domain` 匹配 | 未绑定/不匹配 → 拒绝 |
| 唯一性 | 同一数据集里一个标准字段只能有一个输出 | 多输出 → 拒绝或明确指定唯一别名 |
| 快照 | 合同快照记录 output_id + standard_field_version_id | 漂移 → 重新校验 |

### 2.3 报表配置

- 新报表的列引用使用标准字段编码；执行计划编译时解析到数据集输出。
- 旧报表继续使用 output_code，行为不变。
- 线上响应字段名对新合同使用标准字段编码；旧合同保持原样。

### 2.4 identifying 判定

从"合同声明的物理键"扩展为：

1. 合同声明的人员键/事实键（现有）。
2. 绑定到同一标准字段版本的任何输出（不论物理列名）。
3. 标准字段版本 `grain_level=identifying` 或 `permission_domain=personal` 的输出。
4. 命中字段分类为敏感且当前用户无权。

命中任一条，在 S 路径的分组/聚合/筛选/排序都按个人定位处理并拒绝；D 路径才允许。

## 3. 实施计划

### 阶段 0：模型与设计冻结

- 交付：`entity_scope` 可空字段设计；合同版本标记方案；解析器接口定义；测试清单。
- 验收：设计评审通过，不改现有执行行为。
- 依赖：无。

### 阶段 1：合同解析器与版本化

- 交付：新合同版本支持标准字段身份；解析/唯一性/版本/类型/粒度校验；旧合同兼容。
- 测试：`employee_no` 与 `employee_id` 绑定同一标准字段 → 均可解析；未绑定/多输出/类型漂移 → 拒绝；旧合同输出不变。
- 依赖：阶段 0。

### 阶段 2：锚点强制与 identifying 语义化

- 交付：合同锚点必须绑定 active 标准字段锚点版本；identifying 按语义判定；S 路径阻断分组/聚合/筛选/排序。
- 测试：未绑定锚点 → 合同/发布阻断；姓名列作为分组维度 → S 拒绝；工号/员工ID 两种列名结果一致。
- 依赖：阶段 1。

### 阶段 3：报表配置接入

- 交付：新报表列引用标准字段编码；执行计划解析；旧报表不变。
- 测试：新报表 run/COUNT/分页/CSV/XLSX 同口径；旧报表回归。
- 依赖：阶段 1、2。

### 阶段 4：UI 收口

- 交付：合同与报表展示标准字段名称/版本；不暴露物理列作为授权选择；错误提示可定位。
- 测试：组件/E2E/build；权限态/空态/冲突态。
- 依赖：阶段 1–3。

### 阶段 5：试点重新批准与 MVP 2 D 入口

- 交付：为 `employee_no` 建标准字段锚点并绑定；重新批准合同；D 明细报表入口（人员范围、字段投影、拒绝中心用户明细、隐藏字段拒绝、撤权生效）。
- 测试：真库 API + PC；D/S 样例 100/200/300/600；越权拒绝。
- 依赖：阶段 1–4。

### 阶段 6：B 衔接准备

- 交付：`entity_scope` 元数据可用；锚点版本固定规则写入合同；B 功能不实现。
- 验收：B 可复用字段/绑定，无需改 A 的表结构。
- 依赖：阶段 1。

## 4. 测试矩阵

| 场景 | 期望 |
| --- | --- |
| 表A `employee_no`、表B `employee_id` 绑定同一标准字段 | 两份合同均可解析，D/S 判定一致 |
| 锚点列未绑定标准字段 | 合同批准/发布阻断 |
| 同一标准字段在一个数据集有多个输出 | 拒绝，要求唯一别名 |
| 姓名/证件号等个人字段作为分组维度 | S 路径拒绝，不返回逐人汇总 |
| 标准字段版本类型与物理类型不一致 | 拒绝 |
| 旧合同/旧报表 | 输出编码、结果、导出不变 |
| 派生/计算字段 | 无标准字段语义时拒绝；有显式批准才允许 |
| 技术字段进入输出 | 拒绝 |

## 5. 风险与开放问题

1. **合同 schema 演进**：需要版本标记与兼容读取，避免旧合同被新解析器误读。
2. **报表配置兼容**：新报表改用标准字段编码，涉及设计器、执行计划、导出列头；必须保留旧报表路径。
3. **唯一性**：同一数据集多列绑定同一标准字段时，需要产品层面的唯一别名规则。
4. **派生字段语义**：透视/计算/拆分字段没有物理绑定，需要单独的语义模型，不能在阶段 1 强行纳入。
5. **标准字段版本升级**：合同固定版本后，升级需要重新批准；要避免频繁升级造成运营负担。
6. **B 的 `entity_scope`**：现在只预留元数据，不实现 Person/Employment 行为；避免 A 被 B 阻塞。

## 6. 交付边界

- 本计划是 MVP 2（正式 D 明细入口）的前置，不替代 A 的剩余范围，也不代表 B 已开始。
- 阶段 1–4 完成前，不开放新的 D 入口；阶段 5 完成后才做 MVP 2 的业务验收。
- 生产不启用试点；所有改动先在开发库验证。

## 7. 决策记录

| 日期 | 决策 | 结论 |
| --- | --- | --- |
| 2026-10-24 | 新合同是否允许 output_code 与 field_code 字符串相等 | 不采用；改为引用标准字段身份，服务端解析 |
| 2026-10-24 | 旧接口是否改成标准字段编码 | 不改；旧合同/旧报表保持 output_code |
| 2026-10-24 | 是否为 B 预留字段 | 预留可空 `entity_scope`，不实现 B |
| 2026-10-24 | 派生/技术字段 | 技术字段排除；派生字段需显式语义/批准 |

## 8. 阶段 1 实施记录（2026-10-24）

已实现（`hr-portal/backend/app/datasets/authorization_contract.py`）：

- `ProductAuthorizationDefinition` 新增 `schema_version`（默认 1，旧合同自动按 1 读取）、`standard_fields`、`resolved_standard_fields`。
- schema 2 输入按标准字段编码解析：
  - 输出/维度/度量：经 confirmed 输出绑定找到唯一 `output_code`；0 条或多条拒绝。
  - `employee_key/cost_center_key`：经 confirmed 表列绑定解析为物理列，要求 active 版本、`is_permission_anchor=true`、权限域 `org`/`cost_center`、粒度 coarse/fine、类型一致。
  - `internal_fields`：解析为输出或事实列，并自动补齐 `alias.fact_key/employee_key/cost_center_key`。
  - 解析结果写入 `resolved_standard_fields.outputs` / `.columns`，合同 JSON 归一化为现有执行结构。
- 错误码：`standard_field_not_bound`、`standard_field_ambiguous`、`standard_field_type_mismatch`、`standard_field_grain_invalid`、`standard_field_anchor_invalid`、`standard_field_contract_scope_unsupported`（schema 2 暂仅支持单事实）、`standard_field_binding_drift`（批准时 409）。
- schema 1 合同行为完全不变；旧合同、旧报表、旧导出不受影响。
- 新增 PG 测试 3 项：正向解析、未绑定拒绝、非锚点拒绝。实际结果：
  - `test_standard_field_catalog.py --postgres-acceptance` 全量 **192 passed**（632.68s）
  - `test_report_execution_binding.py --postgres-acceptance` **42 passed**（100.61s）
  - 无 DB 定向 **81 passed / 150 skipped**
- 未做：阶段 2（identifying 语义化）、阶段 3（报表配置接入）、阶段 4（UI）、阶段 5（试点重新批准/D 入口）、阶段 6（B 衔接）。开发库试点仍使用 schema 1 合同；切换 schema 2 需要先为 `employee_no` 建锚点标准字段并完成绑定。

## 9. 阶段 2–5 实施记录（2026-10-24）

### 阶段 2 实施：identifying 语义化

- `d_execution._semantic_locator_codes`：人员定位不再只看合同声明的物理键，而是把以下输出都视为定位字段：
  - `grain_level == identifying`
  - `permission_domain == personal`
  - `standard_field_id` 与员工锚点绑定的标准字段一致（换列名也命中）
- S 运行时对 `output_fields/group_by/aggregations/filters/order_by` 做交集阻断；新增单元测试覆盖三种命中。
- S 契约批准仍使用声明键做形状校验；运行时为最终授权门禁。

### 阶段 3 实施：报表配置接入

- `report_service._compile_authorized_summary_plan` 与 `reports/validation.ensure_valid_report_field_references` 支持无点号的标准字段编码：经 confirmed active 输出绑定解析为唯一输出；旧 `alias.column`/output_code 路径不变。
- 解析映射惰性加载，旧报表不触发额外查询。
- 开发库报表 24 使用 `["cost_period","code","headcount"]` 标准编码创建并运行：**74 组 / 543**，与旧报表一致。

### 阶段 4 实施：UI 收口

- 新增 `GET /warehouse/models/{id}/standard-fields`：返回输出→标准字段映射（编码、版本、粒度、权限域、是否锚点）。
- 模型准入面板新增“标准字段合同（schema 2）”开关；锚点输入提示为标准字段编码；合同列表显示“标准字段”标记；创建合同使用最新合同版本号（修正原先误用数据集版本）。
- 前端 `vue-tsc` 与 `npm run build` 通过（43.83s）。

### 阶段 5 实施：试点合同迁移（已完成）与 D 入口（未完成）

- 新建 `employee_no` 标准字段（id 4，version 4，string/coarse/org/is_permission_anchor=true），绑定隐藏的 DWD 列 `dwd_021_allocation_pilot.employee_no`（column 4401）。
- 修复产品限制：`is_permission_anchor` 的 `table_column` 绑定允许隐藏列；敏感字段仍受限。
- 合同 1 退休；schema 2 合同 2 创建并批准：
  - `standard_fields = cost_period, code, headcount, employee_no`
  - 输出 `cost_period/code/headcount`；维度 `cost_period/code`；度量 `headcount`；锚点 `employee_no/code`
  - 转换批准 id 5（run 5 / contract 2 / dataset v1）；发布准入 eligible、隔离已证明
- 报表 22/23/24 重新绑定合同 2，运行均为 **74 组 / 543**。

**D 明细入口已实现（方案 B：同一合同增加明细白名单）**：

- 合同新增 `detail_output_fields`，与 S 的 `output_fields` 独立；转换批准要求二者并集覆盖数据集全部输出。
- 数据集 530 新增 `employee_no` 输出（id 666）并绑定标准字段版本 4；DWD 列改为可见。
- 合同 4（schema 2）`detail_output_fields = cost_period, code, headcount, employee_no`；合同 2/3 退休、合同 4 active；转换批准 id 6；发布准入 eligible、隔离已证明。
- 新增 D 执行路径：
  - `compile_allocation_fact_d_select_for_user` / `compile_allocation_fact_d_result_statements_for_user`：人员范围成员、明细投影、COUNT/分页/导出同源；不含成本中心并集。
  - 报表服务按 `config.aggregate` 分流：true→S，false→D；执行绑定批准同步走 D 计划。
  - 明细字段必须属于合同 `detail_output_fields`；隐藏/敏感/无权字段拒绝。
- 开发库明细报表 25（private，pilot021）：
  - 运行：**total=723、4 列**；CSV 723 行、headcount 合计 **542**（与人员范围一致）；XLSX 200/19873B。
  - 仅有中心权限的用户运行同一报表：**403 `authorized_detail_denied`**。
  - S 报表 22/23/24 重新绑定合同 4 后仍为 74 组/543。
- 边界：明细暂不支持筛选/排序；单人组再识别风险保留；敏感字段拒绝路径代码已具备，开发库未单独构造敏感输出验证。

### 验证与风险

| 项 | 结果 |
| --- | --- |
| 全量 catalog 隔离库 | 192 passed（623.55s） |
| 报表执行隔离库 | 42 passed（82.40s） |
| 前端 build | 通过（43.83s） |
| 开发库合同迁移 | 合同2 active、报表22/23/24 运行74组/543 |

- 合同切换需“retire 旧 → approve 新”两步，中间没有 active 合同；尚未实现原子切换。
- 锚点隐藏列豁免仅限 `is_permission_anchor` 的 `table_column` 绑定；`dataset_output_field` 仍要求可见。

## 10. 新建资产三步向导（2026-10-24）

目标：把“新建资产、来源配置、字段发现、期间/业务主键、标准字段绑定”收进现有“新建资产”入口，不再分多处配置。

### 10.1 实现

- 展示形态与绩效模板创建一致：全屏（复用 `FullScreenModal`/`PageHeader`/`PerformanceStepFlow` 与全局 token），步骤流与“上一步/下一步”在顶部，关键表单在居中卡片内。
- 无“取消”按钮：点“下一步”即提交本步内容并前进；未提交就点“返回”弹窗确认（确定返回、取消留在当前页）。
- 前端 `AssetOnboardingDialog.vue` 替换数据资产页的“新建资产”对话框，三步：
  1. 基本信息：中文名/表名/描述、月度表、来源方式（接口同步 / 手工创建）。
  2. 接口配置或字段定义：
     - 接口：选接入类型、按分组填配置；点“下一步”时**自动校验接口并发现字段**，成功才进入下一步，失败留在本步提示；**不创建资产、不保存配置**。
     - 手工：直接增删字段（编码/名称/类型/主键/可见/敏感/维度度量）。
  3. 字段匹配：期间字段、业务主键、每个字段选择标准字段；完成时一次性建资产并**建议+确认**绑定。
- 完成动作：
  - `POST /admin/tables` 以 `asset_status=draft` 创建资产，列带 `is_interface`（接口）或手工标记；期间/主键列同时写入。
  - 设置期间配置；绑定标准字段（表列 + 对应数据集输出，均 confirmed，审计原因“资产接入向导确认”）。
  - 接口来源：资产存在后再创建数据源并保存配置，触发首次同步；成功后才把资产置为 published。
  - 手工来源：建资产后直接发布，数据通过数据视图的 Excel 导入维护。
- 后端新增：
  - `POST /datasources/preview-fields`：不依赖资产的来源字段预览（复用客户端 `discover_fields`）。
  - `POST /admin/tables` 新增 `asset_status`（draft/published，默认 published，旧入口行为不变）。

### 10.2 边界与已知限制

- 预览仅支持**实现了 `discover_fields` 的接入类型**：北森报表（表头接口 + 一页样本）、飞书在线表格、飞书多维表格（字段接口 + 一页样本）。`beisen_api`/`http_generic`/`database`/`upload` 仍未实现，向导会明确提示改用手工创建或“先建资产→同步发现”的旧路径。
- 接入类型列表与现有来源配置一致：内置 `SOURCE_TYPES` 打底、服务端 `/datasources/types?consumer=warehouse` 覆盖同名定义并补充缺失类型，避免向导内类型比来源配置少。
- `POST /datasources` 要求资产已存在，所以接口路径的顺序是：预览（无资产）→ 建资产 → 建数据源 → 首次同步；不是“先建数据源”。
- 首次同步失败时资产保持 draft，用户到资产详情继续；重新打开向导用同名建资产会冲突（409）。
- 向导只负责资产/来源/字段语义；DWD 标准化规则、刷新、转换批准、合同/发布仍是后续治理步骤。
- 向导绑定的是 ODS 表列与当时的 DWD 数据集输出；后续刷新新增列不会自动绑定。

### 10.3 验证

| 项 | 结果 |
| --- | --- |
| 后端无 DB 定向（报表/目录/管理端） | 91 passed / 153 skipped |
| 管理端建表单测 | 10 passed |
| 前端 vue-tsc / build | 通过 / 40.92s |
| 开发库手工资产探针 | `asset_status=draft`、手工列 `auto_discovered=false`、主键标记正确、删除正常 |
| 预览能力 | 北森报表/飞书表格/飞书多维表格支持预览，目录以 `supports_discovery` 暴露；其余类型向导内禁用预览并提示替代路径 |

- 未完成：用户 PC 验收；飞书真实来源的端到端（预览→建资产→首次同步）；生产部署。
- 生产更新后，数据资产 → 新建资产 即为三步向导；旧 DataView 新建入口仍用原对话框。
