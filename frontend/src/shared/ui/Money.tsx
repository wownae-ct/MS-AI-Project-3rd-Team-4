// 금액 표시 — 규범 두 개를 한 컴포넌트가 강제한다.
//
//   제품 문서 : "모든 금액은 KRW 정수(콤마 구분, 소수점 없음)"
//   디자인 문서: "숫자(금액)는 항상 tabular-nums + 굵은 웨이트로 스캔하기 쉽게"
//
// 화면마다 toLocaleString 을 직접 부르면 자릿수 정렬과 반올림 규칙이 조용히 갈린다.
// 금액이 1급 데이터인 화면에서는 그 편차가 그대로 오해가 된다.
import type { ReactNode } from "react";

// 모듈 스코프에 한 번만 만든다 — Intl.NumberFormat 생성은 렌더마다 할 만큼 싸지 않다.
const KRW = new Intl.NumberFormat("ko-KR", { maximumFractionDigits: 0 });

export interface MoneyProps {
  /** 원 단위 정수. 소수가 들어와도 반올림해 정수로 표시한다. */
  value: number;
  /** 단위 표기. 표에서 헤더가 단위를 이미 말할 때는 null 로 끈다. */
  unit?: ReactNode;
  className?: string;
}

const BASE = "font-bold tabular-nums text-ink";

export function Money({ value, unit = "원", className }: MoneyProps) {
  return (
    <span className={className ? `${BASE} ${className}` : BASE}>
      {KRW.format(Math.round(value))}
      {unit}
    </span>
  );
}
