# PM-T010 API 契约

## 1. 项目管理概览

`GET /api/v1/performance/project-management/overview?cycle_id={cycle_id}`

- `cycle_id` 可选；缺省时取本人涉及的最新周期。

响应：

```json
{
  "cycles": [
    {
      "cycle_id": 1,
      "cycle_name": "2026年全年绩效",
      "cycle_start_at": "2026-01-01T00:00:00Z",
      "cycle_end_at": "2026-12-31T00:00:00Z"
    }
  ],
  "active_cycle": { "cycle_id": 1, "cycle_name": "2026年全年绩效", "cycle_start_at": "2026-01-01T00:00:00Z", "cycle_end_at": "2026-12-31T00:00:00Z" },
  "projects": [
    {
      "project_id": 3,
      "project_name": "产品中心绩效项目",
      "project_ref": "project:abc",
      "status": "STARTED"
    }
  ],
  "hrbp_scope": [],
  "category": { "key": "admin", "label": "项目管理员" }
}
```

约束：

- `cycles` 仅含本人涉及周期：周期内存在 `status=STARTED` 项目且（本人在 `administrators` 中 **或** 命中 HRBP 匹配）；HRBP 匹配本期恒为假（`hrbp_scope` 恒为空数组），字段为契约预留，后续在不改结构的前提下补齐；
- `projects` 仅含当前周期下 `status=STARTED` 且本人涉及的项目；
- 本人匹配：`resolve_trusted_performance_actor` 解析出的 `display_name` 与 `administrators` 字符串数组包含匹配（现状按姓名存储，重名风险已记录）；
- 绩效周期管理员（`_is_admin_preview`）可预览全部周期与项目，不受本人涉及限制；
- 无涉及数据时返回 `cycles: []`、`active_cycle: null`、`projects: []`，不报错；
- `category` 为固定分组信息，前端不得硬编码第二处。
- `completion_nodes` 返回当前周期所有可见已启动项目聚合后的八个总览环节；无节点配置的环节返回 `status=unavailable`，不产生催办操作。

### 1.1 总览完成率数据

`completion_nodes` 元素结构：

```json
{
  "key": "work-summary",
  "title": "填写工作总结",
  "status": "active",
  "completed_count": 101,
  "total_count": 406,
  "completion_rate": 24.88,
  "deadline_at": "2026-07-10T15:59:00Z"
}
```

- 数据范围与概览项目列表一致：只聚合当前用户可见且可管理的 `STARTED` 项目，不读取草稿项目，不新增人员。
- 成员基线取每个项目最新 `PerformanceProjectMemberSnapshot`；有任务的节点以任务数为分母，以 `submitted_at` 或 `status=completed` 判定完成；没有任务的系统节点以成员快照人数为分母。
- `result_view` 以项目 `settings.result_published` 作为结果开通完成状态；其余系统节点按已生成任务/成员快照计算。
- `result-reconsideration` 例外：分母只取该复议节点已有的真实复议申请/处理任务数，不回退使用项目成员快照人数；当前没有复议申请记录时返回 `completed_count=0`、`total_count=0`、`completion_rate=0`。
- 截止时间取聚合项目中最早的节点截止时间，来源为项目节点快照的 `end_at` 或 `appeal_deadline`，不使用周期结束时间兜底。
- 所有参与节点的开始时间均晚于当前时间时返回 `status=not_started`，前端百分比和完成情况均显示“未开始”，且不显示“去催办/去开通”；已配置但截止且未完成返回 `overdue`。
- `completion_rate` 为后端计算的百分比，保留两位小数；未开始时为 `null`，无任务但已开放时为 `0`。

## 2. 错误

- `403`：无绩效应用访问权限（由现有 access context 中间层处理）；
- `404 CYCLE_NOT_FOUND`：显式传入的 `cycle_id` 不存在。

## 3. 前端绑定

- 路由 `/performance/project-management`，复用 `PerformanceLayout`；
- 顶部下拉 command = `cycle_id`；子菜单「周期概览」固定在首位，其后为 `projects` 按名称排序；
- 选中项目菜单项携带 `project_id` query，选中周期写入 `cycle_id` query。

## 4. 统计报表前端 provider 契约（PM-T010-T06，mock 预览）

本期不增加 HTTP endpoint，也不修改现有 projectManagementApi。以下仅为前端组件的数据适配边界，不是已确认的后端 API 设计。

- `ProjectReportProvider(query: { cycleId: number, dimension?: 'department' | 'team' | 'sequence' }): Promise<ProjectStatisticsReport>`，类型与默认模拟实现位于 `frontend/src/components/performance/projectStatisticsReport.ts`。
- `dimension` 缺省为 `department`；`team` 使用上级人员层级，`sequence` 使用序列层级。
- 返回 `source: 'mock' | 'api'`、`dimension`、`rowLabel`、`showSummary`、`totalParticipants`、`ratings: {key,label,color?}[]`、`distribution: Record<ratingKey,number>`、`departments: {id,name,counts,heatLevels?,children?}[]`；这里的 `departments` 是历史兼容字段，按 `dimension` 表示当前矩阵行集合。
- `ratings[].color` 必须透传对应绩效模板/周期快照的等级配置色，不按星级名称或列序号补色。前端共用 `performanceLevelBackground`：已知色板 `value` 转 `trigger` 浅底色，未命中的自定义色原样保留，缺失为透明。当前 mock 只提供示例模板配置格式的颜色，不请求真实模板接口。
- `heatLevels` 为可选 `Record<ratingKey, 1 | 2 | 3>`，由适配器显式提供展示等级；与评级标签色无关。采集只确认色阶样式，未确认百分比阈值，前端不推导阈值；缺失时显示中性色数值，人数为0仍显示--。
- `ratings` 控制列与横轴顺序；`distribution` 为当前范围已评级人数分布，`totalParticipants` 为范围总人数。部门 mock 为124人、120人已评估；团队和序列 mock 仅用于结构与交互预览，均使用脱敏示例行名。
- `rowLabel` 控制第一列标题：部门为「部门」、团队为「上级」、序列为「序列（筛选结果含子序列）」；`showSummary` 控制是否展示首行「汇总」。children 是父行内部拆分，不能再次累计进总人数。百分比以当前行已评级人数为分母，零分母显示0.0%，零人数矩阵单元格显示--。
- `ProjectStatisticsReportPanel` 接收可选 `provider` prop；默认使用 mock。后续接入时由调用者注入真实 provider/适配器并返回 source='api'，真实查询失败展示错误，不静默回退模拟数据。
- 组件在周期/provider变化后清空旧数据并重载，过期请求结果不覆盖新请求；加载失败可重试。provider 的调用参数可直接用于未来周期快照查询，但后端权限/快照/数据口径仍须单独确认。

## 6. 级别统计真实接入（PM-T010-T08）

`GET /api/v1/performance/project-management/statistics?cycle_id={id}&dimension=level|tenure`

- `dimension=tenure` 使用实时花名册 `hire_date` 与当前日期计算已完成自然月数；边界为 `>=3且<6`、`>=6且<12`、`>=12且<36`、`>=36`。
- 司龄行固定按“入职未满3个月、3-6个月（不含6个月）、6个月-1年（不含1年）、1-3年内（不含3年）、3年以上、入职日期缺失”顺序；入职日期缺失单独归档，不与未满3个月混合。四档及两类补充行均保留，即使人数为零；汇总行固定首行，无 children。
- 司龄与级别共享授权、快照、最终评级、评级规则代号/颜色、冲突拒绝和错误语义；司龄首列 `rowLabel=司龄`，来源 `source=api`。

- 仅统计当前周期 STARTED 项目中 overview 可见且 `_can_manage_project` 授权的交集；可见周期无任何可读项目返回 403，不伪装为空。不存在或不可见周期返回 404 CYCLE_NOT_FOUND。无项目的周期管理员可得到空结果。
- 每项目取最新成员快照，以工号为人员身份；任务必须属于所选成员快照。岗位职级只读 `emp_realtime_roster.position_level`，与 matrix 同源，缺失/空白显示 `--`；不增删快照人员、不回写历史、不迁移。
- 最终评级沿用 matrix 的已提交答案解析和节点顺序/任务 ID 优先规则；任务 completed 不代表有评级。各行总人数及占比分母为已评级人数，未评级人员保留零值职级行；总参与人数另计。
- 周期内跨项目同工号去重尚无最终评级合成规则：检测到重复即返回 409 CYCLE_MEMBER_OVERLAP_UNRESOLVED，不累加为人数、不任取项目评级。仅检查已授权项目。
- 可合并评级体系要求最终评级字段的有序选项（id、label、color、code）完全一致；不一致返回 409 RATING_SCALE_CONFLICT。单独的标签或裸 ID 相等不足以合并；空选项不贡献列。不在失败时丢弃冲突项目或回退 mock。
- 表头显示评估规则的等级代号 `config.levels[].code`，不显示 `name`（例如“1星”而不是“不合格”）；`ratings[].key` 保持原选项 ID、`color` 原样透传规则配置，前端沿用共享颜色转换。仅有 label 的历史选项保持 label→id 回退，不推测等级、不改写历史快照；评价表单原 label 与旧答案解析保持不变。
- 返回 `source=api`、`dimension=level`、`rowLabel=岗位职级`、`showSummary=true`、`totalParticipants`、`ratings`、`distribution`、`departments`（兼容行集合字段，元素仅 id/name/counts，不返回 children 或人员详情）。空结果返回空数组/字典和零参与人数。评级顺序/颜色来自模板；不生成未经确认的热力阈值。
- 前端仅级别章节请求此接口；来源说明限定该章节。其他模拟章节继续独立标记。周期/provider 变化使所有维度旧请求失效；错误显示明确提示并允许重试。
- 本接口表示可读项目的最终评级分布，不宣称已完成跨项目绩效合成，也不声称实时岗位职级是历史快照。

## 5. 矩阵分析聚合（PM-T010-T07）

`GET /api/v1/performance/projects/{project_id}/matrix`

响应结构：

```json
{
  "source": "template_final_result",
  "dimension": "rating",
  "display_modes": ["name", "count"],
  "total": 406,
  "completed_count": 403,
  "pending_count": 3,
  "ratings": [{"key": "five", "label": "5星", "color": "#3370ff"}],
  "pending_rows": [{
    "level": "J3",
    "total": 1,
    "cells": {"pending": {"count": 1, "people": [{"employee_no": "E001", "display_name": "员工", "employment_status": "在职"}]}}
  }],
  "completed_rows": [{
    "level": "J6",
    "total": 2,
    "cells": {"five": {"count": 2, "people": []}}
  }]
}
```

口径与权限：

- 仅允许项目管理员、项目范围管理员或周期管理员访问，沿用 `_can_manage_project`；无权返回 `403`。
- 人员基线取项目最新 `PerformanceProjectMemberSnapshot`，不从实时花名册新增或删除项目成员。
- 仅扫描项目节点快照中 `node_type=evaluation` 且模板节点 `include_final_result=true` 的节点。
- 评级字段取该最终节点模板内容中 `type=rating` 的字段；只有任务已提交且答案中存在可解析的评级选项时，人员才进入已完成评估。
- `task.status=completed`、`submitted_at` 单独存在但缺少评级答案，均不能判定为已完成评估。
- 无最终评级的人员进入 `pending_rows`，按职级分组；缺少职级显示为 `--`。有最终评级的人员进入 `completed_rows`，按职级和评级交叉分组。
- `completed_rows` 的行轴必须覆盖项目成员快照中所有参与人员涉及的职级，不因该职级当前没有已完成评估而省略；无已完成人员的评级单元格返回 `count=0`、`people=[]`，前端显示 `--`。
- `ratings` 的顺序和颜色来自最终评级字段选项，不在前端硬编码评级枚举；`display_modes` 仅控制姓名/数量展示，不改变聚合口径。
- 当前项目成员快照未独立保存职级，接口沿用成员列表的数据源从花名册读取 `position_level`；该历史属性快照缺口不在本任务新增迁移范围。
- 若一个人员命中多个最终节点/任务，使用节点顺序优先、提交任务 ID 次优的最新候选，避免同一人员重复计入。

错误：

- `404`：项目不存在；
- `403`：无权查看当前项目矩阵；
## 6. 去催办任务模板（PM-T010-T09）

### 6.1 待催办人员读取

前端默认 provider 复用：

`GET /api/v1/performance/workbench/tasks/{node_id}/people?project_id={project_id}&state=pending&keyword={keyword}`

该历史接口返回人员任务数组；前端 adapter 统一转换为 `ReminderListResult`，分页、列定义和 capabilities 由业务 provider 管理。后续其他总览去催办入口必须只替换 `ReminderContext` 和 provider，不复制列表模板。

### 6.2 批量催办

`POST /api/v1/performance/projects/{project_id}/reminder-tasks/remind`

请求：

```json
{
  "node_id": "evaluation-1",
  "task_ids": [101, 102]
}
```

响应：

```json
{
  "accepted_task_ids": [101],
  "skipped_task_ids": [102],
  "delivery_status": "recorded"
}
```

约束：

- `project_id` 必须存在且为 `STARTED`；
- 服务端重新校验项目、节点、处理人权限；管理员预览也不能跨项目或跨节点选择任务；
- 只接受去重后的 `pending` 且已到开放时间的任务；已完成、未开放、节点不匹配、项目不匹配的任务进入 `skipped_task_ids`；
- 请求成功仅表示催办意图已记录，当前不承诺已发送飞书/邮件通知；
- 每条 accepted 任务写入 `PERFORMANCE_TASK_REMINDER_REQUESTED` 审计事件，包含周期、任务、节点和操作人；
- 授权他人处理、转交他人处理和导出暂未提供真实写入接口，前端不伪造成功结果。

错误：

- `404 PROJECT_NOT_FOUND`：项目不存在或未启动；
- `403 PROJECT_REMINDER_FORBIDDEN`：当前用户无权处理项目任务；
- `422`：请求缺少 node_id 或 task_ids 为空/超出批量上限。
