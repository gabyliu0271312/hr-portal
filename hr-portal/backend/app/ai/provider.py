from __future__ import annotations

import json
import re
from typing import Any

import httpx


class AiProviderJsonError(ValueError):
    def __init__(self, message: str, content: str = "") -> None:
        super().__init__(message)
        self.content = content


class AiProviderEndpointError(ValueError):
    pass


def _message_content(data: dict[str, Any]) -> str:
    choices = data.get("choices") or []
    if not choices:
        return ""
    message = choices[0].get("message") or {}
    content = message.get("content")
    if content is None:
        return ""
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        parts: list[str] = []
        for item in content:
            if isinstance(item, dict):
                parts.append(str(item.get("text") or item.get("content") or ""))
            else:
                parts.append(str(item))
        return "".join(parts)
    return str(content)


def parse_json_content(content: str) -> dict[str, Any]:
    raw = (content or "").strip()
    if not raw:
        raise AiProviderJsonError("模型返回为空，无法解析 JSON", raw)
    fenced = re.match(r"^```(?:json)?\s*(.*?)\s*```$", raw, flags=re.IGNORECASE | re.DOTALL)
    if fenced:
        raw = fenced.group(1).strip()
    try:
        parsed = json.loads(raw)
    except json.JSONDecodeError as exc:
        start = raw.find("{")
        end = raw.rfind("}")
        if start >= 0 and end > start:
            try:
                parsed = json.loads(raw[start : end + 1])
            except json.JSONDecodeError:
                raise AiProviderJsonError(
                    f"模型未返回合法 JSON，返回内容前 300 字: {raw[:300]}",
                    raw,
                ) from exc
        else:
            raise AiProviderJsonError(
                f"模型未返回合法 JSON，返回内容前 300 字: {raw[:300]}",
                raw,
            ) from exc
    if not isinstance(parsed, dict):
        raise AiProviderJsonError("模型返回的 JSON 顶层必须是对象", raw)
    return parsed


def parse_json_like_content(content: str) -> dict[str, Any]:
    try:
        return parse_json_content(content)
    except AiProviderJsonError as exc:
        raw = (exc.content or content or "").strip()
        parsed = _parse_json_like_object(raw)
        if parsed:
            return parsed
        raise


def _parse_json_like_object(raw: str) -> dict[str, Any]:
    if not raw:
        return {}
    start = raw.find("{")
    end = raw.rfind("}")
    if start >= 0 and end > start:
        raw = raw[start : end + 1]
    keys = {
        "intent",
        "field_label",
        "formula_display",
        "formula",
        "data_type",
        "agg_role",
        "explanation",
        "change_summary",
        "standard_excel_formula",
        "platform_limitation",
    }
    result: dict[str, Any] = {}
    for key in keys:
        value = _extract_json_like_string(raw, key)
        if value is not None:
            result[key] = value
    value = _extract_json_like_bool(raw, "should_update_formula")
    if value is not None:
        result["should_update_formula"] = value
    for key in {"depends_on", "used_functions", "warnings"}:
        value = _extract_json_like_array(raw, key)
        if value is not None:
            result[key] = value
    return result if result.get("formula") or result.get("formula_display") else {}


def _extract_json_like_string(raw: str, key: str) -> str | None:
    match = re.search(rf'"{re.escape(key)}"\s*:\s*"', raw)
    if not match:
        return None
    i = match.end()
    out: list[str] = []
    while i < len(raw):
        ch = raw[i]
        if ch == "\\" and i + 1 < len(raw):
            out.append(raw[i + 1])
            i += 2
            continue
        if ch == '"':
            if _looks_like_json_string_end(raw, i + 1):
                return "".join(out).strip()
            out.append(ch)
            i += 1
            continue
        out.append(ch)
        i += 1
    return None


def _looks_like_json_string_end(raw: str, pos: int) -> bool:
    i = pos
    while i < len(raw) and raw[i].isspace():
        i += 1
    if i >= len(raw) or raw[i] == "}":
        return True
    if raw[i] != ",":
        return False
    i += 1
    while i < len(raw) and raw[i].isspace():
        i += 1
    if i >= len(raw) or raw[i] == "}":
        return True
    return re.match(r'"[A-Za-z_][A-Za-z0-9_]*"\s*:', raw[i:]) is not None


def _extract_json_like_bool(raw: str, key: str) -> bool | None:
    match = re.search(rf'"{re.escape(key)}"\s*:\s*(true|false)', raw, flags=re.IGNORECASE)
    if not match:
        return None
    return match.group(1).lower() == "true"


def _extract_json_like_array(raw: str, key: str) -> list[Any] | None:
    match = re.search(rf'"{re.escape(key)}"\s*:\s*\[', raw)
    if not match:
        return None
    start = match.end() - 1
    depth = 0
    quote = ""
    i = start
    while i < len(raw):
        ch = raw[i]
        if quote:
            if ch == "\\":
                i += 2
                continue
            if ch == quote:
                quote = ""
            i += 1
            continue
        if ch in {"'", '"'}:
            quote = ch
        elif ch == "[":
            depth += 1
        elif ch == "]":
            depth -= 1
            if depth == 0:
                text = raw[start : i + 1]
                try:
                    value = json.loads(text)
                except json.JSONDecodeError:
                    return re.findall(r'"([^"\\]*(?:\\.[^"\\]*)*)"', text)
                return value if isinstance(value, list) else None
        i += 1
    return None


async def chat_completion_openai_compatible(
    *,
    api_key: str,
    base_url: str | None,
    model: str,
    messages: list[dict[str, str]],
    timeout: int = 30,
    response_format: dict[str, Any] | None = None,
) -> tuple[dict[str, Any], str, dict[str, Any] | None]:
    url = (base_url or "https://api.openai.com/v1").rstrip("/") + "/chat/completions"
    payload: dict[str, Any] = {
        "model": model,
        "messages": messages,
        "temperature": 0.1,
    }
    if response_format:
        payload["response_format"] = response_format
    headers = {"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"}
    async with httpx.AsyncClient(timeout=timeout) as client:
        resp = await client.post(url, headers=headers, json=payload)
        resp.raise_for_status()
        content_type = (resp.headers.get("content-type") or "").lower()
        if "text/html" in content_type or resp.text.lstrip().lower().startswith(("<!doctype html", "<html")):
            raise AiProviderEndpointError(
                "模型接口返回了 HTML 页面，Base URL 很可能填成了官网/控制台地址。"
                "请填写供应商文档中的 OpenAI-compatible API 根地址，通常以 /v1 结尾，"
                f"当前请求地址为: {url}"
            )
        try:
            data = resp.json()
        except json.JSONDecodeError as exc:
            raise ValueError(f"模型接口返回非 JSON 响应: {resp.text[:500]}") from exc
    return data, _message_content(data), data.get("usage")


async def generate_json_openai_compatible(
    *,
    api_key: str,
    base_url: str | None,
    model: str,
    messages: list[dict[str, str]],
    timeout: int = 30,
    repair_instructions: str | None = None,
) -> tuple[dict[str, Any], dict[str, Any] | None]:
    try:
        _, content, usage = await chat_completion_openai_compatible(
            api_key=api_key,
            base_url=base_url,
            model=model,
            messages=messages,
            timeout=timeout,
            response_format={"type": "json_object"},
        )
    except httpx.HTTPStatusError as exc:
        detail = exc.response.text.lower() if exc.response is not None else ""
        if "response_format" not in detail and "json_object" not in detail:
            raise
        _, content, usage = await chat_completion_openai_compatible(
            api_key=api_key,
            base_url=base_url,
            model=model,
            messages=messages,
            timeout=timeout,
        )
    try:
        return parse_json_like_content(content), usage
    except AiProviderJsonError:
        repair_messages = [
            {
                "role": "system",
                "content": (
                    "You repair malformed assistant output into a valid JSON object. "
                    "Return JSON only. Preserve the original intent and values. "
                    "Escape quotes inside string values. Do not add markdown."
                ),
            },
            {
                "role": "user",
                "content": (
                    f"Expected JSON object instructions:\n{repair_instructions or 'Return the data as a valid JSON object.'}\n\n"
                    f"Original assistant output:\n{content}"
                ),
            },
        ]
        _, repaired, repair_usage = await chat_completion_openai_compatible(
            api_key=api_key,
            base_url=base_url,
            model=model,
            messages=repair_messages,
            timeout=timeout,
            response_format={"type": "json_object"},
        )
        parsed = parse_json_like_content(repaired)
        merged_usage = dict(usage or {})
        if repair_usage:
            merged_usage["repair"] = repair_usage
        return parsed, merged_usage or None
