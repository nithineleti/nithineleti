from app.engine import engine
def test_recommendations_exclude_seen():
    r=engine.recommend("u1",5); seen={x["name"] for x in r["history"]}
    assert len(r["recommendations"])==5
    assert not any(x["name"] in seen for x in r["recommendations"])
def test_metrics():
    assert engine.metrics()["catalog_coverage_at_5"]>0
