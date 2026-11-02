from __future__ import annotations
import hashlib
import io
import re
from pathlib import Path
from pypdf import PdfReader
from sqlalchemy import select
from sqlalchemy.orm import Session
from ..models import Chunk, Document
from .embeddings import ensure_embeddings
from .pgvector_store import sync_chunk_vectors
from .storage import get_storage

ALLOWED_EXTENSIONS = {".txt", ".md", ".pdf"}


def _company_from_name(name: str) -> str:
    stem = Path(name).stem.replace("_q4", "").replace("_", " ")
    return " ".join(x.capitalize() for x in stem.split())[:120] or "Unknown"


def _split_words(text: str, target_words: int = 150, overlap_words: int = 30) -> list[str]:
    words = text.split()
    if not words:
        return []
    chunks = []
    start = 0
    while start < len(words):
        end = min(start + target_words, len(words))
        chunk = " ".join(words[start:end]).strip()
        if len(chunk) >= 25:
            chunks.append(chunk)
        if end >= len(words):
            break
        start = max(end - overlap_words, start + 1)
    return chunks


def extract_chunks(filename: str, raw: bytes) -> list[dict]:
    suffix = Path(filename).suffix.lower()
    if suffix not in ALLOWED_EXTENSIONS:
        raise ValueError("Only TXT, MD and PDF files are supported")
    out: list[dict] = []
    if suffix == ".pdf":
        reader = PdfReader(io.BytesIO(raw))
        for page_no, page in enumerate(reader.pages, 1):
            text = (page.extract_text() or "").strip()
            for chunk in _split_words(text):
                out.append({"page_number": page_no, "line_start": None, "line_end": None, "text": chunk})
    else:
        text = raw.decode("utf-8", errors="replace")
        lines = text.splitlines()
        buffer: list[str] = []
        start_line = 1
        for line_no, line in enumerate(lines, 1):
            clean = re.sub(r"\s+", " ", line).strip()
            if clean:
                if not buffer:
                    start_line = line_no
                buffer.append(clean)
            if buffer and (sum(len(x.split()) for x in buffer) >= 130 or not clean):
                joined = " ".join(buffer)
                if len(joined) >= 25:
                    out.append({"page_number": None, "line_start": start_line, "line_end": line_no, "text": joined})
                buffer = []
        if buffer:
            joined = " ".join(buffer)
            if len(joined) >= 25:
                out.append({"page_number": None, "line_start": start_line, "line_end": len(lines), "text": joined})
    if not out:
        raise ValueError("No readable text could be extracted from the document")
    return out


def ingest_document(
    db: Session,
    filename: str,
    raw: bytes,
    uploaded_by: int | None,
    company: str | None = None,
    document_type: str = "research_brief",
    workspace_id: int | None = None,
    source_url: str | None = None,
    source_date: str | None = None,
) -> Document:
    digest = hashlib.sha256(raw).hexdigest()
    existing = db.scalar(select(Document).where(Document.content_hash == digest))
    if existing:
        return existing
    chunks = extract_chunks(filename, raw)
    storage_uri = None
    try:
        storage_uri = get_storage().save(filename, raw, digest)
    except Exception:
        # Ingestion should still work if optional object storage is unavailable.
        storage_uri = None
    doc = Document(
        filename=Path(filename).name[:255],
        company=(company or _company_from_name(filename)).strip()[:120],
        document_type=document_type[:80],
        content_hash=digest,
        storage_uri=storage_uri,
        uploaded_by=uploaded_by,
        workspace_id=workspace_id,
        source_url=source_url,
        source_date=source_date,
    )
    db.add(doc)
    db.flush()
    created_chunks = []
    for i, item in enumerate(chunks):
        chunk = Chunk(document_id=doc.id, chunk_index=i, **item)
        db.add(chunk)
        created_chunks.append(chunk)
    db.commit()
    for chunk in created_chunks:
        db.refresh(chunk)
    ensure_embeddings(db, created_chunks)
    sync_chunk_vectors(db, created_chunks)
    db.refresh(doc)
    return doc


def seed_documents(db: Session, data_dir: Path) -> None:
    for path in sorted(data_dir.glob("*.txt")):
        ingest_document(db, path.name, path.read_bytes(), uploaded_by=None)
