import pytest
from sqlalchemy.dialects import postgresql

from app.ai.channel_sessions import channel_key_hash, claim_channel_event


def test_channel_key_hash_is_stable_and_never_returns_raw_key():
    raw_key = "external-conversation-or-event-key"
    assert channel_key_hash(raw_key) == channel_key_hash(raw_key)
    assert raw_key not in channel_key_hash(raw_key)
    assert len(channel_key_hash(raw_key)) == 64


@pytest.mark.asyncio
async def test_claim_channel_event_uses_atomic_insert_to_reject_concurrent_duplicates():
    class Result:
        def __init__(self, inserted_id):
            self.inserted_id = inserted_id

        def scalar_one_or_none(self):
            return self.inserted_id

    class Db:
        def __init__(self):
            self.statements = []
            self.inserted_ids = iter([101, None])

        async def execute(self, statement):
            self.statements.append(statement)
            return Result(next(self.inserted_ids))

    db = Db()
    assert await claim_channel_event(db, channel="feishu", event_key="msg-1") is True
    assert await claim_channel_event(db, channel="feishu", event_key="msg-1") is False

    sql = str(db.statements[0].compile(dialect=postgresql.dialect()))
    assert "ON CONFLICT (channel, event_key_hash) DO NOTHING" in sql
    assert "RETURNING ai_channel_events.id" in sql
