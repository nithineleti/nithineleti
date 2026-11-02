# Model Card

## Intended use

Portfolio demonstration and first-level visual triage. Not intended for autonomous treatment, pesticide or crop-loss decisions.

## Data

720 procedural 128×128 leaf images across Healthy, Leaf Spot, Rust and Blight. Images contain controlled variation in lighting, texture, orientation, lesions and simulated annotation ambiguity.

## Model

Balanced Random Forest using 42 engineered colour, texture, gradient, coverage and spatial features. A separate deterministic segmentation stage measures affected pixels.

## Limitations

- Procedural images do not capture real agricultural diversity.
- Only one leaf is expected per image.
- Similar nutrient deficiencies and mixed diseases are not modelled.
- Background segmentation is simplified.
- Suggested actions are triage guidance, not diagnosis or treatment advice.

## Required production controls

Expert-reviewed data, crop-specific labels, farm/geographic holdout, calibrated confidence, out-of-distribution rejection, human confirmation, model versioning and post-deployment error review.
