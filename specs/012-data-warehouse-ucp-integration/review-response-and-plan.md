# 对《Code Review 改进建议评估与开发计划》的二次强批判性评估（2026-07-07）

> 评估对象：本文档下方“对 Code Review 建议的回应与开发计划”。  
> 评估结论：该回应文档在“控制工程复杂度、避免过度平台化”方面有合理性，但整体对数据仓库类功能的风险判断偏乐观，部分“YAGNI”判断过早，存在把“当前团队小 / 消费者内部”误当作“治理要求可降低”的倾向。建议保留其轻量化原则，但必须调整优先级：**SQL/DDL 安全、分层策略、发布门禁、权限传播与可审计性不应被延后到平台化之后，而应作为轻量数仓上线的底线能力。**

---

## 一、总体批判性结论

回应文档的核心立场是：当前是 1 人 + AI、内部消费者、先跑起来，所以大量平台化建议应延后。这个立场有现实价值，但也有明显盲点：

1. **数据仓库风险不是由团队规模决定，而是由数据影响面决定。** 即使只有一个开发者，只要系统具备 DWD/DWS/ADS 发布、物化、SCD、调度、数据开放能力，就已经具备破坏下游报表口径、泄露敏感字段、误删/误覆盖数据的能力。
2. **“内部消费者”不等于低风险消费者。** HR 数据通常包含薪酬、组织、员工身份、绩效等敏感信息；内部 BI 报表一旦口径错误或权限继承错误，对业务决策和合规同样有影响。
3. **当前功能已不是单纯展示型资产目录，而是可写入、可发布、可物化的数据加工系统。** 因此不能只用“应用内模块”的治理标准评估。
4. **YAGNI 适用于功能扩展，不适用于安全底线。** SQL 安全、ODS 只读、防越权、审计可追溯属于底线，不应被归为过度设计。

因此，下方计划可以作为“轻量化改造草案”，但不宜直接作为最终执行计划。建议改为：**轻量实现，但不降低安全和治理底线。**

---

## 二、逐项再评估

### 1. Service 拆分：方向正确，但不应列为最高 P0

回应文档计划 P0 拆成 5 个 service 文件。这个方案比 14 个目录更实际，值得采纳。但其优先级需要下调：Service 拆分主要解决可维护性；SQL/DDL 安全、分层策略、权限传播错误会直接导致生产风险。

**修正建议：** Service 拆分可以做，但不应压过 SQL 安全和分层策略。若只能做一天，优先做安全收敛，而不是文件搬家。

### 2. SQL 安全层：回应文档明显低估风险

回应文档认为 `validate_identifier()` 足够，完整 SQL Builder 过度。这一判断不充分。

原因：

1. 代码中存在 `DROP TABLE`、`CREATE TABLE`、`ALTER TABLE`、`CREATE TABLE AS SELECT` 等高危 DDL。
2. 仅校验 identifier 不能表达“哪些层允许写、哪些层只读、哪些表名前缀可删除、哪些操作需要审计”。
3. DB 层 GRANT 只读保护有价值，但不能替代应用层校验；尤其当前应用很可能使用同一数据库账号访问多类 schema。
4. 若未来迁移 MySQL/PostgreSQL 或多 schema，分散拼接 SQL 会迅速变成维护风险。

**修正建议：** 不一定建设大型 SQL Builder，但必须建设轻量 SQL Guard：

```text
- validate_identifier(name)
- quote_identifier(name)
- assert_writable_layer(target_layer)
- assert_not_ods_write(target_table)
- assert_managed_table_prefix(target_table)
- safe_drop_managed_table(target_table)
- safe_create_materialized_table(...)
```

这不是过度设计，而是当前已有 DDL 能力的安全底座。

### 3. LayerPolicyService：不应以“规则少”为由延后

回应文档认为 4 层 × 3 操作规则少，不必抽象。这忽略了当前分层校验分散在多个链路中：标准化、物化、DWS 生成、ADS 发布、SCD、快照、调度重跑。问题不在规则数量，而在**规则分散导致绕过**。

**修正建议：** 不必建设复杂 service，但应至少提供统一函数：`validate_layer_transition(source_layer, target_layer, operation)`。所有生成/发布/物化 API 必须调用。

### 4. 自动血缘：采纳正确，但“只写 LineageEdge”可能不足

回应文档采纳自动血缘，这是正确的。但只写 source/target/operation/run_id 仍偏弱。数据仓库血缘至少需要支持产物版本、规则 ID、聚合定义 ID、ADS 定义 ID、字段映射摘要、操作人、运行记录 ID。

**修正建议：** 可以复用现有 lineage 表，但写入 payload/snapshot 字段或关联 audit log，避免只形成“有边但不可解释”的血缘。

### 5. Quality Gate：不应等多人协作后再做

回应文档认为质量门禁要等多人协作和审批流再做，这个判断偏晚。质量门禁的价值不是审批，而是防止明显错误数据发布，例如 DWD 输出主键为空、枚举映射后大量 unknown、DWS 聚合行数异常、ADS 发布包含未脱敏敏感字段、小样本维度被开放。

**修正建议：** 先做轻量门禁，不做复杂审批：`pass / warn / block`。先覆盖 ADS 发布、DWS 视图生成、DWD 执行三个关键点。

### 6. ADS Consumer Contract：完全不做的判断过激

回应文档认为 ADS Contract 面向外部付费消费者，内部 BI 不需要。这一判断不成立。内部 BI 同样需要字段语义稳定、schema 变更提醒、刷新语义、owner、下游引用、废弃说明，否则 ADS 会退化成“临时报表宽表”。

**修正建议：** 不做重型 SLA/付费契约，但应做轻量消费契约：`owner`、`consumer_type`、`refresh_semantics`、`field_schema_version`、`breaking_change_flag`、`deprecation_note`。

### 7. 产品红线：仅文档确认不够

回应文档认为红线已有文档声明、无需代码变更。这个结论过于乐观。红线必须有代码层保护，否则后续迭代容易突破。

**修正建议：** 增加红线测试：禁止任意 SQL 入参、禁止 warehouse API 接受 UCP 凭证/Pipeline 配置、禁止 ADS 保存 BI 图表布局。

### 8. 权限传播：只用递归查询不足以满足审计

回应文档认为权限继承应通过 SQL 递归查询，不做快照。这个方案在实时判断上可以，但在审计、回滚、解释上不足。发布当时的权限规则可能后续变化；ADS 消费者和 AI 解释需要可复现上下文。

**修正建议：** 不一定新建权限快照表，但发布记录中应保存权限裁剪摘要，例如 hidden_fields、masked_fields、sensitive_fields、inherit_strategy、source_assets。

### 9. 统一运行中心：API 聚合可接受，但需统一 Trace ID

回应文档选择 API UNION 聚合而非新表，短期可以接受。但若没有统一 run_id / trace_id，跨步骤链路会断：ODS 标准化 → DWD 视图 → DWS 聚合 → ADS 发布无法串起来。

**修正建议：** 暂不建 `warehouse_runs` 表可以，但每类 run 表应统一 `run_uid / trace_id / asset_code / operation / status / triggered_by / error_code` 等字段。

---

## 三、对当前开发计划的优先级修正建议

回应文档提出：P0 Service 拆分 + 自动血缘；P1 ODS DB 保护 + 运行记录聚合。

建议调整为：

### 必须 P0

1. SQL Guard 全量接入：所有 DDL/DML 动态表名、字段名、DROP/CREATE/ALTER 必须走统一安全函数。
2. ODS 只读双层保护：DB GRANT + 应用层禁止写 ODS。
3. 集中分层校验函数：所有生成、发布、物化调用同一校验入口。
4. 关键链路自动血缘：DWD、DWS、ADS、SCD、快照、指标计算至少写入可解释 lineage payload。
5. 红线测试：禁止任意 SQL、禁止 UCP 凭证/Pipeline 入参、禁止 BI 图表布局保存。

### 应列为 P1

1. Service 拆分为 5 个文件。
2. 运行记录 API 聚合。
3. ADS 轻量消费契约。
4. 权限传播摘要快照。
5. 轻量 Quality Gate。

### 可以暂缓

1. 完整 SQL Builder DSL。
2. 独立应用化目录大重构。
3. 多租户。
4. AI 自动发布。
5. 复杂审批流。

---

## 四、最终判断

下方回应文档有一个正确出发点：避免把当前 HR Portal 内嵌数据仓库过早建设成企业级大平台。但它的问题是把一些“安全底线能力”也归入了“平台化过度设计”。

更准确的原则应是：

> **功能可以轻量，安全不能轻量；平台化可以延后，治理底线不能延后。**

因此，建议不要直接按下方计划执行，而是先重排 P0：把 SQL/DDL 安全、ODS 只读、分层策略、红线测试、关键血缘放到最高优先级；Service 拆分从 P0 降到 P1。

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

## 五、最终结论

当前 R 章功能方向正确，已具备可演示、可试点的完整链路。
下一步不应继续快速扩功能，而应：

1. **P0**：Service 拆分 + 自动血缘（1 天）
2. **P1**：ODS DB 保护 + 运行记录聚合
3. **停止**：不建 SQL Builder、LayerPolicyService、Quality Gate、ADS Contract、权限快照、统一运行表

核心原则：**在正确的时机做正确的事。当前时机是让系统安全稳定跑起来。**

