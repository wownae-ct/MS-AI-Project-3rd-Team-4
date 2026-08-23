"""DS1_PRICE(참가격, data/raw/참가격데이터/*.xlsx) → price_benchmarks UPSERT.

RAG 코퍼스가 아니다(app/rag/indexing.py의 대상이 아님) — 06_RAG_implementation_and_copyright_review.md
가 "RAG 아님, price_benchmarks 테이블에 행 단위 UPSERT"로 명시한 대로 이 스크립트가 직접 xlsx를
파싱해 DB에 적재한다. 사람이 `uv run python scripts/seed_price_benchmarks.py`로 직접 실행한다
(RAG reindex처럼 자동 CronJob으로 안 돌린다 — 원본 데이터가 소비자원 월간 발행 주기라 매일 재실행할
이유가 없다).

원본 13개 파일 중 이번 스크립트가 다루는 건 5종(09_backend_implementation_plan.md Phase 4가
"VENUE/SDM 항목 우선"으로 좁힌 최소범위 + F7 예산 미정 슬라이더용 TOTAL + 15_post_v4_scope_
promotion.md §P4가 승격한 선택품목):
  - 지역별 결혼식장 가격정보 (4/6/8월).xlsx        → category_code='VENUE'
  - 지역별 결혼준비대행 서비스 가격정보 (4/6/8월).xlsx → category_code='SDM'
  - 지역별 결혼서비스 평균 계약금액 현황 (4/6/8월).xlsx → category_code='TOTAL'
  - 지역별 결혼서비스 선택품목 가격정보 (4/6/8월).xlsx → category_code='VENUE'/'SDM'(위와
    같은 카테고리, item_code만 옵션 항목별로 늘어남 — §P4 아래 상세)
나머지 1종("시기별 결혼서비스 가격정보")은 여전히 제외한다 — 지역 축이 아예 없는 데다(월별
집계만 존재) 시트 하나(결혼서비스별 계약시점)는 가격 데이터조차 아니어서 이 테이블 스키마
자체에 안 맞는다. price_benchmarks에 억지로 끼워 넣는 대신 `data/rag_corpus/DS1_PRICE/`에
RAG 사실(citation)로 큐레이션했다 — 이 파일이 다루는 대상이 아니다.

## "선택품목"(§P4, 2026-08-24 승격) 처리 방식

"선택품목" 시트는 위 4개 distribution 시트와 레이아웃이 정반대다(지역이 아니라 항목이 행,
지역은 4개 뭉뚱그린 버킷 컬럼) — `_build_option_rows()` 참고. 지역 축이 기존 17개 세분
코드(SEOUL_GANGNAM 등)와 근본적으로 다른 해상도(서울/경인/5대 광역시/이외 지역 4버킷뿐)라
두 가지 결정이 필요했고, 임의로 정하지 않고 사용자에게 확인했다:
1. 버킷 값을 세분 코드에 그대로 복제(예: "서울" 값을 SEOUL_GANGNAM/SEOUL_OTHER 둘 다에 넣기)
   하지 않는다 — 실제로 없는 구 단위 정밀도를 있는 것처럼 보이게 만들기 때문. 대신 `OPTION_`
   접두 코드(OPTION_SEOUL 등)로 별도 저장해 "이건 다른 해상도의 데이터"임을 코드 값 자체가
   드러내게 했다.
2. `app/services/benchmark.py`의 `resolve_region_fallback_chain`은 이 `OPTION_*` 코드를
   아직 모른다 — 지금 이 데이터를 실제로 쓰는 화면이 하나도 없어서(§P4 원 문서가 이미 확인한
   그대로) 컨슈머 없이 미리 배선하지 않기로 했다(YAGNI). 각 옵션 항목의 **NATIONWIDE 행**
   (전국 분포 컬럼으로 만든, min/max/sample_count까지 채워진 완전한 행)만 기존 폴백 체인으로
   조회되고, 4개 `OPTION_*` 버킷 행은 원본 정밀도를 보존한 상태로 저장만 해둔다 — 세분
   지역별로 실제 차등 표시가 필요해지면 그때 세분 region_code → 4버킷 매핑을 폴백 체인(또는
   별도 함수)에 추가하는 게 후속 작업이다.
3. **월을 가로질러 항목을 이어붙이지 않는다.** "선택품목" 항목 구성 자체가 4월과 6/8월 사이에
   실제로 개편됐다(예: 4월의 "스냅/영상"+"본식 스냅촬영"이 6/8월엔 "본식 촬영 비용" 하나로
   통합) — 표기 흔들림이 아니라 원본 조사표가 그 달에 실제로 측정한 항목 자체가 다르다는
   뜻이라, 하나의 identity로 이어붙이면 데이터를 왜곡하게 된다. `price_benchmarks`는 애초에
   (survey_month, region_code, category_code, item_code) UNIQUE라 "월을 가로질러 항목을
   잇는다"는 개념 자체가 스키마에 없다 — 각 월의 라벨을 그 달의 item_code로 독립 저장하면
   충분하고, `get_latest_benchmark()`가 이미 최신 survey_month를 우선하므로 최신 조사의
   항목 구성이 자연스럽게 조회된다. `item_code`에 CHECK 제약이 없는 순수 TEXT라 이 방식에
   스키마 변경도 필요 없다. 유일한 정규화는 원본 번호(①②...) 접두사 제거뿐 — 매달 순서
   자체가 바뀌는 것으로 확인된 순수 UI 아티팩트라 식별자에 남길 의미가 없다.
4. **min/max 분위는 25%/75%가 아니라 기존 distribution 시트와 동일한 10%/90%를 쓴다.**
   "선택품목"만 25%/75%(극단치 영향이 적은 "전형적 범위")로 바꾸는 안도 검토했지만, 그러면
   같은 `min_price`/`max_price` 컬럼이 item_code에 따라 통계적으로 다른 의미(근사 극값 vs
   전형적 범위)를 갖게 되는 게 분위 선택 자체보다 더 큰 정합성 문제라고 판단해 기각했다 —
   아래 문단의 기존 규칙을 "선택품목"에도 그대로 적용한다.

시트 레이아웃은 4개 파일·월 전부 동일한 템플릿을 쓴다(1행 제목, 2행 단위, 3-4행 헤더, 5행부터
데이터): 지역명(A열, '전국'/'서울(강남)' 등) 또는 하위지역명(B열, '수도권'/'비수도권'만) → 하위10%/
하위25%/중간가격/상위25%/상위10%/평균/건수/비율(C~J열). 데이터는 지역 목록이 끝나는 순간(각주나
빈 행) 멈춘다 — 스드메 시트는 "이번 조사에서 제주도는 계약 건이 없었음" 각주와 함께 제주도 행 자체가
없고, 표본이 부족한 셀은 숫자 대신 '-' 문자열이 들어있다(예: 스튜디오 대전 상위10%) — 둘 다 결측으로
처리한다.

단위는 시트마다 다르다(2행 텍스트로 판별) — 대부분 "만 원"이라 ×10000 하지만 "1인당 식대" 시트만
"원" 단위라 그대로 쓴다. price_benchmarks.min_price/max_price는 진짜 최저/최고가 아니라 하위10%/
상위10% 분위를 근사치로 쓴다(원본에 극값 자체가 없음) — F8_RANGE가 요구하는 "최저~최고 범위 표시"의
근사이지 정확한 극값이 아니라는 점에 유의.

"결혼서비스 평균 계약금액" 시트(TOTAL)의 "총 계약금액"은 중간값(median)이 아니라 평균(mean)이다 —
스키마 컬럼명은 median_price지만 원본에 중간값 분포 자체가 없어 이 시트에선 평균을 대신 담는다.
source_note에 그 사실을 명시해 혼동을 막는다.

멱등성: (survey_month, region_code, category_code, item_code) UNIQUE 기준 ON CONFLICT UPDATE —
재실행해도 안전하다."""

import asyncio
import re
from dataclasses import asdict, dataclass
from datetime import date
from pathlib import Path

from openpyxl import load_workbook
from openpyxl.worksheet.worksheet import Worksheet
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_session_factory
from app.models import PriceBenchmark

_REPO_ROOT = Path(__file__).resolve().parents[2]
_SOURCE_DIR = _REPO_ROOT / "data" / "raw" / "참가격데이터"
_SOURCE_URL = "https://www.price.go.kr/tprice/portal/wedding/areaCompare.do"

# 파일 생성/수정 메타데이터(openpyxl workbook.properties)로 실제 조사 시점을 확인했다 — "4월"
# 파일은 2025-05-27 발행, "6월"은 2025-07-28~29, "8월"은 2025-09-23~30 발행. 오늘 날짜(앱
# 기준 2026-08-23)와 무관하게 이 3개 파일은 2025년 4/6/8월 조사분이다(가정하지 않고 실제 파일
# 메타데이터로 확인한 값).
_MONTH_TO_SURVEY_MONTH: dict[str, date] = {
    "4월": date(2025, 4, 1),
    "6월": date(2025, 6, 1),
    "8월": date(2025, 8, 1),
}

_REGION_LABEL_TO_CODE: dict[str, str] = {
    "전국": "NATIONWIDE",
    "수도권": "METRO",
    "비수도권": "NON_METRO",
    "서울(강남)": "SEOUL_GANGNAM",
    "서울(강남 외)": "SEOUL_OTHER",
    "부산": "BUSAN",
    "인천": "INCHEON",
    "대구": "DAEGU",
    "대전": "DAEJEON",
    "광주": "GWANGJU",
    "울산": "ULSAN",
    "경기도": "GYEONGGI",
    "충청도": "CHUNGCHEONG",
    "전라도": "JEOLLA",
    "경상도": "GYEONGSANG",
    "강원도": "GANGWON",
    "제주도": "JEJU",
}

# 시트 이름 → item_code. 파일 안 시트 순서는 월마다 다르지만(예: "식대"/"1인당 식대" 위치가
# 4월과 6/8월이 다름) 이름으로 찾으므로 순서는 상관없다.
_VENUE_ITEM_SHEETS: dict[str, str] = {
    "결혼식장": "TOTAL",
    "대관료": "RENTAL_FEE",
    "식대": "MEAL_TOTAL",
    "1인당 식대": "MEAL_PER_PERSON",
}
_SDM_ITEM_SHEETS: dict[str, str] = {
    "스드메": "TOTAL",
    "스튜디오": "STUDIO",
    "드레스": "DRESS",
    "메이크업": "MAKEUP",
}

# "선택품목" 시트(4파일 공통, distribution 시트와 레이아웃이 반대 — 지역이 아니라 항목이 행) —
# 결혼식장(VENUE)과 스드메 3종(SDM). "얼리스타트비" 전용 시트(4월 파일에만 존재, 시간대별 세부
# 분포)는 의도적으로 안 읽는다 — 메이크업 시트의 "얼리스타트비" 행이 이미 이 항목의 전국/버킷
# 집계를 담고 있고, 시간대별 세부 분포는 6/8월엔 아예 없는 4월 한정 데이터라 스코프 밖.
_SDM_OPTION_SHEET_NAMES: tuple[str, ...] = ("스튜디오", "드레스", "메이크업")

# item_code는 시트 항목명을 정규화 없이 그대로 쓴다(사용자 결정, 15_post_v4_scope_promotion.md
# §P4) — "선택품목" 항목 구성 자체가 4월과 6/8월 사이에 실제로 개편됐다(예: 4월의 "스냅/영상"+
# "본식 스냅촬영"이 6/8월엔 "본식 촬영 비용" 하나로 통합, 메이크업도 유사). 이건 표기 흔들림이
# 아니라 원본 조사표가 그 달에 실제로 측정한 항목 자체가 다르다는 뜻이라, 억지로 하나의
# identity로 이어붙이면 데이터를 왜곡하게 된다. price_benchmarks는 애초에 (survey_month,
# region_code, category_code, item_code) UNIQUE라 "월을 가로질러 항목을 이어붙인다"는 개념
# 자체가 이 스키마에 없다 — 각 월의 라벨을 그 달의 item_code로 독립적으로 저장하면 충분하고,
# get_latest_benchmark()가 이미 최신 survey_month를 우선하므로 최신 조사의 항목 구성이
# 자연스럽게 조회된다. item_code에 CHECK 제약이 없는 순수 TEXT라(04_DB_schema.sql) 이 방식에
# 스키마 변경도 필요 없다. 유일한 정규화는 원본 번호(①②...) 접두사 제거 — 이건 매달 항목
# 순서가 바뀌는 것으로 이미 확인된 순수 UI 아티팩트라, 식별자에 남겨봐야 의미가 없다.
_ITEM_LABEL_PREFIX_RE = re.compile(r"^[①-⑳]\s*")


def _item_code_from_label(label: str) -> str:
    return _ITEM_LABEL_PREFIX_RE.sub("", label).strip()


# "선택품목" 시트 전용 지역 축 — 기존 17개 세분 코드(SEOUL_GANGNAM 등)가 아니라 4개 뭉뚱그린
# 버킷뿐이다. 세분 코드에 그대로 복제하지 않고 별도 OPTION_ 접두 코드로 저장한다 — 강남/마포처럼
# 실제로 없는 구 단위 정밀도를 있는 것처럼 보이게 만들지 않기 위해서(사용자 확인 결정,
# 15_post_v4_scope_promotion.md §P4). `app/services/benchmark.py`의
# `resolve_region_fallback_chain`은 이 코드들을 아직 모른다 — 지금은 각 항목의 NATIONWIDE
# 행(전국 분포 컬럼에서 만든 완전한 행)만 기존 폴백 체인으로 조회되고, 4개 버킷 행은
# median_price만 채운 원본 보존용으로 저장만 해둔다. 세분 지역별로 이 데이터를 실제로 보여주려면
# 세분 region_code → 4버킷 매핑을 폴백 체인(또는 별도 함수)에 추가하는 후속 작업이 필요하다
# (활용처 확정 후 — YAGNI, 지금은 컨슈머가 없어 배선하지 않음).
# 컬럼 인덱스(0-based, row 튜플 기준): 0=항목명, 1~5=하위10/하위25/중간가격/상위25/상위10
# (전국 분포), 6=평균(전국), 7~10=서울/경인/5대 광역시/이외 지역(버킷별 중간가격만, 분포·
# 표본수 없음), 11=표본수 개수(전국).
_OPTION_BUCKET_COLUMNS: tuple[tuple[str, int], ...] = (
    ("OPTION_SEOUL", 7),
    ("OPTION_GYEONGIN", 8),
    ("OPTION_METRO5", 9),
    ("OPTION_OTHER", 10),
)

# distribution 시트(결혼식장/대관료/식대/1인당식대/스튜디오/드레스/메이크업/스드메)는 헤더 4행
# 뒤 5행부터 데이터. TOTAL 시트("결혼서비스 평균 계약금액")는 '구분→결혼식장/스드메/총계약금액'
# 대분류 헤더(3행) + '대관료/장식비/식대' 중분류(4행) + '금액/비율' 소분류(5행)까지 헤더가 한
# 겹 더 있어 6행부터 데이터가 시작한다(실 파일로 확인: 5행은 여전히 '금액'/'비율' 라벨 행).
# "선택품목" 시트도 헤더가 distribution과 같은 4행 구조(제목/단위/대분류/소분류)라 5행부터.
_DISTRIBUTION_DATA_START_ROW = 5
_TOTAL_DATA_START_ROW = 6


@dataclass(frozen=True)
class BenchmarkRow:
    survey_month: date
    region_code: str
    category_code: str
    item_code: str
    median_price: int
    min_price: int | None
    max_price: int | None
    sample_count: int | None
    source_url: str
    source_note: str


def _parse_unit_multiplier(unit_row_text: object) -> int:
    """헤더 2행("(단위 : 만 원, 건, %)" 등)에서 배율을 뽑는다. '만원'/'만 원'이면 ×10000,
    그 외(예: '1인당 식대' 시트의 "(단위 : 원, 건, %)")는 원 단위 그대로 1."""
    if isinstance(unit_row_text, str) and "만" in unit_row_text:
        return 10_000
    return 1


def _parse_number(value: object) -> int | None:
    """'-'(표본 부족으로 산출 불가, 트레일링 공백이 섞인 '- ' 형태도 실제 원본에 있음)나 빈
    셀은 None, 그 외엔 정수로 반올림."""
    if isinstance(value, str):
        value = value.strip()
        if not value or value == "-":
            return None
    if value is None:
        return None
    return round(float(value))


def _iter_region_rows(ws: Worksheet, start_row: int = _DISTRIBUTION_DATA_START_ROW):
    """start_row부터 시작해 지역 목록이 끝나는 첫 행(각주·빈 행)에서 멈춘다 — 시트마다 지역
    개수가 다를 수 있어(제주도 결측 등) 고정 행 수를 가정하지 않는다. distribution 시트는 헤더가
    4행(하위10%~비율)이라 5행부터, TOTAL 시트는 헤더가 한 겹 더 있어(금액/비율 서브헤더) 6행부터
    데이터가 시작한다 — 호출부에서 start_row로 구분한다."""
    for row in ws.iter_rows(min_row=start_row, values_only=True):
        col_a, col_b = row[0], row[1]
        label = col_a if col_a is not None else col_b
        if label not in _REGION_LABEL_TO_CODE:
            return
        yield _REGION_LABEL_TO_CODE[label], row


def _scaled(value: object, multiplier: int) -> int | None:
    n = _parse_number(value)
    return None if n is None else n * multiplier


def _build_distribution_rows(
    ws: Worksheet, category_code: str, item_code: str, survey_month: date
) -> list[BenchmarkRow]:
    multiplier = _parse_unit_multiplier(ws.cell(row=2, column=1).value)
    source_note = f"한국소비자원 참가격, {survey_month:%Y-%m} 기준"

    rows: list[BenchmarkRow] = []
    for region_code, row in _iter_region_rows(ws):
        median = _scaled(row[4], multiplier)
        if median is None:
            continue  # median_price는 NOT NULL — 산출 불가 지역은 건너뛴다
        rows.append(
            BenchmarkRow(
                survey_month=survey_month,
                region_code=region_code,
                category_code=category_code,
                item_code=item_code,
                median_price=median,
                min_price=_scaled(row[2], multiplier),  # 하위 10% ≈ 근사 최저
                max_price=_scaled(row[6], multiplier),  # 상위 10% ≈ 근사 최고
                sample_count=_parse_number(row[8]),
                source_url=_SOURCE_URL,
                source_note=source_note,
            )
        )
    return rows


def _build_total_rows(ws: Worksheet, survey_month: date) -> list[BenchmarkRow]:
    """'결혼서비스 평균 계약금액' 시트 — 결혼식장+스드메 합산 평균. F7 예산 '미정' 슬라이더
    placeholder(category_code='TOTAL')용. 이 시트엔 분포(하위/상위 분위)가 없어 min/max는 항상
    None이고, "총 계약금액"은 중간값이 아니라 평균이라 source_note에 그 사실을 명시한다."""
    multiplier = _parse_unit_multiplier(ws.cell(row=2, column=1).value)
    source_note = (
        f"한국소비자원 참가격, {survey_month:%Y-%m} 기준 (지역별 평균 계약금액, 중간값 아님)"
    )

    rows: list[BenchmarkRow] = []
    for region_code, row in _iter_region_rows(ws, start_row=_TOTAL_DATA_START_ROW):
        total_amount = _scaled(row[10], multiplier)  # "총 계약금액" 금액 열
        if total_amount is None:
            continue
        rows.append(
            BenchmarkRow(
                survey_month=survey_month,
                region_code=region_code,
                category_code="TOTAL",
                item_code="TOTAL",
                median_price=total_amount,
                min_price=None,
                max_price=None,
                sample_count=_parse_number(row[12]),  # 표본수 건수 열
                source_url=_SOURCE_URL,
                source_note=source_note,
            )
        )
    return rows


def _build_option_rows(ws: Worksheet, category_code: str, survey_month: date) -> list[BenchmarkRow]:
    """ "선택품목" 시트 파싱 — 항목(구분)이 행, 지역이 열인 distribution 시트와 정반대 레이아웃.
    헤더 4행 뒤 5행부터 데이터, 시트 끝에 같은 번호(①...)로 항목 설명 각주 블록이 다시 나오는데
    그쪽은 숫자 컬럼(중간가격 등)이 전부 비어 있어 median 존재 여부로 자동으로 걸러진다.

    item_code는 라벨을 그대로 쓴다(모듈 docstring §P4 "선택품목" 처리 방식 참고 — 월을 가로질러
    항목을 이어붙이지 않는다는 결정). 항목별로 두 종류의 행을 만든다: (1) 전국 분포 컬럼(하위10/
    중간가격/상위10/표본수)으로 만든 NATIONWIDE 행 — distribution 시트와 동일한 완전한 형태라
    `get_latest_benchmark`의 기존 폴백 체인으로 바로 조회된다. (2) 서울/경인/5대 광역시/이외
    지역 4개 버킷 컬럼(중간가격만, 분포·표본수 없음)으로 만든 OPTION_* 행 — 지금은
    `resolve_region_fallback_chain`이 이 코드를 모르므로 조회 경로가 없는 원본 보존용 데이터다
    (활용처 확정 후 배선, §P4 참고)."""
    multiplier = _parse_unit_multiplier(ws.cell(row=2, column=1).value)
    source_note = f"한국소비자원 참가격, {survey_month:%Y-%m} 기준 (선택품목)"

    rows: list[BenchmarkRow] = []
    for row in ws.iter_rows(min_row=_DISTRIBUTION_DATA_START_ROW, values_only=True):
        label = row[0]
        national_median = _scaled(row[3], multiplier)
        if label is None or national_median is None:
            continue  # median_price는 NOT NULL — 각주/설명 블록 등 산출 불가 행은 건너뛴다
        item_code = _item_code_from_label(label)
        rows.append(
            BenchmarkRow(
                survey_month=survey_month,
                region_code="NATIONWIDE",
                category_code=category_code,
                item_code=item_code,
                median_price=national_median,
                min_price=_scaled(row[1], multiplier),  # 하위 10% ≈ 근사 최저
                max_price=_scaled(row[5], multiplier),  # 상위 10% ≈ 근사 최고
                sample_count=_parse_number(row[11]),
                source_url=_SOURCE_URL,
                source_note=source_note,
            )
        )
        for bucket_code, col_idx in _OPTION_BUCKET_COLUMNS:
            bucket_median = _scaled(row[col_idx], multiplier)
            if bucket_median is None:
                continue  # 표본 부족으로 해당 버킷 산출 불가(원본에 '-' 처리된 셀)
            rows.append(
                BenchmarkRow(
                    survey_month=survey_month,
                    region_code=bucket_code,
                    category_code=category_code,
                    item_code=item_code,
                    median_price=bucket_median,
                    min_price=None,  # 버킷별 분포(하위/상위 분위) 자체가 원본에 없음
                    max_price=None,
                    sample_count=None,  # 버킷별 표본수도 원본에 없음(전국 표본수만 존재)
                    source_url=_SOURCE_URL,
                    source_note=source_note,
                )
            )
    return rows


def collect_rows() -> list[BenchmarkRow]:
    """13개 원본 xlsx 중 이번 스크립트가 다루는 4종×3개월(§ 모듈 docstring 참고)을 전부 읽어
    price_benchmarks 행으로 변환한다. DB I/O 없는 순수 함수 — 파일 시스템만 읽는다."""
    rows: list[BenchmarkRow] = []
    for month_label, survey_month in _MONTH_TO_SURVEY_MONTH.items():
        venue_wb = load_workbook(
            _SOURCE_DIR / f"지역별 결혼식장 가격정보 ({month_label}).xlsx", data_only=True
        )
        for sheet_name, item_code in _VENUE_ITEM_SHEETS.items():
            rows += _build_distribution_rows(venue_wb[sheet_name], "VENUE", item_code, survey_month)

        sdm_wb = load_workbook(
            _SOURCE_DIR / f"지역별 결혼준비대행 서비스 가격정보 ({month_label}).xlsx",
            data_only=True,
        )
        for sheet_name, item_code in _SDM_ITEM_SHEETS.items():
            rows += _build_distribution_rows(sdm_wb[sheet_name], "SDM", item_code, survey_month)

        total_wb = load_workbook(
            _SOURCE_DIR / f"지역별 결혼서비스 평균 계약금액 현황 ({month_label}).xlsx",
            data_only=True,
        )
        rows += _build_total_rows(total_wb["결혼서비스 평균 계약금액"], survey_month)

        option_wb = load_workbook(
            _SOURCE_DIR / f"지역별 결혼서비스 선택품목 가격정보 ({month_label}).xlsx",
            data_only=True,
        )
        rows += _build_option_rows(option_wb["결혼식장"], "VENUE", survey_month)
        for sheet_name in _SDM_OPTION_SHEET_NAMES:
            rows += _build_option_rows(option_wb[sheet_name], "SDM", survey_month)

    return rows


async def _upsert_rows(session: AsyncSession, rows: list[BenchmarkRow]) -> int:
    if not rows:
        return 0
    stmt = pg_insert(PriceBenchmark).values([asdict(row) for row in rows])
    stmt = stmt.on_conflict_do_update(
        index_elements=["survey_month", "region_code", "category_code", "item_code"],
        set_={
            "median_price": stmt.excluded.median_price,
            "min_price": stmt.excluded.min_price,
            "max_price": stmt.excluded.max_price,
            "sample_count": stmt.excluded.sample_count,
            "source_url": stmt.excluded.source_url,
            "source_note": stmt.excluded.source_note,
        },
    )
    await session.execute(stmt)
    await session.commit()
    return len(rows)


async def seed() -> None:
    rows = collect_rows()
    async with get_session_factory()() as session:
        count = await _upsert_rows(session, rows)
    print(f"upserted {count} price_benchmarks rows")


if __name__ == "__main__":
    asyncio.run(seed())
