# Distributed Task Queue and Job Scheduler

A demo-ready backend that implements job submission, priority scheduling, retry logic, dead-letter queue handling, worker-style processing, and observable job state transitions.

## Quick Demo

```bash
cd 02_distributed_task_queue_scheduler
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
