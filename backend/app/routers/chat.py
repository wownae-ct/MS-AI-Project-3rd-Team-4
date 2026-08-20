"""#20-22 — 03_API_spec.md §3. 상담 세션 생성/이력 조회, SSE 스트리밍 답변(app.rag.graph 사용 예정)."""

from fastapi import APIRouter, HTTPException

router = APIRouter(tags=["chat"])


@router.post("/chat/sessions")
async def create_chat_session():
    raise HTTPException(status_code=501, detail="not implemented yet")


@router.get("/chat/sessions/{session_id}/messages")
async def list_chat_messages(session_id: str):
    raise HTTPException(status_code=501, detail="not implemented yet")


@router.post("/chat/sessions/{session_id}/messages")
async def send_chat_message(session_id: str):
    """SSE 스트리밍(text/event-stream) — Phase 3/4에서 app.rag.graph로 구현(05_RAG_design.md §5)."""
    raise HTTPException(status_code=501, detail="not implemented yet")
