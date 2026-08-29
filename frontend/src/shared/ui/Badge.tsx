// 배지 — 컴포넌트 스펙 badge-focus 의 구현체 (docs/design/README.md 「컴포넌트 스펙」).
//   채움(기본): 배경 primary-soft · 글자 primary · 모서리 rounded-pill
//   테두리(D17): 배경 surface · 1px border-current · 모서리 rounded-pill
//
// ## 변이는 두 개뿐이고, 늘리려면 문서가 먼저다 (D17, 2026-08-29)
//
// 예전 이 자리엔 「변이 prop 을 두지 않은 이유 — 규범이 정의한 배지는 이것 하나뿐이다」가 적혀
// 있었고, 그 문단이 절차도 함께 지정했다: *다른 톤의 배지가 필요해지면 docs/design/decisions.md
// 를 먼저 갱신하고 여기로 옮긴다.* D17 이 그 갱신이다 — 한 줄에 배지가 두 개 붙는 곳
// (`PaymentListRow`: 결제 유형 + 카테고리)에서 **형태가 계열을, 색이 값을** 나타내야 해서
// 두 번째 변이가 생겼다. 세 번째가 필요해지면 같은 순서를 다시 밟는다. 지금 없는 스타일을
// 여기서 지어내면 값의 출처가 갈린다.
//
// 기본값이 `fill` 이라 **색을 안 넘기는 호출부는 한 글자도 바뀌지 않는다.** `outline` 의 보더는
// `border-current` 라 글자 색을 따라온다 — 호출부는 `text-*` 하나만 넘기면 되고,
// `currentColor` 는 hex 가 아니라 팔레트 게이트(D8)와 무관하다.
//
// ## 🚨 색은 `className` 이 아니라 `tone` 으로 넘긴다 — 그러지 않으면 조용히 무시된다
//
// 예전엔 호출부가 `className="bg-payment-deposit-soft text-payment-deposit"` 처럼 **기준 클래스의
// 색을 덮는** 방식이었다. 그 방식은 **동작하지 않는다**(2026-08-29 산출 CSS 실측):
//
//   .bg-category-venue-soft{…}   ← 14,550번째 바이트
//   .bg-primary-soft{…}          ← 15,068번째 바이트   ⇐ 나중에 나오므로 이쪽이 이긴다
//
// 두 유틸리티는 **명시도가 같고 같은 `@layer utilities` 안**이라 산출 CSS 의 순서가 승자를
// 정한다. 그 순서는 클래스를 적은 순서가 아니라 **Tailwind 가 토큰 이름을 정렬한 순서**다.
// `payment` < `primary` 라서 D13 의 결제 유형 색 4종은 **도입된 뒤로 한 번도 화면에 뜬 적이
// 없었고**(계속 primary 플럼으로 보였다), `SourceList` 의 `text-ink-soft` 도 같은 이유로 죽어
// 있었다. `success`(D12)만 `primary` 뒤에 정렬돼 우연히 살아 있었다 — 알파벳 운이었다.
//
// 그래서 색은 **덮어쓰기가 아니라 치환**이다. `tone` 을 주면 변이의 기본색 자리에 그것이 들어가
// **경쟁하는 유틸리티가 애초에 생기지 않는다.** `className` 은 색이 아닌 것(여백·정렬·수치 표기)만
// 받는다.
//
// ## 배지는 잘리지 않는다 (D16, 2026-08-29)
//
// `shrink-0 whitespace-nowrap` 은 장식이 아니라 **이 컴포넌트의 계약**이다.
//
// 한국어는 글자마다 줄바꿈 기회가 있어 flex 아이템의 `min-content` 가 **1글자**다. 이 두 유틸리티가
// 없으면 옆 텍스트가 길 때 배지가 1글자 폭까지 눌려 「주/의/할/사/례」로 세로로 접히고, rounded-pill
// 은 한 줄 캡슐 전제라 모양 자체가 뭉개진다(사용자 리포트 2026-08-29 — /category/venue 업체 사례
// 헤더가 가장 심했다. 그 밖에 시세 줄 3곳 · 결제 유형 줄 · 설정 화면이 같은 상태였다).
//
// 예전엔 `PaymentRow.tsx` **한 곳만** 호출부에서 `shrink-0` 을 손으로 붙여 막고 있었다 — 개별 패치는
// 나머지 지점에 전파되지 않는다는 것이 그 한 줄로 증명됐으므로 규칙을 여기로 옮겼다.
//
// **짝이 되는 규칙**: 배지가 안 눌리는 만큼 압력은 옆 텍스트가 받는다. 배지와 나란히 놓는 본문에는
// `min-w-0` 과 `truncate`(또는 줄바꿈)를 준다. 그리고 **길이 상한이 없는 문자열은 배지에 담지
// 않는다** — 출처 제목처럼 서버가 길이를 정하는 것은 `SourceList` 로 간다.
import type { ReactNode } from "react";

/** 레이아웃만 — 색은 아래 SHAPE·TONE 이 얹는다. `shrink-0 whitespace-nowrap` 은 두 변이 공통 계약(D16). */
const BASE = "inline-flex shrink-0 items-center rounded-pill px-2 py-0.5 text-xs font-bold whitespace-nowrap";
// ⚠️ 조건부로 조립하지 않고 완성된 리터럴을 그대로 고른다 — Tailwind 스캐너는 소스를 평문으로
// 읽어 런타임 조립을 찾지 못하고, 빌드는 성공한 채 스타일만 조용히 사라진다.
//
// 형태(계열)와 색(값)을 **다른 상수로 쪼개 둔다.** 형태는 변이가 정하고 색은 호출부가 정하므로,
// 한 문자열에 섞어 두면 색을 바꾸려는 호출부가 형태까지 함께 덮어야 한다.
const SHAPE = {
  fill: "",
  /** `bg-surface` 는 형태의 일부다 — 테두리 배지는 표면 위에 떠 있는 것이 아니라 표면과 같은 면이다. */
  outline: "border border-current bg-surface",
} as const;
const DEFAULT_TONE = {
  fill: "bg-primary-soft text-primary",
  /** 테두리 변이는 배경을 SHAPE 가 이미 정했으므로 글자색만 — 보더는 `border-current` 가 따라온다. */
  outline: "text-primary",
} as const;

export type BadgeVariant = keyof typeof SHAPE;

export interface BadgeProps {
  children: ReactNode;
  /** 색이 **아닌** 것만 — 여백·정렬·수치 표기 등. 색은 `tone` 으로 넘긴다(§머리말의 실측 참고). */
  className?: string;
  /** 기본 `fill`(채움). `outline`(테두리)은 같은 줄에 배지가 두 개 붙는 곳에서 **계열**을
      구분하는 축이다 — D17. */
  variant?: BadgeVariant;
  /** 변이의 기본색을 **치환**하는 완성된 색 클래스 리터럴(예: `"bg-category-venue-soft
      text-category-venue"`). 덮어쓰기가 아니라 치환이므로 경쟁하는 유틸리티가 생기지 않는다. */
  tone?: string;
  /** hover 시 전체 텍스트를 보여주는 표준 HTML title 속성 — 새 변이가 아니라 접근성 passthrough라
      컴포넌트 스펙과 무관하다. ⚠️ 이것을 **잘림의 해결책으로 쓰지 않는다** — 터치 기기에는 hover가
      없다(D16). 잘릴 만큼 긴 내용은 애초에 배지가 아니라 SourceList 로 간다. */
  title?: string;
}

export function Badge({ children, className, variant = "fill", tone, title }: BadgeProps) {
  // 빈 문자열도 "색을 안 줬다"로 본다 — 매핑에 없는 코드가 `""` 로 떨어지는 경로가 있다
  // (`category-badge.ts`). `??` 만 쓰면 그 경우 색이 통째로 사라진다.
  const classes = [BASE, SHAPE[variant], tone || DEFAULT_TONE[variant], className].filter(Boolean);
  return (
    <span className={classes.join(" ")} title={title}>
      {children}
    </span>
  );
}
