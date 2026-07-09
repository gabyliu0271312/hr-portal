"""Normalize legacy push target report sources in the database.

Why this script exists
----------------------
Some production rows were created with a report source stored in legacy fields,
for example:

    source_table = 'report:3'
    source_type  = 'table'
    source_id    = 'report:3'
    source_label = 'report:3'

The application now normalizes these rows on read, but running this script fixes
the persisted data too, so the edit dialog and future API responses no longer
need to depend on legacy fallback behavior.

How to enter the database manually
----------------------------------
Docker deployment, from the project directory that contains docker-compose.yml:

    docker compose exec db psql -U "$DB_USER" -d "$DB_NAME"

If DB_USER / DB_NAME are not exported in the shell, use the project defaults:

    docker compose exec db psql -U hr_portal -d hr_portal

If connecting from the host and PostgreSQL is exposed on 127.0.0.1:5432:

    psql -h 127.0.0.1 -p 5432 -U hr_portal -d hr_portal

Useful verification SQL after entering psql:

    SELECT id, source_table, source_type, source_id, source_label
    FROM push_targets
    WHERE source_table LIKE 'report:%'
       OR source_id LIKE 'report:%'
       OR source_type = 'report'
    ORDER BY id;

How to run the repair
---------------------
Preferred: run through the backend container so it uses the same .env and Python
runtime as production:

    docker compose exec backend python scripts/normalize_push_report_sources.py

Dry-run first:

    docker compose exec backend python scripts/normalize_push_report_sources.py --dry-run

Local development:

    cd backend
    python scripts/normalize_push_report_sources.py --dry-run
    python scripts/normalize_push_report_sources.py
"""
from __future__ import annotations

import argparse
import asyncio
import sys
from dataclasses import dataclass
from pathlib import Path

from sqlalchemy import select

# Allow running as `python scripts/normalize_push_report_sources.py` inside the
# backend container, where Python otherwise puts /app/scripts (not /app) on
# sys.path and cannot import the top-level `app` package.
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.core.db import AsyncSessionLocal
from app.push.models import PushTarget
from app.reports.models import Report

REPORT_PREFIX = "report:"


@dataclass
class RepairChange:
    id: int
    before: tuple[str, str, str, str]
    after: tuple[str, str, str, str]


def _extract_report_id(pt: PushTarget) -> str | None:
    source_table = str(pt.source_table or "")
    source_id = str(pt.source_id or "")

    if source_table.startswith(REPORT_PREFIX):
        return source_table.split(":", 1)[1]
    if source_id.startswith(REPORT_PREFIX):
        return source_id.split(":", 1)[1]
    if pt.source_type == "report" and source_id.isdigit():
        return source_id
    return None


async def normalize_push_report_sources(*, dry_run: bool = False) -> list[RepairChange]:
    changes: list[RepairChange] = []

    async with AsyncSessionLocal() as db:
        rows = (
            await db.execute(
                select(PushTarget).where(
                    (PushTarget.source_table.like(f"{REPORT_PREFIX}%"))
                    | (PushTarget.source_id.like(f"{REPORT_PREFIX}%"))
                    | (PushTarget.source_type == "report")
                )
            )
        ).scalars().all()

        for pt in rows:
            report_id = _extract_report_id(pt)
            if not report_id or not report_id.isdigit():
                continue

            report = await db.get(Report, int(report_id))
            label = report.name if report else f"?? #{report_id}"

            before = (
                str(pt.source_table or ""),
                str(pt.source_type or ""),
                str(pt.source_id or ""),
                str(pt.source_label or ""),
            )
            after = (f"{REPORT_PREFIX}{report_id}", "report", report_id, label)

            if before == after:
                continue

            changes.append(RepairChange(id=int(pt.id), before=before, after=after))
            if not dry_run:
                pt.source_table = after[0]
                pt.source_type = after[1]
                pt.source_id = after[2]
                pt.source_label = after[3]

        if dry_run:
            await db.rollback()
        else:
            await db.commit()

    return changes


def _format_change(change: RepairChange) -> str:
    b = change.before
    a = change.after
    return (
        f"push_target id={change.id}: "
        f"({b[0]!r}, {b[1]!r}, {b[2]!r}, {b[3]!r}) -> "
        f"({a[0]!r}, {a[1]!r}, {a[2]!r}, {a[3]!r})"
    )


async def main() -> None:
    parser = argparse.ArgumentParser(
        description="Normalize legacy report source fields in push_targets."
    )
    parser.add_argument("--dry-run", action="store_true", help="Preview changes without committing")
    args = parser.parse_args()

    changes = await normalize_push_report_sources(dry_run=args.dry_run)
    mode = "DRY-RUN" if args.dry_run else "UPDATED"
    print(f"[{mode}] {len(changes)} push target(s) need normalization" if args.dry_run else f"[{mode}] {len(changes)} push target(s) normalized")
    for change in changes:
        print(_format_change(change))


if __name__ == "__main__":
    asyncio.run(main())
