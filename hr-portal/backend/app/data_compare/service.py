"""Data comparison skill CRUD service.

Ownership model:
  - list_skills: filters by created_by unless user is super_admin
  - get/update/delete: caller must verify ownership via user_can_access()
"""
from __future__ import annotations

from datetime import datetime, timezone

from fastapi.encoders import jsonable_encoder
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.data_compare.models import AiSkill
from app.data_compare.schemas import (
    SkillCreate,
    SkillListParams,
    SkillUpdate,
)
from app.permissions.scope_filter import _is_super_admin


def to_json_compatible(value: object) -> object:
    """Convert comparison output to values accepted by JSON database columns."""
    return jsonable_encoder(value)


async def user_can_access(skill: AiSkill, user_id: int, db: AsyncSession) -> bool:
    """Check whether the given user can access/modify a skill.

    Super admins bypass ownership checks. Regular users can only access
    their own skills (created_by match).
    """
    from app.users.models import User
    user = await db.get(User, user_id)
    if user is None:
        return False
    if await _is_super_admin(user, db):
        return True
    return skill.created_by == user_id


async def create_skill(db: AsyncSession, data: SkillCreate, user_id: int) -> AiSkill:
    skill = AiSkill(
        name=data.name,
        description=data.description,
        instruction=data.instruction,
        params=data.params,
        status=data.status,
        source="manual",
        created_by=user_id,
    )
    db.add(skill)
    await db.commit()
    await db.refresh(skill)
    return skill


async def list_skills(
    db: AsyncSession,
    params: SkillListParams,
    user_id: int | None = None,
) -> tuple[list[AiSkill], int]:
    """List skills with ownership filtering.

    If user_id is provided, filters to only show that user's skills
    (unless the caller is super_admin, handled upstream in router).
    """
    base = select(AiSkill)
    count_base = select(func.count(AiSkill.id))

    # Ownership filter — regular users see only their own skills
    if user_id is not None:
        base = base.where(AiSkill.created_by == user_id)
        count_base = count_base.where(AiSkill.created_by == user_id)

    if params.skill_type:
        base = base.where(AiSkill.skill_type == params.skill_type)
        count_base = count_base.where(AiSkill.skill_type == params.skill_type)
    if params.status:
        base = base.where(AiSkill.status == params.status)
        count_base = count_base.where(AiSkill.status == params.status)

    total = (await db.execute(count_base)).scalar() or 0

    query = base.order_by(AiSkill.updated_at.desc()).offset(params.offset).limit(params.limit)
    rows = (await db.execute(query)).scalars().all()

    return list(rows), total


async def get_skill(db: AsyncSession, skill_id: int) -> AiSkill | None:
    return await db.get(AiSkill, skill_id)


async def update_skill(db: AsyncSession, skill_id: int, data: SkillUpdate) -> AiSkill | None:
    skill = await db.get(AiSkill, skill_id)
    if skill is None:
        return None

    update_data = data.model_dump(exclude_unset=True)
    for key, val in update_data.items():
        setattr(skill, key, val)

    await db.commit()
    await db.refresh(skill)
    return skill


async def delete_skill(db: AsyncSession, skill_id: int) -> bool:
    skill = await db.get(AiSkill, skill_id)
    if skill is None:
        return False
    await db.delete(skill)
    await db.commit()
    return True


async def record_skill_run(db: AsyncSession, skill_id: int, result: dict) -> None:
    skill = await db.get(AiSkill, skill_id)
    if skill is None:
        return
    skill.last_run_at = datetime.now(timezone.utc)
    skill.last_run_result = to_json_compatible(result)
    skill.run_count = (skill.run_count or 0) + 1
    await db.commit()
