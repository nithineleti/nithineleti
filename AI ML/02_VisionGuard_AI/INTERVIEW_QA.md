# Interview Q&A
**Why not always run YOLO locally?** Portfolio demos should be reproducible; heavy weights/GPU requirements make demos fragile. The API is designed so a trained detector can replace the baseline.

**Which metrics would you report?** Precision, recall, F1, per-class confusion matrix, mAP50/mAP50-95, localization IoU, inference latency and false-reject rate.

**How do you handle class imbalance?** Targeted augmentation, weighted loss/focal loss, balanced sampling and threshold tuning per defect class.
