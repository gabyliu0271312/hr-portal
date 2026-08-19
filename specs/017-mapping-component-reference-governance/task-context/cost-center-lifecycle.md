# 成本中心生命周期上下文包

## 任务

B0510-B0514。成本中心是通用映射组件的 caller 实例，不得把旧 ODS 月度维护逻辑迁入映射组件。

## 前置

- `identity_with_overrides`、Warehouse adapter、版本/发布/审计已验收。`reference_lookup` 仅在 caller 显式配置派生字段时使用。
- 工资迁移不必完成，但公共发布、重算和 policy 必须可用。

## 必读

- `../spec.md` §4.8、§5.1、§6
- `../testing-acceptance.md` §7
- `../code-status-review-and-revision-decision.md` §3.6、§P2-1
- `hr-portal/backend/app/datasources/sync_service.py` 中成本中心相关逻辑
- `hr-portal/backend/app/data/models.py` 中成本中心/月度表模型
- 012 相关周期、DWD、自动化文档

## 允许修改

- `hr-portal/backend/app/mapping/cost_center_service.py`（新增）
- `hr-portal/backend/app/mapping/cost_center_router.py`（新增）
- `hr-portal/backend/app/mapping/models.py`
- `hr-portal/backend/alembic/versions/<new_revision>_cost_center_mapping_lifecycle.py`（新增）
- `hr-portal/backend/tests/test_cost_center_mapping_lifecycle.py`（新增）
- `hr-portal/frontend/src/views/warehouse/CostCenterMappingWorkspace.vue`（新增，仅薄包装）
- `hr-portal/frontend/src/views/warehouse/CostCenterMappingWorkspace.spec.ts`（新增）

## 禁止修改

- 新建独立规则编辑器；页面必须嵌入公共 Workspace。
- 展开保存所有默认自映射行，或以成本中心专属表复制公共规则正文。
- 将 `cost_center_tree`、`code/name` 或其他成本中心字段写入公共组件默认值。
- 把 ODS 同步的上月复制、本地字段默认值、树构建或展示状态当成映射版本生命周期。
- 修改 Sink、PushTarget、工资同步逻辑。
- 自动发布复制结果。

## 输入合同

- `identity_with_overrides(defaultBehavior='keep_source')`；
- 标准属性 `reference_lookup`；
- 周期、版本、草稿/发布、`expectedVersion`、`review_required`；
- 规则正文仍遵守 Warehouse `standardization_rules` 边界，周期业务数据不要求其他 caller 共用。

## 输出合同

- 默认自映射只在执行时推导；规则版本只保存例外。
- 期间执行按 binding 生效范围选择已发布版本，不复制上月规则或以 ODS 快照生成映射草稿。
- 复制上月产生草稿和差异，不自动发布。
- 新增/变更/无效/停用目标进入待确认。
- 并发返回 HTTP 409 / `MAPPING_VERSION_CONFLICT`。
- 未发布规则返回 `review_required`，不得写错误 DWD。
- 发布、DWD 重算、通知为独立状态；通知幂等。

## 测试合同

Given：100 个默认编码、少量例外、上月发布版本、新增/变化/无效目标、两个并发编辑者。

When：初始化、复制、编辑、预览、发布、重算、通知重试。

Then：不存 100 条默认行；例外结果正确；复制不自动发布；409 正确；`review_required` 阻断 DWD；通知去重。

## 完成证据

- 默认自映射与例外覆盖 fixture；
- 复制、并发 409、发布、DWD 门禁、重算和通知重试测试真实输出；
- migration upgrade/downgrade 和持久化验证；
- Workspace 薄包装组件测试及通知幂等/审计证据。

## 不在范围

- 新建独立规则编辑器或展开保存默认自映射行；
- 自动发布复制结果；
- 修改 Sink、PushTarget 或工资同步逻辑。

- 当前成本中心业务主键、周期字段或标准属性来源不明确；
- 需要使用未注册参考数据；
- 需要绕过发布门禁或自动发布复制结果。
