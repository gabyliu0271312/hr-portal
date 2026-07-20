# 手工数据维护、Excel 批量导入与接口同步保护

> 归属：`specs/014-manual-data-import-sync-protection/`
>
> 状态：待评审（第五轮修订：补齐迁移锁、统一人工维护与异步边界）
>
> 最后更新：2026-07-20

## 1. 背景与目标

### 背景

1. 当前 ODS 业务表的接口同步会按本次接口返回的业务主键集合清理孤儿记录：月度表清理当前期间，非月度表清理全表。
2. 业务存在两类人工维护：
   - 接口已有记录，但缺少“顾问组”等业务字段，需批量补充手工字段；
   - 接口完全缺失记录，需补录完整业务行，并避免下次同步误删。
3. 当前已支持单行维护 `auto_discovered=false` 的手工字段，但没有 Excel 批量入口。直接执行生产 SQL 无来源标识、无审计，并会被同步当作孤儿清理。
4. 各表业务主键由字段管理中的 `table_columns.is_pk_part=true` 动态决定；月度表期间字段由既有机制自动纳入主键。本功能不得写死“工号 + 月份”等任意组合。

### 目标

1. 为全部适用的 **ODS 可写物理业务表** 提供统一的“手工导入”基础能力，并通过表级开关控制是否向用户开放。DWD/DWS/ADS、视图、物化视图及不可写派生资产不属于本能力范围。
2. 支持三种 Excel 业务模式：批量新增接口缺失的完整记录、批量补充接口已有记录的手工字段、批量维护已有手工补录记录；不允许 Excel 覆盖接口控制的字段。
3. 区分基础来源、同步保护和手工字段覆盖；接口同步只清理允许清理的接口孤儿记录。
4. 建立可审计的导入批次和逐行变更记录，追溯文件摘要、操作者、前后值、结果和失败原因。
5. 导入后发布标准 `ods_table_data_changed` 事件；在 ODS→DWD 自动化已启用且配置正确时，实际触发并可追踪 DWD 清洗执行结果。
6. 纳管本期已通过 SQL 写入 `emp_monthly_allocation` 的 18 条顾问组记录，避免功能上线前后被同步误删。

### 非目标 / 不做范围

- 不回写北森或其他上游接口。
- 不支持 `.xls`、`.csv`、`.xlsm`、多工作表选择、合并单元格、异构表头、Excel 公式计算、用户自定义列映射。
- 不做通用 ETL、审批流、原始导入文件存储、导入回滚 UI、定时自动导入。
- 不允许导入修改已有接口记录的接口字段；接口字段始终以接口同步结果为准。
- 不关闭现有孤儿清理；只豁免明确受保护的手工补录记录。
- 不承诺刷新 ADS。正确链路为 **ODS → DWD → DWS / ADS**；本期验收至 DWD，DWS/ADS 是否继续刷新取决于既有级联配置。

## 2. 设计冻结前置条件

G01、G02、G03、G05 必须在开发开始前确认并记录，未通过不得进入编码阶段；G04 须先在开发/测试环境完成可验证链路，生产条件作为上线 Gate，必须在生产发布前通过。

| Gate | 必须确认的事实 | 通过标准 |
|---|---|---|
| G01 主键粒度 | 每张拟开启导入的表，其字段主键与真实业务唯一粒度一致 | 管理员确认 `is_pk_part`；若同员工同月可多编码/维度，则相应字段已纳入主键并完成历史冲突处理 |
| G02 写入授权 | 每张拟开启导入的表可在写入前从规范化行解析数据范围 | 已配置并验证 scope 字段；无法解析的表仅超级管理员可导入 |
| G03 全局结构 | 所有符合条件的 ODS 可写物理表、未来新建表与重建表均可拥有系统列 | 已盘点 `warehouse_layer='ODS'`、已注册、可写物理表、非视图/物化视图、具备业务实体列的对象，以及动态加载、DDL、重建脚本和历史 `raw` 兼容状态 |
| G04 DWD 自动化 | 开发环境可验证 ODS→DWD 异步链路；生产链路在上线前已可执行 | 开发/测试阶段具备可验证的 Feature Flag、规则和配置；生产上线 Gate 必须满足 `WAREHOUSE_FEATURE_ODS_DWD_AUTOMATION=true`、系统自动化规则启用，ODS→DWD 配置、目标资产、主键和规则均有效 |
| G05 依赖与安全 | 生产镜像支持安全解析 XLSX | `openpyxl` 已在运行依赖中；完成 ZIP/公式/外链/宏检测技术验证 |

## 3. 关键业务规则

### 3.1 主键规则

1. 每张表均通过当前 `table_columns.is_pk_part=true` 列表计算业务主键和 `pk_hash`；必须复用 `_get_pk_columns`、`_calc_pk_hash`。
2. 月度表继续复用既有期间主键收口逻辑；导入服务不得自行拼接期间字段。
3. 模板记录字段元数据版本和主键列清单；主键配置或字段元数据变化后，旧模板一律拒绝，必须重新下载。
4. `emp_monthly_allocation` 是否允许同员工同月存在多编码/多维度记录，完全由管理员配置的主键字段决定；本功能不猜测业务粒度。
5. **主键配置变更采用方案 B（自动全量主键迁移）**：当前代码允许管理员直接修改 `is_pk_part`，但不会重算既有行 `pk_hash`。本功能必须补齐自动迁移：管理员点击保存主键配置后，系统基于拟变更后的字段集合预检、计算全表新 `pk_hash` 并检测冲突。无冲突时，在单一数据库事务内按“两阶段临时 hash”算法迁移：先将所有待迁移行更新为仅本次迁移可见、长度符合 `pk_hash` 列限制且不会与真实 hash 冲突的临时唯一值（由 `migration_id + row_id` 生成），再批量更新为最终新 hash，最后切换字段元数据并记录审计；不得逐行直接 `UPDATE pk_hash = new_hash`。ODS 提交后异步触发受影响 DWD 全量重建/刷新，不得把 DWD 运行塞入 ODS 事务。
6. 有数据的表修改 `is_pk_part` 时，不允许直接写入字段元数据。保存请求即代表同意系统自动执行预检和全量迁移：无冲突则自动完成并返回迁移条数；有冲突则拒绝整个变更并返回冲突组、涉及行数与样例，元数据和 ODS 数据均保持原状。空表可直接修改。
7. 主键迁移期间必须启用表级维护锁，见 §3.5；锁未解除前禁止任何改变该表业务数据或字段元数据的操作。

### 3.2 数据状态与同步规则

每一业务行使用下列系统状态表达来源和覆盖关系：

| `base_source` | `sync_protected` | `has_manual_overlay` | 页面标签 | 含义 |
| --- | ---: | ---: | --- | --- |
| `api` | 否 | 否 | 接口 | 纯接口记录，按现有规则清理孤儿 |
| `api` | 否 | 是 | 接口 + 手工补充 | 接口字段刷新，手工字段保留；接口缺失时仍可清理 |
| `manual` | 是 | 可为是 | 手工补录 | 接口缺失时新增的整行记录，不参与孤儿清理 |
| `api` | 是 | 是 | 手工补录（接口已命中） | 接口已返回同主键，但业务仍要求保留人工兜底保护 |

规则：

1. 手工字段仅指 `auto_discovered=false` 且非计算字段的业务字段。
2. `manual_overlay_fields` 是接口同步不得覆盖的**手工字段编码**数组；它是字段级覆盖保护的唯一事实来源，`has_manual_overlay` 必须严格由该数组是否为空推导，禁止各入口单独赋值。
3. 手工字段补充模式命中接口记录时，仅更新实际填写或显式清空的手工字段；无论填写值还是填写 `__CLEAR__`，对应字段编码均加入并保留在 `manual_overlay_fields`，基础来源保持 `api`，整行不保护。显式清空是人工覆盖为 `NULL`，不是取消人工覆盖。
4. `create` 新增纯手工行时，仅将实际填写的手工字段写入 `manual_overlay_fields`；接口字段即使在模板中填写，也不加入该数组。纯手工行维护接口字段时同样不加入该数组，因此后续接口首次命中可用接口值接管这些接口字段。
5. 接口同步命中 `manual + sync_protected` 行时：接口字段按接口值刷新，`manual_overlay_fields` 中列出的手工字段保留；`base_source` 改为 `api`，**`sync_protected` 保持 true**。接口一次命中不代表接口已稳定具备该数据能力。
6. 接口已接管但仍受保护的行，只能通过人工入口写入或清空手工字段，并同步维护 `manual_overlay_fields`。
7. 受保护行绝不因接口同步孤儿清理被删除。二期另行提供“解除同步保护 / 转为完全接口管理”。
8. 接口同步不得修改 `manual_created_*`，也不得修改 `manual_overlay_fields` 或其推导出的 `has_manual_overlay`。

### 3.3 表级导入开关

1. `registered_tables.manual_import_enabled` 默认 `false`。
2. **数据表能力预检**：管理员开启开关前，系统必须验证目标为 ODS 可写物理表、存在至少一个业务主键且主键均有物理列、字段元数据与物理列一致；`create` 必填字段规则完整；`overlay` 至少有一个可维护手工字段；scope 写入规则可判定或仅超级管理员可用。任一项不满足时，开关置灰并返回具体阻断原因。
3. **手工补录必填字段**：在 `table_columns` 增加 `is_required_for_manual_create BOOLEAN NOT NULL DEFAULT false`。主键始终必填；`create` 额外校验该标记字段。`overlay` / `manual_update` 不受该标记约束。该配置由字段管理维护，并进入模板说明与版本摘要。
4. `manual_update` 模板中的业务必填列允许留空，含义为“不修改”；若填写 `__CLEAR__` 清空数据库或业务规则不允许为空的字段，整批拒绝。`create` 的必填校验必须在默认值、lookup 和期间规范化完成后执行，以免误拒绝可由系统补齐的字段。
5. 开关为 `true` 时，表才展示“手工导入”入口、允许下载模板和提交导入。
6. 开关为 `false` 时，前端隐藏入口；后端返回 `409：该表未启用手工导入`。
7. 开关只控制产品开放面，不影响全局系统列、接口同步、既有手工记录保护和审计。
8. 开关由拥有既有数据表管理更新权限的管理员维护；变更写入系统操作日志。

### 3.4 三种导入模式

为消除“同一模板既可新增又可补字段”的歧义，必须提供三套独立模板和导入模式。

| 模式 | 模板 | 用途 | 可写字段 | 同主键存在时 |
| --- | --- | --- | --- | --- |
| `create` | 手工补录模板 | 接口完全缺失的完整记录 | 主键 + 允许导入的接口字段 + 手工字段 | 命中任意已有行均失败，禁止静默覆盖 |
| `overlay` | 手工字段补充模板 | 为已有接口记录批量补字段 | 主键 + 手工字段 | 必须命中 `base_source='api'` 的记录；只更新手工字段 |
| `manual_update` | 手工补录维护模板 | 修改已有手工补录或受保护记录 | 主键 + 允许维护字段 | 必须命中 `base_source='manual'` 或 `sync_protected=true` 的记录 |

补充规则：

- `create` 不允许空缺主键；接口字段按表元数据的必填规则校验。
- `overlay` 找不到接口记录、命中手工记录、填写接口字段或填写不存在的手工字段时，整批失败。
- 三种模式均采用字段写入掩码：Excel 空白表示“不修改该字段”；`__CLEAR__` 表示显式清空。手工字段可按字段级人工覆盖规则清空；纯手工行允许清空其允许为空的接口字段；接口已接管保护行和普通接口行不得通过 `__CLEAR__` 清空接口字段。数值 `0`、布尔 `false` 与空白严格区分。
- `manual_update` 只允许修改模板列中的允许维护字段；不得修改 `pk_hash` 或通过修改主键字段改变业务主键。若要变更主键，必须走 §3.1 的主键迁移流程。
- `manual_update` 模板必须包含纯手工补录行理论可维护的全部业务字段，包括接口字段与手工字段；排除系统列、主键、计算字段、高敏字段和 `raw`。模板不因目标行来源而动态变化。
- `manual_update` 模式按记录状态使用不同的接口字段规则：

| 目标记录状态 | 接口字段填写值 | 接口字段 `__CLEAR__` | 手工字段填写值 / `__CLEAR__` |
| --- | --- | --- | --- |
| `base_source='manual'` | 允许 | 字段允许为空时允许；不进入 `manual_overlay_fields` | 允许；填写值或 `__CLEAR__` 均保持字段级人工覆盖 |
| `base_source='api' AND sync_protected=true` | 拒绝 | 拒绝 | 允许；填写值或 `__CLEAR__` 均保持字段级人工覆盖 |
| 普通接口行 | 拒绝 | 拒绝 | `manual_update` 不允许命中；应使用 `overlay` |

- 服务端必须按上表返回行号、字段和原因；前端下载/使用模板时必须提示接口已接管保护行的限制。
- `manual_overlay_fields` 仅保存实际人工覆盖的手工字段编码。填写值或填写 `__CLEAR__` 均表示建立/保持该字段的人工覆盖，字段编码必须加入并保留在数组中；`__CLEAR__` 将业务值置为 `NULL`，但不移除字段编码。字段覆盖只能由二期“解除字段人工覆盖”操作移除；数组为空时 `has_manual_overlay=false`，非空时为 `true`。

### 3.5 主键迁移维护锁

在 `registered_tables` 增加：`key_migration_status`（`idle` / `preparing` / `migrating` / `refreshing_dwd` / `failed`）、`key_migration_id`、`key_migration_started_at`、`key_migration_error`。

| 表状态 | 接口同步 / Excel 导入 / 单行编辑 / 批量更新 / 删除 / 字段编辑 | 查询 / 导出 |
| --- | --- | --- |
| `idle` | 正常执行 | 正常执行 |
| `preparing` / `migrating` / `refreshing_dwd` | 返回 `409：该表正在迁移主键`；同步任务可进入受控待执行队列，不得并发写入 | 允许读取；页面展示“主键迁移中”提示 |
| `failed` | 返回 409 并提示迁移失败原因，需管理员处理后恢复 | 允许读取；页面展示“主键迁移失败”提示 |

锁规则：

1. 迁移开始前以事务/行锁将状态从 `idle` 切为 `preparing`，同一表同时只能有一个迁移任务。
2. ODS `pk_hash` 两阶段迁移与字段元数据切换完成后，状态变为 `refreshing_dwd`；DWD 重建通过 outbox 异步执行。
3. DWD `success` 后置为 `idle` 并解除写入锁；DWD `skipped`、`failed` 或 `event_failed` 均置为 `failed` 并保持写入锁，ODS 新主键保持有效，不回滚已成功迁移。管理员必须修复 DWD 配置后按本节重试规则重新触发下游刷新。
4. 仅当 `key_migration_status='failed'`、ODS 已成功提交且用户具备字段管理更新权限时，允许调用 `POST /data/{table}/primary-key-migrations/{migration_id}/retry-dwd`。请求受理后状态必须从 `failed` 切为 `refreshing_dwd`，并仅新建或重投 `source_type='pk_migration'` 的 outbox 任务，不得再次计算或更新 ODS `pk_hash`；DWD `success` 后才恢复 `idle`，`skipped`、`failed` 或 `event_failed` 则回到 `failed`。
5. 所有写入入口和同步入口均必须在写入前检查此锁，不能只在前端禁用按钮。

### 3.6 文件幂等性

1. 成功批次按 `(table_name, mode, file_sha256)` 识别同内容文件。
2. 同表、同模式、同 SHA-256 已成功导入：拒绝重复提交，返回原 `batch_no`、提交人和提交时间；不得再次发布 ODS 事件或触发 DWD。
3. 同内容文件此前失败：允许重新导入，创建新批次并记录 `retry_of_batch_no`。
4. 内容不同但主键相同的文件，按相应模式的正常规则处理，并创建新审计批次。
5. 对成功批次建立受控唯一约束或等价并发锁，防止两个并发请求重复成功。

## 4. 用户场景

### 4.1 管理员开启导入能力

- **入口：** 系统设置 → 数据表管理 → 编辑表。
- **操作：** 打开“允许手工 Excel 导入”并保存。
- **结果：** 数据表页面出现导入入口；关闭后入口消失，服务端拒绝新导入请求。
- **权限：** 无数据表管理更新权限时不可操作，绕过前端返回 403。

### 4.2 批量新增接口缺失记录

- **入口：** 数据管理 → 已开启导入的表 → 手工导入 → 选择“手工补录模板”。
- **操作：** 下载并填写完整记录，上传后点击“校验并导入”。
- **结果：** 全部校验通过时原子写入 `manual + sync_protected` 行，写入批次和逐行审计，页面显示“手工补录”。
- **失败：** 任何一行主键、类型、范围、字段或模板错误，业务表零写入；返回行号、字段和原因。

### 4.3 批量补充接口已有记录的手工字段

- **入口：** 同上 → 选择“手工字段补充模板”。
- **操作：** 填主键和需维护的手工字段。
- **结果：** 仅更新命中接口行的手工字段，页面显示“接口 + 手工补充”。
- **失败：** 找不到接口行、命中手工行、填写接口字段、范围越权或字段非法时，整批失败。

### 4.4 维护已有手工补录记录

- **入口：** 同上 → 选择“维护已有手工补录模板”。
- **操作：** 填写主键及需要更新的字段；空白不修改，填写 `__CLEAR__` 清空允许清空的字段。
- **结果：** 纯手工补录行可维护全部允许业务字段；接口已命中但仍受保护的行仅维护手工字段；每次变更均写入人工审计和 ODS outbox。
- **失败：** 命中普通接口行、修改主键/计算字段/高敏字段、或表处于主键迁移锁定状态时，整批失败。

### 4.5 接口同步后的状态

- 接口未返回手工补录行：行仍保留。
- 接口未返回普通接口行或接口+手工补充行：仍按既有月度/全表孤儿规则清理。
- 接口返回与手工补录行相同主键：合并为一行，刷新接口字段、保留手工字段和同步保护。

### 4.6 导入后的 ODS→DWD 清洗

- 导入事务提交后，以 transactional outbox 持久化 `ods_table_data_changed` 任务；导入 HTTP 不等待 DWD。
- 后台 worker 消费任务；系统自动化规则、Feature Flag、表级 ODS→DWD 配置和规则均有效时，异步执行 DWD 清洗。
- 前端通过批次查询展示 `pending/running/success/skipped/failed/event_failed` 的真实 DWD 状态，而不是“已请求”或猜测的最近一次执行记录。
- DWD 失败或跳过不回滚成功的 ODS 导入，但必须写入批次审计并明确提示原因。

## 5. 功能范围

| 功能项 | 本期 | 说明 |
| --- | --- | --- |
| 全局 ODS 系统列能力 | 是 | 仅 ODS 可写物理表；既有表、未来新建表、重建表、运行时加载统一支持 |
| 表级手工导入开关 | 是 | 默认关闭，管理员显式开启 |
| 表级维护锁 | 是 | 主键迁移期间阻止同步、导入、编辑、删除和字段写入 |
| 三类固定 XLSX 模板 | 是 | 新增整行 / 补充接口行手工字段 / 维护已有手工补录 |
| 校验后立即提交 | 是 | 单请求完成安全解析、校验、业务表事务写入 |
| 同文件幂等 | 是 | 成功文件拒绝重复，失败文件可重试 |
| 来源标签与同步保护 | 是 | 区分接口、接口+手工补充、手工补录 |
| 导入批次与逐行审计 | 是 | 持久化批次、前后值、错误和 DWD 结果 |
| ODS→DWD 结果化触发 | 是 | 发布标准事件并获得真实执行结果 |
| 18 条历史 SQL 数据纳管 | 是 | 一次性 migration |
| 解除保护 | 否 | 二期 |
| 审计历史与回滚 UI | 否 | 二期；本期仅持久化数据 |
| CSV/XLS、多 Sheet、自定义映射 | 否 | 二期 |
| 自动刷新 DWS/ADS | 否 | 沿用既有级联策略，不作为本期验收 |

## 6. 技术设计

### 6.1 数据库 / 数据模型

#### 6.1.1 `registered_tables` 表级开关

新增：

| 字段 | 类型 | 默认值 | 说明 |
| --- | --- | ---: | --- |
| `manual_import_enabled` | `BOOLEAN NOT NULL` | `false` | 是否允许该表手工 Excel 导入 |
| `key_migration_status` | `VARCHAR(32) NOT NULL` | `'idle'` | `idle` / `preparing` / `migrating` / `refreshing_dwd` / `failed` |
| `key_migration_id` | `VARCHAR(64)` | `NULL` | 当前或最近一次主键迁移标识 |
| `key_migration_started_at` | `TIMESTAMPTZ` | `NULL` | 主键迁移开始时间 |
| `key_migration_error` | `TEXT` | `NULL` | 主键迁移失败原因 |

迁移回填历史表：`manual_import_enabled=false`、`key_migration_status='idle'`；数据表管理 DTO、接口和页面必须支持这些字段；新建业务表注册路径默认写入相同安全值。

#### 6.1.2 全局业务表系统列（方案 A）

对**全部符合以下条件的 ODS 表**增加系统列：`warehouse_layer='ODS'`、已注册、可写物理表、非 view / materialized view、具备业务实体列。同步改造未来 ODS 表 DDL、重建表脚本、动态反射加载、查询、导出、字段发现和测试矩阵。表级开关不能替代全局结构改造。

| 字段 | 类型 | 默认值 | 说明 |
| --- | --- | --- | --- |
| `base_source` | `VARCHAR(16)` | `'api'` | `api` / `manual` |
| `sync_protected` | `BOOLEAN` | `false` | 是否豁免接口孤儿清理 |
| `has_manual_overlay` | `BOOLEAN` | `false` | 是否存在手工字段覆盖 |
| `manual_overlay_fields` | `JSONB` | `'[]'::jsonb` | 实际手工覆盖的字段编码数组 |
| `manual_created_by` | `VARCHAR(128)` | `NULL` | 首次手工补录操作者 |
| `manual_created_at` | `TIMESTAMPTZ` | `NULL` | 首次手工补录时间 |
| `manual_updated_by` | `VARCHAR(128)` | `NULL` | 最近人工维护操作者 |
| `manual_updated_at` | `TIMESTAMPTZ` | `NULL` | 最近人工维护时间 |

约束：

1. Migration 仅对符合以下条件的对象执行：`warehouse_layer='ODS'`、已注册、可写物理表、非 view / materialized view、具备业务实体列。DWD/DWS/ADS、视图、物化视图及派生资产不得添加这些 ODS 治理列。
2. 对符合条件的历史表执行受控标识符校验后的 `ADD COLUMN IF NOT EXISTS`；历史数据回填为 `api / false / false`。
3. 所有创建 **ODS 可写业务表** 的 DDL 构造器和重建脚本都必须内置上述列与索引；未来 ODS 表不得依赖“首次开启导入后补列”。
4. 动态 ORM 模型反射必须可见系统列；但 `table_columns`、字段管理、业务查询字段、普通导出、报表字段和自动发现必须显式排除系统列。
5. 月度 ODS 表创建 `(period_col, sync_protected, base_source)` 索引；非月度 ODS 表创建 `(sync_protected, base_source)` 索引。索引名复用现有受控命名函数。
6. 服务层限制 `base_source` 为 `api/manual`；生产 downgrade 属于破坏性操作，不作为常规回退。

#### 6.1.3 通用人工变更审计与导入批次

**`manual_data_change_audits`：**

| 字段 | 说明 |
| --- | --- |
| `id` / `source_type` / `source_id` | 主键；`manual_import` / `inline_edit` / `bulk_update` / `manual_create` / `bulk_delete` / `pk_migration` 与对应来源标识 |
| `batch_id` / `excel_row_number` | 可空；仅 Excel 导入关联批次并记录 Excel 行号 |
| `table_name` / `record_pk_hash` / `action` | 目标表、规范化业务主键和 `create_manual` / `update_api_overlay` / `update_manual` / `delete_manual` / `rejected` 等动作 |
| `before_values` / `after_values` | 本次涉及的**非敏感**字段 JSON |
| `sensitive_changed_columns` | 发生变化的敏感字段编码数组，不保存原值/新值 |
| `actor` / `created_at` | 操作人和审计时间 |
| `error_code` / `error_message` | 失败原因；仅导入校验失败时有值 |

`manual_import_row_changes` 不再作为独立专用表；改由该通用审计表承载。Excel 导入通过非空 `batch_id/excel_row_number` 关联；页面内联编辑、批量更新、手工新增和删除使用各自 `source_type/source_id`，不得伪造 Excel 批次。

**`manual_import_batches`：**

| 字段 | 说明 |
| --- | --- |
| `id` / `batch_no` | 主键 / 对外批次号 |
| `table_name` / `mode` | 目标表 / `create`、`overlay` 或 `manual_update` |
| `file_name` / `file_sha256` / `file_size` | 追踪文件但不保存原文件 |
| `submitted_by` / `submitted_at` | 操作人和时间 |
| `status` | `validating` / `succeeded` / `failed` |
| `retry_of_batch_no` | 同内容失败文件重试来源 |
| `total_rows` / `created_rows` / `updated_rows` / `overlay_rows` / `failed_rows` | 结果汇总 |
| `error_summary` | 完整错误摘要 JSON |
| `ods_event_id` | 标准事件 ID |
| `automation_execution_ids` | 关联的执行记录 ID 列表 |
| `dwd_trigger_status` / `dwd_trigger_detail` / `dwd_triggered_at` | `pending` / `running` / `success` / `skipped` / `failed` / `event_failed` |

审计规则：

- 所有人工入口的非敏感字段保存 before/after JSON；敏感字段仅保存“字段发生变化”的编码，绝不在审计 JSON 中保存明文或密文值。
- 高敏字段不允许 Excel 导入。
- Excel 业务校验失败时，业务表零写入；失败批次和 `source_type='manual_import'` 的失败行审计以独立事务保存。页面人工操作失败沿用既有错误日志，不创建伪造的变更审计。
- Excel 校验成功时，业务写入、成功批次、通用逐行审计和 outbox 同一事务提交；页面人工操作则将业务写入、通用逐行审计和 outbox 同一事务提交。
- 对成功批次增加 `(table_name, mode, file_sha256)` 的受控唯一约束或等效并发控制；失败批次不受此唯一限制。

#### 6.1.4 手工必填、主键迁移与事件任务模型

1. 在 `table_columns` 增加 `is_required_for_manual_create BOOLEAN NOT NULL DEFAULT false`；主键始终必填，`create` 额外校验该字段。
2. 新增 `primary_key_migrations` 审计表：保存 table、migration_id、旧/新主键字段集合、总行数、冲突组/样例、状态、操作者、开始/结束时间、错误、ODS 提交时间和 DWD 刷新状态。
3. 新增通用 `ods_data_change_outbox`：保存 `source_type`、`source_id`、可空 `batch_id`、table、标准事件 payload、状态、重试次数、锁定信息、最后错误、event ID、创建/处理时间；业务写入、对应审计和 outbox 在同一事务提交。

#### 6.1.5 `ods_data_change_outbox` 字段

| 字段 | 说明 |
| --- | --- |
| `id` / `source_type` / `source_id` | 主键；来源类型 `manual_import` / `inline_edit` / `bulk_update` / `manual_create` / `bulk_delete` / `pk_migration`；对应的导入批次号、编辑请求 ID 或迁移 ID |
| `batch_id` | 可空；仅 Excel 导入时关联 `manual_import_batches` |
| `table_name` / `event_payload` | 目标 ODS 表与标准事件 payload |
| `status` / `retry_count` / `locked_at` / `last_error` | `pending` / `running` / `succeeded` / `failed`、重试和消费状态 |
| `event_id` / `created_at` / `processed_at` | 事件关联和生命周期时间 |

业务数据变更、对应审计与通用 outbox 在同一事务提交。Excel 导入使用 `source_type='manual_import'` 且关联批次；页面人工维护不得伪造导入批次。
4. `primary_key_migrations` 的 ODS hash 迁移临时值不得复用 `ods_data_change_outbox` 或其他技术 ID；必须由迁移 ID 和行 ID 生成，并符合 `pk_hash` 长度、唯一性与不可预测性要求。

#### 6.1.6 历史 SQL 数据纳管

系统列 migration 中，先按下列 `pk_hash` 清单定位候选行，再以业务字段二次校验后更新存在的行；缺失行不得使 migration 失败。二次校验条件为：`cost_period IN ('202601','202602','202603','202604','202605')`、`code='001032008(CXO.009)'`、`dimension_value='顾问组'`，且 `employee_no IN ('106258','106749','107029','107222')`。migration 必须记录候选 hash 命中数、业务字段二次校验通过数、实际标记数和未命中 hash 数；上线验证必须人工核对实际标记数为 18，并核对月份分布：202601=4、202602=4、202603=4、202604=3、202605=3。

```text
0b44ea32c9648bf24c88a786b572f1c0  1775afa8858df15e4550be6cb2c149cb  18d2b84b1dcd307d5a0eb0146f020009
5201e06172d6397c51edd2583eb78708  ce525e5d7beecbdfe9f8353e570c8b63  02db3dc8ea428bb5476726503a1fc28f
33f67c1f6858aba712524aba2a15c762  afaf0b7db3ae6da01640e16274de4510  087650a18b10633e2165a5c030fead73  228d015e8af9f9e0c5f079a957f39e48
dd18775ee66ee718ba76c26a7d7cc5b2  a7f189d0bcc0223acd4c7cb90d8803b0  47f00018cfdbe9d86472c075bc8c4773  bbdeeac774cb875977bfc88433896981
b6bfb32ac98889f43751e6e02992f237  cf0ccb12f2058b71e265ac9a2dc4b5f7  eacbc28fef95c14b69cdf0fa01cbbbbc  5aaf39d3e7a589fe6a8f8d8f5e87facc
```

设置：`base_source='manual'`、`sync_protected=true`；依据该批历史 SQL 的实际人工字段，将 `dimension_value`（顾问组）写入 `manual_overlay_fields`，并由数组推导 `has_manual_overlay=true`；创建/更新时间为 migration 时间、操作者为 `legacy_sql_import`。若上线核验发现顾问组实际对应其他字段编码，必须调整为真实字段编码后再执行 migration。

### 6.2 统一写入处理管线

手工导入不得另写一套业务数据加工逻辑。必须从现有同步服务中拆出无副作用、可复用的行处理管线，并同时被接口同步和手工导入调用。

```text
prepare_entity_rows(...)
  ├─ 表与物理列/字段元数据校验
  ├─ 期间规范化及月度期间主键收口
  ├─ 数据类型转换与默认值
  ├─ 手工字段策略（保留 / 上月复制 / 默认值）；处理模式必须传入 `write_mask` 与 `clear_mask`，禁止默认值、上月复制、lookup 或公式静默覆盖 `overlay` / `manual_update` 未选择的字段
  ├─ scope_role 稳定编码注入
  ├─ lookup/enrichment
  ├─ 计算字段公式重算
  ├─ 业务主键与 pk_hash 计算
  └─ 生成实体 payload

sync_from_api(...)
  ├─ prepare_entity_rows(...)
  ├─ 接口 upsert / 同键来源合并
  └─ clean_orphans(...)

manual_import(...)
  ├─ prepare_entity_rows(...)
  ├─ 模式与写入范围校验
  ├─ upsert
  └─ 不调用 clean_orphans(...)
```

要求：

1. 不复制 `_get_pk_columns`、`_calc_pk_hash`、值转换、lookup、公式计算、scope 注入或 payload 组装逻辑。
2. 手工导入仅增加“模式校验、来源字段赋值、审计、禁止孤儿清理”差异。
3. `prepare_entity_rows` 在写入前必须返回规范化后的 scope 字段，供写入授权服务使用。

### 6.3 写入数据范围授权

新增公共服务：

```text
authorize_row_write(user, table_name, normalized_row) -> allowed | denied(reason)
```

规则：

| 情况 | 行为 |
| --- | --- |
| 规范化行可解析出表 scope 字段，且值在用户可写范围 | 允许 |
| 可解析 scope，但任一行不在用户可写范围 | 整批拒绝，返回 Excel 行号和范围错误 |
| 写入前无法稳定解析 scope 字段 | 仅超级管理员允许；其他用户返回 403 |
| lookup/scope 注入后与上传行声明的 scope 冲突 | 拒绝，禁止静默改变数据归属 |

该服务不得复用“列表查询 WHERE 条件”作为替代；它必须针对一行规范化数据明确返回允许或拒绝。

### 6.4 Excel 模板和安全解析

#### 6.4.1 模板

- `GET /data/{table}/manual-import-template?mode=create`
- `GET /data/{table}/manual-import-template?mode=overlay`
- `GET /data/{table}/manual-import-template?mode=manual_update`

模板为单可见 Sheet + 隐藏 `__meta__` Sheet：保存表名、模式、字段编码、字段元数据版本、数据类型、是否主键、是否手工字段、可导入标记。

| 模式 | 列规则 |
| --- | --- |
| `create` | 主键、允许导入的接口字段、手工字段；禁止系统列、`id`、`pk_hash`、`synced_at`、计算字段、`raw` |
| `overlay` | 主键和手工字段；不包含接口字段 |
| `manual_update` | 主键和纯手工补录行允许维护的全部业务字段（接口字段 + 手工字段）；不包含系统列、计算字段、高敏字段和 `raw`。服务端按目标行状态限制接口已接管保护行仅可写手工字段 |

第一行为展示名表头，第二行为纯文本说明，数据从第三行开始。

#### 6.4.2 安全解析

文件必须同时通过以下检查：

1. 仅 `.xlsx`，限制 10 MB、5,000 数据行、仅一个可见 Sheet。
2. 检查 ZIP 文件成员、压缩比、异常解压大小、VBA 宏包、外部链接及不允许的隐藏 Sheet。
3. **第一轮**使用 `openpyxl(..., read_only=True, data_only=False)` 扫描数据区；仅以 Excel 单元格 `data_type='f'` 判定公式，任一公式单元格均拒绝。普通文本即使以 `=` 开头也不视为公式。
4. **第二轮**使用 `openpyxl(..., read_only=True, data_only=True)` 读取实际值。
5. 不以扩展名或 MIME 作为唯一判断；不得执行公式、外部链接或宏。
6. 模板元数据、模式、字段版本或表头不匹配时拒绝；旧模板在主键/字段变更后不可使用。

### 6.5 后端接口

前缀沿用现有 `/data` router。所有接口校验：表存在、物理模型可加载、`manual_import_enabled=true`、用户权限、数据范围和模板模式。

| URL / Method | 权限 | Request | Response |
| --- | --- | --- | --- |
| `GET /data/{table}/manual-import-template?mode=create\|overlay\|manual_update` | `data.view:C` | Path + Query | XLSX；403 / 404 / 409 |
| `POST /data/{table}/manual-import?mode=create\|overlay\|manual_update` | `data.view:C` | `multipart/form-data`：`file` | 201（含新增）/200（仅更新，ODS 已提交）；400 校验失败；403；404；409；413；422。DWD 状态异步轮询 |
| `GET /data/manual-import-batches/{batch_no}` | `data.view:V` + 批次表范围校验 | Path `batch_no` | 批次、ODS 结果、outbox `pending/running/succeeded/failed`、已发布时的 `ods_event_id`，以及 DWD `pending/running/success/skipped/failed/event_failed` 状态和安全错误摘要 |
| `POST /data/manual-import-batches/{batch_no}/retry-dwd` | `data.view:C` + 批次表范围校验 | Path；仅允许 `dwd_trigger_status IN ('skipped','failed','event_failed')` 的成功 ODS 批次 | 202：已新建/重投 `manual_import` outbox，批次回到 `pending`；403 / 404 / 409。只重试 DWD，不重写 ODS、不重验 Excel、不新增批次、不绕过文件幂等 |
| `POST /data/{table}/primary-key-migrations/{migration_id}/retry-dwd` | 既有字段管理更新权限 | Path；仅允许 ODS 已提交且 `key_migration_status='failed'` 的迁移 | 202：状态切为 `refreshing_dwd` 并已新建/重投 `pk_migration` outbox；403 / 404 / 409。只重试 DWD，不重算 ODS `pk_hash` |

导入成功响应：

```json
{
  "ok": true,
  "batch_no": "MI20260720-0001",
  "created": 18,
  "updated_manual": 0,
  "updated_api_overlay": 0,
  "outbox_id": "odc_01J...",
  "ods_event_id": null,
  "dwd_trigger": {
    "status": "pending",
    "message": "ODS 已导入，等待事件发布与 DWD 清洗"
  }
}
```

校验失败响应（HTTP 400，业务表零写入）：

```json
{
  "detail": "导入校验失败",
  "batch_no": "MI20260720-0002",
  "summary": {"total_rows": 18, "failed_rows": 2},
  "errors": [
    {"row_number": 5, "field": "工号", "code": "required", "message": "工号不能为空"}
  ]
}
```

最多同步返回前 200 条错误；完整错误摘要写入审计。无 upload token、无“校验后确认”二阶段接口；用户在点击“校验并导入”前通过普通确认框确认不可逆写入。

### 6.6 导入逻辑

1. 请求进入后先检查表级维护锁；非 `idle` 状态返回 409。
2. 创建 `manual_import_batches(status='validating')`。
3. 校验开关、权限、幂等性和文件安全；解析模板。
4. 调用 `prepare_entity_rows`，完成全量规范化和加工。
5. 对每行调用 `authorize_row_write`。
6. 按 `mode` 分类：
   - `create`：不存在同主键行才允许；写入 `base_source='manual'`、`sync_protected=true`、由实际填写手工字段推导的 `manual_overlay_fields` / `has_manual_overlay` 及手工审计字段。接口字段不得写入该字段数组。
   - `overlay`：必须命中 `base_source='api'`；只按 `write_mask/clear_mask` 更新手工字段。填写值或 `__CLEAR__` 均将字段加入并保留在 `manual_overlay_fields`；后者将业务值设为 `NULL`，不得取消字段级覆盖。
   - `manual_update`：必须命中 `base_source='manual'` 或 `sync_protected=true`；当 `base_source='manual'` 时，除系统列、主键、计算字段、高敏字段外，允许维护全部业务字段；当 `base_source='api' AND sync_protected=true` 时，仅允许维护手工字段。两类均按 `write_mask/clear_mask` 更新，禁止改动主键。
7. 任意错误：业务表零写入；独立事务保存失败批次、失败行审计，返回 400。
8. 全部通过：业务表 upsert、成功批次、逐行变更审计和可靠事件任务（outbox）在同一事务提交。
9. ODS 事务已提交后立即返回：存在新增时 HTTP 201，仅更新时 HTTP 200，并携带批次号；后台 worker 从通用 outbox 发布标准事件。Excel 导入事件 payload 至少含 `table_name`、`data_change_id=batch_no`、`upload_batch_id=batch_no`、`source='manual_import'`、`change_type`、`affected_row_count`、`changed_by`、`changed_at`。
10. 导入路径绝不调用 `clean_orphans`；DWD 状态由批次查询接口返回。

### 6.7 统一人工维护服务

现有单行内联编辑、批量更新、手工新增、批量删除与 Excel 导入均属于人工数据维护入口，必须统一接入：

```text
apply_manual_field_changes(...)
  ├─ 检查表级维护锁
  ├─ 校验可修改字段、write_mask / clear_mask 与记录状态
  ├─ 更新业务实体列
  ├─ 按实际人工覆盖的手工字段维护 manual_overlay_fields（`__CLEAR__` 仍保留覆盖编码），并由其推导 has_manual_overlay
  ├─ 更新 manual_updated_by / manual_updated_at
  ├─ 写人工逐行变更审计
  ├─ 创建 ods_data_change_outbox（source_type / source_id）
  └─ 不执行 clean_orphans(...)
```

统一规则：

1. Excel `overlay`、Excel `manual_update`、当前单行内联编辑、当前批量更新、当前手工新增行均必须复用该服务，并写入 `manual_data_change_audits`；不得形成“Excel 有审计而页面编辑无审计”的双轨行为。
2. 当前手工新增行只能在表开关开启、能力预检通过、维护锁为 `idle` 时创建；创建逻辑与 `create` 模式使用同一来源、授权、审计和通用 outbox 规则，`source_type='manual_create'`，不得创建虚假导入批次。
3. 批量删除同样检查维护锁；删除操作写入 `manual_data_change_audits` 和通用 outbox（`source_type='bulk_delete'`）。受保护手工补录行的删除仍要求现有删除权限，但必须增加二次风险提示。
4. 单行编辑与批量更新分别使用 `source_type='inline_edit'`、`bulk_update`；手工字段的单行/批量编辑使用空值与清空语义：未提供字段不修改；显式清空按 API `clear_fields` 或 Excel `__CLEAR__` 处理。

### 6.8 接口同步与孤儿清理

1. 接口同键命中受保护手工行：接口字段刷新，`manual_overlay_fields` 中列出的手工字段保留，`base_source='api'`、`sync_protected` 保持原值，`has_manual_overlay` 仅由字段数组推导。
2. 接口同键命中普通接口行：维持现有 upsert；仅保留 `manual_overlay_fields` 中列出的手工字段。
3. 月度表仅删除满足 `base_source='api' AND sync_protected=false AND pk_hash NOT IN current_hashes` 的当前期间记录；非月度表使用相同来源与保护条件，不附加期间谓词。
4. 空接口批次不删除任何数据。
5. 接口同步不得修改手工创建审计、`manual_overlay_fields` 或其推导出的 `has_manual_overlay`。

### 6.9 ODS→DWD 异步执行与真实结果追踪

当前 `publish_event()` 会同步运行自动化且吞掉异常；若在导入 HTTP 请求中等待 DWD 全量刷新或复杂规则完成，容易超时并造成“ODS 已成功、页面却认为失败”的体验错误。本期必须将 **ODS 导入** 与 **DWD 执行** 解耦。

#### 6.9.1 可靠 outbox 与后台执行

1. 新增持久化 `ods_data_change_outbox`（或复用现有可靠任务表的等价实现）：保存 `source_type`、`source_id`、可空 `batch_id`、标准事件 payload、状态 `pending/running/succeeded/failed`、重试次数、最后错误、event ID、创建/处理时间。页面人工维护使用自身来源类型和来源 ID，不得伪造 Excel 批次。Excel 导入提交事务时，批次 `dwd_trigger_status='pending'`；worker 取得任务后更新为 `running`。
2. ODS 行写入、对应审计与 outbox 任务必须在同一事务提交；Excel 导入额外与成功批次同事务提交。事务失败则相关数据均不落库。
3. 后台 worker / 既有调度器异步消费 outbox，调用标准 `ods_table_data_changed` 事件和既有 action registry；不得由导入 HTTP 接口等待 DWD 清洗完成，更不得直接调用清洗服务。
4. outbox 使用行锁或等价机制保证同一任务只被一个 worker 消费；失败按受控次数重试。`source_type='manual_import'` 的最终失败回写对应导入批次状态；其他来源只更新自身 outbox 与操作审计。
5. Excel 导入 ODS 已成功持久化时，存在新增返回 HTTP 201、仅更新返回 HTTP 200；DWD 状态仍为 `pending`，前端以 `GET /data/manual-import-batches/{batch_no}` 轮询至终态或用户关闭弹窗。
6. 对 `source_type='manual_import'` 且 `dwd_trigger_status IN ('skipped','failed','event_failed')` 的成功 ODS 批次，具备导入权限且通过该表数据范围校验的用户可调用批次 DWD 重试接口。重试只新建或重投该批次的 outbox，批次回到 `pending`，worker 取得任务后为 `running`；不得重写 ODS、重验 Excel、新增批次或绕过成功文件幂等。

#### 6.9.2 结果关联

```python
EventPublishResult(
    event_id: str,
    published: bool,
    execution_ids: list[int],
    execution_statuses: list[str],
    error: str | None,
)
```

要求：

1. `publish_event` 或新增等价内部 API 返回 `EventPublishResult`；后台 worker 使用该结果更新对应 outbox。`source_type='manual_import'` 时同步更新导入批次，其他来源更新其 outbox 和操作审计即可。
2. 自动化引擎的 `AutomationExecution` 通过 `event_id` 与 outbox 关联；导入批次再经 `batch_id` 关联 outbox，保存 event ID 和 execution IDs，不通过“最近一条记录”猜测结果。每次批次 DWD 重试均保留新的 outbox/event/execution 关联历史，批次展示最近一次状态及完整重试轨迹。
3. 批次 `dwd_trigger_status` 流转：ODS 事务提交为 `pending`；worker 取得任务为 `running`；事件发布/处理异常且无重试机会为 `event_failed`；自动化未执行为 `skipped`；至少一个 DWD 动作成功且无失败为 `success`；DWD 动作、清洗规则或 outbox 最终失败为 `failed`。
4. ODS 导入成功后，DWD 失败、跳过或事件失败均不得回滚 ODS；批次查询返回真实原因，前端必须显示“ODS 已导入，DWD 未完成”。
5. 本期仅验收到 DWD。DWS/ADS 级联继续交由既有 `dwd_data_refreshed` 等机制，不把 ADS 成功纳入本需求验收。

### 6.10 前端与 UI/交互

1. **数据表管理页**：新增“允许手工 Excel 导入”开关；能力预检失败时开关置灰并展示阻断原因。ODS→DWD 自动化状态（已启用 / 未配置 / 已关闭）必须显示为风险提示，但不是开启导入的阻断条件。
2. **数据表页**：开关开启且用户有 `data.view:C` 时显示“手工导入”；表处于主键迁移状态时显示维护提示并禁用所有写入入口。若迁移因 `skipped`、`failed` 或 `event_failed` 而锁定，字段管理页向具备权限的管理员显示失败原因和“重试 DWD 刷新”入口；重试期间仍禁用写入。
3. **来源列**固定展示：
   - `sync_protected=true`：橙色“手工补录”；
   - `base_source='api' && has_manual_overlay=true`：黄色“接口 + 手工补充”；
   - 其他：灰色“接口”。
4. **导入弹窗**：先选择“新增手工补录”“补充接口手工字段”或“维护已有手工补录”；下载对应模板；上传后点击“校验并导入”。
5. 成功显示新增/补充数、批次号、outbox ID、已发布时的 ODS event ID 和 DWD 实际结果；失败展示前 200 条行号/字段/原因。DWD `skipped`、`failed` 或 `event_failed` 时，对具备导入和数据范围权限的用户展示“重试 DWD 清洗”按钮；按钮只重投批次 outbox，不重复导入 ODS。
6. DWD 失败/跳过必须显示“ODS 已导入，DWD 未完成”，不能显示泛化成功提示。
7. 系统列不作为普通字段展示、搜索、筛选、导出或字段管理项；来源列为固定 UI 列。

### 6.11 权限、安全与外部系统

| 维度 | 规则 |
| --- | --- |
| 导入权限 | 模板下载和导入均要求 `data.view:C`；查看 `data.view:V`；接口同步 `data.view:U` |
| 开关权限 | 使用既有数据表管理更新权限 |
| 写入范围 | 必须通过 `authorize_row_write`；无法可靠判断时仅超级管理员 |
| 敏感字段 | 无权限不入模板；高敏字段不可导入；审计不保存敏感值 |
| 文件安全 | 双轮读取检测公式；检测 ZIP、宏、外链、压缩比；禁止执行公式和拼接 SQL |
| 外部系统 | 不调用北森；只发布标准 ODS 事件；DWD 是否执行由既有 Feature Flag 与自动化配置决定 |

## 7. 原子任务清单

- [ ] X1401a 表级导入开关迁移与管理接口
  - 前置任务：G01、G02、G03、G05；G04 开发/测试环境验证仅在展示 DWD 风险提示时需要。
  - 功能范围：新增 `manual_import_enabled`、历史回填、数据表管理 DTO/API/UI 透传、操作日志。
  - 代码交付物：Alembic migration、管理路由/schema、前端开关、测试。
  - UI 要求：数据表管理页开关、权限态、保存成功/失败提示。
  - UCP/外部系统要求：不涉及。
  - 测试要求：默认关闭、开关切换、403、409。
  - 验收标准：开关是导入入口和后端接口的共同硬门禁。
  - 完成定义：开发 + UI + 测试 + 验收全部完成并有证据后才可勾选。

- [ ] X1401b 全局系统列与历史表 migration
  - 前置任务：G03
  - 功能范围：为全部适用 ODS 可写物理表增加八个系统列、索引和历史默认值；纳管 18 条历史 SQL 记录。
  - 代码交付物：Alembic migration、migration 测试。
  - UI 要求：不涉及 UI。
  - UCP/外部系统要求：不涉及。
  - 测试要求：历史表、部分表不存在、长表名索引、18 条全存在/部分存在/不存在。
  - 验收标准：系统列不进入 `table_columns`；存在的 18 条记录均受保护。
  - 完成定义：开发 + UI + 测试 + 验收全部完成并有证据后才可勾选。

- [ ] X1401c 新表 DDL、重建和动态加载全局兼容
  - 前置任务：X1401b
  - 功能范围：修改动态表创建 DDL、重建脚本和运行时模型加载；查询/导出/字段发现显式排除系统列。
  - 代码交付物：DDL/loader/导出过滤改造、回归测试。
  - UI 要求：不涉及 UI。
  - UCP/外部系统要求：不涉及。
  - 测试要求：新建表、重建表、动态反射、查询、字段管理、导出、报表字段回归。
  - 验收标准：未来新表与历史表结构一致，系统列不污染业务能力。
  - 完成定义：开发 + UI + 测试 + 验收全部完成并有证据后才可勾选。

- [ ] X1401d 自动全量主键迁移与表级维护锁
  - 前置任务：G01、X1401c、X1401e
  - 功能范围：新增 `primary_key_migrations` 和 `registered_tables` 维护锁；拦截有数据表对 `is_pk_part` 的直接写入；管理员保存主键配置后自动执行拟新主键预检、全表新 hash 计算、冲突检测、无冲突时在同一事务内按临时唯一 hash → 最终 hash 两阶段更新 ODS、切换字段元数据和写迁移审计；ODS 提交后通过 outbox 异步重建/刷新受影响 DWD。
  - 代码交付物：主键迁移服务、字段管理路由改造、迁移审计模型/API、测试。
  - UI 要求：字段管理页提示“保存将自动迁移 N 条历史数据并刷新受影响 DWD”；无冲突时无需二次确认，自动完成；冲突时显示冲突组、涉及行数和样例，且不得提交。
  - UCP/外部系统要求：通过既有 ODS/DWD 自动化或受控 outbox 重建刷新下游，不得遗留旧 hash 数据。
  - 测试要求：空表直接改主键、非空表自动迁移、旧 hash 与新 hash 交叉碰撞的两阶段迁移、无冲突迁移、冲突迁移拒绝、并发同步/导入/编辑/删除返回 409、ODS/DWD 一致性、事务回滚。
  - 验收标准：主键变更后不存在旧 hash 与新 hash 并存；未解决冲突时元数据和数据均不改变。
  - 完成定义：开发 + UI + 测试 + 验收全部完成并有证据后才可勾选。
- [ ] X1401e 通用 Outbox 最小能力与主键迁移 DWD 重试
  - 前置任务：X1401a、X1401b
  - 功能范围：创建 `ods_data_change_outbox` 数据模型、事务写入助手和最小 worker 消费/行锁/受控重试能力；支持 `source_type='pk_migration'` 的事件投递、`skipped/failed/event_failed` 锁定语义及仅重投下游的 DWD 重试接口。
  - 代码交付物：outbox migration/model/service、worker 基础设施、主键迁移重试路由/schema、测试。
  - UI 要求：字段管理页在 DWD 未完成时展示锁定与“重试 DWD 刷新”操作态。
  - UCP/外部系统要求：复用标准 `ods_table_data_changed` 事件；不得在 HTTP 内直调 DWD 或重算 ODS hash。
  - 测试要求：outbox 与 ODS 事务原子性、worker 行锁、`success/skipped/failed/event_failed` 迁移状态、仅重投 DWD、禁止重复迁移 hash、403/404/409。
  - 验收标准：主键迁移的 ODS 提交与下游刷新有完整闭环；DWD 未完成时表保持写锁，重试成功后解除。
  - 完成定义：开发 + UI + 测试 + 验收全部完成并有证据后才可勾选。

- [ ] X1402 统一行处理管线
  - 前置任务：X1401c、G01
  - 功能范围：从同步服务下沉 `prepare_entity_rows`，复用期间、类型、默认值、lookup、公式、scope 注入、主键和 payload 逻辑；接口同步继续使用。
  - 代码交付物：公共处理服务、同步服务重构、单元/集成测试。
  - UI 要求：不涉及 UI。
  - UCP/外部系统要求：不涉及。
  - 测试要求：月度期间、lookup、公式、上月复制、scope 注入、主键配置变更、现有同步回归。
  - 验收标准：接口同步与手工导入没有两套业务加工规则；仅孤儿清理分支不同。
  - 完成定义：开发 + UI + 测试 + 验收全部完成并有证据后才可勾选。

- [ ] X1403 写入数据范围授权服务
  - 前置任务：X1402、G02
  - 功能范围：实现 `authorize_row_write` 和行级范围错误 Schema。
  - 代码交付物：授权服务、后端测试。
  - UI 要求：不涉及 UI。
  - UCP/外部系统要求：不涉及。
  - 测试要求：允许、单行越权整批拒绝、不可解析仅超级管理员、lookup 后 scope 冲突。
  - 验收标准：用户不能导入自身无写权限的数据，也不会写入后不可见。
  - 完成定义：开发 + UI + 测试 + 验收全部完成并有证据后才可勾选。

- [ ] X1404a 导入审计数据模型与幂等控制
  - 前置任务：X1401b
  - 功能范围：创建 `manual_import_batches` 与通用 `manual_data_change_audits`、成功文件幂等约束、敏感字段审计策略；验证 Excel 与页面人工维护均可记录逐行审计。
  - 代码交付物：migration、模型、测试。
  - UI 要求：不涉及 UI。
  - UCP/外部系统要求：不涉及。
  - 测试要求：成功重复、失败重试、并发重复、Excel/单行编辑/批量更新/新增/删除的通用逐行审计、敏感字段不落值、成功/失败事务边界。
  - 验收标准：同成功文件不会二次写数据或二次触发 DWD；审计不泄露敏感值。
  - 完成定义：开发 + UI + 测试 + 验收全部完成并有证据后才可勾选。

- [ ] X1404b 三模板生成与元数据版本校验
  - 前置任务：X1402
  - 功能范围：生成 `create` / `overlay` / `manual_update` 模板，写入隐藏元数据并校验模式、字段版本和主键版本。
  - 代码交付物：模板服务、下载接口、测试。
  - UI 要求：不涉及 UI。
  - UCP/外部系统要求：不涉及。
  - 测试要求：三种模板字段集、字段/主键变化后旧模板拒绝、表开关关闭拒绝下载。
  - 验收标准：用户不会使用一个模糊万能模板误填接口字段。
  - 完成定义：开发 + UI + 测试 + 验收全部完成并有证据后才可勾选。

- [ ] X1404c XLSX 安全检查与解析服务
  - 前置任务：X1404b、G05
  - 功能范围：双轮读取、ZIP/压缩比/宏/外链/公式/多 Sheet/大小/行数检查，输出规范化原始行。
  - 代码交付物：解析服务、文件安全测试。
  - UI 要求：不涉及 UI。
  - UCP/外部系统要求：不涉及。
  - 测试要求：公式缓存值、外链、HYPERLINK、VBA 伪装、ZIP bomb、5000/5001 行、10MB、空文件、篡改 meta。
  - 验收标准：所有不支持或不安全结构在业务写入前被拒绝。
  - 完成定义：开发 + UI + 测试 + 验收全部完成并有证据后才可勾选。

- [ ] X1405 三模式导入、统一人工维护、原子写入与同步保护
  - 前置任务：X1401e、X1402、X1403、X1404a、X1404c
  - 功能范围：实现 `create` / `overlay` / `manual_update` 分类、`write_mask` / `clear_mask`、手工来源赋值、业务事务、审计写入；实现 `apply_manual_field_changes` 并将现有单行编辑、批量更新、手工新增、批量删除和 Excel 导入统一接入；改造接口同键合并和孤儿清理。
  - 代码交付物：导入服务、`sync_service` 改造、API 路由、测试。
  - UI 要求：不涉及 UI。
  - UCP/外部系统要求：不直接调用北森或 DWD。
  - 测试要求：新增、overlay、manual_update、单行编辑、批量更新、手工新增、批量删除、空白不更新、`__CLEAR__` 清空、接口字段覆盖拒绝、手工保护、接口接管、维护锁 409、空批次、月度/非月度孤儿清理（显式验证 `base_source='api' AND sync_protected=false` 谓词）、事务回滚。
  - 验收标准：导入不执行孤儿清理；接口同步不删除受保护行；接口行仅更新手工字段。
  - 完成定义：开发 + UI + 测试 + 验收全部完成并有证据后才可勾选。

- [ ] X1406 通用 Outbox 完整结果化与异步 DWD 集成
  - 前置任务：X1401e、X1405；开发/测试环境满足 G04 的可验证条件，生产上线前满足 G04 的生产条件。
  - 功能范围：在 X1401e 最小能力上完善多来源消费/重试和 `EventPublishResult`，以 `source_type/source_id/batch_id` 关联导入与既有人工维护来源，导入批次仅关联自身的真实异步状态；实现成功 ODS 批次的仅 DWD 重试接口与状态回写；任何人工 ODS 变更仅投递标准事件。
  - 代码交付物：事件框架/自动化适配、批次状态回写、集成测试。
  - UI 要求：不涉及 UI。
  - UCP/外部系统要求：复用 `ods_table_data_changed` 和 action registry，不直调清洗服务。
  - 测试要求：outbox 原子提交、worker 行锁、重试/最终失败、批次 DWD `skipped/failed/event_failed` 的仅重投恢复、Feature Flag 关闭、规则禁用、无配置、安全默认、cleaning_rule、passthrough、清洗失败、事件失败、HTTP 不等待 DWD。
  - 验收标准：ODS 成功与 DWD 异步状态真实可追踪；HTTP 不因 DWD 耗时超时；DWD 失败不回滚 ODS 导入。
  - 完成定义：开发 + UI + 测试 + 验收全部完成并有证据后才可勾选。

- [ ] X1407 前端导入、来源展示与结果提示
  - 前置任务：X1401a、X1404b、X1405、X1406
  - 功能范围：数据表管理开关 UI、导入模式选择、三种模板下载、上传、错误展示、来源列、ODS 已导入/DWD 异步真实状态提示与批次轮询。
  - 代码交付物：前端 API、导入弹窗、列表页和管理页改造、测试。
  - UI 要求：覆盖开关、空态、加载、成功、失败、无权限、DWD skipped/failed。
  - UCP/外部系统要求：不涉及。
  - 测试要求：组件测试、权限、三模式切换、文件失败、批次轮询、结果刷新、前端构建。
  - 验收标准：用户不需 SQL；失败可定位行号；不得把 DWD 未完成显示为成功。
  - 完成定义：开发 + UI + 测试 + 验收全部完成并有证据后才可勾选。

- [ ] X1408 端到端、迁移演练与上线交付
  - 前置任务：X1401a、X1401b、X1401c、X1401d、X1401e、X1402、X1405、X1406、X1407；生产上线前通过 G01–G05。
  - 功能范围：18 条历史记录纳管、三种导入模式、统一人工维护入口、同步保护、接口同键合并、主键迁移锁、DWD 成功/失败路径、全局 ODS 表回归。
  - 代码交付物：E2E/集成测试、生产演练记录、上线 runbook。
  - UI 要求：验证开关、三模板、来源标签、主键迁移维护提示、DWD 真实状态。
  - UCP/外部系统要求：验证 AutomationExecution，不以 DWS/ADS 刷新为通过条件。
  - 测试要求：后端全量、前端构建、migration 演练、ODS→DWD 集成测试。
  - 验收标准：上线前完成备份、变更窗口、回退决策和全部测试证据。
  - 完成定义：开发 + UI + 测试 + 验收全部完成并有证据后才可勾选。

## 8. 测试计划

| 类别 | 场景 | 预期 |
| --- | --- | --- |
| 主键 | 主键迁移预检、无冲突迁移、冲突拒绝、同员工同月多维度、DWD `success/skipped/failed/event_failed`、仅重试 DWD | 旧 hash 全部迁移或事务回滚；旧模板拒绝；不出现新旧 hash 并存；DWD 未完成时写入保持锁定，重试成功后解除且不重算 hash |
| 开关 | 默认关闭、开启、关闭后请求、非 ODS/视图/无主键表开启 | 前后端共同门禁；不符合能力条件的表无法开启 |
| `create` | 新主键完整记录 | 新增 `manual + protected`，审计完整 |
| `overlay` | 命中接口行、填写手工字段 | 仅更新手工字段，显示“接口 + 手工补充” |
| `manual_update` | 命中纯手工行、命中接口已接管的保护行、修改字段、空白、`__CLEAR__`、必填字段清空 | 纯手工行可改全部允许业务字段；接口已接管行仅改手工字段；空白不修改；`__CLEAR__` 保持字段级人工覆盖且不得清空非空约束字段；不要求重填未修改的业务必填字段 |
| 模式错误 | create 命中已有行、overlay 找不到接口行或填写接口字段、manual_update 命中普通接口行 | 整批失败，业务表零写入 |
| 同步与维护锁 | 接口未返回保护行、未返回普通行、接口命中保护行、迁移期间同步/导入/编辑/删除 | 保护行保留；普通行清理；同键合并且保护不解除；迁移期间写入一律 409 |
| 管线复用 | 月度期间、lookup、公式、scope 注入、上月复制 | 手工导入与接口同步产生一致的规范化数据 |
| 授权 | 允许、越权、无法解析、scope 冲突 | 按 §6.3 处理，不能越权写入 |
| 文件安全 | 公式缓存、外链、宏、ZIP bomb、多 Sheet、超限、篡改 meta、普通 `=ABC-001` 文本 | 公式单元格及危险文件拒绝；普通文本不被误判；全部不写业务表 |
| 幂等 | 成功文件重复、失败文件重试、并发相同文件 | 成功重复拒绝；失败可重试；不会双写或双触发 |
| 审计 | 非敏感/敏感字段变更 | 非敏感保存前后值；敏感只记录字段编码 |
| DWD | pending/running/success/skipped/failed/event_failed、worker 重试、HTTP 超时隔离、批次仅 DWD 重试 | ODS 不回滚；含新增时 HTTP 201、仅更新时 HTTP 200 快速返回；批次、outbox ID、已发布 event ID、execution IDs 和最终真实结果一致；失败/跳过可重投 DWD 而不重复导入 |
| 回归 | 全部 ODS 可写物理表的加载、同步、查询、字段管理、导出、报表 | 系统列不污染既有能力，未来 ODS 新表结构一致 |

## 9. 验收标准

### 用户验收

1. 管理员能按表开启/关闭导入能力。
2. 用户无需 SQL 即可选择“新增手工补录”“补充接口手工字段”或“维护已有手工补录”并完成导入。
3. 页面准确区分接口、接口+手工补充和手工补录。
4. 受保护手工行在接口同步后不会误删。

### 数据与安全验收

1. 主键由表字段配置决定；有数据表的主键变更必须经过受控主键迁移，不能直接修改字段元数据。
2. 手工导入与接口同步复用同一业务加工管线，只有来源规则、写入掩码和孤儿删除不同。
3. 非超级管理员不能写入自身无范围权限的数据。
4. 公式、宏、外链、异常 ZIP 等不安全文件无法进入业务写入阶段，普通文本不得被误判为公式。
5. 成功文件幂等，审计完整且不保存敏感字段值。
6. 已手工补录的数据可通过 `manual_update` 维护，无需先删除再重导。

### ODS→DWD 验收

1. 导入成功后以 outbox 持久化 `ods_table_data_changed`，payload 包含 `batch_no`。
2. `emp_monthly_allocation` 在生产自动化配置满足 Gate G04 时，由后台 worker 异步触发并完成 DWD 清洗。
3. 批次记录 outbox ID、事件发布成功后的 event ID、AutomationExecution ID 以及真实 `pending/running/success/skipped/failed/event_failed` 状态；HTTP 首次响应允许 `ods_event_id=null`。
4. DWD 失败或跳过不回滚 ODS 导入；HTTP 不等待 DWD，前端不得将“ODS 已导入，DWD 处理中/未完成”显示为 DWD 成功。
5. ADS 不纳入本期验收。

## 10. 风险与兼容性

| 风险 | 等级 | 应对 |
| --- | --- | --- |
| 主键变更遗留旧 hash 或发生冲突 | 高 | 方案 B 受控主键迁移：预检、冲突阻断、ODS 原子重算、DWD 刷新、迁移审计 |
| 两套加工逻辑导致 ODS/DWD 口径不一致 | 高 | 强制复用 `prepare_entity_rows` |
| 越权导入 | 高 | 行级 `authorize_row_write`；不可解析时仅超级管理员 |
| 手工兜底行因接口波动再次丢失 | 高 | 接口命中后不自动解除 `sync_protected` |
| Excel 覆盖接口事实或空白误清空 | 高 | 三模板、`write_mask` / `clear_mask`、overlay 只允许手工字段 |
| 文件解析攻击或公式误判 | 高 | ZIP/宏/外链/公式双轮检查；仅以单元格公式类型判定 |
| 审计泄露敏感数据 | 高 | 不保存敏感值；高敏字段禁止导入 |
| 全局系统列影响非 ODS 资产 | 高 | 方案 A 仅覆盖 ODS 可写物理表，DDL/重建/加载/查询/导出全量回归 |
| DWD 状态误报、HTTP 超时或失败后无法恢复 | 高 | transactional outbox、后台 worker、批次轮询、outbox/event ID/execution IDs 真实关联；导入批次与主键迁移均支持只重投 DWD，不重复写 ODS |
| 重复导入重复触发 DWD | 中 | 成功文件 SHA-256 幂等控制 |
| 未来完全交由接口管理 | 中 | 二期提供解除保护/转为接口管理 |

## 11. 交付说明模板

- 完成任务与证据：X1401a–X1408。
- 修改文件：migration、DDL/动态加载、统一加工管线、授权服务、审计、模板/解析、同步服务、事件框架、前端、测试。
- 数据验证：18 条历史记录纳管前后、接口同步保护、接口同键合并。
- 自动化验证：batch_no、event ID、AutomationExecution IDs、DWD 实际结果。
- 测试命令与结果：migration 演练、后端全量、前端构建、ODS→DWD 集成测试。
- 未完成项：解除保护、审计历史/回滚 UI、CSV/XLS、多 Sheet、自定义映射、DWS/ADS 级联增强。
