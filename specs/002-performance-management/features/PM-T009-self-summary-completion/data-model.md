# PM-T009 数据模型契约（草案）

## 1. 复用原则

不新增富文本、评级或标签题定义表。题目定义由模板/节点快照提供，任务答案写入现有任务答案或评估内容模型；具体表名和迁移必须先核对现有模型。

## 2. 逻辑对象

### SelfSummaryTaskContext

```text
task_id
project_id
cycle_id
node_id
template_snapshot_id
assignee_id
deadline_at
submitted_at
submission_count
editable
submit_allowed
version
```

### SelfSummaryAnswer

```text
task_id
field_id
value              # 富文本/评级/标签及补充内容的规范化值
updated_at
updated_by
version
```

标签题答案必须能表达：多个选中标签 + 一个共用补充输入框。

## 3. 持久化约束

- 草稿保存与提交必须区分；
- 截止后提交成功后不可再次修改；
- 提交操作幂等；
- 周期/模板快照不被实时模板编辑覆盖；
- 不创建语义重复的任务表。

## 4. 待核对项

- 现有任务答案模型；
- 模板快照字段结构；
- 评级规则颜色的存储路径；
- 版本并发控制字段；
- 审计记录模型。
