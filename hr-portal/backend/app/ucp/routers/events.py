"""UCP events routes."""
from __future__ import annotations
import os
from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.deps import current_user, require_op
from app.core.db import get_session
from app.users.models import User
from app.ucp.models import UcpEventDefinition, UcpEventPayloadAccessAudit, UcpEventTrigger, UcpPipelineExecution, UcpPipelineTemplate, UcpResource, UcpResourceDataObject
router = APIRouter()


def _user_id(u) -> str:
    return u.username if hasattr(u, "username") else str(u.id)


def _lifecycle_direct_dispatch_enabled() -> bool:
    value = os.getenv("UCP_LIFECYCLE_DIRECT_DISPATCH_ENABLED", "true")
    return value.strip().lower() in {"1", "true", "yes", "on"}


def _mask_event_value(value):
    if isinstance(value, dict):
        return {
            key: "***" if any(word in key.lower() for word in ("secret", "token", "password", "signature", "authorization", "phone", "mobile", "salary")) else _mask_event_value(item)
            for key, item in value.items()
        }
    if isinstance(value, list):
        return [_mask_event_value(item) for item in value]
    return value


async def _source_chain(db: AsyncSession, event) -> dict:
    resource = await db.get(UcpResource, event.resource_id) if event.resource_id else None
    resource_object = await db.get(UcpResourceDataObject, event.resource_object_id) if event.resource_object_id else None
    definition = await db.get(UcpEventDefinition, event.event_definition_id) if event.event_definition_id else None
    trigger = await db.get(UcpEventTrigger, event.matched_trigger_id) if event.matched_trigger_id else None
    if trigger is None and event.matched_trigger_code:
        trigger = (await db.execute(select(UcpEventTrigger).where(UcpEventTrigger.trigger_code == event.matched_trigger_code))).scalar_one_or_none()
    execution = None
    if event.pipeline_run_id:
        execution = (await db.execute(select(UcpPipelineExecution).where(UcpPipelineExecution.pipeline_run_id == event.pipeline_run_id))).scalar_one_or_none()
    pipeline_code = (trigger.pipeline_code if trigger else None) or (execution.pipeline_code if execution else None)
    template = (await db.execute(select(UcpPipelineTemplate).where(UcpPipelineTemplate.template_code == pipeline_code))).scalar_one_or_none() if pipeline_code else None
    return {
        "resource": {"id": resource.id, "code": resource.resource_code, "name": resource.resource_name, "href": f"/ucp/systems?resource_id={resource.id}"} if resource else None,
        "resource_object": {"id": resource_object.id, "code": resource_object.object_code, "name": resource_object.object_name, "href": f"/ucp/systems?resource_id={resource_object.resource_id}&object_id={resource_object.id}"} if resource_object else None,
        "event_definition": {"id": definition.id, "code": definition.event_code, "name": definition.event_name, "version": definition.version} if definition else None,
        "trigger": {"id": trigger.id, "code": trigger.trigger_code, "name": trigger.trigger_name, "href": "/ucp/events/triggers"} if trigger else None,
        "template": {"code": template.template_code, "name": template.name, "version": execution.template_version if execution and execution.template_version else template.version, "href": f"/ucp/pipelines/designer?code={template.template_code}"} if template else None,
        "execution": {"pipeline_run_id": execution.pipeline_run_id, "href": f"/ucp/runs/{execution.pipeline_run_id}"} if execution else None,
    }


@router.get("/events", dependencies=[Depends(require_op("ucp.events", "V"))])
async def list_events(source: str|None=None, event_type: str|None=None, status: str|None=None,
    trigger_code: str|None=None, limit: int=Query(default=50, le=200), offset: int=Query(default=0, ge=0),
    db: AsyncSession=Depends(get_session), _user=Depends(current_user)) -> dict:
    from app.ucp.event_bus import EventListFilter, list_events as _list
    flt = EventListFilter(source=source, event_type=event_type, status=status, trigger_code=trigger_code, limit=limit, offset=offset)
    items, total = await _list(db, flt)
    return {"total": total, "items": [{
        "id": e.id, "event_id": e.event_id, "event_type": e.event_type,
        "source": e.source, "trigger": e.trigger, "payload": _mask_event_value(e.payload or {}),
        "resource_id": e.resource_id, "resource_object_id": e.resource_object_id, "event_definition_id": e.event_definition_id,
        "status": e.status, "trace_id": e.trace_id,
        "matched_trigger_code": e.matched_trigger_code,
        "pipeline_run_id": e.pipeline_run_id, "retry_count": e.retry_count,
        "error_code": e.error_code, "error_message": e.error_message,
        "event_timestamp": e.event_timestamp.isoformat() if e.event_timestamp else None,
        "received_at": e.received_at.isoformat() if e.received_at else None,
        "dispatched_at": e.dispatched_at.isoformat() if e.dispatched_at else None,
        "completed_at": e.completed_at.isoformat() if e.completed_at else None,
    } for e in items]}


@router.post("/events", dependencies=[Depends(require_op("ucp.events", "C"))])
async def ingest_event(payload: dict, db: AsyncSession=Depends(get_session), _user=Depends(current_user)) -> dict:
    from app.ucp.event_bus import DuplicateEventError, get_event as _get, process_event_pipeline, receive_event
    required = ("event_id", "event_type", "source")
    missing = [field for field in required if not payload.get(field)]
    if missing:
        raise HTTPException(422, f"Missing event fields: {', '.join(missing)}")
    try:
        evt = await receive_event(
            db,
            event_id=str(payload["event_id"]),
            event_type=str(payload["event_type"]),
            source=str(payload["source"]),
            payload=payload.get("payload") or {},
            trigger=str(payload.get("trigger") or "REALTIME"),
            metadata=payload.get("metadata"),
            is_dedup=bool(payload.get("is_dedup", True)),
        )
    except DuplicateEventError:
        existing = await _get(db, str(payload["event_id"]))
        if existing is None:
            raise
        return {"id": existing.id, "event_id": existing.event_id, "status": existing.status,
                "matched_trigger_code": existing.matched_trigger_code,
                "pipeline_run_id": existing.pipeline_run_id, "trace_id": existing.trace_id,
                "deduplicated": True}
    await process_event_pipeline(db, evt)
    await db.commit()
    from app.ucp.event_bus import start_pending_event_deliveries
    await start_pending_event_deliveries(evt.id)
    return {"id": evt.id, "event_id": evt.event_id, "status": evt.status,
            "matched_trigger_code": evt.matched_trigger_code,
            "pipeline_run_id": evt.pipeline_run_id, "trace_id": evt.trace_id,
            "deduplicated": False}


@router.get("/events/{event_id}", dependencies=[Depends(require_op("ucp.events", "V"))])
async def get_event(event_id: str, db: AsyncSession=Depends(get_session), _user=Depends(current_user)) -> dict:
    from app.ucp.event_bus import get_event as _get
    r = await _get(db, event_id)
    if not r: raise HTTPException(404, "Event not found")
    source_chain = await _source_chain(db, r)
    return {
        "id": r.id, "event_id": r.event_id, "event_type": r.event_type,
        "source": r.source, "trigger": r.trigger, "payload": _mask_event_value(r.payload or {}),
        "resource_id": r.resource_id, "resource_object_id": r.resource_object_id, "event_definition_id": r.event_definition_id,
        "metadata": _mask_event_value(r.metadata_ or {}), "status": r.status, "trace_id": r.trace_id,
        "matched_trigger_id": r.matched_trigger_id, "matched_trigger_code": r.matched_trigger_code,
        "pipeline_run_id": r.pipeline_run_id, "retry_count": r.retry_count,
        "error_code": r.error_code, "error_message": r.error_message,
        "event_timestamp": r.event_timestamp.isoformat() if r.event_timestamp else None,
        "received_at": r.received_at.isoformat() if r.received_at else None,
        "dispatched_at": r.dispatched_at.isoformat() if r.dispatched_at else None,
        "completed_at": r.completed_at.isoformat() if r.completed_at else None,
        "source_chain": source_chain,
    }


@router.get("/events/{event_id}/payload/raw", dependencies=[Depends(require_op("ucp.events", "E"))])
async def get_raw_event_payload(
    event_id: str,
    reason: str = Query(min_length=3, max_length=256),
    db: AsyncSession = Depends(get_session),
    _user: User = Depends(current_user),
) -> dict:
    """Return an audited payload view only to users with export permission."""
    from app.ucp.event_bus import get_event as _get

    event = await _get(db, event_id)
    if not event:
        raise HTTPException(404, "Event not found")
    db.add(UcpEventPayloadAccessAudit(
        event_id=event.id,
        event_uuid=event.event_id,
        operator=_user_id(_user),
        reason=reason,
    ))
    await db.commit()
    return {
        "event_id": event.event_id,
        "payload": event.payload or {},
        "metadata": _mask_event_value(event.metadata_ or {}),
        "audited": True,
    }


@router.post("/events/{event_id}/dispatch", dependencies=[Depends(require_op("ucp.events", "C"))])
async def dispatch_event(event_id: str, db: AsyncSession=Depends(get_session), _user=Depends(current_user)) -> dict:
    from app.ucp.event_bus import get_event as _get, process_event_pipeline
    evt = await _get(db, event_id)
    if not evt: raise HTTPException(404, "Event not found")
    await process_event_pipeline(db, evt)
    await db.commit()
    from app.ucp.event_bus import start_pending_event_deliveries
    await start_pending_event_deliveries(evt.id)
    return {"id": evt.id, "event_id": evt.event_id, "status": evt.status,
            "matched_trigger_code": evt.matched_trigger_code, "pipeline_run_id": evt.pipeline_run_id}


@router.post("/events/{event_id}/replay", dependencies=[Depends(require_op("ucp.events", "C"))])
async def replay_event(event_id: str, db: AsyncSession=Depends(get_session), _user=Depends(current_user)) -> dict:
    from app.ucp.event_reliability import replay_event as _r
    evt = await _r(db, event_uuid=event_id, triggered_by=_user_id(_user))
    return {"id": evt.id, "event_id": evt.event_id, "event_uuid": evt.event_uuid,
            "status": evt.status, "matched_trigger_code": getattr(evt, "matched_trigger_code", None),
            "pipeline_run_id": getattr(evt, "pipeline_run_id", None)}


@router.get("/events/{event_id}/deliveries", dependencies=[Depends(require_op("ucp.events", "V"))])
async def list_deliveries(event_id: str, limit: int=Query(default=50),
    db: AsyncSession=Depends(get_session), _user=Depends(current_user)) -> dict:
    from app.ucp.event_reliability import list_event_deliveries as _list
    items = await _list(db, event_uuid=event_id, limit=limit)
    return {"items": [{
        "id": d.id, "event_id": d.event_id, "event_uuid": d.event_uuid,
        "trigger_code": d.trigger_code, "pipeline_run_id": d.pipeline_run_id,
        "attempt": d.attempt, "status": d.status, "error_code": d.error_code,
        "error_message": d.error_message,
        "next_retry_at": d.next_retry_at.isoformat() if d.next_retry_at else None,
        "last_retry_at": d.last_retry_at.isoformat() if d.last_retry_at else None,
        "trigger_source": d.trigger_source, "triggered_by": d.triggered_by,
        "created_at": d.created_at.isoformat() if d.created_at else None,
    } for d in items]}


@router.post("/events/scan-retries", dependencies=[Depends(require_op("ucp.events", "U"))])
async def scan_retries(db: AsyncSession=Depends(get_session), _user=Depends(current_user)) -> dict:
    from app.ucp.event_reliability import scan_due_retries
    return await scan_due_retries(db)


@router.get("/triggers", dependencies=[Depends(require_op("ucp.triggers", "V"))])
async def list_triggers(event_source: str|None=None, is_active: int|None=None,
    limit: int=Query(default=50), db: AsyncSession=Depends(get_session), _user=Depends(current_user)) -> dict:
    from app.ucp.event_bus import list_triggers as _list
    items = await _list(db, is_active=is_active, event_source=event_source, limit=limit)
    return {"items": [{
        "id": t.id, "trigger_code": t.trigger_code, "trigger_name": t.trigger_name,
        "description": t.description, "event_source": t.event_source, "event_types": t.event_types,
        "pipeline_code": t.pipeline_code, "filter_rule": t.filter_rule,
        "signature_header": t.signature_header, "run_as_type": t.run_as_type,
        "is_active": t.is_active, "webhook_path": t.webhook_path,
        "created_at": t.created_at.isoformat() if t.created_at else None,
    } for t in items]}


@router.post("/triggers", dependencies=[Depends(require_op("ucp.triggers", "C"))])
async def create_trigger(payload: dict, db: AsyncSession=Depends(get_session), _user=Depends(current_user)) -> dict:
    raise HTTPException(
        410,
        "Legacy trigger writes are retired. Use /ucp/pipeline-triggers and bind a verified resource event object.",
    )


@router.patch("/triggers/{trigger_id}", dependencies=[Depends(require_op("ucp.triggers", "U"))])
async def update_trigger(trigger_id: str, payload: dict, db: AsyncSession=Depends(get_session), _user=Depends(current_user)) -> dict:
    raise HTTPException(
        410,
        "Legacy trigger writes are retired. Use /ucp/pipeline-triggers and bind a verified resource event object.",
    )


@router.delete("/triggers/{trigger_id}", dependencies=[Depends(require_op("ucp.triggers", "D"))])
async def delete_trigger(trigger_id: str, db: AsyncSession=Depends(get_session), _user=Depends(current_user)) -> dict:
    from app.ucp.models import UcpEventTrigger
    trig = (await db.execute(select(UcpEventTrigger).where(UcpEventTrigger.trigger_code == trigger_id))).scalar_one_or_none()
    if not trig: raise HTTPException(404, "Trigger not found")
    code = trig.trigger_code
    await db.delete(trig); await db.flush()
    return {"deleted": True, "trigger_code": code}


@router.post("/triggers/{trigger_id}/test")
async def test_trigger(trigger_id: str, payload: dict, db: AsyncSession=Depends(get_session), _user: User=Depends(require_op("ucp.triggers", "V"))) -> dict:
    from app.ucp.models import UcpEventTrigger
    trig = (await db.execute(select(UcpEventTrigger).where(UcpEventTrigger.trigger_code == trigger_id))).scalar_one_or_none()
    if not trig: raise HTTPException(404, "trigger not found")
    uet = payload.get("event_type"); us = payload.get("source"); up = payload.get("payload")
    is_mock = not bool(uet or us or up)
    et = uet or (trig.event_types.split(",")[0].strip() if trig.event_types else "test")
    src = us or trig.event_source or "TEST"
    ep = up if isinstance(up, dict) else {}
    ets = [t.strip() for t in (trig.event_types or "").split(",") if t.strip()]
    tm = et in ets if ets else True
    sm = src == trig.event_source if trig.event_source else True
    fm = True; fd = {}
    if trig.filter_rule:
        for k, ex in trig.filter_rule.items():
            ac = ep.get(k); fd[k] = {"expected": ex, "actual": ac, "match": str(ac) == str(ex)}
            if str(ac) != str(ex): fm = False
    matched = tm and sm and fm
    return {"matched": matched, "is_test_payload": is_mock, "trigger_code": trig.trigger_code,
            "trigger_name": trig.trigger_name,
            "checks": {"event_type": {"match": tm, "expected": ets, "actual": et},
                       "source": {"match": sm, "expected": trig.event_source, "actual": src},
                       "filter": {"match": fm, "details": fd, "rule": trig.filter_rule or {}}},
            "pipeline_code": trig.pipeline_code if matched else None}


@router.post("/webhooks/feishu/{trigger_code}")
async def feishu_webhook(trigger_code: str, r: Request, db: AsyncSession=Depends(get_session)) -> dict:
    from app.ucp.feishu_webhook import (
        handle_url_verification, normalize_feishu_event, verify_feishu_signature,
    )
    from app.ucp.models import UcpEventTrigger
    body = await r.json()
    headers = dict(r.headers)
    # Find trigger config
    trig = (await db.execute(
        select(UcpEventTrigger).where(UcpEventTrigger.trigger_code == trigger_code)
    )).scalar_one_or_none()
    if not trig: raise HTTPException(404, "Trigger not found")
    # URL verification
    challenge = handle_url_verification(body)
    if challenge: return challenge
    # Validate signature
    if trig.signature_header:
        sig = headers.get(trig.signature_header, "")
        timestamp = headers.get("x-lark-request-timestamp", "")
        nonce = headers.get("x-lark-request-nonce", "")
        body_bytes = await r.body()
        encrypt_key = trig.feishu_encrypt_key or ""
        if not verify_feishu_signature(timestamp, nonce, body_bytes, sig, encrypt_key):
            raise HTTPException(401, "Invalid signature")
    # Normalize and ingest
    normalized = normalize_feishu_event(
        body,
        encrypt_key=trig.feishu_encrypt_key,
        verification_token=trig.feishu_verification_token,
    )
    from app.ucp.event_bus import (
        DuplicateEventError, EVENT_SOURCE_FEISHU, get_event as get_ucp_event,
        process_event_pipeline, receive_event,
    )
    try:
        evt = await receive_event(
            db,
            event_id=normalized["event_id"],
            event_type=normalized["event_type"],
            source=EVENT_SOURCE_FEISHU,
            payload=normalized.get("payload") or {},
            metadata={
                "feishu_event_type": normalized.get("feishu_event_type"),
                "tenant_key": normalized.get("tenant_key"),
                "app_id": normalized.get("app_id"),
            },
        )
    except DuplicateEventError:
        evt = await get_ucp_event(db, normalized["event_id"])
        if evt is None:
            raise
        return {"id": evt.id, "event_id": evt.event_id, "status": evt.status,
                "trace_id": evt.trace_id, "deduplicated": True, "lifecycle_results": []}

    await process_event_pipeline(db, evt)
    lifecycle_results = []
    compatibility_enabled = _lifecycle_direct_dispatch_enabled()
    if compatibility_enabled:
        from app.ucp.account_lifecycle_service import dispatch_event as dispatch_lifecycle_event
        lifecycle_results = await dispatch_lifecycle_event(db, evt)
    metadata = dict(evt.metadata_ or {})
    metadata["lifecycle_direct_dispatch"] = {
        "enabled": compatibility_enabled,
        "result_count": len(lifecycle_results),
    }
    evt.metadata_ = metadata
    await db.flush()
    await db.commit()
    from app.ucp.event_bus import start_pending_event_deliveries
    await start_pending_event_deliveries(evt.id)
    return {
        "id": evt.id,
        "event_id": evt.event_id,
        "status": evt.status,
        "trace_id": evt.trace_id,
        "lifecycle_results": lifecycle_results,
        "deduplicated": False,
        "lifecycle_direct_dispatch_enabled": compatibility_enabled,
    }


@router.get("/dead-letters", dependencies=[Depends(require_op("ucp.dead_letters", "V"))])
async def list_dead_letters(trigger_code: str|None=None, limit: int=Query(default=50), offset: int=Query(default=0),
    db: AsyncSession=Depends(get_session), _user=Depends(current_user)) -> dict:
    from app.ucp.event_reliability import list_dead_letters as _list
    items, total = await _list(db, trigger_code=trigger_code, limit=limit, offset=offset)
    return {"total": total, "items": [{
        "id": d.id, "event_id": d.event_id, "event_uuid": d.event_uuid,
        "trigger_code": d.trigger_code, "pipeline_run_id": d.pipeline_run_id,
        "attempt": d.attempt, "status": d.status, "error_code": d.error_code, "error_message": d.error_message,
        "next_retry_at": d.next_retry_at.isoformat() if d.next_retry_at else None,
        "last_retry_at": d.last_retry_at.isoformat() if d.last_retry_at else None,
        "created_at": d.created_at.isoformat() if d.created_at else None,
        "updated_at": d.updated_at.isoformat() if d.updated_at else None,
    } for d in items]}


@router.get("/dead-letters/{delivery_id}", dependencies=[Depends(require_op("ucp.dead_letters", "V"))])
async def get_dead_letter(delivery_id: int, db: AsyncSession=Depends(get_session), _user=Depends(current_user)) -> dict:
    from app.ucp.event_reliability import get_delivery as _g
    dl = await _g(db, delivery_id=delivery_id)
    return {
        "id": dl.id, "event_id": dl.event_id, "event_uuid": dl.event_uuid,
        "trigger_id": dl.trigger_id, "trigger_code": dl.trigger_code,
        "pipeline_run_id": dl.pipeline_run_id, "attempt": dl.attempt, "status": dl.status,
        "error_code": dl.error_code, "error_message": dl.error_message,
        "next_retry_at": dl.next_retry_at.isoformat() if dl.next_retry_at else None,
        "last_retry_at": dl.last_retry_at.isoformat() if dl.last_retry_at else None,
        "trigger_source": dl.trigger_source, "triggered_by": dl.triggered_by,
        "created_at": dl.created_at.isoformat() if dl.created_at else None,
        "updated_at": dl.updated_at.isoformat() if dl.updated_at else None,
    }


@router.post("/dead-letters/{delivery_id}/replay", dependencies=[Depends(require_op("ucp.dead_letters", "C"))])
async def replay_dead_letter(delivery_id: int, db: AsyncSession=Depends(get_session), _user=Depends(current_user)) -> dict:
    from app.ucp.event_reliability import replay_dead_letter as _r
    dl = await _r(db, delivery_id=delivery_id, triggered_by=_user_id(_user))
    return {"id": dl.id, "event_uuid": dl.event_uuid, "status": dl.status,
            "attempt": dl.attempt, "pipeline_run_id": dl.pipeline_run_id}


@router.post("/dead-letters/{delivery_id}/discard", dependencies=[Depends(require_op("ucp.dead_letters", "U"))])
async def discard_dead_letter(delivery_id: int, db: AsyncSession=Depends(get_session), _user=Depends(current_user)) -> dict:
    from app.ucp.event_reliability import discard_dead_letter as _d
    dl = await _d(db, delivery_id=delivery_id, triggered_by=_user_id(_user))
    return {"id": dl.id, "event_uuid": dl.event_uuid, "status": dl.status}
