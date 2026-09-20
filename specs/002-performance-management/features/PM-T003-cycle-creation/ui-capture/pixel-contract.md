# PM-T003 首页像素契约

- completion_status: `incomplete`
- pixel_restore_status: `blocked`
- target screenshot: `C:/Users/gaby.liu/ClonedSites/idreamsky.feishu.cn_20260904_123515_419185/captures/idreamsky_feishu_cn_perf_admin_semester-activities_s_7671122266779814873.png`
- baseline viewport: `1920×1080`, DPR `1`
- visual truth: captured screenshot + corresponding layout/computed artifacts
- tolerance: `BLOCKED`，当前未冻结 diff 算法和抗锯齿容差，不得宣称像素通过

## 1. 页面几何

| component_id | x | y | width | height | 约束 |
|---|---:|---:|---:|---:|---|
| `page-frame` | 0 | 0 | 1920 | 1080 | 整页 flex，背景 `rgb(245,246,247)` |
| `settings-sidebar` | 0 | 56 | 240 | 1024 | Header 后固定左栏，纵向滚动 |
| `content-padding-region` | 240 | 56 | 1680 | 1024 | 左侧距侧栏 0，内容内层向右/向下 20 |
| `content-frame` | 260 | 76 | 1640 | 984 | 由父级内容 padding 形成 |
| `outer-card` | 260 | 118 | 1640 | 942 | 白底、圆角 8、padding 20 |
| `split-wrapper` | 280 | 138 | 1600 | 902 | 双栏 flex |
| `cycle-list-pane` | 280 | 138 | 248 | 902 | 右侧边界在 x=528 |
| `detail-pane` | 528 | 138 | 1352 | 902 | detail 起点与周期列表边界相邻 |
| `project-toolbar` | 528 | 392 | 1352 | 32 | 工具栏同一行 |
| `project-table-content` | 528 | 440 | 1352 | 146 | 横向滚动容器 |
| `operation-column` | 1698.796875 | 441 | 181.203125 | 47 | sticky，z-index 2 |

证据：`capture_model.json#/base_layout`、`responsive/1920x1080/layout.json`、`computed_styles.json`。

## 2. 控件几何

| component_id | bbox | 样式 |
|---|---|---|
| `cycle-search` | `280,178,167,32` | 1px border、6px radius、白底、14px/22px |
| `cycle-add` | `456,178,32,32` | 左间距 9px、1px border、6px radius |
| `project-create` | `528,392,80,32` | `#3370ff`、白字、11px 左右 padding、6px radius |
| `project-search` | `1552,392,224,32` | 左间距 12px、1px border、6px radius |
| `project-filter` | `1800,392,80,32` | 左间距 12px、1px border、6px radius |

## 3. 视觉 token

```text
page.background       = rgb(245, 246, 247)
container.background  = rgb(255, 255, 255)
primary               = rgb(51, 112, 255)
text.primary          = rgb(31, 35, 41)
text.secondary        = rgba(0, 0, 0, 0.65)
active.nav.background = rgb(225, 234, 255)
control.height        = 32px
control.radius        = 6px
card.radius           = 8px
card.padding          = 20px
card.shadow           = rgba(31, 35, 41, 0.05) 0px 1px 4px 0px
base.font-size        = 14px
base.line-height      = 21px
```

## 4. 表格契约

- 表格列顺序固定：`项目名称` → `描述` → `项目管理员` → `状态` → `评估人数` → `操作`。
- 表头高度：`47px`。
- 数据行高度：`49px`。
- 表格内容区：`overflow-x:auto; overflow-y:hidden`。
- 操作列：`position:sticky`，右侧固定，基准视口宽度为 `181.203125px`。
- 1440、1366、1280 视口的操作列实测宽度为 `136px`。
- 项目表的横向滚动和操作列固定必须由共享表格组件实现，不能用页面截图或绝对定位模拟。
- 行操作显示编辑、启动、更多；更多菜单在 hover/focus 后显示复制和删除；实际操作由权限和项目状态控制。

## 5. 状态契约

| variant_key | 状态 | 必须可见 | 禁止出现 | source_state_ids |
|---|---|---|---|---|
| `cycle-project-home-default` | default | 周期列表、周期详情、项目工具栏、表头、分页 | 真实 API 写入、项目表单 | `clone:base` |
| `cycle-project-home-cycle-selected` | after-click | 周期 active 状态和详情上下文 | 保存反馈、业务写入 | `hybrid:cycle-select:hybrid-001-after` |
| `cycle-project-home-cycle-search` | filled | 搜索输入值、过滤后的周期列表 | 真实查询接口 | `hybrid:cycle-search:hybrid-001-after` |
| `cycle-project-home-project-search` | filled | 项目搜索输入值、过滤后的项目展示 | 真实查询接口 | `hybrid:project-search:hybrid-001-after` |
| `cycle-project-home-nav-hover` | hover | active nav 的 hover/active 视觉 | 页面跳转副作用 | `hybrid:nav-hover:hybrid-001-after` |
| `cycle-project-home-filter-hover` | hover | 筛选按钮 hover 视觉 | 筛选结果变化 | `hybrid:filter-hover:hybrid-001-after` |
| `cycle-project-home-filter-open` | expanded | 筛选面板及其 overlay | 应用筛选、保存 | `hybrid:filter-open:hybrid-001-after` |

## 6. SVG 契约

搜索、添加、筛选必须直接使用采集到的 `data-icon`、viewBox、尺寸和 path；不得用文字字形代替。

- `SearchOutlined`: `0 0 24 24`, `16×16`。
- `AddOutlined`: `0 0 24 24`, `14×14`。
- `FilterOutlined`: `0 0 24 24`, `14×14`。
- `MoreOutlined`: 当前 path 标准化阻塞，未补证据前不得自行绘制近似图标。

完整 path 见 `extracted-ui-contract.json#/svg`。

## 7. 响应式关系

| viewport | sidebar | detail pane | operation column |
|---|---:|---:|---:|
| 1920×1080 | 240 | 1352 | 181.203125 |
| 1440×900 | 240 | 872 | 136 |
| 1366×768 | 240 | 798 | 136 |
| 1280×720 | 240 | 712 | 136 |

1024×768 和 375×812 目前只证明快照可采集，不证明布局重排。实现必须：

- 不让 body 出现不可控的横向溢出。
- 表格横向溢出时保留操作列可见。
- 不在没有 resize evidence 时猜测移动端折叠方式。

## 8. 像素验收阻塞

- 当前没有 rendered-ui-contract，不能运行反向比较。
- 当前没有冻结的 diff 算法和容差。
- 初始 mission 的 required interaction 未汇入同一实现 brief。
- 表格独立横向滚动 before/after 缺失。
- Header 独立 bbox 未在 base_layout 中输出，Header 局部几何需补证据或保持 BLOCKED。
