# 메리맵 (MarryMap)

SeSAC MS AI 엔지니어 4기 3차 프로젝트 (2인 팀). 예식장·스드메(드레스/스튜디오/메이크업) 중심으로
예산·타임라인·계약전 체크리스트를 관리하고, 실제 사례(좋은예/나쁜예)와 공식 통계에 근거한 RAG
상담을 받는 웨딩 준비 앱. "크로스핏 폼 코치"(웹캠 운동 코칭) → "브리프코치"(AI 화법 트레이너)에
이은 **2차 주제 전환**(2026-08-20)으로, 인프라·협업 구조는 그대로 두고 주제만 다시 바꿨다.

**2026-08-28: `backend`·`frontend`가 `main`으로 승격 완료.** 이제 `main`이 실제 배포 대상
코드를 담고 있다(아래 "배포 현황" 참고). 현재 설계 문서는 `docs/wedding/new-plan/`(코드 실측
기반으로 재작성 중, 로컬 전용, git 미추적) — 기존 `docs/wedding/plan/new/*.md`(BASELINE v4.0,
2026-08-23 작성)는 설계 의도 확인용 1차 참고자료로 남아 있다.

## 아키텍처 개요 (routers → services → models/rag/personalization)

CRUD API + RAG 상담 1개 엔드포인트 + 체크리스트/타임라인 개인화 에이전트로 구성된다. 각각
독립된 3노드 LangGraph를 쓴다(챗: retrieve→generate→verify, 개인화: route→generate→validate).

| 레이어 | 위치 | 역할 |
|---|---|---|
| Routers | `backend/app/routers/{system,wedding,ai}/` + `auth.py` | 도메인별 서브패키지로 재구성(2026-08-26) — 37개 엔드포인트(OpenAPI 노출 35개; OAuth 리다이렉트 2개는 스키마 비노출) |
| Services | `backend/app/services/` | 비즈니스 로직 |
| Models | `backend/app/models/` | SQLAlchemy 2.0 async, 15개 테이블 |
| RAG | `backend/app/rag/` | indexing(오프라인 색인) / retrieval(하이브리드 검색+RRF) / graph(LangGraph 3노드, CRAG 조건부 재시도 ≤1회) |
| Personalization | `backend/app/personalization/` + `services/personalization.py` | 체크리스트/타임라인 전담 LangGraph 3노드, 카탈로그 폴백, 조건부 재시도 ≤1회 |

**이메일+비밀번호 로그인 + 소셜 로그인(구글·네이버 라이브, 카카오·애플 구현 완료·머지 보류)** —
무인증 MVP가 아니다. BFF 패턴 + Opaque 세션 쿠키.

## 폴더 구조

```
backend/    FastAPI(app/main.py) + SQLAlchemy 2.0 async 모델(app/models/) + Alembic(alembic/)
            + routers(system/wedding/ai 서브패키지 + auth.py)/services/rag/personalization.
            backend/old/에 이전 주제 구현 아카이브(lint/test 제외)
frontend/   React 19 + Vite + TS. S0~S6 전 화면 + 설정(⚙️)/AI상담 화면까지 실구현 완료. 백엔드와
            같은 AKS Ingress 아래 same-origin으로 배포(2026-08-26, 서드파티 쿠키 차단 우회) —
            Azure Static Web Apps 배포는 PR 프리뷰/로컬 크로스오리진 검증용으로 별도 병행
data/       RAG 코퍼스(DS1_PRICE~DS8_UGC — 참가격/소비자원 사례/표준계약서/정부정책/설문/
            체크리스트/타임라인/UGC). data/old/에 이전 주제 코퍼스 아카이브
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
  LoadBalancer 자동생성 DNS 라벨, 구매 도메인 아님) — `main` push가 트리거, ArgoCD Image
  Updater가 ACR 신규 태그를 감지해 자동 반영.
- **staging**: `https://20-249-52-148.nip.io`(같은 LB IP, nip.io 무료 와일드카드 DNS) —
  `backend`/`frontend` push가 각각 트리거.
- backend+frontend가 같은 AKS Ingress 아래 same-origin(`/api` → backend, `/` → frontend)으로
  서빙된다. 상세: [`infra/README.md`](infra/README.md), `infra/k8s/`.

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

모든 push/PR에서 [gitleaks](.github/workflows/gitleaks.yml)로 시크릿 유출을 스캔한다. 설정은 [`.gitleaks.toml`](.gitleaks.toml).

## 인프라

Azure AKS + ArgoCD(GitOps) + Bicep(IaC). 자세한 내용은 [`infra/README.md`](infra/README.md) 참고.
