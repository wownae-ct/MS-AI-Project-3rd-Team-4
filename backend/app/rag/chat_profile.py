"""AI상담(챗)이 사용자 본인의 웨딩 상황을 알고 답하게 하는 프로필 블록 조립 —
2026-08-31 결정. 챗 그래프는 원래 (카테고리 코드 + RAG 청크 + 질문)만 받아서
"내 예산에서 이거 무리인가요?" 같은 질문에 구조적으로 답할 수 없었다.

**`app/services/personalization.py::_build_profile`을 재사용하지 않는 이유**(의도적 중복):
그 dict는 개인화 프롬프트에 **통째로 덤프될 목적**으로 만들어졌고, 실제로
`app/personalization/prompts.py`가 `f"웨딩 프로필: {profile_for_dump}"`로 raw snake_case 키와
ENUM 값을 그대로 찍는다(red-bug.md #20에서 일부만 한글화하고 나머지는 저우선순위로 남긴 상태).
개인화의 출력은 체크리스트 제목/본문이라 유출 표면이 좁지만, **챗 답변은 사용자에게 그대로
스트리밍되는 자유 텍스트**라 같은 결함의 노출 확률이 훨씬 크다. 그래서 챗은 처음부터 한글
라벨만 렌더링하는 전용 경로를 쓴다. 또 그 dict엔 챗에 정작 필요한 값(카테고리별 지출액,
D-day, 진행률)이 없고, 반대로 챗에 불필요한 값(`custom_request` 자유서술 500자 —
프롬프트 인젝션 표면)이 들어있다.

**개인정보 범위(2026-08-31 결정)**: 총예산/배정액에 더해 **카테고리별 실제 지출 집계**까지
포함한다("남은 예산으로 스드메 가능할까?"가 이 기능의 대표 질문인데 지출액 없이는 답이
안 나온다). 개별 결제 내역·업체명·영수증은 넣지 않는다 — 상담 품질 기여는 없고 민감도만
올린다. `custom_request`도 제외. 이 프롬프트는 Azure OpenAI와 Langfuse로 전송되므로,
실사용자 재무 데이터가 들어오는 상용화 시점에 재검토 대상이다(DS5_DUO/DS8_UGC 코퍼스와 같은
상용화 게이트 선반, docs/AI-Sessions/wiki/decisions/ 참고).

렌더링(`render_chat_profile_block`)은 DB/Settings에 의존하지 않는 순수 함수다 — CLAUDE.md의
"포터블한 순수 로직" 규칙과 `approximate_wedding_date()`/`build_budget_benchmark()` 선례를
따르고, 무엇보다 LLM·DB 없이 유닛 테스트할 수 있어야 하기 때문이다."""

from dataclasses import dataclass
from datetime import date

from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Wedding
from app.services.dashboard import (
    get_checklist_progress_by_category,
    get_timeline_progress_by_category,
)
from app.services.payment import compute_d_day
from app.services.wedding import list_wedding_categories_out

# wedding_date_precision이 EXACT가 아니면 wedding_date는 approximate_wedding_date()가 만든
# 대표값이다(app/services/wedding.py) — 정확한 날짜인 척 D-day를 단정하면 안 된다. 특히
# NO_PLAN은 "오늘+18개월"이라 D-day 자체가 아무 의미가 없다.
_PRECISION_LABELS = {
    "APPROX_H2_THIS_YEAR": "올해 하반기 예정(정확한 날짜 미정)",
    "APPROX_H1_NEXT_YEAR": "내년 상반기 예정(정확한 날짜 미정)",
    "APPROX_H2_NEXT_YEAR": "내년 하반기 예정(정확한 날짜 미정)",
    "APPROX_H1_YEAR_AFTER_NEXT": "내후년 상반기 예정(정확한 날짜 미정)",
    "NO_PLAN": "아직 시기를 정하지 않음",
}


@dataclass(frozen=True)
class ChatProfileCategory:
    name_ko: str
    planned_budget: int
    paid_amount: int
    remaining: int


@dataclass(frozen=True)
class ChatProfile:
    """렌더링에 필요한 값만 담은 순수 데이터. ORM/Session/Settings를 일절 안 들고 있다."""

    wedding_date: date
    wedding_date_precision: str
    d_day: int
    total_budget: int
    total_budget_unsure: bool
    guest_count: int | None
    guest_count_unsure: bool
    categories: tuple[ChatProfileCategory, ...]
    checklist_progress: float | None
    timeline_progress: float | None


def _average(values: list[float]) -> float | None:
    return sum(values) / len(values) if values else None


async def load_chat_profile(session: AsyncSession, wedding: Wedding, today: date) -> ChatProfile:
    """얇은 I/O 레이어 — 새 쿼리를 짜지 않고 기존 서비스 함수만 조합한다.

    호출 위치가 중요하다: `app/services/chat.py`가 `looks_out_of_scope()` **이후**에만 부른다.
    스코프 가드의 존재 이유가 "무관한 요청엔 임베딩·LLM·DB 비용을 아예 안 쓴다"인데, 그 앞에
    두면 그 속성이 깨진다(tests/test_smoke.py의 out-of-scope 단축 경로 테스트 전제이기도 하다)."""
    category_rows = await list_wedding_categories_out(session, wedding.id)
    checklist_progress = await get_checklist_progress_by_category(session, wedding.id)
    timeline_progress = await get_timeline_progress_by_category(session, wedding.id)

    active = [row for row in category_rows if row.is_active]
    # 진행률 dict는 "항목이 아예 없는 카테고리"를 키로 갖지 않는다(app/services/dashboard.py)
    # — .get(code, 0.0)으로 0 취급하면 아직 생성 안 된 카테고리가 "0% 완료"로 둔갑하므로,
    # 키가 실제로 있는 카테고리들의 평균만 낸다. 하나도 없으면 None(줄 자체를 생략).
    return ChatProfile(
        wedding_date=wedding.wedding_date,
        wedding_date_precision=wedding.wedding_date_precision,
        d_day=compute_d_day(wedding.wedding_date, today),
        total_budget=wedding.total_budget,
        total_budget_unsure=wedding.total_budget_unsure,
        guest_count=wedding.guest_count,
        guest_count_unsure=wedding.guest_count_unsure,
        categories=tuple(
            ChatProfileCategory(
                name_ko=row.name_ko,
                planned_budget=row.planned_budget,
                paid_amount=row.paid_amount,
                remaining=row.remaining,
            )
            for row in active
        ),
        checklist_progress=_average(
            [
                checklist_progress[row.category_code]
                for row in active
                if row.category_code in checklist_progress
            ]
        ),
        timeline_progress=_average(
            [
                timeline_progress[row.category_code]
                for row in active
                if row.category_code in timeline_progress
            ]
        ),
    )


def _format_won(amount: int) -> str:
    """원 단위 정수를 사람이 읽는 한국어 금액으로. LLM에게 자릿수 계산을 시키지 않으려고
    코드가 미리 변환한다(이 레포의 "계산은 코드가, LLM은 판단만" 관례)."""
    if amount >= 10000:
        man = amount // 10000
        return f"{man:,}만원" if amount % 10000 == 0 else f"약 {man:,}만원"
    return f"{amount:,}원"


def render_chat_profile_block(profile: ChatProfile) -> str | None:
    """순수 함수 — 프롬프트에 넣을 한글 블록을 만든다. 활성 카테고리가 하나도 없으면
    None(블록 자체를 넣지 않는다).

    지켜야 할 것 세 가지:
    1. **raw ENUM/필드명을 절대 쓰지 않는다** — red-bug.md #20(개인화 프롬프트가 snake_case
       필드명과 ENUM 값을 유출해 답변 본문에 "venue_priority가 FOOD이므로..."가 찍힌 사고)의
       동형 재발 방지. 카테고리는 name_ko, 날짜 정밀도는 _PRECISION_LABELS.
    2. **마크다운 금지** — 시스템 규칙 5번이 "볼드/번호목록 금지"인데, 블록을 `- 항목` 형태로
       주면 모델이 그 형식을 그대로 모방한다(실사용자 불만으로 추가된 규칙이라 회귀 위험 실재).
       그래서 "키: 값" 평문 줄로만 쓴다.
    3. **불확실한 값을 확정 사실로 쓰지 않는다** — total_budget_unsure=True여도 컬럼 자체는
       NOT NULL이고, 값은 `_resolve_total_budget()`이 지역 참가격 중간값으로 채워 넣은
       placeholder다. 이걸 "고객님 예산 5,000만원"으로 단정하면 없는 사실을 말하는 것이다."""
    if not profile.categories:
        return None

    lines: list[str] = []
    if profile.wedding_date_precision == "EXACT":
        lines.append(f"예식 예정일: {profile.wedding_date:%Y년 %m월 %d일} (D{profile.d_day:+d})")
    else:
        label = _PRECISION_LABELS.get(profile.wedding_date_precision, "정확한 날짜 미정")
        lines.append(f"예식 시기: {label} — 정확한 날짜가 없어 남은 기간을 단정할 수 없음")

    if profile.total_budget_unsure:
        lines.append(
            "총 예산: 아직 정하지 않음"
            f"(지역 평균 {_format_won(profile.total_budget)}을 임시 기준으로 사용 중)"
        )
    else:
        lines.append(f"총 예산: {_format_won(profile.total_budget)}")

    if profile.guest_count is not None and not profile.guest_count_unsure:
        lines.append(f"예상 하객 수: {profile.guest_count:,}명")

    lines.append("카테고리별 배정 예산과 지출 현황:")
    for category in profile.categories:
        lines.append(
            f"  {category.name_ko}: 배정 {_format_won(category.planned_budget)}, "
            f"지출 {_format_won(category.paid_amount)}, 남음 {_format_won(category.remaining)}"
        )

    progress_parts = []
    if profile.checklist_progress is not None:
        progress_parts.append(f"체크리스트 {profile.checklist_progress * 100:.0f}%")
    if profile.timeline_progress is not None:
        progress_parts.append(f"타임라인 {profile.timeline_progress * 100:.0f}%")
    if progress_parts:
        lines.append(f"준비 진행률: {', '.join(progress_parts)} 완료")

    return "\n".join(lines)
