Generic single-database configuration with async (asyncpg).

迁移规则：
1. 每个 migration 文件命名 `NNN_<short_desc>.py`，序号与 tasks.md 对应
2. 通过 `alembic revision -m "msg" --autogenerate` 生成；务必 review autogenerate 内容
3. CI 中 `alembic upgrade head` 必须能在空库上跑通

详细任务清单见 [../../specs/001-hr-permission-portal/tasks.md](../../specs/001-hr-permission-portal/tasks.md)。