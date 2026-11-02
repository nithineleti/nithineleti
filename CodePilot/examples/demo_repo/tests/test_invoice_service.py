import pytest

from shop.invoice_service import loyalty_discount


def test_loyal_customer_above_threshold():
    assert loyalty_discount(150, True) == 15.0


def test_loyal_customer_at_threshold_gets_discount():
    assert loyalty_discount(100, True) == 10.0


def test_non_loyal_customer_gets_no_discount():
    assert loyalty_discount(150, False) == 0.0


def test_below_threshold_gets_no_discount():
    assert loyalty_discount(99.99, True) == 0.0


def test_negative_subtotal_rejected():
    with pytest.raises(ValueError):
        loyalty_discount(-1, True)
