from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Iterable


HR_TERM_MAP = {
    "员工": "employee",
    "人员": "employee",
    "姓名": "name",
    "名称": "name",
    "工号": "employee_no",
    "编号": "no",
    "编码": "code",
    "部门": "department",
    "组织": "org",
    "公司": "company",
    "法人": "legal_entity",
    "成本中心": "cost_center",
    "成本": "cost",
    "工资": "salary",
    "薪资": "salary",
    "基本工资": "base_salary",
    "奖金": "bonus",
    "绩效": "performance",
    "社保": "social_security",
    "公积金": "housing_fund",
    "个税": "tax",
    "税": "tax",
    "金额": "amount",
    "合计": "total",
    "总计": "total",
    "比例": "ratio",
    "占比": "ratio",
    "系数": "factor",
    "月份": "month",
    "月度": "monthly",
    "季度": "quarterly",
    "年度": "annual",
    "考勤": "attendance",
    "假期": "leave",
    "请假": "leave",
    "加班": "overtime",
    "日期": "date",
    "时间": "time",
    "状态": "status",
    "类型": "type",
    "类别": "category",
    "级别": "level",
    "是否": "is",
    "在职": "active",
    "离职": "terminated",
    "入职": "hire",
    "转正": "regularization",
    "年龄": "age",
    "年限": "years",
    "天数": "days",
    "人数": "headcount",
    "结果": "result",
}


@dataclass(frozen=True)
class CodeSuggestion:
    code: str
    base_code: str
    source: str
    rule: str
    candidates: list[str]


def normalize_code(raw: str, *, prefix: str = "") -> str:
    text = (raw or "").strip().lower()
    if not text:
        return ""
    text = text.replace("字段", "")
    text = re.sub(r"表$", "", text)
    text = _replace_known_terms(text)
    # 已知词替换后若仍含未识别的中文/非 ASCII,说明规则翻不全。
    # 不再静默删成空(那会退化成 employee/field 误导名),而是保留已识别的英文片段
    # 并对剩余中文打可识别标记,提示用户"这是规则没翻全、需要手动改名"。
    if re.search(r"[^\x00-\x7f]", text):
        text = _mark_untranslated(text)
    text = re.sub(r"[^a-z0-9_]+", "_", text)
    text = re.sub(r"_+", "_", text).strip("_")
    if not text:
        text = "unnamed"
    if re.match(r"^\d", text):
        text = f"f_{text}"
    if prefix and not text.startswith(f"{prefix}_"):
        text = f"{prefix}_{text}"
    return text[:64].rstrip("_")


def normalize_ai_code(raw: str, *, prefix: str = "") -> str:
    text = (raw or "").strip().lower()
    text = re.sub(r"[^a-z0-9_]+", "_", text)
    text = re.sub(r"_+", "_", text).strip("_")
    if re.match(r"^\d", text):
        text = f"f_{text}"
    if prefix and text and not text.startswith(f"{prefix}_"):
        text = f"{prefix}_{text}"
    return text[:64].rstrip("_")


def deterministic_code(label: str, *, prefix: str = "") -> str:
    code = normalize_code(label, prefix=prefix)
    # 兜底名用 unnamed_field 而非 field:语义中性、不冒充真实字段,
    # 管理员可在字段管理页按 unnamed/to_rename 关键字筛出待命名字段。
    return code or normalize_code("unnamed_field", prefix=prefix)


def unique_code(base_code: str, existing: set[str]) -> str:
    base = base_code[:64].rstrip("_") or "unnamed_field"
    if base not in existing:
        return base
    for idx in range(2, 1000):
        suffix = f"_{idx}"
        candidate = f"{base[:64 - len(suffix)]}{suffix}".rstrip("_")
        if candidate not in existing:
            return candidate
    return base


def suggest_code_from_candidates(
    *,
    label: str,
    prefix: str,
    existing: Iterable[str] = (),
    ai_candidate: str | None = None,
) -> CodeSuggestion:
    existing_set = set(existing)
    candidates: list[str] = []
    ai_code = normalize_ai_code(ai_candidate or "", prefix=prefix)
    if ai_code:
        candidates.append(ai_code)
    rule_code = deterministic_code(label, prefix=prefix)
    candidates.append(rule_code)
    candidates.append(deterministic_code("field", prefix=prefix))

    unique_candidates = _dedupe(candidates)
    base = unique_candidates[0]
    return CodeSuggestion(
        code=unique_code(base, existing_set),
        base_code=base,
        source="ai" if base == ai_code else "rule",
        rule=f"{prefix or 'default'}_snake_case_ascii_unique",
        candidates=unique_candidates,
    )


def _replace_known_terms(text: str) -> str:
    out = text
    for zh, en in sorted(HR_TERM_MAP.items(), key=lambda item: len(item[0]), reverse=True):
        out = out.replace(zh, f"_{en}_")
    return out


def _mark_untranslated(text: str) -> str:
    """保留已识别的英文片段,把剩余未翻译的中文统一替换为 to_rename 标记。

    例:"_employee_月度考勤" → "employee_to_rename"(用户一眼看出需手动改名)。
    """
    parts = re.split(r"[^\x00-\x7f]+", text)
    ascii_kept = "_".join(p for p in parts if p.strip("_"))
    ascii_kept = ascii_kept.strip("_")
    return f"{ascii_kept}_to_rename" if ascii_kept else "to_rename"


def _dedupe(items: list[str]) -> list[str]:
    seen: set[str] = set()
    out: list[str] = []
    for item in items:
        if not item or item in seen:
            continue
        seen.add(item)
        out.append(item)
    return out
