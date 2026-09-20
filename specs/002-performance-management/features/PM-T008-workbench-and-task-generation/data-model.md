# PM-T008 数据模型（草案）

> 本文件是 PM-T008 的新增数据契约草案。基线 `data-model.md` 已定义 `performance_cycle_people` 与 `performance_node_tasks` 概念对象；实施前必须以实际模型/迁移核对，不得再创建语义重复的任务表。

## 1. 项目成员快照

建议新增 `performance_project_member_snapshots`，或在现有项目快照模型中增加等价对象：

- `id`、`project_id`、`cycle_id`、`source_filter_snapshot`、`snapshot_version`、`created_at`
- 成员明细保存被评估人身份、部门和汇报关系的快照值，以及来源筛选条件
- `project_id + snapshot_version` 唯一
- 项目启动后只读；实时花名册或后续筛选规则不得覆盖
- 明确是否以已锁定的 `performance_cycle_people` 为候选输入，见 PM-T008 Q5

## 2. 任务记录

优先扩展基线 `performance_node_tasks`，不要并行创建 `performance_tasks`：

- 现有概念字段：`id`、`cycle_id`、`cycle_node_id`、`target_person_id`、`handler_person_id`、`target_type`、`target_id`、`status`、`submitted_at`、`latest_submit_at`、`allow_late_submit`、`late_submitted`、时间戳
- PM-T008 需要补充或映射：`project_id`、`project_member_snapshot_id`、`node_snapshot_id`、`task_kind`、`available_at`、`due_at`、`completed_at`、`action_url`、`created_by_start_id`
- 任务状态与基线 `pending/submitted/expired/late_submitted/closed` 对齐；工作台的“待完成/已完成”是查询分组，不直接新增不兼容的状态枚举
- 必须定义任务业务完成与表单提交的映射，结果查看、复议处理不能凭 UI 点击直接置为完成

建议唯一性：由 `project_id + project_member_snapshot_id + node_snapshot_id + handler_person_id + task_kind` 组成，最终以并发模型和多执行人规则冻结。

## 3. 节点快照与时间

项目时间当前存于 `performance_projects.settings.flow_settings.node_times[node_id]`，模板节点当前存于 workflow JSON。启动时保存用于任务身份、模板规则和历史追溯的节点快照，至少包含 `node_id`、`node_type`、`name`、执行人规则及启动时项目时间；节点当前状态、任务可操作时间与截止时间以 `performance_projects.settings.flow_settings.node_times[node_id]` 为真源，旧项目缺失当前配置时才回退快照/任务时间。结果查看和结果复议可以存在节点快照，但结果查看不生成 `performance_node_tasks`；结果查看资格在结果发布后由结果卡片/结果查询能力提供。二者均不进入工作台顶部时间轴投影。

## 4. 事件驱动任务

360°邀请、确认和后续评价任务，以及复议处理任务，均不得按项目启动时的人员×节点笛卡尔积一次性生成。360°由被评估人在邀请节点有效时间窗口内发起邀请，由流程节点维护的确认人员在确认节点有效时间窗口内处理，确认成功后依据事件结果追加后续任务。复议则在结果发布后仅由被评估人提交复议申请时触发处理任务追加；未提交复议时不产生处理任务。复议处理人按模板优先、项目兜底次优解析，一期假设至少存在一条有效处理人配置，不为两层均无法解析设计额外任务异常状态。每次事件和任务追加必须校验节点时间、处理人身份、对象范围和幂等键，并记录审计。

## 5. 事务、迁移与兼容

项目状态、成员快照、节点快照引用和启动时应生成的任务写入必须在同一事务中完成；失败不留下半启动数据。360°事件任务在独立事件事务中追加，必须幂等。启动接口已有 `POST /projects/{id}/start`，现实现仅改状态，需兼容升级而非另建旁路。历史已启动但无任务的项目不得静默补造，补任务必须有独立迁移/运维方案、权限和审计。迁移只创建新 revision，升级、降级、空库和已有数据验证由 T01 负责。
