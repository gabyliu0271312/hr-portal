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

- 首次/重建启动:backend 的 entrypoint 自动跑 `alembic upgrade head` + seed(建表+注入admin+数据源/调度种子)。
- 健康判断:db `healthy`,backend 日志出现 `Application startup complete`,`curl http://localhost:37801` 返回 200,`curl http://localhost:37801/api/v1/` 返回 `{"message":"HR Portal API"}`。

## 5. 配置文件(.env / docker-compose)

- `.env`(在 `/opt/hr-portal/hr-portal/.env`):`APP_ENV=prod`,DB 强密码、JWT_SECRET、ADMIN_INIT_PASSWORD、**SECRET_BOX_KEY 已换成随机值**(不再用代码默认值)。密码不入档,见 .env 本身。
- `docker-compose.yml` 相对仓库版的两处改动:
  1. db 服务加 `ports: - "127.0.0.1:5432:5432"`(仅本机)
  2. backend 注入 `SECRET_BOX_KEY: ${SECRET_BOX_KEY:-}`
  3. frontend 端口 `37801:80`

## 6. FineBI 连数据库(已打通)

需求:FineBI(同在本机)连 HR 数据库做报表。**最安全方案 = 同机 127.0.0.1 回环,不对外开 5432。**

- 只读账号:用系统 UI 生成(系统设置→接口配置→员工月度工资表→配置→推送接口→"暴露只读数据库账号")。
  - 系统自动建 `ro_emp_monthly_salary`、`GRANT SELECT`、密码加密存库。
  - ⚠️ 系统生成的连接串 host 是容器名 `db`,**对 FineBI 无效,要改成 `127.0.0.1`**。
  - ⚠️ UI 上的「IP 白名单」字段**后端未实现,不生效**,别依赖它做安全;真正隔离靠 127.0.0.1 回环。
- FineBI 数据源填法:PostgreSQL / host `127.0.0.1` / 端口 `5432` / 库 `hr_portal` / 用户 `ro_emp_monthly_salary` / 密码见 UI"显示"。

## 7. 安全状态与待办

已做:
- ✅ db / backend 不对外,仅 37801 前端对外
- ✅ .env 用强密码 + 随机 SECRET_BOX_KEY(修了"默认密钥可解密所有凭证"的洞)
- ✅ 数据库只绑 127.0.0.1

待办 / 已知风险:
- ⏳ **工资数据来源未定**:当前库为空(建空库未迁数据),北森凭证 `.env` 里还是空的。FineBI 连上但查不到数据,需先解决数据进库(北森同步 / 本地老库迁移 / Excel 导入)。
- ⏳ 对运维 david.su 的数据访问:VMware 虚机结构性无法技术封堵,走 NDA + 数据库审计日志(管理手段)。
- ⏳ Dockerfile 换源改动未提交回 GitHub,重新 clone 会丢。
