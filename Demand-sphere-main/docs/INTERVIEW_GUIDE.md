# DemandSphere AI — Interview Explanation Guide

## 30-second introduction

“I built DemandSphere AI v2, an end-to-end FMCG demand and inventory intelligence platform. It predicts SKU-region demand with uncertainty, estimates context-adjusted promotion uplift and converts forecasts into constrained order decisions that respect case packs, minimum orders, capacity and shelf life. It achieved 8.58% wMAPE on the final holdout and 8.98% mean wMAPE across three rolling backtests. I also added a grounded planning copilot, drift monitoring, anomaly detection, an API, tests and Docker.”

## Explain the business problem simply

An FMCG company has two expensive mistakes:

- **Under-forecasting:** products go out of stock, customers switch brands and revenue is lost.
- **Over-forecasting:** excess stock locks working capital and can become obsolete.

A useful system must do more than predict a number. It must say how uncertain that number is and what inventory action the planner should take.

## The project flow

### 1. Data

The demo uses 11,520 fictional daily records across six SKUs and four regions. Signals include observed sales, stockouts, price, discount, promotion, marketing spend, competitor price index, channel, weather and calendar effects.

Important point: observed sales are not always equal to demand. If stock is unavailable, sales are censored. I estimate unconstrained demand on stockout days from recent non-stockout history before creating lag features.

### 2. Leakage prevention

All lag and rolling features use `.shift(1)`, so the feature for a date only sees information available before that date. I split by calendar time: earlier dates train the model and the last 56 days validate it. A random split would leak future demand patterns and exaggerate performance.

### 3. Features

- Demand lags: 1, 7, 14 and 28 days
- Rolling mean: 7 and 28 days
- Rolling volatility: 7 days
- Calendar: weekday, month, cyclical sine/cosine encoding
- Commercial: price, discount, promotion and marketing spend
- External: weather and competitor price index
- Hierarchy: SKU, category, region and sales channel

### 4. Model choice

I used Histogram Gradient Boosting because retail demand is nonlinear: promotion response depends on category, price, weekday and recent demand. It captures these interactions without requiring a huge neural network and trains quickly on tabular data.

I trained three models:

- Point model for expected demand
- 10th-percentile model for downside demand
- 90th-percentile model for upside demand

The interval is operationally valuable because safety stock should increase when uncertainty increases.

### 5. Evaluation

I compare against a strong, simple seasonal baseline: demand from seven days earlier.

| Metric | Why it matters |
|---|---|
| MAE | Average unit error; easy for planners to understand |
| RMSE | Penalises large misses more heavily |
| wMAPE | Portfolio-level error weighted by sales volume |
| Bias | Detects systematic over- or under-forecasting |
| Interval coverage | Checks whether uncertainty estimates are useful |

Result: 8.58% validation wMAPE, -1.50% bias and 56.51% lower MAE than the lag-7 baseline.

### 6. Turning prediction into a decision

The system calculates:

`lead-time demand = average daily forecast × supplier lead time`

`safety stock = service-level z-score × residual standard deviation × √lead time`

`reorder point = lead-time demand + safety stock`

`recommended order = target stock − current stock`, rounded to a case pack and capped by warehouse and shelf-life limits.

This is the most important interview point: the output is not just “tomorrow demand is 250.” It is “order 1,863 units to support a 95% target service level under this scenario.”

### 7. Explainability and monitoring

Global permutation importance shows which raw inputs most affect holdout error. The dashboard also creates a local counterfactual by turning the selected promotion off and comparing day-one demand.

For production safety:

- PSI monitors distribution drift.
- Bias and wMAPE monitor forecast quality.
- Isolation Forest flags unusual residual, promotion and stockout combinations.
- Planner review remains required before an order is released.

## Five-minute demo script

1. “This top row shows model quality on an unseen future period.”
2. “I will select Premium Biscuits in the South region and forecast 28 days.”
3. “The purple line is the expected forecast; the shaded band communicates uncertainty.”
4. “I activate a 10% promotion. The explanation compares it with a no-promotion counterfactual.”
5. “Current stock is 1,800 units and lead time is seven days. The system recommends an order and shows the reorder point and risk.”
6. “I can also show the adjusted promotion estimate and ask the offline copilot why the order is recommended.”
7. “Finally, governance shows rolling backtests, drift, bias, anomalies and human review.”

## Questions a manager may ask

### Why not LSTM or Transformer?

For this dataset size and mostly tabular drivers, gradient boosting is faster, easier to explain and often more accurate. I would benchmark deep temporal models when there are thousands of related series, longer history and richer covariates. Model complexity must earn its operational cost.

### Why not a random train/test split?

It lets the model learn from future patterns and produces optimistic metrics. Forecasting must be evaluated forward in time.

### How do you prevent leakage in rolling features?

Every lag and rolling calculation first shifts the target by one day. Today’s target can never appear in today’s features.

### Is promotion uplift causal?

No. In this version it is a model-based scenario estimate, not a causal claim. For causal uplift I would use experiment data, propensity adjustment or doubly robust estimation and explicitly check overlap and confounding.

### Why is interval coverage not exactly 80%?

Quantile models optimise pinball loss, and finite holdouts can be imperfectly calibrated. The achieved coverage is 77.08%. In production I would calibrate intervals on a separate recent window and monitor coverage by category.

### How would you handle new products?

Use category, region, channel, price and launch attributes, plus similarity to existing products. I would add cold-start rules and gradually blend toward SKU-specific history as observations arrive.

### How would this scale?

Move data preparation to Spark or warehouse SQL, train by category or with a global model, store approved features centrally, batch-score horizons and expose results through the API. Add hierarchical reconciliation so SKU forecasts sum correctly to category and national totals.

### What would trigger retraining?

A scheduled candidate run plus gates: rising wMAPE/bias, PSI above thresholds, weak interval coverage or business changes. A new model is promoted only if it beats both the current champion and baseline on rolling backtests.

### What are the main limitations?

Synthetic data, simplified lost-sales estimation, no true causal promotion effect, no supply capacity constraints and no hierarchical reconciliation. These are stated in the model card rather than hidden.

## Honest wording to use

Say: “I designed and implemented this portfolio system using fictional FMCG data to demonstrate an enterprise workflow.”

Do not say that the data came from ITC, that the scenario uplift is causal, or that the model is ready to autonomously place orders.
