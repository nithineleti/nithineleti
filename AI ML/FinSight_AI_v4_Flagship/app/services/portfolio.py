from __future__ import annotations
import math
from sqlalchemy import select
from sqlalchemy.orm import Session
from ..models import PortfolioPosition


def upsert_position(db: Session, user_id: int, ticker: str, company: str, shares: float, cost_basis: float, current_price: float) -> PortfolioPosition:
    ticker = ticker.upper().strip()
    row = db.scalar(select(PortfolioPosition).where(PortfolioPosition.user_id == user_id, PortfolioPosition.ticker == ticker))
    if not row:
        row = PortfolioPosition(user_id=user_id, ticker=ticker, company=company.strip(), shares=shares, cost_basis=cost_basis, current_price=current_price)
        db.add(row)
    else:
        row.company = company.strip(); row.shares = shares; row.cost_basis = cost_basis; row.current_price = current_price
    db.commit(); db.refresh(row)
    return row


def portfolio_summary(db: Session, user_id: int) -> dict:
    rows = db.scalars(select(PortfolioPosition).where(PortfolioPosition.user_id == user_id).order_by(PortfolioPosition.ticker)).all()
    if not rows:
        return {"positions": [], "market_value": 0.0, "cost_value": 0.0, "unrealized_pnl": 0.0, "concentration_hhi": 0.0, "largest_position_pct": 0.0}
    market = [r.shares * r.current_price for r in rows]
    cost = [r.shares * r.cost_basis for r in rows]
    total_market = sum(market)
    total_cost = sum(cost)
    weights = [m / total_market for m in market] if total_market else [0.0] * len(rows)
    positions = []
    for r, mv, cv, w in zip(rows, market, cost, weights):
        positions.append({
            "ticker": r.ticker, "company": r.company, "shares": r.shares,
            "cost_basis": r.cost_basis, "current_price": r.current_price,
            "market_value": round(mv, 2), "cost_value": round(cv, 2),
            "unrealized_pnl": round(mv - cv, 2), "return_pct": round((mv / cv - 1) * 100, 2) if cv else None,
            "weight_pct": round(w * 100, 2),
        })
    hhi = sum(w*w for w in weights)
    return {
        "positions": positions,
        "market_value": round(total_market, 2),
        "cost_value": round(total_cost, 2),
        "unrealized_pnl": round(total_market - total_cost, 2),
        "return_pct": round((total_market / total_cost - 1) * 100, 2) if total_cost else None,
        "concentration_hhi": round(hhi, 4),
        "largest_position_pct": round(max(weights) * 100, 2),
        "concentration_label": "high" if max(weights) >= 0.5 else "moderate" if max(weights) >= 0.35 else "diversified",
        "note": "Portfolio analytics are illustrative and not investment advice.",
    }
