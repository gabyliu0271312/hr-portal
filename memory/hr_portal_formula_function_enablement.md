---
name: hr-portal-formula-function-enablement
description: HR 提效工具中启用 Excel 函数库函数的双重门禁：后端可执行适配 + 数据库开关
metadata:
  type: project
---

HR 提效工具的「函数库管理」里启用 Excel 函数，不能只改数据库开关；必须先让函数进入后端可执行范围，再写入启用状态。

**Why:** 函数目录来自 `formulas` 包扫描，但未适配的函数会被标记为 `catalog_only` / `is_executable=false`，页面和后端接口都会拒绝启用；即使强行写数据库，公式执行器也会报 unknown function。

**How to apply:** 需要启用新函数时，先在 `hr-portal/backend/app/ai_formula/function_catalog.py` 的 `EXECUTABLE_BASE_FUNCTIONS` 中补函数元数据；如函数在 `BLOCKED_CATALOG_CODES` 中，先移除。然后在 `hr-portal/backend/app/ai_formula/formula_evaluator.py` 中实现并注册到 `_builtin_functions()`。再 upsert `formula_function_catalog_settings`，把 `is_visible`、`is_enabled`、`is_ai_enabled` 都设为 true。最后跑 `docker exec hr-portal-backend pytest tests/test_ai_formula_core.py -q`，重建重启后端，并用 `base_formula_function_catalog(include_catalog_only=True)` 确认 `support_status=executable`、`is_executable=true`。已按此方式启用过 `DATE`、`TEXT`、`YEAR`、`DATEDIF`、`EDATE`、`TODAY`。