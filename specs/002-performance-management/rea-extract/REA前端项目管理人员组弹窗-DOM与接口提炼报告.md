# REA 前端项目管理「人员组管理」弹窗 — DOM 与接口提炼报告

- 状态：**已采集**（2026-11-08 REA 实测，供前端项目管理弹窗实现）
- 日期：2026-11-08
- 路径：绩效管理前端 → 项目管理 → 总览 → 其他 → 人员组管理 → 查看
- URL：`https://idreamsky.feishu.cn/perf/management/v2/7654423719619710195/7340285661313974274/all-projects/focus-people-group`
- 权威：共享 Chrome（CDP 9333）实测 DOM/计算样式/接口拦截重放，证据 `rea-extract/out/focus-people-group/`（`probe.json` / `struct.json` / `body-text*.txt` / `tabs.json` / `pixel-spec.json` / `table-spec-tab1.json` / `emp-list-replay.json` / `api-reload.json` / `api-interact.json` / `add-modal-spec.json`）。
- 关联：后台版 [REA人员组管理页-DOM与接口提炼报告.md](./REA人员组管理页-DOM与接口提炼报告.md)（`perf/admin/.../focus-people`）、[REA人员组编辑表单-DOM与接口提炼报告.md](./REA人员组编辑表单-DOM与接口提炼报告.md)（详情管理页）。

## 1. 页面定位与整体结构

前端项目管理「人员组管理」是**全屏页形态弹窗**（非居中抽屉），入口：项目管理页 → 总览 → 「其他」卡片 → 人员组管理 → 「查看」。弹窗浮于项目管理看板之上，遮罩 + 全屏白底内容。

实测（viewport 1898×902）：

```
App > page > page-content
└── ud__dialog（全屏 modal，1898×902）
    └── ud__modal__content（白底 100vw/100vh）
        ├── header（高 56px，白底，下边框 1px rgba(31,35,41,0.15)）
        │   ├── LeftNav（16,14,177×28）
        │   │   ├── GoBack「返回」（16,14,68×28）
        │   │   ├── VerticalLine（96,20,1×16）
        │   │   └── ModalTitle「人员组管理」（113,20,80×16，16px/600）
        │   └──（无右上关闭）
        └── ud__tabs（line 型 size-md，高 46px，从 y=56 起）
            ├── Tab1「核心管理干部」（激活，14px/500 #1456F0，84×46）
            ├── Tab2「12」（未激活，14px/400 #1F2329，15×46）
            ├── 「更多」下拉（y=41 占位，当前 2 组不溢出）
            ├── tab-bar-ink（3px 高）
            └── tab-bar-holder-divider（1px，rgba(31,35,41,0.15)）
                └── ud__tabs__content
                    ├── 提示条（周期版 40px #F0F4FF 底 / 项目版 双行）
                    └── table-wrapper（白底卡片）
                        ├── table-addon-group（工具栏 y=202，32px 高）
                        │   ├── 添加（filled 80×32）
                        │   └── 搜索成员（292×32）+ 筛选（outlined 80×32）
                        ├── ud__table（成员表格 + 空态）
                        └── ud__pagination（共 N 条 + 页码 + 条/页）
```

**与后台版（`perf/admin/.../focus-people`）的本质区别**：

| 维度 | 前端弹窗（本轮） | 后台人员组管理页（已实现） |
| --- | --- | --- |
| 上下文 | 项目管理 v2（subjectType: 3） | 周期管理 admin（tab: semester\|project） |
| 顶部 Tab | **人员组列表**（组名+人数，周期级与关联项目混合展示） | 维度分类（周期级人员组 / 关联评估项目的人员组） |
| 点击 Tab | 切换当前组成员列表（URL 不变，重拉 emp_list） | 切换维度列（Tab1 列「人数」/ Tab2 列「关联评估项目」） |
| 表格 | 成员列表（姓名/直属上级/虚线上级/一级部门/末级部门/序列/添加人/添加时间/操作） | 人员组列表（名称/人数/关注人/范围设置方式/创建人/创建时间/更新人/更新时间/操作） |
| 添加 | 添加成员弹窗（600 居中 modal） | 新建人员组抽屉表单 |

## 2. 接口逻辑（已实测重放确认）

| 接口 | 方法 | 参数 | 响应 |
| --- | --- | --- | --- |
| `/perf/api/review/follow/group/enter` | POST | `{semester_id, subject_type: 3}` | `{code:0, data:{can_show:true}}` |
| `/perf/api/review/follow/group/list` | POST | `{semesterId, subjectType: 3}` | `{code:0, data:{followGroups:[{group_type:"0", activity_ids:"[]", name:"核心管理干部", followeeUserIds:"['673...']", scope_setting_mode:"1", count:"0"}, {group_type:"1", activity_ids:"['7654470731517987794']", name:"12", ...}]}}` |
| `/perf/api/review/follow/group/emp_list` | POST | `{groupId, semesterId, subjectType: 3, userId, offset, limit, filters:{userId:""}, advance_filters:null}` | `{code:0, data:{total:21, users:[...]}}` |
| `/perf/api/review/activities_v2` | GET | `offset=0&limit=9999&semesterId=` | 关联项目下拉选项（新建/编辑时用） |

**要点**：

- **`group/list` 同一路径、两套参数**：后台版 `{semester_id, tab, current, size}`；前端版 `{semesterId, subjectType: 3}`（无分页、无 tab 维度，一次拉全量）。**`subjectType: 3` 是前端项目管理 v2 的上下文标记**。后端需兼容两种调用语义。
- `group/enter` 返回 `{can_show: true}`：进入弹窗前的权限校验（false 时不可进入）。
- `emp_list` 为**成员列表**（按 groupId 查组内员工），支持 offset/limit 分页 + filters 搜索；响应 `data.users` 为员工画像数组。
- **Tab 切换不发 group/list**（弹窗打开时拉一次全量组），切换时**只发 emp_list**（换 groupId）。URL 不变（纯前端状态切换）。
- `users` 字段：`userId / i18nName / email / department(数组) / directLeaderId / dottedLeaderIds / directLeader / i18nLeaderName / i18nDottedLeaderName / topLevelDeptName / topLevelDeptId / i18nNameCategory / categorySort / avatar72/240/640 / dimissionStatus / operator_id / operator_time / ...`

## 3. 组件规格（像素级，实测计算样式）

### 3.1 全屏弹窗 head

| 属性 | 值 |
| --- | --- |
| 高度 | 56px |
| 背景 | #FFFFFF |
| 下边框 | **1px solid rgba(31,35,41,0.15)** |
| 布局 | flex，align-items center，justify-content space-between |

头部左区：

| 子元素 | 规格 |
| --- | --- |
| GoBack「返回」 | 68×28，16px/600 #1F2329 |
| VerticalLine | 1×16，rgba(31,35,41,0.15) |
| ModalTitle「人员组管理」 | 16px/600 #1F2329 |

**注意**：前端弹窗 head 下边框为 **1px rgba(31,35,41,0.15)**，与后台全屏页 head（`--color-line-header` = 0.67px rgba(187,191,196,0.5)）不同。这是**前端管理 v2 端独立的 head 主题**，非全局 token。

### 3.2 Tab（line 型，size-md）—— 人员组列表

| 属性 | 激活 | 未激活 |
| --- | --- | --- |
| 尺寸 | 84×46（核心管理干部） | 15×46（12） |
| 文字 | **14px/500 #1456F0** | 14px/400 #1F2329 |
| 内边距 | 12px 0 | 同左 |
| margin-right | 28px | 28px |
| 下划线 | tab-bar-ink：高 3px，激活色 | — |
| 分隔线 | tab-bar-holder-divider：1px，rgba(31,35,41,0.15) | — |

**Tab = 该周期下所有人员组**（`followGroups` 数组渲染），组名即 tab 文本。组超过可视宽度时溢出到「更多」下拉（当前 2 组不溢出）。

### 3.3 提示条（两维度差异化呈现）

| 版本 | 内容 | 规格 |
| --- | --- | --- |
| 周期级（Tab1） | 「仅可查看你有权限的人员组成员。你可将权限范围内的人员添加/移出人员组」 | 40px 高，**#F0F4FF 底**，14px/400 #1F2329，padding `9px 16px` |
| 关联项目（Tab2） | 「**关联评估项目：2026年半年度绩效评估**」+「人员组仅可圈入关联评估项目的被评估人，你可对权限范围内的人员进行添加和移除。」 | 双行，40px 高 #F0F4FF 底，第一行项目名（可能加粗） |

**这是两维度差异化呈现的关键**：关联项目版提示条首行展示「关联评估项目：{项目名}」，来自 `activity_ids` 映射（`activities_v2` 或 group/list 响应中的项目名）。

### 3.4 工具栏（y=202，32px 高）

| 按钮 | 规格 |
| --- | --- |
| 添加（filled） | 80×32，radius 6px，bg #1456F0 白字 |
| 搜索成员 | 292×32，radius 6px，border 0.67px #D0D3D6，占位「搜索成员」14px |
| 筛选（outlined） | 80×32，radius 6px，白底 #1F2329 字，border 0.67px #D0D3D6 |

### 3.5 成员表格

| 属性 | 值 |
| --- | --- |
| 表头行高 | 47px（14px/500 #646A73 左对齐） |
| 数据行高 | 52px |
| 固定列 | 序号列 fix-left 50px、姓名 fix-left 195px（sticky left:50）、操作 fix-right 102px |
| 空态 | 插画 + 「暂无人员」（`ud__empty-image` + `ud__empty-description`） |

**列宽（前端弹窗实测，与后台详情页成员表完全一致）**：

| 列 | 宽度 | 备注 |
| --- | --- | --- |
| 序号 | 50 | fix-left |
| 姓名 | 195 | fix-left（sticky left:50） |
| 直属上级 | 195 | |
| **虚线上级** | **195** | **本地详情页缺此列** |
| 一级部门 | 240 | |
| 末级部门 | 240 | |
| 序列 | 240 | |
| 添加人 | 195 | |
| 添加时间 | 195 | |
| 操作 | 102 | fix-right |

**分页**：`共 21 条 / prev / 1 2 3 / next / 10 条/页 跳至页`，28px 高，当前页 #1456F0。**空态 bug**：Tab2 空组时飞书分页仍显示「共 21 条」（未随 tab 切换重置 total）——**本地实现不应复刻此 bug**。

### 3.6 添加人员弹窗（点击「添加」）

| 元素 | 规格 |
| --- | --- |
| 外层 dialog | 600×230 居中（viewport 中心），radius 8px |
| header | 高 72px，padding `24px 56px 24px 24px`，标题「添加人员」16px/600 |
| 关闭按钮 | 右上 28×29 icon |
| body | 高 78px，padding `0 24px` |
| 表单 | 「选择人员 *」label（22px）+ select 552×32（placeholder「请输入姓名」） |
| footer | 高 56px，padding `0 24px 24px`，确定（filled 80×32 #1456F0）+ 取消（outlined 80×32）右对齐 |

## 4. 组件复用评估（对照现有代码）

### 直接复用（已存在且同构）

| 飞书原版 | 现有组件 | 结论 |
| --- | --- | --- |
| 全屏页 head（返回+分隔线+标题） | `UiFullScreenModal.vue` + `UiPageHeader.vue` | **复用**。head 结构同构；**唯一差异为下边框色**（前端 1px rgba(31,35,41,0.15) vs UiPageHeader `--color-line-header`），需页面级覆盖或确认前端端全局 head token |
| Tab（人员组列表动态渲染） | `PerformanceLineTabs.vue` | **复用**。支持动态 tabs 数组（key=groupId / label=组名）。**差异**：飞书前端 tab 是 14px/500 激活，本地 PerformanceLineTabs 是 16px/400/600 —— 需页面级覆盖或确认该形态为前端端专用 |
| 成员表格 | `PerformanceManagementTable.vue` | **复用**。列宽/表头 47px/行高/fixed 左右/分页（show-pagination + pagination-prefix slot）能力齐全 |
| 搜索框 | `PerformanceSearchInput.vue` | 复用（292×32） |
| 空态插画 | `MetricTemplateEmptyIllustration.vue` | 复用（SVG path 一致） |
| 添加人员弹窗 | `FocusGroupMemberAddDialog.vue` | **复用**。居中 modal + 选择人员 select + 确定/取消，与飞书同构（600 宽/header 72/footer 56） |
| 工具栏 | `FocusGroupMembersPanel.vue` 的工具栏结构 | 复用（添加 80×32 + 搜索 292×32 + 筛选 80×32） |

### 需增强（差异点）

| 项 | 飞书前端弹窗 | 本地现状 | 差异 |
| --- | --- | --- | --- |
| **顶部 Tab 语义** | Tab = 人员组列表（组名，周期级+关联项目混合） | 详情页 tab = 人员列表/变更记录 | **全新交互模型**。需新增「人员组 tab 选择器」：加载 `group/list`（subjectType: 3）→ 渲染组名 tab → 切换时拉 `emp_list`。本地 `FocusGroupManagementDetail` 是单组详情（tab 人员/变更），不直接复用 |
| **虚线上级列** | 有（195px，`dottedLeaderIds` + `i18nDottedLeaderName`） | `FocusGroupMembersPanel.vue` 列定义**无此列** | 本地快照无虚线上级数据源（记忆确认 `dotted_supervisor_name: null` 占位 `--`）。**列可先加，数据等源补充** |
| **提示条** | 周期版 40px #F0F4FF「仅可查看…」；项目版「关联评估项目：XXX」+ 说明 | 详情页无提示条 | 需新增提示条组件（按 group_type 分流内容） |
| **分页** | 有（offset/limit + total，共 N 条） | `FocusGroupMembersPanel` `show-pagination=false` | 前端弹窗需开分页 + 后端 `members` 接口加 offset/limit/total |
| **head 下边框** | 1px rgba(31,35,41,0.15) | `--color-line-header` 0.67px rgba(187,191,196,0.5) | 页面级覆盖或前端端全局 token |
| **tab 字号** | 14px | PerformanceLineTabs 16px | 页面级覆盖或确认 |

### 后端差异

| 项 | 飞书前端版 | 本地现状 | 差异 |
| --- | --- | --- | --- |
| `group/list` | `{semesterId, subjectType: 3}`（无 tab/分页，一次全量） | `GET /performance/cycles/{cycleId}/focus-groups?tab=&current=&size=` | 需**新端点或复用**：前端弹窗需要「按周期拉全部组（周期级+关联项目混合）」——本地 `manageable-focus-groups`（按 scope_setting_mode 过滤）语义不完全一致 |
| `emp_list` | 按 groupId + offset/limit 分页 + filters | `GET .../focus-groups/{groupId}/members`（全量不分页） | 需**加分页参数**（offset/limit/current/size）+ total |
| `enter` | `{can_show}` | 无 | 可复用 `priority-check` 语义或新增 |

## 5. 待确认事项

1. **前端弹窗的入口接入**：本地 `ProjectManagement.vue` 第 35 行 `otherModules` 的 `AuthorizationManagementPanel` **未绑 `@view`**（对比第 34 行 `authorizations` 绑了 `@view="handleAuthorizationView"`）。实现时需接 `@view` → 打开全屏弹窗/路由。
2. **弹窗的挂载方式**：本地前端弹窗应在 ProjectManagement 页面内以**组件形式挂载**（类似 `RevieweeAddDialog`），还是走**独立路由**（类似 `FocusGroupManagementDetail` 的 `hideAside` 路由）？飞书是纯前端状态切换（URL 不变），倾向组件挂载。
3. **`subjectType: 3` 的后端映射**：后端需新增前端弹窗专用接口（`POST /performance/cycles/{cycle_id}/focus-groups/overview` 之类）返回 `{groups: [{id, name, tab, count, activity_names}], can_show}`，一次拉全量（周期级+关联项目混合），不按 tab 分维度。**tab 语义从「维度分类」变为「组列表」**。
4. **虚线上级列**：本地快照 `emp_realtime_roster` 无虚线上级字段，飞书 `dottedLeaderIds` 数据源待确认。列先加（`--` 占位），数据源补充后直接填。
5. **分页 bug 不复刻**：飞书空态时分页仍显示旧 total（Tab2 空组显示「共 21 条」）是前端 bug，本地实现应随 tab 切换重置 total。

## 6. 素材索引

- 截图：`out/focus-people-group/top.png`（全屏）、`probe-top.png`、`tab2.png`、`add-modal.png`、`add-open.png`
- DOM：`probe.json`、`struct.json`（645 节点）、`body-text.txt` / `body-text-tab2.txt`（两 tab 全文）
- Tab/样式：`tabs.json`、`pixel-spec.json`、`table-spec-tab1.json`（列宽/分页）、`add-modal-spec.json`（添加弹窗）
- 接口：`api-reload.json`（31 条加载接口）、`api-interact.json`（tab 切换 emp_list）、`emp-list-replay.json`（完整 users 画像）、`api-add.json`
- 采集脚本：`capture-fg-{probe,main,more,tab,table,emp,pixel,add,addmodal}.js`
