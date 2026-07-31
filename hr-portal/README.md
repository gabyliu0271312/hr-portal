# HR 提效工具 — 权限管理与报表中台

> 单仓项目：FastAPI 后端 + Vue 3 前端 + PostgreSQL 15。一行 `docker compose up -d` 起来。

## 文档导航

| 文档                                                           | 内容                              |
| -------------------------------------------------------------- | --------------------------------- |
| [../specs/001-hr-permission-portal/spec.md](../specs/001-hr-permission-portal/spec.md)             | 功能规格（10 大类 FR + 7 用户故事）|
| [../specs/001-hr-permission-portal/plan.md](../specs/001-hr-permission-portal/plan.md)             | 实施计划与技术决策                |
| [../specs/001-hr-permission-portal/data-model.md](../specs/001-hr-permission-portal/data-model.md) | 数据库 schema                     |
| [../specs/001-hr-permission-portal/contracts/openapi-skeleton.md](../specs/001-hr-permission-portal/contracts/openapi-skeleton.md) | REST 接口骨架 |
| [../specs/001-hr-permission-portal/quickstart.md](../specs/001-hr-permission-portal/quickstart.md) | 部署手册（IT 小白可读）           |
| [../specs/001-hr-permission-portal/tasks.md](../specs/001-hr-permission-portal/tasks.md)           | 85 项实施任务清单                 |

## 快速开始

```bash
# 1. 复制并填写环境变量
cp .env.example .env

# 2. 启动
docker compose up -d

# 3. 验证
curl http://localhost:${FRONTEND_PORT:-8080}/api/v1/health
# 应返回 {"status":"ok",...}

# 开发环境如需从宿主机直接访问后端 /docs，显式叠加开发端口配置：
# docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d
# 4. 打开前端
# 浏览器访问 http://localhost/
```

详细部署说明见 [quickstart.md](../specs/001-hr-permission-portal/quickstart.md)。

## 数据库只读访问配置

数据库消费默认仅绑定本机 `127.0.0.1:5432`。要给外部 BI/SQL 客户端使用时，在 `.env` 设置：

```env
DB_PUBLIC_HOST=192.168.10.13
DB_PUBLIC_PORT=5432
```

重启数据库与后端后，系统生成的 JDBC/连接 URL 会使用该地址。每个数据库消费目标的“IP 白名单”会生成 PostgreSQL 账号级 `pg_hba.conf` 规则：仅白名单中的 IP 或 CIDR 可连接，空白名单会拒绝该账号的所有远程连接。每个只读账号默认最多 5 个并发连接，单条 SQL 和空闲事务默认 60 秒超时；PostgreSQL 会记录连接成功和断开日志，IT 可通过数据库容器日志或统一日志平台采集。服务器网络、端口放通、防火墙和安全组仍由 IT 统一管理。

## 项目结构

```
├─ backend/         FastAPI 后端
├─ frontend/        Vue 3 前端
├─ docker-compose.yml
├─ .env.example
└─ data/pg/         Postgres 数据卷（首次启动自动生成，已 gitignore）
```

## 当前实现状态

- [x] Phase 1 Setup（T001-T008）—— 项目骨架与一键启动
- [ ] Phase 2 Foundational —— 鉴权基础（待开发）
- [ ] Phase 3-7 —— 见 tasks.md