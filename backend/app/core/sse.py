"""SSE(Server-Sent Events) 프레임 포맷 헬퍼. 원래 app/services/chat.py에만 있던 private
함수였으나, app/services/wedding.py(2026-08-28, 온보딩 heartbeat 스트리밍)가 동일한 포맷을
필요로 하게 되면서 여기로 뽑아 공유한다."""

from pydantic import BaseModel


def sse_event(event: str, data: BaseModel) -> str:
    """SSE 한 줄을 만든다 — 브라우저가 이 정해진 포맷(event: 이름\\ndata: JSON\\n\\n)을 그대로
    실시간 이벤트로 받아준다."""
    return f"event: {event}\ndata: {data.model_dump_json()}\n\n"


def sse_comment(text: str) -> str:
    """`:`로 시작하는 줄은 SSE 스펙상 주석이라 이벤트가 아니다 — event:/data: 줄이 없어 기존
    프론트 SSE 파서가 그냥 무시하므로 프론트 변경 없이도 쓸 수 있다. 목적은 바이트를 흘려보내는
    것 자체 — 오래 걸리는 단발 호출 대기 중 nginx의 proxy-read-timeout이 "이 구간엔 아무
    응답도 없다"고 판단하지 않게 한다(app/rag/graph.py::_await_with_heartbeat와 동일 목적)."""
    return f": {text}\n\n"
