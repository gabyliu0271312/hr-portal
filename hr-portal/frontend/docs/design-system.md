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

### Token 分层

`tokens.css` 按三层维护，新增值先判断应落在哪一层：

1. **基础 Token**：颜色、字号、行高、间距、圆角、阴影、布局和层级等客观值。
2. **语义 Token**：按用途命名的页面、表面、边框、操作和状态别名，例如 `--color-surface-page`、`--color-line-control`、`--color-action-primary`。
3. **组件 Token**：只服务于稳定共享组件的尺寸和状态，例如 `--performance-switch-width`、`--performance-control-height`、`--performance-dialog-width`。

提炼规则：

- 同一视觉规则在多个页面或共享组件中重复时，才升级为 Token；
- 组件专属尺寸放在组件 Token，不升级为全局布局标准；
- 页面一次性测量值（例如流程画布、右侧面板和特定弹层宽度）保留在页面或 UI contract；
- 新增 Token 必须优先复用现有语义值，禁止为同一语义创建第二个命名族；
- 视觉证据缺失的值不得伪装成已确认的全局标准。

### 绩效共享组件

绩效页面优先复用 `src/components/performance/` 中已经提炼的共享组件。基础组件负责通用视觉和交互，绩效业务组件负责领域规则，页面只负责状态持有和组装。

| 组件 | 职责 | 适用范围 |
|---|---|---|
| `PerformanceSwitch.vue` | 开关、禁用态、`v-model` | 绩效配置和表单开关 |
| `PerformanceCheckbox.vue` | 复选框、勾选/禁用态、`v-model` | 绩效配置选项 |
| `PerformanceIconButton.vue` | 统一图标按钮和状态属性 | 编辑、删除、展开、关闭等操作 |
| `PerformanceRatingTag.vue` | 展示型评级胶囊，`label` + 模板配置 `color`，24px高 | 统计表头等只读评级展示；不承担评级选择 |
| `PerformanceSortHeader.vue` | `label`/默认插槽 + `order`，发出 `click`；10px上下三角 | 原生表/Element Plus表头；宿主负责排序循环与数据 |
| `PerformanceTextField.vue` | 输入框/文本域和错误、禁用、字数状态 | 绩效表单 |
| `PerformanceCountedTextarea.vue` | 带标签和计数器的多行文本框 | 长文本配置 |
| `PerformanceFormField.vue` | 标签、输入控件和错误提示组合 | 简单绩效表单 |
| `PerformanceRequiredLabel.vue` | 统一必填标记，可切换必填态 | 表单标签 |
| `PerformanceConfirmDialog.vue` | 危险操作确认、Escape、焦点归还 | 删除等不可逆操作 |
| `PageHeader.vue` / `FullScreenModal.vue` | 全屏业务页 Header、内容滚动和 Footer 壳 | 新建/编辑向导 |
| `PerformanceExecutorSelect.vue` / `WorkflowExecutorField.vue` | 执行人选择和节点执行人变体 | 流程模板配置 |
| `PerformanceContentRenderer.vue` | 内容预览和已配置内容渲染 | 模板内容设置、预览 |
| `PerformanceTemplateRenderer.vue` | 模板任务的 section/field 渲染入口，支持 edit/readonly | 工作总结及后续模板驱动任务 |
| `PerformanceTemplateSection.vue` / `PerformanceTemplateFieldRenderer.vue` | 内容块、重复实例和 rich text/rating/tag 字段变体 | 模板任务填写与提交后展示 |
| `PerformanceReviewCompletionNotice.vue` | 完成提示与编辑入口 | 所有可编辑的已完成绩效任务 |

组件使用规则：

- 页面不得重新实现已有的按钮、开关、复选框、输入框、确认弹窗或内容预览；
- 出现第二个相同业务结构时，先评估抽取共享组件，再复制页面标记；
- 共享组件暴露稳定的 props/emits，表单状态优先使用 `v-model`；
- 组件只承载稳定的通用行为，绩效节点、模板锁定、角色权限和计算规则留在业务层；
- 页面专属布局和像素变体通过显式 class、prop 或局部 Token 声明，不修改共享组件默认值。
- 绩效评估运行页统一消费 `--performance-review-surface-inset`、`--performance-review-content-max-width`、`--performance-review-page-bg`、`--performance-review-completion-bg`、`--performance-review-completion-icon` 与 `--performance-review-readonly-surface`；新节点不得在页面内复制相同 surface 值。


```text
--brand-*
--ink-*
--fs-*
--space-*
--r-*
--success-* / --danger-* / --warning-* 旧命名
```

### 评级底色与排序表头

- `performanceColorOptions.ts` 是模板评级色板真源。保存值 `level.color` 对应色板 `value`；`performanceLevelBackground(value)` 复用模板原有规则，映射成 `trigger` 展示底色，支持空白/大小写归一化，未知自定义色原样保留，缺失返回透明。
- `ReviewRuleConfigRenderer` 与 `PerformanceRatingTag` 共用此函数。报表 API/适配器应提供对应模板或周期快照颜色；禁止按“1星/2星”等名称或排序位置硬编码颜色。当前模拟数据不是实时模板读取。
- 示例：`<PerformanceRatingTag :label="rating.label" :color="rating.color" />`。标签只展示、非按钮，文字溢出省略并保留 title。模板配置页原有22px胶囊布局不在本次迁移，只有底色转换共用，避免改变已确认模板布局。
- `PerformanceSortHeader` 的 `order` 为 `'ascending' | 'descending' | null`，默认插槽可放评级标签；只发出 `click`，不排序、不发请求。宿主维护 `aria-sort` 和排序状态，禁止按钮嵌套。部门统计使用已有Element Plus排序/树展开能力，不复制表格引擎。
- 评级标签颜色表示模板配置；统计矩阵热力色阶表示数据展示等级，二者不能共用字段。色阶阈值未确认时由mock/provider显式提供，不能从少数样本反推。

### 颜色

| 用途 | 变量 | 值 |
|---|---|---|
| 主色 | `--color-primary` | `#3370ff` |
| 主色 hover | `--color-primary-hover` | `#1456f0` |
| 主色浅 | `--color-primary-light` | `#eef2ff` |
| 标题文字 | `--color-text-primary` | `#1f2329` |
| 正文文字 | `--color-text-regular` | `#374151` |
| 次要文字 | `--color-text-secondary` | `#5c6b82` |
| 占位文字 | `--color-text-placeholder` | `#8f959e` |
| 页面背景 | `--color-bg-page` | `#f4f6f9` |
| 卡片背景 | `--color-bg-card` | `#ffffff` |
| hover 背景 | `--color-bg-hover` | `#f0f5ff` |
| 边框 | `--color-border` | `#bbbfc4` |
| 成功 | `--color-success` | `#12b76a` |
| 警告 | `--color-warning` | `#f5920a` |
| 危险 | `--color-danger` | `#d83931` |

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

### 全屏业务壳

绩效新建/编辑类全屏页面统一复用 `src/components/performance/PageHeader.vue` 和 `FullScreenModal.vue`。共享组件只管理跨页面稳定结构，业务页面管理自己的内容宽度与卡片。

#### 共享职责

- `PageHeader`：56px header、返回控件、分隔线、title、subtitle/actions插槽。
- `FullScreenModal`：fixed viewport shell、header/content/footer分区、滚动和事件分发。
- 默认按当前viewport布局：`min-width:0`；禁止在共享组件内写入某一业务页面的1200/1300px最小宽度。
- 业务表单宽度、卡片数量、卡片高度和字段栅格归页面/业务表单组件；例如800px表单容器由业务内容层居中，不属于全屏壳。

#### 页面专属变体

页面确有宽屏下限、步骤条或专属header actions时，通过显式prop、variant class或CSS变量声明。禁止把页面专属尺寸写成共享默认值，再让其它页面覆盖。

#### Footer间距

- 操作栏高度、定位和事件属于共享壳；按钮业务状态属于调用方。
- 按钮间距必须只有一个来源。使用容器`gap`时清除Element Plus相邻按钮margin；使用按钮margin时容器不得再设置同值gap。
- 对采集还原页面，以目标证据的间距机制为权威，不得同时叠加两套规则。

#### 验收边界

- 壳任务只验收header、content scroll、footer和路由。
- 业务表单任务验收卡片、字段和内容高度。
- 占位卡不得作为目标业务卡片的像素证据。

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

