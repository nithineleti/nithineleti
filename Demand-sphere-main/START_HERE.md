# Start Here

## What did I build?

DemandSphere AI helps an FMCG planner answer five questions:

1. How many units will customers demand?
2. What is the uncertainty around that prediction?
3. How will a planned promotion change expected demand?
4. How much stock should we order after applying operational constraints?
5. What evidence should a planner review before approving the action?

## Explain it to a manager in simple English

“First, I clean sales data and correct days where low stock hides real demand. Then I create historical and commercial features and train point and quantile gradient-boosting models using only past information. I validate them across repeated future windows. The forecast then feeds a constrained inventory optimiser that respects case packs, minimum orders, warehouse capacity and shelf life. A promotion model and grounded planning copilot explain the evidence before human approval.”

## Your strongest points

- The validation is time-based, so the result is trustworthy for forecasting.
- The model beats a weekly seasonal baseline by 56.51% on MAE.
- Prediction uncertainty is used in a real inventory decision.
- The promotion result is correctly described as a scenario estimate, not causal proof.
- Monitoring, explainability, API, automated tests and Docker show production thinking.
- Three rolling-origin backtests reduce dependence on a single lucky holdout.
- Promotion uplift and operational constraints connect marketing with inventory planning.

## First demo

```bash
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python app.py
```

Open `http://127.0.0.1:7860` and follow the six steps in `docs/INTERVIEW_GUIDE.md`.

## Files to read in order

1. `START_HERE.md`
2. `README.md`
3. `docs/INTERVIEW_GUIDE.md`
4. `docs/MODEL_CARD.md`
5. Source code only after you understand the business flow
