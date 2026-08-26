// 대시보드 헤드라인(D-day + 결혼식 날짜 + 수정 버튼) — DashboardPage.tsx에서 뽑아냈다.
// `import/max-dependencies`(10) 상한 때문이다 — 날짜 수정 버튼(WeddingDateEdit)을 예산탭에서
// 대시보드로 옮기면서(2026-08-26, UX 개편 2차, 사용자 지시) DashboardPage.tsx의 임포트가
// 늘었고, formatDDay까지 여기로 함께 옮겨 하나로 묶었다.
import { formatDDay } from "@/shared/lib/format-d-day";
import { WeddingDateEdit } from "./WeddingDateEdit";

export interface WeddingHeadlineProps {
  dDay: number;
  /** 이미 사람이 읽는 형식으로 온다(adapt-summary.ts::adaptHeadline) — 여기서 다시 포맷하지 않는다. */
  dateLabel: string;
  /** WeddingDateEdit이 수정 폼 초기값으로 쓰는 raw ISO 날짜 — dateLabel과 출처(summary.wedding_date)는
      같지만 표시용/편집용으로 형태만 다르다. */
  weddingDate: string;
  onDateSaved: () => void;
}

export function WeddingHeadline({ dDay, dateLabel, weddingDate, onDateSaved }: WeddingHeadlineProps) {
  return (
    <div className="flex flex-col gap-0.5">
      <p className="text-4xl font-bold tracking-tight text-ink tabular-nums">{formatDDay(dDay)}</p>
      <div className="flex flex-wrap items-center gap-2 text-sm text-ink-soft">
        <span>{dateLabel} 결혼식</span>
        <WeddingDateEdit weddingDate={weddingDate} onSaved={onDateSaved} />
      </div>
    </div>
  );
}
