"""헬스체크 라우터 스모크 테스트 — CI가 실제로 뭔가를 검증하도록 하는 최소 테스트."""

from fastapi.testclient import TestClient

from app.gateway.main import app

client = TestClient(app)


def test_healthz():
    resp = client.get("/healthz")
    assert resp.status_code == 200
    assert resp.json() == {"status": "ok"}
