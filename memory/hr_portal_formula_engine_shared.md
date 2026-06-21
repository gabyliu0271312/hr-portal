---
name: hr_portal_formula_engine_shared
description: 公式求值引擎是公共组件,在 app/ai_formula,新场景要做公式计算字段一律复用,不要重写求值器
metadata:
  type: project
---

# 公式引擎是公共组件(app/ai_formula)

`app/ai_formula/` 名字像 AI/报表专属,**实则是顶层独立公共模块**:reports / datasets / table_tools 平级 import 它,非报表私有。

**纯公式引擎层(零业务、可任意复用)**:
- `formula_evaluator.py` — `evaluate_formula(formula, field_resolver, custom_functions)` 逐行求值;`SafeFormulaEvaluator`;内置 IF/AND/OR/ROUND/MIN/MAX/SUM/ABS/CONCAT/ISBLANK/LEN/UPPER/LOWER
- `function_catalog.py` — 函数目录定义
- `formula_safety.py` — 安全检查(deny token,单向依赖 app.ai.deny_patterns)
- `custom_functions.py` — `executable_functions(db)` 返回启用的函数库(含 CALC_TAX/SAFE_DIVIDE + DB 自定义函数)

**业务耦合层(绑数据集,别跨场景用)**:`field_refs.py`(脱敏/字段元数据)、`validator.py`、`router.py`。

**新场景接入范式**(table_tools 已这样做):
```python
from app.ai_formula.formula_evaluator import evaluate_formula
from app.ai_formula.custom_functions import executable_functions
custom_functions = await executable_functions(db)   # router 层取
evaluate_formula(expr, field_resolver=row.get, custom_functions=custom_functions)
```

**铁律:要做"按公式算字段"一律复用此引擎,不要再写第二个求值器**。table_tools 原来自己写的 `eval_expr` 已删除,改用公共引擎(2026-06-21,生产未使用故无兼容包袱)。

**字段引用语法分层**:引擎内部认 `FIELD("code")`;各模块在显示层用自己的占位写法再转换——报表用 `[字段名]`,table_tools 用 `{列名}`(见 `engine.py::_to_field_calls`)。

关联:[[hr_portal_excel_table_tools]](006 表格处理工具) 的派生字段就是复用本引擎。
