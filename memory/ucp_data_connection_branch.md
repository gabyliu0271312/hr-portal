# UCP 数据连接平台分支记忆

日期：2026-07-03
分支：`feature/ucp-data-connection-platform`

## 当前结论

- UCP 分支用于承载“数据连接平台 / 通用连接器平台”相关实现、蓝图和 spec。
- 当前 **不应合并到 main**，需要等功能验收通过后再合并。
- main 只承载已判断可独立上线的非 UCP 内容。

## 已提交到 UCP 分支的关键提交

- `26d9e7c docs: define UCP data connection platform plan`
  - 更新 `specs/011-universal-connector-platform/` 下 spec / implementation-plan / README。
  - 明确 UCP 应采用“应用化设计，门户内交付”。
  - 目标为顶部一级入口“数据连接”、路由前缀 `/ucp`、权限命名空间 `ucp.*`。

- `b6650f8 feat: add UCP data connection platform implementation`
  - 新增 UCP 后端、前端、迁移、菜单/路由等初步实现。

- `a71b9fb docs: add UCP canvas and systems explainer outputs`
  - 提交蓝图相关输出：`outputs/ucp-canvas-preview`、`outputs/ucp-systems-explainer` 等。

- `499a752 feat: add UCP pending employee migration chain`
  - 提交 UCP 待入职人员目标表相关迁移：
    - `0057_hr_pending_employee_full.py`
    - `0058_rename_synced_at.py`
    - `2d74c2f40380_merge_0054_0057_heads.py`

## main 上已单独提交的非 UCP 内容

- main 已有提交：`d88a605 feat: add data compare scheduled tasks`
- 内容属于“数据对比定时任务”，不是 UCP 验收范围。
- UCP 分支后续如需要该能力，应从 main 合入或变基获取，而不是在 UCP 分支重复提交同一批改动。

## 迁移链注意事项

- `0057_hr_pending_employee_full.py` 是 UCP Phase 1A Offer 同步目标表。
- `0058_rename_synced_at.py` 是对 `0057` 表字段的修正。
- `2d74c2f40380_merge_0054_0057_heads.py` 合并：
  - `0054_data_compare_tasks`
  - `0057_hr_pending_employee_full`
- 其中 `0054_data_compare_tasks` 已在 main 提交。
- 因此 UCP 分支后续需要合入 main 后，迁移链才完整。

## UI / 产品定位决策

- UCP 的目标定位：**应用化设计，门户内交付**。
- 不是长期放在“系统设置 → 数据接入”。
- 最终应成为顶部一级入口：`数据连接`。
- 预留未来作为独立应用拆分的可能性。
- 蓝图是交互结构和信息架构参考，不是 1:1 视觉复制。
- 视觉风格应结合 HR Portal 当前 Element Plus / 浅色企业风格评估落地。

## 后续开发重点

1. 按 spec 将现有实现从旧的 datasource / connector-first 结构彻底改造成 UCP 应用化结构。
2. 路由目标逐步调整为 `/ucp` 前缀。
3. 权限命名空间逐步调整为 `ucp.*`。
4. 顶部导航新增“数据连接”一级 Tab。
5. 流水线画布作为 Phase 1 核心能力优先实现。
6. 系统卡片、凭证绑定、运行监控、资源发布等按蓝图最终态和 spec 拆解逐步完成。
7. 开发完成后先在分支验收，再考虑合并 main。

## 不建议提交的内容

以下内容通常不要提交到 UCP 分支或 main，除非明确判断为正式资产：

- `memory/*` 本地记忆文件
- `hr-portal/.codex-logs/`
- `hr-portal/.impeccable.md`
- `hr-portal/backend/test_e2e_*.json`
- 临时测试脚本：`hr-portal/backend/scripts/test_*.py`
- `hr-portal/oracle_bundle.md`
- `hr-portal/oracle_review_bundle.md`
- 本地开发 docker 改动，如临时端口、挂载配置
- 临时说明文件，如 `通用连接器.txt`，提交前必须单独审查是否敏感

## 操作提醒

- 不要在未验收前执行：`git merge feature/ucp-data-connection-platform` 到 main。
- 如果需要 main 的非 UCP 改动，应该在 UCP 分支上合入 main，或重新基于 main 整理。
- 合并前重点检查：迁移链、菜单入口、权限码、路由前缀、蓝图文件是否可打开。
