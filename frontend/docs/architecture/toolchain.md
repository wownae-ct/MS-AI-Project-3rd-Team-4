# 툴체인 — 런타임 · 빌드 · 타입 · CI 게이트

> **최종 갱신** 2026-08-21 · **성격** 적용 설계 — 규범이 아니라 이 저장소의 결정과 근거.
> 결정 기록은 [ADR 0002](../adr/0002-typescript-7을-단독으로-채택한다.md).
> 버전·기본값·EOL 일정은 **전부 1차 출처로 확인**했다 (§6).

## 빠른 이동

| 찾을 때 | 이동 |
|---|---|
| 현재 기준선 | §1 |
| Node 24 단일화 | §2 |
| TypeScript 7 단독 채택 | §3 |
| 빌드·타입 게이트 | §4 |
| CI 게이트 | §5 |
| 환경변수 | §6 |
| 설계서 개정 사항 | §7 |
| 검증 (터미널·브라우저) | §8 |

---

## 1. 현재 기준선 (2026-08-21 실측 — 디자인 규범 구현 C1~C8 이후)

이후 모든 회귀 비교의 기준이다. 이 값이 깨졌다면 **내 변경이 원인**이라고 먼저 가정한다.

| 항목 | 값 |
|---|---|
| `oxlint --format=json .` | **30 files** · **297 rules** · 진단 0 (게이트 모듈 `scripts/lib/` 5파일이 추가됐다) |
| `vite build` 산출물 | JS **243,625 B**(gzip L9 76,837 B) · CSS **58,805 B**(gzip L9 @font-face 제외 3,566 B) · 폰트 92개 2,281,860 B · 절대경로 0 · 개발 JSX 0 |
| 디자인 규범 게이트 | 팔레트 8색 + 투명 1 · 라운드 토큰 4종 · 폐기 6/6종 · 위반 0 — 그림자·링 / 팔레트 밖 색 / 라운드 / 다크모드 / 폐기 유지 / 소스 토큰 |
| `vitest run` | **6개 파일 · 68개 테스트 통과** — 화면 17 + 게이트 픽스처 41 + 폐기 계약 8 + 유령 후보 4 (순서: [`../design/implementation-plan.md`](../design/implementation-plan.md)) |
| `typescript` | **`~7.0.2`** (단독 — 별칭 병존 없음) |
| `engines.node` · `.nvmrc` | `^24.15.0` · `24.19.0` |
| CI | `install → typecheck → lint → test → build` |
| `npm install` 경고 | **0건** — `engine-strict=true`로 실패 승격됨 (§2.5) |
| 경계 강제 | oxlint (`dependency-cruiser` **제거됨**) |
| 스타일 강제 | Tailwind 팔레트·라운드·그림자 네임스페이스 폐기 + `jsx-a11y` + 번들 예산/디자인 규범 게이트(`lightningcss` 파서, 주입 시험 통과) |
| 브라우저 (§8.2) | 무스로틀 LCP **0.14 s** · INP **0 ms** / Slow 4G **LCP 1.29 s · CLS 0.01** |
| 첫 방문 전송 (Slow 4G) | **≈ 502 kB** — 그중 **폰트 408,988 B (81%)** · 조각 18/92 |

> **CSS 의 대부분이 `@font-face` 선언**이다(Wanted Sans 92조각 unicode-range 서브셋). Tailwind 유틸리티는 gzip **3.5 kB 대** 뿐이고 나머지 약 80%가 `@font-face` 다. 그래서 예산 게이트는 둘을 **분리해서** 잰다 — 합산하면 폰트 선언이 예산을 다 먹어 유틸리티 증가를 감지하지 못한다. (위 수치가 문서마다 세대가 섞여 있었다 — 회귀 기준은 **게이트가 출력하는 값**이다. 이 표는 그 값을 옮겨 적는다.)
>
> **테스트 수 94 → 13 → 68** — 13 으로 준 것은 2026-08-20 주제 전환으로 이전 주제 코드를 전부 제거했기 때문이고(회귀 아님), 68 로 는 것은 디자인 규범 게이트의 픽스처·계약 테스트가 `scripts/lib/__tests__/` 에 추가됐기 때문이다. 화면 S1~S6 이 붙으면 화면 테스트가 다시 늘어난다.

검증은 **4게이트**다 — `typecheck · lint · test · build`. `build`는 마지막에 `scripts/check-bundle-budget.mjs`를 부른다(§5.3).

---

## 2. 런타임 — Node 24 단일화

### 2.1 하한 근거

**`jsdom@30.0.1`이 하한을 결정한다.** 실측한 `engines` 필드:

```
^22.22.2 || ^24.15.0 || >=26.0.0
```

프로젝트 전 의존성 중 가장 좁은 범위이며, 24 계열 하한이 `24.15.0`인 이유가 여기 있다.

### 2.2 확정값

| 대상 | 값 |
|---|---|
| `package.json` `engines.node` | `^24.15.0` (허용 범위) |
| `frontend/.nvmrc` | `24.19.0` (**정확 버전의 단일 출처**) |
| CI | `node-version-file: frontend/.nvmrc` |

`24.19.0`은 24.x 최신 릴리스다.

**CI에 버전을 다시 적지 않는다.** `setup-node`의 `node-version-file`이 `.nvmrc`를 직접 읽으므로 로컬과 CI가 갈라질 수 없다. 값을 두 곳에 적으면 한쪽만 올리는 사고가 반드시 나온다.

> `setup-node`의 npm 캐시를 쓸 때는 `cache-dependency-path: frontend/package-lock.json`이 **필수**다. 이 액션은 `defaults.run.working-directory`를 따르지 않아, 명시하지 않으면 저장소 루트에서 락파일을 찾다 실패한다.

### 2.3 릴리스 일정

[nodejs/Release `schedule.json`](https://raw.githubusercontent.com/nodejs/Release/main/schedule.json) 확인값:

| 항목 | v24 (Krypton) |
|---|---|
| Active LTS 시작 | 2025-10-28 |
| **Maintenance 진입** | **2026-10-20** |
| EOL | **2028-04-30** |

**Node 24는 두 달 뒤 Maintenance LTS로 넘어간다.** 채택 결론은 유지된다 — EOL 2028-04-30까지 보안 패치가 이어지고, 프론트엔드는 SWA 정적 배포라 런타임 영향이 CI·로컬에 한정되기 때문이다. 다만 "채택 시점 Active LTS"라는 표현은 곧 사실이 아니게 되므로 여기 기록해 둔다.

### 2.4 하한 미달이 어떻게 드러났고 해소됐나 ✅

착수 시점 로컬 Node는 `v24.11.1`로 **하한 `24.15.0` 미달**이었다. `engines`·`.nvmrc`·`packageManager` 어느 고정 장치도 없어 아무도 모른 채 지나갔다.

로드맵 1단계에서 `engines`를 넣자 `npm install`이 `EBADENGINE`을 2건(`frontend@0.0.0`·`jsdom@30.0.1`) 내며 **상태가 드러났다.** `24.19.0`으로 올려 **경고 0건**이 됐다.

### 2.5 재발 방지 — `engine-strict=true` ✅ 적용 (2026-08-20)

`engines`만으로는 부족하다. **npm은 EBADENGINE을 "경고"로만 내고 exit 0으로 통과한다.** 경고는 스크롤에 묻히고, 실제로 그래서 하한 미달이 오래 방치됐다.

`frontend/.npmrc`에 `engine-strict=true`를 두어 **실패로 승격**했다.

| 조건 | 결과 (실측) |
|---|---|
| `engines`만 | `EBADENGINE` 경고 5줄 · **exit 0** — 통과해 버린다 |
| `engine-strict=true` | `npm error engine Unsupported engine` · **exit 1** — 차단 |

게이트가 실제로 막는지 주입으로 확인했다 — `engines.node`를 `>=99.0.0`으로 바꾸자 `.npmrc`만으로(플래그 없이) `npm install`이 exit 1이 됐고, 되돌리자 exit 0으로 복귀했다.

> ### ⚠️ 적용 범위는 루트만이 아니다
>
> 공식 문서: *"npm will stubbornly refuse to install (or even consider installing) **any package** that claims to not be compatible with the current Node.js version."* — [npm config](https://docs.npmjs.com/cli/v11/using-npm/config#engine-strict)
>
> **모든 의존성의 `engines`가 강제된다.** 깊은 의존성 하나가 낡거나 잘못된 범위를 선언하면 설치가 막힐 수 있다. 현재 트리는 Node 24.19.0에서 전부 통과함을 확인했다(`npm install`·`npm ci` 둘 다 `--dry-run --engine-strict`).
>
> 새 의존성을 넣고 설치가 막히면 **그 패키지의 `engines`를 먼저 본다.** 임시 우회는 `npm install --no-engine-strict`지만 그건 우회이므로, 원인(패키지 교체·업스트림 수정)을 따로 처리한다.
>
> `.npmrc`는 **커밋된다** — gitignore 대상이 아님을 확인했다. 팀 전원에게 같은 게이트가 걸려야 의미가 있다.

#### nvm-windows를 쓸 때 알아둘 것 (실측 2026-08-20)

| 사실 | 근거 |
|---|---|
| **`.nvmrc`를 읽지 못한다** | `nvm --help` 전문 — `use`는 명시적 버전·`latest`·`lts`·`newest`만 받는다. 이 저장소의 `.nvmrc`는 **CI에서만** 자동 적용된다(`fnm`은 읽는다) |
| `nvm arch` / `nvm list`가 **32-bit로 잘못 보고한다** | PE 헤더가 `0x8664`(x86-64)이고 `process.arch`도 `x64`인데도 그렇게 나온다. **표시 버그다** |
| 그 오보는 **설치에 영향이 없다** | `nvm install <ver>`을 arch 없이 실행해 확인 — 64비트가 설치됐다. `--help` 원문도 *"defaults to **system arch**"*이고 System Default는 64-bit다 |
| 고칠 방법이 없다 | `nvm-windows 1.2.2`가 최신 릴리스(2025-01-01)다. `settings.txt`에 `arch: 64`를 넣어도 보고는 바뀌지 않는다(실측). 관련: [issue #134](https://github.com/coreybutler/nvm-windows/issues/134) |

> **"32-bit"라는 표시를 보고 재설치하지 말 것.** 실제 아키텍처는 `node -p "process.arch"`로 확인한다.
> 이 항목을 남기는 이유는 조사 과정에서 그 오보를 실제 결함으로 오인해 시간을 썼기 때문이다.

---

## 3. TypeScript — 7 단독 채택

### 3.1 왜 단독인가

설계서는 `typescript` 6과 7을 npm 별칭으로 **병존**시키는 구성을 규정한다. 그 구성이 필요한 이유는 단 하나 — `dependency-cruiser`가 TypeScript 컴파일러 API를 요구하는데 TS 7에 그 API가 없기 때문이다.

공식 발표 원문:

> "TypeScript 7.0 does not yet expose a stable programmatic API, and so tools (such as Volar) which embed TypeScript into their own compilers … can only currently rely on TypeScript 6.0."
> "We expect TypeScript 7.1 to ship with a new (and different) API."

실측으로도 확인된다:

```
$ npx depcruise --info
✔ typescript             >=2.0.0 <7.0.0      typescript@6.0.3
```

`dependency-cruiser@18.2.0`의 지원 상한이 `<7.0.0`이다. TS 7을 단독 설치하면 이 줄이 `x`가 되고 **`.ts` 파싱이 에러 없이 빠진다.**

→ [layers.md](layers.md)에서 경계 강제를 oxlint로 옮기면 이 의존이 사라진다. **병존은 목적이 아니라 도구 하나를 살리기 위한 우회였다.**

### 3.2 채택값

```jsonc
"typescript": "~7.0.2"    // 별칭 없음. tsc 하나.
```

틸드 핀으로 패치만 허용한다.

### 3.3 이 저장소의 적합성 — 문법적 차단 요인 0건

TS 7이 **제거**한 항목과 현재 `tsconfig.app.json`을 대조했다.

| TS 7이 제거한 것 | 현재 설정 | 판정 |
|---|---|---|
| `target: es5` | `ES2022` | ✅ |
| `module: amd \| umd \| systemjs \| none` | `ESNext` | ✅ |
| `moduleResolution: node \| node10 \| classic` | `Bundler` | ✅ |
| `baseUrl` | 미사용 | ✅ |
| `downlevelIteration` | 미사용 | ✅ |
| `esModuleInterop: false` · `allowSyntheticDefaultImports: false` | 미설정 | ✅ |
| `alwaysStrict: false` | 미설정 | ✅ |

**하나도 쓰지 않는다.** 전환을 막는 문법 요인이 없다.

### 3.4 기본값 변경 — 실제 리스크 표면

설계서가 다루지 않은 부분이다. TS 7은 다음 기본값을 바꿨다.

| 옵션 | TS 7 기본값 | 이 저장소 영향 |
|---|---|---|
| `strict` | `true` | 이미 명시 — 무영향 |
| `module` | `esnext` | 이미 명시 — 무영향 |
| `types` | `[]` | 이미 명시(`vite/client`·`vitest/globals`) — 무영향 |
| `rootDir` | `./` | `noEmit`이라 무영향 |
| `libReplacement` | `false` | 무영향 |
| `stableTypeOrdering` | **`true`, 해제 불가** | 무영향 (declaration emit 없음) |
| `noUncheckedSideEffectImports` | **`true`** | **확인 필요** — 아래 |

**유일한 확인 대상이었던 것**: `src/app/main.tsx`의 CSS 사이드이펙트 import 2줄이 검사 대상이 된다.

> ### ✅ 실측 결과 (2026-08-20) — 통과, 그리고 숨은 결합 하나
>
> `noUncheckedSideEffectImports`는 **기본 활성이 맞다.** 확장자 없는 미존재 모듈을 사이드이펙트 import하면
> `TS2882: Cannot find module or type declarations for side-effect import`로 실패한다.
> (`--showConfig`는 명시된 옵션만 보여주고 기본값은 표시하지 않아 이 확인에 쓸 수 없다 — 프로브가 필요했다.)
>
> **CSS import는 통과한다.** `vite/client`가 `*.css` 와일드카드 모듈을 선언하기 때문이다.
>
> → **여기에 결합이 생긴다.** `tsconfig`의 `types`에서 `"vite/client"`를 빼면 `main.tsx`의 CSS import가
> **타입 오류로 바뀐다.** TS7 이전에는 아무 일도 없었다. `types` 배열을 건드릴 때 이 점을 기억할 것.

### 3.5 전환 절차와 되돌림

`dependency-cruiser` 제거([layers.md §6 C단계](layers.md#6-도입-순서--순서가-곧-안전장치))가 **선행 조건**이었다. 그 뒤:

1. `typescript`를 `~7.0.2`로 올린다
2. `npm run typecheck`(`tsc -b`) 통과 확인 — §3.4의 CSS import 항목 포함
3. `lint` · `test` · `build` 통과 확인
4. 실패 시 `~6.0.3`으로 복원

**되돌림은 1줄이다.** 별칭 2줄 제거·6단계 절차·롤백 경로·3중 해소 지표가 전부 불필요해진다.

> **적용 완료 (2026-08-20).** 4게이트 전부 통과했고 **빌드 산출물 해시가 TS 6 때와 동일**했다(`index-iKsf7_kE.js`) — 타입 검사만 교체됐고 변환 결과는 그대로라는 뜻이다(변환은 esbuild 담당).
>
> `tsc -b`가 실제로 검사하는지도 확인했다 — 의도적 타입 오류를 넣자 `TS2322`로 실패했다. 통과가 "검사 안 함"이 아니라는 확인이다.

### 3.6 성능에 대한 정직한 기록

TS 7의 홍보 문구는 빌드 8~12배 향상이다. **이 저장소에서는 체감되지 않는다** — 50 모듈 규모에서 절약되는 것은 초 단위다.

**이 전환의 동기는 속도가 아니라 단순화다.** 컴파일러 2개 병존과 그에 딸린 절차 전체를 없애는 것이 목적이다. 규모가 커져 속도가 실익이 되면 그때는 덤이다.

병렬 타입 검사 플래그(`--checkers`, 기본 4 · `--singleThreaded` · `--builders`)는 **지금 규모에서 조정할 이유가 없다.** 조정하게 되면 로컬과 CI에 같은 값을 핀으로 고정한다 — 값이 다르면 결과가 갈린다.

---

## 4. 의존성 스펙

기준일 **2026-08-21** — `package-lock.json` 실측(lockfileVersion 3). 「채택」은 lock 에 설치된 버전이다. 별도 표기가 없으면 캐럿 범위 + lock 고정.

| 패키지 | 채택 (lock) | 선언 | 비고 |
|---|---|---|---|
| `react` / `react-dom` | 19.2.8 | `^19.2.8` | |
| `@types/react` / `@types/react-dom` | 19.2.18 / 19.2.4 | `^` | `@base-ui/react` 가 `@types/react` 를 런타임 의존으로 끌어올린다(lock 에서 `dev=false`) |
| `vite` | **8.2.1** | `^8.2.1` | `build.target` 명시 필수. 이 표가 한때 「최신 8.2.2」로 적혀 있었으나 **lock 은 8.2.1** 이다 — 최신 여부는 `npm outdated` 로 본다, 문서에 박지 않는다 |
| `@vitejs/plugin-react` | 6.0.5 | `^` | |
| `typescript` | **7.0.2** | **`~7.0.2`** | 틸드 핀(패치만 허용). **별칭 없음** (§3) — 적용 완료 |
| `tailwindcss` / `@tailwindcss/vite` | **4.3.3** | **정확 핀** | ADR 0003. 정확 핀인 이유 — 네임스페이스 폐기 범위와 유틸리티 방출 형태에 게이트·테스트가 의존한다. 올릴 때 폐기 계약 테스트가 먼저 알린다 |
| `@tailwindcss/oxide` | **4.3.3** | **정확 핀** | `@tailwindcss/vite` 의 전이 의존이지만 유령 후보 테스트가 스캐너를 직접 쓰므로 명시. **tailwindcss 와 함께 올린다** |
| `lightningcss` | 1.33.0 | `^1.33.0` | 디자인 규범 게이트의 CSS 파서. `vite` 가 선언한 전이 의존(같은 범위)이지만 암묵적으로 쓰지 않고 명시 |
| `@base-ui/react` | **1.7.0** | **정확 핀** | ADR 0004. 패키지명은 `@base-ui/react` (`@base-ui-components/*` 아님) |
| `wanted-sans` | **1.0.3** | **정확 핀** | 폰트 self-host. `variable/split` 92조각 |
| `vitest` | 4.1.10 | `^4.1.10` | |
| `oxlint` | 1.78.0 | `^1.78.0` | 297 rules (plugins 7종) |
| `jsdom` | 30.0.1 | `^` | **Node 하한 결정 패키지** (§2.1) |
| `@testing-library/react` / `jest-dom` / `user-event` | 16.3.2 / 7.0.1 / 14.6.5 | `^` / `^` / **정확** | |
| ~~`zustand`~~ | **제거됨** (2026-08-21, src 초기화 `1cd815a`) | | 스토어가 필요한 화면이 없다. 라우터·상태는 ADR 0005 이후 |
| ~~`dependency-cruiser`~~ | **제거됨** (2026-08-20) | | §3.1 · [ADR 0001](../adr/0001-경계-강제를-oxlint로-일원화한다.md) |

**정확 버전 고정은 `npm i -E`** — `npm i pkg@x.y.z`는 캐럿이 붙어 기록된다.
**전이 의존을 코드에서 직접 import 하면 `devDependencies` 에 명시한다** — 암묵적 전이 의존은 상위 패키지가 의존을 바꾸는 순간 조용히 깨진다(`lightningcss` · `@tailwindcss/oxide` 가 그 예).

---

## 5. 빌드 · 타입 · CI 게이트

### 5.1 빌드·타입 스펙

| 항목 | 값 | 근거 |
|---|---|---|
| 빌드 파이프라인 | `tsc -b && vite build` | 타입 검사와 변환을 분리 — 컴파일러 교체 비용 최소화 |
| Project References | `files: []`, `references: [app]` | **app 단독.** 아래 §5.2 |
| `target` / `lib` | `ES2022` | 문법이 변환 단계에서 깎이지 않게 |
| `build.target` | `["chrome111", "edge111"]` | Vite 기본값 위임 금지 — 명시 배열 고정 |
| `paths` | `{ "@/*": ["./src/*"] }` | **`baseUrl` 없이.** TS 7 호환 형태 ([layers §3.1](layers.md#31-baseurl-없이-paths만)) |
| 별칭 해석 | `resolve.tsconfigPaths: true` | Vite가 tsconfig `paths`를 직접 읽는다 — 별칭 정의를 중복하지 않는다. 수동 `alias`는 절대 경로가 필요해 `@types/node` 의존을 부른다 |

### 5.2 worker 격리 — 조건부 보류

설계서는 Project References를 `[app, worker]`로 규정하고 `tsconfig.worker.json`에 `lib: ["ES2022","WebWorker"]`, `types: []`를 두어 Worker의 DOM 의존을 컴파일 에러로 막게 한다.

**지금은 적용 대상이 없다** — `tsconfig.worker.json`도 Worker 진입점도 활성 트리에 존재하지 않는다. 그대로 적용하면 존재하지 않는 프로젝트를 참조하게 된다.

→ **폐기가 아니라 보류다.** Worker 진입점이 활성 트리에 최초로 추가되는 시점에 `tsconfig.worker.json`을 **함께** 도입한다. 그때 DOM 타입을 쓰면 컴파일이 실패하는 구조를 세우는 것이 요점이며, Worker 코드가 먼저 들어온 뒤에 격리를 붙이면 이미 DOM에 의존한 코드를 되돌려야 한다.

### 5.3 CI 게이트 ✅ 적용 완료 (2026-08-20)

`.github/workflows/frontend-ci.yml` 실물 기준 — `install → typecheck → lint → test → build → SWA 배포`. 아래 표는 **무엇을 왜 그렇게 했는지**의 기록이다(한때 「할 일」로 적혀 있었으나 전부 적용됐다 — §1 기준선과 어긋나 있던 것을 정정).

| 조치 | 상태 | 내용 |
|---|---|---|
| Node 핀 | ✅ | `node-version-file: frontend/.nvmrc` — **CI 에 버전을 다시 적지 않는다**(§2.2). 값을 중복하면 로컬과 갈린다 |
| 캐시 | ✅ | `cache: npm` + `cache-dependency-path: frontend/package-lock.json` (락파일이 하위 디렉터리라 명시 필요) |
| **typecheck 스텝** | ✅ | `npm run typecheck` — 빌드 실패보다 먼저, 더 빠르게 잡는다 |
| **`--if-present` 없음** | ✅ | 아래 ① |
| **검사 대상이 비지 않았는지** | ✅ 불필요 | 아래 ② — oxlint 은 대상 0개면 스스로 exit 1 |
| **포크 PR의 빈 secret** | ⚠️ 잠재 | 아래 ③ — 근본 해결은 [§6.3](#63-진짜-문제는-값이-아니라-폴백이다). 워크플로 주석이 아직 삭제된 `?? ""` 코드를 언급한다(낡음, 무해) |

#### 조용한 실패 차단 3건

**① `--if-present`를 쓰지 않는다.** 현재 `npm run lint --if-present`·`npm run test --if-present`인데, 이 플래그는 스크립트가 없으면 **성공으로 처리한다.** 스크립트 이름이 바뀌거나 지워지면 게이트가 조용히 사라진다. 스크립트는 항상 존재해야 하는 것이므로 플래그를 뺀다.

**② 검사 대상이 비었는지 — 도구마다 다르다.** 설계서 §3.2는 `depcruise` 게이트에 「검사 모듈 수 > 0」 확인을 요구한다. 실측으로 그 요구의 **정확한 근거와 범위**를 확인했다.

| 상황 | `dependency-cruiser` | `oxlint` |
|---|---|---|
| 잘못된 경로 | exit **1** (`Can't open … Does it exist?`) | exit **1** (`No files found to lint`) |
| **설정으로 대상이 0개** | **exit 0** ✗ | exit **1** ✓ |

```
$ npx depcruise src --exclude "^src"
✔ no dependency violations found (0 modules, 0 dependencies cruised)
[exit=0]
```

**설계서의 요구는 타당하다.** 다만 막는 대상은 경로 오타가 아니라 **설정(`exclude`·`doNotFollow`)으로 검사 대상이 비는 경우**다. `depcruise`는 이때 "위반 없음"으로 통과한다.

**그리고 `oxlint`에는 이 구멍이 없다.** 대상이 0개면 스스로 exit 1로 실패한다 — 잘못된 경로든 ignore로 전부 걸러졌든. 따라서 [ADR 0001](../adr/0001-경계-강제를-oxlint로-일원화한다.md)의 전환이 끝나면 **이 게이트를 별도로 만들 필요가 없다.** 도구가 이미 그 요건을 만족한다.

> **전환 완료로 이 요구는 소멸했다 (2026-08-20).** `dependency-cruiser`를 제거했고, oxlint은 대상이 0개면 스스로 실패하므로 별도 게이트를 만들지 않았다. 위 표는 **왜 만들지 않았는지**의 근거로 남긴다 — 근거 없이 빠진 게이트와 근거 있게 빠진 게이트는 다르다.

> 참고 — oxlint 기본 포매터는 진단 0건일 때 비TTY 환경에서 **아무것도 출력하지 않는다.** 성공과 미실행이 화면상 구분되지 않으므로, 로그를 남겨야 하는 자리에서는 `--format=json`을 쓴다.

**③ 포크 PR에서 `VITE_API_BASE`가 비어 온다.** GitHub 공식 문서: *"With the exception of `GITHUB_TOKEN`, secrets are not passed to the runner when a workflow is triggered from a forked repository."* — [Using secrets in GitHub Actions](https://docs.github.com/en/actions/security-for-github-actions/security-guides/using-secrets-in-github-actions).

이 워크플로는 `pull_request`에 트리거되고 빌드 스텝에서 `VITE_API_BASE: ${{ secrets.VITE_API_BASE }}`를 넣는다. 포크에서 온 PR에서는 이 값이 **비어 온다.**

**지금은 소비자가 없어 증상이 나타나지 않는다**(§6.3 — 전송 계층이 삭제됐다). 그래서 이 항목은 **잠재 위험**이며, 값을 읽는 코드가 다시 생기는 순간 되살아난다. 과거에는 `?? ""` 폴백 때문에 빌드가 성공하고 상대 경로 번들이 SWA 프리뷰로 배포됐다 — 실패 신호가 어디에도 없었다.

→ 근본 해결은 §6.3이다. 값 부재가 드러나는 처리로 전송 계층을 세우면 이 경로도 함께 막힌다.

---

### 5.4 프로덕션 빌드가 개발 시맨틱으로 돌던 결함 ✅ 해소 (2026-08-20)

**이 저장소에서 실제로 발생했던 일이다.** `import.meta.env.DEV` 가드가 프로덕션 번들에서 제거되는지 확인하다가 발견했다.

#### 근본 원인

`frontend/.env`에 `NODE_ENV=development`가 있었고, Vite의 `envDir` 기본값이 프로젝트 루트라 **빌드가 그 파일을 읽었다.**

Vite 버그가 아니라 문서화된 동작이다 — [Env and Mode](https://vite.dev/guide/env-and-mode):

> *"`NODE_ENV=...` can be set in the command, and also in your `.env` file."*

그리고 **`MODE`와 `PROD`/`DEV`는 독립적인 개념**이다. `MODE`는 `--mode`에서, `PROD`/`DEV`는 **`NODE_ENV`에서** 온다. 그래서 `vite build`가 다음 모순 상태로 돌았다:

```
ZDEV[true]ZPROD[false]ZMODE[production]
```

**결함은 구성에 있었다** — 프로젝트 공용 env 파일(Azure·PostgreSQL·AKS)이 Vite의 env 로딩 범위 안에 있어, 프론트가 쓰지도 않는 변수 하나가 빌드 시맨틱을 뒤집었다.

#### 실측된 피해와 해소

| 항목 | 결함 상태 | 해소 후 |
|---|---|---|
| 소스 절대 경로가 번들에 박힘 | **10건 이상** (`C:/programming/…/Button.tsx`) | **0** |
| 개발용 JSX 트랜스폼(`jsxDEV` 메타데이터) | 다수 | **0** |
| `import.meta.env.DEV` 가드로 감싼 코드 | **프로덕션에서 실행됨** | **0** |
| 번들 크기 | 398 kB | **199 kB** (gzip 64.9 kB) |

**가장 위험한 것은 세 번째다.** "DEV로 감쌌으니 프로덕션에 안 나간다"는 가정이 전부 거짓이 된다. 그리고 **조용하다** — 빌드는 성공하고 경고도 없다.

절대 경로 노출은 별개의 문제이기도 하다. 배포물에서 디렉터리 구조와 사용자명이 읽힌다.

#### 재발 방지 — `assert-production-build`

원인(`NODE_ENV` 줄)은 지웠지만 **`.env`는 `.gitignore` 대상이라 사람마다 파일이 다르다.** 한 사람이 고쳐도 다른 환경에서 재발할 수 있다.

그래서 `vite.config.ts`에 빌드 전용 플러그인을 두어 **원인이 무엇이든 잡는다** — `mode === "production"`인데 `isProduction`이 `false`면 빌드를 실패시키고 원인·조치를 메시지로 알려준다.

`mode`를 함께 보는 이유는 `--mode staging` + `NODE_ENV=production` 같은 정당한 조합을 막지 않기 위해서다. 두 개념이 독립이므로 모드만으로 단정하지 않는다.

게이트가 실제로 막는지 주입으로 확인했다 — `NODE_ENV=development npx vite build`가 exit 1로 실패한다.

> **교훈** — `import.meta.env.DEV`로 감싸면 프로덕션에서 제거된다는 것은 **가정이었고 이 저장소에서는 거짓이었다.** 번들을 직접 열어보지 않았으면 모른 채 넘어갔다. **빌드 산출물에 대한 주장은 산출물을 열어서 확인한다.**

---

## 6. 환경변수

### 6.1 프론트가 쓰는 변수는 하나뿐이다

| 변수 | 상태 |
|---|---|
| `VITE_API_BASE` | **유일한 프론트 변수.** `src/vite-env.d.ts:21`이 선언하고 `.github/workflows/frontend-ci.yml`이 주입한다. **읽는 코드는 현재 없다** — 전송 계층이 `src` 초기화 때 삭제됐다(§6.3) |
| `VITE_WS_BASE` | **제거 완료.** 대응 코드 없는 선언이라 지웠다 — 현재 `ImportMetaEnv`에 없다 |

Vite 규칙 — `VITE_` 접두 변수만 클라이언트에 노출되고(`envPrefix` 기본값), `.env`는 `envDir`(기본: `vite.config.ts`가 있는 프로젝트 루트)에서 로드되며, 값은 **빌드타임에 정적 치환**된다. 로드 우선순위는 ① 실행 시점 환경변수 → ② `.env.[mode]`(+`.local`) → ③ `.env`(+`.local`). 개인 로컬 값은 `.env.local`에 두며, 이 저장소 `.gitignore`의 `.env.*` 패턴에 이미 걸려 커밋되지 않는다. — [Env and Mode](https://vite.dev/guide/env-and-mode) · [Shared Options](https://vite.dev/config/shared-options.html)

**값 형식은 오리진만, 끝 슬래시 없이**다. 코드가 `${API_BASE}${path}`로 이어붙이고 `path`가 전부 `/api/v1/…`·`/healthz`로 시작하기 때문이다. 슬래시를 붙이면 `//api/v1/…`이 된다.

### 6.2 현재 상태 — 붙일 백엔드가 아직 없다 (2026-08-20)

**따라서 `VITE_API_BASE`에 넣을 값이 지금은 존재하지 않는다.** 선언만 두고 값은 비워 둔다. 값이 정해지는 시점은 백엔드 호스트가 확정될 때다.

값이 정해진 뒤의 확인 경로 — 그때 다시 조사하지 않도록 미리 적어 둔다:

| 경로 | 비고 |
|---|---|
| 설정한 사람에게 확인 | 가장 확실하다 |
| 배포된 번들에서 역추출 | 빌드타임 정적 치환이므로 `assets/index-*.js`에서 그대로 읽힌다. **값이 공개된다는 뜻이기도 하다**(§6.4) |
| GitHub Settings → Secrets and variables → Actions | **값을 다시 보여주지 않는다.** 존재 여부만 확인되고 덮어쓰기만 가능하다 |

> **함정** — `.env`의 `AKS_FQDN`을 그대로 쓰지 않는다. 그것은 통상 AKS **API 서버(컨트롤 플레인)** 주소이고, 애플리케이션 트래픽이 들어가는 **인그레스 호스트는 별개**다. 혼동하면 브라우저가 쿠버네티스 API 서버를 호출하게 된다.

### 6.3 진짜 문제는 값이 아니라 폴백이다

> ⚠️ **휴면 상태다 (2026-08-21 정정).** 이 절이 서술하던 결함은 **코드가 사라져 현재 존재하지 않는다.** 아래는 **전송 계층을 다시 세울 때 반복하지 않기 위한 기록**이다.
>
> 과거 `shared/api/client.ts`·`answers.ts`가 `import.meta.env.VITE_API_BASE ?? ""`로 폴백했다. 두 파일은 `src` 초기화(주제 전환) 때 삭제됐고, `src/shared/`에는 현재 `ui/`만 있다. `import.meta.env`를 읽는 코드는 **0건**이다.

**왜 폴백이 위험했나** — 미설정과 "동일 오리진을 의도함"이 구분되지 않는다. 값이 없으면 모든 요청이 상대 경로로 나가고 **에러가 어디에도 나지 않는다.** 두 경로에서 드러난다.

**① 백엔드가 붙은 뒤 값 주입을 잊어도 배포가 성공한다.** 빌드도 CI도 통과하고, 런타임에 404가 날 뿐이다. 원인이 환경변수라는 단서가 없다.

**② 포크 PR 빌드가 조용히 깨진다.** GitHub 공식 문서: *"With the exception of `GITHUB_TOKEN`, secrets are not passed to the runner when a workflow is triggered from a forked repository."* — [Using secrets in GitHub Actions](https://docs.github.com/en/actions/security-for-github-actions/security-guides/using-secrets-in-github-actions). `frontend-ci.yml`은 `pull_request`에 트리거되므로 포크에서 온 PR에서는 `secrets.VITE_API_BASE`가 **비어 온다.** 폴백이 있으면 빌드는 성공하고, 상대 경로 번들이 SWA 프리뷰로 배포된다.

> **전송 계층을 다시 세울 때의 조건** — `?? ""` 같은 조용한 폴백을 두지 않는다. 빌드 시점에 검증해 **실패시키거나**, 부재를 호출부에서 **명시적으로 다룬다.** 타입 쪽은 이미 정직하다 — `vite-env.d.ts:21`이 `VITE_API_BASE?: string`(optional)이라 부재가 타입에 드러난다.

### 6.4 보안 성격 — secret이 아니라 환경별 설정값이다

Vite 공식 경고: *"VITE_\* variables should **not** contain sensitive information such as API keys. The values of these variables are **bundled into your source code at build time**."* → *"consider a backend server or serverless/edge functions to properly secure secrets."*

즉 `VITE_API_BASE`는 **번들에 박혀 누구나 읽을 수 있다.** API 베이스 URL은 통상 비밀이 아니므로 실질 위험은 낮지만, GitHub secret 자리에 두면 "보호되고 있다"는 오해를 만든다. **이 값은 secret이 아니라 환경별 설정값**이며, 그렇게 다뤄야 한다. 진짜 비밀은 어떤 경우에도 `VITE_` 변수에 넣지 않는다.

관련 — `envPrefix`를 `''`로 설정하면 모든 환경변수가 노출된다. Vite는 이를 감지해 **에러를 던진다.** 접두사 규칙을 우회하려 하지 않는다.

### 6.5 재발 방지

- **`src/vite-env.d.ts`의 `ImportMetaEnv`를 단일 출처로 삼는다.** 프론트 환경변수를 추가·변경할 때 여기서 시작하고, CI 주입 이름과 일치하는지 같은 PR에서 확인한다.
- **`vite-env.d.ts`에 `import` 문을 넣지 않는다.** 공식 문서 경고: *"If the `ImportMetaEnv` augmentation does not work, make sure you do not have any `import` statements in `vite-env.d.ts`."* 현재는 없다 — 이 상태를 유지 조건으로 못박아 둔다.
- **미사용 선언을 남기지 않는다.** 선언은 계약이다. 대응 없는 선언(`VITE_WS_BASE`)은 **제거했다** — 현재 `ImportMetaEnv`에는 `VITE_API_BASE` 하나뿐이다.
- **타입과 런타임 가정을 일치시킨다.** ✅ **해소** — `vite-env.d.ts:21`이 `readonly VITE_API_BASE?: string`(optional)이다. 타입이 런타임보다 낙관적이면 그 자체가 결함이므로, 값을 읽는 코드가 다시 생기면 이 optional 을 그대로 받아 부재를 명시적으로 다룬다.

> `frontend/.env.example`은 프론트 전용이 아니라 **프로젝트 공용** 파일이며, **`VITE_API_BASE=` 를 담고 있다**(line 2, 빈 값). 즉 새로 클론한 사람이 변수의 존재는 그 파일에서 알 수 있고, **의미와 주입 경로는 이 절이 책임진다.** Azure/Key Vault/PostgreSQL/AKS/SWA/Log Analytics 절은 백엔드·인프라 소관이므로 다루지 않는다.

---

## 7. 설계서 개정 사항

과거 설계서(루트 `docs/`의 `frontend_architecture_v3.7.md`)를 검토·실측한 결과 아래 항목을 다르게 정하거나 정정했다.

> **그 설계서는 레거시가 되어 백업 경로로 옮겨졌다 (2026-08-21).** 따라서 이 표는 더 이상 «설계서에 반영할 개정 요청»이 아니라 **«지금 값이 왜 이 값인지»에 대한 근거 기록**이다. 기술 스펙의 규범은 이 문서다.

| # | 설계서 | 이 문서 | 사유 |
|---|---|---|---|
| 1 | TS 6·7 별칭 병존 (§10.9) | **TS 7 단독** | 병존은 `dependency-cruiser`를 위한 우회. 도구를 바꾸면 불필요 (§3.1) |
| 2 | Project References `[app, worker]` (§10.4) | **app 단독 + 조건부 보류** | 적용 대상 부재 (§5.2) |
| 3 | "depcruise 게이트 강화" (§10.8) | **게이트 신설** | 강화할 게이트가 없다. CI에 typecheck·경계 검사 스텝 자체가 없다 (§5.3) |
| 4 | TS7 기본값 변경 미기재 | **§3.4에 전수 대조** | 실제 리스크 표면이 여기다 |
| 5 | `stableTypeOrdering` 켜는 단계만 있음 (§10.9.4) | **해당 없음** | 단독 채택이라 6↔7 진단 비교 자체가 없다. (병존안으로 돌아갈 경우 이 플래그는 최대 25% 지연을 유발하는 **진단 전용**이므로 비교 후 반드시 끈다) |
| 6 | 해소 3중 지표 ① "TS 7.1 출시" (§10.9.5) | **해당 없음** | 단독 채택이라 해소할 임시 구성이 없다. 참고로 ①만으로는 부족했다 — depcruise가 `<7.0.0` 상한을 넓힌 릴리스를 내야 하고, 7.1 API는 "new and different"라 이식이 별도로 필요하다 |
| 7 | `vite` 8.2.1 | **8.2.1** (lock) | 한때 「최신 8.2.2」로 정정했으나 lock 실측은 8.2.1 — 최신 여부는 문서에 박지 않는다 (§4) |
| 8 | "채택 시점 Active LTS" | **2026-10-20 Maintenance 진입 병기** | 채택 결론은 유지 (§2.3) |

---

## 8. 검증

### 8.1 터미널 — 4게이트

```bash
cd frontend
npm run typecheck    # tsc -b
npm run lint         # oxlint .
npm test             # vitest run
npm run build        # tsc -b && vite build
```

`--format=json`으로 실제 검사 규모를 함께 본다 — 통과했는지와 **검사하긴 했는지**는 다른 질문이다 (§5.3).

### 8.2 브라우저 — 터미널이 볼 수 없는 것

4게이트는 **바이트**를 검사한다. 렌더 결과·상호작용·전송 동작은 검사하지 않는다.

```bash
npm run preview -- --host 127.0.0.1
```

**`--host` 를 빼면 안 된다.** `vite preview` 는 기본값에서 IPv6 `[::1]` 에만 listen 하고 `127.0.0.1` 은 연결을 거부한다 — 셸의 `curl localhost` 는 성공하는데 브라우저만 실패하는, 원인을 오해하기 쉬운 형태로 나타난다.

**측정 A — 2026-08-21, 무스로틀** (Chrome DevTools, 로컬 preview):

| 항목 | 값 | 기준 |
|---|---|---|
| LCP | **0.14 s** (요소: `span`) | < 2.5 s |
| CLS | **0.00** (최악 클러스터 1 shift) | < 0.1 · 경보 0.08 |
| INP | **0 ms** (keyboard) | < 200 ms |
| 폰트 전송 | **18 / 92 조각** | 전량 전송이면 서브셋 실패 |

**폰트 18/92 는 `unicode-range` 서브셋이 실제로 동작한다는 증거다.** `@font-face` 92개가 CSS에 선언돼 있어도 브라우저는 페이지에 실제로 쓰인 글자가 속한 조각만 받는다. 번들 예산 게이트가 폰트를 raw 합계(2,281,860 B)로 재면서도 JS·CSS와 **분리 집계**하는 이유가 이것이다 — 합산하면 전송되지도 않는 바이트가 예산을 다 먹는다.

> ⚠️ **측정 A 의 CLS 0.00 은 폰트 스왑 위험을 검증하지 못한다.** 루프백에서는 폰트가 `font-display: swap` 의 블록 구간(약 100 ms) 안에 도착해 **스왑 자체가 일어나지 않는다.** 폴백 → 웹폰트 교체로 인한 리플로우는 저속 네트워크에서만 발현된다. → 측정 B.

**측정 B — 2026-08-21, `Slow 4G` 스로틀 + 캐시 삭제 후 강제 새로고침** (DevTools HAR export 22건 전량 분석. HAR 원본은 저장소에 넣지 않는다 — 특정 실행의 스냅샷이라 금방 낡고, 아래 수치가 그 결론이다):

전 요청이 `200`, `304` **0건** — 콜드 캐시가 확인됐다. 아래 바이트는 **진짜 첫 방문 비용**이다.

| 시점 | 사건 | 크기 |
|---|---|---|
| 0 → 603 ms | `/` 문서 | 405 B |
| 608 → 1,387 ms | CSS (gzip) | 59,921 B raw |
| 608 → **1,718 ms** | JS (gzip) | 239,270 B raw |
| **1,737 ms** | 폰트 18건 요청 시작 | — |
| 2,909 → **5,312 ms** | 폰트 도착 | 408,988 B |
| 5,346 → 5,927 ms | `/favicon.ico` | **404** |
| | DOMContentLoaded · onLoad | 1,724 ms · 5,316 ms |
| | **CLS** | **0.01** — 스왑이 실제로 일어난 조건에서의 값 |

**스로틀은 실제로 걸렸다.** DevTools 소스의 프리셋 정의는 `Slow 4G` = 다운로드 180,000 B/s · 주입 지연 **562.5 ms**(`150 × 3.75`)다. 관측 TTFB 579–629 ms 가 여기에 서버 처리시간만 얹은 값이다 — 무스로틀 루프백이면 5 ms 미만이 나온다.

#### 폰트 발견은 CSS 가 아니라 **JS 번들 뒤에 직렬화된다**

이 워터폴의 가장 중요한 사실이다. CSS 는 1,387 ms 에 끝났는데 폰트 요청은 **1,737 ms** 에 났다(350 ms 공백). 반면 JS 완료(1,718 ms) 이후로는 **19 ms** 만에 났다.

원인은 `dist/index.html` 이 405 B 이고 `<body>` 가 `<div id="root"></div>` 뿐이라는 데 있다. **CSR SPA 라 HTML 에 글자가 없어서, 레이아웃할 텍스트가 생기기 전까지 브라우저는 어떤 `unicode-range` 조각이 필요한지 알 수 없다.** `@font-face` 선언은 1,387 ms 에 파싱을 마쳤지만 아무것도 트리거하지 않았다.

**프로토콜을 바꿔도 이 순서는 그대로다.** 아래 3파 계단은 HTTP/2 에서 사라지지만 `HTML → JS → 렌더 → 폰트 발견` 직렬은 남는다. `preload` 로 앞당길 수도 없다 — 어느 조각이 필요한지 정적으로 알 수 없기 때문이다(`src/shared/ui/README.md` 폰트 절). 실효 대책은 JS 번들 축소(이미 gzip 75.6 kB)나 HTML 프리렌더인데, **화면 스펙이 있어야 판단할 수 있으므로 지금 결정하지 않는다.**

#### 스왑 경로를 실제로 지나갔다

18개 전부 **1.17 ~ 3.58 초**가 걸려 하나도 빠짐없이 `swap` 의 100 ms 블록 구간을 초과했다. 텍스트는 1,737 ms 부터 폴백(Malgun Gothic)으로 그려졌고, 2,909 ms 부터 3파에 걸쳐 교체됐다:

| 파 | 조각 | 바이트 | 도착 |
|---|---|---|---|
| 1 | 82, 84, 86, 87, 88, 90 | 140,184 | ~3,119 ms |
| 2 | 74, 78, 79, 80, 83, 85 | 114,944 | ~4,146 ms |
| 3 | 1, 25, 57, 76, 77, 81 | 153,860 | ~5,312 ms |

**3파 계단은 제품 성능이 아니라 `vite preview` 아티팩트다.** 응답이 `HTTP/1.1` 이라 호스트당 6커넥션 한도에 걸렸다 — 2·3파의 `blocked` 가 각각 1.2 초, 2.1–2.4 초로 전부 순수 대기다. **배포 호스트가 미확정이므로 프로덕션 프로토콜은 배포 후 재측정한다.**

#### 전송 바이트의 81%가 폰트다

| 자원 | 전송(gzip 반영) | 비중 |
|---|---|---|
| 폰트 woff2 18조각 | **408,988 B** | **81.4%** |
| JS (gzip) | 75,588 B | 15.1% |
| CSS (gzip, `@font-face` 포함) | 17,373 B | 3.5% |
| document | 405 B | 0.1% |
| **합계** | **≈ 502 KB** | |

**예산 게이트의 사각지대가 여기 있다.** 게이트는 JS 를 92 kB 로 조이고 폰트는 raw 합계 2,281,860 B 로 감시하는데, **페이지가 실제로 전송하는 폰트 바이트(409 kB)는 어떤 게이트도 보지 않는다.** 정적으로 잴 수 없는 값이라(브라우저가 페이지 내용을 보고 조각을 고른다) 게이트 설계의 결함은 아니지만, **감시 공백인 것은 사실이다.**

#### 스로틀 상태 LCP — 1.29 s (별도 실행)

`Slow 4G` 에서 **LCP 1.29 s** 가 측정됐다. 기준 2.5 s 대비 여유가 크고, 스왑이 의도대로 동작한다는 뜻이다 — 웹폰트를 기다리지 않고 폴백으로 먼저 그리기 때문에 LCP 가 폰트 도착과 무관하게 확정된다.

> ⚠️ **이 값은 위 HAR 과 같은 실행이 아니다.** HAR 실행에서는 JS 가 1,718 ms 에 끝나고 폰트 요청이 1,737 ms 에 났으므로, 텍스트 최초 페인트가 1.73 s 이전일 수 없다 — LCP 1.29 s 는 산술적으로 불가능하다. JS·CSS 가 캐시에서 온 실행으로 보인다. **콜드 캐시 LCP 는 별도 항목으로 남긴다.** 조건이 다른 수치를 한 줄에 섞어 적으면 나중에 없는 회귀를 쫓게 된다.

#### 결론 — 폰트 메트릭 오버라이드는 넣지 않는다 ✅

**CLS 0.01.** 경보선 0.08 의 **1/8**, 통과선 0.1 의 **1/10** 이다.

이 값은 위험 경로를 실제로 지나간 뒤에 나온 값이다 — 폴백이 1,737 → 2,909 ms(1.17 초) 표시됐고, 교체가 3파에 걸쳐 5,312 ms 까지 이어졌다. 리플로우 기회가 3번 있었는데도 0.01 에 그쳤다.

**완화 장치가 실제로 동작했다는 증거다.** `theme.css` 가 `--text-*--line-height` 를 **명시**해 두어 폰트 교체가 줄 높이를 바꾸지 못한다. 남는 위험은 자간 차이로 **줄 수**가 바뀌는 경우뿐인데, 측정값이 그 영향이 미미함을 보여준다.

따라서 **`@font-face` 메트릭 오버라이드를 넣지 않는다.** 계산은 끝나 있으므로 필요해지면 그때 4줄을 붙인다:

```css
/* 지금은 넣지 않는다 — CLS 0.01 로 불필요함이 실측됐다.
   서체 · 폴백 · 레이아웃이 바뀌면 다시 재고 판단한다. */
@font-face {
  font-family: "Wanted Sans Fallback";
  src: local("Malgun Gothic");
  size-adjust: 98.29%;
  ascent-override: 96.88%;
  descent-override: 24.54%;
}
```

> ⚠️ **이 값은 스타일가이드 1화면 기준이다.** 화면 S1~S6 이 붙으면 레이아웃이 달라지므로 **다시 잰다.** 0.01 은 "이 페이지가 안전하다"는 뜻이지 "이 서체 조합이 어떤 레이아웃에서도 안전하다"는 뜻이 아니다.

**LCP 0.14 s 는 필드 값이 아니다.** 루프백에는 네트워크 지연이 없다. 회귀 감지용 상대 기준으로만 쓰고, 절대 판정은 배포 후 실측으로 한다.

---

## 부록 — 실제 트리와 어긋난 설정 파일 (2026-08-21 재실측)

처음 적을 때 4건이었다. **2건은 이미 해소돼 있었는데 이 표가 갱신되지 않아 「알려진 불일치」로 계속 인용됐다** — 실측으로 정정한다. 표의 항목은 해소되면 지우지 않고 상태를 바꾼다(근거 있게 빠진 항목과 잊힌 항목은 다르다).

| 파일 | 상태 |
|---|---|
| `frontend/.gitattributes` | ✅ **해소 (커밋 `2f694a1`)** — 현재 `.nvmrc`·`.npmrc` 의 `eol=lf` 2줄뿐이고, 파일 주석이 *"실제로 매칭되는 규칙만 둔다"* 를 명시한다 |
| `frontend/staticwebapp.config.template.json` | ⚠️ **절반 해소 (커밋 `4da671c`)** — 라우트·MIME 매핑은 없고 CSP 는 실측(2026-08-20) 기준으로 축소됐다(`wss:` · `worker-src` · `blob:` · `wasm-unsafe-eval` 제거, 사유가 `__CSP_NOTE__` 에 기록됨). **남은 것 하나 — `/assets/*` 캐시 헤더가 아직 없다**(아래 절). 호스트와 무관한 값이라 template 단계에서 미리 넣을 수 있다 — 별도 PR |
| `frontend/index.html` | ⚠️ **유효** — `<title>Frontend</title>` 중립값 · `<link rel="icon">` 없음(`/favicon.ico` 404 실측). 제품명·파비콘은 디자인 오너 결정이라 여기서 정하지 않는다. `viewport-fit=cover` 는 2026-08-21 추가됨 |
| `frontend/README.md` | ✅ **해소 (2026-08-21)** — 실제 트리(`app` · `pages/style-guide` · `shared/ui` · `scripts/lib`) 반영 · 죽은 링크 제거 · `build` 명령에 게이트 포함 · 스타일 함정 2건 |
| `.github/workflows/frontend-ci.yml` Build 스텝 주석 | ⚠️ **낡음(무해)** — 삭제된 `?? ""` 폴백 코드를 언급한다. 전송 계층을 다시 세울 때 함께 고친다(§6.3) |

### 배포 시 필요한 캐시 헤더 (§8.2 HAR 에서 발견)

측정 B 의 응답 헤더가 전부 **`Cache-Control: no-cache`** 였다. `vite preview` 의 기본값이라 로컬에서는 무해하지만, 그대로 배포되면 **재방문마다 409 KB 의 폰트를 조건부 요청으로 재검증**한다.

Vite 산출물의 자산 파일명에는 이미 콘텐츠 해시가 박혀 있다(`WantedSansVariable.split.87-Dsn0Vuuo.woff2`). 내용이 바뀌면 파일명이 바뀌므로 **영구 캐시가 안전하다.**

| 대상 | 필요한 값 |
|---|---|
| `/assets/*` (해시 파일명 — JS·CSS·폰트) | `public, max-age=31536000, immutable` |
| `/index.html` | 캐시하지 않거나 짧게 — 해시가 없어 새 배포를 못 받는다 |

호스트가 확정되면 `staticwebapp.config.json` 에 넣고, **배포본에서 응답 헤더를 실제로 확인한다**(설정 파일을 고친 사실은 동작 증거가 아니다).

### `--if-present` 실측 근거 (§5.3 ①)

```
$ npm run nonexistent --if-present   → exit 0
$ npm run nonexistent                → exit 1
```

없는 스크립트를 **성공으로 처리한다.** CI 게이트에서 이 플래그를 쓰면 스크립트가 사라져도 파이프라인이 초록색으로 통과한다.
