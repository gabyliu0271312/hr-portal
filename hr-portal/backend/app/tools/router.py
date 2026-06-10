from __future__ import annotations

import calendar
import hashlib
from datetime import date, datetime, timedelta
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP
from typing import Any

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile, status
from fastapi.responses import Response
from pydantic import BaseModel, Field
from sqlalchemy import cast, desc, func, or_, select
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.db import get_session
from app.core.deps import current_user, require_op
from app.data.models import EmpRealtimeRoster
from app.permissions.masker import get_sensitive_columns
from app.permissions.scope_filter import build_scope_filter, is_unrestricted
from app.tools import agreement as agreement_svc
from app.tools import document_templates as template_svc
from app.tools import income_certificate as income_cert_svc
from app.tools.models import (
    CompensationCap,
    DocumentGenerationLog,
    DocumentTemplate,
    DocumentTemplateBlock,
    DocumentTemplateVariable,
    InstallmentRule,
)
from app.users.models import User


router = APIRouter(prefix="/tools", tags=["tools"])


class CompensationCapIn(BaseModel):
    region: str = Field(min_length=1, max_length=64)
    effective_start: date
    effective_end: date
    cap_amount: float = Field(gt=0)
    note: str | None = None


class CompensationCapOut(BaseModel):
    id: int
    region: str
    effective_start: date
    effective_end: date
    cap_amount: float
    note: str | None
    created_at: datetime
    updated_at: datetime


class EmployeeCandidate(BaseModel):
    id: int
    employee_no: str | None
    name: str | None
    chinese_name: str | None
    english_name: str | None
    company: str | None
    department: str | None
    work_region: str | None
    employment_status: str | None
    hire_date: str | None
    leave_date: str | None


class CompensationCalcIn(BaseModel):
    employee_id: int
    leave_date: date | None = None
    plan: str = "N+1"
    region: str | None = None


class CompensationCalcOut(BaseModel):
    employee: EmployeeCandidate
    hire_date: date
    leave_date: date
    work_region: str
    basic_salary: float
    cap_amount: float
    compensation_base: float
    service_years_n: float
    plan: str
    n_amount: float
    extra_amount: float
    total_amount: float
    cap_rule_id: int


class DocumentTemplateBlockIn(BaseModel):
    block_type: str = Field(min_length=1, max_length=32)
    content: str = ""
    display_order: int = 10
    style_config: dict[str, Any] = Field(default_factory=dict)


class DocumentTemplateVariableIn(BaseModel):
    variable_code: str = Field(min_length=1, max_length=64, pattern=r"^[a-zA-Z_][a-zA-Z0-9_]*$")
    variable_name: str = Field(min_length=1, max_length=128)
    source_type: str = Field(default="manual", max_length=32)
    source_key: str | None = Field(default=None, max_length=128)
    default_value: str | None = None
    required: bool = False
    formatter: str | None = Field(default=None, max_length=32)


class DocumentTemplateIn(BaseModel):
    code: str = Field(min_length=1, max_length=64, pattern=r"^[a-zA-Z][a-zA-Z0-9_]*$")
    name: str = Field(min_length=1, max_length=128)
    business_type: str = Field(min_length=1, max_length=64)
    description: str | None = None
    is_active: bool = True
    version: str = Field(default="1.0", max_length=32)
    effective_start: date | None = None
    effective_end: date | None = None
    layout_config: dict[str, Any] = Field(default_factory=dict)
    blocks: list[DocumentTemplateBlockIn] = Field(default_factory=list)
    variables: list[DocumentTemplateVariableIn] = Field(default_factory=list)


class DocumentTemplateBlockOut(DocumentTemplateBlockIn):
    id: int


class DocumentTemplateVariableOut(DocumentTemplateVariableIn):
    id: int


class DocumentTemplateOut(BaseModel):
    id: int
    code: str
    name: str
    business_type: str
    description: str | None
    is_active: bool
    version: str
    effective_start: date | None
    effective_end: date | None
    layout_config: dict[str, Any]
    template_file_name: str | None
    template_file_size: int | None
    parsed_variables: list[str] = Field(default_factory=list)
    uploaded_at: datetime | None
    created_at: datetime
    updated_at: datetime
    blocks: list[DocumentTemplateBlockOut] = Field(default_factory=list)
    variables: list[DocumentTemplateVariableOut] = Field(default_factory=list)


class DocumentTemplatePreviewIn(BaseModel):
    sample_data: dict[str, Any] = Field(default_factory=dict)


class DocumentTemplatePreviewOut(BaseModel):
    html: str
    plain_text: str


class DocumentTemplateUploadOut(BaseModel):
    id: int
    file_name: str
    file_size: int
    parsed_variables: list[str]


class EditableDraftIn(BaseModel):
    draft_html: str | None = Field(default=None, max_length=300_000)
    manually_adjusted: bool = False


_SEARCH_FIELDS = ["工号", "姓名", "姓名（中文名）", "英文名"]
_REGION_FIELDS = ["工作地", "工作地点", "工作城市", "办公地点", "办公城市", "城市", "地区", "常驻地"]
_DEPT_FIELDS = ["五级部门", "四级部门", "三级部门", "二级部门", "一级部门", "公司级组织"]


def _raw_text(col_code: str):
    return func.jsonb_extract_path_text(cast(EmpRealtimeRoster.raw, JSONB), col_code)


def _first(raw: dict[str, Any], *keys: str) -> str | None:
    for key in keys:
        value = raw.get(key)
        if value not in (None, ""):
            return str(value).strip()
    return None


def _to_candidate(row: EmpRealtimeRoster) -> EmployeeCandidate:
    raw = row.raw or {}
    return EmployeeCandidate(
        id=row.id,
        employee_no=_first(raw, "工号"),
        name=_first(raw, "姓名", "姓名（中文名）"),
        chinese_name=_first(raw, "姓名（中文名）", "corehr_employeeinformation_extzhongwenming_609153_78242362_alias"),
        english_name=_first(raw, "英文名"),
        company=_first(raw, "公司名称"),
        department=_first(raw, *_DEPT_FIELDS),
        work_region=_first(raw, *_REGION_FIELDS),
        employment_status=_first(raw, "人员状态"),
        hire_date=_first(raw, "入职日期", "1b725de4-7e51-4888-ab05-dc435bb511f8_original"),
        leave_date=_first(raw, "离职日期", "9e0a9a5d-f3d8-4262-84a4-9f1c7dc4c0ce_original"),
    )


def _parse_date(value: Any, field: str) -> date:
    if isinstance(value, date):
        return value
    if value in (None, ""):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail=f"缺少{field}")
    s = str(value).strip().replace("/", "-")
    for fmt in ("%Y-%m-%d", "%Y-%m-%d %H:%M:%S"):
        try:
            return datetime.strptime(s[:19] if " " in fmt else s[:10], fmt).date()
        except ValueError:
            pass
    raise HTTPException(status.HTTP_400_BAD_REQUEST, detail=f"{field}格式无法识别: {value}")


def _parse_money(value: Any, field: str) -> Decimal:
    if value in (None, ""):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail=f"缺少{field}")
    s = str(value).strip().replace(",", "").replace("￥", "").replace("元", "")
    try:
        amount = Decimal(s)
    except (InvalidOperation, ValueError) as e:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail=f"{field}不是有效金额: {value}") from e
    if amount < 0:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail=f"{field}不能为负数")
    return amount


def _add_months(d: date, months: int) -> date:
    month_index = d.month - 1 + months
    year = d.year + month_index // 12
    month = month_index % 12 + 1
    day = min(d.day, calendar.monthrange(year, month)[1])
    return date(year, month, day)


def _datedif_years(start: date, end: date) -> int:
    years = end.year - start.year
    if _add_months(start, years * 12) > end:
        years -= 1
    return max(years, 0)


def _service_years(start: date, end: date) -> Decimal:
    if end < start:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="离职日期不能早于入职日期")
    years = _datedif_years(start, end)
    shifted_end = _add_months(end, -12 * years)
    half_year_line = _add_months(start, 6) - timedelta(days=1)
    extra = Decimal("0.5") if shifted_end < half_year_line else Decimal("1")
    return Decimal(years) + extra


def _money(value: Decimal) -> Decimal:
    return value.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


def _cap_out(row: CompensationCap) -> CompensationCapOut:
    return CompensationCapOut(
        id=row.id,
        region=row.region,
        effective_start=row.effective_start,
        effective_end=row.effective_end,
        cap_amount=float(row.cap_amount),
        note=row.note,
        created_at=row.created_at,
        updated_at=row.updated_at,
    )


def _template_block_out(row: DocumentTemplateBlock) -> DocumentTemplateBlockOut:
    return DocumentTemplateBlockOut(
        id=row.id,
        block_type=row.block_type,
        content=row.content,
        display_order=row.display_order,
        style_config=row.style_config or {},
    )


def _template_variable_out(row: DocumentTemplateVariable) -> DocumentTemplateVariableOut:
    return DocumentTemplateVariableOut(
        id=row.id,
        variable_code=row.variable_code,
        variable_name=row.variable_name,
        source_type=row.source_type,
        source_key=row.source_key,
        default_value=row.default_value,
        required=row.required,
        formatter=row.formatter,
    )


def _template_out(row: DocumentTemplate) -> DocumentTemplateOut:
    return DocumentTemplateOut(
        id=row.id,
        code=row.code,
        name=row.name,
        business_type=row.business_type,
        description=row.description,
        is_active=row.is_active,
        version=row.version,
        effective_start=row.effective_start,
        effective_end=row.effective_end,
        layout_config=row.layout_config or {},
        template_file_name=row.template_file_name,
        template_file_size=row.template_file_size,
        parsed_variables=list(row.parsed_variables or []),
        uploaded_at=row.uploaded_at,
        created_at=row.created_at,
        updated_at=row.updated_at,
        blocks=[_template_block_out(b) for b in sorted(row.blocks, key=lambda b: b.display_order)],
        variables=[_template_variable_out(v) for v in row.variables],
    )


def _validate_template_payload(payload: DocumentTemplateIn) -> None:
    if payload.business_type not in template_svc.VALID_BUSINESS_TYPES:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="不支持的模板业务类型")
    if payload.effective_start and payload.effective_end and payload.effective_end < payload.effective_start:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="生效结束日期不能早于开始日期")
    variable_codes = [v.variable_code for v in payload.variables]
    if len(variable_codes) != len(set(variable_codes)):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="变量编码不能重复")
    for variable in payload.variables:
        if variable.source_type not in template_svc.VALID_SOURCE_TYPES:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, detail=f"不支持的变量来源类型: {variable.source_type}")


async def _load_template_by_id(db: AsyncSession, template_id: int) -> DocumentTemplate | None:
    return (
        await db.execute(
            select(DocumentTemplate)
            .options(selectinload(DocumentTemplate.blocks), selectinload(DocumentTemplate.variables))
            .where(DocumentTemplate.id == template_id)
        )
    ).scalar_one_or_none()


async def _load_template_by_code(db: AsyncSession, code: str) -> DocumentTemplate | None:
    return (
        await db.execute(
            select(DocumentTemplate)
            .options(selectinload(DocumentTemplate.blocks), selectinload(DocumentTemplate.variables))
            .where(DocumentTemplate.code == code)
        )
    ).scalar_one_or_none()


async def _load_active_template(
    db: AsyncSession,
    business_type: str,
    code: str | None = None,
) -> DocumentTemplate:
    today = date.today()
    stmt = (
        select(DocumentTemplate)
        .options(selectinload(DocumentTemplate.blocks), selectinload(DocumentTemplate.variables))
        .where(
            DocumentTemplate.business_type == business_type,
            DocumentTemplate.is_active.is_(True),
            or_(DocumentTemplate.effective_start.is_(None), DocumentTemplate.effective_start <= today),
            or_(DocumentTemplate.effective_end.is_(None), DocumentTemplate.effective_end >= today),
        )
        .order_by(DocumentTemplate.code)
    )
    if code:
        stmt = stmt.where(DocumentTemplate.code == code)
    row = (await db.execute(stmt.limit(1))).scalar_one_or_none()
    if row is None:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="未找到可用模板，请先在模板维护中配置并启用")
    return row


async def _save_template_children(
    row: DocumentTemplate,
    payload: DocumentTemplateIn,
    db: AsyncSession,
) -> None:
    blocks = (
        await db.execute(
            select(DocumentTemplateBlock).where(DocumentTemplateBlock.template_id == row.id)
        )
    ).scalars().all()
    for block in blocks:
        await db.delete(block)
    variables = (
        await db.execute(
            select(DocumentTemplateVariable).where(DocumentTemplateVariable.template_id == row.id)
        )
    ).scalars().all()
    for variable in variables:
        await db.delete(variable)
    await db.flush()
    for block in payload.blocks:
        db.add(
            DocumentTemplateBlock(
                template_id=row.id,
                block_type=block.block_type,
                content=block.content,
                display_order=block.display_order,
                style_config=block.style_config or {},
            )
        )
    for variable in payload.variables:
        db.add(
            DocumentTemplateVariable(
                template_id=row.id,
                variable_code=variable.variable_code,
                variable_name=variable.variable_name,
                source_type=variable.source_type,
                source_key=variable.source_key,
                default_value=variable.default_value,
                required=variable.required,
                formatter=variable.formatter,
            )
        )


async def _merge_parsed_variables(
    row: DocumentTemplate,
    parsed_variables: list[str],
    db: AsyncSession,
) -> None:
    existing = {variable.variable_code for variable in row.variables}
    defaults = _default_variable_map(row.business_type)
    for code in parsed_variables:
        if code in existing:
            continue
        cfg = defaults.get(code)
        db.add(
            DocumentTemplateVariable(
                template_id=row.id,
                variable_code=code,
                variable_name=cfg.get("variable_name", code) if cfg else code,
                source_type=cfg.get("source_type", "manual") if cfg else "manual",
                source_key=cfg.get("source_key") if cfg else None,
                default_value=cfg.get("default_value") if cfg else None,
                required=cfg.get("required", False) if cfg else False,
                formatter=cfg.get("formatter") if cfg else None,
            )
        )


def _default_variable_map(business_type: str) -> dict[str, dict[str, Any]]:
    for tpl in template_svc.DEFAULT_TEMPLATES:
        if tpl.get("business_type") == business_type:
            return {item["variable_code"]: item for item in tpl.get("variables", [])}
    return {}


def _render_template_plain_text(row: DocumentTemplate, values: dict[str, Any]) -> str:
    if row.template_file:
        return template_svc.render_docx_plain_text(row.template_file, values, row.variables, row.business_type)
    blocks = template_svc.render_template_blocks(row.blocks, values, row.variables, row.business_type)
    return "\n".join(text for text, _kind in blocks if text)


def _render_template_html(row: DocumentTemplate, values: dict[str, Any]) -> str:
    if row.template_file:
        plain = _render_template_plain_text(row, values)
        escaped = plain.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
        return f'<pre class="template-docx-preview">{escaped}</pre>'
    blocks = template_svc.render_template_blocks(row.blocks, values, row.variables, row.business_type)
    if row.business_type == "agreement":
        return agreement_svc.render_html(values, blocks)
    if row.business_type == "income_certificate":
        return income_cert_svc.render_html(values, blocks)
    return f"<pre>{_render_template_plain_text(row, values)}</pre>"


def _raw_template_blocks(row: DocumentTemplate) -> list[tuple[str, str]]:
    if row.blocks:
        return [
            (block.content, block.block_type)
            for block in sorted(row.blocks, key=lambda item: item.display_order)
        ]
    for tpl in template_svc.DEFAULT_TEMPLATES:
        if tpl.get("code") == row.code:
            return [
                (block.get("content", ""), block.get("block_type", "paragraph"))
                for block in tpl.get("blocks", [])
            ]
    for tpl in template_svc.DEFAULT_TEMPLATES:
        if tpl.get("business_type") == row.business_type:
            return [
                (block.get("content", ""), block.get("block_type", "paragraph"))
                for block in tpl.get("blocks", [])
            ]
    return [(row.name, "title")]


def _render_downloadable_template_docx(row: DocumentTemplate) -> bytes:
    blocks = _raw_template_blocks(row)
    if row.business_type == "agreement":
        return agreement_svc.render_docx({}, blocks)
    if row.business_type == "income_certificate":
        return income_cert_svc.render_docx({}, blocks)
    html = "".join(f"<p>{text}</p>" for text, _kind in blocks)
    return template_svc.render_preview_html_docx(html, row.business_type)


def _draft_hash(html: str | None) -> str | None:
    if not html:
        return None
    return hashlib.sha256(html.encode("utf-8")).hexdigest()


def _render_edited_preview_docx(template: DocumentTemplate, draft_html: str) -> bytes:
    blocks = template_svc.extract_blocks_from_preview_html(draft_html)
    if not blocks:
        return template_svc.render_preview_html_docx(draft_html, template.business_type)
    if template.business_type == "agreement":
        return agreement_svc.render_docx({}, blocks)
    if template.business_type == "income_certificate":
        return income_cert_svc.render_docx({}, blocks)
    return template_svc.render_preview_html_docx(draft_html, template.business_type)


async def _record_document_generation(
    *,
    db: AsyncSession,
    user: User,
    business_type: str,
    action: str,
    template: DocumentTemplate,
    subject_name: str | None,
    manually_adjusted: bool,
    draft_html: str | None,
    context: dict[str, Any] | None = None,
) -> None:
    db.add(
        DocumentGenerationLog(
            business_type=business_type,
            action=action,
            template_code=template.code,
            template_name=template.name,
            subject_name=subject_name,
            manually_adjusted=manually_adjusted,
            draft_hash=_draft_hash(draft_html),
            draft_length=len(draft_html or "") if draft_html else None,
            context=context or {},
            created_by=user.id,
        )
    )
    await db.commit()


async def _ensure_valid_cap_period(
    payload: CompensationCapIn,
    db: AsyncSession,
    exclude_id: int | None = None,
) -> None:
    if payload.effective_end < payload.effective_start:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="生效结束日期不能早于开始日期")
    stmt = select(CompensationCap).where(
        CompensationCap.region == payload.region.strip(),
        CompensationCap.effective_start <= payload.effective_end,
        CompensationCap.effective_end >= payload.effective_start,
    )
    if exclude_id is not None:
        stmt = stmt.where(CompensationCap.id != exclude_id)
    if (await db.execute(stmt.limit(1))).scalar_one_or_none() is not None:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="同地区生效期间不能重叠")


async def _get_matching_cap(region: str, leave_date: date, db: AsyncSession) -> CompensationCap:
    row = (
        await db.execute(
            select(CompensationCap)
            .where(
                CompensationCap.region == region,
                CompensationCap.effective_start <= leave_date,
                CompensationCap.effective_end >= leave_date,
            )
            .order_by(desc(CompensationCap.effective_start), desc(CompensationCap.id))
            .limit(1)
        )
    ).scalar_one_or_none()
    if row is None:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            detail=f"未找到地区「{region}」在 {leave_date.isoformat()} 生效的补偿金上限",
        )
    return row


@router.get(
    "/compensation-caps",
    response_model=list[CompensationCapOut],
    dependencies=[Depends(require_op("system.compensation_caps", "V"))],
)
async def list_compensation_caps(
    region: str | None = None,
    keyword: str | None = None,
    db: AsyncSession = Depends(get_session),
) -> list[CompensationCapOut]:
    stmt = select(CompensationCap).order_by(CompensationCap.region, desc(CompensationCap.effective_start))
    if region:
        stmt = stmt.where(CompensationCap.region == region.strip())
    if keyword:
        stmt = stmt.where(CompensationCap.region.ilike(f"%{keyword.strip()}%"))
    rows = (await db.execute(stmt)).scalars().all()
    return [_cap_out(r) for r in rows]


@router.post(
    "/compensation-caps",
    response_model=CompensationCapOut,
    dependencies=[Depends(require_op("system.compensation_caps", "C"))],
)
async def create_compensation_cap(
    payload: CompensationCapIn,
    db: AsyncSession = Depends(get_session),
) -> CompensationCapOut:
    await _ensure_valid_cap_period(payload, db)
    row = CompensationCap(
        region=payload.region.strip(),
        effective_start=payload.effective_start,
        effective_end=payload.effective_end,
        cap_amount=Decimal(str(payload.cap_amount)),
        note=payload.note,
    )
    db.add(row)
    await db.commit()
    await db.refresh(row)
    return _cap_out(row)


@router.put(
    "/compensation-caps/{cap_id}",
    response_model=CompensationCapOut,
    dependencies=[Depends(require_op("system.compensation_caps", "U"))],
)
async def update_compensation_cap(
    cap_id: int,
    payload: CompensationCapIn,
    db: AsyncSession = Depends(get_session),
) -> CompensationCapOut:
    row = await db.get(CompensationCap, cap_id)
    if row is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="补偿金上限规则不存在")
    await _ensure_valid_cap_period(payload, db, exclude_id=cap_id)
    row.region = payload.region.strip()
    row.effective_start = payload.effective_start
    row.effective_end = payload.effective_end
    row.cap_amount = Decimal(str(payload.cap_amount))
    row.note = payload.note
    await db.commit()
    await db.refresh(row)
    return _cap_out(row)


@router.delete(
    "/compensation-caps/{cap_id}",
    dependencies=[Depends(require_op("system.compensation_caps", "D"))],
)
async def delete_compensation_cap(
    cap_id: int,
    db: AsyncSession = Depends(get_session),
) -> dict[str, Any]:
    row = await db.get(CompensationCap, cap_id)
    if row is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="补偿金上限规则不存在")
    await db.delete(row)
    await db.commit()
    return {"ok": True}


# ============ 文档模板维护 ============


@router.get(
    "/document-templates",
    response_model=list[DocumentTemplateOut],
    dependencies=[Depends(require_op("system.document_templates", "V"))],
)
async def list_document_templates(
    business_type: str | None = None,
    keyword: str | None = None,
    db: AsyncSession = Depends(get_session),
) -> list[DocumentTemplateOut]:
    stmt = (
        select(DocumentTemplate)
        .options(selectinload(DocumentTemplate.blocks), selectinload(DocumentTemplate.variables))
        .order_by(DocumentTemplate.business_type, DocumentTemplate.code)
    )
    if business_type:
        stmt = stmt.where(DocumentTemplate.business_type == business_type.strip())
    if keyword:
        kw = f"%{keyword.strip()}%"
        stmt = stmt.where(or_(DocumentTemplate.code.ilike(kw), DocumentTemplate.name.ilike(kw)))
    rows = (await db.execute(stmt)).scalars().all()
    return [_template_out(row) for row in rows]


@router.get(
    "/document-templates/{template_id}",
    response_model=DocumentTemplateOut,
    dependencies=[Depends(require_op("system.document_templates", "V"))],
)
async def get_document_template(
    template_id: int,
    db: AsyncSession = Depends(get_session),
) -> DocumentTemplateOut:
    row = await _load_template_by_id(db, template_id)
    if row is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="模板不存在")
    return _template_out(row)


@router.post(
    "/document-templates/{template_id}/word",
    response_model=DocumentTemplateUploadOut,
    dependencies=[Depends(require_op("system.document_templates", "U"))],
)
async def upload_document_template_word(
    template_id: int,
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_session),
) -> DocumentTemplateUploadOut:
    row = await _load_template_by_id(db, template_id)
    if row is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="模板不存在")
    filename = file.filename or ""
    if not filename.lower().endswith(".docx"):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="仅支持上传 .docx Word 模板")
    content = await file.read()
    if not content:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="上传文件不能为空")
    if len(content) > 10 * 1024 * 1024:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="Word 模板不能超过 10MB")
    try:
        parsed_variables = template_svc.extract_variables_from_docx(content)
    except Exception as exc:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="Word 模板解析失败，请确认文件格式正确") from exc
    row.template_file_name = filename
    row.template_file_content_type = file.content_type
    row.template_file_size = len(content)
    row.template_file = content
    row.parsed_variables = parsed_variables
    row.uploaded_at = datetime.now()
    await _merge_parsed_variables(row, parsed_variables, db)
    await db.commit()
    return DocumentTemplateUploadOut(
        id=row.id,
        file_name=filename,
        file_size=len(content),
        parsed_variables=parsed_variables,
    )


@router.get(
    "/document-templates/{template_id}/word",
    dependencies=[Depends(require_op("system.document_templates", "V"))],
)
async def download_document_template_word(
    template_id: int,
    db: AsyncSession = Depends(get_session),
) -> Response:
    row = await _load_template_by_id(db, template_id)
    if row is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="模板不存在")
    from urllib.parse import quote

    content = row.template_file or _render_downloadable_template_docx(row)
    filename = row.template_file_name or f"{row.code}_template.docx"
    return Response(
        content=content,
        media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        headers={"Content-Disposition": f"attachment; filename*=UTF-8''{quote(filename)}"},
    )


@router.post(
    "/document-templates",
    response_model=DocumentTemplateOut,
    dependencies=[Depends(require_op("system.document_templates", "C"))],
)
async def create_document_template(
    payload: DocumentTemplateIn,
    db: AsyncSession = Depends(get_session),
) -> DocumentTemplateOut:
    _validate_template_payload(payload)
    if await _load_template_by_code(db, payload.code):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="模板编码已存在")
    row = DocumentTemplate(
        code=payload.code,
        name=payload.name,
        business_type=payload.business_type,
        description=payload.description,
        is_active=payload.is_active,
        version=payload.version,
        effective_start=payload.effective_start,
        effective_end=payload.effective_end,
        layout_config=payload.layout_config or {},
    )
    db.add(row)
    await db.flush()
    await _save_template_children(row, payload, db)
    await db.commit()
    saved = await _load_template_by_id(db, row.id)
    assert saved is not None
    return _template_out(saved)


@router.put(
    "/document-templates/{template_id}",
    response_model=DocumentTemplateOut,
    dependencies=[Depends(require_op("system.document_templates", "U"))],
)
async def update_document_template(
    template_id: int,
    payload: DocumentTemplateIn,
    db: AsyncSession = Depends(get_session),
) -> DocumentTemplateOut:
    _validate_template_payload(payload)
    row = await _load_template_by_id(db, template_id)
    if row is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="模板不存在")
    existing = await _load_template_by_code(db, payload.code)
    if existing and existing.id != template_id:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="模板编码已存在")
    row.code = payload.code
    row.name = payload.name
    row.business_type = payload.business_type
    row.description = payload.description
    row.is_active = payload.is_active
    row.version = payload.version
    row.effective_start = payload.effective_start
    row.effective_end = payload.effective_end
    row.layout_config = payload.layout_config or {}
    await _save_template_children(row, payload, db)
    await db.commit()
    saved = await _load_template_by_id(db, row.id)
    assert saved is not None
    return _template_out(saved)


@router.delete(
    "/document-templates/{template_id}",
    dependencies=[Depends(require_op("system.document_templates", "D"))],
)
async def delete_document_template(
    template_id: int,
    db: AsyncSession = Depends(get_session),
) -> dict[str, Any]:
    row = await _load_template_by_id(db, template_id)
    if row is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="模板不存在")
    await db.delete(row)
    await db.commit()
    return {"ok": True}


@router.post(
    "/document-templates/{template_id}/preview",
    response_model=DocumentTemplatePreviewOut,
    dependencies=[Depends(require_op("system.document_templates", "V"))],
)
async def preview_document_template(
    template_id: int,
    payload: DocumentTemplatePreviewIn,
    db: AsyncSession = Depends(get_session),
) -> DocumentTemplatePreviewOut:
    row = await _load_template_by_id(db, template_id)
    if row is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="模板不存在")
    values = template_svc.sample_values(row.business_type)
    values.update(payload.sample_data or {})
    return DocumentTemplatePreviewOut(
        html=_render_template_html(row, values),
        plain_text=_render_template_plain_text(row, values),
    )


@router.get(
    "/compensation/employees",
    response_model=list[EmployeeCandidate],
    dependencies=[Depends(require_op("tools.compensation_calc", "V"))],
)
async def search_compensation_employees(
    keyword: str = Query(min_length=1),
    limit: int = Query(20, ge=1, le=50),
    user: User = Depends(current_user),
    db: AsyncSession = Depends(get_session),
) -> list[EmployeeCandidate]:
    kw = keyword.strip()
    stmt = select(EmpRealtimeRoster)
    scope_clause = await build_scope_filter(user, "emp_realtime_roster", db)
    if not is_unrestricted(scope_clause):
        stmt = stmt.where(scope_clause)
    stmt = stmt.where(or_(*[_raw_text(f).ilike(f"%{kw}%") for f in _SEARCH_FIELDS]))
    stmt = stmt.order_by(desc(EmpRealtimeRoster.synced_at), desc(EmpRealtimeRoster.id)).limit(limit)
    rows = (await db.execute(stmt)).scalars().all()
    return [_to_candidate(r) for r in rows]


@router.post(
    "/compensation/calculate",
    response_model=CompensationCalcOut,
    dependencies=[Depends(require_op("tools.compensation_calc", "V"))],
)
async def calculate_compensation(
    payload: CompensationCalcIn,
    user: User = Depends(current_user),
    db: AsyncSession = Depends(get_session),
) -> CompensationCalcOut:
    result, _raw = await _calc_core(payload, user, db)
    return result


async def _calc_core(
    payload: CompensationCalcIn,
    user: User,
    db: AsyncSession,
) -> tuple[CompensationCalcOut, dict[str, Any]]:
    plan = payload.plan.upper()
    if plan not in {"N", "N+1"}:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="补偿方案只能是 N 或 N+1")

    # Phase D 统一裁决：补偿金计算工具在薪酬白名单内时，无薪酬权限的 HRBP 也可使用基本工资。
    # 仅当该字段对「补偿金工具」仍不可用（既无分类权限、工具又不在白名单）才拒绝。
    from app.permissions.masker import get_hidden_columns
    hidden = await get_hidden_columns(user, "emp_realtime_roster", db, tool_key="compensation_calc")
    if "基本工资" in hidden:
        raise HTTPException(
            status.HTTP_403_FORBIDDEN,
            detail="无权限使用基本工资计算补偿金（请将补偿金计算加入薪酬分类的授权工具白名单）",
        )

    stmt = select(EmpRealtimeRoster).where(EmpRealtimeRoster.id == payload.employee_id)
    scope_clause = await build_scope_filter(user, "emp_realtime_roster", db)
    if not is_unrestricted(scope_clause):
        stmt = stmt.where(scope_clause)
    row = (await db.execute(stmt.limit(1))).scalar_one_or_none()
    if row is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="员工不存在或无数据权限")

    raw = row.raw or {}
    candidate = _to_candidate(row)
    hire_date = _parse_date(_first(raw, "入职日期", "1b725de4-7e51-4888-ab05-dc435bb511f8_original"), "入职日期")
    leave_date = payload.leave_date or _parse_date(_first(raw, "离职日期", "9e0a9a5d-f3d8-4262-84a4-9f1c7dc4c0ce_original"), "离职日期")
    region = (payload.region or candidate.work_region or "").strip()
    if not region:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="花名册未识别到工作地，请先补充工作地字段或手动选择地区")

    basic_salary = _parse_money(_first(raw, "基本工资"), "基本工资")
    cap = await _get_matching_cap(region, leave_date, db)
    cap_amount = Decimal(str(cap.cap_amount))
    compensation_base = min(basic_salary, cap_amount)
    service_n = _service_years(hire_date, leave_date)
    n_amount = _money(service_n * compensation_base)
    extra_amount = _money(basic_salary) if plan == "N+1" else Decimal("0.00")
    total_amount = _money(n_amount + extra_amount)

    result = CompensationCalcOut(
        employee=candidate,
        hire_date=hire_date,
        leave_date=leave_date,
        work_region=region,
        basic_salary=float(_money(basic_salary)),
        cap_amount=float(_money(cap_amount)),
        compensation_base=float(_money(compensation_base)),
        service_years_n=float(service_n),
        plan=plan,
        n_amount=float(n_amount),
        extra_amount=float(extra_amount),
        total_amount=float(total_amount),
        cap_rule_id=cap.id,
    )
    return result, raw


# ============ 分期规则配置 ============


class InstallmentRuleItem(BaseModel):
    period_no: int = Field(ge=1)
    ratio: float = Field(ge=0, le=100)
    months_after: int = Field(ge=0)
    pay_day: int = Field(ge=1, le=31)


class InstallmentRulesPut(BaseModel):
    rules: list[InstallmentRuleItem] = Field(min_length=1)


def _rule_item(row: InstallmentRule) -> InstallmentRuleItem:
    return InstallmentRuleItem(
        period_no=row.period_no,
        ratio=float(row.ratio),
        months_after=row.months_after,
        pay_day=row.pay_day,
    )


async def _load_rules(db: AsyncSession) -> list[InstallmentRule]:
    return list(
        (await db.execute(select(InstallmentRule).order_by(InstallmentRule.period_no))).scalars().all()
    )


@router.get(
    "/installment-rules",
    response_model=list[InstallmentRuleItem],
    dependencies=[Depends(require_op("system.compensation_caps", "V"))],
)
async def list_installment_rules(db: AsyncSession = Depends(get_session)) -> list[InstallmentRuleItem]:
    return [_rule_item(r) for r in await _load_rules(db)]


@router.put(
    "/installment-rules",
    response_model=list[InstallmentRuleItem],
    dependencies=[Depends(require_op("system.compensation_caps", "U"))],
)
async def replace_installment_rules(
    payload: InstallmentRulesPut,
    db: AsyncSession = Depends(get_session),
) -> list[InstallmentRuleItem]:
    total_ratio = sum(r.ratio for r in payload.rules)
    if abs(total_ratio - 100) > 0.01:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail=f"各期比例之和必须为 100%，当前为 {total_ratio:g}%")
    nos = [r.period_no for r in payload.rules]
    if len(set(nos)) != len(nos):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="期号不能重复")
    # 全量替换
    for row in await _load_rules(db):
        await db.delete(row)
    await db.flush()
    for r in payload.rules:
        db.add(
            InstallmentRule(
                period_no=r.period_no,
                ratio=Decimal(str(r.ratio)),
                months_after=r.months_after,
                pay_day=r.pay_day,
            )
        )
    await db.commit()
    return [_rule_item(r) for r in await _load_rules(db)]


# ============ 解除协议生成 ============


class AgreementInstallment(BaseModel):
    pay_date: date
    amount: float = Field(ge=0)


class AgreementData(BaseModel):
    template_code: str = "agreement_release"
    template_name: str = "解除劳动合同协议书"
    company: str = ""
    name: str = ""
    id_card: str = ""
    dissolve_date: date
    last_work_date: date
    social_security_month: str = ""
    salary_until: date
    base_amount: float = Field(ge=0)
    total_amount: float = Field(ge=0)
    installments: list[AgreementInstallment] = Field(default_factory=list)


class AgreementPrepareIn(BaseModel):
    employee_id: int
    leave_date: date | None = None
    plan: str = "N+1"
    region: str | None = None
    template_code: str = "agreement_release"


class AgreementDocumentIn(BaseModel):
    data: AgreementData
    draft: EditableDraftIn = Field(default_factory=EditableDraftIn)


def _to_render_dict(data: AgreementData) -> dict:
    return {
        "company": data.company,
        "name": data.name,
        "id_card": data.id_card,
        "dissolve_date": data.dissolve_date,
        "last_work_date": data.last_work_date,
        "social_security_month": data.social_security_month,
        "salary_until": data.salary_until,
        "base_amount": Decimal(str(data.base_amount)),
        "total_amount": Decimal(str(data.total_amount)),
        "installments": [
            {"pay_date": it.pay_date, "amount": Decimal(str(it.amount))} for it in data.installments
        ],
    }


async def _agreement_template(db: AsyncSession, code: str | None = None) -> DocumentTemplate:
    template_code = code or "agreement_release"
    try:
        return await _load_active_template(db, "agreement", template_code)
    except HTTPException:
        if template_code == "agreement_release":
            return await _load_active_template(db, "agreement", None)
        raise


@router.post(
    "/agreement/prepare",
    response_model=AgreementData,
    dependencies=[Depends(require_op("tools.compensation_calc", "V"))],
)
async def prepare_agreement(
    payload: AgreementPrepareIn,
    user: User = Depends(current_user),
    db: AsyncSession = Depends(get_session),
) -> AgreementData:
    calc, raw = await _calc_core(
        CompensationCalcIn(
            employee_id=payload.employee_id,
            leave_date=payload.leave_date,
            plan=payload.plan,
            region=payload.region,
        ),
        user,
        db,
    )
    leave_date = calc.leave_date
    template = await _agreement_template(db, payload.template_code)
    rules = [
        {"period_no": r.period_no, "ratio": float(r.ratio), "months_after": r.months_after, "pay_day": r.pay_day}
        for r in await _load_rules(db)
    ]
    installments = agreement_svc.compute_installments(
        Decimal(str(calc.total_amount)), rules, leave_date
    )
    return AgreementData(
        template_code=template.code,
        template_name=template.name,
        company=_first(raw, "公司名称") or "",
        name=calc.employee.chinese_name or calc.employee.name or "",
        id_card=_first(raw, "证件号码") or "",
        dissolve_date=leave_date,
        last_work_date=leave_date,
        social_security_month=f"{leave_date.year}年{leave_date.month}月",
        salary_until=leave_date,
        base_amount=calc.compensation_base,
        total_amount=calc.total_amount,
        installments=[
            AgreementInstallment(pay_date=it["pay_date"], amount=float(it["amount"])) for it in installments
        ],
    )


@router.post(
    "/agreement/preview",
    dependencies=[Depends(require_op("tools.compensation_calc", "V"))],
)
async def preview_agreement(
    data: AgreementData,
    db: AsyncSession = Depends(get_session),
) -> dict[str, str]:
    render_data = _to_render_dict(data)
    template = await _agreement_template(db, data.template_code)
    if template.template_file:
        html = _render_template_html(template, render_data)
    else:
        blocks = template_svc.render_template_blocks(template.blocks, render_data, template.variables, template.business_type)
        html = agreement_svc.render_html(render_data, blocks)
    return {"html": html}


@router.post(
    "/agreement/docx",
    dependencies=[Depends(require_op("tools.compensation_calc", "V"))],
)
async def download_agreement(
    payload: AgreementDocumentIn,
    user: User = Depends(current_user),
    db: AsyncSession = Depends(get_session),
) -> Response:
    data = payload.data
    render_data = _to_render_dict(data)
    template = await _agreement_template(db, data.template_code)
    if payload.draft.manually_adjusted and payload.draft.draft_html:
        content = _render_edited_preview_docx(template, payload.draft.draft_html)
    elif template.template_file:
        content = template_svc.render_docx_template(
            template.template_file,
            render_data,
            template.variables,
            template.business_type,
        )
    else:
        blocks = template_svc.render_template_blocks(template.blocks, render_data, template.variables, template.business_type)
        content = agreement_svc.render_docx(render_data, blocks)
    await _record_document_generation(
        db=db,
        user=user,
        business_type="agreement",
        action="download",
        template=template,
        subject_name=data.name,
        manually_adjusted=payload.draft.manually_adjusted,
        draft_html=payload.draft.draft_html if payload.draft.manually_adjusted else None,
        context={"total_amount": data.total_amount},
    )
    filename = f"解除劳动合同协议书_{data.name or '员工'}.docx"
    from urllib.parse import quote

    return Response(
        content=content,
        media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        headers={"Content-Disposition": f"attachment; filename*=UTF-8''{quote(filename)}"},
    )


@router.post(
    "/agreement/print-log",
    dependencies=[Depends(require_op("tools.compensation_calc", "V"))],
)
async def log_agreement_print(
    payload: AgreementDocumentIn,
    user: User = Depends(current_user),
    db: AsyncSession = Depends(get_session),
) -> dict[str, bool]:
    template = await _agreement_template(db, payload.data.template_code)
    await _record_document_generation(
        db=db,
        user=user,
        business_type="agreement",
        action="print",
        template=template,
        subject_name=payload.data.name,
        manually_adjusted=payload.draft.manually_adjusted,
        draft_html=payload.draft.draft_html if payload.draft.manually_adjusted else None,
        context={"total_amount": payload.data.total_amount},
    )
    return {"ok": True}


# ============ 证明开具：年包收入证明 ============


class IncomeCertificateTemplate(BaseModel):
    code: str
    name: str
    manual_variables: list[DocumentTemplateVariableOut] = Field(default_factory=list)


class IncomeCertificatePrepareIn(BaseModel):
    employee_id: int
    leave_date: date | None = None
    template_code: str = "annual_income"


class IncomeCertificateData(BaseModel):
    template_code: str = "annual_income"
    template_name: str = "年包收入证明"
    company: str = ""
    name: str = ""
    id_card: str = ""
    position: str = ""
    hire_date: date
    leave_date: date | None = None
    leave_date_text: str = "至今"
    basic_salary: float = Field(ge=0)
    target_bonus: float = Field(ge=0)
    annual_package: float = Field(ge=0)
    issue_date: date
    manual_values: dict[str, Any] = Field(default_factory=dict)


class IncomeCertificateDocumentIn(BaseModel):
    data: IncomeCertificateData
    draft: EditableDraftIn = Field(default_factory=EditableDraftIn)


def _income_cert_render_dict(data: IncomeCertificateData) -> dict[str, Any]:
    return {
        "company": data.company,
        "name": data.name,
        "id_card": data.id_card,
        "position": data.position,
        "hire_date": data.hire_date,
        "leave_date": data.leave_date,
        "basic_salary": Decimal(str(data.basic_salary)),
        "target_bonus": Decimal(str(data.target_bonus)),
        "annual_package": Decimal(str(data.annual_package)),
        "issue_date": data.issue_date,
    }


def _manual_variables(template: DocumentTemplate) -> list[DocumentTemplateVariable]:
    return [variable for variable in template.variables if variable.source_type == "manual"]


def _manual_default_value(value: Any) -> Any:
    if value is None:
        return ""
    if isinstance(value, Decimal):
        return str(_money(value))
    if isinstance(value, date):
        return value.isoformat()
    return value


def _manual_defaults(template: DocumentTemplate, base_values: dict[str, Any] | None = None) -> dict[str, Any]:
    base_values = base_values or {}
    defaults: dict[str, Any] = {}
    for variable in _manual_variables(template):
        if variable.default_value not in (None, ""):
            defaults[variable.variable_code] = variable.default_value
        else:
            defaults[variable.variable_code] = _manual_default_value(base_values.get(variable.variable_code))
    return defaults


def _income_cert_render_values(data: IncomeCertificateData, template: DocumentTemplate) -> dict[str, Any]:
    values = _income_cert_render_dict(data)
    manual_values = _manual_defaults(template, values)
    submitted_manual_values = data.manual_values or {}
    for variable in _manual_variables(template):
        if variable.variable_code not in submitted_manual_values:
            continue
        submitted_value = submitted_manual_values[variable.variable_code]
        default_from_base = (
            variable.variable_code in values
            and values.get(variable.variable_code) not in (None, "")
            and variable.default_value in (None, "")
        )
        if submitted_value in (None, "") and default_from_base and not variable.required:
            continue
        manual_values[variable.variable_code] = submitted_value
    missing = [
        variable.variable_name
        for variable in _manual_variables(template)
        if variable.required and manual_values.get(variable.variable_code) in (None, "")
    ]
    if missing:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail=f"请先填写手工变量：{'、'.join(missing)}")
    values.update(manual_values)
    return values


async def _income_certificate_template(db: AsyncSession, code: str | None = None) -> DocumentTemplate:
    template_code = code or "annual_income"
    try:
        return await _load_active_template(db, "income_certificate", template_code)
    except HTTPException:
        if template_code == "annual_income":
            return await _load_active_template(db, "income_certificate", None)
        raise


async def _get_employee_raw_for_tool(employee_id: int, user: User, db: AsyncSession) -> dict[str, Any]:
    stmt = select(EmpRealtimeRoster).where(EmpRealtimeRoster.id == employee_id)
    scope_clause = await build_scope_filter(user, "emp_realtime_roster", db)
    if not is_unrestricted(scope_clause):
        stmt = stmt.where(scope_clause)
    row = (await db.execute(stmt.limit(1))).scalar_one_or_none()
    if row is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="员工不存在或无数据权限")
    return row.raw or {}


@router.get(
    "/income-certificate/templates",
    response_model=list[IncomeCertificateTemplate],
    dependencies=[Depends(require_op("tools.income_certificate", "V"))],
)
async def list_income_certificate_templates(
    db: AsyncSession = Depends(get_session),
) -> list[IncomeCertificateTemplate]:
    today = date.today()
    rows = (
        await db.execute(
            select(DocumentTemplate)
            .options(selectinload(DocumentTemplate.variables))
            .where(
                DocumentTemplate.business_type == "income_certificate",
                DocumentTemplate.is_active.is_(True),
                or_(DocumentTemplate.effective_start.is_(None), DocumentTemplate.effective_start <= today),
                or_(DocumentTemplate.effective_end.is_(None), DocumentTemplate.effective_end >= today),
            )
            .order_by(DocumentTemplate.code)
        )
    ).scalars().all()
    return [
        IncomeCertificateTemplate(
            code=row.code,
            name=row.name,
            manual_variables=[_template_variable_out(variable) for variable in _manual_variables(row)],
        )
        for row in rows
    ]


@router.get(
    "/income-certificate/employees",
    response_model=list[EmployeeCandidate],
    dependencies=[Depends(require_op("tools.income_certificate", "V"))],
)
async def search_income_certificate_employees(
    keyword: str = Query(min_length=1),
    limit: int = Query(20, ge=1, le=50),
    user: User = Depends(current_user),
    db: AsyncSession = Depends(get_session),
) -> list[EmployeeCandidate]:
    kw = keyword.strip()
    stmt = select(EmpRealtimeRoster)
    scope_clause = await build_scope_filter(user, "emp_realtime_roster", db)
    if not is_unrestricted(scope_clause):
        stmt = stmt.where(scope_clause)
    stmt = stmt.where(or_(*[_raw_text(f).ilike(f"%{kw}%") for f in _SEARCH_FIELDS]))
    stmt = stmt.order_by(desc(EmpRealtimeRoster.synced_at), desc(EmpRealtimeRoster.id)).limit(limit)
    rows = (await db.execute(stmt)).scalars().all()
    return [_to_candidate(r) for r in rows]


@router.post(
    "/income-certificate/prepare",
    response_model=IncomeCertificateData,
    dependencies=[Depends(require_op("tools.income_certificate", "V"))],
)
async def prepare_income_certificate(
    payload: IncomeCertificatePrepareIn,
    user: User = Depends(current_user),
    db: AsyncSession = Depends(get_session),
) -> IncomeCertificateData:
    template = await _income_certificate_template(db, payload.template_code)
    raw = await _get_employee_raw_for_tool(payload.employee_id, user, db)
    # Phase D 统一裁决：证明开具工具在薪酬白名单内时，无薪酬权限者也可出具带工资的证明。
    from app.permissions.masker import get_hidden_columns
    hidden = await get_hidden_columns(user, "emp_realtime_roster", db, tool_key="income_certificate")
    if "基本工资" in hidden:
        raise HTTPException(
            status.HTTP_403_FORBIDDEN,
            detail="无权限使用工资开具收入证明（请将证明开具加入薪酬分类的授权工具白名单）",
        )
    hire_date = _parse_date(_first(raw, "入职日期", "1b725de4-7e51-4888-ab05-dc435bb511f8_original"), "入职日期")
    raw_leave = _first(raw, "离职日期", "9e0a9a5d-f3d8-4262-84a4-9f1c7dc4c0ce_original")
    leave_date = payload.leave_date or (_parse_date(raw_leave, "离职日期") if raw_leave else None)
    basic_salary = _parse_money(_first(raw, "基本工资"), "基本工资")
    target_bonus_raw = _first(raw, "目标年终奖")
    target_bonus = _parse_money(target_bonus_raw, "目标年终奖") if target_bonus_raw not in (None, "") else Decimal("0")
    annual_package = _money(basic_salary * Decimal("12") + target_bonus)

    result = IncomeCertificateData(
        template_code=template.code,
        template_name=template.name,
        company=_first(raw, "公司名称") or "",
        name=_first(raw, "姓名（中文名）", "姓名") or "",
        id_card=_first(raw, "证件号码") or "",
        position=_first(raw, "职位", "标准职位", "职务", "岗位") or "",
        hire_date=hire_date,
        leave_date=leave_date,
        leave_date_text=f"{leave_date.year}年{leave_date.month}月{leave_date.day}日" if leave_date else "至今",
        basic_salary=float(_money(basic_salary)),
        target_bonus=float(_money(target_bonus)),
        annual_package=float(annual_package),
        issue_date=date.today(),
        manual_values={},
    )
    result.manual_values = _manual_defaults(template, _income_cert_render_dict(result))
    return result


@router.post(
    "/income-certificate/preview",
    dependencies=[Depends(require_op("tools.income_certificate", "V"))],
)
async def preview_income_certificate(
    data: IncomeCertificateData,
    db: AsyncSession = Depends(get_session),
) -> dict[str, str]:
    template = await _income_certificate_template(db, data.template_code)
    render_data = _income_cert_render_values(data, template)
    if template.template_file:
        html = _render_template_html(template, render_data)
    else:
        blocks = template_svc.render_template_blocks(template.blocks, render_data, template.variables, template.business_type)
        html = income_cert_svc.render_html(render_data, blocks)
    return {"html": html}


@router.post(
    "/income-certificate/docx",
    dependencies=[Depends(require_op("tools.income_certificate", "V"))],
)
async def download_income_certificate(
    payload: IncomeCertificateDocumentIn,
    user: User = Depends(current_user),
    db: AsyncSession = Depends(get_session),
) -> Response:
    data = payload.data
    template = await _income_certificate_template(db, data.template_code)
    render_data = _income_cert_render_values(data, template)
    if payload.draft.manually_adjusted and payload.draft.draft_html:
        content = _render_edited_preview_docx(template, payload.draft.draft_html)
    elif template.template_file:
        content = template_svc.render_docx_template(
            template.template_file,
            render_data,
            template.variables,
            template.business_type,
        )
    else:
        blocks = template_svc.render_template_blocks(template.blocks, render_data, template.variables, template.business_type)
        content = income_cert_svc.render_docx(render_data, blocks)
    await _record_document_generation(
        db=db,
        user=user,
        business_type="income_certificate",
        action="download",
        template=template,
        subject_name=data.name,
        manually_adjusted=payload.draft.manually_adjusted,
        draft_html=payload.draft.draft_html if payload.draft.manually_adjusted else None,
        context={"annual_package": data.annual_package, "manual_value_keys": sorted((data.manual_values or {}).keys())},
    )
    filename = f"收入证明_{data.name or '员工'}.docx"
    from urllib.parse import quote

    return Response(
        content=content,
        media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        headers={"Content-Disposition": f"attachment; filename*=UTF-8''{quote(filename)}"},
    )


@router.post(
    "/income-certificate/print-log",
    dependencies=[Depends(require_op("tools.income_certificate", "V"))],
)
async def log_income_certificate_print(
    payload: IncomeCertificateDocumentIn,
    user: User = Depends(current_user),
    db: AsyncSession = Depends(get_session),
) -> dict[str, bool]:
    template = await _income_certificate_template(db, payload.data.template_code)
    _income_cert_render_values(payload.data, template)
    await _record_document_generation(
        db=db,
        user=user,
        business_type="income_certificate",
        action="print",
        template=template,
        subject_name=payload.data.name,
        manually_adjusted=payload.draft.manually_adjusted,
        draft_html=payload.draft.draft_html if payload.draft.manually_adjusted else None,
        context={
            "annual_package": payload.data.annual_package,
            "manual_value_keys": sorted((payload.data.manual_values or {}).keys()),
        },
    )
    return {"ok": True}
