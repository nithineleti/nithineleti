from policy.access import eligible

def test_minimum_age_is_inclusive():
    assert eligible(18) is True

def test_below_minimum_is_rejected():
    assert eligible(17) is False
