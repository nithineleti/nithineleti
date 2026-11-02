# Scalable Real-Time Notification System

A demo-ready event-driven backend that accepts notification requests, uses idempotency keys, queues delivery jobs, handles provider retries, rate limits recipients, and exposes delivery events.

## Quick Demo

```bash
cd 05_scalable_realtime_notification_system
./run_demo.sh
```

Open `http://localhost:8000` in the browser.

## Run Tests

```bash
pip install -r requirements.txt
pytest -q
```

## Docker Demo

```bash
docker compose up --build
```
