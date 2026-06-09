from __future__ import annotations

import hashlib
import json
import time
import uuid
from dataclasses import dataclass, field
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.system.models import SystemLog
from app.users.models import User


def _hash_payload(payload: Any) -> str:
    raw = json.dumps(payload, ensure_ascii=False, sort_keys=True, default=str)
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


@dataclass
class TraceEvent:
    event: str
    status: str = "success"
    at_ms: int = 0
    data: dict[str, Any] = field(default_factory=dict)


class AiAuditTimer:
    def __init__(self) -> None:
        self.started = time.perf_counter()
        self.trace_id = uuid.uuid4().hex
        self.events: list[TraceEvent] = []

    def elapsed_ms(self) -> int:
        return int((time.perf_counter() - self.started) * 1000)

    def add_event(self, event: str, *, status: str = "success", **data: Any) -> None:
        self.events.append(
            TraceEvent(
                event=event,
                status=status,
                at_ms=self.elapsed_ms(),
                data={k: v for k, v in data.items() if v is not None},
            )
        )

    def event_payload(self) -> list[dict[str, Any]]:
        return [
            {
                "event": item.event,
                "status": item.status,
                "at_ms": item.at_ms,
                "data": item.data,
            }
            for item in self.events
        ]


async def record_ai_log(
    *,
    db: AsyncSession,
    user: User,
    action: str,
    request_summary: str | None,
    response_summary: str | None,
    input_payload: Any,
    output_payload: Any,
    status: str,
    metadata: dict[str, Any] | None = None,
    error: str | None = None,
    token_usage: dict[str, Any] | None = None,
    timer: AiAuditTimer | None = None,
) -> None:
    metadata_json = dict(metadata or {})
    if timer and timer.events:
        metadata_json["trace_events"] = timer.event_payload()
    db.add(
        SystemLog(
            category="ai_call",
            action=action,
            status=status,
            user_id=user.id,
            request_summary=request_summary,
            response_summary=response_summary,
            input_hash=_hash_payload(input_payload),
            output_hash=_hash_payload(output_payload),
            metadata_json=metadata_json,
            error=error,
            token_usage=token_usage,
            trace_id=timer.trace_id if timer else uuid.uuid4().hex,
            latency_ms=timer.elapsed_ms() if timer else None,
        )
    )
