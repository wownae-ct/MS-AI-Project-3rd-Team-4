"""SSE 이벤트 페이로드 중 도메인 무관 공통 타입. app/schemas/chat.py::ErrorEventData가
원래 정의였으나, app/services/wedding.py(2026-08-28, 온보딩 heartbeat 스트리밍)도 동일한
에러 이벤트 모양(code+message)이 필요해지면서 여기로 뽑아 공유한다."""

from pydantic import BaseModel


class SseErrorEventData(BaseModel):
    """스트림 중간에 실패하면 HTTP 상태코드를 더 이상 바꿀 수 없어(이미 200 스트림 시작) 이
    이벤트로 대신 알린다(03_API_spec.md #29 "에러 시" / 05_RAG_design.md §10과 동일 원칙)."""

    code: str
    message: str
