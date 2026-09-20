# PM-T007 数据模型契约

```text
completion_status: incomplete
pixel_restore_status: blocked
contract_status: draft-blocked
```

## 0. 2026-09-20 最小持久化决策

PM-T004-T14 已冻结并实现 `performance_tag_fill_questions`：题目字段为 `id/language/name/description/remark/created_by_type/created_by_ref/created_by_name/created_at/updated_at`，有序标签项以 JSONB `tags` 保存，每项为 `id/name/description/prompt`。迁移为 `0228_performance_tag_fill_questions`，索引为题目名称普通索引。模板继续保存标签题内容快照，同时保留 `tagOptionId` 来源引用；删除时扫描模板 workflow/content library，引用中返回 409。

名称跨题唯一性、乐观锁、独立标签表、审计事件和周期快照策略仍未冻结，不应从本次最小接入推导。以下 BLOCKED 段落保留为这些扩展能力的历史清单。

## 1. 当前确认范围

采集到的新建页面包含：题目名称、描述、一个或多个标签项以及备注。每个标签项至少有名称、说明和提示三个可见配置区域。主键、表名、字段名和关系没有从后端证据确认。

## 2. 待确认实体

### TaggedFillInQuestion

候选业务实体，字段全部待冻结：

```text
id                         BLOCKED
name                       BLOCKED
 description               BLOCKED
status                     BLOCKED
created_by                 BLOCKED
created_at                 BLOCKED
updated_at                 BLOCKED
remark                     BLOCKED
version / updated_token    BLOCKED
```

### TaggedFillInQuestionItem

候选标签项实体，字段全部待冻结：

```text
id                         BLOCKED
question_id                BLOCKED
name                       BLOCKED
description                BLOCKED
prompt                     BLOCKED
sort_order                 BLOCKED
created_at                 BLOCKED
updated_at                 BLOCKED
```

## 3. 必须回答的模型问题

- 标签项是否独立表，还是 JSON 配置；
- 题目名称唯一范围；
- 标签名称唯一范围；
- 是否允许没有标签项；
- 标签项的最小/最大数量；
- 删除标签项是否软删除；
- 模板引用是否保存快照；
- 周期启动后是否冻结题目和标签项；
- 已启动周期是否读取实时配置还是周期快照；
- 旧数据是否已经存在以及兼容读取方式。

## 4. 索引与迁移

在上述问题确认前，不创建迁移、不编辑既有迁移、不声明唯一索引和外键。若资源被模板或周期引用，必须定义引用检查、删除策略、事务边界、并发和回滚。

## 5. 敏感性

题目内容和提示可能属于绩效配置数据，应按照绩效后台权限控制读取范围；不能把真实租户数据、认证状态或采集目录内容写入仓库。

## 6. 当前阻塞

本文件不能作为数据库实现依据，需由产品、后端和权限负责人确认后升级为正式模型契约。
