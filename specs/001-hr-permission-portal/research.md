# Phase 0 — Research & Technical Decisions

**Feature**: 001-hr-permission-portal · **Date**: 2026-05-22

本文件记录 plan 阶段做出的关键技术决策，作为后续实现依据。每条都包含**结论 / 理由 / 候选 / 弃用原因**。

---

## R-1：后端语言与 Web 框架

- **Decision**：Python 3.11 + FastAPI
- **Rationale**：
  - HR/财务系统的开发者储备 Python 远多于 Go/Java（事实标准）
  - FastAPI 原生 async + 自动 OpenAPI + Pydantic，复杂权限装饰器/依赖注入语法贴合"角色 + 数据范围"模型
  - 与 SQLAlchemy 2.0 async 配合度高
- **Alternatives**：
  - **Django + DRF**：Admin 自带，看似省事；但管理后台风格 fix 死、不适合 spec 中的多步报表向导，且与本期前后端分离方向相反
  - **NestJS（Node）**：TS 全栈是优势，但依赖生态在数据库异步驱动上不如 Python；ORM（Prisma/TypeORM）对动态 SQL 拼接能力弱，伤害本期"数据集动态查询"
  - **Go (Gin/Echo)**：性能强但开发节奏慢；Pydantic 等价物（schema 校验 + 动态解析）需要自己造，本期数据量级浪费

---

## R-2：数据库

- **Decision**：PostgreSQL 15+（单实例，无主从）
- **Rationale**：
  - JSONB：报表查询定义、字段映射、操作权限矩阵 等半结构化字段存 JSONB 比建一堆窄表实用
  - 递归 CTE 与 ltree 扩展：组织/成本中心树天生匹配
  - `INSERT ... ON CONFLICT` 原生 upsert，本期 4 张月度表的核心写入语义
  - 单实例足以承担数百用户 + 十万级报表行（spec 假设）
- **Alternatives**：
  - **MySQL**：JSONB 弱、CTE 支持晚、缺 ltree；不选
  - **SQLite**：单文件部署诱人，但并发写入与 advisory lock 不足；不选
  - **DuckDB / ClickHouse**：OLAP 强，但运维 + 备份 + 与权限模型集成都要重做；本期数据量级用不上；不选

---

## R-3：定时任务

- **Decision**：APScheduler（in-process）
- **Rationale**：
  - 5 张接入表，最频繁日级一次 cron；单进程足以
  - 无需引入 Redis/RabbitMQ
- **Alternatives**：
  - **Celery + Redis**：标准重型方案；本期接入表数量级低、并发低，引入即过度工程
  - **OS 级 crontab**：与应用脱耦，但失去"管理员在 UI 里改 cron 表达式"的能力（spec FR-API-001）；不选

---

## R-4：报表查询执行模型

- **Decision**：动态拼接 SQL（基于数据集元数据）→ 直查 Postgres
- **Rationale**：
  - 数据集 = 表清单 + 表间关联，足以推出 `SELECT...JOIN...` 骨架；维度/度量/过滤/权限 are append-only
  - 十万级行数 + 合理索引 → 秒内返回
  - 拼装是确定性的，可以单测
- **Alternatives**：
  - **Cube.js / Metabase 嵌入**：视觉富丽，但不能精细叠加本系统的字段分类脱敏 + 数据范围合并语义；不选
  - **预聚合物化视图**：本期报表是用户自助的，不能预先穷举所有维度组合；不选

---

## R-5：权限合并引擎实现

- **Decision**：显式 SQL where 子句拼装（`permissions.build_filter(user, target_table)`）
- **Rationale**：
  - spec FR-AUTH-005 的合并语义是"维度内 OR + 跨维度 AND"，属于代数式可序列化的逻辑表达式
  - 显式拼装 + 回显给前端 dev 工具，便于业务用户问"为什么我看不到 X"时排查
- **Alternatives**：
  - **Postgres Row-Level Security (RLS)**：优雅但黑盒，错误信息差，不便排错
  - **应用内查询后过滤**：性能低（要把全表拉回应用），不可接受

---

## R-6：组织/成本中心树存储与查询

- **Decision**：树节点表 + `path TEXT` 路径字段（如 `/创梦天地/X 公司/A 部门/`），每次源表刷新后**整体重算**
- **Rationale**：
  - 数千节点级，重算毫秒级
  - "包含下级"展开为 `path LIKE '/.../A 部门/%'`，比递归 CTE 直接、可加 GiST 索引
  - 在职/离职、生效/失效是独立的两套树，作为 `tree_kind` 列区分
- **Alternatives**：
  - **每次查询用递归 CTE**：在 N 次嵌套下性能下降，且查询语句复杂；不选
  - **Postgres ltree 扩展**：功能更强，但很多托管 PG 默认未开启；改用普通字符串 + LIKE 兼容性最好
  - **闭包表（closure table）**：写入开销大，且本期写入是"每次刷新整体重算"，闭包表得每次重建，不划算

---

## R-7：upsert 模式实现

- **Decision**：`INSERT ... ON CONFLICT (业务主键) DO UPDATE` + 事务 + 接口级 `pg_advisory_xact_lock`
- **Rationale**：
  - ON CONFLICT 是 PG 原生原子语义
  - advisory lock 保证同一接口的定时与手动并发触发被串行（FR-API-005）
  - 业务主键作为 unique constraint 写进 schema，由 Alembic 管理
- **Alternatives**：
  - **应用层 SELECT-then-INSERT**：并发不安全
  - **MERGE 语句**：PG 15+ 才支持但语义复杂、踩坑多；不选

---

## R-8：字段分类脱敏实现层

- **Decision**：FastAPI 响应序列化层；定义 `MaskedBaseModel`，按当前用户的 `allowed_categories` 在 `.dict(by_user=...)` 时剔除/替换为 "***"
- **Rationale**：
  - SQL 层做 `CASE WHEN allowed THEN col ELSE NULL` 会让 GROUP BY 出现意外行为（NULL 被分到一组）
  - 序列化层做集中、可单测、与查询缓存无关
- **Alternatives**：
  - **SQL 层 mask**：上面已述
  - **前端 mask**：违反"零信任"，禁止

---

## R-9：JWT 不缓存权限

- **Decision**：JWT 只放 user_id 和 exp；权限查询每次请求查库
- **Rationale**：
  - FR-AUTH-006 要求权限变更下次请求即生效，缓存到 JWT 会失效
  - 数百用户 + 普通索引 → 单次查权 < 5ms，可承受
- **Alternatives**：
  - **JWT 内嵌权限 + 短 TTL（5 分钟）**：体验好但失效有窗口；不符合 spec

---

## R-10：飞书 SSO 接入位

- **Decision**：仅做结构预留：
  - user 表加 `feishu_user_id VARCHAR UNIQUE NULL`
  - 登录页保留 `<button disabled>飞书登录（即将上线）</button>` 占位
  - 用户管理页"绑定/解绑飞书"按钮置灰
- **Rationale**：FR-AUTHN-002/004 明确本期不实现，仅留结构
- **后期接入路径**：OIDC 流程 → 服务端校验 → 用 `feishu_user_id` 反查本地 user → 签发 JWT，复用现有出口

---

## R-11：导出格式

- **Decision**：openpyxl（Excel）+ Python 内置 `csv` 模块；流式写出避免大报表 OOM
- **Rationale**：纯 Python、零额外依赖、满足 spec
- **Alternatives**：Pandas → 引入大依赖只为导出，不划算

---

## R-12：部署形态

- **Decision**：Docker Compose 三件套（postgres + backend + nginx 前端静态）
- **Rationale**：
  - 用户是业务用户/IT 小白：一行 `docker compose up -d` 起来
  - Compose 比 K8s/裸机部署对小白友好十倍
- **运维要点**：
  - 数据卷外挂宿主机目录便于备份
  - 提供 `make backup` / `make restore` 脚本

---

## 总结：所有 NEEDS CLARIFICATION 已解决

spec 中无 `[NEEDS CLARIFICATION]` 残留；本文件覆盖了 plan 阶段产生的全部技术不确定性。下一阶段进入 data-model.md。