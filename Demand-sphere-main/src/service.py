from __future__ import annotations

from dataclasses import dataclass

import numpy as np
import pandas as pd

from .config import FEATURES, IMPORTANCE_PATH
from .data import PRODUCTS, load_data
from .inventory import inventory_policy
from .modeling import DemandModelBundle, load_bundle


@dataclass
class ScenarioResult:
    forecast: pd.DataFrame
    policy: dict
    explanation: str


class DemandIntelligenceService:
    def __init__(self):
        self.data = load_data()
        self.bundle: DemandModelBundle = load_bundle()
        self.importance = pd.read_csv(IMPORTANCE_PATH) if IMPORTANCE_PATH.exists() else pd.DataFrame()

    @property
    def skus(self) -> list[str]:
        return list(PRODUCTS)

    @property
    def regions(self) -> list[str]:
        return sorted(self.data["region"].unique().tolist())

    def _future_row(
        self,
        history: pd.DataFrame,
        demand_history: list[float],
        date: pd.Timestamp,
        promotion: bool,
        discount_pct: float,
    ) -> dict:
        latest = history.iloc[-1]
        list_value = lambda lag: demand_history[-lag] if len(demand_history) >= lag else float(np.mean(demand_history))
        price_reference = float(history.loc[history["discount_pct"].eq(0), "price"].median())
        if np.isnan(price_reference):
            price_reference = float(history["price"].median())
        promo = int(promotion)
        discount = float(discount_pct if promo else 0.0)
        row = {
            "sku": latest["sku"],
            "category": latest["category"],
            "region": latest["region"],
            "channel": latest["channel"],
            "price": price_reference * (1 - discount / 100),
            "discount_pct": discount,
            "promotion": promo,
            "holiday": int(date.dayofweek == 6 and date.day in (1, 15, 30)),
            "competitor_price_index": float(history["competitor_price_index"].tail(60).median()),
            "marketing_spend": float(1450 if promo else 520),
            "temperature_c": float(history["temperature_c"].tail(30).mean()),
            "rainfall_mm": float(history["rainfall_mm"].tail(30).median()),
            "day_of_week": int(date.dayofweek),
            "month": int(date.month),
            "day_sin": float(np.sin(2 * np.pi * date.dayofweek / 7)),
            "day_cos": float(np.cos(2 * np.pi * date.dayofweek / 7)),
            "lag_1": list_value(1),
            "lag_7": list_value(7),
            "lag_14": list_value(14),
            "lag_28": list_value(28),
            "rolling_mean_7": float(np.mean(demand_history[-7:])),
            "rolling_mean_28": float(np.mean(demand_history[-28:])),
            "rolling_std_7": float(np.std(demand_history[-7:], ddof=1)),
        }
        return row

    def run_scenario(
        self,
        sku: str,
        region: str,
        horizon: int = 28,
        promotion: bool = False,
        discount_pct: float = 0,
        current_stock: int = 900,
        lead_time_days: int = 7,
        service_level: float = 0.95,
        case_pack: int = 12,
        minimum_order_qty: int = 0,
        warehouse_capacity: int | None = 5000,
        shelf_life_days: int | None = 60,
    ) -> ScenarioResult:
        history = self.data[(self.data["sku"] == sku) & (self.data["region"] == region)].copy()
        if history.empty:
            raise ValueError(f"No history found for {sku} in {region}")
        history = history.sort_values("date")
        demand_history = history["units_demand"].astype(float).tolist()
        start = history["date"].max() + pd.Timedelta(days=1)
        future_records = []
        scenario_first_row = None

        for date in pd.date_range(start=start, periods=int(horizon), freq="D"):
            row = self._future_row(history, demand_history, date, promotion, discount_pct)
            if scenario_first_row is None:
                scenario_first_row = row.copy()
            X = pd.DataFrame([row])[FEATURES]
            point, low, high = self.bundle.predict(X)
            predicted = float(point[0])
            future_records.append(
                {"date": date, "forecast": round(predicted, 1), "lower_80": round(float(low[0]), 1), "upper_80": round(float(high[0]), 1)}
            )
            demand_history.append(predicted)

        forecast = pd.DataFrame(future_records)
        policy = inventory_policy(
            forecast,
            current_stock=int(current_stock),
            lead_time_days=int(lead_time_days),
            service_level=float(service_level),
            residual_std=self.bundle.residual_std,
            case_pack=int(case_pack),
            minimum_order_qty=int(minimum_order_qty),
            warehouse_capacity=int(warehouse_capacity) if warehouse_capacity is not None else None,
            shelf_life_days=int(shelf_life_days) if shelf_life_days is not None else None,
        )

        counterfactual = scenario_first_row.copy()
        counterfactual["promotion"] = 0
        counterfactual["discount_pct"] = 0.0
        price_reference = float(history.loc[history["discount_pct"].eq(0), "price"].median())
        counterfactual["price"] = price_reference
        base_prediction = float(self.bundle.predict(pd.DataFrame([counterfactual]))[0][0])
        scenario_prediction = float(self.bundle.predict(pd.DataFrame([scenario_first_row]))[0][0])
        scenario_uplift = (scenario_prediction / max(base_prediction, 1) - 1) * 100
        recent_average = float(history["units_demand"].tail(28).mean())
        forecast_average = float(forecast["forecast"].mean())
        direction = "above" if forecast_average >= recent_average else "below"
        top_features = ", ".join(self.importance.head(4)["feature"].tolist()) if not self.importance.empty else "recent demand and calendar effects"
        explanation = (
            f"The {horizon}-day forecast averages **{forecast_average:.1f} units/day**, "
            f"which is **{abs(forecast_average / recent_average - 1) * 100:.1f}% {direction}** the recent 28-day average. "
            f"The selected promotion and price scenario changes day-one demand by **{scenario_uplift:+.1f}%** versus a no-promotion counterfactual. "
            f"The strongest global model signals are: **{top_features}**. "
            "This is a decision-support forecast; planners should review unusual events before releasing an order."
        )
        return ScenarioResult(forecast=forecast, policy=policy, explanation=explanation)

    def historical_series(self, sku: str, region: str, days: int = 90) -> pd.DataFrame:
        frame = self.data[(self.data["sku"] == sku) & (self.data["region"] == region)].sort_values("date")
        return frame.tail(days)[["date", "units_demand", "units_sold", "promotion", "stockout_flag"]]
