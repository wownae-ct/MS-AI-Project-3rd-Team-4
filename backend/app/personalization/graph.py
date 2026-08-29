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
2026-08-25-personalization-validate-generate-retry-decision.md).

**2026-08-29 결정(red-bug.md #9, §9-6~§9-10)**: 위 문단의 "generate는 결합 호출 구조(§1-3)를
그대로 유지" 부분은 번복됐다 — 실측(§9-6~§9-9, 5차례 A/B 라이브 LLM 실험)으로 결합 호출(두
도메인을 한 응답에 같이 요청) 자체가 BLOCKED 급증의 근본 원인임이 확인됐다. 이제 두 도메인이
모두 대상이면 `asyncio.gather`로 도메인별 독립 LLM 호출을 동시에 보낸다(§1-3 문서도 갱신
대상). 재시도도 도메인 단위로 독립 적용한다 — 이미 SUCCESS인 도메인은 재시도 패스에서 다시
안 만들고 그대로 carry-forward, BLOCKED인 도메인만 다시 호출한다. `retry_count`는 여전히
단일 int(스키마 변경 없음) — `_MAX_RETRIES=1` 상한 안에서는 "도메인별 dict로 나누는" 설계와
행동이 동일하기 때문(도메인 단위로 나눠도 안 나눠도 "이미 성공한 도메인은 안 건드린다"는
결과가 같음). 자세한 실험/설계 근거는 `docs/wedding/refactor/red-bug.md` §9-6~§9-10 참고."""

import asyncio
import json
import logging

from langchain_core.runnables import RunnableConfig
from langgraph.graph import END, StateGraph
from langgraph.graph.state import CompiledStateGraph

from app.core.config import Settings, get_settings
from app.core.embeddings import get_azure_openai_client
from app.core.tracing import traced_span
from app.personalization.prompts import (
    CONTRACT_GROUNDING_QUERY_BY_CATEGORY,
    build_generate_prompt,
    build_route_prompt,
)
from app.personalization.state import PersonalizationState
from app.personalization.validation import (
    deduplicate_titles,
    protected_titles_for_domain,
    validate_personalization_draft,
)
from app.rag.retrieval import RetrievedChunk, retrieve

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


# DS3(표준계약서) RAG grounding — FOCUS 카테고리(VENUE/SDM)가 활성일 때만, CHECKLIST가 생성
# 대상일 때만 검색한다(온보딩마다 무조건 임베딩 호출을 태우지 않기 위함). config에 session이
# 없으면(테스트 등 DB 세션을 안 주는 호출) 조용히 빈 리스트로 스킵 — 근거 없이 생성되는 기존
# 동작과 동일하다.
async def _fetch_contract_citations(
    state: PersonalizationState, settings: Settings, config: RunnableConfig
) -> list[RetrievedChunk]:
    if "CHECKLIST" not in state["affected_domains"]:
        return []
    session = config["configurable"].get("session")
    if session is None:
        return []
    active_categories = set(state["profile"].get("active_categories", []))
    focus_categories = active_categories & CONTRACT_GROUNDING_QUERY_BY_CATEGORY.keys()
    if not focus_categories:
        return []
    chunks_by_id: dict[int, RetrievedChunk] = {}
    for category_code in sorted(focus_categories):
        query = CONTRACT_GROUNDING_QUERY_BY_CATEGORY[category_code]
        for chunk in await retrieve(session, query, category_code, settings=settings):
            chunks_by_id[chunk.chunk_id] = chunk
    return list(chunks_by_id.values())


def _resolve_checklist_citations(
    checklist_draft: list[dict] | None, citations: list[RetrievedChunk]
) -> list[dict] | None:
    """LLM은 source_ref_id(정수)만 고르고, 실제 source_tier/label/url은 여기서 검색 결과를
    코드로 직접 조회해 채운다 — LLM이 인용 문구 자체를 지어내는 경로를 원천 차단한다. ref_id가
    없거나(대부분) 목록에 없는 값이면 기존 동작 그대로 전부 None(프론트 "AI 추천" 계약,
    03_API_spec.md #12)."""
    if not checklist_draft or not citations:
        return checklist_draft
    citation_by_id = {chunk.chunk_id: chunk for chunk in citations}
    resolved = []
    for item in checklist_draft:
        ref_id = item.pop("source_ref_id", None)
        chunk = citation_by_id.get(ref_id) if isinstance(ref_id, int) else None
        if chunk is not None:
            item = {
                **item,
                "source_tier": chunk.source_tier,
                "source_label": chunk.title,
                "source_url": chunk.source_url,
            }
        resolved.append(item)
    return resolved


async def _generate_domain_draft(
    domain: str,
    profile: dict,
    protected_items: dict,
    retry_feedback: dict[str, list[str]] | None,
    contract_citations: list[RetrievedChunk],
    client,
    settings: Settings,
) -> dict:
    """단일 도메인(CHECKLIST 또는 TIMELINE)만 요청하는 독립 LLM 호출 1건 — generate_node가
    두 도메인이 모두 대상일 때 이 코루틴 2개를 asyncio.gather로 동시에 돌린다(red-bug.md #9
    §9-6~§9-9 실측: 결합 호출이 BLOCKED 급증의 근본 원인으로 확인됨)."""
    prompt = build_generate_prompt(
        [domain],
        profile,
        protected_items,
        retry_feedback,
        contract_citations if domain == "CHECKLIST" else None,
    )
    response = await client.chat.completions.create(
        model=settings.azure_openai_chat_deployment,
        response_format={"type": "json_object"},
        messages=[{"role": "user", "content": prompt}],
    )
    return json.loads(response.choices[0].message.content)


# ② generate: affected_domains의 각 도메인을 독립 LLM 호출로 asyncio.gather 동시 요청한다
# (2026-08-29 결정, red-bug.md #9 §9-6~§9-10 — 예전엔 단일 결합 호출이었으나 그게 BLOCKED
# 급증의 근본 원인으로 실측 확인됨). retry_count > 0(=validate 재시도로 다시 들어온 경우,
# 2026-08-25 결정)이면 이번 패스에서 실제로 BLOCKED였던 도메인만 다시 호출하고, 이미 SUCCESS인
# 도메인은 state의 기존 draft를 그대로 carry-forward한다(다시 안 만듦 — 낭비 방지 + 이미 성공한
# 결과를 재시도가 덮어쓰지 않도록). DS3 RAG 근거(contract_citations)는 CHECKLIST가 이번 패스에
# 실제로 재생성 대상일 때만, gather로 병렬 호출을 보내기 전에 순차로 먼저 fetch한다 —
# AsyncSession은 동시 사용이 안전하지 않으므로 DB 접근은 반드시 gather 이전에 끝낸다.
async def generate_node(state: PersonalizationState, config: RunnableConfig) -> dict:
    settings: Settings = config["configurable"].get("settings") or get_settings()
    async with traced_span(
        "personalization.generate", settings=settings, input=state["affected_domains"]
    ):
        affected_domains = state["affected_domains"]
        if not affected_domains:
            return {"checklist_draft": None, "timeline_draft": None}

        is_retry = state.get("retry_count", 0) > 0
        validation_errors = state.get("validation_errors") or {}
        domains_to_regenerate = [
            domain for domain in affected_domains if not is_retry or validation_errors.get(domain)
        ]
        retry_feedback = validation_errors if is_retry else None

        contract_citations = (
            await _fetch_contract_citations(state, settings, config)
            if "CHECKLIST" in domains_to_regenerate
            else []
        )

        client = get_azure_openai_client(settings)
        responses = await asyncio.gather(
            *(
                _generate_domain_draft(
                    domain,
                    state["profile"],
                    state["protected_items"],
                    retry_feedback,
                    contract_citations,
                    client,
                    settings,
                )
                for domain in domains_to_regenerate
            )
        )
        parsed_by_domain = dict(zip(domains_to_regenerate, responses))

        checklist_draft = state["checklist_draft"]
        if "CHECKLIST" in domains_to_regenerate:
            checklist_draft = _resolve_checklist_citations(
                parsed_by_domain["CHECKLIST"].get("checklist_items"), contract_citations
            )
        timeline_draft = state["timeline_draft"]
        if "TIMELINE" in domains_to_regenerate:
            timeline_draft = [
                _normalize_timeline_category_code(item)
                for item in parsed_by_domain["TIMELINE"].get("timeline_items") or []
            ]
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


def _dedup_domain_draft(
    domain_label: str, draft: list[dict] | None, protected_items: dict
) -> list[dict] | None:
    """2026-08-28 결정(red-bug.md #9-2) — validate가 "제목 중복"을 잡아 도메인 전체를
    BLOCKED시키기 전에, 뒤에 나온 중복 항목만 먼저 드롭해 나머지는 그대로 살린다. draft가
    None이면(이 도메인이 affected_domains에 없어 generate가 아예 안 만든 경우) 그대로 None을
    돌려준다 — validate_personalization_draft도 이 경우를 동일하게 처리한다."""
    if draft is None:
        return None
    protected_titles = protected_titles_for_domain(protected_items, domain_label)
    kept, dropped = deduplicate_titles(draft, protected_titles)
    if dropped:
        # 2026-08-26 레드팀 감사 4라운드 항목 23의 교훈과 동일 — 자동 교정이 발동할 때마다
        # 로그를 남겨야 재발 빈도를 조기에 파악할 수 있다(null-string category_code 버그가
        # 무로깅으로 3번 재발했던 전례).
        logger.warning(
            "Deduplicated %d %s item(s) with repeated (category_code, title): %r",
            len(dropped),
            domain_label,
            [(item.get("category_code"), item.get("title")) for item in dropped],
        )
    return kept


# ③ validate: 순수 코드, LLM 호출 없음(§1-4) — app/personalization/validation.py의 4규칙을
# 도메인별 독립 적용한다. validation_status/validation_errors는 도메인별 딕셔너리다
# (2026-08-24 버그 수정 — 이전엔 단일 status라 한쪽 도메인만 실패해도 둘 다 BLOCKED
# 폴백됐다. app/services/personalization.py가 이 딕셔너리를 도메인별로 독립 적용한다).
#
# 2026-08-28 결정(red-bug.md #9-2) — 실제 규칙 검증 전에 _dedup_domain_draft로 제목 중복부터
# 먼저 걸러낸다(원래 validate는 순수 검증만 했다는 §1-4 설계 원칙에서 "일부 자동 교정"으로
# 성격이 바뀌는 의도된 변경). 걸러진 checklist_draft/timeline_draft를 그대로 반환해 state에
# 반영하므로, app/services/personalization.py가 이후 result["checklist_draft"]/
# ["timeline_draft"]를 읽을 때 이미 정제된 목록을 받는다.
async def validate_node(state: PersonalizationState, config: RunnableConfig) -> dict:
    active_categories = set(state["profile"].get("active_categories", []))
    protected_items = state["protected_items"]
    checklist_draft = _dedup_domain_draft("CHECKLIST", state["checklist_draft"], protected_items)
    timeline_draft = _dedup_domain_draft("TIMELINE", state["timeline_draft"], protected_items)
    domain_errors = validate_personalization_draft(
        active_categories,
        state["affected_domains"],
        checklist_draft,
        timeline_draft,
        protected_items,
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
        "checklist_draft": checklist_draft,
        "timeline_draft": timeline_draft,
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
