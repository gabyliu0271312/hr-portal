"""Controlled UCP writer for registered warehouse assets."""
from __future__ import annotations

import hashlib

from sqlalchemy import text, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.data.ddl import validate_column_name, validate_table_name
from app.data.models import RegisteredTable, TableColumn


def _business_key_hash(row: dict, primary_key: str) -> str:
    material = str(row.get(primary_key, ""))
    return hashlib.sha256(material.encode("utf-8")).hexdigest()[:32]

class WarehouseAssetSink:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def write(self, *, target_asset: str, rows: list[dict], write_mode: str, primary_key: str | None, field_whitelist: list[str], batch_id: str | None = None) -> dict:
        target_asset = validate_table_name(target_asset)
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
                    continue
            await self.db.execute(text(f'INSERT INTO "{target_asset}" (' + ", ".join(f'"{field}"' for field in fields) + ') VALUES (' + ", ".join(f':{field}' for field in fields) + ')'), row)
            written += 1
        await self.db.flush()
        return {"target_asset": target_asset, "write_mode": write_mode, "written_count": written, "field_whitelist": sorted(whitelist), "batch_id": batch_id}
