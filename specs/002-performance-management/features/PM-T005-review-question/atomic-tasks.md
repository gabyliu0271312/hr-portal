# PM-T005 评估题管理 · 原子任务

> 依赖 spec.md 和 api-contract.md。评估规则下拉选项来自当前可用评估规则接口；评估题只保存 `rule_id`，规则变更后读取最新配置，不保存版本或配置快照。
> 本任务目录包含像素级 UI 还原与接口契约；普通题/子题规则过滤逻辑后续单独开发，本次不实现。
> 历史采集缺口（评估规则选项、评估规则 tab）已补采；本次新增正式环境规则关联证据，但不执行真实评估题保存。

---

## PM-T005-T00 评估规则来源与评估题关联接口契约

- [ ] PM-T005-T00 评估规则来源与评估题关联接口契约
  - 目标：冻结规则列表、规则详情、评估题创建/读取的共享 DTO 和 `rule_id` 关系
  - 类型：契约/API
  - 前置条件：正式环境规则下拉和选择后模块采集完成
  - 必读：spec.md 第 5–9 节、api-contract.md、integration.md、permission-model.md、execution-contract.md
  - 允许修改：api-contract.md、spec.md、atomic-tasks.md、acceptance-contract.md
  - 允许新建：无
  - 禁止修改：业务前端组件、已有迁移、无关 API 类型
  - 共享文件与合并规则：先冻结 `rule_id`、`is_sub_question`、`parent_question_id` 和错误码，再允许后端/前端任务并行；任何 DTO 改动必须回写 api-contract.md
  - 输入契约：已有评估规则实体及其最新配置；普通题和子题的入口语义
  - 输出契约：`GET /api/v1/performance/review-rules`、`GET /api/v1/performance/review-rules/{rule_id}`、`POST /api/v1/performance/review-questions`、读取接口的字段和错误契约
  - UI：规则下拉 `label=name`、`value=id`；选择后按 `rule_id` 获取最新配置；不设计题型过滤参数
  - 采集/像素门禁：最新真实菜单采集包含 6 个下拉选项、21 个状态（7 个目标规则 × 首屏/滚动后/选择后），已投影到 `schema_version: 2` 机器契约；历史 textarea resize after-drag 仍为 `completion_status=incomplete`、`pixel_restore_status=blocked`
  - API/数据库/权限/外部系统影响：冻结 API 和权限边界；本任务不创建迁移，不改变权限
  - 测试契约：
    - Given：规则列表包含重名或同类型规则
    - When：页面构造下拉选项
    - Then：`label` 使用名称，`value` 使用唯一规则 ID，不能使用名称、类型或顺序
    - Given：评估题仅保存 `rule_id`
    - When：关联规则配置被修改后重新读取评估题
    - Then：读取同一 ID 的最新名称、类型和配置，不读取版本/快照
    - 测试文件：后端 API 契约测试、前端规则选择组件测试（实现任务补充具体路径）
    - 命令：以后端/前端项目实际测试命令为准；未实现前记为未运行
  - 验收：DTO 字段、普通题/子题关系、最新读取语义、错误码和过滤非范围与 spec/api-contract/acceptance-contract 一致
  - 证据：契约 diff、接口 schema、测试输出、正式环境关系表
  - 阻塞项：真实保存请求尚未执行；不能把本地 mock 或静态选项当作接口通过证据
  - 非范围：普通题/子题规则过滤、规则版本表、快照表；采集夹具名称不得作为生产枚举或模块判断条件
  - 完成定义：契约冻结且通过跨文档一致性检查；只有主智能体可以勾选任务

---

## PM-T005-T01 路由与页面骨架

- [ ] PM-T005-T01 路由与页面骨架
  - 目标：评估题页面可访问，显示标题 + 组装占位
  - 类型：frontend
  - 前置条件：T00（接口字段）
  - 必读：spec.md、`hr-portal/CLAUDE.md`（页面 SOP + 表格五件套）
  - 允许修改：`frontend/src/router/index.ts`、`frontend/src/layouts/PerformanceAdminLayout.vue`
  - 允许新建：`frontend/src/views/performance/ReviewQuestionManagement.vue`
  - 禁止修改：`PerformanceAdminLayout` 的 header/侧栏结构（共用布局，只加跳转项）
  - 共享文件与合并规则：`router/index.ts` 只追加 evaluation-questions child；`PerformanceAdminLayout.vue` 只加 `evaluation-questions` 的跳转与 activeSection 映射
  - 输入契约：路由 path `evaluation-questions`、name `ReviewQuestionManagement`
  - 输出契约：页面能访问，标题「评估题」显示
  - UI：路由 / 页面骨架 / 标题；不实现表格和弹窗
  - API/数据库/权限影响：无
  - 测试契约：
    - Given：登录有绩效后台权限的用户
    - When：点左侧「评估题管理」
    - Then：跳转到 `/performance/settings/evaluation-questions`，显示标题「评估题」
    - 测试文件：`ReviewQuestionManagement.spec.ts`
    - 命令：`npm run test`
  - 验收：路由跳转成功、菜单高亮正确、无 404
  - 证据：路由 diff、页面截图、测试通过
  - 阻塞项：无
  - 非范围：表格、弹窗、字段
  - 完成定义：页面可访问 + 路由/菜单接入 + 测试通过

## PM-T005-T02 表格组件 ReviewQuestionTable

- [ ] PM-T005-T02 表格组件
  - 目标：6 列表格 + 分页 + 行操作（编辑/删除）
  - 类型：frontend
  - 前置条件：T01
  - 必读：spec.md 3.1（表格列）、`hr-portal/CLAUDE.md` 表格五件套
  - 允许新建：`frontend/src/components/performance/ReviewQuestionTable.vue`、`frontend/src/components/performance/PerformanceManagementTable.vue`
  - 允许修改：`ReviewQuestionManagement.vue`、`ReviewRuleTable.vue`、`ReviewRuleTable.spec.ts`、`reviewQuestionTypes.ts`、`ReviewQuestionTable.spec.ts`
  - 禁止修改：无
  - 共享文件与合并规则：`PerformanceManagementTable` 统一承载评估规则与评估题的表格外壳、空/加载态、分页、表头 token 和六列比例；业务表格只负责列定义、类型/评估方式映射、操作事件和业务数据展示。评估题第二列必须使用现有 `questionTypeLabel(row.type)`，不得改动当前评估题接口 DTO
  - 输入契约：props `questions: ReviewQuestion[]`、`loading: boolean`；emits `edit` / `remove`
  - 输出契约：6 列（名称237.66/类型237.66/创建人316.63/创建时间316.88/备注237.66/操作253.53）+ 分页 + 操作列（编辑蓝 rgb(36,91,219)、删除灰 rgb(187,191,196)）
  - UI：表格五件套（外层 overflow-x auto、width 100%、数据列 min-width、操作列 width 128 fixed right）；评估题表格与评估规则表格共用 `PerformanceManagementTable`
  - API/数据库/权限影响：无
  - 测试契约：
    - Given：传入 6 列结构的数据
    - When：渲染表格
    - Then：显示 6 列表头「名称/类型/创建人/创建时间/备注/操作」，操作列有编辑/删除
    - 测试文件：`ReviewQuestionTable.spec.ts`
    - 命令：`npm run test`
  - 验收：6 列正确、操作列编辑/删除颜色正确、空态显示「暂无评估题」
  - 证据：组件 diff、测试通过、截图
  - 阻塞项：无
  - 非范围：弹窗、字段、筛选
  - 完成定义：表格渲染 6 列 + 行操作 + 空态 + 测试通过

## PM-T005-T03 新建/编辑页面容器

- [ ] PM-T005-T03 新建/编辑页面容器
  - 目标：独立页面容器（create/edit 模式）+ 三张分区卡片 + 底部固定操作栏
  - 类型：frontend
  - 前置条件：T01
  - 必读：spec.md 3.2（字段）、3.5（按钮）
  - 允许新建：新建/编辑页面组件（具体文件名以后续实现拆分确定）
  - 允许修改：`ReviewQuestionManagement.vue`（接入新建/编辑页面路由或状态）
  - 禁止修改：无
  - 共享文件与合并规则：无
  - 输入契约：当前题目（可为空）、`mode`(create|edit)、`is_sub_question`、`parent_question_id`、`rule_id`、返回/提交/预览/取消事件
  - 输出契约：顶部「返回 / 新建评估题（或编辑评估题）」、三张卡片（基本信息/评估规则/备注信息）、底部固定「提交/预览/取消」；提交时输出 `rule_id`，不输出规则名称作为关联键
  - UI：独立页面、约 800px 居中内容列、灰色页面背景、卡片分区、底部固定操作栏；不得以 640px dialog 作为目标容器
  - API/数据库/权限影响：依赖 T00 定义的 `POST /performance/review-questions`；普通题/子题过滤不在本任务
  - 测试契约：
    - Given：从评估题列表点击「新建」→「新建评估题」
    - When：渲染
    - Then：进入独立新建页面，显示三张分区卡片和底部「提交/预览/取消」
    - 测试文件：`ReviewQuestionCreatePage.spec.ts`
    - 命令：`npm run test`
  - 验收：页面容器、返回栏、三张卡片、底部固定栏和 create/edit 标题切换正确；普通题与子题请求关系可由 `is_sub_question`/`parent_question_id` 区分
  - 证据：组件 diff、测试通过、截图、请求 DTO 断言
  - 阻塞项：无
  - 非范围：字段控件实现（T04）、mock 数据
  - 完成定义：独立页面容器 + 三张卡片 + 底部固定栏 + 测试通过

## PM-T005-T04 字段控件子组件

- [ ] PM-T005-T04 字段控件子组件
  - 目标：6 字段的控件实现（类型 radio 组、语言 radio、名称 input、描述/备注 textarea 带字数统计、评估规则 select）
  - 类型：frontend
  - 前置条件：T00、T03
  - 必读：spec.md 3.3（radio 结构）、3.4（input/textarea 结构）
  - 允许新建：`frontend/src/components/performance/ReviewQuestionFormType.vue`（类型 radio 组）、`ReviewQuestionFormBasic.vue`（语言/名称/描述/备注）等字段子组件；`ReviewQuestionDisplayMethodCard.vue`（评级与固定分值评分唯一共享展示方式组件）；`ScoreRangeSummary.vue`、`FixedScoreOptionsSummary.vue`（普通评估题与子评估题共享评分规则摘要）；`ScoreMappingSummary.vue`（普通评估题评分映射等级型唯一展示组件）
  - 允许修改：`ReviewQuestionEditModal.vue`（v-model 分发到字段子组件）、`PerformanceOptionNavigator.vue`、`ReviewRuleConfigRenderer.vue`、`ReviewQuestionRuleAdditionalCards.vue`、`ReviewQuestionEntryVariants.spec.ts`、`ReviewQuestionCreatePage.spec.ts`
  - 禁止修改：无
  - 共享文件与合并规则：字段子组件通过 v-model 与页面容器通信；`ReviewQuestionRuleSelect` 的 options 必须来自 T00 规则列表接口，页面只保存 `rule_id`，不得恢复静态选项数组
  - 输入契约：各字段子组件 props `modelValue`、emits `update:modelValue`；规则选择组件额外接收 `options: ReviewRuleOption[]` 和加载/错误状态
  - 输出契约：
    - 类型：radio 组（solid 横向，4 选项：常规评估项/OKR评估项/加分项/减分项），每项后有 InfoOutlined 图标，选中态 checked-ink
    - 语言：radio（中文/英文）
    - 名称：el-input（placeholder「请输入名称」）
    - 描述：el-input textarea + show-word-limit + maxlength 1000
    - 备注：el-input textarea + show-word-limit + maxlength 2000
    - 评估规则：select；label 来自规则 `name`，value 使用 `rule_id`，选择后加载同一 ID 的最新配置
    - 评分上下限规则选择后：普通评估题与子评估题共同调用 `ScoreRangeSummary`；评估规则卡只显示「评分上下限」摘要，下限、`-`、上限和小数位规则在同一行；不得显示规则卡内独立「评分方式」或「精度」行。普通题的独立「评估方式」卡按采集目标保留，子评估题不显示额外卡片
    - 固定分值规则选择后：普通评估题与子评估题共同调用 `FixedScoreOptionsSummary`，以子评估题的「分值选项」标签结构为真源；共享组件不显示「评分配置」「评分方式」「精度」，普通题附加卡保留在组件之外
    - 评分映射等级型选择后：普通评估题调用唯一 `ScoreMappingSummary`，渲染四列表头、派生区间文本、彩色等级胶囊、空名称 `--`、描述输入框和底部共享 `ScoreRangeSummary`；禁止通用键值行、独立「区间关系」和 `code - name` 合并
    - 子评估题评级规则选择后：使用只读评级档位导航；新建与编辑子评估题共用；普通评估题继续使用「配置等级描述」结构
    - 子评估题评级档位：viewport宽跟随约759px父内容区、高38px；胶囊自然宽、最小42px、高32px、padding 6px 12px；连接线12–88px；长内容由viewport裁切
    - 子评估题评级溢出：仅显示灰色 `RightOutlined` 提示，不显示左箭头，不响应点击/键盘/滚轮，不改变track offset
    - 普通评估题评级：根据规则详情 `grade_participates_in_calculation` / `gradeParticipatesInCalculation` 控制「量化分」列；不得通过等级对象字段存在性推断
    - 普通评估题评级长代号：表头与数据行共享代号列轨道，列宽 `70–132px` 并由最宽代号驱动；右侧列同步偏移；代号底框最大132px且内部ellipsis；背景使用色板 `trigger` 映射；空等级名称显示 `--`
    - 「隐藏等级量化分」仅从所选评估规则详情读取 `hide_grade_quantified_score` / `hideGradeQuantifiedScore`，不是评估题字段，不可在新建评估题中修改或提交
    - `rating-off` 不显示量化分列和隐藏量化分；`rating-on` 显示量化分列并按规则配置显示隐藏量化分当前状态
    - 评级方式 label 与单选组上下排列，目标 radio group 约 `434×22px`；展示方式两个选项均为 `368×125px` 上下分区卡片，包含固定 `C/B/A/S` 标签样式预览和下拉预览；展示方式卡按 `rating-off=800×263px`、`rating-on=800×325px` 自然变体
    - 评级和固定分值评分必须复用唯一 `ReviewQuestionDisplayMethodCard`；父组件只决定是否挂载，禁止按规则类型复制展示方式 DOM、CSS 或维护动态 fixedOptions 标签预览
    - B「标签样式」预览使用采集到的固定 `C/B/A/S` SVG 示例，不读取实际评级等级；切换标签样式/下拉样式只改变本地预览选中态，不改变规则配置
    - 「隐藏等级量化分」使用已有 `PerformanceSwitch`，以规则详情配置初始化并允许操作本地预留状态；不使用 checkbox，不进入评估题 payload，不反向写回评估规则
    - 全屏页面只保留内容区单一纵向滚动容器；底部操作栏为 fixed/absolute overlay 时不重复叠加根滚动和大段底部空白
  - UI：字段控件类型严格按 spec.md 3.3/3.4 和正式环境规则选择状态证据，不改成其它控件
  - API/数据库/权限影响：读取规则列表/详情接口；新建评估题提交 `rule_id`；不设计普通题/子题过滤参数，不保存规则版本或配置快照
  - 测试契约：
    - Given：规则列表包含用户建立的评级、评分和评分映射规则
    - When：展开评估规则下拉并选择任一规则
    - Then：选项展示真实名称，页面状态保存唯一 `rule_id`，评估规则模块与规则详情一致
    - Given：同一规则 ID 的配置被修改
    - When：重新打开评估题
    - Then：读取并渲染最新规则配置，不使用旧快照
    - Given：评分规则的评分方式为「在分数上下限内输入评分」
    - When：普通评估题或子评估题完成规则选择和详情加载
    - Then：两个入口渲染同一个 `ScoreRangeSummary`，规则卡仅显示单行「下限 - 上限，小数位规则」摘要；普通题只在独立卡片显示评估方式，子评估题不显示额外卡片
    - Given：普通评估题或子评估题选择固定分值评分规则
    - When：规则详情加载完成
    - Then：两个入口渲染同一个 `FixedScoreOptionsSummary`，规则卡仅显示「分值选项」和分值标签，不显示评分配置、评分方式或精度；普通题附加卡位于共享组件之外，子评估题不显示附加卡
    - Given：固定分值同时包含短值和较长值
    - When：渲染分值列表
    - Then：每个标签按内容自适应宽度且不小于46px，超过759px内容区后自动换行，卡片不发生横向溢出
    - Given：普通评估题选择同一固定分值规则
    - When：规则详情加载完成
    - Then：规则卡复用 `FixedScoreOptionsSummary`，不恢复普通题独立的评分方式/精度模板；评估方式与展示方式仅由外围附加卡组件呈现
    - Given：新建或编辑子评估题选择评级规则，等级代号总宽超过规则卡内容区
    - When：规则详情加载并渲染只读评级档位导航
    - Then：胶囊按内容自适应、连接线数量为N-1、viewport内部裁切、灰色右箭头显示但不可操作，页面和卡片不横向溢出
    - Given：普通评估题选择同一评级规则
    - When：规则详情加载完成
    - Then：仍显示配置等级描述及适用的评估方式/展示方式，不出现子评估题只读导航
    - Given：普通评估题评级等级同时包含短代号、超长代号、空名称和固定色板颜色
    - When：配置等级描述完成渲染
    - Then：代号列按最宽内容在70–132px内共享增长，右侧列整体对齐；超长代号在132px底框内部显示ellipsis；背景使用对应trigger色；空名称显示 `--`
    - Given：评级规则详情的「评级可参与计算」关闭或开启
    - When：普通评估题完成规则选择和详情加载
    - Then：量化分列和「隐藏等级量化分」严格跟随规则详情配置；关闭时两者均不显示，开启时按 `hide_grade_quantified_score` / `hideGradeQuantifiedScore` 展示隐藏量化分当前状态；该项不进入评估题提交 payload
    - Given：普通评估题评级规则已加载
    - When：渲染评估方式和展示方式卡
    - Then：评级方式 label 与 radio group 上下排列；两个选项样式卡均为 `368×125px`，包含说明/单选区和标签或下拉预览区；`rating-off` 不显示隐藏量化分且卡片约 `800×263px`，`rating-on` 按配置显示且卡片约 `800×325px`
    - Given：普通评估题选择评分映射等级型规则
    - When：规则详情加载完成
    - Then：渲染唯一 `ScoreMappingSummary`；显示四列表头、派生区间文本、目标彩色等级胶囊、空名称 `--`、描述输入框和底部 `ScoreRangeSummary`；不得出现独立区间关系、波浪线区间、代号名称合并或通用 mapping row
    - Given：新建评估题或新建子评估题已选择评估规则并完成动态模块加载
    - When：用户修改基本信息中的类型
    - Then：立即清空 `rule_id`、规则详情和下方依赖规则的动态内容，评估规则恢复未选择；重新选择规则后才加载对应变体
    - Given：编辑评估题或编辑子评估题正在回填已有题目
    - When：回填已有类型和 `rule_id`
    - Then：回填不触发类型变更清空；类型真正改变后仍执行规则重置，并忽略旧规则详情的过期异步响应
    - 测试文件：`ReviewQuestionFormType.spec.ts`、`ReviewQuestionRuleSelect.spec.ts`、`ReviewQuestionEntryVariants.spec.ts`、`ReviewQuestionCreatePage.spec.ts`、API contract tests
    - 命令：`npm run test`
  - 验收：类型 radio 4 选项正确、描述/备注字数统计显示 /1000 和 /2000、两个入口的真实规则选项与 expanded/selected 契约一致、重名规则按 ID 正确区分
  - 证据：组件 diff；`ReviewQuestionEntryVariants.spec.ts`、`FixedScorePreviewNavigator.spec.ts`、`ReviewRulePreviewModal.spec.ts` 共27项聚焦测试通过；`npm run build`通过；目标参数见 `rating-tier-overflow-capture-contract.json`；浏览器截图diff因本地后端未启动保持not-run
  - 非范围：筛选、样式对齐（T06）
  - 完成定义：6 字段控件实现 + 类型 radio 交互 + 字数统计 + 评估规则 select 契约 + 测试通过

## PM-T005-T07 普通评估题评级动态分支契约

- [ ] PM-T005-T07 普通评估题评级动态分支契约
  - 目标：依据专项采集证据实现普通评估题评级方式和子评估项评级计算规则的显式动态变体
  - 类型：契约/前端/UI
  - 前置条件：T00、T03、T04；本次专项五个 source state 已进入 `extracted-ui-contract.json`
  - 必读：`spec.md` 第 13 节、`component-model.md` 第 8 节、`pixel-contract.md` 2026-08-31 增量章节、`acceptance-contract.md` AC-27A 至 AC-30A、`capture-manifest.md` 专项补采章节
  - 允许修改：`frontend/src/components/performance/ReviewRuleConfigRenderer.vue`、`frontend/src/components/performance/ReviewQuestionRuleAdditionalCards.vue`、`frontend/src/components/performance/ReviewQuestionDisplayMethodCard.vue`、`frontend/src/components/performance/ReviewQuestionEntryVariants.spec.ts`、`frontend/src/views/performance/ReviewQuestionCreatePage.spec.ts`
  - 允许新建：与 `component-model.md` 一致的评级方式、计算规则、子评估题、填写/查看顺序业务组件；不得重复新建 `ReviewQuestionDisplayMethodCard`
  - 禁止修改：已完成的规则选择、评分规则共享组件、子评估题评级档位溢出契约、API `rule_id` 语义、已有 source state 的 geometry/style
  - 共享文件与合并规则：评级方式按 `entry_mode + review_type + config + rating_method` 显式选择且保持现有提示图标行为；评分相关规则统一通过 `ReviewQuestionScoringMethodCard -> ReviewQuestionMethodSelector -> PerformanceRadioGroup` 渲染，range/mapping三项均有公共提示组件、fixed仅直接评分；计算规则组件仅在 `rating_method=sub_items` 时挂载；`calculation_rule=none` 必须复用 `PerformanceSortableList` 与 `PerformanceDragHandle`，`condition` 使用独立两列模板；展示方式继续复用既有共享组件；不得用规则名称或 option index 判断变体
  - 输入契约：最新规则详情 `rule_id`、`review_type=评级`、`grade_participates_in_calculation=true`、评级方式和计算规则本地状态
  - 输出契约：三种评级方式的 visible/forbidden 结构；子评估项评级下 `none/condition` 两种计算规则选中态；填写/查看顺序默认态包含加粗总标题、正常字重子标题、180×134卡片和138×56目标SVG；未采集的 condition editor、展示方式点击后态和顺序点击后态保持 blocked/not-observed
  - UI：普通评估题 create 页面；目标路由 `/perf/admin/review-questions/review-indicators/create`；source states 为 `idreamsky.feishu.cn_20260831_194405_608420:rating-method-direct`、`idreamsky.feishu.cn_20260831_194405_608420:rating-method-sub-items`、`idreamsky.feishu.cn_20260831_194405_608420:rating-method-total-score`、`idreamsky.feishu.cn_20260831_200737_944606:sub-items-calc-none`、`idreamsky.feishu.cn_20260831_200737_944606:sub-items-calc-condition`；独立 PNG 尚未生成，实现前不得宣称像素通过
  - 采集/像素门禁：`capture_integrity=passed`；新增五个变体有完整 artifacts；`implementation_readiness=ready` 仅限新增五个变体；全功能 `completion_status=incomplete`、`pixel_restore_status=blocked`；展示方式/填写查看顺序点击后证据和 rendered diff 未运行
  - API/数据库/权限/外部系统影响：无新增；只读取已有规则详情；不得将评级方式、计算规则、隐藏等级量化分写入评估题 payload；不修改规则
  - 测试契约：
    - Given：选择评级开启的评级规则
    - When：选择三种评级方式
    - Then：direct/sub_items/total_score 的 visible/forbidden 节点分别匹配 AC-27 和五个 source state
    - Given：评级方式为通过子评估项评级
    - When：选择不设置规则或按条件计算
    - Then：匹配 AC-28，且不得出现未采集的 condition editor
    - Given：分别渲染 direct、sub_items + none、sub_items + condition
    - When：检查评估方式白色卡片底部收口
    - Then：terminal margin 不与父卡片折叠，白色卡片内部保留 `21px±1px` 空白；实现使用 BFC 且不重复叠加 padding
    - Given：评级方式为通过子评估项评级
    - When：渲染填写顺序和查看顺序默认态
    - Then：显示14/600/22总标题；两个子标题为14/400/22；卡片与子标题间距8px；卡片180×134；预览SVG 138×56；主/次灰条分别为138×20和100×12
    - Given：填写顺序或查看顺序卡片切换选中态
    - When：检查标题/预览接缝
    - Then：未选中为#DEE0E3，选中为#F0F4FF并与标题背景融合；不得修改卡片尺寸、SVG和现有顺序交互
    - Given：展示方式显示标签样式和下拉样式
    - When：鼠标移入并切换选中项
    - Then：卡片使用pointer手型；选中时只有单一外框变为#3370FF，接缝变为#F0F4FF并与上半区融合，368×125尺寸不变；填写顺序组件不得修改
    - Given：下拉样式预览已渲染
    - When：检查右侧箭头
    - Then：复用DownBoldOutlinedIcon size=12，颜色#646A73，右/上下inset为12/10/10；不得使用⌄字符，公共默认size=10保持不变
    - Given：评级方式为直接评级或总分项计算评级
    - When：检查动态模块
    - Then：计算规则和子评估题结构不存在
    - 测试文件：`ReviewQuestionEntryVariants.spec.ts`、`ReviewQuestionCreatePage.spec.ts`
    - 命令：`npm run test`
    - 跳过/未运行规则：无 rendered contract 或截图 diff 时 pixel 结果记为 `not-run/blocked`；未采集状态不得以测试通过替代
  - 验收：结构、可见性、禁止元素、组件归属、source state 引用、容器关系和状态切换均通过；展示方式/顺序未覆盖范围仍明确 blocked
  - 证据：五个专项 session 的完整 artifacts、机器契约新增五个 states/variant contracts、组件模型/像素契约/验收契约增量章节、测试输出和后续 rendered diff
  - 阻塞项：展示方式标签/下拉点击后态、填写/查看顺序点击后态、rendered contract、截图 diff；全功能历史 disabled、ErrorFilled SVG、textarea resize after-drag
  - 非范围：评估规则新建/编辑/删除、真实评估题保存、普通题/子题筛选、规则版本/快照、条件数据写入、既有已完成规则变体改造
  - 完成定义：新增五个变体实现、正反向测试、真实运行时结构/样式/关系验收及截图 diff 均完成；只有主智能体可以勾选任务

### PM-T005-T07 实现交接（2026-08-31）

- 代码已实现：评级方式、子评估项计算规则、子评估题列表、顺序组件，以及共享展示卡片的兼容扩展。
- 聚焦测试：`ReviewQuestionEntryVariants.spec.ts` 20/20；T07 + 页面 + 规则选择回归 28/28。
- Vite 打包：通过。
- 完整 `npm run build`：被既有 `ReviewQuestionTable.spec.ts:48` 的 wrapper 类型错误阻塞，非 T07 文件。
- 全量 Vitest：479 通过、5 个既有失败，失败集中于 `LevelConfigEditor.spec.ts`、`PerformanceTemplateCreate.spec.js`、`PerformanceTemplateManagement.spec.js`，与 T07 无关。
- rendered contract、真实应用截图 diff 和 T00/T03/T04 前置任务勾选未完成，T07 保持 `[ ]`。
- 2026-09-01 顺序区域修复：新增总标题、子标题恢复400字重、固定8px间距与180×134卡片，并用采集到的138×56 SVG替代8px CSS灰条；聚焦测试25/25、Vite生产打包通过。
- 2026-09-01 动态列表修复：direct/none/condition 卡片按单一 terminal gap 收口并通过 `flow-root` 阻止末尾 margin 折叠；none 复用 `PerformanceSortableList` 与 `PerformanceDragHandle` 并恢复整行拖拽；condition 切换为名称493px + 规则257px两列且移除手柄、上下限、删除、新建；相关测试36/36、Vite生产打包、规格门禁和前端容器构建通过。
- 2026-09-01 评分方式组件优化：新增 `ReviewQuestionMethodSelector` 与 `ReviewQuestionScoringMethodCard`；range/mapping统一三项评分方式与3个公共InfoOutlined，fixed仅直接评分与1个InfoOutlined，评分选项继承公共pointer手型；评级方式及其仅末项提示图标保持不变；相关测试25/25、Vite生产打包和规格门禁通过。
- 2026-09-01 展示方式交互修复：标签/下拉卡片使用pointer手型；选中态为单一蓝色外框，接缝从未选中#DEE0E3切换为与上半区一致的#F0F4FF，choice/preview不分别绘制蓝边，消除独立横线并保持368×125不位移；相关测试25/25、Vite生产打包和规格门禁通过。
- 2026-09-01 填写/查看顺序 seam 修复：不改标题、字重、180×134卡片、138×56 SVG和顺序逻辑，仅增加绝对定位seam；未选中#DEE0E3，选中#F0F4FF并与标题背景融合；相关测试25/25、Vite生产打包和规格门禁通过。
- 2026-09-01 下拉预览箭头修复：`DownBoldOutlinedIcon`增加默认10px的size prop，下拉样式使用size=12、#646A73和目标path，替换⌄字符；表格既有默认调用保持10px；相关测试28/28、Vite生产打包和规格门禁通过。

## PM-T005-T08 子评估题候选数据联动

- [ ] PM-T005-T08 子评估题候选数据联动
  - 目标：提供按计算规则过滤的子评估题候选，并联动显示规则名称和评分上下限
  - 类型：API/前端/UI
  - 前置条件：T00、T03、T04、T07
  - 必读：`api-contract.md` 第10节、`spec.md` 第13.4节、`component-model.md` 第8.10节、`acceptance-contract.md` AC-29J
  - 允许修改：`backend/app/performance/review_router.py`、`backend/tests/test_performance_review_questions.py`、`frontend/src/api/performance.ts`、`frontend/src/views/performance/ReviewQuestionCreatePage.vue`、`frontend/src/views/performance/ReviewQuestionCreatePage.spec.ts`、`frontend/src/components/performance/ReviewQuestionRuleAdditionalCards.vue`、`frontend/src/components/performance/ReviewQuestionRatingMethodSection.vue`、`frontend/src/components/performance/ReviewQuestionSubQuestionList.vue`、`frontend/src/components/performance/ReviewQuestionEntryVariants.spec.ts`
  - 允许新建：`frontend/src/components/performance/ReviewQuestionSubQuestionSelect.vue`
  - 禁止修改：数据库迁移、评估题保存payload、评级方式/展示方式/顺序组件、规则版本或快照契约
  - 共享文件与合并规则：候选资格由后端按规则类型和评级参与计算配置判断；前端不得通过规则名称过滤；行只保存question_id，派生列只读
  - 输入契约：`calculation_rule=none|condition`；现有子评估题及其active规则
  - 输出契约：候选DTO包含题目ID/名称、规则ID/名称、评估类型、参与计算标识和上下限；下拉双行；选择后派生列联动
  - UI：none保持拖拽/三列/操作；condition保持两列无操作；未选择派生列为灰底`--`
  - API/数据库/权限/外部系统影响：新增只读候选GET；复用现有配置管理权限；无迁移、无写请求
  - 测试契约：
    - Given：候选同时包含评级开启/关闭、评分、评分映射和普通题
    - When：请求none或condition
    - Then：分别匹配AC-29J过滤矩阵
    - Given：固定分值为1/3/5
    - Then：DTO上下限为1/5
    - Given：前端选择候选
    - Then：规则名和上下限自动联动；option显示名称+评估类型
    - 测试文件：后端`test_performance_review_questions.py`；前端`ReviewQuestionCreatePage.spec.ts`、`ReviewQuestionEntryVariants.spec.ts`
    - 命令：`pytest backend/tests/test_performance_review_questions.py`；`npm run test -- ...`
    - 跳过/未运行规则：父题保存子题选择与顺序不属于本任务，不得宣称已持久化
  - 验收：候选过滤、双行option、派生列、规则切换清理、错误/加载状态通过；无非法候选
  - 证据：API测试、组件测试、构建、运行截图
  - 阻塞项：真实保存和重开另行开发
  - 非范围：子题关系持久化、排序持久化、数据库迁移
  - 完成定义：API和前端联动实现、测试通过；runtime截图diff完成前pixel保持blocked

### PM-T005-T08 实现交接（2026-09-01）

- 新增只读候选接口，none/condition按关联规则类型和评级参与计算开关过滤。
- 固定分值上下限按有效option value的min/max派生；评级和上下限评分分别按量化分或配置边界派生。
- 新增双行子评估题选择器，selected只显示题名；option显示题名+评估类型。
- 行状态只保存question_id，规则名称和上下限只读派生；策略切换清理非法选择。
- 后端测试12/12；前端测试30/30；Vite打包通过；vue-tsc仅被既有ReviewQuestionTable.spec.ts:48阻塞。
- 子题选择/顺序保存和重开未实现，T08保持`[ ]`。

### 2026-09-01 已完成专项证据投影（非完成任务）

本次只将已完成的四个评分上下限计算规则 after 状态投影到规格和机器契约，不新增或勾选原子任务，不修改业务代码。

| variant | source_state_id | 已投影内容 | 状态 |
|---|---|---|---|
| `regular-score-range-sub-items-calc-none` | `idreamsky.feishu.cn_20260901_201458_140596:score-range-sub-items-calc-none` | 计算规则、子评估题区域、既有展示/填写查看顺序区域 | captured |
| `regular-score-range-sub-items-calc-weighted_sum` | `idreamsky.feishu.cn_20260901_201458_140596:score-range-sub-items-calc-weighted_sum` | 同上，另含「权重」列 | captured |
| `regular-score-range-sub-items-calc-direct_sum` | `idreamsky.feishu.cn_20260901_201458_140596:score-range-sub-items-calc-direct_sum` | 计算规则、子评估题区域、既有展示/填写查看顺序区域 | captured |
| `regular-score-range-sub-items-calc-average` | `idreamsky.feishu.cn_20260901_201458_140596:score-range-sub-items-calc-average` | 计算规则、子评估题区域、既有展示/填写查看顺序区域 | captured |

四个变体仅在 `readiness_scope=variant` 下可作为实现输入；提交后的必填校验、新建子评估题弹窗、展示方式点击后态和 rendered screenshot diff 仍未完成。原子任务保持未勾选。

## PM-T005-T05 筛选入口

- [ ] PM-T005-T05 筛选入口
  - 目标：评估题和评估规则统一使用 `PerformanceListToolbar` 的搜索 + 筛选入口，不在评估题工具栏下方重复挂载筛选面板
  - 类型：frontend
  - 前置条件：T01
  - 必读：spec.md 3.5（筛选按钮位置/颜色）
  - 允许修改：`ReviewQuestionManagement.vue`、`ReviewRuleManagement.vue`、`PerformanceListToolbar.vue`
  - 禁止修改：无
  - 共享文件与合并规则：`PerformanceListToolbar` 是唯一列表搜索/筛选入口；`ReviewQuestionFilterPanel` 不得在评估题列表页面挂载
  - 输入契约：现有 `keyword` 和 toolbar filter 事件
  - 输出契约：新建按钮、搜索框和筛选按钮各只出现一份
  - UI：筛选按钮在工具栏右侧（x=1800），搜索在中；点击筛选不新增第二个搜索框或筛选按钮
  - API/数据库/权限影响：无
  - 测试契约：
    - Given：打开评估题列表并点击筛选
    - When：工具栏事件触发
    - Then：页面不挂载 `ReviewQuestionFilterPanel`，搜索框和筛选按钮仍各只有一份
    - 测试文件：`ReviewQuestionManagement.spec.ts`
    - 命令：`npm run test`
  - 验收：评估题与评估规则使用一致的 toolbar 结构，评估题下方无重复筛选面板
  - 证据：组件 diff、测试通过、截图
  - 阻塞项：无
  - 非范围：真实筛选查询逻辑
  - 完成定义：删除评估题额外筛选面板挂载 + 回归测试通过

## PM-T005-T06 样式对齐（tokens + Element Plus 覆盖）

- [ ] PM-T005-T06 样式对齐
  - 目标：tokens.css 对齐飞书 + Element Plus 覆盖 radio/input/textarea/按钮样式
  - 类型：frontend
  - 前置条件：T00、T02、T03、T04
  - 必读：spec.md 3.3/3.4/3.5（颜色/结构）、`feishu-design-tokens-components.md`
  - 允许修改：`frontend/src/styles/tokens.css`、`frontend/src/styles/element-overrides.css`、`frontend/src/components/performance/ReviewRuleConfigRenderer.vue`、`frontend/src/components/performance/ReviewQuestionRuleAdditionalCards.vue`、`frontend/src/components/performance/ReviewQuestionEntryVariants.spec.ts`、`frontend/src/views/performance/ReviewQuestionCreatePage.spec.ts`
  - 禁止修改：无
  - 共享文件与合并规则：tokens.css 只对齐飞书值，不引入旧变量族；`ReviewRuleConfigRenderer.vue` 仅补充已采集 `sub_question + score-fixed` 变体，不改变普通题评分变体契约
  - 输入契约：飞书 token（主色 #3370ff、正文 #1f2329、边框 #bbbfc4、危险 #d83931、圆角 6px/32px、间距 4/8/10/12/16/20/24/32）；`20260830_211313_909144:score-fixed` 的 `fixed-score-options`、759px 内容边界及分值标签 computed 参数
  - 输出契约：
    - radio：wallpaper 外圈 + checked-ink 选中态（主色）
    - input/textarea：圆角 6px、placeholder 色、字数统计标签样式
    - 按钮：新建蓝底白字、筛选白底深字
    - 子评估题固定分值：只显示「分值选项」和分值标签，不显示「评分配置」「评分方式」「精度」或普通题附加卡片
    - 分值标签：按单项文本自适应宽度，`min-width=46px`、`height=21px`、`padding=0 8px`、`border=0`、`border-radius=1000px`、背景 `rgb(225,234,255)`、文字 `rgb(12,41,110)`
    - 分值列表：限制在约759px内容区内并自动换行，卡片高度随多行内容增长
    - 子评估题评级档位：复用 `PerformanceOptionNavigator` 的结构，增加默认不影响既有预览的 `fluid` 和 `interactive=false` 变体；目标参数引用 `rating-tier-overflow-capture-contract.json`
    - 子评估题评级溢出：10项/9连接线、viewport约759×38、track高32、胶囊最小42×32、连接线12–88、只读右箭头、无左箭头、卡片自然高度
    - 普通评估题评级：必须保持配置等级描述结构，禁止被子评估题导航替换
  - UI：视觉对齐飞书采集值；固定分值变体引用 `20260830_211313_909144:score-fixed` 和目标截图 `C:\\Users\\gaby.liu\\ClonedSites\\idreamsky.feishu.cn_20260830_211313_909144\\captures\\hybrid_steps\\step_18\\after\\after.png`
  - API/数据库/权限影响：无
  - 测试契约：
    - Given：引入 element-overrides.css
    - When：渲染 radio/input/按钮
    - Then：computed 样式匹配飞书 token（主色/圆角/字数统计）
    - 测试文件：无（视觉验收）
    - 命令：`npm run build`（构建通过）
  - 验收：构建通过、视觉对齐飞书（截图对比）
  - 证据：tokens.css diff、构建通过、截图对比
  - 阻塞项：无
  - 非范围：无
  - 完成定义：样式对齐 + 构建通过 + 视觉截图确认

- 2026-09-16 展示方式持久化修复：移除编辑加载规则时把题目级 `display_mode` 重置为标签样式的逻辑；标签/下拉选择继续由唯一 `ReviewQuestionDisplayMethodCard` 管理，并通过 `PerformanceRatingControl` 贯通模板预览、配置填写内容和绩效填写页。后端题目级持久化与真实编辑回填已验证。
