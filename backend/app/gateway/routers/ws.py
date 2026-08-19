"""WebSocket /ws/v1/sessions/{id} — T0(pose.chunk)~T3(safety.alert) 실시간 메시지 채널.
메시지 카탈로그는 wave0_contract.html 참고 (session.hello, pose.chunk, rep.verdict, coach.delta 등)."""

from fastapi import APIRouter, WebSocket

router = APIRouter(prefix="/ws/v1", tags=["ws"])


@router.websocket("/sessions/{session_id}")
async def session_socket(websocket: WebSocket, session_id: str):
    await websocket.accept()
    # TODO: session.hello 핸드셰이크 + 메시지 라우팅(gateway 백프레셔 포함)
    await websocket.close(code=1011, reason="not implemented yet")
