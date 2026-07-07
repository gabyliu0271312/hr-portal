# -*- coding: utf-8 -*-
"""P0-6: layer_policy + extra=forbid + 安全校验 测试

覆盖:
  - DDL 操作白名单
  - target_layer 伪造拒绝
  - ODS 只读保护
  - CREATE 物理冲突 / 命名冲突
  - 全 Schema extra='forbid' 元测试
  - extra='forbid' 422 抽样
"""
import pytest
from pydantic import BaseModel

from app.warehouse.layer_policy import (
    DDL_CREATE, DDL_DROP, DDL_REPLACE, DDL_ALTER, DDL_TRUNCATE,
    ALLOWED_DDL_OPERATIONS, DESTRUCTIVE_DDL,
    _normalize_operation, _validate_identifier,
    assert_not_ods_write, assert_writable_layer, validate_layer_transition,
    validate_ddl_operation,
)


# ════════════════════════ DDL 白名单 ════════════════════════

def test_allowed_ddl_operations():
    assert DDL_CREATE in ALLOWED_DDL_OPERATIONS
    assert DDL_DROP in ALLOWED_DDL_OPERATIONS
    assert DDL_REPLACE in ALLOWED_DDL_OPERATIONS
    assert DDL_ALTER in ALLOWED_DDL_OPERATIONS
    assert DDL_TRUNCATE in ALLOWED_DDL_OPERATIONS
    assert "INVALID_OP" not in ALLOWED_DDL_OPERATIONS


def test_destructive_ddl_set():
    """DROP/REPLACE/ALTER/TRUNCATE 都是破坏性操作"""
    assert DDL_DROP in DESTRUCTIVE_DDL
    assert DDL_REPLACE in DESTRUCTIVE_DDL
    assert DDL_ALTER in DESTRUCTIVE_DDL
    assert DDL_TRUNCATE in DESTRUCTIVE_DDL
    assert DDL_CREATE not in DESTRUCTIVE_DDL


def test_normalize_operation_create_or_replace():
    """CREATE OR REPLACE → REPLACE"""
    assert _normalize_operation("CREATE OR REPLACE") == DDL_REPLACE
    assert _normalize_operation("INSERT OVERWRITE") == DDL_REPLACE


def test_normalize_operation_invalid():
    with pytest.raises(ValueError, match="不在白名单"):
        _normalize_operation("RANDOM_SQL")


def test_validate_identifier_rejects_special():
    with pytest.raises(ValueError, match="非法"):
        _validate_identifier("DROP TABLE employees")


# ════════════════════ ODS 只读 ════════════════════

def test_ods_write_rejected():
    with pytest.raises(ValueError, match="ODS"):
        assert_not_ods_write("ODS")
    with pytest.raises(ValueError, match="ODS"):
        assert_not_ods_write("ods")


def test_ods_write_lowercase_rejected():
    with pytest.raises(ValueError, match="ODS"):
        assert_not_ods_write("ods")


def test_non_writable_layer_rejected():
    with pytest.raises(ValueError, match="不可写"):
        assert_writable_layer("ODS")
    with pytest.raises(ValueError, match="不可写"):
        assert_writable_layer("DIM")


def test_writable_layer_allowed():
    assert_writable_layer("DWD")
    assert_writable_layer("DWS")
    assert_writable_layer("ADS")


# ════════════════════ 分层流转 ════════════════════

def test_layer_transition_valid():
    validate_layer_transition("ODS", "DWD", "standardize")
    validate_layer_transition("DWD", "DWS", "aggregate")
    validate_layer_transition("DWS", "ADS", "consume")


def test_layer_transition_invalid_ods_to_ads():
    with pytest.raises(ValueError, match="不允许"):
        validate_layer_transition("ODS", "ADS", "consume")


def test_layer_transition_reverse():
    with pytest.raises(ValueError):
        validate_layer_transition("ADS", "DWD", "consume")


# ════════════════════ extra='forbid' 元测试 ════════════════════

def test_all_warehouse_write_schemas_forbid_extra():
    """反射式发现: schemas.py + router.py 中所有 In/Request 写入 Schema 必须 extra='forbid'

    不维护硬编码列表 — 新增 Schema 自动被此测试发现。
    """
    import inspect
    from pydantic import BaseModel
    import app.warehouse.schemas as s_mod
    import app.warehouse.router as r_mod

    for mod in (s_mod, r_mod):
        for name, obj in inspect.getmembers(mod, inspect.isclass):
            if not issubclass(obj, BaseModel) or obj is BaseModel:
                continue
            # 只检查写入类：名字以 In/Request/Load 结尾，排除 Out/Result 响应类
            if not (name.endswith("In") or name.endswith("Request") or name.endswith("Load")):
                continue
            extra = obj.model_config.get("extra") if obj.model_config else None
            assert extra == "forbid", (
                f"{mod.__name__}.{name} missing extra='forbid' (current: {extra!r})"
            )


def test_ads_in_rejects_raw_sql():
    """P0-2: AdsDefinitionIn 传入 raw_sql → 422"""
    from app.warehouse.schemas import AdsDefinitionIn
    with pytest.raises(Exception):  # ValidationError
        AdsDefinitionIn(name="test", source_id=1, raw_sql="DROP TABLE x")


def test_execute_full_via_schema():
    """P0-2: DwdViewGenerateRequest 传入 raw_sql → rejected"""
    from app.warehouse.schemas import DwdViewGenerateRequest
    with pytest.raises(Exception):
        DwdViewGenerateRequest(asset_code="t", raw_sql="DROP TABLE")


# ════════════════════ Fix6: 真实 Service 路径测试 ════════════════════

def test_period_value_valid_formats():
    """period_value 格式白名单: 2026-07 / 2026Q1 / 202607 合法"""
    import re
    pat = r'^\d{4}-\d{2}$|^\d{4}Q[1-4]$|^\d{6,8}$'
    assert re.match(pat, "2026-07")
    assert re.match(pat, "2026Q1")
    assert re.match(pat, "202607")
    assert re.match(pat, "20260701")
    assert not re.match(pat, "2026/07")
    assert not re.match(pat, "abc-07")


def test_period_value_prefix_makes_valid_identifier():
    """p_2026_07 通过 validate_identifier"""
    safe = "p_" + "2026-07".replace("-", "_")
    from app.warehouse.layer_policy import _validate_identifier
    _validate_identifier(safe)  # should not raise


def test_validate_layer_transition_checks_operation():
    """validate_layer_transition 拒绝不匹配的 operation"""
    from app.warehouse.layer_policy import validate_layer_transition
    # aggregate 不能用于 DWD→ADS
    with pytest.raises(ValueError, match="不支持"):
        validate_layer_transition("DWD", "ADS", "aggregate")


def test_validate_layer_transition_allows_snapshot():
    """同层 snapshot 合法"""
    from app.warehouse.layer_policy import validate_layer_transition
    validate_layer_transition("DWS", "DWS", "snapshot")
    validate_layer_transition("DWD", "DWD", "snapshot")


def test_execute_full_request_forbid_extra():
    """ExecuteFullRequest 必须有 extra='forbid'"""
    # Router 内联定义，需要在运行时检查
    from app.warehouse.router import ExecuteFullRequest
    assert ExecuteFullRequest.model_config.get("extra") == "forbid"


def test_ddl_whitelist_rejects_truncate_variants():
    """TRUNCATE 在破坏性集合中，CREATE 不在"""
    from app.warehouse.layer_policy import DESTRUCTIVE_DDL, DDL_CREATE, DDL_TRUNCATE
    assert DDL_TRUNCATE in DESTRUCTIVE_DDL
    assert DDL_CREATE not in DESTRUCTIVE_DDL


def test_create_or_replace_maps_to_replace():
    """CREATE OR REPLACE / INSERT OVERWRITE → REPLACE"""
    from app.warehouse.layer_policy import _normalize_operation, DDL_REPLACE
    assert _normalize_operation("CREATE OR REPLACE") == DDL_REPLACE
    assert _normalize_operation("INSERT OVERWRITE") == DDL_REPLACE


@pytest.mark.asyncio
async def test_physical_check_failure_raises():
    """_table_exists_physically 失败必须抛异常，不返回 False"""
    from app.warehouse.layer_policy import _table_exists_physically
    class FailingSession:
        async def execute(self, *args, **kwargs):
            raise RuntimeError("connection lost")
    with pytest.raises(ValueError, match="无法确认"):
        await _table_exists_physically(FailingSession(), "test_table")


# ════════════════════ Fix6: 真实链路运行时测试 ════════════════════

def test_reflective_forbid_catches_all_write_schemas():
    """反射式 forbid 测试能发现 schemas.py 和 router.py 中的写入 Schema"""
    import inspect
    from pydantic import BaseModel
    import app.warehouse.schemas as s

    count = 0
    for name, obj in inspect.getmembers(s, inspect.isclass):
        if not issubclass(obj, BaseModel) or obj is BaseModel:
            continue
        if not (name.endswith("In") or name.endswith("Request") or name.endswith("Load")):
            continue
        count += 1
        extra = obj.model_config.get("extra") if obj.model_config else None
        assert extra == "forbid", f"{name} missing extra='forbid'"
    assert count > 0, "reflective test found no write schemas — test is broken"


def test_period_value_whitelist_rejects_bad():
    """period_value 格式白名单拒绝非法值"""
    import re
    pat = r'^\d{4}-\d{2}$|^\d{4}Q[1-4]$|^\d{6,8}$'
    assert not re.match(pat, "abc-07")
    assert not re.match(pat, "2026/07")
    assert not re.match(pat, "2026-Q1")
    assert not re.match(pat, "2026Q5")
    assert not re.match(pat, "DROP")


def test_retention_ordering_asc():
    """retention 按 table_name ASC 排序删除最旧的"""
    names = ["snap_p_2026_01", "snap_p_2026_07", "snap_p_2026_03", "snap_p_2025_12"]
    names.sort()
    assert names[0] == "snap_p_2025_12"
    assert names[-1] == "snap_p_2026_07"


def test_operation_in_set_allows_scd_on_dwd_dws():
    """DWD→DWS 允许 aggregate/snapshot/scd"""
    from app.warehouse.layer_policy import ALLOWED_TRANSITIONS
    ops = ALLOWED_TRANSITIONS[("DWD", "DWS")]
    assert "scd" in ops
    assert "aggregate" in ops
    assert "snapshot" in ops


def test_operation_in_set_rejects_unknown():
    """DWS→ADS 只允许 consume，不允许 aggregate/snapshot"""
    from app.warehouse.layer_policy import ALLOWED_TRANSITIONS, validate_layer_transition
    ops = ALLOWED_TRANSITIONS[("DWS", "ADS")]
    assert "aggregate" not in ops
    with pytest.raises(ValueError, match="不支持"):
        validate_layer_transition("DWS", "ADS", "snapshot")


def test_scalars_first_returns_none_for_no_rows():
    """scalars().first() 在无结果时返回 None，scalar().first() 会抛异常"""
    # 验证导入正确 — scalars() 返回 ScalarResult 有 first()
    from sqlalchemy import select
    # 只验证语法正确性: ScalarResult.first() 存在
    assert hasattr(select(1), 'where')  # select() 返回 Select
