"""개인화 라우터 에이전트 그래프 상태 — 13_personalization_router_agent_design.md §1-1 verbatim.
`app/rag/graph.py::ChatState`와 완전히 분리된 별도 그래프의 상태다(CLAUDE.md: 두 그래프는
서로 다른 그래프, 하나로 합치지 않는다)."""

from typing import TypedDict


class PersonalizationState(TypedDict):
    wedding_id: str
    trigger: str  # ONBOARDING_INITIAL | FIELD_UPDATED
    changed_fields: list[str]
    profile: dict  # 활성 카테고리, 우선순위, 스타일, primary_goals, 예산, wedding_date, 지역 등
    protected_items: (
        dict  # {"CHECKLIST": [id, ...], "TIMELINE": [id, ...]} — user_edited_at 있는 행
    )
    affected_domains: list[str]  # route 결과: CHECKLIST/TIMELINE 부분집합
    route_reasoning: str  # 감사로그용(화면 비노출)
    checklist_draft: list[dict] | None
    timeline_draft: list[dict] | None
    validation_status: str  # SUCCESS | BLOCKED
    validation_errors: list[str]
