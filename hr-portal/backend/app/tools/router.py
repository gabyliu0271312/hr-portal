from __future__ import annotations

import calendar
from datetime import date, datetime, timedelta
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import Response
from pydantic import BaseModel, Field
from sqlalchemy import and_, cast, desc, func, or_, select
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_session
from app.core.deps import current_user, require_op
from app.data.models import EmpRealtimeRoster
from app.permissions.masker import get_sensitive_columns
from app.permissions.scope_filter import build_scope_filter, is_unrestricted
from app.tools import agreement as agreement_svc
from app.tools import income_certificate as income_cert_svc
from app.tools.models import CompensationCap, InstallmentRule
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

    sensitive_cols = await get_sensitive_columns(user, "emp_realtime_roster", db)
    if "基本工资" in sensitive_cols:
        raise HTTPException(status.HTTP_403_FORBIDDEN, detail="无权限查看基本工资，无法计算补偿金")

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
    rules = [
        {"period_no": r.period_no, "ratio": float(r.ratio), "months_after": r.months_after, "pay_day": r.pay_day}
        for r in await _load_rules(db)
    ]
    installments = agreement_svc.compute_installments(
        Decimal(str(calc.total_amount)), rules, leave_date
    )
    return AgreementData(
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
async def preview_agreement(data: AgreementData) -> dict[str, str]:
    return {"html": agreement_svc.render_html(_to_render_dict(data))}


@router.post(
    "/agreement/docx",
    dependencies=[Depends(require_op("tools.compensation_calc", "V"))],
)
async def download_agreement(data: AgreementData) -> Response:
    content = agreement_svc.render_docx(_to_render_dict(data))
    filename = f"解除劳动合同协议书_{data.name or '员工'}.docx"
    from urllib.parse import quote

    return Response(
        content=content,
        media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        headers={"Content-Disposition": f"attachment; filename*=UTF-8''{quote(filename)}"},
    )


# ============ 证明开具：年包收入证明 ============


class IncomeCertificateTemplate(BaseModel):
    code: str
    name: str


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


INCOME_CERT_TEMPLATES = [IncomeCertificateTemplate(code="annual_income", name="年包收入证明")]


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
async def list_income_certificate_templates() -> list[IncomeCertificateTemplate]:
    return INCOME_CERT_TEMPLATES


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
    if payload.template_code != "annual_income":
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="暂不支持该证明模板")

    raw = await _get_employee_raw_for_tool(payload.employee_id, user, db)
    hire_date = _parse_date(_first(raw, "入职日期", "1b725de4-7e51-4888-ab05-dc435bb511f8_original"), "入职日期")
    raw_leave = _first(raw, "离职日期", "9e0a9a5d-f3d8-4262-84a4-9f1c7dc4c0ce_original")
    leave_date = payload.leave_date or (_parse_date(raw_leave, "离职日期") if raw_leave else None)
    basic_salary = _parse_money(_first(raw, "基本工资"), "基本工资")
    target_bonus_raw = _first(raw, "目标年终奖")
    target_bonus = _parse_money(target_bonus_raw, "目标年终奖") if target_bonus_raw not in (None, "") else Decimal("0")
    annual_package = _money(basic_salary * Decimal("12") + target_bonus)

    return IncomeCertificateData(
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
    )


@router.post(
    "/income-certificate/preview",
    dependencies=[Depends(require_op("tools.income_certificate", "V"))],
)
async def preview_income_certificate(data: IncomeCertificateData) -> dict[str, str]:
    return {"html": income_cert_svc.render_html(_income_cert_render_dict(data))}


@router.post(
    "/income-certificate/docx",
    dependencies=[Depends(require_op("tools.income_certificate", "V"))],
)
async def download_income_certificate(data: IncomeCertificateData) -> Response:
    content = income_cert_svc.render_docx(_income_cert_render_dict(data))
    filename = f"收入证明_{data.name or '员工'}.docx"
    from urllib.parse import quote

    return Response(
        content=content,
        media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        headers={"Content-Disposition": f"attachment; filename*=UTF-8''{quote(filename)}"},
    )
