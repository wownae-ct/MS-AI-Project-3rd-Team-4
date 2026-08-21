# External Integrations

**Analysis Date:** 2026-08-21

> 제품 주제·도메인은 이번 매핑의 범위 밖(추후 확정 예정)이다. 아래는 코드·CI 설정 파일에서 직접 확인한 연동 사실만 기록한다.

## 현재 상태 요약 (읽기 전 참고)

`frontend/src/` 전체를 대상으로 `fetch(`, `EventSource`, `WebSocket`, `axios`, `import.meta.env` 문자열을 검색한 결과, 실제 네트워크 호출 코드는 **0건**이다(직접 실행한 grep 확인, 2026-08-21). 유일하게 걸리는 것은 `frontend/src/vite-env.d.ts:21`의 타입 선언 `readonly VITE_API_BASE?: string;` 하나이며, 이를 소비하는 코드는 현재 트리에 없다.

아래 경로들은 커밋 `1cd815a`(`feat(frontend)!: src 초기화 + 디자인 시스템 구현`)에서 삭제됐다. 워킹트리에도 HEAD에도 없다:
`frontend/src/shared/api/client.ts`, `frontend/src/shared/api/health.ts`, `frontend/src/shared/api/index.ts`, `frontend/src/shared/config/env.ts`, `frontend/src/shared/config/browser.ts`, `frontend/src/entities/answer/api/index.ts`, `frontend/src/entities/practice-session/api/index.ts`, `frontend/src/entities/question/api/index.ts`, `frontend/src/entities/report/api/index.ts` 등. 즉 이전에는 이 경로들에 백엔드 호출 클라이언트 코드가 있었지만, 2026-08-21 기준 실제 파일로는 존재하지 않는다.

`frontend/src/app/App.tsx`의 주석은 현재 화면이 "임시 상태"이며 스타일가이드 한 화면만 렌더한다고 명시한다(도메인 상세는 매핑 범위 밖).

## APIs & External Services

**백엔드 API:**
- 코드 수준 연동 없음(위 요약 참고).
- `frontend/docs/architecture/toolchain.md` §6.1은 과거 시점 기준으로 `VITE_API_BASE`를 `src/shared/api/client.ts:3`와 `answers.ts:5`가 읽었다고 기록하지만, 두 경로 모두 현재 존재하지 않는다(위 삭제 목록 — 커밋 `1cd815a`).
- `frontend/src/vite-env.d.ts`의 타입 선언만 남아 있고 소비처가 없는 상태 — `frontend/docs/architecture/toolchain.md` §6.5는 `VITE_WS_BASE`(과거에 선언됐던 또 다른 죽은 변수, 현재 `vite-env.d.ts`에는 없음)를 "대응 없는 선언은 지운다"는 원칙으로 언급한다.

**향후 계획을 시사하는 설정(현재 코드로 구현되지 않음):**
- `frontend/staticwebapp.config.template.json` — `__TEMPLATE__` 필드 자체가 "초안 템플릿"이라고 명시하며, 이 파일은 SWA가 직접 읽지 않는다(`staticwebapp.config.json`으로 값 치환 후 저장해야 함 — 그 파일은 현재 존재하지 않음). CSP 초안에 `connect-src 'self' https://__API_HOST__` 플레이스홀더가 있고, `__CSP_NOTE__` 필드는 "전송은 SSE(EventSource) + REST뿐이고 WebSocket 클라이언트가 없다"는 2026-08-20 실측 근거로 `wss:`·`worker-src`·`'wasm-unsafe-eval'`을 뺐다고 기록한다. 이 노트는 문서상 계획이며, 위 grep 결과대로 현재 소스에는 대응하는 네트워크 호출 코드가 없다.

## Data Storage

**데이터베이스:**
- 코드 수준 연동 없음. DB 클라이언트·ORM import 없음(grep 확인).

**파일 저장소:**
- 코드 수준 연동 없음.

**캐싱/클라이언트 저장:**
- `localStorage`, `sessionStorage`, `indexedDB`, Service Worker 사용 코드 없음(grep 확인, `frontend/src/` 전체).
- 상태 관리 라이브러리(`zustand` 등) 미설치 — `frontend/package.json`, `frontend/package-lock.json`, `frontend/node_modules/`에서 확인(상세는 STACK.md "문서 정합성 관찰").

## Authentication & Identity

- 코드 수준 인증 로직 없음(로그인 폼, 토큰 저장, 인증 헤더 부착 코드 없음 — grep 확인).

## Monitoring & Observability

**에러 트래킹:**
- Sentry 등 외부 SaaS 연동 없음. `frontend/package.json` devDependencies/dependencies에 모니터링 SDK 없음.
- 애플리케이션 레벨 방어는 React 컴포넌트로 구현된 `frontend/src/shared/ui/ErrorBoundary.tsx` 하나이며, `frontend/src/app/main.tsx:16`에서 `<App />`을 감싸는 형태로 마운트된다. 외부 서비스로 리포팅하지 않는다(코드에 전송 로직 없음).

**로그:**
- 프론트 런타임 로깅은 브라우저 콘솔 수준 이상의 외부 연동 없음.

## CI/CD & Deployment

**호스팅:**
- Azure Static Web Apps(SWA) — `.github/workflows/frontend-ci.yml`의 `Azure/static-web-apps-deploy@v1` 스텝(`app_location: frontend/dist`, `skip_app_build: true`).

**CI 파이프라인 — `.github/workflows/frontend-ci.yml`:**
- 트리거: `pull_request`(paths `frontend/**`), `push`(branch `frontend`, paths `frontend/**`), `workflow_dispatch`.
- Node 버전 소스: `node-version-file: frontend/.nvmrc`(값 중복 없음), `cache: npm`, `cache-dependency-path: frontend/package-lock.json`(락파일이 하위 디렉터리라 명시 필요).
- 게이트 순서: `npm ci` → `npm run typecheck` → `npm run lint` → `npm test` → `npm run build`(env로 `VITE_API_BASE: ${{ secrets.VITE_API_BASE }}` 주입) → `Azure/static-web-apps-deploy@v1`(조건 `github.ref == 'refs/heads/frontend' || github.event_name == 'pull_request'`).
- 포크 PR 대응: 빌드 스텝에서 `VITE_API_BASE`가 비어 있으면 `::warning::`을 출력하되 빌드는 계속 진행한다(값이 비어도 실패하지 않음 — 코드의 `?? ""` 폴백 가정, 단 실제 폴백 코드는 현재 삭제된 상태라 이 경고 로직 자체는 유효하나 대응하는 소비 코드는 없음).
- PR close 시 `close_pull_request` job이 SWA 프리뷰 환경을 닫는다(`action: close`).
- 사용 secrets: `secrets.VITE_API_BASE`, `secrets.AZURE_STATIC_WEB_APPS_API_TOKEN`, `secrets.GITHUB_TOKEN`.

**기타 워크플로 — `.github/workflows/`:**
- `path-guard.yml` — `frontend`/`backend` 대상 PR의 변경 경로가 브랜치 소유 범위(`frontend/`, `docs/`, `.github/` 등)를 벗어나면 CI 실패. 브랜치별 허용 정규식을 스텝 내 셸 스크립트로 직접 검사(`git diff --name-only origin/<base>...HEAD`).
- `gitleaks.yml` — 모든 `push`/`pull_request`에서 `gitleaks/gitleaks-action@v2` 실행. 설정 파일 `.gitleaks.toml`(저장소 루트) 참조.
- `infra-deploy.yml` — Azure Bicep 인프라(`infra/bicep/**`) 검증·배포. OIDC 기반 `azure/login@v2`(secrets: `AZURE_CLIENT_ID`, `AZURE_TENANT_ID`, `AZURE_SUBSCRIPTION_ID`; variable: `AZURE_RG`). `az bicep build` → `az deployment group what-if` → (workflow_dispatch에서 `whatIf: false`일 때만) `az deployment group create`. 프론트엔드 앱 코드와는 별개 관심사이며 `frontend/` 브랜치 소유 범위 밖.
- `backend-ci.yml` — `backend` 브랜치 전용(트리거 paths `backend/**`, `data/**`, `db/**`). ruff lint → pytest(uv) → Docker 빌드 → ACR push, 배포는 ArgoCD Image Updater가 담당(직접 배포 스텝 없음). **`backend/` 폴더 자체가 현재 브랜치(`feature/frontend`)의 워킹트리에 존재하지 않는다** — 브랜치별 폴더 소유권 구조상 참고용으로만 기록.

## Environment Configuration

**필요 env vars(프론트):**
- `VITE_API_BASE` — 선택값(`frontend/src/vite-env.d.ts:21`), 소비 코드 없음(위 요약). CI에서는 `secrets.VITE_API_BASE`로 주입 시도.

**시크릿 보관 위치:**
- GitHub Actions repo secrets: `VITE_API_BASE`, `AZURE_STATIC_WEB_APPS_API_TOKEN`(`frontend-ci.yml`), `AZURE_CLIENT_ID`/`AZURE_TENANT_ID`/`AZURE_SUBSCRIPTION_ID`(`infra-deploy.yml`, OIDC).
- GitHub Actions repo variables: `AZURE_RG`(`infra-deploy.yml`).
- 로컬 시크릿 스캔: `.gitleaks.toml`(저장소 루트) — `[extend] useDefault = true`로 gitleaks 기본 룰셋 확장, allowlist 경로 패턴 3건: `\.env\.example$`, `docs/.*\.(pdf|docx|xlsx|pptx|html)$`, `uv\.lock$`.
- `frontend/.env`, `frontend/.env.example` 존재 확인(내용 미독 정책 — STACK.md 참고). `.env.example`은 프론트 키 1개(`VITE_API_BASE`)와 Azure 인프라 키 다수(값 전부 빈 플레이스홀더)를 포함한다.

## Webhooks & Callbacks

**수신:**
- 없음 — 이 브랜치는 정적 SPA 산출물만 배포하며 서버 사이드 엔드포인트 코드가 없다.

**발신:**
- 없음(코드 수준 네트워크 호출 0건, 위 요약 참고).

---

*Integration audit: 2026-08-21*
