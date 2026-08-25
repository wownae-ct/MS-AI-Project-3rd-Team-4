"""LangGraph 3노드: route → generate → validate — 13_personalization_router_agent_design.md §1.
`app/rag/graph.py`(챗 그래프, retrieve→generate→verify)와 완전히 분리된 별도 그래프다(CLAUDE.md:
두 그래프는 서로 다른 그래프, 하나로 합치지 않는다). 재시도/재검색 루프 없음 — 챗 그래프와 같은
"3노드 상한, 의도적 단순화" 원칙(05_RAG_design.md §5). LLM 호출의 구조화 출력은 이 레포의 유일한
기존 컨벤션(app/rag/generation.py::verify_answer)을 그대로 따른다: response_format={"type":
"json_object"} + 수동 json.loads, try/except 없이 위로 전파 — 예외 처리는 이 그래프를 호출하는
app/services/personalization.py의 몫이다."""

import json

from langchain_core.runnables import RunnableConfig
from langgraph.graph import END, StateGraph
from langgraph.graph.state import CompiledStateGraph

from app.core.config import Settings, get_settings
from app.core.embeddings import get_azure_openai_client
from app.core.tracing import traced_span
from app.personalization.prompts import build_generate_prompt, build_route_prompt
from app.personalization.state import PersonalizationState
from app.personalization.validation import validate_personalization_draft


# ① route: ONBOARDING_INITIAL/MANUAL_REGENERATE는 판단할 게 없어 LLM 호출 없이 즉시 도메인을
# 정한다(§1-2, §4) — 전자는 하드코딩된 "둘 다", 후자는 사용자가 직접 고른 domains를 그대로
# 신뢰한다(수동 트리거이므로 route가 다시 판단할 이유가 없다는 게 설계 결정, 15_post_v4_scope_
# promotion.md §P2). FIELD_UPDATED만 실제로 LLM을 호출한다.
async def route_node(state: PersonalizationState, config: RunnableConfig) -> dict:
    settings: Settings = config["configurable"].get("settings") or get_settings()
    async with traced_span("personalization.route", settings=settings, input=state["trigger"]):
        if state["trigger"] == "ONBOARDING_INITIAL":
            return {
                "affected_domains": ["CHECKLIST", "TIMELINE"],
                "route_reasoning": "온보딩 최초 생성 — 라우팅 판단 불필요, 두 도메인 모두 생성",
            }
        if state["trigger"] == "MANUAL_REGENERATE":
            return {
                "affected_domains": state["requested_domains"],
                "route_reasoning": "수동 재생성 — 사용자가 도메인을 직접 선택, 라우팅 판단 불필요",
            }

        client = get_azure_openai_client(settings)
        response = await client.chat.completions.create(
            model=settings.azure_openai_chat_deployment,
            response_format={"type": "json_object"},
            messages=[
                {
                    "role": "user",
                    "content": build_route_prompt(state["changed_fields"], str(state["profile"])),
                }
            ],
        )
        parsed = json.loads(response.choices[0].message.content)
        return {
            "affected_domains": parsed.get("affected_domains", []),
            "route_reasoning": parsed.get("reasoning", ""),
        }


# ② generate: affected_domains가 둘 다면 단일 결합 LLM 호출로 두 도메인을 한 번에 만든다(§1-3
# "결합 호출" 명시 — 특히 온보딩은 항상 양쪽 다라 이 경로가 상시 경로).
async def generate_node(state: PersonalizationState, config: RunnableConfig) -> dict:
    settings: Settings = config["configurable"].get("settings") or get_settings()
    async with traced_span(
        "personalization.generate", settings=settings, input=state["affected_domains"]
    ):
        if not state["affected_domains"]:
            return {"checklist_draft": None, "timeline_draft": None}

        client = get_azure_openai_client(settings)
        prompt = build_generate_prompt(
            state["affected_domains"], state["profile"], state["protected_items"]
        )
        response = await client.chat.completions.create(
            model=settings.azure_openai_chat_deployment,
            response_format={"type": "json_object"},
            messages=[{"role": "user", "content": prompt}],
        )
        parsed = json.loads(response.choices[0].message.content)
        checklist_draft = (
            parsed.get("checklist_items") if "CHECKLIST" in state["affected_domains"] else None
        )
        timeline_draft = (
            parsed.get("timeline_items") if "TIMELINE" in state["affected_domains"] else None
        )
        if timeline_draft:
            timeline_draft = [_normalize_timeline_category_code(item) for item in timeline_draft]
        return {"checklist_draft": checklist_draft, "timeline_draft": timeline_draft}


_NULL_STRING_VALUES = {"null", "none", "None", "NULL", ""}


def _normalize_timeline_category_code(item: dict) -> dict:
    """prompts.py의 few-shot이 실제 JSON null을 그대로 보여줘도, LLM이 category_code 자리에
    문자열 "null"/"None"/빈 문자열을 쓰는 사례가 few-shot 지시만으로는 반복적으로 재발했다
    (2026-08-24 "범용"→"null" 버그, 그 수정 후에도 재발 — validate_node가 이 값을 ENUM 밖으로
    BLOCKED 처리해 폴백 카탈로그로 떨어지는 원인). 프롬프트만으로 100% 방지가 안 되는 게
    실측으로 확인된 이상, 파싱 단계에서 방어적으로 흡수한다 — validate는 여전히 순수 규칙
    검증만 하고, "무엇을 null로 볼지"는 여기 한 곳에서만 결정한다."""
    code = item.get("category_code")
    if isinstance(code, str) and code.strip() in _NULL_STRING_VALUES:
        return {**item, "category_code": None}
    return item


# ③ validate: 순수 코드, LLM 호출 없음(§1-4) — app/personalization/validation.py의 4규칙을
# 도메인별 독립 적용한다. validation_status/validation_errors는 도메인별 딕셔너리다
# (2026-08-24 버그 수정 — 이전엔 단일 status라 한쪽 도메인만 실패해도 둘 다 BLOCKED
# 폴백됐다. app/services/personalization.py가 이 딕셔너리를 도메인별로 독립 적용한다).
async def validate_node(state: PersonalizationState, config: RunnableConfig) -> dict:
    active_categories = set(state["profile"].get("active_categories", []))
    domain_errors = validate_personalization_draft(
        active_categories,
        state["affected_domains"],
        state["checklist_draft"],
        state["timeline_draft"],
    )
    validation_status = {
        domain: "BLOCKED" if errors else "SUCCESS" for domain, errors in domain_errors.items()
    }
    return {"validation_status": validation_status, "validation_errors": domain_errors}


def build_graph() -> CompiledStateGraph:
    graph = StateGraph(PersonalizationState)
    graph.add_node("route", route_node)
    graph.add_node("generate", generate_node)
    graph.add_node("validate", validate_node)
    graph.set_entry_point("route")
    graph.add_edge("route", "generate")
    graph.add_edge("generate", "validate")
    graph.add_edge("validate", END)
    return graph.compile()
