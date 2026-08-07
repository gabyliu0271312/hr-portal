"""Unified quality execution and period status propagation."""
from __future__ import annotations

from datetime import UTC, datetime
from uuid import uuid4

from sqlalchemy import or_, select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.datasets.models import DataSetRelation, DataSetTable
from app.reports.models import Report
from app.warehouse.models import WarehouseQualityRule, WarehouseQualityRuleDependency, WarehouseQualityRun, WarehouseQualityStatus
from app.warehouse.quality_engine import execute_quality_rule


def _asset_key(asset_id: int | None, asset_code: str | None) -> str:
    return f"id:{asset_id}" if asset_id is not None else f"code:{asset_code or ''}"


def _status_from_run(run_status: str) -> str:
    return {"pass": "passed", "warn": "warning", "fail": "failed", "error": "failed"}.get(run_status, "pending")


def _severity(rule_severity: str, run_status: str) -> str:
    if run_status in ("pass",):
        return "info"
    if run_status == "warn":
        return "warn"
    return "block" if rule_severity == "error" else "warn"


def _run_result_payload(run: WarehouseQualityRun) -> dict:
    return {
        "status": run.status,
        "checked_count": run.checked_count,
        "failed_count": run.failed_count,
        "message": run.message or "quality task already executed",
        "duplicate_key_count": run.duplicate_key_count,
        "missing_key_count": run.missing_key_count,
        "sample_key_hashes": run.sample_key_hashes or [],
    }


def _sync_run_sequence(batch_id: str | None) -> int | None:
    if not batch_id or not batch_id.startswith("sync_run:"):
        return None
    try:
        return int(batch_id.rsplit(":", 1)[1])
    except ValueError:
        return None


def _is_older_batch(incoming: str | None, current: str | None) -> bool:
    incoming_sequence = _sync_run_sequence(incoming)
    current_sequence = _sync_run_sequence(current)
    return incoming_sequence is not None and current_sequence is not None and incoming_sequence < current_sequence


async def upsert_quality_status(
    db: AsyncSession,
    *,
    asset_type: str,
    asset_id: int | None = None,
    asset_code: str | None = None,
    period: str | None = None,
    status: str = "pending",
    severity: str = "info",
    source_sync_batch_id: str | None = None,
    checked_at: datetime | None = None,
    checked_count: int = 0,
    failed_count: int = 0,
    duplicate_key_count: int = 0,
    missing_key_count: int = 0,
    sample_key_hashes: list | None = None,
    message: str | None = None,
) -> WarehouseQualityStatus:
    normalized_period = period or ""
    key = _asset_key(asset_id, asset_code)
    values = {
        "asset_id": asset_id, "asset_code": asset_code, "status": status,
        "severity": severity, "source_sync_batch_id": source_sync_batch_id,
        "source_sync_sequence": _sync_run_sequence(source_sync_batch_id),
        "checked_at": checked_at, "checked_count": checked_count,
        "failed_count": failed_count, "duplicate_key_count": duplicate_key_count,
        "missing_key_count": missing_key_count,
        "sample_key_hashes": sample_key_hashes or [], "message": message,
    }
    statement = pg_insert(WarehouseQualityStatus).values(
        asset_type=asset_type,
        asset_key=key,
        period=normalized_period,
        **values,
    )
    statement = statement.on_conflict_do_update(
        index_elements=["asset_type", "asset_key", "period"],
        set_=values,
        where=or_(
            statement.excluded.source_sync_sequence.is_(None),
            WarehouseQualityStatus.source_sync_sequence.is_(None),
            statement.excluded.source_sync_sequence >= WarehouseQualityStatus.source_sync_sequence,
        ),
    )
    await db.execute(statement)
    item = (await db.execute(select(WarehouseQualityStatus).where(
        WarehouseQualityStatus.asset_type == asset_type,
        WarehouseQualityStatus.asset_key == key,
        WarehouseQualityStatus.period == normalized_period,
    ))).scalar_one()
    await db.flush()
    return item


def _state_sort_key(item) -> tuple[float, int]:
    checked_at = getattr(item, "checked_at", None)
    timestamp = checked_at.timestamp() if checked_at is not None else float("-inf")
    return timestamp, int(getattr(item, "id", 0) or 0)


def _select_relation_states(
    relation_ids: list[int],
    relation_states: list,
    source_sync_batch_id: str | None,
) -> dict[int, object]:
    """Select current-batch states first, otherwise the latest state for each relation."""
    selected: dict[int, object] = {}
    candidates_by_relation: dict[int, list] = {}
    relation_id_set = set(relation_ids)
    for item in relation_states:
        relation_id = getattr(item, "asset_id", None)
        if relation_id in relation_id_set:
            candidates_by_relation.setdefault(relation_id, []).append(item)
    for relation_id in relation_ids:
        candidates = candidates_by_relation.get(relation_id, [])
        current_batch = [
            item for item in candidates
            if getattr(item, "source_sync_batch_id", None) == source_sync_batch_id
        ]
        if current_batch:
            selected[relation_id] = max(current_batch, key=_state_sort_key)
        elif candidates:
            selected[relation_id] = max(candidates, key=_state_sort_key)
    return selected


def _rule_applies_to_dataset(rule: WarehouseQualityRule, dataset_id: int, table_names: set[str], aliases: set[str], relation_ids: set[int]) -> bool:
    config = rule.rule_config or {}
    if rule.asset_type == "relation":
        return int(config.get("dataset_id") or 0) == dataset_id and int(config.get("relation_id") or 0) in relation_ids
    if rule.asset_type == "table":
        return rule.asset_code in table_names
    if rule.asset_type == "field":
        prefix = rule.asset_code.rsplit(".", 1)[0] if "." in rule.asset_code else ""
        return prefix in table_names or prefix in aliases
    if rule.asset_type == "dataset":
        return str(rule.asset_code) == str(dataset_id)
    return False


def _status_key_for_rule(rule: WarehouseQualityRule) -> tuple[str, str]:
    config = rule.rule_config or {}
    if rule.asset_type == "relation":
        return "relation", _asset_key(int(config.get("relation_id")), None)
    if rule.asset_type == "dataset":
        return "dataset", _asset_key(int(rule.asset_code), None)
    return rule.asset_type, _asset_key(None, rule.asset_code)


def _select_quality_states(states: list, keys: set[tuple[str, str]], source_sync_batch_id: str | None) -> dict[tuple[str, str], object]:
    selected: dict[tuple[str, str], object] = {}
    candidates: dict[tuple[str, str], list] = {}
    for item in states:
        key = (getattr(item, "asset_type", ""), getattr(item, "asset_key", ""))
        if key in keys:
            candidates.setdefault(key, []).append(item)
    for key, items in candidates.items():
        current = [item for item in items if getattr(item, "source_sync_batch_id", None) == source_sync_batch_id]
        selected[key] = max(current or items, key=_state_sort_key)
    return selected


async def _propagate_quality_status(
    db: AsyncSession,
    rule: WarehouseQualityRule,
    *, period: str | None,
    source_sync_batch_id: str | None,
    checked_at: datetime,
    result: dict,
) -> None:
    config = rule.rule_config or {}
    dataset_ids: set[int] = set()
    if rule.asset_type == "relation":
        dataset_id = int(config.get("dataset_id") or 0)
        if dataset_id:
            dataset_ids.add(dataset_id)
    elif rule.asset_type == "dataset":
        try:
            dataset_ids.add(int(rule.asset_code))
        except (TypeError, ValueError):
            pass
    else:
        table_name = rule.asset_code.rsplit(".", 1)[0] if rule.asset_type == "field" and "." in rule.asset_code else rule.asset_code
        dataset_ids.update((await db.execute(
            select(DataSetTable.dataset_id).where(
                (DataSetTable.table_name == table_name) | (DataSetTable.alias == table_name)
            )
        )).scalars().all())
    if not dataset_ids:
        return

    all_rules = (await db.execute(select(WarehouseQualityRule).where(WarehouseQualityRule.enabled.is_(True)))).scalars().all()
    for dataset_id in dataset_ids:
        table_rows = (await db.execute(select(DataSetTable).where(DataSetTable.dataset_id == dataset_id))).scalars().all()
        relation_rows = (await db.execute(select(DataSetRelation).where(DataSetRelation.dataset_id == dataset_id))).scalars().all()
        table_names = {row.table_name for row in table_rows}
        aliases = {row.alias for row in table_rows}
        relation_ids = {int(row.id) for row in relation_rows}
        relevant_rules = [r for r in all_rules if _rule_applies_to_dataset(r, int(dataset_id), table_names, aliases, relation_ids)]
        if not relevant_rules:
            continue
        expected_keys = {_status_key_for_rule(r) for r in relevant_rules}
        states = (await db.execute(select(WarehouseQualityStatus).where(
            WarehouseQualityStatus.period == (period or ""),
            WarehouseQualityStatus.asset_type.in_({key[0] for key in expected_keys}),
        ))).scalars().all()
        selected = _select_quality_states(states, expected_keys, source_sync_batch_id)
        state_items = list(selected.values())
        state_statuses = {item.status for item in state_items}
        if len(selected) < len(expected_keys) or not state_items:
            dataset_status = "pending"
        elif "failed" in state_statuses:
            dataset_status = "failed"
        elif "warning" in state_statuses:
            dataset_status = "warning"
        elif state_statuses == {"passed"}:
            dataset_status = "passed"
        else:
            dataset_status = "pending"
        dataset_severity = "block" if dataset_status == "failed" and any(item.severity == "block" for item in state_items) else ("warn" if dataset_status in ("failed", "warning") else "info")
        await upsert_quality_status(
            db, asset_type="dataset", asset_id=int(dataset_id), period=period,
            status=dataset_status, severity=dataset_severity, source_sync_batch_id=source_sync_batch_id,
            checked_at=checked_at, checked_count=sum(item.checked_count or 0 for item in state_items),
            failed_count=sum(item.failed_count or 0 for item in state_items),
            message="quality status aggregated from table, field, and relation rules",
        )
        reports = (await db.execute(select(Report).where(Report.dataset_id == int(dataset_id)))).scalars().all()
        for report in reports:
            await upsert_quality_status(
                db, asset_type="report", asset_id=report.id, period=period,
                status=dataset_status, severity=dataset_severity, source_sync_batch_id=source_sync_batch_id,
                checked_at=checked_at, checked_count=sum(item.checked_count or 0 for item in state_items),
                failed_count=sum(item.failed_count or 0 for item in state_items),
                message="quality status aggregated from dataset",
            )


async def run_quality_rule(
    db: AsyncSession,
    rule_id: int,
    *,
    period: str | None = None,
    source_sync_batch_id: str | None = None,
    triggered_by: str = "manual",
    user=None,
    force: bool = False,
) -> tuple[WarehouseQualityRun, dict]:
    rule = await db.get(WarehouseQualityRule, rule_id)
    if rule is None:
        raise LookupError(f"璐ㄩ噺瑙勫垯涓嶅瓨鍦? {rule_id}")
    if rule.rule_type == "relation_cardinality":
        import re
        if not isinstance(period, str) or not re.fullmatch(r"\d{6}", period):
            raise ValueError("relation_cardinality requires period in YYYYMM format")
    started = datetime.now(UTC)
    config = dict(rule.rule_config or {})
    if period:
        config["period"] = period
    if period and not source_sync_batch_id:
        source_sync_batch_id = f"manual:{rule.id}:{period}:{uuid4().hex}"
    dedupe_key = f"{rule.id}:{period or ''}:{source_sync_batch_id or ''}"
    if force:
        dedupe_key = f"{dedupe_key}:force:{uuid4().hex}"
    reserved_run = None
    if source_sync_batch_id:
        reservation = pg_insert(WarehouseQualityRun).values(
            rule_id=rule.id,
            status="running",
            checked_count=0,
            failed_count=0,
            sample_rows=None,
            message="quality task running",
            period=period,
            source_sync_batch_id=source_sync_batch_id,
            asset_type=rule.asset_type,
            asset_id=(config.get("relation_id") if rule.asset_type == "relation" else None),
            severity=_severity(rule.severity, "pending"),
            duplicate_key_count=0,
            missing_key_count=0,
            sample_key_hashes=[],
            triggered_by=triggered_by,
            dedupe_key=dedupe_key,
            started_at=started,
        ).on_conflict_do_nothing(
            index_elements=["dedupe_key"],
            index_where=WarehouseQualityRun.dedupe_key.is_not(None),
        ).returning(WarehouseQualityRun.id)
        reserved_id = (await db.execute(reservation)).scalar_one_or_none()
        if reserved_id is None:
            existing = (await db.execute(select(WarehouseQualityRun).where(
                WarehouseQualityRun.dedupe_key == dedupe_key,
            ))).scalar_one()
            return existing, _run_result_payload(existing)
        reserved_run = await db.get(WarehouseQualityRun, reserved_id)

    try:
        result = await execute_quality_rule(db, rule.id, rule.asset_type, rule.asset_code, rule.rule_type, config, user=user)
    except Exception:
        if reserved_run is not None:
            await db.delete(reserved_run)
            await db.flush()
        raise
    finished = datetime.now(UTC)
    if reserved_run is None:
        run = WarehouseQualityRun(
            rule_id=rule.id, status=result["status"], checked_count=result.get("checked_count", 0),
            failed_count=result.get("failed_count", 0), sample_rows=None, message=result.get("message"),
            period=period, source_sync_batch_id=source_sync_batch_id, asset_type=rule.asset_type,
            asset_id=(config.get("relation_id") if rule.asset_type == "relation" else None),
            severity=_severity(rule.severity, result["status"]), duplicate_key_count=result.get("duplicate_key_count", 0),
            missing_key_count=result.get("missing_key_count", 0), sample_key_hashes=result.get("sample_key_hashes", []),
            triggered_by=triggered_by, dedupe_key=dedupe_key, started_at=started, finished_at=finished,
        )
        db.add(run)
    else:
        run = reserved_run
        run.status = result["status"]
        run.checked_count = result.get("checked_count", 0)
        run.failed_count = result.get("failed_count", 0)
        run.sample_rows = None
        run.message = result.get("message")
        run.severity = _severity(rule.severity, result["status"])
        run.duplicate_key_count = result.get("duplicate_key_count", 0)
        run.missing_key_count = result.get("missing_key_count", 0)
        run.sample_key_hashes = result.get("sample_key_hashes", [])
        run.finished_at = finished
    rule.last_run_status = result["status"]
    rule.last_run_at = finished
    current_status = _status_from_run(result["status"])
    status_asset_id = config.get("relation_id") if rule.rule_type == "relation_cardinality" else None
    status_asset_code = None if status_asset_id is not None else rule.asset_code
    await upsert_quality_status(
        db, asset_type=rule.asset_type, asset_id=status_asset_id, asset_code=status_asset_code, period=period,
        status=current_status, severity=_severity(rule.severity, result["status"]),
        source_sync_batch_id=source_sync_batch_id, checked_at=finished,
        checked_count=result.get("checked_count", 0), failed_count=result.get("failed_count", 0),
        duplicate_key_count=result.get("duplicate_key_count", 0), missing_key_count=result.get("missing_key_count", 0),
        sample_key_hashes=result.get("sample_key_hashes", []), message=result.get("message"),
    )
    await _propagate_quality_status(
        db, rule, period=period, source_sync_batch_id=source_sync_batch_id,
        checked_at=finished, result=result,
    )
    await db.flush()
    return run, result


def _relation_dependency_tables(rule: WarehouseQualityRule, relation: DataSetRelation, table_by_alias: dict[str, str]) -> set[str]:
    config = rule.rule_config or {}
    if rule.rule_type != "relation_cardinality" or int(config.get("relation_id") or 0) != int(relation.id):
        return set()
    return {table_by_alias[alias] for alias in (relation.left_alias, relation.right_alias) if alias in table_by_alias}


async def rebuild_quality_rule_dependency_index(db: AsyncSession) -> int:
    """Rebuild the materialized relation-rule-to-table dependency index."""
    rules = (await db.execute(select(WarehouseQualityRule).where(
        WarehouseQualityRule.rule_type == "relation_cardinality",
    ))).scalars().all()
    relation_ids = {int((rule.rule_config or {}).get("relation_id") or 0) for rule in rules}
    relations = (await db.execute(select(DataSetRelation).where(DataSetRelation.id.in_(relation_ids or [-1])))).scalars().all()
    relations_by_id = {int(relation.id): relation for relation in relations}
    dataset_ids = {int(relation.dataset_id) for relation in relations}
    table_rows = (await db.execute(select(DataSetTable).where(DataSetTable.dataset_id.in_(dataset_ids or [-1])))).scalars().all()
    aliases_by_dataset: dict[int, dict[str, str]] = {}
    for row in table_rows:
        aliases_by_dataset.setdefault(int(row.dataset_id), {})[row.alias] = row.table_name

    await db.execute(WarehouseQualityRuleDependency.__table__.delete())
    dependencies: list[dict] = []
    for rule in rules:
        relation = relations_by_id.get(int((rule.rule_config or {}).get("relation_id") or 0))
        if relation is None:
            continue
        for table_name in _relation_dependency_tables(rule, relation, aliases_by_dataset.get(int(relation.dataset_id), {})):
            dependencies.append({
                "rule_id": rule.id, "table_name": table_name,
                "dataset_id": relation.dataset_id, "relation_id": relation.id,
            })
    if dependencies:
        await db.execute(pg_insert(WarehouseQualityRuleDependency).values(dependencies))
    await db.flush()
    return len(dependencies)


async def affected_relation_rule_ids(db: AsyncSession, table_name: str) -> list[int]:
    dependency_count = (await db.execute(select(WarehouseQualityRuleDependency.id).limit(1))).scalar_one_or_none()
    if dependency_count is None:
        await rebuild_quality_rule_dependency_index(db)
    rule_ids = (await db.execute(
        select(WarehouseQualityRuleDependency.rule_id)
        .join(WarehouseQualityRule, WarehouseQualityRule.id == WarehouseQualityRuleDependency.rule_id)
        .where(
            WarehouseQualityRuleDependency.table_name == table_name,
            WarehouseQualityRule.enabled.is_(True),
            WarehouseQualityRule.rule_type == "relation_cardinality",
        )
    )).scalars().all()
    return [int(rule_id) for rule_id in rule_ids]


async def affected_table_rule_ids(db: AsyncSession, table_name: str) -> list[int]:
    rules = (await db.execute(select(WarehouseQualityRule.id).where(
        WarehouseQualityRule.enabled.is_(True),
        WarehouseQualityRule.asset_type == "table",
        WarehouseQualityRule.asset_code == table_name,
    ))).scalars().all()
    return [int(rule_id) for rule_id in rules]
