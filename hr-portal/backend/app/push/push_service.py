"""对外推送服务

支持三种推送方式：
  external_db — 写入对方数据库（MySQL / PostgreSQL）
  http_push   — POST JSON 到对方接口
  api_expose  — 暴露只读 API（生成 token，对方主动拉取）

推送逻辑与拉取完全镜像（upsert + 删孤儿）：
  - 月度表：只处理当月，历史月份保留
  - 非月度表：全量处理
  - 有主键匹配 → UPDATE；本次新增 → INSERT；本次没有 → DELETE
"""
from __future__ import annotations

import hashlib
import json
import logging
from datetime import datetime, UTC
from typing import Any

from sqlalchemy import cast, select, text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.ext.asyncio import AsyncSession

from app.data.models import DATA_TABLES, TableColumn
from app.datasources.sync_service import PERIOD_TABLES

logger = logging.getLogger("push_service")


# ===== 字段映射 =====

def apply_field_mappings(row: dict, mappings: list[dict]) -> dict:
    """按 field_mappings 配置重命名字段；空映射则原样返回"""
    if not mappings:
        return row
    mapping_dict = {m["source"]: m["target"] for m in mappings if m.get("source") and m.get("target")}
    return {mapping_dict.get(k, k): v for k, v in row.items()}


# ===== 读取源数据 =====

async def _load_source_rows(
    source_table: str,
    db: AsyncSession,
    period_ym: str = "",
) -> list[dict]:
    """从本地表读取要推送的行，月度表按 period_ym 过滤"""
    Model = DATA_TABLES.get(source_table)
    if Model is None:
        raise RuntimeError(f"未知数据表: {source_table}")

    # 取可见字段列表
    cols = (
        await db.execute(
            select(TableColumn)
            .where(TableColumn.table_name == source_table, TableColumn.is_visible.is_(True))
            .order_by(TableColumn.display_order)
        )
    ).scalars().all()
    col_codes = [c.column_code for c in cols]

    stmt = select(Model)
    period_cfg = PERIOD_TABLES.get(source_table)
    if period_cfg and period_ym:
        period_col = period_cfg["period_col"]
        stmt = stmt.where(cast(Model.raw, JSONB)[period_col].astext == period_ym)

    rows = (await db.execute(stmt)).scalars().all()
    return [
        {code: (r.raw or {}).get(code) for code in col_codes}
        for r in rows
    ]


def _row_pk_hash(row: dict, pk_cols: list[str]) -> str:
    if pk_cols:
        material = "||".join(str(row.get(c, "")) for c in pk_cols)
    else:
        material = json.dumps(row, sort_keys=True, ensure_ascii=False)
    return hashlib.sha256(material.encode()).hexdigest()[:32]


# ===== external_db 推送（MySQL / PostgreSQL）=====

async def push_external_db(
    source_table: str,
    settings: dict,
    secrets: dict,
    field_mappings: list[dict],
    db: AsyncSession,
) -> tuple[int, str]:
    """写入外部数据库，upsert + 删孤儿"""
    import aiomysql

    host = settings.get("host", "localhost")
    port = int(settings.get("port", 3306))
    database = settings.get("database", "")
    user = settings.get("user", "")
    target_table = settings.get("target_table", source_table)
    dialect = settings.get("dialect", "mysql")

    password = secrets.get("password", "")

    # 月度判断
    period_cfg = PERIOD_TABLES.get(source_table)
    period_ym = settings.get("period_ym", "")

    rows = await _load_source_rows(source_table, db, period_ym)
    if not rows:
        return 0, "源表无数据，推送跳过"

    # 字段映射
    mapped_rows = [apply_field_mappings(r, field_mappings) for r in rows]

    # 空字符串 → None，避免 MySQL 严格模式 DECIMAL/数值列报错
    def _clean(row: dict) -> dict:
        return {k: (None if v == "" else v) for k, v in row.items()}
    mapped_rows = [_clean(r) for r in mapped_rows]

    # 取主键列（源表 is_pk_part 的字段，映射后的名字）
    src_pk_cols = [
        c.column_code for c in (
            await db.execute(
                select(TableColumn).where(
                    TableColumn.table_name == source_table,
                    TableColumn.is_pk_part.is_(True),
                )
            )
        ).scalars().all()
    ]
    pk_mapping = {m["source"]: m["target"] for m in field_mappings if m.get("source") and m.get("target")}
    target_pk_cols = [pk_mapping.get(c, c) for c in src_pk_cols]

    all_cols = list(mapped_rows[0].keys()) if mapped_rows else []
    # 非主键列（用于 UPDATE SET）
    non_pk_cols = [c for c in all_cols if c not in target_pk_cols]

    conn = await aiomysql.connect(
        host=host, port=port, db=database,
        user=user, password=password,
        charset="utf8mb4", autocommit=False,
    )
    try:
        async with conn.cursor() as cur:
            # 推送前去重：目标表按业务主键有重复行时，保留 MIN(id)，删除多余行
            deduped = 0
            if target_pk_cols:
                pk_col_list = ", ".join(f"`{c}`" for c in target_pk_cols)
                dedup_sql = (
                    f"DELETE FROM `{target_table}` WHERE id NOT IN ("
                    f"SELECT min_id FROM ("
                    f"SELECT MIN(id) AS min_id FROM `{target_table}` GROUP BY {pk_col_list}"
                    f") AS t"
                    f")"
                )
                await cur.execute(dedup_sql)
                deduped = cur.rowcount
                await conn.commit()

            current_hashes: set[str] = set()
            upserted = 0

            if not target_pk_cols:
                # 无业务主键：全量替换（月度表只删当月，非月度表全删）
                if period_cfg and period_ym:
                    period_target_col = pk_mapping.get(period_cfg["period_col"], period_cfg["period_col"])
                    await cur.execute(
                        f"DELETE FROM `{target_table}` WHERE `{period_target_col}` = %s",
                        (period_ym,),
                    )
                else:
                    await cur.execute(f"DELETE FROM `{target_table}`")
                await conn.commit()

            for row in mapped_rows:
                ph = _row_pk_hash(row, target_pk_cols)
                current_hashes.add(ph)

                if not all_cols:
                    continue

                if target_pk_cols and non_pk_cols:
                    # 有业务主键：先 SELECT 判断存在，存在则 UPDATE，否则 INSERT
                    where_clause = " AND ".join(f"`{c}` = %s" for c in target_pk_cols)
                    await cur.execute(
                        f"SELECT COUNT(*) FROM `{target_table}` WHERE {where_clause}",
                        [row.get(c) for c in target_pk_cols],
                    )
                    (cnt,) = await cur.fetchone()
                    if cnt > 0:
                        set_clause = ", ".join(f"`{c}` = %s" for c in non_pk_cols)
                        await cur.execute(
                            f"UPDATE `{target_table}` SET {set_clause} WHERE {where_clause}",
                            [row.get(c) for c in non_pk_cols] + [row.get(c) for c in target_pk_cols],
                        )
                    else:
                        col_list = ", ".join(f"`{c}`" for c in all_cols)
                        placeholders = ", ".join(["%s"] * len(all_cols))
                        await cur.execute(
                            f"INSERT INTO `{target_table}` ({col_list}) VALUES ({placeholders})",
                            [row.get(c) for c in all_cols],
                        )
                else:
                    # 无业务主键：全量替换，直接 INSERT（上面已清空当期）
                    col_list = ", ".join(f"`{c}`" for c in all_cols)
                    placeholders = ", ".join(["%s"] * len(all_cols))
                    await cur.execute(
                        f"INSERT INTO `{target_table}` ({col_list}) VALUES ({placeholders})",
                        [row.get(c) for c in all_cols],
                    )
                upserted += 1

            # 删孤儿：月度表只删当月，非月度表全量
            deleted = 0
            if target_pk_cols:
                # 查出目标表当前主键（月度表加 period 过滤）
                if period_cfg and period_ym:
                    period_target_col = pk_mapping.get(period_cfg["period_col"], period_cfg["period_col"])
                    await cur.execute(
                        f"SELECT {', '.join(f'`{c}`' for c in target_pk_cols)} "
                        f"FROM `{target_table}` WHERE `{period_target_col}` = %s",
                        (period_ym,),
                    )
                else:
                    await cur.execute(
                        f"SELECT {', '.join(f'`{c}`' for c in target_pk_cols)} FROM `{target_table}`"
                    )
                existing = await cur.fetchall()

                to_delete = []
                for ex_row in existing:
                    ex_dict = dict(zip(target_pk_cols, ex_row))
                    ex_hash = _row_pk_hash(ex_dict, target_pk_cols)
                    if ex_hash not in current_hashes:
                        to_delete.append(ex_dict)

                deleted = 0
                for d in to_delete:
                    where = " AND ".join(f"`{c}` = %s" for c in target_pk_cols)
                    await cur.execute(
                        f"DELETE FROM `{target_table}` WHERE {where}",
                        [d[c] for c in target_pk_cols],
                    )
                    deleted += 1

        await conn.commit()
        msg = f"推送成功：去重 {deduped} 行，upsert {upserted} 行，删除 {deleted} 行孤儿"
        logger.info("[push_external_db] %s → %s:%s/%s  %s", source_table, host, port, target_table, msg)
        return upserted, msg
    finally:
        conn.close()


# ===== http_push 推送 =====

async def push_http(
    source_table: str,
    settings: dict,
    secrets: dict,
    field_mappings: list[dict],
    db: AsyncSession,
) -> tuple[int, str]:
    """POST JSON 到对方接口"""
    import httpx

    url = settings.get("url", "")
    method = settings.get("method", "POST").upper()
    headers = dict(settings.get("headers") or {})
    token = secrets.get("bearer_token", "")
    if token:
        headers["Authorization"] = f"Bearer {token}"
    batch_size = int(settings.get("batch_size", 500))

    period_cfg = PERIOD_TABLES.get(source_table)
    period_ym = settings.get("period_ym", "")

    rows = await _load_source_rows(source_table, db, period_ym)
    mapped_rows = [apply_field_mappings(r, field_mappings) for r in rows]

    total = 0
    async with httpx.AsyncClient(timeout=60) as client:
        for i in range(0, len(mapped_rows), batch_size):
            batch = mapped_rows[i: i + batch_size]
            resp = await client.request(method, url, json=batch, headers=headers)
            resp.raise_for_status()
            total += len(batch)

    return total, f"HTTP 推送成功：{total} 行"


# ===== api_expose（只读 token 接口，对方主动拉）=====
# 实际数据由 push_router 里的 GET /push-targets/{id}/data 接口提供
# 此处只做 token 生成占位
async def push_api_expose(
    source_table: str,
    settings: dict,
    secrets: dict,
    field_mappings: list[dict],
    db: AsyncSession,
) -> tuple[int, str]:
    rows = await _load_source_rows(source_table, db, settings.get("period_ym", ""))
    return len(rows), f"API 暴露就绪：{len(rows)} 行可供拉取"


async def push_db_expose(
    source_table: str,
    settings: dict,
    secrets: dict,
    field_mappings: list[dict],
    db: AsyncSession,
) -> tuple[int, str]:
    """在本地 PostgreSQL 创建只读账号并授权指定表，返回连接信息。"""
    import secrets as py_secrets
    import string
    from sqlalchemy import text
    from app.core.config import settings as app_settings

    readonly_user = settings.get("readonly_user") or f"ro_{source_table}"[:30]
    password = secrets.get("readonly_password", "")
    if not password:
        alphabet = string.ascii_letters + string.digits + "!@#$%^&*()_+-="
        password = "".join(py_secrets.choice(alphabet) for _ in range(20))

    await db.execute(text(
        f"DO $$ BEGIN "
        f"IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = '{readonly_user}') THEN "
        f"CREATE USER \"{readonly_user}\" WITH PASSWORD '{password}'; "
        f"END IF; END $$;"
    ))
    await db.execute(text(f'GRANT CONNECT ON DATABASE "{app_settings.DB_NAME}" TO "{readonly_user}";'))
    await db.execute(text(f'GRANT USAGE ON SCHEMA public TO "{readonly_user}";'))
    await db.execute(text(f'GRANT SELECT ON "{source_table}" TO "{readonly_user}";'))
    await db.commit()

    conn_url = (
        f"postgresql://{readonly_user}:{password}"
        f"@{app_settings.DB_HOST}:{app_settings.DB_PORT}/{app_settings.DB_NAME}"
    )

    from app.push.models import PushTarget
    from sqlalchemy import select as sa_select
    pts = (await db.execute(
        sa_select(PushTarget).where(
            PushTarget.source_table == source_table,
            PushTarget.push_type == "db_expose",
        )
    )).scalars().first()
    if pts:
        from app.core.secret_box import encrypt
        from sqlalchemy.orm.attributes import flag_modified
        new_secrets = dict(pts.secrets_encrypted or {})
        new_secrets["readonly_password"] = encrypt(password)
        pts.secrets_encrypted = new_secrets
        pts.settings = {
            **(pts.settings or {}),
            "readonly_user": readonly_user,
            "host": app_settings.DB_HOST,
            "port": app_settings.DB_PORT,
            "database": app_settings.DB_NAME,
            "conn_url": conn_url,
        }
        if "ip_whitelist" not in pts.settings:
            pts.settings["ip_whitelist"] = []
        flag_modified(pts, "secrets_encrypted")
        flag_modified(pts, "settings")
        await db.commit()

    rows = (await db.execute(text(f'SELECT COUNT(*) FROM "{source_table}"'))).scalar_one()
    return rows, f"只读账号已就绪：{readonly_user}  连接URL：{conn_url}"


# ===== 统一调度入口 =====

PUSH_HANDLERS = {
    "external_db": push_external_db,
    "http_push": push_http,
    "api_expose": push_api_expose,
    "db_expose": push_db_expose,
}


async def execute_push(
    push_target_id: int,
    db: AsyncSession,
    period_ym: str = "",
) -> tuple[int, str]:
    from app.push.models import PushTarget
    from app.core.secret_box import decrypt

    pt = await db.get(PushTarget, push_target_id)
    if pt is None:
        raise RuntimeError(f"PushTarget {push_target_id} 不存在")
    if not pt.is_active:
        raise RuntimeError("推送目标已禁用")

    handler = PUSH_HANDLERS.get(pt.push_type)
    if handler is None:
        raise RuntimeError(f"不支持的推送类型: {pt.push_type}")

    secrets = {k: decrypt(v) for k, v in (pt.secrets_encrypted or {}).items()}
    settings = dict(pt.settings or {})

    # period_ym 优先取调用方传入的，其次取配置里的
    if period_ym:
        settings["period_ym"] = period_ym

    rows, message = await handler(
        pt.source_table, settings, secrets, pt.field_mappings or [], db
    )

    # 回写状态
    pt.last_push_at = datetime.now(UTC)
    pt.last_status = "success"
    pt.last_rows = rows
    pt.last_message = message

    return rows, message
