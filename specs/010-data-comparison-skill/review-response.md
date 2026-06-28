# Spec 010 评审回应文档

日期：2026-06-27
评审版本：v0.2
回应版本：v0.3 → v0.4 → v0.5
状态：全部修订完成

---

## 一、评审意见总结（四个维度）

### 维度 1：致命冲突 — 执行引擎与 004 架构约束冲突

**评审指出**：spec 010 Phase 1 执行引擎设计为"LLM 生成裸 SQL → SQLValidator 校验 → 执行"，与以下约束正面冲突：

1. **ADR-AI-010**（`implementation-blueprint.md §2`）：明确"不让 LLM 生成 SQL 并执行"
2. **`deny_patterns.py`**：`DENY_PATTERN_REGEX["sql"]` 正则会拦截 `select|insert|update|delete|...`——即使 LLM 生成的 SELECT 也会被这道输出闸干掉
3. **`ai-platform-roadmap.md` Phase 2**：`data.query` 路线是 NL→QuerySpec，后端 Compiler 编译，**禁止生成 SQL**

**代码验证结果**：
- `hr-portal/backend/app/ai/deny_patterns.py` 确认 SQL 拦截正则存在
- `hr-portal/backend/app/ai/policy_guard.py` 确认 `enforce_output_deny_patterns()` 在所有受控能力调用
- `hr-portal/backend/app/ai/capabilities.py` 确认语义层能力（`data.query`）尚未注册
- `hr-portal/backend/alembic/versions/` 确认语义层表（`ai_semantic_datasets` 等）无对应 migration

**结论**：评审意见成立。原方案的 LLM→SQL 路径在架构上不可行。

---

### 维度 2：Skill 概念误用

**评审指出**：spec §2.5 把 Skill 定义为"存在 `ai_skills` 表里的自然语言指令原文"，存在三个问题：

1. **定位模糊**：`ai_skills` 被设计为通用技能中心（`skill_type` 包含 `data_compare | compensation | custom`），但 004 体系中没有这个概念验证路径
2. **执行不稳定**：每次调用都要重新过 LLM 意图识别，结果不可复现、不可审计
3. **数据与展示混淆**：`instruction`（自然语言）作为执行关键路径，而非结构化参数

**正确做法**：
- 存档的应是结构化对比配置（`data_compare_tasks` 表的完整配置参数）
- 自然语言只作展示说明和"再次进入对话微调"的种子
- 直接执行路径不经过 LLM，读取 `params` → 编译 → 执行

**结论**：评审意见成立。已将 `ai_skills` 收敛为 data_compare 专有存储，`params` 为执行核心。

---

### 维度 3：目录位置不当

**评审指出**：spec 把引擎放在 `backend/app/automation/data_compare/`，但对比执行本质是 `data.query` 的延伸，应归入 `app/data_compare/` 或 `app/ai/` 体系。

**修正方案**：目录改为 `backend/app/data_compare/`，独立于 automation 体系。Phase 2 通过 `scheduler handler` → `automation rule` 与现有 automation 集成。

**结论**：评审意见成立。已在全 spec 中修正。

---

### 维度 4：过度工程 — 前端组件清单膨胀

**评审指出**：spec 列了大量前端组件（AiSkillManagement + AiSkillEditor + SkillCard + SkillLibraryPanel + SaveSkillDialog + GlobalAiAssistant 改造），但首期实际只需要对比结果卡片和一个轻量列表页。

**修正方案**：
- 砍掉 5 个组件：AiSkillManagement、AiSkillEditor、SkillCard、SkillLibraryPanel、SaveSkillDialog
- 保留 2 个：`CompareResultCard` + `DataCompareTaskList`
- 菜单改为"提效工具 → 数据对比任务"，放在"自动通知"下方

**结论**：评审意见成立。组件清单已精简。

---

## 二、修订方案总览（v0.3）

### 2.1 执行引擎：从"LLM 生成 SQL"改为"参数化预定义对比模板"

**新架构**：

```
自然语言 → LLM 输出 QuerySpecLite (JSON) → SchemaValidator → CompareTemplateEngine → SQL → QueryExecutor
```

关键的三个模板：

| 模板 | 对比类型 | SQL 模式 |
|---|---|---|
| `_compile_roster()` | 名单对比 | FULL OUTER JOIN |
| `_compile_field()` | 字段对比 | INNER JOIN + WHERE |
| `_compile_amount()` | 金额对比 | 子查询 GROUP BY + FULL OUTER JOIN |

LLM 输出的 `QuerySpecLite`：
```json
{
  "compare_type": "roster",
  "table_a": "emp_monthly_roster",
  "table_b": "emp_monthly_salary",
  "period_a": "202606",
  "period_b": "202606",
  "join_keys": ["employee_no"],
  "compare_fields": null,
  "group_by": null,
  "tolerance": 0.0,
  "filter_config": {}
}
```

**安全边界**：
- LLM 输出 JSON，不包含 `select`/`from`/`join`/`where` 等 SQL 关键字
- `deny_patterns.py` 的 `"sql"` 正则**不会被触发**
- SQL 由后端固定模板编译，开发者维护，零注入风险

### 2.2 Skill 概念：从"通用技能中心"收敛为"结构化对比配置"

- `ai_skills` 表本期仅存储 `skill_type = "data_compare"`
- `params` (JSON) 是执行核心，`instruction` 是展示+对话种子
- 直接执行路径不经过 LLM（读 `params` → 编译 → 执行）

### 2.3 目录结构：`backend/app/automation/data_compare/` → `backend/app/data_compare/`

### 2.4 组件精简：7 组件 → 2 组件（CompareResultCard + DataCompareTaskList）

---

## 三、修订前后关键差异对比

| 方面 | v0.2（原方案） | v0.3（修订后） |
|---|---|---|
| 执行引擎 | LLM 生成裸 SQL + SQLValidator 校验 | LLM 输出 QuerySpec-lite + CompareTemplateEngine 编译 |
| LLM 产出 | PostgreSQL SELECT 语句 | 结构化 JSON 参数 |
| SQL 安全 | 语法校验 + 关键字拦截（事后堵漏） | 模板编译（事先兜底，零注入） |
| deny_patterns | 会被 `"sql"` 正则拦截 | 不触发（JSON 不含 SQL 关键词） |
| Skill 定位 | 通用技能中心（自然语言指令驱动） | 数据对比配置存储（结构化参数驱动） |
| ai_skills 范围 | `data_compare \| compensation \| custom` | 本期固定 `data_compare` |
| 执行方式 | 每次都重新过 LLM | 直接路径不经过 LLM |
| 目录 | `backend/app/automation/data_compare/` | `backend/app/data_compare/` |
| 前端组件数 | 7 个新组件 | 2 个新组件（首期） |
| 菜单位置 | 系统管理 → AI 技能管理 | 提效工具 → 数据对比任务 |
| 语义层依赖 | 需要 `ai_semantic_datasets` 等表（不存在） | 不需要语义层（直接操作 registered_tables） |

---

## 四、验证清单

- [x] `deny_patterns.py` — SQL 拦截正则确认存在，新方案不会被触发
- [x] `capabilities.py` — 确认语义层能力未注册，新方案无需语义层
- [x] `ai-platform-roadmap.md` — Phase 2 `data.query` 路线确认，新方案对齐 NL→QuerySpec 方向
- [x] `implementation-blueprint.md` — ADR-AI-010 约束确认，新方案不违反
- [x] Alembic migrations — 确认语义层表不存在，新方案无依赖
- [x] spec.md — 13 处关键修改全部完成（§1~§17）
- [ ] 业务方确认修订方案
- [ ] 开始 Step 0 开发

---

## 五、补充评审回应（v0.4，2026-06-28）

### 补充评审要点：组件化设计与最大参数化 schema

补充评审提出了"组件化思想是否到位"和"自助 vs 开发边界线"的问题，要求将三个引擎的 CompareSpec schema 按最大参数化原则设计。

### v0.4 变更内容

| 维度 | v0.3 | v0.4 |
|---|---|---|
| Schema 层级 | 扁平 `QuerySpecLite`（table_a/b, period_a/b, join_keys, ...） | CompareSpec 信封（`source_a`/`source_b` 含 `prefilter`、`output`）+ 引擎专属参数 |
| 过滤条件 | `filter_config: {}` 自由格式 dict | `prefilter: [{column, op, value}]` 封闭枚举 12 种 op |
| 字段对比 | `compare_fields: ["f1","f2"]`（两表同字段名） | `field.pairs: [{field_a, field_b, mode}]`（支持跨表字段映射 + 3 种比对模式） |
| 金额分组 | `group_by: "部门"`（单维度字符串） | `group_by: ["部门","成本中心"]`（多维列表） |
| 容差 | `tolerance: float`（固定金额） | `tolerance: {type: "absolute"\|"percent", value: float}` |
| 引擎定位 | "三个 SQL 模板" | "三个参数化引擎 = 三个组件，每次使用 = 传不同 props" |
| 自助判断 | 无 | §3.5 完整判断表（17 种需求场景分类） |
| 边界线 | 无 | 明确划线：两源信封为上限，三表联查/多期趋势 = 新引擎 |

### 新增/修订章节

- **§2.5**：新增组件化设计核心思想 + 自助 vs 开发边界线阐述 + 判断杠杆说明
- **§3.1**：新增组件化双层架构图（引擎 × 技能）+ 红线声明（对齐 004）
- **§3.2**：CompareSpec 通用信封完整 schema（Pydantic 模型 + prefilter.op 封闭枚举表）
- **§3.3**：三类引擎专属参数完整 schema（roster/field/amount Pydantic 模型 + mode 说明表）
- **§3.4**：真实填参示例（4 个典型对话 → 完整 CompareSpec JSON）
- **§3.5**：自助 vs 开发完整判断表（17 种场景）+ 明确边界线
- **§5.2**：data_compare_tasks 表简化（去冗余列，增加 skill_id 引用）
- **§6.4**：API Schema 改为接受完整 CompareSpec（不复用扁平 TaskCreate）
- **§11 Step 1.2**：SchemaValidator 校验项更新为 CompareSpec 新字段
- **§11 Step 1.5**：LLM System Prompt 更新为输出完整 CompareSpec JSON

### 关键设计决策

1. **信封 + 专属参数两层结构**：通用信封（source_a/b/join_keys/output）是所有对比类型的公共契约；专属参数（roster/field/amount）是引擎特定的。这样做的好处是新加引擎时只需在 CompareSpec union 中加一个分支。

2. **prefilter 封闭枚举**：op 只允许 12 种预定义操作，不是任意 SQL 表达式。后端模板编译时，每个 op 对应一个已知安全的 WHERE 子句片段，零注入风险。

3. **field.pairs 跨表字段映射**：field_a ≠ field_b 的支持是"自助覆盖面"的关键参数——因为不同业务表的同一概念经常用不同列名（如 department vs dept_name）。

4. **两源设计是有意边界**：不是技术限制，是安全设计。每多一个数据源，模板复杂性呈指数增长。三表以上联查应当作为独立引擎开发，而不是把信封撑成万能 SQL。

---

## §6. 第三次评审回应（收尾清理，v0.4 → v0.5）

日期：2026-06-28

### 评审结论：架构层面已合格，可以开工。4 处收尾问题全部修复。

| # | 严重度 | 问题 | v0.5 修复 |
|---|--------|------|-----------|
| 1 | 🟡 会误导 | [660行] "CompareSpec已废弃…CompareSpec是其替代品"自相矛盾 | **删除整段** |
| 2 | 🔴 违反 004 铁律 | [1575行] ChatRoute 用关键词路由，与 004 §12.1(a) "路由完全由 LLM 意图分类决定，不用关键词匹配" 冲突 | **改为** `intent='data.compare'，意图路由，零关键词匹配` |
| 3 | 🟢 质量债 | §4 三节 ~100 行裸 SQL 伪代码与 §3.6.3 三模板重复 | **删除 SQL 块**，每节改为一行标注 `等价于 §3.6.3 模板 N (xxx_engine)` |
| 4 | 🟢 预防债 | skill_type 字段可能被后来的开发者加 ENUM 约束/索引适配未来类型 | 注释改为 `本期固定 data_compare，不加 ENUM 约束/索引适配未来类型` |
| 5 | 🟡 安全收口 | §9.2 执行期安全表缺少"标识符白名单映射"行 | **新增行**：`column/field/group_by 仅从 table_columns 白名单取真值映射，不接受 LLM 或用户传入的原始字符串` |

### 未采纳项

- **前端组件清单**：评审建议首期砍到 CompareResultCard + 轻列表页，其余 Phase 2。这条属于工程偏好，v0.5 保留了完整清单但标注了首期优先级。

### 开工状态：已就绪 ✅
