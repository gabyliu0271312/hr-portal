"""Controlled UCP writer for registered warehouse assets."""
from __future__ import annotations

import hashlib

from sqlalchemy import bindparam, delete, text, select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.data.ddl import validate_column_name, validate_table_name
from app.data.models import RegisteredTable, TableColumn
from app.datasources.models import DataSource


def _business_key_hash(row: dict, primary_key: str | list[str] | tuple[str, ...]) -> str:
    keys = [primary_key] if isinstance(primary_key, str) else list(primary_key)
    material = "||".join(str(row.get(key, "")) for key in keys)
    return hashlib.sha256(material.encode("utf-8")).hexdigest()[:32]

class WarehouseAssetSink:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def write(self, *, target_asset: str, rows: list[dict], write_mode: str, primary_key: str | None, field_whitelist: list[str], batch_id: str | None = None, period_field: str | None = None) -> dict:
        target_asset = validate_table_name(target_asset)
        if write_mode == "period_full_snapshot":
            return await self._write_period_full_snapshot(
                target_asset=target_asset,
                rows=rows,
                field_whitelist=field_whitelist,
                batch_id=batch_id,
                period_field=period_field,
            )
        if write_mode not in {"append", "upsert", "replace"}:
            raise ValueError("写入模式仅支持 append、upsert 或 replace")
        asset = await self.db.scalar(select(RegisteredTable).where(RegisteredTable.table_name == target_asset))
        if asset is None or asset.asset_status != "published":
            raise ValueError("目标数据资产不存在或尚未发布")
        columns = list((await self.db.execute(select(TableColumn).where(TableColumn.table_name == target_asset))).scalars())
        allowed = {column.column_code for column in columns}
        whitelist = {validate_column_name(field) for field in field_whitelist}
        if not whitelist or not whitelist.issubset(allowed):
            raise ValueError("字段白名单包含目标资产未批准的字段")
        declared_primary_keys = {column.column_code for column in columns if column.is_pk_part}
        source = await self.db.scalar(select(DataSource).where(DataSource.table_name == target_asset))
        policy = None
        if source and getattr(source, "ingestion_mode", None):
            mode = source.ingestion_mode
            policy = {"ingestion_mode": mode, "business_key_fields": list(source.business_key_fields or [])}
            if mode == "period_full_snapshot":
                return await self._write_period_full_snapshot(
                    target_asset=target_asset,
                    rows=rows,
                    field_whitelist=field_whitelist,
                    batch_id=batch_id,
                    period_field=asset.period_col,
                )
            write_mode = {"current_snapshot": "upsert", "incremental_upsert": "upsert", "append": "append"}[mode]
            if policy["business_key_fields"]:
                primary_key = policy["business_key_fields"][0]
        elif source and source.sync_semantics and source.write_strategy and source.missing_row_strategy:
            policy = {
                "sync_semantics": source.sync_semantics,
                "write_strategy": source.write_strategy,
                "missing_row_strategy": source.missing_row_strategy,
                "business_key_fields": list(source.business_key_fields or []),
            }
            write_mode = {"full_refresh": "replace", "incremental_upsert": "upsert", "append": "append"}[source.write_strategy]
            if policy["business_key_fields"]:
                primary_key = policy["business_key_fields"][0]
        if write_mode == "upsert":
            if not primary_key or validate_column_name(primary_key) not in whitelist:
                raise ValueError("upsert must use a whitelisted primary key")
            if primary_key not in declared_primary_keys:
                raise ValueError("upsert primary key is not declared by the target asset")
        clean_rows = [{key: row.get(key) for key in whitelist if key in row} for row in rows if isinstance(row, dict)]
        if not primary_key:
            raise ValueError("warehouse asset writes require a business primary key")
        for row in clean_rows:
            row["pk_hash"] = _business_key_hash(row, primary_key)
        if write_mode == "upsert" and any(not row.get(primary_key) for row in clean_rows):
            raise ValueError("upsert rows must include a non-empty primary key")
        if write_mode == "replace":
            await self.db.execute(text(f'DELETE FROM "{target_asset}"'))
        written = 0
        inserted = 0
        updated = 0
        for row in clean_rows:
            if not row:
                continue
            fields = list(row)
            if write_mode == "upsert":
                existing = await self.db.execute(text(f'SELECT 1 FROM "{target_asset}" WHERE "{primary_key}" = :pk LIMIT 1'), {"pk": row.get(primary_key)})
                if existing.scalar_one_or_none() is not None:
                    updates = [field for field in fields if field != primary_key]
                    if updates:
                        await self.db.execute(text(f'UPDATE "{target_asset}" SET ' + ", ".join(f'"{field}" = :{field}' for field in updates) + f' WHERE "{primary_key}" = :{primary_key}'), row)
                    written += 1
                    updated += 1
                    continue
            await self.db.execute(text(f'INSERT INTO "{target_asset}" (' + ", ".join(f'"{field}"' for field in fields) + ') VALUES (' + ", ".join(f':{field}' for field in fields) + ')'), row)
            written += 1
            inserted += 1
        deleted = 0
        if policy and policy["sync_semantics"] == "full_snapshot" and policy["missing_row_strategy"] == "hard_delete" and clean_rows:
            current_hashes = [row["pk_hash"] for row in clean_rows]
            result = await self.db.execute(
                text(f'DELETE FROM "{target_asset}" WHERE pk_hash NOT IN :hashes').bindparams(bindparam("hashes", expanding=True)),
                {"hashes": current_hashes},
            )
            deleted = result.rowcount or 0
        await self.db.flush()
        return {"target_asset": target_asset, "write_mode": write_mode, "written_count": written, "inserted_count": inserted, "updated_count": updated, "deleted_count": deleted, "field_whitelist": sorted(whitelist), "batch_id": batch_id, "effective_policy": policy}

    async def _write_period_full_snapshot(
        self,
        *,
        target_asset: str,
        rows: list[dict],
        field_whitelist: list[str],
        batch_id: str | None,
        period_field: str | None,
    ) -> dict:
        asset = await self.db.scalar(
            select(RegisteredTable).where(RegisteredTable.table_name == target_asset)
        )
        if asset is None or asset.asset_status != "published":
            raise ValueError("目标数据资产不存在或尚未发布")
        if not asset.is_period:
            raise ValueError("按期间全量快照仅支持期间数据资产")
        period_field = validate_column_name(period_field or asset.period_col)
        if period_field != asset.period_col:
            raise ValueError("按期间全量快照必须使用资产登记的期间字段")

        columns = list(
            (await self.db.execute(
                select(TableColumn).where(TableColumn.table_name == target_asset)
            )).scalars()
        )
        by_code = {column.column_code: column for column in columns}
        whitelist = {validate_column_name(field) for field in field_whitelist}
        if not whitelist or not whitelist.issubset(by_code):
            raise ValueError("字段白名单包含目标资产未批准的字段")
        pk_columns = [
            column.column_code
            for column in sorted(columns, key=lambda item: item.display_order)
            if column.is_pk_part
        ]
        if not pk_columns or not set(pk_columns).issubset(whitelist):
            raise ValueError("字段白名单必须包含资产登记的全部业务主键")

        clean_rows = [
            {key: row.get(key) for key in whitelist if key in row}
            for row in rows
            if isinstance(row, dict)
        ]
        if not clean_rows:
            raise ValueError("按期间全量快照不允许空数据批次")
        periods = {str(row.get(period_field, "")) for row in clean_rows}
        if len(periods) != 1 or not next(iter(periods)):
            raise ValueError("按期间全量快照批次必须且只能包含一个有效期间")
        period_value = next(iter(periods))
        if self.db.bind is not None and self.db.bind.dialect.name == "postgresql":
            await self.db.execute(
                text("SELECT pg_advisory_xact_lock(hashtext(:lock_key))"),
                {"lock_key": f"warehouse_snapshot:{target_asset}:{period_value}"},
            )
        if any(any(row.get(column) in (None, "") for column in pk_columns) for row in clean_rows):
            raise ValueError("按期间全量快照行缺少业务主键字段")

        deduped: dict[str, dict] = {}
        for row in clean_rows:
            row["pk_hash"] = _business_key_hash(row, pk_columns)
            if row["pk_hash"] in deduped:
                raise ValueError("按期间全量快照包含重复业务主键")
            deduped[row["pk_hash"]] = row
        payload = list(deduped.values())

        from app.data.dynamic_loader import register_source_table_model
        from app.data.models import DATA_TABLES

        model = DATA_TABLES.get(target_asset)
        if model is None:
            await register_source_table_model(self.db, target_asset, force=True)
            model = DATA_TABLES.get(target_asset)
        if model is None:
            raise ValueError("目标数据资产物理表不可用")

        stmt = pg_insert(model).values(payload)
        update_set = {
            column: getattr(stmt.excluded, column)
            for column in whitelist
        }
        if "synced_at" in model.__table__.columns:
            update_set["synced_at"] = stmt.excluded.synced_at
        await self.db.execute(
            stmt.on_conflict_do_update(index_elements=["pk_hash"], set_=update_set)
        )
        result = await self.db.execute(
            delete(model).where(
                getattr(model, period_field) == period_value,
                model.pk_hash.not_in(list(deduped)),
            )
        )
        await self.db.flush()
        return {
            "target_asset": target_asset,
            "write_mode": "period_full_snapshot",
            "written_count": len(payload),
            "inserted_count": None,
            "updated_count": None,
            "deleted_count": result.rowcount or 0,
            "field_whitelist": sorted(whitelist),
            "batch_id": batch_id,
            "period_value": period_value,
            "business_key_fields": pk_columns,
        }
