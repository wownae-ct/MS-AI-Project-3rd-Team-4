# backend

FastAPI(asyncio) 게이트웨이. SQLAlchemy 2.0 async + Alembic — 스키마는 `app/models/`(선언적
모델)이 유일한 출처, 마이그레이션은 `alembic/`(`db/` 참고). 인증은 이메일+비밀번호(BFF +
Opaque 세션 쿠키) + 소셜 로그인(**구글·네이버 2종만 실동작** — 카카오·애플은 구현까지 끝냈지만
PR(#48/#49)이 클로즈돼 이번 데모 범위에서 제외)이다 — "인증 없음"이던 초기 스코프는
BASELINE v4.0에서 뒤집혔다.

```
app/
  main.py      FastAPI app 인스턴스 (Dockerfile CMD가 가리키는 지점) — CORS·rate limit·전역
               예외 핸들러(마지막 단이 catch-all 500 로거) 설정
  deps.py      공용 의존성 — get_current_user(세션 쿠키 wr_session) → get_current_wedding
               (소유권 검증) 체인. "시드된 단일 weddings 행" 시절은 지났다
  routers/     39개 라우트(OpenAPI 노출 37개; OAuth 리다이렉트 2개는 스키마 비노출) —
               도메인별 서브패키지로 재구성(2026-08-26):
                 system/    health, client-errors(미인증, 20/min per-IP)
                 wedding/   wedding, category, checklist, timeline,
                            budget(결제 CRUD+영수증 OCR 자동입력+벤치마크), dashboard,
                            vendor_case
                 ai/        chat(RAG SSE 스트리밍+세션 목록+메시지 평점), personalization
                            (수동 재생성), feedback
                 auth.py    이메일/비밀번호 + 구글·네이버 OAuth(BFF)
  services/    비즈니스 로직(라우터가 얇게 유지되도록) — 전 도메인 채워짐
  schemas/     Pydantic v2 요청/응답 스키마 — 전 도메인 채워짐
  models/      SQLAlchemy 2.0 선언적 모델, 16개 테이블(rag_index_state 포함)
  rag/         corpus.py(코퍼스 파싱·검증·해시) → indexing.py(rag-reindex CronJob 진입점,
               해시 불변 시 재색인 스킵, Langfuse 계측 포함) / retrieval.py(하이브리드 검색+RRF,
               pgvector HNSW, 최상위 유사도 반환) / scope_check.py(키워드 기반 스코프 밖 요청
               사전 차단) / chat_profile.py(사용자 예산·지출·D-day·진행률을 한글 라벨로 렌더해
               프롬프트에 주입 — 순수 함수, 킬 스위치 `chat_profile_enabled`) /
               generation.py(생성·검증·질의 재작성 프롬프트) / graph.py
               (retrieve→generate→verify LangGraph 3노드, CRAG 조건부 재시도 ≤1회,
               유사도 컷오프(`rag_min_similarity`=0.30) 미달 시 generate/verify를 건너뛰고
               OUT_OF_SCOPE로 거절 — 단, 거절 직전에 생략형 후속 질문("그럼 스드메는?")을
               LLM으로 한 번 재작성해 구제한다. 먼저 재보고 미달일 때만 해소하므로 대부분
               질문엔 추가 호출이 없다)
  personalization/  체크리스트/타임라인 전담 LangGraph 3노드(route→generate→validate) —
               도메인별·카테고리별 독립 호출로 분리(결합 호출이 BLOCKED 연쇄 실패의 근본
               원인이었음을 확인 후 조치). 2026-08-31 타임라인도
               `_generate_timeline_category_draft`로 카테고리 단위 전환 —
               체크리스트만 카테고리 단위여서 생기던 폴백 비대칭을 없앴고, 커버리지 검증이
               보호(사용자 수정) 항목까지 계산에 넣는다. 조건부 재시도(≤1회), 카탈로그 폴백
               (core/checklist_catalog.py 95항목 / core/timeline_catalog.py 87항목)
  core/        설정(config.py), DB 엔진/세션(db.py), 세션 인증(auth.py)/OAuth 프로바이더
               (oauth_providers.py), rate_limit.py, 임베딩 클라이언트(embeddings.py), Blob
               Storage(storage.py), KST 헬퍼(timezone.py), Langfuse 트레이싱(tracing.py),
               카테고리 ENUM(categories.py), 에러 응답 헬퍼(errors.py), SSE 헬퍼(sse.py)
  old/         BriefCoach(2026-08-19 피벗) 구현 아카이브 — ruff/pytest 대상 제외, 참고용
alembic/       마이그레이션. DB URL은 alembic.ini가 아니라 app.core.config.Settings에서 읽는다
tests/         라우터/서비스/RAG/개인화/OAuth 전 도메인 커버, 529건(2026-08-31 수집 기준 —
               스코프 컷오프 27건 신설 포함) — 일부는 실 DB·실 LLM 대상(아래 "실행/테스트" 경고)
scripts/       seed_vendor_cases.py / seed_price_benchmarks.py(콘텐츠 시드),
               corpus_md_to_json.py(코퍼스 .md → .json 변환 — indexing.py가 실제로 읽는 건 .json)
```

## 실행

```bash
uv sync --extra dev                           # 의존성 + dev extras(pytest/ruff) 설치
uv run ruff check .                           # 린트 — CI에서 테스트보다 먼저 도는 게이트
uvicorn app.main:app --reload --port 8000     # 개발 서버
uv run alembic upgrade head                   # 마이그레이션 — DB URL은 alembic.ini가 아니라
                                              # app.core.config.Settings에서 읽는다
```

## 테스트

```bash
uv run pytest -q
```

> ⚠️ **로컬 `pytest`는 운영 DB에 쓴다.** `backend/.env`엔 테스트 DB 분리가 없어서
> `tests/conftest.py`가 staging·production이 함께 쓰는 운영 DB(`team4db-wd`)에 그대로 붙는다.
> 게다가 스모크 테스트 34건은 mock이 아니라 **실제 Azure OpenAI를 호출**한다(토큰·쿼터 소모).
> DB를 건드리는 파일은 `test_smoke.py` / `test_oauth_service.py` / `test_retrieval.py`
> 3개뿐이라, 데모 직전처럼 위험한 시점엔 이것만 빼고 돌리면 된다:
>
> ```bash
> uv run pytest -q --ignore=tests/test_smoke.py \
>                  --ignore=tests/test_oauth_service.py \
>                  --ignore=tests/test_retrieval.py
> ```
>
> CI(`backend-ci.yml`)는 매 실행마다 pgvector 서비스 컨테이너에 빈 DB를 새로 만들어 돌기
> 때문에 이 문제가 없다. 같은 워크플로우의 `corpus-sync-check` job은 `data/rag_corpus/`와
> ConfigMap 미러(`infra/k8s/base/rag-cronjob/rag_corpus/`)의 동기화를 강제하므로, 코퍼스를
> 고칠 땐 미러도 함께 갱신해야 한다.

소유 브랜치: `backend`

> 이전 두 주제("크로스핏 폼 코치", "브리프코치")는 각각 `docs/old/`(로컬 전용, git 미추적)와
> `backend/old/`(git 추적, lint/test 제외)에 보존돼 있다.
