// "결혼식 날짜" 인라인 편집 카드 — BudgetPage.tsx에서 뽑아냈다(oxlint max-lines 300줄 상한 초과,
// UpcomingPaymentsCard.tsx와 같은 이유). 03_API_spec.md #8(PATCH /weddings/me)의 "사용 화면:
// S1(수정 시), S6"이 이 화면(S6)을 날짜 수정처로 명시한다 — 온보딩 이후에도 날짜를 바꿀 수
// 있어야 한다는 요구를 여기서 충족한다.
//
// 날짜를 직접 입력하는 행위는 항상 EXACT 확정을 의미한다 — 온보딩 1단계(Step1RoleDate.tsx)가
// 날짜 입력=EXACT로 두는 것과 같은 규칙. wedding_date_precision을 함께 보내는 이유도 그것이다
// — 서버는 EXACT가 아니면 보낸 날짜를 무시하고 근사 규칙으로 대체한다(03_API_spec.md #6 필드 표).
import { useState } from "react";
import { updateMyWedding } from "@/entities/wedding";
import { ApiError } from "@/shared/api";
import { Card } from "@/shared/ui";

const INLINE_DATE_INPUT = "w-40 rounded-md border border-line bg-surface px-2.5 py-1.5 text-sm text-ink focus-visible:border-primary";
const GHOST_BUTTON = "text-xs font-bold text-ink-soft transition-colors duration-150 hover:text-primary";

export interface WeddingDateCardProps {
  /** 온보딩에서 "미정"(NO_PLAN)을 골랐으면 서버가 대표 날짜조차 계산하지 않는다 —
      `pages/timeline/ui/group-by-phase.ts` 머리말과 같은 근거. */
  weddingDate: string | undefined;
  onSaved: (nextDate: string) => void;
}

export function WeddingDateCard({ weddingDate, onSaved }: WeddingDateCardProps) {
  const [draft, setDraft] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  function startEdit() {
    setDraft(weddingDate ?? "");
    setSaveState("idle");
    setErrorMessage(null);
  }

  function cancelEdit() {
    setDraft(null);
    setSaveState("idle");
    setErrorMessage(null);
  }

  async function handleSave() {
    if (draft === null || draft === "") return;
    const nextDate = draft;
    setSaveState("saving");
    setErrorMessage(null);
    try {
      await updateMyWedding({ wedding_date: nextDate, wedding_date_precision: "EXACT" });
      onSaved(nextDate);
      setDraft(null);
      setSaveState("idle");
    } catch (err) {
      setSaveState("error");
      setErrorMessage(err instanceof ApiError ? err.message : "결혼식 날짜를 저장하지 못했어요. 다시 시도해 주세요.");
    }
  }

  return (
    <Card title="결혼식 날짜">
      <div className="flex items-center justify-between">
        {draft === null ? (
          <span className="flex items-center gap-2 text-sm text-ink-soft">
            {weddingDate ?? "아직 정하지 않았어요"}
            <button type="button" onClick={startEdit} className={GHOST_BUTTON}>
              수정
            </button>
          </span>
        ) : (
          <span className="flex items-center gap-1.5">
            <input
              type="date"
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              className={INLINE_DATE_INPUT}
              aria-label="결혼식 날짜"
            />
            <button
              type="button"
              onClick={() => void handleSave()}
              disabled={saveState === "saving" || draft === ""}
              className={GHOST_BUTTON}
            >
              {saveState === "saving" ? "저장 중…" : "저장"}
            </button>
            {/* 저장 진행 중엔 취소를 막는다 — BudgetPage.tsx의 총예산 편집과 같은 이유
                (레드팀 감사 HIGH, 안 막으면 취소 후에도 진행 중이던 저장이 성공 시 되살아난다). */}
            <button type="button" onClick={cancelEdit} disabled={saveState === "saving"} className={GHOST_BUTTON}>
              취소
            </button>
          </span>
        )}
      </div>
      {saveState === "error" && (
        <p role="alert" className="mt-1.5 text-xs text-primary">
          {errorMessage}
        </p>
      )}
    </Card>
  );
}
