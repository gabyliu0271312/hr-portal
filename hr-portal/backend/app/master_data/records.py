from datetime import UTC, date, datetime
import hashlib
import json

from sqlalchemy import MetaData, Table, exists, func, literal, or_, select, text
from sqlalchemy.dialects.postgresql import dialect

from app.core.deps import user_has_op
from app.data.ddl import postgres_type, quote_ident
from app.data.models import StandardField, StandardFieldCategory
from app.field_category.models import FieldCategory
from app.master_data.access import ENTITY_MENU
from app.master_data.models import EntityDefinition, EntityRecordAcl, EntitySource, ScopePersonReference
from app.permissions.masker import _is_super_admin, _user_allowed_categories
from app.scopes.models import ScopeTag, ScopeTagFilter, UserScopeTag
from app.system.models import SystemLog
from app.users.models import Role, UserRole
from app.warehouse.service.standard_fields import _error


def table_name(entity_id):
    return f"master_records_{entity_id}"


def column_name(field_id):
    return f"field_{field_id}"


def field_contract(fields):
    return [{"id": f.id, "type": f.data_type, "revision": f.revision} for f in fields]


async def fields_for(db, entity_id):
    return list((await db.scalars(select(StandardField).where(
        StandardField.entity_id == entity_id, StandardField.is_active.is_(True),
    ).order_by(StandardField.id))).all())


async def published_entity(db, entity_id, *, lock=False):
    stmt = select(EntityDefinition).where(EntityDefinition.id == entity_id)
    if lock:
        stmt = stmt.with_for_update().execution_options(populate_existing=True)
    entity = await db.scalar(stmt)
    if entity is None:
        _error(404, "entity_not_found", "主数据实体不存在或无权访问")
    if not entity.is_active or entity.published_at is None:
        _error(409, "entity_not_published", "实体未发布或已失效")
    fields = await fields_for(db, entity_id)
    if entity.published_fields != field_contract(fields):
        _error(409, "entity_contract_changed", "字段定义已变化，请核对发布合同")
    return entity, fields


async def physical_table(db, entity_id):
    conn = await db.connection()
    return await conn.run_sync(lambda c: Table(table_name(entity_id), MetaData(), autoload_with=c))


def validate_enum(field, value):
    items = (field.value_domain or {}).get("items", [])
    allowed = {item["code"] for item in items if item.get("enabled", True)}
    if type(value) is not str or value not in allowed:
        _error(422, "record_enum_invalid", "字段值不在启用的枚举值域内")
    return value


def _digest_value(value):
    """Canonical JSON-safe representation of a validated value for the payload digest."""
    if isinstance(value, datetime):
        return value.date().isoformat()
    if isinstance(value, date):
        return value.isoformat()
    if isinstance(value, float):
        return format(value, '.17g')
    return value


def _validate_value(field, value):
    """Type-dispatch record value validation for published contract fields."""
    if field.data_type == "enum":
        return validate_enum(field, value)
    if field.data_type == "string":
        if type(value) is not str or not value.strip():
            _error(422, "record_string_invalid", "字符串字段不允许空值")
        return value
    if field.data_type == "date":
        if type(value) is not str:
            _error(422, "record_date_invalid", "日期字段必须是 ISO 日期字符串")
        try:
            return datetime.fromisoformat(value).date()
        except ValueError:
            _error(422, "record_date_invalid", "日期字段格式无效，须为 YYYY-MM-DD")
    if field.data_type == "number":
        if type(value) is bool:
            _error(422, "record_number_invalid", "数值字段格式无效")
        if type(value) in {int, float} or (type(value) is str and value.strip()):
            try:
                return float(value)
            except (TypeError, ValueError):
                pass
        _error(422, "record_number_invalid", "数值字段格式无效")
    _error(422, "record_type_unsupported", f"不支持写入字段类型 {field.data_type}")


def _column_sql(field, *, nullable=False):
    """Generate physical column DDL for a standard field by type.

    enum -> TEXT + enabled-code CHECK; string/text -> TEXT; date -> DATE; number -> NUMERIC.
    nullable=True is used for the definition-upgrade path: existing records predate the new
    field, so PostgreSQL cannot add a NOT NULL column without a DEFAULT.
    """
    col = quote_ident(column_name(field.id))
    null_clause = "" if nullable else " NOT NULL"
    if field.data_type == "enum":
        items = (field.value_domain or {}).get("items", [])
        allowed = [item["code"] for item in items if item.get("enabled", True)]
        options = ", ".join(str(literal(code).compile(dialect=dialect(), compile_kwargs={"literal_binds": True})) for code in allowed).replace(":", "\\:")
        return f"{col} {postgres_type(field.data_type)}{null_clause} CHECK ({col} IN ({options}))"
    return f"{col} {postgres_type(field.data_type)}{null_clause}"


async def publish(db, entity, user):
    fields = await fields_for(db, entity.id)
    if not fields:
        _error(422, "entity_definition_empty", "实体没有可发布的字段")
    for field in fields:
        if field.data_type == "enum":
            items = (field.value_domain or {}).get("items", [])
            if not items or not any(item.get("enabled", True) for item in items):
                _error(422, "entity_value_domain_missing", "发布前请配置启用的枚举值域")
    contract = field_contract(fields)
    name = quote_ident(table_name(entity.id), kind="table")
    if entity.published_at is not None:
        if entity.published_fields == contract:
            return
        # B17 定义升级：仅允许"新增字段"（旧字段 id/type/revision 完全保留），其余为破坏性变更另批
        old = {(f["id"], f["type"], f["revision"]) for f in (entity.published_fields or [])}
        new = {(f.id, f.data_type, f.revision) for f in fields}
        if not old.issubset(new):
            _error(409, "entity_republish_unsupported", "仅支持新增字段的定义升级；删除/改类型/改修订须另批破坏性变更")
        added = [f for f in fields if (f.id, f.data_type, f.revision) not in old]
        if not added:
            return
        for field in added:
            await db.execute(text(f"ALTER TABLE {name} ADD COLUMN {_column_sql(field, nullable=True)}"))
        entity.published_fields = contract
        entity.revision += 1
        db.add(SystemLog(category="master_data", action="entity_field_upgraded", status="success", user_id=user.id,
            metadata_json={"entity_id": entity.id, "revision": entity.revision,
                "added_field_ids": [f.id for f in added]}))
        await db.flush()
        return
    definitions = [_column_sql(field) for field in fields]
    columns = ", ".join(definitions)
    await db.execute(text(f"CREATE TABLE {name} ("
        "id BIGSERIAL PRIMARY KEY, source_id BIGINT NOT NULL REFERENCES master_entity_sources(id) ON DELETE RESTRICT, "
        "source_record_id VARCHAR(256) NOT NULL CHECK (length(trim(source_record_id)) > 0), "
        "payload_digest VARCHAR(64) NOT NULL, revision INTEGER NOT NULL DEFAULT 0 CHECK (revision >= 0), "
        "created_at TIMESTAMPTZ NOT NULL DEFAULT now(), "
        f"{columns}, UNIQUE(source_id, source_record_id))"))
    entity.published_fields = contract
    entity.published_at = datetime.now(UTC)
    entity.published_by = user.id
    entity.revision += 1
    db.add(SystemLog(category="master_data", action="entity_published", status="success", user_id=user.id,
        metadata_json={"entity_id": entity.id, "revision": entity.revision}))
    await db.flush()


async def has_record_acl(db, user, entity_id):
    roles = select(UserRole.role_id).join(Role, Role.id == UserRole.role_id).where(
        UserRole.user_id == user.id, Role.is_active.is_(True))
    return bool(await db.scalar(select(exists().where(
        EntityRecordAcl.entity_id == entity_id,
        or_(EntityRecordAcl.user_id == user.id, EntityRecordAcl.role_id.in_(roles)),
    ))))


async def require_record_acl(db, user, entity_id):
    if not await user_has_op(user, db, ENTITY_MENU, "V"):
        _error(403, "record_permission_denied", "无主数据记录查看权限")
    if not await has_record_acl(db, user, entity_id):
        _error(403, "record_resource_denied", "无目标实体的记录访问授权")


async def person_predicate(db, user, entity_id, record_id_column):
    if await _is_super_admin(user, db):
        return text("true")
    # A stable reference is an explicit person scope, not a name-based fallback.
    tags = select(ScopeTag.id).join(UserScopeTag, UserScopeTag.tag_id == ScopeTag.id).where(
        UserScopeTag.user_id == user.id, ScopeTag.dimension == "org",
        ScopeTag.person_scope_enabled.is_(True), ScopeTag.org_scope_enabled.is_(False),
        ~exists().where(ScopeTagFilter.tag_id == ScopeTag.id),
    )
    ids = select(ScopePersonReference.record_id).where(
        ScopePersonReference.entity_id == entity_id, ScopePersonReference.tag_id.in_(tags))
    return record_id_column.in_(ids)


async def visible_fields(db, user, fields):
    if await _is_super_admin(user, db):
        return fields
    allowed = await _user_allowed_categories(user, db)
    hidden = set((await db.scalars(select(StandardFieldCategory.standard_field_id).join(
        FieldCategory, FieldCategory.id == StandardFieldCategory.field_category_id,
    ).where(StandardFieldCategory.standard_field_id.in_([f.id for f in fields]),
        FieldCategory.is_sensitive.is_(True), ~FieldCategory.id.in_(allowed)))).all())
    return [f for f in fields if f.id not in hidden]


async def list_records(db, user, entity_id, offset=0, limit=20, record_id=None):
    await require_record_acl(db, user, entity_id)
    entity, fields = await published_entity(db, entity_id)
    table = await physical_table(db, entity_id)
    scope = await person_predicate(db, user, entity_id, table.c.id)
    fields = await visible_fields(db, user, fields)
    query = select(table.c.id, table.c.revision, table.c.created_at,
        *(table.c[column_name(f.id)] for f in fields)).where(scope)
    if record_id is not None:
        query = query.where(table.c.id == record_id)
    total = await db.scalar(select(func.count()).select_from(query.subquery()))
    rows = (await db.execute(query.order_by(table.c.id).offset(offset).limit(limit))).mappings().all()
    result = {"total": total, "fields": [{"id": f.id, "name": f.display_name, "code": f.field_code} for f in fields],
        "items": [{"id": row["id"], "revision": row["revision"], "created_at": row["created_at"],
            "values": {str(f.id): row[column_name(f.id)] for f in fields}} for row in rows]}
    if record_id is not None and not rows:
        _error(404, "record_not_found", "记录不存在或无权访问")
    return result


class _SourceContext:
    __slots__ = ("source_id", "entity_id", "_seal")

    def __init__(self, source_id, entity_id, seal):
        self.source_id = source_id
        self.entity_id = entity_id
        self._seal = seal


_SOURCE_SEAL = object()


async def bind_internal_source(db, source_id):
    """Trusted backend adapter boundary; never expose this function as an HTTP dependency."""
    source = await db.scalar(select(EntitySource).where(EntitySource.id == source_id))
    if source is None or not source.is_active or source.adapter_code != "internal":
        _error(403, "source_denied", "来源未获准内部接收")
    return _SourceContext(source.id, source.entity_id, _SOURCE_SEAL)


async def receive_record(db, context, source_record_id, values):
    """The caller owns the transaction; record and audit either commit together or roll back."""
    if type(context) is not _SourceContext or context._seal is not _SOURCE_SEAL:
        _error(403, "writer_denied", "非受控服务写者")
    entity, fields = await published_entity(db, context.entity_id, lock=True)
    source = await db.scalar(select(EntitySource).where(EntitySource.id == context.source_id).with_for_update())
    if source is None or not source.is_active or source.entity_id != entity.id or source.adapter_code != "internal":
        _error(403, "source_denied", "来源授权已失效")
    if type(source_record_id) is not str or not source_record_id.strip() or len(source_record_id) > 256:
        _error(422, "source_identity_invalid", "缺少有效来源记录身份")
    expected = {str(f.id) for f in fields}
    if type(values) is not dict or set(values) != expected or not expected.issubset(set(source.field_ids or [])):
        _error(422, "record_fields_denied", "字段缺失、未知或不在服务白名单内")
    clean = {column_name(f.id): _validate_value(f, values[str(f.id)]) for f in fields}
    digest = hashlib.sha256(json.dumps(
        {col: _digest_value(v) for col, v in clean.items()}, sort_keys=True, ensure_ascii=False).encode()).hexdigest()
    table = await physical_table(db, entity.id)
    existing = (await db.execute(select(table.c.id, table.c.payload_digest).where(
        table.c.source_id == source.id, table.c.source_record_id == source_record_id))).first()
    if existing:
        if existing.payload_digest != digest:
            _error(409, "source_record_conflict", "来源记录已存在且内容不同")
        return existing.id
    record_id = await db.scalar(table.insert().values(source_id=source.id, source_record_id=source_record_id,
        payload_digest=digest, **clean).returning(table.c.id))
    db.add(SystemLog(category="master_data", action="entity_record_received", status="success",
        metadata_json={"entity_id": entity.id, "record_id": record_id, "source_id": source.id}))
    await db.flush()
    return record_id
