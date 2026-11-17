"""创梦人力专有落库校验（资产写入层）。

设计 B：校验按「字段所属分组的权威源」分派，不污染通用 UCP 连接器。

- authority_source = org_tree : 该分组的字段（组织编码/名称）对组织树做一致性校验，
  失败整批拒绝；成功回填 org_level_1..4_code 投影。
- authority_source = roster   : 该分组的字段（员工编号/姓名）对花名册做一致性校验
  （在职+离职都算），失败整批拒绝。

挂点：WarehouseAssetSink.write 在 clean_rows 构造后、写库前调用
validate_rows_for_asset(db, target_asset, rows)。失败抛 WarehouseValidationError，
由调用方转为整批 FAILED 不落库。
"""
from __future__ import annotations

from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.data.models import FieldGroup, OrgNode, StandardField, TableColumn, DATA_TABLES
from app.data.employee_roster_contract import EMPLOYEE_ROSTER_TABLE

ORG_TREE_SOURCE = "org_tree"
ROSTER_SOURCE = "roster"

# 组织层级投影回填的目标列前缀（由树权威投影回填到业务行）
ORG_LEVEL_CODE_PREFIX = "org_level_"
MAX_ORG_LEVEL = 4


class WarehouseValidationError(ValueError):
    """资产写入前校验失败：整批拒绝、不落库。"""


async def _load_group_sources(db: AsyncSession) -> dict[int, str]:
    """field_groups → {group_id: authority_source}（仅权威源非空的分组）。"""
    rows = (await db.execute(
        select(FieldGroup.id, FieldGroup.authority_source).where(
            FieldGroup.authority_source.is_not(None),
        )
    )).all()
    return {row[0]: row[1] for row in rows}


async def _load_asset_field_groups(
    db: AsyncSession, target_asset: str
) -> tuple[dict[str, str], dict[str, int]]:
    """该资产表列 → 分组权威源 与 分组ID。

    返回 (column_code → authority_source, column_code → group_id)，
    只包含能解析到标准字段且该字段归属了带权威源分组的列。
    """
    columns = (await db.execute(
        select(TableColumn.column_code, TableColumn.table_name).where(
            TableColumn.table_name == target_asset
        )
    )).all()
    col_codes = [row[0] for row in columns]
    if not col_codes:
        return {}, {}

    fields = (await db.execute(
        select(StandardField.field_code, StandardField.group_id).where(
            StandardField.field_code.in_(col_codes),
            StandardField.group_id.is_not(None),
        )
    )).all()
    group_sources = await _load_group_sources(db)
    col_to_source: dict[str, str] = {}
    col_to_group: dict[str, int] = {}
    for field_code, group_id in fields:
        source = group_sources.get(group_id)
        if source:
            col_to_source[field_code] = source
            col_to_group[field_code] = group_id
    return col_to_source, col_to_group


async def _load_org_tree(db: AsyncSession) -> tuple[dict[str, dict[str, Any]], dict[int, str]]:
    """当前 org_tree 全量节点（含停用）。

    返回 (code → {id, name, parent_id, level}, id → code)。
    """
    nodes = (await db.execute(
        select(OrgNode.id, OrgNode.code, OrgNode.name, OrgNode.parent_id, OrgNode.level)
    )).all()
    out: dict[str, dict[str, Any]] = {}
    by_id: dict[int, str] = {}
    for node_id, code, name, parent_id, level in nodes:
        out[code] = {"id": node_id, "name": name, "parent_id": parent_id, "level": level}
        by_id[node_id] = code
    return out, by_id


async def _load_roster(db: AsyncSession) -> tuple[dict[str, str], set[str]]:
    """花名册（在职+离职都算）：employee_no → full_name。"""
    roster_model = DATA_TABLES.get(EMPLOYEE_ROSTER_TABLE)
    if roster_model is None or "employee_no" not in roster_model.__table__.columns:
        return {}, set()
    name_col = "full_name" if "full_name" in roster_model.__table__.columns else None
    rows = (await db.execute(select(roster_model.employee_no, name_col))).all() if name_col else (await db.execute(select(roster_model.employee_no))).all()
    name_map: dict[str, str] = {}
    emp_set: set[str] = set()
    for row in rows:
        emp_no = str(row[0]) if row[0] is not None else ""
        if not emp_no:
            continue
        emp_set.add(emp_no)
        if name_col:
            name_map[emp_no] = str(row[1]) if row[1] is not None else ""
    return name_map, emp_set


def _resolve_level_path(
    code: str, tree: dict[str, dict[str, Any]], by_id: dict[int, str]
) -> list[str]:
    """由 parent_id 链回溯到 RootOrg，得到根到该节点的 code 链（RootOrg 不计）。

    与 resolve_org_hierarchy 同口径：第一个业务组织=第 1 级。
    成环/缺父时只回退到安全部分，不抛异常（投影回填尽力而为）。
    """
    chain: list[str] = []
    seen: set[int] = set()
    current_id = tree[code].get("id")
    current_code = code
    while current_id is not None and current_id not in seen:
        seen.add(current_id)
        chain.append(current_code)
        node_ref = tree.get(current_code)
        if node_ref is None:
            break
        current_id = node_ref.get("parent_id")
        if current_id is None:
            break
        parent_code = by_id.get(current_id)
        if parent_code is None or parent_code == "RootOrg":
            break
        current_code = parent_code
    chain.reverse()
    return [c for c in chain if c != "RootOrg"]


async def validate_rows_for_asset(
    db: AsyncSession, target_asset: str, rows: list[dict]
) -> list[dict]:
    """对资产写入前的一批行做创梦人力专有校验。

    按该资产表列所属分组的权威源分派：
    - org_tree：组织编码存在 + 名称一致（强校验）+ 组织投影回填 org_level_1..4_code。
    - roster：员工编号存在 + 姓名一致（强校验）。
    校验失败抛 WarehouseValidationError（整批拒绝，不落库）。

    返回行（可能已回填投影列）。未命中任何带权威源分组的资产 → 原样返回（通用资产不校验）。
    """
    col_to_source, _ = await _load_asset_field_groups(db, target_asset)
    if not col_to_source:
        return rows

    org_cols = [col for col, source in col_to_source.items() if source == ORG_TREE_SOURCE]
    roster_cols = [col for col, source in col_to_source.items() if source == ROSTER_SOURCE]
    if not org_cols and not roster_cols:
        return rows

    tree: dict[str, dict[str, Any]] = {}
    tree_by_id: dict[int, str] = {}
    if org_cols:
        tree, tree_by_id = await _load_org_tree(db)
    roster_names: dict[str, str] = {}
    roster_emps: set[str] = set()
    if roster_cols:
        roster_names, roster_emps = await _load_roster(db)

    projected_rows: list[dict] = []
    for index, row in enumerate(rows, start=1):
        if not isinstance(row, dict):
            raise WarehouseValidationError(f"第 {index} 行必须是对象")

        # 组织校验（org_tree 权威）
        # 编码列（列名含 code）做存在性 + 投影回填；名称列（列名含 name）只做一致性对照。
        org_code_cols = [col for col in org_cols if "name" not in col]
        org_name_cols = [col for col in org_cols if "name" in col]
        for col in org_code_cols:
            value = row.get(col)
            if value is None or str(value).strip() == "":
                # 组织编码为空：允许（如该行无组织归属），不阻断
                continue
            code = str(value).strip()
            node = tree.get(code)
            if node is None:
                raise WarehouseValidationError(
                    f"第 {index} 行字段 {col} 的组织编码 {code} 不在组织树中（含停用）"
                )
            # 名称强校验：该行若带了组织名称列（该列的 <col>_name 或独立名称列），须与树一致
            for name_col in org_name_cols:
                if row.get(name_col) is None or str(row.get(name_col)).strip() == "":
                    continue
                tree_name = node.get("name")
                if tree_name is not None and str(tree_name).strip() != str(row.get(name_col)).strip():
                    raise WarehouseValidationError(
                        f"第 {index} 行字段 {col} 组织名称不一致：行值「{row.get(name_col)}」≠ 组织树「{tree_name}」（编码 {code}）"
                    )
            # 组织投影回填 org_level_1..4_code
            chain = _resolve_level_path(code, tree, tree_by_id)
            for level in range(1, MAX_ORG_LEVEL + 1):
                level_code = chain[level - 1] if level <= len(chain) else None
                row[f"{ORG_LEVEL_CODE_PREFIX}{level}_code"] = level_code

        # 人员校验（roster 权威，在职+离职都算）
        # 编码列（employee_no 等）做存在性；名称列（full_name/display_name）只做一致性对照。
        roster_code_cols = [col for col in roster_cols if "name" not in col]
        roster_name_cols = [col for col in roster_cols if "name" in col]
        for col in roster_code_cols:
            value = row.get(col)
            if value is None or str(value).strip() == "":
                continue
            emp_no = str(value).strip()
            if emp_no not in roster_emps:
                raise WarehouseValidationError(
                    f"第 {index} 行字段 {col} 的员工编号 {emp_no} 不在人员名单中"
                )
            # 姓名强校验：该行若带了姓名列，须与花名册一致
            for name_col in roster_name_cols:
                if row.get(name_col) is None or str(row.get(name_col)).strip() == "":
                    continue
                roster_name = roster_names.get(emp_no)
                if roster_name is not None and roster_name.strip() != str(row.get(name_col)).strip():
                    raise WarehouseValidationError(
                        f"第 {index} 行字段 {col} 姓名不一致：行值「{row.get(name_col)}」≠ 花名册「{roster_name}」（工号 {emp_no}）"
                    )

        projected_rows.append(row)

    return projected_rows
