"""개인화 라우터 에이전트 그래프 상태 — 13_personalization_router_agent_design.md §1-1 verbatim
+ 2026-08-25 validate→generate 조건부 재시도 결정(retry_count 추가). `app/rag/graph.py::
ChatState`와 완전히 분리된 별도 그래프의 상태다(CLAUDE.md: 두 그래프는 서로 다른 그래프,
하나로 합치지 않는다)."""

from typing import TypedDict


class PersonalizationState(TypedDict):
    wedding_id: str
    trigger: str  # ONBOARDING_INITIAL | FIELD_UPDATED | MANUAL_REGENERATE
    changed_fields: list[str]
    profile: dict  # 활성 카테고리, 우선순위, 스타일, primary_goals, 예산, wedding_date, 지역 등
    protected_items: (
        # {"CHECKLIST": [{"id","category_code","title"}, ...], "TIMELINE": [...]} —
        # 재생성 후에도 살아남는 행(도메인별 기준은 app/services/personalization.py의
        # _checklist_protected_clause/_timeline_protected_clause). title/category_code까지 담는 이유는
        # app/services/personalization.py::_fetch_protected_items 참고(2026-08-26 레드팀 감사
        # 3라운드 MEDIUM #7 — id만으로는 "다시 만들지 마라" 지시를 LLM이 지킬 수 없었다).
        dict
    )
    requested_domains: list[str]  # MANUAL_REGENERATE 전용: 사용자가 직접 고른 도메인.
    # ONBOARDING_INITIAL/FIELD_UPDATED는 항상 빈 리스트 — route 노드가 무시한다.
    affected_domains: list[str]  # route 결과: CHECKLIST/TIMELINE 부분집합
    route_reasoning: str  # 감사로그용(화면 비노출)
    checklist_draft: list[dict] | None
    timeline_draft: list[dict] | None
    # 도메인별 독립(2026-08-24 버그 수정) — {"CHECKLIST": "SUCCESS"|"BLOCKED", "TIMELINE": ...},
    # affected_domains에 포함된 도메인만 키로 존재. 한쪽 도메인의 BLOCKED가 다른 쪽의
    # SUCCESS/BLOCKED 판정에 전혀 영향을 주지 않는다.
    validation_status: dict[str, str]
    validation_errors: dict[str, list[str]]
    # 2026-08-30 결정(red-bug.md #9-11) — 카테고리 단위 판정. 위 validation_status/
    # validation_errors[도메인]은 이 dict들의 요약값(하나라도 BLOCKED면 도메인 전체 BLOCKED)일
    # 뿐이고, 실제 폴백 병합(app/services/personalization.py)은 이 필드들을 본다 — 성공한
    # 카테고리는 LLM 결과를, 실패한 카테고리만 카탈로그 폴백을 쓴다. affected_domains에 그
    # 도메인이 없으면 빈 dict.
    checklist_category_status: dict[str, str]
    checklist_category_errors: dict[str, list[str]]
    # 2026-08-30 2차 — TIMELINE도 같은 세분화 대상이 됐다. 처음 #9-11에서 TIMELINE을 제외한
    # 이유는 category_code=null 범용 항목 때문이었는데, 같은 날 TIMELINE 결정론화로 범용 항목이
    # LLM 생성 대상에서 빠지면서 그 걸림돌이 사라졌다(경위는 app/personalization/validation.py::
    # validate_timeline_by_category docstring 참고).
    timeline_category_status: dict[str, str]
    timeline_category_errors: dict[str, list[str]]
    # 2026-08-25 결정 — validate가 BLOCKED이면 generate로 최대 1회 돌아간다(챗 그래프 CRAG
    # 재시도와 동일 패턴, 새 노드 아님·조건부 엣지만). validate_node가 BLOCKED 판정 시에만
    # 증가시킨다 — generate_node는 이 값이 0보다 크면 validation_errors를 피드백으로 프롬프트에
    # 주입한다(app/personalization/prompts.py::build_generate_prompt의 retry_feedback 인자).
    retry_count: int
