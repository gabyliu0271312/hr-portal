# AI 原生平台完整路线图

版本：v0.1  
日期：2026-06-08  
状态：规划草案  
适用范围：HR Portal AI 原生平台从最小底座到完整工作台的阶段演进

## 1. 定位

本路线图用于回答两个问题：

```text
完整 AI 原生平台最终要拆成哪些能力？
每个阶段什么时候应该做，什么时候不应该做？
```

它不是要求一次性开发完整平台。正确节奏是：

```text
最小底座
  -> 真实场景验证
  -> 多场景复用
  -> 管理治理
  -> 知识检索
  -> 工作流编排
  -> 渠道/网关扩展
  -> 模型优化/微调
```

核心原则：

- 当前阶段先做最小 AI 底座，不做大而全平台。
- 每一阶段必须有进入条件和验收标准。
- 没达到进入条件时，不提前开发后续平台能力。
- 后续平台能力必须围绕真实业务场景增长，不做空转平台工程。
- 阶段顺序是主路径，不是瀑布锁死；允许用少量资源做低风险探索，但探索能力不得绕过审计、权限和回滚要求。
- 模型能力按当前可用最强模型作为固定前提，不做模型选型、模型路由和成本优化；质量控制主要依赖 schema、policy、eval、工具校验和用户确认。

## 2. 完整能力地图

完整 AI 原生平台由以下能力层组成：

```text
体验层
  - 全局 AI 工作台
  - 页面级 Copilot
  - 内嵌字段/公式/规则助手
  - AI 能力管理
  - 评测与失败分析

编排层
  - Intent Classifier
  - Capability Resolver
  - Workflow Orchestrator
  - Artifact Manager
  - Confirmation Manager

能力层
  - Capability Registry
  - Tool Wrapper Registry
  - Prompt Template
  - Eval Case
  - Policy Profile

上下文层
  - Context Packet
  - Page Context
  - Permission Context
  - Data Context
  - Knowledge Context

安全治理层
  - Schema Validator
  - Policy Guard
  - Permission Check
  - Sensitive Data Minimization
  - Audit
  - Usage Ledger

模型层
  - Model Provider
  - Prompt Optimization
  - Fine-tuning
```

## 3. 阶段总览

| 阶段 | 名称 | 目标 | 当前建议 |
|---|---|---|---|
| Phase 0 | 最小 AI 底座 | 建立 AI 能力受控调用的最小闭环 | 现在做 |
| Phase 1 | 首个场景验证 | 用公式/计算字段验证底座有效性，并用低风险只读场景验证可迁移性 | Phase 0 后立即做 |
| Phase 2 | 多场景复用 | 报表、成本分摊、文档、数据解释接入同一底座 | 首个场景核心能力稳定后做 |
| Phase 3 | 管理治理平台 | 管理员可维护能力、Prompt、评测、成本和失败分析 | Capability 超过 5-8 个后做 |
| Phase 4 | 知识/RAG 能力 | 制度、模板、SOP、字段口径可被检索引用 | 正式开放需稳定文档库和 ACL；管理员受限实验可更早做 |
| Phase 5 | 工作流编排 | 多个 Capability 组合完成跨模块 HR 任务 | 单点能力稳定后做，支持受控动态计划 |
| Phase 6 | 渠道与网关扩展 | 飞书机器人、外部 Gateway、多系统复用 | Web 工作台成熟后做；只读单轮实验入口可更早评估 |
| Phase 7 | 模型优化/微调 | 专有术语、固定输出和复杂意图优化 | 有评测集和真实样本后做 |

## 4. Phase 0：最小 AI 底座

### 目标

建立 AI 能力受控调用的最小闭环。

### 交付物

- `Capability Registry`
- `AI Orchestrator`
- `Tool Wrapper`
- `Context Packet` 轻量分区规范
- `Schema Validator`
- `Policy Guard` 最小规则
- `Audit`
- `Eval Case Skeleton` 与基础量化门槛
- 敏感字段标记与元数据过滤约定
- 首批能力：`formula.generate`、`formula.validate`、`formula.repair`、`calculated_field.save`

### 进入条件

- 已确定首个真实场景，本项目为公式/计算字段。
- 已有 AI 基础配置和模型测试能力。
- 已明确禁止页面直接拼 prompt 调模型。
- 已明确所有实验性 AI 调用也必须经过后端统一入口，不允许前端直连模型服务。

### 验收标准

- 未注册 Capability 不能被 AI 调用。
- Phase 0 的 Registry 可以是轻量清单或配置约定，不要求建设完整管理后台，但必须包含 capability_id、输入输出 schema、风险等级、side_effect_tags、policy profile、tool 白名单、固定模型配置和审计开关。
- 模型输出必须过 schema 和 policy 校验。
- AI 调用和工具调用可审计。
- 公式场景不传真实敏感明细，字段元数据必须按用户权限、场景和 sensitivity_level 过滤后再进入上下文。
- Context Packet 在 Phase 0 只定义轻量顶层分区，例如 page、permission、data、domain_context；公式场景只实现必要字段和函数库上下文，不建设通用上下文聚合框架。
- 报表或其他只读场景的 Context Packet 可以先以文档样例验证结构，不作为 Phase 0 必须开发的完整功能。
- 至少沉淀 20-30 个公式/计算字段 eval case，并支持自动回放。
- Eval Case 必须定义自动判定规则，例如后端公式校验通过、字段引用存在、函数白名单合法、危险表达式被拒绝、失败原因分类正确。
- Policy Guard 在 Phase 0 只做最小 deny list、字段权限过滤、函数白名单和风险分级，不承担完整业务语义治理；高风险写入仍以后端业务校验和用户确认为准。

### 不做

- 不做飞书机器人。
- 不做 RAG。
- 不做工作流编排。
- 不做外部 AI Gateway。
- 不做模型微调。
- 不做模型路由、模型 A/B 和成本优化。
- 不做页面侧 prompt 拼接和模型直调。
- 不做动态 Tool 注册或页面创建任意 Tool。
- 不做可配置策略规则引擎。

## 5. Phase 1：首个场景验证

### 目标

用公式/计算字段验证最小底座是否真实可用，同时控制公式生成的写入风险。

公式场景仍作为首个主场景，但按风险分层推进：

```text
解释/校验/修复建议
  -> 生成公式草稿
  -> 用户确认后填入编辑区
  -> 用户确认后保存
```

并行保留一个低风险只读对照场景，例如报表配置解释或页面指标解释，用于验证底座是否能迁移到非公式场景。

### 交付物

- 公式/计算字段接入 `formula.*` 和 `calculated_field.*` Capability。
- 对话式生成、调整、解释、校验公式。
- 公式草稿进入编辑区前必须有明确用户意图；高风险或低置信结果先展示为草稿建议，不直接覆盖用户已有内容。
- 函数库和字段元数据通过 Tool Wrapper 提供给 AI。
- 公式失败解释和修复建议。
- 公式场景 eval cases。
- 真实业务语义评测样本与人工评估记录。
- 一个只读低风险 Capability，例如 `report.explain_config` 或 `page.explain_metrics` 的最小实验版。

### 进入条件

- Phase 0 最小链路跑通。
- `formula.generate`、`formula.validate`、`calculated_field.save` 已注册。
- 函数库和数据集字段 Tool 可用。
- 敏感字段标记和字段元数据过滤可用。
- 公式 eval case 达到 Phase 0 定义的最低通过门槛。
- 已定义 Phase 1 失败回滚计划，包括触发指标、关闭方式、保留资产、用户沟通和替代场景。

### 验收标准

- 用户问“当前月份公式怎么写”时只回答，不污染公式编辑区。
- 用户明确要求生成并确认填入时，公式草稿进入公式编辑区。
- 用户继续对话调整时，基于当前公式生成新草稿。
- 公式保存前必须通过后端校验。
- 危险公式、不存在字段、未启用函数会被拒绝。
- 生成公式不得覆盖用户已有公式，除非用户明确确认替换。
- 只读对照场景复用同一套 Orchestrator、Context Packet、Policy Guard 和 Audit。
- 公式失败可以定位到 prompt、schema、字段元数据、函数库、后端校验或 policy。
- 至少 10 个真实业务公式意图完成人工语义评估，由业务专家判断公式是否满足需求。
- 人工语义评估应记录需求原文、生成公式、字段映射、业务判断、失败原因和修复建议。

### 不做

- 不做跨模块工作流。
- 不做 AI 自动保存字段。
- 不做数据动作函数读取未授权 HR 数据。
- 不把低风险实验升级为正式能力，除非补齐 capability、schema、policy、eval 和审计。

## 6. Phase 2：多场景复用

### 目标

证明 AI 底座不是公式助手专用，而是可被多个业务模块复用。

### 交付物

- 报表能力：`report.create_draft`、`report.explain_config`、`report.explain_result`
- 成本分摊能力：`cost_allocation.explain_scheme`、`cost_allocation.validate_scheme`
- 文档能力：`document.draft_income_certificate`、`document.draft_agreement`
- 数据集能力：`dataset.list_fields`、`dataset.explain_lineage`
- 页面级 Copilot 统一接入 `POST /api/v1/ai/chat`
- 低风险实验入口：`ai.experiment` 或 `sandbox.chat`，仅允许只读、无敏感明细、可审计的探索性调用。
- 实验生命周期管理：实验创建时必须设置负责人、目标、最长有效期、转正条件和关闭条件。

### 进入条件

- Phase 1 主场景核心链路稳定运行，且高风险写入动作都有用户确认和后端校验。
- 公式场景的失败原因能被审计和回放。
- 至少 3 个 Capability 有稳定 schema 和 eval cases。
- Context Packet 已被至少两个不同业务域验证。

### 验收标准

- 不同页面使用同一套 AI Orchestrator、Context Packet、Policy Guard。
- 新场景不新增独立模型调用接口。
- 报表、成本分摊、文档的执行仍走原业务服务权限。
- 实验入口的调用量、失败率或复用频率超过阈值后，必须升级为正式 Capability。
- 任意页面不得绕过后端统一入口直接调用模型。
- 实验能力默认最长 60 天；到期结论只能是转正、关闭或经评审延期。
- 实验交互必须可回放、可抽样评估，并能一键关闭。

### 不做

- 不做复杂跨模块自动执行。
- 不做外部渠道。
- 不做向量库问答，除非已有文档 ACL。
- 不让 `ai.experiment` 访问敏感字段、业务写入工具或未授权数据。
- 不允许长期维持无负责人、无期限、无转正标准的实验能力。

## 7. Phase 3：管理治理平台

### 目标

让管理员能维护 AI 能力，而不是每次都改代码或数据库。

### 交付物

- AI 能力管理页面。
- Prompt 模板管理。
- Eval Case 管理。
- 失败分析。
- 使用量和调用看板。
- Capability 成功率、失败率、风险分布。
- 实验能力转正式 Capability 的审批和补齐流程。
- 实验生命周期看板。

### 进入条件

- Capability 数量超过 5-8 个。
- 已出现需要管理员启停能力、维护示例问法或分析失败的需求。
- 至少两个业务模块接入 AI 底座。

### 验收标准

- 管理员可启停 `ai_visible`。
- 管理员可维护示例问法和风险等级。
- 管理员不能注册任意 URL 或任意代码。
- 评测失败能定位到 capability、prompt、model、tool 或 policy。
- 管理员可查看 eval case 通过率、失败分类、人工复核状态和版本变化。
- 管理员可查看实验能力的负责人、有效期、转正条件、关闭条件和回放记录。

### 不做

- 不允许通过页面创建任意 Tool。
- 不允许通过页面绕过代码白名单。
- 不把 AI 能力管理做成业务权限替代品。

## 8. Phase 4：知识/RAG 能力

### 目标

让 AI 能基于制度、模板、SOP、字段口径和报表说明进行有来源的回答。

正式面向普通员工开放前，必须满足文档 ACL、来源引用和“无来源不回答”。但可以在 Phase 2-3 开启仅管理员可用的受限 RAG 实验，用于整理制度、发现口径冲突和验证文档质量。

### 交付物

- Knowledge Source 管理。
- 文档 ACL。
- 检索结果引用。
- 知识问答 Capability。
- 与模板维护、字段管理、报表说明的知识连接。
- 管理员受限 RAG 实验空间。
- 文档冲突、过期版本和低可信来源的标记机制。
- 管理员实验的生命周期和退出机制。

### 进入条件

- 已有稳定文档库。
- 文档权限边界明确。
- 业务确实需要制度、模板、字段口径类问答。
- 能接受“无来源不回答”的产品策略。

管理员受限实验的最低进入条件：

- 使用明确白名单文档集。
- 仅管理员或项目成员可访问。
- 不面向普通员工承诺答案正确性。
- 检索结果必须带来源、版本和更新时间。
- 设置实验有效期、负责人和退出条件。

### 验收标准

- 回答必须带来源。
- 用户无权访问的文档不得进入检索上下文。
- 没有可靠来源时必须说明无法确认。
- 知识问答不触发业务写入动作。
- 管理员实验产生的问题、冲突和低质量文档必须能沉淀为整改清单。
- 管理员实验到期后必须评审，决定关闭、延期或补齐正式 RAG 能力要求。

### 不做

- 不把 RAG 当成权限边界。
- 不把所有业务数据塞进向量库。
- 不允许无来源编造制度条款。
- 不把管理员实验直接开放给普通员工。
- 不允许管理员实验长期替代正式知识问答能力。

## 9. Phase 5：工作流编排

### 目标

从“AI 调用单个 Capability”升级为“AI 编排多个 Capability 完成一个 HR 工作流”。

这一阶段类似很多系统里说的 Skill，但本系统不建议使用黑盒 Skill 模式。推荐名称：

```text
AI Workflow / Capability Orchestration
```

### 与 Skill 的关系

传统 Skill 容易变成：

```text
cost_allocation_skill()
```

这种方式的问题是：

- 逻辑黑盒，用户和管理员不知道里面做了什么。
- 权限、确认、审计容易被包装层吞掉。
- 后续维护困难，难以复用其中单个步骤。

本系统推荐：

```text
Workflow = 多个 Capability 的受控编排
Capability = 原子业务能力
Tool = 具体后端工具包装
Artifact = 每一步产生的草稿或结果
Policy Guard = 每一步安全检查
User Confirmation = 高风险步骤确认
```

Workflow 可以有两种形态：

```text
Predefined Workflow = 预定义的高频稳定流程
Dynamic Plan = AI 根据用户目标生成计划，但每一步仍必须解析为已注册 Capability
```

动态计划不是黑盒 Skill。它只负责任务拆解和步骤排序，不允许绕过单个 Capability 的 schema、policy、permission、confirmation 和 audit。

动态计划必须经过 Plan Validator。Phase 5 的 Plan Validator 只做最小可行版本：检查每一步是否能映射到已注册 Capability，读取 Capability 的风险等级和 side_effect_tags，并对相邻两步或短链路组合做规则匹配。它不是完整符号执行系统，也不要求覆盖所有复杂风险模式。

典型 side_effect_tags 包括：

```text
reads_sensitive
writes_data
exports_file
sends_notification
external_channel
batch_operation
high_risk
```

Plan Validator 分层演进：

```text
Phase 5 MVP
  = Capability 映射校验
  + side_effect_tags 读取
  + 相邻两步/短链路风险规则
  + 自动插入确认或拒绝执行

后续治理增强
  = 复杂风险模式库
  + 跨多步骤数据流分析
  + 更细粒度的组合策略
```

复杂模式检测不是永久不做，而是不作为 Phase 5 的进入门槛。只有当真实工作流数量增加、出现高风险组合案例、或准备把 Dynamic Plan 扩展到外部渠道/跨系统执行时，才评估进入后续治理增强。

### 示例

用户输入：

```text
帮我做一套 5 月研发中心成本分摊分析，并生成报表说明。
```

系统编排：

```text
workflow: cost_allocation_monthly_analysis
  -> dataset.list_fields
  -> cost_allocation.create_scheme_draft
  -> cost_allocation.validate_scheme
  -> cost_allocation.explain_scheme
  -> 用户确认
  -> cost_allocation.run
  -> cost_allocation.explain_run_result
  -> report.create_draft
  -> report.explain_result
  -> document.draft_summary
```

### 交付物

- Workflow Definition。
- Dynamic Plan 生成与审查。
- Plan Validator 最小规则集。
- Workflow Orchestrator。
- Step-level Artifact。
- Step-level Confirmation。
- Workflow Audit Trace。
- Workflow Eval Cases。
- Workflow 失败恢复策略。

### 进入条件

- 至少 8-12 个原子 Capability 稳定。
- 每个参与 Workflow 的 Capability 都有 schema、policy、eval cases。
- 单点报表、成本分摊、文档能力都已稳定。
- 高风险确认策略已稳定。
- Dynamic Plan 的可执行步骤必须能全部映射到已注册 Capability。
- 参与 Workflow 的 Capability 必须标注风险等级和 side_effect_tags。
- 已定义最小两步组合风险规则，例如 `exports_file -> sends_notification`、`reads_sensitive -> external_channel`、`batch_operation -> writes_data`。

### 验收标准

- 用户可以看到工作流拆解步骤。
- 每一步都有 capability_id、输入、输出、状态和审计。
- 高风险步骤必须暂停并等待用户确认。
- 工作流失败时能定位到具体步骤。
- 用户可以放弃、重试或编辑某一步草稿。
- 动态计划执行前必须展示计划摘要；涉及写入、发送、导出、批量计算等高风险动作时必须逐步确认。
- Plan Validator 必须能拒绝无法映射到 Capability 的步骤，或提示用户改用系统支持的替代步骤。
- Plan Validator 必须能识别相邻两步或短链路的高风险组合，并强制插入确认、拆分执行或拒绝执行。
- 两个连续 high_risk Capability 不得自动连续执行，必须暂停并由用户确认下一步。

### 不做

- 不做黑盒大 Skill。
- 不让 AI 自动连续执行高风险步骤。
- 不允许 Workflow 绕过单个 Capability 的权限和 Policy Guard。
- 不允许 Dynamic Plan 生成新的 Tool、访问未注册接口或直接操作数据库。
- 不允许绕过 Plan Validator 直接执行动态计划。
- Phase 5 MVP 不建设完整风险模式库、符号执行器或复杂跨步骤数据流分析；这些能力作为后续治理增强，在达到真实风险或外部扩展条件后再评估。

## 10. Phase 6：渠道与网关扩展

### 目标

在 Web 内部工作台成熟后，再评估飞书机器人、外部 AI Gateway 和多系统复用。

渠道扩展分为两个层级：

```text
实验入口 = 只读、单轮、个人会话、无状态、复用 /chat
正式渠道 = 支持身份隔离、群聊隔离、限流治理、审计和运维
```

正式渠道仍放在 Web 工作台成熟之后。实验入口可以在 Phase 1 验证成功后评估，用于收集真实问题和交互反馈。

### 交付物

- 飞书机器人或飞书消息卡片。
- 只读单轮飞书实验入口。
- 群聊/个人会话隔离。
- 外部 AI Gateway 可行性评估。
- 统一限流和观测。

### 进入条件

- Web AI 工作台稳定。
- 多个系统需要复用同一 AI 能力。
- 渠道、限流和观测复杂度明显超过 HR Portal 内嵌架构。
- 有明确运维和安全审计要求。
- 如果正式渠道需要执行 Workflow 或 Dynamic Plan，必须重新评估 Plan Validator 是否覆盖外部渠道相关组合风险；覆盖不足时，不开放自动执行。

只读单轮实验入口的最低进入条件：

- Phase 1 至少一个只读或低风险能力稳定。
- 复用 HR Portal 后端 `/chat` 或同等统一入口。
- 仅个人会话，不支持群聊上下文。
- 不支持业务写入、文件导出、批量操作和敏感明细查询。
- 设置实验有效期、负责人、限流策略和关闭条件。

### 验收标准

- 外部渠道不绕过 HR Portal 权限。
- 群聊上下文不会串用户权限。
- Gateway 不接管 HR 业务数据权限。
- Web 和外部渠道复用同一 Capability Registry。
- 实验入口必须标注实验性质，并能单独关闭、限流和审计。
- 实验入口交互必须可回放、可抽样评估，到期后必须关闭、延期评审或转入正式渠道建设。

### 不做

- 不在 Web 底座不稳定时提前做机器人。
- 不让外部 Gateway 直接查 HR 数据。
- 不把 Gateway 做成业务权限中心。
- 不把只读单轮实验入口扩展成正式群聊机器人，除非补齐身份、权限、上下文隔离和运维治理。
- 不允许实验入口长期替代正式渠道能力。

## 11. Phase 7：模型优化与微调

### 目标

在底座、评测、真实样本成熟后，再考虑 prompt 优化和微调。

当前默认使用可用的最强模型，不在早期阶段投入模型选型、模型路由、成本优化或离线模型对比。Phase 7 关注的是在业务样本、评测和安全治理成熟后，是否需要进一步做 prompt 版本优化或微调治理。

### 交付物

- Prompt 版本优化。
- 评测集自动回放。
- 脱敏训练样本管理。
- 微调可行性评估。
- 微调模型灰度和回滚策略。

### 进入条件

- 有足够真实、高质量、可脱敏的样本。
- 有自动评测能证明问题长期存在。
- Prompt 优化和工具校验仍不能解决稳定性。
- 微调数据通过安全审查。

### 验收标准

- 微调前后有可量化评测结果。
- 微调不降低安全指标。
- 微调模型输出仍受 schema、policy、permission、audit 约束。
- 可以灰度和回滚。

### 不做

- 不用微调替代权限。
- 不用微调替代工具调用。
- 不用微调替代审计。
- 不把敏感明细直接用于训练。
- 不做模型路由和成本优化。

## 12. 阶段升级评估机制

每次准备进入下一阶段前，必须做一次评估：

```text
1. 当前阶段交付物是否完成？
2. 当前阶段验收标准是否通过？
3. 是否有真实业务需求驱动下一阶段？
4. 下一阶段是否会引入新的权限、数据、安全或运维风险？
5. 是否已有足够评测用例证明质量可控？
6. 是否存在更小的替代方案？
7. 当前阶段如果失败，是否有可接受的回滚或替代场景？
8. 是否可以只用少量资源做下一阶段低风险探索，而不引入正式平台承诺？
9. 本阶段是否已有回滚计划和实验退出机制？
```

评估结论只能是：

```text
进入下一阶段
继续补齐当前阶段
只做下一阶段的局部能力
低风险探索下一阶段能力
回退或切换首个场景
暂缓
```

阶段推进采用“核心能力完成 + 风险可控”的准入原则：

- 主路径仍要求当前阶段关键验收通过后再正式进入下一阶段。
- 允许投入少量资源并行探索下一阶段的只读、无写入、低敏感能力。
- 探索能力必须可关闭、可回滚、可审计，并且不得对普通用户承诺正式可用。
- 探索能力一旦产生稳定需求，必须补齐 capability、schema、policy、eval、权限和审计后才能转正。
- 每个阶段都要记录可逆性评估，包括失败后保留什么、丢弃什么、切换到哪个替代场景。
- 每个阶段启动前必须写回滚计划，至少包含触发条件、关闭步骤、数据处理、用户通知、保留资产和替代方案。
- 实验能力必须设置有效期，默认最长 60 天；延期必须重新评审。

## 13. 当前建议

当前项目应停留在：

```text
Phase 0：最小 AI 底座
```

并尽快进入：

```text
Phase 1：公式/计算字段首个场景验证
```

Phase 1 执行时应采用风险分层：

- 先做公式解释、校验和修复建议。
- 再做公式草稿生成，进入编辑区前必须确认用户意图。
- 保存始终由用户确认，并通过后端校验。
- 并行保留一个只读对照场景，用于验证底座不是公式专用。

暂不建议提前开发：

- Phase 4 面向普通员工的正式 RAG。
- Phase 5 正式工作流编排。
- Phase 6 正式飞书机器人或外部 Gateway。
- Phase 7 微调。

可以作为受限实验提前评估：

- 管理员可用的白名单文档 RAG，用于整理制度和发现口径冲突。
- 只读、单轮、个人会话的飞书实验入口。
- 低风险只读的 `ai.experiment` / `sandbox.chat` 能力。

但这些阶段必须保留在路线图里，作为后续评估和升级依据。
