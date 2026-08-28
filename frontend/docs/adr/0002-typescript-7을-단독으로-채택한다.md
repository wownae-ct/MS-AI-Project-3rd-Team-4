# 0002. TypeScript 7을 별칭 병존 없이 단독으로 채택하고 Node 24를 고정한다

- 상태: **승인**
- 날짜: 2026-08-20 · 결정자: gunny (프론트 담당) · 합의 채널: —
- 설계서 관련 절: §10.2 「의존성 채택 스펙」 · §10.3 「Node 런타임 스펙」 · §10.9 「TypeScript 6 → 7 전환」
  — **§10.9의 별칭 2줄 구성을 채택하지 않는 결정이다.** 설계서는 프론트 담당 재량이므로 이 ADR의 채택이 곧 해당 절의 개정이다. 반영 내용은 [toolchain.md §7](../architecture/toolchain.md#7-설계서-개정-사항).
- 선행 의존: **[ADR 0001](0001-경계-강제를-oxlint로-일원화한다.md)** — 그 결정이 서지 않으면 이 결정은 성립하지 않는다.

## 맥락

설계서 §10.9는 TypeScript 7 전환을 P1으로 규정하되, `typescript` 6과 7을 npm 별칭으로 병존시키도록 한다.

```jsonc
"@typescript/native": "npm:typescript@~7.0.2",
"typescript": "npm:@typescript/typescript6@^6.0.2"
```

Microsoft가 공식 권고하는 패턴이고 실측상 문제없이 성립한다 — `@typescript/typescript6@6.0.2`의 bin은 `tsc6`, `typescript@7.0.2`의 bin은 `tsc`라 **이름 충돌이 없다.**

병존이 필요한 이유는 하나다. `dependency-cruiser`가 TypeScript 컴파일러 API를 요구하는데 TS 7에 그 API가 없다. [ADR 0001](0001-경계-강제를-oxlint로-일원화한다.md)이 그 의존을 없애면, **병존의 유일한 근거가 사라진다.**

한편 런타임 쪽은 고정 장치가 전혀 없다. `engines`·`.nvmrc`·`packageManager` 어디에도 Node 버전 제약이 없고, CI만 `node-version: "24"`라는 부동 핀을 쓴다. 그 결과 **로컬 Node가 `v24.11.1`로 하한 미달인 상태가 아무 신호 없이 유지되고 있다** — `jsdom@30.0.1`의 `engines`가 `^22.22.2 || ^24.15.0 || >=26.0.0`이므로 24 계열 하한은 `24.15.0`이다.

## 검토한 대안

| 대안 | 장점 | 단점 | 기각 사유 |
|---|---|---|---|
| **설계서안** — 별칭 2줄 병존 | Microsoft 공식 패턴 · depcruise 그대로 유지 · TS7 성능 확보 | 컴파일러 2개 · `node_modules/typescript`가 실은 typescript6(처음 보는 사람은 반드시 헷갈린다) · `tsc`/`tsc6` 두 명령 · 6단계 전환 절차 · CI `--checkers` 핀 · 해소 조건이 외부 릴리스에 묶임 | 기각 — ADR 0001이 서면 병존의 근거 자체가 없다. 근거 없는 복잡도는 비용만 남는다 |
| **TS 6.0.3 유지** (전환 보류) | 무위험 · 변경 0 | 설계서 P1 3건 보류 · TS 6은 JS 코드베이스 최종 릴리스라 언젠가는 넘어가야 함 | 기각 — ADR 0001로 차단 요인이 사라졌는데 미룰 이유가 없다. 나중에 옮길수록 코드가 늘어 비용이 커진다 |
| TS 7 단독 + depcruise 유지 | 도구 유지 | depcruise가 `.ts` 파싱을 **에러 없이 건너뛴다** | 기각 — 경계 강제가 조용히 무력화된다. 게이트가 있는 척하는 상태가 없는 것보다 나쁘다 |
| **TS 7 단독 + oxlint 경계 강제** ← 채택 | `tsc` 하나 · 되돌림 1줄 · §10.9 절차 전체 소멸 | ADR 0001에 종속 | — |

## 결정

**`typescript`를 `~7.0.2`로 단독 채택한다.** 별칭 없음, `tsc` 하나.

**Node를 고정한다** — `engines.node = "^24.15.0"` · `.nvmrc = 24.19.0` · CI `node-version = "24.19.0"`.

### 적합성 — 문법적 차단 요인 0건

TS 7이 제거한 항목과 현재 `tsconfig.app.json`을 전수 대조했다. `target: es5` · `module: amd|umd|systemjs|none` · `moduleResolution: node|node10|classic` · `baseUrl` · `downlevelIteration` · `esModuleInterop:false` — **하나도 쓰지 않는다.**

확인 대상은 기본값 변경 1건뿐이다. `noUncheckedSideEffectImports`가 기본 `true`가 되면서 `src/app/main.tsx`의 CSS 사이드이펙트 import 2줄이 검사 대상이 된다. `vite/client`의 `*.css` 선언으로 통과할 것으로 보이나 **전환 시 `tsc -b`로 실측한다.**

상세 대조표는 [architecture/toolchain.md §3](../architecture/toolchain.md#3-typescript--7-단독-채택).

### 성능에 대한 정직한 기록

TS 7의 홍보 문구는 빌드 8~12배 향상이다. **이 저장소(50 모듈)에서는 체감되지 않는다** — 절약되는 것은 초 단위다.

**이 전환의 동기는 속도가 아니라 단순화다.** 이 점을 명시하지 않으면 나중에 "왜 이걸 했는데 안 빨라지냐"는 되물음이 남는다.

## 결과

**쉬워지는 것**

- 컴파일러가 하나다. `tsc`만 있고 `tsc6`가 없다. `node_modules/typescript`가 실제로 typescript다.
- 설계서 §10.9의 6단계 전환 절차·롤백 경로·3중 해소 지표가 전부 불필요해진다. 그중 **해소 지표는 외부 릴리스에 묶인 무기한 부채**였다 — depcruise가 `<7.0.0` 상한을 넓힌 릴리스를 내야 하고, TS 7.1 API는 "new and different"라 이식이 별도로 필요하다.
- Node 고정으로 **현재 진행 중인 하한 미달(로컬 v24.11.1)이 드러난다.**

**어려워지는 것**

- TS 7 컴파일러 API가 필요한 도구를 앞으로 쓸 수 없다. 그런 도구를 도입해야 하면 그때 별칭 병존을 다시 검토한다.
- Node를 `24.19.0`으로 핀하므로 로컬 환경을 맞춰야 한다. `.nvmrc`가 그 안내 역할을 한다.

**뒤집으려면**

`typescript`를 `~6.0.3`으로 되돌린다. **1줄이다.** 락파일 재생성 외에 부수 작업이 없다.

Node 고정을 되돌리는 것은 권하지 않는다 — ADR 0001의 채택 여부와 무관하게 이득이며, 되돌리면 §맥락의 하한 미달 상태로 돌아간다.

**검증 방법**

```bash
cd frontend
npm run typecheck    # tsc -b — noUncheckedSideEffectImports 하 CSS import 통과 확인
npm run lint
npm test
npm run build
```

기준선(50 modules · 5 테스트 파일 · 40 테스트)이 유지되는지 함께 본다 — [toolchain.md §1](../architecture/toolchain.md#1-현재-기준선-2026-08-20-실측).

### Node LTS 일정 (기록용)

[nodejs/Release `schedule.json`](https://raw.githubusercontent.com/nodejs/Release/main/schedule.json) 확인값 — v24 Krypton: Active LTS 2025-10-28 · **Maintenance 2026-10-20** · EOL **2028-04-30**.

**두 달 뒤 Maintenance로 넘어간다.** 채택 결론은 유지된다(EOL까지 보안 패치 지속, 프론트는 SWA 정적 배포라 런타임 영향이 CI·로컬에 한정). 다만 "채택 시점 Active LTS"라는 서술은 곧 사실이 아니게 되므로 여기 남긴다.
