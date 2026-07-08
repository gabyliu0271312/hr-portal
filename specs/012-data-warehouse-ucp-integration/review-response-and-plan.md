
---
# Code Review 改进建议评估与开发计划

**日期**：2026-07-07
**评估人**：gaby.liu + Claude
**评审对象**：R 章 Code Review 验收报告 §4-7 改进建议

---

## 一、总体评估原则

评审建议体现了完整的数据平台治理视野，但**将 "HR 内部模块" 按 "企业级数据平台" 标准来要求**，导致大量建议在现阶段属于过度工程化（YAGNI）。

评估三原则：
1. **当前开发者 = 1 人 + 1 AI**，架构复杂度必须与团队规模匹配
2. **消费者在内部**（BI 报表、推送任务），不面向外部付费用户
3. **先安全稳定跑起来，再谈平台化**

---

## 二、逐条评估

### 4.1 Service 拆分

| 维度 | 评估 |
|------|------|
| 原建议 | 拆成 14 个子目录（assets/modeling/standardization/materialization/...） |
| 判断 | **方向同意，范围不同意** |
| 采纳 | 拆成 **5-6 个文件**，按业务阶段组织 |
| 理由 | 14 目录碎片化降低可读性；"独立应用化"在当前是伪需求 |

**采纳方案**：
```
service/
  assets.py          # WarehouseService（资产 CRUD）
  standardization.py # 标准化规则 + 模板 + DWD 视图
  modeling.py        # 指标 + 维度 + DWS 聚合
  materialization.py # 快照 + SCD + 数据集构建
  consumption.py     # ADS 组装 + 发布
```

### 4.2 SQL 安全层

| 维度 | 评估 |
|------|------|
| 原建议 | 建立完整 SQL Builder 框架（identifiers/ddl_builder/select_builder/materialization_writer） |
| 判断 | **方向正确，方案过度** |
| 采纳 | 保持 `validate_identifier()` 唯一入口；ODS 保护走 DB 层面 GRANT |
| 理由 | 维护内部 DSL 的复杂度 > 当前直接拼接的风险；ODS 只读应在数据库层保证 |

**采纳方案**：
- `validate_identifier()` 作为所有动态 SQL 的强制入口
- PostgreSQL: `GRANT SELECT ON ALL TABLES IN SCHEMA ods TO warehouse_app`
- 不建 DDL Builder / Select Builder

### 4.3 分层策略

| 维度 | 评估 |
|------|------|
| 原建议 | 抽象成统一 LayerPolicyService |
| 判断 | **当前够用，不急于平台化** |
| 采纳 | 暂不做 |
| 理由 | 仅有 4 层 × 3 操作的校验矩阵，为 12 行逻辑建框架是过度设计 |

**延后条件**：分层规则超过 20 条或出现第三个校验场景时再做。

### 4.4 自动血缘

| 维度 | 评估 |
|------|------|
| 原建议 | 新增 LineageEvent 模型，在 7 种场景自动写入 |
| 判断 | **最有价值的建议之一** |
| 采纳 | ✅ 轻量版——在关键方法中追加 LineageEdge 写入 |
| 理由 | 当前血缘依赖手工登记，SCD/ADS/快照确实没有自动血缘边 |

**采纳方案**：在 `execute_scd`、`publish_ads`、`trigger_snapshot`、`execute_standardization`、`compute_metric` 等方法中，追加 `LineageEdge(source, target, operation, operator, run_id)` 写入现有 lineage 表。5 个字段，不建新模型。

### 4.5 质量门禁

| 维度 | 评估 |
|------|------|
| 原建议 | Quality Gate 发布前自动检查，返回 pass/warn/block |
| 判断 | **有价值但优先级不应高于安全，且当前环境价值有限** |
| 采纳 | 延后 |
| 理由 | 门禁在有多人协作 + 审批流程时才真正生效；当前只是多一步确认 |

**延后条件**：出现第二个数据开发者或上线审批流程时再做。

### 4.6 ADS 消费契约

| 维度 | 评估 |
|------|------|
| 原建议 | 增加 SLA/deprecation_policy/breaking_change/schema_diff 等字段 |
| 判断 | **强烈不同意** |
| 采纳 | ❌ 不做 |
| 理由 | 这些是面向外部付费消费者的数据产品概念。当前 ADS 消费者是内部 BI 报表，publish_status + publish_targets + lineage_snapshot 已足够 |

### 4.7 产品红线

| 维度 | 评估 |
|------|------|
| 原建议 | 三条红线：不做跨系统编排、不做 BI 设计器、不做任意 SQL 开发 |
| 判断 | **同意，但无需新增行动** |
| 采纳 | 文档确认，不需代码变更 |
| 理由 | 三条红线已在 spec 多处声明，当前代码未违反 |

### 4.8 权限传播

| 维度 | 评估 |
|------|------|
| 原建议 | 新增 asset_permission_snapshot + field_permission_snapshot 两张表 |
| 判断 | **方向同意，方案过重** |
| 采纳 | ❌ 不做（方案层面） |
| 理由 | 权限继承应通过规则递归（SQL 查询）而非持久化快照 |

**替代方案**：ADS 发布时从 source_dws 递归查找 ACL 并继承，1 个 SQL 查询解决。

### 4.9 统一运行中心

| 维度 | 评估 |
|------|------|
| 原建议 | 新增 warehouse_runs 统一表 |
| 判断 | **合理但非紧急** |
| 采纳 | ⚠️ 先做 API 聚合，不建新表 |
| 理由 | 各类 run 表字段差异大，强行统一会产生大量 nullable 字段 |

**替代方案**：`GET /warehouse/runs` 从各 run 表 UNION 聚合，不建新表。

---

## 三、采纳的开发计划

### P0 — 立即执行（预计 1 天）

#### P0-1：Service 拆分为 5 个文件

| 新文件 | 来源 | 行数 |
|--------|------|------|
| `warehouse/service/assets.py` | WarehouseService | ~400 |
| `warehouse/service/standardization.py` | StandardizationRuleService + StandardizationTemplateService + _rule_to_sql_expr | ~300 |
| `warehouse/service/modeling.py` | MetricComputeService + DimensionService + DwsAggregateService | ~400 |
| `warehouse/service/materialization.py` | SnapshotService + ScdService | ~350 |
| `warehouse/service/consumption.py` | AdsService | ~250 |

保留 `warehouse/service/__init__.py` 统一 re-export，**router 和 handler 的 import 路径不变**。

#### P0-2：自动血缘边写入

在以下 5 个方法执行成功后，追加 `LineageEdge` 写入：

| 方法 | source | target | operation |
|------|--------|--------|-----------|
| `execute_standardization` | ODS 表名 | DWD 视图名 | `standardize` |
| `execute_scd` | source_table | target_table | `scd_zipper` |
| `trigger_snapshot` | source_table | target_table_{period} | `snapshot` |
| `publish_ads` | DWS source | ADS 定义 | `ads_publish` |
| `compute_metric` | 来源 dataset | metric_result | `metric_compute` |

不新增模型，复用现有的 lineage 边写入逻辑。

### P1 — 下次迭代（不阻塞当前发布）

#### P1-1：ODS 只读保护（DB 层）

```sql
GRANT SELECT ON ALL TABLES IN SCHEMA ods TO warehouse_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA ods GRANT SELECT ON TABLES TO warehouse_app;
```

#### P1-2：运行记录 API 聚合

`GET /warehouse/runs` 从 metric_runs、snapshot_runs、scd_runs、quality_runs 等表 UNION 聚合。

### 当前不做（YAGNI）

| 建议项 | 不做原因 |
|--------|----------|
| 完整 SQL Builder 框架 | validate_identifier 足够 |
| LayerPolicyService 独立服务 | 校验规则量不够 |
| Quality Gate 发布门禁 | 等多人协作 + 审批流程 |
| ADS Consumer Contract | 内部消费者，不需要 SLA/schema_diff |
| 权限传播快照表 | 改为规则递归 |
| 统一运行中心新表 | 改为 API 聚合 |
| 独立应用化 / 多租户 | 无需求 |
| UCP HTTP Client 防腐层 | 无独立化需求 |
| AI 自动化生成 | 治理未闭环前不谈 |

---

## 四、Z 章新增任务清单

以下 3 个任务建议纳入 atomic-tasks.md：

- [ ] Z01 Warehouse Service 按业务阶段拆分为 5 文件（assets/standardization/modeling/materialization/consumption）
- [ ] Z02 关键链路自动血缘边写入（标准化/SCD/快照/ADS发布/指标计算，5 处）
- [ ] Z03 ODS 只读保护（PostgreSQL GRANT + 应用层禁止写入校验）

---

## 五、六轮评审讨论终局

### 5.1 讨论过程

| 轮次 | 核心分歧 | 结论 |
|------|----------|------|
| 第一轮 | 9 项建议：SQL Builder / Quality Gate / ADS Contract / LayerPolicy / 权限快照 / 统一运行表 / 14 目录拆分 / 自动血缘 / Trace ID | 采纳自动血缘 + 5 文件拆分；拒绝 SQL Builder / Quality Gate / ADS Contract / 权限快照 / 14 目录 / Trace ID |
| 第二轮 | SQL Guard 7 函数、Quality Gate 独立系统、ADS Contract 全量、LayerPolicy Service | 拒绝；改用 `validate_identifier` + 嵌入式校验 |
| 第三轮 | DDL 安全、Schema `extra="forbid"` 范围、Quality Gate 嵌入还是独立 | 接受 `layer_policy.py` + Schema `extra="forbid"`；嵌入式校验接受 |
| 第四轮 | DDL 是否查询真实 `registered_tables`、`extra="forbid"` 覆盖 6 还是 20+ Schema、`assert_managed_write_target` | 接受查真实元数据；`extra="forbid"` 仍需讨论范围 |
| 第五轮 | `target_layer` 参数不可信、`extra="forbid"` 全 Schema 覆盖的技术可行性 | **接受两个核心原则：DDL 不信任入参 layer，Schema 不静默吞红线字段** |
| 第六轮 | 5 项补充：ALTER 破坏性 / CREATE OR REPLACE / 物理冲突 / `extra` 范围精确化 / `computed` 不可伪造 | **全部接受** |

### 5.2 核心共识

> **函数可以少，概念可以轻，但安全语义不能缩水。**
> **安全判断不靠调用方自觉传对参数；红线字段不被 Schema 静默吞掉。**
> **评审闭环不以文字承认为准，以代码和测试为准。**

---

## 六、最终执行计划

### 6.1 P0 任务清单（立即执行，预计 1 天）

#### P0-1：`layer_policy.py` — DDL 安全与分层校验

**新建文件**：`backend/app/warehouse/layer_policy.py`

**DDL 操作白名单**：

```python
DDL_CREATE   = "CREATE"
DDL_DROP     = "DROP"
DDL_REPLACE  = "REPLACE"
DDL_ALTER    = "ALTER"
DDL_TRUNCATE = "TRUNCATE"

ALLOWED_DDL_OPERATIONS = {DDL_CREATE, DDL_DROP, DDL_REPLACE, DDL_ALTER, DDL_TRUNCATE}
DESTRUCTIVE_DDL = {DDL_DROP, DDL_REPLACE, DDL_ALTER, DDL_TRUNCATE}
```

**不可妥协的语义规则**：

| 规则 | 约束 |
|------|------|
| **operation 非白名单拒绝** | `operation not in ALLOWED_DDL_OPERATIONS` → `ValueError` |
| **DROP / REPLACE / ALTER / TRUNCATE** | **必须查真实 `registered_tables.warehouse_layer`**，不信任入参 `target_layer` |
| **ODS 一律拒绝破坏性 DDL** | `actual.warehouse_layer == "ODS"` → 拒绝 |
| **未注册资产禁止破坏性 DDL** | `actual is None` → 拒绝（含"元数据缺失"提示） |
| **CREATE OR REPLACE** | **按 REPLACE 处理**，不按 CREATE。`INSERT OVERWRITE` → REPLACE |
| **CREATE 新表** | 允许未注册，但检查 `target_layer in (DWD,DWS,ADS)` + 命名不与已有 ODS 冲突 |
| **CREATE 物理冲突** | 查真实 DB schema（`information_schema.tables`）；物理表存在但 `registered_tables` 缺失 → **拒绝** + 提示"请先修复注册信息" |
| **CREATE 成功后再注册元数据** | 不能先注册后 CREATE；CREATE 失败必须 rollback，不留下半注册状态 |
| **CREATE 失败不留下 published 元数据** | 事务回滚 |

**函数签名**：

```python
async def validate_ddl_operation(db, table_name: str, operation: str, target_layer: str = None)

def validate_layer_transition(source_layer: str, target_layer: str, operation: str)

def assert_not_ods_write(layer: str)
```

**接入点**：`trigger_snapshot`、`execute_scd`、`execute_full`、`build_dataset_from_model`、`publish_ads` 中的 DDL 操作前。

#### P0-2：Schema `extra="forbid"` — 全量覆盖

**覆盖范围**：所有对外暴露的 R 章写入/执行类 **Request Schema**（不覆盖 Response / ORM / 内部 DTO）。

**完整清单（23 个）**：

| 模块 | Schema | 类型 |
|------|--------|------|
| ADS | `AdsDefinitionIn` | Create |
| ADS | `AdsDefinitionUpdateIn` | Update |
| SCD | `ScdConfigIn` | Create |
| SCD | `ScdConfigUpdateIn` | Update |
| 快照 | `SnapshotJobIn` | Create |
| 快照 | `SnapshotJobUpdateIn` | Update |
| 快照 | `SnapshotTriggerIn` | Trigger |
| 标准化 | `StandardizationRuleIn` | Create |
| 标准化 | `StandardizationRuleUpdateIn` | Update |
| 标准化 | `StandardizationTemplateIn` | Create |
| 标准化 | `StandardizationTemplateUpdateIn` | Update |
| 标准化 | `TemplateLoadRequest` | Load |
| 标准化 | `PreviewRequest` | Preview |
| 标准化 | `DwdViewGenerateRequest` | Generate |
| 标准化 | `ExecuteFullRequest` | Execute |
| 刷新策略 | `RefreshStrategyUpdateIn` | Update |
| 维度 | `DimensionCreateIn` | Create |
| 维度 | `DimensionUpdateIn` | Update |
| DWS | `DwsAggregateDefinitionCreateIn` | Create |
| DWS | `DwsAggregateDefinitionUpdateIn` | Update |
| DWS | `DwsViewGenerateRequest` | Generate |
| 指标 | `MetricComputeIn` | Compute |
| 指标 | `MetricRecalcIn` | Recalc |

**元测试**：

```python
def test_all_warehouse_write_schemas_forbid_extra():
    schemas = [
        AdsDefinitionIn, AdsDefinitionUpdateIn,
        ScdConfigIn, ScdConfigUpdateIn,
        SnapshotJobIn, SnapshotJobUpdateIn, SnapshotTriggerIn,
        StandardizationRuleIn, StandardizationRuleUpdateIn,
        StandardizationTemplateIn, StandardizationTemplateUpdateIn,
        TemplateLoadRequest, PreviewRequest, DwdViewGenerateRequest, ExecuteFullRequest,
        RefreshStrategyUpdateIn,
        DimensionCreateIn, DimensionUpdateIn,
        DwsAggregateDefinitionCreateIn, DwsAggregateDefinitionUpdateIn, DwsViewGenerateRequest,
        MetricComputeIn, MetricRecalcIn,
    ]
    for schema in schemas:
        assert schema.model_config.get("extra") == "forbid", f"{schema.__name__} missing extra='forbid'"
```

**抽样测试**（4 类，验证 422 拒绝）：

| Schema | 传入红线字段 | 期望结果 |
|--------|-------------|----------|
| `StandardizationRuleIn` | `raw_sql` | 422 |
| `DwsAggregateDefinitionCreateIn` | `raw_sql` | 422 |
| `ExecuteFullRequest` | `raw_sql` | 422 |
| `AdsDefinitionIn` | `chart_config` / `ucp_secret` | 422 |

**说明**：`extra="forbid"` 限制的是**顶层键**。Schema 中已声明的 `rule_config: dict` / `filter: dict` / `template_rules: list` 等自由 JSON 字段的**内容不受限制**——前端仍可传入任意嵌套子字段。这不会破坏任何现有功能。

#### P0-3：嵌入式安全校验 — 发布/物化不可绕过的阻断

**不建独立 Quality Gate 系统**。校验逻辑直接嵌入 `publish_ads`、`execute_full`、`execute_scd`、`trigger_snapshot` 等方法。

| 场景 | 约束 | 语义 |
|------|------|------|
| ADS 输出字段为空 | `publish_ads` 前检查 `output_fields` | **400** — 字段为空不可发布 |
| API/push 发布含未脱敏敏感字段 | `targets` 含 `api`/`push` + `output_fields` 中有 `is_sensitive=True` | **400** — 敏感字段不得通过 API/推送暴露 |
| API/push 发布权限摘要缺失 | `computed is not True` | **400** — 权限摘要未计算不可发布 |
| DWD 标准化结果 0 行 | `execute_full` 后检查 `row_count == 0` | **warn** — 不阻断，但写日志 |
| DWS 聚合无来源资产 | `source_id` 无效或不存在 | **400** |
| 目标层级非法 | `target_layer not in (DWD,DWS,ADS)` | **400** |

#### P0-4：权限继承摘要

**在 `publish_ads` 中，先计算权限摘要写入 `permissions_inherited_from`，再执行发布目标校验。**

**摘要结构**：

```json
{
  "computed": true,
  "hidden_field_count": 0,
  "masked_field_count": 0,
  "sensitive_field_count": 2,
  "sensitive_fields": ["salary", "bonus"],
  "inherit_strategy": "source_recursive",
  "source_assets": ["dws_employee_summary"]
}
```

**不可妥协的约束**：

| 规则 | 约束 |
|------|------|
| `computed: true` 不可伪造 | 只有完整计算成功才能写 `computed: true` |
| 计算失败 | `computed: false` 或直接阻断，**不能降级为 `computed: true` + 空字段** |
| 计算成功且无敏感字段 | `computed: true, sensitive_field_count: 0` → 允许 |
| API/push 发布前的校验 | `computed is not True` → **400**（不是 `json 非空`） |

#### P0-5：血缘 metadata 补充

在现有 Z02 的 `write_lineage_edge` 基础上，5 处写入均增加 `definition_id` + `rule_ids` + `version`：

| 操作 | `definition_id` | `rule_ids` | `version` |
|------|----------------|-----------|-----------|
| ADS 发布 | `ads_definition.id` | — | `ads_definition.version` |
| DWD 标准化 | — | 启用的 `standardization_rules` ID 列表 | — |
| SCD 执行 | `scd_config.id` | — | — |
| 快照生成 | `snapshot_job.id` | — | — |
| 指标计算 | `metric.id` | — | — |

#### P0-6：测试清单

**基础测试（已覆盖）**：

1. ODS 写入被拒绝
2. 非法层级跳转被拒绝
3. 新建 DWD/DWS/ADS 产物成功
4. 覆盖已有 ODS 被拒绝

**新增测试（本轮硬约束）**：

5. **`target_layer` 伪造测试**：`table_name` = 已注册 ODS 表，`target_layer` = "DWD"，`operation` = DROP/REPLACE → **必须拒绝**（验证不信任入参 layer）
6. **全 Schema `extra="forbid"` 元测试**：`test_all_warehouse_write_schemas_forbid_extra`
7. **`extra="forbid"` 422 抽样测试**（4 类）：传入 `raw_sql` / `chart_config` / `ucp_secret` → 422
8. **CREATE 物理表冲突测试**：物理表存在但 `registered_tables` 缺失 → CREATE 拒绝
9. **TRUNCATE 破坏性处理测试**：TRUNCATE ODS → 按 DROP/REPLACE 同级拒绝
10. **CREATE OR REPLACE 覆盖 ODS 测试**：registered ODS 表 + `CREATE OR REPLACE` + `target_layer="DWD"` → 拒绝
11. **ADS 空字段发布测试**：`output_fields` 为空 → 400
12. **ADS API/push 敏感字段发布测试**：含 `is_sensitive=True` + `targets` 含 api → 400
13. **ADS API/push 权限摘要缺失测试**：`computed is not True` → 400
14. **血缘 metadata 写入测试**：`definition_id` / `rule_ids` / `version` 非空

---

## 七、仍然不做（定论，不再争论）

| 项目 | 理由 |
|------|------|
| 完整 SQL Builder DSL | `validate_ddl_operation` + `validate_identifier` + 白名单已覆盖所有 DDL 风险 |
| 独立 Quality Gate 系统 | 嵌入式校验（P0-3）已实现不可绕过的阻断，不建新概念 |
| 重型 ADS Consumer Contract | `owner` + `consume_domain` + `refresh_semantics` + `version` 足够当前阶段 |
| `breaking_change_flag` / `deprecation_note` | 等有多于一个消费者时再做 |
| 权限传播快照表 | 权限摘要 JSON（P0-4）覆盖，不建新表 |
| 统一 `warehouse_runs` 表 | API 聚合 VIEW 足够，先不建新表 |
| 统一 Trace ID | 等出现异步/分布式链路时再做 |
| 独立应用化 / 多租户 / UCP 防腐层 | 无需求 |
| AI 自动化生成与发布 | 治理未闭环前不谈 |

---

## 八、验收标准

P0 闭环不以文档接受为准，以以下条件全部满足为准：

1. [ ] `layer_policy.py` 存在，`validate_ddl_operation` / `validate_layer_transition` / `assert_not_ods_write` 通过测试
2. [ ] 全部 23 个 R 章写入 Request Schema 通过元测试 `extra="forbid"`
3. [ ] 13 个 pytest 全部通过
4. [ ] `publish_ads` 中：空字段→400 / 敏感字段→400 / `computed is not True`→400 全部可验证
5. [ ] DDL 破坏性操作通过真实 `registered_tables` 校验，不信任入参 `target_layer`
6. [ ] CREATE OR REPLACE 按 REPLACE 处理，不被当作 CREATE 绕过
7. [ ] 权限摘要 `computed` 字段不可伪造；计算失败不降级为 `computed: true`
8. [ ] 前端 `npm build` 零 error / 零 warning
9. [ ] Docker 运行 + API 可达
10. [ ] `router import OK` + `pytest 全量`

---

# 第九章：信息架构与菜单重组专项

## 9.1 总体评估

### 9.1.1 核心诊断

当前系统存在三个结构性信息架构问题：

**问题一：资产目录割裂**

`RegisteredTable`（物理表）和 `DataSet`（逻辑模型/数据集）分属两套目录：
- `数据资产页` → `listAssets()` → 查 `RegisteredTable`
- `数据建模页` → `listModels()` → 查 `DataSet`

后果：DWD 标准单表数据集在建模页可见，在资产页不可见。用户困惑："这不是资产吗？为什么不在数据资产里？"

**问题二：消费入口散落**

"来源与开放"Tab 在资产详情页中混合了"入仓来源"（数据怎么来的）和"出仓开放"（数据怎么被消费）。ODS 表 `published` 后会显示"BI/报表消费：可查询"，无视分层消费红线。

**问题三：菜单按技术层拆分，不按用户任务拆分**

"数据加工"挂在"数据建模"下，用户理解为"加工是建模的一部分"——实际上加工（ODS→DWD）是建模（DWD→模型）的前置步骤。

### 9.1.2 设计原则

| 原则 | 说明 |
|------|------|
| 按用户工作任务拆菜单 | 清洗、建模、服务是三个不同任务，不混在一个菜单下 |
| 生产链路 vs 消费链路分离 | 清洗+建模=生产；API+推送+订阅=消费 |
| 统一资产目录 | RegisteredTable / DataSet / Metric / AdsDefinition 都是资产 |
| 分层消费红线 | ODS 禁止消费；DWD 受控；DWS 推荐；ADS 标准 |

### 9.1.3 数据仓库专家评估

**同意方向**。ODS → DWD → DWS → ADS 分层链是数仓标准实践。当前代码中 ODS 表可被直接建模、ODS 可显示为"可查询"是两个真实的治理漏洞。

**但需注意**：DWD 层允许消费不等于鼓励消费。DWD 是标准明细层，适合 HRBP 工作台/权限系统读取员工主数据；但面向报表/BI/看板应优先推荐 DWS/ADS。

**RegisteredTable 与 DataSet 割裂**是当前最深层的架构问题。统一资产目录需要抽象 `Asset` 基类、`source_type` 字段，属于 P1 架构重构。当前阶段先通过在资产页加 Tab 来缓解，不做底层统一。

### 9.1.4 交互专家评估

**菜单拆分**对非技术用户（HRBP/薪酬运营/数据分析人员）有真实价值。当前 Tab 栏虽然提供视觉分离，但"数据加工"挂在"数据建模"菜单下会持续制造"加工是建模子步骤"的误解。

**资产详情页的消费状态**应从"可操作"降级为"只读展示 + 跳转入口"。用户不应在资产详情页直接配置 API/推送——这是"数据服务"模块的职责。资产详情页的角色是"发现资产"→ 跳转"创建数据服务"。

**目标表输入框**对普通用户是认知负担。用户的任务是"配置清洗规则"，不是"给物理表起名"。系统应自动推导目标表名，高级模式才允许管理员覆盖。

## 9.2 最终菜单结构

```
数据仓库
├─ 数据资产
│   ├─ 表格资产          RegisteredTable
│   ├─ 模型资产          DataSet
│   ├─ 指标资产          WarehouseMetric       ← P1
│   └─ 消费资产          AdsDefinition          ← P1
├─ 数据清洗              ODS → DWD
├─ 数据建模              DWD → 模型/DWS
│   ├─ 模型设计
│   ├─ 维度管理
│   ├─ 汇总视图
│   ├─ 快照管理
│   └─ 拉链管理
├─ 指标管理              指标口径/指标结果
├─ 数据服务              DWD/DWS/指标/ADS → 消费
│   ├─ 消费资产           ← 当前可用
│   ├─ API 服务           ← 规划中
│   ├─ 数据推送           ← 规划中
│   ├─ 订阅管理           ← 规划中
│   └─ 服务监控           ← 规划中
├─ 数据治理              质量/血缘/执行监控
│   ├─ 数据质量
│   ├─ 数据血缘
│   └─ 执行监控           ← 生产侧
└─ 影响分析
```

**菜单 vs 旧名对照**：

| 旧名 | 新名 | 说明 |
|------|------|------|
| 数据加工 | 数据清洗 | 独立菜单 |
| 数据建模（Tab） | 模型设计 | 更精确表达"设计模型" |
| SCD 拉链 / 历史拉链 | 拉链管理 | 统一 |
| ADS 消费资产 | 消费资产 | 移入数据服务 |

## 9.3 消费规则

### 9.3.1 分层消费红线

| 层级 | 消费规则 | 说明 |
|------|----------|------|
| ODS | **禁止消费** | 原始层，未经清洗/脱敏 |
| DWD | **受控消费** | 标准明细，需字段脱敏+行级权限+访问审计 |
| DWS | **推荐消费** | 汇总层，适合报表/API/指标 |
| ADS | **标准消费** | 面向消费场景封装，最安全 |

### 9.3.2 数据服务允许接入的层级

| 来源层 | 是否可服务化 | 条件 |
|--------|-------------|------|
| ODS | 禁止 | — |
| DWD | 受控允许 | 必须脱敏、权限、审计、调用方登记 |
| DWS | 推荐 | 汇总数据，适合 API/推送 |
| ADS | 最推荐 | 标准消费层 |
| 指标结果 | 推荐 | 适合 API、推送、订阅 |
| 模型结果 | 允许 | 需确认权限和刷新策略 |

### 9.3.3 资产详情页按分层差异化

| 层级 | 页面展示 |
|------|----------|
| ODS | 入仓来源、同步记录、血缘、**去清洗**（跳转数据清洗）。不显示消费/API/推送入口 |
| DWD | 入仓来源、血缘、**创建数据服务**（跳转数据服务）。提示：需配置脱敏和权限 |
| DWS | 创建 API 服务、创建推送任务、创建消费资产（均跳转数据服务） |
| ADS | 管理消费服务、查看服务监控（跳转数据服务） |

## 9.4 原子任务清单

> **注意**：`seed.py` 中 `warehouse.cleaning`、`warehouse.service` 菜单项已存在；`menuRoutes.ts` 路由映射已存在；`/warehouse/data-recipe`、`/warehouse/service` 路由已存在。以下任务只涉及页面层改造，不涉及菜单/路由新建。

### P0a：治理红线（必须先做，预计 1.5 天）

> 这些是分层治理的底线约束，前端过滤 + 后端校验双保险。

#### P0a-1：数据清洗入口只允许 ODS

- 前端：`WarehouseDataRecipe.vue` → `listAssets({ warehouse_layer: 'ODS' })`
- 后端：`execute_full` 校验 `source_table` 在 `registered_tables.warehouse_layer == "ODS"`，否则 400
- 验收：清洗下拉只有 ODS；API 传非 ODS 表名→400

#### P0a-2：数据建模所有入口只允许 DWD

- 前端（3 个文件）：`WarehouseModelingVisual.vue`、`WarehouseModelingQuick.vue`、`WarehouseModeling.vue`（快速关联）→ 全部 `listAssets({ warehouse_layer: 'DWD' })`
- 后端（统一校验函数）：`validate_model_sources_are_dwd()` → 检查所有 `DataSetTable.table_name` 对应 `RegisteredTable.warehouse_layer == "DWD"`
- 接入端点：`create_model` / `update_model` / `publish_model` / `copy_model` / 快速建模
- 不满足 → 400：`数据建模只能使用 DWD 标准表，请先完成数据清洗`
- 验收：建模所有入口下拉只有 DWD；API 传 ODS 表→400

#### P0a-3：清洗目标表后端安全兜底

- 后端 `execute_full`：
  - 普通模式：前端不传 `target_table` 或传空，后端根据 `ods_xxx` 自动推导 `dwd_xxx`
  - 高级模式（管理员）：可传自定义 `target_table`，后端校验：
    - `dwd_` 前缀
    - 非 `ods_`/`dws_`/`ads_` 前缀
    - 走 `validate_ddl_operation` 完整 DDL 安全链
- 前端：普通用户不显示目标表输入框，只读展示"将发布为 DWD 标准表 / `dwd_xxx`"
- 验收：API 直接传 `target_table=ods_xxx` → 400

#### P0a-4：ODS 禁止消费（前端 + 后端）

- 前端 `WarehouseAssetDetail.vue`：
  - "来源与开放"Tab → "来源与服务"
  - ODS：不显示 `PushTargetList` 组件，不显示消费状态卡片，改为"去清洗"链接
  - DWD/DWS/ADS：不直接嵌入 `PushTargetList`，改为"创建数据服务"跳转按钮
- 后端（新建校验端点或中间件）：
  - 创建推送/API/订阅/消费资产时，校验 `source_layer != "ODS"`，否则 400
- 验收：ODS 详情页无推送组件；API 对 ODS 创建推送→400

#### P0a-5：过渡期旧模型处理

- 新建模型：禁止 ODS 输入（P0a-2 覆盖）
- 已有 ODS 模型：
  - 可查看、不可发布（`publish_model` 拒绝已含 ODS 输入的模型）
  - 编辑时不可新增 ODS 表关联
  - 保存时提示"该模型包含 ODS 原始表，请迁移到 DWD 标准表"
  - 管理员可临时豁免发布（标记 `raw_model=true`，记录审计日志）
- 验收：旧 ODS 模型发布被 400 拒绝；管理员豁免后可发布

#### P0a-6：自动化测试

| 测试 | 预期 |
|------|------|
| ODS 表创建模型 | 400 |
| DWD 表创建模型 | 成功 |
| 旧 ODS 模型发布 | 400 |
| 管理员豁免后发布 ODS 模型 | 成功 + `raw_model=true` |
| 清洗 `target_table` 非 `dwd_` 前缀 | 400 |
| ODS 创建推送/API/消费资产 | 400 |
| DWD 创建推送但无权限摘要 | 按规则 400 |
| 建模快速入口传 ODS 表 | 400 |

### P0b：轻量信息架构调整（预计 0.5 天）

> 菜单/路由基础已有，只需调整页面 Tab 和文案。治理红线通过后再做。

#### P0b-1：数据建模 Tab 调整

- 文件：`WarehouseModeling.vue`
- 移除"数据加工"Tab（已独立为数据清洗菜单）
- Tab 最终：`模型设计 | 维度管理 | 汇总视图 | 快照管理 | 拉链管理`
- 验收：建模页只有 5 个 Tab

#### P0b-2：数据资产页增加资产类型 Tab

- 文件：`WarehouseAssets.vue`
- 新增 Tab 栏：`表格资产`（复用 `listAssets()`）、`模型资产`（新增 `listModels()`）
- **不建底层统一资产表**。只是 UI 层并列展示 `RegisteredTable` 和 `DataSet`
- "模型资产"Tab 复用数据建模页已有的模型列表渲染逻辑
- 指标资产、消费资产放 P1
- 验收：切换 Tab 看到表资产和模型资产两套列表

#### P0b-3：资产详情页消费展示修正

- 文件：`WarehouseAssetDetail.vue`
- "来源与开放"Tab → "来源与服务"
- ODS：不渲染 `PushTargetList`，不显示 API/推送入口
- DWD/DWS/ADS：消费状态卡片按层级差异化展示，提供"创建数据服务"跳转按钮（P0 仅支持 `source_type=table`）
- 验收：ODS 详情页无推送组件、无"可查询"标识

#### P0b-4："消费资产"命名说明

- 数据资产 > 消费资产（P1）：资产目录视角，查看有哪些 ADS/消费资产
- 数据服务 > 消费资产（已存在）：服务配置视角，创建、发布、授权、监控
- 文档需注明两者区别，避免用户困惑

### P1：数据服务统一（预计 2.5 天）

> P1 的目标不是“再建一套推送功能”，而是把现有 `PushTarget`、ADS 发布、未来 API/订阅能力统一到数据服务视角下。报表推送也纳入统一管理，但保留报表页快捷入口。

#### P1-C1：统一 AssetRef / ServiceSourceRef

- 后端：定义 `AssetRef` 或 `ServiceSourceRef(source_type, source_id, source_label)`，支持 `table / dataset / metric / ads / report`
- 兼容现状：当前 `PushTarget.source_table` 仍保留；`report:{id}` 作为旧兼容格式识别为 `source_type=report`
- 禁止：继续新增 `source_table` 字符串魔法来表达新资产类型
- 验收：数据服务可统一识别表格资产、模型资产、指标资产、消费资产、报表来源

#### P1-C2：改造 PushTargetList 支持多类型来源

- 当前：`sourceTable: string`，实际已经混用了普通表名和 `report:{id}`
- 改为：`sourceType: 'table' | 'dataset' | 'metric' | 'ads' | 'report'` + `sourceId: string | number`，内部再转换为后端兼容 source
- 报表兼容：`sourceType='report'` 时仍复用 `collect_report_push_rows()`、`get_report_push_columns()` 和报表编辑权限校验
- 验收：从表资产、报表、建模、指标、ADS 跳转后能正确配置推送，不把 dataset/metric/ads/report ID 误当表名

#### P1-C3：数据服务扩展为统一消费服务台

- 新增/补齐 Tab：消费资产、API 服务、数据推送、订阅管理、服务监控
- 数据推送 Tab 聚合展示所有 `PushTarget`：
  - 表格资产推送：`source_type=table`
  - 报表推送：`source_type=report` 或旧格式 `source_table=report:{id}`
  - ADS/指标/模型推送：等 AssetRef 接入后展示
- 支持按来源类型、状态、推送方式筛选
- 验收：用户可在数据服务看到全部推送服务，而不是只能在报表/资产详情/数据源页面分散查找

#### P1-C4：报表推送纳入数据服务治理，但保留报表快捷入口

- 报表设计器 `ReportDesigner.vue` 的推送 Tab 保留，定位为“当前报表推送快捷配置”
- 报表列表 `ReportList.vue` 的“推送”按钮保留，定位为“立即执行当前报表推送”
- 新增“在数据服务中统一管理”链接，跳转 `/warehouse/service?source_type=report&source_id={report_id}`
- 数据服务侧展示报表推送时，必须沿用报表权限：仅报表创建人/可编辑人可配置和执行
- 验收：报表用户原工作流不被破坏，同时数据服务可统一监控报表推送

#### P1-C5：数据服务权限归口

- ADS 端点权限：`require_op("warehouse.modeling", ...)` → `require_op("warehouse.service", ...)`
- PushTarget 非报表推送权限：从不合理的 `system.users` 归口到 `warehouse.service`
- 报表推送权限：`warehouse.service` 管服务台入口，叠加 `report.list` 与报表可编辑校验
- 验收：数据服务相关配置不再依赖 `system.users` 权限；报表推送不绕过报表权限

#### P1-C6：数据资产补齐四类 Tab

- 文件：`WarehouseAssets.vue`
- 在 P0b-2 基础上新增：指标资产（`listMetrics()`）、消费资产（`GET /ads-definitions`）
- 验收：`表格资产 / 模型资产 / 指标资产 / 消费资产` 四个 Tab 完整展示

#### P1-C7：UCP / DataSource / 数据服务边界强化

- 数据仓库资产详情只保存并展示 UCP 桥接 ID 和摘要状态，不编辑 UCP 凭证、连接器、Pipeline
- 数据服务只处理仓内资产和报表的出仓消费，不承接 UCP 的外部连接配置
- 资产详情页拆分展示：
  - 数据连接摘要：UCP 资源、DataSource 入仓来源、同步记录、跳转 UCP/DataSource
  - 数据服务摘要：API/推送/订阅/消费资产状态、跳转数据服务
- 验收：用户能清楚区分“数据怎么进来”和“数据怎么出去”

## 9.5 验收标准

| # | 标准 | 验证方式 |
|---|------|----------|
| 1 | 数据清洗页只显示 ODS 表 | 打开清洗页，下拉只有 ODS |
| 2 | 数据建模页只显示 DWD 表 | 打开建模页，下拉只有 DWD |
| 3 | 后端拒绝 ODS 表创建模型 | POST 含 ODS 表 → 400 |
| 4 | 数据资产页有表格资产/模型资产两个 Tab | 打开资产页，Tab 可切换 |
| 5 | ODS 资产详情显示"禁止消费" | 打开 ODS 资产详情，"来源与服务"显示红色禁止 |
| 6 | DWD 资产详情显示"受控消费" | 打开 DWD 资产详情，显示橙色受控 |
| 7 | 清洗页不显示目标表输入框 | 普通用户看不到物理表名输入 |
| 8 | 所有建模入口（含快速关联）只显示 DWD | 逐个入口验证 |
| 9 | 前端 `npm build` 零 error | CI 验证 |
| 10 | 后端 `pytest` 全量通过 | CI 验证 |

## 9.6 统一"创建数据服务"入口

### 9.6.1 约束：P0 只支持 table 类型

**现有 `PushTargetList.vue` 接口是 `sourceTable: string`，只认表名**。在 P1 完成 `AssetRef` 改造前，不能假装支持 `dataset / metric / ads`。

因此 P0 的"创建数据服务"入口：
- **支持**：`source_type=table`，传表名（如 `dwd_employee`）
- **不支持**：`source_type=dataset / metric / ads / report`（传 ID 会被当表名使用，造成错误；现有报表推送使用特殊 `source_table=report:{id}` 兼容格式，不等同于 AssetRef）

数据清洗产出的是 DWD 物理表 → 可以用 `source_type=table`。
数据建模产出的是 DataSet（ID）→ P0 暂不跳转，P1 改造 `PushTargetList` 后再接。报表推送短期保留在报表模块内作为快捷入口，P1 再进入数据服务统一管理。

### 9.6.2 实现方案

在各接入点（只限输出为物理表的场景）使用 `<el-button>` + `router.push` 跳转：

```typescript
function goCreateService(sourceTable: string, sourceLabel?: string) {
  const query: Record<string, string> = { source_type: 'table', source_id: sourceTable }
  if (sourceLabel) query.source_label = sourceLabel
  router.push({ path: '/warehouse/service', query })
}
```

```html
<el-button type="primary" :icon="Share" @click="goCreateService('dwd_employee', '员工标准表')">
  创建数据服务
</el-button>
```

数据服务页接收参数后，嵌入现有 `PushTargetList`：

```vue
<PushTargetList v-if="pushSourceTable" :source-table="pushSourceTable" />
```

### 9.6.3 P0 接入点（仅 table 类型）

| 入口 | 文件 | 触发时机 | source_id |
|------|------|----------|-----------|
| 数据清洗完成 | `WarehouseDataRecipe.vue` | `executeStandardization` 成功 | `target_table`（DWD 物理表名） |
| 数据资产详情 | `WarehouseAssetDetail.vue` | `warehouse_layer !== 'ODS'` 时 | `asset.table_name` |
| 新建资产弹窗 | 已有推送组件处 | 追加"全量管理"链接 | `router.push('/warehouse/service')` |

### 9.6.4 P1 扩展（等 AssetRef 改造后）

| 入口 | source_type | 说明 |
|------|-------------|------|
| 数据建模发布 | `dataset` | `PushTargetList` 改造后支持 |
| ADS 发布 | `ads` | 同上 |
| 指标计算完成 | `metric` | 同上 |
| 报表推送管理 | `report` | 数据服务统一展示和配置报表推送；报表页保留快捷入口 |

**P0 不做**：数据建模发布后、ADS 发布后、指标计算后、报表推送统一管理的跳转按钮。等 `PushTargetList` 改造为支持多类型后再接入；报表模块内现有推送入口短期保留。

## 9.7 报表推送与数据服务整合

### 9.7.1 当前代码事实

当前报表管理已存在推送能力，且复用的是同一个 `PushTargetList.vue`：

- `ReportDesigner.vue`：通过 `reportPushSourceTable` 调用 `<PushTargetList :source-table="report:{id}" />`
- `ReportList.vue`：提供“推送”按钮，触发报表推送执行
- `push_service.py`：通过 `is_report_source(source_table)` 识别 `report:{id}`，并调用 `collect_report_push_rows()` 读取报表结果
- `push_router.py`：报表推送有专门权限校验 `_ensure_report_push_editable()`

这说明 `PushTarget.source_table` 当前已经不是真正的“表名”字段，而是兼容了“表名 / 报表来源”的消费源标识。

### 9.7.2 整合原则

报表推送属于数据服务的统一消费服务体系，但短期不能强迁移：

| 项目 | 判断 | 理由 |
|------|------|------|
| 报表设计器推送 Tab | 保留 | 当前用户在设计报表时配置当前报表推送，路径合理 |
| 报表列表“推送”按钮 | 保留 | 这是立即执行当前报表推送的快捷操作 |
| 数据服务统一管理报表推送 | P1 做 | 需要 AssetRef/SourceRef 改造后才能避免 `report:{id}` 字符串继续扩散 |
| 报表推送权限 | 必须保留报表校验 | 报表有创建人、可见性、可编辑权限，不能被数据服务权限单独绕过 |

最终定位：

```text
报表管理：负责报表设计、运行、权限和当前报表推送快捷操作。
数据服务：负责统一管理所有对外消费服务，包括表推送、报表推送、ADS 推送、API 服务、订阅和服务监控。
```

### 9.7.3 分阶段任务

#### P0：保留现状，只补边界文案

- 报表设计器推送配置不迁移
- 报表列表推送按钮不迁移
- 在报表推送区域增加说明：`当前为报表推送快捷配置；后续可在数据服务中统一管理全部推送`
- 不把 `report:{id}` 接入 9.6 的 P0 `source_type=table` 跳转

#### P1：数据服务聚合报表推送

- 数据服务“数据推送”Tab 聚合 `PushTarget`
- 识别旧格式：`source_table.startswith("report:")` → `source_type=report`
- 支持筛选：表格资产 / 报表 / ADS / 指标 / 模型
- 从报表页跳转：`/warehouse/service?source_type=report&source_id={report_id}`
- 权限：数据服务入口权限 + 报表可编辑权限双校验

#### P2：PushTarget 来源模型重构

- 新增或迁移字段：`source_type`、`source_id`、`source_label`
- `source_table` 保留兼容期，只作为旧数据迁移字段
- 禁止后续新增 `report:{id}`、`dataset:{id}`、`metric:{id}` 这类字符串协议

## 9.8 UCP / DataSource / 数据服务边界

### 9.8.1 边界结论

结合 `atomic-tasks.md` 中 A0106、H00、R00 的约束，边界必须保持：

```text
UCP / DataSource：外部系统 → ODS，负责连接、凭证、连接测试、采集、Pipeline、同步。
数据仓库：ODS → DWD → DWS → ADS，负责清洗、建模、汇总、质量、血缘、影响分析。
数据服务：DWD/DWS/ADS/指标/报表 → 外部消费，负责 API、推送、订阅、服务监控。
```

一句话：**UCP 管数据怎么进来，数据仓库管数据怎么生产，数据服务管数据怎么出去。**

### 9.8.2 模块职责表

| 模块 | 负责 | 不负责 |
|------|------|--------|
| UCP / DataSource | 外部连接、凭证、连接测试、资源发现、采集配置、Pipeline、入仓同步 | 仓内建模、ADS 发布、出仓 API/推送 |
| 数据仓库 | 分层加工、清洗、建模、汇总、快照、拉链、质量、血缘、影响分析 | 外部连接器、凭证明文、跨系统 Pipeline |
| 数据服务 | 仓内资产和报表的 API、推送、订阅、服务监控 | 外部数据采集、连接器配置、UCP Pipeline |

### 9.8.3 与现有代码的落地关系

当前代码已有桥接基础：

- `RegisteredTable` 已有 `ucp_system_id`、`ucp_resource_id`、`ucp_connector_config_id`
- `warehouse/ucp_adapter.py` 只返回 UCP 摘要和跳转信息，UCP 不可用时降级
- `WarehouseAssetDetail.vue` 已有“数据连接”Tab 和 UCP 跳转
- `get_asset_endpoints()` 已聚合 DataSource 拉取、PushTarget 推送、API expose、UCP resource 摘要

但页面职责需要收敛：

```text
资产详情页：展示连接/服务摘要 + 跳转入口。
UCP/DataSource 页面：配置入仓连接。
数据服务页面：配置出仓消费。
```

### 9.8.4 交互调整建议

资产详情页建议分为两个摘要区：

1. **数据连接摘要**
   - UCP 资源摘要
   - DataSource 入仓来源
   - 同步记录
   - 跳转：前往 UCP / 配置入仓来源

2. **数据服务摘要**
   - API 服务数量
   - 推送目标数量
   - 订阅数量
   - 服务监控状态
   - ODS：显示“禁止消费，请先去数据清洗”
   - DWD/DWS/ADS：显示“创建数据服务”

禁止在资产详情页继续扩展完整连接器配置或完整推送配置；资产详情页只做发现、摘要和跳转。

### 9.8.5 验收标准补充

| # | 标准 | 验证方式 |
|---|------|----------|
| 11 | 报表推送入口保留且文案说明其为快捷配置 | 打开报表设计器推送 Tab |
| 12 | 数据服务 P1 能聚合展示 `report:{id}` 推送 | 数据服务推送 Tab 查看报表推送来源 |
| 13 | 报表推送仍受报表可编辑权限约束 | 非创建人/无编辑权限配置报表推送 → 403 |
| 14 | UCP 页面不被数据服务替代 | 数据服务无连接器、凭证、Pipeline 配置入口 |
| 15 | 资产详情页区分数据连接与数据服务 | 详情页可分别跳转 UCP/DataSource 和数据服务 |
| 16 | UCP 不可用时数据仓库不崩溃 | `ucp.enabled=false`，页面显示降级提示 |

## 9.9 数据服务详细开发规格（给开发模型的统一口径）

> 本节用于消除歧义：后续任何模型/开发者实现“数据服务”时，必须按这里的功能边界、页面结构、参数协议和验收标准开发。不得把 UCP 连接、数据仓库生产任务、报表设计能力混入数据服务。

### 9.9.0 核心建设目标：一次开发平台能力，后续前端配置服务实例

数据服务不是“每来一个业务需求就写一个 API / 推送脚本 / 订阅脚本”的开发模式，而是**一次开发配置化服务平台**。

必须遵循：

```text
开发人员开发平台能力：
API 服务配置平台 / 数据推送配置平台 / 订阅管理平台 / 服务监控平台

业务用户创建服务实例：
选择来源资产 → 选择字段 → 配置权限 → 配置触发/频率/格式 → 发布/启用
```

因此：

| 场景 | 是否需要写代码 | 正确方式 |
|------|----------------|----------|
| 新增一个员工汇总 API | 不需要 | 用户在“API 服务”Tab 新建配置 |
| 新增一个薪酬报表推送 | 不需要 | 用户在“数据推送”Tab 新建配置 |
| 新增一个每周订阅 | 不需要 | 用户在“订阅管理”Tab 新建配置 |
| 新增一种推送渠道，如企业微信 | 需要 | 开发一次渠道适配器，之后用户配置 |
| 新增一种认证方式，如外部 Token 签名 | 需要 | 开发一次认证插件，之后用户配置 |
| 新增复杂专用算法 | 视情况 | 平台规则无法表达时才写代码 |

验收底线：
- 新建普通 API 服务不需要新增后端 router 代码。
- 新建普通推送任务不需要新增定制脚本。
- 新建普通订阅不需要新增定时任务代码。
- 后续新增服务实例必须可以通过前端表单配置完成。
- 只有新增“平台不支持的能力类型”（新渠道、新认证、新执行器、新复杂算子）才允许开发代码。

### 9.9.1 数据服务页面最终 Tab 与职责

| Tab | 功能定位 | P0/P1 | 主要操作 | 不允许做 |
|-----|----------|-------|----------|----------|
| 消费资产 | 管理 ADS/消费资产定义、字段裁剪、权限继承、发布状态 | 当前已有，P0 保留 | 新建/编辑/发布/下线消费资产；查看权限摘要 | 不配置外部连接；不做报表设计 |
| API 服务 | 把 DWD/DWS/ADS/指标/报表封装为查询 API | P1 | 创建 API、选择来源、字段白名单、权限策略、限流、启停、复制 URL | 不允许 ODS；不保存 UCP 凭证 |
| 数据推送 | 统一管理所有 PushTarget，包括表、报表、ADS、指标、模型推送 | P1 | 新建推送、编辑目标、试运行、启停、查看最近执行 | 不在资产详情页内嵌完整推送配置 |
| 订阅管理 | 管理人/群/系统对资产或报表的订阅关系 | P1 | 新建订阅、设置频率、接收人、格式、退订、暂停 | 不负责数据生产调度 |
| 服务监控 | 监控消费链路：API 调用、推送执行、订阅分发、失败告警 | P1 | 查看调用量、成功率、失败原因、重试、跳转服务详情 | 不替代数据治理 > 执行监控 |

### 9.9.2 数据服务与数据治理监控的区别

| 模块 | 监控对象 | 典型事件 | 用户问题 |
|------|----------|----------|----------|
| 数据治理 > 执行监控 | 生产链路：ODS→DWD→DWS→ADS | 清洗执行、建模发布、快照、拉链、质量规则、血缘写入 | “这张表/模型有没有生产成功？” |
| 数据服务 > 服务监控 | 消费链路：API/推送/订阅/消费资产发布 | API 调用、推送发送、订阅分发、服务下线、调用失败 | “这个服务有没有被调用/推送成功？” |

硬约束：
- 生产任务失败只进入“数据治理 > 执行监控”。
- API/推送/订阅失败只进入“数据服务 > 服务监控”。
- 如果一个推送依赖的 DWD/DWS 生产失败，服务监控只展示“上游不可用”，并跳转到治理执行监控查看生产失败原因。

### 9.9.3 统一来源协议 ServiceSourceRef

P1 开始，数据服务所有功能必须使用统一来源协议，禁止继续扩散 `source_table` 字符串魔法。

```typescript
type ServiceSourceType = 'table' | 'dataset' | 'metric' | 'ads' | 'report'

interface ServiceSourceRef {
  source_type: ServiceSourceType
  source_id: string | number
  source_label?: string
  source_layer?: 'DWD' | 'DWS' | 'ADS' | 'METRIC' | 'REPORT'
}
```

兼容规则：
- P0 仅支持 `source_type='table'`，`source_id` 为 DWD/DWS/ADS 物理表名。
- 旧报表推送 `source_table='report:{id}'` 仅作为兼容读取，不允许新增此类字符串协议。
- P1 后新建推送/API/订阅必须保存 `source_type/source_id/source_label`。

### 9.9.4 API 服务功能要求

#### 页面 UI

位置：`/warehouse/service` → `API 服务` Tab。

列表区字段：
- API 名称
- 来源类型：表格资产 / 模型资产 / 指标资产 / 消费资产 / 报表
- 来源名称
- 来源层级：DWD / DWS / ADS / 指标 / 报表
- 状态：草稿 / 已启用 / 已停用 / 异常
- 鉴权方式：登录态 / Token / 内部系统
- 今日调用量
- 最近调用时间
- 操作：详情、启用/停用、复制地址、查看监控、删除

新建/编辑抽屉字段：
- 基本信息：API 名称、描述、负责人
- 来源选择：`ServiceSourceRef`
- 字段配置：返回字段白名单、字段别名、字段脱敏状态
- 查询条件：允许过滤字段、默认排序、分页上限
- 权限策略：可调用角色/用户/系统、行级权限继承策略
- 安全策略：限流、超时时间、是否允许导出
- 发布设置：是否启用、有效期

#### 后端硬约束

- `source_type='table'` 时，来源层级不能是 ODS。
- DWD 来源必须有权限摘要，且敏感字段必须脱敏或被排除。
- API 返回字段必须来自字段白名单，不能返回 `*`。
- 请求 Schema 必须 `extra="forbid"`。
- 创建/启用 API 必须写审计日志。

#### 验收

| 场景 | 预期 |
|------|------|
| 用 ODS 创建 API | 400 |
| DWD 含未脱敏高敏字段创建 API | 400 |
| API 字段白名单为空 | 400 |
| 非授权用户调用 API | 403 |
| API 调用成功 | 服务监控出现调用记录 |

### 9.9.5 数据推送功能要求

#### 页面 UI

位置：`/warehouse/service` → `数据推送` Tab。

列表区字段：
- 推送名称
- 来源类型
- 来源名称
- 推送目标：飞书 / 邮件 / Webhook / 文件 / 其他
- 触发方式：手动 / 定时 / 事件
- 状态：启用 / 停用 / 异常
- 最近执行结果
- 最近执行时间
- 操作：执行一次、编辑、启停、查看日志、删除

新建/编辑抽屉字段：
- 来源选择：`ServiceSourceRef`
- 推送目标配置：目标类型、目标地址、接收人/群、Webhook URL 等
- 数据范围：字段选择、过滤条件、条数上限
- 格式：JSON / CSV / Excel / Markdown
- 调度：手动 / cron / 上游完成后触发
- 权限：沿用来源权限、附加接收人校验

#### 与报表推送的关系

- 报表设计器推送 Tab 保留，定位为“当前报表快捷配置”。
- 数据服务“数据推送”Tab 是统一管理台，P1 聚合展示报表推送。
- 报表推送权限必须叠加报表可编辑权限，不能只看 `warehouse.service` 权限。

#### 验收

| 场景 | 预期 |
|------|------|
| ODS 创建推送 | 400 |
| 报表推送在报表页配置 | 成功，保留旧流程 |
| 报表推送在数据服务展示 | P1 成功展示，来源类型为 report |
| 无报表编辑权限配置报表推送 | 403 |
| 推送执行失败 | 服务监控记录失败原因 |

### 9.9.6 订阅管理功能要求

#### 页面 UI

位置：`/warehouse/service` → `订阅管理` Tab。

列表区字段：
- 订阅名称
- 订阅来源
- 接收对象：个人 / 群 / 系统
- 频率：每天 / 每周 / 每月 / 事件触发
- 格式：消息 / 文件 / 链接 / API 回调
- 状态：启用 / 暂停 / 过期
- 最近发送时间
- 操作：暂停/恢复、编辑、退订、查看日志

新建/编辑抽屉字段：
- 来源选择：`ServiceSourceRef`
- 接收人/群/系统
- 订阅频率
- 推送格式
- 字段范围
- 权限确认：订阅接收人必须有来源访问权限，或通过审批授权

#### 后端硬约束

- ODS 禁止订阅。
- 订阅接收人必须通过权限校验。
- 订阅执行日志进入服务监控。

### 9.9.7 服务监控功能要求

#### 页面 UI

位置：`/warehouse/service` → `服务监控` Tab。

顶部指标卡：
- 今日 API 调用量
- 今日推送次数
- 今日订阅分发次数
- 失败数
- 异常服务数

列表区字段：
- 时间
- 服务类型：API / 推送 / 订阅 / 消费资产发布
- 服务名称
- 来源类型/名称
- 执行结果：成功 / 失败 / 部分成功
- 耗时
- 操作人/调用方
- 错误摘要
- 操作：查看详情、重试、跳转上游生产监控

筛选：
- 时间范围
- 服务类型
- 状态
- 来源类型
- 服务名称
- 调用方/执行人

#### 与执行监控联动

- 服务失败原因是“上游数据未生产/过期”时，展示“查看生产执行”跳转。
- 不在服务监控中重跑 ODS/DWD/DWS 生产任务。

### 9.9.8 数据服务开发清单

#### P0：只做入口与红线

| 编号 | 任务 | 文件/模块 | 验收 |
|------|------|-----------|------|
| DS-P0-1 | 数据服务页接收 `source_type=table&source_id=表名` | `WarehouseService.vue` | DWD 表可跳转到数据服务 |
| DS-P0-2 | ODS 禁止创建推送/API/消费资产 | 后端 Push/API/ADS 相关端点 | ODS 请求 400 |
| DS-P0-3 | 资产详情页只显示跳转，不内嵌完整推送配置 | `WarehouseAssetDetail.vue` | DWD/DWS/ADS 显示“创建数据服务” |
| DS-P0-4 | 报表推送保留原入口并增加边界说明 | `ReportDesigner.vue` / `ReportList.vue` | 用户知道后续可统一管理 |

#### P1：统一服务台

| 编号 | 任务 | 文件/模块 | 验收 |
|------|------|-----------|------|
| DS-P1-1 | 新增 `ServiceSourceRef` 数据结构 | 后端 schema/model/migration | 支持 table/dataset/metric/ads/report |
| DS-P1-2 | 改造 `PushTargetList` 支持多来源 | `PushTargetList.vue` + push API | 不再误把 report/dataset 当表名 |
| DS-P1-3 | 数据服务补齐 5 个 Tab | `WarehouseService.vue` | 消费资产/API服务/数据推送/订阅管理/服务监控 |
| DS-P1-4 | 数据推送 Tab 聚合 PushTarget | 前后端 | 可查看表和报表推送 |
| DS-P1-5 | API 服务 CRUD | 新增 API service/router/vue | API 可创建、启停、调用、监控 |
| DS-P1-6 | 订阅管理 CRUD | 新增 subscription service/router/vue | 订阅可创建、暂停、执行 |
| DS-P1-7 | 服务监控日志 | service_run 或统一 log 表 | API/推送/订阅均有日志 |
| DS-P1-8 | 权限归口到 `warehouse.service` | seed.py / router 权限 | 不再依赖 `system.users` |

### 9.9.9 交互入口统一规则

| 来源页面 | 入口文案 | 跳转 | P0/P1 |
|----------|----------|------|-------|
| ODS 资产详情 | 去数据清洗 | `/warehouse/data-recipe?source_table=ods_xxx` | P0 |
| DWD/DWS/ADS 表资产详情 | 创建数据服务 | `/warehouse/service?source_type=table&source_id=表名` | P0 |
| 数据清洗执行完成 | 创建数据服务 | `/warehouse/service?source_type=table&source_id=dwd_xxx` | P0 |
| 模型资产详情 | 创建数据服务 | `/warehouse/service?source_type=dataset&source_id={id}` | P1 |
| 指标资产详情 | 创建数据服务 | `/warehouse/service?source_type=metric&source_id={id}` | P1 |
| 消费资产详情 | 管理服务 | `/warehouse/service?source_type=ads&source_id={id}` | P1 |
| 报表设计器推送 Tab | 在数据服务中统一管理 | `/warehouse/service?source_type=report&source_id={id}` | P1 |

### 9.9.10 开发禁止项

- 禁止在 ODS 资产上创建 API、推送、订阅、消费资产。
- 禁止在资产详情页继续扩展完整 API/推送/订阅配置表单。
- 禁止把 UCP 凭证、连接器配置、Pipeline 配置放入数据服务。
- 禁止新增 `report:{id}`、`dataset:{id}`、`metric:{id}` 字符串协议。
- 禁止 API 服务默认返回全字段或未脱敏敏感字段。
- 禁止服务监控触发生产链路重跑；只能跳转到治理执行监控。

### 9.9.11 组件复用与高复用开发要求

> 数据服务不是为 API、推送、订阅分别重写三套表单。必须把现有推送能力和通用配置能力组件化复用，形成“配置服务台”。

#### 当前必须复用的现有能力

| 现有能力/组件 | 当前用途 | 新规划中的复用方式 |
|---------------|----------|--------------------|
| `PushTargetList.vue` | 表/报表推送配置与展示 | P0 在数据服务中直接嵌入；P1 改造为多来源推送配置组件 |
| `push_service.py` | 推送执行、报表推送数据采集 | P1 继续作为数据推送执行器，不另写一套推送执行链 |
| `push_router.py` | 推送 CRUD、执行、权限校验 | P1 扩展支持 `ServiceSourceRef`，不新增平行推送 router |
| `collect_report_push_rows()` / `get_report_push_columns()` | 报表推送取数 | 报表来源继续复用，不在数据服务重写报表取数 |
| `_ensure_report_push_editable()` | 报表推送权限 | 数据服务展示/执行报表推送时必须继续叠加该权限校验 |

#### 必须抽取的通用前端组件

P1 开发 API 服务、数据推送、订阅管理时，优先抽取通用组件，不允许复制三套相似表单。

| 通用组件 | 被哪些功能复用 | 职责 |
|----------|----------------|------|
| `ServiceSourcePicker` | API 服务 / 数据推送 / 订阅管理 | 选择 `table/dataset/metric/ads/report` 来源，封装 ODS 禁止逻辑 |
| `ServiceFieldSelector` | API 服务 / 数据推送 / 订阅管理 | 字段白名单、别名、脱敏状态、字段顺序 |
| `PermissionPolicyEditor` | API 服务 / 数据推送 / 订阅管理 / 消费资产 | 调用方、接收方、角色、行级权限、权限继承摘要 |
| `ScheduleEditor` | 数据推送 / 订阅管理 | 手动、定时、事件触发、cron 配置 |
| `DeliveryTargetEditor` | 数据推送 / 订阅管理 | 飞书、邮件、Webhook、文件等目标配置 |
| `ServiceRunLogPanel` | API 服务 / 数据推送 / 订阅管理 / 服务监控 | 最近执行、失败原因、重试入口、跳转监控 |
| `ServiceStatusBadge` | 所有数据服务列表 | 草稿、启用、停用、异常、下线状态展示 |

#### API 服务如何复用推送能力

API 服务本身不复用 `PushTargetList.vue` 作为 UI，因为 API 配置和推送目标配置不是同一类表单；但 API 服务必须复用以下“通用配置组件”和“服务运行能力”：

- 复用 `ServiceSourcePicker`：来源选择逻辑与推送/订阅一致。
- 复用 `ServiceFieldSelector`：字段白名单、脱敏字段展示与推送/订阅一致。
- 复用 `PermissionPolicyEditor`：权限继承、调用方授权与推送接收方授权使用同一套权限摘要逻辑。
- 复用 `ServiceRunLogPanel`：API 调用日志与推送执行日志在服务监控中统一展示。
- 复用统一 `ServiceSourceRef`：API、推送、订阅不能各自定义来源字段。

因此：

```text
PushTargetList 复用方向：
P0：数据服务内嵌现有 PushTargetList，先承接 table 推送。
P1：把 PushTargetList 拆成“推送业务容器 + 通用子组件”，API/订阅复用通用子组件，数据推送继续复用推送容器。
```

#### 开发验收

| 验收项 | 标准 |
|--------|------|
| 组件复用 | API 服务、数据推送、订阅管理不得各自复制来源选择、字段选择、权限配置表单 |
| 推送复用 | 数据服务的数据推送能力必须复用/改造现有 `PushTargetList.vue`、`push_service.py`、`push_router.py` |
| 报表复用 | 报表推送必须继续复用现有报表取数和权限校验，不得在数据服务重写 |
| 来源统一 | API/推送/订阅统一使用 `ServiceSourceRef` |
| 日志统一 | API 调用、推送执行、订阅分发统一进入 `ServiceRunLogPanel` / 服务监控 |

## 9.10 不做项

| 项目 | 理由 |
|------|------|
| 底层统一 RegisteredTable + DataSet 为一张资产表 | P1 架构重构，涉及 migration + API 变更 |
| 数据服务 API/推送/订阅/监控完整实现 | P1，先有菜单结构和 table-only 入口，再逐步统一 PushTarget/AssetRef |
| 资产详情页改为通用多类型详情 | P1，等统一资产标识后 |
| 在各资产创建流程中内嵌推送配置组件 | 创建和消费是不同任务，推送统一走数据服务模块 |
