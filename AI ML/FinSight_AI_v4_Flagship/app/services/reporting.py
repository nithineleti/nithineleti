from __future__ import annotations
import json
import re
from pathlib import Path
from xml.sax.saxutils import escape
from reportlab.lib import colors
from reportlab.lib.enums import TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import PageBreak, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle
from sqlalchemy.orm import Session
from ..config import get_settings
from ..models import ResearchReport

settings = get_settings()


def _safe_name(text: str) -> str:
    return re.sub(r"[^A-Za-z0-9._-]+", "_", text).strip("_")[:80] or "report"


def _as_text(value) -> str:
    if value is None:
        return "n/a"
    if isinstance(value, (dict, list)):
        return json.dumps(value, ensure_ascii=True, default=str)
    return str(value)


def _label(text: str) -> str:
    return str(text).replace("_", " ").strip().title()


def _pretty(value, depth: int = 0) -> str:
    """Render nested research output as readable ReportLab paragraph markup."""
    if value is None:
        return "n/a"
    if isinstance(value, bool):
        return "Yes" if value else "No"
    if isinstance(value, (int, float)):
        if isinstance(value, float):
            return f"{value:.4g}"
        return str(value)
    if isinstance(value, str):
        return escape(value)
    if isinstance(value, list):
        if not value:
            return "No material findings in the current evidence set."
        rows = []
        for item in value[:8]:
            rows.append(f"- {_pretty(item, depth + 1)}")
        if len(value) > 8:
            rows.append(f"- ... {len(value) - 8} additional items")
        return "<br/>".join(rows)
    if isinstance(value, dict):
        # Common financial evidence objects get a concise sentence-like treatment.
        if "value" in value and ("evidence" in value or "metric" in value):
            head = escape(str(value.get("metric") or value.get("value") or "Finding"))
            val = escape(str(value.get("value", "")))
            evidence = escape(str(value.get("evidence", "")))
            doc = escape(str(value.get("document", "")))
            parts = [f"<b>{head}</b>"]
            if val and val != head:
                parts.append(val)
            if evidence:
                parts.append(evidence)
            if doc:
                parts.append(f"Source: {doc}")
            return " - ".join(parts)
        if "headline" in value and "event_type" in value:
            impact = value.get("impact_score")
            impact_text = f" | impact {impact:.2f}" if isinstance(impact, (int, float)) else ""
            return (
                f"<b>{escape(str(value.get('event_type', 'event')).title())}</b>{impact_text} - "
                f"{escape(str(value.get('headline', '')))}"
            )
        if "topic" in value and "mentions" in value:
            return f"<b>{escape(str(value.get('topic')).title())}</b> - {value.get('mentions')} mentions"
        parts = []
        for key, item in list(value.items())[:8]:
            parts.append(f"<b>{escape(_label(key))}:</b> {_pretty(item, depth + 1)}")
        if len(value) > 8:
            parts.append(f"... {len(value) - 8} additional fields")
        return "<br/>".join(parts)
    return escape(str(value))


def build_markdown(payload: dict) -> str:
    company = payload.get("company") or "Company"
    lines = [
        f"# FinSight AI Research Report - {company}",
        "",
        "> Research assistance only. This report is not investment, legal, tax, or accounting advice.",
        "",
        "## Executive Summary",
        payload.get("executive_summary", "No summary available."),
        "",
    ]
    for section_name, content in payload.get("sections", {}).items():
        lines.append(f"## {section_name.replace('_',' ').title()}")
        if isinstance(content, str):
            lines.append(content)
        elif isinstance(content, list):
            for item in content[:20]:
                lines.append(f"- {_as_text(item)}")
        elif isinstance(content, dict):
            for key, value in content.items():
                lines.append(f"- **{key.replace('_',' ').title()}:** {_as_text(value)}")
        lines.append("")
    if payload.get("sources"):
        lines.append("## Evidence Sources")
        for i, src in enumerate(payload["sources"], 1):
            lines.append(f"- [S{i}] {src.get('company')} - {src.get('document')}: {src.get('text','')[:260]}")
        lines.append("")
    lines.append("## Verification")
    for key, value in payload.get("verification", {}).items():
        lines.append(f"- **{key.replace('_',' ').title()}:** {_as_text(value)}")
    return "\n".join(lines)


def build_pdf(payload: dict, path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    doc = SimpleDocTemplate(str(path), pagesize=A4, rightMargin=18*mm, leftMargin=18*mm, topMargin=18*mm, bottomMargin=18*mm, title=f"FinSight AI Research Report - {payload.get('company','Company')}")
    styles = getSampleStyleSheet()
    title = ParagraphStyle("FinTitle", parent=styles["Title"], fontName="Helvetica-Bold", fontSize=22, leading=26, textColor=colors.HexColor("#102A43"), spaceAfter=8)
    subtitle = ParagraphStyle("FinSub", parent=styles["Normal"], fontSize=9.5, leading=14, textColor=colors.HexColor("#52606D"), spaceAfter=12)
    h2 = ParagraphStyle("FinH2", parent=styles["Heading2"], fontName="Helvetica-Bold", fontSize=13, leading=16, textColor=colors.HexColor("#0B7285"), spaceBefore=12, spaceAfter=6)
    body = ParagraphStyle("FinBody", parent=styles["BodyText"], fontSize=9.5, leading=14, textColor=colors.HexColor("#243B53"), alignment=TA_LEFT, spaceAfter=6)
    small = ParagraphStyle("FinSmall", parent=body, fontSize=8.3, leading=11, textColor=colors.HexColor("#52606D"))
    story = [
        Paragraph("FinSight AI", title),
        Paragraph(f"Evidence-grounded research report - {payload.get('company','Company')}", subtitle),
    ]
    summary_data = [
        ["Confidence", str(payload.get("confidence", "n/a")), "Sources", str(len(payload.get("sources", [])))],
        ["Workflow", str(payload.get("workflow_version", "v4")), "Research mode", str(payload.get("retrieval_mode", "graph_hybrid"))],
    ]
    table = Table(summary_data, colWidths=[30*mm, 45*mm, 30*mm, 55*mm])
    table.setStyle(TableStyle([
        ("BACKGROUND", (0,0), (-1,-1), colors.HexColor("#F0F7F9")),
        ("TEXTCOLOR", (0,0), (-1,-1), colors.HexColor("#243B53")),
        ("FONTNAME", (0,0), (-1,-1), "Helvetica"),
        ("FONTNAME", (0,0), (0,-1), "Helvetica-Bold"),
        ("FONTNAME", (2,0), (2,-1), "Helvetica-Bold"),
        ("FONTSIZE", (0,0), (-1,-1), 8.5),
        ("VALIGN", (0,0), (-1,-1), "MIDDLE"),
        ("BOX", (0,0), (-1,-1), 0.35, colors.HexColor("#BCCCDC")),
        ("INNERGRID", (0,0), (-1,-1), 0.25, colors.HexColor("#D9E2EC")),
        ("LEFTPADDING", (0,0), (-1,-1), 7), ("RIGHTPADDING", (0,0), (-1,-1), 7),
        ("TOPPADDING", (0,0), (-1,-1), 7), ("BOTTOMPADDING", (0,0), (-1,-1), 7),
    ]))
    story += [table, Spacer(1, 8), Paragraph("Research assistance only. This report is not investment, legal, tax, or accounting advice.", small), Paragraph("Executive Summary", h2), Paragraph(payload.get("executive_summary", "No summary available."), body)]

    for section_name, content in payload.get("sections", {}).items():
        story.append(Paragraph(section_name.replace("_", " ").title(), h2))
        if isinstance(content, str):
            story.append(Paragraph(content, body))
        elif isinstance(content, list):
            if not content:
                story.append(Paragraph("No material findings in the current evidence set.", small))
            for item in content[:20]:
                story.append(Paragraph("- " + _pretty(item), body))
        elif isinstance(content, dict):
            rows = []
            for key, value in list(content.items())[:20]:
                rows.append([Paragraph(_label(key), small), Paragraph(_pretty(value), small)])
            if rows:
                t = Table(rows, colWidths=[45*mm, 110*mm])
                t.setStyle(TableStyle([
                    ("VALIGN", (0,0), (-1,-1), "TOP"),
                    ("GRID", (0,0), (-1,-1), 0.25, colors.HexColor("#D9E2EC")),
                    ("BACKGROUND", (0,0), (0,-1), colors.HexColor("#F7FAFC")),
                    ("LEFTPADDING", (0,0), (-1,-1), 6), ("RIGHTPADDING", (0,0), (-1,-1), 6),
                    ("TOPPADDING", (0,0), (-1,-1), 5), ("BOTTOMPADDING", (0,0), (-1,-1), 5),
                ]))
                story.append(t)
    story.append(PageBreak())
    story.append(Paragraph("Evidence Sources", h2))
    for i, src in enumerate(payload.get("sources", [])[:20], 1):
        label = f"[S{i}] {src.get('company','')} - {src.get('document','')}"
        story.append(Paragraph(label, ParagraphStyle("SrcHead", parent=small, fontName="Helvetica-Bold", textColor=colors.HexColor("#0B7285"))))
        story.append(Paragraph(escape(src.get("text", "")[:700]), small))
    story.append(Paragraph("Verification", h2))
    for key, value in payload.get("verification", {}).items():
        story.append(Paragraph(f"<b>{escape(_label(key))}:</b> {_pretty(value)}", small))
    doc.build(story)


def persist_report(db: Session, user_id: int, payload: dict, export_pdf: bool = True) -> ResearchReport:
    root = Path(settings.report_output_dir)
    root.mkdir(parents=True, exist_ok=True)
    company = payload.get("company") or "Company"
    stem = _safe_name(company + "_FinSight_Research")
    markdown_path = root / f"{stem}.md"
    markdown_path.write_text(build_markdown(payload), encoding="utf-8")
    pdf_path = root / f"{stem}.pdf"
    if export_pdf:
        build_pdf(payload, pdf_path)
    row = ResearchReport(
        user_id=user_id,
        company=company,
        title=f"FinSight AI Research Report - {company}",
        report_json=json.dumps(payload, default=str),
        markdown_path=str(markdown_path),
        pdf_path=str(pdf_path) if export_pdf else None,
    )
    db.add(row); db.commit(); db.refresh(row)
    return row
