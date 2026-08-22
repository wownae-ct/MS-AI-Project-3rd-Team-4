# `frontend-ci.yml` 은 프론트가 맡습니다 — 인프라 담당자께

> **성격** 공지 (요청 아님) · **작성** 2026-08-22 · **대상 파일** `.github/workflows/frontend-ci.yml` **1개**
> 근거는 전부 공식 문서 또는 이 저장소의 실측으로 확인했습니다. 확인하지 못한 것은 §6 에 그대로 적었습니다.

## 한눈에

| | |
|---|---|
| **무엇을** | `.github/workflows/` 안 **5개 중 `frontend-ci.yml` 하나만** 프론트가 유지보수합니다 |
| **왜** | 이 파일의 내용이 전부 `frontend/` 의 연장이고, **지금은 소유자가 없어 브랜치별 사본이 이미 갈렸습니다** |
| **안 건드리는 것** | 나머지 워크플로 4개 · 배포 스텝 · 시크릿 · 권한 · 트리거 정책 · `CODEOWNERS` · `path-guard` |
| **부탁** | `CODEOWNERS` 에 **한 줄만** 추가해 주세요 → [§5](#5-부탁--구두-합의-대신-codeowners-한-줄) |

---

## 1. 지금 상태 — 이 파일에는 소유자가 없습니다

`frontend-ci.yml` 을 고친 사람이 **세 명**입니다. (`git log --all -- .github/workflows/frontend-ci.yml`)

| 작성자 | 커밋 수 | 내용 |
|---|---|---|
| `wownae-ct` | 2 | 초기 세팅 |
| `jiong` | 3 | Node 버전 20 → 22 → 24 |
| `gunnysis` / `gunny` (프론트) | 5 | 액션 런타임 상향 · 툴체인 전환 · 배포 설정 · 이번 변경 |

그 결과 **같은 파일의 브랜치별 사본이 갈려 있습니다.**

| 브랜치 | 액션 | Node 지정 | 게이트 |
|---|---|---|---|
| `main` · `backend` | `@v7` | `node-version: "24"` | `--if-present` (조용한 통과) |
| **`frontend`** ← 실제로 도는 사본 | **`@v4`** | `node-version: "24"` | `--if-present` |
| `feature/frontend` (이번 변경) | `@v7` | `.nvmrc` 참조 | 게이트 분리 |

`main` 은 액션이 `@v7` 인데 **정작 실행에 쓰이는 `frontend` 사본은 `@v4` 로 남아 있습니다.**
Node 20 런타임은 2026-06-16 마이그레이션 이후 강제 상향 상태이고 2026년 가을에 제거됩니다.

이 구조는 이미 기록돼 있습니다 — `3d2f781` 커밋 메시지 원문:

> *"워크플로는 브랜치별 사본으로 돈다. frontend-ci의 트리거가 `push:[frontend]` + `paths:["frontend/**"]` 라 실제 실행에 쓰이는 건 frontend 라인의 사본이다. **프론트 담당자가 feature/frontend에 같은 2줄 수정을 해야 효과가 생긴다.**"*

**동기화가 사람 손에 달려 있고, 실제로 3일간 안 됐습니다.** 소유자를 정하면 이게 구조적으로 사라집니다.

---

## 2. 왜 이 파일만은 프론트가 맡는 게 맞나

### ① 이 파일의 내용은 전부 `frontend/` 를 가리킵니다

| 요소 | 값 |
|---|---|
| 트리거 | `paths: ["frontend/**"]` · `branches: [frontend]` |
| 작업 디렉터리 | `defaults.run.working-directory: frontend` |
| 실행 명령 | `npm ci` · `npm run lint` · `npm test` · `npm run build` — **전부 `frontend/package.json` 의 스크립트** |
| 배포 대상 | `app_location: frontend/dist` |

**한 줄도 `backend/`·`infra/`·`db/` 를 건드리지 않습니다.** 다른 파이프라인과 공유되는 것은 러너 분뿐입니다.

### ② 프론트 툴체인과 CI 는 한 사슬입니다 — 끊어 두면 게이트가 조용히 사라집니다

실제 사례입니다. 기존 파일은 `npm run lint --if-present` 를 씁니다. npm 사양상 **스크립트가 없으면 `exit 0`** 입니다.
즉 `package.json` 에서 `test` 스크립트가 사라지면 **CI 는 초록불인 채로 검사 없이 배포합니다.**

이 저장소는 실제로 도구를 교체한 적이 있습니다(`dependency-cruiser` → `oxlint`, 2026-08-20). 그때 스크립트 구성이 바뀌었습니다.
프론트가 스크립트를 바꿀 때마다 CI 를 같이 못 고치면, 게이트는 **알림 없이** 무력화됩니다.

### ③ 오히려 인프라 쪽 개입 횟수가 줄어듭니다

이번 변경으로 Node 버전을 `node-version-file: frontend/.nvmrc` 로 바꿨습니다.
앞으로 프론트가 Node 를 올릴 때 **이 파일을 열 필요 자체가 없습니다.** 지금까지는 버전을 올릴 때마다 워크플로를 고쳐야 했습니다(`cfd2f97` 20→22, `b43e2e4` 22→24 — 두 번 다 그랬습니다).

### ④ 범위가 검증 가능합니다

이번 브랜치가 `.github/` 에서 바꾼 파일은 **정확히 1개**입니다. 실측:

```bash
$ git diff --name-only origin/frontend...HEAD -- .github/
.github/workflows/frontend-ci.yml
```

`backend-ci.yml` · `gitleaks.yml` · `infra-deploy.yml` · `path-guard.yml` — **네 개 모두 무변경**입니다.

---

## 3. 지키는 경계 — 안 건드립니다

| 영역 | 상태 | 확인 방법 |
|---|---|---|
| 배포 스텝 (`Azure/static-web-apps-deploy`) | **무변경** | diff 헝크가 배포 스텝 앞에서 끝납니다 |
| `close_pull_request` job | `timeout-minutes: 5` 한 줄 외 무변경 | 동일 |
| 시크릿 이름 · 주입 방식 | **무변경** | `AZURE_STATIC_WEB_APPS_API_TOKEN` · `VITE_API_BASE` 그대로 |
| `permissions:` | **무변경** | `contents: read` · `pull-requests: write` |
| 다른 워크플로 4개 | **무변경** | §2-④ |
| `CODEOWNERS` · `path-guard.yml` | **무변경** | 규칙 자체는 인프라 소유로 둡니다 |

**이 경계를 넘어야 할 일이 생기면 고치기 전에 먼저 알리겠습니다.**

---

## 4. 이번에 바꾼 것 — 8건

각 항목의 근거를 공식 문서로 확인했습니다.

| # | 변경 | 왜 | 근거 |
|---|---|---|---|
| 1 | `actions/checkout@v4 → @v7`<br>`actions/setup-node@v4 → @v7` | `frontend` 사본만 `@v4` 로 남아 있었습니다. Node 20 런타임은 2026 가을 제거 예정 | 태그 실재 확인: checkout **v7.0.1**(2026-07-20) · setup-node **v7.0.0**(2026-07-14) |
| 2 | `node-version: "24"` → `node-version-file: frontend/.nvmrc` | 러너는 24.x 최신, 로컬은 24.19.0 — 값이 두 곳이라 갈립니다 | `setup-node` 는 `.nvmrc` 를 지원합니다 |
| 3 | `cache: npm` + `cache-dependency-path` | 매 실행마다 전량 다운로드 중 | 락파일이 하위 디렉터리라 명시가 필요합니다(액션은 저장소 루트에서 찾습니다) |
| 4 | `Install & lint` 합본 → `Install` / `Typecheck` / `Lint` / `Test` 분리 | 합본이라 실패 시 로그를 열어야 원인을 압니다 | — |
| 5 | **`--if-present` 제거** | §2-② — 스크립트가 없으면 `exit 0` 입니다 | 실측: `npm run nonexistent --if-present` → `exit 0` |
| 6 | `timeout-minutes` 15분 / 5분 | 기본값이 **360분**입니다. 실측 총 소요는 약 90초 | GitHub 공식 (기본 360) |
| 7 | `concurrency` — **PR 만** 취소 | SWA **Free 플랜은 프리뷰 환경 상한이 3개**입니다. `frontend` 브랜치 프로덕션 배포는 취소되지 않게 조건을 걸었습니다 | job 레벨 `concurrency` 와 표현식 `cancel-in-progress` 둘 다 공식 지원 |
| 8 | `paths` 에 이 워크플로 자신을 추가 | 지금은 **이 파일만 고치면 CI 가 아예 안 돌아** 검증되지 않습니다 | SWA 공식 문서 「Monorepo support」 권장 구성 |

> **`VITE_API_BASE` 빈값 경고**(기존 변경)에 대해: 시크릿은 설정돼 있어(2026-08-21) 경고는 **포크 PR 에서만** 울립니다.
> 포크 PR 에 secret 이 전달되지 않는 것은 GitHub 사양입니다.

### 참고 — 고치지 않은 IDE 경고

편집기가 close 스텝에 `Missing required parameter(s): "app_location"` 경고를 냅니다. **오탐입니다.**

- GitHub 공식: *"Actions using `required: true` **will not** automatically return an error if the input is not specified."*
- Microsoft 공식 `close_pull_request_job` 예시도 `azure_static_web_apps_api_token` 과 `action: "close"` **둘만** 씁니다
- 우리 close job 은 실제 실행에서 **성공**했습니다 (run `32381445585`)

경고를 지우려고 `app_location` 을 넣으면 오히려 공식 구성에서 벗어나므로 **그대로 뒀습니다.**

---

## 5. 부탁 — 구두 합의 대신 `CODEOWNERS` 한 줄

지금 `CODEOWNERS` 는 `/.github/ @wownae-ct` 로 폴더 전체를 지정합니다. 아래 한 줄을 **맨 아래에** 추가해 주시면 이 합의가 코드로 남습니다.

```
/.github/workflows/frontend-ci.yml @gunnysis
```

GitHub 공식 문서: *"Order is important; **the last matching pattern takes the most precedence.**"*
→ `/.github/` 규칙은 나머지 4개 워크플로에 그대로 유지되고, 이 파일 하나만 프론트로 넘어갑니다.

**이 줄을 넣지 않으셔도 됩니다.** 그 경우에도 프론트는 이 파일만 고치고 매번 알리겠습니다 — 다만 규칙이 사람 기억에 남게 됩니다.

---

## 6. 확인하지 못한 것 (숨기지 않습니다)

| 항목 | 상태 |
|---|---|
| **npm 캐시의 실제 효과** | **정량화 실패.** 캐시 없던 시절 실행과 비교하려 했으나 의존성 규모가 달라 분리되지 않았습니다. 이 저장소 규모에선 **몇 초** 수준으로 보입니다. 비용이 0이라 넣었을 뿐, 과장하지 않겠습니다 |
| **`output_location: ''`** | Microsoft 의 「Skip building front-end app」 절차는 `app_location` + `skip_app_build: true` 와 함께 `output_location: ''` 를 요구하는데 우리 파일엔 그 한 줄이 없습니다. **현재 배포는 성공하고 있어** 동작 차이는 확인하지 못했습니다. 배포 시맨틱은 인프라 영역이라 **건드리지 않았습니다** — 판단 부탁드립니다 |
| **`frontend` → `main` PR 의 path-guard** | `path-guard.yml` 트리거가 `branches: [backend, frontend]` 라 **`frontend` → `main` PR 에는 돌지 않습니다.** 최종 통합 지점이 무검증입니다. 이건 인프라 영역이라 보고만 드립니다 |

---

## 부록 — 검증 로그

```
4게이트           typecheck ✅ · lint ✅ (진단 0 · 297 rules) · test ✅ · build ✅
YAML              js-yaml 파싱 OK — jobs 2 · steps 8 · timeout 15 · concurrency 있음
path-guard 모의   base=frontend 기준 위반 0건
머지              origin/frontend 대상 충돌 0
번들              합계 gzip 110,629 / 한도 112,000 · 초기 청크 92,874 / 96,000 (변경 전과 동일)
배포 대상 (az)    team4hc-swa · rg project-3rd-team-4 · East Asia · Free · 프로덕션 브랜치 frontend
```

### 인용한 공식 문서

- [GitHub — Deprecation of Node 20 on GitHub Actions runners](https://github.blog/changelog/2025-09-19-deprecation-of-node-20-on-github-actions-runners/)
- [GitHub — Workflow syntax (`concurrency`)](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#concurrency)
- [GitHub — Workflow commands](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-commands)
- [GitHub — Metadata syntax (`inputs.<id>.required`)](https://docs.github.com/en/actions/reference/metadata-syntax-for-github-actions)
- [GitHub — About code owners](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/about-code-owners)
- [Azure — Static Web Apps build configuration (Monorepo support)](https://learn.microsoft.com/en-us/azure/static-web-apps/build-configuration)
- [Azure — Static Web Apps quotas (Free 플랜 프리뷰 환경 3개)](https://learn.microsoft.com/en-us/azure/static-web-apps/quotas)
