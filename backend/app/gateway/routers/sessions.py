"""세션 생명주기: 시작/조회/종료/플랜/트레이스/통증리포트. wave0_contract.html 참고."""

from fastapi import APIRouter, HTTPException

router = APIRouter(prefix="/sessions", tags=["sessions"])


@router.post("")
async def create_session():
    raise HTTPException(status_code=501, detail="not implemented yet")


@router.get("/{session_id}")
async def get_session(session_id: str):
    raise HTTPException(status_code=501, detail="not implemented yet")


@router.post("/{session_id}/end")
async def end_session(session_id: str):
    # T4 planner 워커에 비동기 작업 enqueue (202 Accepted 예정)
    raise HTTPException(status_code=501, detail="not implemented yet")


@router.get("/{session_id}/plan")
async def get_session_plan(session_id: str):
    raise HTTPException(status_code=501, detail="not implemented yet")


@router.get("/{session_id}/traces")
async def get_session_traces(session_id: str):
    raise HTTPException(status_code=501, detail="not implemented yet")


@router.post("/{session_id}/pain-report")
async def report_pain(session_id: str):
    # WS 연결이 끊겼을 때의 REST 폴백
    raise HTTPException(status_code=501, detail="not implemented yet")
