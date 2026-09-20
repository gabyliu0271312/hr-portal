# PM-T003 首页 UI 验收契约

- completion_status: `incomplete`
- pixel_restore_status: `blocked`
- acceptance_scope: 静态首页视觉还原、周期数据读取和项目基础操作
- real_data_scope: 周期及项目列表读取；项目新建、编辑、启动、复制、删除写入
- uncovered_reasons: 与 `extracted-ui-contract.json` 顶层保持一致

## 1. 验收层级

| 层级 | 目标 | 当前状态 |
|---|---|---|
| structure | 页面 → 双栏卡片 → 周期列表/详情 → 项目列表组件树 | captured / not runtime verified |
| layout | bbox、内外边距、边界相邻、表格操作列固定 | captured / runtime not-run |
| visual | 字体、颜色、边框、圆角、阴影、SVG | captured / runtime not-run |
| behavior | 周期选择、搜索、hover、筛选面板 | captured in supplemental sessions |
| pixel | 目标截图与实际渲染 diff | not-run |

## 2. Given / When / Then

### 2.1 默认首页

- Given 用户进入 `/performance/settings` 的「周期与项目」页面，静态 fixture 已加载。
- When 页面完成首屏渲染。
- Then Header 高度为 `56px`，侧栏宽度为 `240px`，内容卡片 bbox 与 `extracted-ui-contract.json#/variant_contracts/cycle-project-home-default/geometry` 一致。
- And 页面背景为 `rgb(245,246,247)`，卡片为白底、8px 圆角和采集阴影。
- And 页面显示周期列表、周期详情、基本信息和项目设置。

### 2.2 周期列表

- Given 周期 fixture 包含采集到的周期名称顺序。
- When 页面渲染周期列表。
- Then 显示 `周期` 标题、`搜索周期` placeholder、图标型 `+` 按钮和选中项 `测试`。
- And 选中项使用 `rgb(225,234,255)` 背景和 `rgb(51,112,255)` 文字。
- And 列表容器允许纵向滚动，不改变详情 pane 的横向起点。

### 2.3 周期搜索

- Given 周期搜索框为空。
- When 输入 `2026`。
- Then 搜索框显示输入值，周期列表按本地 fixture 过滤。
- And 不发起真实周期查询，不产生写入请求。
- And 搜索控件尺寸、图标和 focus 视觉符合 `PerformanceSearchInput` 契约。

### 2.4 项目设置工具栏

- Given 项目设置区域已显示。
- When 页面渲染项目工具栏。
- Then `＋ 新建` 位于工具栏左侧，项目搜索和 `筛选` 位于同一水平行的右侧。
- And 新建按钮在有项目管理权限时打开项目表单，保存后项目出现在列表中。
- And 行操作按权限显示，编辑可保存基础信息，启动将状态变为“进行中”，更多菜单包含复制和删除；已启动项目删除置灰。
- And 接口失败保留当前页面并展示错误原因。

### 2.5 项目搜索

- Given 项目搜索框为空。
- When 输入 `项目`。
- Then 搜索框显示输入值，项目展示按已加载的项目列表过滤。
- And 不写入数据。

### 2.6 筛选 hover 和展开

- Given 筛选按钮处于 default。
- When hover 筛选按钮。
- Then 只改变采集契约允许的 hover 视觉，不改变表格数据。
- When click 筛选按钮。
- Then 展示采集到的筛选面板/overlay after 状态。
- And 不应用筛选、不保存、不提交。
- And overlay 不参与普通内容容器的 terminal visible child 计算。

### 2.7 项目表格

- Given 项目列表已加载。
- When 表格渲染。
- Then 列顺序为：项目名称、描述、项目管理员、状态、评估人数、操作。
- And 表头高度为 `47px`，数据行高度为 `49px`。
- And 操作列固定在右侧，1920 视口宽度为 `181.203125px`，1440/1366/1280 视口宽度为 `136px`。
- And 表格容器使用横向滚动，不通过绝对定位伪造固定列。
- And 行操作展示编辑、启动和更多；更多菜单在 hover/focus 后展示复制、删除，已启动项目删除置灰。

### 2.8 项目基础操作

- Given 项目操作用户拥有项目管理权限。
- When 用户点击新建、编辑、启动、复制或删除并完成必要确认。
- Then 对应项目 API 被调用，刷新页面后项目状态和基础信息保持一致。
- And 无授权项目的操作入口不显示，直接请求返回 403 时页面保留并展示错误。

### 2.9 响应式

- Given 页面分别在 1920×1080、1440×900、1366×768、1280×720、1024×768、375×812 渲染。
- When 页面完成布局。
- Then 1920/1440/1366/1280 的实测容器关系必须符合 pixel contract。
- And 1024/375 只验收无失控 body 横向溢出；具体移动端重排在 resize evidence 补齐前保持 blocked。

## 3. 禁止项验收

- [ ] 不引入项目成员、项目管理员配置或人员快照读取。
- [ ] 不以评估题业务字段替代项目字段。
- [ ] 不使用名称、索引或通用模板猜测视觉变体。
- [ ] 不用文字字形替代采集 SVG。
- [ ] 不把 `MoreOutlined` 的 BLOCKED path 自行近似实现。

## 4. 运行时验收输入

实现后必须提供：

- rendered UI contract JSON；
- 与目标状态相同 viewport/DPR 的实现截图；
- DOM/layout/computed 提取；
- 交互状态截图和动作路径；
- geometry、styles、text/visibility、line groups、container insets、variant invariants 的比较结果；
- 实际测试命令及结果。

当前实现截图、rendered contract 和 diff 均不存在，因此像素验收为 `not-run`，整体保持 `blocked`。
