"""비동기 세션 리포트 조회. 브리프코치_API_명세서.md §B-1-4 참고."""

from fastapi import APIRouter, HTTPException, Query

router = APIRouter(prefix="/users/{user_id}/reports", tags=["reports"])


@router.get("/latest")
async def get_latest_report(user_id: str):
    raise HTTPException(status_code=501, detail="not implemented yet")


@router.get("")
async def list_reports(
    user_id: str,
    from_date: str | None = Query(default=None, alias="from"),
    to_date: str | None = Query(default=None, alias="to"),
):
    raise HTTPException(status_code=501, detail="not implemented yet")
