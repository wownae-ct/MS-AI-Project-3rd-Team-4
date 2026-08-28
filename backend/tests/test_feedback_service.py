"""app/schemas/common.py의 피드백 관련 Literal이 실제 CHECK 제약과 드리프트 나지 않는지
— DB 없이 도는 것만."""

from app.schemas.common import FeedbackReasonCategory, FeedbackTargetType


class TestFeedbackTypes:
    def test_target_type_literal_has_exactly_three_values(self):
        assert set(FeedbackTargetType.__args__) == {
            "CHAT_MESSAGE",
            "CHECKLIST_ITEM",
            "TIMELINE_ITEM",
        }

    def test_reason_category_literal_matches_check_constraint_including_slash(self):
        # ef62d360e9fb 마이그레이션의 CHECK 제약과 1:1 — '편향/차별적' 슬래시 표기 그대로.
        assert set(FeedbackReasonCategory.__args__) == {
            "부정확함",
            "부적절함",
            "도움안됨",
            "편향/차별적",
            "기타",
        }
