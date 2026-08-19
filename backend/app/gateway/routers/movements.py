"""운동 동작 카탈로그 + 룰엔진 부트스트랩(T1이 초기 로드) + 큐 매니페스트."""

from fastapi import APIRouter, HTTPException

router = APIRouter(tags=["movements"])


@router.get("/movements")
async def list_movements():
    raise HTTPException(status_code=501, detail="not implemented yet")


@router.get("/movements/{code}/rules")
async def get_movement_rules(code: str):
    # T1 클라이언트 룰엔진이 부팅 시 로드하는 핵심 엔드포인트
    raise HTTPException(status_code=501, detail="not implemented yet")


@router.get("/cues/manifest")
async def get_cues_manifest():
    raise HTTPException(status_code=501, detail="not implemented yet")
