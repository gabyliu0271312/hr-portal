# REA 绩效校准：多项目、多阶段、多规则首页与全屏工作区评估

- 日期：2026-11-22。
- 状态：评估整理完成；不是已确认的开发规格、UI 蓝图或开发验收记录。
- 业务入口：绩效评估 → 我团队的绩效 → 绩效校准。
- 范围：首页、四种状态筛选、校准范围 hover、范围全屏工作区及成员列表接口、组件和设计 token 复用。
- 用户配置：同周期两个项目；“测试多项目”有两个校准阶段，其中一个阶段有两条校准规则。
- 方法：REA 浏览器目标发现、被动 DOM／可访问性／网络观察；同一浏览器本地 CDP 补充完整 HTML、computed style、悬停、tab 切换及响应体。结构结论来自 DOM 和接口，截图不作为结构推断依据。
- 本轮交付仅此评估文档；未修改业务代码、未新建采集脚本、未执行完成校准、保存评级、授权等业务写入，未部署。

## 1. 结论与适用边界

1. 飞书首页采用“状态筛选 + 按项目分组的校准任务表”。本次没有观察到项目卡片或校准阶段 tab；阶段与规则通过独立任务行表达，不能凭配置层级自行增加首页阶段 tab。
2. 点击范围进入具有独立路由的全屏校准工作区，包含跨项目任务侧栏、当前任务标题、完成校准、分布提示、成员列表／矩阵分析／统计报表。它超出只读人员清单弹窗的能力边界。
3. 本地底层已有项目、节点、阶段和规则来源隔离，主要缺口是当前校准人的多项目聚合读模型、规则范围查询和前端组装；当前证据不支持先新增另一套校准任务数据库模型。
4. 表格、成员工具栏、列偏好、人员身份、评级、评估率、规则条件展示、浮层及容器应复用现有实现。新增业务层只承担任务分组、范围身份、场景状态与数据适配。
5. 用户明确要求空态图标复用其他环节待完成状态已有能力。开发准备阶段已定位同款 `hr-portal/frontend/public/performance-no-submit.svg`，并核对SVG路径与实采图形一致；`PerformanceReviewContent.vue:86` 正在复用。直接引用该资源，不在业务页面重复内嵌。
6. 首页与全屏范围 hover 共用规则内容，全屏额外显示冻结范围说明；首页浮层宽度随内容自适应，420px 是最大宽度。
7. 用户已于2026-11-22明确：多项目、多校准任务时，完成校准的粒度是当前选中的校准任务。本地成员接口需补合法任务范围过滤，完成接口需从现有项目／节点／阶段责任粒度扩展到任务级。一次真实点击已确认预检携带单个 adjust_task_id；本次因强制分布不符合被阻断，未执行完成写入。

### 1.1 本轮已回答与尚未回答

| 问题 | 状态 | 依据或边界 |
|---|---|---|
| 首页如何表达两个项目、两个阶段、同阶段多规则 | 已回答 | 分组任务 DOM、分组／扁平任务接口 |
| 全部／待校准／已校准／已逾期的显示 | 已回答 | 实际切换后的 DOM、计数及空态 |
| 首页三个范围的 hover | 已回答 | 人员条件与项目全员标签，完整 HTML／样式 |
| 全屏标题及侧栏范围 hover | 已回答 | 标题人员、侧栏人员、项目全员及冻结说明 |
| 全屏成员列表结构和主查询契约 | 已回答 | DOM／样式、实际点击和 HTTP 200 完整请求响应 |
| 四状态筛选是本地过滤还是重新请求 | 未定论 | DOM 已完整；监听未完整收尾，不能以未见请求认定无请求 |
| 已校准有非零任务时的行态 | 未覆盖 | 当前样本已校准数为 0，仅验证空态 |
| 全屏全部被校准人的聚合行为 | 未覆盖 | 仅观察到入口，未执行其人员聚合查询 |
| 完成校准粒度与预检 | 已确认 | 用户明确按任务；一次点击捕获单任务预检与强制分布阻断弹窗 |
| 完成校准成功写入／锁定结果 | 未实测 | 本次被强制分布阻断，未确认提交或调整评级 |
| 矩阵、统计报表全部子交互 | 未完整覆盖 | 观察到结构，不构成本次完整还原／验收 |
| 加载失败、禁止访问、长规则、多条授权链等状态 | 未实测 | 后续蓝图及开发契约需补，不应杜撰飞书表现 |

## 2. 目标与证据索引

### 2.1 目标路由

- 首页：`https://idreamsky.feishu.cn/perf/review/7707127396310305784/7706453791633309700/adjust`。
- 全屏：同一基础路径下 `/adjust/{members|matrix|report}`。
- 本次全屏成员路由 query：`item=7709863256629710019&task=7710645549233343723&stageIds=7706453791633309700&type=task`。
- `item` 对应项目，`task` 对应当前校准任务；URL 中 `stageIds` 是导航评估节点，不能直接等同任务响应里的具体 `stage_id`。本地 node／phase 映射应以本地契约为准。

### 2.2 REA Evidence

| Evidence ID | 内容 | 位置／限制 |
|---|---|---|
| `ev_43c487984a986ef740d9ff1ca58b0cfdbf44b1e8c178af419eafd3858047ee04` | 初始首页，3117 DOM 节点、412 可访问性节点 | `mcp-rea-inspect_web_page-1795316645837-ftv7cu.txt` |
| `ev_1a86cd0425dd92e5c3b9e6edbd903b32e2840cc44de462a37672573efdb2801c` | 首页加载时任务接口 | `mcp-rea-capture_browser_scenario-1795317239740-7r5ap8.txt`；点击动作超时，不是成功打开弹窗的证据 |
| `ev_fe46be8cd0573560e5af7fa26ea860bcbfe85e62c8a23beb5bbd22bd580d8552` | 全屏 report 初始结构 | `mcp-rea-inspect_web_page-1795317648929-uu6plu.txt` |
| `ev_e22171ed6d92cc9a3ea810e14865d95ff6af17ff86cbc1561bbea65dfa398bdd` | 用户展开的首页人员范围 hover | `mcp-rea-inspect_web_page-1795317849715-pq0lmm.txt` |
| `ev_674f349f745c1c555a5602e67023dc4c9f4e0e6aa174b81d4c4bd648f7e0c7c2` | 已校准空态，3093 DOM 节点 | `mcp-rea-inspect_web_page-1795318066017-ol8ihb.txt` |
| `ev_35d61289bee5c60bdc6d5812facb8c89e7b8c7e925eca243f150710bc39f5827` | 全屏 members，3267 DOM 节点、453 可访问性节点 | `mcp-rea-inspect_web_page-1795318501089-akbvqq.txt` |
| `ev_e61582ff5f209e2b37002b6f2bc9575afee8f8869ac594e3823886c2ada4710f` | 首页项目全员 hover，3258 DOM 节点 | `mcp-rea-inspect_web_page-1795318757743-qs2iyu.txt` |

以上文件位于本机会话工具结果目录：
`C:/Users/gaby.liu/.claude/projects/d--AI---HR------/cf256794-2026-43a5-a7ce-2f5bacaa8ad3/tool-results/`。

本地 CDP 补充结果不是 REA Evidence，不混用编号：

- `b7uxm9c2q.txt`：首页 cynthia 浮层完整 HTML、样式；`bdnuxxdrc.txt`：空态 HTML、内嵌 SVG、尺寸；`buj53qfzt.txt`：全屏成员表及工具栏 HTML、样式。
- 首页四状态完整切换、alice hover、全屏三个触发点 hover、最终首页项目全员 hover、最终 members 点击及接口响应保留于本次会话 Bash 工具输出；未另建独立归档文件。下文保存了开发判断需要的结构、参数和脱敏响应摘录，不将其称为已归档的完整原始抓包。
- 被动采集不恢复附加前网络请求。REA 对第三方资源有来源过滤；完整属性及尺寸由定向本地 CDP 补足。
- 大结果通过文件解析并提取目标字段。本轮未逐项人工审阅全部非业务 DOM、脚本和无关网络事件；核心浮层 HTML、任务接口与最终成员主查询已完整读取。本文不声称全站采集完整。

## 3. 首页 DOM 与状态筛选

```text
绩效外壳／顶部导航
├─ 周期及评估分类侧栏 → 我团队的绩效 → 绩效校准
└─ 绩效校准内容
   ├─ 标题、截止时间、待校准人数
   ├─ 全部(4)／待校准(2)／已校准(0)／已逾期(2)
   └─ 四列表格
      ├─ 校准范围／评估状态／开始时间／截止时间
      ├─ 项目分组行：测试多项目
      │  ├─ 1 项目全员
      │  ├─ 2 指定人员范围
      │  └─ 3 另一指定人员范围
      └─ 项目分组行：测试绩效档位差异
         └─ 4 项目全员
```

| 筛选 | 任务 | 项目分组 | 其他行为 |
|---|---|---|---|
| 全部(4) | 1、2、3、4 | 两个项目 | 四列、项目展开控件 |
| 待校准(2) | 1、4 | 两个项目 | 原任务编号不重排 |
| 已校准(0) | 无 | 无 | 保留表头，表体空态 |
| 已逾期(2) | 2、3 | 仅测试多项目 | 无命中任务的项目隐藏 |

- 实际切换不改变首页 URL；选中 tab 有 `active` 类、蓝色文字。
- 本次首页状态 tab 字体 14px、行高 22px，不应将通用 16px 工作区 tab 尺寸直接套用。
- 表格分组 DOM 是 `TR` 项目行 + 任务子行；范围为 span 悬停触发，状态为圆点 + 文案。
- 项目行有展开按钮；折叠后的保持策略未专门实测。
- 首页“待校准：3 人”与“待校准(2)”并存：后者对应两条任务，不能用同一计数替换。跨范围去重人数口径仍需本地明确。
- 飞书 DOM 中部分项目行与子行复用 `data-row-key`，不得照搬该值作为本地 Vue 唯一 key；本地应使用稳定任务／范围身份。

### 3.1 任务与阶段样本

| 展示编号 | 项目 | task_id | 具体 stage_id | adjust_rule_id | 状态 | reviewee_count |
|---|---|---|---|---|---|---:|
| 1 | 测试多项目 | 7710820663262481590 | 7710820640462212300 | 7710820640474795262 | 待校准 | 2 |
| 2 | 测试多项目 | 7710645549245926655 | 7709863799016164588 | 7710645525531347970 | 已逾期 | 1 |
| 3 | 测试多项目 | 7710645549233343723 | 7709863799016164588 | 7710645525476805643 | 已逾期 | 1 |
| 4 | 测试绩效档位差异 | 7709809434465160374 | 7709005737527119147 | 7709809408418581435 | 待校准 | 1 |

项目一实际由两个阶段、三条规则任务组成，其中任务 2、3 属于同一阶段。以上编号用于解释本次样本，不是开发常量。

## 4. 范围 hover

### 4.1 首页

```text
浮层标题：具体校准范围
├─ 项目全员：矩形中性标签“项目全员”
└─ 指定人员：字段标签“人员” → 操作符“包含” → 人员圆角标签（20px头像＋姓名）
```

- 项目全员有效实采约 117.33 × 83.33px；cynthia 约 253.43 × 86.67px；alice 约 247.21 × 86.67px。
- 上述是当前字体、视口、DPR 下的结果，宽高由内容决定，不能固化姓名或坐标。
- 首页三个样本均无冻结范围备注。
- 人员标签数据来自周期人员快照；悬停观察到 `POST /perf/api/review/snapshot/emp`，参数形如 `{semesterId,userIds:[...]}`。不以本次未出现查询证明其他分支没有查询。

### 4.2 全屏标题及任务侧栏

已实测主体 alice 标题、侧栏 cynthia 和侧栏项目全员，结构复用首页规则内容，额外显示：

> 备注：以校准任务开始时刻圈定的校准范围为准，后续部门、汇报关系、项目范围的更新不会影响已圈定的校准范围。

- 备注使本次浮层达到 420px 最大宽度；人员范围约高 138.67px，项目全员约高 135.33px。
- 标题触发点下方展开，侧栏样本上方展开；靠左时浮层到视口 16px。方向与偏移交给公共定位组件，不写死 top／left。
- DOM 包含 Portal、focus guard、`section[role=dialog]`、内部 `role=tooltip`、内容滚动区和箭头。本地应沿用现有可访问性规范，不照抄第三方类名／嵌套角色。

### 4.3 本地复用差异

`PerformanceCalibrationRuleSummary.vue` 已有解析器、条件组、字段／人员标签、超长处理、hover 保持、焦点及 Escape；但当前可见触发内容是条件摘要，浮层没有本次标题和冻结说明，且仅 `summary.kind === 'conditions'` 时打开。

建议抽取／复用条件内容，扩展范围文字触发、项目全员内容、标题和可选说明；沿用 `PerformancePopover`，避免在业务层另造浮层定位和关闭逻辑。

## 5. 全屏校准工作区与成员列表

```text
全屏页头：返回／完成团队的绩效校准
├─ 左侧：全部被校准人、周期、项目分组、任务编号／范围／状态／截止时间
└─ 主内容
   ├─ 当前任务标题“校准 N：范围”、完成校准
   ├─ 强制／建议分布提示（展开／收起）
   ├─ 成员列表／矩阵分析／统计报表
   └─ 成员列表
      ├─ 搜索成员、筛选
      ├─ 结果数、隐藏列入口
      ├─ 动态列与左固定姓名列
      └─ 分页
```

- `members`／`matrix`／`report` 反映在路由中，保留项目、task、stageIds 等上下文。
- 本次 members 可见列为姓名、绩效评级、360°评估率、直属上级、序列、职级、入职日期、所属部门，另有“5 列被隐藏”。这是用户列偏好，不是固定业务列集。
- 本次列宽依次为 224／144／144／144／104／124／134／224px；表格内容宽 1242px，超出可视区有水平滚动。该样本用于检查公共列宽策略，不固定业务页宽度。
- 正文字体 14px、行高约 22px，单元格 padding 12px；表头高约 46.67px，正文行 52px；姓名 sticky left=0。应通过公共表格策略和 token 调整，不逐列另写 sticky。
- 工作区不应直接使用 `FocusGroupPeopleDialog` 作为完整实现：该组件适于人员范围清单，而这里还有任务侧栏、分布、完成动作、评级编辑及分析入口。
- 现有 `ProjectMemberListPanel` 有 provider、reviewContext、分页排序、字段 schema、列偏好和人员详情链路，是成员区首选复用点；其卡片外观与全屏背景／吸附需要场景适配，不能原样搬入后声明像素对齐。

## 6. 接口实采与本地差异

### 6.1 首页任务接口

两个接口均实采 HTTP 200、完整请求响应：

- `POST /perf/api/review/adjust/tasks`
- `POST /perf/api/review/adjust/tasks/list`

请求：

```json
{"semester_id":"7707127396310305784","stageIds":["7706453791633309700"]}
```

`tasks` 返回项目分组 `data.tasks[{activity_id,activity_name,items:[]}]`，并返回 `progresses[{adjust_status,count}]`；`tasks/list` 返回扁平任务列表。本次二者排序不同，不能用数组下标关联。

| 字段 | 作用 |
|---|---|
| task_id / activity_id / stage_id | 任务、项目、具体阶段身份 |
| scope_rules.adjust_rule_id | 来源规则 |
| quote_activity_scope / scope_rule_groups | 项目全员或具体条件组 |
| adjuster_rule_groups | 校准人规则 |
| start_time / end_time | 毫秒时间戳，界面 GMT+8 |
| adjust_status / overdue | 状态；本次 0=待校准、2=逾期，计数还含 1=已校准、127=全部 |
| editable / reason_of_can_not_edit | 可编辑性与原因，不能从逾期文案自行推断 |
| inheritable / has_child_node / source | 授权相关能力／来源，完整枚举未在本轮解释 |
| reviewee_count / distribution_rules | 范围人数和分布规则 |
| task_number | 展示编号，筛选后保留 |

样本存在 `overdue=true` 且 `editable=true`，不能把逾期统一写成禁用。首页按任务计数，人员按独立口径计算。

### 6.2 成员主查询：最终补采成功

用户授权点击后，从 matrix 切换 members；请求 ID `28612.703`，HTTP 200，取得完整响应，最终 URL `/adjust/members?...` 与列表一致。

```http
POST /perf/api/report/v3/semesters/7707127396310305784/users/list
```

```json
{
  "offset": 0,
  "limit": 50,
  "filters": [{"key": "adjust_task_ids", "values": ["7710645549233343723"]}],
  "advance_filters": [],
  "headerId": "header_adjust_review_list",
  "stageIds": ["7706453791633309700"],
  "orders": [{"key": "user", "order": "ASC"}]
}
```

脱敏结构摘录（省略真实姓名、内部人员 ID 和无关人员字段；不是原始完整响应）：

```json
{
  "code": 0,
  "success": true,
  "data": {
    "mock": false,
    "users": [{
      "activity": {"id": "7709863256629710019", "name": "测试多项目"},
      "userId": "<人员ID>",
      "user": {"id": "<人员ID>", "name": "<姓名>"},
      "rootReviewId": "<评估实例ID>",
      "stageIds": ["7706453791633309700"],
      "directDepartment": {"id": "<部门ID>", "name": "<部门名>"},
      "directLeader": {"id": "<上级ID>", "name": "<上级姓名>"},
      "level": {"id": "<职级ID>", "name": "<职级>"},
      "joinDate": 1554220800000,
      "finalReviewScoreGroup$7655170451575966923": {"option_id": "7111633368893440001", "score": null},
      "semesterStageInviteReviewDonePercentageGroupKey:7706453791633309698:": {"numerator": 0, "denominator": 0}
    }],
    "user_count": 1,
    "review_user_count": 1,
    "selectable_user_count": 1,
    "search_after": "",
    "pre_search_after": "",
    "unfinishedWithEndList": null
  }
}
```

直接结论：人员查询以 `adjust_task_ids` 限定任务范围；`headerId` 管理列表元数据上下文，评级和评估率是动态键，不能按第一道题／固定等级硬编码。

### 6.3 成员查询的配套请求

| 接口 | 实采参数要点 | 结果 |
|---|---|---|
| `POST /perf/api/report/v3/filter_criteria/{semester}/query` | headerId、stageIds、同一 adjust_task_ids filter | 200，`criterias:null` |
| `POST /perf/api/review/authorization/tag` | reviewee_user_ids、semester_id、stage_ids、stage_type=`adjust_review`、roleId | 200，`items:null` |
| `POST /perf/api/review/tags` | semester_id、types=`user_group,ol`、user_ids、header_id、stageIds | 200，`user_to_tags:{}` |
| `GET /perf/api/report/v3/statistics/intervals` | 无请求体 | 200，空数组 |

本次没有拿到成员字段 meta 请求，不将历史报告的 meta 契约冒充本轮实采。其他 license／mark／draft 等无关请求不纳入开发需求。

### 6.4 本地接口与数据边界

| 本地代码 | 已有能力 | 差异／约束 |
|---|---|---|
| `frontend/src/api/performance.ts:1790`、`backend/app/performance/projects_router.py:8034` | taskPeople：项目、节点、可选 phase、身份过滤、字段可见性、分页排序 | 当前无 rule／范围行筛选；必须服务端先限定合法范围，再统计、排序、分页 |
| `backend/app/performance/calibration_service.py:429` 附近 | 冻结 rule_sources、assignments、source_rule_ids | 同阶段同处理人同成员可合并物理任务，保留多个规则来源；展示行和物理任务不同 |
| `backend/app/performance/projects_router.py:6851` | 现有按阶段／处理人／规则分组 | 可复用逻辑，但需普通校准人读模型和授权裁剪 |
| 同文件 `:6836` | 管理授权的最早启动项目筛选 | 不得复制到多项目普通校准首页 |
| 同文件 `:5115` 附近 | 项目配置校准详情接口 | 项目管理权限；不能开放全量响应后交给前端过滤 |
| `backend/app/performance/calibration_completion_service.py:111` | 按项目／节点／阶段计算完成责任 | 不能直接改按钮文案就声称完成某一规则 |

建议范围身份至少包含 `project_id + node_id + phase_id + handler/source_rule`，授权范围还需区分授权来源。优先由服务端给稳定范围 key；前端不能自行拼接任意任务集合当授权凭证。

同人命中多规则时，规则行可重复投影同一物理任务；人员列表在选定范围内去重，跨规则计数不能简单求和。历史缺失规则来源时应明确降级提示，不按实时组织重新推导。

### 6.5 完成校准：单任务预检与分布阻断补采

用户明确业务规则：**多项目、多校准任务时，按当前选中的校准任务完成；不得一次完成同项目、同阶段的其他任务。** 这里的任务是首页／全屏侧栏的一条范围任务；本地每成员一条的物理任务需要由服务端映射到该业务任务，不能简单用一个成员物理任务代替。

2026-11-22，用户授权必要时点击一次完成校准。点击前选中的是任务2，URL中 `task=7710645549245926655`，标题“校准2：cynthia.lin林少娜”。仅点击一次主区“完成校准”，未继续操作弹窗。

```http
GET /perf/api/review/adjust/tasks/final_review/not_finished?semester_id=7707127396310305784&adjust_task_id=7710645549245926655
```

请求ID `28612.896`，HTTP 200，完整响应：

```json
{"code":0,"data":{"count":0,"users":null,"count_will_view_result_users":0,"will_view_result_users":[]},"msg":"操作成功","success":true}
```

随后实际DOM出现 `role=dialog`、`aria-modal=true` 的600px弹窗：

- WarningFilled图标，标题“不符合强制分布规则，请调整后重新提交”。
- 内容复用分布规则展示：不符合强制分布；绩效评级：校准范围内全部人员需满足；4星+5星≤25%，最多需0人，当前1人，需减少1人。
- 可见主按钮仅“继续校准”；DOM中的“取消”按钮为 `display:none`，不算可见操作。
- 页面任务状态仍为已逾期，没有完成成功或完成写入证据。弹窗保持打开，未点击继续校准、未修改评级或分布配置。

证据为本次会话本地CDP工具输出，非独立REA Evidence；完整弹窗HTML与请求响应已在该输出读取。此轮只观察到上述预检请求，未捕获成功完成接口；不能从路径命名推断最终提交URL／请求体，也不将分布弹窗认定为服务端最终事务校验的充分证据。

开发要求：完成预检、分布校验、幂等提交、并发版本检查、完成状态及结果锁定均需绑定服务端权威业务任务范围。范围外任务不得被顺带完成；重叠规则共享成员的锁定与授权父子责任仍须核对现行业务规则后明确，不由本次阻断样本推断。阻断弹窗优先复用公共确认壳与分布内容，而非新建弹窗内核。

## 7. 组件复用矩阵

以下路径均相对 `hr-portal/frontend/src/components/`。

| 功能 | 复用点 | 处理方式 |
|---|---|---|
| 应用外壳、周期、身份上下文 | `../../layouts/PerformanceLayout.vue`、项目上下文 store | 直接复用 |
| 评估分类侧栏 | `performance/PerformanceReviewCategorySidebar.vue` | 扩展校准聚合选中态；不按中文标题判断角色 |
| 首页容器 | `ui/UiSurface.vue` | 复用壳，补薄业务组装；不新增项目卡布局 |
| 首页状态切换 | 公共 tabs／`PerformanceLineTabs.vue` 能力 | 核对 compact 样式，复用 14px token；非新增阶段 tab |
| 任务表、分页、排序、固定列 | `performance/PerformanceManagementTable.vue`、`ui/UiTable.vue` | 扩展项目分组行适配；不另写表格引擎 |
| 任务状态 | `performance/PerformanceTaskStatus.vue` | 状态 DTO 适配，复用 6px 圆点及语义 token |
| 范围 hover | `PerformanceCalibrationRuleSummary.vue`、`performanceCalibrationRuleSummary.ts`、`PerformancePopover.vue`、`PerformanceConditionLogicGroup.vue`、`PerformanceSelectTag.vue` | 扩展触发及内容组合，复用解析／定位／标签 |
| 全屏容器 | `PerformanceDialogShell.vue`／`ui/UiDialogShell.vue` 及现有全屏能力 | 选定一种公共壳；路由与 focus／返回行为明确后组装 |
| 全屏任务侧栏 | 现有评估导航能力及公共容器 | 需校准专用任务组装，数据动态化 |
| 成员工作区 | `performance/ProjectMemberListPanel.vue` | 通过合法范围 provider 扩展，保留已有人员详情和评级链路 |
| 搜索、结果数、隐藏列 | `PerformanceListToolbar.vue`、`PerformanceTableSummary.vue`、`ProjectMemberColumnDrawer.vue` | 直接复用，列偏好作用域需明确 |
| 人员、评级、360率 | `PerformanceMemberIdentity.vue`、`PerformanceRatingTag.vue`、`PerformanceEvaluateRatioPopover.vue` | 直接复用，字段与颜色来自 schema |
| 空态 | 公共表格 empty 插槽、`public/performance-no-submit.svg` | 同款已定位，直接复用；不使用另一幅MetricTemplate插图替代 |
| 只读范围人员清单 | `focus-group/FocusGroupPeopleDialog.vue` | 可供清单场景复用，不作为完整校准工作区 |

当前 `ProjectMemberListPanel.vue:460` 的 empty 插槽是文本“暂无成员”；`PerformanceReview360FeedbackPanel.vue:383` 使用插图与文本。不能声称所有现有成员页已有同款空态。

## 8. token 复用与实测差异

唯一源头：`hr-portal/frontend/src/styles/tokens.css`。业务组件消费 token，不在页面重复写测量常量。

| 用途 | 本地 token | 目标实测／处理 |
|---|---|---|
| 页面表面 | `--performance-review-page-bg`、`--performance-review-surface-inset` | 复用对应容器语义，避免混用多套灰底 |
| 全屏页头 | `--ui-dialog-fullscreen-header-height`（56px） | 公共壳复用，完整页头各状态待蓝图核对 |
| 状态 tab | `--ui-tabs-compact-font-size`、`--ui-tabs-compact-line-height` | 首页 14／22；工作区 tab 单独核对 |
| 浮层底色／边框 | `--performance-popover-background`、`--performance-popover-border`、`--performance-popover-border-width` | 白底、#dee0e3；边框实测 0.666667px，本地 1px，需考虑本次 DPR=1.5／浏览器渲染，不全局盲改 |
| 浮层圆角／内距 | `--performance-popover-radius`、`--performance-popover-padding-y/x` | 8／12／16px，与现有值一致 |
| 浮层行高／阴影 | `--performance-popover-line-height`、`--performance-popover-shadow` | 22px，三层阴影一致 |
| 最大宽高 | `--performance-rule-summary-max-width/max-height` | 420／320px；宽度 auto，非固定420 |
| 浮层定位 | `--performance-popover-gap`、`--performance-popover-viewport-margin` | 10px 间距、16px 视口边界，沿用公共算法 |
| 箭头 | `--performance-popover-arrow-width/height` | 16／8px |
| 人员小头像 | `--performance-member-avatar-size-sm` | 20px |
| 状态圆点与颜色 | `--performance-task-status-dot-size`、pending／completed／overdue tokens | 6px；warning／success／danger语义 |
| 表格 | `--ui-table-header-height`、`--ui-table-row-height`、`--ui-table-cell-padding-inline`、text／border tokens | 公共表格适配；实测约46.67／52／12px，不把分数值按坐标硬编码 |
| 空态 | `--ui-table-empty-height`（220px）、spacing／text tokens | 图标120px、图文间距16px；公共变体统一维护，不修改所有空态 |
| 全屏浮层层级 | 现有 drawer／confirm／popover 层级 | 用本地层级系统，不复制飞书 z-index=1030 |

内层 overflow 容器还实测 max-width=668px，外层仍限制420px；不为每层测得值无差别新增 token。

## 9. 空态资源复用结论

- 目标空态 DOM：表体 `tr` → `td[colspan=4]` → 固定可视宽度容器 → empty wrapper → SVG图像＋文案。
- 图像源为内嵌 SVG（原始 viewBox 0 0 120 120），已完整读取；正文“暂无数据”14／22px、#646a73，图文间隔16px。
- 用户说明其他环节待完成状态使用同款，应作为复用约束。
- 当前源码查到 `MetricTemplateEmptyIllustration.vue` 是另一幅250×125插图，不能仅因名字含 Empty 就认作目标资源。
- 开发准备补核已在 `hr-portal/frontend/public/performance-no-submit.svg` 定位同款：120×120，路径起始为M76.543、M99.111等，与本次实采SVG对应。`PerformanceReviewContent.vue:86` 的待完成节点引用该资源。
- 直接复用 `/performance-no-submit.svg`，通过公共empty插槽或共享空态组合统一120px尺寸、16px图文间距。不能在校准页复制SVG，不应替换所有页面现有插图。

## 10. 开发前需要明确的业务与交互契约

以下区分已确认需求和实施前仍需冻结的契约；任务级完成粒度已确认，不再作为业务二选一：

1. **完成校准粒度（已确认）**：按当前选中的校准任务完成；本地现有项目／节点／阶段接口需扩展任务级范围契约，不保留阶段级批量完成来替代用户要求。规则重叠、授权父子、分布校验和终评锁定必须同源；成功完成写入与重叠锁定的细节仍需核对，不能从本次阻断样本推断。
2. **范围标识与服务端权限**：聚合首页、人数、成员分页、分布提示、导出、详情及后续写入须引用同一合法范围。不可由前端过滤全项目数据来实现。
3. **聚合人数**：任务数、每规则命中人数、跨范围去重人数分开定义；不能复用一个count。
4. **工作区上下文**：范围切换、浏览器返回、刷新恢复、身份／周期切换、列偏好作用域需在蓝图明确。“全部被校准人”需要独立确认聚合范围和去重口径。
5. **既有分析能力边界**：本轮不等于授权补齐全部矩阵／统计报表。现有评估内容中仍有占位，不能将目标UI存在当作本地已具备。

## 11. 后续实施建议与验收关注点

本节是建议拆分，未创建原子任务、未分配任务ID、未标记任何实现完成。

1. 基于已确认的任务级完成要求冻结范围、计数、授权与锁定契约，并整理绩效专属UI蓝图：状态筛选、项目分组、范围hover、全屏导航／成员、完成阻断弹窗、加载／空／错误／禁止态及返回行为；按 START_HERE 门禁确认后再编码。
2. 定义当前身份合法校准范围的聚合读契约，复用已有冻结来源与有效任务；补成员范围过滤，保持权限、排序、分页与总数一致。
3. 组装首页，复用公共tab、状态、表格和空态；扩展一个可供首页与全屏共同使用的范围展示组件。
4. 组装全屏任务导航与现有成员工作区，保留动态schema及列偏好；完成动作在业务契约确认后接入。
5. 围绕真实风险验收：两个项目、两个阶段、同阶段重叠规则、已校准空态、逾期可编辑、授权与来源缺失、切换后无串数据／越权。

### 最低验收场景

- Given两个项目及多阶段多规则，When进入首页，Then项目分组与范围行完整，阶段／规则身份不丢失。
- Given切换四状态，Then仅显示命中任务、空项目隐藏、编号稳定、已校准为空时保留表头和统一空态。
- Given同人命中重叠规则，When打开某范围，Then查询、分页人数和分布只属于该合法范围，物理任务不因展示重复而复制。
- Given悬停人员／项目全员，Then共享浮层显示真实冻结规则；全屏加冻结说明；可移入、可键盘访问，边缘不溢出。
- Given刷新／返回／切换身份或周期，Then任务上下文正确，旧请求不会覆盖新范围。
- Given普通校准人访问其他项目或伪造范围标识，Then服务端拒绝，不能获得全量人员或字段。
- Given点击当前任务完成，Then预检、分布校验与提交只处理该业务任务范围，其他项目／阶段／规则任务的完成状态不被顺带修改；强制分布不符合时显示阻断并允许继续校准。成功写入及重叠成员锁定仍需专项验收，本轮未验证此写入。

本轮未运行测试／构建，因为未修改业务代码；以上为后续验收设计，不是通过记录。没有生产发布或生产验收声明。

## 12. 本轮采集异常与最终覆盖

- 初次REA场景按“项目全员”button角色点击超时且网络事件预算耗尽；没有成功弹窗的证据，不能将当时接口归因为点击。
- 曾因采集表达式正则转义出错导致状态定位失败，已修正，不属于产品异常。
- 曾读到未更新的cynthia浮层，不计为项目全员证据；最终用户手动保持项目全员后已有效补齐。
- 若干CDP悬停／连续操作达到期限，按用户要求停止，不无限重试；用户后续明确授权新的定向补采后才继续。
- 两项关键补采成功：首页项目全员完整浮层；matrix→members点击、成员主查询完整请求响应。后续用户明确任务级完成并授权一次点击，新增单任务预检与强制分布阻断证据；最终页面停留任务2的阻断弹窗，未执行完成写入。

**收敛结论：主要页面与两项关键缺口已完成评估，完成校准粒度已由用户确认为任务级，可以进入实施契约与UI蓝图阶段。评估完成不代表实现、成功写入／锁定、所有分析交互或异常态已验收。**
