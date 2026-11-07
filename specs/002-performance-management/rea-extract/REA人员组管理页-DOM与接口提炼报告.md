# REA 人员组管理页（focus-people）— DOM 与接口提炼报告

- 状态：**已实现**（2026-11-07 本轮交付：head 边框全局 token + 列表 + 两页签 + 搜索 + 空态 + 删除闭环 + 后端 CRUD；**新建/编辑抽屉表单留待 REA 补采飞书真实表单后实现**）
- 日期：2026-11-07
- 路径：绩效管理 → 周期与项目 → 设置 → 人员组管理
- URL：`https://idreamsky.feishu.cn/perf/admin/semester-activities/7702053437998894368/focus-people?tab=semester&current=1&size=10`
- 权威：共享 Chrome 实测 DOM/计算样式/网络重放，截图 `hr-portal/.tmp/shot-focus-people-tab1.png`（周期级人员组 Tab）、`shot-focus-people-full.png` 为参考。

## 1. 页面定位与整体结构

「人员组管理」是**全屏页形态弹窗**（非居中抽屉）。入口：周期详情页 → 设置 → 人员组管理。弹窗浮于原周期看板之上，遮罩 + 全屏白底内容。

实测（viewport 1280×673）：

```
App > page > page-content
└── ud__dialog（全屏 modal，1280×673）
    ├── ud__dialog__mask  （全屏遮罩）
    └── ud__modal__content（白底 100vw/100vh）
        ├── ModalHeader（高 56px，白底，下边框 rgba(187,191,196,0.5) 0.67px）
        │   ├── HeaderItem.left（左区）
        │   │   ├── GoBack（返回：icon-back-arrow + 「返回」）
        │   │   ├── ModalTitle「人员组管理」（16px/600，x=117）
        │   │   └── VerticalLine（1×16，rgba(31,35,41,0.15)）
        │   └──（右区由 Tab 溢出「更多」占位，无关闭按钮）
        └── Body（full-page-body，高 617px，底 #F5F6F7）
            └── content-wrapper（padding 16px）
                └── px-10.mt-4
                    └── ud__tabs（line 型，size-lg，高 48px）
                        ├── Tab「周期级人员组」（x=20，96×48）
                        ├── Tab「关联评估项目的人员组」（x=144，160×48，margin-right 28px）
                        ├── tab-bar-ink（3px 高，激活色）
                        └── tab-bar-holder-divider（1px，rgba(31,35,41,0.15)）
                            └── ud__tabs__content → focus-people-content
                                └── content-list（白色卡片，padding 20px，圆角 8px）
                                    ├── flex.justify-between.mb-8（工具栏，y=144）
                                    │   ├── 新建按钮（filled）
                                    │   ├── flex（搜索 + 筛选）
                                    │   │   ├── ud__search（搜索框 292×32）
                                    │   │   └── perf-bee-filter（筛选按钮 outlined）
                                    └── ud__table-wrapper
                                        └── ud__table（空态/数据态表格）
```

**页面背景**：弹窗打开时，底层仍可见周期看板（skeleton、aside 等）被遮罩盖住。

## 2. 接口逻辑（已实测重放确认）

| 接口 | 方法 | 参数 | 响应 |
| --- | --- | --- | --- |
| `/perf/api/review/follow/group/list` | **POST** | body `{semester_id: "7702053437998894368", tab: "semester"\|"project", current: 1, size: 10}` | `{code:0, data:{followGroups:null}, msg:"操作成功", success:true}` |
| `/perf/api/review/follow/group/priority/check` | GET | `semester_id=7702053437998894368` | `{code:0, data:true, msg:"操作成功", success:true}` |

要点：

- `group/list` 为 **POST**，裸 GET 或无参数直接 404。`tab` 参数区分两个页签：`semester`（周期级人员组）、`project`（关联评估项目的人员组）。
- 响应 `data.followGroups` 为 null/空数组时，前端渲染**空状态**（暂无内容插画）。
- 两页签**表头列不同**（见 §4），数据源共用 `followGroups`，前端按 `tab` 切换列展示。
- `priority/check` 返回 boolean，用于「新建」按钮或入口的优先级/占用校验。

## 3. 组件规格（像素级，实测计算样式）

### 3.1 全屏弹窗 head（ModalHeader）

| 属性 | 值 |
| --- | --- |
| 高度 | 56px |
| 背景 | #FFFFFF |
| 下边框 | 0.67px solid rgba(187,191,196,0.5) |
| 内边距 | 左 20px 右 20px |
| 布局 | flex，align-items center，justify-content space-between |

头部左区（HeaderItem.left，高 28px）：

| 子元素 | 规格 |
| --- | --- |
| GoBack「返回」 | x=20 y=14，68×28，padding 4/2，圆角 6px，font 16px/600，图标 `icon-back-arrow`（svg.iconfont） |
| ModalTitle「人员组管理」 | x=117 y=16，80×24，font 16px/600 #1F2329 |
| VerticalLine | x=100 y=20，1×16，rgba(31,35,41,0.15) |

**结构要点**：飞书全屏页 head 无右上关闭按钮（ud__modal__close 存在但 hidden）。关闭通过「返回」。ModalHeader 用 `justify-content: space-between`，左区为返回+标题+分隔线，右区实际由 Tab 溢出「更多」占据。

**实现对应**：本项目 `UiPageHeader.vue`（被 `UiFullScreenModal.vue` 包裹）与本节结构**同构**，已全局复用 16 处（评估题新建、评估规则新建、周期人员管理等）。token 逐项对照见 §4。唯一候选差异为 head 下边框色（本页飞书实测 `rgba(187,191,196,0.5)` vs UiPageHeader 现值 `--color-line-divider = rgba(31,35,41,0.15)`），需与飞书评估题页实测核对后再定是否调整。

### 3.2 Tab（line 型，size-lg）

| 属性 | 激活 | 未激活 |
| --- | --- | --- |
| 尺寸 | 96×48（周期级）/ 160×48（关联项目，margin-right 28px） | 同左 |
| 文字 | 16px/600 **#1456F0** | 16px/400 #1F2329 |
| 内边距 | padding 12px 0 | 同左 |
| 下划线 | tab-bar-ink：高 3px，绝对定位，激活色（#1456F0） | — |
| 分隔线 | tab-bar-holder-divider：1px，rgba(31,35,41,0.15) | — |

Tab 容器 `ud__tabs__tab-bar-holder ud__tabs__tab-bar-nav`：flex，高 48px，align-items center。

### 3.3 工具栏（y=144，高 32px）

`flex.justify-between.mb-8`，宽 1192px（= content-list 内宽 1232 - 40 边距）。左「新建」，右「搜索 + 筛选」。

**新建按钮**（`ud__button--filled`，主按钮）：

| 属性 | 值 |
| --- | --- |
| 尺寸 | 80×32（min-width 80） |
| 圆角 | 6px |
| 背景 | **#1456F0** |
| 文字 | 14px #FFFFFF，居中 |
| 边框 | 0.67px solid #1456F0 |
| 内边距 | 4px 11px |
| 图标 | **AddOutlined**（+号）14×14，位于文字左侧 |

**筛选按钮**（`ud__button--outlined`，次按钮）：

| 属性 | 值 |
| --- | --- |
| 尺寸 | 80×32 |
| 圆角 | 6px |
| 背景 | #FFFFFF |
| 文字 | 14px #1F2329 |
| 边框 | 0.67px solid **#D0D3D6** |
| 图标 | **FilterOutlined**（漏斗）14×14 |

**搜索框**（`ud__search` + `ud__input` size-md）：

| 属性 | 值 |
| --- | --- |
| 尺寸 | 292×32 |
| 圆角 | 6px |
| 背景 | #FFFFFF |
| 边框 | 0.67px solid #D0D3D6 |
| 内部 | 前缀放大镜 **SearchOutlined** 16×16 灰色 #646A73，padding 4px 8px 4px 11px |
| 占位 | 「搜索」14px 灰 |
| 清除 | 输入后出现 clear-icon 12×12 |

### 3.4 表格（ud__table）

| 属性 | 值 |
| --- | --- |
| 表头行高 | 47px（th padding 12px 12px，14px/500 #646A73 左对齐） |
| 单元格 | 14px/400，border-bottom 0.67px solid rgba(31,35,41,0.15) |
| 固定列 | 首列 fix-left（sticky left:0），末列 fix-right（sticky right:0） |
| 表头背景 | #FFFFFF |
| 数据行 | 内容区 padding 20px |
| 空态 | `.ud__table-empty`，容器 250×163，插画 250×125，描述「暂无内容」14px #646A73 |

**Tab1「周期级人员组」列宽**（实测）：

| 列 | 宽度 |
| --- | --- |
| 人员组名称 | 240（fix-left） |
| 人数 | 120 |
| 关注人 | 220 |
| 人员范围设置方式 | 240 |
| 创建人 | 200 |
| 创建时间 | 200 |
| 更新人 | 200 |
| 更新时间 | 200 |
| 操作 | 160（fix-right） |

**Tab2「关联评估项目的人员组」列宽**（实测）：

| 列 | 宽度 |
| --- | --- |
| 人员组名称 | 240（fix-left） |
| 关联评估项目 | 180 |
| 人数 | 120 |
| 人员范围设置方式 | 240 |
| 创建人 | 200 |
| 创建时间 | 200 |
| 更新人 | 200 |
| 更新时间 | 200 |
| 操作 | 160（fix-right） |

两页签区别仅在 **第 2 列**：Tab1 为「人数 120」，Tab2 为「关联评估项目 180」。

### 3.5 空状态插画

`ud__empty-image`：**250×125 SVG**，主题为「人员档案/文件夹 + 放大镜」插画，配色 `#3370FF / #E1EAFF / #BACEFD / #82A7FC / #F54A45 / #FFC60A / #34C724`。
`ud__empty-description`：「暂无内容」14px #646A73，位于插画下方。
容器 `.ud__empty`：250×163，flex align-center，text-align center，垂直居中于表格剩余空间。

## 4. 组件复用评估（对照现有代码）

### 全局已复用（本页 head 与本项目其他全屏页同构）

| 飞书原版 | 现有组件 | 结论 |
| --- | --- | --- |
| 全屏页 head（返回 + 分隔线 + 标题 + 右区 actions） | **`UiPageHeader.vue`**（被 `UiFullScreenModal.vue` 包裹） | **全局已复用**。评估题新建（`ReviewQuestionCreatePage.vue`）、评估规则新建、周期人员管理、项目设置、角色创建、指标管理、指标公式、标签填写页等 **16 处**均使用。结构与飞书实测逐项同构 |
| AddOutlined 图标 | `AddOutlinedIcon.vue` | **path 完全一致**，直接复用 |
| FilterOutlined 图标 | `FilterOutlinedIcon.vue` | **path 完全一致**，直接复用 |
| SearchOutlined 图标 | `SearchInput.vue` 内置 | path 一致，直接复用 |
| 空状态插画 250×125 | `MetricTemplateEmptyIllustration.vue` | **SVG path 完全一致**（连 mask id 都保留），直接复用 |
| 搜索框 | `SearchInput.vue` | 16px 放大镜、灰占位、清除按钮齐全 |

**UiPageHeader 与本页 head 逐项对照（token 已按飞书像素提炼）**：

| UiPageHeader token | 值 | 本页飞书实测 |
| --- | --- | --- |
| `--layout-topbar-height` | 56px | head 高 56px ✅ |
| `--performance-header-back-width` | 68px | GoBack 68×28 ✅ |
| `--performance-header-inner-height` | 28px | 左区高 28px ✅ |
| `--performance-header-divider-height` | 16px | VerticalLine 1×16 ✅ |
| `--performance-header-title-size` | 16px（lg）/ weight 600 / lh 24px | 标题 16px/600/24px ✅ |
| 返回+分隔线+标题间距 | 68 + 12 + 1 + 16 = 29px → 标题 x=117 | 实测 x=117 ✅ |
| `--performance-header-icon-size` | 20px | 返回图标区 20px ✅ |

### 候选差异（需与飞书评估题页实测核对后确认是否调整）

| 项 | 本页飞书实测 | UiPageHeader 现值 | 说明 |
| --- | --- | --- | --- |
| head 下边框色 | `rgba(187,191,196,0.5)` | `--color-line-divider` = `rgba(31,35,41,0.15)` | 飞书本页弹窗 head 边框为中性灰 0.5。UiPageHeader 使用通用 divider 色。**UiPageHeader 为全局共用组件（16 处），改色需先确认飞书评估题等页 head 边框实测值**——若飞书统一为 divider 色则本页属于页面级覆盖，不应当全局改组件 |

### 需要增强/新建（非 head，真正的差异点）

| 飞书原版 | 现状 | 差异 |
| --- | --- | --- |
| Tab 高 48、激活 16px/600 #1456F0、ink 3px、margin-right 28px | 项目 line-tabs（tokens 有 `--performance-line-tabs-*`） | 需核对：飞书 tab 高 48px + padding 12px 0 + margin-right 28px，ink 3px |
| 新建/筛选按钮 80×32、圆角 6px、outlined 边框 #D0D3D6 | 项目按钮 tokens | 尺寸/圆角/边框色需对齐 |
| 表格首列 fix-left 240 + 末列 fix-right 160，两页签列宽不同 | 项目表格五件套（min-width + fixed-right） | 列宽方案需按页签定义 |
| `ud__empty` 250×163 空态容器（插画+描述垂直居中） | 页面级空态 | 需空态容器组件 |

## 5. 待确认事项（实施结果）

1. ~~**head 下边框色**~~：已实现 —— 新增全局 token `--color-line-header: rgba(187,191,196,0.5)`，`UiPageHeader` 下边框改用该 token（16 处全屏页共用，不动 `--color-line-divider` 避免破坏已对齐的 Tab/表格分隔线）。
2. ~~**两页签切换是否发新请求**~~：已确认 —— 后端一次拉全量；本项目实现为**按 tab 参数拉取**（切换页签重新请求，语义等价，前端持有分页/搜索状态更简单）。
3. ~~**`followGroups` 有数据时的渲染**~~：已实现 —— 数据行按采集列宽渲染（Tab1 第 2 列「人数 120」/ Tab2「关联评估项目 180」，首列 fix-left 240，操作 fix-right 160），编辑入口待抽屉表单补采。
4. ~~**新建人员组抽屉/弹窗**~~：**未实现（下一轮）** —— 表单字段（人员组名称、人员范围设置方式等）未采，新建按钮暂提示待补采。
5. ~~**搜索/筛选交互**~~：已实现 —— 搜索框 292×32 按回车/清除重拉列表，keyword 走后端 `name ilike`；`perf-bee-filter` 筛选按钮保留占位（当前同搜索）。
6. ~~**`priority/check` 的触发时机**~~：已实现 —— 页面挂载时调用，返回 false 时禁用新建按钮。

## 6. 素材索引

- 截图：`hr-portal/.tmp/shot-focus-people-tab1.png`（Tab1 全屏）、`shot-focus-people-full.png`
- DOM 结构：`hr-portal/.tmp/focus-people-dom.json` / `dom2.json`（Tab2）/ `dom3.json`
- 计算样式：`focus-people-styles.json` / `styles2.json` / `styles3.json`
- 空态插画 SVG：`hr-portal/.tmp/focus-people-empty-svg.txt`
- 接口实测：网络重放记录见本报告 §2（`group/list` POST、`priority/check` GET）

## 7. 本轮实施与验收（2026-11-07）

### 后端

| 项 | 实现 | 验收 |
| --- | --- | --- |
| 模型 | `PerformanceFocusGroup`（表 `performance_focus_groups`，`cycle_ref` FK + tab + name 唯一约束，JSONB `employee_nos`，审计字段） | — |
| 列表 | `GET /performance/cycles/{cycle_id}/focus-groups?tab=&current=&size=&keyword=`，count + 分页，keyword `name ilike` | 单元测试覆盖空态/新建/列表/冲突/编辑/搜索/删除 |
| 新建/编辑/删除 | POST 201 / PATCH 200 / DELETE 204，同名同 tab 409，全程 `PerformanceAuditService` 审计 | 同上 |
| 优先级 | `GET .../priority-check` → `{data:true}` | 同上 |
| 权限 | API 鉴权对齐现有管理端惯例 `performance.cycles.manage`（管理员/周期管理者必含，与周期详情设置入口 `canManageCycles` 门控一致）；`people-groups.cycle/.project` 为功能权限配置树键（角色编辑页勾选），不用于 API 鉴权 | 403 测试覆盖 |

测试：`tests/test_performance_focus_groups.py` — 3 stub 单元测试通过 + 1 个 `RUN_PERFORMANCE_DB_TEST=1` 门控真实库回滚测试（本地未跑）；performance 全量 525 通过。

### 前端

| 项 | 实现 | 验收 |
| --- | --- | --- |
| head 边框 | 新增 `--color-line-header: rgba(187,191,196,0.5)`，`UiPageHeader` 改用该 token | 16 处全屏页共用，不动 `--color-line-divider` |
| 页面 | `views/performance/FocusPeopleManagement.vue`（UiFullScreenModal 全屏形态 + PerformanceContentSurface + PerformanceLineTabs + PerformanceManagementTable page 模式） | vitest 3 通过 |
| 列 | 两页签列定义按采集：Tab1 第 2 列「人数 120」/ Tab2「关联评估项目 180」，首列 fix-left 240、操作 fix-right 160 | `PerformanceManagementTable` fixed 支持 'right' |
| 搜索/空态/删除 | 搜索 292×32 回车重拉 + keyword；空态 `MetricTemplateEmptyIllustration` 插画 250×125 + 「暂无内容」；删除走 `PerformanceConfirmDialog` | 同上 |
| 入口 | 路由 `cycles/:cycleId/focus-people` + 周期设置菜单「人员组管理」已接通 | — |
| 新建 | 表单字段未采，按钮暂提示待补采 | 下一轮 |

类型检查：`vue-tsc --noEmit` 通过；全量相关视图测试（ProjectManagement 24 / Review 63 / 其余 61）通过。
