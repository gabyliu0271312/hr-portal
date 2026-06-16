import pytest

from scripts import migrate_allocation_schemes, migrate_codes, migrate_rename_normalize


@pytest.mark.asyncio
async def test_migrate_codes_is_disabled():
    with pytest.raises(SystemExit) as exc_info:
        await migrate_codes.main()

    assert "已禁用" in str(exc_info.value)
    assert "旧 JSON 动态列迁移不允许执行" in str(exc_info.value)

    with pytest.raises(SystemExit) as flagged_exc:
        await migrate_codes.main()
    assert "已禁用" in str(flagged_exc.value)


@pytest.mark.asyncio
async def test_migrate_rename_normalize_is_disabled():
    with pytest.raises(SystemExit) as exc_info:
        await migrate_rename_normalize.main()

    assert "已禁用" in str(exc_info.value)
    assert "旧 JSON 动态列迁移不允许执行" in str(exc_info.value)

    with pytest.raises(SystemExit) as flagged_exc:
        await migrate_rename_normalize.main()
    assert "已禁用" in str(flagged_exc.value)


@pytest.mark.asyncio
async def test_migrate_allocation_schemes_is_disabled():
    with pytest.raises(SystemExit) as exc_info:
        await migrate_allocation_schemes.main()

    assert "已禁用" in str(exc_info.value)
    assert "旧字段编码迁移不允许执行" in str(exc_info.value)

    with pytest.raises(SystemExit) as flagged_exc:
        await migrate_allocation_schemes.main()
    assert "已禁用" in str(flagged_exc.value)
