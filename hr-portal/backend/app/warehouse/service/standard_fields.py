from contextlib import asynccontextmanager
from datetime import UTC, datetime

from fastapi import HTTPException
from sqlalchemy import delete, func, select
from sqlalchemy.exc import IntegrityError

from app.data.models import (
    StandardField,
    StandardFieldBinding,
    StandardFieldVersion,
    StandardFieldVersionCategory,
)
from app.field_category.models import FieldCategory
from app.system.models import SystemLog
from app.users.models import User
from app.warehouse.schemas import (
    StandardFieldBindingCandidateOut,
    StandardFieldBindingOut,
    StandardFieldBindingRefOut,
    StandardFieldDetailOut,
    StandardFieldListOut,
    StandardFieldSummaryOut,
    StandardFieldVersionOut,
)


def _error(status, code, message):
    raise HTTPException(status, detail={"code": code, "message": message})


@asynccontextmanager
async def _transaction(db):
    try:
        yield
        await db.commit()
    except IntegrityError:
        await db.rollback()
        _error(409, "standard_field_write_conflict", "目录记录冲突，操作未保存，请重新核对")
    except Exception:
        await db.rollback()
        raise


async def _field(db, field_id, lock=False):
    stmt = select(StandardField).where(StandardField.id == field_id)
    if lock:
        stmt = stmt.with_for_update().execution_options(populate_existing=True)
    field = (await db.execute(stmt)).scalar_one_or_none()
    if field is None:
        _error(404, "standard_field_not_found", "标准字段不存在")
    return field


async def _version(db, field_id, version_id):
    version = (await db.execute(
        select(StandardFieldVersion).where(
            StandardFieldVersion.id == version_id,
            StandardFieldVersion.standard_field_id == field_id,
        ).with_for_update().execution_options(populate_existing=True)
    )).scalar_one_or_none()
    if version is None:
        _error(404, "standard_field_version_not_found", "标准字段版本不存在")
    return version


async def _category_map(db, version_ids):
    rows = (await db.execute(
        select(StandardFieldVersionCategory).where(
            StandardFieldVersionCategory.standard_field_version_id.in_(version_ids)
        ).order_by(StandardFieldVersionCategory.field_category_id)
    )).scalars().all()
    result = {}
    for row in rows:
        result.setdefault(row.standard_field_version_id, []).append(row.field_category_id)
    return result


async def _out(db, version):
    categories = await _category_map(db, [version.id])
    return StandardFieldVersionOut.model_validate(version).model_copy(
        update={"category_ids": categories.get(version.id, [])}
    )


async def list_standard_fields(db, keyword=None, status=None, offset=0, limit=50):
    latest = select(
        StandardFieldVersion.standard_field_id,
        func.max(StandardFieldVersion.version).label("version"),
    ).group_by(StandardFieldVersion.standard_field_id).subquery()
    active_id = select(StandardFieldVersion.id).where(
        StandardFieldVersion.standard_field_id == StandardField.id,
        StandardFieldVersion.status == "active",
    ).order_by(StandardFieldVersion.version.desc()).limit(1).correlate(StandardField).scalar_subquery()
    stmt = select(StandardField, StandardFieldVersion, active_id).join(
        latest, latest.c.standard_field_id == StandardField.id,
    ).join(StandardFieldVersion, (
        (StandardFieldVersion.standard_field_id == latest.c.standard_field_id)
        & (StandardFieldVersion.version == latest.c.version)
    ))
    if keyword:
        stmt = stmt.where(
            StandardField.field_code.icontains(keyword, autoescape=True)
            | StandardFieldVersion.field_name.icontains(keyword, autoescape=True)
            | StandardFieldVersion.business_definition.icontains(keyword, autoescape=True)
        )
    if status:
        stmt = stmt.where(StandardFieldVersion.status == status)
    total = await db.scalar(select(func.count()).select_from(stmt.subquery()))
    rows = (await db.execute(stmt.order_by(StandardField.field_code).offset(offset).limit(limit))).all()
    categories = await _category_map(db, [version.id for _, version, _ in rows])
    return StandardFieldListOut(total=total, items=[StandardFieldSummaryOut(
        id=field.id, field_code=field.field_code, current_active_version_id=current,
        latest_version=StandardFieldVersionOut.model_validate(version).model_copy(
            update={"category_ids": categories.get(version.id, [])}
        ),
    ) for field, version, current in rows])


async def read_standard_field(db, field_id):
    field = await _field(db, field_id)
    versions = (await db.execute(
        select(StandardFieldVersion).where(StandardFieldVersion.standard_field_id == field_id)
        .order_by(StandardFieldVersion.version.desc())
    )).scalars().all()
    categories = await _category_map(db, [version.id for version in versions])
    outputs = [StandardFieldVersionOut.model_validate(version).model_copy(
        update={"category_ids": categories.get(version.id, [])}
    ) for version in versions]
    bindings = (await db.execute(
        select(StandardFieldBinding).join(
            StandardFieldVersion, StandardFieldVersion.id == StandardFieldBinding.standard_field_version_id,
        ).where(StandardFieldVersion.standard_field_id == field_id).order_by(StandardFieldBinding.id)
    )).scalars().all()
    return StandardFieldDetailOut(
        id=field.id, field_code=field.field_code, latest_version=outputs[0], versions=outputs,
        current_active_version_id=next((version.id for version in versions if version.status == "active"), None),
        bindings=[StandardFieldBindingRefOut.model_validate(binding) for binding in bindings],
    )


async def _validate_definition(db, payload):
    if payload.is_permission_anchor and not (
        payload.data_type == "string" and payload.permission_domain in {"org", "cost_center"}
        and payload.grain_level in {"coarse", "fine"}
    ):
        _error(400, "standard_field_anchor_invalid", "候选权限锚点必须为组织或中心的字符串编码，粒度为coarse/fine")
    if await db.scalar(select(User.id).where(
        User.id == payload.owner_user_id, User.is_active.is_(True),
    )) is None:
        _error(400, "standard_field_owner_invalid", "负责人不存在或已停用")
    if payload.category_ids:
        existing = (await db.execute(select(FieldCategory.id).where(
            FieldCategory.id.in_(payload.category_ids),
        ))).scalars().all()
        if set(existing) != set(payload.category_ids):
            _error(400, "standard_field_category_invalid", "字段分类不存在")


def _definition(payload):
    return payload.model_dump(exclude={"field_code", "expected_version", "expected_revision", "category_ids"})


async def _replace_categories(db, version_id, category_ids):
    await db.execute(delete(StandardFieldVersionCategory).where(
        StandardFieldVersionCategory.standard_field_version_id == version_id,
    ))
    for category_id in category_ids:
        db.add(StandardFieldVersionCategory(standard_field_version_id=version_id, field_category_id=category_id))
    await db.flush()


def _audit(db, action, field, version, user, reason_supplied=False, binding=None):
    db.add(SystemLog(
        category="scope_governance", action="standard_field_" + action, status="success", user_id=user.id,
        request_summary="维护标准字段语义目录", response_summary="仅目录元数据变更，未修改业务查询或范围授权",
        metadata_json={
            "field_id": field.id, "version_id": version.id, "version": version.version,
            "revision": version.revision, "status": version.status, "reason_supplied": reason_supplied,
            "runtime_filter_exemption": False,
            **({"binding_id": binding.id, "binding_version": binding.binding_version,
                "binding_status": binding.status, "table_column_id": binding.table_column_id,
                "dataset_output_field_id": binding.dataset_output_field_id} if binding is not None else {}),
        },
    ))


async def create_standard_field(db, payload, user):
    async with _transaction(db):
        await _validate_definition(db, payload)
        if await db.scalar(select(StandardField.id).where(StandardField.field_code == payload.field_code)):
            _error(409, "standard_field_code_exists", "标准字段编码已存在")
        field = StandardField(field_code=payload.field_code, created_by=user.id)
        db.add(field)
        await db.flush()
        version = StandardFieldVersion(
            standard_field_id=field.id, version=1, created_by=user.id, **_definition(payload),
        )
        db.add(version)
        await db.flush()
        await _replace_categories(db, version.id, payload.category_ids)
        _audit(db, "created", field, version, user)
        return await read_standard_field(db, field.id)


async def create_standard_field_version(db, field_id, payload, user):
    async with _transaction(db):
        field = await _field(db, field_id, lock=True)
        latest = (await db.execute(select(StandardFieldVersion).where(
            StandardFieldVersion.standard_field_id == field_id,
        ).order_by(StandardFieldVersion.version.desc()).limit(1))).scalar_one()
        if latest.version != payload.expected_version:
            _error(409, "standard_field_version_conflict", "目录已有新版本，请重新核对")
        if await db.scalar(select(StandardFieldVersion.id).where(
            StandardFieldVersion.standard_field_id == field_id, StandardFieldVersion.status == "draft",
        ).limit(1)):
            _error(409, "standard_field_draft_exists", "请先处理已有草稿")
        await _validate_definition(db, payload)
        version = StandardFieldVersion(
            standard_field_id=field_id, version=latest.version + 1, created_by=user.id, **_definition(payload),
        )
        db.add(version)
        await db.flush()
        await _replace_categories(db, version.id, payload.category_ids)
        _audit(db, "version_created", field, version, user)
        return await _out(db, version)


def _check_revision(version, expected_revision):
    if version.revision != expected_revision:
        _error(409, "standard_field_revision_conflict", "版本内容或状态已更新，请重新核对")


async def update_standard_field_version(db, field_id, version_id, payload, user):
    async with _transaction(db):
        field = await _field(db, field_id, lock=True)
        version = await _version(db, field_id, version_id)
        _check_revision(version, payload.expected_revision)
        if version.status != "draft":
            _error(409, "standard_field_version_readonly", "仅草稿可编辑，已批准语义须创建新版本")
        await _validate_definition(db, payload)
        for key, value in _definition(payload).items():
            setattr(version, key, value)
        version.revision += 1
        version.updated_at = datetime.now(UTC)
        await db.flush()
        await _replace_categories(db, version.id, payload.category_ids)
        _audit(db, "draft_updated", field, version, user)
        return await _out(db, version)


async def transition_standard_field_version(db, field_id, version_id, payload, user, target):
    async with _transaction(db):
        field = await _field(db, field_id, lock=True)
        version = await _version(db, field_id, version_id)
        _check_revision(version, payload.expected_revision)
        allowed = {"active": {"draft"}, "deprecated": {"active"}, "archived": {"draft", "active", "deprecated"}}
        if version.status not in allowed[target]:
            _error(409, "standard_field_transition_invalid", "此状态不允许该操作，已归档版本不可重新启用")
        if target == "active":
            definition = StandardFieldVersionOut.model_validate(version).model_copy(
                update={"category_ids": (await _category_map(db, [version.id])).get(version.id, [])}
            )
            await _validate_definition(db, definition)
            version.approved_by = user.id
            version.approved_at = datetime.now(UTC)
            version.approval_reason = payload.reason
        version.status = target
        version.revision += 1
        version.status_reason = payload.reason
        version.status_changed_by = user.id
        version.status_changed_at = datetime.now(UTC)
        version.updated_at = version.status_changed_at
        await db.flush()
        _audit(db, target, field, version, user, reason_supplied=True)
        return await _out(db, version)


async def delete_standard_field(db, field_id, expected_version, expected_revision, user):
    async with _transaction(db):
        field = await _field(db, field_id, lock=True)
        versions = (await db.execute(select(StandardFieldVersion).where(
            StandardFieldVersion.standard_field_id == field_id,
        ).order_by(StandardFieldVersion.version.desc()).with_for_update())).scalars().all()
        if versions[0].version != expected_version:
            _error(409, "standard_field_version_conflict", "目录已有新版本，请重新核对")
        _check_revision(versions[0], expected_revision)
        ids = [version.id for version in versions]
        if await db.scalar(select(StandardFieldBinding.id).where(
            StandardFieldBinding.standard_field_version_id.in_(ids),
        ).limit(1)):
            _error(409, "standard_field_in_use", "存在绑定引用，禁止删除")
        if any(version.approved_by is not None for version in versions):
            _error(409, "standard_field_approved_delete_forbidden", "已批准目录必须保留历史，请停用或归档")
        _audit(db, "deleted", field, versions[0], user)
        await db.execute(delete(StandardFieldVersionCategory).where(
            StandardFieldVersionCategory.standard_field_version_id.in_(ids),
        ))
        await db.execute(delete(StandardFieldVersion).where(StandardFieldVersion.standard_field_id == field_id))
        await db.delete(field)


async def _binding_target(db, target_kind, target_id, lock=False):
    from app.datasets.models import DataSet, DatasetOutputField
    from app.data.models import TableColumn
    if target_kind == "table_column":
        stmt = select(TableColumn).where(TableColumn.id == target_id)
        if lock:
            stmt = stmt.with_for_update().execution_options(populate_existing=True)
        target = (await db.execute(stmt)).scalar_one_or_none()
        if target is None:
            _error(404, "standard_binding_target_not_found", "物理字段不存在")
        source_id = target.source_field_id or _physical_source_identity(target.table_name, target.column_code)
        return {
            "target": target, "target_kind": target_kind, "target_id": target.id,
            "table_name": target.table_name, "dataset_id": None, "dataset_name": None,
            "alias": None, "column_code": target.column_code, "display_name": target.column_label,
            "source_field_id": source_id, "data_type": target.data_type,
            "is_visible": bool(target.is_visible), "is_sensitive": bool(target.is_sensitive),
        }
    stmt = select(DatasetOutputField, DataSet).join(
        DataSet, DataSet.id == DatasetOutputField.dataset_id,
    ).where(DatasetOutputField.id == target_id)
    if lock:
        stmt = stmt.with_for_update(of=DatasetOutputField).execution_options(populate_existing=True)
    row = (await db.execute(stmt)).first()
    if row is None:
        _error(404, "standard_binding_target_not_found", "数据集输出字段不存在")
    target, dataset = row
    source_id = f"dataset:{dataset.id}:{target.source_alias}:{target.source_column}"
    return {
        "target": target, "target_kind": target_kind, "target_id": target.id,
        "table_name": None, "dataset_id": dataset.id, "dataset_name": dataset.name,
        "alias": target.source_alias, "column_code": target.output_code,
        "display_name": target.output_label, "source_field_id": source_id,
        "data_type": target.data_type, "is_visible": bool(target.is_visible),
        "is_sensitive": bool(target.is_sensitive),
    }


def _binding_type_compatible(version_type, observed_type):
    return _normalized_catalog_type(version_type) == _normalized_catalog_type(observed_type)


def _normalized_catalog_type(value):
    return "string" if value in {"enum", "text", "varchar"} else value


async def _binding_out(db, field_id, binding):
    from app.data.models import StandardFieldVersion
    version = await db.get(StandardFieldVersion, binding.standard_field_version_id) if binding.standard_field_version_id else None
    return StandardFieldBindingOut(
        id=binding.id, standard_field_version_id=binding.standard_field_version_id,
        table_column_id=binding.table_column_id, dataset_output_field_id=binding.dataset_output_field_id,
        status=binding.status, binding_version=binding.binding_version,
        standard_field_id=field_id, standard_field_version_status=version.status if version else None,
        observed_source_field_id=binding.observed_source_field_id,
        observed_data_type=binding.observed_data_type, revision=binding.binding_version,
        confirmed_by=binding.confirmed_by, confirmed_at=binding.confirmed_at,
    )


async def list_binding_candidates(db, field_id, keyword=None, table_name=None, dataset_id=None):
    await _field(db, field_id)
    from app.data.models import StandardFieldBinding, TableColumn
    from app.datasets.models import DataSet, DataSetTable, DatasetOutputField
    candidates = []
    bindings = (await db.execute(select(StandardFieldBinding))).scalars().all()
    table_bindings = {row.table_column_id: row for row in bindings if row.table_column_id is not None}
    output_bindings = {row.dataset_output_field_id: row for row in bindings if row.dataset_output_field_id is not None}
    table_stmt = select(TableColumn).order_by(TableColumn.table_name, TableColumn.display_order, TableColumn.id)
    if table_name:
        table_stmt = table_stmt.where(TableColumn.table_name == table_name)
    if dataset_id:
        table_stmt = table_stmt.where(False)
    for column in (await db.execute(table_stmt)).scalars().all():
        if keyword and keyword.lower() not in " ".join((column.column_code, column.column_label, column.source_field_id or "")).lower():
            continue
        binding = table_bindings.get(column.id)
        candidates.append(StandardFieldBindingCandidateOut(
            target_kind="table_column", target_id=column.id, table_name=column.table_name,
            column_code=column.column_code, display_name=column.column_label,
            source_field_id=column.source_field_id or _physical_source_identity(column.table_name, column.column_code),
            data_type=column.data_type, is_visible=bool(column.is_visible), is_sensitive=bool(column.is_sensitive),
            existing_binding_id=binding.id if binding else None,
            existing_binding_status=binding.status if binding else None,
        ))
    output_stmt = select(DatasetOutputField, DataSet, DataSetTable.alias).join(
        DataSet, DataSet.id == DatasetOutputField.dataset_id,
    ).outerjoin(DataSetTable, (DataSetTable.dataset_id == DataSet.id) &
                (DataSetTable.alias == DatasetOutputField.source_alias))
    if dataset_id:
        output_stmt = output_stmt.where(DataSet.id == dataset_id)
    if table_name:
        output_stmt = output_stmt.where(DataSetTable.table_name == table_name)
    for output, dataset, alias in (await db.execute(output_stmt.order_by(DataSet.id, DatasetOutputField.display_order))).all():
        if keyword and keyword.lower() not in " ".join((output.output_code, output.output_label, output.source_column)).lower():
            continue
        binding = output_bindings.get(output.id)
        candidates.append(StandardFieldBindingCandidateOut(
            target_kind="dataset_output_field", target_id=output.id, dataset_id=dataset.id,
            dataset_name=dataset.name, alias=output.source_alias, column_code=output.output_code,
            display_name=output.output_label,
            source_field_id=f"dataset:{dataset.id}:{output.source_alias}:{output.source_column}",
            data_type=output.data_type, is_visible=bool(output.is_visible), is_sensitive=bool(output.is_sensitive),
            existing_binding_id=binding.id if binding else None,
            existing_binding_status=binding.status if binding else None,
        ))
    return candidates


async def create_suggested_binding(db, field_id, payload, user):
    from app.data.models import StandardFieldBinding, StandardFieldVersion
    async with _transaction(db):
        field = await _field(db, field_id, lock=True)
        version = (await db.execute(select(StandardFieldVersion).where(
            StandardFieldVersion.id == payload.standard_field_version_id,
            StandardFieldVersion.standard_field_id == field_id,
        ).with_for_update())).scalar_one_or_none()
        if version is None:
            _error(404, "standard_field_version_not_found", "标准字段版本不存在")
        if version.status == "archived":
            _error(409, "standard_binding_version_archived", "归档语义版本不可创建绑定")
        target = await _binding_target(db, payload.target_kind, payload.target_id, lock=True)
        await _require_ods_binding_target(db, target)
        if not _binding_type_compatible(version.data_type, target["data_type"]):
            _error(400, "standard_binding_type_incompatible", "标准字段类型与来源字段类型不兼容")
        target_clause = (StandardFieldBinding.table_column_id == payload.target_id
                         if payload.target_kind == "table_column"
                         else StandardFieldBinding.dataset_output_field_id == payload.target_id)
        existing = (await db.execute(select(StandardFieldBinding).where(target_clause))).scalar_one_or_none()
        if existing:
            _error(409, "standard_binding_target_exists", "目标字段已有绑定，本接口不迁移或覆盖历史确认")
        binding = StandardFieldBinding(
            table_column_id=payload.target_id if payload.target_kind == "table_column" else None,
            dataset_output_field_id=payload.target_id if payload.target_kind == "dataset_output_field" else None,
            standard_field_version_id=version.id, status="suggested", binding_version=0,
            observed_source_field_id=target["source_field_id"], observed_data_type=target["data_type"],
            created_by=user.id,
        )
        db.add(binding)
        await db.flush()
        _audit(db, "binding_suggested", field, version, user, binding=binding)
        return await _binding_out(db, field_id, binding)


async def transition_binding(db, field_id, binding_id, payload, user, target_status):
    from app.data.models import StandardFieldBinding, StandardFieldVersion
    async with _transaction(db):
        field = await _field(db, field_id, lock=True)
        version_ids = select(StandardFieldVersion.id).where(StandardFieldVersion.standard_field_id == field_id)
        binding = (await db.execute(select(StandardFieldBinding).where(
            StandardFieldBinding.id == binding_id,
            StandardFieldBinding.standard_field_version_id.in_(version_ids),
        ).with_for_update().execution_options(populate_existing=True))).scalar_one_or_none()
        if binding is None:
            _error(404, "standard_binding_not_found", "字段绑定不存在")
        if binding.binding_version != payload.expected_revision:
            _error(409, "standard_binding_revision_conflict", "绑定已更新，请重新加载")
        version = await db.get(StandardFieldVersion, binding.standard_field_version_id)
        if target_status == "confirmed":
            if binding.status != "suggested" or version.status != "active":
                _error(409, "standard_binding_confirm_invalid", "仅suggested绑定和active语义版本可确认")
            kind = "table_column" if binding.table_column_id is not None else "dataset_output_field"
            target = await _binding_target(db, kind, binding.table_column_id or binding.dataset_output_field_id, lock=True)
            await _require_ods_binding_target(db, target)
            if not _binding_type_compatible(version.data_type, target["data_type"]):
                _error(409, "standard_binding_type_drift", "来源字段类型已变化，请重新建立建议绑定")
            if target["source_field_id"] != binding.observed_source_field_id or target["data_type"] != binding.observed_data_type:
                _error(409, "standard_binding_source_drift", "来源字段身份或类型已变化，请重新发现")
            binding.status = "confirmed"
            binding.confirmed_by = user.id
            binding.confirmed_at = datetime.now(UTC)
        elif target_status == "invalid":
            if binding.status not in {"suggested", "confirmed"}:
                _error(409, "standard_binding_transition_invalid", "当前绑定状态不允许失效")
            binding.status = "invalid"
        binding.binding_version += 1
        await db.flush()
        _audit(db, "binding_" + target_status, field, version, user, reason_supplied=True, binding=binding)
        return await _binding_out(db, field_id, binding)


async def _require_ods_binding_target(db, target):
    from app.data.models import RegisteredTable
    if target["target_kind"] != "table_column":
        _error(409, "standard_binding_release_required", "DWD及输出绑定须先通过完整刷新和发布准入门禁")
    table = (await db.execute(select(RegisteredTable).where(
        RegisteredTable.table_name == target["table_name"],
    ))).scalar_one_or_none()
    if table is None or table.warehouse_layer != "ODS":
        _error(409, "standard_binding_release_required", "本地来源确认仅开放已登记ODS字段；派生字段需发布准入")
    from sqlalchemy import text
    from app.warehouse.service.standardization import _physical_metadata_type
    physical_type = await db.scalar(text(
        "SELECT data_type FROM information_schema.columns "
        "WHERE table_schema=current_schema() AND table_name=:table_name AND column_name=:column_name"
    ), {"table_name": target["table_name"], "column_name": target["column_code"]})
    if physical_type is None or not _binding_type_compatible(target["data_type"], _physical_metadata_type(physical_type)):
        _error(409, "standard_binding_physical_drift", "来源物理字段缺失或类型与发现元数据不一致")


def _physical_source_identity(table_name, column_code):
    from hashlib import sha256
    return "table:" + sha256(f"{table_name}\x00{column_code}".encode("utf-8")).hexdigest()
