# AI/ML Resume Projects Pack

This pack contains five **runnable, demo-first portfolio projects** designed for AI/ML resume building and interviews:

1. **CodePilot AI** — autonomous bug resolution agent
2. **VisionGuard AI** — computer-vision defect inspection
3. **RecSysX** — hybrid recommendation engine
4. **ML Sentinel** — MLOps + model drift monitoring
5. **FinSight AI** — grounded financial research + forecasting

Each project includes:
- Full FastAPI backend + interactive frontend
- Local demo data; no paid API key required
- Dockerfile + docker-compose
- Automated tests + GitHub Actions CI
- README + architecture + demo guide
- Resume bullets
- Presentation script + interview Q&A
- PDF explanation and presentation guide (generated in `docs/`)
- Demo screenshot

## Recommended GitHub strategy
Create one repository per project. Pin these five repositories. Use the exact resume bullets only after you can run the demo and explain each architectural choice.

## Important claim hygiene
The default projects prioritize reproducibility. VisionGuard and RecSysX include **optional** PyTorch/YOLO/two-tower/FAISS modules. Do not claim you trained or deployed those models until you actually run that optional path and record metrics.

## Validation status
All five core projects are covered by automated tests. The pack also stores `demo_output.json` and a representative `screenshots/demo_preview.png` in every project so you have a fallback when presenting.

## Suggested build/presentation order
1. CodePilot AI — strongest agent/software-engineering story.
2. ML Sentinel — proves you understand deployment and monitoring.
3. RecSysX — proves recommender/ranking fundamentals.
4. VisionGuard AI — proves computer-vision product thinking.
5. FinSight AI — proves retrieval/NLP + forecasting.
