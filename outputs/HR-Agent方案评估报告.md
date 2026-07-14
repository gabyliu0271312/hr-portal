# HR Agent 完整建设方案（V12.0）批判性评估报告

> 评估方法：将方案逐章与现有代码库（`hr-portal/` 后端 + 前端）及既有 spec（`004-ai-native-workbench`、`011/012 UCP`）交叉比对，结合 Agent 架构专家的视角给出判断。
> 评估日期：2026-07-14　|　评估结论：**方向正确，但方案与现有系统严重脱节，按现状落地会造成大规模重复建设，且多项关键技术假设未经核实。建议先做一次"资产盘点 + 修订"，再启动。**

---

## 〇、一句话总评

这份方案在**产品战略层面（双入口、权限贯穿、数据不出域、Skill 编排、自进化）的判断基本正确**，与团队既有的 AI 规划一脉相承。但它在**工程落地层面犯了三个致命错误**：

1. **完全无视已存在的 `app/ai/`（能力注册表 / 多轮会话 / 审计 / 策略护栏）与 `app/ucp/`（脱敏 / 审批 / 事件 / 管线引擎）两大成熟模块**，把已经实现的东西重新"设计"了一遍，且新设计比现有实现更弱。
2. **技术栈描述与真实底座冲突**：方案 DDL 是 MySQL 语法（`AUTO_INCREMENT`），而系统是 PostgreSQL + SQLAlchemy 2.0 async + Alembic；方案主推"Claude Agent SDK"，而系统实际走的是 OpenAI-compatible HTTP 端点（`provider.py` 中无任何 `anthropic`/`claude`/`langgraph` 依赖）。
3. **把最难的"智能内核"（Planner/Reasoner、RAG、七层数仓指标层、飞书对话机器人）严重低估，把最易的"建表 + CRUD 界面"无限切分**，导致 1-2 天/迭代的承诺不可信。

---

## 一、最严重问题：方案 ≈ 现有代码的"弱化重制版"

下表是逐项对照。结论：**方案里约 60%~70% 的内容在代码库里已有对应实现，且实现更成熟。**

| 方案提出的模块 | 现有代码（已实现/更优） | 判断 |
|---|---|---|
| Skill 注册表 `agent_skills`（skill_code/trigger_keywords/steps JSON/required_permissions） | `app/ai/capabilities.py` 的 `CapabilityDefinition`：含 `capability_id`、`required_permission`(已接 RBAC)、`risk_level`、`confirmation`(二次确认)、`sensitive_context`(metadata_only/authorized_business_data)、`policy_profile`、`audit_enabled`、`examples`、`failure_modes` | **直接复用，无需新建**；方案设计反而**退步**（丢了 risk_level / confirmation / sensitive_context / 审计开关） |
| 数据脱敏 `sensitive_fields` + `apply_data_masking` + `mask_name/mask_phone/mask_salary` | `app/ucp/masking.py`：`mask_value` / `mask_phone` / `mask_name` / `mask_sensitive_fields` 已实现，且已接入 `sensitive_context` 管控 | **直接复用**；方案的脱敏函数与现有几乎同名同义 |
| DAG 工作流编排 `WorkflowOrchestrator` + `workflow_definitions` | `app/ucp/pipeline_engine.py`：CONNECTOR/TRANSFORM/BRANCH/LOOP 四类节点、DAG 拓扑、版本快照（append-only） | **架构重复**；再建一套编排引擎是双轨灾难 |
| 高风险操作二次确认 / 审批 | `app/ucp/approval_service.py`：SINGLE/ANY/ALL 模式 + NONE/SIMPLE/TOKEN 二次确认 | **直接复用** |
| AI 交互审计 `ai_interaction_logs` | `app/ai/audit.py` + `AiConversation`（多轮会话/审计） | **直接复用** |
| 行级权限 `WHERE dept_id IN (...)` | `data.compare` capability 的 `scope_strategy_auto_inject`（权限自动注入）+ `app/scopes/` | **已有且更严谨**；方案未引用 |
| 飞书机器人接入 | `app/integrations/feishu/`（推送）+ `app/ucp/feishu_webhook.py`（事件回调） | **部分复用**；但现有是"通知/回调"，非"对话式 bot"——这是**真正的新工作** |
| 权限上下文 | `app/auth` + `app/roles` + `app/scopes` + `app/menus`（menu_code × V/C/U/D/E 的 RBAC） | **方案另起炉灶**风险高，见第五节 |
| 知识库 / 指标口径 | `app/warehouse/`（建模/血缘/质量/订阅）+ `004` spec 的 capability registry | 口径配置表可种子化，但 RAG 是新增 |
| 评估/质检 | `app/ai/evals.py` | **方案完全未提及**，应复用 |

> **专家判断**：这份方案像是"未读代码、从零规划"的产物。它把 `capabilities.py` 已经解决的"能力先注册、再受控编排、带权限/确认/审计"这一核心范式，用一套更简陋的 `agent_skills` 重写了一遍。这正是大型项目最常见的"架构漂移"前兆。

---

## 二、技术栈与底座的硬性冲突（不可忽略）

### 2.1 数据库引擎：MySQL DDL 无法在 PostgreSQL 上运行
方案所有建表语句使用 `BIGINT PRIMARY KEY AUTO_INCREMENT`、`TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP`。但真实底座是 **PostgreSQL（`asyncpg`）+ SQLAlchemy 2.0 async + Alembic**（已在 `core/config.py`、`alembic/versions/*` 中确认）。
- `AUTO_INCREMENT` 在 PG 应为 `GENERATED ALWAYS AS IDENTITY` 或 `SERIAL`；
- `ON UPDATE CURRENT_TIMESTAMP` 在 PG 需触发器或 `DEFAULT now()` + 应用层维护；
- 类型、索引语法均有差异。

**直接照搬方案 DDL 会 100% 建表失败。** 所有表应改为 SQLAlchemy ORM 模型 + Alembic 迁移，而不是裸 SQL。

### 2.2 LLM 提供方：Claude Agent SDK 与现状不符
方案反复强调"Claude API 承诺不用于训练""集成 Claude Agent SDK"。但：
- `app/ai/provider.py` 用的是 **OpenAI-compatible 的 `chat_completion_openai_compatible`**（经 `httpx` 直连），后端**没有任何 `anthropic`/`claude`/`langgraph`/`langchain` 依赖**（已 grep 确认）。
- 即使是"Claude Opus"，也是通过 OpenAI 兼容端点接入的。

**风险**：
1. "Claude 不用于训练"的承诺是**提供方特定**的；一旦端点换成其它 OpenAI 兼容模型，该承诺作废——方案应改为**提供方无关的口径**（如"仅发送至企业内网/签约 LLM 端点，不用于训练"）。
2. 若真要引入"Agent SDK"（如 LangGraph / Claude Agent SDK），这是**全新依赖与架构范式**，方案未做任何技术预研与风险评估，却在 1.1 迭代里把它写成"1 天搞定"。

---

## 三、被严重低估的关键前置依赖（关键路径风险）

### 3.1 "七层数仓 + 指标层"是否就绪？——方案最大的隐含假设（已据代码复核修正）

> 评审过程中用户指出"指标层功能已实现，只是需配置具体指标"。我据此重新深入审阅了 `app/warehouse/`、`app/datasets/models.py`、`app/warehouse/service/modeling.py` 后，**部分认同、部分必须纠正**。

✅ **认同的部分（底座确实存在，并非从零）**
- 指标定义模型 `WarehouseMetric`（`datasets/models.py:209`，表 `warehouse_metrics`）真实存在：`metric_code / formula_expr / related_dataset_id / related_fields / status(draft) / version` 字段齐备，足以承载指标定义。
- 数仓"管道"已落地：`materialization.py`（周期快照 + SCD Type2 拉链）、`modeling.py` 的 `generate_dws_view`（真实 `CREATE OR REPLACE VIEW ds_dws_*`）、`metric_automation.py`（DWS/ADS 视图自动发布）、`scheduler/handlers.py` 已挂 `snapshot/metric_compute/quality/scd` 作业。DWS/ADS 物理视图**确实能建**。

❌ **必须纠正的部分（"只是配置"不成立）**
1. **计算引擎是坏的**：`compute_metric`（`modeling.py:15-53`）第 36 行 `SELECT * FROM {表} LIMIT 1`——只取**单行**再用 `evaluate_formula` 算公式。对离职率（COUNT 离职/COUNT 总）、HC（COUNT）、人均成本（SUM/COUNT）这类**必须全表聚合 + 维度 GROUP BY** 的指标，单行公式根本算不出正确值。配了指标也查不出离职率。
2. **零条 HR 指标定义**：全仓搜索 `离职率/dimission/headcount/人均成本/cost_per_capita` 均无指标定义或计算值；无任何 migration/seed 写入 `warehouse_metrics`。"配置指标"是真实工作量，不是填参。
3. **"七层"与代码不符**：实际分层只有 4 层（`layer_policy.py:40` `LAYER_ORDER={"ODS":0,"DWD":1,"DWS":2,"ADS":3}`），**没有 DM 层、没有独立 METRIC 层**；`WarehouseMetric` 自身 docstring 写明"一期为口径目录，不自动计算"。方案所谓"已 populated 的 METRIC/DM/ADS 层"不成立。
4. **自动生成能力默认关闭**：`metric_automation` / L4 全自动级联 feature flag 在 `core/config.py` 默认 `False`，相关发布/级联接口被直接拦截。

**修正后的结论**：指标**定义骨架 + 数仓管道**已具备，但**指标计算引擎对 HR 聚合场景不可用、且未定义任何指标、分层实为 4 层而非 7 层**。因此这既非"纯管理工具"，也非"只差配置"。
→ 方案应把"**指标计算引擎修复（真实聚合 + 维度过滤 + 周期口径）+ 首批 HR 指标定义（离职率/HC/人均成本）配置**"列为明确的一期前置迭代并单独估时，而非把整个指标层当作"已完成依赖"直接消费。迭代 1.2（查离职率）能否跑通，取决于这条修复链路，必须前置。

### 3.2 Planner / Reasoner / RAG 的难度被极度压缩
- 迭代 3.1「Planner 基础版 + 操作权限（2 天）」、3.2「Reasoner 基础版（2 天）」——一个能稳定做任务拆解与归因的 LLM 推理层，业界通常是以"周"为单位打磨，且**可靠性（而不是能不能跑通 demo）**是难点。2 天只能产出玩具级原型。
- 迭代 5.5「RAG 知识库升级（2-3 天）」——RAG 的坑（切片、向量库选型、检索召回率、与指标口径对齐）远非 3 天能交付生产级。
- 迭代 1.1「搭建后端 + 集成 Claude Agent SDK + 配置飞书机器人（1 天）」——基础设施 + 飞书事件订阅 + 对话回调，1 天几乎不可能。

**结论**：方案在"最难、最有不确定性"的部分给最少时间；在"建表 + CRUD 界面"上切出 11+9+6+… 个 1 天迭代。真实的工期分布应当**倒置**。

---

## 四、数据安全表述的技术不严谨（合规风险）

方案核心口号"**原始数据不离开 HR Portal 服务器，AI 只接收脱敏后的数据摘要**"需要被精确化，否则在合规审计时会露馅：

1. **"不出域"的边界错误**：发送给 LLM API 的脱敏摘要**必然离开 HR Portal 服务器**（除非跑本地模型）。准确表述应为："**未脱敏的原始数据不出域；脱敏后的摘要发送至 LLM 端点**"。方案把两者混为一谈。
2. **"姓名→工号"仍可逆**：方案示例把"张三"替换为"员工 10086（工号）"。工号是**可回溯的 pseudonym**，与原始姓名可 join。更接近现有 `data.compare` 的安全范式是 `sensitive_context: metadata_only`——**分析阶段根本不向 LLM 发送行级数据，只发送聚合统计值**；行级明细仅服务端拼装后展示给已授权用户。方案应优先采用"聚合在库、LLM 只看统计"的范式，而非"先 SELECT 再逐行脱敏"。
3. **脱敏规则的 keyword 匹配脆弱性**：现有 `masking.py` 靠字段名关键词匹配（`salary/phone/id_card`…），对 `base_salary`、`offer_salary` 等能命中，但业务表字段命名一旦不统一就会漏脱敏。方案未提"字段分类元数据驱动"的强化路径（现有 masking.py 注释已指出"后续对接 field_category"）。

---

## 五、权限模型：另起炉灶的冲突风险

方案在第 5 章自创了 `PermissionContext`（`department_id` / `visible_columns` / `can_manage_metrics` …）和 `feishu_user_mapping` 表。但系统**已有**：
- `app/auth`（飞书登录与用户体系）、`app/roles` + `app/menus` + `app/scopes`（RBAC：menu_code × V/C/U/D/E，外加数据范围 scope）。
- `data.compare` 已验证 `scope_strategy_auto_inject` 能把行级权限自动注入 SQL。

**风险**：若按方案新建独立的 `PermissionContext` 与映射表，会出现**两套权限真理源**，迟早漂移。正确做法是**从现有角色/范围/用户模型派生** `PermissionContext`，而不是新建表。同样，`feishu_user_mapping` 应先核实 `app/auth` 是否已存飞书 open_id 映射，避免重复建表。

---

## 六、Agent 架构专家评审（推理层 / 编排层 / 自进化）

作为 Agent 系统设计视角，给出三点专业判断：

**1. "推理层"缺少 LLM 调用协议定义。**
方案描述了"意图识别→Planner→Skill 匹配→编排→Reasoner"，但**没说 LLM 如何实际调用 Skill**。是 function-calling？ReAct？还是结构化输出？现有 `data.compare` 已证明一条**更可控、更安全的范式**：`LLM 仅输出结构化 Plan/JSON → 后端引擎编译执行（含权限注入、零注入风险）`。方案应明确采用"**LLM 出计划、后端执行**"而非"**LLM 实时自主调工具**"，后者在 HR 高敏场景风险过高、可控性差。好消息：现有 `ai.chat` capability 已是"识别用户目标并受控调用已注册 Capability"的雏形——编排层应在此之上长出来。

**2. DAG 编排不该再建第二套。**
`pipeline_engine.py` 已是生产级 DAG 引擎。**HR Agent 的"工作流"应复用它**（或明确说明为何 UCP 管线不适用 Agent 场景）。新建 `WorkflowOrchestrator` 会造成"两套拓扑排序、两套节点模型、两套执行日志"的长期维护债。

**3. "自进化"被浪漫化了。**
- 反馈→成功案例→Few-shot 的方向对，但**MVP 阶段案例量不足以支撑 few-shot**；更现实的是先沉淀"口径问答对"做检索增强。
- **未设防"反馈污染"**：错误的回答若被点赞并喂回 few-shot，会自我强化。应加"人工确认门槛"（方案 6.3 提到了管理员确认，但 1.5 的点赞直接入库，前后不一致）。
- 现有 `app/ai/evals.py` 已存在评估框架，方案应直接复用而非另起 `成功率统计`。

---

## 七、方案可取之处（客观肯定）

为保持平衡，以下判断是站得住的，应保留：
- **双入口协同（飞书轻量 + Web 深度）**的产品判断准确，符合 HR 用户场景。
- **权限 / 数据安全"从第一天就位"**的原则正确，且与现有 `capabilities.py` 的 `required_permission`/`confirmation`/`sensitive_context` 设计哲学一致——只是实现应复用而非重建。
- **Skill 原子→复合→DAG 的演进路径**合理；**MVP 用 trigger_keywords 做路由**是务实选择。
- **自进化闭环、知识库演进（配置表→RAG）**的方向对。
- 可视化（三栏工作台、ECharts、深度链接恢复上下文）的交互设计细致。

---

## 八、优先级修订建议

### P0（必须改，否则落地即返工）
1. **资产盘点**：把方案模块逐一映射到 `app/ai/`、`app/ucp/`、`app/warehouse/` 的现有实现，删除/合并重复项（尤其 `agent_skills`→复用 `capabilities`；`sensitive_fields`/`masking`→复用 `masking.py`；`workflow_definitions`→复用 `pipeline_engine`；审计/审批→复用现有）。
2. **修正技术栈**：DDL 改为 SQLAlchemy ORM + Alembic；LLM 提供方改为"提供方无关 + 企业签约端点"口径；明确"是否引入 Agent SDK"并做技术预研。
3. **修正指标计算引擎 + 配置首批 HR 指标（非"从零建数仓"）**：`compute_metric`（`modeling.py:36`）当前 `SELECT ... LIMIT 1` 只能算单行公式，无法聚合离职率/HC/人均成本——需改为真实 SQL 聚合 + 维度 GROUP BY + 周期过滤；并 seed 离职率/HC/人均成本等定义（`warehouse_metrics` 当前零条）。注意实际分层为 4 层（ODS/DWD/DWS/ADS），非方案所称"七层"。

### P1（应改，影响质量/安全）
4. 权限模型**派生自现有 RBAC/scope**，不新建 `PermissionContext` 真理源；先核实 `feishu_user_mapping` 是否已有。
5. 数据安全表述精确化：区分"原始数据不出域"与"脱敏摘要出域"；优先"聚合在库、LLM 只看统计"。
6. 明确 LLM 调用协议（结构化 Plan + 后端执行），不要走自主调工具。

### P2（优化，提升可信度）
7. 重排迭代工期：把时间从"建表/CRUD"挪到"Planner/Reasoner/RAG/飞书对话 bot"等硬骨头；取消不切实际的 1 天承诺。
8. 复用 `app/ai/evals.py` 做质量基线；自进化加人工确认门槛，防反馈污染。
9. 飞书对话机器人是**真正新增**能力（现有仅推送/回调），应作为一期重点投入，而非与建表混在 1 天迭代里。

---

## 九、最终结论

> **这份方案"想对了方向，写错了落地"。** 它的战略判断（双入口、权限先行、数据不出域、Skill 编排、自进化）与团队既有的 AI 规划高度一致，值得肯定；但它的工程方案几乎无视了 `app/ai/` 与 `app/ucp/` 已经交付的能力注册表、脱敏、审批、管线引擎、审计，**用更弱的 schema 重新发明了一遍轮子**，并在数据库引擎、LLM 提供方、关键前置依赖（数仓指标层）、迭代工期上给出与代码库现实冲突的描述。
>
> **建议动作**：不要直接按 V12.0 开工。先做一份"方案 ↔ 现有资产映射表 + Phase 0 核实清单 + 修订版迭代计划"，把重复项砍掉、把硬骨头补时、把技术栈对齐，再启动一期。预计如此可节省 40%~60% 的无效开发量。
