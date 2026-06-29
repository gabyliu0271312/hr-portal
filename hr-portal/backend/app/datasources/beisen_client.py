"""北森 OpenAPI 客户端

支持两套：
- BeisenReportClient：报表中心（GridHeader / GridData）
- BeisenApiClient：通用 OpenAPI（如 SearchCostCenter）
- FeishuSheetClient：飞书在线表格读取

Token 缓存：每个 (AppKey, AppSecret) 独立缓存到内存。
失败重试：调用方负责（这里只暴露原始错误，让 router 决定如何记录到 sync_runs）。
"""
from __future__ import annotations

import hashlib
import json
import logging
import time
from dataclasses import dataclass
from urllib.parse import parse_qs, urlparse

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
        page_size: int = 1000,
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

            # 2) 探测北森可接受的最大单页大小（pageSize 过大会 400），从大到小降级。
            #    目的：用尽量大的单页一次拉全，绕开北森分页无稳定排序导致的页间重叠丢数。
            def _row_hash(r) -> str | None:
                try:
                    return hashlib.sha256(
                        json.dumps(r, sort_keys=True, ensure_ascii=False).encode("utf-8")
                    ).hexdigest()
                except (TypeError, ValueError):
                    return None

            async def _fetch_page(p: int, size: int):
                resp = await _get_with_retry(
                    client,
                    self.data_url,
                    {"reportId": self.report_id, "page": p, "pageSize": size},
                )
                return (resp.json().get("data") or {})

            # 候选单页大小：从传入值起步，仅向下降级（不超过传入上限，避免无谓的 400 探测）
            _cands: list[int] = []
            for c in (page_size, 1000, 500):
                if isinstance(c, int) and 0 < c <= page_size and c not in _cands:
                    _cands.append(c)
            _cands.sort(reverse=True)

            effective_size = 0
            first_section: dict | None = None
            for cand in _cands:
                try:
                    first_section = await _fetch_page(1, cand)
                    effective_size = cand
                    logger.info("[beisen] 单页大小探测：pageSize=%d 可用", cand)
                    break
                except httpx.HTTPStatusError as e:
                    if e.response is not None and e.response.status_code == 400:
                        logger.warning("[beisen] pageSize=%d 被拒(400)，降级重试", cand)
                        await asyncio.sleep(1.2)
                        continue
                    raise
            if first_section is None:
                raise RuntimeError("北森报表所有候选 pageSize 均被拒绝(400)")

            # 3) 拉取（抗分页重叠 + 乱序）：北森分页查询无稳定排序，单页可能整页与他页重叠。
            #    策略：一轮翻完所有页并整行去重；若未收齐 total，再整轮重扫，
            #    直到收齐 total 或某一整轮零新增为止（乱序下多轮可逐步把漏行捞全）。
            seen_hashes: set[str] = set()
            datas: list = []
            total = int(first_section.get("totalRecords", 0))
            MAX_PAGES = 500       # 单轮安全阀
            MAX_ROUNDS = 8        # 多轮重扫上限
            total_requests = 0

            def _absorb(rows: list) -> int:
                added = 0
                for r in rows:
                    h = _row_hash(r)
                    if h is None or h not in seen_hashes:
                        if h is not None:
                            seen_hashes.add(h)
                        datas.append(r)
                        added += 1
                return added

            done = False
            for rnd in range(1, MAX_ROUNDS + 1):
                round_added = 0
                page = 1
                section = first_section if rnd == 1 else await _fetch_page(1, effective_size)
                if rnd > 1:
                    total_requests += 1
                while page <= MAX_PAGES:
                    page_rows = section.get("datas") or []
                    if not page_rows:
                        break
                    added = _absorb(page_rows)
                    round_added += added
                    logger.info(
                        "[beisen] round=%d page=%d 返回=%d 新增=%d 累计=%d/%s pageSize=%d",
                        rnd, page, len(page_rows), added, len(datas), total, effective_size,
                    )
                    if total and len(datas) >= total:
                        done = True
                        break
                    page += 1
                    await asyncio.sleep(1.2)
                    section = await _fetch_page(page, effective_size)
                    total_requests += 1
                if done:
                    break
                logger.info("[beisen] round=%d 完成,本轮新增=%d 累计=%d/%s", rnd, round_added, len(datas), total)
                # 一整轮没捞到任何新行 → 北森已无更多可返回的数据,停
                if round_added == 0:
                    break
                await asyncio.sleep(1.2)

            if total and len(datas) < total:
                logger.warning(
                    "[beisen] ⚠ 多轮重扫后仍未收齐:实拉=%d / total=%d (报表 report=%s)",
                    len(datas), total, self.report_id,
                )
            logger.info(
                "[beisen] 报表拉取完成 report=%s total=%s 实拉(去重后)=%d 请求次数=%d pageSize=%d",
                self.report_id, total, len(datas), total_requests + 1, effective_size,
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


# ===== 飞书在线表格 =====


class FeishuSheetClient:
    """读取飞书在线表格并转换为 list[dict]。

    配置约定：
    - FEISHU_BASE_URL：默认 https://open.feishu.cn
    - FEISHU_SPREADSHEET_TOKEN：电子表格 token
    - FEISHU_WIKI_URL_OR_TOKEN：知识库 Wiki URL 或 node_token（可选；填写后自动解析 obj_token）
    - FEISHU_SHEET_ID：工作表 ID（可选；若不填则读取第一个工作表）
    - FEISHU_RANGE：单元格范围，如 A1:Z1000，默认 A1:ZZ10000
    - FEISHU_SHEET_RANGE：完整范围，如 6e5ed3!A1:Z1000；优先级高于 SHEET_ID + RANGE
    - FEISHU_HEADER_ROW：表头所在行（相对于读取范围的第几行，1-based），默认 1
    - FEISHU_SKIP_EMPTY_ROWS：是否跳过空行，默认 true
    """

    def __init__(self, settings: dict, secrets: dict):
        self.base_url = (settings.get("FEISHU_BASE_URL") or "https://open.feishu.cn").rstrip("/")
        self.token_url = settings.get(
            "FEISHU_TOKEN_URL",
            f"{self.base_url}/open-apis/auth/v3/tenant_access_token/internal",
        )
        self.spreadsheet_token = settings.get("FEISHU_SPREADSHEET_TOKEN", "")
        self.wiki_url_or_token = settings.get("FEISHU_WIKI_URL_OR_TOKEN", "")
        self.sheet_id = settings.get("FEISHU_SHEET_ID", "")
        self.cell_range = settings.get("FEISHU_RANGE", "A1:ZZ10000")
        self.full_range = settings.get("FEISHU_SHEET_RANGE", "")
        self.header_row = self._int_setting(settings.get("FEISHU_HEADER_ROW"), default=1)
        self.skip_empty_rows = str(settings.get("FEISHU_SKIP_EMPTY_ROWS", "true")).lower() in (
            "true",
            "1",
            "yes",
            "y",
            "是",
        )
        self.app_id = secrets.get("FEISHU_APP_ID", "")
        self.app_secret = secrets.get("FEISHU_APP_SECRET", "")

    @staticmethod
    def _int_setting(value, default: int) -> int:
        try:
            parsed = int(value)
            return parsed if parsed > 0 else default
        except (TypeError, ValueError):
            return default

    def _validate(self) -> None:
        missing = [
            n for n, v in [
                ("FEISHU_APP_ID", self.app_id),
                ("FEISHU_APP_SECRET", self.app_secret),
            ] if not v
        ]
        if not self.spreadsheet_token and not self.wiki_url_or_token:
            missing.append("FEISHU_SPREADSHEET_TOKEN 或 FEISHU_WIKI_URL_OR_TOKEN")
        if missing:
            raise RuntimeError(f"飞书在线表格配置缺失: {', '.join(missing)}")

    def _extract_wiki_token_and_sheet_id(self) -> tuple[str, str]:
        raw = (self.wiki_url_or_token or "").strip()
        if not raw:
            return "", ""
        if raw.startswith("http://") or raw.startswith("https://"):
            parsed = urlparse(raw)
            parts = [p for p in parsed.path.split("/") if p]
            token = ""
            for i, p in enumerate(parts):
                if p == "wiki" and i + 1 < len(parts):
                    token = parts[i + 1]
                    break
            qs = parse_qs(parsed.query or "")
            sheet_from_query = (qs.get("sheet") or [""])[0]
            return token, sheet_from_query
        return raw, ""

    async def _resolve_spreadsheet_token(self, token: str) -> str:
        """把 Wiki node token 解析为真实电子表格 obj_token。"""
        tenant_token = await self.get_token()
        url = f"{self.base_url}/open-apis/wiki/v2/spaces/get_node"
        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.get(
                url,
                params={"token": token},
                headers={"Authorization": f"Bearer {tenant_token}"},
            )
            resp.raise_for_status()
            data = resp.json()
        if str(data.get("code", "0")) != "0":
            raise RuntimeError(f"飞书 Wiki 节点解析失败 (code={data.get('code')}): {data.get('msg') or data}")
        node = (data.get("data") or {}).get("node") or {}
        obj_type = str(node.get("obj_type") or "")
        obj_token = str(node.get("obj_token") or "")
        if obj_type not in ("sheet", "sheets", "spreadsheet"):
            raise RuntimeError(f"该 Wiki 节点不是电子表格，当前类型为: {obj_type or '未知'}")
        if not obj_token:
            raise RuntimeError(f"飞书 Wiki 节点未返回电子表格 token: {data}")
        return obj_token

    async def _ensure_spreadsheet_token(self) -> str:
        if self.spreadsheet_token:
            return self.spreadsheet_token
        wiki_token, sheet_from_query = self._extract_wiki_token_and_sheet_id()
        if sheet_from_query and not self.sheet_id:
            self.sheet_id = sheet_from_query
        if not wiki_token:
            raise RuntimeError("FEISHU_WIKI_URL_OR_TOKEN 未识别到 Wiki token")
        self.spreadsheet_token = await self._resolve_spreadsheet_token(wiki_token)
        return self.spreadsheet_token

    async def _ensure_sheet_id(self, spreadsheet_token: str) -> str:
        if self.sheet_id:
            return self.sheet_id
        token = await self.get_token()
        url = f"{self.base_url}/open-apis/sheets/v3/spreadsheets/{spreadsheet_token}/sheets/query"
        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.get(url, headers={"Authorization": f"Bearer {token}"})
            resp.raise_for_status()
            data = resp.json()
        if str(data.get("code", "0")) != "0":
            raise RuntimeError(f"飞书工作表列表读取失败 (code={data.get('code')}): {data.get('msg') or data}")
        sheets = ((data.get("data") or {}).get("sheets")) or []
        if not sheets:
            raise RuntimeError("飞书电子表格未返回任何工作表，请手动填写 Sheet ID")
        first = sheets[0] or {}
        sheet_id = first.get("sheet_id") or first.get("sheetId") or first.get("id")
        if not sheet_id:
            raise RuntimeError(f"无法从工作表列表中识别 Sheet ID: {first}")
        self.sheet_id = str(sheet_id)
        return self.sheet_id

    async def _range(self, spreadsheet_token: str) -> str:
        if self.full_range:
            return self.full_range
        sheet_id = await self._ensure_sheet_id(spreadsheet_token)
        return f"{sheet_id}!{self.cell_range or 'A1:ZZ10000'}"

    async def get_token(self, timeout: float = 15.0) -> str:
        """获取 tenant_access_token，带内存缓存。"""
        self._validate()
        cache_key = f"feishu|{self.token_url}|{self.app_id}"
        now = time.time()
        cached = _token_store.get(cache_key)
        if cached and cached.expires_at > now + 60:
            return cached.token

        async with httpx.AsyncClient(timeout=timeout) as client:
            resp = await client.post(
                self.token_url,
                json={"app_id": self.app_id, "app_secret": self.app_secret},
                headers={"Content-Type": "application/json; charset=utf-8"},
            )
            resp.raise_for_status()
            data = resp.json()
            if data.get("code") not in (0, "0", None) and "tenant_access_token" not in data:
                raise RuntimeError(f"飞书 token 接口返回错误: {data.get('msg') or data}")
            token = data.get("tenant_access_token")
            if not token:
                raise RuntimeError(f"飞书 token 接口返回异常: {data}")
            ttl = int(data.get("expire", 7200))
            _token_store[cache_key] = _TokenCache(token=token, expires_at=now + ttl)
            return token

    async def fetch(self, timeout: float = 60.0) -> list[dict]:
        self._validate()
        token = await self.get_token()
        spreadsheet_token = await self._ensure_spreadsheet_token()
        read_range = await self._range(spreadsheet_token)
        url = (
            f"{self.base_url}/open-apis/sheets/v2/spreadsheets/"
            f"{spreadsheet_token}/values/{read_range}"
        )

        async with httpx.AsyncClient(timeout=timeout) as client:
            resp = await client.get(url, headers={"Authorization": f"Bearer {token}"})
            resp.raise_for_status()
            data = resp.json()

        if isinstance(data, dict) and str(data.get("code", "0")) not in ("0",):
            raise RuntimeError(f"飞书表格读取失败 (code={data.get('code')}): {data.get('msg') or data}")

        value_range = (data.get("data") or {}).get("valueRange") or {}
        values = value_range.get("values") or []
        if not values:
            return []
        if self.header_row > len(values):
            raise RuntimeError(
                f"飞书表格表头行超出读取范围: header_row={self.header_row}, rows={len(values)}"
            )

        header_idx = self.header_row - 1
        raw_headers = values[header_idx] or []
        headers: list[str] = []
        used: dict[str, int] = {}
        for i, h in enumerate(raw_headers):
            name = str(h or "").strip() or f"列{i + 1}"
            # 避免重复表头覆盖数据
            if name in used:
                used[name] += 1
                name = f"{name}_{used[name]}"
            else:
                used[name] = 1
            headers.append(name)

        rows: list[dict] = []
        for raw in values[header_idx + 1 :]:
            if not isinstance(raw, list):
                continue
            if self.skip_empty_rows and all(v in (None, "") for v in raw):
                continue
            row = {
                headers[i]: raw[i] if i < len(raw) else None
                for i in range(len(headers))
            }
            rows.append(row)
        return rows


# ===== 调度器：根据 source_type 选择客户端 =====


def make_client(source_type: str, settings: dict, secrets: dict):
    if source_type == "beisen_report":
        return BeisenReportClient(settings, secrets)
    if source_type == "beisen_api":
        return BeisenApiClient(settings, secrets)
    if source_type == "http_generic":
        return HttpGenericClient(settings, secrets)
    if source_type == "feishu_sheet":
        return FeishuSheetClient(settings, secrets)
    raise RuntimeError(f"暂不支持的接入类型: {source_type}")
