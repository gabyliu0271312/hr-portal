"""table_tools 路由:归集模板库 + 多表合并执行。

权限(过渡期沿用固定动作,menu_actions 升级后再细化):
  V = 查看模板 / 用模板跑合并 / 下载
  E = 建/改模板(决定数据口径,管控)
"""
from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from fastapi.responses import Response
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.db import get_session
from app.core.deps import current_user, require_op
from app.table_tools import engine
from app.table_tools import ai_builder
from app.table_tools.models import MergeSourceMapping, MergeTemplate
from app.users.models import User

router = APIRouter(prefix="/table-tools", tags=["table-tools"])

MENU = "table_tools"


# ── Schemas ────────────────────────────────────────────────
class SourceMappingIn(BaseModel):
    name: str = Field(min_length=1, max_length=128)
    match_signature: list[str] = []
    sheet_kw: str | None = None
    header_start: int = 1
    header_end: int = 1
    key_map: dict[str, str] = {}
    column_map: dict[str, str] = {}
    derived_fields: list[dict] = []
    derive_check: dict | None = None
    skip_tokens: list[str] = ["合计", "小计", "总计"]


class TemplateIn(BaseModel):
    name: str = Field(min_length=1, max_length=128)
    description: str | None = None
    merge_keys: list[str] = Field(min_length=1)
    std_fields: list[str] = Field(min_length=1)
    aggregate: str = "sum"
    mappings: list[SourceMappingIn] = []


class TemplateOut(BaseModel):
    id: int
    name: str
    description: str | None
    merge_keys: list[str]
    std_fields: list[str]
    aggregate: str
    version: int
    mapping_count: int


# ── 序列化 ─────────────────────────────────────────────────
def _mapping_to_engine(m: MergeSourceMapping) -> dict:
    return {
        "name": m.name,
        "match": m.match_signature,
        "sheet_kw": m.sheet_kw,
        "header": [m.header_start, m.header_end],
        "key_map": m.key_map,
        "column_map": m.column_map,
        "derived_fields": m.derived_fields,
        "derive_check": m.derive_check,
        "skip_tokens": m.skip_tokens,
    }


def _template_out(t: MergeTemplate) -> TemplateOut:
    return TemplateOut(
        id=t.id, name=t.name, description=t.description,
        merge_keys=t.merge_keys, std_fields=t.std_fields,
        aggregate=t.aggregate, version=t.version,
        mapping_count=len(t.mappings),
    )


async def _load_template(db: AsyncSession, tid: int) -> MergeTemplate:
    row = (await db.execute(
        select(MergeTemplate).where(MergeTemplate.id == tid)
        .options(selectinload(MergeTemplate.mappings))
    )).scalar_one_or_none()
    if row is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="模板不存在")
    return row


# ── 模板 CRUD ──────────────────────────────────────────────
@router.get("/templates", response_model=list[TemplateOut])
async def list_templates(
    db: AsyncSession = Depends(get_session),
    _: User = Depends(require_op(MENU, "V")),
) -> list[TemplateOut]:
    rows = (await db.execute(
        select(MergeTemplate).options(selectinload(MergeTemplate.mappings))
        .order_by(MergeTemplate.created_at.desc())
    )).scalars().all()
    return [_template_out(t) for t in rows]


@router.get("/templates/{tid}")
async def get_template(
    tid: int,
    db: AsyncSession = Depends(get_session),
    _: User = Depends(require_op(MENU, "V")),
) -> dict:
    t = await _load_template(db, tid)
    return {
        **_template_out(t).model_dump(),
        "mappings": [_mapping_to_engine(m) | {"id": m.id} for m in t.mappings],
    }


@router.post("/templates", response_model=TemplateOut, status_code=status.HTTP_201_CREATED)
async def create_template(
    payload: TemplateIn,
    db: AsyncSession = Depends(get_session),
    user: User = Depends(require_op(MENU, "E")),
) -> TemplateOut:
    if (await db.execute(select(MergeTemplate).where(MergeTemplate.name == payload.name))).scalar_one_or_none():
        raise HTTPException(status.HTTP_409_CONFLICT, detail="模板名已存在")
    t = MergeTemplate(
        name=payload.name, description=payload.description,
        merge_keys=payload.merge_keys, std_fields=payload.std_fields,
        aggregate=payload.aggregate, created_by=user.id,
    )
    for ms in payload.mappings:
        t.mappings.append(MergeSourceMapping(
            name=ms.name, match_signature=ms.match_signature, sheet_kw=ms.sheet_kw,
            header_start=ms.header_start, header_end=ms.header_end,
            key_map=ms.key_map, column_map=ms.column_map,
            derived_fields=ms.derived_fields, derive_check=ms.derive_check,
            skip_tokens=ms.skip_tokens,
        ))
    db.add(t)
    await db.commit()
    await db.refresh(t, ["mappings"])
    return _template_out(t)


@router.put("/templates/{tid}", response_model=TemplateOut)
async def update_template(
    tid: int,
    payload: TemplateIn,
    db: AsyncSession = Depends(get_session),
    _: User = Depends(require_op(MENU, "E")),
) -> TemplateOut:
    t = await _load_template(db, tid)
    t.name = payload.name
    t.description = payload.description
    t.merge_keys = payload.merge_keys
    t.std_fields = payload.std_fields
    t.aggregate = payload.aggregate
    t.version += 1
    t.mappings.clear()
    await db.flush()
    for ms in payload.mappings:
        t.mappings.append(MergeSourceMapping(
            name=ms.name, match_signature=ms.match_signature, sheet_kw=ms.sheet_kw,
            header_start=ms.header_start, header_end=ms.header_end,
            key_map=ms.key_map, column_map=ms.column_map,
            derived_fields=ms.derived_fields, derive_check=ms.derive_check,
            skip_tokens=ms.skip_tokens,
        ))
    await db.commit()
    await db.refresh(t, ["mappings"])
    return _template_out(t)


@router.delete("/templates/{tid}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_template(
    tid: int,
    db: AsyncSession = Depends(get_session),
    _: User = Depends(require_op(MENU, "E")),
) -> Response:
    t = await _load_template(db, tid)
    await db.delete(t)
    await db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


# ── 执行合并 ───────────────────────────────────────────────
async def _read_files(files: list[UploadFile]) -> list[tuple[str, bytes]]:
    out: list[tuple[str, bytes]] = []
    for f in files:
        name = f.filename or ""
        if name.startswith(("_", "~$")) or not name.lower().endswith((".xlsx", ".xls")):
            continue
        content = await f.read()
        if content:
            out.append((name, content))
    if not out:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="未收到有效的 Excel 文件")
    return out


@router.post("/templates/{tid}/merge")
async def run_merge_api(
    tid: int,
    files: list[UploadFile] = File(...),
    db: AsyncSession = Depends(get_session),
    _: User = Depends(require_op(MENU, "V")),
) -> dict:
    """用模板跑合并,返回预览(行/识别日志/异常/统计)。下载另走 /download。"""
    t = await _load_template(db, tid)
    blobs = await _read_files(files)
    template = {"merge_keys": t.merge_keys, "std_fields": t.std_fields, "aggregate": t.aggregate}
    mappings = [_mapping_to_engine(m) for m in t.mappings]
    result = engine.run_merge(blobs, template, mappings)
    # 预览只回前 100 行,完整结果走下载
    return {
        "columns": result["columns"],
        "rows": result["rows"][:100],
        "total_rows": len(result["rows"]),
        "recognize_log": result["recognize_log"],
        "anomalies": result["anomalies"],
        "stats": result["stats"],
    }


@router.post("/templates/{tid}/download")
async def download_merge(
    tid: int,
    files: list[UploadFile] = File(...),
    db: AsyncSession = Depends(get_session),
    _: User = Depends(require_op(MENU, "E")),
) -> Response:
    """跑合并并直接下载 xlsx(导出口径 E)。"""
    t = await _load_template(db, tid)
    blobs = await _read_files(files)
    template = {"merge_keys": t.merge_keys, "std_fields": t.std_fields, "aggregate": t.aggregate}
    mappings = [_mapping_to_engine(m) for m in t.mappings]
    result = engine.run_merge(blobs, template, mappings)
    xlsx = engine.rows_to_xlsx(result["columns"], result["rows"])
    return Response(
        content=xlsx,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": 'attachment; filename="merged_result.xlsx"'},
    )


# ── AI 建模板草稿 ───────────────────────────────────────────────────────────

@router.post("/ai-draft")
async def ai_draft(
    files: list[UploadFile] = File(...),
    business_context: str = "",
    db: AsyncSession = Depends(get_session),
    _: User = Depends(require_op(MENU, "E")),
) -> dict:
    """上传文件 + 可选业务背景 → AI 生成归集模板草稿（不存库）。

    返回结构兼容 TemplateIn，附带 _meta._low_confidence 供前端标红提示。
    前端用户确认/修改后，直接 POST /templates 存库。
    """
    blobs = await _read_files(files)
    try:
        draft = await ai_builder.build_draft(blobs, business_context, db)
    except ValueError as e:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(e))
    return draft
