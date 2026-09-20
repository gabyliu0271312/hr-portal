# 自定义文本型填写题差异原子任务

completion_status: incomplete
pixel_restore_status: blocked
uncovered_reasons:
- semantic_variant_context_incomplete
- item-display-off-visual-restore-mismatch
- vertical-resize-not-observed-in-this-diff-capture
pixel_acceptance_status: not-run

- [ ] PM-T004-T11 冻结自定义文本型填写题 root/item Profile 开发契约
  - 目标：将本轮采集结果投影为独立子契约，不修改共享 CS-B06 文件。
  - 类型：契约/文档
  - 前置条件：无；root/item 采集证据可读取。
  - 必读：本目录全部文件、父级 CS-B06 契约、PM-T004-template-create 的 `spec.md`/`ui-interaction.md`、`references/ui-design-delivery.md`、`references/component-model-template.md`。
  - 允许修改：仅本目录文档和机器契约。
  - 允许新建：本目录已有的 `capture-manifest.md`、`spec.md`、`component-model.md`、`pixel-contract.md`、`acceptance-contract.md`、`capture-completion-checklist.md`、`atomic-tasks.md`、`extracted-ui-contract.json`。
  - 禁止修改：HR Portal 业务代码、父级 CS-B06 文件、API/数据库/权限、原始采集目录、目标模板数据。
  - 输入契约：root/item capture evidence、两个 binding、9 个 custom-text source state。
  - 输出契约：schema v3 extracted UI contract 与 Markdown 投影；状态保持 `incomplete/blocked/not-run`。
  - UI/采集门禁：已确认 Profile 和大部分差异；item display-off 视觉恢复、语义变体和 resize 仍阻塞。
  - 测试契约：JSON parse、design gate；当前未运行。
  - 验收：文档状态、source_state_ids、证据路径、visible/forbidden、layout relations 和 blocker 一致。
  - 证据：本目录文件和 ClonedSites 证据根引用，不复制原始 HTML/截图/日志。
  - 完成定义：所有字段、阻塞项和状态在 JSON/Markdown 间一致，并由主智能体复核后勾选。

- [ ] PM-T004-T12 将 custom-text Profile 接入 `PerformanceConfiguredContentBlock`
  - 目标：复用唯一完整业务组件，按 `stageContentRule/config_discriminator` 挂载 root/item Profile。
  - 类型：前端/UI
  - 前置条件：PM-T004-T11 完成；用户确认 UI Implementation Brief；共享组件任务可用；item display-off blocker 已关闭或明确批准以 blocked 设计进入实现。
  - 必读：本目录 `extracted-ui-contract.json`、`component-model.md`、`acceptance-contract.md`、父级共享组件契约和前端任务卡。
  - 允许修改：任务卡明确列出的 custom-text rule/profile、共享业务组件和 focused specs；不得扩大到其他环节。
  - 禁止修改：模板保存/写入、API/数据库/权限、原始证据、其他八个环节、第二 item。
  - 输入契约：`entry_mode=regular_question`、`review_type=custom_text`、root/item `config_discriminator`。
  - 输出契约：root 仅隐藏描述；item 仅隐藏名称+共享填写/必填；owner 不串联。
  - 测试契约：AC-01 至 AC-08 的正向和反向组件断言。
  - 验收：结构、布局、视觉、行为分别引用本目录 source_state_ids；未闭合 item restore/resize 前不得勾选。
  - 当前状态：not-run；design_incomplete 阻止正式实现。
  - 完成定义：代码、focused tests、rendered contract、截图 diff 和主智能体复核齐备。

- [ ] PM-T004-T13 执行 custom-text 运行时验收
  - 目标：在真实 HR Portal 路由比较 custom-text root/item Profile、on/off 和 owner isolation。
  - 类型：验收/测试
  - 前置条件：PM-T004-T12。
  - 允许修改：独立 rendered contract、实现截图和验收记录。
  - 禁止修改：业务规则、规格范围、模板数据和原始证据。
  - 测试契约：同 viewport 比较 visible/forbidden、bbox、layout relations、styles、owner、状态转换和 resize 阻断。
  - 验收：design/implementation/acceptance gate 分层记录；无 diff 不得声称像素通过。
  - 当前状态：not-run。
  - 完成定义：structure、layout、visual、behavior 和 pixel 结果全部记录后由主智能体确认。
