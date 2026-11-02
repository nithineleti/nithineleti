from __future__ import annotations
import json
from pathlib import Path
import httpx
from ..config import BASE_DIR, get_settings

settings = get_settings()
PREFERRED_TAGS = {
    "Revenue": ["Revenues", "RevenueFromContractWithCustomerExcludingAssessedTax", "SalesRevenueNet"],
    "GrossProfit": ["GrossProfit"],
    "OperatingIncome": ["OperatingIncomeLoss"],
    "NetIncome": ["NetIncomeLoss", "ProfitLoss"],
    "EPS": ["EarningsPerShareDiluted", "EarningsPerShareBasic"],
    "Cash": ["CashAndCashEquivalentsAtCarryingValue", "CashCashEquivalentsRestrictedCashAndRestrictedCashEquivalents"],
    "Debt": ["LongTermDebt", "LongTermDebtCurrent"],
    "Inventory": ["InventoryNet"],
    "Assets": ["Assets"],
    "Liabilities": ["Liabilities"],
    "OperatingCashFlow": ["NetCashProvidedByUsedInOperatingActivities"],
    "CapEx": ["PaymentsToAcquirePropertyPlantAndEquipment"],
}


def _demo_path() -> Path:
    return BASE_DIR / "data" / "xbrl_demo.json"


def load_demo_company_facts(ticker: str) -> dict:
    data = json.loads(_demo_path().read_text())
    ticker = ticker.upper()
    if ticker not in data:
        raise ValueError(f"No bundled XBRL demo facts for {ticker}")
    return {"ticker": ticker, "source": "bundled_demo", **data[ticker]}


def _ticker_to_cik(client: httpx.Client, ticker: str) -> tuple[int, str]:
    table = client.get("https://www.sec.gov/files/company_tickers.json")
    table.raise_for_status()
    match = next((x for x in table.json().values() if x.get("ticker", "").upper() == ticker.upper()), None)
    if not match:
        raise ValueError(f"Ticker {ticker.upper()} not found")
    return int(match["cik_str"]), match.get("title", ticker.upper())


def _latest_fact_for_tag(units: dict) -> dict | None:
    candidates = []
    for unit_name, rows in units.items():
        for row in rows:
            if row.get("val") is None or not row.get("end"):
                continue
            candidates.append((row.get("filed", ""), row.get("end", ""), unit_name, row))
    if not candidates:
        return None
    _, _, unit, row = max(candidates, key=lambda x: (x[0], x[1]))
    value = float(row["val"])
    if unit == "USD":
        value /= 1_000_000.0
        unit = "USDm"
    return {
        "period": row.get("fy") or row.get("end"),
        "value": round(value, 4),
        "unit": unit,
        "filing": row.get("form"),
        "filed": row.get("filed"),
        "frame": row.get("frame"),
    }


def fetch_company_facts(ticker: str) -> dict:
    headers = {"User-Agent": settings.sec_user_agent, "Accept-Encoding": "gzip, deflate"}
    with httpx.Client(headers=headers, timeout=30.0, follow_redirects=True) as client:
        cik, title = _ticker_to_cik(client, ticker)
        resp = client.get(f"https://data.sec.gov/api/xbrl/companyfacts/CIK{cik:010d}.json")
        resp.raise_for_status()
        raw = resp.json()
    us_gaap = raw.get("facts", {}).get("us-gaap", {})
    facts = []
    for metric, tags in PREFERRED_TAGS.items():
        picked = None
        picked_tag = None
        for tag in tags:
            node = us_gaap.get(tag)
            if not node:
                continue
            latest = _latest_fact_for_tag(node.get("units", {}))
            if latest:
                picked = latest
                picked_tag = tag
                break
        if picked:
            facts.append({"metric": metric, "tag": picked_tag, **picked})
    return {
        "ticker": ticker.upper(),
        "company": title,
        "cik": f"{cik:010d}",
        "source": "sec_companyfacts",
        "facts": facts,
        "source_url": f"https://data.sec.gov/api/xbrl/companyfacts/CIK{cik:010d}.json",
    }


def get_company_facts(ticker: str, live: bool = False) -> dict:
    if live:
        return fetch_company_facts(ticker)
    return load_demo_company_facts(ticker)


def ratio_summary(facts_payload: dict) -> dict:
    values = {f["metric"]: f["value"] for f in facts_payload.get("facts", []) if isinstance(f.get("value"), (int, float))}
    out = {}
    revenue = values.get("Revenue")
    if revenue:
        if "GrossProfit" in values:
            out["gross_margin_pct"] = round(values["GrossProfit"] / revenue * 100, 2)
        if "OperatingIncome" in values:
            out["operating_margin_pct"] = round(values["OperatingIncome"] / revenue * 100, 2)
        if "NetIncome" in values:
            out["net_margin_pct"] = round(values["NetIncome"] / revenue * 100, 2)
    if values.get("Assets") and values.get("Liabilities") is not None:
        out["liabilities_to_assets_pct"] = round(values["Liabilities"] / values["Assets"] * 100, 2)
    return out
