import matplotlib.pyplot as plt
import pandas as pd
from matplotlib.patches import FancyBboxPatch

from src.config import REPORT_DIR
from src.service import ConsumerVoiceService


def card(ax, x, title, value, note, accent="#62e5bd"):
    patch = FancyBboxPatch((x, .695), .195, .12, boxstyle="round,pad=.012,rounding_size=.018", facecolor="#10272d", edgecolor="#26504f")
    ax.add_patch(patch); ax.text(x+.015,.780,title.upper(),color="#91b5ae",fontsize=7.5,weight="bold"); ax.text(x+.015,.730,value,color="white",fontsize=18,weight="bold"); ax.text(x+.015,.708,note,color=accent,fontsize=7)


def main():
    service = ConsumerVoiceService(); metrics = service.bundle.metrics
    monthly, topics, kpis = service.dashboard()
    fig = plt.figure(figsize=(16,9),facecolor="#07131b"); bg=fig.add_axes([0,0,1,1]); bg.set_axis_off()
    bg.text(.055,.95,"LOCAL NLP + RETRIEVAL-AUGMENTED INTELLIGENCE",color="#62e5bd",fontsize=9,weight="bold")
    bg.text(.055,.885,"ConsumerVoice GenAI",color="white",fontsize=30,weight="bold")
    bg.text(.055,.842,"Privacy-safe sentiment, topics, urgent actions and evidence-grounded management answers.",color="#b8d7d0",fontsize=10)
    card(bg,.055,"Sentiment macro-F1",f"{metrics['sentiment_macro_f1']*100:.1f}%","Future-dated holdout")
    card(bg,.27,"Topic macro-F1",f"{metrics['topic_macro_f1']*100:.1f}%","Six consumer themes")
    card(bg,.485,"Feedback analysed",f"{kpis['feedback']:,}","Five channels")
    card(bg,.70,"Urgent cases",str(kpis['urgent_cases']),"Human escalation",accent="#ff8a8a")
    ax=fig.add_axes([.055,.24,.60,.40],facecolor="#101b2e")
    colors={"positive":"#35D0A0","neutral":"#F5C36A","negative":"#FF6B7C"}
    for sentiment in colors:
        p=monthly[monthly.sentiment.eq(sentiment)]; ax.plot(p.month,p.feedback_count,label=sentiment.title(),color=colors[sentiment],linewidth=2.4,marker="o",markersize=3)
    ax.set_title("Monthly sentiment intelligence",loc="left",color="white",fontsize=13,weight="bold",pad=12); ax.tick_params(colors="#8faaa5",labelsize=7,rotation=35); ax.grid(color="#274247",alpha=.35); ax.set_ylabel("Feedback count",color="#8faaa5",fontsize=8)
    for s in ax.spines.values(): s.set_color("#26504f")
    leg=ax.legend(frameon=False,ncol=3,fontsize=8); [t.set_color("#c8ded9") for t in leg.get_texts()]
    panel=FancyBboxPatch((.69,.24),.255,.40,boxstyle="round,pad=.015,rounding_size=.02",facecolor="#101b2e",edgecolor="#26504f"); bg.add_patch(panel)
    bg.text(.715,.59,"GROUNDED AI COPILOT",color="#91b5ae",fontsize=8,weight="bold"); bg.text(.715,.545,"What is driving complaints?",color="white",fontsize=14,weight="bold")
    top=topics[topics.sentiment.eq("negative")].head(3)
    y=.49
    for row in top.itertuples():
        bg.text(.715,y,row.topic.replace("_"," ").title(),color="#c8ded9",fontsize=9); bg.text(.91,y,str(row.feedback_count),color="white",fontsize=10,weight="bold",ha="right"); y-=.055
    bg.text(.715,.315,"Answers retrieve and cite review evidence.",color="#91b5ae",fontsize=8); bg.text(.715,.282,"PII is removed before analysis.",color="#62e5bd",fontsize=8,weight="bold")
    bg.text(.055,.13,"PIPELINE",color="#91b5ae",fontsize=8,weight="bold"); bg.text(.055,.095,"Redaction → TF-IDF → NLP models → RAG → action",color="white",fontsize=10,weight="bold")
    bg.text(.55,.13,"DEPLOYMENT",color="#91b5ae",fontsize=8,weight="bold"); bg.text(.55,.095,"Gradio · FastAPI · Docker · CI",color="white",fontsize=10,weight="bold")
    bg.text(.055,.035,"Portfolio demonstration · Fictional consumer feedback · Fully offline default mode",color="#58736d",fontsize=7.5)
    REPORT_DIR.mkdir(parents=True,exist_ok=True); output=REPORT_DIR/"consumer_voice_demo.png"; fig.savefig(output,dpi=180,facecolor=fig.get_facecolor(),bbox_inches="tight"); print(output)


if __name__ == "__main__": main()
