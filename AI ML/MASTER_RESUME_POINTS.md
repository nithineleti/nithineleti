# Master Resume Project Section

## CodePilot AI — Autonomous Software Engineering Agent
**Python, FastAPI, RAG-style Retrieval, NLP, Code Search, Pytest, Docker, CI/CD**
- Built an autonomous software-engineering agent that indexes a repository, retrieves bug-relevant files using vectorized code search, generates minimal patches, and validates changes with automated tests.
- Implemented bug triage, patch reasoning, sandboxed test execution and unified-diff review through a FastAPI workflow with human approval before changes are accepted.
- Designed provider-agnostic LLM/RAG extension points, Docker packaging and CI testing for a production-style engineering workflow.

## VisionGuard AI — Visual Defect Inspection Platform
**Python, FastAPI, Computer Vision, Image Processing, PyTorch/YOLO-ready, Docker**
- Built a computer-vision inspection service that detects surface defects, localizes anomalous regions and returns confidence/severity scores through a real-time inference API.
- Implemented preprocessing, ROI analysis, bounding-box visualization, upload validation, Docker deployment and automated tests.
- Added pluggable PyTorch/YOLO model adapters so the inference API can be upgraded to trained deep-learning detectors without changing the application layer.

## RecSysX — Hybrid Recommendation Engine
**Python, Scikit-learn, Collaborative Filtering, Embeddings, FastAPI, PyTorch/FAISS-ready**
- Built a hybrid recommendation engine combining content embeddings, collaborative user behavior and popularity signals to generate personalized top-K recommendations.
- Implemented recommendation explainability, seen-item filtering, catalog-coverage metrics, FastAPI serving, Docker deployment and automated tests.
- Added optional PyTorch two-tower and FAISS modules for learned user/item embeddings and scalable approximate-nearest-neighbor retrieval.

## ML Sentinel — MLOps & Model Monitoring Platform
**Python, Scikit-learn, FastAPI, Drift Monitoring, MLflow/Airflow-ready, Docker, GitHub Actions**
- Built an end-to-end MLOps service covering preprocessing, training, versioned metrics, online inference, retraining and production-style feature drift monitoring using PSI.
- Exposed model-health and prediction APIs with input validation, automated tests, Docker packaging and GitHub Actions CI.
- Added optional MLflow experiment tracking and Airflow retraining integrations for model registry, scheduled retraining and alerting workflows.

## FinSight AI — Financial Research & Forecasting Assistant
**Python, FastAPI, NLP, RAG-style Retrieval, TF-IDF, Time-Series Forecasting, Docker**
- Built a financial-research assistant that indexes documents, retrieves relevant evidence and returns grounded answers with source-level citations.
- Added document sentiment analysis and revenue forecasting, exposing research and forecast workflows through FastAPI and an interactive dashboard.
- Designed a provider-agnostic generation interface and CI-tested architecture so dense embeddings and a stronger LLM generator can be integrated later.
