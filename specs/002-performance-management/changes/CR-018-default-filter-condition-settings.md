# CR-018 筛选条件顺序与默认条件设置

状态：开发中，本地代码/测试/渲染验收完成；真实 PostgreSQL 迁移与部署未执行，不宣称生产完成。用户已确认筛选条件目录照搬飞书 32 个 `filter_key`，按实采 DOM 像素级还原，不允许用截图推断。

## 已确认范围与契约

- 入口：`/performance/settings/system/copy` 的「筛选设置」卡片，绩效配置管理员；权限复用 `performance.configuration.manage`。
- 仅实现筛选条件弹窗、保存、外部摘要、关闭重开与刷新回读；详情页顶部字段、部门字段搜索、管理者标准不改。
- 不实现前台筛选面板真实消费、权限过滤或筛选计算；本轮只保证配置读写与字段设置页显示一致。
- 目录：服务端固定 32 项，键与文案照搬飞书；顺序由保存数组决定。默认 7 项：`directLeader/leaders/departments/directDepartment/level/allCategories/userId`。
- 6 项不可设默认：`finalReviewScoreFilterKey`、`currentSemesterAssessmentItemComparisonFilterKey`、`inviteReviewScoreFilterKey`、`otherStageScoreFilterKey`、`historySemesterFinalScore`、`stageStatusFilterKey`。
- 前端提交 `{filter_conditions:[{filter_key, default}]}`；服务端校验键集合完整、无重复、布尔严格、不可设默认项不得为 true；文案与禁用标记由服务端目录返回，前端不保存伪造 label。
- GET/PUT `/api/v1/performance/system-settings/fields/filter-conditions`。GET 无记录时返回默认状态且不落库；PUT 单例行锁、同事务审计 `PERFORMANCE_FILTER_CONDITIONS_UPDATED`。
- 独立单例存储 `performance_filter_condition_settings`，新迁移 `0328_performance_filter_conditions`；不混入既有设置表。

## 前台筛选面板联动

- 消费入口：`PerformanceMemberFilter.vue`（项目成员列表的高级筛选面板）。每次打开面板重新读取配置；读取失败才回退旧的硬编码默认条件。
- 读取权限：`GET /filter-conditions` 放开给已登录的绩效用户；`PUT` 仍要求 `performance.configuration.manage`，写权限不变。
- 行为：按配置顺序重排字段下拉；`default=true` 的条件生成空值默认行，用户填写值并点「确定」后才参与筛选；全部取消默认则面板初始无行。
- 配置 key → 本地可筛选字段映射：`directLeader→direct_supervisor`、`hrbp→hrbp`、`departments→department_path`、`directDepartment→department`、`level→position_level`、`allCategories→job_sequence_descendants`、`directCategory→job_sequence`、`userId→name`、`joinDate→hire_date`、`employeeType→employee_type`、`activity→project_name`。
- 未映射：`leaders`（本地无独立“上级”筛选项）、`dottedLeaders`、`pdtManagerKey`、`pdtProjectKey`、`pdtCoProjectKey`、`pdtRoleKey`、`jobTitle`、`isManager`、`followGroup`、`followedUser`、`realTimeDimissionStatus`、绩效结果/环节/历史等动态项。它们仍可在后台配置，但不会出现在成员筛选面板。
- 仅接入成员高级筛选；校准筛选、授权记录筛选等不属于本次联动范围。

## UI 实测基线（飞书生产页面 DOM）

| 项目 | 实测 |
| --- | --- |
| 弹窗 | 600×1249（视口 3440×1313，上下各 32），圆角 8，无阴影，遮罩 `rgba(0,0,0,.55)` |
| 头部 | 高 72，padding `24px 56px 24px 24px`；标题 16/600/24；关闭 28×28 |
| body | padding `0 24px`，滚动条 8px，底部分隔线 `0 1px 0 rgba(31,35,41,.15)` |
| 吸顶表头 | 高 36（上 6 + 行 30）；行 30 = 22 + 下 8；文字 14/22 `#646a73`；左缩进 32；右列宽 180；文案「默认条件（N）」 |
| 行 | 544×34，padding `6px 8px`，圆角 4，背景 `#f8f9fa`，行距 5；无 hover 变色 |
| 左侧 | 手柄 16×16 `#646a73`、右边距 8、cursor grab；文案 14/22 `#1f2329`，ellipsis |
| 右侧 | 列宽 172、margin-left 16；复选框 16×16、圆角 4、行内 y+9 |
| 复选框 | 选中 `#1456f0`；未选白底 `#8f959e` 边框；禁用 `#eff0f1` 底 + `#bbbfc4` 边框 |
| 底部 | 高 56，padding `0 24px 24px`；取消/确定 80×32、间距 12、右对齐 |

## 复用与 token

- 复用 `UiDialogShell`（宽/头部/底部/关闭/遮罩全部命中）、`UiSortableList`（`gap` 自动测量）、`UiDragHandle`（仅覆盖高度 22 与右边距 8）、`PerformanceCheckbox`（`hide-label` + `checked-color="var(--ui-checkbox-checked)"`）、`UiButton`。
- 新增业务组件 `PerformanceFilterConditionRow.vue`、`PerformanceFilterConditionSettingsDialog.vue`；`Settings.vue` 接入加载、保存、回读、摘要。
- 新增 token：行背景/行距 5/纵向内边距 6/默认列 172/表头列 180/表头缩进 32/分隔线/滚动条 8。
- 未使用裸 `#hex`、`rgb()` 或裸 `px`；`check-ui-rules.mjs` 0 违规。
- 本弹窗以 `100vw` 覆盖遮罩宽度，抵消全局 `html { scrollbar-gutter: stable }` 导致的 5px 居中偏移；未改全局样式。

## 原子任务与验收

- [ ] CR-018-T01：单例存储、32 项目录校验、GET/PUT、权限/审计、迁移与专项测试。
- [ ] CR-018-T02：行/弹窗组件、页面接入、保存后回读、前端测试、UI 规则与本地真实渲染验收。
- [ ] CR-018-T03：成员高级筛选消费配置——只读接口权限、字段排序、默认条件行、映射与未覆盖项、前后端定向测试。

Given 无已存配置，When 打开页面/弹窗，Then 返回 32 项默认状态且 7 项默认、6 项禁用，不写库。
Given 未完成的键集合、重复键、未知键、非布尔默认值或禁用项设默认，When 保存，Then 422 且不写库。
Given 调整顺序并勾选，When 确定，Then 按数组顺序持久化，失败保留草稿与旧摘要。
Given 保存成功，When 回读/刷新/重开，Then 摘要、顺序、默认标记与弹窗一致。
Given 无 `performance.configuration.manage`，When 读取或写入，Then 401/403，不依赖前端隐藏。

## 实施证据

### 代码

- 后端：`backend/app/performance/field_settings_router.py`、`models.py`、`alembic/versions/0328_performance_filter_conditions.py`、`tests/test_performance_filter_conditions.py`。
- 前端：`frontend/src/components/performance/PerformanceFilterConditionRow.vue`、`PerformanceFilterConditionSettingsDialog.vue`、`Settings.vue`、`performanceFieldSettings.ts`、`api/performanceFieldSettings.ts`、`styles/tokens.css` 及对应 spec。
- 迁移链：`0327_member_filter_presets` → `0328_performance_filter_conditions`；`python -m alembic heads` 唯一 head。

### 测试与检查

- 后端：`python -m pytest tests/test_performance_filter_conditions.py tests/test_performance_member_filters.py -q` → **93 passed**（含成员筛选原有回归）。
- 前端：`npx vitest run src/components/performance/PerformanceMemberFilter.spec.ts src/views/performance/Settings.spec.ts` → **39 passed / 2 files**；新增成员面板顺序/默认行/全取消默认覆盖。
- UI 规则：`node scripts/check-ui-rules.mjs --files src/components/performance/PerformanceMemberFilter.vue` → **0 违规**。
- 类型：`npx vue-tsc --noEmit` 通过。

### 本地真实渲染

- 临时 Vite 预览页真实挂载弹窗，CDP 实测：弹窗 `1420,32,600×1249`；body clientWidth 592；行 `1444,140,544×34`、margin-bottom 5；右侧 `1808,146,172×22`；复选框 `1808,149,16×16`；吸顶表头滚动后仍 y=104；勾选后表头 7→6。
- 证据：`ui-blueprints/CR-018-T02-filter-condition-dialog-implemented.png`（实现态，不是规划蓝图）。

### 未执行/阻塞

- 未升级/降级真实 PostgreSQL，未验证真实行锁/审计回滚；仅有离线 DDL 与内存测试。
- 未运行 `npm run build`、未部署生产、未做整页像素差分。
- 未在真实页面做“保存配置 → 打开成员筛选面板”的浏览器端到端验收；当前为组件测试与后端单测。
- 滚动条 thumb/track 的伪元素颜色未采到，沿用项目全局滚动条 token；仅确认宽度 8px。
- 前台筛选面板未消费该配置，属于明确非范围。
