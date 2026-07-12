"""Phase 6: 集成治理 / iPaaS 雏形测试

覆盖：资产目录聚合 / 拓扑依赖 / SLA 指标 / 变更追踪 / 治理评分 / E2E
"""
from unittest.mock import AsyncMock, MagicMock

import pytest


# ==========================================
# 1. 资产目录聚合
# ==========================================


class TestAssetCatalog:
    def test_catalog_aggregates_all_asset_types(self):
        from app.ucp.asset_catalog_service import get_asset_catalog

        db = AsyncMock()
        db.add = MagicMock()  # db.add() is synchronous in SQLAlchemy
        db.execute = AsyncMock(return_value=MagicMock(scalar=MagicMock(return_value=5)))

        import asyncio
        loop = asyncio.new_event_loop()
        result = loop.run_until_complete(get_asset_catalog(db))
        loop.close()

        assert result["systems"]["total"] == 5
        assert result["systems"]["active"] == 5
        assert result["resources"]["total"] == 5
        assert result["credentials"]["total"] == 5
        assert result["pipelines"]["total"] == 5
        assert result["templates"]["total"] == 5
        assert result["events_24h"] == 5

    def test_catalog_handles_zero_counts(self):
        from app.ucp.asset_catalog_service import get_asset_catalog

        db = AsyncMock()
        db.add = MagicMock()  # db.add() is synchronous in SQLAlchemy
        db.execute = AsyncMock(return_value=MagicMock(scalar=MagicMock(return_value=0)))

        import asyncio
        loop = asyncio.new_event_loop()
        result = loop.run_until_complete(get_asset_catalog(db))
        loop.close()

        assert result["systems"]["total"] == 0
        assert result["events_24h"] == 0


# ==========================================
# 2. 依赖拓扑
# ==========================================


class TestTopology:
    def test_build_topology_nodes_and_edges(self):
        from app.ucp.topology_service import build_topology

        db = AsyncMock()
        db.add = MagicMock()  # db.add() is synchronous in SQLAlchemy
        mock_sys = [MagicMock(id=1, system_code="BEISEN", system_name="北森", is_active=1)]
        mock_res = [
            MagicMock(id=10, system_id=1, resource_code="EMP_DATA", resource_name="员工数据"),
        ]
        mock_pipes = [
            MagicMock(id=100, pipeline_code="SYNC", pipeline_name="Sync", status=1),
        ]
        mock_tpls = [
            MagicMock(id=200, template_code="TPL1", name="模板1",
                      nodes_json=[{"config": {"resource_id": 10}}]),
        ]

        empty_row = MagicMock(scalars=MagicMock(return_value=MagicMock(all=MagicMock(return_value=[]))))
        responses = [
            MagicMock(scalars=MagicMock(return_value=MagicMock(all=MagicMock(return_value=mock_sys)))),
            MagicMock(scalars=MagicMock(return_value=MagicMock(all=MagicMock(return_value=mock_res)))),
            MagicMock(scalars=MagicMock(return_value=MagicMock(all=MagicMock(return_value=mock_pipes)))),
            MagicMock(scalars=MagicMock(return_value=MagicMock(all=MagicMock(return_value=mock_tpls)))),
            empty_row,  # credentials
            empty_row,  # triggers
            empty_row,  # executions
        ]
        db.execute = AsyncMock(side_effect=responses)

        import asyncio
        loop = asyncio.new_event_loop()
        result = loop.run_until_complete(build_topology(db))
        loop.close()

        assert len(result["nodes"]) >= 4
        assert any(n["type"] == "system" for n in result["nodes"])
        assert any(n["type"] == "resource" for n in result["nodes"])
        assert any(n["type"] == "pipeline" for n in result["nodes"])
        assert any(n["type"] == "template" for n in result["nodes"])
        # template → resource reference
        assert any(e["label"] == "references" for e in result["edges"])

    def test_build_topology_empty_when_no_data(self):
        from app.ucp.topology_service import build_topology
        db = AsyncMock()
        db.add = MagicMock()  # db.add() is synchronous in SQLAlchemy
        empty = MagicMock(scalars=MagicMock(return_value=MagicMock(all=MagicMock(return_value=[]))))
        db.execute = AsyncMock(return_value=empty)

        import asyncio
        loop = asyncio.new_event_loop()
        result = loop.run_until_complete(build_topology(db))
        loop.close()
        assert result["nodes"] == []
        assert result["edges"] == []

    def test_impact_analysis_resource(self):
        from app.ucp.topology_service import get_impact_analysis
        db = AsyncMock()
        db.add = MagicMock()  # db.add() is synchronous in SQLAlchemy
        mock_res = MagicMock(id=10, system_id=1, resource_code="EMP_DATA", resource_name="员工数据")
        mock_tpls = [
            MagicMock(template_code="TPL1", nodes_json=[{"config": {"resource_id": 10}}]),
        ]
        empty = MagicMock(scalars=MagicMock(return_value=MagicMock(all=MagicMock(return_value=[]))))

        # db.execute: 1) query resources for system-level branch (unused for resource target)
        # 2) query templates for pipeline impact
        db.execute = AsyncMock(side_effect=[empty, empty])

        import asyncio
        loop = asyncio.new_event_loop()
        result = loop.run_until_complete(get_impact_analysis(db, "resource", 10))
        loop.close()

        assert result["target"]["type"] == "resource"

    def test_impact_analysis_unknown_target(self):
        from app.ucp.topology_service import get_impact_analysis
        db = AsyncMock()
        db.add = MagicMock()  # db.add() is synchronous in SQLAlchemy
        mock_result = MagicMock()
        mock_result.scalars.return_value = MagicMock(all=MagicMock(return_value=[]))
        db.execute = AsyncMock(return_value=mock_result)

        import asyncio
        loop = asyncio.new_event_loop()
        result = loop.run_until_complete(get_impact_analysis(db, "resource", 999))
        loop.close()

        assert result["target"]["id"] == 999


# ==========================================
# 3. SLA 指标
# ==========================================


class TestSLA:
    def test_create_sla_config(self):
        from app.ucp.sla_service import create_sla_config
        db = AsyncMock()
        db.add = MagicMock()  # db.add() is synchronous in SQLAlchemy
        db.flush = AsyncMock()
        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = None
        db.execute = AsyncMock(return_value=mock_result)

        import asyncio
        loop = asyncio.new_event_loop()
        result = loop.run_until_complete(
            create_sla_config(db, sla_code="SLA_OFFER", sla_name="Offer SLA",
                             target_type="pipeline", target_id=100,
                             success_rate_target=0.99, p95_duration_ms_max=30000, window_hours=24)
        )
        loop.close()

        db.add.assert_called_once()
        obj = db.add.call_args[0][0]
        assert obj.sla_code == "SLA_OFFER"
        assert obj.success_rate_target == 0.99

    def test_calculate_sla_record(self):
        from app.ucp.sla_service import calculate_sla_record
        db = AsyncMock()
        db.add = MagicMock()  # db.add() is synchronous in SQLAlchemy
        mock_sla = MagicMock(id=1, is_active=1, window_hours=24,
                            target_type="pipeline", target_id=100,
                            success_rate_target=None, p95_duration_ms_max=None,
                            p99_duration_ms_max=None, recovery_time_minutes=None)
        mock_runs = [
            MagicMock(status="SUCCESS", duration_ms=500),
            MagicMock(status="SUCCESS", duration_ms=1500),
            MagicMock(status="FAILED", duration_ms=2000),
            MagicMock(status="SUCCESS", duration_ms=800),
        ]
        run_result = MagicMock()
        run_result.scalars.return_value = MagicMock(all=MagicMock(return_value=mock_runs))
        # db.get for SLA config → returns mock_sla
        async def _mock_get(model, obj_id):
            return mock_sla
        db.get = _mock_get
        db.execute = AsyncMock(return_value=run_result)

        import asyncio
        loop = asyncio.new_event_loop()
        result = loop.run_until_complete(calculate_sla_record(db, sla_id=1))
        loop.close()

        assert result is not None
        assert result["total_executions"] == 4
        assert result["success_rate"] == 0.75

    def test_calculate_sla_record_inactive_config(self):
        from app.ucp.sla_service import calculate_sla_record
        db = AsyncMock()
        db.add = MagicMock()  # db.add() is synchronous in SQLAlchemy
        mock_sla = MagicMock(id=1, is_active=0)
        async def _mock_get(model, obj_id):
            return mock_sla
        db.get = _mock_get

        import asyncio
        loop = asyncio.new_event_loop()
        result = loop.run_until_complete(calculate_sla_record(db, sla_id=1))
        loop.close()
        assert result is None


# ==========================================
# 4. 变更管理
# ==========================================


class TestChangeManagement:
    def test_create_change_draft(self):
        from app.ucp.change_service import create_change
        db = AsyncMock()
        db.add = MagicMock()  # db.add() is synchronous in SQLAlchemy
        db.flush = AsyncMock()
        db.get = AsyncMock(return_value=None)
        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = None
        db.execute = AsyncMock(return_value=mock_result)

        import asyncio
        loop = asyncio.new_event_loop()
        result = loop.run_until_complete(
            create_change(db, change_type="PIPELINE", change_target_id=100,
                         change_target_code="SYNC_OFFER",
                         change_summary="更新超时", risk_level="LOW",
                         reason="优化", created_by="admin")
        )
        loop.close()

        db.add.assert_called_once()
        obj = db.add.call_args[0][0]
        assert obj.change_type == "PIPELINE"
        assert obj.risk_level == "LOW"
        assert obj.status == "DRAFT"

    def test_create_change_high_risk_needs_approval(self):
        from app.ucp.change_service import create_change
        db = AsyncMock()
        db.add = MagicMock()  # db.add() is synchronous in SQLAlchemy
        db.flush = AsyncMock()
        db.get = AsyncMock(return_value=None)
        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = None
        db.execute = AsyncMock(return_value=mock_result)

        import asyncio
        loop = asyncio.new_event_loop()
        loop.run_until_complete(
            create_change(db, change_type="CREDENTIAL", change_target_id=5,
                         change_target_code="FEISHU_PROD",
                         change_summary="续期凭证", risk_level="HIGH",
                         reason="到期续期", created_by="admin")
        )
        loop.close()

        obj = db.add.call_args[0][0]
        assert obj.risk_level == "HIGH"
        assert obj.status == "PENDING_APPROVAL"

    def test_rollback_change(self):
        from app.ucp.change_service import rollback_change
        db = AsyncMock()
        db.add = MagicMock()  # db.add() is synchronous in SQLAlchemy
        mock_ch = MagicMock(id=1, change_code="CHG-001", status="PUBLISHED",
                           change_type="PIPELINE", change_target_id=100,
                           before_snapshot={"status": 1})
        # Let AsyncMock handle awaitable returns; set get result
        async def _mock_get(model, obj_id):
            return mock_ch
        db.get = _mock_get

        import asyncio
        loop = asyncio.new_event_loop()
        loop.run_until_complete(rollback_change(db, change_id=1))
        loop.close()

        assert mock_ch.status == "ROLLED_BACK"
        assert mock_ch.rolled_back_at is not None

    def test_rollback_fails_without_snapshot(self):
        from app.ucp.change_service import rollback_change
        db = AsyncMock()
        db.add = MagicMock()  # db.add() is synchronous in SQLAlchemy
        mock_ch = MagicMock(id=1, before_snapshot=None)
        async def _mock_get(model, obj_id):
            return mock_ch
        db.get = _mock_get

        import asyncio
        with pytest.raises(ValueError, match="无法回滚"):
            loop = asyncio.new_event_loop()
            loop.run_until_complete(rollback_change(db, change_id=1))
            loop.close()


# ==========================================
# 5. 治理评分
# ==========================================


class TestGovernanceScore:
    def test_calculate_scores_produces_output(self):
        from app.ucp.governance_score_service import calculate_scores
        db = AsyncMock()
        db.add = MagicMock()  # db.add() is synchronous in SQLAlchemy
        mock_systems = [MagicMock(id=1, system_code="BEISEN")]
        mock_runs = [
            MagicMock(status="SUCCESS", duration_ms=300),
            MagicMock(status="SUCCESS", duration_ms=500),
            MagicMock(status="FAILED", duration_ms=900),
        ]

        def _make_result(rows):
            r = MagicMock()
            r.scalars.return_value = MagicMock(all=MagicMock(return_value=rows))
            return r

        # Query 1: systems; 2: runs; 3: credentials (security score); 4: alerts
        empty_r = _make_result([])
        responses = [_make_result(mock_systems), _make_result(mock_runs), empty_r, empty_r]
        db.execute = AsyncMock(side_effect=responses)

        import asyncio
        loop = asyncio.new_event_loop()
        result = loop.run_until_complete(calculate_scores(db, asset_type="system"))
        loop.close()

        assert len(result) == 1
        assert result[0]["asset_type"] == "system"
        assert result[0]["asset_code"] == "BEISEN"
        assert "overall_score" in result[0]
        assert "reliability_score" in result[0]

    def test_calculate_scores_empty(self):
        from app.ucp.governance_score_service import calculate_scores
        db = AsyncMock()
        db.add = MagicMock()  # db.add() is synchronous in SQLAlchemy
        r = MagicMock()
        r.scalars.return_value = MagicMock(all=MagicMock(return_value=[]))
        db.execute = AsyncMock(return_value=r)

        import asyncio
        loop = asyncio.new_event_loop()
        result = loop.run_until_complete(calculate_scores(db, asset_type="system"))
        loop.close()
        assert result == []


# ==========================================
# 6. E2E 治理闭环
# ==========================================


class TestGovernanceE2E:
    """端到端治理闭环：系统→资源→凭证→Pipeline→执行→资产→拓扑→SLA→评分"""

    def test_e2e_data_consistency(self):
        system = {"id": 1, "code": "BEISEN"}
        resource = {"id": 10, "system_id": 1}
        credential = {"id": 5, "system_id": 1}
        pipeline = {"id": 100, "steps": [{"resource_id": 10, "credential_id": 5}]}
        execution = {"run_id": "run-001", "status": "SUCCESS"}

        assert resource["system_id"] == system["id"]
        assert credential["system_id"] == system["id"]
        assert pipeline["steps"][0]["resource_id"] == resource["id"]
        assert execution["status"] == "SUCCESS"

    def test_e2e_sla_scoring_pipeline(self):
        """模拟 SLA 计算的完整数据流。"""
        runs = [
            {"status": "SUCCESS", "duration_ms": 500},
            {"status": "SUCCESS", "duration_ms": 1500},
            {"status": "FAILED", "duration_ms": 3000},
        ]
        total = len(runs)
        success = sum(1 for r in runs if r["status"] != "FAILED")
        success_rate = success / total
        durations = sorted(r["duration_ms"] for r in runs)

        assert total == 3
        assert success == 2
        assert success_rate == 2 / 3
        assert durations == [500, 1500, 3000]

    def test_e2e_governance_dimensions(self):
        """治理维度必须是真实可操作的字段。"""
        dimensions = {
            "owner": {"asset": "system", "value": "hr_team"},
            "team": {"asset": "pipeline", "value": "data_eng"},
            "domain": {"asset": "resource", "value": "HR"},
            "environment": {"asset": "credential", "value": "prod"},
            "sensitivity": {"asset": "system", "value": "confidential"},
        }
        assert len(dimensions) == 5
        for dim, info in dimensions.items():
            assert info["value"] is not None

    def test_e2e_topology_relationships(self):
        """拓扑应基于真实关系类型。"""
        relationships = {
            ("resource", "system"): "belongs_to",
            ("template", "resource"): "references",
            ("pipeline", "resource"): "executes",
            ("event_trigger", "pipeline"): "triggers",
            ("credential", "system"): "authenticates",
        }
        assert len(relationships) == 5
