import pytest

from app.datasources.policy import resolve_policy


def test_policy_modes_map_to_shared_contract():
    assert resolve_policy(
        ingestion_mode="current_snapshot",
        sync_semantics=None,
        write_strategy=None,
        missing_row_strategy=None,
        business_key_fields=["id"],
    ).sync_semantics == "full_snapshot"
    assert resolve_policy(
        ingestion_mode="incremental_upsert",
        sync_semantics=None,
        write_strategy=None,
        missing_row_strategy=None,
        business_key_fields=["id"],
    ).missing_row_strategy == "keep_history"
    assert resolve_policy(
        ingestion_mode="append",
        sync_semantics=None,
        write_strategy=None,
        missing_row_strategy=None,
        business_key_fields=[],
    ).write_strategy == "append"
    assert resolve_policy(
        ingestion_mode="period_full_snapshot",
        sync_semantics=None,
        write_strategy=None,
        missing_row_strategy=None,
        business_key_fields=["month", "id"],
        is_period=True,
    ).missing_row_strategy == "hard_delete"


def test_policy_defaults_to_current_snapshot_for_legacy_non_period_sources():
    policy = resolve_policy(
        ingestion_mode=None,
        sync_semantics=None,
        write_strategy=None,
        missing_row_strategy=None,
        business_key_fields=["id"],
        is_period=False,
    )
    assert policy.mode == "current_snapshot"
    assert policy.sync_semantics == "full_snapshot"


def test_period_mode_is_rejected_for_non_period_sources():
    with pytest.raises(ValueError, match="期间资产"):
        resolve_policy(
            ingestion_mode="period_full_snapshot",
            sync_semantics=None,
            write_strategy=None,
            missing_row_strategy=None,
            business_key_fields=["id"],
            is_period=False,
        )
