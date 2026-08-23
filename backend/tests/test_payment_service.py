"""app/services/payment.py의 순수 로직(compute_d_day) — DB 없이 도는 것만."""

from datetime import date

from app.services.payment import compute_d_day


class TestComputeDDay:
    def test_future_due_date_is_positive(self):
        assert compute_d_day(date(2026, 9, 1), date(2026, 8, 24)) == 8

    def test_past_due_date_is_negative(self):
        assert compute_d_day(date(2026, 8, 16), date(2026, 8, 24)) == -8

    def test_due_date_today_is_zero(self):
        assert compute_d_day(date(2026, 8, 24), date(2026, 8, 24)) == 0
