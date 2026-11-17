"""Allow multiple cycle comparison rule groups."""
from alembic import op

revision = "0310_pm_multiple_comparison_rules"
down_revision = "0309_form_config_menu"
branch_labels = None
depends_on = None


def upgrade():
    op.drop_constraint("ck_pm_cycle_comparison_rules", "performance_cycles", type_="check")
    op.create_check_constraint("ck_pm_cycle_comparison_rules", "performance_cycles", "jsonb_typeof(semester_diff_rules) = 'array'")


def downgrade():
    op.execute("""
        DO $$ BEGIN
            IF EXISTS (SELECT 1 FROM performance_cycles WHERE jsonb_array_length(semester_diff_rules) > 1)
                OR EXISTS (SELECT 1 FROM performance_projects WHERE jsonb_array_length(COALESCE(settings->'comparison_rules_snapshot'->'rules', '[]'::jsonb)) > 1)
            THEN
                RAISE EXCEPTION 'Multiple comparison groups exist; downgrade is not safe';
            END IF;
        END $$;
    """)
    op.drop_constraint("ck_pm_cycle_comparison_rules", "performance_cycles", type_="check")
    op.create_check_constraint("ck_pm_cycle_comparison_rules", "performance_cycles", "CASE WHEN jsonb_typeof(semester_diff_rules) = 'array' THEN jsonb_array_length(semester_diff_rules) <= 1 ELSE false END")
