# Model Card — DemandSphere AI v1.0

## Intended use

Portfolio demonstration of daily FMCG SKU-region forecasting and replenishment decision support. A human planner should review outputs.

## Out-of-scope use

- Autonomous purchase-order release
- Financial guidance or revenue commitments
- Causal claims about promotion effectiveness
- Use on a real business without retraining, calibration and data validation

## Data

11,520 fictional observations across 480 days, six SKUs and four regions. The generator includes weekly and annual seasonality, trend, promotions, price changes, marketing, competitor index, weather, festivals, noise and occasional stockouts. No confidential or personal data is included.

## Model

Three Histogram Gradient Boosting regressors: expected demand, 10th quantile and 90th quantile. Categorical variables are one-hot encoded. An Isolation Forest flags unusual validation observations. A separate T-learner estimates promotion scenarios from measured pre-promotion context.

## Evaluation protocol

All dates before 2026-05-06 are used for training; the final 56 days are validation. Lag and rolling features are shifted by one day. The benchmark is a lag-7 seasonal naive forecast.

## Performance

- wMAPE: 8.58%
- MAE: 11.53 units
- RMSE: 15.38 units
- Bias: -1.50%
- MAE improvement vs baseline: 56.51%
- 80% interval empirical coverage: 77.08%
- Three-fold rolling-origin mean wMAPE: 8.98%

Values are reproducible with seed 42 and may vary if the generator, features or model settings change.

## Limitations and risks

- Synthetic patterns are cleaner than real enterprise data.
- Lost-sales correction is a rolling-history approximation.
- Recursive multi-step forecasts accumulate error.
- Promotion scenarios are associational model counterfactuals, not causal estimates.
- The current optimiser omits case-pack, shelf-life and capacity constraints.
- Aggregate consistency is not enforced across hierarchy levels.

## Monitoring

Track data freshness, nulls, unseen categories, feature PSI, rolling wMAPE, bias, anomaly rate and interval coverage. PSI below 0.10 is stable, 0.10–0.25 is watch and above 0.25 is a retraining investigation—not an automatic deployment.
