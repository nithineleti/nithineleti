import matplotlib.pyplot as plt
from matplotlib.patches import FancyBboxPatch
from PIL import Image

from src.config import REPORT_DIR, SAMPLE_DIR
from src.service import AgroVisionService


def card(ax,x,title,value,note,accent="#a4e676"):
    p=FancyBboxPatch((x,.695),.195,.12,boxstyle="round,pad=.012,rounding_size=.018",facecolor="#13271a",edgecolor="#345637"); ax.add_patch(p); ax.text(x+.015,.780,title.upper(),color="#91ac95",fontsize=7.5,weight="bold"); ax.text(x+.015,.730,value,color="white",fontsize=18,weight="bold"); ax.text(x+.015,.708,note,color=accent,fontsize=7)


def main():
    service=AgroVisionService(); m=service.bundle.metrics
    path=SAMPLE_DIR/"rust_1.png"; image=Image.open(path); result=service.analyse(image)
    fig=plt.figure(figsize=(16,9),facecolor="#07120d"); bg=fig.add_axes([0,0,1,1]); bg.set_axis_off()
    bg.text(.055,.95,"EXPLAINABLE CROP-HEALTH COMPUTER VISION",color="#a4e676",fontsize=9,weight="bold"); bg.text(.055,.885,"AgroVision AI",color="white",fontsize=30,weight="bold"); bg.text(.055,.842,"Classification, lesion segmentation, severity scoring and image-quality governance.",color="#bed1c1",fontsize=10)
    card(bg,.055,"Synthetic macro-F1",f"{m['synthetic_macro_f1']*100:.1f}%","Demo validation only"); card(bg,.27,"Lesion mean IoU",f"{m['lesion_segmentation_mean_iou']*100:.1f}%","Pixel overlap"); card(bg,.485,"Affected area",f"{result['severity_pct']:.1f}%","Estimated leaf severity"); card(bg,.70,"Model confidence",f"{result['confidence']*100:.1f}%","Expert review required")
    ax1=fig.add_axes([.06,.22,.34,.43]); ax1.imshow(image); ax1.set_title("Input leaf image",loc="left",color="white",fontsize=13,weight="bold"); ax1.axis("off")
    ax2=fig.add_axes([.415,.22,.34,.43]); ax2.imshow(result["overlay"]); ax2.set_title("Explainable lesion overlay",loc="left",color="white",fontsize=13,weight="bold"); ax2.axis("off")
    panel=FancyBboxPatch((.76,.22),.185,.43,boxstyle="round,pad=.015,rounding_size=.02",facecolor="#101b16",edgecolor="#345637"); bg.add_patch(panel)
    bg.text(.785,.59,"CROP-HEALTH RESULT",color="#91ac95",fontsize=8,weight="bold"); bg.text(.785,.545,result["predicted_class"],color="white",fontsize=18,weight="bold"); bg.text(.785,.505,f"{result['confidence']*100:.1f}% confidence",color="#a4e676",fontsize=9,weight="bold"); bg.text(.785,.445,"Affected leaf area",color="#91ac95",fontsize=8); bg.text(.91,.445,f"{result['severity_pct']:.1f}%",color="white",fontsize=10,weight="bold",ha="right"); bg.text(.785,.39,"Image quality",color="#91ac95",fontsize=8); bg.text(.91,.39,"Pass" if not result['quality']['warnings'] else "Review",color="white",fontsize=10,weight="bold",ha="right"); bg.text(.785,.31,"Route uncertain or poor-quality",color="#bed1c1",fontsize=8); bg.text(.785,.282,"samples to an agronomist.",color="#bed1c1",fontsize=8)
    bg.text(.055,.13,"VISION PIPELINE",color="#91ac95",fontsize=8,weight="bold"); bg.text(.055,.095,"Quality gate → classification → segmentation → severity",color="white",fontsize=10,weight="bold"); bg.text(.58,.13,"DEPLOYMENT",color="#91ac95",fontsize=8,weight="bold"); bg.text(.58,.095,"Gradio · FastAPI · Docker · Batch mode",color="white",fontsize=10,weight="bold"); bg.text(.055,.035,"Portfolio demonstration · Procedural sample imagery · Not a field diagnosis",color="#58705d",fontsize=7.5)
    REPORT_DIR.mkdir(parents=True,exist_ok=True); output=REPORT_DIR/"agrovision_demo.png"; fig.savefig(output,dpi=180,facecolor=fig.get_facecolor(),bbox_inches="tight"); print(output)


if __name__=="__main__": main()
