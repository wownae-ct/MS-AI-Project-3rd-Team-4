// AI 산출물(F13) 신고 버튼 — 03_API_spec.md §7. 모달 없이 인라인으로 펼치는 이 저장소 관례
// (pages/category/ui/AddPaymentRow.tsx)를 따른다. 신고 후 상태 전이(관리자 검토)는 스코프 밖이라
// 접수 확인만 보여준다.
import { useState } from "react";
import { ApiError } from "@/shared/api";
import { createFeedbackReport } from "../api/feedback";
import type { FeedbackReasonCategory, FeedbackTargetType } from "../model";

const REASON_OPTIONS: FeedbackReasonCategory[] = ["부정확함", "부적절함", "도움안됨", "편향/차별적", "기타"];

interface ReportButtonProps {
  targetType: FeedbackTargetType;
  targetId: string;
}

export function ReportButton({ targetType, targetId }: ReportButtonProps) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<FeedbackReasonCategory>("부정확함");
  const [comment, setComment] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit() {
    setSubmitting(true);
    setError(null);
    try {
      await createFeedbackReport({
        target_type: targetType,
        target_id: targetId,
        reason_category: reason,
        comment: comment === "" ? undefined : comment,
      });
      setDone(true);
      setOpen(false);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "신고를 접수하지 못했습니다.");
    } finally {
      setSubmitting(false);
    }
  }

  if (done) {
    return <span className="text-xs text-ink-soft">신고 접수됐어요</span>;
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-xs text-ink-soft underline decoration-dotted enabled:hover:text-primary"
      >
        신고
      </button>
    );
  }

  return (
    <div className="flex flex-col gap-1.5 rounded-md border border-line bg-bg p-2">
      <select
        value={reason}
        onChange={(e) => setReason(e.target.value as FeedbackReasonCategory)}
        className="rounded-md border border-line bg-surface px-2 py-1 text-xs text-ink"
      >
        {REASON_OPTIONS.map((r) => (
          <option key={r} value={r}>
            {r}
          </option>
        ))}
      </select>
      <input
        type="text"
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        placeholder="추가 설명(선택)"
        className="rounded-md border border-line bg-surface px-2 py-1 text-xs text-ink"
      />
      {error && (
        <p role="alert" className="text-xs text-primary">
          {error}
        </p>
      )}
      <div className="flex gap-1.5">
        <button
          type="button"
          onClick={() => void handleSubmit()}
          disabled={submitting}
          className="rounded-md bg-primary px-2 py-1 text-xs font-bold text-surface disabled:opacity-50"
        >
          {submitting ? "접수 중…" : "신고하기"}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="rounded-md border border-line px-2 py-1 text-xs text-ink-soft"
        >
          취소
        </button>
      </div>
    </div>
  );
}
