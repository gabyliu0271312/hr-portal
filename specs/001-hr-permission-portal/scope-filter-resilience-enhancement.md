# 数据权限引擎容错增强 & 多维度数据集权限驱动优化

**Feature Branch**: `001-hr-permission-portal`
**Created**: 2026-08-04
**Status**: Draft
**关联 Spec**: 001-hr-permission-portal — T057 scope_filter.py

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

1. **容错**：表缺 `scope_role` 和 `roster_join_col` 配置时，不再注入 `false()` 杀整个报表，改为跳过该表的权限过滤 + WARNING 日志
2. **维度驱动**：数据集创建者可指定"权限维度"（org / cc），非驱动维度的 JOIN 表跳过权限注入
3. **底线兜底**：如果数据集内所有表都无法解析权限 → 仍然 `false()` fail-closed
4. **可观测性**：后端启动时自动扫描所有配置不完整的表，输出 WARNING 日志
5. **向后兼容**：现有报表默认行为不变（不指定驱动维度 = AND 模式）

### 非目标 / 不做范围

- 不改变权限标签、角色、管理单元的配置逻辑
- 不改变单表（无 JOIN）场景的现有行为
- 不实现"自动检测 employee_no 列并穿透"（因不同表列名不同，仍需手动配置）
- 不实现数据集级别的 RBAC/ACL（那是另一个需求）

---

## 2. 用户场景

### 场景 1：HR 用户查看 JOIN 了多张表的报表（P1 — 核心场景）

**角色**：HR 业务用户（如 gaby.liu）

**前置条件**：
- 用户绑定了 org 维度标签（含 RootOrg 及全部子节点）
- 数据集 JOIN 了 6 张表，其中 salary 表已配 scope_role，其余 4 张没配

**操作流程**：
1. 用户进入"报表管理"，点击"月度成本入账表 - 副本"
2. 系统加载报表，注入数据权限
3. 系统扫描 6 张 JOIN 表，识别出 4 张无法解析 → 跳过，不做权限注入
4. salary 表、allocation 表正常注入 org/cc 权限

**成功结果**：用户看到 salary 约束下的 625 行数据（与模拟 SQL 一致）

**异常/警告表现**：后端日志输出 WARNING：`表 'dwd_cost_center_monthly' 策略 'cc_first' 无法解析，跳过权限过滤`

**修改前行为**：看到"没有数据匹配当前筛选条件"（0 行）

---

### 场景 2：管理员设置数据集的权限驱动维度（P2）

**角色**：系统管理员

**前置条件**：数据集 `ds_dwd_cost_allocation` 含 org 维度表 + cc 维度表

**操作流程**：
1. 管理员进入"报表设置 → 数据集管理"，编辑 `ds_dwd_cost_allocation`
2. 在"权限维度"下拉中选择"org（组织维度驱动）"
3. 保存配置

**系统反馈**：
- org 维度的表（person_first 策略）正常注入权限
- cc 维度的表（cc_first 策略）跳过权限注入
- cross_filter 策略的表跳过权限注入

**成功结果**：用户只需要有 org 维度权限即可看到数据，不会被 cc 表拦截

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
| 不可解析的表跳过权限注入（替代 false()）| ✅ 是 | 核心修复 |
| 所有表都不可解析时 fail-closed 兜底 | ✅ 是 | 安全底线 |
| 数据集新增 `scope_dimension` 字段 | ✅ 是 | 支持 org/cc 维度驱动 |
| 权限注入时按 scope_dimension 跳过非驱动维度表 | ✅ 是 | 解决 org+cc 冲突 |
| 前端数据集编辑页加"权限驱动维度"下拉 | ✅ 是 | 配合后端字段 |
| 后端启动时扫描未配置表并 WARNING | ✅ 是 | 可观测性 |
| `can_resolve_scope_strategy` 复用 | ✅ 是 | 不新增判断函数 |
| 数据库 migration | ✅ 是 | datasets 表加字段 |
| 自动检测 employee_no 并穿透 | ❌ 不做 | 不同表列名不同，仍需显式配置 |
| 数据集级别 RBAC/ACL | ❌ 不做 | 独立需求 |

---

## 4. 技术设计

### 4.1 数据库 / 数据模型

#### 4.1.1 datasets 表新增字段

```sql
ALTER TABLE datasets ADD COLUMN scope_dimension VARCHAR(10) NULL;
COMMENT ON COLUMN datasets.scope_dimension IS '权限驱动维度：org=组织维度驱动, cc=成本中心维度驱动, NULL=全部维度AND模式';
```

**Migration 文件**：`alembic/versions/xxxx_add_scope_dimension_to_datasets.py`

**默认值**：`NULL`（兼容现有行为——所有维度 AND 匹配）

**回滚**：
```sql
ALTER TABLE datasets DROP COLUMN scope_dimension;
```

#### 4.1.2 ORM 模型

`backend/app/data/models.py` 中 `Dataset` 类新增：

```python
scope_dimension = Column(String(10), nullable=True, default=None)
```

**Schema 更新**：`backend/app/schemas/dataset.py` 中 DatasetRead / DatasetCreate / DatasetUpdate 均新增 `scope_dimension` 字段（Optional[str]）。

---

### 4.2 后端接口

#### 4.2.1 数据集 CRUD 接口 — scope_dimension 字段透传

| 接口 | 改动 |
|---|---|
| `GET /api/v1/datasets/{id}` | Response 新增 `scope_dimension: string \| null` |
| `POST /api/v1/datasets` | Request 新增可选 `scope_dimension` |
| `PUT /api/v1/datasets/{id}` | Request 新增可选 `scope_dimension` |
| `GET /api/v1/datasets` | 列表 Response 每条新增 `scope_dimension` |

**校验规则**：
- `scope_dimension` 可选，值仅允许 `null`、`"org"`、`"cc"`
- 非法值返回 422：`"scope_dimension 仅支持 null / 'org' / 'cc'"`

**不涉及新增路由**。

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

#### 4.3.1 核心调整：权限注入循环（sql_builder.py 第 1653-1682 行）

**当前逻辑**：

```python
for a in used_aliases:
    strategy = strategy_by_alias[a]
    # 仅当数据集级策略存在时才检查 can_resolve
    if resolved_scope_strategy and not await can_resolve_scope_strategy(
        alias_to_table[a], strategy, db
    ):
        continue
    # 否则直接调 build_scope_filter → 不能解析的表返回 false()
    clause = await build_scope_filter(user, alias_to_table[a], db, strategy=strategy)
    ...
# 仅当数据集级策略存在时才 fail-closed
if resolved_scope_strategy and not any_strategy_resolved:
    stmt = stmt.where(false())
```

**新逻辑**：

```python
dataset_scope_dimension = ds.scope_dimension  # 新增：从数据集配置读取

for a in used_aliases:
    table = alias_to_table[a]
    strategy = strategy_by_alias[a]

    # ---- 检查 1：这张表能不能解析权限？----
    if not await can_resolve_scope_strategy(table, strategy, db):
        logger.warning(f"表 '{table}' 策略 '{strategy}' 无 scope_role 列且无 roster_join_col，跳过权限过滤")
        continue

    # ---- 检查 2：维度是否匹配驱动维度？----
    if dataset_scope_dimension:
        table_dim = _strategy_to_dimension(strategy)  # person_first→"org", cc_first→"cc", cross_filter→"any"
        if table_dim not in (dataset_scope_dimension, "any"):
            # 非驱动维度 → 跳过，交由 JOIN 条件自然约束
            continue

    # ---- 能解析 + 维度匹配 → 正常注入权限 ----
    any_strategy_resolved = True
    clause = await build_scope_filter(user, table, db, strategy=strategy)
    if not is_unrestricted(clause):
        clause2 = await _rebuild_scope_filter_for_alias(...)
        if clause2 is not None:
            stmt = stmt.where(clause2)
            count_stmt = count_stmt.where(clause2)

# ---- 兜底：所有表均未注入任何权限 → fail-closed ----
# （去掉原来的 resolved_scope_strategy 前缀条件）
if not any_strategy_resolved:
    stmt = stmt.where(false())
    count_stmt = count_stmt.where(false())
```

#### 4.3.2 新增辅助函数：`_strategy_to_dimension`

```python
def _strategy_to_dimension(strategy: str) -> str:
    """将 scope_strategy 映射为权限维度标识"""
    mapping = {
        SCOPE_STRATEGY_PERSON_FIRST: "org",      # person_first → org 维度
        SCOPE_STRATEGY_CC_FIRST: "cc",           # cc_first → cc 维度
        SCOPE_STRATEGY_CROSS_FILTER: "any",      # cross_filter → 不限于单一维度
    }
    return mapping.get(normalize_scope_strategy(strategy), "any")
```

位置：`backend/app/permissions/scope_filter.py`，与现有策略常量同级。

#### 4.3.3 新增启动扫描函数：`warn_unresolvable_tables`

```python
import logging
logger = logging.getLogger(__name__)

async def warn_unresolvable_tables(db: AsyncSession) -> list[str]:
    """
    启动时扫描 registered_tables：strategy 非空但无 scope_role 列且无 roster_join_col → WARNING。
    返回未配置的表名列表，供日志/监控消费。
    """
    from app.data.models import RegisteredTable
    
    rows = (await db.execute(
        select(RegisteredTable.table_name, RegisteredTable.scope_strategy)
        .where(RegisteredTable.scope_strategy.isnot(None))
    )).all()
    
    unresolved = []
    for table_name, strategy in rows:
        strategy = normalize_scope_strategy(strategy)
        if not await can_resolve_scope_strategy(table_name, strategy, db):
            logger.warning(
                "表 '%s' 策略 '%s' 无 scope_role 列且无 roster_join_col，权限过滤将无法生效",
                table_name, strategy,
            )
            unresolved.append(table_name)
    return unresolved
```

位置：`backend/app/permissions/scope_filter.py`，在 `build_scope_filter` 函数之前。

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
sql_builder.py 生成 SQL
    │
    ├── 获取数据集 scope_dimension（新增字段）
    │
    ├── 遍历每张 JOIN 表
    │   ├── can_resolve_scope_strategy()?
    │   │   ├── NO → WARNING + continue（跳过）
    │   │   └── YES → 维度匹配 scope_dimension?
    │   │       ├── NO → continue（跳过，JOIN 约束）
    │   │       └── YES → build_scope_filter() → 注入 WHERE
    │   │
    │   └── any_strategy_resolved = True
    │
    └── any_strategy_resolved?
        ├── YES → 正常返回 WHERE 子句
        └── NO  → WHERE false()（fail-closed）
```

---

### 4.4 前端与 UI/交互

#### 4.4.1 数据集编辑页 — 新增"权限驱动维度"下拉

**页面路径**：`报表设置 → 数据集管理 → 编辑数据集`

**组件位置**：数据集编辑页"数据范围策略"字段下方（数据范围策略为已有字段，本期不改动）

**与已有字段的关系**：

| 字段 | 是否本期新增 | 作用 |
|---|---|---|
| `scope_strategy`（数据范围策略）| ❌ 已有 | 控制数据集级权限策略，覆盖所有 JOIN 表的表级策略 |
| `scope_dimension`（权限驱动维度）| ✅ 新增 | 控制以哪个维度为主线，非主线维度表跳过权限注入 |

两个字段正交：`scope_strategy` 决定"用哪种算法算"，`scope_dimension` 决定"哪些表需要算"。

**UI 示意图**（仅展示新增部分，已有字段省略）：

```
┌─────────────────────────────────────────────────────────────┐
│  编辑数据集  ds_dwd_cost_allocation                         │
├─────────────────────────────────────────────────────────────┤
│  ...（已有字段：名称、启用、描述、数据范围策略等）...        │
│                                                             │
│  权限驱动维度：[全部维度（AND模式） ▼]    ← 🆕 新增         │
│             ┌──────────────────────────────────┐            │
│             │ 全部维度（AND模式）               │            │
│             │ org（组织维度驱动）               │            │
│             │ cc（成本中心维度驱动）            │            │
│             └──────────────────────────────────┘            │
│                                                             │
│  帮助提示：                                                  │
│  ┌─────────────────────────────────────────────────────┐    │
│  │ 💡 如数据集同时包含组织维度和成本中心维度的表，      │    │
│  │    建议选择"org"或"cc"避免维度冲突导致数据为空。    │    │
│  │    选择后，非驱动维度的表将不注入权限过滤，          │    │
│  │    其数据范围由 JOIN 条件自然约束。                  │    │
│  └─────────────────────────────────────────────────────┘    │
│                                                             │
│  [取消]                              [保存]                 │
└─────────────────────────────────────────────────────────────┘
```

**状态说明**：

| 状态 | 表现 |
|---|---|
| 加载态 | 下拉置灰，显示 placeholder "加载中..." |
| 空值（默认）| 选中"全部维度（AND模式）" |
| 已选 org | 选中"org（组织维度驱动）" |
| 已选 cc | 选中"cc（成本中心维度驱动）" |
| 保存成功 | Toast："数据集保存成功" |
| 保存失败 | Toast：错误信息，下拉保持用户选择值 |

#### 4.4.2 数据集列表页 — 展示维度标识

在数据集列表表格中，新增可选的"权限维度"列或标签。

```
┌──────────────────────────────────────────────────────────────┐
│  数据集列表                                                  │
├────┬──────────────────────┬────────────┬─────────────────────┤
│ ID │ 名称                 │ 权限维度   │ 表数                │
├────┼──────────────────────┼────────────┼─────────────────────┤
│ 15 │ ds_dwd_cost_alloc... │ org        │ 6                   │
│ 12 │ ds_employee_roster   │ --         │ 2                   │
│  8 │ ds_cost_center       │ cc         │ 3                   │
└────┴──────────────────────┴────────────┴─────────────────────┘
```

---

### 4.5 权限、安全与外部系统

#### 4.5.1 安全边界

| 安全检查点 | 机制 |
|---|---|
| 所有表都不可解析 → 数据裸奔 | `any_strategy_resolved == False` → `false()` 兜底 |
| 驱动维度选了 org，cc 表跳过 | cc 表数据仅通过 INNER JOIN 条件可达，无法独立泄露 |
| 驱动维度选了 cc，org 表跳过 | 同上 |
| 管理员忘记配 scope_dimension | 默认 NULL → AND 模式 → 与现有行为一致 |
| 管理员配错了 scope_dimension | 仅影响该数据集，不影响其他数据集/报表 |

#### 4.5.2 潜在攻击面评估

**假设攻击**：攻击者创建数据集，把所有表都设为不可解析，尝试绕过权限。

**防护**：`any_strategy_resolved == False` 兜底触发 `false()`，返回空数据。

**假设攻击**：攻击者设置 `scope_dimension="org"`，但删掉了 org 表的 scope_role 配置，试图让 org 表也无法解析。

**防护**：org 表无法解析 → 被跳过 → 所有表都不可解析 → `any_strategy_resolved == False` → `false()` 兜底。

**结论**：新逻辑维持 fail-closed 原则，不存在权限提升路径。

#### 4.5.3 不涉及

- 不涉及 UCP 或其他第三方系统
- 不涉及敏感字段脱敏逻辑变更
- 不涉及 SQL 注入风险（权限子句通过 SQLAlchemy ORM 生成，非字符串拼接）

---

## 5. 原子任务清单

### 后端任务

- [ ] **T001** 数据库 migration：datasets 表新增 `scope_dimension` 字段
  - 前置任务：无
  - 功能范围：ALTER TABLE + COMMENT
  - 代码交付物：`alembic/versions/xxxx_add_scope_dimension_to_datasets.py`
  - UI 要求：不涉及 UI
  - UCP/外部系统要求：不涉及
  - 测试要求：`alembic upgrade head` 成功；`alembic downgrade -1` 回滚成功
  - 验收标准：字段存在，默认 NULL，写入 "org"/"cc" 不报错

- [ ] **T002** ORM 模型更新：Dataset 类新增 `scope_dimension` 字段
  - 前置任务：T001
  - 功能范围：`app/data/models.py` Dataset 类
  - 代码交付物：`backend/app/data/models.py`
  - UI 要求：不涉及 UI
  - UCP/外部系统要求：不涉及
  - 测试要求：`py_compile` 通过；import 不报错
  - 验收标准：字段映射正确，类型为 `String(10), nullable=True`

- [ ] **T003** Schema 更新：DatasetRead/Create/Update 新增 `scope_dimension`
  - 前置任务：T002
  - 功能范围：`app/schemas/dataset.py`
  - 代码交付物：`backend/app/schemas/dataset.py`
  - UI 要求：不涉及 UI
  - UCP/外部系统要求：不涉及
  - 测试要求：API 能正确序列化/反序列化该字段
  - 验收标准：`scope_dimension` 可选，仅允许 `null`/`"org"`/`"cc"`

- [ ] **T004** 数据集 CRUD API：读/写 `scope_dimension` 字段
  - 前置任务：T003
  - 功能范围：`app/api/dataset.py` 的 GET/POST/PUT 路由
  - 代码交付物：`backend/app/api/dataset.py`（可能为 `datasets.py`）
  - UI 要求：不涉及 UI
  - UCP/外部系统要求：不涉及
  - 测试要求：POST 写入 "org" → GET 返回 "org"；PUT 改为 "cc" → GET 返回 "cc"；写入非法值 → 422
  - 验收标准：字段持久化正确，校验规则生效

- [ ] **T005** 新增 `_strategy_to_dimension()` 辅助函数
  - 前置任务：无
  - 功能范围：`app/permissions/scope_filter.py`
  - 代码交付物：`backend/app/permissions/scope_filter.py`
  - UI 要求：不涉及 UI
  - UCP/外部系统要求：不涉及
  - 测试要求：单测覆盖 person_first→"org"、cc_first→"cc"、cross_filter→"any"、未知策略→"any"
  - 验收标准：映射正确，不抛异常

- [ ] **T006** 核心修复：`sql_builder.py` 权限注入循环重写
  - 前置任务：T004、T005
  - 功能范围：`app/reports/sql_builder.py` 第 1653-1682 行
  - 代码交付物：`backend/app/reports/sql_builder.py`
  - UI 要求：不涉及 UI
  - UCP/外部系统要求：不涉及
  - 测试要求：
    - 单表数据集，表可解析 → 权限正常注入
    - 多表数据集，部分表不可解析 → 可解析的注入，不可解析的跳过
    - 多表数据集，全部不可解析 → 注入 `false()`
    - 数据集 scope_dimension="org" + cc 表 → cc 表跳过
    - 原有 behavior（scope_dimension=NULL）不变
  - 验收标准：见测试要求各场景全部通过

- [ ] **T007** 新增 `warn_unresolvable_tables()` 启动扫描函数
  - 前置任务：无（复用已有 `can_resolve_scope_strategy`）
  - 功能范围：`app/permissions/scope_filter.py`
  - 代码交付物：`backend/app/permissions/scope_filter.py`
  - UI 要求：不涉及 UI
  - UCP/外部系统要求：不涉及
  - 测试要求：单测 mock 未配置表 → 输出 WARNING 日志；全部已配置 → 无 WARNING
  - 验收标准：日志含表名和策略名

- [ ] **T008** 启动事件集成：lifespan 中调用 `warn_unresolvable_tables`
  - 前置任务：T007
  - 功能范围：`app/main.py` lifespan
  - 代码交付物：`backend/app/main.py`
  - UI 要求：不涉及 UI
  - UCP/外部系统要求：不涉及
  - 测试要求：启动后查看日志含扫描结果
  - 验收标准：启动不阻塞，日志正常输出

### 前端任务

- [ ] **T009** 数据集编辑页：新增"权限驱动维度"下拉选择
  - 前置任务：T004（需后端接口就绪）
  - 功能范围：数据集编辑表单
  - 代码交付物：数据集编辑页 Vue 组件
  - UI 要求：
    - 下拉位置：scope_strategy 字段下方
    - 选项：`{ label: '全部维度（AND模式）', value: null }`、`{ label: 'org（组织维度驱动）', value: 'org' }`、`{ label: 'cc（成本中心维度驱动）', value: 'cc' }`
    - 帮助提示 tooltip 或 hint 文本
    - 编辑态：加载已有值；新建态：默认 null
  - UCP/外部系统要求：不涉及
  - 测试要求：选择"org"→保存→重新进入编辑→显示"org"；选择"全部维度"→保存→重新进入→显示默认
  - 验收标准：字段正确读写，UI 布局合理

- [ ] **T010** 数据集列表页：展示"权限维度"标签
  - 前置任务：T009
  - 功能范围：数据集列表表格
  - 代码交付物：数据集列表页 Vue 组件
  - UI 要求：新增可选列"权限维度"，有值时显示 tag，无值时显示 "--"
  - UCP/外部系统要求：不涉及
  - 测试要求：列表正确展示各数据集的维度
  - 验收标准：列显示正确，排序/筛选功能正常

### 测试与构建

- [ ] **T011** 单元测试：权限注入循环 8 场景覆盖
  - 前置任务：T006
  - 功能范围：`tests/test_sql_builder_scope.py`
  - 代码交付物：`backend/tests/test_sql_builder_scope.py`
  - UI 要求：不涉及 UI
  - UCP/外部系统要求：不涉及
  - 测试要求：见 T006 测试要求
  - 验收标准：8 个场景全部 pass

- [ ] **T012** 单测：`_strategy_to_dimension` 和 `warn_unresolvable_tables`
  - 前置任务：T005、T007
  - 功能范围：`tests/test_scope_filter_unit.py`
  - 代码交付物：`backend/tests/test_scope_filter_unit.py`（追加用例）
  - UI 要求：不涉及 UI
  - 验收标准：3+ 用例 pass

- [ ] **T013** 集成测试：端到端报表运行验证
  - 前置任务：T006、T011
  - 功能范围：`POST /api/v1/reports/{id}/run`
  - 测试要求：
    - 报表 17（多表 JOIN）→ 返回 625 行（非 0）
    - scope_dimension="org" 的数据集 → 仅 org 维度表注入权限
    - 全部不可解析的数据集 → 返回 0 行
  - 验收标准：3 场景 pass

- [ ] **T014** 构建验证
  - 前置任务：T001–T013
  - 功能范围：`py_compile` 全后端 + `vue-tsc` + `vite build`
  - 验收标准：0 错误，构建成功

---

## 6. 测试计划

### 6.1 后端单元测试

| 测试场景 | 输入 | 期望 |
|---|---|---|
| 单表可解析 | 1 张表，有 scope_role | build_scope_filter 正常返回 WHERE 子句 |
| 单表不可解析 | 1 张表，无 scope_role/roster | can_resolve 返回 False |
| 多表，部分不可解析 | 3 张表，2 可解析 + 1 不可解析 | 2 张注入权限，1 张跳过（WARNING 日志） |
| 多表，全部不可解析 | 3 张表均不可解析 | `any_strategy_resolved=False` → `false()` 兜底 |
| scope_dimension="org" + cc 表 | org 表可解析，cc 表可解析但维度不匹配 | org 表注入，cc 表跳过 |
| scope_dimension="cc" + org 表 | cc 表可解析，org 表可解析但维度不匹配 | cc 表注入，org 表跳过 |
| scope_dimension=NULL（默认）| 同现有逻辑 | 所有能解析的都注入（AND 模式） |
| `_strategy_to_dimension` | person_first / cc_first / cross_filter / 未知 | "org" / "cc" / "any" / "any" |

### 6.2 后端集成测试

| 测试场景 | API | 期望 |
|---|---|---|
| 报表 17 运行（生产环境复现）| `POST /api/v1/reports/17/run` | 返回 625 行（非 0） |
| 数据集 15 设置 scope_dimension="org" 后报表运行 | 同上 | 权限仅从 org 维度表注入，cc 表跳过 |
| 新建数据集 scope_dimension="cc" | `POST /api/v1/datasets` | 201，回读确认 |
| 编辑 scope_dimension 为非法值 | `PUT /api/v1/datasets/{id}` | 422 |

### 6.3 前端测试

| 测试场景 | 操作 | 期望 |
|---|---|---|
| 编辑数据集，选择 org 驱动 | 下拉选 "org" → 保存 | 重新进入编辑显示 "org" |
| 新建数据集，默认维度 | 进入新建页 | 下拉显示 "全部维度（AND模式）" |
| 数据集列表展示维度 | 列表页加载 | org/cc 的数据集显示对应 tag |

### 6.4 构建验证

```bash
# 后端
cd backend && python -m py_compile $(find app -name '*.py')  # 0 error

# 前端
cd frontend && npx vue-tsc --noEmit  # 0 error
npx vite build  # OK
```

### 6.5 异常路径

| 异常 | 表现 |
|---|---|
| scope_dimension 非法值 | API 返回 422 |
| 数据库不可用（启动扫描时）| 捕获异常，不阻塞启动，输出 ERROR 日志 |
| 所有表都不可解析 | 用户看到空数据（fail-closed），日志有 WARNING |

---

## 7. 验收标准

### 从用户角度

- [ ] gaby.liu 查看"月度成本入账表 - 副本"能看到 625 行数据（当前为 0）
- [ ] 即使报表 JOIN 了多张未配置权限的表，只要主表配置正确，用户仍能看到数据
- [ ] 管理员可以在数据集编辑页设置"权限驱动维度"

### 从开发角度

- [ ] 核心改动仅涉及 3 个后端文件：`sql_builder.py`、`scope_filter.py`、`main.py`
- [ ] 新增 1 个 migration 文件
- [ ] `py_compile` 全后端 0 错误
- [ ] 不引入新的外部依赖

### 从测试角度

- [ ] 8 个单测场景全部 pass
- [ ] 3 个集成测试场景 pass
- [ ] 回归测试：已有报表行为不变

### 从 UI/交互角度

- [ ] 数据集编辑页有"权限驱动维度"下拉，包含帮助提示
- [ ] 数据集列表可展示维度标签
- [ ] 各状态（加载/默认/已选/保存成功/保存失败）表现正确

### 从上线角度

- [ ] migration 可正向执行、可回滚
- [ ] 启动扫描日志输出正常
- [ ] 生产环境 regression test pass（已有报表无影响）

---

## 8. 风险与兼容性

| 风险 | 等级 | 影响 | 应对方案 |
|---|---|---|---|
| 所有表都不可解析 → 全裸奔 | 🟢 低 | 敏感数据泄露 | `any_strategy_resolved=False` 兜底 → `false()` 防裸奔 |
| JOIN 维度表被跳过，INNER JOIN 导致主表行被意外过滤 | 🟡 中 | 某些行可能缺失 | INNER JOIN 本身需要两表都有匹配行；维度表数据通常齐全。如遇问题，可补配 scope_role |
| LEFT JOIN 维度表被跳过 | 🟡 中 | 维度表数据不受权限约束 | LEFT JOIN 场景下维度表行可能无约束，但主表已过滤。如需规则化，后续可加数据集级策略 |
| `scope_dimension` 新增字段，旧 API 调用不传 | 🟢 低 | 无影响 | 默认 NULL，AND 模式，与现有行为一致 |
| 启动扫描因数据库不可用报错 | 🟢 低 | 启动失败 | try/except 包裹，输出 ERROR 日志，不阻塞启动 |
| 用户错误设置 scope_dimension | 🟢 低 | 该数据集权限范围错误 | 仅影响该数据集，不影响其他。可自助改回 |

---

## 9. 假设与待确认事项

1. **假设**：数据集 JOIN 关系均为 INNER JOIN 或语义等价的 JOIN（当前 production 数据确认为 INNER JOIN）
2. **假设**：`cross_filter` 策略的表通常为维度/参考表，其 `scope_dimension` 映射为 `"any"`（总是跳过权限注入）
3. **假设**：管理员知道数据集内哪些表是"主表"并能正确选择驱动维度（通过 UI 提示文字引导）
4. **待确认**：`scope_dimension` 是否需要在前端以"必填"形式呈现（当前设计为可选，默认 NULL）

---

## 10. 交付说明模板

### 完成任务

1. T001–T008：后端全链路（migration + ORM + Schema + API + 权限引擎 + 启动扫描）
2. T009–T010：前端 UI（数据集编辑 + 列表展示）
3. T011–T014：测试与构建

### 修改文件

| 文件 | 改动类型 |
|---|---|
| `backend/app/data/models.py` | 新增字段 |
| `backend/app/schemas/dataset.py` | 新增字段 |
| `backend/app/api/dataset.py`（或 `datasets.py`）| 透传字段 |
| `backend/app/reports/sql_builder.py` | 权限注入循环重写（核心） |
| `backend/app/permissions/scope_filter.py` | 新增 `_strategy_to_dimension` + `warn_unresolvable_tables` |
| `backend/app/main.py` | lifespan 集成启动扫描 |
| `alembic/versions/xxxx_add_scope_dimension_to_datasets.py` | 新增 migration |
| 前端数据集编辑页 Vue 组件 | 新增下拉 |
| 前端数据集列表页 Vue 组件 | 新增列 |
| `backend/tests/test_sql_builder_scope.py` | 新增测试 |
| `backend/tests/test_scope_filter_unit.py` | 追加用例 |

### 测试命令与结果

```bash
# 后端编译验证
cd backend && python -m py_compile $(find app -name '*.py')  # expect: 0 errors

# 单测
pytest tests/test_sql_builder_scope.py -v          # expect: 8 passed
pytest tests/test_scope_filter_unit.py -v          # expect: N passed (含新增)

# 集成测试
pytest tests/test_integration_report_run.py -v      # expect: 3 passed

# 前端构建
cd frontend && npx vue-tsc --noEmit                # expect: 0 errors
npx vite build                                      # expect: OK
```

### 未完成项

- 无（本期范围内全部覆盖）

### 风险与后续建议

- 上线后建议：为 production 中 20 张未配置的表补全 `scope_role` 或 `roster_join_col`（可根据启动扫描日志列表逐表配置）
- 后续可选增强：支持"多维度驱动"（如同时 org+cc），当前一期仅支持单选
