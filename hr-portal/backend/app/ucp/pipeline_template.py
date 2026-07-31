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
from app.ucp.pipeline_node_catalog import (
    NODE_TYPES,
    START_TRIGGER_TYPES,
    normalize_node_display,
)
from app.ucp.action_contract import ActionContractError, validate_condition_ast, validate_mapping


class PipelineTemplateError(ValueError):
    """模板操作错误."""


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


def _validate_warehouse_sink_config(config: dict, idx: int) -> None:
    write_mode = config.get("write_mode", "upsert")
    if write_mode not in {"append", "upsert", "replace", "period_full_snapshot"}:
        raise PipelineTemplateError(f"node[{idx}] 的资产写入模式不受支持")
    if write_mode == "period_full_snapshot" and "primary_key" in config:
        raise PipelineTemplateError(f"node[{idx}] 的按期间全量快照业务主键由资产元数据控制，不能在流水线中配置")
    if write_mode == "period_full_snapshot" and not isinstance(config.get("period_field"), str):
        raise PipelineTemplateError(f"node[{idx}] 的按期间全量快照必须配置 period_field")
    for key in ("mapping", "validations"):
        if key in config and not isinstance(config[key], list):
            raise PipelineTemplateError(f"node[{idx}] 的 {key} 必须是数组")


def _validate_node(node: Any, idx: int) -> dict:
    if not isinstance(node, dict):
        raise PipelineTemplateError(f"node[{idx}] must be a dict")
    node_id = node.get("id")
    if not isinstance(node_id, str) or not node_id.strip():
        raise PipelineTemplateError(f"node[{idx}].id is required")
    node_type = node.get("type")
    if not isinstance(node_type, str) or node_type not in NODE_TYPES:
        raise PipelineTemplateError(f"node[{idx}].type is unsupported: {node_type!r}")
    x, y = node.get("x", 0), node.get("y", 0)
    if not isinstance(x, (int, float)) or not isinstance(y, (int, float)):
        raise PipelineTemplateError(f"node[{idx}].x/y must be numeric")
    label = node.get("label", "")
    if not isinstance(label, str):
        raise PipelineTemplateError(f"node[{idx}].label must be a string")
    config = node.get("config", {})
    if not isinstance(config, dict):
        raise PipelineTemplateError(f"node[{idx}].config must be a dict")
    try:
        label, config = normalize_node_display(node_type, label, config)
    except ValueError as error:
        raise PipelineTemplateError(f"node[{idx}].config is invalid: {error}") from error
    if node_type == "BRANCH":
        if "condition" in config or config.get("condition_ast") is None:
            raise PipelineTemplateError(f"node[{idx}] 的分支条件必须使用结构化 condition_ast")
        try:
            validate_condition_ast(
                dict(config["condition_ast"]),
                catalog=list(config.get("condition_field_catalog") or []),
            )
        except ActionContractError as error:
            raise PipelineTemplateError(f"node[{idx}] 的结构化条件无效：{error}") from error
    if node_type == "TRANSFORM":
        if any(key in config for key in ("field_mappings", "input_keys", "output_key")) or config.get("mapping") is None:
            raise PipelineTemplateError(f"node[{idx}] 的字段映射必须使用版本化 mapping DTO")
        try:
            validate_mapping(
                dict(config["mapping"]), source_catalog=list(config.get("mapping_source_catalog") or []),
                target_catalog=list(config.get("mapping_target_catalog") or []),
            )
        except ActionContractError as error:
            raise PipelineTemplateError(f"node[{idx}] 的字段映射无效：{error}") from error
    if node_type == "WAREHOUSE_ASSET_SINK":
        _validate_warehouse_sink_config(config, idx)
    return {
        "id": node_id.strip(),
        "type": node_type,
        "x": float(x),
        "y": float(y),
        "label": label,
        "config": config,
    }


async def _validate_warehouse_sink_assets(db: AsyncSession, nodes: list[dict]) -> None:
    from app.data.models import RegisteredTable, TableColumn

    for node in nodes:
        if node["type"] != "WAREHOUSE_ASSET_SINK":
            continue
        config = node["config"]
        target_asset = config.get("target_asset")
        if not isinstance(target_asset, str) or not target_asset:
            raise PipelineTemplateError(f"node[{node['id']}] 的资产写入必须配置 target_asset")
        asset = await db.scalar(select(RegisteredTable).where(RegisteredTable.table_name == target_asset))
        if asset is None or asset.asset_status != "published":
            raise PipelineTemplateError(f"node[{node['id']}] 的目标资产不存在或尚未发布")
        columns = list((await db.execute(select(TableColumn).where(TableColumn.table_name == target_asset))).scalars())
        allowed = {column.column_code for column in columns}
        whitelist = config.get("field_whitelist") or []
        if not isinstance(whitelist, list) or not whitelist or len(whitelist) != len(set(whitelist)) or not set(whitelist).issubset(allowed):
            raise PipelineTemplateError(f"node[{node['id']}] 的字段白名单无效")
        mapping = config.get("mapping")
        if not isinstance(mapping, list) or not mapping:
            raise PipelineTemplateError(f"node[{node['id']}] 的字段映射不能为空")
        targets = [rule.get("target") for rule in mapping if isinstance(rule, dict)]
        if len(targets) != len(mapping) or any(not isinstance(target, str) or target not in allowed for target in targets) or len(targets) != len(set(targets)):
            raise PipelineTemplateError(f"node[{node['id']}] 的字段映射目标无效或重复")
        if any(target not in whitelist for target in targets):
            raise PipelineTemplateError(f"node[{node['id']}] 的字段映射目标必须包含在白名单中")
        for rule in mapping:
            minimum, maximum = rule.get("minimum"), rule.get("maximum")
            if minimum is not None and maximum is not None:
                try:
                    if float(minimum) > float(maximum):
                        raise PipelineTemplateError(f"node[{node['id']}] 的字段映射最小值不能大于最大值")
                except (TypeError, ValueError) as exc:
                    raise PipelineTemplateError(f"node[{node['id']}] 的字段映射范围无效") from exc
        if config.get("write_mode") == "period_full_snapshot":
            pk_columns = {column.column_code for column in columns if column.is_pk_part}
            if not asset.is_period or config.get("period_field") != asset.period_col:
                raise PipelineTemplateError(f"node[{node['id']}] 的按期间全量快照期间字段必须与资产元数据一致")
            if not pk_columns.issubset(set(whitelist)):
                raise PipelineTemplateError(f"node[{node['id']}] 的按期间全量快照白名单必须包含全部业务主键")



async def _validate_resource_node_refs(
    db: AsyncSession, nodes: list[dict]
) -> None:
    """CONNECTOR 节点必须配置 system_id + resource_id, 且 resource 属于该 system.

    防止跨 system 引用, 同时防止引用不存在的 resource.
    """
    from app.ucp.models import UcpResource, UcpSystem

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
    test_system_ids = set((await db.execute(select(UcpSystem.id).where(UcpSystem.id.in_([n["config"]["system_id"] for n in need_check]), UcpSystem.is_catalog_test_instance == 1))).scalars())
    if test_system_ids:
        raise PipelineTemplateError("目录测试实例不能被 Pipeline 引用")


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
    """Validate, normalize, and enforce executable graph invariants."""
    if not isinstance(nodes, list):
        raise PipelineTemplateError("nodes must be a list")
    if not isinstance(edges, list):
        raise PipelineTemplateError("edges must be a list")

    norm_nodes = [_validate_node(node, index) for index, node in enumerate(nodes)]
    node_ids = {node["id"] for node in norm_nodes}
    if len(node_ids) != len(norm_nodes):
        raise PipelineTemplateError("node id values must be unique")

    start_nodes = [node for node in norm_nodes if node["type"] == "START_TRIGGER"]
    if len(start_nodes) != 1:
        raise PipelineTemplateError("a pipeline template must contain exactly one START_TRIGGER node")
    start_node = start_nodes[0]
    start_config = start_node["config"]
    allowed_start_config_keys = {"mode", "trigger_types", "management_path", "business_alias"}
    if set(start_config) - allowed_start_config_keys:
        raise PipelineTemplateError(
            "START_TRIGGER config may only contain mode, trigger_types, and management_path"
        )
    if start_config.get("mode", "OR") != "OR":
        raise PipelineTemplateError("START_TRIGGER only supports OR trigger semantics")
    trigger_types = start_config.get("trigger_types", [])
    if not isinstance(trigger_types, list) or not all(
        isinstance(trigger_type, str) and trigger_type in START_TRIGGER_TYPES
        for trigger_type in trigger_types
    ):
        raise PipelineTemplateError("START_TRIGGER.trigger_types contains an unsupported trigger type")
    management_path = start_config.get("management_path")
    if management_path is not None and management_path != "/ucp/events/triggers":
        raise PipelineTemplateError("START_TRIGGER.management_path must reference the trigger management page")

    norm_edges = [_validate_edge(edge, index, node_ids) for index, edge in enumerate(edges)]
    if any(edge["to"] == start_node["id"] for edge in norm_edges):
        raise PipelineTemplateError("START_TRIGGER cannot have incoming edges")

    for branch_node in (node for node in norm_nodes if node["type"] == "BRANCH"):
        outgoing_edges = [edge for edge in norm_edges if edge["from"] == branch_node["id"]]
        expected_conditions = {f"BRANCH_TRUE:{branch_node['id']}", f"BRANCH_FALSE:{branch_node['id']}"}
        if len(outgoing_edges) != 2 or {edge["condition"].strip() for edge in outgoing_edges} != expected_conditions:
            raise PipelineTemplateError(
                f"BRANCH node {branch_node['id']!r} must have true and false conditional outgoing edges"
            )

    adjacency: dict[str, list[str]] = {node_id: [] for node_id in node_ids}
    in_degree: dict[str, int] = {node_id: 0 for node_id in node_ids}
    for edge in norm_edges:
        adjacency[edge["from"]].append(edge["to"])
        in_degree[edge["to"]] += 1

    ready = [node["id"] for node in norm_nodes if in_degree[node["id"]] == 0]
    visited_count = 0
    while ready:
        node_id = ready.pop(0)
        visited_count += 1
        for target_id in adjacency[node_id]:
            in_degree[target_id] -= 1
            if in_degree[target_id] == 0:
                ready.append(target_id)
    if visited_count != len(norm_nodes):
        raise PipelineTemplateError("pipeline graph must not contain cycles")

    reachable: set[str] = set()
    pending = [start_node["id"]]
    while pending:
        node_id = pending.pop()
        if node_id in reachable:
            continue
        reachable.add(node_id)
        pending.extend(adjacency[node_id])
    if reachable != node_ids:
        raise PipelineTemplateError("every pipeline node must be reachable from START_TRIGGER")
    return norm_nodes, norm_edges


def topologically_sort_nodes(nodes: list[dict], edges: list[dict]) -> list[dict]:
    """Return nodes in deterministic edge-defined execution order."""
    order = {node["id"]: index for index, node in enumerate(nodes)}
    adjacency: dict[str, list[str]] = {node_id: [] for node_id in order}
    in_degree: dict[str, int] = {node_id: 0 for node_id in order}
    for edge in edges:
        adjacency[edge["from"]].append(edge["to"])
        in_degree[edge["to"]] += 1
    ready = sorted((node_id for node_id, degree in in_degree.items() if degree == 0), key=order.get)
    sorted_ids: list[str] = []
    while ready:
        node_id = ready.pop(0)
        sorted_ids.append(node_id)
        for target_id in sorted(adjacency[node_id], key=order.get):
            in_degree[target_id] -= 1
            if in_degree[target_id] == 0:
                ready.append(target_id)
                ready.sort(key=order.get)
    if len(sorted_ids) != len(nodes):
        raise PipelineTemplateError("pipeline graph must not contain cycles")
    node_map = {node["id"]: node for node in nodes}
    return [node_map[node_id] for node_id in sorted_ids]


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
    await _validate_warehouse_sink_assets(db, norm_nodes)

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
        await _validate_warehouse_sink_assets(db, norm_nodes)
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
    await _validate_warehouse_sink_assets(db, norm_nodes)
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
