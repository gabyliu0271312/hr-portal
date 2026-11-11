# REA 周期概览「添加被评估人」— DOM 与接口提炼报告

- 状态：**已采集**（2026-11-07 REA 实测飞书真实按钮 + 弹窗 + 提交流程；**实采提交联动（用户同意在 gaby测试 项目真实添加唐洁）**）
- 日期：2026-11-07
- 路径：绩效管理前台 → 项目管理 → 周期概览 → 总览 → 右上角「添加被评估人」
- URL：`https://idreamsky.feishu.cn/perf/management/v2/7702053437998894368/7340285661313974274/all-projects/overview`（实采用 semesterId=7702053437998894368 测试周期；初版 URL 7704220198642961662 已删项目）
- 权威：共享 Chrome（CDP 9222）实测 DOM/计算样式/网络拦截重放，证据 `rea-extract/out/cycle-overview/`
- 关联：与 [REA人员组管理页-DOM与接口提炼报告.md](./REA人员组管理页-DOM与接口提炼报告.md)、[REA人员组编辑表单-DOM与接口提炼报告.md](./REA人员组编辑表单-DOM与接口提炼报告.md) 同工作流；被评估人搜索/选择与人员组「搜索成员」共用同一 `root/add/search` 员工搜索体系。

## 1. 入口按钮（总览页右上角）

`ud__button ud__button--outlined ud__button--outlined-default ud__button--size-md ml-6`

| 属性 | 实测值 |
| --- | --- |
| 位置 | (1127, 76)，右上工具栏（周期名旁） |
| 尺寸 | **125×32**（min-width 未强制，内容撑开） |
| 文字 | 「添加被评估人」14px/400 #1F2329，无图标 |
| 边框 | **0.667px solid #D0D3D6**（outlined） |
| 圆角 | 6px |
| 背景 | #FFFFFF |
| padding | 4px 11px |
| 行高 | 22px |

**按钮规格与项目 `UiButton variant="secondary"`（outlined）完全同构**，直接复用。

## 2. 弹窗整体（ud__modal add-root-modal）

居中小弹窗，非全屏页。

| 属性 | 实测值 |
| --- | --- |
| 容器 | `ud__dialog__content ud__modal add-root-modal`，宽 **600px**，高 **609px**，位置 (340, 32) |
| 遮罩 | `ud__dialog__mask`（全屏 rgba 遮罩） |
| header | `ud__modal__header` 高 72px（含 padding 24/24），标题「添加被评估人」16px/600 #1F2329，x=364 y=161 |
| body | `ud__modal__body` 600×275 @ y=195，margin-bottom 24px |
| footer | `ud__modal__footer` 600×56 @ y=480 |
| 关闭 | 右上角 icon 按钮 28×28（`ud__modal__close`，ud__button--icon） |

**弹窗与项目 `PerformanceDialogShell` 完全对齐**：宽度 token `--performance-dialog-wide-width: 600px` ✅、header 72px ✅、footer 56px ✅、关闭 28px ✅、圆角/阴影 ✅。直接复用 `PerformanceDialogShell`，`width` 用默认值。

## 3. body 内容（表单）

### 3.1 Info 提示条（弹窗顶部）

`ud__notice ud__notice-info ud__notice-showIcon ud__notice--filled`，role=alert，margin-bottom **20px**：

- 图标 `InfoFilled`（24×24，蓝色，白色 `i` 图形）→ 项目有 `InfoFilledIcon.vue`
- 文案（两行）：
  1. 添加成功后，该人员可完成对应评估任务。
  2. 每天 19:00 项目管理员会收到添加、删除、转移人员的记录。

### 3.2 表单（ud__form ud__form-vertical）

两个必填字段，布局 `ud__form__item`（row）→ label 列 + control 列：

| 字段 | label | 必填 | 控件 | 实测规格 |
| --- | --- | --- | --- | --- |
| 选择项目 | 「选择项目」14px/600 | `*`（`ud__form__item__required-mark`，红） | `ud__select`（**readOnly**，不可输入） | 552×32，border 0.667px #D0D3D6，radius 6px，value「1」，右侧 clear × + DownBold 箭头 |
| 被评估人 | 「被评估人」14px/600 | `*` | `ud__select employee-select-internal`（员工搜索选择器） | 552×32，同规格，placeholder「请输入」#8F959E |

字段间距：两字段 `data-index 0/1`，垂直 form，间距由 form 默认（约 24px）。

**项目对照**：label + `PerformanceRequiredLabel`（必填星号）复用；选择项目可用 `PerformanceAssessmentSelect`/`PerformanceSearchSelect`（readOnly 单值）；被评估人用 **`PerformancePersonSelect`**（已对齐 REA 员工搜索交互）。

## 4. 项目下拉（选择项目）

**只有一个选项，默认选中，readOnly**。点击展开：

```
ud__select__dropdown（364,358,552×57）
└─ 选项「1」（当前选中项目）
└─ 分组标题「绩效评估模式」
```

- 下拉面板 552 宽，高 57px（1 选项 + 分组头）
- 项目选项来自当前周期 `semesterId` 下当前角色（`roleId`）可管理的项目；**每次新建弹窗打开时默认选中第一个（当前概览的项目）**

**注意**：项目被删后用户看到的是「选择项目」为空的场景，此时需**先选项目**再搜员工（本项目从 URL `roleId=7340285661313974274` 推断当前角色，`selectActivityId` 随选择联动）。

## 5. 被评估人搜索（核心交互）

### 5.1 搜索接口（实测）

**`GET /perf/api/review/root/add/search?text={keyword}&semesterId={semesterId}&role=activity_manager&roleId={projectId}&selectActivityId={activityId}&selectActivityType={activityType}`**

实测：`?text=张&semesterId=7704220198642961662&role=activity_manager&roleId=7340285661313974274&selectActivityId=7704927450957876215&selectActivityType=review_360`

响应 `{code:0, data:{userList:[{userInfo, reason, isPermitted}]}}`，userInfo 含：

```json
{
  "tenantID": "...",
  "avatar72": "https://s3-imfile.feishucdn.com/...",
  "department": {"id": "...", "zh-CN": "ST", "en-US": "ST"},
  "email": "alvis.zhang@idreamsky.com",
  "employeeType": {"id":"1","i18nName":{"zh-CN":"正式"}},
  "id": "6734503799605560843",
  "status": 0,
  "i18nName": {"zh-CN": "alvis.zhang张廷军", "en-US": "alvis.zhang"},
  "dimissionStatus": "in_service",
  "jobTitle": {"id":"","zh-CN":""}
}
```

- **`isPermitted: true/false`** 与 **`reason`**（如「已在项目中」）控制条目可选/禁用
- 搜索触发时机：**输入关键词才发请求**（与人员组搜索一致）

**辅助接口**（搜索时并行触发）：
- `POST /perf/api/user/v2/licenses`（许可校验，返回 `{is_enabled, licenses:{userId:[...]}}`）
- `POST /perf/api/user/gets`（批量用户详情，头像/领导/部门快照）

### 5.2 下拉条目（ud__select__list__item，545×52）

```
ud__select__list__item（368,159,545×52，flex row center）
├── 头像区（40 宽）
│   └── ud__avatar ud__avatar-circle ud__avatar-image avatar：**32×32 圆形**，内 IMG 头像
├── 内容区 content（409 宽，flex column）
│   ├── .name：「alvis.zhang张廷军」14px/400/22px #1F2329
│   └── .department：「ST」12px/400/22px #8F959E
├── 状态标签（右侧，仅禁用条目）：「已在项目中」14px #8F959E
└── ud__select__list__item__check（对勾，display:none，多选/选中时显示）
```

**禁用态**：`ud__select__list__item-disabled`，整条目颜色 `rgb(187,191,196)`（灰），右侧显示 reason（「已在项目中」）。点击不可选。

**下拉面板**：`ud__select__dropdown add-employee-select-dropdown`（364,155,552×245），最大 6 条可见滚动。

### 5.3 项目对照（复用评估）

| 飞书原版 | 项目现有组件 | 结论 |
| --- | --- | --- |
| 条目 545×52：头像 32 圆 + 姓名 14 + 部门 12 | **`PerformanceSearchSelect`**（`optionLayout="detailed"`/has-avatar） | **已按 REA 规格实现**：avatar 32 圆、name 14px、subLabel 12px #8F959E、option 高 52px ✅ |
| remoteSearch（输入才请求） | `remoteSearch` prop 默认 true | ✅ |
| 禁用条目（已在项目中） | `option.disabled` + is-disabled 灰 | ✅（disabled + 文案需补 reason） |
| 多选对勾 | `optionStyle="checkmark"` | ✅ |
| 员工搜索接口 root/add/search | 项目 `performanceFocusGroupApi.searchPeople` 等价体 | 需新增（见 §7） |
| Info 提示条 | `InfoFilledIcon.vue` | ✅ |

**结论：被评估人选择 = `PerformancePersonSelect` + 项目 `root/add/search` 等价接口，无需新选择器组件。**

## 6. 提交流程（实测拦截）

### 6.1 选择校验接口

选中员工后、点确定前触发：

- **`POST /perf/api/review/root/reviewee/conflict_stages`**（70B，冲突环节校验）
- **`POST /perf/api/review/okr/check_user_okr_by_activity`**（79B，OKR 校验，决定是否弹 OKR 通知确认）

### 6.2 提交接口（实测）

**`POST /perf/api/review/root/add_v2`**

```json
{
  "activityId": "7704927450957876215",
  "userId": "6734503799605560843",
  "visibleAddOkrNotice": false,
  "activity_type": "review_360",
  "roleId": "7340285661313974274",
  "role": "manager"
}
```

- `roleId` = 当前项目 role id（URL 中 `7340285661313974274`）
- `role` = `manager`（当前身份：项目管理员）
- `visibleAddOkrNotice` = false（默认不弹 OKR 提示；若 OKR 校验返回需要，则 true）
- 响应 `{code:0, success:true}`；成功后面板关闭并刷新成员列表

### 6.3 删除/转移（同体系，未实测）

管理端成员管理应含删除（`root/delete`）、转移（`root/transfer`）——本次目标只要求「添加」，未采，开发时如需可同链路补采。

## 6b. 添加成功后的联动实测（2026-11-07 实采，gaby测试 项目添加唐洁）

用户同意后在**真实环境提交**（不拦截 `add_v2`），提交前后对比确认「添加被评估人成功后哪些地方随之变化」：

### 提交接口（实测实采）

`POST /perf/api/review/root/add_v2` → 200
```json
{"activityId":"7704278623921900804","userId":"6733065927262406158","visibleAddOkrNotice":false,"activity_type":"review_360","roleId":"7340285661313974274","role":"manager"}
```
（activityId = gaby测试 项目 `7704278623921900804`，userId = 唐洁 `6733065927262406158`）

提交后立即触发：**仅此一个接口**。弹窗随即关闭，无成员列表/人数刷新接口发出——**前端本地更新列表，不发请求**。

### 联动变化清单（对比接口证据）

| 联动点 | 提交后实测 | 证据 |
| --- | --- | --- |
| 后台周期成员列表 | **唐洁出现在成员列表** | `POST report/v3/semesters/7702053437998894368/users/list` → `users` 含 `rita.tang唐洁 (6733065927262406158)`（另有 alice.xiao） |
| 周期/项目人数 | **count 2**（添加前 1） | 同接口 `user_count:2, review_user_count:2, selectable_user_count:2`；`POST users/count` → `count:2` |
| 前台总览完成率 | **各环节 total:2**（添加前 1） | `POST report/v3/semesters/.../report/reviews/completion` → goal_setting/self_review/leader_review 全部 `total:2`，唐洁 `statusNotFinished` |
| 自动建任务树 | **唐洁有独立 rootReviewId** | 成员条目 `rootReviewId: 7705424304472591392`，各环节 `semesterStageStatusGroup:* = statusNotFinished` |
| **是否进校准** | **否（项目无校准环节）** | 唐洁条目阶段字段仅 `goal_setting/self_review/leader_review×2/appeal/invite_review`，**无 calibration**；`users/meta` 阶段键集也仅这 5 个 → gaby测试 项目未配校准环节 |

**结论（回答核心疑问）**：添加被评估人成功 = 该人**立即进入项目所有已配置环节**（自动建任务树、计入总览完成率分母、后台成员列表与人数同步 +1）；**是否按校准规则进校准，取决于该项目是否配置了校准环节**——添加动作本身不额外决定校准归属，项目有校准环节则新成员自动纳入校准统计。

**注意**：总览页刷新后成员名不直接显示（完成率视图按环节统计，无人员明细）；成员明细在后台周期成员列表（`users/list`）与前台成员列表 tab。

### 数据一致性模型（快照，非多源）

`add_v2` 提交后**只发出一个请求**，后端一次写入同时完成：往成员表写唐洁 + 自动建 review root。`users/list`、`users/count`、`reviews/completion` 并非三个独立数据源，而是**同一成员/任务快照的三张查询视图**（成员列表、快照计数、任务完成率统计均查最新快照）。落库即全链路一致，无需分别同步。

本项目后端与此同构：`PerformanceProjectMemberSnapshot` 为唯一事实源，`PerformanceProjectMember` 挂 `snapshot_id`，`PerformanceNodeTask` 引 `member_snapshot_id`，列表/人数/完成率接口均查 `_latest_member_snapshot_statement`。**一次写入 = 全视图自动更新。**

前端真正的问题只有一个：**已渲染的视图不会自动重绘**（弹窗遮罩下的总览完成率仍是旧 total）。所以提交成功回调只需按**当前所在视图**触发一次查询重绘，不是分别重拉三个接口。

### 影响面（开发时需刷新的视图）

1. 后台「周期与项目」→ 周期成员列表（当前视图重查 `users/list`）
2. 后台周期人员数（若当前显示，重查 `users/count`）
3. 前台总览完成率（当前视图重查 `reviews/completion`）
4. 弹窗关闭（`add_v2` 成功后）

即：**按当前视图刷新一次即可**，后端同一快照保证其他视图数据已是最新。


## 7. 开发落地建议（对照现有代码）

### 后端新增接口（当前无等价体）

| 接口 | 说明 |
| --- | --- |
| `POST /performance/projects/{project_id}/reviewees/search` | `root/add/search` 等价：keyword 搜索可添加被评估人，返回 `{userInfo, isPermitted, reason}`；按项目 scope 过滤已加入者 reason=「已在项目中」 |
| `POST /performance/projects/{project_id}/reviewees` | `root/add_v2` 等价：body `{user_id, visible_add_okr_notice}`，校验冲突 + 落库 + 审计 |
| `POST /performance/projects/{project_id}/reviewees/conflict-check` | `reviewee/conflict_stages` 等价 |
| OKR 校验 | 项目有 `okr_router.py`（按任务读 OKR），需按 activity+user 判是否存在 OKR |

人员搜索数据源：项目已有 `/performance/templates/people/options`（人员池）+ `performanceFocusGroupApi.searchPeople`（人员组搜索，按周期 + keyword）。被评估人搜索可复用人员池 + 项目 scope 过滤。

### 前端

| 复用点 | 组件 |
| --- | --- |
| 弹窗壳（600×609、header 72、footer 56、关闭 28） | **`PerformanceDialogShell`**（width 默认 600px，token 已对齐） |
| Info 提示条 | **`InfoFilledIcon.vue`** + `ud__notice` 等价结构（项目可用 `ElAlert` 或自绘） |
| 表单字段 label + 必填星号 | **`PerformanceFormItem` / `PerformanceRequiredLabel`** |
| 选择项目 | **`PerformanceSearchSelect`**（readOnly 单值）或项目下拉组件 |
| 被评估人 | **`PerformancePersonSelect`**（已对齐 32 头像/部门/remoteSearch/disabled/multi） |
| 确定/取消按钮 80×32 filled/outlined | **`UiButton variant="primary"/"secondary"`** |
| 提交 loading / 关闭 | `PerformanceDialogShell` loading + footer slot |

### 行为要点

1. 弹窗打开时**默认选中当前项目**（readOnly 显示项目名），被评估人可搜可多选。
2. 选择被评估人时触发 `root/add/search`，**已加入条目置灰 + reason「已在项目中」不可选**。
3. 点确定先过冲突/OKR 校验，成功 → `add_v2` 提交 → 关闭弹窗刷新列表。
4. 可选**多选**（payload 逐条 add_v2，或后端支持批量），对勾显示与人员组成员添加一致。

## 8. 素材索引

- `out/cycle-overview/`：
  - `btn-info.json`（按钮计算样式）
  - `dialog-fulltext.txt`（弹窗完整文本）、`dialog-tree.json`（DOM 树）、`body-html.json`（表单 HTML）
  - `dialog-controls.json`（控件计算样式）、`dialog-layout2.json`（header/footer/弹窗 rect）
  - `proj-dropdown2.json`（项目下拉选项）、`proj-opts.json`
  - `emp-panels2.json`（员工下拉条目 545×52）、`emp-item-detail2.json`（条目内部 DOM：头像 32/name/department/disabled）
  - `full-api.json`（全接口：add/search + user/gets + conflict_stages + okr check + add_v2）
  - `submit-payload2.json`（add_v2 payload 实测）
  - **提交联动实采**：`baseline-api.json`（提交前基线 29 条）、`submit2-api.json`（提交接口 + 弹窗关闭）、`post-submit-reload-api.json`（刷新后接口，含 add/activity + reviews/completion）、`admin-api.json`（后台周期页，含 users/list + users/count）、`admin-projects-api.json`、`tangjie-items.json`（搜索唐洁条目）、`tangjie-selected-state.json`（选中待提交状态）、`memberlist-api.json`
  - 截图：`overview-full.png`（按钮）、`dialog-content.png`（弹窗）、`emp-panels2.png`（员工下拉）、`tangjie-selected.png`（唐洁已选）、`after-submit.png`（提交后）、`memberlist-tab.png`、`admin-cycles.png`、`admin-projects-tab.png`
- 采集脚本：`capture-cycle-overview-{probe,dialog,dialog2,dialog3,interact,dropdown2,submit,empsearch,state,detail,detail2,body,bodyhtml,multiselect,select3,full}.js` + `capture-reviewee-add-{stage1,stage2,stage3,stage4,stage5}.js`
