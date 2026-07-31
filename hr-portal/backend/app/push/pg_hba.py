from __future__ import annotations

import ipaddress
import os
import tempfile
from pathlib import Path

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession


_MANAGED_FILE = os.getenv("PG_HBA_MANAGED_FILE", "/app/pg_hba.conf")
_BEGIN = "# BEGIN HR PORTAL MANAGED RULES"
_END = "# END HR PORTAL MANAGED RULES"


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
    path.parent.mkdir(parents=True, exist_ok=True)
    previous = path.read_bytes() if path.exists() else b""
    content = previous.decode("utf-8") if previous else f"{_BEGIN}\n{_END}\n"
    if _BEGIN not in content or _END not in content:
        raise RuntimeError("pg_hba.conf 缺少 HR Portal 受管规则标记")
    before, remainder = content.split(_BEGIN, 1)
    _, after = remainder.split(_END, 1)
    updated = f"{before}{_BEGIN}\n{managed}\n{_END}{after}"
    fd, temp_name = tempfile.mkstemp(prefix=".managed_hba.", dir=str(path.parent))
    try:
        with os.fdopen(fd, "w", encoding="utf-8", newline="\n") as handle:
            handle.write(updated)
        os.replace(temp_name, path)
        await db.execute(text("SELECT pg_reload_conf()"))
    except Exception:
        try:
            path.write_bytes(previous)
        except OSError:
            pass
        try:
            os.unlink(temp_name)
        except OSError:
            pass
        raise