# 功能规格目录

每个较完整的绩效业务能力使用一个 `PM-xxx-name` 目录。建议至少包含：

```text
PM-xxx-name/
├── spec.md
├── api-contract.md
├── data-model.md
├── ui-interaction.md
├── atomic-tasks.md
└── acceptance.md
```

不涉及的文件可以明确写“不涉及”，不要为了凑结构编造内容。

## 当前新增功能

| 编号 | 功能 | 状态 | 入口 |
|---|---|---|---|
| PM-T008 | 绩效用户身份切换与集中权限控制 | 代码已实现、本地验证通过；真实消息/生产验收待执行 | [需求说明](PM-T008-user-identity-switch/spec.md) · [MVP 任务](PM-T008-user-identity-switch/atomic-tasks.md) · [UI 交互](PM-T008-user-identity-switch/ui-interaction.md) |
