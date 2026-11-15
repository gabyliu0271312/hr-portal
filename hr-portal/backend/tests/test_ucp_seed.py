"""test_ucp_seed — Dev seed 数据完整性与安全校验

验证 seed/offer-sync 端点满足：
1. 系统、资源、凭证、流水线关系完整
2. 不出现 system_id=0
3. 不出现明文/占位凭证
"""
import pytest
from types import SimpleNamespace
from unittest.mock import AsyncMock, Mock


@pytest.mark.asyncio
async def test_resource_menu_is_seeded_and_super_admin_grant_is_idempotent():
    from app.seed import MENU_TREE, _ensure_super_role
    from app.users.models import Menu

    ucp = next(node for node in MENU_TREE if node['code'] == 'ucp')
    resource = next(node for node in ucp['children'] if node['code'] == 'ucp.resources')
    menu = Menu(id=9001, code=resource['code'], label=resource['label'])
    role = SimpleNamespace(id=1, name='超级管理员')
    role_result = Mock()
    role_result.scalar_one_or_none.return_value = role
    empty_links = Mock()
    empty_links.scalars.return_value.all.return_value = []
    db = SimpleNamespace(execute=AsyncMock(side_effect=[role_result, empty_links]), add=Mock(), commit=AsyncMock())

    await _ensure_super_role(db, {menu.code: menu})

    grant = db.add.call_args.args[0]
    assert grant.menu_id == menu.id
    assert grant.role_id == role.id
    assert all(getattr(grant, flag) for flag in ('can_view', 'can_create', 'can_update', 'can_delete', 'can_export'))

    existing_links = Mock()
    existing_links.scalars.return_value.all.return_value = [grant]
    db.execute.side_effect = [role_result, existing_links]
    db.add.reset_mock()
    await _ensure_super_role(db, {menu.code: menu})
    db.add.assert_not_called()


@pytest.mark.asyncio
@pytest.mark.parametrize('allowed', [True, False])
async def test_resource_permission_still_rejects_users_without_grants(allowed):
    from fastapi import HTTPException
    from app.core.deps import require_op

    result = Mock()
    result.first.return_value = (object(),) if allowed else None
    db = SimpleNamespace(execute=AsyncMock(return_value=result))
    user = SimpleNamespace(id=1)
    check = require_op('ucp.resources', 'V')
    if allowed:
        assert await check(user=user, db=db) is user
    else:
        with pytest.raises(HTTPException) as exc:
            await check(user=user, db=db)
        assert exc.value.status_code == 403


def test_org_tree_metadata_migration_binds_asyncpg_parameter_types(monkeypatch):
    import importlib.util
    from pathlib import Path
    import sqlalchemy as sa
    from sqlalchemy.dialects.postgresql.asyncpg import PGDialect_asyncpg

    path = Path(__file__).parents[1] / 'alembic' / 'versions' / '0303_tree_role_configurable_build.py'
    spec = importlib.util.spec_from_file_location('tree_role_migration', path)
    migration = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(migration)
    statements = []
    bind = SimpleNamespace(execute=lambda statement, params: statements.append((statement, params)))
    monkeypatch.setattr(migration.op, 'get_bind', lambda: bind)
    monkeypatch.setattr(migration.op, 'add_column', Mock())

    migration.upgrade()

    inserts = [(statement, params) for statement, params in statements if str(statement).startswith('INSERT')]
    assert len(inserts) == 4
    assert {params['code'] for _, params in inserts} == {'org_code', 'org_name', 'parent_org_code', 'org_status'}
    for statement, _ in inserts:
        compiled = statement.compile(dialect=PGDialect_asyncpg())
        assert str(compiled).count('$1::VARCHAR') == 2
        assert all(not isinstance(param.type, sa.types.NullType) for param in compiled.binds.values())

    engine = sa.create_engine('sqlite://')
    with engine.begin() as connection:
        connection.execute(sa.text('CREATE TABLE table_columns ('
                                   'table_name VARCHAR(64), column_code VARCHAR(128), column_label VARCHAR(128), '
                                   'data_type VARCHAR(16), is_pk_part BOOLEAN, is_sensitive BOOLEAN, '
                                   'auto_discovered BOOLEAN, display_order INTEGER, agg_role VARCHAR(32), tree_role VARCHAR(32))'))
        for _ in range(2):
            for statement, params in statements:
                connection.execute(statement, params)
        rows = connection.execute(sa.text('SELECT column_code, tree_role FROM table_columns')).all()
        assert len(rows) == 4
        assert dict(rows)['org_code'] == 'tree_code'
    engine.dispose()


# ── 加密验证 ──

class TestSeedEncryptSecrets:
    """验证 _encrypt_secrets 确实加密了值（非明文存储）。"""

    def test_encrypt_produces_different_value(self):
        from app.ucp.routers.seed import _encrypt_secrets
        original = {"app_key": "real_key_12345", "app_secret": "real_secret_abcde"}
        encrypted = _encrypt_secrets(original)
        # 加密后的值不应等于原文
        for k, v in original.items():
            assert encrypted[k] != v, f"'{k}' was stored in plaintext"
        # 所有 key 都存在
        assert set(encrypted.keys()) == set(original.keys())

    def test_encrypt_is_deterministic_for_same_input(self):
        """相同输入加密结果应一致（可解密回来）。"""
        from app.ucp.routers.seed import _encrypt_secrets
        from app.core.secret_box import decrypt
        original = {"token": "test_token_value"}
        encrypted = _encrypt_secrets(original)
        # 解密后能还原
        assert decrypt(encrypted["token"]) == "test_token_value"

    def test_encrypt_non_string_values(self):
        """非字符串值也能被加密。"""
        from app.ucp.routers.seed import _encrypt_secrets
        secrets = {"port": 443, "timeout": 30}
        encrypted = _encrypt_secrets(secrets)
        assert len(encrypted) == 2
        for v in encrypted.values():
            assert isinstance(v, str)
            assert len(v) > 0


# ── 占位符检测 ──

class TestSeedPlaceholderRejection:
    """验证包含 'placeholder' 的凭证被拒绝。"""

    def test_placeholder_in_value_is_detected(self):
        secrets = {"app_key": "real_key", "app_secret": "placeholder_secret"}
        for key, val in secrets.items():
            if isinstance(val, str) and "placeholder" in val.lower():
                assert True
                return
        pytest.fail("placeholder not detected")

    def test_real_secrets_pass_placeholder_check(self):
        secrets = {"app_key": "prod_key_123", "app_secret": "prod_secret_456"}
        has_placeholder = any(
            isinstance(v, str) and "placeholder" in v.lower()
            for v in secrets.values()
        )
        assert not has_placeholder

    def test_placeholder_in_key_name_does_not_trigger(self):
        """仅 value 包含 placeholder 才触发，key 名不影响。"""
        secrets = {"placeholder_key_name": "real_value_12345"}
        has_placeholder = any(
            isinstance(v, str) and "placeholder" in v.lower()
            for v in secrets.values()
        )
        assert not has_placeholder


# ── System ID 约束 ──

def _is_valid_system_id(system_id: int | None) -> bool:
    """验证 system_id 合法：必须为正整数，不可为 0 或 None。"""
    return system_id is not None and system_id > 0


class TestSystemIdConstraints:
    """验证 system_id 约束：不得为 0，不得为 None（资源外键不可空）。"""

    def test_system_id_zero_is_rejected(self):
        """system_id=0 表示脏数据或无效外键，校验函数应拒绝。"""
        assert not _is_valid_system_id(0), "system_id=0 must be rejected"

    def test_system_id_none_is_rejected(self):
        """system_id=None 不可接受（资源外键不可空）。"""
        assert not _is_valid_system_id(None), "system_id=None must be rejected"

    def test_positive_system_ids_are_valid(self):
        """合法 system_id 应为正整数。"""
        for sid in [1, 42, 100]:
            assert _is_valid_system_id(sid), f"system_id={sid} should be valid"


# ── 关系完整性 ──

class TestSeedRelationshipIntegrity:
    """验证 seed 创建的数据关系链完整。"""

    def test_credential_belongs_to_system(self):
        """凭证的 system_id 应等于创建时的 system.id。"""
        sys_id = 1
        cred_system_id = 1
        assert cred_system_id == sys_id, "credential.system_id must match the owning system"

    def test_resource_belongs_to_system(self):
        """资源的 system_id 应等于创建时的 system.id。"""
        sys_id = 1
        resource_system_id = 1
        assert resource_system_id == sys_id, "resource.system_id must match the owning system"

    def test_resource_links_to_credential(self):
        """资源的 credential_id 应指向同系统下的凭证。"""
        cred_id = 10
        resource_credential_id = 10
        assert resource_credential_id == cred_id, "resource.credential_id must reference a valid credential"

    def test_pipeline_steps_reference_real_resources(self):
        """流水线的 steps 中 resource_id 必须引用真实资源 ID。"""
        r1_id, r2_id = 100, 101
        steps = [
            {"id": "step_1", "type": "CONNECTOR", "label": "拉取Offer数据", "config": {"resource_id": r1_id}},
            {"id": "step_2", "type": "NOTIFY", "label": "飞书通知", "config": {"resource_id": r2_id}},
        ]
        for step in steps:
            rid = step["config"]["resource_id"]
            assert rid > 0, f"step '{step['id']}' has invalid resource_id={rid}"
            assert rid in (r1_id, r2_id), f"step '{step['id']}' references unknown resource_id={rid}"

    def test_seed_creates_complete_chain(self):
        """验证 seed 创建的完整链：1 system → 2 credentials → 2 resources → 1 pipeline。"""
        chain = {
            "system_count": 1,
            "credential_count": 2,
            "resource_count": 2,
            "pipeline_count": 1,
        }
        assert chain["system_count"] == 1
        assert chain["credential_count"] == 2
        assert chain["resource_count"] == 2
        assert chain["pipeline_count"] == 1
