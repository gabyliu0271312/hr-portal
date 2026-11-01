# CR-010 结果沟通与校准配置驱动展示

- 状态：本地代码与定向验收完成；真实数据库迁移/生产验收未执行
- 确认日期：2026-11-01
- 关联：CR-005、CR-007、CR-008、Spec 002 结果沟通与校准节点
- UI 蓝图：`specs/002-performance-management/ui-blueprints/CR-010-T02-result-communication-and-calibration.md`（v1）
- UI 证据：`CR-010-T02-result-communication-v1.png`、`CR-010-T03-calibration-v1.png`

## 1. 背景与目标

绩效评估前台的结果沟通和校准节点已经存在流程配置与任务生成能力，但现有评估页主要按普通节点或评估型成员工作区展示。用户确认通过配置驱动和公共组件复用快速落地：结果沟通复用 360°反馈列表与已完成只读抽屉；校准复用上级评价人员列表，人员严格来自项目配置命中的冻结校准任务。

## 2. 已确认口径

### 结果沟通

- 节点开始后进入“我团队的绩效 → 绩效结果沟通”直接展示人员表格。
- 表格列：姓名、状态、截止时间、360°评估率、序列、职级、入职日期、所属部门、员工类型、上期职级。
- 360°评估率为 `N/M`：`M` 是所有为该员工执行 360°评估的人员，包括邀请和自愿评估；`N` 是已完成评估的人员。
- 上期职级来自上一绩效周期已发布结果中的职级。
- 待处理人员点击后进入对应结果沟通页面；已完成人员打开只读抽屉，不离开列表。

### 校准

- 节点开始后直接展示人员表格。
- 展示框架复用上级评价成员列表。
- 人员指项目配置校准规则命中的被校准人员，不是校准人名单，也不是项目全量人员。
- 任务范围以项目启动时生成并冻结的校准阶段任务为准。
- 点击人员进入对应项目、阶段和员工的校准任务。

## 3. 复用与实现边界

- 复用 `PerformanceManagementTable`、`PerformanceReview360FeedbackPanel` 的 360°表格框架、`ProjectMemberListPanel` 的上级评价列表框架和 `PerformanceReviewEvaluationDrawer` 的已完成只读抽屉。
- 复用现有节点任务、对象授权、项目成员快照、校准阶段分配和模板任务 API，不新增平行任务引擎。
- 将 `result_communication` 纳入模板任务入口映射，保留节点类型语义；不伪装为 `evaluation`。
- 新增结果发布职级快照字段到现有 `performance_result_openings`，在结果开通时保存项目成员快照中的 `position_level`。既有记录没有该字段时返回空值并展示 `--`，不使用当前职级倒填。
- 360°评估率由后端按项目、周期、被评估员工和有效 360°评估任务聚合；不由前端用列表行数推算。

## 4. 非目标

- 不新增结果计算引擎、绩效结果主表或完整结果发布生命周期。
- 不改变校准规则、校准阶段、校准任务生成和冻结语义。
- 不改变角色目录、静态角色授权或权限范围。
- 不新增独立页面、独立表格组件或第二套模板渲染器。
- 不迁移、删除或回写现有历史任务；不做生产数据库操作、部署、提交或推送。

## 5. 原子任务

### CR-010-T01 后端任务展示数据与发布职级快照

- 结果沟通任务支持模板任务读写入口。
- 人员列表返回 `360_completion_rate`、`previous_position_level` 等展示字段。
- 360°评估率统计邀请和自愿评估任务的有效人员集合，完成状态按任务提交状态判断。
- 上期职级从上一周期已开通结果的职级快照读取；缺失时为 null。
- 结果开通时写入当前项目成员快照职级，新增迁移可升级/降级。
- 校准列表继续按现有冻结阶段任务和对象授权返回，不能扩大范围。

### CR-010-T02 前端结果沟通展示与只读抽屉

- 结果沟通节点直接展示 360°反馈表格框架。
- 待处理行进入结果沟通模板任务；已完成行打开只读抽屉。
- 表格使用确认列和公共排序、分页、搜索、列展示、加载、空态、错误态。
- 对应蓝图：`CR-010-T02-result-communication-v1.png`。

### CR-010-T03 前端校准展示

- 校准节点直接展示上级评价成员列表框架。
- 列表只消费校准任务，不重新计算校准人员。
- 点击行进入对应阶段校准模板任务；已完成任务保持现有只读/回看行为。
- 对应蓝图：`CR-010-T03-calibration-v1.png`。

### CR-010-T04 回归与验收证据

- 后端：`python -m pytest hr-portal/backend/tests/test_performance_projects.py -q --tb=short` → **323 passed、4 skipped、1 条第三方弃用警告**。
- 前端：`npm --prefix hr-portal/frontend test -- --run src/views/performance/Review.spec.ts` → **30 passed**；包含结果沟通列表/抽屉、待处理路由、校准阶段和未开始状态。
- 前端回归：`PerformanceReviewEvaluationDrawer.spec.ts` 与 `Review.spec.ts` → **29 passed**；`npm --prefix hr-portal/frontend run build` → **vue-tsc + Vite 通过**。
- 浏览器：真实 Vite 5173 + Playwright 受控 API 夹具验证结果沟通表、`N/M`、上期职级、已完成只读抽屉和校准人员列表；pageerror **0**。证据：`ui-blueprints/CR-010-T02-implemented-result-communication.png`、`CR-010-T02-implemented-result-communication-readonly-drawer.png`、`CR-010-T03-implemented-calibration.png`。
- 迁移：新增 `0288_pm_published_level`，当前 Alembic 单 head；未执行业务库 upgrade/downgrade，未执行真实 PostgreSQL 验收。
- 未执行：生产登录态、真实业务库保存—重开、部署、commit、push。

## 6. 兼容性与数据边界

- 现有 `PerformanceResultOpening` 记录保留；新增快照字段允许为空。
- 已启动周期、项目、节点和校准任务不重建、不按实时花名册重算。
- 新增结果沟通入口只消费当前用户实际有权限的任务。
- 表格基础信息继续受主题可见字段规则裁剪。
- 任务详情接口仍校验可信员工身份、处理人、项目、节点和阶段。

## 7. 当前风险

- 历史结果开通记录在新增字段上线前没有发布职级，历史行显示 `--`，这是数据事实，不回填当前职级。
- 代码库当前没有独立的绩效结果主表；本轮只把现有结果开通记录作为最小发布结果快照，不扩展完整结果生命周期。
- 360°评估率必须以有效任务和人员集合为准，若历史任务缺少来源标记，需要沿用现有 360°节点角色码识别。

## 8. CR-010-F01 直属上级与 360°评估率回显修复（2026-11-01）

- 用户验收要求：直属上级显示姓名；无 360°评估人时也显示蓝色 `0/0`，有任务时显示真实 `N/M`。
- 根因：评估成员列表映射漏接 `direct_supervisor` 并将 `completion` 写死为 null；项目成员响应未声明直属上级；后端仅结果沟通计算 360°率，其他共享成员入口未接入。
- 修复：项目成员与评估任务人员接口复用同一 360°聚合；直属上级姓名按项目成员快照的 `source_snapshot_id` 关联当期授权人员快照，支持上级不在本项目被评估人范围，禁止使用实时花名册覆盖历史关系。姓名仍受 `direct_supervisor` 字段可见性控制。
- UI：`ProjectMemberListPanel` 保留上级姓名与接口评估率；与结果沟通表统一对空率显示 `0/0`，使用平台 `--color-primary`（#3370FF）；复用原公共表格、列配置和路由，不新增交互或弹层。评估成员本地排序使用 N/M 数值比例。
- 影响范围：`projects_router.py`、`api/performance.ts`、`ProjectMemberListPanel.vue`、`PerformanceReview360FeedbackPanel.vue` 及现有项目/评估测试；无迁移、角色修改、生产数据操作。
- 后端验证：`python -m pytest hr-portal/backend/tests/test_performance_projects.py -q --tb=short` → **328 passed / 4 skipped / 1 第三方弃用警告**；新增跨项目成员范围的快照上级解析、两类列表入口的姓名允许/拒绝及 0/0 回读覆盖。
- 前端验证：`npm --prefix hr-portal/frontend test -- src/views/performance/Review.spec.ts src/views/performance/ProjectManagement.spec.ts` → **47 passed**；覆盖项目/评估成员上级姓名、0/0 与 2/3 映射、结果沟通空率兜底。
- 构建：`npm --prefix hr-portal/frontend run build` → vue-tsc 与 Vite 通过（既有 VueUse PURE 注释告警）；`git diff --check` 通过。
- UI 证据：`ui-blueprints/CR-010-F01-implemented-supervisor-zero-rate.png`，真实 Vue 页面＋受控 API 夹具，已检查截图与计算样式，姓名可见、`0/0` 为 rgb(51,112,255)，pageerror=0；不是生产或真实数据库验收。
- UI 门禁：沿 CR-010 v1 做字段映射及样式小修，不改变信息架构，无需新蓝图；遵循 Spec012 N00/N11 通用规范，不涉及 UCP/数仓专属任务。
- 未执行：真实业务库/生产登录态验收、提交、推送、部署；保留并行填写工作区修改和既有文件删除、临时文件。

## 9. CR-010-F03 员工类型字段权限与列展示对齐（2026-11-01）

- 目标：修复结果沟通表固定显示“员工类型”，但后端字段权限裁剪为 null 后仍呈现空列的问题。按现有字段可见性配置展示真实快照值，不更改默认角色授权、不绕过权限、不回填历史快照。
- 已核对：花名册 `employee_type` → 周期人员快照 → 项目成员快照 → 人员 API 字段映射完整；默认上级/校准人/HRBP规则不含员工类型，接口会置空；项目管理员默认允许。
- 前端：`PerformanceReview360FeedbackPanel.vue` 的结果沟通模式根据响应 `visible_profile_fields` 筛选个人信息列；员工类型、序列、职级、入职日期、部门、上期职级统一服从字段权限（上期职级沿职级权限）。未授权列不在表格或列设置中出现，也不计为用户隐藏列；混合行仅呈现各自有权限的值，排序不使用被拒绝的值。360反馈模式不变。
- 权限变化：刷新项目/节点后移除失去权限的列，新获得权限的列按配置顺序恢复；保留用户主动隐藏的已有可见列。已授权但快照源值为空仍展示 `--`，不伪造“正式员工”等默认值。
- 代码范围：现有结果沟通表组件、`Review.spec.ts`、后端既有项目测试。无后端业务逻辑修改、无迁移、无权限配置写入或生产操作。保留此前状态统一未提交改动；360“已拒绝”图标仍待用户补充采集依据，不纳入本轮完成范围。
- 后端测试：`python -m pytest hr-portal/backend/tests/test_performance_projects.py -q --tb=short` → **330 passed / 4 skipped / 1 第三方弃用警告**；覆盖项目/评估/结果沟通三个入口的实际员工类型允许与拒绝回读。
- 前端测试：`npm --prefix hr-portal/frontend test -- src/views/performance/Review.spec.ts src/views/performance/ProjectManagement.spec.ts src/components/performance/PerformanceReminderPanel.spec.ts` → **67 passed**（包含已有状态统一回归）；员工类型本轮新增4项覆盖授权、拒绝、授权缺值、刷新与混合权限。
- 构建：`npm --prefix hr-portal/frontend run build` → vue-tsc + Vite 通过（既有第三方 PURE 注释告警）；`git diff --check` 通过。
- 真实 Vue 页面＋受控 API 夹具：有权限显示“正式员工”，无权限不显示员工类型列；pageerror=0。独立截图：`ui-blueprints/CR-010-F03-implemented-employee-type-allowed.png`、`ui-blueprints/CR-010-F03-implemented-employee-type-denied.png`，已查看实际截图。
- UI 门禁：既有列可见性小修，沿CR-010 v1，无新信息架构和蓝图；Spec012 N00/N11通用约束适用，无数仓/UCP改动。
- 未执行：真实生产接口/数据库验收、修改现有角色字段可见设置、提交、推送、部署。若要让当前默认无权限的上级或校准角色看到员工类型，需在后台可见性设置中明确启用，不以本次修复静默扩权。

## 10. CR-010-F02 评估表格状态统一与360已拒绝样式（2026-11-01）

- 用户确认：通用表格只显示“待完成、已完成、已逾期”；360°反馈额外保留“已拒绝”。用户补充的拒绝采集来自 `/perf/review/7035907577847760388/7035917118351771137/members`，图标为6px红点#F54A45，右距8px，下移1px；文字14px/22px、400、#1F2329。
- 公共展示：新增 `PerformanceTaskStatus.vue` 和 `performanceTaskStatus.ts`，样式使用 `tokens.css` 的任务状态token；橙色#FF8800待完成、绿色#62D256已完成、红色#F54A45已逾期；360拒绝沿采集红点与1px偏移，不使用新SVG或胶囊标签。
- 接入：`ProjectMemberListPanel`（上级评价/校准）、`PerformanceReview360FeedbackPanel`（360/结果沟通）、`PerformanceReview360InvitePanel`、`PerformanceTaskTable`（催办人员）复用同一组件。原表格文案“待评估/待填写/已提交/已邀请”收敛为三种显示。侧栏、后台配置状态、结果开通资格等非任务状态不变。
- 行为：已完成优先于逾期判断；pending且有效截止时间已过只在展示层转为逾期；未开始/无效日期不强造逾期。`allowRejected` 仅由360反馈模式开启，拒绝优先于截止时间判断，原行状态与点击事件保持不变；不改变任务写入、权限、节点时窗或生成拒绝记录。
- 接口：360反馈列表保留已有任务的 `rejected`，不再将其投影为pending；保留已有completed和submitted_at完成信息。DTO允许四种反馈状态。未新增拒绝操作、API、数据表、迁移或授权。
- 测试：前端 `Review.spec.ts`、`ProjectManagement.spec.ts`、`PerformanceReminderPanel.spec.ts`、`PerformanceReviewEvaluationDrawer.spec.ts` 共 **72 passed**，包括完成优先、拒绝优先、无效日期、通用三状态、360四状态及原事件状态保留；后端 `test_performance_projects.py` **334 passed / 4 skipped / 1 第三方弃用警告**，含360状态只读透传测试。
- 实际UI：真实Vue页面＋受控API夹具验证360四状态及校准三状态，pageerror=0；实际计算样式6x6px圆点/8px右距/14px字号/22px行高/#1F2329文字，拒绝红点rgb(245,74,69)、top=1px。已查看截图 `ui-blueprints/CR-010-F02-implemented-feedback-four-statuses.png`、`ui-blueprints/CR-010-F02-implemented-calibration-three-statuses.png`。
- UI门禁：延用CR-010 v1，用户采集明确的既有样式/文案小修，无新信息架构；Spec012 N00/N11通用规则适用，无UCP/数仓改动。
- 最终构建：`npm --prefix hr-portal/frontend run build` 已完成，vue-tsc + Vite通过（Vite 46.29s，既有第三方PURE注释告警）；`git diff --check`通过。
- 未执行：真实登录/业务数据库拒绝记录验收、拒绝操作生命周期、生产部署、commit、push。F03记录中的“拒绝图标待补”已由本节用户采集补齐；其历史边界不作为当前阻塞。

## 11. CR-010-F04 评估列表姓名头像统一（2026-11-01）

- 用户确认：以 `ProjectMemberListPanel` 姓名列为标准，统一绩效评估列表的头像+姓名展示。
- 实现：提取共享 `PerformanceMemberIdentity.vue`，沿用32px圆形文字头像、取姓名末字、头像背景/文字色及12px姓名间距；接入 `ProjectMemberListPanel`、360°反馈/结果沟通、360°邀请表。公共表格外壳、列、权限、数据接口、点击/撤销行为不变。
- 长姓名：姓名容器保留 `min-width:0`、`text-overflow:ellipsis`、`white-space:nowrap`，头像不被文本挤压。
- 验证：前端 `Review.spec.ts`、`ProjectManagement.spec.ts` → **70 passed**；构建通过。真实 Vue 夹具检查四个列表头像32×32px、姓名间距12px、长姓名省略、pageerror=0。截图：`ui-blueprints/CR-010-F04-implemented-feedback-identity.png`、`CR-010-F04-implemented-communication-identity.png`、`CR-010-F04-implemented-calibration-identity.png`、`CR-010-F04-implemented-invite-identity.png`。
- 未执行：生产登录/部署/提交/推送；保留并行抽屉改动、删除项和临时文件。

## 12. CR-010-F05 已完成导航标签与头部字段文案（2026-11-01）

- 用户确认：绩效评估左导航completed节点保留入口但隐藏“已完成”状态标签；填写页头部直属上级值前加“直属上级：”，入职日期值后加“ 入职”。
- 修改范围：`PerformanceReviewCategorySidebar.vue`仅调整标签v-if；`PerformanceSelfSummaryHeader.vue`及共享详情头`PerformanceReviewPersonHeader.vue`按profile字段key格式化直属上级和入职日期。其他字段、返回/选择节点和表格状态不变。
- 权限边界：仅格式化已返回且有值的字段；`profile_fields=[]`不回退读取旁路字段、不产生空标签；旧版无profile_fields时保留原fallback并补直属上级前缀。无接口/权限/数据/迁移修改。
- 测试：`PerformanceSelfSummaryHeader.spec.ts`、`PerformanceReviewPersonHeader.spec.ts`、`Review.spec.ts`、`ProjectManagement.spec.ts`、`SelfSummaryTask.spec.js`五文件 **109 passed**；覆盖已完成入口保留/标签隐藏、其他状态保留、上级/入职格式、空值与字段权限。
- 实际Vue页面＋受控API夹具：完成导航无标签且入口保留，待完成标签保留；填写头正确显示“直属上级：经理示例”“2017-11-01 入职”，pageerror=0。独立截图：`ui-blueprints/CR-010-F05-implemented-completed-navigation.png`、`ui-blueprints/CR-010-F05-implemented-task-header.png`，已查看填写头截图。
- UI门禁：用户明确的既有文案/可见性小修，沿原布局，不生成新蓝图；遵循Spec012 N00/N11，无UCP/数仓影响。
- 未执行：生产登录态/部署/提交/推送。保留并行CR-011抽屉改动，本轮不声明其完成。

## 13. CR-010-F06 公共富文本空态、换行、校验与保存修复（2026-11-01）

- 目标：按REA采集机制修复填写富文本五个问题：光标与首字提示错位、清空后额外退格双提示、空必填提交误弹工具栏提示、清空重填后Enter失效、退格中自动保存积压。复用公共编辑器，不新增表单引擎。
- 采集依据：`ev_60b2e5fee8435e142f78e4a87e5f046878fa6d33061368f6f7c6e594e723db4f`、`ev_23bee1170d971267bda4f6cde52ed52357e5ff9f46f4235b8d9d85f4e7dcc30a`，飞书Editor Kit的模型空态占位/选区换行及草稿合并机制。未取得完整可复用SDK，不声称内部源码100%相同；未复制或运行捕获生产脚本。
- 范围：`PerformanceRichTextEditor.vue`、`PerformanceRichTextBox.vue`、`PerformanceTemplateRenderer.vue`、`SelfSummaryTask.vue`及已有配置预览/公共渲染/填写测试；保留HTML字符串答案、API、版本和字段权限。无后端/迁移/业务权限修改，不动并行CR-011抽屉工作。
- 占位：删除独立`.rich-placeholder`，仅按空内容设置`data-placeholder`，用编辑器内绝对定位`::before`显示；不再依赖DOM`:empty`。提示与正文使用同一padding坐标。
- 编辑：空态保留单个`.ace-line`与零宽文本叶；在删除边界保护/输入后修复非标准结构；移动现有文本节点时保留选区偏移；Enter按光标位置拆行、跨行选区保留首尾、延续粗体和列表，光标落在新行文本叶。IME组合期间不重建DOM或上报中间答案，组合结束再同步。光标折叠时不为格式判断遍历全文文本节点。
- 校验：优先聚焦正文contenteditable，其次input/textarea，最后才回退按钮；不再误聚焦粗体按钮并触发tooltip。缺失必填仍显示原错误与滚动定位。
- 保存：保留本地原350ms防抖参数（飞书运行参数未知，不冒称采集值）；一次在途请求＋最新待发标记，实际发送时才生成全量payload；连续修改覆盖待发草稿，内容未变跳过重复写；保留version顺序和保存失败提示，卸载后不发新请求。响应不覆盖正在输入的内容。
- 回归：六文件`SelfSummaryTask.spec.js`、`PerformanceTemplateRenderer.spec.ts`、`PerformanceContentRenderer.spec.ts`、`PerformanceAssessmentContentLayers.spec.ts`、`PerformanceReviewEvaluationDrawer.spec.ts`、`Review.spec.ts` **216 passed**；新增清空额外删除、重填光标拆行、跨行、粗体/列表、IME确认、校验焦点、慢请求合并、版本提交、失败恢复及卸载停止覆盖。配置预览旧提示节点断言改为单一属性提示。
- 真实Chromium＋本地实际Vue路由/受控API：反复退格后单空行，光标/正文/提示x均为921；必填失败焦点在正文、tooltip=0；清空重填两行、连续退格重填及列表换行通过；阻塞首个保存期间3次修改仍仅1次在途，释放后总2请求(version1→2)，最新草稿用夹具重开一致；390px无横向溢出、pageerror=0。未在飞书生产正文输入或提交。
- UI证据：`ui-blueprints/CR-010-F06-implemented-empty-rich-text.png`、`CR-010-F06-implemented-validation-focus.png`、`CR-010-F06-implemented-retype-linebreak.png`；已查看空态截图。属于原工作区内部Bug修复，沿原蓝图，不新增信息架构；Spec012 N00/N11适用，无UCP。
- 构建：当前工作树执行`npm --prefix hr-portal/frontend run build`通过（vue-tsc＋Vite，37.32s）；`git diff --check`通过。
- 未执行：飞书完整SDK移植/所有未采集内部行为同一性验收、操作系统真实中文输入法端到端验收（仅composition事件测试）、真实业务库保存重开、生产卡顿性能剖析、部署、commit/push。五项行为在受控环境修复，不宣称真实生产或全部性能问题已验收。


### CR-010-F06 列表与多条标题差异补齐（2026-11-01）

- 用户确认：修复已定位的标题序号字体、编辑/保存回显列表变色、列表行首退格误合并、无序符号偏粗、有序编号非蓝色、列表缩进与组合格式对齐差异；沿原工作区内部缺陷修复，不新增页面或信息架构，不要求新蓝图。适用Spec012 N00/N11，未涉及UCP；不改并行CR-011抽屉、头部及设计文档。
- REA依据：既有`ev_60b2e5fee8435e142f78e4a87e5f046878fa6d33061368f6f7c6e594e723db4f`中的模块575527及业务适配列表插件；本轮页面身份`ev_84f90cf304fcf3aa05b36d82e3ca14c1879e39f2dcf6e5a89b79604259968a16`。配合CDP只读取得命中CSS与计算样式：无序符号为Arial 18px/400的字符`•`、有序/无序符号#3370FF、一级正文偏移22px、实际行块24px、上下margin=0。未全量分析所有页面资源，未在飞书业务正文输入或保存提交，不声称完整SDK内部同一性。
- [x] F06-L01：题目标题新增专用字体token，Windows中文和数字均实测使用MicrosoftYaHei-Bold，保持原600字重；不全局更换Portal字体。
- [x] F06-L02：编辑器与只读答案使用同一`performance-rich-text-content`样式及列表token。移除原6px实心圆与灰色绝对定位编号，改字符圆点及蓝色行内编号；正文缩进22px、普通/列表行24px。取消编号伪元素百分比高度，实际高度与飞书实测约16.8px一致，避免宿主尺寸反向撑高行块。
- [x] F06-L03：折叠光标位于列表正文起点，Backspace或deleteContentBackward先降级当前行。OL→保留22px缩进的无编号段落→普通段落；UL→普通段落。保留当前行、选区、文字格式；普通正文内删除、前向Delete、选区删除、IME不走该分支。修复单空列表被全文空态保护提前拦住的问题，输入后维护编号。
- [x] F06-L04：前后端净化保留限定列表class、结构data标记及1..999999的规范正整数起始属性；继续移除任意style、事件、危险标签和非法链接。JSON/HTML字符串答案、API、版本控制及权限不变；真实保存服务单测验证列表属性进入task.answers及响应。只读对历史相邻独立OL恢复连续显示，不写回历史答案，不从现状数据改写历史。
- 修改范围：`PerformanceRichTextEditor.vue`、`PerformanceRichTextBox.vue`、`PerformanceReadonlyAnswer.vue`、`PerformanceTemplateFieldRenderer.vue`、`styles/global.css`、`styles/tokens.css`、`backend/app/performance/self_summary_service.py`及既有`PerformanceTemplateRenderer.spec.ts`、`backend/tests/test_performance_projects.py`。无新脚本、独立报告或测试文档。
- 前端回归：`npm --prefix hr-portal/frontend test -- src/components/performance/PerformanceTemplateRenderer.spec.ts src/components/performance/PerformanceAssessmentContentLayers.spec.ts src/components/performance/PerformanceContentRenderer.spec.ts src/views/performance/SelfSummaryTask.spec.js src/components/performance/PerformanceReviewEvaluationDrawer.spec.ts src/views/performance/Review.spec.ts`：6文件 **223 passed**。覆盖列表降级、单空列表、组合格式、选区/IME不拦截、历史编号兼容与白名单安全。
- 后端回归：backend目录执行`.venv/Scripts/python.exe -m pytest tests/test_performance_projects.py -q`：**344 passed、4 skipped**，1条既有python_multipart弃用告警。跳过项均需要显式开启/提供隔离PostgreSQL验收库，未声称数据库持久化验收通过。
- 构建：`npm --prefix hr-portal/frontend run build`（vue-tsc＋Vite）通过，Vite 41.49s。`git diff --check`通过。
- 浏览器验收：真实Vite填写路由＋隔离API夹具，实际输入Backspace；保存夹具调用真实Python后端`sanitize_rich_text`，再GET重开及只读显示：末行保留、OL序号1/2不变、组合格式中文未丢失，符号均#3370FF、行高24px；1次PATCH version1，390px无横向溢出、pageerror=0。task-entry/tag/default/readonly × 普通/粗体/斜体/下划线/组合/链接，实测72行均普通偏移0/列表22px、行高24px。
- UI证据：`ui-blueprints/CR-010-F06-implemented-list-format-alignment.png`、`ui-blueprints/CR-010-F06-implemented-list-readonly-roundtrip.png`，均已查看，对应实际Vue页面及受控API，非飞书生产截图。
- 边界：无迁移、历史记录批量重写或权限修改；未执行真实PostgreSQL保存重开、OS中文输入法端到端、生产验收、commit/push或部署。本轮为本地实现与可执行验收，不代表生产已发布。
