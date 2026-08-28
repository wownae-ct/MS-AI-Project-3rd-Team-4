// 로딩 모션 프리미티브 — 점 3개가 시차를 두고 흐려졌다 밝아진다. D14.
//
// **이 저장소의 로딩 모션은 이것 하나다.** 회전 스피너(spin 계열)는 도입하지 않는다 — 저장소
// 전체에 0건이었고, 이 표현이 이미 두 화면에서 검증됐다(온보딩 제출 오버레이 · AI 상담 타이핑
// 표시기). 모션 언어를 둘로 늘리면 "언제 어느 것을 쓰나"라는 규칙이 또 필요해진다.
//
// 원래 이 마크업은 GeneratingOverlay.tsx 와 TypingIndicator.tsx 에 **거의 같은 내용으로 중복**돼
// 있었다. 정의를 이리로 모은다.
//
// `animate-bounce`(탄성 이징)가 아니라 opacity 페이드인 이유는 TypingIndicator 가 이미 기록해
// 뒀다 — 디자인 훅이 "촌스럽다"고 지적해 2026-08-24 에 바꿨다.
//
// ⚠️ 바깥 요소가 `<div>` 가 아니라 `<span>` 이다(두 호출부의 기존 마크업에서 바뀌는 유일한 점).
// `Loading` 이 이 컴포넌트를 `<output>` 안에 넣는데, `<output>` 의 콘텐츠 모델이 phrasing content
// 라 `<div>` 를 넣으면 부적합한 HTML 이 된다. `flex` 는 display 를 직접 지정하므로 span 으로
// 바뀌어도 배치는 동일하다.
//
// ⚠️ 변이를 **두 가지로 못 박고 축을 나누지 않는다.** 톤(색)과 크기를 독립 prop 으로 열면 실제로
// 쓰지 않는 조합까지 클래스 리터럴로 소스에 남고, Tailwind 는 그것을 전부 산출 CSS 로 만든다.
// 초기 청크 예산 여유가 극히 적은 저장소라(scripts/check-bundle-budget.mjs) 쓰지 않는 유틸리티를
// 만들지 않는다. 세 번째 쓰임새가 실제로 생기면 그때 변이를 늘린다 — Badge.tsx 와 같은 원칙이다.

/**
 * `page` — 화면 단위 대기(전체화면 오버레이 · 라우트 전환). primary 톤, 큰 점.
 * `nested` — 다른 콘텐츠에 종속된 자리(말풍선 안). 보조 톤, 작은 점.
 *
 * ⚠️ **두 번째 값의 이름을 display 유틸리티와 같은 단어로 짓지 않는다.** Tailwind 는 소스를
 * 평문으로 훑으므로 문자열 리터럴 하나가 그대로 유틸리티가 된다 — 처음엔 이 자리에 그런 단어를
 * 썼다가 산출 CSS 에 display 규칙이 하나 생겨 유령 유틸리티 게이트
 * (scripts/lib/__tests__/ghost-candidates.test.mjs)가 잡았다. 그 게이트가 기록해 둔 선례
 * (RTL 렌더 루트를 구조 분해하다 만들어진 레이아웃 유틸리티)와 같은 종류다.
 *
 * 같은 이유로 **이 주석에도 그 단어들을 그대로 적지 않는다** — 스캐너는 주석과 코드를 구분하지
 * 않는다(GeneratingOverlay.tsx 가 같은 사고를 한 번 더 겪고 남긴 경고다).
 */
export type PulseDotsVariant = "page" | "nested";

// 전체 클래스 문자열이 소스에 그대로 있어야 한다 — 이름을 런타임에 조립하면 스캐너가 찾지 못하고
// **빌드는 성공한 채 스타일만 사라진다**(Button.tsx 머리말과 같은 사유).
const WRAP: Record<PulseDotsVariant, string> = {
  page: "flex items-center gap-1.5",
  nested:"flex items-center gap-1",
};

const DOT: Record<PulseDotsVariant, string> = {
  page: "size-2 animate-pulse rounded-pill bg-primary",
  nested:"size-1.5 animate-pulse rounded-pill bg-ink-soft",
};

export interface PulseDotsProps {
  variant?: PulseDotsVariant;
}

/**
 * 순수 장식이다 — `aria-*` 로 의미를 내지 않고 `aria-hidden` 으로 보조기기에서 아예 뺀다.
 *
 * "지금 무엇을 기다리는가"는 감싸는 쪽(`Loading` · `TypingIndicator`)이 텍스트로 낸다. 여기에
 * 별도 live region 을 두면 그 텍스트와 이중으로 announce 된다(TypingIndicator 가 `<output>`
 * 대신 `<div>` 를 쓰는 것과 같은 이유 — 접근성 감사 2026-08-26).
 *
 * ⚠️ `prefers-reduced-motion` 에서는 styles.css 의 전역 규칙이 애니메이션을 사실상 멈춘다.
 * 그 환경에서 이 컴포넌트는 아무것도 전달하지 못하므로 **호출부는 항상 텍스트를 함께 낸다.**
 */
export function PulseDots({ variant = "page" }: PulseDotsProps) {
  const dot = DOT[variant];
  return (
    <span className={WRAP[variant]} aria-hidden="true">
      {/* 시차는 임의값으로 준다 — 새 애니메이션 토큰을 만들지 않기 위해서다(D11 이 커스텀
          keyframe 을 기각한 것과 같은 사유). 음수 delay 는 애니메이션을 이미 진행된 지점에서
          시작시키므로 첫 프레임부터 세 점이 서로 다른 밝기를 갖는다. */}
      <span className={`${dot} [animation-delay:-0.3s]`} />
      <span className={`${dot} [animation-delay:-0.15s]`} />
      <span className={dot} />
    </span>
  );
}
