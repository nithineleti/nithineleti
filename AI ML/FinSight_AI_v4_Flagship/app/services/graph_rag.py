from __future__ import annotations
import json
import re
from pathlib import Path
import networkx as nx
from sqlalchemy import delete, or_, select
from sqlalchemy.orm import Session
from ..config import BASE_DIR
from ..models import Chunk, Document, KnowledgeEntity, KnowledgeRelation
from .guidance import GUIDANCE_TERMS
from .risks import RISK_TERMS

STOP = {"company","management","quarter","revenue","million","year","over","next","while","because","from","with","that","this","were","was","and","the","for","are","but","its","our","their"}
DRIVER_TERMS = ["growth","driver","led by","support","expand","increased","improved","automation","renewal","digital sales","capacity"]


def _profiles() -> list[dict]:
    return json.loads((BASE_DIR / "data" / "company_profiles.json").read_text())


def _canonical_company(raw: str, profiles: list[dict]) -> str:
    """Map document-derived labels such as 'Aster Systems Investor Day' back to a known company."""
    value = (raw or "").strip()
    low = value.lower()
    for profile in profiles:
        company = profile.get("company", "").strip()
        if company and (low == company.lower() or low.startswith(company.lower() + " ")):
            return company
    return value


def _get_or_create_entity(db: Session, name: str, entity_type: str, company: str | None = None, metadata: dict | None = None) -> KnowledgeEntity:
    name = name.strip()[:180]
    company_norm = company.strip()[:120] if company else None
    entity = db.scalar(select(KnowledgeEntity).where(
        KnowledgeEntity.name == name,
        KnowledgeEntity.entity_type == entity_type,
        KnowledgeEntity.company == company_norm,
    ))
    if entity:
        return entity
    entity = KnowledgeEntity(name=name, entity_type=entity_type, company=company_norm, metadata_json=json.dumps(metadata or {}))
    db.add(entity); db.flush()
    return entity


def _rel(db: Session, src: KnowledgeEntity, dst: KnowledgeEntity, relation: str, doc_id: int | None = None, evidence: str | None = None, weight: float = 1.0) -> None:
    existing = db.scalar(select(KnowledgeRelation).where(
        KnowledgeRelation.source_entity_id == src.id,
        KnowledgeRelation.target_entity_id == dst.id,
        KnowledgeRelation.relation_type == relation,
        KnowledgeRelation.evidence_document_id == doc_id,
    ))
    if existing:
        if weight > existing.weight:
            existing.weight = weight
        return
    db.add(KnowledgeRelation(source_entity_id=src.id, target_entity_id=dst.id, relation_type=relation, evidence_document_id=doc_id, evidence_text=(evidence or "")[:700] or None, weight=weight))
    db.flush()


def _sentences(text: str) -> list[str]:
    return [x.strip() for x in re.split(r"(?<=[.!?])\s+|\n+", text) if len(x.strip()) >= 28]


def _extract_metric_names(sentence: str) -> list[str]:
    terms = {
        "Revenue": ["revenue", "sales"], "Gross Margin": ["gross margin"], "Operating Margin": ["operating margin"],
        "Free Cash Flow": ["free cash flow"], "Operating Cash Flow": ["operating cash flow"],
        "Capacity": ["capacity"], "Inventory": ["inventory"], "Financing Cost": ["financing cost", "interest expense"],
    }
    low = sentence.lower()
    return [name for name, needles in terms.items() if any(n in low for n in needles)]


def _top_keywords(text: str, n: int = 6) -> list[str]:
    words = re.findall(r"[A-Za-z][A-Za-z-]{3,}", text.lower())
    counts = {}
    for w in words:
        if w in STOP:
            continue
        counts[w] = counts.get(w, 0) + 1
    return [w for w, _ in sorted(counts.items(), key=lambda x: (-x[1], x[0]))[:n]]


def rebuild_graph(db: Session, user_id: int | None = None) -> dict:
    # Graph is a derived index. Rebuilding avoids stale edges after document changes.
    db.execute(delete(KnowledgeRelation))
    db.execute(delete(KnowledgeEntity))
    db.commit()

    profiles = _profiles()
    profile_map = {p["company"].lower(): p for p in profiles}
    stmt = select(Document)
    if user_id is not None:
        stmt = stmt.where(or_(Document.uploaded_by.is_(None), Document.uploaded_by == user_id))
    docs = db.scalars(stmt.order_by(Document.id)).all()
    relation_count = 0

    for doc in docs:
        company_name = _canonical_company(doc.company, profiles)
        profile = profile_map.get(company_name.lower(), {})
        company_node = _get_or_create_entity(db, company_name, "company", company_name, {"ticker": profile.get("ticker"), "sector": profile.get("sector"), "industry": profile.get("industry")})
        if profile.get("sector"):
            sector = _get_or_create_entity(db, profile["sector"], "sector", None)
            _rel(db, company_node, sector, "OPERATES_IN", doc.id, f"{company_name} operates in {profile['sector']}", 0.9); relation_count += 1
        if profile.get("industry"):
            industry = _get_or_create_entity(db, profile["industry"], "industry", None)
            _rel(db, company_node, industry, "INDUSTRY", doc.id, f"{company_name} industry is {profile['industry']}", 0.9); relation_count += 1
        for product in profile.get("products", []):
            pnode = _get_or_create_entity(db, product, "product", company_name)
            _rel(db, company_node, pnode, "OFFERS", doc.id, f"{company_name} product/service: {product}", 0.8); relation_count += 1
        for competitor in profile.get("competitors", []):
            cnode = _get_or_create_entity(db, competitor, "competitor", None)
            _rel(db, company_node, cnode, "COMPETES_WITH", doc.id, f"Profiled competitor: {competitor}", 0.65); relation_count += 1

        chunks = db.scalars(select(Chunk).where(Chunk.document_id == doc.id).order_by(Chunk.chunk_index)).all()
        text = " ".join(c.text for c in chunks)
        for sentence in _sentences(text):
            low = sentence.lower()
            for metric in _extract_metric_names(sentence):
                mnode = _get_or_create_entity(db, metric, "metric", company_name)
                _rel(db, company_node, mnode, "REPORTS_METRIC", doc.id, sentence, 0.8); relation_count += 1
            cats = [cat for cat, terms in RISK_TERMS.items() if any(term in low for term in terms)]
            if cats and any(x in low for x in ["risk", "delay", "volatility", "weaker", "pressure", "uncertainty", "markdown"]):
                for cat in cats:
                    rnode = _get_or_create_entity(db, cat.title() + " Risk", "risk", company_name)
                    _rel(db, company_node, rnode, "HAS_RISK", doc.id, sentence, 1.0); relation_count += 1
            if any(term in low for term in GUIDANCE_TERMS):
                label = sentence[:95] + ("…" if len(sentence) > 95 else "")
                gnode = _get_or_create_entity(db, label, "guidance", company_name)
                _rel(db, company_node, gnode, "GUIDES_TO", doc.id, sentence, 0.9); relation_count += 1
            if any(term in low for term in DRIVER_TERMS):
                for keyword in _top_keywords(sentence, 3):
                    if keyword not in {"risk", "risks"}:
                        dnode = _get_or_create_entity(db, keyword.replace("-", " ").title(), "driver", company_name)
                        _rel(db, company_node, dnode, "GROWTH_DRIVER", doc.id, sentence, 0.55); relation_count += 1
    db.commit()
    return {
        "entities": db.scalar(select(KnowledgeEntity.id).order_by(KnowledgeEntity.id.desc()).limit(1)) or 0,
        "entity_count": len(db.scalars(select(KnowledgeEntity)).all()),
        "relation_count": len(db.scalars(select(KnowledgeRelation)).all()),
        "documents": len(docs),
    }


def graph_status(db: Session) -> dict:
    entity_count = len(db.scalars(select(KnowledgeEntity.id)).all())
    relation_count = len(db.scalars(select(KnowledgeRelation.id)).all())
    return {"active": entity_count > 0, "entities": entity_count, "relations": relation_count, "engine": "networkx + persisted SQL graph index"}


def _graph(db: Session) -> tuple[nx.Graph, dict[int, KnowledgeEntity], list[KnowledgeRelation]]:
    entities = db.scalars(select(KnowledgeEntity)).all()
    rels = db.scalars(select(KnowledgeRelation)).all()
    by_id = {e.id: e for e in entities}
    g = nx.Graph()
    for e in entities:
        g.add_node(e.id, name=e.name, type=e.entity_type, company=e.company)
    for r in rels:
        if r.source_entity_id in by_id and r.target_entity_id in by_id:
            g.add_edge(r.source_entity_id, r.target_entity_id, relation=r.relation_type, weight=r.weight, evidence=r.evidence_text)
    return g, by_id, rels


def query_graph(db: Session, question: str, company: str | None = None, max_nodes: int = 18) -> dict:
    if not graph_status(db)["active"]:
        rebuild_graph(db)
    g, by_id, _ = _graph(db)
    q_terms = set(re.findall(r"[a-zA-Z]{3,}", question.lower()))
    candidates = []
    for entity in by_id.values():
        if company and entity.company and company.lower() != entity.company.lower():
            continue
        name_terms = set(re.findall(r"[a-zA-Z]{3,}", entity.name.lower()))
        overlap = len(q_terms & name_terms)
        company_bonus = 3 if company and entity.name.lower() == company.lower() else (1 if company and entity.company and company.lower() in entity.company.lower() else 0)
        type_bonus = 1 if entity.entity_type in {"risk", "guidance", "metric"} and any(x in question.lower() for x in [entity.entity_type, "performance", "outlook"]) else 0
        score = overlap + company_bonus + type_bonus
        if score:
            candidates.append((score, entity.id))
    if not candidates and company:
        candidates = [(3, e.id) for e in by_id.values() if e.name.lower() == company.lower()]
    seeds = [eid for _, eid in sorted(candidates, reverse=True)[:4]]
    if not seeds:
        seeds = list(by_id)[:2]
    selected = set(seeds)
    for seed in seeds:
        if seed not in g:
            continue
        neighbors = sorted(g.neighbors(seed), key=lambda n: g[seed][n].get("weight", 0), reverse=True)
        selected.update(neighbors[: max(2, max_nodes // max(1, len(seeds)))])
    selected = set(list(selected)[:max_nodes])
    edges = []
    evidence = []
    for a, b, attrs in g.edges(data=True):
        if a in selected and b in selected:
            edges.append({"source": a, "target": b, "relation": attrs.get("relation"), "weight": attrs.get("weight", 1.0)})
            if attrs.get("evidence") and attrs["evidence"] not in evidence:
                evidence.append(attrs["evidence"])
    nodes = [{"id": e.id, "name": e.name, "type": e.entity_type, "company": e.company} for e in by_id.values() if e.id in selected]
    return {
        "question": question,
        "company": company,
        "nodes": nodes,
        "edges": edges,
        "evidence": evidence[:10],
        "context": "\n".join(f"- {x}" for x in evidence[:8]),
        "seed_nodes": seeds,
    }


def shortest_relationship(db: Session, source_name: str, target_name: str) -> dict:
    g, by_id, _ = _graph(db)
    src = next((e.id for e in by_id.values() if source_name.lower() in e.name.lower()), None)
    dst = next((e.id for e in by_id.values() if target_name.lower() in e.name.lower()), None)
    if src is None or dst is None:
        return {"found": False, "path": []}
    try:
        path = nx.shortest_path(g, src, dst)
    except nx.NetworkXNoPath:
        return {"found": False, "path": []}
    return {"found": True, "path": [{"id": i, "name": by_id[i].name, "type": by_id[i].entity_type} for i in path]}
