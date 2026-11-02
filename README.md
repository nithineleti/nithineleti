<div align="center">

# Pavan Kumar Eleti — Projects Portfolio

**M.Sc. (Data Science) @ IIIT Lucknow · Data Science Intern @ ITC Limited · India 🇮🇳**

I build ML systems, time-series models, AI agents and full-stack data products that deliver business impact.

<a href="https://pavaneleti.me"><img src="https://img.shields.io/badge/Portfolio-pavaneleti.me-8A2BE2?style=for-the-badge" /></a>
<a href="mailto:pavaneletisj@gmail.com"><img src="https://img.shields.io/badge/Email-pavaneletisj%40gmail.com-D14836?style=for-the-badge&logo=gmail&logoColor=white" /></a>
<a href="https://www.linkedin.com/in/eleti-pavan-kumar-800a48305"><img src="https://img.shields.io/badge/LinkedIn-Pavan%20Kumar%20Eleti-0077B5?style=for-the-badge&logo=linkedin&logoColor=white" /></a>
<a href="https://github.com/nithineleti"><img src="https://img.shields.io/badge/GitHub-nithineleti-000?style=for-the-badge&logo=github" /></a>
<a href="https://github.com/PAVANKUMARELETI"><img src="https://img.shields.io/badge/GitHub-PAVANKUMARELETI-000?style=for-the-badge&logo=github" /></a>

</div>

---

This repository collects all of my projects in one place: **AI/ML systems, software-engineering (SDE) backends, data-science products, full-stack apps and BI dashboards**. Every project folder has its own README with setup steps, architecture notes and a demo guide.

> Folders marked 🔗 are **git submodules** that point to their own standalone repositories. Clone with
> `git clone --recurse-submodules <this-repo-url>` to pull them too.

## 📑 Index

| # | Project | Area | Stack | Folder |
|---|---|---|---|---|
| 1 | CodePilot AI | AI agent | FastAPI · scikit-learn · pytest | [AI ML/01_CodePilot_AI](AI%20ML/01_CodePilot_AI) |
| 2 | VisionGuard AI | Computer vision | FastAPI · Pillow · scikit-learn | [AI ML/02_VisionGuard_AI](AI%20ML/02_VisionGuard_AI) |
| 3 | RecSysX | Recommender systems | FastAPI · scikit-learn | [AI ML/03_RecSysX](AI%20ML/03_RecSysX) |
| 4 | ML Sentinel | MLOps / drift | FastAPI · scikit-learn · MLflow/Airflow adapters | [AI ML/04_ML_Sentinel](AI%20ML/04_ML_Sentinel) |
| 5 | FinSight AI v4 | RAG / FinTech | FastAPI · SQLAlchemy · statsmodels · NetworkX | [AI ML/FinSight_AI_v4_Flagship](AI%20ML/FinSight_AI_v4_Flagship) |
| 6 | Distributed E-Commerce Order System | Backend / SDE | FastAPI · Docker | [SDE/01_distributed_ecommerce_order_system](SDE/01_distributed_ecommerce_order_system) |
| 7 | Distributed Task Queue & Scheduler | Backend / SDE | FastAPI · Docker | [SDE/02_distributed_task_queue_scheduler](SDE/02_distributed_task_queue_scheduler) |
| 8 | Distributed Key-Value Store | Distributed systems | FastAPI · Docker | [SDE/03_distributed_key_value_store](SDE/03_distributed_key_value_store) |
| 9 | CodePilot Agent (SDE edition) | Developer tooling | FastAPI · Docker | [SDE/04_codepilot_ai_autonomous_agent](SDE/04_codepilot_ai_autonomous_agent) |
| 10 | Real-Time Notification System | Event-driven backend | FastAPI · Docker | [SDE/05_scalable_realtime_notification_system](SDE/05_scalable_realtime_notification_system) |
| 11 | Deep Research AI Assistant 🔗 | Multi-agent LLM | Streamlit · CrewAI · Firecrawl | [SDE/Deep-Research-AI-Assistant-main](SDE/Deep-Research-AI-Assistant-main) |
| 12 | DevConnector 🔗 | Full-stack web | Node.js · Express · MongoDB · JWT | [SDE/DevConnector-main](SDE/DevConnector-main) |
| 13 | CodePilot (platform) | AI dev platform | FastAPI · React/Vite · PostgreSQL · Nginx | [CodePilot](CodePilot) |
| 14 | AgroVision AI | Computer vision / Agri | Gradio · FastAPI · scikit-learn · SciPy | [Agro-vision--main](Agro-vision--main) |
| 15 | DemandSphere AI v2 | Forecasting / FMCG | Gradio · FastAPI · scikit-learn | [Demand-sphere-main](Demand-sphere-main) |
| 16 | ConsumerVoice GenAI | NLP / GenAI | Gradio · FastAPI · scikit-learn | [Data science/ConsumerVoice_GenAI_Source](Data%20science/ConsumerVoice_GenAI_Source) |
| 17 | Ola Driver Churn Prediction | Classification / Ensembles | scikit-learn · CatBoost · Streamlit | [ola_churn_Prediction-main](ola_churn_Prediction-main) |
| 18 | AgentX Voice Agent Platform | SaaS / Voice AI | Next.js · Vite · Cloudflare Workers · Drizzle | [AgentX-logo-integrated-source-2026-08-05](AgentX-logo-integrated-source-2026-08-05) |
| 19 | Lucid Focus 🔗 | Analytics & control hub | React · Vite · TypeScript · Tailwind · Python | [Lucid-Focus/Lucid-Focus](Lucid-Focus/Lucid-Focus) |
| 20 | Chaos Arena | Multiplayer web game | TypeScript · Netlify Functions · Netlify Blobs | [netlify-ready-game](netlify-ready-game) |
| 21 | Power BI Sales Dashboard 🔗 | BI dashboard | Power BI · Excel | [PowerBI-Sales-Dashboard-main](PowerBI-Sales-Dashboard-main) |
| 22 | Costa Cafe Retail Analytics 🔗 | BI + SQL | MySQL · Power BI | [Costa-Cafe-Retail-Analytics-Dashboard-main](Costa-Cafe-Retail-Analytics-Dashboard-main) |
| 23 | E-commerce Data Analysis Dashboard | BI dashboard | Excel | [Ecommerce-Data-Analysis-Dashboard-Using-Excel-main](Ecommerce-Data-Analysis-Dashboard-Using-Excel-main) |
| 24 | GitHub Profile README | Profile | Markdown | [PAVANKUMARELETI-main](PAVANKUMARELETI-main) |

---

## 🤖 AI / ML

### 1. CodePilot AI — Autonomous Bug-Resolution Agent
Bug report → repository retrieval → patch → automated tests → human-review diff. TF-IDF code retrieval, a deterministic patch planner, a temporary repo sandbox and a pytest validator, all behind a FastAPI backend and browser UI. A provider-neutral LLM adapter is included. Runs fully locally with no API key.
`cd "AI ML/01_CodePilot_AI" && ./run.sh` → http://localhost:8000

### 2. VisionGuard AI — Visual Defect Inspection
Upload an image (or use the bundled normal/scratch/spot/chip samples) and get the defect class, confidence, severity and bounding box. Lightweight engine that runs without a GPU, plus optional PyTorch/YOLO extension points in `ml/`.

### 3. RecSysX — Hybrid Recommendation Engine
Combines content similarity, user-user collaborative signals and popularity, with explainable score components in the UI. Includes top-K serving, metrics, an API, Docker and tests. Optional two-tower + FAISS modules.

### 4. ML Sentinel — Model Lifecycle & Drift Monitoring
Trains a classifier, serves predictions, detects feature drift with PSI, versions retraining runs and shows everything in a monitoring dashboard. Optional MLflow and Airflow adapters.

### 5. FinSight AI v4 — Agentic Financial Intelligence (Flagship)
Evidence-grounded financial research. Hybrid RAG (BM25 + dense + GraphRAG + reranking), a persisted financial knowledge graph, SEC/XBRL adapters, earnings-call intelligence, forecasting with rolling backtests, anomaly and scenario analysis, a citation-verifying agent, and PDF/Markdown report generation. Runs without paid APIs; production adapters for pgvector, Redis, S3 and FinBERT.

---

## 🛠️ Software Engineering (SDE)

Every SDE demo includes `./run_demo.sh`, `pytest` tests, Docker and a browser UI at http://localhost:8000.

| Project | What it demonstrates |
|---|---|
| **Distributed E-Commerce Order System** | Order placement, inventory reservation, idempotent APIs, payment capture, event logging, cache simulation |
| **Distributed Task Queue & Scheduler** | Priority scheduling, retries, dead-letter queue, worker processing, observable job state transitions |
| **Distributed Key-Value Store** | Consistent hashing, replication, TTL expiry, simulated node failure, key routing |
| **CodePilot Agent (SDE edition)** | Bug analysis → code retrieval → safe patch → automated validation → review-ready diff |
| **Real-Time Notification System** | Idempotency keys, queued delivery, provider retries, per-recipient rate limiting, delivery events |
| **Deep Research AI Assistant** 🔗 | Streamlit + CrewAI multi-agent research (Research / Summarization / Presentation agents), Firecrawl web search, PDF report export |
| **DevConnector** 🔗 | Developer portfolio platform: JWT auth, profiles, projects, likes/comments, Multer uploads, admin moderation, Mocha/Chai tests |

### CodePilot — Repository-to-PR-Preview Platform
A production-style version of CodePilot: React + Vite dashboard, FastAPI + Swagger, scrypt auth, PostgreSQL (SQLite fallback), a separate worker, and multi-agent orchestration (triage, retrieval, test, repair, review, delivery). Also includes AST-aware chunking, hashed embeddings with RAG retrieval, a UCB1 repair-strategy policy, a review gate, and PR previews that require human approval. Deploys with Docker Compose + Nginx.

---

## 📊 Data Science

| Project | Highlights | Key result |
|---|---|---|
| **AgroVision AI** | Crop-health CV: image-quality gates, 4-class pattern classification (Healthy / Leaf Spot / Rust / Blight), lesion segmentation with overlay, severity scoring, expert-review routing | Synthetic macro-F1 **96.7%** |
| **DemandSphere AI v2** | FMCG demand intelligence: leakage-safe features, quantile gradient boosting (P10/P50/P90), promotion uplift, inventory optimisation, drift monitoring, planning copilot | Validation wMAPE **8.58%** |
| **ConsumerVoice GenAI** | Offline-first consumer intelligence: sentiment, 6-topic classification, urgent-case escalation, PII redaction, evidence-cited answers, optional FLAN-T5 | Sentiment macro-F1 **93.8%** |
| **Ola Driver Churn Prediction** | Ensemble churn model with dashboard and full submission notebooks | AUC-ROC **0.895**, Recall **0.762** |

Each Gradio app runs with `pip install -r requirements.txt && python app.py`. All data is synthetic or public, with no company data.

---

## 🌐 Full-Stack & Product

- **AgentX Voice Agent Platform**: multi-tenant, no-code voice-agent studio covering agent types, voices, guardrails, browser conversations, website widget, subscription plans and a Twilio calling foundation. Built on Next.js (vinext) + Vite on Cloudflare Workers with Drizzle ORM.
- **Lucid Focus** 🔗: an enterprise telemetry and control hub with real-time SDK tracking, AI call intelligence, an AI receptionist fallback, payment-gateway control and a unified command center. React + Vite + TypeScript + Tailwind frontend, Python backend, Docker/Nginx/Terraform infra.
- **Chaos Arena**: a real-time multiplayer party game for up to 8 players, with an authoritative server-side game engine on Netlify Functions v2 and Netlify Blobs using ETag conditional writes.

---

## 📈 Business Intelligence

- **Power BI Sales Dashboard** 🔗: CY vs PY Sales / Profit / Quantity across 4 regions, sparklines, bubble map and a YoY summary table. [Live web demo](https://nithineleti.github.io/PowerBI-Sales-Dashboard/)
- **Costa Cafe Retail Analytics** 🔗: MySQL queries + Power BI covering top products, peak hours and days, and store performance.
- **E-commerce Data Analysis Dashboard**: an interactive Excel dashboard covering sales trends, customer segmentation, product performance and slicers.

---

## ⚙️ Tech Stack

<p align="center">
  <img src="https://skillicons.dev/icons?i=python,sklearn,pytorch,fastapi,flask,react,nextjs,ts,js,nodejs,express,mongodb,postgres,sqlite,mysql,redis,docker,nginx,terraform,aws,cloudflare,netlify,tailwind,git,githubactions&perline=13" />
</p>

**ML / AI:** scikit-learn, CatBoost, LightGBM, statsmodels, Prophet, SHAP, RAG, GraphRAG, CrewAI, LangChain, FAISS
**Backend:** FastAPI, Express, SQLAlchemy, Alembic, JWT, PostgreSQL, MongoDB
**Frontend:** React, Next.js, Vite, TypeScript, Tailwind, Gradio, Streamlit
**DevOps:** Docker, Docker Compose, Nginx, GitHub Actions, Terraform, Cloudflare Workers, Netlify
**BI:** Power BI, Excel, Tableau, SQL

---

## 🔒 Notes

- No secrets are committed. Every project that needs keys ships a `.env.example`; copy it to `.env` and add your own values.
- Virtual environments, `node_modules`, build output and local databases are excluded. Reinstall with `pip install -r requirements.txt` or `npm install`.
- Some 🔗 submodule repos are private and only visible to their owner.

## ✉️ Contact

**Pavan Kumar Eleti** · [pavaneleti.me](https://pavaneleti.me) · [pavaneletisj@gmail.com](mailto:pavaneletisj@gmail.com) · [LinkedIn](https://www.linkedin.com/in/eleti-pavan-kumar-800a48305)

<div align="center">⭐ If you find something useful here, consider starring the repo!</div>
