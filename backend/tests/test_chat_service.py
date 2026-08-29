"""app/services/chat.py의 순수 로직(_sse, _RATING_SCORE_VALUES, _derive_session_title,
_touch_session_activity) — DB/RAG 없이 도는 것만. _sse는 05_RAG_design.md §7이 못박은 SSE
와이어 포맷을 가드한다. _derive_session_title/_touch_session_activity는 GET /chat/sessions(목록)
전용으로 새로 추가된 title/last_message_at 기록 로직 — stream_chat_response 전체(실LLM 호출)는
비용/지연 때문에 자동 스모크 대상이 아니라(test_smoke.py TestChatSessionsSmoke docstring), 이
로직만 떼어내 순수 함수로 단위 검증한다."""

from typing import get_args

from app.models import ChatSession
from app.schemas.chat import TokenEventData
from app.schemas.common import ChatRating
from app.services.chat import (
    _RATING_SCORE_VALUES,
    _SESSION_TITLE_MAX_LENGTH,
    _derive_session_title,
    _sse,
    _touch_session_activity,
)


class TestSse:
    def test_formats_event_and_json_data_with_trailing_blank_line(self):
        line = _sse("token", TokenEventData(delta="안녕"))

        assert line == 'event: token\ndata: {"delta":"안녕"}\n\n'


class TestRatingScoreValues:
    """작업 3 — GOOD/BAD → Langfuse BOOLEAN 스코어(0.0/1.0) 매핑."""

    def test_maps_good_to_one_and_bad_to_zero(self):
        assert _RATING_SCORE_VALUES == {"GOOD": 1.0, "BAD": 0.0}

    def test_covers_every_chat_rating_literal_value(self):
        # ChatRating에 값이 추가되고 매핑을 빼먹는 드리프트 방지.
        assert set(_RATING_SCORE_VALUES) == set(get_args(ChatRating))


class TestDeriveSessionTitle:
    def test_returns_content_as_is_when_within_limit(self):
        assert _derive_session_title("위약금 조건") == "위약금 조건"

    def test_truncates_and_appends_ellipsis_when_over_limit(self):
        long_content = "가" * (_SESSION_TITLE_MAX_LENGTH + 10)

        result = _derive_session_title(long_content)

        assert result == "가" * _SESSION_TITLE_MAX_LENGTH + "…"

    def test_strips_surrounding_whitespace_before_measuring_length(self):
        assert _derive_session_title("  안녕하세요  ") == "안녕하세요"


class TestTouchSessionActivity:
    """GET /chat/sessions(목록)의 title/last_message_at을 채우는 부작용 함수 — 실제 DB 세션 없이
    ChatSession 객체의 속성만 확인한다(add/commit 없음)."""

    def test_sets_title_from_first_message_when_title_is_none(self):
        chat_session = ChatSession()

        _touch_session_activity(chat_session, first_message_content="첫 질문입니다")

        assert chat_session.title == "첫 질문입니다"
        assert chat_session.last_message_at is not None

    def test_does_not_overwrite_existing_title_on_later_messages(self):
        chat_session = ChatSession(title="기존 제목")

        _touch_session_activity(chat_session, first_message_content="두 번째 메시지 내용")

        assert chat_session.title == "기존 제목"

    def test_updates_last_message_at_even_without_first_message_content(self):
        chat_session = ChatSession(title="기존 제목")

        _touch_session_activity(chat_session, first_message_content=None)

        assert chat_session.title == "기존 제목"
        assert chat_session.last_message_at is not None
