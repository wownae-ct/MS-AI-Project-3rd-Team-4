"""#1 GET /health — 03_API_spec.md §3. 인증 없음, 항상 열려 있다."""

from fastapi import APIRouter

router = APIRouter(tags=["health"])


@router.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}
