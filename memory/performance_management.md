# 绩效管理模块设计记忆

主文档目录：

```text
specs/002-performance-management/
```

核心设计结论：

- 绩效管理是独立业务应用，不是 HR Portal 的普通菜单页。
- 与现有 HR Portal 的关系是“入口打通，内部独立”。
- 绩效管理应作为 HR Portal 顶部一级应用入口，不放在“提效工具”或“系统设置”下。
- HR Portal 侧建议新增入口权限：`performance.app`、`performance.admin`。
- “绩效管理系统管理员”在 HR Portal 侧授予 `performance.app` 和 `performance.admin`；进入绩效后台后，细粒度权限由绩效系统内部管理。
- 未来其他大型独立应用也采用 `<app_code>.app` / `<app_code>.admin` 模式。HR Portal 通用原则见 `specs/001-hr-permission-portal/application-access-model.md`。
- 绩效人员主数据来自员工实时花名册，不强依赖现有 `users` 表。
- 从飞书独立应用访问时走飞书 SSO，优先通过飞书用户 ID 匹配，第一期可通过手机号或邮箱匹配。
- 绩效权限分三层：HR Portal 入口权限、绩效系统配置权限、绩效流程身份权限。
- 绩效流程采用时间节点驱动，不采用传统审批流驱动。
- 流程模板可配置，周期启动后生成快照，后续模板修改只影响新周期。
- 工作内容总结和员工自评都作为流程配置中的独立节点，时间可重合，底层分开存储，可分开提交。
- 校准分部门/组织校准和公司级校准，可直接调整最终等级或分数。
- 强制分布第一期支持三档：不控制、软控制、强控制；可配置适用层级和人数下限。
- 结果发布后员工可以查看最终等级、分数、工作内容总结、自评和上级评价；看不到校准说明。
- 每个绩效周期每人最多申诉一次，申诉只针对最终结果；申诉关闭时反馈最终等级、分数和说明，最终结果以申诉反馈为准。

关键文档：

- `overview.md`：总体方案和核心原则
- `requirements.md`：业务需求清单
- `permission-model.md`：权限体系
- `workflow-design.md`：绩效流程配置设计
- `data-model.md`：数据模型建议
- `integration.md`：与 HR Portal、花名册、飞书 SSO 的集成
- `open-questions.md`：待确认事项
- `roadmap.md`：分期实施建议
补充视觉原则：

- 绩效管理继承 HR Portal 统一设计系统，不单独换视觉主题。
- 平台主色为飞书蓝 `#3370ff`。
- 绩效管理可增加绩效等级、流程节点、申诉状态、项目评价图表等业务语义色。
- 基础组件风格，包括按钮、表单、表格、卡片、弹窗、导航、状态标签，应与 HR Portal 保持一致。
