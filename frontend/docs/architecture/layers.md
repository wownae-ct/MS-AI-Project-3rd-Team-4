# 레이어 구조와 경계 강제

> **최종 갱신** 2026-08-21 · **성격** 적용 설계 — 규범이 아니라 이 저장소의 결정과 근거.
> 결정 기록은 [ADR 0001](../adr/0001-경계-강제를-oxlint로-일원화한다.md).
> 이 문서의 모든 도구 동작은 **로컬 실측으로 확인**했다 (§5).

## 빠른 이동

| 찾을 때 | 이동 |
|---|---|
| 레이어 규범 | §1 |
| 현재 배치 진단 | §2 |
| 경로 별칭 설계 | §3 |
| 경계 강제 설계 | §4 |
| 도입 순서 | §6 |
| 설계서 개정 사항 | §7 |

---

## 1. 레이어 규범

FSD(Feature-Sliced Design)를 따른다. 레이어는 **하향 import만** 허용된다.

```
app → pages → features → entities → shared
```

세그먼트는 공식 표준 5종을 쓴다 — [Slices and segments](https://feature-sliced.design/docs/reference/slices-segments):

| 세그먼트 | 공식 정의 |
|---|---|
| `ui` | "everything related to UI display: UI components, date formatters, styles, etc." |
| `api` | "backend interactions: request functions, data types, mappers, etc." |
| `model` | "the data model: schemas, interfaces, stores, and business logic." |
| `lib` | "library code that other modules on this slice need." |
| `config` | "configuration files and feature flags." |

**Shared에는 슬라이스가 없다.** 공식 문서 원문: *"The layers Shared and App don't contain slices. That is because Shared should contain no business logic at all."* Shared는 세그먼트만 가진다.

---

## 2. 현재 배치 진단

### 2.1 도메인 API가 shared에 있었다 — 타입 이중 정의의 근본 원인 (해소됨)

`src/shared/api/`가 도메인 엔드포인트를 담고 있었고, 그 결과 도메인 유니온 타입(`QuestionCategory`)이 `entities`와 `shared` 양쪽에 **이중 정의**되어 있었다.

원인은 규칙이 아니라 배치였다. FSD 하향 규칙상 `shared`는 `entities`를 import할 수 없으므로, 도메인 타입을 쓰는 엔드포인트를 `shared`에 두면 타입 복제 외에 선택지가 없다.

**목표 배치**

| 위치 | 내용 |
|---|---|
| `shared/api/client.ts` | **전송 계층만** — `http` · `ApiError` · `API_BASE` 단일 선언. 도메인을 모른다 |
| `entities/{slice}/api/` | 그 엔티티의 요청 함수. 공식 `api` 세그먼트 정의에 정확히 해당 |

**응답 타입은 `unknown`을 유지한다.** 이 이동은 파일 위치와 소유 레이어만 바꾼다 — 백엔드 계약이 확정되기 전에 응답 형태를 정의하지 않는다는 기존 원칙은 그대로다. 각 엔티티의 `api` 세그먼트가 "계약 확정 시 여기서 좁힌다"는 단일 지점 역할을 한다.

> ### ✅ 적용 완료 (2026-08-20)
>
> `questions`·`answers`·`sessions`·`reports`를 각 엔티티의 `api` 세그먼트로 옮겼고, `shared/api`에는 전송 계층(`client.ts`)과 인프라 헬스체크(`health.ts`)만 남겼다.
> **`QuestionCategory` 정의가 1곳으로 줄었다** — 이 작업의 목적이 그것이었다.
>
> **구조상 주의** — 엔티티 타입을 `index.ts`에 두면 `api/`가 타입을 쓰려고 `index.ts`를 import해 **`index → api → index` 순환**이 생긴다. 그래서 타입을 `model.ts`로 내렸다. 슬라이스는 `model.ts` + `api/` + 공개 `index.ts` 구성이다.
>
> `report`는 대응 엔티티가 없어 새로 만들었다 — 모델 없이 `api` 세그먼트만 가진 슬라이스다(FSD상 유효). `practice-session`과 합치지 않은 이유는 리소스 루트가 다르기 때문이다(`/sessions/…` vs `/users/{id}/reports/…`).
>
> 새 구조에서 경계 규칙이 여전히 작동하는지 주입으로 확인했다 — `@/entities/question/api` 직접 import와 entity 교차 import 모두 차단됐고, 제거 후 0건이다.

### 2.2 경로 별칭이 없다

모든 교차 import가 `../../../entities/question` 형태다. 리팩터링에 취약할 뿐 아니라, **§4의 경계 강제를 불가능하게 만든다** — 아래 참조.

---

## 3. 경로 별칭 설계

### 3.1 baseUrl 없이 paths만

`tsconfig.app.json`:

```jsonc
"paths": { "@/*": ["./src/*"] }
```

**`baseUrl`을 쓰지 않는 것이 핵심이다.** TypeScript 7이 `baseUrl`을 제거했으므로([toolchain §3.3](toolchain.md#33-이-저장소의-적합성--문법적-차단-요인-0건)), `paths` 단독 선언 — tsconfig 파일 위치 기준 상대 해석 — 이 유일한 전방호환 형태다.

Vite는 이 선언을 그대로 읽는다:

```ts
resolve: { tsconfigPaths: true }   // vite.config.ts
```

**별칭을 두 곳에 적지 않는다.** 수동 `resolve.alias`는 절대 경로를 요구해(`"Relative alias values will be used as-is and will not be resolved"`) `node:url` → `@types/node` 의존을 부르는데, 네이티브 옵션이 그 대가를 없앤다. 플러그인도 필요 없다.

**해석 주체가 둘인데 출처는 하나다** — TypeScript(`paths`)와 Vite(`tsconfigPaths`). 둘 다 `tsconfig.app.json`을 본다.
(도입 당시에는 dependency-cruiser도 `options.tsConfig`로 같은 파일을 봤다. 지금은 제거됐다 — [ADR 0001](../adr/0001-경계-강제를-oxlint로-일원화한다.md).)

### 3.2 함께 도입하는 규약

| 범위 | 형식 | 예 |
|---|---|---|
| 슬라이스·세그먼트 **내부** | 상대 경로 | `./lib/detect` · `../lib/detect`(ui→lib 세그먼트) · `./client` |
| 슬라이스 **밖** (레이어 교차 포함) | `@/` 별칭 | `@/shared/ui` · `@/entities/question` |

이 규약이 서면 **`@/` 지정자의 등장 자체가 "슬라이스를 넘었다"는 신호**가 된다. 덕분에 §4의 규칙이 레이어당 하나로 단순해진다.

규약은 선의에 맡기지 않는다 — §4의 「별칭 우회 차단」 규칙이 강제한다.

> **적용 완료 (2026-08-20)** — 경계를 넘는 import 20곳을 `@/`로 전환했고 내부 상대 경로는 그대로 두었다.
> 전환 후 빌드 산출물 해시가 **동일**했다(`index-iKsf7_kE.js`) — 순수 경로 변경임을 확인한 것이다.
> depcruise가 별칭을 해석하는지도 확인했다: `@/shared/ui => src/shared/ui/index.ts`.
> 그리고 **별칭을 경유한 위반도 잡힌다** — `src/shared/`에서 `@/entities/…`를 import하자
> `no-upward-import-shared`가 exit 1로 차단했다.

---

## 4. 경계 강제 설계

### 4.1 왜 oxlint인가

경계 강제 수단을 다시 골랐다. 판정 근거는 [ADR 0001](../adr/0001-경계-강제를-oxlint로-일원화한다.md)에 있고, 결론만 옮기면:

- `dependency-cruiser`는 TypeScript 컴파일러 API를 요구한다. TS 7에는 그 API가 없어 **`.ts` 파싱을 조용히 건너뛴다.**
- oxlint는 Rust 파서라 TS API와 무관하다. **이미 설치되어 있어 새 의존성이 0이다.**

### 4.2 규칙 매핑

> **범위를 의도적으로 넓히지 않았다.** 이 단계의 목적은 depcruise 9규칙과의 **동등성 증명**이다. 새 규칙을 함께 넣으면 검출 차이가 "기존 위반 때문인지 새 규칙 때문인지" 구분되지 않아 제거 판단이 흐려진다.
>
> 그래서 **shared 세그먼트 공개 API 강제는 넣지 않았다.** 기존 depcruise 규칙도 `features|entities|pages`의 슬라이스 캡슐화만 강제하고 shared는 다루지 않는다. 게다가 `src/app/main.tsx`가 `@/shared/ui/styles.css`를 직접 import하는데, CSS는 `index.ts`로 재수출할 수 없어(사이드이펙트가 항상 실행된다) 깊은 경로가 정당하다. 강제하려면 `.css`를 제외하는 정규식이 필요한데, 그 복잡도는 동등성 증명이 끝난 뒤에 따로 판단한다. **후속 개선 항목.**

#### CSS 파일의 배치 — 경계 규칙 밖에 있다

CSS는 `index.ts` 배럴로 재수출할 수 없다. import 자체가 사이드이펙트이고, 배럴을 거치면 **트리셰이킹으로 조용히 사라지거나 반대로 항상 실행된다.** 그래서 CSS만은 깊은 경로 import 가 정당하며, 위 override 들도 `.css` 를 잡지 않는다.

대신 **파일을 하나로 묶어 규율을 만든다.**

| 파일 | 역할 |
|---|---|
| `src/shared/ui/styles.css` | **유일한 CSS 진입점.** `main.tsx` 가 이것 하나만 import 한다 |
| `src/shared/ui/theme.css` | `@theme` 디자인 토큰. `styles.css` 가 `@import` 한다 |

**컴포넌트마다 `.css` 를 두지 않는다.** 스타일은 Tailwind 유틸리티로 컴포넌트 파일 안에 있고, 전역 규칙(폰트·`:focus-visible`·한국어 줄바꿈·reduced-motion)만 `styles.css` 의 `@layer base` 에 모인다. 진입점이 하나라 **어떤 CSS가 로드되는지 파일 목록만 보면 알 수 있고**, 레이어 경계와 무관하게 관리된다.

`styles.css` 의 `source(none)` + 명시 `@source` 는 지우면 안 된다 — Tailwind 의 자동 소스 탐지 기준점이 *현재 작업 디렉터리*라, 실행 위치가 바뀌면 클래스가 조용히 누락된다.

기존 `.dependency-cruiser.cjs`의 9개 규칙을 전부 대응시킨다.

| 기존 depcruise 규칙 | oxlint 표현 |
|---|---|
| `no-circular` | `import/no-cycle` |
| `no-upward-import-shared` | `src/shared/**` override → `@/app/**` `@/pages/**` `@/features/**` `@/entities/**` 금지 |
| `no-upward-import-entities` + `no-same-layer-slice-import`(entities) | `src/entities/**` override → 위와 동일 그룹 (자기 레이어 `@/entities/**` 포함) |
| `no-upward-import-features` + `no-cross-feature` | `src/features/**` override → `@/app/**` `@/pages/**` `@/features/**` 금지 |
| `no-upward-import-pages` + `no-same-layer-slice-import`(pages) | `src/pages/**` override → `@/app/**` `@/pages/**` 금지 |
| `no-slice-internals-from-outside` + `no-slice-internals-cross-slice` | 공통 패턴 `@/{entities,features,pages}/*/**` 금지 → 슬라이스 루트만 허용 |
| *(신규)* 별칭 우회 차단 | 공통 `regex` 패턴 — 별칭 도입으로 새로 생긴 요구 |

**자기 레이어 글롭이 교차 import 금지로 성립하는 이유** — §3.2 규약상 슬라이스 내부는 상대 경로를 쓴다. 따라서 `entities` 안에서 `@/entities/…` 지정자가 나오면 그 자체로 다른 슬라이스를 가리킨다. 슬라이스가 늘어도 **레이어당 override 1개**로 유지된다.

### 4.3 함정 — override는 top-level 규칙을 **대체**한다

**실측으로 확인한 동작이다.** `overrides[].rules`에 같은 규칙 이름이 있으면 top-level 설정을 병합하지 않고 **통째로 덮어쓴다.**

즉 공통 패턴(슬라이스 내부 금지·별칭 우회 차단)을 top-level에만 두면, override가 걸린 레이어에서는 **그 공통 패턴이 조용히 사라진다.** 검증 중 실제로 `src/shared/`의 상대 경로 우회가 검출되지 않는 것을 확인했다.

> **따라서 공통 패턴은 모든 override에 반복해서 넣는다.** 설정이 길어지는 대신 각 override가 자기 완결적이 된다. 새 레이어 override를 추가할 때 공통 패턴을 빠뜨리면 그 레이어만 조용히 무방비가 되므로, §6의 위반 주입 검증을 레이어별로 돌린다.

### 4.4 설정 원문

실물은 `frontend/.oxlintrc.json`이다. 골격만 옮기면 — `regex`의 이스케이프까지 파일에 들어간 그대로다:

```jsonc
{
  // 기본 활성 4종을 반드시 다시 적는다 — plugins 는 대체다 (§4.5)
  "plugins": ["eslint", "typescript", "unicorn", "oxc", "import", "react"],
  "rules": {
    "import/no-cycle": "error",
    // 어느 override 에도 걸리지 않는 파일(예: src 바로 아래)용 공통 패턴
    "no-restricted-imports": ["error", { "patterns": [ /* 공통 2종 */ ] }]
  },
  "overrides": [
    {
      "files": ["src/shared/**"],
      "rules": {
        "no-restricted-imports": ["error", { "patterns": [
          { "group": ["@/{entities,features,pages}/*/**"],
            "message": "슬라이스 밖에서는 루트 index만 import한다" },
          { "regex": "^\\.\\.(/\\.\\.)*/(app|pages|features|entities|shared)(/|$)",
            "message": "슬라이스를 넘는 상대 경로 금지 — @/ 별칭을 쓸 것" },
          { "group": ["@/app", "@/app/**", "@/pages", "@/pages/**",
                      "@/features", "@/features/**", "@/entities", "@/entities/**"],
            "message": "shared는 최하층이다 — 상위 레이어를 import할 수 없다" }
        ]}]
      }
    }
    // entities · features · pages 도 같은 형태 (레이어별 3번째 group 만 다르다).
    // 공통 패턴 2종은 매 override 에 반복한다 (§4.3).
  ]
}
```

각 `group`에 `"@/app"`과 `"@/app/**"`을 **둘 다** 넣는다. gitignore 스타일 글롭에서 `a/**`는 `a` 내부만 가리키므로, 레이어 루트 배럴(`src/entities/index.ts` 같은 것)이 나중에 생기면 맨몸 지정자가 빠져나간다.

**주석 — oxlint 은 받아들이지만 이 저장소는 쓰지 않는다.**

oxlint 자체는 JSONC 주석을 완전히 지원한다. 실측(2026-08-21): 여는 중괄호 **앞**과 **안** 양쪽에 `//` 주석을 넣고 돌려도 `number_of_rules = 297 · 진단 0 · exit 0` 으로 설정이 온전히 파싱된다. (`//` 를 *키*로 쓰는 방식만 안 된다 — 알 수 없는 최상위 필드로 보고 거부한다.)

그럼에도 커밋 `f23d27a` 가 주석 43줄을 전부 제거했다. **사유는 oxlint 이 아니라 편집기다** — 파일 확장자가 `.json` 이고 `$schema` 가 걸려 있어 IDE 의 JSON 스키마 검증이 주석을 오류로 표시한다. 저장소는 그 경고를 없애는 쪽을 택했다.

> ⚠️ 그 43줄에는 아래 §4.3 · §4.5 의 함정 경고가 들어 있었다. **지금 그 경고가 사는 곳은 이 문서뿐이다.** 설정을 고치기 전에 §4.3 과 §4.5 를 읽는다.

**`allowTypeImports`를 설정하지 않는 것이 중요하다.** 미설정이 기본값이며, 그래야 `import type`도 검사된다 — 기존 `tsPreCompilationDeps: true`와 동등한 방어다. type-only import는 컴파일 후 소거되므로, 검사하지 않으면 상향·교차 import가 전부 빠져나간다.

`regex`는 Rust 정규식이라 **lookahead/lookbehind를 지원하지 않는다.** 위 패턴은 쓰지 않는다.

### 4.5 함께 켜는 것 — 그리고 `plugins`의 함정

| 항목 | 이유 |
|---|---|
| `react` 플러그인 | React Hooks 규칙을 포함한다. 도입 전에는 훅 규칙이 **전혀 검사되지 않았다** |
| `import` 플러그인 | `import/no-cycle`에 필요. 설정의 `plugins` 배열로 켜면 CLI 플래그가 필요 없다 |

> ### ⚠️ `plugins`는 추가가 아니라 **대체**다
>
> 기본 활성 플러그인(`eslint`·`typescript`·`unicorn`·`oxc`)을 `plugins` 배열에 **다시 적지 않으면 그것들이 꺼진다.** 실측:
>
> | `plugins` 설정 | 활성 규칙 수 |
> |---|---|
> | 미지정 (기본값) | 97 |
> | `["import", "react"]` | **80** ← 기본값 소실 |
> | `["eslint", "typescript", "unicorn", "oxc", "import", "react"]` | **119** |
>
> 규칙을 **늘리려다 30여 개를 끄는** 사고가 나기 쉬운 자리다. 진단이 0건이면 아무 신호도 없어 알아채기 어렵다.
> **플러그인을 건드릴 때는 `--format=json`의 `number_of_rules`를 함께 확인한다.**

---

## 5. 실측 검증 기록 (2026-08-20)

격리된 픽스처 프로젝트에서 위반을 주입해 확인했다. 근거 없이 설계에 반영한 항목은 없다.

| 확인 항목 | 결과 |
|---|---|
| `import type` 검출 | ✅ 값 import와 동일하게 검출 |
| 중괄호 글롭 `@/{a,b,c}/*/**` | ✅ 동작 — 슬라이스 내부 직접 import 검출 |
| `regex` 옵션 | ✅ 동작 — 상대 경로 우회 검출 |
| `import/no-cycle` | ✅ 동작 (규칙 수 97 → 100) |
| override 병합 여부 | ⚠️ **대체된다** (§4.3) |
| 위반 8종 주입 | ✅ **8/8 검출** |
| 합법 코드 대조 | ✅ **오탐 0건** |

**합법으로 통과해야 하고 실제로 통과한 케이스** — 슬라이스 내부 세그먼트 간 상대 import(`../ui/Deep`), 하위 레이어 슬라이스 루트 import(`@/entities/foo`).

### oxlint 운용 시 주의 — 새로 발견한 조용한 실패 2건

| 증상 | 대응 |
|---|---|
| 기본 포매터는 진단 0건일 때 **비TTY 환경에서 아무것도 출력하지 않는다.** 성공인지 미실행인지 구분되지 않는다 | 진단이 필요하면 `--format=json` |
| 검사 대상이 0개일 때 | **oxlint은 exit 1로 실패한다** — 잘못된 경로든 ignore로 전부 걸러졌든. 별도 게이트가 필요 없다 |

두 번째는 **oxlint을 택할 추가 근거**다. `dependency-cruiser`는 설정으로 대상이 비면 `0 modules`로 **통과**하므로(exit 0), 설계서 §3.2가 「검사 모듈 수 > 0」 확인을 별도로 요구했다. oxlint은 그 요건을 도구가 이미 만족한다 — 실측 대조표는 [toolchain.md §5.3 ②](toolchain.md#53-ci-게이트).

---

## 6. 도입 순서 — 순서가 곧 안전장치

**새 게이트가 위반을 실제로 잡는 것을 증명하기 전에 기존 게이트를 걷어내지 않는다.**

| 단계 | 내용 | 이 단계가 끝나야 성립하는 것 |
|---|---|---|
| **A** | 경로 별칭 `@/*` 도입 (§3) ✅ | B의 패턴 규칙이 신뢰 가능해진다 |
| **B** | oxlint 경계 규칙 작성 + **위반 주입 검증** ✅ | C의 안전한 제거 |
| **C** | `dependency-cruiser` 제거 ✅ | TypeScript 6 API 의존 소멸 → [toolchain](toolchain.md)의 TS 7 단독 채택 ✅ |

각 단계는 독립 PR로 한다. A는 순수 경로 변경이므로 **동작 변경을 섞지 않는다.**

### 수용 기준 — 위반 주입 테스트

아래가 **전부 오류로 잡혀야** C로 넘어간다. 규칙이 조용히 통과하는 것을 막는 유일한 방법은 잡히는지 직접 확인하는 것이다.

| 주입할 위반 | 검사하는 규칙 |
|---|---|
| `src/shared/`에서 `@/entities/…` | 상향 import 금지 |
| 위를 **`import type`으로** | `allowTypeImports` 미설정 — 동등성의 핵심 |
| 한 feature에서 다른 feature | 슬라이스 교차 금지 |
| `@/entities/foo/ui/…` | public API 강제 |
| `../../entities/…` | 별칭 우회 차단 |
| 의도적 순환 import | `import/no-cycle` |

**대조 확인** — 위반을 제거한 뒤 다시 돌려 **0건**이 나와야 한다. 항상 실패하는 규칙은 게이트가 아니라 소음이다.

### 수용 기준 실행 결과 (2026-08-20) — 동등성 증명

실제 트리에 위반 8종을 주입해 **두 도구를 같은 조건에서 대조**했다. 이것이 `dependency-cruiser` 제거의 근거다.

| | 검출 |
|---|---|
| `dependency-cruiser` | **7건** |
| `oxlint` | **9건** — depcruise가 잡은 7건 **전부** + 2건 |

**depcruise가 잡고 oxlint가 놓친 것은 0건이다.** 추가 2건의 정체:

- `src/app/__v5-relative.ts` — 상대 경로 우회. **depcruise에 대응 규칙이 없다**(별칭 규약과 함께 새로 생긴 요구)
- 순환의 반대편 파일 — depcruise는 순환 1건당 1행, oxlint는 참여 파일마다 1행. 같은 순환을 보는 표현 차이다

주입한 8종 전부 검출됐고, 특히 **type-only 상향 import**(`import type`)가 값 import와 동일하게 잡혔다 — `tsPreCompilationDeps: true`와의 동등성이 여기서 확인된다.

**대조 확인 통과** — 프로브 제거 후 oxlint 0건 · depcruise 0건.

> 프로브 배치에 주의할 점이 있다. 처음에 page 교차 프로브를 `src/pages/__probe.ts`(슬라이스 밖)에 두었더니 depcruise의 `^src/pages/([^/]+)/` 패턴에 걸리지 않아 **oxlint만 잡는 것처럼 보였다.** 도구 차이가 아니라 픽스처 오류였다. 슬라이스 규칙을 시험할 때는 프로브도 **슬라이스 안에** 두어야 한다.

### 철수 경로

B에서 **표현할 수 없는 규칙이 나오면 C로 넘어가지 않는다.** A(경로 별칭)는 어느 경로에서도 이득이므로 유지하고, 경계 강제는 `dependency-cruiser`에 남긴다. 그 경우 TypeScript는 [toolchain](toolchain.md)의 별칭 병존안으로 돌아간다.

*(2026-08-20 시점에는 §5에서 전건 통과를 확인했으므로 이 경로는 발동하지 않는다. 규칙을 확장하다가 막히는 경우를 위해 남겨둔다.)*

---

## 부록 — 배치 조사 중 함께 발견한 결함

이 문서의 설계 대상은 아니지만 조사 과정에서 확인됐다. **수정은 별도 PR**이며, 여기 적어 두는 것은 잊히지 않게 하기 위해서다.

### A. 전송 계층 — headers 병합이 무효화된다 ✅ 해소 (2026-08-20)

> **해소됨.** 스프레드 순서를 교정하고 회귀 테스트(`client.test.ts`)를 붙였다. 아래 기록은 남겨 둔다 —
> `client.ts`의 「순서를 되돌리지 말 것」 주석이 무엇을 막는지 알려면 이 설명이 필요하다.
> 테스트가 실제로 이 버그를 잡는지도 확인했다: 순서를 되돌리면 `expected undefined to be 'application/json'`으로 실패한다.

당시 `src/shared/api/client.ts`

```ts
const res = await fetch(`${API_BASE}${path}`, {
  headers: { "Content-Type": "application/json", ...init?.headers },
  ...init,          // ← headers 키를 다시 덮어쓴다
});
```

객체 리터럴에서 `...init`이 `headers` 뒤에 오므로, `init.headers`가 주어지면 **병합 결과를 통째로 대체한다.** 실행으로 확인했다 — `init.headers = { "X-Trace": "1" }`일 때 최종 headers는 `{"X-Trace":"1"}`이고 **`Content-Type`이 사라진다.**

현재 `http.get`/`post`/`put`/`patch` 어느 호출자도 `headers`를 넘기지 않아 **잠복 상태**다. 누군가 헤더 하나를 추가하는 순간 서버가 415로 응답한다. 원인이 추가한 헤더에 있어 보이므로 진단이 어렵다.

**교정** — `...init`을 먼저 펼치고 `headers`를 뒤에 두었다. 아울러 `http.request`를 공개했다 — 헤더 병합 경로가 공개 API로 도달 가능해야 테스트로 고정되기 때문이다(비공개로 두면 버그가 다시 잠복한다).

멀티파트 전송이 `client.ts`를 거치지 않고 `fetch`를 직접 호출하는 것은 **의도된 설계다** — `FormData`는 브라우저가 boundary를 포함한 `Content-Type`을 자동 설정해야 하므로 JSON 전용 래퍼를 태우면 안 된다. 이 부분은 건드리지 않는다.

### B. `API_BASE` 이중 선언 ✅ 해소 (2026-08-20)

`client.ts`와 `answers.ts`가 각각 `import.meta.env.VITE_API_BASE ?? ""`를 선언하고 있었다. `client.ts`가 `API_BASE`를 export하고 `answers.ts`가 그것을 import하도록 바꿔 **선언 지점을 하나로 모았다.**

**다만 `?? ""` 폴백 자체가 별도의 문제다** — 값 부재를 조용히 삼켜 상대 경로로 떨어뜨린다. 그 진단과 개선 방향은 [toolchain.md §6.3](toolchain.md#63-진짜-문제는-값이-아니라-폴백이다).

### C. 에러 바운더리 없음 ✅ 해소 (2026-08-20)

렌더 중 예외가 나면 화면 전체가 빈 상태가 됐다. 진입 판정(`GuardScreen`)은 비지원 환경을 걸러주지만 런타임 예외는 다루지 않았다.

`shared/ui/ErrorBoundary.tsx`를 두고 `main.tsx`에서 `<App />`을 감쌌다. 클래스 컴포넌트인 것은 React가 에러 바운더리를 훅으로 제공하지 않기 때문이다(라이브러리 없이는 이 형태가 유일하다).

> **바운더리가 잡지 '않는' 것** — 이벤트 핸들러·비동기 콜백·SSR에서 던진 예외는 통과한다. 그런 경로는 각자 `try/catch`로 다뤄야 한다. **바운더리가 있다고 안전하다고 오해하지 말 것.**

### D. 테스트 커버리지 공백 ✅ 해소 (2026-08-20)

**A가 오래 발견되지 않은 이유가 여기 있었다.** `shared/api`에 테스트가 하나도 없었다.

착수 시점 5개 파일 40건 → **11개 파일 94건**. 보강한 곳:

| 대상 | 고정한 계약 |
|---|---|
| `shared/api/client.ts` | 헤더 병합(A의 회귀) · 응답 처리 · 경로 조립 |
| `shared/ui/ErrorBoundary.tsx` | 예외를 잡아 빈 화면이 되지 않을 것 · 조용히 삼키지 않을 것 |
| `app/store/practice-store.ts` | 전이별 최소 변경 · `reset` 전 필드 복원 · 구독 해제 |
| `pages/*` 3종 | **실패를 드러내는 배너**(오디오 차단·Wake Lock 강등·서버 미연동)와 버튼 배선 |

스토어 테스트를 쓰다가 **호출부 결함이 하나 드러났다** — 아래 E.
