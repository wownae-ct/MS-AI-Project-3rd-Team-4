"""사용자 질의를 트레이싱용으로 분류한다 — 답변 품질 자체엔 영향을 주지 않는 순수 관측 로직.

[[2026-08-24-hybrid-retrieval-short-query-ranking-bias]]에서 재현된 실패 모드를 트레이스에서
빠르게 골라내기 위한 태그다: 2~3어절의 키워드형 짧은 질의("웨딩홀 계약 시점", "위약금 비율")에서
하이브리드 검색이 니치 사실보다 범용 대형 문서(체크리스트 85항목, UGC 후기)를 상위로 올리는
편향이 확인됐고, 문장형 자연어 질의에선 상당 부분 상쇄됐다. 검색 로직을 바꾸는 게 아니라
"의심스러운 케이스에 표시만 남긴다".

Langfuse 대시보드 위젯/메트릭 쿼리는 OTel 표준 필드만 지원해 커스텀 메타데이터를 차원으로 쓸 수
없다(2026-08-24-langfuse-tracing-completion.md §"한계", 실측 확인) — 그래서 이 모듈이 만드는
`tags`는 "대시보드 집계"가 아니라 "트레이스 목록에서 태그로 필터링해 문제 사례를 빠르게 여는 것"
용도다(app/core/tracing.py::traced_span의 tags= → langfuse.propagate_attributes(tags=...)로
트레이스 레벨에 붙어 목록 필터가 가능해진다).

app/rag/retrieval.py의 F9 계약조건 가산점(_CONTRACT_TERM_BONUS)이 쓰던 키워드 판별 함수를 여기로
옮겨왔다 — 질의 분류 로직을 한 곳에 모으고, retrieval.py(임베딩/DB 세션에 의존하는 무거운 모듈)를
서비스/그래프 레이어가 이 순수 분류만을 위해 끌어오지 않게 하기 위해서다(retrieval.py가 이
모듈을 거꾸로 참조한다)."""

from dataclasses import dataclass
from typing import Any

# 임계값 근거: 위 문서에서 편향이 재현된 실제 질의가 2어절("위약금 비율")과 3어절
# ("웨딩홀 계약 시점")이었다. 4어절부터는 조사/서술어가 붙은 문장형에 가까워져 편향이 관측되지
# 않았다(예: "웨딩홀 계약은 보통 언제쯤 해야 하나요?"). 운영 중 조정할 튜닝 노브가 아니라 특정
# 관측 사례에 묶인 휴리스틱이라 Settings가 아닌 모듈 상수로 둔다.
SHORT_QUERY_MAX_TOKENS = 3

TAG_SHORT_QUERY = "short_query"
TAG_CONTRACT_TERM = "contract_term_query"

# F9: 질문이 이 키워드를 포함하면 계약조건(item_type='CONTRACT_TERM') 청크에 RRF 점수를
# 가산한다(가산 자체는 app/rag/retrieval.py에 남아 있다 — 검색 랭킹 가중치는 질의 분류값이 아님).
_CONTRACT_TERM_KEYWORDS = ("계약", "위약금", "해지")


def needs_contract_term_bonus(query: str) -> bool:
    return any(keyword in query for keyword in _CONTRACT_TERM_KEYWORDS)


@dataclass(frozen=True)
class QueryProfile:
    token_count: int
    char_length: int
    tags: tuple[str, ...]

    def as_metadata(self) -> dict[str, Any]:
        """observation(span) 레벨 메타데이터로 넣을 진단용 수치 — 태그는 트레이스 레벨
        속성(traced_span의 tags=)으로 이미 전파되므로 여기 다시 넣지 않는다."""
        return {"query_token_count": self.token_count, "query_char_length": self.char_length}


def profile_query(query: str) -> QueryProfile:
    tokens = query.split()
    tags: list[str] = []
    if len(tokens) <= SHORT_QUERY_MAX_TOKENS:
        tags.append(TAG_SHORT_QUERY)
    if needs_contract_term_bonus(query):
        tags.append(TAG_CONTRACT_TERM)
    return QueryProfile(token_count=len(tokens), char_length=len(query.strip()), tags=tuple(tags))
