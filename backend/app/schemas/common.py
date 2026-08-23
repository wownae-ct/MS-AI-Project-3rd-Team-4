"""여러 도메인 스키마가 공유하는 Literal 타입. 04_DB_spec.md의 CHECK 제약과 1:1로 맞춘다 —
enum 값이 두 곳에서 따로 정의되면 한쪽만 고치고 잊어버리는 드리프트가 생기기 쉽다."""

from typing import Literal

# v4.0(2026-08-24): 7개 -> 9개(HOMENEW/ETC 신설, 00_BASELINE.md §1). DB에서도 categories
# 테이블이 이 값을 그대로 담은 category_code ENUM 타입으로 바뀌었다(app/models/wedding.py의
# CategoryCodeEnum과 값 목록이 반드시 일치해야 함 — 두 곳에 따로 정의된 게 이 docstring이
# 경고하는 바로 그 드리프트 위험이지만, ENUM은 SQL 타입 선언이라 Python Literal을 직접
# 참조할 수 없어 불가피하게 값을 중복 기재한다).
CategoryCode = Literal[
    "MEETING", "VENUE", "SDM", "GIFT", "HOMEWARE", "INVITATION", "HONEYMOON", "HOMENEW", "ETC"
]
BenchmarkCategoryCode = Literal["VENUE", "SDM"]  # price_benchmarks/vendor_case_examples는 이 둘만
# price_benchmarks.region_code는 DB에 CHECK 제약이 없다(값 목록이 데이터 갱신마다 바뀔 수 있어
# 스키마 변경 없이 확장 가능하게 일부러 안 걸어둠) — 그래도 ETL 스크립트와 조회 서비스가 같은
# 값을 쓰도록 앱 레벨 단일 소스로 여기 정의한다. 14개는 참가격 원본(data/raw/참가격데이터)의
# 지역별 결혼식장/결혼준비대행 시트가 다루는 세분 지역, 3개(NATIONWIDE/METRO/NON_METRO)는 같은
# 시트에 이미 포함된 전국/수도권/비수도권 집계 행 — 특정 지역에 데이터가 없을 때 폴백용으로 쓴다.
RegionCode = Literal[
    "SEOUL_GANGNAM",
    "SEOUL_OTHER",
    "BUSAN",
    "INCHEON",
    "DAEGU",
    "DAEJEON",
    "GWANGJU",
    "ULSAN",
    "GYEONGGI",
    "CHUNGCHEONG",
    "JEOLLA",
    "GYEONGSANG",
    "GANGWON",
    "JEJU",
    "NATIONWIDE",
    "METRO",
    "NON_METRO",
]
CategoryTier = Literal["FOCUS", "MOCKUP"]
SourceTier = Literal["OFFICIAL", "NEWS", "INDUSTRY", "CONSENSUS"]
ItemType = Literal["CONTRACT_TERM", "EXTRA_COST", "PREP"]
Origin = Literal["LLM", "USER"]  # checklist_items/timeline_items 공통 — "LLM"은 실시간 LLM 호출
# 결과뿐 아니라 결정론적 폴백(타임라인 55항목 카탈로그 등)을 포함해 "사용자가 직접 추가하지
# 않은 모든 시스템 생성 콘텐츠"를 넓게 가리킨다(13_personalization_router_agent_design.md §2).
# HOMEWARE(혼수)는 다른 8개 카테고리와 다른 4단계 상태값을 쓴다(04_DB_schema.sql CHECK) — 어떤
# 값이 유효한지는 category_code에 달려 있으므로, 이 Literal은 둘의 합집합이고 실제 유효성
# 검사는 app/services/checklist.py의 category별 허용 집합으로 한다(API 레이어에서 먼저 걸러
# 명확한 422를 주기 위해서 — 03_API_spec.md #13).
GeneralChecklistStatus = Literal["TODO", "DOING", "SKIP", "DONE"]
HomewareChecklistStatus = Literal["LISTED", "COMPARING", "ORDERED", "DELIVERED"]
ChecklistStatus = GeneralChecklistStatus | HomewareChecklistStatus
PaymentType = Literal["DEPOSIT", "INTERIM", "BALANCE", "ETC"]
PaymentStatus = Literal["PLANNED", "PAID", "CANCELED"]
MilestoneStatus = Literal["TODO", "DONE"]
CaseType = Literal["GOOD", "BAD"]
Verdict = Literal["SUPPORTED", "WEAK", "GENERAL"]
ChatRole = Literal["user", "assistant"]
