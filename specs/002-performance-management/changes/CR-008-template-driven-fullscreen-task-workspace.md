# CR-008 模板驱动的全屏绩效填写工作区

- 状态：蓝图已确认，限定范围代码及本地 UI/定向回归完成；真实数据库验收阻塞，未部署
- 关联：PM-T004-T05 模板内容配置、CR-005 评估角色统一接入、Spec 002 工作总结/评估/校准节点
- 来源：用户要求对齐飞书绩效「填写工作总结→去完成」的全屏工作区及模板驱动、跨环节复用逻辑。

## 1. 背景与目标

REA 对飞书实际填写页的被动采集观察到：独立填写工作区包含人员信息头、阶段/参考页签、填满可用宽高的内容区及固定底部操作栏。模板组将阶段、读/写/修改模板和参考内容关联；页面由阶段模板结构生成，员工填写的工作总结可在后续阶段只读引用。

本地已有共享任务页、`PerformanceTemplateRenderer`、模板内容配置、运行时 schema、答案保存与参考内容，但填写页面容器高度链、重复路由外壳及跨阶段模板绑定/答案读取的契约尚未形成单一、可验收的工作区约定。

目标是在保留本地现有任务/快照/权限数据模型的前提下，复用同一运行时 schema、答案处理、字段 Renderer 和任务状态逻辑；统一填写工作区布局，并使模板阶段配置到当前任务填写/后续阶段读取的链路可追踪、可测试。

## 2. 范围与非目标

### 纳入

- 员工任务页面采用独立全屏工作区：人员信息头、阶段页签、填满剩余空间的内容画布、唯一主滚动区及固定底部操作栏。
- 工作总结、自评/他评及已有校准任务入口使用同一工作区外壳、Renderer 和答案控制逻辑；任务 API 返回的角色、编辑状态、可提交状态及字段只读边界保持权威。
- 统一工作台和绩效评估入口所进入的填写路由，避免同一页面因布局嵌套出现不同的头部、占屏和返回行为。
- 明确模板配置中 fill/reference/adjustment/view 绑定和 root/item 设置到运行时 schema、答案可见性/可写性的转换与回读契约；缺失处在现有 workflow/节点快照模型内补齐，不另建平行表单引擎。
- 在确认的飞书截图视口、常见桌面视口和窄视口验证容器占屏、滚动、底栏遮挡与文本溢出。

### 不纳入

- 不复制飞书内部 DTO、模板组数据库结构或 API；不以像素对齐为由重建模板/答案存储。
- 不改变周期、项目及节点启动快照语义，不让当前模板改动回写已启动项目或历史记录。
- 不新增或重定义角色权限、任务状态机、保存/提交 API、评分/权重算法、分组人群执行、条件等级、结果沟通/复议生命周期或消息催办。
- 不把当前禁用的“全屏填写”按钮仅为视觉对齐而伪装成可用功能；蓝图确认前决定它是保持禁用，还是由工作区外壳状态替代并移除冗余按钮。
- 不把本地单测/组件截图描述为生产或真实持久化验收。

## 3. 当前架构与复用约束

- 前端工作区协调器：`hr-portal/frontend/src/views/performance/SelfSummaryTask.vue`。
- 公共字段渲染：`PerformanceTemplateRenderer.vue`、`PerformanceTemplateSection.vue`、`PerformanceTemplateFieldRenderer.vue` 与 `performanceTemplateAnswers.ts`。
- 后端 schema 投影：`hr-portal/backend/app/performance/self_summary_service.py` 的 `build_self_summary_schema`、模板 hydrate 与答案清洗/投影逻辑。
- 任务/参考内容 DTO：`hr-portal/backend/app/performance/projects_router.py`。
- 模板配置保存：`PerformanceTemplateContentSettings.vue` 与 workflow service 的 `content/content_bindings/content_library`。
- 路由：`hr-portal/frontend/src/router/index.ts`；任务入口映射：`performanceTaskEntry.ts`、`Workbench.vue`、`Review.vue`。

任何字段或内容变更仍由当前阶段的配置和项目启动快照决定；只读/隐藏由服务端 schema 和任务授权决定。共享 UI 或复用一个组件不构成授权，也不自动建立来源答案。

## 4. 原子任务

- [x] CR-008-T01 全屏任务工作区和路由统一
  - 复用 `PerformanceTaskWorkspace.vue`，只在受保护的填写任务路由隐藏门户外壳，不更改 `PerformanceLayout` 等其他页面。
  - 工作总结/评价/校准沿同一 `SelfSummaryTask.vue`、schema Renderer、答案和任务状态处理。
  - 删除重复嵌套路由，保留原路径和 `PerformanceSelfSummary` 命名入口；参数和接口权限不变。
  - Given短/长/窄屏表单；When打开工作台/评估入口、切换页签和滚动；Then白色画布占满剩余高度、底栏不遮挡、无水平溢出。
  - Given加载失败/无内容/整体只读/部分只读/保存失败；When渲染/重试/保存；Then任务外壳稳定、错误不提交、已有答案保留。
  - 证据：`hr-portal/frontend/src/views/performance/SelfSummaryTask.spec.js` 23 项、header组件2项、路由3项；截图 `ui-blueprints/CR-008-T01-implemented-workspace-pc.png`、`CR-008-T01-implemented-workspace-mobile.png`、`CR-008-T03-implemented-long-form.png`；真实 Chromium 实际 Vue 路由+API 夹具验证，运行错误0。

- [ ] CR-008-T02 模板配置到运行时填写/只读引用契约（代码与定向测试完成，真实数据库验收阻塞）
  - 节点快照 `content_page_name` 投影至任务 DTO，旧数据/未配置回退 `node.name`，不重命名流程节点。
  - `_reference_tabs` 基于当前引用关系的 `reference_settings.content_settings` 投影 root/item `allowView`、`hideName`、`hideDescription`；复用结果页白名单投影和答案裁剪，不改变来源答案、处理人或任务读取授权。
  - 不更改工作流 JSONB、API 方法、节点快照、答案模型或已有题型集合。
  - Given每种引用内容类型和root/item拒绝可见；When任务加载；Then隐藏定义、答案、名称和提示不会泄漏，只读允许项保留合法答案，来源对象不变。
  - 证据：`backend/tests/test_performance_projects.py` 增加页面名称快照/回退和 reference root/item view 四类型投影测试；本地目标测试312 passed、4 skipped；模板联合回归540 passed、4 skipped、1 deselected。

- [ ] CR-008-T03 真实页面与持久化回归验收（本地 UI 夹具部分完成，真实数据库部分阻塞）
  - 前端：6 个定向文件共75项通过；`npm --prefix hr-portal/frontend run build` 的 `vue-tsc --noEmit` 与 Vite 构建成功。保留既有 VueUse PURE 注释告警。
  - 浏览器：1280×900实测填充区域1256×687、footer top=836/bottom=900；长表单滚动高度1611、滚动容器可达末项且底栏不遮挡；390×844下document.scrollWidth=390、无水平溢出；参考内容、只读、保存失败保留、加载重试通过，pageerror=0。
  - 保存/重开验证由明确本地 API 夹具执行，只证明前端 payload/读取投影，不是数据库持久化验收。
  - 未执行：真实 API + PostgreSQL 保存—重开；环境阻塞证据：合并套件迁移验收的数据库主机为 `db`，本地安全检查拒绝该地址；未修改环境配置、未绕过保护。真实数据库验收 remains blocked。
  - 未执行：Docker 部署/生产登录态验收、commit、push；本次不部署。

## 5. 主要风险

- 目前同路径存在独立与嵌套路由，需先核对 Vue Router 实际匹配与守卫；统一外壳不得绕过应用入口或绩效任务 API 的服务端授权。
- 飞书截图证明布局形态，不代表其内部接口/权限/保存语义适用于本地；本地快照和答案模型仍是本地权威。
- 自动保存事件完整性、并发版本保护、未知评级值校验属于独立缺陷候选，不作为全屏样式改动自动修复；如验收发现阻塞，另行记录范围。
- [ ] 完成条件：T01 已完成；T02/T03 已完成限定代码与本地测试，真实数据库保存重开未完成，故整体不标记完成。未部署。

## 6. 停止与保护边界

- 本轮无迁移、提交、推送或生产操作；停止时仅移除本轮工作区组件接入、路由收敛、任务页面名与参考显示投影，不回滚其他工作树变更或历史任务。
- 工作树中的身份切换/PerformanceLayout等并行改动及原有未提交删除、截图/临时脚本不属于本CR，不覆盖、不清理。
- UI 合规：已阅读 Spec012 START_HERE/ui-interaction/ui-implementation-guardrails，沿 Spec002 独立绩效蓝图；未引入第二套题型引擎、无UCP配置/任意脚本执行入口；展示与服务端权限裁剪分离。
