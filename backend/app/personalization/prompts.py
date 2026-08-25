"""route/generate 노드가 쓰는 프롬프트 조립 — 13_personalization_router_agent_design.md §1-2/§1-3
verbatim(규칙 원문 그대로), few-shot만 이 모듈이 조립한다. `app/rag/generation.py`가 챗 그래프의
프롬프트를 그래프·SSE 스트리밍 두 소비처가 공유하듯, 이 모듈도 route_node/generate_node 두 곳이
가져다 쓴다 — 프롬프트가 노드 안에 흩어지면 드리프트가 생기기 쉽다."""

import json

from app.core.checklist_catalog import CHECKLIST_FALLBACK_CATALOG
from app.core.timeline_catalog import TIMELINE_CATALOG

# CHECKLIST_FALLBACK_CATALOG가 이제 VENUE/SDM(OFFICIAL 24항목) + 나머지 7개 MOCKUP 카테고리
# (CONSENSUS, 카테고리당 5항목)를 전부 커버한다(00_BASELINE.md §0-2 Should "MOCKUP 7개 카테고리
# 얇은 시드"). few-shot에는 VENUE/SDM은 이 24항목(전부 CONTRACT_TERM) + _VENUE_SDM_BALANCE_FEW_SHOT
# (EXTRA_COST/PREP, 아래 정의)을 합쳐 DS6_CHECK 코퍼스의 VENUE/SDM 60항목 전체를 보여주고,
# MOCKUP 카테고리는 카테고리별 대표 예시 _MOCKUP_FEW_SHOT_SAMPLE_SIZE개씩만 쓴다(설계 문서 §1-3
# "대표 예시" — MOCKUP까지 59항목 전체 전사는 few-shot 취지에 비해 과함). VENUE/SDM은 대표 예시가
# 아니라 전체를 보여주는 이유는 "40~60% CONTRACT_TERM" 규칙(F9_CONTRACT_FOCUS)을 지키려면 LLM이
# EXTRA_COST/PREP 예시도 반드시 봐야 하기 때문(2026-08-25 버그 수정 — CONTRACT_TERM만 보여줬을 때
# 실계정 재현으로 VENUE/SDM 체크리스트가 27/27 CONTRACT_TERM으로 나온 회귀 확인, 아래
# _VENUE_SDM_BALANCE_FEW_SHOT 주석 참고). MOCKUP 대표 예시를 하드코딩 문자열로 따로 들고 있으면
# 카탈로그가 바뀔 때 드리프트가 나므로 카탈로그에서 매번 동적으로 뽑는다.
_MOCKUP_CATEGORY_CODES: tuple[str, ...] = (
    "MEETING",
    "GIFT",
    "HOMEWARE",
    "INVITATION",
    "HONEYMOON",
    "HOMENEW",
    "ETC",
)

# 카테고리당 대표 예시 1개(next() 한 건)만 주던 원래 설계는 그 카테고리를 LLM이 확률적으로
# 통째로 누락시키는 위험을 안고 있었다(2026-08-24 버그 수정 — MEETING/GIFT가 실계정에서 실제로
# 이렇게 BLOCKED됨, app/core/timeline_catalog.py 모듈 docstring "버그 수정 2" 참고). 카탈로그가
# MOCKUP 카테고리당 5개씩 있으니 3개까지 늘려 누락 확률을 낮춘다.
_MOCKUP_FEW_SHOT_SAMPLE_SIZE = 3

# CHECKLIST_FALLBACK_CATALOG의 VENUE/SDM 24항목은 전부 CONTRACT_TERM이다(그 카탈로그는 validate
# BLOCKED 시 최후 폴백이라 "근거가 확실한 OFFICIAL 조문"만 담기로 설계됨,
# app/core/checklist_catalog.py 모듈 독스트링 참고 — 폴백의 안전성을 위해 의도된 좁은 구성이라
# 그 카탈로그 자체는 건드리지 않는다). 문제는 few-shot 예시로도 같은 카탈로그를 그대로 재사용하며,
# LLM이 VENUE/SDM에서 EXTRA_COST/PREP 예시를 단 한 번도 보지 못한 채 "CONTRACT_TERM 40% 이상"
# 규칙만 받는 상황이 됐다는 것 — "이상"을 만족하는 가장 쉬운 방법이 100%라, 실계정 재현으로
# gtcA/gtcB 두 프로필(취향·우선순위가 정반대)의 VENUE/SDM 체크리스트 27/27항목이 전부
# CONTRACT_TERM으로 나온 회귀가 확인됐다(2026-08-25). 아래 목록은 few-shot 균형용으로만 쓰는
# 별도 소스이고, `data/rag_corpus/DS6_CHECK/checklist.md`(85청크, VENUE 25=10·10·5/SDM
# 35=14·18·3 — 10_RAG_data_catalog.md §DS6_CHECK)의 EXTRA_COST/PREP 항목 제목을 그대로 옮겨왔다
# (새로 저작하지 않음). CHECKLIST_FALLBACK_CATALOG와 합치면 VENUE/SDM few-shot이 그 코퍼스의
# 60항목 전체를 보여주게 된다.
_VENUE_SDM_BALANCE_FEW_SHOT: tuple[tuple[str, str, str], ...] = (
    ("VENUE", "EXTRA_COST", "기본 예식비용에 포함된 항목과 별도 청구 항목을 구분해서 확인"),
    ("VENUE", "EXTRA_COST", "최소 보증인원(개런티) 기준과 미달 시 정산 방식 확인"),
    ("VENUE", "EXTRA_COST", "식대 단가가 성수기·비수기·요일별로 다른지 확인"),
    ("VENUE", "EXTRA_COST", "대관시간 초과 시 추가 요금 기준 확인"),
    ("VENUE", "EXTRA_COST", "폐백실·신부대기실 등 부대공간 이용료가 별도인지 확인"),
    ("VENUE", "EXTRA_COST", "주차 지원 대수 초과 시 추가 비용 여부 확인"),
    ("VENUE", "EXTRA_COST", "답례품·부케 등 예식장 자체 판매 물품의 강매 여부 확인"),
    ("VENUE", "EXTRA_COST", "외부 음식·이바지 반입 가능 여부와 추가 비용 확인"),
    ("VENUE", "EXTRA_COST", "온라인 중계(스트리밍) 서비스 추가 비용 확인"),
    ("VENUE", "EXTRA_COST", "성수기 예약 시 할증(프리미엄) 요금 여부 확인"),
    ("VENUE", "PREP", "최소 6개월 전부터 예식장 여러 곳을 투어하며 비교"),
    ("VENUE", "PREP", "하객 규모에 맞는 홀의 최소·최대 보증인원을 계산해서 비교"),
    ("VENUE", "PREP", "예식장 위치의 교통·주차 접근성을 하객 동선 기준으로 점검"),
    ("VENUE", "PREP", "예식 당일 리허설 가능 여부와 소요 시간을 사전에 확인"),
    ("VENUE", "PREP", "우천 시 야외 예식을 대체할 실내 공간(플랜B) 여부 확인"),
    ("SDM", "EXTRA_COST", "드레스 피팅 횟수 제한과 초과 시 추가비용 기준 확인"),
    ("SDM", "EXTRA_COST", "드레스 연장 대여(리허설·2부 촬영 등) 시 추가 요금 여부 확인"),
    ("SDM", "EXTRA_COST", "드레스 파손·오염 시 배상 기준이 계약서에 명시됐는지 확인"),
    ("SDM", "EXTRA_COST", "원본 파일·추가 앨범 페이지 비용이 별도인지 확인"),
    ("SDM", "EXTRA_COST", "촬영 컨셉 변경(야외 로케이션 등) 시 추가 비용 확인"),
    ("SDM", "EXTRA_COST", "앨범 표지·디자인 업그레이드 옵션 가격 확인"),
    ("SDM", "EXTRA_COST", "원판(전체 촬영본) 구매 여부와 가격 확인"),
    ("SDM", "EXTRA_COST", "서브스냅(보조 촬영작가) 추가 투입 비용 확인"),
    ("SDM", "EXTRA_COST", "야간·공휴일 촬영 시 할증 요금 여부 확인"),
    ("SDM", "EXTRA_COST", "로케이션 촬영 시 교통비 별도 청구 여부 확인"),
    ("SDM", "EXTRA_COST", "리허설(헤메 테스트) 비용이 별도 청구되는지 확인"),
    ("SDM", "EXTRA_COST", "부모님(혼주) 헤어메이크업이 패키지에 포함되는지 확인"),
    ("SDM", "EXTRA_COST", "본식 당일 헬퍼(도우미) 인원·시간 초과 시 추가 요금 확인"),
    ("SDM", "EXTRA_COST", "예복(턱시도) 사이즈 수선비가 기본 포함인지 확인"),
    ("SDM", "EXTRA_COST", "혼주 한복이 패키지에 포함되는지, 별도 대여인지 확인"),
    ("SDM", "EXTRA_COST", "취소·일정 변경 시 위약금이 촬영일에 가까울수록 급증하는 구조임을 인지"),
    ("SDM", "EXTRA_COST", "패키지 가격에 포함된 항목과 별도 옵션 항목을 서면으로 구분해서 받기"),
    ("SDM", "EXTRA_COST", "웨딩플래너 헬퍼비가 결혼식 당일 현금으로 요구되는지 사전 확인"),
    ("SDM", "PREP", "스드메 투어는 최소 3~4개 업체를 비교한 뒤 계약"),
    ("SDM", "PREP", "드레스 가봉 일정을 예식일과 충분히 간격을 두고 잡기(체형 변화 대비)"),
    ("SDM", "PREP", "촬영 컨셉·의상 매수를 계약 전에 구체적으로 합의해 문서로 남기기"),
)

ROUTE_PROMPT_TEMPLATE = """당신은 메리맵의 개인화 콘텐츠 라우터입니다. 어떤 필드가 바뀌었는지 보고
체크리스트(CHECKLIST)·타임라인(TIMELINE) 중 실제로 다시 만들어야 하는 도메인만 고르세요.

1. 활성 카테고리가 바뀌었다면(카테고리 온/오프) 두 도메인 모두 선택하세요.
2. 총예산(total_budget)만 바뀌었다면 체크리스트만 선택하세요 — 항목 우선순위가 예산에
   영향받을 수 있습니다. 타임라인 항목 자체는 예산과 무관합니다.
3. 본식일(wedding_date)만 바뀌었다면 어떤 도메인도 선택하지 마세요 — 날짜 재계산은
   이 판단과 무관하게 서비스 레이어에서 항상 결정론적으로 처리됩니다.
4. 스타일·우선순위(taste_preference/venue_priority/sdm_priority/priorities)가 바뀌었다면
   체크리스트만 선택하세요.
5. 애매하면 더 넓게(두 도메인 다) 선택하세요 — 과소생성보다 과다생성이 안전합니다.

변경된 필드: {changed_fields}
웨딩 요약: {profile_summary}

응답은 JSON으로만 답하세요: {{"affected_domains": ["CHECKLIST"와 "TIMELINE" 중 0개 이상], "reasoning": "판단 이유 한 문장"}}"""

_CHECKLIST_RULES = """웨딩 프로필(활성 카테고리·우선순위·스타일·예산·primary_goals)에 맞춰 카테고리별
체크리스트 항목을 만드세요.

- FOCUS 카테고리(VENUE/SDM)는 CONTRACT_TERM 비중을 40~60% 정도로 하세요(F9_CONTRACT_FOCUS) —
  EXTRA_COST/PREP도 반드시 섞으세요, CONTRACT_TERM 단일 구성은 이 기준을 어긴 것입니다.
- protected_items에 있는 항목은 다시 만들지 마세요(사용자가 이미 직접 수정함) — 중복 방지용
  참고만 하세요.
- 활성 카테고리마다 최소 2개 이상 항목을 만드세요.
- category_code는 활성 카테고리 안에서만 쓰세요.
- 아래 few-shot은 형식·수준을 보여주는 예시일 뿐입니다. 그대로 베끼지 말고, 이 웨딩의 예산
  규모·취향·우선순위·primary_goals에 맞춰 제목·내용을 실제로 다르게 쓰세요. 예산이나
  취향(taste_preference/venue_priority/sdm_priority)에 비춰 의미가 있다면 few-shot에 없는
  항목을 새로 만들어도 됩니다."""

_TIMELINE_RULES = """아래 표준 카탈로그(few-shot)를 참고해 이 커플에게 맞는 타임라인을 만드세요.

- 활성 카테고리에 해당하는 항목만 포함하세요. 비활성 카테고리 항목은 만들지 마세요.
- category_code가 필요 없는 범용 항목(혼인신고·본식 등)은 JSON의 따옴표 없는 null 타입으로
  두세요. "null"이라는 문자열이든 다른 어떤 한글/영문 단어든, category_code 자리에 텍스트
  값을 쓰면 ENUM에 없는 값이라 오류가 납니다 — 아래 few-shot의 JSON 예시를 그대로 참고하세요.
- default_dday_offset_days는 본식 기준 며칠 전(음수)/후(양수)인지 정수로, -400~60 범위
  안에서만 쓰세요.
- protected_items는 다시 만들지 마세요.
- **few-shot을 그대로 베끼지 마세요.** few-shot은 표준적인 일정 흐름과 타이밍 감각을 보여주는
  참고 자료일 뿐, 정답이 아닙니다. 이 웨딩의 예산 규모·취향(taste_preference)·우선순위·
  primary_goals에 맞춰 항목 제목이나 타이밍(default_dday_offset_days)을 실제로 조정하고,
  필요하면 few-shot에 없는 항목을 프로필에 맞게 추가하세요. 활성 카테고리 커버리지·오프셋
  범위 같은 구조적 제약만 지키면 되고, few-shot과 내용이 대부분 동일할 필요는 전혀 없습니다."""

_CHECKLIST_OUTPUT_SCHEMA = """체크리스트 항목은 각각 이 필드만 채우세요(그 외 필드는 응답에 포함하지
마세요 — group_label/status는 서비스 레이어가 결정론적으로 채웁니다):
{"category_code": "...", "item_type": "CONTRACT_TERM 또는 EXTRA_COST 또는 PREP", "title": "...",
"body": "...", "priority": "high 또는 mid 또는 low", "option_group": null 또는 "...",
"tag": null 또는 "..."}"""

_TIMELINE_OUTPUT_SCHEMA = """타임라인 항목은 각각 이 필드만 채우세요:
{"category_code": null 또는 "...", "title": "...", "default_dday_offset_days": 정수}"""


def _build_checklist_few_shot() -> str:
    lines = [
        (
            "[체크리스트 few-shot — VENUE/SDM은 CONTRACT_TERM/EXTRA_COST/PREP 균형 잡힌 항목 "
            "전체 + 나머지 카테고리 대표 예시 "
            f"{_MOCKUP_FEW_SHOT_SAMPLE_SIZE}개씩]"
        )
    ]
    for item in CHECKLIST_FALLBACK_CATALOG:
        if item.category_code in ("VENUE", "SDM"):
            lines.append(f"- [{item.category_code}] ({item.item_type}) {item.title}")
    for category_code, item_type, title in _VENUE_SDM_BALANCE_FEW_SHOT:
        lines.append(f"- [{category_code}] ({item_type}) {title}")
    for category_code in _MOCKUP_CATEGORY_CODES:
        representatives = [
            item for item in CHECKLIST_FALLBACK_CATALOG if item.category_code == category_code
        ][:_MOCKUP_FEW_SHOT_SAMPLE_SIZE]
        for representative in representatives:
            lines.append(
                f"- [{representative.category_code}] ({representative.item_type}) "
                f"{representative.title}"
            )
    return "\n".join(lines)


def _build_timeline_few_shot() -> str:
    """VENUE/SDM/범용(category_code=None) 항목은 전체 그대로 보여준다 — 이 항목들이 전체
    일정의 시간축 뼈대를 이루므로 줄이면 LLM이 타이밍 감각을 잃는다. 반면 MOCKUP 7개
    카테고리는 카테고리당 _MOCKUP_FEW_SHOT_SAMPLE_SIZE개로 제한한다(2026-08-24 버그 수정:
    원래 카탈로그 68항목 전체를 그대로 보여줘서, 서로 다른 프로필의 웨딩 두 건이 67개 중
    66개가 완전히 동일한 타임라인을 받는 사례가 실계정 재현으로 확인됐다 — LLM이 "그대로
    베낄 답"을 통째로 받으면 개인화할 유인이 사실상 없어지는 문제. `_TIMELINE_RULES`의
    명시적 "베끼지 마세요" 지시와 함께 적용한다). 카탈로그 순서(연대순)는 그대로 유지해
    시간 흐름 감각이 깨지지 않게 한다.

    **출력을 사람이 읽는 불릿 텍스트가 아니라 실제 출력 스키마와 동일한 JSON 한 줄씩으로
    보여준다**(2026-08-24 버그 수정 3 — 이전 두 시도, "범용" 라벨 → "null" 라벨, 둘 다 같은
    클래스의 버그로 재발했다: null 항목을 사람이 읽는 텍스트 라벨(`[범용]`/`(category_code=null)`)
    로 표시하면, 라벨 단어를 뭘로 바꾸든 LLM이 그 라벨을 "category_code 자리에 넣을 문자열
    값"으로 착각해 `"category_code": "범용"`/`"category_code": "null"`(둘 다 존재하지 않는
    ENUM 값, 후자는 파이썬 None이 아니라 4글자 문자열)을 그대로 출력했다 — 실계정 재현으로
    2연속 확인됨. 텍스트 라벨 방식 자체가 근본 원인이라, `json.dumps`로 실제 JSON null
    토큰(따옴표 없음)을 그대로 보여주는 방식으로 바꿔 이 클래스의 버그를 구조적으로 차단한다
    — LLM이 "이 예시를 그대로 따라 쓰면" 자동으로 올바른 JSON null이 나온다."""
    header = (
        "[타임라인 few-shot — 실제 출력과 동일한 JSON 한 줄씩. VENUE/SDM/null 항목 전체 + "
        f"나머지 카테고리 대표 예시 {_MOCKUP_FEW_SHOT_SAMPLE_SIZE}개씩. category_code가 "
        "null인 항목은 예시처럼 따옴표 없는 JSON null 그대로 쓰세요.]"
    )
    lines = [header]
    mockup_shown_count: dict[str, int] = {}
    for item in TIMELINE_CATALOG:
        if item.category_code in _MOCKUP_CATEGORY_CODES:
            already_shown = mockup_shown_count.get(item.category_code, 0)
            if already_shown >= _MOCKUP_FEW_SHOT_SAMPLE_SIZE:
                continue
            mockup_shown_count[item.category_code] = already_shown + 1
        entry = {
            "category_code": item.category_code,
            "title": item.title,
            "default_dday_offset_days": item.dday_offset_days,
        }
        lines.append(json.dumps(entry, ensure_ascii=False))
    return "\n".join(lines)


def build_route_prompt(changed_fields: list[str], profile_summary: str) -> str:
    return ROUTE_PROMPT_TEMPLATE.format(
        changed_fields=", ".join(changed_fields) or "(없음)", profile_summary=profile_summary
    )


def _protected_items_note(protected_items: dict) -> str:
    checklist_ids = protected_items.get("CHECKLIST") or []
    timeline_ids = protected_items.get("TIMELINE") or []
    if not checklist_ids and not timeline_ids:
        return "protected_items: 없음(사용자가 직접 수정한 기존 항목이 아직 없습니다)."
    return f"protected_items: CHECKLIST={checklist_ids}, TIMELINE={timeline_ids}"


def _retry_feedback_note(
    affected_domains: list[str], retry_feedback: dict[str, list[str]]
) -> str | None:
    """2026-08-25 결정 — validate가 BLOCKED을 낸 이유를 다음 generate 호출에 그대로 알려준다
    (단순 재시도가 아니라 CRAG처럼 실패 사유 기반 교정). affected_domains에 포함된 도메인 중
    실제로 에러가 있는 것만 보여준다 — 이미 SUCCESS였던 도메인의 빈 에러 리스트는 안 섞는다."""
    lines = [
        f"- {domain}: {'; '.join(errors)}"
        for domain in affected_domains
        if (errors := retry_feedback.get(domain))
    ]
    if not lines:
        return None
    return (
        "[재시도] 이전 시도가 다음 이유로 반려됐습니다. 같은 문제를 반복하지 말고 반드시 "
        "고쳐서 다시 만드세요:\n" + "\n".join(lines)
    )


def build_generate_prompt(
    affected_domains: list[str],
    profile: dict,
    protected_items: dict,
    retry_feedback: dict[str, list[str]] | None = None,
) -> str:
    """affected_domains가 한쪽뿐이면 해당 단독 규칙+few-shot+출력 스키마만, 둘 다면 두 블록을
    하나의 프롬프트 문자열에 순서대로 이어붙이고 응답 JSON 스키마를 두 키
    {"checklist_items": [...], "timeline_items": [...]}로 통합해 요청한다 — 런타임에 두 문자열을
    단순 concat하는 게 아니라 이 함수가 매번 완결된 프롬프트를 조립한다. retry_feedback은
    validate→generate 재시도 때만(2026-08-25 결정) 채워지며, 있으면 프롬프트 맨 앞에 반려
    사유를 덧붙인다."""
    include_checklist = "CHECKLIST" in affected_domains
    include_timeline = "TIMELINE" in affected_domains

    parts = [f"웨딩 프로필: {profile}", _protected_items_note(protected_items)]
    if retry_feedback:
        note = _retry_feedback_note(affected_domains, retry_feedback)
        if note:
            parts.insert(0, note)

    if include_checklist:
        parts += [_CHECKLIST_RULES, _build_checklist_few_shot()]
    if include_timeline:
        parts += [_TIMELINE_RULES, _build_timeline_few_shot()]

    if include_checklist and include_timeline:
        parts.append(_CHECKLIST_OUTPUT_SCHEMA)
        parts.append(_TIMELINE_OUTPUT_SCHEMA)
        parts.append(
            '응답은 JSON으로만 답하세요: {"checklist_items": [...], "timeline_items": [...]} '
            "— 두 키 모두 반드시 포함하세요."
        )
    elif include_checklist:
        parts.append(_CHECKLIST_OUTPUT_SCHEMA)
        parts.append('응답은 JSON으로만 답하세요: {"checklist_items": [...]}')
    elif include_timeline:
        parts.append(_TIMELINE_OUTPUT_SCHEMA)
        parts.append('응답은 JSON으로만 답하세요: {"timeline_items": [...]}')

    return "\n\n".join(parts)
