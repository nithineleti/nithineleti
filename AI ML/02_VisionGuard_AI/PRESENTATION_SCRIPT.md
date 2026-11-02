# Presentation Script
“VisionGuard AI is a visual-quality inspection platform. An operator uploads an image or camera frame. The inference service preprocesses the image, identifies anomalous pixels inside the inspection region, classifies the defect, calculates a bounding box and severity, and returns the result to a live dashboard. I kept the default model lightweight so the portfolio demo runs on a normal laptop, while the repository has PyTorch and YOLO adapters for a trained industrial deployment.”

Demo order: Scratch → Normal → Spot → explain API/model swap → production improvements.
