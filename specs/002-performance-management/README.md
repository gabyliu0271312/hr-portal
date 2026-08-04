# 绩效管理规格目录

## 目录说明

| 目录/文件 | 用途 |
|---|---|
| `START_HERE.md` | 每次讨论和开发的启动门禁 |
| 根目录 Markdown | 绩效系统总体边界、集成、权限、数据和流程基线 |
| `features/` | 按功能维护独立规格和原子任务 |
| `changes/` | 跨功能变更和小型需求记录 |
| `decisions/` | 架构决策和长期约束 |
| `ui-blueprints/` | 绩效页面和复杂流程的可视化蓝图 |
| `templates/` | 新功能规格、任务、蓝图确认模板 |

## 当前基线

- `overview.md`：总体定位和核心原则。
- `integration.md`：与 HR Portal、认证、花名册和路由的集成。
- `permission-model.md`：入口权限与绩效内部权限边界。
- `data-model.md`：绩效领域数据模型。
- `workflow-design.md`：流程和节点设计。
- `requirements.md`：当前需求汇总。
- `roadmap.md`：阶段路线。
- `open-questions.md`：待确认问题。

## 编号规则

- 功能规格：`PM-001`、`PM-002`……
- 变更记录：`CR-001`、`CR-002`……
- 架构决策：`ADR-001`、`ADR-002`……
- 原子开发任务：`PM-001-T01`、`PM-001-T02`……

## 开发原则

采用模块化单体：前后端和数据库运行在现有 HR Portal 中，但绩效保持独立的代码模块、API 前缀、表命名、权限依赖、流程配置和审计边界。