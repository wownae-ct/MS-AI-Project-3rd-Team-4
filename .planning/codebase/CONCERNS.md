# Codebase Concerns

**Analysis Date:** 2026-08-21

> 범위 메모: 이 문서는 기술적 위험만 다룬다. 제품 주제·도메인은 이번 매핑의 범위 밖이며 추후 별도 절차로 확정될 예정이다(진행 중인 정상 상태이지 결함이 아님). 문서 간 서술 불일치는 "불일치한다"는 사실과 파일 경로까지만 기록하며 내용 비교·판정은 하지 않는다.

## Tech Debt

**대규모 구조 전환이 단일 커밋에 몰려 있고, 그 구조를 전제로 한 참조가 남아 있음:**
- 이슈: `frontend/src/entities/**`(question·answer·practice-session·coach-feedback·report 전체), `frontend/src/features/entry-guard/**`, `frontend/src/pages/{feedback,practice-session,report}/**`, `frontend/src/shared/api/**`, `frontend/src/shared/config/**`, `frontend/src/shared/lib/**`, `frontend/src/app/store/practice-store.ts`(+테스트)가 커밋 `1cd815a`에서 일괄 삭제되고, 같은 커밋에서 `frontend/src/shared/ui/*`(Badge·Card·Money·Page·Tabs·styles.css·theme.css)·`frontend/src/pages/style-guide/**`·`frontend/scripts/**`가 추가됐다. 삭제와 추가가 한 커밋에 섞여 있다(69 파일 · +1052 / −2341).
- 파일: `git show --stat 1cd815a`
- 영향: 코드 자체는 커밋 경계 안에 들어왔으나, 리뷰 단위가 커서 회귀를 추적하기 어렵다. 그리고 삭제된 구조를 전제로 쓰인 참조가 남아 있다 — `frontend/src/vite-env.d.ts:3`의 주석이 아직 삭제된 `src/shared/config/env.ts`를 "값을 읽는 유일한 곳"으로 지목하고, 그 결과 `ImportMetaEnv.VITE_API_BASE` 선언에 현재 소비처가 없다. 문서 쪽 잔존은 아래 "아키텍처 문서" 항목 참고.
- 근거: 커밋 이력에 이미 2회의 대규모 폴더 재구성/레거시 제거가 있었다(`0d5462d`, `4f273b9` — `git log --oneline -20`). `1cd815a`는 그 다음 규모의 전환이다.
- 조치: 남은 참조를 정리한다(`vite-env.d.ts` 주석·미소비 타입 선언, 아키텍처 문서). 다음 대규모 전환에서는 삭제분과 추가분을 논리 단위로 나눠 커밋한다.

**`.oxlintrc.json`에 존재하지 않는 경로용 오버라이드 잔존:**
- 이슈: `frontend/.oxlintrc.json`의 `overrides`에 `"files": ["src/entities/**"]`, `"files": ["src/features/**"]` 규칙 블록이 남아 있으나, 현재 `frontend/src/`에는 `entities/`·`features/` 디렉터리 자체가 존재하지 않는다(커밋 `1cd815a`에서 삭제됨).
- 파일: `frontend/.oxlintrc.json`
- 영향: 지금은 매치 대상이 없어 무해하지만, 두 레이어를 다시 만들 때 이 오버라이드가 실제로 유효한지(문법 오류·규칙 누락) 검증 없이 "이미 있으니 동작하겠지"라고 오신할 위험이 있다. CLAUDE.md류 문서가 이미 경고하는 "overrides는 top-level 규칙을 대체하며 새 override마다 공통 패턴을 반복 기입해야 하는" 함정과 겹친다.
- 조치: 레이어 재도입 시 `--format=json`의 `number_of_rules`로 실제 반영을 재확인한다.

**아키텍처 문서가 삭제된 디렉터리 구조를 서술:**
- 이슈: `frontend/docs/architecture/layers.md`(46·55·66·68·72·104·113·131·138·139·142·145·173-189·233행)와 `frontend/docs/README.md`(50행)가 `entities/{question,answer,practice-session,report}`·`features/entry-guard` 등 현재 작업 트리에 없는 디렉터리 구조를 상세히 전제로 서술한다.
- 파일: `frontend/docs/architecture/layers.md`, `frontend/docs/README.md`
- 영향: 새 기여자가 이 문서를 "현재 배치"로 오독하고 없는 경로를 참조하거나, 실제 코드와 문서 중 무엇이 최신인지 판단하는 데 추가 확인이 필요하다.
- 조치: 두 문서 상단에 "현재 작업 트리와 배치가 다를 수 있음" 경고를 달거나, 구조 확정 후 갱신 시점을 명시한다.

**저장소 내 여러 문서의 서술 불일치 (stale 문서 존재):**
- 이슈: 저장소에 서로 다른 시점·서술을 담은 문서가 공존한다. 루트 `README.md`의 서술은 현재 코드와 무관한 stale 내용이다. `frontend/README.md`, `frontend/docs/README.md`, `frontend/docs/architecture/README.md`는 서로 다른 갱신 시점의 서술을 담고 있다.
- 파일: `README.md`(루트), `frontend/README.md`, `frontend/docs/README.md`, `frontend/docs/architecture/README.md`
- 영향: 어느 문서를 신뢰할지 판단 비용이 매번 발생한다. 각 문서가 실제로 무엇을 말하는지는 이 문서의 판정 대상이 아니다.
- 조치: 문서 신뢰 우선순위를 한 곳(예: `frontend/docs/README.md`)에 명시하고 나머지는 그쪽으로 위임한다.

**디자인 토큰 원본 문서가 frontend 브랜치 히스토리 밖에 있고 path-guard와 충돌:**
- 이슈: `frontend/src/shared/ui/README.md`(4행)와 `frontend/scripts/check-bundle-budget.mjs`(주석)가 `DESIGN.md`·`PRODUCT.md`를 디자인 토큰·CSS 규범의 단일 원본으로 지목한다. 그러나 두 파일은 현재 작업 트리 어디에도 없고(`find`로 미확인), git 상으로는 커밋 `558a463`(저장소 루트 경로)에만 존재하며 그 커밋은 `remotes/origin/backend`에만 도달 가능하다(`git branch --all --contains 558a463`) — `feature/frontend` 히스토리에는 없다.
- 파일: `frontend/src/shared/ui/README.md`, `frontend/scripts/check-bundle-budget.mjs`, `.github/workflows/path-guard.yml`
- 영향: 게다가 `.github/workflows/path-guard.yml`의 `frontend` 브랜치 허용 정규식은 `^(frontend/|docs/|\.github/)`뿐이라, 저장소 루트에 `DESIGN.md`·`PRODUCT.md`를 그대로 추가하는 PR은 `frontend` 브랜치 대상으로는 path-guard에 의해 차단된다. 즉 frontend 코드가 참조하는 SSOT 문서를 frontend 브랜치 자체의 정상적인 PR 절차로는 들여올 수 없는 구조적 불일치가 있다.
- 심각도: 높음 — 디자인 토큰 변경이 필요할 때마다 브랜치를 넘나드는 수작업(`git show <hash>:DESIGN.md`류)이 필요하거나, path-guard 예외가 먼저 정리되어야 한다.
- 조치: `DESIGN.md`·`PRODUCT.md`를 `frontend/docs/` 하위로 옮기거나(path-guard 허용 범위 안), path-guard의 frontend 허용 정규식에 루트 파일 예외를 추가한다.

**ADR 0005 선참조, 미작성:**
- 이슈: `frontend/src/app/App.tsx`(11행)와 `frontend/src/app/App.test.tsx`(5행)가 라우터 도입 결정을 "ADR 0005"로 지칭하지만, `frontend/docs/adr/`에는 `0001`~`0004`까지만 존재한다.
- 파일: `frontend/src/app/App.tsx`, `frontend/src/app/App.test.tsx`, `frontend/docs/adr/`
- 영향: 낮음 — 코드가 미작성 문서를 참조하는 선언적 placeholder이며 빌드·테스트에는 영향 없음. 다만 라우터 도입 시점에 ADR 작성이 누락되면 참조가 끝까지 죽은 링크로 남는다.

**`shared/ui` 공개 API(index.ts) 강제 예외 미해결:**
- 이슈: `frontend/docs/architecture/layers.md`(131행)가 `shared` 세그먼트는 CSS 사이드이펙트 임포트(`frontend/src/app/main.tsx`가 `@/shared/ui/styles.css`를 깊은 경로로 직접 import) 때문에 공개 API(`index.ts`) 경유 강제를 아직 넣지 않았다고 자체적으로 명시한다.
- 파일: `frontend/docs/architecture/layers.md`, `frontend/src/app/main.tsx`
- 영향: 낮음~중간 — `shared/ui` 내부 파일을 슬라이스 밖에서 깊은 경로로 직접 import해도 oxlint가 막지 않는 유일한 레이어다. 다른 레이어(`entities`·`features`·`pages`)는 `no-slice-internals-from-outside` 계열로 강제되는 것과 비대칭이다.

**`VITE_API_BASE` 폴백이 경고에 그치고 실패로 승격되지 않음:**
- 이슈: `.github/workflows/frontend-ci.yml`(68-73행)이 포크 PR 등으로 시크릿이 전달되지 않을 때 `::warning::`만 출력하고 빌드는 계속 진행한다. 코드의 `?? ""` 폴백으로 상대 경로 API 호출 번들이 조용히 만들어진다.
- 파일: `.github/workflows/frontend-ci.yml`
- 영향: 중간 — 의도된 임시 상태로 워크플로 주석에 이미 명시돼 있으나, 백엔드 호스트 확정 후 이 지점을 실패로 승격하지 않으면 실제 배포 빌드에서도 같은 조용한 폴백이 재발할 수 있다.

## Known Bugs

**활성 상태의 알려진 버그는 발견되지 않았다.**
- 확인 방법: `frontend/src/` 전역에 대해 `TODO|FIXME|HACK|XXX` grep — 매치 0건.
- 과거 결함 1건은 커밋으로 수정·게이트화되어 현재는 재발 방지 장치로 다뤄진다 — Fragile Areas의 "`assertProductionBuild` 게이트" 항목 참고.

## Security Considerations

**Gitleaks 스캔 커버리지:**
- 리스크: 시크릿이 커밋에 섞여 들어갈 가능성.
- 파일: `.github/workflows/gitleaks.yml`, `.gitleaks.toml`
- 현재 완화: 모든 push/PR에 대해 `gitleaks/gitleaks-action@v2`가 기본 룰셋(`useDefault = true`)을 확장해 실행되고, `.env`류는 루트 `.gitignore`에서 차단된다.
- 미확인 위험: 이 실행이 실제 CI에서 매번 그린으로 통과해 왔는지는 워크플로 실행 로그 확인 없이는 판단할 수 없다 — 이번 매핑에서는 실행하지 않았다.

**`VITE_*` 빌드타임 노출:**
- 리스크: `VITE_` 접두 환경변수는 정의상 번들에 정적으로 박혀 클라이언트에 공개된다.
- 파일: `frontend/src/vite-env.d.ts:21`(`VITE_API_BASE` 타입 선언). 과거 유일한 읽기 지점이던 `frontend/src/shared/config/env.ts`는 커밋 `1cd815a`에서 삭제됐다 — 위 Tech Debt 첫 항목 참고.
- 현재 상태: `frontend/src/`에 `import.meta.env`를 읽는 코드가 남아 있지 않아 지금 이 순간 노출되는 값은 없다. 진입점을 한 곳으로 좁혔던 설계 의도는 `frontend/docs/architecture/toolchain.md`에만 남아 있고 구현체는 없다.
- 조치 필요: 환경변수를 다시 도입할 때 읽기 지점을 한 곳으로 좁히는 규약을 복원한다(`git show f23d27a:frontend/src/shared/config/env.ts`로 이전 구현 확인 가능). 그때까지 `vite-env.d.ts`의 선언은 소비처 없는 상태다.

**위험 API 패턴 미발견:**
- `frontend/src/` 전역에 `dangerouslySetInnerHTML`·`eval(`·`document.write`·`target="_blank"` 매치 0건 (grep 확인). 코드 규모가 작아(20개 소스 파일) 이 결과의 신뢰 구간도 그만큼 좁다.

## Performance Bottlenecks

**JS 번들 예산 여유 부족:**
- 문제: `npm run build` 실측(2026-08-21) 기준 JS 합계(gzip) 75,588 B / 상한 92,000 B — 상한의 약 82% 사용 중.
- 파일: `frontend/scripts/check-bundle-budget.mjs`(BUDGETS 상수), 실측은 `npm run build` 직접 실행으로 확인
- 원인: 현재 화면이 스타일가이드 1개뿐인데도 이미 82%를 소모했다 — 제품 화면이 추가되면 빠르게 상한에 도달할 수 있다.
- 개선 경로: 화면 추가 시 청크 분할(코드 스플리팅) 여부를 함께 설계하지 않으면 빌드 게이트(`npm run build`)가 반복적으로 막힐 수 있다.

**폰트 자산 raw 용량 여유도 좁음:**
- 문제: 폰트 파일 합계(raw) 2,281,860 B / 상한 2,600,000 B — 약 88% 사용.
- 파일: `frontend/scripts/check-bundle-budget.mjs`
- 원인: Wanted Sans Variable 폰트가 unicode-range로 92개 파일로 분할돼 있고(`frontend/src/shared/ui/styles.css` 경유), 이 자체가 이미 여유의 대부분을 차지한다.

## Fragile Areas

**`assertProductionBuild` 게이트 (제거 시 과거 결함 재발):**
- 파일: `frontend/vite.config.ts`
- 왜 취약한가: 이 플러그인은 `.env`의 `NODE_ENV=development`가 프로덕션 빌드를 개발 시맨틱으로 돌리는 실제 결함(커밋 `f53912a`로 수정됨: 번들 199 kB → 398 kB, 개발자 PC 절대 경로 노출, DEV 전용 코드가 프로덕션에서 실행)을 막기 위해 존재한다. `.env`는 gitignore 대상이라 사람마다 파일이 달라 재발 조건이 항상 남아 있다.
- 안전한 수정: 이 플러그인을 삭제·비활성화하지 않는다. 수정한다면 `configResolved` 조건(`config.mode === "production" && !config.isProduction`)의 의미를 그대로 보존해야 한다.
- 테스트 커버리지: 이 게이트 자체에 대한 자동 테스트는 없다(직접 `vite build` 실행 결과로만 검증 가능) — Test Coverage Gaps 참고.

**`engine-strict=true` (전체 의존성 트리에 적용):**
- 파일: `frontend/.npmrc`
- 왜 취약한가: 파일 자체 주석이 명시하듯 npm 공식 동작상 이 설정은 루트뿐 아니라 **모든 하위 의존성**의 `engines` 필드를 강제한다. 새 패키지 하나가 부정확한 `engines` 범위를 선언하면 `npm ci`/`npm install` 전체가 막힌다.
- 안전한 수정: 설치가 막히면 먼저 어느 패키지의 `engines`가 원인인지 확인한다. `--no-engine-strict`는 문서상으로도 "우회"로 규정돼 있어 임시 조치로만 쓴다.

**`tsconfig.app.json`의 `types: ["vite/client", "vitest/globals"]`:**
- 파일: `frontend/tsconfig.app.json`(23행)
- 왜 취약한가: TypeScript 7의 `noUncheckedSideEffectImports` 기본값이 true라, `vite/client` 타입 선언이 있어야 `import "./styles.css"` 같은 부수효과 CSS import가 타입체크를 통과한다. 이 배열에서 `vite/client`를 빼면 CSS import가 조용히 아니라 타입 오류로 깨지긴 하지만, 원인이 이 한 줄이라는 것을 모르면 진단 시간이 걸린다.
- 안전한 수정: `types` 배열에 항목을 추가할 때 기존 두 항목을 유지한다(배열이므로 값 대체가 아니라 병기임을 확인).

**`check-bundle-budget.mjs`의 CSS 규범 검사는 값 기반 — 패턴 확장 시 실수 여지:**
- 파일: `frontend/scripts/check-bundle-budget.mjs`(`CSS_NORMS`)
- 왜 취약한가: 스크립트 자체 주석이 "속성 이름이 아니라 값을 본다"는 원칙을 명시한다 — `grep box-shadow` 방식은 Preflight의 `:-moz-ui-invalid{box-shadow:none}`(그림자를 제거하는 선언)까지 오탐으로 잡기 때문이다. 이 원칙을 모르고 새 규범을 속성명 매칭으로 추가하면 같은 오탐이 재발한다.
- 안전한 수정: 새 `CSS_NORMS` 항목을 추가할 때도 값까지 포함한 정규식을 쓴다(기존 두 항목의 패턴 형태를 그대로 따른다).

## Scaling Limits

이번 매핑 시점 기준으로 판단할 근거가 부족하다 — 소스 파일 20개, 화면 1개(스타일가이드)뿐인 초기 단계 코드베이스라 트래픽·데이터량 기반의 스케일링 한계를 관측할 지점이 없다. 미확인 위험으로 분류.

## Dependencies at Risk

**TypeScript `~7.0.2` / Vite `^8.2.1` / Vitest `^4.1.10` — 메이저 버전이 최근에 나온 스택:**
- 파일: `frontend/package.json`
- 리스크: 세 패키지 모두 메이저 버전 번호가 새로 올라간 지 오래되지 않은 라인이다(`package-lock.json` 실측 확정 버전: `typescript@7.0.2`, `vite@8.2.1`, `vitest@4.1.10`). pre-release 태그(`-beta`, `-rc`, `-next`)는 붙어 있지 않아 정식 릴리스이지만, 플러그인·타입 정의 생태계의 해당 메이저 지원 범위가 이 저장소가 실제로 밟아본 경로(현재 typecheck/lint/test/build 4게이트 전부 통과, 2026-08-21 실측)보다 넓다는 보장은 없다.
- 근거 문서: `frontend/docs/adr/0002-typescript-7을-단독으로-채택한다.md`(TypeScript 7 채택 근거)
- 완화: 4게이트가 커밋 전 매번 전체 재검증되므로 회귀는 감지된다. 다만 "이 조합으로 동작한다"는 사실이 다른 새 패키지 추가 시에도 유지된다는 보장은 아니다.

**`@base-ui/react@1.7.0` — 접근성 프리미티브 라이브러리:**
- 파일: `frontend/package.json`, `frontend/docs/adr/0004-접근성-프리미티브로-base-ui를-채택한다.md`
- 리스크: 단일 접근성 프리미티브 공급자에 의존한다. `frontend/src/shared/ui/Tabs.tsx` 등 compound 컴포넌트가 이 라이브러리의 API 형태를 직접 감싼다 — 업스트림 breaking change 시 래퍼 계층 전체 영향 범위 확인이 필요하다.

## Test Coverage Gaps

**전체 커버리지 비율:**
- 측정: `frontend/src/`에서 `*.test.ts`/`*.test.tsx` 파일 2개(`frontend/src/app/App.test.tsx`, `frontend/src/pages/style-guide/ui/StyleGuidePage.test.tsx`) vs 비-테스트 `.ts`/`.tsx` 소스 파일 20개. 파일 수 기준 비율 약 10%.
- 실측: `npm test` 결과 — 테스트 파일 2개, 테스트 케이스 13개 통과(2026-08-21).
- 우선순위: 중간 — 코드베이스가 초기 단계라 절대량은 적지만, 비율 자체가 낮다.

**`ErrorBoundary` 테스트 회귀:**
- 이슈: `frontend/src/shared/ui/ErrorBoundary.test.tsx`는 커밋 `1cd815a`에서 삭제된 반면 `frontend/src/shared/ui/ErrorBoundary.tsx`(61행, `componentDidCatch`·`getDerivedStateFromError`·재시도 로직 포함)는 남아 유지된다 — 구현만 남고 테스트가 사라진 회귀다.
- 파일: `frontend/src/shared/ui/ErrorBoundary.tsx`
- 리스크: 렌더 중 예외를 잡는 핵심 안전장치인데 자동 테스트가 없어, 리팩터링 중 회귀가 나도 4게이트 중 `test` 단계에서 잡히지 않는다.
- 우선순위: 높음.

**`shared/ui` 프리미티브 대부분 무테스트:**
- 대상 파일: `frontend/src/shared/ui/Badge.tsx`, `Button.tsx`, `Card.tsx`, `Money.tsx`, `Page.tsx`, `Progress.tsx`, `Tabs.tsx`, `icons.tsx` — 이 8개 파일 중 전용 `*.test.tsx`가 존재하는 것은 0개.
- 리스크: `Money.tsx`처럼 포맷팅 로직(`frontend/src/shared/ui/README.md`가 "화면마다 `toLocaleString`을 직접 부르면 표기가 조용히 갈린다"고 명시한 바로 그 컴포넌트)이 테스트 없이 존재한다 — 표기 회귀가 나도 자동으로 감지되지 않는다.
- 우선순위: 중간~높음(`Money.tsx`), 중간(나머지).

**`style-guide` 하위 섹션 컴포넌트 무테스트:**
- 대상 파일: `frontend/src/pages/style-guide/ui/doc-parts.tsx`, `frontend/src/pages/style-guide/ui/sections/ComponentsSection.tsx`, `FoundationSection.tsx`, `SystemSection.tsx`.
- 리스크: `StyleGuidePage.test.tsx`가 상위 조립만 검증하고(제목·랜드마크 수준으로 추정, 세부 미확인) 각 섹션의 개별 렌더 로직은 커버되지 않을 수 있다 — 미확인 위험으로 분류(섹션별 assertion 존재 여부는 파일을 직접 열어 확인하지 않았다).
- 우선순위: 낮음~중간.

**게이트 자체(빌드 플러그인·스크립트)의 테스트 부재:**
- 대상: `frontend/vite.config.ts`의 `assertProductionBuild` 플러그인, `frontend/scripts/check-bundle-budget.mjs` 전체.
- 리스크: 둘 다 "조용한 실패를 막는" 목적의 코드인데 정작 이 코드 자신에 대한 단위 테스트는 없다. 현재는 실제 `npm run build` 실행으로만 검증 가능하다(2026-08-21 실측: 정상 통과 확인).
- 우선순위: 낮음 — 로직이 짧고 매 빌드마다 실행되어 회귀 시 즉시 드러나는 성격이라 단위 테스트 부재의 실질 위험은 상대적으로 작다.

---

*Concerns audit: 2026-08-21*
