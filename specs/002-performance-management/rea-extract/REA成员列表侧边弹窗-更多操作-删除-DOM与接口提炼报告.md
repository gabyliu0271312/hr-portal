# REA 成员列表侧边弹窗「更多」操作（授权/转交/转移/删除）— DOM 与接口提炼报告

- 状态：**已交付**（2026-11-09 REA 实测 + 本地实现，删除功能已开发）
- 日期：2026-11-09
- 路径：绩效管理前台 → 项目管理 → 成员列表 → 点击成员行 → 侧边弹窗 → 右上角「更多」按钮 → 4 项操作菜单
- URL：`https://idreamsky.feishu.cn/perf/management/v2/7702053437998894368/7340285661313974274/all-projects/members?rootReviewId=7704285134907837708&activeTab=7311617673744744476`
- 权威：共享 Chrome（CDP 9222）实测 DOM/计算样式/接口拦截，证据 `rea-extract/out/members-delete/`（`more-menu-full.json` / `more-menu-css.json` / `delete-dialog-struct.json` / `delete-dialog-css.json` / `delete-dialog.json` / `after-delete.json` / `state-*.json`）。
- 执行：**已在测试绩效环境真实删除 alice.xiao 肖惠方**（用户第 6 条授权），删除成功、列表从 2 人变 1 人。

## 1. 交互路径与入口定位

**完整路径**：成员列表 → 点击成员行（`ud__table-row`，行 hover 有 `ud__table-row-hoverable` + `cursor-pointer`）→ 右侧滑出成员详情抽屉（`ud__drawer`，宽 **773px**，视口扩至 2200 后完整可见）→ 抽屉 **header 右上角「更多」icon 按钮**（`universe-icon p-2 rounded hover:bg-N-900 cursor-pointer text-16`，24×24）→ 点击弹出 4 项操作菜单。

**关键前提（实操教训）**：共享浏览器视口默认只有 **1280×673**，773px 宽的抽屉会滑到视口外不可见/不可点。必须先通过 CDP `Emulation.setDeviceMetricsOverride` 把视口扩到 ≥2200×900，抽屉和右上角按钮才可交互。

**抽屉 header 按钮区（绝对坐标，视口 2200×900）**：

| 元素 | 坐标 | 规格 | 说明 |
| --- | --- | --- | --- |
| 翻译成简体中文 | 1854,16 | 124×26 | `perf-translate-btn-left` |
| 翻译下拉三角 | 1979,16 | 22×26 | `perf-translate-btn-right`（icon 14×14） |
| 复制链接 | 2009,16 | 82×26 | `mr-4` |
| **「更多」icon** | **2099,17** | **24×24** | `universe-icon p-2 rounded cursor-pointer`，**点击弹出 4 项菜单** |
| 竖分隔线 | 2139,21 | 1×14 | `ud__divider--vertical` |
| 关闭按钮 | 2156,16 | 24×24 | `ud__button--icon` |

**注意**：右上角 4 个操作按钮**不在抽屉主体内容里**，而是「更多」icon 下拉菜单。`page.click()` / `element.click()` 对 React 合成事件不可靠，必须用 **playwright `page.mouse.click(x, y)` 真实鼠标点击**才能触发下拉。

## 2. 「更多」操作菜单（4 项）像素级规格

点击右上角「更多」icon 后，弹出下拉菜单（实测）：

```
容器：ud__menu-normal ud__menu-normal-root ud__menu-normal-vertical ud__dropdown__overlay ud-scrollbar
尺寸：139 × 152（x=1984, y=37，位于抽屉右上角下方）
└── li.ud__menu-normal-item.button-group-more-item.py-3.px-6  ×4（每项 132×35）
    ├── 授权他人处理（14px/400 #1F2329，前置 icon 16×16）
    ├── 转交他人处理（同上）
    ├── 转移（同上）
    └── 删除（同上）
```

| 属性 | 值 |
| --- | --- |
| 容器宽 | 139px（含左右内边距，实际项宽 132px） |
| 容器高 | 152px（4×35 + 12px 间距） |
| 菜单项 | 132×35，`py-3 px-6` |
| 菜单项文字 | **14px/400，色 #1F2329**，行高 22px |
| 菜单项图标 | 前置 `universe-icon` 16×16，位于项左侧（x=2000 起，距容器左 16px） |
| 项文字起点 | x=2024（图标右侧 8px） |
| 4 项纵坐标 | 授权(41) / 转交(77) / 转移(114) / 删除(151)，每项间距 36px |

**4 个菜单项文本（实测 DOM 文本）**：
1. 授权他人处理
2. 转交他人处理
3. 转移
4. 删除

**用户本期范围（2026-11-09 已确认）**：
- **删除**：本期重点，实现删除按钮 + 删除弹窗 + 真实删除；
- **授权/转交**：接入「更多」菜单并**接到现有 `PerformanceTaskDelegationDialog` 组件**，但**仅完成组件接入**（菜单项 → 打开组件），授权/转交组件本身的功能完善由后续迭代负责；
- **转移**：本期不开发（菜单项可渲染但置灰或不接功能）。

## 3. 删除弹窗（`ud__confirm`）像素级规格

点击菜单「删除」后弹出居中确认弹窗（实测，内容区 420×180 居中于 2200×900 视口 → x=890, y=360）：

```
ud__dialog__content ud__confirm ud__dialog__content-sm（420×180，radius 8px）
└── ud__confirm__content ud__confirm-hasIcon ud__confirm-confirm（420×180）
    ├── ud__confirm__header（420×124）
    │   ├── ud__confirm__title（372×24，16px/600 #1F2329）
    │   │   ├── ud__confirm__icon（24×24，色 #FF811A 橙）← 警示图标
    │   │   └── ud__confirm__titleContent「确定删除该人员吗？」
    │   └── ud__confirm__body（332×44，14px/400 #1F2329 两行）
    │       「删除后，系统将清除本周期被评估人数据，且无法恢复。」
    └── ud__confirm__footer（420×56）
        └── ud__confirm__footer__btns（372×44）
            ├── 保留（ud__button--outlined-default，80×32）→ 左
            └── 删除（ud__button--outlined-danger，80×32）→ 右
```

| 属性 | 值 |
| --- | --- |
| 标题 | **「确定删除该人员吗？」** 16px/600 #1F2329 |
| 图标 | `ud__confirm__icon` 24×24，**色 #FF811A（橙色警示）** |
| 正文 | **「删除后，系统将清除本周期被评估人数据，且无法恢复。」** 14px/400 #1F2329，行高 22px，两行（332×44） |
| 按钮区 | 372×44，右对齐，两按钮间距 12px |
| **删除按钮** | 80×32，`ud__button--outlined-danger`：白底、**border 0.67px solid #F54A45（红）**、**文字色 #F54A45（红）**、radius 6px、padding 4px 11px |
| **保留按钮** | 80×32，`ud__button--outlined-default`：白底、border 0.67px solid #D0D3D6、文字 #1F2329 |
| 按钮顺序 | **保留在左、删除在右**（默认行为保留，危险操作放右侧） |

**交互**：点击「删除」→ 弹窗关闭 + 抽屉关闭 → toast「操作成功」→ 列表自动刷新。

## 4. 删除接口（已实测拦截）

| 项 | 值 |
| --- | --- |
| **接口** | `POST /perf/api/review/root/delete_v2` |
| **请求体** | `{"rootReviewId":"7704285134907837708","roleId":"7340285661313974274","role":"manager"}` |
| **响应** | `{"code":0,"data":{},"msg":"操作成功","success":true}` |
| 触发时机 | 点击确认弹窗「删除」按钮 |

**参数语义**：
- `rootReviewId`：**被删成员在列表中的 root review id**（与页面 URL 的 `?rootReviewId=` 同源）——alice.xiao 的 rootReviewId = `7704285134907837708`
- `roleId`：当前周期/项目角色 id（URL 中 `7340285661313974274`，本页即项目 role）
- `role`：`"manager"`（项目管理员角色）

**删除成功后自动刷新列表**：`POST /perf/api/report/v3/semesters/{semesterId}/users/list`
- body：`{"offset":0,"limit":50,"advance_filters":[],"headerId":"header_activity_manager_list_all","orders":[{"key":"directDepartment","order":"ASC"},{"key":"user","order":"ASC"}],"roleId":"7340285661313974274","filters":[{"key":"range","values":["2"]}]}`
- 响应 `data.users`：成员全量画像（activity/直接部门/直属上级/employeeType/fullDepartmentPath/评分等），供成员列表渲染

**删除结果实测**：alice.xiao 从列表消失，结果数「2个结果」→「1个结果」，仅剩 rita.tang；toast「操作成功」。

## 5. 与本地代码对照（复用评估）

### 5.1 已存在可复用

| 飞书原版 | 本地现状 | 结论 |
| --- | --- | --- |
| 侧边成员详情抽屉 | `PerformanceReviewEvaluationDrawer.vue`（UiDrawerShell 720px/initial 1000px，resizable） | **复用**。本地抽屉头部已含翻译/复制链接（`PerformanceReviewPersonHeader`） |
| 授权他人处理 / 转交他人处理 | `PerformanceTaskDelegationDialog.vue` + `ProjectManagement.vue` `openDelegation('AUTHORIZE'/'TRANSFER', members)` | **已实现**。成员列表批量勾选后由 `@authorize-selected` / `@transfer-selected` 触发 |
| 成员列表行数据 | `ProjectMember`（含 `root_review_id`、`can_view_detail`、`can_authorize`、`task_id`、`task_map`） | **字段已具备**删除所需 `root_review_id` |
| 确认弹窗壳 | `PerformanceConfirmDialog.vue`（appearance/submit + icon slot） | **可复用**做删除确认弹窗（需 danger 变体） |

### 5.2 缺失（本期需新增）

| 项 | 飞书原版 | 本地现状 | 差异 |
| --- | --- | --- | --- |
| **抽屉右上角「更多」按钮** | `universe-icon` 24×24，下拉 4 项菜单 | `PerformanceReviewPersonHeader` 无「更多」操作位 | 需在抽屉 header 右上角加「更多」icon + 下拉菜单（授权/转交/转移/删除） |
| **删除确认弹窗** | `ud__confirm`：标题+橙 icon+红字 danger 删除按钮+保留按钮 | `PerformanceConfirmDialog` 无 danger/outlined-danger 变体 | 需 danger 按钮变体（文字/边框 #F54A45）或新增删除确认弹窗 |
| **删除接口** | `POST /perf/api/review/root/delete_v2`（rootReviewId + roleId + role） | 后端无此端点 | **后端需新增** `DELETE /performance/projects/{project_id}/members/{employee_no}` 或 POST 兼容（传 root_review_id） |
| **删除后刷新** | 删后自动重拉 users/list + toast「操作成功」 | `ProjectMemberListPanel.loadMembers()` 已有 | 删除成功后调 `loadMembers()` + `ElMessage.success('操作成功')` |

### 5.3 快照删除语义（用户第 5 条核心）

用户明确：系统以 **绩效管理后台 → 周期与项目 → 项目设置的人员快照** 为最基准，**删除 = 从快照里删除**，其他模块联动变化。

本地数据模型对照：
- `PerformanceProjectMemberSnapshot`（`performance_project_member_snapshots`）：项目成员快照版本，`source_snapshot_id` 关联授权快照、`snapshot_version` 版本号
- `PerformanceProjectMember`（`performance_project_members`）：快照下的成员明细，`snapshot_id` → 快照，`employee_no` 员工号
- 后端 members 查询（`_latest_member_snapshot_statement`）：取项目**最新快照**的成员列表

**删除实现落点**：从 `performance_project_members` 中删除「最新快照 + 该 employee_no」的行（或按 root_review_id 映射回快照成员行）。删除后：
- 成员列表（`performance/projects/{id}/members`）随之减少
- 该员工相关的节点任务（`performance_node_tasks`）需联动清理或标记删除（飞书语义「清除本周期被评估人数据」）
- 其他模块（矩阵分析、催办、评估率等）以快照为准自动联动

**删除语义（2026-11-09 已确认：当前周期全清）**：飞书 `root/delete_v2` 删除该周期该项目下的被评估人身份（root review 关联）。本地 `root_review_id` 即 `PerformanceProjectMember.id`（后端 `_matrix_person` 中 `"root_review_id": getattr(member, "id", None)`）——删除接口参数可直接用 `root_review_id`（= member id）定位快照成员行。**删除范围 = 当前周期该项目全清**：最新快照删该成员行 + 清理该成员在当前项目全部节点任务（`performance_node_tasks` where member_snapshot_id）及其关联数据。

## 6. 实现建议（本期：删除 + 授权/转交组件接入）

1. **后端新增删除端点**：`DELETE /performance/projects/{project_id}/members/{employee_no}`（body 或 query 传 `root_review_id`），实现：
   - 定位最新快照下该成员行 → 删除
   - **当前周期全清**：清理该成员在当前项目全部节点任务（`performance_node_tasks` where member_snapshot_id）及其关联数据
   - 返回 `{code:0, data:{}, msg:"操作成功"}`
2. **前端抽屉 header 加「更多」下拉**：在 `PerformanceReviewEvaluationDrawer` header 右上角加 icon 按钮 + 下拉菜单（4 项：授权他人处理 / 转交他人处理 / 转移 / 删除）。
3. **授权/转交仅组件接入**：「更多」菜单的授权/转交项 → 打开现有 `PerformanceTaskDelegationDialog`（`action: 'AUTHORIZE' | 'TRANSFER'`，传当前成员 task），**不做组件内功能完善**（后续迭代负责）。
4. **删除确认弹窗**：复用 `PerformanceConfirmDialog` 或新增 danger 变体，文案与按钮严格对齐飞书（标题/正文/橙 icon/红字删除/保留）。
5. **删除成功回调**：关闭弹窗+抽屉 → `ElMessage.success('操作成功')` → `loadMembers()` 刷新。
6. **转移本期不做**：菜单项可渲染但不接功能（或置灰），不实现转移逻辑。

## 7. 素材索引

- 菜单结构：`out/members-delete/more-menu-full.json`（4 项菜单 DOM）、`more-menu-css.json`（菜单项计算样式）
- 删除弹窗：`delete-dialog-struct.json`（完整 DOM 树）、`delete-dialog-css.json`（标题/正文/删除/保留按钮计算样式）、`delete-dialog.json`
- 删除接口：`after-delete.json`（`root/delete_v2` req/res + users/list 刷新链路 + 删除后页面文本）
- 交互中间态：`state-01-after-clear.json`、`state-02-after-row-click.json`（抽屉打开）、`drawer-head-wide.json`（header 按钮区）
- 采集脚本：`capture-members-del-{00..12}.js`
