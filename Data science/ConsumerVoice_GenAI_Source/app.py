from __future__ import annotations

import gradio as gr
import pandas as pd
import plotly.graph_objects as go

from src.service import ConsumerVoiceService


service = ConsumerVoiceService()
metrics = service.bundle.metrics
_, _, all_kpis = service.dashboard()


def probability_chart(probabilities: dict) -> go.Figure:
    colors = {"positive": "#35D0A0", "neutral": "#F5C36A", "negative": "#FF6B7C"}
    labels = list(probabilities)
    values = [probabilities[label] * 100 for label in labels]
    fig = go.Figure(go.Bar(x=values, y=labels, orientation="h", marker_color=[colors[x] for x in labels], text=[f"{x:.1f}%" for x in values], textposition="auto"))
    fig.update_layout(template="plotly_dark", height=250, paper_bgcolor="#101B2E", plot_bgcolor="#101B2E", margin=dict(l=20, r=20, t=20, b=30), xaxis_title="Probability (%)", yaxis_title=None)
    return fig


def analyse_feedback(text: str):
    result = service.analyze(text)
    pii = ", ".join(result["pii_removed"]) if result["pii_removed"] else "none"
    summary = (
        f"### Analysis\n**Sentiment:** {result['sentiment'].title()} ({result['sentiment_confidence'] * 100:.1f}% confidence)  \n"
        f"**Topic:** {result['topic'].replace('_', ' ').title()} ({result['topic_confidence'] * 100:.1f}% confidence)  \n"
        f"**Urgent escalation:** {'Yes' if result['urgent'] else 'No'} ({result['urgent_probability'] * 100:.1f}% risk)  \n"
        f"**PII removed:** {pii}"
    )
    return summary, probability_chart(result["sentiment_probabilities"]), result["redacted_text"]


def trend_chart(product: str):
    monthly, topics, kpis = service.dashboard(product)
    fig = go.Figure()
    colors = {"positive": "#35D0A0", "neutral": "#F5C36A", "negative": "#FF6B7C"}
    for sentiment in ("positive", "neutral", "negative"):
        part = monthly[monthly["sentiment"].eq(sentiment)]
        fig.add_trace(go.Scatter(x=part["month"], y=part["feedback_count"], mode="lines+markers", name=sentiment.title(), line=dict(color=colors[sentiment], width=2.5)))
    fig.update_layout(template="plotly_dark", height=390, paper_bgcolor="#101B2E", plot_bgcolor="#101B2E", margin=dict(l=40, r=20, t=45, b=45), title=f"Sentiment trend · {product}", yaxis_title="Feedback count", hovermode="x unified")
    kpi_text = f"**{kpis['feedback']:,} feedback** · **{kpis['negative_pct']:.1f}% negative** · **{kpis['urgent_cases']} urgent** · **{kpis['average_rating']:.2f}/5 rating**"
    return fig, topics.head(18), kpi_text


def ask_copilot(question: str):
    return service.ask(question)


sample_text = "The package was damaged and the seal was broken. Please investigate this issue. Contact me at customer@example.com."
sample_analysis = analyse_feedback(sample_text)
sample_trend = trend_chart("All products")

CSS = """
.gradio-container{background:#07131b!important;color:#e9f6f2;font-family:Inter,ui-sans-serif,system-ui}
.hero{padding:30px;border-radius:24px;background:radial-gradient(circle at 90% 0,#1f675d 0,#123f3d 35%,#0b252a 70%);border:1px solid #24524d;margin-bottom:18px}
.eyebrow{color:#62e5bd;letter-spacing:.17em;text-transform:uppercase;font-size:12px;font-weight:750}.hero h1{font-size:40px;color:#fff;margin:8px 0}.hero p{color:#b8d7d0;max-width:850px}
.kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-top:20px}.kpi{background:#10272d;border:1px solid #26504f;border-radius:15px;padding:14px}.kpi span{display:block;color:#91b5ae;font-size:11px;text-transform:uppercase}.kpi strong{font-size:24px;color:#fff}.primary{background:linear-gradient(135deg,#1fa985,#43c6a1)!important;border:0!important}footer{display:none!important}@media(max-width:800px){.kpis{grid-template-columns:repeat(2,1fr)}}
"""

HERO = f"""
<section class="hero"><div class="eyebrow">Local NLP + retrieval-augmented intelligence</div><h1>ConsumerVoice GenAI</h1><p>Turn omnichannel reviews, emails and survey feedback into privacy-safe sentiment, topics, urgent actions and grounded management answers.</p>
<div class="kpis"><div class="kpi"><span>Sentiment macro-F1</span><strong>{metrics['sentiment_macro_f1']*100:.1f}%</strong></div><div class="kpi"><span>Topic macro-F1</span><strong>{metrics['topic_macro_f1']*100:.1f}%</strong></div><div class="kpi"><span>Feedback analysed</span><strong>{all_kpis['feedback']:,}</strong></div><div class="kpi"><span>Urgent cases</span><strong>{all_kpis['urgent_cases']}</strong></div></div></section>
"""

with gr.Blocks() as demo:
    gr.HTML(HERO)
    with gr.Tabs():
        with gr.Tab("Analyse feedback"):
            with gr.Row():
                with gr.Column(scale=2):
                    review = gr.Textbox(value=sample_text, lines=6, label="Customer feedback")
                    analyse = gr.Button("Analyse securely", variant="primary", elem_classes="primary")
                    redacted = gr.Textbox(value=sample_analysis[2], label="Privacy-safe text", interactive=False)
                with gr.Column(scale=2):
                    analysis = gr.Markdown(value=sample_analysis[0])
                    probabilities = gr.Plot(value=sample_analysis[1])
            analyse.click(analyse_feedback, review, [analysis, probabilities, redacted], api_name="analyse_feedback")
        with gr.Tab("Consumer intelligence"):
            product = gr.Dropdown(service.products, value="All products", label="Product filter")
            dashboard_kpis = gr.Markdown(value=sample_trend[2])
            trend = gr.Plot(value=sample_trend[0])
            topic_table = gr.Dataframe(value=sample_trend[1], interactive=False, label="Topic breakdown")
            product.change(trend_chart, product, [trend, topic_table, dashboard_kpis])
        with gr.Tab("Grounded AI copilot"):
            gr.Markdown("The default mode runs fully offline. Retrieved evidence is displayed so every answer can be checked.")
            question = gr.Textbox(value="What are customers saying about damaged packaging?", label="Management question")
            ask = gr.Button("Generate grounded insight", variant="primary", elem_classes="primary")
            answer = gr.Markdown()
            evidence = gr.Dataframe(interactive=False, label="Retrieved evidence")
            ask.click(ask_copilot, question, [answer, evidence], api_name="ask_consumer_copilot")
        with gr.Tab("Governance"):
            gr.Markdown("PII redaction · Evidence citations · Confidence scores · Future-dated validation · Human escalation · Optional local FLAN-T5 generation")

if __name__ == "__main__":
    demo.launch(server_name="0.0.0.0", server_port=7860, css=CSS, head="<title>ConsumerVoice GenAI</title>")
