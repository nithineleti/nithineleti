from pathlib import Path
import tempfile, shutil, subprocess, sys, difflib
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity

BASE = Path(__file__).resolve().parents[1]
SAMPLE_REPO = BASE / "sample_repo"

def _files(repo=SAMPLE_REPO):
    return sorted([x for x in repo.rglob("*.py") if ".venv" not in x.parts])

def retrieve(bug_report: str, top_k: int = 3):
    files = _files()
    docs = [f.read_text(encoding="utf-8") for f in files]
    vec = TfidfVectorizer(token_pattern=r"(?u)\b[\w_]+\b", ngram_range=(1,2))
    matrix = vec.fit_transform(docs + [bug_report])
    sims = cosine_similarity(matrix[-1], matrix[:-1]).ravel()
    ranked = sorted(zip(files, sims), key=lambda x: x[1], reverse=True)[:top_k]
    return [{"file": str(f.relative_to(SAMPLE_REPO)), "score": round(float(s), 3), "preview": f.read_text()[:550]} for f,s in ranked]

def _run_tests(repo: Path):
    cp = subprocess.run([sys.executable, "-m", "pytest", "-q"], cwd=repo, capture_output=True, text=True, timeout=25)
    out = (cp.stdout + "\n" + cp.stderr).strip()
    return {"passed": cp.returncode == 0, "returncode": cp.returncode, "output": out[-2500:]}

def propose_patch(bug_report: str, source: str):
    lowered = bug_report.lower()
    old = "if percent < 0 or percent >= 100:"
    new = "if percent < 0 or percent > 100:"
    if ("100" in lowered or "full discount" in lowered or "percent" in lowered) and old in source:
        return source.replace(old, new), "Allow 100% as a valid boundary while still rejecting values above 100%."
    return source, "No safe deterministic patch rule matched this report."

def analyze_bug(bug_report: str):
    retrieved = retrieve(bug_report)
    target = SAMPLE_REPO / retrieved[0]["file"]
    if target.name != "pricing.py":
        target = SAMPLE_REPO / "pricing.py"
    original = target.read_text(encoding="utf-8")
    patched, rationale = propose_patch(bug_report, original)
    before = _run_tests(SAMPLE_REPO)
    diff = "".join(difflib.unified_diff(original.splitlines(True), patched.splitlines(True), fromfile="a/pricing.py", tofile="b/pricing.py"))
    with tempfile.TemporaryDirectory(prefix="codepilot_") as td:
        work = Path(td)/"repo"
        shutil.copytree(SAMPLE_REPO, work)
        (work/"pricing.py").write_text(patched, encoding="utf-8")
        after = _run_tests(work)
    return {
        "bug_report": bug_report,
        "retrieved": retrieved,
        "plan": ["Index repository files", "Retrieve likely files", "Generate a minimal patch", "Run tests before and after", "Return diff for human review"],
        "target_file": "pricing.py",
        "rationale": rationale,
        "diff": diff or "No patch generated.",
        "tests_before": before,
        "tests_after": after,
        "status": "validated" if after["passed"] and not before["passed"] else "review_required"
    }
