# Distributed Key-Value Store

A demo-ready distributed systems project that implements consistent hashing, replication, TTL expiration, simulated node failure, and key routing across multiple storage nodes.

## Quick Demo

```bash
cd 03_distributed_key_value_store
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
