"""DS1_PRICE(참가격, data/raw/참가격데이터/*.xlsx) → price_benchmarks UPSERT.

RAG 코퍼스가 아니다(app/rag/indexing.py의 대상이 아님) — 06_RAG_implementation_and_copyright_review.md
가 "RAG 아님, price_benchmarks 테이블에 행 단위 UPSERT"로 명시한 대로 이 스크립트가 직접 xlsx를
파싱해 DB에 적재한다. 사람이 `uv run python scripts/seed_price_benchmarks.py`로 직접 실행한다
(RAG reindex처럼 자동 CronJob으로 안 돌린다 — 원본 데이터가 소비자원 월간 발행 주기라 매일 재실행할
이유가 없다).

원본 13개 파일 중 이번 스크립트가 다루는 건 4종(09_backend_implementation_plan.md Phase 4가
"VENUE/SDM 항목 우선"으로 좁힌 최소범위 + F7 예산 미정 슬라이더용 TOTAL):
  - 지역별 결혼식장 가격정보 (4/6/8월).xlsx        → category_code='VENUE'
  - 지역별 결혼준비대행 서비스 가격정보 (4/6/8월).xlsx → category_code='SDM'
  - 지역별 결혼서비스 평균 계약금액 현황 (4/6/8월).xlsx → category_code='TOTAL'
나머지 2종은 의도적으로 제외한다: "시기별 결혼서비스 가격정보"는 지역 축이 없어 price_benchmarks
스키마(region_code 필수)에 안 맞고, "지역별 결혼서비스 선택품목 가격정보"는 월별 시트 구성이
달라(4월만 얼리스타트비 시트가 추가로 있음) 이번 최소범위 밖이다.

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

# distribution 시트(결혼식장/대관료/식대/1인당식대/스튜디오/드레스/메이크업/스드메)는 헤더 4행
# 뒤 5행부터 데이터. TOTAL 시트("결혼서비스 평균 계약금액")는 '구분→결혼식장/스드메/총계약금액'
# 대분류 헤더(3행) + '대관료/장식비/식대' 중분류(4행) + '금액/비율' 소분류(5행)까지 헤더가 한
# 겹 더 있어 6행부터 데이터가 시작한다(실 파일로 확인: 5행은 여전히 '금액'/'비율' 라벨 행).
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
