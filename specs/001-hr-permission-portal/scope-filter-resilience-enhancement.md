# 数据权限引擎容错增强 & 多维度数据集权限驱动优化

**Feature Branch**: `001-hr-permission-portal`
**Created**: 2026-08-04
**Status**: Draft
**关联 Spec**: 001-hr-permission-portal — T057 scope_filter.py

> **评审结论（2026-09-20）**：背景问题成立，但原方案不可直接上线。本文将“缺配置导致误杀”和“报表权限口径冲突”拆分处理：缺配置不再默认无条件跳过，`scope_dimension` 不作为数据集级强制权限开关；优先复用已有 `report.scope_strategy → dataset.scope_strategy → registered_table.scope_strategy` 优先级，并以表级安全分类决定缺配置表的处理方式。本文下方的实现、任务和验收标准均以本结论为准。

---

## 1. 背景与目标

### 背景

HR 报表中台的数据权限引擎（`scope_filter.py + sql_builder.py`）在生成报表 SQL 时，会对数据集内 JOIN 的**每一张表**独立注入权限过滤子句（WHERE scope filter）。如果某张表缺配置（没有声明 `scope_role` 字段，也没有配置 `roster_join_col` 穿透列），权限引擎返回 `false()`——等价于 `WHERE 1=0`，将整个报表结果集抹零。

**生产环境真实案例**：

gaby.liu（用户 id=4）查看"月度成本入账表 - 副本"（report id=17），该报表基于数据集 `ds_dwd_cost_allocation`（id=15），通过 INNER JOIN 关联了 6 张表：

| 表 | scope_strategy | scope_role 配置 | roster_join_col | 权限结果 |
|---|---|---|---|---|
| `dwd_emp_monthly_salary` | `person_first` | `salary_code → org_node_code` ✅ | — | ✅ 正常过滤 |
| `dwd_emp_monthly_allocation` | `cc_first` | `code → cc_code` ✅ | — | ✅ 正常过滤 |
| `dwd_cost_center_monthly` | `cc_first` | **未配置** | **未配置** | ❌ `false()` |
| `dwd_emp_year_end_bonus` | `cross_filter` | **未配置** | **未配置** | ❌ `false()` |
| `dwd_emp_severance_installment` | `cross_filter` | **未配置** | **未配置** | ❌ `false()` |
| `dwd_annual_bonus_estimate_factor` | `cross_filter` | **未配置** | **未配置** | ❌ `false()` |

最终生成的 SQL 等价于：

```sql
SELECT ...
FROM dwd_emp_monthly_salary salary
  INNER JOIN dwd_cost_center_monthly cc ON ...
  INNER JOIN dwd_emp_year_end_bonus bonus ON ...
  ...
WHERE salary.salary_code IN ('RootOrg', 'DSKY01', ...)  -- 主表权限 ✅
  AND (1=0)  -- cost_center_monthly 的 false() ❌
  AND (1=0)  -- emp_year_end_bonus 的 false() ❌
  ...
```

**6 张表中 4 张返回 `false()` → 全报表 0 行。** gaby.liu 明明有 org 维度权限、salary_code 配置也正确，但报表始终显示"没有数据匹配当前筛选条件"。

**全表扫描发现**（production，24 张有 scope_strategy 的表）：

| 类别 | 数量 | 示例表 |
|---|---|---|
| 正确配置（有 scope_role 或 roster_join_col）| 5 张 | `dwd_emp_monthly_allocation`、`emp_monthly_salary` |
| person_first / cc_first 但缺配置 | 6 张 | `dwd_emp_monthly_salary`（之前缺 roster_join_col）、`dwd_cost_center_monthly` |
| cross_filter 但缺配置 | 14 张 | `dwd_emp_year_end_bonus`、各类 `dwd_*` / `ods_*` 维表 |

此外，当同一个数据集同时 JOIN 了 org 维度的表（如 emp_realtime_roster）和 cc 维度的表（如 cost_center_monthly），当前 AND 逻辑会要求用户**同时对两张表都有权限**。例如：用户 A 虽然有权看成本中心 123 的数据，但因为小王不在他的 org 范围内，roster 表返回 `false()` → 同样空结果。

### 目标

1. **区分两类故障**：分别处理“权限元数据缺失导致 `false()` 清空结果”和“报表人员/组织权限与成本中心权限口径不匹配”，不得用一个开关覆盖两类问题。
2. **安全容错**：缺少权限配置的表不得默认无条件跳过；主事实表、敏感事实表和权限穿透桥接表缺配置时继续 fail-closed，仅明确标记为公共维表的表允许跳过。
3. **报表级权限口径**：复用已有 `scope_strategy`，明确 `person_first`、`cc_first`、`cross_filter` 的语义和优先级，避免用数据集级单一维度覆盖多个报表。
4. **别名级权限注入**：报表中的每个 alias 必须有可审计的权限处理结果；权限条件必须同时应用于数据查询、计数、导出、推送等出口。
5. **可观测性**：配置缺失、策略冲突、公共维表跳过和最终裁决结果都输出结构化日志，并能定位到 dataset、report、alias 和 table。
6. **向后兼容**：已有报表在未声明新策略时，沿用当前策略优先级；不通过默认值把原有安全边界放宽。

### 非目标 / 不做范围

- 不改变权限标签、角色、管理单元的配置逻辑
- 不把 `scope_dimension` 作为数据集级强制权限开关；如保留该字段，仅作为迁移期兼容字段或默认提示，不得覆盖报表级策略
- 不把 JOIN 条件视为权限边界；JOIN 只能参与业务关联，不能替代行级权限过滤
- 不允许通过缺配置自动推断 `employee_no` 或其他穿透列
- 不实现新的数据集 RBAC/ACL；继续复用现有数据集访问控制
- 不在本期重构所有报表 SQL，但必须补齐 LEFT/RIGHT/FULL JOIN 和敏感字段场景的安全测试

---

## 2. 用户场景

### 场景 1：HR 用户查看 JOIN 了多张表的报表（P1 — 核心场景）

**角色**：HR 业务用户（如 gaby.liu）

**前置条件**：
- 用户绑定了 org 维度标签（含 RootOrg 及全部子节点）
- 数据集 JOIN 了 6 张表，其中 salary 表已配 scope_role，其余 4 张没配

**操作流程**：
1. 用户进入"报表管理"，点击"月度成本入账表 - 副本"
2. 系统按报表/数据集/表级优先级解析最终权限策略
3. 系统扫描 6 张 JOIN 表：必需事实表和敏感事实表无法解析时拒绝，不得静默跳过；明确登记的公共维表才允许跳过
4. salary 表、allocation 表按各自策略正常注入 org/cc 权限

**成功结果**：在所有必需表配置完整且策略明确的前提下，用户看到授权范围内的数据；不能以固定 625 行作为唯一验收标准。

**异常/警告表现**：后端日志输出结构化 ERROR/WARNING，包含 report、dataset、alias、table、strategy、classification 和 decision。

**修改前行为**：某个缺配置 alias 返回 `false()`，导致整个报表被无条件抹零。

---

### 场景 2：管理员维护报表权限策略（P2）

**角色**：系统管理员

**前置条件**：数据集含 org 维度表和 cc 维度表，且被多个报表复用。

**操作流程**：
1. 管理员进入“报表设置 → 报表管理”，编辑目标报表。
2. 选择 `person_first`、`cc_first` 或 `cross_filter`，或选择继承数据集策略。
3. 系统展示引用 alias、表级安全分类、缺配置项和受影响字段。
4. 保存前校验策略与表分类；策略变更写入审计日志。

**成功结果**：不同报表可以在同一数据集上使用不同权限口径，不通过数据集级单一 `org/cc` 开关覆盖所有报表。

---

### 场景 3：所有表都忘了配置权限 → 底线防护（P1）

**角色**：任意用户

**前置条件**：数据集所有 JOIN 表都没有配置 scope_role，也没有 roster_join_col

**操作流程**：
1. 用户尝试查看该报表
2. 系统扫描所有表，全部无法解析
3. 触发兜底逻辑 → 注入 `false()`

**失败表现**：返回"没有数据匹配当前筛选条件"

**安全意义**：即使管理员忘记配置所有表，也不会发生数据裸奔

---

### 场景 4：后端启动 → 自动扫描告警（P2）

**角色**：运维/开发人员

**前置条件**：production 数据库中有表配置了 scope_strategy 但没配 scope_role

**操作流程**：
1. 后端容器启动
2. 启动流程中调用 `warn_unresolvable_tables(db)`
3. 扫描 `registered_tables`，发现 20 张配置不完整的表

**系统反馈**：日志输出 20 条 WARNING，每条注明表名和策略：
```
WARNING 表 'dwd_cost_center_monthly' 策略 'cc_first' 无 scope_role 列且无 roster_join_col，权限过滤将无法生效
WARNING 表 'dwd_emp_year_end_bonus' 策略 'cross_filter' 无 scope_role 列且无 roster_join_col，权限过滤将无法生效
...
```

---

## 3. 功能范围

| 功能项 | 是否本期实现 | 说明 |
|---|---|---|
| 缺配置表按安全分类处理 | ✅ 是 | 必需/敏感/桥接表 fail-closed，明确公共维表才允许跳过 |
| 报表级策略优先级统一 | ✅ 是 | report > dataset > registered_table > 默认策略 |
| `cross_filter` 语义固定 | ✅ 是 | 组织权限 AND 成本中心权限 |
| 表级安全分类与健康度 | ✅ 是 | 未分类表默认按 required_fact |
| alias 级权限裁决和结构化日志 | ✅ 是 | 覆盖查询、计数、导出、推送 |
| 启动扫描未配置表 | ✅ 是 | 告警和治理指标，不改变运行时裁决 |
| 旧 `scope_dimension` 兼容读取 | ✅ 是 | 不作为强制数据集级权限开关 |
| 自动检测 employee_no 并穿透 | ❌ 不做 | 不同表列名不同，仍需显式配置 |
| 数据集级别 RBAC/ACL | ❌ 不做 | 独立需求 |

---

## 4. 技术设计

### 4.1 数据库 / 数据模型

#### 4.1.1 权限策略模型调整

本期不新增 `datasets.scope_dimension` 作为强制裁决字段。系统复用已有策略字段，并采用以下优先级：

```text
report.scope_strategy
    > dataset.scope_strategy
    > registered_table.scope_strategy
    > 系统默认策略
```

策略语义固定为：

| 策略 | 语义 |
|---|---|
| `person_first` | 仅使用人员/组织权限；适用于花名册、工资、人员明细 |
| `cc_first` | 仅使用成本中心权限；适用于成本分摊、项目投入、成本中心报表 |
| `cross_filter` | 人员/组织权限 AND 成本中心权限；仅用于业务上明确要求交集的报表 |
| `public_dim` | 仅允许明确标记的公共维表跳过行级权限，不得用于事实表 |

`scope_dimension` 如已存在于迁移草稿或数据库中，仅作为兼容读取/迁移提示，不得覆盖报表级 `scope_strategy`，也不得据此无条件跳过某类表。

#### 4.1.2 表级安全分类

为避免“缺配置即跳过”造成权限放宽，表需要明确安全分类：

| 分类 | 缺少 `scope_role` / `roster_join_col` 时的处理 |
|---|---|
| `required_fact` | fail-closed，返回拒绝，不允许跳过 |
| `sensitive_fact` | fail-closed，并输出高优先级告警 |
| `passthrough_bridge` | fail-closed，必须补齐显式穿透配置 |
| `public_dim` | 允许跳过，但记录审计，且禁止选择敏感字段作为结果主数据 |

没有分类的现有表按 `required_fact` 处理，确保迁移期间不放宽权限。

---

---

### 4.2 后端接口

#### 4.2.1 报表/数据集策略透传与校验

已有 `report.scope_strategy`、`dataset.scope_strategy` 和 `registered_table.scope_strategy` 均必须按统一优先级读取。新增或调整策略时：

- 仅允许 `person_first`、`cc_first`、`cross_filter`、`public_dim`；未知值返回 422。
- `public_dim` 只能用于已标记为 `public_dim` 的表，不能用于报表主事实表。
- 报表策略变更必须检查其引用表的安全分类和敏感字段，并记录审计日志。
- 数据集编辑页展示“继承策略/显式策略”和受影响表清单，不提供会覆盖所有报表的单一 `org/cc` 开关。
- 若数据库中已有 `scope_dimension`，API 保留读取兼容，但新接口不得用它覆盖 `report.scope_strategy`。

---

---

#### 4.2.2 报表运行接口 — 权限注入逻辑调整（内部）

| 接口 | 改动 |
|---|---|
| `POST /api/v1/reports/{id}/run` | 后端逻辑调整，接口签名不变 |

**行为变化**：
- 请求参数不变
- 返回数据结构不变
- 仅生成的 SQL WHERE 子句发生变化（不再含来自不可解析表的 `false()`）

---

#### 4.2.3 启动扫描 — Startup Event

**无新增接口**。在 FastAPI `lifespan` 事件中调用 `warn_unresolvable_tables(db)`，扫描完成后输出日志，不阻塞启动。

---

### 4.3 业务逻辑

#### 4.3.1 核心调整：按报表策略和表级安全分类注入权限

权限注入循环必须先解析最终策略，再判断表的安全分类和配置状态：

```python
final_strategy = resolve_scope_strategy(
    report_strategy=report.scope_strategy,
    dataset_strategy=dataset.scope_strategy,
    table_strategy=registered_table.scope_strategy,
)

for alias in used_aliases:
    table = alias_to_table[alias]
    strategy = strategy_for_alias(final_strategy, table)
    classification = table_scope_classification(table)
    resolvable = await can_resolve_scope_strategy(table, strategy, db)

    if not resolvable:
        if classification in {"required_fact", "sensitive_fact", "passthrough_bridge"}:
            logger.error("权限配置缺失，拒绝表 %s alias=%s", table, alias)
            stmt = stmt.where(false())
            count_stmt = count_stmt.where(false())
            decision = "DENIED_UNRESOLVABLE"
        elif classification == "public_dim":
            logger.warning("公共维表跳过行级权限 table=%s alias=%s", table, alias)
            decision = "SKIPPED_PUBLIC_DIM"
        else:
            stmt = stmt.where(false())
            count_stmt = count_stmt.where(false())
            decision = "DENIED_UNKNOWN_CLASSIFICATION"
        record_scope_decision(report, dataset, alias, table, strategy, decision)
        continue

    clause = await build_scope_filter(user, table, db, strategy=strategy)
    clause2 = await _rebuild_scope_filter_for_alias(
        user, table, aliased_models[alias], db, strategy=strategy
    )
    if clause2 is None:
        stmt = stmt.where(false())
        count_stmt = count_stmt.where(false())
        decision = "DENIED_NO_EFFECTIVE_CLAUSE"
    elif not is_unrestricted(clause):
        stmt = stmt.where(clause2)
        count_stmt = count_stmt.where(clause2)
        decision = "RESOLVED_RESTRICTED"
    else:
        decision = "RESOLVED_UNRESTRICTED"
    record_scope_decision(report, dataset, alias, table, strategy, decision)
```

关键约束：

- `can_resolve_scope_strategy()` 只表示“元数据具备解析条件”，不能单独作为放行依据。
- `cross_filter` 必须明确执行组织权限 AND 成本中心权限，不得映射为“任意维度”或自动跳过。
- `stmt`、`count_stmt`、导出和推送必须复用同一组已裁决的权限条件。
- 缺配置表只有在显式 `public_dim` 分类下才能跳过；JOIN 条件不能替代权限过滤。
- 不再使用 `any_strategy_resolved` 作为全局安全兜底。每个 alias 都必须产生明确的 `decision`，任何必需表拒绝时整体拒绝。

#### 4.3.2 新增辅助函数：`resolve_scope_strategy()`

```python
def resolve_scope_strategy(
    report_strategy: str | None,
    dataset_strategy: str | None,
    table_strategy: str | None,
) -> str:
    """按报表 > 数据集 > 表级默认策略解析最终权限口径。"""
    return normalize_scope_strategy(
        report_strategy or dataset_strategy or table_strategy or DEFAULT_SCOPE_STRATEGY
    )
```

该函数只负责确定策略，不负责决定表是否可以跳过权限。表是否可跳过由独立的安全分类裁决。

#### 4.3.3 新增辅助函数：`record_scope_decision()`

每个 alias 必须记录结构化裁决结果，至少包括：

```text
report_id, dataset_id, alias, table_name,
resolved_strategy, classification, decision,
reason, user_id
```

日志级别约定：

- `ERROR`：required_fact / sensitive_fact / passthrough_bridge 缺配置或策略冲突
- `WARNING`：明确标记为 public_dim 的表被跳过
- `INFO`：正常注入限制条件

#### 4.3.4 启动扫描函数：`warn_unresolvable_tables`

启动扫描保留，但只作为治理告警，不能改变运行时裁决。扫描结果必须包含表级安全分类，并建议写入结构化指标；不应只输出无法关联到报表的单行 WARNING。



#### 4.3.4 调用入口

在 `backend/app/main.py` 的 lifespan 启动事件中（数据库 session 就绪后）调用：

```python
async with AsyncSessionLocal() as db:
    unresolved = await warn_unresolvable_tables(db)
    if unresolved:
        logger.warning(f"共 {len(unresolved)} 张表权限配置不完整")
```

#### 4.3.5 数据流图

```
用户请求报表
    │
    ▼
sql_builder.py 解析最终 scope_strategy
    │
    ├── 按 report > dataset > table 优先级确定策略
    ├── 遍历每个 alias
    │   ├── 读取表级安全分类
    │   ├── can_resolve_scope_strategy()?
    │   │   ├── NO + required/sensitive/bridge → DENIED + false()
    │   │   ├── NO + public_dim → WARNING + 明确跳过
    │   │   └── YES → build_scope_filter() → 注入 WHERE
    │   └── 记录结构化裁决结果
    │
    └── 任一必需 alias DENIED?
        ├── YES → 整体 fail-closed
        └── NO  → 返回带完整权限条件的查询
```

---

### 4.4 前端与 UI/交互

#### 4.4.1 报表编辑页 — 权限策略与影响范围

报表编辑页展示最终权限策略及其来源：

| 信息 | 展示内容 |
|---|---|
| 最终策略 | `person_first` / `cc_first` / `cross_filter` |
| 策略来源 | 报表显式配置 / 继承数据集 / 继承表默认 |
| 受影响 alias | 每个 alias 的表名、策略、安全分类、权限处理结果 |
| 风险提示 | 缺少权限配置、公共维表跳过、策略冲突 |

保存报表策略前，系统必须检查所有引用表：

- 主事实表或敏感事实表缺配置时阻止保存，或明确要求管理员确认并补齐配置。
- `public_dim` 只能用于已登记的公共维表。
- `cross_filter` 显示“组织权限 AND 成本中心权限”，不得显示为“全部维度”。

#### 4.4.2 数据集编辑页 — 继承策略与配置健康度

数据集编辑页不提供覆盖所有报表的 `org/cc` 单选开关。页面改为展示：

- 数据集默认 `scope_strategy`；
- 未显式配置策略的报表数量；
- 引用表的安全分类和权限配置健康度；
- 缺配置表清单及受影响报表；
- 明确提示：JOIN 条件不替代行级权限。

#### 4.4.3 数据集/报表列表 — 权限健康度标签

列表增加可选的“权限健康度”标签：

| 状态 | 含义 |
|---|---|
| 正常 | 所有必需表均可解析权限 |
| 待配置 | 存在缺少权限元数据的必需表 |
| 有风险 | 存在公共维表跳过或策略冲突 |
| 已阻断 | 运行时会 fail-closed |

---

---

### 4.5 权限、安全与外部系统

#### 4.5.1 安全边界

| 安全检查点 | 机制 |
|---|---|
| 必需事实表缺权限配置 | fail-closed，不允许跳过 |
| 敏感事实表缺权限配置 | fail-closed + ERROR 告警 |
| 权限穿透桥接表缺配置 | fail-closed，不依赖 JOIN 自然约束 |
| 明确的公共维表缺配置 | 允许跳过 + WARNING + 审计记录 |
| `cross_filter` | 明确执行组织权限 AND 成本中心权限 |
| LEFT/RIGHT/FULL JOIN | 每个敏感 alias 独立应用权限，不把 JOIN 当权限边界 |
| 策略冲突 | 保存时阻止或运行时 fail-closed |
| 查询与计数不一致 | 复用同一权限条件生成 `stmt` 和 `count_stmt` |

#### 4.5.2 潜在攻击面评估

**风险一：攻击者通过缺配置表绕过权限**

防护：默认分类为 `required_fact`；只有显式登记的 `public_dim` 才能跳过，且公共维表不得包含敏感结果字段。

**风险二：通过 LEFT JOIN 获取未授权附表数据**

防护：所有敏感事实表和桥接表仍必须注入权限条件；禁止以“主表已过滤”或“JOIN 条件自然约束”作为放行理由。

**风险三：通过修改报表策略扩大数据范围**

防护：策略变更需要报表编辑权限，保存前校验引用表分类和字段，写入审计日志；`public_dim` 不得用于事实表。

**风险四：`cross_filter` 被错误处理为单维度或无限制**

防护：统一策略解析函数和策略契约测试，禁止将 `cross_filter` 映射为 `any` 或自动跳过。

#### 4.5.3 不涉及

- 不涉及 UCP 或其他第三方系统
- 不改变敏感字段脱敏规则，但必须验证行级权限与字段脱敏同时生效
- 不引入字符串拼接生成权限 SQL，权限子句继续通过 SQLAlchemy 表达式构造


---

## 5. 原子任务清单

### 后端任务

- [ ] **T001** 确认并统一权限策略优先级
  - `report.scope_strategy > dataset.scope_strategy > registered_table.scope_strategy > 默认策略`
  - 明确 `person_first`、`cc_first`、`cross_filter`、`public_dim` 的语义
  - 禁止未知策略隐式降级为无限制

- [ ] **T002** 建立表级安全分类
  - 分类：`required_fact`、`sensitive_fact`、`passthrough_bridge`、`public_dim`
  - 未分类表默认按 `required_fact` 处理
  - `public_dim` 需要权限管理员配置并记录审计

- [ ] **T003** 重写报表权限注入循环
  - 按 alias 解析最终策略和安全分类
  - 必需表无法解析时 fail-closed
  - 只有明确的公共维表允许跳过
  - `stmt`、`count_stmt`、导出和推送复用同一权限条件

- [ ] **T004** 新增结构化权限裁决记录
  - 记录 report、dataset、alias、table、strategy、classification、decision、reason、user
  - 区分 `DENIED_UNRESOLVABLE`、`SKIPPED_PUBLIC_DIM`、`RESOLVED_RESTRICTED` 等状态

- [ ] **T005** 保留并改造启动扫描
  - 扫描结果包含安全分类和受影响资源
  - 启动扫描只产生告警和指标，不改变运行时授权裁决
  - 数据库不可用时不阻塞启动，但必须输出结构化 ERROR

- [ ] **T006** 处理已有 `scope_dimension` 兼容性
  - 若数据库已有该字段，保留读取兼容
  - 不允许它覆盖报表级 `scope_strategy`
  - 不新增以 `org/cc` 为数据集级强制开关的 migration

### 前端任务

- [ ] **T007** 报表编辑页展示权限策略
  - 支持显式选择 `person_first`、`cc_first`、`cross_filter`
  - 展示策略来源和最终生效策略
  - 保存前展示引用表、权限分类和风险提示

- [ ] **T008** 数据集编辑页展示继承策略和配置健康度
  - 不提供“非驱动维度跳过权限”的单选开关
  - 展示缺配置表、受影响报表和修复建议

- [ ] **T009** 数据集/报表列表展示权限健康度
  - `正常`、`待配置`、`有风险`、`已阻断`

### 测试与构建

- [ ] **T010** 策略解析单测
  - 覆盖报表、数据集、表级策略优先级
  - 覆盖未知策略、`cross_filter` 和 `public_dim`

- [ ] **T011** 权限注入单测
  - 单表/多表
  - 必需表缺配置
  - 敏感表缺配置
  - 公共维表缺配置
  - 用户无标签
  - org、cc、cross_filter 三种口径

- [ ] **T012** JOIN 安全集成测试
  - INNER/LEFT/RIGHT/FULL JOIN
  - 一对多和多对多 JOIN
  - 主表已过滤但敏感附表未配置
  - 验证不存在越权行和越权敏感字段

- [ ] **T013** 出口一致性测试
  - 报表运行、计数、导出、推送使用相同权限条件

- [ ] **T014** 构建和回归验证
  - 后端编译、单测、前端类型检查和构建
  - 已有报表无策略变更时的结果和权限边界不放宽

---

## 6. 测试计划

### 6.1 策略与配置测试

| 场景 | 期望 |
|---|---|
| report 显式配置策略 | 使用 report 策略 |
| report 未配置、dataset 已配置 | 使用 dataset 策略 |
| report/dataset 均未配置 | 使用 registered_table 或系统默认策略 |
| 未知策略 | API 返回 422，不得降级为无限制 |
| `cross_filter` | 明确执行组织权限 AND 成本中心权限 |
| `public_dim` 用于事实表 | 保存或运行时拒绝 |
| 未分类表 | 按 `required_fact` 处理 |

### 6.2 权限注入与安全测试

| 场景 | 期望 |
|---|---|
| 单表可解析 | 注入正确权限条件 |
| 必需事实表不可解析 | fail-closed，不允许跳过 |
| 敏感事实表不可解析 | fail-closed，并输出 ERROR |
| 穿透桥接表不可解析 | fail-closed |
| 明确公共维表不可解析 | 允许跳过，输出 WARNING 和审计记录 |
| 用户无权限标签 | 返回空集，不扩大范围 |
| `stmt` 与 `count_stmt` | 使用完全相同的权限条件 |

### 6.3 JOIN 安全测试

必须覆盖 INNER、LEFT、RIGHT、FULL JOIN，以及一对多、多对多 JOIN：

- 主表过滤正确但敏感附表缺配置时，不得返回附表越权数据。
- 公共维表被跳过时，不得通过维表字段暴露敏感结果。
- JOIN 条件变化不能替代行级权限条件。
- SELECT、聚合、排序和计算字段均不得绕过权限过滤。

### 6.4 出口一致性测试

运行、计数、导出、推送必须对同一 report/dataset/alias 使用相同的策略和权限条件。测试不仅验证“有数据”，还要验证结果行、聚合值和敏感字段均在授权范围内。

### 6.5 构建验证

```bash
cd backend && python -m py_compile $(find app -name '*.py')
pytest tests/test_sql_builder_scope.py -v
pytest tests/test_scope_filter_unit.py -v
pytest tests/test_integration_report_run.py -v
cd frontend && npx vue-tsc --noEmit
npx vite build
```

### 6.6 异常路径

| 异常 | 表现 |
|---|---|
| 策略非法 | API 返回 422 |
| 必需表权限配置缺失 | fail-closed，结构化 ERROR |
| 公共维表缺权限配置 | 跳过行级权限，结构化 WARNING + 审计 |
| 数据库不可用（启动扫描） | 不阻塞启动，输出 ERROR |
| 计数与查询权限条件不一致 | 测试失败，禁止上线 |

## 7. 验收标准

### 从用户角度

- [ ] 人员/组织报表按 `person_first` 返回授权范围内的数据。
- [ ] 成本中心报表按 `cc_first` 返回授权范围内的数据，不被无关组织权限误杀。
- [ ] 明确需要交集的报表按 `cross_filter` 执行组织权限 AND 成本中心权限。
- [ ] 权限配置缺失时，用户不会看到越权数据；必要时显示可识别的受保护空态或错误提示。
- [ ] 管理员可查看报表权限策略、继承来源、引用表和权限健康度。

### 从开发角度

- [ ] 已有策略优先级统一为 report > dataset > registered_table > 默认值。
- [ ] 缺配置表不会被默认无条件跳过。
- [ ] 未分类表按 `required_fact` 处理。
- [ ] 每个 alias 产生结构化权限裁决记录。
- [ ] 查询、计数、导出和推送复用相同权限条件。

### 从安全角度

- [ ] 必需事实表、敏感事实表、穿透桥接表缺配置时 fail-closed。
- [ ] LEFT/RIGHT/FULL JOIN 场景无越权行和越权敏感字段。
- [ ] `public_dim` 只能用于明确登记的公共维表。
- [ ] 策略变更受权限控制并写入审计日志。

### 从构建与回归角度

- [ ] 后端编译、前端类型检查和构建通过。
- [ ] 单元测试、JOIN 安全集成测试和出口一致性测试通过。
- [ ] 未声明新策略的既有报表权限边界不放宽。

## 8. 风险与兼容性

| 风险 | 等级 | 影响 | 应对方案 |
|---|---|---|---|
| 缺配置表直接跳过造成数据泄露 | P0 | 敏感事实表可能裸奔 | 默认 required_fact；只有 public_dim 可跳过 |
| 数据集级策略覆盖不同报表口径 | P0 | 报表范围错误或越权 | 使用 report > dataset > table 优先级 |
| LEFT/RIGHT/FULL JOIN 绕过权限 | P0 | 附表数据越权 | 每个敏感 alias 独立注入权限，不依赖 JOIN |
| cross_filter 被当作任意维度 | P1 | 组织/成本中心交集失效 | 固定定义为两维 AND，增加契约测试 |
| 启动扫描日志噪声 | P2 | 告警失真 | 结构化指标、去重和受影响报表关联 |
| 旧 `scope_dimension` 配置影响现有系统 | P1 | 策略行为不一致 | 兼容读取但不得覆盖报表级策略，迁移前盘点 |
| 计数、导出、推送与查询口径不一致 | P1 | 页面与导出数据不同 | 复用统一权限条件并做出口一致性测试 |

## 9. 待确认事项

1. 生产中每张 registered_table 的安全分类由谁维护，是否需要独立权限。
2. `public_dim` 的允许字段范围，以及是否禁止选择敏感字段作为报表主数据。
3. `report.scope_strategy`、`dataset.scope_strategy` 的现有数据质量和默认值。
4. 报表编辑、数据集编辑和表安全分类变更是否需要审计审批。
5. LEFT/RIGHT/FULL JOIN 当前产品是否允许继续创建；若允许，必须完成对应安全测试。
6. 生产报表 17 的正确验收口径应验证授权范围和结果语义，不以固定 625 行作为唯一标准。

## 10. 交付说明模板

### 完成任务

1. 权限策略优先级和策略契约统一。
2. 表级安全分类和缺配置处理完成。
3. alias 级权限注入、结构化裁决和启动扫描完成。
4. 报表策略与数据集权限健康度 UI 完成。
5. 单测、JOIN 安全集成测试、出口一致性测试和构建验证完成。

### 修改文件

以实际代码结构为准，至少包括：

- `backend/app/reports/sql_builder.py`
- `backend/app/permissions/scope_filter.py`
- 报表/数据集策略 Schema 与 Router
- 表级安全分类的数据模型和 migration
- `backend/app/main.py`
- 报表权限和数据集健康度相关前端组件
- 权限引擎、报表运行、导出、推送测试

### 未完成项

- 多维度权限的更复杂穿透关系不在本期自动推断；必须通过显式策略和显式穿透列配置。
- 生产中缺配置表的治理需要根据扫描结果逐表补齐，不能以运行时跳过替代配置修复。

### 后续建议

- 上线前完成 production 中缺配置表的安全分类和责任人确认。
- 上线后持续监控 `DENIED_UNRESOLVABLE`、`SKIPPED_PUBLIC_DIM` 和策略冲突指标。
- 如后续需要同时支持多个主维度，应新增明确的多维策略模型，不复用单选 `scope_dimension`。
