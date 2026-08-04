"""Persistence models for performance authorization foundations."""
from __future__ import annotations

from datetime import datetime

from sqlalchemy import BigInteger, Boolean, CheckConstraint, DateTime, ForeignKey, ForeignKeyConstraint, Index, String, Text, UniqueConstraint, text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.sql import func

from app.core.db import Base


SYSTEM_ACCOUNT_TYPE_SUPER_ADMIN = "PERFORMANCE_SUPER_ADMIN"
SYSTEM_ACCOUNT_TYPE_ADMIN = "PERFORMANCE_ADMIN"
SUBJECT_TYPE_PORTAL_USER = "PORTAL_USER"
SUBJECT_TYPE_SYSTEM_ACCOUNT = "SYSTEM_ACCOUNT"
SCOPE_TYPE_GLOBAL = "GLOBAL"
SCOPE_TYPE_ORG = "ORG"
SCOPE_TYPE_PROJECT = "PROJECT"


class PerformanceSystemAccount(Base):
    __tablename__ = "performance_system_accounts"
    __table_args__ = (
        CheckConstraint(
            "account_type IN ('PERFORMANCE_SUPER_ADMIN', 'PERFORMANCE_ADMIN')",
            name="ck_performance_system_account_type",
        ),
        Index(
            "uq_performance_system_accounts_single_super_admin",
            "account_type",
            unique=True,
            postgresql_where=text("account_type = 'PERFORMANCE_SUPER_ADMIN'"),
        ),
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    username: Mapped[str] = mapped_column(String(64), unique=True, nullable=False)
    display_name: Mapped[str] = mapped_column(String(64), nullable=False)
    password_hash: Mapped[str] = mapped_column(String(128), nullable=False)
    account_type: Mapped[str] = mapped_column(String(32), nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    last_login_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )


class PerformanceRole(Base):
    __tablename__ = "performance_roles"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    code: Mapped[str] = mapped_column(String(64), unique=True, nullable=False)
    name: Mapped[str] = mapped_column(String(64), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    is_system: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )


class PerformancePermission(Base):
    __tablename__ = "performance_permissions"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    code: Mapped[str] = mapped_column(String(96), unique=True, nullable=False)
    name: Mapped[str] = mapped_column(String(96), nullable=False)
    category: Mapped[str] = mapped_column(String(32), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )


class PerformanceRolePermission(Base):
    __tablename__ = "performance_role_permissions"

    role_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("performance_roles.id", ondelete="CASCADE"), primary_key=True
    )
    permission_id: Mapped[int] = mapped_column(
        BigInteger,
        ForeignKey("performance_permissions.id", ondelete="CASCADE"),
        primary_key=True,
    )


class PerformanceRoleAssignment(Base):
    __tablename__ = "performance_role_assignments"
    __table_args__ = (
        CheckConstraint(
            "subject_type IN ('PORTAL_USER', 'SYSTEM_ACCOUNT')",
            name="ck_performance_role_assignment_subject_type",
        ),
        CheckConstraint(
            "scope_type IN ('GLOBAL', 'ORG', 'PROJECT')",
            name="ck_performance_role_assignment_scope_type",
        ),
        UniqueConstraint(
            "subject_type",
            "subject_id",
            "role_id",
            "scope_type",
            "scope_ref",
            name="uq_performance_role_assignment_scope",
        ),
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    subject_type: Mapped[str] = mapped_column(String(32), nullable=False)
    subject_id: Mapped[int] = mapped_column(BigInteger, nullable=False)
    role_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("performance_roles.id", ondelete="CASCADE"), nullable=False
    )
    scope_type: Mapped[str] = mapped_column(String(16), nullable=False, default=SCOPE_TYPE_GLOBAL)
    scope_ref: Mapped[str] = mapped_column(String(64), nullable=False, default=SCOPE_TYPE_GLOBAL)
    starts_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    ends_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )

AUTHORIZATION_SNAPSHOT_STATUS_DRAFT = "DRAFT"
AUTHORIZATION_SNAPSHOT_STATUS_LOCKED = "LOCKED"
DYNAMIC_IDENTITY_TYPE_SELF = "SELF"
DYNAMIC_IDENTITY_TYPE_DIRECT_MANAGER = "DIRECT_MANAGER"
DYNAMIC_IDENTITY_TYPE_INDIRECT_MANAGER = "INDIRECT_MANAGER"
DYNAMIC_IDENTITY_TYPE_HRBP = "HRBP"
DYNAMIC_IDENTITY_TYPE_REVIEWER_360 = "REVIEWER_360"
DYNAMIC_IDENTITY_TYPE_CALIBRATOR = "CALIBRATOR"
DYNAMIC_IDENTITY_TYPE_PROJECT_ADMIN = "PROJECT_ADMIN"
DYNAMIC_IDENTITY_TYPE_APPEAL_HANDLER = "APPEAL_HANDLER"
DYNAMIC_ASSIGNMENT_ACTOR_TYPE_EMPLOYEE = "EMPLOYEE"
DYNAMIC_ASSIGNMENT_ACTOR_TYPE_PORTAL_USER = "PORTAL_USER"
DYNAMIC_ASSIGNMENT_ACTOR_TYPE_SYSTEM_ACCOUNT = "SYSTEM_ACCOUNT"
DYNAMIC_ASSIGNMENT_ACTOR_TYPE_PERFORMANCE_ROLE = "PERFORMANCE_ROLE"
DYNAMIC_ASSIGNMENT_TARGET_TYPE_EMPLOYEE = "EMPLOYEE"
DYNAMIC_ASSIGNMENT_TARGET_TYPE_ORG = "ORG"
DYNAMIC_ASSIGNMENT_TARGET_TYPE_PROJECT = "PROJECT"
DYNAMIC_ASSIGNMENT_SOURCE_SYNC = "SYNC"
DYNAMIC_ASSIGNMENT_SOURCE_MANUAL = "MANUAL"
DYNAMIC_ASSIGNMENT_SOURCE_CONFIGURATION = "CONFIGURATION"


class PerformanceAuthorizationSnapshot(Base):
    __tablename__ = "performance_authorization_snapshots"
    __table_args__ = (
        CheckConstraint(
            "status IN ('DRAFT', 'LOCKED')",
            name="ck_performance_authorization_snapshot_status",
        ),
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    cycle_ref: Mapped[str] = mapped_column(String(64), unique=True, nullable=False)
    status: Mapped[str] = mapped_column(
        String(16),
        nullable=False,
        default=AUTHORIZATION_SNAPSHOT_STATUS_DRAFT,
    )
    locked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    last_synced_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )


class PerformanceAuthorizationSnapshotPerson(Base):
    __tablename__ = "performance_authorization_snapshot_people"
    __table_args__ = (
        UniqueConstraint(
            "snapshot_id",
            "employee_no",
            name="uq_performance_authorization_snapshot_person",
        ),
        Index(
            "ix_performance_authorization_snapshot_people_manager",
            "snapshot_id",
            "direct_manager_employee_no",
        ),
        Index(
            "ix_performance_authorization_snapshot_people_hrbp",
            "snapshot_id",
            "hrbp_employee_no",
        ),
        UniqueConstraint(
            "snapshot_id",
            "portal_user_id",
            name="uq_performance_authorization_snapshot_portal_user",
        ),
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    snapshot_id: Mapped[int] = mapped_column(
        BigInteger,
        ForeignKey("performance_authorization_snapshots.id", ondelete="CASCADE"),
        nullable=False,
    )
    source_roster_id: Mapped[int | None] = mapped_column(BigInteger, nullable=True)
    portal_user_id: Mapped[int | None] = mapped_column(BigInteger, nullable=True)
    employee_no: Mapped[str] = mapped_column(String(64), nullable=False)
    display_name: Mapped[str] = mapped_column(String(128), nullable=False)
    organization_ref: Mapped[str | None] = mapped_column(String(128), nullable=True)
    direct_manager_employee_no: Mapped[str | None] = mapped_column(String(64), nullable=True)
    direct_manager_source_value: Mapped[str | None] = mapped_column(String(256), nullable=True)
    hrbp_employee_no: Mapped[str | None] = mapped_column(String(64), nullable=True)
    hrbp_source_value: Mapped[str | None] = mapped_column(String(256), nullable=True)
    employment_status: Mapped[str | None] = mapped_column(String(64), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )


class PerformanceIdentityLink(Base):
    __tablename__ = "performance_identity_links"
    __table_args__ = (
        UniqueConstraint("portal_user_id", name="uq_performance_identity_link_portal_user"),
        UniqueConstraint("employee_no", name="uq_performance_identity_link_employee"),
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    portal_user_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    employee_no: Mapped[str] = mapped_column(String(64), nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )


class PerformanceObjectAuthorizationState(Base):
    __tablename__ = "performance_object_authorization_states"
    __table_args__ = (
        UniqueConstraint(
            "snapshot_id", "employee_no", name="uq_performance_object_authorization_state"
        ),
        ForeignKeyConstraint(
            ["snapshot_id", "employee_no"],
            [
                "performance_authorization_snapshot_people.snapshot_id",
                "performance_authorization_snapshot_people.employee_no",
            ],
            name="fk_performance_object_authorization_state_snapshot_person",
            ondelete="CASCADE",
        ),
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    snapshot_id: Mapped[int] = mapped_column(
        BigInteger,
        ForeignKey("performance_authorization_snapshots.id", ondelete="CASCADE"),
        nullable=False,
    )
    employee_no: Mapped[str] = mapped_column(String(64), nullable=False)
    cycle_status: Mapped[str] = mapped_column(String(32), nullable=False)
    node_status: Mapped[str] = mapped_column(String(32), nullable=False)
    record_status: Mapped[str] = mapped_column(String(32), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )


class PerformanceDynamicIdentityAssignment(Base):
    __tablename__ = "performance_dynamic_identity_assignments"
    __table_args__ = (
        CheckConstraint(
            "actor_type IN ('EMPLOYEE', 'PORTAL_USER', 'SYSTEM_ACCOUNT', 'PERFORMANCE_ROLE')",
            name="ck_performance_dynamic_identity_actor_type",
        ),
        CheckConstraint(
            "identity_type IN ('SELF', 'DIRECT_MANAGER', 'INDIRECT_MANAGER', 'HRBP', "
            "'REVIEWER_360', 'CALIBRATOR', 'PROJECT_ADMIN', 'APPEAL_HANDLER')",
            name="ck_performance_dynamic_identity_type",
        ),
        CheckConstraint(
            "target_type IN ('EMPLOYEE', 'ORG', 'PROJECT')",
            name="ck_performance_dynamic_identity_target_type",
        ),
        CheckConstraint(
            "source_type IN ('SYNC', 'MANUAL', 'CONFIGURATION')",
            name="ck_performance_dynamic_identity_source_type",
        ),
        CheckConstraint(
            "(assigned_by_type IS NULL) = (assigned_by_ref IS NULL)",
            name="ck_performance_dynamic_identity_assigned_by_pair",
        ),
        CheckConstraint(
            "assigned_by_type IS NULL OR assigned_by_type IN "
            "('EMPLOYEE', 'PORTAL_USER', 'SYSTEM_ACCOUNT', 'PERFORMANCE_ROLE')",
            name="ck_performance_dynamic_identity_assigned_by_type",
        ),
        UniqueConstraint(
            "snapshot_id",
            "actor_type",
            "actor_ref",
            "identity_type",
            "target_type",
            "target_ref",
            name="uq_performance_dynamic_identity_scope",
        ),
        Index(
            "ix_performance_dynamic_identity_actor",
            "snapshot_id",
            "actor_type",
            "actor_ref",
            "identity_type",
            "is_active",
        ),
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    snapshot_id: Mapped[int] = mapped_column(
        BigInteger,
        ForeignKey("performance_authorization_snapshots.id", ondelete="CASCADE"),
        nullable=False,
    )
    actor_type: Mapped[str] = mapped_column(String(32), nullable=False)
    actor_ref: Mapped[str] = mapped_column(String(64), nullable=False)
    identity_type: Mapped[str] = mapped_column(String(32), nullable=False)
    target_type: Mapped[str] = mapped_column(String(16), nullable=False)
    target_ref: Mapped[str] = mapped_column(String(64), nullable=False)
    source_type: Mapped[str] = mapped_column(String(32), nullable=False)
    assigned_by_type: Mapped[str | None] = mapped_column(String(32), nullable=True)
    assigned_by_ref: Mapped[str | None] = mapped_column(String(64), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )

PUBLICATION_TRANSFER_ACTOR_TYPES = (
    "EMPLOYEE",
    "PORTAL_USER",
    "SYSTEM_ACCOUNT",
)


class PerformancePublicationTransfer(Base):
    __tablename__ = "performance_publication_transfers"
    __table_args__ = (
        CheckConstraint(
            "transferred_by_type IN ('EMPLOYEE', 'PORTAL_USER', 'SYSTEM_ACCOUNT')",
            name="ck_performance_publication_transfer_actor_type",
        ),
        CheckConstraint(
            "recipient_type IN ('EMPLOYEE', 'PORTAL_USER', 'SYSTEM_ACCOUNT')",
            name="ck_performance_publication_transfer_recipient_type",
        ),
        Index(
            "uq_performance_publication_transfer_active_target",
            "cycle_ref",
            "employee_no",
            unique=True,
            postgresql_where=text("is_active = true"),
        ),
        Index(
            "ix_performance_publication_transfer_recipient",
            "cycle_ref",
            "recipient_type",
            "recipient_ref",
            "is_active",
        ),
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    cycle_ref: Mapped[str] = mapped_column(String(64), nullable=False)
    employee_no: Mapped[str] = mapped_column(String(64), nullable=False)
    original_direct_manager_employee_no: Mapped[str] = mapped_column(String(64), nullable=False)
    transferred_by_type: Mapped[str] = mapped_column(String(32), nullable=False)
    transferred_by_ref: Mapped[str] = mapped_column(String(64), nullable=False)
    recipient_type: Mapped[str] = mapped_column(String(32), nullable=False)
    recipient_ref: Mapped[str] = mapped_column(String(64), nullable=False)
    reason: Mapped[str] = mapped_column(Text, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    transferred_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )


class PerformanceAuditEvent(Base):
    __tablename__ = "performance_audit_events"
    __table_args__ = (
        Index(
            "ix_performance_audit_event_cycle_employee",
            "cycle_ref",
            "employee_no",
            "event_at",
        ),
        Index("ix_performance_audit_event_type", "event_type", "event_at"),
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    event_type: Mapped[str] = mapped_column(String(64), nullable=False)
    cycle_ref: Mapped[str | None] = mapped_column(String(64), nullable=True)
    employee_no: Mapped[str | None] = mapped_column(String(64), nullable=True)
    actor_type: Mapped[str] = mapped_column(String(32), nullable=False)
    actor_ref: Mapped[str] = mapped_column(String(64), nullable=False)
    subject_type: Mapped[str | None] = mapped_column(String(32), nullable=True)
    subject_ref: Mapped[str | None] = mapped_column(String(64), nullable=True)
    before_state: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    after_state: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    event_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
