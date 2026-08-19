"""data/rag_corpus/speech_guide_corpus.json 로더. 코퍼스는 단일 JSON 배열로 git 추적되는
정식 소스라(브리프코치_RAG_설계서.md 기준 1회성으로 사람이 작성) 마크다운 파싱 로직은 없다 —
json.load()와 스키마 검증뿐이다."""

import json
import re
from dataclasses import dataclass
from pathlib import Path

_REQUIRED_FIELDS = ("doc_number", "category", "title", "source", "body_text")
_URL_PATTERN = re.compile(r"https?://\S+")


@dataclass(frozen=True)
class ParsedDoc:
    doc_number: int
    category: str
    title: str
    source_note: str | None
    source_url: str | None
    body_text: str


def extract_url(source: str | None) -> str | None:
    if not source:
        return None
    match = _URL_PATTERN.search(source)
    return match.group(0) if match else None


def load_corpus(path: Path) -> list[ParsedDoc]:
    raw = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(raw, list):
        raise TypeError(f"코퍼스 JSON은 배열이어야 함: {path}")

    docs: list[ParsedDoc] = []
    seen_doc_numbers: set[int] = set()
    for i, entry in enumerate(raw):
        missing = [f for f in _REQUIRED_FIELDS if f not in entry]
        if missing:
            raise ValueError(
                f"코퍼스 항목 {i}번(doc_number={entry.get('doc_number')})에 필수 필드 누락: {missing}"
            )

        doc_number = entry["doc_number"]
        if doc_number in seen_doc_numbers:
            raise ValueError(f"doc_number 중복: {doc_number}")
        seen_doc_numbers.add(doc_number)

        source = entry["source"]
        docs.append(
            ParsedDoc(
                doc_number=doc_number,
                category=entry["category"],
                title=entry["title"],
                source_note=source,
                source_url=extract_url(source),
                body_text=entry["body_text"],
            )
        )
    return docs
