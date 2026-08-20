# 툴체인 — 런타임 · 빌드 · 타입 · CI 게이트

> **최종 갱신** 2026-08-20 · **성격** 적용 설계 — 규범이 아니라 이 저장소의 결정과 근거.
> 결정 기록은 [ADR 0002](../adr/0002-typescript-7을-단독으로-채택한다.md).
> 버전·기본값·EOL 일정은 **전부 1차 출처로 확인**했다 (§6).

---

## 1. 현재 기준선 (2026-08-20 실측)

이후 모든 회귀 비교의 기준이다. 이 값이 깨졌다면 **내 변경이 원인**이라고 먼저 가정한다.

| 항목 | 값 |
|---|---|
| `oxlint --format=json .` | 54 files · **262 rules** · 진단 0 |
| `vitest run` | **11개 파일 · 94개 테스트 통과** |
| `typescript` | **`~7.0.2`** (단독 — 별칭 병존 없음) |
| `engines.node` · `.nvmrc` | `^24.15.0` · `24.19.0` |
| 로컬 Node | **v24.19.0** — 하한 충족 (§2.4) |
| CI | `install → typecheck → lint → test → build` |
| `npm install` 경고 | **0건** — `engine-strict=true`로 실패 승격됨 (§2.5) |
| 경계 강제 | oxlint (`dependency-cruiser` **제거됨**) |

> **로드맵 1~6단계 반영 후의 값이다.** 착수 시점 기준선은 `depcruise` 50 modules · 5 파일 40 테스트 · `typescript ~6.0.3` · CI `lint → test → build`였다.
>
> 검증은 이제 **4게이트**다 — `typecheck · lint · test · build`. `depcruise`가 빠진 자리는 oxlint 규칙이 대신한다([layers §4](layers.md#4-경계-강제-설계)).

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

기준일 2026-08-20. 별도 표기가 없으면 캐럿 범위 + lock 고정.

| 패키지 | 채택 | 비고 |
|---|---|---|
| `react` / `react-dom` | 19.2.8 | |
| `@types/react` | 19.2.18 | |
| `@types/react-dom` | 19.2.4 | |
| `vite` | **8.2.2** | 설계서 표는 8.2.1 — 최신은 8.2.2다. 캐럿 범위라 실사용엔 무영향이나 값은 정정한다. `build.target` 명시 필수 |
| `@vitejs/plugin-react` | 6.0.5 | |
| `typescript` | **`~7.0.2`** | 틸드 핀(패치만 허용). **별칭 없음** (§3) — 적용 완료 |
| `zustand` | 5.0.15 | 정확 핀 |
| `vitest` | 4.1.11 | 현재 4.1.10 |
| `oxlint` | 1.79.0 | 현재 1.78.0 |
| `jsdom` | 30.0.1 | **Node 하한 결정 패키지** (§2.1) |
| `@testing-library/react` | 16.3.2 | |
| `@testing-library/jest-dom` | 7.0.1 | |
| ~~`dependency-cruiser`~~ | **제거됨** (2026-08-20) | §3.1 · [ADR 0001](../adr/0001-경계-강제를-oxlint로-일원화한다.md) |

**정확 버전 고정은 `npm i -E`** — `npm i pkg@x.y.z`는 캐럿이 붙어 기록된다.

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

### 5.3 CI 게이트

**현재 CI는 `lint → test → build`뿐이고 타입 검사는 `build`의 `tsc -b`로만 간접 수행된다.** 경계 규칙은 CI에서 전혀 강제되지 않는다.

| 조치 | 내용 |
|---|---|
| Node 핀 | `node-version: "24"` → `"24.19.0"` |
| 캐시 | `actions/setup-node`에 `cache: npm` 추가 (현재 없음) |
| **typecheck 스텝 신설** | `npm run typecheck` — 빌드 실패보다 먼저, 더 빠르게 잡는다 |
| **`--if-present` 제거** | 아래 ① |
| **검사 대상이 비지 않았는지** | 아래 ② — 도구마다 다르다 |
| **포크 PR의 빈 secret 대응** | 아래 ③ — 근본 해결은 [§6.3](#63-진짜-문제는-값이-아니라-폴백이다) |

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

이 워크플로는 `pull_request`에 트리거되고 빌드 스텝에서 `VITE_API_BASE: ${{ secrets.VITE_API_BASE }}`를 넣는다. 포크에서 온 PR에서는 이 값이 비어 오는데, 코드의 `?? ""` 폴백 때문에 **빌드가 성공하고 상대 경로 번들이 SWA 프리뷰로 배포된다.** 실패 신호가 어디에도 없다.

→ 근본 해결은 §6.3이다. 값 부재가 드러나는 처리로 바꾸면 이 경로도 함께 막힌다. 그 전까지는 **포크 PR 프리뷰의 API 호출이 동작하지 않는다는 것을 알고 있어야 한다.**

---

## 6. 환경변수

### 6.1 프론트가 쓰는 변수는 하나뿐이다

| 변수 | 상태 |
|---|---|
| `VITE_API_BASE` | **유일한 프론트 변수.** `src/shared/api/client.ts:3` · `answers.ts:5`가 읽고, `src/vite-env.d.ts:4`가 선언하고, `.github/workflows/frontend-ci.yml:54`가 주입한다 |
| `VITE_WS_BASE` | **죽은 선언.** `src/vite-env.d.ts:5`에 있으나 **읽는 코드가 없다.** 추가 대상이 아니라 제거 대상 |

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

`client.ts:3`과 `answers.ts:5`가 `import.meta.env.VITE_API_BASE ?? ""`로 폴백한다. 그 결과:

**미설정과 "동일 오리진을 의도함"이 구분되지 않는다.** 값이 없으면 모든 요청이 상대 경로로 나가고 **에러가 어디에도 나지 않는다.**

이 폴백이 지금 두 곳에서 위험하다.

**① 백엔드가 붙은 뒤 값 주입을 잊어도 배포가 성공한다.** 빌드도 CI도 통과하고, 런타임에 404가 날 뿐이다. 원인이 환경변수라는 단서가 없다.

**② 포크 PR 빌드가 조용히 깨진다.** GitHub 공식 문서: *"With the exception of `GITHUB_TOKEN`, secrets are not passed to the runner when a workflow is triggered from a forked repository."* — [Using secrets in GitHub Actions](https://docs.github.com/en/actions/security-for-github-actions/security-guides/using-secrets-in-github-actions). `frontend-ci.yml`은 `pull_request`에 트리거되므로 포크에서 온 PR에서는 `secrets.VITE_API_BASE`가 **비어 온다.** 폴백 때문에 빌드는 성공하고, 상대 경로 번들이 SWA 프리뷰로 배포된다.

> **개선 항목 (우선순위 높음)** — 값 부재가 드러나는 처리로 바꾼다. 방향은 두 가지다: 빌드 시점에 검증해 **실패시키거나**, 폴백을 없애고 타입을 `VITE_API_BASE?: string`으로 정직하게 바꾼 뒤 호출부에서 부재를 명시적으로 다루는 것. 어느 쪽이든 **지금처럼 조용히 넘어가지는 않게 한다.**

### 6.4 보안 성격 — secret이 아니라 환경별 설정값이다

Vite 공식 경고: *"VITE_\* variables should **not** contain sensitive information such as API keys. The values of these variables are **bundled into your source code at build time**."* → *"consider a backend server or serverless/edge functions to properly secure secrets."*

즉 `VITE_API_BASE`는 **번들에 박혀 누구나 읽을 수 있다.** API 베이스 URL은 통상 비밀이 아니므로 실질 위험은 낮지만, GitHub secret 자리에 두면 "보호되고 있다"는 오해를 만든다. **이 값은 secret이 아니라 환경별 설정값**이며, 그렇게 다뤄야 한다. 진짜 비밀은 어떤 경우에도 `VITE_` 변수에 넣지 않는다.

관련 — `envPrefix`를 `''`로 설정하면 모든 환경변수가 노출된다. Vite는 이를 감지해 **에러를 던진다.** 접두사 규칙을 우회하려 하지 않는다.

### 6.5 재발 방지

- **`src/vite-env.d.ts`의 `ImportMetaEnv`를 단일 출처로 삼는다.** 프론트 환경변수를 추가·변경할 때 여기서 시작하고, CI 주입 이름과 일치하는지 같은 PR에서 확인한다.
- **`vite-env.d.ts`에 `import` 문을 넣지 않는다.** 공식 문서 경고: *"If the `ImportMetaEnv` augmentation does not work, make sure you do not have any `import` statements in `vite-env.d.ts`."* 현재는 없다 — 이 상태를 유지 조건으로 못박아 둔다.
- **미사용 선언을 남기지 않는다.** 선언은 계약이다. 대응 없는 선언(`VITE_WS_BASE`)은 지운다.
- **타입과 런타임 가정을 일치시킨다.** 지금 `VITE_API_BASE`는 non-optional로 선언돼 있는데 코드는 폴백을 쓴다 — 둘 중 하나가 거짓이다. §6.3의 개선과 함께 정리한다.

> `frontend/.env.example`은 프론트 전용이 아니라 **프로젝트 공용** 파일이며, 현재 프론트 변수를 담고 있지 않다(빈 변수 정리, 2026-08-20). 그 대가는 **발견 가능성**이다 — 새로 클론한 사람이 `VITE_API_BASE`의 존재를 알 방법이 이 문서뿐이다. 다시 기재할지는 열려 있고, 기재하지 않는 동안은 **이 절이 프론트 변수의 기재 책임을 진다.** Azure/Key Vault/PostgreSQL/AKS/SWA/Log Analytics 절은 백엔드·인프라 소관이므로 다루지 않는다.

---

## 7. 설계서 개정 사항

`docs/frontend_architecture_v3.7.md`를 검토·실측한 결과 아래 항목을 다르게 정하거나 정정했다. **설계서 갱신 시 이 표를 반영한다.**

| # | 설계서 | 이 문서 | 사유 |
|---|---|---|---|
| 1 | TS 6·7 별칭 병존 (§10.9) | **TS 7 단독** | 병존은 `dependency-cruiser`를 위한 우회. 도구를 바꾸면 불필요 (§3.1) |
| 2 | Project References `[app, worker]` (§10.4) | **app 단독 + 조건부 보류** | 적용 대상 부재 (§5.2) |
| 3 | "depcruise 게이트 강화" (§10.8) | **게이트 신설** | 강화할 게이트가 없다. CI에 typecheck·경계 검사 스텝 자체가 없다 (§5.3) |
| 4 | TS7 기본값 변경 미기재 | **§3.4에 전수 대조** | 실제 리스크 표면이 여기다 |
| 5 | `stableTypeOrdering` 켜는 단계만 있음 (§10.9.4) | **해당 없음** | 단독 채택이라 6↔7 진단 비교 자체가 없다. (병존안으로 돌아갈 경우 이 플래그는 최대 25% 지연을 유발하는 **진단 전용**이므로 비교 후 반드시 끈다) |
| 6 | 해소 3중 지표 ① "TS 7.1 출시" (§10.9.5) | **해당 없음** | 단독 채택이라 해소할 임시 구성이 없다. 참고로 ①만으로는 부족했다 — depcruise가 `<7.0.0` 상한을 넓힌 릴리스를 내야 하고, 7.1 API는 "new and different"라 이식이 별도로 필요하다 |
| 7 | `vite` 8.2.1 | **8.2.2** | 최신값 정정 (§4) |
| 8 | "채택 시점 Active LTS" | **2026-10-20 Maintenance 진입 병기** | 채택 결론은 유지 (§2.3) |

---

## 8. 검증

```bash
cd frontend
npm run typecheck    # tsc -b
npm run lint         # oxlint .
npm test             # vitest run
npm run build        # tsc -b && vite build
```

`--format=json`으로 실제 검사 규모를 함께 본다 — 통과했는지와 **검사하긴 했는지**는 다른 질문이다 (§5.3).

---

## 부록 — 실제 트리와 어긋난 설정 파일

조사 중 확인됐다. **수정은 별도 PR**이며, 여기 적어 두는 것은 잊히지 않게 하기 위해서다.

| 파일 | 상태 |
|---|---|
| `frontend/.gitattributes` | **존재하지 않는 경로**에 대한 바이트 불변·바이너리 규칙이 남아 있다. 규칙 자체는 무해하지만, 읽는 사람에게 그 경로가 있다고 오인하게 만든다 |
| `frontend/staticwebapp.config.template.json` | 없는 자산 경로에 대한 라우트·MIME 매핑과, 현재 쓰지 않는 기능을 위한 CSP 지시어가 남아 있다. **CSP는 축소가 곧 보안 개선**이므로 실제 사용하는 전송 방식 기준으로 다시 쓴다 |
| `frontend/index.html` | `<title>`이 현재 제품과 불일치한다. **브라우저 탭에 그대로 노출된다.** 올바른 값은 제품 결정 사항이므로 여기서 정하지 않는다 |
| `frontend/README.md` | 디렉터리 트리·명령 서술이 실제 트리와 맞지 않고 죽은 링크가 있다. 저장소의 정문이므로 우선순위가 낮지 않다 |

### `--if-present` 실측 근거 (§5.3 ①)

```
$ npm run nonexistent --if-present   → exit 0
$ npm run nonexistent                → exit 1
```

없는 스크립트를 **성공으로 처리한다.** CI 게이트에서 이 플래그를 쓰면 스크립트가 사라져도 파이프라인이 초록색으로 통과한다.
