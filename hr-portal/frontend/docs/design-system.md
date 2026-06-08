# HR Portal Design System

**版本**：v2.1 · **更新**：2026-06-06 · **作用域**：本仓 frontend 及后续接入的大型业务应用

## 大原则

HR Portal 是平台入口，不是单一工具页面集合。绩效管理、招聘管理、培训管理等大型业务应用可以拥有独立路由、独立布局、独立后台设置和独立业务权限，但必须继承同一套平台视觉基线。

统一原则：

- 平台主色固定为飞书蓝 `#3370ff`，不得为某个业务应用单独换主色。
- 页面背景、文本层级、按钮、表单、表格、弹窗、状态标签、导航选中态等基础 UI 规则保持一致。
- 业务应用可以增加业务语义色，例如绩效等级、流程节点状态、申诉状态、项目评价图表颜色。
- 视觉差异应体现业务信息表达，不应体现为另一套按钮、卡片、表格或菜单皮肤。
- 当前代码只保留一套设计 token，不做旧风格变量映射，不保留 Ledger/账册风兼容层。

目标体验：

```text
用户感觉仍在同一个 HR Portal 平台内，只是进入了一个更完整的业务应用。
```

## 风格定位

当前风格为平台化飞书风：

- 主色 `#3370ff` 飞书蓝，浅色辅以 `#eef2ff`
- 灰底页面 `#f4f6f9` + 白色 `<el-card>` 内容块
- Element Plus 作为基础组件体系
- 信息密度服从可读性，不追求极致紧凑
- 圆角、阴影、hover 动效保持克制，避免营销页或装饰卡片感

## 设计令牌

设计 token 的唯一源头是 [src/styles/tokens.css](../src/styles/tokens.css)。

[src/styles/index.css](../src/styles/index.css) 是唯一入口，由 `main.ts` 引入；它只负责导入全局样式并放置少量跨页面规则。

[src/styles/element-overrides.css](../src/styles/element-overrides.css) 只消费 `tokens.css` 中的 `--color-* / --font-* / --spacing-* / --radius-* / --shadow-*` 变量覆盖 Element Plus。

禁止重新引入以下旧变量族：

```text
--brand-*
--ink-*
--fs-*
--space-*
--r-*
--success-* / --danger-* / --warning-* 旧命名
```

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

状态色需要浅底或边框时，使用 `--color-success-light`、`--color-success-border`、`--color-danger-light`、`--color-danger-border` 等配套 token。

### 字体

系统默认 sans-serif，不引入外部字体包。数字、编码、SQL、技术字段可用 `--font-mono`。

### 圆角与阴影

- 常规卡片、工具卡片：`--radius-md`，不超过 `8px`
- 表单、按钮、Tag：Element Plus 统一覆盖
- 页面级卡片默认不加阴影，弹窗/浮层可用 `--shadow-popover`
- hover 可以改变边框色或浅背景，不建议使用强阴影和上移动效

## 菜单结构

```text
顶部 tab（一级）
  ├─ 左侧分组（二级）
  │    ├─ 左侧叶子（三级，对应页面）
  │    └─ 左侧叶子（三级，对应页面）
  └─ 左侧分组（二级）
```

菜单定义在 [backend/app/seed.py](../../backend/app/seed.py) 的 `MENU_TREE`。

层级语义：

| 层级 | 角色 | 是否对应路由 |
|---|---|---|
| 1（tab） | 顶部一级分类 / 应用入口 | 通常不直接对应页面 |
| 2（group） | 左侧分组标题 | 通常不直接对应页面 |
| 3（leaf） | 实际页面 | 必须挂 `meta.menuCode` |

大型独立应用可以进入后拥有自己的应用内顶部 tab 和左侧菜单，但入口与基础视觉仍继承 HR Portal。

## 页面模板

每个普通业务页面统一使用：

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

      <el-form inline style="margin-bottom: 16px">
        ...
      </el-form>

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
    </el-card>
  </div>
</template>
```

## 表格规范

表格五件套必须保留：

1. 外层包 `<div style="overflow-x: auto">`
2. `<el-table style="width: 100%" max-height="600">`
3. 全局 `.el-table .cell { white-space: nowrap; overflow: visible }`
4. 数据列用 `min-width`
5. 操作列 `width="280" fixed="right"`，按钮超过 3 个时使用下拉

禁止：

- CSS `position: sticky` 自实现固定列
- `.hp-table-wrap` 外层滚动容器
- 数据列硬写 `width` 造成窄屏挤压
- 表格外层和 `el-table` 内层同时做横向滚动

## 业务数据表

动态业务数据表的列定义由后端 `table_columns` 元数据决定，前端不写死列。

敏感列展示规则：

```vue
<span v-if="col.is_sensitive" style="color: var(--color-text-placeholder); font-family: monospace">
  ******
</span>
```

不要使用旧的 `.hp-redacted` 脱敏格栅。

## 组件约定

### PermissionButton

[src/components/PermissionButton.vue](../src/components/PermissionButton.vue) 是按钮级权限封装。

```vue
<PermissionButton menu="system.users" op="C" type="primary" @click="...">
  新建用户
</PermissionButton>
```

- `op` 取值：V / C / U / D / E
- 无权限时默认隐藏；`mode="disable"` 改为置灰
- 接受 Element Plus button props
- 图标用 slot 内的 `<el-icon>`，不使用 `:icon`

## 已废弃

以下旧实现已从代码中删除或不再使用，后续不要恢复：

```text
PageHead.vue
src/styles/components.css
.hp-eyebrow
.hp-redacted
.hp-row-status
.hp-ops
.hp-table-wrap
.hp-filter
.hp-pager
Ledger / 账册风 token
```

## 落地清单

| 文件 | 内容 |
|---|---|
| [src/styles/tokens.css](../src/styles/tokens.css) | 平台设计 token 唯一源头 |
| [src/styles/element-overrides.css](../src/styles/element-overrides.css) | Element Plus 主题覆盖 |
| [src/styles/global.css](../src/styles/global.css) | 全局基础样式 |
| [src/styles/index.css](../src/styles/index.css) | 统一样式入口 |
| [src/layouts/Default.vue](../src/layouts/Default.vue) | HR Portal 顶部 tabs + 左侧菜单 + 内容区 |
| [src/components/PermissionButton.vue](../src/components/PermissionButton.vue) | 按钮级权限封装 |

