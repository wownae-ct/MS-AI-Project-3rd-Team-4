// 아이콘 — 인라인 SVG (외부 아이콘 CDN 금지 — self-hosting 원칙, shared/ui/README 방침).
// 색은 currentColor 로 상위 텍스트 색을 따른다. 장식용이므로 기본 aria-hidden —
// 의미를 전달해야 하는 자리라면 아이콘이 아니라 텍스트로 말한다.
//
// 세 개뿐인 이유: 화면 스펙이 아직 없다. 쓸 곳이 확정되지 않은 아이콘을 미리 만들지 않는다.
// 필요해지면 같은 파일에 추가한다. 20개를 넘어가면 lucide-react 도입을 재검토한다(ADR 0004).

interface IconProps {
  size?: number;
}

function base(size: number | undefined) {
  return {
    width: size ?? 20,
    height: size ?? 20,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 2,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
  };
}

export function IconCheck({ size }: IconProps) {
  return (
    <svg {...base(size)}>
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

export function IconInfo({ size }: IconProps) {
  return (
    <svg {...base(size)}>
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="16" x2="12" y2="12" />
      <line x1="12" y1="8" x2="12.01" y2="8" />
    </svg>
  );
}

export function IconChevronDown({ size }: IconProps) {
  return (
    <svg {...base(size)}>
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}
