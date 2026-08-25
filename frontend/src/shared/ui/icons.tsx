// 아이콘 — 인라인 SVG (외부 아이콘 CDN 금지 — self-hosting 원칙, shared/ui/README 방침).
// 색은 currentColor 로 상위 텍스트 색을 따른다. 장식용이므로 기본 aria-hidden —
// 의미를 전달해야 하는 자리라면 아이콘이 아니라 텍스트로 말한다.
//
// 추가 규칙: 쓸 곳이 확정되지 않은 아이콘을 미리 만들지 않는다. 필요해지면 같은 파일에 추가한다.
// 20개를 넘어가면 lucide-react 도입을 재검토한다(ADR 0004).
// Home·Calendar·Wallet·Chart 는 하단 탭바 4개(홈·타임라인·예산·리포트)의 용처가 확정돼 추가했다
// (docs/design/layout.md §3). 아이콘만으로는 뜻이 전달되지 않으므로 **라벨을 항상 함께 표시한다** — NNG Icon Usability.

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

export function IconHome(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M3 10.5 12 3l9 7.5" />
      <path d="M5 9.5V21h14V9.5" />
    </svg>
  );
}

export function IconCalendar(props: IconProps) {
  return (
    <svg {...base(props)}>
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <line x1="3" y1="10" x2="21" y2="10" />
      <line x1="8" y1="3" x2="8" y2="7" />
      <line x1="16" y1="3" x2="16" y2="7" />
    </svg>
  );
}

export function IconWallet(props: IconProps) {
  return (
    <svg {...base(props)}>
      <rect x="3" y="6" width="18" height="13" rx="2" />
      <path d="M3 10h18" />
      <circle cx="17" cy="14.5" r="1.2" />
    </svg>
  );
}

export function IconChart(props: IconProps) {
  return (
    <svg {...base(props)}>
      <line x1="4" y1="20" x2="20" y2="20" />
      <rect x="6" y="12" width="3.5" height="6" />
      <rect x="12" y="8" width="3.5" height="10" />
    </svg>
  );
}

// 5번째 탭 "AI상담"(2026-08-24, 12_final_prototype_mockup.html의 탭바에만 있고 per-screen 목업
// 세트엔 없던 항목)이 생기며 용처가 확정돼 추가했다.
export function IconChat(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
    </svg>
  );
}

// 브랜드 마크(Google·Naver) — 위 아이콘들과 달리 currentColor 를 따르지 않는다. 로그인 버튼에
// 실제 제공자를 식별시키는 것이 유일한 용도라 공식 브랜드 색을 고정으로 쓴다. 이 색은 Tailwind
// 클래스(bg-[#hex] 류)가 아니라 SVG fill 속성 값이라 소스 규범 게이트(scripts/lib/source-norms.mjs
// 의 ARBITRARY_COLOR 는 `fill-[#...]` 토큰만 잡는다)에 걸리지 않는다 — 팔레트 밖 색 금지(D8)는
// 앱 자체의 accent 색 대상이지 로그인 버튼의 제3자 브랜드 마크를 막을 의도가 아니다.
export function IconGoogle({ size, className }: IconProps) {
  return (
    <svg width={size ?? 20} height={size ?? 20} className={className} viewBox="0 0 20 20" aria-hidden="true">
      <path fill="#4285F4" d="M19.6 10.23c0-.82-.1-1.42-.25-2.05H10v3.72h5.5c-.15.96-.74 2.31-2.04 3.22v2.45h3.16c1.89-1.73 2.98-4.3 2.98-7.34z" />
      <path fill="#34A853" d="M10 20c2.7 0 4.96-.89 6.62-2.42l-3.16-2.45c-.87.59-2.03.99-3.46.99-2.65 0-4.89-1.79-5.7-4.19H1.06v2.53C2.66 17.76 6.02 20 10 20z" />
      <path fill="#FBBC05" d="M4.3 11.93A5.98 5.98 0 0 1 4 10c0-.67.11-1.32.3-1.93V5.54H1.06A9.99 9.99 0 0 0 0 10c0 1.62.39 3.14 1.06 4.46l3.24-2.53z" />
      <path fill="#EA4335" d="M10 3.98c1.47 0 2.79.5 3.83 1.49l2.79-2.79C14.95.99 12.7 0 10 0 6.02 0 2.66 2.24 1.06 5.54l3.24 2.53C5.11 5.77 7.35 3.98 10 3.98z" />
    </svg>
  );
}

// 흰색 글자만 그린다 — 초록 사각 배경은 넣지 않는다. 버튼 자체가 네이버 브랜드 그린이라
// (LoginPage 의 네이버 버튼) 아이콘까지 배경을 가지면 박스 안에 박스가 되어 어색하다.
// 그린 배경이 없는 자리에 놓으면 흰 글자가 보이지 않는다 — 현재 유일한 용처(네이버 버튼) 전제.
export function IconNaver({ size, className }: IconProps) {
  return (
    <svg width={size ?? 20} height={size ?? 20} className={className} viewBox="0 0 20 20" aria-hidden="true">
      <path fill="#fff" d="M12.6 5v5.4L7.4 5H5v10h2.4v-5.4l5.2 5.4H15V5z" />
    </svg>
  );
}
