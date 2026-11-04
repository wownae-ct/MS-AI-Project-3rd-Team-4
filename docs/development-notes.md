# 메리맵 (MarryMap)

SeSAC MS AI 엔지니어 4기 3차 프로젝트 (2인 팀). 예식장·스드메(드레스/스튜디오/메이크업) 중심으로
예산·타임라인·계약전 체크리스트를 관리하고, 실제 사례(좋은예/나쁜예)와 공식 통계에 근거한 RAG
상담을 받는 웨딩 준비 앱. "크로스핏 폼 코치"(웹캠 운동 코칭) → "브리프코치"(AI 화법 트레이너)에
이은 **2차 주제 전환**(2026-08-20)으로, 인프라·협업 구조는 그대로 두고 주제만 다시 바꿨다.

**2026-08-28: `backend`·`frontend`가 `main`으로 승격 완료.** 다만 백엔드 애플리케이션 코드는
`main` 승격을 기다리지 않고 `backend` 머지 시점에 production까지 반영된다 — `main`이 통제하는
건 `infra/k8s` 매니페스트뿐이다(아래 "배포 현황" 참고). 영역별 상세 내용은
[`backend/README.md`](backend/README.md), [`frontend/README.md`](frontend/README.md) 참고 —
어느 브랜치에서 보든 같은 트리 안에 있다.

## 주요 기능

- **인증**: 이메일+비밀번호(BFF + Opaque 세션 쿠키) + 소셜 로그인(**구글·네이버 2종만 실동작** —
  카카오·애플은 구현까지 끝냈지만 PR(#48/#49)이 클로즈돼 이번 데모 범위에서 제외)
- **예산/결제**: 카테고리별 예산 배정, 시세 벤치마크 비교, 결제 CRUD(환불/취소 포함) + 영수증
  사진 OCR 자동입력
- **체크리스트/타임라인**: 웨딩별 개인화 LangGraph 에이전트가 생성. 체크리스트에 이어 타임라인도
  카테고리 단위 독립 호출로 전환(2026-08-31)해, 한 카테고리가 실패해도 나머지까지 폴백으로
  끌려가지 않는다. 사용자 수정 항목은 재생성에서 보호, 카탈로그 폴백으로 안정성 확보
- **AI상담**: RAG(하이브리드 검색+RRF, pgvector HNSW) 기반 챗, SSE 스트리밍, 근거 인용, 메시지
  평점. 검색 유사도 컷오프로 주제 밖 질문은 generate/verify 이전에 거절하고(판정
  `OUT_OF_SCOPE`, 인용 0건), "그럼 스드메는?" 같은 생략형 후속 질문은 LLM 재작성으로 구제한다.
  답변은 사용자 본인의 총예산·카테고리별 배정액/실지출·D-day·진행률까지 알고 생성된다(개별
  결제 내역·업체명은 인젝션 표면이라 의도적으로 제외)
- **대시보드/리포트**: 예산 벤치마크 카드, 카테고리별 진행률(타임라인 기준)
- **업체 사례**: vendor_case ↔ 소비자원 분쟁사례 크로스링크, 신고 기능

## 아키텍처 개요 (routers → services → models/rag/personalization)

CRUD API + RAG 상담 1개 엔드포인트 + 체크리스트/타임라인 개인화 에이전트로 구성된다. 각각
독립된 3노드 LangGraph를 쓴다(챗: retrieve→generate→verify, 개인화: route→generate→validate).

| 레이어 | 위치 | 역할 |
|---|---|---|
| Routers | `backend/app/routers/{system,wedding,ai}/` + `auth.py` | 도메인별 서브패키지로 재구성(2026-08-26) — 39개 라우트(OpenAPI 노출 37개; OAuth 리다이렉트 2개는 스키마 비노출) |
| Services | `backend/app/services/` | 비즈니스 로직 |
| Models | `backend/app/models/` | SQLAlchemy 2.0 async, 16개 테이블(코퍼스 재색인 스킵용 `rag_index_state` 포함) |
| RAG | `backend/app/rag/` | indexing(오프라인 색인) / retrieval(하이브리드 검색+RRF) / graph(LangGraph 3노드, CRAG 조건부 재시도 ≤1회, 유사도 컷오프 기반 스코프 거절) / chat_profile(사용자 예산·일정 컨텍스트 주입) |
| Personalization | `backend/app/personalization/` + `services/personalization.py` | 체크리스트/타임라인 전담 LangGraph 3노드, 두 도메인 모두 카테고리 단위 독립 호출, 카탈로그 폴백, 조건부 재시도 ≤1회 |
| Frontend | `frontend/src/` | React 19 + Vite + TS, FSD 구조. S0~S6 전 화면 + 설정(⚙️)/AI상담 실구현 |

## 폴더 구조

```
backend/    FastAPI(app/main.py) + SQLAlchemy 2.0 async 모델(app/models/) + Alembic(alembic/)
            + routers(system/wedding/ai 서브패키지 + auth.py)/services/rag/personalization.
            backend/old/에 이전 주제 구현 아카이브(lint/test 제외)
frontend/   React 19 + Vite + TS. S0~S6 전 화면 + 설정(⚙️)/AI상담 화면까지 실구현 완료. 백엔드와
            같은 AKS Ingress 아래 same-origin으로 배포(2026-08-26, 서드파티 쿠키 차단 우회) —
            Azure Static Web Apps 배포는 PR 프리뷰/로컬 크로스오리진 검증용으로 별도 병행
data/       RAG 코퍼스(DS1_PRICE~DS6_CHECK — 참가격/소비자원 사례/표준계약서/정부정책/
            듀오 결혼비용 통계(7개년)/체크리스트, 14문서/213청크). DS7_TIMELINE은 코퍼스가
            아니라 backend/app/core/timeline_catalog.py 상수로 존재. DS8_UGC(Threads 후기)는
            개인정보 리스크로 2026-08-30 코퍼스에서 제외 — data/old/에 이전 주제 코퍼스와
            함께 보존
db/         vendor_case/price_benchmark 콘텐츠 시드 로더 스크립트만 남음 — checklist/timeline은
            공유 마스터 시드 없이 개인화 에이전트가 웨딩별로 생성. 스키마 자체는
            backend/app/models/ + backend/alembic/에 있음
infra/      Bicep(Azure 리소스) + AKS 매니페스트 + ArgoCD(GitOps, staging/production 네임스페이스
            분리 + Image Updater 자동 배포) — 이전 주제 빌드 그대로 재사용
docs/       docs/wedding/new-plan/이 코드 실측 기반 최신 설계 자료(작성 진행 중, 로컬 전용).
            docs/wedding/plan/new/이 이전 BASELINE v4.0. 이전 주제 설계 문서는 docs/old/에 보존
```

> **커스텀 모델 학습 없음**: RAG/개인화는 학습이 아니라 서비스가 매 요청 호출하는 라이브
> LangGraph 컴포넌트라 이 레포(`backend/app/rag/`, `backend/app/personalization/`, `data/`)에
> 있다. Azure OpenAI가 chat/embedding 배포를 분리 제공한다.

## 배포 현황

- **production**: `https://merrymap-production.koreacentral.cloudapp.azure.com`(Azure
  LoadBalancer 자동생성 DNS 라벨, 구매 도메인 아님) — 프론트 이미지는 `main` push가, 백엔드
  이미지는 `backend` push가 빌드하고, ArgoCD Image Updater가 ACR의 새 digest를 감지해 자동
  반영한다(아래 비대칭 항목 참고).
- **staging**: `https://20-249-52-148.nip.io`(같은 LB IP, nip.io 무료 와일드카드 DNS) —
  `backend`/`frontend` push가 각각 트리거.
- backend+frontend가 같은 AKS Ingress 아래 same-origin(`/api` → backend, `/` → frontend)으로
  서빙된다. 상세: [`infra/README.md`](infra/README.md), `infra/k8s/`.
- **브랜치 → 환경 대응이 백엔드와 프론트엔드에서 비대칭이다.** 백엔드는 staging·production
  ArgoCD Application이 **같은 `backend:latest` 태그**를 보고 Image Updater가 digest로 양쪽을
  갱신하므로, 백엔드 애플리케이션 코드는 `backend` 브랜치에 머지되는 순간 production까지
  올라간다 — `main` 승격이 통제하는 건 `infra/k8s` 매니페스트뿐이다. 프론트엔드는 반대로
  `VITE_API_BASE`가 빌드타임에 번들에 구워져 환경별 태그(`staging-latest`/`production-latest`)가
  분리되고, production 이미지는 `main` push가 빌드한다.
- 2026-08-31 실측: `main`은 `933d924`, 이후 백엔드는 `backend`의 `0e7c3a3`(#161 머지)까지
  진행됐고 ArgoCD production Application 3개 모두 동기화·파드 교체가 끝났다.

## 브랜치 전략 & 폴더 소유권

```
feature/backend-*  ─┐
feature/infra-*     ├─ PR → backend  ─┐
feature/rag-*       ┘                 │
                                       ├─ PR → main (배포 릴리스)
feature/frontend-*  ─── PR → frontend ┘
```

| 브랜치 | 용도 | 소유 폴더 | 직접 push |
|---|---|---|---|
| `main` | 배포 릴리스. `backend`/`frontend`의 PR만 받음 | 전체(머지 결과) | **금지** |
| `backend` | 백엔드 통합 브랜치 | `backend/`, `data/`, `db/`, `infra/`, 루트 설정 | 금지 (feature 브랜치 PR만) |
| `frontend` | 프론트 통합 브랜치 | `frontend/` | 금지 (feature 브랜치 PR만) |
| `feature/*` | 실제 작업 브랜치 | 위 소유 폴더 내 | 자유 (본인 브랜치) |

각 브랜치는 자신이 소유하지 않은 폴더를 건드리지 않는다. 이는 다음 두 가지로 강제된다:
1. **[CODEOWNERS](.github/CODEOWNERS)** — 폴더별 필수 리뷰어 지정
2. **[path-guard 워크플로우](.github/workflows/path-guard.yml)** — PR이 대상 브랜치의 소유 폴더 밖 파일을 건드리면 CI 실패

로컬 작업 시 자신의 폴더만 체크아웃하려면 [`scripts/setup-sparse-checkout.sh`](scripts/setup-sparse-checkout.sh) 참고.

### main 보호 설정 (GitHub에서 수동 설정 필요)

리포 코드만으로는 push 차단이 강제되지 않는다 — GitHub Settings에서 브랜치 보호 규칙을 켜야 실제로 막힌다.

**Settings → Branches → Add branch ruleset (또는 Add rule) → Branch name pattern: `main`**

- [x] Require a pull request before merging
  - Require approvals: 1
- [x] Require status checks to pass before merging
  - `gitleaks` 체크 추가
  - Require branches to be up to date before merging
- [x] Do not allow bypassing the above settings (관리자 포함 — 1인이라도 실수 방지)
- [x] Restrict deletions / Block force pushes

같은 방식으로 `backend`, `frontend` 브랜치에도 규칙 추가하고, 여기엔 **`path-guard` 체크를 required로 반드시 추가**할 것 —
안 그러면 path-guard가 실패해도 그냥 머지가 가능해서 폴더 소유권 강제가 무력화된다.

## 보안

모든 push/PR에서 [gitleaks](.github/workflows/gitleaks.yml)로 시크릿 유출을 스캔한다. 설정은 [`.gitleaks.toml`](.gitleaks.toml). 시크릿은 전부 Key Vault → CSI → K8s Secret 경로로만 주입되며 코드에 하드코딩하지 않는다.

## 인프라

Azure AKS + ArgoCD(GitOps) + Bicep(IaC). 자세한 내용은 [`infra/README.md`](infra/README.md) 참고.

**Azure OpenAI 쿼터 상향(2026-08-31, 단위 1000 TPM)**: `chat` 250→500, `chat-mini` 250→**1000**,
`embedding` 100→300. 근거는 staging 실측 — 온보딩 1건이 LLM 19회 / 34,333토큰 / 14.4초를 쓰기
때문에, 25명이 1분 안에 몰리면 858K TPM으로 종전 한도(250K)의 343%가 돼 429가 난다. 1000이면
같은 최악 케이스도 86% 선에서 버틴다. Bicep에서 `chat`/`chat-mini` 용량 파라미터를 분리했다
(`infra/bicep/modules/openai.bicep`).
