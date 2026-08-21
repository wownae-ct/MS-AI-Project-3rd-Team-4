# 백엔드 스크립트 (JSON 변환 → DB 인덱싱 단계)

`data/`(데이터 엔지니어링 — 수집/추출/가공)를 이어받아, 실제로 서비스가 쓰는 형태로 만드는
단계다. `data/README.md`와 세트로 본다.

| 스크립트 | 단계 | 내용 |
|---|---|---|
| `corpus_md_to_json.py` | **JSON 변환** | `data/rag_corpus/**/*.md`(구 포맷)를 `**/*.json`(신 포맷)으로 일괄 변환한 1회성 도구. 새 코퍼스 문서는 처음부터 `.json`으로 작성하면 되므로 재실행할 일은 거의 없지만, 포맷 전환 과정을 코드로 남겨둔다. |
| (예정) `seed.py` | 콘텐츠 시드 | `checklist_items`/`milestone_templates`/`vendor_case_examples` DB 삽입 — 백엔드 Phase 2 범위, 아직 미작성. |
| (예정) `seed_price_benchmarks.py` | 가격 데이터 시드 | `data/raw/참가격데이터/` xlsx 파싱 → `price_benchmarks` — 백엔드 Phase 2 범위, 아직 미작성. |

## 인덱싱(실제 검색용 DB 적재)

`scripts/`가 아니라 `../app/rag/`에 있다 — CronJob(`infra/k8s/base/rag-cronjob/`)이
`python -m app.rag.indexing`으로 주기 실행하는 애플리케이션 코드라 배포 이미지(`app/`)에 포함돼야
하기 때문이다(`scripts/`의 1회성 도구와 달리 이미지 안에 항상 존재해야 함).

- `../app/rag/corpus.py` — `data/rag_corpus/**/*.json` 파서.
- `../app/rag/indexing.py` — 파싱 → Azure OpenAI 임베딩 → `rag_documents`/`rag_chunks` 적재.
