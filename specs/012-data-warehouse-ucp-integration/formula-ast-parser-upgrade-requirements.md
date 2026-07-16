# Excel 公式 → SQL AST 解析器升级需求文档

> 所属 Spec：012 Data Warehouse × UCP Integration  
> 创建日期：2026-07-16  
> 适用范围：指标公式编辑、指标新建/编辑、DWS 聚合定义生成、AI 公式助手、公式校验、公式转 SQL、公式解释与审计  
> 文档目标：将当前“字符串/正则式 Excel 公式转 SQL”升级为“确定性 AST 解析器 + SQL 生成器 + AI 辅助”的可验收方案，并按原子化原则拆分开发任务，确保任意 AI 或开发者按本文均可稳定交付。

---

## 1. 背景与问题

当前指标新建/编辑中的公式转换链路为：

```text
用户输入 Excel 风格公式
  → 字段引用替换
  → 字符串/正则扫描翻译函数
  → 自动 NULLIF 除零保护
  → 生成 formula_sql
```

该方案在简单公式中可用，但在复杂 Excel 公式中存在稳定性风险：

1. **函数翻译不完整**：例如 `COUNTIF(a,"x")/COUNTIF(a,"*")` 曾出现右侧 `COUNTIF` 未翻译。
2. **嵌套结构脆弱**：`ROUND(COUNTIF(...)/COUNTIF(...),4)`、`IFERROR(A/B,0)` 等难以用正则稳定处理。
3. **Excel 条件语义不完整**：`"*"`、`"?"`、`">0"`、`"<>正式员工"`、`">=2026-01-01"` 等需要明确语义。
4. **除法保护位置容易错误**：分母可能是 `COUNT(*) FILTER (...)`、括号表达式、函数表达式，字符串截断容易产生非法 SQL。
5. **AI 不能直接作为最终 SQL 生成器**：指标计算需可审计、可复现、安全可控，AI 只能辅助，不应绕过确定性编译。

因此需要升级为 AST 解析器。

---

## 2. 总体目标

建设一套确定性的 Excel 公式编译链路：

```text
Excel 公式
  → Lexer 词法分析
  → Parser 语法分析
  → AST 抽象语法树
  → Semantic Analyzer 语义分析
  → SQL Generator SQL 生成
  → Safety Validator 安全校验
  → Preview Runner 样本预览
  → formula_sql 入库
```

AI 的定位：

```text
AI = 公式生成、公式解释、错误修复建议、口径歧义提示
确定性 AST 编译器 = 最终 SQL 生成、安全边界、可审计计算
```

---

## 3. 非目标

本期不做以下事项：

1. 不支持完整 Excel 计算引擎。
2. 不支持用户输入任意 SQL。
3. 不允许 AI 生成 SQL 后直接入库执行。
4. 不实现跨数据集任意 Join 推理。
5. 不实现所有 Excel 函数，只支持白名单函数。
6. 不替换现有 AI 公式助手，只改造其后端校验/编译链路。
7. 不改变已发布指标的历史计算结果，除非用户主动重新保存或迁移。

---

## 4. 核心设计原则

### 4.1 确定性优先

同一个公式、同一个字段映射、同一个编译器版本，必须生成相同 SQL。

### 4.2 白名单函数

只允许显式支持的函数进入 AST 编译。

未知函数必须返回明确错误：

```json
{
  "code": "unsupported_function",
  "message": "暂不支持函数 IFERROR",
  "function": "IFERROR"
}
```

### 4.3 AI 不越权

AI 可以生成公式，但必须经过：

```text
公式标准化 → AST 编译 → 安全校验 → 预览
```

才能保存为指标。

### 4.4 错误可解释

所有错误必须包含：

- 错误 code
- 用户可读 message
- 位置 start/end
- 原始片段 token/formula_fragment
- 建议修复 suggestion

### 4.5 兼容现有公式

已有 `formula_expr` / `formula_sql` 不强制迁移。  
新建和编辑指标默认使用 AST 编译器。  
可保留 legacy 编译器作为灰度回退。

---

## 5. 架构方案

### 5.1 新增模块建议

```text
hr-portal/backend/app/ai_formula/ast/
  __init__.py
  tokens.py              # Token 定义
  lexer.py               # 词法分析
  nodes.py               # AST 节点定义
  parser.py              # 语法分析
  semantics.py           # 语义分析、字段解析、函数签名校验
  sql_generator.py       # SQL 生成
  excel_criteria.py      # COUNTIF/SUMIF 条件语义
  safety.py              # SQL 安全校验
  compiler.py            # 对外统一 compile_formula()
  errors.py              # 编译错误模型
```

### 5.2 对外统一接口

新增：

```python
async def compile_formula_to_sql(
    db: AsyncSession,
    formula: str,
    dataset_id: int,
    *,
    mode: str = "metric",
    options: FormulaCompileOptions | None = None,
) -> FormulaCompileResult:
    ...
```

返回结构：

```json
{
  "valid": true,
  "sql": "COUNT(*) FILTER (...) / NULLIF(COUNT(*), 0)::numeric",
  "normalized_formula": "=COUNTIF(current.员工类型,\"正式员工\")/COUNTIF(current.员工类型,\"*\")",
  "has_aggregate": true,
  "ast": {},
  "dependencies": ["employee_type"],
  "functions": ["COUNTIF"],
  "warnings": [],
  "errors": [],
  "compiler": {
    "engine": "ast",
    "version": "1.0.0"
  }
}
```

兼容现有接口：

```python
translate_formula_to_sql(...)
```

应改为调用 AST 编译器；如灰度开启 legacy fallback，则仅在 AST 返回 `unsupported_function` 且配置允许时回退。

---

## 6. 支持语法范围

### 6.1 字面量

必须支持：

```text
123
123.45
"正式员工"
'正式员工'
TRUE
FALSE
NULL
```

### 6.2 字段引用

必须支持：

```text
员工类型
current.员工类型
employee_type
current.employee_type
FIELD("employee_type")
```

字段引用必须通过数据集输出字段映射解析为：

```sql
"current"."employee_type"
```

未映射字段必须报错：

```json
{
  "code": "unknown_field",
  "message": "字段不存在或未暴露：员工类型",
  "field": "员工类型"
}
```

### 6.3 运算符

必须支持：

```text
+ - * /
= <> != > >= < <=
&
```

说明：

- `/` 分母必须自动 `NULLIF(...,0)::numeric`
- `&` 翻译为 SQL 字符串拼接 `||`
- 比较运算符用于 `IF`、条件表达式和部分函数条件

### 6.4 括号与优先级

必须支持标准优先级：

```text
函数调用 > 括号 > 一元 +/- > * / > + - > 比较 > &
```

示例：

```excel
=(A+B)/C
```

必须解析为：

```text
BinaryOp("/", BinaryOp("+", A, B), C)
```

---

## 7. 首期函数白名单

### 7.1 聚合函数

| Excel 函数 | SQL 语义 |
|---|---|
| COUNT(x) | `COUNT(x)`；`COUNT(*)` 保留 |
| COUNTA(x) | `COUNT(*) FILTER (WHERE x IS NOT NULL AND x::text <> '')` |
| SUM(x) | `SUM(x)` |
| AVERAGE(x) | `AVG(x)` |
| AVG(x) | `AVG(x)` |
| MAX(x) | `MAX(x)` |
| MIN(x) | `MIN(x)` |
| COUNTIF(range, criteria) | `COUNT(*) FILTER (WHERE criteria_sql)` |
| COUNTIFS(r1,c1,r2,c2,...) | `COUNT(*) FILTER (WHERE c1 AND c2...)` |
| SUMIF(range, criteria, sum_range) | `SUM(sum_range) FILTER (WHERE criteria_sql)` |
| SUMIFS(sum_range, r1,c1,...) | `SUM(sum_range) FILTER (WHERE c1 AND ...)` |
| AVERAGEIF(range, criteria, avg_range) | `AVG(avg_range) FILTER (WHERE criteria_sql)` |
| AVERAGEIFS(avg_range, r1,c1,...) | `AVG(avg_range) FILTER (WHERE c1 AND ...)` |

### 7.2 标量函数

| Excel 函数 | SQL 语义 |
|---|---|
| ROUND(x,n) | `ROUND(x, n)` |
| ABS(x) | `ABS(x)` |
| IF(cond,a,b) | `CASE WHEN cond THEN a ELSE b END` |
| IFERROR(x,fallback) | `COALESCE(x, fallback)`，仅当 `x` 为安全表达式 |
| AND(a,b,...) | `(a AND b AND ...)` |
| OR(a,b,...) | `(a OR b OR ...)` |
| NOT(x) | `(NOT x)` |
| ISBLANK(x) | `(x IS NULL OR x::text = '')` |
| YEAR(x) | `EXTRACT(YEAR FROM x)` |
| MONTH(x) | `EXTRACT(MONTH FROM x)` |

---

## 8. Excel criteria 语义

### 8.1 COUNTIF/SUMIF 条件规则

必须支持：

| Excel criteria | SQL 条件 |
|---|---|
| `"正式员工"` | `col = '正式员工'` |
| `"*"` | `col IS NOT NULL AND col::text <> ''` |
| `"正式*"` | `col::text LIKE '正式%' ESCAPE '\'` |
| `"*员工"` | `col::text LIKE '%员工' ESCAPE '\'` |
| `"?式员工"` | `col::text LIKE '_式员工' ESCAPE '\'` |
| `">0"` | `col > 0` |
| `">=100"` | `col >= 100` |
| `"<10"` | `col < 10` |
| `"<>"` | `col IS NOT NULL AND col::text <> ''` |
| `"<>正式员工"` | `col <> '正式员工' OR col IS NULL` |
| `"="` | `col IS NULL OR col::text = ''` |

### 8.2 日期条件

日期条件只在字段类型为 date/timestamp 时启用：

```excel
COUNTIF(current.入职日期,">=2026-01-01")
```

生成：

```sql
"current"."hire_date" >= DATE '2026-01-01'
```

字段类型未知时，返回 warning：

```json
{
  "code": "criteria_type_inferred",
  "message": "条件 >=2026-01-01 已按文本/数值自动推断，请确认字段类型"
}
```

---

## 9. SQL 安全规则

生成 SQL 必须满足：

1. 不允许分号 `;`
2. 不允许 DDL/DML 关键字：
   - `INSERT`
   - `UPDATE`
   - `DELETE`
   - `DROP`
   - `ALTER`
   - `TRUNCATE`
   - `CREATE`
   - `GRANT`
   - `REVOKE`
3. 不允许未授权表名。
4. 不允许子查询，除非后续明确放开。
5. 不允许直接引用未在 dataset output fields 中暴露的字段。
6. 不允许非白名单函数。
7. 不允许原样拼接用户 SQL。

---

## 10. 数据模型变更

### 10.1 本期建议新增字段

可选新增到 `warehouse_metrics`：

```text
formula_compile_engine    varchar(32)   # legacy / ast
formula_compile_version   varchar(32)   # 1.0.0
formula_compile_meta      json          # dependencies/functions/warnings
formula_ast               json          # 可选，便于调试/审计
```

如不希望改表，可先把 meta 放入现有扩展 JSON 字段；但最终建议落库，便于审计。

### 10.2 兼容策略

已有指标：

```text
formula_compile_engine = legacy 或 null
```

新保存指标：

```text
formula_compile_engine = ast
```

---

## 11. API 变更

### 11.1 公式编译预览 API

新增或改造：

```text
POST /warehouse/metrics/compile-formula
```

请求：

```json
{
  "dataset_id": 123,
  "formula_expr": "=COUNTIF(current.员工类型,\"正式员工\")/COUNTIF(current.员工类型,\"*\")",
  "mode": "metric",
  "include_ast": true,
  "preview": true
}
```

响应：

```json
{
  "valid": true,
  "sql": "COUNT(*) FILTER (...) / NULLIF(COUNT(*) FILTER (...), 0)::numeric",
  "normalized_formula": "=COUNTIF(current.员工类型,\"正式员工\")/COUNTIF(current.员工类型,\"*\")",
  "dependencies": [
    {
      "field_code": "employee_type",
      "field_label": "员工类型",
      "source_alias": "current",
      "source_column": "employee_type"
    }
  ],
  "functions": ["COUNTIF"],
  "warnings": [],
  "errors": [],
  "preview_result": {
    "value": 0.82,
    "row_count": 1
  }
}
```

### 11.2 兼容现有翻译 API

现有：

```text
POST /warehouse/metrics/translate-formula
```

应保留，但内部调用 AST 编译器，并在响应中增加：

```json
{
  "compile_engine": "ast",
  "compile_version": "1.0.0"
}
```

---

## 12. AI 融合方案

### 12.1 AI 入口

AI 可用于：

1. 根据自然语言生成公式。
2. 将用户公式改写为平台支持公式。
3. 解释公式含义。
4. 根据 AST 编译错误给出修复建议。
5. 提醒口径歧义。

### 12.2 禁止行为

AI 不允许：

1. 直接生成最终 SQL 并跳过编译器。
2. 直接保存 `formula_sql`。
3. 访问未授权字段。
4. 自行决定字段映射。

### 12.3 推荐交互

当用户输入：

```text
计算正式员工占全部员工比例
```

AI 返回：

```json
{
  "formula_display": "=COUNTIF(current.员工类型,\"正式员工\")/COUNTIF(current.员工类型,\"*\")",
  "explanation": "分子统计正式员工人数，分母统计员工类型非空的全部员工人数。",
  "warnings": [
    "如果全部员工应包含员工类型为空的员工，请将分母改为 COUNT(*)。"
  ]
}
```

然后由 AST 编译器生成 SQL。

---

## 13. 原子化开发任务

### AST0001：新增 AST 编译器目录与错误模型

**交付物**

- 新增 `app/ai_formula/ast/` 目录。
- 新增 `errors.py`。
- 定义 `FormulaCompileError`、`FormulaCompileWarning`、`SourceSpan`。

**验收标准**

- 错误结构包含 `code/message/start/end/fragment/suggestion`。
- 单元测试覆盖错误对象序列化。

**测试**

```text
tests/test_formula_ast_errors.py
```

---

### AST0002：实现 Lexer 词法分析

**交付物**

- `tokens.py`
- `lexer.py`

必须识别：

```text
IDENT, NUMBER, STRING, COMMA, LPAREN, RPAREN,
PLUS, MINUS, STAR, SLASH,
EQ, NE, GT, GE, LT, LE,
DOT, AMP, TRUE, FALSE, NULL, EOF
```

**验收标准**

- 能正确 tokenize 中文字段、英文标识符、`current.员工类型`、字符串、比较符。
- 字符串内逗号不拆分。
- 字符串内括号不影响括号计数。

**测试**

```text
tests/test_formula_ast_lexer.py
```

---

### AST0003：定义 AST 节点

**交付物**

- `nodes.py`

节点至少包括：

```text
LiteralNode
FieldRefNode
FunctionCallNode
BinaryOpNode
UnaryOpNode
ComparisonNode
```

**验收标准**

- 每个节点包含 `span`。
- 每个节点可 `to_dict()`。
- AST 可 JSON 序列化。

**测试**

```text
tests/test_formula_ast_nodes.py
```

---

### AST0004：实现 Parser 基础表达式解析

**交付物**

- `parser.py`

必须支持：

```text
1 + 2 * 3
(1 + 2) / 3
-SUM(x)
A >= 10
current.员工类型
FIELD("employee_type")
```

**验收标准**

- 运算符优先级正确。
- 括号嵌套正确。
- 语法错误返回明确位置。

**测试**

```text
tests/test_formula_ast_parser_basic.py
```

---

### AST0005：实现函数调用解析

**交付物**

- Parser 支持函数参数列表。

必须支持：

```excel
COUNTIF(current.员工类型,"正式员工")
ROUND(COUNTIF(a,"x")/COUNTIF(a,"*"),4)
IF(A>0,"是","否")
```

**验收标准**

- 嵌套函数解析正确。
- 多参数函数解析正确。
- 缺少右括号时返回 `syntax_unclosed_parenthesis`。

**测试**

```text
tests/test_formula_ast_parser_functions.py
```

---

### AST0006：实现字段映射语义分析

**交付物**

- `semantics.py`
- 复用现有 DatasetOutputField 映射。

**验收标准**

- `current.员工类型` 能映射到 `"current"."employee_type"`。
- `员工类型` 能映射到 `"current"."employee_type"`。
- 未知字段返回 `unknown_field`。
- 重名字段返回 `ambiguous_field`，要求用户带 alias。

**测试**

```text
tests/test_formula_ast_semantics_fields.py
```

---

### AST0007：实现函数签名与白名单校验

**交付物**

- 函数注册表。
- 每个函数定义参数数量、参数类型、是否聚合函数。

**验收标准**

- `COUNTIF(a)` 返回参数数量错误。
- `COUNTIF(a,b,c)` 返回参数数量错误。
- `HYPERLINK(...)` 返回 `unsupported_function`。
- 结果输出 `has_aggregate`。

**测试**

```text
tests/test_formula_ast_semantics_functions.py
```

---

### AST0008：实现 Excel criteria 编译

**交付物**

- `excel_criteria.py`

必须覆盖第 8 章所有条件规则。

**验收标准**

- `COUNTIF(x,"*")` → 非空条件。
- `COUNTIF(x,"正式*")` → LIKE。
- `COUNTIF(x,">=100")` → 数值比较。
- `COUNTIF(x,"<>正式员工")` → 不等条件。

**测试**

```text
tests/test_formula_ast_excel_criteria.py
```

---

### AST0009：实现 SQL Generator 基础表达式

**交付物**

- `sql_generator.py`

支持：

```text
字段、字面量、四则运算、比较、AND/OR/NOT、ROUND、ABS
```

**验收标准**

- 字段全部加双引号。
- 字符串单引号转义。
- 不原样透传用户字段名。

**测试**

```text
tests/test_formula_ast_sql_basic.py
```

---

### AST0010：实现聚合函数 SQL 生成

**交付物**

- COUNT/SUM/AVG/MAX/MIN/COUNTIF/COUNTIFS/SUMIF/SUMIFS/AVERAGEIF/AVERAGEIFS SQL 生成。

**验收标准**

- `COUNTIF(current.员工类型,"正式员工")` 生成 `COUNT(*) FILTER (...)`。
- `COUNTIFS(a,"x",b,">0")` 生成 AND 条件。
- `SUMIFS(cost,type,"正式员工",month,">=1")` 参数顺序正确。

**测试**

```text
tests/test_formula_ast_sql_aggregates.py
```

---

### AST0011：实现除法自动 NULLIF 保护

**交付物**

- 在 AST SQL 生成阶段处理 `/`。

规则：

```text
A / B → A / NULLIF(B, 0)::numeric
```

**验收标准**

- 分母是函数时整体包裹。
- 分母是 `COUNT(*) FILTER (...)` 时整体包裹。
- 分母已是 `NULLIF(...)` 时不重复包裹。
- 返回小数而非整数除法。

**测试**

```text
tests/test_formula_ast_sql_division.py
```

---

### AST0012：实现统一 compiler.py

**交付物**

- `compiler.py`
- `compile_formula_to_sql(...)`

**验收标准**

- 统一执行：normalize → lexer → parser → semantics → SQL → safety。
- 成功返回 `FormulaCompileResult`。
- 失败返回结构化 errors，不抛裸异常给 API。

**测试**

```text
tests/test_formula_ast_compiler.py
```

---

### AST0013：接入现有 translate_formula_to_sql

**交付物**

- 改造 `app/ai_formula/formula_to_sql.py`。
- 保留旧函数签名。
- 内部调用 AST 编译器。

**验收标准**

- 现有调用方无需改代码。
- 响应字段保持兼容：`sql/valid/errors/has_aggregate`。
- 新增字段不破坏前端。

**测试**

```text
tests/test_formula_translate_api_compat.py
```

---

### AST0014：新增公式编译预览 API

**交付物**

- `POST /warehouse/metrics/compile-formula`

**验收标准**

- 返回 SQL、依赖字段、函数列表、warnings、errors。
- 可选返回 AST。
- 无权限访问数据集时返回 403。

**测试**

```text
tests/test_formula_compile_api.py
```

---

### AST0015：指标新建/编辑接入 AST 编译器

**交付物**

- 新建指标保存时使用 AST 编译器。
- 编辑指标公式时重新编译。

**验收标准**

- 公式无效时阻断保存。
- 保存成功后写入 `formula_sql`。
- 写入 compile metadata。
- 已有公式编辑器交互不破坏。

**测试**

```text
tests/test_metric_formula_ast_integration.py
```

---

### AST0016：AI 公式助手接入 AST 编译校验

**交付物**

- AI 返回公式后，自动调用 AST 编译器校验。
- 如果失败，将结构化错误转成用户友好解释。

**验收标准**

- AI 不能直接返回 SQL 入库。
- AI 公式校验失败时，返回修复建议。
- AI 公式成功时，返回标准公式和解释。

**测试**

```text
tests/test_ai_formula_ast_guardrail.py
```

---

### AST0017：前端公式预览面板

**交付物**

- 在指标新建/编辑页增加公式编译结果区。

展示：

```text
公式是否有效
识别字段
识别函数
生成 SQL
警告
错误位置
样本预览值
```

**验收标准**

- 错误能定位到公式片段。
- warning 不阻断保存，error 阻断保存。
- SQL 可折叠显示。

**测试**

```text
npm run build
```

---

### AST0018：正式员工比例端到端验收

**交付物**

- 真实后端集成测试。

公式：

```excel
=COUNTIF(current.员工类型,"正式员工")/COUNTIF(current.员工类型,"*")
```

期望 SQL 片段：

```sql
COUNT(*) FILTER (WHERE "current"."employee_type" = '正式员工')
/
NULLIF(COUNT(*) FILTER (WHERE "current"."employee_type" IS NOT NULL AND "current"."employee_type"::text <> ''), 0)::numeric
```

**验收标准**

- 数据：正式员工 8 人，员工类型非空 10 人。
- 结果：`0.8`。
- 不残留 `COUNTIF(`。
- 不发生整数除法。

**测试**

```text
tests/test_formula_ast_e2e_employee_type_ratio.py
```

---

### AST0019：灰度开关与回退策略

**交付物**

- 配置项：

```text
FORMULA_COMPILER_ENGINE=ast|legacy|ast_with_legacy_fallback
```

**验收标准**

- 默认新环境使用 `ast`。
- 如配置 fallback，AST 不支持时可回 legacy，但必须记录 warning。
- fallback 不允许绕过安全校验。

**测试**

```text
tests/test_formula_compiler_rollout.py
```

---

### AST0020：文档与函数支持矩阵

**交付物**

- 用户文档：支持哪些 Excel 函数。
- 开发文档：新增函数如何扩展。
- 测试矩阵：函数 × 条件 × 字段类型。

**验收标准**

- 文档包含正式员工比例示例。
- 文档包含 `COUNTIF("*")` 语义说明。
- 文档包含 AI 与 AST 编译器边界。

---

## 14. 统一验收标准

本需求整体完成必须满足：

1. 新建指标公式编译不再依赖正则式主流程。
2. 所有最终 `formula_sql` 均由 AST 编译器生成。
3. AI 不能绕过 AST 编译器直接保存 SQL。
4. `COUNTIF(a,"x")/COUNTIF(a,"*")` 可稳定生成合法 SQL。
5. 所有 SQL 不残留 Excel 函数名。
6. 分母为 0 返回 null，不抛 PostgreSQL 异常。
7. COUNT/COUNT 返回小数比例。
8. 未知字段、未知函数、语法错误均有结构化错误。
9. 前端能展示公式编译错误和建议。
10. 后端专项测试、warehouse 相关测试、前端构建全部通过。

---

## 15. 推荐测试命令

后端专项：

```powershell
cd D:\AI项目\HR提效工具搭建\hr-portal\backend
python -m pytest tests/test_formula_ast_*.py tests/test_metric_formula_ast_integration.py -q
```

兼容回归：

```powershell
cd D:\AI项目\HR提效工具搭建\hr-portal\backend
python -m pytest tests/test_warehouse_components.py tests/test_warehouse_phase3.py tests/test_warehouse_ai_context.py -q
```

前端构建：

```powershell
cd D:\AI项目\HR提效工具搭建\hr-portal\frontend
npm.cmd run build
```

---

## 16. 交付边界检查清单

每个原子任务提交前必须检查：

- [ ] 是否有明确输入输出？
- [ ] 是否有结构化错误？
- [ ] 是否有单元测试？
- [ ] 是否覆盖中文字段？
- [ ] 是否覆盖引号、括号、逗号？
- [ ] 是否不绕过字段映射？
- [ ] 是否不直接拼接用户 SQL？
- [ ] 是否兼容现有 API？
- [ ] 是否记录 compile engine/version？
- [ ] 是否不影响已发布历史指标？

---

## 17. 示例：正式员工占比

输入：

```excel
=COUNTIF(current.员工类型,"正式员工")/COUNTIF(current.员工类型,"*")
```

AST 摘要：

```json
{
  "type": "BinaryOp",
  "op": "/",
  "left": {
    "type": "FunctionCall",
    "name": "COUNTIF"
  },
  "right": {
    "type": "FunctionCall",
    "name": "COUNTIF"
  }
}
```

输出 SQL：

```sql
COUNT(*) FILTER (
  WHERE "current"."employee_type" = '正式员工'
)
/
NULLIF(
  COUNT(*) FILTER (
    WHERE "current"."employee_type" IS NOT NULL
      AND "current"."employee_type"::text <> ''
  ),
  0
)::numeric
```

业务解释：

```text
分子：员工类型等于“正式员工”的人数。
分母：员工类型非空的员工人数。
比例：分子 / 分母。
如果分母为 0，结果返回 null，避免除零异常。
```

AI 提醒：

```text
如果你的“全部员工”包括员工类型为空的员工，请将分母改为 COUNT(*)。
```

---

## 18. 成功定义

当任意 AI 或开发者按本文档开发时，应能稳定交付：

1. 一套可解析 Excel 常见公式的 AST 编译器。
2. 一套确定性 SQL 生成器。
3. 一套 AI 辅助但不越权的公式工作流。
4. 一套可持续扩展函数的注册机制。
5. 一套覆盖真实 HR 指标场景的测试矩阵。

最终效果：

```text
用户可以继续写 Excel 风格公式；
系统可以稳定、可审计、安全地编译为 SQL；
AI 可以帮助用户写得更好，但不能破坏计算确定性。
```

