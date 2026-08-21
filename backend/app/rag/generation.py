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
4. 답변 끝에 참고한 자료의 출처 등급(공식 통계/뉴스/업계 조사/커뮤니티 경험담)을 사용자가 알 수 있게 자연스럽게 언급하세요.
5. 사용자가 카테고리 "{category_code}"에 대해 질문하고 있습니다. 답변도 이 카테고리에 맞게 하세요."""

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


def build_context_block(chunks: list[RetrievedChunk]) -> str:
    blocks = [
        f"[참고 자료 {i}] (출처: {c.title}, 등급: {SOURCE_TIER_LABELS.get(c.source_tier, c.source_tier)})\n{c.content}"
        for i, c in enumerate(chunks, start=1)
    ]
    return "\n\n".join(blocks)


def build_chat_messages(
    category_code: str, chunks: list[RetrievedChunk], query: str
) -> list[dict[str, str]]:
    return [
        {"role": "system", "content": _SYSTEM_PROMPT_TEMPLATE.format(category_code=category_code)},
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
