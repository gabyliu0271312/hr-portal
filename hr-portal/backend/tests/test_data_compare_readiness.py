from app.data_compare.executor import source_has_data


class _Meta:
    table_name = "monthly_a"
    period_col = "period_ym"
    is_period = True


class _Loader:
    async def validate_table(self, _name):
        return _Meta()


class _Result:
    def first(self):
        return (1,)


class _Db:
    def __init__(self):
        self.calls = []

    async def execute(self, statement, params=None):
        self.calls.append((str(statement), params))
        return _Result()


async def test_source_readiness_uses_scope_alias_for_roster():
    db = _Db()

    assert await source_has_data(
        table_name="monthly_a",
        period="202608",
        prefilters=[],
        loader=_Loader(),
        scope_clause='"t_a"."org_id" IN (1)',
        table_alias="t_a",
        db=db,
    )

    sql = db.calls[-1][0]
    assert 'FROM "monthly_a" t_a' in sql
    assert '"t_a"."period_ym"' in sql
    assert '"t_a"."org_id"' in sql
