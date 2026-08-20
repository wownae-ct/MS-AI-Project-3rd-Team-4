import pytest
from rag.index.assemble import build_insertable_docs
from rag.index.corpus import ParsedDoc


def _doc(doc_number: int) -> ParsedDoc:
    return ParsedDoc(
        doc_number=doc_number,
        category="카테고리",
        title=f"제목{doc_number}",
        source_note=None,
        source_url=None,
        body_text="본문",
    )


def _fake_embedding(text: str) -> list[float]:
    # 청크 텍스트 자체를 임베딩 값에 새겨 넣어서, 재조립 후 "이 청크가 원래 자기 임베딩과
    # 정확히 매칭되는지"를 값만 보고 바로 확인할 수 있게 한다(오프셋이 하나라도 어긋나면
    # 엉뚱한 문서의 임베딩이 섞여 들어와 이 매칭이 깨짐).
    return [float(hash(text) % 1000)]


def test_build_insertable_docs_assigns_correct_embedding_per_chunk_across_docs_of_different_sizes():
    doc_a, doc_b, doc_c = _doc(1), _doc(2), _doc(3)
    chunks_a = ["a-chunk-0"]
    chunks_b = ["b-chunk-0", "b-chunk-1", "b-chunk-2"]
    chunks_c = ["c-chunk-0", "c-chunk-1"]
    chunked = [(doc_a, chunks_a), (doc_b, chunks_b), (doc_c, chunks_c)]

    all_texts = chunks_a + chunks_b + chunks_c
    embeddings = [_fake_embedding(t) for t in all_texts]

    result = build_insertable_docs(chunked, embeddings)

    assert [d.doc_number for d in result] == [1, 2, 3]
    assert len(result[0].chunks) == 1
    assert len(result[1].chunks) == 3
    assert len(result[2].chunks) == 2

    for insertable_doc, original_texts in zip(result, [chunks_a, chunks_b, chunks_c]):
        for chunk, original_text in zip(insertable_doc.chunks, original_texts):
            assert chunk.chunk_text == original_text
            assert chunk.embedding == _fake_embedding(original_text)


def test_build_insertable_docs_chunk_index_is_sequential_per_doc():
    doc = _doc(1)
    chunked = [(doc, ["t0", "t1", "t2"])]
    embeddings = [_fake_embedding(t) for t in ["t0", "t1", "t2"]]

    result = build_insertable_docs(chunked, embeddings)

    assert [c.chunk_index for c in result[0].chunks] == [0, 1, 2]


def test_build_insertable_docs_embedding_count_mismatch_raises():
    doc = _doc(1)
    chunked = [(doc, ["t0", "t1"])]
    embeddings = [_fake_embedding("t0")]  # 청크 2개인데 임베딩 1개만 옴

    with pytest.raises(ValueError, match="임베딩 개수 불일치"):
        build_insertable_docs(chunked, embeddings)
