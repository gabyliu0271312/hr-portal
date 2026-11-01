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
