from datetime import UTC, datetime

from fastapi import HTTPException, status
from sqlalchemy import select

from app.data.models import RegisteredTable
from app.system.models import SystemLog
from app.warehouse.schemas import ScopeClassificationOut


def classification_summary(table):
    return ScopeClassificationOut(
        table_name=table.table_name,
        security_classification=table.security_classification or "controlled_fact",
        version=table.scope_classification_version or 0,
        approved_by=table.scope_approved_by,
        approved_at=table.scope_approved_at,
        reason=table.scope_approval_reason,
    )


async def read_scope_classification(db, table_name):
    table = (await db.execute(
        select(RegisteredTable).where(RegisteredTable.table_name == table_name)
    )).scalar_one_or_none()
    if table is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="数据资产不存在")
    return classification_summary(table)


async def approve_scope_classification(db, table_name, payload, user):
    try:
        table = (await db.execute(
            select(RegisteredTable).where(RegisteredTable.table_name == table_name).with_for_update()
        )).scalar_one_or_none()
        if table is None:
            raise HTTPException(status.HTTP_404_NOT_FOUND, detail="数据资产不存在")
        previous = classification_summary(table)
        if previous.version != payload.expected_version:
            raise HTTPException(status.HTTP_409_CONFLICT, detail="安全分类已更新，请刷新后重试")

        table.security_classification = payload.security_classification
        table.scope_classification_version = previous.version + 1
        table.scope_approved_by = user.id
        table.scope_approved_at = datetime.now(UTC)
        table.scope_approval_reason = payload.reason
        db.add(SystemLog(
            category="scope_governance", action="scope_classification_approved", status="success",
            user_id=user.id, request_summary="批准数据资产安全分类",
            response_summary="治理分类已记录，运行时范围过滤不变",
            metadata_json={
                "table_id": table.id,
                "previous_classification": previous.security_classification,
                "classification": table.security_classification,
                "previous_version": previous.version,
                "version": table.scope_classification_version,
                "approved_by": user.id,
                "reason_supplied": True,
                "runtime_filter_exemption": False,
            },
        ))
        result = classification_summary(table)
        await db.commit()
        return result
    except Exception:
        await db.rollback()
        raise
