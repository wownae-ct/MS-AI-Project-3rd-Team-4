# 메리맵 (MarryMap) — backend

SeSAC MS AI 엔지니어 4기 3차 프로젝트 (2인 팀)의 백엔드. 예식장·스드메(드레스/스튜디오/메이크업)
중심으로 예산·타임라인·계약전 체크리스트를 관리하고, 실제 사례(좋은예/나쁜예)와 공식 통계에
근거한 RAG 상담을 제공하는 FastAPI 서버. 이 브랜치는 `backend/`, `data/`, `db/`, `infra/`,
루트 설정을 소유한다. 전체 프로젝트 개요·프론트엔드는 [`main` 브랜치
README](../../tree/main/README.md) 참고.

## 아키텍처 (routers → services → models/rag/personalization)

플랫한 구조 — 실시간 판정이나 다단계 에이전트 파이프라인이 필요 없는 CRUD API + RAG 상담
엔드포인트 위주.

| 레이어 | 위치 | 역할 |
|---|---|---|
| Routers | `app/routers/{system,wedding,ai}/` + `auth.py` | 도메인별 서브패키지(2026-08-26 재구성) — 37개 엔드포인트(OpenAPI 노출 35개; OAuth 리다이렉트 2개는 스키마 비노출), health/wedding/category/budget/checklist/timeline/vendor_case/chat/dashboard/personalization/feedback/client_error |
| Services | `app/services/` | 비즈니스 로직 — 라우터를 얇게 유지, DB/config/framework 타입에 최대한 안 묶이도록 순수 함수 지향 |
| Models | `app/models/` | SQLAlchemy 2.0 async 선언적 모델, 15개 테이블 |
| RAG | `app/rag/` | indexing(오프라인 색인) / retrieval(하이브리드 검색+RRF) / graph(챗 LangGraph) |
| Personalization | `app/personalization/` + `services/personalization.py` | 체크리스트/타임라인 전담 LangGraph |

## 기능

- **인증**: 이메일+비밀번호(BFF + Opaque 세션 쿠키, `users`/`auth_sessions`) + 소셜 로그인(구글·
  네이버 라이브, 카카오·애플 구현 완료·머지 보류) — 무인증 MVP 아님
- **웨딩/카테고리/예산/결제**: 웨딩 프로필, 9개 카테고리(ENUM) on/off, 예산 배정·시세 벤치마크
  비교, 결제 CRUD(PATCH로 환불/취소 처리 포함) + 영수증 사진 OCR 자동입력(Blob 업로드 + Azure
  OpenAI vision, DB 저장 없이 프론트가 확인 후 별도 POST)
- **체크리스트/타임라인**: 웨딩별 개인화 에이전트가 생성(공유 마스터 시드 없음), 사용자 수정
  항목은 재생성에서 보호(`protected_items`)
- **AI상담(챗)**: RAG 근거 기반 상담, SSE 스트리밍, 세션 소유권 검사, 메시지 평점(Langfuse Score)
- **벤치마크/신고**: 가격 벤치마크 비교, 업체 사례(vendor_case) ↔ DS2 분쟁사례 크로스링크,
  체크리스트 인용 근거(citation) 배지
- **대시보드/리포트**: 요약·예산 벤치마크 카드·카테고리별 진행률(타임라인 기준)
- **client-errors**: 프론트 렌더 크래시 로깅 훅(비인증, DB 미저장, rate-limit)

## RAG 파이프라인

data/rag_corpus/ (DS1_PRICE~DS8_UGC, 10문서/151청크)
→ app/rag/indexing.py (청크·임베딩·pgvector upsert, rag-reindex CronJob이 매일 03:00 실행)
→ pgvector HNSW 인덱스 (2026-08-26 ivfflat→HNSW 전환)
→ app/rag/retrieval.py (하이브리드 vector+tsvector 검색, RRF 융합, 카테고리 필터)
→ app/rag/graph.py — 챗 LangGraph 3노드: retrieve → generate → verify
(verify가 WEAK/GENERAL이면 CRAG 스타일 쿼리 재구성 후 retrieve로 ≤1회 재시도)



Azure OpenAI는 `chat`/`embedding` 배포가 분리돼 있다(routers/services는 chat, indexing/
retrieval은 embedding).

## 개인화 파이프라인 (checklist/timeline)

app/personalization/graph.py — route → generate → validate

route: FIELD_UPDATED 트리거일 때만 LLM 호출(CHECKLIST/TIMELINE 중 뭘 재생성할지 판단). ONBOARDING_INITIAL은 항상 둘 다 생성하므로 route 스킵
generate: 초안 생성, protected_items(사용자 수정분)는 재생성 제외
validate: 순수 코드(LLM 아님) — 구조 검증 실패 시 BLOCKED, 카탈로그 폴백 (app/core/checklist_catalog.py 95개, timeline_catalog.py 65개)로 대체
validate→generate로 ≤1회 조건부 재시도(validation_errors를 다음 프롬프트에 피드백)


`wedding_date`만 바뀌는 경우는 LLM 호출 없이 서비스 레이어에서 결정론적으로 재계산.

## LangGraph / Langfuse

두 그래프 모두 3노드로 캡핑(이 프로젝트 규칙 — CQRS·이벤트소싱·별도 워커 등은 YAGNI로 배제),
각자 독립적인 조건부 재시도 엣지 하나씩만 가진다. `app/core/tracing.py`가 Langfuse import
지점, `app/core/embeddings.py::get_azure_openai_client()`가 두 그래프를 계측하는 단일
스위치 지점 — `ai_invocations.trace_ref`/`chat_messages.trace_ref`에 실제 trace가 기록된다
(Langfuse Cloud, Japan region).

## DB

SQLAlchemy 2.0 async + Alembic. `app/models/`가 스키마의 유일한 출처(`Base.metadata`),
Alembic이 DB URL을 `alembic.ini`가 아니라 `app.core.config.Settings`에서 읽는다
(`alembic/env.py`). `db/`에는 스키마 자체가 없고 `vendor_case`/`price_benchmark` 콘텐츠 시드
로더 스크립트만 남아있다(`backend/scripts/seed_vendor_cases.py`,
`seed_price_benchmarks.py`) — checklist/timeline은 공유 마스터 시드 없이 개인화 에이전트가
웨딩별로 생성한다. category는 테이블이 아니라 Postgres ENUM(`category_code`, 9값).

## 시작하기

```bash
cd backend
uv sync --extra dev                          # 의존성 + pytest/ruff/httpx
uv run ruff check .                          # lint (CI 게이트)
uv run pytest -q                             # 테스트
uvicorn app.main:app --reload --port 8000    # 개발 서버
uv run alembic upgrade head                  # 마이그레이션 적용
uv run alembic revision -m "..."             # 신규 마이그레이션 (autogenerate 대상 라이브 DB 없어 손수 작성)
```

폴더 구조
backend/
  app/
    routers/     system/(health, client_error) · wedding/(wedding·category·budget·checklist·
                 timeline·dashboard·vendor_case) · ai/(chat·personalization·feedback) · auth.py
    services/    비즈니스 로직
    models/      SQLAlchemy 2.0 선언적 모델, 15개 테이블
    rag/         indexing.py / retrieval.py / graph.py
    personalization/  graph.py / prompts.py / validation.py / state.py
    core/        config · db · auth(세션+OAuth) · rate_limit · timezone(KST) · tracing(Langfuse)
                 · storage(Blob REST, httpx) · checklist_catalog · timeline_catalog · oauth_providers
    old/         이전 두 주제(크로스핏 폼 코치·브리프코치) 구현 아카이브 — ruff/pytest 제외
  alembic/       마이그레이션(스키마 소스는 app/models/)
  scripts/       seed_vendor_cases.py · seed_price_benchmarks.py
  tests/
data/
  rag_corpus/    DS1_PRICE~DS8_UGC — 참가격/소비자원 사례/표준계약서/정부정책/설문/체크리스트/
                 타임라인/UGC (10문서/151청크)
  old/           이전 주제 코퍼스 아카이브
db/
  (스키마는 backend/app/models/+alembic에 있음 — 여기엔 콘텐츠 시드 관련 README만)
infra/
  bicep/         main.bicep + modules/(aks·acr·keyvault·postgres·openai·storage·monitor·
                 staticwebapp)
  k8s/
    base/          backend·frontend·rag-cronjob 공통 매니페스트(Deployment/Service/
                   SecretProviderClass 등)
    overlays/      backend-staging·backend-production·frontend-staging·frontend-production·
                   rag-cronjob-{staging,production} — 네임스페이스 분리
    apps/          ArgoCD Application 정의(staging/production)
    argocd/        ArgoCD 자체 설정 + Image Updater CR

인프라
단일 AKS 클러스터, staging/production은 네임스페이스로만 분리(별도 클러스터 아님 — 예산 제약)
backend + rag-cronjob이 같은 Docker 이미지·같은 브랜치를 쓰지만 별도 ArgoCD Application (backend-{staging,production}, rag-cronjob-{staging,production})으로 배포 — RAG 재색인을 backend와 독립적으로 sync/pause 가능
GitOps: CI(backend-ci.yml)가 ACR에 이미지 push만 하고, ArgoCD Image Updater가 ACR을 폴링해 자동 배포(Workload Identity로 ACR 인증)
Ingress: NGINX(Helm 설치, in-cluster) — backend /api, frontend / 를 같은 호스트에서 same-origin으로 서빙
Key Vault: 외부 SaaS 시크릿(구글/네이버/카카오/애플 OAuth, Langfuse)까지 Bicep으로 Microsoft.KeyVault/vaults/secrets를 직접 작성 — CSI 드라이버가 K8s Secret으로 동기화
VNet 없음: Postgres/AKS는 public + 방화벽 allowlist (private endpoint 아님, 명시적 비용/일정 트레이드오프)
자세한 내용은 infra/README.md
배포
staging: https://20-249-52-148.nip.io — backend/frontend push가 각각 트리거
production: https://merrymap-production.koreacentral.cloudapp.azure.com — main push가 트리거, ArgoCD Image Updater가 ACR 신규 태그 감지 후 자동 반영
backend /api, frontend / 같은 AKS Ingress 아래 same-origin으로 서빙(2026-08-26, 서드파티 쿠키 차단 우회)
브랜치 전략
feature/backend-* / feature/infra-* / feature/rag-* → PR → backend → PR → main.
전체 브랜치 전략·폴더 소유권은 main README 참고.

보안
모든 push/PR에서 gitleaks로 시크릿 유출 스캔. 시크릿은
전부 Key Vault → CSI → K8s Secret 경로로만 주입되며 코드에 하드코딩하지 않는다.
