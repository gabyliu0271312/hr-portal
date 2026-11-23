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

### CR-010-F01 任务详情直属上级解析统一（2026-11-10）

- 用户确认完成底层统一：360°反馈及其他模板任务详情复用列表既有 `_snapshot_supervisor_names()`，按项目成员快照 `source_snapshot_id` 关联当期授权人员快照读取 `display_name`，不再在仅含被评估人的项目成员表中查上级姓名。
- 共享资料投影 `subject_profile_items()` 只输出已解析的上级姓名；源快照姓名缺失时省略该字段，不把工号当姓名、不查实时花名册。列表原有空值展示不变；`direct_supervisor_name` 与 `profile_fields` 同源且继续受字段可见性控制。无权限时不输出姓名。
- 修改范围：`backend/app/performance/projects_router.py`、`subject_visibility_service.py`、既有 `tests/test_performance_projects.py`、`test_performance_subject_visibility.py`；没有前端业务代码、数据库迁移、权限配置或历史快照写入。原任务关系仍使用工号，不改变处理人和关系判断。
- 后端：六类任务入口 × 姓名可见/隐藏/缺失、成员缺失、无上级共30项，逐项重复回读；另覆盖既有总结/复议详情和资料缺名。SQLite内存库执行真实关联SQL，验证同一上级工号在两个源快照中分别读取各自姓名；该证据不是业务PostgreSQL验收。
- 验证命令（backend目录）：`.venv/Scripts/python.exe -m pytest tests/test_performance_projects.py tests/test_performance_subject_visibility.py -q --tb=short -k "not workbench_tasks_and_people_return_live_due_date and not evaluation_member_list_can_return_completed_and_pending_tasks and not member_lists_keep_supervisor_name_visibility_and_zero_360_rate"` → **587 passed、5 skipped、8 deselected**，1条既有 `python_multipart` 弃用提示。
- 完整两文件测试未全绿：6项失败均为既有360评估率夹具缺少 `.scalars()`；在独立Python进程内从 `git show HEAD:hr-portal/backend/app/performance/projects_router.py` 加载修改前模块复核，同样 **6 failed、2 passed**。最终命令按测试名称排除这8项，未伪称全量通过；5项跳过依赖隔离PostgreSQL等显式验收条件。
- 前端：`npm --prefix hr-portal/frontend test -- --run src/components/performance/PerformanceReviewPersonHeader.spec.ts src/components/performance/PerformanceSelfSummaryHeader.spec.ts src/components/performance/PerformanceReviewEvaluationDrawer.spec.ts` → **3文件22 passed**。无布局或交互调整，不要求新蓝图。
- 构建：已尝试 `npm --prefix hr-portal/frontend run build`，被本轮未修改的并行 `PerformanceManagementTable.vue` 语法错误阻断（首报11行 TS1011）；保留该文件及 `UiTable.vue` 的他人改动，没有顺带修复或覆盖。后端目标文件 `git diff --check` 通过。
- 未完成：真实登录API/业务PostgreSQL/浏览器页面验收、生产部署、提交和推送。以上仅为本地实现与测试证据，不标记生产完成。

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
- 2026-11-01 补充修复：长提示越过普通/标签富文本边框，根因是编辑器 `::before` 用 `position:absolute;height:0` 且按行换行，提示绘制不参与网格高度计算。本次将提示绘制改为外层编辑网格中的 in-flow pseudo row，保留正文编辑器自己的空态行/光标位置；`white-space:pre-wrap` 与 `overflow-wrap:anywhere` 令多行中文和无空格长提示均完整换行并撑高容器。提示仍不写入 contenteditable、HTML答案、autosave或submit payload；普通/任务/标签variant保留各自padding/font，清空后恢复。
- 本次回归：在 `PerformanceTemplateRenderer.spec.ts` 新增3种variant长提示（中文＋无空格Token）测试和布局源码断言；加入清空后仅零宽光标叶、readonly及提示不混入答案断言。最终相关测试7文件269 passed（SelfSummaryTask、Review、EvaluationDrawer、TemplateRenderer、ContentRenderer、AssessmentContentLayers、InfoPopover）。`npm --prefix hr-portal/frontend run build`（vue-tsc＋Vite）通过，只有既有VueUse PURE annotation提示；`git diff --check`通过。
- 实际本地Vue路由/API fixture：两条正式任务路由 × 全屏/双屏/390px窄屏 × 长中文、多行、无空格长词，共18种布局/路由组合，每种同时验普通输入及标签补充。普通框最长提示height=1218px，标签height=1216px且scrollHeight不超过clientHeight；可视框内无文字溢出，首行光标位置不变，编辑/自动保存payload不含提示，无横向溢出、pageerror或API写请求。输入→Enter→清空→提示恢复和链接浮层可见均通过。独立本地截图：`ui-blueprints/CR-010-F06-implemented-long-placeholder.png`、`ui-blueprints/CR-010-F06-implemented-long-tag-placeholder.png`，非生产截图。
- 评级预览/填写一致性修复（2026-11-02）：`PerformanceTemplateFieldRenderer` 将配置预览允许的悬停详情接到可交互评级；`PerformanceRatingControl` 的标签/下拉值统一优先显示code，支持同时选择与悬停code/name/description；选中及悬停底色都复用 `performanceLevelBackground(color)`，与配置评级色板一致，选项ID不变并仍作为答案保存。规则水合和任务API原有 `_option` 已保留 code/name/description/color/display_mode，本次无后端改动。
- 回归：8文件279 passed（任务填写、主管评估、评价抽屉、模板Renderer/ContentRenderer、Assessment内容层、InfoPopover、RatingControl）；评级色映射和Options单测另18 passed。生产构建通过，仅既有VueUse `#__PURE__` Rollup提示。`git diff --check`通过。
- 浏览器：两任务路由 × 桌面/390px × 标签/下拉模式共8组本地Vue/API fixture；code/name/description hover、已选等级底色、下拉选择、答案payload只含稳定option ID、无横向溢出、pageerror=0。截图 `ui-blueprints/CR-010-F06-implemented-editable-rating-details.png` 为本地fixture，非生产。


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


## 14. CR-010-F07 已提交内容/草稿分离与提交后查看（2026-11-01）

### 确认与范围
- 用户已确认：编辑但未提交不影响查看；再次编辑有草稿时提示“不使用/使用草稿”；不使用丢弃草稿后从正式内容开始；使用草稿载入未提交内容；提交成功进入对应查看页，失败留在编辑页。
- UI依据：用户提供2026-11-01飞书`/preview`的255×107确认浮层采集（14/22/600标题、16px信息图标、28px小按钮、12px按钮间距、20/24px内边距），用户“完成上述全部修复”确认此交互版本。REA历史证据`ev_60b2e5fee8435e142f78e4a87e5f046878fa6d33061368f6f7c6e594e723db4f`，模块594377确认getDraft/deleteDraft分支，模块622018的VIEWABLE只取正式value，模块821317提交后清草稿。静态证据不冒称已操作飞书业务数据。
- 任务：F07-T01数据/API、F07-T02草稿确认UI、F07-T03提交查看导航、F07-T04回归与迁移验收。沿现有页面和用户采集，不重设计IA；读取Spec012 N00/N11及UI护栏，未引入UCP。保护其他中文文档删除项和临时文件，无生产操作、commit/push或部署。
- 复用：`PerformancePopover`（新增可选dialog语义，原默认tooltip不变）、`PerformanceButton`小按钮、`PerformancePromptNotice`已有info图标路径；新`PerformanceDraftChoice.vue`仅承载共享草稿交互，不复制SVG路径/按钮实现。确认浮层真实实测255×108（1px边框差异），非居中删除弹窗；Escape/点击外部关闭不等于“不使用”，不删除草稿。

### 冻结契约与实现
- `answers`现在只保存正式提交内容；新增nullable JSONB `draft_answers`，NULL=没有草稿，空对象可表示实际草稿；类型`none_as_null=True`保证清理草稿落SQL NULL而非JSON null。原HTML字符串答案、角色/字段/项目/周期快照契约保留。
- PATCH既有`self-summary/draft`与`template-task/draft`只修改草稿及answer_version，不动正式内容、completed状态或submitted_at。与正式答案相同则不保留多余草稿。
- POST既有submit：校验通过后在同一事务更新正式答案、清草稿并更新版本及提交状态；现有校准提交/草稿审计保留。失败不清草稿。真实SQLAlchemy任务保存/放弃会先行锁refresh，后检查版本，阻止并发旧请求覆盖新提交。
- GET任务详情保留`answers`为正式数据，增加`has_draft`、裁剪后的`draft_answers`、`project_id`、`node_id`、`return_view`。只读概览、来源引用、结果/评级消费原answers，自然不读取未提交草稿。
- 新增DELETE `/performance/tasks/{task_id}/self-summary/draft`及`template-task/draft`，body=`{version:int>=1}`，复用真实任务处理人/人员目标/阶段授权和时间窗；冲突409 VERSION_CONFLICT，不可操作409 SUBMISSION_NOT_ALLOWED，越权/缺失404 TASK_NOT_FOUND。仅清草稿并递增版本，校准放弃记录CALIBRATION_DRAFT_DISCARDED；正式内容不变。
- 个人查看与已完成抽屉点击编辑先取最新详情：有草稿先确认，否则直接编辑；选择通过route draft_choice传递。直达编辑URL同样有保护；未选择前只读显示正式内容、禁用保存提交。丢弃失败保留浮层和正式内容，不能误进入编辑。
- 提交开始停止待发草稿，等待当前在途保存，取最新version提交；提交后只读并失效项目概览缓存。个人work_summary/self-evaluation返回对应节点；非本人evaluation及结果沟通返回列表并恢复详情抽屉；校准使用原填写路由view=1只读查看。所有路径保留项目、节点、任务及目标人员；不用history.back作为成功跳转。失败保留输入，导航失败不误报提交失败。

### 迁移与历史边界
- 新迁移`0289_performance_task_drafts.py`，revision=`0289_pm_task_drafts`，down_revision=`0288_pm_published_level`；唯一head已确认。
- upgrade仅把未提交任务原answers搬入draft_answers并清空正式answers；已提交历史原样保留，不假设能恢复此前已被覆盖的旧提交版本，不倒填、不批量伪造历史快照。
- downgrade有已提交任务独立草稿时主动拒绝，避免两份内容合并导致丢失；可降级时把未提交草稿还原原answers后删新列。
- 已验证：PostgreSQL离线upgrade SQL、迁移操作契约单测、保护性downgrade单测和NULL绑定单测。**真实PostgreSQL upgrade/downgrade/回滚仍blocked**：本地5432连接TimeoutError、Docker Desktop pipe不可用；没有启动/安装新数据库或更改已有库schema。发布前必须先在可用隔离PostgreSQL执行升降级及数据比较，再按批准流程迁移应用库；新代码依赖此列。

### 验收证据
- 前端：`npm --prefix hr-portal/frontend test -- src/views/performance/SelfSummaryTask.spec.js src/views/performance/Review.spec.ts src/components/performance/PerformanceReviewEvaluationDrawer.spec.ts src/components/performance/PerformanceTemplateRenderer.spec.ts src/components/performance/PerformanceContentRenderer.spec.ts src/components/performance/PerformanceAssessmentContentLayers.spec.ts src/components/performance/PerformanceInfoPopover.spec.ts`，**7文件237 passed**；含use/discard、版本冲突、无草稿、直达编辑保护、提交失败不跳转、node/drawer/page成功导航及查看缓存。
- 后端：backend目录`.venv/Scripts/python.exe -m pytest tests/test_performance_projects.py -q`，**349 passed、4 skipped**，1条已有python_multipart弃用告警。新增正式A→草稿B仍查看A→放弃→新草稿→失败不丢失→提交C清草稿→迟到请求409，handler拒绝、过滤隐藏/只读伪造、迁移保护测试。
- 最终构建：`npm --prefix hr-portal/frontend run build`（vue-tsc＋Vite）通过，Vite 38.11s；`git diff --check`通过。隔离验收API进程已停止。
- Chromium真实Vite路由：填写→自动保存B→返回查看A→弹层→使用B→返回→不使用载入A→输入C提交→跳查看→刷新C；保存/提交/放弃调用实际FastAPI router服务逻辑，经独立内存SQLite fixture存储（任务/权限解析隔离，非业务数据库/非PostgreSQL）。has_draft=false、version4、0 pageerrors、390px无横向溢出。
- UI截图：`ui-blueprints/CR-010-F07-implemented-draft-choice.png`、`ui-blueprints/CR-010-F07-implemented-submit-view.png`，均已读取确认对应实际实现，不冒称生产验收。
- 状态：F07-T01/T02/T03本地实现与受控验证完成；F07-T04单元/页面已通过，真实PostgreSQL迁移验收blocked，**不将该整体任务标记完全验收或可发布**。历史提交恢复、生产迁移、生产数据验收、OS真实中文输入法不在本次已验证范围。


## 15. CR-010-F08 逾期首次补交确认 / F09 查看白卡自然撑高（2026-11-01）

### 已确认范围与任务
- 用户要求：接入前述REA已确认的提交弹窗，复用已有组件并按采集参数还原；修复填写工作总结和自评提交后查看内容超出白卡。范围仅为逾期、未提交、服务端仍允许提交的补交确认；普通首次/临近截止不加通用弹窗。校准影响、自动开通结果、评语质量的其他确认不虚构配置接入。
- 复用`PerformanceConfirmDialog.vue`及`PerformanceWarningFilledIcon.vue`，新增`appearance=submit`变体隔离已有删除/离开确认样式；沿原填写与查看工作区，小范围状态/校验与布局缺陷，不新增页面或蓝图IA。已读Spec002/Spec012 N00/N11护栏，沿用户确认的飞书参考。无后端、权限、数据库迁移、UCP、外部写入修改；保护并行催办的projects_router/API/ReminderPanel/ProjectManagement和.impeccable变动。
- 任务F08-T01：点击提交时先必填校验，再比较真实deadline_at；过期且未提交且canEdit允许则只开确认，不发submit。标题“确定提交吗？”，正文“当前环节已过截止时间，提交后将无法修改内容。”，取消/确定。确认后仍校验并使用原版本保存提交流程，重复点击防重；失败保留弹窗/正文，成功关弹窗并进入原查看路径。已提交逾期不提供新机会，服务端仍负责最终授权与时间窗。
- 任务F09-T01：completed查看层级允许卡片随内容自然增长，短内容保留原最小铺满；滚动仍由review-content承载，不新增内部正文滚动。修复原review-body/panel均flex:1 1 auto、min-height:0/100%形成的压缩链；completed body和card使用flex:1 0 auto，正文flex:none；将状态提示p规则限定为卡片直接子级，避免穿透标题描述与只读答案段落。

### REA依据与像素参数
- 逾期触发：历史Evidence `ev_60b2e5fee8435e142f78e4a87e5f046878fa6d33061368f6f7c6e594e723db4f`的2611工作总结提交分支，Date.now()>endTime + unprocessed + can_submit_overdue，确认前不执行正式提交；文案来自同采集i18n。
- 对话框：同Evidence的`universe-design.1a4129b8.js`模块427983→609739/862044/776173，size=small→420px、centered=true、maskClosable=false、autoFocusButton=ok；header24px、body margin-top8px/left40px、footer0 24px 24px、标题16/24/600、正文14/22、图标24px、圆角8px、按钮32px高/min80px/4px11px、间距12px，遮罩rgba(0,0,0,.55)。浏览器CSS规则读取了4073.88b15309.chunk.css、6327.bac018a8.chunk.css及已加载原子样式。业务填充按钮#1456F0、hover#336DF4、active#0442D2；嵌入EEUserCard旧样式还存在#3370FF版本，未冒用为当前业务源规则。
- 查看自然高度：REA导航收据`ev_3f6a6e5cacf2357966d7ed190b6c665f58c429b25af43a8a4776b4e39de8a3a9`（仅导航成功，等待因4个匹配严格模式失败，不声称全场景成功），随后被动CDP读取指定preview：外白卡class=`w-full min-h-full ... p-10 bg-white rounded-8`，height:auto自然内容、min-height:100%、padding20px、overflow:visible；样例内容564px→白卡604px。未编辑飞书业务正文，未点击真实提交，未拿草稿255px浮层替代本确认框参数。
- 限制：没有实际打开飞书逾期确认（避免生产业务提交），因此没有目标弹窗运行截图逐像素diff；上述尺寸来自实际组件代码和CSS，未知内部运行差异不称100%同SDK。local提交弹窗实际420×158为22字正文单行时的自然高度，不固定高度；390px安全左右边距32px。

### 验收证据
- 修复前真实Chromium：600px滚动区，白卡518px，内部completed-content1852px，正文直接画出白卡外；修复后同70行已提交数据：白卡1882px、内容1842px、底部内边距20px，短内容白卡518px而正文186px，外层正常滚动。工作总结和assessment.reviewee自评分别验证，1280/390px无横向溢出；正文70行均包在白卡内。
- 真实Vite应用路由＋隔离API夹具：工作总结和自评均从编辑页点提交→确认（0请求）→取消（0请求且正文保留）→再确认首个409→弹窗保留并显示错误→重试成功跳查看。0 pageerrors；modal标题行24px、header24px、正文左40px、footer24px，实际420×158；短内容/长内容及窄屏通过。夹具非真实数据库，不声称生产验收。
- 既有测试文件增加正常首次/临近截止不弹、非法/已提交/无资格不弹、work_summary/evaluation确认取消、失败保留、重复确认防重、确认框焦点和遮罩不关闭、白卡不压缩的覆盖。
- 执行`npm --prefix hr-portal/frontend test -- src/components/performance/PerformanceConfirmDialog.spec.ts src/views/performance/SelfSummaryTask.spec.js src/views/performance/Review.spec.ts src/components/performance/PerformanceReviewEvaluationDrawer.spec.ts src/components/performance/PerformanceTemplateRenderer.spec.ts src/components/performance/PerformanceContentRenderer.spec.ts src/components/performance/PerformanceAssessmentContentLayers.spec.ts src/components/performance/PerformanceInfoPopover.spec.ts`：**8文件255 passed**；既有测试loading directive stub告警非失败。
- UI截图：`ui-blueprints/CR-010-F08-implemented-overdue-submit-confirm.png`、`ui-blueprints/CR-010-F09-implemented-work-summary-long-view.png`、`ui-blueprints/CR-010-F09-implemented-self-review-long-view.png`，三张均已读取，最后两张滚动到底部展示白卡20px包裹留白。
- 构建：较早一次vue-tsc＋Vite通过42.33s；最新`npm --prefix hr-portal/frontend run build`被并行催办代码阻塞：PerformanceReminderPanel.vue:44的cycle-remind联合类型、ProjectManagement.vue:44/45的description/reminderProvider字段。未覆盖非本轮文件，不能将最终整树构建说成通过。本轮文件`git diff --check`通过。
- 状态：F08/F09实现与受控页面、单测已完成；完整工作树build blocked，待并行任务修好后复验。无新脚本/独立报告/测试文档，无commit/push或部署；前轮0289真实迁移验收阻塞不因本轮前端测试通过而解除。


## 16. CR-010-F10 提交成功全局“已提交”轻提示（2026-11-01）

### 范围与采集依据
- 用户明确要求接入前述提交成功提示并按飞书采集参数还原外观与位置。该提示为全局非阻塞Toast，不是逾期提交前确认框，也不替代查看页常驻绿色提交信息条；沿当前提交后查看流程，不新增业务接口、权限、数据库或迁移。
- 已加载Spec002与REA指南，关联已有CR-010；复用Element Plus全局`ElMessage`及`PerformancePromptNotice`的success图标定义，不另造消息管理器、计时器或图标路径。只在ElMessage专属customClass上覆盖样式，其他全局消息不受影响。不修改并行催办或前轮确认/白卡逻辑；不创建脚本、独立报告或测试文档。
- REA证据：`ev_60b2e5fee8435e142f78e4a87e5f046878fa6d33061368f6f7c6e594e723db4f`；业务模块821317正式提交与清草稿后调用message.success(“已提交”)；universe-design模块146362/694433/135203分别为全局消息调用、定位计时和outlined成功notice。模块79238的SucceedFilled两条SVG路径与本地已有success定义一致。
- 位置依据：飞书ConfigProvider默认toast.top=32，manager定位fixed/top32px/left0/width100%/text-align:center，消息项margin8px，因此孤立单条提示可见top40px，水平相对视口居中，不是内容卡片居中。
- 样式依据：CDP被动读取指定preview的已加载CSS及成功notice计算样式：业务成功背景#E4FAE1、图标/边框#32A645；EEUserCard注入CSS另有#F0FBEF/#34C724旧值，当前业务成功notice实际仍使用前者。outlined padding15px 3px 15px 19px + 文本右侧32px、main负margin16px归一为本地15px19px；图标16px、右距8px/上3px；正文14px/22px/600；边框1px、圆角6px、max-width600px。阴影0 8px 24px 8px rgba(31,35,41,.04),0 6px 12px rgba(31,35,41,.04),0 4px 8px -8px rgba(31,35,41,.06)。
- 生命周期：默认3000ms，鼠标移入暂停、移开重新计时；300ms opacity/transform、cubic-bezier(.34,.69,.1,1)，入场translateY(-100%)→0，出场原位淡出。业务调用未另传时长；现场全局配置仍可能覆盖默认值，未取得实际生产成功提示的全局配置运行值或目标截图，不宣称内部SDK/所有消息叠加与生产逐像素diff均100%同一。

### 实现与验收
- F10-T01实现：`SelfSummaryTask.vue`在submit API成功后、导航前调用一次`ElMessage.success`：message=已提交、offset40、duration3000、showClose=false、customClass=performance-submit-toast，使用已有success图标路径。消息挂载body，不随编辑页卸载消失；失败、必填校验、自动保存、取消逾期确认均不调用成功提示，重复提交由原submitting守卫阻止。
- 样式集中于`styles/element-overrides.css`的专属类及`styles/tokens.css`的提交提示token；font/color/背景/边框/尺寸/动画不污染其他消息。修改既有`SelfSummaryTask.spec.js`新增成功/请求未返回/重复点击、失败/草稿/取消不触发、跨卸载与3000ms关闭覆盖。
- 真实Chromium＋Vite实际工作总结与自评路由/受控API夹具：正式POST各1次；成功后跳查看页时轻提示仍存在且仅1个，实测106×54px、top40、1280px视口centerX640、390px视口centerX195；padding15px19px、圆角6px、图标16px、文字600 14px/22px、背景rgb(228,250,225)、边框和图标rgb(50,166,69)。移入等待3100ms仍可见、移开后自动消失；两个入口0 pageerrors。非生产业务数据验收。
- 回归：`npm --prefix hr-portal/frontend test -- src/views/performance/SelfSummaryTask.spec.js src/views/performance/Review.spec.ts src/components/performance/PerformanceConfirmDialog.spec.ts src/components/performance/PerformanceReviewEvaluationDrawer.spec.ts src/components/performance/PerformanceTemplateRenderer.spec.ts src/components/performance/PerformanceContentRenderer.spec.ts src/components/performance/PerformanceAssessmentContentLayers.spec.ts src/components/performance/PerformanceInfoPopover.spec.ts`：**8文件262 passed**；SelfSummaryTask单文件55 passed。`git diff --check`本轮文件通过。
- UI证据：`ui-blueprints/CR-010-F10-implemented-submitted-toast.png`，对应实际提交后查看页，已读取确认提示在视口顶部水平居中，并保留常驻绿色信息条。
- 完整构建：最新`npm --prefix hr-portal/frontend run build`仍被并行催办的PerformanceReminderPanel.vue:44 cycle-remind类型及ProjectManagement.vue:45 reminderProvider缺失阻塞；无本轮文件类型错误，但不将完整构建描述为通过。未擅自修复其他任务文件。
- 状态：接入及受控视觉/交互/回归验证完成；整树构建受并行任务阻塞，生产目标提示逐像素截图验证未执行。未调用飞书真实提交或目标消息函数，未执行commit/push/部署；前轮0289迁移验收阻塞仍独立存在。

## 17. CR-010-F11 上级评估动态评级回显（2026-11-06）

- 用户授权：修复上级评估提交后评级列空白，并明确要求先抓取指定飞书成员列表的 DOM、接口和业务包，核对动态列而非硬选第一道评级题。
- 根因：`workbench_task_people` 未返回评级；`ProjectMemberListPanel` 又将 `rating/rating_tone` 无条件赋空。成员跳转与抽屉编辑目标 URL 另有 `employee_no` 丢失。
- REA依据：目标 `/perf/review/7654423719619710195/7654113886190436355/members`。DOM Evidence `ev_00861e83d5106e91f5b1e454872940296801a67e3b645388a0d01012316040d8`；包含 CDN 业务脚本的 Evidence `ev_6b6217fb16e1f7592cf22cc6e94ad7b1238572b51d22d050b1bfe25c4ad32812`，导出 `ev_c1e31bb573d8581a6e7e5d95a2e1a4f165d3a2e90905bf4a8ef2aca3cd24569e`。6131业务包按 `allowedPickKeys` 匹配 `metas`，从 `name` 取标题、`key` 绑定行、按 `pickType=optionScoreMap` 与 `scoreOptions` 渲染。
- 网络证据边界：REA场景工具失败，使用已有Playwright对指定页面重新加载并捕获绩效接口响应；该部分属于普通浏览器抓包，不冒称REA网络Evidence。`users/meta`返回动态 `semesterStageReviewScoreGroup$<indicatorID>`、多语言列名、`scoreOptions`、默认/可选/排序key；`users/list`同key返回`{option_id, score}`。级联组明确为“当前环节评估结果”。本实例仅一个评级列，多个列的通用能力由脚本遍历元数据证明，未修改飞书模板构造多题实例。
- [x] F11-T01 后端/API：现有任务人员接口维持数组响应，增加每行`rating_columns: [{key,label}]`及`ratings: { [key]: {label,color,foreground} | null }`；仅当前任务模板schema中的可写评级题生成列，隐藏/只读题排除；每节点单次解析，继续受原项目、节点、阶段、员工及处理人授权查询限制。只读取已提交`answers`，草稿/缺值/无效选项不伪造等级；单评级题保留`rating`兼容字段，多题不任意归并。未引入结果计算、迁移或历史回填。
- [x] F11-T02 前端：共享成员列表以动态列替换固定评级占位，按接口名称/稳定key分别渲染`PerformanceRatingTag`；搜索重载保留已隐藏列，空搜索结果保留已知列定义。评估导出使用同一已授权任务列表全量结果及当前排序/可见列，不再调用项目成员导出而造成动态评级为空。项目管理入口保持原导出接口。
- [x] F11-T03 路由：共享任务入口增加可选`employeeNo`，上级/360/沟通成员入口和详情抽屉编辑传入并URL编码；填写页已有读取、草稿、提交参数逻辑继续复用。不改变后端身份和对象授权。
- UI门禁：沿CR-010既有成员列表与CR-011详情抽屉，小范围数据映射/路由修复，无新增页面或信息架构，无新蓝图；复用公共表格、评级标签和列设置。独立截图 `ui-blueprints/CR-010-F11-dynamic-ratings-implemented-20261106.png`，已读取确认双列及等级值。
- 验收：真实Vite应用路由＋隔离浏览器受控API夹具，点击员工进入填写页，选择两项评级，POST `{answers:{grade:'good',value:'high'}}`，GET/POST均带`employee_no=E002`；成功返回成员列表显示“年度绩效:3星+ / 价值贡献:A”，pageerror=0。非真实数据库或生产验收。
- 回归：`python -m pytest hr-portal/backend/tests/test_performance_projects.py -q --tb=short` → **434 passed / 5 skipped**；只读/隐藏题边界追加后定向测试 **1 passed**。`npm --prefix hr-portal/frontend test -- src/views/performance/Review.spec.ts src/views/performance/ProjectManagement.spec.ts src/views/performance/SelfSummaryTask.spec.js src/components/performance/PerformanceReviewEvaluationDrawer.spec.ts` → **158 passed**；搜索空结果及导出断言追加后动态列定向测试 **1 passed**。后端既有第三方multipart弃用警告；Review沟通入口测试有jsdom请求stderr，但测试通过，未将日志当成无告警。
- 构建：最终`npm --prefix hr-portal/frontend run build` → **vue-tsc + Vite通过，built in 41.18s**；既有VueUse PURE注释提示。最终后端全套仍为 **434 passed / 5 skipped**，前端4文件仍为 **158 passed**；本轮文件`git diff --check`通过。
- 未执行：真实业务库保存—重开、生产验收、迁移（不涉及）、部署、commit、push；未修改飞书配置或提交飞书评估。保留其他会话的模板、人员范围和项目设置改动。

## 18. CR-010-F12 校准答案继承与提示白卡修复（2026-11-10）

- 用户确认：修复终评答案带入、按后台允许修改配置控制填写、提示位于白色容器内；多阶段采用“承接前阶段，冲突阻断”，不采用最后提交者优先。
- 范围：现有 `projects_router.py`、`test_performance_projects.py`、`SelfSummaryTask.vue/.spec.js`、`PerformanceTemplatePreviewStep.vue/.spec.ts`。保留授权管理、全局表格、人员组等并发改动；不增加接口、数据表、迁移、生产回填或平行渲染器，不修改终评正式答案和既有角色权限。
- 来源契约：冻结唯一终评节点；同项目/周期/成员快照/被评估人，排除撤销任务；按冻结阶段顺序取最近存在该员工有效任务的前阶段，否则取终评。来源任务全部完成且可见投影一致才能使用；未提交/整份可见结果为空返回409 `CALIBRATION_SOURCE_NOT_READY`，多人不一致或schema不兼容返回409 `CALIBRATION_SOURCE_CONFLICT`。选填缺值允许，不按任意任务ID/提交时间决胜。
- 保存契约：GET仅投影不写库；首次成功保存建立可信正式基底，草稿独立；客户端只读/隐藏伪造值不生效，来源按schema白名单裁剪。当前已保存校准值优先，完整基底重开不依赖上游；历史已提交部分答案仅补缺失readonly key，不补缺失writable、不覆盖已有值（包括空串/None），下一次成功保存才持久化补齐。原项目锁、任务刷新、版本校验、授权、截止及审计保留。
- 前端：校准系统提示与表单同属白色 `task-form-shell`，保留模板提示在schema中的顺序；单屏/双屏/窄屏使用原公共填写组件。提交后使用服务端可信答案回显；来源未就绪/冲突提供中文错误态。校准模板预览复用 `resolveCalibrationContents` 应用终评内容及当前节点显示覆盖，不使用过时adjustment副本；不改复议业务规则或既有预览整体只读约定。
- UI门禁：既有任务填写页小范围回归修复，无信息架构变化、无新完整蓝图。真实本地Vite＋隔离Chromium受控API夹具验证1440px单屏/双屏、390px、只读原值、可改原值、草稿/提交仅发送可写字段、提交后刷新及来源冲突；白卡背景实测rgb(255,255,255)，提示矩形完全处于白卡内，无页面横向溢出，pageerror=0。临时截图 `C:/Users/gaby.liu/AppData/Local/Temp/calibration-fixture-{single,split,mobile,reopen,conflict}.png`，single/split/mobile已读取；非真实数据库或生产证据。
- 前端回归：`npm --prefix hr-portal/frontend test -- --run src/views/performance/SelfSummaryTask.spec.js src/views/performance/Review.spec.ts src/components/performance/PerformanceReviewEvaluationDrawer.spec.ts src/components/performance/PerformanceTemplatePreviewStep.spec.ts src/components/performance/PerformanceTemplateRenderer.spec.ts src/components/performance/performanceContentSettingsResolver.spec.ts src/views/performance/PerformanceTemplateContentSettings.spec.ts` → 7文件319 passed；Review既有jsdom XHR stderr仍存在，未声称无告警。
- 后端回归：校准专项 `124 passed, 2 skipped`；项目/模板/授权三文件 `895 passed, 6 skipped, 6 failed`。六个失败已在内存加载HEAD原路由时复现，均为 `_communication_progress_detail` 既有fixture缺少 `scalars()`，无新增失败；隔离PostgreSQL验收未执行。新增测试包括ASGI HTTP读→提交→重开、项目锁/刷新版本冲突、同员工/快照来源范围、多阶段/多人一致性、schema不兼容、只读伪造/隐藏/非法选项、空值及历史部分结果。
- 构建：最终 `npm --prefix hr-portal/frontend run build`（vue-tsc＋Vite）通过，仅既有VueUse PURE annotation告警；此前并发 `UiTable.spec.ts:145` 类型错误经其他工作修正，本卡未修改该文件。`git diff --check`通过。
- 错误态收尾：来源失败后页签显示“加载失败”，隐藏不可使用的提交栏；重新加载沿原入口。390px本地浏览器断言及 `calibration-fixture-conflict-final.png` 已生成，初版conflict/reopen截图已读取；没有将提示冲突当作成功带入。
- 验收状态：本地代码、组件、ASGI夹具及受控页面证据已具备；真实PostgreSQL/真实项目API及生产部署未执行，不勾选整项验收完成。未commit/push，不修改生产数据。

## 20. CR-010-F14 校准先读侧栏与真实提交提示（2026-11-10）

- 用户确认：校准人员先进入read侧栏，完整复用上级评估的侧栏、绿色提示图标、编辑及草稿选择；当前阶段已逾期显示真实display_name/提交时间与截止时间且不显示编辑，截止前按任务授权显示“你可以在……前继续编辑”，点击编辑进入原填写页。校准提交后返回相同人员侧栏，其他环节入口不改变。
- 范围：原projects_router.py与test_performance_projects.py、performance API类型、PerformanceReviewEvaluationDrawer及既有spec、Review.vue及既有spec、performanceReviewDisplay的calibration入口、SelfSummaryTask既有提交返回测试。保留CR-013延期修复及沟通评级等并发修改，无新文件/迁移/权限扩展/生产操作。
- DTO：仅校准详情增加answer_submissions:[{display_name,submitted_at}]，原submitted_at保持当前任务语义；来源选择与_calibration_answers共用同一冻结终评/前阶段可信链。当前校准已提交则使用自身真实提交；未提交从可信来源读取，不用draft更新时间冒充提交。姓名从当前成员快照关联授权人员快照获取；提交审计优先真实EMPLOYEE或identity_switch业务员工，无审计legacy才使用handler_ref且必须解析到快照姓名。无法证明提交者不编造工号或姓名。多人分别显示真实姓名/时间配对，不按最后提交时间拼接。
- 安全边界：仅详情加载提交元数据，保存入口不增加名称/审计查询；已有完整基底可独立读取时仅预期缺源/冲突允许元数据空数组，不吞数据库异常或主答案冲突。原任务处理人授权、条目readonly、时间窗口/延期、锁及版本不变。前端taskEditable继续受editable/submit_allowed/只读props与校准截止时间限制。
- 复用：PerformanceReviewEvaluationDrawer始终PerformanceTemplateRenderer(mode=readonly)，PerformanceReviewCompletionNotice原图标/UiButton/草稿检查保持；点击编辑使用当前校准任务，不修改参考源。多来源逐条复用提示且只有一个编辑入口；缺元数据使用“以下为当前绩效结果”，不假称已提交。共享链接rootReviewId/activeTab可恢复，calibration return_view改drawer，复议仍保持原行为。
- 前端验证：抽屉/Review/SelfSummaryTask三文件196 passed，覆盖pending/completed/overdue入口、提示准确格式、北京时间、多人来源、无来源不假称、只读权限、过期旧editable响应拒绝、提交返回侧栏与原参考催办。既有Review 360测试XHR stderr保留；vue-tsc＋Vite build通过（既有VueUse PURE提示）。
- 浏览器：真实本地Vite＋隔离API夹具，完成点人先read→编辑→原填写页→提交→侧栏、逾期无编辑、390px无横向溢出、pageerror=0。侧栏动画结束后1440px实测x440/width1000；已读取calibration-read-drawer-pending-stable.png及expired-stable.png，提示全文及编辑按钮完整显示。截图在本机Temp，属于受控夹具而非真实后端/生产验收。
- 后端验证：`tests/test_performance_projects.py -k 'calibration and (submission_metadata or http_detail or source or phase_inherits or save_preserves or multiple_final or legacy) or calibration_deadline_extension or sync_node_task_times or task_authorization or template_task_rejects or calibration_authorization' -q --disable-warnings` →75 passed、605 deselected、1既有warning；覆盖ASGI GET→提交→GET、审计实际身份/身份切换、冻结姓名、多来源、缺名与异常，以及期限/只读授权边界，原延期保存与时间同步通过。相关diff check通过。
- 验收边界：无真实PostgreSQL、生产API或部署验收，不标记整体生产完成。未commit/push，不回滚并发工作。
- 上级评估提示增量（2026-11-10用户确认）：manager evaluation详情复用既有提交元数据查询，按当前任务的提交审计/冻结姓名返回answer_submissions；本节点submitted_at和有效deadline_at不被管理页签的另一代表任务替代。当前任务对应管理页签按node_id识别，提示与编辑指向当前获授权task_id；其他参考页签不扩权。截止前文案为“以下内容由 {display_name} 在 {submitted_at} 提交，你可在 {deadline_at} 前继续编辑”，截止后为“以下内容由 {display_name} 在 {submitted_at} 提交，该环节已在 {deadline_at} 截止”，全部Asia/Shanghai展示；保留原共享提示图标、编辑按钮及权限。无可靠姓名时保留中性评估人兜底，不用当前登录用户/被评估人伪造提交者。
- 本增量验证：抽屉与Review前端106 passed；后端manager_detail_uses_actual_submitter/submission_metadata/self_summary_detail_keeps_template_title/calibration_http_detail定向24 passed，覆盖真实审计提交者/legacy/缺名及旧task.due_at被本节点有效延期配置替代。vue-tsc＋Vite build通过；既有Review 360 XHR stderr、VueUse PURE/multipart警告保留。真实本地页面受控API验证用户两段文案、代表task错人错时间不参与提示、截止前有编辑/截止后无编辑，pageerror=0；Temp截图manager-submission-notice-before.png/after.png已读取。git diff --check通过，真实数据库/生产未执行，不commit/push，保留另一会话沟通评级改动。

## 21. CR-010-F15/F16 校准、复议统一结果与终评锁定（2026-11-11）

> 以下 F15“首次正式校准提交即锁定终评”、F16“锁定提示替换提交记录”为历史实现口径，已被本文件第22节的用户最新确认覆盖；不得继续据此实现或验收。历史测试结果仅证明当时行为，不代表第22节已完成。

- [ ] F15 校准空值开放、统一生效结果与首次正式提交锁定终评。
  - 用户确认：校准按自身时间及授权开放，不等待终评或前阶段全部提交；无正式答案正常空值显示，私人草稿不跨人公开。每员工首次正式校准提交即锁定其终评，已完成仍侧栏、未完成保留填写布局但不可编辑；提示精确为“当前结果已完成校准，你无法再次修改”，无编辑/保存/提交。该最新决定覆盖F12第299行的来源全完成/非空门槛及F13只读原final的局部来源限制，不改变结果开通权限。
  - 范围：performance/result_service.py、projects_router.py、reconsideration_service.py及既有项目/复议测试、新test_performance_effective_results.py；frontend/api/performance.ts、PerformanceReviewEvaluationDrawer、PerformanceReferenceContent、SelfSummaryTask及既有测试。不改原始任务答案/状态/提交人时间，不迁移、不回填、不改权限或生产。
  - 契约：统一完整答案按冻结节点/阶段顺序合并正式校准、关闭复议，草稿/撤销/未正式提交不参与；同阶段重叠字段冲突409 CALIBRATION_SOURCE_CONFLICT，缺key不覆盖、显式空值保留、隐藏/只读不可伪造。各入口再按自身模板及权限投影，不能将员工裁剪结果反作完整内部结果。复议新申请在既有JSON快照增加full_result_answers/full_result_source_task_ids，旧快照保留内部基底并承接已冻结员工可见字段；不冒充发布时答案快照。
  - 锁定/API：沿原URL，DTO新增final_result_locked；终评保存/提交/丢弃草稿均在原项目锁内复验并返回409 FINAL_RESULT_CALIBRATED，保留任务版本及授权校验；未完成终评不伪造成completed，旧草稿不恢复。校准、终评引用、管理列表/导出、沟通评级、员工结果、矩阵及统计统一消费结果解析。
  - UI：沿用户确认的既有工作区与侧栏，小范围状态修复无新IA/蓝图。真实Vite应用+隔离API夹具验证未提交填写布局、无contenteditable/提交栏，及已完成侧栏无编辑、当前答案、精确提示。截图：ui-blueprints/CR-010-F15-implemented-locked-pending-final.png、CR-010-F15-implemented-locked-completed-final.png，均已读取；受控夹具非真实业务库验收。
  - 测试：Given无终评/未提交/空值/部分结果/多阶段/冲突/草稿/关闭复议，When读取→正式提交→重开及各入口查询，Then空值不阻断、正式结果一致、隐藏保护、原记录不变；已完成/未完成终评HTTP读取与写入409均有覆盖。数据库隔离设置DB_HOST=127.0.0.1 DB_PORT=1；实际pytest、前端测试/build结果见下方收尾证据。
- [ ] F16 项目管理成员侧栏真实提交人统一。
  - 复用原_calibration_answer_submissions按正式审计解析实际EMPLOYEE/身份切换业务员工，并使用冻结display_name；无审计legacy才回退任务处理人快照。顶层与各management_tab增加answer_submissions，submitted_by也使用真实审计姓名。前端每页签各自姓名/时间成对显示，匿名360不泄露，可靠姓名缺失不伪造。
  - 覆盖实际员工、身份切换、Portal无业务员工、缺姓名、无审计历史及匿名页签；真实项目管理路由受控API验证“以下内容由 真实提交人 在 2026-11-10 15:42（GMT+8） 提交”，截图ui-blueprints/CR-010-F16-implemented-management-submit-name.png。校准锁定提示优先，不能把原终评提交人冒充后续校准人。
  - 提示去重增量（2026-11-11用户确认）：侧栏只显示来源记录数组的最后一条提交提示，不按时间重新排序、不改变来源决胜规则；校准、普通评估及管理主/其他页签统一裁取末条，姓名与该条时间成对保留。校准锁定提示仍优先且只显示一条，匿名反馈仍不披露姓名；不删除后端历史记录、不改结果计算或编辑权限。仅修改PerformanceReviewEvaluationDrawer.vue及既有spec.ts。三文件回归208 passed（含Review既有jsdom XHR stderr），补充锁定多来源断言后侧栏26 passed；完整vue-tsc + Vite构建通过（built in 1m 57s，保留既有VueUse PURE注释告警）。本地5173项目管理实际页面使用隔离API夹具返回两条来源，实测noticeCount=1、前条姓名不可见、pageerror=0；截图ui-blueprints/CR-010-F16-implemented-last-submission-notice.png已读取，截图禁用过渡动画。无真实后端/生产验证、无commit/push。
- 最终回归证据：隔离环境DB_HOST=127.0.0.1、DB_PORT=1、PYTHONPATH=hr-portal/backend，执行backend/.venv/Scripts/python.exe -m pytest，六文件test_performance_projects.py、test_performance_effective_results.py、test_performance_reconsideration_results.py、test_performance_reconsideration_lifecycle.py、test_performance_template_workflow.py、test_performance_user_authorization.py，最终1173 passed、6 skipped、1既有python_multipart弃用警告（29.18s）。新增跨入口用例实际验证正式校准后矩阵/统计同值、关闭复议覆盖及原任务不变；只读冻结值缺失回补另有回归。
- 前端最终证据：npm --prefix hr-portal/frontend test -- src/components/performance/PerformanceReviewEvaluationDrawer.spec.ts src/views/performance/SelfSummaryTask.spec.js src/views/performance/Review.spec.ts，3文件207 passed；保留Review既有jsdom XHR AggregateError stderr，不称零告警。npm --prefix hr-portal/frontend run build完成vue-tsc与Vite，built in 52.05s，既有VueUse PURE annotation提示；git diff --check通过。
- 真实页面证据：本地5173应用路由通过隔离Chromium与API夹具验证未提交终评锁定填写态、已完成终评锁定侧栏、项目管理真实display_name提示，三张截图均已读取，姓名截图重采等待侧栏动画结束；pageerror均为空。无自定义脚本文件或独立报告。
- 验收边界：本地ASGI/单元/组件与真实页面隔离夹具，不等同真实PostgreSQL事务并发、生产API、迁移或部署验收；本机8000/5432未监听，真实库与并发锁等待未执行，保持未勾选。无数据库迁移，无通知、commit/push或部署操作；并行会话的开通结果卡独立，不纳入本卡范围。

## 22. CR-010-F17/F18/F19 共享正式结果、显式完成校准与公共催办（2026-11-11）

### 最新已确认口径与实施边界

- 用户已授权完成全部优化；此节覆盖第21节冲突条款。当前状态：本地实现、相关测试及构建通过；用户最新要求停止浏览器校验，测试通过后在main提交并推送。真实PostgreSQL迁移/并发与生产验收未执行，保留任务未勾选，不宣称生产可发布。
- 终评与校准共用提交成功的同一正式结果，两个入口各按冻结模板及字段权限投影；自动保存草稿按实际业务操作者隔离，不跨人公开，不改变正式结果或最近提交人。
- 校准成功提交使原未填写终评的有效任务状态为已完成；原终评实际提交历史、原提交人及时间不伪造。待完成/已完成筛选、列表、计数、管理页签与引用统一消费有效状态。
- 未显式完成校准时，终评在自身允许时间内仍可编辑。完成校准二次确认成功才锁定终评；校准人在自身允许时间及授权内仍可编辑、正式提交，完成事实不清除、不重记。
- 双端最近编辑记录以最近成功正式提交的真实业务操作者与时间为准；草稿、查看及点击完成校准不刷新该记录。锁定提示与此记录同时保留，不能互相替换。
- 缺少绩效结果允许确认完成：显示“有 N 名员工没有绩效结果”，不禁用确定、不补默认值、不伪造提交。N按当前获授权校准责任范围内的真实结果计算，非当前搜索/分页人数；结果开通配置、时点、授权和结果就绪资格仍独立。
- 填写情况/填写页及侧栏内，提示、最近填写记录和正文共用一层白卡和对应内边距。沿既有单屏、双屏、390px及全局提示组件，不再加嵌套白卡。
- 公共催办覆盖该员工当前获授权的全部有效未完成任务，包括工作总结、评估等。360°评估率仅为入口，不限制公共能力；不硬编码review-360、不凭前端姓名或handler名单选接收人。具体任务入口保留真实task/node/employee上下文；无目标筛选的成员入口列出全部合法任务。
- 用户最新授权在main提交并推送；不部署、不发真实通知、不操作生产数据库。保留冻结人员/周期快照、关闭复议快照和现有角色范围，不批量伪造历史完成。

### 任务与共享契约

- [ ] CR-010-F17-T01 共享正式版本与操作者私有草稿
  - 类型：模型/迁移/后端；前置：本节确认与唯一Alembic head。
  - 允许修改：performance/models.py、result_service.py、projects_router.py、reconsideration_service.py及必要同域服务、alembic新迁移、对应后端测试；禁止修改旧迁移、生产记录及通知全局配置。
  - 输入输出：保留原任务version；template-task详情/写入追加result_version及draft_base_result_version。共享正式提交在项目锁内校验两种版本，只更新本次真实task和共享正式结果；草稿不推进正式revision。旧草稿基底不自动升级，旧正式版本返回409 SHARED_RESULT_VERSION_CONFLICT并保留草稿。
  - 当前数据唯一正式源使用成员冻结边界内共享状态，旧数据初始化仍按原冻结阶段/同阶段冲突规则解析；不能按最大task ID/时间跳过旧冲突，也不能复制答案到所有task制造提交。隐藏、只读和多条内容必须无损保留；关闭复议完整快照继续优先。
  - 验收：终评→校准→终评交替正式提交、双端重开一致；草稿私有；跨任务陈旧提交拒绝；未填终评有效完成且原历史不变；历史阶段及复议冻结值不回归。
- [ ] CR-010-F18-T01 独立完成校准后端
  - 类型：API/状态/权限；前置：F17-T01。
  - POST /projects/{project_id}/calibration-completion/preview：body node_id/phase_id；返回scope_version、total_count、completed_count、missing_result_count、can_complete、completed。
  - POST同域/confirm：body追加scope_version；服务端按当前节点/阶段/当前业务身份可写责任任务重查，在项目锁内复验授权、时窗、范围及正式结果版本，写独立完成时间/操作者。范围变更409；重复确认幂等，不改变原时间；N非阻断。
  - 不复用每次submit都会重写的completed_at作为显式完成；旧submitted_at不回填为已点击完成。进度、终评锁定、自动开通前置判定拆开，结果就绪独立。
  - 验收：提交不锁、显式完成锁终评、校准完成后节点期内续交/期外拒绝、N>0仍可确认、不补值/不开通、取消与重复确认无额外副作用、范围/权限/版本变化拒绝。
- [ ] CR-010-F18-T02 公共按钮/确认框与白卡提示
  - 类型：前端/UI；蓝图：CR-010-T02-result-communication-and-calibration.md v2（用户采集及本轮状态确认）。
  - 允许修改：Review、SelfSummaryTask、EvaluationDrawer、ConfirmDialog、api/performance及现有对应测试，tokens.css仅添加必要共享尺寸token；不全局重设计。
  - 复用UiButton、PerformanceConfirmDialog、WarningFilled、原完成提示和TemplateRenderer；完成按钮80×32、r6、14/22；确认外宽534有视口上限，24内边距、24图标、16/24/600标题、14/22正文/40缩进、12按钮间距。状态颜色/字体来自全局token。
  - 验收：N=0/N>0、loading/error/cancel/retry/permission、已完成仍可编辑校准；锁定记录同时展示，单屏/双屏/侧栏/390px白卡内边距与无横向溢出。独立实际PNG需后续获取，不拿旧截图冒充。
- [ ] CR-010-F19-T01 全任务公共催办闭环
  - 类型：后端/前端/API/权限；独立文件并行，projects_router与共享API类型由单一所有者串行整合。
  - GET /projects/{id}/members/{employee}/reminder-tasks：source_task_id可选及可选真实node/task筛选，返回该员工冻结范围内合法候选、独立can_remind。POST同成员/remind-batch提交task_ids及skip_recently_reminded，服务端重新验权，不接受任意receiver。
  - 复用既有member授权、_task_handlers、_send_performance_task_reminder及统一通知日志；6小时去重以现有成功非测试日志task ID口径为准，不扩大声称为跨任务全局人+环节去重。success/partial/failed/preview/skipped明确，recorded不是送达。
  - 复用PerformanceReminderButton、TaskOverlay、ReminderPanel、ConfirmDialog；补列表能力映射与ReviewContent事件透传，替换placeholder和局部催办确认。不复制面板/按钮SVG，不借周期管理接口扩大普通上级权限。
  - 验收：工作总结及360任务均可从通用入口催办；具体任务入口不扩围；拒绝跨员工/项目/快照、撤销/已完成/本人；权限变更、有效处理人、去重、失败/预览和取消无发送均覆盖。所有发送测试mock，不真实通知。

### 验证与完成定义

- 后端：隔离DB_HOST=127.0.0.1/DB_PORT=1，pytest现有test_performance_projects/effective_results/reconsideration_results/reconsideration_lifecycle/template_workflow/user_authorization及本轮专项；真实PostgreSQL迁移/并发另记，无法执行写blocked。
- 前端：npm --prefix hr-portal/frontend test -- src/views/performance/Review.spec.ts src/views/performance/SelfSummaryTask.spec.js src/components/performance/PerformanceReviewEvaluationDrawer.spec.ts src/components/performance/PerformanceReminderPanel.spec.ts src/components/performance/PerformanceConfirmDialog.spec.ts src/views/performance/ProjectManagement.spec.ts；npm --prefix hr-portal/frontend run build；git diff --check。
- 测试、构建、API/持久化、PNG和部署分别记录，未执行不报通过；以上完成前不勾选任务。新增迁移先核唯一head，不改旧迁移；有新历史后保护downgrade，不直接降级旧应用继续写共享结果。

## 23. CR-010-F20 最终评估变更记录与开通人提示（2026-11-17）

- 用户确认：上级评估历史只记录终评及校准的正式结果变更，发起复议后的终评/校准变更仍继续记录，不按复议申请时间截断。复议历史只记录复议处理，其下方绩效结果保持复议环节自身数据；不修改既有正文冻结/结果解析规则。
- REA参考：管理入口 `ev_6cb1943735e1f0e41a66fde47029528e6a4c34cc264856c1b469107fe6305040`、团队结果入口 `ev_41b857e7fe5ca303651f40dff307d092107a574e36f6e451dd10c202f0468fbb`。目标站历史 GET `/perf/api/review/v2/history/rootReview?root_review_id=...&template_id=...`，800px历史弹窗及开通人/时间提示；接口响应和计算样式另由普通浏览器补采，不冒称全部为REA网络证据。
- [ ] F20-T01 后端历史与开通人详情投影
  - 前置/阅读：Spec002基线、共享正式结果契约、复议快照契约、execution-contract/acceptance-evidence及现有路由/服务/测试；沿现有授权详情入口，禁止独立绕过对象权限。
  - 允许修改：`backend/app/performance/projects_router.py`、既有 `backend/tests/test_performance_projects.py`；不改模型/旧迁移/结果计算/权限配置/通知或生产数据。
  - 契约：现有GET成员detail与任务template-task保持URL；最终评估 `management_tabs[].result_history` 增加 `id/submitted_at/display_name/node_name/adjustments`，复议的history不混入。读取同项目/周期/成员快照的真实终评/校准任务审计，字段按当前页签可见schema投影及净化，空变化不展示；首次无基线提交、缺完整前后值的旧审计不伪造历史。正式事件按时间/id倒序，提交人使用真实业务员工及冻结姓名，缺失姓名使用中性“评估人”。草稿、完成校准及复议事件排除。
  - 开通DTO：`opened_at/opened_by`；真实EMPLOYEE从冻结人员解析，PORTAL_USER从实际用户解析，SYSTEM显示“系统”，缺名返回null。重复读取无写入；无需数据库迁移。
  - 验收：独立历史、复议后仍记录、字段隐藏/越权/懒加载、操作者/身份切换/缺名、开通人及评估入口透传；现有项目/共享结果/复议回归，未执行真实PostgreSQL/生产验收不得声称通过。
- [ ] F20-T02 共用历史弹窗与两入口开通提示
  - 允许修改：`frontend/src/api/performance.ts`、`PerformanceReconsiderationDetail.vue`、`PerformanceReviewEvaluationDrawer.vue`及既有 `.spec.ts`；新建 `components/performance/PerformanceChangeHistory.vue`。共享API与路由由主执行者串行整合，前端与后端文件所有权分离。
  - 复用800px历史弹窗、UiButton/PerformanceDialogShell/MemberIdentity/原差异组件；各条来源环节独立显示；空历史隐藏入口，换人员/页签/身份关闭旧弹窗。原复议编辑/催办与结果展示不改变。
  - 开通提示复用PerformancePromptNotice，姓名与GMT+8时间完整显示，缺姓名保留原时间文案，未开通不显示；管理detailLoader和评估templateTask共用抽屉。
  - UI门禁：现有页面小范围增强，沿已采集/已实现复议交互，无新页面或信息架构，不要求新完整蓝图；Spec012 N00/N11通用检查适用，无UCP/数仓/021任务。独立实现截图目标 `ui-blueprints/CR-010-F20-implemented-result-history.png`。
  - 验收：既有抽屉spec覆盖复议/终评校准历史、双loader、空态/缺名/切人关闭；相关Review/ProjectManagement回归、生产构建、实际本地页面与截图需分别记证据。
- 当前证据：后端项目/effective_results/reconsideration_results/reconsideration_lifecycle四文件 **959 passed、5 skipped、1既有python_multipart弃用警告**；追加懒加载/隐藏与透传定向 **3 passed**。前端 `PerformanceReviewEvaluationDrawer.spec.ts` **57 passed**；两入口 `Review.spec.ts`、`ProjectManagement.spec.ts` 与共享抽屉合计 **3文件212 passed**；`npm --prefix hr-portal/frontend run build` 通过（built in 43.08s），仅既有VueUse PURE annotation提示；`git diff --check`通过。
- UI验收：受控Chromium+隔离API夹具完成项目管理入口与我团队绩效入口，桌面截图分别为 `ui-blueprints/CR-010-F20-implemented-result-history.png`、`ui-blueprints/CR-010-F20-implemented-team-result-history.png`；开通人/北京时间提示、800px历史弹窗、来源环节、差异内容和无pageerror通过；390px实测弹窗x=16、width=358、document scrollWidth=390，无横向溢出。非真实业务数据库/生产API验收。
- 状态：代码、定向测试、整树前端构建及受控UI证据完成；真实PostgreSQL、生产登录态、部署、commit/push未执行，不将F20标记为生产完成。
- 排序增量（2026-11-17用户确认）：复议变更记录与上级评估统一为最新在上；先保留原升序历史末条的最近提交人/时间，再倒序返回展示数组，同时间按原查询事件ID倒序。共用弹窗继续按接口顺序渲染并默认展开首条，无前端/权限/数据来源/迁移变更。既有复议测试增加多条及同时间记录断言，验证最新提交提示和当前复议答案不变；后端复议结果与生命周期两文件 **110 passed**，前端共享抽屉 **57 passed**，1条既有python_multipart弃用警告。未重新执行构建/浏览器/生产验收，未commit/push。

## 24. CR-010-F21 复议首次处理与侧栏再编辑统一工作区（2026-11-17）

- 用户确认：复议已提交只读侧栏再次编辑，应与首次填写/其他环节使用相同的完整工作区，支持全屏/双屏，不保留禁用模式切换的嵌入式填写弹窗。覆盖绩效评估与项目管理入口。
- [x] F21-T01 本地入口统一与回归
  - 阅读：Spec002基线、CR-010-F07/F20、公共任务入口与SelfSummaryTask、Spec012 UI护栏/N00/N11；既有工作区接入修复，无新信息架构或蓝图，不涉及UCP/021。
  - 允许修改：`Review.vue/.spec.ts`、`ProjectManagement.vue/.spec.ts`、`SelfSummaryTask.vue/.spec.js`及本节；禁止改后端数据规则/权限/迁移/生产记录。保留此前复议历史排序未提交改动，不把其回归计成本轮后端验证。
  - 实现：移除Review的960px及ProjectManagement的1120px复议embedded弹窗/局部状态/提交回调；首次处理与再次编辑复用既有template-task完整路由、SelfSummaryTask、WriteModeSwitch、SplitWorkspace及模式记忆。真实edit_task_id/employee_no/node/draft_choice保持，跨页签编辑以目标节点而非原节点进入。
  - 返回契约：复议入口保留cycle_id；管理入口传`return_entry=management`及`return_root_review_id`（仅导航上下文，不是授权依据）。正式提交成功先失效原详情缓存，再恢复同周期/项目/成员复议侧栏；管理rootReviewId仍为成员ID，评估rootReviewId仍为任务ID。取消沿原公共返回，提交失败留在编辑页；服务端权限/期限/版本校验与复议答案来源不变。
  - Given首次未处理/已提交侧栏/其他节点参考页签的复议；When点击填写/编辑、选择使用草稿、提交；Then均进入公共完整工作区，目标任务/员工及草稿参数正确，无embedded弹窗，成功回正确侧栏；keep/change/失败/期限锁定及已有普通环节回归保留。
  - 自动化：`npm --prefix hr-portal/frontend test -- --run src/views/performance/Review.spec.ts src/views/performance/ProjectManagement.spec.ts src/views/performance/SelfSummaryTask.spec.js src/components/performance/PerformanceReviewEvaluationDrawer.spec.ts` → **4文件326 passed**；沿用既有Vue stub/nodeName/jsdom XHR stderr，未称零告警。前端vue-tsc+Vite初次构建通过（38.97s），最终增补cycle参数后构建通过（37.65s），仅既有VueUse PURE annotation提示；git diff --check通过。
  - 真实页面：本地Vite路由＋隔离Chromium/受控API，两个入口均从已提交侧栏点击编辑→完整工作区→双屏/全屏切换→提交→原入口复议侧栏；每入口正式submit仅1次、pageerror=0，payload仍为真实任务version与answers，无生产写入。
  - 实现PNG：`ui-blueprints/CR-010-F21-review-split-edit.png`、`CR-010-F21-review-fullscreen-edit.png`、`CR-010-F21-management-split-edit.png`、`CR-010-F21-management-fullscreen-edit.png`；已读取评估双屏与管理全屏，显示原公共头部、模式选择、参考内容与复议表单/提交栏。不冒称真实业务库/生产验收。
- 状态：本地代码/组件回归与受控UI完成；无需数据库迁移。真实业务数据库、生产部署、commit/push未执行；本节不代表前轮多处理人一致性问题已修复。

## 25. CR-010-F22 结果查看公共框架与空360模块隐藏（2026-11-17）

- [x] F22-T01 本地结果查看UI修复与回归
  - 用户确认：结果查看复用工作总结/自评查看框架；没有可见360反馈时不显示整个模块及空态文案。
  - 范围：`PerformanceReviewContent.vue`、`PerformanceResultReviewer360Block.vue/.spec.ts`、`Review.vue/.spec.ts`及本节；保留并行人员模块/router变更，不修改后端/API/权限/数据库或生产数据。
  - 框架：公共PerformanceReviewContent内部持有结果查看的completed-content，解决父级slot传入节点无法消费子级scoped容器样式的问题；结果页不再重复声明容器类。result-region的h3/p样式限定直接子级，不穿透公共Renderer的标题/正文；保留原region顺序、复议状态及未开通/失败空态，不增加虚假提交提示。
  - 360：父级region过滤与子组件复用同一可见内容判断，空contents/空schema/缺答案/空富文本/仅隐藏字段不输出模块、标题、空态及region间距；真实评级/标签/正文与可见提示保留，忽略previewValue。已有真实反馈的折叠、逐人展开及匿名身份契约不改。
  - UI门禁：既有查看页面内部修复，沿CR-010-F13及Spec012 N00/N11通用规则，无新信息架构/蓝图，不涉及UCP/021。无迁移、无业务写入。
  - 自动化：`npm --prefix hr-portal/frontend test -- --run src/views/performance/Review.spec.ts src/components/performance/PerformanceResultReviewer360Block.spec.ts` → **119 passed**。首次新增参数化测试错误解包已修正；首次构建发现测试get().exists类型错误，改为find().exists后测试复验通过；最终vue-tsc+Vite构建通过（56.97s），保留既有jsdom XHR/Vue stub及第三方PURE提示，不称零告警。
  - 实际页面：本地Vite路由＋隔离API/Chromium，工作总结/自评/结果三种查看态实测completed-content均width984/x358/maxWidth984px，正文14px/22px/rgb(31,35,41)。空360整模块不存在，有反馈时逐人展开正常；390px scrollWidth=390，无横向溢出；pageerror=0，业务写请求0。
  - 独立截图：`ui-blueprints/CR-010-F22-result-shared-readonly.png`、`CR-010-F22-result-with-feedback.png`、`CR-010-F22-result-mobile.png`；已读取前两张，验证实际实现而非设计稿。非真实数据库或生产验收，未commit/push/部署。

## 26. CR-010-F23 关闭复议结果的360引用类型一致性（2026-11-17）

- 用户确认：不能按标题或单独前端特判隐藏360；必须修复历史复议结果与当前冻结工作流的底层类型一致性。普通参考无内容仍保留普通空态，只有稳定角色为360的来源进入360专用渲染及空模块隐藏。
- 生产只读证据：项目24/周期12/原鹏飞105289的冻结节点 `evaluation-1` 明确为 `assessment.reviewer_360`/`REVIEWER_360`；结果查看引用 `reference_value=evaluation-1` 且来源存在；关闭复议 `appeal_id=2` 的 `result_snapshot.source_result.regions` 与 `effective_result.regions` 均把该区域保留为 `reference_kind=node`、`status=unavailable`、`content_count=0`。结果接口对关闭复议直接返回 `effective_result`，不重新组装当前引用类型，导致前端将真实360来源当普通空参考。
- [x] F23-T01 统一冻结来源角色投影
  - 关闭复议结果返回前读取同项目冻结 `result_view` 节点及其 reference `reference_value`，以冻结来源节点的稳定 `node_role_code` 判断 `assessment.reviewer_360`；只修正历史返回DTO的 `reference_kind`，不重算答案/区域顺序/可见权限、不改写 `effective_result`、不按标题/content_id后缀猜测。单一结果视图、来源存在且模板完整、引用ID无歧义才投影；普通参考保持 `node`，缺失/冲突保持原值。
  - 当前实时结果组装亦复用同一 `_result_reference_kind`，保证实时与关闭复议两条读取路径一致；无数据库迁移、无生产写入。
  - 验收：后端复议结果/生命周期/项目/共享结果四文件 **968 passed、5 skipped、1既有python_multipart弃用警告**；新增场景覆盖360、普通来源、来源缺失、模板缺失、跨项目、重复视图、重复引用及有反馈内容，并验证原快照不变、无需读取可变终评答案；前端结果页/360组件 **120 passed**。前端构建通过（41.76s，仅既有VueUse PURE提示）。
  - UI验证：隔离API/Chromium将真实后端投影结果送入结果页，旧 `reference_kind=node` 的空360区域归一化为 `reviewer_360` 后被完整隐藏；普通“发展建议”空参考仍显示“暂无可查看内容”；有冻结360反馈时可展开；pageerror=0、业务写请求0。截图 `ui-blueprints/CR-010-F22-legacy-reconsideration-360-hidden.png` 已读取。
- 状态：代码、回归、构建和受控链路完成；真实生产部署未执行，未修改生产数据，未commit/push。本修复不处理与本问题无关的并行人员/组织文件变更。

## 27. CR-010-T03/T04 校准分布提示判断、增减方向与宽度修复（2026-11-20）

- [x] 本次局部 Bug 增量的代码、定向回归、构建与本地组件视觉验证完成；关联现有 T03/T04，不代表其他历史卡或生产验收完成。
- 用户确认范围：强制/建议分布统一梳理；上限30人、当前5人属于符合，不显示减少25人的错误告警；等于目标35人、当前0人应提示增加35人；提示区始终铺满所属内容容器，固定左右内边距，不在大屏居中限宽。
- 根因与契约：后端原以 `diff != 0` 判断违反，忽略比较符；现按 `EQ/LT/LTE/GT/GTE` 对当前人数和既有取整后的目标人数判断。保留接口 `diff = current_people - target_people`，不改 URL、DTO、比例取整、授权、阶段/项目范围、撤销过滤、评级来源或正式结果解析。
- 前端复用 `PerformanceDistributionTips.vue`。用户后续明确纠正：强制/建议分布的已符合规则必须保留，显示绿色“已符合”标签、完整公式、目标及当前人数，仅不显示增减提示；不符合规则保留原强制红色/建议橙色标签，正差额提示减少、负差额提示增加。本条覆盖上一轮“仅展示违反规则”的错误展示口径。严格小于/大于调整至最近合法整数，等于阈值时仍须减少/增加1人。人数与比例统一使用精确目标文案：需等于/小于/小于等于/大于/大于等于 N 人，不再将等于写成最少需或把小于等于写成小于。
- 布局：移除组件自身1080px最大宽及水平auto margin，保留 `width:100%`、border-box和左右24px padding，增加 `min-width:0`。不影响其他正文/只读容器的限宽。沿CR-010既有页面和Spec012 N000/N00/N11通用护栏，属于校验/文案/局部样式修复，无新信息架构，无需新完整蓝图；无UCP/数仓专属任务或数据库迁移。
- 修改文件：`backend/app/performance/projects_router.py`、既有 `backend/tests/test_performance_projects.py`、`frontend/src/components/performance/PerformanceDistributionTips.vue/.spec.ts` 及本记录、PM-T003交互中的交叉引用。保留并行改动；未创建脚本、独立报告或测试文档。
- 后端：backend目录执行 `.venv/Scripts/python.exe -m pytest tests/test_performance_projects.py -k 'distribution_tips' -q --tb=short` → **63 passed、1048 deselected、1条既有python_multipart弃用警告**。原3项基线通过；新增60种强制/建议 × 人数/比例 × 五比较符低于/等于/高于阈值。新增夹具首次缺授权字段的失败已补齐并重跑通过。使用隔离Db/评级夹具，未执行真实数据库验收。
- 前端：frontend目录执行 `npx vitest run src/components/performance/PerformanceDistributionTips.spec.ts src/views/performance/Review.spec.ts` → **2文件154 passed**（提示组件10、评估页面144）。覆盖用户两个示例、两种控制模式、严格比较调整量、目标文案及折叠行为；保留既有Review的jsdom XHR/Vue stub告警，不称零告警。
- 构建：frontend目录执行 `npm run build` → **vue-tsc + Vite通过，built in 1m 12s**，仅既有VueUse PURE annotation提示。代码 `git diff --check` 通过。
- 首轮本地视觉（合规隐藏的断言已被上述用户纠正覆盖）：已有Vite 5173加载真实Vue提示组件与tokens，使用合成规则、独立临时浏览器页；2560/1440/390px视口分别测得组件宽2510/1390/340px，左右边缘均等于夹具容器的20px内容边界，组件左右padding始终24px、max-width=none，无横向溢出。合规上限规则隐藏，增加35人及严格大于时增加1人可见，折叠后规则组为0。截图 `C:/Users/gaby.liu/AppData/Local/Temp/CR-010-T03-distribution-{2560,1440,390}.png`，已读取2560和390截图；该证据仅证明实际组件布局与文案，不冒称完整鉴权页面、真实项目API或生产验收。
- 已符合保留增量验证：修改仅限提示组件、既有组件测试及两处现有交互记录，不改后端/DTO/权限/取整或铺满布局。frontend目录执行 `npx vitest run src/components/performance/PerformanceDistributionTips.spec.ts src/views/performance/Review.spec.ts` → **2文件156 passed**（组件12、页面144，既有jsdom XHR/Vue stub告警保留）；覆盖两模式全部符合、混合状态、状态双向切换、符合但diff非零不显示增减、折叠再展开与原不符合增减逻辑。`npm run build` → **vue-tsc + Vite通过，built in 1m 4s**，既有VueUse PURE提示。真实组件/合成规则在2560及390px验证四条规则全部保留，两条绿色已符合均无增减提示，两条不符合均增加35人，左右对齐且无横向溢出；截图 `C:/Users/gaby.liu/AppData/Local/Temp/CR-010-T03-satisfied-distribution-{2560,390}.png`，已读取390截图。此为本地组件证据，不是完整鉴权页面/真实API/生产验收。本次增量未重新运行后端测试（后端未改），未commit/push/部署。
- 首轮未执行：全量后端/全量前端套件、真实业务库/生产项目验收、commit、push、部署及生产数据操作。本次无迁移、通知或评级写入。

## F09 追加：他评及团队结果白色容器统一（2026-11-23）

- 用户确认：完成评估前台中“给他人的评估”“我团队的绩效”与“我的绩效”容器一致性修复。沿F09自然撑高契约，属于既有页面局部样式调整，无新信息架构或整页蓝图；不改变实际填写工作区既有尺寸、多任务校准全屏、API、权限、周期快照、数据库或业务行为。
- 实现：`PerformanceReviewContent.vue` 的成员/反馈工作区由父白板统一承担四边20px内距、背景/圆角/阴影，body及panel使用`flex:1 0 auto`，内部内容不收缩；短内容铺满、长内容自然增长，纵向滚动仍由review-content承担。`ProjectMemberListPanel.vue`增加隔离`review`变体，`PerformanceReview360FeedbackPanel.vue`增加`embedded`属性，嵌入时关闭自身重复padding/背景/阴影，保留表头和白色遮挡层。
- 团队/关注人员结果：`PerformanceResultScopeView.vue`外部20px灰底间距，四页签共用唯一`PerformanceSurfaceCard`；总览/矩阵/报表嵌入，成员使用review。flex链铺满剩余高度，报表局部抵消顶部重复20px spacer并清除底部额外margin；继承专用表头偏移，不改变公共页签/全屏校准默认样式。`Review.spec.ts`覆盖六类工作区嵌入、四结果页签及原完成态自然增长。
- 本地浏览器证据：Vite5173实际Vue组件、隔离Chrome及受控API，在1280×720验证评估/单任务校准/复议成员、360评估/结果沟通/360确认的0/2/40人成员。普通短白板616px；40人评估白板2570px、反馈2510px，长列表底内距20px。普通列表滚动420px后遮挡层y0、表头y20，无灰底漏出；错误态保留同一白板并可重试。团队四页签短白板588px；长成员白板2510px/底内距20px，滚动后页签底60px、遮挡层60–80px、表头80px；统计标题首屏距白板20px、吸附68px，与页签无重叠。390px无页面横向溢出，pageerror=0。
- 截图已读取：`C:/Users/gaby.liu/AppData/Local/Temp/CR-010-review-surface-short.png`、`CR-010-review-surface-feedback-long.png`、`CR-010-team-report-top.png`、`CR-010-team-member-sticky.png`。均为实际组件受控API证据，不是完整登录态真实项目/数据库或生产验收；浏览器夹具曾因模块路径与Vite依赖版本不一致失败，改用应用实际模块后复验通过，未修改业务代码解决夹具问题。
- 最终定向命令：`npm --prefix hr-portal/frontend test -- src/views/performance/Review.spec.ts src/components/performance/calibration src/components/performance/PerformanceLineTabs.spec.ts src/components/performance/ProjectStatisticsReportPanel.spec.ts src/components/performance/ProjectPerformanceMatrix.spec.ts` → **12文件262 passed**；保留既有jsdom scrollTo/XHR和Vue stub提示。构建尚在运行，不提前记录通过。
- UI合规：已读Spec002基线、CR010/014及Spec012 UI交互/实施守则，沿N00/N11复用既有token和组件，无禁止项；不涉及数仓/UCP/破坏性操作。未创建脚本、独立报告或测试文档，未commit/push/部署，未执行真实业务API/数据库或全量套件。

## F09 追加：成员列表加载后底线上移修复（2026-11-23）

- 用户确认现象为数据出现后表格底线上移，授权完成修复。范围为360反馈、上级评估、绩效沟通和关注人员绩效的共享列表加载行为；沿既有页面小修，无新蓝图/API/权限/迁移或生产操作。
- 根因：列表加载态沿空态预留220–300px，少量数据呈现后收缩；成员请求和列偏好独立返回，成员先显示时，稍后移除表格前的列设置提示段落还会再次上移。UiTable的ResizeObserver仅量宽，未发现该链路直接重写高度，不将其泛称为根因。
- 实现：UiTable仅增加loading行标识；PerformanceManagementTable仅对page滚动模式消费既有51px行高，内滚动及其他UiTable消费者的空态不变。成员/反馈加载提示移除220/300px空态最小高度，真实空态/错误态保留。ProjectMemberListPanel将成员和列偏好加载共同作为表格loading门禁，列设置提示放入同一加载行，不再在数据上方追加后移除段落。未固定表格总高度，长数据仍自然撑高。
- 本轮文件：UiTable.vue/spec.ts、PerformanceManagementTable.vue、ProjectMemberListPanel.vue、PerformanceReview360FeedbackPanel.vue、Review.spec.ts中的late preferences回归及本记录；保留其他会话的360未开始/校准完成组件与测试改动。
- 验证：专项2文件27 passed（筛选未执行160项）；最终联合 `npm --prefix hr-portal/frontend test -- src/views/performance/Review.spec.ts src/components/ui/UiTable.spec.ts src/components/performance/calibration src/components/performance/ProjectStatisticsReportPanel.spec.ts src/components/performance/ProjectPerformanceMatrix.spec.ts` → **12文件285 passed**。首轮282 passed/1失败为并行校准文案旧断言，由对应会话更新后复验；构建首轮并行360测试可空访问报TS2531，修正后最终 `npm --prefix hr-portal/frontend run build` → **vue-tsc＋Vite通过，3832模块，45.34s，exit0**；既有jsdom XHR/scrollTo与VueUse PURE警告保留。
- 实际Vite＋隔离Chrome受控API逐帧覆盖四类列表1/2/30人及空态，数据呈现后底线保持稳定；按真实identity_status字段复验四类单人场景，加载/数据行均51px、表格底线均y221（0px位移）。上级评估偏好故意晚返回时保持加载行，不先显示数据；390px无页面横溢、pageerror0。早期无identity_status夹具产生57px行高，曾补57px占位，真实字段复验后撤回该夹具推导，最终沿51px既有token。截图performance-loading-before/after.png仅为中间夹具，不作为最终51px证据；最终结论依据DOM实测。
- UI合规：已读Spec002/012交互与实施守则，复用现有token/组件，无禁止项；无新脚本/独立报告/测试文档，无commit/push/部署，真实业务项目API及数据库验收未执行，不以受控API冒充生产。

## 19. CR-010-F13 结果查看配置与运行架构一致性（2026-11-10）

- 用户确认：修复结果查看与工作总结提交后容器不一致、未配置评级摘要及显示顺序偏差，保证整体架构一致。沿用PM-T004结果查看与区域排序契约、CR-007正式入口；无新页面/流程，无需新完整蓝图。
- 任务范围：后端 `projects_router.py`、`self_summary_service.py`、既有 `test_performance_projects.py`；前端 `api/performance.ts`、`PerformanceReviewContent.vue`、`Review.vue/.spec.ts`、`PerformanceTemplatePreviewStep.vue/.spec.ts`；仅更新本记录，不修改并发人员组、页签、全局tokens及提示组件。
- DTO与来源：原GET结果接口保留 `results/contents`，增加 `content_page_name/regions`；regions包含result和显式reference区域，按冻结 `content_region_order` 排序，缺省result先、引用按配置顺序。主区按view内容及局部item顺序，独立/行内prompt按allowView/onlyWhenFilling裁剪；评级兼容字段也从可见schema生成，不绕过view配置。页面不再独立渲染results评级摘要。
- 历史边界：opening.result_version非空时以绑定final任务确定同项目/周期/员工的单一冻结成员快照，不追最新roster；空历史version仅当final任务组的唯一成员快照、全部完成未撤销、成员归属及唯一final均可证明时兜底，多快照/无法证明沿404 RESULT_NOT_FOUND。不修改opening行，不改变最终发布值的final任务来源，不将校准结果自动写回终评。
- 参考权限：仅配置关系、冻结来源模板及同项目/周期/成员快照/员工的已提交未撤销任务；复用 `project_reference_content` schema与答案白名单，匿名360及缺失模板安全空态，不回退当前模板。OKR仅显式配置时通过authorized_okr_read读取本人；未知内置参考返回unavailable，不捏造数据。引用提示仅填写时可见采用source OR local，local false不能解除来源true；主结果提示仍允许本地配置覆盖。
- 组件复用：结果页直接复用 `PerformanceReviewContent` 的review-panel.completed白卡及completed-content尺寸链，正文继续 `PerformanceTemplateRenderer(mode=readonly)`，OKR复用 `PerformanceOkrPanel`。复议提示/按钮使用既有接口与确认弹窗、UiButton，在白卡底部展示，不纳入模板region排序，不伪造提交完成提示。预览保持原单面板，消费同一region key/order及可见设置，360只保留匿名外壳；非result_view行为不扩展。
- Given/When/Then：配置reference在result前、B/A反序、独立prompt/隐藏item/自定义标题，打开结果→仅可见内容按配置顺序进入共享白卡；仅旧results无contents→不额外渲染评级；显式regions=[]→不回退旧内容。未开通/快照歧义/成员不符→拒绝；切换项目→丢弃旧响应。复议按钮继续打开原确认框。既有tests覆盖以上成功/拒绝/空态和模板配置/任务页回归。
- 前端验证：`npm --prefix hr-portal/frontend test -- --run src/views/performance/Review.spec.ts src/views/performance/SelfSummaryTask.spec.js src/components/performance/PerformanceTemplatePreviewStep.spec.ts src/components/performance/PerformanceTemplateRenderer.spec.ts src/components/performance/PerformanceReviewEvaluationDrawer.spec.ts src/views/performance/PerformanceTemplateContentSettings.spec.ts src/components/performance/performanceContentSettingsResolver.spec.ts` → 7文件328 passed；其中预览最终28 passed。Review既有jsdom XHR AggregateError stderr仍存在，不宣称零告警。最终 `npm --prefix hr-portal/frontend run build`（vue-tsc＋Vite）通过，仅既有VueUse PURE annotation提示。
- 后端验证：结果/引用等联合定向135 passed；引用提示四组合追加后定向30 passed。最终 `tests/test_performance_projects.py tests/test_performance_template_workflow.py tests/test_performance_user_authorization.py` → 922 passed、6 skipped、6 failed；失败均为前轮已在HEAD原路由复现的 `_communication_progress_detail` fixture缺scalars：workbench_tasks_and_people_return_live_due_date、evaluation_member_list_can_return_completed_and_pending_tasks及member_lists_keep_supervisor_name_visibility_and_zero_360_rate的True/False×review/communication，不修改无关夹具。
- 浏览器证据：真实Vite路由＋隔离Chromium受控API，1440×900/390×844，验证同一白卡内参考先于主结果、独立提示/题序、配置标题、额外摘要不存在、无编辑器、复议弹窗打开/取消及404拒绝清空正文；白卡rgb(255,255,255)，无横向溢出，pageerror=0。临时截图 `C:/Users/gaby.liu/AppData/Local/Temp/result-view-fixture-{desktop,mobile,denied}.png`，desktop/mobile已读取确认；不冒充真实数据库或生产证据。
- 完成边界：本地实现/定向回归/受控UI及构建已验证，git diff --check通过。无迁移、无写库、无外部通知、无生产部署、未commit/push；真实PostgreSQL/已开通真实项目API验收未执行，不勾选完整生产验收。
- 结果未开通局部修正（2026-11-10）：用户要求“查看绩效结果”不显示节点状态，未开通时与其他流程节点同位置显示120×121图标及“暂未开通结果”。已先评估并复用 `public/performance-not-started.svg`，未新增/重画资源；因采集省略SVG路径，不能断言与原站图形完全一致。侧栏仅排除result_view状态标签，其他节点不变；`PerformanceReviewContent` 接收resultUnavailable，在该状态取消completed布局并复用原review-panel居中规则和state-illustration。`Review`仅对404 RESULT_NOT_FOUND显示该空态，网络/500等继续错误及重试；成功但无配置内容仍为“暂无可查看的绩效结果”，不得误判未开通。无API/数据库/权限变更，不重写开通或结果历史。测试 `npm --prefix hr-portal/frontend run test -- src/views/performance/Review.spec.ts src/components/performance/PerformanceResultReconsideration.spec.ts` →93 passed（82+11，既有360 XHR stderr）；覆盖四种result节点状态隐藏、其他节点状态保留、404空态/居中布局、重开清理、500及重试、原结果/复议回归。小范围原位调整不要求新蓝图，未新建测试文档，构建结果另记录。
