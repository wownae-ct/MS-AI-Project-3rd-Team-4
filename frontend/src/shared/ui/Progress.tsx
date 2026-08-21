// 진행률 바 — DESIGN.md: 트랙은 {colors.line}, 채움은 {colors.primary}.
//
// Base UI 로 감싼 이유(ADR 0004): role="progressbar" 와 aria-valuemin/max/now 를 라이브러리가
// 값과 동기화해 설정한다. 우리 JSX 에 role 속성이 남지 않으므로 jsx-a11y/prefer-tag-over-role 도 걸리지 않는다.
import { Progress as BaseProgress } from "@base-ui/react/progress";

export interface ProgressProps {
  /** 0~1. 미지정이면 불확정(indeterminate) — 값 없이 "진행 중"만 알린다. */
  value?: number;
  /** 스크린리더가 읽는 이름. 무엇의 진행률인지 반드시 말한다. */
  label: string;
}

export function Progress({ value, label }: ProgressProps) {
  // Base UI 는 min~max(기본 0~100) 스케일을 쓴다. 외부 API 는 0~1 을 유지하고 여기서만 환산한다.
  const percent = value === undefined ? null : Math.round(Math.min(1, Math.max(0, value)) * 100);

  return (
    <BaseProgress.Root value={percent} aria-label={label} className="w-full">
      <BaseProgress.Track className="h-2 w-full overflow-hidden rounded-pill bg-line">
        <BaseProgress.Indicator className="h-full rounded-pill bg-primary transition-[width] duration-200" />
      </BaseProgress.Track>
    </BaseProgress.Root>
  );
}
