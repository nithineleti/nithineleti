from pydantic import BaseModel, EmailStr, Field


class RegisterRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)


class LoginRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)


class QueryRequest(BaseModel):
    question: str = Field(min_length=4, max_length=1600)
    top_k: int = Field(default=5, ge=1, le=12)
    company: str | None = Field(default=None, max_length=120)
    min_score: float = Field(default=0.0, ge=0.0, le=1.0)
    mode: str = Field(default="hybrid", pattern="^(hybrid|bm25|dense|graph_hybrid)$")


class AgentResearchRequest(BaseModel):
    question: str = Field(min_length=6, max_length=1800)
    company: str | None = Field(default=None, max_length=120)
    horizon: int = Field(default=4, ge=1, le=12)
    include_news: bool = True
    include_earnings: bool = True
    include_forecast: bool = True
    include_graph: bool = True


class GraphQueryRequest(BaseModel):
    question: str = Field(min_length=3, max_length=1000)
    company: str | None = Field(default=None, max_length=120)
    max_nodes: int = Field(default=18, ge=3, le=60)


class FinancialPointInput(BaseModel):
    period: str = Field(min_length=2, max_length=32)
    value: float


class FinancialSeriesInput(BaseModel):
    points: list[FinancialPointInput] = Field(min_length=6, max_length=1000)


class CompareCompaniesRequest(BaseModel):
    companies: list[str] = Field(min_length=2, max_length=8)


class SECIngestRequest(BaseModel):
    ticker: str = Field(min_length=1, max_length=10)
    form_type: str = Field(default="10-K", pattern="^(10-K|10-Q|8-K)$")


class XBRLRequest(BaseModel):
    ticker: str = Field(min_length=1, max_length=10)
    live: bool = False


class ScenarioRequest(BaseModel):
    series_name: str = Field(default="revenue_m", min_length=1, max_length=120)
    horizon: int = Field(default=4, ge=1, le=12)
    bull_adjustment_pct: float = Field(default=5.0, ge=0.0, le=50.0)
    bear_adjustment_pct: float = Field(default=5.0, ge=0.0, le=50.0)


class WatchlistCreateRequest(BaseModel):
    name: str = Field(default="My Watchlist", min_length=1, max_length=120)


class WatchlistItemRequest(BaseModel):
    ticker: str = Field(min_length=1, max_length=16)
    company: str = Field(min_length=1, max_length=120)


class AlertRuleRequest(BaseModel):
    ticker: str = Field(min_length=1, max_length=16)
    event_type: str = Field(default="any", max_length=64)
    threshold: float = Field(default=0.65, ge=0.0, le=1.0)
    enabled: bool = True


class PortfolioPositionRequest(BaseModel):
    ticker: str = Field(min_length=1, max_length=16)
    company: str = Field(min_length=1, max_length=120)
    shares: float = Field(gt=0)
    cost_basis: float = Field(gt=0)
    current_price: float = Field(gt=0)


class ReportGenerateRequest(BaseModel):
    company: str = Field(min_length=1, max_length=120)
    question: str = Field(default="Provide an evidence-grounded financial research report covering performance, growth drivers, risks, sentiment, anomalies and forecast.", min_length=10, max_length=1800)
    horizon: int = Field(default=4, ge=1, le=12)
    export_pdf: bool = True


class NewsEventInput(BaseModel):
    company: str = Field(min_length=1, max_length=120)
    ticker: str | None = Field(default=None, max_length=16)
    headline: str = Field(min_length=5, max_length=500)
    source: str = Field(default="manual", max_length=120)
    source_url: str | None = Field(default=None, max_length=2048)
