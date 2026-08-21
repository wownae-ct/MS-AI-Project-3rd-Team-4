// 아이콘 — 인라인 SVG (외부 아이콘 CDN 금지 — self-hosting 원칙, shared/ui/README 방침).
// 색은 currentColor 로 상위 텍스트 색을 따른다. 장식용이므로 기본 aria-hidden —
// 의미를 전달해야 하는 자리라면 아이콘이 아니라 텍스트로 말한다.
//
// 세 개뿐인 이유: 화면 스펙이 아직 없다. 쓸 곳이 확정되지 않은 아이콘을 미리 만들지 않는다.
// 필요해지면 같은 파일에 추가한다. 20개를 넘어가면 lucide-react 도입을 재검토한다(ADR 0004).

// 최소로만 연다 — 쓰는 화면이 없다. size 와 className 뿐이고 aria-* 는 받지 않는다(장식용 고정).
// 의미를 전달하는 아이콘이 실제로 필요해지는 날, 그 아이콘만 별도 props 로 연다 (docs/design/inventory.md §7).
export interface IconProps {
  size?: number;
  /** 색·여백 보정용. 크기는 size 로 — className 의 w-/h- 가 width/height 속성과 싸우면 읽기 어렵다. */
  className?: string;
}

function base({ size, className }: IconProps) {
  return {
    width: size ?? 20,
    height: size ?? 20,
    className,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 2,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
  };
}

export function IconCheck(props: IconProps) {
  return (
    <svg {...base(props)}>
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

export function IconInfo(props: IconProps) {
  return (
    <svg {...base(props)}>
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="16" x2="12" y2="12" />
      <line x1="12" y1="8" x2="12.01" y2="8" />
    </svg>
  );
}

export function IconChevronDown(props: IconProps) {
  return (
    <svg {...base(props)}>
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}
