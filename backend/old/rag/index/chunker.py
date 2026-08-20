"""청킹: 문단 우선 그리디 누적, 문단 자체가 max_chars를 넘을 때만 문장 경계로 분할.
문장 중간은 절대 자르지 않는다 (브리프코치_RAG_설계서.md §3)."""

import re

# 코퍼스가 정식 문어체(마침표로 끝나는 문장)라 [.!?] 뒤 공백만으로 충분 — 종결어미(다/요) 기준
# 분할은 "이다 그런데"처럼 문장이 아닌 곳에서도 걸릴 위험이 있어 안 씀.
_SENTENCE_BOUNDARY = re.compile(r"(?<=[.!?])\s+")


def split_paragraphs(body_text: str) -> list[str]:
    return [p.strip() for p in re.split(r"\n\s*\n", body_text) if p.strip()]


def split_sentences(paragraph: str) -> list[str]:
    return [s.strip() for s in _SENTENCE_BOUNDARY.split(paragraph) if s.strip()]


def _pack_greedy(units: list[str], min_chars: int, max_chars: int) -> list[str]:
    """단위(문단 또는 문장) 리스트를 max_chars를 넘지 않게 그리디하게 이어붙인다."""
    chunks: list[str] = []
    buffer = ""
    for unit in units:
        candidate = f"{buffer} {unit}".strip() if buffer else unit
        if buffer and len(candidate) > max_chars:
            chunks.append(buffer)
            buffer = unit
        else:
            buffer = candidate
    if buffer:
        chunks.append(buffer)
    return chunks


def chunk_text(body_text: str, min_chars: int, max_chars: int) -> list[str]:
    paragraphs = split_paragraphs(body_text)
    if not paragraphs:
        return []

    # 문단 자체가 max_chars보다 길면(문장 경계 분할 필요), 먼저 그 문단만 문장 단위로 쪼개서
    # 별도 "단위" 목록으로 만든 다음 나머지 문단들과 함께 다시 그리디 패킹한다.
    expanded_units: list[str] = []
    for paragraph in paragraphs:
        if len(paragraph) > max_chars:
            sentences = split_sentences(paragraph)
            expanded_units.extend(_pack_greedy(sentences, min_chars, max_chars))
        else:
            expanded_units.append(paragraph)

    return _pack_greedy(expanded_units, min_chars, max_chars)
