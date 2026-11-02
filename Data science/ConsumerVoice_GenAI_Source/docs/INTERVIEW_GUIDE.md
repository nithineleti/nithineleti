# ConsumerVoice GenAI — Interview Guide

## 30-second pitch

“ConsumerVoice GenAI is an offline-first NLP and retrieval-augmented intelligence platform. It removes personal information, classifies customer sentiment and complaint topics, detects urgent feedback and retrieves evidence to answer management questions. On a future-dated synthetic holdout, sentiment macro-F1 is 93.8%, topic macro-F1 is 88.6% and urgent-case F1 is 88.9%. I exposed the pipeline through Gradio and FastAPI and added citations, confidence scores, Docker and automated tests.”

## Why it matters

Managers cannot manually read thousands of emails, reviews and survey comments. This system converts unstructured text into trends and queues while preserving the original evidence behind every conclusion.

## Technical explanation

- PII is removed using explicit email, phone and order-ID patterns.
- Word n-grams capture meaning; character n-grams handle spelling variations.
- Regularised logistic models produce interpretable class probabilities.
- A time-based holdout tests whether the model works on later feedback.
- TF-IDF cosine retrieval selects evidence for a question.
- The answer cites retrieved rows, reducing unsupported claims.
- A small local FLAN-T5 model is optional; the default generator remains offline and deterministic.

## Five-minute demo

1. Paste a complaint containing an email address.
2. Show the privacy-safe text and prediction probabilities.
3. Point out the urgent escalation decision.
4. Filter the dashboard to one product.
5. Ask the copilot about the leading complaint theme.
6. Open the evidence table and verify its citations.

## Questions

**Why not use only an LLM?** A specialised classifier is faster, cheaper, testable and stable for fixed labels. Generation is used after retrieval for explanation, not as the only analytical layer.

**Is this real RAG?** Yes: the question is vectorised, relevant feedback is retrieved, and answer generation is constrained to that evidence. The optional local model improves wording without changing the evidence layer.

**How would you productionise it?** Replace CSV ingestion with a warehouse pipeline, add multilingual embeddings, a vector database, role-based access, feedback-to-label review and monitoring by product/language.

**Main limitation?** The bundled data are fictional and template-assisted. Real performance requires representative labelled feedback and fairness checks across languages and channels.
