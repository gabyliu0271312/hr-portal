# CR-013 编辑限制与校准增量维护

- 状态：代码实现、定向回归及构建已完成；隔离数据库迁移/并发和真实浏览器全链路验收阻塞，未发布。
- 权威：2026-11-06 用户八项明确决定、20261106-113806.jpg 及“以截图为准”；关联 PM-T003、PM-T004、CR-005、CR-012。
- 本记录覆盖旧“启动后全面禁止校准增删”“分布随项目启动永久冻结”“已用模板整接口禁止保存”条款，其他快照、权限和历史保留边界不变。

## 合同

1. 启动后已有校准规则/阶段内容不可原位编辑，允许显式增删，阶段时间可调整。已截止阶段不可删；须先延期保存再删除。分布仅在全部既有阶段未开始时可修改；不得在同请求删阶段或改时间绕过。
2. 规则使用稳定 rule_id、阶段使用 phase_id，冻结每条规则的分配来源。只解析新增规则；删除移除来源，重叠来源仍存在的任务保留，allow_authorize 重新 OR。失效任务设置独立 revoked_at，撤销委托，原答案/草稿/状态/版本/时间保留。相同 tuple 重加创建新任务，不复活旧委托。历史来源无法证明时拒绝增删，不从实时花名册猜测。
3. 现有项目 PATCH 扩展显式校准操作及原配置摘要；配置、节点、任务、授权、审计单事务。所有操作入口锁后复验，待办/权限/统计过滤撤销任务，历史结果不机械过滤。通知成功保存后发送，失败单独反馈，遵守全局投递三态。
4. 项目结果开通方式一直可改，已有开通记录不重建。历史配置默认补齐不算 dirty，无修改下一步不 PATCH，局部保存不夹带锁定配置变更。
5. 周期离职开关和日期按原 start_at 判开始锁定；单员工 update-info 始终可用，受控数据库例外只更新既有资料维度，不增删快照、不重算项目成员和历史任务。整批刷新/手工维护不在放开范围。
6. 被任一项目引用的周期模板禁止移除，全部前端路径保护，后端周期锁复核。
7. 已用模板结构/绑定/排序/执行人/数据写入锁定；内容名称、题目名称/提示、显示/参考/提示叶子允许修改。content_library 为共享定义权威，节点保留局部设置。只同步展示叶子到项目快照，不改答案、题型、选项、填写权限、必填或任务身份。
8. GET/PATCH 使用真实引用关系判断模板 usage，不依赖未维护的冗余计数。错误区分权限403、资源404、状态冲突409、输入422。

## 原子任务

- [ ] CR-013-T01 合同、任务及原功能交互记录
  - 范围：本记录、PM-T003/PM-T004 ui-interaction、冲突条款关联；不改无关规格。
  - UI：原页面局部修改，用户截图确认，不新增页面/完整向导。
- [ ] CR-013-T02 迁移与校准后端闭环
  - 范围：performance models/calibration/project/router/authorization/navigation、唯一新迁移、既有对应测试。
  - 输入输出：项目 PATCH 显式操作/摘要，活动任务唯一索引；历史任务保留。
  - 验收：重叠规则、删后重加、权限收敛、历史答案、窗口、幂等、事务失败及并发提交/删除；隔离 PostgreSQL 升降级。
- [ ] CR-013-T03 项目前端与无修改保存
  - 范围：ProjectSettingsPage/FlowSettings/TimeSettings/calibration helper、api/performance.ts、既有测试。
  - UI：原路由项目编辑，既有项编辑disabled、截止删除disabled、分布按阶段时间、ConfirmDialog #check通知；失败保留输入。
  - 验收：无改下一步、抽屉即时保存基线、增删时窗、时间补齐、结果开通及刷新；独立PNG CR-013-T03-implemented-project.png。
- [ ] CR-013-T04 周期及人员受控更新
  - 范围：cycle service/router、周期页及实际人员组件、唯一迁移链串行、既有测试。
  - 验收：old_start_at锁、反选/标签/清空保护，已开始单员工资料更新成功，普通锁保护仍有效、异常事务不泄漏；独立PNG CR-013-T04-implemented-cycle.png。
- [ ] CR-013-T05 模板字段锁及展示同步
  - 范围：template router/service、模板流程/内容页及必要字段组件、既有测试。
  - 验收：真实引用、展示字段成功、结构/写入篡改拒绝、局部跨环节/项目展示同步不改答案；独立PNG CR-013-T05-implemented-template.png。
- [ ] CR-013-T06 统一回归与证据
  - 命令：相关 pytest、定向 Vitest、npm build、git diff --check；迁移在隔离库 upgrade/downgrade/upgrade。
  - 真实 UI→API→SQL→重开与夹具证据分开；跳过/未跑/环境阻塞不记通过；无全部证据不得勾选。

## 共享及禁止

迁移链由主线程串行协调，开工 head 为 0292_performance_reconsiderations；本轮新增 0293_performance_calibration_revocation → 0294_pm_person_info_guard，alembic heads 已确认唯一 0294。共享 models/projects_router/API 类型禁止并行覆盖。保留用户及其他线程工作区改动。禁止生产操作、改旧迁移、全项目重建、硬删结果、另建评分/消息/调度引擎或未要求的相邻修复。

## 验收记录

2026-11-06 本地最终验证：

- 后端：在 backend 执行 `.venv/Scripts/python.exe -m pytest tests/test_performance_projects.py tests/test_performance_cycles.py tests/test_performance_template_workflow.py tests/test_performance_object_authorization.py -q --disable-warnings`，最终 **727 passed、7 skipped、1 warning**。skip 为数据库 opt-in 用例，不记通过；warning 为既有 python_multipart 弃用提示。
- 前端：`npm --prefix hr-portal/frontend test -- src/views/performance/PerformanceProjectSettingsPage.spec.ts src/components/performance/PerformanceProjectFlowSettings.spec.ts src/components/performance/PerformanceProjectTimeSettings.spec.ts src/views/performance/CycleManagement.spec.ts src/views/performance/PerformanceTemplateWorkflowSettings.spec.ts src/views/performance/PerformanceTemplateContentSettings.spec.ts src/components/performance/PerformanceAssessmentContentLayers.spec.ts src/components/performance/PerformanceConfiguredContentBlock.spec.ts src/components/performance/PerformanceSearchSelect.spec.ts`，最终 **9 文件、383 passed**。此前旧部门 ElTable 断言失败已按实际 UiTable 最小修正，最后联合命令通过。
- 构建：`npm --prefix hr-portal/frontend run build` 的 vue-tsc 与 Vite 通过，只有既有 VueUse PURE 注释警告。后端编译通过；`alembic heads` 唯一 0294_pm_person_info_guard。
- 空白检查：`git -c core.whitespace=cr-at-eol diff --check` 通过；默认 diff --check 将共享 CycleManagement.vue 中的混合CRLF新增行视为尾随空白，未为格式化覆盖其他会话的复制功能修改。
- 覆盖：历史无改下一步/部分提交/canonical规则ID、增删显式操作和基线冲突、保存前时间窗/分布限制、重叠来源OR/软撤销/重加新任务、保留答案草稿版本、权限入口过滤、周期原开始时间防绕过、单员工事务维度更新、实际模板引用及严格叶子白名单/项目展示差量同步。
- 迁移：0293新增 revoked_at 及活动任务部分唯一索引，存在撤销历史时拒绝无损不可能的downgrade；0294仅替换触发器加入事务局部、精确人员/维度例外，不解除LOCKED。真实隔离PG upgrade/downgrade/upgrade、锁与触发器并发验证 **blocked**：本机5432不可连接、Docker daemon不可用、配置DB host不可解析。曾被拒绝的非隔离数据库动作未重试或绕过；没有操作生产。
- 未执行：真实登录浏览器独立PNG、UI→API→SQL→刷新回读、真实飞书送达、生产部署。Vitest/API替身不当作真实数据库/浏览器证据；T02–T06保持未勾选。
- 历史来源不能证明原生成资格或aggregate一致时返回 CALIBRATION_HISTORY_CONFLICT，不猜测、不全项目重算。并行项目复制/共享UI改动原样保留；未commit/push。

后续应在获准的隔离数据库完成两项迁移升降级/触发器/并发回滚，以及真实应用验收，再按任务逐项勾选；不以本轮本地回归替代发布与生产验收。
