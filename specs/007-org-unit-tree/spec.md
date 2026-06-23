# 组织架构树改造方案：从「花名册推导」升级为「北森组织单元表权威建树」

> 状态：**方案文档（二次评估后修订，待后续开发）**。本文给出背景、目标、最小开发步骤与验收机制，供后续按步执行。
> 项目：`D:\AI项目\HR提效工具搭建\hr-portal`（后端 FastAPI + alembic + 北森数据源框架）

---

## 一、背景与动机（为什么改）

### 现状的根问题
当前组织架构树 `org_tree` 不是来自权威组织数据，而是**从员工实时花名册的 6 个层级"部门名称"字段反推**出来的（`_sync_org_tree`，`sync_service.py:912`）。因为北森过去**没给部门编码**，节点 `code` 只能用「部门路径名做 SHA256」临时生成（`_org_node_code`，`sync_service.py:905`）。

由此带来三个缺陷：
1. **脆弱**：任何部门改名 → 路径变 → 该部门所有节点 code 全变 → 已配的数据权限标签瞬间失效、对不上。
2. **不完整**：没有员工的空部门建不出来；父子关系靠"路径名拼接"猜，不可靠。
3. **冗余字段问题**：花名册接口新增了源端字段 `org_node_code_2`（中文表头「组织节点编码」，按 UUID 锚定），系统按"同名 code 已占用"自动加后缀建成独立列，与系统派生的 `org_node_code` 形成两个语义重叠的列。

### 新方案（已与用户确认的事实）
用户可从北森**同步一张「组织单元」表**，字段含：编码、组织名称、组织全称、行政上级组织编码、行政维度上级、状态、设立日期、生效日期、变动类型。已确认：
- 花名册里员工**带最子节点部门的编码**（当前本地暂名 `org_node_code_2`，源端中文表头「组织节点编码」），且**与组织单元表是同一套编码体系**，一定能查到对应节点。
- 同一部门下所有员工的部门编码一致（无脏数据）。
- 组织单元表里根节点的「行政上级组织编码」指向虚拟根 `RootOrg`。
- 组织单元接口**沿用现有"建报表/数据源"框架**（`source_type = beisen_report`，含拉取+推送），具体 report_id 等由用户在 UI 自行配置，接口形态不需要在本方案里待定。

### 目标产出
- 组织树 `org_tree` 改由**组织单元表**按 `行政上级组织编码` 显式建父子，每层都是**真实源端编码**，抗改名、结构完整。
- 员工的 `org_node_code` 直接取花名册里的源端「组织节点编码」（当前本地暂名 `org_node_code_2`，迁移后上位为 `org_node_code`），与树节点 code 同体系，权限按任意层级授权都能命中。
- 收口两个重复字段（见第四节）。

---

## 二、架构对称参照

新链路完全对称于现有「成本中心月度表 → cc_tree」：

| 维度 | 成本中心树（现有，参照模板） | 组织树（本方案目标） |
|---|---|---|
| 数据源表 | `cost_center_monthly` | **`org_unit`（新建）** |
| 建树函数 | `_sync_cc_tree`（`sync_service.py:809`） | **重写 `_sync_org_tree`** |
| 触发时机 | `sync_to_table('cost_center_monthly')` 末尾（`:1182`） | `sync_to_table('org_unit')` 末尾（**改派发**，`:1183`） |
| 树模型 | `CostCenterNode` | `OrgNode`（`data/models.py:126`，已存在，复用） |
| 父子匹配 | 业务层级Id + 上级路径名（弱，靠名字猜） | **行政上级组织编码（强，按 code 直连）** |
| 节点 code | 源端「编码」 | 源端「编码」 |

> 关键优势：组织单元表带 `行政上级组织编码`，建树比成本中心树**更干净**——直接 `parent_code → parent_id` 连父子，不需要"按上一级路径名匹配"的兜底逻辑。

---

## 三、最小开发执行步骤

### Step 1　注册内置数据源表 `org_unit`
**文件**：`backend/app/seed.py`
- `_DATASOURCES_INIT`（`:281`）追加一条：
  ```python
  {"table_name": "org_unit", "table_label": "组织单元", "source_type": "beisen_report", "schedule": "每日 06:00"},
  ```
- `_BUILTIN_TABLES`（`:369`）追加一条（非月度表）：
  ```python
  {"table_name": "org_unit", "table_label": "组织单元", "icon": "Share", "display_order": 15, "is_period": False, "scope_strategy": "cross_filter"},
  ```
> seed 是幂等的（`_ensure_registered_tables` / `_ensure_datasources`），新增项会自动登记，已有不动。datasource 凭证/report_id 由用户在 UI「接口配置」里填（沿用现有报表框架）。

### Step 2　建物理表 + 预定义字段（alembic 迁移）
**新建**：`backend/alembic/versions/0044_add_org_unit.py`，`down_revision = "0043_drop_global_fields"`（当前最新）。
- 重要修订：**不能只靠 seed 注册 `registered_tables`**。当前启动流程会在 seed 后反射所有 `registered_tables` 对应的真实物理表；如果 `org_unit` 已注册但物理表不存在，启动可能在动态表反射阶段失败。因此本迁移必须同时完成「注册元数据 + 创建物理表」。
- 本迁移负责：
  1. 向 `registered_tables` 幂等插入 `org_unit`（`is_builtin=true`）——与 seed 双保险。
  2. 向 `table_columns` 预 seed 字段元数据（`auto_discovered=false`），**关键是把"编码"设为 `is_pk_part=true`**，避免首次同步把多行去重错。
  3. `CREATE TABLE IF NOT EXISTS org_unit (...)` 创建物理表，至少包含基础列 `id BIGSERIAL PRIMARY KEY`、`pk_hash VARCHAR(64) NOT NULL UNIQUE`、`synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`，以及下表 9 个业务列；同时创建 `pk_hash` 索引。迁移里建议复刻 `backend/app/data/ddl.py` 的建表形态，避免引入和动态表机制不一致的结构。

  | column_code | column_label | data_type | 关键标记 |
  |---|---|---|---|
  | `org_code` | 编码 | string | **is_pk_part=true** |
  | `org_name` | 组织名称 | string | dimension |
  | `org_full_name` | 组织全称 | string | dimension |
  | `parent_org_code` | 行政上级组织编码 | string | dimension |
  | `parent_org_dim` | 行政维度上级 | string | dimension |
  | `org_status` | 状态 | string | dimension |
  | `establish_date` | 设立日期 | date | dimension |
  | `effective_date` | 生效日期 | date | dimension |
  | `change_type` | 变动类型 | string | dimension |

> 预 seed 字段只是为了先锁定 `is_pk_part` 和 code；即便不预 seed，首次同步 `_ensure_columns` 也会自动发现，但主键判断会落空。**必须预 seed `org_code` 为主键。**
> entrypoint 启动自动 `alembic upgrade head`，无需手工执行。

### Step 3　重写建树函数 `_sync_org_tree`
**文件**：`backend/app/datasources/sync_service.py`（替换 `:809` 风格的旧 `_sync_org_tree`，参照 `_sync_cc_tree`）。

逻辑（入参改为**落库后的 `org_unit` 实体行字典**，不要直接使用 API 原始 `rows`）：
1. `delete(OrgNode)` 全量重建（与 cc_tree 一致）。
2. 固定创建一个唯一虚拟根节点：`code='RootOrg'`，`name` 可沿用 `app_settings.ORG_ROOT_NAME`（当前默认「创梦天地」），`level=1`，`parent_id=None`，`is_active=True`。
3. 第一遍：每个有效 `org_code` 建一个 `OrgNode`，`code = org_code`、`name = org_name`、`level` 按 `parent_org_code` 链路从 `RootOrg` 向下推算深度，`is_active = (org_status == 启用态)`。用 `nodes_by_code[org_code] = node` 建索引。
4. 第二遍：按 `parent_org_code` 连父——`parent_org_code == 'RootOrg'` 或为空 → 父节点为虚拟根；否则 `node.parent_id = nodes_by_code[parent_org_code].id`。
5. 异常数据处理：重复 `org_code` 取落库后唯一行；`parent_org_code` 找不到、父子成环、`org_code` 为空的记录跳过并打 warning，避免静默生成错误树。
6. 标 `is_leaf`（无 child 的节点）。
7. `await _recompute_tree_paths(OrgNode, db)` 重算物化 path（复用现有函数 `:1001`）。

> `RootOrg` 处理已定稿：**必须建虚拟根**，不再采用「指向 RootOrg 的节点直接当顶层」的分支方案。这样 `org_tree` 始终只有一个 `parent_id IS NULL` 的根节点，前端展示和权限后代计算都更稳定。

### Step 4　改同步派发
**文件**：`backend/app/datasources/sync_service.py:1183`
- 现状：`elif table_name == "emp_realtime_roster": await _sync_org_tree(rows or [], db)`
- 改为：`elif table_name == "org_unit": ...`（树改由组织单元表触发；花名册同步不再建树）。
- 派发方式要参照 `cost_center_monthly`：先 `_dynamic_upsert('org_unit', ...)`，`await db.flush()` 后从 `DATA_TABLES['org_unit']` 读回落库后的实体行，再 `_row_to_dict(row, table_columns)` 转成建树输入，最后调用 `_sync_org_tree(tree_rows, db)`。这样建树吃到同批去重、字段映射、类型转换和数据库最终状态。

### Step 5　员工 `org_node_code` 收敛为单列，源端编码直接上位（删派生）
**目标**：花名册里不再有「系统派生的 `org_node_code` + 源端 `org_node_code_2`」两列并存，**收敛为唯一一列 `org_node_code`，其值直接来自源端**。没有派生、没有复制、没有第二列。

**为什么能删派生这一步**：历史上 `_inject_org_node_code` 存在的唯一原因是「北森没给部门编码、只能用部门路径名算 hash 造一个 `org_node_code`」。现在源端有真编码了，这一步就该退场。它现在占着 `org_node_code` 这个名字（`table_columns` 里 `(table_name, column_code)` 唯一，`models.py:42`），导致源端列只能退而叫 `org_node_code_2`。**腾出名字，源端列即可上位。**

三个动作（一次性完成）：

1. **删派生函数**：删除 `_inject_org_node_code`（`sync_service.py:1031`）及 `_inject_scope_codes`（`:1045`）里对它的调用。从此同步不再生成、覆盖或兜底 `org_node_code`。

2. **腾名字 + 源端列改名上位（alembic 迁移，并入 Step 2 的 0044 或单独 0045）**：
   - 删除现有「系统派生」的 `org_node_code` 字段元数据 + 物理列（它存的 `L7_xxx` hash 本就要废弃）。
   - 把源端那条（UUID 锚定「组织节点编码」、现叫 `org_node_code_2`）的 `column_code` 由 `org_node_code_2` 改为 `org_node_code`，并 `ALTER TABLE ... RENAME COLUMN org_node_code_2 TO org_node_code` 同步物理列。
   - 因为源端列绑 UUID（`source_field_id`），改名后**下次同步北森的「组织节点编码」会稳定落到 `org_node_code`，不再加后缀**。
   - `scope_role` 设为 `org_node_code`（保持权限锚定），`is_visible` 正常展示。
   - 迁移前置校验：先确认 `table_columns` 中 `emp_realtime_roster.org_node_code_2` 的 `source_field_id` 是否真实存在。若为空，迁移必须补上该字段在北森表头中的 UUID；若短期拿不到 UUID，至少保证 `column_label='组织节点编码'`，让北森 client 通过 `title_to_code` 把同名表头稳定映射到 `org_node_code`。

3. **源端为空 → 留空不兜底**（已与用户确认）：源端编码为空的员工 `org_node_code` 为空，不会被任何组织权限标签命中——源端数据缺失的必然结果，不由代码掩盖。

> **风险与时机**：`org_node_code` 是权限锚定列，删它 + 物理列改名属「带数据的列重命名」，需 alembic 小心处理（改物理列名、迁元数据、不丢权限引擎对该列名的引用 `scope_filter.py:159`）。**生产现在未配任何组织权限标签，此刻做风险最低，越晚越麻烦。**
> 迁移后旧 hash 值随物理列删除一并清掉；若现有 `org_node_code_2` 已有源端值，`RENAME COLUMN` 会保留这些值，后续花名册同步再按源端刷新 `org_node_code`。

---

## 四、字段收敛：从两列并存到唯一一列（重点）

改造前，花名册上与组织编码相关的列有两个，**本方案的目标是收敛为唯一一列 `org_node_code`，彻底消除冗余**，而非让两列长期并存。

### 改造前的两列（问题现状）

- `org_node_code`：**系统派生列**，由 `_inject_org_node_code` 用部门路径名算 hash（`L7_xxx`）生成，源端本无此字段。
- `org_node_code_2`：**源端真实列**，北森「组织节点编码」按 UUID 锚定。因 `org_node_code` 名字被派生列占用（`table_columns` 的 `(table_name, column_code)` 唯一约束，`models.py:42`），源端列被迫加后缀。

### 收敛动作（即 Step 5，结论）

1. **删派生**：删除 `_inject_org_node_code` 函数及其调用 → 不再生成系统派生的 `org_node_code`。
2. **腾名字**：删除派生列 `org_node_code` 的元数据 + 物理列（hash 值废弃）。
3. **源端上位**：源端列 `org_node_code_2` 改名为 `org_node_code`（元数据 `column_code` + 物理列同步 RENAME），设 `scope_role = org_node_code`。因绑 UUID，后续同步稳定落到此列、不再加后缀。

### 收敛后的最终态

- **只有一列 `org_node_code`**：值直接来自源端北森「组织节点编码」，无派生、无复制、无第二列。
- 权限引擎、历史迁移、回填脚本对 `org_node_code` 这个**列名的引用全部不变**（`scope_filter.py:159` 等），改的只是这列的"出身"（派生 hash → 源端真值）。

> 一句话总结：**派生列退场、源端列改名顶上，两列合一。** `org_node_code` 从此是「源端真实编码 + 权限锚定」的唯一一列。

---

## 五、注意事项 / 已知约束

1. **org_tree 全量重建会重排自增 id**：权限标签 `ScopeTagSelection.node_id` 存的是 org_tree 自增主键（`scopes/models.py:78`），每次同步 `delete + 重建` 后 id 变化。**当前生产未配任何组织权限标签**，本次不受影响；但这是个潜在隐患，**二期应改为「按 code 稳定映射 / upsert 保号」而非全删重建**，否则将来配了标签再同步会错位。本方案不顺带解决，仅记录。
2. **同步顺序**：组织树依赖 `org_unit`，员工 `org_node_code` 依赖花名册自身的源端「组织节点编码」列。两表相互独立同步即可，无强制先后；但**首次上线**建议先同步 `org_unit`（建好树），再同步花名册（回填 org_node_code）。
3. **level 推算**：以 `RootOrg=1`，其直接子节点为 `level=2`，后续按 `parent_org_code` 链路向下递增。若未来组织单元表新增显式层级数字，可作为校验项，但当前不要依赖 `行政维度上级` 的文字值猜层级。
4. **is_active 语义变化**：旧组织树的 inactive 表示「该路径下只有离职员工」；新组织树的 inactive 表示组织单元自身状态非启用。前端 `include_inactive` 开关文案和验收口径要同步改为「含停用组织」，不再写「含离职员工节点」。
5. **迁移执行顺序**：如果同时做 `org_unit` 新表和 `org_node_code_2 → org_node_code` 收敛，建议放在同一个 `0044` 里原子完成；若拆成 `0044/0045`，必须保证 `0044` 先创建 `org_unit` 物理表，`0045` 再做花名册列收敛。

---

## 六、验收机制

### 验收 1　表与字段就位
- 启动后系统设置 → 字段管理，业务表下拉出现「组织单元」。
- 其字段含编码/组织名称/组织全称/行政上级组织编码/行政维度上级/状态/设立日期/生效日期/变动类型 9 项（**无「变动日期」**，日期口径为「设立日期 → 生效日期」）；`编码`(org_code) 标记为业务主键。

### 验收 2　组织树建出且结构正确
- 在「组织单元」数据源配好 report_id、执行「立即拉取」成功。
- 查库：`SELECT level, count(*) FROM org_tree GROUP BY level` 层级分布合理；`parent_id IS NULL` 的根节点唯一，且 `code='RootOrg'`。
- 抽查 3 个非顶层节点：其 `parent_id` 指向的父节点 code == 该节点源端 `行政上级组织编码`。
- 抽查空部门（没有员工的部门）：在 org_tree 中**能查到**（旧方案查不到，这是新方案的增量验证点）。
- 抽查停用组织：默认树接口不返回；带 `include_inactive=true` 时可返回。

### 验收 3　员工 org_node_code = 源端部门编码
- 同步花名册后，抽查若干员工：`org_node_code` 值为北森源端「组织节点编码」，且该值能在 `org_tree.code` 中找到对应节点。
- 物理表和字段元数据中不再存在 `emp_realtime_roster.org_node_code_2`；不要再用 `org_node_code_2` 作为验收对照列。
- 抽查源端编码为空的员工：`org_node_code` 为空（验证"留空不兜底")。

### 验收 4　两个字段收口
- 字段管理里不存在 `org_node_code_2`；最终只有 `org_node_code` 一列。
- `org_node_code` 列存的是真实编码（非 `L7_xxx` hash 形态）。
- `table_columns` 中 `emp_realtime_roster.org_node_code` 的 `scope_role='org_node_code'`，并且最好保留/补齐源端 `source_field_id`。

### 验收 5　权限按任意层级授权命中（核心价值验证）
- 配一个组织权限标签，授权某个**中间层部门**（含后代）。
- 用该标签下的账号查花名册：能看到该部门**及其所有下级部门**的员工，看不到平级/上级其他部门的人。
- 把该部门在北森改名后重新同步：**已配的权限标签仍生效**（验证抗改名——旧 hash 方案此处会失效）。

### 验收 6　回归
- 成本中心树、其他业务表同步、报表中台不受影响（本次未动其逻辑）。
- 既有花名册的其他字段、视图正常。

---

## 七、改动文件清单（一页速览）

| 文件 | 改动 |
|---|---|
| `backend/app/seed.py` | `_DATASOURCES_INIT` + `_BUILTIN_TABLES` 各加一条 `org_unit` |
| `backend/alembic/versions/0044_add_org_unit.py` | 新建：注册表 + 创建 `org_unit` 物理表 + 预 seed 9 字段（org_code 设主键，日期为设立日期/生效日期）+ 收敛花名册 `org_node_code_2 → org_node_code` |
| `backend/alembic/versions/0045_org_unit_establish_date.py` | 新建：收敛已上线生产库——删 `change_date`(变动日期) 物理列+元数据，加 `establish_date`(设立日期, order=65, 置于生效日期前) |
| `backend/app/datasources/sync_service.py` | 重写 `_sync_org_tree`（按 parent_org_code 建树，固定 `RootOrg` 虚拟根）；派发改 `org_unit` 触发并读取落库后实体行；删除 `_inject_org_node_code` 注入逻辑；`SOURCE_DROP_COLUMNS` 加 `org_unit:{变动日期,change_date}` 防源端字段复活 |
| `backend/app/trees/router.py` / 前端文案 | 组织树 inactive 语义改为「停用组织」，`include_inactive` 文案同步调整 |
| 字段管理（验收观察，非最终操作） | 最终不应再存在 `org_node_code_2`；只保留源端真实编码列 `org_node_code` |

> 部署：本方案为后端改动 + 迁移，需走 `git pull → docker compose up -d --build backend`（含 alembic 自动迁移），再到 UI 配 org_unit 接口、依次同步 org_unit 与花名册。详见部署手册 `memory/hr_portal_server_deploy.md` §4。
