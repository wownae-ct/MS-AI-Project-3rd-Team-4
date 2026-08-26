"""app/services/payment.py의 순수 로직(compute_d_day) + app/schemas/payment.py의
PaymentUpdate 검증기 — DB 없이 도는 것만(app/schemas/wedding.py의 WeddingCreate 검증기
테스트와 동일 컨벤션, test_wedding_service.py 참고)."""

from datetime import date

import pytest
from pydantic import ValidationError

from app.schemas.payment import PaymentUpdate
from app.services.payment import compute_d_day


class TestComputeDDay:
    def test_future_due_date_is_positive(self):
        assert compute_d_day(date(2026, 9, 1), date(2026, 8, 24)) == 8

    def test_past_due_date_is_negative(self):
        assert compute_d_day(date(2026, 8, 16), date(2026, 8, 24)) == -8

    def test_due_date_today_is_zero(self):
        assert compute_d_day(date(2026, 8, 24), date(2026, 8, 24)) == 0


class TestPaymentUpdateValidation:
    """STEP 6 — status="PLANNED"인데 paid_date가 채워지는 모순 상태를 요청 단계에서 막는다."""

    def test_planned_status_with_paid_date_is_rejected(self):
        with pytest.raises(ValidationError, match="PLANNED"):
            PaymentUpdate(status="PLANNED", paid_date=date(2026, 8, 25))

    def test_paid_status_with_paid_date_passes(self):
        PaymentUpdate(status="PAID", paid_date=date(2026, 8, 25))  # 예외 없이 통과해야 함

    def test_canceled_status_with_paid_date_passes(self):
        # 환불 — 결제는 있었지만 이후 취소/환불된 경우. paid_date는 과거 기록으로 남아 있어도
        # 모순이 아니다(PLANNED만 금지 대상).
        PaymentUpdate(status="CANCELED", paid_date=date(2026, 8, 25))  # 예외 없이 통과해야 함

    def test_paid_date_alone_without_status_passes(self):
        # status를 아예 안 보낸 경우 — update_payment 서비스가 PAID로 자동 유도한다(여기선
        # 검증기 통과 여부만 확인).
        PaymentUpdate(paid_date=date(2026, 8, 25))  # 예외 없이 통과해야 함
