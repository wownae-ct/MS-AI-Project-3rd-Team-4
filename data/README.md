# RAG 데이터 파이프라인 (데이터 엔지니어링 단계)

`data/`는 메리맵 RAG 상담이 참고하는 원본 자료의 **수집 → 추출 → 가공(청킹)** 단계를 담당한다.
이후 단계(JSON 변환, DB 인덱싱)는 `backend/`가 맡는다 — `backend/scripts/README.md` 참고.

## 폴더 구조

| 폴더 | 단계 | 내용 |
|---|---|---|
| `raw/` | **수집** | 원본 그대로 보존한 자료(hwp/hwpx/pdf/html 등). 손대지 않는다 — 나중에 추출 결과를 재검증할 근거. |
| `scripts/` | **추출** | 원본에서 텍스트를 뽑아내는 도구. |
| `rag_corpus/` | **가공(청킹)** | 사실관계만 재작성하고 검색 단위(청크)로 잘라 정리한 최종 산출물. `<DATASET_CODE>/<문서명>.json` 구조 — 파일 하나 = 문서 하나. |
| `old/` | (레거시) | 이전 토픽(브리프코치)의 코퍼스 아카이브. 참고용, 이번 프로젝트와 무관. |

## 스크립트

- `scripts/extract_hwp_text.py` — 공정위 등 정부기관이 배포하는 한글(hwp/hwpx) 문서에서 본문
  텍스트를 추출한다. `.hwp`는 `pyhwp`(hwp5txt CLI), `.hwpx`는 zip+XML 구조를 표준 라이브러리만으로
  파싱한다. 실행: `python data/scripts/extract_hwp_text.py <파일.hwp|파일.hwpx>`
  (`data/raw/DS3_FTC/`의 실제 원본으로 검증 완료 — 조문 15개/14개 전체 정확히 추출).

## 가공(청킹) 원칙

`rag_corpus/`의 각 JSON 파일은 원본을 그대로 복사한 게 아니라, 저작권·명예훼손 리스크를 피하기 위해
**사실관계만 재작성**하거나(공식 문서는 조문 원문 그대로, 뉴스·후기는 사실만 추출) 팀이 직접 저작한
콘텐츠다. 데이터셋별 저작권 근거는 `docs/wedding/plan/06_RAG_implementation_and_copyright_review.md`,
데이터셋별 요약은 `docs/wedding/plan/10_RAG_data_catalog.md` 참고.

## JSON 스키마 (문서 하나 = `rag_documents` 한 행)

```jsonc
{
  "dataset_code": "DS3_FTC",
  "title": "...",
  "source_tier": "OFFICIAL",       // OFFICIAL | NEWS | INDUSTRY | CONSENSUS
  "source_org": "...",             // nullable
  "source_url": "...",             // nullable
  "published_at": "2020-09-18",    // nullable, YYYY-MM-DD
  "license_note": "...",
  "category_codes": ["VENUE"],     // 문서가 다루는 카테고리(참고용)
  "chunks": [
    {
      "chunk_index": 0,
      "category_codes": ["VENUE"], // 검색 필터에 실제로 쓰이는 값(여러 개 가능)
      "item_type": "CONTRACT_TERM",// CONTRACT_TERM | EXTRA_COST | PREP | null
      "source_url": null,          // 조각별 출처(대부분 null → 문서 대표 URL 사용)
      "content": "..."             // 실제 검색·인용되는 본문(줄바꿈/탭/마크다운 기호 없는 한 줄 텍스트)
    }
  ]
}
```
