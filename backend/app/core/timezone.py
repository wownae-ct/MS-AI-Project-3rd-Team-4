"""서비스 표준 타임존 — 이 앱의 사용자는 전원 한국 시간대(KST, UTC+9)다.

트러블슈팅 STEP 9(2026-08-26): "오늘"을 `datetime.now(UTC).date()`로 계산하면 KST
00:00~08:59 사이에는 실제로는 어제인 UTC 날짜를 "오늘"로 잘못 취급한다 — 기한 지남(overdue)
판정, D-day 계산, 타임라인 완료(DONE) 판정, 예식일 근사(approximate_wedding_date) 등
"오늘이 며칠인지"에 의존하는 모든 곳에서 같은 버그가 반복됐다(원래는 `routers/wedding/
timeline.py::is_overdue` 하나만 지적됐지만, 점검 결과 동일 패턴이 5개 파일에 더 있었다).

타임스탬프(예: `user_edited_at`, `created_at`)는 이 대상이 아니다 — DB에 저장되는 시각은
UTC로 두는 게 표준 관행이고, 여기서 바꾸는 건 "날짜만" 필요한 사용자 대면 비교뿐이다."""

from datetime import date, datetime
from zoneinfo import ZoneInfo

KST = ZoneInfo("Asia/Seoul")


def today_kst() -> date:
    return datetime.now(KST).date()
