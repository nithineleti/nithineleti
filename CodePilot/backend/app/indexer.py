from __future__ import annotations

import ast
import hashlib
import math
import re
from dataclasses import asdict, dataclass
from pathlib import Path

TEXT_EXTENSIONS = {".py", ".js", ".jsx", ".ts", ".tsx", ".java", ".go", ".rs", ".rb", ".php", ".cs", ".cpp", ".c", ".h", ".json", ".yaml", ".yml", ".md"}
IGNORE_PARTS = {".git", "node_modules", ".venv", "venv", "dist", "build", "__pycache__", ".pytest_cache", "coverage"}
TOKEN_RE = re.compile(r"[A-Za-z_][A-Za-z0-9_]{1,}|\d+(?:\.\d+)?")


@dataclass
class CodeChunk:
    path: str
    symbol: str
    start_line: int
    end_line: int
    text: str
    vector: list[float]

    def public(self, score: float | None = None) -> dict:
        result = {"path": self.path, "symbol": self.symbol, "start_line": self.start_line, "end_line": self.end_line, "text": self.text}
        if score is not None:
            result["score"] = round(score, 4)
        return result


def embed(text: str, dims: int = 384) -> list[float]:
    vector = [0.0] * dims
    tokens = TOKEN_RE.findall(text.lower())
    if not tokens:
        return vector
    for token in tokens:
        digest = hashlib.blake2b(token.encode(), digest_size=8).digest()
        value = int.from_bytes(digest, "big")
        idx = value % dims
        sign = 1.0 if (value >> 8) & 1 else -1.0
        vector[idx] += sign * (1.0 + min(len(token), 20) / 20.0)
    norm = math.sqrt(sum(x * x for x in vector)) or 1.0
    return [x / norm for x in vector]


def _python_chunks(path: Path, root: Path, text: str) -> list[CodeChunk]:
    lines = text.splitlines()
    rel = path.relative_to(root).as_posix()
    chunks: list[CodeChunk] = []
    try:
        tree = ast.parse(text)
    except SyntaxError:
        return _window_chunks(path, root, text)
    for node in ast.walk(tree):
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef)) and hasattr(node, "end_lineno"):
            start = max(1, node.lineno)
            end = min(len(lines), node.end_lineno or node.lineno)
            snippet = "\n".join(lines[start - 1 : end])
            chunks.append(CodeChunk(rel, getattr(node, "name", "symbol"), start, end, snippet, embed(f"{rel} {getattr(node, 'name', '')} {snippet}")))
    if not chunks:
        return _window_chunks(path, root, text)
    return chunks


def _window_chunks(path: Path, root: Path, text: str, window: int = 50, overlap: int = 8) -> list[CodeChunk]:
    lines = text.splitlines()
    rel = path.relative_to(root).as_posix()
    result: list[CodeChunk] = []
    step = max(1, window - overlap)
    for start_idx in range(0, max(1, len(lines)), step):
        end_idx = min(len(lines), start_idx + window)
        snippet = "\n".join(lines[start_idx:end_idx])
        if snippet.strip():
            symbol = f"lines_{start_idx + 1}_{end_idx}"
            result.append(CodeChunk(rel, symbol, start_idx + 1, end_idx, snippet, embed(f"{rel} {snippet}")))
        if end_idx >= len(lines):
            break
    return result


def build_index(root: Path) -> list[CodeChunk]:
    chunks: list[CodeChunk] = []
    for path in sorted(root.rglob("*")):
        if not path.is_file() or path.suffix.lower() not in TEXT_EXTENSIONS:
            continue
        if any(part in IGNORE_PARTS for part in path.parts):
            continue
        if path.stat().st_size > 500_000:
            continue
        try:
            text = path.read_text(encoding="utf-8")
        except (UnicodeDecodeError, OSError):
            continue
        chunks.extend(_python_chunks(path, root, text) if path.suffix.lower() == ".py" else _window_chunks(path, root, text))
    return chunks
