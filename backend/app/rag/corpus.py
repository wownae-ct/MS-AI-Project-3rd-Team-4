"""data/rag_corpus/<DATASET_CODE>/*.json 파서. 파일 하나 = rag_documents 한 행, `chunks` 배열의
원소 하나 = rag_chunks 한 행. 스키마는 data/README.md 참고.

과거엔 마크다운(YAML 프론트매터 + HTML 주석 청크)이었으나 2026-08-21 JSON으로 전환했다 —
YAML 프론트매터의 자유 텍스트에 콜론(:)이 섞이면 파싱이 깨지는 실제 버그를 겪은 뒤, 형식이 더
엄격한 JSON으로 옮기는 게 낫다고 판단했다(변환 스크립트: backend/scripts/corpus_md_to_json.py).
코퍼스는 이미 청크 단위로 정제돼 있으므로 여기서 동적 청킹은 하지 않고 파싱만 한다."""

import json
from dataclasses import dataclass
from datetime import date
from pathlib import Path


@dataclass(frozen=True)
class ParsedChunk:
    chunk_index: int
    category_codes: list[str]
    item_type: str | None
    source_url: str | None
    content: str


@dataclass(frozen=True)
class ParsedDocument:
    dataset_code: str
    title: str
    source_tier: str
    source_org: str | None
    source_url: str | None
    published_at: date | None
    license_note: str | None
    category_codes: list[str] | None
    chunks: list[ParsedChunk]
    source_path: Path


def _parse_chunk(raw: dict, path: Path) -> ParsedChunk:
    if "chunk_index" not in raw:
        raise ValueError(f"{path}: 청크에 chunk_index 누락 — {raw!r}")
    if not raw.get("content"):
        raise ValueError(f"{path}: chunk_index={raw['chunk_index']} content가 비어 있음")
    return ParsedChunk(
        chunk_index=raw["chunk_index"],
        category_codes=raw.get("category_codes") or [],
        item_type=raw.get("item_type"),
        source_url=raw.get("source_url"),
        content=raw["content"],
    )


def parse_document(path: Path) -> ParsedDocument:
    raw = json.loads(path.read_text(encoding="utf-8"))

    required = ("dataset_code", "title", "source_tier", "chunks")
    missing = [f for f in required if not raw.get(f)]
    if missing:
        raise ValueError(f"{path}: 필수 필드 누락: {missing}")

    chunks = [_parse_chunk(c, path) for c in raw["chunks"]]
    seen_indices = [c.chunk_index for c in chunks]
    if len(set(seen_indices)) != len(seen_indices):
        raise ValueError(f"{path}: chunk_index 중복 — {seen_indices}")

    return ParsedDocument(
        dataset_code=raw["dataset_code"],
        title=raw["title"],
        source_tier=raw["source_tier"],
        source_org=raw.get("source_org"),
        source_url=raw.get("source_url"),
        published_at=date.fromisoformat(raw["published_at"]) if raw.get("published_at") else None,
        license_note=raw.get("license_note"),
        category_codes=raw.get("category_codes"),
        chunks=sorted(chunks, key=lambda c: c.chunk_index),
        source_path=path,
    )


def load_corpus(root: Path) -> list[ParsedDocument]:
    """root(data/rag_corpus/) 아래 <DATASET_CODE>/*.json 전체를 파싱한다. 하위 디렉터리 1단계
    구조만 지원 — 10_RAG_data_catalog.md가 정한 레이아웃과 일치(DS1_PRICE·DS7_TIMELINE은 RAG
    코퍼스 대상이 아니라 애초에 여기 디렉터리가 없다)."""
    paths = sorted(root.glob("*/*.json"))
    if not paths:
        raise ValueError(f"{root}: RAG 코퍼스 JSON 파일을 찾지 못함")
    return [parse_document(p) for p in paths]
