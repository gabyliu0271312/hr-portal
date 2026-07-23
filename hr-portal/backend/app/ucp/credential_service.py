"""UCP 凭证管理服务

复用 core.secret_box 的 encrypt/decrypt 进行凭证加密存储与解密读取。
Phase 1B 扩展：完整 CRUD + 启用/停用 + 轮换 + 凭证读取审计。
"""
from __future__ import annotations

import logging

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.secret_box import decrypt, encrypt
from app.ucp.models import UcpCredential

logger = logging.getLogger("ucp.credential_service")


async def create_credential(
    db: AsyncSession,
    credential_code: str,
    credential_name: str,
    secrets: dict[str, str],
    auth_type: str = "custom",
    description: str | None = None,
    created_by: str | None = None,
) -> UcpCredential:
    """创建或更新凭证记录（幂等）。若 code 已存在则更新 secrets，否则新建。"""
    existing = await get_credential_by_code(db, credential_code)
    if existing:
        existing.secrets_encrypted = {k: encrypt(v) for k, v in secrets.items()}
        existing.credential_name = credential_name
        existing.auth_type = auth_type
        if description is not None:
            existing.description = description
        existing.updated_by = created_by
        logger.info("[ucp] credential updated (idempotent): code=%s", credential_code)
        return existing

    secrets_encrypted = {k: encrypt(v) for k, v in secrets.items()}
    cred = UcpCredential(
        credential_code=credential_code,
        credential_name=credential_name,
        secrets_encrypted=secrets_encrypted,
        auth_type=auth_type,
        description=description,
        created_by=created_by,
    )
    db.add(cred)
    await db.flush()
    logger.info("[ucp] credential created: code=%s auth_type=%s", credential_code, auth_type)
    return cred


async def update_credential(
    db: AsyncSession,
    credential_id: int,
    credential_name: str | None = None,
    secrets: dict[str, str] | None = None,
    auth_type: str | None = None,
    description: str | None = None,
    env_tag: str | None = None,
    expires_at=None,
    remind_before_days: int | None = None,
    updated_by: str | None = None,
) -> UcpCredential:
    """更新凭证配置（名称、密钥、类型、描述）。"""
    cred = await db.get(UcpCredential, credential_id)
    if cred is None:
        raise RuntimeError(f"Credential {credential_id} not found")

    if credential_name is not None:
        cred.credential_name = credential_name
    if secrets is not None:
        cred.secrets_encrypted = {k: encrypt(v) for k, v in secrets.items()}
        logger.info("[ucp] credential secrets rotated: code=%s by=%s", cred.credential_code, updated_by)
    if auth_type is not None:
        cred.auth_type = auth_type
    if description is not None:
        cred.description = description
    if env_tag is not None:
        cred.env_tag = env_tag
    if expires_at is not None:
        cred.expires_at = expires_at
    if remind_before_days is not None:
        cred.remind_before_days = remind_before_days
    cred.updated_by = updated_by
    await db.flush()
    logger.info("[ucp] credential updated: id=%d", credential_id)
    return cred


async def toggle_credential(
    db: AsyncSession,
    credential_id: int,
    is_active: bool,
    updated_by: str | None = None,
) -> UcpCredential:
    """启用或停用凭证。"""
    cred = await db.get(UcpCredential, credential_id)
    if cred is None:
        raise RuntimeError(f"Credential {credential_id} not found")
    cred.is_active = 1 if is_active else 0
    cred.updated_by = updated_by
    await db.flush()
    logger.info("[ucp] credential toggled: code=%s is_active=%s", cred.credential_code, is_active)
    return cred


async def get_credential_by_id(
    db: AsyncSession,
    credential_id: int,
) -> UcpCredential | None:
    """按 ID 查询凭证配置（不解密）。"""
    return await db.get(UcpCredential, credential_id)


async def get_credential_by_code(
    db: AsyncSession,
    credential_code: str,
) -> UcpCredential | None:
    """按 code 查询凭证配置（不解密）。"""
    return (
        await db.execute(
            select(UcpCredential).where(
                UcpCredential.credential_code == credential_code
            )
        )
    ).scalar_one_or_none()


async def list_credentials(
    db: AsyncSession,
    auth_type: str | None = None,
    is_active: int | None = None,
) -> list[UcpCredential]:
    """列出凭证配置，支持按类型和状态过滤。"""
    stmt = select(UcpCredential).order_by(UcpCredential.id)
    if auth_type:
        stmt = stmt.where(UcpCredential.auth_type == auth_type)
    if is_active is not None:
        stmt = stmt.where(UcpCredential.is_active == is_active)
    return (await db.execute(stmt)).scalars().all()


async def decrypt_credential_secrets(
    db: AsyncSession,
    credential_id: int,
) -> dict[str, str]:
    """解密凭证 secrets，返回明文 dict。

    注意：返回值仅用于资源执行时临时使用，不得持久化或返回到前端。
    每次解密操作会记录审计日志。
    """
    cred = await db.get(UcpCredential, credential_id)
    if cred is None:
        raise RuntimeError(f"Credential {credential_id} not found")
    if not cred.is_active:
        raise RuntimeError(f"Credential {credential_id} is inactive")
    logger.info("[ucp] credential secrets decrypted for execution: code=%s", cred.credential_code)
    return {k: decrypt(v) for k, v in (cred.secrets_encrypted or {}).items()}


async def decrypt_credential_secrets_by_code(
    db: AsyncSession,
    credential_code: str,
) -> dict[str, str]:
    """按 code 解密凭证 secrets，返回明文 dict。"""
    cred = await get_credential_by_code(db, credential_code)
    if cred is None:
        raise RuntimeError(f"Credential code '{credential_code}' not found")
    if not cred.is_active:
        raise RuntimeError(f"Credential code '{credential_code}' is inactive")
    logger.info("[ucp] credential secrets decrypted for execution: code=%s", credential_code)
    return {k: decrypt(v) for k, v in (cred.secrets_encrypted or {}).items()}
