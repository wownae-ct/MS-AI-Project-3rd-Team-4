// 배지 — 컴포넌트 스펙 badge-focus 의 구현체 (docs/design/README.md 「컴포넌트 스펙」).
//   배경 primary-soft · 글자 primary · 모서리 rounded-pill
//
// 변이 prop 을 두지 않은 이유 — 규범이 정의한 배지는 이것 하나뿐이다.
// 다른 톤의 배지가 필요해지면 **docs/design/decisions.md 를 먼저 갱신하고** 여기로 옮긴다.
// 지금 없는 스타일을 여기서 지어내면 값의 출처가 갈린다.
import type { ReactNode } from "react";

const BASE = "inline-flex items-center rounded-pill bg-primary-soft px-2 py-0.5 text-xs font-bold text-primary";

export interface BadgeProps {
  children: ReactNode;
  className?: string;
  /** 텍스트를 truncate로 잘라내는 배지(예: 인용 출처)가 hover 시 전체 텍스트를 보여주기 위한
      표준 HTML title 속성 — 새 변이가 아니라 접근성 passthrough라 컴포넌트 스펙과 무관하다. */
  title?: string;
}

export function Badge({ children, className, title }: BadgeProps) {
  return (
    <span className={className ? `${BASE} ${className}` : BASE} title={title}>
      {children}
    </span>
  );
}
