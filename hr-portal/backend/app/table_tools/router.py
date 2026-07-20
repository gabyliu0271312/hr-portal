"""table_tools 路由:归集模板库 + 多表合并执行。

权限(固定动作 V/C/U/D/E,owner 隔离写操作 —— 方案 B):
  V = 查看模板 / 用模板跑合并
  C = 新建模板(记 created_by)
  U = 改模板;仅能改自己建的,超级管理员可改任何模板
  D = 删模板;仅能删自己建的,超级管理员可删任何模板
  E = 导出/下载结果
"""
from __future__ import annotations

import io
from typing import Any

import openpyxl

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from fastapi.responses import Response
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.ai.audit import AiAuditTimer, record_ai_log
from app.ai.capabilities import get_capability
from app.ai.policy_guard import enforce_output_deny_patterns, validate_capability_policy
from app.ai_formula.custom_functions import executable_functions
from app.core.db import get_session
from app.core.deps import current_user, require_op
from app.permissions.scope_filter import _is_super_admin
from app.table_tools import engine
from app.table_tools import ai_builder
from app.table_tools.models import MergeSourceMapping, MergeTemplate
from app.users.models import User

router = APIRouter(prefix="/table-tools", tags=["table-tools"])

MENU = "table_tools"
AI_DRAFT_CAPABILITY = "table_merge.suggest_mapping"


# ── Schemas ────────────────────────────────────────────────
class SourceMappingIn(BaseModel):
    id: int | None = None
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
    created_by: int | None


class MappingDraftMappingOut(SourceMappingIn):
    model_config = ConfigDict(populate_by_name=True)
    confidence: float = Field(default=0.0, validation_alias="_confidence", serialization_alias="_confidence")
    notes: str = Field(default="", validation_alias="_notes", serialization_alias="_notes")


class MappingDraftLowConfidenceOut(BaseModel):
    sheet: str
    confidence: float
    notes: str


class MappingDraftOut(BaseModel):
    mapping: MappingDraftMappingOut
    available_sheets: list[str]
    effective_headers: list[str]
    low_confidence: list[MappingDraftLowConfidenceOut]
    warnings: list[str]


class MappingDraftsOut(BaseModel):
    mappings: list[MappingDraftMappingOut]
    low_confidence: list[MappingDraftLowConfidenceOut]
    warnings: list[str]


class SourceMappingBatchIn(BaseModel):
    mappings: list[SourceMappingIn] = Field(min_length=1)


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
        mapping_count=len(t.mappings), created_by=t.created_by,
    )


def _mapping_out(m: MergeSourceMapping) -> dict:
    return {
        "id": m.id,
        "name": m.name,
        "match_signature": m.match_signature,
        "sheet_kw": m.sheet_kw,
        "header_start": m.header_start,
        "header_end": m.header_end,
        "key_map": m.key_map,
        "column_map": m.column_map,
        "derived_fields": m.derived_fields,
        "derive_check": m.derive_check,
        "skip_tokens": m.skip_tokens,
    }


def _validate_source_mapping(template: MergeTemplate, payload: SourceMappingIn) -> dict:
    name = payload.name.strip()
    if not name:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="映射名称不能为空")
    signature = list(dict.fromkeys(item.strip() for item in payload.match_signature if item.strip()))
    if len(signature) < 3:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="表头特征至少需要 3 项")
    if not 1 <= payload.header_start <= payload.header_end <= 10:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="表头行范围必须在 1 到 10 行之间")
    key_map = {key.strip(): value for key, value in payload.key_map.items() if key.strip()}
    if not key_map:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="至少配置一项主键映射")
    if any(value not in template.merge_keys for value in key_map.values()):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="主键映射目标必须属于模板归集主键")
    column_map = {key.strip(): value for key, value in payload.column_map.items() if key.strip()}
    if any(value not in template.std_fields for value in column_map.values()):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="字段映射目标必须属于模板标准字段")
    derived_fields = payload.derived_fields or []
    if any(field.get("target") not in template.std_fields for field in derived_fields):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="派生字段目标必须属于模板标准字段")
    return {
        "name": name,
        "match_signature": signature,
        "sheet_kw": payload.sheet_kw.strip() if payload.sheet_kw else None,
        "header_start": payload.header_start,
        "header_end": payload.header_end,
        "key_map": key_map,
        "column_map": column_map,
        "derived_fields": derived_fields,
        "derive_check": payload.derive_check,
        "skip_tokens": list(dict.fromkeys(item.strip() for item in (payload.skip_tokens or []) if item.strip())) or ["合计", "小计", "总计"],
    }


def _apply_source_mapping(mapping: MergeSourceMapping, values: dict) -> None:
    for key, value in values.items():
        setattr(mapping, key, value)

async def _load_template(db: AsyncSession, tid: int) -> MergeTemplate:
    row = (await db.execute(
        select(MergeTemplate).where(MergeTemplate.id == tid)
        .options(selectinload(MergeTemplate.mappings))
    )).scalar_one_or_none()
    if row is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="模板不存在")
    return row


async def _ensure_can_modify(db: AsyncSession, t: MergeTemplate, user: User) -> None:
    """改/删门禁:仅模板创建者本人或超级管理员可操作。"""
    if t.created_by == user.id:
        return
    if await _is_super_admin(user, db):
        return
    raise HTTPException(
        status.HTTP_403_FORBIDDEN, detail="只能操作自己创建的模板"
    )


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
        "mappings": [
            {
                "id": m.id,
                "name": m.name,
                "match_signature": m.match_signature,
                "sheet_kw": m.sheet_kw,
                "header_start": m.header_start,
                "header_end": m.header_end,
                "key_map": m.key_map,
                "column_map": m.column_map,
                "derived_fields": m.derived_fields,
                "derive_check": m.derive_check,
                "skip_tokens": m.skip_tokens,
            }
            for m in t.mappings
        ],
    }


@router.post("/templates", response_model=TemplateOut, status_code=status.HTTP_201_CREATED)
async def create_template(
    payload: TemplateIn,
    db: AsyncSession = Depends(get_session),
    user: User = Depends(require_op(MENU, "C")),
) -> TemplateOut:
    if (await db.execute(select(MergeTemplate).where(MergeTemplate.name == payload.name))).scalar_one_or_none():
        raise HTTPException(status.HTTP_409_CONFLICT, detail="模板名已存在")
    t = MergeTemplate(
        name=payload.name, description=payload.description,
        merge_keys=payload.merge_keys, std_fields=payload.std_fields,
        aggregate=payload.aggregate, created_by=user.id,
    )
    mapping_names: set[str] = set()
    for ms in payload.mappings:
        values = _validate_source_mapping(t, ms)
        if values["name"] in mapping_names:
            raise HTTPException(status.HTTP_409_CONFLICT, detail="映射名称已存在")
        mapping_names.add(values["name"])
        t.mappings.append(MergeSourceMapping(**values))
    db.add(t)
    await db.commit()
    await db.refresh(t, ["mappings"])
    return _template_out(t)


@router.put("/templates/{tid}", response_model=TemplateOut)
async def update_template(
    tid: int,
    payload: TemplateIn,
    db: AsyncSession = Depends(get_session),
    user: User = Depends(require_op(MENU, "U")),
) -> TemplateOut:
    t = await _load_template(db, tid)
    await _ensure_can_modify(db, t, user)
    t.name = payload.name
    t.description = payload.description
    t.merge_keys = payload.merge_keys
    t.std_fields = payload.std_fields
    t.aggregate = payload.aggregate
    existing_mappings = {mapping.id: mapping for mapping in t.mappings}
    names: set[str] = set()
    mapping_ids: set[int] = set()
    prepared: list[tuple[int | None, dict]] = []
    for ms in payload.mappings:
        values = _validate_source_mapping(t, ms)
        if ms.id is not None:
            if ms.id in mapping_ids:
                raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="映射 ID 不可重复")
            if ms.id not in existing_mappings:
                raise HTTPException(status.HTTP_404_NOT_FOUND, detail="源映射不存在")
            mapping_ids.add(ms.id)
        if values["name"] in names:
            raise HTTPException(status.HTTP_409_CONFLICT, detail="映射名称已存在")
        names.add(values["name"])
        prepared.append((ms.id, values))
    retained_ids = {mapping_id for mapping_id, _ in prepared if mapping_id is not None}
    for mapping_id, mapping in existing_mappings.items():
        if mapping_id not in retained_ids:
            await db.delete(mapping)
    for mapping_id, values in prepared:
        if mapping_id is None:
            t.mappings.append(MergeSourceMapping(**values))
        else:
            _apply_source_mapping(existing_mappings[mapping_id], values)
    t.version += 1
    await db.commit()
    await db.refresh(t, ["mappings"])
    return _template_out(t)


@router.post("/templates/{tid}/mappings/batch", status_code=status.HTTP_201_CREATED)
async def create_source_mappings_batch(
    tid: int,
    payload: SourceMappingBatchIn,
    db: AsyncSession = Depends(get_session),
    user: User = Depends(require_op(MENU, "U")),
) -> dict:
    """校验全部源映射后原子新增，避免批量上传产生部分写入。"""
    template = await _load_template(db, tid)
    await _ensure_can_modify(db, template, user)
    names = {item.name for item in template.mappings}
    prepared: list[dict] = []
    for mapping in payload.mappings:
        values = _validate_source_mapping(template, mapping)
        if values["name"] in names:
            raise HTTPException(status.HTTP_409_CONFLICT, detail=f"映射名称已存在: {values['name']}")
        names.add(values["name"])
        prepared.append(values)

    created = [MergeSourceMapping(**values) for values in prepared]
    template.mappings.extend(created)
    template.version += 1
    await db.commit()
    for mapping in created:
        await db.refresh(mapping)
    return {"mappings": [_mapping_out(mapping) for mapping in created]}

# ── 单条源映射维护 ──────────────────────────────────────────
@router.post("/templates/{tid}/mappings", status_code=status.HTTP_201_CREATED)
async def create_source_mapping(tid: int, payload: SourceMappingIn, db: AsyncSession = Depends(get_session), user: User = Depends(require_op(MENU, "U"))) -> dict:
    template = await _load_template(db, tid)
    await _ensure_can_modify(db, template, user)
    values = _validate_source_mapping(template, payload)
    if any(item.name == values["name"] for item in template.mappings):
        raise HTTPException(status.HTTP_409_CONFLICT, detail="映射名称已存在")
    mapping = MergeSourceMapping(**values)
    template.mappings.append(mapping)
    template.version += 1
    await db.commit()
    await db.refresh(mapping)
    return _mapping_out(mapping)


@router.put("/templates/{tid}/mappings/{mid}")
async def update_source_mapping(tid: int, mid: int, payload: SourceMappingIn, db: AsyncSession = Depends(get_session), user: User = Depends(require_op(MENU, "U"))) -> dict:
    template = await _load_template(db, tid)
    await _ensure_can_modify(db, template, user)
    mapping = next((item for item in template.mappings if item.id == mid), None)
    if mapping is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="源映射不存在")
    values = _validate_source_mapping(template, payload)
    if any(item.id != mid and item.name == values["name"] for item in template.mappings):
        raise HTTPException(status.HTTP_409_CONFLICT, detail="映射名称已存在")
    _apply_source_mapping(mapping, values)
    template.version += 1
    await db.commit()
    await db.refresh(mapping)
    return _mapping_out(mapping)


@router.delete("/templates/{tid}/mappings/{mid}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_source_mapping(tid: int, mid: int, db: AsyncSession = Depends(get_session), user: User = Depends(require_op(MENU, "D"))) -> Response:
    template = await _load_template(db, tid)
    await _ensure_can_modify(db, template, user)
    mapping = next((item for item in template.mappings if item.id == mid), None)
    if mapping is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="源映射不存在")
    await db.delete(mapping)
    template.version += 1
    await db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)

@router.delete("/templates/{tid}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_template(
    tid: int,
    db: AsyncSession = Depends(get_session),
    user: User = Depends(require_op(MENU, "D")),
) -> Response:
    t = await _load_template(db, tid)
    await _ensure_can_modify(db, t, user)
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
    custom_functions = await executable_functions(db)
    result = engine.run_merge(blobs, template, mappings, custom_functions)
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
    custom_functions = await executable_functions(db)
    result = engine.run_merge(blobs, template, mappings, custom_functions)
    xlsx = engine.rows_to_xlsx(result["columns"], result["rows"])
    return Response(
        content=xlsx,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": 'attachment; filename="merged_result.xlsx"'},
    )


@router.post("/templates/{tid}/mapping-drafts", response_model=MappingDraftsOut)
async def mapping_drafts(
    tid: int,
    files: list[UploadFile] = File(...),
    business_context: str = "",
    db: AsyncSession = Depends(get_session),
    user: User = Depends(require_op(MENU, "U")),
) -> MappingDraftsOut:
    """批量上传样表，为既有模板生成待确认的源映射草稿。"""
    template = await _load_template(db, tid)
    await _ensure_can_modify(db, template, user)
    capability = get_capability(AI_DRAFT_CAPABILITY)
    if capability is None:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, detail="AI 能力未注册")
    try:
        validate_capability_policy(capability)
    except Exception as exc:
        raise HTTPException(status.HTTP_403_FORBIDDEN, detail=f"AI 能力未启用: {exc}") from exc

    blobs = await _read_files(files)
    timer = AiAuditTimer()
    timer.add_event("entry", capability_id=AI_DRAFT_CAPABILITY)
    status_text = "ok"
    error: str | None = None
    mappings: list[dict] = []
    try:
        timer.add_event("model_call", capability_id=AI_DRAFT_CAPABILITY)
        mappings = await ai_builder.build_mapping_drafts(
            blobs, template.std_fields, template.merge_keys, business_context, db,
        )
        enforce_output_deny_patterns(capability, _draft_scan_text({"std_fields": [], "mappings": mappings}))
    except Exception as exc:
        status_text = "error"
        error = str(exc)

    await record_ai_log(
        db=db,
        user=user,
        action="table_merge_suggest_mapping",
        request_summary=f"批量单映射草稿 {len(blobs)} 个文件 {business_context[:60]}",
        response_summary=f"生成 {len(mappings)} 条映射草稿" if status_text == "ok" else (error or ""),
        input_payload={"files": [name for name, _ in blobs], "business_context": business_context},
        output_payload={"mapping": _draft_scan_text({"std_fields": [], "mappings": mappings})},
        status=status_text,
        error=error,
        metadata={"capability_id": AI_DRAFT_CAPABILITY, "metadata_only": True},
        timer=timer,
    )
    await db.commit()
    if status_text != "ok":
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, detail=error or "AI 生成失败")

    low_confidence = [
        {"sheet": mapping["name"], "confidence": float(mapping.get("_confidence", 0.0)), "notes": mapping.get("_notes", "")}
        for mapping in mappings
        if float(mapping.get("_confidence", 0.0)) < 0.85
    ]
    return MappingDraftsOut(mappings=mappings, low_confidence=low_confidence, warnings=[])

@router.post("/templates/{tid}/mapping-draft", response_model=MappingDraftOut)
async def mapping_draft(
    tid: int,
    file: UploadFile = File(...),
    sheet_name: str | None = None,
    header_start: int = 1,
    header_end: int = 1,
    business_context: str = "",
    db: AsyncSession = Depends(get_session),
    user: User = Depends(require_op(MENU, "U")),
) -> dict:
    """只发送有效表头与既有模板字段，生成一条待人工确认的 AI 映射草稿。"""
    template = await _load_template(db, tid)
    await _ensure_can_modify(db, template, user)
    filename = file.filename or ""
    if not filename.lower().endswith(".xlsx"):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="请上传 .xlsx Excel 文件")
    if not 1 <= header_start <= header_end <= 10:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="表头行范围必须在 1 到 10 行之间")
    content = await file.read()
    if len(content) > 10 * 1024 * 1024:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="样表不得超过 10MB")
    try:
        workbook = openpyxl.load_workbook(io.BytesIO(content), data_only=True)
    except Exception as exc:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, detail=f"Excel 解析失败: {exc}") from exc
    try:
        if sheet_name and sheet_name not in workbook.sheetnames:
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, detail="指定 Sheet 不存在")
        worksheet = workbook[sheet_name] if sheet_name else workbook.active
        headers = [item for item in engine.parse_header(worksheet, header_start, header_end) if item]
        if not headers:
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, detail="未解析到有效表头")
        fallback = {
            "name": f"{filename.rsplit('.', 1)[0]}-映射", "match_signature": headers[:3],
            "sheet_kw": worksheet.title, "header_start": header_start, "header_end": header_end,
            "key_map": {}, "column_map": {}, "derived_fields": [], "derive_check": None,
            "skip_tokens": ["合计", "小计", "总计"], "_confidence": 0.0,
            "_notes": "AI 不可用，已生成表头草稿，请手工配置映射。",
        }
        timer = AiAuditTimer()
        timer.add_event("entry", capability_id=AI_DRAFT_CAPABILITY)
        capability = get_capability(AI_DRAFT_CAPABILITY)
        warning: str | None = None
        mapping = fallback
        status_text = "fallback"
        if capability is None:
            warning = "AI 能力未注册，已切换为手工草稿"
        else:
            try:
                validate_capability_policy(capability)
                timer.add_event("model_call", capability_id=AI_DRAFT_CAPABILITY)
                mapping = await ai_builder.build_mapping_draft(
                    {"file": filename, "sheet": worksheet.title, "columns": headers,
                     "header_start": header_start, "header_end": header_end},
                    template.std_fields, template.merge_keys, business_context, db,
                )
                enforce_output_deny_patterns(capability, _draft_scan_text({"std_fields": [], "mappings": [mapping]}))
                status_text = "ok"
            except Exception as exc:
                warning = f"AI 建议不可用，已切换为手工草稿：{exc}"
        confidence = float(mapping.get("_confidence", 0.0))
        await record_ai_log(
            db=db, user=user, action="table_merge_suggest_mapping",
            request_summary=f"单映射草稿 {filename}/{worksheet.title}",
            response_summary=f"置信度 {confidence:.2f}" if status_text == "ok" else (warning or ""),
            input_payload={"file": filename, "sheet": worksheet.title, "headers": headers, "business_context": business_context},
            output_payload={"mapping": _draft_scan_text({"std_fields": [], "mappings": [mapping]})},
            status=status_text, error=warning, metadata={"capability_id": AI_DRAFT_CAPABILITY, "metadata_only": True}, timer=timer,
        )
        await db.commit()
        return {
            "mapping": mapping, "available_sheets": workbook.sheetnames, "effective_headers": headers,
            "low_confidence": ([{"sheet": worksheet.title, "confidence": confidence, "notes": mapping.get("_notes", "")}]
                               if confidence < 0.85 else []),
            "warnings": [warning] if warning else [],
        }
    finally:
        workbook.close()
# ── AI 建模板草稿(走 004 底座:capability 注册 + 策略闸门 + 输出 deny + 审计)──────

@router.post("/ai-draft")
async def ai_draft(
    files: list[UploadFile] = File(...),
    business_context: str = "",
    db: AsyncSession = Depends(get_session),
    user: User = Depends(require_op(MENU, "E")),
) -> dict:
    """上传文件 + 可选业务背景 → AI 生成归集模板草稿（不存库）。

    AI 接入受 004 底座管控:能力注册表 + 策略闸门 + 输出 deny 扫描 + 统一审计。
    只发表头给模型(ai_builder 内只解析表头列名),明细行不进上下文(§4.8)。
    返回结构兼容 TemplateIn,附带 _meta.low_confidence 供前端标红。前端确认后 POST /templates 存库。
    """
    timer = AiAuditTimer()
    timer.add_event("entry", capability_id=AI_DRAFT_CAPABILITY)

    capability = get_capability(AI_DRAFT_CAPABILITY)
    if capability is None:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, detail="AI 能力未注册")
    try:
        validate_capability_policy(capability)
    except Exception as e:
        raise HTTPException(status.HTTP_403_FORBIDDEN, detail=f"AI 能力未启用: {e}")

    blobs = await _read_files(files)
    status_text = "ok"
    error: str | None = None
    draft: dict[str, Any] = {}
    try:
        timer.add_event("model_call", capability_id=AI_DRAFT_CAPABILITY)
        draft = await ai_builder.build_draft(blobs, business_context, db)
        # 输出级 deny:扫描 AI 产出的标准字段/映射文本,拦截 SQL/代码/URL 等注入
        enforce_output_deny_patterns(capability, _draft_scan_text(draft))
    except ValueError as e:
        status_text = "error"
        error = str(e)
    except Exception as e:  # policy deny 等
        status_text = "error"
        error = str(e)

    await record_ai_log(
        db=db,
        user=user,
        action="table_merge_suggest_mapping",
        request_summary=f"{len(blobs)}个文件 {business_context[:60]}",
        response_summary=f"{len(draft.get('std_fields', []))}个标准字段/{len(draft.get('mappings', []))}个源映射" if status_text == "ok" else (error or ""),
        input_payload={"files": [n for n, _ in blobs], "business_context": business_context},
        output_payload={"std_fields": draft.get("std_fields", []), "meta": draft.get("_meta", {})},
        status=status_text,
        error=error,
        metadata={"capability_id": AI_DRAFT_CAPABILITY},
        timer=timer,
    )
    await db.commit()

    if status_text != "ok":
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, detail=error or "AI 生成失败")
    return draft


def _draft_scan_text(draft: dict[str, Any]) -> str:
    """把草稿里模型生成的文本(标准字段名 + 各源 column_map/derived 表达式)拼起来供 deny 扫描。"""
    parts: list[str] = list(draft.get("std_fields") or [])
    for m in draft.get("mappings") or []:
        parts.extend((m.get("column_map") or {}).keys())
        parts.extend(str(v) for v in (m.get("column_map") or {}).values())
        for d in m.get("derived_fields") or []:
            parts.append(str(d.get("expr", "")))
            parts.append(str(d.get("target", "")))
    return "\n".join(parts)
