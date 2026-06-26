"""北森 OpenAPI 客户端

支持两套：
- BeisenReportClient：报表中心（GridHeader / GridData）
- BeisenApiClient：通用 OpenAPI（如 SearchCostCenter）

Token 缓存：每个 (AppKey, AppSecret) 独立缓存到内存。
失败重试：调用方负责（这里只暴露原始错误，让 router 决定如何记录到 sync_runs）。
"""
from __future__ import annotations

import hashlib
import json
import logging
import time
from dataclasses import dataclass

import httpx

logger = logging.getLogger(__name__)


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
        page_size: int = 5000,
        timeout: float = 60.0,
        uuid_to_code: dict[str, str] | None = None,
        title_to_code: dict[str, str] | None = None,
    ) -> list[dict]:
        """拉取报表全量数据，把数据行的 UUID key 翻译成英文 column_code。

        翻译优先级（每个数据列 key）：
          1) uuid_to_code[key]      —— 已注册字段，按 UUID 锚点翻译(最稳定)
          2) title_to_code[title]   —— 新字段:UUID 未注册,用表头中文名匹配已建 code
          3) 表头 title(中文)       —— 全新字段,交给 _ensure_columns 生成英文 code
          4) 原 key                 —— 无表头信息,原样保留

        uuid_to_code/title_to_code 由调用方(sync_service)从 table_columns 的
        source_field_id/column_label 预加载传入。

        429 限频处理：每两次请求间至少 sleep 1.2s；遇 429 指数退避(最多5次)。
        """
        import asyncio

        uuid_to_code = uuid_to_code or {}
        title_to_code = title_to_code or {}
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
            # 1) 拉表头（可选）：建 UUID→title 映射
            uuid_to_title: dict[str, str] = {}
            if self.header_url:
                try:
                    h_resp = await _get_with_retry(
                        client, self.header_url, {"reportId": self.report_id}
                    )
                    h_json = h_resp.json()
                    columns = h_json.get("data", {}).get("columns") or []
                    uuid_to_title = {c["id"]: c.get("title", c["id"]) for c in columns if "id" in c}
                except Exception:
                    uuid_to_title = {}
                # 表头与数据接口之间也加间隔
                await asyncio.sleep(1.2)

            # 2) 翻页拉取（抗分页重叠）：北森报表分页可能出现相邻页重叠返回同一行，
            #    若只按「累计 >= total」停，会把重复行凑满 total 而漏掉真实尾页数据。
            #    改为：边拉边按整行去重，打印每页「返回/新增/累计」，
            #    直到某页不再产生任何新行（或返回空页）才停。
            def _row_hash(r) -> str | None:
                try:
                    return hashlib.sha256(
                        json.dumps(r, sort_keys=True, ensure_ascii=False).encode("utf-8")
                    ).hexdigest()
                except (TypeError, ValueError):
                    return None

            seen_hashes: set[str] = set()
            datas: list = []
            total = 0
            page = 0
            MAX_PAGES = 500  # 安全阀，防止异常分页导致死循环
            while page < MAX_PAGES:
                page += 1
                if page > 1:
                    await asyncio.sleep(1.2)
                resp = await _get_with_retry(
                    client,
                    self.data_url,
                    {"reportId": self.report_id, "page": page, "pageSize": page_size},
                )
                section = resp.json().get("data") or {}
                if page == 1:
                    total = int(section.get("totalRecords", 0))
                page_rows = section.get("datas") or []
                if not page_rows:
                    logger.info("[beisen] page=%d 返回=0 → 结束翻页", page)
                    break
                new_count = 0
                for r in page_rows:
                    h = _row_hash(r)
                    if h is None or h not in seen_hashes:
                        if h is not None:
                            seen_hashes.add(h)
                        datas.append(r)
                        new_count += 1
                logger.info(
                    "[beisen] page=%d 返回=%d 新增=%d 累计=%d total=%s",
                    page, len(page_rows), new_count, len(datas), total,
                )
                # 本页没有任何新行 → 已到数据末尾（或纯重叠页），停
                if new_count == 0:
                    break
                # 已收齐去重后的全部数据
                if total and len(datas) >= total:
                    break

            logger.info(
                "[beisen] 报表拉取完成 report=%s total=%s 实拉(去重后)=%d 页数=%d",
                self.report_id, total, len(datas), page,
            )

            # 4) key 翻译:UUID锚点 > title对应已建code > title(中文,新字段) > 原key
            def translate_key(k: str) -> str:
                if k in uuid_to_code:
                    return uuid_to_code[k]
                title = uuid_to_title.get(k)
                if title and title in title_to_code:
                    return title_to_code[title]
                if title:
                    return title  # 全新字段:用中文名,_ensure_columns 会生成英文 code
                return k

            if not uuid_to_title and not uuid_to_code and not title_to_code:
                return datas
            translated = []
            for row in datas:
                if isinstance(row, dict):
                    translated.append({translate_key(k): v for k, v in row.items()})
                else:
                    translated.append(row)
            return translated


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
