import tempfile
import unittest
from pathlib import Path

import pandas as pd

from src.config import FEATURES, TARGET
from src.config import BACKTEST_PATH, PROMOTION_PATH
from src.copilot import PlanningCopilot
from src.data import generate_fmcg_data, validate_data
from src.features import engineer_features
from src.inventory import inventory_policy
from src.modeling import load_bundle
from src.service import DemandIntelligenceService


class DataPipelineTests(unittest.TestCase):
    def test_generated_data_passes_contract(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            frame = generate_fmcg_data(Path(temp_dir) / "sample.csv", days=70, seed=7)
        validate_data(frame)
        self.assertEqual(len(frame), 70 * 6 * 4)
        self.assertFalse(frame["units_demand"].isna().any())
        self.assertTrue((frame["units_demand"] >= frame["units_sold"]).all())

    def test_lag_features_only_use_prior_dates(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            raw = generate_fmcg_data(Path(temp_dir) / "sample.csv", days=75, seed=11)
        features = engineer_features(raw)
        row = features.iloc[0]
        series = raw[(raw["sku"] == row["sku"]) & (raw["region"] == row["region"])].sort_values("date")
        prior = series.loc[series["date"] < row["date"]].iloc[-1]
        self.assertEqual(row["lag_1"], prior[TARGET])
        self.assertNotIn(TARGET, FEATURES)


class DecisionTests(unittest.TestCase):
    def test_more_stock_never_increases_order(self):
        forecast = pd.DataFrame({"forecast": [100.0] * 14})
        low_stock = inventory_policy(forecast, 300, 7, 0.95, 12)
        high_stock = inventory_policy(forecast, 1200, 7, 0.95, 12)
        self.assertGreaterEqual(low_stock["recommended_order"], high_stock["recommended_order"])
        self.assertGreater(low_stock["stockout_risk_pct"], high_stock["stockout_risk_pct"])

    def test_operational_constraints_are_applied(self):
        forecast = pd.DataFrame({"forecast": [150.0] * 14})
        policy = inventory_policy(
            forecast, current_stock=800, lead_time_days=7, service_level=.95,
            residual_std=15, case_pack=24, minimum_order_qty=240,
            warehouse_capacity=1800, shelf_life_days=30,
        )
        self.assertEqual(policy["recommended_order"] % 24, 0)
        self.assertLessEqual(policy["recommended_order"], 1000)

    def test_forecast_intervals_are_ordered(self):
        service = DemandIntelligenceService()
        result = service.run_scenario(service.skus[0], "South", horizon=14, current_stock=1000)
        frame = result.forecast
        self.assertEqual(len(frame), 14)
        self.assertTrue((frame["lower_80"] <= frame["forecast"]).all())
        self.assertTrue((frame["forecast"] <= frame["upper_80"]).all())
        self.assertTrue((frame["forecast"] >= 0).all())

    def test_saved_model_beats_baseline(self):
        bundle = load_bundle()
        self.assertLess(bundle.metrics["model"]["mae"], bundle.metrics["seasonal_naive_baseline"]["mae"])
        self.assertLess(bundle.metrics["model"]["wmape_pct"], 15.0)

    def test_advanced_artifacts_and_copilot(self):
        self.assertTrue(BACKTEST_PATH.exists())
        self.assertTrue(PROMOTION_PATH.exists())
        service = DemandIntelligenceService()
        result = service.run_scenario(service.skus[0], "South", horizon=7, current_stock=1200)
        answer = PlanningCopilot(service).answer("Why should I reorder?", service.skus[0], "South", result)
        self.assertIn("Inventory decision", answer)


if __name__ == "__main__":
    unittest.main()
