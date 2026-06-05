# HR Portal — Design System

**版本**：v2.0 · **更新**：2026-05-23 · **作用域**：本仓 frontend

> **v2.0 重大变更**：从 v1 的「账册风/Ledger」全面转向「飞书风」——el-card 卡片 + 飞书蓝主色 + 三层菜单。
> 原 v1 的 PageHead / 行首色条 / 操作权限圆点 / 脱敏格栅等记忆点已**全部废弃**。

## 风格定位：飞书风

参考体系：成本分摊系统（`C:\Users\gaby.liu\.claude\projects\成本分摊系统`）

核心原则：
- 信息密度服从可读性，不追求极致紧凑
- el-card 卡片是基本容器单元
- 主色 `#3370ff` 飞书蓝，浅色辅以 `#eef2ff`
- 灰底页面 `#f4f6f9` + 白色卡片，对比清晰

---

## 设计令牌

完整定义见 [src/styles/index.css](../src/styles/index.css)。

### 颜色

| 用途 | 变量 | 值 |
|---|---|---|
| 主色 | `--color-primary` | `#3370ff` |
| 主色 hover | `--color-primary-hover` | `#2855cc` |
| 主色浅 | `--color-primary-light` | `#eef2ff` |
| 标题文字 | `--color-text-primary` | `#1a2233` |
| 正文文字 | `--color-text-regular` | `#374151` |
| 次要文字 | `--color-text-secondary` | `#5c6b82` |
| 占位文字 | `--color-text-placeholder` | `#9aa5b4` |
| 页面背景 | `--color-bg-page` | `#f4f6f9` |
| 卡片背景 | `--color-bg-card` | `#ffffff` |
| hover 背景 | `--color-bg-hover` | `#f0f5ff` |
| 边框 | `--color-border` | `#e4e9f0` |
| 成功 | `--color-success` | `#12b76a` |
| 警告 | `--color-warning` | `#f5920a` |
| 危险 | `--color-danger` | `#f04438` |

EP 主色变量已被覆盖，使用 `<el-button type="primary">` 直接得到飞书蓝。

### 字体

系统默认 sans-serif（`-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, ...`），不引入额外字体包。

---

## 三层菜单结构

```
顶部 tab（一级，2 个）
  ├─ 系统设置
  │    ├─ 权限管理（左侧二级分组）
  │    │    ├─ 用户管理（三级叶子，对应页面）
  │    │    ├─ 角色配置
  │    │    ├─ 管理单元
  │    │    └─ 字段分类
  │    └─ 数据接入
  │         ├─ 接口配置
  │         ├─ 表间关联
  │         └─ 数据视图（综合页 → 内含 5 张表入口）
  └─ 报表管理
       └─ 报表管理
```

菜单定义在 [backend/app/seed.py](../../backend/app/seed.py) 的 `MENU_TREE`。
菜单层级由 `parent_id` 决定，最深可到任意层级。

### 层级语义

| 层级 | 角色 | 是否对应路由 |
|---|---|---|
| 1（tab） | 顶部一级分类 | 否，点击跳到该 tab 下第一个叶子 |
| 2（group） | 左侧分组标题 | 否，纯视觉分组 |
| 3（leaf） | 实际页面 | ✅ 必须挂 `meta.menuCode` |

---

## 布局规范

### 整体框架

[src/layouts/Default.vue](../src/layouts/Default.vue) 实现：

```
┌────────────────────────────────────────────────────────┐
│ 顶部导航：系统名 + tabs       │  用户名 · 角色 · 头像   │  56px 高
├──────────┬─────────────────────────────────────────────┤
│ 二级分组 │                                              │
│  三级叶子│                内容区                        │
│  三级叶子│              （灰底 + el-card）              │
│ 二级分组 │                                              │
│  三级叶子│                                              │
└──────────┴─────────────────────────────────────────────┘
   220px              auto（剩余）
```

### 页面级布局

每个业务页面统一模板：

```vue
<template>
  <div style="padding: 24px">
    <el-card>
      <template #header>
        <div style="display: flex; justify-content: space-between; align-items: center">
          <span style="font-size: 16px; font-weight: 600">页面标题</span>
          <PermissionButton menu="xxx" op="C" type="primary">
            主操作
          </PermissionButton>
        </div>
      </template>

      <!-- 筛选区（可选） -->
      <el-form inline style="margin-bottom: 16px">
        ...
      </el-form>

      <!-- 表格 -->
      <div style="overflow-x: auto">
        <el-table
          v-loading="loading"
          :data="list"
          stripe
          style="width: 100%"
          max-height="600"
        >
          ...
        </el-table>
      </div>

      <el-pagination
        style="margin-top: 16px; justify-content: flex-end"
        ...
      />
    </el-card>
  </div>
</template>
```

---

## 表格规范（必读 · 强制）

> 这套规范来自反复踩坑后的最终方案（前后改了 10 多次）。参考成本分摊系统验证过的写法，**完全照抄，不要发挥**。

### 五件套（缺一不可）

1. **外层包 `<div style="overflow-x: auto">`** —— 容器溢出时提供横向滚动
2. **`<el-table style="width: 100%" max-height="600">`** —— max-height 是关键，它让 EP 创建独立 body-wrapper，fixed-right 才能激活
3. **全局 `:deep(.el-table .cell) { white-space: nowrap; overflow: visible }`** —— 已在 [styles/index.css](../src/styles/index.css) 全局生效；让单元格按内容真实宽度展开
4. **数据列用 `min-width="..."`** —— 让 EP 在窄屏自动滚动
5. **操作列 `width="280" fixed="right"`** —— 3 个按钮 + 中文文案的经验下限

### 操作列按钮约定

- ≤ 3 个按钮：直接平铺
- > 3 个按钮：用 `el-dropdown` 「更多」下拉

### 反面案例（已踩过的坑，禁止重现）

❌ **CSS `position: sticky` 自实现固定列** —— 会破坏 EP 的 table layout，列错位
❌ **`min-width` 配 `style="width: 100%"` 没 `max-height`** —— EP 等比压缩列，fixed-right 失效
❌ **外层 `.hp-table-wrap` 包 overflow + 内层 el-table 也滚动** —— 表头表体不同步，错位
❌ **写死 `width="160"` 而不是 `min-width`** —— 窄屏下数据列硬挤压

---

## 业务数据表统一渲染规范（C1 动态列）

> 5 张业务数据表（员工实时花名册 / 月度花名册 / 月度工资 / 月度成本分摊 / 成本中心月度维护）的**列定义不在前端写死**，由后端 `table_columns` 元数据动态决定。

### 渲染规则

```vue
<el-table-column
  v-for="col in columns"
  :key="col.code"
  :label="col.label"
  :prop="col.code"
  min-width="140"
>
  <template #header>
    {{ col.label }}
    <el-tag v-if="col.is_pk_part" size="small" type="primary" effect="plain">PK</el-tag>
    <el-tag v-if="col.is_sensitive" size="small" type="danger" effect="plain">敏感</el-tag>
  </template>
  <template #default="{ row }">
    <span v-if="col.is_sensitive" style="color: var(--color-text-placeholder); font-family: monospace">
      ▘▘▘▘▘
    </span>
    <span v-else>{{ formatCell(row, col) }}</span>
  </template>
</el-table-column>
```

### 标签

- **PK 列**：表头加蓝色 `PK` 徽章
- **敏感列**：表头加红色 `敏感` 徽章；行数据显示 `▘▘▘▘▘` 占位（不展示真实值）

### 类型化格式

按 `col.data_type` 智能展示：

| data_type | 渲染 |
|---|---|
| `string` | 直接 toString |
| `number` | 直接 toString（百分比类业务字段在 sync 时已转过） |
| `date` / `datetime` | `new Date(v).toLocaleString('zh-CN')` |
| `bool` | `是` / `否` |

空值统一显示为 `—`（em dash），不显示 `null` `undefined` 字面量。

### 字段管理入口

每张数据表页右上角放一个「字段管理」按钮，跳到 `/system/field-columns?table=<code>` 让管理员调列名/类型/顺序/敏感等。

---

## 组件 API 约定

### PermissionButton

[src/components/PermissionButton.vue](../src/components/PermissionButton.vue) —— 按钮级权限封装

```vue
<PermissionButton menu="system.users" op="C" type="primary" @click="...">
  新建用户
</PermissionButton>
```

- `op` 取值：V / C / U / D / E
- 无权限时默认隐藏；`mode="disable"` 改为置灰
- 接受所有 `el-button` 的 props（type / size / link / plain / disabled）
- **不接受 `:icon`** —— 图标用 slot 内的 `<el-icon>` 写

---

## 落地清单

| 文件 | 内容 |
|---|---|
| [src/styles/index.css](../src/styles/index.css) | 统一样式入口：CSS 变量 + body + el-table cell 全局规则 |
| [src/layouts/Default.vue](../src/layouts/Default.vue) | 顶部 tabs + 左侧二三级菜单 + 右侧内容区 |
| [src/views/Home.vue](../src/views/Home.vue) | 首页：欢迎卡片 + 菜单网格 |
| [src/views/system/Users.vue](../src/views/system/Users.vue) | 用户管理标准模板 |
| [src/views/system/Roles.vue](../src/views/system/Roles.vue) | 角色配置（列表 / 编辑双态） |
| [src/views/system/FieldCategory.vue](../src/views/system/FieldCategory.vue) | 字段分类（含字段分配抽屉） |
| [src/views/data/DataView.vue](../src/views/data/DataView.vue) | 数据视图综合页 |
| [src/components/PermissionButton.vue](../src/components/PermissionButton.vue) | 按钮级权限封装 |

---

## 演进路线

- ✅ **Phase 3（2026-05-23）**：飞书风重构完成
- ⏳ **Phase 4**：北森接入 + 5 张数据表 + 双层级树（成本中心树 / 组织架构树）
- ⏳ **Phase 5**：管理单元（数据范围标签）
- ⏳ **Phase 6**：分摊工作流 + menu_actions 权限模型升级（见 [memory/hr_portal_menu_actions_upgrade.md](../../memory/hr_portal_menu_actions_upgrade.md)）
