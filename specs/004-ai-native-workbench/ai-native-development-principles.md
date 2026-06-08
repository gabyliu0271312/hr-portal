# HR 工作台 AI 原生开发原则

版本：v0.1  
日期：2026-06-08  
状态：系统级开发原则  
适用范围：HR Portal 后续所有新功能、重构功能、工具模块、报表模块、数据接入模块、系统设置模块

## 1. 根本定位

HR Portal 后续不再只是“功能页面集合”，而是 AI 原生 HR 工作台。

AI 原生的含义是：

```text
所有业务能力都必须具备被 AI 理解、检索、调用、校验、审计和用户确认的准备。
```

AI 原生不等于：

```text
所有业务逻辑都交给大模型执行。
所有页面都加一个 AI 按钮。
所有接口都直接暴露给模型。
```

系统的长期边界是：

```text
AI 负责理解、编排、草稿、解释和建议。
HR Portal 负责权限、数据、确定性计算、状态变更、导出、审计和最终执行。
用户负责确认高风险动作。
```

## 1.1 开发节奏原则

不需要等完整 AI 平台全部建设完成后，才继续业务功能开发；但凡是 AI 相关能力，必须先完成最小 AI 原生底座，再接入具体场景。

最小底座包括：

```text
Capability Registry
AI Orchestrator
Tool Wrapper
Context Packet
Schema Validator
Policy Guard
Audit
Eval Case Skeleton
```

推荐节奏：

```text
先做最小 AI 底座
  -> 接入一个真实场景验证，例如公式/计算字段
  -> 在真实场景中补齐缺口
  -> 再扩展报表、成本分摊、文档、数据解释等能力
```

开发准入规则：

- 新的 AI 相关功能，不得绕过最小底座直接接模型或拼 prompt。
- 新的普通业务功能可以继续开发，但设计时必须同步判断是否注册 AI Capability。
- 如果暂不暴露给 AI，必须在规格或任务说明里明确写出“不注册 AI Capability”。
- 不做“大而全 AI 平台”后再交付业务；以最小底座 + 真实业务场景迭代。

## 2. 所有功能开发的必备要求

任何新增或重构功能，都必须同步考虑以下 AI 暴露准备。

### 2.1 Capability Metadata

每个可被 AI 调用或理解的业务能力，必须定义能力元数据：

```text
capability_id        稳定能力 ID，例如 report.create_draft
name                 中文名称
description          能力说明，供模型和管理员理解
module               所属模块
input_schema         输入结构
output_schema        输出结构
required_permission  所需功能权限
data_scope           是否需要数据范围过滤
sensitivity          是否涉及敏感字段或敏感输出
side_effect          none / draft_only / write / export / external_send
confirmation         none / normal / high_risk
examples             典型用户问法
failure_modes        常见失败原因
```

没有能力元数据的业务能力，默认不得由 AI 自动调用。

### 2.2 Tool Boundary

AI 不直接调用任意后端 URL。所有可调用动作必须封装为受控工具：

```text
AI -> Orchestrator -> Tool Wrapper -> Existing Business Service
```

工具包装层必须做：

- 参数 schema 校验。
- 权限校验。
- 数据最小化。
- 敏感字段脱敏。
- 高风险动作确认。
- 审计记录。

### 2.3 Intent First

任何 AI 入口都必须先判断用户意图，再决定是否调用工具。

至少区分：

```text
问答：只回答，不修改系统状态。
草稿：生成公式、报表配置、文档、规则等草稿。
诊断：解释错误、解释公式、解释报表结果。
查询：读取已授权系统信息。
执行：写入、保存、导出、推送、同步。
```

低置信度时必须回问，不得直接执行。

### 2.4 Context Packet

传给模型的上下文必须是结构化 Context Packet，不允许业务页面随意拼接大段数据。

Context Packet 应包含：

```text
user_context       当前用户、角色摘要、权限摘要
page_context       当前页面、当前模块、当前对象
data_context       当前数据集、字段清单、脱敏样例
capability_context 可用能力和工具
policy_context     安全限制、确认策略、禁止事项
conversation       最近对话摘要
```

敏感明细默认不得进入模型上下文，除非能力明确需要、用户有权限、且有审计记录。

### 2.5 Schema And Policy Guard

模型输出必须先过结构化校验和策略校验，再进入业务流程。

必须校验：

- 输出 JSON schema。
- 字段是否存在。
- 函数是否启用。
- 用户是否有权限访问相关对象。
- 是否试图绕过权限。
- 是否包含 SQL、代码、URL、外部发送等风险内容。
- 是否需要用户确认。

### 2.6 Human Confirmation

凡是会改变系统状态、导出数据、推送消息、生成正式文件的动作，都必须由用户确认。

确认等级：

```text
none       纯问答、纯解释。
normal     保存草稿、填入配置、创建待确认任务。
high_risk  导出敏感数据、批量修改、推送外部消息、正式生成文件。
```

AI 不得绕过确认直接执行高风险动作。

### 2.7 Audit By Default

AI 行为默认可审计。

每次 AI 调用至少记录：

- 用户输入。
- 识别意图。
- 选中的 capability。
- 使用的模型能力标签。
- 使用的工具。
- 输入输出摘要。
- 权限判断结果。
- 用户确认结果。
- 业务执行结果。
- 错误原因。
- token 与耗时。

AI 日志纳入统一系统日志管理，不为 AI 单独创建孤立日志入口。

## 3. 不允许的反模式

以下做法禁止：

- 业务页面直接拼 prompt 调模型。
- 把已有业务接口 URL 动态注册给 AI 直接调用。
- 让模型生成 SQL 并执行。
- 让模型生成 Python/JavaScript 代码并执行。
- 用提示词替代权限校验。
- 用关键词判断替代完整意图识别和低置信度回问。
- 把敏感明细全量塞进模型上下文。
- 用户问答时强制写入业务草稿。
- AI 自动保存、导出、推送、同步。
- 高风险动作没有审计。

## 4. 推荐后端模块边界

长期建议形成统一 AI 编排层：

```text
backend/app/ai/
├── orchestrator.py          # 意图识别、能力选择、工具编排
├── capabilities.py          # 能力注册中心
├── tools/                   # 受控工具包装
├── context_builder.py       # 上下文构建
├── policy_guard.py          # 安全策略
├── schema_validator.py      # 输出结构校验
├── model_provider.py        # 模型适配
├── conversations.py         # 会话
├── audit.py                 # 审计
└── evals.py                 # 评测
```

业务模块负责提供能力定义和工具实现：

```text
reports      -> report.* capabilities
datasets     -> dataset.* capabilities
ai_formula   -> formula.* / function_catalog.* capabilities
tools        -> document.* capabilities
allocation   -> cost_allocation.* capabilities
```

## 5. 前端设计原则

AI 入口分三类：

```text
全局 AI 工作台：跨模块任务和长对话。
页面级 Copilot：带当前页面上下文的辅助。
字段/公式/规则内嵌助手：局部结构化草稿生成。
```

前端必须明确区分：

- 回答。
- 草稿。
- 应用草稿。
- 执行。
- 高风险确认。

问答不应污染业务编辑区；只有草稿或执行意图才允许填入配置、公式、文档或规则。

## 6. 评测先行

每个 AI 能力上线前必须至少沉淀基础评测用例：

```text
正常生成案例
问答案例
解释案例
失败案例
越权案例
敏感数据案例
低置信度回问案例
```

没有评测集，不允许把 prompt 调整视为完成。

## 7. 微调策略

模型微调不是第一阶段地基。

优先顺序：

```text
能力注册 -> 工具调用 -> 上下文管理 -> 策略校验 -> 评测集 -> Prompt 优化 -> 模型选择 -> 微调
```

只有当真实数据表明以下问题长期存在时，再考虑微调：

- 固定业务术语理解不稳定。
- 固定输出格式在强 schema 下仍不稳定。
- 大量同类任务靠 prompt 难以提升。
- 已有高质量标注样本。

微调不能替代权限、工具调用、审计和确认策略。
