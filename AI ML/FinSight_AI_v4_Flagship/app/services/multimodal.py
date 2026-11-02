from __future__ import annotations
import io
import re
from pathlib import Path
from typing import Any
from pypdf import PdfReader
from ..config import get_settings

settings = get_settings()


def _parse_markdown_tables(text: str) -> list[dict]:
    lines = text.splitlines()
    tables: list[dict] = []
    i = 0
    while i < len(lines) - 1:
        if "|" in lines[i] and re.search(r"\|?\s*:?-{2,}:?\s*\|", lines[i + 1]):
            block = [lines[i], lines[i + 1]]
            j = i + 2
            while j < len(lines) and "|" in lines[j] and lines[j].strip():
                block.append(lines[j]); j += 1
            headers = [x.strip() for x in block[0].strip().strip("|").split("|")]
            rows = [[x.strip() for x in row.strip().strip("|").split("|")] for row in block[2:]]
            tables.append({"page": None, "headers": headers, "rows": rows[:40], "source": "markdown"})
            i = j; continue
        i += 1
    return tables


def _financial_table_score(headers: list[str], rows: list[list[str]]) -> float:
    text = " ".join(headers + [x for row in rows[:5] for x in row]).lower()
    terms = ["revenue", "income", "cash", "margin", "assets", "liabilities", "eps", "quarter", "year", "operating", "inventory"]
    hits = sum(1 for t in terms if t in text)
    numeric = len(re.findall(r"\$?\(?\d[\d,]*(?:\.\d+)?%?\)?", text))
    return round(min(1.0, 0.08 * hits + 0.02 * numeric), 3)


def inspect_document_bytes(filename: str, raw: bytes) -> dict[str, Any]:
    suffix = Path(filename).suffix.lower()
    result: dict[str, Any] = {
        "filename": Path(filename).name,
        "pages": 0,
        "text_chars": 0,
        "tables": [],
        "financial_tables": [],
        "chart_mentions": [],
        "ocr": {"enabled": settings.ocr_enabled, "attempted": False, "pages": 0, "note": "OCR is optional and only attempted when enabled and supported."},
        "capabilities": ["layout-aware PDF text", "table extraction", "financial table scoring", "chart-reference detection", "optional OCR adapter"],
    }
    if suffix in {".txt", ".md"}:
        text = raw.decode("utf-8", errors="replace")
        result["text_chars"] = len(text)
        tables = _parse_markdown_tables(text)
        for table in tables:
            table["financial_score"] = _financial_table_score(table["headers"], table["rows"])
        result["tables"] = tables
        result["financial_tables"] = [t for t in tables if t["financial_score"] >= 0.18]
        result["chart_mentions"] = [line.strip()[:220] for line in text.splitlines() if re.search(r"\b(chart|figure|graph|trend)\b", line, re.I)][:20]
        return result
    if suffix != ".pdf":
        raise ValueError("Multimodal inspection currently supports PDF, TXT and MD")

    reader = PdfReader(io.BytesIO(raw))
    result["pages"] = len(reader.pages)
    full_text = []
    for page in reader.pages:
        text = page.extract_text() or ""
        full_text.append(text)
    joined = "\n".join(full_text)
    result["text_chars"] = len(joined)
    result["chart_mentions"] = [x.strip()[:240] for x in joined.splitlines() if re.search(r"\b(chart|figure|graph|trend)\b", x, re.I)][:20]

    try:
        import pdfplumber
        with pdfplumber.open(io.BytesIO(raw)) as pdf:
            for page_no, page in enumerate(pdf.pages, 1):
                for table in page.extract_tables() or []:
                    if not table or len(table) < 2:
                        continue
                    headers = [str(x or "").strip() for x in table[0]]
                    rows = [[str(x or "").strip() for x in row] for row in table[1:41]]
                    item = {"page": page_no, "headers": headers, "rows": rows, "source": "pdfplumber"}
                    item["financial_score"] = _financial_table_score(headers, rows)
                    result["tables"].append(item)
    except Exception as exc:
        result["table_extraction_warning"] = type(exc).__name__
    result["financial_tables"] = [t for t in result["tables"] if t.get("financial_score", 0) >= 0.18]

    if settings.ocr_enabled and result["text_chars"] < max(100, result["pages"] * 80):
        result["ocr"]["attempted"] = True
        try:
            import pytesseract
            from PIL import Image
            # pypdf does not render pages itself. We expose the adapter status here;
            # deployments can install pdf2image/poppler for page rasterization.
            _ = (pytesseract, Image)
            result["ocr"]["note"] = "OCR libraries detected; install Poppler/pdf2image to rasterize scanned PDF pages in production."
        except Exception as exc:
            result["ocr"]["note"] = f"OCR adapter unavailable: {type(exc).__name__}"
    return result
