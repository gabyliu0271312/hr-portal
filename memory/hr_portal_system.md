---
name: hr-portal-system
description: HR 提效工具（权限管理 + 报表中台）项目位置、端口、菜单层级、视觉风格、首期 5 张表、关键架构决策
metadata:
  type: project
---

# HR 提效工具 — 权限管理与报表中台

**项目状态**：Phase 1 + 2 + 3 + 4 + 5 + C + D 已完成（2026-05-23 数据范围权限 + 数据集多表报表上线）

## 核心信息

- **代码路径**：`D:\AI项目\HR提效工具搭建\hr-portal\`
- **Spec 文档目录**：`D:\AI项目\HR提效工具搭建\specs\001-hr-permission-portal\`
- **原始需求**：`D:\AI项目\HR提效工具搭建\HR提效工具搭建.txt`
- **技术栈**：FastAPI(Python 3.11) + Vue 3 + Element Plus + PostgreSQL 15 + Alembic + APScheduler，Docker Compose 三件套

## 端口分配

| 服务 | 端口 |
|---|---|
| 前端（nginx） | **8080**（不是 80，80 被成本分摊系统占用） |
| 后端 FastAPI | 8000 |
| Postgres | 5432（仅容器内监听，宿主机也开了 5432 没冲突） |

**Why**：成本分摊系统的 nginx 容器 publish 了 `0.0.0.0:80`，hr-portal 必须避开。
**How to apply**：以后改 docker-compose 端口前先用 `docker ps` 看占用情况；hr-portal 默认入口是 <http://localhost:8080/>。

## 视觉风格（v2.1 平台飞书风，2026-06-06 重建）

当前前端只保留一套平台设计 token，已彻底移除 v1「账册风 / Ledger」变量与组件样式：

- 主色 `#3370ff` 飞书蓝（平台级主色，不是单个模块主题色）
- 灰底页面 `#f4f6f9` + 白色 `<el-card>` 内容块
- 字体走系统默认 sans-serif（不引外部字体）
- token 唯一源头：`frontend/src/styles/tokens.css`
- Element Plus 覆盖：`frontend/src/styles/element-overrides.css`
- 完整规范见 `hr-portal/frontend/docs/design-system.md`

**已废弃且不要恢复的 v1 元素**：

- ~~PageHead 组件~~（行内 el-card header 替代）
- ~~行首状态色条~~（改用 el-tag）
- ~~操作权限四件套圆点~~（改用 el-checkbox 标准矩阵）
- ~~脱敏密文格栅~~（敏感数据使用普通文本占位）
- ~~`.hp-table-wrap` / `.hp-filter` / `.hp-pager` 等 hp-* 类~~（直接用 el-card + 行内 style）
- ~~`--brand-*` / `--ink-*` / `--fs-*` / `--space-*` / `--r-*` 等旧 token~~

## 菜单层级（v2.0 三级结构，2026-05-23）

```text
顶部 tab（一级，2 个）
├─ 系统设置
│   ├─ 权限管理（左侧二级分组）
│   │   ├─ 用户管理（三级叶子，对应页面）
│   │   ├─ 角色配置
│   │   ├─ 管理单元
│   │   └─ 字段分类
│   └─ 数据接入
│       ├─ 接口配置
│       ├─ 表间关联
│       └─ 数据视图（综合页 → 内含 5 张表入口）
└─ 报表管理
    └─ 报表管理
```

后端定义在 `backend/app/seed.py` 的 `MENU_TREE`。改动菜单结构后必须 `TRUNCATE menus, role_menus CASCADE` 再 restart 后端，否则 seed 只增不删，旧菜单残留。

## 布局（v2.0）

`src/layouts/Default.vue`：

```text
顶部导航 56px：系统名 + tabs                  | 用户名 + 头像
─────────────┬────────────────────────────────
左侧 220px： │
 二级分组标题│           内容区
   三级叶子  │      （灰底 + el-card）
   三级叶子  │
 二级分组标题│
   三级叶子  │
```

## 首期 5 张接入表（北森 OpenAPI）

| # | 表 | 刷新模式 | 业务主键 |
|---|---|---|---|
| 1 | 员工实时花名册 | snapshot | employee_id |
| 2 | 员工月度花名册 | upsert | employee_id + period_ym |
| 3 | 员工月度工资表 | upsert | employee_id + period_ym |
| 4 | 员工月度成本分摊表 | upsert | employee_id + cc_code + period_ym |
| 5 | 成本中心月度维护表 | upsert | cc_code + period_ym |

## 重要架构决策

- **组织树根节点固定为"创梦天地"**，配置项 `ORG_ROOT_NAME` 可改
- **组织架构 6 层**：创梦天地 → 公司级组织 → 一~五级部门
- **成本中心树 4 层**，一级最末（粗）→ 四级最细
- **数据范围合并语义**：维度内并集 + 组织三子维度交集 + 成本中心维度 与 组织架构维度 跨维度交集
- **登录方式本期仅账密**，飞书 SSO 推到下一期但保留接入位（user 表 `feishu_user_id` 字段、登录页置灰按钮）
- **操作权限本期穷举**：新增 / 修改 / 删除 / 导出 四类，按 角色 × 菜单 矩阵；遇到工作流按钮考虑 Phase 6 升级 menu_actions（[[hr-portal-menu-actions-upgrade]]）
- **数据集（DataSet）化的表间关联**：表间关联归属于数据集而非全局；新建报表第一步必须先选数据集
- **模板维护平台化**：证明、协议等文档模板统一放在“系统设置 → 参数配置 → 模板维护”，以 `.docx` Word 模板上传解析为主，业务工具只读取模板配置。

## AI 原生工作台根原则（2026-06-08）

HR Portal 后续定位为 **AI 原生 HR 工作台**，不是简单的“功能页面集合 + 若干 AI 按钮”。所有新增或重构功能都要优先考虑是否需要暴露给 AI 编排层，并为后续 AI 调用做好受控准备。

根本边界：

```text
AI 负责理解、编排、草稿、解释和建议。
HR Portal 后端负责权限、数据、确定性计算、状态变更、导出、审计和最终执行。
用户负责确认高风险动作。
```

所有可被 AI 理解或调用的能力，必须准备：

- 稳定 `capability_id`、输入/输出 schema、能力说明和示例问法。
- 所需功能权限、数据范围要求、敏感级别、风险等级和确认策略。
- 受控 Tool Wrapper，不允许 AI 直接调用任意后端 URL。
- Context Packet，不允许页面随意拼接大段 HR 明细给模型。
- Schema Validator + Policy Guard，不信任模型输出。
- AI 调用、工具调用、用户确认和业务执行审计。
- 基础评测用例，覆盖正常、问答、失败、越权、敏感数据和低置信度回问。

后续开发节奏：

```text
AI 相关功能：先做最小 AI 底座，再接入具体业务场景。
普通业务功能：可以继续开发，但设计时必须判断是否注册 AI Capability。
```

最小 AI 底座范围：

```text
Capability Registry
AI Orchestrator
Tool Wrapper
Context Packet
Schema Validator
Policy Guard
Audit
Eval Case Skeleton
```

下次继续公式/计算字段开发时，应先补齐上述最小底座，再把 `formula.generate`、`formula.validate`、`formula.repair`、`calculated_field.save` 等能力接进去；不要再新增独立页面 prompt 接口。

完整 AI 平台演进：

```text
Phase 0 最小 AI 底座
Phase 1 首个场景验证
Phase 2 多场景复用
Phase 3 管理治理平台
Phase 4 知识/RAG 能力
Phase 5 工作流编排
Phase 6 渠道与网关扩展
Phase 7 模型优化/微调
```

Phase 5 类似传统 Skill，但本系统应实现为 `AI Workflow / Capability Orchestration`：多个原子 Capability 的受控编排，每一步保留 Tool、Artifact、Policy Guard、用户确认和审计，不做黑盒大 Skill。

禁止方向：

- 不用提示词替代权限校验。
- 不让模型生成 SQL/代码并执行。
- 不把完整工资、身份证、手机号等敏感明细默认送入模型。
- 不把 AI 调用日志放到孤立 AI 页面；统一进入系统日志管理。
- 不把函数库放进 AI 基础配置；函数库是平台公共能力。

参考文档：

- `specs/004-ai-native-workbench/ai-native-development-principles.md`
- `specs/004-ai-native-workbench/ai-capability-registry.md`
- `specs/004-ai-native-workbench/ai-platform-roadmap.md`
- `specs/004-ai-native-workbench/architecture-review.md`

## 数据层架构（v2，C1 动态列扩展，2026-05-23）

**核心思想**：业务表 schema 不锁字段，源端来什么字段就有什么字段；字段元数据独立存。

### 表设计

5 张业务表（`emp_realtime_roster` / `emp_monthly_roster` / `emp_monthly_salary` / `emp_monthly_allocation` / `cost_center_monthly`）统一极简 schema：

```text
id          BIGSERIAL  PK
pk_hash     VARCHAR(64) UNIQUE  ← 业务主键的 hash（由 table_columns 中 is_pk_part=true 的列拼成）
raw         JSONB                ← 整行源数据
synced_at   TIMESTAMPTZ
```

字段元数据表 `table_columns`：

```text
table_name + column_code (UNIQUE)
column_label / data_type (string/number/date/datetime/bool)
is_pk_part / is_sensitive / is_visible / display_order
auto_discovered (true=同步自动发现 / false=管理员手动建)
```

### 同步流程

1. 数据源客户端拉原始 JSON
2. `_ensure_columns()` 扫描第一行所有 key，对没注册过的 INSERT 一条到 `table_columns`（自动猜 data_type）
3. `_get_pk_columns()` 查出 `is_pk_part=true` 的列
4. 按 PK 列值拼字符串算 SHA256 → pk_hash
5. `INSERT ... ON CONFLICT (pk_hash) DO UPDATE` upsert 到业务表

### 查询流程

`GET /data/{table}` 不再 SELECT 固定列，而是：

1. 查 `table_columns` 拿到 `is_visible=true` 的字段列表
2. SELECT id, raw, synced_at FROM {table}
3. 后端拼装：每行 raw 按 column_code 展开成 `{ "工号": "...", "姓名": "..." }`
4. 前端 v-for 渲染列，按 data_type 智能格式化（datetime 调 toLocaleString、ratio 加 % 等）

### 关键 API

- `GET /api/v1/data/{table}` 分页查询，items 是动态扁平字典
- `GET /api/v1/data/{table}/columns` 返回该表的可见字段元数据（按 display_order）
- `GET/POST/PUT/DELETE /api/v1/table-columns/{table}/{id?}` 字段元数据 CRUD
- `PUT /api/v1/table-columns/{table}/bulk` 批量更新（拖动排序后一次性保存）

### 前端

- 数据表页 `views/data/DataTableView.vue` — 完全按元数据动态渲染列
- 字段管理页 `views/system/FieldColumns.vue` — 表选择 + 列定义编辑 + 排序 + 批量保存

### 演进价值

- 北森换 Report ID / 字段从中文换英文 / 加新字段 → **零代码改动**
- 接飞书 / 企微 / SAP → 接客户端 + sync_service 兜底就行，schema 不变
- Phase 6 报表向导直接基于 `table_columns` 元数据展开聚合，不依赖物理列
- 历史数据完整保留在 raw，删字段元数据不影响 raw 内容

### 何时需要动 schema

- 加新的业务表（不在现有 5 张内） → migration + DATA_TABLES 注册
- 大幅改 PK 算法 / 引入软删除 / 物理分片 → 重做 migration
- 单纯加字段、改字段名、改类型 → **永远不动 schema**，在字段管理页改

## 报表中台（Phase 5 单表起步，2026-05-23）

**核心思路**：一个 Report = 一张数据表 + 一份配置（选列/筛选/排序）+ 元数据。配置整体存到 `reports.config` JSONB，不固化列。

### 报表表设计

```text
reports
  id / name / description
  table_name           ← 绑定 5 张数据表之一
  config JSONB         ← { columns: [...], filters: [...], sorts: [...] }
  owner_id → users
  is_published         ← 草稿 / 已发布
  last_run_at / run_count
```

config 形态：

```json
{
  "columns": ["编码", "名称", "层级"],
  "filters": [{"column": "层级", "op": "eq", "value": "2"}],
  "sorts": [{"column": "编码", "order": "asc"}]
}
```

### 报表 API

- `GET/POST /api/v1/reports` 列表 / 新建
- `GET/PUT/DELETE /api/v1/reports/{id}` 详情 / 改 / 删
- `POST /api/v1/reports/{id}/run?page=&page_size=` 执行查询，返回 `columns + items + total`
- `GET /api/v1/reports/{id}/export.csv` CSV 导出（带 UTF-8 BOM，Excel 直接打开不乱码）

筛选 op 支持：eq / neq / contains / gt / gte / lt / lte / between / in / is_null / is_not_null。
全部走 `raw->>'col'` 的文本比较；数值 / 日期比较利用 JSON 文本天然字典序（ISO 日期 / 纯数字字符串成立）。

### 报表前端页面

- `views/report/ReportList.vue` — 报表列表，按表/名称筛选，行操作：查看 / 编辑 / 删除
- `views/report/ReportDesigner.vue` — 设计器：基本信息 + 双栏选字段（上下移除）+ 筛选行 + 排序行 + 预览（按 id 跑）
- `views/report/ReportRun.vue` — 只读运行页：el-descriptions 头 + 分页表格 + CSV 下载（带 Bearer token 的 fetch）

### 报表设计取舍

- ~~不做 JOIN~~ → Phase D 已实现，数据集多表 JOIN 可用
- 不做聚合 / 图表：当前仍是"按字段选 + 筛 + 导"的列表型导出器（Phase 7 可加）
- 敏感字段在 run/export 都强制脱敏为 `******`（即使配置里没排除）
- 预览必须先保存：避免设计器在内存里跑临时 config 增加路径复杂度

## 数据范围权限（Phase C，2026-05-23）

实现 spec U2 三层权限合并语义（FR-AUTH-005）：维度内并集 + 三子维度交集 + 跨大维度交集。

### scope 表结构

- `scope_tags(name, dimension, sub_dimension, is_unlimited)` — 标签定义
- `scope_tag_selections(tag_id, node_id, value_text, include_descendants)` — 标签内选项
- `user_scope_tags` — 用户 × 标签
- `table_columns.scope_role` — 新字段，标识列在权限体系里的角色：`cc_code` / `org_node_code` / `employment_type` / `employment_entity` / None

### 关键组件

- `app/scopes/router.py` — 标签 CRUD + 用户绑定
- `app/permissions/scope_filter.py` — `build_scope_filter(user, table, db)` 生成 SQLAlchemy where ColumnElement
- `app/permissions/masker.py` — `get_sensitive_columns(user, table, db)` + `apply_mask(item, sensitive_cols)` 脱敏
- 注入点：`data/router.query_table` + `reports/router._run_query` + `reports/sql_builder.run_dataset_query`
- 超级管理员角色绕过 scope_filter + 脱敏

### 树 path 路径串（KD-3）

- `cost_center_tree` / `org_tree` 新增 path 列（如 `/华南公司/研发中心/前端组/`）
- 同步时 `_recompute_tree_paths()` 重算
- 含下级展开：`path LIKE '/A/B/%'`

### 标签前端

- `views/system/Scopes.vue` — 标签 CRUD + 三子维度
- `components/HierarchyTreePicker.vue` — 通用树勾选 + 每节点「含下级」开关
- `views/system/Users.vue` — 用户管理页加「标签」抽屉
- 所有数据查询和报表 — 自动按当前用户 scope 过滤

## 数据集与多表报表（Phase D，2026-05-23）

### dataset 表结构

- `datasets(name, description, is_active, created_by)`
- `dataset_tables(dataset_id, table_name, alias)` — 同一表可起多别名
- `dataset_relations(left_alias, right_alias, join_type, keys JSONB)` — JOIN 定义
- `dataset_acl(role_id?, user_id?)` — 至少一项；空白 = 仅创建者
- `reports.dataset_id` 新字段，与 `table_name` 二选一
- `report_acl` — 报表授权（结构同 dataset_acl，本期未启用）

### 多表查询

`app/reports/sql_builder.py`:

- 用 SQLAlchemy `aliased(Model)` 给每张表起别名
- JOIN 条件用 `func.jsonb_extract_path_text(raw, key)` 等值比较
- `scope_filter` 对每个 alias 各算一次，AND 进 where
- 字段分类脱敏按 alias 表级取
- **重要踩坑**：`aliased(Model).raw[code].astext` 不可用，必须用 `func.jsonb_extract_path_text(cast(raw, JSONB), code)`

### 关联完整性（FR-REPORT-005）

`GET /datasets/{id}/integrity` 校验 relation.keys 引用的字段是否仍存在于 table_columns。
ReportRun 页打开时自动调用，断键则禁用「运行」按钮。

### 导出

- `GET /reports/{id}/export.csv` — UTF-8 BOM + URL-encoded 文件名
- `GET /reports/{id}/export.xlsx` — openpyxl，文件名 URL-encode 避免 latin-1 编码错
- 导出走与 run 相同的脱敏 + 权限管道

## 模板维护（2026-06-06）

菜单位置：

```text
系统设置 → 参数配置 → 模板维护
```

权限 code：

```text
system.document_templates
```

一期能力：

- 维护文档模板基本信息：编码、名称、业务类型、状态、版本、生效期间。
- 上传 / 下载 `.docx` Word 模板。
- 自动解析 Word 模板中的 `{{variable_code}}` 占位符。
- 维护模板变量：变量编码、变量名称、来源类型、来源键、默认值、是否必填。
- 占位符格式：`{{variable_code}}`。
- 支持模板预览，使用示例变量值渲染为纯文本预览；正式下载输出替换后的 Word 文档。
- 不执行用户输入公式代码。

后端表：

```text
document_templates
document_template_blocks
document_template_variables
```

`document_template_blocks` 是历史兼容兜底；正常维护方式应使用 `document_templates.template_file` 存储 Word 模板。

默认模板：

- `agreement_release`：解除劳动合同协议书，供补偿金计算生成协议使用。
- `annual_income`：年包收入证明，供证明开具工具使用。

工具读取逻辑：

- “补偿金计算 → 协议预览/下载”读取启用的 `agreement` 模板。
- “证明开具 → 模板下拉/预览/下载”读取启用的 `income_certificate` 模板。
- 若模板已上传 Word 文件，则下载时直接替换 Word 占位符并输出 `.docx`。
- 若模板未上传 Word 文件，则使用历史模板块/服务端默认模板兜底。
- “模板维护 → 下载”始终可用：已上传 Word 时下载原 Word；未上传 Word 时按当前模板块/默认模板生成一份可编辑 `.docx` 模板，便于管理员下载后在 Word 中调整再上传替换。
- 模板 seed 只补缺，不覆盖管理员后续在页面里的修改。

前台可编辑预览（2026-06-07）：

- 补偿金协议与收入证明点击“预览”后，右侧预览区默认就是可编辑草稿，不需要再点“编辑草稿”。
- 预览区顶部显示“标准生成 / 已人工调整”，并提示本次修改不会改变后台标准模板。
- 用户调整预览文字后，下载 Word 与打印都使用当前预览内容。
- 若用户已人工调整后点击“更新右侧预览”，系统先提示重新生成会覆盖当前修改。
- “恢复原始预览”可回到本次打开预览时由模板生成的原始内容。
- 下载/打印会写入 `document_generation_logs`：业务类型、动作、模板、对象姓名、是否人工调整、草稿 hash/长度、操作人、时间；不存完整正文。
- 证明开具支持模板手工变量：模板变量 `source_type = manual` 时，会在“证明开具 → 预览”左侧自动出现“本次补充字段”；用户本次填写的值会合并进 `manual_values`，参与预览、下载 Word 和打印。例如旅游/签证证明中的护照号、目的地、行程时间，不需要写入员工花名册。
- 必填手工变量由前端和后端双重校验；缺失时阻止预览/下载/打印。

新增表：

```text
document_generation_logs
```

### 数据集前端

- `views/datasource/Datasets.vue` — 数据集列表
- `views/datasource/DatasetEdit.vue` — 设计器：选表 + 别名 + JOIN 配置
- `views/report/ReportDesigner.vue` — 加「数据来源」二选一（单表/数据集），数据集模式下字段名带 alias 前缀
- `views/report/ReportRun.vue` — integrity 预检 banner + xlsx 下载按钮

## 已沉淀的踩坑

详见 [[hr-portal-pitfalls]]，重点：

- 坑 1：本机 80 端口被成本分摊系统占用 → 改 8080
- 坑 2：Dockerfile + pyproject.toml readme 字段
- 坑 3：CSS Grid `1fr` 被宽内容反向撑大 → `minmax(0, 1fr)` + `min-width: 0`
- 坑 4：el-table fixed-right 失效 → 必须设 `max-height` 才会创建独立 body-wrapper
- 坑 5：Docker 容器代码不热加载 → 改后端必须 `docker compose up -d --build backend`，restart 没用
- 坑 6：北森 token 接口要 `application/x-www-form-urlencoded`，httpx `data=` 默认会带；不要用 `params=`
- 坑 7：北森企业租户 IP 白名单 → 开发/生产 IP 必须先加入白名单才能调 API
- 坑 8：数据层不要再写固定列 schema → 已切 C1 动态列，所有新接入字段都自动注册到 table_columns

## 大型独立应用接入原则（2026-06-06）

HR Portal 后续不仅承载普通菜单页，也会承载绩效管理这类大型独立业务应用。

统一原则：

- HR Portal 是应用门户和入口授权中心。
- 普通小功能继续按现有三级菜单接入。
- 大型独立应用作为顶部一级应用入口接入。
- HR Portal 只控制能否进入应用、能否进入应用后台。
- 业务应用内部的角色、流程、数据权限、节点权限由业务应用自己管理。

统一权限命名：

```text
<app_code>.app
<app_code>.admin
```

示例：

```text
performance.app
performance.admin
cost_allocation.app
cost_allocation.admin
```

绩效管理在 HR Portal 中应作为一级应用入口，不放在“提效工具”或“系统设置”下。进入 `/performance` 后使用绩效自己的 `PerformanceLayout` 和内部导航。

已上线的人力成本分摊系统也按独立应用模式接入：

- 顶部一级应用：成本分摊
- HR Portal 入口权限：`cost_allocation.app`
- HR Portal 后台入口权限：`cost_allocation.admin`
- HR Portal 路由：`/cost-allocation-system`、`/cost-allocation-system/admin`
- 跳转地址由 `VITE_COST_ALLOCATION_APP_URL` / `VITE_COST_ALLOCATION_ADMIN_URL` 配置

注意区分：`tools.cost_allocation` 是 HR Portal 内部“提效工具”下的成本分摊/报表能力；`cost_allocation.*` 是已上线独立成本分摊系统入口权限。HR Portal 只管入口，独立系统内部的 `admin`、`cost_admin`、`hrbp`、`manager` 角色仍由成本分摊系统自己管理。

成本分摊生产地址：`http://192.168.10.13:37800/`。当前点击 HR Portal 成本分摊入口时，不直接打开生产首页，而是调用 HR Portal 后端 `GET /api/v1/cost-allocation/external-sso-url?entry_type=app|admin`，由后端请求成本分摊系统 `GET /api/v1/auth/feishu/url?redirect_uri=http://192.168.10.13:37800/login`，拿到飞书 OAuth 地址后让浏览器跳转。该方式是“HR Portal 触发目标系统飞书 SSO”，不是共享 HR Portal token，也不是统一 session。若用户仍无法进入成本分摊系统，优先检查成本分摊用户表中的 `feishu_open_id`、邮箱、手机号匹配，以及目标系统内部角色。

成本分摊后续只保留两条优化路线：方案一是继续作为外部独立系统，但升级为“HR Portal 一次性 ticket 无感登录 + return_url 返回 HR Portal”；方案三是迁入 HR Portal，成为类似绩效管理的内部应用。当前不考虑 iframe/反向代理承载外部系统的中间方案。短期优先方案一，成本更低且可实现无感进入和返回 HR Portal；中长期如成本分摊需要深度复用 HR Portal 人员、组织、权限、报表和视觉体系，再评估方案三。

成本分摊专项集成文档：

```text
specs/003-cost-allocation-integration/sso-integration.md
```

主规格文档：

```text
specs/001-hr-permission-portal/application-access-model.md
```
