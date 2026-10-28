"""Application-scoped employee switching and notification test records."""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "0280_app_identity_switch"
down_revision = "0279_performance_live_guard"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "app_identity_switch_settings",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("admin_operator_user_id", sa.BigInteger(), sa.ForeignKey("users.id")),
        sa.Column("others_enabled", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("generation", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("revision", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("test_delivery_enabled", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("test_receiver_user_id", sa.BigInteger(), sa.ForeignKey("users.id")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.CheckConstraint("id = 1", name="ck_identity_switch_singleton"),
    )
    op.execute("INSERT INTO app_identity_switch_settings (id, admin_operator_user_id) VALUES (1, (SELECT id FROM users WHERE login_name = 'admin'))")
    op.create_table(
        "app_identity_switch_sessions",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("operator_user_id", sa.BigInteger(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("target_employee_no", sa.String(64), nullable=False),
        sa.Column("target_display_name", sa.String(128), nullable=False),
        sa.Column("secret_hash", sa.String(64), unique=True, nullable=False),
        sa.Column("generation", sa.Integer(), nullable=False),
        sa.Column("request_id", sa.String(64), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("revoked_at", sa.DateTime(timezone=True)),
        sa.UniqueConstraint("operator_user_id", "request_id"),
    )
    op.create_index("ix_app_identity_switch_sessions_operator_user_id", "app_identity_switch_sessions", ["operator_user_id"])
    op.create_index("ix_app_identity_switch_sessions_expires_at", "app_identity_switch_sessions", ["expires_at"])
    op.create_table(
        "app_identity_switch_notification_runs",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("session_id", sa.String(36), sa.ForeignKey("app_identity_switch_sessions.id"), nullable=False),
        sa.Column("operator_user_id", sa.BigInteger(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("target_employee_no", sa.String(64), nullable=False),
        sa.Column("request_id", sa.String(64), nullable=False),
        sa.Column("source", sa.String(256), nullable=False),
        sa.Column("environment", sa.String(32), nullable=False),
        sa.Column("delivery_revision", sa.Integer(), nullable=False),
        sa.Column("items", postgresql.JSONB(), nullable=False),
        sa.Column("original_receivers", postgresql.JSONB(), nullable=False),
        sa.Column("sample_status", sa.String(32), nullable=False),
        sa.Column("summary_status", sa.String(32), nullable=False),
        sa.Column("delivery_error", sa.String(512)),
        sa.Column("delivery_requested_at", sa.DateTime(timezone=True)),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint("session_id", "request_id"),
    )
    op.create_index("ix_app_identity_switch_notification_runs_operator_user_id", "app_identity_switch_notification_runs", ["operator_user_id"])
    op.create_index("ix_app_identity_switch_notification_runs_created_at", "app_identity_switch_notification_runs", ["created_at"])


def downgrade():
    op.drop_table("app_identity_switch_notification_runs")
    op.drop_table("app_identity_switch_sessions")
    op.drop_table("app_identity_switch_settings")
