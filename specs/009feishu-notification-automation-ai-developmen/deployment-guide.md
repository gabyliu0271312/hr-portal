# 飞书通知 + 自动化规则 + AI 对话 — 部署到测试环境指南

> **目标**: 将开发完成的功能部署到测试环境，进行端到端验收  
> **适用环境**: Linux 服务器（推荐 Ubuntu 20.04+）或 Windows Server  
> **预计时间**: 2-3 小时

---

## 📦 部署架构

```
┌─────────────────────────────────────────┐
│          测试环境服务器                   │
│  ┌──────────┐    ┌──────────┐         │
│  │  后端服务  │    │  前端服务  │         │
│  │ (FastAPI) │    │ (Vue 3)  │         │
│  │  Port 8000│    │ Port 5173 │         │
│  └──────────┘    └──────────┘         │
│       │               │                  │
│       └───────┬───────┘                  │
│               │                          │
│       ┌───────▼───────┐                  │
│       │  PostgreSQL    │                  │
│       │  (数据库)      │                  │
│       └───────────────┘                  │
└─────────────────────────────────────────┘

可选：
- Redis（用于缓存、异步任务队列）
- Nginx（反向代理、静态文件服务）
- Supervisor / systemd（进程管理）
```

---

## 🔧 前置条件

### 1. 服务器要求

| 组件 | 最低配置 | 推荐配置 |
|------|----------|----------|
| **CPU** | 2 核 | 4 核 |
| **内存** | 4 GB | 8 GB |
| **磁盘** | 20 GB | 50 GB |
| **操作系统** | Ubuntu 20.04+ / Windows Server 2019+ | Ubuntu 22.04 |

### 2. 软件依赖

| 软件 | 版本 | 用途 |
|------|------|------|
| **Python** | 3.11+ | 后端运行环境 |
| **Node.js** | 18+ | 前端构建环境 |
| **PostgreSQL** | 14+ | 数据库 |
| **Git** | 2.30+ | 代码版本管理 |
| **Redis** (可选) | 6+ | 缓存、异步任务 |

---

## 🚀 部署步骤

### Step 1: 准备服务器环境

#### Linux (Ubuntu/Debian)

```bash
# 1. 更新系统
sudo apt update && sudo apt upgrade -y

# 2. 安装 Python 3.11+
sudo apt install -y python3.11 python3.11-venv python3-pip

# 3. 安装 Node.js 18+
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt install -y nodejs

# 4. 安装 PostgreSQL 14+
sudo apt install -y postgresql-14

# 5. 安装 Redis（可选）
sudo apt install -y redis-server

# 6. 安装 Nginx（可选，用于反向代理）
sudo apt install -y nginx

# 7. 创建部署用户
sudo useradd -m -s /bin/bash deploy
sudo usermod -aG sudo deploy
```

#### Windows Server

```powershell
# 1. 安装 Python 3.11+
# 下载：https://www.python.org/downloads/

# 2. 安装 Node.js 18+
# 下载：https://nodejs.org/

# 3. 安装 PostgreSQL 14+
# 下载：https://www.postgresql.org/download/windows/

# 4. 安装 Redis（可选）
# 下载：https://github.com/microsoftarchive/redis/releases

# 5. 创建部署目录
New-Item -ItemType Directory -Path "C:\hr-portal"
```

---

### Step 2: 配置数据库

#### 创建数据库和用户

```bash
# 1. 切换到 postgres 用户
sudo su - postgres

# 2. 创建数据库用户
psql -c "CREATE USER hr_portal WITH PASSWORD 'your_secure_password';"

# 3. 创建数据库
psql -c "CREATE DATABASE hr_portal_db OWNER hr_portal;"

# 4. 授权
psql -c "GRANT ALL PRIVILEGES ON DATABASE hr_portal_db TO hr_portal;"

# 5. 退出
exit
```

#### 配置数据库连接

创建 `backend/.env` 文件：

```bash
# Linux
nano ~/hr-portal/backend/.env

# Windows
notepad C:\hr-portal\backend\.env
```

**.env 文件内容**：

```ini
# 数据库配置
DATABASE_URL=postgresql+asyncpg://hr_portal:your_secure_password@localhost:5432/hr_portal_db

# 飞书配置（可选，用于真实发送消息）
FEISHU_APP_ID=your_app_id
FEISHU_APP_SECRET=your_app_secret

# AI 配置（可选，用于 AI 对话功能）
OPENAI_API_KEY=your_openai_api_key
OPENAI_API_BASE=https://api.openai.com/v1

# 安全配置
SECRET_KEY=your_secret_key_here
ACCESS_TOKEN_EXPIRE_MINUTES=30

# 其他配置
DEBUG=false
LOG_LEVEL=INFO
```

---

### Step 3: 部署后端服务

#### 1. 获取代码

```bash
# Linux
cd /home/deploy
git clone <your_repository_url> hr-portal
cd hr-portal

# Windows
cd C:\hr-portal
git clone <your_repository_url> hr-portal
cd hr-portal
```

#### 2. 创建 Python 虚拟环境

```bash
# Linux
cd backend
python3.11 -m venv venv
source venv/bin/activate

# Windows
cd backend
python -m venv venv
venv\Scripts\activate
```

#### 3. 安装依赖

```bash
# 升级 pip
pip install --upgrade pip

# 安装依赖
pip install -e .

# 如果遇到 asyncpg 编译错误，使用预编译版本
pip install asyncpg --no-binary :all:
# 或者
pip install asyncpg-binary
```

#### 4. 运行数据库迁移

```bash
# 确保已激活虚拟环境
source venv/bin/activate  # Linux
# 或
venv\Scripts\activate  # Windows

# 运行迁移
alembic upgrade head

# 预期输出：
# INFO  [alembic.runtime.migration] Running upgrade  -> 0047_feishu_notification...
# INFO  [alembic.runtime.migration] Running upgrade 0047_feishu_notification -> 0048_automation_rules...
# INFO  [alembic.runtime.migration] Running upgrade 0048_automation_rules -> <next_revision>...
```

#### 5. 启动后端服务（开发测试）

```bash
# 开发模式（自动重载）
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000

# 预期输出：
# INFO: Uvicorn running on http://0.0.0.0:8000 (Press CTRL+C to quit)
# INFO: Started reloader process [12345] using WatchFiles
```

#### 6. 配置后端服务（生产环境）

**Linux (systemd)**：

创建 `/etc/systemd/system/hr-portal-backend.service`：

```ini
[Unit]
Description=HR Portal Backend Service
After=network.target postgresql.service

[Service]
Type=simple
User=deploy
WorkingDirectory=/home/deploy/hr-portal/backend
Environment="PATH=/home/deploy/hr-portal/backend/venv/bin"
ExecStart=/home/deploy/hr-portal/backend/venv/bin/uvicorn app.main:app --host 0.0.0.0 --port 8000 --workers 4
Restart=always

[Install]
WantedBy=multi-user.target
```

启动服务：

```bash
sudo systemctl daemon-reload
sudo systemctl enable hr-portal-backend
sudo systemctl start hr-portal-backend
sudo systemctl status hr-portal-backend
```

**Windows (NSSM)**：

```powershell
# 下载 NSSM: https://nssm.cc/download
# 安装服务
nssm install hr-portal-backend "C:\hr-portal\backend\venv\Scripts\uvicorn.exe" "app.main:app --host 0.0.0.0 --port 8000"

# 启动服务
nssm start hr-portal-backend
```

---

### Step 4: 部署前端服务

#### 1. 安装依赖

```bash
# Linux
cd /home/deploy/hr-portal/frontend
npm install

# Windows
cd C:\hr-portal\frontend
npm install
```

#### 2. 配置环境变量

创建 `frontend/.env.production` 文件：

```ini
# API 基础路径
VITE_API_BASE_URL=http://your_server_ip:8000/api

# 其他配置
VITE_APP_TITLE=HR Portal 测试环境
```

#### 3. 构建前端（生产环境）

```bash
# 构建
npm run build

# 预期输出：
# vite v5.x.x building for production...
# ✓ 1234 modules transformed.
# dist/index.html                   0.50 kB
# dist/assets/index-abc123.js      123.45 kB
# dist/assets/index-def456.css     45.67 kB
```

#### 4. 部署静态文件

**选项 A: 使用 Nginx 托管静态文件（推荐）**

```bash
# 1. 复制构建产物到 Nginx 目录
sudo cp -r dist/* /var/www/hr-portal/

# 2. 配置 Nginx
sudo nano /etc/nginx/sites-available/hr-portal
```

**Nginx 配置**：

```nginx
server {
    listen 80;
    server_name your_server_ip_or_domain;

    # 前端静态文件
    location / {
        root /var/www/hr-portal;
        try_files $uri $uri/ /index.html;
    }

    # 后端 API 反向代理
    location /api {
        proxy_pass http://localhost:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }

    # WebSocket 支持（如果需要）
    location /ws {
        proxy_pass http://localhost:8000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
```

**选项 B: 使用 Node.js 服务（简单测试）**

```bash
# 安装 serve
npm install -g serve

# 启动静态文件服务
serve -s dist -l 3000

# 后端 API 需要配置 CORS 允许前端域名
```

---

### Step 5: 配置反向代理（可选，但推荐）

#### 使用 Nginx 反向代理

```bash
# 1. 启用配置
sudo ln -s /etc/nginx/sites-available/hr-portal /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx

# 2. 配置防火墙
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
```

#### 配置 HTTPS（推荐）

```bash
# 安装 Certbot
sudo apt install -y certbot python3-certbot-nginx

# 获取 SSL 证书
sudo certbot --nginx -d your_domain.com

# 自动续期
sudo certbot renew --dry-run
```

---

### Step 6: 初始化数据（可选）

#### 创建管理员用户

```bash
# 进入后端目录
cd /home/deploy/hr-portal/backend
source venv/bin/activate

# 运行初始化脚本（如果有）
python scripts/create_admin.py

# 或者手动创建
python -c "
from app.models import User
from app.core.security import get_password_hash
from app.db.session import async_session

async def create_admin():
    async with async_session() as db:
        admin = User(
            username='admin',
            email='admin@example.com',
            hashed_password=get_password_hash('admin123'),
            is_superuser=True
        )
        db.add(admin)
        await db.commit()

import asyncio
asyncio.run(create_admin())
"
```

---

### Step 7: 验证部署

#### 1. 检查后端服务

```bash
# 健康检查
curl http://localhost:8000/health

# 预期响应：
# {"status": "ok"}

# 查看 API 文档
curl http://localhost:8000/docs
```

#### 2. 检查前端服务

打开浏览器，访问：

- `http://your_server_ip`（Nginx 托管）
- 或 `http://your_server_ip:3000`（Node.js 托管）

**预期结果**：
- ✅ 页面正常加载
- ✅ 无控制台错误
- ✅ 能访问登录页面

#### 3. 检查数据库连接

```bash
# 查看后端日志
sudo journalctl -u hr-portal-backend -f

# 预期输出：
# INFO:app.db.session:Database connection successful
```

---

## 🧪 测试部署

### 1. 功能测试清单

| 功能 | 测试方法 | 预期结果 |
|------|----------|----------|
| **用户登录** | 访问 `/login`，输入用户名密码 | 登录成功，跳转到首页 |
| **自动化规则列表** | 访问 `/automation/rules` | 显示规则列表（可能为空） |
| **创建规则** | 点击"创建规则"，填写表单 | 规则保存成功 |
| **AI 对话** | 打开全局 AI 助手，输入测试语句 | AI 返回响应 |
| **报表运行** | 访问报表页面，点击"运行" | 报表运行成功 |

### 2. 集成测试

按照 `simulation-acceptance-test-cases.md` 中的场景进行测试。

---

## 🐛 常见问题排查

### 1. 后端服务无法启动

**问题**: `ModuleNotFoundError: No module named 'asyncpg'`

**解决**:
```bash
# 安装编译依赖
sudo apt install -y python3.11-dev libpq-dev

# 重新安装 asyncpg
pip install asyncpg --no-cache-dir
```

---

### 2. 数据库迁移失败

**问题**: `sqlalchemy.exc.OperationalError: (psycopg2.OperationalError) FATAL: password authentication failed for user "hr_portal"`

**解决**:
1. 检查 `.env` 文件中的 `DATABASE_URL` 是否正确
2. 确认数据库用户和密码
3. 测试数据库连接：
   ```bash
   psql -h localhost -U hr_portal -d hr_portal_db
   ```

---

### 3. 前端无法访问后端 API

**问题**: `CORS error: No 'Access-Control-Allow-Origin' header`

**解决**:
1. 检查后端 CORS 配置（`backend/app/main.py`）
2. 确认 `VITE_API_BASE_URL` 配置正确
3. 如果使用 Nginx 反向代理，确保已配置：
   ```nginx
   location /api {
       proxy_pass http://localhost:8000;
       proxy_set_header Host $host;
       add_header Access-Control-Allow-Origin *;
   }
   ```

---

### 4. 飞书消息发送失败

**问题**: `FEISHU_APP_ID or FEISHU_APP_SECRET not configured`

**解决**:
1. 在 `.env` 文件中配置飞书凭证
2. 如果没有真实飞书应用，使用模拟模式（代码已支持）

---

## 📊 性能优化（可选）

### 1. 后端优化

```bash
# 使用多 worker
uvicorn app.main:app --workers 4 --host 0.0.0.0 --port 8000

# 启用数据库连接池
# 在 backend/app/db/session.py 中配置 pool_size
```

### 2. 前端优化

```bash
# 启用 Gzip 压缩（Nginx）
sudo nano /etc/nginx/nginx.conf

# 添加：
gzip on;
gzip_vary on;
gzip_min_length 1024;
gzip_types text/plain text/css application/json application/javascript text/xml application/xml application/xml+rss text/javascript;
```

### 3. 数据库优化

```sql
-- 为自动化规则表添加索引
CREATE INDEX idx_automation_rules_enabled ON automation_rules (enabled);
CREATE INDEX idx_automation_rules_trigger_type ON automation_rules (trigger_type);

-- 为执行记录表添加索引
CREATE INDEX idx_automation_executions_rule_id ON automation_executions (rule_id);
CREATE INDEX idx_automation_executions_status ON automation_executions (status);
```

---

## 🔒 安全加固（生产环境必做）

### 1. 修改默认密码

```bash
# 修改管理员密码
python scripts/change_password.py --user admin --password <new_password>
```

### 2. 配置防火墙

```bash
# Linux
sudo ufw enable
sudo ufw allow 22/tcp   # SSH
sudo ufw allow 80/tcp   # HTTP
sudo ufw allow 443/tcp  # HTTPS
sudo ufw deny 8000/tcp  # 禁止直接访问后端端口
```

### 3. 启用 HTTPS

参考 [Step 5: 配置 HTTPS](#step-5-配置-https推荐)

### 4. 配置日志轮转

```bash
# Linux
sudo nano /etc/logrotate.d/hr-portal

# 添加：
/home/deploy/hr-portal/backend/logs/*.log {
    daily
    rotate 7
    compress
    delaycompress
    missingok
    notifempty
}
```

---

## 📋 部署检查清单

| 项目 | 状态 | 备注 |
|------|------|------|
| **服务器环境** | ⬜ | Python 3.11+, Node.js 18+ |
| **数据库** | ⬜ | PostgreSQL 14+，已创建数据库和用户 |
| **后端部署** | ⬜ | 依赖已安装，迁移已完成，服务已启动 |
| **前端部署** | ⬜ | 依赖已安装，已构建，静态文件已部署 |
| **反向代理** | ⬜ | Nginx 已配置，可访问前端和后端 |
| **环境变量** | ⬜ | .env 文件已配置 |
| **日志** | ⬜ | 日志正常输出，无错误 |
| **功能测试** | ⬜ | 所有功能测试通过 |
| **安全加固** | ⬜ | 密码已修改，防火墙已配置，HTTPS 已启用 |

---

## 📞 技术支持

如果遇到问题，请提供以下信息：

1. **错误信息**：完整的错误日志
2. **环境信息**：操作系统、Python 版本、Node.js 版本
3. **部署方式**：systemd / NSSM / 手动启动
4. **复现步骤**：详细的操作步骤

**联系方式**：
- 邮箱：support@hr-portal.com
- 文档：`https://docs.hr-portal.com/deployment`

---

**部署负责人**: ___________  
**部署日期**: ___________  
**部署环境**: □ 测试环境  □ 生产环境  
**部署结果**: □ 成功  □ 失败  

**备注**:  
___________

