from policy.retry import retry_allowed

def test_maximum_retry_is_inclusive():
    assert retry_allowed(3) is True

def test_above_maximum_is_rejected():
    assert retry_allowed(4) is False
