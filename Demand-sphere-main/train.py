"""Train all models and persist validated artifacts."""

from src.data import generate_fmcg_data
from src.backtesting import rolling_origin_backtest
from src.modeling import train_and_save
from src.promotion import estimate_adjusted_promotion_uplift


if __name__ == "__main__":
    data = generate_fmcg_data()
    _, metrics = train_and_save()
    backtests = rolling_origin_backtest()
    promotions = estimate_adjusted_promotion_uplift()
    print(f"Generated {len(data):,} daily SKU-region records")
    print(f"Validation wMAPE: {metrics['model']['wmape_pct']:.2f}%")
    print(f"MAE improvement vs lag-7 baseline: {metrics['mae_improvement_pct']:.2f}%")
    print(f"Rolling backtest mean wMAPE: {backtests['wmape_pct'].mean():.2f}%")
    print(f"Promotion estimates generated for {len(promotions)} SKUs")
