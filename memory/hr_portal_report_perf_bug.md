---
name: hr-portal-report-perf-bug
description: 报表管理模块加载失败 / 汇总报表运行失败的排查路径与根因链
metadata:
  type: project
---

## 问题现象

1. 点击「报表管理」页面提示加载失败
2. 点击某个汇总报表（如成本分摊表）提示运行失败
3. 两者会互相触发：运行报表失败后，再进报表列表也失败

## 根因链（按发现顺序）

### 根因 1：报表列表 N+1 查询（已修复 commit 0a6e5f7）

`list_reports` 对每条报表循环调用 `_to_out`，每次内部发 5-6 条独立 SQL（owner、dataset、ACL、push count×2、can_edit）。20 条报表 = 120+ 次查询，数据量大时累积超时。

**修法**：改为批量预加载，固定 6 次查询与报表数量无关。

### 根因 2：公式 AST 每行重复编译（核心性能瓶颈，已修复 commit 90aa872）

汇总报表触发全量取数到 Python 做聚合，12 个计算字段 × 3366 行 = 40,000+ 次 `ast.parse` + `ensure_safe` + 正则替换，纯 CPU 操作耗时数十秒导致超时。

**修法**：在 `formula_evaluator.py` 的 `_compile_formula` 加 `@lru_cache(maxsize=512)`，每个公式字符串只编译一次，后续行复用 AST。

**Why：** `evaluate_formula` 每次调用都重新 parse，没有缓存。

**How to apply：** 每次遇到"汇总报表运行慢/超时"，先查公式字段数量和数据行数。行数 × 计算字段数 > 10,000 时必然触发此问题。

### 根因 3：idle in transaction 污染连接池（已修复 commit 5199a3b）

`executable_functions` 复用请求主 session 查 `formula_functions` 表，客户端断开后 asyncpg 取消协程，session 停在未完成的查询上，留下 `idle in transaction` 僵尸连接占用连接池，下次请求拿到脏连接后挂起。

**修法**：`executable_functions` 改用独立 session（`get_session_factory()`）。

### 根因 4：前端 JS chunk 404 导致页面崩溃（已修复 commit ac88f32）

每次 `--build` 后 Vite 给 JS chunk 生成新 hash，但浏览器缓存了旧 `index.html` 里的旧 chunk 地址，懒加载路由时 404，整个 Vue 应用崩溃显示白屏，看起来像"加载失败"。

**修法**：`router.onError` 捕获 chunk 404，自动 `window.location.href` 强制刷新。

**How to apply：** 部署后有用户反映白屏或局部页面加载失败，先让用户 `Ctrl+Shift+R` 强制刷新。如果是 nginx 日志里出现 `/assets/xxx.js 404`，就是这个问题。

## 排查工具

```bash
# 查僵尸连接
docker exec hr-portal-db psql -U hr_portal -d hr_portal -c \
  "SELECT pid, now()-query_start AS dur, state, left(query,100) FROM pg_stat_activity WHERE state != 'idle' AND query NOT LIKE '%pg_stat%' ORDER BY dur DESC;"

# 杀僵尸连接
docker exec hr-portal-db psql -U hr_portal -d hr_portal -c \
  "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE state = 'idle in transaction';"

# 查报表配置（数据量 × 计算字段数 = 性能压力）
docker exec hr-portal-db psql -U hr_portal -d hr_portal -c \
  "SELECT id, name, config->>'aggregate', json_array_length(config->'columns'), json_array_length(config->'value_rules') FROM reports WHERE id = <report_id>;"

# 查表实际行数
docker exec hr-portal-db psql -U hr_portal -d hr_portal -c \
  "SELECT relname, n_live_tup FROM pg_stat_user_tables WHERE relname IN ('emp_monthly_salary','emp_monthly_allocation') ORDER BY n_live_tup DESC;"
```

## 关键文件

- `backend/app/reports/router.py` — `list_reports`（批量预加载）、`run_report`（logger.exception）
- `backend/app/ai_formula/formula_evaluator.py` — `_compile_formula` + `lru_cache`
- `backend/app/reports/sql_builder.py` — `executable_functions` 独立 session
- `frontend/src/router/index.ts` — `router.onError` chunk 404 自动刷新
- `backend/app/core/db.py` — `pool_recycle=1800`，`get_session` rollback 失败时 close
