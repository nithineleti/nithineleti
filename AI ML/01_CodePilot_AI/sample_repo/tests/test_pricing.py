from pricing import calculate_discount

def test_regular_discount():
    assert calculate_discount(200, 25) == 150.0

def test_full_discount_is_allowed():
    assert calculate_discount(250, 100) == 0.0
