"""app/services/chat.py의 순수 로직(_sse) — 05_RAG_design.md §7이 못박은 SSE 와이어 포맷을
가드한다. DB/RAG 없이 도는 것만."""

from app.schemas.chat import TokenEventData
from app.services.chat import _sse


class TestSse:
    def test_formats_event_and_json_data_with_trailing_blank_line(self):
        line = _sse("token", TokenEventData(delta="안녕"))

        assert line == 'event: token\ndata: {"delta":"안녕"}\n\n'
