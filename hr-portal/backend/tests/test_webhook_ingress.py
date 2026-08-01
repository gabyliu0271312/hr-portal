from app.ucp.webhook_ingress import extract_path, verify_timestamped_hmac, validate_ingress_config


def test_timestamped_hmac_round_trip():
    raw = b'{"request_id":"req-1"}'
    signature = __import__('hmac').new(
        b'secret', b'1700000000\nnonce\nreq-1\n' + __import__('hashlib').sha256(raw).hexdigest().encode(), __import__('hashlib').sha256
    ).hexdigest()
    assert verify_timestamped_hmac(raw_body=raw, secret='secret', timestamp='1700000000', nonce='nonce', request_id='req-1', signature=signature, now=1700000000)


def test_timestamped_hmac_rejects_expired_request():
    assert not verify_timestamped_hmac(raw_body=b'{}', secret='secret', timestamp='1', nonce='nonce', request_id='req-1', signature='x', now=1000)


def test_ingress_config_and_path_are_restricted():
    config = validate_ingress_config({'verification_strategy': 'hmac_sha256_timestamped', 'event_type_path': 'event.type'})
    assert config['verification_strategy'] == 'HMAC_SHA256_TIMESTAMPED'
    assert extract_path({'event': {'type': 'locked'}}, 'event.type') == 'locked'
