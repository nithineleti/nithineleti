from app.engine import retrieve, analyze_bug

def test_retrieval_finds_pricing():
    files = retrieve("100 percent discount coupon invalid")
    assert any(x["file"] == "pricing.py" for x in files)

def test_agent_validates_patch():
    r = analyze_bug("A 100% discount should be accepted")
    assert r["tests_before"]["passed"] is False
    assert r["tests_after"]["passed"] is True
    assert "> 100" in r["diff"]
