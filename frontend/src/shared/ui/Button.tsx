// 공용 버튼.
//
// 변이를 정적 룩업 객체로 쓰는 이유 — Tailwind 는 소스를 평문으로 스캔한다.
// `btn--${variant}` 처럼 런타임에 조립한 클래스명은 찾지 못하고, 그 유틸리티는 생성되지 않는다.
// 빌드는 성공하고 화면만 무스타일이 된다 (ADR 0003 §결과). 전체 클래스 문자열이 소스에 그대로 있어야 한다.
//
// 규범 준수 사항 (docs/design/README.md 「현행 규범 요약」 · 컴포넌트 스펙)
//   · 그림자 없음 — 표면 구분은 1px 헤어라인 보더로만 (The Flat-By-Default Rule)
//   · 베리 플럼은 primary 에만 — ghost 는 텍스트 색으로만 쓴다 (The One Accent Rule)
//   · hover 는 더 짙은 배경(primary-hover #77354F)으로 — D4. brightness 필터는 방향이 반대(밝아짐)였고
//     요소 전체(자식 포함)의 밝기를 조작하는 것이라 "배경의 옅은 변화" 규범과도 어긋났다.
//   · 모든 hover 는 `enabled:` 뒤에 둔다 — disabled 상태에서 hover 가 살아 있던 문제를 3변이 전부 같은 방식으로 막는다.
//     `disabled:hover:…` 로 되돌리는 상쇄 방식은 변이 정렬 순서에 의존해 취약하다.
import type { ButtonHTMLAttributes, ReactNode } from "react";

export type ButtonVariant = "primary" | "secondary" | "ghost";

const VARIANT: Record<ButtonVariant, string> = {
  primary: "border-transparent bg-primary text-surface enabled:hover:bg-primary-hover enabled:active:bg-primary-hover",
  secondary: "border-line bg-surface text-ink enabled:hover:border-ink-soft enabled:hover:bg-bg",
  // 컴포넌트 스펙 button-ghost: 배경 투명 · 글자 primary · 모서리 rounded-sm · padding 5px 11px
  ghost: "border-transparent bg-transparent text-primary enabled:hover:bg-primary-soft",
};

const SHAPE: Record<ButtonVariant, string> = {
  primary: "rounded-md px-4",
  secondary: "rounded-md px-4",
  // 11px 는 원 디자인 문서가 명시한 값이라 4px 그리드를 벗어나더라도 그대로 옮긴다.
  // 세로 padding(5px)은 min-h-tap 이 대신한다 — ghost 는 배경이 투명이라 hit area 를 키워도 보이지 않는다.
  ghost: "rounded-sm px-[11px]",
};

const BASE =
  "inline-flex min-h-tap cursor-pointer items-center justify-center gap-2 border text-sm font-bold " +
  "transition-[background-color,border-color] duration-150 " +
  "disabled:cursor-not-allowed disabled:opacity-50";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  /** 가로를 꽉 채운다. 모바일 주요 행동 버튼의 기본 형태. */
  block?: boolean;
  /**
   * 이 버튼이 시작한 작업이 진행 중이다 — D14 L1 계층.
   *
   * **지연 없이 즉시 반영한다.** 사용자가 방금 누른 컨트롤이라 즉각 확인이 필요하고,
   * 무엇보다 그 사이 두 번 눌리는 것을 막아야 한다(앰비언트 로딩인 `Loading` 이 200ms
   * 지연을 두는 것과 정반대 이유다 — D14 P2).
   *
   * 비활성화까지 함께 처리한다. `disabled` 를 따로 넘길 필요가 없다.
   */
  pending?: boolean;
  /**
   * 진행 중에 보여줄 라벨. 생략하면 `children` 을 그대로 둔다.
   *
   * D14 L1 문구 규칙 — `<동사 명사형> + 중…`, 주어 없음. 예: `저장 중…` `로그인 중…`
   */
  pendingLabel?: ReactNode;
  children: ReactNode;
}

export function Button({
  variant = "primary",
  block = false,
  pending = false,
  pendingLabel,
  children,
  className,
  type,
  disabled,
  ...rest
}: ButtonProps) {
  const classes = [BASE, VARIANT[variant], SHAPE[variant], block ? "w-full" : "", className]
    .filter(Boolean)
    .join(" ");
  return (
    <button
      type={type ?? "button"}
      className={classes}
      // 호출부가 넘긴 disabled 를 덮어쓰지 않고 OR 로 합친다 — "진행 중"과 "원래 못 누름"은
      // 서로 다른 이유이고, 둘 중 하나만 참이어도 막혀야 한다.
      disabled={disabled === true || pending}
      // 진행 중임을 보조기기에도 알린다. 라벨 교체만으로는 시각 사용자에게만 전달된다.
      aria-busy={pending || undefined}
      {...rest}
    >
      {pending && pendingLabel !== undefined ? pendingLabel : children}
    </button>
  );
}
