// 세션 리포트 화면 (§6.1) — 서버 판정 리포트(verdict 이력·정확도)는 M2 이후 연동. 지금은 로컬 요약만.
import { Banner, Button } from "../../../shared/ui";

export interface ReportPageProps {
  repCount: number;
  setIndex: number;
  onRestart: () => void;
}

export function ReportPage({ repCount, setIndex, onRestart }: ReportPageProps) {
  return (
    <main className="page">
      <h1 className="page__title">세션 리포트</h1>
      <div className="stat-row" aria-label="세션 결과">
        <div className="stat">
          <span className="stat__value">{repCount}</span>
          <span className="stat__label">총 렙</span>
        </div>
        <div className="stat">
          <span className="stat__value">{setIndex + 1}</span>
          <span className="stat__label">세트</span>
        </div>
        <div className="stat">
          <span className="stat__value">—</span>
          <span className="stat__label">정확도</span>
        </div>
      </div>
      <Banner variant="info">상세 판정 리포트는 서버 연동 후 제공됩니다.</Banner>
      <Button onClick={onRestart}>새 세션 시작</Button>
    </main>
  );
}
