"""绩效 OKR 参考内容接口：只允许通过已有任务读取被评估人 OKR。"""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_session
from app.integrations.feishu.feishu_client import authorized_okr_read
from app.performance.auth_context import PerformanceAccessContext, PerformanceIdentityMappingNotFound, get_performance_access_context
from app.performance.models import PerformanceNodeTask
from app.performance.okr_provider import OkrView, fetch_employee_okr, fetch_employee_okrs, get_okr_provider
from app.performance.okr_policy import task_okr_access_allowed


router = APIRouter(prefix="/performance/okr", tags=["performance-okr"])


class EmployeeOkrResponse(BaseModel):
    enabled: bool
    source: str | None = None
    employee_no: str
    okr: OkrView | None = None
    okrs: list[OkrView] = Field(default_factory=list)


@router.get("/tasks/{task_id}/okr", response_model=EmployeeOkrResponse)
async def get_task_okr(
    task_id: int,
    context: PerformanceAccessContext = Depends(get_performance_access_context),
    db: AsyncSession = Depends(get_session),
    include_periods: bool = False,
) -> EmployeeOkrResponse:
    """按已授权的绩效任务读取其被评估人 OKR，避免前端直接按工号越权查询。"""
    task = await db.get(PerformanceNodeTask, task_id)
    if task is None:
        raise HTTPException(status_code=404, detail="TASK_NOT_FOUND")
    from app.performance.projects_router import _self_summary_task, _self_summary_template
    try:
        task, node = await _self_summary_task(
            task_id,
            context,
            db,
            task_kind="work_summary" if task.task_kind == "work_summary" else "evaluation",
        )
    except PerformanceIdentityMappingNotFound:
        raise HTTPException(status_code=404, detail="TASK_NOT_FOUND") from None
    template = await _self_summary_template(task, node, db)
    if getattr(node, "node_type", None) != "work_summary" and not any(
        (content.get("content_slot") or "fill") == "reference"
        and content.get("reference_kind") == "more"
        and content.get("reference_value") == "okr"
        for content in template.get("content") or []
    ):
        raise HTTPException(status_code=404, detail="OKR_REFERENCE_NOT_CONFIGURED")
    if not await task_okr_access_allowed(db, task, node):
        raise HTTPException(status_code=403, detail="OKR_REFERENCE_FORBIDDEN")
    provider = get_okr_provider()
    if provider is None:
        return EmployeeOkrResponse(enabled=False, employee_no=task.target_employee_no)
    with authorized_okr_read(task.target_employee_no, context):
        if include_periods:
            okrs = await fetch_employee_okrs(db, task.target_employee_no)
            return EmployeeOkrResponse(
                enabled=True,
                source=provider.name,
                employee_no=task.target_employee_no,
                okr=okrs[0] if okrs else None,
                okrs=okrs,
            )
        return EmployeeOkrResponse(
            enabled=True,
            source=provider.name,
            employee_no=task.target_employee_no,
            okr=await fetch_employee_okr(db, task.target_employee_no),
        )
