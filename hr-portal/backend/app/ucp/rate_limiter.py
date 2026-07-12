"""UCP 接口级 QPS 限流器 (Phase 2-9)

设计目标：
  - 基于滑动窗口的 QPS 限流
  - 支持按接口粒度限流（key = 接口路径 + 可选维度）
  - 单进程内存版（多 worker 部署需引入 Redis，集中时建议后续替换）
  - 限流命中返回 RateLimitError（包含 retry_after_seconds）

限流维度：
  - 路径级：`/ucp/resources/*` 整体限流
  - 资源级：单个 resource_code 限流（test/route/export 等高消耗接口）
  - 流水线级：单个 pipeline_code 限流（manual trigger）

限流配置（rate_limit_config JSON）：
  {
    "enabled": true,
    "qps": 5,                  # 每秒最多 N 次
    "burst": 10,               # 突发容量（令牌桶大小）
  }

调用方：
  - acquire(path_or_key, config) → 通过则返回；超限抛 RateLimitError
"""
from __future__ import annotations

import logging
import threading
import time
from collections import deque
from dataclasses import dataclass, field

logger = logging.getLogger("ucp.rate_limiter")

# ===== 默认配置 =====

DEFAULT_RL_CONFIG = {
    "enabled": False,
    "qps": 5,
    "burst": 10,
}


# ===== 异常 =====

class RateLimitError(Exception):
    """限流异常。"""
    def __init__(self, error_code: str, message: str, retry_after_seconds: float = 1.0):
        self.error_code = error_code
        self.message = message
        self.retry_after_seconds = max(0.1, retry_after_seconds)
        super().__init__(f"[{error_code}] {message}")


# ===== 滑动窗口限流器 =====

@dataclass
class _Bucket:
    """单个 key 的限流桶。"""
    timestamps: deque = field(default_factory=deque)
    last_acquire: float = 0.0


_lock = threading.Lock()
_buckets: dict[str, _Bucket] = {}


def _get_bucket(key: str) -> _Bucket:
    if key not in _buckets:
        _buckets[key] = _Bucket()
    return _buckets[key]


def acquire(key: str, config: dict | None) -> None:
    """获取一次调用许可。

    Args:
        key: 限流维度 key（如 "resource:BEISEN_HTTP"）
        config: 限流配置

    Raises:
        RateLimitError: 超过 QPS / 突发容量
    """
    cfg = _normalize_config(config)
    if not cfg["enabled"]:
        return

    qps = float(cfg["qps"])
    burst = float(cfg["burst"])
    now = time.monotonic()
    window = 1.0  # 1 秒窗口

    with _lock:
        bucket = _get_bucket(key)
        ts = bucket.timestamps

        # 弹出窗口外的旧时间戳
        while ts and ts[0] < now - window:
            ts.popleft()

        # 限流判断
        if len(ts) >= burst:
            # 已超过突发容量
            oldest = ts[0]
            retry_after = (oldest + window) - now
            raise RateLimitError(
                error_code="RATE_LIMIT_EXCEEDED",
                message=f"接口 {key} 触发限流（{qps} QPS，突发 {burst}），请稍后重试",
                retry_after_seconds=retry_after,
            )

        # 滑动窗口：1s 内已用 N 次 → 限制新请求
        if len(ts) >= qps:
            oldest = ts[0]
            retry_after = (oldest + window) - now
            if retry_after > 0:
                raise RateLimitError(
                    error_code="RATE_LIMIT_EXCEEDED",
                    message=f"接口 {key} 触发限流（{qps} QPS），请 {retry_after:.2f}s 后重试",
                    retry_after_seconds=retry_after,
                )

        # 通过
        ts.append(now)
        bucket.last_acquire = now


def get_bucket_stats(key: str) -> dict:
    """查询某个 key 的当前限流状态（最近 1s 内的调用次数）。"""
    with _lock:
        bucket = _get_bucket(key)
        now = time.monotonic()
        ts = bucket.timestamps
        recent = [t for t in ts if t >= now - 1.0]
        return {
            "key": key,
            "calls_in_last_second": len(recent),
            "last_acquire": bucket.last_acquire,
        }


def list_buckets() -> list[dict]:
    """列出所有有限流活动的 key。"""
    with _lock:
        keys = list(_buckets.keys())
    return [get_bucket_stats(k) for k in keys]


def reset_bucket(key: str) -> None:
    """重置某个 key 的限流计数（运维用）。"""
    with _lock:
        if key in _buckets:
            del _buckets[key]


def _normalize_config(config: dict | None) -> dict:
    if not config or not isinstance(config, dict):
        return dict(DEFAULT_RL_CONFIG)
    out = dict(DEFAULT_RL_CONFIG)
    out.update({k: v for k, v in config.items() if k in DEFAULT_RL_CONFIG})
    try:
        out["qps"] = float(out["qps"])
        out["burst"] = float(out["burst"])
    except (TypeError, ValueError):
        return dict(DEFAULT_RL_CONFIG)
    if out["burst"] < out["qps"]:
        out["burst"] = out["qps"]
    return out
