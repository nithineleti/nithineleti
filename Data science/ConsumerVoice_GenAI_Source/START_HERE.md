# Start Here

## One-line explanation

ConsumerVoice GenAI converts large volumes of unstructured customer feedback into measurable sentiment, complaint themes, urgent cases and management actions.

## Build process

1. Generate or ingest feedback.
2. Validate fields and redact PII.
3. Create TF-IDF word and character features.
4. Train sentiment, topic and urgency models.
5. Validate on future-dated feedback.
6. Build a local retrieval index.
7. Retrieve evidence and generate cited answers.
8. Serve the system through Gradio and FastAPI.

## First demo

Run `python app.py`, analyse the sample complaint, filter the consumer dashboard and ask the copilot: “What is driving packaging complaints?”

Never claim that synthetic validation metrics represent production accuracy. Never expose unredacted personal data to a generator.
