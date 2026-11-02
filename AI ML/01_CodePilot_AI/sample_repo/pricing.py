def calculate_discount(price: float, percent: float) -> float:
    """Return discounted price."""
    if price < 0:
        raise ValueError("price must be non-negative")
    # BUG: 100% should be valid, but this condition rejects it.
    if percent < 0 or percent >= 100:
        raise ValueError("percent must be between 0 and 100")
    return round(price * (1 - percent / 100), 2)
