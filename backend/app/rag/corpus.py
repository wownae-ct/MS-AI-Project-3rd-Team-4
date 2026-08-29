"""data/rag_corpus/<DATASET_CODE>/*.json 파서. 파일 하나 = rag_documents 한 행, `chunks` 배열의
원소 하나 = rag_chunks 한 행. 스키마는 data/README.md 참고.

과거엔 마크다운(YAML 프론트매터 + HTML 주석 청크)이었으나 2026-08-21 JSON으로 전환했다 —
YAML 프론트매터의 자유 텍스트에 콜론(:)이 섞이면 파싱이 깨지는 실제 버그를 겪은 뒤, 형식이 더
엄격한 JSON으로 옮기는 게 낫다고 판단했다(변환 스크립트: backend/scripts/corpus_md_to_json.py).
코퍼스는 이미 청크 단위로 정제돼 있으므로 여기서 동적 청킹은 하지 않고 파싱만 한다."""

import hashlib
import json
from dataclasses import dataclass
from datetime import date
from pathlib import Path
from typing import get_args

from app.schemas.common import CategoryCode, ItemType

# 2026-08-26 레드팀 감사 3라운드 MEDIUM #8 — category_codes/item_type을 정식 코드 집합과 대조
# 검증 안 하고 그대로 적재했다. 오타(예: "VENEU")가 나면 색인 로그엔 성공만 찍히고, 그 청크는
# app/rag/retrieval.py의 category_codes 필터에서 영구적으로 걸러지지 않아 해당 카테고리 검색에서
# 조용히 누락된다 — 파싱 시점에 바로 걸러 인덱싱을 실패시키는 편이 훨씬 싸게 먹힌다.
_VALID_CATEGORY_CODES: frozenset[str] = frozenset(get_args(CategoryCode))
_VALID_ITEM_TYPES: frozenset[str] = frozenset(get_args(ItemType))


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

    category_codes = raw.get("category_codes") or []
    invalid_codes = [c for c in category_codes if c not in _VALID_CATEGORY_CODES]
    if invalid_codes:
        raise ValueError(
            f"{path}: chunk_index={raw['chunk_index']} 알 수 없는 category_codes={invalid_codes}"
        )
    item_type = raw.get("item_type")
    if item_type is not None and item_type not in _VALID_ITEM_TYPES:
        raise ValueError(
            f"{path}: chunk_index={raw['chunk_index']} 알 수 없는 item_type={item_type!r}"
        )

    return ParsedChunk(
        chunk_index=raw["chunk_index"],
        category_codes=category_codes,
        item_type=item_type,
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


def _visible_json_files(directory: Path) -> list[Path]:
    """directory 바로 아래(한 단계만)의 숨김 아님 *.json 파일만 반환한다."""
    return sorted(
        p for p in directory.iterdir() if not p.name.startswith(".") and p.suffix == ".json"
    )


def _discover_json_files(root: Path) -> list[Path]:
    """root(data/rag_corpus/) 아래 *.json을 찾는다. 로컬 저장소는
    <DATASET_CODE>/<문서명>.json(2단계, 10_RAG_data_catalog.md가 정한 레이아웃)이지만,
    rag-reindex CronJob의 K8s ConfigMap 볼륨 마운트는 디렉터리 구조 없이 평평하게(1단계) 풀린다
    (infra/k8s/base/rag-cronjob/kustomization.yaml) — 두 환경 모두에서 같은 코드가 동작해야
    하므로 두 깊이(0단계·1단계)를 명시적으로 합친다.

    `rglob("*.json")`(임의 깊이 재귀), `glob("*.json")`/`glob("*/*.json")` 둘 다 여기서 안 쓴다 —
    K8s ConfigMap 볼륨은 실제로는 `<mount>/..<타임스탬프>/`라는 숨김 디렉터리에 진짜 파일을 두고
    `<mount>/<파일명>`은 그곳을 가리키는 심볼릭 링크(그리고 `<mount>/..data`라는 숨김 심볼릭
    링크도 같은 곳을 가리킴)만 만드는데(원자적 갱신을 위한 kubelet 표준 구현), `pathlib`의
    `*`는 점(.)으로 시작하는 이름도 그대로 매칭해버려서(셸 글롭과 달리 숨김 파일을 안 걸러냄,
    실측 확인) `rglob`도 `glob("*/*.json")`도 이 숨김 디렉터리까지 파고들어가 같은 파일을 여러
    경로에서 중복 발견한다 — 실제 staging에서 문서 8개/청크 140개가 16개(rglob)~24개(glob 조합)로
    부풀려지는 버그로 재현됨. `Path.iterdir()`로 직접 순회하며 이름이 `.`으로 시작하는 항목을
    명시적으로 걸러내는 방식만 두 환경 모두에서 정확히 8개를 찾는다(로컬 시뮬레이션 검증 완료).

    `load_corpus()`와 `compute_corpus_hash()` 둘 다 이 함수로 파일 목록을 구해야 한다 — 한쪽만
    바뀐 탐색 로직을 쓰면 "코퍼스에 실제로 반영되는 파일"과 "해시가 감시하는 파일"이 갈라져
    코퍼스가 바뀌었는데도 해시가 그대로인 채로 재색인이 조용히 스킵되는 버그가 생길 수 있다."""
    paths = _visible_json_files(root)
    for entry in sorted(root.iterdir()):
        if entry.is_dir() and not entry.name.startswith("."):
            paths.extend(_visible_json_files(entry))
    if not paths:
        raise ValueError(f"{root}: RAG 코퍼스 JSON 파일을 찾지 못함")
    return paths


def load_corpus(root: Path) -> list[ParsedDocument]:
    """root 아래 *.json을 전부 파싱한다. 파일 탐색은 `_discover_json_files()` 참고."""
    return [parse_document(p) for p in _discover_json_files(root)]


def compute_corpus_hash(root: Path) -> str:
    """코퍼스 파일들(경로+내용)을 결정론적으로 해시한다. rag-reindex CronJob이 매일 03시에
    돌 때마다 이 값을 이전 색인 시점의 값과 비교해, 코퍼스가 실제로 안 바뀌었으면 임베딩 API
    호출과 DB 전체 재구성을 건너뛰게 하기 위한 가드다(app/rag/indexing.py::reindex). 스케줄
    자체(매일 03시)는 그대로 두고, 그 안에서 "할 일이 없는 실행"만 없앤다.

    `_discover_json_files()`가 이미 정렬해서 반환하므로 순서는 파일 시스템 순회 순서에 안
    좌우된다. 파일 내용뿐 아니라 파일명도 해시에 넣는 이유 — 내용은 그대로인데 파일이
    추가/삭제/개명(예: `a.json`→`z.json`)되는 것도 "코퍼스가 바뀐 것"으로 잡아야 하기 때문이다.

    다만 상위 디렉터리 경로(`DS1_PRICE/` 같은 데이터셋 폴더명)는 해시에 안 넣고 파일명만
    쓴다 — `dataset_code`는 파일 경로가 아니라 JSON 내용 자체에서 오므로(parse_document),
    로컬 저장소의 2단계 레이아웃(`DATASET_CODE/문서.json`)과 K8s ConfigMap 마운트의 평평한
    1단계 레이아웃은 파일 내용이 같으면 항상 같은 해시가 나와야 한다 — 안 그러면 두 환경에서
    같은 코퍼스를 두고도 스킵 가드 판단이 갈린다."""
    paths = _discover_json_files(root)
    hasher = hashlib.sha256()
    for path in paths:
        hasher.update(path.name.encode("utf-8"))
        hasher.update(path.read_bytes())
    return hasher.hexdigest()
