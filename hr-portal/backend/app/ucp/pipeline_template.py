"""Phase 3-8: 可视化流水线编排数据模型

设计:
- Pipeline Template (UcpPipelineTemplate): 编排好的可视化模板
  - template_code: 唯一标识
  - nodes_json: 节点列表 [{id, type, x, y, label, config}]
  - edges_json: 连线列表 [{from, to, condition}]
  - version: 语义化版本
- Pipeline Template Version (UcpPipelineTemplateVersion): 历史快照

节点类型 (NODE_TYPES):
  - CONNECTOR: 适配器节点 (执行一个 adapter)
  - TRANSFORM: 字段映射节点
  - BRANCH: 条件分支 (if/else)
  - LOOP: 列表循环 (for each)

连线校验: 
  - 起点终点必须存在
  - 不可自连
  - LOOP 出度只能为 1
"""
from __future__ import annotations

import re
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.ucp.models import (
    UcpPipelineTemplate,
    UcpPipelineTemplateVersion,
)


class PipelineTemplateError(ValueError):
    """模板操作错误."""


NODE_TYPES = {
    "CONNECTOR", "TRANSFORM", "BRANCH", "LOOP", "CAPABILITY",
    "CAPABILITY_LOOKUP", "RECORD_MERGE", "WAREHOUSE_ASSET_SINK",
}
TEMPLATE_CODE_RE = re.compile(r"^[A-Z][A-Z0-9_]{2,63}$")
SEMVER_RE = re.compile(r"^\d+\.\d+\.\d+([+-][\w.]+)?$")
LEGACY_SEMVER_RE = re.compile(r"^\d+\.\d+$")


def normalize_semver_version(version: str) -> str:
    return f"{version}.0" if LEGACY_SEMVER_RE.fullmatch(version) else version


def next_patch_version(version: str) -> str:
    normalized = normalize_semver_version(version)
    parts = normalized.split(".")
    try:
        return f"{parts[0]}.{parts[1]}.{int(parts[2].split('-')[0]) + 1}"
    except (IndexError, ValueError):
        return "1.0.1"


# ===== 节点 / 连线校验 =====


def _validate_node(node: Any, idx: int) -> dict:
    if not isinstance(node, dict):
        raise PipelineTemplateError(f"node[{idx}] 必须为 dict")
    nid = node.get("id")
    if not isinstance(nid, str) or not nid.strip():
        raise PipelineTemplateError(f"node[{idx}].id 必填且非空")
    ntype = node.get("type")
    if ntype not in NODE_TYPES:
        raise PipelineTemplateError(
            f"node[{idx}].type 错误 {ntype!r}, 允许 {sorted(NODE_TYPES)}"
        )
    x = node.get("x", 0)
    y = node.get("y", 0)
    if not isinstance(x, (int, float)) or not isinstance(y, (int, float)):
        raise PipelineTemplateError(f"node[{idx}].x/y 必须为数字")
    label = node.get("label", "")
    if not isinstance(label, str):
        raise PipelineTemplateError(f"node[{idx}].label 必须为 string")
    config = node.get("config", {})
    if not isinstance(config, dict):
        raise PipelineTemplateError(f"node[{idx}].config 必须为 dict")
    return {
        "id": nid.strip(),
        "type": ntype,
        "x": float(x),
        "y": float(y),
        "label": label[:64],
        "config": config,
    }


async def _validate_resource_node_refs(
    db: AsyncSession, nodes: list[dict]
) -> None:
    """CONNECTOR 节点必须配置 system_id + resource_id, 且 resource 属于该 system.

    防止跨 system 引用, 同时防止引用不存在的 resource.
    """
    from app.ucp.models import UcpResource

    need_check = [n for n in nodes if n["type"] == "CONNECTOR"]
    if not need_check:
        return
    for n in need_check:
        cfg = n.get("config") or {}
        sys_id = cfg.get("system_id")
        res_id = cfg.get("resource_id")
        if not sys_id or not res_id:
            raise PipelineTemplateError(
                f"CONNECTOR 节点 {n['id']!r} 缺少 system_id 或 resource_id"
            )
    # 批量校验 resource 存在 + system 一致
    res_ids = list({n["config"]["resource_id"] for n in need_check})
    stmt = select(UcpResource.id, UcpResource.system_id).where(
        UcpResource.id.in_(res_ids)
    )
    rows = (await db.execute(stmt)).all()
    res_map = {r[0]: r[1] for r in rows}
    for n in need_check:
        rid = n["config"]["resource_id"]
        sys_id = n["config"]["system_id"]
        if rid not in res_map:
            raise PipelineTemplateError(
                f"CONNECTOR 节点 {n['id']!r} 引用了不存在的 resource_id={rid}"
            )
        if res_map[rid] != sys_id:
            raise PipelineTemplateError(
                f"CONNECTOR 节点 {n['id']!r} 跨 system 引用: "
                f"resource {rid} 属于 system {res_map[rid]}, 与声明 system {sys_id} 不一致"
            )


def _validate_edge(edge: Any, idx: int, node_ids: set[str]) -> dict:
    if not isinstance(edge, dict):
        raise PipelineTemplateError(f"edge[{idx}] 必须为 dict")
    src = edge.get("from")
    dst = edge.get("to")
    if not isinstance(src, str) or src not in node_ids:
        raise PipelineTemplateError(f"edge[{idx}].from 节点不存在: {src!r}")
    if not isinstance(dst, str) or dst not in node_ids:
        raise PipelineTemplateError(f"edge[{idx}].to 节点不存在: {dst!r}")
    if src == dst:
        raise PipelineTemplateError(f"edge[{idx}] 不可自连: {src}")
    cond = edge.get("condition", "")
    if not isinstance(cond, str):
        raise PipelineTemplateError(f"edge[{idx}].condition 必须为 string")
    return {"from": src, "to": dst, "condition": cond[:256]}


def validate_graph(nodes: list, edges: list) -> tuple[list[dict], list[dict]]:
    """校验并规范化 nodes / edges, 返回 (norm_nodes, norm_edges)."""
    if not isinstance(nodes, list):
        raise PipelineTemplateError("nodes 必须为 list")
    if not isinstance(edges, list):
        raise PipelineTemplateError("edges 必须为 list")

    norm_nodes = [_validate_node(n, i) for i, n in enumerate(nodes)]
    node_ids = {n["id"] for n in norm_nodes}
    norm_edges = [_validate_edge(e, i, node_ids) for i, e in enumerate(edges)]

    # LOOP 出度校验
    out_degree: dict[str, int] = {nid: 0 for nid in node_ids}
    for e in norm_edges:
        out_degree[e["from"]] = out_degree.get(e["from"], 0) + 1
    for n in norm_nodes:
        if n["type"] == "LOOP" and out_degree[n["id"]] > 1:
            raise PipelineTemplateError(
                f"LOOP 节点 {n['id']!r} 出度不能超过 1, 当前 {out_degree[n['id']]}"
            )

    # id 唯一
    if len(node_ids) != len(norm_nodes):
        raise PipelineTemplateError("node id 存在重复")

    return norm_nodes, norm_edges


# ===== CRUD =====


async def create_template(
    db: AsyncSession,
    *,
    template_code: str,
    name: str,
    description: str | None = None,
    nodes: list | None = None,
    edges: list | None = None,
    version: str = "1.0.0",
    created_by: str = "system",
) -> UcpPipelineTemplate:
    """创建新模板 (含初始版本快照)."""
    code = template_code.strip()
    version = normalize_semver_version(version)
    if not TEMPLATE_CODE_RE.match(code):
        raise PipelineTemplateError(
            f"template_code 格式错误: {code!r}"
        )
    if not SEMVER_RE.match(version):
        raise PipelineTemplateError(f"version 不是 semver: {version!r}")
    if not isinstance(name, str) or not name.strip():
        raise PipelineTemplateError("name 必填且非空")

    norm_nodes, norm_edges = validate_graph(nodes or [], edges or [])
    await _validate_resource_node_refs(db, norm_nodes)

    tpl = UcpPipelineTemplate(
        template_code=code,
        name=name.strip(),
        description=(description or "").strip() or None,
        nodes_json=norm_nodes,
        edges_json=norm_edges,
        version=version,
        created_by=created_by,
    )
    db.add(tpl)
    await db.flush()

    # 创建首版本
    ver = UcpPipelineTemplateVersion(
        template_id=tpl.id,
        version=version,
        nodes_json=norm_nodes,
        edges_json=norm_edges,
        change_note="初始版本",
        created_by=created_by,
    )
    db.add(ver)
    await db.commit()
    await db.refresh(tpl)
    return tpl


async def update_template(
    db: AsyncSession,
    *,
    template_code: str,
    name: str | None = None,
    description: str | None = None,
    nodes: list | None = None,
    edges: list | None = None,
    version: str | None = None,
    change_note: str | None = None,
    created_by: str = "system",
) -> UcpPipelineTemplate:
    """更新模板 (若 nodes/edges 变更, 创建新版本快照)."""
    tpl = await get_template(db, template_code)
    if tpl is None:
        raise PipelineTemplateError(f"模板不存在: {template_code}")

    if name is not None:
        if not name.strip():
            raise PipelineTemplateError("name 不能为空")
        tpl.name = name.strip()
    if description is not None:
        tpl.description = description.strip() or None
    if tpl.created_by in {"seed", "system"} and created_by:
        tpl.created_by = created_by

    graph_changed = nodes is not None or edges is not None
    if graph_changed:
        # 合并现有 + 新值
        new_nodes = nodes if nodes is not None else tpl.nodes_json
        new_edges = edges if edges is not None else tpl.edges_json
        norm_nodes, norm_edges = validate_graph(new_nodes, new_edges)
        await _validate_resource_node_refs(db, norm_nodes)
        tpl.nodes_json = norm_nodes
        tpl.edges_json = norm_edges
        # 自动 bump version
        if version:
            requested_version = normalize_semver_version(version)
            if not SEMVER_RE.match(requested_version):
                raise PipelineTemplateError(f"version ?? semver: {requested_version!r}")
            tpl.version = (
                next_patch_version(tpl.version)
                if requested_version == normalize_semver_version(tpl.version)
                else requested_version
            )
        else:
            tpl.version = next_patch_version(tpl.version)
        # ???????
        ver = UcpPipelineTemplateVersion(
            template_id=tpl.id,
            version=tpl.version,
            nodes_json=norm_nodes,
            edges_json=norm_edges,
            change_note=(change_note or "更新").strip()[:256] or "更新",
            created_by=created_by,
        )
        db.add(ver)

    await db.commit()
    await db.refresh(tpl)
    return tpl


async def get_template(
    db: AsyncSession, template_code: str
) -> UcpPipelineTemplate | None:
    stmt = select(UcpPipelineTemplate).where(
        UcpPipelineTemplate.template_code == template_code
    )
    return (await db.execute(stmt)).scalar_one_or_none()


async def list_templates(
    db: AsyncSession,
    *,
    keyword: str | None = None,
    limit: int = 50,
    offset: int = 0,
) -> tuple[list[UcpPipelineTemplate], int]:
    from sqlalchemy import func

    stmt = select(UcpPipelineTemplate)
    count_stmt = select(func.count(UcpPipelineTemplate.id))
    if keyword:
        like = f"%{keyword}%"
        stmt = stmt.where(UcpPipelineTemplate.name.like(like))
        count_stmt = count_stmt.where(UcpPipelineTemplate.name.like(like))
    total = (await db.execute(count_stmt)).scalar_one()
    stmt = stmt.order_by(UcpPipelineTemplate.id.desc()).limit(limit).offset(offset)
    rows = (await db.execute(stmt)).scalars().all()
    return list(rows), int(total)


async def list_versions(
    db: AsyncSession, template_code: str
) -> list[UcpPipelineTemplateVersion]:
    tpl = await get_template(db, template_code)
    if tpl is None:
        raise PipelineTemplateError(f"模板不存在: {template_code}")
    stmt = (
        select(UcpPipelineTemplateVersion)
        .where(UcpPipelineTemplateVersion.template_id == tpl.id)
        .order_by(UcpPipelineTemplateVersion.id.desc())
    )
    return list((await db.execute(stmt)).scalars().all())


async def rollback_to_version(
    db: AsyncSession,
    *,
    template_code: str,
    target_version_id: int,
    created_by: str = "system",
) -> UcpPipelineTemplate:
    """回滚到指定版本 (创建新版本快照, 不覆盖历史)."""
    tpl = await get_template(db, template_code)
    if tpl is None:
        raise PipelineTemplateError(f"模板不存在: {template_code}")
    stmt = select(UcpPipelineTemplateVersion).where(
        UcpPipelineTemplateVersion.id == target_version_id,
        UcpPipelineTemplateVersion.template_id == tpl.id,
    )
    target = (await db.execute(stmt)).scalar_one_or_none()
    if target is None:
        raise PipelineTemplateError(f"版本不存在: {target_version_id}")
    # 校验目标版本的图
    norm_nodes, norm_edges = validate_graph(
        target.nodes_json or [], target.edges_json or []
    )
    await _validate_resource_node_refs(db, norm_nodes)
    tpl.nodes_json = norm_nodes
    tpl.edges_json = norm_edges
    # bump version
    parts = tpl.version.split(".")
    try:
        new_ver = f"{parts[0]}.{parts[1]}.{int(parts[2].split('-')[0]) + 1}"
    except (IndexError, ValueError):
        new_ver = "1.0.1"
    tpl.version = new_ver
    ver = UcpPipelineTemplateVersion(
        template_id=tpl.id,
        version=new_ver,
        nodes_json=norm_nodes,
        edges_json=norm_edges,
        change_note=f"回滚自 v{target.version}",
        created_by=created_by,
    )
    db.add(ver)
    await db.commit()
    await db.refresh(tpl)
    return tpl


async def delete_template(db: AsyncSession, template_code: str) -> bool:
    tpl = await get_template(db, template_code)
    if tpl is None:
        return False
    await db.delete(tpl)  # 级联删除 versions
    await db.commit()
    return True


def serialize_template(tpl: UcpPipelineTemplate) -> dict:
    return {
        "id": tpl.id,
        "template_code": tpl.template_code,
        "name": tpl.name,
        "description": tpl.description,
        "nodes": tpl.nodes_json or [],
        "edges": tpl.edges_json or [],
        "version": tpl.version,
        "created_by": tpl.created_by,
        "created_at": tpl.created_at.isoformat() if tpl.created_at else None,
        "updated_at": tpl.updated_at.isoformat() if tpl.updated_at else None,
    }


def serialize_version(ver: UcpPipelineTemplateVersion) -> dict:
    return {
        "id": ver.id,
        "template_id": ver.template_id,
        "version": ver.version,
        "nodes": ver.nodes_json or [],
        "edges": ver.edges_json or [],
        "change_note": ver.change_note,
        "created_by": ver.created_by,
        "created_at": ver.created_at.isoformat() if ver.created_at else None,
    }
