"""generate/verify 단계가 쓰는 프롬프트 조립 + 근거검증 LLM 호출. app/rag/graph.py(비스트리밍
경로, build_graph()로 감싼 그래프)와 app/services/chat.py(#22 SSE 실시간 스트리밍 경로) 둘 다
여기서 가져다 쓴다 — 프롬프트가 두 곳에서 따로 관리되면 한쪽만 고치고 잊어버리는 드리프트가
생기기 쉽다(05_RAG_design.md §6 프롬프트 원문 그대로)."""

import json
import logging

from openai import AsyncAzureOpenAI

from app.core.config import Settings
from app.rag.retrieval import RetrievedChunk

logger = logging.getLogger(__name__)

# 2026-08-26 레드팀 감사 3라운드 HIGH #1 — LLM이 스키마 밖 문자열을 verdict로 낼 수 있다(예:
# "PARTIALLY_SUPPORTED"). 여기서 안 걸러지면 app/services/chat.py가 이 값으로 그대로
# VerificationEventData(Verdict Literal)를 만들다 pydantic ValidationError로 죽는데, 그 시점엔
# 이미 답변 전체가 SSE token으로 스트리밍된 뒤라 사용자는 답을 봤는데 DB엔 저장 안 되는 버그로
# 이어진다. 파싱 경계에서 미리 정상화해 그 상황 자체가 생기지 않게 한다.
#
# 2026-08-29 — app/schemas/common.py의 Verdict Literal 전체(frozenset(get_args(Verdict)))가
# 아니라 이 3종만 고정으로 든다. Verdict에 "OUT_OF_SCOPE"가 추가된 뒤에도 verify_node가 실제로
# 낼 수 있는 값은 여전히 이 3종뿐이다 — get_args(Verdict)를 그대로 썼다면 LLM이 (드물게라도)
# "OUT_OF_SCOPE" 문자열을 그대로 흉내 내 냈을 때 정상화 없이 통과해버렸을 것이다. OUT_OF_SCOPE는
# app/rag/scope_check.py가 그래프 호출 전에 결정하는 값이라 이 함수의 관할이 아니다.
_VALID_VERDICTS: frozenset[str] = frozenset({"SUPPORTED", "WEAK", "GENERAL"})


def _normalize_verdict(raw: str | None) -> str:
    if raw in _VALID_VERDICTS:
        return raw
    # 2026-08-26 레드팀 감사 4라운드 항목 9 — 이 정상화가 실제로 발동하는지(=LLM이 실제로
    # 스키마 밖 verdict를 냈는지) 무로깅이었다. 발동 자체가 드물어야 정상이므로, 남으면 LLM
    # 프롬프트/모델 쪽 회귀 신호다.
    logger.warning("LLM emitted invalid verdict value %r — normalizing to GENERAL", raw)
    return "GENERAL"


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
5. 마크다운 문법(**볼드**, #, -, 1. 2. 같은 번호·기호 목록 등)을 절대 쓰지 마세요. 별표나 기호로 강조하지 말고, 사람이 옆에서 말로 설명하듯 자연스러운 문장으로 쓰세요. 여러 항목을 안내할 때도 번호를 매기지 말고, 항목마다 문단을 나누어(항목 사이에 줄바꿈을 넣어) 설명하세요.
6. "정리하면", "결론적으로" 같은 요약 멘트로 억지로 마무리하지 말고, 마지막 항목을 설명한 뒤 자연스럽게 끝내세요."""

# category_code가 있을 때만 덧붙는 규칙 — 카테고리 무관 전역 상담(12_final_prototype_mockup.html
# 하단 탭바의 "AI상담")엔 애초에 "지금 카테고리"라는 게 없어 이 두 규칙이 성립하지 않는다.
_CATEGORY_SCOPE_RULES_TEMPLATE = """
7. 사용자가 카테고리 "{category_code}"에 대해 질문하고 있습니다. 답변도 이 카테고리에 맞게 하세요.
8. 참고 자료가 지금 질문 카테고리("{category_code}")가 아닌 다른 카테고리의 내용이라면, 그 내용을 지금 카테고리에도 그대로 적용되는 것처럼 일반화해서 단정하지 마세요. 다른 카테고리 사례를 참고할 땐 그 사실을 명확히 밝히거나, 확실하지 않으면 언급을 생략하세요."""

# 2026-08-31 — 프로필이 있을 때만 붙는 규칙. 기존 규칙 1~8을 **다시 쓰지 않고 관할만 좁히는**
# 방식을 택했다: 규칙 1("컨텍스트에 있는 내용만")을 통째로 재작성하면 프로필이 없는 모든 기존
# 상담의 동작까지 바뀌어 회귀 범위가 서비스 전체가 된다. 아래처럼 "규칙 1의 컨텍스트란 참고
# 자료를 뜻한다"고 뒤에서 한정하면, 프로필이 없을 땐 이 블록 자체가 안 붙어 기존 동작이
# 바이트 단위로 보존된다.
#
# 번호를 9부터 시작하는 이유: 카테고리 지정 상담이면 8번까지 쓰였고, 전역 상담이면 6번까지만
# 쓰였다 — 겹치지 않게 넉넉히 띄운다(모델은 번호의 연속성보다 내용을 본다).
_PROFILE_RULES_TEMPLATE = """

[사용자 정보 — 이 사용자 본인의 웨딩 상황입니다]
{profile_block}

9. 위 [사용자 정보]는 사용자가 앱에 직접 입력해 저장된 **확정 사실**입니다. 규칙 1번이 말하는
   "컨텍스트"는 참고 자료를 뜻하며, [사용자 정보]는 그와 별개의 근거원입니다 — 사용자 본인의
   예산·일정·지출·진행률을 물으면 [사용자 정보]에 있는 값으로 답하세요. 규칙 2번의 "금액을
   단정하지 마세요"는 **업체 가격**에 대한 규칙이며, 사용자 본인의 예산 금액에는 적용되지
   않습니다.
10. 반대로 [사용자 정보]의 수치를 일반적 사실인 것처럼 말하지 마세요. "보통 이 정도 듭니다"
   같은 일반론은 [참고 자료]에 있을 때만 말할 수 있습니다.
11. [사용자 정보]는 출처 등급(공식 통계/뉴스/업계 조사/커뮤니티 경험담)이 없습니다. 규칙 4번의
   출처 등급 언급은 [참고 자료]를 인용했을 때만 하고, [사용자 정보]에 등급을 붙이지 마세요.
12. 사용자가 묻지 않은 금액·날짜를 먼저 나열하지 마세요. [사용자 정보]는 답을 사용자 상황에
   맞게 조정하는 데 쓰고, 필요한 값만 자연스럽게 언급하세요."""

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

# 2026-08-31 — verify 프롬프트 **뒤에** 덧붙는다(앞이 아니라 뒤). 판정 기준 3줄
# (SUPPORTED/WEAK/GENERAL 정의) 다음에 예외를 선언해야, 기존 기준을 재작성하지 않고도
# "이건 검증 대상이 아니다"만 추가로 알릴 수 있다. profile_block이 없으면 이 문자열 자체가
# 안 붙어 프롬프트가 변경 전과 바이트 단위로 동일하다.
_VERIFY_PROFILE_NOTE_TEMPLATE = """

참고 — 아래는 이 사용자가 앱에 직접 입력해 저장한 본인 정보입니다. 답변이 이 값들(본인 예산·
일정·지출·진행률)을 인용한 부분은 **검증 대상이 아닙니다**. 참고 자료로 뒷받침되어야 하는 것은
일반적 사실 주장(시세, 계약 조건, 업계 관행 등)뿐입니다. 본인 정보를 인용했다는 이유로 WEAK나
GENERAL을 주지 마세요.

[사용자 본인 정보]
{profile_block}"""

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
    category_code: str | None,
    chunks: list[RetrievedChunk],
    query: str,
    profile_block: str | None = None,
) -> list[dict[str, str]]:
    """OpenAI API가 요구하는 형식(system 역할 1개 + user 역할 1개)으로 프롬프트를 조립한다.
    system엔 "지켜야 할 규칙"(카테고리 무관 전역 상담이면 4개, 카테고리 지정 상담이면 6개),
    user엔 "참고 자료 + 실제 질문"을 담는다.

    profile_block(2026-08-31)은 사용자 본인의 예산·일정·진행률이다(app/rag/chat_profile.py).
    **기본값 None이면 프롬프트가 이 변경 전과 바이트 단위로 동일**하다 — 골든 질문 평가
    (scripts/run_rag_eval.py)와 기존 테스트가 무회귀로 돌아야 하기 때문이다.

    프로필을 system에 넣는 이유: user 메시지의 "참고 자료" 옆에 붙이면 모델이 프로필을 검색
    근거로 오인해 규칙 1번(컨텍스트 밖 내용 금지)이 흔들린다 — 두 근거원의 **관할이 다르다**는
    걸 규칙과 같은 위치에서 선언해야 경계가 유지된다."""
    system_prompt = _SYSTEM_PROMPT_TEMPLATE
    if category_code is not None:
        system_prompt += _CATEGORY_SCOPE_RULES_TEMPLATE.format(category_code=category_code)
    if profile_block:
        system_prompt += _PROFILE_RULES_TEMPLATE.format(profile_block=profile_block)
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
    client: AsyncAzureOpenAI,
    settings: Settings,
    chunks: list[RetrievedChunk],
    answer: str,
    profile_block: str | None = None,
) -> tuple[str, str]:
    """답변을 쓴 것과 별개의 LLM 호출로, "이 답변이 방금 준 근거 자료로 실제 뒷받침되는가?"를
    다시 채점시킨다 — 같은 모델이라도 답변을 쓸 때와 검증할 때 역할을 분리해서, 스스로 지어낸
    내용에 스스로 속지 않고 어느 정도 걸러낼 수 있게 한다. response_format으로 JSON만 답하게
    강제해서("SUPPORTED"/"WEAK"/"GENERAL" + 이유) 파싱이 항상 안전하다.

    **profile_block을 여기에도 넘기는 것이 필수다(2026-08-31).** generate에만 프로필을 주고
    verify는 청크만 보게 두면, "총예산 3,000만원 기준으로는…" 같은 문장이 검증 입장에서
    정의상 근거 없음이 되어 **WEAK/GENERAL이 결정론적으로 나온다**. 그러면
    `_route_after_verify`가 CRAG 재검색을 발동시키는데, ChatState의 context는 덮어쓰기 채널이라
    **1차의 좋은 컨텍스트가 2차의 무관한 컨텍스트로 교체되고**, 프론트는 `retry` 이벤트를 받아
    이미 스트리밍된 답변을 지우고 다시 그린다. 결과적으로 개인화가 잘 될수록 답변이 지워지고
    "근거 없음" 배지가 붙는, 정확히 반대인 시스템이 된다. 검증자도 같은 근거원을 봐야 한다."""
    response = await client.chat.completions.create(
        model=settings.chat_rag_deployment,
        response_format={"type": "json_object"},
        messages=[
            {
                "role": "user",
                "content": _VERIFY_PROMPT_TEMPLATE.format(
                    context_block=build_context_block(chunks), answer=answer
                )
                + (
                    _VERIFY_PROFILE_NOTE_TEMPLATE.format(profile_block=profile_block)
                    if profile_block
                    else ""
                ),
            }
        ],
    )
    verdict_json = json.loads(response.choices[0].message.content)
    return _normalize_verdict(verdict_json.get("verdict")), verdict_json.get("reason", "")


# 대화 이력에서 생략된 대상을 채워 **그 자체로 이해되는 질문**으로 다시 쓴다.
#
# ## 왜 필요한가
#
# 이 채팅은 매 메시지가 독립이다(build_chat_messages 가 이력을 받지 않는다). 그래서 "그럼
# 스드메는?" 같은 생략형 후속 질문은 검색도 생성도 제대로 못 한다 — 실측(2026-08-30) 결과
# 전역 top-1 유사도가 0.199 로, 스코프 컷오프(0.30)에 걸려 **정상 질문인데 거절**됐다.
# "스드메"는 이 서비스의 핵심 도메인 용어인데도 문장이 너무 짧아 벡터가 흐려진 것이다.
#
# ## 왜 앞뒤 문장을 그냥 이어붙이지 않는가
#
# 직전 질문을 앞에 붙여 함께 임베딩하는 안을 먼저 재봤다. 후속 질문은 확실히 살아났지만
# (0.199 → 0.531) **주제 이탈 질문도 똑같이 살아났다** — 직전 턴이 결혼 질문이면
# "오늘 서울 날씨 어때?"가 0.228 → 0.591 로 뛰어 7/7 전부 컷오프를 뚫었다. 두 문장을 합쳐
# 임베딩하면 "무엇을 묻는가"가 아니라 "대화가 어느 주제였나"를 재게 되기 때문이다.
#
# LLM 재작성은 그 함정을 피한다 — 아래 프롬프트의 **"주제를 바꾸지 마라"** 규칙이 핵심이다.
# 실측 8건에서 후속 질문 4/4 는 결혼 질문으로 복원됐고(0.199→0.434, 0.235→0.556,
# 0.234→0.553, 0.218→0.565), 주제 이탈은 재작성 뒤에도 거의 그대로였다("스파게티 맛집
# 알려줘" 0.211→0.198, "오늘 서울 날씨 어때?" 0.228→0.228).
#
# ## 실패 시 원 질문으로 폴백한다
#
# 후속 질문 해소는 **품질 개선**이지 안전장치가 아니다. LLM 호출이 실패하거나 빈 응답이면
# 원 질문 그대로 두고 진행한다 — 여기서 예외를 올리면 "AI 상담이 아예 안 되는" 쪽이 된다.
_FOLLOWUP_RESOLVE_PROMPT = """다음은 결혼 준비 상담 대화다.

{history_block}

이번 질문: {query}

이번 질문을 **그 자체로 이해되는 완전한 질문**으로 다시 써라.
규칙:
- 생략된 대상(그것/그럼/거기/그건)만 앞 대화에서 가져와 채운다.
- **질문의 주제를 바꾸지 마라.** 이번 질문이 앞 대화와 다른 주제면 그 주제 그대로 둔다.
- 설명 없이 다시 쓴 질문 한 문장만 출력한다."""

# 직전 답변은 길어서 그대로 넣으면 프롬프트가 답변 본문에 잠식된다 — 생략된 대상을 찾는 데는
# 앞부분이면 충분하다.
_HISTORY_ANSWER_MAX_CHARS = 400


def build_history_block(history: list[tuple[str, str]]) -> str:
    """[(role, content), ...] → 프롬프트에 넣을 텍스트. 최신이 뒤에 오도록 정렬되어 들어온다."""
    lines = []
    for role, content in history:
        label = "직전 질문" if role == "user" else "직전 답변"
        body = content if role == "user" else content[:_HISTORY_ANSWER_MAX_CHARS]
        lines.append(f"{label}: {body}")
    return "\n".join(lines)


async def resolve_followup_query(
    client: AsyncAzureOpenAI,
    settings: Settings,
    history: list[tuple[str, str]],
    query: str,
) -> str:
    if not history:
        return query
    try:
        response = await client.chat.completions.create(
            model=settings.chat_rag_deployment,
            messages=[
                {
                    "role": "user",
                    "content": _FOLLOWUP_RESOLVE_PROMPT.format(
                        history_block=build_history_block(history), query=query
                    ),
                }
            ],
        )
    except Exception:
        logger.exception("후속 질문 해소 실패 — 원 질문으로 진행한다")
        return query
    resolved = (response.choices[0].message.content or "").strip()
    return resolved or query


async def reformulate_query(
    client: AsyncAzureOpenAI, settings: Settings, query: str, verification_reason: str
) -> str:
    """CRAG(Corrective RAG) 재검색 루프용 질의 재구성 — verify가 WEAK/GENERAL을 낸 이유를
    근거로 검색에 더 적합한 질의를 LLM에게 다시 쓰게 한다. verify_answer와 달리
    response_format으로 JSON을 강제하지 않는다 — 자유 텍스트 검색어 한 줄이면 충분해서
    JSON 강제는 과설계."""
    response = await client.chat.completions.create(
        model=settings.chat_rag_deployment,
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
