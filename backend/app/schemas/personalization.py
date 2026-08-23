"""#32 POST /personalization/regenerate — 03_API_spec.md §9(신규). MANUAL_REGENERATE 수동
재생성. 재생성 대상 도메인은 사용자가 직접 고른다 — route 노드의 LLM 호출을 생략하는
ONBOARDING_INITIAL과 같은 축(app/personalization/graph.py::route_node,
13_personalization_router_agent_design.md §4)."""

from uuid import UUID

from pydantic import BaseModel, field_validator

from app.schemas.common import PersonalizationDomain


class PersonalizationRegenerateRequest(BaseModel):
    domains: list[PersonalizationDomain]

    @field_validator("domains")
    @classmethod
    def _domains_not_empty_or_duplicate(
        cls, value: list[PersonalizationDomain]
    ) -> list[PersonalizationDomain]:
        if not value:
            raise ValueError("domains는 최소 1개 이상 선택해야 합니다.")
        if len(set(value)) != len(value):
            raise ValueError("domains에 중복된 값이 있습니다.")
        return value


class PersonalizationRegenerateOut(BaseModel):
    ai_invocation_id: UUID
    status: str  # SUCCESS | BLOCKED | FAILED — ai_invocations.status와 동일
    affected_domains: list[str]
