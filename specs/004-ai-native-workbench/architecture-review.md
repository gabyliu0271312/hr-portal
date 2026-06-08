# AI 原生 HR 工作台架构评估与设计

版本：v0.1  
日期：2026-06-08  
状态：架构评审草案  
评审对象：`D:\乐逗\Desktop\大语言模型介入需求.txt`

## 1. 总体判断

原方案的方向是对的：HR Portal 需要从“权限 + 报表 + 工具菜单”升级为“AI 原生工作台”，让自然语言、任务编排、文档生成、报表设计和数据解释成为平台能力。

但原方案有一个根本性混淆：它把“AI 原生”理解成“所有功能优先调用 LLM”，并进一步落到“先建一个统一 LLM 网关 + Skill/Action 编排系统”。这个方向如果直接实施，会把当前已经稳定的权限、数据范围、报表执行、模板生成等确定性能力推到 LLM 外围，形成新的安全边界和运维复杂度。

推荐结论：

```text
AI 原生 = 所有核心工作流都要有 AI 参与入口、上下文理解、草稿生成和解释能力。
AI 原生 != 所有业务逻辑都交给大模型执行。
```

架构上应采用：

```text
LLM 负责理解、生成草稿、编排计划、解释结果。
HR Portal 后端负责权限、数据查询、确定性计算、状态变更、导出和审计。
用户负责确认高风险动作。
```

## 2. 对原方案的强批判性评估

### 2.1 值得保留的部分

- 统一模型调用入口：所有业务模块不能各自直连模型厂商。
- Skill 概念：把“生成报表配置”“生成 Excel 公式”“解释数据异常”“辅助起草文档”等封装为可审计的能力。
- 输出 Schema 校验：LLM 产物必须是结构化结果，不允许自由文本直接驱动业务执行。
- 会话与用户绑定：防止跨用户上下文串扰。
- 功能权限与数据权限分离：功能入口和具体数据访问不能混为一谈。
- 飞书适配服务独立：渠道适配不应污染核心业务服务。
- 审计日志：AI 参与的数据访问和动作执行必须可追溯。

### 2.2 必须修正的问题

| 原方案点 | 问题 | 修正建议 |
|---|---|---|
| 先建 Node.js/Go LLM 网关 | 当前项目是 FastAPI + Vue + PostgreSQL，已有认证、权限、数据范围和审计基础。另起网关会重复造边界。 | 第一期在 `hr-portal/backend/app/ai` 内嵌 AI 平台能力；未来调用量和多应用复用成熟后再拆外部网关。 |
| “所有功能优先接入 LLM” | 会诱导把确定性计算、权限判断、报表查询交给模型，风险极高。 | 所有功能优先考虑 AI 入口和 AI 增强，但执行仍由确定性服务完成。 |
| Action 动态注册热加载 | 任意后端端点被注册为 Action，等于扩大攻击面。 | 第一期只允许代码白名单 + 数据库元数据描述；动态注册仅限管理员启停和配置，不允许注册任意 URL。 |
| 函数人人可用 | “纯计算函数”和“读取员工敏感数据的函数”被混在一起。 | 必须区分 Pure Formula Function 与 Data Action。前者开放，后者必须走功能权限 + 数据范围权限。 |
| 网关只做功能权限 | 如果网关能调用 Action，就不能完全无视 Action 风险。 | 网关/AI 服务负责 Action 级许可、参数校验、确认策略；业务服务负责数据权限。 |
| Redis 存会话 | Redis 只适合热上下文，不适合审计和复盘。 | PostgreSQL 持久化 conversation/message/tool_invocation；Redis 只缓存短期上下文。 |
| 关键词路由 Skill | 对“AI 工作台”太脆弱，且容易误触高风险动作。 | 优先显式入口和页面上下文；LLM 意图分类仅作为辅助，并需低置信度回问。 |
| 缓存相同输入 1 小时 | HR 数据高度权限相关，相同输入不同用户结果不同。 | 缓存必须带 tenant/user/permission/context 指纹；敏感输出默认不缓存。 |
| 防越狱靠提示词和敏感词 | 提示词不是安全边界。 | 用工具白名单、参数 Schema、数据最小化、禁止执行生成 SQL/代码、输出过滤和红队集。 |
| Feishu group session 用 open_chat_id | 群聊中多个用户共享上下文，会串权限。 | session key 至少包含 tenant_id + open_chat_id + open_id + thread/message root。 |
| 公式执行读取数据 | 容易绕过现有 `scope_filter` 和脱敏逻辑。 | 公式助手先作为草稿生成器；凡涉及 HR 数据执行，必须调用现有数据/报表/工具 API。 |
| 模型名写死 | 模型迭代快，规格文档写死具体模型会过期。 | 用能力标签配置模型：`fast_json`、`reasoning`、`long_context`、`low_cost`。 |

### 2.3 应该推翻的隐含假设

1. “LLM 网关越早独立越专业”  
   当前阶段相反。AI 服务离现有权限、数据和业务服务越远，越容易失控。先嵌入 HR Portal 后端，边界清晰后再拆。

2. “函数本身无权限，所以 CALC_TAX 可以自由调用”  
   `CALC_TAX(50000)` 是纯计算；`CALC_TAX(employee_id)` 是读取工资数据的业务动作。后者不是普通函数，是敏感数据访问。

3. “Skill/Action 注册中心越灵活越好”  
   HR 场景里灵活通常意味着越权风险。早期应该牺牲一点扩展性，换取可审计和可控。

4. “AI 工作台就是聊天窗口”  
   真正的 AI 原生工作台应该是“全局工作台 + 场景 Copilot + 结构化产物 + 可确认执行”，而不是单一聊天机器人。

## 3. 重新定义产品定位

建议将系统定位为：

```text
HR AI 工作台：
以 HR Portal 的人员、组织、权限、报表、模板和业务工具为底座，
通过大模型提供自然语言入口、任务草稿、报表配置生成、文档起草、数据解释和跨模块工作流辅助。
```

### 3.1 三类 AI 入口

1. 全局 AI 工作台

顶部一级入口，面向跨模块任务：

```text
AI 工作台
├─ 对话工作台
├─ 我的 AI 草稿
├─ 最近任务
└─ 使用记录
```

2. 场景 Copilot

嵌入现有页面右侧抽屉或侧边栏：

```text
报表设计器：帮我根据自然语言生成报表字段、筛选、排序配置。
数据视图：帮我解释当前筛选结果、发现异常、生成摘要。
模板维护：帮我检查占位符、生成模板变量说明。
证明开具：帮我润色证明草稿，但不改变后台标准模板。
补偿金计算：帮我解释计算过程和协议条款来源。
```

3. 管理员 AI 控制台

用于 AI 能力治理：

```text
Prompt 模板
Skill 配置
模型路由
用量与成本
审计日志
评测用例
红队用例
```

## 4. 推荐总体架构

### 4.1 第一期不新建独立 LLM 网关

当前 HR Portal 已具备：

- FastAPI 认证依赖 `current_user`
- 菜单/操作权限 `require_op`
- 数据范围权限 `build_scope_filter`
- 敏感字段脱敏 `masker`
- 报表配置和数据集执行管道
- 文档模板和生成日志

因此第一期 AI 平台应内嵌在 HR Portal 后端：

```text
frontend
  ├─ AI 工作台页面
  ├─ 全局 AI 侧边栏
  └─ 页面级 Copilot 入口

backend/app/ai
  ├─ router.py                # /api/v1/ai/*
  ├─ conversations.py         # 会话与消息
  ├─ skills/                  # 技能实现
  ├─ actions/                 # 受控业务动作包装
  ├─ model_provider.py        # 模型厂商适配
  ├─ prompt_templates.py      # 提示词模板
  ├─ policy_guard.py          # 安全与策略校验
  ├─ context_builder.py       # 页面上下文与数据最小化
  ├─ schema_validator.py      # 输出结构校验
  ├─ audit.py                 # 审计与追踪
  └─ evals.py                 # 评测用例

existing backend services
  ├─ reports
  ├─ data
  ├─ tools
  ├─ document_templates
  ├─ scopes
  └─ permissions
```

未来当以下条件满足时，再拆出独立 AI Gateway：

- 多个系统都要复用同一 AI 能力。
- 模型路由、限流、计费、观测复杂度显著提高。
- 有专门运维和安全审计要求。
- HR Portal 内嵌服务成为性能瓶颈。

拆分后，外部 AI Gateway 也只应做模型适配、成本、观测和通用安全策略，不应接管 HR 业务数据权限。

### 4.2 AI 服务与业务服务的边界

```text
AI 服务可以做：
- 理解用户意图
- 生成报表 config 草稿
- 生成 Excel 公式草稿
- 生成文档草稿
- 总结已授权数据
- 解释确定性计算结果
- 给出下一步建议

AI 服务不可以做：
- 直接拼 SQL 查询 HR 数据
- 直接修改业务状态
- 绕过 require_op / scope_filter 调数据
- 执行 LLM 生成的代码
- 根据模型判断数据权限
- 自动导出敏感数据
```

### 4.3 标准执行链路

```text
用户输入
  -> 识别显式入口/页面上下文/意图
  -> 校验用户是否可使用该 Skill
  -> 构建最小必要上下文 Context Packet
  -> 调用模型生成结构化草稿
  -> Schema 校验
  -> Policy Guard 安全检查
  -> 返回草稿给用户确认
  -> 用户确认
  -> 调用现有业务服务执行
  -> 业务服务执行 require_op / scope_filter / masker
  -> 记录 AI 调用、工具调用、结果和审计
```

## 5. 权限与安全设计

### 5.1 三层权限模型

AI 工作台必须叠加现有权限，而不是替代现有权限。

```text
第一层：入口权限
用户能否进入 AI 工作台或看到页面级 Copilot。

第二层：Skill 权限
用户能否使用某个 AI 技能，例如报表生成、公式助手、文档润色。

第三层：业务数据权限
AI 生成的草稿执行时，仍由现有业务服务按 scope_filter / masker 判断。
```

第一期可以复用当前菜单权限体系，将 Skill 权限作为特殊菜单 code：

```text
ai.workbench
ai.skill.report_config
ai.skill.formula_assistant
ai.skill.document_draft
ai.skill.data_summary
ai.admin.prompt_templates
system_logs.ai.view
```

后续再演进为独立应用权限模型：

```text
ai_workbench.app
ai_workbench.admin
```

### 5.2 函数与数据动作必须分离

必须把函数分成两类：

| 类型 | 示例 | 权限策略 |
|---|---|---|
| 纯计算函数 | `CALC_TAX(50000)` | 只要用户有公式助手权限即可生成/使用；不读取 HR 数据。 |
| 数据动作函数 | `CALC_TAX_BY_EMPLOYEE(emp_id)` | 必须校验 Skill 权限、Action 权限、员工工资数据权限。 |

建议避免让 LLM 生成“看似普通函数、实际偷偷查库”的公式。凡涉及员工 ID、工资、身份证、部门成本等敏感数据，应表现为明确 Action：

```text
action:calculate_employee_tax
requires_confirmation: true
data_resource: employee_salary
data_permission: read
```

### 5.3 Prompt 不是安全边界

系统提示词可以约束模型行为，但不能作为唯一防线。必须增加硬边界：

- 不执行 LLM 生成 SQL。
- 不执行 LLM 生成 Python/JS 代码。
- 不允许模型输出任意 API endpoint 后由系统调用。
- 所有工具调用参数必须经 Pydantic/JSON Schema 校验。
- 所有工具必须来自白名单。
- 高风险动作必须二次确认。
- 敏感字段进入模型前必须按最小化原则处理。
- 审计日志不要直接存完整敏感 prompt，优先存 hash、上下文摘要、字段清单和工具调用元数据。

### 5.4 数据进入模型的规则

默认不把完整 HR 数据行发给模型。推荐使用 Context Packet：

```json
{
  "page": "report_designer",
  "user_id": 123,
  "tenant_id": "default",
  "allowed_tables": ["emp_monthly_salary"],
  "visible_columns": [
    {"code": "employee_id", "label": "工号", "sensitive": false},
    {"code": "basic_salary", "label": "基本工资", "sensitive": true}
  ],
  "selected_report_config": {},
  "sample_rows": "masked_or_aggregated"
}
```

原则：

- 生成配置时，只给字段元数据，不给真实数据。
- 总结数据时，先由后端查询已授权数据，再传聚合结果或脱敏样本。
- 涉及敏感字段时，优先传统计量，不传明细。
- 用户没有权限看到的数据，不得以 prompt、工具结果、错误信息、日志任何形式出现。

## 6. 数据模型建议

第一期建议新增以下表，全部放在 HR Portal PostgreSQL 内：

```text
ai_skills
- code
- name
- description
- permission_code
- input_schema
- output_schema
- risk_level
- enabled

ai_actions
- code
- name
- action_type
- permission_code
- input_schema
- output_schema
- requires_confirmation
- risk_level
- enabled

ai_prompt_templates
- code
- skill_code
- version
- content
- model_capability
- is_active
- created_by

ai_conversations
- id
- user_id
- tenant_id
- channel
- page_context
- created_at
- updated_at

ai_messages
- id
- conversation_id
- role
- content_summary
- content_hash
- safe_content
- created_at

ai_tool_invocations
- id
- conversation_id
- skill_code
- action_code
- request_schema
- response_summary
- status
- trace_id
- created_at

ai_artifacts
- id
- conversation_id
- artifact_type
- content_json
- status
- created_by
- created_at

ai_usage_ledger
- id
- user_id
- skill_code
- model
- input_tokens
- output_tokens
- cost_estimate
- created_at

ai_eval_cases
- id
- skill_code
- input
- expected
- risk_tags
- enabled
```

Redis 只用于：

```text
- 当前会话短期上下文
- 流式响应状态
- 限流计数
```

## 7. API 设计建议

```text
GET  /api/v1/ai/skills
POST /api/v1/ai/conversations
GET  /api/v1/ai/conversations/{id}
POST /api/v1/ai/chat
POST /api/v1/ai/skills/{skill_code}/draft
POST /api/v1/ai/artifacts/{artifact_id}/execute

GET  /api/v1/ai/admin/prompt-templates
POST /api/v1/ai/admin/prompt-templates
PUT  /api/v1/ai/admin/prompt-templates/{id}
GET  /api/v1/ai/admin/usage
POST /api/v1/ai/admin/eval-runs
GET  /api/v1/system-logs?category=ai_call
```

关键设计：

- `draft` 只生成草稿，不改变业务状态。
- `execute` 只执行用户确认过的 artifact。
- 所有执行都必须回到现有业务模块，例如 reports/tools/data。
- 前端应展示“AI 草稿”和“正式执行结果”的状态差异。

## 8. 首批 Skill 设计

### 8.1 报表配置助手

目标：把自然语言转成现有 `reports.config`，而不是生成 SQL。

示例：

```text
“帮我做一张 2026 年 5 月研发中心员工工资报表，只看工号、姓名、部门、基本工资、目标年终奖，按部门排序。”
```

输出：

```json
{
  "artifact_type": "report_config",
  "table_name": "emp_monthly_salary",
  "columns": ["工号", "姓名", "部门", "基本工资", "目标年终奖"],
  "filters": [
    {"column": "期间", "op": "eq", "value": "2026-05"},
    {"column": "部门", "op": "contains", "value": "研发中心"}
  ],
  "sorts": [{"column": "部门", "order": "asc"}],
  "needs_user_confirmation": true
}
```

执行时调用现有报表 API，继续走 `scope_filter` 和脱敏。

### 8.2 Excel 公式助手

目标：生成公式草稿、解释、可选校验。

边界：

- 不直接读取 HR 数据。
- 不生成外部链接、宏、文件访问、网络访问相关公式。
- 自定义函数分为纯计算和数据 Action 两类。
- 公式执行若涉及 HR 数据，必须通过后端业务服务。

### 8.3 文档草稿助手

目标：基于模板维护系统生成或润色草稿。

边界：

- 不替代后台标准模板。
- 用户手工调整仍记录 `document_generation_logs`。
- 法务/补偿/收入证明类文档必须基于模板变量和确定性计算结果。
- AI 只做措辞、摘要、差异说明和草稿建议。

### 8.4 数据解释助手

目标：对用户已运行的报表结果做解释、摘要、异常提示。

边界：

- 模型只看用户已经有权限看到的结果。
- 高敏字段默认脱敏或聚合。
- 不能因为用户追问而扩大查询范围。

### 8.5 字段映射助手

目标：数据接入时，辅助管理员把源字段映射到 `table_columns` 元数据。

价值：

- 当前系统已是 JSONB 动态列，AI 很适合做字段名归一、类型猜测、敏感字段建议。
- 但最终字段类型、是否敏感、scope_role 必须由管理员确认。

### 8.6 知识问答助手

目标：基于制度、模板说明、HR SOP 做问答。

边界：

- 必须做文档级 ACL。
- 必须返回引用来源。
- 不允许无来源编造制度条款。

第一期可以先不做向量库，使用少量手工维护知识文档和关键词检索；RAG 成熟后再扩展。

## 9. 前端体验设计

### 9.1 全局 AI 侧边栏

位置：页面右侧抽屉。  
能力：

- 自动携带当前页面上下文。
- 显示当前可用 Skill。
- 生成草稿 Artifact。
- 支持“应用到当前页面”。

### 9.2 Artifact 面板

AI 输出不应只是聊天文本，而应形成可操作草稿：

```text
报表配置草稿
公式草稿
文档草稿
字段映射建议
数据摘要
```

每个 Artifact 有状态：

```text
draft -> reviewed -> executed -> archived
```

### 9.3 高风险确认

以下动作必须确认：

- 导出数据。
- 生成正式 Word 下载。
- 修改模板。
- 修改报表配置。
- 执行涉及敏感数据的计算。
- 发送飞书消息。

## 10. 分阶段路线图

### 阶段 0：AI 架构护栏与最小可用体验

周期：1 到 2 周。

交付：

- `backend/app/ai` 模块。
- 模型 Provider 抽象。
- Prompt 模板表。
- Skill 白名单。
- AI 会话和工具调用审计。
- 前端全局 AI 侧边栏壳。
- Excel 公式助手草稿版。
- 报表配置助手草稿版。

不做：

- 不做飞书机器人。
- 不做任意 Action 热注册。
- 不做向量库。
- 不做独立 Node/Go 网关。

### 阶段 1：与现有业务深度结合

周期：2 到 3 周。

交付：

- 报表设计器内嵌 Copilot。
- 文档模板/证明开具 Copilot。
- 数据解释助手。
- 字段映射助手。
- Prompt 评测用例和红队用例。
- AI 使用记录和成本看板。

### 阶段 2：受控 Action 执行

周期：3 到 4 周。

交付：

- Action 白名单注册。
- Artifact 确认执行。
- 数据 Action 权限策略。
- Redis 热上下文和限流。
- 敏感数据最小化策略完善。
- RAG 原型，带文档 ACL 和引用。

### 阶段 3：渠道扩展和网关拆分评估

触发条件：内部 Web AI 工作台稳定后。

交付：

- 飞书适配服务。
- 群聊/个人会话隔离。
- 消息卡片 Artifact。
- 外部 AI Gateway 可行性评估。
- 多模型路由和统一成本策略。

## 11. 验收标准

### 11.1 安全验收

- 无 AI 权限的用户看不到 AI 工作台入口。
- 无某 Skill 权限的用户不能调用该 Skill。
- AI 生成的报表配置执行后，结果与手工报表执行使用同一套数据范围和脱敏逻辑。
- 用户要求“忽略权限导出全部工资”时，不调用任何数据访问 Action。
- Prompt 日志不保存完整身份证、工资、手机号等敏感原文。
- 所有工具调用有 trace_id、user_id、skill_code、action_code 和结果状态。

### 11.2 功能验收

- 报表配置助手能生成合法 `reports.config`，用户确认后能进入现有报表预览。
- 公式助手能生成常见 Excel 公式并给出解释。
- 文档草稿助手不会覆盖后台标准模板，只影响本次预览草稿。
- 数据解释助手只解释用户当前已授权数据。
- 字段映射助手只给建议，管理员确认后才写入字段元数据。

### 11.3 架构验收

- 所有模型调用集中在 `app/ai/model_provider.py` 或等价模块。
- 业务模块不得直接调用模型厂商 SDK。
- 所有 Skill 输出都有 Schema。
- 所有高风险执行都走 Artifact 确认。
- 单个 Skill 可以通过测试用例回放评估。

## 12. 最终架构决策

建议采纳以下决策：

```text
ADR-AI-001：AI 平台第一期内嵌 HR Portal FastAPI，不独立建设 Node/Go 网关。
ADR-AI-002：AI 输出默认为草稿 Artifact，不能直接改变业务状态。
ADR-AI-003：禁止执行 LLM 生成 SQL、代码和任意 API endpoint。
ADR-AI-004：Skill/Action 采用白名单注册，动态注册能力推迟。
ADR-AI-005：权限采用入口权限 + Skill 权限 + 业务数据权限三层模型。
ADR-AI-006：公式函数区分纯计算函数和数据动作函数。
ADR-AI-007：飞书机器人延后到 Web 工作台稳定之后。
ADR-AI-008：模型使用能力标签配置，不在业务代码中写死具体模型名称。
```

## 13. 一句话结论

这套系统应该做成“AI 参与每个 HR 工作流的工作台”，而不是“把 HR 系统包一层聊天机器人”。  
LLM 是副驾驶，业务后端是刹车、方向盘和仪表盘；两者必须分工清楚。
