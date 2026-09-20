# PM-T009 API 契约

## 1. 任务详情

`GET /api/v1/performance/tasks/{task_id}/self-summary`

响应：

```json
{
  "task_id": 1,
  "node_name": "模板手动维护的名称",
  "deadline_at": "2026-09-30T23:59:59Z",
  "submitted_at": null,
  "editable": true,
  "submit_allowed": true,
  "submission_count": 0,
  "version": 1,
  "person": {
    "employee_no": "E001",
    "display_name": "刘琦",
    "organization_ref": "产品中心",
    "manager_name": "刘芝萍"
  },
  "form_schema": [
    {
      "id": "content-1",
      "name": "工作总结",
      "description": "描述",
      "allow_multiple": true,
      "fields": [
        {
          "id": "field-1",
          "type": "rich_text",
          "label": "填写题名称",
          "required": true,
          "placeholder": "提示",
          "options": []
        }
      ]
    }
  ],
  "answers": {}
}
```

约束：

- `node_name` 取项目启动时模板节点快照中的手动维护名称，前端不得改写；
- `person` 取项目成员快照，不读取实时花名册覆盖历史项目；
- `form_schema` 保留“内容块 → 填写项”两级结构、模板顺序、隐藏/必填规则、`allow_multiple` 和填写槽位；
- `allow_multiple=false` 时字段答案保持原单值结构；为 `true` 时同一内容块内各字段使用按实例索引对齐的数组，旧单值按第一条兼容读取；
- 评级选项及颜色在项目启动时展开并冻结到节点快照；旧项目快照缺少选项时兼容读取当前评估规则；
- 一个评分评级内容块只允许一个最终 `ratingOptionId` 和一个评级字段；历史数据存在多个 rating item 时按 `ratingOptionId` 保留命中项，无命中时仅保留最后一项；
- 评级字段下发题目级 `display_mode`；项目启动时从评估题读取并冻结，`标签样式` 与 `下拉样式` 不由前端自行推断。
- 早期项目节点快照若同时缺少 `content` 且绑定为空，只能按同一 `node_id` 从当前模板恢复内容；新启动项目不使用该兼容分支。
- 标签选项随模板内容固化，不按“价值贡献”等展示文案写死。

## 2. 自动保存

`PATCH /api/v1/performance/tasks/{task_id}/self-summary/draft`

请求：

```json
{
  "answers": {
    "field-1": "<p>本期完成内容</p>"
  },
  "version": 1
}
```

- 支持单字段或批量字段保存；部分草稿与已有答案合并，不覆盖未提交字段；
- 服务端净化富文本，仅保留支持的格式标签和安全链接；
- 不改变提交状态；
- 成功后返回最新答案和版本号；
- 版本冲突返回 `409 VERSION_CONFLICT`。

## 3. 提交

`POST /api/v1/performance/tasks/{task_id}/self-summary/submit`

服务端执行模板必填校验、提交资格校验、富文本净化和状态迁移。标签题答案结构：

```json
{
  "tags": ["good", "improve"],
  "note": "<p>共用补充说明</p>"
}
```

允许添加多个时，同一内容块的答案按索引对齐：

```json
{
  "work-summary-field": ["<p>第一条</p>", "<p>第二条</p>"],
  "rating-field": ["level-1", "level-2"]
}
```

错误：

- `400 {"code":"VALIDATION_FAILED","field_id":"..."}`
- `404 TASK_NOT_FOUND`
- `409 SUBMISSION_NOT_ALLOWED`
- `409 VERSION_CONFLICT`
- `422 TASK_TYPE_NOT_SUPPORTED`

提交失败不得清空答案。截止时间内提交后仍可修改并再次提交；截止时间后首次提交成功即切换只读。

## 4. 权限和历史边界

- 普通用户只能读取和写入处理人为自己的任务；绩效管理员可进行项目任务预览；
- 任务人员、节点名称、表单结构和已冻结选项以项目启动快照为准；
- 当前模板或花名册变化不得静默改写已启动项目。

## 5. 绩效评估概览中的已提交内容

`GET /api/v1/performance/review/overview?project_id={project_id}&task_id={task_id}`

- `task_id` 可选；提供时只能命中当前用户有权访问且属于当前项目的任务，用于返回页稳定绑定刚处理的任务；非法或不可见任务不得扩大数据权限。
- 工作总结任务已提交时，节点 `status` 返回 `completed`，同时返回 `submitted_at`、`editable`、冻结的 `form_schema` 和已净化的 `answers`。
- 未提供 `task_id` 时，同一节点候选任务按任务 ID 确定性选择，不依赖数据库物理行顺序。
- 前端完成态显示已提交内容；`editable=true` 时显示“去修改”，否则只读。完成态禁止显示“暂未填写”和“去完成”。
