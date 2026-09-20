# PM-T007 原子任务

## 任务状态规则

所有任务保持未完成。只有代码、UI、测试、验收和证据均完成后，主智能体才可以勾选 `[x]`。

## 任务清单

- [ ] PM-T007-T01 采集证据补齐与 UI Implementation Brief
  - 前置任务：无
  - 功能范围：补齐导航、列表行 hover、新建/编辑和字段状态证据
  - 代码交付物：`capture-manifest.md`、`capture-completion-checklist.md`、`extracted-ui-contract.json`
  - 不修改范围：业务代码、真实数据、认证状态
  - UI 要求：补齐 source_state_ids、visible/forbidden、line_groups、component ownership、SVG 和容器约束
  - 数据库/API/权限：不涉及实现，但需记录缺口
  - 测试要求：采集完整性和 JSON schema 检查
  - 验收标准：`capture_integrity=passed`；目标变体有完整 artifacts；若仍缺失则保留 blocked
  - 完成证据：capture_model、状态目录、action_log、校验输出
  - 完成定义：不以文件存在代替证据完整

- [ ] PM-T007-T02 UI 蓝图与组件拆解确认
  - 前置任务：PM-T007-T01
  - 功能范围：页面、列表、Header/Footer、表单和新建/编辑复用边界
  - 代码交付物：`ui-blueprints/PM-T007-tag-fill-question.md` 及独立视觉产物
  - 不修改范围：业务代码和 API 实现
  - UI 要求：必须由完整 UI Brief 投影；新建/编辑共用结论需有证据
  - 验收标准：用户确认蓝图版本；未确认不得实现
  - 完成证据：蓝图、PNG、确认记录
  - 完成定义：蓝图状态为已确认或明确记录未决项

- [ ] PM-T007-T03 数据/API/权限契约冻结
  - 前置任务：PM-T007-T01
  - 功能范围：列表、详情、新建、更新、删除、标签项、权限和错误码
  - 代码交付物：`api-contract.md`、`data-model.md` 及必要迁移说明
  - 不修改范围：不编辑既有迁移；不复用 PM-T005 API 猜测
  - 数据库要求：定义主键、索引、唯一性、引用限制、迁移/回滚和旧数据兼容
  - 权限要求：入口权限与绩效内部配置权限分层
  - 验收标准：API/数据/权限评审通过；成功、失败、空、并发和回滚场景可测
  - 完成证据：契约评审、测试夹具、迁移验证
  - 完成定义：共享 DTO、错误码和审计边界冻结

- [ ] PM-T007-T04 列表页 fixture-only 实现与复用验证
  - 前置任务：PM-T007-T02
  - 功能范围：T007 列表、工具栏、分页、搜索/筛选、行操作的本地 fixture 状态
  - 代码交付物：T007 页面组装和业务列表组件
  - 不修改范围：真实 API、数据库、权限写入；PM-T005/PM-T006 既有行为
  - UI 要求：复用通用列表组件，T007 标题、列和间距由 `variant_contracts` 表达
  - 测试要求：列表默认、空、loading、搜索、筛选、行 hover、编辑入口和三项既有行为回归
  - 验收标准：fixture-only 结构/layout/visual/behavior 分层通过
  - 完成证据：测试、实现截图、rendered contract、diff
  - 完成定义：不以单测/构建代替视觉验收

- [ ] PM-T007-T05 新建/编辑共享表单 fixture-only 实现
  - 前置任务：PM-T007-T02
  - 功能范围：基础信息、标签项、备注、预览、校验和 mode
  - 代码交付物：共享 Header、Footer、`TagFillQuestionForm`、create/edit 页面组装
  - 不修改范围：真实 API、数据库、权限写入、保存/删除；未确认业务契约
  - UI 要求：严格按已确认 fixture `variant_contracts` 实现；编辑复用主体，标题由 mode 决定
  - 测试要求：create/edit、字段 focus、标签新增、错误、取消、预览和禁止写入
  - 验收标准：新建/编辑 fixture 结构和 mode 差异可验证
  - 完成证据：前端测试、构建、运行时截图、rendered contract、diff
  - 完成定义：蓝图已确认且所有直接 UI 前置完成

## 任务依赖图

```text
PM-T007-T01 -> PM-T007-T02 -> PM-T007-T03
PM-T007-T02 -> PM-T007-T04
PM-T007-T02 -> PM-T007-T05
```

## 未完成项与风险

| 任务 | 未完成内容 | 风险 | 下一步 |
|---|---|---|---|
| T01 | 19 个表单候选状态已建立唯一映射；导航和 raw before artifacts 仍需补齐/投影 | implementation brief 尚未生成 | 将 state-map 投影为正式 variant_contracts |
| T02 | 蓝图 v1-draft 已创建，尚未确认 | 不得开始 UI 实现 | 确认 fixture-only 边界和三项不可变约束 |
| T03 | API、数据、权限未冻结 | 可能错误建模或写入 | 产品/后端确认 |
| T04/T05 | 未开始 | 复用边界和视觉契约未满足 | 依赖前置任务 |
