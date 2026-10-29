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

### 绩效内容配置选择态

页面标题、内容块与题目统一复用 `PerformanceContentSelectionFrame.vue`：hover 使用 `--performance-content-hover-outline`（1px dashed）及 `--performance-content-hover-outline-offset`（-1px）；选中使用 `--performance-content-selected-shadow`（内嵌2px实线）。hover 不改变选中目标；点击时由页面协调标题与内容块互斥选中。

### 绩效富文本输入

- `PerformanceRichTextEditor.vue` 是配置预览和实际填写共用的编辑内核，统一选区、格式命令、列表、链接、清洗、输入回显和断行；禁止在业务调用方另写 `execCommand` 编辑引擎。
- `modelValue` 为 HTML 字符串；`update:modelValue` 更新内容，`queue-save` 在 blur 通知调用方，`activate` 报告当前编辑器。外部工具栏通过 expose 的 `active/rememberSelection/command` 控制。`readonly` 禁止输入但保留 DOM；正式结果只读展示仍由字段 renderer 净化渲染。
- `default`（130/90px）、`task-entry`（124/88px）、`tag`（34px）只控制已存在的外观尺寸，宽度始终跟随父容器。默认值不得写死采集491/473/457px或100vw。使用 `grid-template-columns:minmax(0,1fr)`、`min-width:0`、`white-space:pre-wrap` 和 `overflow-wrap:anywhere` 实现自然增长，不裁切长文本。
- `PerformanceTagRichTextInput.vue` 在配置预览和实际填写中共用单外框、顶部单一工具栏和各标签独立输入区域；内部使用 `tag/hideToolbar` 编辑器。接收 `options` 和 `{tags,notes}`，兼容旧 `{tags,note}`。当前编辑对象由焦点/选区决定，移除后回退首个已选项。标签复选框及保存策略属于调用方：配置试填不写模板，实际填写沿既有答案保存。

### 日期时间展示

- 业务页面日期时间统一为 `YYYY-MM-DD HH:mm`，例如 `2022-12-06 18:06`，不显示 `T`、秒或毫秒；复用 `src/utils/datetime` 的 `formatDisplayDateTime`，按现有平台北京时间（Asia/Shanghai）展示，不依赖浏览器本地时区。
- 仅在展示层格式化；API、数据库、时间选择器提交与回填不截断精度。纯日期字段继续使用日期规则，不补时间。
- 操作日志、执行日志及后台日志保留精确时间；现有 `formatDateTime` 保持秒级输出，不受业务展示规则影响。

### 字体

系统默认 sans-serif，不引入外部字体包。数字、编码、SQL、技术字段可用 `--font-mono`。

### 绩效题目标题

工作总结、评分评级、自定义文本和标签题的 item 标题统一添加全局类 `performance-item-title`；字体与颜色只在 `styles/global.css` 的这一份规则中消费 `styles/tokens.css` 的 `--performance-item-title-*` 语义 token。默认字体族引用 `--font-sans`，字号引用 `--font-size-md`（14px），字重600、行高22px、颜色引用 `--color-text-primary`（#1F2329）。后续全局调整只修改这些 token，不在题型组件中重复定义颜色/字体，不继承内容详情容器的次文本色。

布局、间距、必填标记及明确的隐藏/禁用状态由原组件维护；页面标题、内容块主标题、描述、提示内容不属于此标题角色。新增相同语义的题目标题使用公共类，不另建局部字体规则。

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

### 绩效选择框（CR-005-T07，2026-10-27）

- 通用入口为 `PerformanceSearchSelect`，内部复用 `PerformanceSelectShell` 与 `PerformanceSelectTag`；人员、角色、原MultiSelect和组织树入口复用同一壳/标签。业务页面不自行实现标签折叠与删除。
- 下拉列表无左侧复选框，单/多选均在右侧显示选中勾。真正的权限树复选框、布尔选项、表格行选择不属于该规则。
- 多选按值数组顺序单行展示，放不下的连续后缀折叠为 `+N`；悬停仅显示隐藏标签，同一标签组件支持删除和补位，无`+0`。计数先预留宽度，不能固定显示前两项。选择、删除、搜索和重新打开测量，窗口resize只更新浮层位置，不主动重排标签。
- Token唯一源为 `tokens.css` 的 `--performance-select-*`：主框32px、内容28px、标签24px；选项高度/内边距、hover/selected背景、右勾尺寸/色、标签间距/底色/删除图标、溢出浮层尺寸与padding集中配置。边框/禁用沿用field token，浮层沿用popover token。无效/禁用、旧值回显、空态保留。
- 描述丰富、数值类型或已有专用hover交互的选择器保留业务结构，但消费同一token。Element选择器同时声明 `class="performance-token-select"` 和 `popper-class="performance-token-select-popper"`（可合并既有class），由绩效专用适配层统一；非绩效选择器不受影响。
- 选择框只承诺按调用方值数组显示。通知`weekdays`前后端保序去重并持久化；`days_before`仍沿用排序契约，其他业务API不被组件静默重写。

```vue
<PerformanceSearchSelect v-model="selectedValues" :options="options" multiple aria-label="选择人员" />
<PerformanceSearchSelect v-model="selectedValue" :options="options" selection-style="plain" aria-label="选择类型" />
```

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

