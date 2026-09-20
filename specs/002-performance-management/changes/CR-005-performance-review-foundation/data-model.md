# CR-005 公共模型与状态设计

## 1. 现有持久化边界

继续复用 `performance_node_tasks`：

```text
id
project_id
node_snapshot_id
target_employee_no
handler_ref
task_kind
status
available_at
due_at
answers JSONB
answer_version
submitted_at
completed_at
```

本变更不新增数据库表、列或迁移。周期、节点、人员、模板和选项快照仍是真源；公共化不得读取当前花名册或当前模板覆盖已启动项目。

## 2. 前端公共 DTO

```text
PerformanceTemplateOption
  id
  label
  color?
  placeholder?
  description?

PerformanceTemplateField
  id
  type
  label
  required?
  placeholder?
  options?
  display_mode?

PerformanceTemplateSection
  id
  name
  description?
  allow_multiple?
  fields[]

PerformanceTaskPresentation
  task_id
  task_kind
  entry_mode
  node_id
  node_type
  status
  editable
  submit_allowed
  submitted_at
  deadline_at
  form_schema
  answers
```

`SelfSummary*` 是当前 API 的兼容命名；公共 renderer 内部只依赖 `PerformanceTemplate*` 结构。

## 3. 答案值

| field type | 单值 | allow_multiple=true |
|---|---|---|
| rich_text | sanitized HTML string | string[]，按实例索引 |
| rating | option ID string | string[]，按实例索引 |
| tag_with_followup | `{tags: string[], note: sanitized HTML}` | object[]，按实例索引 |

验证规则：

- section 的实例数为其 fields 最大答案数组长度，最少为 1。
- add/remove 同时作用于 section 中所有字段。
- readonly 与 edit 使用同一个 value accessor，不可各自读取 `answers[field.id]`。
- 新 field type 若未注册 adapter，渲染/提交必须受控失败，不得以字符串猜测回退。

## 4. 状态迁移

```text
pending / overdue / not_started
  └─ template_task entry
      ├─ editable + submit_allowed → edit
      ├─ submitted + editable → completed_editable
      └─ submitted + !editable → completed_readonly
```

服务端仍为 `editable` 和 `submit_allowed` 的最终权威。前端完成态仅根据这两个返回值选择是否显示编辑入口。

## 5. 关系与所有权

```text
PerformanceReviewContent
  owns: 白卡、外边界、heading、time visibility、loading/error/empty、状态容器
PerformanceReviewCompletionNotice
  owns: 完成提示、编辑按钮、deadline message
PerformanceTemplateRenderer
  owns: section iteration、field registry、edit/readonly mode dispatch
PerformanceTemplateSection
  owns: section heading、description、repeat instances
PerformanceFieldRenderer
  owns: field label、field value visual and interaction
performanceTemplateAnswers
  owns: values、instance count、update/add/remove/error key
Task entry registry
  owns: entry_mode + task_kind → route/event
Page adapter
  owns: task API call、save/submit side effect、role-specific context
```
