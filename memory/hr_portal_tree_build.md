---
name: hr-portal-tree-build
description: cost_center_tree 来自成本中心月度表；org_tree 来自组织单元表 org_unit（按 parent_org_code 建树，2026-06-23 起）
metadata:
  type: project
---

# 两棵树的构建规则（2026-06-23 改：org_tree 改 org_unit 权威建树）

## 数据来源

| 树 | 数据源表 | 触发 | 实现函数 |
|---|---|---|---|
| `cost_center_tree` | `cost_center_monthly` | `sync_to_table('cost_center_monthly')` 末尾 | `sync_service._sync_cc_tree` |
| `org_tree` | **`org_unit`（组织单元表，2026-06-23 起）** | `sync_to_table('org_unit')` 末尾 | `sync_service._sync_org_tree` |

每次同步对应业务表后**全量重建**（先 `delete()`，派发读落库实体行后重插），保证树永远反映源端最新结构。

## 组织架构树字段映射（org_unit 权威建树，2026-06-23 起）

源端 `org_unit`（组织单元表）每行：

- `编码`(org_code) → `code`（业务主键，源端真编码，抗改名）
- `组织名称`(org_name) → `name`
- `行政上级组织编码`(parent_org_code) → 显式连父：== `RootOrg` 或空 → 挂虚拟根；否则连到对应编码节点；父找不到/成环 → 挂虚拟根并 warning
- `状态`(org_status) ∈ {启用, 生效, 正常} → `is_active=True`，否则 False
- 字段：编码/组织名称/组织全称/行政上级组织编码/行政维度上级/状态/**设立日期**/生效日期/变动类型（**无变动日期**，已删；source_field_id 全为 NULL，靠中文表头匹配）

**虚拟根**：代码固定生成 `code='RootOrg'`、`name=ORG_ROOT_NAME`（默认「创梦天地」）、level=1。子节点 level 按 parent_org_code 链路从 RootOrg 向下推算（直接子=2）。org_tree 始终唯一一个 `parent_id IS NULL` 根。

**员工 org_node_code**：花名册 `org_node_code` 收敛为唯一一列，值直接取源端北森「组织节点编码」（删了旧派生 hash 列，源端列改名上位，scope_role=org_node_code）。与树节点 code 同体系，权限按任意层级授权都能命中、抗改名。源端为空则留空不兜底。

**Why 改**：旧方案从花名册 6 层部门名反推、节点 code 用路径名 SHA256，部门一改名 code 全变 → 已配权限标签失效；空部门建不出。改 org_unit 后每层都是真实源端编码，结构完整、抗改名。详见 `specs/007-org-unit-tree/spec.md`。

> ⚠️ 旧逻辑（已废弃）：`_sync_org_tree` 曾从 `emp_realtime_roster` 6 层冗余字段（company_org/department/department_2…）+ `L{level}_{sha256}` code 建 7 层树；`_inject_org_node_code` 派生 org_node_code。这些函数已删除。

## 成本中心树字段映射（4 层）

源端 `cost_center_monthly` 每行：

- `编码` → `code`
- `名称` → `name`
- `业务层级Id` (字符串"1"/"2"/"3"/"4") → `level`
- `一/二/三/四级成本中心` 是冗余路径名 → 用于父匹配（父级 level=N-1 且 name=`N-1 级成本中心` 字段值）
- `启用状态` "启用"/"停用" → `is_active`

**Why**：北森给的字段命名怪——`层级` 字段是常量"成本中心"，**`业务层级Id` 才是真实层级数字**；`上级成本中心` 字段不可靠（指向 name 不指向 code，且 lvl=2 的"上级"是空）。父匹配只能靠"上一级冗余路径名"。

## 历史踩坑

- **坑 1**：原 `_sync_cc_tree` 用 `ParentCode` 字段判定父子，北森源数据根本没这字段 → 触发条件 `any(ParentCode)` 永远 False → 树永远 0 行
- **坑 2**：原代码完全没写 `_sync_org_tree` → org_tree 永远 0 行 → 管理单元页选「组织节点」勾选树空白
- **坑 3**：trees router 默认 `include_inactive=False`，未启用的成本中心节点被过滤掉 → cc 启用节点只有 7 个 children，停用的 460 个被隐藏；前端勾选时记得提供「含失效」开关
- **坑 4**（2026-05-24 修）：`_sync_org_tree` 把所有节点 `is_active` 硬编码为 True → 「含离职/失效节点」开关失效。修复方式：第一遍预扫描时按 `raw['人员状态'] != '离职'` 把员工经过的每层 code 加进 `active_codes` 集合；第二遍建节点时 `is_active = code in active_codes`。判定**用排除式（!= 离职）而非白名单**，避免未来新增"试用/外包"等状态被误判为失效。

## 重建存量数据

如果业务表已有数据但树空了：

```bash
docker cp backend/scripts/rebuild_trees.py hr-portal-backend:/app/rebuild_trees.py
docker compose exec backend python rebuild_trees.py
```

脚本路径：`hr-portal/backend/scripts/rebuild_trees.py`。
