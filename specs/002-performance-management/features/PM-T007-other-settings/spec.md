# PM-T007 其他设置页面与授权转交设置

- 状态：T01 展示层、T03/T04 八项配置保存与刷新回读已完成并在本地容器验收；T02-A/T02-B授权与转交提示已实现；T06标签目录前后端已实现，专项/构建/随机隔离PG与浏览器持久化闭环通过，运行库0263仍待授权统一迁移发布与真实登录验收，详见atomic-tasks证据。
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
- 不实现校准授权规则、校准导入、绩效系数、360°标签、手动开通的运行时逻辑；任务逾期限制的周期级即时生效属于 PM-T003-I08/I09，运行时提交判断统一读取当前周期策略。
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
| 任务逾期限制 | T03/T04 保存三项开关；周期级策略由 PM-T003-I08/I09 即时生效 | 全局开关决定是否允许周期策略，周期策略保存后影响当前周期下一次逾期提交判定 |

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

- T01 仅负责视图组合；T03/T04 已扩展为八个配置值持久化；任务逾期限制的周期级运行时策略不在本功能内实现，由 PM-T003-I08/I09 负责并以周期当前值实时裁决：

- 授权/转交提示文本按采集内容展示。
- 查看示例只提供轻量反馈，不改变页面状态。
- 编辑图标为待实现入口，不得伪装为已保存成功。
- T04 页面加载 GET 后采用数据库值；每次变化只 PATCH 该字段，保存中禁用八项控件防止请求乱序，失败回滚已确认值。加载失败展示重试，不允许拿默认值覆盖数据库；成功后刷新/重新进入读取保存值。仅保存配置，不声称八项运行时业务已经接通。
- T03/T04 已保存的 `manual_result_opening_enabled` 作为新项目流程设置的选择策略：关闭时新建项目的“手动开通”置灰，并显示“组织内暂不允许手动开通绩效结果”；已有项目已选手动开通时保留其配置，不因全局开关变化而静默改写，实际手动开通运行时仍按项目配置执行。

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

## 7.1 T02-A 授权提示编辑契约（2026-10-20）

用户要求按 `D:/乐逗/Desktop/授权提示.txt` 开发既有页面的两字段弹窗，并确认每种语言最多1000字、清空使用默认提示。本次仅授权提示；转交提示仍待办，以上 T01 的提示编辑非目标限制对本子任务不再适用。既有页面小表单沿用采集布局及统一弹窗，不新增信息架构，不另建完整 HTML 蓝图。

- 全局配置为唯一来源，不写入或改写周期/项目/人员快照，不改变真实授权范围或资格判断。
- 复用 GET/PATCH `/api/v1/performance/system-settings/other`、`performance.configuration.manage`、可信操作者、单例初始化、行锁、同事务 `PERFORMANCE_OTHER_SETTING_UPDATED` 审计。401未认证、403无权、422非法参数；没有新增业务状态码。仅实际变化审计，失败回滚，无发送或外部调用。
- 响应新增必填字符串 `authorization_prompt_zh`、`authorization_prompt_en`；PATCH 均为可选字段，禁止显式 null、非字符串、未知字段，沿用空对象拒绝；逐语言最多1000个Unicode码点，前后端一致。空串或全空白规范化为对应默认文案；非空内容保留换行及原始空格。
- 中文默认：`请确保授权对象有所选环节的操作资格，避免错误授权泄露敏感数据。`
- 英文默认：`To prevent sensitive data exposure, please ensure that the authorized individuals has permission for the selected steps.`（保持采集原文）。
- 使用既有 `performance_other_settings` 单例新增两个非空Text列，ORM/server/API默认一致；仅新增0262迁移，前驱0261（实施时唯一head已核验）。旧行升级自动填默认且保留八项开关。降级只删除这两个文本列，旧布尔配置不变，但会丢失自定义提示；仅隔离schema验证降级，禁止无确认降级运行库。
- 保存仅PATCH两个文本字段，服务端返回完整配置；八项开关仍仅PATCH各自字段，互不覆盖。成功后更新首卡中文摘要并关闭；刷新、重开读取已保存值。取消、关闭、Esc不写入；保存中禁止关闭、重复提交、修改八项开关。失败保留草稿与原摘要，支持重试；未加载成功或无U权限不可编辑。
- 组件：PerformanceDialogShell、PerformanceButton（壳内关闭也复用）、PerformanceCountedTextarea（新增默认不启用的隐藏标签/语言后缀/可选高度）。桌面宽600、高424，两个552×116输入区，间20，语言标签中文/英文；标题72、底部56，正文底部间44（含采集最后表单项20及正文24）。窄屏自适应，不固定整窗高度。

## 7.2 T06 360°评估人标签目录（2026-10-20）

用户提供 `D:/乐逗/Desktop/360°评估人标签.txt`，并明确授权“根据情形进行判断决策后开始开发”。本次选择包含真实保存；以下为授权范围内的实施决策，不冒充采集文件已明确的业务规则。仅维护全局目录，不实现邀请打标签、周期规则或历史结果联动；采集说明所称引用同步为后续消费方按稳定ID读取目录的展示契约，本轮不声称消费方已实现。既有非目标的“标签管理”限制仅对T06目录维护解除。

- 复用既有路由/权限。GET/PUT `/api/v1/performance/system-settings/other/reviewer-360-tags` 均要求 `performance.configuration.manage`；前端入口继续U权限。响应 `{tags: [{id,name_zh,name_en,description_zh,description_en}], version: integer}`；PUT同形，字段严格校验、未知字段/null拒绝。401未认证、403无权、422非法输入；版本不匹配409，保留草稿并提示关闭重开获取最新版本，不自动覆盖。
- 空目录合法；最多50项。稳定UUID由前端生成，服务端规范UUID并拒绝重复ID。中文名称trim后必填，每语言名称最多100个Unicode码点，描述最多500；英文名称/描述及中文描述默认空串；名称逐语言trim后casefold判重（可选英文空串不参与）。顺序即数组顺序。删除仅在目录保存时提交，可取消草稿，不删除任何业务引用或评价数据。
- `performance_other_settings` 增加非空JSONB `reviewer_360_tags`（默认[]）及Integer `reviewer_360_tags_version`（默认0）。仅新增迁移，前驱核验当前唯一head；升级旧行补默认并保留全部配置，降级只删两列（会丢失目录，仅隔离schema验收）。原GET/PATCH响应契约不扩展，不让八项开关/提示保存覆盖标签。
- GET缺行返回空目录/version0，不写库。PUT使用既有单例初始化防冲突、SELECT FOR UPDATE和可信操作者。版本必须与锁定行相同；仅内容/顺序变化时版本+1并写 `PERFORMANCE_REVIEWER_360_TAGS_UPDATED` 审计，主体OTHER_SETTINGS/1，before/after包含目录与版本，与更新同事务。无变化不增版/不审计；失败回滚。不同设置字段与目录保存互不覆盖。
- 简单既有设置弹窗内重复表单，信息架构不变；以采集文件+现有蓝图T06补充为实现依据，不新建HTML蓝图。600px宽，空态284px；两项中文编辑态目标622px，内容增多/短视口只滚正文，footer保持可达。取消/关闭/Esc/遮罩不保存；保存时禁止关闭/编辑/重复提交；失败保留草稿、不更新卡片；成功更新卡片列表并关闭，刷新/重开从GET回读。多语言入口展开可选英文输入，不删隐藏值。
- 复用PerformanceDialogShell、PerformanceButton、PerformanceTextButton、PerformanceIconButton、PerformanceTextField、PerformanceSortableList、PerformanceDragHandle，保留统一token。单项隐藏无意义拖拽手柄，删除仍可清空目录；多项支持指针和键盘排序。独立实现PNG为 `../../ui-blueprints/PM-T007-T06-implemented-reviewer-tags.png`。

## 7.3 T02-B 转交提示独立保存（2026-10-20）

用户明确要求复用授权提示编辑框，标题为“转交提示”，默认文案如下。此增量解除原T01/T02对转交提示的待办限制，不改变真实转交资格、权限或周期快照。

- 中文默认：`请确保转交对象有所选环节的操作资格，避免错误授权泄露敏感数据。`
- 英文默认：`To prevent sensitive data exposure, please ensure that the transferee has permission for the selected steps.`
- 沿用T02-A每语言1000个Unicode码点、清空/全空白恢复对应默认、非空内容保留原空格换行。严格字符串、禁止null、超长422；权限及审计沿用原GET/PATCH。
- 原GET/PATCH `/api/v1/performance/system-settings/other` 新增 `transfer_prompt_zh`、`transfer_prompt_en`；两个非空Text实体列及ORM/API/server默认一致。新增线性迁移`0264_performance_transfer_prompts`（前驱`0263_performance_cycle_overdue_submission`），实施时核验唯一head，不修改既有迁移。升级保留授权提示/八项开关/标签，旧行填默认；降级仅删除本次两列并丢失转交自定义文案，仅隔离验证，不降级运行库。
- 转交弹窗仅PATCH transfer两字段，授权弹窗仅PATCH authorization两字段；共用行锁、同事务审计、可信操作者、失败回滚。不同字段并发不覆盖，无变化不重复审计。响应完整设置，刷新/重开GET回读各自字段。
- 复用PerformanceAuthorizationPromptDialog，通过可选kind选择标题/可访问标签/两字段payload，默认authorization保持旧调用；同一600×424布局、按钮及多行框，不新增另一份弹窗。取消/关闭/Esc不写，保存中禁用/阻止重复关闭提交，失败保留草稿、旧摘要不变，成功更新对应卡片摘要。无权限隐藏，未加载不开放。
- 既有简单弹窗扩展，无新信息架构，无需新完整HTML蓝图；交互记录及独立T02-B截图留证。未获本轮自动部署授权，不改运行数据库/重启容器，不创建脚本或测试文档。

## 8. 原子任务

详见 `atomic-tasks.md`。

## 9. 验收标准

- 页面路由加载后不再显示“功能建设中”占位页。
- 页面标题、卡片顺序、第一张卡片文案、按钮位置、字体、颜色、间距、背景、圆角和阴影符合采集参数。
- 第一张卡片拆分为独立组件，编辑按钮可定位且不会误报保存成功。
- 其他卡片按采集参数尽量还原，不出现校准/设置业务已可保存的误导。
- 既有其他后台路由、后台侧栏和权限守卫不回归。
- 前端聚焦测试与生产构建通过。
