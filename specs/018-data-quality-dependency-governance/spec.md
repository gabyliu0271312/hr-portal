# 数据质量依赖校验与同步后质量状态传播

## 1. 需求描述
### 1.1 背景
系统已有“数据仓库 → 数据治理 → 数据质量”入口、质量规则、手动执行接口和通用 `ScheduledJob`，但尚未形成源表同步到数据集关系再到报表的闭环。现有 `quality_run` handler 调用质量引擎参数不符合执行契约，且未持久化与手动执行一致的运行结果；`referential_integrity`、`custom_sql` 也尚不可执行。

历史案例中，`reports.id=17` 使用 `dataset_id=15`，关系 `id=251` 声明 `N:1`，但 `dwd_annual_bonus_estimate_factor` 在 `202607 + 001046015019` 存在两条记录，实际成为 `N:2`，导致社保公积金四类字段被放大；`202607 + 001046015020` 又存在缺失系数。此类问题应在同步完成后自动发现。

### 1.2 目标
- 修复质量定时任务，使手动、定时、同步后执行共用同一服务。
- 复用现有质量入口和通用调度，不新增独立调度中心。
- 建立 `table + period → dataset → relation → report` 反向依赖。
- 增加 `1:1`、`N:1` 关系基数与关联完整性检查。
- 按表、关系、数据集、报表和期间存储质量状态。
- 只检查受影响关系，报表运行时只读取状态。
- 保存脱敏计数和哈希键样例，不输出敏感明细。

### 1.3 非目标
- 不直接给业务表添加全局唯一约束。
- 不自动删除或覆盖重复系数记录。
- 不把规则写死在单个报表。
- 不在每次报表查询/导出时扫描底层关系。
- 不新建第二套调度、告警或质量菜单。

## 2. 用户场景
| 角色 | 入口/操作 | 成功反馈 | 失败/空态/无权限 |
|---|---|---|---|
| 数据治理管理员 | 质量页新建关系规则 | 显示左右表、连接键、基数和影响报表数 | 元数据不完整、关系不存在或无权限时阻止保存 |
| 数据治理管理员 | 行内定时配置 | 复用现有计划弹窗，按 `(kind,business_id)` 幂等保存 | 保存失败保留当前值并提示 |
| 系统 | 同步成功 | 标记 `table+period` dirty，异步检查受影响关系，状态 pending→结果 | 同步失败不检查；任务失败写历史并可重试 |
| 报表使用者 | 刷新/导出 | passed正常；warning允许运行并提示 | pending提示检查中；failed/block按策略禁止运行/导出 |

## 3. 功能范围
| 功能项 | 本期 | 说明 |
|---|---|---|
| 修复质量定时任务 | 是 | 统一执行服务和结果落库 |
| 关系基数校验 | 是 | 右侧重复、左侧缺失、实际基数 |
| 同步后异步触发 | 是 | 复用同步成功事件/任务队列 |
| 反向依赖索引 | 是 | 从现有 dataset/relation/report 元数据派生 |
| 按期间质量状态 | 是 | 表、关系、数据集、报表 |
| 报表运行前轻量门禁 | 是 | 只读状态表 |
| UI增强 | 是 | 在现有质量页内完成 |
| 真实通知发送 | 条件实现 | 复用现有通知基础设施；未就绪时只发事件 |
| 自动修复/全局唯一约束 | 否 | 另立业务决策和变更 |

## 4. 技术设计
### 4.1 现状梳理
- `frontend/src/views/warehouse/WarehouseQuality.vue` 已有规则列表、手动运行、历史、告警和 `ScheduleConfigDialog`。
- `frontend/src/components/common/ScheduleConfigDialog.vue` 已复用 `kind`、`business_id` 和通用调度 API。
- `backend/app/warehouse/models.py` 已有 `WarehouseQualityRule`、`WarehouseQualityRun`、`WarehouseAlertRule`。
- `backend/app/warehouse/quality_engine.py` 仅执行 `not_null`、`unique`、`enum`、`date_format`。
- `backend/app/scheduler/handlers.py` 的 `_handler_quality_run` 只调用 `execute_quality_rule(rule_id, db)`，没有统一落库/传播。
- `sync_to_table` 成功后已发布同步完成和数据变更事件，可作为触发点。
- `dataset_tables`、`dataset_relations`、`reports.dataset_id` 已是依赖事实来源。

### 4.2 依赖图
```text
source/DWD table + period
  → dataset_tables / dataset_relations
  → dataset
  → reports.dataset_id
```
反向查询：`table_name + period → affected dataset_ids → relation_ids → report_ids`。索引从事实表派生，必须支持全量重建和漂移检测。

### 4.3 数据模型
新增 `warehouse_quality_status`：

| 字段 | 说明 |
|---|---|
| `asset_type` | `table/relation/dataset/report` |
| `asset_id` / `asset_code` | 资产标识，表使用名称，其余使用 ID |
| `period` | 期间；非期间表可为空 |
| `status` | `pending/passed/warning/failed` |
| `severity` | `info/warn/block` |
| `source_sync_batch_id` | 同步批次追溯 |
| `checked_at` | 完成时间 |
| `duplicate_key_count` / `missing_key_count` | 诊断计数，默认0 |
| `checked_count` / `failed_count` | 扫描统计，默认0 |
| `sample_key_hashes` | JSON 数组，固定上限 |
| `message` | 脱敏摘要 |

唯一键：`asset_type + asset_id/asset_code + period`；同批次重复执行必须 upsert。

可选新增 `warehouse_quality_dependency_index`，记录 `table_name,dataset_id,relation_id,report_id,period_column,dependency_version,updated_at`，用于大规模反查；必须有重建接口，不能成为不可校验的第二事实源。

`warehouse_quality_runs` 增加 `period`、`source_sync_batch_id`、`asset_type`、`asset_id`、`severity`、重复/缺失计数、哈希样例、`triggered_by`、`dedupe_key`。旧历史记录按 `period=NULL` 兼容展示。

Migration 要求：先兼容旧数据，再收紧约束；保留历史；upgrade/downgrade 可演练；Alembic 只能有一个 head。

### 4.4 关系校验算法
1. 只从数据集关系元数据解析表、字段、键和基数，动态 SQL 标识符使用白名单。
2. 仅检查受影响期间；无法确定期间时进入 pending，不默认全表扫描。
3. 右表按右键分组，统计 `count(*)>1` 的重复键。
4. 左表左连接右表，统计匹配数为0的缺失键。
5. `1:1` 两侧键都不得重复；`N:1` 右键不得重复，缺失按规则判定 warning/block。
6. 只保存不可逆哈希组合键样例，禁止原键、金额和人员明文。
7. 关系→数据集→报表聚合传播。

本案例中 `202607+001046015019` 应报告重复右键并按 block 处理；`202607+001046015020` 应报告缺失匹配。`cost_center` 是否属于真实业务键必须由业务确认，系统不得擅自改变关系。

### 4.5 执行链路与性能
```text
同步成功提交
  → 记录 batch/period
  → table+period dirty
  → 反向依赖查询
  → relation pending
  → 异步检查一次
  → 写 relation 状态
  → 聚合 dataset
  → 扇出 report
```
同一 `table+period+batch+relation` 单飞；只处理受影响期间；异步队列与同步解耦；报表刷新只查询状态表。即使一表影响20个数据集、100张报表，也按关系边校验一次、按状态扇出，不按报表执行100次扫描。

### 4.6 共享质量运行服务
实现 `run_quality_rule(rule_id, period, source_sync_batch_id, triggered_by, user_context)`，负责加载规则、执行引擎、写 `warehouse_quality_runs`、更新规则状态、upsert资产状态、发布质量事件。手动 API、`quality_run` handler、同步后任务必须调用它。handler 不自行 commit、不直发通知。

### 4.7 状态聚合与报表门禁
- 任一 `failed+block` → dataset/report `failed`。
- 无阻断失败但有 warning → `warning`。
- 有 pending 且无失败 → `pending`。
- 全部通过 → `passed`。

报表 API 在构造查询前读取 `report_quality_status(report_id,period)`；缺失状态不能静默当作通过。默认 `failed/block` 禁止导出，`warning` 可运行并显示提示，`pending` 提示校验中。


Quality gate action policy (`action=run|export`): `passed` allows run/export; `warning` allows run/export and returns a risk notice; `failed+block` blocks run/export; `failed+warn` allows run/export and returns a risk notice; `pending` allows run with a checking notice but blocks export. Missing quality state or unavailable state service fails closed for both actions.
### 4.8 后端接口
| Method | URL | 用途 | 权限 |
|---|---|---|---|
| POST | `/api/v1/warehouse/quality-rules` | 创建/配置规则 | `warehouse.governance:create` |
| PATCH | `/api/v1/warehouse/quality-rules/{id}` | 修改规则 | `warehouse.governance:edit` |
| POST | `/api/v1/warehouse/quality-rules/{id}/run` | 手动运行，可传期间 | `warehouse.governance:run` |
| GET | `/api/v1/warehouse/quality-status` | 查询资产/期间状态 | 资产查看权限 |
| GET | `/api/v1/warehouse/quality-status/impact` | 查询影响范围 | `warehouse.governance:read` |
| POST | `/api/v1/warehouse/quality-status/rebuild-index` | 重建依赖索引 | `warehouse.governance:admin` |

请求示例：`{"period":"202607","source_sync_batch_id":"sync-...","force":false}`。响应只含状态、时间、计数、关系/资产 ID、哈希样例。错误码：`QUALITY_RULE_NOT_FOUND`、`QUALITY_RELATION_NOT_FOUND`、`QUALITY_INVALID_CONFIG`、`QUALITY_PERIOD_REQUIRED`、`QUALITY_ALREADY_RUNNING`、`QUALITY_PERMISSION_DENIED`。

### 4.9 权限、安全与外部系统
质量规则管理、运行、查看和阻断策略分离授权；超级管理员也必须走统一权限上下文。表名/字段名只能来自服务端元数据，值必须绑定参数。日志、接口、告警均脱敏。告警通过既有事件/通知基础设施异步发送，质量结果不能因通知失败回滚。

## 5. 假设与待确认事项
1. 同步成功事件可补充稳定 `sync_batch_id` 和期间，否则从 `sync_runs`/sink 结果补齐。
2. 期间字段映射可由关系规则明确声明。
3. 业务需决定 `month_to_rename+factor_code` 是否唯一，或 `cost_center` 是否加入关系键。
4. 报表默认 failed/block 禁止导出，warning 允许查看。
5. 告警通知能力可能尚未完成，先保证质量事件和历史可查。

## 6. 交付说明模板
- 完成任务：列出 `X18xx` 编号和证据。
- 修改文件：按后端、前端、migration、测试分组。
- 测试命令与结果：记录命令、通过数量、失败摘要。
- UI验证：记录页面、角色、状态截图或录屏。
- 未完成项：明确编号和原因。
- 风险与后续建议：业务键确认、生产灰度、通知基础设施。
