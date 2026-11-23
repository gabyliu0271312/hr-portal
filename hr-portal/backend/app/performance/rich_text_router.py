import re
from urllib.parse import urlsplit

import httpx
from fastapi import APIRouter, Depends, Request
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.feishu_user_grant import get_user_access_token
from app.core.config import settings
from app.core.db import get_session
from app.identity_switch.context import current_switch
from app.performance.auth_context import PerformanceAccessContext, get_performance_access_context

router = APIRouter(prefix="/performance/rich-text", tags=["performance"])
_METADATA_URL = "https://open.feishu.cn/open-apis/drive/v1/metas/batch_query"
_TYPES = {"docs": "doc", "docx": "docx", "wiki": "wiki", "sheets": "sheet", "base": "bitable", "file": "file"}


class LinkTitleIn(BaseModel):
    url: str = Field(max_length=2048)


class LinkTitleOut(BaseModel):
    title: str | None = None


def document_reference(value: str) -> dict | None:
    try:
        url = urlsplit(value)
        if (url.scheme != "https" or url.username or url.password or url.port
                or not url.hostname or not re.fullmatch(r"(?:[a-zA-Z0-9-]+\.)*feishu\.cn", url.hostname)):
            return None
        match = re.fullmatch(r"/(docs|docx|wiki|sheets|base|file)/([a-zA-Z0-9]{1,256})/?", url.path)
        if not match:
            return None
        return {"doc_type": _TYPES[match[1]], "doc_token": match[2]}
    except ValueError:
        return None


def personal_access(context: PerformanceAccessContext) -> bool:
    return (context.subject_type == "PORTAL_USER" and "performance.app" in context.portal_entry_permissions
            and not any((context.effective_employee_no, context.operator_user_id, context.switch_session_id))
            and current_switch.get() is None)


def portal_token(request: Request) -> str:
    scheme, _, value = request.headers.get("Authorization", "").partition(" ")
    return value if scheme.lower() == "bearer" else ""


async def fetch_title(reference: dict, token: str) -> str | None:
    try:
        async with httpx.AsyncClient(timeout=4.0, follow_redirects=False, trust_env=False) as client:
            response = await client.post(_METADATA_URL, headers={"Authorization": f"Bearer {token}"},
                                         json={"request_docs": [reference], "with_url": False})
            if response.status_code != 200:
                return None
            payload = response.json()
        if not isinstance(payload, dict) or payload.get("code") != 0:
            return None
        data = payload.get("data")
        if not isinstance(data, dict) or data.get("failed_list"):
            return None
        for item in data.get("metas") or []:
            if not isinstance(item, dict):
                continue
            info = item.get("request_doc_info") or item
            if info.get("doc_token") != reference["doc_token"] or info.get("doc_type") != reference["doc_type"]:
                continue
            title = item.get("title")
            if isinstance(title, str) and title.strip():
                return re.sub(r"[\x00-\x1f\x7f]", " ", title).strip()[:500] or None
    except (httpx.HTTPError, ValueError, TypeError, AttributeError):
        return None
    return None


@router.post("/link-title", response_model=LinkTitleOut)
async def link_title(payload: LinkTitleIn, request: Request,
                     context: PerformanceAccessContext = Depends(get_performance_access_context),
                     db: AsyncSession = Depends(get_session)) -> LinkTitleOut:
    reference = document_reference(payload.url)
    if not settings.FEISHU_DOCUMENT_TITLE_ENABLED or not reference or not personal_access(context):
        return LinkTitleOut()
    token = await get_user_access_token(db, context.subject_id, portal_token(request))
    return LinkTitleOut(title=await fetch_title(reference, token) if token else None)
