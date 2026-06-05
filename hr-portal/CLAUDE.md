# HR Portal 项目级规则

## 强制 SOP：新增菜单页面（三级菜单结构）

> **菜单层级**：tab（一级，顶部）→ group（二级，左侧分组）→ leaf（三级，左侧叶子，对应实际页面）。
> 新页面落在第三级。

当用户提出**新加页面 / 新加菜单 / 新加功能模块**类需求时，必须按以下 5 步顺序执行。
任何一步遗漏都会导致：权限矩阵不显示 / 路由 404 / 按钮无权限控制。

### 第 1 步：创建 Vue 文件

- 路径约定：`frontend/src/views/<分组>/<PascalName>.vue`
- 分组与菜单 code 第一段对应（system / datasource / data / report）
- 页面整体用 `<el-card>` 包裹，外层 `<div style="padding: 24px">`
- 卡片头放标题 + 主操作按钮（飞书风）
- **所有交互按钮必须套 `<PermissionButton>`**：

  ```vue
  <PermissionButton menu="<完整 code>" op="C|U|D|E|V">按钮文字</PermissionButton>
  ```

- op 语义：V=查看 / C=新增 / U=修改 / D=删除 / E=导出
- 表格必须按 [设计规范](frontend/docs/design-system.md) 的「表格规范」五件套实现
- **新页面参考模板**：[Users.vue](frontend/src/views/system/Users.vue)（直接复制改造）

### 第 2 步：注册前端路由

文件：`frontend/src/router/index.ts`

- path 与菜单层级对应（如 `/datasource/sync-log`）
- `meta.menuCode` 必须**逐字符等于**第 3 步 MENU_TREE 里的 code
- 组件用 `() => import(...)` 懒加载

### 第 3 步：注册后端菜单（三级结构）

文件：`backend/app/seed.py` → `MENU_TREE`

确定要加在哪个**二级分组**下：

- 系统设置 / 权限管理（`system.auth`）：用户权限相关
- 系统设置 / ��据接入（`system.datasource`）：数据源、表关联、数据视图
- 报表管理（`report`）：报表

在对应分组的 `children` 数组追加 dict：

- `code` 命名规则：`<父级前缀>.<snake_case 子名>`
- **code 一旦投产永不修改**——修改会让所有已配权限失效
- label 想改随时改

### 第 4 步：重启后端

```bash
docker compose restart backend
```

seed 幂等执行：已存在菜单不动，仅 INSERT 新菜单。**不会自动删除被移除的菜单**——如确需删菜单先和用户确认。

### 第 5 步：引导用户配权限

**不要自己改 SQL 配权限**，话术：
> 请打开「系统设置 → 权限管理 → 角色配置 → 编辑 XX 角色」，矩阵里会自动出现新菜单「<label>」，勾选「可访问」→ 选数据范围 → 勾选 C/U/D/E 操作权限 → 保存。

### 完工自查清单（必须输出给用户）

- [ ] 路由 `meta.menuCode` === MENU_TREE 中的 `code`
- [ ] 页面所有按钮已套 `PermissionButton`
- [ ] 后端已重启，`curl /api/v1/menus` 能查到新 code
- [ ] 角色配置页矩阵能看到新菜单行（深度 ≥ 2 即叶子，可勾选可访问 + 操作权限）

---

## 项目结构速查

- 后端：`hr-portal/backend/`（FastAPI + SQLAlchemy async + Alembic）
- 前端：`hr-portal/frontend/`（Vue 3 + Vite + Element Plus + Pinia）
- 启动：项目根目录 `docker compose up -d`
- 入口：<http://localhost:8080/>  默认账号 admin / Admin@2026

## 重要约束

- 数据范围（scope_dimension）字段已在 `role_menus` 表预留，但 Phase 4 之前不做实际过滤
- 五件套操作权限（V/C/U/D/E）暂不扩展，遇到工作流按钮（提交/退回/转交）先和用户确认方案（详见 [memory/hr_portal_menu_actions_upgrade.md](memory/hr_portal_menu_actions_upgrade.md)）
- 任何破坏性变更（drop table / 改 code）必须先和用户确认

---

## 前端组件化原则（违反 = 必返工）

> 所有前端功能开发必须以「高组件化」思维拆分，禁止把多个功能块写在同一个大 `.vue` 文件里。

### 拆分规则

- **一个组件只管一件事**：一个功能块 = 一个 `.vue` 文件
- **共享组件放 `src/components/`**：跨页面复用的组件必须抽到此目录，不能在页面文件里重复实现
- **页面文件只做组装**：`src/views/` 下的页面文件只负责持有状态、组合组件，不写业务 UI 细节
- **通信用 v-model**：组件对外用 `v-model` 暴露自己管的那块状态，父级持有完整 form

### 报表模块组件清单（标准范例）

报表功能被拆为以下小组件，全部位于 `src/components/report/`：

| 组件 | 职责 |
| --- | --- |
| `ReportBasicInfo.vue` | 报表名、描述、数据来源、发布状态 |
| `ReportFieldPicker.vue` | 可选字段 / 已选字段 双栏选择器 |
| `ReportFilterList.vue` | 筛选条件列表（含下拉候选值逻辑） |
| `ReportSortList.vue` | 排序规则列表 |
| `ReportValueRules.vue` | 数值拆分规则（仅数据集模式） |
| `ReportTransposeConfig.vue` | 转置 / 重映射配置 |
| `ReportAggregateConfig.vue` | 聚合汇总（维度分组 + 度量汇总方式） |
| `ReportRoundingConfig.vue` | 余差收口规则 |
| `ReportPreviewTable.vue` | 预览结果表格 |
| `ReportViewerPanel.vue` | 运行、表格展示、导出、分页 |

页面文件（`ReportDesigner.vue` / `CostAllocationDesigner.vue`）按需组合上述组件，不重复实现。

### 新功能开发时的自查

写新页面前必须先回答：

1. 这个功能块，其他页面将来会不会也用到？ → 是则抽到 `components/`
2. 这个 `.vue` 文件超过 200 行了吗？ → 是则继续拆

---

## 前端规范（违反 = 必返工）

> 完整规范见 [frontend/docs/design-system.md](hr-portal/frontend/docs/design-system.md)。
> 以下是必守底线，AI 写代码前必须熟悉。

### 视觉风格

**飞书风**（v2.0，2026-05-23 重构）：

- 主色 `#3370ff` 飞书蓝
- 灰底页面 `#f4f6f9` + 白色 `<el-card>` 内容块
- 字体走系统默认 sans-serif
- 三层菜单：顶部 tab → 左侧二级分组 → 左侧三级叶子

### 表格五件套（写新页面时必须严格按此实现）

```vue
<div style="overflow-x: auto">
  <el-table
    :data="list"
    stripe
    style="width: 100%"
    max-height="600"
  >
    <el-table-column prop="xxx" label="..." min-width="120" />
    <el-table-column label="操作" width="280" fixed="right">
      <template #default="{ row }">
        <PermissionButton menu="..." op="U" size="small">编辑</PermissionButton>
        ...
      </template>
    </el-table-column>
  </el-table>
</div>
```

**五个不能省的关键点**：

1. 外层 `<div style="overflow-x: auto">`
2. el-table `style="width: 100%"`
3. el-table `max-height="600"` —— **关键，让 EP 创建独立 body-wrapper 激活 fixed-right**
4. 数据列用 `min-width`，不要 `width`
5. 操作列 `width="280" fixed="right"`，按钮 ≤ 3 个；超 3 个改下拉

### 反面案例（已踩坑，禁止重现）

❌ 写自己的 `.hp-table-wrap` + `position: sticky` 自实现固定列 → 破坏 EP table layout
❌ 没设 `max-height` → fixed-right 失效降级为普通列
❌ 数据列硬写 `width="160"` → 窄屏挤压
❌ 外层 div + el-table 都做横向滚动 → 表头表体不同步

### PermissionButton 用法

```vue
<PermissionButton menu="system.users" op="C" type="primary" @click="...">
  <el-icon><Plus /></el-icon>新建用户
</PermissionButton>
```

- **不接受 `:icon` prop**，图标用 slot 内的 `<el-icon>`
- 无权限默认隐藏，`mode="disable"` 改为置灰

---

## 数据层规范（C1 动态列，违反 = 必返工）

> 详见 [hr-portal/docs/phase4-data-layer.md](docs/phase4-data-layer.md) 与 [memory/hr_portal_system.md](../memory/hr_portal_system.md) 「数据层架构」。

### 黄金法则

**5 张业务表的物理 schema 已经锁死，永远不要给它们加业务列。**

```sql
-- 5 张业务表的统一 schema，仅此而已：
id          BIGSERIAL  PK
pk_hash     VARCHAR(64) UNIQUE  -- 业务主键 hash
raw         JSONB                -- 整行源数据
synced_at   TIMESTAMPTZ
```

### 字段如何添加 / 修改 / 删除

| 场景 | 做法 |
|---|---|
| 源端新加字段 | 同步时**自动注册**到 `table_columns`；管理员到 `/system/field-columns` 改中文名 |
| 字段改名 / 改类型 / 改顺序 / 标敏感 | 进 `/system/field-columns` 改，**不要改代码** |
| 业务主键变更 | 进 `/system/field-columns` 把新 PK 列勾上 `is_pk_part`，下次同步自动按新 PK 算 hash |
| 手动加字段（源端没有） | `/system/field-columns` 点「新增字段」 |

### 写代码时的禁忌

❌ 不要给业务表 ORM 模型加任何业务字段（如 `employee_id` `period_ym` `cc_code`）—— 全部进 raw
❌ 不要在 sync_service 里写"字段映射字典"硬编码字段名 —— 让 `_ensure_columns()` 自动发现
❌ 不要在 query API 里写 `SELECT employee_id FROM ...` —— 用 `raw->>'字段名'` 按 `table_columns` 元数据动态展开
❌ 不要写新 migration 给业务表加列 —— 只 migration 加新业务表/新元数据列

### 数据查询正确写法

```python
# 后端：data/router.py
visible_cols = await _get_columns(table, db, only_visible=True)
rows = await db.execute(select(Model))  # 只选 raw + synced_at
items = [{c.column_code: r.raw.get(c.column_code) for c in visible_cols} | {"_id": r.id} for r in rows]
```

```vue
<!-- 前端：DataTableView.vue，按 columns 动态 v-for -->
<el-table-column v-for="col in columns" :key="col.code" :label="col.label" :prop="col.code">
  <template #default="{ row }">
    <span v-if="col.is_sensitive">▘▘▘▘▘</span>
    <span v-else>{{ formatCell(row, col) }}</span>
  </template>
</el-table-column>
```

### 接入新数据源类型

新接入飞书 / 企微 / SAP 这类新源端：

1. `frontend/src/config/dataSources.ts` 加一项 SOURCE_TYPES（字段定义）
2. `backend/app/datasources/beisen_client.py`（或新建专用文件）加一个 Client 类，实现 `get_token()` 和 `fetch()` 或 `get_grid_data()`
3. `make_client()` 工厂注册新 source_type
4. **不需要碰**：业务表 schema、`sync_service._dynamic_upsert`、`data/router.py`、前端 DataTableView

---

## 调度系统规范（组件化，违反 = 必返工）

> 详见 [memory/hr_portal_scheduler_design.md](../memory/hr_portal_scheduler_design.md) — 决策依据 + 表结构 + 预留接口

### 调度黄金法则

**所有需要按时间触发的任务（数据同步、报表订阅推送、消息推送、报告推送 等）都走同一套 `scheduled_jobs` + `job_runs` + `JOB_HANDLERS`。**
**任何场景都不要新建独立 scheduler、不要建独立历史表。**

### 表结构（已锁死，永远不要动）

```sql
scheduled_jobs (id, kind, business_id, cron, payload JSONB, enabled, last_run_at/status/message)
  UNIQUE (kind, business_id)
job_runs (id, job_id, kind, business_id, started/finished, status, rows, message, triggered_by, payload_snapshot)
```

### 加新调度场景的 5 步 SOP

未来要加"报表订阅推送"或"消息推送"等场景时：

1. 写 handler：`app/scheduler/handlers.py` 加 `async def _handler_<kind>(job, db, triggered_by) -> tuple[int, str]`
2. 注册：`JOB_HANDLERS["<kind>"] = _handler_<kind>`
3. 在业务 CRUD 保存时调 `scheduler.service.upsert_job(kind="<kind>", business_id=..., cron=..., payload=...)`
4. 前端做该场景的历史��：复制「同步历史」页改 `kind` filter（或加 tab）
5. 验证完工：登录看「同步历史」能切换 kind 看到新场景的运行历史

### 禁忌（已规约）

❌ 不要给某个新场景单独写一个 scheduler / cron loop / asyncio task
❌ 不要给某个新场景单独建历史表（如 `report_send_runs` `notification_runs`）
❌ 不要在 handler 里手动写事务和落历史 —— engine.run_job_now 已统一封装
❌ 不要在 `scheduled_jobs.kind` 字段里塞业务参数 —— kind 是稳定类别，参数走 `payload`

### 关键接口（写代码前查）

- `app.scheduler.service.upsert_job(kind, business_id, cron, payload={}, enabled=True)` — 业务 CRUD 调
- `app.scheduler.service.disable_job(job_id)` / `enable_job(job_id)`
- `app.scheduler.engine.run_job_now(job_id, triggered_by)` — 手动触发也走这个
- `app.scheduler.engine.reload_all_jobs()` — 应用启动 + jobs 表变更后调
- `GET /api/v1/job-runs?kind=&business_id=&status=&limit=` — 通用历史查询
