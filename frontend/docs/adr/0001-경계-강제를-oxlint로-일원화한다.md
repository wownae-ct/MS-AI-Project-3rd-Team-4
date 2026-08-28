# 0001. FSD 레이어 경계 강제를 oxlint로 일원화하고 dependency-cruiser를 제거한다

- 상태: **승인**
- 날짜: 2026-08-20 · 결정자: gunny (프론트 담당) · 합의 채널: —
- 설계서 관련 절: §10.4 「린트 및 의존성」 · §10.9 「TypeScript 6 → 7 전환」 · §3.1~3.2 「조용한 실패 대응」
  — **설계서가 규정한 도구 선택을 바꾸는 결정이다.** 설계서는 프론트 담당 재량이므로 이 ADR의 채택이 곧 해당 절의 개정이다. 반영 내용은 [toolchain.md §7](../architecture/toolchain.md#7-설계서-개정-사항).

## 맥락

`.dependency-cruiser.cjs`의 9개 규칙이 FSD 레이어 경계를 강제한다. 이 도구가 선택된 이유는 명시돼 있다 — oxlint에 레이어 경계 규칙이 없기 때문이다([oxc#13789](https://github.com/oxc-project/oxc/issues/13789), 2026-08-20 기준 여전히 **open**).

문제는 `dependency-cruiser`가 **TypeScript 컴파일러 API에 의존**한다는 점이다. 로컬 실측:

```
$ npx depcruise --info
✔ typescript             >=2.0.0 <7.0.0      typescript@6.0.3
```

지원 상한이 `<7.0.0`이다. TypeScript 7은 Go로 재작성되면서 안정 프로그래밍 API를 노출하지 않는다 — 공식 발표 원문: *"TypeScript 7.0 does not yet expose a stable programmatic API… We expect TypeScript 7.1 to ship with a new (and different) API."*

따라서 TS 7을 단독 설치하면 이 줄이 `x`가 되고 **`.ts` 파싱이 에러 없이 빠진다.** 검사한 척하고 통과하는 것이다.

설계서 §10.9는 이를 npm 별칭 2줄로 우회한다 — `typescript`를 `@typescript/typescript6`로, `@typescript/native`를 진짜 `typescript@7`로 별칭 지정해 컴파일러 2개를 병존시킨다. Microsoft가 공식 권고하는 패턴이고 기술적으로 성립한다(`tsc6`/`tsc` bin 충돌 없음을 실측 확인).

**그런데 병존이 필요한 이유는 이 도구 하나뿐이다.** 병존은 목적이 아니라 우회다. 그리고 그 우회에는 컴파일러 2개·6단계 전환 절차·롤백 경로·3중 해소 지표·2중 CI 게이트가 딸려 온다.

지금이 결정 시점인 이유 — 툴체인을 손보는 김에 정하지 않으면, 별칭 구성이 자리 잡은 뒤에는 되돌리는 비용이 커진다.

## 검토한 대안

| 대안 | 장점 | 단점 | 기각 사유 |
|---|---|---|---|
| **설계서안** — depcruise 유지 + TS 6·7 별칭 병존 | 현 설정 그대로 · Microsoft 공식 패턴 · 그래프 전역 분석 유지 | 컴파일러 2개 병존 · `node_modules/typescript`가 실은 typescript6 · `tsc`/`tsc6` 두 명령 · 6단계 절차 · 해소 조건이 외부 릴리스에 묶임 | 기각 — 도구 하나를 살리려고 툴체인 전체 복잡도를 떠안는다. 해소 지표 ①("TS 7.1 출시")도 불충분하다: depcruise가 상한을 넓힌 릴리스를 내야 하고 7.1 API는 "new and different"라 이식이 별도로 필요하다 |
| depcruise + swc 파서로 교체 | TS API 의존 제거 | swc 값은 **deprecated**(제거 예정) · **`import type`을 검출하지 못한다** | 기각 — 현재 `tsPreCompilationDeps: true`가 막는 구멍이 정확히 다시 열린다. type-only import는 컴파일 후 소거되므로 상향·교차 import가 전부 빠져나간다. **조용한 실패를 없애려다 조용한 실패를 만든다** |
| `import/no-restricted-paths` (eslint-plugin-import 규칙) | 목적에 정확히 부합 | oxlint에 **미구현**([oxc#13789](https://github.com/oxc-project/oxc/issues/13789) open) | 기각 — 존재하지 않는다 |
| **Steiger** (FSD 공식 린터) | FSD 전용 설계 · **TS API 의존 0**(`web-tree-sitter` 파싱) · 구조적 위반까지 검출 | **beta·pre-1.0** · 0.5.0에서 설정 형식 breaking change 이력 · CI exit code 미문서화 · 새 의존성 + wasm | 기각 — **차단 게이트로 쓰기엔 안정성이 부족하다.** 게이트가 스스로 흔들리면 게이트가 아니다. 보조 도구로는 재검토 여지 있음 |
| **oxlint `no-restricted-imports` + `overrides`** ← 채택 | **이미 설치된 도구** · 새 의존성 0 · Rust 파서라 TS API 무관 · `import type` 검사 · 훅 규칙을 같이 확보 | 그래프 전역 분석이 아닌 **파일 단위 문자열 매칭** → 경로 별칭 규약에 의존 | — |

## 결정

**FSD 경계 강제를 oxlint로 일원화하고 `dependency-cruiser`를 제거한다.** 단, 순서를 지킨다 — 경로 별칭 도입 → oxlint 규칙 작성 및 **위반 주입 검증 통과** → 그 다음에 제거. 새 게이트가 실제로 잡는 것을 증명하기 전에 기존 게이트를 걷어내지 않는다.

규칙 매핑과 설정 원문은 [architecture/layers.md](../architecture/layers.md)에 있다. 요지는 세 가지다.

1. **경로 별칭 `@/*`가 선행 필수다.** oxlint 규칙은 import 지정자 문자열에 걸리므로, 별칭이 없으면 패턴을 신뢰할 수 없다. 별칭은 편의가 아니라 강제 수단의 전제다.
2. **`allowTypeImports`를 설정하지 않는다.** 미설정이 기본값이고, 그래야 `import type`도 검사된다 — `tsPreCompilationDeps: true`와 동등한 방어.
3. **공통 패턴을 모든 override에 반복한다.** 실측 결과 `overrides[].rules`는 top-level 설정을 병합하지 않고 **대체**한다. 공통 패턴을 top-level에만 두면 override가 걸린 레이어에서 조용히 사라진다.

### 실측 검증 (2026-08-20)

격리 픽스처에서 확인했다. 근거 없이 반영한 항목은 없다.

| 항목 | 결과 |
|---|---|
| 위반 8종 주입 | **8/8 검출** |
| 합법 코드 대조 | **오탐 0건** |
| `import type` | ✅ 값 import와 동일하게 검출 |
| 중괄호 글롭 `@/{a,b,c}/*/**` | ✅ 동작 |
| `regex` 옵션 (Rust 정규식, lookahead 불가) | ✅ 동작 |
| `import/no-cycle` | ✅ 동작 (규칙 수 97 → 100) |
| override 병합 여부 | ⚠️ **대체된다** — 위 3번의 근거 |

## 결과

**쉬워지는 것**

- **TypeScript 7 단독 설치가 성립한다** → [ADR 0002](0002-typescript-7을-단독으로-채택한다.md). 설계서 §10.9 전체(별칭 2줄·6단계 절차·롤백 경로·3중 지표·`--info` 게이트·모듈 수 게이트)가 불필요해진다.
- 도구가 하나로 준다. 경계 위반과 코드 품질을 같은 명령이 같은 형식으로 보고한다.
- `react` 플러그인을 함께 켜면서 **현재 전혀 검사되지 않는 React Hooks 규칙**을 확보한다.

**어려워지는 것**

- 그래프 전역 분석이 아니다. 규칙이 **경로 별칭 규약에 의존**하므로, 상대 경로 이탈 금지 규칙이 반드시 짝으로 있어야 한다. 이 짝이 깨지면 우회가 가능해진다.
- 새 레이어 override를 추가할 때 **공통 패턴을 빠뜨리면 그 레이어만 조용히 무방비**가 된다. 아래 검증을 레이어별로 돌리는 이유다.
- 기존 규칙 중 정규식 백레퍼런스(`$1`/`$2`)로 표현하던 것은 형태를 바꿔 다시 써야 한다.

**뒤집으려면**

`dependency-cruiser`를 devDependency로 되돌리고 `.dependency-cruiser.cjs`를 복원한다(삭제하지 말고 git 이력에서 되살린다). 그 시점에 TypeScript가 7이면 [ADR 0002](0002-typescript-7을-단독으로-채택한다.md)도 함께 되돌리거나 설계서 §10.9 별칭 병존안으로 전환해야 한다 — **두 결정이 이 방향으로는 묶여 있다.**

**철수 조건** — 위반 주입 검증에서 표현할 수 없는 규칙이 나오면 제거 단계로 넘어가지 않는다. 경로 별칭은 어느 경로에서도 이득이므로 유지하고, 경계 강제만 `dependency-cruiser`에 남긴다. *(2026-08-20 시점 전건 통과 확인했으므로 발동하지 않은 상태다. 규칙을 확장하다 막히는 경우를 위해 남겨둔다.)*

**검증 방법**

- **위반 주입 테스트** — 상향 import · `import type` 상향 · 슬라이스 교차 · 슬라이스 내부 직접 import · 상대 경로 우회 · 순환 import를 각각 심어 전부 오류로 잡히는지 확인한다. 목록은 [layers.md §6](../architecture/layers.md#6-도입-순서--순서가-곧-안전장치).
- **대조 확인** — 위반 제거 후 0건. 항상 실패하는 규칙은 게이트가 아니라 소음이다.
- **검사 대상이 비었을 때의 거동** — 실측 결과 `oxlint`는 대상이 0개면 **스스로 exit 1로 실패한다**(잘못된 경로든 ignore로 전부 걸러졌든). 반면 `dependency-cruiser`는 설정으로 대상이 비면 `0 modules`로 **통과한다**(exit 0) — 설계서 §3.2가 「검사 모듈 수 > 0」을 별도로 요구한 이유가 이것이다. **이 전환으로 그 요구가 소멸한다.** 대조표는 [toolchain.md §5.3 ②](../architecture/toolchain.md#53-ci-게이트).
