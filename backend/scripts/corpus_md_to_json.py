"""data/rag_corpus/**/*.md(구 포맷: YAML 프론트매터+HTML 주석 청크) → **/*.json(신 포맷) 변환.
2026-08-21 코퍼스 포맷을 마크다운에서 JSON으로 옮기면서 쓴 변환 스크립트다. 앞으로 새 코퍼스
문서는 .json으로 바로 작성하면 되니 재실행할 일은 거의 없지만, "어떻게 변환했는지"를 코드로
재현 가능하게 남겨둔다 — 그래서 backend/app/rag/corpus.py(현재는 .json만 읽는 런타임 파서)에
기대지 않고, 마크다운 파싱 로직을 이 파일 안에 그대로 담아 독립 실행 가능하게 했다.

content 필드의 줄바꿈(\\n)/탭(\\t)/마크다운 헤딩(#)을 전부 제거해 한 줄 문장으로 정리한다.
청크에 category_code가 명시돼 있지 않으면(문서 전체가 여러 카테고리에 걸치는 일반 자료라서)
문서의 category_codes 전체를 그 청크의 category_codes로 채운다 — rag_chunks.category_code를
TEXT에서 TEXT[](배열)로 바꾸기로 한 결정(2026-08-21)에 따른 것."""

import json
import re
from dataclasses import dataclass
from datetime import date
from pathlib import Path

import yaml

_REPO_ROOT = Path(__file__).resolve().parents[2]
_CORPUS_ROOT = _REPO_ROOT / "data" / "rag_corpus"

_CHUNK_META_PATTERN = re.compile(r"<!--(.*?)-->", re.DOTALL)
_CHUNK_SEPARATOR = re.compile(r"\n-{3,}\n")
_HEADING_PREFIX = re.compile(r"(?m)^#{1,6}\s+")
_WHITESPACE = re.compile(r"\s+")


@dataclass(frozen=True)
class ParsedChunk:
    chunk_index: int
    category_code: str | None
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


def _parse_frontmatter(text: str, path: Path) -> tuple[dict, str]:
    if not text.startswith("---"):
        raise ValueError(f"{path}: YAML 프론트매터가 '---'로 시작하지 않음")
    parts = text.split("---", 2)
    if len(parts) != 3:
        raise ValueError(f"{path}: 프론트매터 구분자('---') 2개를 찾지 못함")
    frontmatter = yaml.safe_load(parts[1]) or {}
    return frontmatter, parts[2].strip()


def _parse_chunk_meta(comment_body: str, path: Path, block_preview: str) -> dict[str, str]:
    meta: dict[str, str] = {}
    for part in comment_body.strip().split(","):
        if ":" not in part:
            continue
        key, _, value = part.partition(":")
        meta[key.strip()] = value.strip()
    if "chunk_index" not in meta:
        raise ValueError(f"{path}: chunk_index 누락 — {block_preview!r}")
    return meta


def _meta_value(meta: dict[str, str], key: str) -> str | None:
    # 마크다운 코퍼스는 YAML이 아니라 사람이 손으로 쓴 HTML 주석이라 "null"이 파이썬 None이
    # 아니라 글자 그대로 "null" 문자열로 들어올 수 있다(예: DS8_UGC의 `source_url: null`).
    value = meta.get(key)
    if not value or value == "null":
        return None
    return value


def _parse_chunk(block: str, path: Path) -> ParsedChunk:
    match = _CHUNK_META_PATTERN.search(block)
    if not match:
        raise ValueError(f"{path}: 청크 메타 주석(<!-- chunk_index: ... -->) 없음 — {block[:80]!r}")
    meta = _parse_chunk_meta(match.group(1), path, block[:80])
    content = _CHUNK_META_PATTERN.sub("", block, count=1).strip()
    if not content:
        raise ValueError(f"{path}: chunk_index={meta['chunk_index']} 본문이 비어 있음")
    return ParsedChunk(
        chunk_index=int(meta["chunk_index"]),
        category_code=_meta_value(meta, "category_code"),
        item_type=_meta_value(meta, "item_type"),
        source_url=_meta_value(meta, "source_url"),
        content=content,
    )


def parse_document(path: Path) -> ParsedDocument:
    text = path.read_text(encoding="utf-8")
    frontmatter, body = _parse_frontmatter(text, path)

    required = ("dataset_code", "title", "source_tier")
    missing = [f for f in required if not frontmatter.get(f)]
    if missing:
        raise ValueError(f"{path}: 프론트매터 필수 필드 누락: {missing}")

    blocks = [b.strip() for b in _CHUNK_SEPARATOR.split(body) if b.strip()]
    if not blocks:
        raise ValueError(f"{path}: 청크 블록이 하나도 없음")
    chunks = [_parse_chunk(b, path) for b in blocks]

    seen_indices = [c.chunk_index for c in chunks]
    if len(set(seen_indices)) != len(seen_indices):
        raise ValueError(f"{path}: chunk_index 중복 — {seen_indices}")

    return ParsedDocument(
        dataset_code=frontmatter["dataset_code"],
        title=frontmatter["title"],
        source_tier=frontmatter["source_tier"],
        source_org=frontmatter.get("source_org") or None,
        source_url=frontmatter.get("source_url") or None,
        published_at=frontmatter.get("published_at") or None,
        license_note=frontmatter.get("license_note") or None,
        category_codes=frontmatter.get("category_codes") or None,
        chunks=sorted(chunks, key=lambda c: c.chunk_index),
        source_path=path,
    )


def load_markdown_corpus(root: Path) -> list[ParsedDocument]:
    paths = sorted(root.glob("*/*.md"))
    if not paths:
        raise ValueError(f"{root}: RAG 코퍼스 마크다운 파일을 찾지 못함")
    return [parse_document(p) for p in paths]


def flatten_content(content: str) -> str:
    text = _HEADING_PREFIX.sub("", content)
    return _WHITESPACE.sub(" ", text).strip()


def _resolve_chunk_categories(
    chunk_category_code: str | None, doc_category_codes: list[str] | None
) -> list[str]:
    if chunk_category_code:
        return [chunk_category_code]
    return doc_category_codes or []


def document_to_dict(doc: ParsedDocument) -> dict:
    return {
        "dataset_code": doc.dataset_code,
        "title": doc.title,
        "source_tier": doc.source_tier,
        "source_org": doc.source_org,
        "source_url": doc.source_url,
        "published_at": doc.published_at.isoformat() if doc.published_at else None,
        "license_note": doc.license_note,
        "category_codes": doc.category_codes,
        "chunks": [
            {
                "chunk_index": chunk.chunk_index,
                "category_codes": _resolve_chunk_categories(
                    chunk.category_code, doc.category_codes
                ),
                "item_type": chunk.item_type,
                "source_url": chunk.source_url,
                "content": flatten_content(chunk.content),
            }
            for chunk in doc.chunks
        ],
    }


def main() -> None:
    documents = load_markdown_corpus(_CORPUS_ROOT)
    for doc in documents:
        out_path = doc.source_path.with_suffix(".json")
        out_path.write_text(
            json.dumps(document_to_dict(doc), ensure_ascii=False, indent=2) + "\n",
            encoding="utf-8",
        )
        print(f"wrote {out_path.relative_to(_REPO_ROOT)} ({len(doc.chunks)} chunks)")


if __name__ == "__main__":
    main()
