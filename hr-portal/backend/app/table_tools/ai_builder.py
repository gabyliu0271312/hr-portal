"""AI 辅助建模板：两步聚类 → 草稿 JSON（不存库，返回前端确认）。

Step 1: 把所有文件/sheet 的表头列丢给 AI，聚类出标准字段列表。
Step 2: 对每个 sheet，让 AI 把它的列映射到标准字段，识别主键 + 派生字段。

返回的 draft 结构与 TemplateIn/SourceMappingIn 完全兼容，前端确认后直接 POST /templates。
"""
from __future__ import annotations

import json
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.ai.models import AiProviderConfig
from app.ai.provider import generate_json_openai_compatible
from app.core.secret_box import decrypt
from app.table_tools.engine import parse_header

import openpyxl
import io


# ── 读表头 ──────────────────────────────────────────────────────────────────

def _extract_headers_from_blob(name: str, data: bytes) -> list[dict]:
    """从单个 Excel 文件提取所有有效 sheet 的表头（最多 3 行合并后扁平列名）。"""
    try:
        wb = openpyxl.load_workbook(io.BytesIO(data), read_only=True, data_only=True)
    except Exception:
        return []

    results = []
    for sheet_name in wb.sheetnames:
        ws = wb[sheet_name]
        # 探测：尝试 1/2/3 行表头，取非空列最多的那个
        best_header: list[str] = []
        best_end = 1
        for end in (1, 2, 3):
            h = parse_header(ws, 1, end)
            flat = [c for c in h if c]
            if len(flat) > len(best_header):
                best_header = flat
                best_end = end
        if len(best_header) < 2:
            continue
        results.append({
            "file": name,
            "sheet": sheet_name,
            "header_end": best_end,
            "columns": best_header,
        })
    return results


def _collect_all_headers(files: list[tuple[str, bytes]]) -> list[dict]:
    """汇总所有文件的 sheet 表头。"""
    all_headers: list[dict] = []
    for name, data in files:
        all_headers.extend(_extract_headers_from_blob(name, data))
    return all_headers


# ── 获取 AI 配置 ─────────────────────────────────────────────────────────────

async def _get_ai_config(db: AsyncSession) -> tuple[str, str | None, str, int]:
    """返回 (api_key, base_url, model, timeout)。优先 model_fast_json，fallback model_reasoning。"""
    row: AiProviderConfig | None = (
        await db.execute(
            select(AiProviderConfig).where(AiProviderConfig.is_enabled == True).limit(1)
        )
    ).scalar_one_or_none()
    if row is None:
        raise ValueError("未配置启用的 AI 服务，请先在 AI 设置中配置并启用")
    api_key = decrypt(row.api_key_encrypted or "")
    if not api_key:
        raise ValueError("AI 服务 API Key 未配置或解密失败")
    model = row.model_fast_json or row.model_reasoning or "gpt-4o-mini"
    return api_key, row.base_url, model, int(row.timeout_seconds or 30)


# ── Step 1: 聚类标准字段 ─────────────────────────────────────────────────────

_STEP1_SYSTEM = """\
你是数据整合专家。用户提供多个 Excel sheet 的列名列表，你需要：
1. 分析所有列名，识别语义相同/近似的列（跨 sheet/文件可能叫法不同）。
2. 归纳出一份「标准字段列表」（std_fields），每个标准字段是业务层面唯一的含义。
3. 标准字段名用中文，尽量精简（不超过 10 字），避免冗余（如"个人养老"和"养老个人"统一为一个）。
4. 忽略序号、备注、合计行等元数据列，不纳入标准字段。
5. 同时识别：哪些列是人员主键（姓名/工号/证件号等身份列）。

返回严格合法的 JSON，格式如下（禁止 markdown/解释文字）：
{
  "std_fields": ["标准字段1", "标准字段2", ...],
  "suggested_merge_keys": ["姓名", "证件号码"]
}
"""


async def _step1_cluster_fields(
    all_headers: list[dict],
    business_context: str,
    api_key: str, base_url: str | None, model: str, timeout: int,
) -> tuple[list[str], list[str]]:
    sheets_summary = []
    for h in all_headers:
        sheets_summary.append(f"【{h['file']} / {h['sheet']}】: {', '.join(h['columns'])}")

    context_line = f"\n业务背景（用户提供）：{business_context}" if business_context.strip() else ""
    user_msg = f"以下是所有 Excel sheet 的列名：\n\n" + "\n".join(sheets_summary) + context_line

    result, _ = await generate_json_openai_compatible(
        api_key=api_key, base_url=base_url, model=model,
        messages=[
            {"role": "system", "content": _STEP1_SYSTEM},
            {"role": "user", "content": user_msg},
        ],
        timeout=timeout,
        repair_instructions='Return {"std_fields": [...], "suggested_merge_keys": [...]}',
    )
    std_fields = result.get("std_fields") or []
    merge_keys = result.get("suggested_merge_keys") or ["姓名", "证件号码"]
    return [str(f) for f in std_fields], [str(k) for k in merge_keys]


# ── Step 2: 逐 sheet 生成映射 ────────────────────────────────────────────────

_STEP2_SYSTEM = """\
你是 Excel 数据映射专家。给你：
- 标准字段列表（std_fields）
- 人员主键列（merge_keys）
- 一个 Excel sheet 的所有列名

你需要为该 sheet 输出映射方案，返回严格合法的 JSON：
{
  "key_map": {"源列名": "标准主键名", ...},
  "column_map": {"源列名": "标准字段名", ...},
  "derived_fields": [
    {"target": "标准字段名", "expr": "{源列A}*{源列B}", "round": 2}
  ],
  "derive_check": null 或 {"sum_of": ["字段A","字段B"], "equals_col": "原始合计列名", "tol": 0.05},
  "skip_tokens": ["合计", "小计", "总计"],
  "confidence": 0.95,
  "notes": "简短说明，列出置信度低/有歧义的映射"
}

规则：
- key_map 只映射 merge_keys 里的主键列；column_map 只映射可以直接对应标准字段的列。
- 如果一列需要与另一列相乘/相加才能得到标准字段（如 基数×比例=公积金），用 derived_fields，表达式用 {列名} 占位符。
- 无法识别的列不要强行映射，confidence 相应降低。
- 禁止 markdown/解释文字，只返回 JSON。
"""


async def _step2_map_sheet(
    sheet_info: dict,
    std_fields: list[str],
    merge_keys: list[str],
    api_key: str, base_url: str | None, model: str, timeout: int,
) -> dict:
    user_msg = (
        f"标准字段列表：{json.dumps(std_fields, ensure_ascii=False)}\n"
        f"人员主键：{json.dumps(merge_keys, ensure_ascii=False)}\n\n"
        f"Sheet：【{sheet_info['file']} / {sheet_info['sheet']}】\n"
        f"列名：{', '.join(sheet_info['columns'])}"
    )
    result, _ = await generate_json_openai_compatible(
        api_key=api_key, base_url=base_url, model=model,
        messages=[
            {"role": "system", "content": _STEP2_SYSTEM},
            {"role": "user", "content": user_msg},
        ],
        timeout=timeout,
        repair_instructions='Return mapping JSON with key_map, column_map, derived_fields, derive_check, skip_tokens, confidence, notes',
    )
    return {
        "name": f"{sheet_info['file']} / {sheet_info['sheet']}",
        "match_signature": sheet_info["columns"][:5],  # 取前5列作为识别签名
        "sheet_kw": sheet_info["sheet"],
        "header_start": 1,
        "header_end": sheet_info["header_end"],
        "key_map": result.get("key_map") or {},
        "column_map": result.get("column_map") or {},
        "derived_fields": result.get("derived_fields") or [],
        "derive_check": result.get("derive_check"),
        "skip_tokens": result.get("skip_tokens") or ["合计", "小计", "总计"],
        "_confidence": result.get("confidence", 0.8),
        "_notes": result.get("notes", ""),
    }


# ── 主入口 ───────────────────────────────────────────────────────────────────

async def build_draft(
    files: list[tuple[str, bytes]],
    business_context: str,
    db: AsyncSession,
) -> dict[str, Any]:
    """
    输入：上传文件列表 + 可选业务背景句
    输出：草稿 dict，结构兼容 TemplateIn + 附带 _confidence/_notes 供前端标红

    不存库，调用方(router)拿到后直接 return 给前端确认。
    """
    # 提取全部表头
    all_headers = _collect_all_headers(files)
    if not all_headers:
        raise ValueError("未能从上传文件中解析出任何有效表头，请确认文件格式正确")

    api_key, base_url, model, timeout = await _get_ai_config(db)

    # Step 1: 聚类标准字段
    std_fields, merge_keys = await _step1_cluster_fields(
        all_headers, business_context, api_key, base_url, model, timeout
    )
    if not std_fields:
        raise ValueError("AI 未能识别出标准字段，请补充业务背景后重试")

    # Step 2: 逐 sheet 映射（串行，避免 LLM 并发限速）
    mappings = []
    for sheet_info in all_headers:
        mapping = await _step2_map_sheet(
            sheet_info, std_fields, merge_keys, api_key, base_url, model, timeout
        )
        mappings.append(mapping)

    return {
        "name": "",
        "description": "",
        "merge_keys": merge_keys,
        "std_fields": std_fields,
        "aggregate": "sum",
        "mappings": mappings,
        "_meta": {
            "sheets_found": len(all_headers),
            "files": list({h["file"] for h in all_headers}),
            "low_confidence": [
                {"sheet": m["name"], "confidence": m["_confidence"], "notes": m["_notes"]}
                for m in mappings if m.get("_confidence", 1.0) < 0.85
            ],
        },
    }
