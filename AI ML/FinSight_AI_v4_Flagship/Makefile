.PHONY: run run-advanced test migrate demo docker docker-ml observability storage

run:
	./run.sh

run-advanced:
	./run_advanced.sh

test:
	pytest -q

migrate:
	alembic upgrade head

demo:
	python scripts/demo_api.py

docker:
	docker compose up --build

docker-ml:
	docker compose -f docker-compose.yml -f docker-compose.ml.yml up --build

observability:
	docker compose -f docker-compose.yml -f docker-compose.observability.yml up --build

storage:
	docker compose -f docker-compose.storage.yml up
