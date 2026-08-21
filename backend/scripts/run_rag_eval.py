"""RAG 골든 질문 21개를 실제 팀 공유 DB에 대고 돌려 채점용 리포트를 만든다
(05_RAG_design.md §8, docs/wedding/ing/rag-golden-questions.md — 카테고리 7개 × 3문항, RAGAS
같은 자동 평가 프레임워크는 과설계라 안 씀).

읽기 전용 실행이다 — app/rag/graph.py의 build_graph()가 rag_chunks만 조회하고 온보딩/채팅
세션 같은 부수 데이터를 만들지 않으므로, 팀 공유 DB에 실행 후 따로 정리할 게 없다.

실행: uv run python scripts/run_rag_eval.py
출력: docs/wedding/ing/rag-eval-results-<날짜>.md(사람이 Recall@5/근거 표시율/환각 여부를
수기 채점하기 좋은 형태 — 질문·답변·인용 청크·검증 결과를 그대로 나열)."""

import asyncio
from pathlib import Path

from app.core.db import get_session_factory
from app.rag.graph import build_graph

_REPO_ROOT = Path(__file__).resolve().parents[2]
_OUTPUT_PATH = _REPO_ROOT / "docs" / "wedding" / "ing" / "rag-eval-results-2026-08-21.md"

# (category_code, question) — docs/wedding/ing/rag-golden-questions.md와 순서·내용 동일.
GOLDEN_QUESTIONS = [
    ("VENUE", "예식장 계약금은 최대 몇 %까지가 정상인가요?"),
    ("VENUE", "예식장 쪽 사정으로 계약이 취소되면 위약금 기준이 어떻게 되나요?"),
    ("VENUE", "예식장 대관 시 최소 보증인원(개런티)은 왜 확인해야 하나요?"),
    ("SDM", "스드메 계약 후 청약철회는 언제까지 가능한가요?"),
    ("SDM", "스튜디오·드레스 취소 위약금은 촬영일에 가까울수록 어떻게 달라지나요?"),
    ("SDM", "드레스 투어 전에 뭘 확인하면 좋은가요?"),
    ("MEETING", "상견례 장소는 어떻게 정하는 게 좋은가요?"),
    ("MEETING", "예물·예단 금액 얘기는 상견례 당일에 하는 게 좋은가요?"),
    ("MEETING", "상견례 전에 신혼집 얘기도 미리 해야 하나요?"),
    ("GIFT", "예물 구매할 때 뭘 받아둬야 하나요?"),
    ("GIFT", "예단은 보통 얼마나 준비하나요?"),
    ("GIFT", "다이아몬드 가격 비교할 때 뭘 봐야 하나요?"),
    ("HOMEWARE", "혼수 가전 살 때 주의할 점이 있나요?"),
    ("HOMEWARE", "혼수는 보통 얼마나 준비하나요?"),
    ("HOMEWARE", "혼수 구매 순서는 어떻게 정하는 게 좋은가요?"),
    ("INVITATION", "청첩장은 언제쯤 발송하는 게 좋은가요?"),
    ("INVITATION", "모바일 청첩장 만들 때 추가 비용이 붙을 수 있나요?"),
    ("INVITATION", "답례품 준비할 때 뭘 확인해야 하나요?"),
    ("HONEYMOON", "신혼여행 평균 비용은 얼마인가요?"),
    ("HONEYMOON", "신혼여행 준비물 중 여권은 언제 확인해야 하나요?"),
    ("HONEYMOON", "신혼여행 예약은 언제쯤 하는 게 좋은가요?"),
]


def _format_result(index: int, category: str, question: str, result: dict) -> str:
    citations = "\n".join(
        f"  - `chunk_id={c.chunk_id}` [{c.source_tier}] {c.title}" for c in result["context"]
    )
    return f"""## {index}. [{category}] {question}

**답변**:
{result["answer"]}

**인용 청크** ({len(result["context"])}개):
{citations or "  (없음)"}

**검증**: `{result["verdict"]}` — {result["verification_reason"]}
"""


async def main() -> None:
    graph = build_graph()
    sections = []

    async with get_session_factory()() as session:
        for i, (category, question) in enumerate(GOLDEN_QUESTIONS, start=1):
            result = await graph.ainvoke(
                {"query": question, "category_code": category},
                config={"configurable": {"session": session}},
            )
            sections.append(_format_result(i, category, question, result))
            print(f"[{i}/21] {category}: {question[:30]}... -> {result['verdict']}")

    report = (
        "# RAG 골든 질문 21개 실행 결과 (2026-08-21)\n\n"
        "> `run_rag_eval.py` 실행 결과. Recall@5/근거 표시율/환각 여부(1~3점)는 사람이 직접 "
        "채점한다(`docs/wedding/ing/rag-golden-questions.md`의 '기대 근거'와 대조).\n\n"
        + "\n---\n\n".join(sections)
    )
    _OUTPUT_PATH.write_text(report, encoding="utf-8")
    print(f"\n리포트 저장: {_OUTPUT_PATH.relative_to(_REPO_ROOT)}")


if __name__ == "__main__":
    asyncio.run(main())
