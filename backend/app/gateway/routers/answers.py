"""답변 제출 및 코칭 피드백. 브리프코치_API_명세서.md §B-1-3 참고.
feedback/stream은 SSE(단방향) — 이벤트 타입: metrics, coach_token, guardrail_result, done."""

from fastapi import APIRouter, HTTPException

router = APIRouter(tags=["answers"])


@router.post("/sessions/{session_id}/answers")
async def submit_answer(session_id: str):
    raise HTTPException(status_code=501, detail="not implemented yet")


@router.get("/answers/{answer_id}/feedback/stream")
async def stream_answer_feedback(answer_id: str):
    raise HTTPException(status_code=501, detail="not implemented yet")


@router.get("/answers/{answer_id}")
async def get_answer(answer_id: str):
    raise HTTPException(status_code=501, detail="not implemented yet")
