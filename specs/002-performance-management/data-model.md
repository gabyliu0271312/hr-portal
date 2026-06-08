# 绩效管理数据模型建议

本文档仅描述概念模型，后续需要结合现有数据库命名规范和 Alembic 迁移再细化。

## 1. 人员与身份

### performance_people

绩效人员主档，来源于员工实时花名册。

建议字段：

```text
id
employee_no
display_name
department_id
department_name
position_name
manager_employee_no
mobile
email
employment_status
source_roster_id
created_at
updated_at
```

### performance_identity_links

绩效人员与外部账号的映射。

建议字段：

```text
id
person_id
hr_portal_user_id
feishu_user_id
mobile
email
employee_no
link_source
is_primary
created_at
updated_at
```

## 2. 权限

### performance_roles

绩效系统内部角色。

```text
id
code
name
description
is_active
created_at
updated_at
```

### performance_permissions

绩效系统内部权限点。

```text
id
code
name
description
category
created_at
updated_at
```

### performance_role_permissions

角色和权限的关联。

```text
role_id
permission_id
```

### performance_person_roles

绩效人员与绩效角色的关联。

```text
person_id
role_id
scope_type
scope_id
created_at
updated_at
```

### performance_dynamic_assignments

周期启动后自动计算或配置出的动态身份。

```text
id
cycle_id
person_id
assignment_type
target_type
target_id
scope_type
scope_id
source_rule_id
created_at
updated_at
```

示例 assignment_type：

```text
self
direct_manager
project_owner
org_calibrator
company_calibrator
appeal_handler
```

## 3. 周期与模板

### performance_cycles

绩效周期。

```text
id
name
status
template_id
start_date
end_date
appeal_deadline
created_by
created_at
updated_at
```

### performance_workflow_templates

流程模板。

```text
id
name
description
is_active
created_by
created_at
updated_at
```

### performance_workflow_template_nodes

流程模板节点。

```text
id
template_id
node_code
node_name
node_type
display_order
handler_rule
form_template_id
weight
counts_to_final
allow_score_adjust
allow_grade_adjust
require_adjust_reason
visibility_rule
distribution_rule_id
created_at
updated_at
```

### performance_cycle_nodes

周期节点快照。

```text
id
cycle_id
template_node_id
node_code
node_name
node_type
display_order
start_at
end_at
latest_submit_at
handler_rule_snapshot
form_template_snapshot
weight_snapshot
counts_to_final
allow_score_adjust
allow_grade_adjust
require_adjust_reason
visibility_rule_snapshot
distribution_rule_snapshot
created_at
updated_at
```

## 4. 周期人员与任务

### performance_cycle_people

某周期参与人员快照。

```text
id
cycle_id
person_id
employee_no_snapshot
name_snapshot
department_snapshot
manager_employee_no_snapshot
status
created_at
updated_at
```

### performance_node_tasks

节点任务实例。

```text
id
cycle_id
cycle_node_id
target_person_id
handler_person_id
target_type
target_id
status
submitted_at
latest_submit_at
allow_late_submit
late_submitted
created_at
updated_at
```

典型 status：

```text
pending
submitted
expired
late_submitted
closed
```

## 5. 评价数据

### performance_work_summaries

工作内容总结。

```text
id
cycle_id
person_id
task_id
content
status
submitted_at
created_at
updated_at
```

### performance_self_reviews

员工自评。

```text
id
cycle_id
person_id
task_id
score
grade
content
form_data
status
submitted_at
created_at
updated_at
```

### performance_manager_reviews

上级评价。

```text
id
cycle_id
person_id
manager_person_id
task_id
score
grade
content
form_data
status
submitted_at
created_at
updated_at
```

### performance_project_reviews

项目评价。

```text
id
cycle_id
project_id
person_id
reviewer_person_id
task_id
score
grade
content
weight
form_data
status
submitted_at
created_at
updated_at
```

## 6. 项目管理

### performance_projects

绩效评价用项目。

```text
id
cycle_id
project_code
project_name
owner_person_id
status
created_at
updated_at
```

### performance_project_members

项目成员。

```text
id
project_id
person_id
role
weight
joined_at
created_at
updated_at
```

## 7. 等级与强制分布

### performance_grade_schemes

绩效等级方案。

```text
id
name
description
created_at
updated_at
```

### performance_cycle_grades

周期等级快照。

```text
id
cycle_id
grade_code
grade_name
display_order
min_score
max_score
created_at
updated_at
```

### performance_distribution_rules

强制分布规则。

```text
id
cycle_id
scope_level
control_mode
min_people_count
created_at
updated_at
```

control_mode：

```text
none
soft
hard
```

### performance_distribution_rule_items

强制分布等级比例。

```text
id
rule_id
grade_code
min_ratio
max_ratio
created_at
updated_at
```

## 8. 校准与结果

### performance_calibrations

校准记录。

```text
id
cycle_id
cycle_node_id
person_id
calibrator_person_id
scope_type
scope_id
before_score
after_score
before_grade
after_grade
reason
created_at
updated_at
```

### performance_results

绩效结果主表。

```text
id
cycle_id
person_id
initial_score
initial_grade
calibrated_score
calibrated_grade
published_score
published_grade
appeal_score
appeal_grade
final_score
final_grade
result_source
published_at
created_at
updated_at
```

result_source 示例：

```text
calculation
calibration
publish
appeal
```

## 9. 申诉

### performance_appeals

员工申诉。

```text
id
cycle_id
person_id
result_id
appeal_content
status
submitted_at
closed_at
created_at
updated_at
```

每个周期每人最多一条申诉记录。

### performance_appeal_actions

申诉处理过程。

```text
id
appeal_id
handler_person_id
action_type
comment
feedback_score
feedback_grade
feedback_content
created_at
updated_at
```

申诉关闭时必须写入最终反馈等级、分数和说明。

## 10. 审计

### performance_audit_logs

绩效审计日志。

```text
id
cycle_id
actor_person_id
target_person_id
entity_type
entity_id
action
before_value
after_value
reason
created_at
```

用于记录评分提交、等级调整、结果发布、申诉反馈等关键行为。
