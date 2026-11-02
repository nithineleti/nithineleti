"""Synthetic FMCG data generation and validation.

The repository intentionally ships with fictional data. It has realistic demand
drivers and stockout censoring, but contains no confidential company information.
"""

from __future__ import annotations

from pathlib import Path

import numpy as np
import pandas as pd

from .config import DATA_PATH, RANDOM_STATE


PRODUCTS = {
    "FOOD-ATTA-5KG": {"name": "Whole Wheat Flour 5 kg", "category": "Staples", "price": 286.0, "base": 74},
    "FOOD-BISC-300G": {"name": "Premium Biscuits 300 g", "category": "Foods", "price": 62.0, "base": 128},
    "FOOD-NOOD-280G": {"name": "Instant Noodles 280 g", "category": "Foods", "price": 86.0, "base": 112},
    "PC-SOAP-125G": {"name": "Bathing Soap 125 g", "category": "Personal Care", "price": 54.0, "base": 96},
    "BEV-FRUIT-1L": {"name": "Fruit Beverage 1 L", "category": "Beverages", "price": 118.0, "base": 83},
    "HOME-INC-100": {"name": "Incense Sticks 100 pack", "category": "Home Care", "price": 78.0, "base": 68},
}

REGIONS = {"North": 1.06, "South": 1.15, "East": 0.94, "West": 1.02}
CHANNELS = ["General Trade", "Modern Trade", "E-commerce"]


def _festival_signal(date: pd.Timestamp) -> float:
    """Smooth synthetic festival peaks without tying data to a real calendar."""
    day = date.dayofyear
    peaks = (45, 235, 285, 315)
    return float(sum(np.exp(-0.5 * ((day - peak) / 8.0) ** 2) for peak in peaks))


def generate_fmcg_data(
    output_path: Path | str = DATA_PATH,
    days: int = 480,
    seed: int = RANDOM_STATE,
) -> pd.DataFrame:
    rng = np.random.default_rng(seed)
    end = pd.Timestamp("2026-06-30")
    dates = pd.date_range(end=end, periods=days, freq="D")
    records: list[dict] = []

    for sku, meta in PRODUCTS.items():
        for region, region_factor in REGIONS.items():
            channel = CHANNELS[(list(PRODUCTS).index(sku) + list(REGIONS).index(region)) % len(CHANNELS)]
            for step, date in enumerate(dates):
                dow = date.dayofweek
                annual = 1 + 0.09 * np.sin(2 * np.pi * date.dayofyear / 365.25)
                weekend = 1.12 if dow >= 5 else 1.0
                festival = _festival_signal(date)
                holiday = int(festival > 0.48)
                promo_probability = 0.11 + (0.06 if dow >= 4 else 0)
                promotion = int(rng.random() < promo_probability)
                discount_pct = float(rng.choice([5, 10, 15, 20, 25], p=[0.16, 0.29, 0.30, 0.19, 0.06])) if promotion else 0.0
                price = meta["price"] * (1 - discount_pct / 100) * rng.normal(1.0, 0.012)
                competitor_index = float(np.clip(rng.normal(1.0, 0.045), 0.86, 1.16))
                temperature = 27 + 7 * np.sin(2 * np.pi * (date.dayofyear - 80) / 365.25) + rng.normal(0, 1.5)
                rain_season = max(0.0, np.sin(2 * np.pi * (date.dayofyear - 145) / 365.25))
                rainfall = max(0.0, rng.gamma(1.5, 5.5) * rain_season - 1.0)
                marketing = max(0.0, rng.normal(1450 if promotion else 520, 180))
                trend = 1 + 0.00032 * step

                promo_uplift = 1 + (0.28 + 0.012 * discount_pct) * promotion
                festival_uplift = 1 + 0.22 * festival
                weather_uplift = 1.0
                if meta["category"] == "Beverages":
                    weather_uplift *= 1 + max(0, temperature - 29) * 0.025
                    weather_uplift *= 1 - min(rainfall, 30) * 0.004
                if meta["category"] == "Home Care":
                    weather_uplift *= 1 + 0.10 * festival

                expected = (
                    meta["base"]
                    * region_factor
                    * annual
                    * weekend
                    * trend
                    * promo_uplift
                    * festival_uplift
                    * weather_uplift
                    * competitor_index ** 0.8
                    * (1 + marketing / 25000)
                )
                latent_demand = max(1, int(round(rng.normal(expected, max(5, expected * 0.10)))))
                forced_shortage = rng.random() < 0.035
                opening_stock = int(latent_demand * rng.uniform(0.40, 0.88)) if forced_shortage else int(latent_demand * rng.uniform(1.2, 3.8))
                observed_sales = min(latent_demand, opening_stock)

                records.append(
                    {
                        "date": date,
                        "sku": sku,
                        "product_name": meta["name"],
                        "category": meta["category"],
                        "region": region,
                        "channel": channel,
                        "price": round(price, 2),
                        "discount_pct": discount_pct,
                        "promotion": promotion,
                        "holiday": holiday,
                        "competitor_price_index": round(competitor_index, 3),
                        "marketing_spend": round(marketing, 2),
                        "temperature_c": round(temperature, 1),
                        "rainfall_mm": round(rainfall, 1),
                        "opening_stock": opening_stock,
                        "units_sold": observed_sales,
                        "stockout_flag": int(observed_sales < latent_demand),
                    }
                )

    df = pd.DataFrame(records).sort_values(["sku", "region", "date"]).reset_index(drop=True)

    # Lost-sales correction: on stockout days, estimate unconstrained demand from
    # recent non-stockout history. This avoids teaching the model that stockouts
    # are genuine demand drops.
    clean_sales = df["units_sold"].where(df["stockout_flag"].eq(0))
    history_mean = clean_sales.groupby([df["sku"], df["region"]]).transform(
        lambda s: s.shift(1).rolling(28, min_periods=7).mean()
    )
    fallback = clean_sales.groupby([df["sku"], df["region"]]).transform("median")
    estimate = history_mean.fillna(fallback).fillna(df["units_sold"])
    df["units_demand"] = np.where(
        df["stockout_flag"].eq(1),
        np.maximum(df["units_sold"], estimate),
        df["units_sold"],
    ).round().astype(int)

    output_path = Path(output_path)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    df.to_csv(output_path, index=False)
    return df


def load_data(path: Path | str = DATA_PATH) -> pd.DataFrame:
    path = Path(path)
    if not path.exists():
        return generate_fmcg_data(path)
    df = pd.read_csv(path, parse_dates=["date"])
    validate_data(df)
    return df


def validate_data(df: pd.DataFrame) -> None:
    required = {
        "date", "sku", "category", "region", "channel", "price",
        "promotion", "units_sold", "stockout_flag", "units_demand",
    }
    missing = required.difference(df.columns)
    if missing:
        raise ValueError(f"Dataset is missing required columns: {sorted(missing)}")
    if df.empty or df["units_demand"].lt(0).any() or df["price"].le(0).any():
        raise ValueError("Dataset failed basic quality checks")
