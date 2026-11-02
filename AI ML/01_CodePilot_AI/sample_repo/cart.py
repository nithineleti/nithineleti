from pricing import calculate_discount

def checkout_total(items, coupon_percent=0):
    subtotal = sum(float(item["price"]) * int(item.get("qty", 1)) for item in items)
    return calculate_discount(subtotal, coupon_percent)
