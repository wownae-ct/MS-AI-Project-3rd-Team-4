"""#17-19, #23 — 03_API_spec.md §3. 타임라인, 대시보드 요약, 마이 리포트."""

from fastapi import APIRouter, HTTPException

router = APIRouter(tags=["dashboard"])


@router.get("/timeline")
async def list_timeline():
    raise HTTPException(status_code=501, detail="not implemented yet")


@router.patch("/timeline/{milestone_id}")
async def update_milestone(milestone_id: str):
    raise HTTPException(status_code=501, detail="not implemented yet")


@router.get("/dashboard/summary")
async def dashboard_summary():
    raise HTTPException(status_code=501, detail="not implemented yet")


@router.get("/reports/me")
async def get_my_report():
    raise HTTPException(status_code=501, detail="not implemented yet")
