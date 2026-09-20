# PM-T003 首页组件模型

- completion_status: `incomplete` (global capture; target variant ready)
- pixel_restore_status: `blocked` (runtime pixel diff not yet run)
- target implementation_readiness: `ready` for `cycle-project-home-default`
- source of truth: `extracted-ui-contract.json`
- implementation brief status: `design_incomplete`
- uncovered_reasons: 与 `extracted-ui-contract.json` 顶层保持一致

## 1. Component tree

```text
PerformanceSettingsShell [clone:base]
├── PerformanceTopHeader [clone:base]
│   ├── ProductLogo
│   ├── ProductTitle
│   └── UserAvatar
├── PerformanceSettingsSidebar [clone:base, hybrid:nav-hover:hybrid-001-after]
│   ├── SettingsCategory
│   ├── ActiveNavItem: 周期与项目
│   └── SecondaryNavItems
└── SettingsContent [clone:base]
    └── CycleProjectCard [clone:base]
        ├── CycleListPane [clone:base, hybrid:cycle-select:hybrid-001-after, hybrid:cycle-search:hybrid-001-after]
        │   ├── CycleHeading
        │   ├── PerformanceSearchInput
        │   ├── PerformanceCreateButton variant=icon
        │   └── CycleItems
        └── CycleDetailPane [clone:base]
            ├── CycleDetailHeader
            ├── ChangeAlert
            ├── CycleBasicInfo
            └── ProjectSettings [clone:base]
                ├── ProjectToolbar
                │   ├── PerformanceCreateButton variant=text
                │   ├── PerformanceSearchInput
                │   └── FilterButton
                ├── PerformanceManagementTable
                │   ├── ProjectColumns
                │   └── FixedOperationColumn
                └── ProjectPagination
```

页面只负责组装和持有静态 fixture 状态；视觉控件行为属于共享组件；详情区 x/y、列表列宽和容器间距由父级负责。

## 2. Component inventory

| 层级 | 组件 | 职责 | 复用 | source_state_ids |
|---|---|---|---|---|
| 页面 | `PerformanceSettingsShell` | Header、侧栏、内容区组装 | 页面级 | `clone:base`、三组 responsive |
| 业务 | `PerformanceSettingsSidebar` | 应用设置菜单和 active/hover | 本模块 | `clone:base`、`hybrid:nav-hover:hybrid-001-after` |
| 业务 | `PerformanceCycleListPane` | 周期标题、搜索、加号、周期项 | 本模块 | `clone:base`、cycle select/search |
| 业务 | `CycleDetailPane` | 标题、提示、基本信息、项目区上下文 | 本模块 | `clone:base` |
| 业务 | `ProjectSettings` | 项目设置区域组装 | 本模块 | `clone:base`、project search/filter |
| 基础 | `PerformanceSearchInput` | 搜索壳、图标、placeholder、清空/focus | 可跨性能后台复用 | `clone:base`、cycle/project search |
| 基础 | `PerformanceCreateButton` | 图标型/文字型新建按钮 | 可跨性能后台复用 | `clone:base` |
| 基础 | `PerformanceManagementTable` | 表格、状态、分页、固定操作列 | 可跨性能后台复用 | `clone:base`、1440 snapshot |
| 基础 | `FilterButton` | 筛选按钮及展开态 | 可跨性能后台复用 | filter hover/open |
| 基础 | `InfoAlert` | 信息提示条 | 可跨性能后台复用 | `clone:base` |

## 3. Props / events

| 组件 | props | emits / v-model | 必需状态 | 归属 |
|---|---|---|---|---|
| `PerformanceSettingsShell` | `activeNav`, `selectedCycleId` | `nav-change`, `cycle-change` | default/responsive | 页面持有上下文 |
| `PerformanceSettingsSidebar` | `items`, `activeKey` | `select` | default/hover/active | 菜单内部视觉，父级持有选中键 |
| `PerformanceCycleListPane` | `cycles`, `selectedId`, `keyword` | `update:keyword`, `select-cycle`, `create-cycle` | default/selected/search-filled | 父级持有 fixture |
| `PerformanceSearchInput` | `modelValue`, `placeholder`, `width`, `clearable`, `disabled` | `update:modelValue`, `search`, `clear` | default/filled/focus | 输入组件不负责过滤 |
| `PerformanceCreateButton` | `variant`, `label`, `disabled`, `permission` | `click` | default/hover/disabled | 位置和动作由父级 |
| `ProjectSettings` | `keyword`, `filterState` | `create`, `update:keyword`, `filter` | default/search/filter | 项目工具栏组合 |
| `PerformanceManagementTable` | `rows`, `loading`, `total`, `page`, `pageSize`, `scrollable`, `minTableWidth` | `page-change`, `page-size-change` | default/empty/loading/horizontal-scroll | 表格壳不拥有项目字段 |

## 4. Field / column inventory

### 周期列表

- 标题：`周期`
- placeholder：`搜索周期`
- 图标按钮：`+`
- 周期项：采集到的周期名称顺序由 `extracted-ui-contract.json#/fixture_contract/cycles` 固定。

### 周期详情

- 标题：`测试`
- 提示：`本周期新建后，人员与部门发生了 85 次变更，在环节启动前你可以选择是否更新数据`
- 链接：`查看详情`
- 分组：`基本信息`
- 信息字段：`人员`、`部门`、`周期起止时间`、`周期创建时间`、`离职人员可在本周期成为被评估人`

### 项目设置

- 标题：`项目设置`
- 新建：`＋ 新建`
- placeholder：`通过项目名称搜索`
- 筛选：`筛选`
- 列顺序：`项目名称`、`描述`、`项目管理员`、`状态`、`评估人数`、`操作`
- 行操作：编辑、启动和更多入口；更多菜单在 hover/focus 后展示复制、删除，并触发真实项目操作。

## 5. Geometry and styles

### 1920×1080 基准

| 元素 | bbox / 尺寸 | 关键样式 | source_state_ids |
|---|---|---|---|
| 页面框架 | `0,0,1920,1080` | 背景 `rgb(245,246,247)`；最小宽度 `1000px` | `clone:base` |
| Header | 高度 `56px` | 由 `page-content.y=56` 反推；独立 Header bbox 未进入 base_layout，Header 局部样式仍为 `BLOCKED` | `clone:base` |
| 侧栏 | `0,56,240,1024` | 白底；`overflow-y:scroll` | `clone:base` |
| Active nav | `0,102,240,41` | 背景 `rgb(225,234,255)`；文字/图标 `rgb(51,112,255)` | `clone:base`、nav hover |
| 内容 padding 区 | `240,56,1680,1024` | 内容滚动 | `clone:base` |
| 内容 frame | `260,76,1640,984` | 与视口左/上各 `20px` | `clone:base` |
| 外层卡片 | `260,118,1640,942` | 白底、圆角 `8px`、阴影 `0 1px 4px rgba(31,35,41,.05)`、padding `20px` | `clone:base` |
| split wrapper | `280,138,1600,902` | `display:flex` | `clone:base` |
| 周期搜索 | `280,178,167,32` | 白底、1px 边框、圆角 `6px` | `clone:base` |
| 周期加号 | `456,178,32,32` | 左间距 `9px`、白底、1px 边框、圆角 `6px` | `clone:base` |
| 详情 pane | `528,138,1352,902` | 左侧分割线由 split 结构负责 | `clone:base` |
| 项目工具栏 | `528,392,1352,32` | flex、垂直居中、下方间距 `16px` | `clone:base` |
| 项目新建 | `528,392,80,32` | `#3370ff`、白字、圆角 `6px`、padding 左右 `11px` | `clone:base` |
| 项目搜索 | `1552,392,224,32` | 左间距 `12px`、白底、1px 边框、圆角 `6px` | `clone:base` |
| 筛选按钮 | `1800,392,80,32` | 左间距 `12px`、白底、1px 边框、圆角 `6px` | `clone:base` |
| 表格内容 | `528,440,1352,146` | `overflow-x:auto`、`overflow-y:hidden` | `clone:base` |
| 操作列表头 | `1698.796875,441,181.203125,47` | `position:sticky`、`z-index:2`、白底 | `clone:base` |

### 响应式实测

- 1440×900：详情 pane `872px`；操作列 `136px`。
- 1366×768：详情 pane `798px`；操作列 `136px`。
- 1280×720：详情 pane `712px`；操作列 `136px`。
- 1024×768、375×812：仅有独立快照，禁止据此推断重排或折叠规则。

## 6. State machine

| 组件 | 当前状态 | 事件 | 下一状态 | 可见变化 | source_state_ids |
|---|---|---|---|---|---|
| 周期项 | default | click `测试` | selected | active 背景、文字和详情上下文保持 | cycle select |
| 周期搜索 | empty | fill `2026` | filled | placeholder 替换为输入值、列表静态过滤 | cycle search |
| 项目搜索 | empty | fill `项目` | filled | placeholder 替换为输入值、项目静态过滤 | project search |
| 侧栏项 | active | hover | active-hover | 记录 active nav 背景、文字、图标 | nav hover |
| 筛选按钮 | default | hover | hover | 记录背景、边框、图标颜色 | filter hover |
| 筛选按钮 | default | click | expanded | 打开筛选面板，不应用筛选 | filter open |
| 项目表 | default | horizontal scroll | horizontal-scroll | 操作列保持 sticky；独立滚动 after 尚缺 | clone hover 72b3 |

## 7. SVG / icons

| 图标 | `data-icon` | viewBox | 尺寸 | fill | 状态 |
|---|---|---|---:|---|---|
| 搜索 | `SearchOutlined` | `0 0 24 24` | `16×16` | `currentColor` | 已采集 |
| 添加 | `AddOutlined` | `0 0 24 24` | `14×14` | `currentColor` | 已采集 |
| 筛选 | `FilterOutlined` | `0 0 24 24` | `14×14` | `currentColor` | 已采集 |
| 更多 | `MoreOutlined` | `0 0 24 24` | `1em` | `currentColor` | `BLOCKED_PATH_NORMALIZATION` |

完整 path 只以 `extracted-ui-contract.json#/svg` 为准。

## 8. 组件化决策

- 周期搜索和项目搜索结构、尺寸、图标和交互一致，仅 placeholder、宽度和父级定位不同，复用 `PerformanceSearchInput`。
- 周期加号和项目“＋新建”共享添加图标和按钮颜色，但尺寸/文案不同，复用 `PerformanceCreateButton` 的显式 `variant`，不合并父级布局。
- 项目列表复用 `PerformanceManagementTable`，仅通过列 slot 注入项目字段；不复用 `ReviewQuestionTable` 或 `ReviewRuleTable` 的业务字段。
- 操作列的固定、表格滚动和分页归属表格壳；项目操作的文字和禁用规则归属项目列。
