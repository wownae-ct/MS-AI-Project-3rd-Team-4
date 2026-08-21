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
        {/* 불확정일 때 폭을 반드시 지정해야 한다.
            Base UI 는 값이 없으면 인라인 width 를 **아예 설정하지 않는다**
            (progress/indicator/ProgressIndicator.mjs — `percentageValue == null ? {} : {…width}`).
            그 상태로 두면 블록 요소의 width:auto 가 트랙 100% 로 계산돼 **완료 상태와 똑같이 그려진다.**
            라이브러리는 소비자가 data-indeterminate 에 스타일을 얹는 것을 전제한다.
            확정 상태에서는 Base UI 의 인라인 width 가 이 클래스를 이긴다(인라인 > 클래스). */}
        <BaseProgress.Indicator
          className={
            "h-full rounded-pill bg-primary transition-[width] duration-200 " +
            "data-indeterminate:w-2/5 data-indeterminate:animate-pulse"
          }
        />
      </BaseProgress.Track>
    </BaseProgress.Root>
  );
}
