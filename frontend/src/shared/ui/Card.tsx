// 표면 컨테이너.
//
// 「The Flat-By-Default Rule」(docs/design/README.md) — 그림자를 쓰지 않는다. 표면 구분은 1px 헤어라인 보더로만.
// 라운드는 현행 rounded-md(10px). D1 이 카드를 rounded-lg(16px)로 옮기기로 제안했다 — 적용 시 BASE 한 줄.
//
// @container 를 붙이는 이유: 카드 내부 반응형을 미디어 쿼리가 아니라 컨테이너 쿼리로 처리하려는 것.
// 같은 카드가 1컬럼에 놓이든 2컬럼에 놓이든 자기 폭만 보고 배치를 정하므로, 화면이 재배치돼도
// 카드 내부를 다시 손대지 않아도 된다.
import type { ReactNode } from "react";

const BASE = "@container rounded-md border border-line bg-surface p-4";

export interface CardProps {
  children: ReactNode;
  className?: string;
}

export function Card({ children, className }: CardProps) {
  return <div className={className ? `${BASE} ${className}` : BASE}>{children}</div>;
}
