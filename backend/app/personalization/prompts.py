"""route/generate 노드가 쓰는 프롬프트 조립 — 13_personalization_router_agent_design.md §1-2/§1-3
verbatim(규칙 원문 그대로), few-shot만 이 모듈이 조립한다. `app/rag/generation.py`가 챗 그래프의
프롬프트를 그래프·SSE 스트리밍 두 소비처가 공유하듯, 이 모듈도 route_node/generate_node 두 곳이
가져다 쓴다 — 프롬프트가 노드 안에 흩어지면 드리프트가 생기기 쉽다."""

from app.core.checklist_catalog import CHECKLIST_FALLBACK_CATALOG
from app.core.timeline_catalog import TIMELINE_CATALOG

# CHECKLIST_FALLBACK_CATALOG가 이제 VENUE/SDM(OFFICIAL 24항목) + 나머지 7개 MOCKUP 카테고리
# (CONSENSUS, 카테고리당 5항목)를 전부 커버한다(00_BASELINE.md §0-2 Should "MOCKUP 7개 카테고리
# 얇은 시드"). few-shot에는 VENUE/SDM 24항목 전체 + MOCKUP 카테고리별 대표 예시
# _MOCKUP_FEW_SHOT_SAMPLE_SIZE개씩 쓴다(설계 문서 §1-3 "대표 예시" — 59항목 전체 전사는
# few-shot 취지에 비해 과함). 대표 예시를 하드코딩 문자열로 따로 들고 있으면 카탈로그가 바뀔 때
# 드리프트가 나므로 카탈로그에서 매번 동적으로 뽑는다.
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

- FOCUS 카테고리(VENUE/SDM)는 CONTRACT_TERM 비중을 40% 이상으로 하세요(F9_CONTRACT_FOCUS).
- protected_items에 있는 항목은 다시 만들지 마세요(사용자가 이미 직접 수정함) — 중복 방지용
  참고만 하세요.
- 활성 카테고리마다 최소 2개 이상 항목을 만드세요.
- category_code는 활성 카테고리 안에서만 쓰세요."""

_TIMELINE_RULES = """아래 표준 55항목 카탈로그(few-shot)를 참고해 이 커플에게 맞는 타임라인을 만드세요.

- 활성 카테고리에 해당하는 항목만 포함하세요. 비활성 카테고리 항목은 만들지 마세요.
- category_code가 필요 없는 범용 항목(혼인신고·본식 등)은 null로 두세요.
- default_dday_offset_days는 본식 기준 며칠 전(음수)/후(양수)인지 정수로, -400~60 범위
  안에서만 쓰세요.
- protected_items는 다시 만들지 마세요."""

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
            "[체크리스트 few-shot — VENUE/SDM 표준약관 근거 항목 전체 + 나머지 카테고리 대표 예시 "
            f"{_MOCKUP_FEW_SHOT_SAMPLE_SIZE}개씩]"
        )
    ]
    for item in CHECKLIST_FALLBACK_CATALOG:
        if item.category_code in ("VENUE", "SDM"):
            lines.append(f"- [{item.category_code}] ({item.item_type}) {item.title}")
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
    lines = ["[타임라인 few-shot — 표준 55항목 카탈로그]"]
    for item in TIMELINE_CATALOG:
        category_label = item.category_code or "범용"
        lines.append(f"- [{category_label}] {item.title} (D{item.dday_offset_days:+d})")
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


def build_generate_prompt(affected_domains: list[str], profile: dict, protected_items: dict) -> str:
    """affected_domains가 한쪽뿐이면 해당 단독 규칙+few-shot+출력 스키마만, 둘 다면 두 블록을
    하나의 프롬프트 문자열에 순서대로 이어붙이고 응답 JSON 스키마를 두 키
    {"checklist_items": [...], "timeline_items": [...]}로 통합해 요청한다 — 런타임에 두 문자열을
    단순 concat하는 게 아니라 이 함수가 매번 완결된 프롬프트를 조립한다."""
    include_checklist = "CHECKLIST" in affected_domains
    include_timeline = "TIMELINE" in affected_domains

    parts = [f"웨딩 프로필: {profile}", _protected_items_note(protected_items)]

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
