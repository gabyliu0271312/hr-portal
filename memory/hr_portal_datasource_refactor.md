---
name: hr-portal-datasource-refactor
description: JSONB raw 列重构为标准列方案，解决 FineBI 类型缺失、数值无法聚合的根本问题
metadata:
  type: project
---

# HR Portal 数据源实体表重构执行文档

## 1. 背景

当前业务表结构基本如下：

```sql
id | pk_hash | synced_at | raw JSON
```

所有业务字段压在 `raw` 中，字段值多数以字符串形态存在。这个设计早期换来了数据接入灵活性，但现在已经影响核心能力：

- FineBI 无法正确识别数值和日期，导致工资、成本、奖金等字段无法自然聚合。
- 字段类型只存在于 `table_columns.data_type` 元数据中，数据库层不做约束。
- 前端修改字段类型后，底层存储并不会变化。
- 报表、权限、工具中心大量依赖 `raw->>` / `jsonb_extract_path_text`。
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
- 继续用 `raw JSON` 会让报表、权限、成本分摊、工具中心持续堆复杂度。

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
| cost_center_tree | 已经是标准列结构，`raw` 只是兜底 |
| org_tree | 已经是标准列结构，`raw` 只是兜底 |

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

- [ ] 移除业务表对静态 `raw JSON` ORM class 的依赖。
- [ ] 保留 `TableColumn`、`RegisteredTable`、`CostCenterNode`、`OrgNode` 等元数据和树模型。
- [ ] 实现按数据库真实表反射的模型加载。
- [ ] `DATA_TABLES` 继续作为运行时注册表，但内容来自反射。
- [ ] 启动时从 `registered_tables` 加载所有业务表。
- [ ] 用户新建表后可热注册到 `DATA_TABLES`。
- [ ] 月度表继续注册到 `PERIOD_TABLES`。

验收：

- [ ] 服务启动后，内置业务表可在 `DATA_TABLES` 中找到。
- [ ] 用户自建业务表可在 `DATA_TABLES` 中找到。
- [ ] ORM/SQLAlchemy 查询能访问实体列。

### 阶段 3：重建业务物理表

建议新增开发期脚本：

- `hr-portal/backend/scripts/rebuild_source_tables.py`

任务：

- [ ] 读取 9 张业务表名单。
- [ ] 读取每张表的 `table_columns`。
- [ ] DROP 9 张业务表。
- [ ] 重建基础列：`id`、`pk_hash`、`synced_at`。
- [ ] 根据 `table_columns.column_code` 建实体列。
- [ ] 根据 `table_columns.data_type` 决定 PostgreSQL 类型。
- [ ] 为 `pk_hash` 创建唯一约束和索引。
- [ ] 重载或刷新 `DATA_TABLES`。

验收：

- [ ] 9 张表不再包含主业务 `raw` 列。
- [ ] 每张表都有 `id`、`pk_hash`、`synced_at`。
- [ ] 每张表的业务字段是实体列。
- [ ] 表结构与 `table_columns` 一致。

### 阶段 4：改前端建表入口对应的后端逻辑

涉及文件：

- `hr-portal/backend/app/admin/tables_router.py`
- `hr-portal/backend/app/data/dynamic_loader.py`

任务：

- [ ] 新建表时不再创建 `raw JSON`。
- [ ] 新建表时只创建基础列。
- [ ] 写入 `registered_tables`。
- [ ] 热注册实体表模型。
- [ ] 如果请求包含初始字段，同时创建实体列和 `table_columns`。
- [ ] 删除表时继续 `DROP TABLE`。
- [ ] 删除表时清理 `registered_tables`、`table_columns`、单表数据集。

验收：

- [ ] 前端可以新建一张空业务表。
- [ ] 新建表没有 `raw` 列。
- [ ] 新建表能出现在表列表和字段管理里。
- [ ] 自建表可以删除。

### 阶段 5：改字段管理

涉及文件：

- `hr-portal/backend/app/data/columns_router.py`

任务：

- [ ] 新增字段接口先执行 `ALTER TABLE ADD COLUMN`。
- [ ] 新增字段接口再写入 `table_columns`。
- [ ] 新增字段失败时不能留下半截元数据。
- [ ] 删除字段前做依赖检查。
- [ ] 删除字段时执行 `ALTER TABLE DROP COLUMN`。
- [ ] 删除字段后删除 `table_columns`。
- [ ] 修改字段类型时执行 `ALTER TABLE ALTER COLUMN TYPE`。
- [ ] 空表或空列可以直接改类型。
- [ ] 非空列改类型需要显式确认参数。
- [ ] 修改字段标签、顺序、显示、敏感、权限角色仍只改元数据。
- [ ] 计算字段创建后要创建实体列。
- [ ] 重算计算字段时写回实体列。

验收：

- [ ] 前端新增字段后，数据库真实列存在。
- [ ] 前端删除字段后，数据库真实列消失。
- [ ] 修改展示配置不影响数据库列。
- [ ] 修改类型后数据库列类型同步变化。

### 阶段 6：改同步服务

涉及文件：

- `hr-portal/backend/app/datasources/sync_service.py`

任务：

- [ ] 修改 `_ensure_columns`，发现新字段时自动 `ADD COLUMN TEXT`。
- [ ] `_ensure_columns` 继续写入 `table_columns(auto_discovered=true)`。
- [ ] 中文字段名仍走 codegen 生成英文 `column_code`。
- [ ] 字段重命名时仍优先复用 `source_field_id` 或中文 label 对应 code。
- [ ] `_dynamic_upsert` payload 从 `{"raw": merged}` 改为实体列字典。
- [ ] upsert insert values 包含 `pk_hash`、`synced_at`、实体列。
- [ ] upsert update set 不再更新 `raw`，改为更新实体列和 `synced_at`。
- [ ] 手工字段保留逻辑从实体列读取旧值。
- [ ] 复制上月逻辑从实体列读取上月值。
- [ ] 月度孤儿删除从实体列过滤期间。
- [ ] lookup 读取映射表时从实体列读取。
- [ ] 计算字段结果写入实体列。
- [ ] 成本中心树构建从落库后实体列组装 dict。
- [ ] 组织架构树构建可继续使用同步前 rows，或从实体列重读后组装 dict。

验收：

- [ ] `emp_realtime_roster` 能同步成功。
- [ ] `emp_monthly_salary` 能同步成功。
- [ ] 接口新增字段时数据库自动新增实体列。
- [ ] 手工字段不会被同步覆盖。
- [ ] 复制上月字段仍可用。
- [ ] 计算字段仍可回填。
- [ ] 月度表孤儿删除只影响当月。

### 阶段 7：改数据查看、编辑、导出

涉及文件：

- `hr-portal/backend/app/data/router.py`

任务：

- [ ] 查询列表时从实体列组装 item。
- [ ] 精确筛选从 `raw->>` 改为真实列比较。
- [ ] 关键字搜索改为 `cast(column, String).ilike(...)`。
- [ ] distinct 改为 `SELECT DISTINCT column`。
- [ ] CSV 导出从实体列读取。
- [ ] 手工新增行改为实体列 insert。
- [ ] 单行编辑改为实体列 update。
- [ ] 批量编辑改为实体列 update。
- [ ] 计算字段编辑后重算并写实体列。
- [ ] 脱敏和隐藏列逻辑保持不变，只替换取值来源。

验收：

- [ ] 数据列表可以打开。
- [ ] 搜索可以使用。
- [ ] 筛选可以使用。
- [ ] distinct 下拉可以使用。
- [ ] CSV 导出可以使用。
- [ ] 手工新增、单行编辑、批量编辑可以使用。

### 阶段 8：改权限过滤

涉及文件：

- `hr-portal/backend/app/permissions/scope_filter.py`

任务：

- [ ] 将 `_raw_text(model, col_code)` 替换为实体列表达式工具。
- [ ] `scope_role` 字段过滤改为真实列 `IN`。
- [ ] 非文本列参与权限过滤时按文本比较或按原类型比较，策略保持一致。
- [ ] 保留 fail-closed 语义。
- [ ] 保留超管放行。
- [ ] 保留 `scope_exempt` 放行。

验收：

- [ ] 无标签用户看不到受控表数据。
- [ ] 超管可以看全部。
- [ ] `scope_exempt=true` 的表可以放行。
- [ ] 组织范围过滤有效。
- [ ] 成本中心范围过滤有效。
- [ ] 人员范围过滤有效。

### 阶段 9：改工具中心

涉及文件：

- `hr-portal/backend/app/tools/router.py`

任务：

- [ ] 员工搜索从 `raw` 搜索改成实体列搜索。
- [ ] `_to_candidate` 从实体列取值。
- [ ] 补偿金计算从实体列取 `hire_date`、`terminated_date`、`base_salary` 等字段。
- [ ] 收入证明从实体列取员工基本信息。
- [ ] 工具权限隐藏字段逻辑保持不变。
- [ ] 继续使用 `build_scope_filter` 做数据范围控制。

验收：

- [ ] 补偿金员工搜索可用。
- [ ] 补偿金计算可用。
- [ ] 收入证明员工搜索可用。
- [ ] 收入证明生成可用。

### 阶段 10：改 FineBI 暴露和推送

涉及文件：

- `hr-portal/backend/app/push/push_service.py`

任务：

- [ ] `_load_source_rows` 从实体列读取可见字段。
- [ ] 月度过滤从实体列过滤。
- [ ] `push_external_db` 保持字段映射和 upsert 逻辑。
- [ ] `push_http` 保持字段映射逻辑。
- [ ] `push_api_expose` 保持读取源行逻辑。
- [ ] `push_db_expose` 建表时按 `table_columns.data_type` 创建真实类型。
- [ ] `push_db_expose` 插入时直接 `SELECT column AS "中文名"`。
- [ ] 去掉 `raw->>`。
- [ ] 保留每张源表独立 FineBI schema。

验收：

- [ ] FineBI 暴露表可以刷新。
- [ ] FineBI 表字段是中文列名。
- [ ] 数值列在 FineBI schema 中是 `NUMERIC`。
- [ ] 日期列在 FineBI schema 中是 `DATE` 或 `TIMESTAMPTZ`。
- [ ] 只读账号权限仍只限独立 schema。

### 阶段 11：改成本分摊相关

涉及文件：

- `hr-portal/backend/app/allocation/router.py`
- `hr-portal/backend/app/cost_allocation/router.py`

任务：

- [ ] 检查是否直接访问 `raw`。
- [ ] 如果只是调用 `_dynamic_upsert`，保持传入 dict 即可。
- [ ] 确认成本分摊结果写入 `emp_monthly_cost_result` 实体列。
- [ ] 确认结果表字段缺失时会自动建列。
- [ ] 确认结果表可用于数据查看和 FineBI。

验收：

- [ ] 成本分摊方案可执行。
- [ ] 分摊结果可落库。
- [ ] 结果表可查看。
- [ ] 结果表可推送到 FineBI。

### 阶段 12：改报表 SQL

涉及文件：

- `hr-portal/backend/app/reports/sql_builder.py`
- `hr-portal/backend/app/reports/router.py`

任务：

- [ ] 修改文件顶部设计说明，不再假设 `(id, pk_hash, raw, synced_at)`。
- [ ] 将 `_raw_text` 替换为 `_col_expr` 或类似工具。
- [ ] JOIN 条件改为真实列比较。
- [ ] SELECT 不再选择整行 `raw`。
- [ ] 查询结果按所选实体列组装。
- [ ] 过滤条件改为真实列表达式。
- [ ] 排序条件改为真实列表达式。
- [ ] 聚合字段优先使用数据库真实类型。
- [ ] 兼容计算字段、值规则、转置、余差收口逻辑。
- [ ] 保留字段脱敏逻辑。

验收：

- [ ] 单表明细报表可运行。
- [ ] 单表聚合报表可运行。
- [ ] 多表 JOIN 报表可运行。
- [ ] 过滤、排序可运行。
- [ ] 转置报表可运行。
- [ ] 成本分摊相关报表可运行。
- [ ] CSV 导出可运行。

### 阶段 13：清理旧 raw 假设

任务：

- [ ] 全局搜索 `Model.raw`。
- [ ] 全局搜索 `.raw`。
- [ ] 全局搜索 `raw->>`。
- [ ] 全局搜索 `jsonb_extract_path_text`。
- [ ] 全局搜索 `cast(..., JSONB)`。
- [ ] 全局搜索 `raw JSON` 文档注释。
- [ ] 区分业务表 raw 和普通变量名 `raw`，不要误改 AI 调用结果变量。
- [ ] 更新相关 README 或设计文档。

验收：

- [ ] 业务表主链路不再依赖 `raw`。
- [ ] 只在树表兜底、AI 响应变量、审计 payload 等合理场景保留 `raw` 命名。

### 阶段 14：测试和验收

任务：

- [ ] 跑后端测试。
- [ ] 手动新建一张业务表。
- [ ] 手动新增一个字段。
- [ ] 手动删除一个字段。
- [ ] 手动修改一个字段类型。
- [ ] 模拟接口新增字段，确认自动建列。
- [ ] 同步 `emp_realtime_roster`。
- [ ] 同步一张月度表。
- [ ] 打开数据列表。
- [ ] 测试搜索、筛选、导出。
- [ ] 测试权限过滤。
- [ ] 测试补偿金计算。
- [ ] 测试收入证明生成。
- [ ] 测试成本分摊。
- [ ] 测试 FineBI 暴露表刷新。
- [ ] 测试报表运行。

验收：

- [ ] 核心同步链路通过。
- [ ] 核心业务工具通过。
- [ ] FineBI 类型问题解决。
- [ ] 报表功能恢复。
- [ ] 无明显 `raw` 依赖残留。

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

可选保留 `source_raw JSONB` 作为审计或调试字段，但不建议作为主查询来源。

如果保留，必须遵守：

- 报表不用它。
- FineBI 不用它。
- 权限过滤不用它。
- 工具中心不用它。
- 成本分摊不用它。

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
| 报表 SQL 改动大 | 当前 JOIN、过滤、SELECT 都依赖 raw | 放到第二闭环，单独验收 |
| 字段类型转换失败 | 旧值可能不符合新类型 | 自动新增字段默认 TEXT，人工确认后再改类型 |
| DDL 与元数据不一致 | ADD COLUMN 成功但写元数据失败，或相反 | DDL 和元数据放同一事务，失败回滚 |
| 字段删除破坏依赖 | 工具、报表、权限可能引用字段 | 删除前做依赖检查 |
| FineBI 中文列名冲突 | 两个字段 label 一样 | 建表前检测中文列名重复，必要时追加后缀或拒绝 |

## 13. 当前实施状态

- [ ] 待实施

下一步建议从阶段 1 开始：先做 `app/data/ddl.py`，不要直接改同步服务。DDL 工具层稳定后，再替换上层调用点。
