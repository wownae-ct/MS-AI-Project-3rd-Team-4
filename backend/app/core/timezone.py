"""서비스 표준 타임존 — 이 앱의 사용자는 전원 한국 시간대(KST, UTC+9)다.

트러블슈팅 STEP 9(2026-08-26): "오늘"을 `datetime.now(UTC).date()`로 계산하면 KST
00:00~08:59 사이에는 실제로는 어제인 UTC 날짜를 "오늘"로 잘못 취급한다 — 기한 지남(overdue)
판정, D-day 계산, 타임라인 완료(DONE) 판정, 예식일 근사(approximate_wedding_date) 등
"오늘이 며칠인지"에 의존하는 모든 곳에서 같은 버그가 반복됐다(원래는 `routers/wedding/
timeline.py::is_overdue` 하나만 지적됐지만, 점검 결과 동일 패턴이 5개 파일에 더 있었다).

타임스탬프(예: `user_edited_at`, `created_at`)는 이 대상이 아니다 — DB에 저장되는 시각은
UTC로 두는 게 표준 관행이고, 여기서 바꾸는 건 "날짜만" 필요한 사용자 대면 비교뿐이다.

red-bug.md #14 — `to_kst_date()`는 "지금"이 아니라 과거의 특정 tz-aware 시각(예:
`wedding.created_at`)을 KST 달력 날짜로 볼 때 쓴다. `wedding.py`가 온보딩 준비기간 스케일
재계산의 `onboarding_date` 대리값으로 `wedding.created_at.date()`(UTC 날짜)를 그대로 쓰던
좁은 latent 버그(생성 시각이 UTC 15:00~23:59, 즉 KST 00:00~08:59에 걸릴 때만 하루 어긋남)의
수정에 쓰인다."""

from datetime import date, datetime
from zoneinfo import ZoneInfo

KST = ZoneInfo("Asia/Seoul")


def to_kst_date(moment: datetime) -> date:
    return moment.astimezone(KST).date()


def today_kst() -> date:
    return to_kst_date(datetime.now(KST))
