# HR 提效工具 — 服务器部署手册

> 首次部署到生产服务器的完整记录 + 踩坑。后续更新、重启、排障都看这份。
> 部署日期:2026-06-12。部署方式:docker-compose 三件套(db/backend/frontend)。

## 1. 服务器信息

| 项 | 值 |
|---|---|
| 服务器 IP | `192.168.10.13`(hostname: `hr-test`) |
| 类型 | **VMware 虚拟机**(`systemd-detect-virt` = vmware) |
| 运维 | **david.su**(wheel 组,有 sudo;这台机就是他给开的) |
| 项目路径 | `/opt/hr-portal/hr-portal/`(git clone 多嵌套了一层) |
| 代码仓库 | `https://github.com/gabyliu0271312/hr-portal.git` 分支 main |
| 同机其他服务 | FineBI 6.1(占 8000 内部 / 37799 对外)、成本分摊系统(37800,容器) |

> 安全现实:这是 VMware 虚机且 david.su 大概率掌握 vCenter,**运维在技术上始终能拿到数据**(快照/挂盘),靠删账号/改密码堵不住。对运维的防线是管理手段(NDA + 审计),不是技术。详见 §7。

## 2. 端口规划(关键!公司有��口白名单)

| 服务 | 端口 | 对外? | 说明 |
|---|---|---|---|
| HR 前端 | **37801** | ✅ 唯一对外入口 | 浏览器访问 `http://192.168.10.13:37801` |
| HR 后端 | 8000(容器内) | ❌ 不对外 | nginx 容器内反代 `backend:8000`,无需暴露 |
| HR 数据库 | **127.0.0.1:5432** | ❌ 仅本机 | 只绑回环,外网连不上;FineBI 同机走 127.0.0.1 连 |
| FineBI | 8000内/37799外 | - | 别人的系统,**不要动** |
| 成本分摊 | 37800 | - | 别人的容器,**不要动** |

### ⚠️ 坑①:公司网络端口白名单
- 公司网络默认拦截所有端口,**新端口必须找 IT 报备开通**才能外部访问。
- 现象:服务器防火墙放行了 8080、本地 curl 200,但外部浏览器 `ERR_CONNECTION_TIMED_OUT`。
- 已开通可用的对外端口:`37799 37800 37801 38080 3389`(都是 IT 开过的)。
- **结论**:前端最终用 37801(已让 IT 放行)。以后要换端口或开 5432 对外,都得先找 IT。
- 给 IT 的话术:"给服务器 192.168.10.13 开通 xxxx 端口外部访问,和 37799/37800 一样。"

## 3. 镜像与构建(关键!服务器拉镜像被墙)

### ⚠️ 坑②:Docker Hub / Debian / npm 源全部连不上
国内服务器对国外源不通,部署时连环卡死。三处都要换国内源:

1. **Docker 镜像源** `/etc/docker/daemon.json`:
   ```json
   { "registry-mirrors": ["https://docker.1ms.run"] }
   ```
   配完 `systemctl daemon-reload && systemctl restart docker`。
   注:公共源不稳(常见 522/超时),多备几个轮换;小镜像比大镜像易成功。

2. **后端 Dockerfile**(已改,在 `/opt/hr-portal/hr-portal/backend/Dockerfile`):
   - apt 换清华源(sed 替换 debian.sources)
   - `pip config set global.index-url https://pypi.tuna.tsinghua.edu.cn/simple`

3. **前端 Dockerfile**(已改):
   - `npm config set registry https://registry.npmmirror.com`

> 改的是服务器上的 Dockerfile,**未推回 GitHub**。重新 clone 会丢失这些改动,需重做(或哪天把换源 commit 回仓库)。

### ✅ 换源已正式入库(2026-06-25,commit c8ee6e3)
坑②的根治:换源已写进仓库的两个 Dockerfile,`git pull` 后构建即走国内源,不再依赖服务器手改、不会再丢。
- **后端** `backend/Dockerfile`:apt 用 sed 换清华源,**兼容两种格式**——Debian 12 的 `/etc/apt/sources.list` 与 Debian 13 的 deb822 `/etc/apt/sources.list.d/debian.sources`;pip 用清华 pypi。
- **前端** `frontend/Dockerfile`:`npm config set registry https://registry.npmmirror.com`。
- **触发这次踩坑的原因**:`python:3.11-slim` 上游 base 从 Debian 12 升到 **Debian 13(trixie)**,旧的 apt 缓存层失效、apt 重跑,而仓库 Dockerfile 从来没有换源(之前部署成功是命中了 base 镜像缓存层没重跑 apt),于是卡死在 `deb.debian.org` 国外源。Debian 13 换成了 deb822 格式,sed 必须同时处理 `debian.sources` 才生效。

### ⚠️ 坑③:base 镜像复用
4 个 base 镜像:`python:3.11-slim` / `node:20-alpine` / `nginx:1.27-alpine` / `postgres:15-alpine`。
- `postgres:15-alpine` 服务器已有(成本分摊系统用的同款,直接复用)。
- `nginx:1.27-alpine` 用现有 `nginx:alpine` 打 tag:`docker tag nginx:alpine nginx:1.27-alpine`。
- python/node 换源后 `docker pull` 单独拉成功。

## 4. 部署 / 更新 / 重启流程

```bash
cd /opt/hr-portal/hr-portal

# 更新代码后重新部署
git pull                              # 注意:会覆盖本地改过的 Dockerfile,pull 后需重新换源
docker compose up -d --build          # 构建+启动
docker compose ps                     # 看三容器是否 Up / healthy

# 仅重启(不重构建)
docker compose restart

# 看日志排障
docker compose logs backend  | tail -30
docker compose logs frontend | tail -30
```

### 4.1 纯后端代码更新(只重建 backend,推荐)

本次改动只动后端 Python、没碰前端 / 依赖 / 迁移时,**只重建 backend**,不要全量 `--build`:

```bash
cd /opt/hr-portal/hr-portal
git pull
docker compose up -d --build backend          # 只重建后端镜像
docker compose ps
docker compose logs backend | tail -30
curl -s http://localhost:37801/api/v1/        # 期望 {"message":"HR Portal API","docs":"/docs"}
```

为什么这样更安全:
- 后端是 `build: ./backend`,代码 COPY 进镜像,**改了 Python 必须 `--build`,光 restart 不生效**。
- 不重建 frontend 就不会触发 npm 拉国外源(坑②);后端依赖没变能命中缓存,构建很快。
- **关键**:只要本次 commit 没改 Dockerfile,`git pull` 不会动服务器上手改的换源(坑② 不触发);改了 Dockerfile / requirements / 加了 alembic 迁移才需走 §4 全量流程。
- 回退:`git reset --hard <上一个commit>` 后再 `docker compose up -d --build backend`。


- 首次/重建启动:backend 的 entrypoint 自动跑 `alembic upgrade head` + seed(建表+注入admin+数据源/调度种子)。
- 健康判断:db `healthy`,backend 日志出现 `Application startup complete`,`curl http://localhost:37801` 返回 200,`curl http://localhost:37801/api/v1/` 返回 `{"message":"HR Portal API"}`。

## 5. 配置文件(.env / docker-compose)

- `.env`(在 `/opt/hr-portal/hr-portal/.env`):`APP_ENV=prod`,DB 强密码、JWT_SECRET、ADMIN_INIT_PASSWORD、**SECRET_BOX_KEY 已换成随机值**(不再用代码默认值)。密码不入档,见 .env 本身。
- `docker-compose.yml` 相对仓库版的两处改动:
  1. db 服务加 `ports: - "127.0.0.1:5432:5432"`(仅本机)
  2. backend 注入 `SECRET_BOX_KEY: ${SECRET_BOX_KEY:-}`
  3. frontend 端口 `37801:80`

## 6. FineBI 连数据库(已打通,架构已升级)

需求:FineBI(同在本机)连 HR 数据库做报表。**最安全方案 = 同机 127.0.0.1 回环,不对外开 5432。**

### 6.1 架构设计

每张源表对应一套独立隔离：
- **独立 schema**：`finebi_{source_table}`（如 `finebi_emp_monthly_salary`、`finebi_emp_realtime_roster`）
- **独立只读账号**：`ro_{source_table}_{pt_id}`（如 `ro_emp_monthly_salary_3`）
- **物理表**：`finebi_{source_table}.t_{source_table}`（中文列名，由 `table_columns.column_label` 构建）
- 每个账号只有自己 schema 的 USAGE 权限 + 自己那张表的 SELECT —— FineBI 里只能看到自己的表

> **为什么不用 VIEW，不用共享 schema？** FineBI 走 `pg_catalog` 扫表，会列出该 schema 下所有表（不管有没有 SELECT 权限）。共享 schema 时，账号 A 会看到账号 B 的表（只是不能查）。独立 schema 彻底解决跨表可见问题。

### 6.2 配置步骤（新增一张表进 FineBI）

1. 系统设置 → 接口配置 → 找到目标数据源 → 配置 → 推送接口 tab → 新建「暴露只读数据库账号」类型推送目标
2. 点「立即推送」 → 系统自动：建 schema、建物理表（中文列名）、建 PG 只读账号、写回连接信息
3. 推送成功后，进 FineBI 新建 PostgreSQL 数据连接：
   - host：`127.0.0.1`
   - 端口：`5432`
   - 库：`hr_portal`
   - 用户名：见 HR 系统推送目标的连接信息（`readonly_user` 字段）
   - 密码：见 HR 系统「显示密码」
   - **模式：`finebi_{source_table}`**（如 `finebi_emp_monthly_salary`）
4. FineBI 刷新后可见物理表 `t_{source_table}`，列名全为中文

### 6.3 数据同步

- HR 系统每次拉取落库后，**自动触发 FineBI 物理表刷新**（`sync_service.py` 里 sync 后自动调 `execute_push`），无需手动推送
- 手动触发：HR 系统 → 推送接口 → 「立即推送」

### 6.4 账号生命周期

- 新建推送目标 → 自动建 PG 账号
- 删除推送目标 → 自动 `DROP USER`，FineBI 连接立即失效
- 账号密码加密存库；重建推送目标时密码会更新（用 `ALTER USER ... WITH PASSWORD`），需同步更新 FineBI 连接密码

### 6.5 已知问题 / 注意事项

- ⚠️ FineBI 连接里的 host 填 `127.0.0.1`（不是容器名 `db`）
- ⚠️ IP 白名单字段在 UI 上有但后端未实现，不生效
- 旧共享 `finebi` schema（之前调试时手动建的）可以清理：

  ```bash
  docker exec hr-portal-db psql -U hr_portal -d hr_portal -c "DROP SCHEMA IF EXISTS finebi CASCADE;"
  ```

- 旧账号 `ro_emp_monthly_salary`（无 `_id` 后缀，调试时手动建的）可以清理：

  ```bash
  docker exec hr-portal-db psql -U hr_portal -d hr_portal -c "DROP USER IF EXISTS ro_emp_monthly_salary;"
  ```

## 7. 安全状态与待办

已做:
- ✅ db / backend 不对外,仅 37801 前端对外
- ✅ .env 用强密码 + 随机 SECRET_BOX_KEY(修了"默认密钥可解密所有凭证"的洞)
- ✅ 数据库只绑 127.0.0.1

待办 / 已知风险:
- ⏳ **工资数据来源未定**:当前库为空(建空库未迁数据),北森凭证 `.env` 里还是空的。FineBI 连上但查不到数据,需先解决数据进库(北森同步 / 本地老库迁移 / Excel 导入)。
- ⏳ 对运维 david.su 的数据访问:VMware 虚机结构性无法技术封堵,走 NDA + 数据库审计日志(管理手段)。
- ⏳ Dockerfile 换源改动未提交回 GitHub,重新 clone 会丢。
