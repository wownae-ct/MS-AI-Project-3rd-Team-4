"""여러 도메인 스키마가 공유하는 Literal 타입. 04_DB_spec.md의 CHECK 제약과 1:1로 맞춘다 —
enum 값이 두 곳에서 따로 정의되면 한쪽만 고치고 잊어버리는 드리프트가 생기기 쉽다."""

from typing import Literal

CategoryCode = Literal["MEETING", "VENUE", "SDM", "GIFT", "HOMEWARE", "INVITATION", "HONEYMOON"]
BenchmarkCategoryCode = Literal["VENUE", "SDM"]  # price_benchmarks/vendor_case_examples는 이 둘만
CategoryTier = Literal["FOCUS", "MOCKUP"]
SourceTier = Literal["OFFICIAL", "NEWS", "INDUSTRY", "CONSENSUS"]
ItemType = Literal["CONTRACT_TERM", "EXTRA_COST", "PREP"]
ChecklistStatus = Literal["TODO", "DOING", "DONE", "SKIP"]
PaymentType = Literal["DEPOSIT", "INTERIM", "BALANCE", "ETC"]
PaymentStatus = Literal["PLANNED", "PAID", "CANCELED"]
MilestoneStatus = Literal["TODO", "DONE"]
CaseType = Literal["GOOD", "BAD"]
Verdict = Literal["SUPPORTED", "WEAK", "GENERAL"]
ChatRole = Literal["user", "assistant"]
