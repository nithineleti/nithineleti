from io import BytesIO

from fastapi import FastAPI, File, HTTPException, UploadFile
from PIL import Image

from src.service import AgroVisionService


app = FastAPI(title="AgroVision AI API", version="1.0.0")
service = AgroVisionService()


@app.get("/health")
def health():
    return {"status":"healthy", "model_trained_at":service.bundle.trained_at}


@app.post("/analyse")
async def analyse(file: UploadFile = File(...)):
    if not (file.content_type or "").startswith("image/"):
        raise HTTPException(status_code=415, detail="Upload an image file")
    try:
        image = Image.open(BytesIO(await file.read())).convert("RGB")
        result = service.analyse(image)
        result.pop("overlay")
        return result
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Image could not be analysed: {exc}") from exc
