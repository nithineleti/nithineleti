from __future__ import annotations

import pandas as pd

from .config import BACKTEST_PATH, PROMOTION_PATH


class PlanningCopilot:
    """Grounded, offline planning assistant with deterministic citations."""

    def __init__(self, service):
        self.service = service

    def answer(self, question: str, sku: str, region: str, result) -> str:
        q = (question or "").lower()
        product = self.service.data.loc[self.service.data["sku"].eq(sku), "product_name"].iloc[0]
        policy = result.policy
        forecast = result.forecast
        metrics = self.service.bundle.metrics

        if any(word in q for word in ("promotion", "discount", "uplift")) and PROMOTION_PATH.exists():
            promo = pd.read_csv(PROMOTION_PATH)
            row = promo[promo["sku"].eq(sku)].iloc[0]
            return (
                f"### Promotion evidence\nFor **{product}**, the context-adjusted T-learner estimates an average "
                f"uplift of **{row['estimated_uplift_pct']:.1f}%** ({row['estimated_uplift_units']:.1f} units/day). "
                f"The observed scenario range is {row['lower_scenario_pct']:.1f}% to {row['upper_scenario_pct']:.1f}%. "
                "This controls for measured context but is not proof of causality.\n\n*Source: promotion_uplift.csv*"
            )
        if any(word in q for word in ("accurate", "performance", "backtest", "reliable")):
            extra = ""
            if BACKTEST_PATH.exists():
                backtest = pd.read_csv(BACKTEST_PATH)
                extra = f" Across {len(backtest)} rolling folds, mean wMAPE is **{backtest['wmape_pct'].mean():.2f}%**."
            return (
                f"### Model reliability\nThe final holdout wMAPE is **{metrics['model']['wmape_pct']:.2f}%**, "
                f"with **{metrics['mae_improvement_pct']:.1f}%** MAE improvement over the lag-7 baseline.{extra} "
                f"Forecast bias is **{metrics['model']['bias_pct']:+.2f}%**.\n\n*Sources: metrics.json; rolling_backtests.csv*"
            )
        if any(word in q for word in ("risk", "stockout", "inventory", "order", "reorder")):
            return (
                f"### Inventory decision\nFor **{product} · {region}**, order **{policy['recommended_order']:,} units**. "
                f"The reorder point is **{policy['reorder_point']:,}**, safety stock is **{policy['safety_stock']:,}**, "
                f"and current stockout risk is **{policy['stockout_risk_pct']:.1f}%**. "
                f"Binding constraints: **{policy['binding_constraints']}**.\n\n*Source: current scenario forecast and inventory policy*"
            )
        return (
            f"### Planning summary\nThe next {len(forecast)} days average **{forecast['forecast'].mean():.1f} units/day** "
            f"for **{product} · {region}**. Recommended order: **{policy['recommended_order']:,} units**. "
            f"Stockout risk before replenishment: **{policy['stockout_risk_pct']:.1f}%**. "
            "Ask about promotion uplift, model reliability or inventory risk for a more focused answer.\n\n"
            "*Source: current scenario forecast*"
        )
