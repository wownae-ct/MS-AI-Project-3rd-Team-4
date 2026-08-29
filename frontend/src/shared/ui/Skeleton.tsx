// 콜드 로딩 자리표시 — 데이터가 오기 전에 **레이아웃을 먼저 잡는다.** D14 L2 계층.
//
// ## 왜 지연 없이 즉시 그리는가 (D14 P3)
//
// `Loading` 은 200ms 지연 뒤에 뜨지만 이쪽은 **즉시** 뜬다. 둘의 임무가 다르기 때문이다 —
// `Loading` 은 "기다리는 중"을 알리는 것이고, 스켈레톤은 **콘텐츠가 들어올 상자를 미리 차지**하는
// 것이다. 지연을 걸면 빈칸 → 스켈레톤 → 콘텐츠로 레이아웃 시프트가 두 번 난다.
// 응답이 아주 빨라 스켈레톤이 잠깐 스쳐도, 같은 상자가 채워지는 것이라 점프가 아니라 채움으로 읽힌다.
//
// ## 시각 — 새 값을 만들지 않는다
//
// 팔레트 안의 line 색 + 기본 pulse 애니메이션만 쓴다. 새 토큰 0개, 그림자·링 0개(D9·D10).
// ⚠️ **불투명도 모디파이어를 쓰지 않는다** — 팔레트 색의 반투명 표기는 D7 이 아직 「제안」 상태라
// 지금 쓰면 빌드 게이트가 잡는다(GeneratingOverlay.tsx 가 실제로 겪은 사고).
//
// ## 접근성
//
// 블록 자체는 장식이므로 `aria-hidden` 으로 완전히 뺀다. 행이 N개라고 N번 읽히면 안 된다 —
// "불러오는 중"이라는 announce 는 같은 영역의 `Loading` 이 **한 번만** 낸다.
//
// ## 변이는 실제로 필요해질 때만 늘린다
//
// 처음엔 "카드 안 목록 자리" 하나뿐이었고, 쓰지 않는 변이를 미리 만들면 그 클래스가 산출 CSS 에
// 들어가므로(초기 청크 예산 여유가 극히 적다) 늘리지 않기로 했다 — Badge.tsx 와 같은 원칙.
//
// **`variant="row"` 가 그 조건을 채운 첫 사례다**(D21, AI 재생성 중 부분 스켈레톤). 그 자리는
// 기존 `text` 변이로 대신할 수 없다: 재생성 중에는 **남는 항목과 스켈레톤이 같은 목록 안에
// 나란히** 서는데, 16px 짜리 글줄 자리표시가 56px 짜리 항목 행을 대신하면 목록이 눈에 띄게
// 쪼그라들었다가 결과 도착과 함께 다시 늘어난다 — 자리표시가 **자리를 안 잡는** 셈이라 존재
// 이유가 무너진다.

const WRAP = "flex flex-col gap-3";

// 행 높이는 본문 한 줄(text-sm, line-height 1.6 ≈ 22px)과 정확히 같지 않다. 자리표시의 목적은
// 픽셀 일치가 아니라 "여기에 목록이 온다"는 부피를 잡는 것이라 스케일 안의 값을 그대로 쓴다.
const ROW = "h-4 w-full animate-pulse rounded-sm bg-line";
// 마지막 행만 짧게 — 실제 텍스트 블록이 마지막 줄에서 짧아지는 모양을 흉내 낸다.
// 전부 같은 길이면 콘텐츠가 아니라 표처럼 보인다.
const ROW_LAST = "h-4 w-2/3 animate-pulse rounded-sm bg-line";
// 목록 행 한 줄 분량. 타임라인 행(체크박스 + 제목 + 메타 2줄)과 체크리스트 행이 대략 이 높이다.
// 마지막 행을 짧게 만들지 않는다 — 이쪽은 글줄이 아니라 **행**을 흉내 내는 것이라 길이가
// 들쭉날쭉하면 오히려 목록으로 안 읽힌다.
const LIST_ROW = "h-11 w-full animate-pulse rounded-sm bg-line";

export type SkeletonRowsVariant = "text" | "row";

export interface SkeletonRowsProps {
  /** 그릴 행 수. 실제로 올 항목 수를 대략 반영한다 — 많을수록 시프트가 줄지만 과하면 허풍이 된다. */
  count: number;
  /**
   * `text`(기본) — 글줄 자리표시. 카드가 통째로 비어 있는 콜드 로드에 쓴다.
   * `row` — 목록 **행** 자리표시. 남아 있는 실제 행과 나란히 설 때 쓴다(위 머리말 참고).
   */
  variant?: SkeletonRowsVariant;
}

export function SkeletonRows({ count, variant = "text" }: SkeletonRowsProps) {
  // 인덱스를 그대로 key 로 쓰지 않는다 — 목록이 재정렬되지 않아 안전하긴 하지만, 규범 검사에
  // 걸리지 않도록 안정적인 문자열 키를 만든다. 값 자체에는 의미가 없다.
  const rows = Array.from({ length: count }, (_, index) => `skeleton-row-${index}`);

  return (
    <span className={WRAP} aria-hidden="true">
      {rows.map((rowKey, index) => (
        <span key={rowKey} className={pickRowClass(variant, index === count - 1)} />
      ))}
    </span>
  );
}

/** 완성된 리터럴 중 하나를 고른다(런타임 조립 금지 — shared/ui/README 「코드 규약」). */
function pickRowClass(variant: SkeletonRowsVariant, isLast: boolean): string {
  if (variant === "row") return LIST_ROW;
  return isLast ? ROW_LAST : ROW;
}
