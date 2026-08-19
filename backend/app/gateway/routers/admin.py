"""런타임 설정 조회/변경 + 평가(eval) 실행 이력. 운영/디버깅용, 인증 필요(TODO)."""

from fastapi import APIRouter, HTTPException

router = APIRouter(tags=["admin"])


@router.get("/admin/config")
async def get_config():
    raise HTTPException(status_code=501, detail="not implemented yet")


@router.patch("/admin/config")
async def update_config():
    raise HTTPException(status_code=501, detail="not implemented yet")


@router.get("/eval/runs")
async def list_eval_runs():
    raise HTTPException(status_code=501, detail="not implemented yet")
