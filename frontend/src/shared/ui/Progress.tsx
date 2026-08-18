// 진행률 UI — 「모델·오디오」: MODEL_LOAD_BUDGET 초과 시 진행률 표시 + 재시도 용처가 1순위.
export interface ProgressProps {
  /** 0~1. 미지정이면 불확정(indeterminate) 애니메이션 */
  value?: number;
  label: string;
}

export function Progress({ value, label }: ProgressProps) {
  const indeterminate = value === undefined;
  const clamped = indeterminate ? 0 : Math.min(1, Math.max(0, value));
  return (
    <div
      className={`progress${indeterminate ? " progress--indeterminate" : ""}`}
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      {...(indeterminate ? {} : { "aria-valuenow": Math.round(clamped * 100) })}
    >
      <div className="progress__fill" style={indeterminate ? undefined : { width: `${clamped * 100}%` }} />
    </div>
  );
}
