"""Scan persisted report configurations for inactive column-instance references."""
from __future__ import annotations

import argparse
import asyncio
import sys
from pathlib import Path

from pydantic import ValidationError
from sqlalchemy import select

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.core.db import AsyncSessionLocal
from app.reports.config import ReportConfig
from app.reports.models import Report
from app.reports.validation import validate_report_config_references


async def check_report_config_references(report_id: int | None = None) -> list[str]:
    async with AsyncSessionLocal() as db:
        stmt = select(Report).order_by(Report.id)
        if report_id is not None:
            stmt = stmt.where(Report.id == report_id)
        reports = (await db.execute(stmt)).scalars().all()

    issues: list[str] = []
    for report in reports:
        try:
            validate_report_config_references(ReportConfig(**(report.config or {})))
        except (ValidationError, ValueError) as exc:
            issues.append(f"report_id={report.id} name={report.name!r}: {exc}")
    return issues


async def main() -> None:
    parser = argparse.ArgumentParser(
        description="Check persisted report configurations for inactive column-instance references."
    )
    parser.add_argument("--report-id", type=int, help="Check one report only")
    parser.add_argument("--strict", action="store_true", help="Return nonzero when issues exist")
    args = parser.parse_args()

    issues = await check_report_config_references(args.report_id)
    if not issues:
        print("[OK] No inactive report column-instance references found.")
        return

    print(f"[ISSUES] {len(issues)} report configuration(s) need repair:")
    for issue in issues:
        print(f"- {issue}")
    if args.strict:
        raise SystemExit(1)


if __name__ == "__main__":
    asyncio.run(main())
