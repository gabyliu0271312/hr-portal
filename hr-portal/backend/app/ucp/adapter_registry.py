"""Phase 3-7: 适配器注册机制 (Self-Register)

业务方通过 API 注册自定义 adapter:
- adapter_code: 唯一 code (大写+下划线)
- adapter_type: HTTP / DB / FILE / EVENT / TRANSFORM
- schema: 输入/输出字段定义 (JSON Schema 简化版)
- sample_payload: 测试样例

注册后:
- 业务方可在 pipeline_steps 中引用 (但需要 is_active=True)
- 测试引擎可对该 adapter 做连通性测试
- 适配器实际代码仍由后端维护 (本机制聚焦 metadata, 不含 user-defined code)
"""
from __future__ import annotations

import json
import re
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.ucp.models import AdapterDefinition


class AdapterRegistryError(ValueError):
    """适配器注册失败。"""


# 适配器类型枚举
ADAPTER_TYPES = {"HTTP", "DB", "FILE", "EVENT", "TRANSFORM", "CUSTOM"}

# Schema 字段类型
SCHEMA_FIELD_TYPES = {
    "string", "integer", "number", "boolean", "array", "object", "null",
}

# schema 字段最大嵌套深度
_MAX_SCHEMA_DEPTH = 5


# ===== Code 命名规则 =====
_ADAPTER_CODE_RE = re.compile(r"^[A-Z][A-Z0-9_]{2,63}$")


def _validate_adapter_code(code: str) -> str:
    if not isinstance(code, str) or not _ADAPTER_CODE_RE.match(code):
        raise AdapterRegistryError(
            f"adapter_code 格式错误: {code!r}, 需 ^[A-Z][A-Z0-9_]{{2,63}}$"
        )
    return code


def _validate_schema(schema: Any, depth: int = 0) -> dict:
    """校验并规范化 schema (简化版 JSON Schema)."""
    if depth > _MAX_SCHEMA_DEPTH:
        raise AdapterRegistryError(f"schema 嵌套深度超过 {_MAX_SCHEMA_DEPTH}")
    if not isinstance(schema, dict):
        raise AdapterRegistryError("schema 必须为 dict")
    out: dict[str, Any] = {}
    for k, v in schema.items():
        if not isinstance(k, str):
            raise AdapterRegistryError(f"schema key 必须为 string: {k!r}")
        out[k] = v
    # 检查 fields 字段（如提供）
    if "fields" in out:
        fields = out["fields"]
        if not isinstance(fields, list):
            raise AdapterRegistryError("schema.fields 必须为 list")
        seen = set()
        for f in fields:
            if not isinstance(f, dict):
                raise AdapterRegistryError("field 必须为 dict")
            fname = f.get("name")
            if not isinstance(fname, str) or not fname:
                raise AdapterRegistryError("field.name 必填且非空")
            if fname in seen:
                raise AdapterRegistryError(f"field.name 重复: {fname}")
            seen.add(fname)
            ftype = f.get("type", "string")
            if ftype not in SCHEMA_FIELD_TYPES:
                raise AdapterRegistryError(
                    f"field.type 错误 {ftype!r}, 允许 {SCHEMA_FIELD_TYPES}"
                )
            if "required" in f and not isinstance(f["required"], bool):
                raise AdapterRegistryError("field.required 必须为 bool")
    return out


def _normalize_sample(sample: Any) -> dict | list | None:
    """sample_payload 必须是 dict 或 list, 且可 JSON 序列化。"""
    if sample is None:
        return None
    if not isinstance(sample, (dict, list)):
        raise AdapterRegistryError("sample_payload 必须为 dict 或 list")
    try:
        json.dumps(sample, ensure_ascii=False)
    except (TypeError, ValueError) as exc:
        raise AdapterRegistryError(f"sample_payload 不可 JSON 序列化: {exc}") from exc
    return sample


async def register_adapter(
    db: AsyncSession,
    *,
    adapter_code: str,
    adapter_type: str,
    name: str,
    description: str | None = None,
    schema: dict | None = None,
    sample_payload: dict | list | None = None,
    version: str = "1.0.0",
    created_by: str = "system",
) -> AdapterDefinition:
    """注册新 adapter (idempotent: 同 code 视为更新)."""
    code = _validate_adapter_code(adapter_code)
    if adapter_type not in ADAPTER_TYPES:
        raise AdapterRegistryError(
            f"adapter_type 错误 {adapter_type!r}, 允许 {sorted(ADAPTER_TYPES)}"
        )
    if not isinstance(name, str) or not name.strip():
        raise AdapterRegistryError("name 必填且非空")
    if len(name) > 128:
        raise AdapterRegistryError("name 长度不能超过 128")

    schema_norm = _validate_schema(schema or {})
    sample_norm = _normalize_sample(sample_payload)

    # 查找现有记录
    stmt = select(AdapterDefinition).where(AdapterDefinition.adapter_code == code)
    existing = (await db.execute(stmt)).scalar_one_or_none()

    if existing is None:
        # 校验同类型下 code 唯一
        defn = AdapterDefinition(
            adapter_code=code,
            adapter_type=adapter_type,
            name=name.strip(),
            description=(description or "").strip() or None,
            schema_json=schema_norm,
            sample_payload=sample_norm,
            version=version,
            is_active=False,  # 默认未启用, 需审核
            created_by=created_by,
        )
        db.add(defn)
        await db.commit()
        await db.refresh(defn)
        return defn

    # 已存在: 更新元数据, 不动 is_active (避免误启)
    existing.adapter_type = adapter_type
    existing.name = name.strip()
    existing.description = (description or "").strip() or None
    existing.schema_json = schema_norm
    existing.sample_payload = sample_norm
    existing.version = version
    await db.commit()
    await db.refresh(existing)
    return existing


async def activate_adapter(
    db: AsyncSession, adapter_code: str, is_active: bool = True
) -> AdapterDefinition:
    """启用 / 停用 adapter."""
    _validate_adapter_code(adapter_code)
    stmt = select(AdapterDefinition).where(
        AdapterDefinition.adapter_code == adapter_code
    )
    defn = (await db.execute(stmt)).scalar_one_or_none()
    if defn is None:
        raise AdapterRegistryError(f"adapter 不存在: {adapter_code}")
    defn.is_active = is_active
    await db.commit()
    await db.refresh(defn)
    return defn


async def get_adapter_definition(
    db: AsyncSession, adapter_code: str
) -> AdapterDefinition | None:
    stmt = select(AdapterDefinition).where(
        AdapterDefinition.adapter_code == adapter_code
    )
    return (await db.execute(stmt)).scalar_one_or_none()


async def list_adapter_definitions(
    db: AsyncSession,
    *,
    adapter_type: str | None = None,
    is_active: bool | None = None,
    keyword: str | None = None,
    limit: int = 50,
    offset: int = 0,
) -> tuple[list[AdapterDefinition], int]:
    """返回 (list, total)."""
    from sqlalchemy import func

    stmt = select(AdapterDefinition)
    count_stmt = select(func.count(AdapterDefinition.id))

    if adapter_type:
        stmt = stmt.where(AdapterDefinition.adapter_type == adapter_type)
        count_stmt = count_stmt.where(AdapterDefinition.adapter_type == adapter_type)
    if is_active is not None:
        stmt = stmt.where(AdapterDefinition.is_active == is_active)
        count_stmt = count_stmt.where(AdapterDefinition.is_active == is_active)
    if keyword:
        like = f"%{keyword}%"
        stmt = stmt.where(AdapterDefinition.name.like(like))
        count_stmt = count_stmt.where(AdapterDefinition.name.like(like))

    total = (await db.execute(count_stmt)).scalar_one()
    stmt = stmt.order_by(AdapterDefinition.id.desc()).limit(limit).offset(offset)
    rows = (await db.execute(stmt)).scalars().all()
    return list(rows), int(total)


async def delete_adapter_definition(db: AsyncSession, adapter_code: str) -> bool:
    """删除 adapter 注册 (硬删除). 仅未启用且未被 pipeline 引用的可删."""
    from app.ucp.models import UcpPipeline

    _validate_adapter_code(adapter_code)
    defn = await get_adapter_definition(db, adapter_code)
    if defn is None:
        return False
    if defn.is_active:
        raise AdapterRegistryError("已启用的 adapter 不可删除, 请先停用")
    # 检查 pipeline 引用
    import json as _json
    pattern = f'%"{adapter_code}"%'
    pipe_stmt = select(UcpPipeline.id).where(
        UcpPipeline.steps_json.like(pattern)
    ).limit(1)
    in_use = (await db.execute(pipe_stmt)).scalar_one_or_none() is not None
    if in_use:
        raise AdapterRegistryError(f"adapter 已被 pipeline 引用: {adapter_code}")
    await db.delete(defn)
    await db.commit()
    return True


def serialize_adapter(defn: AdapterDefinition) -> dict:
    return {
        "id": defn.id,
        "adapter_code": defn.adapter_code,
        "adapter_type": defn.adapter_type,
        "name": defn.name,
        "description": defn.description,
        "schema": defn.schema_json or {},
        "sample_payload": defn.sample_payload,
        "version": defn.version,
        "is_active": defn.is_active,
        "created_by": defn.created_by,
        "created_at": defn.created_at.isoformat() if defn.created_at else None,
        "updated_at": defn.updated_at.isoformat() if defn.updated_at else None,
    }
