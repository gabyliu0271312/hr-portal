# 🔍 AI 交叉审查报告 — Spec 010 数据对比 Phase 1+2

审查日期: 2026-06-28
审查范围: 14 个文件（10 后端 + 4 前端）

---

## 📁 `app/data_compare/router.py`

| 严重度 | 问题 | 位置 | 说明 |
|--------|------|------|------|
| **P1** | `invoke_adhoc` 参数无 Pydantic 校验 | L270-271 | `spec: dict` 接受裸 dict，没有任何类型验证。攻击者可传入任意 JSON 绕过 schema 校验。应改为 Pydantic 模型。 |
| P2 | `from_orm` 弃用 API | L406, L442 | Pydantic v2 中 `from_orm` 已被弃用，应使用 `model_validate`。 |
| P2 | `list_skills` 与 service 函数重名 | L132 | 路由函数 `list_skills` 与导入的 `service.list_skills` 同名。 |
| P2 | `TaskOut` 时间序列化对 None 处理不一致 | L424 | `updated_at` 回退到 `""`，而 `last_run_at` 回退到 `None`。建议统一为 `None`。 |

**P1 修复建议** (`invoke_adhoc`):
```python
class AdhocCompareRequest(BaseModel):
    compare_type: str
    source_a: dict
    source_b: dict
    join_keys: list[str]
    output: dict | None = None

@router.post("/invoke", response_model=CompareResult)
async def invoke_adhoc(
    spec: AdhocCompareRequest,
    ...
```

---

## 📁 `app/data_compare/task_service.py`

| 严重度 | 问题 | 位置 | 说明 |
|--------|------|------|------|
| **P1** | `execute_for_scheduler` `triggered_by` 类型不一致 | L300-323 | 参数声明 `triggered_by: str = "scheduler"`，但实际传给 `execute_task(triggered_by=user_id)` 时 `user_id` 是 `int`。类型语义混乱。 |
| P2 | `execute_task` 内部调用 `db.commit()` 违反 handler 契约 | L296 | 调度引擎文档明确"不要在 handler 里写 db.commit()"。功能正确但事务边界不干净。 |
| P2 | `user_can_access_task` 每次都查 User 表 | L32 | 高频调用时可考虑缓存或传 user 对象。 |
| P2 | `create_task` 当 skill_id=None 时创建空任务 | L57-60 | `compare_type=""` 直接入库，依赖前端校验，API 直接调用会产生无效任务。 |

**P1 修复建议**:
```python
async def execute_for_scheduler(
    db: AsyncSession,
    task_id: int,
    triggered_by: str = "scheduler",
) -> tuple[int, str]:
    ...
    user_id: int | None = skill.created_by if skill else None
    run = await execute_task(db, task, trigger_type="scheduled", triggered_by=user_id)
```

---

## 📁 `app/scheduler/handlers.py`

| 严重度 | 问题 | 位置 | 说明 |
|--------|------|------|------|
| P2 | 文件头注释编码乱码 | L1-20 | 整段中文注释全部为乱码（如 `"鎵€鏈?handler 鐨勫疄鐜?+"`），需修复文件编码为 UTF-8。 |

代码逻辑正确——`_handler_data_compare` 在 `JOB_HANDLERS` 中注册正常。

---

## 📁 `app/data_compare/formatter.py`

| 严重度 | 问题 | 位置 | 说明 |
|--------|------|------|------|
| P2 | `_format_roster` 中 `total_compared` 重复赋值 | L96, L104 | 两个赋值结果相同但语义上有重复。 |
| P2 | `_format_amount` 冗余的 `or 0` | L119-121 | `sum((r.get("amount_a") or 0) for r in rows if r.get("amount_a") is not None)` — `or 0` 在 filter 排除 None 后是冗余的。 |

脱敏逻辑整体完善——先格式化后脱敏、amount 敏感时自动加 `diff`、summary 金额清空——均无 P0/P1 问题。

---

## 📁 `app/data_compare/engine.py`

| 严重度 | 问题 | 位置 | 说明 |
|--------|------|------|------|
| **P1** | `compile_amount_query` group_by 列未做 whitelist 校验 | L346-354 | `meta_a.columns.get(g)` 可能返回 None→使用 `g` 回退直接拼入 SQL。虽然上游有 validator 校验，但引擎作为最后防线应更保守。 |
| P2 | `compile_field_query` 无 compare_conditions 时空 WHERE | L320 | `WHERE {' OR '.join(compare_conditions)}` 当 conditions 为空时生成无效 SQL `WHERE `。 |
| P2 | `_format_scope_clause` 逻辑不够显式 | L120 | `if not s` 对空字符串返回 `""`，建议用 `if not s or s.lower() == "true"` 更清晰。 |

**P1 修复建议**:
```python
for g in amount_spec.group_by:
    col_a = meta_a.columns.get(g)
    col_b = meta_b.columns.get(g)
    if col_a is None or col_b is None:
        raise ValueError(f"Unknown group_by column: {g}")
    group_cols_a.append(f'"{col_a.column_code}"')
    group_cols_b.append(f'"{col_b.column_code}"')
```

---

## 📁 `app/data_compare/chat_handler.py`

| 严重度 | 问题 | 位置 | 说明 |
|--------|------|------|------|
| P2 | `.value` 字符串比较 vs 枚举比较混用 | L139 | `spec.compare_type.value == "amount"` 应统一为 `spec.compare_type == CompareType.AMOUNT`。 |

脱敏列名生成逻辑完善：
- FIELD 模式正确生成 `{field}_a` / `{field}_b`
- AMOUNT 模式正确处理 `amount_a` / `amount_b` + group_by 列
- ROSTER 模式遍历所有 `join_keys`，不写死单一键名

---

## 📁 `app/permissions/scope_filter.py`

| 严重度 | 问题 | 位置 | 说明 |
|--------|------|------|------|
| P2 | 嵌套层级较深 | L414-418 | `roster_role_cols` 在条件块内定义但外部已做判断，逻辑正确但可读性可通过提前返回提升。 |

Scope alias 处理正确——`_build_scope_filter_for_model` 接受 `table_alias`，内部用 `aliased(Model, name=table_alias)` 生成别名列表达式。Roster 穿透子查询使用固定别名 `scope_roster`。

---

## 📁 `app/data_compare/executor.py`

| 严重度 | 问题 | 位置 | 说明 |
|--------|------|------|------|
| P2 | `statement_timeout` 依赖事务边界 | L143 | `SET LOCAL` 只在当前事务生效，依赖调用方的事务管理。当前实现正确但隐性耦合。 |

`build_scope_for_compare` 逻辑完善——正确为两表分别构建 scope，传入对应 alias。

---

## 📁 `app/data_compare/models.py`

无问题。模型设计合理：
- 索引覆盖关键查询路径（enabled、created_by、skill_id、task_id、status、started_at）
- `join_keys` 使用 JSON 类型支持复合键
- `ondelete="SET NULL"`（task→skill）和 `ondelete="CASCADE"`（run→task）语义正确

---

## 📁 `alembic/versions/0054_data_compare_tasks.py`

无问题。Migration 正确创建两张表 + 6 个索引。upgrade/downgrade 对称。

---

## 📁 `frontend/src/api/data-compare.ts`

无问题。API 定义完整，类型签名与后端路由完全匹配。

---

## 📁 `frontend/src/views/system/DataCompareTaskList.vue`

| 严重度 | 问题 | 位置 | 说明 |
|--------|------|------|------|
| **P1** | `viewRuns` 路由参数错误 | L484-486 | `router.push(\`/system/data-compare/runs/${taskId}\`)` — 路由 `/system/data-compare/runs/:runId` 期望 **runId**，但传入的是 **taskId**。点击"记录"按钮会导航到不存在的 run 详情页。 |

**P1 修复建议**:
```typescript
// 方案A: 新增任务执行记录列表路由
router.push(`/system/data-compare/tasks/${taskId}/runs`)

// 方案B: 使用 query 参数
router.push(`/system/data-compare/runs?taskId=${taskId}`)
```

---

## 📁 `frontend/src/components/ai/ScheduleBindingDialog.vue`

| 严重度 | 问题 | 位置 | 说明 |
|--------|------|------|------|
| P2 | `nextRunPreview` 仅显示 Cron 字符串 | L90-94 | 已注释 "Simple preview"。建议后续用 cron-parser 显示实际的下次执行时间。 |
| P2 | Preset 匹配字典冗余 | L78-85 | `presets` 的 key 和 value 完全相同，实质是无用映射。 |

---

## 📁 `frontend/src/views/system/DataCompareRunDetail.vue`

| 严重度 | 问题 | 位置 | 说明 |
|--------|------|------|------|
| P2 | `loadRun` 缺少错误处理 | L103-109 | 只有 `try/finally`，请求失败时无错误提示。应加 `catch` 块。 |

---

## 📊 审查总结

| 严重度 | 数量 | 关键项 |
|--------|------|--------|
| **P0** | 0 | — |
| **P1** | 4 | `invoke_adhoc` 无校验、`viewRuns` 路由参数错误、`triggered_by` 类型混淆、amount group_by 缺白名单校验 |
| **P2** | 13 | 代码风格、弃用 API、注释乱码、冗余逻辑、错误处理缺失 |

**总体评价**: 代码整体质量较高。Phase 1 的关键安全机制（scope alias、复合键、脱敏）实现严密。Phase 2 的数据模型和 API 设计合理。4 个 P1 问题需优先处理：

1. **`router.py` — `invoke_adhoc`**: 缺少输入校验（安全风险）
2. **`DataCompareTaskList.vue` — `viewRuns`**: 路由参数错误（功能 bug）
3. **`task_service.py` — `triggered_by`**: 类型语义混淆（类型安全）
4. **`engine.py` — amount group_by**: 校验不足，引擎防线有缺口（安全防线）
