"""数据集路由 (spec U4 + FR-MODEL-002/004/005)

- GET    /datasets              列表（仅自己可见的）
- POST   /datasets              新建
- GET    /datasets/{id}         详情（含 tables / relations / acl）
- PUT    /datasets/{id}         更新（replacement for tables/relations/acl）
- DELETE /datasets/{id}         删除（被报表引用 → 409）
- GET    /datasets/{id}/integrity   关联完整性校验（断键检测，FR-REPORT-005）
- GET    /datasets/_visible-tables   返回当前用户能配数据集时可纳入的源表清单
"""
from datetime import datetime
import re
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_session
from app.core.deps import current_user, require_any_op, require_op
from app.data.models import DATA_TABLES, TableColumn
from app.datasets.metadata import table_label, table_label_map, table_options
from app.datasets.models import DataSet, DataSetAcl, DataSetRelation, DataSetTable
from app.datasets.single_table import ensure_single_table_dataset as ensure_single_table_dataset_impl
from app.permissions.strategy import ensure_scope_strategy
from app.reports.models import Report
from app.users.models import Role, User, UserRole
from app.warehouse.impact import get_impact_analyzer


router = APIRouter(prefix="/datasets", tags=["datasets"])
ALIAS_RE = re.compile(r"^[A-Za-z_][A-Za-z0-9_]*$")


# ===== Schemas =====

class DatasetTableIn(BaseModel):
    table_name: str
    alias: str


class JoinKey(BaseModel):
    left: str
    right: str


class DatasetRelationIn(BaseModel):
    left_alias: str
    right_alias: str
    join_type: str = Field(default="left", pattern="^(inner|left|right|full)$")
    cardinality: str = Field(default="1:1", pattern="^(1:1|1:N|N:1)$")
    keys: list[JoinKey] = Field(default_factory=list)


class DatasetAclIn(BaseModel):
    role_id: int | None = None
    user_id: int | None = None


class DatasetIn(BaseModel):
    name: str = Field(min_length=1, max_length=64)
    description: str | None = None
    is_active: bool = True
    scope_strategy: str | None = None
    tables: list[DatasetTableIn] = Field(default_factory=list)
    relations: list[DatasetRelationIn] = Field(default_factory=list)
    acl: list[DatasetAclIn] = Field(default_factory=list)


class SingleTableDatasetIn(BaseModel):
    table_name: str


class DatasetTableOut(DatasetTableIn):
    id: int
    table_label: str | None = None


class DatasetRelationOut(DatasetRelationIn):
    id: int


class DatasetAclOut(DatasetAclIn):
    id: int


class AclRoleOption(BaseModel):
    id: int
    name: str


class AclUserOption(BaseModel):
    id: int
    login_name: str
    display_name: str


class AclOptionsOut(BaseModel):
    roles: list[AclRoleOption]
    users: list[AclUserOption]


class DatasetOut(BaseModel):
    id: int
    name: str
    label: str | None = None
    description: str | None
    is_active: bool
    warehouse_layer: str | None = None
    scope_strategy: str | None
    created_by: int | None
    tables: list[DatasetTableOut]
    relations: list[DatasetRelationOut]
    acl: list[DatasetAclOut]
    referenced_by_reports: int
    created_at: datetime
    updated_at: datetime


# ===== 工具 =====

async def _to_out(ds: DataSet, db: AsyncSession) -> DatasetOut:
    tables = (
        (await db.execute(select(DataSetTable).where(DataSetTable.dataset_id == ds.id)))
        .scalars()
        .all()
    )
    rels = (
        (await db.execute(select(DataSetRelation).where(DataSetRelation.dataset_id == ds.id)))
        .scalars()
        .all()
    )
    acls = (
        (await db.execute(select(DataSetAcl).where(DataSetAcl.dataset_id == ds.id)))
        .scalars()
        .all()
    )
    ref_count = (
        await db.execute(select(Report).where(Report.dataset_id == ds.id))
    ).scalars().all()
    label_by_table = await table_label_map(db, [t.table_name for t in tables])
    return DatasetOut(
        id=ds.id,
        name=ds.name,
        label=ds.label,
        description=ds.description,
        is_active=ds.is_active,
        warehouse_layer=ds.warehouse_layer,
        scope_strategy=ds.scope_strategy,
        created_by=ds.created_by,
        tables=[
            DatasetTableOut(
                id=t.id,
                table_name=t.table_name,
                alias=t.alias,
                table_label=label_by_table.get(t.table_name, t.table_name),
            )
            for t in tables
        ],
        relations=[
            DatasetRelationOut(
                id=r.id,
                left_alias=r.left_alias,
                right_alias=r.right_alias,
                join_type=r.join_type,
                cardinality=getattr(r, "cardinality", "1:1") or "1:1",
                keys=[JoinKey(**k) for k in (r.keys or [])],
            )
            for r in rels
        ],
        acl=[
            DatasetAclOut(id=a.id, role_id=a.role_id, user_id=a.user_id) for a in acls
        ],
        referenced_by_reports=len(ref_count),
        created_at=ds.created_at,
        updated_at=ds.updated_at,
    )


async def _can_access(user: User, ds: DataSet, db: AsyncSession) -> bool:
    """用户能否使用该数据集（FR-MODEL-004）

    创建者总可访问；超级管理员总可访问；
    ACL 命中（角色或用户）→ 可访问；
    没有任何 ACL 行 → 仅创建者可访问；
    """
    if ds.created_by == user.id:
        return True
    # 超管直通
    from app.permissions.scope_filter import _is_super_admin
    if await _is_super_admin(user, db):
        return True
    # ACL 行
    acls = (
        (await db.execute(select(DataSetAcl).where(DataSetAcl.dataset_id == ds.id)))
        .scalars()
        .all()
    )
    if not acls:
        return False
    user_role_ids = {
        r[0]
        for r in (
            await db.execute(
                select(UserRole.role_id).where(UserRole.user_id == user.id)
            )
        ).all()
    }
    for a in acls:
        if a.user_id == user.id:
            return True
        if a.role_id and a.role_id in user_role_ids:
            return True
    return False


def _validate_payload(payload: DatasetIn) -> None:
    if not payload.tables:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="至少包含一张数据表")
    aliases = set()
    for t in payload.tables:
        if t.table_name not in DATA_TABLES:
            raise HTTPException(
                status.HTTP_400_BAD_REQUEST, detail=f"未知数据表: {t.table_name}"
            )
        if not ALIAS_RE.match(t.alias or ""):
            raise HTTPException(
                status.HTTP_400_BAD_REQUEST,
                detail=f"别名格式不合法: {t.alias}，请使用英文、数字、下划线，且不能以数字开头",
            )
        if t.alias in aliases:
            raise HTTPException(
                status.HTTP_400_BAD_REQUEST, detail=f"别名重复: {t.alias}"
            )
        aliases.add(t.alias)
    # relations 别名必须在 tables 内
    for r in payload.relations:
        if r.left_alias not in aliases or r.right_alias not in aliases:
            raise HTTPException(
                status.HTTP_400_BAD_REQUEST,
                detail=f"关联使用了未注册别名: {r.left_alias}/{r.right_alias}",
            )
        if r.left_alias == r.right_alias:
            raise HTTPException(
                status.HTTP_400_BAD_REQUEST, detail="左右别名不能相同"
            )
        if not r.keys:
            raise HTTPException(
                status.HTTP_400_BAD_REQUEST,
                detail=f"关联 {r.left_alias}↔{r.right_alias} 至少需要 1 个连接键",
            )


# ===== CRUD =====

@router.get("", response_model=list[DatasetOut])
async def list_datasets(
    user: User = Depends(current_user),
    db: AsyncSession = Depends(get_session),
) -> list[DatasetOut]:
    rows = (
        (await db.execute(select(DataSet).order_by(DataSet.name)))
        .scalars()
        .all()
    )
    out = []
    for ds in rows:
        if await _can_access(user, ds, db):
            out.append(await _to_out(ds, db))
    return out


@router.post(
    "",
    response_model=DatasetOut,
    dependencies=[Depends(require_op("datasource.datasets", "C"))],
)
async def create_dataset(
    payload: DatasetIn,
    user: User = Depends(current_user),
    db: AsyncSession = Depends(get_session),
) -> DatasetOut:
    _validate_payload(payload)
    # 名称唯一
    exists = (
        await db.execute(select(DataSet).where(DataSet.name == payload.name))
    ).scalar_one_or_none()
    if exists is not None:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="数据集名已存在")

    try:
        scope_strategy = ensure_scope_strategy(payload.scope_strategy)
    except ValueError as exc:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="无效的数据范围策略") from exc

    ds = DataSet(
        name=payload.name,
        description=payload.description,
        is_active=payload.is_active,
        scope_strategy=scope_strategy,
        created_by=user.id,
    )
    db.add(ds)
    await db.flush()

    for t in payload.tables:
        db.add(DataSetTable(dataset_id=ds.id, table_name=t.table_name, alias=t.alias))
    for r in payload.relations:
        db.add(
            DataSetRelation(
                dataset_id=ds.id,
                left_alias=r.left_alias,
                right_alias=r.right_alias,
                join_type=r.join_type,
                cardinality=r.cardinality,
                keys=[k.model_dump() for k in r.keys],
            )
        )
    for a in payload.acl:
        db.add(DataSetAcl(dataset_id=ds.id, role_id=a.role_id, user_id=a.user_id))
    await db.commit()
    await db.refresh(ds)
    # 给关联键建索引，加速后续报表 JOIN
    try:
        from app.datasets.indexing import ensure_indexes_for_relations
        await ensure_indexes_for_relations(
            db, {t.alias: t.table_name for t in payload.tables}, payload.relations
        )
    except Exception:
        pass
    return await _to_out(ds, db)


@router.post(
    "/_single-table",
    response_model=DatasetOut,
    dependencies=[Depends(require_op("datasource.datasets", "C"))],
)
async def ensure_single_table_dataset(
    payload: SingleTableDatasetIn,
    user: User = Depends(current_user),
    db: AsyncSession = Depends(get_session),
) -> DatasetOut:
    try:
        ds = await ensure_single_table_dataset_impl(
            payload.table_name,
            db,
            created_by=user.id,
            table_label=await table_label(db, payload.table_name),
        )
    except ValueError:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="未知数据表")
    if not await _can_access(user, ds, db):
        raise HTTPException(status.HTTP_403_FORBIDDEN, detail="无权访问该单表数据集")
    await db.commit()
    return await _to_out(ds, db)


@router.get("/_visible-tables")
async def list_visible_tables(
    _: User = Depends(current_user),
    db: AsyncSession = Depends(get_session),
) -> list[dict[str, str]]:
    """数据集可纳入的源表清单"""
    return await table_options(db)


@router.get(
    "/_acl-options",
    response_model=AclOptionsOut,
    dependencies=[
        Depends(require_any_op(("datasource.datasets", "C"), ("datasource.datasets", "U")))
    ],
)
async def dataset_acl_options(db: AsyncSession = Depends(get_session)) -> AclOptionsOut:
    roles = (
        (await db.execute(select(Role).where(Role.is_active.is_(True)).order_by(Role.id)))
        .scalars()
        .all()
    )
    users = (
        (await db.execute(select(User).where(User.is_active.is_(True)).order_by(User.id)))
        .scalars()
        .all()
    )
    return AclOptionsOut(
        roles=[AclRoleOption(id=role.id, name=role.name) for role in roles],
        users=[
            AclUserOption(
                id=user.id,
                login_name=user.login_name,
                display_name=user.display_name,
            )
            for user in users
        ],
    )


@router.get("/{ds_id}", response_model=DatasetOut)
async def get_dataset(
    ds_id: int,
    user: User = Depends(current_user),
    db: AsyncSession = Depends(get_session),
) -> DatasetOut:
    ds = await db.get(DataSet, ds_id)
    if ds is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="数据集不存在")
    if not await _can_access(user, ds, db):
        raise HTTPException(status.HTTP_403_FORBIDDEN, detail="无权访问该数据集")
    return await _to_out(ds, db)


@router.put(
    "/{ds_id}",
    response_model=DatasetOut,
    dependencies=[Depends(require_op("datasource.datasets", "U"))],
)
async def update_dataset(
    ds_id: int,
    payload: DatasetIn,
    user: User = Depends(current_user),
    db: AsyncSession = Depends(get_session),
) -> DatasetOut:
    ds = await db.get(DataSet, ds_id)
    if ds is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="数据集不存在")
    if not await _can_access(user, ds, db):
        raise HTTPException(status.HTTP_403_FORBIDDEN, detail="无权修改该数据集")
    _validate_payload(payload)
    # 重名检查
    if ds.name != payload.name:
        exists = (
            await db.execute(
                select(DataSet).where(DataSet.name == payload.name, DataSet.id != ds_id)
            )
        ).scalar_one_or_none()
        if exists is not None:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="数据集名已存在")

    ds.name = payload.name
    ds.description = payload.description
    ds.is_active = payload.is_active
    try:
        ds.scope_strategy = ensure_scope_strategy(payload.scope_strategy)
    except ValueError as exc:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="无效的数据范围策略") from exc

    # 替换式
    await db.execute(delete(DataSetTable).where(DataSetTable.dataset_id == ds_id))
    await db.execute(delete(DataSetRelation).where(DataSetRelation.dataset_id == ds_id))
    await db.execute(delete(DataSetAcl).where(DataSetAcl.dataset_id == ds_id))
    for t in payload.tables:
        db.add(DataSetTable(dataset_id=ds_id, table_name=t.table_name, alias=t.alias))
    for r in payload.relations:
        db.add(
            DataSetRelation(
                dataset_id=ds_id,
                left_alias=r.left_alias,
                right_alias=r.right_alias,
                join_type=r.join_type,
                cardinality=r.cardinality,
                keys=[k.model_dump() for k in r.keys],
            )
        )
    for a in payload.acl:
        db.add(DataSetAcl(dataset_id=ds_id, role_id=a.role_id, user_id=a.user_id))
    await db.commit()
    await db.refresh(ds)
    try:
        from app.datasets.indexing import ensure_indexes_for_relations
        await ensure_indexes_for_relations(
            db, {t.alias: t.table_name for t in payload.tables}, payload.relations
        )
    except Exception:
        pass
    return await _to_out(ds, db)


@router.delete(
    "/{ds_id}",
    dependencies=[Depends(require_op("datasource.datasets", "D"))],
)
async def delete_dataset(
    ds_id: int,
    db: AsyncSession = Depends(get_session),
) -> dict[str, Any]:
    ds = await db.get(DataSet, ds_id)
    if ds is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="数据集不存在")
    ref = (
        (await db.execute(select(Report).where(Report.dataset_id == ds_id)))
        .scalars()
        .all()
    )
    if ref:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            detail=f"该数据集被 {len(ref)} 个报表引用，无法删除",
        )

    # G0304: 仓库影响分析 — 检查仓库指标引用
    impact_analyzer = get_impact_analyzer(db)
    impact_refs, _ = await impact_analyzer.scan_model(ds_id)
    blocking_refs = [r for r in impact_refs if r.get("blocking")]
    if blocking_refs:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            detail=f"该数据集存在阻断级引用，无法删除："
            + "；".join(r.get("blocking_reason", "") for r in blocking_refs),
        )

    await db.delete(ds)
    await db.commit()
    return {"ok": True}


@router.get("/{ds_id}/integrity")
async def check_integrity(
    ds_id: int,
    _: User = Depends(current_user),
    db: AsyncSession = Depends(get_session),
) -> dict[str, Any]:
    """关联完整性校验（FR-REPORT-005）

    对每个 relation 的每个 join key，验证 left/right 字段在对应表的 table_columns 中存在
    """
    ds = await db.get(DataSet, ds_id)
    if ds is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="数据集不存在")

    tables = (
        (await db.execute(select(DataSetTable).where(DataSetTable.dataset_id == ds_id)))
        .scalars()
        .all()
    )
    alias_to_table = {t.alias: t.table_name for t in tables}

    rels = (
        (await db.execute(select(DataSetRelation).where(DataSetRelation.dataset_id == ds_id)))
        .scalars()
        .all()
    )

    issues: list[str] = []
    for r in rels:
        for k in (r.keys or []):
            for side, col in (("left", k.get("left")), ("right", k.get("right"))):
                alias = r.left_alias if side == "left" else r.right_alias
                table = alias_to_table.get(alias)
                if not table or not col:
                    issues.append(f"{alias}.{col} 缺失")
                    continue
                exists = (
                    await db.execute(
                        select(TableColumn).where(
                            TableColumn.table_name == table,
                            TableColumn.column_code == col,
                        )
                    )
                ).scalar_one_or_none()
                if exists is None:
                    issues.append(f"{alias}.{col}（{table}）字段已不存在")

    return {"ok": len(issues) == 0, "issues": issues}


# ===== P4-03: 数据集输出字段配置 =====

class OutputFieldOut(BaseModel):
    id: int
    dataset_id: int
    source_alias: str
    source_column: str
    output_code: str
    output_label: str
    data_type: str
    agg_role: str
    is_sensitive: bool
    is_visible: bool
    display_order: int
    description: str | None = None


class OutputFieldUpdateIn(BaseModel):
    output_label: str | None = None
    agg_role: str | None = None
    description: str | None = None
    is_visible: bool | None = None


@router.get(
    "/{dataset_id}/output-fields",
    response_model=list[OutputFieldOut],
    dependencies=[Depends(require_op("report.list", "V"))],
)
async def list_output_fields(
    dataset_id: int,
    user: User = Depends(current_user),
    db: AsyncSession = Depends(get_session),
) -> list[dict]:
    ds = await db.get(DataSet, dataset_id)
    if ds is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="数据集不存在")
    if not await _can_access(user, ds, db):
        raise HTTPException(status.HTTP_403_FORBIDDEN, detail="无权访问该数据集")

    from app.datasets.models import DatasetOutputField
    rows = (
        (await db.execute(
            select(DatasetOutputField)
            .where(DatasetOutputField.dataset_id == dataset_id)
            .order_by(DatasetOutputField.display_order)
        ))
        .scalars()
        .all()
    )
    return [
        {
            "id": r.id,
            "dataset_id": r.dataset_id,
            "source_alias": r.source_alias,
            "source_column": r.source_column,
            "output_code": r.output_code,
            "output_label": r.output_label,
            "data_type": r.data_type,
            "agg_role": r.agg_role,
            "is_sensitive": r.is_sensitive,
            "is_visible": r.is_visible,
            "display_order": r.display_order,
            "description": r.description,
        }
        for r in rows
    ]


@router.put(
    "/{dataset_id}/output-fields/{field_id}",
    response_model=OutputFieldOut,
    dependencies=[Depends(require_op("report.list", "U"))],
)
async def update_output_field(
    dataset_id: int,
    field_id: int,
    payload: OutputFieldUpdateIn,
    user: User = Depends(current_user),
    db: AsyncSession = Depends(get_session),
) -> dict:
    ds = await db.get(DataSet, dataset_id)
    if ds is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="数据集不存在")
    if not await _can_access(user, ds, db):
        raise HTTPException(status.HTTP_403_FORBIDDEN, detail="无权访问该数据集")

    from app.datasets.models import DatasetOutputField
    field = await db.get(DatasetOutputField, field_id)
    if field is None or field.dataset_id != dataset_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="字段不存在")

    if payload.output_label is not None:
        field.output_label = payload.output_label
    if payload.agg_role is not None:
        if payload.agg_role not in ("dimension", "measure"):
            raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="agg_role 只能是 dimension 或 measure")
        field.agg_role = payload.agg_role
    if payload.description is not None:
        field.description = payload.description
    if payload.is_visible is not None:
        field.is_visible = payload.is_visible

    await db.commit()
    await db.refresh(field)
    return {
        "id": field.id,
        "dataset_id": field.dataset_id,
        "source_alias": field.source_alias,
        "source_column": field.source_column,
        "output_code": field.output_code,
        "output_label": field.output_label,
        "data_type": field.data_type,
        "agg_role": field.agg_role,
        "is_sensitive": field.is_sensitive,
        "is_visible": field.is_visible,
        "display_order": field.display_order,
        "description": field.description,
    }
