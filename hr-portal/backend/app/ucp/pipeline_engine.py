"""UCP Pipeline 执行引擎

核心职责：
  1. 接收 Pipeline 配置，按步骤顺序执行
  2. 维护执行上下文（Context），支持步骤间数据传递
  3. 支持 CONNECTOR / CONNECTOR_LOOP / TRANSFORM / NOTIFY 四类步骤
  4. 记录 Pipeline 和 Step 执行实例、执行日志
  5. 错误处理策略：STOP_ON_ERROR / CONTINUE_ON_ERROR
  6. PARTIAL_SUCCESS 状态判定
  7. 通知闭环（复用飞书通知服务）
  8. 敏感字段脱敏

Phase 1A 简化版：
  - 上下文数据以 JSON 存储（小数据量内存传递）
  - 不支持 WAIT 步骤
  - 通知使用简化版（直接调用飞书通知服务，不做 pipeline 级通知策略）
"""
from __future__ import annotations

import logging
import time
import uuid
from copy import deepcopy
from datetime import datetime, UTC
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.ucp.adapters import AdapterResult, get_adapter
from app.ucp.circuit_breaker import (
    CircuitBreakerError,
    check_circuit as cb_check,
    record_failure as cb_record_failure,
    record_success as cb_record_success,
)
from app.ucp.credential_service import decrypt_credential_secrets
from app.ucp.models import (
    ConnectorExecutionLog,
    ConnectorLoopItemExecution,
    ConnectorPipelineConfig,
    ConnectorPipelineExecution,
    ConnectorPipelineStepExecution,
    ConnectorSystemConfig,
)
from app.ucp.rate_limiter import (
    RateLimitError,
    acquire as rl_acquire,
)

logger = logging.getLogger("ucp.pipeline_engine")


# ===== PARTIAL_SUCCESS 严重度评估（Phase 2-3）=====
# 设计原则：失败率越高越严重，触发不同通知与 UI 颜色
#   NONE       - 全成功
#   WARNING    - 失败率 <= PARTIAL_WARNING_THRESHOLD（默认 30%）
#   CRITICAL   - 失败率 > PARTIAL_CRITICAL_THRESHOLD（默认 50%）或整段失败
# 边界值：30% < x <= 50% 视为 WARNING；> 50% 视为 CRITICAL
PARTIAL_WARNING_THRESHOLD = 0.30
PARTIAL_CRITICAL_THRESHOLD = 0.50

PARTIAL_SEVERITY_NONE = "NONE"
PARTIAL_SEVERITY_WARNING = "WARNING"
PARTIAL_SEVERITY_CRITICAL = "CRITICAL"


def calculate_partial_severity(
    total: int,
    failed: int,
    not_found: int = 0,
) -> dict:
    """根据失败率计算 PARTIAL 严重度。

    输入：
      - total: 总处理项数
      - failed: 失败项数
      - not_found: 找不到的项数（计入"非成功"但视为预期失败，不升级严重度）

    输出：
      {
        "severity": "NONE" | "WARNING" | "CRITICAL",
        "failed_count": int,
        "not_found_count": int,
        "total": int,
        "success_count": int,
        "failed_rate": float,   # 0.0 ~ 1.0
        "failure_rate": float,  # 排除 not_found 后的真实失败率
        "label": str,           # 用户可读标签
      }
    """
    failed = int(failed or 0)
    not_found = int(not_found or 0)
    total = int(total or 0)
    if total <= 0:
        return {
            "severity": PARTIAL_SEVERITY_NONE,
            "failed_count": 0,
            "not_found_count": 0,
            "total": 0,
            "success_count": 0,
            "failed_rate": 0.0,
            "failure_rate": 0.0,
            "label": "无数据",
        }

    success_count = max(0, total - failed - not_found)
    # 失败率：把所有"非成功项"（failed + not_found）当失败计算
    failed_rate = round((failed + not_found) / total, 4) if total else 0.0
    # 真实失败率：仅算 failed（not_found 是预期失败）
    failure_rate = round(failed / total, 4) if total else 0.0

    if failed == 0 and not_found == 0:
        severity = PARTIAL_SEVERITY_NONE
        label = "全部成功"
    elif failed == 0 and not_found > 0:
        # 只有 not_found（如 Offer 不存在）属于业务预期，WARNING 但不升级
        severity = PARTIAL_SEVERITY_WARNING
        label = f"{not_found} 条记录未找到"
    elif failure_rate > PARTIAL_CRITICAL_THRESHOLD or failed == total:
        severity = PARTIAL_SEVERITY_CRITICAL
        label = f"严重失败 {failed}/{total}（{failure_rate*100:.0f}%）"
    elif failure_rate > PARTIAL_WARNING_THRESHOLD:
        severity = PARTIAL_SEVERITY_WARNING
        label = f"部分失败 {failed}/{total}（{failure_rate*100:.0f}%）"
    else:
        severity = PARTIAL_SEVERITY_WARNING
        label = f"少量失败 {failed}/{total}（{failure_rate*100:.0f}%）"

    return {
        "severity": severity,
        "failed_count": failed,
        "not_found_count": not_found,
        "total": total,
        "success_count": success_count,
        "failed_rate": failed_rate,
        "failure_rate": failure_rate,
        "label": label,
    }


def aggregate_pipeline_severity(step_severities: list[dict]) -> dict:
    """聚合所有步骤的严重度，得到流水线级严重度。

    规则（从严重到轻微）：
      1. 任一 CRITICAL → 流水线 CRITICAL
      2. 多个 WARNING → 流水线 WARNING
      3. 全 NONE → 流水线 NONE
    """
    has_critical = any(s.get("severity") == PARTIAL_SEVERITY_CRITICAL for s in step_severities)
    has_warning = any(s.get("severity") == PARTIAL_SEVERITY_WARNING for s in step_severities)

    if has_critical:
        severity = PARTIAL_SEVERITY_CRITICAL
        label = "流水线包含严重失败"
    elif has_warning:
        severity = PARTIAL_SEVERITY_WARNING
        label = "流水线部分失败"
    else:
        severity = PARTIAL_SEVERITY_NONE
        label = "流水线全部成功"

    total_failed = sum(s.get("failed_count", 0) for s in step_severities)
    total_not_found = sum(s.get("not_found_count", 0) for s in step_severities)
    total = sum(s.get("total", 0) for s in step_severities)

    return {
        "severity": severity,
        "label": label,
        "total_failed": total_failed,
        "total_not_found": total_not_found,
        "total": total,
        "step_severities": step_severities,
    }


# ===== Context 管理 =====

class PipelineContext:
    """流水线执行上下文，管理步骤间数据传递。

    设计：
      - 小数据量（统计、参数）直接保存在 _store dict
      - 步骤 output_key 对应 _store 中的 key
      - 大数据量（明细列表）应落库或存临时文件，Phase 1A 先用内存传递
    """

    def __init__(self, trace_id: str, pipeline_run_id: str):
        self.trace_id = trace_id
        self.pipeline_run_id = pipeline_run_id
        self._store: dict[str, Any] = {}
        # 执行统计
        self.stats: dict[str, dict] = {}

    def set(self, key: str, value: Any) -> None:
        self._store[key] = value

    def get(self, key: str) -> Any | None:
        return self._store.get(key)

    def resolve_ref(self, expr: str) -> Any | None:
        """解析步骤配置中的变量引用，如 ${pull_pending_list.result.row_count}。

        Phase 1A 简化版：只支持 ${step_id.result.field} 和 ${execution.status} 格式。
        """
        if not expr.startswith("${") or not expr.endswith("}"):
            return expr  # 不是引用，原样返回

        ref = expr[2:-1]  # 去掉 ${ }
        parts = ref.split(".")
        if len(parts) == 1:
            return self._store.get(parts[0])

        # 如 pull_pending_list.result.row_count
        step_id = parts[0]
        step_data = self._store.get(step_id)
        if step_data is None:
            return None

        # 深层取值
        current = step_data
        for part in parts[1:]:
            if isinstance(current, dict):
                current = current.get(part)
            else:
                return None
        return current

    def to_summary(self) -> dict:
        """生成 Context 摘要（不含敏感明细、不含大体积数据）。"""
        from app.ucp.masking import mask_sensitive_fields

        summary: dict[str, Any] = {}
        for key, value in self._store.items():
            if isinstance(value, list):
                # 只保存统计 + 前 20 行脱敏样例
                summary[key] = {
                    "row_count": len(value),
                    "sample": mask_sensitive_fields(value[:20]) if value else [],
                }
            elif isinstance(value, dict):
                # 字典内容脱敏
                summary[key] = mask_sensitive_fields([value])[0] if value else {}
            else:
                summary[key] = value
        summary["stats"] = self.stats
        return summary


# ===== ID 生成 =====

def _gen_trace_id() -> str:
    return f"trace_{uuid.uuid4().hex[:16]}"

def _gen_pipeline_run_id() -> str:
    return f"pr_{uuid.uuid4().hex[:12]}"

def _gen_step_run_id(step_id: str) -> str:
    return f"sr_{step_id}_{uuid.uuid4().hex[:8]}"


def _build_step_input_snapshot(step_config: dict, override_params: dict | None = None) -> dict:
    """构建步骤输入快照（脱敏后），用于执行详情页展示数据血缘（Phase 2-6）。

    只保留结构性字段（不含大体积数据、不含密钥），方便排查"这一步用了什么参数"。
    """
    from app.ucp.masking import mask_dict

    snapshot: dict[str, Any] = {
        "step_id": step_config.get("step_id"),
        "type": step_config.get("type", "CONNECTOR"),
        "connector_code": step_config.get("connector_code"),
    }
    # CONNECTOR_LOOP 相关
    if step_config.get("loop_input"):
        snapshot["loop_input"] = step_config.get("loop_input")
    if step_config.get("item_key_field"):
        snapshot["item_key_field"] = step_config.get("item_key_field")
    # 步骤参数（脱敏）
    raw_params = step_config.get("params") or {}
    if raw_params:
        snapshot["params"] = mask_dict(raw_params)
    # TRANSFORM 配置
    if step_config.get("transform_config"):
        tc = step_config.get("transform_config")
        snapshot["transform_operation"] = tc.get("operation")
        snapshot["transform_target_table"] = tc.get("target_table")
        snapshot["transform_join_key"] = tc.get("join_key")
    # NOTIFY 配置（只记结构性字段）
    if step_config.get("config"):
        snapshot["notify_enabled"] = bool(step_config["config"].get("enabled"))
    # 步骤参数覆盖（手动触发注入）
    if override_params:
        step_id = step_config.get("step_id")
        if step_id and step_id in override_params:
            snapshot["override_params"] = mask_dict(override_params[step_id])
    return snapshot


def _apply_mapping_rules(row: dict, mapping_rules: list[dict]) -> dict:
    """应用映射规则：将源字段名映射为目标字段名。

    mapping_rules 格式：
      [{"source": "employee_name", "target": "name"}, ...]

    未在 rules 中出现的字段保持原名不变。
    """
    if not mapping_rules:
        return row

    rename_map = {r.get("source", ""): r.get("target", "") for r in mapping_rules if r.get("source") and r.get("target")}
    mapped = {}
    for key, value in row.items():
        mapped_key = rename_map.get(key, key)
        mapped[mapped_key] = value
    return mapped


# ===== Pipeline 执行 =====

async def execute_pipeline(
    pipeline_code: str,
    db: AsyncSession,
    trigger_type: str = "SCHEDULED",
    triggered_by: str | None = None,
    dry_run: bool = False,
    time_range: dict | None = None,
    override_params: dict | None = None,
    ) -> ConnectorPipelineExecution:
    """执行一次完整流水线。

    1. 加载 Pipeline 配置
    2. 创建执行实例行
    3. 按步骤顺序执行
    4. 维护 Context
    5. 记录步骤执行实例
    6. 判断最终状态（SUCCESS / PARTIAL_SUCCESS / FAILED）
    7. 保存 Context 摘要
    8. 发送执行结果通知
    """
    trace_id = _gen_trace_id()
    pipeline_run_id = _gen_pipeline_run_id()

    # 1. 加载配置
    pl_config = await _load_pipeline_config(db, pipeline_code)
    steps = pl_config.steps or []
    error_handling = pl_config.error_handling or "STOP_ON_ERROR"

    # 2. 创建执行实例
    exec_instance = ConnectorPipelineExecution(
        pipeline_run_id=pipeline_run_id,
        pipeline_code=pipeline_code,
        trace_id=trace_id,
        trigger_type=trigger_type,
        triggered_by=triggered_by,
        status="RUNNING",
        total_steps=len(steps),
        success_steps=0,
        failed_steps=0,
        run_as_type=pl_config.run_as_type,
        run_as_user_id=pl_config.run_as_user_id,
        service_account_code=pl_config.service_account_code,
        started_at=datetime.now(UTC),
    )
    db.add(exec_instance)
    await db.flush()

    # 3. 创建 Context
    ctx = PipelineContext(trace_id, pipeline_run_id)
    ctx.set("execution", {
        "pipeline_code": pipeline_code,
        "pipeline_run_id": pipeline_run_id,
        "trace_id": trace_id,
        "trigger_type": trigger_type,
        "triggered_by": triggered_by,
        "dry_run": dry_run,
        "time_range": time_range,
        "override_params": override_params,
    })

    start_time = time.monotonic()
    success_count = 0
    failed_count = 0
    overall_status = "SUCCESS"
    final_error = None
    step_severities: list[dict] = []  # Phase 2-3：收集步骤级严重度用于聚合

    # 4. 按步骤执行
    for step_config in steps:
        step_id = step_config.get("step_id", "")
        step_type = step_config.get("type", "CONNECTOR")
        step_run_id = _gen_step_run_id(step_id)

        # 创建步骤执行实例
        step_exec = ConnectorPipelineStepExecution(
            step_run_id=step_run_id,
            pipeline_run_id=pipeline_run_id,
            step_id=step_id,
            step_type=step_type,
            connector_code=step_config.get("connector_code"),
            status="RUNNING",
            started_at=datetime.now(UTC),
            # Phase 2-6：记录脱敏后的步骤输入定义（数据血缘）
            input_snapshot=_build_step_input_snapshot(step_config, override_params),
        )
        db.add(step_exec)
        await db.flush()

        step_start = time.monotonic()
        step_status = "SUCCESS"
        step_error = None

        try:
            result = await _execute_step(step_config, ctx, db, trace_id, pipeline_run_id, step_run_id)
            ctx.set(step_id, result)
            result_status = result.get("status", "success")
            ctx.stats[step_id] = {
                "status": result_status,
                "row_count": result.get("row_count", 0),
                "success_count": result.get("success_count", 0),
                "failed_count": result.get("failed_count", 0),
            }
            # Phase 4: APPROVAL 节点返回 waiting_approval
            if result_status == "waiting_approval":
                step_status = "WAITING_APPROVAL"
                overall_status = "WAITING_APPROVAL"
        except Exception as e:
            step_status = "FAILED"
            step_error = str(e)[:1000]
            failed_count += 1
            ctx.stats[step_id] = {"status": "failed", "error": step_error}

            if error_handling == "STOP_ON_ERROR":
                # 终止后续步骤
                overall_status = "FAILED"
                final_error = step_error
                step_exec.status = "FAILED"
                step_exec.error_message = step_error
                step_exec.ended_at = datetime.now(UTC)
                step_exec.duration_ms = int((time.monotonic() - step_start) * 1000)
                await db.flush()
                break
            elif error_handling == "CONTINUE_ON_ERROR":
                # 记录失败后继续
                overall_status = "PARTIAL_SUCCESS"
                ctx.set(step_id, {"status": "failed", "error": step_error})

        # 更新步骤执行实例
        if step_status == "WAITING_APPROVAL":
            success_count += 1  # 审批创建成功算作成功
        elif step_status != "FAILED" or error_handling == "CONTINUE_ON_ERROR":
            success_count += 1

        step_exec.status = step_status
        step_exec.error_message = step_error
        step_exec.ended_at = datetime.now(UTC)
        step_exec.duration_ms = int((time.monotonic() - step_start) * 1000)

        # 步骤级输出摘要（脱敏后）
        step_result = ctx.get(step_id)
        if step_result:
            from app.ucp.masking import mask_sensitive_fields
            if isinstance(step_result, dict) and "data" in step_result:
                output_sample = mask_sensitive_fields(step_result.get("data", [])[:20])
                output_snapshot = {
                    "row_count": step_result.get("row_count", 0),
                    "success_count": step_result.get("success_count", 0),
                    "failed_count": step_result.get("failed_count", 0),
                    "sample": output_sample,
                }
                # Phase 2-3：附带 PARTIAL 严重度
                partial_detail = step_result.get("partial_detail")
                if partial_detail:
                    output_snapshot["partial_detail"] = partial_detail
                    step_severities.append(partial_detail)
                step_exec.output_snapshot = output_snapshot
                step_exec.total_items = step_result.get("row_count", 0)
                step_exec.success_items = step_result.get("success_count", 0)
                step_exec.failed_items = step_result.get("failed_count", 0)
        await db.flush()

    # 5. 判断最终状态
    if failed_count > 0 and overall_status != "FAILED":
        overall_status = "PARTIAL_SUCCESS"

    # Phase 2-3：聚合流水线级严重度
    pipeline_severity = aggregate_pipeline_severity(step_severities) if step_severities else {
        "severity": PARTIAL_SEVERITY_NONE, "label": "无数据", "total": 0,
        "total_failed": 0, "total_not_found": 0, "step_severities": [],
    }

    # 更新执行实例
    exec_instance.status = overall_status
    exec_instance.success_steps = success_count
    exec_instance.failed_steps = failed_count
    exec_instance.ended_at = datetime.now(UTC)
    exec_instance.duration_ms = int((time.monotonic() - start_time) * 1000)
    exec_instance.error_message = final_error
    # 把 PARTIAL 严重度写进 context_summary
    summary = ctx.to_summary()
    if summary is None:
        summary = {}
    summary["partial_severity"] = pipeline_severity
    exec_instance.context_summary = summary
    await db.flush()

    # 6. 写连接器执行日志（整条 pipeline 的执行日志）
    await _write_execution_log(db, trace_id, pipeline_code, pipeline_run_id, overall_status, ctx, trigger_type)

    # 7. 发送通知
    await _send_pipeline_notification(db, pipeline_code, pipeline_run_id, trace_id, overall_status, ctx, pl_config)

    logger.info(
        "[ucp] pipeline completed: code=%s run_id=%s status=%s duration=%dms",
        pipeline_code, pipeline_run_id, overall_status, exec_instance.duration_ms,
    )
    return exec_instance


async def _load_pipeline_config(
    db: AsyncSession,
    pipeline_code: str,
) -> ConnectorPipelineConfig:
    """加载已启用的流水线配置。"""
    pl = (
        await db.execute(
            select(ConnectorPipelineConfig).where(
                ConnectorPipelineConfig.pipeline_code == pipeline_code,
                ConnectorPipelineConfig.status == 1,
            )
        )
    ).scalar_one_or_none()
    if pl is None:
        raise RuntimeError(f"Pipeline '{pipeline_code}' not found or not enabled")
    return pl


async def _execute_step(
    step_config: dict,
    ctx: PipelineContext,
    db: AsyncSession,
    trace_id: str,
    pipeline_run_id: str,
    step_run_id: str,
) -> dict:
    """执行单个步骤，返回结果 dict。"""
    step_type = step_config.get("type", "CONNECTOR")

    if step_type == "CONNECTOR":
        return await _execute_connector_step(step_config, ctx, db, trace_id)
    elif step_type == "CONNECTOR_LOOP":
        return await _execute_loop_step(step_config, ctx, db, trace_id, pipeline_run_id, step_run_id)
    elif step_type == "TRANSFORM":
        return await _execute_transform_step(step_config, ctx, db)
    elif step_type == "NOTIFY":
        return await _execute_notify_step(step_config, ctx, db, trace_id, pipeline_run_id)
    elif step_type == "BRANCH":
        return await _execute_branch_step(step_config, ctx, db)
    elif step_type == "WAIT":
        return await _execute_wait_step(step_config, ctx, db)
    elif step_type == "APPROVAL":
        return await _execute_approval_step(step_config, ctx, db, trace_id, pipeline_run_id)
    else:
        raise RuntimeError(f"Unsupported step type: {step_type}")


async def _execute_connector_step(
    step_config: dict,
    ctx: PipelineContext,
    db: AsyncSession,
    trace_id: str,
) -> dict:
    """执行 CONNECTOR 步骤：调用单个连接器。

    Phase 2-9：增加熔断 + QPS 限流拦截
      - 调用前 cb_check(connector_code, conn_config.circuit_breaker_config)
        → 命中熔断抛 CircuitBreakerError
      - 调用前 rl_acquire(f"connector:{connector_code}", conn_config.rate_limit_config)
        → 命中限流抛 RateLimitError
      - 调用成功后 cb_record_success
      - 调用失败后 cb_record_failure
    """
    connector_code = step_config.get("connector_code", "")

    # 加载连接器配置
    conn_config = (
        await db.execute(
            select(ConnectorSystemConfig).where(
                ConnectorSystemConfig.system_code == connector_code,
            )
        )
    ).scalar_one_or_none()
    if conn_config is None:
        raise RuntimeError(f"Connector '{connector_code}' not found")

    cb_cfg = conn_config.circuit_breaker_config or {}
    rl_cfg = getattr(conn_config, "rate_limit_config", None) or {}

    # Phase 2-9：熔断检查（命中熔断直接抛错，不进入 adapter 调用）
    try:
        cb_check(connector_code, cb_cfg)
    except CircuitBreakerError as e:
        # 写一条 connection log 记录熔断拦截
        await _write_circuit_blocked_log(
            db, trace_id, connector_code, "CIRCUIT_OPEN", str(e),
        )
        raise

    # Phase 2-9：限流检查
    try:
        rl_acquire(f"connector:{connector_code}", rl_cfg)
    except RateLimitError as e:
        await _write_circuit_blocked_log(
            db, trace_id, connector_code, "RATE_LIMIT_EXCEEDED", str(e),
        )
        raise

    # 解密凭证
    secrets: dict[str, str] = {}
    if conn_config.credential_id:
        secrets = await decrypt_credential_secrets(db, conn_config.credential_id)

    # 构建适配器参数
    params = dict(conn_config.protocol or {})
    params.update(conn_config.report_config or {})
    # 合入步骤级额外参数
    params.update(step_config.get("params", {}))

    # 调用适配器（同时维护熔断状态）
    adapter = get_adapter(conn_config.adapter_code or "")
    try:
        result: AdapterResult = await adapter(params, secrets, db)
    except Exception as e:
        # 记录熔断失败
        cb_record_failure(
            connector_code, cb_cfg,
            error_code="ADAPTER_EXCEPTION",
            error_message=str(e)[:500],
        )
        raise

    # 根据结果更新熔断
    if result.status == "success":
        cb_record_success(connector_code, cb_cfg)
    else:
        cb_record_failure(
            connector_code, cb_cfg,
            error_code=result.error_code or "ADAPTER_FAILED",
            error_message=result.error_message or "适配器返回失败",
        )

    # 写连接器执行日志
    await _write_connector_execution_log(
        db, trace_id, connector_code, result, "pipeline_step"
    )

    return {
        "status": result.status,
        "data": result.data,
        "row_count": result.row_count,
        "success_count": result.success_count,
        "failed_count": result.failed_count,
        "extra": result.extra,
    }


async def _execute_loop_step(
    step_config: dict,
    ctx: PipelineContext,
    db: AsyncSession,
    trace_id: str,
    pipeline_run_id: str,
    step_run_id: str,
) -> dict:
    """执行 CONNECTOR_LOOP 步骤：对列表循环调用连接器。

    支持：
      - 并发度控制（Phase 1A 先串行执行）
      - 失败项记录
      - 部分成功状态
      - 限流保护（Phase 1A 先不加）
    """
    connector_code = step_config.get("connector_code", "")
    loop_input_key = step_config.get("loop_input", "")
    item_key_field = step_config.get("item_key_field", "application_id")

    # 从 Context 获取循环输入列表
    loop_items = ctx.resolve_ref(loop_input_key)
    if loop_items is None:
        # 如果引用的是 ${application_ids}（纯 ID 列表）
        loop_items = ctx.get(loop_input_key.lstrip("${").rstrip("}"))
    if loop_items is None:
        raise RuntimeError(f"LOOP input '{loop_input_key}' not found in context")

    # 加载连接器配置
    conn_config = (
        await db.execute(
            select(ConnectorSystemConfig).where(
                ConnectorSystemConfig.system_code == connector_code,
            )
        )
    ).scalar_one_or_none()
    if conn_config is None:
        raise RuntimeError(f"Connector '{connector_code}' not found")

    # 解密凭证
    secrets: dict[str, str] = {}
    if conn_config.credential_id:
        secrets = await decrypt_credential_secrets(db, conn_config.credential_id)

    adapter = get_adapter(conn_config.adapter_code or "")

    # 判断 loop_items 是 dict list 还是纯 ID list
    # 如果是 dict list，需要提取 item_key_field 的值作为循环键
    # 如果是 str/int list，直接使用
    if isinstance(loop_items, list) and len(loop_items) > 0 and isinstance(loop_items[0], dict):
        # dict list: 提取 key field 值
        item_keys = [str(row.get(item_key_field, "")) for row in loop_items]
    else:
        # 纯 ID 列表
        item_keys = [str(item) for item in loop_items]

    all_results: list[dict] = []
    success_count = 0
    failed_count = 0
    not_found_count = 0

    for item_key in item_keys:
        # 构建每次调用的参数
        params = dict(conn_config.protocol or {})
        params.update(conn_config.report_config or {})
        params.update(step_config.get("params", {}))
        params[item_key_field] = item_key

        try:
            result: AdapterResult = await adapter(params, secrets, db)

            if result.status == "success":
                all_results.extend(result.data)
                success_count += 1
            elif result.status == "offer_not_found":
                not_found_count += 1
                # 记录 OFFER_NOT_FOUND
                await _record_loop_item(
                    db, trace_id, pipeline_run_id, step_run_id,
                    connector_code, item_key, "OFFER_NOT_FOUND",
                )
            else:
                failed_count += 1
                # 记录失败项
                await _record_loop_item(
                    db, trace_id, pipeline_run_id, step_run_id,
                    connector_code, item_key, "FAILED",
                    error_code=result.error_code,
                    error_message=result.error_message,
                    request_params_masked=mask_item_params(params),
                )
        except Exception as e:
            failed_count += 1
            await _record_loop_item(
                db, trace_id, pipeline_run_id, step_run_id,
                connector_code, item_key, "FAILED",
                error_message=str(e)[:500],
                request_params_masked=mask_item_params(params),
            )

    # 确定步骤级状态
    if failed_count == 0 and not_found_count == 0:
        step_status = "SUCCESS"
    elif success_count > 0:
        step_status = "PARTIAL_SUCCESS"
    elif success_count == 0 and failed_count > 0:
        step_status = "FAILED"
    else:
        step_status = "PARTIAL_SUCCESS"

    # Phase 2-3：计算 PARTIAL 严重度
    partial_detail = calculate_partial_severity(
        total=len(item_keys),
        failed=failed_count,
        not_found=not_found_count,
    )
    partial_detail["step_status"] = step_status

    return {
        "status": step_status,
        "data": all_results,
        "row_count": len(item_keys),
        "success_count": success_count,
        "failed_count": failed_count,
        "not_found_count": not_found_count,
        "partial_detail": partial_detail,
        "failed_keys": [k for k in item_keys if any(
            r.item_key == k for r in (
                await db.execute(
                    select(ConnectorLoopItemExecution).where(
                        ConnectorLoopItemExecution.step_run_id == step_run_id,
                        ConnectorLoopItemExecution.status.in_(["FAILED", "OFFER_NOT_FOUND"]),
                    )
                )
            ).scalars().all()
        )],
    }


async def _execute_transform_step(
    step_config: dict,
    ctx: PipelineContext,
    db: AsyncSession,
) -> dict:
    """执行 TRANSFORM 步骤：数据转换。

    Phase 1A 支持的操作：
      - extract_field: 从列表中提取指定字段
      - join_and_upsert: 合并两个列表并按 join_key 写入目标表
      - filter: 按 condition 过滤列表
      - rename_fields: 重命名字段
    """
    transform_config = step_config.get("transform_config", {})
    operation = transform_config.get("operation", "")

    if operation == "extract_field":
        return await _transform_extract_field(step_config, ctx, transform_config)
    elif operation == "join_and_upsert":
        return await _transform_join_and_upsert(step_config, ctx, transform_config, db)
    elif operation == "filter":
        return await _transform_filter(step_config, ctx, transform_config)
    elif operation == "rename_fields":
        return await _transform_rename_fields(step_config, ctx, transform_config)
    else:
        raise RuntimeError(f"Unsupported transform operation: {operation}")


async def _transform_extract_field(
    step_config: dict,
    ctx: PipelineContext,
    transform_config: dict,
) -> dict:
    """extract_field: 从列表中提取指定字段值，生成新的列表。"""
    input_key = step_config.get("input_key", "")
    source_field = transform_config.get("source_field", "")
    output_field = transform_config.get("output_field", source_field)

    input_data = ctx.resolve_ref(input_key) or ctx.get(input_key.lstrip("${").rstrip("}"))
    if input_data is None:
        raise RuntimeError(f"TRANSFORM input '{input_key}' not found")

    if isinstance(input_data, list):
        extracted = [str(row.get(source_field, "")) for row in input_data if isinstance(row, dict)]
    else:
        extracted = []

    return {
        "status": "success",
        "data": extracted,
        "row_count": len(extracted),
        "success_count": len(extracted),
    }


async def _transform_join_and_upsert(
    step_config: dict,
    ctx: PipelineContext,
    transform_config: dict,
    db: AsyncSession,
) -> dict:
    """join_and_upsert: 合并两个列表并写入目标表。

    Phase 1B 配置化映射：
      - 从连接器配置的 mapping_config 中读取映射规则
      - mapping_config.rules: [{source: "src_field", target: "tgt_field"}]
      - 合并前先应用映射规则：source 字段值 → target 字段名
    幂等主键：由 transform_config.join_key 指定。
    """
    input_keys = step_config.get("input_key", [])
    if isinstance(input_keys, str):
        input_keys = [input_keys]

    join_key = transform_config.get("join_key", "application_id")
    target_table = transform_config.get("target_table", "")

    # Phase 1B：从连接器配置中加载映射规则
    mapping_rules: list[dict] = transform_config.get("mapping_rules", [])
    # 如果没有在 transform_config 中指定，从连接器配置中查找
    if not mapping_rules:
        for key in input_keys:
            key_clean = key.lstrip("${").rstrip("}")
            connector_code = step_config.get("connector_code", "")
            if connector_code:
                conn_config = (
                    await db.execute(
                        select(ConnectorSystemConfig).where(
                            ConnectorSystemConfig.system_code == connector_code,
                        )
                    )
                ).scalar_one_or_none()
                if conn_config and conn_config.mapping_config:
                    mapping_config = conn_config.mapping_config
                    if mapping_config.get("enabled", False):
                        mapping_rules = mapping_config.get("rules", [])
                        break

    # 收集所有输入数据，应用映射规则
    all_data: dict[str, dict] = {}  # join_key -> merged_row

    for key in input_keys:
        key_clean = key.lstrip("${").rstrip("}")
        data = ctx.resolve_ref(key) or ctx.get(key_clean)
        if data is None:
            continue
        if isinstance(data, list):
            for row in data:
                if isinstance(row, dict):
                    # 应用映射规则
                    mapped_row = _apply_mapping_rules(row, mapping_rules)
                    if join_key in mapped_row:
                        k = str(mapped_row[join_key])
                        if k in all_data:
                            # 合并：后者覆盖前者
                            all_data[k].update(mapped_row)
                        else:
                            all_data[k] = deepcopy(mapped_row)

    # 写入目标表
    if target_table:
        from app.ucp.upsert_service import upsert_to_target_table
        merged_rows = list(all_data.values())
        result = await upsert_to_target_table(
            db, target_table, merged_rows, join_key,
            source_key_map=all_data,
        )
        return {
            "status": result["status"],
            "data": merged_rows,
            "row_count": result["merged_count"],
            "success_count": result["merged_count"],
            "failed_count": result.get("failed_count", 0),
            "pending_count": result.get("pending_count", 0),
            "offer_success_count": result.get("offer_success_count", 0),
            "offer_not_found_count": result.get("offer_not_found_count", 0),
            "failed_application_ids": result.get("failed_application_ids", []),
        }

    return {
        "status": "success",
        "data": list(all_data.values()),
        "row_count": len(all_data),
        "success_count": len(all_data),
    }


async def _transform_filter(
    step_config: dict,
    ctx: PipelineContext,
    transform_config: dict,
) -> dict:
    """filter: 按 condition 过滤列表。"""
    input_key = step_config.get("input_key", "")
    condition = transform_config.get("condition", {})

    key_clean = input_key.lstrip("${").rstrip("}")
    data = ctx.resolve_ref(input_key) or ctx.get(key_clean)
    if data is None:
        return {"status": "success", "data": [], "row_count": 0, "success_count": 0}

    if not isinstance(data, list):
        return {"status": "success", "data": [], "row_count": 0, "success_count": 0}

    # Phase 1A 简化版：只支持 field=value 过滤
    filtered = data
    if condition:
        field = condition.get("field", "")
        value = condition.get("value", "")
        if field and value:
            filtered = [
                row for row in data
                if isinstance(row, dict) and str(row.get(field, "")) == str(value)
            ]

    return {
        "status": "success",
        "data": filtered,
        "row_count": len(filtered),
        "success_count": len(filtered),
    }


async def _transform_rename_fields(
    step_config: dict,
    ctx: PipelineContext,
    transform_config: dict,
) -> dict:
    """rename_fields: 按 rules 重命名字段。"""
    input_key = step_config.get("input_key", "")
    rules = transform_config.get("rules", [])

    key_clean = input_key.lstrip("${").rstrip("}")
    data = ctx.resolve_ref(input_key) or ctx.get(key_clean)
    if data is None:
        return {"status": "success", "data": [], "row_count": 0, "success_count": 0}

    if not isinstance(data, list):
        return {"status": "success", "data": [], "row_count": 0, "success_count": 0}

    rename_map = {r.get("source", ""): r.get("target", "") for r in rules}
    renamed = []
    for row in data:
        if isinstance(row, dict):
            new_row = {rename_map.get(k, k): v for k, v in row.items()}
            renamed.append(new_row)

    return {
        "status": "success",
        "data": renamed,
        "row_count": len(renamed),
        "success_count": len(renamed),
    }


async def _execute_notify_step(
    step_config: dict,
    ctx: PipelineContext,
    db: AsyncSession,
    trace_id: str,
    pipeline_run_id: str,
) -> dict:
    """执行 NOTIFY 步骤：发送通知。"""
    from app.ucp.notifier import send_pipeline_notification

    notify_config = step_config.get("config", {})
    result = await send_pipeline_notification(
        db, trace_id, pipeline_run_id, notify_config, ctx
    )
    return {
        "status": result.get("status", "success"),
        "row_count": 1,
        "success_count": result.get("success_count", 1),
        "failed_count": result.get("failed_count", 0),
    }


# ===== 失败项记录 =====

async def _record_loop_item(
    db: AsyncSession,
    trace_id: str,
    pipeline_run_id: str,
    step_run_id: str,
    connector_code: str,
    item_key: str,
    status: str,
    error_code: str | None = None,
    error_message: str | None = None,
    request_params_masked: dict | None = None,
) -> ConnectorLoopItemExecution:
    """记录 CONNECTOR_LOOP 中 item 级执行结果。"""
    item = ConnectorLoopItemExecution(
        trace_id=trace_id,
        pipeline_run_id=pipeline_run_id,
        step_run_id=step_run_id,
        connector_code=connector_code,
        item_key=item_key,
        status=status,
        request_params_masked=request_params_masked,
        error_code=error_code,
        error_message=error_message,
        last_failed_at=datetime.now(UTC) if status == "FAILED" else None,
    )
    db.add(item)
    await db.flush()
    return item


def mask_item_params(params: dict) -> dict:
    """对循环调用参数做脱敏，移除敏感字段值。"""
    from app.ucp.masking import mask_dict
    return mask_dict(params)


# ===== Phase 4: BRANCH / WAIT / APPROVAL 节点执行 =====

async def _execute_branch_step(
    step_config: dict,
    ctx: PipelineContext,
    db: AsyncSession,
) -> dict:
    """执行 BRANCH 步骤：根据条件表达式路由到不同分支。

    step_config 结构：
      - condition: 条件表达式字符串，如 "ctx.stats.step_1.status == 'success'"
      - true_branch: 条件为真时执行的步骤列表（可选）
      - false_branch: 条件为假时执行的步骤列表（可选）
    """
    condition = step_config.get("condition", "")
    branch_result = True  # 默认走 true 分支

    if condition:
        try:
            # 安全评估：只允许访问 ctx 对象
            safe_globals = {"__builtins__": {}, "ctx": ctx}
            branch_result = bool(eval(condition, safe_globals))
        except Exception as e:
            logger.warning("BRANCH condition eval failed: %s → %s", condition, e)
            branch_result = False

    branch_key = "true_branch" if branch_result else "false_branch"
    branch_steps = step_config.get(branch_key, [])
    results = []
    for sub_step in branch_steps:
        # 子步骤在分支上下文中顺序执行
        sub_result = await _execute_step(sub_step, ctx, db, ctx.trace_id, ctx.pipeline_run_id, f"{ctx.pipeline_run_id}_branch")
        results.append(sub_result)

    return {
        "status": "success",
        "branch_taken": branch_key,
        "condition": condition,
        "condition_result": branch_result,
        "branch_steps_executed": len(results),
    }


async def _execute_wait_step(
    step_config: dict,
    ctx: PipelineContext,
    db: AsyncSession,
) -> dict:
    """执行 WAIT 步骤：暂停指定时长。

    step_config 结构：
      - wait_type: "fixed"（固定时长）| "until"（等到指定时间）| "event"（等待事件）
      - wait_duration_seconds: 等待秒数（fixed 模式）
      - wait_until_iso: ISO 时间字符串（until 模式）
    """
    import asyncio

    wait_type = step_config.get("wait_type", "fixed")
    seconds = 0

    if wait_type == "fixed":
        seconds = int(step_config.get("wait_duration_seconds", 0) or 0)
    elif wait_type == "until":
        from datetime import datetime as dt
        until_str = step_config.get("wait_until_iso", "")
        if until_str:
            try:
                target = dt.fromisoformat(until_str.replace("Z", "+00:00"))
                now = dt.now(UTC)
                delta = (target - now).total_seconds()
                seconds = max(0, int(delta))
            except Exception:
                seconds = 0
    elif wait_type == "event":
        seconds = 0  # 事件等待由外部调度器处理，此处不阻塞

    seconds = min(seconds, 3600)  # 最多等 1 小时
    if seconds > 0:
        logger.info("WAIT step: sleeping %d seconds", seconds)
        await asyncio.sleep(seconds)

    return {
        "status": "success",
        "wait_type": wait_type,
        "waited_seconds": seconds,
    }


async def _execute_approval_step(
    step_config: dict,
    ctx: PipelineContext,
    db: AsyncSession,
    trace_id: str,
    pipeline_run_id: str,
) -> dict:
    """执行 APPROVAL 步骤：创建审批请求并挂起流水线。

    step_config 结构：
      - approvers: 审批人列表 [{user_id, user_name}]
      - approval_mode: "SINGLE" | "ANY" | "ALL"
      - reason: 审批原因
      - action_summary: 审批动作摘要
    """
    from app.ucp.approval_service import create_approval_request

    approvers = step_config.get("approvers", [])
    if not approvers:
        return {"status": "success", "skipped": True, "reason": "no approvers configured"}

    try:
        approval = await create_approval_request(
            db=db,
            business_type="pipeline_step",
            business_key=f"{pipeline_run_id}:{step_config.get('step_id', '')}",
            business_summary=step_config.get("action_summary", f"Pipeline {trace_id} 审批"),
            action=step_config.get("action", "APPROVE"),
            action_payload={
                "pipeline_run_id": pipeline_run_id,
                "trace_id": trace_id,
                "step_config": step_config,
            },
            approvers=approvers,
            approval_mode=step_config.get("approval_mode", "SINGLE"),
            reason=step_config.get("reason", ""),
            pipeline_run_id=pipeline_run_id,
        )
        return {
            "status": "waiting_approval",
            "approval_id": approval.id,
            "approval_request_code": approval.request_code,
            "approvers": approvers,
        }
    except Exception as e:
        logger.warning("APPROVAL step creation failed: %s", e)
        return {"status": "success", "skipped": True, "reason": f"approval creation failed: {e}"}


# ===== Phase 2-4: 手动触发并发互斥与权限校验 =====

class PipelineLockedError(Exception):
    """Pipeline 正在运行中，禁止并发触发。"""
    def __init__(self, pipeline_code: str, running_run_id: str | None = None):
        self.code = "PIPELINE_LOCKED"
        self.pipeline_code = pipeline_code
        self.running_run_id = running_run_id
        msg = f"Pipeline '{pipeline_code}' 正在执行中"
        if running_run_id:
            msg += f" (run_id={running_run_id})"
        super().__init__(msg)


class PipelinePermissionError(Exception):
    """用户无触发此 Pipeline 的权限。"""
    def __init__(self, pipeline_code: str, user_id: int | str | None, reason: str = ""):
        self.code = "PIPELINE_TRIGGER_FORBIDDEN"
        self.pipeline_code = pipeline_code
        self.user_id = user_id
        self.reason = reason
        msg = f"用户 '{user_id}' 无权触发 Pipeline '{pipeline_code}'"
        if reason:
            msg += f"（{reason}）"
        super().__init__(msg)


async def check_pipeline_concurrent_lock(
    db: AsyncSession,
    pipeline_code: str,
) -> None:
    """检查同 pipeline_code 是否有 RUNNING 中的执行，有则抛 PipelineLockedError。

    规则：
      - 同一 pipeline_code 同时只允许 1 个 RUNNING 实例
      - PENDING 也算占用（PENDING 是被调度但未启动）
      - 调度器（trigger_type=SCHEDULED）与手动触发（MANUAL/API）都占用锁
    """
    stmt = (
        select(ConnectorPipelineExecution)
        .where(
            ConnectorPipelineExecution.pipeline_code == pipeline_code,
            ConnectorPipelineExecution.status.in_(["RUNNING", "PENDING"]),
        )
        .order_by(ConnectorPipelineExecution.started_at.desc())
        .limit(1)
    )
    running = (await db.execute(stmt)).scalar_one_or_none()
    if running is not None:
        raise PipelineLockedError(
            pipeline_code=pipeline_code,
            running_run_id=running.pipeline_run_id,
        )


async def check_pipeline_trigger_permission(
    db: AsyncSession,
    pipeline_code: str,
    user: Any,
) -> None:
    """校验用户是否有权触发指定 Pipeline。

    权限规则（任一满足即可）：
      1. 用户是系统管理员（user.is_admin == True）
      2. 用户拥有 datasource.ucp_executions 的 C 权限（创建执行）— 通过 require_op 入口已校验
      3. 用户是 Pipeline 的 owner（pl_config.created_by == str(user.id)）

    抛出：
      PipelinePermissionError - 无权
    """
    # 规则 1：系统管理员
    is_admin = bool(getattr(user, "is_admin", False) or getattr(user, "is_superuser", False))
    if is_admin:
        return

    # 规则 3：Pipeline owner
    stmt = select(ConnectorPipelineConfig).where(
        ConnectorPipelineConfig.pipeline_code == pipeline_code
    )
    pl_config = (await db.execute(stmt)).scalar_one_or_none()
    if pl_config is not None and pl_config.created_by is not None:
        if str(pl_config.created_by) == str(user.id):
            return

    # 否则拒绝
    raise PipelinePermissionError(
        pipeline_code=pipeline_code,
        user_id=getattr(user, "id", None),
        reason="非系统管理员且非 Pipeline owner",
    )


# ===== Phase 2-2: 步骤级重试与失败项重跑 =====

class RetryError(Exception):
    """重试操作的业务错误。"""
    def __init__(self, code: str, message: str):
        self.code = code
        self.message = message
        super().__init__(message)


async def retry_step(
    db: AsyncSession,
    pipeline_run_id: str,
    step_run_id: str,
    triggered_by: str | None = None,
) -> ConnectorPipelineStepExecution:
    """对单个失败步骤重新执行（Phase 2-2）。

    行为：
      1. 加载 pipeline_exec + step_exec
      2. 校验 step_exec.status ∈ {FAILED, PARTIAL_SUCCESS}
      3. 校验 pipeline_exec.status 允许重试（FAILED / PARTIAL_SUCCESS）
      4. 加载原 step_config（从 pipeline_config.steps 找到匹配 step_id 的）
      5. 复用 _execute_step 重新执行
      6. 更新 step_exec：retry_count+1, status, output_snapshot, 错误信息
      7. 重新统计 pipeline_exec 成功/失败步骤数
      8. 写一条 connector_execution_log

    不重试整条 pipeline，只重试单个步骤。

    Returns:
        更新后的 step_exec
    """
    # 1. 加载执行实例
    pipeline_exec = (
        await db.execute(
            select(ConnectorPipelineExecution).where(
                ConnectorPipelineExecution.pipeline_run_id == pipeline_run_id
            )
        )
    ).scalar_one_or_none()
    if pipeline_exec is None:
        raise RetryError("PIPELINE_NOT_FOUND", f"Pipeline 执行 {pipeline_run_id} 不存在")

    if pipeline_exec.status not in ("FAILED", "PARTIAL_SUCCESS"):
        raise RetryError(
            "PIPELINE_NOT_RETRYABLE",
            f"Pipeline 状态为 {pipeline_exec.status}，仅 FAILED/PARTIAL_SUCCESS 状态可重试步骤",
        )

    # 2. 加载步骤执行实例
    step_exec = (
        await db.execute(
            select(ConnectorPipelineStepExecution).where(
                ConnectorPipelineStepExecution.step_run_id == step_run_id,
                ConnectorPipelineStepExecution.pipeline_run_id == pipeline_run_id,
            )
        )
    ).scalar_one_or_none()
    if step_exec is None:
        raise RetryError("STEP_NOT_FOUND", f"步骤 {step_run_id} 不存在")

    if step_exec.status not in ("FAILED", "PARTIAL_SUCCESS"):
        raise RetryError(
            "STEP_NOT_RETRYABLE",
            f"步骤状态为 {step_exec.status}，仅 FAILED/PARTIAL_SUCCESS 状态可重试",
        )

    # 3. 加载 Pipeline 配置，找回原始 step_config
    pl_config = (
        await db.execute(
            select(ConnectorPipelineConfig).where(
                ConnectorPipelineConfig.pipeline_code == pipeline_exec.pipeline_code,
            )
        )
    ).scalar_one_or_none()
    if pl_config is None:
        raise RetryError("PIPELINE_CONFIG_NOT_FOUND", f"Pipeline 配置 {pipeline_exec.pipeline_code} 不存在")

    step_config = None
    for s in (pl_config.steps or []):
        if s.get("step_id") == step_exec.step_id:
            step_config = s
            break
    if step_config is None:
        raise RetryError(
            "STEP_CONFIG_NOT_FOUND",
            f"步骤配置 step_id={step_exec.step_id} 在 Pipeline 中未找到",
        )

    # 4. 复用 _execute_step 重新执行
    logger.info(
        "[ucp] retry step: pipeline_run_id=%s step_run_id=%s step_id=%s retry_count=%d",
        pipeline_run_id, step_run_id, step_exec.step_id, step_exec.retry_count,
    )

    # 构造一个简单的 ctx（仅 retry 不重建整个流水线上下文）
    from app.ucp.masking import mask_sensitive_fields
    ctx = PipelineContext(pipeline_exec.trace_id, pipeline_run_id)
    if pipeline_exec.context_summary:
        ctx._store.update(pipeline_exec.context_summary)

    step_start = time.monotonic()
    step_status = "SUCCESS"
    step_error = None
    result_summary: dict = {}

    try:
        # 生成新的 step_run_id 标识本次重试
        new_step_run_id = _gen_step_run_id(step_exec.step_id)
        result = await _execute_step(
            step_config, ctx, db, pipeline_exec.trace_id, pipeline_run_id, new_step_run_id
        )
        # 更新 context_summary（仅保留统计和样例，不含大体积数据）
        ctx.set(step_exec.step_id, result)
        pipeline_exec.context_summary = ctx.to_summary()
        ctx.stats[step_exec.step_id] = {
            "status": result.get("status", "success"),
            "row_count": result.get("row_count", 0),
            "success_count": result.get("success_count", 0),
            "failed_count": result.get("failed_count", 0),
        }

        # 构建 output_snapshot
        if isinstance(result, dict) and "data" in result:
            output_sample = mask_sensitive_fields(result.get("data", [])[:20])
            result_summary = {
                "row_count": result.get("row_count", 0),
                "success_count": result.get("success_count", 0),
                "failed_count": result.get("failed_count", 0),
                "sample": output_sample,
            }
        else:
            result_summary = {"note": "no data field"}

    except Exception as e:
        step_status = "FAILED"
        step_error = str(e)[:1000]
        logger.exception("[ucp] retry step failed: %s", e)

    # 5. 更新步骤执行实例
    step_exec.retry_count += 1
    step_exec.status = step_status
    step_exec.error_message = step_error
    step_exec.ended_at = datetime.now(UTC)
    step_exec.duration_ms = int((time.monotonic() - step_start) * 1000)
    if result_summary:
        step_exec.output_snapshot = result_summary
        step_exec.total_items = result_summary.get("row_count", 0)
        step_exec.success_items = result_summary.get("success_count", 0)
        step_exec.failed_items = result_summary.get("failed_count", 0)
    await db.flush()

    # 6. 重新统计 pipeline_exec 的成功/失败步骤
    all_steps = (
        await db.execute(
            select(ConnectorPipelineStepExecution).where(
                ConnectorPipelineStepExecution.pipeline_run_id == pipeline_run_id,
            )
        )
    ).scalars().all()
    success_count = sum(1 for s in all_steps if s.status == "SUCCESS")
    failed_count = sum(1 for s in all_steps if s.status == "FAILED")
    partial_count = sum(1 for s in all_steps if s.status == "PARTIAL_SUCCESS")

    pipeline_exec.success_steps = success_count
    pipeline_exec.failed_steps = failed_count

    # 7. 重新评估 pipeline_exec 整体状态
    if failed_count == 0 and partial_count == 0:
        pipeline_exec.status = "SUCCESS"
    elif failed_count == 0 and partial_count > 0:
        pipeline_exec.status = "PARTIAL_SUCCESS"
    else:
        # 仍有失败步骤，保持 PARTIAL_SUCCESS 或 FAILED
        # 区分：全步骤 FAILED → FAILED；部分失败 → PARTIAL_SUCCESS
        if failed_count == len(all_steps):
            pipeline_exec.status = "FAILED"
        else:
            pipeline_exec.status = "PARTIAL_SUCCESS"

    # 8. 写一条 connector_execution_log（标识为 retry）
    log_entry = ConnectorExecutionLog(
        trace_id=pipeline_exec.trace_id,
        connector_code=step_exec.connector_code,
        pipeline_code=pipeline_exec.pipeline_code,
        pipeline_run_id=pipeline_run_id,
        trigger_type="RETRY_STEP",
        status=step_status,
        executor="ucp_retry_step",
        data_source=step_exec.connector_code or step_exec.step_id,
        error_message=step_error,
        duration_ms=step_exec.duration_ms,
    )
    db.add(log_entry)

    await db.flush()

    logger.info(
        "[ucp] retry step done: pipeline_run_id=%s step_run_id=%s status=%s retry_count=%d pipeline_status=%s",
        pipeline_run_id, step_run_id, step_status, step_exec.retry_count, pipeline_exec.status,
    )
    return step_exec


async def retry_failed_items(
    db: AsyncSession,
    pipeline_run_id: str,
    triggered_by: str | None = None,
) -> dict:
    """对 CONNECTOR_LOOP 步骤的失败项重跑（Phase 2-2）。

    行为：
      1. 找到所有 is_retryable=1 且 status=FAILED 的 ConnectorLoopItemExecution
      2. 按 step_run_id 分组
      3. 对每个 step 加载连接器配置 + 凭证
      4. 对每个失败 item 重新调用 adapter
      5. 成功：写入新 item 记录（status=SUCCESS），并将旧 item 标记 is_retryable=0（避免再次重跑）
      6. 失败：更新 retry_count+1, last_failed_at
      7. 更新对应 step_exec 的 success_items / failed_items 统计
      8. 重新评估 pipeline_exec 状态

    Returns:
        {
          total: 重跑总数,
          success_count: 成功数,
          failed_count: 失败数,
          skipped_count: 不可重跑数,
          details: [...],
        }
    """
    # 1. 加载 pipeline_exec
    pipeline_exec = (
        await db.execute(
            select(ConnectorPipelineExecution).where(
                ConnectorPipelineExecution.pipeline_run_id == pipeline_run_id
            )
        )
    ).scalar_one_or_none()
    if pipeline_exec is None:
        raise RetryError("PIPELINE_NOT_FOUND", f"Pipeline 执行 {pipeline_run_id} 不存在")

    # 2. 找到所有可重跑的失败项
    failed_items = (
        await db.execute(
            select(ConnectorLoopItemExecution).where(
                ConnectorLoopItemExecution.pipeline_run_id == pipeline_run_id,
                ConnectorLoopItemExecution.status == "FAILED",
                ConnectorLoopItemExecution.is_retryable == 1,
            )
        )
    ).scalars().all()

    if not failed_items:
        return {
            "total": 0,
            "success_count": 0,
            "failed_count": 0,
            "skipped_count": 0,
            "details": [],
            "message": "没有可重跑的失败项",
        }

    # 3. 按 step_run_id 分组
    from collections import defaultdict
    items_by_step: dict[str, list[ConnectorLoopItemExecution]] = defaultdict(list)
    for item in failed_items:
        items_by_step[item.step_run_id].append(item)

    # 4. 缓存连接器配置（避免重复查询）
    connector_cache: dict[str, tuple[ConnectorSystemConfig, dict[str, str]]] = {}

    async def _get_conn(connector_code: str) -> tuple[ConnectorSystemConfig, dict[str, str]]:
        if connector_code in connector_cache:
            return connector_cache[connector_code]
        conn_config = (
            await db.execute(
                select(ConnectorSystemConfig).where(
                    ConnectorSystemConfig.system_code == connector_code
                )
            )
        ).scalar_one_or_none()
        if conn_config is None:
            raise RetryError("CONNECTOR_NOT_FOUND", f"连接器 {connector_code} 不存在")
        secrets: dict[str, str] = {}
        if conn_config.credential_id:
            secrets = await decrypt_credential_secrets(db, conn_config.credential_id)
        connector_cache[connector_code] = (conn_config, secrets)
        return conn_config, secrets

    success_count = 0
    failed_count = 0
    details: list[dict] = []

    for step_run_id, step_failed_items in items_by_step.items():
        # 找到对应 step_exec
        step_exec = (
            await db.execute(
                select(ConnectorPipelineStepExecution).where(
                    ConnectorPipelineStepExecution.step_run_id == step_run_id
                )
            )
        ).scalar_one_or_none()
        if step_exec is None:
            logger.warning("[ucp] retry_failed_items: step_exec %s not found", step_run_id)
            continue

        if not step_exec.connector_code:
            logger.warning("[ucp] retry_failed_items: step %s has no connector_code", step_run_id)
            continue

        try:
            conn_config, secrets = await _get_conn(step_exec.connector_code)
        except RetryError as e:
            logger.warning("[ucp] retry_failed_items: %s", e.message)
            continue

        from app.ucp.adapters import get_adapter
        adapter = get_adapter(conn_config.adapter_code or "")

        # 加载原始 step_config（用于取 item_key_field）
        pl_config = (
            await db.execute(
                select(ConnectorPipelineConfig).where(
                    ConnectorPipelineConfig.pipeline_code == pipeline_exec.pipeline_code,
                )
            )
        ).scalar_one_or_none()
        item_key_field = "application_id"
        if pl_config:
            for s in (pl_config.steps or []):
                if s.get("step_id") == step_exec.step_id:
                    item_key_field = s.get("item_key_field", "application_id")
                    break

        # 累计本次重跑结果
        step_success = 0
        step_failed = 0
        for item in step_failed_items:
            params = dict(conn_config.protocol or {})
            params.update(conn_config.report_config or {})
            params[item_key_field] = item.item_key
            try:
                result: AdapterResult = await adapter(params, secrets, db)
                if result.status == "success":
                    # 成功：写入新 item 记录，旧 item 标记 is_retryable=0
                    new_item = ConnectorLoopItemExecution(
                        trace_id=pipeline_exec.trace_id,
                        pipeline_run_id=pipeline_run_id,
                        step_run_id=step_run_id,
                        connector_code=item.connector_code,
                        item_key=item.item_key,
                        status="SUCCESS",
                        request_params_masked=mask_item_params(params),
                        response_summary_masked={"row_count": result.row_count},
                        retry_count=item.retry_count + 1,
                        is_retryable=1,
                    )
                    db.add(new_item)
                    item.is_retryable = 0  # 旧 item 标记为不可重跑
                    item.retry_count += 1
                    success_count += 1
                    step_success += 1
                    details.append({
                        "item_key": item.item_key,
                        "status": "SUCCESS",
                        "step_run_id": step_run_id,
                    })
                else:
                    # 仍失败：更新 retry_count+1, last_failed_at
                    item.retry_count += 1
                    item.last_failed_at = datetime.now(UTC)
                    item.error_code = result.error_code
                    item.error_message = (result.error_message or "")[:500]
                    failed_count += 1
                    step_failed += 1
                    details.append({
                        "item_key": item.item_key,
                        "status": "FAILED",
                        "error_code": result.error_code,
                        "error_message": item.error_message,
                        "step_run_id": step_run_id,
                    })
            except Exception as e:
                item.retry_count += 1
                item.last_failed_at = datetime.now(UTC)
                item.error_message = str(e)[:500]
                failed_count += 1
                step_failed += 1
                details.append({
                    "item_key": item.item_key,
                    "status": "FAILED",
                    "error_message": item.error_message,
                    "step_run_id": step_run_id,
                })

        # 更新 step_exec 统计
        if step_exec.success_items is not None:
            step_exec.success_items += step_success
        if step_exec.failed_items is not None:
            # 失败的旧 item 不再算失败（因为本次重跑后重新评估了），所以减去 step_failed 中的"重跑仍失败"数
            # 实际语义：成功数增加，失败数保持不变
            pass

        # 更新 step_exec 状态
        if step_success > 0:
            step_exec.status = "PARTIAL_SUCCESS" if step_failed > 0 else "SUCCESS"
            step_exec.error_message = None  # 清空旧错误
        await db.flush()

    # 5. 重新评估 pipeline_exec 状态
    all_steps = (
        await db.execute(
            select(ConnectorPipelineStepExecution).where(
                ConnectorPipelineStepExecution.pipeline_run_id == pipeline_run_id,
            )
        )
    ).scalars().all()
    success_steps = sum(1 for s in all_steps if s.status == "SUCCESS")
    failed_steps = sum(1 for s in all_steps if s.status == "FAILED")
    partial_steps = sum(1 for s in all_steps if s.status == "PARTIAL_SUCCESS")

    pipeline_exec.success_steps = success_steps
    pipeline_exec.failed_steps = failed_steps

    if failed_steps == 0 and partial_steps == 0:
        pipeline_exec.status = "SUCCESS"
    elif failed_steps == 0 and partial_steps > 0:
        pipeline_exec.status = "PARTIAL_SUCCESS"
    else:
        if failed_steps == len(all_steps):
            pipeline_exec.status = "FAILED"
        else:
            pipeline_exec.status = "PARTIAL_SUCCESS"

    # 6. 写一条 retry 执行日志
    log_entry = ConnectorExecutionLog(
        trace_id=pipeline_exec.trace_id,
        pipeline_code=pipeline_exec.pipeline_code,
        pipeline_run_id=pipeline_run_id,
        trigger_type="RETRY_ITEMS",
        status="SUCCESS" if failed_count == 0 else "PARTIAL_SUCCESS",
        executor="ucp_retry_items",
        data_source=pipeline_exec.pipeline_code,
        record_count=len(failed_items),
        success_count=success_count,
        failed_count=failed_count,
    )
    db.add(log_entry)

    await db.flush()

    logger.info(
        "[ucp] retry_failed_items done: pipeline_run_id=%s total=%d success=%d failed=%d pipeline_status=%s",
        pipeline_run_id, len(failed_items), success_count, failed_count, pipeline_exec.status,
    )

    return {
        "total": len(failed_items),
        "success_count": success_count,
        "failed_count": failed_count,
        "skipped_count": 0,
        "details": details,
        "pipeline_status": pipeline_exec.status,
    }


# ===== 执行日志 =====

async def _write_execution_log(
    db: AsyncSession,
    trace_id: str,
    pipeline_code: str,
    pipeline_run_id: str,
    status: str,
    ctx: PipelineContext,
    trigger_type: str,
) -> ConnectorExecutionLog:
    """写连接器执行日志（pipeline 整体级别）。"""
    log = ConnectorExecutionLog(
        trace_id=trace_id,
        pipeline_code=pipeline_code,
        pipeline_run_id=pipeline_run_id,
        trigger_type=trigger_type,
        status=status,
        executor="ucp_pipeline",
        data_source=pipeline_code,
    )
    # 从 context 填充统计
    for step_id, stats in ctx.stats.items():
        if "row_count" in stats:
            log.record_count = stats.get("row_count", 0)
            log.success_count = stats.get("success_count", 0)
            log.failed_count = stats.get("failed_count", 0)
            break  # 取最后一个有统计的步骤

    db.add(log)
    await db.flush()
    return log


async def _write_connector_execution_log(
    db: AsyncSession,
    trace_id: str,
    connector_code: str,
    result: AdapterResult,
    trigger_type: str,
) -> ConnectorExecutionLog:
    """写单个连接器执行日志。"""
    from app.ucp.masking import mask_dict

    log = ConnectorExecutionLog(
        trace_id=trace_id,
        connector_code=connector_code,
        trigger_type=trigger_type,
        status=result.status,
        record_count=result.row_count,
        success_count=result.success_count,
        failed_count=result.failed_count,
        error_message=result.error_message,
        executor="ucp_adapter",
        data_source=connector_code,
        request_body_masked=mask_dict(result.extra) if result.extra else None,
    )
    db.add(log)
    await db.flush()
    return log


async def _write_circuit_blocked_log(
    db: AsyncSession,
    trace_id: str,
    connector_code: str,
    error_code: str,
    error_message: str,
) -> None:
    """Phase 2-9：写一条熔断/限流拦截日志（便于审计和排查）。"""
    log = ConnectorExecutionLog(
        trace_id=trace_id,
        connector_code=connector_code,
        trigger_type="circuit_blocked",
        status="blocked",
        record_count=0,
        success_count=0,
        failed_count=0,
        error_message=f"[{error_code}] {(error_message or '')[:480]}",
        executor="ucp_circuit_breaker",
        data_source=connector_code,
    )
    db.add(log)
    await db.flush()


# ===== 通知 =====

async def _send_pipeline_notification(
    db: AsyncSession,
    pipeline_code: str,
    pipeline_run_id: str,
    trace_id: str,
    overall_status: str,
    ctx: PipelineContext,
    pl_config: ConnectorPipelineConfig,
) -> None:
    """发送流水线级执行结果通知。

    Phase 2-3 增强：
      - PARTIAL 状态下附带 severity（WARNING / CRITICAL）
      - 严重度 CRITICAL 时升级通知接收人（@HRVP）
    """
    from app.ucp.notifier import send_pipeline_notification

    notify_config = pl_config.notification_config
    if not notify_config or not notify_config.get("enabled"):
        logger.info("[ucp] pipeline notification disabled for %s", pipeline_code)
        return

    # Phase 2-3：根据严重度决定通知升级
    pipeline_severity = (ctx.to_summary() or {}).get("partial_severity") or {}
    severity = pipeline_severity.get("severity", "NONE") if overall_status == "PARTIAL_SUCCESS" else "NONE"

    if severity == PARTIAL_SEVERITY_CRITICAL:
        # CRITICAL：升级接收人
        if not notify_config.get("escalation_chat_ids"):
            notify_config = dict(notify_config)
            notify_config["escalation_chat_ids"] = notify_config.get("escalation_chat_ids") or []
        logger.warning(
            "[ucp] CRITICAL partial pipeline %s run=%s failed=%s severity=%s",
            pipeline_code, pipeline_run_id,
            pipeline_severity.get("total_failed"),
            pipeline_severity.get("label"),
        )

    try:
        await send_pipeline_notification(
            db, trace_id, pipeline_run_id, notify_config, ctx,
            overall_status=overall_status,
            partial_severity=pipeline_severity if overall_status == "PARTIAL_SUCCESS" else None,
        )
    except Exception:
        logger.exception("[ucp] pipeline notification failed for %s", pipeline_code)
