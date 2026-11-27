# CR-017 管理者判定标准设置

状态：开发中。用户已确认按采集 DOM/API 开发，并于本轮确认人员类型使用本地实时花名册实际字符串值，不沿用飞书数字 ID。

## 已确认范围与契约

- 入口：`/performance/settings/system/copy`，绩效配置管理员；权限复用 `performance.configuration.manage`。
- 仅实现管理者标准弹窗、保存、外部摘要、关闭重开与刷新回读；其他字段设置仍为预览。
- 不实现真实管理者资格计算、成员筛选、校准规则消费或历史快照重算。
- 标准：`inservice_direct_underling` / `specific_employee_type_underling`。
- 本地 DTO：`{manager_standard, specific_employee_types: string[]}`。第一项保存空数组；第二项至少一个有效类型，去重并校验实时花名册候选。类型消失时允许读取历史已存值，不静默改写。
- GET/PUT `/api/v1/performance/system-settings/fields/manager-standard`；GET `/api/v1/performance/system-settings/fields/employee-types` 返回 `{value,label}[]`。
- 独立单例存储，新迁移；复用可信操作者、权限依赖、行锁及同事务审计，不混入其他设置 DTO。

## UI 交互与复用

本次为现有页面内的小范围弹窗，不改信息架构，不另建完整蓝图。采集弹窗作为已确认视觉基线。

- PerformanceDialogShell，宽度 token 600；标题“设置管理者的判定标准”。
- PerformanceRadioGroup 纵向：22 行高、8 间距；文案与实采一致。
- 第二项显示灰底条件区：左缩进 20，内边距上 16、左右/下 20，圆角 8；标签与选择器间距 8。所有值引用全局 token。
- PerformanceSearchSelect multiple，动态字符串候选；PerformanceRequiredLabel；UiButton“取消/确定”。
- 编辑草稿隔离；取消不写入；保存中禁止重复提交及关闭；失败保留草稿与旧摘要；成功以接口回读结果更新摘要并关闭。
- 外部摘要第一项“有在职直属下级时，可被认定为管理者。”；第二项按已存类型名称生成“拥有‘人员类型为…’的在职直属下级时，才能被认定为管理者。”（引号采用原页面中文双引号）。
- 加载/错误态不显示伪造已保存默认结果；加载失败提供重试。

## 原子任务与验收

- [ ] CR-017-T01：后端独立设置存储、实时候选、GET/PUT、权限/审计、迁移及专项测试。
- [ ] CR-017-T02：共享组件 token 化、弹窗、页面/API 接入、保存后回读、专项组件测试与 UI 规则检查。
- [ ] CR-017-T03：本地真实页面验证及独立 PNG 证据；记录构建、迁移与未执行项，不以本地测试声称生产部署。

Given 配置加载成功，When 打开弹窗，Then 回显已保存标准和类型。
Given 第二项，When 不选类型，Then 字段校验阻止保存。
Given 修改草稿，When 取消，Then 外部摘要及后端配置不变。
Given 保存成功，When 接口回读及重开/刷新，Then 摘要、标准、人员类型一致。
Given 保存失败，Then 保留草稿与旧摘要，允许重试。
Given 无配置权限，Then 读取/写入均拒绝；不能靠前端隐藏代替后端校验。

## 实施证据

代码已实现，任务保留未勾选：完整构建、迁移及真实数据库验收存在阻塞，不宣称整体完成。

### 前端与 UI

- 实现：`frontend/src/components/performance/PerformanceManagerStandardDialog.vue`、`frontend/src/api/performanceFieldSettings.ts`、`frontend/src/views/performance/Settings.vue`；扩展本地字段 DTO 为字符串键，复用共享组件并 token 化 RadioGroup 原有魔法样式。
- 命令：在 `hr-portal/frontend` 执行 `npx vitest run src/views/performance/Settings.spec.ts src/components/performance/PerformanceManagerStandardDialog.spec.ts src/api/performanceFieldSettings.spec.ts src/components/performance/PerformanceDialogShell.spec.ts src/components/performance/PerformanceSearchSelect.spec.ts`，**34 passed / 5 files**。
- UI 检查：`node scripts/check-ui-rules.mjs --files src/views/performance/Settings.vue src/components/performance/PerformanceManagerStandardDialog.vue src/components/performance/PerformanceRadioGroup.vue`，0 违规；`git diff --check` 通过（有现有 LF/CRLF 提示）。
- 浏览器：本地 Vite 实际路由 `/performance/settings/system/copy`，CDP 拦截 API 使用受控配置与实时候选形状；验证空选阻止、字符串类型 PUT→GET 回读、摘要更新、重开回显。受控数据不等于真实后端/数据库端到端联调。
- 实际 DOM：宽 600，标题区 72，第二态 body 158、整窗 310；单选组 52（22×2+8）；条件区宽 532、高 98，padding 16/20/20，左缩进20，与源 CSS 基准对齐（源浏览器 DPR1.5 存在亚像素取整）。未作整页逐像素差分，不能宣称所有像素完全一致。
- 已查看独立证据：`ui-blueprints/CR-017-T02-manager-standard-implemented.png`（第一项）、`ui-blueprints/CR-017-T02-manager-standard-specific-implemented.png`（第二项）。仅本地 UI 截图，不是规划蓝图。
- `npm run build` / `npx vue-tsc --noEmit` 失败：并行成员筛选文件 `PerformanceMemberFilter.vue`、`.spec.ts` 的类型/组件同名冲突，以及 `PerformanceMemberFilterField.vue` 的 `children` 类型错误；未修改这些文件，已通知负责人。

### 后端与数据库

- 实现：`backend/app/performance/field_settings_router.py`、`models.py`、`main.py`、`backend/tests/test_performance_manager_standard.py` 与新迁移。
- 协调后主线程执行 `python -m alembic heads`，确认唯一 head 为 `0327_member_filter_presets`。
- 协调后主线程复跑 `python -m pytest tests/test_performance_manager_standard.py tests/test_performance_other_settings.py tests/test_performance_other_permission_settings.py -q`：**172 passed, 2 skipped, 1 warning**（既有 multipart 弃用警告）。此前双 head 导致的 schema-check 阻塞已解除；跳过项仍不能当作通过。
- 当前单链：`0325_performance_report_notes` → `0326_performance_manager_standard` → `0327_member_filter_presets`；成员筛选负责人完成尚未应用迁移的顺延，本会话未修改两份迁移、未自行 merge、未升级数据库。
- 真实 PostgreSQL：实现线程报告本机连接被拒（WinError 1225），升级/降级、并发行锁、真实审计事务回滚未通过；仅离线 DDL/模型约束证据。
- 验收阶段未部署、未连接生产；本次提交不代表生产验收。无历史周期计算或数据重算。
