# CR-014 多项目校准任务工作区

- 日期：2026-11-22。
- 状态：业务代码、本地联合回归、构建及实际Vue页面验收已完成；真实PostgreSQL迁移／并发仍受本机环境阻塞，未发布。蓝图v1及其三项历史政策经展示后，用户再次要求“完成全部开发”，按确认推进。
- 关联：CR-005、CR-007、CR-010、CR-013；REA评估见 `../rea-extract/REA绩效校准-多项目多阶段多规则-首页与全屏工作区评估.md`。
- 蓝图：`../ui-blueprints/CR-014-calibration-task-workspace-v1.md`、同名HTML；计划PNG不能替代实现截图。

## 已确认需求

同周期当前校准人可处理多个项目、多阶段和多条规则任务。首页状态筛选与按项目分组的四列表格，范围hover及全屏任务导航沿REA结构；成员、矩阵和统计复用公共组件，不建新结果引擎。完成按当前业务校准任务，而非同阶段全部责任；物理成员任务和业务范围任务不能混同。任务序号稳定，人员和任务计数分开。

范围与人员字段沿周期／项目冻结快照、来源规则、未撤销物理任务和有效授权链，角色使用可信当前身份。首页与全屏共用范围展示，后者追加冻结说明。空态复用 `/performance-no-submit.svg`。

原校准业务任务完成后锁终评，校准在自身窗口仍可继续提交；缺结果提示不阻断，强制分布阻断，建议分布不阻断。授权子任务独立，不顺带完成父任务。规则A完成不完成重叠规则B，物理结果仍共享。

三项历史策略按蓝图执行：旧完成无法证明当前规则来源时不伪造规则完成、保留原锁；新增成员产生未完责任，业务任务恢复待校准但保留旧成员完成事实；删除来源沿现有有效物理任务锁定政策，不借迁移更改解锁语义。

## 共享契约

- `GET /performance/review/calibration-tasks?cycle_id=N` → `{tasks,pending_member_count}`。`pending_member_count` 定义为未显式完成业务任务（含逾期）覆盖成员，按 `(project_id,member_snapshot_id,employee_no)` 去重；同项目跨规则／阶段不重复、跨项目分别计数。这是本地明确契约，本次实采不能单独证明飞书是否包含未重叠的逾期成员。tasks每条含 `scope_key,project_id,project_name,node_id,node_name,phase_id,source_rule_id,task_number,scope_label,rule,people_options,status,start_at,end_at,member_count,can_complete,read_only,history_ambiguous`。rule使用既有flow结构或null，people_options在任务顶层。status为pending/completed/overdue；scope_key服务端权威引用，非授权凭证。
- 原 `GET /performance/workbench/tasks/{node_id}/people`、`distribution-tips` 接受 `scope_key`，成员过滤先于人数、排序及分页；原project_id/phase_id继续校验与范围相符。
- 原 `POST /performance/projects/{project_id}/calibration-completion/{preview|confirm}` 接受scope_key；confirm携带scope_version。带key时严格范围匹配，不合法绝不回退阶段全量。旧调用的兼容范围由后端明确处理。
- 完成返回原PerformanceCalibrationCompletion及distribution_tips、blocked_reason等。只使用正式结果版本，草稿不作为已完成。
- 权限／不存在按既有隐藏资源策略；409 CALIBRATION_SCOPE_CHANGED、CALIBRATION_DISTRIBUTION_VIOLATED、CALIBRATION_HISTORY_CONFLICT、SUBMISSION_NOT_ALLOWED；403只读，422非法参数。具体返回沿统一服务，不能前端自行扩大任务集合。
- 范围版本覆盖成员、任务、来源、授权与祖先链、窗口、分布和正式结果版本。项目锁串行，完成事实、审计及必要后置同事务；沿原锁序。授权组key使用其最小授权记录形成稳定引用：删除非最小成员且key仍有效时版本冲突409；删除最小成员或全部撤销导致旧key失效时404。两者均要求重新加载，不扩大范围或回退阶段全量。
- 规则级完成持久化由唯一新迁移提供，不复制物理任务／正式答案；ANY终评锁和ALL前置判断明确区分。新增持久化和消费者由T02单一owner维护，不并行创建迁移head。

## 非范围及权限边界

不更改项目启动的同周期被评估人占用规则，不使用实时组织重算历史范围；不开放管理全量API后前端过滤；不新增权限中心、任务引擎、评分引擎或调度系统。无生产SQL、真实通知发送、commit、push或部署。

## 原子任务

各任务仅主线程验收后可勾选。共同必读：START_HERE、蓝图v1、REA评估、CR010/013相关规则、项目CLAUDE、Spec012 N00通用UI规范。未执行／环境不可用必须标not-run／blocked。

- [x] CR-014-T01 规格、范围合同和蓝图
  - 允许：本文件、changes/README、蓝图及REA评估相关小节、roadmap。
  - 输出：需求与DTO/错误/权限/历史策略对齐，无未确认的相互矛盾业务规则。
  - 验收：用户决定与实采／本地建议区分；蓝图已确认；PNG标planned而非implemented。
- [ ] CR-014-T02 后端聚合、范围完成与迁移
  - 允许：backend/app/performance/{models,projects_router,calibration_service,calibration_completion_service,reviewer_360_task_service}.py；新增calibration_workspace_service.py；必要依赖消费者需主线程确认；backend/tests相关用例；唯一新alembic迁移。
  - 禁止：旧迁移、生产、全项目重建；shared models/router由此任务独占。
  - 输出：上述API；规则完成独立、共享正式结果、授权链过滤、legacy提示和旧锁保留。
  - Given A/B重叠、跨项目／阶段与授权，When完成A，Then仅A完成，终评按现行锁定，B仍可在窗口内校准；分页与计数范围一致。
  - 验证：backend/.venv/Scripts/python.exe -m pytest tests/test_performance_calibration_workspace.py tests/test_performance_shared_results.py -q；现有项目定向回归；alembic heads、隔离DB upgrade/downgrade/upgrade与并发回滚。
  - 阻塞：真实数据库不可用时不声明迁移／持久化全链路验收完成。
- [x] CR-014-T03 首页、规则hover与API适配
  - 允许：frontend/src/components/performance/calibration下薄组件／spec、api/performanceCalibration.ts、必要RuleSummary小扩展和tokens追加。
  - 共享：不改T04的Review/原api；跨任务消息协调DTO。
  - 输出：首页四状态、分组、固定编号、同款空态、标题／条件hover，权限错误可重试。
  - Given两项目两阶段多规则，When筛选四状态，Then匹配任务、空项目隐藏、编号稳定，hover不溢出。
  - 验证：相应Vitest、build；独立PNG CR-014-T03-implemented-calibration-home.png。
- [x] CR-014-T04 全屏导航、成员、分析与原入口集成
  - 允许：新calibration组件、ProjectMemberListPanel必要scope/provider小扩展；Review.vue、原api DTO、router由主线程串行持有；公共report禁示例prop由主线程维护。
  - 输出：路由恢复、任务范围切换、成员分页／排序／列配置、原详情／编辑／催办真实上下文，矩阵与统计仅合法API数据，无mock回退。
  - Given切范围或身份，When旧请求后返回，Then不覆盖新范围；跨项目成员可打开正确详情，不能跳至另项目数据。
  - 验证：Review及新组件Vitest、分析纯适配测试、build；独立PNG CR-014-T04-implemented-calibration-workspace.png。
- [ ] CR-014-T05 任务级预检、完成与分布阻断
  - 允许：T02完成服务与T03全屏组件owner分别执行，公共确认／分布壳复用。
  - 输出：当前scope预检和version确认、强制阻断、缺结果可确认、幂等与冲突反馈。
  - Given预检后范围或正式结果变化，When旧版本确认，Then409并重预检，不自动扩大完成范围；仅任务A状态更新。
  - 验证：后端完成测试、前端接口参数／弹窗／error测试；独立PNG CR-014-T05-implemented-calibration-completion.png。
- [ ] CR-014-T06 联合验收与记录
  - 允许：相关测试与本文件证据；不以未执行命令报通过。
  - 输出：定向pytest/Vitest、vue-tsc+Vite、git diff --check；本地真实Vue浏览器的正常／空／错误／任务切换／完成分支，与受控API夹具和真实SQL分开标注。
  - 验证：完成状态持久化、重开、规则增删、权限允许／拒绝、并发／事务回滚；未覆盖不得勾选。

- 修复回归完成：单任务（pending/completed/overdue）沿原`PerformanceReviewContent + ProjectMemberListPanel + PerformanceConfirmDialog`直接工作区；多任务仍进入新任务首页；当前状态筛选只影响显示，不改变单／多任务模式；伪造scope不回退到唯一合法任务。首页分段筛选和白色容器按REA目标重排，范围anchor改为文字自身并局部校准浮层内部间距。最终定向回归5文件176 passed；vue-tsc及Vite构建通过（45.09s，仅既有VueUse注释提示）。

## F01 DOM还原与单任务范围回归修复（2026-11-22）

- 用户明确：本轮新增首页／全屏选择流程只用于当前周期、当前身份的多条合法业务校准任务；单任务保留已实现的直接成员工作区和完成确认交互。
- 模式依据未筛选的完整任务集合，包含已完成与逾期；不能用项目数、被校准人数、物理任务数或当前状态筛选结果判断。初次任务加载期间显示加载态，避免单任务先闪现新首页；伪造范围引用仍拒绝，不回退到唯一有效任务。
- 多任务首页按重新实采DOM纠正：32px相连分段筛选、14/22文字、左右16px内距；标题在白卡外，公共白卡四边20px内距、r8、既有阴影，筛选至表格16px。页面内容外边距20px，保持导航→白卡→表格两层边界。
- 范围hover以文字自身为锚点，不用整列宽度；新范围展示场景局部对齐标题字重600／顶部4px、字段标签26px、条件间距6px、人员标签左2右8及20px头像。旧规则配置摘要／其他分段控件默认样式不变，不全局改浮层边框或定位引擎。
- 影响：前端calibration组件、原公共review内容组合、Segmented/RuleSummary的隔离变体、必要tokens和测试。无数据库／权限／后端写入合同变化；不自动commit/push。
- 验收：单任务pending/completed/overdue原UI、原确认、scope参数；多任务筛选只剩一条不切模式；无权限及身份切换旧请求均有回归保护。实际Vue＋受控API、1280px视口下验证白卡x280／表格x300、padding20px、分段高32px、筛选至表格16px；hover锚点与文字宽度相等、标题600／margin4px 0 8px、条件gap6px、字段高26px、人员padding0 8px 0 2px。单任务直接成员及原确认、多任务筛选不切模式，pageerror=0。
- 本轮实现PNG：`ui-blueprints/CR-014-F01-implemented-multi-task-home.png`、`CR-014-F01-implemented-scope-hover.png`、`CR-014-F01-implemented-single-task.png`。均来自实际Vue组件与受控API，不是生产或真实数据库验收。

## 验收记录

2026-11-22，本地代码开发与前端验收完成，真实PostgreSQL迁移／并发尚未验收，未发布。

### 实现文件与链路

- 后端：新增 `app/performance/calibration_workspace_service.py`，修改 `calibration_completion_service.py`、`calibration_service.py`、`models.py`、`projects_router.py`、`reviewer_360_task_service.py`；新增 `tests/test_performance_calibration_workspace.py` 和迁移 `0322_pm_calibration_rule_completion.py`。
- 前端：新增 `api/performanceCalibration.ts`、`components/performance/calibration/` 下首页、侧栏、范围、工作区、完成、分析、全部人员组件及相应用例；修改 `Review.vue/spec.ts`、原API上下文类型、RuleSummary、ProjectMemberListPanel、公共报表示例开关、UiDialogShell和tokens。Review移除旧阶段级完成UI，scope接口由专属API适配。
- 完成标记写入 `performance_node_tasks.calibration_rule_completions`（nullable JSONB）；物理答案与正式结果不复制。原完成字段保留ANY终评锁，ALL前置通过明确helper核对规则责任。
- 页面沿 `/performance/review`，query `calibration_open/calibration_scope/calibration_tab/calibration_filter`；全部人员只从合法scope成员接口逐页取齐后按项目＋员工去重，无批量完成。任何后页失败不返回伪全量；身份／周期旧请求隔离。
- 分析复用原矩阵／统计组件，从合法API成员做只读派生；缺失自评／历史字段显示明确原因，不虚构数据，关闭该场景的示例入口。原报表内部已有高级筛选等能力边界保持，不宣称外部系统全部分析子交互均被复刻。

### 已通过

- 后端实施代理最终报告：四文件全量 **1169 passed、5 skipped、1条既有multipart弃用提示**。新增专项文件包含14项，用真实SQLite与ASGI覆盖列表→预检→确认→重开、规则独立完成、ANY锁／ALL前置、合法范围分页、授权父链来源／只读保护、legacy、新成员重开、事务失败回滚、迁移历史保护。跳过项不记通过。
- 主线程最终联合命令：`npm --prefix hr-portal/frontend test -- src/views/performance/Review.spec.ts src/components/performance/calibration src/components/performance/ProjectStatisticsReportPanel.spec.ts src/components/performance/PerformanceCalibrationRuleSummary.spec.ts src/components/performance/ProjectMemberListPanel.spec.ts src/components/ui/UiDialogShell.spec.ts` → **10文件206 passed**。包含范围参数、四状态、真实范围触发点击／键盘、返回恢复、身份竞态、完成版本冲突、全部人员去重与跨项目详情。既有jsdom window.scrollTo与个别stub警告不影响通过。
- 组件owner后续收尾定向：8文件30 passed，覆盖header-start公共插槽、嵌套Escape及busy防退出等；不得与联合数直接相加当去重总数。
- 最终 `npm --prefix hr-portal/frontend run build` → **vue-tsc与Vite通过，3827模块，40.02s**；仅既有VueUse PURE注释提示。先前测试夹具缺必填profile字段造成的构建失败已补齐后复验，不冒称首次即通过。
- 实际Vite 5173＋隔离Chrome、受控API夹具：两项目四任务、四状态、同款空态、范围进入全屏、成员scope参数、强制阻断、确认仅s2、其他规则保持overdue、嵌套Escape不关全屏、400px无页面横溢、pageerror=0。确认payload实录形如 `{node_id:'calibration',scope_key:'s2',phase_id:'p1',scope_version:'v1'}`。
- 补充实际页面验证：矩阵从scope数据渲染，report tab渲染无示例，全部人员正常显示结果，伪造scope显示拒绝，500加载失败提示可见，pageerror=0。测试定位角色曾误用button导致超时，修正为tab后通过，不属于产品失败。
- 实现截图（实际Vue＋受控API，不是HTML计划图）：`ui-blueprints/CR-014-T03-implemented-calibration-home.png`、`CR-014-T03-implemented-calibration-empty.png`、`CR-014-T04-implemented-calibration-workspace.png`、`CR-014-T05-implemented-calibration-completion.png`。主线程已查看全屏截图核对返回／时间／侧栏同行／灰底白成员区。
- `git diff --check`通过；本轮测试对根 `.vite/vitest/results.json` 的副作用已恢复原内容，既有临时文件保留。

### 迁移与未完成验收

- 唯一Alembic head：`0322_pm_calibration_completion`，down_revision=`0321_pm_pre_lock_adjustment`。离线PostgreSQL upgrade SQL已检查为仅新增nullable JSONB；有规则完成历史时拒绝有损downgrade，单测通过。
- **blocked**：真实隔离PostgreSQL upgrade/downgrade/upgrade、事务锁并发与真实前后端→PG→重开。本机127.0.0.1:5432不可连接，Docker daemon不可用；没有访问生产或借用非隔离数据库。SQLite回读与夹具浏览器不能替代这部分。
- 未执行：生产登录／真实飞书送达、commit、push、部署。发布前需在获准隔离PG完成迁移及并发验收，再通过常规开发版本推送部署；不在生产现场打补丁。
- T02/T05/T06因PG相关验收未完成保持未勾选，含义是代码已交付但整体验收有环境阻塞，不是尚未实现这些功能。

### UI合规自检

已阅读Spec012 ui-interaction与guardrails，应用通用N00规则，不涉及数仓专属页面、UCP或可视化建模。复用现有布局、token、表格、popover、DialogShell、成员／评级／评估率与空态资源；未新增业务菜单／权限中心或平行引擎。实现PNG与本版蓝图已关联，真实PG限制如上。
