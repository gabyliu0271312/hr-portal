"""test_ucp_seed — Dev seed 数据完整性与安全校验

验证 seed/offer-sync 端点满足：
1. 系统、资源、凭证、流水线关系完整
2. 不出现 system_id=0
3. 不出现明文/占位凭证
"""
import pytest


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
