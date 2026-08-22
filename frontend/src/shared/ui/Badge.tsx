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
}

export function Badge({ children, className }: BadgeProps) {
  return <span className={className ? `${BASE} ${className}` : BASE}>{children}</span>;
}
