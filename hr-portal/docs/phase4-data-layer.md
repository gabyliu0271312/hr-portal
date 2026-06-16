# Phase 4 数据接入层架构（已废弃）

**状态**：已废弃，不作为设计或开发依据。

本文原先记录早期动态 JSON 列数据层方案。当前系统已经切换为实体列数据源：

- 业务表字段必须是真实物理列。
- `table_columns` 只作为字段元数据中心。
- 同步、数据查看、权限过滤、报表、工具中心、成本分摊和 FineBI 暴露均只允许实体列链路。
- 旧动态 JSON 列业务表不允许继续运行；发现非实体列结构时必须重建为实体列业务表。

当前准则以 [memory/hr_portal_datasource_refactor.md](../../memory/hr_portal_datasource_refactor.md) 和 [CLAUDE.md](../CLAUDE.md) 为准。
