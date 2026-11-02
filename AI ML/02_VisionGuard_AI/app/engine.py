from PIL import Image
import numpy as np
from io import BytesIO

def analyze_bytes(raw: bytes):
    img = Image.open(BytesIO(raw)).convert("L").resize((420,280))
    arr = np.asarray(img, dtype=float)
    # Focus on the known inspection region; a detector/segmenter would provide this ROI in production.
    x1,y1,x2,y2 = 90,85,330,195
    roi = arr[y1:y2, x1:x2]
    med = float(np.median(roi))
    mask = np.abs(roi - med) > 55
    ys,xs = np.where(mask)
    if len(xs) < 25:
        return {"label":"normal","confidence":0.96,"defect_pixels":int(len(xs)),"bbox":None,"severity":"none"}
    bx1, bx2, by1, by2 = int(xs.min()+x1), int(xs.max()+x1), int(ys.min()+y1), int(ys.max()+y1)
    w,h=max(1,bx2-bx1),max(1,by2-by1)
    ratio=max(w/h,h/w)
    area=int(len(xs))
    if ratio > 3.0: label="scratch"
    elif bx1 <= 105 and by1 <= 105: label="edge_chip"
    else: label="surface_spot"
    conf=min(0.99, 0.72 + area/5000)
    severity="high" if area>1000 else "medium"
    return {"label":label,"confidence":round(float(conf),3),"defect_pixels":area,"bbox":[bx1,by1,bx2,by2],"severity":severity}
