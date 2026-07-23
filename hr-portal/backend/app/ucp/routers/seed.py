"""UCP 开发环境种子数据路由

**仅开发环境可用** — 生产环境不挂载此路由模块。
挂载条件：环境变量 ENABLE_DEV_SEED=true。

所有凭证密钥在入库前使用 encrypt() 加密，不存储明文。
"""
from __future__ import annotations

import logging
import os
from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import current_user, require_op
from app.core.db import get_session
from app.core.secret_box import encrypt
from app.users.models import User
from app.ucp.models import (
    UcpCredential,
    UcpPipelineConfig,
    UcpResource,
    UcpSystem,
)

logger = logging.getLogger("ucp.routers.seed")
router = APIRouter()


def _encrypt_secrets(secrets: dict[str, Any]) -> dict[str, str]:
    """对凭证字典中每个值加密。"""
    return {k: encrypt(str(v)) for k, v in secrets.items()}


@router.post("/seed/offer-sync")
async def route_seed_offer_sync(
    payload: dict[str, Any],
    db: AsyncSession = Depends(get_session),
    user: User = Depends(require_op("ucp.systems", "C")),
):
    """一键种子 Offer 同步流水线数据（**仅开发环境**）。

    请求体：
      - system_code: str (必填，关联的 UcpSystem 编码，不存在则自动创建)
      - beisen_secrets: dict (北森凭证密钥，如 {"app_key":"...", "app_secret":"..."})
      - feishu_secrets: dict (飞书凭证密钥，如 {"app_id":"...", "app_secret":"..."})
    """
    # 双重门控：router.py 已按 ENABLE_DEV_SEED 决定是否挂载，此处再检一次
    if os.getenv("ENABLE_DEV_SEED", "").lower() not in ("true", "1"):
        raise HTTPException(403, "DEV_SEED 已禁用。仅开发环境可用，设置 ENABLE_DEV_SEED=true 启用。")

    system_code = payload.get("system_code", "").strip()
    if not system_code:
        raise HTTPException(422, "缺少必填字段: system_code")

    beisen_secrets = payload.get("beisen_secrets") or {}
    feishu_secrets = payload.get("feishu_secrets") or {}
    if not isinstance(beisen_secrets, dict) or not beisen_secrets:
        raise HTTPException(422, "beisen_secrets 不能为空，请提供真实的北森 API 凭证")
    if not isinstance(feishu_secrets, dict) or not feishu_secrets:
        raise HTTPException(422, "feishu_secrets 不能为空，请提供真实的飞书 API 凭证")

    # 禁止占位符
    for key, val in {**beisen_secrets, **feishu_secrets}.items():
        if isinstance(val, str) and "placeholder" in val.lower():
            raise HTTPException(422, f"凭证密钥 '{key}' 包含占位符，请使用真实凭证")

    results: dict[str, Any] = {"credentials": 0, "resources": 0, "pipelines": 0, "system_id": 0}
    now = datetime.now(timezone.utc)

    # 1. 查找或创建 UcpSystem
    sys_row = (await db.execute(
        select(UcpSystem).where(UcpSystem.system_code == system_code)
    )).scalar_one_or_none()
    if not sys_row:
        sys_row = UcpSystem(
            system_code=system_code,
            system_name=payload.get("system_name") or system_code,
            system_type=payload.get("system_type", "HR_SAAS"),
            owner=user.login_name,
            created_by=user.login_name,
        )
        db.add(sys_row)
        await db.flush()
    results["system_id"] = sys_row.id

    # 2. 北森 credential（加密存储）
    c1 = UcpCredential(
        credential_code=f"{system_code}_beisen_api",
        credential_name=f"{system_code} 北森API凭证",
        secrets_encrypted=_encrypt_secrets(beisen_secrets),
        auth_type="beisen",
        system_id=sys_row.id,
        created_by=user.login_name,
    )
    db.add(c1)
    await db.flush()
    results["credentials"] += 1

    # 3. 飞书 credential（加密存储）
    c2 = UcpCredential(
        credential_code=f"{system_code}_feishu_api",
        credential_name=f"{system_code} 飞书API凭证",
        secrets_encrypted=_encrypt_secrets(feishu_secrets),
        auth_type="feishu",
        system_id=sys_row.id,
        created_by=user.login_name,
    )
    db.add(c2)
    await db.flush()
    results["credentials"] += 1

    # 4. Resource: Beisen Offer
    r1 = UcpResource(
        system_id=sys_row.id,
        resource_code=f"{system_code}_beisen_offer",
        resource_name=f"{system_code} 北森Offer数据",
        adapter_code="BEISEN_REPORT_ADAPTER",
        credential_id=c1.id,
        created_by=user.login_name,
    )
    db.add(r1)
    await db.flush()
    results["resources"] += 1

    # 5. Resource: Feishu Message
    r2 = UcpResource(
        system_id=sys_row.id,
        resource_code=f"{system_code}_feishu_message",
        resource_name=f"{system_code} 飞书消息",
        adapter_code="FEISHU_MESSAGE_ADAPTER",
        credential_id=c2.id,
        created_by=user.login_name,
    )
    db.add(r2)
    await db.flush()
    results["resources"] += 1

    # 6. Pipeline
    pl = UcpPipelineConfig(
        pipeline_code=f"{system_code}_offer_sync",
        pipeline_name=f"{system_code} Offer同步流水线",
        steps=[
            {"id": "step_1", "type": "CONNECTOR", "label": "拉取Offer数据", "config": {"resource_id": r1.id}},
            {"id": "step_2", "type": "NOTIFY", "label": "飞书通知", "config": {"resource_id": r2.id}},
        ],
        trigger_type="SCHEDULED",
        status=1,
        created_by=user.login_name,
    )
    db.add(pl)
    await db.flush()
    results["pipelines"] += 1

    await db.commit()
    logger.info(
        "[ucp.seed] offer-sync seed complete system=%s sys_id=%d creds=%d resources=%d pipelines=%d",
        system_code, sys_row.id, results["credentials"], results["resources"], results["pipelines"],
    )
    return {"message": "Offer同步种子数据创建完成", "created": results}
