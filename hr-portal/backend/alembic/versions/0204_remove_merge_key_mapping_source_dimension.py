"""Remove source dimension from template key mappings."""
from alembic import op
import sqlalchemy as sa

revision = "0204_remove_merge_key_mapping_source_dimension"
down_revision = "0203_table_merge_key_mapping_dwd_relation"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    rows = bind.execute(sa.text(
        "SELECT id, template_id, source_key, canonical_merge_key "
        "FROM merge_key_mappings ORDER BY template_id, id"
    )).mappings().all()
    seen: dict[tuple[int, str], tuple[str, int]] = {}
    duplicates: list[str] = []
    for row in rows:
        key = (row["template_id"], str(row["source_key"]))
        canonical = str(row["canonical_merge_key"])
        previous = seen.get(key)
        if previous and previous[0] != canonical:
            duplicates.append(
                f"template_id={row['template_id']}, source_key={row['source_key']}, "
                f"ids={previous[1]},{row['id']}"
            )
        elif previous:
            bind.execute(sa.text("DELETE FROM merge_key_mappings WHERE id = :id"), {"id": row["id"]})
        else:
            seen[key] = (canonical, row["id"])
    if duplicates:
        raise RuntimeError("主键值映射存在无法自动合并的冲突: " + "; ".join(duplicates))

    inspector = sa.inspect(bind)
    foreign_keys = inspector.get_foreign_keys("merge_key_mappings")
    for foreign_key in foreign_keys:
        if foreign_key.get("constrained_columns") == ["source_mapping_id"]:
            op.drop_constraint(foreign_key["name"], "merge_key_mappings", type_="foreignkey")
    indexes = {item["name"] for item in inspector.get_indexes("merge_key_mappings")}
    if "ix_merge_key_mapping_context" in indexes:
        op.drop_index("ix_merge_key_mapping_context", table_name="merge_key_mappings")
    op.drop_column("merge_key_mappings", "source_mapping_id")
    op.create_index(
        "ix_merge_key_mapping_template", "merge_key_mappings", ["template_id"]
    )


def downgrade() -> None:
    op.drop_index("ix_merge_key_mapping_template", table_name="merge_key_mappings")
    op.add_column(
        "merge_key_mappings",
        sa.Column("source_mapping_id", sa.BigInteger(), nullable=True),
    )
    op.create_foreign_key(
        "fk_merge_key_mappings_source_mapping_id",
        "merge_key_mappings",
        "merge_source_mappings",
        ["source_mapping_id"],
        ["id"],
        ondelete="CASCADE",
    )
    op.create_index(
        "ix_merge_key_mapping_context",
        "merge_key_mappings",
        ["template_id", "source_mapping_id"],
    )
