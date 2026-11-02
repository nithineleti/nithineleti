from __future__ import annotations
import re
from html.parser import HTMLParser
import httpx
from ..config import get_settings

settings = get_settings()


class TextExtractor(HTMLParser):
    def __init__(self):
        super().__init__()
        self.parts = []
        self.skip = 0

    def handle_starttag(self, tag, attrs):
        if tag in {"script", "style"}:
            self.skip += 1
        if tag in {"p", "div", "br", "tr", "li", "h1", "h2", "h3"}:
            self.parts.append("\n")

    def handle_endtag(self, tag):
        if tag in {"script", "style"} and self.skip:
            self.skip -= 1
        if tag in {"p", "div", "tr", "li"}:
            self.parts.append("\n")

    def handle_data(self, data):
        if not self.skip:
            self.parts.append(data)

    def text(self) -> str:
        raw = "".join(self.parts)
        raw = re.sub(r"[ \t]+", " ", raw)
        raw = re.sub(r"\n{3,}", "\n\n", raw)
        return raw.strip()


def fetch_latest_filing(ticker: str, form_type: str = "10-K") -> dict:
    headers = {"User-Agent": settings.sec_user_agent, "Accept-Encoding": "gzip, deflate"}
    timeout = httpx.Timeout(30.0)
    with httpx.Client(headers=headers, timeout=timeout, follow_redirects=True) as client:
        tickers = client.get("https://www.sec.gov/files/company_tickers.json")
        tickers.raise_for_status()
        table = tickers.json()
        match = next((x for x in table.values() if x.get("ticker", "").upper() == ticker.upper()), None)
        if not match:
            raise ValueError(f"Ticker {ticker.upper()} not found in SEC company list")
        cik = int(match["cik_str"])
        submissions = client.get(f"https://data.sec.gov/submissions/CIK{cik:010d}.json")
        submissions.raise_for_status()
        data = submissions.json()
        recent = data["filings"]["recent"]
        idx = next((i for i, form in enumerate(recent["form"]) if form == form_type), None)
        if idx is None:
            raise ValueError(f"No recent {form_type} filing found for {ticker.upper()}")
        accession = recent["accessionNumber"][idx]
        primary = recent["primaryDocument"][idx]
        filing_date = recent["filingDate"][idx]
        acc_clean = accession.replace("-", "")
        url = f"https://www.sec.gov/Archives/edgar/data/{cik}/{acc_clean}/{primary}"
        filing = client.get(url)
        filing.raise_for_status()
        parser = TextExtractor()
        parser.feed(filing.text)
        text = parser.text()
        if len(text) < 500:
            raise ValueError("SEC filing text extraction produced too little readable content")
        return {
            "company": match.get("title", ticker.upper()),
            "ticker": ticker.upper(),
            "cik": cik,
            "form_type": form_type,
            "filing_date": filing_date,
            "accession": accession,
            "source_url": url,
            "filename": f"{ticker.upper()}_{form_type}_{filing_date}.txt",
            "text": text,
        }
