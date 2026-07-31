from __future__ import annotations

import ipaddress
import os
import tempfile
from datetime import datetime
from pathlib import Path

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession


_MANAGED_FILE = os.getenv("PG_HBA_MANAGED_FILE", "/app/pg_hba.conf")
_BEGIN = "# BEGIN HR PORTAL MANAGED RULES"
_END = "# END HR PORTAL MANAGED RULES"


class PgHbaManagedBlockError(RuntimeError):
    """The configured pg_hba.conf does not contain a safe managed block."""


def _render_content(content: str, managed: str) -> str:
    begin_count = content.count(_BEGIN)
    end_count = content.count(_END)
    if begin_count != 1 or end_count != 1:
        raise PgHbaManagedBlockError(
            "运行态 pg_hba.conf 的 HR Portal 受管规则标记缺失或重复，请先完成配置升级"
        )
    before, remainder = content.split(_BEGIN, 1)
    managed_block, after = remainder.split(_END, 1)
    if _BEGIN in managed_block or _END in managed_block or _BEGIN in after or _END in after:
        raise PgHbaManagedBlockError(
            "运行态 pg_hba.conf 的 HR Portal 受管规则标记顺序不合法，请先完成配置升级"
        )
    return f"{before}{_BEGIN}\n{managed}\n{_END}{after}"


def _atomic_write(path: Path, content: bytes) -> None:
    fd, temp_name = tempfile.mkstemp(prefix=".managed_hba.", dir=str(path.parent))
    try:
        with os.fdopen(fd, "wb") as handle:
            handle.write(content)
        os.replace(temp_name, path)
    except Exception:
        try:
            os.unlink(temp_name)
        except OSError:
            pass
        raise


def prepare_pg_hba_managed_block() -> None:
    """Add an empty managed block to an existing HBA file without changing other rules."""
    path = Path(_MANAGED_FILE)
    if not path.exists():
        raise PgHbaManagedBlockError(f"pg_hba.conf 不存在: {path}")
    previous = path.read_bytes()
    try:
        content = previous.decode("utf-8")
    except UnicodeDecodeError as exc:
        raise PgHbaManagedBlockError("pg_hba.conf 不是合法 UTF-8 文件，无法自动升级") from exc
    begin_count = content.count(_BEGIN)
    end_count = content.count(_END)
    if begin_count == end_count == 1:
        _render_content(content, "")
        return
    if begin_count or end_count:
        raise PgHbaManagedBlockError("pg_hba.conf 的 HR Portal 受管规则标记不完整或重复，无法自动升级")
    anchor = "# TYPE  DATABASE"
    if content.count(anchor) != 1:
        raise PgHbaManagedBlockError("pg_hba.conf 中找不到唯一的安全插入位置，无法自动升级")
    backup = path.with_name(f"{path.name}.pre-hr-portal-{datetime.now():%Y%m%d%H%M%S}")
    _atomic_write(backup, previous)
    updated = content.replace(anchor, f"{_BEGIN}\n{_END}\n\n{anchor}", 1).encode("utf-8")
    _atomic_write(path, updated)


def _network(value: str) -> str:
    raw = str(value or "").strip()
    if not raw:
        raise ValueError("IP 白名单不能包含空地址")
    try:
        if "/" in raw:
            return str(ipaddress.ip_network(raw, strict=False))
        address = ipaddress.ip_address(raw)
        return f"{address}/32" if address.version == 4 else f"{address}/128"
    except ValueError as exc:
        raise ValueError(f"IP 白名单地址不合法: {raw}") from exc


def _quote_role(value: str) -> str:
    return '"' + str(value).replace('"', '""') + '"'


def build_rules(targets: list) -> str:
    lines = [
        "# Managed by HR Portal. Do not edit manually.",
        "# Included before the general host rules in pg_hba.conf.",
    ]
    for target in targets:
        settings = target.settings or {}
        role = settings.get("readonly_user")
        if not role:
            continue
        addresses = settings.get("ip_whitelist") or []
        db_name = settings.get("database") or "hr_portal"
        role_sql = _quote_role(role)
        if not addresses:
            lines.append(f"host {db_name} {role_sql} 0.0.0.0/0 reject")
            lines.append(f"host {db_name} {role_sql} ::0/0 reject")
            continue
        for value in addresses:
            network = _network(str(value))
            lines.append(f"host {db_name} {role_sql} {network} scram-sha-256")
        lines.append(f"host {db_name} {role_sql} 0.0.0.0/0 reject")
        lines.append(f"host {db_name} {role_sql} ::0/0 reject")
    return "\n".join(lines) + "\n"


async def sync_pg_hba_rules(db: AsyncSession) -> None:
    """Rewrite the managed rules and reload PostgreSQL."""
    from app.push.models import PushTarget

    rows = (await db.execute(
        text(
            "SELECT id, settings FROM push_targets "
            "WHERE is_active = true AND push_type IN ('db_realtime', 'db_snapshot')"
        )
    )).mappings().all()

    class Target:
        def __init__(self, row):
            self.settings = row["settings"] or {}

    managed = build_rules([Target(row) for row in rows]).rstrip()
    path = Path(_MANAGED_FILE)
    if not path.exists():
        raise PgHbaManagedBlockError(f"pg_hba.conf 不存在: {path}，请先完成配置升级")
    previous = path.read_bytes()
    try:
        content = previous.decode("utf-8")
    except UnicodeDecodeError as exc:
        raise PgHbaManagedBlockError("pg_hba.conf 不是合法 UTF-8 文件，请先完成配置升级") from exc
    updated = _render_content(content, managed).encode("utf-8")
    try:
        _atomic_write(path, updated)
        await db.execute(text("SELECT pg_reload_conf()"))
    except Exception:
        try:
            _atomic_write(path, previous)
            await db.execute(text("SELECT pg_reload_conf()"))
        except Exception:
            pass
        raise
