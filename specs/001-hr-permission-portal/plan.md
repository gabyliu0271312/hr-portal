# Implementation Plan: HR 提效工具 — 权限管理与报表中台

**Branch**: `001-hr-permission-portal` · **Spec**: [spec.md](./spec.md) · **Created**: 2026-05-22

## Summary

为 HR 团队搭建一套 **权限中台 + 数据接入 + 报表平台**。前端用 Vue 3 + Element Plus 跑标准 ERP 风格界面；后端用 FastAPI（Python 3.11）+ PostgreSQL 15 承接业务数据与权限模型；定时任务用 APScheduler 直接挂在后端进程（数百人量级，无需 Celery）；报表搭建用 SQL 动态拼接 + ClickHouse 风格的 PostgreSQL 视图（不引入额外 OLAP）。本期只做账号密码登录，飞书 SSO 在 user 表预留 `feishu_user_id` 字段、登录页保留入口位（置灰）即可。

**Why this stack**：用户是业务用户/IT 小白，本平台必须**单机即可部署、运维成本最低**。Python + Postgres + Vue 三件套是当前 HR/财务系统的事实标准，社区资料多、招人容易、问题排查路径短。

## Technical Context

| 层 | 选型 | 版本 | 选它的原因 |
|----|------|------|-----------|
| **前端框架** | Vue 3 + Vite + TypeScript | Vue 3.4+ | HR 系统不靠创新酷炫，Vue 上手成本最低；Element Plus 组件库自带表格/树/表单全套，减少 UI 投入 |
| **前端组件库** | Element Plus | 2.7+ | 树形组件、可编辑表格、CRUD 模板对此类后台系统贴合度最高 |
| **状态管理** | Pinia | 2.x | Vuex 后继，轻量、TS 友好 |
| **后端框架** | FastAPI | 0.110+ | 自带 OpenAPI 文档、Pydantic 校验、async 原生；权限装饰器与依赖注入语法直接表达本系统的"角色 + 数据范围"模型 |
| **ORM** | SQLAlchemy 2.0（async） + Alembic | 2.0 | 标准事实选项；Alembic 做版本化 schema 迁移 |
| **数据库** | PostgreSQL | 15+ | 支持 JSONB（用于报表查询定义、字段映射等半结构化）+ 递归 CTE（组织/成本中心树查询）+ 行级安全策略；本期数据量十万级一台机器够用 |
| **定时任务** | APScheduler | 3.10 | 与 FastAPI 同进程，不再引入 Redis/Celery 这类基础设施 |
| **HTTP 客户端** | httpx | 0.27 | async，原生跟 FastAPI 配；调北森 API |
| **认证** | OAuth2PasswordBearer + JWT (PyJWT) | — | 账密登录走 JWT；飞书 SSO 后期接入 OIDC 流程，复用同一 JWT 出口 |
| **密码哈希** | bcrypt | — | 标准选择 |
| **导出** | openpyxl + 内置 csv | — | Excel + CSV 都覆盖；不引入 Pandas（本期无矩阵运算） |
| **测试** | pytest + pytest-asyncio + httpx test client | — | 与 FastAPI 配套 |
| **部署** | Docker Compose（后端 + Postgres + 前端 nginx 静态） | — | 一行 `docker compose up` 跑起来；不上 K8s |
| **OS** | Linux（Ubuntu 22.04 / Debian 12 任一） | — | 与生产环境保持一致 |

**项目类型**：Web 应用（前后端分离，monorepo 双包）。

**约束摘自 spec**：

- 数百用户、十万级单次报表行数 → 单机够用，无水平扩展需求
- 权限变更下次请求生效 → JWT 不缓存权限到 token，每次请求查库；用 Postgres + 适度索引足以支撑（百用户级 RPS 不高）
- 拉取失败保留旧数据 → 所有 upsert 写入用 staging table + transaction swap，失败回滚整笔
- 敏感字段零泄露 → 后端响应序列化层强制按用户的 field-category 白名单过滤，前端不参与脱敏决策

## Constitution Check

项目尚无 `memory/constitution.md`。本期采用以下默认工程纪律作为隐式宪法：

1. **Library-First**：权限引擎、数据集查询引擎、北森拉取引擎 这三块作为可独立测试的内部库（python package），不与 FastAPI 路由耦合。
2. **数据库 schema 版本化**：所有 schema 变更走 Alembic migration，禁止手改生产表。
3. **测试先于路由**：每个功能切片先写 contract test（pytest 调 httpx test client）再写实现。
4. **零容忍敏感字段泄露**：所有读 API 响应必须经过统一 `field_category_filter` 中间件，单测覆盖红队场景。

## Phase 0 — 关键技术决策（research.md 摘要）

详见 [research.md](./research.md)。本节摘要：

| 决策点 | 结论 | 依据 |
|--------|------|------|
| **是否引入 Redis** | 不引入 | 数百用户 + JWT + 同步定时任务，Postgres 一份就够；引入即多一个运维点 |
| **报表查询如何执行** | 后端动态拼 SQL，落到 Postgres 直接查；十万级行数 < 1s | 不上 ClickHouse / DuckDB / Spark；基于数据集元数据生成 SELECT...JOIN...GROUP BY |
| **upsert 模式实现** | `INSERT ... ON CONFLICT (业务主键) DO UPDATE` + 事务 + 行级锁 | Postgres 原生语义；同接口同时间键并发 → 用接口级 advisory lock 串行化 |
| **组织/成本中心树存储** | 物化视图 `org_tree_node` / `cost_center_tree_node`，每次拉取后 REFRESH | 树结构由源表派生，业务用户无写入需求；递归 CTE 查询足够快 |
| **包含下级展开** | 树存 `path ltree` 或字符串路径（"/创梦天地/X 公司/A 部"），过滤用 `path LIKE '/创梦天地/X 公司/A 部%'` | 比 N+1 递归 CTE 更直接，写入开销在每次刷新时一次付清 |
| **数据范围合并语义实现** | 在权限 SQL 拼装层显式生成 `(org_path IN (...)) AND (cc_code IN (...))` 两个独立条件子句 | 显式 AND/OR 拼装比 RLS 策略可读、可解释 |
| **字段分类脱敏实现** | 序列化层（FastAPI response model）按当前用户的 `allowed_categories` 把不在白名单的字段替换为 "***" 或剔除 | 不在 SQL 层做 mask，避免与查询缓存冲突 |
| **飞书 SSO 接入位** | user 表加 `feishu_user_id` 列；前端登录页 `<button disabled>` 占位 | 本期不实现，纯结构预留 |
| **API 风格** | RESTful + OpenAPI；前端 axios 封装 | 不引入 GraphQL；FastAPI 自动产文档便于业务排查 |

## Phase 1 — 模块划分

```
hr-portal/
├─ backend/
│  ├─ app/
│  │  ├─ main.py
│  │  ├─ core/           # 配置、JWT、依赖注入
│  │  ├─ auth/           # 账密登录、密码哈希、SSO 接入位
│  │  ├─ users/          # 用户 CRUD、启停、密码重置
│  │  ├─ roles/          # 角色 + 菜单 + 操作权限
│  │  ├─ scopes/         # 数据范围标签 + 包含下级
│  │  ├─ trees/          # 组织树 / 成本中心树（物化视图刷新）
│  │  ├─ datasources/    # 北森接口配置 + 拉取引擎（snapshot + upsert）
│  │  ├─ datasets/       # 数据集 + 表间关联
│  │  ├─ reports/        # 报表定义 + 查询引擎 + 导出
│  │  ├─ field_category/ # 字段分类 + 脱敏中间件
│  │  └─ permissions/    # 三层权限合并 → SQL where 子句生成
│  ├─ alembic/           # schema migration
│  └─ tests/
│
├─ frontend/
│  ├─ src/
│  │  ├─ views/
│  │  │  ├─ system/      # 用户/角色/管理单元/字段分类/接口配置
│  │  │  ├─ datasets/    # 数据集 + 表间关联
│  │  │  ├─ tables/      # 5 张接入表的展示页（含手动拉取按钮）
│  │  │  └─ reports/     # 报表管理 + 新建报表向导
│  │  ├─ components/     # 树勾选器（含下级开关）、动态字段选择器、Cron 选择器
│  │  └─ stores/         # Pinia: user / permissions / menus
│  └─ vite.config.ts
│
└─ docker-compose.yml    # postgres + backend + frontend nginx
```

**模块依赖（核心）**：

```
reports → datasets → datasources → field_category
   ↓         ↓
permissions ← scopes ← trees
   ↑
roles, users, auth
```

## Phase 2 — 阶段拆分

按 **MVP 可独立验证** 切，每阶段都有可演示的成果，不做"先建全部表再写所有 API"。

### Phase A — 骨架与权限三件套（U1+U2 验收）

| # | 任务 | 产出 |
|---|------|------|
| A-1 | docker-compose 起 Postgres + FastAPI 空壳 + Vue 空壳，前后端联通跑通 health check | 一键启动环境 |
| A-2 | 用户/角色/菜单/操作权限 CRUD（含初始化 admin） | system/users、system/roles 页面 |
| A-3 | 账密登录 + JWT + 路由守卫 + 菜单按角色过滤 | 登录、菜单按角色显示 |
| A-4 | 字段分类 CRUD（不接入脱敏） | system/field-category 页面 |
| A-5 | 操作权限四件套（增/改/删/导出）按 角色 × 菜单 矩阵 配置；前端按钮级显示控制 | 角色配置页矩阵勾选 |

**Exit criteria**：U1 全 3 条验收场景通过；U2 单独保存标签的部分通过（标签 CRUD，但还没有树）。

### Phase B — 北森接入与首期 5 张表（U3+U7 验收）

| # | 任务 | 产出 |
|---|------|------|
| B-1 | 接口配置 CRUD + 字段映射 UI + Cron 选择器 + 日期格式开关 | system/api-endpoints 页面 |
| B-2 | 拉取引擎 snapshot 模式（事务 swap） | "员工实时花名册"可拉 |
| B-3 | 拉取引擎 upsert by 时间键 + advisory lock | 4 张月度表可拉 |
| B-4 | 5 张表的字段清单沉淀 + 各自的展示页（含手动拉取按钮） | 5 张表前端列表页 |
| B-5 | 拉取日志 + 失败告警 banner | 接口配置页可见日志 |
| B-6 | 组织架构树物化视图 + 含离职开关 | trees/org 渲染 |
| B-7 | 成本中心树物化视图 + 含失效开关 | trees/cost-center 渲染 |
| B-8 | 树形勾选组件 + 包含下级开关 | 通用组件 |

**Exit criteria**：U3 全 4 条 + U7 全 6 条验收场景通过。

### Phase C — 数据范围标签 + 权限合并完成（U2 完整验收）

| # | 任务 | 产出 |
|---|------|------|
| C-1 | 成本中心标签 / 组织架构标签（三子维度）CRUD，复用 B-8 的树勾选组件 | system/scopes 页面 |
| C-2 | 标签分配给用户 | users 详情页加"标签"标签页 |
| C-3 | 权限合并引擎：维度内并集 + 跨子维度交集 + 跨大维度交集 → 生成 SQL where 片段 | `permissions.build_filter(user, table)` |
| C-4 | 在 5 张表的展示 API 中应用 C-3 过滤 | 各表的查询接口受权限约束 |
| C-5 | 字段分类脱敏中间件：按当前用户 `allowed_categories` 过滤响应字段 | 全局响应序列化器 |
| C-6 | 红队回归用例：100+ 条 (用户 × 表 × 字段) 矩阵自动校验 | tests/test_permission_matrix.py |

**Exit criteria**：U2 全 4 条 + U5 全 2 条 + SC-002 / SC-008 通过。

### Phase D — 数据集 + 报表（U4 验收）

| # | 任务 | 产出 |
|---|------|------|
| D-1 | 数据集 CRUD + 数据集内部表间关联配置 UI | datasets 页面 |
| D-2 | 数据集独立授权（角色/用户白名单） | 数据集详情页 |
| D-3 | 新建报表向导：第一步选数据集 → 字段/维度/度量/过滤 → 预览 → 保存 | reports/new 向导 |
| D-4 | 报表查询引擎：根据数据集元数据动态拼 SELECT...JOIN...GROUP BY，叠加权限过滤 | `reports.run(report_id, user)` |
| D-5 | 报表保存 + 列表 + 授权访问 | reports 页面 |
| D-6 | 导出 Excel + CSV | 报表导出按钮 |
| D-7 | 关联完整性校验：打开报表时检查数据集是否仍能 JOIN | 报表打开时的预检 |

**Exit criteria**：U4 全 5 条 + SC-005 通过。

### Phase E — 收尾与硬化

| # | 任务 |
|---|------|
| E-1 | 全部边界情况（spec 中 16 条）写入 e2e 测试 |
| E-2 | 飞书 SSO 接入位预留：user 表字段 + 登录页置灰按钮 + OIDC 接入文档草稿 |
| E-3 | 部署文档（docker-compose + 备份/恢复 + Postgres 调优要点） |
| E-4 | SC-001/SC-003/SC-004/SC-007 验收测试脚本 |

## 关键技术决策（详细）

### KD-1：权限合并引擎不走 Postgres RLS

RLS（行级安全）从理论上是最优雅的方案，但本期权限规则要在前端"为什么我看不到这条"上可解释，RLS 错误信息黑盒。改用：每个查询入口前，由 `permissions.build_filter(user, table)` 显式拼出 SQL where 子句，并把它**回显**给前端 dev 工具，便于排错。

### KD-2：upsert 用业务主键 ON CONFLICT，不用应用层 SELECT-then-INSERT

应用层 SELECT-then-INSERT 在并发下不可靠。直接：

```sql
INSERT INTO emp_monthly_salary (...) VALUES (...)
ON CONFLICT (employee_id, period_ym) DO UPDATE
  SET col1 = EXCLUDED.col1, ...
```

业务主键作为 unique constraint 写进 schema，由 Alembic 迁移管理。

### KD-3：组织/成本中心树用路径串而非递归 CTE 查询

树节点表加 `path TEXT` 字段（如 `/创梦天地/X 公司/A 部门/`）。"包含下级"展开成 `path LIKE '/创梦天地/X 公司/A 部门/%'`。每次源表刷新后，**重算并整体替换**树表（数百到数千节点，毫秒级）。

### KD-4：字段分类脱敏在响应序列化层做

不在 SQL 层做 `CASE WHEN allowed THEN col ELSE NULL`：会让查询缓存复杂化、且 GROUP BY 行为难预期。统一在 FastAPI 响应模型 `BaseResponseModel.dict(by_user=...)` 重写，按 user 的 `allowed_categories` 剔除字段或替换为 "***"。

### KD-5：定时任务进程内（APScheduler），不上 Celery

数百用户、5 张表、定时任务最频繁也是每天一次。Celery 引入 Redis + worker + beat 三个独立进程，运维成本远高于收益。APScheduler 挂在 FastAPI 启动钩子里，单进程多线程足够。

### KD-6：报表查询不缓存

权限实时生效（FR-AUTH-006）+ 报表查询时间 < 1s（十万级），缓存收益小、失效复杂。先不做。

## 风险与应对

| 风险 | 概率 | 影响 | 应对 |
|------|------|------|------|
| 北森 API 字段变更打断拉取 | 中 | 高 | 接口配置里的字段映射独立于代码；变更只改配置；拉取失败保留旧数据不污染主表 |
| 组织树根节点"创梦天地"被硬编码导致未来不能复用 | 低 | 低 | 用一个常量配置项 `ORG_ROOT_NAME`，将来要变只改一处 |
| 用户对"包含下级"开关理解错位 | 中 | 中 | UI 上每个被勾选节点旁挂一个 toggle，并加 hover tooltip："仅本节点 / 包含所有下级"；测试覆盖边界 |
| 数据集关联键变更导致历史报表跑不出来 | 中 | 中 | FR-REPORT-005 的关联完整性校验在打开报表时执行；断键时给报表标"需要修复"红标，不静默 |
| 权限合并 SQL 拼错导致越权 | 低 | 极高 | Phase C-6 的 100+ 条矩阵自动回归 + 每次合并函数变更必须扩增测试用例 |
| 业务用户 IT 能力不足导致部署失败 | 高 | 中 | 一份 docker-compose + 一份图文部署手册（"复制这条命令到这里粘贴"级），不假设运维知识 |

## Project Structure

```
specs/001-hr-permission-portal/
├─ spec.md            # 已完成
├─ plan.md            # ← 当前文件
├─ research.md        # Phase 0 决策依据
├─ data-model.md      # 实体 → 表 schema 映射
├─ quickstart.md      # 业务用户/IT 小白部署 5 步走
├─ contracts/
│  └─ openapi-skeleton.md  # 关键 REST endpoint 列表
└─ checklists/
   └─ requirements.md  # 已存在
```

## Next Steps

1. ✅ Phase 0 决策固化 → research.md
2. ✅ Phase 1 数据模型 → data-model.md
3. ✅ Phase 1 接口骨架 → contracts/openapi-skeleton.md
4. ✅ Phase 1 一键部署手册 → quickstart.md
5. → 进入 `/speckit.tasks` ���成任务清单（按本文件 Phase A→E 拆分）