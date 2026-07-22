# X1521 全链路安全、兼容与发布验证

## 本地自动化证据

使用 `hr-portal/scripts/verify-employee-profile-release.ps1` 统一执行以下检查：

1. 员工档案字段目录、动态投影、scope、权限、旧会话、审计与受控 action 测试。
2. 飞书私聊事件、候选 action、重放防护与 Web/飞书共享限流测试。
3. 后端全量 pytest 与 Python 编译检查。
4. 前端全量 Vitest、类型检查与生产构建。
5. `git diff --check`。

## 2026-07-22 本地执行结果

执行命令：

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\\hr-portal\\scripts\\verify-employee-profile-release.ps1
```

- 员工档案定向回归：`74 passed`。
- 后端全量回归：`1,382` 项已收集，命令以退出码 `0` 完成。
- 前端全量 Vitest、类型检查和生产构建：退出码 `0`。
- Python 编译检查：退出码 `0`。

已观察到既有 FastAPI 弃用、SQLAlchemy 异步资源和 Rollup 依赖注释警告；命令均未失败，未在本任务中修改无关模块。

## 2026-07-22 开发 Docker 构建结果

执行命令：

```powershell
docker compose -f docker-compose.yml -f docker-compose.dev.yml build backend frontend
```

- 开发编排成功加载 `db`、`gotenberg`、`backend` 与 `frontend` 服务。
- 后端镜像 `hr-portal-backend:latest` 构建成功。
- 前端镜像 `hr-portal-frontend:latest` 构建成功；Docker 的 Node 构建阶段已执行 `npx vite build` 并完成生产产物打包。

## 发布前人工确认

- 在目标环境执行 `alembic upgrade head`，确认 `0108` 与 `0109` 均已应用；回滚演练仅在隔离环境执行。
- 使用已映射的飞书测试账号完成私聊员工查询、同名候选选择和拒绝未授权敏感字段验证。
- 在字段管理页运行治理预检，处理高风险字段分类告警并保留审批证据。

## 边界说明

仓库当前未配置 Playwright 或其他浏览器 E2E 运行器。Web 侧由 AI 卡片与字段管理组件测试、前端生产构建及后端 API/受控 action 集成测试共同覆盖；如上线门禁要求真实浏览器自动化，应在后续独立任务中引入浏览器测试基础设施和可复现的测试数据环境。
