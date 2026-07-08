
# 数据仓库分层治理 — 实施计划与交付记录

**日期**：2026-07-08（更新）
**分支**：`feature/warehouse-phase3`（已合并 main）
**状态**：P1-P5 全部完成，生产已部署

---

## 一、背景

### 1.1 问题起源

2026-07-07 Code Review 验收报告（R 章）提出了 9 项架构改进建议，覆盖 SQL 安全、分层策略、自动血缘、质量门禁、权限传播等领域。经 6 轮讨论，逐条评估采纳范围，形成了「分层治理 + 信息架构调整」双线并行的实施方案。

### 1.2 核心发现

在讨论过程中，逐步发现三个结构性数据治理问题：

1. **数据集指向原始表**：生产环境数据集 `warehouse_layer='DWD'`，但底层表名无层级前缀（如 `emp_monthly_salary`），实际是未经清洗的原始数据，形成"假 DWD"
2. **资产目录割裂**：`RegisteredTable`（物理表）和 `DataSet`（数据集）分属两套目录，DWD 标准单表数据集在资产页不可见
3. **ODS 可被直接消费**：报表和建模可以选择 ODS 层资产，绕过清洗，数仓分层形同虚设

### 1.3 总体原则

- **开发者 = 1 人 + 1 AI**，架构复杂度与团队规模匹配
- **消费者在内部**（BI 报表、推送任务），不面向外部付费用户
- **先安全稳定跑起来，再谈平台化**
- **安全判断不靠调用方自觉传对参数；红线字段不被 Schema 静默吞掉**

---

## 二、已完成的开发内容

### 2.1 P1：历史数据迁移（2026-07-08 完成）

**识别**：扫描生产环境，5 张报表 × 3 个数据集，`warehouse_layer` 全为 DWD，但底层表均为无前缀原始表。

**迁移**：
- 补建 7 张 DWD 物理表（`CREATE TABLE AS SELECT` + 补充主键）
- 创建 3 个 DWD 数据集（`ds_dwd_` 前缀，指向 DWD 物理表）
- 迁移 6 张报表 + 1 个 `allocation_scheme` 引用到新 DWD 数据集
- 删除 3 个旧数据集（CASCADE），更新报表 `config.columns/filters/sorts` 中的旧 alias 引用
- 开发环境和生产环境均已迁移完成

### 2.2 P2：新增资产规则收口（2026-07-08 完成）

**P2-01 拉取 ODS 时自动创建 DWD 表 + DWD 数据集**：
- 后端 `tables_router.py`：ODS 表名强制 `ods_` 前缀校验
- 拉取后自动执行 `CREATE TABLE dwd_xxx AS SELECT * FROM ods_xxx` + `ALTER TABLE ADD PRIMARY KEY (id)`
- DWD 表自动注册到 `registered_tables`（`warehouse_layer='DWD'`）
- 自动创建 DWD 数据集（`ensure_dwd_dataset`，`ds_dwd_` 前缀）
- 前端 `CreateTableDialog.vue`：`SmartCodeInput` 传 `prefix="ods_"`，AI 自动生成带前缀的表名

**P2-02 清洗执行时更新已有 DWD**：
- `execute_full`：保持 DROP + CREATE + INSERT 重建 DWD 物理表
- `generate_dwd_view`：改为查找已有 DWD 数据集（指向 DWD 表），更新 `DatasetOutputField`；不再创建新数据集

### 2.3 P3：报表与建模数据源收口（2026-07-08 完成）

**P3-01 报表只能引用 DWD/DWS 数据集**：
- 前端 `ReportDesigner.vue`：`loadDatasets()` 过滤 `warehouse_layer IN (DWD, DWS)`
- 后端 `reports/router.py`：`create_report` / `update_report` 校验数据集层级，ODS 拒绝（400）

**P3-02 建模只能引用 DWD 单表数据集**：
- 前端 `WarehouseModelingQuick.vue` / `WarehouseModelingVisual.vue`：`listAssets` 传 `warehouse_layer='DWD'`
- 后端 `assets.py`：`create_model` / `publish_model` 校验输入表层级为 DWD（否则 `ValueError`）

### 2.4 P4：清洗模块字段标准化能力建设（2026-07-08 完成）

**设计原则**：共存而非硬迁移。资产管理-字段模块和清洗模块同时可修改，作用对象不同，不冲突。

**P4-01 清洗模块字段标准化配置**：
- 规则配置面板新增：`output_enabled`（是否输出到 DWD）、`output_label`（显示名）、`output_description`（字段描述）
- `generate_dwd_view`：跳过 `output_enabled=false` 的字段；使用 `output_label`/`output_description` 填充 `DatasetOutputField`

**P4-02 资产字段模块维持现状**：
- 无代码变更。两模块共存，清洗模块 = DWD 输出权威来源，资产字段 = ODS 层展示

**P4-03 DWD/DWS 数据集字段维度/度量配置**：
- 新增 `GET /datasets/{id}/output-fields` 和 `PUT /datasets/{id}/output-fields/{id}` 端点
- `DatasetEdit.vue` 新增输出字段配置表格（可编辑显示名、维度/度量、描述）
- 当 DWD/DWS 和 ODS 两处同时配置维度/度量时，DWD/DWS 优先

### 2.5 DataSet 编码与展示名称分离（2026-07-08 完成）

- `DataSet` 模型新增 `label` 列（String(128)，中文展示名）
- `name` = 编码（系统标识符，如 `ds_dwd_cost_allocation`）
- `label` = 展示名（如 "成本分摊 DWD 数据集"）
- UI 层统一使用 `label || name` 展示（`Datasets.vue`、`ReportBasicInfo.vue`、`WarehouseModeling.vue`、`DatasetEdit.vue`）

### 2.6 资产命名规范

| 层级 | 物理表前缀 | 数据集前缀 | 示例 |
|------|-----------|-----------|------|
| ODS | `ods_` | —（不创建用户可见 ODS 数据集） | `ods_employee` |
| DWD | `dwd_` | `ds_dwd_` | `dwd_employee` → `ds_dwd_employee` |
| DWS | `dws_` | `ds_dws_` | `dws_headcount_summary` → `ds_dws_headcount_summary` |

- 新建 ODS 表名必须以 `ods_` 开头，否则拒绝注册
- DWD/DWS 表名和数据集名由系统自动推导，用户不可覆盖
- 历史无前缀表（如 `emp_monthly_salary`）视为 ODS，不改名，仅新资产强制前缀

### 2.7 最终资产关系链路

```
拉取 ODS（自动完成）：
  ods_employee
    ↓ 自动同结构拷贝
  dwd_employee
    ↓ 自动创建数据集
  ds_dwd_employee          → 立即可用于报表/建模

清洗（可选增强）：
  ods_employee → 清洗规则 → 更新 dwd_employee → 同步 ds_dwd_employee 字段

报表消费（始终不变）：
  报表 → ds_dwd_employee → dwd_employee
```

### 2.8 Service 拆分（P0-1）

`warehouse/service/` 按业务阶段拆分为 5 个文件：

| 文件 | 职责 |
|------|------|
| `assets.py` | 资产 CRUD |
| `standardization.py` | 标准化规则 + 模板 + DWD 视图 |
| `modeling.py` | 指标 + 维度 + DWS 聚合 |
| `materialization.py` | 快照 + SCD + 数据集构建 |
| `consumption.py` | ADS 组装 + 发布 |

### 2.9 DDL 安全层（P0-1/P0-3）

- `layer_policy.py`：`validate_ddl_operation` / `validate_layer_transition` / `assert_not_ods_write`
- ODS 表拒绝破坏性 DDL（DROP/REPLACE/ALTER/TRUNCATE）
- 不信任入参 `target_layer`，查真实 `registered_tables.warehouse_layer`
- `CREATE OR REPLACE` 按 REPLACE 处理，不被当作 CREATE 绕过

### 2.10 自动血缘（P0-2/Z02）

在 5 处关键方法追加 `LineageEdge` 写入：标准化（`execute_full`）、SCD、快照、ADS 发布、指标计算。血缘写入与主流程同一事务。

---

## 三、菜单与路由现状

### 3.1 已实现的菜单结构

```
数据仓库
├─ 数据资产          /warehouse/assets
├─ 数据清洗          /warehouse/data-recipe    （独立菜单，不再挂在"数据建模"下）
├─ 数据建模          /warehouse/modeling
│   ├─ 模型设计
│   ├─ 维度管理
│   ├─ 汇总视图
│   ├─ 快照管理
│   └─ 拉链管理
├─ 指标管理          /warehouse/metrics
├─ 数据服务          /warehouse/service
├─ 数据治理          /warehouse/governance
│   ├─ 数据质量
│   ├─ 数据血缘
│   └─ 执行监控
└─ 影响分析          /warehouse/impact
```

### 3.2 菜单命名对照

| 旧名 | 新名 | 说明 |
|------|------|------|
| 数据加工 | 数据清洗 | 独立菜单 |
| 数据建模（Tab） | 模型设计 | 更精确表达 |
| SCD 拉链 | 拉链管理 | 统一 |

---

## 四、分层消费规则

| 层级 | 消费规则 | 说明 |
|------|----------|------|
| ODS | **禁止消费** | 原始层，报表/建模/API/推送入口全部过滤 |
| DWD | **标准消费入口** | 拉取 ODS 时自动创建，清洗后更新，报表/建模统一入口 |
| DWS | **推荐消费** | 汇总层，适合报表/API/指标 |
| ADS | **标准消费** | 面向消费场景封装 |

---

## 五、提交记录

| Commit | 内容 |
|--------|------|
| `fe2594f` | P0a 中间态代码 + P1 历史迁移文档 |
| `7b13d57` | P2 新增资产规则收口 + P3 报表/建模数据源限制 |
| `1e448a3` | P4 清洗模块字段标准化能力建设 |
| `c2ad659` | DataSet 编码(name)与展示名称(label)分离 |
| `c9d1cb3` | SmartCodeInput 传 prefix="ods_" |
| `026ae8d` | CREATE TABLE AS SELECT 后补主键 |
| `dd25b97` | 清理死代码 PreviewOut/PreviewSummaryOut |
| `2a807a0` | 建模列表 + list_models 返回 label |
| `36e2fdb` | 文档标记 P2-P5 全部完成 |
| `38cf07e` | alembic 0072 down_revision 修正 |

---

## 六、延期与不做项

| 项目 | 决定 | 理由 |
|------|------|------|
| 完整 SQL Builder DSL | 不做 | `validate_identifier` + `layer_policy` 已覆盖 DDL 风险 |
| 独立 Quality Gate 系统 | 不做 | 嵌入式校验已实现阻断 |
| 重型 ADS Consumer Contract | 不做 | 内部消费者，不需要 SLA/schema_diff |
| 权限传播快照表 | 不做 | 改为规则递归查询 |
| 统一 `warehouse_runs` 表 | 不做 | API 聚合 VIEW 足够 |
| 统一 Trace ID | 延后 | 等出现异步/分布式链路 |
| 数据资产四 Tab（模型/指标/消费） | P1 | 表格资产 Tab 已实现，其余等后续 |
| 数据服务 5 Tab（API/推送/订阅/消费/监控） | P1 | table-only 入口已实现，完整服务台延后 |
| UCP/DataSource/数据服务边界统一 | P1 | 桥接基础已有，职责收敛后续做 |
