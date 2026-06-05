# Phase 1 — Data Model

**Feature**: 001-hr-permission-portal · **Date**: 2026-05-22

把 spec 中的 Key Entities 落到 PostgreSQL schema。所有表都带 `id BIGSERIAL PK`、`created_at` / `updated_at` / `created_by` / `updated_by`，下文只在有特殊语义时显式列出。

---

## 一、用户与权限

### `users`

| 字段                | 类型                       | 备注                          |
| ------------------- | -------------------------- | ----------------------------- |
| login_name          | VARCHAR(64) UNIQUE NOT NULL | 登录名                       |
| display_name        | VARCHAR(64) NOT NULL       | 姓名                          |
| email               | VARCHAR(128) UNIQUE        |                               |
| password_hash       | VARCHAR(128) NOT NULL      | bcrypt                        |
| is_active           | BOOLEAN DEFAULT TRUE       | 启用 / 禁用                   |
| feishu_user_id      | VARCHAR(64) UNIQUE NULL    | **本期预留**，FR-AUTHN-002    |
| last_login_at       | TIMESTAMPTZ                |                               |
| failed_login_count  | INT DEFAULT 0              | 登录失败锁定                  |
| locked_until        | TIMESTAMPTZ NULL           |                               |

### `roles`

| 字段       | 类型                 |
| ---------- | -------------------- |
| name       | VARCHAR(64) UNIQUE   |
| description| TEXT                 |
| is_active  | BOOLEAN DEFAULT TRUE | 停用而非删除（FR-ROLE-001） |

### `user_roles`

多对多。`(user_id, role_id)` UNIQUE。

### `menus`

| 字段     | 类型                | 备注                                   |
| -------- | ------------------- | -------------------------------------- |
| code     | VARCHAR(64) UNIQUE  | 路由级标识                             |
| label    | VARCHAR(64)         | 显示名                                 |
| parent_id| BIGINT NULL         | 自引用，菜单可有层级                   |
| order    | INT                 | 同级排序                               |

### `role_menus`

| 字段                  | 类型                                       | 备注                                                    |
| --------------------- | ------------------------------------------ | ------------------------------------------------------- |
| role_id               | BIGINT REFERENCES roles                    |                                                         |
| menu_id               | BIGINT REFERENCES menus                    |                                                         |
| scope_dimension       | ENUM('cost_center', 'org', 'none')         | 该角色访问该菜单时的数据范围控制方式（FR-ROLE-002）     |
| can_create            | BOOLEAN DEFAULT FALSE                      | 操作权限四件套                                          |
| can_update            | BOOLEAN DEFAULT FALSE                      |                                                         |
| can_delete            | BOOLEAN DEFAULT FALSE                      |                                                         |
| can_export            | BOOLEAN DEFAULT FALSE                      |                                                         |

UNIQUE(role_id, menu_id)。

### 数据范围标签

#### `scope_tags`

| 字段        | 类型                                      | 备注                                                     |
| ----------- | ----------------------------------------- | -------------------------------------------------------- |
| name        | VARCHAR(64)                               | 标签名                                                   |
| dimension   | ENUM('cost_center', 'org')                | 主维度                                                   |
| sub_dim     | ENUM('cc', 'org', 'employment_type', 'employer') NULL | 仅组织架构标签使用：org / 用工类型 / 用工主体；成本中心标签为 NULL |

#### `scope_tag_selections`

| 字段                | 类型                                  | 备注                                                                        |
| ------------------- | ------------------------------------- | --------------------------------------------------------------------------- |
| tag_id              | BIGINT REFERENCES scope_tags          |                                                                             |
| node_kind           | ENUM('org_node', 'cc_node', 'enum')   | enum 用于"用工类型/用工主体"枚举值                                          |
| node_ref            | TEXT                                  | org/cc 时为节点路径；enum 时为字面量                                        |
| include_descendants | BOOLEAN DEFAULT FALSE                 | **包含下级开关**（FR-SCOPE-005）；enum 时强制为 FALSE                       |

#### `user_scope_tags`

多对多 `(user_id, tag_id)` UNIQUE。

### 字段分类

#### `field_categories`

| 字段     | 类型             |
| -------- | ---------------- |
| name     | VARCHAR(64) UNIQUE |
| description | TEXT          |

#### `field_category_assignments`

把分类挂到具体表的具体列上。

| 字段        | 类型              |
| ----------- | ----------------- |
| category_id | BIGINT            |
| table_name  | VARCHAR(64)       |
| column_name | VARCHAR(64)       |

UNIQUE(category_id, table_name, column_name)。

#### `user_visible_categories` / `role_visible_categories`

用户/角色"可见"的分类白名单。任一命中即放行（取并集）。

---

## 二、数据接入

### `api_endpoints`

| 字段            | 类型                                             | 备注                                                            |
| --------------- | ------------------------------------------------ | --------------------------------------------------------------- |
| code            | VARCHAR(64) UNIQUE                               | 业务标识                                                        |
| display_name    | VARCHAR(64)                                      |                                                                 |
| target_table    | VARCHAR(64)                                      | 落到本系统的哪张目标表                                          |
| beisen_url      | TEXT                                             | 北森接口地址                                                    |
| auth_config     | JSONB                                            | AppKey/Secret 等加密存储                                         |
| field_mapping   | JSONB                                            | `{ "北森字段": "本地列" }`                                      |
| date_format     | ENUM('ymd', 'ym', 'none')                        | FR-API-001                                                      |
| refresh_mode    | ENUM('snapshot', 'upsert')                       | FR-API-006                                                      |
| business_key    | TEXT[]                                           | upsert 模式下的业务主键列；snapshot 时为空。FR-API-007 强制     |
| cron_enabled    | BOOLEAN DEFAULT FALSE                            |                                                                 |
| cron_expr       | VARCHAR(64) NULL                                 |                                                                 |
| is_active       | BOOLEAN DEFAULT TRUE                             |                                                                 |

CHECK 约束：`refresh_mode = 'upsert' → array_length(business_key, 1) > 0`。

### `fetch_logs`

| 字段          | 类型                                |
| ------------- | ----------------------------------- |
| endpoint_id   | BIGINT REFERENCES api_endpoints     |
| trigger_kind  | ENUM('schedule', 'manual')          |
| started_at    | TIMESTAMPTZ                         |
| finished_at   | TIMESTAMPTZ NULL                    |
| status        | ENUM('running', 'success', 'failed')|
| rows          | INT                                 |
| error_message | TEXT                                |
| period_key    | VARCHAR(7) NULL                     | upsert 模式下携带的时间键（YYYY-MM 或 YYYY-MM-DD）|

### 业务数据表（首期 5 张）

按 spec FR-DATA-001。所有表都加 `period_ym CHAR(7) NULL`（snapshot 表为 NULL，月度表 NOT NULL），便于前端统一展示。

#### `emp_realtime_roster`（snapshot）

| 字段                | 类型           | 备注                       |
| ------------------- | -------------- | -------------------------- |
| employee_id         | VARCHAR(32) PK |                            |
| name                | VARCHAR(64)    |                            |
| status              | VARCHAR(16)    | 在职 / 离职 / ...          |
| company_org         | VARCHAR(64)    | 公司级组织                 |
| dept_l1 ~ dept_l5   | VARCHAR(64)    | 一~五级部门                |
| employment_type     | VARCHAR(32)    | 用工类型                   |
| employer            | VARCHAR(64)    | 用工主体                   |
| cc_code             | VARCHAR(32)    | 当前主成本中心             |
| ... (其他属性)      |                |                            |

#### `emp_monthly_roster`（upsert by 年月，PK = employee_id + period_ym）

字段大致同上 + `period_ym CHAR(7)`，UNIQUE(employee_id, period_ym)。

#### `emp_monthly_salary`（upsert by 年月，PK = employee_id + period_ym）

| 字段          | 类型             |
| ------------- | ---------------- |
| employee_id   | VARCHAR(32)      |
| period_ym     | CHAR(7)          |
| base_salary   | NUMERIC(14,2)    |
| bonus         | NUMERIC(14,2)    |
| ...           |                  |

UNIQUE(employee_id, period_ym)。**敏感字段**（base_salary 等）通过 field_category_assignments 标记。

#### `emp_monthly_allocation`（upsert by 年月 + 成本中心，PK = employee_id + cc_code + period_ym）

| 字段          | 类型             |
| ------------- | ---------------- |
| employee_id   | VARCHAR(32)      |
| cc_code       | VARCHAR(32)      |
| period_ym     | CHAR(7)          |
| ratio         | NUMERIC(5,4)     |
| amount        | NUMERIC(14,2)    |

UNIQUE(employee_id, cc_code, period_ym)。

#### `cost_center_monthly`（upsert by 年月 + 成本中心，PK = cc_code + period_ym）

| 字段           | 类型              |
| -------------- | ----------------- |
| cc_code        | VARCHAR(32)       |
| period_ym      | CHAR(7)           |
| cc_name        | VARCHAR(128)      |
| cc_l1 ~ cc_l4  | VARCHAR(64)       |
| is_effective   | BOOLEAN           |
| ...            |                   |

UNIQUE(cc_code, period_ym)。

---

## 三、组织树 / 成本中心树

### `org_tree_nodes`

| 字段       | 类型                           | 备注                                                |
| ---------- | ------------------------------ | --------------------------------------------------- |
| tree_kind  | ENUM('active_only', 'all')     | 在职 / 含离职 两套并存                              |
| level      | ENUM('root', 'company', 'l1', 'l2', 'l3', 'l4', 'l5') |                  |
| name       | VARCHAR(64)                    | 节点名                                              |
| parent_id  | BIGINT NULL                    | 自引用                                              |
| path       | TEXT                           | `/创梦天地/X 公司/A 部门/` GiST 索引或 BTREE prefix |
| emp_count  | INT                            | 用于前端展示                                        |

UNIQUE(tree_kind, path)。每次拉取后整体重算。

### `cost_center_tree_nodes`

| 字段          | 类型                           | 备注                                |
| ------------- | ------------------------------ | ----------------------------------- |
| tree_kind     | ENUM('effective_only', 'all')  | 仅生效 / 含失效                     |
| level         | ENUM('l1', 'l2', 'l3', 'l4')   | l1 为最末级（spec 定义）            |
| name          | VARCHAR(64)                    |                                     |
| code          | VARCHAR(32) NULL               | 仅叶子节点有 cc_code                |
| parent_id     | BIGINT NULL                    |                                     |
| path          | TEXT                           |                                     |
| is_effective  | BOOLEAN                        |                                     |

UNIQUE(tree_kind, path)。

---

## 四、数据集与表间关联

### `datasets`

| 字段          | 类型              |
| ------------- | ----------------- |
| name          | VARCHAR(64) UNIQUE |
| description   | TEXT              |
| is_active     | BOOLEAN DEFAULT TRUE |

### `dataset_tables`

把表纳入数据集。

| 字段          | 类型                           |
| ------------- | ------------------------------ |
| dataset_id    | BIGINT REFERENCES datasets     |
| table_name    | VARCHAR(64)                    |
| alias         | VARCHAR(32) NULL               | 同表多次纳入时区分              |

UNIQUE(dataset_id, table_name, alias)。

### `dataset_relations`

数据集**内部**的表间关联。

| 字段          | 类型                                |
| ------------- | ----------------------------------- |
| dataset_id    | BIGINT REFERENCES datasets          |
| left_table    | VARCHAR(64)                         |
| right_table   | VARCHAR(64)                         |
| join_keys     | JSONB                               | `[{"l":"employee_id","r":"employee_id"},{"l":"period_ym","r":"period_ym"}]` |
| join_kind     | ENUM('inner', 'left')               | 默认 inner                         |

### `dataset_acl`

| 字段       | 类型                            |
| ---------- | ------------------------------- |
| dataset_id | BIGINT                          |
| principal_kind | ENUM('user', 'role')        |
| principal_id | BIGINT                        |

UNIQUE(dataset_id, principal_kind, principal_id)。

---

## 五、报表

### `reports`

| 字段          | 类型                       | 备注                                                 |
| ------------- | -------------------------- | ---------------------------------------------------- |
| name          | VARCHAR(64)                |                                                      |
| dataset_id    | BIGINT REFERENCES datasets | FR-REPORT-005：报表绑定数据集                        |
| definition    | JSONB                      | `{ "selected_tables": [...], "dimensions": [...], "measures": [...], "filters": [...] }` |
| owner_id      | BIGINT REFERENCES users    |                                                      |

### `report_acl`

报表的访问授权（角色/用户）。结构同 `dataset_acl`。

---

## 六、视图与索引

### 关键索引

```sql
CREATE INDEX idx_org_tree_path_active ON org_tree_nodes (path text_pattern_ops) WHERE tree_kind = 'active_only';
CREATE INDEX idx_org_tree_path_all    ON org_tree_nodes (path text_pattern_ops) WHERE tree_kind = 'all';
CREATE INDEX idx_cc_tree_path_eff     ON cost_center_tree_nodes (path text_pattern_ops) WHERE tree_kind = 'effective_only';

CREATE UNIQUE INDEX uq_emp_monthly_salary ON emp_monthly_salary (employee_id, period_ym);
CREATE UNIQUE INDEX uq_emp_monthly_alloc  ON emp_monthly_allocation (employee_id, cc_code, period_ym);
CREATE UNIQUE INDEX uq_cc_monthly         ON cost_center_monthly (cc_code, period_ym);

CREATE INDEX idx_emp_realtime_org_path  ON emp_realtime_roster (company_org, dept_l1, dept_l2, dept_l3, dept_l4, dept_l5);
CREATE INDEX idx_emp_realtime_cc        ON emp_realtime_roster (cc_code);
```

### `pg_advisory_xact_lock` 命名约定

每个 endpoint 拉取时调 `pg_advisory_xact_lock(hashtext('endpoint_' || endpoint_id))`，保证同一接口串行。

---

## 七、状态流转

### `fetch_logs.status`

```
running ──success──→ success
   └────failed───→ failed   （目标表不变，保留上次成功数据）
```

### 用户登录失败锁定

```
失败 < 5 次：仅累加 failed_login_count
失败 ≥ 5 次：locked_until = now() + 15 分钟
登录成功：清零 failed_login_count、清空 locked_until
管理员重置密码：同登录成功
```

---

## 八、与 spec 实体的映射核对

| spec 实体          | 表                                                                 |
| ------------------ | ------------------------------------------------------------------ |
| User               | users                                                              |
| Role               | roles + role_menus                                                 |
| Menu               | menus                                                              |
| Operation          | role_menus.can_create/update/delete/export（不再单独建表）         |
| FieldCategory      | field_categories + field_category_assignments                      |
| ScopeTag           | scope_tags                                                         |
| ScopeSelection     | scope_tag_selections                                               |
| DataTable          | 业务数据表（emp_*、cost_center_monthly 等）                        |
| DataSet            | datasets + dataset_tables + dataset_relations + dataset_acl        |
| TableRelation      | dataset_relations                                                  |
| ApiEndpoint        | api_endpoints                                                      |
| FetchLog           | fetch_logs                                                         |
| Report             | reports + report_acl                                               |
| OrgTreeNode        | org_tree_nodes                                                     |
| CostCenterTreeNode | cost_center_tree_nodes                                             |

全部 spec 实体落盘，无遗漏。