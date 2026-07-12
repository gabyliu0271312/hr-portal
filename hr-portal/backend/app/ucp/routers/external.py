"""UCP external + approvals + oa sync routes."""
from __future__ import annotations
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.deps import current_user, require_op
from app.core.db import get_session
from app.users.models import User
router=APIRouter()

@router.get("/external-accounts",dependencies=[Depends(require_op("ucp.external_accounts","V"))])
async def list_ext_accounts(system_code:str|None=None,employee_id:str|None=None,status:str|None=None,
    limit:int=Query(default=50),offset:int=Query(default=0),db:AsyncSession=Depends(get_session),_user=Depends(current_user))->dict:
    from app.ucp.external_account_service import list_accounts
    items=await list_accounts(db,system_code=system_code,employee_id=employee_id,status=status,limit=limit,offset=offset)
    return {"total":len(items),"items":items}
@router.get("/external-accounts/{account_id}",dependencies=[Depends(require_op("ucp.external_accounts","V"))])
async def get_ext_account(account_id:int,db:AsyncSession=Depends(get_session),_user=Depends(current_user))->dict:
    from app.ucp.external_account_service import get_account
    r=await get_account(db,account_id)
    if not r: raise HTTPException(404)
    return r
@router.get("/external-accounts/{account_id}/audits",dependencies=[Depends(require_op("ucp.external_accounts","V"))])
async def list_ext_audits(account_id:int,limit:int=Query(default=50),offset:int=Query(default=0),
    db:AsyncSession=Depends(get_session),_user=Depends(current_user))->dict:
    from app.ucp.external_account_service import list_audits
    items=await list_audits(db,account_id,limit,offset)
    return {"total":len(items),"items":items}
@router.post("/external-accounts/run",dependencies=[Depends(require_op("ucp.external_accounts","C"))])
async def run_ext_action(payload:dict,db:AsyncSession=Depends(get_session),_user=Depends(current_user))->dict:
    from app.ucp.external_account_service import run_action
    return await run_action(db,payload)

@router.post("/approvals",dependencies=[Depends(require_op("ucp.approvals","C"))])
async def submit_approval(payload:dict,db:AsyncSession=Depends(get_session),_user=Depends(current_user))->dict:
    from app.ucp.approval_service import submit_request, request_to_dict
    req = await submit_request(
        db,
        business_type=payload["business_type"],
        business_key=payload["business_key"],
        action=payload["action"],
        approvers=payload.get("approvers", []),
        action_payload=payload.get("action_payload"),
        business_summary=payload.get("business_summary"),
        approval_mode=payload.get("approval_mode", "SINGLE"),
        confirmation_type=payload.get("confirmation_type", "NONE"),
        reason=payload.get("reason"),
        expires_in_hours=payload.get("expires_in_hours", 72),
        pipeline_run_id=payload.get("pipeline_run_id"),
        event_id=payload.get("event_id"),
        triggered_by=getattr(_user, "login_name", None) or getattr(_user, "username", None),
    )
    await db.commit()
    return request_to_dict(req)
@router.get("/approvals",dependencies=[Depends(require_op("ucp.approvals","V"))])
async def list_approvals(status:str|None=None,business_type:str|None=None,approver_id:str|None=None,
    limit:int=Query(default=50),offset:int=Query(default=0),db:AsyncSession=Depends(get_session),_user=Depends(current_user))->dict:
    from app.ucp.approval_service import list_requests, request_to_dict
    items = await list_requests(
        db, status=status, business_type=business_type,
        approver_id=approver_id, limit=limit, offset=offset,
    )
    return {"total": len(items), "items": [request_to_dict(r) for r in items]}
@router.get("/approvals/my-todo",dependencies=[Depends(require_op("ucp.approvals","V"))])
async def my_todo(db:AsyncSession=Depends(get_session),_user=Depends(current_user))->dict:
    from app.ucp.approval_service import get_my_pending_count
    approver_id = getattr(_user, "login_name", None) or getattr(_user, "username", "system")
    count = await get_my_pending_count(db, approver_id)
    return {"count": count}
@router.get("/approvals/{request_id}",dependencies=[Depends(require_op("ucp.approvals","V"))])
async def get_approval(request_id:int,db:AsyncSession=Depends(get_session),_user=Depends(current_user))->dict:
    from app.ucp.approval_service import get_request, list_steps, list_actions, request_to_dict, step_to_dict, action_to_dict
    req = await get_request(db, request_id)
    if not req:
        raise HTTPException(404, "审批请求不存在")
    steps = await list_steps(db, request_id)
    actions = await list_actions(db, request_id)
    result = request_to_dict(req, include_steps=True)
    result["steps"] = [step_to_dict(s) for s in steps]
    result["actions"] = [action_to_dict(a) for a in actions]
    return result
@router.post("/approvals/{request_id}/action",dependencies=[Depends(require_op("ucp.approvals","U"))])
async def approval_action(request_id:int,payload:dict,db:AsyncSession=Depends(get_session),_user=Depends(current_user))->dict:
    from app.ucp.approval_service import (
        approve_request, reject_request, transfer_request,
        withdraw_request, execute_approved_request, request_to_dict,
    )
    action = payload.get("action", "")
    approver_id = getattr(_user, "login_name", None) or getattr(_user, "username", "system")
    comment = payload.get("comment")

    if action == "APPROVE":
        req = await approve_request(db, request_id=request_id, approver_id=approver_id, comment=comment)
    elif action == "REJECT":
        req = await reject_request(db, request_id=request_id, approver_id=approver_id, comment=comment)
    elif action == "TRANSFER":
        req = await transfer_request(
            db, request_id=request_id, from_approver_id=approver_id,
            to_user_id=payload.get("to_user_id", ""),
            to_user_name=payload.get("to_user_name"),
            comment=comment,
        )
    elif action == "WITHDRAW":
        req = await withdraw_request(db, request_id=request_id, operator_id=approver_id, comment=comment)
    elif action == "EXECUTE":
        req = await execute_approved_request(
            db, request_id=request_id,
            confirmation_token=payload.get("confirmation_token"),
        )
    else:
        raise HTTPException(400, f"不支持的操作: {action}")
    await db.commit()
    return request_to_dict(req)
@router.post("/approvals/scan-expired",dependencies=[Depends(require_op("ucp.approvals","U"))])
async def scan_expired_approvals(db:AsyncSession=Depends(get_session),_user=Depends(current_user))->dict:
    from app.ucp.approval_service import scan_expired_requests, request_to_dict
    items = await scan_expired_requests(db)
    return {"expired_count": len(items), "items": [request_to_dict(r) for r in items]}

@router.get("/oa-sync/runs",dependencies=[Depends(require_op("ucp.oa_sync","V"))])
async def list_oa_runs(status:str|None=None,limit:int=Query(default=50),offset:int=Query(default=0),
    db:AsyncSession=Depends(get_session),_user=Depends(current_user))->dict:
    from app.ucp.oa_sync_service import list_runs
    items=await list_runs(db,status=status,limit=limit,offset=offset)
    return {"total":len(items),"items":items}
@router.get("/oa-sync/runs/{run_id}",dependencies=[Depends(require_op("ucp.oa_sync","V"))])
async def get_oa_run(run_id:int,db:AsyncSession=Depends(get_session),_user=Depends(current_user))->dict:
    from app.ucp.oa_sync_service import get_run
    return await get_run(db,run_id)
@router.get("/oa-sync/runs/{run_id}/records",dependencies=[Depends(require_op("ucp.oa_sync","V"))])
async def list_oa_records(run_id:int,diff_type:str|None=None,process_status:str|None=None,
    limit:int=Query(default=50),offset:int=Query(default=0),db:AsyncSession=Depends(get_session),_user=Depends(current_user))->dict:
    from app.ucp.oa_sync_service import list_records
    items=await list_records(db,run_id,diff_type=diff_type,process_status=process_status,limit=limit,offset=offset)
    return {"total":len(items),"items":items}
@router.post("/oa-sync/trigger",dependencies=[Depends(require_op("ucp.oa_sync","C"))])
async def trigger_oa_sync(payload:dict,db:AsyncSession=Depends(get_session),_user=Depends(current_user))->dict:
    from app.ucp.oa_sync_service import trigger_sync
    return await trigger_sync(db,payload)
