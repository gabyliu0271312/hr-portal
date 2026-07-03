"""UCP 连接器熔断器 (Phase 2-9)

设计目标：
  - 连续失败 N 次 → 自动打开熔断（OPEN）
  - 熔断后 X 分钟内拒绝调用
  - X 分钟后进入半开状态（HALF_OPEN），允许一次试探调用
  - 试探成功 → 关闭熔断（CLOSED）
  - 试探失败 → 重新打开
  - 状态写入内存（按 connector_code 隔离），可选择持久化到 connector_system_config.circuit_breaker_config

熔断配置（circuit_breaker_config JSON）：
  {
    "enabled": true,
    "failure_threshold": 5,        # 连续失败 N 次触发熔断
    "open_duration_seconds": 300,  # 熔断持续 X 秒（默认 5 分钟）
    "half_open_max_calls": 1,      # 半开状态允许的试探调用数
    "success_threshold": 3,        # 连续成功 N 次后真正关闭（可选）
  }

熔断状态（CircuitState）：
  - CLOSED：关闭（正常调用）
  - OPEN：打开（拒绝调用）
  - HALF_OPEN：半开（允许少量试探）

调用方：
  - 步骤执行前调用 check_circuit(connector_code) 判断是否允许调用
  - 调用成功后调用 record_success(connector_code)
  - 调用失败后调用 record_failure(connector_code, error)
"""
from __future__ import annotations

import logging
import threading
import time
from dataclasses import dataclass, field
from typing import Any

logger = logging.getLogger("ucp.circuit_breaker")

# ===== 熔断状态常量 =====

STATE_CLOSED = "CLOSED"
STATE_OPEN = "OPEN"
STATE_HALF_OPEN = "HALF_OPEN"

ALL_STATES = [STATE_CLOSED, STATE_OPEN, STATE_HALF_OPEN]

# 默认熔断配置
DEFAULT_CB_CONFIG = {
    "enabled": False,
    "failure_threshold": 5,
    "open_duration_seconds": 300,
    "half_open_max_calls": 1,
    "success_threshold": 3,
}


# ===== 异常 =====

class CircuitBreakerError(Exception):
    """熔断器异常。"""
    def __init__(self, error_code: str, message: str, retry_after_seconds: int = 0):
        self.error_code = error_code
        self.message = message
        self.retry_after_seconds = retry_after_seconds
        super().__init__(f"[{error_code}] {message}")


# ===== 内部状态 =====

@dataclass
class _CircuitState:
    """单个连接器的熔断状态。"""
    state: str = STATE_CLOSED
    consecutive_failures: int = 0
    consecutive_successes: int = 0
    open_at: float | None = None  # time.monotonic() when opened
    half_open_calls: int = 0
    last_error_code: str | None = None
    last_error_message: str | None = None
    last_state_change: float = field(default_factory=time.monotonic)


# ===== 内存状态注册表 =====

_lock = threading.Lock()
_states: dict[str, _CircuitState] = {}


def _get_state(connector_code: str) -> _CircuitState:
    """获取或初始化连接器状态。"""
    if connector_code not in _states:
        _states[connector_code] = _CircuitState()
    return _states[connector_code]


def get_circuit_state(connector_code: str) -> dict[str, Any]:
    """查询当前熔断状态（只读快照）。"""
    with _lock:
        s = _get_state(connector_code)
        snap = {
            "state": s.state,
            "consecutive_failures": s.consecutive_failures,
            "consecutive_successes": s.consecutive_successes,
            "half_open_calls": s.half_open_calls,
            "last_error_code": s.last_error_code,
            "last_error_message": s.last_error_message,
            "open_at": s.open_at,
            "open_remaining_seconds": _open_remaining_seconds(s),
        }
        return snap


def list_circuits() -> list[dict[str, Any]]:
    """列出所有有状态的熔断器。"""
    with _lock:
        codes = list(_states.keys())
    return [
        {"connector_code": code, **get_circuit_state(code)}
        for code in codes
    ]


def reset_circuit(connector_code: str) -> dict[str, Any]:
    """手动重置熔断器（运维用）。"""
    with _lock:
        if connector_code in _states:
            del _states[connector_code]
    logger.info("[ucp.cb] manually reset circuit for %s", connector_code)
    return get_circuit_state(connector_code)


def _open_remaining_seconds(s: _CircuitState, open_duration: int = 0) -> int:
    """计算熔断剩余时间（秒）。"""
    if s.state != STATE_OPEN or s.open_at is None:
        return 0
    elapsed = time.monotonic() - s.open_at
    remaining = int(open_duration - elapsed) if open_duration else 0
    return max(0, remaining)


# ===== 主入口：检查是否允许调用 =====

def check_circuit(connector_code: str, cb_config: dict | None) -> None:
    """调用前检查熔断器状态。

    Raises:
        CircuitBreakerError: 如果熔断器打开（OPEN）且未到恢复时间

    Side effects:
        - 如果从 OPEN 自动转 HALF_OPEN，更新状态
        - 如果 HALF_OPEN 允许试探，half_open_calls + 1
    """
    config = _normalize_config(cb_config)
    if not config["enabled"]:
        return  # 熔断未启用

    failure_threshold = config["failure_threshold"]
    open_duration = config["open_duration_seconds"]
    half_open_max = config["half_open_max_calls"]

    with _lock:
        s = _get_state(connector_code)

        if s.state == STATE_CLOSED:
            return  # 正常放行

        if s.state == STATE_OPEN:
            remaining = _open_remaining_seconds(s, open_duration)
            if remaining > 0:
                # 仍在熔断窗口
                raise CircuitBreakerError(
                    error_code="CIRCUIT_OPEN",
                    message=f"连接器 {connector_code} 处于熔断状态，{remaining}秒后自动恢复",
                    retry_after_seconds=remaining,
                )
            # 熔断窗口已过 → 转 HALF_OPEN
            _transition_to(s, STATE_HALF_OPEN, "窗口已过，进入半开状态")
            s.half_open_calls = 0
            # 继续走到 HALF_OPEN 处理

        if s.state == STATE_HALF_OPEN:
            if s.half_open_calls >= half_open_max:
                raise CircuitBreakerError(
                    error_code="CIRCUIT_HALF_OPEN_BUSY",
                    message=f"连接器 {connector_code} 半开状态已有 {s.half_open_calls} 个试探调用，请等待",
                    retry_after_seconds=5,
                )
            s.half_open_calls += 1
            return

        # 未知状态：保守拒绝
        raise CircuitBreakerError(
            error_code="CIRCUIT_UNKNOWN_STATE",
            message=f"连接器 {connector_code} 熔断状态异常: {s.state}",
            retry_after_seconds=60,
        )


def record_success(connector_code: str, cb_config: dict | None) -> dict[str, Any]:
    """记录一次成功调用。

    Returns:
        dict: 更新后的状态快照
    """
    config = _normalize_config(cb_config)
    if not config["enabled"]:
        return get_circuit_state(connector_code)

    success_threshold = config["success_threshold"]

    with _lock:
        s = _get_state(connector_code)
        s.consecutive_failures = 0
        s.consecutive_successes += 1
        s.last_error_code = None
        s.last_error_message = None

        if s.state == STATE_HALF_OPEN:
            if s.consecutive_successes >= success_threshold:
                _transition_to(s, STATE_CLOSED, "试探成功，关闭熔断")
            else:
                logger.debug(
                    "[ucp.cb] %s half_open success %d/%d",
                    connector_code, s.consecutive_successes, success_threshold,
                )
        # CLOSED 状态持续累计连续成功，但通常不需要
        return _snapshot(s)


def record_failure(
    connector_code: str,
    cb_config: dict | None,
    error_code: str | None = None,
    error_message: str | None = None,
) -> dict[str, Any]:
    """记录一次失败调用。

    Returns:
        dict: 更新后的状态快照
    """
    config = _normalize_config(cb_config)
    if not config["enabled"]:
        return get_circuit_state(connector_code)

    failure_threshold = config["failure_threshold"]

    with _lock:
        s = _get_state(connector_code)
        s.consecutive_successes = 0
        s.consecutive_failures += 1
        s.last_error_code = error_code
        s.last_error_message = (error_message or "")[:500]

        if s.state == STATE_HALF_OPEN:
            # 试探失败 → 重新打开
            _transition_to(s, STATE_OPEN, "半开试探失败，重新熔断")
            s.open_at = time.monotonic()
            s.half_open_calls = 0
        elif s.state == STATE_CLOSED:
            if s.consecutive_failures >= failure_threshold:
                _transition_to(s, STATE_OPEN, f"连续失败 {s.consecutive_failures} 次，触发熔断")
                s.open_at = time.monotonic()

        return _snapshot(s)


def _transition_to(s: _CircuitState, new_state: str, reason: str) -> None:
    """状态迁移。"""
    old_state = s.state
    s.state = new_state
    s.last_state_change = time.monotonic()
    logger.warning(
        "[ucp.cb] state transition: %s → %s (%s)", old_state, new_state, reason,
    )


def _snapshot(s: _CircuitState) -> dict[str, Any]:
    return {
        "state": s.state,
        "consecutive_failures": s.consecutive_failures,
        "consecutive_successes": s.consecutive_successes,
        "half_open_calls": s.half_open_calls,
        "last_error_code": s.last_error_code,
        "last_error_message": s.last_error_message,
        "open_at": s.open_at,
    }


def _normalize_config(cb_config: dict | None) -> dict:
    """归一化熔断配置，未配置则使用默认（但默认 enabled=False）。"""
    if not cb_config or not isinstance(cb_config, dict):
        return dict(DEFAULT_CB_CONFIG)
    out = dict(DEFAULT_CB_CONFIG)
    out.update({k: v for k, v in cb_config.items() if k in DEFAULT_CB_CONFIG})
    # 类型矫正
    try:
        out["failure_threshold"] = int(out["failure_threshold"])
        out["open_duration_seconds"] = int(out["open_duration_seconds"])
        out["half_open_max_calls"] = int(out["half_open_max_calls"])
        out["success_threshold"] = int(out["success_threshold"])
    except (TypeError, ValueError):
        return dict(DEFAULT_CB_CONFIG)
    return out
