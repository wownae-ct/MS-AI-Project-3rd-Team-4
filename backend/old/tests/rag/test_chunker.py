from rag.index.chunker import chunk_text

MIN_CHARS = 300
MAX_CHARS = 500


def test_single_paragraph_under_max_is_one_chunk():
    body = "가" * 400
    chunks = chunk_text(body, MIN_CHARS, MAX_CHARS)
    assert chunks == [body]


def test_single_paragraph_exactly_max_is_one_chunk():
    body = "가" * 500
    chunks = chunk_text(body, MIN_CHARS, MAX_CHARS)
    assert chunks == [body]


def test_paragraph_over_max_splits_on_sentence_boundary_only():
    sentence = "이것은 예시 문장입니다."  # 12자
    body = " ".join([sentence] * 45)  # 45문장 * 13자(공백 포함) ≈ 585자 > 500
    assert len(body) > MAX_CHARS

    chunks = chunk_text(body, MIN_CHARS, MAX_CHARS)

    assert len(chunks) >= 2
    for chunk in chunks[:-1]:
        # 마지막 청크를 제외하고, 매 청크가 문장 종결부호로 끝나야 함(문장 중간 절단 없음)
        assert chunk.rstrip().endswith(".")
    assert all(len(c) <= MAX_CHARS for c in chunks[:-1])
    # 원문이 그대로 보존되는지(문장 유실 없음)
    assert "".join(chunks).replace(" ", "") == body.replace(" ", "")


def test_multi_paragraph_body_preserves_paragraph_integrity():
    p1 = "첫 번째 문단입니다. 짧습니다."
    p2 = "두 번째 문단입니다. 이것도 짧습니다."
    p3 = "세 번째 문단입니다."
    body = f"{p1}\n\n{p2}\n\n{p3}"

    chunks = chunk_text(body, MIN_CHARS, MAX_CHARS)

    # 문단 중 어느 것도 청크 경계에서 쪼개지지 않아야 함 — 각 문단 전체가 어떤 청크엔가 통째로 포함
    joined = " ".join(chunks)
    for p in (p1, p2, p3):
        assert p in joined


def test_no_sentence_boundary_extreme_case_emits_oversized_chunk():
    body = "가" * 600  # 문장 경계(마침표 등)가 전혀 없는 600자 단일 덩어리
    chunks = chunk_text(body, MIN_CHARS, MAX_CHARS)
    # 문장 경계가 없으면 크기 제한보다 "문장 중간 절단 금지"가 우선 — 통째로 1개 청크로 나옴
    assert chunks == [body]


def test_empty_body_returns_no_chunks():
    assert chunk_text("", MIN_CHARS, MAX_CHARS) == []
