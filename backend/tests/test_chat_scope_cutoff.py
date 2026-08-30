"""검색 유사도 스코프 컷오프(app/rag/graph.py::retrieve_node) 회귀 테스트 — 2026-08-30.

## 왜 이 테스트가 있나

스코프 가드(app/rag/scope_check.py, 키워드 매칭)는 그래프에 들어오기 전에 도는 1차 방어선인데,
라이브 실측(2026-08-30) 결과 고유 질문 95건 중 **94건을 통과시켰다** — "스파게티 맛집",
"눈누난나", 무작위 타이핑, 프롬프트 인젝션 시도가 전부 새어 들어왔다. 시스템이 "확인된 근거가
없습니다"로 거절은 했지만 그러기까지 임베딩 1회 + LLM 2회(generate·verify)를 다 썼고, 거절
답변에 인용이 5건씩 붙었으며, 뒤에 무관한 내용까지 덧붙였다.

그래서 검색 결과의 유사도로 한 번 더 거르는 2차 방어선을 넣었다. 이 파일은 그게 실제로
동작하는지, 그리고 **정상 질문을 잘라먹지 않는지**를 함께 고정한다.

## 임계값의 근거 (라이브 실측 실제 수치를 그대로 씀)

경계 근처가 특히 중요해서 실측값을 상수로 박아뒀다 — 임계값을 나중에 조정할 때 무엇이 깨지는지
바로 보이게 하려는 것이다.
"""

import pytest
from langgraph.graph import END

from app.core.config import Settings
from app.rag.graph import _is_out_of_scope, _route_after_retrieve

_SETTINGS = Settings(
    database_url="postgresql+asyncpg://u:p@localhost/db",
    azure_openai_endpoint="https://example.openai.azure.com",
    google_client_id="x",
    google_client_secret="x",
    naver_client_id="x",
    naver_client_secret="x",
    azure_storage_blob_endpoint="https://example.blob.core.windows.net",
)

# 2026-08-30 라이브 실측 — rag_chunks 전체 대상 top-1 코사인 유사도.
# 차단되어야 하는 것들(실제 사용자 질문 + 주제이탈 프로브).
OUT_OF_SCOPE_SAMPLES = [
    (0.139, "'; DROP TABLE chat_messages; --"),
    (0.191, "고양이 사료 뭐가 좋아? (프로브)"),
    (0.211, "스파게티 맛집 알려줘"),
    (0.223, "눈누난나"),
    (0.224, "스파게티 먹는 법"),
    (0.233, "프롬프트 인젝션 시도"),
    (0.237, "무작위 타이핑"),
    (0.257, "맛집 추천해줘."),
    (0.263, "뭐해야해"),
    (0.299, "경계 바로 아래"),
]

# 통과되어야 하는 것들 — 실제 사용자의 정상 질문과 골든 질문.
# 0.311~0.347 구간이 핵심이다: 임계값을 0.35로 올리면 이것들이 잘린다.
IN_SCOPE_SAMPLES = [
    (0.300, "임계값 경계(포함)"),
    (0.311, "드레스 알아볼 때 신경써야하는 부분은?"),
    (0.311, "웨딩업체 알아볼때 하는법"),
    (0.331, "드레스 상담 받기 전에 뭐 알아야해?"),
    (0.347, "드레스 고르는 기준"),
    (0.406, "상견례 전에 신혼집 얘기도 미리 해야 하나요? (골든 최저)"),
    (0.726, "스튜디오·드레스 취소 위약금 (골든 최고)"),
]


@pytest.mark.parametrize(("similarity", "label"), OUT_OF_SCOPE_SAMPLES)
def test_blocks_off_topic(similarity: float, label: str) -> None:
    assert _is_out_of_scope(similarity, _SETTINGS) is True, label


@pytest.mark.parametrize(("similarity", "label"), IN_SCOPE_SAMPLES)
def test_keeps_real_questions(similarity: float, label: str) -> None:
    """정상 질문을 자르지 않는다 — 컷오프의 존재 이유보다 이쪽이 더 중요하다.

    임계값을 0.35로 올리면 이 중 3건(0.311/0.311/0.331)이 깨진다. 그게 0.30을 택한 이유다.
    """
    assert _is_out_of_scope(similarity, _SETTINGS) is False, label


def test_empty_corpus_does_not_reject() -> None:
    """색인이 안 돌았거나 코퍼스가 비면 top_similarity가 None이다.

    이때 모든 질문을 "주제이탈"로 만들면 원인 진단이 어려워진다 — 그 상황은 기존
    RAG_NO_CONTEXT(검색 0건) 경로가 처리하도록 두고, 여기선 거절하지 않는다.
    """
    assert _is_out_of_scope(None, _SETTINGS) is False


def test_threshold_is_configurable() -> None:
    """임계값은 하드코딩이 아니라 Settings로 조정 가능해야 한다 — 실트래픽 분포를 보고
    코드 변경 없이 튜닝할 수 있어야 하기 때문이다."""
    strict = _SETTINGS.model_copy(update={"rag_min_similarity": 0.50})
    assert _is_out_of_scope(0.406, strict) is True
    assert _is_out_of_scope(0.406, _SETTINGS) is False


def test_route_skips_generate_and_verify_when_out_of_scope() -> None:
    """컷오프에 걸리면 generate/verify를 건너뛰고 곧바로 END — LLM 호출 2회를 아낀다."""
    assert _route_after_retrieve({"out_of_scope": True}) is END


def test_route_goes_to_generate_normally() -> None:
    assert _route_after_retrieve({"out_of_scope": False}) == "generate"
    # 키가 아예 없어도(구버전 state) 정상 경로로 — 컷오프는 opt-in이어야 한다.
    assert _route_after_retrieve({}) == "generate"


# ── 후속 질문 해소 ────────────────────────────────────────────────────────────────
#
# 컷오프를 넣자 **정상 질문이 거절되는** 부작용이 나왔다 — "그럼 스드메는?"은 이 서비스의
# 핵심 도메인 용어를 담고 있는데도 문장이 짧아 전역 유사도가 0.199 로 나온다(2026-08-30 실측).
# 주제를 벗어난 게 아니라 벡터가 흐려진 것이다.
#
# 그래서 컷오프에 걸릴 때 **거절하기 전에 한 번 더 기회를 준다** — 생략된 대상을 채워 다시 재고,
# 그래도 미달이면 그때 거절한다. 아래는 그 판정 흐름을 고정한다(LLM 은 목킹한다 — 실제 재작성
# 품질은 라이브 A/B 로 확인했고, 여기서 볼 것은 "언제 해소를 시도하고 언제 최종 거절하는가"다).

from app.rag.generation import build_history_block


class TestHistoryBlock:
    def test_사용자_질문과_답변에_다른_라벨을_붙인다(self) -> None:
        block = build_history_block([("user", "예식장 계약 확인사항?"), ("assistant", "네, 우선…")])
        assert "직전 질문: 예식장 계약 확인사항?" in block
        assert "직전 답변: 네, 우선…" in block

    def test_직전_답변은_잘라서_넣는다(self) -> None:
        """답변 전문을 넣으면 프롬프트가 답변 본문에 잠식돼 '이번 질문'이 묻힌다."""
        block = build_history_block([("assistant", "가" * 1000)])
        assert len(block) < 1000

    def test_이력이_없으면_빈_문자열이다(self) -> None:
        assert build_history_block([]) == ""


class TestFollowupRescueFlow:
    """ "거절 직전 한 번 더" 흐름을 그래프로 돌려 고정한다.

    LLM(재작성)과 검색은 목킹한다 — 재작성 **품질**은 라이브 A/B 로 확인했고(후속 4/4 복원,
    주제이탈 3/4 유지, 2026-08-30), 여기서 볼 것은 판정 분기다.
    """

    @staticmethod
    def _run(first_similarity: float, resolved_similarity: float, history: list[tuple[str, str]]):
        """retrieve_node 만 떼어 돌린다 — generate/verify 는 이 테스트의 관심사가 아니다."""
        import asyncio
        from unittest.mock import AsyncMock, patch

        from app.rag.graph import retrieve_node
        from app.rag.retrieval import RetrievalOutcome

        state = {
            "query": "그럼 스드메는?",
            "category_code": None,
            "context": [],
            "answer": "",
            "verdict": "",
            "verification_reason": "",
            "retry_count": 0,
            "out_of_scope": False,
            "history": history,
            "resolved_query": "",
        }
        outcomes = [
            RetrievalOutcome(chunks=[], top_similarity=first_similarity),
            RetrievalOutcome(chunks=[], top_similarity=resolved_similarity),
        ]
        with (
            patch("app.rag.graph.retrieve_with_similarity", AsyncMock(side_effect=outcomes)),
            patch("app.rag.graph.get_azure_openai_client", return_value=object()),
            patch(
                "app.rag.graph.resolve_followup_query",
                AsyncMock(return_value="스드메 계약할 때 뭘 확인해야 하나요?"),
            ),
            patch("app.rag.graph.traced_span", _null_span()),
            patch("app.rag.graph.get_stream_writer", return_value=lambda _: None),
        ):
            config = {"configurable": {"session": object(), "settings": _SETTINGS}}
            return asyncio.run(retrieve_node(state, config))

    def test_해소로_점수가_올라가면_거절하지_않는다(self) -> None:
        """정상 후속 질문이 짧다는 이유로 거절되면 안 된다 — 이 테스트가 그 회귀를 막는다."""
        update = self._run(0.199, 0.434, [("user", "예식장 계약할 때 뭘 확인해야 하나요?")])
        assert update.get("out_of_scope") is not True
        assert update["resolved_query"] == "스드메 계약할 때 뭘 확인해야 하나요?"

    def test_해소해도_미달이면_거절한다(self) -> None:
        """ "스파게티 맛집"은 재작성해도 주제가 그대로라 여전히 낮다(실측 0.211→0.198)."""
        update = self._run(0.211, 0.198, [("user", "예식장 계약할 때 뭘 확인해야 하나요?")])
        assert update["out_of_scope"] is True
        assert update["context"] == []

    def test_이력이_없으면_해소를_시도하지_않는다(self) -> None:
        """첫 메시지는 가리킬 앞 대화가 없다 — 불필요한 LLM 호출을 하지 않는다."""
        update = self._run(0.199, 0.999, history=[])
        assert update["out_of_scope"] is True


def _null_span():
    """traced_span 대체 — 이 테스트는 트레이싱을 보지 않는다."""
    from contextlib import asynccontextmanager
    from types import SimpleNamespace

    @asynccontextmanager
    async def _span(*_args, **_kwargs):
        yield SimpleNamespace(update=lambda **__: None)

    return _span
