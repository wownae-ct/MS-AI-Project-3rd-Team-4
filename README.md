# AI 홈트레이닝 코치 (서비스명 미정)

SeSAC MS AI 엔지니어 4기 3차 프로젝트 (2인 팀). 웹캠 기반 실시간 자세 인식 + 멀티 에이전트 코칭 앱.
크로스핏 + 일반 헬스 동작 데이터를 함께 다룬다. 아키텍처 기준 문서는 `docs/설계/wave0_contract.html`,
`docs/설계/design_meeting_final_5.html` 참고.

## 아키텍처 개요 (T0~T4 티어)

| 티어 | 위치 | 역할 |
|---|---|---|
| T0 | frontend | MediaPipe Pose로 관절 좌표 추출 |
| T1 | frontend | 룰엔진 판정 + 렙 카운트 (서버 왕복 없음) |
| T2 | backend | TCN 자세 판정 + 코칭 문장 스트리밍 (coach agent) |
| T3 | backend | RAG + guardrail 안전 판정 (safety agent) |
| T4 | backend worker | 세션 리포트/다음 처방 (planner agent, 비동기) |

## 폴더 구조

```
backend/    FastAPI 게이트웨이 + 에이전트(coach/safety/planner/retriever) + RAG 인덱싱(rag/) + ONNX 추론(app/inference/)
frontend/   React + MediaPipe(T0) + 룰엔진(T1) + WS 클라이언트
data/       RAG 코퍼스(운동/부상 가이드 문서) — 이미지/영상 학습 데이터셋 아님
db/         ORM(SQLAlchemy async) + 초기 시드 데이터
infra/      Bicep(Azure 리소스) + AKS 매니페스트 + ArgoCD
docs/       설계 문서, 제안서, 회의록
```

> **레포 분리**: 포즈/TCN 모델 학습(데이터셋, 노트북, 체크포인트)은 별도 **ml 레포**에서 진행한다.
> 이 레포는 학습된 모델을 ONNX로 받아 `backend/models/`에 두고 `backend/app/inference/`에서 서빙만 한다.
> RAG는 학습이 아니라 서비스가 매 요청 호출하는 라이브 컴포넌트라 이 레포(`backend/rag/`, `data/`)에 남겼다.

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
