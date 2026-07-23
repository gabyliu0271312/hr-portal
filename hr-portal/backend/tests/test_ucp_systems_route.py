from pathlib import Path


def test_system_overview_keeps_aggregate_dto_unserialized():
    source = Path("backend/app/ucp/routers/systems.py").read_text(encoding="utf-8")
    overview_block = source.split('async def route_systems_overview', 1)[1].split('async def route_get_system', 1)[0]

    assert 'return {"total": len(items), "items": items}' in overview_block
    assert "serialize_resource(item)" not in overview_block
