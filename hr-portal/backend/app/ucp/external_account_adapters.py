"""UCP Phase 3-4: 外部账号适配器

实现两个外部账号系统适配器：
  - DIDI_ACCOUNT_PUSH_ADAPTER: 滴滴企业版账号管理（占位实现，可对接真实 API）
  - CAOCAO_ACCOUNT_PUSH_ADAPTER: 曹操出行企业版账号管理

适配器协议：
  - params.action: CREATE / UPDATE / DISABLE / REACTIVATE / DELETE
  - params.employee_id / employee_name / employee_mobile
  - params.external_user_id (创建时可选, 删除时必填)
  - secrets: client_id / client_secret / base_url (可选)

返回值: AdapterResult 含 status, data (含 external_user_id), error

Phase 3-4 设计：
  - 这些 adapter 是占位实现, 接口对齐生产可对接时只换 HTTP 部分
  - 默认返回模拟成功, 标记 response.simulated=true
  - 真实环境配置 client_id/client_secret 后切到真实接口
"""
from __future__ import annotations

import hashlib
import logging
import time
import uuid
from typing import Any

import httpx
from sqlalchemy.ext.asyncio import AsyncSession

from app.ucp.types import AdapterResult
from app.ucp.external_account_service import (
    ACTION_CREATE,
    ACTION_DELETE,
    ACTION_DISABLE,
    ACTION_REACTIVATE,
    ACTION_UPDATE,
    STATUS_ACTIVE,
    STATUS_DELETED,
    STATUS_DISABLED,
    create_account,
    get_account,
    apply_action,
    mark_failed,
    record_audit,
    TRIGGER_PIPELINE,
)

logger = logging.getLogger("ucp.external_account_adapters")


# ===== 通用 HTTP 客户端 =====


class ExternalSystemClient:
    """外部账号系统 HTTP 客户端基类。

    子类可重写 _build_request_payload / _parse_response 处理系统差异。
    """

    def __init__(self, base_url: str, client_id: str, client_secret: str, timeout: float = 15.0):
        self._base_url = base_url.rstrip("/")
        self._client_id = client_id
        self._client_secret = client_secret
        self._timeout = timeout

    def _auth_headers(self) -> dict[str, str]:
        """生成鉴权头（占位：Basic Auth）。"""
        import base64
        token = base64.b64encode(
            f"{self._client_id}:{self._client_secret}".encode()
        ).decode()
        return {"Authorization": f"Basic {token}"}

    async def _request(
        self,
        method: str,
        path: str,
        json_body: dict | None = None,
        params: dict | None = None,
    ) -> dict:
        url = f"{self._base_url}{path}"
        headers = {
            **self._auth_headers(),
            "Content-Type": "application/json",
        }
        async with httpx.AsyncClient(timeout=self._timeout) as client:
            resp = await client.request(
                method=method,
                url=url,
                json=json_body,
                params=params,
                headers=headers,
            )
        if resp.status_code >= 400:
            raise RuntimeError(
                f"HTTP {resp.status_code} from {url}: {resp.text[:200]}"
            )
        try:
            return resp.json()
        except Exception:
            return {"raw": resp.text}


# ===== 滴滴企业账号客户端 =====


class DidiAccountClient(ExternalSystemClient):
    """Configuration-driven Didi account client."""

    def __init__(self, base_url: str, client_id: str, client_secret: str, protocol: dict | None = None):
        super().__init__(base_url, client_id, client_secret)
        self._protocol = protocol or {}

    def _auth_headers(self) -> dict[str, str]:
        if str(self._protocol.get("auth_mode") or "basic").lower() == "bearer":
            token = self._client_secret or self._client_id
            if not token:
                raise RuntimeError("Didi bearer token is not configured")
            return {"Authorization": f"Bearer {token}"}
        return super()._auth_headers()

    async def _call(self, action: str, payload: dict, external_user_id: str | None = None) -> dict:
        if self._protocol.get("simulate"):
            identifier = external_user_id or f"didi_{hashlib.md5(str(payload.get('employee_id', '')).encode()).hexdigest()[:12]}"
            return {"code": 0, "data": {"external_user_id": identifier}, "simulated": True}
        endpoint = (self._protocol.get("endpoints") or {}).get(action)
        if not isinstance(endpoint, dict) or not endpoint.get("path"):
            raise RuntimeError(f"Didi endpoint '{action}' is not configured")
        path = str(endpoint["path"])
        if external_user_id:
            path = path.replace("{external_user_id}", str(external_user_id))
        return await self._request(str(endpoint.get("method") or "POST").upper(), path, json_body=payload)

    async def create_account(self, employee_id: str, employee_name: str, employee_mobile: str, department: str | None = None) -> dict:
        return await self._call("create", {"employee_id": employee_id, "name": employee_name, "mobile": employee_mobile, "department": department or ""})

    async def disable_account(self, external_user_id: str) -> dict:
        return await self._call("disable", {}, external_user_id)

    async def delete_account(self, external_user_id: str) -> dict:
        return await self._call("delete", {}, external_user_id)

    async def update_account(self, external_user_id: str, **fields) -> dict:
        return await self._call("update", fields, external_user_id)

    async def reactivate_account(self, external_user_id: str) -> dict:
        return await self._call("reactivate", {}, external_user_id)

    async def query_account(self, external_user_id: str) -> dict:
        return await self._call("query", {}, external_user_id)


# ===== CAOCAO account client =====


class CaocaoAccountClient(ExternalSystemClient):
    """曹操出行企业版账号 API 客户端（占位）。"""

    async def create_account(
        self,
        employee_id: str,
        employee_name: str,
        employee_mobile: str,
        department: str | None = None,
    ) -> dict:
        payload = {
            "employeeId": employee_id,
            "realName": employee_name,
            "phone": employee_mobile,
            "orgName": department or "",
        }
        return {
            "code": 0,
            "msg": "ok (simulated)",
            "data": {
                "userId": f"caocao_{hashlib.md5(employee_id.encode()).hexdigest()[:12]}",
                "displayName": employee_name,
                "state": 1,  # 1=active
            },
            "simulated": True,
        }

    async def disable_account(self, external_user_id: str) -> dict:
        return {"code": 0, "msg": "ok (simulated)", "data": {"state": 0}, "simulated": True}

    async def delete_account(self, external_user_id: str) -> dict:
        return {"code": 0, "msg": "ok (simulated)", "data": {"state": -1}, "simulated": True}

    async def update_account(self, external_user_id: str, **fields) -> dict:
        return {"code": 0, "msg": "ok (simulated)", "data": {"state": 1}, "simulated": True}

    async def reactivate_account(self, external_user_id: str) -> dict:
        return {"code": 0, "msg": "ok (simulated)", "data": {"state": 1}, "simulated": True}


# ===== 适配器主流程 =====


def _extract_action_and_target(params: dict) -> tuple[str, str | None]:
    """从 params 解析动作和目标账号 ID。"""
    action = (params.get("action") or "").upper()
    if action not in {ACTION_CREATE, ACTION_UPDATE, ACTION_DISABLE, ACTION_REACTIVATE, ACTION_DELETE}:
        raise ValueError(f"未知或缺失的 action: {params.get('action')!r}")
    external_user_id = params.get("external_user_id")
    return action, external_user_id


async def _call_system_action(
    client: Any,
    action: str,
    employee_id: str,
    employee_name: str,
    employee_mobile: str,
    external_user_id: str | None,
    department: str | None = None,
) -> dict:
    """调用外部系统的动作方法。"""
    if action == ACTION_CREATE:
        if hasattr(client, "create_account"):
            return await client.create_account(employee_id, employee_name, employee_mobile, department)
        raise RuntimeError("client does not support create_account")
    elif action == ACTION_DELETE:
        if not external_user_id:
            raise ValueError("DELETE 动作需要 external_user_id")
        return await client.delete_account(external_user_id)
    elif action == ACTION_DISABLE:
        if not external_user_id:
            raise ValueError("DISABLE 动作需要 external_user_id")
        return await client.disable_account(external_user_id)
    elif action == ACTION_REACTIVATE:
        if not external_user_id:
            raise ValueError("REACTIVATE 动作需要 external_user_id")
        return await client.reactivate_account(external_user_id)
    elif action == ACTION_UPDATE:
        if not external_user_id:
            raise ValueError("UPDATE 动作需要 external_user_id")
        return await client.update_account(external_user_id, name=employee_name)
    else:
        raise ValueError(f"Unsupported action: {action}")


# ===== DIDI 适配器 =====


async def didi_account_push_adapter(
    params: dict,
    secrets: dict,
    db: AsyncSession,
) -> AdapterResult:
    """滴滴企业版账号同步适配器。

    params:
      - action: CREATE / UPDATE / DISABLE / REACTIVATE / DELETE
      - employee_id: 员工 ID（必填）
      - employee_name: 员工姓名（必填）
      - employee_mobile: 员工手机号（必填）
      - external_user_id: 外部账号 ID（DELETE/UPDATE/DISABLE/REACTIVATE 时必填）
      - department: 部门（可选）
      - pipeline_run_id: 追溯（自动注入）
    secrets:
      - client_id / client_secret / base_url (可选)
    """
    try:
        action, external_user_id = _extract_action_and_target(params)
    except ValueError as e:
        return AdapterResult(status="failed", error_code="INVALID_PARAMS", error_message=str(e))

    # The vendor contract is intentionally fail-closed. The previous implementation
    # returned a simulated success for every production request, which could mark an
    # account deleted without ever reaching Didi. Simulation is only valid when a
    # caller explicitly enables it for tests/dry-runs.
    if not params.get("simulate"):
        return AdapterResult(
            status="failed",
            error_code="DIDI_CONTRACT_REQUIRED",
            error_message="Didi production endpoint/signature contract is not configured; set simulate only in tests",
        )

    employee_id = params.get("employee_id", "")
    employee_name = params.get("employee_name", "")
    employee_mobile = params.get("employee_mobile", "")
    department = params.get("department")
    pipeline_run_id = params.get("pipeline_run_id")

    if not employee_id or not employee_name or not employee_mobile:
        return AdapterResult(
            status="failed",
            error_code="MISSING_EMPLOYEE_INFO",
            error_message="缺少 employee_id / employee_name / employee_mobile",
        )

    # 创建/查找账号记录
    try:
        if action == ACTION_CREATE:
            # 先用 deterministic 模拟 external_user_id 占位, 调用后回填真实值
            placeholder_id = f"didi_pending_{hashlib.md5(employee_id.encode()).hexdigest()[:8]}"
            account = await create_account(
                db,
                system_code="DIDI",
                employee_id=employee_id,
                employee_name=employee_name,
                employee_mobile=employee_mobile,
                external_user_id=external_user_id or placeholder_id,
                external_account_name=employee_name,
                extra={"department": department} if department else None,
                pipeline_run_id=pipeline_run_id,
            )
        else:
            if not external_user_id:
                return AdapterResult(
                    status="failed",
                    error_code="MISSING_EXTERNAL_USER_ID",
                    error_message=f"{action} 动作需要 external_user_id",
                )
            account = await get_account(db, "DIDI", external_user_id)
            if not account:
                return AdapterResult(
                    status="failed",
                    error_code="ACCOUNT_NOT_FOUND",
                    error_message=f"未找到 DIDI 账号: external_user_id={external_user_id}",
                )
    except Exception as e:
        logger.exception("[ucp] didi adapter: pre-flight failed: %s", e)
        return AdapterResult(status="failed", error_code="PRE_FLIGHT_ERROR", error_message=str(e)[:500])

    # 调用外部系统
    base_url = secrets.get("base_url", "https://api.didi.example.com")
    client = DidiAccountClient(
        base_url=base_url,
        client_id=secrets.get("client_id", ""),
        client_secret=secrets.get("client_secret", ""),
        protocol=params,
    )
    try:
        result = await _call_system_action(
            client, action, employee_id, employee_name, employee_mobile,
            account.external_user_id, department,
        )
    except Exception as e:
        logger.exception("[ucp] didi adapter: api call failed: %s", e)
        await mark_failed(db, account, "DIDI_API_ERROR", str(e))
        await record_audit(
            db,
            account_id=account.id,
            system_code="DIDI",
            employee_id=employee_id,
            external_user_id=account.external_user_id,
            action=action,
            result="FAILED",
            trigger_source=TRIGGER_PIPELINE,
            pipeline_run_id=pipeline_run_id,
            request_payload=params,
            error_code="DIDI_API_ERROR",
            error_message=str(e)[:500],
        )
        await db.flush()
        return AdapterResult(
            status="failed",
            error_code="DIDI_API_ERROR",
            error_message=str(e)[:500],
        )

    # 推进本地状态
    if action == ACTION_CREATE:
        # 回填真实 external_user_id
        real_id = result.get("data", {}).get("external_user_id", account.external_user_id)
        if real_id and real_id != account.external_user_id:
            # 幂等检查
            existing = await get_account(db, "DIDI", real_id)
            if existing and existing.id != account.id:
                # 重复, 删除刚才创建的占位
                await db.delete(account)
                await db.flush()
                account = existing
            else:
                account.external_user_id = real_id

    try:
        await apply_action(db, account=account, action=action, pipeline_run_id=pipeline_run_id)
    except Exception as e:
        logger.exception("[ucp] didi adapter: apply_action failed: %s", e)
        return AdapterResult(
            status="failed",
            error_code="STATE_UPDATE_ERROR",
            error_message=str(e)[:500],
        )

    # 审计
    await record_audit(
        db,
        account_id=account.id,
        system_code="DIDI",
        employee_id=employee_id,
        external_user_id=account.external_user_id,
        action=action,
        result="SUCCESS",
        trigger_source=TRIGGER_PIPELINE,
        pipeline_run_id=pipeline_run_id,
        request_payload=params,
        response_payload=result,
    )
    await db.flush()

    return AdapterResult(
        status="success",
        data=[{
            "account_id": account.id,
            "external_user_id": account.external_user_id,
            "action": action,
            "simulated": result.get("simulated", False),
        }],
        row_count=1,
        success_count=1,
        extra={"account_id": account.id},
    )


# ===== CAOCAO 适配器 =====


async def caocao_account_push_adapter(
    params: dict,
    secrets: dict,
    db: AsyncSession,
) -> AdapterResult:
    """曹操出行企业账号同步适配器。

    参数同 didi_account_push_adapter。
    """
    try:
        action, external_user_id = _extract_action_and_target(params)
    except ValueError as e:
        return AdapterResult(status="failed", error_code="INVALID_PARAMS", error_message=str(e))

    # The vendor contract is intentionally fail-closed. The previous implementation
    # returned a simulated success for every production request, which could mark an
    # account deleted without ever reaching Didi. Simulation is only valid when a
    # caller explicitly enables it for tests/dry-runs.
    if not params.get("simulate"):
        return AdapterResult(
            status="failed",
            error_code="DIDI_CONTRACT_REQUIRED",
            error_message="Didi production endpoint/signature contract is not configured; set simulate only in tests",
        )

    employee_id = params.get("employee_id", "")
    employee_name = params.get("employee_name", "")
    employee_mobile = params.get("employee_mobile", "")
    department = params.get("department")
    pipeline_run_id = params.get("pipeline_run_id")

    if not employee_id or not employee_name or not employee_mobile:
        return AdapterResult(
            status="failed",
            error_code="MISSING_EMPLOYEE_INFO",
            error_message="缺少 employee_id / employee_name / employee_mobile",
        )

    try:
        if action == ACTION_CREATE:
            placeholder_id = f"caocao_pending_{hashlib.md5(employee_id.encode()).hexdigest()[:8]}"
            account = await create_account(
                db,
                system_code="CAOCAO",
                employee_id=employee_id,
                employee_name=employee_name,
                employee_mobile=employee_mobile,
                external_user_id=external_user_id or placeholder_id,
                external_account_name=employee_name,
                extra={"department": department} if department else None,
                pipeline_run_id=pipeline_run_id,
            )
        else:
            if not external_user_id:
                return AdapterResult(
                    status="failed",
                    error_code="MISSING_EXTERNAL_USER_ID",
                    error_message=f"{action} 动作需要 external_user_id",
                )
            account = await get_account(db, "CAOCAO", external_user_id)
            if not account:
                return AdapterResult(
                    status="failed",
                    error_code="ACCOUNT_NOT_FOUND",
                    error_message=f"未找到 CAOCAO 账号: external_user_id={external_user_id}",
                )
    except Exception as e:
        logger.exception("[ucp] caocao adapter: pre-flight failed: %s", e)
        return AdapterResult(status="failed", error_code="PRE_FLIGHT_ERROR", error_message=str(e)[:500])

    base_url = secrets.get("base_url", "https://api.caocao.example.com")
    client = CaocaoAccountClient(
        base_url=base_url,
        client_id=secrets.get("client_id", ""),
        client_secret=secrets.get("client_secret", ""),
    )
    try:
        result = await _call_system_action(
            client, action, employee_id, employee_name, employee_mobile,
            account.external_user_id, department,
        )
    except Exception as e:
        logger.exception("[ucp] caocao adapter: api call failed: %s", e)
        await mark_failed(db, account, "CAOCAO_API_ERROR", str(e))
        await record_audit(
            db,
            account_id=account.id,
            system_code="CAOCAO",
            employee_id=employee_id,
            external_user_id=account.external_user_id,
            action=action,
            result="FAILED",
            trigger_source=TRIGGER_PIPELINE,
            pipeline_run_id=pipeline_run_id,
            request_payload=params,
            error_code="CAOCAO_API_ERROR",
            error_message=str(e)[:500],
        )
        await db.flush()
        return AdapterResult(
            status="failed",
            error_code="CAOCAO_API_ERROR",
            error_message=str(e)[:500],
        )

    if action == ACTION_CREATE:
        real_id = result.get("data", {}).get("userId", account.external_user_id)
        if real_id and real_id != account.external_user_id:
            existing = await get_account(db, "CAOCAO", real_id)
            if existing and existing.id != account.id:
                await db.delete(account)
                await db.flush()
                account = existing
            else:
                account.external_user_id = real_id

    try:
        await apply_action(db, account=account, action=action, pipeline_run_id=pipeline_run_id)
    except Exception as e:
        logger.exception("[ucp] caocao adapter: apply_action failed: %s", e)
        return AdapterResult(
            status="failed",
            error_code="STATE_UPDATE_ERROR",
            error_message=str(e)[:500],
        )

    await record_audit(
        db,
        account_id=account.id,
        system_code="CAOCAO",
        employee_id=employee_id,
        external_user_id=account.external_user_id,
        action=action,
        result="SUCCESS",
        trigger_source=TRIGGER_PIPELINE,
        pipeline_run_id=pipeline_run_id,
        request_payload=params,
        response_payload=result,
    )
    await db.flush()

    return AdapterResult(
        status="success",
        data=[{
            "account_id": account.id,
            "external_user_id": account.external_user_id,
            "action": action,
            "simulated": result.get("simulated", False),
        }],
        row_count=1,
        success_count=1,
        extra={"account_id": account.id},
    )


def register_external_account_adapters() -> None:
    """注册到 ADAPTER_REGISTRY。"""
    from app.ucp.adapters import ADAPTER_REGISTRY
    ADAPTER_REGISTRY["DIDI_ACCOUNT_PUSH_ADAPTER"] = didi_account_push_adapter
    ADAPTER_REGISTRY["CAOCAO_ACCOUNT_PUSH_ADAPTER"] = caocao_account_push_adapter
