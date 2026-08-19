// 즉시 피드백 화면 — 구조 점수 뱃지 + 코칭 코멘트 스트리밍 + 리라이트 예시 + 필러워드/wpm 요약.
// 브리프코치_프로젝트_기획서_초안.md §4 화면 2. SSE 연동은 이번 단계 범위 밖 — 스토어 값 표시만 배선.
import type { AnswerMetrics } from "../../../entities/answer";
import type { CoachFeedback } from "../../../entities/coach-feedback";
import { Banner, Button } from "../../../shared/ui";

export interface FeedbackPageProps {
  feedback: CoachFeedback | null;
  metrics: AnswerMetrics | null;
  onNext: () => void;
}

function ScoreBadge({ label, value }: { label: string; value: number }) {
  return (
    <div className="stat">
      <span className="stat__value">{Math.round(value * 100)}</span>
      <span className="stat__label">{label}</span>
    </div>
  );
}

export function FeedbackPage({ feedback, metrics, onNext }: FeedbackPageProps) {
  return (
    <main className="page">
      <h1 className="page__title">즉시 피드백</h1>

      {!feedback ? (
        <Banner variant="info">코칭 결과를 기다리는 중입니다 (서버 연동 전 임시 화면).</Banner>
      ) : (
        <>
          <div className="stat-row" aria-label="구조 점수">
            <ScoreBadge label="두괄식" value={feedback.structureScore.opening} />
            <ScoreBadge label="STAR" value={feedback.structureScore.star} />
            <ScoreBadge label="간결성" value={feedback.structureScore.conciseness} />
          </div>
          {feedback.guardrailVerdict === "degraded" && (
            <Banner variant="warning">근거검증에 실패해 일반 코멘트로 안내합니다.</Banner>
          )}
          <p className="page__subtitle">{feedback.feedbackText}</p>
          {feedback.rewriteExample && (
            <div className="card">
              <strong>리라이트 예시</strong>
              <p className="page__subtitle">{feedback.rewriteExample}</p>
            </div>
          )}
        </>
      )}

      {metrics && (
        <div className="stat-row" aria-label="음성 지표">
          <div className="stat">
            <span className="stat__value">{metrics.fillerWordCount}</span>
            <span className="stat__label">필러워드</span>
          </div>
          <div className="stat">
            <span className="stat__value">{Math.round(metrics.wpm)}</span>
            <span className="stat__label">wpm</span>
          </div>
        </div>
      )}

      <Button onClick={onNext}>세션 히스토리 보기</Button>
    </main>
  );
}
