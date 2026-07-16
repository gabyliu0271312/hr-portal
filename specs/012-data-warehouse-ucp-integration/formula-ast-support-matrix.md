# 公式 AST 编译器 · 函数支持矩阵与文档

> 所属 Spec：012 Data Warehouse × UCP Integration
> 关联需求：`formula-ast-parser-upgrade-requirements.md`（AST0001–AST0020）
> 适用范围：指标公式编辑 / DWS 聚合定义 / AI 公式助手后端校验 / 公式解释与审计
> 维护说明：新增函数请同步更新 §1 白名单与 §3 测试矩阵。

---

## 0. 一句话结论

- 用户继续写 Excel 风格公式；系统用**确定性 AST 编译器**把它编译成 PostgreSQL SQL。
- AI 只负责生成/改写**公式**，绝不生成最终 SQL 入库。
- 所有入库的 `formula_sql` 都由 AST 编译器生成，可审计、可复现、安全受控。

---

## 1. 用户文档：支持的 Excel 函数白名单

### 1.1 聚合函数

| Excel 函数 | 参数 | 生成 SQL 语义 | 备注 |
|---|---|---|---|
| `COUNT(x)` | 1 | `COUNT(x)` | `COUNT(*)` 原样保留 |
| `COUNTA(x)` | 1 | `COUNT(*) FILTER (WHERE x IS NOT NULL AND x::text <> '')` | 统计非空 |
| `SUM(x)` | 1 | `SUM(x)` | |
| `AVERAGE(x)` / `AVG(x)` | 1 | `AVG(x)` | 两种写法等价 |
| `MAX(x)` | 1 | `MAX(x)` | |
| `MIN(x)` | 1 | `MIN(x)` | |
| `COUNTIF(range, criteria)` | 2 | `COUNT(*) FILTER (WHERE <criteria_sql>)` | 见 §2 |
| `COUNTIFS(r1,c1,r2,c2,...)` | 偶数 | `COUNT(*) FILTER (WHERE c1 AND c2 ...)` | 多条件 AND |
| `SUMIF(range, criteria, sum_range)` | 3 | `SUM(sum_range) FILTER (WHERE <criteria_sql>)` | |
| `SUMIFS(sum_range, r1,c1,...)` | 奇数(≥3) | `SUM(sum_range) FILTER (WHERE c1 AND ...)` | |
| `AVERAGEIF(range, criteria, avg_range)` | 3 | `AVG(avg_range) FILTER (WHERE <criteria_sql>)` | |
| `AVERAGEIFS(avg_range, r1,c1,...)` | 奇数(≥3) | `AVG(avg_range) FILTER (WHERE c1 AND ...)` | |

### 1.2 标量 / 逻辑函数

| Excel 函数 | 参数 | 生成 SQL 语义 |
|---|---|---|
| `ROUND(x, n)` | 2 | `ROUND(x, n)` |
| `ABS(x)` | 1 | `ABS(x)` |
| `IF(cond, a, b)` | 3 | `CASE WHEN cond THEN a ELSE b END` |
| `IFERROR(x, fallback)` | 2 | `COALESCE(x, fallback)`（仅当 `x` 为安全表达式） |
| `AND(a, b, ...)` | ≥2 | `(a AND b AND ...)` |
| `OR(a, b, ...)` | ≥2 | `(a OR b OR ...)` |
| `NOT(x)` | 1 | `(NOT x)` |
| `ISBLANK(x)` | 1 | `(x IS NULL OR x::text = '')` |
| `YEAR(x)` | 1 | `EXTRACT(YEAR FROM x)` |
| `MONTH(x)` | 1 | `EXTRACT(MONTH FROM x)` |

### 1.3 运算符

`+ - * /` `= <> != > >= < <=` `&`（字符串拼接 → `||`）。
`/` 的分母自动包裹 `NULLIF(分母, 0)::numeric`，防止除零与整数除法。

### 1.4 字面量

`123` `123.45` `"正式员工"` `'正式员工'` `TRUE` `FALSE` `NULL`。

### 1.5 字段引用

`员工类型` / `current.员工类型` / `employee_type` / `current.employee_type` / `FIELD("employee_type")`
→ 均解析为 `"current"."employee_type"`（经数据集输出字段映射）。
未映射字段 → 结构化错误 `unknown_field`，**不**原样拼接进 SQL。

---

## 2. `COUNTIF("*")` 与 Excel 条件语义（必读）

`COUNTIF(range, "*")` 的语义是「该字段**非空且非空串**」，不是「匹配任意字符」。

| Excel criteria | 生成 SQL 条件 |
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

> ⚠️ 典型坑：正式员工比例的分母若用 `COUNTIF(current.员工类型,"*")`，
> 含义是「员工类型**非空**的人数」。若「全部员工」应包含员工类型为空的记录，
> 分母应改用 `COUNT(*)`。AI 助手会在返回中给出该提醒（见 §4）。

---

## 3. 测试矩阵：函数 × 条件 × 字段类型

| 函数 | 条件示例 | 字段类型（date/timestamp 才启用日期语义） | 覆盖测试 |
|---|---|---|---|
| `COUNTIF` | `"*"` / `"正式*"` / `">0"` / `"<>正式员工"` / `"="` | text / number / date | `test_formula_ast_excel_criteria.py` |
| `COUNTIFS` | 多条件 AND | text+number | `test_formula_ast_sql_aggregates.py` |
| `SUMIF` / `SUMIFS` | 单/多条件 | number/number | `test_formula_ast_sql_aggregates.py` |
| `AVERAGEIF` / `AVERAGEIFS` | 单/多条件 | number | `test_formula_ast_sql_aggregates.py` |
| `COUNTA` | — | text | `test_formula_ast_sql_aggregates.py` |
| `SUM/MAX/MIN/AVG` | — | number | `test_formula_ast_sql_aggregates.py` |
| `ROUND/ABS` | — | number | `test_formula_ast_sql_basic.py` |
| `IF/AND/OR/NOT/ISBLANK` | — | bool/expr | `test_formula_ast_sql_basic.py` |
| `YEAR/MONTH` | date 字段 | date/timestamp | `test_formula_ast_sql_basic.py` |

**端到端验收（AST0018）**：`=COUNTIF(current.员工类型,"正式员工")/COUNTIF(current.员工类型,"*")`
在「正式 8 人 / 非空 10 人」数据下结果 `0.8`，SQL 不残留 `COUNTIF(`，不发生整数除法。

---

## 4. AI 与 AST 编译器的边界

### 4.1 AI 可以做什么

1. 根据自然语言生成**公式**（如返回 `=COUNTIF(current.员工类型,"正式员工")/COUNTIF(current.员工类型,"*")`）。
2. 将用户公式改写为平台支持公式。
3. 解释公式业务含义。
4. 根据 AST 编译错误给出**修复建议**。
5. 提醒口径歧义（如「分母是否应包含空值」）。

### 4.2 AI 禁止做什么

1. ❌ 直接生成最终 SQL 并跳过编译器。
2. ❌ 直接保存 `formula_sql`。
3. ❌ 自行决定字段映射 / 访问未授权字段。
4. ❌ 绕过确定性编译（编译失败时必须返回错误，由用户/AI 修正公式后重编译）。

### 4.3 推荐交互

```
用户：计算正式员工占全部员工比例
AI  ：{
        "formula_display": "=COUNTIF(current.员工类型,\"正式员工\")/COUNTIF(current.员工类型,\"*\")",
        "explanation": "分子统计正式员工人数，分母统计员工类型非空的全部员工人数。",
        "warnings": ["如果全部员工应包含员工类型为空的员工，请将分母改为 COUNT(*)。"]
      }
→ 系统用 AST 编译器把 formula 编译为 SQL 后入库。
```

---

## 5. 开发文档：如何扩展一个新函数

1. **语义层**（`app/ai_formula/ast/semantics.py`）
   在聚合 / 标量函数注册表中登记：
   - `name`（大写）、`min_args` / `max_args`、`is_aggregate`、`returns_type`。
   - 未知函数自动返回 `unsupported_function` 错误，无需额外代码。
2. **SQL 生成层**（`app/ai_formula/ast/sql_generator.py`）
   在 `visit_FunctionCall` 中增加该函数的 SQL 模板分支。
   聚合函数走 `FILTER (WHERE ...)` 模式；标量函数直接映射。
3. **条件语义**（`app/ai_formula/ast/excel_criteria.py`）
   若新函数带 criteria 参数，复用 `compile_criterion(col_sql, op, rest, data_type=...)`，
   它会自动处理通配符、`<>/=` 的 NULL 分支、以及 date/number/text 类型推断。
4. **除法保护**（`app/ai_formula/ast/sql_generator.py` 的除法处理）
   任何出现在 `/` 右侧的表达式都会自动 `NULLIF(...,0)::numeric`，无需手动处理。
5. **单元测试**（DB-free，无需 PostgreSQL）
   - `tests/test_formula_ast_semantics_functions.py`（签名 / 白名单校验）
   - `tests/test_formula_ast_sql_aggregates.py` 或 `..._sql_basic.py`（SQL 生成）
6. **运行验证**
   ```powershell
   cd D:\AI项目\HR提效工具搭建\hr-portal\backend
   python -m pytest tests/test_formula_ast_*.py -q
   ```

> 扩展函数后请同步更新本文档 §1 白名单与 §3 测试矩阵。

---

## 6. 安全与确定性约束（编译产物必须满足）

1. 不允许分号 `;` 与 DDL/DML 关键字（`INSERT/UPDATE/DELETE/DROP/ALTER/TRUNCATE/CREATE/GRANT/REVOKE`）。
2. 不允许子查询、未授权表名、未暴露字段、非白名单函数。
3. 不原样拼接用户 SQL；字段名一律经映射后以双引号标识符输出。
4. 同一公式 + 同一字段映射 + 同一编译器版本 → 生成**完全相同**的 SQL（确定性）。
5. 灰度开关 `FORMULA_COMPILER_ENGINE = ast | legacy | ast_with_legacy_fallback`：
   - 默认 `ast`；
   - `ast_with_legacy_fallback` 仅在 AST 返回 `unsupported_function` 时回退 legacy，且**回退后仍做安全校验**，绝不绕过。
