# Tasks: HR 提效工具 — 权限管理与报表中台

**Feature**: 001-hr-permission-portal · **Created**: 2026-05-22 · **Source**: [plan.md](./plan.md)

> 任务粒度：每条按"开发者一天可完成"切；标 `[P]` 可与同 phase 内其他 `[P]` 并行；`[USx]` 关联 spec 中的用户故事。文件路径以 `hr-portal/` 为代码根。

---

## Phase 1 — Setup（项目初始化）

- [ ] T001 创建 monorepo 目录骨架 `hr-portal/{backend,frontend,docs}` 与根级 `.editorconfig` / `.gitignore` / `README.md`
- [ ] T002 [P] 后端骨架：`hr-portal/backend/pyproject.toml`（FastAPI 0.110+ / SQLAlchemy 2.0 async / Alembic / pytest / httpx / APScheduler / openpyxl / bcrypt / PyJWT）+ `hr-portal/backend/app/main.py` 空 FastAPI app + `/health` 路由
- [ ] T003 [P] 前端骨架：`hr-portal/frontend/package.json`（Vue 3.4 + Vite + TS + Element Plus 2.7 + Pinia + axios + vue-router）+ `vite.config.ts` + `App.vue` 空壳
- [ ] T004 [P] `hr-portal/docker-compose.yml`：postgres15 + backend + nginx-frontend 三件套；外挂数据卷 `./data/pg`；端口 80/8000/5432
- [ ] T005 [P] `hr-portal/.env.example`：`DB_PASSWORD` / `JWT_SECRET` / `ADMIN_INIT_PASSWORD` / `BEISEN_BASE_URL` 占位
- [ ] T006 [P] backend 启用 Alembic：`alembic init alembic` + `alembic/env.py` 接 SQLAlchemy async metadata
- [ ] T007 [P] backend `app/core/config.py` 用 Pydantic Settings 读取 .env；`app/core/db.py` async session + `app/core/jwt.py` 签发/校验
- [ ] T008 一键启动验证：`docker compose up -d` 后 `curl localhost/api/v1/health` 返回 200，前端 `localhost/` 能加载空白页

---

## Phase 2 — Foundational（阻塞所有用户故事的前置）

- [ ] T009 Alembic 迁移 `001_users_roles_menus.py`：`users` / `roles` / `user_roles` / `menus` / `role_menus` 表（含操作权限四件套字段），见 [data-model.md §一](./data-model.md)
- [ ] T010 [P] backend `app/users/models.py` + `app/roles/models.py` + `app/menus/models.py` SQLAlchemy 实体类
- [ ] T011 [P] backend `app/auth/password.py`：bcrypt 哈希封装；`app/auth/jwt.py`：access token（仅 user_id + exp）签发与校验
- [ ] T012 [P] backend `app/core/deps.py`：`current_user`、`require_role`、`require_op(menu, op)` FastAPI 依赖，每次请求查库（不缓存权限，对应 KD-1）
- [ ] T013 backend `app/seed.py`：首启动注入 admin 账号（密码取 `ADMIN_INIT_PASSWORD`）+ 全量菜单清单 + "超级管理员"角色绑定全菜单全操作；FastAPI 启动事件触发
- [ ] T014 [P] frontend `src/stores/user.ts` Pinia store + `src/api/client.ts` axios 封装（自动带 Bearer + 401 跳登录）
- [ ] T015 [P] frontend `src/router/index.ts` + 路由守卫：未登录跳 `/login`；菜单按 `/auth/me` 返回过滤

---

## Phase 3 — Phase A：骨架与权限三件套（覆盖 [US1] + 部分 [US2]）

> **独立验收**：U1 全 3 条验收场景通过；用户/角色 CRUD、登录、菜单按角色显示、按钮级操作权限可控

### 3.1 后端

- [ ] T016 [US1] backend `app/auth/router.py`：`POST /auth/login` + `POST /auth/logout` + `GET /auth/me` + `POST /auth/change-password`（含登录失败 5 次锁定 15 分钟，见 data-model §状态流转）
- [ ] T017 [P] [US1] backend `app/users/schemas.py` + `app/users/router.py`：`/users` 全部 endpoint（详情、创建、更新、重置密码、启停、权限设置）—— `/users/{id}/feishu/bind` 与 `/auth/feishu/sso` 占位返回 501
- [ ] T018 [P] [US1] backend `app/roles/router.py`：`/roles` 全部 endpoint，含菜单 × 操作权限四件套矩阵的读写
- [ ] T019 [P] [US1] backend `app/menus/router.py`：`GET /menus` 全量清单
- [ ] T020 [US1] backend `app/auth/permissions.py`：`enforce_menu_access(user, menu_code)` + `enforce_op(user, menu_code, op)`，作为统一闸门挂到所有受保护路由

### 3.2 字段分类（U5 前置，与 US1 同期落地结构，以便 Phase C 一并启用）

- [ ] T021 [P] [US5] Alembic 迁移 `002_field_categories.py`：`field_categories` / `field_category_assignments` / `user_visible_categories` / `role_visible_categories`
- [ ] T022 [P] [US5] backend `app/field_category/router.py`：`/field-categories` CRUD + assignments 替换式更新

### 3.3 前端

- [ ] T023 [P] [US1] frontend `src/views/auth/Login.vue`：账号密码登录页；登录成功写入 store + 跳首页；保留"飞书登录（即将上线）"置灰按钮
- [ ] T024 [P] [US1] frontend `src/layouts/Default.vue`：顶部头像 + 修改密码 + 登出；左侧菜单按 `/auth/me.menus` 渲染
- [ ] T025 [P] [US1] frontend `src/views/system/Users.vue`：用户管理列表 + 新建/编辑抽屉 + 启停/重置密码按钮（按操作权限四件套显隐）
- [ ] T026 [P] [US1] frontend `src/views/system/Roles.vue`：角色列表 + 编辑页含"菜单 × (查看 / 增 / 改 / 删 / 导出 / 数据范围控制方式)"矩阵
- [ ] T027 [P] [US5] frontend `src/views/system/FieldCategory.vue`：字段分类 CRUD + 字段分配（下拉树形选 (table, column)）
- [ ] T028 [P] [US1] frontend `src/components/PermissionButton.vue`：按钮级权限封装组件；不可见 vs 可见但置灰两种模式

### 3.4 测试（Phase A 验收闸）

- [ ] T029 [P] [US1] `tests/test_auth.py`：登录成功 / 失败计数 / 锁定 / 解锁 / 改密 7 个用例
- [ ] T030 [P] [US1] `tests/test_users.py`：CRUD + 启停（验证禁用后旧 token 立即失效）+ 权限设置完整闭环
- [ ] T031 [P] [US1] `tests/test_roles_menus.py`：U1 验收场景 1-3 全部覆盖；操作权限四件套矩阵增改回归
- [ ] T032 Phase A 端到端验收：人工跑通 U1 全 3 条验收场景，登录测试用户能且仅能看到授权菜单

---

## Phase 4 — Phase B：北森接入 + 首期 5 张表 + 双树（覆盖 [US3] + [US7]）

> **独立验收**：U3 全 4 条 + U7 全 6 条；5 张表均可 snapshot/upsert 拉取，组织/成本中心树自动生成且支持"含离职/含失效"切换

### 4.1 接口配置与拉取引擎

- [ ] T033 [US3] Alembic 迁移 `003_api_endpoints_fetch_logs.py`：`api_endpoints`（含 `refresh_mode` 枚举与 CHECK 约束）+ `fetch_logs`
- [ ] T034 [P] [US3] backend `app/datasources/models.py` + `app/datasources/schemas.py`
- [ ] T035 [US3] backend `app/datasources/fetch_engine.py`：拉取引擎核心
  - `run_snapshot(endpoint)`：staging table → transaction swap
  - `run_upsert(endpoint, period_key)`：`INSERT...ON CONFLICT (业务主键) DO UPDATE`
  - 入口包裹 `pg_advisory_xact_lock(hashtext('endpoint_'||id))` 串行化（KD-2）
  - 失败回滚不污染主表，写 fetch_log
- [ ] T036 [P] [US3] backend `app/datasources/beisen_client.py`：基于 httpx 的北森 OpenAPI 客户端（按 endpoint.field_mapping 转换字段）；可被 fetch_engine 注入 mock
- [ ] T037 [US3] backend `app/datasources/scheduler.py`：APScheduler 集成；启动事件加载所有 `cron_enabled=true` endpoint；endpoint cron 改动后热更新（KD-5）
- [ ] T038 [P] [US3] backend `app/datasources/router.py`：`/datasources/endpoints` CRUD + `POST .../{id}/run`（异步触发返回 202 + log_id）+ `GET .../{id}/logs`

### 4.2 首期 5 张表 schema 与展示页

- [ ] T039 [P] [US7] Alembic 迁移 `004_emp_realtime_roster.py`（snapshot + 索引含 `idx_emp_realtime_org_path` 与 `idx_emp_realtime_cc`）
- [ ] T040 [P] [US7] Alembic 迁移 `005_emp_monthly_roster.py`（含 `UNIQUE(employee_id, period_ym)`）
- [ ] T041 [P] [US7] Alembic 迁移 `006_emp_monthly_salary.py`（含 unique；薪资字段在 seed 阶段打上"敏感"分类）
- [ ] T042 [P] [US7] Alembic 迁移 `007_emp_monthly_allocation.py`（含 `UNIQUE(employee_id, cc_code, period_ym)`）
- [ ] T043 [P] [US7] Alembic 迁移 `008_cost_center_monthly.py`（含 `UNIQUE(cc_code, period_ym)`）
- [ ] T044 [P] [US7] backend `app/data/router.py`：5 张表的 GET 列表 + `POST /data/{table}/refresh`（前端按钮直通到对应 endpoint.run）
- [ ] T045 [P] [US7] frontend `src/views/tables/{EmpRealtimeRoster,EmpMonthlyRoster,EmpMonthlySalary,EmpMonthlyAllocation,CostCenterMonthly}.vue`：5 个列表页（分页 + 搜索 + period_ym 选择器 + 顶部"手动拉取"按钮 + 上次成功时间徽标）

### 4.3 双树物化与 API

- [ ] T046 [US7] Alembic 迁移 `009_tree_nodes.py`：`org_tree_nodes` + `cost_center_tree_nodes`（含 `path` BTREE prefix 索引，KD-3）
- [ ] T047 [US7] backend `app/trees/builder.py`：从源表整体重算两棵树
  - `rebuild_org_tree()`：从 emp_realtime_roster 派生两套（active_only / all）
  - `rebuild_cc_tree()`：从 cost_center_monthly 最新 period_ym 派生两套（effective_only / all）
  - 处理边界：层级断层行打 fetch_log 异常并跳过（spec edge case）
- [ ] T048 [US7] backend `app/datasources/fetch_engine.py` 钩子：花名册拉取成功后自动调用 `rebuild_org_tree`；成本中心月度表拉取成功后自动调用 `rebuild_cc_tree`
- [ ] T049 [P] [US7] backend `app/trees/router.py`：`GET /trees/org?include_inactive=` + `GET /trees/cost-center?include_inactive=` + 手动 `POST .../refresh`
- [ ] T050 [P] [US7] frontend `src/components/HierarchyTreePicker.vue`：通用树勾选组件，每个被勾选节点旁挂"包含下级"toggle（含 hover tooltip，FR-SCOPE-005）

### 4.4 测试

- [ ] T051 [P] [US3] `tests/test_fetch_engine.py`：snapshot 全量覆盖、upsert 命中即整体替换该 period_ym、未命中新增、并发触发串行化、失败保留旧数据 5 个用例
- [ ] T052 [P] [US7] `tests/test_trees.py`：U7 验收 1-6 全覆盖；含离职/含失效切换；层级断层行被跳过且写入异常日志

---

## Phase 5 — Phase C：数据范围标签 + 权限合并 + 脱敏（覆盖 [US2] 完整 + [US5]）

> **独立验收**：U2 全 4 条 + U5 全 2 条；100+ 红队矩阵零越权；SC-002 / SC-008 通过

### 5.1 数据范围标签

- [ ] T053 [US2] Alembic 迁移 `010_scope_tags.py`：`scope_tags` + `scope_tag_selections`（含 `include_descendants`）+ `user_scope_tags`
- [ ] T054 [P] [US2] backend `app/scopes/router.py`：成本中心标签 + 组织架构标签（三子维度）的 CRUD；删除时若被 user 引用 → 409
- [ ] T055 [P] [US2] frontend `src/views/system/Scopes.vue`：标签列表 + 编辑抽屉，复用 T050 的 HierarchyTreePicker；组织架构标签的"用工类型/用工主体"用 checkbox group
- [ ] T056 [US2] frontend `src/views/system/Users.vue` 增加"标签分配"标签页：分别选成本中心标签、组织架构标签

### 5.2 权限合并引擎与脱敏中间件（核心闸门）

- [ ] T057 [US2] backend `app/permissions/scope_filter.py`：`build_filter(user, target_table) → SQL where fragment`
  - 维度内并集：`(path LIKE '/X/%' OR path LIKE '/Y/%')`
  - 组织三子维度交集：`AND` 拼接（"不限"跳过）
  - 跨大维度交集：成本中心条件 `AND` 组织条件
  - 包含下级展开为 `path LIKE 'xxx/%'`，否则等值
  - 提供 `explain(user, table)` 把生成的 where 回显到 dev 工具，便于业务排错（KD-1）
- [ ] T058 [US2] 把 T057 注入 5 张表的 `/data/*` GET 路由；空标签返回空集（不返全表，spec edge case）
- [ ] T059 [US5] backend `app/field_category/masker.py`：响应序列化中间件
  - 计算当前用户 `allowed_categories`（用户白名单 ∪ 角色白名单）
  - 遍历响应字段，未授权分类的列剔除或替换为 `"***"`
  - 应用到 `/data/*` 与 `/reports/*/run` 与 `/reports/*/export`（KD-4 + R-8）

### 5.3 测试（红队矩阵）

- [ ] T060 [P] [US2] `tests/test_scopes_crud.py`：U2 验收 1-4 全覆盖
- [ ] T061 [P] [US2] `tests/test_scope_filter_unit.py`：build_filter 函数级单测，覆盖 8 种合并组合（单维度/多维度/含/不含下级/不限）
- [ ] T062 [US2] `tests/test_permission_matrix.py`：100+ 条 (user × table × 行) 矩阵自动校验，零越权（SC-002）
- [ ] T063 [P] [US5] `tests/test_field_masking.py`：U5 验收 1-2；红队场景：尝试通过列表/搜索/导出三条路径触达敏感字段，零泄露（SC-008）
- [ ] T064 Phase C 端到端验收：手动跑 U2 + U5 全部场景

---

## Phase 6 — Phase D：数据集 + 报表（覆盖 [US4]）

> **独立验收**：U4 全 5 条；SC-005（HR 用户 15 分钟搭出多表聚合报表）

### 6.1 数据集

- [ ] T065 [US4] Alembic 迁移 `011_datasets.py`：`datasets` + `dataset_tables` + `dataset_relations` + `dataset_acl`
- [ ] T066 [P] [US4] backend `app/datasets/router.py`：CRUD + ACL + `/datasets/{id}/integrity`（关联完整性校验）+ 删除前检查报表引用 → 409
- [ ] T067 [P] [US4] frontend `src/views/datasets/DatasetList.vue` + `DatasetEdit.vue`：表选择 + 表间关联（双表 + 关联键多列）+ ACL 角色/用户白名单

### 6.2 报表

- [ ] T068 [US4] Alembic 迁移 `012_reports.py`：`reports`（含 `dataset_id` FK + `definition JSONB`）+ `report_acl`
- [ ] T069 [US4] backend `app/reports/sql_builder.py`：根据 dataset.relations + report.definition 动态拼 `SELECT...JOIN...WHERE...GROUP BY`；叠加 T057 的权限 where 子句；强校验所选字段必须在 dataset 范围内
- [ ] T070 [P] [US4] backend `app/reports/router.py`：`/reports` CRUD + `POST /reports/{id}/run`（带分页）+ `POST /reports/{id}/export?format=xlsx|csv`
- [ ] T071 [P] [US4] backend `app/reports/exporter.py`：openpyxl Excel + 内置 csv 流式写出（避免大报表 OOM，R-11）；导出前应用 T059 脱敏
- [ ] T072 [P] [US4] frontend `src/views/reports/ReportList.vue`：列表 + 操作按钮（运行 / 导出 xlsx / 导出 csv / 编辑 / 删除）
- [ ] T073 [US4] frontend `src/views/reports/ReportWizard.vue`：4 步向导
  - 步骤 1：选数据集（仅显示有 ACL 权限的，FR-REPORT-001）
  - 步骤 2：选维度 / 度量 / 过滤（字段限定在数据集范围内）
  - 步骤 3：预览（调 `/run`）
  - 步骤 4：保存命名 + 设置 ACL
- [ ] T074 [US4] frontend 报表打开时调 `/datasets/{id}/integrity`，断键则在顶部 banner 提示并禁用"运行"按钮（FR-REPORT-005）

### 6.3 测试

- [ ] T075 [P] [US4] `tests/test_datasets.py`：CRUD + ACL + 删除被引用时 409 + 同对源表在两个数据集中独立配置（spec edge case）
- [ ] T076 [P] [US4] `tests/test_reports.py`：U4 验收 1-5；SC-005 计时（用户操作步数 ≤ N）；导出 Excel/CSV 内容核对；脱敏在导出路径上生效

---

## Phase 7 — Polish & 收尾（Phase E）

- [ ] T077 [P] backend `tests/test_edge_cases.py`：spec 边界 16 条全覆盖（upsert 并发、节点本期无人下期新增、删节点幽灵权限、关联键变更等）
- [ ] T078 [P] [US6] 飞书 SSO 接入位预留：user 表 `feishu_user_id` 列已在 T009 加；登录页置灰按钮已在 T023；新增 `docs/feishu-sso-integration.md` 接入文档草稿（OIDC 流程 + 复用 JWT 出口）
- [ ] T079 [P] backend `app/data/refresh_perf.py`：SC-004 验收脚本（典型万级行数表手动拉取端到端 ≤ 1 分钟）
- [ ] T080 [P] backend `tests/test_session_revoke.py`：SC-007 禁用账号后 ≤ 1 分钟所有会话失效
- [ ] T081 [P] backend `app/scheduled/health.py`：拉取成功率统计任务，每月生成 SC-003 报告
- [ ] T082 [P] `docs/deployment.md`：基于 [quickstart.md](./quickstart.md) 完善 Postgres 备份/恢复脚本、日志切割、磁盘监控建议
- [ ] T083 [P] `Makefile`：`make backup` / `make restore` / `make seed` / `make migrate` 命令
- [ ] T084 [P] `docs/admin-runbook.md`：常见故障处置 SOP（拉取失败、登录锁定、报表关联断键、磁盘满）
- [ ] T085 整体回归：从空环境起步，按 [quickstart.md §7 验收清单](./quickstart.md#7-验收清单) 跑一遍，全部 ✅ 视为可上线

---

## Dependencies（关键依赖图）

```
Phase 1 (Setup)
   └→ Phase 2 (Foundational)
          └→ Phase 3 (Phase A: US1 + US5 结构)  ──┐
                  └→ Phase 4 (Phase B: US3 + US7) ─┤
                          ├→ Phase 5 (Phase C: US2 完整 + US5 启用) ──┐
                          └→ ... 依赖双树勾选数据源                    │
                                                                       └→ Phase 6 (Phase D: US4)
                                                                              └→ Phase 7 (Polish)
```

**最关键的串行链**：T009（users 表）→ T013（admin seed）→ T016（登录）→ T035（拉取引擎）→ T039-T043（5 张表）→ T047（树构建）→ T057（权限合并）→ T069（报表 SQL builder）。其余多数任务可在 phase 内并行。

---

## 并行执行示例

### Phase 1 内可同时启动

```text
T002 (后端骨架)  ┐
T003 (前端骨架)  ├→ 三个独立目录，零冲突
T004 (compose) ┘
```

### Phase 3 内可同时启动（待 T009/T013 完成后）

```text
T017 users API   ┐
T018 roles API   ├→ 不同模块路由文件
T019 menus API   │
T021 字段分类迁移 ┘
T023 Login.vue   ┐
T024 Layout.vue  ├→ 不同 vue 文件，前后端解耦
T025 Users.vue   │
T026 Roles.vue   ┘
```

### Phase 4 内可同时启动（待 T035 完成后）

```text
T039-T043 五张表迁移可全并行（不同文件）
T045 五个前端列表页可全并行
T051 / T052 测试文件相互独立
```

---

## Implementation Strategy

### MVP 切片建议

- **MVP-α**（约 2 周）：Phase 1 + Phase 2 + Phase 3 = 平台可登录、可配权限、菜单按角色显示。**业务可演示但无数据**
- **MVP-β**（约 +2 周）：+ Phase 4 = 5 张报表数据进来，双树跑起来。**业务可看数但还没权限过滤**
- **MVP-γ / 上线版**（约 +2 周）：+ Phase 5 = 数据范围权限+脱敏全开。**SC-002 / SC-008 通过即可上线**
- **增强版**（+ Phase 6）：+ 数据集与自助报表
- **硬化版**（+ Phase 7）：+ 边界 + SOP + SSO 接入位文档

### 验收标志（每个 phase 退出条件）

| Phase | 退出条件 |
|---|---|
| 1 Setup | T008 健康检查通过 |
| 2 Foundational | admin 能登录系统 |
| 3 Phase A | T032 端到端：U1 全 3 条 + 操作权限按钮级显隐生效 |
| 4 Phase B | T052 测试通过：U3 全 4 + U7 全 6 验收场景 |
| 5 Phase C | T064 端到端：U2 全 4 + U5 全 2 + 100+ 矩阵零越权 |
| 6 Phase D | T076 测试通过：U4 全 5 + 报表导出脱敏正确 |
| 7 Polish | T085 quickstart §7 验收清单全 ✅ |

---

## 任务统计

- **总任务数**：85
- **按 Phase 分布**：Setup 8 / Foundational 7 / Phase A 17 / Phase B 20 / Phase C 12 / Phase D 12 / Polish 9
- **按用户故事分布**：US1 = 11；US2 = 12；US3 = 8；US4 = 12；US5 = 6；US6 = 1（仅占位）；US7 = 14；其余为 Setup / Foundational / Polish 共享
- **可并行任务（[P]）**：约 55 项
- **测试任务**：T029-T032、T051-T052、T060-T064、T075-T080，共 17 项
- **核心串行链**：T009 → T013 → T016 → T035 → T039-T043 → T047 → T057 → T069（共 8 步主干）

---

## 下一步

- 直接进入 `/speckit.implement` 执行 Phase 1（建议先一个一个 Phase 跑，每个 Phase 完事后人工验收 + 留 Todo 评审点）
- 或者按 MVP-α/β/γ 切片，分多次 Sprint 推进