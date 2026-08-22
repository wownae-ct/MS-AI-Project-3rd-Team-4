# 메리맵 (MerryMap)

SeSAC MS AI 엔지니어 4기 3차 프로젝트 (2인 팀). 예식장·스드메(드레스/스튜디오/메이크업) 중심으로
예산·타임라인·계약전 체크리스트를 관리하고, 실제 사례(좋은예/나쁜예)와 공식 통계에 근거한 RAG
상담을 받는 웨딩 준비 앱. "크로스핏 폼 코치"(웹캠 운동 코칭) → "브리프코치"(AI 화법 트레이너)에
이은 **2차 주제 전환**(2026-08-20)으로, 인프라·협업 구조는 그대로 두고 주제만 다시 바꿨다. 현재
설계 문서는 `docs/wedding/plan/*.md` 10종(`00_BASELINE.md`가 SSOT, 로컬 전용, git 미추적).

## 아키텍처 개요 (routers → services → models/rag)

실시간 판정이나 다단계 에이전트 파이프라인이 필요 없는, CRUD API + RAG 상담 1개 엔드포인트 위주의
비교적 단순한 구조다.

| 레이어 | 위치 | 역할 |
|---|---|---|
| Routers | `backend/app/routers/` | 23개 REST 엔드포인트(health/wedding/category/budget/vendor_case/chat/dashboard) |
| Services | `backend/app/services/` | 비즈니스 로직 |
| Models | `backend/app/models/` | SQLAlchemy 2.0 async, 14개 테이블 |
| RAG | `backend/app/rag/` | indexing(오프라인 색인) / retrieval(하이브리드 검색+RRF) / graph(LangGraph 3노드: retrieve→generate→verify) |

**무인증 MVP** — 로그인 없음, 시드된 단일 `weddings` 행 하나로 데모(BASELINE §0). 실서비스 전환
시에만 인증을 재도입한다.

## 폴더 구조

```
backend/    FastAPI(app/main.py) + SQLAlchemy 2.0 async 모델(app/models/) + Alembic(alembic/)
            + routers/services/rag. backend/old/에 브리프코치 시절 구현 아카이브(lint/test 제외)
frontend/   React + SSE 상담 클라이언트 (Vite+React+TS) — 2026-08-20 기준 아직 브리프코치 화면
            그대로, frontend 브랜치에서 별도 재구성 필요
data/       RAG 코퍼스(DS1_PRICE~DS8_UGC — 참가격/소비자원 사례/표준계약서/정부정책/설문/
            체크리스트/타임라인/UGC). data/old/에 브리프코치 화법 코퍼스 아카이브
db/         콘텐츠 시드(seed/) + 브리프코치 시절 raw-SQL 마이그레이션 아카이브(old/) — 스키마
            자체는 backend/app/models/ + backend/alembic/에 있음
infra/      Bicep(Azure 리소스) + AKS 매니페스트 + ArgoCD — 이전 주제 빌드 그대로 재사용
docs/       docs/wedding/plan/이 현재 설계 문서. 이전 주제들 설계 문서는 docs/old/에 보존(로컬 전용)
```

> **커스텀 모델 학습 없음**: RAG는 학습이 아니라 서비스가 매 요청 호출하는 라이브 컴포넌트라 이
> 레포(`backend/app/rag/`, `data/`)에 있다. Azure OpenAI가 chat/embedding 배포를 분리 제공한다.

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