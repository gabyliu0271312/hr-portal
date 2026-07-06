# -*- coding: utf-8 -*-
"""执行监控与告警 (Q06) 测试

覆盖: 运行聚合 Schema、告警规则 Schema、run_type 枚举
"""
import pytest
from pydantic import ValidationError

from app.warehouse.schemas import (
    WarehouseRunSummaryOut,
    WarehouseAlertRuleIn,
    WarehouseAlertRuleOut,
)


# ==================== WarehouseRunSummaryOut ====================

def test_run_summary_basic():
    r = WarehouseRunSummaryOut(
        run_type="sync",
        run_id=1,
        status="success",
        target_label="同步 #5",
    )
    assert r.run_type == "sync"
    assert r.run_id == 1
    assert r.status == "success"
    assert r.started_at is None
    assert r.duration is None
    assert r.error_summary is None
    assert r.source_link is None


def test_run_summary_with_error():
    r = WarehouseRunSummaryOut(
        run_type="quality",
        run_id=2,
        status="fail",
        target_label="质量检查 #3",
        error_summary="连接超时",
    )
    assert r.run_type == "quality"
    assert r.status == "fail"
    assert r.error_summary == "连接超时"


def test_run_summary_missing_fields():
    with pytest.raises(ValidationError):
        WarehouseRunSummaryOut(run_type="sync")


# ==================== WarehouseAlertRuleIn ====================

def test_alert_rule_in_valid():
    a = WarehouseAlertRuleIn(
        alert_type="quality_fail",
        target_code="table.emp",
        severity="error",
    )
    assert a.alert_type == "quality_fail"
    assert a.target_code == "table.emp"
    assert a.severity == "error"
    assert a.enabled is True


def test_alert_rule_in_defaults():
    a = WarehouseAlertRuleIn(alert_type="sync_fail", target_code="ds_1")
    assert a.severity == "warn"
    assert a.enabled is True


def test_alert_rule_in_all_types():
    """alert_type 纯 str，无 Pydantic 枚举校验"""
    for at in ("quality_fail", "sync_fail", "build_fail", "metric_fail"):
        a = WarehouseAlertRuleIn(alert_type=at, target_code="x")
        assert a.alert_type == at


def test_alert_rule_in_missing_target():
    with pytest.raises(ValidationError):
        WarehouseAlertRuleIn(alert_type="sync_fail")


# ==================== WarehouseAlertRuleOut ====================

def test_alert_rule_out_from_orm():
    class FakeAlert:
        id = 1
        alert_type = "sync_fail"
        target_code = "ds_1"
        enabled = True
        severity = "warn"
        notify_channels = None
        last_triggered_at = None
        created_at = None
        updated_at = None
    a = WarehouseAlertRuleOut.model_validate(FakeAlert())
    assert a.id == 1
    assert a.alert_type == "sync_fail"
    assert a.enabled is True
    assert a.notify_channels is None


# ==================== run_type coverage ====================

def test_run_summary_all_types():
    """覆盖 5 种 run_type"""
    for rt in ("sync", "quality", "dataset_build", "metric_run", "snapshot"):
        r = WarehouseRunSummaryOut(
            run_type=rt,
            run_id=1,
            status="success",
            target_label=f"{rt} test",
        )
        assert r.run_type == rt


# ==================== R3: alert_type / severity 400 校验 ====================

from fastapi import HTTPException
from app.warehouse.router import _validate_alert_type, _validate_alert_severity


def test_validate_alert_type_valid():
    for at in ("quality_fail", "sync_fail", "build_fail", "metric_fail"):
        _validate_alert_type(at)  # 不抛异常


def test_validate_alert_type_invalid():
    with pytest.raises(HTTPException) as exc:
        _validate_alert_type("invalid")
    assert exc.value.status_code == 400
    assert "invalid" in exc.value.detail


def test_validate_alert_severity_valid():
    for s in ("info", "warn", "error"):
        _validate_alert_severity(s)


def test_validate_alert_severity_invalid():
    with pytest.raises(HTTPException) as exc:
        _validate_alert_severity("critical")
    assert exc.value.status_code == 400
    assert "critical" in exc.value.detail
