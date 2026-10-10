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

## API 暴露的生产更新

代码和 Compose 修改只在开发仓库完成、测试并推送，生产只拉取已发布版本后部署；不得在生产现场编辑源码、启动脚本或 Compose 文件。拉取前先检查当前分支及 `git status --short`，存在生产配置漂移时停止并核对，不使用强制覆盖或整份替换。

Nginx 已转发 `X-Forwarded-For`，后端必须通过 `FORWARDED_ALLOW_IPS` 仅信任实际代理地址。业务 IP 白名单仍填写调用方出口 IP，不填写 Nginx 容器 IP，也不使用 `*` 信任所有代理。

对于已运行的 Docker 部署，在拉取已发布版本后执行以下部署命令。代理地址由 Docker 元数据取得，通过本次 Compose 命令传入容器，不编辑生产 `.env` 或代码文件：

```bash
FRONTEND_CONTAINER="$(docker compose ps -q frontend)" &&
  test -n "$FRONTEND_CONTAINER" &&
  NGINX_IPS="$(docker inspect "$FRONTEND_CONTAINER" --format '{{range .NetworkSettings.Networks}}{{.IPAddress}},{{end}}')" &&
  NGINX_IPS="${NGINX_IPS%,}" &&
  test -n "$NGINX_IPS" &&
  FORWARDED_ALLOW_IPS="$NGINX_IPS" docker compose config --quiet &&
  FORWARDED_ALLOW_IPS="$NGINX_IPS" docker compose up -d --no-deps --no-build --force-recreate backend
```

以上命令仅重建后端容器，不重建前端或数据库、不切换镜像，后端启动仍执行既有迁移检查；适用于当前 `./backend:/app` 挂载源码的部署。未挂载源码的镜像部署应先构建或拉取对应发布镜像。

每次后端重新创建，都应使用该命令或由部署流水线注入同样的代理地址。前端重建后 IP 可能变化，需再次执行该命令刷新后端信任列表；只执行 `restart` 不会更新容器环境变量。不注入时默认仅信任 `127.0.0.1`，对外部代理头保持拒绝。

验证：后端容器中的 `FORWARDED_ALLOW_IPS` 等于当前 Nginx IP；调用方使用有效 AppID/AppSecret 拉取时，后端访问日志显示调用方真实 IP。白名单内返回 200，非白名单或空白名单返回 403，错误凭证返回 401。不要将凭证粘贴到日志、工单或版本库。

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