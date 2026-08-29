"""카테고리 메타데이터 — 00_BASELINE.md §1 "카테고리 코드(9개) — 변경 금지" 표 그대로.

v3.0에서는 categories 테이블(DB 조회)이었지만, v4.0은 category_code ENUM으로 바뀌면서 이
메타데이터도 DB가 아니라 백엔드 상수가 됐다(03_API_spec.md #11: "DB 테이블이 아니라 백엔드
코드 상수 그대로 응답한다"). 이 리스트가 코드/이름/티어/기능플래그의 단일 소스 — 다른 모듈이
카테고리 이름표를 또 만들지 말고 여기서 가져다 쓸 것(온보딩 시 wedding_categories 9행 생성,
GET /categories 응답 등).

ETC의 tier는 두 문서가 서로 다르다: 00_BASELINE.md §1 표는 MOCKUP으로 분류하는데
03_API_spec.md #11의 예시 JSON은 tier="CUSTOM"으로 보여준다. BASELINE이 SSOT("다른 문서는
이와 문자 그대로 일치해야 함")이므로 tier는 MOCKUP으로 맞추고, API 예시의 "CUSTOM" 뉘앙스는
tier가 아니라 allows_custom_tag=True로 별도 표현한다(문서 드리프트이지 실제 스펙 충돌은
아니라고 판단 — 2026-08-24).

⚠️ MEETING(상견례)의 has_cost는 2026-08-29에 False → True로 바뀌었다 — 00_BASELINE.md §1 표와
의도적으로 다르다(그 줄의 주석 참고). 코드/이름/티어는 그대로다. `categories` 테이블은 v4.0에서
삭제됐으므로 이 상수만 고치면 되고, 옛 시드 마이그레이션(7e1bfc107dc7 등)은 이미 지워진 v3
테이블의 이력이라 손대지 않는다."""

from dataclasses import dataclass

from app.schemas.common import CategoryCode, CategoryTier


@dataclass(frozen=True)
class CategoryMeta:
    code: CategoryCode
    name_ko: str
    display_order: int
    tier: CategoryTier
    has_cost: bool
    has_benchmark: bool
    has_vendor_cases: bool
    allows_custom_tag: bool = False


CATEGORY_META: tuple[CategoryMeta, ...] = (
    # MEETING.has_cost: 2026-08-29 False → True (제품 확인). 00_BASELINE.md §1 표는 상견례를
    # 유일한 무비용 카테고리로 적었지만, 실제로는 식사비·선물 등 예산을 잡는 항목이라
    # "비용 설정이 가능해야 한다"로 확인됐다. 이 플래그 하나로 세 화면이 함께 열린다 —
    # 온보딩 8단계 배분 입력, 예산탭 「카테고리별 예산 현황」 행(슬라이더), 카테고리 상세
    # 비용탭·결제 등록. has_benchmark 은 그대로 False 다(참가격 데이터가 없는 카테고리다).
    CategoryMeta("MEETING", "상견례", 0, "MOCKUP", True, False, False),
    CategoryMeta("VENUE", "예식장", 1, "FOCUS", True, True, True),
    CategoryMeta("SDM", "스드메(드레스샵투어 포함)", 2, "FOCUS", True, True, True),
    CategoryMeta("GIFT", "예물·예단", 3, "MOCKUP", True, False, False),
    CategoryMeta("HOMEWARE", "혼수", 4, "MOCKUP", True, False, False),
    CategoryMeta("INVITATION", "청첩장·답례품", 5, "MOCKUP", True, False, False),
    CategoryMeta("HONEYMOON", "신혼여행", 6, "MOCKUP", True, False, False),
    CategoryMeta("HOMENEW", "신혼집 구하기", 7, "MOCKUP", True, False, False),
    CategoryMeta("ETC", "기타", 8, "MOCKUP", True, False, False, allows_custom_tag=True),
)

CATEGORY_META_BY_CODE: dict[CategoryCode, CategoryMeta] = {m.code: m for m in CATEGORY_META}
