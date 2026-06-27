---
name: hr-portal-add-menu-sop
description: "HR 提效工具新增菜单页面的强制 5 步 SOP — 用户说\"加页面/加菜单/加功能\"时必须按此流程执行（三级菜单结构）"
metadata: 
  node_type: memory
  type: feedback
  originSessionId: c8cd5960-c3b5-4d9d-8617-32a919aaf2a4
---

# HR 提效工具新增菜单页面 SOP

**触发场景**：用户在 HR 提效工具项目（`D:\AI项目\HR提效工具搭建\`）里说要"新加一个 XX 页面 / 菜单 / 功能模块"。

**Why**：菜单系统是"半自动"——`MENU_TREE` 一加，所有角色配置矩阵自动铺开，但代码侧（Vue 文件 + 路由）必须人工注册。任何一步遗漏都会让权限矩阵看不到、或者路由 404。

**菜单层级**（2026-05-23 重构为三级）：

```
tab (一级，顶部) → group (二级，左侧分组) → leaf (三级，左侧叶子 = 实际页面)
```

新页面落在**第三级（leaf）**。

**How to apply**：

1. 创建 `frontend/src/views/<group>/<Name>.vue`，**整页用 `<el-card>` 包裹**（平台飞书风格），所有按钮套 `<PermissionButton menu="..." op="C|U|D|E|V">`
    - 表格必须严格按设计规范"五件套"实现（外层 overflow-x:auto + el-table width:100% + max-height:600 + min-width 列 + fixed:right 操作列）
   - 颜色、圆角、阴影、字体只使用 `frontend/src/styles/tokens.css` 中的平台 token，不要新增模块私有主色或恢复 `hp-*` 旧样式
    - 直接复制 [Users.vue](D:\AI项目\HR提效工具搭建\hr-portal\frontend\src\views\system\Users.vue) 当模板改
2. 在 `frontend/src/router/index.ts` 注册路由，必须带 `meta.menuCode`，且与第 3 步 code 完全一致
2.5. **⚠️ 必改 `frontend/src/constants/menuRoutes.ts` 的 `MENU_ROUTE_MAP` 加一行 `'<code>': '<路由路径>'`**——漏了这步：DB 菜单建了、`/auth/me` 也返回了（"可访问菜单 N 项"会算上它），但**首页「快速进入」卡片不显示、点击跳不过去**，因为 Home.vue 用 `MENU_ROUTE_MAP[code] !== undefined` 过滤。2026-06-23 加「操作日志」就栽在这里。
3. 在 `backend/app/seed.py` 的 `MENU_TREE` 添加 dict 到**对应二级分组的 children 数组**：
   - `system.auth` → 权限管理类（用户/角色/管理单元/字段分类...）
   - `system.datasource` → 数据接入类（接口/表关联/数据视图...）
   - `system.params` → 参数配置类（补偿金规则/模板维护...）
   - `report` → 报表类
   - code 命名：`<父级前缀>.<snake_case>`，**投产后永不修改**
4. `docker compose up -d --build backend`（**必须 --build**，restart 不会重新 COPY 代码；seed 幂等）
5. 引导用户去【系统设置 → 权限管理 → 角色配置】UI 上勾权限，**不要替用户改数据库**

完工后必须输出 4 项自查清单（路由 menuCode / PermissionButton 套全 / API 能查到 / 矩阵自动出现）。

详细 SOP 见项目级 CLAUDE.md：`D:\AI项目\HR提效工具搭建\hr-portal\CLAUDE.md`

---

## 数据接入相关的特殊场景（C1 动态列后）

如果用户说的是「**加一个数据表 / 接入新数据源 / 加一个字段**」而不是加完整页面，**绝大多数情况不需要走上面的 5 步 SOP**：

| 用户诉求 | 需要做的事 | 代码改动 |
|---|---|---|
| 新接入一张业务表（如 attendance_monthly） | 在 `data/models.py` 加一个空模型 + DATA_TABLES 注册 + migration 建表 + 在 `seed.py` 加 datasource + 加菜单 | 后端 + migration |
| 接入新的数据源类型（如飞书人事/SAP） | `frontend/src/config/dataSources.ts` 加 SOURCE_TYPES 一项 + `datasources/beisen_client.py` 加 Client 类 + make_client 注册 | 后端 + 前端配置文件 |
| 已有表加新字段（北森报表多了一列） | **零代码改动**：下次同步自动注册到 `table_columns`，进字段管理页改中文名/敏感即可 |  ❌ 不需要 |
| 已有表字段改名 / 改类型 / 改顺序 / 改主键 | 进字段管理页（`/system/field-columns`）改 |  ❌ 不需要 |

**核心原则**：业务表 schema 自 2026-05-23 起锁死为 `pk_hash + raw + synced_at`，**任何字段维度的变更都不动代码**。详见 [[hr-portal-system]] 「数据层架构」。

**架构决策依据**（驳回过的方案）：

- 用户曾问"是否做菜单 CRUD 管理页让全自动" → 已论证不值得：1-2 天改造只省 6 行代码 + restart，且引入动态路由调试复杂度。HR 工具是公司内部工具（场景 A），SOP 方案性价比最高。仅当变成多租户 SaaS（场景 B）或要给非程序员管理员发权限（场景 C）才值得做菜单 CRUD。

关联：[[hr_portal_system]] [[hr_portal_pitfalls]]

---

## 大型独立应用不要按普通菜单页 SOP 处理

当用户要新增的是绩效管理、招聘管理、培训管理、员工关系等大型独立业务应用时，不应直接按普通三级菜单 leaf 页面处理。

先判断是否符合独立应用标准：

- 有自己的顶部导航或复杂页面布局
- 有独立后台设置
- 有独立角色或权限体系
- 有流程、节点、任务、评价或审批类业务身份权限
- 需要从飞书等外部入口独立访问
- 后续可能独立演进为单独应用或子系统

符合时，按“应用接入与入口权限模型”处理：

```text
specs/001-hr-permission-portal/application-access-model.md
```

统一权限命名：

```text
<app_code>.app
<app_code>.admin
```

示例：

```text
performance.app
performance.admin
```

HR Portal 只管应用入口和后台入口；业务应用内部权限由业务应用自己管理。
