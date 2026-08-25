# frontend/docs — 프론트엔드 구현 문서

> **최종 갱신** 2026-08-25 (백엔드 연동 설계 — ADR 0007 + architecture 3종 신설)
>
> ✅ 이 폴더는 커밋된다 (`!frontend/docs/` 예외). 여기 두는 문서는 팀 전체에 공유되는 공개 문서다 —
> 로컬 메모·시크릿·개인 기록은 두지 않는다.

## 폴더 색인

| 폴더 | 역할 |
|---|---|
| [architecture/](architecture/README.md) | 적용 설계 요약과 세부 문서 진입점 |
| [design/](design/README.md) | 디자인 규범 — 색 · 서체 · 형태 · 접근성 · 레이아웃의 값과 근거 |
| [mockups/](mockups/README.md) | 화면 스펙 S1~S6 (정적 사본) |
| [adr/](adr/README.md) | 아키텍처 결정 기록 진입점 |

### architecture/ — 적용 설계

규범이 아니라 **이 저장소가 어떻게 적용하기로 했는지와 그 근거**다. 모든 도구 동작은 실측으로 확인했다.

| 문서 | 내용 |
|---|---|
| [architecture/README.md](architecture/README.md) | 폴더 빠른 길잡이 |
| [architecture/toolchain.md](architecture/toolchain.md) | 런타임(Node 24 고정) · TypeScript 7 단독 채택 · 의존성 스펙 · 빌드/타입 설정 · CI 게이트 · 환경변수 |
| [architecture/layers.md](architecture/layers.md) | FSD 레이어 규범 · 현재 배치 진단 · 경로 별칭 설계 · oxlint 경계 강제 설계와 검증 기록 |
| [architecture/backend-integration.md](architecture/backend-integration.md) | **백엔드 연동** — 전송 계층 5계약 · `VITE_API_BASE` 형식 게이트 · 세션/라우트 가드 · 브라우저 지원 매트릭스 · **로컬이 가리는 것 4건** · 백엔드에 요구하는 변경 |
| [architecture/api-contract.md](architecture/api-contract.md) | **API 계약 발췌** — 프론트가 부르는 엔드포인트 · 계약 어휘(Literal) · **TS 이관 함정 7종** · 드리프트 감지 · OpenAPI로 못 잡는 것 |
| [architecture/chat-streaming.md](architecture/chat-streaming.md) | **SSE 상담(S3)** — 와이어·파서 계약(명세 원문) · 이벤트 7종 상태 기계 · 종료 판정 · 실패 모드 · 테스트 픽스처 |

### design/ — 디자인 규범

값의 **소재지**는 `src/shared/ui/theme.css`이고, **왜 그 값인지**가 여기다. 이 문서군은 `frontend/` 밖을 규범의 근거로 참조하지 않는다.

> ⚠️ **「제안」 표시가 붙은 항목은 아직 코드에 적용되지 않았다.** 각 문서가 **현행**과 **제안(미적용)** 을 항목마다 구분한다.

| 문서 | 내용 |
|---|---|
| [design/README.md](design/README.md) | 진입점 · 현행 규범 요약 · 갱신 규칙 |
| [design/decisions.md](design/decisions.md) | 규범 결정 D1~D11 — 맥락 · 대안 · 결정 · 되돌림 비용 |
| [design/a11y.md](design/a11y.md) | 접근성 정책 — 터치 타겟 · 글자 크기 · 대비. 표준 원문과 **근거 등급** |
| [design/namespaces.md](design/namespaces.md) | Tailwind 네임스페이스 폐기 감사 — **「덮어쓰기」와 「폐기」는 다르다** |
| [design/layout.md](design/layout.md) | 앱 셸 계약 · 라우트 표 · 내비게이션 접근성 · 화면별 폭 |
| [design/inventory.md](design/inventory.md) | 6화면 UI 패턴 → Base UI 매핑 · 번들 비용 · 구현 함정 |
| [design/implementation-plan.md](design/implementation-plan.md) | 구현 순서(커밋 단위)와 검증 절차 |

### mockups/ — 화면 스펙

| 문서 | 내용 |
|---|---|
| [mockups/README.md](mockups/README.md) | 출처 · 가공 내역 · **이 사본에 없는 것**(탭바 · 데스크톱) · 목업이 답하지 않는 것 |

### adr/ — 아키텍처 결정 기록

| 문서 | 내용 |
|---|---|
| [adr/README.md](adr/README.md) | ADR 운영 절차 — 무엇이 ADR감인가, 언제 쓰는가 |
| [adr/TEMPLATE.md](adr/TEMPLATE.md) | ADR 템플릿 |
| [adr/0001-경계-강제를-oxlint로-일원화한다.md](adr/0001-경계-강제를-oxlint로-일원화한다.md) | 경계 강제를 oxlint로 일원화하고 dependency-cruiser 제거 — **승인·적용 완료** |
| [adr/0002-typescript-7을-단독으로-채택한다.md](adr/0002-typescript-7을-단독으로-채택한다.md) | TypeScript 7 단독 채택 + Node 24 고정 — **승인·적용 완료** |
| [adr/0003-스타일링-엔진으로-tailwind-css-v4를-채택한다.md](adr/0003-스타일링-엔진으로-tailwind-css-v4를-채택한다.md) | Tailwind CSS v4 채택 + DESIGN.md 토큰을 @theme로 이관 — **승인·적용 완료** |
| [adr/0004-접근성-프리미티브로-base-ui를-채택한다.md](adr/0004-접근성-프리미티브로-base-ui를-채택한다.md) | 접근성 프리미티브로 Base UI 채택(Tabs·Progress) — **승인·적용 완료** |
| [adr/0005-라우터로-tanstack-router를-채택한다.md](adr/0005-라우터로-tanstack-router를-채택한다.md) | 라우터 TanStack Router 채택 + 라우트 단위 코드 분할 — **제안**(R1~R6 충족 · **R7만 미충족** — Slow 4G 콜드 캐시 실측 대기) |
| [adr/0006-디자인-규범의-ssot를-프론트엔드-안에-둔다.md](adr/0006-디자인-규범의-ssot를-프론트엔드-안에-둔다.md) | 디자인 규범 SSOT를 프론트엔드 안에 두고 네임스페이스 폐기·빌드 게이트로 강제 — **승인** |
| [adr/0007-백엔드-연동-아키텍처를-확정한다.md](adr/0007-백엔드-연동-아키텍처를-확정한다.md) | 백엔드 연동 아키텍처 — 인증 우선 수직 관통 · 라우터 로더(라이브러리 미도입) · Chromium 전용 · 3층 예산 — **제안**(결정자 승인 대기) |

## 적용 로드맵

ADR 0001·0002 승인(2026-08-20)에 따른 실행 순서다. **각 항목은 독립 PR**이며, 상태는 이 표에서 추적한다.

> **원칙 — 순서가 곧 안전장치다.** 새 게이트가 위반을 실제로 잡는 것을 증명하기 전에 기존 게이트를 걷어내지 않는다.

| # | 작업 | 크기 | 선행 | 상태 |
|---|---|---|---|---|
| **1** | **런타임 고정 + CI 게이트** — `engines`·`.nvmrc`(CI가 `node-version-file`로 참조), npm 캐시, typecheck 스텝 신설, `--if-present` 제거, 빈 `VITE_API_BASE` 경고 ([toolchain §2](architecture/toolchain.md#2-런타임--node-24-단일화)·[§5.3](architecture/toolchain.md#53-ci-게이트)) | 중 | 없음 | ✅ |
| **2** | **전송 계층 결함 수정** — headers 병합 무효화 + 회귀 테스트, `API_BASE` 단일화 ([layers 부록 A·B](architecture/layers.md#부록--배치-조사-중-함께-발견한-결함)) | 소 | 없음 | ✅ |
| **3** | **경로 별칭 `@/*` 도입** — `paths` 단독 선언 + Vite `resolve.tsconfigPaths`. 순수 경로 변경(빌드 해시 동일) ([layers §3](architecture/layers.md#3-경로-별칭-설계)) | 중 | — | ✅ |
| **4** | **oxlint 경계 규칙 + 위반 주입 검증** — 8종 전건 검출 · 대조 0건 · **depcruise 대비 동등성 증명 완료** ([layers §4](architecture/layers.md#4-경계-강제-설계)·[§6](architecture/layers.md#6-도입-순서--순서가-곧-안전장치)) | 중 | 3 | ✅ |
| **5** | **dependency-cruiser 제거** — 4의 동등성 증명이 전제(충족) | 소 | 4 | ✅ |
| **6** | **TypeScript 7 단독 채택** — 빌드 해시 동일, 되돌림 1줄 ([toolchain §3.5](architecture/toolchain.md#35-전환-절차와-되돌림)) | 소 | 5 | ✅ |
| **7** | **도메인 API를 `entities/{slice}/api/`로 이동** — 타입 이중 정의 해소, 응답 타입 `unknown` 유지 ([layers §2.1](architecture/layers.md#21-도메인-api가-shared에-있었다--타입-이중-정의의-근본-원인-해소됨)) | 중 | 3 | ✅ |
| **8** | ~~**환경변수 단일 진입점** — `shared/config/env.ts`~~ | 소 | — | ⛔ **폐기** (10에서 `shared/config/` 삭제. 전송 계층은 백엔드 착수 시 새로 세운다. 옛 코드는 `git show f23d27a:frontend/src/shared/config/env.ts`) |
| **9** | **품질·정합** — 규칙 확장(119→262) · 결함 수정 · 설정 정합 · **에러 바운더리** · **테스트 5→11파일 40→94건** | 중 | 없음 | ✅ |
| **10** | **src 초기화 + 디자인 시스템 구현** — 이전 주제 코드 전면 제거 · Tailwind CSS v4 + Base UI 도입 · 디자인 토큰 이관 · 스타일가이드 화면 · 게이트 2종 신설(`jsx-a11y` 활성화 262→297, 번들 예산 + 디자인 규범 검사) ([ADR 0003](adr/0003-스타일링-엔진으로-tailwind-css-v4를-채택한다.md)·[0004](adr/0004-접근성-프리미티브로-base-ui를-채택한다.md)) | 대 | 없음 | ✅ |

**1·2를 먼저 하는 이유** — 1은 지금 진행 중인 Node 하한 위반(로컬 v24.11.1 < 24.15.0)을 드러내고 이후 모든 변경에 검증망을 깔아 준다. 2는 잠복 버그를 한 줄로 없애고, 그 회귀 테스트가 무커버리지 상태인 `shared/api`의 첫 테스트가 된다. **둘 다 선행 의존이 없어 지금 바로 가능하다.**

**3~6은 하나의 체인이다.** 중간에서 멈추면 안 되는 구간은 4→5뿐이다(검증 없이 제거 금지). 4에서 표현 못 하는 규칙이 나오면 5로 넘어가지 않고 철수한다 — 조건은 [ADR 0001 「결과」](adr/0001-경계-강제를-oxlint로-일원화한다.md).

## 읽는 순서

| 필요 | 문서 |
|---|---|
| 왜 이 툴체인인가 · 버전을 올려도 되나 | [architecture/toolchain.md](architecture/toolchain.md) |
| 파일을 어디에 둘까 · import가 왜 막히나 | [architecture/layers.md](architecture/layers.md) |
| 이 색을 써도 되나 · 라운드는 몇인가 | [design/README.md](design/README.md) |
| 왜 그 값인가 · 바꾸려면 | [design/decisions.md](design/decisions.md) |
| 글자 크기 · 터치 타겟 · 대비 기준 | [design/a11y.md](design/a11y.md) |
| 어떤 화면을 만드나 | [mockups/README.md](mockups/README.md) |
| 이 결정이 어떻게 나왔나 · 뒤집으려면 | [adr/](adr/README.md) |
| 백엔드에 어떻게 붙나 · 로그인이 왜 안 되나 | [architecture/backend-integration.md](architecture/backend-integration.md) |
| 이 엔드포인트를 어떻게 부르나 · 이 필드 타입이 뭔가 | [architecture/api-contract.md](architecture/api-contract.md) |
| 상담 스트림을 어떻게 읽나 | [architecture/chat-streaming.md](architecture/chat-streaming.md) |

## 기술 스펙의 소재지 (2026-08-21 갱신)

**기술 스펙의 규범은 [architecture/toolchain.md](architecture/toolchain.md)다.**

한때 저장소 루트 `docs/`의 설계서(`frontend_architecture_v3.7.md`)가 원문이었으나 **레거시가 되어 백업 경로로 옮겨졌다.** 애초에 `.gitignore` 대상이라 커밋되지 않았고, 그래서 architecture 문서가 팀 공유에 필요한 값과 근거를 **발췌해 자립적으로 기록**해 왔다 — 그 기록이 이제 유일한 규범이다.

설계서와 다르게 정하거나 정정한 항목은 [toolchain.md §7](architecture/toolchain.md#7-설계서-개정-사항)에 남아 있다. 그 표는 이제 개정 요청이 아니라 **왜 지금 값이 이 값인지에 대한 근거**로 읽는다.

## 갱신 규칙

- 새 아키텍처 문서·가이드는 이 색인에 추가한다.
- architecture 문서의 **실측값(버전·기준선·도구 동작)을 고칠 때는 실제로 명령을 돌려서 갱신한다.** 기억으로 적지 않는다.
- 문서 소유: 프론트 담당.
