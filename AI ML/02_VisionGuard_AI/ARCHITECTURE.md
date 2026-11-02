# Architecture
`Image / Camera → FastAPI upload → Preprocessing → Detector → Localization → Severity scoring → UI / JSON`

The demo detector uses an ROI anomaly mask. The API boundary is model-agnostic, so a trained YOLO detector can replace it via `ml/yolo_adapter.py`.
