"""청크 텍스트 + 평탄화된 임베딩 리스트를 문서별 InsertableDoc으로 재조립한다. 가장 실수하기
쉬운 지점 — 문서마다 청크 개수가 다른데, 오프셋 계산이 틀리면 A 문서 청크에 B 문서 임베딩이
붙는 조용한 버그가 생긴다(에러 없이 검색 결과만 미묘하게 이상해짐). token_count(tiktoken)도
여기서 계산한다."""

from dataclasses import dataclass

import tiktoken

from rag.index.corpus import ParsedDoc

_TOKEN_ENCODING = tiktoken.get_encoding("cl100k_base")


@dataclass(frozen=True)
class InsertableChunk:
    chunk_index: int
    chunk_text: str
    embedding: list[float]
    token_count: int


@dataclass(frozen=True)
class InsertableDoc:
    doc_number: int
    title: str
    source_url: str | None
    source_note: str | None
    body_text: str
    category: str | None
    chunks: list[InsertableChunk]


def build_insertable_docs(
    chunked: list[tuple[ParsedDoc, list[str]]], embeddings: list[list[float]]
) -> list[InsertableDoc]:
    result: list[InsertableDoc] = []
    offset = 0
    for doc, chunk_texts in chunked:
        doc_embeddings = embeddings[offset : offset + len(chunk_texts)]
        offset += len(chunk_texts)
        chunks = [
            InsertableChunk(i, text, emb, len(_TOKEN_ENCODING.encode(text)))
            for i, (text, emb) in enumerate(zip(chunk_texts, doc_embeddings))
        ]
        result.append(
            InsertableDoc(
                doc.doc_number,
                doc.title,
                doc.source_url,
                doc.source_note,
                doc.body_text,
                doc.category,
                chunks,
            )
        )

    if offset != len(embeddings):
        # assert 아님 — python -O로 최적화 실행하면 assert는 통째로 사라짐. 이건 "디버깅용 내부
        # 불변식"이 아니라 "외부 API 응답이 기대와 맞는지"를 검증하는 방어 로직이라 프로덕션에서도
        # 절대 안 꺼지는 명시적 예외로 가야 함 — 조용한 데이터 오염을 막는 마지막 방어선.
        raise ValueError(
            f"임베딩 개수 불일치: 청크 {offset}개인데 임베딩 {len(embeddings)}개 반환됨"
        )

    return result
