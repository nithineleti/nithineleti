"""Generate realistic, fictional omnichannel consumer feedback."""

from __future__ import annotations

from pathlib import Path

import numpy as np
import pandas as pd

from .config import DATA_PATH, RANDOM_STATE


PRODUCTS = [
    "Harvest Crunch Biscuits", "PureLeaf Tea", "GlowCare Soap",
    "FreshSip Juice", "StayEase Hotel", "HomeCart Delivery",
]
CHANNELS = ["E-commerce", "Email", "App", "Social", "Survey"]
REGIONS = ["North", "South", "East", "West"]

PHRASES = {
    "taste": {
        "positive": ["The flavour was fresh and genuinely enjoyable", "Loved the balanced taste and would buy it again", "The taste exceeded my expectations"],
        "neutral": ["The flavour was acceptable but not memorable", "Taste was average for this category", "It was neither impressive nor disappointing"],
        "negative": ["The taste felt stale and disappointing", "The flavour was unpleasant and I could not finish it", "Taste quality has clearly declined"],
    },
    "packaging": {
        "positive": ["Packaging was secure, clean and easy to open", "The pack arrived perfectly sealed", "The new packaging feels premium and practical"],
        "neutral": ["Packaging was functional but could be improved", "The pack design was ordinary", "The packaging did its job"],
        "negative": ["The package was damaged and the seal was broken", "The container leaked inside the box", "Packaging quality was poor and wasteful"],
    },
    "delivery": {
        "positive": ["Delivery was faster than promised", "The order arrived safely and on time", "Excellent delivery experience and useful updates"],
        "neutral": ["Delivery was completed within the expected window", "The shipment took the usual amount of time", "Delivery was adequate"],
        "negative": ["The order arrived very late with no useful update", "Delivery was delayed and support could not help", "The shipment is still missing"],
    },
    "price": {
        "positive": ["Excellent value for the quality provided", "The offer made this a very good purchase", "Price feels fair and competitive"],
        "neutral": ["The price is similar to other brands", "Pricing is acceptable but not exceptional", "It is priced around what I expected"],
        "negative": ["The price is too high for the quality", "This no longer feels worth the money", "The recent price increase is disappointing"],
    },
    "product_quality": {
        "positive": ["Product quality was consistent and excellent", "Everything felt fresh and well made", "The quality has improved noticeably"],
        "neutral": ["Quality was standard for this type of product", "The product met basic expectations", "Quality was reasonably consistent"],
        "negative": ["The product was defective and unusable", "Quality was inconsistent with my previous purchase", "The item looked old and poorly handled"],
    },
    "service": {
        "positive": ["The staff resolved my issue quickly and politely", "Support was professional and helpful", "Service made the entire experience easy"],
        "neutral": ["Support answered after a normal waiting time", "The service was adequate", "My basic question was answered"],
        "negative": ["Support ignored my complaint repeatedly", "The response was unhelpful and frustrating", "No one took ownership of the problem"],
    },
}

ENDINGS = {
    "positive": ["Highly recommended.", "I plan to purchase again.", "Please keep this standard."],
    "neutral": ["I may try it again.", "There is room for improvement.", "Overall it was an average experience."],
    "negative": ["I need this resolved soon.", "I am considering another brand.", "Please investigate this issue."],
}


def generate_feedback(output_path: Path | str = DATA_PATH, rows: int = 2400, seed: int = RANDOM_STATE) -> pd.DataFrame:
    rng = np.random.default_rng(seed)
    dates = pd.date_range("2025-01-01", "2026-06-30", freq="D")
    sentiments = ["positive", "neutral", "negative"]
    probabilities = [0.50, 0.20, 0.30]
    records = []
    topics = list(PHRASES)

    for index in range(rows):
        sentiment = str(rng.choice(sentiments, p=probabilities))
        topic = str(rng.choice(topics))
        product = str(rng.choice(PRODUCTS))
        text = f"{rng.choice(PHRASES[topic][sentiment])}. {rng.choice(ENDINGS[sentiment])}"
        if rng.random() < 0.18:
            secondary_topic = str(rng.choice([value for value in topics if value != topic]))
            secondary_sentiment = str(rng.choice(sentiments))
            text += f" However, {str(rng.choice(PHRASES[secondary_topic][secondary_sentiment])).lower()}."
        if rng.random() < 0.08:
            text += f" Contact me at customer{index}@example.com."
        urgent = int(sentiment == "negative" and (rng.random() < 0.32 or "missing" in text or "broken" in text))
        if urgent:
            text += " This is urgent and needs immediate attention."
        rating = {
            "positive": int(rng.choice([4, 5], p=[0.35, 0.65])),
            "neutral": int(rng.choice([3, 4], p=[0.80, 0.20])),
            "negative": int(rng.choice([1, 2, 3], p=[0.52, 0.38, 0.10])),
        }[sentiment]
        recorded_sentiment = sentiment
        recorded_topic = topic
        recorded_urgent = urgent
        # Small annotation noise makes the holdout closer to human-labelled data.
        if rng.random() < 0.055:
            recorded_sentiment = str(rng.choice([value for value in sentiments if value != sentiment]))
        if rng.random() < 0.055:
            recorded_topic = str(rng.choice([value for value in topics if value != topic]))
        if rng.random() < 0.025:
            recorded_urgent = 1 - urgent
        records.append(
            {
                "feedback_id": f"FB-{index + 1:05d}",
                "date": pd.Timestamp(rng.choice(dates)),
                "product": product,
                "channel": str(rng.choice(CHANNELS)),
                "region": str(rng.choice(REGIONS)),
                "rating": rating,
                "text": text,
                "sentiment": recorded_sentiment,
                "topic": recorded_topic,
                "urgent": recorded_urgent,
            }
        )
    frame = pd.DataFrame(records).sort_values("date").reset_index(drop=True)
    output_path = Path(output_path)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    frame.to_csv(output_path, index=False)
    return frame


def load_feedback(path: Path | str = DATA_PATH) -> pd.DataFrame:
    path = Path(path)
    if not path.exists():
        return generate_feedback(path)
    frame = pd.read_csv(path, parse_dates=["date"])
    validate_feedback(frame)
    return frame


def validate_feedback(frame: pd.DataFrame) -> None:
    required = {"feedback_id", "date", "product", "channel", "region", "rating", "text", "sentiment", "topic", "urgent"}
    missing = required.difference(frame.columns)
    if missing:
        raise ValueError(f"Feedback data is missing columns: {sorted(missing)}")
    if frame.empty or frame["rating"].notna().sum() != len(frame):
        raise ValueError("Feedback data failed quality checks")
