"""Production-style REST interface. Run: uvicorn api:app --reload."""

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field

from src.service import DemandIntelligenceService


app = FastAPI(
    title="DemandSphere AI API",
    version="1.0.0",
    description="Probabilistic demand forecasting and inventory decision API",
)
service = DemandIntelligenceService()


class ForecastRequest(BaseModel):
    sku: str
    region: str
    horizon: int = Field(default=28, ge=7, le=42)
    promotion: bool = False
    discount_pct: float = Field(default=0, ge=0, le=30)
    current_stock: int = Field(default=900, ge=0)
    lead_time_days: int = Field(default=7, ge=1, le=30)
    service_level: float = Field(default=0.95, ge=0.80, le=0.995)
    case_pack: int = Field(default=12, ge=1)
    minimum_order_qty: int = Field(default=0, ge=0)
    warehouse_capacity: int = Field(default=5000, ge=1)
    shelf_life_days: int = Field(default=60, ge=1)


@app.get("/health")
def health():
    return {"status": "healthy", "model_trained_at": service.bundle.trained_at}


@app.get("/metadata")
def metadata():
    return {"skus": service.skus, "regions": service.regions, "metrics": service.bundle.metrics}


@app.post("/forecast")
def forecast(request: ForecastRequest):
    try:
        result = service.run_scenario(**request.model_dump())
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return {
        "forecast": result.forecast.assign(date=lambda x: x["date"].dt.strftime("%Y-%m-%d")).to_dict("records"),
        "inventory_policy": result.policy,
        "explanation": result.explanation,
    }
