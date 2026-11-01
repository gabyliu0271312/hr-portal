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
