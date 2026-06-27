# 权限管控完整方案 —— 现状真相 + 本轮收口

> 状态:**待你确认后进入开发**　｜　版本:v1（2026-06-18）
> 本文是**四层权限的唯一权威架构依据**,以代码现状（alembic 0037）为基线。
> 配套文档:前端维护操作见《[permission-admin-manual.md](./permission-admin-manual.md)》;旧蓝图 `permission-architecture.md` 已废弃。

---

## 〇、文档定位

旧的 `permission-architecture.md`(2026-06-09 蓝图)和 `L2权限管控逻辑.txt`(梳理稿)描述的"现状/漏洞",代码里**绝大部分已实现并修复**。三套说法并存是稳定性头号隐患。本文以亲验代码为准重新拉平,并写明本轮 L2 要补的缺口。

**本轮只动 L2 与一处 L3(脱敏不出库),L1/L4 维持现状(仅记录,不改)。**

---

## 一、四层权限总览

| 层 | 控制什么 | 实现 | 现状 | 本轮 |
|---|---|---|---|---|
| **L1 功能权限** | 进哪些菜单、点哪些按钮 | `role_menus` 固定 VCUDE 五列,多角色取并集 | ✅ 完善 | 不动 |
| **L2 数据范围** | 看哪些行(人/部门/成本中心) | 两段式标签 + org/cc 树 + `scope_filter` 注入 | ⚠️ fail-closed 已落地,但覆盖不全、有免控后门、缺穿透 | **G1/G3/G4/G5** |
| **L3 字段权限** | 看哪些字段、是否脱敏 | 字段分类 + 全局字段继承 + 工具白名单 + 三态裁决 | ✅ 模型完整,但脱敏真值会出库 | **G2** |
| **L4 资源授权** | 哪些报表/数据集能用 | `ReportAcl`/`DataSetAcl` + `_can_access` | ✅ 已接 list/detail/run/export | 不动(留一观察项) |

---

## 二、L1 功能权限(现状,本轮不动)

- **模型**(`users/models.py`):`Role` / `Menu` / `RoleMenu`(`can_view/create/update/delete/export` 五列 + `scope_dimension`) / `UserRole`。**固定 VCUDE,无自定义动作字典**(已定案)。
- **后端校验**:依赖注入 `require_op(menu_code, op)`(`core/deps.py:67-105`),无权 → 403。用户菜单经 `get_user_menus` 多角色取并集(`deps.py:108-190`)。
- **前端**:路由守卫 `router/index.ts:256-259` 按 `meta.menuCode` 拦截;按钮级 `components/PermissionButton.vue`(无权默认隐藏,可 `mode="disable"` 置灰);菜单树来自 `/auth/me` → `stores/user.ts`。

---

## 三、L2 数据范围(本轮主战场)

### 3.1 现状(已亲验)

- **fail-closed 已彻底落地**:`scope_filter.py:266-269` 表无 `scope_role` 列 → `false()`;`281-285` 标签维度在此表解析不到约束列 → 贡献 `false()`(注释:"旧逻辑此处放行=漏洞")。
- **用户范围 = 两段式标签**:组织段 `AND` 人员段(单标签内),多标签 `OR`。模型 `scopes/models.py`(ScopeTag/ScopeTagSelection/ScopeTagFilter/UserScopeTag)。
- **两棵树**:`org_tree`/`cost_center_tree`,唯一 `code` + 物化 `path`,子孙展开 `path LIKE 'xxx%'`(前缀匹配,可索引)。`data/models.py:108-150`。
- **免控后门**:`RegisteredTable.scope_exempt=True` → 整表放行(`scope_filter.py:262-264`)。当前 7 张业务表均未启用。

### 3.2 scope_role 覆盖矩阵(S0 实测,2026-06-11 备份)

| 业务表 | scope_role 实测 | 有 emp_id | 现状 |
|---|---|---|---|
| emp_realtime_roster | org_node_code / company_name(entity) / employee_type **3 维**(person 维当前未配) | ✓ | 受控 ✓ |
| **emp_monthly_salary** | **无** | ✓ | **非超管全挡死** |
| **emp_monthly_allocation** | **无**(cc_code 列存在但未标 scope_role) | ✓ | **全挡死** |
| cost_center_monthly | 无 | ✗(cc 主表) | 全挡死 |
| emp_monthly_cost_class | 无 | ✓ | 全挡死 |
| emp_monthly_cost_result | 无 | ✓ | 全挡死 |
| emp_severance_installment | 无 | ✓ | 全挡死 |
| emp_year_end_bonus | 无 | ✓ | 全挡死 |

> 证据:`backups/pre_naming_normalize_20260611_204025.sql` 的 `table_columns` COPY。
> **核心结论:除实时花名册外,所有业务表当前对非超管 fail-closed 全挡死。** G3 穿透 + 给关键表补 scope_role,不是优化,是让这些表"可用"的唯一路径。

### 3.2.1 L3 工资保护现状(S0 实测)= 空壳

- 「薪酬」敏感分类存在(id=1, is_sensitive=t),但 `field_category_assignments` / `role_visible_categories` / `user_visible_categories` **三表全空**,工资列也无 `is_sensitive`。
- 即**工资金额当前无任何 L3 保护**;现在不暴露只因整表被 fail-closed 挡死。
- ⚠️ **关键依赖**:G3 一旦让 HRBP 能看到工资表的行,若 L3 仍空,**工资金额会随行暴露**。故 **L3「薪酬」分类配置必须先于/同步于在工资表上启用 G3 穿透**(见阶段顺序)。

### 3.2.2 成本中心树现状(S0 实测)

- 473 个节点**全 L1、全叶子(扁平无层级)**,粒度到项目/业务线(如"梦幻花园-国内投放中心""S项目-S1")。
- HRBP 可按项目绑范围,但一个项目常对应**多个扁平成本中心**,需多选;无"项目节点含下级"。

### 3.3 本轮目标

| # | 目标 | 来源 |
|---|---|---|
| G1 | 删除免控白名单 `scope_exempt`,所有业务表无例外受控 | 你的决策 |
| G3 | 目标表无某维度列时,经主表子查询穿透过滤 → 既受控又可用 | 吸收点 4 |
| G4 | **多维标签 + 场景策略 `scope_strategy`**:同一用户在不同场景按不同维度过滤 | 吸收点 5(核心) |
| G5 | 多表 1:N JOIN 越权验证 | 你的决策 |

(G2 属 L3,见第四节)

### 3.4 G3 + G4 的配合模型(核心,务必理解)

**关键事实:同一个 HRBP 同时持有多个维度的范围标签,由"场景"决定激活哪个。**

例:HRBP A 同时持有 ① org 标签=游戏研发部(他的组织)② cc 标签=大闹天宫项目(他负责的项目)。
若两标签简单 OR,A 看花名册会渗入别部门的人、看分摊会渗入本部门在别项目的记录——**必须按场景隔离**。

**G4 = 每个场景声明 `scope_strategy`,只激活用户对应维度的标签:**

| 场景 | scope_strategy | 激活 | A 看到 |
|---|---|---|---|
| 人员明细 / 花名册 | `person_first` | A 的 org 标签 + 人员段 | 仅游戏研发部的人 |
| 项目分摊报表 | `cc_first` | A 的 cc 标签 | 大闹天宫项目上**所有人(跨部门)** |
| "我部门人在我项目上" | `cross_filter` | org AND cc | 两者交集 |

**G3 = 当场景要的维度列在目标表上不存在时,穿透主表补上:**
- HRBP B(组织=中台测试部)想看"我的人投到哪些项目" → 目标是分摊表,但分摊表**没有部门列**(只有 cc_code) → 走 person_first,引擎自动 `工号 IN (SELECT 工号 FROM 花名册 WHERE 部门=中台测试部)`。

**一句话:G4 决定"这个场景认哪个维度的标签",G3 决定"目标表缺这个维度列时怎么穿透主表筛出来"。两者配合,才能既不串台、又不漏看。**

> 实现要点:现有两段式标签**本就带 `dimension`(org / cost_center)**。`scope_strategy` 本质="本场景只激活用户哪种 dimension 的标签"。**不改标签模型**,只在过滤时按策略挑标签。

---

## 四、L3 字段权限(现状 + 本轮 G2)

### 4.1 现状(已亲验)

- **模型**:`field_categories`(含 `is_sensitive`) + `field_category_assignments`(物理列→分类) + `user_visible_categories` / `role_visible_categories`(授权) + `global_fields`(`category_id` 继承分类) + `field_category_tool_whitelist`(分类→`tool_key`)。
- **⚠️ 裁决前提:仅对被「敏感分类」(`is_sensitive=True`)标记的字段生效。** 裁决引擎的输入 `_table_sensitive_category_map`(`masker.py:114-138`)只捞 `is_sensitive=True` 的分类下的字段;非敏感分类**不参与 L3 管控**,其字段对所有人默认可见(仅受 L2 行级范围约束)。
  - **由此推论:要让「字段分类 + 角色授权」真正生效(即未授权该分类的用户看不到/被脱敏其字段),必须把该分类标记为「敏感」。** 建了非敏感分类、挂了字段、也给角色配了可见分类,这一整套授权对该分类字段**不产生任何效果**——字段照样所有人可见。换言之,字段分类管理功能 = 敏感字段管控功能,「敏感」开关是它的总开关。
- **三态裁决** `masker.resolve_field_access`(`masker.py:184-226`)(承上,仅敏感分类字段进入此裁决):有分类权限→原值可见;无→看工具白名单(在→原值可见,如补偿金/证明;不在→隐藏)。返回 `visible/mask/hide`。
- **补偿金/证明**已改白名单裁决(`tools/router.py:1094、1645`)。

### 4.2 缺口:脱敏真值会出库(G2)

- `data/router.py:275` 用 `select(Model)` 取**整行所有列**;脱敏在 Python 层替换 `******`,隐藏列在 `_row_to_item` 事后丢弃。`reports/sql_builder.py` 同理。
- 即:**脱敏列与隐藏列真值都已查到应用内存**,返回前才处理。
- **G2 目标**:改投影层——隐藏列不进 SELECT;脱敏列用常量 `literal('******')` 占位、不取真列。真值不出库。

---

## 五、L4 资源授权(现状,本轮不动)

- **模型**:`ReportAcl`/`DataSetAcl`(role_id / user_id)。
- **判定**:`reports/router.py:136-163`、`datasets/router.py:154-188` 的 `_can_access`——创建者/超管放行;报表 `is_published=True` 全放行;ACL 命中放行;无 ACL → 仅创建者。已接 list/detail/run/export(报表)、list/detail/update(数据集)。
- ⚠️ **观察项(本轮不改,留待确认)**:报表 `is_published=True` 对**任何登录用户**放行资源访问(行级 L2、字段级 L3 仍在 run 时生效,不构成行/字段越权,但"资源是否可见"绕过了 ACL)。若"全部受控"也要覆盖资源可见性,需后续单列议题。

---

## 六、本轮收口设计决策(最小改动优先)

- **G1 删免控**:移除 `build_scope_filter` 的 `_is_scope_exempt` 放行分支;`RegisteredTable.scope_exempt` 列废弃。前置安全:7 表均未启用,删除不改变任何表当前可见性。
- **G2 脱敏不出库**:投影层从 `select(Model)` 改为显式列投影,真值不入 SELECT。影响 `data/router.py` 行物化、`reports/sql_builder.py` SELECT 构建。属真实重构,单独成阶段、重点回归。
- **G3 全局关联 + 子查询穿透**:**不新建关联表**——在 `RegisteredTable` 加列声明"本表如何回主表取维度"(如 `roster_join_col`);`scope_filter` 对"无 scope_role 列但有 join 声明"的表生成 `emp_id IN (SELECT emp_id FROM emp_realtime_roster WHERE <org/cc约束>)`。复用现有 `org_tree.path`,**不引入**梳理稿的 `org_full_path`(名称拼路径 + `%/节点%` 包含匹配,脆弱且走不了索引)。
- **G4 多维标签 + 场景策略 `scope_strategy`**(详见 3.4):
  - 取值 `{person_first, cc_first, cross_filter}`,语义=本场景只激活用户哪种 dimension 的标签(person_first=org 标签+人员段;cc_first=cc 标签;cross_filter=两者 AND)。
  - **落点(已定):表级默认 + 报表/数据集覆盖**——
    - `RegisteredTable` 加 `scope_strategy` 默认值(花名册=person_first、分摊表=cc_first、工资表=person_first 等),直接浏览原始表时按默认走;
    - `reports` / `datasets` 加 `scope_strategy`(可空=继承表默认),需要特殊口径的报表再覆盖。
  - `build_scope_filter` 增 `strategy` 参数,按策略筛选用户标签的 dimension。
  - ⚠️ `cc_first` 会跨组织,属"特许穿透口径";多数场景默认从严(person_first / cross),`cc_first` 仅给确需跨部门看项目的报表显式设。

---

## 七、可执行任务清单(待你确认后开工)

> 格式对齐 `hr_portal_datasource_refactor.md`。所有项未开工。

### 阶段 0:盘点与边界确认(0 代码)

任务:
- [x] SQL 导出业务表 `table_columns` 实际 `scope_role` + emp_id 覆盖(见 3.2,仅花名册有 4 维,其余全无)。
- [x] 查工资 L3 现状(见 3.2.1:薪酬分类存在但 assignments/授权全空 = 无保护)。
- [x] 确认项目是否在 `cost_center_tree`(见 3.2.2:在,473 个扁平叶子,项目粒度)。
- [x] G3 穿透预期:目标表缺维度列时,经主表穿透按用户范围筛出(已确认)。
- [x] G4 落点:表级默认 `scope_strategy` + 报表/数据集可覆盖(已确认)。
- [ ] 逐表敲定默认 `scope_strategy`(花名册/工资=person_first、分摊=cc_first…)+ 允许 `cc_first` 的报表范围。
- [ ] 确认"项目→成本中心"映射(一个项目对应几个扁平成本中心,影响 HRBP 绑范围多选)。

验收:
- [x] 真实覆盖矩阵 + 工资 L3 现状 + 项目入树情况已产出(数据源:6-11 备份;Docker 起后可对当前库复核)。
- [ ] 各表默认策略书面敲定。

**阶段 0 结论(2026-06-18):**
- 现状比预想严重:**仅花名册受控,其余 7 表全 fail-closed**。G3 是"让这些表可用"的唯一路径,优先级最高。
- **工资 L3 是空壳**,且与 G3 存在**强顺序依赖**:在工资表启用 G3 穿透前,必须先配好「薪酬」敏感分类(挂字段 + 只授薪酬角色),否则 HRBP 看到行的同时会看到工资金额。
- 项目已在成本中心(扁平),G4 的 cc_first 可落地,但需解决"项目↔多成本中心"多选。
- 数据来自 6-11 备份(早于 0036/0037,但相关数据极可能未变);起 Docker 后用 SQL 对当前库复核一次即定稿。

### 阶段 1:删除免控白名单 `scope_exempt`

涉及文件:`permissions/scope_filter.py`、`data/models.py`、新迁移、`seed.py`

任务:
- [x] `build_scope_filter` 移除 `_is_scope_exempt` 放行分支。
- [x] `RegisteredTable.scope_exempt` 列废弃(迁移 `0039_drop_scope_exempt` drop column)。
- [x] 清理 seed / 测试 / 前端(FieldColumns.vue 免控开关、admin_tables.ts 类型)对 `scope_exempt` 的引用。

验收:
- [x] 任何业务表不再因免控放行(分支已删)。
- [x] 7 张表可见性与改造前一致(已知均未启用免控)。
- [x] 后端受影响测试通过(test_scope_filter_entity / test_admin_tables_router 全绿;全量 144 passed,另 2 项为历史遗留失败,与本次无关,已 stash 验证)。

**阶段 1 结论(2026-06-18):**
- 后端:`scope_filter.py` 删 `_is_scope_exempt` 函数 + 调用 + docstring;`data/models.py` 删列;`admin/tables_router.py` 删 4 处(Out/_to_out/UpdateIn/update_table)。
- 迁移:`alembic/versions/0039_drop_scope_exempt.py`(drop column,down 可逆)。
- 前端:`FieldColumns.vue` 删"数据范围免控"开关(ref/load/toggle/表单项);`admin_tables.ts` 删类型与 update body。
- 全仓 `scope_exempt` 残留 = 0(仅余迁移 0028/0039 自身)。
- ⏳ **未生效到运行容器**:后端镜像是 build 烘焙(无源码挂载)且落后(仅到 0037)。需 `docker compose build backend && up -d` 后 `alembic upgrade head` 才会应用 0038+0039 并激活新代码。建议与后续阶段一起批量重建,不逐阶段重启。

### 阶段 2:脱敏改"不出库"(投影层)

涉及文件:`data/router.py`、`permissions/masker.py`（报表 `sql_builder.py` 的不出库改归阶段 4,见下）

任务:
- [x] `data/router.py` 列表/导出从 `select(Model)` 改为显式列投影:隐藏列不选、脱敏列 `CASE WHEN col IS NULL THEN NULL ELSE '******'` 占位(真值不进 SELECT,保留 NULL)。
- [x] 行物化(`_row_to_item`/`_row_value`/导出)适配 Row 投影(getattr 兼容)。
- [x] distinct 下拉:隐藏/脱敏列直接 403(原来可对工资列取 distinct 泄露真值)。
- [x] 搜索/筛选:隐藏/脱敏列不参与 ILIKE/等值(堵反推)。

验收:
- [x] 抓编译 SQL 确认脱敏列以 CASE/`******` 占位、真列不进 SELECT;隐藏列既不投影也不搜索;distinct 拒绝(新增 3 个单测,全绿)。
- [x] 数据列表、CSV 导出、distinct 回归通过(test_data_router_entity 10 passed;全量 147 passed,另 2 项历史遗留)。

**阶段 2 结论(2026-06-18):**
- 后端 `data/router.py`:新增 `_scoped_projection()`(隐藏列跳过、脱敏列 CASE 占位);`query_table`/`export_csv` 改显式投影 + `.all()`,去掉 `apply_mask`(打码下沉到 SQL);`distinct_values` 拦截隐藏/脱敏列;搜索/筛选排除 `blocked = hidden ∪ sensitive`。
- 新增测试:脱敏列 SQL 占位、隐藏列不投影/不输出/不搜索、distinct 拒绝。
- ⚠️ **报表(`sql_builder.py`)的不出库归入阶段 4**:报表脱敏列原值要喂计算字段/聚合(服务端算),投影层硬打码会算坏;且报表当前**只打码、从不隐藏**(无 `get_hidden_columns`)。正解=无权字段彻底不进 SELECT、聚合也拒(VERDICT_HIDE),本就是阶段 4 统一裁决职责。当前报表脱敏值在出库后、序列化给客户端前已打码(不达客户端),阶段 4 收口真正不出库。

### 阶段 3:全局关联声明 + 子查询穿透

涉及文件:`data/models.py`、新迁移、`permissions/scope_filter.py`、`seed.py`

任务:
- [x] `RegisteredTable` 加 `roster_join_col`(本表关联花名册 `employee_no` 的列名)+ 迁移 `0040_roster_join_col`。
- [x] `scope_filter` 抽 `_build_tag_clause`;对"无 scope_role 列但有 roster_join_col"的表生成子查询穿透。
- [x] seed/迁移为 `emp_monthly_salary`、`emp_monthly_allocation` 配 `roster_join_col='employee_no'`。

验收:
- [x] 工资表/分摊表受限用户 → `employee_no IN (SELECT employee_no FROM 花名册 WHERE 标签子句)`,仅自己范围内(单测验证子查询 SQL)。
- [x] 无 join 声明且无维度列的表仍 fail-closed(单测覆盖)。
- [x] 子查询穿透单测覆盖(org 路;cc 路同机制,resolver 换 cc_code 列即可)。

**阶段 3 结论(2026-06-18):**
- 实测列名(实体重建后):花名册/工资表/分摊表的工号列均为 `employee_no`;`emp_monthly_roster` 仅基础列、`cost_result`/`cost_class`/`cost_center_monthly` 无工号列 → 这些表无法 emp 穿透,保持 fail-closed。
- `scope_filter` 主入口三分支:① 本表有 scope_role 列 → 直接解析(原逻辑);② 无 role 列但有 `roster_join_col` → 经花名册解析标签子句、回填为 `本表.join_col IN (SELECT 花名册.employee_no WHERE 子句)`;③ 都没有 → false。`org_scope_unlimited` 标签在穿透下短路为 true(含花名册外历史行)。
- `roster_join_col` 查询惰性触发(仅本表无 role 列时查),不打乱既有调用序。
- 新增测试:穿透生成子查询 SQL、无 role 无 join → fail-closed。全量 149 passed,另 2 项历史遗留。
- ⚠️ **缺口记录**:`emp_monthly_cost_result`(含薪酬,无工号列)目前无法行级穿透,仅超管可见。如需让 HRBP 看,需后续给它补 `employee_no` 列或专门维度。
- ⚠️ **上线强约束(重申)**:工资表穿透生效后,HRBP 即能看到工资表的行;**上线前必须先在「字段分类」页把工资字段挂入「薪酬」敏感分类并仅授权薪酬角色**,否则金额随行暴露(L3 当前为空,见 3.2.1)。

### 阶段 4:多维标签 + 场景策略 `scope_strategy`　★下次开发起点

> **状态:未开始(2026-06-18 暂停)。阶段 1-3 代码已完成并测试,代码库处于「阶段3完成」干净态。下次从 4a 起。**

涉及文件:`data/models.py`(RegisteredTable 默认)、`reports/models.py`、`datasets/models.py`、新迁移、`permissions/scope_filter.py`、`data/router.py`、`reports/sql_builder.py`、前端表/报表/数据集编辑页

**语义已定案(向后兼容)**:`scope_strategy` 按 `tag.dimension` 筛选参与的标签——
- `person_first` → 只用组织维度标签(`dimension='org'`,含其人员段)
- `cc_first` → 只用成本中心维度标签(`dimension='cost_center'`)
- `cross_filter`(默认) → **全部标签 OR(=现状,不改默认行为)**
- 注:真·"org AND cc 交集"暂不做(罕见、易混淆),记为未来可选;HRBP A/B 场景用 person_first/cc_first 即可满足。

**拆成 5 个子步(逐步验收):**

- [ ] **4a 引擎**:`build_scope_filter(user, table, db, strategy="cross_filter")` 加 `strategy` 参数 + `_filter_tags_by_strategy()`(按 dimension 筛标签,在 `_get_user_tags` 后、空检查前)。默认值=cross_filter 保持现状。单测三策略。
  - 起点代码位置:`scope_filter.py` 第 297 行 `tags = await _get_user_tags(...)` 后插入 `tags = _filter_tags_by_strategy(tags, strategy)`。
- [ ] **4b 模型/迁移/seed**:`RegisteredTable.scope_strategy`(默认列)+ `reports`/`datasets.scope_strategy`(可空,空=继承表默认)+ 迁移 0041。seed 表级默认:花名册/工资/月度花名册=person_first;分摊/成本结果/成本中心月度/成本分类=cc_first。
- [ ] **4c data 视图**:`data/router.py` 的 query_table/export/distinct 调 `build_scope_filter` 时传该表 `scope_strategy` 默认。
- [ ] **4d 报表**:`sql_builder` 按报表 `scope_strategy`(空则各 alias 取所属表默认)给每个 alias 传 strategy,**避免 cc_first 报表里花名册 alias 被独立 org 卡死**(3.4 HRBP A 用例);+ **报表不出库**:接 `get_hidden_columns` 让无权字段不进 `display_selected`/SELECT、聚合也拒。
- [ ] **4e 前端**:表/报表/数据集编辑页加 `scope_strategy` 选择项(person_first/cc_first/cross_filter)。

验收:
- [ ] HRBP A(持 org+cc 双标签):花名册 person_first 仅见本部门;项目分摊 cc_first 跨部门见全项目人员。
- [ ] HRBP B(org 标签):分摊表 person_first 经 G3 穿透,见本部门人投到的所有项目。
- [ ] 默认 cross_filter 行为与现状一致(回归)。
- [ ] 报表中无权字段不进 SELECT(抓编译 SQL 确认)、计算字段不被脱敏值算坏。

**4d 开发时待确认/注意:**
- 报表脱敏列若被计算字段/数值规则引用,投影层不能硬占位(会算坏)——这类列保持"取真值算→输出前打码";只有纯展示且无引用的脱敏列才投影占位。隐藏列(无权)则一律不进 SELECT。
- 分摊表按"成本中心(项目)"过滤的 cc 维度:分摊表实际列是 `code`/`dimension_value`(键值结构),不是简单 `cc_code`。HRBP A 的 cc_first 在分摊表上如何落地需在 4d/4b 时确认这张表的 cc 维度列怎么标 scope_role。

### 阶段 5:多表 1:N JOIN 越权验证

涉及文件:测试 + 必要时 `reports/sql_builder.py`

任务:
- [ ] 造 1:N 关联数据集报表测试用例。
- [ ] 验证 JOIN 后每个 alias 各自 `build_scope_filter` AND 的行级语义无越权、无漏看。
- [ ] 发现问题则修 sql_builder 的权限 alias 重建逻辑。

验收:
- [ ] 1:N 报表受限用户结果集 = 其权限内行,无多看、无少看。

### 阶段 6:回归与文档回写

任务:
- [ ] 后端全量测试 + 前端构建。
- [ ] 本文 + 维护手册回写实际实现(每阶段补"结论")。

验收:
- [ ] 全链路回归通过,文档与代码一致。

### 推荐执行顺序

S0 → S1 →(S2 / S3 可并行)→ S4 → S5 → S6。

---

## 八、风险点

| 风险 | 说明 | 缓解 |
|---|---|---|
| 删免控误伤 | 某表实际靠免控才可见 | S0 先盘点;已知 7 表均未启用 |
| 投影层重构波及面广 | `select(Model)` 改显式列影响多处取数 | S2 单独成阶段、专项回归 |
| 穿透子查询性能 | 大表 `emp_id IN (子查询)` | 必要时物化用户可见 emp_id 集合缓存 |
| scope_strategy 成越权口径 | `cc_first` 穿透组织 | 默认最严 + 穿透报表白名单 |
| 1:N JOIN 行级语义 | 多表 AND 后笛卡尔可能漏判 | S5 专项造数验证 |

---

## 九、决策记录与待办

**已拍板(2026-06-18):**
- G3 穿透预期:目标表缺维度列时,经主表按用户范围穿透筛出。✅
- G4 模型:同一用户持多维度标签;**表级默认 `scope_strategy` + 报表/数据集可覆盖**。✅
- L3 字段保护:机制就绪但**当前无种子配置**,需在"字段分类"页建「薪酬」敏感分类、挂工资字段、不授予 HRBP 角色(配置动作,非开发)。

**S0 待用 SQL 落实(只读):**
1. 7 表 `scope_role` 真实覆盖矩阵 + 有无 emp_id。
2. 工资字段当前受不受 L3 保护(`is_sensitive` / 敏感分类现状)。
3. "项目"是否已作为 `cost_center_tree` 节点(决定 HRBP 能否按项目绑范围)。
4. 逐表默认 `scope_strategy` + 允许 `cc_first` 的报表范围。

确认本任务清单后,我从 S0 的只读盘点开工。
