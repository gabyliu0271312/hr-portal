"""北森 OpenAPI 客户端

支持两套：
- BeisenReportClient：报表中心（GridHeader / GridData）
- BeisenApiClient：通用 OpenAPI（如 SearchCostCenter）

Token 缓存：每个 (AppKey, AppSecret) 独立缓存到内存。
失败重试：调用方负责（这里只暴露原始错误，让 router 决定如何记录到 sync_runs）。
"""
from __future__ import annotations

import time
from dataclasses import dataclass

import httpx


@dataclass
class _TokenCache:
    token: str
    expires_at: float  # Unix 时间戳


_token_store: dict[str, _TokenCache] = {}


async def _get_token(
    token_url: str,
    app_key: str,
    app_secret: str,
    timeout: float = 15.0,
) -> str:
    """获取 token，带 4 分钟缓存（北森 token 通常 7200s 有效）

    北森 token 接口要求 application/x-www-form-urlencoded 提交。
    """
    cache_key = f"{token_url}|{app_key}"
    now = time.time()
    cached = _token_store.get(cache_key)
    if cached and cached.expires_at > now + 60:
        return cached.token

    async with httpx.AsyncClient(timeout=timeout) as client:
        resp = await client.post(
            token_url,
            data={
                "app_key": app_key,
                "app_secret": app_secret,
                "grant_type": "client_credentials",
            },
            headers={"Content-Type": "application/x-www-form-urlencoded"},
        )
        resp.raise_for_status()
        data = resp.json()
        if "access_token" not in data:
            raise RuntimeError(f"北森 token 接口返回异常: {data}")
        ttl = int(data.get("expires_in", 3600))
        token = data["access_token"]
        _token_store[cache_key] = _TokenCache(token=token, expires_at=now + ttl)
        return token


# ===== 北森报表 API =====


class BeisenReportClient:
    def __init__(self, settings: dict, secrets: dict):
        self.token_url = settings.get("BEISEN_TOKEN_URL", "")
        self.header_url = settings.get("BEISEN_HEADER_URL", "")
        self.data_url = settings.get("BEISEN_DATA_URL", "")
        self.report_id = settings.get("BEISEN_REPORT_ID", "")
        self.app_key = secrets.get("BEISEN_APP_KEY", "")
        self.app_secret = secrets.get("BEISEN_APP_SECRET", "")

    def _validate(self) -> None:
        missing = [
            n for n, v in [
                ("BEISEN_TOKEN_URL", self.token_url),
                ("BEISEN_DATA_URL", self.data_url),
                ("BEISEN_REPORT_ID", self.report_id),
                ("BEISEN_APP_KEY", self.app_key),
                ("BEISEN_APP_SECRET", self.app_secret),
            ] if not v
        ]
        if missing:
            raise RuntimeError(f"北森报表 API 配置缺失: {', '.join(missing)}")

    async def get_token(self) -> str:
        self._validate()
        return await _get_token(self.token_url, self.app_key, self.app_secret)

    async def get_grid_data(
        self,
        page_size: int = 500,
        timeout: float = 60.0,
    ) -> list[dict]:
        """拉取报表全量数据。

        与成本分摊系统对齐：GET + query params + reportId/page/pageSize 小驼峰
        若提供了 header_url，会先拉表头并把 UUID-keyed rows 翻译成中文名 keyed rows

        429 限频处理：北森报表 API 默认 1 秒 1 次调用上限，每两次请求间至少 sleep 1.2s；
        遇到 429 时按指数退避重试（最多 5 次：2s/4s/8s/16s/32s）。
        """
        import asyncio

        self._validate()
        token = await _get_token(self.token_url, self.app_key, self.app_secret)
        headers = {"Authorization": f"Bearer {token}"}

        async def _get_with_retry(client: httpx.AsyncClient, url: str, params: dict) -> httpx.Response:
            """带 429 退避重试"""
            for attempt in range(5):
                resp = await client.get(url, params=params, headers=headers)
                if resp.status_code != 429:
                    resp.raise_for_status()
                    return resp
                wait = 2 ** (attempt + 1)  # 2s, 4s, 8s, 16s, 32s
                await asyncio.sleep(wait)
            # 最后一次仍失败抛出
            resp.raise_for_status()
            return resp

        async with httpx.AsyncClient(timeout=timeout) as client:
            # 1) 拉表头（可选）
            uuid_to_name: dict[str, str] = {}
            if self.header_url:
                try:
                    h_resp = await _get_with_retry(
                        client, self.header_url, {"reportId": self.report_id}
                    )
                    h_json = h_resp.json()
                    columns = h_json.get("data", {}).get("columns") or []
                    uuid_to_name = {c["id"]: c.get("title", c["id"]) for c in columns if "id" in c}
                except Exception:
                    uuid_to_name = {}
                # 表头与数据接口之间也加间隔
                await asyncio.sleep(1.2)

            # 2) 拉首页
            first_resp = await _get_with_retry(
                client,
                self.data_url,
                {"reportId": self.report_id, "page": 1, "pageSize": page_size},
            )
            first_json = first_resp.json()
            data_section = first_json.get("data") or {}
            total = int(data_section.get("totalRecords", 0))
            datas = list(data_section.get("datas") or [])

            # 3) 后续页（每页间至少 sleep 1.2s）
            total_pages = (total + page_size - 1) // page_size if total else 1
            for p in range(2, total_pages + 1):
                await asyncio.sleep(1.2)
                resp = await _get_with_retry(
                    client,
                    self.data_url,
                    {"reportId": self.report_id, "page": p, "pageSize": page_size},
                )
                datas.extend((resp.json().get("data") or {}).get("datas") or [])

            # 4) UUID → 中文名翻译
            if uuid_to_name:
                translated = []
                for row in datas:
                    if isinstance(row, dict):
                        translated.append({uuid_to_name.get(k, k): v for k, v in row.items()})
                    else:
                        translated.append(row)
                return translated
            return datas


# ===== 北森通用 OpenAPI（SearchCostCenter 等）=====


class BeisenApiClient:
    def __init__(self, settings: dict, secrets: dict):
        self.token_url = settings.get("BEISEN_API_TOKEN_URL", "")
        self.data_url = settings.get("BEISEN_API_DATA_URL", "")
        self.method = (settings.get("BEISEN_API_METHOD") or "POST").upper()
        self.body_template = settings.get("BEISEN_API_BODY_TEMPLATE", "")
        self.app_key = secrets.get("BEISEN_API_APP_KEY", "")
        self.app_secret = secrets.get("BEISEN_API_APP_SECRET", "")

    def _validate(self) -> None:
        missing = [
            n for n, v in [
                ("BEISEN_API_TOKEN_URL", self.token_url),
                ("BEISEN_API_DATA_URL", self.data_url),
                ("BEISEN_API_APP_KEY", self.app_key),
                ("BEISEN_API_APP_SECRET", self.app_secret),
            ] if not v
        ]
        if missing:
            raise RuntimeError(f"北森接口 API 配置缺失: {', '.join(missing)}")

    async def get_token(self) -> str:
        self._validate()
        return await _get_token(self.token_url, self.app_key, self.app_secret)

    async def fetch(self, timeout: float = 30.0) -> list[dict]:
        """调用一次数据接口，返回 items 列表

        北森接口 API 的响应约定：
        - HTTP 200，但业务 code 在 body 里：{"code": "200", "data": [...], "message": null}
        - data 直接是数组（成本中心、组织架构等）
        - 业务失败：{"code": "500", "message": "...", "data": null}
        """
        self._validate()
        token = await _get_token(self.token_url, self.app_key, self.app_secret)
        body: dict = {}
        if self.body_template:
            import json
            try:
                body = json.loads(self.body_template) if isinstance(self.body_template, str) else self.body_template
            except json.JSONDecodeError:
                body = {}

        async with httpx.AsyncClient(timeout=timeout) as client:
            if self.method == "GET":
                resp = await client.get(
                    self.data_url,
                    headers={"Authorization": f"Bearer {token}"},
                    params=body,
                )
            else:
                resp = await client.request(
                    self.method,
                    self.data_url,
                    headers={
                        "Authorization": f"Bearer {token}",
                        "Content-Type": "application/json",
                    },
                    json=body,
                )
            resp.raise_for_status()
            data = resp.json()

            # 业务级错误：北森返回 200 但 code 不是 200
            if isinstance(data, dict) and "code" in data:
                code = str(data.get("code"))
                if code not in ("200", "0"):
                    msg = data.get("message") or "未知错误"
                    raise RuntimeError(f"北森接口返回错误 (code={code}): {msg}")

            # 提取 items：兼容多种 wrapper key
            items: list = []
            if isinstance(data, list):
                items = data
            elif isinstance(data, dict):
                # 优先级：data 直接是数组（成本中心 API） → data.items / data.datas
                d_field = data.get("data") or data.get("Data")
                if isinstance(d_field, list):
                    items = d_field
                elif isinstance(d_field, dict):
                    for kk in ("items", "Items", "datas", "Datas"):
                        v = d_field.get(kk)
                        if isinstance(v, list):
                            items = v
                            break
                else:
                    for k in ("items", "Items", "Result", "results"):
                        v = data.get(k)
                        if isinstance(v, list):
                            items = v
                            break

            if not isinstance(items, list):
                items = []
            return items


# ===== 通用 HTTP API =====


class HttpGenericClient:
    def __init__(self, settings: dict, secrets: dict):
        self.base_url = settings.get("HTTP_BASE_URL", "").rstrip("/")
        self.path = settings.get("HTTP_PATH", "")
        self.method = (settings.get("HTTP_METHOD") or "GET").upper()
        self.headers_extra = settings.get("HTTP_HEADERS", "")
        self.body_template = settings.get("HTTP_BODY_TEMPLATE", "")
        self.auth_type = settings.get("HTTP_AUTH_TYPE", "none")
        self.credential = secrets.get("HTTP_CREDENTIAL", "")

    async def fetch(self, timeout: float = 30.0) -> list[dict]:
        if not self.base_url:
            raise RuntimeError("HTTP_BASE_URL 必填")
        url = self.base_url + (self.path or "")

        headers: dict[str, str] = {}
        import json
        if self.headers_extra:
            try:
                headers.update(json.loads(self.headers_extra))
            except json.JSONDecodeError:
                pass
        if self.auth_type == "bearer" and self.credential:
            headers["Authorization"] = f"Bearer {self.credential}"
        elif self.auth_type == "api_key_header" and self.credential:
            # 约定 credential 格式 "HeaderName=Value"
            if "=" in self.credential:
                k, v = self.credential.split("=", 1)
                headers[k.strip()] = v.strip()
        elif self.auth_type == "basic" and self.credential:
            import base64
            encoded = base64.b64encode(self.credential.encode()).decode()
            headers["Authorization"] = f"Basic {encoded}"

        body: dict = {}
        if self.body_template:
            try:
                body = json.loads(self.body_template)
            except json.JSONDecodeError:
                body = {}

        async with httpx.AsyncClient(timeout=timeout) as client:
            if self.method == "GET":
                resp = await client.get(url, headers=headers, params=body)
            else:
                headers.setdefault("Content-Type", "application/json")
                resp = await client.request(self.method, url, headers=headers, json=body)
            resp.raise_for_status()
            data = resp.json()
            if isinstance(data, list):
                return data
            for k in ("data", "items", "Items", "result", "Result"):
                v = data.get(k) if isinstance(data, dict) else None
                if isinstance(v, list):
                    return v
                if isinstance(v, dict):
                    for kk in ("items", "Items", "data"):
                        vv = v.get(kk)
                        if isinstance(vv, list):
                            return vv
            return []


# ===== 调度器：根据 source_type 选择客户端 =====


def make_client(source_type: str, settings: dict, secrets: dict):
    if source_type == "beisen_report":
        return BeisenReportClient(settings, secrets)
    if source_type == "beisen_api":
        return BeisenApiClient(settings, secrets)
    if source_type == "http_generic":
        return HttpGenericClient(settings, secrets)
    raise RuntimeError(f"暂不支持的接入类型: {source_type}")
