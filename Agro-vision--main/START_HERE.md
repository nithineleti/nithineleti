# Start Here

## One-line explanation

AgroVision AI checks crop-leaf image quality, identifies visible health patterns, highlights affected regions and measures severity so experts can prioritise inspections.

## Build process

1. Define classes and collect agronomist-reviewed images.
2. Split data by farm or geography to prevent near-duplicate leakage.
3. Apply quality checks and image augmentation.
4. Train an image classifier.
5. Train or configure lesion segmentation.
6. Validate macro-F1, per-class recall, IoU, Dice and calibration.
7. Add confidence thresholds and expert escalation.
8. Build the dashboard, batch workflow and API.
9. Monitor field drift after deployment.

The bundled procedural model is designed to make the entire project runnable without downloading a large dataset. It must be replaced or fine-tuned before real agricultural use.
