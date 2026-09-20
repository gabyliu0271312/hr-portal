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

## 2. 错误

- `403`：无绩效应用访问权限（由现有 access context 中间层处理）；
- `404 CYCLE_NOT_FOUND`：显式传入的 `cycle_id` 不存在。

## 3. 前端绑定

- 路由 `/performance/project-management`，复用 `PerformanceLayout`；
- 顶部下拉 command = `cycle_id`；子菜单「周期概览」固定在首位，其后为 `projects` 按名称排序；
- 选中项目菜单项携带 `project_id` query，选中周期写入 `cycle_id` query。

## 4. 统计报表前端 provider 契约（PM-T010-T06，mock 预览）

本期不增加 HTTP endpoint，也不修改现有 projectManagementApi。以下仅为前端组件的数据适配边界，不是已确认的后端 API 设计。

- `ProjectReportProvider(query: { cycleId: number }): Promise<ProjectStatisticsReport>`，类型与默认模拟实现位于 `frontend/src/components/performance/projectStatisticsReport.ts`。
- 返回 `source: 'mock' | 'api'`、`totalParticipants`、`ratings: {key,label,color?}[]`、`distribution: Record<ratingKey,number>`、`departments: {id,name,counts,heatLevels?,children?}[]`；顶层可选 `heatLevels` 对应汇总行。
- `ratings[].color` 必须透传对应绩效模板/周期快照的等级配置色，不按星级名称或列序号补色。前端共用 `performanceLevelBackground`：已知色板 `value` 转 `trigger` 浅底色，未命中的自定义色原样保留，缺失为透明。当前 mock 只提供示例模板配置格式的颜色，不请求真实模板接口。
- `heatLevels` 为可选 `Record<ratingKey, 1 | 2 | 3>`，由适配器显式提供展示等级；与评级标签色无关。采集只确认色阶样式，未确认百分比阈值，前端不推导阈值；缺失时显示中性色数值，人数为0仍显示--。
- `ratings` 控制列与横轴顺序；distribution 为当前范围已评级人数分布，totalParticipants 为范围总人数。模拟数据为124人、120人已评估，示例部门名称均带“示例”。
- 部门根行合计与 distribution 一致；children 是父行内部拆分，不能再次累计进总人数。百分比以当前行已评级人数为分母，零分母显示0.0%，零人数矩阵单元格显示--。
- `ProjectStatisticsReportPanel` 接收可选 `provider` prop；默认使用 mock。后续接入时由调用者注入真实 provider/适配器并返回 source='api'，真实查询失败展示错误，不静默回退模拟数据。
- 组件在周期/provider变化后清空旧数据并重载，过期请求结果不覆盖新请求；加载失败可重试。provider 的调用参数可直接用于未来周期快照查询，但后端权限/快照/数据口径仍须单独确认。

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
- `200` 且 `ratings=[]`：项目没有配置可解析的最终评级字段，人员全部保持待完成评估。
