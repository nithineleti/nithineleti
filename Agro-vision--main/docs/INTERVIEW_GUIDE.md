# AgroVision AI — Interview Guide

## 30-second pitch

“AgroVision AI is an explainable crop-health vision pipeline. It validates image quality, classifies four visible leaf patterns, segments affected pixels, calculates severity and routes uncertain cases for expert review. The packaged model achieves 96.7% macro-F1 and 89.3% lesion IoU on procedural demonstration data. I also implemented batch inspection, visual overlays, a Gradio frontend, FastAPI, Docker and a MobileNetV3 transfer-learning path.”

## Explain the workflow

- Quality checks prevent bad images from producing confident-looking answers.
- Leaf segmentation separates plant material from the background.
- Colour histograms detect pigment changes.
- Gradient and texture statistics capture lesions and surface irregularity.
- Spatial features distinguish small rust-like spots from larger blight-like regions.
- A balanced Random Forest produces class probabilities.
- Pixel segmentation measures affected area and creates an explanation overlay.
- Low-confidence or poor-quality cases are sent to a human expert.

## Five-minute demo

1. Select a sample leaf.
2. Show the predicted class and probabilities.
3. Compare the original image with the lesion overlay.
4. Explain the severity percentage.
5. Show image-quality checks.
6. Upload several samples in batch mode.
7. State clearly that an agronomist must confirm real-world decisions.

## Questions

**Why use a lightweight model?** It makes the portfolio project reproducible on CPU. For real data, the included transfer-learning path fine-tunes MobileNetV3 and can later be compared with ResNet, MobileViT or DINOv3.

**How should production validation be performed?** Split by farm, geography and season—not random image only—and report per-class recall, macro-F1, calibration, IoU and failure cases.

**Why is synthetic accuracy not field accuracy?** Procedural images contain controlled patterns. Real images contain background clutter, multiple diseases, nutrient deficiency, camera variation and unseen crop varieties.

**How can this support a business?** It can prioritise scouting, standardise first-level quality inspection, quantify affected area and create an auditable human-review queue.
