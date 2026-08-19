# HR Portal 通用智能分析与可观测 Agent Runtime 需求规格

> 版本：v0.1  
> 日期：2026-08-08  
> 状态：需求评审稿  
> 文档位置：`specs/017-generic-analysis-agent-runtime-spec.md`  
> 适用范围：HR Portal 已注册数据资产的自然语言分析、过程进展展示、图表生成、分析结论与报告产出

---

## 1. 文档定位

本文定义 HR Portal 从“用户请求后等待一次性结果”升级为“自然语言驱动、过程可观察、结果可追溯的通用智能分析 Agent”的公共需求。

目标体验：用户无需预先选择考勤、离职、成本、绩效等领域包，只需用自然语言描述分析目标，系统即可在权限边界内动态发现数据、形成计划、执行查询、进行统计与受控下钻、生成图表、分析结论、管理建议和最终报告，并实时展示执行进展。

本文是平台级公共规格，不定义考勤或离职专属流程，不创建第二套 Capability Registry、权限体系、会话真理源、审批引擎或 Workflow Engine。

公共协议继续以以下文档为准：

- `specs/004-ai-native-workbench/`：AI Capability、Plan、Result、权限、审计和 Runtime 公共协议；
- `specs/012-data-warehouse-ucp-integration/`：数据集、字段、关系、维度、指标、DWS 聚合、质量和 UCP 数据链；
- `specs/011-universal-connector-platform/`：Pipeline、Run、Step Run、审批、重试、取消和监控；
- `HR-Agent建设方案-专家修订版.md`：HR Agent 产品战略、数据安全和治理原则。

---

## 2. 背景与问题

HR Portal 已具备以下基础能力：

- OpenAI-compatible LLM Provider；
- Capability Registry 与 LLM-first ChatRoute；
- Schema Validator、Policy Guard、Context Packet；
- PostgreSQL 多轮会话；
- AI Audit、`trace_id` 和受控 Action；
- 数据集、字段、关系、维度、指标、DWS 聚合和指标结果；
- 基础数据质量规则；
- 报告实例配置；
- UCP Pipeline、审批、执行、重试和运行日志；
- Web 全局 AI 助手和飞书渠道基础。

但当前缺少把上述资产连接成通用自主分析体验的公共层：

1. 用户自然语言不能统一编译为可执行分析计划；
2. LLM 不能通过标准工具动态发现数据集、字段、关系、指标和数据画像；
3. 缺少受控 `QuerySpec` 及后端查询编译器；
4. 缺少可循环执行、限制下钻次数并保存共享分析状态的 Analysis Runtime；
5. 缺少通用 `ChartSpec`、证据化 Finding 和 Report Artifact；
6. 缺少统一 Run Event 协议、实时事件流、断线恢复和前端运行检查器；
7. 现有报告是实例配置，尚不是可由分析结果动态生成的通用报告产物；
8. 现有评测主要覆盖公式能力，尚未覆盖自然语言数据分析端到端链路。

---

## 3. 产品目标

### 3.1 核心目标

用户输入类似：

> 分析研发部最近三个月的考勤情况，找出主要问题，生成图表、分析结论、管理建议和最终报告。

系统应自动完成：

```text
理解目标
  → 解析组织、周期、比较对象和输出要求
  → 搜索相关数据资产
  → 检查用户权限和数据范围
  → 形成结构化 AnalysisPlan
  → 生成受控 QuerySpec
  → 后端编译并执行查询
  → 执行确定性统计
  → 根据结果进行有限次数下钻
  → 生成 ChartSpec
  → 生成有证据引用的结论和建议
  → 生成可下载报告 Artifact
  → 保存完整 Run、State、Event 和 Trace
```

同一 Runtime 应能处理离职、招聘、成本、绩效、编制等其他已注册数据资产，不要求提前开发对应领域 Agent 或领域包。

### 3.2 用户可观察目标

执行期间，用户可以看到：

- 当前阶段；
- 已完成阶段和剩余阶段；
- 正在使用的安全工具；
- 使用的数据集和分析范围；
- 阶段性发现；
- 自动下钻原因摘要；
- 已生成的图表和产物；
- 缺失输入或待确认事项；
- 失败阶段、降级结果和重试状态。

系统展示的是**可验证的执行进展和推理摘要**，不是模型原始隐藏思维链。

### 3.3 平台复用目标

新增分析主题时，原则上只需确保：

- 数据已入仓并注册；
- 数据集、字段和关系元数据清晰；
- 用户数据权限可解析；
- 必要指标存在，或允许使用明确标注的临时探索口径；
- 数据质量满足分析要求。

不得要求每个主题重新开发 Provider、Agent Loop、查询执行器、图表引擎、报告引擎、权限系统和审计系统。

---

## 4. 非目标

本期不做：

1. 不展示模型原始 Chain of Thought；
2. 不允许 LLM 生成任意 SQL 后直接执行；
3. 不允许 LLM 直接连接 PostgreSQL、北森或任意外部系统；
4. 不创建考勤包、离职包等强制领域包；
5. 不要求预先建立考勤 Agent、离职 Agent 等独立 Agent；
6. 不新建第二套 Capability Registry、Chat Router、会话真理源、审批引擎或 Workflow Engine；
7. 不允许 LLM 自动发布正式企业指标口径；
8. 不允许探索性结论直接用于薪酬、绩效、裁员、调岗等高风险动作；
9. 不开放任意多表 Join，只允许已注册关系或 Join Path；
10. 不把相关性描述为确定因果；
11. 不通过延长 HTTP 超时替代异步 Run；
12. 不把完整原始明细、凭证、请求头、Token 或未脱敏敏感字段发送给模型；
13. 不新建通用 Skill 市场或任意脚本执行平台。

---

## 5. 核心设计原则

### 5.1 LLM 负责规划和解释，程序负责计算和安全

LLM 负责：

- 理解用户目标；
- 发现相关数据资产；
- 生成结构化分析计划；
- 选择分析维度和下钻路径；
- 选择图表形式；
- 解释统计结果；
- 生成建议和报告文字；
- 说明假设、置信度和数据局限。

后端负责：

- 身份认证；
- Capability 权限；
- 数据集 ACL；
- 行级、列级和对象级权限；
- 敏感字段裁剪和脱敏；
- 表、字段、关系和操作白名单；
- QuerySpec 校验与 SQL 编译；
- 只读查询和数值计算；
- 数据量、时间、轮次和资源限制；
- 图表字段一致性校验；
- Artifact 生成；
- Run 状态、审计和 trace。

### 5.2 动态分析不等于自由执行

LLM 可以动态决定“看什么”，但每个动作必须映射为已注册 Capability 或通用分析工具。任何无法映射的步骤必须被拒绝、降级或请求用户调整目标。

### 5.3 证据优先

所有用户可见结论必须引用本次 Run 中真实产生的 Query Result、Metric Result、Chart 或 Data Quality Result。系统不得把未执行的计划展示为已完成进展。

### 5.4 探索口径与正式口径分级

- **正式口径**：优先使用已发布 `WarehouseMetric` 及对应 DWS 聚合；
- **探索口径**：当正式指标不存在时，LLM 可提出临时公式，但必须经过字段、操作和权限校验，并明确展示口径、假设和“探索性”标识；
- 探索口径不得自动升级为正式指标；需经管理员审核、评测和发布。

### 5.5 过程透明但不暴露隐藏思维

允许显示：

- 阶段目标；
- 工具调用摘要；
- 下钻理由摘要；
- 已验证发现；
- 假设和局限；
- 确认事项。

禁止显示：

- 模型原始隐藏思维；
- 完整系统 Prompt；
- 未脱敏模型上下文；
- SQL 原文和内部物理表名；
- 凭证和权限内部策略细节；
- 尚未验证的中间猜测。

---

## 6. 总体架构

```text
Web / 飞书用户
      ↓
现有 /ai/chat 或 Analysis Run API
      ↓
Capability Gate + Controlled Rollout + Rate Limit
      ↓
Generic Analysis Planner
      ↓
Data Catalog Tools
      ↓
AnalysisPlan + Shared Analysis State
      ↓
QuerySpec Validator / Compiler
      ↓
Dataset ACL + Scope + Column Permission + Masking
      ↓
Warehouse Metric / Registered Dataset / Deterministic Statistics
      ↓
Controlled Analysis Loop
      ↓
ChartSpec + Findings + Recommendations
      ↓
Report Artifact
      ↓
CapabilityResultEnvelope

横切能力：
Run Event Stream / UCP Run-Step Run / Audit / Trace / Eval / User Confirmation
```

---

## 7. 公共领域模型

### 7.1 AnalysisRun

表示一次自然语言分析任务。

最低字段：

```json
{
  "run_id": "arun_001",
  "conversation_id": "...",
  "actor_user_id": 1,
  "channel": "web",
  "goal": "分析研发部最近三个月考勤",
  "status": "running",
  "current_stage": "query_execution",
  "planning_mode": "dynamic",
  "result_type": "analysis_report",
  "trace_id": "...",
  "pipeline_run_id": 123,
  "created_at": "...",
  "updated_at": "..."
}
```

状态统一为：

```text
pending
requires_input
requires_confirmation
running
succeeded
partial_success
failed
cancelled
```

### 7.2 AnalysisPlan

由 LLM 生成、后端 Schema 校验的结构化计划。

```json
{
  "goal": "分析研发部最近三个月考勤",
  "selected_datasets": ["attendance_daily"],
  "time_range": {
    "type": "relative",
    "value": "last_3_months"
  },
  "scope": {
    "organization_refs": ["研发部"]
  },
  "metrics": [],
  "dimensions": [],
  "comparisons": ["previous_period", "organization_average"],
  "analysis_methods": ["summary", "trend", "breakdown", "anomaly"],
  "outputs": ["table", "chart", "report"],
  "assumptions": [],
  "missing_fields": [],
  "requires_confirmation": false,
  "max_drilldown_rounds": 3
}
```

### 7.3 SharedAnalysisState

通用共享状态与具体业务域解耦。

```json
{
  "goal": {},
  "catalog_candidates": [],
  "selected_assets": [],
  "resolved_scope": {},
  "assumptions": [],
  "query_specs": [],
  "query_results": [],
  "quality_results": [],
  "findings": [],
  "charts": [],
  "recommendations": [],
  "limitations": [],
  "artifacts": [],
  "current_stage": "drilldown",
  "drilldown_round": 1
}
```

State 必须按版本保存快照。每个节点只能写入自身声明的分区，不得覆盖历史 Query Result、Finding 和 Artifact。

### 7.4 QuerySpec

LLM 只生成受控查询规格，不生成 SQL。

```json
{
  "dataset_id": "attendance_daily",
  "select": [
    {
      "type": "aggregate",
      "operation": "count",
      "alias": "record_count"
    }
  ],
  "dimensions": [
    {
      "field_ref": "attendance_date",
      "time_grain": "week"
    }
  ],
  "filters": [
    {
      "field_ref": "department_id",
      "operator": "in_resolved_scope"
    },
    {
      "field_ref": "attendance_date",
      "operator": "between",
      "value_ref": "plan.time_range"
    }
  ],
  "order_by": [],
  "limit": 1000,
  "purpose": "分析周度趋势"
}
```

第一阶段允许的操作至少包括：

```text
count
count_distinct
sum
avg
min
max
ratio
count_if
sum_if
period_compare
distribution
rank
```

### 7.5 Finding

```json
{
  "finding_id": "finding_001",
  "type": "observed",
  "title": "迟到率连续三周上升",
  "statement": "研发部迟到率从4.1%上升至7.3%。",
  "evidence_refs": ["query_result_002", "chart_001"],
  "confidence": "high",
  "scope": "研发部",
  "period": "最近三个月"
}
```

`type` 至少支持：

```text
observed
comparison
association
hypothesis
limitation
```

只有 `observed` 和 `comparison` 可以写成确定性事实。`association` 和 `hypothesis` 必须使用非因果措辞。

### 7.6 Recommendation

```json
{
  "recommendation_id": "rec_001",
  "statement": "优先核查异常集中的团队排班和项目节奏。",
  "evidence_refs": ["finding_002"],
  "priority": "high",
  "owner_role": "部门负责人/HRBP",
  "requires_human_decision": true,
  "risk_level": "medium"
}
```

### 7.7 ChartSpec

```json
{
  "chart_id": "chart_001",
  "chart_type": "line",
  "title": "周度迟到率趋势",
  "dataset_ref": "query_result_002",
  "x_field": "week",
  "y_fields": ["late_rate"],
  "series_field": null,
  "unit": "%",
  "insight_refs": ["finding_001"]
}
```

第一阶段允许：

```text
kpi
table
line
bar
stacked_bar
pie
scatter
heatmap
```

ChartSpec 必须经过字段引用、数据类型、数据量和安全校验，再由前端编译为 ECharts 配置。禁止 LLM 直接输出可执行 JavaScript。

### 7.8 AnalysisArtifact

支持：

```text
analysis_table
analysis_chart
analysis_report
analysis_snapshot
query_result
```

最低字段：

```json
{
  "artifact_id": "artifact_001",
  "type": "analysis_report",
  "name": "研发部近三个月考勤分析报告",
  "status": "ready",
  "url": "/reports/...",
  "run_id": "arun_001",
  "source_refs": ["query_result_001", "chart_001"],
  "version": 1,
  "trace_id": "..."
}
```

---

## 8. 通用分析工具

所有工具必须通过代码白名单注册，并有输入输出 Schema、权限声明、数据量限制、审计摘要和失败语义。

### 8.1 数据目录工具

```text
catalog.search_datasets
catalog.get_dataset_schema
catalog.get_dataset_relations
catalog.get_field_profile
catalog.preview_authorized_rows
catalog.list_metrics
catalog.list_dimensions
catalog.resolve_dimension_value
```

返回给 LLM 的目录信息必须经过：

- 数据集 ACL；
- 字段可见性；
- sensitivity_level 过滤；
- 样例值脱敏；
- 行数和字段数限制。

### 8.2 查询与统计工具

```text
analysis.validate_query_spec
analysis.execute_query_spec
analysis.compare_periods
analysis.breakdown_dimension
analysis.profile_distribution
analysis.rank_groups
analysis.check_quality
```

执行器必须：

- 使用已注册数据集；
- 使用已注册关系或 Join Path；
- 自动注入用户 scope；
- 执行列级权限；
- 只读；
- 限制扫描范围、返回行数和超时；
- 返回结构化结果及结果引用 ID；
- 不向模型返回物理 SQL。

### 8.3 产物工具

```text
analysis.create_chart
analysis.create_report
analysis.export_artifact
```

导出和外发必须继承 Capability 风险、确认和权限策略。

---

## 9. 受控 Analysis Loop

### 9.1 默认流程

```text
goal_parse
  → catalog_discovery
  → scope_resolution
  → plan_generation
  → plan_validation
  → initial_query
  → quality_check
  → result_review
  → optional_drilldown
  → chart_generation
  → finding_synthesis
  → recommendation_synthesis
  → report_generation
```

### 9.2 下钻条件

LLM 可以发起下钻，但必须说明安全摘要理由，例如：

```text
第一轮结果显示二级部门差异较大，按二级部门继续拆解。
```

下钻必须满足：

- 不超过配置的最大轮次；
- 使用已授权维度；
- 不扩大原始组织和时间范围；
- 不引入未注册关系；
- 不访问更高敏感等级字段；
- 新 QuerySpec 通过完整校验；
- 预计扫描量未超限。

默认最大下钻轮次为 3，平台配置允许调整，但不得无限循环。

### 9.3 暂停条件

出现以下情况时进入 `requires_input` 或 `requires_confirmation`：

- 组织名称存在多个候选；
- 时间范围无法合理解析；
- 正式指标不存在且临时口径存在重大歧义；
- 用户请求明细但无列级权限；
- 分析计划涉及高风险导出或外发；
- 数据质量不足以支持可靠结论；
- 多种分析方向会导致 materially different 的结果。

---

## 10. 可观测 Run Event 协议

### 10.1 事件类型

第一阶段至少支持：

```text
run.created
run.started
stage.started
stage.progress
tool.started
tool.completed
tool.failed
finding.created
chart.created
artifact.created
input.required
confirmation.required
stage.completed
stage.failed
run.completed
run.failed
run.cancelled
```

### 10.2 事件结构

```json
{
  "event_id": "aevt_001",
  "run_id": "arun_001",
  "sequence": 12,
  "type": "tool.completed",
  "stage_id": "initial_query",
  "status": "succeeded",
  "safe_summary": "已返回13周、4个二级部门的汇总结果",
  "capability_id": "analysis.execute_query_spec",
  "tool_name": "analysis.execute_query_spec",
  "artifact_refs": ["query_result_002"],
  "trace_id": "...",
  "created_at": "..."
}
```

### 10.3 事件真实性

- `tool.started` 只能由执行器在真实调用开始时产生；
- `tool.completed` 只能在真实结果成功持久化后产生；
- `finding.created` 必须带有效 `evidence_refs`；
- 未执行的计划不得显示为已完成；
- 模型生成的进度文案必须标记为计划或摘要，不得冒充系统状态；
- 所有 `safe_summary` 必须经过敏感数据净化。

### 10.4 事件存储和恢复

每个事件必须持久化 `sequence`。客户端断线后可用最后 sequence 补拉历史事件，再继续消费实时事件，避免遗漏和重复。

---

## 11. API 需求

建议公共 API：

```text
POST /api/v1/ai/analysis-runs
GET  /api/v1/ai/analysis-runs/{run_id}
GET  /api/v1/ai/analysis-runs/{run_id}/events
GET  /api/v1/ai/analysis-runs/{run_id}/events/stream
POST /api/v1/ai/analysis-runs/{run_id}/input
POST /api/v1/ai/analysis-runs/{run_id}/confirm
POST /api/v1/ai/analysis-runs/{run_id}/cancel
GET  /api/v1/ai/analysis-runs/{run_id}/artifacts
```

### 11.1 创建 Run

请求：

```json
{
  "message": "分析研发部最近三个月考勤，生成图表和报告",
  "conversation_id": null,
  "page_context": {},
  "output_preferences": {
    "report": true,
    "charts": true
  }
}
```

响应：

```json
{
  "run_id": "arun_001",
  "conversation_id": "...",
  "status": "pending",
  "trace_id": "...",
  "events_url": "/api/v1/ai/analysis-runs/arun_001/events/stream"
}
```

### 11.2 实时传输

第一阶段使用 SSE。用户确认、补充输入和取消继续使用普通 POST。

SSE 必须支持：

- 心跳；
- `Last-Event-ID` 或等价 sequence 恢复；
- 历史补偿；
- 事件去重；
- 终态关闭；
- 权限重新校验。

### 11.3 最终结果

最终结果必须复用 `CapabilityResultEnvelope`，不得新增业务专属顶层字段：

```json
{
  "intent": "data.analysis",
  "status": "succeeded",
  "answer": "分析已完成，发现2项主要异常。",
  "capability_id": "data.analysis",
  "result": {
    "type": "analysis_report",
    "data": {
      "run_id": "arun_001",
      "findings": [],
      "recommendations": [],
      "limitations": []
    },
    "artifacts": [],
    "actions": []
  },
  "permission": {},
  "masking": {},
  "trace_id": "..."
}
```

---

## 12. 与现有系统的复用边界

### 12.1 AI Runtime

复用：

- `app/ai/provider.py`；
- `app/ai/capabilities.py`；
- `app/ai/router.py` 的 LLM-first 原则；
- `app/ai/schema_validator.py`；
- `app/ai/policy_guard.py`；
- `app/ai/context_builder.py`；
- `app/ai/conversation.py`；
- `app/ai/audit.py`；
- `app/ai/actions.py`；
- Capability Rate Limit；
- `CapabilityResultEnvelope`。

新增公共 Capability 建议：

```text
data.analysis
catalog.search_datasets
catalog.inspect_dataset
analysis.execute_query_spec
analysis.create_chart
analysis.create_report
```

不得为每个数据主题新增一套聊天入口。

### 12.2 Warehouse

复用：

- DataSet、Output Field、Relation、Calculated Field；
- Dimension；
- WarehouseMetric；
- DWS Aggregate Definition；
- MetricRun、MetricResult、MetricResultRow；
- Quality Rule 和 Quality Run；
- Report 现有查询和展示能力。

需要补齐：

- 统一 Semantic Query Service；
- 数据目录搜索和 AI-safe Schema 输出；
- Field Profile；
- QuerySpec Validator/Compiler；
- 受控临时聚合；
- 真实 Warehouse-UCP systems/resources/status/preview 适配；
- Report Artifact 生成。

### 12.3 UCP

复杂或长时分析复用：

- Pipeline Run；
- Step Run；
- 取消；
- 重试；
- 部分成功；
- 执行日志；
- Resource Snapshot；
- Approval Service。

Analysis Run 可关联 UCP Pipeline Run，但 UCP 是执行状态真理源，不新建第二套 DAG 引擎。

### 12.4 前端

复用：

- `GlobalAiAssistant.vue`；
- 当前 AI API Envelope；
- ECharts 基础；
- UCP Run/Step 展示经验；
- 现有 Report 页面。

新增：

- Analysis Run 状态卡；
- 进展时间线；
- 阶段性 Finding；
- Chart Artifact 渲染；
- Report Artifact；
- 用户输入/确认节点；
- Run Inspector；
- 管理员调试模式。

---

## 13. 前端交互要求

### 13.1 普通模式

默认展示：

```text
正在理解分析目标
已找到相关数据集
已完成权限检查
正在执行第一轮统计
发现2项值得下钻的变化
正在生成3张图表
正在生成报告
```

### 13.2 专家模式

可展开查看：

- 分析范围；
- 使用的数据集；
- 正式或探索指标口径；
- 查询结果摘要；
- 下钻理由；
- Finding 和 evidence；
- 置信度；
- 数据质量和局限。

### 13.3 管理员调试模式

仅授权管理员可查看：

- Capability；
- Tool；
- QuerySpec；
- Schema/Policy 结果；
- UCP Run/Step Run；
- 重试；
- Token、耗时；
- failure_stage；
- trace_id。

管理员模式仍不得展示凭证、完整 Prompt、未脱敏原始数据和隐藏思维链。

---

## 14. 权限、安全与治理

### 14.1 权限顺序

```text
用户认证
  → data.analysis Capability 权限
  → 数据集 ACL
  → 组织/对象范围解析
  → 字段权限
  → 敏感字段裁剪和脱敏
  → QuerySpec 校验
  → 查询执行
```

任一步失败均 fail closed。

### 14.2 数据最小化

模型默认只接收：

- 数据目录元数据；
- 经过权限过滤的字段定义；
- 脱敏样例或聚合画像；
- 汇总查询结果；
- 必要的低敏明细。

模型不得接收完整员工明细表。需要员工级明细时必须经过专属权限和数据量限制，并优先由后端完成统计后只发送摘要。

### 14.3 查询安全

- 只读数据库身份；
- 禁止任意 SQL；
- 禁止任意函数；
- 禁止未注册 Join；
- 强制 limit；
- 强制 timeout；
- 强制时间范围；
- 强制 scope 注入；
- 大数据量转异步；
- 查询日志不得包含敏感明细。

### 14.4 高风险输出

涉及以下内容时只生成分析草案，并标记人工决策：

- 裁员；
- 降薪；
- 冻编；
- 调岗；
- 绩效评价；
- 接班人认定；
- 具体员工风险标签；
- 对外发送；
- 敏感报告导出。

---

## 15. 失败与降级

### 15.1 数据资产无法识别

返回候选数据集或请求用户缩小范围，不得编造数据源。

### 15.2 正式指标不存在

可以：

- 提出临时探索口径；
- 展示公式和假设；
- 请求用户确认；
- 标记结果为探索性。

不得把临时口径伪装为企业正式指标。

### 15.3 数据质量不足

报告必须说明：

- 缺失数据；
- 受影响指标；
- 结论可信度；
- 是否停止分析或部分完成。

### 15.4 部分查询失败

允许 `partial_success`，但必须明确：

- 哪些步骤成功；
- 哪些失败；
- 哪些结论仍有效；
- 哪些图表或建议未生成。

### 15.5 Provider 失败

已完成的确定性 Query Result 和 Chart Artifact 应保留。用户可重试解释/报告节点，不重复执行不必要的数据查询。

---

## 16. 评测要求

### 16.1 评测分类

至少覆盖：

1. 意图和范围解析；
2. 数据集发现；
3. 字段和关系选择；
4. QuerySpec 合法性；
5. 权限和越权拒绝；
6. 敏感字段脱敏；
7. 数值正确性；
8. 同比/环比正确性；
9. 图表字段一致性；
10. Finding 证据引用；
11. 相关性与因果措辞；
12. 报告完整性；
13. 事件真实性；
14. 断线恢复；
15. 取消和失败重试。

### 16.2 最小端到端用例

至少包括：

- 单数据集汇总分析；
- 正式指标分析；
- 无正式指标的临时探索分析；
- 组织同名候选；
- 无数据权限；
- 无字段权限；
- 数据质量不足；
- 一轮下钻；
- 达到最大下钻轮次；
- 图表生成；
- 报告 Artifact；
- Provider 在报告阶段失败；
- 用户中途取消；
- SSE 断线恢复。

### 16.3 量化门槛

上线前至少满足：

- 未注册数据集调用拦截率：100%；
- 越权查询拦截率：100%；
- 敏感字段泄露：0；
- QuerySpec Schema 通过后编译成功率：≥99%；
- 数值型标准样例准确率：100%；
- ChartSpec 字段引用有效率：100%；
- Finding 有效 evidence 引用率：100%；
- 确定因果误述率：0；
- Run 终态与 UCP 状态一致率：100%；
- 事件顺序和断线恢复测试通过率：100%。

---

## 17. 验收标准

### 17.1 功能验收

给定：

> 分析研发部最近三个月的考勤情况，与上一周期比较，生成图表、结论、建议和报告。

系统必须：

1. 创建 Analysis Run 并立即返回 `run_id`；
2. 前端可实时收到阶段事件；
3. 自动发现相关数据集，不要求用户先选择固定领域包；
4. 解析研发部和时间范围，存在歧义时暂停确认；
5. 校验 Capability、数据集、行级和列级权限；
6. 生成合法 AnalysisPlan；
7. 生成并校验 QuerySpec，不执行任意 SQL；
8. 执行真实查询和确定性统计；
9. 根据首轮结果进行不超过配置上限的受控下钻；
10. 生成至少一个有效 ChartSpec；
11. Finding 必须引用真实 Query Result 或 Chart；
12. 建议必须引用 Finding，并标记是否需要人工决策；
13. 生成最终 Report Artifact；
14. 返回统一 CapabilityResultEnvelope；
15. 完整保存 Run、State Snapshot、Events、Artifacts 和 trace_id；
16. 用户可取消任务；
17. 断线后可恢复历史事件并继续接收；
18. 不展示隐藏思维链、SQL、凭证或未脱敏数据。

### 17.2 通用性验收

使用同一套 Runtime，将问题替换为：

> 分析销售部近一年的离职情况，找出变化明显的群体并生成报告。

不得新增独立 Provider、Agent Loop、查询执行器、图表引擎和报告引擎。系统应通过动态数据发现和分析计划完成任务，必要时对临时指标口径进行确认。

### 17.3 可观测性验收

前端至少应显示：

```text
✓ 已识别分析目标
✓ 已找到相关数据集
✓ 已完成权限检查
✓ 已完成第一轮统计
→ 正在按组织维度下钻
✓ 已生成图表
✓ 已生成报告
```

每个完成状态必须能关联到真实事件和真实执行结果。

---

## 18. 实施阶段

### Phase A：只读通用分析闭环

交付：

- `data.analysis` Capability；
- Data Catalog Tools；
- AnalysisPlan；
- SharedAnalysisState；
- QuerySpec Validator/Compiler；
- 单数据集只读聚合；
- 基础统计；
- Finding/Evidence；
- ChartSpec；
- Report Artifact；
- Analysis Run 和最小事件协议。

限制：

- 仅 Web；
- 仅单数据集或已注册关系；
- 最多 3 轮下钻；
- 不导出敏感明细；
- 不执行写动作。

### Phase B：实时事件与运行检查器

交付：

- SSE；
- 事件持久化；
- sequence 和断线恢复；
- 进展时间线；
- Finding/Chart 实时展示；
- 输入、确认和取消；
- Run Inspector；
- UCP Run/Step Run 状态映射。

### Phase C：复杂分析与正式报告

交付：

- 多数据集已注册关系；
- 正式指标优先；
- 临时探索口径确认；
- 更多统计工具；
- Word/PDF/Excel Artifact；
- 报告版本；
- 分享和导出权限；
- 场景评测管理。

### Phase D：渠道与专家协作

进入条件：前述通用分析链已稳定。

交付：

- 飞书长任务进度通知；
- Web 深度查看链接；
- 多分析子任务并行；
- 专家团共享同一 Analysis Runtime；
- 跨主题组织效能和人力战略规划。

多 Agent 只是 Analysis Runtime 的上层消费者，不得各自重新实现数据查询、图表、报告、权限和审计。

---

## 19. 当前代码缺口清单

根据现有代码和 004/012 状态，实施前必须确认并补齐：

1. 统一 Semantic Query Service 尚未完成；
2. `QuerySpec` 及编译器尚未完成；
3. Warehouse 侧 UCP systems/resources/status/preview 仍有占位；
4. 现有质量规则主要是数据质量，不是业务分析异常；
5. 独立报告模板和分析 Report Artifact 尚未完成；
6. AI Artifact 虽有通用外壳，但仓库分析生产链尚未完成；
7. 自然语言仓库分析 ChatRoute 尚未完成；
8. Analysis Run Event、SSE 和断线恢复尚未完成；
9. 前端完整历史恢复、通用 Artifact 渲染和 Run Inspector 尚未完成；
10. 现有 eval 尚未覆盖通用数据分析端到端链。

已有能力必须复用，不得以缺少通用分析层为由重建数据仓库、UCP、权限、会话或 AI Provider。

---

## 20. 关键决策

1. 建设通用智能分析 Runtime，不建设强制领域包；
2. LLM 动态发现数据和规划分析，但不直接执行 SQL；
3. 后端使用 QuerySpec 强制权限、白名单、范围和资源限制；
4. 图表由 LLM 生成受控 ChartSpec，系统编译为 ECharts；
5. 结论必须引用证据，并区分事实、比较、关联和假设；
6. 允许探索指标，但必须展示临时口径，不得冒充正式指标；
7. 展示可验证的进展和推理摘要，不展示隐藏思维链；
8. 使用 SSE + 持久化事件支持实时进展和断线恢复；
9. 复杂执行复用 UCP Run/Step Run；
10. 最终结果复用 CapabilityResultEnvelope；
11. 先完成单数据集只读分析闭环，再扩展多数据集和专家团；
12. 所有新增能力必须经过权限、脱敏、审计和 eval 验证。
