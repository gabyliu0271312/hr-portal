# HR Portal Design System

**版本**：v2.2 · **更新**：2026-11-26 · **作用域**：本仓 frontend 及后续接入的大型业务应用

> **唯一事实源**：[src/styles/tokens.css](../src/styles/tokens.css) 的实际值；视觉基准为绩效模块飞书实测线（`--perf-*` / `--ui-*`）。
> 本文档与 tokens.css 冲突时**以 tokens.css 为准**；发现冲突先修文档，不得据旧文档写代码。组件复用硬规则见 [hr-portal/CLAUDE.md](../../CLAUDE.md)。

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
- 灰底页面 `#f5f6f7` + 白色 `UiSurface` 内容块（不要裸 `<el-card>`）
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
| 主色 hover | `--color-primary-hover` | `#1456f0` |
| 主色浅 | `--color-primary-light` | `#eef2ff` |
| 标题文字 | `--color-text-primary` | `#1f2329` |
| 正文文字 | `--color-text-regular` | `#374151` |
| 次要文字 | `--color-text-secondary` | `#5c6b82` |
| 占位文字 | `--color-text-placeholder` | `#8f959e` |
| 页面背景 | `--ui-page-background` | `#f5f6f7`（`--color-bg-page` 仅旧页面兼容） |
| 卡片背景 | `--color-bg-card` | `#ffffff` |
| hover 背景 | `--color-bg-hover` | `#f0f5ff` |
| 边框 | `--color-border` | `#bbbfc4` |
| 成功 | `--color-success` | `#12b76a` |
| 警告 | `--color-warning` | `#f5920a` |
| 危险 | `--color-danger` | `#d83931` |

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

每个普通业务页面统一使用（对齐绩效线结构）：

```vue
<template>
  <div style="padding: var(--spacing-6)">
    <div style="display: flex; justify-content: space-between; align-items: flex-start">
      <PageTitle title="页面标题" description="可选描述" />
      <PermissionButton menu="xxx" op="C" type="primary">主操作</PermissionButton>
    </div>

    <UiSurface>
      <UiListToolbar v-model:keyword="keyword" @search="onSearch" />

      <UiTable
        :columns="columns"
        :rows="list"
        :loading="loading"
        row-key="id"
        sticky-header-top="var(--performance-table-sticky-top)"
        max-height="600"
      >
        <template #cell="{ row, column, value }">...</template>
      </UiTable>

      <UiPagination
        :page="page"
        :page-size="pageSize"
        :total="total"
        @page-change="onPageChange"
        @page-size-change="onSizeChange"
      />
    </UiSurface>
  </div>
</template>
```

完整参考：[AllocationResult.vue](../src/views/salary/AllocationResult.vue)。`UiTable` 已内置吸顶/滚动/固定列，**不需要**外层 `overflow-x` div，也不要 `el-table` 五件套。

## 表格规范

统一使用 `UiTable`（[components/ui/UiTable.vue](../src/components/ui/UiTable.vue)），它已内置表头吸顶、横向滚动同步、固定列、空/加载态、多选与排序。调用方只声明列与数据：

```vue
<UiTable
  :columns="[{ key: 'name', label: '名称', minWidth: 160 }]"
  :rows="list"
  :loading="loading"
  row-key="id"
  sticky-header-top="var(--performance-table-sticky-top)"
  max-height="600"
>
  <template #cell="{ row, column, value }">...</template>
</UiTable>
```

- 数据列用 `minWidth`；固定列用 `fixed: 'left' | 'right'`
- 操作列在 `#cell` 插槽内渲染 `PermissionButton`，超过 3 个改下拉
- 空态用 `#empty` 插槽，加载态由 `loading` 驱动

禁止：

- 裸 `<el-table>` 搭"五件套"
- CSS `position: sticky` 自实现固定列、`.hp-table-wrap` 外层滚动容器
- 数据列硬写 `width` 造成窄屏挤压
- 表格外层与内层同时做横向滚动

## 业务数据表

动态业务数据表的列定义由后端 `table_columns` 元数据决定，前端不写死列。

动态列由 `UiTable` 的 `columns` 承载（`key` = 字段 code），单元格在 `#cell` 插槽渲染。敏感列展示规则：

```vue
<template #cell="{ row, column, value }">
  <span v-if="sensitiveCodes.has(column.key)" style="color: var(--color-text-placeholder); font-family: monospace">
    ******
  </span>
  <span v-else>{{ formatCell(row, value) }}</span>
</template>
```

不要使用旧的 `.hp-redacted` 脱敏格栅，也不要裸 `<el-table>`。

## 组件约定

### 图表（ECharts）

- 唯一入口 [components/ui/UiChart.vue](../src/components/ui/UiChart.vue)；颜色、轴线、字体从 `tokens.css` 的 `--ui-chart-*` 读取（经 `composables/useChartTheme.ts`），图表代码不写死色值。
- 分类色按 `--ui-chart-series-1..8` 固定顺序使用，不循环生成；新增图表类型在 `UiChart.vue` 的 `use([...])` 注册。
- series 2–5 对白底对比度 <3:1，必须配可见直接标签或表格视图（relief 规则）。
- 轴样式默认由组件注入；需覆盖时在 option 的 `axisLine / splitLine / axisLabel` 内局部指定。

```vue
<UiChart
  :option="{
    xAxis: { type: 'category', data: ['A', 'B'] },
    yAxis: { type: 'value' },
    series: [{ type: 'bar', data: [3, 5] }],
  }"
/>
```

### 绩效浮层（PM-T004-T05-F36，2026-10-29）

- 唯一外壳为 `PerformancePopover.vue`：负责 Teleport、实测尺寸定位、上下翻转、水平避让、滚动/resize 重定位、Escape 关闭、箭头指向与内容区滚动。`PerformancePromptPopover` 与评级等级详情已复用它；`PerformanceInfoPopover` 随其并行空态改动单独迁移，现有箭头与定位暂保持原实现。
- 外观只消费 `tokens.css` 的 `--performance-popover-*`：背景、边框、`1px` 边框、`8px` 圆角、`12px/16px` 内边距、`22px` 行高、三层阴影、层级、宽度、间距、视口边距、箭头尺寸与箭头内缩。组件内不新增浮层颜色、阴影或圆角硬编码。
- 箭头固定 `16×8px` SVG，随上下方向翻转，中心始终指向触发目标；长内容在可用空间内滚动，不得覆盖目标或溢出视口。
- 调用方只提供内容插槽与业务类名（如 `content-class`），不复制定位逻辑；确需独立外观时在调用方追加类名覆盖，不修改共享 token 语义。

```vue
<PerformancePopover :visible="visible" :anchor="anchor" name="performance-rating-popover" content-class="rating-popover__content">
  <slot />
</PerformancePopover>
```

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

### 固定字段筛选浮层（2026-11-28）

- 通用外壳 `PerformanceFilterPopover`：复用 `PerformancePopover` 的 Teleport/定位/翻转/滚动/Escape；宽 `--performance-filter-popover-width`（348px，max 420），内容 padding 12/16、边框/圆角/阴影沿用 popover token；`close-on-outside` 忽略锚点与 `.performance-select-shell__popup` 远程下拉。
- 字段使用 `PerformanceFormItem compact`（标签 14/600/22，块距 16px）；页脚 `PerformanceFilterActions`（row-reverse，清除/取消/确定，60×28，padding 8/8/12，sticky）。
- 人员多选 `PerformancePersonFilterSelect`：基于 `PerformancePersonSelect`，`remote-search` 空关键词不请求/不展示，输入 250ms 后请求；选项 52 高、32 头像、14 姓名 + 12 部门；已选 chip 24 高、pill、头像 20（`tag-shape="round"`）。
- 状态单选 `PerformanceSearchSelect selection-style="plain"`：只读输入、点击展开，选项 30 高，hover 0.08。
- 触发按钮 `PerformanceFilterButton` 增加 `active/count`：激活底 `--performance-filter-active-background`（#E1EAFF），边框/文字主色，文案“筛选 (n)”；n 为非空字段数。
- 新增 token 集中在 `--performance-filter-*` 与 `--performance-select-tag-round-*`；主按钮 hover 统一 #336DF4，link hover 同色，控件边框 #D0D3D6。

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

### 主数据工具栏、勾选项与弹窗（B06.cc，2026-11-15）

- `UiListToolbar.vue` 为共享搜索/动作布局，提供 `left / search / filters / actions` 插槽；`PerformanceListToolbar` 继续复用它，并在 `search` 插槽保留 `PerformanceSearchInput` 入口，绩效消费保持原行为。成本中心搜索占剩余宽度，动作按内容收缩，控件行 32px、项间距 20px，窗口不足可换行；不把 32px 当作文字行高。
- `UiCheckbox.vue` 的视觉方块 16px、圆角 4px、图文间距 8px、外层最低 32px；当前成本中心保留“含停用成本中心”的业务语义，不因设计稿占位“包含下级部门”改业务含义。
- `UiDialogShell.vue` 是跨模块弹窗内核，`PerformanceDialogShell` 仍为绩效消费入口；新增成本中心弹窗默认 600px，头部 `24px 56px 24px 24px`，内容区 `0 24px`、底部外间距 24px，操作区 `0 24px 24px`。表单项间距20px；标签行高22px、标签区32px含底部8px间距；输入/树选择32px。操作按钮间距24px按本次Ardot稿，不全局改变绩效按钮间距。
- `tokens.css` 维护 `--ui-toolbar-* / --ui-search-* / --ui-checkbox-* / --ui-dialog-* / --ui-form-*` 组件Token，优先引用现有绩效Token，不在业务组件定义另一套色板。Ardot集合/变量路径对应组件用途；代码唯一数值源仍为 `tokens.css`，Ardot变量间alias未建立，不宣称已自动同步。
- 弹窗支持焦点约束、Escape关闭、loading阻止关闭及视口尺寸限制；调用方只组装业务表单，不复制弹窗三段壳。Element树选择器使用 `popper-class="ui-dialog-tree-popper"`，由 `element-overrides.css` 消费 `--ui-dialog-popper-z-index` 保证浮层高于弹窗遮罩，不在业务组件写 z-index。

### 主数据树与维护表单（成本中心实例）

- 成本中心目录复用 `OrganizationTree.vue` 的 `mode="cc"`，页面只负责组装，不在页面内复制树展开、搜索和健康提示逻辑。
- 成本中心新增使用共享 `UiListToolbar.vue`、`UiDialogShell.vue`、`PermissionButton.vue` 和 `el-tree-select`；工具栏高度、搜索框高度、表单控件高度、弹窗三段 padding 只能消费 `tokens.css`，不在业务页面写硬编码尺寸。
- 新建表单字段为名称、编码、上级成本中心；编码由服务端做含停用节点的全局唯一校验，前端校验仅用于即时反馈，不能替代服务端拒绝。
- 上级候选必须来自成本中心树接口，保存稳定 `parent_id`，不得按名称自行拼接父级；上级停用、孤儿、跨树父或结构异常由服务端拒绝。
- 页面正常态不额外添加设计稿没有的成功 toast、引导文案或字段说明；错误只在输入校验、权限拒绝和保存失败时显示。
- 成本中心新增属于获准 `local` 维护子集；`external_sync` 节点不得由页面手工覆盖，创建后目录刷新显示稳定节点。

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



### 绩效基本信息分隔线

人员基本信息相邻字段使用 `components/performance/PerformanceProfileSeparator.vue`，由详情头部与填写页头部共用。只在两个非空、获准显示的字段之间渲染，不在末尾补线。组件固定使用12px高度、上下2px/左右8px间距、text-bottom基线与 `--color-border` 的1px左边框；不使用字符或1px背景色块代替边框，避免非整数DPR的粗细差异。

```vue
<PerformanceProfileSeparator v-if="index < profileParts.length - 1" />
```
