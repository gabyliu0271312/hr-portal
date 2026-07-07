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
