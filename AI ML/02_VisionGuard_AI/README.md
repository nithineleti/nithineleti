# VisionGuard AI — Visual Defect Inspection
A fully local visual inspection demo. Upload an image or use the provided normal/scratch/spot/chip examples. The app returns a defect class, confidence, severity and bounding box.

## Run
`./run.sh` then open `http://localhost:8000`.

## Portfolio design
The default engine is intentionally lightweight so your demo works without a GPU or downloading model weights. `ml/` includes optional PyTorch and YOLO extension points. For a resume claim such as **“trained YOLO”**, first train those adapters on a real/labeled dataset and save your metrics.

See the demo, architecture, presentation and interview documents in this repository.
