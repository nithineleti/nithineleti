"""Interactive Gradio dashboard for DemandSphere AI."""

from __future__ import annotations

import pandas as pd
import plotly.graph_objects as go
import gradio as gr

from src.data import PRODUCTS
from src.config import BACKTEST_PATH, PROMOTION_PATH
from src.copilot import PlanningCopilot
from src.service import DemandIntelligenceService


service = DemandIntelligenceService()
metrics = service.bundle.metrics
copilot = PlanningCopilot(service)
backtests = pd.read_csv(BACKTEST_PATH) if BACKTEST_PATH.exists() else pd.DataFrame()
promotions = pd.read_csv(PROMOTION_PATH) if PROMOTION_PATH.exists() else pd.DataFrame()


def _forecast_chart(sku: str, region: str, result) -> go.Figure:
    history = service.historical_series(sku, region, 90)
    future = result.forecast
    fig = go.Figure()
    fig.add_trace(
        go.Scatter(
            x=history["date"], y=history["units_demand"], mode="lines",
            name="Demand history", line=dict(color="#54D6C1", width=2),
        )
    )
    fig.add_trace(
        go.Scatter(
            x=future["date"], y=future["upper_80"], mode="lines",
            line=dict(width=0), hoverinfo="skip", showlegend=False,
        )
    )
    fig.add_trace(
        go.Scatter(
            x=future["date"], y=future["lower_80"], mode="lines",
            name="80% prediction interval", fill="tonexty",
            fillcolor="rgba(91, 108, 255, 0.18)", line=dict(width=0),
        )
    )
    fig.add_trace(
        go.Scatter(
            x=future["date"], y=future["forecast"], mode="lines+markers",
            name="AI forecast", line=dict(color="#7C8CFF", width=3), marker=dict(size=4),
        )
    )
    fig.update_layout(
        title=f"{PRODUCTS[sku]['name']} · {region}",
        template="plotly_dark", height=440,
        paper_bgcolor="#10192D", plot_bgcolor="#10192D",
        margin=dict(l=45, r=25, t=60, b=45),
        legend=dict(orientation="h", y=1.10, x=0),
        xaxis_title=None, yaxis_title="Units / day", hovermode="x unified",
    )
    return fig


def _policy_table(policy: dict) -> pd.DataFrame:
    labels = {
        "average_daily_demand": "Average daily demand",
        "lead_time_demand": "Demand during lead time",
        "safety_stock": "Safety stock",
        "reorder_point": "Reorder point",
        "recommended_order": "Recommended order",
        "unconstrained_order": "Unconstrained order",
        "stockout_risk_pct": "Current stockout risk (%)",
        "service_level_pct": "Target service level (%)",
        "case_pack": "Case-pack quantity",
        "binding_constraints": "Binding constraints",
        "shelf_life_risk": "Shelf-life risk",
    }
    return pd.DataFrame(
        [{"Decision metric": labels[key], "Value": value} for key, value in policy.items()]
    )


def run_dashboard(sku, region, horizon, promotion, discount, stock, lead_time, service_level, case_pack, minimum_order, capacity, shelf_life):
    result = service.run_scenario(
        sku=sku,
        region=region,
        horizon=int(horizon),
        promotion=bool(promotion),
        discount_pct=float(discount),
        current_stock=int(stock),
        lead_time_days=int(lead_time),
        service_level=float(service_level) / 100,
        case_pack=int(case_pack),
        minimum_order_qty=int(minimum_order),
        warehouse_capacity=int(capacity),
        shelf_life_days=int(shelf_life),
    )
    policy = result.policy
    decision = (
        f"### Recommended action\n"
        f"Order **{policy['recommended_order']:,} units**. The reorder point is "
        f"**{policy['reorder_point']:,} units**, including **{policy['safety_stock']:,} units** of safety stock. "
        f"Estimated stockout risk with current inventory: **{policy['stockout_risk_pct']:.1f}%**. "
        f"Binding constraints: **{policy['binding_constraints']}**."
    )
    return _forecast_chart(sku, region, result), _policy_table(policy), decision, result.explanation, result.forecast


def ask_planning_copilot(question, sku, region, horizon, promotion, discount, stock, lead_time, service_level, case_pack, minimum_order, capacity, shelf_life):
    result = service.run_scenario(
        sku=sku, region=region, horizon=int(horizon), promotion=bool(promotion),
        discount_pct=float(discount), current_stock=int(stock), lead_time_days=int(lead_time),
        service_level=float(service_level) / 100, case_pack=int(case_pack),
        minimum_order_qty=int(minimum_order), warehouse_capacity=int(capacity),
        shelf_life_days=int(shelf_life),
    )
    return copilot.answer(question, sku, region, result)


DEFAULT_SKU = service.skus[1]
DEFAULT_REGION = "South"
default_result = service.run_scenario(DEFAULT_SKU, DEFAULT_REGION, promotion=True, discount_pct=10, current_stock=1800)
default_outputs = (
    _forecast_chart(DEFAULT_SKU, DEFAULT_REGION, default_result),
    _policy_table(default_result.policy),
    f"### Recommended action\nOrder **{default_result.policy['recommended_order']:,} units** based on the selected scenario.",
    default_result.explanation,
    default_result.forecast,
)


CSS = """
.gradio-container {background: #08111f !important; color: #e9f0ff; font-family: Inter, ui-sans-serif, system-ui;}
.hero {padding: 28px 30px; border-radius: 22px; margin-bottom: 18px; background: radial-gradient(circle at 85% 10%, #384a98 0, #162342 38%, #0d182b 75%); border: 1px solid #293b61;}
.eyebrow {color:#54D6C1; text-transform:uppercase; letter-spacing:.18em; font-size:12px; font-weight:700;}
.hero h1 {font-size:40px; margin:8px 0 4px; color:#fff;}
.hero p {max-width:820px; color:#b8c8e6; font-size:16px;}
.kpi-row {display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); gap:12px; margin:10px 0 22px;}
.kpi {background:#101d33; border:1px solid #263957; border-radius:16px; padding:16px;}
.kpi span {display:block; color:#91a6c9; font-size:12px; text-transform:uppercase; letter-spacing:.08em;}
.kpi strong {display:block; color:#fff; font-size:25px; margin-top:5px;}
.kpi small {color:#54D6C1;}
.primary {background:linear-gradient(135deg,#5269ff,#6d5bff) !important; border:0 !important;}
footer {display:none !important;}
@media(max-width:800px){.kpi-row{grid-template-columns:repeat(2,1fr)}.hero h1{font-size:30px}}
"""


hero_html = f"""
<section class="hero">
  <div class="eyebrow">AI-powered FMCG decision intelligence</div>
  <h1>DemandSphere AI</h1>
  <p>Forecast demand, simulate promotion scenarios, quantify uncertainty and convert predictions into explainable replenishment actions.</p>
</section>
<section class="kpi-row">
  <div class="kpi"><span>Validation wMAPE</span><strong>{metrics['model']['wmape_pct']:.1f}%</strong><small>Time-based holdout</small></div>
  <div class="kpi"><span>Vs seasonal baseline</span><strong>+{metrics['mae_improvement_pct']:.1f}%</strong><small>MAE improvement</small></div>
  <div class="kpi"><span>Interval coverage</span><strong>{metrics['prediction_interval_coverage_pct']:.1f}%</strong><small>80% target band</small></div>
  <div class="kpi"><span>Drift status</span><strong>{metrics['drift_status'].title()}</strong><small>PSI {metrics['target_psi']:.3f}</small></div>
</section>
"""


with gr.Blocks() as demo:
    gr.HTML(hero_html)
    with gr.Row():
        with gr.Column(scale=1, min_width=290):
            gr.Markdown("### Scenario controls")
            sku = gr.Dropdown(service.skus, value=DEFAULT_SKU, label="SKU")
            region = gr.Dropdown(service.regions, value=DEFAULT_REGION, label="Region")
            horizon = gr.Slider(7, 42, value=28, step=7, label="Forecast horizon (days)")
            promotion = gr.Checkbox(value=True, label="Promotion active")
            discount = gr.Slider(0, 30, value=10, step=1, label="Discount (%)")
            stock = gr.Number(value=1800, minimum=0, precision=0, label="Current stock")
            lead_time = gr.Slider(1, 21, value=7, step=1, label="Supplier lead time (days)")
            service_level = gr.Slider(80, 99, value=95, step=1, label="Target service level (%)")
            with gr.Accordion("Operational constraints", open=False):
                case_pack = gr.Number(value=12, minimum=1, precision=0, label="Case-pack quantity")
                minimum_order = gr.Number(value=120, minimum=0, precision=0, label="Minimum order quantity")
                capacity = gr.Number(value=5000, minimum=1, precision=0, label="Warehouse capacity")
                shelf_life = gr.Number(value=60, minimum=1, precision=0, label="Shelf life (days)")
            run = gr.Button("Run AI scenario", variant="primary", elem_classes="primary")
        with gr.Column(scale=3):
            chart = gr.Plot(value=default_outputs[0], label="Demand forecast")
            action = gr.Markdown(value=default_outputs[2])

    with gr.Tabs():
        with gr.Tab("Inventory decision"):
            policy = gr.Dataframe(value=default_outputs[1], interactive=False)
        with gr.Tab("Explainability"):
            explanation = gr.Markdown(value=default_outputs[3])
        with gr.Tab("Forecast data"):
            forecast_data = gr.Dataframe(value=default_outputs[4], interactive=False)
        with gr.Tab("Model governance"):
            gr.Markdown(
                f"**Champion model:** Histogram Gradient Boosting · **Validation:** rolling time holdout · "
                f"**Bias:** {metrics['model']['bias_pct']:+.2f}% · **Anomaly rate:** {metrics['anomaly_rate_pct']:.2f}% · "
                "Synthetic, non-confidential portfolio data. Predictions require planner review."
            )
            if not backtests.empty:
                gr.Dataframe(value=backtests, interactive=False, label="Rolling-origin backtests")
        with gr.Tab("Promotion intelligence"):
            gr.Markdown("Context-adjusted T-learner estimates. These are scenario estimates, not causal proof.")
            gr.Dataframe(value=promotions, interactive=False)
        with gr.Tab("Planning copilot"):
            question = gr.Textbox(
                value="Why should I reorder this product?",
                label="Ask about inventory, promotion or model reliability",
            )
            ask = gr.Button("Ask grounded copilot", variant="primary")
            copilot_answer = gr.Markdown()
            ask.click(
                fn=ask_planning_copilot,
                inputs=[question, sku, region, horizon, promotion, discount, stock, lead_time, service_level, case_pack, minimum_order, capacity, shelf_life],
                outputs=copilot_answer,
                api_name="planning_copilot",
            )

    run.click(
        fn=run_dashboard,
        inputs=[sku, region, horizon, promotion, discount, stock, lead_time, service_level, case_pack, minimum_order, capacity, shelf_life],
        outputs=[chart, policy, action, explanation, forecast_data],
        api_name="forecast_scenario",
    )


if __name__ == "__main__":
    demo.launch(
        server_name="0.0.0.0",
        server_port=7860,
        css=CSS,
        head="<title>DemandSphere AI</title>",
    )
