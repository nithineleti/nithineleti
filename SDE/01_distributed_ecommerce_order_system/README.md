# Distributed E-Commerce Order Management System

A demo-ready backend that shows order placement, inventory reservation, idempotent order APIs, payment capture, event logging, and simple cache simulation. Designed to explain backend engineering, transactions, concurrency, caching, and asynchronous workflows in an SDE interview.

## Quick Demo

```bash
cd 01_distributed_ecommerce_order_system
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
