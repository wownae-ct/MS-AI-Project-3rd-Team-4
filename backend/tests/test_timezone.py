"""app/core/timezone.py — 트러블슈팅 STEP 9 회귀 테스트. KST 새벽 0~9시 사이에는
datetime.now(UTC).date()가 실제로는 어제인 UTC 날짜를 "오늘"로 잘못 계산했다."""

from datetime import UTC, date, datetime
from unittest.mock import patch

from app.core.timezone import KST, today_kst


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
