---
name: hr-portal-scopes-design
description: 数据范围标签新版语义（组织范围+人员范围两段式，alembic 0009）— 单标签内 AND，多标签 OR
metadata:
  type: project
---

# 数据范围标签 — 组织范围 + 人员范围两段式（2026-05-24 重构）

## 核心语义

每个标签 = **「管理组织范围」+「管理人员范围」** 两段，可独立开关。

```
单标签命中 = (org_part) AND (person_part)
最终 = tag1 OR tag2 OR ...    （多标签并集）
```

跟旧设计的关键差异：
- 旧版：跨大维度（cc / org / et / ee）取交集 → 一个用户只能有一个跨维度组合
- 新版：单标签内自带 AND → 用户配多标签时按业务直觉并集

## 数据库

### scope_tags（迁移 0009）
- `dimension`：'cost_center' | 'org'（仅当 org_scope_enabled=true 才有意义）
- `org_scope_enabled` / `org_scope_unlimited` / `person_scope_enabled` 三个开关
- 删除：`sub_dimension`、`is_unlimited`

### scope_tag_filters（新增）
- `field_code`：'employment_type' | 'employment_entity' | 'person'
- `operator`：'eq' (IN) | 'neq' (NOT IN)
- `values`：JSONB 字符串数组
- 同一 tag 多条 filter → AND

### 字段对应（emp_realtime_roster.raw）

| field_code | 源字段 | 备注 |
|---|---|---|
| employment_type | 员工类型 | 5 个 distinct 值 |
| employment_entity | 公司名称 | 27 个 distinct 值 |
| person | 姓名 | 拼接型 `chang.liu刘畅`，需远程搜索 |

`姓名（中文名）`字段有重名（2492 vs 2461），不用它做权限值；`姓名` 字段 100% 填充且唯一。

## 前端 UI（Scopes.vue 抽屉）

两段式 el-card：
1. **管理组织范围**：维度下拉 + 不限开关 + HierarchyTreePicker
2. **管理人员范围**：动态行「字段下拉 + 运算符 + 值多选」，可加可减
   - employment_type/entity：el-select multiple，options 来自 `/trees/employment-{type,entity}`
   - person：el-select multiple **filterable + remote**，远程搜 `/trees/persons?keyword=`

含「含离职/失效节点」全局开关，影响树和 distinct 接口。

## 校验规则
- 两个 enabled 都关 → 400
- org_scope_enabled=true 且 !unlimited 且 selections=[] → 400
- person_scope_enabled=true 且 filters=[] → 400
- 单条 filter 的 values 至少 1 个非空

## 引擎收口

[`backend/app/permissions/scope_filter.py`](../hr-portal/backend/app/permissions/scope_filter.py) 是主入口；[`backend/app/reports/sql_builder.py`](../hr-portal/backend/app/reports/sql_builder.py) 里的 `_rebuild_scope_filter_for_alias` 复用同一语义但支持 aliased model。两处都要同步改语义。

## 历史平移
迁移 0009 处理：
- `is_unlimited=true` → `org_scope_unlimited=true`
- `sub_dimension in ('employment_type','employment_entity')` 的标签 → 转为「仅人员范围」标签，selections.value_text 转移到 scope_tag_filters
- 当前生产库零相关数据，但脚本完整可回滚

相关：[[hr-portal-tree-build]]

## 字段元数据：scope_role（行级权限的列定位）

权限引擎 `build_scope_filter` 工作的前提：**`table_columns.scope_role` 必须配齐**，否则 `role_cols` 为空 → 直接 `return true()` 放行所有数据。

### roster 表当前配置（2026-05-24 配齐）

| column_code | scope_role | 来源 |
|---|---|---|
| `_org_node_code` | `org_node_code` | 同步时由 `_inject_org_node_code` 算出员工最深层级 hash code |
| `员工类型` | `employment_type` | 北森原字段 |
| `公司名称` | `employment_entity` | 北森原字段 |
| `姓名` | `person` | 拼接型 `chang.liu刘畅`，重名极少 |

### cost_center_monthly

| column_code | scope_role |
|---|---|
| `_cc_code` | `cc_code`（同步时由 `_inject_cc_code` 取源端「编码」字段写入）|

### 注入点
`sync_to_table` 在 `_dynamic_upsert` 之前调用 `_inject_scope_codes`，给 raw 写额外的 `_org_node_code` / `_cc_code` 字段（`_` 前缀避免和源端字段冲突）。

### 引擎 SQL 表达式
`_raw_text(model, col)` 用 `func.jsonb_extract_path_text(cast(model.raw, JSONB), col)`，兼容 `JSON` 和 `JSONB` 两种存储类型。直接用 `model.raw[col].astext` 在 raw 列类型为 JSON（非 JSONB）时报 `'Comparator' object has no attribute 'astext'`。

### 一次性存量回写
`backend/scripts/backfill_scope_codes.py` 跑一次即可给已有 raw 补 `_org_node_code` / `_cc_code`。

## 字段分类（列级权限/脱敏）

数据流：
1. `field_categories` 定义分类（含 `is_sensitive` 开关）
2. `field_category_assignments` 把 (table, column) 挂到分类
3. `role_visible_categories` / `user_visible_categories` 决定谁能看
4. `permissions/masker.get_sensitive_columns` 在 `/data/{table}` 和 `/reports/run` 入口判定每列是否要脱敏（`******`）

接入点：
- `data/router.py:141`、`reports/router.py:369`、`reports/sql_builder.py:266` 都已串好

UI 入口：
- 系统设置 → 字段分类管理：建分类 + 挂字段
- 系统设置 → 角色管理（编辑态）：勾选该角色可见的分类
- 用户管理 → 设置数据范围抽屉：给单个用户额外授权可见分类
- 后端接口：`GET/PUT /field-categories/_role/{id}` 和 `/_user/{id}`

最终可见 = 角色默认 ∪ 用户额外授权。超管 admin 完全豁免。
