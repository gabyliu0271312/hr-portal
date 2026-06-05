---
name: hr-portal-scheduler-design
description: 调度系统组件化方案 — 通用表结构 scheduled_jobs/job_runs + handler 字典 + 现阶段只接 datasource_sync 一个 handler，未来加报表订阅/消息推送零表结构变动
metadata:
  type: project
---

# HR Portal 调度系统组件化方案（决策记录）

**决策日期**：2026-05-23
**起因**：Phase 4 收尾要做"定时拉数据"，但用户预期未来还会加"报表订阅推送 / 数据报告推送 / 各类消息推送"。需要先把抽象做对，避免每个场景写一套 scheduler。

## 选定方案：表结构通用化 + 范围收敛

**核心**：表结构按多 handler 通用设计一次性建好；UI 与 handler 实现只先做"数据同步"这一个。

**Why**：
- 现在只做"数据同步"一个 handler，但未来场景列表（报表订阅、报告推送、消息推送）的本质都是"按 cron 跑 fn + 落历史"，抽象同构。
- 表结构是高一次性成本，事后改最贵；UI/handler 是低边际成本，逐个加最便宜。
- 不做"调度管理总览页"是避免范围爆炸；用户至今没要求一个全局任务总览，先复用各 handler 自带的入口（如"接口配置"页 schedule 字段、未来"报表订阅"页订阅规则）。

**How to apply**：未来加新调度场景时——不要建新表、不要建新 scheduler，往 `JOB_HANDLERS` 字典加一行 + 写一个 async handler 函数 + 在业务 CRUD 里调 `upsert_job(kind, business_id, ...)` 即可。

## 表结构（一次性建好，未来不动）

```sql
-- 调度任务定义表
CREATE TABLE scheduled_jobs (
    id BIGSERIAL PRIMARY KEY,
    kind VARCHAR(32) NOT NULL,           -- 任务类型：'datasource_sync' / 'report_subscribe' / 'message_push' / ...
    business_id BIGINT NOT NULL,         -- 关联业务实体 ID（datasources.id / reports.id / ...）
    cron VARCHAR(64) NOT NULL,           -- APScheduler cron 表达式
    payload JSONB NOT NULL DEFAULT '{}', -- handler 需要的额外参数
    enabled BOOLEAN NOT NULL DEFAULT TRUE,
    last_run_at TIMESTAMPTZ,
    last_status VARCHAR(16),             -- pending / running / success / failed
    last_message TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (kind, business_id)           -- 同一业务实体在同一类下只有一个调度
);

-- 通用运行历史表
CREATE TABLE job_runs (
    id BIGSERIAL PRIMARY KEY,
    job_id BIGINT REFERENCES scheduled_jobs(id) ON DELETE SET NULL,
    kind VARCHAR(32) NOT NULL,           -- 冗余 kind，便于按类筛选 + job 删除后历史仍可查
    business_id BIGINT,                  -- 冗余，便于按业务实体追溯
    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    finished_at TIMESTAMPTZ,
    status VARCHAR(16) NOT NULL,         -- running / success / failed
    rows INTEGER,                        -- 处理行数（同步用；推送类填消息数）
    message TEXT,                        -- 成功摘要或失败错误
    triggered_by VARCHAR(32) NOT NULL,   -- 'manual' / 'cron' / 用户 login_name
    payload_snapshot JSONB               -- 跑时的 payload 副本（便于复现）
);
CREATE INDEX ix_job_runs_kind_started ON job_runs (kind, started_at DESC);
CREATE INDEX ix_job_runs_job ON job_runs (job_id);
```

## 代码结构（预留接口）

```text
backend/app/scheduler/
  __init__.py
  engine.py            # APScheduler 启动/停止；reload_all_jobs(); reload_job(job_id)
  schedule_parser.py   # 中文表达式 → CronTrigger：每日HH:MM / 每周X HH:MM / 每月N日HH:MM / 每小时整点 / 手动触发
  handlers.py          # JOB_HANDLERS 字典 + 注册 API
  models.py            # ScheduledJob / JobRun ORM
  service.py           # upsert_job / disable_job / run_now / list_runs
  router.py            # GET /api/v1/job-runs（跨 kind 列表，支持 kind / business_id / status 过滤）
```

**Handler 协议**（未来加 handler 必须遵守）：

```python
async def handler_fn(
    job: ScheduledJob,
    db: AsyncSession,
    triggered_by: str,  # 'cron' 或 user.login_name
) -> tuple[int, str]:
    """返回 (处理行数, 摘要消息)；异常会被 engine 捕获并记录到 job_runs.status='failed'"""
    ...

JOB_HANDLERS = {
    "datasource_sync": _handler_datasource_sync,
    # 未来新增：
    # "report_subscribe": _handler_report_subscribe,
    # "message_push": _handler_message_push,
}
```

**Engine 统一封装**：

```python
async def run_job_now(job_id: int, triggered_by: str) -> JobRun:
    """同时供 cron 触发与手动触发使用：
    - 创建 job_runs 行（status=running）
    - 查 JOB_HANDLERS[job.kind] 拿 handler
    - 调用 → 成功记 success/rows/message；异常记 failed/message
    - 更新 scheduled_jobs.last_run_at / last_status / last_message
    所有 handler 不用自己写事务、不用自己写历史落库
    """
```

## 现阶段范围（这次实施）

✅ **做**：
- 建 `scheduled_jobs` / `job_runs` 表（migration 0006）
- `app/scheduler/` 整套（engine + parser + handlers + models + service + router）
- 注册 `datasource_sync` handler，内部调现有 `sync_to_table`
- `datasources` CRUD 改动：保存时 upsert 一条 `scheduled_jobs`（kind=datasource_sync, business_id=ds.id）
- 前端：「同步历史」页（kind=datasource_sync filter）；Endpoints 行加「查看历史」按钮跳转
- 接口配置页 schedule 字段下拉保持不变，用户感知不变

❌ **不做（留给未来）**：
- 调度管理总览页（全局看所有 kind 的 jobs）
- 报表订阅、消息推送 handler
- 失败重试 / DAG 依赖
- 旧 `sync_runs` 表的迁移与下线（先保留向后兼容）

## 向后兼容

- 旧 `sync_runs` 表保留只读，前端不再读它；新「立即拉取」也写 `job_runs`
- `datasources.last_sync_at / last_status / last_rows / last_message` 字段保留，由 engine 在 datasource_sync handler 跑完后回写（兼容现有 Endpoints 页展示）
- 历史数据：不迁移；用户能通过新「同步历史」页看新数据即可

## 未来加 handler 的 5 步 SOP

未来要加"报表订阅推送"时：
1. 在 `app/scheduler/handlers.py` 写一个 `async def _handler_report_subscribe(job, db, triggered_by)`，里面调报表 run + 发送消息
2. 注册到 `JOB_HANDLERS["report_subscribe"] = ...`
3. 在报表订阅页保存逻辑里调 `scheduler.service.upsert_job(kind="report_subscribe", business_id=subscription_id, cron=..., payload=...)`
4. 前端「同步历史」页改为「调度历史」并加 kind 切换 tab（或复制一份新建「订阅历史」页 filter kind=report_subscribe）
5. 完成。**不动表结构、不动 engine。**

## 关键接口清单（预留给后续工程查询）

- `app.scheduler.service.upsert_job(kind, business_id, cron, payload={}, enabled=True) → ScheduledJob`
- `app.scheduler.service.disable_job(job_id)` / `enable_job(job_id)`
- `app.scheduler.engine.run_job_now(job_id, triggered_by)` — 同步立即跑（也用于"立即拉取"按钮）
- `app.scheduler.engine.reload_all_jobs()` — 应用启动时 + datasources CRUD 后调用
- `GET /api/v1/job-runs?kind=&business_id=&status=&limit=` — 通用历史列表

## 相关文件位置（写完后即视为权威）

- 决策本文件：`memory/hr_portal_scheduler_design.md`
- 代码：`hr-portal/backend/app/scheduler/`
- migration：`hr-portal/backend/alembic/versions/0006_scheduler.py`
- 索引：[[hr-portal-memory-index]] 中 MEMORY.md 必须包含本文件链接
