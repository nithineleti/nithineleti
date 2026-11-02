from __future__ import annotations
import numpy as np
from sklearn.ensemble import IsolationForest
from sqlalchemy import select
from sqlalchemy.orm import Session
from ..models import FinancialPoint


def detect_anomalies(db: Session, series_name: str) -> dict:
    points = db.scalars(select(FinancialPoint).where(FinancialPoint.series_name == series_name).order_by(FinancialPoint.id)).all()
    if len(points) < 6:
        raise ValueError("At least 6 observations are required")
    values = np.asarray([p.value for p in points], dtype=float)
    changes = np.concatenate([[0.0], np.diff(values) / np.maximum(np.abs(values[:-1]), 1e-9)])
    med = float(np.median(changes))
    mad = float(np.median(np.abs(changes - med))) or 1e-9
    robust_z = 0.6745 * (changes - med) / mad
    features = np.column_stack([values, changes])
    contamination = min(0.2, max(1 / len(points), 0.08))
    model = IsolationForest(random_state=42, contamination=contamination)
    flags = model.fit_predict(features)
    score = -model.score_samples(features)
    rows = []
    for i, p in enumerate(points):
        is_anomaly = bool(flags[i] == -1 or abs(robust_z[i]) >= 3.5)
        rows.append({
            "period": p.period,
            "value": p.value,
            "pct_change": round(float(changes[i] * 100), 3),
            "robust_z": round(float(robust_z[i]), 3),
            "isolation_score": round(float(score[i]), 4),
            "is_anomaly": is_anomaly,
        })
    return {"series_name": series_name, "method": "IsolationForest + robust change z-score", "points": rows, "anomaly_count": sum(x["is_anomaly"] for x in rows)}
