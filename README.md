# 브리프코치 (BriefCoach)

SeSAC MS AI 엔지니어 4기 3차 프로젝트 (2인 팀). 기술직을 위한 AI 화법 트레이너 — 기술면접/고객설명/
장애보고 상황을 제한시간 안에 음성으로 연습하면, 두괄식·STAR 구조·간결성 기준으로 RAG 근거검증을 거친
코칭 피드백을 받는다. 이전 주제("크로스핏 폼 코치", 웹캠 기반 실시간 운동 자세 코칭)에서 인프라·협업
구조는 그대로 두고 주제만 전환(2026-08-19)했다. 현재 설계 문서는 `docs/new/plan/브리프코치_*.md` 6종
(로컬 전용, git 미추적).

## 아키텍처 개요 (S0~S5 단계)

실시간(<20ms) 판정이 필요했던 이전 구조(T0~T4)와 달리, "답변 후 피드백"이라 훨씬 단순한 선형
파이프라인이다.

| 단계 | 위치 | 역할 |
|---|---|---|
| S0~S1 | frontend | 질문/타이머 표시, 답변 녹음 → 서버 업로드 |
| S2 | backend | STT 전사 + 필러워드/wpm/문장수 등 결정론적 지표 추출 (비-LLM) |
| S3 | backend | 코칭 에이전트 — 두괄식/STAR 구조 판정 + 전달력 피드백 스트리밍(SSE) |
| S4 | backend | 근거검증 에이전트 — RAG로 코칭 코멘트가 화법 가이드 코퍼스에 근거하는지 확인, 실패 시 재시도/강등 |
| S5 | backend worker | 세션 리포트(반복 약점 패턴, 다음 연습 추천, 비동기) |

## 폴더 구조

```
backend/    FastAPI 게이트웨이 + 에이전트(coach/verify/planner/retriever) + LangGraph 오케스트레이션
            + 결정론적 지표 추출(metrics/) + STT(stt/) + RAG 인덱싱(rag/)
frontend/   React + SSE 피드백 클라이언트 + 답변 녹음 (Vite+React+TS)
data/       RAG 코퍼스(STAR/화법 가이드 문서) — 이전 주제의 운동/부상 가이드 아님
db/         번호 붙인 SQL 마이그레이션 파일(migrations/) + 러너(migrate.py) + 시드 데이터 — ORM 없음
infra/      Bicep(Azure 리소스) + AKS 매니페스트 + ArgoCD — 이전 주제 빌드 그대로 재사용
docs/       docs/new/plan/이 현재 설계 문서. 이전 주제 설계 문서는 docs/old/에 보존(로컬 전용)
```

> **커스텀 모델 학습 없음**: 이전 주제는 별도 `ml` 레포에서 포즈판정 모델(TCN)을 학습해 ONNX로
> 서빙했는데, 이번 주제는 커스텀 학습이 전혀 없다 — STT는 서드파티 API(Azure OpenAI
> Whisper/gpt-4o-transcribe) 호출일 뿐이다. RAG는 학습이 아니라 서비스가 매 요청 호출하는 라이브
> 컴포넌트라 이 레포(`backend/rag/`, `data/`)에 있다.

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
