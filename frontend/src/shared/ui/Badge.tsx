// 배지 — 컴포넌트 스펙 badge-focus 의 구현체 (docs/design/README.md 「컴포넌트 스펙」).
//   배경 primary-soft · 글자 primary · 모서리 rounded-pill
//
// 변이 prop 을 두지 않은 이유 — 규범이 정의한 배지는 이것 하나뿐이다.
// 다른 톤의 배지가 필요해지면 **docs/design/decisions.md 를 먼저 갱신하고** 여기로 옮긴다.
// 지금 없는 스타일을 여기서 지어내면 값의 출처가 갈린다.
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

const BASE =
  "inline-flex shrink-0 items-center rounded-pill bg-primary-soft px-2 py-0.5 text-xs font-bold whitespace-nowrap text-primary";

export interface BadgeProps {
  children: ReactNode;
  className?: string;
  /** hover 시 전체 텍스트를 보여주는 표준 HTML title 속성 — 새 변이가 아니라 접근성 passthrough라
      컴포넌트 스펙과 무관하다. ⚠️ 이것을 **잘림의 해결책으로 쓰지 않는다** — 터치 기기에는 hover가
      없다(D16). 잘릴 만큼 긴 내용은 애초에 배지가 아니라 SourceList 로 간다. */
  title?: string;
}

export function Badge({ children, className, title }: BadgeProps) {
  return (
    <span className={className ? `${BASE} ${className}` : BASE} title={title}>
      {children}
    </span>
  );
}
