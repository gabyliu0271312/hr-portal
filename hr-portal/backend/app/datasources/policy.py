"""统一的数据源入仓策略解析。"""
from __future__ import annotations

from dataclasses import dataclass

INGESTION_MODES = {
    "current_snapshot",
    "incremental_upsert",
    "append",
    "period_full_snapshot",
}
SYNC_SEMANTICS = {"full_snapshot", "incremental_append", "incremental_upsert"}
WRITE_STRATEGIES = {"full_refresh", "incremental_upsert", "append"}
MISSING_ROW_STRATEGIES = {"hard_delete", "mark_inactive", "keep_history"}

_MODE_POLICIES = {
    "current_snapshot": ("full_snapshot", "incremental_upsert", "mark_inactive"),
    "incremental_upsert": ("incremental_upsert", "incremental_upsert", "keep_history"),
    "append": ("incremental_append", "append", "keep_history"),
    "period_full_snapshot": ("full_snapshot", "incremental_upsert", "hard_delete"),
}


@dataclass(frozen=True)
class IngestionPolicy:
    mode: str
    sync_semantics: str
    write_strategy: str
    missing_row_strategy: str
    business_key_fields: tuple[str, ...] = ()


def policy_for_mode(mode: str, business_key_fields: list[str] | None = None) -> IngestionPolicy:
    if mode not in INGESTION_MODES:
        raise ValueError(f"入仓方式无效: {mode}")
    semantics, write_strategy, missing_strategy = _MODE_POLICIES[mode]
    return IngestionPolicy(
        mode=mode,
        sync_semantics=semantics,
        write_strategy=write_strategy,
        missing_row_strategy=missing_strategy,
        business_key_fields=tuple(str(item).strip() for item in (business_key_fields or []) if str(item).strip()),
    )


def resolve_policy(
    *,
    ingestion_mode: str | None,
    sync_semantics: str | None,
    write_strategy: str | None,
    missing_row_strategy: str | None,
    business_key_fields: list[str] | None,
    is_period: bool = False,
    default_mode: str | None = None,
) -> IngestionPolicy:
    keys = [str(item).strip() for item in (business_key_fields or []) if str(item).strip()]
    if ingestion_mode:
        if ingestion_mode == "period_full_snapshot" and not is_period:
            raise ValueError("按期间覆盖仅适用于期间资产")
        return policy_for_mode(ingestion_mode, keys)

    explicit = (sync_semantics, write_strategy, missing_row_strategy)
    if any(value is not None for value in explicit):
        if any(value not in SYNC_SEMANTICS for value in (sync_semantics,)) or any(
            value not in WRITE_STRATEGIES for value in (write_strategy,)
        ) or any(value not in MISSING_ROW_STRATEGIES for value in (missing_row_strategy,)):
            raise ValueError("入仓更新策略无效")
        if None in explicit:
            raise ValueError("入仓更新策略必须同时提供语义、写入策略和缺失行策略")
        if write_strategy == "incremental_upsert" and not keys:
            raise ValueError("增量更新策略必须配置业务主键")
        if sync_semantics == "incremental_append" and write_strategy == "append":
            mode = "append"
        elif sync_semantics == "full_snapshot" and missing_row_strategy == "hard_delete" and is_period:
            mode = "period_full_snapshot"
        elif sync_semantics == "full_snapshot":
            mode = "current_snapshot"
        else:
            mode = "incremental_upsert"
        return IngestionPolicy(
            mode=mode,
            sync_semantics=sync_semantics,
            write_strategy=write_strategy,
            missing_row_strategy=missing_row_strategy,
            business_key_fields=tuple(keys),
        )

    if default_mode is None:
        default_mode = "period_full_snapshot" if is_period else "current_snapshot"
    return policy_for_mode(default_mode, keys)


def policy_tuple(policy: IngestionPolicy) -> tuple[str, str, str, list[str]]:
    return (
        policy.sync_semantics,
        policy.write_strategy,
        policy.missing_row_strategy,
        list(policy.business_key_fields),
    )
