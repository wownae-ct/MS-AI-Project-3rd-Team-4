// 공용 버튼.
//
// 변이를 정적 룩업 객체로 쓰는 이유 — Tailwind 는 소스를 평문으로 스캔한다.
// `btn--${variant}` 처럼 런타임에 조립한 클래스명은 찾지 못하고, 그 유틸리티는 생성되지 않는다.
// 빌드는 성공하고 화면만 무스타일이 된다 (ADR 0003 §결과). 전체 클래스 문자열이 소스에 그대로 있어야 한다.
//
// DESIGN.md 준수 사항
//   · 그림자 없음 — 표면 구분은 1px 헤어라인 보더로만 (The Flat-By-Default Rule)
//   · 베리 플럼은 primary 에만 — ghost 는 텍스트 색으로만 쓴다 (The One Accent Rule)
//   · hover 상태는 DESIGN.md 가 "열린 결정"으로 남겼다. 그림자 대신 보더/배경의 옅은 변화로 표현한다.
import type { ButtonHTMLAttributes, ReactNode } from "react";

export type ButtonVariant = "primary" | "secondary" | "ghost";

const VARIANT: Record<ButtonVariant, string> = {
  primary: "border-transparent bg-primary text-surface hover:brightness-110 active:brightness-95",
  secondary: "border-line bg-surface text-ink hover:border-ink-soft hover:bg-bg",
  // DESIGN.md components.button-ghost: 배경 투명 · 글자 primary · rounded sm · padding 5px 11px
  ghost: "border-transparent bg-transparent text-primary hover:bg-primary-soft",
};

const SHAPE: Record<ButtonVariant, string> = {
  primary: "rounded-md px-4",
  secondary: "rounded-md px-4",
  // 11px 는 DESIGN.md 가 명시한 값이라 4px 그리드를 벗어나더라도 그대로 옮긴다.
  // 세로 padding(5px)은 min-h-tap 이 대신한다 — ghost 는 배경이 투명이라 hit area 를 키워도 보이지 않는다.
  ghost: "rounded-sm px-[11px]",
};

const BASE =
  "inline-flex min-h-tap cursor-pointer items-center justify-center gap-2 border text-sm font-bold " +
  "transition-[background-color,border-color,filter] duration-150 " +
  "disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:brightness-100";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  /** 가로를 꽉 채운다. 모바일 주요 행동 버튼의 기본 형태. */
  block?: boolean;
  children: ReactNode;
}

export function Button({
  variant = "primary",
  block = false,
  children,
  className,
  type,
  ...rest
}: ButtonProps) {
  const classes = [BASE, VARIANT[variant], SHAPE[variant], block ? "w-full" : "", className]
    .filter(Boolean)
    .join(" ");
  return (
    <button type={type ?? "button"} className={classes} {...rest}>
      {children}
    </button>
  );
}
