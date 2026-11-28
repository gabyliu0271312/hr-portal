# REA 授权配置「按规则授权 · 添加规则」— DOM 与接口提炼与组件复用评估

> 逆向对象：飞书绩效后台「权限管理 → 授权配置 → 按规则授权 → 添加规则」
> REA 目标：`https://idreamsky.feishu.cn/perf/admin/permission/auth/rule/list?currentPage=1&pageSize=10`
> 方法：CDP 9222 playwright 驱动（列表页 DOM/接口 + 创建页 `/auth/rule/create` 完整表单 + 保存/删除真实接口抓包）
> 评估基线：本地 `PerformanceAuthorizationConfiguration.vue` + `PerformanceAuthorizationDialog.vue` + `role_configuration_router.py`（PM-001-T06 后续范围）
> 日期：2026-11-28 ｜ 按用户确认的“范围只决定谁获授角色，角色权限沿用原配置”口径，已接通规则授权消费；待真实 PostgreSQL 验收，不标记生产完成。
>
> 最终核验：规则与身份上下文定向49项通过；合并原用户授权回归79 passed / 3 failed，三项为系统角色可编辑预期与当前接口400拒绝冲突；未放宽系统角色保护。项目scope/navigation/opening回归156 passed / 2 skipped。身份切换/催办/规则当次197 passed / 1 failed（PostgreSQL连接拒绝，后续又新增5项拒绝场景测试）。前端13 passed、vue-tsc通过、三处Vue UI规范0违规、build通过（44.53s）。本地Vite真实组件+隔离API fixture已验证选项→保存→名单→编辑重开→CSV下载→删除空态，pageErrors=[]，不是PG联调。独立PNG在 ../ui-blueprints/PM-001-T06-rule-{empty,form,saved}-implemented-20261128.png，已查看。0330迁移离线DDL通过，当前唯一head为并行0331（down=0330）；Docker不可连接，真实PG升降级、真实后端联调、部署未执行。sequenceLevel权威映射仍未确认，继续拒绝，不用猜测映射冒充支持。
>
> 证据：`rea-extract/out/auth-rule/*`（DOM 快照 45 个 + 接口 JSON 8 组 + 截图 30 张）

---

## 1. 采集目标与证据链

| 项 | 值 |
|---|---|
| 列表页 URL | `perf/admin/permission/auth/rule/list?currentPage=1&pageSize=10` |
| 添加规则 | 点击后**跳转独立路由** `/perf/admin/permission/auth/rule/create`（非弹窗叠加） |
| 编辑规则 | `/auth/rule/edit/{record_id}?roleId={role_id}`（独立路由，含「编辑授权」标题） |
| 保存按钮 | 创建/编辑页右上角顶部栏（filled 蓝 #1456F0），非页内底部 |
| 本地对应页 | `PerformanceAuthorizationConfiguration.vue`（双 Tab）+ `PerformanceAuthorizationDialog.vue`（弹窗壳） |
| 接口簇 | `/permission/auth_records/*`（list/create/delete）+ `/permission/resolve-scope` + `/user/scopes/resolve-scope/meta` + `/review/realtime/department/tree` + `/review/custom_review_roles` + `/user/query` |
| 权限点 | `performance.authorization.manage`（本地）/ 飞书 `auth_gate` release gate |

**核心结论（一句话）**：飞书「按规则授权」以**规则（用户范围条件组 `or_scope` + 授权角色 `object_rule_group`）**为授权对象；范围条件组用飞书 `people-material-rule-condition` 系列组件（字段 + 运算符 + 值三列、组内「且」组间「或」、组头「符合条件的员工，共计 N 人」实时计数）；保存走 `POST /permission/auth_records/create`，列表走 `POST /permission/auth_records/list`（`auth_type:2`）。本地 `PerformanceAudienceRuleEditor`（scopeMode）已有同构条件组结构，是弹窗 body 的直接复用点；不能据此宣称整页已像素级验收。

---

## 2. 飞书侧接口清单（实采）

### 2.1 列表 / 保存 / 删除（`/permission/auth_records/*`）

| # | 接口 | 方法与参数 | 说明 |
|---|---|---|---|
| R1 | `POST permission/auth_records/list` | `{"filter":{"auth_type":2,"role_name":""},"page_size":10,"current_page":0}` → `{count, auth_records[]}` | 按规则授权列表（`auth_type:2`=规则授权） |
| R2 | `POST permission/auth_records/create` | `{"subject_rule":{"auth_type":2,"or_scope":[[{"key":"department","condition":"eq","value":[...],"__id__":"condition_xxx"}]]},"object_rule_group":[{"role_id":"7713172314971442190","object_rules":[]}]}` | **保存规则**（新建=POST，返回 `{code:0}`） |
| R3 | `POST permission/auth_records/delete/{record_id}` | `{"role_id":"..."}` | 删除规则（按 record_id + role_id） |

列表响应行结构（实采）：

```json
{
  "record_id": "7713174546014030777",
  "modify_time": 1795863394000,
  "subject_rule": {"auth_type": 2, "user_id": "", "or_scope": [[{"key": "department", "condition": "eq", "value": ["6732646893589120515", "7480149575941685252"], "fe_extra": ""}]]},
  "object_rule_group": [{"role_name": {"zh-CN": "测试管理角色", "en-US": ""}, "role_id": "7713172314971442190", "record_id": "7713174546014030777", "auth_type": 2, "object_rules": []}],
  "modify_user_id": "6733065964654462476"
}
```

> 列表「用户范围」列显示**值已解析的部门/人员标签**（如 `设计组`、`gaby.liu刘琦`、`+0` 折叠），由前端用当前或 scope 树把 value 映射回 label；后端行只存 id 级 `or_scope`。

### 2.2 弹窗可选项（条件字段 meta / 部门树 / 角色 / 人员）

| # | 接口 | 方法与参数 | 说明 |
|---|---|---|---|
| R4 | `GET user/scopes/resolve-scope/meta?scene=all` | GET → `[{key, operators, invisible}]` | **范围字段 meta**：字段 key + 运算符集合（见 §2.3） |
| R5 | `GET review/realtime/department/tree` | GET → 扁平 `[{id, parentId, i18nName:{zh-CN}, children, disable, deleted}]` | 部门树（「部门」字段值源） |
| R6 | `POST permission/roles/list` 与 `GET review/custom_review_roles?keyword=&enable_status=1&offset=0&limit=100` | 两条请求均实采，完整管理角色响应未保留 | 下拉内管理角色可点、评估角色disabled是DOM实测；不能将评估角色接口单独认定为管理角色来源。本地独立查询启用非系统MANAGEMENT角色。 |
| R7 | `POST user/query` | `{"keyword":"刘琦","excludeDismissed":true}` → `[{userId, i18nName, department[], directLeaderId, ...}]` | **员工搜索**（直属上级/员工/上级字段的值源） |
| R8 | `POST permission/resolve-scope?task_id=-1` | `{"or_scope":[[{key,condition,value,__id__}]],"resolve_type":1}` → `{task_id}` → 轮询 `?task_id=...` → `{count, or_scopes:[{user_ids, count}], user_ids}` | **范围计数**：「符合条件的员工，共计 N 人」 |
| R9 | `POST permission/resolve-scope`（值变后二次调用，value 累计） | 同上 | 组头实时计数 |
| R10 | `GET user/custom_org_type/list` / `user/tenant/business_line_name` / `user/custom_settings` / `user/self_define_mappings` | GET | 平台辅助（本地不落库） |
| R11 | `GET review/business_line_release/0` / `user/position-switch` / `review/release` | GET | release gate / 位置开关（本地以 `review/release` feature 位为准） |
| R12 | `POST review/verify_mfa` | `{"scope":"performancex_export"}` → MFA 验证弹窗 | **导出前置**：飞书导出触发平台级 MFA 身份验证（手机号/邮箱验证码），本地不模拟 |

### 2.3 范围字段 meta（R4 实采，`scene=all`）

| key | 中文 | operators | 值源 |
|---|---|---|---|
| `department` | 部门 | `eq`,`neq` | 部门树 |
| `employee` | 员工 | `eq`,`neq` | 人员搜索 |
| `superior` | 上级 | `eq`,`neq` | 人员搜索 |
| `directLeader` | 直属上级 | `eq`,`neq` | 人员搜索 |
| `category` | 序列 | `eq`,`neq` | 序列列表 |
| `level` | 职级 | `eq`,`neq` | 职级列表 |
| `sequenceLevel` | 序列职级 | `eq`,`neq` | 序列职级树 |
| `joinDate` | 入职时间 | `lt`,`ge`,`gt`,`le` | 日期范围 |
| `employeeType` | 人员类型 | `eq`,`neq` | 人员类型 |

> 弹窗内字段下拉展开顺序实测：`部门 员工 上级 直属上级 序列 职级 序列职级 入职时间 人员类型`；**默认字段 = 直属上级**（`directLeader`），运算符默认「包含」`eq`，值下拉为「搜索成员」`emp-select`（人员搜索）。

---

## 3. 页面 DOM 结构（实采坐标，3440 宽视口）

### 3.1 列表页（`rule/list`）

- 顶部标题「授权配置」+ `PerformanceLineTabs` 双 Tab（指定用户授权 / 按规则授权）
- 工具栏（右侧）：**「添加规则」**（filled 蓝，x280 y186 80×32）+ **「导出」**（outlined 灰白底，x3320 y186 80×32，带下载 SVG）
  - 搜索框「通过角色名称搜索」（x3104 y191，右侧 tab 内）
- 表格 5 列：**用户范围 / 授权角色 / 更新人 / 最近更新时间 / 操作**；用户范围列显示条件与所选标签
  - 用户范围列实采：`设计组`（部门标签）、`gaby.liu刘琦`（人员标签）、`+0`（溢出折叠 tag）
  - 操作列：`编辑`（x3160）、`删除`（x3204）text-link 按钮
- 分页：`10 条/页` select + 页码（底部）
- 空态：**「暂无数据」+ 空态图（250×125 蓝色图表 SVG）**；删除后实测恢复空态 `暂无数据`

### 3.2 创建页（`rule/create`，独立路由）

- 顶部栏：`返回`（左侧）/ `添加授权`（标题）/ `保存`（右上，filled 蓝 80×32，唯一提交）
- body 主卡 `!bg-white !rounded-[8px] !p-10`（800 宽）：
  - **「用户范围 *」** 标签 + **「符合条件的员工，共计 N 人」**（`people-material-rule-condition-head`，初始 0）
  - **「范围 1」** 组卡（`people-material-rule-condition-condition-group`）：
    - 组头「范围 1 同时满足以下条件：N 人」
    - 条件行三列：**字段 select（128px）→ 运算符 select（88px）→ 值 select（自适应 ≥444px）**
    - 默认行：`直属上级 [eq] 搜索成员[必填]`
    - 「添加条件」text 按钮（组内加行，组内条件「且」rail）
    - 「添加条件组」text 按钮（组间加组，组间「或」分隔行 `condition-group__separator`）
  - **「授权角色 *」** 标签 + select（placeholder「请选择授权角色」必填）；单次选中管理角色已验证，多选能力未验证。本地使用单选角色，不静默丢弃额外角色。
- 校验：值下拉必填、角色必填；提交拦截 toast「必填 / 请选择」

### 3.3 编辑页（`rule/edit/{record_id}?roleId=`）

- 与创建页同构；标题「编辑授权」，表单预填范围条件与已选角色。飞书编辑提交请求未捕获，不能断言与create相同；本地编辑使用 `PUT /performance/permission-settings/auth-rules/{id}`，已有接口测试。

---

## 4. 组件复用评估（用户 6 项需求逐条）

### 4.1 添加规则按钮 + 同插槽导出按钮（需求 1）

| 飞书 | 本地复用 | 结论 |
|---|---|---|
| 「添加规则」filled 蓝按钮 | `PerformanceCreateButton`（label=添加规则） | ✅ 现页面已用，无需改 |
| 「导出」outlined 带下载图标按钮 | `PerformanceExportButton`（CSV 下载，自带导出 SVG） | ✅ **需接入 rules tab**：现页面 `v-if="!isRuleTab"` 隐藏，应改为两 tab 都显示，导出列头按规则表（授权角色/更新人/最近更新时间） |

### 4.2 空态图标（需求 2）

| 飞书 | 本地复用 | 结论 |
|---|---|---|
| 空态「暂无数据」+ 250×125 图表 SVG | `MetricTemplateEmptyIllustration`（250×125 图表 SVG，与飞书同尺寸同构图） | ✅ 直接复用；`PerformanceManagementTable` empty slot 已支持注入插图 |

### 4.3 添加规则弹窗 head/body（需求 3）

| 飞书 | 本地复用 | 结论 |
|---|---|---|
| 创建页顶部栏（返回/标题/保存） | `PerformanceDialogShell`（弹窗壳：标题 + footer 保存/取消） | ✅ **本地以弹窗实现**（用户需求明确弹窗形态；飞书独立路由由平台导航承载，本地弹窗语义等价）。head 复用 DialogShell，footer 复用 `UiButton` |
| body 主卡 | `PerformanceFormItem`（label + 必填星号） | ✅ 复用 |

### 4.4 范围 / 添加条件 / 添加条件组（需求 4）

| 飞书 | 本地复用 | 结论 |
|---|---|---|
| `people-material-rule-condition` 条件组（字段/运算符/值三列，组内且、组间或、添加条件、添加条件组、组头计数） | `PerformanceAudienceRuleEditor`（`scope-mode` 形态，`PerformanceConditionLogicGroup` 组内且/组间或、`PerformanceSearchSelect` 字段与运算符、`PerformanceOrganizationSelect`/`PerformancePersonSelect`/`PerformanceSearchSelect` 值源） | ✅ **核心复用点**；现 HRBP 不可见范围弹窗已同形态落地 |
| 「符合条件的员工，共计 N 人」实时计数 | 后端 `resolve-scope` 轮询（本地 `focus-groups/resolve-scope` 已有同构）→ 前端注入组头 | ⚠️ 需新增按规则授权专用 resolve 接口（无 cycle 绑定） |
| 范围字段 meta（9 字段 + operators） | 后端新增 `auth-rules/options` 返回 `fields[]`（key/label/operators/option_source），前端 `allowed-fields` 注入 | ⚠️ 需新增接口（复用 focus-groups fields 枚举 + 平台 option 加载） |

### 4.5 授权角色真实接入（需求 5）

| 飞书 | 本地复用 | 结论 |
|---|---|---|
| 授权角色选择（管理角色可点/评估角色disabled两态） | `PerformanceSearchSelect`（单选） | ✅ 选项来自本地启用的非系统管理角色；未确认飞书多选，不推断其能力 |
| 角色禁用态（评估角色 not-allowed） | 后端按角色类型过滤：只返回可被规则授权的管理角色（本地 `_user_authorization_role_statement()` 已含 management/非系统过滤） | ✅ 后端 options 过滤 |

### 4.6 真实保存接入（需求 6）

| 飞书 | 本地复用 | 结论 |
|---|---|---|
| `POST auth_records/create`（subject_rule.or_scope + object_rule_group.role_id） | 后端新增 `POST /performance/permission-settings/auth-rules`（模型存 `or_scope` JSONB + role_id；审计走 `PerformanceAuditService`） | ⚠️ 需新增接口 + 表 |

---

## 5. 本地差异与实现方案

1. **弹窗 vs 独立路由**：飞书创建/编辑是独立路由页；本地按用户明确需求保留弹窗，规则弹窗拆入 `PerformanceAuthRuleDialog.vue`，复用 `PerformanceDialogShell` 的现有 `--performance-dialog-md-width`（840px）而非另写800px。原用户授权保持wide-width token；这不是飞书独立路由页的像素级复刻。
2. **后端新表**：`performance_auth_rules`（`id, or_scope JSONB, role_id BIGINT FK performance_roles, is_active, created/updated_at, 审计`）；迁移一个版本。
3. **后端新接口**（`role_configuration_router.py` 或新 router `auth_rules_router.py`）：
   - `GET/POST /performance/permission-settings/auth-rules`（列表按 `role_name` 搜索 + 分页）
   - `POST /performance/permission-settings/auth-rules`（创建）、`PUT .../{id}`（编辑）、`DELETE .../{id}`（删除）
   - `GET /performance/permission-settings/auth-rules/options`（fields meta + organization_tree + people + roles + 序列/职级/入职日期/人员类型选项）
   - `POST /performance/permission-settings/auth-rules/resolve-scope`（or_scope → count）
   - 人员/组织来源由 `auth_rule_service.load_rule_roster_people` 按现有物理列合同读取，复用 `build_snapshot_people` 与 `build_organization_tree` 结构化工具；不能直接复用只读基础字段的 HRBP loader，否则序列/职级/人员类型/入职日期会丢失。
4. **导出**：rules tab 显示 `PerformanceExportButton`，`load-rows` 走规则列表全量导出（列：用户范围/授权角色/更新人/最近更新时间）。
5. **空态**：`PerformanceManagementTable` empty slot 注入 `MetricTemplateEmptyIllustration` + 文案「暂无授权规则」。
6. **搜索**：rules tab 搜索「通过角色名称搜索」→ `role_name` 过滤（现搜索框 placeholder 已按 tab 区分）。

---

## 6. 待确认 / 边界

- 飞书导出触发 MFA 身份验证（`verify_mfa`），为平台级安全，**本地不模拟**，直接走 CSV 下载（`PerformanceExportButton` 现有能力）。
- 角色候选仅返回「测试管理角色」等 management 非系统角色；评估角色 disabled 由后端过滤而非前端判断。
- 本地已实现八类字段：部门、员工、上级、直属上级、职位族（本次作为序列选项）、职级、入职时间、人员类型；其物理列来源有测试。飞书第九类 `sequenceLevel`（序列职级）没有确认的权威映射，当前不开放并在后端拒绝，不把职位族/职位类/职级的任意拼接当成已确认映射。
- 计数接口（R8）为异步轮询；本地简化为一请求返回 count（焦点组 resolve-scope 已同构），不做二次轮询。
