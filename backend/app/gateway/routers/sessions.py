"""연습 세션 생명주기: 시작 + 세션 내 답변 요약. 브리프코치_API_명세서.md §B-1-2 참고."""

from fastapi import APIRouter, HTTPException

router = APIRouter(prefix="/sessions", tags=["sessions"])


@router.post("")
async def create_session():
    raise HTTPException(status_code=501, detail="not implemented yet")


@router.get("/{session_id}/summary")
async def get_session_summary(session_id: str):
    raise HTTPException(status_code=501, detail="not implemented yet")
