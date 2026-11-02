"""Create a static preview image using the trained model and real app outputs."""

import matplotlib.pyplot as plt
import numpy as np
import pandas as pd
from matplotlib.patches import FancyBboxPatch

from src.config import BACKTEST_PATH, REPORT_DIR
from src.data import PRODUCTS
from src.service import DemandIntelligenceService


def card(ax, x, y, width, height, title, value, note, accent="#54D6C1"):
    patch = FancyBboxPatch((x, y), width, height, boxstyle="round,pad=0.012,rounding_size=0.02", facecolor="#111f36", edgecolor="#263957", linewidth=1)
    ax.add_patch(patch)
    ax.text(x + 0.018, y + height - 0.040, title.upper(), color="#91a6c9", fontsize=7.5, weight="bold")
    ax.text(x + 0.018, y + 0.052, value, color="white", fontsize=18, weight="bold")
    ax.text(x + 0.018, y + 0.018, note, color=accent, fontsize=7.5)


def main():
    service = DemandIntelligenceService()
    sku, region = service.skus[1], "South"
    result = service.run_scenario(sku, region, promotion=True, discount_pct=10, current_stock=1800)
    history = service.historical_series(sku, region, 90)
    m, policy = service.bundle.metrics, result.policy
    backtest_wmape = pd.read_csv(BACKTEST_PATH)["wmape_pct"].mean()

    fig = plt.figure(figsize=(16, 9), facecolor="#08111f")
    ax_bg = fig.add_axes([0, 0, 1, 1]); ax_bg.set_axis_off()
    ax_bg.text(0.055, 0.945, "AI-POWERED FMCG DECISION INTELLIGENCE", color="#54D6C1", fontsize=9, weight="bold")
    ax_bg.text(0.055, 0.885, "DemandSphere AI v2", color="white", fontsize=30, weight="bold")
    ax_bg.text(0.055, 0.842, "Forecast demand, estimate promotion uplift and optimise inventory under real constraints.", color="#aebedb", fontsize=10)

    card(ax_bg, .055, .695, .20, .115, "Validation wMAPE", f"{m['model']['wmape_pct']:.1f}%", "Time-based holdout")
    card(ax_bg, .272, .695, .20, .115, "Rolling backtest", f"{backtest_wmape:.1f}%", "Mean wMAPE · 3 folds")
    card(ax_bg, .489, .695, .20, .115, "Recommended order", f"{policy['recommended_order']:,}", "Units")
    card(ax_bg, .706, .695, .20, .115, "Stockout risk", f"{policy['stockout_risk_pct']:.1f}%", "Before replenishment", accent="#ff9a76")

    ax = fig.add_axes([.055, .205, .635, .435], facecolor="#10192D")
    ax.fill_between(result.forecast["date"], result.forecast["lower_80"], result.forecast["upper_80"], color="#6d7cff", alpha=.18, label="80% prediction interval")
    ax.plot(history["date"], history["units_demand"], color="#54D6C1", linewidth=1.7, label="Demand history")
    ax.plot(result.forecast["date"], result.forecast["forecast"], color="#7C8CFF", linewidth=2.6, marker="o", markersize=2.8, label="AI forecast")
    ax.set_title(f"{PRODUCTS[sku]['name']} · {region}", loc="left", color="white", fontsize=13, weight="bold", pad=13)
    ax.set_ylabel("Units / day", color="#9cacc8", fontsize=8)
    ax.grid(color="#27354c", alpha=.45, linewidth=.6)
    ax.tick_params(colors="#8fa0be", labelsize=7)
    for spine in ax.spines.values(): spine.set_color("#263957")
    legend = ax.legend(loc="upper left", frameon=False, fontsize=7, ncol=3)
    for text in legend.get_texts(): text.set_color("#b8c8e6")

    panel = FancyBboxPatch((.715, .205), .23, .435, boxstyle="round,pad=0.015,rounding_size=.02", facecolor="#10192D", edgecolor="#263957")
    ax_bg.add_patch(panel)
    ax_bg.text(.738, .595, "INVENTORY DECISION", color="#91a6c9", fontsize=8, weight="bold")
    ax_bg.text(.738, .545, f"Order {policy['recommended_order']:,} units", color="white", fontsize=16, weight="bold")
    ax_bg.text(.738, .505, "for the selected 95% service level", color="#aebedb", fontsize=8)
    rows = [
        ("Avg daily demand", f"{policy['average_daily_demand']:.1f}"),
        ("Lead-time demand", f"{policy['lead_time_demand']:.0f}"),
        ("Safety stock", f"{policy['safety_stock']:,}"),
        ("Reorder point", f"{policy['reorder_point']:,}"),
    ]
    for i, (label, value) in enumerate(rows):
        y = .443 - i * .057
        ax_bg.text(.738, y, label, color="#91a6c9", fontsize=8)
        ax_bg.text(.913, y, value, color="white", fontsize=9, weight="bold", ha="right")
        if i < len(rows)-1: ax_bg.plot([.738, .915], [y-.022, y-.022], color="#263957", linewidth=.7)

    ax_bg.text(.055, .125, "MODEL", color="#91a6c9", fontsize=7.5, weight="bold")
    ax_bg.text(.055, .095, "Quantile Boosting + Promotion T-Learner", color="white", fontsize=9.5, weight="bold")
    ax_bg.text(.37, .125, "GOVERNANCE", color="#91a6c9", fontsize=7.5, weight="bold")
    ax_bg.text(.37, .095, f"3 backtests · PSI {m['target_psi']:.3f} · Human review", color="white", fontsize=9.5, weight="bold")
    ax_bg.text(.735, .125, "DECISION LAYER", color="#91a6c9", fontsize=7.5, weight="bold")
    ax_bg.text(.735, .095, "Constraints + Grounded Copilot", color="white", fontsize=9.5, weight="bold")
    ax_bg.text(.055, .035, "Portfolio demonstration · Synthetic non-confidential data · No company affiliation", color="#60728f", fontsize=7.5)

    REPORT_DIR.mkdir(parents=True, exist_ok=True)
    output = REPORT_DIR / "demand_sphere_demo.png"
    fig.savefig(output, dpi=180, facecolor=fig.get_facecolor(), bbox_inches="tight")
    print(output)


if __name__ == "__main__":
    main()
