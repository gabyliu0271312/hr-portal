# PM-T007 其他设置页面与授权转交设置

- 状态：T01 展示层、T03/T04 八项配置保存与刷新回读已完成并在本地容器验收；T02 编辑弹窗未开始
- 负责人：
- 关联路线：绩效后台设置能力建设
- 关联决策：`../../decisions/ADR-001-modular-monolith.md`
- 采集依据：`D:/乐逗/Desktop/授权和转交设置.txt`

## 1. 背景与目标

### 背景

绩效后台已存在「系统设置 → 其他设置」入口，但当前页面仍为通用占位页。用户提供了真实页面采集参数，需要先完成页面信息架构与视觉还原，再在下一阶段补充授权/转交提示编辑弹窗和保存业务。

### 目标

- 将 `/performance/settings/system/other` 替换为专属高组件化页面。
- 按采集参数还原“其他设置”页面的纵向卡片轮廓、标题层级、间距、颜色、圆角与阴影。
- 第一张“授权和转交设置（不含校准）”卡片实现像素级静态交互外观。
- 编辑图标保留为下一阶段弹窗与保存业务的明确入口，但本阶段不实现弹窗、API 或持久化。
- 其他采集到的卡片尽量还原结构和默认视觉；不实现校准及其他设置的保存业务。

### 非目标

- 不实现授权提示/转交提示编辑弹窗。
- 原 T01/F01 不实现保存；用户最新要求的 T03/T04 覆盖八个复选项持久化、读取、审计，不包含提示文案编辑与标签管理。
- 不实现校准授权规则、校准导入、绩效系数、360°标签、手动开通、任务逾期限制的运行时逻辑。
- 不修改现有项目级 `allow_authorize`、周期快照或 PM-001 对象级授权契约。

## 2. 角色与场景

| 角色 | 入口 | 操作 | 系统反馈 | 成功结果 | 失败/空态/无权限 |
|---|---|---|---|---|---|
| 绩效管理员 | 系统设置 → 其他设置 | 浏览页面、查看示例、点击编辑图标 | 页面展示采集到的设置卡片；编辑入口保留待开发提示 | 看到与采集页面一致的布局 | 入口权限由既有后台路由守卫处理 |
| 无后台权限用户 | 直接访问 URL | 访问页面 | 既有路由守卫拒绝 | 不渲染页面 | 不新增降级访问 |

## 3. 功能范围

| 功能项 | 本期实现 | 说明 |
|---|---|---|
| 其他设置页面标题 | 是 | “其他设置” |
| 授权和转交设置卡片 | 是 | 第一张卡片像素级还原 |
| 查看示例 | 是 | 使用轻量提示反馈，不打开业务弹窗 |
| 编辑图标 | 仅保留入口 | 下一阶段实现弹窗和保存 |
| 授权校准设置 | T03/T04 保存开关 | 不接运行时规则 |
| 校准导入设置 | T03/T04 保存开关 | 不实现导入 |
| 绩效系数设置 | T03/T04 保存开关 | 不接评分计算 |
| 360°评估设置 | T03/T04 保存开关 | 不实现标签管理 |
| 手动开通绩效结果 | T03/T04 保存开关 | 不改变现有项目规则 |
| 任务逾期限制 | T03/T04 保存三项开关 | 不接运行时提交规则 |

## 4. 影响分析

| 层级 | 是否影响 | 具体对象 | 兼容性风险 |
|---|---|---|---|
| 前端路由 | 是 | `PerformanceSystemOther` 组件替换 | 仅影响其他设置路由 |
| 页面布局 | 是 | 新增页面与设置卡片组件 | 不修改后台壳 |
| API | 是 | T03 GET/PATCH 系统其他设置 | 与其他权限设置独立 |
| 数据库 | 是 | 0260 新单例表，八个布尔实体列 | 新增表，不修改旧数据 |
| 权限 | 是 | API 使用既有 configuration.manage，前端使用既有 U 权限 | 不新增权限码 |
| 定时任务 | 否 | 不涉及 | 无 |
| 外部系统 | 否 | 不涉及 | 无 |
| UCP | 否 | 不涉及 | 无 |

## 5. 技术设计

### 5.1 数据库与数据模型

T03 新增领域单例表 `performance_other_settings`，固定主键 id=1，八个非空 Boolean 实体列及 updated_by_type/ref、created_at/updated_at；不存在记录时 GET 返回默认值且不写库。默认值依次 true/true/false/true/true/true/false/false，与 ORM、迁移 server_default、API 一致。新增迁移连接当前唯一 head，禁止修改既有迁移；降级仅删除本次新表，执行前先验证隔离库。修改不写周期或项目快照，也不自动将配置接入运行时业务。

### 5.2 后端接口

T03 冻结接口：GET/PATCH `/api/v1/performance/system-settings/other`；两者均要求 `performance.configuration.manage`，沿用真实访问上下文，未认证 401、无权 403。响应为八个布尔值：

- `calibration_authorization_outside_direct_reports_enabled` = true
- `calibration_import_enabled` = true
- `performance_coefficient_enabled` = false
- `reviewer_360_tags_enabled` = true
- `manual_result_opening_enabled` = true
- `overdue_single_submission_enabled` = true
- `overdue_voluntary_360_submission_enabled` = false
- `cycle_overdue_submission_override_enabled` = false

PATCH 为上述字段的非空部分对象；禁止未知字段、null、非 boolean（含字符串/数字）和空对象，参数错误 422。仅更新传入字段，false 不可遗漏；返回完整配置。不存在行时 INSERT ON CONFLICT DO NOTHING，再 SELECT FOR UPDATE 锁定单例，行锁与审计在同一事务内提交；不同字段并发不会互相覆盖，同字段最后取得锁的更新生效，不引入版本号。仅实际值变化时写 `PERFORMANCE_OTHER_SETTING_UPDATED` 审计，主体 `OTHER_SETTINGS/1`，操作者从可信认证上下文获取，记录完整 before/after；失败事务回滚，不伪报保存成功。

### 5.3 业务逻辑

- T01 仅负责视图组合；T03/T04 已扩展为八个配置值持久化，不扩展运行时业务：

- 授权/转交提示文本按采集内容展示。
- 查看示例只提供轻量反馈，不改变页面状态。
- 编辑图标为待实现入口，不得伪装为已保存成功。
- T04 替代 F01 的仅内存状态：页面加载 GET 后采用数据库值；每次变化只 PATCH 该字段，保存中禁用八项控件防止请求乱序，失败回滚已确认值。加载失败展示重试，不允许拿默认值覆盖数据库；成功后刷新/重新进入读取保存值。仅保存配置，不声称八项运行时业务已经接通。

### 5.4 前端与交互

页面路由：`/performance/settings/system/other`。

组件拆分：

- `OtherSettings.vue`：页面组装与标题。
- `PerformanceOtherSettingsCard.vue`：统一卡片外壳、标题和间距。
- `PerformanceAuthorizationTransferCard.vue`：第一张卡片的像素级实现。
- `PerformanceOtherSettingsToggleCard.vue`：单个复选设置卡片。
- `PerformanceOtherSettingsOverdueCard.vue`：任务逾期等多项设置卡片。
- `PerformanceOtherSettings360Card.vue`：360°标签设置卡片。
- `PerformanceReadOnlySettingRow.vue`：复用 `PerformanceCheckbox` 的设置行，按 F01 修订支持 update:checked（保留原组件名以限制改动范围）。
- `PerformanceIconAction.vue`：编辑/设置图标按钮的统一视觉入口。

状态：

- normal：显示全部采集到的卡片。
- empty：360°标签区域显示“暂无 360° 评估人标签”。
- loading：T04 请求配置时禁用控件；error：加载失败显示重试，保存失败回滚并提示；forbidden：沿用页面守卫及 API 权限拒绝，不降级为可写。
- edit pending：点击编辑入口提示“编辑提示将在下一步开放”，不展示保存成功反馈。

### 5.5 权限、安全与外部系统

复用 `/performance/settings` 既有入口和路由权限。查看示例使用 `PerformancePermissionButton` 的 V 权限，编辑与标签设置入口使用 U 权限；无权限隐藏。T03 GET/PATCH 均由后端检查 `performance.configuration.manage`，T04 无前端 U 权限时禁用复选框。审计操作者来自可信上下文，不接受请求传入。本期不展示敏感数据、不接入外部系统。

## 6. 假设与待确认事项

| 编号 | 事项 | 当前假设 | 需要谁确认 | 阻塞开发 |
|---|---|---|---|---|
| Q1 | 其他设置开关是否保存 | 用户要求 T03/T04 八项勾选后自动持久化并可刷新回读 | 用户已明确要求 | 否 |
| Q2 | 编辑图标行为 | 本期保留入口并提示下一步开放 | 用户 | 否 |
| Q3 | 其他卡片范围 | 按采集文件尽量还原全部可见卡片 | 用户 | 否 |
| Q4 | 后端配置契约 | 八项契约已冻结于第 5.1/5.2 节；提示文案弹窗另属 T02 | 已冻结 | 否 |

## 7. 关联 UI 蓝图

- 是否需要蓝图：是
- 蓝图文件：`../../ui-blueprints/PM-T007-other-settings.md`
- 采用版本：v1.0
- 蓝图确认人和日期：用户于 2026-10-20 回复“开始开发”，确认 v1.0 的 T01 范围。

## 8. 原子任务

详见 `atomic-tasks.md`。

## 9. 验收标准

- 页面路由加载后不再显示“功能建设中”占位页。
- 页面标题、卡片顺序、第一张卡片文案、按钮位置、字体、颜色、间距、背景、圆角和阴影符合采集参数。
- 第一张卡片拆分为独立组件，编辑按钮可定位且不会误报保存成功。
- 其他卡片按采集参数尽量还原，不出现校准/设置业务已可保存的误导。
- 既有其他后台路由、后台侧栏和权限守卫不回归。
- 前端聚焦测试与生产构建通过。
