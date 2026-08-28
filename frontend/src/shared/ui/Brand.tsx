// 브랜드 마크 — 워드마크(로고타입)와 심볼 두 변이. 배치되는 5곳의 단일 출처다.
//
// ## 두 변이를 **함께 쓰지 않는다**
//
// 도착한 자산이 둘이다 — 심볼(하트를 가른 신부/신랑 + 맞물린 반지)과 워드마크("merrymap").
// 그런데 **워드마크가 이미 같은 모티프를 품고 있다**: `e` 자리에 반지 두 개가 맞물려 있고 `p` 의
// 볼이 하트를 넣은 지도 핀이다. 옆에 심볼을 또 세우면 하트 2개·반지 2쌍이 되어 작은 크기에서
// 뭉개진다. 그래서 **자리마다 하나만** 쓴다 — 브랜드 매뉴얼의 표준 분리 방식이다.
//
//   가로로 긴 자리(사이드바 · 모바일 상단 바 · 로그인 · 온보딩)  → **워드마크**. 이름까지 말한다
//   정사각/세로 자리(생성 오버레이)                              → **심볼**. 4.8:1 워드마크는 못 들어간다
//
// ## 파스텔 원색을 그대로 쓴다 — 규범의 예외다 (decisions.md D15)
//
// 두 마크 다 파스텔 핑크다. docs/design/README.md 의 The No-Pink-Cliché Rule
// (*"웨딩 = 밝은 핑크 + 세리프 + 그라디언트를 쓰지 않는다"*)·The One Accent Rule(베리 플럼 단독)과
// 정면으로 만나지만, **브랜드 마크는 그 규범의 대상이 아니다** — icons.tsx 의 IconGoogle/IconNaver 가
// 제3자 마크에 대해 이미 같은 선을 그어 뒀고(*"팔레트 밖 색 금지(D8)는 앱 자체의 accent 색 대상이지
// 브랜드 마크를 막을 의도가 아니다"*), 자사 마크에 그 예외를 적용하지 않을 이유가 없다.
//
// 억제는 색이 아니라 **크기**로 건다(D2 가 primary 면 채움을 면적으로 등급화한 것과 같은 논리) —
// 상시 노출되는 크롬은 26·22 로 두고, 큰 표현은 로그인 32 · 생성 오버레이 56 두 곳뿐이다.
// **마크 주변 타이포는 전부 ink/primary 그대로** 둔다 — 파스텔이 화면으로 번지지 않게 하는 실제 수단이다.
//
// ## 자산
//
// 워드마크는 `logos/logo-text-3.png`(2172×724)에서 **알파 bbox 로 크롭한 뒤 축소**한 것이다.
// 원본은 여백이 비대칭이라(L125 R121 T127 **B196**) 그대로 쓰면 글자가 광학적으로 위로 떠 보이고
// 높이를 지정해도 실제 글자 높이가 매번 달라진다. 크롭 후 실제 글자 영역은 1926×401 = **4.803:1**.
// 심볼은 `logo/merrymap-2B-symbol-256.png` 를 그대로 쓴다(1024×951, 정사각이 아니다).
//
// ⚠️ 둘 다 Vite 의 `assetsInlineLimit`(기본 4,096 B)보다 커서 **별도 파일로 나간다.** 이보다 작은
// 자산으로 바꾸면 base64 로 JS 에 인라인돼 **최대 단일 청크 예산에 그대로 잡힌다**(여유 53 B).
import symbolUrl from "@/shared/assets/merrymap-symbol-256.png";
import wordmarkUrl from "@/shared/assets/merrymap-wordmark-96.png";

export type BrandVariant = "wordmark" | "symbol";

/**
 * 변이별 원본 픽셀과 접근명.
 *
 * **둘 다 정사각이 아니다** — `width` 를 이 비율로 계산해 함께 내야 찌그러지지도, 이미지가 늦게
 * 도착했을 때 레이아웃이 밀리지도(CLS) 않는다.
 *
 * `alt` 가 변이마다 다른 이유:
 *   · 워드마크 — 이 마크가 **유일한 브랜드 표기**다(옆에 텍스트가 없다). 이름을 전달해야 한다.
 *     로고타입이 라틴 "merrymap" 이지만 접근명은 UI 전반이 쓰는 한국어 제품명으로 맞춘다.
 *   · 심볼 — 유일한 사용처인 생성 오버레이는 `<output aria-live>` 안에 안내 문구 2줄이 이미 있고
 *     로고는 그 위에 얹힌 장식이다. 브랜드명을 한 번 더 읽히려고 대기 안내를 밀어낼 이유가 없다
 *     (icons.tsx 의 *"텍스트 라벨과 함께 놓인 아이콘에는 접근명을 주지 않는다"* 와 같은 원칙).
 */
const VARIANTS = {
  wordmark: { src: wordmarkUrl, width: 461, height: 96, alt: "메리맵" },
  symbol: { src: symbolUrl, width: 1024, height: 951, alt: "" },
} as const satisfies Record<BrandVariant, { src: string; width: number; height: number; alt: string }>;

export interface BrandProps {
  /** 마크 높이(px). 워드마크는 **18 아래로, 심볼은 24 아래로 내리지 않는다** — 아래 주석 참고. */
  size?: number;
  /** 기본은 워드마크 — 실제 배치 5곳 중 4곳이 가로로 긴 자리다. */
  variant?: BrandVariant;
  className?: string;
}

// 최소 크기 — 벡터 원본이 없어서(PNG 만 도착했다) 렌더러가 보정할 여지가 없다. 크기를 지키는 것이
// 유일한 수단이다.
//   워드마크 18px — 그 아래로는 `e` 자리의 맞물린 반지와 `p` 의 하트 핀이 뭉개진다
//   심볼   24px — 얼굴 2개 + 볼터치 + 반지 겹침이 들어가 디테일 밀도가 더 높다
// SVG 원본이 생기면 둘 다 완화된다.

export function Brand({ size = 26, variant = "wordmark", className }: BrandProps) {
  const mark = VARIANTS[variant];
  return (
    <img
      src={mark.src}
      alt={mark.alt}
      width={Math.round((size * mark.width) / mark.height)}
      height={size}
      decoding="async"
      className={className === undefined ? "shrink-0" : `shrink-0 ${className}`}
    />
  );
}
