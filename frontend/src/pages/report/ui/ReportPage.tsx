// 세션 히스토리·리포트 화면 — 날짜별 세션 리스트 + 추이 차트 + 다음 연습 추천.
// 브리프코치_프로젝트_기획서_초안.md §4 화면 3. 비동기 리포트 워커 연동은 이번 단계 범위 밖.
import { Banner, Button } from "../../../shared/ui";

export interface ReportPageProps {
  onRestart: () => void;
}

export function ReportPage({ onRestart }: ReportPageProps) {
  return (
    <main className="page">
      <h1 className="page__title">세션 히스토리</h1>
      <Banner variant="info">추이 리포트는 세션이 쌓인 뒤 서버 연동 후 제공됩니다.</Banner>
      <Button onClick={onRestart}>새 연습 시작</Button>
    </main>
  );
}
