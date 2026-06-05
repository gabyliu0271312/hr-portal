---
name: hr-portal-tree-build
description: cost_center_tree 与 org_tree 的构建规则（数据源 + 字段映射 + 触发时机）
metadata:
  type: project
---

# 两棵树的构建规则（2026-05-24 修复）

## 数据来源

| 树 | 数据源表 | 触发 | 实现函数 |
|---|---|---|---|
| `cost_center_tree` | `cost_center_monthly` | `sync_to_table('cost_center_monthly')` 末尾 | `sync_service._sync_cc_tree` |
| `org_tree` | `emp_realtime_roster` | `sync_to_table('emp_realtime_roster')` 末尾 | `sync_service._sync_org_tree` |

每次同步对应业务表后**全量重建**（先 `delete()`，再按当前 raw 集合插入），保证树永远反映源端最新结构。

## 成本中心树字段映射（4 层）

源端 `cost_center_monthly` 每行：

- `编码` → `code`
- `名称` → `name`
- `业务层级Id` (字符串"1"/"2"/"3"/"4") → `level`
- `一/二/三/四级成本中心` 是冗余路径名 → 用于父匹配（父级 level=N-1 且 name=`N-1 级成本中心` 字段值）
- `启用状态` "启用"/"停用" → `is_active`

**Why**：北森给的字段命名怪——`层级` 字段是常量"成本中心"，**`业务层级Id` 才是真实层级数字**；`上级成本中心` 字段不可靠（指向 name 不指向 code，且 lvl=2 的"上级"是空）。父匹配只能靠"上一级冗余路径名"。

## 组织架构树字段映射（7 层）

源端 `emp_realtime_roster` 每行包含 6 个层级字段：

```text
公司级组织 → 一级部门 → 二级部门 → 三级部门 → 四级部门 → 五级部门
```

代码端再叠一个**虚拟根节点**「创梦天地」（取自 `ORG_ROOT_NAME` 配置项）→ 总共 **7 层**。

字段为空字符串则截断（员工只到 N 级部门则建到 N 级）。

**节点 code 生成**：源端没给部门编码，代码用 `f"L{level}_{sha256(path)[:16]}"` 作稳定 code，DISTINCT 去重。

**Why**：组织树本就该来自员工实际所在部门，否则会和员工数据脱钩；且北森从不直接给"组织架构表"接口。

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
