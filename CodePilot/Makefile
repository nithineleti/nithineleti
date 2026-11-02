.PHONY: install test demo api worker web docker-up docker-down clean

install:
	python3 -m venv .venv
	. .venv/bin/activate && pip install -e './backend[dev]'
	cd frontend && npm install

test:
	PYTHONPATH=backend pytest -q backend/tests

demo:
	PYTHONPATH=backend python3 -m app.demo

api:
	PYTHONPATH=backend uvicorn app.main:app --reload --port 8000

worker:
	PYTHONPATH=backend python3 -m app.worker

web:
	cd frontend && npm run dev

docker-up:
	docker compose up --build

docker-down:
	docker compose down

clean:
	rm -rf .venv frontend/node_modules frontend/dist .pytest_cache workspaces/run-* data/*.db data/rewards.json
