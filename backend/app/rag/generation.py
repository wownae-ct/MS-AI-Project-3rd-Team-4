"""generate/verify 단계가 쓰는 프롬프트 조립 + 근거검증 LLM 호출. app/rag/graph.py(비스트리밍
경로, build_graph()로 감싼 그래프)와 app/services/chat.py(#22 SSE 실시간 스트리밍 경로) 둘 다
여기서 가져다 쓴다 — 프롬프트가 두 곳에서 따로 관리되면 한쪽만 고치고 잊어버리는 드리프트가
생기기 쉽다(05_RAG_design.md §6 프롬프트 원문 그대로)."""

import json

from openai import AsyncAzureOpenAI

from app.core.config import Settings
from app.rag.retrieval import RetrievedChunk

SOURCE_TIER_LABELS = {
    "OFFICIAL": "공식 통계",
    "NEWS": "뉴스",
    "INDUSTRY": "업계 조사",
    "CONSENSUS": "커뮤니티 경험담",
}

NO_CONTEXT_ANSWER = "확인된 근거가 없습니다. 아직 관련 공식 자료를 확보하지 못한 주제일 수 있어요."
NO_CONTEXT_REASON = "검색된 근거 자료가 없어 일반 안내로 처리함"

_SYSTEM_PROMPT_TEMPLATE = """당신은 메리맵의 결혼 준비 상담 도우미입니다. 아래 규칙을 반드시 지키세요.

1. 주어진 컨텍스트(참고 자료)에 있는 내용만 근거로 답하세요. 컨텍스트에 없는 내용은 "확인된 근거가 없습니다"라고 답하세요.
2. 특정 업체의 정확한 금액을 단정하지 마세요. "얼마가 붙는다"가 아니라 "이 지점에서 추가금이 붙을 수 있으니 계약 전에 물어보세요" 형태로 답하세요.
3. 이 답변은 법률 자문이 아닙니다. 확정적인 법적 판단을 내리지 말고, 확인해야 할 지점을 안내하는 데 그치세요.
4. 답변 끝에 참고한 자료의 출처 등급(공식 통계/뉴스/업계 조사/커뮤니티 경험담)을 사용자가 알 수 있게 자연스럽게 언급하세요."""

# category_code가 있을 때만 덧붙는 규칙 — 카테고리 무관 전역 상담(12_final_prototype_mockup.html
# 하단 탭바의 "AI상담")엔 애초에 "지금 카테고리"라는 게 없어 이 두 규칙이 성립하지 않는다.
_CATEGORY_SCOPE_RULES_TEMPLATE = """
5. 사용자가 카테고리 "{category_code}"에 대해 질문하고 있습니다. 답변도 이 카테고리에 맞게 하세요.
6. 참고 자료가 지금 질문 카테고리("{category_code}")가 아닌 다른 카테고리의 내용이라면, 그 내용을 지금 카테고리에도 그대로 적용되는 것처럼 일반화해서 단정하지 마세요. 다른 카테고리 사례를 참고할 땐 그 사실을 명확히 밝히거나, 확실하지 않으면 언급을 생략하세요."""

_USER_PROMPT_TEMPLATE = """{context_block}

사용자 질문: {query}

위 참고 자료만 근거로 답하세요."""

_VERIFY_PROMPT_TEMPLATE = """아래는 사용자 질문에 대한 답변과, 답변을 생성할 때 사용한 참고 자료입니다.
답변의 각 핵심 주장이 참고 자료로 뒷받침되는지 판정하세요.

참고 자료:
{context_block}

답변:
{answer}

판정 결과를 JSON으로만 답하세요: {{"verdict": "SUPPORTED 또는 WEAK 또는 GENERAL", "reason": "판정 이유 한 문장"}}
- SUPPORTED: 참고 자료로 명확히 뒷받침됨
- WEAK: 부분적으로만 연결됨
- GENERAL: 참고 자료 근거 없이 일반론으로 답함"""

_REFORMULATE_QUERY_PROMPT_TEMPLATE = """아래는 사용자의 원래 질문과, 그 질문에 대한 답변이 왜
근거 부족(WEAK/GENERAL) 판정을 받았는지의 이유입니다. 검색 엔진에 다시 넣을 새로운 검색 질의를
한 줄로 작성하세요. 사용자에게 보여줄 답변이 아니라 내부 검색에만 쓰이므로, 설명 없이 검색어만
출력하세요.

원래 질문: {query}
근거 부족 판정 이유: {verification_reason}

새 검색 질의 (한 줄, 설명 없이 검색어만):"""


def build_context_block(chunks: list[RetrievedChunk]) -> str:
    """검색으로 찾아온 청크 5개를 "[참고 자료 1] ... [참고 자료 2] ..." 형태의 텍스트 한 덩어리로
    붙인다 — AI에게는 이게 "이 안에서만 답을 찾으라"고 건네주는 참고서 역할을 한다."""
    blocks = [
        f"[참고 자료 {i}] (출처: {c.title}, 등급: {SOURCE_TIER_LABELS.get(c.source_tier, c.source_tier)})\n{c.content}"
        for i, c in enumerate(chunks, start=1)
    ]
    return "\n\n".join(blocks)


def build_chat_messages(
    category_code: str | None, chunks: list[RetrievedChunk], query: str
) -> list[dict[str, str]]:
    """OpenAI API가 요구하는 형식(system 역할 1개 + user 역할 1개)으로 프롬프트를 조립한다.
    system엔 "지켜야 할 규칙"(카테고리 무관 전역 상담이면 4개, 카테고리 지정 상담이면 6개),
    user엔 "참고 자료 + 실제 질문"을 담는다."""
    system_prompt = _SYSTEM_PROMPT_TEMPLATE
    if category_code is not None:
        system_prompt += _CATEGORY_SCOPE_RULES_TEMPLATE.format(category_code=category_code)
    return [
        {"role": "system", "content": system_prompt},
        {
            "role": "user",
            "content": _USER_PROMPT_TEMPLATE.format(
                context_block=build_context_block(chunks), query=query
            ),
        },
    ]


async def verify_answer(
    client: AsyncAzureOpenAI, settings: Settings, chunks: list[RetrievedChunk], answer: str
) -> tuple[str, str]:
    """답변을 쓴 것과 별개의 LLM 호출로, "이 답변이 방금 준 근거 자료로 실제 뒷받침되는가?"를
    다시 채점시킨다 — 같은 모델이라도 답변을 쓸 때와 검증할 때 역할을 분리해서, 스스로 지어낸
    내용에 스스로 속지 않고 어느 정도 걸러낼 수 있게 한다. response_format으로 JSON만 답하게
    강제해서("SUPPORTED"/"WEAK"/"GENERAL" + 이유) 파싱이 항상 안전하다."""
    response = await client.chat.completions.create(
        model=settings.azure_openai_chat_deployment,
        response_format={"type": "json_object"},
        messages=[
            {
                "role": "user",
                "content": _VERIFY_PROMPT_TEMPLATE.format(
                    context_block=build_context_block(chunks), answer=answer
                ),
            }
        ],
    )
    verdict_json = json.loads(response.choices[0].message.content)
    return verdict_json.get("verdict", "GENERAL"), verdict_json.get("reason", "")


async def reformulate_query(
    client: AsyncAzureOpenAI, settings: Settings, query: str, verification_reason: str
) -> str:
    """CRAG(Corrective RAG) 재검색 루프용 질의 재구성 — verify가 WEAK/GENERAL을 낸 이유를
    근거로 검색에 더 적합한 질의를 LLM에게 다시 쓰게 한다. verify_answer와 달리
    response_format으로 JSON을 강제하지 않는다 — 자유 텍스트 검색어 한 줄이면 충분해서
    JSON 강제는 과설계."""
    response = await client.chat.completions.create(
        model=settings.azure_openai_chat_deployment,
        messages=[
            {
                "role": "user",
                "content": _REFORMULATE_QUERY_PROMPT_TEMPLATE.format(
                    query=query, verification_reason=verification_reason
                ),
            }
        ],
    )
    reformulated = (response.choices[0].message.content or "").strip()
    return reformulated or query  # 빈 응답 방어: retrieve()에 빈 문자열 대신 원 질문으로 폴백
