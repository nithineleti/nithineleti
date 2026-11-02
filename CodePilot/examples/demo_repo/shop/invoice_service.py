def loyalty_discount(subtotal: float, loyal_customer: bool) -> float:
    """Return the discount amount for an invoice.

    Business rule: loyal customers receive 10% off when the subtotal is
    at least 100. Non-loyal customers never receive this loyalty discount.
    """
    if subtotal < 0:
        raise ValueError("subtotal must be non-negative")

    # Intentional demo defect: the threshold should be inclusive.
    if loyal_customer and subtotal > 100:
        return round(subtotal * 0.10, 2)
    return 0.0
