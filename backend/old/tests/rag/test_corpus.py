import json

import pytest
from rag.index.corpus import extract_url, load_corpus


def _write_corpus(tmp_path, entries):
    path = tmp_path / "corpus.json"
    path.write_text(json.dumps(entries), encoding="utf-8")
    return path


def test_load_corpus_parses_valid_entries(tmp_path):
    entries = [
        {
            "doc_number": 1,
            "category": "두괄식",
            "title": "제목1",
            "source": None,
            "body_text": "본문1",
        },
        {
            "doc_number": 2,
            "category": "STAR",
            "title": "제목2",
            "source": "국립국어원",
            "body_text": "본문2",
        },
    ]
    path = _write_corpus(tmp_path, entries)

    docs = load_corpus(path)

    assert len(docs) == 2
    assert docs[0].doc_number == 1
    assert docs[0].source_note is None
    assert docs[1].source_note == "국립국어원"


def test_load_corpus_missing_required_field_raises(tmp_path):
    entries = [
        {"doc_number": 1, "category": "두괄식", "title": "제목1", "body_text": "본문1"}
    ]  # source 누락
    path = _write_corpus(tmp_path, entries)

    with pytest.raises(ValueError, match="필수 필드 누락"):
        load_corpus(path)


def test_load_corpus_duplicate_doc_number_raises(tmp_path):
    entries = [
        {
            "doc_number": 1,
            "category": "두괄식",
            "title": "제목1",
            "source": None,
            "body_text": "본문1",
        },
        {
            "doc_number": 1,
            "category": "STAR",
            "title": "제목2",
            "source": None,
            "body_text": "본문2",
        },
    ]
    path = _write_corpus(tmp_path, entries)

    with pytest.raises(ValueError, match="doc_number 중복"):
        load_corpus(path)


def test_load_corpus_is_not_array_raises(tmp_path):
    path = tmp_path / "corpus.json"
    path.write_text(json.dumps({"doc_number": 1}), encoding="utf-8")

    with pytest.raises(TypeError, match="배열이어야"):
        load_corpus(path)


@pytest.mark.parametrize(
    ("source", "expected"),
    [
        (None, None),
        ("국립국어원 표준국어대사전 — 두괄식 표제어", None),
        ("자세한 내용은 https://example.com/guide 참고", "https://example.com/guide"),
    ],
)
def test_extract_url(source, expected):
    assert extract_url(source) == expected
