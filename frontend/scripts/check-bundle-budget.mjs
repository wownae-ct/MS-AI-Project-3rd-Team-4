// 번들 예산 + 디자인 규범 게이트 — `npm run build` 체인의 마지막 단계.
//
// 왜 Vite 플러그인이 아니라 별도 스크립트인가
//   플러그인으로 넣으면 gzip 계산에 node:zlib 타입이 필요해 @types/node 와 tsconfig 프로젝트 분리가
//   딸려온다. tsconfig.app.json 의 types 에 @types/node 를 넣으면 **앱 코드에서도 process·Buffer 가
//   타입 통과**해 조용한 실패 경로가 생긴다. 이 파일은 tsconfig.app.json 의 include 밖이라
//   그 문제가 통째로 사라지고, dist 를 디스크에서 읽으므로 **실제 배포되는 바이트**를 잰다.
//   package.json 의 && 체인이라 건너뛸 수 없고 CI 워크플로 수정도 불필요하다.
//
// 왜 폰트를 따로 세는가
//   Wanted Sans 는 unicode-range 로 92조각 분할돼 있어 **전량 전송되지 않는다.** 합계로 재면
//   폰트가 예산을 다 먹어 정작 감시해야 할 JS·유틸리티 CSS 증가를 감지하지 못한다.
//   같은 이유로 CSS 는 @font-face 블록을 빼고 잰다 — 화면이 늘어도 그 부분은 그대로다.
//
// 규범 검사는 이 파일이 아니라 lib/ 의 순수 모듈이 한다 — 테스트 가능해야 회귀를 막는다.
//   lib/css-norms.mjs    산출 CSS (lightningcss 파서) — 그림자·링·팔레트 밖 색·라운드·다크모드
//   lib/source-norms.mjs 소스 (file:line) — 색 임의값·ring·그림자 유틸리티 토큰
//   lib/deploy-config.mjs 배포 설정 — dist/staticwebapp.config.json 존재 + SPA 폴백·캐시·CSP 최소 계약 (CLAUDE.md §6-H)
//   설계와 근거: docs/design/namespaces.md 「게이트 — 정규식이 아니라 파서로」 · ADR 0006
//   여기는 dist 와 src 를 읽어 둘을 호출하고 결과를 출력하는 오케스트레이터다.

import { gzipSync } from "node:zlib";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { checkCssNorms, normalizeHex } from "./lib/css-norms.mjs";
import { checkSourceNorms } from "./lib/source-norms.mjs";
import { checkDeployConfig } from "./lib/deploy-config.mjs";

// 실행 위치에 의존하지 않는다 — CWD 기준으로 잡으면 다른 디렉터리에서 부를 때 조용히 빗나간다.
const ROOT = resolve(import.meta.dirname, "..");
const ASSETS_DIRECTORY = join(ROOT, "dist", "assets");
const THEME_PATH = join(ROOT, "src", "shared", "ui", "theme.css");
const SOURCE_DIRECTORY = join(ROOT, "src");
const DEPLOY_CONFIG_PATH = join(ROOT, "dist", "staticwebapp.config.json");

/**
 * 상한값은 추측이 아니라 실측 + 여유분이다. 옆의 「측정」이 이 값을 정할 때의 실제 크기다.
 * 화면이 늘어 상한을 올려야 하면 **측정값과 함께 올린다** — 그래야 diff 에서 증가폭이 보인다.
 * 조용히 올리면 이 게이트는 의미를 잃는다.
 */
const BUDGETS = [
  // ── 2026-08-22 재설정 (ADR 0005 라우터 도입 · 코드 스플리팅) ───────────────────────────────
  // 분할이 들어오면서 두 JS 지표가 **처음으로 갈라졌다.** 그래서 둘의 역할도 갈린다.
  //
  //   jsChunkGzip = 초기 청크 = **사용자가 실제로 기다리는 바이트**  ← 조이는 쪽
  //   jsGzip      = 전 청크 합 = 앱 전체 크기 가드(의존성 폭증 감지)  ← 한 번에 전송되지 않는다
  //
  // 합계 한도 92,000 은 청크가 1개였을 때 "초기 청크 한도"와 같은 값이었다. 분할된 지금 그 값을
  // 합계에 그대로 적용하면 **화면을 lazy 로 잘 나눌수록 게이트에 걸리는** 뒤집힌 유인이 생긴다.
  // 그래서 합계는 실측 기준으로 다시 잡고, 정작 중요한 초기 청크 한도는 **올리지 않았다.**
  // ── 2026-08-26 인증 가드 배선(T8)으로 112,000 → 116,000 ───────────────────────────────────
  // 실측 113,695 B (초과 1,695 B). 회귀가 아니다 — `_authed`/`_shell` 가드가 라우트 트리를
  // 처음으로 `entities/session`·`shared/api`·`pages/login` 에 연결하면서, 그전까지 어디서도
  // import 되지 않아 **트리셰이킹으로 완전히 빠져 있던** 전송 계층·세션 캐시·로그인 화면이
  // 처음으로 실제 바이트가 됐다(이 코드 자체는 이미 커밋돼 있었다 — 도달 가능해진 시점이 지금이다).
  //
  // **초기 청크(jsChunkGzip)는 95,930 B 로 96,000 을 그대로 지킨다** — 이번에 움직인 건 합계뿐이다.
  // 🚨 다만 그 여유가 **70 B 뿐이다.** 다음 화면(S1 등)을 추가할 때 가장 먼저 볼 숫자가 이것이다.
  //
  // lazy 로 내려서 피할 수 없다 — 실측으로 확인했다: `LoginPage` 를 `lazyRouteComponent` 로 내리면
  // 최대 단일 청크는 91,978 B 로 줄지만 **합계는 115,029 B 로 오히려 더 나빠진다.** `report` 화면과
  // 공유하는 `Page` 컴포넌트를 Rollup 이 별도 청크로 뽑아내는데, 그 청크가 `dist/index.html` 에
  // `modulepreload` 로 걸려 여전히 초기 로드 경로에 남고 청크 분할 오버헤드만 더해진다 — 지연되는
  // 바이트가 없다. 다음 사람이 같은 시도를 반복하지 않도록 여기 적어 둔다.
  // ── 2026-08-26 스캐폴드 통합(S1·S3·S4·S5·S6 실API 배선 + AI상담 5번째 탭)으로 116,000 → 139,800 ──
  // 실측 113,695 → 139,702 (증가 26,007 B). 회귀가 아니다 — 그동안 스텁이던 5개 화면
  // (CategoryPage/BudgetPage/TimelinePage/ReportPage 실API 배선, OnboardingPage 8단계 위저드,
  // `/chat` 라우트)이 전부 처음으로 실제 코드를 갖게 되면서, lazy 청크로는 안 잡히는 그
  // 화면들이 공유하는 entities(payment/timeline/vendor-case/wedding/chat)·shared/lib/money.ts
  // 등이 처음 도달 가능해졌다(합계 지표는 청크 분할과 무관하게 앱 전체 크기를 본다 — 위 §2026-08-22
  // 주석 참고). 초기 청크(jsChunkGzip)는 여전히 예산 안이라 첫 화면 체감 속도는 그대로다.
  // 여유는 넉넉히 늘리지 않고 새 실측 기준 98 B 로 좁게 유지한다.
  // ── 2026-08-26 로그인 화면 개선(구글·네이버 로고, 회원가입 클라이언트 검증) 추가로
  //    139,800 → 141,100 ────────────────────────────────────────────────────────────────────
  // 실측 139,702 → 141,033 (증가 1,331 B). 회귀가 아니다 — shared/ui/icons.tsx 에 IconGoogle(4색
  // path)·IconNaver(글자 path) 추가 + pages/login/ui/validation.ts 신규(이메일·비밀번호 정규식,
  // 에러 문구 상수) + LoginPage.tsx 의 handleSubmit 클라이언트 검증 로직(trim·noValidate 전환에
  // 따른 required 대체 검사)이 늘었고, 전부 LoginPage 를 통해 초기 청크에서 도달 가능하다
  // (LoginPage 는 lazy 로 못 뺀다 — 위 §2026-08-22 실측 참고). 같은 워킹트리에서 다른 세션들이
  // 동시에 작업 중이었지만, 이 실측은 `git stash push --keep-index --include-untracked` 로
  // 그 미커밋 변경을 전부 걷어내고 이 커밋이 스테이징한 파일만 HEAD 위에 남긴 상태에서 잰 것이라
  // 이 커밋만의 순수 증가분이다(이전 두 실측 925 B·388 B는 다른 세션 변경이 섞인 값이었다 —
  // 이 블록이 그 둘을 대체한다). 여유는 넉넉히 늘리지 않고 새 실측 기준 67 B 로 좁게 유지한다.
  // ── 2026-08-26 온보딩 9단계(확인) 신설 + 8단계 예산배분 슬라이더 추가로 141,100 → 142,300 ──
  // 실측 141,033 → 142,229 (증가 1,196 B). 회귀가 아니다 — Step9Review.tsx(신규, 최종 확인
  // 화면) · build-review-labels.ts(신규, 라벨 계산) · step-copy.ts(신규, 스텝 문구 분리) ·
  // Step8Allocation.tsx(슬라이더 input 추가) · shared/lib/wedding-date.ts(반기 옵션 계산 확장,
  // APPROX_H1_YEAR_AFTER_NEXT 대응)가 전부 OnboardingPage 를 통해 초기 청크에서 도달
  // 가능하다(OnboardingPage 자체는 lazy 지만, 이 파일들은 그 청크 안에서 항상 함께 로드된다).
  // ⚠️ 같은 워킹트리에서 동시에 진행 중이던 다른 세션(백엔드 enum 확장 관련 프론트 반영)의
  // 미커밋 변경이 섞였을 수도 있다 — 위 두 항목과 같은 사정. 여유는 넉넉히 늘리지 않고 새
  // 실측 기준 71 B 로 좁게 유지한다.
  // ── 2026-08-26 영수증 OCR 자동채움(AddPaymentRow) 추가로 142,300 → 143,000 ────────────────
  // 실측 142,229 → 142,940 (증가 711 B). 회귀가 아니다 — AddPaymentRow.tsx에 파일 입력 +
  // getReceiptExtract() 호출 + 결제일/영수증 상태가 늘었다. AddPaymentRow는 CostTab을 통해
  // CategoryPage 청크에서 도달 가능하다(lazy 라우트 자체는 그대로 유지). ⚠️ 같은 워킹트리에서
  // 동시에 진행 중이던 다른 세션의 미커밋 변경이 섞였을 수도 있다 — 위 항목들과 같은 사정.
  // 여유는 넉넉히 늘리지 않고 새 실측 기준 60 B 로 좁게 유지한다.
  // ── 2026-08-26 사용자 지시로 여유를 넉넉하게 늘림(143,000 → 150,000) ──────────────────────
  // 이 파일의 기존 관례("여유는 넉넉히 늘리지 않고 새 실측 기준 O B 로 좁게 유지")를 이번엔
  // 의도적으로 벗어난다 — 최근 몇 커밋 연속으로 매번 몇백 B 씩 초과해 그때그때 재측정+상향을
  // 반복했고(위 항목들 참고), 그 마찰을 사용자가 직접 지적해 당분간 여유를 크게 잡아달라고
  // 명시로 요청했다. 실측(142,990B) 대비 약 7,010B 여유 — 다음 몇 번의 작은 기능 추가는 이
  // 게이트를 다시 건드리지 않을 것으로 기대한다. 그렇다고 이 여유가 "의존성 폭증을 눈감아준다"는
  // 뜻은 아니다 — 큰 라이브러리 추가처럼 진짜 회귀가 나면 여전히 잡힌다.
  // ── 2026-08-26 대시보드/예산/챗 UX 개편 + 체크리스트 근거 배지 병합으로 150,000 → 158,000 ──
  // 두 브랜치(feature/frontend-onboarding-timeout-and-ux-fixes @ 151,234B, feature/frontend-
  // checklist-citation-badges @ 150,131B)가 이 줄을 각자 다른 값으로 독립적으로 올려뒀다가
  // 병합 충돌이 났다 — 어느 한쪽 값도 병합 후의 실제 크기를 반영하지 못해(둘 다 반영되면 더
  // 커진다) 재빌드해 다시 실측했다: 151,627B. 두 기능 다 실제 화면 로직 증가(도넛 이동+시세
  // 비교+비용관리 / 체크리스트 근거 배지)라 상향이 맞다 — 위 2026-08-26 "당분간 여유를 크게"
  // 요청의 취지를 이어 158,000으로 유지한다(여유 6,373B).
  // ── 2026-08-28 금액 입력 공통화(shared/ui/NumberInput)로 158,000 → 165,000 ────────────────
  // 실측 156,449 → 158,117 (증가 1,668 B). 회귀가 아니다 — `<input type="number">` 7곳을
  // `NumberInput` 하나로 모으면서 늘어난 로직이다: 천 단위 콤마 포맷·숫자 외 문자 차단·캐럿
  // 보존·↑↓/▲▼ 스텝 복원(네이티브 스피너 대체)·spinbutton ARIA. **잃는 기능 없이 갈아끼우는 것이
  // 요구사항이라** 네이티브가 공짜로 주던 동작을 코드로 다시 쓴 만큼이 그대로 바이트가 됐다.
  //
  // ⚠️ 이번 상향은 이 변경분(1,668 B)만의 몫이 아니다. 직전 기준선이 이미 156,449 B 로 올라와 있어
  // (한도 158,000 대비 여유 1,551 B) 무엇을 더하든 바로 걸리는 상태였다. 그래서 2026-08-26
  // "당분간 여유를 크게" 요청의 취지를 이어 165,000 으로 잡는다(새 실측 대비 여유 6,883 B).
  //
  // 초기 청크(jsChunkGzip)는 97,519 B 로 **오히려 기록된 실측 97,534 B 보다 작다** — NumberInput 을
  // 쓰는 화면이 전부 lazy 라우트라 초기 청크에 들어가지 않는다. 이 지표는 건드리지 않았다.
  // ── 2026-08-28 frontend → fix/frontend 병합 재측정 — 한도는 그대로, 실측만 갱신 ──────────
  // 158,117 → 161,601 B. `frontend` 쪽 신규 화면(9단계 자유 서술 · 예산 4분류 · S5 타임라인
  // 진행률 등)이 lazy 청크에 들어가 합계만 늘었다(같은 빌드에서 초기 청크는 +716 B, 위 항목).
  // 한도 165,000 은 위 "당분간 여유를 크게" 취지 그대로 두고 실측만 최신으로 맞춘다(여유 3,399 B)
  // — 여기 값을 낡은 채로 두면 다음 사람이 "기준을 정할 때 측정값"을 잘못 읽는다.
  { key: "jsGzip", limit: 165_000, measured: 161_601, label: "JS 합계 (gzip)" },
  // ── 2026-08-22 S2 대시보드 구현으로 92,000 → 96,000 ────────────────────────────────────────
  // 예고된 마찰이 실제로 걸렸다(88,847 → 92,821, 초과 821 B). 올리기 전에 먼저 물어야 하는 질문은
  // **"첫 화면이 정말 초기 청크에 있어야 하는가"** 였고(ADR 0005 §결정 3), 브라우저 실측으로 답했다.
  //
  //   · lazy 라우트 청크는 `dist/index.html` 에 modulepreload 가 없다. 브라우저는 index.js 를
  //     **실행해 라우터가 매칭한 뒤에야** 존재를 안다 — 정적으로 앞당길 방법이 없다.
  //   · vite preview 워터폴 실측: /style-guide 는 index.js 종료 20 ms → 청크 시작 45 ms,
  //     /timeline 은 18 ms → 43 ms. **왕복 1회가 통째로 직렬화된다.**
  //   · 폰트는 JS 완료 19 ms 뒤에 요청되고 첫 방문 전송의 **81%** 다(toolchain.md §8.2).
  //     즉 `/` 를 lazy 로 돌리면 그 왕복만큼 **랜딩 화면의 폰트 시작 전체가 밀린다.**
  //
  // → 첫 화면은 초기 청크에 남긴다. 대신 한도는 **여유를 늘리지 않고** 올린다: 96,000 은 새 실측
  //    92,821 기준 여유 3,179 B 로, 직전과 같은 압력(3,153 B)을 유지한다. 다음 화면 5개는 전부
  //    lazy 이므로 이 지표는 **shared/ui 가 커질 때만** 다시 움직여야 한다 — 움직이면 그게 신호다.
  // ── 2026-08-26 T9(로그인 쿠키 왕복 확인)로 96,000 → 96,100 ─────────────────────────────────
  // 예고된 마찰이 걸렸다(95,977 → 96,078, 초과 78 B) — LoginPage 는 lazy 로 못 뺀다(위 §2026-08-22
  // 실측 참고). shared/ui 증가가 아니라 로그인 화면 자체의 기능 추가(getMe() 프로브 + 에러 문구)라
  // 여기서 흡수한다. 여유는 **늘리지 않고** 새 실측 기준 22 B 로 좁게 유지한다 — 다음 화면(S1~S6)은
  // 여기 손대지 말고 반드시 lazy 로 넣을 것.
  // ── 2026-08-26 사설 LAN http:// 예외(shared/api/api-base.ts)로 96,100 → 96,300 ─────────────
  // 96,078 → 96,271(초과 171 B) — `isPrivateLanHost` + `isLocalOnlyApiBase` 추가분. `client.ts`
  // 를 거쳐 초기 청크에 이미 도달 가능한 모듈이라 화면 기능과 무관하게 여기서 바로 걸린다.
  // 여유를 29 B 로 좁게 유지한다.
  // ── 2026-08-26 대시보드/예산/챗 UX 개편으로 96,300 → 96,600 ───────────────────────────────
  // 96,271 → 96,408(초과 108 B) — entities/wedding·entities/payment 공용 모듈이 초기 청크에서
  // 도달 가능한 채로 소폭 커졌다(위 jsGzip 항목과 같은 원인). 여유를 192 B 로 좁게 유지한다
  // — 이 지표는 화면 기능이 아니라 shared/entities 공용 코드가 커질 때만 움직여야 한다는
  // 기존 관례를 그대로 따른다.
  // ── 2026-08-26 대시보드 예산 시세비교 카드(budget_benchmark, dev-e4 요청)로 96,600 → 96,700 ──
  // 96,408 → 96,639(초과 39 B) — DashboardPage.tsx는 첫 화면이라 초기 청크에 그대로 남는다
  // (위 2026-08-22 결정 그대로) — BudgetBenchmarkCard.tsx 신설 + isDashboardSummary 필드 검증
  // 추가가 그 화면 자체의 기능 증가다(shared/entities 공용 코드 증가가 아니라도, 이 화면
  // 자체가 예외적으로 초기 청크에 남아 있는 한 이 지표에 반영되는 게 맞다). 여유를 61 B 로
  // 좁게 유지한다.
  // ── 2026-08-26 대시보드/예산 UX 개편 2차(독립 브랜치, 병합 재측정)로 96,700 → 97,300 ────────
  // `feature/frontend-dashboard-benchmark-card`(위 항목, 96,639B)와 이 브랜치가 같은 96,600
  // 기준에서 각자 독립적으로 이 줄을 올려뒀다가 병합 시점에 충돌 — 두 값 다 병합 후 실제
  // 크기를 반영하지 못한다(같은 클래스의 사고, `errors/2026-08-26-parallel-branch-shared-
  // bundle-budget-numeric-conflict.md` 참고). 산술로 더해 추정하지 않고 병합 후 재빌드해
  // 다시 실측했다: 97,247B(CategoryChecklistSection.tsx 추출 등 import/max-dependencies
  // 정리 이후 값). 여유를 53 B 로 좁게 유지한다.
  // 접근성 감사 수정 배치(2026-08-26, 라벨/터치타겟/live region 다수)로 97,247 → 97,250 —
  // 오차 3B라 한도는 그대로 둔다.
  // ── 2026-08-27 설정(⚙️) 화면 신규 추가(docs/wedding/refactor/bug-todo.md [결정됨])로
  // 97,250 → 97,378 ─────────────────────────────────────────────────────────────────
  // `AppShell.tsx`(초기 청크)에 `IconSettings` + `SECONDARY_NAV` 항목 + 모바일 상단 바
  // 링크 하나가 늘었다 — 그 대신 이전에 AppShell.tsx가 직접 갖고 있던 `logout()`/
  // `invalidateSession()` 호출은 이제 lazy `pages/settings` 청크로 옮겨져 초기 청크에서
  // 빠졌다(순감소 방향 변경도 있었다는 뜻). 실측 128B 증가를 그대로 반영 — 여유를 22B로
  // 좁게 유지한다.
  // ── 2026-08-28 온보딩 createWedding SSE 스트림 전환으로 97,400 → 97,850 ────────────────
  // 97,378 → 97,829(증가 451B) — `entities/wedding/api/wedding.ts::createWedding()`이
  // 백엔드 `POST /weddings` 응답의 JSON 단발 → `text/event-stream` 전환(개인화 LLM 생성이
  // 오래 걸릴 때 heartbeat로 프록시 타임아웃을 피하는 백엔드 변경, dev-af 세션 구현)에 맞춰
  // fetch+ReadableStream SSE 프레임 파서로 재작성됐고, `shared/api/client.ts`에서 TIMEOUT/
  // NETWORK_ERROR 분류 로직을 `classifyFetchFailure()`로 추출·공유했다 — 둘 다 `entities/
  // wedding`을 통해 초기 청크에서 이미 도달 가능한 모듈이라(위 2026-08-26 항목들과 같은
  // 원인) 화면 기능과 무관하게 여기서 바로 걸린다. 측정은 같은 워킹트리의 다른 93개
  // 미커밋 파일(CRLF 개행 차이뿐, 내용은 HEAD와 동일 — `git stash`로 이 4개 파일만 분리해
  // 재확인)의 오염 가능성을 배제하고 격리해서 잡았다. 여유를 21B로 좁게 유지한다.
  // ── 2026-08-28 예산 4분류 개편(red-bug.md #7 근본 수정)으로 97,850 → 97,880 ──────────────
  // 97,829 → 97,861(증가 32B) — `entities/wedding`의 `deriveBudgetSummary()`/`BudgetSummary`가
  // 3계열(paid/planned/remaining)에서 4계열(paid/scheduled/allocated/unallocated)로 늘었다 —
  // `entities/wedding`은 위 항목들과 같은 이유로 초기 청크에서 이미 도달 가능한 모듈이라 이
  // 지표에 바로 반영된다. 여유를 19B로 좁게 유지한다.
  // ── 2026-08-28 frontend→main 최초 병합, production 이미지 첫 실빌드로 97,880 → 97,916 ──────
  // 97,861 → 97,896(증가 35B) — 소스 코드 변경이 아니라 **빌드 환경 차이**다. 이 한도는 지금까지
  // `frontend-ci.yml`(PR 게이트, `secrets.VITE_API_BASE` 사용)로만 실측돼 왔는데, `frontend-
  // docker-ci.yml`(production 전용, `main` push 트리거)은 별도의 production `VITE_API_BASE`
  // build-arg를 쓴다(둘이 다른 시크릿 — infra/same-origin 마이그레이션 문서 참고). 이 문자열은
  // `shared/api/client.ts`를 거쳐 초기 청크에 리터럴로 박히므로, PR 게이트 값과 실제 production
  // 도메인 문자열의 길이 차이가 그대로 이 지표에 반영된다. 오늘 PR #117로 `frontend`→`main`이
  // 최초로 병합되면서 `frontend-docker-ci.yml`이 이 저장소 역사상 처음 실행됐고, 그래서 이
  // 격차가 지금껏 한 번도 드러난 적이 없었다. 실측값은 CI 실패 로그의 실제 production 빌드
  // 수치(97,896B)를 그대로 신뢰한다 — 로컬 재현은 더미 VITE_API_BASE 문자열 길이가 달라 정확히
  // 일치하지 않는다. 여유를 20B로 좁게 유지한다. **후속 검토 필요**: 이 클래스의 격차(PR 게이트
  // 값 vs 실제 production 값)는 두 시크릿의 문자열 길이가 벌어질 때마다 재발할 수 있다 — PR
  // 게이트가 production build-arg로 직접 실측하도록 바꾸는 근본 수정은 이번 범위 밖(사용자가
  // "우선 갱신만" 요청, red-bug.md에 후속 항목으로 남김).
  //
  // ── 아래 두 항목은 `fix/frontend` 브랜치가 같은 97,400 기준에서 독립적으로 쌓은 이력이다 ──
  // 위 `frontend` 계열(97,400 → 97,916)과 아래 `fix/frontend` 계열(97,400 → 98,200)이 같은 줄을
  // 각자 올려놨다 — 위 2026-08-26 항목과 **정확히 같은 클래스의 충돌**이다. 두 이력 다 자기
  // 브랜치에서는 실측이었으므로 기록으로 남기되, 병합된 한도/실측은 산술로 합치지 않고 맨 아래
  // "병합 재측정" 항목에서 다시 빌드해 잡았다.
  // ── 2026-08-28 로그인/회원가입 화면 UX 수정으로 97,400 → 97,560 ──────────────────────────
  // 같은 워킹트리에서 변경 전/후를 각각 빌드해 실측했다(산술 추정 아님): 97,369B → 97,534B,
  // 증가 165B. `LoginPage.tsx`는 lazy 라우트가 아니라 초기 청크에 남는다(대시보드와 같은 사정,
  // 위 2026-08-22 결정) — 늘어난 것은 ① 모드별 제목·부제 분기 ② 가입 완료 `<output>` 배너
  // 마크업 + `IconCheck` 참조 ③ 한국어 안내 문구 2종(제목 아래 부제 · 배너 본문)이다.
  // 문구가 바이트의 대부분이다 — 의존성 증가도 트리셰이킹 회귀도 아니다.
  // ⚠️ 변경 전 실측 97,369B 는 이 줄의 이전 measured(97,378B)보다 9B 작다 — 그 사이 다른
  // 변경이 초기 청크를 조금 줄였다는 뜻이고, 한도(97,400)까지 여유가 31B 뿐이라 이 정도
  // 크기의 화면 수정 하나가 곧바로 게이트에 닿는 상태였다. 관례대로 여유는 26B 로 좁게 유지한다.
  // ── 2026-08-28 로딩 상태 시스템(D14) 신설로 97,560 → 98,200 ──────────────────────────────
  // 실측 97,519B → 98,106B, 증가 587B. 변경 전 값은 산술 추정이 아니라 **같은 워킹트리에서
  // 직전에 기록된 실측**이다 — 바로 위 jsGzip 항목(NumberInput 공통화)이 그 시점의 초기 청크를
  // 97,519B 로 남겨 뒀고, 그 위에 이 변경만 얹은 결과가 98,106B 다.
  //
  // 늘어난 것: `shared/ui` 에 로딩 프리미티브 4종(PulseDots · Loading · Skeleton · RoutePending)
  // + `Button` 의 pending 분기. **전부 초기 청크에 들어갈 수밖에 없다** — `DashboardPage`(첫 화면,
  // 위 2026-08-22 결정)와 `LoginPage`(lazy 로 못 뺀다, 같은 결정)와 `router.tsx`(펜딩 컴포넌트를
  // 여기서 등록한다)가 다 정적 import 라서다. lazy 로 내려도 `Page` 공유 청크가 modulepreload 로
  // 남아 실제로 지연되는 바이트가 없다는 실측이 이미 있다(위 §2026-08-22).
  //
  // ⚠️ 이 지표에 대해서만은 **역설적인 거래**임을 밝혀 둔다 — 폰트는 JS 완료 19ms 뒤에 요청되고
  // 첫 방문 전송의 81% 다(위 §2026-08-22). 즉 "로딩이 안 보인다"를 고치려고 초기 청크를 키우면
  // 그만큼 **첫 방문의 폰트 시작이 밀린다.** 587B 는 그 대가로 감수한 값이고, 그래서 여유는
  // jsGzip 처럼 넉넉히 잡지 않고 관례대로 94B 로 좁게 유지한다 — 이 줄이 또 움직이면 그게 신호다.
  // ── 2026-08-28 frontend → fix/frontend 병합 재측정으로 98,200 → 98,700 ──────────────────
  // 위 2026-08-26 항목이 세운 규칙 그대로다 — **두 브랜치 값을 산술로 더하지 않고 병합 후 다시
  // 빌드해 실측했다.** 세 지점을 모두 같은 환경에서(production `VITE_API_BASE`, 아래 참고) 재봤다:
  //   `frontend` 부모(3adfbdf)   97,898 B
  //   `fix/frontend` 부모(7667fc2) 98,138 B
  //   병합 결과                    98,614 B  ← 이 값을 기준으로 삼는다
  // 병합 결과는 `frontend` 부모 대비 +716 B 이고, 그 증가분은 `fix/frontend` 부모가 자기
  // 기준선 위에 얹었던 양(로그인/회원가입 165 B + 로딩 체계 D14 587 B ≈ 752 B)과 같은 자릿수다
  // — 두 브랜치가 서로를 부풀리는 상호작용은 없었다는 뜻이다. 여유는 86 B 로 좁게 유지한다
  // (위 D14 항목의 94 B 와 같은 폭 — 이 줄이 또 움직이면 그게 신호다).
  //
  // ⚠️ 측정 환경: 바로 위 항목이 "로컬 재현은 더미 VITE_API_BASE 문자열 길이가 달라 정확히
  // 일치하지 않는다"고 남겨 둔 함정을 피하려고, `.env`(http://localhost:8001)가 아니라
  // `frontend-docker-ci.yml`의 `PRODUCTION_ORIGIN`을 그대로 넣고 빌드했다. 그 조건에서 `frontend`
  // 부모가 97,898 B 로 나와 CI가 기록한 97,896 B 와 2 B 차 — 이 환경이 production 빌드를
  // 재현한다는 확인이다. (같은 커밋을 `.env` 기본값으로 빌드하면 약 30 B 작게 나온다.)
  { key: "jsChunkGzip", limit: 98_700, measured: 98_614, label: "최대 단일 JS 청크 (gzip)" },
  { key: "cssGzip", limit: 6_000, measured: 4_237, label: "CSS (gzip, @font-face 제외)" },
  // 폰트는 unicode-range 로 분할돼 전량 전송되지 않으므로 이 값은 전송량이 아니라 **배포 크기** 가드다.
  // 잡으려는 사고: variable/split(2.3 MB) 대신 static/split(8.8 MB)이나 static/complete(4.7 MB)를
  // 실수로 import 하는 것. 폰트 패치 릴리스가 몇 KB 늘어난 것만으로 빌드를 깨지 않도록 여유를 둔다.
  { key: "fontRaw", limit: 2_600_000, measured: 2_281_860, label: "폰트 파일 합계 (raw)" },
];

const NORM_LABELS = {
  retirement: "폐기 유지 — theme.css 의 필수 `-*: initial` 선언 6종",
  shadow: "그림자·링 금지 — 「The Flat-By-Default Rule」 · D9 · D10",
  color: "팔레트 밖 색 금지 — 「The One Accent Rule」 · D8",
  radius: "라운드 토큰 밖 금지 — D1",
  dark: "다크모드 금지 — 라이트 전용",
  ring: "ring-* 금지 — D9",
};

/**
 * 폐기 유지 검사 — 재발 방지. 폐기했더라도 나중에 누가 `initial` 줄을 지우면 Tailwind 기본이 조용히
 * 되살아난다(라운드 8단계 · 그림자 22토큰 · 팔레트 288색). 그 상태를 사람이 기억하게 두지 않고 빌드가 지킨다.
 * 이 목록을 고치려면 docs/design/namespaces.md 를 먼저 고친다 — 순서는 폐기 선언 먼저, 이 목록 나중.
 */
const REQUIRED_RETIREMENTS = ["--color", "--radius", "--shadow", "--drop-shadow", "--inset-shadow", "--text-shadow"];

const FONT_EXTENSIONS = new Set([".woff2", ".woff", ".ttf", ".otf"]);
const SOURCE_EXTENSIONS = new Set([".ts", ".tsx"]);
const FONT_FACE_PATTERN = /@font-face\s*\{[^}]*\}/gu;

function formatBytes(value) {
  return `${value.toLocaleString("en-US")} B`;
}

function extensionOf(name) {
  const dot = name.lastIndexOf(".");
  return dot === -1 ? "" : name.slice(dot).toLowerCase();
}

/**
 * theme.css 에서 화이트리스트를 읽는다. 목록을 스크립트에 손으로 두면 토큰과 조용히 어긋난다 —
 * 이 저장소가 별칭·Node 버전에서 거부해 온 이중 출처 패턴이다.
 * 주석을 먼저 걷어낸다 — 주석 안의 예시 hex 가 화이트리스트에 섞이면 게이트가 조용히 약해진다.
 */
function readTheme() {
  const text = readFileSync(THEME_PATH, "utf8").replaceAll(/\/\*[\s\S]*?\*\//gu, "");

  const palette = new Set();
  for (const [, hex] of text.matchAll(/--color-[\w-]+\s*:\s*(#[0-9a-fA-F]{3,8})\s*;/gu)) {
    palette.add(normalizeHex(hex));
  }
  if (palette.size === 0) {
    throw new Error(`theme.css 에서 --color-* 를 하나도 읽지 못했다 — 경로나 형식이 바뀌었다: ${THEME_PATH}`);
  }
  const paletteSize = palette.size;
  palette.add("transparent"); // Preflight 의 #0000. 색 지정이 아니다.

  const radii = { names: new Set(), values: new Set() };
  for (const [, name, value] of text.matchAll(/(--radius-[\w-]+)\s*:\s*([^;]+);/gu)) {
    radii.names.add(name);
    radii.values.add(value.trim());
  }

  const retired = new Set([...text.matchAll(/(--[a-z-]+)-\*\s*:\s*initial/gu)].map((m) => m[1]));

  return { palette, paletteSize, radii, retired };
}

function collectAssets() {
  let entries;
  try {
    entries = readdirSync(ASSETS_DIRECTORY);
  } catch (error) {
    // cause 로 원본을 붙여 둔다 — 메시지만 갈아치우면 실제 실패 원인(권한·경로·타입)이 지워진다.
    throw new Error(
      [
        `산출물 디렉터리를 읽을 수 없다: ${ASSETS_DIRECTORY}`,
        "",
        "원인: vite build 가 돌지 않았거나 outDir 이 바뀌었다.",
        "조치: `npm run build` 로 전체 체인을 실행할 것. 이 스크립트만 단독으로 부르지 않는다.",
      ].join("\n"),
      { cause: error },
    );
  }

  const assets = { javascript: [], stylesheet: [], font: [] };
  for (const name of entries) {
    const path = join(ASSETS_DIRECTORY, name);
    if (!statSync(path).isFile()) continue;
    const extension = extensionOf(name);
    if (extension === ".js") assets.javascript.push({ name, bytes: readFileSync(path) });
    else if (extension === ".css") assets.stylesheet.push({ name, bytes: readFileSync(path) });
    else if (FONT_EXTENSIONS.has(extension)) assets.font.push({ name, size: statSync(path).size });
  }
  return assets;
}

function* walkSources(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) yield* walkSources(path);
    else if (SOURCE_EXTENSIONS.has(extensionOf(entry.name))) yield path;
  }
}

function measure(assets) {
  const chunkSizes = assets.javascript.map((asset) => gzipSync(asset.bytes, { level: 9 }).length);
  const jsGzip = chunkSizes.reduce((sum, size) => sum + size, 0);
  const jsChunkGzip = chunkSizes.length === 0 ? 0 : Math.max(...chunkSizes);

  // @font-face 블록을 걷어낸 뒤 잰다 — 화면이 늘어도 폰트 선언은 그대로라 함께 세면 증가를 못 본다.
  let cssGzip = 0;
  for (const sheet of assets.stylesheet) {
    const withoutFontFaces = sheet.bytes.toString("utf8").replaceAll(FONT_FACE_PATTERN, "");
    cssGzip += gzipSync(Buffer.from(withoutFontFaces, "utf8"), { level: 9 }).length;
  }

  const fontRaw = assets.font.reduce((sum, asset) => sum + asset.size, 0);

  return { jsGzip, jsChunkGzip, cssGzip, fontRaw };
}

// ── 실행 ───────────────────────────────────────────────────────────────────────────────────────

const theme = readTheme();
const assets = collectAssets();
const actual = measure(assets);

console.log("번들 예산 (실측)");
console.log(
  `  자산: JS ${assets.javascript.length}개 · CSS ${assets.stylesheet.length}개 · 폰트 ${assets.font.length}개`,
);

const breaches = [];
for (const budget of BUDGETS) {
  const value = actual[budget.key];
  const over = value > budget.limit;
  const share = Math.round((value / budget.limit) * 100);
  console.log(
    `  ${over ? "초과" : "통과"}  ${budget.label.padEnd(30)} ${formatBytes(value).padStart(13)} / ${formatBytes(budget.limit).padStart(13)}  (${share}%)`,
  );
  if (over) breaches.push({ budget, value });
}

// ── 규범 검사 — 예산과 별개로, 금지된 것이 산출물과 소스에 들어왔는지 본다 ──────────────────────

const violations = [];
for (const namespace of REQUIRED_RETIREMENTS) {
  if (!theme.retired.has(namespace)) {
    violations.push({
      norm: "retirement",
      where: relative(ROOT, THEME_PATH).replaceAll("\\", "/"),
      value: `${namespace}-*: initial; 이 없다 — Tailwind 기본 ${namespace} 토큰이 되살아난다`,
    });
  }
}

const cssStats = { declarations: 0, colors: 0, radiusDeclarations: 0, shadowCustomProperties: 0 };
for (const sheet of assets.stylesheet) {
  const result = checkCssNorms(sheet.bytes.toString("utf8"), {
    filename: sheet.name,
    palette: theme.palette,
    radii: theme.radii,
  });
  violations.push(...result.violations);
  for (const key of Object.keys(cssStats)) cssStats[key] += result.stats[key];
}

let sourceFiles = 0;
for (const path of walkSources(SOURCE_DIRECTORY)) {
  sourceFiles += 1;
  violations.push(...checkSourceNorms(readFileSync(path, "utf8"), relative(ROOT, path).replaceAll("\\", "/")));
}

console.log("규범 (산출 CSS + 소스)");
console.log(
  `  검사  팔레트 ${theme.paletteSize}색 + 투명 1 · 라운드 토큰 ${theme.radii.names.size}종 · 폐기 ${theme.retired.size}/${REQUIRED_RETIREMENTS.length}종 · 선언 ${cssStats.declarations}개(색 ${cssStats.colors} · 라운드 ${cssStats.radiusDeclarations} · 그림자/링 커스텀 속성 ${cssStats.shadowCustomProperties}) · 소스 ${sourceFiles}파일`,
);
for (const [norm, label] of Object.entries(NORM_LABELS)) {
  const violated = violations.some((violation) => violation.norm === norm);
  console.log(`  ${violated ? "위반" : "통과"}  ${label}`);
}

// ── 배포 설정 — 라우터 딥링크가 프로덕션에서만 404 가 되는 경로를 여기서 막는다 (CLAUDE.md §6-H) ───

const deploy = checkDeployConfig(existsSync(DEPLOY_CONFIG_PATH) ? readFileSync(DEPLOY_CONFIG_PATH, "utf8") : null);
console.log("배포 설정 (dist/staticwebapp.config.json)");
console.log(`  ${deploy.ok ? "통과" : "위반"}  SPA 폴백(/index.html · /assets/* 제외) · /assets/* immutable 캐시 · HTML no-cache · CSP 인라인 style 허용`);

// 한계를 숨기지 않는다 — 「막았다」고 적고 안 막히는 것이 이 저장소가 반복해 겪은 사고 클래스다.
console.log(
  "  한계  dist/assets/ 비재귀 · dist/index.html 인라인 <style> 미검사 · 팔레트 색의 임의값 하드코딩(bg-[#8b3f63])은 산출 CSS 검사 통과(소스 검사가 잡는다)",
);

if (violations.length > 0) {
  const lines = ["", "디자인 규범 위반이 있다.", ""];
  for (const [norm, label] of Object.entries(NORM_LABELS)) {
    const hits = violations.filter((violation) => violation.norm === norm);
    if (hits.length === 0) continue;
    lines.push(`  ${label} — ${hits.length}건`);
    for (const hit of hits.slice(0, 12)) lines.push(`    ${hit.where}`, `      ${hit.value}`);
    if (hits.length > 12) lines.push(`    … 외 ${hits.length - 12}건`);
    lines.push("");
  }
  lines.push("규범을 바꾸려면 docs/design/decisions.md 를 먼저 갱신한다. 여기서 예외를 만들지 않는다.");
  console.error(lines.join("\n"));
  process.exitCode = 1;
}

if (!deploy.ok) {
  console.error(
    [
      "",
      "배포 설정이 계약을 만족하지 않는다 — 이대로 배포하면 라우터 URL 이 서버에서 깨진다.",
      "",
      ...deploy.problems.map((problem) => `  ${problem}`),
      "",
      "원본은 public/staticwebapp.config.json 이다(Vite 가 dist 루트로 복사한다). 게이트 계약은 scripts/lib/deploy-config.mjs.",
    ].join("\n"),
  );
  process.exitCode = 1;
}

if (breaches.length > 0) {
  const lines = ["", "번들이 예산을 넘었다.", ""];
  for (const { budget, value } of breaches) {
    lines.push(
      `  ${budget.label}: ${formatBytes(value)} > ${formatBytes(budget.limit)} (기준을 정할 때 측정값은 ${formatBytes(budget.measured)}였다)`,
    );
  }
  lines.push(
    "",
    "원인: 의존성이 늘었거나, 트리셰이킹이 깨졌거나, 의도한 기능 추가다.",
    "조치: 먼저 무엇이 늘었는지 확인한다 — 의도한 증가라면 scripts/check-bundle-budget.mjs 의",
    "      BUDGETS 를 **새 측정값과 함께** 올린다. 측정값 없이 한도만 올리지 않는다.",
    "",
    "이대로 상한만 올리면 이 게이트는 다음 회귀를 잡지 못한다.",
  );
  console.error(lines.join("\n"));
  process.exitCode = 1;
}
