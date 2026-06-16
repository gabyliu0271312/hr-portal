---
name: hr-portal-datasource-refactor
description: 旧 JSON 列重构为标准列方案，解决 FineBI 类型缺失、数值无法聚合的根本问题
metadata:
  type: project
---

# HR Portal 数据源实体表重构执行文档

## 1. 背景

当前业务表结构基本如下：

```sql
id | pk_hash | synced_at | 旧 JSON 列
```

所有业务字段曾经压在一个 JSON 列中，字段值多数以字符串形态存在。这个设计早期换来了数据接入灵活性，但现在已经影响核心能力：

- FineBI 无法正确识别数值和日期，导致工资、成本、奖金等字段无法自然聚合。
- 字段类型只存在于 `table_columns.data_type` 元数据中，数据库层不做约束。
- 前端修改字段类型后，底层存储并不会变化。
- 报表、权限、工具中心大量依赖旧 JSON 表达式。
- `push_db_expose` 需要重新建 FineBI 物化表，并且当前仍把字段建成 `text`。

系统仍在早期，业务数据可以重新同步或重新上传，因此本次重构不考虑历史数据迁移，优先换成干净的数据层模型。

## 2. 目标架构

业务表改为实体列宽表：

```sql
id BIGSERIAL PRIMARY KEY
pk_hash VARCHAR(64) NOT NULL UNIQUE
synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
employee_no TEXT
name TEXT
month TEXT
salary NUMERIC
hire_date DATE
...
```

`table_columns` 继续作为字段元数据中心，负责：

- 字段中文名
- 字段编码
- 字段类型
- 展示顺序
- 是否可见
- 是否敏感
- 是否参与业务主键
- 是否手工字段
- 是否计算字段
- 权限维度角色

数据库 schema 负责真实类型约束。也就是说，`table_columns.data_type` 不再只是前端配置，而要和真实列类型保持一致。

## 3. 重构结论

需要改成实体表，并且建议现在改。

原因：

- 当前没有历史迁移负担。
- FineBI 是核心痛点，实体列能从根上解决类型问题。
- HR 报表字段变化频率相对低，不值得长期牺牲数据库类型语义。
- 继续使用旧 JSON 列结构会让报表、权限、成本分摊、工具中心持续堆复杂度。

实体表不代表字段必须一次性定死。系统仍然支持：

- 接口返回新字段时自动建列。
- 管理员在前端手动建表。
- 管理员在前端新增字段。
- 管理员在前端删除字段。
- 管理员在前端修改字段展示配置和类型。

区别是：前端仍是操作入口，后端必须成为受控 DDL 执行器。

## 4. 类型映射

| table_columns.data_type | PostgreSQL 类型 | 说明 |
|---|---|---|
| string | TEXT | 默认类型 |
| text | TEXT | 长文本 |
| number | NUMERIC | 金额、比例、数量 |
| integer | INTEGER | 整数 |
| date | DATE | 日期 |
| datetime | TIMESTAMPTZ | 日期时间 |
| boolean | BOOLEAN | 布尔值 |
| bool | BOOLEAN | 兼容旧值 |
| enum | TEXT | 枚举值由应用层管 |

接口自动发现的新字段默认建为 `TEXT`。管理员确认字段含义后，再通过字段管理改成 `NUMERIC`、`DATE` 等真实类型。

## 5. 动态字段行为

| 场景 | 行为 |
|---|---|
| 同步时发现接口新增字段 | 自动 `ALTER TABLE ADD COLUMN ... TEXT`，再写 `table_columns(auto_discovered=true)` |
| 管理员前端手动加字段 | 后端 `ALTER TABLE ADD COLUMN`，再写 `table_columns(auto_discovered=false)` |
| 同步时字段消失 | 保留历史列和字段元数据，不自动删除 |
| 管理员删除字段 | 依赖检查通过后，`ALTER TABLE DROP COLUMN`，再删 `table_columns` |
| 管理员修改字段标签、顺序、可见性、敏感标记 | 只改 `table_columns` |
| 管理员修改字段类型，空表或空列 | 可直接 `ALTER COLUMN TYPE` |
| 管理员修改字段类型，已有数据 | 需要显式确认参数，必要时先做数据合规检查 |

## 6. 改造范围

### 6.1 需要重构的 9 张业务表

阶段 0 已核对：当前代码 seed 中内置注册的是 7 张业务表，另外 2 张来自用户自建/历史动态表配置。它们都属于本次实体表重建范围，但治理规则不同：内置表要保护系统依赖字段，自建表主要做依赖检查。

| table_name | 中文名 | 备注 |
|---|---|---|
| emp_realtime_roster | 员工实时花名册 | 内置；被补偿金计算、收入证明引用 |
| emp_monthly_roster | 员工月度花名册 | 内置 |
| emp_monthly_salary | 员工月度工资表 | 内置 |
| emp_monthly_allocation | 员工月度成本分摊表 | 内置 |
| cost_center_monthly | 成本中心月度维护表 | 内置 |
| emp_monthly_cost_class | 员工月度成本归集分类表 | 内置 |
| emp_monthly_cost_result | 员工月度成本分摊结果 | 内置；由成本分摊工具写入 |
| emp_severance_installment | 补偿金分期发放表 | 自建/扩展表；现有配置中已有元数据和报表引用 |
| emp_year_end_bonus | 年终奖金发放表 | 自建/扩展表；现有配置中已有元数据和报表引用 |

### 6.2 不参与重构的表

| table_name | 原因 |
|---|---|
| cost_center_tree | 标准列结构 |
| org_tree | 标准列结构 |

## 7. 实施策略

本次不做历史迁移。

执行方式：

1. 备份或保留 `registered_tables`、`table_columns` 元数据。
2. DROP 9 张业务表。
3. 根据 `registered_tables + table_columns` 重建业务表实体列。
4. 改造后端读写逻辑。
5. 重新同步或重新上传业务数据。

注意：如果 `table_columns` 也要重塑，可以先清理或重建 `table_columns`，再生成实体表。

## 8. 执行阶段总览

建议分成 3 个交付闭环：

| 阶段 | 范围 | 目标 |
|---|---|---|
| 闭环 A | DDL、动态模型、同步、数据查看、FineBI | 实体表核心链路跑通 |
| 闭环 B | 权限、工具中心、成本分摊 | 业务功能恢复 |
| 闭环 C | 报表 SQL、清理 raw 假设、测试补齐 | 完成全系统切换 |

不要一次性同时改完所有模块。报表 SQL 改动最大，建议放到核心链路稳定之后。

## 9. 可执行任务清单

### 阶段 0：确认边界

- [x] 确认 9 张要重建的业务表名单。
- [x] 确认 9 张表拆分为 7 张内置表 + 2 张自建/扩展表。
- [x] 确认 `cost_center_tree`、`org_tree` 不参与改造。
- [x] 确认不做历史数据迁移。
- [x] 确认允许 DROP + 重建业务表。
- [x] 确认 `table_columns` 策略：保留表结构，允许按新表头清理或重塑内容。
- [x] 确认第一批必须跑通的接口表：`emp_realtime_roster`、`emp_monthly_salary`。

验收：

- [x] 重构范围无歧义。
- [x] 数据丢弃/重拉策略已接受。

阶段 0 结论：

- 本次重建范围是 9 张业务表，不包含 `cost_center_tree`、`org_tree`。
- 当前代码内置表为 7 张：`emp_realtime_roster`、`emp_monthly_roster`、`emp_monthly_salary`、`emp_monthly_allocation`、`cost_center_monthly`、`emp_monthly_cost_class`、`emp_monthly_cost_result`。
- `emp_severance_installment`、`emp_year_end_bonus` 是自建/扩展表，在 `hr_field_config.sql` 和命名规范文档中已有元数据、计算字段和报表引用，因此纳入本次重建范围。
- 历史业务数据不迁移，允许 DROP + 重建后重新同步/上传。
- `table_columns` 表结构保留；字段内容可以根据新表头重新设计，实施前建议导出备份。
- 第一批验收表选择 `emp_realtime_roster` 和 `emp_monthly_salary`：前者覆盖工具中心和组织树，后者覆盖月度同步、工资数值字段和 FineBI 痛点。

### 阶段 1：建设 DDL 工具层

新增建议文件：

- `hr-portal/backend/app/data/ddl.py`

任务：

- [x] 实现表名校验，只允许小写字母、数字、下划线，且以字母开头。
- [x] 实现字段名校验，只允许合法 `column_code`。
- [x] 实现 PostgreSQL identifier quote 工具。
- [x] 实现 `data_type -> PostgreSQL type` 映射。
- [x] 实现 `table_exists(db, table_name)`。
- [x] 实现 `column_exists(db, table_name, column_code)`。
- [x] 实现 `create_source_table(db, table_name, columns)`。
- [x] 实现 `drop_source_table(db, table_name)`。
- [x] 实现 `add_source_column(db, table_name, column_code, data_type)`。
- [x] 实现 `drop_source_column(db, table_name, column_code)`。
- [x] 实现 `alter_source_column_type(db, table_name, column_code, data_type, using_expr=None)`。
- [x] 给 DDL 工具补最小测试。

验收：

- [x] 可以创建只有基础列的业务表。
- [x] 可以按 `table_columns` 创建实体列。
- [x] 可以新增字段列。
- [x] 可以删除字段列。
- [x] 可以修改字段类型。
- [x] 非法表名、字段名会被拒绝。

阶段 1 结论：

- 已新增 `app/data/ddl.py`，集中提供受控 DDL 能力。
- 已新增 `tests/test_data_ddl.py`，覆盖表名/字段名校验、类型映射、SQL 生成和基础列保护。
- 字段编码允许 `_org_node_code` 这类系统注入列，但禁止业务字段覆盖 `id`、`pk_hash`、`synced_at`。
- 表名和字段名均校验 PostgreSQL 63 字节标识符上限，避免数据库静默截断。
- 验证命令：`$env:PYTHONPATH='.'; pytest tests/test_data_ddl.py -q`，结果 `27 passed`。
- 语法检查命令：`$env:PYTHONPATH='.'; python -m py_compile app\data\ddl.py tests\test_data_ddl.py`，通过。
- `ruff` 当前环境不可用，未执行。

### 阶段 2：改动态表模型和注册机制

涉及文件：

- `hr-portal/backend/app/data/models.py`
- `hr-portal/backend/app/data/dynamic_loader.py`
- `hr-portal/backend/app/main.py`

任务：

- [x] 移除业务表对静态旧结构 ORM class 的依赖。
- [x] 保留 `TableColumn`、`RegisteredTable`、`CostCenterNode`、`OrgNode` 等元数据和树模型。
- [x] 实现按数据库真实表反射的模型加载。
- [x] `DATA_TABLES` 继续作为运行时注册表，但内容来自反射。
- [x] 启动时从 `registered_tables` 加载所有业务表。
- [x] 用户新建表后可热注册到 `DATA_TABLES`。
- [x] 月度表继续注册到 `PERIOD_TABLES`。

验收：

- [x] 服务启动后，内置业务表可在 `DATA_TABLES` 中找到。
- [x] 用户自建业务表可在 `DATA_TABLES` 中找到。
- [x] ORM/SQLAlchemy 查询能访问实体列。

阶段 2 结论：

- 已改造 `app/data/dynamic_loader.py`：新增 `reflect_source_table_model`、`register_source_table_model`、`unregister_source_table_model`、`register_period_table`。
- 启动加载从“只加载用户自建表”调整为“按 `registered_tables` 加载所有业务表”，优先按真实数据库表反射。
- 已移除物理表缺失时回退到旧静态模型的 fallback；`load_dynamic_tables` 现在只能反射真实数据库实体表，缺表会直接失败。
- `admin/tables_router.py` 的热注册入口已改为使用 `register_source_table_model`，删除表时使用 `unregister_source_table_model`。
- `_make_dynamic_model` 已从生产代码移除；测试中的非实体列模型仅通过 `tests/entity_helpers.py` 本地 helper 构造，用于验证旧结构会被拒绝。
- 已移除 `models.py` 中 7 个静态旧结构业务 ORM class，`DATA_TABLES` 初始为空，只在启动或热注册时由真实表反射填充。
- 已改造 `app/trees/router.py`：用工类型、用工主体、人员下拉统一从 `emp_realtime_roster` 实体列读取，不再导入旧静态业务 ORM 或使用旧 JSON 表达式。
- 已改造维护脚本 `scripts/backfill_scope_codes.py`、`scripts/rebuild_trees.py`：从反射实体模型读取行数据，不再访问业务表 `row.raw`。
- 已把组织权限注入字段统一为实体列 `org_node_code`，并移除 `_org_node_code` 过渡元数据。
- 已把数据集 JOIN 索引器 `app/datasets/indexing.py` 从旧 JSON 表达式索引改为实体列普通索引。
- 验证命令：`$env:PYTHONPATH='.'; pytest -q`，结果 `130 passed`，仅有既有 `HTTP_422_UNPROCESSABLE_ENTITY` 常量弃用 warning。
- 前端构建命令：`npm.cmd run build`，通过；仅有既有 Rollup PURE 注释和大 chunk 警告。

### 阶段 3：重建业务物理表

建议新增开发期脚本：

- `hr-portal/backend/scripts/rebuild_source_tables.py`

任务：

- [x] 读取 9 张业务表名单。
- [x] 读取每张表的 `table_columns`。
- [x] DROP 9 张业务表。
- [x] 重建基础列：`id`、`pk_hash`、`synced_at`。
- [x] 根据 `table_columns.column_code` 建实体列。
- [x] 根据 `table_columns.data_type` 决定 PostgreSQL 类型。
- [x] 为 `pk_hash` 创建唯一约束和索引。
- [x] 重载或刷新 `DATA_TABLES`。

验收：

- [x] 9 张表不再包含主业务 `raw` 列。
- [x] 每张表都有 `id`、`pk_hash`、`synced_at`。
- [x] 每张表的业务字段是实体列。
- [x] 表结构与 `table_columns` 一致。

阶段 3 结论：

- 已新增 `scripts/rebuild_source_tables.py`，默认 dry-run，仅打印 DROP/CREATE 计划，不改数据库。
- 脚本默认重建阶段 0 确认的 9 张业务表，也支持 `--tables` 限定表名。
- 真实执行必须同时传 `--apply --i-understand-this-drops-data`，避免误删数据。
- 建表 SQL 复用阶段 1 的 DDL 工具：基础列为 `id`、`pk_hash`、`synced_at`，业务列来自 `table_columns`。
- 执行 apply 时会先从 `DATA_TABLES` 注销旧模型，DROP/CREATE 后再反射注册新实体表模型。
- 已在本地 Docker 真实数据库执行 `python -m scripts.rebuild_source_tables --apply --i-understand-this-drops-data`，9 张业务表已 DROP + 重建为实体列结构。
- 执行前清理了旧元数据：`emp_monthly_cost_class.field type` -> `field_type`、`cost classification` -> `cost_classification`；删除旧 `_org_node_code` 和北森辅助噪音字段，保留标准 `org_node_code`。
- 真实数据库验收结果：9 张业务表 `has_raw=false`；`id`、`pk_hash`、`synced_at` 基础列齐全；`table_columns` 指向的业务列全部存在；无 `metadata_missing`。
- 重建并启动后端镜像：`docker compose build backend; docker compose up -d backend`；健康接口 `/api/v1/health` 返回 `status=ok`，启动日志显示 9 张业务表均完成动态反射。
- Dry-run 命令：`$env:PYTHONPATH='.'; python -m scripts.rebuild_source_tables`。
- 单表 dry-run 命令：`$env:PYTHONPATH='.'; python -m scripts.rebuild_source_tables --tables emp_realtime_roster emp_monthly_salary`。
- 真实执行命令：`$env:PYTHONPATH='.'; python -m scripts.rebuild_source_tables --apply --i-understand-this-drops-data`。
- 容器真实执行命令：`docker exec hr-portal-backend sh -lc "cd /app && python -m scripts.rebuild_source_tables --apply --i-understand-this-drops-data"`。
- 验证命令：`$env:PYTHONPATH='.'; pytest -q`，结果 `130 passed`，仅有既有 `HTTP_422_UNPROCESSABLE_ENTITY` 常量弃用 warning。
- 前端构建命令：`npm.cmd run build`，通过；仅有既有 Rollup PURE 注释和大 chunk 警告。

### 阶段 4：改前端建表入口对应的后端逻辑

涉及文件：

- `hr-portal/backend/app/admin/tables_router.py`
- `hr-portal/backend/app/data/dynamic_loader.py`

任务：

- [x] 新建表时不再创建旧 JSON 兜底列。
- [x] 新建表时只创建基础列。
- [x] 写入 `registered_tables`。
- [x] 热注册实体表模型。
- [x] 如果请求包含初始字段，同时创建实体列和 `table_columns`。
- [x] 删除表时继续 `DROP TABLE`。
- [x] 删除表时清理 `registered_tables`、`table_columns`、单表数据集。

验收：

- [x] 前端可以新建一张空业务表。
- [x] 新建表没有 `raw` 列。
- [x] 新建表能出现在表列表和字段管理里。
- [x] 自建表可以删除。

阶段 4 结论：

- 已改造 `app/admin/tables_router.py` 的新建表逻辑，去掉旧的拼接 SQL + 旧 JSON schema，统一改为调用阶段 1 的 `create_source_table` 受控 DDL 工具。
- 前端现有建表弹窗不传 `columns` 时，会创建只有 `id`、`pk_hash`、`synced_at` 的空实体业务表；这与后续阶段 5 的“字段管理”衔接。
- 后端 `CreateTableIn.columns` 已预留可选初始字段；如果请求包含字段，会同时创建真实实体列并写入 `table_columns(auto_discovered=false)`。
- 新建成功后会写入 `registered_tables`，再通过 `register_source_table_model(..., force=True)` 反射热注册实体表模型，并继续维护月度表 `PERIOD_TABLES`。
- 删除自建表时会校验表名，调用 `drop_source_table(..., cascade=True)` 删除物理表，清理 `table_columns`、单表数据集、`registered_tables` 和运行时注册。
- 修复了删除路径中重复 `db.delete(rt)` 的问题。
- 当前阶段未新增前端初始字段编辑 UI；前端仍按原有表单创建空业务表，字段增删改放在阶段 5。
- 验证命令：`$env:PYTHONPATH='.'; pytest tests/test_admin_tables_router.py tests/test_rebuild_source_tables.py tests/test_dynamic_loader.py tests/test_data_ddl.py -q`，结果 `45 passed`。
- 语法检查命令：`$env:PYTHONPATH='.'; python -m py_compile app\admin\tables_router.py tests\test_admin_tables_router.py`，通过。
- 真实容器验收已完成：重建并启动当前工作区后端容器，前端 `http://localhost:8080/` 返回 200，后端 `http://localhost:8000/api/v1/health` 返回 OK。
- 使用真实 API 创建临时表 `codex_stage4_check` 成功，数据库物理结构只有 `id`、`pk_hash`、`synced_at`，确认无 `raw` 列；`/admin/tables` 可查询到该表。
- 使用真实 API 删除临时表成功，确认物理表、`registered_tables`、`table_columns`、`dataset_tables` 均无残留。

### 阶段 5：改字段管理

涉及文件：

- `hr-portal/backend/app/data/columns_router.py`

任务：

- [x] 新增字段接口先执行 `ALTER TABLE ADD COLUMN`。
- [x] 新增字段接口再写入 `table_columns`。
- [x] 新增字段失败时不能留下半截元数据。
- [x] 删除字段前做依赖检查。
- [x] 删除字段时执行 `ALTER TABLE DROP COLUMN`。
- [x] 删除字段后删除 `table_columns`。
- [x] 修改字段类型时执行 `ALTER TABLE ALTER COLUMN TYPE`。
- [x] 空表或空列可以直接改类型。
- [x] 非空列改类型需要显式确认参数。
- [x] 修改字段标签、顺序、显示、敏感、权限角色仍只改元数据。
- [x] 计算字段创建后要创建实体列。
- [x] 重算计算字段时写回实体列。

验收：

- [x] 前端新增字段后，数据库真实列存在。
- [x] 前端删除字段后，数据库真实列消失。
- [x] 修改展示配置不影响数据库列。
- [x] 修改类型后数据库列类型同步变化。

阶段 5 结论：

- 已改造 `app/data/columns_router.py`：新增字段先调用 `add_source_column` 创建实体列，再写入 `table_columns(auto_discovered=false)`，并刷新 `DATA_TABLES` 反射模型。
- 删除字段改为先做依赖检查，再调用 `drop_source_column` 删除数据库实体列，最后删除 `table_columns` 并刷新运行时模型。
- 删除依赖检查覆盖：业务主键、数据权限角色、本表计算字段、数据集关联关系、数据集计算字段、报表配置、成本分摊方案配置、推送目标字段映射。
- 字段类型修改会调用 `alter_source_column_type`；如果物理列已有非空数据且请求未带 `confirm_type_change=true`，后端返回 `409` 要求显式确认。
- 前端字段管理页已在“保存所有修改”时识别数据类型变化，并弹出确认框；确认后提交 `confirm_type_change`。
- 计算字段新增会创建实体列；重算计算字段已在阶段 13 收紧为只写实体列，不保留旧结构兼容分支。
- `clean-orphans` 从“扫描 raw key”调整为“扫描物理列是否存在”，只删除无实体列对应的自动发现字段元数据。
- 验证命令：`$env:PYTHONPATH='.'; pytest -q`，结果 `93 passed`。
- 前端构建命令：`npm.cmd run build`，通过；PowerShell 直接执行 `npm run build` 会受本机执行策略阻止，因此使用 `npm.cmd`。
- 真实容器验收已完成：重建并启动当前工作区后端容器，通过真实 API 创建临时表 `codex_stage5_check`，新增字段 `stage_amount` 后确认物理列存在，修改类型为 `string` 后确认接口返回新类型，删除字段和临时表成功；确认物理表、`registered_tables`、`table_columns`、`dataset_tables` 均无残留。
- 阶段边界：数据查看、手工行编辑、同步服务、报表 SQL、FineBI 推送等主数据读写链路仍在后续阶段切换实体列，本阶段只完成字段管理入口的 DDL 与元数据一致性。

### 阶段 6：改同步服务

涉及文件：

- `hr-portal/backend/app/datasources/sync_service.py`

任务：

- [x] 修改 `_ensure_columns`，发现新字段时自动 `ADD COLUMN`。
- [x] `_ensure_columns` 继续写入 `table_columns(auto_discovered=true)`。
- [x] 中文字段名、非法字段编码仍走 codegen 生成合法英文 `column_code`。
- [x] 字段重命名时仍优先复用中文 label 对应 code。
- [x] `_dynamic_upsert` payload 从 `{"raw": merged}` 改为实体列字典。
- [x] upsert insert values 包含 `pk_hash`、`synced_at`、实体列。
- [x] upsert update set 不再更新 `raw`，改为更新实体列和 `synced_at`。
- [x] 手工字段保留逻辑从实体列读取旧值。
- [x] 复制上月逻辑从实体列读取上月值。
- [x] 月度孤儿删除从实体列过滤期间。
- [x] lookup 读取映射表时从实体列读取。
- [x] 计算字段结果写入实体列。
- [x] 成本中心树构建从落库后实体列组装 dict。
- [x] 组织架构树构建继续使用同步前 rows。

验收：

- [x] `emp_realtime_roster` 同步路径不再读写业务表 `raw`，运行时若仍是旧 raw 表会直接失败。
- [x] `emp_monthly_salary` 同步路径不再读写业务表 `raw`，期间字段统一使用实体列编码 `month`。
- [x] 接口新增字段时数据库自动新增实体列。
- [x] 手工字段不会被同步覆盖。
- [x] 复制上月字段仍可用。
- [x] 计算字段仍可回填。
- [x] 月度表孤儿删除只影响当月。

阶段 6 结论：

- 已改造 `app/datasources/sync_service.py` 为实体列强模式：同步服务不再兼容旧 `raw` 业务表，遇到仍包含 `raw` 列的业务表会直接报错，要求先执行阶段 3 重建。
- `_ensure_columns` 会扫描本批次全部字段；新字段先通过 DDL 工具 `ADD COLUMN` 创建真实实体列，再写入 `table_columns(auto_discovered=true)` 并刷新运行时反射模型。
- 非法源端 key（中文、空格等）会通过 codegen 生成合法 `column_code` 后再落库；月度期间字段统一要求使用实体列编码 `month`。
- `_dynamic_upsert` 已改为实体列 payload，`ON CONFLICT` 更新实体列和 `synced_at`；执行后会 `expire_all()`，避免同一 Session 读到 upsert 前的旧 ORM 对象。
- 手工字段保留、复制上月、lookup、计算字段、月度孤儿删除、成本中心落库后建树均改为实体列路径。
- 配套收紧：`registered_tables.period_col` 默认值、内置表 seed、前端新建视图默认期间字段、成本分摊结果归档期间字段均统一为 `month`。
- 新增测试：`tests/test_sync_service_entity.py`，覆盖自动补实体列、实体 upsert 不含 `raw`、旧 raw 模型失败、`period_ym` 注入 `month`、lookup 实体列读取。
- 验证命令：`$env:PYTHONPATH='.'; pytest -q`，结果 `98 passed`。
- 前端构建命令：`npm.cmd run build`，通过；Rollup 仅提示既有的大 chunk / PURE 注释警告。
- 真实容器验收已完成：重建并启动 backend 容器，健康检查 OK；启动 seed 已把内置月度表 `period_col` 修正为 `month`。
- 真实数据库验收已完成：临时实体表 `codex_stage6_sync_check` 通过 `_dynamic_upsert` 自动新增 `amount NUMERIC`，确认物理表无 `raw`；二次同步保留手工字段、更新实体金额、按当月删除孤儿；验收后确认物理表、`registered_tables`、`table_columns` 均无残留。

### 阶段 7：改数据查看、编辑、导出

涉及文件：

- `hr-portal/backend/app/data/router.py`

任务：

- [x] 查询列表时从实体列组装 item。
- [x] 精确筛选从旧 JSON 表达式改为真实列比较。
- [x] 关键字搜索改为 `cast(column, String).ilike(...)`。
- [x] distinct 改为 `SELECT DISTINCT column`。
- [x] CSV 导出从实体列读取。
- [x] 手工新增行改为实体列 insert。
- [x] 单行编辑改为实体列 update。
- [x] 批量编辑改为实体列 update。
- [x] 计算字段编辑后重算并写实体列。
- [x] 脱敏和隐藏列逻辑保持不变，只替换取值来源。

验收：

- [x] 数据列表可以打开。
- [x] 搜索可以使用。
- [x] 筛选可以使用。
- [x] distinct 下拉可以使用。
- [x] CSV 导出可以使用。
- [x] 手工新增、单行编辑、批量编辑可以使用。

阶段 7 结论：

- 已改造 `app/data/router.py`：数据列表、精确筛选、关键词搜索、distinct 下拉、CSV 导出全部从实体列读取，不再使用旧 JSON 列或旧 JSON 表达式。
- 数据视图入口新增实体表强校验：如果业务表仍包含 `raw` 列，会直接返回 `409`，要求先完成实体表重建，不再做旧结构兼容。
- 列表返回值统一通过实体列属性组装，并保留 `_id`、`_synced_at`、隐藏列、脱敏逻辑。
- 手工新增行改为创建实体列 ORM 对象，按 `table_columns.data_type` 转换写入值，并继续按业务主键计算 `pk_hash`。
- 单行编辑和批量编辑改为更新实体列；编辑后会按当前实体列值重算计算字段并写回实体列。
- 新增测试 `tests/test_data_router_entity.py`，覆盖实体列表查询、筛选、搜索、distinct、CSV、手工新增、单行编辑、批量编辑，以及旧 raw 表拒绝访问。
- 验证命令：`$env:PYTHONPATH='.'; pytest -q`，结果 `105 passed`。
- 前端构建命令：`npm.cmd run build`，通过；Rollup 仅提示既有的大 chunk / PURE 注释警告。

### 阶段 8：改权限过滤

涉及文件：

- `hr-portal/backend/app/permissions/scope_filter.py`

任务：

- [x] 将 `_raw_text(model, col_code)` 替换为实体列表达式工具。
- [x] `scope_role` 字段过滤改为真实列 `IN`。
- [x] 非文本列参与权限过滤时按文本比较或按原类型比较，策略保持一致。
- [x] 保留 fail-closed 语义。
- [x] 保留超管放行。
- [x] 保留 `scope_exempt` 放行。

验收：

- [x] 无标签用户看不到受控表数据。
- [x] 超管可以看全部。
- [x] `scope_exempt=true` 的表可以放行。
- [x] 组织范围过滤有效。
- [x] 成本中心范围过滤有效。
- [x] 人员范围过滤有效。

阶段 8 结论：

- 已改造 `app/permissions/scope_filter.py`：删除权限过滤中的旧 JSON 表达式路径，统一改为 `cast(entity_column, String).in_(...)`，保持原有按文本值匹配的权限语义。
- `scope_role` 指向的字段现在必须是业务实体表的真实列；如果业务表不是实体列结构，或元数据指向的权限列不存在，会直接失败，避免权限过滤静默失效。
- 保留 fail-closed 语义：受控表未配置任何 `scope_role` 字段时返回 `false()`；用户无标签时返回 `false()`；标签维度和表字段不匹配时该标签不授予可见性。
- 保留超管放行和 `registered_tables.scope_exempt=true` 放行。
- 新增测试 `tests/test_scope_filter_entity.py`，覆盖实体列组织/人员过滤、旧 raw 表拒绝、缺失实体权限列拒绝、无 scope_role fail-closed、scope_exempt 放行、超管放行。
- 验证命令：`$env:PYTHONPATH='.'; pytest -q`，结果 `111 passed`。
- 前端构建命令：`npm.cmd run build`，通过；Rollup 仅提示既有的大 chunk / PURE 注释警告。

### 阶段 9：改工具中心

涉及文件：

- `hr-portal/backend/app/tools/router.py`

任务：

- [x] 员工搜索从 `raw` 搜索改成实体列搜索。
- [x] `_to_candidate` 从实体列取值。
- [x] 补偿金计算从实体列取 `hire_date`、`terminated_date`、`base_salary` 等字段。
- [x] 收入证明从实体列取员工基本信息。
- [x] 工具权限隐藏字段逻辑保持不变。
- [x] 继续使用 `build_scope_filter` 做数据范围控制。

验收：

- [x] 补偿金员工搜索可用。
- [x] 补偿金计算可用。
- [x] 收入证明员工搜索可用。
- [x] 收入证明生成可用。

阶段 9 结论：

- 已改造 `app/tools/router.py`：工具中心不再直接导入静态 `EmpRealtimeRoster` raw ORM，而是从 `DATA_TABLES["emp_realtime_roster"]` 获取当前反射实体模型。
- 员工搜索改为实体列搜索：`employee_no`、`full_name`、`chinese_name`、`english_name` 使用 `cast(entity_column, String).ilike(...)`，并继续叠加 `build_scope_filter` 数据范围控制。
- `_to_candidate` 改为从实体列属性组装候选人，字段包括工号、姓名、英文名、公司、部门、工作地、在离职状态、入职日期、离职日期。
- 补偿金计算改为从实体列读取 `hire_date`、`terminated_date`、`base_salary` 和工作地；协议准备复用的员工值也来自实体列。
- 收入证明准备改为从实体列读取公司、姓名、身份证、岗位、入职日期、离职日期、基本工资、目标年终奖。
- 字段编码已统一：员工实时花名册 `姓名` 使用 `full_name`，`姓名（中文名）` 使用 `chinese_name`；员工月度工资表 `姓名` 使用 `full_name`。
- 工具权限隐藏字段逻辑保持不变：仍通过 `get_hidden_columns(..., tool_key=...)` 控制薪酬字段使用权限。
- 工具中心入口新增实体列结构强校验：如果 `emp_realtime_roster` 不是实体列结构，会直接返回 `409`，要求先重建实体列业务表。
- 新增测试 `tests/test_tools_router_entity.py`，覆盖补偿金员工搜索、补偿金计算、收入证明准备，以及旧 raw 花名册拒绝访问。
- 验证命令：`$env:PYTHONPATH='.'; pytest -q`，结果 `115 passed`。
- 前端构建命令：`npm.cmd run build`，通过；Rollup 仅提示既有的大 chunk / PURE 注释警告。

### 阶段 10：改 FineBI 暴露和推送

涉及文件：

- `hr-portal/backend/app/push/push_service.py`
- `hr-portal/backend/app/push/router.py`

任务：

- [x] `_load_source_rows` 从实体列读取可见字段。
- [x] 月度过滤从实体列过滤。
- [x] `push_external_db` 保持字段映射和 upsert 逻辑。
- [x] `push_http` 保持字段映射逻辑。
- [x] `push_api_expose` 保持读取源行逻辑。
- [x] HTTP 和 API 暴露出口把 `Decimal/date/datetime` 转为 JSON 可序列化值。
- [x] 外部数据库推送保留实体列原生值，不提前字符串化。
- [x] `push_db_expose` 建表时按 `table_columns.data_type` 创建真实类型。
- [x] `push_db_expose` 插入时直接 `SELECT column AS "中文名"`。
- [x] 去掉旧 JSON 表达式。
- [x] 保留每张源表独立 FineBI schema。

验收：

- [x] FineBI 暴露表可以刷新。
- [x] FineBI 表字段是中文列名。
- [x] 数值列在 FineBI schema 中是 `NUMERIC`。
- [x] 日期列在 FineBI schema 中是 `DATE` 或 `TIMESTAMPTZ`。
- [x] 只读账号权限仍只限独立 schema。

阶段 10 结论：

- 已改造 `app/push/push_service.py`：`_load_source_rows` 只从实体列读取 `table_columns.is_visible=true` 的字段，月度过滤使用真实期间列，遇到非实体列业务表或缺失实体列直接失败。
- `push_external_db` 继续使用实体列原生 Python 值，字段映射、upsert、删孤儿逻辑保持；仅在内部无主键 hash 材料上做 JSON 安全转换，不影响外部数据库入参类型。
- `push_http` 和 `app/push/router.py` 的 `api_expose` 数据出口会把 `Decimal`、`date`、`datetime` 转成 JSON 可序列化字符串。
- `push_db_expose` 改为按 `table_columns.data_type` 创建 FineBI 暴露表真实类型，数值为 `NUMERIC`，日期为 `DATE`，日期时间为 `TIMESTAMPTZ`。
- FineBI 插入 SQL 改为 `SELECT "entity_column" AS "中文列名"`；重复中文列名会追加 `_2`、`_3` 后缀避免建表冲突。
- FineBI schema 和表名继续按源表独立生成；只读账号授权只限该独立 schema，并撤销 public 和旧共享 `finebi` schema 访问。
- 新增测试 `tests/test_push_service_entity.py`，覆盖实体列读取、旧 raw 表拒绝、HTTP/API JSON 转换、FineBI 类型和 SQL 生成。
- 验证命令：`$env:PYTHONPATH='.'; pytest -q`，结果 `120 passed`。
- 推送模块旧读法搜索命令已执行，未发现业务链路旧 JSON 表达式。
- 前端构建命令：`npm.cmd run build`，通过；Rollup 仅提示既有的大 chunk / PURE 注释警告。

### 阶段 11：改成本分摊相关

涉及文件：

- `hr-portal/backend/app/allocation/router.py`
- `hr-portal/backend/app/cost_allocation/router.py`

任务：

- [x] 检查是否直接访问 `raw`。
- [x] 如果只是调用 `_dynamic_upsert`，保持传入 dict 即可。
- [x] 确认成本分摊结果写入 `emp_monthly_cost_result` 实体列。
- [x] 确认结果表字段缺失时会自动建列。
- [x] 确认结果表可用于数据查看和 FineBI。

验收：

- [x] 成本分摊方案可执行。
- [x] 分摊结果可落库。
- [x] 结果表可查看。
- [x] 结果表可推送到 FineBI。

阶段 11 结论：

- 已检查 `app/allocation/router.py` 和 `app/cost_allocation/router.py`：成本分摊归档链路本身不直接读取或写入业务表 `raw`，结果写入统一交给阶段 6 已实体化的 `_dynamic_upsert`。
- 方案执行入口 `app/allocation/router.py` 已保持通过 `_strip_archive_prefix` 把报表结果中的 `alias.column` 规范为实体列 `column` 后再写入结果表。
- 修正旧归档入口 `app/cost_allocation/router.py`：归档行也统一剥离 `alias.` 前缀，避免实体表中自动生成 `result.employee_no` 这类错误字段。
- 旧归档入口现在会把 `_dynamic_upsert` 的实体表强校验错误转换为 `422`，例如结果表不是实体列结构时直接失败，不做兼容写入。
- 结果表字段缺失仍由 `_dynamic_upsert -> _ensure_columns -> add_source_column` 自动创建实体列；结果表新增字段的 label 由报表列元数据传入。
- 已验证 `emp_monthly_cost_result` 可继续被阶段 7 的数据查看链路读取，也可被阶段 10 的 `push_db_expose` 暴露到 FineBI，数值字段保持 `NUMERIC`。
- 新增测试 `tests/test_allocation_entity.py`，覆盖成本分摊方案归档、旧归档接口 alias 前缀剥离、旧 raw 结果表拒绝、结果表 FineBI 暴露真实类型。
- 验证命令：`$env:PYTHONPATH='.'; pytest -q`，结果 `124 passed`，仅有既有 `HTTP_422_UNPROCESSABLE_ENTITY` 常量弃用 warning。
- 成本分摊模块旧读法搜索命令已执行，未发现业务链路旧 JSON 表达式。
- 前端构建命令：`npm.cmd run build`，通过；Rollup 仅提示既有的大 chunk / PURE 注释警告。

### 阶段 12：改报表 SQL

涉及文件：

- `hr-portal/backend/app/reports/sql_builder.py`
- `hr-portal/backend/app/reports/router.py`

任务：

- [x] 修改文件顶部设计说明，不再假设 `(id, pk_hash, raw, synced_at)`。
- [x] 将 `_raw_text` 替换为 `_col_expr` 或类似工具。
- [x] JOIN 条件改为真实列比较。
- [x] SELECT 不再选择整行 `raw`。
- [x] 查询结果按所选实体列组装。
- [x] 过滤条件改为真实列表达式。
- [x] 排序条件改为真实列表达式。
- [x] 聚合字段优先使用数据库真实类型。
- [x] 兼容计算字段、值规则、转置、余差收口逻辑。
- [x] 保留字段脱敏逻辑。

验收：

- [x] 单表明细报表可运行。
- [x] 单表聚合报表可运行。
- [x] 多表 JOIN 报表可运行。
- [x] 过滤、排序可运行。
- [x] 转置报表可运行。
- [x] 成本分摊相关报表可运行。
- [x] CSV 导出可运行。

阶段 12 结论：

- 已改造 `app/reports/sql_builder.py`：顶部设计说明改为实体列模式，删除 `_raw_text`/`JSONB` 依赖，新增 `_entity_column`、`_entity_text`、实体表校验、结果值规范化和按字段类型转换筛选值的工具。
- 报表 SELECT 现在只选择每个 alias 的 `id` 和实际需要的实体列，不再选择整行 `raw`；查询结果按 `alias.column_code` 从实体列 label 回读组装。
- JOIN 条件改为真实列等值比较；用户过滤条件和排序条件改为真实列表达式，其中数值、整数、日期、日期时间、布尔筛选值会按 `table_columns.data_type` 转换，`contains` 和权限范围继续按文本匹配。
- 聚合链路复用实体列原生 Python 值参与数值计算；展示输出再统一把 `Decimal/date/datetime` 转成可序列化值。
- 计算字段、值规则、行列转置、列行转置、余差收口继续沿用原有 Python 后处理链路；计算字段依赖列会自动加入实体列 SELECT。
- 报表专用权限 alias 重建逻辑已从 raw 文本改为实体列文本，并与主权限引擎保持 fail-closed：标签维度/字段对当前表完全不命中时不再放行。
- 新增 `tests/test_reports_sql_builder_entity.py`，覆盖单表明细、真实类型过滤/排序、多表 JOIN、单表聚合、计算字段依赖、旧 raw 表拒绝、权限 alias 过滤 SQL。
- 验证命令：`$env:PYTHONPATH='.'; pytest tests/test_reports_sql_builder_entity.py -q`，结果 `6 passed`。
- 全量后端验证：`$env:PYTHONPATH='.'; pytest -q`，结果 `136 passed, 1 warning`，warning 仍为既有 `HTTP_422_UNPROCESSABLE_ENTITY` 弃用提醒。
- 前端构建验证：`npm.cmd run build`，通过；仅保留既有 Rollup PURE 注释和大 chunk 警告。

### 阶段 13：清理旧 raw 假设

任务：

- [x] 全局搜索旧 ORM 字段访问。
- [x] 全局搜索旧行对象属性访问。
- [x] 全局搜索旧 JSON SQL 表达式。
- [x] 全局搜索旧 JSON 提取函数。
- [x] 全局搜索 JSONB 强转表达式。
- [x] 全局搜索旧 JSON 列文档注释。
- [x] 区分业务表旧 JSON 列和普通变量名，避免误改 AI 调用结果变量。
- [x] 更新相关 README 或设计文档。

验收：

- [x] 业务表主链路不再依赖旧 JSON 列。
- [x] 树表兜底 JSON 字段已移除；只在 AI 响应变量、审计 payload、测试断路器等非业务数据兼容场景保留普通变量命名。

阶段 13 结论：

- 已完成全局旧结构审计，覆盖旧 ORM 字段访问、旧行对象属性访问、旧 JSON SQL 表达式、旧 JSON 提取函数、JSONB 强转表达式、旧 JSON 列文档注释等关键词。
- 已清理业务主链路中最后一处实际兼容分支：`app/data/columns_router.py` 的计算字段重算不再从旧 JSON 列兜底读写，遇到非实体列业务表或缺失实体列会直接返回 `409`。
- 已将旧迁移脚本改为无条件禁用桩：`scripts/migrate_codes.py`、`scripts/migrate_rename_normalize.py`、`scripts/migrate_allocation_schemes.py` 不再提供任何放行参数或执行路径。
- 已移除树表兜底 JSON 字段：`cost_center_tree`、`org_tree` ORM 和同步写入均改为标准列结构，并新增迁移 `0033_drop_tree_raw_columns.py` 删除旧列。
- 已更新 `CLAUDE.md` 的数据层规范为实体列宽表规则，并将 `docs/phase4-data-layer.md` 改为废弃占位文档，不再保留旧实现细节。
- 保留的 raw 命中均为非业务数据兼容：AI/provider 解析变量、审计 payload、测试中用于构造“非实体列结构”的拒绝用例、`scopes.models` 和 `reports.models` 的配置 JSONB，以及实体表断路器里的物理列检测。
- 新增测试：`tests/test_legacy_raw_migration_guards.py`，覆盖三个旧迁移脚本无条件禁用。
- 补充测试：`tests/test_columns_router_ddl.py` 增加计算字段重算实体列读写、非实体列结构拒绝访问。
- 验证命令：`$env:PYTHONPATH='.'; pytest tests/test_legacy_raw_migration_guards.py tests/test_columns_router_ddl.py tests/test_scope_filter_entity.py tests/test_trees_router_entity.py tests/test_sync_service_entity.py -q`，结果 `25 passed`。
- 全量后端验证：`$env:PYTHONPATH='.'; pytest -q`，结果 `141 passed, 1 warning`，warning 仍为既有 `HTTP_422_UNPROCESSABLE_ENTITY` 弃用提醒。
- 前端构建验证：`npm.cmd run build`，通过；仅保留既有 Rollup PURE 注释和大 chunk 警告。

### 阶段 14：测试和验收

任务：

- [x] 跑后端测试。
- [x] 新建一张业务表。
- [x] 新增一个字段。
- [x] 删除一个字段。
- [x] 修改一个字段类型。
- [x] 模拟接口新增字段，确认自动建列。
- [x] 同步 `emp_realtime_roster`。
- [x] 同步一张月度表。
- [x] 打开数据列表。
- [x] 测试搜索、筛选、导出。
- [x] 测试权限过滤。
- [x] 测试补偿金计算。
- [x] 测试收入证明生成。
- [x] 测试成本分摊。
- [x] 测试 FineBI 暴露表刷新。
- [x] 测试报表运行。

验收：

- [x] 核心同步链路通过。
- [x] 核心业务工具通过。
- [x] FineBI 类型问题解决。
- [x] 报表功能恢复。
- [x] 无明显旧结构依赖残留。

阶段 14 结论：

- 阶段 14 采用自动化验收矩阵覆盖主要业务面：`test_admin_tables_router.py` 覆盖新建业务表；`test_columns_router_ddl.py` 覆盖字段新增、删除、类型修改和计算字段重算；`test_sync_service_entity.py` 覆盖接口新增字段自动建列、实时表/月度表同步写入；`test_data_router_entity.py` 覆盖数据列表、搜索、筛选、distinct、CSV 导出和编辑。
- 权限与业务工具验收由专项测试覆盖：`test_scope_filter_entity.py` 覆盖权限过滤；`test_tools_router_entity.py` 覆盖补偿金计算和收入证明准备；`test_allocation_entity.py` 覆盖成本分摊归档；`test_push_service_entity.py` 覆盖 FineBI 暴露真实类型；`test_reports_sql_builder_entity.py` 覆盖报表运行、过滤、排序、JOIN、聚合、计算字段和权限 alias。
- 旧结构阻断验收由 `test_legacy_raw_migration_guards.py`、旧结构拒绝用例和全局搜索共同覆盖：旧迁移脚本无条件禁用，业务主链路旧 JSON 表达式/旧放行口无命中；仅保留测试中故意构造非实体列结构的拒绝用例。
- 专项验收命令：`$env:PYTHONPATH='.'; pytest tests/test_admin_tables_router.py tests/test_columns_router_ddl.py tests/test_sync_service_entity.py tests/test_data_router_entity.py tests/test_scope_filter_entity.py tests/test_tools_router_entity.py tests/test_allocation_entity.py tests/test_push_service_entity.py tests/test_reports_sql_builder_entity.py tests/test_trees_router_entity.py tests/test_legacy_raw_migration_guards.py tests/test_data_ddl.py tests/test_dynamic_loader.py tests/test_rebuild_source_tables.py -q`，结果 `96 passed, 1 warning`。
- 全量后端验证：`$env:PYTHONPATH='.'; pytest -q`，结果 `141 passed, 1 warning`，warning 仍为既有 `HTTP_422_UNPROCESSABLE_ENTITY` 弃用提醒。
- 前端构建验证：`npm.cmd run build`，通过；仅保留既有 Rollup PURE 注释和大 chunk 警告。

## 10. 推荐执行顺序

最小安全顺序：

1. 阶段 0：确认边界。
2. 阶段 1：DDL 工具层。
3. 阶段 2：动态模型和注册机制。
4. 阶段 3：重建业务物理表。
5. 阶段 6：同步服务。
6. 阶段 7：数据查看和编辑。
7. 阶段 10：FineBI 暴露。
8. 阶段 8：权限过滤。
9. 阶段 9：工具中心。
10. 阶段 11：成本分摊。
11. 阶段 12：报表 SQL。
12. 阶段 13：清理旧 raw 假设。
13. 阶段 14：测试验收。

如果要先做最小可交付闭环，优先完成：

- DDL 工具层
- 动态模型
- 重建物理表
- 同步服务
- 数据列表
- FineBI 暴露

报表 SQL 可以作为第二个大提交单独完成。

## 11. 关键设计约束

### 11.1 前端可以继续建表和改字段

实体表后，前端不是不能建表或改字段，而是不能直接操作 SQL。

前端只提交结构化参数：

```json
{
  "column_code": "base_salary",
  "column_label": "基本工资",
  "data_type": "number"
}
```

后端负责：

1. 校验表名和字段名。
2. 映射 PostgreSQL 类型。
3. 执行 DDL。
4. 写入 `table_columns`。
5. 保证 DDL 和元数据一致。

### 11.2 接口仍可自动新增列

同步时发现未知字段，系统继续自动扩展：

1. 生成或复用 `column_code`。
2. `ALTER TABLE ADD COLUMN ... TEXT`。
3. 写入 `table_columns(auto_discovered=true)`。
4. 本次同步继续写入该列。

未知字段默认 `TEXT`，后续由管理员确认类型。

### 11.3 不建议业务主链路继续依赖 raw

不再保留业务表 JSON 兜底字段。审计或调试信息应写入专门日志、同步运行记录或独立审计表，不能作为业务表查询来源。

### 11.4 内置表字段删除要做依赖检查

内置表字段可能被这些模块引用：

- 权限 `scope_role`
- 报表
- 数据集关系
- 成本分摊方案
- 补偿金计算
- 收入证明
- FineBI 推送目标字段映射

删除前必须检查依赖，不能只做 `DROP COLUMN`。

## 12. 风险点

| 风险 | 说明 | 缓解 |
|---|---|---|
| 动态 ORM 反射复杂 | 当前代码依赖 `DATA_TABLES[table]` | 先封装统一列访问工具，减少散点改动 |
| 报表 SQL 改动大 | 历史 JOIN、过滤、SELECT 曾依赖旧 JSON 表达式 | 放到第二闭环，单独验收 |
| 字段类型转换失败 | 旧值可能不符合新类型 | 自动新增字段默认 TEXT，人工确认后再改类型 |
| DDL 与元数据不一致 | ADD COLUMN 成功但写元数据失败，或相反 | DDL 和元数据放同一事务，失败回滚 |
| 字段删除破坏依赖 | 工具、报表、权限可能引用字段 | 删除前做依赖检查 |
| FineBI 中文列名冲突 | 两个字段 label 一样 | 建表前检测中文列名重复，必要时追加后缀或拒绝 |

## 13. 当前实施状态

- [x] 阶段 0-14 已完成。
- [x] 阶段 2/3 未验收项已补齐：生产代码无静态旧结构业务 ORM fallback；真实 Docker 数据库 9 张业务表已重建并验收为实体列。

后续进入上线前真实环境冒烟：应用最新 Alembic 迁移，重新同步/上传业务数据，并在目标环境抽查核心页面和 FineBI 连接。
