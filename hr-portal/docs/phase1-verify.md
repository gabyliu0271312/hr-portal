# Phase 1 启动验证手册

> 本文件用于验证 T001-T008 的产出能否一键起来。给业务用户/IT 小白照着抄即可。

## 前置条件

- 已装 Docker Desktop（Windows/Mac）或 Docker Engine（Linux），版本 20.10+
- 已装 docker compose v2（`docker compose version` 能输出版本号）

## 步骤 1：拷贝环境变量

在 `hr-portal/` 目录下执行：

```bash
cp .env.example .env
```

打开 `.env`，**至少改这三项**：

| 变量                | 改成什么                                                 |
| ------------------- | -------------------------------------------------------- |
| DB_PASSWORD         | 一个强密码（建议 ≥16 位混合大小写 + 数字 + 符号）        |
| JWT_SECRET          | 一长串随机字符（建议用 `openssl rand -hex 32` 生成）     |
| ADMIN_INIT_PASSWORD | 你想用的 admin 初始密码                                  |

> 北森三个字段（`BEISEN_*`）现在留空也行，Phase 4 再填。

## 步骤 2：启动

```bash
docker compose up -d --build
```

首次启动需要拉镜像 + 编译前端，约 3-5 分钟。看到三个服务都 `Up` 即可：

```bash
docker compose ps
```

预期输出：

```
NAME                  STATUS              PORTS
hr-portal-db          Up (healthy)        0.0.0.0:5432->5432/tcp
hr-portal-backend     Up                  8000/tcp (Docker 内网)
hr-portal-frontend    Up                  0.0.0.0:8080->80/tcp
```

## 步骤 3：健康检查

> 默认 Compose 不将后端端口发布到宿主机，健康检查请通过前端 Nginx 反向代理访问。开发环境若需直接访问后端端口，请使用 `docker-compose.dev.yml`：`docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d --build`。
### 3.1 直接调后端

```bash
curl http://localhost:${FRONTEND_PORT:-8080}/api/v1/health
```

期望输出（注意 `db.ok=true`）：

```json
{
  "status": "ok",
  "app": "HR Portal",
  "env": "dev",
  "db": { "ok": true, "error": null }
}
```

### 3.2 通过 nginx（前端反代）

```bash
curl http://localhost:${FRONTEND_PORT:-8080}/api/v1/health
```

输出应与上面**一致**。

### 3.3 浏览器打开 http://localhost/

应看到一个浅色卡片，显示：

- 绿色 `OK` 大标签
- 应用：HR Portal
- 数据库：已连通
- 一段"下一阶段"清单

### 3.4 OpenAPI 文档

浏览器打开 http://localhost/docs，应看到 FastAPI 自动生成的 Swagger UI（当前只有两个 endpoint：`/health` 与 `/`）。

## 步骤 4：常见排错

| 现象                                   | 排查                                                                                       |
| -------------------------------------- | ------------------------------------------------------------------------------------------ |
| `docker compose up` 卡住或报端口占用   | 前端或数据库端口被占？检查 `FRONTEND_PORT` / `5432`；后端默认不占用宿主机 8000   |
| backend 容器反复重启                   | `docker compose logs backend` 查；80% 是 `.env` 没建好或 DB 连不上                         |
| db.ok=false                            | `docker compose logs db` 查 postgres 启动日志                                              |
| 前端打开是空白                         | F12 看 console；检查 `nginx.conf` 反代是否生效；`docker compose logs frontend` 查 nginx    |
| 健康检查 200 但 db.ok=false            | postgres 还没初始化完，等 30 秒重试；或检查 DB_PASSWORD 在两边一致                         |

## 步骤 5：停止与清理

```bash
# 停服务（保留数据）
docker compose down

# 完全清空（含数据库数据，慎用）
docker compose down -v
rm -rf data/pg
```

## 验收清单

- [ ] 三个容器 `docker compose ps` 全 Up
- [ ] `curl http://localhost:${FRONTEND_PORT:-8080}/api/v1/health` 返回 `db.ok=true`
- [ ] 浏览器 `http://localhost/` 看到绿色 OK 卡片
- [ ] 浏览器 `http://localhost/docs` 看到 Swagger UI
- [ ] `docker compose down && docker compose up -d` 第二次启动 < 30 秒（不重新构建）

✅ 全打勾 = Phase 1 完成，可进入 Phase 2 Foundational。