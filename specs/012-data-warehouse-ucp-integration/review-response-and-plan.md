
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