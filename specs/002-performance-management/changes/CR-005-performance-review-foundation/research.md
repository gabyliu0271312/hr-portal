# CR-005 研究结论

## 决策 1：采用“公共页面壳 + 显式 renderer registry”，不采用万能大表单组件

**结论**：`PerformanceReviewContent` 保持为所有评估节点的白卡和状态壳；模板 section 与 field 通过注册表渲染，当前只注册 rich text、rating、tag-with-followup 三类。

**理由**：现有 `PerformanceContentRenderer` 已在模板配置侧证明“共享内容模型 + context/variant renderer”可行。工作总结、未来自评和其他模板任务共享 section/field/answers，但上级评价、校准等仍会有角色和业务动作差异。

**替代方案**：

- 每个节点独立页面：拒绝，会复制白卡、状态机与答案逻辑。
- 一个组件内用大量 `if node_name`：拒绝，展示名称不是稳定业务契约。
- 立即建立覆盖所有未来题型的 renderer：拒绝，未实现的题型没有可冻结字段和答案契约。

## 决策 2：入口按 `entry_mode + task_kind` 注册，不按节点名称匹配

**结论**：后端任务概览逐步下发 `task_kind` 和 `entry_mode`；前端 entry registry 只接受已注册组合。

**理由**：当前工作总结入口兼容了节点名称正则，容易在模板改名、同义名称或新节点出现时跳错页面。任务 ID、任务种类和入口方式已足以成为稳定判别键。

**替代方案**：

- 保留名称正则作为永久兼容：拒绝；只允许在迁移期的显式兼容 adapter 中保留并记录移除条件。
- 后端直接返回任意 URL：拒绝；会把路由策略和潜在未授权跳转交给服务端字符串。

## 决策 3：公共模型从前端 alias 开始，不立即迁移持久化

**结论**：先将 `SelfSummarySection/Field/Option` 升级或 alias 为 `PerformanceTemplateSection/Field/Option`，保留现有 API 和 `PerformanceNodeTask.answers` JSONB。

**理由**：当前工作总结的持久化、快照、版本冲突和重开已验证；未来其他环节的评分、匿名、校准和结果数据尚无冻结通用答案协议。直接合并数据库模型会改变历史敏感边界。

**替代方案**：

- 新建通用答案表并迁移历史：拒绝，超出本次前端公共基座范围。
- 继续让每个任务维护私有字段模型：拒绝，会阻断 renderer 和 adapter 复用。

## 决策 4：完成态公共化到“容器和通知”，内容 renderer 仍按 field type 分派

**结论**：完成提示、编辑可用性、白卡和只读布局共享；富文本、评级、标签答案由 field renderer 展示。

**理由**：不同任务的“完成”状态有共同 UX，但内容表现取决于模板字段类型。将所有答案硬塞进一个自我总结只读组件会阻断后续类型扩展。

**替代方案**：

- 所有完成态用同一个纯文本组件：拒绝，会丢失富文本、评级颜色和标签语义。
- 每个任务独立完成页：拒绝，会再次复制完成提示和只读策略。

## 决策 5：Token 仅提炼跨组件稳定值

**结论**：白卡 surface、完成提示、完成编辑操作、只读答案 surface 和内容宽度以已有基础/语义 token 为优先；只有在公共组件至少两处消费后新增 `--performance-review-*` token。

**理由**：`tokens.css` 已规定 Token 是唯一源头，同时禁止把一次性页面测量值伪装为全局标准。目标完成态的 984px 宽度和 20px 边界已跨完成/未完成状态使用，满足组件级 token 条件。

**替代方案**：

- 所有采集值都立即新增全局 token：拒绝，会污染全局命名空间。
- 继续全部写死在各 renderer：拒绝，会导致视觉修复重复。

## 未决项与处理

| 未决项 | 当前处理 | 后续触发条件 |
|---|---|---|
| 上级评价/项目评价字段集合 | 不纳入当前 registry | 该模块规格冻结 field schema 时 |
| 匿名 360°答案可见范围 | 不纳入公共 renderer 权限规则 | 360°任务 API/权限契约确认时 |
| 校准调整原因与评分计算 | 独立业务 renderer/策略 | 校准规格实现前 |
| 评分/评语新 field type | registry 显式失败 | 评估题 schema 增加对应 type 时 |
| 完整 P2 截图差异 | 维持 blocked/not-run | 每个 variant 有完整采集与 rendered contract 时 |
