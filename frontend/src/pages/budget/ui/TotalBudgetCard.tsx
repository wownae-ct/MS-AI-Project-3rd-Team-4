// "남은예산" 총예산 인라인 편집 카드 — BudgetPage.tsx에서 뽑아냈다(oxlint max-lines 300줄 상한
// 초과, UpcomingPaymentsCard.tsx·WeddingDateCard.tsx와 같은 이유). `remaining`(남은예산)은
// 카테고리 배분 상태에 의존해 BudgetPage.tsx가 계산해 내려준다 — 이 카드는 그 계산을 모른다.
//
// 총예산 자체도 편집 가능하다 — `PATCH /weddings/me`가 `total_budget` 필드를 받고
// (03_API_spec.md #8), 그 문서 자체가 "사용 화면: S1(수정 시), S6"이라고 명시한다. 카테고리
// 재배분(PUT /wedding-categories)과는 완전히 별개의 액션이라 이 카드가 독립적으로 관리한다.
import { useState } from "react";
import { updateMyWedding } from "@/entities/wedding";
import { ApiError } from "@/shared/api";
import { manwonToWon, wonToManwon } from "@/shared/lib/money";
import { Card, Money } from "@/shared/ui";

const INLINE_INPUT =
  "w-28 rounded-md border border-line bg-surface px-2.5 py-1.5 text-right text-sm text-ink " +
  "[font-variant-numeric:tabular-nums] focus-visible:border-primary";
const GHOST_BUTTON = "text-xs font-bold text-ink-soft transition-colors duration-150 hover:text-primary";

export interface TotalBudgetCardProps {
  totalBudget: number;
  remaining: number;
  onSaved: (nextTotal: number) => void;
}

export function TotalBudgetCard({ totalBudget, remaining, onSaved }: TotalBudgetCardProps) {
  const [draft, setDraft] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  function startEdit() {
    setDraft(String(wonToManwon(totalBudget)));
    setSaveState("idle");
    setErrorMessage(null);
  }

  function cancelEdit() {
    setDraft(null);
    setSaveState("idle");
    setErrorMessage(null);
  }

  async function handleSave() {
    if (draft === null) return;
    const nextTotal = manwonToWon(Number(draft));
    setSaveState("saving");
    setErrorMessage(null);
    try {
      await updateMyWedding({ total_budget: nextTotal });
      onSaved(nextTotal);
      setDraft(null);
      setSaveState("idle");
    } catch (err) {
      setSaveState("error");
      setErrorMessage(err instanceof ApiError ? err.message : "총예산을 저장하지 못했어요. 다시 시도해 주세요.");
    }
  }

  return (
    <Card title="남은예산">
      <div className="flex items-baseline justify-between">
        <Money value={remaining} className="text-2xl" />
        {draft === null ? (
          <span className="flex items-center gap-2 text-xs text-ink-soft">
            총예산 {totalBudget.toLocaleString("ko-KR")}원 중
            <button type="button" onClick={startEdit} className={GHOST_BUTTON}>
              수정
            </button>
          </span>
        ) : (
          <span className="flex items-center gap-1.5">
            <input
              type="number"
              inputMode="numeric"
              min={0}
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              className={INLINE_INPUT}
              aria-label="총예산(만원)"
            />
            <span className="text-xs text-ink-soft">만원</span>
            <button type="button" onClick={() => void handleSave()} disabled={saveState === "saving"} className={GHOST_BUTTON}>
              {saveState === "saving" ? "저장 중…" : "저장"}
            </button>
            {/* 저장 진행 중엔 취소를 막는다 — 안 막으면 draft를 null로 되돌린 뒤에도 이미
                시작된 저장 함수가 클릭 시점 draft로 계속 진행해 성공 시 그 값을 되살린다
                (레드팀 감사 HIGH). */}
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
