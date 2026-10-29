from contextlib import asynccontextmanager
from datetime import UTC, datetime

from fastapi import HTTPException
from sqlalchemy import delete, func, or_, select
from sqlalchemy.exc import IntegrityError

from app.core.deps import user_has_op
from app.master_data.access import ENTITY_MENU, require_entity
from app.master_data.models import EntityDefinition
from app.data.column_roles import is_technical_column
from app.data.models import StandardField, StandardFieldBinding, StandardFieldCategory
from app.field_category.models import FieldCategory
from app.system.models import SystemLog
from app.warehouse.schemas import (
    StandardFieldBindingCandidateOut, StandardFieldBindingOut, StandardFieldBindingRefOut,
    StandardFieldDetailOut, StandardFieldListOut, StandardFieldSummaryOut,
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


async def _field(db, field_id, lock=False, *, user=None, op="V"):
    stmt = select(StandardField).where(StandardField.id == field_id)
    if lock:
        stmt = stmt.with_for_update().execution_options(populate_existing=True)
    field = (await db.execute(stmt)).scalar_one_or_none()
    if field is None:
        _error(404, "standard_field_not_found", "标准字段不存在")
    if getattr(field, "entity_id", None) is not None:
        if user is None or not await user_has_op(user, db, "warehouse.standard_fields.catalog", "V"):
            _error(403, "standard_field_view_denied", "无标准字段查看权限")
        entity = await require_entity(db, field.entity_id, user, op, active=op != "V")
        field._entity_name = entity.name
    return field


async def _category_map(db, field_ids):
    rows = (await db.execute(select(StandardFieldCategory).where(
        StandardFieldCategory.standard_field_id.in_(field_ids),
    ).order_by(StandardFieldCategory.field_category_id))).scalars().all()
    result = {}
    for row in rows:
        result.setdefault(row.standard_field_id, []).append(row.field_category_id)
    return result


def _summary(field, categories):
    return StandardFieldSummaryOut(
        id=field.id, field_code=field.field_code, field_name=field.display_name,
        entity_id=getattr(field, "entity_id", None), entity_name=getattr(field, "_entity_name", None),
        business_definition=field.business_definition, data_type=field.data_type,
        value_domain=field.value_domain, category_ids=categories,
        revision=field.revision, is_active=field.is_active,
    )


async def list_standard_fields(db, keyword=None, is_active=None, offset=0, limit=50, *, user=None, entity_id=None):
    stmt = select(StandardField)
    if entity_id is not None:
        await require_entity(db, entity_id, user)
        stmt = stmt.where(StandardField.entity_id == entity_id)
    if user is not None and await user_has_op(user, db, ENTITY_MENU, "V"):
        owned = select(EntityDefinition.id).where(EntityDefinition.owner_user_id == user.id)
        stmt = stmt.where(or_(StandardField.entity_id.is_(None), StandardField.entity_id.in_(owned)))
    else:
        stmt = stmt.where(StandardField.entity_id.is_(None))
    if keyword:
        stmt = stmt.where(StandardField.field_code.icontains(keyword, autoescape=True)
            | StandardField.display_name.icontains(keyword, autoescape=True)
            | StandardField.business_definition.icontains(keyword, autoescape=True))
    if is_active is not None:
        stmt = stmt.where(StandardField.is_active == is_active)
    total = await db.scalar(select(func.count()).select_from(stmt.subquery()))
    fields = (await db.execute(stmt.order_by(StandardField.field_code).offset(offset).limit(limit))).scalars().all()
    ids = {field.entity_id for field in fields if getattr(field, "entity_id", None) is not None}
    if ids:
        names = dict((await db.execute(select(EntityDefinition.id, EntityDefinition.name).where(EntityDefinition.id.in_(ids)))).all())
        for field in fields:
            field._entity_name = names.get(field.entity_id)
    categories = await _category_map(db, [field.id for field in fields])
    return StandardFieldListOut(total=total, items=[_summary(field, categories.get(field.id, [])) for field in fields])


async def read_standard_field(db, field_id, *, user=None):
    field = await _field(db, field_id, user=user)
    categories = await _category_map(db, [field_id])
    bindings = (await db.execute(select(StandardFieldBinding).where(
        StandardFieldBinding.standard_field_id == field_id,
    ).order_by(StandardFieldBinding.id))).scalars().all()
    return StandardFieldDetailOut(**_summary(field, categories.get(field_id, [])).model_dump(),
        bindings=[StandardFieldBindingRefOut.model_validate(binding) for binding in bindings])


async def _validate_definition(db, payload, field_code=None):
    if field_code in {"employee_no", "mobile_phone", "bank_card_number"} and payload.data_type != "string":
        _error(422, "standard_identifier_type", "工号、手机号、银行卡号必须使用字符型")
    if field_code == "work_location" and payload.data_type != "enum":
        _error(422, "work_location_type", "工作地标准字段必须使用枚举类型")
    if payload.value_domain is not None and payload.data_type != "enum":
        _error(422, "standard_field_value_domain_requires_enum", "仅enum标准字段允许维护枚举值域")
    if payload.category_ids:
        existing = (await db.execute(select(FieldCategory.id).where(FieldCategory.id.in_(payload.category_ids)))).scalars().all()
        if set(existing) != set(payload.category_ids):
            _error(400, "standard_field_category_invalid", "字段分类不存在")


async def _definition_entity(db, payload, user, field=None):
    current = getattr(field, "entity_id", None)
    target = payload.entity_id if "entity_id" in payload.model_fields_set else current
    if field is not None and target != current:
        if current is not None or field.created_by != user.id or await db.scalar(select(StandardFieldBinding.id).where(
            StandardFieldBinding.standard_field_id == field.id).limit(1)):
            _error(409, "standard_field_entity_conflict", "已有归属或引用的标准字段不能迁移归属")
    entity = None
    if target is not None:
        if not await user_has_op(user, db, "warehouse.standard_fields.catalog", "V"):
            _error(403, "standard_field_view_denied", "无标准字段查看权限")
        entity = await require_entity(db, target, user, "C" if field is None else "U", active=True, lock=True)
        if entity.published_at is not None:
            _error(409, "standard_field_entity_published", "实体已发布；本卡不支持修改其字段合同，请先完成定义升级影响核对")
    code = field.field_code if field is not None else payload.field_code
    if code == "work_location" and (field is None or target is not None) and (entity is None or entity.entity_code != "person"):
        _error(422, "work_location_entity", "工作地枚举必须归属于Person定义")
    return target


async def _replace_categories(db, field_id, category_ids):
    await db.execute(delete(StandardFieldCategory).where(StandardFieldCategory.standard_field_id == field_id))
    for category_id in category_ids:
        db.add(StandardFieldCategory(standard_field_id=field_id, field_category_id=category_id))
    await db.flush()


def _audit(db, action, field, user, reason_supplied=False, binding=None):
    db.add(SystemLog(category="scope_governance", action="standard_field_" + action, status="success", user_id=user.id,
        metadata_json={"field_id": field.id, "entity_id": getattr(field, "entity_id", None), "revision": field.revision, "reason_supplied": reason_supplied,
            **({"binding_id": binding.id, "binding_version": binding.binding_version,
                "binding_status": binding.status, "table_column_id": binding.table_column_id,
                "dataset_output_field_id": binding.dataset_output_field_id} if binding is not None else {})}))


def _apply_definition(field, payload):
    field.display_name = payload.field_name
    field.business_definition = payload.business_definition
    field.data_type = payload.data_type
    if "value_domain" in payload.model_fields_set:
        field.value_domain = payload.value_domain.model_dump(mode="json") if payload.value_domain else None


async def create_standard_field(db, payload, user):
    async with _transaction(db):
        await _validate_definition(db, payload, payload.field_code)
        entity_id = await _definition_entity(db, payload, user)
        if await db.scalar(select(StandardField.id).where(StandardField.field_code == payload.field_code)):
            _error(409, "standard_field_code_exists", "标准字段编码已存在")
        field = StandardField(field_code=payload.field_code, created_by=user.id, entity_id=entity_id)
        _apply_definition(field, payload)
        db.add(field)
        await db.flush()
        await _replace_categories(db, field.id, payload.category_ids)
        _audit(db, "created", field, user)
        return await read_standard_field(db, field.id, user=user)


async def update_standard_field(db, field_id, payload, user):
    async with _transaction(db):
        field = await _field(db, field_id, lock=True, user=user, op="U")
        if field.revision != payload.expected_revision:
            _error(409, "standard_field_revision_conflict", "字段已更新，请重新加载")
        if not field.is_active:
            _error(409, "standard_field_inactive", "停用字段不能编辑或用于确认映射")
        if getattr(field, "data_type", payload.data_type) != payload.data_type and await db.scalar(select(StandardFieldBinding.id).where(
            StandardFieldBinding.standard_field_id == field_id).limit(1)):
            _error(409, "standard_field_type_in_use", "已有来源或输出映射，不能直接改变字段类型")
        code = field.field_code
        if code == "work_location" and field.entity_id is None and payload.entity_id is None:
            code = None
        await _validate_definition(db, payload, code)
        entity_id = await _definition_entity(db, payload, user, field)
        if field.value_domain is not None and not isinstance(field.value_domain.get("items"), list):
            _error(409, "standard_field_value_domain_migration_required", "旧格式值域须先完成格式迁移")
        if "value_domain" not in payload.model_fields_set and field.data_type == "enum" and payload.data_type != "enum":
            _error(422, "standard_field_value_domain_requires_enum", "改变枚举类型时须明确清空值域")
        _apply_definition(field, payload)
        field.entity_id = entity_id
        field.revision += 1
        field.updated_at = datetime.now(UTC)
        if "category_ids" in payload.model_fields_set:
            await _replace_categories(db, field.id, payload.category_ids)
        await db.flush()
        _audit(db, "updated", field, user)
        return await read_standard_field(db, field.id, user=user)


async def delete_standard_field(db, field_id, expected_revision, user):
    async with _transaction(db):
        field = await _field(db, field_id, lock=True, user=user, op="D")
        if field.revision != expected_revision:
            _error(409, "standard_field_revision_conflict", "字段已更新，请重新加载")
        if field.entity_id is not None:
            entity = await require_entity(db, field.entity_id, user, "D", lock=True)
            if entity.published_at is not None:
                _error(409, "standard_field_entity_published", "已发布实体的字段身份不能删除")
        if await db.scalar(select(StandardFieldBinding.id).where(StandardFieldBinding.standard_field_id == field_id).limit(1)):
            _error(409, "standard_field_in_use", "存在映射引用，禁止删除")
        if field.has_history:
            _error(409, "standard_field_history_preserved", "存在迁移前历史证据，不能删除字段身份")
        _audit(db, "deleted", field, user)
        await db.execute(delete(StandardFieldCategory).where(StandardFieldCategory.standard_field_id == field_id))
        await db.delete(field)


async def _binding_target(db, target_kind, target_id, lock=False):
    from app.datasets.models import DataSet, DataSetTable, DatasetOutputField
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
            "is_sensitive": bool(target.is_sensitive),
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
    table_name = await db.scalar(select(DataSetTable.table_name).where(
        DataSetTable.dataset_id == dataset.id,
        DataSetTable.alias == target.source_alias,
    ))
    if table_name is None:
        _error(409, "standard_binding_source_missing", "数据集输出字段来源表不存在")
    source_column = await db.scalar(select(TableColumn).where(
        TableColumn.table_name == table_name, TableColumn.column_code == target.source_column,
    ))
    source_id = (source_column.source_field_id if source_column else None) or _physical_source_identity(table_name, target.source_column)
    return {
        "target": target, "target_kind": target_kind, "target_id": target.id,
        "table_name": table_name, "dataset_id": dataset.id, "dataset_name": dataset.name,
        "alias": target.source_alias, "column_code": target.output_code,
        "source_column": target.source_column,
        "display_name": target.output_label, "source_field_id": source_id,
        "data_type": target.data_type,
        "is_sensitive": bool(target.is_sensitive),
    }


def _binding_type_compatible(version_type, observed_type):
    return _normalized_catalog_type(version_type) == _normalized_catalog_type(observed_type)


def _normalized_catalog_type(value):
    return "string" if value in {"enum", "text", "varchar"} else value


async def _binding_out(db, field_id, binding):
    return StandardFieldBindingOut(
        id=binding.id, standard_field_id=field_id,
        table_column_id=binding.table_column_id, dataset_output_field_id=binding.dataset_output_field_id,
        status=binding.status, binding_version=binding.binding_version,
        observed_source_field_id=binding.observed_source_field_id,
        observed_data_type=binding.observed_data_type, revision=binding.binding_version,
        confirmed_by=binding.confirmed_by, confirmed_at=binding.confirmed_at,
    )


async def _binding_dataset(db, dataset_id, user, lock=False):
    from app.datasets.models import DataSet
    from app.datasets.router import _can_access
    stmt = select(DataSet).where(DataSet.id == dataset_id)
    if lock:
        stmt = stmt.with_for_update().execution_options(populate_existing=True)
    dataset = await db.scalar(stmt)
    if dataset is None:
        _error(404, "standard_binding_dataset_not_found", "绑定来源数据集不存在")
    if user is None or not await _can_access(user, dataset, db):
        _error(403, "dataset_acl_denied", "当前用户不具备数据集资源访问权")
    return dataset


async def _require_binding_dataset_scope(db, dataset):
    from app.datasets.models import DataSetTable, DataSetRelation, DatasetCalculatedField
    tables = (await db.execute(select(DataSetTable).where(DataSetTable.dataset_id == dataset.id))).scalars().all()
    relation = await db.scalar(select(DataSetRelation.id).where(DataSetRelation.dataset_id == dataset.id).limit(1))
    calculated = await db.scalar(select(DatasetCalculatedField.id).where(DatasetCalculatedField.dataset_id == dataset.id).limit(1))
    if (dataset.warehouse_layer != "DWD" or not dataset.is_active or dataset.status not in {"draft", "published"}
            or len(tables) != 1 or relation is not None or calculated is not None):
        _error(409, "standard_binding_scope_unsupported", "绑定仅支持有效、无关联或计算字段的单表DWD数据集")


async def list_binding_candidates(db, field_id, keyword=None, table_name=None, dataset_id=None, user=None):
    await _field(db, field_id, user=user)
    if table_name is not None:
        table_name = table_name.strip()
        if not table_name:
            _error(422, "standard_binding_scope_required", "来源表范围不能为空")
    if dataset_id is None and not table_name:
        _error(422, "standard_binding_scope_required", "候选查询必须指定dataset_id或来源表范围")
    from app.data.models import RegisteredTable, StandardFieldBinding, TableColumn
    from app.datasets.models import DataSet, DataSetTable, DatasetOutputField
    from app.datasets.router import _can_access
    if dataset_id is not None:
        await _binding_dataset(db, dataset_id, user)
    if table_name is not None and await db.scalar(select(RegisteredTable.id).where(
        RegisteredTable.table_name == table_name,
    )) is None:
        _error(404, "standard_binding_source_not_found", "绑定来源表不存在")
    candidates = []
    bindings = (await db.execute(select(StandardFieldBinding))).scalars().all()
    table_bindings = {row.table_column_id: row for row in bindings if row.table_column_id is not None}
    output_bindings = {row.dataset_output_field_id: row for row in bindings if row.dataset_output_field_id is not None}
    table_stmt = select(TableColumn).order_by(TableColumn.table_name, TableColumn.display_order, TableColumn.id)
    if table_name:
        table_stmt = table_stmt.where(TableColumn.table_name == table_name)
    if dataset_id:
        table_stmt = table_stmt.join(DataSetTable, DataSetTable.table_name == TableColumn.table_name).where(
            DataSetTable.dataset_id == dataset_id
        )
    for column in (await db.execute(table_stmt)).scalars().unique().all():
        if keyword and keyword.lower() not in " ".join((column.column_code, column.column_label, column.source_field_id or "")).lower():
            continue
        binding = table_bindings.get(column.id)
        candidates.append(StandardFieldBindingCandidateOut(
            target_kind="table_column", target_id=column.id, table_name=column.table_name,
            dataset_id=dataset_id, column_code=column.column_code, display_name=column.column_label,
            source_field_id=column.source_field_id or _physical_source_identity(column.table_name, column.column_code),
            data_type=column.data_type, is_sensitive=bool(column.is_sensitive),
            existing_binding_id=binding.id if binding else None,
            existing_binding_status=binding.status if binding else None,
        ))
    output_stmt = select(DatasetOutputField, DataSet, TableColumn).join(
        DataSet, DataSet.id == DatasetOutputField.dataset_id,
    ).outerjoin(DataSetTable, (DataSetTable.dataset_id == DataSet.id) &
                (DataSetTable.alias == DatasetOutputField.source_alias)).outerjoin(
        TableColumn, (TableColumn.table_name == DataSetTable.table_name) &
        (TableColumn.column_code == DatasetOutputField.source_column))
    if dataset_id:
        output_stmt = output_stmt.where(DataSet.id == dataset_id)
    if table_name:
        output_stmt = output_stmt.where(DataSetTable.table_name == table_name)
    for output, dataset, source in (await db.execute(output_stmt.order_by(DataSet.id, DatasetOutputField.display_order))).all():
        if source is None or (dataset_id is None and (user is None or not await _can_access(user, dataset, db))):
            continue
        if keyword and keyword.lower() not in " ".join((output.output_code, output.output_label, output.source_column)).lower():
            continue
        binding = output_bindings.get(output.id)
        candidates.append(StandardFieldBindingCandidateOut(
            target_kind="dataset_output_field", target_id=output.id, dataset_id=dataset.id,
            dataset_name=dataset.name, alias=output.source_alias, column_code=output.output_code,
            display_name=output.output_label,
            source_field_id=source.source_field_id or _physical_source_identity(source.table_name, source.column_code),
            data_type=output.data_type, is_sensitive=bool(output.is_sensitive),
            existing_binding_id=binding.id if binding else None,
            existing_binding_status=binding.status if binding else None,
        ))
    return candidates


async def create_suggested_binding(db, field_id, payload, user):
    from app.datasets.models import DataSetTable
    async with _transaction(db):
        field = await _field(db, field_id, lock=True, user=user, op="U")
        if not field.is_active:
            _error(409, "standard_field_inactive", "停用字段不可创建映射")
        if payload.dataset_id is not None:
            scoped_dataset = await _binding_dataset(db, payload.dataset_id, user, lock=True)
            await _require_binding_dataset_scope(db, scoped_dataset)
        target = await _binding_target(db, payload.target_kind, payload.target_id, lock=True)
        if payload.dataset_id is not None:
            if target["dataset_id"] is not None and target["dataset_id"] != payload.dataset_id:
                _error(422, "standard_binding_target_out_of_scope", "绑定目标不属于指定数据集")
            if target["dataset_id"] is None:
                in_dataset = await db.scalar(select(DataSetTable.id).where(
                    DataSetTable.dataset_id == payload.dataset_id,
                    DataSetTable.table_name == target["table_name"],
                ))
                if in_dataset is None:
                    _error(422, "standard_binding_target_out_of_scope", "绑定目标不属于指定数据集")
        await _require_binding_target(db, target, user,
            allow_hidden_anchor=payload.target_kind == "table_column" and field.is_permission_anchor)
        if not _binding_type_compatible(field.data_type, target["data_type"]):
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
            standard_field_id=field.id, status="suggested", binding_version=0,
            observed_source_field_id=target["source_field_id"], observed_data_type=target["data_type"],
            created_by=user.id,
        )
        db.add(binding)
        await db.flush()
        _audit(db, "binding_suggested", field, user, binding=binding)
        return await _binding_out(db, field_id, binding)


async def transition_binding(db, field_id, binding_id, payload, user, target_status):
    async with _transaction(db):
        field = await _field(db, field_id, lock=True, user=user, op="U")
        binding = (await db.execute(select(StandardFieldBinding).where(
            StandardFieldBinding.id == binding_id,
            StandardFieldBinding.standard_field_id == field_id,
        ).with_for_update().execution_options(populate_existing=True))).scalar_one_or_none()
        if binding is None:
            _error(404, "standard_binding_not_found", "字段绑定不存在")
        if binding.binding_version != payload.expected_revision:
            _error(409, "standard_binding_revision_conflict", "绑定已更新，请重新加载")
        if target_status == "confirmed":
            if binding.status != "suggested" or not field.is_active:
                _error(409, "standard_binding_confirm_invalid", "仅建议映射与有效标准字段可确认")
            kind = "table_column" if binding.table_column_id is not None else "dataset_output_field"
            target = await _binding_target(db, kind, binding.table_column_id or binding.dataset_output_field_id, lock=True)
            await _require_binding_target(db, target, user,
                allow_hidden_anchor=binding.table_column_id is not None and field.is_permission_anchor)
            if not _binding_type_compatible(field.data_type, target["data_type"]):
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
        _audit(db, "binding_" + target_status, field, user, reason_supplied=True, binding=binding)
        return await _binding_out(db, field_id, binding)


async def _require_binding_target(db, target, user, *, allow_hidden_anchor: bool = False):
    from app.data.models import RegisteredTable, TableColumn
    from app.datasets.models import DataSet, DataSetTable
    from app.datasets.router import _can_access
    from app.permissions.masker import get_hidden_columns, _is_super_admin
    from sqlalchemy import text
    from app.warehouse.service.standardization import _physical_metadata_type

    table = await db.scalar(select(RegisteredTable).where(
        RegisteredTable.table_name == target["table_name"],
    ).with_for_update().execution_options(populate_existing=True))
    if table is None or table.warehouse_layer not in {"ODS", "DWD"}:
        _error(409, "standard_binding_release_required", "仅支持已登记ODS或单表DWD来源字段")
    code = target.get("source_column", target["column_code"])
    column = await db.scalar(select(TableColumn).where(
        TableColumn.table_name == target["table_name"], TableColumn.column_code == code,
    ).with_for_update().execution_options(populate_existing=True))
    if column is None or code in {"id", "pk_hash", "synced_at"} or column.is_computed:
        _error(409, "standard_binding_source_invalid", "技术字段、计算字段或缺失来源不能建立业务绑定")
    if table.warehouse_layer == "DWD" or target["dataset_id"] is not None:
        datasets = (await db.execute(select(DataSet).join(DataSetTable, DataSetTable.dataset_id == DataSet.id)
            .where(DataSetTable.table_name == table.table_name).with_for_update(of=DataSet)
            .execution_options(populate_existing=True))).scalars().all()
        if target["dataset_id"] is not None:
            datasets = [dataset for dataset in datasets if dataset.id == target["dataset_id"]]
        if not datasets:
            _error(409, "standard_binding_scope_unsupported", "DWD绑定要求已登记的单表数据集")
        for dataset in datasets:
            if not await _can_access(user, dataset, db):
                _error(403, "dataset_acl_denied", "当前用户不具备数据集资源访问权")
            await _require_binding_dataset_scope(db, dataset)
    hidden = (is_technical_column(code) or code in await get_hidden_columns(user, table.table_name, db))
    if ((hidden and not allow_hidden_anchor)
            or ((column.is_sensitive or target["is_sensitive"]) and not await _is_super_admin(user, db))):
        _error(403, "standard_binding_field_denied", "当前字段不可用于标准绑定")
    physical_type = await db.scalar(text(
        "SELECT data_type FROM information_schema.columns "
        "WHERE table_schema=current_schema() AND table_name=:table_name AND column_name=:column_name"
    ), {"table_name": target["table_name"], "column_name": code})
    if (physical_type is None
            or not _binding_type_compatible(column.data_type, _physical_metadata_type(physical_type))
            or not _binding_type_compatible(target["data_type"], column.data_type)):
        _error(409, "standard_binding_physical_drift", "来源物理字段缺失或类型与发现元数据不一致")
    target["source_field_id"] = column.source_field_id or _physical_source_identity(column.table_name, column.column_code)


def _physical_source_identity(table_name, column_code):
    from hashlib import sha256
    return "table:" + sha256(f"{table_name}\x00{column_code}".encode("utf-8")).hexdigest()
