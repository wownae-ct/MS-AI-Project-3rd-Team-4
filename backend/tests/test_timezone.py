"""app/core/timezone.py — 트러블슈팅 STEP 9 회귀 테스트. KST 새벽 0~9시 사이에는
datetime.now(UTC).date()가 실제로는 어제인 UTC 날짜를 "오늘"로 잘못 계산했다."""

from datetime import UTC, date, datetime
from unittest.mock import patch

from app.core.timezone import KST, to_kst_date, today_kst


class TestTodayKst:
    def test_delegates_to_datetime_now_with_kst_zone_not_utc(self):
        with patch("app.core.timezone.datetime") as mock_dt:
            mock_dt.now.return_value = datetime(2026, 8, 26, 1, 30, tzinfo=KST)
            result = today_kst()

        mock_dt.now.assert_called_once_with(KST)
        assert result == date(2026, 8, 26)

    def test_kst_and_utc_disagree_near_midnight_kst(self):
        # 이 인스턴트는 UTC로는 2026-08-25이지만 KST(UTC+9)로는 이미 2026-08-26이다 —
        # datetime.now(UTC).date() 버그였다면 "오늘"을 8/25로 잘못 계산했을 시각대.
        instant = datetime(2026, 8, 25, 16, 30, tzinfo=UTC)
        assert instant.date() == date(2026, 8, 25)
        assert instant.astimezone(KST).date() == date(2026, 8, 26)


class TestToKstDate:
    """red-bug.md #14 — wedding.created_at처럼 "지금"이 아닌 과거의 tz-aware 시각을 KST
    날짜로 볼 때 쓰는 to_kst_date()의 회귀 테스트. .date()를 그대로 쓰면 KST 00:00~08:59
    사이 생성된 웨딩이 하루 이른 날짜로 취급되던 버그가 이 함수의 존재 이유다."""

    def test_utc_and_kst_disagree_near_midnight_kst(self):
        # wedding.created_at이 이 시각(UTC 16:30 = KST 다음날 01:30)일 때, .date()를 그대로
        # 쓰면 8/25(하루 이른 UTC 날짜)로 잘못 계산됐을 것.
        moment = datetime(2026, 8, 25, 16, 30, tzinfo=UTC)
        assert to_kst_date(moment) == date(2026, 8, 26)

    def test_agrees_with_naive_utc_date_outside_midnight_window(self):
        # KST 새벽 0~9시 창 밖에서는 UTC 날짜와 KST 날짜가 일치 — 기존 흐름과 회귀 없음.
        moment = datetime(2026, 8, 25, 3, 0, tzinfo=UTC)  # KST 12:00
        assert to_kst_date(moment) == moment.date() == date(2026, 8, 25)

    def test_today_kst_delegates_to_to_kst_date(self):
        with patch("app.core.timezone.datetime") as mock_dt:
            mock_dt.now.return_value = datetime(2026, 8, 26, 1, 30, tzinfo=KST)
            assert today_kst() == to_kst_date(mock_dt.now.return_value)
