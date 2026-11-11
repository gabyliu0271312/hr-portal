# REA 成员列表「授权他人处理 / 转交他人处理」弹窗 — 完整评估开发报告

> 逆向对象：飞书绩效「项目管理 → 成员列表 → 勾选成员 → 授权他人处理 / 转交他人处理」弹窗
> REA 目标：`https://idreamsky.feishu.cn/perf/management/v2/7702053437998894368/7340285661313974274/all-projects/members`
> 方法：CDP 9222 被动抓取 + 静态源码（98 个脚本全量 included）+ 证据包导出本地解析
> 评估基线：本地最新一轮优化后代码（`work/authorization-transfer-20261109`）
> 日期：2026-11-09 ｜ 历史采集评估；修复跟踪见 PM-001-T11
>
> **2026-11-09 复核纠正（优先于以下历史正文）**：`no_origin_reviewer_users` 是缺少原执行人的被评估人及环节集合，不是接收人候选；授权提交与转交提交载荷不同，`fe_hook_seg.txt` 不可作为授权通用契约。目标角色来自权限响应动态聚合，单人转交存在多原执行人选择。当前本地已有空处理人提示、同项目批量候选、幂等键、记录页跳转及 delegation token，正文所列“未实现／未提交”已过期；现阶段修复的是确认策略、角色覆盖、原执行人选择、幂等生命周期与记录定位，而非重复建设已有接口。单个批量 HTTP 请求不证明目标后端事务原子性。BPM 与单请求批量写重构仍排除。本地修复与实际验收结果以 [PM-001-T11](../features/PM-001-role-and-authorization/atomic-tasks.md) 为准，不能据本历史报告声称生产已完成。

---

## 1. 采集目标与证据链

| 项 | 值 |
|---|---|
| 测试账号 | cynthia.lin（林少娜），稳定人员 ID `6733065961970468363` |
| 关联稳定 ID | alice.xiao `6733065927262635534`、rita.tang `6733065927262406158`、gaby `6733065964654462476` |
| 周期 | semester `7702053437998894368` |
| 角色 roleId | manager `7340285661313974274`、HRBP `7340285661267951618` |
| 证据包 | `hr-portal/.tmp/rea-webpage-scripts.json`（records[0] → scripts.items 共 98 个脚本） |
| 弹窗宿主 chunk | idx 10 = 2534（`q` 组件 188928-191920 区间） |
| 授权/转交 API 集合 | chunk idx 21 = 6618 → 模块 24817（`m24817_seg.txt` 全量清单） |
| 提交 hook 链 | `fe_hook_seg.txt`（单人 `pe.gR`/多人 `pe._Q`；单人转交 `pe.bL`/多人 `pe.pu`） |
| 结构证据 | `extract_authz_struct.py` 输出（no_origin_reviewer_users、permissions 元素、stage_ids、uniqId、initialValues） |

**核心结论（一句话）**：目标弹窗是「多角色并行 + 环节勾选 + 单/多人双路径 + BPM 灰度未开（直接提交）」的授权/转交体系；本地已实现其中大部分业务语义（失权/保留、重复拦截、越权校验、通知区分），主要差距在 **多人批量路径、无原处理人显式分支、灰度审批开关结构** 三项，以及新组件 `PerformanceDelegationStages` 尚未 token 化与提交。

---

## 2. 目标弹窗接口清单（模块 24817）

### 2.1 授权链路

| # | 接口 | 说明 | 备注 |
|---|---|---|---|
| A1 | `POST /review/authorization_permissions` | 授权候选权限/环节拉取 | 弹窗打开即调，返回可授权角色+环节+人员 |
| A2 | `POST /review/authorization` | **单人授权提交** | 走 `pe.gR`；提交载荷见 2.3 |
| A3 | `POST /review/authorization_list` | 授权记录列表查询 | 成功跳转记录页后展示 |
| A4 | `DELETE /review/authorization/{id}` | 撤销授权 | 记录页操作 |
| A5 | `POST /review/authorization/retry` | 授权失败重试 | 兜底路径 |
| A6 | `GET /review/authorization/approval_status` | 审批状态查询 | BPM 灰度开启时轮询 |
| A7 | `GET /review/authorization/stage_tag` | 环节标记（可再授权等） | 校准场景 |
| A8 | `POST /review/authorization/no_origin_reviewer` | **无原处理人**授权 | 弹窗「无原处理人」分支，响应含 `no_origin_reviewer_users` 名单（后端给出可授权人） |

### 2.2 转交链路

| # | 接口 | 说明 | 备注 |
|---|---|---|---|
| T1 | `POST /review/transfer/get_transfer_permissions` | 单人转交候选权限 | 对应 A1 |
| T2 | `POST /review/transfer/transfer_permissions` | **单人转交** | 走 `pe.bL` |
| T3 | `POST /review/transfer/batch_get_transfer_permissions` | 多人转交候选权限 | 一次取全部成员候选 |
| T4 | `POST /review/transfer/batch_transfer_permissions` | **多人批量转交** | 走 `pe.pu`，单请求批量 |
| T5 | `POST /review/transfer/transfer_permission_list` | 转交记录列表 | 对应 A3 |

### 2.3 提交载荷（`d.current` 结构，fe_hook_seg.txt）

```ts
d.current = {
  toId: string,              // 接收人 ID（cynthia.lin → 6733065961970468363）
  revieweeUserIds: string[], // 被评估人 ID 数组（多人走批量）
  semesterId: string,        // 7702053437998894368
  role: string,              // 执行角色（值域见 3.1）
  roleId: string,            // 7340285661313974274 / 7340285661267951618
  transferStages: [],        // 环节集合
  notifyOriginReviewer: boolean,
  approval_info: {           // BPM 预留（灰度 false 时为空串提交，直接落库）
    preview_id: "", preview_node_config: "", start_form_data: ""
  },
}
```

### 2.4 no_origin_reviewer 响应结构（extract_authz_struct.py）

```
no_origin_reviewer_users  → 可授权人名单（后端算好返回）
stage_ids                 → 环节 ID 列表
uniqId / permissionIds    → 授权唯一标识与权限点集合
initialValues             → 弹窗初始值（含角色、环节预选）
canTransfer / excutorsCount → 可转交标记 / 执行人计数
```

> 注：以上均为飞书前端字段名实采；本地后端字段名不同（见 §4 映射）。

---

## 3. 目标交互 / 布局细节（像素级要点）

1. **被评估人置顶**：弹窗首行即被评估人（多人时为头像+姓名 tag 列表），随后才是接收人选择、环节区、开关。本地 `reviewee-tags` 已对齐此顺序。
2. **执行角色三选**：直属上级 / HRBP / 指定人员；**右侧环节列表随所选角色切换且不重复出现**（同角色多任务的同名环节去重合并）。本地 `PerformanceDelegationStages` 双栏结构即为此而建。
3. **提示文案区分语义**：
   - 转交：原评估人**失去任务权限**；
   - 授权：原评估人在**截止时间之前**仍有操作权限。
4. **二次确认**：点击确定后进入确认弹窗（HRBP 角色场景的确认弹窗与其他不同）；确认后才提交。本地 `openConfirmation()` + `PerformanceConfirmDialog(appearance="delegation")` 已对齐。
5. **稳定响应 = 提交接口直接返回**：当前灰度 `perf.bpm.perf_transfer_task`、`perf.bpm.perf_authorization_task` 均为 false，故 `P ? bpm_preview : 直接提交` 走直接提交分支——**无审批流、无中间态**，提交即落库返回。
6. **成功后跳转**：`/perf/review/:semesterId/:stageId/adjust-authorization-record/:taskId` 授权记录页（A3/T5 渲染）；本地由 `project_management_authorization_records`（projects_router.py:3790）支撑，且增加 `can_revoke` 撤销能力。

---

## 4. 与本地最新代码的逐项差异矩阵

> 本地基线：`PerformanceTaskDelegationDialog.vue`（166 行，本轮重读）+ `PerformanceDelegationStages.vue` + `PerformanceConfirmDialog.vue` delegation 变体 + `projects_router.py`（_member_task_options / create_task_delegation / _task_delegations 等）+ `api/performance.ts` + `ProjectManagement.vue`。

| 维度 | 飞书目标 | 本地最新代码 | 差异判定 |
|---|---|---|---|
| 提交粒度 | 多人走 `batch_transfer_permissions` / 多人授权单请求批量 | `submit()` 循环逐 task 调 `authorizeTask`，部分失败置 `uncertain` 状态提示勿重复提交 | **差异**：目标批量一次性；本地逐条但带部分成功提示（行为更保守，安全上可接受） |
| 无原处理人 | 显式 `no_origin_reviewer` 分支 + `not_auth_no_origin_reviewer_user` 文案 + 后端给 `no_origin_reviewer_users` 候选 | 无显式分支；依赖 `_task_recipient_scope`（3302）越权校验兜底；`_task_delegations` 仅取 `ACTIVE` | **差异**：本地无「无原处理人」UI/后端显式路径，建议补 |
| 审批流 | BPM 灰度 `perf.bpm.*`（false 时直接提交）；`approval_info` 三字段 | 无审批概念，直接提交 | **判定一致**（灰度 false 即直接提交，本地与目标线上行为相同）；灰度开启时能力缺失，暂不做 |
| 角色模型 | `role + roleId` 随载荷传，多角色并行候选 | 角色三选（`DIRECT_SUPERVISOR`/`HRBP`/`SPECIFIED_PERSON`），一次只激活一个 | **语义一致**：目标三选也即单角色提交；本地 role 由 executor_config 推断（_member_task_options:1633） |
| 环节选择 | `transferStages` 环节集合，右侧随角色切换、去重合并 | `visibleStages` 按 `role_key` 过滤 + `stageKey(role_key:stage_id)` 去重；`selectRole` 切换清空已选 | **一致** |
| 权限变化 | 转交后原评估人 `transferred` 失权；授权保留 | `_task_handlers`/`_task_edit_allowed` 用 `effective_handlers`：TRANSFER 全 `REPLACED` 失权、AUTHORIZE 保留 + `read_only` 控制 | **一致且更强**（本地落库状态可追溯） |
| 重复提交 | 服务端幂等拦截（语义一致） | `TASK_ALREADY_AUTHORIZED` 409（AUTHORIZE 重复）；TRANSFER 时仅接收人可再转 | **一致** |
| 越权接收人 | 服务端校验（403） | `_task_recipient_scope` 越权 → `TASK_AUTHORIZATION_RECIPIENT_OUTSIDE_SCOPE` 403；`_authorize_task_delegation` 校验节点类型与完成态 | **一致** |
| 通知 | `notifyOriginReviewer` 布尔 | `notify_original` + 通知文案区分转交/授权（`title_template`/`content_template`）+ `notification_status` 三态 | **一致且细化** |
| 再授权 | `allow_reauthorize` 语义 | 校准场景 `allow_reauthorize` 传后端；`parent_authorization_id` 二次授权链 | **一致** |
| 记录查询 | 成功跳转记录页（A3/T5） | `GET /project-management/authorization-records`（3790-3852）返回 authorization_records/transfer_records + `can_revoke` | **一致且增强**（本地可撤销） |
| 校准授权 | 授权范围内部分人员 + 分布规则 | 校准分支：`scope_mode PARTIAL/ALL`、`scope_kind DIRECT_SUBORDINATES/DEPARTMENT/PEOPLE`、`distribution_mode INHERIT`（NONE 禁用，后端拒绝）、只读 `readonly-notice` | **本地独有增强**，目标无对应采集 |
| 接收人候选 | 权限接口返回候选 + 弹窗搜索 | `delegationCandidates` 逐任务拉取后 `lists[0].filter(lists.every(...))` 交集 | **差异**：目标一次接口批量返回；本地多任务时 N 次请求取交集，N 大时有性能面，但正确性一致 |

**本地已具备、目标未采集到的独有项**：撤销授权（revoke）、校准授权全链路、`uncertain` 部分失败提示、`readonly-notice` 只读授权、越权 `403` 细分错误码。

---

## 5. 组件提炼 / 复用分析

| 组件 | 归属 | 复用点 | 状态 |
|---|---|---|---|
| `PerformanceDelegationStages.vue` | 新增（45 行） | 双栏「按执行角色选择 + 环节勾选」：左 180px 角色按钮（`aria-pressed` 选中态）、右环节 `PerformanceCheckbox`、空态「暂无可处理的任务」、`max-height:240px` 滚动 | **未提交**；选中色 `rgba(20,86,240,.15)` 硬编码，未走 tokens |
| `PerformanceConfirmDialog.vue` delegation 变体 | 复用扩展（+6 行） | 345-350：宽版宽度 token、`overlay:has(...)` 深色遮罩 + `z-index+2`、`header min-height:0`、body 缩进 40px 次级色、footer 24px、按钮字重 400 | 已改动（工作区） |
| `PerformanceDialogShell.vue` | 复用 | 弹窗壳 + `locked` 加载态 + dialog-class | 未改动 |
| `PerformanceSearchSelect` | 复用 | 接收人搜索选择（含 `subLabel` 部门路径） | 未改动 |
| `PerformanceMemberIdentity` | 复用 | 被评估人 tag 置顶展示 | 未改动 |
| `PerformancePromptNotice` | 复用 | 环节区 warning 提示条 | 未改动 |
| `PerformanceCheckbox` / `UiSwitch` / `UiButton` / `PerformanceRadioGroup` | 复用 | 环节勾选、通知开关、footer 按钮、校准范围单选 | 未改动 |
| tokens.css | — | **无 delegation 相关 token**：180px/192px/240px 尺寸、`rgba(20,86,240,.15)` 选中底色均为硬编码 | 待补 |

**结论**：本轮优化复用面健康（壳、输入、确认弹窗均走全局组件），唯一新增组件 `PerformanceDelegationStages` 处于「功能完成、样式未 token 化、未提交」状态——是下一轮落库前的必收尾项。

---

## 6. 后端差异与安全边界

| 主题 | 目标（飞书） | 本地 | 评估 |
|---|---|---|---|
| 批量 | `batch_*` 单请求 | 循环逐条 + `uncertain` 部分失败提示 | 目标一次事务性更强；本地放弃批量换取「部分成功可核对」，两者安全取向不同。**建议**：短期保留逐条（已防重复提交），长期评估 `batch_*` 接口 + 幂等键 |
| 无原处理人 | 显式接口 + 候选名单下发 | 无显式路径，`_task_recipient_scope` 兜底 | **建议补显式分支**：`not_auth_no_origin_reviewer_user` 文案 + 候选名单，避免「无原处理人」场景用户茫然 |
| 越权 | 服务端 403 | `TASK_AUTHORIZATION_RECIPIENT_OUTSIDE_SCOPE` 403 + 节点类型/完成态拦截 | 一致；本地错误码更细分 |
| 重复 | 幂等 | 409 `TASK_ALREADY_AUTHORIZED` | 一致 |
| 权限变化可追溯 | `transferred` 标记 | 落库 `status=REPLACED/ACTIVE` + `parent_authorization_id` 链 + audit events | 本地更强 |
| 数据面 | — | `extra="forbid"` 载荷白名单、`scope_mode/scope_kind/distribution_mode` 字面量枚举 | 本地更强（OWASP 输入校验） |

---

## 7. 开发建议（分优先级）+ 不做事项 + 影响面

### P0（建议下轮 MVP 必做）
1. **`PerformanceDelegationStages` token 化 + 提交**：将 `180px/192px/240px`、选中底色 `rgba(20,86,240,.15)`、选中字色提为 tokens（对齐实采风格，参见 matrix-count-tier-real-colors 惯例）；随后提交该新组件。影响面：仅弹窗内，无外部依赖。
2. **无原处理人显式分支**：后端在 `task_delegation_candidates` 无来源处理人时返回可授权候选（对齐目标 `no_origin_reviewer_users` 语义），前端文案「无原处理人」提示。影响面：`_task_recipient_scope` 调用点 + 弹窗候选逻辑。

### P1（体验/一致性）
3. **提交幂等加固**：`create_task_delegation` 增加请求幂等键或保留现有 409 语义并确认前端 `uncertain` 重开刷新路径不再产生重复记录（`@refresh` 已触发）。
4. **多人性能面**：`delegationCandidates` 多任务逐次拉取改单接口聚合（对齐 `batch_get_transfer_permissions`），N>10 时显著减少请求。影响面：`api/performance.ts` + 弹窗 `watch` 交集逻辑。

### P2（能力对齐，按需）
5. **授权记录页跳转对齐**：目标成功后跳专属记录页；本地目前停留在名单刷新，可评估跳转 `authorization-records` 并定位到刚提交记录。

### 不做事项（明确排除）
- **BPM 审批链**：目标灰度 `perf.bpm.perf_transfer_task`/`perf.bpm.perf_authorization_task` 均 false，线上即直接提交；本地一致，审批留待灰度开启后再对齐（届时需 `approval_info` 三字段 + `approval_status` 轮询）。
- **批量接口重构**：不推翻当前逐条 + 部分成功提示的闭环（021 闭环原则：先交付可验收闭环）。
- **not_auth_no_origin_reviewer_user 文案精细化**：与 P0-2 合并，不单独立项。
- 不新增并行执行链、不做兼容壳（021 整合原则）。

### 影响面总览
- 前端：`PerformanceTaskDelegationDialog.vue`、`PerformanceDelegationStages.vue`（token）、`api/performance.ts`（可选聚合接口）、tokens.css（新增 token）。
- 后端：`projects_router.py`（无原处理人分支）、`project_service.py`（如需候选聚合）。
- 测试：`PerformanceProjectSettingsPage.spec.ts`、`test_performance_projects.py` 已随本轮改动更新，P0-2 需补对应用例。
- 生产边界：本轮零生产操作；所有改动沿用开发推送发布流程，禁止生产现场补丁。

---

*附：证据文件 `m24817_seg.txt` / `fe_hook_seg.txt` / `rea-webpage-scripts.json`（.tmp 目录，不入库）；报告结论均为代码级实采，非推断。*
