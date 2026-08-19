# PM-T004 绩效模板创建：流程设置

## 1. 状态与范围

- 状态：需求已确认，待实现
- 入口：`/performance/settings/templates/create?step=workflow`
- 前置页面：模板基本信息已创建或保存为草稿
- 本任务只实现“流程设置”页面；页面必须保留“上一步”和“下一步”按钮。
- 目标角色：绩效管理员。拥有 `performance.admin` 的用户默认允许进入；后端仍必须校验 `template.manage` 与模板作用域。
- 视觉依据：附件 `initial.png`、`state-1.png` 至 `state-47.png` 与 `initial.html`/`capture.json`。
- 验收基线：`1920x959`、浏览器缩放 100%、页面最小内容宽度 1300px。

## 2. 业务目标

绩效管理员可以在创建模板时配置评估流程，并把流程配置保存到真实后端。已被周期使用的模板必须明确展示影响范围：

> 已有 1 个周期的项目使用此模板，新修改将在保存后同步至用户，仅支持编辑所有的参考、提示内容，但无法修改评估流程、数据写入相关的设置。

上述数量由接口返回，禁止前端写死。

## 3. 流程节点

画布固定包含“项目启动”和“项目结束”两个系统节点；中间为可配置业务节点。节点显示名称以附件为准，稳定类型如下：

| node_type | 默认名称 | 可新增 | 删除 | 说明 |
|---|---|---:|---:|---|
| `project_start` | 项目启动 | 否 | 否 | 系统起点 |
| `evaluation` | 评估型环节 | 是 | 是 | 通用评估环节，可配置评估类型 |
| `result_view` | 绩效结果查看环节 | 是 | 是 | 只读结果查看 |
| `result_reconsideration` | 结果复议处理 | 是（仅结果查看后） | 是 | 仅可紧接绩效结果查看环节添加，最多一个 |
| `work_summary` | 工作总结环节 | 是 | 是 | 工作总结填写 |
| `reviewer_360_invite` | 360°邀请环节 | 是 | 是 | 发起 360° 邀请 |
| `reviewer_360_confirm` | 360°确认环节 | 是 | 是 | 被邀请人确认 |
| `calibration` | 校准环节 | 是 | 是 | 校准最终结果 |
| `result_communication` | 结果沟通环节 | 是 | 是 | 结果沟通反馈 |
| `project_end` | 项目结束 | 否 | 否 | 系统终点 |

`workflow-design.md` 中旧节点类型与本表冲突时，以本表及附件为准；旧类型只允许在兼容读取时映射，不得在新建请求中产生。

## 4. 页面结构与像素基线

```text
固定 Header
├── 返回
├── 编辑绩效模板
├── 基本信息 > 流程设置 > 内容设置 > 模板预览
├── 上一步
└── 下一步
主体
├── 顶部影响提示（仅已有周期时）
├── 左上“评估流程模板”入口
├── 中央纵向流程画布：项目启动 -> 节点 -> 项目结束
└── 右侧配置面板：未选中为空状态，选中后显示节点表单
```

- Header 高度 56px，白底，底部 1px 分隔线。
- 画布区域背景 `#F5F6F7`，节点卡片白底、6px 圆角、1px 边框。
- 选中节点边框 `#3370FF`，悬浮/选中时显示删除图标和可访问 tooltip。
- 连线为垂直 1px `#BBBFC4`，带向下箭头；节点间加号约 24px 圆形按钮。
- 流程节点宽约 196-260px、高约 100px，系统起止节点约 150x60px 胶囊形。
- 主画布从 x=0 延伸到约 x=1440；流程中心线约 x=720。右侧面板约 480px，白底，左侧 1px 分隔线；面板内容可独立滚动。
- 字体沿用 HR Portal 设计系统，优先系统中文字体，不直接依赖附件生产资源或 watermark。

## 5. 节点配置字段

所有节点均返回 `editable_fields`，前端不得仅依据节点类型猜测权限。字段：

- 环节名称：必填，长度 1-100；编辑后即时更新画布标题。
- 环节描述：可选，最多 2,000 字。
- 环节执行人：按节点类型约束。评估型/结果沟通支持“实线上级”并多选直属上级、隔 1 级上级、隔 2 级上级、隔 3 级上级及以上；360°确认复用结果沟通的“实线上级/虚线上级”执行人字段，但选择实线上级时仅允许直属上级、隔 1 级上级、隔 2 级上级；工作总结、360°邀请、绩效结果查看默认为被评估人；校准环节复用固定执行人字段，显示“在项目配置时指定”，模板 API 固定保存 `executor_types=['PROJECT_CONFIGURED']`，实际校准人在后续项目配置 API 中指定。结果复议处理使用共享多角色执行人配置，默认选中 HRBP，至少保留一个角色；指定人员保存 `employee_no` 并展示 `display_name`，普通组织关系由周期花名册及周期快照运行时解析。
- 360°邀请前置任务设置：当 `reviewer_360_invite` 前面存在紧邻业务节点时，展示默认关闭的“设置执行人需完成上一环节任务”，保存为 `require_previous_node_completion`；若该节点是第一个业务节点则不展示并规范化为 `false`。本任务只持久化模板配置，运行时任务进入阻断由后续节点任务能力实现。
- 评估类型：附件为“单人评估/多人评估”；仅评估型环节展示，接口枚举为 `SINGLE`、`MULTI`。
- 最终结果：开关；控制该环节是否写入最终结果。
- 被评估人确认：文案“需要被评估人确认绩效结果”，用于绩效结果查看环节。
- 校准原因：仅用于校准环节。`calibration_reason_enabled` 控制“填写调整原因”开关，新建校准节点默认 `true`；开启后显示说明“在校准时调整评分或评级结果，需填写原因”和公共“必填”复选框，`calibration_reason_required` 默认 `false`。关闭开关时隐藏复选框并将 `calibration_reason_required` 规范化为 `false`。
- 发起复议提示：仅用于结果复议处理环节。`appeal_prompt_content` 保存“提示文案”，默认“如果你不认可本次绩效结果，请详细说明复议原因并提供事实依据”，必填、最多 1,500 字；`appeal_reason_instruction` 保存“填写说明”，默认“请输入复议理由”，必填、最多 1,000 字。模板已被周期使用后仍允许编辑这两项提示内容。
- 参考内容、提示内容：流程已被周期使用时仍可编辑；本页面只展示入口/摘要，具体内容由内容设置步骤维护。

## 6. 交互与状态

### 6.1 页面状态

- 加载：Header 保留，画布和右侧面板显示骨架屏。
- 空流程：显示项目启动、项目结束和中间加号，不允许保存不完整流程。
- 未选中：右侧显示“没有选中任何环节”。
- 选中：节点蓝色边框，右侧加载配置。
- 保存中：禁用上一步/下一步和节点增删，显示 loading。
- 保存成功：提示“保存成功”，下一步进入内容设置。
- 保存失败：保留用户输入，展示接口错误和重试入口。
- 无权限：路由守卫拒绝进入；接口返回 403 时展示无权限页。

### 6.2 已有周期只读规则

当 `usage_summary.cycle_count > 0`：

- 页面顶部显示影响提示和周期数量。
- 项目启动、项目结束和所有流程节点的增删、排序、名称、执行人、评估类型、最终结果、被评估人确认、校准原因、数据写入设置全部禁用。
- 参考内容、提示内容保持可编辑，并明确标识“保存后同步至用户”。
- 后端仍需拒绝被锁定字段的篡改，返回 `TEMPLATE_WORKFLOW_LOCKED`。

### 6.3 按钮

- 上一步：保存当前草稿后返回基本信息；保存失败时不跳转。
- 下一步：先校验并保存流程，成功后进入内容设置；不在本任务实现内容设置业务。
- 返回：退出创建流程；有未保存变更时显示二次确认。
- 节点加号：打开环节类型选择菜单，用户选择附件支持的业务节点后插入并自动选中；不得默认直接插入评估型环节。
- “绩效结果查看环节”后的加号只显示“结果复议处理”（`result_reconsideration`）；该类型只能添加一次并必须紧接结果查看节点。添加后，结果查看节点和结果复议处理节点后的连接器仅保留连线，不再显示可操作加号；删除后恢复结果查看节点后的添加入口。其他位置不得显示或插入该类型。
- 删除：二次确认；系统节点不可删除。

## 7. 前后端契约

### 7.1 获取模板流程

`GET /api/v1/performance/templates/{template_id}/workflow`

响应：

```json
{
  "template_id": "tpl_123",
  "template_name": "2026 半年度绩效",
  "status": "DRAFT",
  "usage_summary": {"cycle_count": 1, "project_count": 3},
  "editable_scope": {
    "workflow": false,
    "data_write_settings": false,
    "reference_and_prompt_content": true
  },
  "nodes": [{
    "node_id": "node_1",
    "node_type": "evaluation",
    "name": "上级评估",
    "description": "",
    "order": 1,
    "executor_options": [{"type": "DIRECT_MANAGER", "label": "直属上级", "selected": true}],
    "evaluation_type": "SINGLE",
    "include_final_result": true,
    "subject_confirm_required": false,
    "calibration_reason_enabled": true,
    "calibration_reason_required": false,
    "editable_fields": ["description", "reference_content", "prompt_content"]
  }]
}
```

### 7.2 保存模板流程

`PATCH /api/v1/performance/templates/{template_id}/workflow`

请求体：`{ "nodes": [{ "node_id": null, "node_type": "calibration", "name": "校准环节", "description": "", "order": 2, "executor_types": ["PROJECT_CONFIGURED"], "evaluation_type": null, "include_final_result": false, "require_previous_node_completion": false, "subject_confirm_required": false, "calibration_reason_enabled": true, "calibration_reason_required": false }] }`

约束：事务内校验节点顺序、系统节点、字段权限和重复提交；不引入版本号。响应返回完整规范化节点和 `usage_summary`。

稳定错误码：`PERFORMANCE_PERMISSION_DENIED`、`TEMPLATE_NOT_FOUND`、`TEMPLATE_WORKFLOW_INVALID`、`TEMPLATE_WORKFLOW_LOCKED`、`TEMPLATE_CONCURRENT_UPDATE`、`TEMPLATE_SAVE_FAILED`。

## 8. 权限、审计与安全

- 路由入口要求 `performance.admin`；接口要求 `template.manage` 或等价系统管理员权限。
- 每次保存记录 `performance_audit_logs`：操作者、模板、变更前后节点 JSON、原因、时间。
- 不返回人员敏感字段；执行人选项只返回显示名、稳定引用和身份类型。
- 已启动周期的数据写入设置必须由后端锁定，前端禁用不作为安全边界。

## 9. 测试与验收

- 单元测试：节点增删、选中、编辑同步、校验、只读字段裁剪、按钮跳转。
- API 测试：成功保存、字段锁定、无权限、模板不存在、非法节点顺序、并发冲突、重复提交。
- E2E：按附件初始态和 state-1 至 state-47 覆盖核心状态；截图基线固定 1920x959。
- 验收必须追踪 `UI -> PATCH payload -> service/database -> GET reopen`，确认保存后重新打开与画布一致。

## 10. 非目标与风险

- 本任务不实现内容设置、模板预览、评分计算、周期启动和项目配置。
- 本任务不实现周期流程快照、节点任务生成/状态流转或 `require_previous_node_completion` 的运行时进入阻断。
- 不实现模板版本号或历史回滚。
- 附件无法证明未捕获异常态；异常提示文案以本规格和后端错误码为准。
- 现有 `workflow-design.md` 的旧节点名需要在后续文档中标注兼容映射，避免新旧 DTO 混用。

## 11. 开放事项

- `指定人员`执行人的搜索接口和最大选择数需在后端任务中冻结。
- 参考/提示内容的具体字段归属内容设置任务，本页只消费 `editable_scope`。
- `TEMPLATE_CONCURRENT_UPDATE` 在无版本号前提下需要后端定义幂等键或请求去重策略。
