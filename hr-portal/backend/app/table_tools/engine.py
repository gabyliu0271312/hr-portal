"""通用归集引擎 —— 零业务字段。

只认抽象动作:解析多行表头(合并填充)、按映射搬列、按表达式派生、
按主键归集、按口径聚合、校验、标来源。完全不知道"养老""公积金"为何物。

所有业务语义来自运行时传入的 mapping 配置(模板库),不写死在此。

派生字段求值复用公共公式引擎 app.ai_formula(报表/数据集同款),
支持 IF/ROUND/MIN/MAX/SUM/CALC_TAX 等全套函数。派生表达式用 {列名} 占位,
内部转成引擎原生的 FIELD("列名") 求值。
"""
from __future__ import annotations

import re
from collections import defaultdict
from typing import Any, Callable

import openpyxl

from app.ai_formula.formula_evaluator import evaluate_formula


# ── 表头解析 ────────────────────────────────────────────────
def _fill_merged(ws) -> dict[tuple[int, int], Any]:
    """合并单元格:把左上角值填充到区域内每个坐标。"""
    vals: dict[tuple[int, int], Any] = {}
    for rng in ws.merged_cells.ranges:
        v = ws.cell(rng.min_row, rng.min_col).value
        for r in range(rng.min_row, rng.max_row + 1):
            for c in range(rng.min_col, rng.max_col + 1):
                vals[(r, c)] = v
    return vals


def parse_header(ws, start_row: int, end_row: int) -> list[str | None]:
    """解析 [start_row, end_row] 区间的多行表头,逐列拼接去重。

    返回每列的有效表头名(空列为 None)。1-based 行号。
    """
    merged = _fill_merged(ws)
    cols: list[str | None] = []
    for c in range(1, ws.max_column + 1):
        parts: list[str] = []
        for r in range(start_row, end_row + 1):
            v = merged.get((r, c), ws.cell(r, c).value)
            if v is not None and str(v).strip():
                parts.append(str(v).strip())
        cols.append("/".join(dict.fromkeys(parts)) if parts else None)
    return cols


def sheet_headers(ws, header_rows_candidates: set[tuple[int, int]]) -> dict[tuple[int, int], list[str | None]]:
    """对一个 sheet,按多组候选表头行区间各解析一次(供识别匹配用)。"""
    return {hr: parse_header(ws, *hr) for hr in header_rows_candidates}


# ── 通用表达式求值(派生字段) ───────────────────────────────
_PLACEHOLDER_RE = re.compile(r"\{([^{}]+)\}")


def _to_field_calls(expr: str) -> tuple[str, list[str]]:
    """把派生表达式里的 {列名} 占位转成引擎原生 FIELD("列名")。

    返回 (转换后表达式, 引用的列名列表)。列名原样保留(含中文/括号/斜杠),
    FIELD 的参数是字面量字符串,引擎按字符串向 resolver 取值,无需归一化。
    """
    refs: list[str] = []

    def repl(m: re.Match) -> str:
        name = m.group(1).strip()
        refs.append(name)
        # 列名可能含双引号(罕见),用单引号包裹规避;FIELD 正则两种引号都认
        quote = "'" if '"' in name else '"'
        return f"FIELD({quote}{name}{quote})"

    return _PLACEHOLDER_RE.sub(repl, expr), refs


def eval_derived(
    expr: str,
    getval: Callable[[str], Any],
    custom_functions: dict[str, Callable[..., Any]] | None = None,
) -> Any:
    """派生字段求值:{列名} 占位 → 公共公式引擎(支持 IF/ROUND/MIN/MAX/自定义函数)。

    任一引用列在本行无值(该 sheet 无此字段)时返回 None,由调用方决定跳过。
    """
    converted, refs = _to_field_calls(expr)
    if any(getval(name) in (None, "") for name in refs):
        return None
    return evaluate_formula(
        converted,
        field_resolver=getval,
        custom_functions=custom_functions,
    )


# ── 行级工具 ────────────────────────────────────────────────
def is_skip_row(rowvals: list[Any], key_idx: list[int], skip_tokens: list[str]) -> bool:
    """跳过合计/空行:主键列全空,或含合计字样。"""
    kv = [rowvals[i] for i in key_idx if i is not None and i < len(rowvals)]
    if not any(v is not None and str(v).strip() for v in kv):
        return True
    for v in kv:
        if v and any(t in str(v) for t in skip_tokens):
            return True
    return False


# ── 单 sheet 解析为标准记录 ─────────────────────────────────
def extract_records(
    ws,
    header: list[str | None],
    mapping: dict,
    custom_functions: dict[str, Callable[..., Any]] | None = None,
) -> tuple[list[dict], list[dict]]:
    """按一份 source_mapping 把一个 sheet 解析成标准记录列表。

    mapping 关键字段:
      key_map      源列→标准主键列
      column_map   源列→标准字段(直接搬)
      derived_fields  [{target, expr, round}]  派生(公共公式引擎,{列名} 占位)
      derive_check {sum_of, equals_col, tol}   拆分校验
      header (start,end)  表头行区间
      skip_tokens  合计行关键词
    custom_functions: 公共引擎可执行函数库(IF/ROUND/CALC_TAX 等),由调用方注入。
    返回 (records, anomalies)
    """
    col_idx = {h: i for i, h in enumerate(header) if h}
    key_map: dict[str, str] = mapping["key_map"]
    skip_tokens = mapping.get("skip_tokens", ["合计", "小计", "总计"])
    key_idx = [col_idx.get(k) for k in key_map]
    data_start = mapping["header"][1] + 1

    records: list[dict] = []
    anomalies: list[dict] = []

    def getcol(name: str):
        i = col_idx.get(name)
        return ws.cell(_r, i + 1).value if i is not None else None

    for _r in range(data_start, ws.max_row + 1):
        rowvals = [ws.cell(_r, c + 1).value for c in range(len(header))]
        if is_skip_row(rowvals, [i for i in key_idx if i is not None], skip_tokens):
            continue
        rec: dict[str, Any] = {}
        # 主键
        for srcname, stdname in key_map.items():
            i = col_idx.get(srcname)
            if i is None or rowvals[i] is None:
                rec[stdname] = ""
            else:
                v = rowvals[i]
                # Excel 常把身份证号存成数字(float)，str() 会得到科学计数法，需转回整数字符串
                if isinstance(v, float) and v == int(v):
                    rec[stdname] = str(int(v))
                else:
                    rec[stdname] = str(v).strip()
        if not any(rec.get(v) for v in key_map.values()):
            continue
        # 直接映射（跳过已被 key_map 赋值的主键列，避免 float() 覆盖字符串主键）
        key_std_fields = set(key_map.values())
        for srcname, stdname in mapping.get("column_map", {}).items():
            if stdname in key_std_fields:
                continue
            i = col_idx.get(srcname)
            if i is None:
                continue
            val = rowvals[i]
            if val is None or str(val).strip() == "":
                continue
            try:
                val = float(val)
            except (ValueError, TypeError):
                pass
            rec[stdname] = val
        # 派生(公共公式引擎:支持 IF/ROUND/MIN/MAX/CALC_TAX 等)
        derived: dict[str, Any] = {}
        for d in mapping.get("derived_fields", []):
            v = eval_derived(d["expr"], getcol, custom_functions)
            if v is None or v == "":
                # 引用列在该 sheet 无值时静默跳过,不计入异常
                continue
            if isinstance(v, (int, float)) and "round" in d:
                v = round(v, d.get("round", 2))
            derived[d["target"]] = v
            rec[d["target"]] = v
        # 拆分校验
        chk = mapping.get("derive_check")
        if chk and all(t in derived for t in chk["sum_of"]):
            total = getcol(chk["equals_col"])
            try:
                total = float(total)
                s = sum(float(derived[t]) for t in chk["sum_of"])
                if abs(s - total) > chk.get("tol", 0.05):
                    anomalies.append({"type": "拆分校验不符", "key": rec, "detail": f"和{s} vs 合计{total}"})
            except (ValueError, TypeError):
                pass
        records.append(rec)
    return records, anomalies


# ── 按主键归集 + 聚合 ───────────────────────────────────────
def aggregate_records(
    records_with_src: list[tuple[dict, str]],
    merge_keys: list[str],
    std_fields: list[str],
    agg: str = "sum",
) -> tuple[list[dict], list[dict]]:
    """把多源记录按 merge_keys 归集成一行一人。

    agg="sum": 数值累加;非数值取首个非空。
    agg="conflict": 不一致则报异常(保留首值)。
    返回 (rows, anomalies)
    """
    person: dict[tuple, dict] = {}
    person_src: dict[tuple, list[str]] = defaultdict(list)
    anomalies: list[dict] = []

    for rec, src in records_with_src:
        # 主键统一转字符串:不同来源对同一字段可能写入 str/float 混合类型
        # (如证件号被误归到 column_map 会被 float() 转换),不统一会导致
        # sorted() 报 TypeError,也会导致同一人在不同来源里因类型不同而对不上。
        pk = tuple(str(int(rec.get(k, 0))) if isinstance(rec.get(k), float) and rec.get(k) == int(rec.get(k)) else str(rec.get(k, "")).strip() for k in merge_keys)
        if not any(pk):
            continue
        cur = person.setdefault(pk, {k: rec.get(k, "") for k in merge_keys})
        person_src[pk].append(src)
        for f in std_fields:
            if f not in rec:
                continue
            val = rec[f]
            if val is None or val == "":
                continue
            prev = cur.get(f)
            if isinstance(val, (int, float)):
                if isinstance(prev, (int, float)):
                    if agg == "conflict" and abs(prev - val) > 0.01:
                        anomalies.append({"type": "金额冲突", "key": dict(zip(merge_keys, pk)),
                                          "detail": f"{f}: {prev} vs {val}"})
                    else:
                        cur[f] = prev + val
                else:
                    cur[f] = val
            else:
                if prev in (None, ""):
                    cur[f] = val

    rows: list[dict] = []
    for pk in sorted(person):
        row = dict(person[pk])
        row["来源"] = " + ".join(sorted(set(person_src[pk])))
        rows.append(row)
    return rows, anomalies


# ── 顶层:跑一个合并任务 ────────────────────────────────────
def run_merge(
    files: list[tuple[str, bytes]],
    template: dict,
    mappings: list[dict],
    custom_functions: dict[str, Callable[..., Any]] | None = None,
) -> dict:
    """执行一次合并。

    files: [(filename, xlsx_bytes)]
    template: {merge_keys, std_fields, aggregate}
    mappings: [source_mapping]  每份含 match/sheet_kw/header/key_map/column_map/derived_fields...
    custom_functions: 公共公式引擎可执行函数库(IF/ROUND/CALC_TAX 等),由 router 注入。
    返回 {rows, columns, recognize_log, anomalies, stats}
    """
    import io

    merge_keys = template["merge_keys"]
    std_fields = template["std_fields"]
    agg = template.get("aggregate", "sum")
    header_candidates = {tuple(m["header"]) for m in mappings}

    records_with_src: list[tuple[dict, str]] = []
    recognize_log: list[dict] = []
    anomalies: list[dict] = []
    record_count = 0

    for fname, blob in files:
        try:
            wb = openpyxl.load_workbook(io.BytesIO(blob), data_only=True)
        except Exception as e:
            anomalies.append({"type": "读取失败", "key": fname, "detail": str(e)})
            continue
        for ws in wb.worksheets:
            if ws.max_row <= 1:
                continue
            headers = sheet_headers(ws, header_candidates)
            # 找命中的 mapping(表头特征 + sheet 关键词 + 表头行区间一致)
            best: tuple[dict, float] | None = None
            best_hdr: list | None = None
            is_ambiguous = False
            for m in mappings:
                if m.get("sheet_kw") and m["sheet_kw"] not in ws.title:
                    continue
                hdr = headers.get(tuple(m["header"]))
                if not hdr:
                    continue
                hset = {h for h in hdr if h}
                need = m["match"]
                hit = sum(1 for k in need if k in hset)
                if hit >= max(3, len(need) - 1):
                    score = hit / len(need)
                    if best is None or score > best[1]:
                        best, best_hdr = (m, score), hdr
                        is_ambiguous = False
                    elif best is not None and score == best[1]:
                        is_ambiguous = True
            if best is None:
                anomalies.append({
                    "type": "未匹配源映射",
                    "key": f"{fname} / {ws.title}",
                    "detail": "未找到符合表头特征和 Sheet 规则的源映射",
                    "file": fname,
                })
                continue
            if is_ambiguous:
                anomalies.append({
                    "type": "映射命中歧义",
                    "key": f"{fname} / {ws.title}",
                    "detail": "存在多个同分源映射，已跳过该 Sheet，请维护更稳定的表头特征",
                    "file": fname,
                })
                continue
            m, score = best
            recognize_log.append({"file": fname, "sheet": ws.title,
                                  "mapping": m["name"], "score": round(score, 3)})
            recs, anos = extract_records(ws, best_hdr, m, custom_functions)
            for a in anos:
                a["file"] = fname
            anomalies.extend(anos)
            record_count += len(recs)
            for rec in recs:
                records_with_src.append((rec, m["name"]))
        wb.close()

    rows, agg_anomalies = aggregate_records(records_with_src, merge_keys, std_fields, agg)
    anomalies.extend(agg_anomalies)

    columns = merge_keys + std_fields + ["来源"]
    return {
        "rows": rows,
        "columns": columns,
        "recognize_log": recognize_log,
        "anomalies": anomalies,
        "stats": {"files": len(files), "records": record_count, "persons": len(rows),
                  "anomalies": len(anomalies)},
    }


def rows_to_xlsx(columns: list[str], rows: list[dict]) -> bytes:
    """归集结果导出为 xlsx bytes。"""
    import io
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "归集结果"
    ws.append(columns)
    for row in rows:
        ws.append([row.get(c) for c in columns])
    buf = io.BytesIO()
    wb.save(buf)
    return buf.getvalue()
