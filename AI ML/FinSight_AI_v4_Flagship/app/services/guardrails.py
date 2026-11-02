from __future__ import annotations
import re

INJECTION_PATTERNS = [
    r"ignore\s+(all|any|the)?\s*(previous|prior|system)\s*(instructions|prompt)",
    r"reveal\s+(the\s+)?(system|developer)\s+prompt",
    r"print\s+(your\s+)?(hidden|system)\s+instructions",
    r"bypass\s+(safety|guardrails|policy)",
    r"do\s+not\s+cite\s+(sources|evidence)",
]
ADVICE_PATTERNS = [
    r"should\s+i\s+(buy|sell|short|invest)",
    r"tell\s+me\s+what\s+stock\s+to\s+buy",
    r"guaranteed\s+(return|profit)",
]


def inspect_question(question: str) -> dict:
    text = question.strip()
    injection_hits = [p for p in INJECTION_PATTERNS if re.search(p, text, flags=re.I)]
    advice_hits = [p for p in ADVICE_PATTERNS if re.search(p, text, flags=re.I)]
    return {
        "safe": not injection_hits,
        "prompt_injection_detected": bool(injection_hits),
        "investment_advice_intent": bool(advice_hits),
        "injection_matches": len(injection_hits),
        "advice_matches": len(advice_hits),
        "notice": "FinSight provides evidence-grounded research assistance, not personalized investment advice.",
    }


def sanitize_external_text(text: str, max_chars: int = 120_000) -> str:
    text = text.replace("\x00", " ")
    # Remove common instruction-like blocks that can be embedded in external documents.
    text = re.sub(r"(?is)<script.*?>.*?</script>", " ", text)
    text = re.sub(r"(?is)BEGIN\s+SYSTEM\s+PROMPT.*?END\s+SYSTEM\s+PROMPT", " ", text)
    text = re.sub(r"\s+", " ", text).strip()
    return text[:max_chars]


def research_disclaimer() -> str:
    return "Research assistance only. Outputs may be incomplete and are not investment, legal, tax, or accounting advice."
