# 绩效工作流参考

## 产物路由

- 稳定系统边界：更新根基线文档。
- 新能力：创建 `features/PM-xxx-name/`。
- 跨功能变更：创建 `changes/CR-xxx-name/`。
- 架构选择：创建 `decisions/ADR-xxx-name.md`。
- 新或复杂 UI：在 `ui-blueprints/` 下创建绩效蓝图。

## UI 门槛

编码新页面、向导、多角色工作台、多状态流转或信息架构变更前，要求蓝图确认。不改变信息架构的小变更用 `ui-interaction.md`。

## 契约与任务门槛

分解跨层工作前，加载 `execution-contract.md` 并冻结共享 DTO、API、策略、适配器、执行器、错误码、事件、真源、事务和迁移契约。实现前解决阻塞；不得让智能体自造本地变体。

每个原子任务必须使用 `task-card-template.md`。标识精确的允许和禁止文件、共享文件串行合并规则、输入、输出、Given/When/Then 测试、命令、证据、阻塞和非范围。

任何数据库工作加载 `migration-coordination.md`。验收加载 `acceptance-evidence.md`，分别通过、未运行和被阻塞的检查。

## 边界规则

- 仅在基线契约允许处复用 Portal 认证和应用入口。
- 绩效角色、工作流、周期快照、结果可见性、申诉和审计规则保持在绩效领域内。
- UCP、warehouse、PushTarget 和其他执行器/生命周期保持分离；仅在明确指定时共享契约或适配器。
- 对持久化敏感变更验证 UI -> API -> 服务/数据库 -> 读取/重开行为。
