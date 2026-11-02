"""FinSight AI v4 end-to-end demo. Start the API with ./run.sh, then run this script."""
from __future__ import annotations
import json
import os
from pathlib import Path
import httpx

BASE = os.getenv("BASE_URL", "http://127.0.0.1:8000")
OUT = Path(os.getenv("DEMO_OUTPUT", "DEMO_OUTPUT.json"))

with httpx.Client(timeout=120) as client:
    login = client.post(BASE + "/api/v1/auth/login", json={"email":"demo@finsight.ai","password":"DemoPass123!"})
    login.raise_for_status()
    headers = {"Authorization": "Bearer " + login.json()["access_token"]}
    capabilities = client.get(BASE + "/api/v1/system/capabilities", headers=headers).json()
    agent = client.post(
        BASE + "/api/v1/agents/research",
        headers=headers,
        json={
            "question":"What are Aster Systems' main growth drivers, risks, management signals and near-term revenue outlook?",
            "company":"Aster Systems",
            "horizon":4,
            "include_news":True,
            "include_earnings":True,
            "include_forecast":True,
            "include_graph":True,
        },
    )
    agent.raise_for_status()
    agent_data = agent.json()
    evaluation = client.get(BASE + "/api/v1/evaluation/advanced", headers=headers).json()
    portfolio = client.get(BASE + "/api/v1/portfolio", headers=headers).json()
    alerts = client.get(BASE + "/api/v1/alerts/evaluate", headers=headers).json()
    xbrl = client.post(BASE + "/api/v1/ingest/xbrl", headers=headers, json={"ticker":"ASTR","live":False}).json()
    payload = {
        "capabilities": {"version":capabilities["version"], "feature_count":capabilities["feature_count"], "graph":capabilities["graph"], "retrieval":capabilities["retrieval"]},
        "agent_run": agent_data,
        "evaluation": evaluation,
        "portfolio": portfolio,
        "alerts": alerts,
        "xbrl": xbrl,
    }
    OUT.write_text(json.dumps(payload, indent=2, default=str), encoding="utf-8")
    print("\n=== FINSIGHT AI V4 FLAGSHIP DEMO ===")
    print("Features:", capabilities["feature_count"], "| Graph:", capabilities["graph"]["entities"], "entities /", capabilities["graph"]["relations"], "relations")
    print("\n=== EXECUTIVE SUMMARY ===\n" + agent_data["executive_summary"])
    print("\nConfidence:", round(agent_data["confidence"] * 100), "% | Sources:", len(agent_data["sources"]), "| Workflow:", round(agent_data["total_duration_ms"]), "ms")
    print("\n=== AGENT TRACE ===")
    for step in agent_data["trace"]:
        print(f"- {step['agent']}: {step['status']} ({step['duration_ms']} ms)")
    print("\n=== EVALUATION ===")
    print("Recommended retrieval:", evaluation["recommended_mode"], "| MRR:", evaluation["modes"][evaluation["recommended_mode"]]["mrr"], "| Citation precision:", evaluation["end_to_end"]["citation_precision"])
    print("\nSaved:", OUT)
