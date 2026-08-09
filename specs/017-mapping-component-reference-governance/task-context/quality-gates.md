# Quality Gates 上下文包

## 任务

Q0601-Q0609。只能由主代理或独立质量 AI 在全部前置开发任务完成后执行。

## 前置

- 所有 A/M/W/P/U/B 任务均已提交交付报告；
- 共享文件冲突已合并；
- migration head 已统一。

## 必读

- `../testing-acceptance.md`
- `../ai-execution-protocol.md` §9-§13
- `../spec.md` §7.3
- 所有 adapter、工资和成本中心上下文包。

## 允许修改

- `hr-portal/backend/tests/` 中 017 专用测试
- `hr-portal/frontend/src/components/mapping/*.spec.ts`
- `hr-portal/frontend/src/views/**/**.spec.ts` 中 017 专用测试
- `../testing-acceptance.md`
- `../code-status-review-and-revision-decision.md` 的验收勾选和证据章节

## 禁止修改

- 功能实现文件，除非质量发现经主代理确认的缺陷并重新分派实现任务。
- 既有 migration。
- 任务状态 `[ ]/[x]`，除非主代理审核后勾选。

## 验收合同

必须证明：

1. 七类规则均有 DTO、校验、UI、preview、execute、序列化测试。
2. Warehouse、Workflow、UCP Transform、Sink、PushTarget 实际挂载同一 Workspace。
3. UCP Legacy v1、Sink legacy、PushTarget legacy 可读、执行、回显、无损保存或明确阻断。
4. `standardization_rules` 是 ODS→DWD 唯一规则正文。
5. 原 8 类和新 2 类 Warehouse 规则全部通过回归。
6. 工资双跑一致、DWD 灰度、回滚和 ODS 边界证据齐全。
7. 成本中心稀疏覆盖、复制草稿、409、`review_required`、通知去重齐全。
8. Policy/RBAC、脱敏、SQL/脚本拒绝、Sink 强约束、事件幂等齐全。
9. 文档、任务卡、测试命令、交付报告一致。

## 阻断条件

严格遵循 `ai-execution-protocol.md` §11。任何 P0/P1 失败、未解释 skipped、无法复核测试或 adapter 静默丢字段，均阻断首期完成。

## 完成证据

- 测试命令和完整结果；
- migration 状态；
- `git diff --check`；
- adapter fixture；
- UI 组件复用证据；
- 工资差异报告；
- 成本中心生命周期证据；
- 安全测试结果；
- 逐任务交付报告汇总；
- 主代理审核结论。

## 不在范围

- 在质量验收中直接修复功能实现或修改既有 migration；
- 放宽任务合同、删除安全校验或以未运行/skipped 测试替代通过证据；
- 未经主代理审核勾选任务或宣称首期完成。
