from __future__ import annotations

import re


EMAIL = re.compile(r"\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b")
PHONE = re.compile(r"(?<!\d)(?:\+?91[-\s]?)?[6-9]\d{9}(?!\d)")
ORDER = re.compile(r"\b(?:order|booking)[-\s:#]*[A-Z0-9]{6,14}\b", re.IGNORECASE)


def redact_pii(text: str) -> tuple[str, list[str]]:
    clean = text or ""
    found: list[str] = []
    if EMAIL.search(clean):
        found.append("email")
        clean = EMAIL.sub("[EMAIL_REDACTED]", clean)
    if PHONE.search(clean):
        found.append("phone")
        clean = PHONE.sub("[PHONE_REDACTED]", clean)
    if ORDER.search(clean):
        found.append("order_id")
        clean = ORDER.sub("[ORDER_ID_REDACTED]", clean)
    return clean, found
