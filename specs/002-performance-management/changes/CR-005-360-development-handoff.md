# 360°周期配置、结果可见性与成员列设置：开发交底与交接

> 受众：接手本仓库的开发 AI、前后端开发者和验收者。  
> 日期：2026-11-06。状态：**开发交接资料，不是已完成验收，也不替代待确认的业务决策或 UI 门禁**。  
> 关联：CR-005-T05（主任务）、CR-010 成员列表、CR-011 详情抽屉、PM-T004 模板内容与预览。  
> 本文只整理需求、当前代码、证据和实施建议；本轮没有修改业务代码，没有操作目标系统保存。

## 0. 接手先看：五个不能弄错的事实

1. **谁能看 360°、能看哪些内容，来自绩效后台的模板内容配置。** 周期匿名配置不授予查看权。项目成员数据范围授权也不能直接代替模板内容权限。
2. **360°角色不等于匿名，不等于内容全隐藏。** 当前管理详情代码按 `ROLE_REVIEWER_360` 一律跳过内容，是上一轮保守实现的缺陷，应替换为后端统一策略投影，不能只删掉判断直接开放全部明细。
3. **周期三设置尚未打通。** 需要实现配置 UI → 周期 API → 持久化 → 项目运行策略/快照 → 详情、邀请、删除消费 → 刷新回读，而非只补三个勾选框。
4. **成员列应由元数据驱动。** `metas`、允许列、默认列、锁定列、排序列是不同集合；不能把元数据里出现的所有字段都加入自定义列面板。
5. **现有采集不等于完整像素验收。** 三张新建页 PNG 实际相同；有字段/脚本依据，但多状态视觉、错误态和部分持久化语义仍需补采。不得沿用对话中“所有联动已实测”的过度表述。

## 1. 本次授权、代码基线与安全边界

### 1.1 用户已经明确的要求

- 先梳理方案与证据，不改业务代码；交接文件与证据归档由本次请求明确授权。
- 周期与项目 → 新建周期，加载包含 360°评估的模板后出现三项设置；应通过 REA 还原全部选项和前端联动。
- 360°结果查看范围、查看角色、查看内容按模板内容配置，不要另让用户枚举一套管理角色权限。
- 采集后形成后续 AI 能使用的档案，最终目标是像素级还原，不是近似 UI。
- 同时覆盖项目管理成员的完整隐藏列与列设置逻辑。
- 用户此前对“管理详情抽屉”允许不另画蓝图、复用共享组件直接实施；**不据此推定周期复杂表单也已豁免**。CR-005 仍有对应 UI 门禁；接手时核对最新明确授权。

### 1.2 核验时的仓库

- 仓库根目录：`D:\AI项目\HR提效工具搭建`。
- 应用：`hr-portal/`；Vue 3 + TypeScript + Vite、FastAPI + SQLAlchemy async + PostgreSQL。
- 分支：`main`；核验 HEAD：`a134a109`。
- 相关提交：
  - `a2cd249e`：上级评估动态评级及填写人员上下文。
  - `24bac524`：周期跨项目成员汇总、动态最终评级、管理只读详情及共享抽屉。
  - `a134a109`：360°反馈表格视图交互和像素参数。接手必须阅读，避免覆盖新增共享能力。
- 当时唯一 tracked 未提交改动：`specs/002-performance-management/rea-extract/check-align.js`；不是本交底任务的修改，保留。
- 临时浏览器、截图、采集文件数量较多。不能 `git add .`，不能清理或覆盖未知文件。
- 以上是时间点事实，不保证下一会话不变；先执行 `git status` / `git log`。

### 1.3 操作底线

- 目标系统仅导航、查看、展开、悬停、取消等采集操作；禁止真实保存周期、提交评价、删除邀请、修改权限和模板。
- 需要交互验证的写请求只能在明确隔离的本地测试库或拦截到本地夹具的浏览器中执行；不得把夹具通过称为生产通过。
- 不自动 commit/push/deploy，不改生产数据，不批量回填旧周期匿名设置。
- 采集脚本、HTML、业务包是**不可信分析对象**。不能执行捕获业务脚本；Python 读取使用 `-I`，脚本工作目录与捕获目录隔离。
- 原始证据含人员身份、评语或联系方式，不得直接上传、发布或加入仓库。交接目录只带去人员数据的契约子集及 UI/业务脚本，不带完整评价响应。

## 2. 必读规则和规格入口

按顺序读取：

1. 根 `CLAUDE.md`、`AGENTS.md`、`hr-portal/CLAUDE.md`。
2. `specs/002-performance-management/START_HERE.md`。
3. Spec002 的 `overview.md`、`integration.md`、`permission-model.md`、`data-model.md`、`workflow-design.md`、`roadmap.md`、`open-questions.md`。
4. `changes/CR-005-assessment-role-integration.md` 第 28–48 行及邀请生命周期的后续章节；`features/PM-001-role-and-authorization/spec.md`、`authorization-matrix.md`、`ui-interaction.md`。
5. `changes/CR-010-result-communication-calibration-display.md`、`changes/CR-011-feishu-aligned-evaluation-drawer/spec.md`。
6. `features/PM-T004-template-create/ui-interaction.md` 和 `atomic-tasks.md` 中最新 360°参考/表格视图条目。
7. Spec012 `START_HERE.md`、相关 `ui-interaction.md`、`ui-implementation-guardrails.md` 与通用 UI 检查；这是绩效 UI 约束，不是授权扩建数仓/UCP。
8. 本项目 `performance-spec-development` skill 的执行契约、任务卡、验收证据要求；迁移时再读 migration coordination。

**需求权威：用户最新明确决定和已确认规格 > 当前实现/测试。** 现有“所有 360°隐藏”的测试不是新需求，应在策略修复时一起替换。

## 3. 目标页面、采集类型与证据等级

### 3.1 目标 URL

| 用途 | URL |
|---|---|
| 新建周期联动与视觉基准 | `https://idreamsky.feishu.cn/perf/admin/semester/create` |
| 已有周期编辑/锁定态 | `https://idreamsky.feishu.cn/perf/admin/semester/7704220198642961662` |
| 有真实 360°数据的周期管理列表 | `https://idreamsky.feishu.cn/perf/management/v2/7035907577847760388/7340285661267951618/all-projects/members` |
| 另一周期管理列表，对比动态指标 | `https://idreamsky.feishu.cn/perf/management/v2/7654423719619710195/7340285661313974274/all-projects/members` |
| 上级评估列表，对比当前环节结果 | `https://idreamsky.feishu.cn/perf/review/7654423719619710195/7654113886190436355/members` |

### 3.2 证据等级约定

- **O：现场观察**：实际 DOM、控件值、网络响应或截图。只证明该样本和状态。
- **S：目标脚本确认**：从捕获业务包读出的分支、校验或请求组装；不等于真实交互执行过，也不证明服务端接受。
- **P：本地实施建议**：为适配本系统提出的 DTO、错误码、快照、任务拆分等，不冒充飞书后端实现。
- **U：未知/待确认**：需要补采或明确业务决定。U 不可静默改写为默认需求。

### 3.3 REA 与普通浏览器采集要分开

- REA `inspect_web_page` 采了页面和部分脚本，DOM 新建页 Evidence：`ev_fbd8ef337dfec003a3cdb78f498e19ca17540de0b8f85ee6db6d7117dc82ca3b`。
- 该捕获 attach 后没有历史网络响应：`network.requests = 0`。不得称其含实际周期保存请求。
- 新建页脚本导出 Evidence：`ev_511ffd31a1b455a2f2dde95758473343d767628ada29c8b977ad65a04af3a6d1`。
- 旧管理页/评估业务包 REA Evidence：`ev_6b6217fb16e1f7592cf22cc6e94ad7b1238572b51d22d050b1bfe25c4ad32812`，导出 `ev_c1e31bb573d8581a6e7e5d95a2e1a4f165d3a2e90905bf4a8ef2aca3cd24569e`。
- 目标加载响应、模板详情、360°四条数据及 ColumnSetting 脚本另通过现有 Playwright/CDP 获得，属于普通浏览器采集；不要给它们杜撰 REA Evidence ID。
- REA 场景工具曾失败；不要无条件重跑会导航且清空未保存新建表单的 capture scenario。

## 4. 已确认业务链：权限与匿名必须分层

正确顺序：

```text
可信登录身份与周期/项目数据范围
→ 目标环节和模板内容查看权限
→ 来源内容/具体题目的 allowView 等裁剪
→ 对当前查看者计算周期匿名策略
→ 只投影可见答案、身份、关系和统计信息
→ 共用前端组件渲染
```

必须分开计算：

- 能不能看此人员/周期/项目；
- 能不能看此 360°环节、内容块、具体题目；
- 能不能看匿名结果；
- 能不能看评估人身份；
- 能不能看描述信息（部门、序列、关系、标签、邀请人）；
- 哪些统计、过滤选项和历史内容也需脱敏。

不能只用成员表的 `data-view` 加前端 `readonly` 替代上述链路。不能用“看得到页签”证明允许读取答案。

## 5. 周期三组设置与前端联动

### 5.1 何时出现 360°设置区

**S：**目标代码检测所选模板的环节中存在 `stageModel === 'review'` 且 `stageConfigs.executors[].type === '360_reviewer'`。

本地应按稳定码 `assessment.reviewer_360` 识别 evaluation 节点，不能只匹配中文标题、只匹配邀请节点、或只认第一个模板。需要处理多模板 any-match、加载中、失败、切换竞态、移除最后一个含360模板。

**U：**新建/移除模板的所有状态还没有逐个现场点击并配对截图；保留值与清空值的精确交互需补采。不要把脚本条件等同于完整联动验收。

### 5.2 匿名评估

目标字段（O：已有周期 GET；S：新建页序列化）：

```json
{
  "anonymous_360_config": {
    "enable": false,
    "anonymous_object": "",
    "anonymous_low_limit": 0,
    "reviewer_tag_visibility_mode": "visibleOverLowLimit"
  }
}
```

- 勾选“360˚ 匿名评估”展开灰色配置区；取消隐藏该区。
- 匿名范围必填：`all`＝对全部查看者匿名；`reviewee`＝仅对被评估人匿名。
- 匿名下限有独立 switch。S：开启时原值大于0则保留，否则填3；关闭写0。开启后整数校验1–99。
- 下限不等于整个 360°任务是否允许评价，它影响匿名结果/描述信息披露。
- 描述信息方式：`visibleOverLowLimit`＝显示，但设置下限时只显示达到下限的信息；`notVisible`＝隐藏。
- 现场全展开样本：匿名开、对象all、下限开且3、描述方式显示。**用户事先设置的样本不是新建默认值。**
- 匿名区内的3是小 switch；匿名、删除、邀请提示三项主控制实际是 checkbox。不能仅靠 `[role=switch]` 判断三项开关状态。

### 5.3 允许删除评估人

字段 `allow_delete_360: boolean`。CR-005 已确认默认关闭。

既有规格要求：开启后，须是模板确认节点所选上级，且在该节点时窗内；草稿算未提交，可撤销并保留草稿历史/审计；已提交不可删除。

目标页面文案为“有添加360°评估人权限的角色可删除未做评估的人”。**它比本地CR-005的确认节点限制更宽泛；不能仅靠这句文案扩大本地授权。** 若最新目标实际角色/时窗与CR-005不同，先提交冲突决定。

后端必须锁任务/授权上下文，防止提交和撤销并发导致已提交记录丢失；不能继续 `db.delete(task)` 后称保留历史。

### 5.4 过量邀请提示

```json
{
  "invitation_out_of_range_tips_config": {
    "enable": false,
    "range_count": 0,
    "tips": {"zh-CN": "", "en-US": ""}
  }
}
```

- 主 checkbox 开启后，展开“显示条件”“提示内容”。
- 文案：当360°评估人收到**超过**N个邀请时提示，边界为 `count > N`，不是 `>=`。
- S：输入控件0–99、precision0；文本按启用语言维护、必填/非空白、最多5000字。仍需服务端校验和完整现场错误态。
- 初始空阈值/0和空tips是表单预置/样本值，不代表开启后可跳过必填保存。
- 此规则是“评估人收到邀请的数量”，与“一个被评估人可以邀请多少人”的项目人数上下限不是同一规则。
- **U：**数量统计是当前周期跨项目去重、任务数还是邀请人次，撤销/已评估/自愿评估如何计数，捕获前端不足以证明；先补接口/业务证据再固定口径。

### 5.5 编辑与启动锁定

O：指定编辑周期页里匿名与删除为禁用、提示开关可操作。S：代码依据项目已启动状态禁用匿名/删除；另有匿名下限细分禁用分支。

**不能把所有设置统一设成“周期LOCKED后不能改”**，也不能把“提示仍可改”解释为可动态改写全部已启动策略。项目冻结与运行时可更新策略要分别定义（见第9节）。

## 6. 目标匿名结果运行逻辑

S：业务包 `2611.ab8f8daa.chunk.js` 模块 `446913` 调用：

```text
GET /perf/api/review/v2/stage?template_id=...&root_review_id=...
```

读取并计算：

```js
isAnonymous = response.is_anonymous
hasVoluntary = response.has_volunteer
reachAnonymousLimit = response.meet_anonymous_limit
voluntaryReviewDetailOnly = isAnonymous && !reachAnonymousLimit && hasVoluntary
hideAllReviewDetails = isAnonymous && !reachAnonymousLimit && !hasVoluntary
```

| 有效匿名状态 | 达门槛 | 有自愿评估 | 目标前端分支依据 |
|---|---|---|---|
| false | 任意 | 任意 | 不因匿名规则整体隐藏；仍受模板查看权限 |
| true | true | 任意 | 不进入整体隐藏分支；身份仍可匿名 |
| true | false | true | 仅自愿详情分支及警告；确切可见集合需后端投影 |
| true | false | false | 整体详情限制提示 |

重要：`is_anonymous` 是该查看请求返回的有效状态，不应未经证明就当成周期enable原值。尤其 `anonymous_object=reviewee` 时，管理者可能不属于匿名对象。

O：本次有数据的管理样本 `is_anonymous=false`、`has_volunteer=false`、`meet_anonymous_limit=false`，4个items，DOM可见4个评估人及获准内容。**没有采到 anonymous=true 的真实结果样本，不能声称四种分支均现场验收。**

目标脚本对具体指标还有 `templateItemViewable` / `entryViewable` 判断，身份组件单独接收anonymous。周期下限说明还区分：

- 收到的360评价少于下限，匿名对象不可看结果；
- 某关系组（如同上级同事）人数少于下限，匿名对象不可看该组关系信息。

不得根据说明自行假设分母、去重、取消任务与自愿评价计数算法。匿名化要覆盖头像、姓名、工号、稳定ID、task ID、时间、关系、邀请来源、标签、悬浮卡、排序和导出等旁路，不能只把姓名替换成“匿名”。

## 7. 成员列表、隐藏列和抽屉的真实关系

### 7.1 当前环节与最终结果

两入口共享元数据结构/表格渲染；动态列key语义不同：

- review：`semesterStageReviewScoreGroup$<indicatorID>`，当前环节评估结果。
- management：`finalReviewScoreGroup$<indicatorID>`，当前周期绩效结果。
- 目标同一人员/项目的root和指标可一致；某次值相同不证明校准后永远相同。

### 7.2 隐藏列算法

```text
全部已知字段：metas
当前允许的可选字段：allowedPickKeys
默认选中：defaultPickKeys ∩ allowedPickKeys，加必须锁定列
锁定不可取消：lockedPickKeys
可以排序：sortKeys
用户列状态：当前有序visible keys，需按权限/当前schema过滤
隐藏数量：允许列数量 − 当前显示允许列数量
```

O：2021样本25个允许列，9个当前可见，16隐藏，姓名锁定。`defaultPickKeys` 有10个key但workCity不在allowed集合中，不能把默认数量直接当可见数量。

25列由以下结构组成：

- 姓名；三项动态最终评级（价值贡献、投入度、价值观）；360°评估率。
- 直属上级、HRBP、序列、子序列、职级、上期职级、入职日期、所属部门、部门全路径、所属项目、人员类型、当前雇佣状态。
- 八项动态环节状态：工作总结、360邀请、360确认、360评估、自评、上级评估、结果沟通、结果复议处理。

**纠错：**三项 `allInviteReviewScoreGroup$...`（360°聚合评级）在metas存在，但**不在该样本allowedPickKeys中**。这不是“还有三项默认隐藏列”，不得擅自加入可选列。

S：`ColumnSetting.4c7b6b20.chunk.js`：左侧checkbox，右侧已选有序列表；锁定项固定在顶部，不能移除；其他可移除/拖动。取消不触发onChange；确定回传有序key数组；可能有分组children与合成`@@` key，但当前样本并未出现需要还原的分组UI。不要为潜在分组过度开发。

O：列表读取 `foundation/draft`，key包含周期、header场景/all-projects、用户、roleId。本次没有点击确定，也没有抓到真实保存列顺序请求。**后端保存方式、跨设备语义不能仅凭GET推定；须从调用方脚本补齐。**

### 7.3 成员详情与共用组件

现有本地已有管理详情loader和共享抽屉。继续复用：

- `PerformanceDrawerShell`、`PerformanceReviewEvaluationDrawer`、`PerformanceReviewPersonHeader`。
- `PerformanceLineTabs`、`PerformanceReferenceContent`、`PerformanceTemplateRenderer`、`PerformanceRatingTag`。
- `ProjectMemberListPanel`、`PerformanceManagementTable`、`ProjectMemberColumnDrawer` → `PerformanceColumnVisibilityDrawer`。
- 360°预览/卡片/表格可复用 `PerformanceReviewer360Preview.vue` 最新功能，但先验证数据契约：**预览占位组件不能直接承载敏感运行数据而绕过后端匿名投影**。

管理root在本地使用 `PerformanceProjectMember.id` 作为人员快照根，与获授权任务ID不同。row的task_id仍有授权业务用途，不用它替代root。深链接同时核对项目/员工/root，后端不信任URL。

## 8. 当前本地代码地图（行号仅作定位，接手须再查）

| 文件 | 当前作用/应修改处 |
|---|---|
| `frontend/src/views/performance/CycleManagement.vue` | 223附近模板选择，327锁定模板，344附近表单状态，369模板加载，499/503附近创建/编辑/提交；缺三设置UI/回填/提交 |
| `frontend/src/api/performance.ts` | 周期DTO、cycle API；ProjectMemberPage动态列；PerformanceReferenceTab目前仅node/okr；管理detail与模板task的兼容契约 |
| `backend/app/performance/cycles_router.py` | CyclePayload:42、CyclePatch:86、CycleSummary:356；POST:523、PATCH:833；extra=forbid，不能前端悄悄多传字段 |
| `backend/app/performance/cycle_service.py` | create_cycle:284、update_cycle:324、serialize:755；字段未持久化/回读；同时检查copy流程 |
| `backend/app/performance/models.py` | PerformanceCycle:701，缺三配置；PerformanceNodeTask:978，answers/draft与状态、revoked_at可复用 |
| `backend/app/performance/project_service.py` | start_project:1107；1227节点快照config；旧项目补建1340后；不能读取实时配置改写启动历史 |
| `backend/app/performance/projects_router.py` | 管理列表/周期union 1626后；_project_member_detail:1858后；1908角色一律匿名跳过为需修缺陷；管理数据范围保持 |
| `backend/app/performance/self_summary_service.py` | project_reference_content:371；allowView/hideName/hideDescription等投影；不能以空relation默认值取代明确内容授权 |
| `backend/app/performance/subject_visibility_service.py` | 人员档案字段可见性，不是360评价内容全部权限；勿混淆 |
| `backend/app/performance/review_360_invites_router.py` | 列表311、提交412、撤销515；项目人数上限/提示和周期过量邀请提示不同；db.delete task需历史保留修正 |
| `backend/app/performance/review_360_feedback_router.py` | 自愿来源审计、评估人列表、时窗；可复用识别来源，不猜handler身份 |
| `frontend/src/components/performance/PerformanceReviewEvaluationDrawer.vue` | 管理loader、多页签只读、opening提示；目前360运行视图未接真实策略DTO |
| `frontend/src/components/performance/ProjectMemberListPanel.vue` | 当前仍固定profile列，仅rating动态；缺完整column meta、默认隐藏/排序允许集合及可靠持久化 |
| `frontend/src/components/performance/PerformanceColumnVisibilityDrawer.vue` | 已有勾选/拖动/确认取消；当前只取一个lockedColumn，是否支持多locked以契约为准 |
| `frontend/src/components/performance/PerformanceReviewer360Preview.vue` | 最新卡片/表格、展开、筛选外壳；检查是否仍有样例数据或无业务动作的排序按钮 |

已存在本地管理接口：

```text
GET /api/v1/performance/project-management/cycles/{cycle_id}/members
GET /api/v1/performance/project-management/cycles/{cycle_id}/members/export
GET /api/v1/performance/projects/{project_id}/members
GET /api/v1/performance/projects/{project_id}/members/{employee_no}/detail?root_review_id=...
```

不能为方便管理页面而放宽 `tasks/{task_id}/template-task` 的原处理人校验。不要再造平行结果引擎或平行任务表。

## 9. 开发前必须落定的契约（P / U）

### 9.1 周期存储与生命周期

P：新增一个具备严格schema的周期360设置对象（可采用专门JSONB或三个typed字段）；不要全盘照搬飞书宽泛ext_json。API字段名应统一冻结，兼容读取规则写清楚。

需要决定/补证：

1. 历史周期/项目无字段时的处理，不能仅根据目标某旧周期enable=false就把全部旧项目改成实名。
2. 匿名、删除策略在项目启动时冻结；提示文案/阈值是否运行时允许更新，以及对已启动项目的生效规则。目标提示仍可编辑，但其服务端传播机制未知。
3. 多模板移除最后一个360模板时，隐藏但保留草稿配置还是规范化disable；保存时清空字段与PATCH省略字段的区别。
4. “全部查看者”是否有自评、本人查看自己给出的评价、审计管理员例外，目标接口是否已做actor-specific计算。不要随意加管理员豁免。
5. 下限按人/任务/关系组的精确计数、自愿样本的独立例外，必须以业务规则和实际接口为准。
6. 过量邀请计数范围、去重及撤销时处理。与项目配置提示发生冲突时分别命名，不互相覆盖。
7. 已有CR-005删除授权与目标最新文案的差异。保留已提交数据与审计是硬边界。

### 9.2 运行期策略DTO建议

P（不是已经存在的API）：

```json
{
  "visibility": {
    "can_view": true,
    "is_anonymous": true,
    "meet_anonymous_limit": true,
    "detail_mode": "all | voluntary_only | hidden",
    "description_mode": "visibleOverLowLimit | notVisible",
    "restriction_reason": null
  },
  "entries": [
    {
      "display_key": "opaque-permitted-key",
      "reviewer": null,
      "description": {},
      "form_schema": [],
      "answers": {}
    }
  ]
}
```

- 后端先裁剪。被禁止的身份/内容不能先下发再靠Vue隐藏。
- template view不可见时 entries、统计、筛选选项、导出不得泄露被拒字段。
- 匿名display_key不可取明文工号、task_id或能够通过另一个API反查的稳定真实ID。
- error/loading/未提交/匿名限制/无查看权分开，不能全部显示“暂无可查看内容”。
- 同一策略投影供管理详情、上级参考、员工结果、360统计/导出使用；后端授权入口仍各自校验。

### 9.3 列元数据契约建议

P：在现有ProjectMemberPage增加 `columns/default_column_keys/locked_column_keys/sort_keys`（最终命名先统一），rows按受控key提供值；跨项目按稳定指标身份合并，重名指标不得仅按label合并。

- 个人档案字段按权限生成可选列和行值；环节状态从真实当前快照任务读取，不拿姓名/前端row数推算。
- `current_employment_status`与周期快照雇佣状态区分；实时数据源缺失要返回无值/不可用，不倒填在职。
- 上期职级只能来源上一周期已发布快照；HRBP和上级名称用适当当期快照，不使用随时变化的通讯录改写历史。
- 全量排序后分页；排序key只允许sort_keys；导出用查看与导出范围交集、按用户列顺序。
- 列偏好保存需绑定当前用户＋场景/角色＋周期/项目范围。不要为每个业务页面各建一套偏好表；先查可复用全局偏好服务；未定前不能把localStorage标成跨设备持久化。

## 10. 原子任务与顺序（均待执行，别直接勾完成）

| ID（挂CR-005-T05，临时子任务名） | 交付及允许主要文件 | 前置 | 成功/拒绝验收 |
|---|---|---|---|
| T05-E01 证据补齐与契约冻结 | 现有CR-005任务/交互文档、本文证据目录索引 | 本交底 | 缺失态明确，字段/默认/历史/锁定/匿名对象冻结；未知不伪装已确认 |
| T05-D01 周期配置与迁移 | models、cycles_router、cycle_service、新Alembic迁移、既有cycles测试 | E01 | 创建→回读→PATCH→复制一致；非法布尔/枚举/范围拒绝；upgrade/downgrade/旧行不丢 |
| T05-U01 周期配置UI | CycleManagement、api/performance、允许的新共享小组件、既有CycleManagement测试 | E01、D01 | 含360模板联动、匿名/下限/描述/提示展开、错误态、重开回填与截图；竞态不串模板 |
| T05-S01 启动快照及统一策略 | project_service、复用的后端策略service、详情/引用/结果入口及测试 | D01 | 周期修改不静默改启动历史；角色不等于匿名；四分支、字段可见与越权拒绝 |
| T05-I01 邀请撤销与提示 | invites/feedback router与服务、既有invite组件/测试 | D01、S01 | 删除off拒绝、错误操作人/时窗拒绝、已提交拒绝、草稿历史和审计保留、并发提交安全、count>N边界 |
| T05-U02 真实360只读视图 | 共用抽屉/参考/readonly renderer及360组件、既有测试 | S01 | 真实多评估人卡片/表格、筛选、展开收起，匿名无身份旁路，不使用硬编码样例 |
| T05-C01 列数据契约 | projects_router、api/performance、现有projects测试 | E01 | 允许/默认/锁定/排序各集合、profile范围、多项目union、状态真实、空页schema与导出正确 |
| T05-C02 列设置与偏好 | ProjectMemberListPanel、共用列drawer、既有偏好服务及测试 | C01、偏好存储决定 | 25类结构按模板变化，锁定列不能删、取消不保存、拖动顺序回读、权限变化清理未知key |
| T05-A01 集成与像素验收 | 现有测试/验收文档、每任务独立截图 | 上述 | 真实应用/API/隔离库/重开、身份允许拒绝、PC视觉对照及全部未执行项分别记录 |

文件所有权：同一轮一个执行者独占 `api/performance.ts`、`projects_router.py`、`models.py` 和迁移头。先冻结DTO再并行，不能多个AI同时改共享文件。写新脚本/报告前仍按用户规则确认，不能为了验证随手造临时harness污染源码。

每卡实施前输出：目标卡、角色入口、复用点、改动/不改范围、输入/输出契约、成功/拒绝条件、测试命令、停止/回滚方式。每次只认已完成的验收，不因上一卡测试通过把下一卡标完成。

## 11. 像素级开发的具体方法与目前可用数值

### 11.1 环境锁定

- 现有新建页截图：**1920×953 CSS px，DPR1**。浏览器需同视口、同缩放100%、同字体、同语言、同模板、同开关值、同滚动容器位置。
- PNG尺寸只是viewport，页面内部有滚动；`fullPage:true`不代表内部全部内容都进入截图。
- HTML包含目标水印/全局SVG/样式注入，不能复制整个页面DOM当实现；不要还原真实账号水印。
- `getBoundingClientRect`是viewport坐标；先换算到对应容器，再抽相对间距，不能把x=640写成CSS绝对布局。

### 11.2 已有实测参考

来自 `ui/create-targeted-layout.json`（O；具体节点重复，须选可见最小语义节点）：

| 元素 | 样本矩形/样式 | 用法 |
|---|---|---|
| 主匿名checkbox行 | x600,y194；文字14/22、400；checkbox到文字24px | 以表单内边距复原，不把全局x写死 |
| 两项匿名范围radio | x640,y292及322；行704×22；文字14/22、400；label-content左8px | radio行之间30px起点差，结合容器确认gap |
| 匿名下限label | x640,y364；56×22；内span14/22、600 | 外label400和内span600不同，注意层级 |
| 显示/隐藏radio | y494及524；704×22；文字14/22 | 长文按真实容器换行，勿固定所有高度 |
| 删除项文字 | x624,y575；14/22、400 | 灰色匿名区后的分组间距需补容器样式 |
| 邀请提示文字 | x624,y631；14/22、400 | 与展开区相关 |
| 显示条件label | x640,y694；704×22，父字重600、内span400；下margin4px | 不用父字重覆盖真实文字 |
| 提示内容label | x640,y764；同上 | 输入控件尺寸需额外测量 |

S（class/脚本推导，非完整computed styles）：匿名灰区 `rounded-8 px-8 py-8 ml-12`，提示灰区 `rounded-6 px-8 pt-6 pb-2 ml-12 mt-4`。目标utility常用2px基准，但须以实测CSS验证，不能把8直接理解为8px。

### 11.3 仍需补采的视觉/状态矩阵

- [ ] 无模板、无360模板、加载中、加载失败、多个模板、移除最后一个360模板。
- [ ] 匿名关闭/开启；两种匿名对象分别选择；下限开/关、值保留/重置。
- [ ] 下限1、99、0、100、非整数/空值的真实反馈（不要点真实保存触发，应在不写入条件下观察blur或本地夹具）。
- [ ] 描述信息显示/隐藏；三个说明气泡、查看示例对话框的DOM/尺寸/位置/关闭。
- [ ] 提示开启/关闭；阈值输入、空白/字数/多语言状态；英文启用后控件数量和文案。
- [ ] 编辑启动前后disabled/hover说明；锁定字段与仍可编辑提示的区别。
- [ ] 360匿名true有效样本、下限未达/已达、有自愿例外；去身份后的DOM及统计/过滤选项。
- [ ] 列面板的尺寸、两侧滚动、锁定项、拖动前后、确认/取消回读（真实保存需另行许可或隔离拦截）。
- [ ] 稳定态截图：等待入场transform none与opacity1；不能用半透明动画帧。

每状态证据应保存：唯一state_id、URL/模板/viewport/scroll、before/action/after、state值、DOM子树、相关计算样式与CSS rules、截图、是否发写请求、来源ID/哈希、限制。命名必须唯一，不覆盖他人状态。

### 11.4 像素验收门槛

P建议：同环境DOM边界对齐与关键节点矩形对照，边界/间距误差目标≤1 CSS px；截图叠加或diff标注字体抗锯齿/时间/水印等排除区域。误差阈值需任务卡明确，不把P建议说成用户已确认标准。视觉通过还须真实交互与API持久化通过。

## 12. 证据目录与可携带性

### 12.1 本轮新建的可移交目录（仓库相对路径）

```text
specs/002-performance-management/rea-extract/evidence/20261106-cycle-360-handoff/
  manifest.json
  ui/
    create-all-expanded.png
    create-targeted-layout.json
    create-all-controls.json
  contracts/
    cycle-settings-observed.json
    review-360-observed-policy.json
    member-columns-observed.json
  target-scripts/
    4640.6f3eeca2.chunk.js
    7255.02afdc6e.chunk.js
    2611.ab8f8daa.chunk.js
    ColumnSetting.4c7b6b20.chunk.js
```

每个文件都在manifest内记录原始路径、sha256、bytes、观察类型。contracts是从真实响应提取的去人员数据子集，不是假造完整响应；source_sha256可追溯原件。捕获脚本仅供静态查看，不能运行。**本轮没有commit这些档案，其他机器仅git clone并不能自动得到；移交时带上目录并核哈希。**

### 12.2 原始本机档案（不可保证异机可读）

基目录：`C:\Users\gaby.liu\.claude\projects\d--AI---HR------\`。

| 目录/文件 | 用途与限制 |
|---|---|
| `rea-cycle-create-evidence-20261106/` | 9文件；PNG/HTML/29节点布局/控件；三PNG相同；first-form文件覆盖不足 |
| `rea-cycle-create-capture-20261106/capture.json` | 新建页REA原始捕获，可查DOM/AX、覆盖限制 |
| `rea-cycle-create-scripts-20261106/manifest.json` | 14脚本导出，仅同源；**不含CDN 4640业务包**，不能拿此manifest证明业务联动代码已抓全 |
| `rea-cycle-360-settings-20261106/` | 29文件；已有周期配置22.json、CDP导出source-3=4640；业务代码来源是编辑页，不能假称新建实时覆盖 |
| `rea-360-columns-20261106/` | 237文件；360 DOM、列DOM、ColumnSetting.js与响应；有数字文件覆盖，按path/query/hash定位 |
| `rea-members-network-20261106/` | 上级评估列表接口原始响应 |
| `rea-members-cdn-scripts-20261106/` | REA带CDN业务包导出和manifest；2611匿名逻辑、6131列渲染、5851共享入口 |
| `rea-cycle-create-20261106-evidence.json` | 约41.6MB混合会话Evidence，14 records，不是仅新建页；可能含人事数据，不盲传 |
| `rea-members-20261106-evidence.json` | 约36.5MB早期Evidence；同上 |

重要原件定位：

- 周期详情：`rea-cycle-360-settings-20261106/22.json`，path `/perf/api/review/semester`，query.id=7704220198642961662。
- 360有效样本：`rea-360-columns-20261106/135.json` 或137.json，path `/perf/api/review/v2/stage`，template_id=7035917120499074570；4 items，is_anonymous=false。
- 列元数据：同目录344.json（195.json也是同目标样本）；path包含7035907577847760388/users/meta。
- 列偏好GET：同目录324.json；读取foundation/draft的场景key。
- numeric 211/213曾被覆盖成user/custom_settings，**不能再引用它们作为360详情**。

### 12.3 已知档案纠错，接手必须保留

1. 三PNG SHA256均 `049c73b0b737bf6d46b7302d29cbcc1dd66acbebdb861a8a22f89be980c30704`；只算一个全部展开样本。`01-initial`文件名不代表关闭态。
2. `03-form-controls.json`与capture-index的formSummary只来自首个form，不包括360表单；完整状态看`04-control-states.json`。
3. 只查询role=switch得到三项：包括允许绩效、匿名下限、离职参评等，不能当三主checkbox。完整状态明确主匿名/删除/超量提示均checked=true，下限3，阈值0。
4. “保存请求已采到”是先前表述错误：没有点保存，没有真实POST/PATCH周期证据；只有保存序列化静态代码。需要隔离测试验证真实请求/DB/回读。
5. 29节点布局不是全页面参数表，不含全部容器/输入框/浮层/错误态。
6. 现有raw archive含与本任务无关records；导出成功不证明证据全被阅读/验证。按精确operation/target/evidence_id取片段。
7. 目标新建页已由用户提前打开三checkbox，无法从该样本推断出厂默认值；匿名默认false等需独立证据/决定。
8. 目标匿名true、门槛边界、少量组脱敏未现场观察；公式是脚本证据。
9. 不能将columns-dom全页HTML直接发布，它夹带成员列表人员数据；只移交列元数据和纯UI子树。

## 13. 验收清单与现有测试基线

### 13.1 上一轮历史基线（不是新能力验收）

- 后端 `test_performance_projects.py`：448 passed、5 skipped、1 multipart弃用警告。
- 相关前端4文件：99 passed（含当时360预览6项）；Review沟通测试有jsdom请求stderr但测试通过。
- 前端build通过，最近采集轮记录40.95s、既有VueUse PURE提示。
- 以上证明已有管理列表/抽屉仍可用；**不证明周期三设置、匿名策略、25列或列持久化已实现**。
- 本文整理时没有重跑上述测试。接手根据当前HEAD重跑并区分passed/skipped/blocked。

### 13.2 测试文件

- 后端：`tests/test_performance_cycles.py`、`test_performance_projects.py`；另用Glob确认现有360邀请/反馈/工作流/对象授权测试的实际文件名。
- 前端：`CycleManagement.spec.ts`、`ProjectManagement.spec.ts`、`Review.spec.ts`、`SelfSummaryTask.spec.js`、`PerformanceReviewEvaluationDrawer.spec.ts`、`PerformanceReviewer360Preview.spec.ts`、共享column drawer的既有测试。
- 当前projects测试 `test_management_detail_masks_360_until_anonymous_projection_is_available`（7212附近）正是需替换的旧保守行为；不是业务权威。

示例命令（本机PowerShell，路径核验后用）：

```powershell
$env:PYTHONPATH='D:\AI项目\HR提效工具搭建\hr-portal\backend'; & 'D:\AI项目\HR提效工具搭建\hr-portal\backend\.venv\Scripts\python.exe' -m pytest hr-portal/backend/tests/test_performance_cycles.py hr-portal/backend/tests/test_performance_projects.py -q --tb=short
npm --prefix hr-portal/frontend test -- src/views/performance/CycleManagement.spec.ts src/views/performance/ProjectManagement.spec.ts src/views/performance/Review.spec.ts src/components/performance/PerformanceReviewEvaluationDrawer.spec.ts src/components/performance/PerformanceReviewer360Preview.spec.ts
npm --prefix hr-portal/frontend run build
git diff --check
```

### 13.3 必须形成的Given/When/Then

- 有/无360模板→设置出现/消失，提交payload符合规范；创建/编辑/复制/重新进入一致。
- 无后台权限调用周期配置被拒，前端禁用不是权限检查替代品。
- 模板内容未授权→即便周期匿名关闭也不返回内容。
- 非匿名请求→允许范围内返回真实多人内容/身份；匿名请求→身份旁路均无泄露。
- 匿名对象all/reviewee与不同查看者组合；门槛k-1/k/k+1、自愿有/无、关系组k-1/k。
- 草稿绝不出现在只读详情、统计或导出，撤销任务不计入有效结果。
- 删除关闭/错误actor/时窗外/已提交→拒绝且无数据变更；未提交草稿撤销→保留历史审计；并发提交/撤销只有一个合法结果。
- 阈值N-1/N/N+1，tips空白、多语言遗漏、超过长度和不可用数据源。
- 列metas存在但not allowed→不出现；姓名锁定；排序非法key422；用户取消不保存、确定持久回读；列顺序、导出顺序与schema变化一致。
- 同一员工跨两个项目→root不串；周期跨项目union不漏人，不读无权项目；导出权限范围与查看范围交集。
- 启动前后配置变更与历史根重开；当前花名册变化不改历史快照。
- 数据库新字段upgrade/downgrade和旧记录回读验证，Alembic多head立即停止协调。
- 同真实viewport截图比较所有确认状态；每卡独立截图，不将示例预览当真实数据页验收。

## 14. 直接交给下一位AI的启动指令

> 你正在接手HR Portal绩效管理 Spec002 的360周期配置与结果投影、成员完整隐藏列能力。先读本交底及根/hr-portal规则，检查git status和HEAD，不覆盖未知改动。不要把之前“所有360一律匿名隐藏”的实现/测试当需求。用户已明确：谁能看360、哪些题能看来自模板内容配置；周期匿名仅对已获准查看的结果施加身份/下限/描述策略。先核验同目录证据manifest哈希和各证据等级，原始人事数据不要外发。当前三截图相同、保存请求未实测、匿名true边界和多状态视觉有缺口；先完成T05-E01补采/契约冻结，提出仍需用户决定的历史与冻结规则，再按卡实施。共享组件沿现有抽屉、列drawer、readonly renderer和360卡片/表格；禁止新造平行引擎。未经本轮明确授权，不保存飞书周期、不提交评估、不改生产、不commit/push。每次只交付一张可验收卡，分别报告代码、测试、SQL/API、截图、部署/生产验收，未跑或跳过绝不写通过。

## 15. 当前交接完成与未完成

已交接：需求边界、已确认与未知规则、代码入口、建议契约、任务拆分、验收矩阵、像素实测子集、原始档案路径、可移交去人员证据及SHA256清单。

未交接为完成：所有状态的像素参数、匿名true现场行为、真实保存请求/数据库回读、目标列偏好保存协议、匿名默认/历史兼容/更新传播的最终决定。这些需要接手者补齐，不能从本文推导成“已100%还原”。
