"""UCP 资源测试引擎 (Phase 2-1)

实现 spec §8.5 的 4 类测试：
  - AUTH：认证测试（验证凭证有效性）
  - CONNECTIVITY：连通性测试（验证目标接口可访问）
  - PREVIEW：预览测试（拉取少量样本数据但不写入）
  - PUSH_SIMULATION：推送模拟（模拟推送不真落地）

设计目标：
  - 资源首次启用前必须测试通过
  - 测试数据自动脱敏
  - 测试日志保留（每次测试都记录到 ucp_test_log）
  - 测试失败记录错误原因
  - 测试结果更新到 ucp_system_config.test_status / test_result / test_time

测试入口：
  - run_resource_test(db, resource_code, test_type, tested_by)
  - 业务层调用：每个 adapter_code 对应一种测试执行逻辑
"""
from __future__ import annotations

import asyncio
import logging
import time
from datetime import datetime, UTC
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.ucp.adapters import get_adapter
from app.ucp.credential_service import decrypt_credential_secrets
from app.ucp.masking import mask_sensitive_fields
from app.ucp.models import (
    UcpSystemConfig,
    UcpTestLog,
)

logger = logging.getLogger("ucp.test_engine")


# ===== 测试类型常量 =====

TEST_TYPE_AUTH = "AUTH"
TEST_TYPE_CONNECTIVITY = "CONNECTIVITY"
TEST_TYPE_PREVIEW = "PREVIEW"
TEST_TYPE_PUSH_SIMULATION = "PUSH_SIMULATION"

ALL_TEST_TYPES = [
    TEST_TYPE_AUTH,
    TEST_TYPE_CONNECTIVITY,
    TEST_TYPE_PREVIEW,
    TEST_TYPE_PUSH_SIMULATION,
]

# 测试类型 → 中文标签
TEST_TYPE_LABELS = {
    TEST_TYPE_AUTH: "认证测试",
    TEST_TYPE_CONNECTIVITY: "连通性测试",
    TEST_TYPE_PREVIEW: "预览测试",
    TEST_TYPE_PUSH_SIMULATION: "推送模拟",
}

# 测试状态
TEST_STATUS_PASSED = "PASSED"
TEST_STATUS_FAILED = "FAILED"
TEST_STATUS_WARNING = "WARNING"


# ===== 错误码 =====

class TestEngineError(Exception):
    """测试引擎异常。"""
    def __init__(self, error_code: str, message: str):
        self.error_code = error_code
        self.message = message
        super().__init__(f"[{error_code}] {message}")


# ===== 主入口 =====

async def run_resource_test(
    db: AsyncSession,
    resource_code: str,
    test_type: str,
    tested_by: str | None = None,
    preview_row_limit: int = 10,
) -> UcpTestLog:
    """运行单次资源测试。

    流程：
      1. 加载系统配置
      2. 解密凭证
      3. 根据 test_type 调用对应测试执行函数
      4. 记录测试日志（ucp_test_log）
      5. 更新资源最新测试状态（test_status / test_result / test_time）

    Returns:
        UcpTestLog: 测试日志行
    """
    if test_type not in ALL_TEST_TYPES:
        raise TestEngineError("INVALID_TEST_TYPE", f"不支持的测试类型: {test_type}")

    # 1. 加载系统配置
    conn = await _load_system_config(db, resource_code)

    # 2. 解密凭证
    secrets: dict[str, str] = {}
    if conn.credential_id:
        secrets = await decrypt_credential_secrets(db, conn.credential_id)

    # 3. 构造测试参数（应用 test_config 覆盖）
    test_config = conn.test_config or {}
    if test_type == TEST_TYPE_PREVIEW:
        # 预览测试用 test_config.preview_row_limit
        preview_row_limit = int(test_config.get("preview_row_limit", preview_row_limit))

    # 4. 执行测试
    started_at = datetime.now(UTC)
    start_mono = time.monotonic()
    try:
        result = await _execute_test(
            db, conn, test_type, secrets, preview_row_limit
        )
        duration_ms = int((time.monotonic() - start_mono) * 1000)

        # 5. 写测试日志
        log = await _write_test_log(
            db=db,
            conn=conn,
            test_type=test_type,
            status=result["status"],
            duration_ms=duration_ms,
            request_params_masked=result.get("request_params_masked"),
            response_sample=result.get("response_sample"),
            error_code=result.get("error_code"),
            error_message=result.get("error_message"),
            tested_by=tested_by,
        )

        # 6. 更新资源最新测试状态
        await _update_resource_test_status(
            db, conn, result["status"], result, duration_ms
        )

        logger.info(
            "[ucp.test] %s test for %s: status=%s duration=%dms",
            test_type, resource_code, result["status"], duration_ms,
        )
        return log

    except TestEngineError as e:
        duration_ms = int((time.monotonic() - start_mono) * 1000)
        log = await _write_test_log(
            db=db,
            conn=conn,
            test_type=test_type,
            status=TEST_STATUS_FAILED,
            duration_ms=duration_ms,
            error_code=e.error_code,
            error_message=e.message,
            tested_by=tested_by,
        )
        await _update_resource_test_status(
            db, conn, TEST_STATUS_FAILED,
            {"error_code": e.error_code, "error_message": e.message}, duration_ms,
        )
        logger.warning(
            "[ucp.test] %s test FAILED for %s: %s - %s",
            test_type, resource_code, e.error_code, e.message,
        )
        return log

    except Exception as e:
        duration_ms = int((time.monotonic() - start_mono) * 1000)
        err_msg = str(e)[:500]
        log = await _write_test_log(
            db=db,
            conn=conn,
            test_type=test_type,
            status=TEST_STATUS_FAILED,
            duration_ms=duration_ms,
            error_code="UNEXPECTED_ERROR",
            error_message=err_msg,
            tested_by=tested_by,
        )
        await _update_resource_test_status(
            db, conn, TEST_STATUS_FAILED,
            {"error_code": "UNEXPECTED_ERROR", "error_message": err_msg}, duration_ms,
        )
        logger.exception("[ucp.test] %s test ERROR for %s", test_type, resource_code)
        return log


async def run_all_tests(
    db: AsyncSession,
    resource_code: str,
    tested_by: str | None = None,
) -> list[UcpTestLog]:
    """一次性跑完 4 类测试，返回日志列表。"""
    logs = []
    for test_type in ALL_TEST_TYPES:
        log = await run_resource_test(db, resource_code, test_type, tested_by=tested_by)
        logs.append(log)
    return logs


# ===== 内部：加载和解密 =====

async def _load_system_config(db: AsyncSession, resource_code: str) -> UcpSystemConfig:
    conn = (
        await db.execute(
            select(UcpSystemConfig).where(
                UcpSystemConfig.system_code == resource_code,
            )
        )
    ).scalar_one_or_none()
    if conn is None:
        raise TestEngineError("CONNECTOR_NOT_FOUND", f"资源 '{resource_code}' 不存在")
    return conn


# ===== 内部：测试分发 =====

async def _execute_test(
    db: AsyncSession,
    conn: UcpSystemConfig,
    test_type: str,
    secrets: dict[str, str],
    preview_row_limit: int,
) -> dict[str, Any]:
    """根据 test_type 分发到具体测试逻辑。"""
    if test_type == TEST_TYPE_AUTH:
        return await _test_auth(db, conn, secrets)
    elif test_type == TEST_TYPE_CONNECTIVITY:
        return await _test_connectivity(db, conn, secrets)
    elif test_type == TEST_TYPE_PREVIEW:
        return await _test_preview(db, conn, secrets, preview_row_limit)
    elif test_type == TEST_TYPE_PUSH_SIMULATION:
        return await _test_push_simulation(db, conn, secrets)
    else:
        raise TestEngineError("INVALID_TEST_TYPE", f"不支持的测试类型: {test_type}")


# ===== 各类测试实现 =====

async def _test_auth(
    db: AsyncSession,
    conn: UcpSystemConfig,
    secrets: dict[str, str],
) -> dict[str, Any]:
    """认证测试：检查凭证解密成功 + 必填字段非空。"""
    if not conn.credential_id:
        return {
            "status": TEST_STATUS_WARNING,
            "error_code": "NO_CREDENTIAL",
            "error_message": "资源未配置凭证，跳过认证测试",
            "request_params_masked": {"has_credential": False},
            "response_sample": None,
        }

    if not secrets:
        return {
            "status": TEST_STATUS_FAILED,
            "error_code": "CREDENTIAL_DECRYPT_FAILED",
            "error_message": "凭证解密后为空",
            "request_params_masked": {"credential_id": conn.credential_id},
            "response_sample": None,
        }

    # 检查协议配置存在
    if not conn.protocol:
        return {
            "status": TEST_STATUS_FAILED,
            "error_code": "MISSING_PROTOCOL",
            "error_message": "资源未配置 protocol (URL/参数模板)",
            "request_params_masked": {"credential_id": conn.credential_id, "secret_keys": list(secrets.keys())},
            "response_sample": None,
        }

    return {
        "status": TEST_STATUS_PASSED,
        "request_params_masked": {
            "credential_id": conn.credential_id,
            "secret_keys": sorted(secrets.keys()),
            "protocol_keys": sorted((conn.protocol or {}).keys()),
        },
        "response_sample": {
            "credential_valid": True,
            "secrets_count": len(secrets),
        },
    }


async def _test_connectivity(
    db: AsyncSession,
    conn: UcpSystemConfig,
    secrets: dict[str, str],
) -> dict[str, Any]:
    """连通性测试：调用 adapter 的 fetch 拉取一行以验证可达性。"""
    if not conn.adapter_code:
        return {
            "status": TEST_STATUS_FAILED,
            "error_code": "NO_ADAPTER",
            "error_message": "资源未配置 adapter_code，无法执行连通性测试",
        }

    params = _build_test_params(conn)
    try:
        adapter = get_adapter(conn.adapter_code)
    except RuntimeError as e:
        return {
            "status": TEST_STATUS_FAILED,
            "error_code": "ADAPTER_NOT_REGISTERED",
            "error_message": str(e),
        }

    # 设置小数据量拉取以加快测试
    if "page_size" in params:
        params["page_size"] = 1
    if "limit" in params:
        params["limit"] = 1

    try:
        result = await adapter(params, secrets, db)
    except Exception as e:
        return {
            "status": TEST_STATUS_FAILED,
            "error_code": "CONNECTIVITY_ERROR",
            "error_message": f"调用外部接口失败: {str(e)[:300]}",
            "request_params_masked": _mask_params_for_log(params),
        }

    if result.status == "failed":
        return {
            "status": TEST_STATUS_FAILED,
            "error_code": result.error_code or "ADAPTER_FAILED",
            "error_message": result.error_message or "适配器执行失败",
            "request_params_masked": _mask_params_for_log(params),
        }

    return {
        "status": TEST_STATUS_PASSED,
        "request_params_masked": _mask_params_for_log(params),
        "response_sample": {
            "adapter_status": result.status,
            "row_count": result.row_count,
            "sample_keys": sorted(result.data[0].keys()) if result.data else [],
        },
    }


async def _test_preview(
    db: AsyncSession,
    conn: UcpSystemConfig,
    secrets: dict[str, str],
    row_limit: int,
) -> dict[str, Any]:
    """预览测试：拉取少量数据但不写入目标表，返回脱敏样本。"""
    if not conn.adapter_code:
        return {
            "status": TEST_STATUS_FAILED,
            "error_code": "NO_ADAPTER",
            "error_message": "资源未配置 adapter_code，无法执行预览测试",
        }

    params = _build_test_params(conn)
    # 强制小数据量
    if "page_size" in params:
        params["page_size"] = row_limit
    if "limit" in params:
        params["limit"] = row_limit

    try:
        adapter = get_adapter(conn.adapter_code)
    except RuntimeError as e:
        return {
            "status": TEST_STATUS_FAILED,
            "error_code": "ADAPTER_NOT_REGISTERED",
            "error_message": str(e),
        }

    try:
        result = await adapter(params, secrets, db)
    except Exception as e:
        return {
            "status": TEST_STATUS_FAILED,
            "error_code": "PREVIEW_ERROR",
            "error_message": f"预览拉取失败: {str(e)[:300]}",
            "request_params_masked": _mask_params_for_log(params),
        }

    if result.status == "failed":
        return {
            "status": TEST_STATUS_FAILED,
            "error_code": result.error_code or "ADAPTER_FAILED",
            "error_message": result.error_message or "预览失败",
            "request_params_masked": _mask_params_for_log(params),
        }

    # 脱敏样本
    sample_rows = result.data[:row_limit] if result.data else []
    masked_sample = mask_sensitive_fields(sample_rows) if sample_rows else []

    if not masked_sample:
        # 没数据也算 PASSED 但 WARNING
        return {
            "status": TEST_STATUS_WARNING,
            "error_code": "EMPTY_RESULT",
            "error_message": "适配器返回空数据，可能是上游暂无数据",
            "request_params_masked": _mask_params_for_log(params),
            "response_sample": {
                "row_count": 0,
                "sample": [],
            },
        }

    return {
        "status": TEST_STATUS_PASSED,
        "request_params_masked": _mask_params_for_log(params),
        "response_sample": {
            "row_count": len(masked_sample),
            "sample": masked_sample,
            "sample_keys": sorted(masked_sample[0].keys()) if masked_sample else [],
        },
    }


async def _test_push_simulation(
    db: AsyncSession,
    conn: UcpSystemConfig,
    secrets: dict[str, str],
) -> dict[str, Any]:
    """推送模拟测试：模拟推送不真落地，返回 payload 摘要。

    Phase 2-8 增强实现：
      1. 校验资源方向/协议/适配器配置
      2. 如果资源 adapter_code = PUSH_TARGET_BRIDGE_ADAPTER 且 params 包含 push_target_id：
         - 从 push_target.source_table 拉取样本行数 + 前 N 行（脱敏）
         - 构造模拟 payload 摘要（目标系统、字段映射、样本行数）
         - **不调用 execute_push，仅 SELECT 验证数据可拉取**
      3. 如果是其他 OUTBOUND 适配器：
         - 基于 protocol + mapping_config 构造 payload 摘要模板
      4. 返回 simulated_rows / payload_summary / target_system，标记 simulation=True

    Returns:
        dict: 包含 status / request_params_masked / response_sample
    """
    if conn.direction not in ("OUTBOUND", "BI_DIRECTIONAL"):
        return {
            "status": TEST_STATUS_WARNING,
            "error_code": "NOT_PUSH_CONNECTOR",
            "error_message": f"资源方向为 {conn.direction}，不是推送类型，跳过推送模拟",
        }

    if not conn.protocol:
        return {
            "status": TEST_STATUS_FAILED,
            "error_code": "MISSING_PROTOCOL",
            "error_message": "推送类资源缺少 protocol 配置（URL/请求模板）",
        }

    if not conn.adapter_code:
        return {
            "status": TEST_STATUS_FAILED,
            "error_code": "NO_ADAPTER",
            "error_message": "推送类资源缺少 adapter_code",
        }

    protocol = conn.protocol or {}
    mapping_config = conn.mapping_config or {}
    params = _build_test_params(conn)

    # 1) 优先：PUSH_TARGET_BRIDGE_ADAPTER → 从 push_target 拉样本
    if conn.adapter_code == "PUSH_TARGET_BRIDGE_ADAPTER":
        return await _simulate_via_push_target(
            db, conn, protocol, mapping_config, params
        )

    # 2) 其余 OUTBOUND：基于 mapping_config 构造 payload 摘要模板
    return await _simulate_via_protocol(
        db, conn, protocol, mapping_config, params
    )


async def _simulate_via_push_target(
    db: AsyncSession,
    conn: UcpSystemConfig,
    protocol: dict,
    mapping_config: dict,
    params: dict,
) -> dict[str, Any]:
    """推送模拟：从 push_target.source_table 拉样本行 + 构造 payload 摘要（不真落地）。"""
    from app.push.models import PushTarget
    from sqlalchemy import select, func, text

    push_target_id_raw = params.get("push_target_id")
    if push_target_id_raw is None:
        # 未指定 push_target → 用 protocol 自带的占位
        return _build_protocol_template_response(conn, protocol, mapping_config, params)

    try:
        push_target_id = int(push_target_id_raw)
    except (TypeError, ValueError):
        return {
            "status": TEST_STATUS_FAILED,
            "error_code": "INVALID_PARAM",
            "error_message": f"push_target_id 必须是整数，得到 {push_target_id_raw!r}",
        }

    pt = await db.get(PushTarget, push_target_id)
    if pt is None:
        return {
            "status": TEST_STATUS_FAILED,
            "error_code": "PUSH_TARGET_NOT_FOUND",
            "error_message": f"推送目标 #{push_target_id} 不存在或已被删除",
        }

    # 从 push_target.source_table 拉样本（仅 SELECT，不写）
    source_table = pt.source_table
    if not source_table:
        return {
            "status": TEST_STATUS_FAILED,
            "error_code": "MISSING_SOURCE_TABLE",
            "error_message": f"推送目标 '{pt.name}' 未配置 source_table",
        }

    sample_limit = 5
    simulated_rows = 0
    sample_payload: list[dict] = []
    payload_fields: list[str] = []

    try:
        # 用反引号包裹 table 防止保留字，source_table 是配置项已校验
        # 但仍做白名单校验：仅允许字母数字下划线点
        if not all(c.isalnum() or c in "._" for c in source_table):
            raise ValueError(f"source_table 含非法字符: {source_table!r}")

        count_stmt = text(f"SELECT COUNT(*) FROM `{source_table}`")
        count_res = await db.execute(count_stmt)
        simulated_rows = int(count_res.scalar() or 0)

        if simulated_rows > 0:
            sample_stmt = text(f"SELECT * FROM `{source_table}` LIMIT {sample_limit}")
            sample_res = await db.execute(sample_stmt)
            rows = sample_res.mappings().all()
            sample_payload = mask_sensitive_fields([dict(r) for r in rows])
            if sample_payload:
                payload_fields = sorted(sample_payload[0].keys())
    except Exception as e:
        return {
            "status": TEST_STATUS_FAILED,
            "error_code": "SOURCE_QUERY_FAILED",
            "error_message": f"查询源表 {source_table!r} 失败: {str(e)[:300]}",
            "request_params_masked": {
                "push_target_id": push_target_id,
                "source_table": source_table,
            },
        }

    # 构造 payload 摘要
    payload_summary = {
        "simulation": True,
        "would_push": True,
        "target_system": {
            "id": pt.id,
            "name": pt.name,
            "push_type": pt.push_type,
            "source_table": source_table,
        },
        "protocol_template": {
            "url": protocol.get("url") or protocol.get("webhook_url"),
            "method": protocol.get("method", "POST"),
            "headers_template": {
                k: v for k, v in protocol.items()
                if k.lower() in ("content-type", "authorization_template", "auth_type")
            },
        },
        "field_mapping": mapping_config.get("field_mapping", mapping_config),
        "payload_fields": payload_fields,
        "sample_count": len(sample_payload),
        "simulated_rows": simulated_rows,
        "simulated_status": "would_succeed" if simulated_rows > 0 else "would_succeed_empty",
        "note": "推送模拟未真正落地，仅预览 payload 摘要 + 样本行数",
    }

    if simulated_rows == 0:
        return {
            "status": TEST_STATUS_WARNING,
            "error_code": "EMPTY_SOURCE",
            "error_message": f"源表 {source_table!r} 当前无数据可推送",
            "request_params_masked": _mask_params_for_log(params),
            "response_sample": payload_summary,
        }

    return {
        "status": TEST_STATUS_PASSED,
        "request_params_masked": _mask_params_for_log(params),
        "response_sample": payload_summary,
    }


async def _simulate_via_protocol(
    db: AsyncSession,
    conn: UcpSystemConfig,
    protocol: dict,
    mapping_config: dict,
    params: dict,
) -> dict[str, Any]:
    """通用协议模拟：基于 protocol + mapping_config 构造 payload 摘要模板（无源表）。"""
    payload_summary = {
        "simulation": True,
        "would_push": True,
        "target_system": {
            "protocol": protocol.get("type") or conn.adapter_code,
            "url": protocol.get("url") or protocol.get("webhook_url"),
            "method": protocol.get("method", "POST"),
        },
        "protocol_template": {
            "url": protocol.get("url") or protocol.get("webhook_url"),
            "method": protocol.get("method", "POST"),
            "headers": protocol.get("headers", {}),
            "auth_type": protocol.get("auth_type"),
        },
        "field_mapping": mapping_config.get("field_mapping", mapping_config),
        "payload_template": mapping_config.get("payload_template"),
        "simulated_rows": 0,
        "simulated_status": "would_succeed",
        "note": "通用推送模拟：未指定 push_target，仅构造 payload 模板摘要",
    }

    return {
        "status": TEST_STATUS_PASSED,
        "request_params_masked": _mask_params_for_log(params),
        "response_sample": payload_summary,
    }


def _build_protocol_template_response(
    conn: UcpSystemConfig,
    protocol: dict,
    mapping_config: dict,
    params: dict,
) -> dict[str, Any]:
    """PUSH_TARGET_BRIDGE_ADAPTER 但缺 push_target_id 时的兜底。"""
    return {
        "status": TEST_STATUS_WARNING,
        "error_code": "MISSING_PUSH_TARGET_ID",
        "error_message": "PUSH_TARGET_BRIDGE_ADAPTER 需在 params 指定 push_target_id 才能模拟样本拉取",
        "request_params_masked": _mask_params_for_log(params),
        "response_sample": {
            "simulation": True,
            "protocol_template": {
                "url": protocol.get("url") or protocol.get("webhook_url"),
                "method": protocol.get("method", "POST"),
            },
            "field_mapping": mapping_config.get("field_mapping", mapping_config),
            "simulated_status": "would_succeed_template_only",
            "note": "未指定 push_target_id，仅返回 payload 模板摘要",
        },
    }


# ===== 内部：参数构造和脱敏 =====

def _build_test_params(conn: UcpSystemConfig) -> dict[str, Any]:
    """构造测试用的 adapter params，合并 protocol / report_config。"""
    params: dict[str, Any] = {}
    if conn.protocol:
        params.update(conn.protocol)
    if conn.report_config:
        params.update(conn.report_config)
    return params


def _mask_params_for_log(params: dict[str, Any]) -> dict[str, Any]:
    """对 params 做脱敏（用于日志存储）。"""
    try:
        return mask_sensitive_fields([params])[0]
    except Exception:
        # 脱敏失败时只保留 key，避免泄露明文
        return {k: "***" for k in params.keys()}


# ===== 内部：日志写入和状态更新 =====

async def _write_test_log(
    db: AsyncSession,
    conn: UcpSystemConfig,
    test_type: str,
    status: str,
    duration_ms: int,
    tested_by: str | None = None,
    request_params_masked: dict | None = None,
    response_sample: dict | None = None,
    error_code: str | None = None,
    error_message: str | None = None,
) -> UcpTestLog:
    """写 ucp_test_log 行。"""
    log = UcpTestLog(
        system_config_id=conn.id,
        resource_code=conn.system_code,
        test_type=test_type,
        status=status,
        duration_ms=duration_ms,
        request_params_masked=request_params_masked,
        response_sample=response_sample,
        error_code=error_code,
        error_message=error_message,
        tested_by=tested_by,
    )
    db.add(log)
    await db.flush()
    return log


async def _update_resource_test_status(
    db: AsyncSession,
    conn: UcpSystemConfig,
    status: str,
    result: dict[str, Any],
    duration_ms: int,
) -> None:
    """更新 ucp_system_config 的最新测试状态。"""
    from datetime import datetime, UTC

    test_result = {
        "status": status,
        "test_type": result.get("test_type", ""),
        "duration_ms": duration_ms,
        "error_code": result.get("error_code"),
        "error_message": result.get("error_message"),
        "response_sample": result.get("response_sample"),
        "tested_at": datetime.now(UTC).isoformat(),
    }
    # 直接更新字段
    conn.test_status = status
    conn.test_result = test_result
    conn.test_time = datetime.now(UTC)
    await db.flush()


# ===== 内部：查询测试历史 =====

async def list_test_history(
    db: AsyncSession,
    resource_code: str,
    limit: int = 20,
    test_type: str | None = None,
) -> list[dict]:
    """列出资源测试历史（按时间倒序）。"""
    stmt = select(UcpTestLog).where(UcpTestLog.resource_code == resource_code)
    if test_type:
        stmt = stmt.where(UcpTestLog.test_type == test_type)
    stmt = stmt.order_by(UcpTestLog.created_at.desc()).limit(limit)

    rows = (await db.execute(stmt)).scalars().all()
    return [
        {
            "id": log.id,
            "resource_code": log.resource_code,
            "test_type": log.test_type,
            "test_type_label": TEST_TYPE_LABELS.get(log.test_type, log.test_type),
            "status": log.status,
            "duration_ms": log.duration_ms,
            "error_code": log.error_code,
            "error_message": log.error_message,
            "tested_by": log.tested_by,
            "response_sample": log.response_sample,
            "created_at": log.created_at.isoformat() if log.created_at else None,
        }
        for log in rows
    ]


async def get_latest_test_per_type(
    db: AsyncSession,
    resource_code: str,
) -> dict[str, UcpTestLog | None]:
    """获取每个测试类型的最新一条日志。"""
    out: dict[str, UcpTestLog | None] = {t: None for t in ALL_TEST_TYPES}
    rows = (
        await db.execute(
            select(UcpTestLog)
            .where(UcpTestLog.resource_code == resource_code)
            .order_by(UcpTestLog.created_at.desc())
            .limit(100)
        )
    ).scalars().all()

    for log in rows:
        if out.get(log.test_type) is None:
            out[log.test_type] = log
    return out
