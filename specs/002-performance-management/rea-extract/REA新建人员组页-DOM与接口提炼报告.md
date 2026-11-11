# REA 新建人员组页（focus-people/edit/create）— DOM 与接口提炼报告

- 状态：**已采集**（2026-11-07 REA 补采飞书真实新建表单，供新建/编辑抽屉表单实现）
- 日期：2026-11-07
- 路径：绩效管理后台 → 周期与项目 → 设置 → 人员组管理 → 周期级人员组 → 新建
- URL：`https://idreamsky.feishu.cn/perf/admin/semester-activities/7704220198642961662/focus-people/edit/create?from=...focus-people%3Ftab%3Dsemester%26current%3D1%26size%3D10`
- 权威：共享 Chrome（CDP 9222）实测 DOM/计算样式/网络重放 + bundle JS 源码检索。截图 `rea-extract/out/focus-create/`。

## 1. 页面定位与整体结构

「新建人员组」是**全屏页形态弹窗**（非居中抽屉，与已实现的「人员组管理」列表弹窗同构）。弹窗浮于周期看板之上，遮罩 + 全屏白底内容。

实测（viewport 1280×673）：

```
ud__dialog__mask（遮罩 rgba(0,0,0,0.55) 全屏）
└── ud__dialog__wrap.indexstyled__StyledFullPageModal（1280×673，ud__dialog--centered）
    └── ud__modal__content（白底 100vw/100vh）
        ├── indexstyled__ModalHeader（高 56px，白底，下边框 0.67px rgba(187,191,196,0.5)）
        │   └── HeaderItem.left（左区 20,14,1220×28，flex space-between）
        │       ├── GoBack「返回」（68×28，icon-back-arrow 20px + 16px/600 #1F2329）
        │       ├── VerticalLine（100,20，1×16，rgba(31,35,41,0.15)）
        │       └── ModalTitle「新建人员组」（117,16，80×24，16px/600 #1F2329）
        └── indexstyled__Body.full-page-body（0,56，1280×617）
            └── flex.flex-col.items-center.min-h-full（bg #F2F3F5，内容 1272 宽）
                └── FORM.ud__form-vertical.flex-1
                    └── div.w-400.pt-9（**800px 内容列**，x=236 起）
                        ├── 卡片1「基本信息」（p-10 rounded-8 bg-white ud__card--shadow-md）
                        ├── 卡片2「人员范围」（同上 mt-8）
                        └── 卡片3「其他设置」（同上 mt-8）
```

**关键布局数字**：
- 内容列宽 **800px**（x=236 起，居中于 1280 - 左右各 240？实测 form 在 x=236，宽 800）
- 表单 item 内边距：label 区高 22-23px，control 区高 31-32px，**label 与 control 之间 60px 间距**（`ud__form__item` mb-8 / mb-0）
- 每张卡片：padding 10px（`p-10`）+ 圆角 8px + shadow-md + 白底
- **底部操作区 sticky**：`mt-8 py-8 sticky bottom-0 bg-white w-full`（高 65px，y=609 起），内部 `w-400 mx-auto`（800px 居中）承载 确定/取消

**页面背景**：弹窗打开时底层仍可见周期看板被遮罩盖住（与列表弹窗一致）。

## 2. 接口逻辑（已实测重放确认 + bundle 源码）

### 2.1 页面加载时调用（实测）

| 接口 | 方法 | 参数 | 用途 |
| --- | --- | --- | --- |
| `/perf/api/review/semester?id=7704220198642961662` | GET | id | 周期信息（name/dateRange/empTotal/deptTotal/template_groups 等） |
| `/perf/api/review/follow/group/get_import_api_link` | GET | — | 返回 `{group_api_link: "https://open.larkoffice.com/document/.../performance-v2/user_group_user_rel/write"}`，用于「仅API 写入」模式展示 API 文档链接 |
| `/perf/api/user/scopes/resolve-scope/meta?semester_id=7704220198642961662&scene=focus_group&need_invisible=true` | GET | semester_id, scene, need_invisible | **规则条件维度元数据**（见 §3.5） |
| `/perf/api/user/custom_org_type/list?semester_id=...` | GET | semester_id | 自定义组织类型（本次 data=null） |
| `/perf/api/review/semester/communication_stages?semester_id=...` | GET | semester_id | 结果沟通阶段（「设置独立的结果沟通时间」联动） |
| `POST /perf/api/user/self_define_mappings` | POST | `{semesterId, type:"department"/"employee"}` | 自定义字段映射（规则条件「职位」等自定义维度值源） |
| `/perf/api/review/snapshot/department/tree?semesterId=...` | GET | semesterId | **部门树数据**（规则条件「部门」的值选择器数据源） |

### 2.2 核心操作接口（bundle chunk 7255/2974/6176 检索确认 + 实测）

| 接口 | 方法 | 参数 | 用途 |
| --- | --- | --- | --- |
| `POST /review/follow/group/add` | POST | 见 §2.3 | **新建人员组**（实测） |
| `POST /review/follow/group/edit` | POST | 同 add 结构 | **编辑人员组** |
| `GET /review/follow/group/info` | GET | `{semesterId, groupId}` | **编辑详情**（实测返回结构见 §2.4） |
| `POST /review/follow/group/list` | POST | `{semester_id, tab, current, size}` | 列表（已实现） |
| `POST /review/follow/group/del` | POST | `{semesterId, groupId}` | 删除 |
| `POST /review/follow/group/emp_list` | POST | — | 组内人员列表 |
| `GET /review/follow/group/priority/check` | GET | `{semester_id}` | 新建按钮优先级/占用校验（已实现） |
| `POST /review/user_group/resolve-scope/v2?task_id=-1` | POST | 见 §2.5 | **规则统计（新建任务）**（实测） |
| `POST /review/user_group/resolve-scope/v2?task_id=<id>` | POST | 同 body | **规则统计（轮询结果）**（实测） |
| `POST /review/user_group/user_list/edit_by_rule` | POST | — | 按规则维护人员名单（「手动维护」模式的名单编辑） |
| `POST /perf/api/user/query` | POST | `{keyword, excludeDismissed}` | **关注人搜索**（实测） |

### 2.3 新建 payload（实测，route 拦截）

```
POST /perf/api/review/follow/group/add
{
  "semesterId": "7704220198642961662",
  "tenantId": "6732051441411884552",
  "name": "REA测试组Y",
  "enName": "",
  "description": {"zh-CN": "", "en-US": ""},
  "followeeUserIds": [],
  "viewPermission": 1,
  "scope_setting_mode": 0,
  "show_group_tag": 0,
  "isCommunicateTime": 0,
  "startTime": 0,
  "endTime": 0,
  "scope": [[{
    "key": "department", "condition": "eq",
    "value": ["6732646893589120515"], "id": "3",
    "fe_extra": "", "__id__": "condition_<uuid>"
  }]]
}
```

字段语义（与 UI 对应）：
- `name` / `enName`：多语言输入（中文 / 英文）
- `description`：多语言（zh-CN / en-US）
- `followeeUserIds`：关注人（搜索选择的多选用户 id）
- `viewPermission`：人员组可见范围 radio（1=有组内人员绩效查看权限的用户，2=仅关注人可见？——对应「该人员组对谁可见」）
- `scope_setting_mode`：设置方式 radio（0=按规则维护，1=手动维护，2=仅API 写入）
- `show_group_tag`：展示人员组标签开关
- `isCommunicateTime` / `startTime` / `endTime`：设置独立的结果沟通时间（1=开，0=关）
- `scope`：规则条件（按规则模式）

### 2.4 编辑详情 group/info 响应（实测，groupId 不存在时返回空结构）

```
GET /perf/api/review/follow/group/info?semesterId=X&groupId=Y
{code:0, data:{
  groupId:"", semesterId:"", group_type:0, activity_ids:null,
  name:"", enName:"", followeeUserIds:null,
  isCommunicateTime:0, startTime:0, endTime:0,
  scope:null, viewPermission:0, manuallyOpen:false,
  specifiedPersonnel:null, scope_setting_mode:0,
  roles_of_managing_scope:null, scope_visible_mode:0,
  group_key:"", show_group_tag:0, color:"", tag_color:"", text_color:"", bg_color:"",
  seq:0, tenantId:"", status:0, remark:"", createUserId:"", modifyUserId:"",
  createTime:0, modifyTime:0, count:0, disable_count:false,
  scope_permission_tips:{mode:0}, activities:null, ref_by:null
}}
```

编辑模式需要回填：name/enName/description/followeeUserIds/viewPermission/scope_setting_mode/show_group_tag/isCommunicateTime/startTime/endTime/scope。**注意 `roles_of_managing_scope`**（手动维护模式的「前台可管理人员范围的角色」）。

### 2.5 规则统计（resolve-scope/v2 异步任务，实测）

```
POST /perf/api/review/user_group/resolve-scope/v2?task_id=-1
body: {"semesterId":"...","user_group_id":"","scopes":[[{key,condition,value:[...],id,__id__}]]}
→ {code:0, data:{task_id:"v2_<uuid>", status:1}}   // 新建任务

POST .../resolve-scope/v2?task_id=v2_<uuid>         // 轮询（同 body）
→ {code:0, data:{
    followed_users:null, forbid_in_users:null, forbid_out_users:null,
    scopes:[{conflicted:null, no_task_list:null,
             scope_permission_tips:{mode:0},
             selected:["<userId>", ...]}]
  }}
```

**「符合条件的人员，共计 N 人」= `scopes[0].selected.length`**（实测选「技术中台」→ 129 人）。前端在条件变更后触发新建任务并轮询直至 status 完成，刷新计数。

### 2.6 关注人搜索（实测）

```
POST /perf/api/user/query
body: {"keyword":"张","excludeDismissed":false}
→ {code:0, data:[{userId, email, i18nName:{zh-CN:"...<Highlight>张</Highlight>..."}, lang, timezone, avatar, avatar72, avatar240, ...}]}
```

**关注人选择器是搜索型下拉**：输入关键词触发 `/user/query`，下拉展示「邮箱 + 姓名 + 部门」，搜索词 `<Highlight>` 高亮（前端 `ud__select__list__item__content-highlight`）。

## 3. 组件规格（像素级，实测计算样式）

### 3.1 全屏页 head（ModalHeader）— 与列表弹窗 head 完全同构

| 属性 | 值 |
| --- | --- |
| 高度 | 56px |
| 背景 | #FFFFFF |
| 下边框 | 0.67px solid rgba(187,191,196,0.5) |
| 内边距 | 0px 20px |
| 布局 | flex，align-items center，justify-content space-between |

左区（HeaderItem.left，20,14，1220×28）：

| 子元素 | 规格 |
| --- | --- |
| GoBack「返回」 | 20,14，68×28，flex，padding 4/2，圆角 6px，图标 `icon-back-arrow` 20×20（svg.use），文字 16px/600 #1F2329 |
| VerticalLine | 100,20，1×16，rgba(31,35,41,0.15) |
| ModalTitle「新建人员组」 | 117,16，80×24，16px/600 #1F2329（TextWrap 内层 92×24） |

**与已实现 `UiPageHeader.vue`（被 `UiFullScreenModal.vue` 包裹）完全同构**，逐项与 token 对齐（`--layout-topbar-height:56px`、`--performance-header-back-width:68px`、`--performance-header-divider-height:16px` 等）→ **直接复用，无需新建**。

### 3.2 多语言输入框（people_multilingual_input）

人员组名称 / 人员组说明 均用**多语言输入组件**：

```
people_multilingual_input-multilingual-input__container（760 宽）
└── __wrap → __inner
    └── ud__row.ud__form__item（31px 高）
        └── ud__input.ud__input--size-md（31px 高，760 宽）
            ├── input.ud__native-input（22px 高，占位）
            └── suffix 区 → ud__tag.people_multilingual_input-lang-tag（36×20，ud__tag-sm ud__tag-rect ud__tag-neutral，「中文」）
```
- 下方「添加英文」按钮：`ud__button--text ud__button--text-primary ud__button--size-md`（82×22，14px #1456F0，带 + 图标 14×14）
- 点击「添加英文」后追加一个英文输入行（lang-tag 变「英文」）
- **切换语言 tag 可切换输入语言**

### 3.3 关注人选择器（employee-select-internal）

```
ud__select.employee-select-internal.custom-emp-select.emp-select1（760×32，可含 border-red 类）
└── ud__select__selector.ud__select__selector-md（760×32，multiple）
    ├── content（「请选择」占位 / 已选值「张」）
    ├── search input（可输入，触发 /user/query）
    └── arrow（12×12）
```
下拉（搜索型，760×245）：
- 选项：`ud__select__list__item`（753×52）+ `employee-select-internal-option`
- 选项内容：邮箱 + 姓名 + 部门（两行），搜索词 `ud__select__list__item__content-highlight` 高亮
- 选择后 tag 展示（多选）

### 3.4 该人员组对谁可见（radio-group + 开关）

**Radio**（`ud__radio-group--mode-solid ud__radio-group--direction-horizontal`，760 宽）：
- 选项1「有组内人员绩效查看权限的用户」（16×16 radio，选中 wallpaper #1456F0 + white ink 6px）
- 选项2「仅关注人可见」

**展示该人员组标签**（开关行，`flex items-center h-11` 22px 高）：
- 标题 14px #1F2329 + `ud__switch ud__switch-sm`（28×16，圆角 999999px，关态 bg #D0D3D6，开态 #1456F0）
- 说明文字：「开启后，可见人员组的用户可在人员组成员的「绩效详情页」和「成员列表」查看人员组标签。」

### 3.5 人员范围设置方式（radio-group vertical）

**Radio**（`ud__radio-group--mode-solid ud__radio-group--direction-vertical`，760×148，**每项高 44px**）：

| 选项 | 文案 | 值对应 |
| --- | --- | --- |
| ① 按规则维护人员范围 | 配置圈人规则，系统根据规则动态更新人员范围 | scope_setting_mode=0 |
| ② 手动维护人员范围 | 人员组创建后，在后续页面手动维护人员范围，人员范围不支持动态更新 | scope_setting_mode=1 |
| ③ 仅API 写入 | 其他系统通过 API 自动写入人员名单，人员组创建成功后，可获取人员组的 id 和 API 文档，请将其提供给开发人员。 | scope_setting_mode=2 |

**模式联动**：
- ① 按规则 → 显示「人员范围设置」规则编辑区（§3.6）
- ② 手动维护 → 额外显示「**前台可管理人员范围的角色**」多选（实线上级 / HRBP / 项目管理员）→ 对应 payload `roles_of_managing_scope`
- ③ 仅API → 隐藏规则编辑区，显示「**API 文档**」链接（`text-B-500`，href=`get_import_api_link` 返回值）

### 3.6 人员范围设置（规则编辑区）— 核心差异点

`ud__form__item mb-0`（必填 `*`，不填校验「此项为必填」）：

```
label「人员范围设置 *」
control（760×214）
├── 说明：「编辑人员范围规则，系统将根据规则动态更新人员范围」
├── 统计：「符合条件的人员，共计 N 人」（实测 129）
├── 条件组标题：「条件组 1」+「同时满足以下条件：N 人」（flex justify-between，22px）
└── 条件行 people-material-rule-condition-condition-item（200×54）
    ├── 维度 select（ud__select w-full 200×32）：「部门」→ 级联 ud__cascader
    ├── 操作符 select（88×32）：「包含」（eq）/「不包含」（neq）
    ├── 值 select（department-tree-select 372×32）：部门树 ud__tree
    └── 删除按钮（24×25，popover 确认）
├── 「添加条件」按钮（text-primary 82×22）
├── 「添加人员范围」按钮（text-primary 110×22）→ 新增条件组
```

**维度级联**（`ud__cascader__dropdown filterTypes--select`，200×241）：选项来自 `resolve-scope/meta` 中 `invisible:false` 的维度，实测显示：部门 / 员工 / 上级 / 直属上级 / 序列 / 职级 / 序列职级 / 入职时间 / 人员类型（meta 里 employeeSubtype/jobTitle/position/trackbackStatus invisible=true 不显示）。

**meta 返回**（resolve-scope/meta 响应核心）：
```json
[
 {"key":"department","operators":["eq","neq"],"invisible":false},
 {"key":"employee",...}, {"key":"superior",...}, {"key":"directLeader",...},
 {"key":"category",...}, {"key":"level",...}, {"key":"sequenceLevel",...},
 {"key":"joinDate","operators":["lt","ge","gt","le"],"invisible":false},
 {"key":"employeeType",...}, {"key":"dimissionTime","operators":["lt","ge","gt","le"]},
 {"key":"dimissionStatus",...}, {"key":"importEmployee","operators":[],...},
 {"key":"underlingEmployee",...}, {"key":"role",...},
 {"key":"employeeSubtype","invisible":true}, {"key":"jobTitle","invisible":true},
 {"key":"position","invisible":true},
 {"key":"trackbackStatus","invisible":true,"name":{"zh-CN":"本周期是否回溯","en-US":"Retrospective Performance Review"}}
]
```

**部门树值选择**：`ud__tree`（371 宽），节点 = `ud__tree__node`（30px 高）+ `ud__expandButton`（16×16）+ `ud__tree__node__label`（14px）。实测部门：技术中台 / AI中心 / 产品运营中心 / 产品组 / 设计组 / 数据中心 / 开发组 / 应用组 / 研发中心。数据源 `snapshot/department/tree`。

### 3.7 其他设置（结果沟通时间）

`ud__card--shadow-md mt-8` 卡片：

```
label「其他设置」
开关行「设置独立的结果沟通时间」（flex items-center h-11）
说明：「将结合绩效项目中配置的结果沟通时间，取最晚的开始时间和结束时间。」
副标题：「对本周期所有结果沟通型环节生效」
开启后显示：
  「开始时间」：ud__picker（358×31）
    ├── 日期 picker（placeholder YYYY-MM-DD，272 起 358 宽）
    └── 时间 picker（placeholder HH:MM，642 起 358 宽）
  「截止时间」：同上第二行（y 差 73px）
```

**联动 `communication_stages` 接口**：若周期有结果沟通环节则显示此卡片。

### 3.8 底部操作区（sticky bottom）

```
div.mt-8.py-8.sticky.bottom-0.bg-white.w-full（0,609，1272×65，白底）
└── div.w-400.mx-auto（236,625，800×32）
    ├── button「确定」ud__button--filled（80×32，bg #1456F0 文字 #FFFFFF 圆角 6px 边框 0.67px #1456F0）
    └── button「取消」ud__button--outlined.ml-6（80×32，bg #FFFFFF 文字 #1F2329 圆角 6px 边框 0.67px #D0D3D6）
```

## 4. 组件复用评估（对照现有代码）

### 全局已复用（本页与已实现组件同构，直接复用）

| 飞书原版 | 现有组件 | 结论 |
| --- | --- | --- |
| 全屏页 head（返回+分隔线+标题） | **`UiPageHeader.vue`**（被 `UiFullScreenModal.vue` 包裹） | **已复用**（16 处全屏页共用，本页逐项同构） |
| 底部 sticky 操作区 + 确定/取消按钮 | 表单底部栏模式 | 各全屏页已复用，按钮 80×32 filled/outlined 与列表页一致 |
| Radio 组 | 项目 radio tokens | 横向 solid / 纵向 solid 已有对应 |
| Switch 28×16 sm | `PerformanceSwitch` 或 ud 等价 | 28×16 与「展示人员组标签」同规格 |
| 多语言输入 | 多语言输入组件（名称/说明字段） | 已用于评估题/规则新建等 |
| 部门树 / 级联 | 树选择器组件 | 需核对尺寸 |

### 需要增强/新建（真正的差异点）

| 飞书原版 | 现有组件 | 差异 |
| --- | --- | --- |
| **关注人搜索选择器**（`employee-select-internal`，/user/query 搜索 + 高亮 + 多选 tag） | **`PerformancePersonSelect`**（封装 `PerformanceSearchSelect`） | **已覆盖**：远程搜索（remote-search 默认开，`@search` 触发 /user/query）、选项两行展示（avatar 32 + name + subLabel 52px）、`optionClass` 关键词高亮、多选 tag。直接用 `PerformancePersonSelect`，只需按采集规格传 `options`（email/name/部门 subLabel） |
| **规则编辑区**（维度级联 + 操作符 + 值树/多选 + 条件组/添加条件/添加人员范围 + 统计人数轮询） | **`PerformanceAudienceRuleEditor`**（被评估人模块，项目流程设置） | **已覆盖核心**：条件组 + 维度选择（`PerformanceSearchSelect` 级联）+ 操作符 + 值选择（部门树 `PerformanceOrganizationSelect` / 人员多选 / 日期）+ 添加条件 + 删除；多组通过 `allowMultipleConditions`/`minGroups` 控制。**差异点**：① 本页维度来自 `resolve-scope/meta`（visible 动态），现有 `PERFORMANCE_CONDITION_FIELDS` 需扩展映射；② 本页「添加人员范围」按钮=新增条件组，现有组件靠 `minGroups`/`groupTitlePattern` 支持 |
| **人员范围统计**（符合条件 N 人，异步任务轮询） | **`PerformanceProjectSettingsPage` 的 `loadAudiencePreview`**（`audience-summary`：「符合条件的员工，共计 N 人」+ 每条件组「同时满足以下条件：N 人」+ 200ms 防抖重算） | **已覆盖交互形态**：总人数 + 分组人数 + 防抖联动。**差异点**：现有走后端 `evaluator_preview` 同步接口；飞书走 `resolve-scope/v2` **异步任务轮询**（task_id=-1 建任务 → 轮询 task_id）。统计机制需按飞书异步任务改造，UI 复用现有 audience-summary |
| **三种模式联动**（按规则/手动/仅API） | — | **需新建**（本页特有）：radio 切换显隐规则区 / 角色多选 / API链接 |
| 手动维护 → 「前台可管理人员范围的角色」多选 | 项目内角色多选组件 | **需适配**：对应 roles_of_managing_scope |
| 仅API → API 文档链接 | — | **需新建**：get_import_api_link 返回链接展示 |
| **结果沟通时间**（日期+时间 picker 组合） | `PerformanceDateTimeField`（date-only）已有 | **需适配**：组合日期+时间 picker（开始/截止两行） |

## 5. 待确认事项（实施时）

1. **保存/编辑 payload**：`add` 已实测；`edit` 结构同 add（含 groupId），需在编辑页实测确认 groupId 字段位置。
2. **`viewPermission` 枚举**：实测默认 1；「仅关注人可见」对应值待编辑页或联调确认（推测 2）。
3. **`scope_setting_mode` 枚举**：0/1/2 已按 radio 顺序推断，需实测「仅API」模式下保存 payload（关注其是否带 scope 空数组）。
4. **「手动维护」的名单编辑**：`user_list/edit_by_rule` 接口的 payload 待补采（创建后后续页面手动维护）。
5. **关注人搜索结果**：下拉选项「邮箱+姓名+部门」——部门字段来自 /user/query 响应的哪个字段，需实测确认（当前响应含 userId/email/i18nName，部门可能在扩展字段）。
6. **规则值选择器类型**：department→树，employee→人员多选，joinDate→日期选择，level/sequenceLevel→枚举，均按 meta 维度动态切换，实现时需一一对应。

## 6. 素材索引

- 截图（`rea-extract/out/focus-create/`）：`create-full-height.png`（干净完整页）、`create-followee-search.png`（关注人搜索下拉）、`create-api-mode.png`（仅API模式）、`create-validation.png`（表单校验）、`condition-select-open.png`（维度级联下拉）
- DOM：`components.json` / `components-utf8.json`（关键组件树）、`head.json`、`texts.json`（全页文本）
- 接口实测：§2.3 add payload、§2.4 info 响应、§2.5 resolve-scope/v2 响应、§2.6 user/query 响应
- bundle 源码检索：chunk `7255.02afdc6e.js` / `2974.99429c25.js` / `6176.cb84a04b.js`（API 定义）
