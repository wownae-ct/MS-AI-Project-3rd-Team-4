"""LangGraph 3노드: route → generate → validate — 13_personalization_router_agent_design.md §1.
`app/rag/graph.py`(챗 그래프, retrieve→generate→verify)와 완전히 분리된 별도 그래프다(CLAUDE.md:
두 그래프는 서로 다른 그래프, 하나로 합치지 않는다). LLM 호출의 구조화 출력은 이 레포의 유일한
기존 컨벤션(app/rag/generation.py::verify_answer)을 그대로 따른다: response_format={"type":
"json_object"} + 수동 json.loads, try/except 없이 위로 전파 — 예외 처리는 이 그래프를 호출하는
app/services/personalization.py의 몫이다.

**2026-08-25 결정**: validate가 BLOCKED을 내면 generate로 최대 1회 돌아간다(챗 그래프의 CRAG
조건부 재검색 루프와 동일 패턴 — 새 노드가 아니라 조건부 엣지 하나만 추가, 노드는 여전히 3개).
간헐적 few-shot 커버리지 누락·category_code 오염 등 "LLM이 한 번 잘못 만듦 → 바로 카탈로그
폴백"으로 끝나던 버그들을 완화하려는 목적(docs/AI-Sessions/wiki/decisions/
2026-08-25-personalization-validate-generate-retry-decision.md). generate는 결합 호출
구조(§1-3)를 그대로 유지해 재시도 시에도 affected_domains 전체를 다시 만든다 — 도메인별
부분 재시도는 스코프 밖(단순함 유지, 결정 문서 참고)."""

import json
import logging

from langchain_core.runnables import RunnableConfig
from langgraph.graph import END, StateGraph
from langgraph.graph.state import CompiledStateGraph

from app.core.config import Settings, get_settings
from app.core.embeddings import get_azure_openai_client
from app.core.tracing import traced_span
from app.personalization.prompts import build_generate_prompt, build_route_prompt
from app.personalization.state import PersonalizationState
from app.personalization.validation import validate_personalization_draft

logger = logging.getLogger(__name__)


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
# "결합 호출" 명시 — 특히 온보딩은 항상 양쪽 다라 이 경로가 상시 경로). retry_count > 0(=validate
# 재시도로 다시 들어온 경우, 2026-08-25 결정)면 이전 validation_errors를 프롬프트에 피드백으로
# 얹는다 — 단순 재시도가 아니라 CRAG처럼 실패 사유 기반 교정.
async def generate_node(state: PersonalizationState, config: RunnableConfig) -> dict:
    settings: Settings = config["configurable"].get("settings") or get_settings()
    async with traced_span(
        "personalization.generate", settings=settings, input=state["affected_domains"]
    ):
        if not state["affected_domains"]:
            return {"checklist_draft": None, "timeline_draft": None}

        client = get_azure_openai_client(settings)
        retry_feedback = state["validation_errors"] if state.get("retry_count", 0) > 0 else None
        prompt = build_generate_prompt(
            state["affected_domains"], state["profile"], state["protected_items"], retry_feedback
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
        # 2026-08-26 레드팀 감사 4라운드 항목 23 — 이 정규화가 발동하는 빈도가 무로깅이었다.
        # 3번째 재발(2026-08-25, CLAUDE.md 기록)이 있었던 버그라, 발동 자체를 남겨둬야 4번째
        # 재발을 조기에 감지할 수 있다.
        logger.warning(
            "LLM emitted null-like category_code string %r for timeline item %r — normalizing "
            "to None",
            code,
            item.get("title"),
        )
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
        state["protected_items"],
    )
    validation_status = {
        domain: "BLOCKED" if errors else "SUCCESS" for domain, errors in domain_errors.items()
    }
    # 2026-08-25 결정 — BLOCKED일 때만 증가시킨다. _route_after_validate가 이 값으로 재시도
    # 여부를 판단(1회 소진 후 두 번째도 BLOCKED면 더 안 늘어도 상관없음, 상한 판정만 통과하면 됨).
    retry_count = state.get("retry_count", 0)
    if any(status == "BLOCKED" for status in validation_status.values()):
        retry_count += 1
    return {
        "validation_status": validation_status,
        "validation_errors": domain_errors,
        "retry_count": retry_count,
    }


# 2026-08-25 결정 — validate 직후 조건부 분기. BLOCKED 도메인이 하나라도 있고 아직 재시도를
# 안 썼으면(retry_count <= 1, validate_node가 이번에 막 1로 올린 경우까지 포함) generate로
# 되돌아간다. 그 외(전부 SUCCESS, 또는 이미 재시도까지 소진하고도 BLOCKED)는 그래프 종료 —
# 후자는 app/services/personalization.py가 그대로 카탈로그 폴백으로 처리한다(기존 동작 그대로).
_MAX_RETRIES = 1


def _route_after_validate(state: PersonalizationState) -> str:
    has_blocked = any(status == "BLOCKED" for status in state["validation_status"].values())
    if has_blocked and state.get("retry_count", 0) <= _MAX_RETRIES:
        return "generate"
    return END


def build_graph() -> CompiledStateGraph:
    graph = StateGraph(PersonalizationState)
    graph.add_node("route", route_node)
    graph.add_node("generate", generate_node)
    graph.add_node("validate", validate_node)
    graph.set_entry_point("route")
    graph.add_edge("route", "generate")
    graph.add_edge("generate", "validate")
    graph.add_conditional_edges(
        "validate", _route_after_validate, {"generate": "generate", END: END}
    )
    return graph.compile()
