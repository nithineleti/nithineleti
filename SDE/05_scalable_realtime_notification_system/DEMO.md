# Demo Script

1. Start `./run_demo.sh` and open `http://localhost:8000`.
2. Queue a normal notification and process it.
3. Change the message to include `fail` and queue it.
4. Process it once to show retry, then again to show delivery.
5. Explain idempotency keys, recipient rate limiting, worker queues, and provider failures.

Interview line: "This project shows event-driven backend design with queues, retries, rate limits, idempotency, and delivery observability."
