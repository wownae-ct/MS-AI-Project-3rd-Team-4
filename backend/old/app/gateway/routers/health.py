"""헬스체크 — /healthz(생존), /readyz(트래픽 받을 준비), /metrics(관측용)."""

from fastapi import APIRouter

router = APIRouter(tags=["health"])


@router.get("/healthz")
async def healthz() -> dict[str, str]:
    return {"status": "ok"}


@router.get("/readyz")
async def readyz() -> dict[str, str]:
    # TODO: DB/외부 서비스 연결 확인 후 준비 상태 반환
    return {"status": "ok"}


@router.get("/metrics")
async def metrics() -> dict[str, str]:
    # TODO: Prometheus 등 관측 포맷으로 교체
    return {"status": "not implemented"}
