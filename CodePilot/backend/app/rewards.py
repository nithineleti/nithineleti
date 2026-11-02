from __future__ import annotations

import json
import math
from pathlib import Path

REWARD_FILE = Path("data/rewards.json")


def _load() -> dict:
    try:
        return json.loads(REWARD_FILE.read_text(encoding="utf-8")) if REWARD_FILE.exists() else {}
    except Exception:
        return {}


def rank_strategies(available: list[str]) -> list[str]:
    """Rank repair strategies with an upper-confidence-bound bandit policy.

    This lightweight online policy is intentionally transparent for an academic
    project: successful strategies accumulate reward, while under-explored
    strategies retain an exploration bonus.
    """
    if len(available) <= 1:
        return available
    data = _load()
    total_runs = max(1, sum(int(v.get("runs", 0)) for v in data.values()))
    scored = []
    for order, strategy in enumerate(available):
        stat = data.get(strategy, {})
        runs = int(stat.get("runs", 0))
        avg = float(stat.get("average_reward", 0.0))
        bonus = 2.0 if runs == 0 else math.sqrt(2.0 * math.log(total_runs + 1) / runs)
        scored.append((avg + bonus, -order, strategy))
    scored.sort(reverse=True)
    return [item[2] for item in scored]


def record_reward(strategy: str, baseline_failed: bool, verification_passed: bool, review_approved: bool) -> dict:
    reward = (-0.1 if not baseline_failed else 0.15) + (0.6 if verification_passed else -0.6) + (0.25 if review_approved else -0.25)
    reward = round(max(-1.0, min(1.0, reward)), 3)
    REWARD_FILE.parent.mkdir(parents=True, exist_ok=True)
    data = _load()
    stat = data.setdefault(strategy, {"runs": 0, "total_reward": 0.0, "average_reward": 0.0})
    stat["runs"] += 1
    stat["total_reward"] = round(float(stat["total_reward"]) + reward, 3)
    stat["average_reward"] = round(stat["total_reward"] / stat["runs"], 3)
    REWARD_FILE.write_text(json.dumps(data, indent=2), encoding="utf-8")
    return {"reward": reward, "strategy_stats": stat, "policy": "ucb1"}
