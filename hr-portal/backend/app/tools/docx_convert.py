from __future__ import annotations

import os

import httpx


DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"

GOTENBERG_URL = os.getenv("GOTENBERG_URL", "http://gotenberg:3000")
_CONVERT_TIMEOUT = 120.0


def convert_docx_bytes_to_pdf(content: bytes, filename: str = "document.docx") -> bytes:
    if not filename.lower().endswith(".docx"):
        filename = f"{filename}.docx"
    files = {"files": (filename, content, DOCX_MIME)}
    url = f"{GOTENBERG_URL.rstrip('/')}/forms/libreoffice/convert"
    try:
        resp = httpx.post(url, files=files, timeout=_CONVERT_TIMEOUT)
    except httpx.HTTPError as exc:
        raise RuntimeError(f"调用 Gotenberg 失败: {exc}") from exc
    if resp.status_code != 200:
        raise RuntimeError(
            f"Gotenberg 转换失败 (HTTP {resp.status_code}): {resp.text[:500]}"
        )
    return resp.content
