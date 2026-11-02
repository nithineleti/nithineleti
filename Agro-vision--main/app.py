from __future__ import annotations

from pathlib import Path

import gradio as gr
import pandas as pd
import plotly.graph_objects as go
from PIL import Image

from src.config import SAMPLE_DIR
from src.service import AgroVisionService


service = AgroVisionService()
metrics = service.bundle.metrics
sample_files = sorted(str(path) for path in SAMPLE_DIR.glob("*.png"))


def probability_chart(probabilities: dict) -> go.Figure:
    palette = {"Healthy":"#58D68D", "Leaf Spot":"#F4B860", "Rust":"#E67E49", "Blight":"#D35454"}
    labels = list(probabilities); values = [probabilities[x] * 100 for x in labels]
    fig = go.Figure(go.Bar(x=values, y=labels, orientation="h", marker_color=[palette[x] for x in labels], text=[f"{v:.1f}%" for v in values], textposition="auto"))
    fig.update_layout(template="plotly_dark", height=260, paper_bgcolor="#101b16", plot_bgcolor="#101b16", margin=dict(l=20,r=20,t=20,b=30), xaxis_title="Model probability (%)")
    return fig


def analyse_image(image):
    result = service.analyse(image)
    warnings = ", ".join(result["quality"]["warnings"]) if result["quality"]["warnings"] else "none"
    summary = (
        f"### {result['predicted_class']} · {result['confidence'] * 100:.1f}% confidence\n"
        f"**Estimated affected area:** {result['severity_pct']:.1f}%  \n"
        f"**Human review required:** {'Yes' if result['needs_human_review'] else 'Recommended before action'}  \n"
        f"**Suggested next step:** {result['recommended_action']}\n\n"
        f"*{result['disclaimer']}*"
    )
    quality = pd.DataFrame([
        {"Quality metric":"Sharpness", "Value":result["quality"]["sharpness"]},
        {"Quality metric":"Brightness", "Value":result["quality"]["brightness"]},
        {"Quality metric":"Leaf coverage (%)", "Value":result["quality"]["leaf_coverage_pct"]},
        {"Quality metric":"Warnings", "Value":warnings},
    ])
    return result["overlay"], summary, probability_chart(result["probabilities"]), quality


def batch_analyse(files):
    rows = []
    for file in files or []:
        result = service.analyse(file)
        rows.append({"file":Path(file).name, "prediction":result["predicted_class"], "confidence_pct":round(result["confidence"]*100,1), "severity_pct":round(result["severity_pct"],1), "review":result["needs_human_review"]})
    return pd.DataFrame(rows)


default_image = Image.open(sample_files[-1]) if sample_files else None
default_outputs = analyse_image(default_image) if default_image else (None, "Upload an image", None, pd.DataFrame())

CSS = """
.gradio-container{background:#07120d!important;color:#ecf5ee;font-family:Inter,ui-sans-serif,system-ui}.hero{padding:30px;border-radius:24px;background:radial-gradient(circle at 88% 0,#395c24 0,#203d22 38%,#10251a 72%);border:1px solid #345637;margin-bottom:18px}.eyebrow{color:#a4e676;letter-spacing:.17em;text-transform:uppercase;font-size:12px;font-weight:750}.hero h1{font-size:40px;color:#fff;margin:8px 0}.hero p{color:#bed1c1;max-width:850px}.kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-top:20px}.kpi{background:#13271a;border:1px solid #345637;border-radius:15px;padding:14px}.kpi span{display:block;color:#91ac95;font-size:11px;text-transform:uppercase}.kpi strong{font-size:24px;color:#fff}.primary{background:linear-gradient(135deg,#4d9a45,#78bd54)!important;border:0!important}footer{display:none!important}@media(max-width:800px){.kpis{grid-template-columns:repeat(2,1fr)}}
"""

HERO = f"""
<section class="hero"><div class="eyebrow">Explainable crop-health computer vision</div><h1>AgroVision AI</h1><p>Classify visible leaf-health patterns, segment affected regions, estimate severity, validate image quality and route uncertain cases for expert review.</p><div class="kpis"><div class="kpi"><span>Synthetic macro-F1</span><strong>{metrics['synthetic_macro_f1']*100:.1f}%</strong></div><div class="kpi"><span>Lesion mean IoU</span><strong>{metrics['lesion_segmentation_mean_iou']*100:.1f}%</strong></div><div class="kpi"><span>Health classes</span><strong>{len(metrics['classes'])}</strong></div><div class="kpi"><span>Decision policy</span><strong>Human review</strong></div></div></section>
"""

with gr.Blocks() as demo:
    gr.HTML(HERO)
    with gr.Tabs():
        with gr.Tab("Single leaf analysis"):
            with gr.Row():
                with gr.Column(scale=1):
                    image = gr.Image(value=default_image, type="pil", sources=["upload", "webcam", "clipboard"], label="Leaf image")
                    run = gr.Button("Analyse crop image", variant="primary", elem_classes="primary")
                with gr.Column(scale=1):
                    overlay = gr.Image(value=default_outputs[0], label="Visual lesion explanation")
                    summary = gr.Markdown(value=default_outputs[1])
            with gr.Row():
                probabilities = gr.Plot(value=default_outputs[2])
                quality = gr.Dataframe(value=default_outputs[3], interactive=False, label="Image quality gate")
            run.click(analyse_image, image, [overlay, summary, probabilities, quality], api_name="analyse_leaf")
            if sample_files:
                gr.Examples(examples=[[path] for path in sample_files], inputs=image, label="Fictional sample leaves")
        with gr.Tab("Batch quality inspection"):
            files = gr.File(file_count="multiple", file_types=["image"], type="filepath", label="Upload inspection batch")
            batch_button = gr.Button("Run batch inspection", variant="primary")
            batch_results = gr.Dataframe(interactive=False)
            batch_button.click(batch_analyse, files, batch_results, api_name="batch_inspection")
        with gr.Tab("Model governance"):
            gr.Markdown("**Important:** bundled metrics use procedural demonstration images and are not field accuracy. Production deployment requires a representative labelled dataset, geographic holdout, agronomist review, calibrated uncertainty and continuous drift monitoring.")

if __name__ == "__main__":
    demo.launch(server_name="0.0.0.0", server_port=7860, css=CSS, head="<title>AgroVision AI</title>")
