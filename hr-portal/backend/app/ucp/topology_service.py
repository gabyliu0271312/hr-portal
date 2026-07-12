"""Phase 6-B: 依赖拓扑服务。

从流水线 nodes/edges 抽取系统、资源、流水线依赖关系。
"""
from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.ucp.models import (
    UcpSystem, UcpResource, UcpCredential,
    UcpPipelineConfig, UcpPipelineTemplate,
    UcpPipelineExecution, UcpEventTrigger,
)


async def build_topology(
    db: AsyncSession,
    system_id: int | None = None,
    resource_id: int | None = None,
) -> dict:
    """构建依赖拓扑图。

    返回 nodes 和 edges 列表，用于前端可视化渲染。
    """
    nodes = []
    edges = []
    node_ids = set()

    # 1. 系统节点
    sys_stmt = select(UcpSystem)
    if system_id:
        sys_stmt = sys_stmt.where(UcpSystem.id == system_id)
    systems = (await db.execute(sys_stmt)).scalars().all()
    for s in systems:
        nid = f"system:{s.id}"
        nodes.append({
            "id": nid, "label": s.system_name, "type": "system",
            "code": s.system_code, "status": "active" if s.is_active else "inactive",
        })
        node_ids.add(nid)

    # 2. 资源节点
    res_stmt = select(UcpResource)
    if system_id:
        res_stmt = res_stmt.where(UcpResource.system_id == system_id)
    if resource_id:
        res_stmt = res_stmt.where(UcpResource.id == resource_id)
    resources = (await db.execute(res_stmt)).scalars().all()
    for r in resources:
        nid = f"resource:{r.id}"
        nodes.append({
            "id": nid, "label": r.resource_name, "type": "resource",
            "code": r.resource_code, "system_id": r.system_id,
        })
        node_ids.add(nid)
        # 资源 → 系统 连线
        sys_nid = f"system:{r.system_id}"
        if sys_nid in node_ids:
            edges.append({"from": nid, "to": sys_nid, "label": "belongs_to"})

    # 3. 流水线节点
    pipes = (await db.execute(select(UcpPipelineConfig))).scalars().all()
    for p in pipes:
        nid = f"pipeline:{p.id}"
        nodes.append({
            "id": nid, "label": p.pipeline_name, "type": "pipeline",
            "code": p.pipeline_code, "status": "active" if p.status == 1 else "inactive",
        })
        node_ids.add(nid)

    # 4. 从模板和流水线 steps 抽取依赖
    templates = (await db.execute(select(UcpPipelineTemplate))).scalars().all()
    for tpl in templates:
        tpl_nid = f"template:{tpl.id}"
        nodes.append({
            "id": tpl_nid, "label": tpl.name, "type": "template",
            "code": tpl.template_code,
        })
        node_ids.add(tpl_nid)
        # 从 nodes_json 解析资源引用
        if tpl.nodes_json:
            for node in tpl.nodes_json:
                if isinstance(node, dict):
                    cfg = node.get("config") or {}
                    rid = cfg.get("resource_id") or cfg.get("resourceId")
                    if rid:
                        res_nid = f"resource:{rid}"
                        edges.append({"from": tpl_nid, "to": res_nid, "label": "references"})

    # 5. 凭证节点 + credential→system/re resource 边
    credentials = (await db.execute(select(UcpCredential))).scalars().all()
    for c in credentials:
        nid = f"credential:{c.id}"
        nodes.append({
            "id": nid, "label": c.credential_name, "type": "credential",
            "code": c.credential_code, "auth_type": c.auth_type,
            "env_tag": c.env_tag,
        })
        node_ids.add(nid)
        if c.system_id:
            sys_nid = f"system:{c.system_id}"
            if sys_nid in node_ids:
                edges.append({"from": nid, "to": sys_nid, "label": "authenticates"})

    # 6. 触发器节点 + trigger→pipeline 边
    triggers = (await db.execute(select(UcpEventTrigger).where(UcpEventTrigger.is_active == 1))).scalars().all()
    for t in triggers:
        nid = f"trigger:{t.id}"
        nodes.append({
            "id": nid, "label": t.trigger_name, "type": "trigger",
            "code": t.trigger_code, "pipeline_code": t.pipeline_code,
        })
        node_ids.add(nid)
        # trigger→pipeline
        pipe = (await db.execute(
            select(UcpPipelineConfig).where(UcpPipelineConfig.pipeline_code == t.pipeline_code)
        )).scalar_one_or_none()
        if pipe:
            pipe_nid = f"pipeline:{pipe.id}"
            edges.append({"from": nid, "to": pipe_nid, "label": "triggers"})

    # 7. 最近执行节点 + execution→pipeline 边
    executions = (await db.execute(
        select(UcpPipelineExecution).order_by(UcpPipelineExecution.created_at.desc()).limit(50)
    )).scalars().all()
    seen_exec_pipes = set()
    for e in executions:
        pipe_nid = f"pipeline_exec:{e.pipeline_code}"
        if pipe_nid not in seen_exec_pipes:
            seen_exec_pipes.add(pipe_nid)
            nodes.append({
                "id": pipe_nid, "label": f"Run:{e.pipeline_code[:20]}", "type": "execution",
                "status": e.status, "duration_ms": e.duration_ms,
            })

    # 8. 从 Pipeline step 解析资源引用（含 CONNECTOR 类型）
    for p in pipes:
        if p.steps:
            for step in p.steps:
                if isinstance(step, dict):
                    cfg = step.get("config") or {}
                    rid = cfg.get("resource_id")
                    if rid:
                        pipe_nid = f"pipeline:{p.id}"
                        res_nid = f"resource:{rid}"
                        if pipe_nid in node_ids:
                            edges.append({"from": pipe_nid, "to": res_nid, "label": "executes"})

    # 截断：最多 300 节点
    nodes = nodes[:300]

    return {"nodes": nodes, "edges": edges}


async def get_impact_analysis(
    db: AsyncSession,
    target_type: str,  # system / resource / pipeline
    target_id: int,
) -> dict:
    """分析变更影响范围。

    返回受影响的流水线、下游系统和资源列表。
    """
    affected_pipelines = []
    affected_resources = []
    affected_systems = []

    if target_type == "system":
        # 该系统下所有资源
        resources = (await db.execute(
            select(UcpResource).where(UcpResource.system_id == target_id)
        )).scalars().all()
        affected_resources = [
            {"id": r.id, "code": r.resource_code, "name": r.resource_name}
            for r in resources
        ]
        # 引用这些资源的流水线
        res_ids = [r.id for r in resources]
        if res_ids:
            templates = (await db.execute(
                select(UcpPipelineTemplate)
            )).scalars().all()
            seen_pipes = set()
            for tpl in templates:
                if tpl.nodes_json:
                    for node in tpl.nodes_json:
                        if isinstance(node, dict):
                            cfg = node.get("config") or {}
                            rid = cfg.get("resource_id") or cfg.get("resourceId")
                            if rid in res_ids:
                                seen_pipes.add(tpl.template_code)
            affected_pipelines = [{"code": c} for c in seen_pipes]

    elif target_type == "resource":
        r = await db.get(UcpResource, target_id)
        if r:
            affected_resources = [{"id": r.id, "code": r.resource_code, "name": r.resource_name}]
            affected_systems = [{"id": r.system_id}]

    elif target_type == "pipeline":
        p = await db.get(UcpPipelineConfig, target_id)
        if p:
            affected_pipelines = [{"code": p.pipeline_code, "name": p.pipeline_name}]

    return {
        "target": {"type": target_type, "id": target_id},
        "affected_pipelines": affected_pipelines,
        "affected_resources": affected_resources,
        "affected_systems": affected_systems,
    }
