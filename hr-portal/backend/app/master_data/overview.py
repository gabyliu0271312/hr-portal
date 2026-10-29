"""Administrative overview of master data intake state (counts only, no field values)."""
from sqlalchemy import func, select, text

from app.data.models import StandardField
from app.master_data.models import EntityDefinition, EntitySource
from app.master_data.records import table_name


async def overview(db):
    entities = (await db.scalars(select(EntityDefinition).order_by(EntityDefinition.id))).all()
    items = []
    for entity in entities:
        field_count = await db.scalar(select(func.count()).select_from(StandardField).where(
            StandardField.entity_id == entity.id, StandardField.is_active.is_(True)))
        source_count = await db.scalar(select(func.count()).select_from(EntitySource).where(
            EntitySource.entity_id == entity.id, EntitySource.is_active.is_(True)))
        record_count, last_record_at = 0, None
        if entity.published_at is not None:
            row = (await db.execute(text(f'SELECT count(*), max(created_at) FROM "{table_name(entity.id)}"'))).one()
            record_count, last_record_at = row[0], row[1]
        items.append({
            "id": entity.id, "entity_code": entity.entity_code, "name": entity.name,
            "published": entity.published_at is not None, "published_at": entity.published_at,
            "field_count": field_count, "source_count": source_count,
            "record_count": record_count, "last_record_at": last_record_at,
        })
    return {"items": items, "total": len(items)}
