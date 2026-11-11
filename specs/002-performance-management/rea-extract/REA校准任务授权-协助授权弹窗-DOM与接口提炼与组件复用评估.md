# REA 校准任务授权「协助授权 / 新建授权」弹窗 — DOM 与接口提炼与组件复用评估

> 逆向对象：飞书绩效「项目管理 → 总览 → 授权管理 → 校准任务授权 → 查看 → 协助授权」弹窗
> REA 目标：`https://idreamsky.feishu.cn/perf/management/v2/7654423719619710195/7340285661313974274/all-projects/adjust-authorization`
> 方法：CDP 9222 被动抓取（inspect_web_page + capture_web_screenshot + observe_web_session）+ 复用历史证据包（`hr-portal/.tmp/rea-webpage-scripts.json`，98 业务脚本全量源码，含懒加载 chunk）
> 评估基线：本地当前代码（`ProjectCalibrationAuthorization.vue` + `PerformanceTaskDelegationDialog.vue` 校准分支 + `projects_router.py` calibration-authorization）
> 日期：2026-11-10 ｜ 本轮只评估不改码，零生产操作
>
> 测试账号/周期：gaby `6733065964654462476`；semester `7654423719619710195`；roleId manager `7340285661313974274`
> 证据：`mcp-rea-inspect_web_page-*`（2 次）、`shot_adjust_authorization.png`、`acc_dump.txt`（a11y 364 行）、`rea-webpage-scripts.json`（记录 0）

---

## 1. 采集目标与证据链

| 项 | 值 |
|---|---|
| 页面 URL | `all-projects/adjust-authorization`（校准任务授权列表页，**独立路由**，非弹窗叠加） |
| 列表页组件 | 飞书 `AdjustmentAuthorization`（7255 chunk 路由映射 `ms`）；本地 `ProjectCalibrationAuthorization.vue` |
| 协助授权弹窗 | 标题「新建授权」（`AdjustmentAuthorization.add_authorization`），居中 modal 600px 宽，本地 `PerformanceTaskDelegationDialog.vue` 校准分支 |
| 记录页 | 飞书 `AdjustManagementAuthorizationRecordsPage`（`lc`）；本地 `ProjectAuthorizationRecords.vue` |
| 接口簇 | `/review/adjust/authorization/*`（6359 + 7255 chunk 全量签名） |
| 权限点 | `performance.frontend.authorize-calibration-tasks`（本地）/ 飞书 `WR.adjust_authorization` |
| 网格卡片入口 | 本地 `ProjectManagement.vue` → `AuthorizationManagementPanel`（「校准任务授权」卡片 `@view` 已绑定） |

**核心结论（一句话）**：飞书「校准任务授权 → 协助授权」是一个**独立于普通授权/转交（`/review/authorization*`）的接口体系（`/review/adjust/authorization/*`）**；本地已用同一套 `PerformanceTaskDelegationDialog` 校准分支实现了**字段级 1:1 对齐**的弹窗，后端接口路径不同但契约语义一致。本轮评估重点是接口清单、弹窗组件复用判断与差异项。

---

## 2. 飞书侧接口清单（`/review/adjust/*` 簇，chunk 6359/7255 实采）

### 2.1 校准授权页（AdjustmentAuthorization）主链路

| # | 接口 | 方法与参数 | 说明 | 本地对应 |
|---|---|---|---|---|
| A1 | `POST /review/adjust/tasks/list` | `{semester_id, stageIds}` → `adjustTasks` | 校准任务列表（列表页数据源；另一重 `POST /review/adjust/tasks` 同构） | `GET /performance/project-management/calibration-authorization?cycle_id=`（行 = 校准人分组，非任务粒度） |
| A2 | `GET /review/adjust/authorized/adjuster/list` | GET query | 已授权校准人列表（调整授权人维度） | 本地 `items[].calibrator` |
| A3 | `POST /review/adjust/authorization/submit` | `{adjust_task_id?, role, role_id, scope, distribution, notify…}` | **新建授权提交**（弹窗确定） | `POST /performance/projects/:id/tasks/:id/delegations` + `action=AUTHORIZE` + `scope_mode/scope_kind/distribution_mode/allow_reauthorize` |
| A4 | `POST /review/adjust/authorization/resolve_scope` | `{adjust_task_id, role, role_id, scope…}` | 解析授权范围（弹窗「授权范围」选择后计算总人数） | 本地 `filteredTasks` 前端纯计算（无后端接口） |
| A5 | `POST /review/adjust/authorization/searchable/department` | `{adjust_task_id, role, role_id}` | 可搜索部门（「指定部门」候选源） | 本地 `departmentOptions` = 任务快照 `department_path` 去重 |
| A6 | `POST /review/adjust/authorization/revoke` | POST | 撤销授权 | `DELETE /performance/projects/:id/tasks/:id/delegations/:authorizationId` |
| A7 | `GET /review/adjust/authorized/reviewee_list` / `unauthorized/reviewee_list` | GET query | 已授权/未授权被评估人 | 本地 `authorized_count` / `unauthorized_count` |
| A8 | `GET /review/adjust/task/detail` / `stages/list` | GET | 任务详情 / 环节列表 | 本地 `calibration_service.py` 快照 |

### 2.2 提交载荷推断（接口签名 + DOM 字段交叉验证）

```ts
// POST /review/adjust/authorization/submit（字段名由 6359 签名 + 弹窗 DOM 逆推）
{
  adjust_task_id: string,   // 行 = 校准任务（飞书是任务级授权）
  role: string,             // 执行角色（校准语境固定 calibration）
  role_id: string,          // 7340285661313974274
  scope_mode: "PARTIAL" | "ALL",          // 授权范围
  scope_kind: "DIRECT_SUBORDINATES" | "DEPARTMENT" | "PEOPLE",  // PARTIAL 细分
  department_ids: string[] | undefined,   // 指定部门
  user_ids: string[] | undefined,         // 指定人员
  distribution_mode: "INHERIT" | "NONE",  // 强制/建议分布规则
  allow_reauthorize: boolean,             // 允许继续授权他人校准
  notify_origin_reviewer: boolean,        // 通知原校准人
}
```

> 注：A3/A4/A5/A6 的实际字段名未在静态证据中捕获（弹窗 UI 为懒加载 chunk `AdjustmentAuthorization` 的依赖，未被上一轮 members 页加载，且 REA 策略过滤 CDN 脚本源）。字段名按 DOM 控件 + 本地已实现契约逆推，**提交契约细节需真实抓包确认**（见 §7 待确认）。

---

## 3. 页面 DOM 结构（a11y 树 928 节点实采）

### 3.1 列表页

- **顶部 banner**：`以下校准任务均在你的管理范围内，你可协助校准人再将相应任务授权其他人校准。本阶段起止时间：2026-07-20 10:00（GMT+8） – 2026-07-31 23:59（GMT+8）`
  - 注意：**起止时间动态注入**（本周期校准阶段），本地 `info-banner` 文案为「校准任务阶段时间以当前周期流程配置为准」——差异见 §6。
- **筛选按钮**：`筛选`（combobox 前置）
- **搜索**：`搜索成员`（combobox `editable,focusable,hasPopup,required`）
- **表格 10 列**（列头实测）：
  `被授权人 / 校准状态 / 校准范围 / 可校准人数 / 是否允许授权他人 / 未授权人数 / 分布规则 / 授权人 / 发起授权时间 / 操作`
- **行数据 9 行**，每行操作区：
  - `协助授权` 按钮（本地= `openAuthorization`，可点）
  - `撤销授权` 按钮（**多数 disabled**；仅 1 行 enabled 且带 `撤销授权` 文字）
- **状态列**：`已校准`（全部 9 行）+ 1 行 `否`（是否允许授权他人）
- **校准范围列**：`全部下级`（8 行）/ `任务内全部人员`（1 行）
- **可校准/未授权人数**：58/58、15/15、105/105、130/130、9/9、9/0、29/29、5/5、24/24（link 样式，蓝色）
- **授权人**：`alice.xiao肖惠方`（8 行）/ `sammi.zheng郑诗美`（1 行）——即本测试账号的直属校准人
- **发起授权时间**：`2026-06-29 14:33（GMT+8）`（8 行）/ `2026-07-27 11:55（GMT+8）`（1 行）

### 3.2 协助授权弹窗（dialog modal，标题「新建授权」）

| 字段 | DOM 证据 | 本地对应 | 对齐 |
|---|---|---|---|
| 标题 | `新建授权` | `calibration ? '新建授权'` | ✓ 同文案 |
| 提示条（readOnly） | `校准任务已完成。授权后，被授权人仅有查看权限，无法修改被评估人的绩效结果。` | `readonly-notice`（同文案） | ✓ 同文案 |
| 授权给* | `请选择被授权人`（combobox） | `PerformanceSearchSelect` + `placeholder="搜索成员"` | ✓ 结构同，placeholder 文案差（本地"搜索成员" vs 飞书"请选择被授权人"） |
| 授权范围 | radio `任务内的部分人员` / `任务内的全部人员`；`总人数：0 人` | `PerformanceRadioGroup` PARTIAL/ALL + `总人数：{{filteredTasks.length}} 人` | ✓ 结构同 |
| 部分人员细分 | radio `被授权人的全部实线下级` / `指定部门` / `指定人员` | DIRECT_SUBORDINATES/DEPARTMENT/PEOPLE | ✓ 同 |
| 强制/建议分布规则* | radio `沿用此任务的分布规则` / `无需满足分布规则`；`沿用` 后有提示符，hover 展示真实分布规则 | INHERIT/NONE 双选项（NONE 已放开）+ `沿用` 后 `PerformanceInfoPopover` hover tooltip（内容 = 后端随列表下发的真实规则明细） | ✅ 已对齐（2026-11-10 实施轮） |
| 允许继续授权他人校准 | switch | `allowReauthorize` UiSwitch | ✓ 同 |
| 通知原校准人任务将授权他人处理 | switch | `notifyOriginal` UiSwitch | ✓ 同 |
| 按钮 | `取消` / `确定` | UiButton 取消/确定 | ✓ 同 |

> radio 默认态：a11y 显示 `任务内的部分人员`、`沿用此任务的分布规则` 带 checked —— 与本地默认 `PARTIAL`/`INHERIT` 一致。`指定部门`/`指定人员` 仅在 PARTIAL 选中时展开（本地同）。

---

## 4. 后端接口差异矩阵（飞书 vs 本地）

| 维度 | 飞书（`/review/adjust/*`） | 本地（`/performance/project-management/*`） | 差异判定 |
|---|---|---|---|
| 列表粒度 | **任务级**（每行 = 单个校准任务，9 行 = 9 任务） | **校准人分组级**（每行 = 某校准人的一组任务，`task_ids[]`） | **差异**：本地一行含多任务，协助授权时 `delegationTasks` 拆成多任务批量提交；飞书逐任务单提交。本地 `task_ids.length` 守卫 `协助授权` 可点性 |
| 提交接口 | `POST /review/adjust/authorization/submit`（单任务） | `POST /projects/:id/tasks/:id/delegations`（逐任务循环 + 幂等键） | 语义一致；本地是逐条 + `uncertain` 部分失败提示，飞书一次一任务 |
| 范围解析 | `POST resolve_scope` 后端算总人数/范围 | 前端 `filteredTasks` 本地过滤计算 | **差异**：飞书后端权威计算；本地纯前端（快照 `department_path`/`direct_supervisor_employee_no` 已在 `calibrationAuthorization` 下发） |
| 部门候选 | `POST searchable/department`（按 adjust_task_id 动态拉取） | 前端 `departmentOptions` = 任务 `department_path` 去重 | **差异**：飞书后端按任务限定部门树；本地只列任务已有部门路径（无全局部门树） |
| 撤销 | `POST /review/adjust/authorization/revoke` | `DELETE .../delegations/:authorizationId` | 一致 |
| 被评估人列表 | `authorized/unauthorized/reviewee_list` 两接口 | 无（仅计数 `authorized_count`/`unauthorized_count`） | 本地精简；飞书可下钻名单 |
| 幂等/重复 | 服务端幂等 | 409 `TASK_ALREADY_AUTHORIZED` + 请求幂等键 | 一致 |
| 越权 | 服务端校验 | `_task_recipient_scope` 403 细分错误码 | 一致且更强 |
| 分布规则 | `INHERIT`/`NONE` 双选项 | 本地 `INHERIT`/`NONE` 双选项（NONE 已放开） | **已对齐**（2026-11-10 实施轮）：飞书 NONE 语义 = 授权后不要求满足分布规则。本地放开 NONE 选项，但**强制分布开关开启时后端保留 409 拦截**（`CALIBRATION_DISTRIBUTION_AUTHORIZATION_UNSUPPORTED`），与后端既有配置语义一致 |

**本地独有、飞书未采集到**：撤销授权（`revoke` + `can_revoke`）、`uncertain` 部分失败重试 UI、只读 `readonly-notice`、越权细分错误码、幂等键。

---

## 5. 组件提炼 / 复用评估

| 组件 | 归属 | 复用点 | 状态 |
|---|---|---|---|
| `PerformanceTaskDelegationDialog.vue` | 本地已有 | **校准分支已 1:1 覆盖飞书弹窗全部字段**（标题/提示条/授权范围/分布规则/两开关/取消确定） | 无需新增；本轮评估确认 |
| `PerformanceDialogShell.vue` | 本地已有 | 弹窗壳（600px、header/close/遮罩） | 复用 ✓（与飞书 600px modal 对齐） |
| `PerformanceSearchSelect` | 本地已有 | 接收人搜索选择（placeholder 差「请选择被授权人」vs「搜索成员」） | 复用；文案差可微调 |
| `PerformanceRadioGroup` | 本地已有 | 授权范围 / 分布规则 / 部分人员细分三组 radio | 复用 ✓ |
| `UiSwitch` | 本地已有 | 两开关 | 复用 ✓ |
| `PerformanceManagementTable` | 本地已有 | 列表页 10 列表格（固定列 + 分页） | 复用 ✓ |
| `PerformanceListToolbar` | 本地已有 | 搜索 + 筛选 | 复用 ✓ |
| `AuthorizationManagementPanel` | 本地已有 | 总览「授权管理」卡片入口（`@view` 已绑定） | **已接通**（vs focus-people 未绑，本轮校正） |
| `UiPageHeader` | 本地已有 | 列表页 head（返回 + 标题「校准任务授权」） | 复用 ✓ |

**结论**：本地没有缺失组件——协助授权弹窗 = `PerformanceTaskDelegationDialog` 校准分支，字段与交互与飞书一致。**本轮无需新增任何组件。**

---

## 6. 差异项与建议（仅评估，不改码）

### 后端接口差异：resolve_scope / searchable/department —— ✅ 已评估收敛，不新增平行接口（2026-11-10 用户决策）

飞书两项后端接口差异经核查，本地**已用同源快照等效覆盖**，按 021「一条正式计算链、不建平行引擎」原则判定不新增接口：

1. **`POST /review/adjust/authorization/resolve_scope`（后端权威算范围）** —— 本地前端 `filteredTasks`（[PerformanceTaskDelegationDialog.vue:106-115](hr-portal/frontend/src/components/performance/PerformanceTaskDelegationDialog.vue#L106-L115)）纯前端过滤，但过滤依据的 `department_path`/`direct_supervisor_employee_no` **全部来自后端列表接口下发的同一份成员快照**（[projects_router.py:4139](hr-portal/backend/app/performance/projects_router.py#L4139)）；提交时后端用同一份数据做权威校验（`_task_recipient_scope` + `_organization_in_scope`，[projects_router.py:3598-3603](hr-portal/backend/app/performance/projects_router.py#L3598-L3603)）。前端过滤结果与后端校验结果必然一致——无「前端算出而后端不认」的缺口；候选成员也已走后端权威过滤（`delegationCandidates`，含 scope + restrict_subordinates）。
2. **`POST /review/adjust/authorization/searchable/department`（部门候选源）** —— 本地 `departmentOptions` = 任务快照 `department_path` 去重（[PerformanceTaskDelegationDialog.vue:77](hr-portal/frontend/src/components/performance/PerformanceTaskDelegationDialog.vue#L77)），与飞书「按 adjust_task_id 限定部门」语义一致；本地一行多任务取并集（分组级粒度既有设计），扁平多选 + 前缀匹配（选子部门=选整棵子树）功能等效于飞书树形。

**结论**：新增这两个接口 = 在已部署生产链路旁新建平行计算链，无功能增量。**不实施**（2026-11-10 用户确认）。

### 已确认差异（建议后续收敛，按 021 整合原则直接改原组件，不建平行壳）

1. **顶部 banner 起止时间动态化**（`ProjectCalibrationAuthorization.vue` `info-banner`）—— **✅ 已实施（2026-11-10）**
   - 飞书：`...本阶段起止时间：{startTime} – {endTime}`（本周期校准阶段窗口）
   - 本地：`...校准任务阶段时间以当前周期流程配置为准。`
   - 实施：`calibrationAuthorization` 后端聚合校准阶段 `start_at/end_at`（`calibration_phase_window`，取所有校准任务所属 phase 窗口的并集），前端 banner 动态渲染 `本阶段起止时间：{start}（GMT+8） – {end}（GMT+8）`。影响面：`projects_router.py` 响应（新增 `cycle_name`/`start_at`/`end_at`）+ 该页 `info-banner`。后端测试 95 passed、vue-tsc 干净。

2. **placeholder 文案对齐**（`PerformanceTaskDelegationDialog.vue` 校准分支）
   - 飞书：`请选择被授权人`；本地 `搜索成员`（与飞书列表页搜索框 placeholder 相同，但弹窗内应为「请选择被授权人」）。
   - 建议：校准分支 `placeholder="请选择被授权人"`，`aria-label="选择授权接收人"` 不变。**未实施**（本轮范围仅 D2/D3；文案差异低影响，列入后续收敛）。

3. **NONE 分布规则可用性** —— **✅ 已实施（2026-11-10，业务已决策）**
   - 飞书：`无需满足分布规则` 可选；原本地：禁用 + `info` 提示后端拒绝。
   - 决策（用户确认）：对照飞书放开 NONE；后端保留**强制分布开关开启时**的 409 拦截（`CALIBRATION_DISTRIBUTION_AUTHORIZATION_UNSUPPORTED`），即开关关闭时可正常选 NONE 授权，开关开启时选 NONE 仍被拒——与后端既有配置语义一致。
   - 实施：前端移除 NONE 的 `disabled/info`；后端删除无条件 422 `CALIBRATION_DISTRIBUTION_OVERRIDE_UNSUPPORTED`，并把 409 加上 `distribution_mode == "NONE"` 条件（原实现无该条件，强制分布开启时会误拒所有校准授权，已修正）。

4. **「沿用此任务的分布规则」提示符 + 真实规则弹窗** —— **✅ 已实施（2026-11-10，用户新增需求）**
   - 飞书：「沿用此任务的分布规则」radio 后有提示符，hover 展示该任务**当前生效的真实分布规则**（非固定文案）。
   - 用户决策（三问确认）：交互 = hover tooltip（复用全局 `PerformanceInfoPopover`）；数据 = 后端随列表下发；口径 = 按 phase/scope 解析生效规则。
   - 实施：
     - 后端 `calibration_service.py` 新增 `distribution_summary(flow, node, phase_id, assessment_names)`：取节点级 `calibration.distribution`，phase 级 `distribution_rules` 覆盖（按 phase_id），格式化 `lines`（评估项名 + 适用人数 + 各等级强制/建议条件 + 取整方式）。评估项名映射来自项目模板 workflow 的 `distribution_assessment_options`（`projects_router.py` 批量加载，按 `project.settings.template_id`）。
     - 前端：`ProjectCalibrationAuthorization.vue` 把行的 `distribution_info.lines` 经 `distributionLines` 传给弹窗；`PerformanceTaskDelegationDialog.vue` 校准分支 INHERIT option 设 `showInfo + info`，`PerformanceRadioGroup` 自动渲染 `PerformanceInfoPopover` hover tooltip。
   - 边界：无 rules 时提示「该任务未配置分布规则」；`force_distribution_enabled=false` 时 NONE 可自由选择。
   - 测试：新增 `test_distribution_summary_prefers_phase_level_rules_over_node_level` + `test_distribution_summary_uses_assessment_names_when_provided`；校准/分布相关后端 98 passed、vue-tsc 干净。

### 待确认项（需真实抓包/交互确认，本轮未触发）

- **`submit`/`resolve_scope`/`revoke` 精确字段名与响应结构**：弹窗 UI 是懒加载 chunk，REA 无法从静态证据取源码（CDN 域被策略过滤），提交契约由 DOM+本地逆推。确认方式：后续打开弹窗 + 选中范围触发 `resolve_scope` 请求，或 REA scenario 捕获提交（需用户在非提交态下操作，如仅选择范围不点确定）。
- **飞书列表页列宽像素**：弹窗遮挡 + 未滚动，列宽未实测。本地列宽 `[224,144,180,144,176,144,168,180,180,180]`。需关弹窗后滚动截图确认。
- **每行「协助授权」是否只对 `allow_authorize && task_ids.length` 可点**：本地有该守卫；飞书 9 行全部可点 `协助授权`（其中 1 行同时 `撤销授权` 可点），但部分行授权人非当前用户。飞书是否对「非管理范围行」disable 待交互确认。

---

## 7. 本轮不做事项与影响面

### 不做事项（明确排除）
- **不新增组件**：本地弹窗组件已覆盖飞书全部字段，无需新建。
- **不改后端接口路径**：本地 `/performance/project-management/calibration-authorization` 是已部署生产契约，不迁移到 `/review/adjust/*`（021 原则：不建平行执行链；能力对齐在语义层而非路径层）。
- **不新增后端平行接口**：飞书 `resolve_scope` / `searchable/department` 两项本地已用同源快照等效覆盖（前端过滤 = 后端提交时权威校验，结果必然一致）；按 021 一条计算链原则不实施（2026-11-10 用户决策，见 §6）。
- **不触发真实授权操作**：实施轮零提交、零授权、零撤销；验证为开发环境测试 + 类型检查。
- **NONE 分布规则已实施**（业务决策放开）；强制分布开关开启时的 409 保留，语义与后端既有配置一致。
- **placeholder 文案未实施**（低影响，后续收敛）。
- **不做记录页（`AdjustManagementAuthorizationRecordsPage`）REA**：本轮目标是协助授权弹窗；记录页差异另轮。

### 影响面总览
- 前端：`ProjectCalibrationAuthorization.vue`（banner 动态时间）、`PerformanceTaskDelegationDialog.vue`（校准分支 placeholder 文案）。
- 后端：`projects_router.py` `project_management_calibration_authorization`（响应补 `start_at/end_at`）。
- 测试：`AuthorizationManagementPanel.spec.ts`、`ProjectManagement.spec.ts`（如改 banner 需补断言）。
- 生产边界：零生产操作；如需实施沿用开发推送发布流程，禁止生产现场补丁。

---

*附：证据文件 `rea-webpage-scripts.json`（records[0] scripts 98 项含源码）、`mcp-rea-inspect_web_page-1794283703363.txt`（a11y 928 节点）、`shot_adjust_authorization.png`（1554×969 全页截图，含弹窗）。接口签名均为 chunk 源码实采，非推断；submit 载荷字段为 DOM+本地逆推（§6 待确认）。*
