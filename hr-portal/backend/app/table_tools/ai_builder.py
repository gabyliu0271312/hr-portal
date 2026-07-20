"""AI 辅助建模板：两步聚类 → 草稿 JSON（不存库，返回前端确认）。

本模块是 table_merge.suggest_mapping 能力的 service 层(对标 codegen/service.py):
capability 注册 / 策略闸门 / 输出 deny / 审计由 router 的 /ai-draft 统一把关(走 004 底座),
此处只负责"组 prompt → 调 provider → 出草稿"。只发表头列名给模型,明细行不进上下文(spec §4.8)。

Step 1: 把所有文件/sheet 的表头列丢给 AI，聚类出标准字段列表。
Step 2: 对每个 sheet，让 AI 把它的列映射到标准字段，识别主键 + 派生字段。

返回的 draft 结构与 TemplateIn/SourceMappingIn 完全兼容，前端确认后直接 POST /templates。
"""
from __future__ import annotations

import asyncio
import json
import logging
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.ai.models import AiProviderConfig
from app.ai.provider import generate_json_openai_compatible
from app.core.secret_box import decrypt
from app.table_tools.engine import parse_header

import openpyxl
import io

logger = logging.getLogger(__name__)


# ── 读表头 ──────────────────────────────────────────────────────────────────

def _extract_headers_from_blob(name: str, data: bytes) -> list[dict]:
    """从单个 Excel 文件提取所有有效 sheet 的表头（最多 3 行合并后扁平列名）。"""
    try:
        wb = openpyxl.load_workbook(io.BytesIO(data), data_only=True)
    except Exception:
        return []

    results = []
    for sheet_name in wb.sheetnames:
        ws = wb[sheet_name]
        # 探测表头：试多组 (start, end) 组合，用不重复列名数打分。
        # 这样可以跳过整行合并的"单笔缴存清单"式标题行——它们的 distinct 列名数=1。
        best_header: list[str] = []
        best_start = 1
        best_end = 1
        best_score = -1
        for start in (1, 2, 3, 4):
            for end in range(start, start + 3):
                h = parse_header(ws, start, end)
                flat = [c for c in h if c]
                score = len(set(flat))
                if score > best_score:
                    best_score = score
                    best_header = flat
                    best_start = start
                    best_end = end
        if len(set(best_header)) < 2:
            continue
        results.append({
            "file": name,
            "sheet": sheet_name,
            "header_start": best_start,
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
    return api_key, row.base_url, model, max(int(row.timeout_seconds or 30), 180)


# ── AI 调用重试(中转商间歇 504/超时,瞬时错误重试可救回) ──────────────────────

async def _gen_json_with_retry(*, retries: int = 2, **kwargs) -> tuple[dict, Any]:
    """包装 generate_json_openai_compatible:对瞬时错误(网关 5xx/超时)重试。
    aiapi.uu.cc 中转间歇返回 504/网关错误,单次重试大概率成功。"""
    import httpx
    last_exc: Exception | None = None
    for attempt in range(retries + 1):
        try:
            return await generate_json_openai_compatible(**kwargs)
        except (httpx.HTTPStatusError, httpx.TimeoutException, httpx.TransportError) as e:
            last_exc = e
            if attempt < retries:
                await asyncio.sleep(1.5 * (attempt + 1))
                continue
            raise
    raise last_exc  # 不会到这,satisfy 类型


# ── Step 1: 聚类标准字段 ─────────────────────────────────────────────────────

_STEP1_SYSTEM = """\
你是数据整合专家。用户提供多个 Excel sheet 的列名列表，你需要：
1. 分析所有列名，识别语义相同/近似的列（跨 sheet/文件可能叫法不同）。
2. 归纳出一份「标准字段列表」（std_fields），每个标准字段是业务层面唯一的含义。
3. 标准字段名用中文，尽量精简（不超过 10 字），避免冗余（如"个人养老"和"养老个人"统一为一个）。
4. 忽略序号、备注、合计行等元数据列，不纳入标准字段。
5. 同时识别：哪些列是人员主键（姓名/工号/证件号等身份列）。

重要——合并粒度：
- 默认积极合并同类列，不要为每一个源列都建一个标准字段；标准字段总数应尽量精简。
- 若用户提供了「业务背景」，**以业务背景描述的口径和粒度为最高优先级**：用户说要哪些字段、合并到什么程度，就严格照办（如用户要求"按类别只保留个人与单位两项"，则同类的基数/比例/明细等细分列都归并掉，不单独建字段）。
- 没有业务背景时，按通用常识合并到"够用的最粗粒度"，宁可少而准，细分留待用户在确认环节补充。

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

    result, _ = await _gen_json_with_retry(
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

def _coerce_confidence(raw: Any) -> float:
    """AI 返回的 confidence 可能是数值、字符串,甚至是 {列名:分} 的 dict。
    统一规范成单一浮点:dict 取其数值均值,无法解析则兜底 0.8。"""
    if isinstance(raw, (int, float)):
        return float(raw)
    if isinstance(raw, str):
        try:
            return float(raw)
        except ValueError:
            return 0.8
    if isinstance(raw, dict):
        nums = [float(v) for v in raw.values() if isinstance(v, (int, float))]
        return sum(nums) / len(nums) if nums else 0.8
    return 0.8

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
- 如果一列需要计算才能得到标准字段,用 derived_fields,表达式用 {列名} 占位符引用源列。
  派生表达式支持四则运算与公式函数:IF / AND / OR / ROUND / MIN / MAX / SUM / ABS / CONCAT 等。
  例:
    基数×比例:        {"target":"公积金个人","expr":"{缴存基数}*{个人缴存比例}","round":2}
    封顶取小:          {"target":"医疗公司","expr":"MIN({医疗基数}*0.08, 5000)","round":2}
    条件取值:          {"target":"补贴","expr":"IF({工龄}>=10, 1000, 500)"}
- 无法识别的列不要强行映射，confidence 相应降低。
- column_map / derived_fields 的目标只能用给定 std_fields 里的字段，不要自创新标准字段。
- 若提供了用户业务背景，映射口径须与其一致。
- 禁止 markdown/解释文字，只返回 JSON。
"""


async def _step2_map_sheet(
    sheet_info: dict,
    std_fields: list[str],
    merge_keys: list[str],
    api_key: str, base_url: str | None, model: str, timeout: int,
    business_context: str = "",
) -> dict:
    context_line = (
        f"用户业务背景（最高优先级,映射口径以此为准）：{business_context}\n\n"
        if business_context.strip() else ""
    )
    user_msg = (
        f"{context_line}"
        f"标准字段列表：{json.dumps(std_fields, ensure_ascii=False)}\n"
        f"人员主键：{json.dumps(merge_keys, ensure_ascii=False)}\n\n"
        f"Sheet：【{sheet_info['file']} / {sheet_info['sheet']}】\n"
        f"列名：{', '.join(sheet_info['columns'])}"
    )
    result, _ = await _gen_json_with_retry(
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
        "header_start": sheet_info.get("header_start", 1),
        "header_end": sheet_info["header_end"],
        "key_map": result.get("key_map") or {},
        "column_map": result.get("column_map") or {},
        "derived_fields": result.get("derived_fields") or [],
        "derive_check": None,  # 禁用 AI 生成的拆分校验，社保文件四舍五入差异会产生大量误报
        "skip_tokens": result.get("skip_tokens") or ["合计", "小计", "总计"],
        "_confidence": _coerce_confidence(result.get("confidence")),
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

    # Step 2: 并发映射所有 sheet（10 并发,缩短全量文件总耗时,避免撞前端/反代超时）
    semaphore = asyncio.Semaphore(10)

    async def _map_with_sem(sheet_info: dict) -> dict:
        async with semaphore:
            return await _step2_map_sheet(
                sheet_info, std_fields, merge_keys, api_key, base_url, model, timeout,
                business_context,
            )

    # return_exceptions=True:某个 sheet 的 AI 调用失败(中转 504/400 等)不拖垮整体,
    # 失败 sheet 降级为空映射 + 标红低置信,交人工补,其余 sheet 正常产出。
    raw_results = await asyncio.gather(
        *[_map_with_sem(h) for h in all_headers], return_exceptions=True
    )
    mappings: list[dict] = []
    failed_sheets: list[dict] = []
    for h, res in zip(all_headers, raw_results):
        if isinstance(res, Exception):
            failed_sheets.append({"sheet": f"{h['file']} / {h['sheet']}", "error": str(res)})
            mappings.append({
                "name": f"{h['file']} / {h['sheet']}",
                "match_signature": h["columns"][:5],
                "sheet_kw": h["sheet"],
                "header_start": h.get("header_start", 1),
                "header_end": h["header_end"],
                "key_map": {}, "column_map": {}, "derived_fields": [],
                "derive_check": None, "skip_tokens": ["合计", "小计", "总计"],
                "_confidence": 0.0,
                "_notes": f"AI 调用失败,请手工配置该表映射:{res}",
            })
        else:
            mappings.append(res)
    logger.info(
        "table_merge build_draft: %d sheets, %d std_fields, %d mappings, %d failed",
        len(all_headers), len(std_fields), len(mappings), len(failed_sheets),
    )
    if failed_sheets and len(failed_sheets) == len(all_headers):
        # 全部 sheet 都失败 → AI 服务整体不可用,直接报错让用户重试
        raise ValueError(
            f"AI 服务暂时不可用(全部 {len(all_headers)} 个表识别失败),请稍后重试。"
            f"首个错误:{failed_sheets[0]['error']}"
        )

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
            "failed_sheets": failed_sheets,
            "low_confidence": [
                {"sheet": m["name"], "confidence": m["_confidence"], "notes": m["_notes"]}
                for m in mappings if _coerce_confidence(m.get("_confidence", 1.0)) < 0.85
            ],
        },
    }

async def build_mapping_drafts(
    files: list[tuple[str, bytes]],
    std_fields: list[str],
    merge_keys: list[str],
    business_context: str,
    db: AsyncSession,
) -> list[dict]:
    """为既有模板的多个样表生成源映射草稿，不修改模板级字段。"""
    headers = _collect_all_headers(files)
    if not headers:
        raise ValueError("未从上传文件中解析到有效表头")

    api_key, base_url, model, timeout = await _get_ai_config(db)
    semaphore = asyncio.Semaphore(10)

    async def map_sheet(sheet_info: dict) -> dict:
        async with semaphore:
            return await _step2_map_sheet(
                sheet_info, std_fields, merge_keys, api_key, base_url, model, timeout, business_context,
            )

    raw_results = await asyncio.gather(*(map_sheet(header) for header in headers), return_exceptions=True)
    mappings: list[dict] = []
    for header, result in zip(headers, raw_results):
        if isinstance(result, Exception):
            mappings.append({
                "name": f"{header['file']} / {header['sheet']}",
                "match_signature": header["columns"][:5],
                "sheet_kw": header["sheet"],
                "header_start": header.get("header_start", 1),
                "header_end": header["header_end"],
                "key_map": {},
                "column_map": {},
                "derived_fields": [],
                "derive_check": None,
                "skip_tokens": ["合计", "小计", "总计"],
                "_confidence": 0.0,
                "_notes": f"AI 调用失败，请手工确认该映射：{result}",
            })
        else:
            mappings.append(result)
    return mappings

async def build_mapping_draft(
    sheet_info: dict,
    std_fields: list[str],
    merge_keys: list[str],
    business_context: str,
    db: AsyncSession,
) -> dict:
    """为既有模板的一张源表生成映射建议；模板字段和主键不可被 AI 改写。"""
    api_key, base_url, model, timeout = await _get_ai_config(db)
    return await _step2_map_sheet(
        sheet_info, std_fields, merge_keys, api_key, base_url, model, timeout,
        business_context,
    )