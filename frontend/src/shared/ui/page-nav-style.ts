// 「제목 위 내비 줄」의 컨트롤 규격 — `Breadcrumb`(조상 링크)과 `BackLink`(뒤로 · 홈으로)가 공유한다.
//
// 두 컴포넌트는 `Page` 의 **같은 슬롯(`nav`)** 을 쓴다. 화면마다 둘 중 하나만 나가므로 사용자가 둘을
// 나란히 볼 일은 없지만, 화면을 옮겨 다니면 **같은 자리에 번갈아 나타난다** — 그때 크기·색·높이가
// 갈리면 제목 위 줄이 화면마다 들썩인다. 리터럴을 두 파일에 복사하면 한쪽만 고쳐지고 그 어긋남은
// 눈으로 잡히지 않는다(이 저장소가 `shell-metrics.ts` 를 만든 것과 같은 종류의 사고다).
//
// 🚨 **`relative` 와 `after:*` 는 짝이다.**
//
// 이 줄은 `text-sm`(14px × line-height 1.6 = 22.4px)이라 상자 자체는 22px 남짓이다. 그대로 두면
// 터치 타겟이 **조용히 22px 이 된다** — 화면에는 아무 변화가 없어 눈으로는 못 잡는다.
// `min-h-tap`(44px)을 그냥 붙이면 제목 위에 44px 짜리 빈 줄이 통째로 생겨 헤더가 무거워지므로,
// `shared/ui/Button.tsx` 의 `sm` 이 쓰는 방식을 그대로 따른다 — **상자는 22px 로 그리고 의사요소가
// 위아래로 12px 씩 넘쳐 히트 영역을 44px 이상으로 되돌린다**(22.4 + 24 = 46.4px).
// `::after` 는 링크 자신의 자식이라 그 위의 포인터 이벤트가 그대로 링크에 잡힌다.
// 계약은 `Breadcrumb.test.tsx` · `BackLink.test.tsx` 가 고정한다.
//
// `after:*` 변이는 `content: var(--tw-content)`(초기값 `""`)를 자동으로 얹으므로 `content-['']` 를
// 따로 적지 않는다(`Button.tsx` 의 같은 근거 — 실제 컴파일로 확인된 동작이다).
//
// 색은 하단 탭바의 **비활성** 항목과 같은 토큰(`text-ink-soft` → hover `primary`)이다
// — `app/ui/NavItem.tsx` 의 `BASE` · `pages/budget/ui/BudgetPage.tsx` 의 「‹ 뒤로」와 한 계열.
// primary 로 칠하지 않는다: 「현재 위치」도 「주요 행동」도 아니다(The One Accent Rule).
//
// `hover:` 에 `enabled:` 를 붙이지 않는다 — `:enabled` 는 폼 컨트롤에만 매치된다. `BackLink` 는
// `<button>` 도 내지만 이 컨트롤에는 비활성 상태가 없어서 두 태그가 같은 리터럴을 쓸 수 있다.
export const PAGE_NAV_CONTROL =
  "relative inline-flex cursor-pointer items-center gap-1 rounded-sm text-sm font-bold text-ink-soft " +
  "transition-colors duration-150 hover:text-primary after:absolute after:inset-x-0 after:-inset-y-3";

/** 구분자(`›`)와 「현재 화면」 텍스트가 쓰는 색·크기 — 링크가 아니라 호버가 없다. */
export const PAGE_NAV_SEPARATOR = "text-sm text-ink-soft";
