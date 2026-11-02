.PHONY: install train test demo api preview
install:
	python -m pip install -r requirements.txt
train:
	python train.py
test:
	python -m unittest discover -s tests -v
	python -m compileall -q src app.py api.py train.py
demo:
	python app.py
api:
	python -m uvicorn api:app --reload
preview:
	python create_demo_preview.py
