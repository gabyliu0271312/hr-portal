from app.ai.channel_sessions import channel_key_hash


def test_channel_key_hash_is_stable_and_never_returns_raw_key():
    raw_key = "external-conversation-or-event-key"
    assert channel_key_hash(raw_key) == channel_key_hash(raw_key)
    assert raw_key not in channel_key_hash(raw_key)
    assert len(channel_key_hash(raw_key)) == 64
