# Model Card

## Intended use

Portfolio demonstration of privacy-aware consumer-feedback classification, evidence retrieval and management summarisation.

## Data

2,400 fictional feedback records covering six products, five channels, four regions, three sentiment labels and six topics. Mixed-topic examples and simulated annotation ambiguity are included.

## Limitations

- Template-assisted fictional language is less varied than real feedback.
- English-only bundled model.
- Regex redaction is not a complete data-loss-prevention system.
- Retrieval relevance is lexical, not fully semantic.
- Generated answers require evidence and human review.

## Monitoring

Track macro-F1 by class/channel, confidence, urgent-case recall, PII-redaction misses, retrieval relevance, unsupported-answer rate and label drift.
