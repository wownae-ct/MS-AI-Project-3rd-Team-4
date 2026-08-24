"""app/services/chat.py의 순수 로직(_sse, _RATING_SCORE_VALUES) — DB/RAG 없이 도는 것만.
_sse는 05_RAG_design.md §7이 못박은 SSE 와이어 포맷을 가드한다."""

from typing import get_args

from app.schemas.chat import TokenEventData
from app.schemas.common import ChatRating
from app.services.chat import _RATING_SCORE_VALUES, _sse


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
