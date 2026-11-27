from sqlalchemy import BigInteger, CheckConstraint, ForeignKey, Identity, Integer, JSON, String, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base


class PerformanceMemberFilterPreset(Base):
    __tablename__ = "performance_member_filter_presets"
    __table_args__ = (
        UniqueConstraint("owner_type", "owner_ref", "cycle_id", "management_role", "name", name="uq_pm_member_filter_preset_scope_name"),
        CheckConstraint("length(trim(name)) BETWEEN 1 AND 500", name="ck_pm_member_filter_preset_name"),
        CheckConstraint("management_role IN ('', 'hrbp', 'project_admin')", name="ck_pm_member_filter_preset_role"),
    )

    id: Mapped[int] = mapped_column(BigInteger().with_variant(Integer(), "sqlite"), Identity(), primary_key=True)
    owner_type: Mapped[str] = mapped_column(String(32), nullable=False)
    owner_ref: Mapped[str] = mapped_column(String(64), nullable=False)
    cycle_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("performance_cycles.id", ondelete="CASCADE"), nullable=False)
    management_role: Mapped[str] = mapped_column(String(32), nullable=False)
    name: Mapped[str] = mapped_column(String(500), nullable=False)
    filters: Mapped[dict] = mapped_column(JSON().with_variant(JSONB(), "postgresql"), nullable=False)
