# 数据洞察统一入口：指标聚合查询与数据对比开发文档

版本：v2.0
日期：2026-07-20
状态：强批判评审修订完成，待按 P0 安全前置逐步实施
适用范围：HR Portal 的 AI 对话入口、数据对比能力、数据仓库指标管理、面向任意组织/人员范围普通用户的薪酬聚合查询与权限治理。

关联文档（按开发阅读顺序）：

- `specs/004-ai-native-workbench/README.md`：AI 公共协议权威边界和固定阅读顺序。
- `specs/004-ai-native-workbench/ai-native-development-principles.md`：Capability、Intent First、Context Packet、Policy Guard 与审计原则。
- `specs/004-ai-native-workbench/current-state-and-gaps.md`：AI 公共底座真实状态、缺口和禁止重建事项。
- `specs/004-ai-native-workbench/ai-capability-registry.md`：Capability、ChatRoute、Handler 与 Runtime 公共协议。
- `specs/004-ai-native-workbench/capability-result-envelope-atomic-tasks.md`：已发布的统一 `CapabilityResultEnvelope`、前后端同批发布与同步回滚要求。
- `specs/010-data-comparison-skill/spec.md`：现有跨表数据对比设计。
- `specs/012-data-warehouse-ucp-integration/spec.md`：ODS → DWD → DWS → ADS 分层、指标语义层和 AI 权限传播边界。
- `specs/012-data-warehouse-ucp-integration/atomic-tasks.md`：Y01～Y04、Y03 权限传播和小样本聚合防护的前置契约。
- `specs/012-data-warehouse-ucp-integration/metric-result-olap-roadmap.md`：现有 `metric_results` / `metric_result_rows`、全局 AI-ready 上下文和指标结果查询现状；其中普通用户 `summary_only` 是本需求 P0 待收口的遗留实现，不作为安全依据。

---

## 1. 背景与目标

### 1.1 背景

现有 `data.compare` 解决两组数据的差异核验，例如“月度花名册与工资表的人员是否一致”“两张表按部门汇总后的金额是否一致”。其 `CompareSpec` 强制包含 A/B 两个数据源，核心是双源关联、差异计算和差异明细。

业务还存在另一类高频诉求：在一张主题数据中按月或按组织查询当前授权范围内的汇总指标，例如：

- 拥有全量 scope 的用户查询 2026 年 6 月全公司应发工资总额。
- 普通 HR 查询其组织/人员范围内某月公司公积金、公司社保金额。
- 按部门查看当前授权范围内的应发工资分布。
- 查询当前可见成本中心某月的计薪人数和应发工资。

这类诉求不是“对比”，而是“指标聚合查询”。如果强行改造成 A/B 两表比较，会造成参数语义失真、权限判断遗漏、结果卡片混乱，也会让自动化和审计无法分清查询目的。

### 1.2 专家结论

1. **必须服务具有任意组织/人员范围的普通用户。** “仅超级管理员可查”或“普通用户只看全局摘要”不满足本需求；用户结果必须等于其当前授权 DWD 明细先过滤、再聚合的结果。
2. **scope 必须在聚合前下推。** 统一复用 `app/permissions/scope_filter.py::build_scope_filter()`，在源 DWD 查询的 `WHERE` 中注入组织、成本中心、人员、多标签和花名册穿透条件，再执行时间过滤、分组、金额聚合与人数去重。禁止对全局聚合结果做事后 JSON/Python 裁剪。
3. **Metric 与 DWS 定义口径，DWD 承载权限过滤后的在线聚合。** 自然语言先解析到已发布 Metric，再解析到审批发布的 `MetricOnlineQueryPlan`；Metric → `measure_key` 的唯一可执行绑定位于 Plan 关系表，Plan 引用已发布 DWS 聚合定义及其 DWD 来源，但实际执行必须保留聚合前 scope 下推能力。
4. **Scope 可解析必须有完整性证明。** `scope_strategy`、`scope_role` 或 `roster_join_col` 存在均不构成可执行授权。对当前 Plan、源表、策略、请求形状和当前用户实际激活的 tag，`ScopeResolutionProof` 必须逐项证明已启用的组织、成本中心、人员条件能在同一 DWD 源查询中完整表达；任一条件、穿透链或 alias 契约不可表达即 `scope_unresolvable`，不得退化执行。
5. **`ResolvedQueryPlan` 是执行期唯一快照。** Resolver 必须固定 Plan/Metric/Measure、DWS/DWD、scope、Query Shape 与 Release Gate 版本；Compiler、Executor、Formatter 和审计不得重新读取“最新配置”替代该快照。
6. **`metric_results` / `metric_result_rows` 不再是普通用户查询值来源。** 当前结果是无用户 scope 的全局快照，只用于指标后台、计算核验、刷新状态和血缘诊断；除非未来能证明物化分区与调用者 scope 完全等价，否则不得向普通用户或 AI 返回其中的数值与明细。
7. **禁止 AI 直接查询 ODS，DWD 也不是自由查询入口。** DWD 只能通过已发布、版本化、审批通过的 QueryPlan 被确定性服务访问；LLM、前端和调用方均不能提交物理表名、字段名、资产 ID、Join、SQL 或公式。
8. **用户入口统一，能力实现分离。** 前端提供一个“数据洞察”入口；内部保留 `data.compare` 与 `data.aggregate_query` 两个独立 Capability、Schema、Handler 和结果组件，不建立万能 `data.query` 执行能力。
9. **复用 004 公共 Runtime。** 新能力只追加现有 `CHAT_ROUTES`；目标 Capability Gate 必须在 Extractor 和 Context Packet 构建前执行；复用统一 Schema、Policy、Envelope、会话和 `system_logs` 审计，不新建平行 Router、公共 Policy Guard 或专用 AI 审计表。
10. **先安全收口，再逐步扩展。** P0 先封堵现有全局结果旁路并建立 QueryPlan；P1 交付单指标 scope-aware 在线聚合；P1B 经威胁模型后再做互补抑制；P2 才支持同源、同 Plan、同 scope contract 的多指标聚合。

### 1.3 目标

- 在 AI 助手及后续独立页面提供统一“数据洞察”入口，识别“对比”与“汇总查询”意图。
- 支持具有任意组织、成本中心、人员过滤及其组合范围的普通用户；仅当当前用户实际激活的每项 scope 约束都具有 `ScopeResolutionProof` 时才执行，权限变更在下一次查询立即生效。
- P1 支持通过 `P1 Query Shape Profile` 白名单的已发布薪酬指标单月、单指标、0～2 个受控组织类维度在线聚合；任何白名单外或无法静态证明安全的请求均拒绝。
- 每次执行使用不可变 `ResolvedQueryPlan`，展示其指标口径、Plan 版本、授权范围已应用说明、时间、过滤条件、来源层级、更新时间和保护状态，做到可解释、可审计。
- 真实 DWD、AI 指标 Context 和普通用户真实数值仅能由 `release_eligible` Plan 启用；其 012 Release Gate 的证据版本、适用范围和有效状态必须与本次执行快照匹配。
- 将现有数据对比接入统一产品入口，但不破坏 `CompareSpec`、对比模板和自动化设计。
- 默认 fail-closed：Capability、Metric、Plan、DWD 来源、scope 映射、敏感级别、人数口径、阈值或查询预算任一无法确认时，只能回问或拒绝，不返回数据。

### 1.4 非目标 / 不做范围

- 不开放 AI 或用户生成、提交或执行任意 SQL、Python、URL 参数、数据库函数、物理表名、字段名、资产 ID 或 Join。
- 不支持直接查询 ODS、外部系统原始接口、UCP 凭证、同步日志或 secret。
- P0/P1/P2 不支持员工个人工资明细、按姓名/工号检索工资、逐行明细导出或个人维度分组。
- 未来个人信息/个人薪酬查询必须注册独立 Capability，使用独立对象级/字段级权限、存在性防枚举、审批和审计；不得通过扩展 `data.aggregate_query` 偷渡实现。
- 不从全局 `metric_results` / `metric_result_rows` 读取后按 scope 事后过滤，不把 `summary_only` 当作普通用户的安全授权模型。
- 不以“把单表查询伪装成 A/B 对比”的方式复用 `CompareSpec`。
- 不建设第二套 Chat Router、AI Runtime、公共 Policy Guard、Context Packet、会话存储或 Capability Registry。
- 不新增业务专用 AI 审计表；统一复用 `system_logs`、`record_ai_log` 和 Envelope `trace_id`。差分查询预算另需并发安全的业务状态组件，不能用审计日志代替。
- 不建设完整数仓 ETL、通用 OLAP 或自动发布 DWS/ADS；继续遵循 `012` 的独立阶段任务。
- 不改变已发布的 AI 响应顶层协议，不恢复旧业务专属顶层字段。

---

## 2. 用户场景

### 2.1 普通业务用户：查询当前授权范围的月度薪酬

| 项目 | 设计 |
| --- | --- |
| 入口 | 全局 AI 助手的“数据洞察”快捷入口；后续可从指标详情进入同一查询面板。 |
| 用户范围 | 用户可仅拥有若干组织节点及其下级、若干成本中心、指定人员/用工类型/用工主体过滤，或多个标签组合。 |
| 操作 | 输入“查询 2026 年 6 月我能看到范围内的应发工资”。拥有全量 scope 的用户也可输入“查询全公司应发工资”。 |
| 系统处理 | Route 命中后先执行目标 Capability Gate；`PlanResolver` 解析已发布 Metric/QueryPlan；`build_scope_filter()` 根据当前用户实时权限生成 SQL 条件并在源 DWD 聚合前注入。 |
| 成功结果 | 返回当前授权范围重新聚合的指标值，展示口径、月份、Plan 版本、范围已应用说明、来源层级和更新时间；不得返回全局 `metric_result` 数值冒充用户结果。 |
| 无数据 | 当前 scope 过滤后无记录时返回 `outcome=no_data`；不得以零值代替，也不得自动扩大为全公司。 |
| 无权限 | 缺少 AI 入口、`system.data_insight` 或指标对象权限时返回 HTTP `403` 统一错误；不泄露指标值、物理对象或内部权限标签。 |
| 范围不可解析 | 源表缺少必要 `scope_role` 且无有效 `roster_join_col`、策略或别名映射失败时 fail-closed，不执行聚合。 |

### 2.2 HR 管理员：按部门查看授权范围内的薪酬结构

| 项目 | 设计 |
| --- | --- |
| 操作 | 输入“按部门查看 2026 年 6 月应发工资”。 |
| 系统处理 | 先过滤当前用户有权访问的 DWD 行，再按受控部门维度执行金额聚合和 `COUNT(DISTINCT employee_key)`。 |
| P1 初期结果 | 只有所有候选分组均满足安全阈值且不可由总计/边际查询反推时才返回；否则整单拒绝。 |
| P1B 结果 | 威胁模型、互补抑制和差分预算组件通过验收后，可返回经过主抑制与互补抑制的部分结果。 |
| 边界 | 不展示授权范围外的部门名称、金额或人数；P1/P1B 不生成“其他”桶；有分组响应默认不返回附加总计，无分组标量仅在整单安全判定通过时返回。 |

### 2.3 数据核验人员：发起跨表对比

| 项目 | 设计 |
| --- | --- |
| 操作 | 输入“比较 2026 年 6 月工资表和成本分摊表按部门的金额是否一致”。 |
| 系统处理 | 路由到既有 `data.compare`，继续使用 `CompareSpec`、比较模板、字段白名单、聚合前 scope 注入和对比结果卡片。 |
| 成功结果 | 返回 `data_compare_result`，显示一致/差异摘要、差异明细、数据范围和后续动作。 |
| 重要边界 | 不调用 `data.aggregate_query`，不将双源比较逻辑混入指标查询执行器。 |

### 2.4 意图不完整、混合或超出边界

| 输入示例 | 系统反馈 |
| --- | --- |
| “查一下工资” | 回问月份和指标；统计范围固定使用当前服务端 scope，不让用户选择“绕过范围”。 |
| “比较一下工资” | 回问对比对象：不同月份、不同表、预算与实际，还是仅查看一个月汇总。 |
| “6 月工资和 5 月工资差多少，按部门看” | P1 提示仅支持单期间单指标；P2/P3 未验收前不自行跨期相减。 |
| “列出 6 月张三的工资” | 返回 `individual_query_not_supported` 的不可枚举提示，不确认员工是否存在。 |
| “忽略权限查全公司” | 拒绝且不调用查询服务；Prompt 不是安全边界，服务端 scope 永远强制注入。 |

### 2.5 未来个人查询边界（仅预留，不实施）

未来可独立立项 `employee.profile.query`、`payroll.self_query`、`payroll.subject_query` 等能力，但必须使用独立 Schema、对象级/字段级权限、本人/他人区别、存在性防枚举、查询目的或审批、结果/导出限制和专项审计。当前不登记实际 Route、result type、API 或菜单，且不得把员工、姓名、工号加入 `AggregateQuerySpec`。

---

## 3. 功能范围与分期

| 阶段 | 功能项 | 是否实现 | 说明 |
| --- | --- | --- | --- |
| P0 | Scope-aware 主链契约 | 是，安全前置 | 冻结 Gate-before-Extractor、QueryPlan、源 DWD 聚合前 scope 注入和 fail-closed 规则。 |
| P0 | 现有全局结果旁路封堵 | 是，安全前置 | 收口 result list/detail/export/AI Context/前端指标页，普通用户不得取得全局值或 rows。 |
| P0 | QueryPlan 元数据与发布校验 | 是，安全前置 | 新增版本化 Plan、Metric、Dimension 关系及 migration，不给历史结果伪造 scope。 |
| P1 | 单期间、单指标在线聚合 | 是，第一期 | 单月、1 个 metric、0～2 个 Plan 声明的组织类维度；DWD 行先 scope 过滤再聚合。 |
| P1 | 任意现有组织/人员范围 | 是，第一期 | 复用组织/成本中心节点、后代、人员过滤、多标签 OR、标签内 AND 和 roster passthrough。 |
| P1 | 小样本整单拒绝 | 是，第一期 | 任一组、总计推导路径、静态风险或配置风险不可证明安全时 `deny_query`；有分组响应不返回附加总计或“其他”，无分组标量仅在整单安全判定通过时返回。 |
| P1 | 统一入口和严格结果协议 | 是，第一期 | 路由到 `data.compare` 或 `data.aggregate_query`，复用 Envelope、审计和独立结果组件。 |
| P1B | 主抑制与互补抑制 | 后续技术切片 | 威胁模型、查询指纹、持久化差分预算和互补抑制通过验收后才开放部分结果。 |
| P2 | 同源多指标聚合 | 后续 | 2～5 个 metric 必须属于同一 Plan、源 DWD、时间粒度、scope strategy、人员主键和安全策略；同一 scope-filtered 查询内计算多度量。 |
| P2 | 保存查询、订阅和自动化草稿 | 后续 | 每次执行重新计算 scope 和验证 Plan 版本；写操作走独立 capability、确认和审计。 |
| P3 | 多月趋势、环比/同比 | 后续 | 依赖时间口径、查询预算、趋势结果类型和跨期安全评审。 |
| P3 | 跨源 ADS / OLAP | 后续独立立项 | 不在应用层拼接不同全局结果或跨 scope strategy Join。 |
| 未来 | 员工个人信息或薪资明细 | 独立立项 | 不能继承 `data.aggregate_query` 的聚合权限和 Schema。 |
| 永不开放 | 任意 SQL、任意表、ODS 直查 | 否 | 不作为 AI 或普通用户能力开放。 |

---

## 4. 技术设计

### 4.1 数仓层级、指标口径与数据来源

#### 4.1.1 分层职责

| 层级/对象 | 在本需求中的定位 | 普通用户查询边界 |
| --- | --- | --- |
| ODS | 原始入仓、来源追溯和问题排查，字段可能未标准化、未去重或权限标签不完整。 | 永久禁止作为自然语言查询来源。 |
| DWD | 标准化实体列明细底座，保留人员、组织、成本中心、月份、金额和 scope 所需实体字段。 | P1/P2 在线聚合的实际输入；只能由审批发布且可形成 ScopeResolutionProof 的 QueryPlan 访问，并在聚合前强制注入服务端 scope。 |
| DWS | 已发布指标聚合口径、维度、度量和来源关系的定义层，可生成全局 View。 | 作为 QueryPlan 的口径与血缘依据；若 View 已丢失任意人员 scope 所需粒度，不得在 View 上事后过滤。 |
| ADS | 固定应用或跨源消费层。 | P3 独立评审；不得绕过 QueryPlan、scope 和小样本治理。 |
| METRIC | 定义指标是什么、如何计算、时间语义、负责人和敏感等级。 | 自然语言解析目标；可查询不等于可直接返回全局值。 |
| `MetricOnlineQueryPlan` | 将已发布 Metric/DWS 定义映射到可 scope 下推的 DWD 来源、稳定维度/筛选/度量、人口主键和安全限制。 | P0/P1 的唯一在线执行许可；未发布或不可解析即拒绝。 |
| `metric_results` / `metric_result_rows` | 当前系统级计算快照、指标后台展示、刷新状态和血缘诊断。 | 不是普通用户或 AI 的查询值来源；不得事后按 scope 裁剪。 |

#### 4.1.2 首期薪酬指标目录与 Plan 基线

实际 `metric_code`、DWS 定义、DWD 来源、实体列、人员主键和阈值必须在 P0 中由业务、数据和权限负责人确认，禁止模型或开发人员猜测。

| 指标中文名 | 建议 metric_code | 业务口径 | P1 QueryPlan 输入 | 时间粒度 | 可分组维度 | 敏感等级建议 |
| --- | --- | --- | --- | --- | --- | --- |
| 应发工资 | `payroll.gross_payable_amount` | 当月有效薪酬记录的应发金额之和；排除作废、重复、未确认记录。 | 已发布 DWS 定义对应、可通过 ScopeResolutionProof 的 DWD 实体列 | 月 | 部门、成本中心、法人/公司（以 Plan 为准） | 高 |
| 公司公积金 | `payroll.employer_housing_fund_amount` | 公司承担的住房公积金金额之和，不含个人缴纳部分。 | 同上 | 月 | 部门、成本中心、法人/公司（以 Plan 为准） | 高 |
| 公司社保 | `payroll.employer_social_insurance_amount` | 公司承担的社会保险金额之和，不含个人缴纳部分；险种拆分另行定义。 | 同上 | 月 | 部门、成本中心、法人/公司（以 Plan 为准） | 高 |
| 计薪人数 | `payroll.payroll_employee_count` | 与金额使用相同 scope、时间和业务过滤后的稳定员工主键去重数。 | 同一查询中的 `COUNT(DISTINCT population_employee_key)` | 月 | 与目标指标完全相同 | 中 |

`计薪人数` 是小样本判断依据，不得读取另一个时间、范围或过滤条件不同的独立全局结果代替。

#### 4.1.3 查询来源决策树

```text
自然语言 / 结构化请求
  -> 现有 ChatRoute 分类（AI 入口）
  -> route 命中后先执行目标 Capability Gate
       否 -> HTTP 403；不构建指标 Context Packet
       是 -> 构建当前用户可见、release_eligible 的 Metric/Plan 最小上下文
  -> AggregateQueryExtractor 输出受限 AggregateQuerySpec
  -> PlanResolver 是否找到已发布、有效且 release_eligible 的 Plan？
       否 -> 指标暂不支持安全查询；不得回退全局 result/ODS/自由 DWD
       是 -> 固定唯一 Metric/Measure binding、DWS/DWD、时间、人员主键、维度/过滤、阈值、P1 Query Shape Profile 和 Release Gate 证据，形成不可变 ResolvedQueryPlan
  -> ScopeResolutionProof 是否证明当前用户实际激活 tag 的每项组织/成本中心/人员条件均可在该 source 的直连列或有效 roster 穿透中完整表达？
       否 -> scope_unresolvable；不构造 SQL，不退化为较宽范围
       是 -> Compiler 固定 source_alias_name；build_scope_filter(..., table_alias=source_alias_name) 生成同名 alias 条件
  -> 编译产物是否证明 scope clause 绑定实际 DWD source FROM 的同名 alias，且未引入未批准 FROM？
       否 -> alias_contract_invalid；fail-closed
       是 -> 在同一受控查询中执行 scope/时间/Plan 过滤、GROUP BY、唯一 Measure binding 和 COUNT(DISTINCT population_employee_key)
  -> P1 StaticSafetyDecision 是否通过 P1 Query Shape Profile、人口阈值和静态推断规则？
       否 -> blocked，不返回分组、总计、人数或金额
       是 -> 最小化 P1 结果 -> Envelope -> system_logs
```

`build_scope_filter()` 当前只接受 `table_alias` 字符串，并在内部创建 SQLAlchemy `aliased()` 表达式；因此本契约要求 source alias 名称、传入字符串和编译后的 scope 列引用一致，不声称或依赖两个调用方持有同一个 Python alias 对象。不得通过正则、字符串替换或聚合后裁剪修复 alias。

P1B 只有在查询指纹、持久化差分预算、主抑制和互补抑制威胁模型通过后，才允许部分结果。P2 多指标必须在同一个 scope-filtered 查询中计算，不得拼接不同全局结果。

### 4.2 数据库 / 数据模型

#### 4.2.1 复用与扩展原则

- 复用 `warehouse_metrics`、`dws_aggregate_definitions`、DWD DataSet、`registered_tables`、`table_columns.scope_role`、`roster_join_col`、血缘和现有 scope 标签模型。
- `build_scope_filter()` 是组织/人员 SQL 条件的唯一构造入口；数据洞察模块不得复制标签、组织树、人员过滤或多标签组合逻辑。
- `metric_results` / `metric_result_rows` 保持全局快照定位，不给历史行回填虚假 `scope_applied`，也不作为普通用户 QueryPlan 输入。
- P1 不创建按用户预物化结果或缓存表；权限标签变化后，下一次在线查询必须重新构造 scope。
- P1 每次只允许一个指标；P2 才允许共享一个 Plan 和 scope contract 的同源多指标。
- 所有 Plan 配置引用稳定 ID/代码并通过 Pydantic/数据库约束验证，不保存任意 SQL 片段。
- `metric_query_plan_metrics` 是 Metric → `measure_key` 的唯一可执行真理源；Plan 主表不重复保存可执行 Metric 或 measure。
- `published` 只表示配置审批完成；只有 012 Release Gate 已接受、适用范围匹配且未撤销的 `release_eligible` Plan 才可进入普通用户目录、AI 指标 Context、Resolver 和真实 DWD 执行链路。

#### 4.2.2 新增 `metric_online_query_plans`（P0）

| 字段 | 类型/约束 | 说明 |
| --- | --- | --- |
| `id` | bigint / PK | Plan ID。 |
| `plan_code`、`version` | varchar / not null / unique pair | 稳定编码与不可变发布版本。 |
| `dws_aggregate_id` | FK / not null | 已发布 DWS 口径定义。 |
| `source_dataset_id` | FK / not null | 可形成 ScopeResolutionProof 的 DWD DataSet。 |
| `source_table_name` | varchar / not null | 必须存在于 `DATA_TABLES` 与 `registered_tables`；只由服务端维护。 |
| `scope_strategy` | varchar / not null | `person_first` / `cc_first` / `cross_filter`。 |
| `time_field`、`time_grain` | varchar / not null | P1 固定月度。 |
| `population_employee_key` | varchar / not null | Plan 固有安全契约：与唯一业务 Measure 使用同一过滤和范围的员工去重主键，不作为第二个 Metric/Measure binding。 |
| `allowed_filters`、`allowed_operators` | JSONB / not null | 稳定 filter code 白名单，不含物理字段或 SQL。 |
| `minimum_group_size` | integer / not null | 数据治理负责人确认的阈值。 |
| `suppression_mode` | varchar / not null | P1 仅 `deny_query`；P1B 才允许受控 suppression。 |
| `max_group_by_count`、`max_result_rows` | integer / not null | P1 分别不超过 2 和上线容量值。 |
| `query_timeout_ms`、`query_budget_class` | integer/varchar / not null | 查询成本和差分预算类别。 |
| `approval_status`、`status`、`release_eligibility` | varchar / not null | 仅 `approved + published + release_eligible` 可执行真实数据；`published` 本身不是充分条件。 |
| `release_gate_evidence` | JSONB / not null | 012 Release Gate 快照：四项控制的 evidence ID/version、验收人/日期、适用 Metric/DWS/source/dimension 范围与有效状态；不得由客户端写入。 |
| `effective_from`、`effective_to` | timestamptz / nullable | 有效期。 |
| `created_by`、`created_at`、`updated_at` | FK/timestamptz | 治理与追溯。 |

发布校验必须证明：唯一 Metric/Measure binding、DWS 定义、DWD DataSet 和源表血缘一致；对当前 source 与策略可生成 ScopeResolutionProof；人员主键、时间、维度实体列、P1 Query Shape Profile、阈值与敏感等级完整；012 Release Gate 四项证据均已接受、适用范围匹配且未撤销。`scope_strategy`、表中存在 `scope_role`、`roster_join_col`、`can_resolve_scope_strategy()` 或 `published` 任一项单独成立，都不构成真实数据可执行的充分条件。任何一项不满足都不可发布为 `release_eligible`。

#### 4.2.3 新增 Plan 关系表（P0/P2）

| 表 | 关键字段 | 用途与约束 |
| --- | --- | --- |
| `metric_query_plan_metrics` | `plan_id`、`metric_id`、`measure_key`、`display_order`；unique `(plan_id, metric_id)`、unique `(plan_id, measure_key)` | **唯一可执行 Metric → Measure binding。** P1 发布时恰有一个业务 binding；P2 支持同源多度量。binding 与 DWS/DWD 血缘不一致、缺失或重复均不可发布。不得将 `population_employee_key` 伪装为第二个运行时 Metric/Measure。 |
| `metric_query_plan_dimensions` | `plan_id`、`dimension_code`、`source_column_code`、`display_name`、`scope_role`、`sensitivity_level`、`is_groupable`、`is_filterable`；unique `(plan_id, dimension_code)` | 统一稳定维度 code 与 DWD 实体列映射；禁止员工、姓名、工号、证件等个人维度。 |

#### 4.2.4 Migration 与兼容性

1. P0 migration 只创建 QueryPlan 和关系表、外键、唯一约束及必要索引；不修改现有 `metric_results` 的业务值。
2. 不为历史全局结果回填 scope，不创建按用户缓存表。
3. `metric_online_query_plans` 至少建立 `(dws_aggregate_id, status)`、`source_table_name`、有效期、`(plan_code, version)` 与 `release_eligibility` 索引/约束；Metric/Measure 的索引和唯一性由 `metric_query_plan_metrics` 承担。
4. downgrade 只删除新增 Plan 元数据；不得删除指标、DWS 定义、结果快照、权限标签或审计日志。
5. `ai_skills`、`data.compare` 任务和结果保持不变；`AggregateQuerySpec` 不向 `CompareSpec` 增加单表模式。
6. 保存查询、持久化差分预算和自动化对象属于后续 migration，不在 P0 Plan 表中混入运行状态。
7. P0 可创建 QueryPlan 元数据。只有每项 012 Release Gate 证据均标记 `accepted`，且证据 ID、版本、验收人/日期、适用 Metric/DWS/source/dimension 范围、有效状态均能与 Plan version 匹配时，服务端才可写入 `approved + published + release_eligible`。Y0201/Y0301/Y0302/Y0303 缺失、过期、撤销或范围失配时 Plan 必须保持 `draft/blocked`；Catalog、AI 指标 Context、Resolver 和真实 DWD Executor 都不得将其视为可执行，不得访问真实 DWD 或以历史全局结果替代。
8. synthetic fixture、编译器单元测试和 feature-disabled 集成可引用非真实数据 Plan，但必须显式标记为非真实执行路径，且不能复用生产真实 source 或绕过 Release Gate。

#### 4.2.5 `ResolvedQueryPlan` 执行期快照（P0/P1）

`ResolvedQueryPlan` 是 Resolver 成功后创建的类型化内存快照，不新增运行状态表，也不允许后续组件以“重新读取最新 Plan”替换其中任何字段。它至少固化：

- `plan_id`、`plan_code`、`plan_version`；
- 来自 `metric_query_plan_metrics` 的唯一业务 `metric_id` / `measure_key` binding；
- DWS 定义 ID/version、DWD DataSet/source table、source schema 与血缘版本；
- `scope_strategy`、scope mapping 版本、`source_alias_name`、时间字段/粒度、`population_employee_key`；
- 已批准 dimensions、filters/operators、`P1 Query Shape Profile`、阈值、超时、行数和成本限制；
- Plan/DWS/Metric 的发布、有效期与 `release_eligibility` 快照；
- 012 Release Gate 的 evidence ID/version、适用范围与有效状态摘要；
- 响应 provenance 与审计所需的非敏感版本引用。

Compiler、ScopeAwareAggregateQueryService、StaticSafetyDecision、Formatter 和审计只能使用该快照。执行前若 Plan、binding、DWS、DWD source/schema、scope mapping 或 Release Gate 已撤销、失效或不再匹配，返回受控 `409` 重试语义；不得静默采用新版本，也不得执行旧快照。

### 4.3 后端接口

#### 4.3.1 AI 对话入口（复用现有 Runtime）

`POST /api/v1/ai/chat`

- 请求：复用已发布 AI 对话模型；允许 `page_context.module=data_insight`，但不得借此绕过权限。
- 响应：复用统一 `CapabilityResultEnvelope`，不得增加业务专属顶层字段。
- 路由：不新增 `DataInsightIntentRouter`；在现有 `CHAT_ROUTES` 追加 `data.aggregate_query`，保留既有 `data.compare`。
- **Gate 顺序：** Route 分类只使用能力描述；一旦命中 Route，必须在 `route.extractor()`、业务 Context Packet、PlanResolver 和 MetricCatalog 构建前校验目标 Capability 的 enabled/visible、`required_permission` 和公共 Policy。无权用户不得接触可见指标/Plan 候选；该 Target Gate 补充而不替代 `ai.chat` 入口校验和 Handler 的对象/范围/动作级校验。
- 会话：API 返回 Envelope `status=requires_input`；服务端在 `AiConversation.active_capability_id` 与会话槽位保存续接状态，不把 `active_capability_id` 加入响应顶层。
- 业务权限：Gate 通过后，`AggregateQueryAccessService` 先判定 `VisibilityEligibility`（Metric/Plan、字段敏感继承、Release Gate、目录可见性），再校验 `ResolvedQueryPlan`、ScopeResolutionProof、维度/筛选和 P1 静态安全；P1B 才增加持久化差分预算校验。不可见或未 release_eligible 的对象不得进入 Context Packet。
- 权限 code：P0 注册 `("system.data_insight", "V")`；`data.compare` 继续使用既有 `("system.data_compare", "V")`。
- 产品统一：前端“数据洞察”只是统一产品入口，不是统一 Handler，也不改变两个 Capability 的独立权限和 Schema。

#### 4.3.2 查询指标目录与口径

现有 warehouse 指标 API 仍是指标后台接口。数据洞察接口必须复用抽取后的单一 `MetricCatalogRepository/Service`，作为普通用户薄适配层，不得复制指标口径和权限逻辑。

| 接口 | Method | 请求/响应 | 权限与状态码 |
| --- | --- | --- | --- |
| `/api/v1/data-insight/metrics` | `GET` | 返回当前用户可见、`release_eligible` 且存在有效 QueryPlan 的指标摘要、P1/P2 阶段、可用稳定维度 code 和更新时间。 | `system.data_insight:V`；`200/401/403`。不返回物理表、字段、资产或 SQL。 |
| `/api/v1/data-insight/metrics/{metric_code}` | `GET` | 返回已授权口径、时间语义、Plan 声明维度、限制、负责人显示名和非敏感健康状态。 | 指标对象权限及 release eligibility；`200/401/403/404`；404/403 采用防枚举语义。 |

QueryPlan 的创建、审批、发布和失效属于数据仓库管理后台，只允许管理员维护；普通数据洞察入口不提供物理映射编辑能力。

#### 4.3.3 受控聚合查询

`POST /api/v1/data-insight/aggregate-query`

该结构化 API、AI Handler 和后续页面必须调用同一个 `ScopeAwareAggregateQueryService`，不得各自实现权限、编译、聚合或小样本逻辑。

P1 `AggregateQuerySpec` 和 `P1 Query Shape Profile`：

```json
{
  "metric_codes": ["payroll.gross_payable_amount"],
  "time_range": {"grain": "month", "start": "2026-06", "end": "2026-06"},
  "group_by": ["department"],
  "filters": [{"field": "company", "operator": "in", "values": ["company_a"]}],
  "output": {"format": "table", "include_definition": true}
}
```

P1 的完整允许集合如下；任何未明确允许的请求形状一律拒绝，不能以“后续再增加静态规则”放宽：

| 维度 | P1 允许 |
| --- | --- |
| Metric | 恰好 1 个，且是 `ResolvedQueryPlan` 中来自关系表的唯一业务 binding。 |
| 时间 | `month`，`start == end`，恰好一个月。 |
| 数据源 | 恰好一个已锁定 DWD source。 |
| 分组 | 0～2 个 Plan 声明、组织类、非个人且 `is_groupable=true` 的稳定 dimension code。 |
| 筛选 | 仅 Plan 白名单 filter code/operator/value 域；不包含个人标识或 scope 覆盖条件。 |
| 范围 | 完全由服务端实时 scope 决定；客户端没有 scope 参数。 |
| 输出 | 标量或分组行二选一；不请求总计、边际、小计、排名、“其他”、明细或导出。 |
| 指标计算 | 唯一 Measure binding 与同查询人口计数；不引用 `metric_results`、全局 DWS View 或第二来源。 |
| Alias | Compiler source alias 名与 `build_scope_filter(..., table_alias=<同一字符串>)` 完全一致。 |

P1 静态拒绝矩阵：

| 请求或配置形状 | P1 行为 | 稳定 reason code |
| --- | --- | --- |
| 多指标、多个 Plan 或多个 source | 拒绝 | `unsupported_query_shape` |
| 非单月、跨月、环比、同比、期间差 | 拒绝 | `unsupported_time_shape` |
| 超过两个分组维度 | 拒绝 | `unsupported_grouping_shape` |
| 个人、姓名、工号、证件、岗位等个人维度或筛选 | 拒绝 | `individual_query_not_supported` |
| 未声明 dimension/filter/operator 或超出值域 | 拒绝 | `plan_whitelist_violation` |
| scope、表名、字段、SQL、Join、资产 ID、result ID 输入 | 输入拒绝 | `invalid_query_spec` |
| 分组同时请求总计、边际、小计、排名或“其他”桶 | 拒绝 | `unsafe_aggregate_shape` |
| 可能构成补集、相邻集合，或不能由 P1 静态规则证明安全的筛选组合 | 整单拒绝 | `static_inference_risk` |
| ScopeResolutionProof、alias 契约、人口主键、阈值、binding 或 Release Gate 缺失 | 整单拒绝 | 对应安全 reason code |
| 任一组低于阈值或总计/边际可推导 | 整单拒绝 | `small_group_blocked` / `unsafe_aggregate_shape` |

响应 `AggregateQueryResult` 位于 Envelope `result.data`，类型只由外层 `result.type=data_aggregate_result` 表示，`result.data` 不重复 `result_type`。

P1 有两种**互斥**的成功形态：

1. **无分组标量查询**：`group_by=[]`，且同一 scope、时间和业务过滤下的人口阈值、P1 Query Shape Profile 与 StaticSafetyDecision 均通过时，才返回唯一的 `overall_value`；不得同时返回分组、边际或补充总计。
2. **有分组查询**：只返回受控 `rows`；P1 不返回 `overall_value`、`metrics[].value`、`grand_total`、边际合计或“其他”桶。任一候选组、总计推导路径或静态风险规则无法证明安全时，整单 `blocked`，不返回金额、人数或组名。

以下为 P1 有分组查询示例：

```json
{
  "outcome": "data",
  "metrics": [{"metric_code": "payroll.gross_payable_amount", "display_name": "应发工资", "unit": "CNY", "definition_version": "v1"}],
  "overall_value": null,
  "dimensions": ["department"],
  "rows": [{"dimensions": {"department": "人力资源部"}, "values": {"payroll.gross_payable_amount": "120000.00"}}],
  "time_range": {"grain": "month", "start": "2026-06", "end": "2026-06"},
  "data_provenance": {"query_mode": "scope_aware_online_aggregate", "source_layer": "DWD via approved DWS plan", "plan_code": "payroll_gross_monthly", "plan_version": "v1", "refreshed_at": "2026-07-01T02:00:00+08:00"},
  "reason_code": null,
  "definition_refs": ["payroll.gross_payable_amount"]
}
```

单一真理源规则：

- Envelope `permission.filtered` 表示本次是否应用数据范围；`masking.applied` 表示是否真实脱敏。
- `result.data` 不再重复 `scope_applied` 或 `masked_fields`。
- `metrics` 只承载指标元数据，绝不承载数值；`overall_value` 仅用于已通过安全判定的无分组标量响应。
- P1 分组响应不返回总计是 Query Shape 的固定输出契约，不是 suppression；前端以非敏感说明解释该查询模式不提供总计。
- `outcome` 固定为 `data | no_data | blocked | partial`；前端不得根据 `rows.length` 猜测语义。
- P1 只产生 `data/no_data/blocked`，不输出 `suppression` 对象，也不产生 `partial`。P1B 才允许 `partial`、`suppression`、主/互补抑制数量与 `grand_total_hidden`。

状态语义分为两层：

##### 结构化业务 API

| HTTP 状态码 | 触发条件 | 用户可见语义 |
| --- | --- | --- |
| `200` | 成功、无数据或可预期业务阻断；使用 `outcome/reason_code` 区分。 | 数据、空态或受保护。 |
| `400` | 客户端 Schema、时间、维度、筛选或 Plan 白名单校验失败。 | 修改查询条件。 |
| `401` | 未登录/会话过期。 | 重新登录。 |
| `403` | 缺少菜单、Capability 或指标对象权限。 | 统一无权提示，不展示对象细节。 |
| `404` | 指标或 Plan 不存在/未发布；按防枚举规则返回。 | 当前指标不可用。 |
| `409` | Plan/Metric/DWS 版本执行中变化。 | 刷新后重试。 |
| `429` | 基础频率或执行成本限制；P1B 才可包含持久化差分预算超限。 | 稍后重试或缩小问题。 |
| `500/503` | 配置、编译、输出协议、数据库依赖或其他未预期异常。 | 统一提示和 `trace_id`。 |

##### AI 对话 API

- 条件不完整：HTTP `200` + `status=requires_input`。
- `outcome=data/no_data`：HTTP `200` + `status=succeeded`。
- P1B `outcome=partial`：HTTP `200` + `status=partial_success`。
- 小样本、范围不可解析、静态风险规则或安全配置缺失：HTTP `200` + `status=failed` + 稳定 reason code。
- 缺少入口、目标 Capability 或指标对象权限：HTTP `403`。
- Plan/Metric/DWS 版本在执行中变化：按防枚举和会话协议返回受控重试语义，不泄露内部版本对象。
- 输出 Schema、Compiler/Repository 配置错误、数据库依赖或其他未捕获异常：HTTP `500/503` + `trace_id`。

领域异常映射以**语义**而非语言运行时异常类型决定：输入和白名单校验才映射为 `400`；权限、对象不可枚举、版本竞争、基础限流和业务安全阻断分别按上表处理。不得将裸 `ValueError` 或其他未声明内部异常一律映射为 `400`，也不得把 SQL、物理对象、scope 明细或原始异常文本返回给用户。

Capability Handler 只做业务结果到 Envelope 的映射；不得把结构化 API 的 HTTP 状态机械扩展成新的 Envelope status。

### 4.4 业务逻辑与高组件化设计

#### 4.4.1 后端目录与组件边界

```text
backend/app/data_insight/
├── router.py
├── schemas/
│   ├── aggregate_query.py
│   └── plans.py
├── repositories/
│   ├── plan_repository.py
│   └── metric_catalog_repository.py
├── services/
│   ├── plan_resolver.py
│   ├── access_service.py
│   ├── query_compiler.py
│   ├── scope_query_service.py
│   ├── multi_metric_query_service.py
│   ├── suppression_service.py
│   ├── query_budget_service.py
│   └── result_formatter.py
└── ai/
    ├── context_builder.py
    ├── extractor.py
    └── handler.py
```

| 组件 | 单一职责 | 禁止事项 |
| --- | --- | --- |
| 现有 `CHAT_ROUTES` | LLM-first 意图分类和会话续接。 | 不建第二 Router，不在此查询指标值。 |
| 公共 Target Capability Gate | Route 命中后、Extractor 前校验 enabled/visible/permission/Policy。 | 无权时不得构建业务 Context Packet。 |
| `data_insight.ai.context_builder` | 调用现有公共 `build_context_packet()`，装入最小可见、`release_eligible` 的 Metric/Plan 摘要。 | 不复制 Context Packet 顶层协议，不放物理映射、全局结果值或未通过 Release Gate 的候选。 |
| `AggregateQueryExtractor` | 自然语言转受限 Spec/missing_fields。 | 不输出物理表/字段、SQL、Join、scope 或结果。 |
| `PlanResolver` | metric code → `release_eligible` Plan/version，读取唯一 Metric/Measure binding 并生成不可变 `ResolvedQueryPlan`。 | 不以最新全局 result、最新配置或 Plan 主表重复字段替代 binding/snapshot。 |
| `AggregateQueryAccessService` | 执行 Visibility Eligibility、指标对象、维度/筛选、Release Gate、ScopeResolutionProof、敏感和 Query Shape 校验。 | 不复制公共 Capability Gate 或 scope 标签逻辑；不将 metadata 存在误判为 scope 完整。 |
| `QueryCompiler` | 用 SQLAlchemy、ResolvedQueryPlan 稳定映射和受控 `source_alias_name` 构造源查询。 | 不接受自由 SQL，不拼客户端标识符，不用字符串修复 alias。 |
| `ScopeAwareAggregateQueryService` | 调用 `build_scope_filter()`，在聚合前完成 ScopeResolutionProof、范围、时间、业务过滤、唯一 Measure 和人口计数。 | 不查询全局 `MetricResult`，不做聚合后 Python scope 裁剪，不让人员条件退化为较宽范围。 |
| `StaticSafetyDecisionService` | P1 白名单形状、整单判定、静态推断风险与稳定 reason code。 | 不产生 partial/suppression，不把日志当预算状态。 |
| `SuppressionDecisionService` | P1B 主抑制、互补抑制、总计安全和 partial 决策。 | P1 不调用；不泄露隐藏组身份。 |
| `QueryBudgetService` | P1 执行频率/成本限制；P1B 扩展为持久化差分预算。 | P1 不得声称可记忆跨请求差分，不得用日志或内存计数冒充预算状态。 |
| `AggregateResultFormatter` | 只接收安全化结果并生成类型化 data。 | 不重新聚合、相减或推断不可见信息。 |
| `record_ai_log/system_logs` | 统一 AI 审计。 | 不保存 SQL、DWD 行、工资明细、完整 scope 集合或 Prompt。 |

现有模块边界：

- `app/ai/router.py` 只新增公共 Gate 调度点、Result Schema 与 ChatRoute；业务实现放 `app/data_insight/`。
- `app/permissions/scope_filter.py` 是唯一 scope 条件构造器。
- `app/warehouse/service/modeling.py` 继续处理全局指标计算和后台快照，不承担普通用户在线查询。
- `app/warehouse/router.py` 的旧结果出口在 P0 统一收口，不再各自使用 `_is_super_admin` 作为完整数据范围模型。

#### 4.4.2 聚合前 scope 注入契约

```text
ResolvedQueryPlan
  -> source_table_name 必须存在于 DATA_TABLES，且 Plan 已 release_eligible
  -> ScopeResolutionProof 枚举当前用户被 strategy 激活的 tag 与其中启用的组织/成本中心/人员条件
  -> 每项条件必须能在 source 直连 role 列或有效 roster passthrough 中表达；不可表达即 scope_unresolvable
  -> Compiler 固定受控 source_alias_name
  -> build_scope_filter(user, source_table_name, db,
                        strategy=resolved_plan.scope_strategy,
                        table_alias=resolved_plan.source_alias_name)
  -> SELECT approved_dimensions,
            unique_measure_expression,
            COUNT(DISTINCT population_employee_key)
     FROM DWD source AS source_alias_name
     WHERE scope_clause
       AND period_filter
       AND plan_whitelist_filters
     GROUP BY approved_dimensions
  -> 编译验证 scope clause 的 source 列都绑定该实际 FROM alias，且无未批准 FROM
  -> query timeout / row limit / cost budget
  -> P1 StaticSafetyDecision 或 P1B SuppressionDecision
```

- `scope_clause=true()` 仅表示超管或已配置无限范围标签；未知映射不得回退为 `true()`。
- `false()`、无 scope 标签、无 role、roster passthrough 失效、alias 名冲突/遗漏、未批准 FROM，或当前激活 tag 的任一启用条件不可表达，均返回空集或受控拒绝，不扩大范围。
- `person_first` 只激活 `dimension=org` tag；`cc_first` 只激活 `dimension=cost_center` tag；`cross_filter` 激活全部 tag。P1 Plan 只能承诺其 `ScopeResolutionProof` 覆盖的策略语义，不能笼统承诺所有 tag 组合均已表达。
- 当前公共 helper 对某些缺失人员列可能返回“不参与约束”的通用行为，不得作为 P1 薪酬 QueryPlan 的降级授权语义；已激活 tag 的人员条件未能在 source 或 roster 完整表达时必须拒绝。
- `build_scope_filter()` 的 alias 参数是字符串，内部自行创建 `aliased()`；安全证明只要求 source alias 名、传入字符串和编译列引用一致，不要求同一 Python alias 对象，也不得正则/字符串重写 SQL。
- 多表 Plan 不进入 P1；P2 仍只允许一个具有完整 ScopeResolutionProof 的源查询内多度量，不允许跳过无法解析的 alias。
- 查询服务使用只读、最小数据库权限和短事务；审计使用现有独立短事务语义。

#### 4.4.3 意图与上下文规则

1. Route 分类只使用能力描述和会话状态；不把敏感指标目录放入分类器上下文。
2. Target Gate 通过后，业务 Context Packet 才包含当前用户可见、`release_eligible` 且 ScopeResolutionProof 可成立的 Metric/Plan 摘要；不可执行对象不作为“候选”泄露。
3. Context 不含全局 `summary_value`、结果 rows、DWD 样例、物理列、表、SQL、完整组织列表或权限标签。
4. Extractor 只输出稳定 metric/dimension/filter code、月份和 output；低置信度返回 `missing_fields`。
5. 续接状态保存在 `AiConversation.active_capability_id/state`；前端不通过关键词猜测。
6. 指标、月份或意图混合时回问；当前 scope 不需要用户补齐或确认，始终由服务端决定。

#### 4.4.4 与现有数据对比的整合

- **统一：** 产品入口、ChatRoute 主链、Gate、Context Packet、Capability 注册、Envelope、审计、加载/权限/错误态和发布验证。
- **分离：** 对比使用双源 `CompareSpec`/`data_compare_result`；聚合使用 Metric/Plan/`AggregateQuerySpec`/`data_aggregate_result`。
- **共享底层：** 两者都可复用 `build_scope_filter()`，但各自使用独立业务编译器和结果组件。
- **禁止万能父能力：** `data.query` 只作为能力族概念，不成为执行入口。
- **后续组合：** 趋势和期间比较必须由后端独立 QuerySpec/Capability 执行；前端不得自行相减。

### 4.5 前端与 UI/交互（高组件化）

前端遵守项目“页面只组装、一个组件只管一件事、共享能力放 `components/`、超过 200 行继续拆分”的强制规范。

```text
frontend/src/
├── api/
│   └── data-insight.ts
└── components/data-insight/
    ├── DataInsightEntry.vue
    ├── DataInsightResultDispatcher.vue
    ├── AggregateResultCard.vue
    ├── AggregateMetricSummary.vue
    ├── AggregateDimensionTable.vue
    ├── AggregatePolicyNotice.vue
    ├── MetricDefinitionDrawer.vue
    └── DataInsightClarificationPanel.vue
```

| 组件 | 单一职责 |
| --- | --- |
| `GlobalAiAssistant.vue` | 只接收 Envelope，将 `data_aggregate_result` 委托给 Dispatcher；不计算、裁剪、隐藏或相减。 |
| `DataInsightEntry.vue` | 示例问题、页面上下文、Capability 禁用提示；不提供 scope 选择器或物理对象入口。 |
| `DataInsightResultDispatcher.vue` | 仅按 `result.type` 分派 Aggregate/Compare 组件；未知类型纯文本降级。 |
| `AggregateResultCard.vue` | 组合摘要、维度表、保护提示和口径抽屉；只消费后端已安全化结果。 |
| `AggregateMetricSummary.vue` | 指标名称、金额/数量、单位、口径版本和 Plan 版本。 |
| `AggregateDimensionTable.vue` | 展示受控维度结果，遵守 Element Plus 表格五件套；不在前端二次汇总。 |
| `AggregatePolicyNotice.vue` | P1 展示“已按当前范围聚合”“查询模式不提供总计”或整单阻断的非敏感说明；P1B `partial` 才展示 suppression 摘要。 |
| `MetricDefinitionDrawer.vue` | 展示已授权口径、时间粒度、限制和非敏感血缘说明。 |
| `DataInsightClarificationPanel.vue` | 只从后端返回的可选 metric/dimension/filter code 补齐条件。 |

P1 交互要求：

1. 显示查询月份、指标、ResolvedQueryPlan 版本、范围已应用说明、来源为“经审批且已通过发布门禁的计划从 DWD 安全聚合”和更新时间。
2. P1 成功仅展示单指标摘要和可选维度表，不承诺趋势图或通用图表 Schema。
3. `outcome=no_data` 显示授权范围内无数据，不渲染金额 `0`。
4. `outcome=blocked` 只显示稳定安全提示和修改条件，不透露触发阈值的部门、人数或金额。
5. P1 分组结果以固定非敏感文案说明不提供总计；只有 P1B `partial` 才展示 suppression 摘要，且不显示被隐藏组身份、阈值和“其他”桶。
6. 只提供 `修改条件`、`查看口径`、`重新查询`；保存、导出、订阅和自动化后续独立授权。
7. 无权限、无数据、小样本、安全配置缺失、Release Gate 阻断和异常必须是不同状态。

禁止：展示 ODS/DWD 表选择器、字段下拉、SQL、DWS View、权限标签明细、“忽略权限”按钮；前端不得用隐藏行和总计做减法，不得把多个结果拼成新指标。

### 4.6 权限、安全与外部系统

#### 4.6.1 Visibility Eligibility 与执行底线

`VisibilityEligibility` 只决定用户是否可见候选 Metric/Plan、是否可构建最小 Context，以及是否可进入 Resolver；它不替代 ScopeResolutionProof、P1 StaticSafetyDecision 或 P1B Suppression Protocol。

| 层级 | 必须校验内容 |
| --- | --- |
| 身份与 AI 入口 | 登录状态；AI 对话额外校验 `ai.chat`。 |
| Target Capability Gate | Route 命中后、Extractor 前校验 `data.aggregate_query` 的 enabled/visible、`("system.data_insight", "V")` 和公共 Policy。 |
| Visibility Eligibility | Metric 对象权限、字段敏感/hidden/masking 继承、Plan 有效期，以及 `approved + published + release_eligible`；未通过对象不得进入目录、Context 或 Resolver。 |
| 012 Release Gate | Y0201/Y0301/Y0302/Y0303 或正式等价窄切片的证据 ID/version、适用范围、有效状态均与 Plan version 匹配；任一缺失、过期、撤回或范围失配即 `draft/blocked`。 |
| DWS/DWD 契约 | DWS 定义、DWD DataSet、source table、时间、唯一 Measure binding、维度、人员主键和血缘一致。 |
| ScopeResolutionProof | 对当前用户被策略激活 tag 的每项组织/成本中心/人员约束均可在同一 source/roster 路径表达；metadata 存在不等于 proof 成立。 |
| 行级范围 | 服务端实时调用 `build_scope_filter()`；当前客户端条件不能扩大或替代 scope。 |
| Static Safety / Suppression | P1 执行 Query Shape 与整单静态安全判定；P1B 才允许持久化预算、互补抑制和经证明可安全返回的总计。 |
| 动作权限 | 保存、导出、订阅、分享、自动化独立授权与确认；P1 不开放。 |

新增 `system.data_insight` 时必须按三级菜单 SOP 同批完成后端 `MENU_TREE`、前端 `meta.menuCode`、`PermissionButton`、后端重启和角色矩阵配置；code 投产后不得修改。

#### 4.6.2 P1 Static Safety Decision 与 P1B Suppression Protocol

##### P1：Static Safety Decision（仅整单返回或阻断）

- `ResolvedQueryPlan`、ScopeResolutionProof、P1 Query Shape Profile 与 Visibility Eligibility 全部通过后，同一 scope-filtered 源查询才可同时计算唯一指标度量和 `COUNT(DISTINCT population_employee_key)`。
- 任一候选分组低于 `minimum_group_size`、人口依据缺失、总计或边际结果可推导、QueryPlan 不完整、Release Gate 失效或静态风险规则命中时，整单 `outcome=blocked`。
- 不返回任何分组、总计、人数、金额、隐藏组织身份、阈值或排名；不生成“其他”桶。
- P1 只允许 §4.3.3 的完整 Query Shape 白名单；对可能构成补集、相邻集合或无法静态证明安全的筛选组合直接以 `static_inference_risk` 拒绝。
- P1 只产生 `data/no_data/blocked`，不产生 `partial`，不执行主/互补抑制，也不输出 `suppression` 对象。
- P1 可实施基础频率、超时和成本限制，但**不声称具备跨请求差分预算、相邻集合记忆、重放或跨版本攻击防护**；不得以 `system_logs`、内存计数或空接口冒充该能力。

##### P1B：Suppression Protocol（主抑制、互补抑制与持久化差分预算）

只有完成独立威胁模型、规范化查询指纹、持久化并发安全预算、TTL/清理和交叉维度攻击测试后才可启用：

1. 主抑制隐藏低于阈值分组。
2. 互补抑制额外隐藏最小必要的可见分组，使总计或边际结果无法解出主抑制值。
3. 总计默认隐藏；仅 Suppression Service 能证明不可反推时才返回。
4. 仅 P1B `partial` 返回 `suppression`，其中只含主/互补抑制数量和 `grand_total_hidden`，不返回被隐藏组身份。
5. P2 多指标采用最严格阈值和策略，任一指标不安全则整单拒绝。
6. 查询指纹、原子预算扣减、并发语义、过期、重放、跨 Plan/version 和跨 scope 归一化均属于 P1B 的持久化状态组件；预算状态不能依赖审计日志即时计数。

#### 4.6.3 现有全局结果旁路封堵（P0）

P0 必须统一盘点并收口所有 `MetricResult/MetricResultRow` 读取出口，包括：

- `GET /warehouse/metrics/{metric_id}/results`；
- result detail；
- result export 及导出相关入口；
- 指定周期的指标解释、结果引用和其他读取 `MetricResult.value` 的间接出口；
- `GET /warehouse/metrics/{metric_id}/ai-context`；
- 前端指标详情及其他直接读取结果 JSON 的入口。

**普通用户、AI 和数据洞察入口不得取得全局快照的任何值或可推导摘要**：包括未按当前 scope 聚合的 `summary_value`、measures、dimensions、row_count、total、rows、派生解释文本和 AI Context。`summary_only` 不是普通用户安全授权模型；在 scope-aware 查询未上线前，普通入口只能获得口径、刷新状态或明确的安全查询引导，不能误显全局值。

全局快照仅可用于**后台快照诊断**，并且必须满足独立契约：使用经三级菜单 SOP 确认的专用管理权限、独立 UI 语义、非 AI 查询用途和完整审计。实施前必须明确适用角色、权限 code、菜单入口、审计责任和可见范围；不得将 `warehouse.metrics:V`、`warehouse.metrics:E` 或 `_is_super_admin` 解释为向普通用户或 AI 暴露全局结果的充分依据。list/detail/export/explain/AI Context 等出口必须统一经 ResultAccessService（或等价公共服务）按调用主体和用途执行 `deny`、`metadata_only` 或 `admin_diagnostic` 决策，不能各自使用 `_is_super_admin` 形成不一致语义。

发布顺序固定为：**先收口旧出口并完成所有调用方回归，再开放 P1 真实薪酬数值返回。** 后台全局快照不能被 `data.aggregate_query` Handler 读取、拼接或作为 AI Context 输入。

#### 4.6.4 安全规则

- 派生字段继承上游最高敏感级别；仅经审批脱敏、匿名化或充分聚合可降低风险。
- `source_table_name` 不在 `DATA_TABLES`、scope role 不完整、roster passthrough 失效或 alias 不能正确编译时拒绝。
- P1 只支持单源；P2 多指标必须同 Plan、同源、同时间、同 scope strategy 和同人员主键，不允许跨源应用层 Join。
- LLM 只产生受限 JSON；物理对象和 SQL 只存在于服务端 Repository/Compiler，且不进入模型或前端响应。
- Query Executor 使用只读最小权限、语句超时、结果上限、并发和成本保护。
- UCP 只负责数据接入、同步和来源血缘，不向 AI 暴露凭证、连接串、原始响应或 Pipeline 控制。

#### 4.6.5 审计

复用 `record_ai_log` / `system_logs`，记录归一化意图、实际 capability、parse mode、metric code、Plan code/version、scope strategy、范围是否应用的安全摘要、策略决定、outcome、suppression 摘要、耗时、failure_stage 和 Envelope trace_id。禁止记录 SQL、DWD 行、工资明细、完整组织/人员集合、权限标签、secret 或未经脱敏的 Prompt。

差分预算是业务执行状态，不等于审计；P1B 必须另设并发安全、可过期的预算状态组件和 migration。

---

## 5. 原子任务清单

> 每项只有在代码、UI、测试、验收证据全部完成后才可勾选。`012` 的 Y0201、Y0301、Y0302、Y0303（或由 012 正式接受、范围明确且可审计的等价窄切片）必须作为每个 Plan version 的**012 Release Gate** 留存 evidence ID/version、验收人/日期、适用 Metric/DWS/source/dimension 范围和有效状态。四项均 `accepted` 且范围匹配，Plan 才能 `release_eligible` 并启用真实数据；缺任一项、撤销、过期或范围失配时，Catalog、AI Context、Resolver 和真实 DWD Executor 均不得调用，Plan 必须 `draft/blocked`。010 可在此期间完成文档、契约、synthetic fixture、编译器单元测试和 feature-disabled 集成，但非真实路径必须隔离，不得以 `metric_results`、`summary_only` 或全局 DWS View 替代。

### P0：安全主链、旁路封堵与 QueryPlan 地基

- [ ] DIA-P0-01 冻结 scope-aware 主链与公共协议
  - 前置任务：阅读 004 固定规范、012 Y 章、现有 scope/warehouse 实现；无代码前置。
  - 功能范围：冻结“普通用户不读全局 MetricResult、scope 在 DWD 聚合前下推且需 ScopeResolutionProof、P1 单指标 Query Shape 白名单、P2 同源多指标、个人查询独立”的边界；冻结 Spec/outcome/reason code/Envelope 映射与 P1/P1B 协议分界。
  - 代码交付物：更新后的开发规格、QueryPlan/ResolvedQueryPlan Schema 草案、012 Release Gate 和跨 Spec 依赖矩阵；不涉及业务代码。
  - UI 要求：定义 P1/P1B 状态与组件输入；P1 不消费 suppression，P1B partial 才消费 suppression；不制作页面。
  - 测试要求：文档链接、Capability ID、权限 code、result type、P0/P1/P2 依赖，以及 ScopeResolutionProof/Release Gate/Query Shape 术语一致性检查。
  - 验收标准：全文不存在“全局结果后裁剪”“summary_only 即安全”“DWS 缺失自动自由查 DWD”“metadata 存在即 scope 完整”“published 即可执行真实数据”或“P1 返回 suppression”的表述。
  - 完成定义：架构、业务、数据、权限负责人确认并留证。

- [ ] DIA-P0-02 将 Target Capability Gate 前移
  - 前置任务：DIA-P0-01；004 公共 Gate 契约确认。
  - 功能范围：在现有 `global_ai_chat` 的 Route resolve 与 `route.extractor()` 调用之间，统一校验目标 Capability 的 enabled/visible、`required_permission` 和公共 Policy；Gate 成功后才允许 Extractor、业务 Context Builder、PlanResolver、MetricCatalog 和 Handler 执行；回归全部现有 Route。
  - 代码交付物：`app/ai/router.py` 公共调度收口、必要 helper、审计 `failure_stage`、路由契约测试。
  - UI 要求：HTTP 403 沿用统一错误提示，不显示业务候选。
  - UCP/外部系统要求：不涉及。
  - 测试要求：无目标权限/disabled/Policy 拒绝时 Extractor、业务 Context Builder、PlanResolver、MetricCatalog 和 Handler 调用次数均为 0；审计只记录目标 Capability 与失败阶段；补偿金、自动化、对比 Route 全量回归。
  - 验收标准：无权用户不能通过模型输出、错误、候选或 Context 侧信道发现指标/Plan；`ai.chat` 入口校验仍保留，Target Gate 不替代 Handler 的行级、列级、对象级和动作级权限。
  - 完成定义：公共 Gate 与全 Route 回归通过。

- [ ] DIA-P0-03 封堵全局 MetricResult 普通用户旁路
  - 前置任务：DIA-P0-01。
  - 功能范围：统一审查 result list/detail/export/explain/result-reference/AI Context/指标前端及所有读取 `MetricResult.value` 或 `MetricResultRow` 的间接出口；普通用户、AI 和数据洞察入口不得得到未按当前 scope 聚合的全局 summary、measures、dimensions、row_count、total、rows 或可推导解释。
  - 代码交付物：统一 ResultAccessService 或等价公共服务，按调用主体和用途执行 `deny`、`metadata_only` 或 `admin_diagnostic` 决策；改造 `warehouse/router.py`、结果 service 和相关前端。实施前按三级菜单 SOP 明确后台快照诊断的专用管理权限、角色、入口和审计；不得仅以 `warehouse.metrics:V`、`warehouse.metrics:E` 或 `_is_super_admin` 作为充分授权。
  - UI 要求：普通指标页面在 scope-aware 查询未上线前只展示口径/状态或明确“需从数据洞察安全查询”；后台诊断使用独立 UI 语义，且不得被 AI Handler 调用。
  - UCP/外部系统要求：不涉及。
  - 测试要求：所有读取出口的普通用户、组织范围用户、人员范围用户、具备专用诊断权限管理员、超管矩阵；直接 API 及派生解释旁路测试。
  - 验收标准：普通用户与 AI 无法从任一旧出口获得全局快照的值、行、维度、人数或可推导摘要；后台诊断具有明确授权和审计证据；先完成该验收及调用方回归，才可开放 P1 真实数值返回。
  - 完成定义：旁路清单逐项关闭，并留存接口响应、调用方回归和管理员诊断授权证据。

- [ ] DIA-P0-04 实现 QueryPlan Migration 与发布校验
  - 前置任务：DIA-P0-01；Metric、DWS、DWD、scope 元数据可用。
  - 功能范围：创建 `metric_online_query_plans`、`metric_query_plan_metrics`、`metric_query_plan_dimensions`；以关系表作为唯一 Metric/Measure binding，实现版本、审批、有效期、ScopeResolutionProof、012 Release Gate 与 `release_eligibility` 发布校验。
  - 代码交付物：Alembic migration、ORM、Pydantic Schema、`ResolvedQueryPlan` 类型、Repository、管理员 CRUD/发布服务和数据库约束。
  - 测试要求：migration upgrade/downgrade、唯一/外键、P1 恰有一个 binding、重复/缺失 binding、缺 source/人员主键/阈值/DWS 血缘、scope 条件不可表达、Release Gate 证据缺失/撤销/范围失配拒绝；历史 result 不回填 scope。
  - 验收标准：只有 `approved + published + release_eligible` 且具有完整 ScopeResolutionProof 的 Plan 可被 Resolver 返回；`scope_role`、`can_resolve_scope_strategy()`、`published` 或任一单项证据不能单独放行。
  - 完成定义：模型、迁移、发布校验、管理员 UI、Release Gate 和测试通过。

- [ ] DIA-P0-05 建立权限与攻击回归基线
  - 前置任务：DIA-P0-02～P0-04；定义 012 外部发布门槛的证据模板与 feature gate，不要求 Y0201/Y0301/Y0302/Y0303 在本任务开始时已完成。
  - 功能范围：建立组织、成本中心、人员过滤、多标签、无标签、超管、范围变更和旧旁路测试数据矩阵；建立 ScopeResolutionProof 矩阵、P1 Query Shape 静态拒绝矩阵，以及真实 DWD/AI Context/薪酬数值启用前必须核验的 012 Release Gate。
  - 代码交付物：fixture、SQL 期望值、威胁用例、基线报告、外部依赖证据矩阵与 feature gate。
  - 测试要求：scope OR/AND、后代、roster passthrough、三种 strategy 的激活 tag、人员条件不可表达、alias 名称/实际 FROM/scope clause 一致性、fail-closed、敏感继承、P1 分组与标量互斥、P1 无 suppression/partial、总计/差分攻击；Release Gate 任一项缺失时 Catalog、AI Context、Resolver 和真实 DWD Executor 调用数均为 0。
  - 验收标准：P0 失败即阻止真实数据启用；P1 可在 synthetic/feature-disabled 条件下开发，但缺少、撤销、过期或范围失配的外部证据时不得发布或返回真实敏感数据。
  - 完成定义：安全基线、ScopeResolutionProof 和外部门禁由开发、测试、权限负责人共同确认。

### P1：单指标 scope-aware 在线聚合

- [ ] DIA-P1-01 实现 Metric Catalog、Plan Repository 与 Resolver
  - 前置任务：P0 全部完成。
  - 功能范围：只暴露当前用户可见、`release_eligible`、有效且具有完整 ScopeResolutionProof 的单指标 Plan；从关系表读取唯一 Metric/Measure binding，固定不可变 `ResolvedQueryPlan` 与 Release Gate evidence snapshot。
  - 代码交付物：Catalog Repository/Service、PlanRepository、PlanResolver、ResolvedQueryPlan、缓存失效策略、薄指标目录 API。
  - 测试要求：同义词、歧义、下线、过期、版本变化、无 Plan、跨权限目录、防枚举、binding 漂移、Release Gate 撤销以及执行前快照复核。
  - 验收标准：Resolver 不返回全局 result、物理对象、不完整 Plan 或“最新配置”；Metric/Measure 唯一来自关系表，依赖版本/Release Gate 变化返回受控 `409` 而非静默切换。
  - 完成定义：Repository、Resolver、API 和测试通过。

- [ ] DIA-P1-02 实现单指标 Compiler 与聚合前 scope 注入
  - 前置任务：DIA-P1-01；scope_filter 与实体列 DWD 可用。
  - 功能范围：SQLAlchemy 按 `ResolvedQueryPlan` 编译 P1 Query Shape Profile 允许的单月、单指标、0～2 个维度查询；固定 `source_alias_name`，将 `build_scope_filter(..., table_alias=<同名字符串>)` 条件注入源 WHERE 后才聚合金额和人数。
  - 代码交付物：QueryCompiler、ScopeAwareAggregateQueryService、ScopeResolutionProof、只读 Executor、超时/行数/成本限制。
  - 测试要求：组织/成本中心/人员/多标签/后代/roster 穿透；三 strategy 激活 tag；人员条件不可表达必须拒绝；SQL 结构证明 WHERE 先于 GROUP BY，source alias、传入 alias 字符串和 scope clause 引用一致，且无未批准 FROM；手工期望值一致；alias/scope role/source 错误拒绝。
  - 验收标准：结果等于“先完整过滤 DWD 授权行、再聚合”，不等于全局结果事后裁剪；不能因人员条件或 alias 失配退化扩大范围。
  - 完成定义：正确性、性能和安全测试通过。

- [ ] DIA-P1-03 实现 P1 Static Safety Decision
  - 前置任务：DIA-P1-02；阈值、人口主键和 P1 Query Shape Profile 已确认。
  - 功能范围：在同一 scope-filtered 查询计算人口数；实现 §4.3.3 完整白名单、静态拒绝矩阵、整单 deny、分组查询附加总计禁用、可静态判别高风险筛选组合拒绝和稳定 reason code。P1 仅实现基础频率/成本限制，不实现跨请求差分预算、partial 或 suppression。
  - 代码交付物：StaticSafetyDecisionService、执行限制/静态风险分类接口、受控决策对象。
  - UI 要求：blocked 只显示安全提示，不显示组、阈值、人数或金额。
  - UCP/外部系统要求：不涉及。
  - 测试要求：白名单外请求、低样本、总计差值、交叉维度、静态高风险筛选、人口依据缺失、基础频率/成本限制、无数据/无权限/blocked 区分；不把并发、重放、跨版本和跨请求预算记忆列为 P1 已实现能力。
  - 验收标准：P1 仅产生 `data/no_data/blocked`，不产生 partial 或 suppression，不返回“其他”桶；分组响应不返回附加总计，无分组标量仅在整单安全判定通过时返回；无法证明安全即整单拒绝。
  - 完成定义：静态威胁用例和稳定错误契约通过；真实数据启用仍受 012 Release Gate 约束。

- [ ] DIA-P1-04 接入结构化 API、AI Handler、Envelope 与审计
  - 前置任务：DIA-P1-01～P1-03；DIA-P0-02 Gate 已完成。
  - 功能范围：API 与 Handler 调同一 service；注册 Capability/ChatRoute/result type；统一 outcome、Envelope permission/masking 和审计；以显式领域异常映射 HTTP/Envelope，不以裸 `ValueError` 作为客户端 400 的边界。
  - 代码交付物：`app/data_insight/router.py`、AI adapter、严格 Pydantic Schema、OpenAPI、`record_ai_log` metadata、领域异常映射。
  - UI 要求：暂不实现 UI，但冻结 TypeScript 类型。
  - UCP/外部系统要求：不涉及。
  - 测试要求：Gate-before-Extractor、Schema、HTTP/Envelope 映射、trace_id、一致性、未知 type、审计敏感字段扫描、现有 Route 回归；客户端校验、Visibility Eligibility/Release Gate、权限/防枚举、版本快照竞争、基础限流、安全阻断、未预期异常和输出 Schema 失败分别验证。
  - 验收标准：不增加 Envelope 顶层字段；data 内无重复 result_type/scope_applied/masked_fields；P1 分组响应不得夹带总计、P1 不得包含 suppression，P1B partial 才可包含 suppression；未预期配置、编译、输出协议或依赖错误返回 `500/503 + trace_id`，不伪装为 400。
  - 完成定义：接口、AI、契约、审计测试通过；真实数据启用仍受 012 外部门禁约束。

- [ ] DIA-P1-05 实现高组件化前端与统一入口
  - 前置任务：DIA-P1-04。
  - 功能范围：实现第 4.5 节组件；GlobalAiAssistant 只委托 Dispatcher；支持 P1 全状态。
  - 代码交付物：`api/data-insight.ts`、`components/data-insight/*`、GlobalAiAssistant 轻量分派和组件测试。
  - UI 要求：飞书风、tokens、表格五件套、窄屏；所有动作套 PermissionButton；无趋势图。
  - UCP/外部系统要求：不涉及。
  - 测试要求：data/no_data/blocked/forbidden/error/unknown type，金额格式、口径抽屉、范围说明、CompareResultCard 回归、typecheck/build。
  - 验收标准：页面/全局助手不做权限、聚合、小样本或算术业务逻辑。
  - 完成定义：组件、交互、构建和视觉验收通过。

- [ ] DIA-P1-06 完成单指标 E2E 与同批发布
  - 前置任务：DIA-P1-01～P1-05。
  - 功能范围：真实普通用户任意 scope 查询、旁路、安全、性能、回归、发布和同步回滚。
  - 代码交付物：验收报告、测试证据、版本映射、migration/回滚清单。
  - UI 要求：业务验收覆盖所有 scope 和状态。
  - UCP/外部系统要求：陈旧数据不得伪装最新。
  - 测试要求：第 6 节 P0/P1 全套、部署健康、镜像/版本、生产权限抽样。
  - 验收标准：普通用户结果与授权 DWD 行人工聚合一致；任一全局旁路为 0；每个真实执行的 Plan version 都具有匹配且有效的 012 Release Gate、ResolvedQueryPlan 快照和 ScopeResolutionProof；同 tag 发布和回滚。
  - 完成定义：开发、测试、业务、权限四方签字。

### P1B：互补抑制技术切片

- [ ] DIA-P1B-01 建立持久化查询指纹与差分预算
  - 前置任务：P1 稳定运行并积累审计；独立威胁模型通过。
  - 功能范围：规范化用户/metric/period/dimension/filter/scope 指纹，建立并发安全、可过期的预算状态；覆盖原子扣减、TTL/清理、重放、跨 Plan/version 与跨 scope 归一化；为 P1B `partial`/suppression 返回建立前置证据。
  - 代码交付物：预算模型/migration、QueryBudgetService、清理策略和监控。
  - UI 要求：仅显示非敏感限流提示；P1 不显示 suppression，P1B 才可进入 partial 组件路径。
  - 测试要求：并发、重放、相邻集合、跨版本、跨 scope、过期和绕过尝试。
  - 验收标准：预算状态不依赖 system_logs、内存即时计数或 P1 静态规则；可在并发条件下作为 P1B 主/互补抑制的前置证据。
  - 完成定义：威胁模型和测试通过。

- [ ] DIA-P1B-02 实现主抑制与互补抑制
  - 前置任务：DIA-P1B-01。
  - 功能范围：主抑制低样本组，选择最小额外组做互补抑制，默认隐藏总计；只在证明不可反推时返回 partial。
  - 代码交付物：SuppressionService 扩展、策略版本、解释摘要和测试。
  - UI 要求：AggregatePolicyNotice 展示抑制数量，不显示身份/阈值/人数。
  - 测试要求：总计差值、边际、交叉维度、相邻查询、多个隐藏组、最小互补集合。
  - 验收标准：任何可重建隐藏值的路径均整单拒绝。
  - 完成定义：安全评审、E2E 和业务验收通过。

### P2：同源多指标聚合

- [ ] DIA-P2-01 冻结并实现同源兼容性契约
  - 前置任务：P1/P1B 按实际范围验收完成。
  - 功能范围：只允许同 Plan、DWD source、时间粒度、scope strategy、人员主键和安全策略的 2～5 个指标。
  - 代码交付物：Plan-Metric 关系服务、兼容性验证、P2 Schema。
  - UI 要求：指标多选仅显示同 Plan 兼容项。
  - 测试要求：同源通过；跨 Plan/源/策略/主键/粒度全部拒绝。
  - 验收标准：不在应用层 Join 全局结果。
  - 完成定义：契约和测试通过。

- [ ] DIA-P2-02 实现同一 scope-filtered 查询内多度量聚合
  - 前置任务：DIA-P2-01。
  - 功能范围：一个源查询中先注入 scope，再计算多个 measure 和一次 population count；应用最严格安全策略。
  - 代码交付物：MultiMetricQueryService、Compiler 扩展、Formatter Schema。
  - UI 要求：摘要和维度表支持多指标列，不做前端派生计算。
  - 测试要求：与逐指标同 scope 结果一致；任一指标不安全整单拒绝；性能与列级权限。
  - 验收标准：同一行、范围、Plan version 和时间语义一致。
  - 完成定义：正确性、安全和性能通过。

- [ ] DIA-P2-03 完成多指标 UI、E2E 与发布
  - 前置任务：DIA-P2-02。
  - 功能范围：多指标选择、结果展示、口径/限制说明、回归和同批发布。
  - 代码交付物：组件扩展、测试报告、发布资产。
  - UI 要求：高组件化，不增加万能图表或跨指标算术。
  - 测试要求：P2 全契约、安全、权限、组件、E2E、构建和回滚。
  - 验收标准：只在兼容 Plan 内工作，不能通过 API 伪造跨源组合。
  - 完成定义：业务、数据、权限和测试验收通过。

### P3 与未来独立立项

- 多月趋势、跨源 ADS/OLAP、保存/订阅/自动化分别独立拆任务，不默认继承 P1 权限。
- 个人查询使用第 2.5 节独立 Capability 边界，未经独立评审不登记 Route/API/result type。

---

## 6. 测试计划

### 6.1 P0 单元、契约与旁路测试

| 分类 | 必测内容 |
| --- | --- |
| Target Gate | Route resolve 后、Extractor/业务 Context/PlanResolver/Catalog/Handler 前执行 Gate；无权限、disabled、Policy 拒绝时上述业务调用均为 0；审计仅含目标 Capability 与 failure_stage。 |
| QueryPlan Schema | 关系表是唯一 Metric/Measure binding；P1 恰有一个 binding；缺 Metric/DWS/DWD/source/人员主键/阈值/P1 Query Shape、binding 血缘不一致、ScopeResolutionProof 不完整或 Release Gate 缺失/撤销/范围失配均拒绝；真实 Plan 只能 `approved + published + release_eligible`，不得发布或执行。 |
| Migration | upgrade/downgrade、唯一/外键/索引、历史 MetricResult 不回填 scope、发布/Release Gate 状态约束。 |
| ResolvedQueryPlan | 固定 binding、Plan/Metric/DWS/DWD/source schema/scope mapping/Release Gate 快照；执行前依赖变化返回 `409`，不得静默切换最新定义。 |
| Scope proof / alias | `person_first`、`cc_first`、`cross_filter` 激活 tag 矩阵；人员条件无法表达必须拒绝；source alias、传入 `table_alias` 字符串、scope clause 列引用及实际 FROM 完全一致，无未批准 FROM 或字符串修复。 |
| Release Gate | 四项 evidence 的 ID/version、验收人/日期、适用范围、失效/撤销均校验；任一不通过时 Catalog、AI Context、Resolver、真实 DWD Executor 调用数均为 0。 |
| 旧旁路 | list/detail/export/explain-with-period/result-reference/AI Context/指标页及直接 API：普通用户与 AI 均不能返回全局 summary、measures、dimensions、row_count、total、rows 或可推导摘要；后台诊断独立权限、UI 语义和审计。 |
| Envelope | 顶层白名单不变；`data_aggregate_result` 严格 Schema；data 不含重复 result_type/scope_applied/masked_fields；分组与标量响应互斥；P1 不含 `suppression`/`partial`，P1B partial 才可有 suppression。 |
| 异常映射 | 客户端校验、权限/防枚举、版本竞争、基础限流、安全阻断、未预期内部异常和输出 Schema 失败分别符合 HTTP/Envelope/trace_id 契约；裸 `ValueError` 不得一律映射 400。 |
| 现有能力回归 | 补偿金、权限解释、自动化草稿、data.compare 的 Gate、Extractor、Handler 与卡片不退化。 |

### 6.2 P1 scope 下推与聚合正确性测试

准备同一月份、多个组织、成本中心、人员、用工类型、用工主体和多标签组合的 DWD 固定样本：

1. 组织节点、包含下级、成本中心、人员过滤分别生效；只有被当前 strategy 激活的 tag 进入 proof。
2. 单标签内组织 AND 人员、多标签 OR 与现有 `build_scope_filter()` 语义一致；`person_first` 仅激活 org tag，`cc_first` 仅激活 cost-center tag，`cross_filter` 激活全部 tag。
3. 无标签、源表无 scope role 且无 roster join、roster 穿透失效、alias 失配，以及已激活 tag 的人员条件无法在 source/roster 表达，均 fail-closed，不得退化为较宽组织/成本中心条件。
4. 编译 SQL/SQLAlchemy statement 能证明 scope 条件位于实际 source `WHERE`，先于 `GROUP BY`，且 source alias、`table_alias` 字符串与 scope clause 的列引用一致、无未批准 FROM。
5. 用户结果等于“先完整过滤授权 DWD 行，再人工聚合”的期望值；明确不等于全局 MetricResult 或全局 View 后裁剪值。
6. 权限标签修改后下一次查询立即反映，不读取旧缓存或历史全局结果。
7. 仅支持 §4.3.3 P1 Query Shape 白名单；个人维度、物理对象、超限分组、非法过滤、补集/相邻集合形状拒绝。
8. 查询超时、行数、成本、并发和只读事务限制有效。

### 6.3 P1/P1B 小样本和推断攻击测试

- P1：仅验证 §4.3.3 白名单内的单一低样本组、低样本+总计、交叉维度、补集/相邻集合或静态高风险筛选等风险形状均整单拒绝；P1 不要求、也不得声称通过跨请求预算记忆防护相邻集合、重叠 scope 或跨 Plan/version 攻击。
- 人口计数必须与唯一 Measure 使用相同 scope、时间和业务过滤；主键、阈值、binding、ScopeResolutionProof 或 Release Gate 缺失时拒绝。
- P1 有分组响应不返回附加总计、边际或“其他”桶；无分组标量仅在整单安全判定通过时返回；P1 不输出 `suppression`/`partial`。
- blocked 响应不包含被保护组名、人数、阈值、金额、总计或排名。
- P1B：并发查询指纹、原子预算、预算过期、重放、相邻集合、重叠 scope 和跨版本绕过测试。
- P1B：主抑制、互补抑制、默认隐藏总计；任何线性组合可重建隐藏值时退回整单拒绝；只有 P1B partial 包含 suppression。
- 验证 `no_data`、HTTP 403、`small_group_blocked`、`scope_unresolvable`、`static_inference_risk`、Release Gate 阻断和系统异常语义不同。

### 6.4 P2 同源多指标测试

1. 同 Plan、source、period、scope strategy、人员主键和安全策略的指标组合通过。
2. 不同 Plan、DWD source、DWS 定义、时间粒度、scope strategy、人员主键或阈值组合全部拒绝。
3. 多个度量在同一 scope-filtered 查询中计算，结果与相同 scope 的逐指标安全聚合一致。
4. 任一指标字段无权、口径失效或小样本不安全时整单拒绝。
5. 不调用全局 `metric_results` 做应用层 Join，前端也不做派生相减。

### 6.5 前端、E2E、构建与发布测试

- `GlobalAiAssistant` 只按 type 委托 Dispatcher；未知 type 纯文本降级。
- Aggregate 组件覆盖 loading/data/no_data/blocked/P1B partial/forbidden/error、窄屏和表格五件套。
- 入口隐藏、直接 API 403、权限变化后重查、CompareResultCard 和其他 AI 卡片回归。
- 审计响应与日志 `trace_id` 一致，含 capability/Plan/version/scope 应用摘要/suppression 决策，不含 SQL、DWD 行、工资明细、完整 scope 或 Prompt。
- 后端定向/全量测试、前端 typecheck/build、OpenAPI、E2E、migration、部署健康和同步回滚全部通过。
- 性能按普通用户小范围、全量 scope、部门/成本中心高基数分别压测；禁止复用现有“取全量行后 Python 聚合”作为上线实现。

---

## 7. 验收标准

### 7.1 用户验收

- 任意组织/人员范围普通用户仅在 ScopeResolutionProof 完整时得到数值，且结果与其授权 DWD 行人工聚合一致；权限范围变更后下一次查询立即变化。
- 拥有全量 scope 的用户才能得到全公司值；普通用户不会因“只看摘要”收到全局结果。
- 用户可区分汇总查询和跨表对比，并理解月份、口径、ResolvedQueryPlan 版本、范围已应用、更新时间和保护状态。
- 无数据、无权限、条件不完整、小样本阻断、范围不可解析、Release Gate 阻断和系统异常反馈不同且不泄密。

### 7.2 架构与开发验收

- 主链唯一：现有 ChatRoute → Target Gate → Visibility Eligibility/最小 Context → `release_eligible` ResolvedQueryPlan → ScopeResolutionProof → DWD 聚合前 `build_scope_filter` → P1 StaticSafetyDecision 或 P1B Suppression Protocol → Envelope。
- `metric_results/metric_result_rows` 不作为普通用户或 AI 的查询值来源，所有旧旁路已封堵；后台诊断有明确专用权限、独立 UI 语义和审计。
- `metric_query_plan_metrics` 是唯一 Metric/Measure binding；P1 只支持一个 binding，P2 多指标只在同源同 Plan 的一个 scope-filtered 查询中执行。
- scope metadata、`can_resolve_scope_strategy()`、`published` 或单项 012 证据均不等于可执行；每次真实执行须有完整 ScopeResolutionProof、未失效 ResolvedQueryPlan 和匹配的 012 Release Gate。
- LLM/前端不接触物理表、字段、资产、SQL、Join、scope 条件或全局结果值。
- 后端业务模块按第 4.4 节拆分；AI Router、Warehouse Router 和前端全局助手不堆积业务逻辑。
- 分组响应不返回附加总计、边际或“其他”桶；无分组标量与分组响应互斥，且均在 P1 StaticSafetyDecision 后返回。
- P1 仅返回 `data/no_data/blocked`，不暴露 suppression/partial；小样本遵循 P1 整单拒绝、P1B 持久化预算与互补抑制的阶段门禁，P1 不声称具备跨请求差分防护。
- Envelope 顶层不变，permission/masking 为执行级单一真理源；未预期配置、编译、输出协议或依赖异常不被伪装为用户输入错误。

### 7.3 UI / 上线验收

- 统一入口、Dispatcher、指标摘要、维度表、保护提示、口径抽屉和澄清组件符合第 4.5 节及项目设计规范。
- UI 不展示物理对象，不在前端裁剪、汇总、相减或做 suppression。
- 发布前具备 Capability、Plan、migration、权限、口径、scope 正确性、小样本、性能、OpenAPI、构建、E2E 和回滚证据。
- 真实 DWD、AI 指标 Context 与普通用户真实数值启用前，每个 Plan version 必须逐项核验 012 Release Gate：Y0201/Y0301/Y0302/Y0303 或正式接受的等价窄切片的 evidence ID/version、验收人/日期、适用范围和有效状态。缺任一项、撤销、过期或范围失配时功能保持 `draft/blocked` 或 feature-disabled，Catalog、Context、Resolver 和 Executor 都不能执行，且不能以全局快照替代。
- 后端、前端和 migration 使用同一发布批次；回滚同步，不恢复旧 AI 字段或全局结果旁路。

---

## 8. 风险与兼容性

| 风险 | 等级 | 影响 | 应对方案 |
| --- | --- | --- | --- |
| 聚合后裁剪 scope | P0 | 任意人员范围无法正确计算，可能返回全局金额。 | 只允许在 DWD 源 WHERE 中调用 `build_scope_filter` 后聚合。 |
| 全局 MetricResult 旁路 | P0 | 普通用户或 AI 从旧 API、解释或 Context 读取范围外值。 | P0 收口 list/detail/export/explain/result-reference/AI Context；普通入口不返回全局 summary、measure、人数或派生摘要，后台诊断使用专用权限与审计。 |
| Gate 在 Extractor 后 | P0 | 未授权用户通过上下文或模型侧信道发现指标。 | 在 Route resolve 与 Extractor 之间插入公共 Target Gate；拒绝时 Context、Resolver、Catalog、Handler 均不得调用。 |
| scope/source/alias 或条件完整性错误 | P0 | 人员约束可能退化、scope 条件可能未绑定实际聚合源，导致漏过滤或错算。 | ScopeResolutionProof 逐项验证激活 tag；人员条件不可表达即拒绝；source alias/传入字符串/编译列引用/实际 FROM 定向测试，任一未知 fail-closed。 |
| Release Gate 仅靠人工流程 | P0 | 012 设计任务未落地时仍可能误发布真实 DWD/AI Context。 | Plan version 强制绑定四项 evidence 的版本、范围和有效状态；Catalog、Context、Resolver、Executor 都校验，撤销或失配自动 blocked。 |
| QueryPlan binding 或执行快照漂移 | P0 | Metric/Measure 双真理源、执行中版本变化会造成口径错误。 | 关系表唯一 binding；ResolvedQueryPlan 固化依赖版本；执行前复核，变化返回 409，不静默切换。 |
| P1 查询形状过宽或误称具备差分预算 | P0 | 无持久状态时可通过补集、重放或并发推断。 | P1 只开放显式白名单和静态拒绝矩阵，整单拒绝且无 suppression/partial；查询指纹、原子预算、TTL、并发与互补抑制均在 P1B 验收后启用。 |
| DWD 被自由查询 | 高 | 绕过指标口径和权限治理。 | 只能由 `approved + published + release_eligible`、具有完整 ScopeResolutionProof 的 QueryPlan 和受控 Compiler 访问。 |
| 多指标跨源拼接 | 高 | scope、快照和口径不一致。 | P2 仅同 Plan 同源；跨源 ADS/OLAP 独立立项。 |
| 现有 Python 聚合性能 | 高 | 大范围用户拉取明细导致内存和延迟风险。 | 数据库侧 scope + GROUP BY，超时/行数/成本预算和容量压测。 |
| QueryPlan 漂移 | 高 | Metric/DWS/DWD 版本错配。 | Plan 不可变版本、有效期、影响分析和发布阻断。 |
| 个人查询偷渡 | 高 | 员工存在性和薪资明细泄露。 | Schema 禁个人维度；未来独立 Capability/审批/审计。 |
| 第二套 Router/Policy/审计 | 高 | 公共主链分裂。 | 复用 004 Runtime、scope_filter 和 system_logs。 |
| 前后端协议不一致 | 高 | 卡片失效或错误安全提示。 | 严格 Schema、同 tag 发布和同步回滚。 |
| LLM 误判 | 中 | 查询错误或回问不当。 | LLM-first Route +受限 Extractor+Plan 校验+低置信度回问。 |

兼容性：不修改 `CompareSpec`、`data.compare` 和既有 Envelope 顶层协议。P0 对旧指标结果接口的权限收紧属于安全修复，可能影响依赖全局 summary/rows 的普通用户页面或调用方；必须先盘点调用方并同批迁移，禁止为兼容恢复越权数据。

---

## 9. 假设与待确认事项

1. 四项薪酬指标的正式口径、DWS 定义、DWD source、实体列和血缘由业务/数据负责人确认。
2. “公司社保”包含的险种、补充医疗、公积金边界必须正式冻结。
3. 应发工资的作废、重复、补发、追扣、离职结算和跨月更正规则必须进入 Metric/DWS 定义。
4. `population_employee_key` 必须是与金额相同 scope/时间/过滤条件下的稳定员工主键。
5. `minimum_group_size` 的具体数值由薪酬、数据、权限负责人签字；未确认前 P1 不上线。
6. 现有 scope 标签只支持组织/成本中心及用工类型、用工主体、人员过滤；未来岗位、职级、直属主管等新 scope 语义需先扩展公共 scope 模型，不在数据洞察内私建。
7. `system.data_insight` 的菜单位置、展示名和默认角色授权按三级菜单 SOP 确认，code 投产后不修改。
8. 每个真实 Plan version 的 012 Release Gate 必须保存 Y0201/Y0301/Y0302/Y0303 或正式等价窄切片的 evidence ID/version、验收人/日期、适用 Metric/DWS/source/dimension 范围和有效状态；任一缺失、撤销、过期或范围失配时 Plan 必须 `draft/blocked`，Catalog、AI Context、Resolver 和真实 DWD Executor 均不得执行或以全局结果替代。
9. ScopeResolutionProof 的策略/tag 激活矩阵、人员条件完整表达规则和 source alias 名称契约必须由权限、数据与开发负责人共同确认；`person_first`/`cc_first` 不得被误解为所有 tag 组合均生效。
10. P1 Query Shape Profile 的白名单值域和 `static_inference_risk` 拒绝矩阵必须由薪酬、数据、权限负责人签字；未冻结前 P1 不上线。
11. 后台全局快照诊断的专用管理权限、适用角色、菜单入口、审计责任和保留期必须在 DIA-P0-03 实施前按三级菜单 SOP 确认；`warehouse.metrics:V`、`warehouse.metrics:E` 与 `_is_super_admin` 不是普通用户或 AI 读取全局快照的充分依据。
12. `data.query` 只作为能力族概念；未来泛化执行能力和个人查询都必须重新进行 004 评审。

---

## 10. 跨文档协调与外部契约登记（非本次改动范围）

下表记录后续实施审批前应与各文档所有者协调的权威契约；本文件不替代 004/012 的权威状态，不把外部任务标记为完成。若相关文档或外部证据未同步，或 012 Release Gate 无法以版本和适用范围绑定 Plan，P1 真实数据启用和正式发布不得继续；本文件仅允许完成隔离的 synthetic/feature-disabled 规格、契约和测试开发。

| 文档 | 后续需与所有者协调的内容 | 目的 |
| --- | --- | --- |
| `010-data-comparison-skill/spec.md` | 增加数据洞察统一入口；明确 `data.compare` 只负责双源 CompareSpec，`data.aggregate_query` 只负责 Metric/QueryPlan 驱动聚合；将 `ai_skills` 命名债务另行评估。 | 消除单表聚合、双源对账和 Skill/Capability 概念混淆。 |
| `010-data-comparison-skill/spec.md` | 来源决策树改为 Metric → `release_eligible` ResolvedQueryPlan → ScopeResolutionProof → DWD 聚合前 `build_scope_filter`；全局 `metric_results` 仅限后台快照诊断。 | 支持具有完整表达证明的组织/人员 scope，消除聚合后裁剪和约束退化错误。 |
| `010-data-comparison-skill/spec.md` | 将旧“仅 scope_strategy”描述扩展为 Target Gate、Visibility Eligibility、唯一 Metric/Measure binding、ScopeResolutionProof、source alias 契约、P1 Query Shape、P1 Static Safety、P1B Suppression Protocol 和旧旁路统一治理。 | 权限成为端到端安全边界。 |
| `010-data-comparison-skill/review-response.md` | 增加 v2.0 强批判评审结论、P0/P1/P1B/P2 决策和未来个人查询边界。 | 历史评审可追溯。 |
| `004-ai-native-workbench/ai-capability-registry.md` | 注册 `data.aggregate_query`，并确认 Target Gate 在 Route resolve 后、Extractor/Context 前；声明 `data.query` 仅为能力族概念。 | 对齐公共 Runtime，防止未授权 Context 泄露。 |
| `004-ai-native-workbench/current-state-and-gaps.md` | 登记 Gate 前移、指标 Context 裁剪和普通用户全局结果旁路为 P0 缺口。 | 保持真实状态台账准确。 |
| `004-ai-native-workbench/capability-result-envelope-atomic-tasks.md` | 登记 `data_aggregate_result`、分组/标量互斥、P1 不输出 suppression、P1B partial 才输出 suppression 及 `outcome/reason_code` data Schema；不修改 Envelope 顶层和已完成 R0013。 | 继承统一协议和发布治理。 |
| `012-data-warehouse-ucp-integration/spec.md` | 明确 DWD 是 ScopeResolutionProof 成立后的在线聚合输入，DWS 是口径/Plan 来源，MetricResult 不是普通用户查询源；定义与 Plan version 匹配的 Release Gate 证据范围。 | 防止数仓层级和权限粒度混乱。 |
| `012-data-warehouse-ucp-integration/metric-result-olap-roadmap.md` | 将全局 result 定位为后台快照；登记 QueryPlan、旧结果出口收口、P1 单指标和 P2 同源多指标边界。 | 避免结果集与在线授权查询成为双重真理源。 |
| `012-data-warehouse-ucp-integration/atomic-tasks.md` | 明确 Y0201/Y0301/Y0302/Y0303 或正式接受的等价窄切片必须产出可版本化、可撤销、范围可校验的 Release Gate evidence；补 ScopeResolutionProof、人员条件 fail-closed、source alias、P1 Query Shape/静态拒绝、P1B 持久化预算和旁路测试。 | 开发阶段与真实数据发布门槛分离，避免设计任务或人工会议结论被错误声称为运行时安全能力。 |
| `012-data-warehouse-ucp-integration/testing-acceptance.md` | 增加聚合前 scope 正确性、全局结果隔离、旧旁路、P1 整单拒绝、P1B 互补抑制和 P2 同源兼容用例。 | 验收真实权限正确性，而非仅能查询。 |

---

## 11. 交付说明模板

```markdown
# 数据洞察聚合查询交付说明

## 已完成任务
- [ ] DIA-P...

## 修改文件
- `backend/...`：
- `frontend/...`：
- `specs/010-data-comparison-skill/...`：
- `specs/004-ai-native-workbench/...`：
- `specs/012-data-warehouse-ucp-integration/...`：

## 指标与数据来源证据
- metric_code / 口径版本：
- QueryPlan code / version / 发布审批 / release eligibility：
- 唯一 Metric/Measure binding（关系表）与 ResolvedQueryPlan 快照：
- 012 Release Gate：四项 evidence ID/version、验收人/日期、适用范围、有效状态：
- DWS 聚合定义 / DWD source / 血缘版本：
- source_table / scope_strategy / 激活 tag / ScopeResolutionProof / source alias / roster_join 校验：
- population_employee_key / minimum_group_size：
- 刷新时间与业务样例核对：

## 权限与安全证据
- Gate-before-Extractor 调用证据：
- 组织/成本中心/人员/多标签 scope 测试：
- DWD 聚合前 ScopeResolutionProof、scope SQL/SQLAlchemy 与 source alias 证据：
- 全局 MetricResult 旁路封堵：
- P1 Query Shape 白名单 / Static Safety / P1B Suppression Protocol 测试：
- ODS/自由 DWD/SQL/个人查询拒绝测试：
- 审计脱敏验证：

## 测试命令与结果
- 后端：
- 前端：
- 契约/OpenAPI：
- E2E：
- 构建：

## UI 验证
- 聚合结果：
- 对比结果回归：
- 加载/空态/澄清/无权限/小样本/异常：

## 发布与回滚证据
- 发布 tag / commit：
- 后端与前端运行镜像：
- 数据库 migration：
- 健康检查：
- 前后端同批回滚标签与演练结果：

## 未完成项
- 无 / 列出任务编号、原因与阻塞项。

## 风险与后续建议
- 无 / 列出风险、责任人和下一步。
```
