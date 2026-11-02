from __future__ import annotations
import json
import re
import httpx
from ..config import get_settings

settings = get_settings()
CITATION_RE = re.compile(r"\[S(\d+)\]")


def _sentences(text: str) -> list[str]:
    return [x.strip() for x in re.split(r"(?<=[.!?])\s+", text) if len(x.strip()) > 20]


def build_provider_prompt(question: str, sources: list[dict]) -> str:
    context = "\n\n".join(
        f"[S{i}] company={s['company']} document={s['document']}\n{s['text']}"
        for i, s in enumerate(sources, 1)
    )
    return (
        "You are FinSight, a financial research assistant. Use ONLY the evidence below. "
        "Every material factual claim must end with one or more citations like [S1]. "
        "If the evidence is insufficient, explicitly say that. Do not invent numbers, dates, "
        "companies, or investment recommendations. Return concise research prose.\n\n"
        f"QUESTION:\n{question}\n\nEVIDENCE:\n{context}"
    )


def validate_citations(answer: str, source_count: int) -> dict:
    found = [int(x) for x in CITATION_RE.findall(answer)]
    invalid = sorted(set(x for x in found if x < 1 or x > source_count))
    paragraphs = [p.strip() for p in answer.split("\n") if p.strip()]
    uncited = []
    for p in paragraphs:
        if len(re.findall(r"[A-Za-z]{3,}", p)) >= 5 and not CITATION_RE.search(p):
            uncited.append(p[:120])
    return {
        "valid": bool(found) and not invalid and not uncited,
        "citations_found": sorted(set(found)),
        "invalid_citations": invalid,
        "uncited_passages": uncited[:5],
    }


class GroundedExtractiveGenerator:
    name = "extractive"

    def generate(self, question: str, sources: list[dict]) -> dict:
        if not sources:
            return {
                "answer": "I could not find sufficiently relevant evidence in the indexed documents.",
                "citations": [],
                "grounded": True,
                "backend": self.name,
                "citation_validation": {"valid": True, "citations_found": [], "invalid_citations": [], "uncited_passages": []},
            }
        q_terms = set(re.findall(r"[a-zA-Z]{3,}", question.lower()))
        candidates = []
        for i, source in enumerate(sources, 1):
            for sentence in _sentences(source["text"]):
                terms = set(re.findall(r"[a-zA-Z]{3,}", sentence.lower()))
                overlap = len(q_terms & terms)
                candidates.append((overlap, source["score"], i, sentence))
        candidates.sort(key=lambda x: (x[0], x[1]), reverse=True)
        chosen = []
        seen = set()
        for _, _, source_idx, sentence in candidates:
            key = sentence.lower()
            if key in seen:
                continue
            seen.add(key)
            chosen.append(f"{sentence} [S{source_idx}]")
            if len(chosen) >= 4:
                break
        if not chosen:
            chosen = [f"{sources[0]['text']} [S1]"]
        answer = "\n".join(chosen)
        validation = validate_citations(answer, len(sources))
        return {
            "answer": answer,
            "citations": [f"S{i}" for i in validation["citations_found"]],
            "grounded": validation["valid"],
            "backend": self.name,
            "citation_validation": validation,
        }


class OllamaGroundedGenerator:
    name = "ollama"

    def generate(self, question: str, sources: list[dict]) -> dict:
        prompt = build_provider_prompt(question, sources)
        url = settings.llm_base_url.rstrip("/") + "/api/generate"
        with httpx.Client(timeout=settings.llm_timeout_seconds) as client:
            resp = client.post(url, json={"model": settings.llm_model, "prompt": prompt, "stream": False})
            resp.raise_for_status()
            answer = resp.json().get("response", "").strip()
        validation = validate_citations(answer, len(sources))
        if not validation["valid"]:
            safe = GroundedExtractiveGenerator().generate(question, sources)
            safe["backend"] = "extractive_fallback_after_ollama_validation"
            return safe
        return {
            "answer": answer,
            "citations": [f"S{i}" for i in validation["citations_found"]],
            "grounded": True,
            "backend": self.name,
            "citation_validation": validation,
        }


class ChatCompletionsGroundedGenerator:
    """Generic chat-completions compatible provider; no vendor SDK required."""

    name = "chat_completions"

    def generate(self, question: str, sources: list[dict]) -> dict:
        prompt = build_provider_prompt(question, sources)
        url = settings.llm_base_url.rstrip("/") + "/v1/chat/completions"
        headers = {"Content-Type": "application/json"}
        if settings.llm_api_key:
            headers["Authorization"] = "Bearer " + settings.llm_api_key
        payload = {"model": settings.llm_model, "messages": [{"role": "user", "content": prompt}], "temperature": 0.1}
        with httpx.Client(timeout=settings.llm_timeout_seconds) as client:
            resp = client.post(url, headers=headers, json=payload)
            resp.raise_for_status()
            answer = resp.json()["choices"][0]["message"]["content"].strip()
        validation = validate_citations(answer, len(sources))
        if not validation["valid"]:
            safe = GroundedExtractiveGenerator().generate(question, sources)
            safe["backend"] = "extractive_fallback_after_llm_validation"
            return safe
        return {
            "answer": answer,
            "citations": [f"S{i}" for i in validation["citations_found"]],
            "grounded": True,
            "backend": self.name,
            "citation_validation": validation,
        }


class GeneratorService:
    def generate(self, question: str, sources: list[dict]) -> dict:
        try:
            if settings.generator_backend == "ollama":
                return OllamaGroundedGenerator().generate(question, sources)
            if settings.generator_backend == "chat_completions":
                return ChatCompletionsGroundedGenerator().generate(question, sources)
        except Exception as exc:
            fallback = GroundedExtractiveGenerator().generate(question, sources)
            fallback["backend"] = f"extractive_fallback:{type(exc).__name__}"
            return fallback
        return GroundedExtractiveGenerator().generate(question, sources)

    def status(self) -> dict:
        return {
            "requested_backend": settings.generator_backend,
            "model": settings.llm_model if settings.generator_backend != "extractive" else None,
            "citation_guard": True,
            "fallback": "extractive",
        }


generator = GeneratorService()
