# 0004. 접근성 프리미티브를 직접 구현하지 않고 Base UI를 채택한다

- 상태: **승인**
- 날짜: 2026-08-21 · 결정자: gunny (프론트엔드·디자인 담당) · 합의 채널: —
- 설계서 관련 절: 설계서는 컴포넌트 **구현 출처**를 규정하지 않는다. 규범이 열어둔 재량 사항이다.
- 선행 의존: 0003 (Tailwind CSS v4) — 무스타일 라이브러리를 고르는 근거가 0003의 팔레트 폐기 전략과 맞물린다.
- 값의 출처: 저장소 히스토리의 제품·디자인 문서 (커밋 `558a463`)

## 맥락

주제와 화면 기획은 아직 확정되지 않았지만, 접근성 기준은 이미 정해져 있다. 제품 문서(`git show 558a463:PRODUCT.md`)의 요구는 이렇다:

> 별도로 정해진 표준 없음(사용자 확인) — 대비 4.5:1, 키보드 내비게이션, **명확한 포커스 표시**, 44px 이상 터치 타겟 등 일반 모범사례를 기준으로 한다.

"일반 모범사례"라는 말은 느슨해 보이지만, 실제로 구현하려 들면 **손으로 만들었을 때 조용히 틀리는 영역**이 정확히 정해져 있다.

- **탭** — 로빙 tabindex, 화살표 키 순환, `aria-controls`/`aria-selected` 동기화, 패널과의 연결.
- **진행률 바** — `role="progressbar"` + `aria-valuemin/max/now`가 값과 어긋나지 않게 유지.
- (이후 필요해지면) 슬라이더, 라디오 그룹, 다이얼로그의 포커스 트랩.

이것들은 **테스트로도 잘 안 잡힌다.** 포커스 순서와 로빙 tabindex는 jsdom에서 재현이 어렵고, 눈으로 봐서는 멀쩡해 보인다. 이 저장소의 원칙상 그건 방치할 실패다.

동시에 제약이 있다. 디자인 문서가 확정한 시각 언어 — 베리 플럼 단일 포인트 컬러, **그림자 없이 1px 헤어라인 보더만**, 라운드 10px 안팎 — 는 어떤 기성 컴포넌트 킷과도 그대로 맞지 않는다. 스타일이 이미 입혀진 라이브러리를 가져오면 그 스타일을 벗기는 비용이 든다.

지금이 결정 시점인 이유 — 0003으로 전 컴포넌트를 새로 스타일링한다. 프리미티브 출처를 정하지 않고 손으로 스타일을 입힌 뒤 라이브러리로 갈아끼우면 이중 작업이 된다.

## 검토한 대안

| 대안 | 최신 · 주간 DL | 장점 | 단점 | 기각 사유 |
|---|---|---|---|---|
| **직접 구현** | — | 의존성 0 · 번들 증가 0 · 완전한 통제 · YAGNI 부합 | 탭의 로빙 tabindex, 슬라이더의 키보드 스텝, 다이얼로그 포커스 트랩을 손으로 | 기각 — Button·Card·Badge 수준이면 직접 구현이 맞고 실제로 그렇게 한다. 그러나 **탭·슬라이더·다이얼로그는 손으로 만들면 조용히 틀리는 영역**이고 테스트로도 잘 안 잡힌다 |
| **Radix UI** | — | 사실상 표준 · 가장 널리 쓰임 · 성숙 | Base UI가 **같은 제작진의 후속작**이고 Radix에서 배운 교훈으로 API를 다시 설계했다 · shadcn/ui도 2026-07부터 신규 프로젝트 기본을 Base UI로 전환 | 기각 — 유지보수는 계속되지만(공식: *"Radix is not being deprecated"*) **신규 채택할 이유가 약하다** |
| **React Aria Components** | 1.20.0 · — | 접근성 엄밀도 최상(Adobe) · i18n·RTL·터치 대응 내장 | 번들이 크다 · 렌더 프롭 중심이라 학습 곡선 · i18n/RTL은 이 제품에 불필요(한국어 단일) | 기각 — 얻는 엄밀도 대부분이 제품 범위 밖이다 |
| **shadcn/ui 복사 도입** | — | 스타일까지 완비된 컴포넌트를 `shared/ui`에 직접 복사 가능 · 2026-07부터 Base UI 기반 | 생성 코드가 **자체 토큰 체계(`baseColor`)를 깐다** → 0003의 `--color-*: initial` 팔레트 폐기 및 DESIGN.md 토큰과 정면 충돌 · `cn()` + `class-variance-authority` + `tailwind-merge` 의존이 딸려옴 · 기본 스타일이 그림자·라운드를 쓰는데 DESIGN.md는 둘 다 절제한다 | 기각 — 스타일이 이미 입혀진 것이 장점이자 단점이다. DESIGN.md로 갈아엎을 거면 복사해 온 스타일의 가치가 사라지고 충돌 해소 비용만 남는다 |
| **Base UI** | 1.7.0 · 8,631,540 ← 채택 | **완전 무스타일** → DESIGN.md 토큰과 충돌 0 · 서브패스 + `sideEffects: false`로 쓰는 것만 번들 · `data-*` 속성 기반 스타일링이 Tailwind 변이와 그대로 맞물림 · **`data-starting-style`/`data-ending-style`이 CSS `@starting-style`(Chrome 117, 하한 초과) 없이 전환을 가능하게 한다** | 새 의존성 · `@babel/runtime` 헬퍼 동반 · 스타일을 전부 직접 입혀야 함(장점의 뒷면) | — |

## 결정

**Base UI를 접근성 프리미티브 출처로 채택한다. 단, 지금 도입하는 것은 `Tabs`와 `Progress` 둘뿐이다.**

요지는 넷이다.

### 1. 쓸 화면이 있는 것만 도입한다

| Base UI 모듈 | 용처 | 얻는 것 |
|---|---|---|
| `@base-ui/react/tabs` | 탭 UI | 로빙 tabindex · 화살표 키 순환 · `aria-controls`/`aria-selected` 동기화 |
| `@base-ui/react/progress` | 진행률 바 (트랙 `line`, 채움 `primary`) | `role="progressbar"` + `aria-valuemin/max/now`를 라이브러리가 관리 |

**`Slider` · `RadioGroup` · `Dialog` · `Toast`는 지금 만들지 않는다.** 쓸 화면 스펙이 아직 없다. 쓸 곳이 확정되지 않은 컴포넌트를 미리 만드는 것은 이 저장소가 거부해 온 패턴이다. 채택 자체는 이 ADR로 끝났으므로, 스펙이 오면 ADR을 다시 쓰지 않고 해당 모듈만 추가한다.

### 2. `Button`·`Card`·`Badge`·`Money`는 직접 구현한다

Base UI에 대응 프리미티브가 없거나(Money·Badge·Card), 있어도 얻는 것이 없다(Button — 네이티브 `<button>`이면 충분하다). **직접 구현이 맞는 것은 직접 구현으로 남긴다.**

특히 `Money`는 라이브러리가 줄 수 없는 것을 강제한다 — 제품 문서의 "KRW 정수(콤마 구분, 소수점 없음)"와 디자인 문서의 "금액은 항상 tabular-nums + weight 700"을 한 컴포넌트가 보장한다. 금액 표기가 화면마다 갈리는 것을 구조로 막는다.

### 3. Base UI는 `shared/ui` 안에서만 보인다

페이지는 `@/shared/ui`만 import한다. Base UI는 외부 패키지라 0001의 경계 규칙(`@/{entities,features,pages}/*/**` 그룹, 상대경로 정규식)과 무관하므로 별도 규칙 추가가 필요 없다. 래핑 계층을 두는 이유는 **되돌림 비용을 페이지가 아니라 래퍼로 국한**하기 위해서다.

### 4. `jsx-a11y` 위반 1건이 여기서 해소된다

`jsx-a11y`를 켜면(0003 수반 작업) 현재 유일한 위반이 `Progress.tsx`의 `prefer-tag-over-role`인데, Base UI `Progress.Root`가 `role`을 라이브러리 내부에서 설정하므로 **우리 JSX에 `role` 속성이 남지 않는다.** 규칙을 끌 필요도, 예외를 둘 필요도 없다.

### 설치 전 실측 검증 (2026-08-21)

| 항목 | 결과 |
|---|---|
| `@base-ui/react@1.7.0` (2026-08-04) peer | `react: ^17 \|\| ^18 \|\| ^19` → 현행 `react@19.2.8` **통과** |
| engines | `node: ">=14.0.0"` → `engine-strict=true` + Node 24.19 **통과** |
| 전이 의존성 engines | `@base-ui/utils` · `@floating-ui/react-dom` · `@floating-ui/utils` · `@babel/runtime` · `use-sync-external-store` — 전부 없음/허용 **통과** |
| `date-fns` · `@date-fns/tz` peer | `peerDependenciesMeta`에서 **optional: true** → 설치 강제 없음 |
| `sideEffects` | `false` → 트리셰이킹 가능. 서브패스 import(`@base-ui/react/tabs`)로 쓰는 것만 들어온다 |
| v1.0 안정화 시점 | 2025-12-11 ([v1.0.0 릴리스](https://github.com/mui/base-ui/releases/tag/v1.0.0)) — 2년 개발 후 |
| ERESOLVE 위험 | 없음 (실제 설치로 확인) |
| `Progress.Root` 실제 동작 | 설치본 소스에서 `role: 'progressbar'` + `aria-valuemin/max/now` 설정을 확인. `value={null}`이면 `aria-valuenow`를 생략한다 |
| `Tabs` 파트 | `Root` · `List` · `Tab` · `Panel` · `Indicator` 확인 |
| 전역 요구사항 | `#root { isolation: isolate }`(포털 z-index 격리) · `body { position: relative }`(iOS Safari 26+) — 공식 quick-start |
| CSP | 인라인 위치 스타일을 쓰는데 `staticwebapp.config.template.json`이 이미 `style-src 'self' 'unsafe-inline'` → **CSP 확장 불필요** |

### 번들 비용 — 실측 (2026-08-21)

같은 화면을 Base UI 유무로 두 번 빌드해 비교했다(래퍼를 동일 마크업의 네이티브 구현으로 갈아끼우고 측정 후 복원).

| | JS raw | JS gzip | CSS raw |
|---|---|---|---|
| Base UI 없음 (네이티브 마크업) | 207,720 B | 65,820 B | 58,940 B |
| Base UI `tabs` + `progress` | 237,320 B | 76,070 B | 59,780 B |
| **차이** | **+29,600 B** | **+10,250 B** | +840 B |

**Tabs + Progress 두 컴포넌트에 gzip 10.25 kB.** 적지 않은 값이므로 정직하게 적는다. 이 값을 지불하고 얻는 것은 로빙 tabindex · 화살표 키 순환 · `aria-selected`/`aria-controls` 동기화 · `aria-valuenow` 동기화이며, 이것들은 jsdom 테스트로 잘 잡히지 않아 **손으로 만들면 조용히 틀리는** 영역이다.

비용의 상당 부분은 `internals/composite`(키보드 내비게이션 엔진)이 차지한다 — 이는 Slider·RadioGroup·Menu 가 공유하므로 **다음 컴포넌트의 한계 비용은 훨씬 낮다.** 화면이 붙으면 이 값을 다시 재고 이 표를 갱신한다.

트리셰이킹은 실제로 동작한다 — 산출 JS 에서 `floating-ui` 관련 심볼이 **0건**이다. Tabs·Progress 가 포지셔닝 엔진을 끌어오지 않는다는 뜻이다.

## 결과

**쉬워지는 것**

- 로빙 tabindex · 화살표 키 순환 · `aria-*` 동기화를 직접 구현하지 않는다. 이 저장소에서 가장 검증하기 어려운 영역을 외부화한다.
- `data-[selected]` 같은 속성으로 상태 스타일링이 Tailwind 변이와 그대로 맞물린다 — JS로 클래스를 분기하지 않는다.
- `jsx-a11y` 위반 1건이 부수적으로 해소된다.
- 전환 효과에 CSS `@starting-style`(Chrome 117)이 필요 없다 — `data-starting-style` **속성**을 쓰므로 `build.target`의 하한 111에서 동작한다.

**어려워지는 것**

- 새 의존성이 늘고 `@babel/runtime` 헬퍼가 함께 온다. 번들 예산 게이트(0003 수반 작업)가 이를 감시한다.
- 스타일을 전부 직접 입혀야 한다 — 무스타일이라는 장점의 뒷면이다.
- 포털(향후 Dialog·Toast 도입 시)이 `body` 직속으로 붙으므로 `#root`에 스태킹 컨텍스트를 만들어야 한다. 빠뜨리면 z-index가 조용히 어긋난다.

**되돌리려면**

`shared/ui`의 래퍼 2개(`Tabs`·`Progress`)를 직접 구현으로 대체하고 의존성 1개를 제거한다. 페이지는 `@/shared/ui`만 보므로 **화면 코드는 손대지 않는다** — 래핑 계층을 둔 이유가 이것이다. `Button`·`Card`·`Badge`·`Money`·`ErrorBoundary`는 애초에 직접 구현이라 영향 없다.

**검증 방법**

1. 4게이트를 `--legacy-peer-deps`·`overrides` 없이 통과
2. `jsx-a11y` 활성화 후 진단 **0건** — `Progress` 위반이 실제로 해소됐는지
3. **키보드만으로** 스타일가이드 완주 — 탭 화살표 키 이동, 모든 인터랙티브 요소에 포커스 링
4. 번들 증가량을 실측해 이 문서와 `toolchain.md §1` 기준선에 기입
