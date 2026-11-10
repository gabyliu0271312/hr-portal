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
