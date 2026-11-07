# REA 人员组「编辑表单」— DOM 与接口提炼报告

- 状态：**已采集**（2026-11-07 REA 实测飞书真实编辑表单，供编辑表单实现）
- 日期：2026-11-07
- 路径：绩效管理后台 → 周期与项目 → 人员组管理 → 行内「编辑」→ 详情页 → 「编辑」→ 编辑表单
- 权威：共享 Chrome（CDP 9222）实测 DOM/计算样式/网络拦截重放，证据 `rea-extract/out/focus-edit/`（项目版）与 `.../semester/`（周期版）。
- 关联：交接文档 [REA人员组编辑表单-交接说明.md](./REA人员组编辑表单-交接说明.md)、[REA新建人员组页-DOM与接口提炼报告.md](./REA新建人员组页-DOM与接口提炼报告.md)、[REA人员组管理页-DOM与接口提炼报告.md](./REA人员组管理页-DOM与接口提炼报告.md)

## 1. 编辑链路（实测澄清）

**飞书实际编辑链路是两层跳转，两页签一致**：

```
人员组管理列表页（focus-people?tab=semester|activity）
  └─ 行内「编辑」（link 28×22）
      └─ 详情管理页（focus-people/management/{groupId} 或 activity-focus-people/{groupId}）
          └─ 头部「编辑」按钮（outlined 80×32, 1160,96）
              └─ 编辑表单页
                  ├─ 周期版：focus-people/edit/{groupId}
                  └─ 项目版：activity-focus-people/{groupId}（同一表单组件）
```

**关键澄清（与交接文档 §2 不同）**：
- 管理页列表的「编辑」**不直接进表单**，先进**详情管理页**（基本信息回显 + 人员列表 tab + 变更记录 tab）。
- 详情管理页头部「编辑」才进**编辑表单**。
- 项目版编辑表单 URL = `activity-focus-people/{groupId}`（非 `focus-people/edit/{groupId}`），但**渲染的是同一编辑表单组件**（标题「编辑人员组」，字段/布局与新建表单同构）。
- 本项目当前实现（`FocusPeopleManagement.vue` 编辑按钮 → `PerformanceCycleFocusPeopleEdit` 表单）是**一步直达**，与飞书**两层链路不同**——需按 REA 对齐（见 §6）。

## 2. 详情管理页（management/{groupId}）规格

全屏页形态弹窗，head「人员组管理」+ 返回，head 下边框 0.67px rgba(187,191,196,0.5)，56px 高（同全屏页通用 head）。

**基本信息卡片**（左卡片 796 宽 + 右侧 profile card 400 宽两枚，底层周期看板骨架被遮罩盖住）：

| 字段 | 项目版（group 7705321089009716245） | 周期版（group 7669998387978046396） |
| --- | --- | --- |
| 人员组名称 | 1 | 核心管理干部 |
| 人员组说明 | 2 | -- |
| 关联评估项目 | 2026年半年度绩效评估 | （周期版无） |
| 关注人 | — | alice.xiao肖惠方 |
| 该人员组对谁可见 | — | 仅关注人可见 |
| 展示该人员组标签 | — | 是 |
| 人员范围设置方式 | （项目版无此字段） | 手动维护人员范围 |
| 人员范围规则 | 授权用户可在前台管理人员范围 | 项目管理员（checkbox 勾选） |
| 独立结果沟通时间 | — | 未设置 |

头部「编辑」按钮（outlined 80×32，1160,96，#1456F0 边框文字 / 白底 / radius 6px）。

**人员列表 tab**（`ud__table`，空态「暂无人员」或数据态行 + 移除）：
- 表头 47px，`ud__table-column-title` 14px/500 #646A73
- selection-col 46px、首列 fix-left 195px（姓名）、操作 fix-right 102px
- 列：姓名 / 直属上级 / 虚线上级 / 一级部门 / 末级部门 / 序列 / 添加人 / 添加时间 / 操作
- 工具栏：添加（outlined-primary 80×32）+ 搜索成员（292×32）+ 筛选（outlined 80×32）
- 空态：`ud__table-empty-wrapper` 1126×163，「暂无内容」→ 成员空态文案为「暂无人员」

**注意**：详情页成员表格列宽（195/102 等）与**管理页列表表格**（240/120/160 等）不同，两者是不同的表格实例。

### 2.1 变更记录 tab（REA 补采，2026-11-07 实采周期版「核心管理干部」6 条）

**表格列（5 列，`ud__table` 同规格）**：

| 列 | 宽度 | 内容 | 备注 |
| --- | --- | --- | --- |
| 操作人 | 264 | `ee-user-card` 头像 + 姓名 | alice.xiao肖惠方 |
| 操作类型 | 200 | 新增 / （移除待实测文案） | `change_event` 1=新增 |
| 操作条件 | 450 | 空（新增无内容）；移除/规则变更时可能显示 scope_rule/activity_change | 当前 6 条全空 |
| 变更人员数 | 223 | **数字按钮**（text-primary）→ 点击展开员工列表弹窗 | 「1」「4」「5」「7」 |
| 操作时间 | 223 | `YYYY-MM-DD HH:mm` | 2026-08-04 10:54 |

**接口（点 tab 才请求，POST）**：
- `POST /perf/api/review/user_group/change_log/show` → `{list:[{semester_id, group_id, change_event, change_type, operator_id, change_content:{user_ids[], scope_rule, activity_change[], activity_change_infos}, operator_time(ms)}], total}`
- 分页参数在 URL query：`?currentPage=1&pageSize=10`
- 辅助：`POST /user/snapshot/simple_emp`（操作人/成员头像+姓名）、`POST /review/snapshot/simple`（员工快照：i18nName/leaderId/department/topDepartment/i18nNameCategory）

**变更人员数展开弹窗**（点数字按钮）：
- 标题「人员列表」，副标「符合条件的员工，共计 N 人」
- 列：姓名/直属上级/虚线上级/一级部门/末级部门/序列/子序列/职务（比详情页成员表格多「子序列/职务」，无操作列）
- 数据源：`POST /review/snapshot/simple`（员工快照按 user_ids 批量返回）

**分页**：表格底部「共 6 条」「1」「10 条/页」——与 `PerformanceManagementTable` 分页同构。

## 3. 编辑表单 — 项目版（关联评估项目的人员组）

URL：`activity-focus-people/7705321089009716245`。标题「编辑人员组」。全屏页形态。

### 3.1 字段清单

| 字段 | 控件 | 编辑态回显 | 编辑态交互 | payload 字段 |
| --- | --- | --- | --- | --- |
| 人员组名称 * | 多语言输入（中文 tag） | 1 | **可改** | `name` / `enName` |
| 人员组说明 | 多语言输入（中文 tag） | 2 | **可改** | `description` |
| 关联评估项目 * | ud__select 760×32 | 2026年半年度绩效评估 | **可改**（下拉展开 2 选项） | `activity_ids` |
| 前台可管理人员范围的角色 | checkbox×3（实线上级/HRBP/项目管理员） | 全不勾 | **可改** | `roles_of_managing_scope` |

**无「人员范围设置方式」radio**（项目版只有手动维护，默认 `scope_setting_mode:1`）。

### 3.2 像素规格（实测计算样式，与新建表单同构）

| 元素 | 规格 |
| --- | --- |
| 全屏页 head | 高 56px，下边框 0.67px rgba(187,191,196,0.5)，标题「编辑人员组」16px/600 #1F2329，返回 68×28 |
| 内容列 | w-400 居中，800px（x=236） |
| 卡片1「基本信息」 | 236,74,800×381，radius 8px，padding 20px，shadow rgba(31,35,41,.03/.02/.02) |
| 卡片2「人员范围设置」 | 236,471,800×236，mt-16px |
| 输入框（名称/说明） | 760×31，border 0.67px #D0D3D6，radius 6px，文字 14px/400 #1F2329，padding 4/8/4/11，语言 tag 36×20 12px #646A73 bg #EFEFF1 radius 4px |
| 添加英文 | 82×22，14px #1456F0，radius 6px |
| 关联项目 select | 760×32，border 0.67px #D0D3D6，radius 6px，padding 1/11/1/3 |
| checkbox | 16×16，border 0.67px #8F959E，radius 4px，label ml 8px，行高 22px，行距 8px（mt-4） |
| footer | `py-8 absolute bottom-0 bg-white w-full flex z-10`，0,609,1272×65，border-top 0.67px rgba(31,35,41,.15)，padding 16px 0 |
| 确定 | filled 80×32，bg #1456F0 白字，radius 6px，border 0.67px #1456F0，padding 4/11 |
| 取消 | outlined 80×32，白底 #1F2329 字，border 0.67px #D0D3D6，ml 12px |

### 3.3 接口（实测拦截）

**回显**：`GET /perf/api/review/follow/group/info?semesterId=7654423719619710195&groupId=7705321089009716245`
```json
{groupId, semesterId, group_type:1, activity_ids:["7654470731517987794"], name:"1", description:{zh-CN:"2"},
 followeeUserIds:null, isCommunicateTime:0, scope:null, viewPermission:1, scope_setting_mode:1,
 roles_of_managing_scope:null, show_group_tag:0, activities:[{id, name:{zh-CN:"2026年半年度绩效评估"}, has_permission:true}]}
```

**保存**：`POST /perf/api/review/follow/group/edit`
```json
{"groupId":"7705321089009716245","semesterId":"7654423719619710195","tenantId":"6732051441411884552",
 "scope_setting_mode":1,"viewPermission":1,"name":"1","enName":"","description":{"zh-CN":"2","en-US":""},
 "roles_of_managing_scope":null,"activity_ids":["7654470731517987794"]}
```

**关联项目下拉选项**：`GET /perf/api/review/activities_v2?offset=0&limit=9999&semesterId=...`（页面加载拉一次，`count:2`：2026年半年度绩效评估 / 2026年半年度绩效评估 测试）。

## 4. 编辑表单 — 周期版（周期级人员组）

URL：`focus-people/edit/7669998387978046396`。标题「编辑人员组」。三卡片结构。

### 4.1 字段清单与编辑态交互（核心差异）

| 字段 | 控件 | 编辑态回显 | 编辑态交互 | payload 字段 |
| --- | --- | --- | --- | --- |
| 人员组名称 * | 多语言输入 | 核心管理干部 | **可改** | `name` / `enName` |
| 人员组说明 | 多语言输入 | -- | **可改** | `description` |
| 关注人 | 搜索多选 select 760×32 | alice.xiao肖惠方 +0 | **可改** | `followeeUserIds` |
| 该人员组对谁可见 | radio×2（solid horizontal） | 仅关注人可见（checked） | **可改** | `viewPermission` |
| 展示该人员组标签 | switch 28×16 sm | 开（checked） | **可改** | `show_group_tag` |
| 标签颜色 | 色板控件 | 标签 + indigo 色（tag_color="indigo-option"） | **可改** | `tag_color`/`text_color`/`bg_color` |
| **设置方式** * | **radio×3（solid vertical）** | **手动维护人员范围（checked）** | **禁改（原生 disabled=true）** | `scope_setting_mode` |
| 前台可管理人员范围的角色 | checkbox×3 | 项目管理员（勾选） | **可改** | `roles_of_managing_scope` |
| 设置独立的结果沟通时间 | switch 28×16 sm | 关 | **可改** | `isCommunicateTime`/`startTime`/`endTime` |

### 4.2 「设置方式」radio 禁用态（交接开放点 #1 实测确认）

```
ud__radio__input（×3）dis=true   ← 原生 disabled
ud__radio__wrapper--disable / ud__radio__wrapper--checked（wrapper 带 disable）
cursor:not-allowed  opacity:1
```

- 三个选项（按规则维护/手动维护/仅API 写入）**全部原生禁用**，当前选中「手动维护人员范围」。
- 与新建表单的区别：新建三个都可选；**编辑态锁定当前值**，不可切换。
- 本项目现有实现（周期版 `PerformanceRadioGroup :disabled="isEditing"`）**与飞书一致** ✅ 无需改。

### 4.3 接口（实测拦截）

**回显**：`GET /perf/api/review/follow/group/info?semesterId=7654423719619710195&groupId=7669998387978046396`
```json
{groupId, semesterId, group_type:0, activity_ids:[], name:"核心管理干部", enName:"",
 followeeUserIds:["6733065927262635534"], isCommunicateTime:0, startTime:0, endTime:0, scope:[],
 viewPermission:0, scope_setting_mode:1, roles_of_managing_scope:["activity_manager"],
 show_group_tag:1, tag_color:"indigo-option", text_color:"#151b70", bg_color:"rgba(91,101,245,0.2)",
 color:"{\"tag_color\":\"indigo-option\",...}", count:22, activities:[]}
```

**保存**：`POST /perf/api/review/follow/group/edit`
```json
{"groupId":"7669998387978046396","semesterId":"7654423719619710195","tenantId":"6732051441411884552",
 "name":"核心管理干部","enName":"","description":{"zh-CN":"","en-US":""},
 "followeeUserIds":["6733065927262635534"],"viewPermission":0,"scope_setting_mode":1,
 "roles_of_managing_scope":["activity_manager"],"show_group_tag":1,"tag_color":"indigo-option",
 "isCommunicateTime":0,"startTime":0,"endTime":0,"scope":[],
 "text_color":"#151b70","bg_color":"rgba(91,101,245,0.2)"}
```

**额外加载**：`GET /perf/api/review/semester/communication_stages?semester_id=...`（90B，结果沟通时间卡片联动）。

## 5. 两版本编辑表单差异对照（开发关键）

| 维度 | 项目版 | 周期版 |
| --- | --- | --- |
| 路由 | `activity-focus-people/{groupId}` | `focus-people/edit/{groupId}` |
| 卡片数 | 2（基本信息 + 人员范围设置） | 3（基本信息 + 人员范围 + 其他设置） |
| 关联评估项目 * | **有**（必填，可改） | 无 |
| 设置方式 radio | 无（默认手动维护） | **有且编辑态禁改** |
| 关注人 | 无 | 有（可改） |
| 对谁可见 radio | 无（默认 viewPermission:1） | 有（可改） |
| 展示标签 switch + 标签颜色 | 无 | 有（可改） |
| 沟通时间 | 无 | 有（可改） |
| 角色 checkbox | 有（文案「关联评估项目的被评估人的…」） | 有（文案「实线上级/HRBP/项目管理员」） |
| 保存 payload | 含 `activity_ids`，无 `scope`/`followeeUserIds`/`show_group_tag` | 含 `scope`/`followeeUserIds`/`show_group_tag`/`tag_color`，无 `activity_ids` |

**共用点**（高组件开发基础）：
- 全屏页 head（返回+标题「编辑人员组」）— 复用 `UiPageHeader.vue` ✅
- 多语言输入（名称/说明，中文 tag + 添加英文）— 复用全局多语言输入组件
- 底部 sticky 确定/取消 80×32 — 复用表单底部栏模式
- 卡片容器 p-10 rounded-8 bg-white shadow-md，800px 内容列，form item 间距 16px — 复用现有 token
- 关注人搜索选择器（/user/query 搜索 + tag 多选）— 复用 `PerformancePersonSelect`
- 角色 checkbox（16×16 radius 4px 行高 22px 行距 8px）— 与新建表单同规格
- 保存/回显接口共用 `follow/group/info` + `follow/group/edit`

## 6. 待实现事项与建议

1. **编辑入口链路对齐**：飞书是「列表行内编辑 → 详情管理页 → 头部编辑 → 表单」两层。**已实现**（2026-11-07）：列表「编辑」→ 详情管理页（路由 `PerformanceCycleFocusPeopleManagementDetail` / `PerformanceActivityFocusPeopleDetail`，组件 `FocusGroupManagementDetail.vue`）→ 头部「编辑」→ 复用 `PerformanceCycleFocusPeopleEdit` + `query.tab`（项目版渲染 `FocusPeopleGroupProjectCreate`）。详见 §6.5。
2. **项目版编辑表单**：`FocusPeopleGroupProjectCreate.vue` 复用新建组件套 edit 语义已基本正确（字段/布局与 REA 一致）。**「关联评估项目」编辑态可改**（当前无禁用，正确 ✅）。角色 checkbox 文案「关联评估项目的被评估人的…」与 REA 一致 ✅。
3. **周期版编辑表单**：`FocusPeopleGroupCreate.vue` 编辑态设置方式 `:disabled="isEditing"` 与飞书一致 ✅。其余字段（关注人/对谁可见/标签/颜色/沟通时间）需按 REA 字段集核对是否已实现。
4. **保存 payload 对齐**：两版本 edit payload 字段集不同（§5），后端 `PATCH` 需接受完整字段。周期版 `scope:[]` + `roles_of_managing_scope` 手动模式字段组合已确认。
5. **详情管理页**：**已实现**（2026-11-07）：
   - 页面：`FocusGroupManagementDetail.vue`（全屏页 head「人员组管理」+ 返回 + 头部「编辑」outlined 80×32）
   - 基本信息只读卡片：`FocusGroupDetailInfo.vue`（周期版/项目版字段分流，关注人经 `options()` 解析姓名，角色用 `PerformanceReadOnlySettingRow` 只读展示，沟通时间 `YYYY-MM-DD HH:mm` 格式化）
   - 成员列表 tab：`FocusGroupMembersPanel.vue`（工具栏「添加」outlined-primary 80×32 + 搜索成员 292×32 + 筛选 outlined 80×32；表格列 姓名195/直属上级195/一级部门240/末级部门240/序列240/添加人195/添加时间195/操作102 fix-right；空态「暂无人员」；移除确认弹窗复用 `PerformanceConfirmDialog`）
   - 变更记录 tab：`FocusGroupChangeLogPanel.vue`（见 §6.6）
   - 成员数据源：后端 `focus_group_members_router.py` GET `members`（直系上级姓名解析 + 添加人/添加时间经审计事件倒序取最后新增）；添加弹窗 `FocusGroupMemberAddDialog.vue`（复用 `PerformanceDialogShell` + `PerformancePersonSelect`，`searchPeople` 搜索，`updateMembers` 提交，成功后 `ElMessage.success('添加成功')`）。
6. **变更记录 tab（本轮补采，§2.1）**：**已实现**（2026-11-07）。后端 `focus_group_members_router.py`：GET `change-log`（`performance_audit_events` 的 `PERFORMANCE_FOCUS_GROUP_MEMBERS_UPDATED`，一次 updateMembers 事件 diff before/after employee_nos → 「新增」/「移除」各一条；操作人解析 `PORTAL_USER`→User.display_name / `EMPLOYEE`→快照 display_name；操作条件仅移除时显示被移除成员姓名；分页 `?current=1&size=10`）+ GET `change-log/{event_id}/people`（变更人员快照）。前端 `FocusGroupChangeLogPanel.vue`：5 列表格（操作人264/操作类型200/操作条件450/变更人员数223/操作时间223），变更人员数为数字按钮 → `PerformanceDialogShell`「人员列表（共 N 人）」+ UiTable 员工画像，分页对齐飞书。
7. **添加人/添加时间**：**已实现**（2026-11-07）。`_member_added_by` 倒序遍历审计事件取最后新增事件，解析 actor 姓名与 event_at；代码上线前老成员无审计记录 → 显示 `--`（用户确认）。

## 7. 素材索引

- 项目版：`out/focus-edit/` — `edit-struct.json`（117 节点结构）、`edit-styles.json`（像素样式）、`edit-text.txt`、`edit-interactions.json`（字段禁用态）、`edit-api-get.json`（group/info + activities_v2）、`edit-api-post.json`（edit payload）、`edit-top.png`、`edit-project-dropdown.png`（关联项目下拉）、`management-*`（详情管理页）
- 周期版：`out/focus-edit/semester/` — `semester-edit-form-struct.json`（结构）、`semester-edit-form-text.txt`（全字段文本）、`semester-edit-fields.json`（字段级禁用态）、`semester-edit-post.json`（edit payload）、`semester-edit-form-api.json`（group/info）、`semester-edit-form-top.png`、`semester-edit-top.png`（详情页）
- 变更记录 tab（本轮补采）：`out/focus-edit/changelog/` — `changelog-struct.json`、`changelog-text.txt`、`changelog-rows.json`（表格行 + 列宽）、`changelog-diff.json`（接口差分：change_log/show + snapshot/simple_emp + snapshot/simple）、`changelog-count-detail.json`（变更人员数弹窗）、`changelog-api.json`/`changelog-all-api.json`（详情页全量接口）
- 采集脚本：`capture-focus-edit-{probe,mgmt,form,api,interact,checkbox,styles,semester-nav,semester-form,semester-form2,semester-fields,changelog,changelog2,changelog3}.js`

## 8. 验收对照（交接文档 §6）

- ✅ REA 采集报告落盘（DOM/样式/接口证据齐全，两页签各一次）
- ✅ 开放点 #1：周期版编辑「设置方式」**禁改**（原生 disabled + not-allowed）→ 现有 `:disabled="isEditing"` 正确
- ✅ 开放点 #2：项目版编辑**无设置方式 radio**（手动维护固定），字段全部可改
- ✅ 编辑回显接口 group/info → 表单映射完整（§3.3 / §4.3）
- ✅ 保存接口 edit payload 两版本字段集实测（§3.3 / §4.3）
- ⬜ 编辑表单像素/token 与飞书对照通过（开发时逐项核）
- ✅ **详情管理页实现决策（§6.1→§6.5）**：列表「编辑」先进详情页（两条路由）+ 头部「编辑」进表单；基本信息只读卡片 `FocusGroupDetailInfo.vue`；成员列表 tab `FocusGroupMembersPanel.vue`（列宽 195/102 对齐、空态「暂无人员」、添加/移除弹窗、添加成功提示复用）；变更记录 tab `FocusGroupChangeLogPanel.vue`（操作人/操作类型/操作条件/变更人员数/操作时间，变更人员数点开「人员列表」弹窗）；后端 `focus_group_members_router.py` members/change-log/change-people 接口 + 审计事件 diff 语义。代码：`FocusGroupManagementDetail.vue`、`FocusGroupDetailInfo.vue`、`FocusGroupMembersPanel.vue`、`FocusGroupChangeLogPanel.vue`、`FocusGroupMemberAddDialog.vue`、`focus_group_members_router.py`、api/performance.ts。验证：后端 42 passed / 前端 focus-group vitest 5 passed / vue-tsc exit=0。
