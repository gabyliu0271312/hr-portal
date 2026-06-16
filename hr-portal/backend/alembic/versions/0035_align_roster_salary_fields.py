"""Align roster and salary field codes to canonical entity columns."""

from __future__ import annotations

import json
import re
from typing import Any, Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "0035_align_roster_salary_fields"
down_revision: Union[str, None] = "0034_missing_registered_tables"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

POSTGRES_IDENTIFIER_MAX_BYTES = 63


class RenameSpec:
    def __init__(
        self,
        *,
        table: str,
        sources: tuple[str, ...],
        target: str,
        label: str,
        source_field_id: str | None = None,
        data_type: str = "string",
        is_visible: bool = True,
        auto_discovered: bool = True,
        scope_role: str | None = None,
    ) -> None:
        self.table = table
        self.sources = sources
        self.target = target
        self.label = label
        self.source_field_id = source_field_id
        self.data_type = data_type
        self.is_visible = is_visible
        self.auto_discovered = auto_discovered
        self.scope_role = scope_role


RENAMES: tuple[RenameSpec, ...] = (
    RenameSpec(
        table="emp_realtime_roster",
        sources=("name", "姓名（中文名）"),
        target="chinese_name",
        label="姓名（中文名）",
        source_field_id="37ddc816-37e2-d132-062f-9a784c0084c4",
    ),
    RenameSpec(
        table="emp_realtime_roster",
        sources=("name_2", "姓名"),
        target="full_name",
        label="姓名",
        source_field_id="62018008-71bf-4084-88f6-28b0d6621e35",
    ),
    RenameSpec(
        table="emp_realtime_roster",
        sources=("_org_node_code",),
        target="org_node_code",
        label="组织节点编码（权限用）",
        is_visible=False,
        auto_discovered=False,
        scope_role="org_node_code",
    ),
    RenameSpec(
        table="emp_monthly_salary",
        sources=("name", "姓名"),
        target="full_name",
        label="姓名",
        source_field_id="a1fc8e94-616d-4bab-997c-01abbc58a060",
    ),
)


EXPLICIT_DROPS = {
    "emp_realtime_roster": {
        "corehr_employeeinformation_extzhongwenming_609153_78242362_id",
        "corehr_employeeinformation_extzhongwenming_609153_78242362_alias",
        "1b725de4-7e51-4888-ab05-dc435bb511f8_original",
        "9e0a9a5d-f3d8-4262-84a4-9f1c7dc4c0ce_original",
        "corehr_employmentrecord_extbu_609153_555150448_id",
        "corehr_employmentrecord_extbu_609153_555150448_alias",
        "corehr_employmentrecord_extguanlizhiji_609153_264978747_id",
        "corehr_employmentrecord_extguanlizhiji_609153_264978747_alias",
        "f3106329-a6a3-42fd-90a5-876559b6fbe8_original",
        "compensation_salaryprofile_extbizhong_609153_398635978_id",
        "compensation_salaryprofile_extbizhong_609153_398635978_alias",
        "1a92cb4f-a15d-4465-a228-5cfd46abbef9_Id",
        "a7bc1497-ba98-487c-85c0-7c732ce68489_Id",
        "da21ba4e-1bf4-4e59-9b2c-1e8fda7c86a7_Id",
        "a2c1bf8e-d15d-4f38-85d2-284fb8335c79_Id",
        "ac817865-29cc-4516-b1c1-2b6cb58364d6_Id",
        "9ca79caa-d90a-4e30-b441-6abea5e1af24_Id",
        "fa8df054-e00d-40d9-bb9a-68a33e217c02_Id",
        "09423790-361a-4c1e-9e06-ad5185ec8273_Id",
        "ca3f7f1f-8973-4b67-84bf-3ee91bb55d1d_Id",
        "a7d6b14d-c874-402d-be7d-ce829abca827_Id",
        "822d3287-97f4-4b28-9c70-e7b551afb73f_Id",
        "e5998bee-239c-4159-a005-1cddc67473d6_Id",
        "fd47c318-094c-4624-8941-cc213219bef9_Id",
        "8f8fc55c-f698-400b-b5d6-60447b1d3af3_Id",
        "62018008-71bf-4084-88f6-28b0d6621e35_Id",
        "corehr_employmentrecord_extgongzuodi_609153_691575567_id",
        "corehr_employmentrecord_extgongzuodi_609153_691575567_alias",
    }
}


HELPER_COLUMN_RE = re.compile(
    r"^(?:corehr|compensation)_.+_(?:id|alias)$|.+_original$",
    flags=re.IGNORECASE,
)


def _quote_ident(identifier: str) -> str:
    return f'"{identifier.replace(chr(34), chr(34) * 2)}"'


def _is_valid_pg_identifier_length(identifier: str) -> bool:
    return len(identifier.encode("utf-8")) <= POSTGRES_IDENTIFIER_MAX_BYTES


def _table_exists(bind, table: str) -> bool:
    if not _is_valid_pg_identifier_length(table):
        return False
    return bool(
        bind.execute(
            sa.text(
                """
                SELECT EXISTS (
                    SELECT 1
                    FROM information_schema.tables
                    WHERE table_schema = 'public' AND table_name = :table
                )
                """
            ),
            {"table": table},
        ).scalar_one()
    )


def _column_exists(bind, table: str, column: str) -> bool:
    if not _is_valid_pg_identifier_length(table) or not _is_valid_pg_identifier_length(column):
        return False
    return bool(
        bind.execute(
            sa.text(
                """
                SELECT EXISTS (
                    SELECT 1
                    FROM information_schema.columns
                    WHERE table_schema = 'public'
                      AND table_name = :table
                      AND column_name = :column
                )
                """
            ),
            {"table": table, "column": column},
        ).scalar_one()
    )


def _metadata_exists(bind, table: str, code: str) -> bool:
    return bool(
        bind.execute(
            sa.text(
                """
                SELECT EXISTS (
                    SELECT 1 FROM table_columns
                    WHERE table_name = :table AND column_code = :code
                )
                """
            ),
            {"table": table, "code": code},
        ).scalar_one()
    )


def _json_load(value: Any, fallback: Any) -> Any:
    if value is None:
        return fallback
    if isinstance(value, str):
        return json.loads(value) if value else fallback
    return value


def _rename_or_merge_physical_column(bind, spec: RenameSpec) -> None:
    if not _table_exists(bind, spec.table):
        return
    for source in spec.sources:
        if source == spec.target or not _column_exists(bind, spec.table, source):
            continue
        table_q = _quote_ident(spec.table)
        source_q = _quote_ident(source)
        target_q = _quote_ident(spec.target)
        if _column_exists(bind, spec.table, spec.target):
            op.execute(
                f"UPDATE {table_q} "
                f"SET {target_q} = COALESCE({target_q}, {source_q}) "
                f"WHERE {target_q} IS NULL AND {source_q} IS NOT NULL"
            )
            op.execute(f"ALTER TABLE {table_q} DROP COLUMN IF EXISTS {source_q} CASCADE")
        else:
            op.execute(f"ALTER TABLE {table_q} RENAME COLUMN {source_q} TO {target_q}")


def _insert_target_metadata(bind, spec: RenameSpec) -> None:
    bind.execute(
        sa.text(
            """
            INSERT INTO table_columns (
                table_name, column_code, column_label, source_field_id, data_type,
                is_pk_part, is_sensitive, is_visible, display_order, auto_discovered,
                copy_from_last_month, enum_options, agg_role, is_computed,
                formula_expr, scope_role, global_field_id, description
            )
            VALUES (
                :table, :target, :label, :source_field_id, :data_type,
                false, false, :is_visible, 999, :auto_discovered,
                false, NULL, 'dimension', false,
                NULL, :scope_role, NULL, NULL
            )
            ON CONFLICT (table_name, column_code) DO NOTHING
            """
        ),
        {
            "table": spec.table,
            "target": spec.target,
            "label": spec.label,
            "source_field_id": spec.source_field_id,
            "data_type": spec.data_type,
            "is_visible": spec.is_visible,
            "auto_discovered": spec.auto_discovered,
            "scope_role": spec.scope_role,
        },
    )


def _canonicalize_target_metadata(bind, spec: RenameSpec) -> None:
    bind.execute(
        sa.text(
            """
            UPDATE table_columns
            SET column_label = :label,
                source_field_id = COALESCE(:source_field_id, source_field_id),
                data_type = :data_type,
                is_visible = :is_visible,
                auto_discovered = :auto_discovered,
                scope_role = :scope_role
            WHERE table_name = :table AND column_code = :target
            """
        ),
        {
            "table": spec.table,
            "target": spec.target,
            "label": spec.label,
            "source_field_id": spec.source_field_id,
            "data_type": spec.data_type,
            "is_visible": spec.is_visible,
            "auto_discovered": spec.auto_discovered,
            "scope_role": spec.scope_role,
        },
    )


def _rename_or_merge_metadata(bind, spec: RenameSpec) -> None:
    if not _metadata_exists(bind, spec.table, spec.target) and _column_exists(
        bind, spec.table, spec.target
    ):
        _insert_target_metadata(bind, spec)

    for source in spec.sources:
        if source == spec.target or not _metadata_exists(bind, spec.table, source):
            continue
        if _metadata_exists(bind, spec.table, spec.target):
            bind.execute(
                sa.text(
                    """
                    UPDATE table_columns AS dst
                    SET display_order = LEAST(dst.display_order, src.display_order),
                        is_pk_part = dst.is_pk_part OR src.is_pk_part,
                        is_sensitive = dst.is_sensitive OR src.is_sensitive,
                        global_field_id = COALESCE(dst.global_field_id, src.global_field_id),
                        description = COALESCE(dst.description, src.description)
                    FROM table_columns AS src
                    WHERE dst.table_name = :table
                      AND dst.column_code = :target
                      AND src.table_name = :table
                      AND src.column_code = :source
                    """
                ),
                {"table": spec.table, "source": source, "target": spec.target},
            )
            bind.execute(
                sa.text(
                    "DELETE FROM table_columns WHERE table_name = :table AND column_code = :source"
                ),
                {"table": spec.table, "source": source},
            )
        else:
            bind.execute(
                sa.text(
                    """
                    UPDATE table_columns
                    SET column_code = :target,
                        column_label = :label,
                        source_field_id = COALESCE(:source_field_id, source_field_id),
                        data_type = :data_type,
                        is_visible = :is_visible,
                        auto_discovered = :auto_discovered,
                        scope_role = :scope_role
                    WHERE table_name = :table AND column_code = :source
                    """
                ),
                {
                    "table": spec.table,
                    "source": source,
                    "target": spec.target,
                    "label": spec.label,
                    "source_field_id": spec.source_field_id,
                    "data_type": spec.data_type,
                    "is_visible": spec.is_visible,
                    "auto_discovered": spec.auto_discovered,
                    "scope_role": spec.scope_role,
                },
            )
    if _metadata_exists(bind, spec.table, spec.target):
        _canonicalize_target_metadata(bind, spec)


def _table_codes(bind, table: str) -> set[str]:
    rows = bind.execute(
        sa.text(
            """
            SELECT column_code FROM table_columns
            WHERE table_name = :table
            """
        ),
        {"table": table},
    ).all()
    return {str(row[0]) for row in rows}


def _physical_columns(bind, table: str) -> set[str]:
    rows = bind.execute(
        sa.text(
            """
            SELECT column_name
            FROM information_schema.columns
            WHERE table_schema = 'public' AND table_name = :table
            """
        ),
        {"table": table},
    ).all()
    return {str(row[0]) for row in rows}


def _drop_codes_for_table(bind, table: str) -> set[str]:
    out = set(EXPLICIT_DROPS.get(table, set()))
    out.update(code for code in _table_codes(bind, table) if HELPER_COLUMN_RE.match(code))
    out.update(code for code in _physical_columns(bind, table) if HELPER_COLUMN_RE.match(code))
    return out


def _drop_source_column_and_metadata(bind, table: str, code: str) -> None:
    if _column_exists(bind, table, code):
        op.execute(
            f"ALTER TABLE {_quote_ident(table)} DROP COLUMN IF EXISTS {_quote_ident(code)} CASCADE"
        )
    bind.execute(
        sa.text("DELETE FROM table_columns WHERE table_name = :table AND column_code = :code"),
        {"table": table, "code": code},
    )


def _rename_maps() -> dict[str, dict[str, str]]:
    out: dict[str, dict[str, str]] = {}
    for spec in RENAMES:
        table_map = out.setdefault(spec.table, {})
        for source in spec.sources:
            if source != spec.target:
                table_map[source] = spec.target
    return out


def _drop_maps(bind) -> dict[str, set[str]]:
    return {table: _drop_codes_for_table(bind, table) for table in EXPLICIT_DROPS}


def _remap_ref(
    ref: Any,
    *,
    alias_map: dict[str, str],
    default_table: str | None,
    renames: dict[str, dict[str, str]],
    drops: dict[str, set[str]],
) -> str | None:
    if not isinstance(ref, str):
        return ref
    if "." in ref:
        alias, code = ref.split(".", 1)
        table = alias_map.get(alias)
        if table:
            if code in drops.get(table, set()):
                return None
            target = renames.get(table, {}).get(code)
            return f"{alias}.{target}" if target else ref
    if default_table:
        if ref in drops.get(default_table, set()):
            return None
        return renames.get(default_table, {}).get(ref, ref)
    return ref


def _remap_ref_list(values: Any, **kwargs) -> list:
    out = []
    for value in values or []:
        next_value = _remap_ref(value, **kwargs)
        if next_value is not None:
            out.append(next_value)
    return out


def _remap_ref_dict_keys(value: Any, **kwargs) -> dict:
    out = {}
    for key, item in (value or {}).items():
        next_key = _remap_ref(key, **kwargs)
        if next_key is not None:
            out[next_key] = item
    return out


def _remap_report_config(
    cfg: dict,
    *,
    alias_map: dict[str, str],
    default_table: str | None,
    renames: dict[str, dict[str, str]],
    drops: dict[str, set[str]],
) -> dict:
    kwargs = {
        "alias_map": alias_map,
        "default_table": default_table,
        "renames": renames,
        "drops": drops,
    }
    cfg = dict(cfg or {})
    if isinstance(cfg.get("columns"), list):
        cfg["columns"] = _remap_ref_list(cfg["columns"], **kwargs)
    for item in cfg.get("filters", []) or []:
        if isinstance(item, dict) and item.get("column"):
            item["column"] = _remap_ref(item["column"], **kwargs)
    for item in cfg.get("sorts", []) or []:
        if isinstance(item, dict) and item.get("column"):
            item["column"] = _remap_ref(item["column"], **kwargs)
    for item in cfg.get("value_rules", []) or []:
        if not isinstance(item, dict):
            continue
        for key in ("target", "factor"):
            if item.get(key):
                item[key] = _remap_ref(item[key], **kwargs)
    split_rule = cfg.get("default_split_rule") or {}
    if isinstance(split_rule, dict) and split_rule.get("factor"):
        split_rule["factor"] = _remap_ref(split_rule["factor"], **kwargs)
    if isinstance(cfg.get("column_settings"), dict):
        cfg["column_settings"] = _remap_ref_dict_keys(cfg["column_settings"], **kwargs)
    if isinstance(cfg.get("aggregations"), dict):
        cfg["aggregations"] = _remap_ref_dict_keys(cfg["aggregations"], **kwargs)
    if isinstance(cfg.get("rounding_group_by"), list):
        cfg["rounding_group_by"] = _remap_ref_list(cfg["rounding_group_by"], **kwargs)

    transpose = cfg.get("transpose") or {}
    if isinstance(transpose, dict):
        for sub in ("column_to_row", "row_to_column"):
            block = transpose.get(sub) or {}
            if not isinstance(block, dict):
                continue
            for key in ("group_by", "source_cols", "pivot_values"):
                if isinstance(block.get(key), list):
                    block[key] = _remap_ref_list(block[key], **kwargs)
            for key in ("pivot_col", "value_col"):
                if block.get(key):
                    block[key] = _remap_ref(block[key], **kwargs)
        for rule in transpose.get("rules", []) or []:
            if not isinstance(rule, dict):
                continue
            for key in ("target", "source", "factor"):
                if rule.get(key):
                    rule[key] = _remap_ref(rule[key], **kwargs)
    return cfg


def _alias_maps(bind) -> dict[int, dict[str, str]]:
    rows = bind.execute(
        sa.text("SELECT dataset_id, table_name, alias FROM dataset_tables")
    ).all()
    out: dict[int, dict[str, str]] = {}
    for dataset_id, table_name, alias in rows:
        out.setdefault(int(dataset_id), {})[str(alias)] = str(table_name)
    return out


def _update_json_column(bind, table: str, column: str, row_id: int, payload: Any) -> None:
    bind.execute(
        sa.text(
            f"UPDATE {_quote_ident(table)} "
            f"SET {_quote_ident(column)} = CAST(:payload AS JSON) "
            "WHERE id = :id"
        ),
        {"payload": json.dumps(payload, ensure_ascii=False), "id": row_id},
    )


def _remap_dataset_calculated_fields(bind, renames, drops, aliases_by_dataset) -> None:
    field_re = re.compile(r'FIELD\(\s*"([^"]+)"\s*\)')
    rows = bind.execute(
        sa.text(
            "SELECT id, dataset_id, formula, formula_display, depends_on "
            "FROM dataset_calculated_fields"
        )
    ).all()
    for row_id, dataset_id, formula, formula_display, depends_on in rows:
        alias_map = aliases_by_dataset.get(int(dataset_id), {})
        kwargs = {
            "alias_map": alias_map,
            "default_table": None,
            "renames": renames,
            "drops": drops,
        }

        def repl(match):
            ref = _remap_ref(match.group(1), **kwargs)
            return 'FIELD("")' if ref is None else f'FIELD("{ref}")'

        next_formula = field_re.sub(repl, formula or "")
        next_display = field_re.sub(repl, formula_display or "") if formula_display else formula_display
        next_depends = _remap_ref_list(_json_load(depends_on, []), **kwargs)
        bind.execute(
            sa.text(
                """
                UPDATE dataset_calculated_fields
                SET formula = :formula,
                    formula_display = :formula_display,
                    depends_on = CAST(:depends_on AS JSON)
                WHERE id = :id
                """
            ),
            {
                "id": row_id,
                "formula": next_formula,
                "formula_display": next_display,
                "depends_on": json.dumps(next_depends, ensure_ascii=False),
            },
        )


def _remap_reports(bind, renames, drops, aliases_by_dataset) -> None:
    rows = bind.execute(sa.text("SELECT id, table_name, dataset_id, config FROM reports")).all()
    for row_id, table_name, dataset_id, config in rows:
        cfg = _remap_report_config(
            _json_load(config, {}),
            alias_map=aliases_by_dataset.get(int(dataset_id), {}) if dataset_id is not None else {},
            default_table=table_name if table_name in renames else None,
            renames=renames,
            drops=drops,
        )
        _update_json_column(bind, "reports", "config", int(row_id), cfg)


def _remap_allocation_schemes(bind, renames, drops, aliases_by_dataset) -> None:
    rows = bind.execute(
        sa.text("SELECT id, table_name, dataset_id, config FROM allocation_schemes")
    ).all()
    for row_id, table_name, dataset_id, config in rows:
        cfg = _remap_report_config(
            _json_load(config, {}),
            alias_map=aliases_by_dataset.get(int(dataset_id), {}) if dataset_id is not None else {},
            default_table=table_name if table_name in renames else None,
            renames=renames,
            drops=drops,
        )
        _update_json_column(bind, "allocation_schemes", "config", int(row_id), cfg)


def _remap_dataset_relations(bind, renames, drops, aliases_by_dataset) -> None:
    rows = bind.execute(
        sa.text("SELECT id, dataset_id, left_alias, right_alias, keys FROM dataset_relations")
    ).all()
    for row_id, dataset_id, left_alias, right_alias, keys in rows:
        alias_map = aliases_by_dataset.get(int(dataset_id), {})
        left_table = alias_map.get(str(left_alias))
        right_table = alias_map.get(str(right_alias))
        next_keys = []
        for key in _json_load(keys, []):
            if not isinstance(key, dict):
                continue
            left = key.get("left")
            right = key.get("right")
            if left_table and left in drops.get(left_table, set()):
                continue
            if right_table and right in drops.get(right_table, set()):
                continue
            next_key = dict(key)
            if left_table:
                next_key["left"] = renames.get(left_table, {}).get(left, left)
            if right_table:
                next_key["right"] = renames.get(right_table, {}).get(right, right)
            next_keys.append(next_key)
        _update_json_column(bind, "dataset_relations", "keys", int(row_id), next_keys)


def _remap_push_targets(bind, renames, drops) -> None:
    rows = bind.execute(
        sa.text("SELECT id, source_table, field_mappings FROM push_targets")
    ).all()
    for row_id, source_table, field_mappings in rows:
        table = str(source_table)
        if table not in renames and table not in drops:
            continue
        next_items = []
        for item in _json_load(field_mappings, []):
            if not isinstance(item, dict):
                continue
            source = item.get("source")
            if source in drops.get(table, set()):
                continue
            next_item = dict(item)
            if source in renames.get(table, {}):
                next_item["source"] = renames[table][source]
            next_items.append(next_item)
        _update_json_column(bind, "push_targets", "field_mappings", int(row_id), next_items)


def _remap_table_column_formulas(bind, renames) -> None:
    rows = bind.execute(
        sa.text(
            """
            SELECT id, table_name, formula_expr
            FROM table_columns
            WHERE formula_expr IS NOT NULL
            """
        )
    ).all()
    for row_id, table_name, formula_expr in rows:
        next_formula = str(formula_expr or "")
        for source, target in renames.get(str(table_name), {}).items():
            next_formula = next_formula.replace(f"[{source}]", f"[{target}]")
        if next_formula != formula_expr:
            bind.execute(
                sa.text("UPDATE table_columns SET formula_expr = :formula WHERE id = :id"),
                {"formula": next_formula, "id": row_id},
            )


def upgrade() -> None:
    bind = op.get_bind()
    if not _table_exists(bind, "table_columns"):
        return

    renames = _rename_maps()
    drops = _drop_maps(bind)
    aliases_by_dataset = _alias_maps(bind)

    for spec in RENAMES:
        _rename_or_merge_physical_column(bind, spec)
        _rename_or_merge_metadata(bind, spec)

    for table in EXPLICIT_DROPS:
        if not _table_exists(bind, table):
            continue
        for code in sorted(drops.get(table, set())):
            _drop_source_column_and_metadata(bind, table, code)

    _remap_table_column_formulas(bind, renames)
    _remap_dataset_calculated_fields(bind, renames, drops, aliases_by_dataset)
    _remap_reports(bind, renames, drops, aliases_by_dataset)
    _remap_allocation_schemes(bind, renames, drops, aliases_by_dataset)
    _remap_dataset_relations(bind, renames, drops, aliases_by_dataset)
    _remap_push_targets(bind, renames, drops)


def downgrade() -> None:
    # Canonical field-code alignment is intentionally not reversed.
    pass
