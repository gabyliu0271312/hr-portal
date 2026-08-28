import asyncio
import io

import openpyxl

from app.table_tools import engine
from app.table_tools import router as table_routes
from app.table_tools.models import MergeDwdRelation, MergeTemplate


def _template() -> MergeTemplate:
    template = MergeTemplate(
        id=1,
        name="template",
        merge_keys=["证件号码"],
        std_fields=["金额"],
        aggregate="sum",
    )
    template.dwd_relations.append(MergeDwdRelation(
        id=1,
        template_id=1,
        name="DWD 关联",
        dataset_id=16,
        left_fields=["证件号码"],
        right_fields=["dwd_current.id_number"],
        select_fields=["dwd_current.corporate_email"],
        enabled=True,
    ))
    return template


def test_run_template_merge_places_dwd_columns_before_source_and_returns_labels(monkeypatch):
    template = _template()

    async def functions(_db):
        return {}

    monkeypatch.setattr(table_routes, "executable_functions", functions)
    monkeypatch.setattr(table_routes.engine, "run_merge", lambda *_args: {
        "rows": [{"证件号码": "110", "金额": 1, "来源": "源表"}],
        "columns": ["证件号码", "金额", "来源"],
        "recognize_log": [], "anomalies": [], "stats": {},
        "key_mapping_stats": {}, "raw_key_traces": [],
    })

    async def apply_relation(rows, *_args):
        return [{**row, "dwd_current.corporate_email": "a@example.com"} for row in rows], []

    async def list_fields(*_args):
        return [{"code": "dwd_current.corporate_email", "label": "企业邮箱"}]

    monkeypatch.setattr(table_routes, "apply_dwd_relation", apply_relation)
    monkeypatch.setattr(table_routes, "list_dwd_fields_by_dataset", list_fields)

    result = asyncio.run(table_routes._run_template_merge(
        template, [], object(), object(), relations=list(template.dwd_relations)
    ))

    assert result["columns"] == ["证件号码", "金额", "dwd_current.corporate_email", "来源"]
    assert result["column_labels"] == {"dwd_current.corporate_email": "企业邮箱"}


def test_rows_to_xlsx_uses_codes_for_values_and_labels_for_headers():
    content = engine.rows_to_xlsx(
        ["dwd_current.corporate_email", "dwd_current.personal_email"],
        [{
            "dwd_current.corporate_email": "work@example.com",
            "dwd_current.personal_email": "personal@example.com",
        }],
        column_headers=["企业邮箱", "个人邮箱"],
    )

    sheet = openpyxl.load_workbook(io.BytesIO(content)).active

    assert [cell.value for cell in sheet[1]] == ["企业邮箱", "个人邮箱"]
    assert [cell.value for cell in sheet[2]] == ["work@example.com", "personal@example.com"]
