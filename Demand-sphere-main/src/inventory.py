from __future__ import annotations

from statistics import NormalDist

import numpy as np
import pandas as pd


def inventory_policy(
    forecast: pd.DataFrame,
    current_stock: int,
    lead_time_days: int,
    service_level: float,
    residual_std: float,
    review_period_days: int = 7,
    case_pack: int = 12,
    minimum_order_qty: int = 0,
    warehouse_capacity: int | None = None,
    shelf_life_days: int | None = None,
) -> dict:
    service_level = float(np.clip(service_level, 0.80, 0.995))
    z_value = NormalDist().inv_cdf(service_level)
    avg_daily = float(forecast["forecast"].mean())
    lead_time_demand = avg_daily * lead_time_days
    safety_stock = z_value * residual_std * np.sqrt(max(lead_time_days, 1))
    reorder_point = lead_time_demand + safety_stock
    target_stock = avg_daily * (lead_time_days + review_period_days) + safety_stock
    unconstrained_order = max(0, int(np.ceil(target_stock - current_stock)))
    case_pack = max(1, int(case_pack))
    recommended_order = int(np.ceil(unconstrained_order / case_pack) * case_pack) if unconstrained_order else 0
    if 0 < recommended_order < minimum_order_qty:
        recommended_order = int(np.ceil(minimum_order_qty / case_pack) * case_pack)

    constraints: list[str] = []
    if warehouse_capacity is not None:
        available_capacity = max(0, int(warehouse_capacity) - int(current_stock))
        capacity_order = int(np.floor(available_capacity / case_pack) * case_pack)
        if recommended_order > capacity_order:
            recommended_order = capacity_order
            constraints.append("warehouse capacity")
    shelf_life_risk = False
    if shelf_life_days is not None and shelf_life_days > 0:
        maximum_cover = int(np.floor(avg_daily * shelf_life_days * 0.85))
        shelf_life_order = max(0, maximum_cover - int(current_stock))
        shelf_life_order = int(np.floor(shelf_life_order / case_pack) * case_pack)
        if recommended_order > shelf_life_order:
            recommended_order = shelf_life_order
            constraints.append("shelf-life exposure")
            shelf_life_risk = True

    demand_std = max(1.0, residual_std * np.sqrt(max(lead_time_days, 1)))
    stockout_z = (current_stock - lead_time_demand) / demand_std
    stockout_probability = 1 - NormalDist().cdf(stockout_z)

    return {
        "average_daily_demand": round(avg_daily, 1),
        "lead_time_demand": round(lead_time_demand, 1),
        "safety_stock": int(np.ceil(safety_stock)),
        "reorder_point": int(np.ceil(reorder_point)),
        "recommended_order": recommended_order,
        "unconstrained_order": unconstrained_order,
        "stockout_risk_pct": round(stockout_probability * 100, 1),
        "service_level_pct": round(service_level * 100, 1),
        "case_pack": case_pack,
        "binding_constraints": ", ".join(constraints) if constraints else "none",
        "shelf_life_risk": shelf_life_risk,
    }
